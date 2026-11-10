import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';

/**
 * Tests d'intégration US-IA-05 — Traçabilité des générations IA, sur
 * l'application réelle. Les générations et suggestions sont posées en base
 * (le LLM n'est pas appelé) ; les DÉCISIONS passent par les vraies routes de
 * révision (US-IA-04), qui écrivent statut, auteur, date, question et audit.
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur ; 404 génération inconnue ; 400 filtres
 *    (UUID, statut, période inversée, limite, paramètre inconnu) ;
 *  - registre : formateur, formation, module, support, modèle, paramètres,
 *    dates, statut, décompte des décisions, erreur d'un échec ; filtres
 *    formateur / formation / statut / période ; pagination ;
 *  - détail : chaque suggestion avec sa décision (auteur, date, motif), la
 *    question créée et son origine IA / IA_MODIFIEE, le QCM cible ;
 *    historique d'audit (génération et décisions) dans l'ordre ;
 *  - lecture seule : aucune route d'écriture (404) ;
 *  - concurrence : 8 lectures du détail pendant une décision -> chaque
 *    réponse est cohérente (décompte = suggestions ; REJETEE <=> motif).
 *
 * Marqueur `E2E-TRACEIA` (titres) ; emails `e2e-traceia-…` ; générations de
 * la période réservée « mars 2005 » pour les filtres de date.
 */
describe('Traçabilité des générations IA (e2e) — US-IA-05', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-TRACEIA';
  const email = (cle: string): string => `e2e-traceia-${cle}@cert-eet.local`;
  const CLES = ['admin', 'f1', 'f2'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '55555555-5555-4555-8555-555555555555';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const sg: Record<string, string> = {};
  const OPTIONS = [
    { texte: 'HS256', estCorrecte: true },
    { texte: 'MD5', estCorrecte: false },
  ];

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const api = (
    methode: 'get' | 'post' | 'patch' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);
  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];
  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;

  const suggestion = (generationId: string, ordre: number, enonce: string): Promise<string> =>
    un(
      `INSERT INTO suggestions_questions_ia
         (generation_id, ordre, enonce, type, options, explication, score_confiance, passages_sources)
       VALUES ($1, $2, $3, 'QCU', $4::jsonb, 'Voir le passage 1.', 0.8, '{1}') RETURNING id`,
      [generationId, ordre, `${MARQUEUR} ${enonce}`, JSON.stringify(OPTIONS)],
    );

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const generations = (
      await sql<{ id: string }>(
        `SELECT g.id FROM generations_ia g JOIN modules m ON m.id = g.module_id WHERE m.formation_id = ANY($1)`,
        [formations],
      )
    ).map((g) => g.id);
    const suggestions = (
      await sql<{ id: string; question_id: string | null }>(
        `SELECT id, question_id FROM suggestions_questions_ia WHERE generation_id = ANY($1)`,
        [generations],
      )
    ).map((s) => s.id);
    const qcms = (
      await sql<{ id: string }>(`SELECT id FROM qcm WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((q) => q.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...generations, ...suggestions, ...qcms],
      ]);
      await qr.query(`DELETE FROM generations_ia WHERE id = ANY($1)`, [generations]);
      const questions = (
        (await qr.query(`SELECT question_id AS id FROM qcm_questions WHERE qcm_id = ANY($1)`, [
          qcms,
        ])) as Array<{ id: string }>
      ).map((q) => q.id);
      await qr.query(`DELETE FROM qcm WHERE id = ANY($1)`, [qcms]);
      await qr.query(`DELETE FROM questions WHERE id = ANY($1) OR enonce LIKE $2`, [
        questions,
        `${MARQUEUR}%`,
      ]);
      await qr.query(
        `DELETE FROM supports_pedagogiques WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
        [formations],
      );
      await qr.query(`DELETE FROM modules WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formations WHERE id = ANY($1)`, [formations]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
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
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: cle === 'admin' ? Role.ADMINISTRATEUR : Role.FORMATEUR,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Trace',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(email(cle));
    }
    for (const [cle, titre, formateur] of [
      ['fA', 'Sécurité', 'f1'],
      ['fB', 'Docker', 'f2'],
    ]) {
      ids[cle] = await un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`],
      );
      await sql(
        `INSERT INTO formation_formateurs (formation_id, formateur_id, affecte_par) VALUES ($1, $2, $3)`,
        [ids[cle], ids[formateur], ids.admin],
      );
      ids[`m${cle}`] = await un(
        `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, $2, 1) RETURNING id`,
        [ids[cle], `Module ${titre}`],
      );
      ids[`s${cle}`] = await un(
        `INSERT INTO supports_pedagogiques
           (module_id, depose_par, titre, nom_original, extension, taille_octets, sha256,
            cle_stockage, statut, nb_segments, nb_caracteres, modele_embeddings, date_indexation)
         VALUES ($1, $2, $3, 'cours.txt', 'txt', 100, $4, $5, 'INDEXE', 1, 100, 'hachage-lexical-v1', now())
         RETURNING id`,
        [
          ids[`m${cle}`],
          ids[formateur],
          `Cours ${titre}`,
          '7'.repeat(64),
          `supports/${ids[`m${cle}`]}/e2e-traceia/original.txt`,
        ],
      );
    }
    ids.qcm = (
      await api('post', `/modules/${ids.mfA}/qcm`, tokens.f1)
        .send({ titre: `${MARQUEUR} Quiz JWT` })
        .expect(201)
    ).body.id as string;

    // G1 : terminée, 3 suggestions (une acceptée, une modifiée, une rejetée) + 1 en attente.
    ids.g1 = await un(
      `INSERT INTO generations_ia
         (module_id, support_id, formateur_id, nb_questions_demandees, types_questions, niveau,
          focus_thematique, statut, nb_suggestions, nb_invalides, modele_llm, nb_tentatives,
          date_lancement, date_fin)
       VALUES ($1, $2, $3, 4, '{QCU}', 'INTERMEDIAIRE', 'Signature des jetons', 'TERMINEE', 4, 1,
               'claude-test-v1', 1, '2005-03-10T09:00:00Z', '2005-03-10T09:01:00Z')
       RETURNING id`,
      [ids.mfA, ids.sfA, ids.f1],
    );
    // G2 : en échec, autre formateur, autre formation, plus ancienne.
    ids.g2 = await un(
      `INSERT INTO generations_ia
         (module_id, support_id, formateur_id, nb_questions_demandees, types_questions, niveau,
          statut, modele_llm, nb_tentatives, derniere_erreur, date_lancement, date_fin)
       VALUES ($1, $2, $3, 5, '{QCU,VRAI_FAUX}', 'DEBUTANT', 'ECHEC', 'claude-test-v1', 3,
               'Fournisseur LLM indisponible.', '2005-03-02T09:00:00Z', '2005-03-02T09:05:00Z')
       RETURNING id`,
      [ids.mfB, ids.sfB, ids.f2],
    );
    await sql(
      `INSERT INTO audit_logs (action, user_id, cible, resultat, details_avant_apres, horodatage)
       VALUES ('GENERATION_IA_TERMINEE', NULL, $1, 'Succès', '{"nbSuggestions": 4}', '2005-03-10T09:01:00Z')`,
      [ids.g1],
    );
    sg.acceptee = await suggestion(ids.g1, 1, 'Quel algorithme signe un jeton ?');
    sg.modifiee = await suggestion(ids.g1, 2, 'Que contient la charge utile ?');
    sg.rejetee = await suggestion(ids.g1, 3, 'Question hors sujet ?');
    sg.attente = await suggestion(ids.g1, 4, 'Question encore proposée ?');
    await api('post', `/suggestions/${sg.acceptee}/accepter`, tokens.f1)
      .send({ qcmId: ids.qcm })
      .expect(201);
    await api('post', `/suggestions/${sg.modifiee}/accepter`, tokens.f1)
      .send({
        qcmId: ids.qcm,
        question: {
          enonce: `${MARQUEUR} Que contient la charge utile d’un JWT ?`,
          type: 'QCU',
          options: [
            { texte: 'Les revendications', estCorrecte: true },
            { texte: 'La clé privée', estCorrecte: false },
          ],
        },
      })
      .expect(201);
    await api('post', `/suggestions/${sg.rejetee}/rejeter`, tokens.f1)
      .send({ motif: 'Hors sujet pour ce module.' })
      .expect(200);
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et validation', () => {
    it('401 ; 403 formateur ; 404 inconnue ; 400 filtres', async () => {
      await request(app.getHttpServer()).get('/api/admin/generations-ia').expect(401);
      await api('get', '/admin/generations-ia', tokens.f1).expect(403);
      await api('get', `/admin/generations-ia/${ids.g1}`, tokens.f1).expect(403);
      await api('get', `/admin/generations-ia/${INCONNU}`, tokens.admin).expect(404);
      for (const q of [
        'formateurId=abc',
        'statut=FINIE',
        'du=2005-03-31T00:00:00Z&au=2005-03-01T00:00:00Z',
        'limite=101',
        'page=0',
        'inconnu=1',
      ]) {
        await api('get', `/admin/generations-ia?${q}`, tokens.admin).expect(400);
      }
    });
  });

  describe('Registre', () => {
    it('période réservée : 2 générations, les plus récentes d’abord, tout ce qui est tracé', async () => {
      const res = await api(
        'get',
        '/admin/generations-ia?du=2005-03-01T00:00:00Z&au=2005-03-31T23:59:59Z',
        tokens.admin,
      ).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.generations.map((g: { id: string }) => g.id)).toEqual([ids.g1, ids.g2]);
      const [g1, g2] = res.body.generations;
      expect(g1).toMatchObject({
        statut: 'TERMINEE',
        modeleLlm: 'claude-test-v1',
        parametres: {
          nbQuestionsDemandees: 4,
          types: ['QCU'],
          niveau: 'INTERMEDIAIRE',
          focusThematique: 'Signature des jetons',
        },
        nbSuggestions: 4,
        nbInvalides: 1,
        formateur: { id: ids.f1, prenom: 'F1', nom: 'Trace', email: email('f1') },
        formation: { id: ids.fA, titre: `${MARQUEUR} Sécurité` },
        module: { id: ids.mfA, titre: 'Module Sécurité' },
        support: { id: ids.sfA, titre: 'Cours Sécurité' },
        decisions: { proposees: 1, acceptees: 1, modifiees: 1, rejetees: 1 },
      });
      expect(g2).toMatchObject({
        statut: 'ECHEC',
        nbTentatives: 3,
        derniereErreur: 'Fournisseur LLM indisponible.',
        decisions: { proposees: 0, acceptees: 0, modifiees: 0, rejetees: 0 },
      });
    });

    it('filtres formateur, formation, statut ; pagination', async () => {
      const periode = 'du=2005-03-01T00:00:00Z&au=2005-03-31T23:59:59Z';
      const ids1 = async (q: string): Promise<string[]> =>
        (
          await api('get', `/admin/generations-ia?${q}`, tokens.admin).expect(200)
        ).body.generations.map((g: { id: string }) => g.id);
      expect(await ids1(`formateurId=${ids.f2}`)).toEqual([ids.g2]);
      expect(await ids1(`formationId=${ids.fA}`)).toEqual([ids.g1]);
      expect(await ids1(`${periode}&statut=ECHEC`)).toEqual([ids.g2]);
      const page2 = await api(
        'get',
        `/admin/generations-ia?${periode}&limite=1&page=2`,
        tokens.admin,
      ).expect(200);
      expect(page2.body).toMatchObject({ total: 2, page: 2, limite: 1 });
      expect(page2.body.generations.map((g: { id: string }) => g.id)).toEqual([ids.g2]);
    });
  });

  describe('Détail', () => {
    it('décisions, questions créées et leur origine, historique d’audit dans l’ordre', async () => {
      const res = await api('get', `/admin/generations-ia/${ids.g1}`, tokens.admin).expect(200);
      const par = Object.fromEntries(
        res.body.suggestions.map((s: { id: string }) => [s.id, s]),
      ) as Record<string, Record<string, unknown>>;
      expect(res.body.suggestions.map((s: { ordre: number }) => s.ordre)).toEqual([1, 2, 3, 4]);
      expect(par[sg.acceptee]).toMatchObject({
        statut: 'ACCEPTEE',
        decidePar: { id: ids.f1, email: email('f1') },
        question: { origine: 'IA' },
        qcm: { id: ids.qcm, titre: `${MARQUEUR} Quiz JWT` },
        motifRejet: null,
      });
      expect(par[sg.modifiee]).toMatchObject({
        statut: 'MODIFIEE',
        question: { origine: 'IA_MODIFIEE' },
      });
      expect(par[sg.rejetee]).toMatchObject({
        statut: 'REJETEE',
        motifRejet: 'Hors sujet pour ce module.',
        question: null,
        decidePar: { id: ids.f1 },
      });
      expect(par[sg.attente]).toMatchObject({
        statut: 'PROPOSEE',
        decidePar: null,
        dateDecision: null,
      });
      expect(par[sg.acceptee].dateDecision).not.toBeNull();
      // La question acceptée existe bien, avec son origine, dans le QCM.
      const [q] = await sql<{ origine: string }>(
        `SELECT origine::text AS origine FROM questions WHERE id = $1`,
        [(par[sg.acceptee].question as { id: string }).id],
      );
      expect(q.origine).toBe('IA');
      const actions = res.body.historique.map((h: { action: string }) => h.action);
      expect(actions[0]).toBe('GENERATION_IA_TERMINEE');
      expect([...actions].slice(1).sort()).toEqual([
        'SUGGESTION_ACCEPTEE',
        'SUGGESTION_MODIFIEE',
        'SUGGESTION_REJETEE',
      ]);
      const horodatages = res.body.historique.map((h: { horodatage: string }) =>
        new Date(h.horodatage).getTime(),
      );
      expect(horodatages).toEqual([...horodatages].sort((a, b) => a - b));
      expect(res.body.historique[1].acteur).toMatchObject({ id: ids.f1 });
    });

    it('lecture seule : aucune route d’écriture', async () => {
      await api('delete', `/admin/generations-ia/${ids.g1}`, tokens.admin).expect(404);
      await api('patch', `/admin/generations-ia/${ids.g1}`, tokens.admin).send({}).expect(404);
      await api('post', '/admin/generations-ia', tokens.admin).send({}).expect(404);
    });
  });

  describe('Concurrence', () => {
    it('8 lectures pendant une décision : chaque réponse est cohérente', async () => {
      const [decision, ...lectures] = await Promise.all([
        api('post', `/suggestions/${sg.attente}/rejeter`, tokens.f1).send({
          motif: 'Doublon d’une autre question.',
        }),
        ...Array.from({ length: 8 }, () =>
          api('get', `/admin/generations-ia/${ids.g1}`, tokens.admin),
        ),
      ]);
      expect(decision.status).toBe(200);
      for (const r of lectures) {
        expect(r.status).toBe(200);
        const d = r.body.decisions;
        expect(d.proposees + d.acceptees + d.modifiees + d.rejetees).toBe(4);
        for (const s of r.body.suggestions) {
          expect(s.statut === 'REJETEE').toBe(s.motifRejet !== null);
          expect(s.statut === 'PROPOSEE').toBe(s.decidePar === null);
        }
      }
      const fin = await api('get', `/admin/generations-ia/${ids.g1}`, tokens.admin).expect(200);
      expect(fin.body.decisions).toEqual({ proposees: 0, acceptees: 1, modifiees: 1, rejetees: 2 });
    });
  });
});
