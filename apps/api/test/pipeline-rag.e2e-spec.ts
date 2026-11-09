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
import {
  MESSAGE_AUCUNE_VALIDE,
  MESSAGE_ECHEC_GENERATION,
  MESSAGE_MODELE_EMBEDDINGS,
  PipelineRagService,
} from '../src/modules/assistance-ia/generations/pipeline-rag.service';
import { FOURNISSEUR_LLM, FournisseurLlm } from '../src/modules/assistance-ia/llm/fournisseur-llm';
import { MailService } from '../src/mail/mail.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * Tests d'intégration US-IA-03 — Pipeline RAG (DS-06 « Pipeline de génération
 * asynchrone », AC-04), sur l'application réelle : PostgreSQL + pgvector,
 * Redis/BullMQ (worker dans le processus), S3, fournisseur de LLM FACTICE.
 *
 * Couvre : support réellement déposé et indexé, génération lancée par l'API,
 * worker -> TERMINEE avec suggestions PROPOSEE conformes, ancrées dans les
 * passages ; recherche des 8 passages les plus proches (le passage du thème
 * en premier) limitée au support ciblé ; questions non conformes comptées,
 * jamais enregistrées ; nouvelles tentatives puis ECHEC avec motif (aucune
 * question conforme, fournisseur en panne), échec définitif sans nouvelle
 * tentative (modèle d'embeddings différent) ; audit GENERATION_IA_TERMINEE /
 * GENERATION_IA_ECHEC ; email au formateur ; lecture des suggestions (403
 * tracé, 404) ; garanties en base (CHECK, unicité, cascade) ; concurrence
 * FORCÉE : deux exécutions simultanées du même travail -> un seul jeu de
 * suggestions ; génération terminée ailleurs pendant l'attente du verrou ->
 * aucun appel au modèle.
 *
 * Nettoyage rejouable (avant ET après) : générations (suggestions en cascade)
 * -> objets `supports/` -> supports -> formations -> compteurs Redis -> audit
 * -> utilisateurs.
 */
describe('Pipeline RAG (e2e) — US-IA-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let generationRepository: Repository<GenerationIa>;
  let supportRepository: Repository<SupportPedagogique>;
  let dataSource: DataSource;
  let redis: RedisService;
  let pipeline: PipelineRagService;
  let llm: FournisseurLlm;
  let emails: jest.SpyInstance;

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
  const MARQUEUR = 'E2E-IARAG';
  const EMAIL = {
    admin: 'e2e-iarag-admin@cert-eet.local',
    formateur: 'e2e-iarag-form@cert-eet.local',
    autre: 'e2e-iarag-autre@cert-eet.local',
    apprenant: 'e2e-iarag-appr@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';

  /** Dix chapitres au vocabulaire distinct : un segment par chapitre (≈ 1 700 caractères). */
  const THEMES = [
    'jetons JWT signature asymétrique',
    'conteneurs Docker images couches',
    'index PostgreSQL arbres équilibrés',
    'files BullMQ tentatives différées',
    'certificats révocation registre public',
    'webcam surveillance consentement explicite',
    'sauvegardes nocturnes chiffrées hors site',
    'ateliers pratiques livrables notés',
    'quiz chronométrés tirage aléatoire',
    'embeddings vecteurs similarité cosinus',
  ];
  const chapitre = (theme: string, i: number): string => {
    const phrases: string[] = [`Chapitre ${i + 1} : ${theme}.`];
    for (let k = 1; phrases.join(' ').length < 1600; k += 1) {
      phrases.push(`Point ${k} du chapitre ${i + 1} : les ${theme} exigent une rigueur constante.`);
    }
    return phrases.join(' ');
  };
  const COURS_LONG = THEMES.map(chapitre).join('\n\n');
  const COURS_KUBERNETES =
    'Les pods Kubernetes regroupent des conteneurs qui partagent le réseau. ' +
    'Un déploiement Kubernetes garantit le nombre de répliques demandé. ' +
    'Le service Kubernetes expose les pods derrière une adresse stable.';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let moduleId: string;
  const sup = { long: '', kube: '', autreModele: '' };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (methode: 'get' | 'post', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const deposer = async (contenu: string, nom: string): Promise<string> => {
    const res = await api('post', `/modules/${moduleId}/supports`, tokens.formateur)
      .attach('fichier', Buffer.from(contenu, 'utf8'), nom)
      .expect(202);
    return res.body.id as string;
  };

  const attendre = async <T>(
    lire: () => Promise<T>,
    fini: (v: T) => boolean,
    libelle: string,
  ): Promise<T> => {
    const fin = Date.now() + 25_000;
    for (;;) {
      const v = await lire();
      if (fini(v)) return v;
      if (Date.now() > fin) throw new Error(`${libelle} : délai dépassé (${JSON.stringify(v)})`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const attendreIndexe = (supportId: string): Promise<SupportPedagogique> =>
    attendre(
      () => supportRepository.findOneByOrFail({ id: supportId }),
      (s) => s.statut === StatutSupport.INDEXE,
      `Support ${supportId}`,
    );

  const attendreFin = (generationId: string): Promise<GenerationIa> =>
    attendre(
      () => generationRepository.findOneByOrFail({ id: generationId }),
      (g) => g.statut !== StatutGeneration.EN_COURS,
      `Génération ${generationId}`,
    );

  /**
   * Lance par l'API (202) puis attend la fin du worker, audit et email compris
   * (ils suivent la mise à jour du statut).
   */
  const generer = async (
    supportId: string,
    corps: Record<string, unknown> = {},
  ): Promise<GenerationIa> => {
    const emailsAvant = emails.mock.calls.length;
    const res = await api('post', `/modules/${moduleId}/generations`, tokens.formateur)
      .send({ supportId, nbQuestions: 4, types: ['QCU'], niveau: 'INTERMEDIAIRE', ...corps })
      .expect(202);
    const g = await attendreFin(res.body.id as string);
    await attendre(
      async () => emails.mock.calls.length,
      (n) => n > emailsAvant,
      'email de fin',
    );
    return g;
  };

  const suggestionsEnBase = (
    generationId: string,
  ): Promise<Array<{ ordre: number; type: string; statut: string }>> =>
    dataSource.query(
      'SELECT ordre, type, statut FROM suggestions_questions_ia WHERE generation_id = $1 ORDER BY ordre',
      [generationId],
    );

  const auditDe = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible } });

  /** Génération EN_COURS insérée directement (sans travail en file). */
  const insererEnCours = async (supportId: string, focus: string | null): Promise<string> => {
    const [{ id }] = (await dataSource.query(
      `INSERT INTO generations_ia
         (module_id, support_id, formateur_id, nb_questions_demandees, types_questions, niveau,
          focus_thematique, statut)
       VALUES ($1, $2, $3, 3, '{QCU}', 'AVANCE', $4, 'EN_COURS') RETURNING id`,
      [moduleId, supportId, ids.autre, focus],
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
        : await supportRepository.find({
            where: { moduleId: In(moduleIds) },
            select: { id: true },
          });
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
      await supportRepository.delete({ id: In(supports.map((s) => s.id)) });
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
    process.env.IA_TENTATIVES = '2';
    process.env.IA_BACKOFF_MS = '50';
    process.env.IA_GENERATIONS_PAR_HEURE = '50';
    process.env.LLM_FOURNISSEUR = 'factice';
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
    supportRepository = dataSource.getRepository(SupportPedagogique);
    redis = moduleRef.get(RedisService);
    pipeline = moduleRef.get(PipelineRagService);
    llm = moduleRef.get(FOURNISSEUR_LLM);
    emails = jest
      .spyOn(moduleRef.get(MailService), 'sendGenerationTermineeEmail')
      .mockResolvedValue();

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
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
          prenom: cle === 'formateur' ? 'Sami' : 'Test',
          nom: cle,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }

    const formation = await dataSource.getRepository(Formation).save(
      dataSource.getRepository(Formation).create({
        titre: `${MARQUEUR} Back-end`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    ids.formation = formation.id;
    await dataSource.getRepository(AffectationFormateur).save(
      dataSource.getRepository(AffectationFormateur).create({
        formationId: formation.id,
        formateurId: ids.formateur,
        affectePar: ids.admin,
      }),
    );
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save(
        dataSource
          .getRepository(ModuleFormation)
          .create({ formationId: formation.id, titre: 'Sécurité', ordre: 1 }),
      );
    moduleId = module.id;

    sup.long = await deposer(COURS_LONG, 'cours-complet.txt');
    sup.kube = await deposer(COURS_KUBERNETES, 'kubernetes.txt');
    sup.autreModele = await deposer(COURS_KUBERNETES + ' Version bis.', 'kubernetes-bis.txt');
    await attendreIndexe(sup.long);
    await attendreIndexe(sup.kube);
    await attendreIndexe(sup.autreModele);
  }, 90_000);

  afterAll(async () => {
    emails.mockRestore();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.IA_TENTATIVES;
    delete process.env.IA_BACKOFF_MS;
    delete process.env.IA_GENERATIONS_PAR_HEURE;
    delete process.env.LLM_FOURNISSEUR;
  });

  beforeEach(() => emails.mockClear());

  // ===================================================================
  //  Nominal
  // ===================================================================

  describe('Génération (nominal)', () => {
    let generation: GenerationIa;
    let segments: Array<{ ordre: number; texte: string }>;

    beforeAll(async () => {
      segments = await dataSource.query(
        'SELECT ordre, texte FROM segments_support WHERE support_id = $1 ORDER BY ordre',
        [sup.long],
      );
    });

    it('le support long est découpé en au moins dix passages', () => {
      expect(segments.length).toBeGreaterThanOrEqual(10);
    });

    it('TERMINEE : compteurs, modèle, une tentative, fin datée ; audit et email', async () => {
      generation = await generer(sup.long, {
        nbQuestions: 6,
        types: ['QCU', 'VRAI_FAUX', 'QCM'],
        focusThematique: 'sauvegardes nocturnes chiffrées',
      });
      expect(generation).toEqual(
        expect.objectContaining({
          statut: StatutGeneration.TERMINEE,
          nbSuggestions: 6,
          nbInvalides: 0,
          modeleLlm: 'factice-v1',
          nbTentatives: 1,
          derniereErreur: null,
        }),
      );
      expect(generation.dateFin).not.toBeNull();
      const [audit] = await auditDe('GENERATION_IA_TERMINEE', generation.id);
      expect(audit).toEqual(expect.objectContaining({ userId: null, resultat: 'Succès' }));
      expect(emails).toHaveBeenCalledWith(EMAIL.formateur, {
        prenom: 'Sami',
        titreSupport: 'cours-complet',
        formationId: ids.formation,
        reussie: true,
        nbSuggestions: 6,
        motif: undefined,
      });
    });

    it('recherche : les 8 passages les plus proches, celui du thème en premier', async () => {
      const [audit] = await auditDe('GENERATION_IA_TERMINEE', generation.id);
      const passages = (audit.detailsAvantApres as { passages: number[] }).passages;
      expect(passages).toHaveLength(8);
      expect(new Set(passages).size).toBe(8);
      const duTheme = segments.find((s) => s.texte.includes('Chapitre 7 : sauvegardes'));
      expect(passages[0]).toBe(duTheme?.ordre);
    });

    it('lecture : suggestions PROPOSEE dans l’ordre, conformes, ancrées dans les passages', async () => {
      const res = await api(
        'get',
        `/generations/${generation.id}/suggestions`,
        tokens.formateur,
      ).expect(200);
      const suggestions = res.body as Array<{
        ordre: number;
        type: string;
        enonce: string;
        options: Array<{ texte: string; estCorrecte: boolean }>;
        explication: string;
        scoreConfiance: number;
        passagesSources: number[];
        statut: string;
      }>;
      expect(suggestions.map((s) => s.ordre)).toEqual([1, 2, 3, 4, 5, 6]);
      // Types normalisés au lancement (QCU, QCM, VRAI_FAUX), servis à tour de rôle.
      expect(suggestions.map((s) => s.type)).toEqual([
        'QCU',
        'QCM',
        'VRAI_FAUX',
        'QCU',
        'QCM',
        'VRAI_FAUX',
      ]);
      for (const s of suggestions) {
        expect(s.statut).toBe('PROPOSEE');
        expect(s.scoreConfiance).toBeGreaterThan(0);
        expect(s.passagesSources).toHaveLength(1);
        const passage = segments.find((p) => p.ordre === s.passagesSources[0]);
        const correctes = s.options.filter((o) => o.estCorrecte);
        expect(correctes.length).toBeGreaterThanOrEqual(1);
        if (s.type !== 'QCM') expect(correctes).toHaveLength(1);
        if (s.type === 'VRAI_FAUX') expect(s.options.map((o) => o.texte)).toEqual(['Vrai', 'Faux']);
        else expect(passage?.texte).toContain(s.options[0].texte);
      }
      // La première question vient du passage le plus proche (le thème).
      expect(segments.find((p) => p.ordre === suggestions[0].passagesSources[0])?.texte).toContain(
        'sauvegardes nocturnes',
      );
      await api('get', `/generations/${generation.id}/suggestions`, tokens.admin).expect(200);
    });

    it('après la fin, le formateur peut relancer (plus de génération en cours)', async () => {
      const suivante = await generer(sup.long, { nbQuestions: 1 });
      expect(suivante.statut).toBe(StatutGeneration.TERMINEE);
    });

    it('seuls les passages du support ciblé servent, même si le thème parle d’un autre support', async () => {
      const g = await generer(sup.kube, {
        nbQuestions: 3,
        focusThematique: 'jetons JWT signature',
      });
      expect(g.statut).toBe(StatutGeneration.TERMINEE);
      const [audit] = await auditDe('GENERATION_IA_TERMINEE', g.id);
      const kube = (await dataSource.query(
        'SELECT ordre, texte FROM segments_support WHERE support_id = $1',
        [sup.kube],
      )) as Array<{ ordre: number; texte: string }>;
      expect((audit.detailsAvantApres as { passages: number[] }).passages).toEqual(
        kube.map((s) => s.ordre),
      );
      const res = await api('get', `/generations/${g.id}/suggestions`, tokens.formateur).expect(
        200,
      );
      for (const s of res.body as Array<{ options: Array<{ texte: string }> }>) {
        expect(kube.some((p) => p.texte.includes(s.options[0].texte))).toBe(true);
        expect(s.options[0].texte).not.toContain('JWT');
      }
    });

    it('questions non conformes : comptées, jamais enregistrées', async () => {
      const g = await generer(sup.long, {
        nbQuestions: 3,
        focusThematique: 'quiz [factice:invalides]',
      });
      expect(g).toEqual(
        expect.objectContaining({
          statut: StatutGeneration.TERMINEE,
          nbSuggestions: 3,
          nbInvalides: 2,
        }),
      );
      const enBase = await suggestionsEnBase(g.id);
      expect(enBase).toHaveLength(3);
      expect(enBase.every((s) => s.statut === 'PROPOSEE')).toBe(true);
    });
  });

  // ===================================================================
  //  Échecs
  // ===================================================================

  describe('Échecs', () => {
    it('aucune question conforme : deux tentatives puis ECHEC avec motif, audit, email', async () => {
      const g = await generer(sup.long, { focusThematique: 'docker [factice:vide]' });
      expect(g).toEqual(
        expect.objectContaining({
          statut: StatutGeneration.ECHEC,
          nbTentatives: 2,
          derniereErreur: MESSAGE_AUCUNE_VALIDE,
          nbSuggestions: null,
        }),
      );
      expect(g.dateFin).not.toBeNull();
      expect(await suggestionsEnBase(g.id)).toHaveLength(0);
      const [audit] = await auditDe('GENERATION_IA_ECHEC', g.id);
      expect(audit).toEqual(expect.objectContaining({ resultat: 'Échec', userId: null }));
      expect(await auditDe('GENERATION_IA_TERMINEE', g.id)).toHaveLength(0);
      expect(emails).toHaveBeenCalledWith(
        EMAIL.formateur,
        expect.objectContaining({ reussie: false, motif: MESSAGE_AUCUNE_VALIDE }),
      );
    });

    it('fournisseur en panne : deux tentatives puis ECHEC, motif générique (aucun détail technique)', async () => {
      const g = await generer(sup.long, { focusThematique: 'docker [factice:panne]' });
      expect(g).toEqual(
        expect.objectContaining({
          statut: StatutGeneration.ECHEC,
          nbTentatives: 2,
          derniereErreur: MESSAGE_ECHEC_GENERATION,
        }),
      );
      const [audit] = await auditDe('GENERATION_IA_ECHEC', g.id);
      expect((audit.detailsAvantApres as { detail: string }).detail).toContain('panne simulée');
    });

    it('support indexé avec un autre modèle d’embeddings : échec définitif dès la première tentative', async () => {
      await dataSource.query(
        "UPDATE supports_pedagogiques SET modele_embeddings = 'autre-modele-v9' WHERE id = $1",
        [sup.autreModele],
      );
      const g = await generer(sup.autreModele);
      expect(g).toEqual(
        expect.objectContaining({
          statut: StatutGeneration.ECHEC,
          nbTentatives: 1,
          derniereErreur: MESSAGE_MODELE_EMBEDDINGS,
        }),
      );
    });
  });

  // ===================================================================
  //  Accès à la lecture
  // ===================================================================

  describe('Lecture des suggestions : refus', () => {
    let generationId: string;
    beforeAll(async () => {
      const [g] = await generationRepository.find({
        where: { moduleId, statut: StatutGeneration.TERMINEE },
        take: 1,
      });
      generationId = g.id;
    });

    it('403 : formateur non affecté (tracé) et apprenant', async () => {
      await api('get', `/generations/${generationId}/suggestions`, tokens.autre).expect(403);
      await api('get', `/generations/${generationId}/suggestions`, tokens.apprenant).expect(403);
      expect(
        await auditLogRepository.count({
          where: { userId: ids.autre, resultat: 'Échec' },
        }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('404 : génération inconnue ; 400 : identifiant non UUID ; 401 sans jeton', async () => {
      await api('get', `/generations/${UUID_INCONNU}/suggestions`, tokens.admin).expect(404);
      await api('get', '/generations/abc/suggestions', tokens.admin).expect(400);
      await request(app.getHttpServer())
        .get(`/api/generations/${generationId}/suggestions`)
        .expect(401);
    });
  });

  // ===================================================================
  //  Garanties en base
  // ===================================================================

  describe('Garanties en base', () => {
    let generationId: string;
    beforeAll(async () => {
      generationId = await insererEnCours(sup.kube, null);
    });
    afterAll(async () => {
      await generationRepository.delete({ id: generationId });
    });

    const inserer = (
      ordre: number,
      enonce: string,
      type: string,
      options: unknown,
      score: number | null,
    ): Promise<unknown> =>
      dataSource.query(
        `INSERT INTO suggestions_questions_ia (generation_id, ordre, enonce, type, options, score_confiance)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [generationId, ordre, enonce, type, JSON.stringify(options), score],
      );
    const deux = [
      { texte: 'Vrai', estCorrecte: true },
      { texte: 'Faux', estCorrecte: false },
    ];
    const trois = [...deux, { texte: 'Autre', estCorrecte: false }];

    it('CHECK : ordre, énoncé, type, nombre d’options, Vrai/Faux à deux options, score', async () => {
      await expect(inserer(0, 'Énoncé assez long', 'QCU', deux, 0.5)).rejects.toThrow();
      await expect(inserer(1, 'Court', 'QCU', deux, 0.5)).rejects.toThrow();
      await expect(inserer(1, 'Énoncé assez long', 'OUVERTE', deux, 0.5)).rejects.toThrow();
      await expect(inserer(1, 'Énoncé assez long', 'QCU', [deux[0]], 0.5)).rejects.toThrow();
      await expect(
        inserer(1, 'Énoncé assez long', 'QCM', Array(7).fill(deux[0]), 0.5),
      ).rejects.toThrow();
      await expect(inserer(1, 'Énoncé assez long', 'VRAI_FAUX', trois, 0.5)).rejects.toThrow();
      await expect(inserer(1, 'Énoncé assez long', 'QCU', { a: 1 }, 0.5)).rejects.toThrow();
      await expect(inserer(1, 'Énoncé assez long', 'QCU', deux, 1.5)).rejects.toThrow();
      await expect(inserer(1, 'Énoncé assez long', 'QCU', deux, -0.1)).rejects.toThrow();
      await inserer(1, 'Énoncé assez long', 'VRAI_FAUX', deux, null);
      await inserer(2, 'Énoncé assez long', 'QCU', trois, 1);
    });

    it('unicité (génération, ordre) ; statut PROPOSEE par défaut ; cascade à la suppression', async () => {
      await expect(inserer(1, 'Énoncé encore plus long', 'QCU', deux, 0.5)).rejects.toThrow();
      const enBase = await suggestionsEnBase(generationId);
      expect(enBase.map((s) => s.statut)).toEqual(['PROPOSEE', 'PROPOSEE']);
      const temporaire = await insererEnCours(sup.kube, null).catch(() => null);
      expect(temporaire).toBeNull(); // une seule génération EN_COURS par formateur
      await dataSource.query('DELETE FROM generations_ia WHERE id = $1', [generationId]);
      expect(await suggestionsEnBase(generationId)).toHaveLength(0);
      generationId = await insererEnCours(sup.kube, null);
    });
  });

  // ===================================================================
  //  Concurrence FORCÉE
  // ===================================================================

  describe('Concurrence forcée', () => {
    afterEach(async () => {
      await dataSource.query('DELETE FROM generations_ia WHERE formateur_id = $1', [ids.autre]);
    });

    it('deux exécutions simultanées du même travail : un seul jeu de suggestions, un seul audit', async () => {
      const generationId = await insererEnCours(sup.long, 'index PostgreSQL');
      const resultats = await Promise.allSettled([
        pipeline.generer(generationId),
        pipeline.generer(generationId),
      ]);
      expect(resultats.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      const g = await generationRepository.findOneByOrFail({ id: generationId });
      expect(g.statut).toBe(StatutGeneration.TERMINEE);
      expect(g.nbSuggestions).toBe(3);
      expect(await suggestionsEnBase(generationId)).toHaveLength(3);
      expect(await auditDe('GENERATION_IA_TERMINEE', generationId)).toHaveLength(1);
      expect(emails).toHaveBeenCalledTimes(1);
    });

    it('génération passée en ECHEC pendant que le worker attend le verrou : aucun appel au modèle', async () => {
      const generationId = await insererEnCours(sup.long, 'index PostgreSQL');
      const appel = jest.spyOn(llm, 'genererQuestions');
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      try {
        await bloqueur.query('SELECT id FROM generations_ia WHERE id = $1 FOR UPDATE', [
          generationId,
        ]);
        const [{ pid: pidBloqueur }] = (await bloqueur.query(
          'SELECT pg_backend_pid() AS pid',
        )) as Array<{
          pid: number;
        }>;
        const travail = pipeline.generer(generationId);
        // Le worker est bien en attente du verrou tenu par le bloqueur.
        await attendre(
          async () =>
            (
              (await dataSource.query(
                'SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
                [pidBloqueur],
              )) as Array<{ n: number }>
            )[0].n,
          (n) => n >= 1,
          'attente du verrou',
        );
        await bloqueur.query(
          "UPDATE generations_ia SET statut = 'ECHEC', date_fin = now(), derniere_erreur = 'x' WHERE id = $1",
          [generationId],
        );
        await bloqueur.commitTransaction();
        await expect(travail).resolves.toBeUndefined();
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
        appel.mockRestore();
      }
      expect(appel).not.toHaveBeenCalled();
      const g = await generationRepository.findOneByOrFail({ id: generationId });
      expect(g).toEqual(
        expect.objectContaining({ statut: StatutGeneration.ECHEC, nbTentatives: 0 }),
      );
      expect(await suggestionsEnBase(generationId)).toHaveLength(0);
    });

    it('échec définitif simultané d’une génération terminée : rien ne change', async () => {
      const generationId = await insererEnCours(sup.long, 'index PostgreSQL');
      await pipeline.generer(generationId);
      emails.mockClear();
      await Promise.all([
        pipeline.echecDefinitif(generationId, new Error('tardif')),
        pipeline.echecDefinitif(generationId, new Error('tardif')),
      ]);
      const g = await generationRepository.findOneByOrFail({ id: generationId });
      expect(g.statut).toBe(StatutGeneration.TERMINEE);
      expect(await auditDe('GENERATION_IA_ECHEC', generationId)).toHaveLength(0);
      expect(emails).not.toHaveBeenCalled();
    });
  });
});
