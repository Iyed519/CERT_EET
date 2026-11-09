import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
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
import { Inscription } from '../src/database/entities/inscription.entity';
import { Livrable } from '../src/database/entities/livrable.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';
import { EligibiliteService } from '../src/modules/certificats/eligibilite.service';

/**
 * Tests d'intégration US-ATEL-09 — Déclencher la certification (DS-03 ->
 * DS-04, AC-03), sur l'application réelle : vrais PostgreSQL, Redis (file et
 * worker des certificats) et S3.
 *
 * Formation au seuil de 60 %, un QCM publié et un atelier publié (critères
 * 60 % / 40 %). Les tentatives de QCM notées sont écrites en SQL (la notation
 * elle-même est éprouvée par les suites QCM ; son branchement ici, par les
 * tests unitaires). Couvre :
 *  - finaliser la dernière correction d'un apprenant qui a tout validé ->
 *    certificat demandé UNE fois, émis (ACTIF), CERTIFICATION_DECLENCHEE ;
 *    « Mon espace » montre la certification ;
 *  - atelier sous le seuil, QCM non réussi -> aucune demande, « Mon espace »
 *    donne le décompte ;
 *  - réévaluation par l'administrateur (notes antérieures) -> demandes pour
 *    les seuls éligibles ; 404, 403 ;
 *  - formation clôturée -> aucune demande ;
 *  - concurrence FORCÉE : deux évaluations simultanées du même apprenant ->
 *    une seule demande, un seul audit.
 *
 * Nettoyage rejouable (avant ET après) : objets S3 et certificats ->
 * tentatives et QCM -> livrables -> inscriptions -> ateliers -> formations ->
 * audit -> utilisateurs.
 */
describe('Déclencher la certification (e2e) — US-ATEL-09', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let livrableRepository: Repository<Livrable>;
  let dataSource: DataSource;
  let envoiMail: jest.SpyInstance;

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });
  const BUCKET = process.env.S3_BUCKET_LIVRABLES ?? 'livrables';

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe
  // (E2E-AFFECT, E2E-ATEL01, E2E-ATELPUB, E2E-AUTH16, E2E-CORRIGE, E2E-DM,
  // E2E-ATEL06, E2E-CERT01, E2E-ESPACE, E2E-FEEDBACK, E2E-FORM01, E2E-GRILLE,
  // E2E-INSC01, E2E-LIVRABLE, E2E-MODULES, E2E-MONFEED, E2E-NOTATION, E2E-QCM01,
  // E2E-QCMCONF, E2E-QCMPUB, E2E-REPONSE, E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-ELIGIB';
  const EMAIL = {
    admin: 'e2e-eligib-admin@cert-eet.local',
    formateur: 'e2e-eligib-form@cert-eet.local',
    intrus: 'e2e-eligib-intrus@cert-eet.local',
    a: 'e2e-eligib-a@cert-eet.local',
    b: 'e2e-eligib-b@cert-eet.local',
    c: 'e2e-eligib-c@cert-eet.local',
    d: 'e2e-eligib-d@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const APPRENANTS = ['a', 'b', 'c', 'd'] as const;

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const liv: Record<string, string> = {};
  let formationId: string;
  let atelierId: string;
  let qcmId: string;
  // c1 Fonctionnement 60 %, c2 Tests 40 %.
  const crit = { c1: '', c2: '' };

  const PDF = Buffer.from('%PDF-1.7\nRapport du projet API REST\n%%EOF\n');
  const MD = Buffer.from('# README\n\nLancer : npm start\n');

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

  const ouvrir = (livrableId: string, token = tokens.formateur): request.Test =>
    api('patch', `/livrables/${livrableId}/ouvrir`, token);

  const noter = (
    livrableId: string,
    critereId: string,
    corps: Record<string, unknown>,
    token = tokens.formateur,
  ): request.Test =>
    api('put', `/livrables/${livrableId}/correction/criteres/${critereId}`, token).send(corps);

  const finaliser = (
    livrableId: string,
    corps: Record<string, unknown>,
    token = tokens.formateur,
  ): request.Test =>
    api('post', `/livrables/${livrableId}/correction/finaliser`, token).send(corps);

  const traces = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

  const objetsDe = async (apprenantId: string): Promise<string[]> => {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `livrables/${apprenantId}/` }),
    );
    return (res.Contents ?? []).map((o) => o.Key as string);
  };

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
    const certs =
      utilisateurIds.length === 0
        ? []
        : ((await dataSource.query('SELECT id FROM certificats WHERE apprenant_id = ANY($1)', [
            utilisateurIds,
          ])) as Array<{ id: string }>);
    if (certs.length > 0) {
      await s3
        .send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: certs.map((c) => ({ Key: `certificats/${c.id}.pdf` })) },
          }),
        )
        .catch(() => undefined);
      await dataSource.query('DELETE FROM certificats WHERE id = ANY($1)', [
        certs.map((c) => c.id),
      ]);
    }
    if (utilisateurIds.length > 0) {
      await dataSource.query('DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)', [
        utilisateurIds,
      ]);
    }
    await dataSource.query(
      `DELETE FROM qcm WHERE module_id IN (SELECT m.id FROM modules m JOIN formations f
         ON f.id = m.formation_id WHERE f.titre LIKE $1)`,
      [`${MARQUEUR}%`],
    );
    const livrables =
      utilisateurIds.length === 0
        ? []
        : await livrableRepository.find({
            where: { apprenantId: In(utilisateurIds) },
            select: { id: true },
          });
    for (const id of utilisateurIds) {
      const cles = await objetsDe(id).catch(() => [] as string[]);
      if (cles.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: cles.map((Key) => ({ Key })) },
          }),
        );
      }
    }
    if (livrables.length > 0) {
      // CASCADE : corrections, notes des critères, fichiers.
      await livrableRepository.delete({ id: In(livrables.map((l) => l.id)) });
    }
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
    await purgeAudit([
      ...formationIds,
      ...ateliers.map((a) => a.id),
      ...livrables.map((l) => l.id),
      ...certs.map((c) => c.id),
      ...utilisateurIds,
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  /** Crée un atelier, sa grille (critères donnés) validée, et le publie. */
  const atelierPublie = async (
    moduleId: string,
    titre: string,
    dateLimite: string,
    criteres: Array<{ intitule: string; ponderation: number }>,
  ): Promise<{ id: string; criteres: string[] }> => {
    const tf = tokens.formateur;
    const res = await api('post', `/modules/${moduleId}/ateliers`, tf)
      .send({
        titre: `${MARQUEUR} ${titre}`,
        enonce: 'Livrez le rapport en PDF et le README du projet.',
        dateLimite,
        typesLivrables: ['pdf', 'md'],
        tailleMaxMo: 1,
        nbMaxFichiers: 2,
      })
      .expect(201);
    const id = res.body.id as string;
    for (const c of criteres) {
      await api('post', `/ateliers/${id}/grille/criteres`, tf).send(c).expect(201);
    }
    await api('post', `/ateliers/${id}/grille/valider`, tf).expect(200);
    await api('patch', `/ateliers/${id}/publier`, tf).expect(200);
    const grille = await api('get', `/ateliers/${id}/grille`, tf).expect(200);
    return { id, criteres: (grille.body.criteres as Array<{ id: string }>).map((c) => c.id) };
  };

  beforeAll(async () => {
    process.env.CERTIFICATS_BACKOFF_MS = '50';
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
    livrableRepository = dataSource.getRepository(Livrable);
    jest
      .spyOn(moduleRef.get(MailService), 'sendCorrectionFinaliseeEmail')
      .mockResolvedValue(undefined);
    envoiMail = jest
      .spyOn(moduleRef.get(MailService), 'sendCertificatEmisEmail')
      .mockResolvedValue(undefined);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      intrus: Role.FORMATEUR,
      a: Role.APPRENANT,
      b: Role.APPRENANT,
      c: Role.APPRENANT,
      d: Role.APPRENANT,
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: 'Test',
          nom: cle,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }

    const formationRepo = dataSource.getRepository(Formation);
    const formation = await formationRepo.save(
      formationRepo.create({
        titre: `${MARQUEUR} Back-end`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    formationId = formation.id;
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const module = await moduleRepo.save(
      moduleRepo.create({ formationId, titre: 'API REST', ordre: 1 }),
    );
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      affectationRepo.create({ formationId, formateurId: ids.formateur, affectePar: ids.admin }),
    );
    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save(
      APPRENANTS.map((cle) => inscriptionRepo.create({ apprenantId: ids[cle], formationId })),
    );

    const [dates] = (await dataSource.query(
      `SELECT (now() + interval '30 days') AS futur`,
    )) as Array<{ futur: Date }>;
    const futur = new Date(dates.futur).toISOString();
    const principal = await atelierPublie(module.id, 'Projet API', futur, [
      { intitule: 'Fonctionnement', ponderation: 60 },
      { intitule: 'Tests', ponderation: 40 },
    ]);
    atelierId = principal.id;
    [crit.c1, crit.c2] = principal.criteres;

    const [qcm] = (await dataSource.query(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
      [module.id, `${MARQUEUR} QCM final`],
    )) as Array<{ id: string }>;
    qcmId = qcm.id;
    for (const cle of APPRENANTS) {
      const res = await api('post', `/ateliers/${atelierId}/livrable`, tokens[cle])
        .attach('fichiers', PDF, 'Rapport résumé.pdf')
        .attach('fichiers', MD, 'README.md')
        .expect(201);
      liv[cle] = res.body.id as string;
    }
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.CERTIFICATS_BACKOFF_MS;
  });

  const reussirQcm = (cle: string, score: number, reussie = true): Promise<unknown> =>
    dataSource.query(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_limite, date_fin, statut, score, est_reussie)
       VALUES ($1, $2, now(), now(), 'NOTEE', $3, $4)`,
      [ids[cle], qcmId, score, reussie],
    );

  /** Corrige le livrable avec un même pourcentage sur les deux critères. */
  const corrigerA = async (livrableId: string, niveau: number, points: number): Promise<void> => {
    await ouvrir(livrableId).expect(200);
    await noter(livrableId, crit.c1, { niveau, pointsPct: points }).expect(200);
    await noter(livrableId, crit.c2, { niveau, pointsPct: points }).expect(200);
    await finaliser(livrableId, { commentaireGeneral: 'Feedback.' }).expect(200);
  };

  const certificatDe = async (
    cle: string,
  ): Promise<Array<{ id: string; statut: string; score_final: string; mention: string }>> =>
    (await dataSource.query(
      'SELECT id, statut, score_final, mention FROM certificats WHERE apprenant_id = $1',
      [ids[cle]],
    )) as Array<{ id: string; statut: string; score_final: string; mention: string }>;

  const attendreActif = async (certificatId: string): Promise<void> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      const [c] = (await dataSource.query('SELECT statut FROM certificats WHERE id = $1', [
        certificatId,
      ])) as Array<{ statut: string }>;
      if (c?.statut === 'ACTIF') return;
      if (Date.now() > fin) throw new Error(`Certificat ${certificatId} : ${c?.statut}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const monEspace = async (cle: string): Promise<Record<string, unknown>> =>
    (await api('get', `/formations/${formationId}/mon-espace`, tokens[cle]).expect(200)).body
      .certification as Record<string, unknown>;

  describe('Après chaque note', () => {
    it('avant toute note : non éligible, 0/2 dans « Mon espace »', async () => {
      expect(await monEspace('a')).toEqual({
        eligible: false,
        raison: 'Certification non éligible : 0 évaluation validée sur 2.',
        validees: 0,
        requises: 2,
        certificat: null,
      });
    });

    it('QCM réussi puis dernière correction ≥ seuil : UNE demande, certificat émis', async () => {
      await reussirQcm('a', 80);
      await corrigerA(liv.a, 3, 70);
      const [cert] = await certificatDe('a');
      expect(cert).toBeDefined();
      expect(Number(cert.score_final)).toBe(75);
      expect(cert.mention).toBe('Bien');
      const t = await traces('CERTIFICATION_DECLENCHEE', cert.id);
      expect(t).toHaveLength(1);
      expect(t[0].detailsAvantApres).toMatchObject({
        origine: 'CORRECTION_FINALISEE',
        scoreFinal: 75,
      });
      await attendreActif(cert.id);
      expect(envoiMail).toHaveBeenCalledWith(
        EMAIL.a,
        expect.objectContaining({
          urlVerification: expect.stringContaining(`/verifier/${cert.id}`),
        }),
      );
      expect(await monEspace('a')).toEqual({
        eligible: true,
        raison: null,
        validees: 2,
        requises: 2,
        certificat: { id: cert.id, statut: 'ACTIF' },
      });
    }, 40_000);

    it('atelier sous le seuil : aucune demande, décompte 1/2', async () => {
      await reussirQcm('b', 90);
      await corrigerA(liv.b, 2, 40);
      expect(await certificatDe('b')).toEqual([]);
      expect(await monEspace('b')).toMatchObject({
        eligible: false,
        raison: 'Certification non éligible : 1 évaluation validée sur 2.',
        certificat: null,
      });
    }, 30_000);

    it('QCM non réussi : atelier validé mais aucune demande', async () => {
      await reussirQcm('c', 40, false);
      await corrigerA(liv.c, 4, 80);
      expect(await certificatDe('c')).toEqual([]);
    }, 30_000);
  });

  describe('Réévaluation par l’administrateur', () => {
    it('notes antérieures : seuls les éligibles sont demandés, une seule fois', async () => {
      // c réussit le QCM plus tard ; sa note est écrite sans passer par la
      // notation (comme une note antérieure à la story).
      await reussirQcm('c', 75);
      const res = await api(
        'post',
        `/admin/formations/${formationId}/certification/evaluer`,
        tokens.admin,
      ).expect(200);
      expect(res.body).toEqual({ evalues: 4, eligibles: 2, declenches: 1 });
      const [cert] = await certificatDe('c');
      expect(Number(cert.score_final)).toBe(77.5);
      expect(await certificatDe('b')).toEqual([]);
      expect(await traces('CERTIFICATION_FORMATION_EVALUEE', formationId)).toHaveLength(1);
      const encore = await api(
        'post',
        `/admin/formations/${formationId}/certification/evaluer`,
        tokens.admin,
      ).expect(200);
      expect(encore.body.declenches).toBe(0);
      await attendreActif(cert.id);
    }, 30_000);

    it('403 formateur et apprenant ; 404 formation inconnue ; 400 identifiant', async () => {
      const chemin = `/admin/formations/${formationId}/certification/evaluer`;
      await api('post', chemin, tokens.formateur).expect(403);
      await api('post', chemin, tokens.a).expect(403);
      await api(
        'post',
        '/admin/formations/88888888-8888-4888-8888-888888888888/certification/evaluer',
        tokens.admin,
      ).expect(404);
      await api('post', '/admin/formations/x/certification/evaluer', tokens.admin).expect(400);
    });
  });

  describe('Formation clôturée et concurrence', () => {
    it('formation ARCHIVEE : éligibilité refusée', async () => {
      await reussirQcm('d', 85);
      await corrigerA(liv.d, 4, 90);
      const [cert] = await certificatDe('d');
      // d est devenu éligible à la finalisation : certificat demandé.
      expect(cert).toBeDefined();
      await dataSource.query(`UPDATE formations SET statut = 'ARCHIVEE' WHERE id = $1`, [
        formationId,
      ]);
      try {
        const verdict = await moduleRef.get(EligibiliteService).evaluer(ids.b, formationId);
        expect(verdict.raison).toBe('Certification non éligible : la formation est clôturée.');
      } finally {
        await dataSource.query(`UPDATE formations SET statut = 'OUVERTE' WHERE id = $1`, [
          formationId,
        ]);
      }
      await attendreActif(cert.id);
    }, 40_000);

    it('deux évaluations simultanées : une seule demande, un seul audit', async () => {
      // On retire le certificat de d pour rejouer le déclenchement à deux.
      const [cert] = await certificatDe('d');
      await dataSource.query('DELETE FROM certificats WHERE id = $1', [cert.id]);
      const eligibilite = moduleRef.get(EligibiliteService);
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let resultats: Array<{ declenche: boolean; certificatId: string | null }>;
      try {
        await bloqueur.query('LOCK TABLE certificats IN SHARE ROW EXCLUSIVE MODE');
        const enCours = [
          eligibilite.evaluerEtDeclencher(ids.d, formationId, 'TENTATIVE_NOTEE'),
          eligibilite.evaluerEtDeclencher(ids.d, formationId, 'CORRECTION_FINALISEE'),
        ];
        await new Promise((r) => setTimeout(r, 700));
        await bloqueur.commitTransaction();
        resultats = await Promise.all(enCours);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(resultats.filter((r) => r.declenche)).toHaveLength(1);
      expect(new Set(resultats.map((r) => r.certificatId)).size).toBe(1);
      const certs = await certificatDe('d');
      expect(certs).toHaveLength(1);
      expect(await traces('CERTIFICATION_DECLENCHEE', certs[0].id)).toHaveLength(1);
      await attendreActif(certs[0].id);
    }, 40_000);
  });
});
