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
 * Tests d'intégration US-QCM-02 — Importer des questions depuis la banque du
 * formateur, sur l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté + audit
 *    ACCES_RESSOURCE_REFUSE ; 404 QCM inconnu ; 400 paramètre inconnu ;
 *  - banque : questions des QCM du formateur seulement (pas celles d'un autre
 *    formateur), hors celles déjà dans le QCM cible, avec options, QCM
 *    d'origine et indicateur « figée » ; recherche insensible à la casse,
 *    `%` pris littéralement ; aucune correspondance -> message, QCM inchangé ;
 *  - import : LIAISON sans copie (même identifiant, aucune nouvelle ligne
 *    `questions`), en fin de QCM dans l'ordre demandé ; audit
 *    QUESTIONS_IMPORTEES ; 400 liste vide, question d'un autre formateur ou
 *    déjà liée (rien n'est lié) ; 409 QCM cible avec tentatives ;
 *  - question partagée : figée dès qu'UN de ses QCM a des tentatives (409 sur
 *    le contenu, explication modifiable) ; la retirer d'un QCM ne la supprime
 *    pas de l'autre ;
 *  - concurrence : 8 imports simultanés de la même question -> 1 × 200,
 *    7 × 400, une seule liaison ; 6 imports simultanés de questions distinctes
 *    -> rangs continus sans doublon.
 *
 * Marqueur `E2E-QCM02` (titres, énoncés) ; emails `e2e-qcm02-…`.
 */
describe('Banque de questions (e2e) — US-QCM-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-QCM02';
  const email = (cle: string): string => `e2e-qcm02-${cle}@cert-eet.local`;
  const CLES = ['formateur', 'autre', 'apprenant'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '88888888-8888-4888-8888-888888888888';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const q: Record<string, string> = {};

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const appel = (
    methode: 'get' | 'post' | 'put' | 'delete',
    url: string,
    corps?: object,
    token = tokens.formateur,
  ): request.Test => {
    const r = request(app.getHttpServer())
      [methode](`/api${url}`)
      .set('Authorization', `Bearer ${token}`);
    return corps === undefined ? r : r.send(corps);
  };
  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];
  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;

  const qcu = (enonce: string): Record<string, unknown> => ({
    enonce: `${MARQUEUR} ${enonce}`,
    type: 'QCU',
    explication: 'Voir le cours.',
    options: [
      { texte: 'Bonne', estCorrecte: true },
      { texte: 'Mauvaise', estCorrecte: false },
    ],
  });
  const creerQcm = async (
    moduleId: string,
    titre: string,
    token = tokens.formateur,
  ): Promise<string> =>
    (
      (await appel('post', `/modules/${moduleId}/qcm`, { titre: `${MARQUEUR} ${titre}` }, token)
        .expect(201)
        .then((r) => r.body)) as { id: string }
    ).id;
  const ajouter = async (
    qcmId: string,
    enonce: string,
    token = tokens.formateur,
  ): Promise<string> =>
    (
      (await appel('post', `/qcm/${qcmId}/questions`, qcu(enonce), token)
        .expect(201)
        .then((r) => r.body)) as { id: string }
    ).id;
  const liaisons = (qcmId: string): Promise<Array<{ question_id: string; ordre: number }>> =>
    sql(`SELECT question_id, ordre FROM qcm_questions WHERE qcm_id = $1 ORDER BY ordre`, [qcmId]);
  interface Banque {
    questions: Array<{
      id: string;
      enonce: string;
      figee: boolean;
      qcms: Array<{ id: string; titre: string }>;
      options: Array<{ texte: string; estCorrecte: boolean }>;
    }>;
    message: string | null;
  }
  const banque = async (qcmId: string, recherche?: string): Promise<Banque> => {
    const suffixe = recherche === undefined ? '' : `?recherche=${encodeURIComponent(recherche)}`;
    return (await appel('get', `/qcm/${qcmId}/banque${suffixe}`).expect(200)).body as Banque;
  };

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const qcms = (
      await sql<{ id: string }>(`SELECT id FROM qcm WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((x) => x.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...qcms],
      ]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE qcm_id = ANY($1)`, [qcms]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM qcm WHERE id = ANY($1)`, [qcms]);
      await qr.query(`DELETE FROM questions WHERE enonce LIKE $1`, [`${MARQUEUR}%`]);
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

  const tenter = async (qcmId: string): Promise<void> => {
    await sql(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_limite)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [ids.apprenant, qcmId],
    );
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
    const roles: Record<string, Role> = {
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
    };
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Banque',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(email(cle));
    }
    ids.f = await un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Back-end`],
    );
    ids.g = await un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Autre`],
    );
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2), ($3, $4)`,
      [ids.f, ids.formateur, ids.g, ids.autre],
    );
    await sql(`INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $2)`, [
      ids.apprenant,
      ids.f,
    ]);
    ids.m = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    ids.mG = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module G', 1) RETURNING id`,
      [ids.g],
    );

    // Source A : trois questions ; QCM tenté T : une question ; cible B : une
    // question propre ; QCM de l'autre formateur : une question.
    ids.a = await creerQcm(ids.m, 'Source A');
    q.rest = await ajouter(ids.a, 'Que signifie REST ?');
    q.http = await ajouter(ids.a, 'Quel verbe HTTP crée une ressource ?');
    q.pourcent = await ajouter(ids.a, 'Que vaut 100% de 2 ?');
    ids.t = await creerQcm(ids.m, 'Tenté');
    q.figee = await ajouter(ids.t, 'Question figée du QCM tenté');
    await tenter(ids.t);
    ids.b = await creerQcm(ids.m, 'Cible B');
    q.propre = await ajouter(ids.b, 'Question propre à B');
    ids.autreQcm = await creerQcm(ids.mG, 'De l’autre', tokens.autre);
    q.autre = await ajouter(ids.autreQcm, 'Question de l’autre formateur', tokens.autre);
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès', () => {
    it('401 ; 403 apprenant ; 403 non affecté tracé ; 404 QCM inconnu ; 400 paramètre', async () => {
      await request(app.getHttpServer()).get(`/api/qcm/${ids.b}/banque`).expect(401);
      await appel('get', `/qcm/${ids.b}/banque`, undefined, tokens.apprenant).expect(403);
      await appel(
        'post',
        `/qcm/${ids.b}/banque/import`,
        { questionIds: [q.rest] },
        tokens.autre,
      ).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1`,
        [ids.autre],
      );
      expect(n).toBeGreaterThanOrEqual(1);
      await appel('get', `/qcm/${INCONNU}/banque`).expect(404);
      await appel('get', `/qcm/${ids.b}/banque?inconnu=1`).expect(400);
      await appel('get', `/qcm/${ids.b}/banque?recherche=${'x'.repeat(201)}`).expect(400);
    });
  });

  describe('Consulter la banque', () => {
    it('questions du formateur seulement, hors QCM cible, avec options, origine, figée', async () => {
      const r = await banque(ids.b);
      const idsBanque = r.questions.map((x) => x.id);
      expect(idsBanque).toEqual(expect.arrayContaining([q.rest, q.http, q.pourcent, q.figee]));
      expect(idsBanque).not.toContain(q.propre);
      expect(idsBanque).not.toContain(q.autre);
      expect(r.message).toBeNull();
      const rest = r.questions.find((x) => x.id === q.rest)!;
      expect(rest.qcms).toEqual([{ id: ids.a, titre: `${MARQUEUR} Source A` }]);
      expect(rest.figee).toBe(false);
      expect(rest.options).toEqual([
        { texte: 'Bonne', estCorrecte: true, ordre: 1 },
        { texte: 'Mauvaise', estCorrecte: false, ordre: 2 },
      ]);
      expect(r.questions.find((x) => x.id === q.figee)!.figee).toBe(true);
    });

    it('recherche insensible à la casse ; « % » pris littéralement', async () => {
      expect((await banque(ids.b, 'rest')).questions.map((x) => x.id)).toEqual([q.rest]);
      expect((await banque(ids.b, '100%')).questions.map((x) => x.id)).toEqual([q.pourcent]);
      expect((await banque(ids.b, '%')).questions.map((x) => x.id)).toEqual([q.pourcent]);
    });

    it('aucune correspondance : message, QCM inchangé', async () => {
      const avant = await liaisons(ids.b);
      const r = await banque(ids.b, 'introuvable-xyz');
      expect(r).toEqual({
        questions: [],
        message: 'Aucune question de votre banque ne correspond.',
      });
      expect(await liaisons(ids.b)).toEqual(avant);
    });
  });

  describe('Importer', () => {
    it('liaison sans copie, en fin, dans l’ordre demandé ; audit', async () => {
      const [{ n: avant }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM questions WHERE enonce LIKE $1`,
        [`${MARQUEUR}%`],
      );
      const res = await appel('post', `/qcm/${ids.b}/banque/import`, {
        questionIds: [q.http, q.rest, q.http],
      }).expect(200);
      expect(res.body.questions.map((x: { id: string }) => x.id)).toEqual([
        q.propre,
        q.http,
        q.rest,
      ]);
      expect(await liaisons(ids.b)).toEqual([
        { question_id: q.propre, ordre: 1 },
        { question_id: q.http, ordre: 2 },
        { question_id: q.rest, ordre: 3 },
      ]);
      const [{ n: apres }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM questions WHERE enonce LIKE $1`,
        [`${MARQUEUR}%`],
      );
      expect(apres).toBe(avant);
      expect((await liaisons(ids.a)).map((l) => l.question_id)).toContain(q.rest);
      const traces = await sql<{ details: { questionIds: string[]; nombre: number } }>(
        `SELECT details_avant_apres AS details FROM audit_logs
          WHERE action = 'QUESTIONS_IMPORTEES' AND cible = $1 AND user_id = $2`,
        [ids.b, ids.formateur],
      );
      expect(traces).toHaveLength(1);
      expect(traces[0].details).toEqual({ questionIds: [q.http, q.rest], nombre: 2 });
      // La banque du QCM B ne les propose plus ; elle dit où elles servent.
      const r = await banque(ids.b);
      expect(r.questions.map((x) => x.id)).not.toContain(q.rest);
    });

    it('400 liste vide, question d’un autre formateur ou déjà liée : rien n’est lié', async () => {
      const avant = await liaisons(ids.b);
      await appel('post', `/qcm/${ids.b}/banque/import`, { questionIds: [] }).expect(400);
      await appel('post', `/qcm/${ids.b}/banque/import`, { questionIds: ['x'] }).expect(400);
      await appel('post', `/qcm/${ids.b}/banque/import`, {
        questionIds: [q.pourcent, q.autre],
      })
        .expect(400)
        .expect((r) => expect(r.body.message).toMatch(/ne font pas partie de votre banque/));
      await appel('post', `/qcm/${ids.b}/banque/import`, { questionIds: [q.rest] }).expect(400);
      await appel('post', `/qcm/${ids.b}/banque/import`, {
        questionIds: [q.pourcent],
        copie: true,
      }).expect(400);
      expect(await liaisons(ids.b)).toEqual(avant);
    });

    it('409 vers un QCM qui a des tentatives', async () => {
      await appel('post', `/qcm/${ids.t}/banque/import`, { questionIds: [q.pourcent] }).expect(409);
      expect((await liaisons(ids.t)).map((l) => l.question_id)).toEqual([q.figee]);
    });
  });

  describe('Question partagée', () => {
    it('figée dès qu’un de ses QCM a des tentatives ; explication modifiable', async () => {
      await appel('post', `/qcm/${ids.b}/banque/import`, { questionIds: [q.figee] }).expect(200);
      await appel('put', `/qcm/${ids.b}/questions/${q.figee}`, qcu('Énoncé changé'))
        .expect(409)
        .expect((r) => expect(r.body.message).toMatch(/aussi utilisée par un QCM/));
      await appel('put', `/qcm/${ids.b}/questions/${q.figee}`, {
        ...qcu('Question figée du QCM tenté'),
        explication: 'Nouvelle explication.',
      }).expect(200);
      const [ligne] = await sql<{ enonce: string; explication: string }>(
        `SELECT enonce, explication FROM questions WHERE id = $1`,
        [q.figee],
      );
      expect(ligne).toEqual({
        enonce: `${MARQUEUR} Question figée du QCM tenté`,
        explication: 'Nouvelle explication.',
      });
    });

    it('la retirer d’un QCM ne la supprime pas de l’autre', async () => {
      await appel('delete', `/qcm/${ids.b}/questions/${q.rest}`).expect(204);
      expect((await liaisons(ids.a)).map((l) => l.question_id)).toContain(q.rest);
      expect((await liaisons(ids.b)).map((l) => l.question_id)).not.toContain(q.rest);
      expect(await sql(`SELECT 1 FROM questions WHERE id = $1`, [q.rest])).toHaveLength(1);
    });
  });

  describe('Concurrence', () => {
    it('8 imports simultanés de la même question : un seul lien', async () => {
      const cible = await creerQcm(ids.m, 'Rafale 1');
      const codes = (
        await Promise.all(
          Array.from({ length: 8 }, () =>
            appel('post', `/qcm/${cible}/banque/import`, { questionIds: [q.http] }),
          ),
        )
      ).map((r) => r.status);
      expect(codes.filter((c) => c === 200)).toHaveLength(1);
      expect(codes.filter((c) => c === 400)).toHaveLength(7);
      expect(await liaisons(cible)).toEqual([{ question_id: q.http, ordre: 1 }]);
    });

    it('6 imports simultanés de questions distinctes : rangs 1 à 6 sans doublon', async () => {
      const source = await creerQcm(ids.m, 'Réserve');
      const reserve: string[] = [];
      for (let i = 0; i < 6; i++) reserve.push(await ajouter(source, `Réserve ${i}`));
      const cible = await creerQcm(ids.m, 'Rafale 2');
      const codes = (
        await Promise.all(
          reserve.map((id) => appel('post', `/qcm/${cible}/banque/import`, { questionIds: [id] })),
        )
      ).map((r) => r.status);
      expect(codes).toEqual(Array(6).fill(200));
      const l = await liaisons(cible);
      expect(l.map((x) => x.ordre)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(l.map((x) => x.question_id))).toEqual(new Set(reserve));
    });
  });
});
