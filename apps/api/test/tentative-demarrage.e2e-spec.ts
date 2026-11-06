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
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';

/**
 * Tests d'intégration US-QCM-05 — Démarrer une tentative (contrôle serveur).
 *
 * Couvre, sur l'application réelle et la vraie base :
 *  - accès : 401, 403 formateur, 400 identifiant, 404 QCM inconnu ou
 *    brouillon ; 403 non inscrit / suspendu / terminé, tracés ;
 *  - 201 : tentative EN_COURS, échéance = début + durée (horloge de la base),
 *    plafonnée à la fermeture ; audit TENTATIVE_DEMARREE ;
 *  - 200 : reprise de la tentative EN_COURS (rechargement), sans doublon ;
 *  - « Mon espace » : durée, tentatives et tentative à reprendre ;
 *    GET /tentatives/:id réservé à son apprenant (404 sinon) ;
 *  - 409 avec motif : pas encore ouvert, fermé, tentatives épuisées, délai
 *    non respecté (avec date de réouverture) ; refus tracés ;
 *  - tentative EN_COURS expirée : clôturée ABANDONNEE_TIMER, puis nouvelle ;
 *  - rafale : 5 démarrages qui se chevauchent -> UNE seule tentative.
 *
 * Les QCM, configurations et tentatives « passées » sont insérés directement
 * en base. Nettoyage rejouable (avant ET après), dans l'ordre des clés
 * RESTRICT : tentatives -> inscriptions -> QCM (CASCADE configuration) ->
 * formations (CASCADE modules) -> audit (bypass maintenance) -> comptes.
 */
describe('Démarrer une tentative (e2e) — US-QCM-05', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let tentativeRepository: Repository<TentativeQcm>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-ESPACE, E2E-QCM01,
  // E2E-QCMCONF, E2E-QCMPUB).
  const MARQUEUR = 'E2E-TENTDEM';
  const EMAIL_APPRENANT = 'e2e-tentdem-appr@cert-eet.local';
  const EMAIL_RAFALE = 'e2e-tentdem-rafale@cert-eet.local';
  const EMAIL_NON_INSCRIT = 'e2e-tentdem-noninscrit@cert-eet.local';
  const EMAIL_SUSPENDU = 'e2e-tentdem-susp@cert-eet.local';
  const EMAIL_TERMINE = 'e2e-tentdem-term@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-tentdem-form@cert-eet.local';
  const ALL_EMAILS = [
    EMAIL_APPRENANT,
    EMAIL_RAFALE,
    EMAIL_NON_INSCRIT,
    EMAIL_SUSPENDU,
    EMAIL_TERMINE,
    EMAIL_FORMATEUR,
  ];
  const UUID_INCONNU = '55555555-5555-4555-8555-555555555555';
  const H = 3_600_000;
  const MINUTE = 60_000;

  let apprenantId: string;
  let rafaleId: string;
  let formationId: string;
  const tokens: Record<string, string> = {};
  const qcm: Record<string, string> = {};
  let fermetureCourte: Date;
  let finPrecedenteDelai: Date;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const demarrer = (qcmId: string, token: string): request.Test =>
    request(app.getHttpServer())
      .post(`/api/qcm/${qcmId}/tentatives`)
      .set('Authorization', `Bearer ${token}`);

  const audits = (action: string, userId: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, userId }, order: { horodatage: 'ASC' } });

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
    tentativeRepository = moduleRef.get<Repository<TentativeQcm>>(getRepositoryToken(TentativeQcm));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const comptes = await userRepository.save(
      [
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
        { email: EMAIL_RAFALE, role: Role.APPRENANT },
        { email: EMAIL_NON_INSCRIT, role: Role.APPRENANT },
        { email: EMAIL_SUSPENDU, role: Role.APPRENANT },
        { email: EMAIL_TERMINE, role: Role.APPRENANT },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    const [apprenant, rafale, , suspendu, termine] = comptes;
    apprenantId = apprenant.id;
    rafaleId = rafale.id;
    for (const email of ALL_EMAILS) {
      tokens[email] = await login(email);
    }

    const formation = await dataSource.getRepository(Formation).save(
      dataSource.getRepository(Formation).create({
        titre: `${MARQUEUR} Kubernetes`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 70,
      }),
    );
    formationId = formation.id;
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save(
        dataSource.getRepository(ModuleFormation).create({ formationId, titre: 'Pods', ordre: 1 }),
      );

    // Un QCM par scénario : chacun sa fenêtre et ses limites.
    const maintenant = Date.now();
    fermetureCourte = new Date(maintenant + 10 * MINUTE);
    const scenarios: Array<{
      cle: string;
      statut?: StatutQcm;
      config?: Partial<ConfigurationAntiFraude>;
    }> = [
      { cle: 'ouvert', config: { nbTentativesMax: 2 } },
      { cle: 'brouillon', statut: StatutQcm.BROUILLON },
      {
        cle: 'aVenir',
        config: {
          dateOuverture: new Date(maintenant + 2 * 24 * H),
          dateFermeture: new Date(maintenant + 3 * 24 * H),
        },
      },
      {
        cle: 'ferme',
        config: {
          dateOuverture: new Date(maintenant - 3 * 24 * H),
          dateFermeture: new Date(maintenant - 24 * H),
        },
      },
      { cle: 'epuise', config: { nbTentativesMax: 1 } },
      { cle: 'delai', config: { nbTentativesMax: 3, delaiEntreTentatives: 24 } },
      { cle: 'expire', config: { nbTentativesMax: 3 } },
      { cle: 'court', config: { dateFermeture: fermetureCourte } },
      { cle: 'rafale', config: { nbTentativesMax: 1 } },
    ];
    const qcmRepo = dataSource.getRepository(Qcm);
    const configRepo = dataSource.getRepository(ConfigurationAntiFraude);
    for (const s of scenarios) {
      const cree = await qcmRepo.save(
        qcmRepo.create({
          moduleId: module.id,
          titre: `${MARQUEUR} ${s.cle}`,
          statut: s.statut ?? StatutQcm.PUBLIE,
        }),
      );
      qcm[s.cle] = cree.id;
      await configRepo.save(
        configRepo.create({
          qcmId: cree.id,
          dureeMaxMinutes: 30,
          dateOuverture: new Date(maintenant - 24 * H),
          dateFermeture: new Date(maintenant + 10 * 24 * H),
          nbTentativesMax: 2,
          delaiEntreTentatives: 0,
          affichageResultats: AffichageResultats.DIFFERE,
          scoreMinValidation: 60,
          ponderationFormation: 10,
          ...s.config,
        }),
      );
    }

    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save([
      inscriptionRepo.create({ apprenantId, formationId }),
      inscriptionRepo.create({ apprenantId: rafaleId, formationId }),
      inscriptionRepo.create({
        apprenantId: suspendu.id,
        formationId,
        statut: StatutInscription.SUSPENDUE,
      }),
      inscriptionRepo.create({
        apprenantId: termine.id,
        formationId,
        statut: StatutInscription.TERMINEE,
      }),
    ]);

    // Historique « passé » de l'apprenant : une tentative notée sur « épuisé »
    // et sur « délai » (finie il y a 1 h), une EN_COURS expirée sur « expiré ».
    finPrecedenteDelai = new Date(maintenant - H);
    await tentativeRepository.save([
      tentativeRepository.create({
        apprenantId,
        qcmId: qcm.epuise,
        dateLimite: new Date(maintenant - 23 * H),
        dateFin: new Date(maintenant - 23 * H),
        statut: StatutTentative.NOTEE,
        score: 40,
        estReussie: false,
      }),
      tentativeRepository.create({
        apprenantId,
        qcmId: qcm.delai,
        dateLimite: finPrecedenteDelai,
        dateFin: finPrecedenteDelai,
        statut: StatutTentative.NOTEE,
        score: 40,
        estReussie: false,
      }),
      tentativeRepository.create({
        apprenantId,
        qcmId: qcm.expire,
        dateLimite: new Date(maintenant - 5 * MINUTE),
        statut: StatutTentative.EN_COURS,
      }),
    ]);
    // `date_debut` est posée par la base (now()) : je recule celle de la
    // tentative expirée pour qu'elle précède son échéance.
    await dataSource.query(
      `UPDATE tentatives_qcm SET date_debut = date_limite - interval '30 minutes'
        WHERE apprenant_id = $1 AND qcm_id = $2`,
      [apprenantId, qcm.expire],
    );
  });

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('accès', () => {
    it('401 sans jeton ; 403 formateur ; 400 identifiant mal formé', async () => {
      await request(app.getHttpServer()).post(`/api/qcm/${qcm.ouvert}/tentatives`).expect(401);
      await demarrer(qcm.ouvert, tokens[EMAIL_FORMATEUR]).expect(403);
      await demarrer('pas-un-uuid', tokens[EMAIL_APPRENANT]).expect(400);
    });

    it('404 pour un QCM inconnu ou en brouillon : son existence n’est pas révélée', async () => {
      for (const id of [UUID_INCONNU, qcm.brouillon]) {
        const res = await demarrer(id, tokens[EMAIL_APPRENANT]).expect(404);
        expect(res.body.message).toBe('QCM introuvable.');
      }
    });

    it.each([
      [EMAIL_NON_INSCRIT, 'NON_INSCRIT', 'Vous n’êtes pas inscrit à cette formation.'],
      [
        EMAIL_SUSPENDU,
        'INSCRIPTION_SUSPENDUE',
        'Votre inscription à cette formation est suspendue : contactez un administrateur.',
      ],
      [
        EMAIL_TERMINE,
        'INSCRIPTION_TERMINEE',
        'Votre formation est terminée : vous ne pouvez plus démarrer d’évaluation.',
      ],
    ])('403 pour %s (%s), refus tracé, aucune tentative', async (email, motif, message) => {
      const res = await demarrer(qcm.ouvert, tokens[email]).expect(403);
      expect(res.body.message).toBe(message);

      const compte = await userRepository.findOneByOrFail({ email });
      const traces = await audits('ACCES_RESSOURCE_REFUSE', compte.id);
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({ cible: formationId, resultat: 'Échec' });
      expect(traces[0].detailsAvantApres).toMatchObject({
        ressource: 'inscription',
        motif,
        methode: 'POST',
      });
      expect(await tentativeRepository.countBy({ apprenantId: compte.id })).toBe(0);
    });
  });

  describe('création et reprise', () => {
    let tentativeId: string;

    it('201 : tentative EN_COURS, échéance = début + durée, audit TENTATIVE_DEMARREE', async () => {
      const res = await demarrer(qcm.ouvert, tokens[EMAIL_APPRENANT]).expect(201);

      expect(res.body).toMatchObject({
        qcmId: qcm.ouvert,
        statut: StatutTentative.EN_COURS,
        dureeMaxMinutes: 30,
        numero: 1,
        nbTentativesMax: 2,
        tentativesRestantes: 1,
        reprise: false,
      });
      const debut = new Date(res.body.dateDebut).getTime();
      expect(new Date(res.body.dateLimite).getTime() - debut).toBe(30 * MINUTE);
      expect(Math.abs(debut - Date.now())).toBeLessThan(MINUTE);
      tentativeId = res.body.id as string;

      // La base contient exactement ce que l'API a renvoyé.
      const enBase = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(enBase).toMatchObject({ apprenantId, statut: StatutTentative.EN_COURS });
      expect(enBase.dateDebut.toISOString()).toBe(res.body.dateDebut);
      expect(enBase.dateLimite.toISOString()).toBe(res.body.dateLimite);

      const traces = await audits('TENTATIVE_DEMARREE', apprenantId);
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({ cible: tentativeId, resultat: 'Succès' });
      expect(traces[0].detailsAvantApres).toMatchObject({ qcmId: qcm.ouvert, numero: 1 });
    });

    it('200 : un second démarrage reprend la même tentative, sans doublon ni nouvel audit', async () => {
      const res = await demarrer(qcm.ouvert, tokens[EMAIL_APPRENANT]).expect(200);

      expect(res.body).toMatchObject({ id: tentativeId, reprise: true, numero: 1 });
      expect(await tentativeRepository.countBy({ apprenantId, qcmId: qcm.ouvert })).toBe(1);
      expect(await audits('TENTATIVE_DEMARREE', apprenantId)).toHaveLength(1);
    });

    it('« Mon espace » affiche ce QCM « en cours », avec la tentative à reprendre', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/formations/${formationId}/mon-espace`)
        .set('Authorization', `Bearer ${tokens[EMAIL_APPRENANT]}`)
        .expect(200);
      const quiz = (res.body.modules[0].qcms as Array<Record<string, unknown>>).find(
        (q) => q.id === qcm.ouvert,
      );
      expect(quiz).toMatchObject({
        avancement: 'EN_COURS',
        dureeMaxMinutes: 30,
        nbTentativesMax: 2,
        nbTentativesPassees: 1,
        tentativeEnCoursId: tentativeId,
      });
    });

    it('GET /tentatives/:id : ma tentative, son rang et l’heure du serveur', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tentatives/${tentativeId}`)
        .set('Authorization', `Bearer ${tokens[EMAIL_APPRENANT]}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: tentativeId,
        qcmId: qcm.ouvert,
        qcmTitre: `${MARQUEUR} ouvert`,
        formationId,
        statut: StatutTentative.EN_COURS,
        dureeMaxMinutes: 30,
        numero: 1,
        nbTentativesMax: 2,
        tentativesRestantes: 1,
        dateFin: null,
      });
      expect(Math.abs(new Date(res.body.maintenant).getTime() - Date.now())).toBeLessThan(MINUTE);
      // QCM sans question dans cette suite : tirage vide ; jamais de bonne
      // réponse (non-fuite complète : tentative-tirage.e2e-spec.ts, US-QCM-06).
      expect(res.body).toMatchObject({ nbQuestions: 0, questions: [] });
      expect(JSON.stringify(res.body)).not.toMatch(/estCorrecte|est_correcte|explication/i);
    });

    it('GET /tentatives/:id : 404 pour la tentative d’un autre ou inconnue ; 403 formateur ; 400', async () => {
      const get = (id: string, token: string): request.Test =>
        request(app.getHttpServer())
          .get(`/api/tentatives/${id}`)
          .set('Authorization', `Bearer ${token}`);

      const autre = await get(tentativeId, tokens[EMAIL_RAFALE]).expect(404);
      expect(autre.body.message).toBe('Tentative introuvable.');
      await get(UUID_INCONNU, tokens[EMAIL_APPRENANT]).expect(404);
      await get(tentativeId, tokens[EMAIL_FORMATEUR]).expect(403);
      await get('pas-un-uuid', tokens[EMAIL_APPRENANT]).expect(400);
    });

    it('échéance plafonnée à la fermeture quand la fenêtre se termine avant la durée', async () => {
      const res = await demarrer(qcm.court, tokens[EMAIL_APPRENANT]).expect(201);
      expect(res.body.dateLimite).toBe(fermetureCourte.toISOString());
    });
  });

  describe('409 — refus avec motif précis', () => {
    it('pas encore ouvert : hors_fenetre avec la date d’ouverture', async () => {
      const res = await demarrer(qcm.aVenir, tokens[EMAIL_APPRENANT]).expect(409);
      const config = await dataSource
        .getRepository(ConfigurationAntiFraude)
        .findOneByOrFail({ qcmId: qcm.aVenir });
      expect(res.body).toMatchObject({
        message: 'Ce QCM n’est pas encore ouvert.',
        raison: 'hors_fenetre',
        dateReouverture: config.dateOuverture.toISOString(),
      });
    });

    it('fermé : hors_fenetre sans réouverture', async () => {
      const res = await demarrer(qcm.ferme, tokens[EMAIL_APPRENANT]).expect(409);
      expect(res.body).toMatchObject({
        message: 'Ce QCM est fermé : sa fenêtre d’ouverture est passée.',
        raison: 'hors_fenetre',
        dateReouverture: null,
      });
    });

    it('tentatives épuisées (la tentative notée compte)', async () => {
      const res = await demarrer(qcm.epuise, tokens[EMAIL_APPRENANT]).expect(409);
      expect(res.body).toMatchObject({
        message: 'Vous avez utilisé votre tentative autorisée pour ce QCM.',
        raison: 'tentatives_epuisees',
        dateReouverture: null,
      });
    });

    it('délai non respecté : réouverture = fin de la précédente + 24 h', async () => {
      const res = await demarrer(qcm.delai, tokens[EMAIL_APPRENANT]).expect(409);
      expect(res.body).toMatchObject({
        message: 'Un délai de 24 h est imposé entre deux tentatives.',
        raison: 'delai_non_respecte',
      });
      expect(new Date(res.body.dateReouverture).getTime()).toBe(
        finPrecedenteDelai.getTime() + 24 * H,
      );
    });

    it('chaque refus est tracé TENTATIVE_DEMARREE (Échec), cible = le QCM ; aucune tentative créée', async () => {
      const echecs = (await audits('TENTATIVE_DEMARREE', apprenantId)).filter(
        (t) => t.resultat === 'Échec',
      );
      expect(
        echecs.map((t) => [t.cible, (t.detailsAvantApres as { raison: string }).raison]),
      ).toEqual([
        [qcm.aVenir, 'hors_fenetre'],
        [qcm.ferme, 'hors_fenetre'],
        [qcm.epuise, 'tentatives_epuisees'],
        [qcm.delai, 'delai_non_respecte'],
      ]);
      expect(
        await tentativeRepository.countBy({
          apprenantId,
          qcmId: In([qcm.aVenir, qcm.ferme]),
        }),
      ).toBe(0);
      expect(await tentativeRepository.countBy({ apprenantId, qcmId: qcm.epuise })).toBe(1);
      expect(await tentativeRepository.countBy({ apprenantId, qcmId: qcm.delai })).toBe(1);
    });
  });

  it('tentative EN_COURS expirée : clôturée ABANDONNEE_TIMER à son échéance, puis une nouvelle', async () => {
    const res = await demarrer(qcm.expire, tokens[EMAIL_APPRENANT]).expect(201);
    expect(res.body).toMatchObject({ numero: 2, reprise: false, tentativesRestantes: 1 });

    const tentatives = await tentativeRepository.find({
      where: { apprenantId, qcmId: qcm.expire },
      order: { dateDebut: 'ASC' },
    });
    // Clôturée ABANDONNEE_TIMER à son échéance, puis notée (US-QCM-08).
    expect(tentatives.map((t) => t.statut)).toEqual([
      StatutTentative.NOTEE,
      StatutTentative.EN_COURS,
    ]);
    expect(tentatives[0].dateFin?.toISOString()).toBe(tentatives[0].dateLimite.toISOString());
    expect(tentatives[0].dureeEffective).toBe(1800);

    const traces = await audits('TENTATIVE_EXPIREE', apprenantId);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ cible: tentatives[0].id, resultat: 'Succès' });
  });

  it('rafale : 5 démarrages qui se chevauchent créent UNE seule tentative (1 × 201, 4 × 200)', async () => {
    // Pour que les 5 requêtes se chevauchent VRAIMENT (sinon elles passent
    // l'une après l'autre et le test ne prouve rien), je bloque les INSERT
    // sur la table des tentatives pendant 1 s : SHARE ROW EXCLUSIVE laisse
    // passer les lectures, pas les écritures. Les 5 requêtes franchissent
    // leurs contrôles, puis attendent ensemble au moment de créer.
    // Vérifié : sans le verrou de l'inscription ET sans la traduction du
    // 23505, ce test échoue (4 × 500) ; l'une des deux protections suffit.
    const bloqueur = dataSource.createQueryRunner();
    await bloqueur.connect();
    await bloqueur.startTransaction();
    let reponses: request.Response[];
    try {
      await bloqueur.query('LOCK TABLE tentatives_qcm IN SHARE ROW EXCLUSIVE MODE');
      const enVol = Promise.all(
        Array.from({ length: 5 }, () => demarrer(qcm.rafale, tokens[EMAIL_RAFALE]).then((r) => r)),
      );
      await new Promise((fin) => setTimeout(fin, 1000));
      await bloqueur.commitTransaction();
      reponses = await enVol;
    } finally {
      if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
      await bloqueur.release();
    }

    const statuts = reponses.map((r) => r.status).sort();
    expect(statuts).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(reponses.map((r) => r.body.id)).size).toBe(1);
    expect(await tentativeRepository.countBy({ apprenantId: rafaleId, qcmId: qcm.rafale })).toBe(1);
    expect(
      (await audits('TENTATIVE_DEMARREE', rafaleId)).filter((t) => t.resultat === 'Succès'),
    ).toHaveLength(1);
  });
});
