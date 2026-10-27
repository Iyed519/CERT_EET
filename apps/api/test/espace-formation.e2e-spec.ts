import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { ConfigurationAntiFraude } from '../src/database/entities/configuration-anti-fraude.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';

/**
 * Tests d'intégration US-INSC-04 — « Mon espace » d'une formation.
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - l'apprenant inscrit (EN_COURS) voit les modules triés, les seuls QCM
 *    PUBLIÉS avec SON avancement, jamais les questions ; même sur une
 *    formation fermée ;
 *  - refus tracés : non inscrit, inscription suspendue, formation inconnue
 *    (403 + ACCES_RESSOURCE_REFUSE) ;
 *  - 401, 403 formateur, 400 identifiant mal formé ;
 *  - l'avancement d'un QCM ne dépend que des tentatives de l'apprenant
 *    connecté.
 *
 * Aucune route ne crée encore de QCM ni de tentative (US-QCM-01, US-QCM-05) :
 * je les insère directement en base. Nettoyage rejouable (avant ET après),
 * dans l'ordre des clés étrangères RESTRICT : tentatives -> inscriptions ->
 * QCM -> formations (CASCADE modules) -> audit (bypass maintenance) ->
 * utilisateurs.
 */
describe('Mon espace dans une formation (e2e) — US-INSC-04', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (E2E-AFFECT, E2E-AUTH16,
  // E2E-DM, E2E-FORM01, E2E-INSC01, E2E-MODULES).
  const MARQUEUR = 'E2E-ESPACE';
  const EMAIL_APPRENANT = 'e2e-espace-appr@cert-eet.local';
  const EMAIL_AUTRE = 'e2e-espace-autre@cert-eet.local';
  const EMAIL_SUSPENDU = 'e2e-espace-susp@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-espace-form@cert-eet.local';
  const ALL_EMAILS = [EMAIL_APPRENANT, EMAIL_AUTRE, EMAIL_SUSPENDU, EMAIL_FORMATEUR];
  const UUID_INCONNU = '33333333-3333-4333-8333-333333333333';

  let apprenantId: string;
  let tokenApprenant: string;
  let tokenAutre: string;
  let tokenSuspendu: string;
  let tokenFormateur: string;
  let formationId: string;
  let autreFormationId: string;
  let qcmPublieId: string;
  let ouvertureIntro: Date;
  let fermetureIntro: Date;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const espace = (id: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(`/api/formations/${id}/mon-espace`)
      .set('Authorization', `Bearer ${token}`);

  const refus = (cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action: 'ACCES_RESSOURCE_REFUSE', cible } });

  const purgeAudit = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        ids,
      ]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  };

  const nettoyer = async (): Promise<void> => {
    const formations = await dataSource.getRepository(Formation).find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);
    const formationIds = formations.map((f) => f.id);

    if (utilisateurIds.length > 0) {
      await dataSource.getRepository(TentativeQcm).delete({ apprenantId: In(utilisateurIds) });
      await dataSource.getRepository(Inscription).delete({ apprenantId: In(utilisateurIds) });
    }
    await dataSource.getRepository(Qcm).delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formationIds, ...utilisateurIds, UUID_INCONNU]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [apprenant, autre, suspendu] = await userRepository.save(
      [
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
        { email: EMAIL_AUTRE, role: Role.APPRENANT },
        { email: EMAIL_SUSPENDU, role: Role.APPRENANT },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    apprenantId = apprenant.id;
    tokenApprenant = await login(EMAIL_APPRENANT);
    tokenAutre = await login(EMAIL_AUTRE);
    tokenSuspendu = await login(EMAIL_SUSPENDU);
    tokenFormateur = await login(EMAIL_FORMATEUR);

    // Formation FERMÉE : ses inscrits gardent l'accès au contenu.
    const formationRepo = dataSource.getRepository(Formation);
    const formation = await formationRepo.save(
      formationRepo.create({
        titre: `${MARQUEUR} DevOps`,
        statut: StatutFormation.FERMEE,
        capaciteMax: 10,
        noteMinCertification: 70,
        dateFin: '2026-12-18',
      }),
    );
    formationId = formation.id;
    const autreFormation = await formationRepo.save(
      formationRepo.create({
        titre: `${MARQUEUR} Sécurité`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 10,
        noteMinCertification: 70,
      }),
    );
    autreFormationId = autreFormation.id;

    // Modules créés dans le désordre : l'API doit les renvoyer triés.
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const [docker, intro] = await moduleRepo.save([
      moduleRepo.create({ formationId, titre: 'Docker', ordre: 2 }),
      moduleRepo.create({ formationId, titre: 'Introduction', ordre: 1 }),
      moduleRepo.create({ formationId, titre: 'Bilan', ordre: 3 }),
    ]);

    const qcmRepo = dataSource.getRepository(Qcm);
    const [publie] = await qcmRepo.save([
      qcmRepo.create({
        moduleId: intro.id,
        titre: `${MARQUEUR} Quiz intro`,
        statut: StatutQcm.PUBLIE,
      }),
      qcmRepo.create({
        moduleId: intro.id,
        titre: `${MARQUEUR} Brouillon`,
        statut: StatutQcm.BROUILLON,
      }),
      qcmRepo.create({
        moduleId: docker.id,
        titre: `${MARQUEUR} Quiz Docker`,
        statut: StatutQcm.PUBLIE,
      }),
      qcmRepo.create({
        moduleId: docker.id,
        titre: `${MARQUEUR} Non publié`,
        statut: StatutQcm.NON_PUBLIE,
      }),
    ]);
    qcmPublieId = publie.id;

    // Le quiz d'intro a une fenêtre en cours (US-QCM-04) : ouverte hier,
    // fermée dans 10 jours. Le quiz Docker n'a pas de configuration.
    const configRepo = dataSource.getRepository(ConfigurationAntiFraude);
    ouvertureIntro = new Date(Date.now() - 86_400_000);
    fermetureIntro = new Date(Date.now() + 10 * 86_400_000);
    await configRepo.save(
      configRepo.create({
        qcmId: publie.id,
        dureeMaxMinutes: 30,
        dateOuverture: ouvertureIntro,
        dateFermeture: fermetureIntro,
        affichageResultats: AffichageResultats.DIFFERE,
        scoreMinValidation: 60,
        ponderationFormation: 30,
      }),
    );

    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save([
      inscriptionRepo.create({ apprenantId, formationId, dateEcheance: '2026-12-18' }),
      inscriptionRepo.create({ apprenantId: autre.id, formationId }),
      inscriptionRepo.create({
        apprenantId: suspendu.id,
        formationId,
        statut: StatutInscription.SUSPENDUE,
      }),
    ]);

    // L'apprenant a réussi le quiz d'intro ; l'AUTRE apprenant n'a rien fait.
    const tentativeRepo = dataSource.getRepository(TentativeQcm);
    await tentativeRepo.save(
      tentativeRepo.create({
        apprenantId,
        qcmId: qcmPublieId,
        dateLimite: new Date(Date.now() + 3_600_000),
        statut: StatutTentative.NOTEE,
        score: 85,
        estReussie: true,
      }),
    );
  });

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  it('200 : modules triés, QCM publiés seulement, avec mon avancement, sans les questions', async () => {
    const res = await espace(formationId, tokenApprenant).expect(200);

    expect(res.body.formation).toMatchObject({ id: formationId, statut: StatutFormation.FERMEE });
    expect(res.body.inscription).toMatchObject({
      statut: StatutInscription.EN_COURS,
      dateEcheance: '2026-12-18',
      tauxAvancement: 0,
    });
    expect(
      res.body.modules.map((m: { titre: string; avancement: string }) => [m.titre, m.avancement]),
    ).toEqual([
      ['Introduction', 'COMPLETE'],
      ['Docker', 'A_FAIRE'],
      ['Bilan', 'SANS_EVALUATION'],
    ]);
    expect(res.body.modules[0].qcms).toEqual([
      {
        id: qcmPublieId,
        titre: `${MARQUEUR} Quiz intro`,
        description: null,
        avancement: 'REUSSI',
        dateOuverture: ouvertureIntro.toISOString(),
        dateFermeture: fermetureIntro.toISOString(),
        fenetre: 'OUVERTE',
        // US-QCM-05 : ce qu'il faut savoir avant de démarrer.
        dureeMaxMinutes: 30,
        nbTentativesMax: 1,
        nbTentativesPassees: 1,
        tentativeEnCoursId: null,
      },
    ]);
    expect(res.body.modules[1].qcms.map((q: { titre: string }) => q.titre)).toEqual([
      `${MARQUEUR} Quiz Docker`,
    ]);
    expect(res.body.modules[1].qcms[0]).toMatchObject({
      fenetre: null,
      dateOuverture: null,
      dureeMaxMinutes: null,
      nbTentativesMax: null,
    });
    // Aucune trace de questions, d'options ou de configuration anti-fraude
    // (seuls la fenêtre, la durée et le nombre de tentatives sortent).
    expect(JSON.stringify(res.body)).not.toMatch(/question|option|configuration/i);
  });

  it('l’avancement est personnel : un autre inscrit voit le quiz d’intro « à faire »', async () => {
    const res = await espace(formationId, tokenAutre).expect(200);

    expect(res.body.modules[0]).toMatchObject({ avancement: 'A_FAIRE' });
    expect(res.body.modules[0].qcms[0]).toMatchObject({ avancement: 'A_FAIRE' });
  });

  it('403 « suspendue » pour une inscription suspendue, refus tracé', async () => {
    const res = await espace(formationId, tokenSuspendu).expect(403);
    expect(res.body.message).toBe(
      'Votre inscription à cette formation est suspendue : contactez un administrateur.',
    );

    const traces = await refus(formationId);
    expect(
      traces.some(
        (t) => (t.detailsAvantApres as { motif?: string }).motif === 'INSCRIPTION_SUSPENDUE',
      ),
    ).toBe(true);
  });

  it('403 pour une formation où je ne suis pas inscrit, refus tracé', async () => {
    const res = await espace(autreFormationId, tokenApprenant).expect(403);
    expect(res.body.message).toBe('Vous n’êtes pas inscrit à cette formation.');

    const traces = await refus(autreFormationId);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ userId: apprenantId, resultat: 'Échec' });
    expect(traces[0].detailsAvantApres).toMatchObject({
      ressource: 'inscription',
      motif: 'NON_INSCRIT',
      methode: 'GET',
    });
  });

  it('formation inconnue : le même 403, son inexistence n’est pas révélée', async () => {
    const res = await espace(UUID_INCONNU, tokenApprenant).expect(403);
    expect(res.body.message).toBe('Vous n’êtes pas inscrit à cette formation.');
    expect(await refus(UUID_INCONNU)).toHaveLength(1);
  });

  it('401 sans jeton ; 403 pour un formateur ; 400 pour un identifiant mal formé', async () => {
    await request(app.getHttpServer()).get(`/api/formations/${formationId}/mon-espace`).expect(401);
    await espace(formationId, tokenFormateur).expect(403);
    await espace('pas-un-uuid', tokenApprenant).expect(400);
  });
});
