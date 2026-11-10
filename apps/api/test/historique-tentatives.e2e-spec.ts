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
 * Tests d'intégration US-QCM-11 — Historique complet et immuable des
 * tentatives, sur l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur sur l'historique apprenant ; 403 apprenant et
 *    formateur non affecté (tracé) sur l'historique formateur ; 404 QCM
 *    inconnu ; 400 filtre invalide ;
 *  - apprenant : ses tentatives seulement, les plus récentes d'abord, rang,
 *    statut, dates, durée effective, score une fois notée, nombre de réponses ;
 *    filtre par QCM ; détail (questions vues, options cochées) SANS bonne
 *    réponse ni explication, état du corrigé ; tentative EN_COURS sans contenu ;
 *    tentative d'un autre -> 404 ;
 *  - formateur affecté : toutes les tentatives du QCM avec l'apprenant, filtre
 *    par apprenant, rang par apprenant ; détail avec corrigé (bonnes réponses,
 *    cochées, points) ; tentative d'un autre QCM -> 404 ;
 *  - immuabilité : aucune route de modification (404) ; une tentative notée
 *    refuse toute modification en base (déclencheur d'US-QCM-08) ;
 *  - concurrence : 8 lectures simultanées pendant une soumission -> chaque
 *    ligne est cohérente (EN_COURS sans score, ou NOTEE avec score).
 *
 * Marqueur `E2E-HISTO` (titres, énoncés) ; emails `e2e-histo-…`.
 */
describe('Historique des tentatives (e2e) — US-QCM-11', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-HISTO';
  const email = (cle: string): string => `e2e-histo-${cle}@cert-eet.local`;
  const CLES = ['formateur', 'autre', 'a', 'b'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '99999999-9999-4999-8999-999999999999';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const t: Record<string, string> = {};
  const questions: Array<{ id: string; bonne: string; fausse: string }> = [];

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const appel = (
    methode: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    token: string,
    corps?: object,
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

  /** Aucune bonne réponse ni explication dans ce corps, à aucune profondeur. */
  const sansFuite = (corps: unknown): void => {
    const texte = JSON.stringify(corps);
    expect(texte).not.toContain('estCorrecte');
    expect(texte).not.toContain('explication');
    expect(texte).not.toContain('Explication');
    expect(texte).not.toContain('pointsObtenus');
  };

  const demarrer = async (cle: string, qcmId: string): Promise<string> =>
    (
      (await appel('post', `/qcm/${qcmId}/tentatives`, tokens[cle])
        .expect(201)
        .then((r) => r.body)) as { id: string }
    ).id;
  const repondre = (cle: string, tentativeId: string, questionId: string, optionIds: string[]) =>
    appel('put', `/tentatives/${tentativeId}/reponses/${questionId}`, tokens[cle], {
      optionIds,
    }).expect(200);
  const soumettre = (cle: string, tentativeId: string): request.Test =>
    appel('post', `/tentatives/${tentativeId}/soumettre`, tokens[cle]);

  /** QCM publié, 3 QCU (pondération 1), affichage différé, fenêtre ouverte. */
  const creerQcm = async (titre: string, nbTentativesMax: number): Promise<string> => {
    const qcm = await un(
      `INSERT INTO qcm (module_id, titre, statut, formateur_id) VALUES ($1, $2, 'PUBLIE', $3) RETURNING id`,
      [ids.m, `${MARQUEUR} ${titre}`, ids.formateur],
    );
    for (let i = 1; i <= 3; i++) {
      const q = await un(
        `INSERT INTO questions (enonce, type, ponderation, explication)
         VALUES ($1, 'QCU', 1, 'Explication du cours') RETURNING id`,
        [`${MARQUEUR} ${titre} question ${i}`],
      );
      const bonne = await un(
        `INSERT INTO options (question_id, texte, ordre, est_correcte) VALUES ($1, 'Alpha', 1, true) RETURNING id`,
        [q],
      );
      const fausse = await un(
        `INSERT INTO options (question_id, texte, ordre, est_correcte) VALUES ($1, 'Bravo', 2, false) RETURNING id`,
        [q],
      );
      await sql(`INSERT INTO qcm_questions (qcm_id, question_id, ordre) VALUES ($1, $2, $3)`, [
        qcm,
        q,
        i,
      ]);
      if (titre === 'Principal') questions.push({ id: q, bonne, fausse });
    }
    await sql(
      `INSERT INTO config_anti_fraude (qcm_id, duree_max_minutes, date_ouverture, date_fermeture,
          nb_tentatives_max, delai_entre_tentatives, affichage_resultats, score_min_validation,
          ponderation_formation, randomiser_questions, randomiser_options)
       VALUES ($1, 30, now() - interval '1 day', now() + interval '10 days', $2, 0, 'DIFFERE', 50, 10, false, false)`,
      [qcm, nbTentativesMax],
    );
    return qcm;
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
    const tentatives = (
      await sql<{ id: string }>(`SELECT id FROM tentatives_qcm WHERE qcm_id = ANY($1)`, [qcms])
    ).map((x) => x.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...qcms, ...tentatives],
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
      a: Role.APPRENANT,
      b: Role.APPRENANT,
    };
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Historique',
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
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      ids.f,
      ids.formateur,
    ]);
    await sql(`INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $3), ($2, $3)`, [
      ids.a,
      ids.b,
      ids.f,
    ]);
    ids.m = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    ids.qcm = await creerQcm('Principal', 3);
    ids.autreQcm = await creerQcm('Second', 1);

    // a : 1re tentative notée (q1 juste, q2 fausse, q3 sans réponse), 2e en cours.
    t.a1 = await demarrer('a', ids.qcm);
    await repondre('a', t.a1, questions[0].id, [questions[0].bonne]);
    await repondre('a', t.a1, questions[1].id, [questions[1].fausse]);
    await soumettre('a', t.a1).expect(200);
    t.a2 = await demarrer('a', ids.qcm);
    // b : une tentative notée.
    t.b1 = await demarrer('b', ids.qcm);
    await repondre('b', t.b1, questions[0].id, [questions[0].bonne]);
    await soumettre('b', t.b1).expect(200);
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès', () => {
    it('401 ; 403 croisés ; 403 non affecté tracé ; 404 QCM inconnu ; 400 filtres', async () => {
      await request(app.getHttpServer()).get('/api/mes-tentatives').expect(401);
      await appel('get', '/mes-tentatives', tokens.formateur).expect(403);
      await appel('get', `/formateur/qcm/${ids.qcm}/tentatives`, tokens.a).expect(403);
      await appel('get', `/formateur/qcm/${ids.qcm}/tentatives`, tokens.autre).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1`,
        [ids.autre],
      );
      expect(n).toBeGreaterThanOrEqual(1);
      await appel('get', `/formateur/qcm/${INCONNU}/tentatives`, tokens.formateur).expect(404);
      await appel('get', '/mes-tentatives?qcmId=abc', tokens.a).expect(400);
      await appel('get', '/mes-tentatives?inconnu=1', tokens.a).expect(400);
      await appel(
        'get',
        `/formateur/qcm/${ids.qcm}/tentatives?apprenantId=abc`,
        tokens.formateur,
      ).expect(400);
    });
  });

  describe('Apprenant', () => {
    it('mes tentatives seulement, plus récentes d’abord, rang, durée, score si notée', async () => {
      const res = await appel('get', `/mes-tentatives?qcmId=${ids.qcm}`, tokens.a).expect(200);
      expect(res.body.map((l: { id: string }) => l.id)).toEqual([t.a2, t.a1]);
      const [enCours, notee] = res.body;
      expect(enCours).toMatchObject({
        numero: 2,
        statut: 'EN_COURS',
        score: null,
        estReussie: null,
        dateFin: null,
        qcmTitre: `${MARQUEUR} Principal`,
        formationTitre: `${MARQUEUR} Back-end`,
      });
      expect(notee).toMatchObject({
        numero: 1,
        statut: 'NOTEE',
        nbQuestions: 3,
        nbRepondues: 2,
        estReussie: false,
      });
      expect(notee.score).toBeCloseTo(33.33, 1);
      expect(notee.dureeSecondes).toEqual(expect.any(Number));
      expect(notee.dateFin).not.toBeNull();
      expect(notee).not.toHaveProperty('apprenant');
      // Sans filtre : mêmes tentatives (a n'en a pas d'autres) ; aucune de b.
      const tout = await appel('get', '/mes-tentatives', tokens.a).expect(200);
      expect(tout.body.map((l: { id: string }) => l.id)).toEqual([t.a2, t.a1]);
    });

    it('détail : questions vues et mes choix, sans corrigé ; état du corrigé', async () => {
      const res = await appel('get', `/mes-tentatives/${t.a1}`, tokens.a).expect(200);
      expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual(
        questions.map((q) => q.id),
      );
      expect(res.body.reponses).toEqual({
        [questions[0].id]: [questions[0].bonne],
        [questions[1].id]: [questions[1].fausse],
      });
      expect(res.body.correction).toMatchObject({
        disponible: false,
        raison: 'correction_differee',
      });
      sansFuite(res.body);
    });

    it('tentative en cours : aucun contenu ; tentative d’un autre : 404', async () => {
      const res = await appel('get', `/mes-tentatives/${t.a2}`, tokens.a).expect(200);
      expect(res.body).toMatchObject({ statut: 'EN_COURS', questions: [], reponses: {} });
      await appel('get', `/mes-tentatives/${t.b1}`, tokens.a).expect(404);
      await appel('get', `/mes-tentatives/${INCONNU}`, tokens.a).expect(404);
    });
  });

  describe('Formateur', () => {
    it('toutes les tentatives du QCM avec l’apprenant ; filtre ; rang par apprenant', async () => {
      const res = await appel(
        'get',
        `/formateur/qcm/${ids.qcm}/tentatives`,
        tokens.formateur,
      ).expect(200);
      expect(res.body.map((l: { id: string }) => l.id)).toEqual([t.b1, t.a2, t.a1]);
      expect(res.body[0]).toMatchObject({
        numero: 1,
        statut: 'NOTEE',
        apprenant: { id: ids.b, prenom: 'B', nom: 'Historique', email: email('b') },
      });
      const filtre = await appel(
        'get',
        `/formateur/qcm/${ids.qcm}/tentatives?apprenantId=${ids.a}`,
        tokens.formateur,
      ).expect(200);
      expect(filtre.body.map((l: { numero: number }) => l.numero)).toEqual([2, 1]);
    });

    it('détail avec corrigé complet ; tentative d’un autre QCM : 404', async () => {
      const res = await appel(
        'get',
        `/formateur/qcm/${ids.qcm}/tentatives/${t.a1}`,
        tokens.formateur,
      ).expect(200);
      const [q1, q2, q3] = res.body.questions;
      expect(q1).toMatchObject({ estCorrecte: true, pointsObtenus: 1, repondue: true });
      expect(q1.options).toEqual([
        { id: questions[0].bonne, texte: 'Alpha', cochee: true, estCorrecte: true },
        { id: questions[0].fausse, texte: 'Bravo', cochee: false, estCorrecte: false },
      ]);
      expect(q2).toMatchObject({ estCorrecte: false, pointsObtenus: 0 });
      expect(q3).toMatchObject({ repondue: false, pointsObtenus: 0 });
      expect(res.body.apprenant.id).toBe(ids.a);
      await appel(
        'get',
        `/formateur/qcm/${ids.autreQcm}/tentatives/${t.a1}`,
        tokens.formateur,
      ).expect(404);
    });
  });

  describe('Immuabilité', () => {
    it('aucune route de modification ; tentative notée figée en base', async () => {
      await appel('delete', `/mes-tentatives/${t.a1}`, tokens.a).expect(404);
      await appel('patch', `/mes-tentatives/${t.a1}`, tokens.a, { score: 100 }).expect(404);
      await appel(
        'delete',
        `/formateur/qcm/${ids.qcm}/tentatives/${t.a1}`,
        tokens.formateur,
      ).expect(404);
      await appel('put', `/formateur/qcm/${ids.qcm}/tentatives/${t.a1}`, tokens.formateur, {
        score: 100,
      }).expect(404);
      await expect(
        sql(`UPDATE tentatives_qcm SET score = 100 WHERE id = $1`, [t.a1]),
      ).rejects.toThrow();
      const [l] = (await appel('get', `/mes-tentatives?qcmId=${ids.qcm}`, tokens.a)).body.filter(
        (x: { id: string }) => x.id === t.a1,
      );
      expect(l.score).toBeCloseTo(33.33, 1);
    });
  });

  describe('Concurrence', () => {
    it('8 lectures pendant une soumission : chaque ligne est cohérente', async () => {
      await repondre('a', t.a2, questions[0].id, [questions[0].bonne]);
      const [soumission, ...lectures] = await Promise.all([
        soumettre('a', t.a2),
        ...Array.from({ length: 8 }, () =>
          appel('get', `/mes-tentatives?qcmId=${ids.qcm}`, tokens.a),
        ),
      ]);
      expect(soumission.status).toBe(200);
      for (const r of lectures) {
        expect(r.status).toBe(200);
        const ligne = r.body.find((x: { id: string }) => x.id === t.a2);
        expect(ligne.numero).toBe(2);
        if (ligne.statut === 'NOTEE') expect(ligne.score).toEqual(expect.any(Number));
        else {
          expect(['EN_COURS', 'SOUMISE']).toContain(ligne.statut);
          expect(ligne).toMatchObject({ score: null, estReussie: null });
        }
      }
      const fin = await appel('get', `/mes-tentatives/${t.a2}`, tokens.a).expect(200);
      expect(fin.body.statut).toBe('NOTEE');
      expect(fin.body.nbRepondues).toBe(1);
    });
  });
});
