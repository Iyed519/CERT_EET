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
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-ATEL-08 — Consulter son feedback (UC Apprenant,
 * DS-03 partie 2), sur l'application réelle et la vraie base.
 *
 * Couvre :
 *  - livrable SOUMIS ou EN_CORRECTION : la fiche ne porte AUCUNE note
 *    partielle (feedback null, ni points ni score) ;
 *  - livrable NOTÉ : note globale, détail par critère dans l'ordre de la
 *    grille (niveau, points, contribution, commentaire), commentaire général,
 *    date ; jamais de champ interne (email du correcteur, identifiants de
 *    correction) ;
 *  - « Nouveau feedback » dans « Mon espace » jusqu'à la première ouverture,
 *    enregistrée une seule fois (consultations_feedback) et tracée
 *    FEEDBACK_CONSULTE ; formation terminée : toujours consultable ;
 *  - un apprenant ne voit que SON feedback ;
 *  - concurrence FORCÉE : deux premières ouvertures simultanées -> une seule
 *    consultation, un seul audit.
 *
 * Nettoyage rejouable (avant ET après) : même ordre RESTRICT que les suites
 * US-ATEL-06/07 (CASCADE du livrable vers corrections, notes, consultations).
 */
describe('Consulter son feedback (e2e) — US-ATEL-08', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let livrableRepository: Repository<Livrable>;
  let dataSource: DataSource;

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
  // E2E-ATEL06, E2E-ESPACE, E2E-FEEDBACK, E2E-FORM01, E2E-GRILLE, E2E-INSC01,
  // E2E-LIVRABLE, E2E-MODULES, E2E-NOTATION, E2E-QCM01, E2E-QCMCONF,
  // E2E-QCMPUB, E2E-REPONSE, E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-MONFEED';
  const EMAIL = {
    admin: 'e2e-monfeed-admin@cert-eet.local',
    formateur: 'e2e-monfeed-form@cert-eet.local',
    intrus: 'e2e-monfeed-intrus@cert-eet.local',
    a: 'e2e-monfeed-a@cert-eet.local',
    b: 'e2e-monfeed-b@cert-eet.local',
    c: 'e2e-monfeed-c@cert-eet.local',
    d: 'e2e-monfeed-d@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const APPRENANTS = ['a', 'b', 'c', 'd'] as const;

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const liv: Record<string, string> = {};
  let formationId: string;
  let atelierId: string;
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

  /** Ouvre la correction et note les deux critères : 50 % sur c1 (60), 100 % sur c2 (40). */
  const corrigerEntierement = async (livrableId: string): Promise<void> => {
    await ouvrir(livrableId).expect(200);
    await noter(livrableId, crit.c1, { niveau: 3, pointsPct: 50 }).expect(200);
    await noter(livrableId, crit.c2, { niveau: 4, pointsPct: 100 }).expect(200);
  };

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
    // US-ATEL-09 : des apprenants de la suite peuvent être devenus éligibles.
    await purgerCertificats(dataSource, MARQUEUR);
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([
      ...formationIds,
      ...ateliers.map((a) => a.id),
      ...livrables.map((l) => l.id),
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
    // Pas de serveur SMTP en CI : l'envoi est simulé (US-ATEL-07 l'éprouve).
    jest
      .spyOn(moduleRef.get(MailService), 'sendCorrectionFinaliseeEmail')
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
  });

  const fiche = (cle: string): request.Test =>
    api('get', `/mes-ateliers/${atelierId}`, tokens[cle]);

  const nouveauFeedback = async (cle: string): Promise<boolean> => {
    const res = await api('get', `/formations/${formationId}/mon-espace`, tokens[cle]).expect(200);
    return res.body.modules[0].ateliers[0].nouveauFeedback as boolean;
  };

  const consultations = async (livrableId: string): Promise<number> => {
    const [{ n }] = (await dataSource.query(
      'SELECT count(*)::int AS n FROM consultations_feedback WHERE livrable_id = $1',
      [livrableId],
    )) as Array<{ n: number }>;
    return n;
  };

  describe('Avant l’envoi : aucune note partielle', () => {
    it('SOUMIS : feedback null, pas de badge', async () => {
      const res = await fiche('a').expect(200);
      expect(res.body.monLivrable.statut).toBe('SOUMIS');
      expect(res.body.monLivrable.feedback).toBeNull();
      expect(await nouveauFeedback('a')).toBe(false);
    });

    it('EN_CORRECTION : statut seul, ni points ni score', async () => {
      await ouvrir(liv.b).expect(200);
      await noter(liv.b, crit.c1, { niveau: 3, pointsPct: 50, commentaire: 'Partiel.' }).expect(
        200,
      );
      const res = await fiche('b').expect(200);
      expect(res.body.monLivrable.statut).toBe('EN_CORRECTION');
      expect(res.body.monLivrable.feedback).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/pointsPct|score|Partiel/);
      expect(await nouveauFeedback('b')).toBe(false);
      expect(await consultations(liv.b)).toBe(0);
    });
  });

  describe('Après l’envoi', () => {
    beforeAll(async () => {
      await corrigerEntierement(liv.a);
      await noter(liv.a, crit.c1, {
        niveau: 3,
        pointsPct: 50,
        commentaire: 'La pagination manque.',
      }).expect(200);
      await finaliser(liv.a, {
        commentaireGeneral: 'API fonctionnelle ; soignez le README.',
      }).expect(200);
    }, 30_000);

    it('« Nouveau feedback » tant qu’il n’est pas ouvert', async () => {
      expect(await nouveauFeedback('a')).toBe(true);
      expect(await consultations(liv.a)).toBe(0);
    });

    it('la fiche porte le feedback complet, en liste blanche', async () => {
      const res = await fiche('a').expect(200);
      expect(res.body.monLivrable.statut).toBe('NOTE');
      expect(res.body.monLivrable.feedback).toEqual({
        scoreFinal: 70,
        commentaireGeneral: 'API fonctionnelle ; soignez le README.',
        dateFinalisation: expect.any(String),
        correcteur: { prenom: 'Test', nom: 'formateur' },
        criteres: [
          {
            critereId: crit.c1,
            ordre: 1,
            intitule: 'Fonctionnement',
            ponderation: 60,
            niveau: 3,
            libelleNiveau: 'Bon',
            pointsPct: 50,
            contribution: 30,
            commentaire: 'La pagination manque.',
          },
          {
            critereId: crit.c2,
            ordre: 2,
            intitule: 'Tests',
            ponderation: 40,
            niveau: 4,
            libelleNiveau: 'Excellent',
            pointsPct: 100,
            contribution: 40,
            commentaire: null,
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toContain(EMAIL.formateur);
    });

    it('première ouverture enregistrée et tracée une seule fois ; le badge disparaît', async () => {
      expect(await consultations(liv.a)).toBe(1);
      await fiche('a').expect(200);
      expect(await consultations(liv.a)).toBe(1);
      const t = await traces('FEEDBACK_CONSULTE', liv.a);
      expect(t).toHaveLength(1);
      expect(t[0].userId).toBe(ids.a);
      expect(t[0].detailsAvantApres).toMatchObject({ scoreFinal: 70 });
      expect(await nouveauFeedback('a')).toBe(false);
    });

    it('un autre apprenant ne voit que son propre livrable', async () => {
      const res = await fiche('c').expect(200);
      expect(res.body.monLivrable.id).toBe(liv.c);
      expect(res.body.monLivrable.feedback).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/soignez le README|pagination/);
    });

    it('formation terminée : le feedback reste consultable', async () => {
      await dataSource.query(
        `UPDATE inscriptions SET statut = 'TERMINEE' WHERE apprenant_id = $1 AND formation_id = $2`,
        [ids.a, formationId],
      );
      try {
        const res = await fiche('a').expect(200);
        expect(res.body.monLivrable.feedback.scoreFinal).toBe(70);
      } finally {
        await dataSource.query(
          `UPDATE inscriptions SET statut = 'EN_COURS' WHERE apprenant_id = $1 AND formation_id = $2`,
          [ids.a, formationId],
        );
      }
    });
  });

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux premières ouvertures simultanées : une consultation, un audit', async () => {
      await corrigerEntierement(liv.d);
      await finaliser(liv.d, { commentaireGeneral: 'Bien.' }).expect(200);
      // Le verrou de table fait attendre les deux INSERT ; libérés ensemble,
      // ils se disputent la même clé : seul ON CONFLICT évite l'erreur.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let reponses: request.Response[];
      try {
        await bloqueur.query('LOCK TABLE consultations_feedback IN SHARE ROW EXCLUSIVE MODE');
        const premiere = fiche('d').then((r) => r);
        const seconde = fiche('d').then((r) => r);
        await new Promise((fin) => setTimeout(fin, 700));
        await bloqueur.commitTransaction();
        reponses = await Promise.all([premiere, seconde]);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(reponses.map((r) => r.status)).toEqual([200, 200]);
      expect(await consultations(liv.d)).toBe(1);
      expect(await traces('FEEDBACK_CONSULTE', liv.d)).toHaveLength(1);
    }, 30_000);
  });
});
