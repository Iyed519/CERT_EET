import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { Atelier } from '../src/database/entities/atelier.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Grille } from '../src/database/entities/grille.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutAtelier } from '../src/database/enums/statut-atelier.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';

/**
 * Tests d'intégration US-ATEL-03 — Publier l'atelier (DS-13 partie 3, UC3
 * Formateur) et le rendre visible aux apprenants inscrits.
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - publication nominale (grille validée, date limite future) : PUBLIE,
 *    audit ATELIER_PUBLIE ; atelier et grille figés ensuite (409) ;
 *  - critère d'erreur du Backlog : grille absente ou non validée -> 409 ;
 *    date limite passée (horloge PostgreSQL) -> 400 ; déjà publié -> 409 ;
 *    formation archivée -> 409 ; 403 / 404 / 400 ;
 *  - côté apprenant : « Mon espace » liste les SEULS ateliers publiés, sans
 *    énoncé ; `GET /mes-ateliers/:id` donne la fiche et la grille ; brouillon
 *    ou inconnu -> 404 ; non inscrit / suspendu -> 403 tracé ;
 *  - concurrence (chevauchement FORCÉ) : une modification de critère et une
 *    publication simultanées passent l'une après l'autre — la publication ne
 *    voit jamais une grille validée qui ne l'est plus.
 *
 * Nettoyage rejouable (avant ET après), ordre RESTRICT : inscriptions ->
 * ateliers (CASCADE grilles) -> formations (CASCADE modules, affectations)
 * -> audit (bypass maintenance) -> utilisateurs.
 */
describe('Publication d’un atelier (e2e) — US-ATEL-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe
  // (E2E-AFFECT, E2E-ATEL01, E2E-AUTH16, E2E-CORRIGE, E2E-DM, E2E-ESPACE,
  // E2E-FORM01, E2E-GRILLE, E2E-INSC01, E2E-MODULES, E2E-NOTATION, E2E-QCM01,
  // E2E-QCMCONF, E2E-QCMPUB, E2E-REPONSE, E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-ATELPUB';
  const EMAIL_ADMIN = 'e2e-atelpub-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-atelpub-form1@cert-eet.local';
  const EMAIL_AUTRE_FORMATEUR = 'e2e-atelpub-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-atelpub-appr@cert-eet.local';
  const EMAIL_NON_INSCRIT = 'e2e-atelpub-libre@cert-eet.local';
  const EMAIL_SUSPENDU = 'e2e-atelpub-susp@cert-eet.local';
  const ALL_EMAILS = [
    EMAIL_ADMIN,
    EMAIL_FORMATEUR,
    EMAIL_AUTRE_FORMATEUR,
    EMAIL_APPRENANT,
    EMAIL_NON_INSCRIT,
    EMAIL_SUSPENDU,
  ];
  const UUID_INCONNU = '77777777-7777-4777-8777-777777777777';

  let tokenFormateur: string;
  let tokenAutre: string;
  let tokenApprenant: string;
  let tokenNonInscrit: string;
  let tokenSuspendu: string;
  let apprenantId: string;
  let nonInscritId: string;
  let formationId: string;
  let moduleId: string;
  let dansUnMois: string;
  // Ateliers : P publiable, S sans grille, N grille non validée, D date passée,
  // C concurrence, A formation archivée.
  const at: Record<'P' | 'S' | 'N' | 'D' | 'C' | 'A', string> = {
    P: '',
    S: '',
    N: '',
    D: '',
    C: '',
    A: '',
  };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'patch' | 'put' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const publier = (id: string, token = tokenFormateur): request.Test =>
    api('patch', `/ateliers/${id}/publier`, token);

  const creerAtelier = async (titre: string): Promise<string> => {
    const res = await api('post', `/modules/${moduleId}/ateliers`, tokenFormateur)
      .send({
        titre: `${MARQUEUR} ${titre}`,
        enonce: 'Implémentez une API REST NestJS protégée par JWT, avec ses tests.',
        competencesVisees: 'NestJS, JWT',
        dateLimite: dansUnMois,
        typesLivrables: ['zip', 'pdf'],
        nbMaxFichiers: 2,
        toleranceRetardHeures: 12,
      })
      .expect(201);
    return res.body.id as string;
  };

  /** Grille Fonctionnement 60 + Tests 40, validée si demandé. */
  const grilleComplete = async (id: string, valider: boolean): Promise<void> => {
    await api('post', `/ateliers/${id}/grille/criteres`, tokenFormateur)
      .send({ intitule: 'Fonctionnement', ponderation: 60 })
      .expect(201);
    await api('post', `/ateliers/${id}/grille/criteres`, tokenFormateur)
      .send({ intitule: 'Tests', ponderation: 40 })
      .expect(201);
    if (valider) {
      await api('post', `/ateliers/${id}/grille/valider`, tokenFormateur).expect(200);
    }
  };

  const statut = async (id: string): Promise<StatutAtelier> =>
    (await atelierRepository.findOneOrFail({ where: { id }, select: { id: true, statut: true } }))
      .statut;

  const traces = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

  const purgeAudit = async (cibles: string[]): Promise<void> => {
    if (cibles.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        cibles,
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
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    const ateliers =
      formationIds.length === 0
        ? []
        : await atelierRepository.find({
            where: { module: { formationId: In(formationIds) } },
            relations: { module: true },
            select: { id: true, module: { id: true } },
          });

    if (formationIds.length > 0) {
      await dataSource.getRepository(Inscription).delete({ formationId: In(formationIds) });
    }
    if (ateliers.length > 0) {
      await atelierRepository.delete({ id: In(ateliers.map((a) => a.id)) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formationIds, ...ateliers.map((a) => a.id), ...utilisateurIds]);
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
    atelierRepository = moduleRef.get<Repository<Atelier>>(getRepositoryToken(Atelier));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();

    const [dates] = (await dataSource.query(
      `SELECT (now() + interval '30 days') AS futur`,
    )) as Array<{ futur: Date }>;
    dansUnMois = new Date(dates.futur).toISOString();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, formateur, , apprenant, nonInscrit, suspendu] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_AUTRE_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
        { email: EMAIL_NON_INSCRIT, role: Role.APPRENANT },
        { email: EMAIL_SUSPENDU, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    apprenantId = apprenant.id;
    nonInscritId = nonInscrit.id;
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenAutre = await login(EMAIL_AUTRE_FORMATEUR);
    tokenApprenant = await login(EMAIL_APPRENANT);
    tokenNonInscrit = await login(EMAIL_NON_INSCRIT);
    tokenSuspendu = await login(EMAIL_SUSPENDU);

    const formationRepo = dataSource.getRepository(Formation);
    const [ouverte, archivee] = await formationRepo.save(
      [
        { titre: `${MARQUEUR} Back-end`, statut: StatutFormation.OUVERTE },
        { titre: `${MARQUEUR} Ancienne`, statut: StatutFormation.ARCHIVEE },
      ].map((f) => formationRepo.create({ ...f, capaciteMax: 10, noteMinCertification: 60 })),
    );
    formationId = ouverte.id;
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const [module, moduleArchive] = await moduleRepo.save([
      moduleRepo.create({ formationId: ouverte.id, titre: 'API REST', ordre: 1 }),
      moduleRepo.create({ formationId: archivee.id, titre: 'Ancien', ordre: 1 }),
    ]);
    moduleId = module.id;

    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      [ouverte.id, archivee.id].map((id) =>
        affectationRepo.create({
          formationId: id,
          formateurId: formateur.id,
          affectePar: admin.id,
        }),
      ),
    );

    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save([
      inscriptionRepo.create({ apprenantId, formationId }),
      inscriptionRepo.create({
        apprenantId: suspendu.id,
        formationId,
        statut: StatutInscription.SUSPENDUE,
      }),
    ]);

    at.P = await creerAtelier('Projet API');
    at.S = await creerAtelier('Sans grille');
    at.N = await creerAtelier('Grille incomplète');
    at.D = await creerAtelier('Date passée');
    at.C = await creerAtelier('Course');
    await grilleComplete(at.P, true);
    await grilleComplete(at.D, true);
    await grilleComplete(at.C, true);
    await api('post', `/ateliers/${at.N}/grille/criteres`, tokenFormateur)
      .send({ intitule: 'Fonctionnement', ponderation: 60 })
      .expect(201);
    // Le temps a passé depuis la création : je recule la date limite en base
    // (l'API refuse une date passée), par rapport à l'horloge de PostgreSQL.
    await dataSource.query(
      `UPDATE ateliers SET date_limite = now() - interval '1 hour' WHERE id = $1`,
      [at.D],
    );
    // Un atelier dans une formation archivée ne se crée plus par l'API.
    const archive = await atelierRepository.save(
      atelierRepository.create({
        moduleId: moduleArchive.id,
        formateurId: formateur.id,
        titre: `${MARQUEUR} Archivé`,
        enonce: 'Atelier d’une formation archivée.',
        dateLimite: new Date(dansUnMois),
        typesLivrables: ['zip'],
        statut: StatutAtelier.BROUILLON,
      }),
    );
    at.A = archive.id;
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Avant la publication
  // ===================================================================

  describe('Avant la publication', () => {
    it('un brouillon est invisible : absent de « Mon espace », 404 sur sa fiche', async () => {
      const res = await api('get', `/formations/${formationId}/mon-espace`, tokenApprenant).expect(
        200,
      );
      expect(res.body.modules[0].ateliers).toEqual([]);
      const fiche = await api('get', `/mes-ateliers/${at.P}`, tokenApprenant).expect(404);
      expect(fiche.body.message).toBe('Atelier introuvable.');
    });
  });

  // ===================================================================
  //  Refus
  // ===================================================================

  describe('Refus de publication', () => {
    it('409 sans grille et avec une grille non validée, message explicite, rien n’est écrit', async () => {
      for (const id of [at.S, at.N]) {
        const res = await publier(id).expect(409);
        expect(res.body.message).toBe(
          'Validez la grille de notation d’abord : la publication exige une grille validée (total de 100 %).',
        );
        expect(await statut(id)).toBe(StatutAtelier.BROUILLON);
        expect(await traces('ATELIER_PUBLIE', id)).toHaveLength(0);
      }
    });

    it('400 si la date limite est passée selon PostgreSQL', async () => {
      const res = await publier(at.D).expect(400);
      expect(res.body.message).toBe(
        'La date limite de cet atelier est déjà passée : repoussez-la avant de le publier.',
      );
      expect(await statut(at.D)).toBe(StatutAtelier.BROUILLON);
    });

    it('409 dans une formation archivée', async () => {
      await publier(at.A).expect(409);
      expect(await statut(at.A)).toBe(StatutAtelier.BROUILLON);
    });

    it('403 formateur non affecté et apprenant ; 404 inconnu ; 400 identifiant mal formé', async () => {
      await publier(at.P, tokenAutre).expect(403);
      await publier(at.P, tokenApprenant).expect(403);
      await publier(UUID_INCONNU).expect(404);
      await api('patch', '/ateliers/pas-un-uuid/publier', tokenFormateur).expect(400);
      expect(await statut(at.P)).toBe(StatutAtelier.BROUILLON);
    });
  });

  // ===================================================================
  //  Publication nominale
  // ===================================================================

  describe('Publication nominale', () => {
    it('200 : PUBLIE, tracé ATELIER_PUBLIE avec la grille', async () => {
      const res = await publier(at.P).expect(200);
      expect(res.body).toMatchObject({ id: at.P, statut: 'PUBLIE', formationId });

      const [trace] = await traces('ATELIER_PUBLIE', at.P);
      expect(trace).toBeDefined();
      const grille = await dataSource.getRepository(Grille).findOneByOrFail({ atelierId: at.P });
      expect(trace.detailsAvantApres).toMatchObject({
        statut: { avant: 'BROUILLON', apres: 'PUBLIE' },
        formationId,
        moduleId,
        grilleId: grille.id,
        nbCriteres: 2,
      });
    });

    it('409 pour une deuxième publication', async () => {
      const res = await publier(at.P).expect(409);
      expect(res.body.message).toBe('Cet atelier est déjà publié.');
      expect(await traces('ATELIER_PUBLIE', at.P)).toHaveLength(1);
    });

    it('publié : atelier et grille figés (409), la grille se lit en lecture seule', async () => {
      await api('patch', `/ateliers/${at.P}`, tokenFormateur)
        .send({ titre: `${MARQUEUR} Nouveau titre` })
        .expect(409);
      await api('delete', `/ateliers/${at.P}`, tokenFormateur).expect(409);
      await api('post', `/ateliers/${at.P}/grille/criteres`, tokenFormateur)
        .send({ intitule: 'Bonus', ponderation: 1 })
        .expect(409);
      const g = await api('get', `/ateliers/${at.P}/grille`, tokenFormateur).expect(200);
      expect(g.body).toMatchObject({ statutAtelier: 'PUBLIE', modifiable: false, validee: true });
    });
  });

  // ===================================================================
  //  Côté apprenant
  // ===================================================================

  describe('Côté apprenant', () => {
    it('« Mon espace » liste l’atelier publié (et lui seul), sans énoncé, dépôt OUVERT', async () => {
      const res = await api('get', `/formations/${formationId}/mon-espace`, tokenApprenant).expect(
        200,
      );
      const ateliers = res.body.modules[0].ateliers;
      expect(ateliers).toEqual([
        {
          id: at.P,
          titre: `${MARQUEUR} Projet API`,
          dateLimite: expect.any(String),
          toleranceRetardHeures: 12,
          typesLivrables: ['pdf', 'zip'],
          etatDepot: 'OUVERT',
          statutMonLivrable: null,
          nouveauFeedback: false,
        },
      ]);
    });

    it('200 : fiche de l’atelier avec énoncé, modalités et grille (100 %)', async () => {
      const res = await api('get', `/mes-ateliers/${at.P}`, tokenApprenant).expect(200);
      expect(res.body).toMatchObject({
        id: at.P,
        formationId,
        formationTitre: `${MARQUEUR} Back-end`,
        moduleTitre: 'API REST',
        enonce: 'Implémentez une API REST NestJS protégée par JWT, avec ses tests.',
        competencesVisees: 'NestJS, JWT',
        typesLivrables: ['pdf', 'zip'],
        nbMaxFichiers: 2,
        tailleMaxMo: 20,
        toleranceRetardHeures: 12,
        etatDepot: 'OUVERT',
        grille: { totalPonderations: 100 },
      });
      expect(
        res.body.grille.criteres.map((c: { intitule: string; ponderation: number }) => [
          c.intitule,
          c.ponderation,
        ]),
      ).toEqual([
        ['Fonctionnement', 60],
        ['Tests', 40],
      ]);
      expect(
        res.body.grille.criteres[0].niveaux.map((n: { libelle: string }) => n.libelle),
      ).toEqual(['Insuffisant', 'Acceptable', 'Bon', 'Excellent']);
      // Liste blanche : ni formateur, ni statut interne, ni horodatages.
      for (const champ of ['formateurId', 'statut', 'createdAt', 'updatedAt']) {
        expect(res.body).not.toHaveProperty(champ);
      }
    });

    it('404 pour un brouillon (même avec une grille validée) et pour un identifiant inconnu', async () => {
      await api('get', `/mes-ateliers/${at.C}`, tokenApprenant).expect(404);
      await api('get', `/mes-ateliers/${UUID_INCONNU}`, tokenApprenant).expect(404);
      await api('get', '/mes-ateliers/pas-un-uuid', tokenApprenant).expect(400);
    });

    it('403 tracé pour un apprenant non inscrit ; 403 « suspendue » ; 403 pour un formateur', async () => {
      const refus = await api('get', `/mes-ateliers/${at.P}`, tokenNonInscrit).expect(403);
      expect(refus.body.message).toBe('Vous n’êtes pas inscrit à cette formation.');
      const [trace] = await auditLogRepository.find({
        where: { action: 'ACCES_RESSOURCE_REFUSE', cible: formationId, userId: nonInscritId },
      });
      expect(trace?.detailsAvantApres).toMatchObject({
        ressource: 'inscription',
        motif: 'NON_INSCRIT',
      });

      const susp = await api('get', `/mes-ateliers/${at.P}`, tokenSuspendu).expect(403);
      expect(susp.body.message).toBe(
        'Votre inscription à cette formation est suspendue : contactez un administrateur.',
      );
      await api('get', `/mes-ateliers/${at.P}`, tokenFormateur).expect(403);
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
    it('modification de critère puis publication simultanées : la publication voit la grille dévalidée (409)', async () => {
      const g = await api('get', `/ateliers/${at.C}/grille`, tokenFormateur).expect(200);
      expect(g.body.validee).toBe(true);
      const critereId = g.body.criteres[1].id as string;

      // Je tiens le verrou de LA LIGNE de l'atelier : les deux requêtes
      // attendent ce verrou, et PostgreSQL le leur accorde dans l'ordre
      // d'arrivée (file d'attente du verrou de ligne). Un verrou de TABLE ne
      // suffit pas : libérées ensemble, elles se disputeraient la ligne.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let critere: request.Response;
      let publication: request.Response;
      try {
        await bloqueur.query('SELECT id FROM ateliers WHERE id = $1 FOR UPDATE', [at.C]);
        const premier = api(
          'patch',
          `/ateliers/${at.C}/grille/criteres/${critereId}`,
          tokenFormateur,
        )
          .send({ ponderation: 30 })
          .then((r) => r);
        await new Promise((fin) => setTimeout(fin, 300));
        const second = publier(at.C).then((r) => r);
        await new Promise((fin) => setTimeout(fin, 700));
        await bloqueur.commitTransaction();
        [critere, publication] = await Promise.all([premier, second]);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }

      expect(critere.status).toBe(200);
      expect(critere.body.validee).toBe(false);
      expect(publication.status).toBe(409);
      expect(await statut(at.C)).toBe(StatutAtelier.BROUILLON);
      expect(await traces('ATELIER_PUBLIE', at.C)).toHaveLength(0);
    }, 30_000);
  });
});
