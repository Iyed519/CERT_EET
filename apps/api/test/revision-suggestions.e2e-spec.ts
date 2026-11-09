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
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { PipelineRagService } from '../src/modules/assistance-ia/generations/pipeline-rag.service';
import {
  MESSAGE_QCM_AUTRE_MODULE,
  MESSAGE_SUGGESTION_DECIDEE,
} from '../src/modules/assistance-ia/suggestions/revision.regles';

/**
 * Tests d'intégration US-IA-04 — Révision humaine des suggestions (DS-06 P3,
 * état *SuggestionQuestionIA*), sur l'application réelle (PostgreSQL).
 *
 * Couvre : accepter telle quelle (question IA en fin de QCM), accepter
 * modifiée (IA_MODIFIEE), version identique (reste IA), rejeter avec motif ;
 * audit SUGGESTION_ACCEPTEE / _MODIFIEE / _REJETEE ; état visible dans la
 * lecture des suggestions et l'origine dans l'éditeur de QCM ; une question IA
 * retouchée dans l'éditeur devient IA_MODIFIEE ; question retirée -> la
 * décision reste ; refus 400 (QCM d'un autre module, question non conforme,
 * motif trop long), 401, 403 tracé, 404, 409 (déjà décidée, formation
 * archivée, QCM déjà tenté) sans rien écrire ; garanties en base (CHECK,
 * déclencheur d'immuabilité) ; concurrence FORCÉE : deux décisions
 * simultanées sur la même suggestion -> une seule passe ; deux acceptations
 * simultanées vers le même QCM -> deux rangs distincts.
 *
 * Données : suggestions insérées en base (le pipeline est éprouvé par
 * E2E-IARAG ; son worker est neutralisé ici). Nettoyage rejouable (avant ET
 * après) : tentatives -> générations (suggestions en cascade) -> questions
 * des QCM -> supports -> formations -> audit -> utilisateurs.
 */
describe('Révision des suggestions IA (e2e) — US-IA-04', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-IAREV';
  const EMAIL = {
    admin: 'e2e-iarev-admin@cert-eet.local',
    formateur: 'e2e-iarev-form@cert-eet.local',
    autre: 'e2e-iarev-autre@cert-eet.local',
    apprenant: 'e2e-iarev-appr@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /** M : module de la génération ; N : autre module de la même formation. */
  const mod = { M: '', N: '' };
  const qcm = { M: '', N: '', tente: '' };
  let formationId: string;
  let supportId: string;
  let generationId: string;
  let ordreSuivant = 1;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'put' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const OPTIONS_QCU = [
    { texte: 'RS256', estCorrecte: true },
    { texte: 'MD5', estCorrecte: false },
    { texte: 'ROT13', estCorrecte: false },
  ];

  /** Une suggestion PROPOSEE de la génération, insérée en base. */
  const suggestion = async (
    enonce = `Quel algorithme signe un jeton JWT ? (${ordreSuivant})`,
    type = 'QCU',
    options: unknown[] = OPTIONS_QCU,
  ): Promise<string> => {
    const [{ id }] = (await dataSource.query(
      `INSERT INTO suggestions_questions_ia
         (generation_id, ordre, enonce, type, options, explication, score_confiance, passages_sources)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'Passage 2 du cours.', 0.8, '{2}') RETURNING id`,
      [generationId, ordreSuivant++, enonce, type, JSON.stringify(options)],
    )) as Array<{ id: string }>;
    return id;
  };

  const etat = async (
    suggestionId: string,
  ): Promise<{
    statut: string;
    question_id: string | null;
    qcm_id: string | null;
    decide_par: string | null;
    date_decision: Date | null;
    motif_rejet: string | null;
  }> =>
    (
      await dataSource.query(
        `SELECT statut, question_id, qcm_id, decide_par, date_decision, motif_rejet
           FROM suggestions_questions_ia WHERE id = $1`,
        [suggestionId],
      )
    )[0];

  const nbQuestions = async (qcmId: string): Promise<number> =>
    (
      (await dataSource.query('SELECT count(*)::int AS n FROM qcm_questions WHERE qcm_id = $1', [
        qcmId,
      ])) as Array<{ n: number }>
    )[0].n;

  const accepter = (
    suggestionId: string,
    corps: Record<string, unknown>,
    token = tokens.formateur,
  ): request.Test => api('post', `/suggestions/${suggestionId}/accepter`, token).send(corps);

  const rejeter = (
    suggestionId: string,
    corps: Record<string, unknown> = {},
    token = tokens.formateur,
  ): request.Test => api('post', `/suggestions/${suggestionId}/rejeter`, token).send(corps);

  const attendre = async (lire: () => Promise<number>, cible: number): Promise<void> => {
    const fin = Date.now() + 10_000;
    for (;;) {
      if ((await lire()) >= cible) return;
      if (Date.now() > fin) throw new Error('attente du verrou : délai dépassé');
      await new Promise((r) => setTimeout(r, 50));
    }
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
    const formations = (await dataSource.query('SELECT id FROM formations WHERE titre LIKE $1', [
      `${MARQUEUR}%`,
    ])) as Array<{ id: string }>;
    const fIds = formations.map((f) => f.id);
    const qcms = (await dataSource.query(
      `SELECT q.id FROM qcm q JOIN modules m ON m.id = q.module_id WHERE m.formation_id = ANY($1)`,
      [fIds],
    )) as Array<{ id: string }>;
    const qIds = qcms.map((q) => q.id);
    const suggestions = (await dataSource.query(
      `SELECT s.id FROM suggestions_questions_ia s
         JOIN generations_ia g ON g.id = s.generation_id
         JOIN modules m ON m.id = g.module_id WHERE m.formation_id = ANY($1)`,
      [fIds],
    )) as Array<{ id: string }>;
    const generations = (await dataSource.query(
      `SELECT g.id FROM generations_ia g JOIN modules m ON m.id = g.module_id
        WHERE m.formation_id = ANY($1)`,
      [fIds],
    )) as Array<{ id: string }>;
    await dataSource.query('DELETE FROM tentatives_qcm WHERE qcm_id = ANY($1)', [qIds]);
    await dataSource.query('DELETE FROM generations_ia WHERE id = ANY($1)', [
      generations.map((g) => g.id),
    ]);
    const questions = (await dataSource.query(
      'SELECT question_id FROM qcm_questions WHERE qcm_id = ANY($1)',
      [qIds],
    )) as Array<{ question_id: string }>;
    await dataSource.query('DELETE FROM qcm_questions WHERE qcm_id = ANY($1)', [qIds]);
    await dataSource.query('DELETE FROM questions WHERE id = ANY($1)', [
      questions.map((q) => q.question_id),
    ]);
    await dataSource.query('DELETE FROM qcm WHERE id = ANY($1)', [qIds]);
    await dataSource.query(
      `DELETE FROM supports_pedagogiques WHERE module_id IN
         (SELECT id FROM modules WHERE formation_id = ANY($1))`,
      [fIds],
    );
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    await purgeAudit([
      ...fIds,
      ...qIds,
      ...suggestions.map((s) => s.id),
      ...generations.map((g) => g.id),
      ...utilisateurs.map((u) => u.id),
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PipelineRagService)
      .useValue({ onApplicationBootstrap: (): void => undefined })
      .compile();
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
          prenom: 'Test',
          nom: cle,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }

    const formation = await dataSource.getRepository(Formation).save(
      dataSource.getRepository(Formation).create({
        titre: `${MARQUEUR} Sécurité`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    formationId = formation.id;
    await dataSource.getRepository(AffectationFormateur).save(
      dataSource.getRepository(AffectationFormateur).create({
        formationId,
        formateurId: ids.formateur,
        affectePar: ids.admin,
      }),
    );
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    mod.M = (await moduleRepo.save(moduleRepo.create({ formationId, titre: 'JWT', ordre: 1 }))).id;
    mod.N = (
      await moduleRepo.save(moduleRepo.create({ formationId, titre: 'Docker', ordre: 2 }))
    ).id;
    const creerQcm = async (moduleId: string, titre: string): Promise<string> => {
      const res = await api('post', `/modules/${moduleId}/qcm`, tokens.formateur)
        .send({ titre })
        .expect(201);
      return res.body.id as string;
    };
    qcm.M = await creerQcm(mod.M, 'Quiz JWT');
    qcm.N = await creerQcm(mod.N, 'Quiz Docker');
    qcm.tente = await creerQcm(mod.M, 'Quiz JWT déjà tenté');
    // Une question manuelle existe déjà : la question acceptée vient après.
    await api('post', `/qcm/${qcm.M}/questions`, tokens.formateur)
      .send({
        enonce: 'Question manuelle ?',
        type: 'VRAI_FAUX',
        options: [
          { texte: 'Vrai', estCorrecte: true },
          { texte: 'Faux', estCorrecte: false },
        ],
      })
      .expect(201);
    await dataSource.query(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_limite, statut)
       VALUES ($1, $2, now() + interval '1 hour', 'EN_COURS')`,
      [ids.apprenant, qcm.tente],
    );

    [{ id: supportId }] = (await dataSource.query(
      `INSERT INTO supports_pedagogiques
         (module_id, depose_par, titre, nom_original, extension, taille_octets, sha256,
          cle_stockage, statut, nb_segments, nb_caracteres, modele_embeddings, date_indexation)
       VALUES ($1, $2, 'Cours JWT', 'cours.txt', 'txt', 100, $3, $4, 'INDEXE', 1, 100,
               'hachage-lexical-v1', now())
       RETURNING id`,
      [mod.M, ids.formateur, '7'.repeat(64), `supports/${mod.M}/e2e-iarev/original.txt`],
    )) as Array<{ id: string }>;
    [{ id: generationId }] = (await dataSource.query(
      `INSERT INTO generations_ia
         (module_id, support_id, formateur_id, nb_questions_demandees, types_questions, niveau,
          statut, nb_suggestions, nb_invalides, modele_llm, nb_tentatives, date_fin)
       VALUES ($1, $2, $3, 20, '{QCU,QCM,VRAI_FAUX}', 'AVANCE', 'TERMINEE', 20, 0, 'factice-v1', 1, now())
       RETURNING id`,
      [mod.M, supportId, ids.formateur],
    )) as Array<{ id: string }>;
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Nominal
  // ===================================================================

  describe('Décisions (nominal)', () => {
    it('accepter telle quelle : question IA en fin de QCM, ACCEPTEE, audit', async () => {
      const id = await suggestion('Quel algorithme signe un jeton JWT ?');
      const res = await accepter(id, { qcmId: qcm.M }).expect(201);
      expect(res.body.suggestion).toEqual(
        expect.objectContaining({
          id,
          statut: 'ACCEPTEE',
          qcmId: qcm.M,
          decidePar: ids.formateur,
          motifRejet: null,
        }),
      );
      expect(res.body.suggestion.dateDecision).not.toBeNull();
      expect(res.body.question).toEqual(
        expect.objectContaining({
          enonce: 'Quel algorithme signe un jeton JWT ?',
          type: 'QCU',
          origine: 'IA',
          ordre: 2,
          explication: 'Passage 2 du cours.',
          niveauDifficulte: 'AVANCE',
          ponderation: 1,
        }),
      );
      expect(
        (res.body.question.options as Array<{ texte: string; estCorrecte: boolean }>).map((o) => [
          o.texte,
          o.estCorrecte,
        ]),
      ).toEqual([
        ['RS256', true],
        ['MD5', false],
        ['ROT13', false],
      ]);
      expect((await etat(id)).question_id).toBe(res.body.question.id);
      const detail = await api('get', `/qcm/${qcm.M}`, tokens.formateur).expect(200);
      expect(
        (detail.body.questions as Array<{ origine: string; enonce: string }>).map((q) => q.origine),
      ).toEqual(['MANUELLE', 'IA']);
      const [audit] = await auditLogRepository.find({
        where: { action: 'SUGGESTION_ACCEPTEE', cible: id },
      });
      expect(audit).toEqual(expect.objectContaining({ userId: ids.formateur, resultat: 'Succès' }));
      expect(audit.detailsAvantApres).toEqual({
        generationId,
        qcmId: qcm.M,
        questionId: res.body.question.id,
      });
      const lecture = await api(
        'get',
        `/generations/${generationId}/suggestions`,
        tokens.formateur,
      ).expect(200);
      expect(
        (lecture.body as Array<{ id: string; statut: string }>).find((s) => s.id === id)?.statut,
      ).toBe('ACCEPTEE');
    });

    it('accepter modifiée : IA_MODIFIEE, contenu du formateur, MODIFIEE, audit avant / après', async () => {
      const id = await suggestion('Quel algorithme symétrique signe un JWT ?');
      const res = await accepter(id, {
        qcmId: qcm.M,
        question: {
          enonce: 'Quels algorithmes signent un jeton JWT ?',
          type: 'QCM',
          ponderation: 2,
          options: [
            { texte: 'RS256', estCorrecte: true },
            { texte: 'HS256', estCorrecte: true },
            { texte: 'MD5', estCorrecte: false },
          ],
        },
      }).expect(201);
      expect(res.body.suggestion.statut).toBe('MODIFIEE');
      expect(res.body.question).toEqual(
        expect.objectContaining({
          enonce: 'Quels algorithmes signent un jeton JWT ?',
          type: 'QCM',
          origine: 'IA_MODIFIEE',
          ponderation: 2,
          explication: null,
        }),
      );
      const [audit] = await auditLogRepository.find({
        where: { action: 'SUGGESTION_MODIFIEE', cible: id },
      });
      expect(audit.detailsAvantApres).toEqual(
        expect.objectContaining({
          avant: { enonce: 'Quel algorithme symétrique signe un JWT ?', type: 'QCU', nbOptions: 3 },
          apres: { enonce: 'Quels algorithmes signent un jeton JWT ?', type: 'QCM', nbOptions: 3 },
        }),
      );
    });

    it('version renvoyée identique à la proposition : reste ACCEPTEE, origine IA', async () => {
      const id = await suggestion('Où vit le jeton de rafraîchissement ?');
      const res = await accepter(id, {
        qcmId: qcm.M,
        question: {
          enonce: '  Où vit le jeton de rafraîchissement ?  ',
          type: 'QCU',
          explication: 'Passage 2 du cours.',
          niveauDifficulte: 'AVANCE',
          options: OPTIONS_QCU,
        },
      }).expect(201);
      expect(res.body.suggestion.statut).toBe('ACCEPTEE');
      expect(res.body.question.origine).toBe('IA');
    });

    it('administrateur : peut décider', async () => {
      const id = await suggestion();
      await rejeter(id, {}, tokens.admin).expect(200);
      expect((await etat(id)).decide_par).toBe(ids.admin);
    });

    it('rejeter avec motif : REJETEE, motif nettoyé, audit ; rien dans le QCM', async () => {
      const id = await suggestion();
      const avant = await nbQuestions(qcm.M);
      const res = await rejeter(id, { motif: '  Hors   sujet  ' }).expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          statut: 'REJETEE',
          motifRejet: 'Hors sujet',
          questionId: null,
          qcmId: null,
          decidePar: ids.formateur,
        }),
      );
      expect(await nbQuestions(qcm.M)).toBe(avant);
      expect(await auditLogRepository.countBy({ action: 'SUGGESTION_REJETEE', cible: id })).toBe(1);
    });

    it('éditeur de QCM : une question IA retouchée devient IA_MODIFIEE', async () => {
      const id = await suggestion('Que contient la charge utile d’un JWT ?');
      const res = await accepter(id, { qcmId: qcm.M }).expect(201);
      const questionId = res.body.question.id as string;
      const modif = await api('put', `/qcm/${qcm.M}/questions/${questionId}`, tokens.formateur)
        .send({
          enonce: 'Que contient la charge utile (payload) d’un JWT ?',
          type: 'QCU',
          options: OPTIONS_QCU,
        })
        .expect(200);
      expect(modif.body.origine).toBe('IA_MODIFIEE');
      // La suggestion, elle, garde sa décision.
      expect((await etat(id)).statut).toBe('ACCEPTEE');
    });

    it('question retirée du QCM : la décision reste, le lien vers la question tombe', async () => {
      const id = await suggestion('Quelle durée de vie pour un jeton d’accès ?');
      const res = await accepter(id, { qcmId: qcm.M }).expect(201);
      await api(
        'delete',
        `/qcm/${qcm.M}/questions/${res.body.question.id}`,
        tokens.formateur,
      ).expect(204);
      expect(await etat(id)).toEqual(
        expect.objectContaining({ statut: 'ACCEPTEE', question_id: null, qcm_id: qcm.M }),
      );
    });
  });

  // ===================================================================
  //  Refus (rien n'est écrit)
  // ===================================================================

  describe('Refus (rien n’est écrit)', () => {
    let id: string;
    let avant: number;
    beforeAll(async () => {
      id = await suggestion('Quelle clé vérifie une signature RS256 ?');
    });
    beforeEach(async () => {
      avant = await nbQuestions(qcm.M);
    });
    afterEach(async () => {
      expect(await nbQuestions(qcm.M)).toBe(avant);
      expect((await etat(id)).statut).toBe('PROPOSEE');
    });

    it('400 : QCM d’un autre module', async () => {
      const res = await accepter(id, { qcmId: qcm.N }).expect(400);
      expect(res.body.message).toBe(MESSAGE_QCM_AUTRE_MODULE);
      expect(await nbQuestions(qcm.N)).toBe(0);
    });

    it('400 : version retouchée non conforme (règles de l’éditeur de QCM)', async () => {
      const res = await accepter(id, {
        qcmId: qcm.M,
        question: {
          enonce: 'Quelle clé vérifie une signature RS256 ?',
          type: 'QCU',
          options: [
            { texte: 'Publique', estCorrecte: true },
            { texte: 'Privée', estCorrecte: true },
          ],
        },
      }).expect(400);
      expect(res.body.message).toBe(
        'Une question à choix unique (QCU) doit avoir exactement une bonne réponse.',
      );
    });

    it.each([
      ['qcmId absent', {}],
      ['qcmId non UUID', { qcmId: 'abc' }],
      ['champ inconnu', { qcmId: UUID_INCONNU, statut: 'ACCEPTEE' }],
    ])('400 (accepter) : %s', async (_cas, corps) => {
      await accepter(id, corps).expect(400);
    });

    it('400 (rejeter) : motif trop long ; 400 : identifiant non UUID', async () => {
      await rejeter(id, { motif: 'x'.repeat(501) }).expect(400);
      await api('post', '/suggestions/abc/rejeter', tokens.formateur).send({}).expect(400);
    });

    it('404 : suggestion inconnue ; QCM inconnu', async () => {
      await rejeter(UUID_INCONNU).expect(404);
      await accepter(id, { qcmId: UUID_INCONNU }).expect(404);
    });

    it('401 sans jeton ; 403 : formateur non affecté (tracé) et apprenant', async () => {
      await request(app.getHttpServer()).post(`/api/suggestions/${id}/rejeter`).expect(401);
      await rejeter(id, {}, tokens.autre).expect(403);
      await accepter(id, { qcmId: qcm.M }, tokens.apprenant).expect(403);
      expect(
        await auditLogRepository.count({ where: { userId: ids.autre, resultat: 'Échec' } }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('409 : QCM déjà tenté (contenu figé)', async () => {
      await accepter(id, { qcmId: qcm.tente }).expect(409);
      expect(await nbQuestions(qcm.tente)).toBe(0);
    });

    it('409 : formation archivée (accepter et rejeter)', async () => {
      await dataSource.query("UPDATE formations SET statut = 'ARCHIVEE' WHERE id = $1", [
        formationId,
      ]);
      try {
        await accepter(id, { qcmId: qcm.M }).expect(409);
        await rejeter(id).expect(409);
      } finally {
        await dataSource.query("UPDATE formations SET statut = 'OUVERTE' WHERE id = $1", [
          formationId,
        ]);
      }
    });
  });

  describe('Une décision ne se prend qu’une fois', () => {
    it('409 : accepter ou rejeter une suggestion déjà décidée', async () => {
      const acceptee = await suggestion();
      await accepter(acceptee, { qcmId: qcm.M }).expect(201);
      const rejetee = await suggestion();
      await rejeter(rejetee).expect(200);
      const avant = await nbQuestions(qcm.M);
      for (const r of [
        await accepter(acceptee, { qcmId: qcm.M }).expect(409),
        await rejeter(acceptee).expect(409),
        await accepter(rejetee, { qcmId: qcm.M }).expect(409),
      ]) {
        expect(r.body.message).toBe(MESSAGE_SUGGESTION_DECIDEE);
      }
      expect(await nbQuestions(qcm.M)).toBe(avant);
      expect((await etat(rejetee)).statut).toBe('REJETEE');
    });
  });

  // ===================================================================
  //  Garanties en base
  // ===================================================================

  describe('Garanties en base', () => {
    it('une suggestion naît PROPOSEE', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO suggestions_questions_ia (generation_id, ordre, enonce, type, options, statut)
           VALUES ($1, 900, 'Énoncé assez long', 'QCU', $2::jsonb, 'ACCEPTEE')`,
          [generationId, JSON.stringify(OPTIONS_QCU)],
        ),
      ).rejects.toThrow(/naît PROPOSEE/);
    });

    it('PROPOSEE : jamais reliée à une question ni à un QCM, sans décideur', async () => {
      const id = await suggestion();
      const [{ question_id: questionId }] = (await dataSource.query(
        `SELECT question_id FROM qcm_questions WHERE qcm_id = $1 LIMIT 1`,
        [qcm.M],
      )) as Array<{ question_id: string }>;
      for (const [colonne, valeur] of [
        ['qcm_id', qcm.M],
        ['question_id', questionId],
        ['decide_par', ids.formateur],
        ['motif_rejet', 'x'],
      ]) {
        await expect(
          dataSource.query(`UPDATE suggestions_questions_ia SET ${colonne} = $2 WHERE id = $1`, [
            id,
            valeur,
          ]),
        ).rejects.toThrow(/CHK_suggestions_decision/);
      }
    });

    it('décision incomplète refusée ; REJETEE sans question ni QCM', async () => {
      const id = await suggestion();
      await expect(
        dataSource.query(`UPDATE suggestions_questions_ia SET statut = 'ACCEPTEE' WHERE id = $1`, [
          id,
        ]),
      ).rejects.toThrow(/CHK_suggestions_decision/);
      await expect(
        dataSource.query(
          `UPDATE suggestions_questions_ia
              SET statut = 'REJETEE', decide_par = $2, date_decision = now(), qcm_id = $3
            WHERE id = $1`,
          [id, ids.formateur, qcm.M],
        ),
      ).rejects.toThrow(/CHK_suggestions_decision/);
      await expect(
        dataSource.query(
          `UPDATE suggestions_questions_ia
              SET statut = 'REJETEE', decide_par = $2, date_decision = now(), motif_rejet = '  '
            WHERE id = $1`,
          [id, ids.formateur],
        ),
      ).rejects.toThrow(/CHK_suggestions_motif_rejet/);
    });

    it('contenu immuable, même PROPOSEE', async () => {
      const id = await suggestion();
      for (const changement of [
        "enonce = 'Un autre énoncé assez long'",
        "options = '[]'::jsonb",
        'score_confiance = 0.1',
        'ordre = 999',
      ]) {
        await expect(
          dataSource.query(`UPDATE suggestions_questions_ia SET ${changement} WHERE id = $1`, [id]),
        ).rejects.toThrow(/ne change pas/);
      }
    });

    it('décidée : immuable (statut, décideur, motif, nouveau lien)', async () => {
      const id = await suggestion();
      await rejeter(id, { motif: 'Doublon' }).expect(200);
      for (const changement of [
        "statut = 'PROPOSEE', decide_par = NULL, date_decision = NULL, motif_rejet = NULL",
        "motif_rejet = 'Autre motif'",
        `decide_par = '${ids.admin}'`,
        "date_decision = now() + interval '1 day'",
      ]) {
        await expect(
          dataSource.query(`UPDATE suggestions_questions_ia SET ${changement} WHERE id = $1`, [id]),
        ).rejects.toThrow(/déjà décidée ne change plus/);
      }
      const acceptee = await suggestion();
      await accepter(acceptee, { qcmId: qcm.M }).expect(201);
      await expect(
        dataSource.query(`UPDATE suggestions_questions_ia SET qcm_id = $2 WHERE id = $1`, [
          acceptee,
          qcm.N,
        ]),
      ).rejects.toThrow(/déjà décidée ne change plus/);
    });

    it('une question ne vient que d’une suggestion (unicité)', async () => {
      const a = await suggestion();
      const res = await accepter(a, { qcmId: qcm.M }).expect(201);
      const b = await suggestion();
      await expect(
        dataSource.query(
          `UPDATE suggestions_questions_ia
              SET statut = 'ACCEPTEE', decide_par = $2, date_decision = now(), question_id = $3
            WHERE id = $1`,
          [b, ids.formateur, res.body.question.id],
        ),
      ).rejects.toThrow(/UQ_suggestions_question/);
    });

    it('origine : MANUELLE par défaut, valeurs fermées', async () => {
      const [{ origine }] = (await dataSource.query(
        `SELECT q.origine FROM questions q JOIN qcm_questions l ON l.question_id = q.id
          WHERE l.qcm_id = $1 AND l.ordre = 1`,
        [qcm.M],
      )) as Array<{ origine: string }>;
      expect(origine).toBe('MANUELLE');
      await expect(dataSource.query("SELECT 'GPT'::questions_origine_enum")).rejects.toThrow(
        /invalid input value/,
      );
    });
  });

  // ===================================================================
  //  Concurrence FORCÉE
  // ===================================================================

  describe('Concurrence forcée', () => {
    /** Tient le verrou d'une ligne pendant que des requêtes arrivent, puis le rend. */
    const sousVerrou = async (
      sql: string,
      parametres: unknown[],
      attendues: number,
      envoyer: () => Promise<request.Response>[],
    ): Promise<request.Response[]> => {
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      try {
        await bloqueur.query(sql, parametres);
        const [{ pid }] = (await bloqueur.query('SELECT pg_backend_pid() AS pid')) as Array<{
          pid: number;
        }>;
        const reponses = Promise.all(envoyer());
        await attendre(
          async () =>
            (
              (await dataSource.query(
                // Le second attend derrière le premier (file du verrou de ligne) :
                // on compte toute session bloquée par le bloqueur ou par une autre.
                `SELECT count(*)::int AS n FROM pg_stat_activity
                  WHERE datname = current_database() AND pid <> $1
                    AND cardinality(pg_blocking_pids(pid)) > 0`,
                [pid],
              )) as Array<{ n: number }>
            )[0].n,
          attendues,
        );
        await bloqueur.commitTransaction();
        return await reponses;
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
    };

    it('deux décisions simultanées sur la même suggestion : une seule passe', async () => {
      const id = await suggestion();
      const avant = await nbQuestions(qcm.M);
      const reponses = await sousVerrou(
        'SELECT id FROM suggestions_questions_ia WHERE id = $1 FOR UPDATE',
        [id],
        2,
        () => [accepter(id, { qcmId: qcm.M }), rejeter(id)].map((r) => r.then((x) => x)),
      );
      const statuts = reponses.map((r) => r.status).sort();
      expect(statuts.filter((s) => s === 409)).toHaveLength(1);
      expect(statuts.some((s) => s === 200 || s === 201)).toBe(true);
      const final = await etat(id);
      expect(await nbQuestions(qcm.M)).toBe(avant + (final.statut === 'ACCEPTEE' ? 1 : 0));
      const decisions = await auditLogRepository.count({
        where: { cible: id, action: In(['SUGGESTION_ACCEPTEE', 'SUGGESTION_REJETEE']) },
      });
      expect(decisions).toBe(1);
    });

    it('deux acceptations simultanées de la même suggestion : un 201, un 409, une question', async () => {
      const id = await suggestion();
      const avant = await nbQuestions(qcm.M);
      const reponses = await sousVerrou(
        'SELECT id FROM suggestions_questions_ia WHERE id = $1 FOR UPDATE',
        [id],
        2,
        () =>
          [accepter(id, { qcmId: qcm.M }), accepter(id, { qcmId: qcm.M })].map((r) =>
            r.then((x) => x),
          ),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await nbQuestions(qcm.M)).toBe(avant + 1);
    });

    it('deux acceptations simultanées vers le même QCM : deux rangs distincts', async () => {
      const a = await suggestion();
      const b = await suggestion();
      const reponses = await sousVerrou(
        'SELECT id FROM qcm WHERE id = $1 FOR UPDATE',
        [qcm.M],
        2,
        () =>
          [accepter(a, { qcmId: qcm.M }), accepter(b, { qcmId: qcm.M })].map((r) =>
            r.then((x) => x),
          ),
      );
      expect(reponses.map((r) => r.status)).toEqual([201, 201]);
      const ordres = (await dataSource.query(
        'SELECT ordre FROM qcm_questions WHERE qcm_id = $1 ORDER BY ordre',
        [qcm.M],
      )) as Array<{ ordre: number }>;
      expect(new Set(ordres.map((o) => o.ordre)).size).toBe(ordres.length);
      expect(ordres.map((o) => o.ordre)).toEqual(ordres.map((_o, i) => i + 1));
    });
  });
});
