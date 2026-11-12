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
import { extrairePagesPdf } from '../src/modules/assistance-ia/extraction/extraction-pdf';
import { TentativeBalayageService } from '../src/modules/tentatives/tentative-balayage.service';
import { dateHeureTunis } from '../src/modules/tentatives/rapport/rapport-tentative-pdf';
import { nombreFr } from '../src/modules/tentatives/rapport/rapport-tentative.regles';

/**
 * Tests d'intégration US-QCM-13 — Rapport PDF détaillé d'une tentative de
 * QCM, sur l'application réelle (PostgreSQL, Redis). Le texte des PDF est
 * extrait (pdf.js, comme l'ingestion des supports) et vérifié.
 *
 * Couvre chaque scénario Gherkin :
 *  - apprenant, corrigé disponible (affichage immédiat, plus de tentative) :
 *    en-tête, synthèse, détail, bonne réponse et explication ; audit ;
 *  - corrigé pas encore disponible (différé avant fermeture) : AUCUNE bonne
 *    réponse ni explication dans le texte du PDF, date de disponibilité ;
 *    puis, fenêtre fermée, corrigé inclus (même règle qu'US-QCM-09) ;
 *  - tentative EN_COURS ou SOUMISE : 409 `tentative_non_notee`, pas de PDF ;
 *  - tentative d'un autre apprenant : 404 identique à une inconnue ;
 *  - formateur affecté et administrateur : corrigé toujours inclus, audit
 *    acteur / cible ; formateur non affecté : 403 + ACCES_RESSOURCE_REFUSE ;
 *  - score, points et verdict du PDF = ceux de la base, identiques d'une
 *    génération à l'autre, tentative inchangée ; questions dans l'ordre du
 *    tirage (`planTirage`, questions mélangées) ;
 *  - clôture par le temps : « Temps écoulé », sans réponse comptées fausses ;
 *  - concurrence : rapports demandés pendant la soumission (409 ou score
 *    final, jamais un état intermédiaire) ; téléchargements simultanés tous
 *    servis et journalisés.
 *
 * Marqueur `E2E-RAPPORT` (titres, énoncés, options) ; emails `e2e-rapport-…`.
 */
describe('Rapport PDF d’une tentative (e2e) — US-QCM-13', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-RAPPORT';
  const email = (cle: string): string => `e2e-rapport-${cle}@cert-eet.local`;
  const CLES = ['formateur', 'autre', 'admin', 'a', 'b', 'c', 'd'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '99999999-9999-4999-8999-999999999999';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const t: Record<string, string> = {};
  type Question = {
    id: string;
    enonce: string;
    bonne: string;
    fausse: string;
    explication: string;
  };
  const questions: Record<string, Question[]> = {};

  const login = async (e: string): Promise<string> =>
    (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: e, password: MOT_DE_PASSE })
        .expect(200)
    ).body.accessToken as string;
  const appel = (
    methode: 'get' | 'post' | 'put',
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

  const binaire = (res: request.Response, fin: (e: Error | null, b: Buffer) => void): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };
  /** Route de l'apprenant. */
  const rapport = (tentativeId: string, cle: string): request.Test =>
    appel('get', `/tentatives/${tentativeId}/rapport.pdf`, tokens[cle]).buffer(true).parse(binaire);
  /** Route du formateur / de l'administrateur. */
  const rapportFormateur = (qcmId: string, tentativeId: string, cle: string): request.Test =>
    appel('get', `/formateur/qcm/${qcmId}/tentatives/${tentativeId}/rapport.pdf`, tokens[cle])
      .buffer(true)
      .parse(binaire);
  /** Texte du PDF, espaces normalisés. */
  const texte = async (res: request.Response): Promise<string> =>
    (await extrairePagesPdf(res.body as Buffer)).join(' ').replace(/\s+/g, ' ');
  const nbAudits = async (acteur: string, tentativeId: string): Promise<number> =>
    (
      await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'RAPPORT_QCM_TELECHARGE' AND user_id = $1
            AND details_avant_apres->>'tentativeId' = $2`,
        [acteur, tentativeId],
      )
    )[0].n;
  const enBase = async (
    tentativeId: string,
  ): Promise<{
    score: number;
    estReussie: boolean;
    statut: string;
    plan: Array<{ questionId: string }>;
  }> =>
    (
      await sql<{
        score: number;
        estReussie: boolean;
        statut: string;
        plan: Array<{ questionId: string }>;
      }>(
        `SELECT score::float AS score, est_reussie AS "estReussie", statut::text AS statut,
                plan_tirage AS plan FROM tentatives_qcm WHERE id = $1`,
        [tentativeId],
      )
    )[0];

  const demarrer = async (cle: string, qcmId: string): Promise<string> =>
    (
      (await appel('post', `/qcm/${qcmId}/tentatives`, tokens[cle]).expect(201)).body as {
        id: string;
      }
    ).id;
  const repondre = (
    cle: string,
    tentativeId: string,
    q: Question,
    optionId: string,
  ): request.Test =>
    appel('put', `/tentatives/${tentativeId}/reponses/${q.id}`, tokens[cle], {
      optionIds: [optionId],
    }).expect(200);
  const soumettre = (cle: string, tentativeId: string): request.Test =>
    appel('post', `/tentatives/${tentativeId}/soumettre`, tokens[cle]);

  /**
   * QCM publié de 4 QCU (pondérations 1, 2, 3, 5 : scores non entiers ; niveaux débutant,
   * intermédiaire, avancé, avancé), questions mélangées.
   */
  const creerQcm = async (
    titre: string,
    mode: 'IMMEDIAT' | 'DIFFERE',
    nbTentativesMax: number,
  ): Promise<string> => {
    const qcm = await un(
      `INSERT INTO qcm (module_id, titre, statut, formateur_id) VALUES ($1, $2, 'PUBLIE', $3) RETURNING id`,
      [ids.m, `${MARQUEUR} ${titre}`, ids.formateur],
    );
    questions[titre] = [];
    for (let i = 1; i <= 4; i++) {
      const enonce = `${MARQUEUR} ${titre} énoncé ${i}`;
      const explication = `Justification ${titre} ${i}`;
      const q = await un(
        `INSERT INTO questions (enonce, type, ponderation, explication, niveau_difficulte)
         VALUES ($1, 'QCU', $2, $3, $4) RETURNING id`,
        [
          enonce,
          i === 4 ? 5 : i,
          explication,
          ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE', 'AVANCE'][i - 1],
        ],
      );
      const bonne = await un(
        `INSERT INTO options (question_id, texte, ordre, est_correcte) VALUES ($1, $2, 1, true) RETURNING id`,
        [q, `${MARQUEUR} BONNE ${titre} ${i}`],
      );
      const fausse = await un(
        `INSERT INTO options (question_id, texte, ordre, est_correcte) VALUES ($1, $2, 2, false) RETURNING id`,
        [q, `${MARQUEUR} FAUSSE ${titre} ${i}`],
      );
      await sql(`INSERT INTO qcm_questions (qcm_id, question_id, ordre) VALUES ($1, $2, $3)`, [
        qcm,
        q,
        i,
      ]);
      questions[titre].push({ id: q, enonce, bonne, fausse, explication });
    }
    await sql(
      `INSERT INTO config_anti_fraude (qcm_id, duree_max_minutes, date_ouverture, date_fermeture,
          nb_tentatives_max, delai_entre_tentatives, affichage_resultats, score_min_validation,
          ponderation_formation, randomiser_questions, randomiser_options)
       VALUES ($1, 30, now() - interval '1 day', now() + interval '10 days', $2, 0, $3, 50, 10, true, false)`,
      [qcm, nbTentativesMax, mode],
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
    await sql(`DELETE FROM refresh_tokens WHERE user_id = ANY($1)`, [uids]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 4);
    const roles: Record<string, Role> = {
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      admin: Role.ADMINISTRATEUR,
      a: Role.APPRENANT,
      b: Role.APPRENANT,
      c: Role.APPRENANT,
      d: Role.APPRENANT,
    };
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: `Prénom${cle.toUpperCase()}`,
          nom: 'Rapport',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(email(cle));
    }
    ids.f = await un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Formation`],
    );
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      ids.f,
      ids.formateur,
    ]);
    for (const cle of ['a', 'b', 'c', 'd']) {
      await sql(`INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $2)`, [
        ids[cle],
        ids.f,
      ]);
    }
    ids.m = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, $2, 1) RETURNING id`,
      [ids.f, `${MARQUEUR} Module`],
    );
    ids.differe = await creerQcm('Differe', 'DIFFERE', 2);
    ids.immediat = await creerQcm('Immediat', 'IMMEDIAT', 1);
    const D = questions.Differe;
    const I = questions.Immediat;

    // a, différé : q1 juste, q2 fausse, q3 et q4 sans réponse. Score 1 / 11 = 9,09.
    t.a1 = await demarrer('a', ids.differe);
    await repondre('a', t.a1, D[0], D[0].bonne);
    await repondre('a', t.a1, D[1], D[1].fausse);
    await soumettre('a', t.a1).expect(200);
    // a, immédiat (une seule tentative) : q1, q3, q4 justes, q2 fausse. 9 / 11.
    t.ai = await demarrer('a', ids.immediat);
    await repondre('a', t.ai, I[0], I[0].bonne);
    await repondre('a', t.ai, I[1], I[1].fausse);
    await repondre('a', t.ai, I[2], I[2].bonne);
    await repondre('a', t.ai, I[3], I[3].bonne);
    await soumettre('a', t.ai).expect(200);
    // b, différé : q4 juste, puis le temps s'écoule (clôture par le balayage, puis notée).
    t.b1 = await demarrer('b', ids.differe);
    await repondre('b', t.b1, D[3], D[3].bonne);
    await sql(
      `UPDATE tentatives_qcm SET date_debut = now() - interval '20 minutes',
              date_limite = now() - interval '1 minute' WHERE id = $1`,
      [t.b1],
    );
    await moduleRef.get(TentativeBalayageService).balayer(0);
    // c : une tentative EN_COURS, et une SOUMISE pas encore notée (insérée telle quelle).
    t.c1 = await demarrer('c', ids.differe);
    t.cSoumise = await un(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin, statut, plan_tirage)
       VALUES ($1, $2, now() - interval '2 hours', now() - interval '90 minutes', now() - interval '100 minutes',
               'SOUMISE', '[]'::jsonb) RETURNING id`,
      [ids.c, ids.differe],
    );
  }, 120_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès', () => {
    it('401 sans jeton ; 400 identifiant mal formé', async () => {
      await request(app.getHttpServer()).get(`/api/tentatives/${t.a1}/rapport.pdf`).expect(401);
      await rapport('pas-un-uuid', 'a').expect(400);
      await rapportFormateur(ids.differe, 'pas-un-uuid', 'formateur').expect(400);
    });

    it('tentative d’un autre apprenant : 404, même réponse qu’une inconnue ; rien de journalisé', async () => {
      const autre = await rapport(t.a1, 'b').expect(404);
      const inconnue = await rapport(INCONNU, 'b').expect(404);
      expect(JSON.parse((autre.body as Buffer).toString())).toEqual(
        JSON.parse((inconnue.body as Buffer).toString()),
      );
      expect(await nbAudits(ids.b, t.a1)).toBe(0);
    });

    it('route apprenant refusée au formateur (403) ; route formateur refusée à l’apprenant (403)', async () => {
      await rapport(t.a1, 'formateur').expect(403);
      await rapportFormateur(ids.differe, t.a1, 'a').expect(403);
    });

    it('formateur non affecté : 403 et ACCES_RESSOURCE_REFUSE ; aucun PDF', async () => {
      const res = await rapportFormateur(ids.differe, t.a1, 'autre').expect(403);
      expect(res.headers['content-type']).not.toContain('application/pdf');
      const [trace] = await sql<{ cible: string; resultat: string }>(
        `SELECT cible, resultat FROM audit_logs WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1`,
        [ids.autre],
      );
      expect(trace).toEqual({ cible: ids.f, resultat: 'Échec' });
      expect(await nbAudits(ids.autre, t.a1)).toBe(0);
    });

    it('formateur : tentative d’un autre QCM -> 404 ; QCM inconnu -> 404', async () => {
      await rapportFormateur(ids.immediat, t.a1, 'formateur').expect(404);
      await rapportFormateur(INCONNU, t.a1, 'formateur').expect(404);
    });
  });

  describe('Tentative pas encore notée', () => {
    it.each([
      ['EN_COURS', 'c1'],
      ['SOUMISE', 'cSoumise'],
    ])(
      '%s : 409 tentative_non_notee, pour l’apprenant et le formateur ; aucun PDF ni audit',
      async (_s, cle) => {
        for (const res of [
          await rapport(t[cle], 'c').expect(409),
          await rapportFormateur(ids.differe, t[cle], 'formateur').expect(409),
        ]) {
          expect(res.headers['content-type']).toContain('application/json');
          expect(JSON.parse((res.body as Buffer).toString())).toMatchObject({
            statusCode: 409,
            raison: 'tentative_non_notee',
          });
        }
        expect(await nbAudits(ids.c, t[cle])).toBe(0);
        expect(await nbAudits(ids.formateur, t[cle])).toBe(0);
      },
    );
  });

  describe('Apprenant', () => {
    it('corrigé pas encore disponible (différé) : AUCUNE bonne réponse ni explication dans le PDF', async () => {
      const res = await rapport(t.a1, 'a').expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="rapport-e2e-rapport-differe-tentative-1.pdf"',
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const pdf = await texte(res);
      const D = questions.Differe;
      // Ce qui doit y être : score, verdict, mes réponses, juste / faux.
      const base = await enBase(t.a1);
      expect(pdf).toContain(`Score : ${nombreFr(base.score)} / 100 — Échoué`);
      expect(pdf).toContain(`Votre réponse : ${MARQUEUR} BONNE Differe 1`);
      expect(pdf).toContain(`Votre réponse : ${MARQUEUR} FAUSSE Differe 2`);
      expect(pdf).toContain('Faux (sans réponse)');
      // Ses points à revoir : les questions ratées, sans leur bonne réponse ; réussite par niveau.
      expect(pdf).toContain('Vos points à revoir');
      expect(pdf).toMatch(
        new RegExp(`Question \\d — ${MARQUEUR} Differe énoncé 2 — Faux, 2,00 points perdus`),
      );
      expect(pdf).toMatch(
        new RegExp(
          `Question \\d — ${MARQUEUR} Differe énoncé 4 — Sans réponse, 5,00 points perdus`,
        ),
      );
      expect(pdf).not.toMatch(new RegExp(`Question \\d — ${MARQUEUR} Differe énoncé 1 —`));
      expect(pdf).toContain(
        'Réussite par niveau : Débutant 1 / 1 · Intermédiaire 0 / 1 (à travailler) · Avancé 0 / 2 (à travailler)',
      );
      expect(pdf).toContain('le corrigé détaillé sera disponible à la date indiquée plus haut');
      // Ce qui ne doit JAMAIS y être : bonnes réponses non cochées, explications.
      for (const q of D.slice(1)) expect(pdf).not.toContain(`BONNE Differe ${D.indexOf(q) + 1}`);
      for (const q of D) expect(pdf).not.toContain(q.explication);
      expect(pdf).not.toMatch(/Bonne réponse/i);
      expect(pdf).not.toMatch(/Explication/i);
      expect(pdf).not.toContain('Justification');
      // La date de disponibilité : la fermeture du QCM.
      const [{ fermeture }] = await sql<{ fermeture: Date }>(
        `SELECT date_fermeture AS fermeture FROM config_anti_fraude WHERE qcm_id = $1`,
        [ids.differe],
      );
      expect(pdf).toContain(`il sera disponible à partir du ${dateHeureTunis(fermeture)}`);
    });

    it('même décision que GET /tentatives/:id/correction (409 ici aussi)', async () => {
      await appel('get', `/tentatives/${t.a1}/correction`, tokens.a).expect(409);
    });

    it('corrigé disponible (immédiat, plus de tentative) : en-tête, synthèse, détail complet ; audit', async () => {
      await appel('get', `/tentatives/${t.ai}/correction`, tokens.a).expect(200);
      const avant = await nbAudits(ids.a, t.ai);
      const res = await rapport(t.ai, 'a').expect(200);
      const pdf = await texte(res);
      const I = questions.Immediat;
      const base = await enBase(t.ai);
      for (const attendu of [
        'Rapport de tentative de QCM',
        `${MARQUEUR} Immediat`,
        `Formation : ${MARQUEUR} Formation`,
        `Module : ${MARQUEUR} Module`,
        'Apprenant : PrénomA Rapport',
        'Tentative : n° 1 sur 1 autorisée',
        'Clôture : Soumise',
        `Score : ${nombreFr(base.score)} / 100 — Réussi`,
        'Seuil de validation : 50,00 / 100',
        'Points : 9,00 / 11,00',
        'justes : 3 · fausses : 1 · sans réponse : 0',
        `Bonne réponse : ${MARQUEUR} BONNE Immediat 2`,
        `Votre réponse : ${MARQUEUR} FAUSSE Immediat 2`,
        'Réussite par niveau : Débutant 1 / 1 · Intermédiaire 0 / 1 (à travailler) · Avancé 2 / 2',
        `${MARQUEUR} Immediat énoncé 2 — Faux, 2,00 points perdus`,
        'Les bonnes réponses et les explications de ces questions sont dans le détail ci-dessous.',
        'Document généré par Cert_EET — ESPRIT Entreprise',
        `Tentative ${t.ai}`,
        'Page 1 / 1',
      ]) {
        expect(pdf).toContain(attendu);
      }
      for (const q of I) expect(pdf).toContain(`Explication : ${q.explication}`);
      expect(pdf).not.toContain('Corrigé non inclus');
      expect(await nbAudits(ids.a, t.ai)).toBe(avant + 1);
      const [trace] = await sql<{
        cible: string;
        resultat: string;
        details: Record<string, unknown>;
      }>(
        `SELECT cible, resultat, details_avant_apres AS details FROM audit_logs
          WHERE action = 'RAPPORT_QCM_TELECHARGE' AND user_id = $1 AND details_avant_apres->>'tentativeId' = $2`,
        [ids.a, t.ai],
      );
      expect(trace).toEqual({
        cible: ids.a,
        resultat: 'Succès',
        details: {
          tentativeId: t.ai,
          qcmId: ids.immediat,
          role: 'APPRENANT',
          corrigeInclus: true,
          score: base.score,
        },
      });
    });

    it('questions dans l’ordre du tirage (planTirage), pas dans l’ordre du QCM', async () => {
      const complet = await texte(await rapport(t.ai, 'a').expect(200));
      // Le détail seulement : les points à revoir citent aussi des énoncés.
      const pdf = complet.slice(complet.indexOf('Détail par question'));
      const { plan } = await enBase(t.ai);
      const enonces = plan.map(
        (p) => questions.Immediat.find((q) => q.id === p.questionId)?.enonce as string,
      );
      const positions = enonces.map((e) => pdf.indexOf(e));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((x, y) => x - y)).toEqual(positions);
      enonces.forEach((e, i) => expect(pdf).toContain(`${i + 1}. ${e}`));
    });

    it('clôture par le temps : « Temps écoulé », sans réponse comptées fausses', async () => {
      const base = await enBase(t.b1);
      expect(base.statut).toBe('NOTEE');
      const pdf = await texte(await rapport(t.b1, 'b').expect(200));
      expect(pdf).toContain('Clôture : Temps écoulé');
      expect(pdf).toContain('justes : 1 · fausses : 0 · sans réponse : 3 (comptées fausses)');
      expect(pdf.match(/Faux \(sans réponse\)/g)).toHaveLength(3);
      expect(pdf).toContain(`Score : ${nombreFr(base.score)} / 100 — Échoué`);
      expect(pdf).toContain('Points : 5,00 / 11,00');
    });
  });

  describe('Formateur affecté et administrateur', () => {
    it('corrigé inclus même en différé avant fermeture ; audit acteur = formateur, cible = apprenant', async () => {
      const res = await rapportFormateur(ids.differe, t.a1, 'formateur').expect(200);
      expect(res.headers['content-disposition']).toContain('attachment;');
      expect(res.headers['cache-control']).toBe('no-store');
      const pdf = await texte(res);
      for (const q of questions.Differe) expect(pdf).toContain(`Explication : ${q.explication}`);
      expect(pdf).toContain(`Bonne réponse : ${MARQUEUR} BONNE Differe 3`);
      expect(pdf).toContain('Apprenant : PrénomA Rapport');
      const [trace] = await sql<{ cible: string; corrige: string }>(
        `SELECT cible, details_avant_apres->>'corrigeInclus' AS corrige FROM audit_logs
          WHERE action = 'RAPPORT_QCM_TELECHARGE' AND user_id = $1 AND details_avant_apres->>'tentativeId' = $2`,
        [ids.formateur, t.a1],
      );
      expect(trace).toEqual({ cible: ids.a, corrige: 'true' });
    });

    it('administrateur : rapport complet de toute formation', async () => {
      const pdf = await texte(await rapportFormateur(ids.differe, t.a1, 'admin').expect(200));
      expect(pdf).toContain(`Bonne réponse : ${MARQUEUR} BONNE Differe 4`);
      expect(await nbAudits(ids.admin, t.a1)).toBe(1);
    });
  });

  describe('Le rapport reflète exactement la notation', () => {
    it('score, points et verdict = base, identiques sur 3 générations ; tentative inchangée', async () => {
      const avant = await sql(`SELECT * FROM tentatives_qcm WHERE id = $1`, [t.a1]);
      const reponsesAvant = await sql(
        `SELECT id, est_correcte, points_obtenus FROM reponses WHERE tentative_id = $1 ORDER BY id`,
        [t.a1],
      );
      const base = await enBase(t.a1);
      const extraits: string[] = [];
      for (let i = 0; i < 3; i++) {
        const pdf = await texte(await rapportFormateur(ids.differe, t.a1, 'formateur').expect(200));
        const synthese = pdf.slice(pdf.indexOf('Synthèse'), pdf.indexOf('Détail par question'));
        expect(synthese).toContain(`Score : ${nombreFr(base.score)} / 100 — Échoué`);
        expect(synthese).toContain('Points : 1,00 / 11,00');
        extraits.push(synthese);
      }
      expect(new Set(extraits).size).toBe(1);
      expect(base.score).toBe(9.09);
      expect(await sql(`SELECT * FROM tentatives_qcm WHERE id = $1`, [t.a1])).toEqual(avant);
      expect(
        await sql(
          `SELECT id, est_correcte, points_obtenus FROM reponses WHERE tentative_id = $1 ORDER BY id`,
          [t.a1],
        ),
      ).toEqual(reponsesAvant);
    });
  });

  describe('Fermeture du QCM différé', () => {
    it('fenêtre fermée : le corrigé entre dans le rapport de l’apprenant (règle d’US-QCM-09)', async () => {
      await sql(
        `UPDATE config_anti_fraude SET date_ouverture = now() - interval '2 days',
                date_fermeture = now() - interval '1 second' WHERE qcm_id = $1`,
        [ids.differe],
      );
      try {
        await appel('get', `/tentatives/${t.a1}/correction`, tokens.a).expect(200);
        const pdf = await texte(await rapport(t.a1, 'a').expect(200));
        for (const q of questions.Differe) expect(pdf).toContain(`Explication : ${q.explication}`);
        expect(pdf).not.toContain('Corrigé non inclus');
      } finally {
        await sql(
          `UPDATE config_anti_fraude SET date_fermeture = now() + interval '10 days' WHERE qcm_id = $1`,
          [ids.differe],
        );
      }
    });
  });

  describe('Concurrence', () => {
    it('rapports demandés pendant la soumission : 409 ou score final, jamais un état intermédiaire', async () => {
      const D = questions.Differe;
      t.d1 = await demarrer('d', ids.differe);
      await repondre('d', t.d1, D[0], D[0].bonne);
      await repondre('d', t.d1, D[2], D[2].bonne);
      const [soumission, ...rapports] = await Promise.all([
        soumettre('d', t.d1),
        ...Array.from({ length: 6 }, () => rapport(t.d1, 'd')),
      ]);
      expect(soumission.status).toBe(200);
      const base = await enBase(t.d1);
      expect(base.statut).toBe('NOTEE');
      let servis = 0;
      for (const r of rapports) {
        expect([200, 409]).toContain(r.status);
        if (r.status === 200) {
          servis++;
          expect(await texte(r)).toContain(`Score : ${nombreFr(base.score)} / 100`);
        }
      }
      expect(await nbAudits(ids.d, t.d1)).toBe(servis);
      // Après la notation, toujours servi.
      await rapport(t.d1, 'd').expect(200);
    });

    it('8 téléchargements simultanés (apprenant et formateur) : tous servis et journalisés', async () => {
      const avantA = await nbAudits(ids.a, t.a1);
      const avantF = await nbAudits(ids.formateur, t.a1);
      const reponses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          i % 2 === 0 ? rapport(t.a1, 'a') : rapportFormateur(ids.differe, t.a1, 'formateur'),
        ),
      );
      expect(reponses.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await nbAudits(ids.a, t.a1)).toBe(avantA + 4);
      expect(await nbAudits(ids.formateur, t.a1)).toBe(avantF + 4);
    });
  });
});
