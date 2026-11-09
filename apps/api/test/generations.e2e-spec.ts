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
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { GenerationIa } from '../src/database/entities/generation-ia.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { SupportPedagogique } from '../src/database/entities/support-pedagogique.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutGeneration } from '../src/database/enums/statut-generation.enum';
import { StatutSupport } from '../src/database/enums/statut-support.enum';
import { FileIaService } from '../src/modules/assistance-ia/file-ia.service';
import {
  MESSAGE_AUCUN_SUPPORT_INDEXE,
  MESSAGE_GENERATION_EN_COURS,
  MESSAGE_SUPPORT_NON_INDEXE,
} from '../src/modules/assistance-ia/generations/generation.regles';
import { MESSAGE_SUPPORT_UTILISE } from '../src/modules/assistance-ia/supports/supports.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * Tests d'intégration US-IA-02 — Lancer une génération paramétrée (DS-06
 * partie 2), sur l'application réelle (PostgreSQL, Redis/BullMQ, S3).
 *
 * Couvre : 202 EN_COURS avec paramètres normalisés, travail présent dans la
 * file `ia-generation`, audit GENERATION_IA_LANCEE, liste et fiche ; refus 400
 * (paramètres), 403 (non affecté tracé, apprenant), 404 (module, support d'un
 * autre module, génération), 409 (aucun support indexé -> invitation, support
 * non indexé, formation archivée, génération déjà en cours, support utilisé
 * non supprimable), 429 (plafond horaire) ; garanties en base (CHECK, index
 * unique partiel) ; concurrence FORCÉE : deux lancements simultanés -> un 202,
 * un 409, une seule génération en cours.
 *
 * Nettoyage rejouable (avant ET après) : générations -> objets `supports/` ->
 * supports -> formations -> compteurs Redis -> audit -> utilisateurs.
 */
describe('Lancer une génération IA (e2e) — US-IA-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let generationRepository: Repository<GenerationIa>;
  let dataSource: DataSource;
  let fileIa: FileIaService;
  let redis: RedisService;

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
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-IAGEN';
  const EMAIL = {
    admin: 'e2e-iagen-admin@cert-eet.local',
    formateur: 'e2e-iagen-form@cert-eet.local',
    quota: 'e2e-iagen-quota@cert-eet.local',
    autre: 'e2e-iagen-autre@cert-eet.local',
    apprenant: 'e2e-iagen-appr@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';
  const COURS =
    'Le jeton JWT est signé avec une clé privée RS256. La clé publique permet de vérifier la ' +
    'signature. La rotation des jetons de rafraîchissement limite le vol de session.';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /** M : module avec un support indexé ; V : module sans support indexé ; A : formation archivée. */
  const mod = { M: '', V: '', A: '' };
  const sup = { indexe: '', autreIndexe: '', enCours: '', archive: '' };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (methode: 'get' | 'post' | 'delete', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const parametres = (supportId: string): Record<string, unknown> => ({
    supportId,
    nbQuestions: 10,
    types: ['VRAI_FAUX', 'QCU'],
    niveau: 'INTERMEDIAIRE',
    focusThematique: '  sécurité   JWT ',
  });

  const lancer = (
    corps: Record<string, unknown>,
    token = tokens.formateur,
    module = mod.M,
  ): request.Test => api('post', `/modules/${module}/generations`, token).send(corps);

  /** Termine les générations en cours d'un formateur (le pipeline est US-IA-03). */
  const terminer = async (formateurId: string): Promise<void> => {
    await dataSource.query(
      `UPDATE generations_ia SET statut = 'TERMINEE', date_fin = now(), nb_suggestions = 0,
              nb_invalides = 0
        WHERE formateur_id = $1 AND statut = 'EN_COURS'`,
      [formateurId],
    );
  };

  const insererSupport = async (
    moduleId: string,
    statut: StatutSupport,
    numero: number,
  ): Promise<string> => {
    const indexe = statut === StatutSupport.INDEXE;
    const [{ id }] = (await dataSource.query(
      `INSERT INTO supports_pedagogiques
         (module_id, depose_par, titre, nom_original, extension, taille_octets, sha256,
          cle_stockage, statut, nb_segments, nb_caracteres, modele_embeddings, date_indexation)
       VALUES ($1, $2, $3, 'cours.txt', 'txt', 100, $4, $5, $6, $7, $7, $8, $9)
       RETURNING id`,
      [
        moduleId,
        ids.formateur,
        `Support ${numero}`,
        String(numero).padStart(64, '0'),
        `supports/${moduleId}/e2e-iagen-${numero}/original.txt`,
        statut,
        indexe ? 1 : null,
        indexe ? 'hachage-lexical-v1' : null,
        indexe ? new Date() : null,
      ],
    )) as Array<{ id: string }>;
    return id;
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
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    const modules =
      formationIds.length === 0
        ? []
        : await dataSource
            .getRepository(ModuleFormation)
            .find({ where: { formationId: In(formationIds) }, select: { id: true } });
    const moduleIds = modules.map((m) => m.id);
    const generations =
      moduleIds.length === 0
        ? []
        : await generationRepository.find({
            where: { moduleId: In(moduleIds) },
            select: { id: true },
          });
    if (generations.length > 0) {
      await generationRepository.delete({ id: In(generations.map((g) => g.id)) });
    }
    const supports =
      moduleIds.length === 0
        ? []
        : await dataSource
            .getRepository(SupportPedagogique)
            .find({ where: { moduleId: In(moduleIds) }, select: { id: true } });
    for (const id of moduleIds) {
      const res = await s3
        .send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `supports/${id}/` }))
        .catch(() => ({ Contents: [] }));
      const cles = (res.Contents ?? []).map((o) => ({ Key: o.Key as string }));
      if (cles.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: cles } }));
      }
    }
    if (supports.length > 0) {
      await dataSource
        .getRepository(SupportPedagogique)
        .delete({ id: In(supports.map((s) => s.id)) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    for (const u of utilisateurs) await redis.del(`limite:ia-generation:${u.id}`);
    await purgeAudit([
      ...formationIds,
      ...generations.map((g) => g.id),
      ...supports.map((s) => s.id),
      ...utilisateurs.map((u) => u.id),
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    process.env.IA_GENERATIONS_PAR_HEURE = '3';
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
    generationRepository = dataSource.getRepository(GenerationIa);
    fileIa = moduleRef.get(FileIaService);
    redis = moduleRef.get(RedisService);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      quota: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
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
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    const creer = async (
      titre: string,
      statut: StatutFormation,
      ordre: number,
    ): Promise<string> => {
      const f = await formationRepo.save(
        formationRepo.create({ titre, statut, capaciteMax: 20, noteMinCertification: 60 }),
      );
      for (const formateurId of [ids.formateur, ids.quota]) {
        await affectationRepo.save(
          affectationRepo.create({ formationId: f.id, formateurId, affectePar: ids.admin }),
        );
      }
      const m = await moduleRepo.save(
        moduleRepo.create({ formationId: f.id, titre: 'Sécurité', ordre }),
      );
      return m.id;
    };
    mod.M = await creer(`${MARQUEUR} Back-end`, StatutFormation.OUVERTE, 1);
    mod.V = await creer(`${MARQUEUR} Sans support`, StatutFormation.OUVERTE, 1);
    mod.A = await creer(`${MARQUEUR} Archivée`, StatutFormation.ARCHIVEE, 1);

    // Un support indexé par le vrai pipeline d'US-IA-01, les autres en SQL.
    const depot = await api('post', `/modules/${mod.M}/supports`, tokens.formateur)
      .attach('fichier', Buffer.from(COURS), 'cours-jwt.txt')
      .expect(202);
    sup.indexe = depot.body.id as string;
    const fin = Date.now() + 20_000;
    while (
      (await dataSource.getRepository(SupportPedagogique).findOneByOrFail({ id: sup.indexe }))
        .statut !== StatutSupport.INDEXE
    ) {
      if (Date.now() > fin) throw new Error('Support non indexé à temps.');
      await new Promise((r) => setTimeout(r, 100));
    }
    sup.autreIndexe = await insererSupport(mod.M, StatutSupport.INDEXE, 1);
    sup.enCours = await insererSupport(mod.V, StatutSupport.EN_INDEXATION, 2);
    sup.archive = await insererSupport(mod.A, StatutSupport.INDEXE, 3);
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.IA_GENERATIONS_PAR_HEURE;
  });

  // ===================================================================
  //  Nominal
  // ===================================================================

  describe('Lancement (nominal)', () => {
    let generationId: string;

    it('202 EN_COURS, paramètres normalisés, travail en file, audit', async () => {
      const res = await lancer(parametres(sup.indexe)).expect(202);
      expect(res.body).toEqual(
        expect.objectContaining({
          moduleId: mod.M,
          support: { id: sup.indexe, titre: 'cours-jwt' },
          formateur: { id: ids.formateur, prenom: 'Test', nom: 'formateur' },
          nbQuestionsDemandees: 10,
          types: ['QCU', 'VRAI_FAUX'],
          niveau: 'INTERMEDIAIRE',
          focusThematique: 'sécurité JWT',
          statut: StatutGeneration.EN_COURS,
          nbSuggestions: null,
          dateFin: null,
        }),
      );
      generationId = res.body.id as string;
      expect(await fileIa.travailGeneration(generationId)).toEqual({
        id: generationId,
        donnees: { generationId },
      });
      expect(
        await auditLogRepository.countBy({ action: 'GENERATION_IA_LANCEE', cible: generationId }),
      ).toBe(1);
    });

    it('liste du module et fiche', async () => {
      const liste = await api('get', `/modules/${mod.M}/generations`, tokens.formateur).expect(200);
      expect((liste.body as Array<{ id: string }>).map((g) => g.id)).toContain(generationId);
      const fiche = await api('get', `/generations/${generationId}`, tokens.formateur).expect(200);
      expect(fiche.body.id).toBe(generationId);
      await api('get', `/generations/${generationId}`, tokens.admin).expect(200);
    });

    it('409 : une seule génération en cours par formateur ; un autre formateur peut lancer', async () => {
      const res = await lancer(parametres(sup.autreIndexe)).expect(409);
      expect(res.body.message).toBe(MESSAGE_GENERATION_EN_COURS);
      await lancer(parametres(sup.autreIndexe), tokens.quota).expect(202);
      await terminer(ids.formateur);
      await terminer(ids.quota);
      await redis.del(`limite:ia-generation:${ids.quota}`);
    });

    it('support utilisé par une génération : suppression refusée (409)', async () => {
      const res = await api('delete', `/supports/${sup.indexe}`, tokens.formateur).expect(409);
      expect(res.body.message).toBe(MESSAGE_SUPPORT_UTILISE);
    });
  });

  // ===================================================================
  //  Refus
  // ===================================================================

  describe('Refus (rien n’est créé)', () => {
    let avant: number;
    beforeAll(async () => {
      avant = await generationRepository.count();
    });
    afterAll(async () => {
      expect(await generationRepository.count()).toBe(avant);
    });

    it.each([
      ['nombre nul', { nbQuestions: 0 }],
      ['nombre > 20', { nbQuestions: 21 }],
      ['nombre non entier', { nbQuestions: 2.5 }],
      ['types vides', { types: [] }],
      ['type en double', { types: ['QCU', 'QCU'] }],
      ['type non générable', { types: ['REPONSE_COURTE'] }],
      ['niveau inconnu', { niveau: 'EXPERT' }],
      ['thème trop long', { focusThematique: 't'.repeat(201) }],
      ['support non UUID', { supportId: 'abc' }],
      ['champ inconnu', { temperature: 2 }],
    ])('400 : %s', async (_libelle, modification) => {
      await lancer({ ...parametres(sup.indexe), ...modification }).expect(400);
    });

    it('400 : support absent', async () => {
      const sans = parametres(sup.indexe);
      delete sans.supportId;
      await lancer(sans).expect(400);
    });

    it('404 : module inconnu, support d’un autre module ou inconnu ; génération inconnue', async () => {
      await lancer(parametres(sup.indexe), tokens.formateur, UUID_INCONNU).expect(404);
      await lancer(parametres(sup.indexe), tokens.admin, UUID_INCONNU).expect(404);
      await lancer(parametres(sup.indexe), tokens.formateur, mod.V).expect(404);
      await lancer(parametres(UUID_INCONNU)).expect(404);
      await api('get', `/generations/${UUID_INCONNU}`, tokens.formateur).expect(404);
      await api('get', '/generations/pas-un-uuid', tokens.formateur).expect(400);
    });

    it('403 : formateur non affecté (tracé) et apprenant', async () => {
      const refus = await auditLogRepository.countBy({
        action: 'ACCES_RESSOURCE_REFUSE',
        userId: ids.autre,
      });
      await lancer(parametres(sup.indexe), tokens.autre).expect(403);
      await api('get', `/modules/${mod.M}/generations`, tokens.autre).expect(403);
      expect(
        await auditLogRepository.countBy({ action: 'ACCES_RESSOURCE_REFUSE', userId: ids.autre }),
      ).toBe(refus + 2);
      await lancer(parametres(sup.indexe), tokens.apprenant).expect(403);
    });

    it('409 : aucun support indexé dans le module -> invitation à indexer d’abord', async () => {
      const res = await lancer(parametres(sup.enCours), tokens.formateur, mod.V).expect(409);
      expect(res.body.message).toBe(MESSAGE_AUCUN_SUPPORT_INDEXE);
    });

    it('409 : support non indexé quand le module en a d’autres', async () => {
      const enCours = await insererSupport(mod.M, StatutSupport.ECHEC_INDEXATION, 4);
      const res = await lancer(parametres(enCours)).expect(409);
      expect(res.body.message).toBe(MESSAGE_SUPPORT_NON_INDEXE);
    });

    it('409 : formation archivée', async () => {
      await lancer(parametres(sup.archive), tokens.formateur, mod.A).expect(409);
    });
  });

  // ===================================================================
  //  Plafond horaire (IA_GENERATIONS_PAR_HEURE = 3 pour la suite)
  // ===================================================================

  describe('Plafond horaire', () => {
    it('trois lancements passent, le quatrième est refusé en 429', async () => {
      await redis.del(`limite:ia-generation:${ids.quota}`);
      for (let i = 0; i < 3; i++) {
        await lancer(parametres(sup.indexe), tokens.quota).expect(202);
        await terminer(ids.quota);
      }
      const res = await lancer(parametres(sup.indexe), tokens.quota).expect(429);
      expect(res.body.message).toMatch(
        /^Limite de 3 générations par heure atteinte : réessayez dans \d+ min\.$/,
      );
      expect(
        await generationRepository.countBy({
          formateurId: ids.quota,
          statut: StatutGeneration.EN_COURS,
        }),
      ).toBe(0);
      await redis.del(`limite:ia-generation:${ids.quota}`);
    });
  });

  // ===================================================================
  //  Garanties en base
  // ===================================================================

  describe('Garanties en base', () => {
    const inserer = (valeurs: string): Promise<unknown> =>
      dataSource.query(
        `INSERT INTO generations_ia (module_id, support_id, formateur_id, nb_questions_demandees,
           types_questions, niveau, statut, date_fin, nb_suggestions, nb_invalides)
         VALUES ($1, $2, $3, ${valeurs})`,
        [mod.M, sup.indexe, ids.admin],
      );

    it('bornes, types, niveau, cohérence des statuts', async () => {
      await expect(inserer(`21, '{QCU}', 'AVANCE', 'EN_COURS', NULL, NULL, NULL`)).rejects.toThrow(
        /CHK_generations_nb/,
      );
      await expect(
        inserer(`5, '{QCU,QCU}', 'AVANCE', 'EN_COURS', NULL, NULL, NULL`),
      ).rejects.toThrow(/CHK_generations_types/);
      await expect(
        inserer(`5, '{ASSOCIATION}', 'AVANCE', 'EN_COURS', NULL, NULL, NULL`),
      ).rejects.toThrow(/CHK_generations_types/);
      await expect(inserer(`5, '{QCU}', 'EXPERT', 'EN_COURS', NULL, NULL, NULL`)).rejects.toThrow(
        /CHK_generations_niveau/,
      );
      await expect(inserer(`5, '{QCU}', 'AVANCE', 'TERMINEE', NULL, NULL, NULL`)).rejects.toThrow(
        /CHK_generations_terminee/,
      );
      await expect(inserer(`5, '{QCU}', 'AVANCE', 'ECHEC', now(), NULL, NULL`)).rejects.toThrow(
        /CHK_generations_echec/,
      );
      await expect(inserer(`5, '{QCU}', 'AVANCE', 'TERMINEE', now(), 6, 0`)).rejects.toThrow(
        /CHK_generations_compteurs/,
      );
    });

    it('index unique partiel : deux générations EN_COURS du même formateur impossibles', async () => {
      await inserer(`5, '{QCU}', 'AVANCE', 'EN_COURS', NULL, NULL, NULL`);
      await expect(inserer(`5, '{QCM}', 'DEBUTANT', 'EN_COURS', NULL, NULL, NULL`)).rejects.toThrow(
        /UQ_generations_une_en_cours_par_formateur/,
      );
      await terminer(ids.admin);
      await inserer(`5, '{QCM}', 'DEBUTANT', 'EN_COURS', NULL, NULL, NULL`);
      await terminer(ids.admin);
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux lancements simultanés du même formateur : un 202, un 409', async () => {
      // SHARE ROW EXCLUSIVE laisse passer le contrôle « déjà en cours ? » mais
      // bloque les INSERT : seules les deux écritures se croisent, et l'index
      // unique partiel les départage.
      await terminer(ids.formateur);
      await redis.del(`limite:ia-generation:${ids.formateur}`);
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let reponses: request.Response[];
      try {
        await bloqueur.query('LOCK TABLE generations_ia IN SHARE ROW EXCLUSIVE MODE');
        const a = lancer(parametres(sup.indexe)).then((r) => r);
        const b = lancer(parametres(sup.autreIndexe)).then((r) => r);
        await new Promise((r) => setTimeout(r, 1500));
        await bloqueur.commitTransaction();
        reponses = await Promise.all([a, b]);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(reponses.map((r) => r.status).sort()).toEqual([202, 409]);
      expect(reponses.find((r) => r.status === 409)?.body.message).toBe(
        MESSAGE_GENERATION_EN_COURS,
      );
      expect(
        await generationRepository.countBy({
          formateurId: ids.formateur,
          statut: StatutGeneration.EN_COURS,
        }),
      ).toBe(1);
      await terminer(ids.formateur);
    }, 30_000);

    it('lancement et suppression simultanés du support : 202 puis 409, jamais de 500', async () => {
      // Le lancement attend au moment d'écrire (verrou de table) en tenant le
      // support verrouillé en PARTAGE : la suppression doit attendre la fin du
      // lancement, puis buter sur la clé étrangère (409). Sans ce verrou, le
      // support disparaîtrait entre le contrôle et l'INSERT (500).
      await terminer(ids.formateur);
      await redis.del(`limite:ia-generation:${ids.formateur}`);
      const cible = await insererSupport(mod.M, StatutSupport.INDEXE, 5);
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let lancement: request.Response;
      let suppression: request.Response;
      try {
        await bloqueur.query('LOCK TABLE generations_ia IN SHARE ROW EXCLUSIVE MODE');
        const a = lancer(parametres(cible)).then((r) => r);
        await new Promise((r) => setTimeout(r, 700));
        const b = api('delete', `/supports/${cible}`, tokens.formateur).then((r) => r);
        await new Promise((r) => setTimeout(r, 800));
        await bloqueur.commitTransaction();
        [lancement, suppression] = await Promise.all([a, b]);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(lancement.status).toBe(202);
      expect(suppression.status).toBe(409);
      expect(suppression.body.message).toBe(MESSAGE_SUPPORT_UTILISE);
      await terminer(ids.formateur);
    }, 30_000);
  });
});
