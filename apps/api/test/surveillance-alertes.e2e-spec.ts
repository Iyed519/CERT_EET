import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { StockageService } from '../src/stockage/stockage.service';
import { extrairePagesPdf } from '../src/modules/assistance-ia/extraction/extraction-pdf';
import { PREFIXE_JETON_ALERTE } from '../src/modules/surveillance/surveillance-alertes.service';
import { SurveillanceService } from '../src/modules/surveillance/surveillance.service';

/**
 * E2E-QCM15 — Alertes de la surveillance par IA (US-QCM-15).
 *
 * L'analyse tourne dans le navigateur ; ici, on joue le rôle du navigateur
 * (dépôt d'une alerte avec sa photo) et on vérifie tout le parcours serveur :
 * contrôles du dépôt, plafond et écart minimal (y compris en concurrence),
 * e-mail au formateur à la première alerte seulement, file du formateur
 * (affecté / non affecté / admin), examen, lien signé de la photo, alertes
 * d'une tentative, PDF du formateur, purge (conservation, anonymisation).
 */
describe('E2E-QCM15 — Alertes de la surveillance par IA (US-QCM-15)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let redis: Redis;
  let mail: jest.SpyInstance;
  const PREFIXE = 'e2e-qcm15-';
  const MARQUEUR = 'E2E-QCM15';
  const MDP = 'Passe123456';
  const email = (n: string): string => `${PREFIXE}${n}@cert-eet.local`;
  const ids: Record<string, string> = {};
  const jetons: Record<string, string> = {};
  let formationId = '';
  const qcm: Record<string, string> = {};
  const t: Record<string, string> = {};

  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4096, 9)]);
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(512, 1),
  ]);

  const api = (): request.SuperTest<request.Test> =>
    request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;
  const avec = (r: request.Test, cle: string): request.Test =>
    r.set('Authorization', `Bearer ${jetons[cle]}`);

  const alerter = (
    tentativeId: string,
    type: string,
    photo: Buffer | null = JPEG,
    cle = 'a',
    confiance?: string,
  ): request.Test => {
    let r = avec(api().post(`/api/tentatives/${tentativeId}/alertes-surveillance`), cle).field(
      'type',
      type,
    );
    if (confiance !== undefined) r = r.field('confiance', confiance);
    if (photo) r = r.attach('photo', photo, { filename: 'alerte.jpg', contentType: 'image/jpeg' });
    return r;
  };

  const sql = async <T = Record<string, unknown>>(texte: string, p: unknown[] = []): Promise<T[]> =>
    (await dataSource.query(texte, p)) as T[];

  const nettoyer = async (): Promise<void> => {
    const users = (
      await sql<{ id: string }>(`SELECT id FROM users WHERE email LIKE $1`, [`${PREFIXE}%`])
    ).map((u) => u.id);
    const cles = (
      await sql<{ cle_stockage: string }>(
        `SELECT e.cle_stockage FROM evenements_surveillance e
           JOIN tentatives_qcm t ON t.id = e.tentative_id WHERE t.apprenant_id = ANY($1::uuid[])
         UNION ALL
         SELECT c.cle_stockage FROM captures_webcam c
           JOIN tentatives_qcm t ON t.id = c.tentative_id WHERE t.apprenant_id = ANY($1::uuid[])`,
        [users],
      )
    ).map((c) => c.cle_stockage);
    await moduleRef.get(StockageService).supprimer(cles);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const tentatives = (
      await sql<{ id: string }>(
        `SELECT id FROM tentatives_qcm WHERE apprenant_id = ANY($1::uuid[])`,
        [users],
      )
    ).map((x) => x.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(
        `DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[]) OR cible = ANY($2::text[])
            OR (action = 'CAPTURES_PURGEES' AND user_id IS NULL AND horodatage > now() - interval '1 hour')`,
        [users, [...users, ...formations, ...tentatives, ...Object.values(qcm)].map(String)],
      );
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    if (users.length > 0) {
      await sql(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1::uuid[])`, [users]);
      await sql(`DELETE FROM inscriptions WHERE apprenant_id = ANY($1::uuid[])`, [users]);
      await sql(`DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])`, [users]);
    }
    await sql(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1::uuid[])`, [
      formations,
    ]);
    await sql(`DELETE FROM qcm WHERE titre LIKE $1`, [`${MARQUEUR}%`]);
    await sql(`DELETE FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`]);
    if (users.length > 0) await sql(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
  };

  /** Démarre une tentative (consentement donné si le QCM est surveillé). */
  const demarrer = async (cle: string, qcmId: string): Promise<string> =>
    (
      await avec(api().post(`/api/qcm/${qcmId}/tentatives`), cle)
        .send({ consentementSurveillance: true })
        .expect(201)
    ).body.id as string;

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
    await app.listen(0);
    dataSource = moduleRef.get(DataSource, { strict: false });
    redis = moduleRef.get<Redis>(REDIS_CLIENT);
    mail = jest
      .spyOn(moduleRef.get(MailService), 'sendAlerteSurveillanceEmail')
      .mockResolvedValue();
    await nettoyer();
    const hash = await bcrypt.hash(MDP, 4);
    for (const [cle, role] of [
      ['a', 'APPRENANT'],
      ['b', 'APPRENANT'],
      ['c', 'APPRENANT'],
      ['f', 'FORMATEUR'],
      ['g', 'FORMATEUR'],
      ['admin', 'ADMINISTRATEUR'],
    ] as const) {
      const [u] = await sql<{ id: string }>(
        `INSERT INTO users (email, nom, prenom, mot_de_passe_hash, role, statut, profil_complet)
         VALUES ($1, 'Surv', $2, $3, $4, 'ACTIF', true) RETURNING id`,
        [email(cle), cle.toUpperCase(), hash, role],
      );
      ids[cle] = u.id;
      jetons[cle] = (
        await api().post('/api/auth/login').send({ email: email(cle), password: MDP }).expect(200)
      ).body.accessToken as string;
    }
    const [f] = await sql<{ id: string }>(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Java`],
    );
    formationId = f.id;
    const [m] = await sql<{ id: string }>(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Bases', 1) RETURNING id`,
      [formationId],
    );
    for (const [cle, proctoring] of [
      ['surveille', true],
      ['libre', false],
    ] as const) {
      const [q] = await sql<{ id: string }>(
        `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
        [m.id, `${MARQUEUR} ${cle}`],
      );
      qcm[cle] = q.id;
      await sql(
        `INSERT INTO config_anti_fraude (qcm_id, duree_max_minutes, date_ouverture, date_fermeture,
            nb_tentatives_max, delai_entre_tentatives, affichage_resultats, score_min_validation,
            ponderation_formation, proctoring_webcam)
         VALUES ($1, 30, now() - interval '1 day', now() + interval '10 days', 3, 0, 'DIFFERE', 60, 10, $2)`,
        [q.id, proctoring],
      );
    }
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $4), ($2, $4), ($3, $4)`,
      [ids.a, ids.b, ids.c, formationId],
    );
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      formationId,
      ids.f,
    ]);
    t.a = await demarrer('a', qcm.surveille);
    t.b = await demarrer('b', qcm.surveille);
    t.libre = await demarrer('c', qcm.libre);
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  it('la page de passage reçoit le seuil d’absence (5 min) ; pas de photo de contrôle par défaut (US-QCM-16)', async () => {
    const res = await avec(api().get(`/api/tentatives/${t.a}`), 'a').expect(200);
    expect(res.body.surveillance).toEqual({
      active: true,
      intervalleSecondes: 0,
      absenceSecondes: 300,
    });
    const refus = await avec(api().post(`/api/tentatives/${t.a}/captures`), 'a')
      .attach('capture', JPEG, { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(409);
    expect(refus.body.message).toBe(
      'Photos de contrôle désactivées : seules les anomalies repérées par l’IA sont photographiées.',
    );
    expect(
      await sql(`SELECT 1 FROM captures_webcam WHERE tentative_id = $1`, [t.a]),
    ).toEqual([]);
  });

  it('dépôt : alerte et photo enregistrées, journalisées, e-mail au formateur affecté (première alerte)', async () => {
    mail.mockClear();
    const res = await alerter(t.a, 'TELEPHONE', JPEG, 'a', '0.8765').expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['detecteLe', 'id', 'type']);
    expect(res.body.type).toBe('TELEPHONE');
    const [ligne] = await sql<{ type: string; confiance: string; statut: string; cle: string }>(
      `SELECT type, confiance::text, statut, cle_stockage AS cle FROM evenements_surveillance WHERE id = $1`,
      [res.body.id],
    );
    expect(ligne).toMatchObject({ type: 'TELEPHONE', confiance: '0.877', statut: 'NOUVEAU' });
    expect(ligne.cle).toBe(`surveillance/${t.a}/evenements/${res.body.id}.jpg`);
    const { flux } = await moduleRef.get(StockageService).lire(ligne.cle);
    const morceaux: Buffer[] = [];
    for await (const m of flux) morceaux.push(m as Buffer);
    expect(Buffer.concat(morceaux).equals(JPEG)).toBe(true);
    const [trace] = await sql<{ d: Record<string, unknown>; cible: string }>(
      `SELECT details_avant_apres AS d, cible FROM audit_logs
        WHERE action = 'SURVEILLANCE_ALERTE' AND user_id = $1`,
      [ids.a],
    );
    expect(trace).toEqual({
      cible: t.a,
      d: { evenementId: res.body.id, type: 'TELEPHONE', confiance: 0.877 },
    });
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail).toHaveBeenCalledWith(email('f'), {
      prenom: 'F',
      apprenant: 'A Surv',
      qcm: `${MARQUEUR} surveille`,
      formation: `${MARQUEUR} Java`,
      anomalie: 'Téléphone détecté',
    });
    // Autre anomalie, même tentative : pas de nouvel e-mail.
    await alerter(t.a, 'PERSONNES_MULTIPLES', PNG).expect(201);
    expect(mail).toHaveBeenCalledTimes(1);
  });

  it('dépôt refusé : type inconnu, photo absente ou pas une image, trop lourde, autre apprenant, non surveillé', async () => {
    await alerter(t.b, 'MAGIE', JPEG, 'b').expect(400);
    await alerter(t.b, 'ABSENCE', null, 'b').expect(400);
    await alerter(t.b, 'ABSENCE', Buffer.from('pas une image'), 'b').expect(400);
    const lourde = Buffer.concat([JPEG, Buffer.alloc(200 * 1024, 1)]);
    await alerter(t.b, 'ABSENCE', lourde, 'b').expect(413);
    await alerter(t.b, 'ABSENCE', JPEG, 'a').expect(404);
    await alerter(t.libre, 'ABSENCE', JPEG, 'c').expect(409);
    await alerter(t.b, 'ABSENCE', JPEG, 'f').expect(403);
    // Score hors bornes : ignoré (null), l'alerte passe.
    const ok = await alerter(t.b, 'ABSENCE', JPEG, 'b', '7').expect(201);
    const [l] = await sql<{ confiance: string | null }>(
      `SELECT confiance FROM evenements_surveillance WHERE id = $1`,
      [ok.body.id],
    );
    expect(l.confiance).toBeNull();
  });

  it('même anomalie moins de 30 s après : 429 ; 12 envois simultanés -> une seule alerte', async () => {
    const res = await alerter(t.a, 'TELEPHONE').expect(429);
    expect(res.body.attente).toBeGreaterThan(0);
    const reponses = await Promise.all(
      Array.from({ length: 12 }, () => alerter(t.a, 'DOCUMENT', JPEG, 'a', '0.6')),
    );
    expect(reponses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 429)).toHaveLength(11);
    const [{ n }] = await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM evenements_surveillance WHERE tentative_id = $1 AND type = 'DOCUMENT'`,
      [t.a],
    );
    expect(n).toBe(1);
  });

  it('plafond : 60 alertes par tentative', async () => {
    const [{ n }] = await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM evenements_surveillance WHERE tentative_id = $1`,
      [t.b],
    );
    for (let i = n; i < 60; i++) {
      await sql(
        `INSERT INTO evenements_surveillance (id, tentative_id, type, cle_stockage, taille_octets, type_contenu, detecte_le)
         VALUES (gen_random_uuid(), $1, 'ONGLET_QUITTE', 'surveillance/fictif.jpg', 10, 'image/jpeg', now() - interval '1 hour')`,
        [t.b],
      );
    }
    const res = await alerter(t.b, 'CAMERA_MASQUEE', JPEG, 'b').expect(409);
    expect(res.body.message).toMatch(/Nombre maximal d’alertes/);
    await sql(
      `DELETE FROM evenements_surveillance WHERE tentative_id = $1 AND cle_stockage = 'surveillance/fictif.jpg'`,
      [t.b],
    );
  });

  it('file du formateur : affecté et admin voient, non affecté rien, apprenant 403 ; champs exacts ; filtre', async () => {
    const f = await avec(api().get('/api/surveillance/alertes'), 'f').expect(200);
    const tentatives = new Set((f.body as Array<{ tentativeId: string }>).map((a) => a.tentativeId));
    expect(tentatives).toEqual(new Set([t.a, t.b]));
    expect(Object.keys(f.body[0]).sort()).toEqual([
      'apprenant',
      'confiance',
      'detecteLe',
      'examineLe',
      'formation',
      'id',
      'libelle',
      'qcm',
      'statut',
      'tentativeId',
      'type',
    ]);
    expect(f.body[0].apprenant).toEqual({
      prenom: expect.any(String),
      nom: 'Surv',
      email: expect.stringMatching(/^e2e-qcm15-/),
    });
    const telephone = (f.body as Array<{ type: string; libelle: string; qcm: unknown }>).find(
      (a) => a.type === 'TELEPHONE',
    );
    expect(telephone).toMatchObject({
      libelle: 'Téléphone détecté',
      qcm: { id: qcm.surveille, titre: `${MARQUEUR} surveille` },
    });
    const g = await avec(api().get('/api/surveillance/alertes'), 'g').expect(200);
    expect(
      (g.body as Array<{ formation: { id: string } }>).filter((a) => a.formation.id === formationId),
    ).toEqual([]);
    const admin = await avec(api().get('/api/surveillance/alertes'), 'admin').expect(200);
    expect(
      (admin.body as Array<{ tentativeId: string }>).filter((a) => tentatives.has(a.tentativeId))
        .length,
    ).toBe(f.body.length);
    await avec(api().get('/api/surveillance/alertes'), 'a').expect(403);
    await avec(api().get('/api/surveillance/alertes?statut=AUTRE'), 'f').expect(400);
    const nb = (await avec(api().get('/api/surveillance/alertes/a-examiner'), 'f').expect(200)).body;
    expect(nb).toEqual({ nombre: f.body.length });
    expect((await avec(api().get('/api/surveillance/alertes/a-examiner'), 'g').expect(200)).body)
      .toEqual({ nombre: 0 });
  });

  it('examen : examinée puis remise à examiner ; nouvelles d’abord ; non affecté 403 tracé ; 404 ; 400', async () => {
    const avant = (await avec(api().get('/api/surveillance/alertes?statut=NOUVEAU'), 'f').expect(200))
      .body as Array<{ id: string }>;
    const cible = avant[0].id;
    const res = await avec(api().patch(`/api/surveillance/alertes/${cible}`), 'f')
      .send({ statut: 'EXAMINE' })
      .expect(200);
    expect(res.body).toMatchObject({ id: cible, statut: 'EXAMINE', examineLe: expect.any(String) });
    const nb = (await avec(api().get('/api/surveillance/alertes/a-examiner'), 'f').expect(200)).body;
    expect(nb.nombre).toBe(avant.length - 1);
    const tout = (await avec(api().get('/api/surveillance/alertes'), 'f').expect(200)).body as Array<{
      id: string;
      statut: string;
    }>;
    expect(tout[tout.length - 1]).toMatchObject({ id: cible, statut: 'EXAMINE' });
    expect(
      (await avec(api().get('/api/surveillance/alertes?statut=EXAMINE'), 'f').expect(200)).body.map(
        (a: { id: string }) => a.id,
      ),
    ).toEqual([cible]);
    const retour = await avec(api().patch(`/api/surveillance/alertes/${cible}`), 'f')
      .send({ statut: 'NOUVEAU' })
      .expect(200);
    expect(retour.body).toMatchObject({ statut: 'NOUVEAU', examineLe: null });
    await avec(api().patch(`/api/surveillance/alertes/${cible}`), 'g')
      .send({ statut: 'EXAMINE' })
      .expect(403);
    const refus = await sql(
      `SELECT 1 FROM audit_logs WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1
          AND details_avant_apres->>'ressource' = 'evenements_surveillance'`,
      [ids.g],
    );
    expect(refus).toHaveLength(1);
    await avec(api().patch(`/api/surveillance/alertes/${cible}`), 'f')
      .send({ statut: 'FINI' })
      .expect(400);
    await avec(api().patch('/api/surveillance/alertes/00000000-0000-4000-8000-000000000000'), 'f')
      .send({ statut: 'EXAMINE' })
      .expect(404);
    const traces = await sql<{ d: { avant: string; apres: string } }>(
      `SELECT details_avant_apres AS d FROM audit_logs
        WHERE action = 'ALERTE_SURVEILLANCE_EXAMINEE' AND user_id = $1 ORDER BY horodatage`,
      [ids.f],
    );
    expect(traces.map((x) => [x.d.avant, x.d.apres])).toEqual([
      ['NOUVEAU', 'EXAMINE'],
      ['EXAMINE', 'NOUVEAU'],
    ]);
  });

  it('photo : lien signé de 2 min, image identique ; lien inconnu ou expiré 404 ; non affecté 403', async () => {
    const [alerte] = await sql<{ id: string }>(
      `SELECT id FROM evenements_surveillance WHERE tentative_id = $1 AND type = 'TELEPHONE'`,
      [t.a],
    );
    const lien = await avec(api().post(`/api/surveillance/alertes/${alerte.id}/lien`), 'f').expect(200);
    expect(lien.body).toEqual({
      url: expect.stringMatching(/^\/api\/surveillance\/alertes\/photo\/[A-Za-z0-9_-]{43}$/),
      expireDansSecondes: 120,
    });
    const image = await api().get(lien.body.url).expect(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toBe('no-store, private');
    expect((image.body as Buffer).equals(JPEG)).toBe(true);
    await api().get('/api/surveillance/alertes/photo/inconnu').expect(404);
    await redis.del(`${PREFIXE_JETON_ALERTE}${String(lien.body.url).split('/').pop()}`);
    await api().get(lien.body.url).expect(404);
    await avec(api().post(`/api/surveillance/alertes/${alerte.id}/lien`), 'g').expect(403);
    await avec(api().post(`/api/surveillance/alertes/${alerte.id}/lien`), 'a').expect(403);
  });

  it('alertes d’une tentative : dans l’ordre ; non affecté 403 ; inconnue 404', async () => {
    const res = await avec(api().get(`/api/tentatives/${t.a}/alertes-surveillance`), 'f').expect(200);
    expect((res.body as Array<{ type: string }>).map((a) => a.type)).toEqual([
      'TELEPHONE',
      'PERSONNES_MULTIPLES',
      'DOCUMENT',
    ]);
    await avec(api().get(`/api/tentatives/${t.a}/alertes-surveillance`), 'g').expect(403);
    await avec(api().get(`/api/tentatives/${t.a}/alertes-surveillance`), 'a').expect(403);
    await avec(
      api().get('/api/tentatives/00000000-0000-4000-8000-000000000000/alertes-surveillance'),
      'f',
    ).expect(404);
  });

  it('US-QCM-17 : listes du formateur — tentatives et suivi portent les alertes ; jamais l’apprenant', async () => {
    const attendu = async (tentativeId: string): Promise<{ total: number; aExaminer: number }> => {
      const [c] = await sql<{ total: number; a: number }>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE statut = 'NOUVEAU')::int AS a
           FROM evenements_surveillance WHERE tentative_id = $1`,
        [tentativeId],
      );
      return { total: c.total, aExaminer: c.a };
    };
    // Une alerte de b examinée : le compte « à examiner » baisse, le total non.
    const [uneDeB] = await sql<{ id: string }>(
      `SELECT id FROM evenements_surveillance WHERE tentative_id = $1 LIMIT 1`,
      [t.b],
    );
    await avec(api().patch(`/api/surveillance/alertes/${uneDeB.id}`), 'f')
      .send({ statut: 'EXAMINE' })
      .expect(200);
    const ta = await attendu(t.a);
    const tb = await attendu(t.b);
    expect(ta).toEqual({ total: 3, aExaminer: 3 });
    expect(tb.aExaminer).toBe(tb.total - 1);

    const liste = await avec(api().get(`/api/formateur/qcm/${qcm.surveille}/tentatives`), 'f').expect(
      200,
    );
    const parId = new Map(
      (liste.body as Array<{ id: string; alertesSurveillance: unknown }>).map((l) => [
        l.id,
        l.alertesSurveillance,
      ]),
    );
    expect(parId.get(t.a)).toEqual(ta);
    expect(parId.get(t.b)).toEqual(tb);
    const libre = await avec(api().get(`/api/formateur/qcm/${qcm.libre}/tentatives`), 'f').expect(200);
    expect(libre.body[0].alertesSurveillance).toEqual({ total: 0, aExaminer: 0 });
    await avec(api().get(`/api/formateur/qcm/${qcm.surveille}/tentatives`), 'g').expect(403);

    const suivi = await avec(api().get(`/api/formateur/formations/${formationId}/suivi`), 'f').expect(
      200,
    );
    const parApprenant = new Map(
      (suivi.body.apprenants as Array<{ id: string; surveillance: unknown }>).map((a) => [
        a.id,
        a.surveillance,
      ]),
    );
    expect(parApprenant.get(ids.a)).toEqual({ alertes: ta.total, aExaminer: ta.aExaminer });
    expect(parApprenant.get(ids.b)).toEqual({ alertes: tb.total, aExaminer: tb.aExaminer });
    expect(parApprenant.get(ids.c)).toEqual({ alertes: 0, aExaminer: 0 });
    expect(suivi.body.kpis.surveillanceAExaminer).toBe(ta.aExaminer + tb.aExaminer);
    const fiche = await avec(
      api().get(`/api/formateur/formations/${formationId}/apprenants/${ids.b}`),
      'f',
    ).expect(200);
    expect(fiche.body.apprenant.surveillance).toEqual({ alertes: tb.total, aExaminer: tb.aExaminer });

    // L'apprenant ne voit jamais ces comptes dans son historique.
    const mes = await avec(api().get('/api/mes-tentatives'), 'a').expect(200);
    expect(JSON.stringify(mes.body)).not.toContain('alertesSurveillance');
    const ma = await avec(api().get(`/api/mes-tentatives/${t.a}`), 'a').expect(200);
    expect(ma.body).not.toHaveProperty('alertesSurveillance');
  });

  it('PDF de la tentative : alertes listées pour le formateur, jamais pour l’apprenant', async () => {
    const soumise = await avec(api().post(`/api/tentatives/${t.a}/soumettre`), 'a').expect(200);
    expect(soumise.body.statut).toBe('NOTEE');
    const texte = async (r: request.Response): Promise<string> =>
      (await extrairePagesPdf(r.body as Buffer)).join(' ').replace(/\s+/g, ' ');
    const formateur = await texte(
      await avec(
        api().get(`/api/formateur/qcm/${qcm.surveille}/tentatives/${t.a}/rapport.pdf`),
        'f',
      ).expect(200),
    );
    expect(formateur).toContain('Alertes de surveillance (IA)');
    expect(formateur).toContain('Téléphone détecté — à examiner');
    expect(formateur).toContain('Plusieurs personnes devant la caméra');
    const apprenant = await texte(
      await avec(api().get(`/api/tentatives/${t.a}/rapport.pdf`), 'a').expect(200),
    );
    expect(apprenant).not.toContain('Alertes de surveillance');
    expect(apprenant).not.toContain('Téléphone détecté');
  });

  it('dépôt après la fin de la tentative : 409', async () => {
    await alerter(t.a, 'ABSENCE').expect(409);
  });

  it('purge : photos des alertes supprimées avec les captures (conservation, puis anonymisation)', async () => {
    const service = moduleRef.get(SurveillanceService);
    await sql(
      `UPDATE evenements_surveillance SET detecte_le = now() - interval '40 days' WHERE tentative_id = $1`,
      [t.a],
    );
    const anciennes = await sql<{ cle_stockage: string }>(
      `SELECT cle_stockage FROM evenements_surveillance WHERE tentative_id = $1`,
      [t.a],
    );
    expect(anciennes.length).toBe(3);
    await service.purger();
    expect(
      await sql(`SELECT 1 FROM evenements_surveillance WHERE tentative_id = $1`, [t.a]),
    ).toEqual([]);
    await expect(moduleRef.get(StockageService).lire(anciennes[0].cle_stockage)).rejects.toBeDefined();
    const [trace] = await sql<{ d: Record<string, unknown> }>(
      `SELECT details_avant_apres AS d FROM audit_logs
        WHERE action = 'CAPTURES_PURGEES' AND user_id IS NULL ORDER BY horodatage DESC LIMIT 1`,
    );
    expect(trace.d).toMatchObject({ nbAlertes: 3, cause: 'CONSERVATION' });
    // Anonymisation de l'apprenant b : toutes ses alertes, quel que soit leur âge.
    expect((await sql(`SELECT 1 FROM evenements_surveillance WHERE tentative_id = $1`, [t.b])).length).toBeGreaterThan(0);
    await service.purger({ apprenantId: ids.b, acteur: ids.admin });
    expect(await sql(`SELECT 1 FROM evenements_surveillance WHERE tentative_id = $1`, [t.b])).toEqual([]);
  });
});
