import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { StockageService } from '../src/stockage/stockage.service';
import { SurveillanceService } from '../src/modules/surveillance/surveillance.service';

/**
 * E2E-QCM12 — US-QCM-12 : surveillance webcam par captures.
 *
 * Tout est réel (base, Redis, stockage S3, guards). Vérifie : le paramètre du
 * formateur visible dans « Mon espace » ; le consentement exigé pour créer une
 * tentative d'un QCM surveillé (refus clair, tracé) ; le refus explicite
 * journalisé avec la procédure alternative ; le consentement horodaté et
 * journalisé ; le dépôt des captures (contrôles d'image, de taille, d'écart,
 * de propriétaire, d'état) ; la revue réservée au formateur affecté et à
 * l'administrateur (403 tracé sinon), par lien signé de courte durée ; la
 * purge des captures trop anciennes (journalisée) ; la suppression des
 * captures à l'anonymisation du compte ; 5 dépôts simultanés -> un seul.
 */
describe('E2E-QCM12 — Surveillance webcam par captures (US-QCM-12)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let redis: Redis;
  const PREFIXE = 'e2e-qcm12-';
  const MARQUEUR = 'E2E-QCM12';
  const MDP = 'Passe123456';
  const email = (n: string): string => `${PREFIXE}${n}@cert-eet.local`;
  const ids: Record<string, string> = {};
  const jetons: Record<string, string> = {};
  let formationId = '';
  const qcm: Record<string, string> = {};
  let tentativeSurveillee = '';
  let tentativeLibre = '';

  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]);

  const nettoyer = async (): Promise<void> => {
    const users = (
      (await dataSource.query(`SELECT id FROM users WHERE email LIKE $1 OR id = ANY($2::uuid[])`, [
        `${PREFIXE}%`,
        Object.values(ids),
      ])) as Array<{ id: string }>
    ).map((u) => u.id);
    const cles = (
      (await dataSource.query(
        `SELECT c.cle_stockage FROM captures_webcam c JOIN tentatives_qcm t ON t.id = c.tentative_id
          WHERE t.apprenant_id = ANY($1::uuid[])`,
        [users],
      )) as Array<{ cle_stockage: string }>
    ).map((c) => c.cle_stockage);
    await moduleRef.get(StockageService).supprimer(cles);
    const formations = (
      (await dataSource.query(`SELECT id FROM formations WHERE titre LIKE $1`, [
        `${MARQUEUR}%`,
      ])) as Array<{
        id: string;
      }>
    ).map((f) => f.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(
        `DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[]) OR cible = ANY($2::text[])
            OR (action = 'CAPTURES_PURGEES' AND user_id IS NULL AND horodatage > now() - interval '1 hour')`,
        [users, [...users, ...formations, ...Object.values(qcm)].map(String)],
      );
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    if (users.length > 0) {
      await dataSource.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1::uuid[])`, [
        users,
      ]);
      await dataSource.query(`DELETE FROM inscriptions WHERE apprenant_id = ANY($1::uuid[])`, [
        users,
      ]);
      await dataSource.query(`DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])`, [users]);
    }
    await dataSource.query(
      `DELETE FROM formation_formateurs WHERE formation_id = ANY($1::uuid[])`,
      [formations],
    );
    await dataSource.query(`DELETE FROM qcm WHERE titre LIKE $1`, [`${MARQUEUR}%`]);
    await dataSource.query(`DELETE FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`]);
    if (users.length > 0)
      await dataSource.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
  };

  const api = (): request.SuperTest<request.Test> =>
    request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;

  const deposer = (tentativeId: string, contenu: Buffer, jeton = jetons.a): request.Test =>
    api()
      .post(`/api/tentatives/${tentativeId}/captures`)
      .set('Authorization', `Bearer ${jeton}`)
      .attach('capture', contenu, { filename: 'capture.jpg', contentType: 'image/jpeg' });

  /** Recule la dernière capture : la suivante respecte l'écart minimal. */
  const reculerCaptures = async (tentativeId: string, minutes = 10): Promise<void> => {
    await dataSource.query(
      `UPDATE captures_webcam SET prise_le = prise_le - make_interval(mins => $2) WHERE tentative_id = $1`,
      [tentativeId, minutes],
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
    await app.init();
    await app.listen(0);
    dataSource = moduleRef.get(DataSource, { strict: false });
    redis = moduleRef.get<Redis>(REDIS_CLIENT);
    await nettoyer();
    const hash = await bcrypt.hash(MDP, 4);
    for (const [cle, role] of [
      ['a', 'APPRENANT'],
      ['b', 'APPRENANT'],
      ['f', 'FORMATEUR'],
      ['g', 'FORMATEUR'],
      ['admin', 'ADMINISTRATEUR'],
    ] as const) {
      const [u] = (await dataSource.query(
        `INSERT INTO users (email, nom, prenom, mot_de_passe_hash, role, statut, profil_complet)
         VALUES ($1, 'Test', $2, $3, $4, 'ACTIF', true) RETURNING id`,
        [email(cle), cle, hash, role],
      )) as Array<{ id: string }>;
      ids[cle] = u.id;
      const res = await api()
        .post('/api/auth/login')
        .send({ email: email(cle), password: MDP })
        .expect(200);
      jetons[cle] = res.body.accessToken as string;
    }
    const [f] = (await dataSource.query(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Réseaux`],
    )) as Array<{ id: string }>;
    formationId = f.id;
    const [m] = (await dataSource.query(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Routage', 1) RETURNING id`,
      [formationId],
    )) as Array<{ id: string }>;
    for (const [cle, proctoring] of [
      ['surveille', true],
      ['libre', false],
    ] as const) {
      const [q] = (await dataSource.query(
        `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
        [m.id, `${MARQUEUR} ${cle}`],
      )) as Array<{ id: string }>;
      qcm[cle] = q.id;
      await dataSource.query(
        `INSERT INTO config_anti_fraude (qcm_id, duree_max_minutes, date_ouverture, date_fermeture,
            nb_tentatives_max, delai_entre_tentatives, affichage_resultats, score_min_validation,
            ponderation_formation, proctoring_webcam)
         VALUES ($1, 30, now() - interval '1 day', now() + interval '10 days', 3, 0, 'DIFFERE', 60, 10, $2)`,
        [q.id, proctoring],
      );
    }
    await dataSource.query(
      `INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $3), ($2, $3)`,
      [ids.a, ids.b, formationId],
    );
    await dataSource.query(
      `INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`,
      [formationId, ids.f],
    );
  }, 60_000);

  afterAll(async () => {
    const cles = await redis.keys('limite:surveillance-refus:*');
    if (cles.length > 0) await redis.del(...cles);
    await nettoyer();
    await app.close();
  });

  it('« Mon espace » indique le QCM surveillé ; sans consentement, aucune tentative et un refus clair, tracé', async () => {
    const espace = await api()
      .get(`/api/formations/${formationId}/mon-espace`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .expect(200);
    const qcms = (
      espace.body.modules[0].qcms as Array<{ id: string; surveillanceWebcam: boolean }>
    ).reduce<Record<string, boolean>>((acc, q) => ({ ...acc, [q.id]: q.surveillanceWebcam }), {});
    expect(qcms).toEqual({ [qcm.surveille]: true, [qcm.libre]: false });

    for (const corps of [{}, { consentementSurveillance: false }]) {
      const res = await api()
        .post(`/api/qcm/${qcm.surveille}/tentatives`)
        .set('Authorization', `Bearer ${jetons.a}`)
        .send(corps)
        .expect(409);
      expect(res.body).toMatchObject({ raison: 'consentement_surveillance_requis' });
      expect(res.body.message).toMatch(/passage surveillé en présentiel/);
    }
    await api()
      .post(`/api/qcm/${qcm.surveille}/tentatives`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .send({ consentementSurveillance: 'oui' })
      .expect(400);
    const n = (await dataSource.query(
      `SELECT count(*)::int AS n FROM tentatives_qcm WHERE apprenant_id = $1`,
      [ids.a],
    )) as Array<{ n: number }>;
    expect(n[0].n).toBe(0);
    const refus = (await dataSource.query(
      `SELECT details_avant_apres->>'raison' AS raison FROM audit_logs
        WHERE user_id = $1 AND action = 'TENTATIVE_DEMARREE' AND resultat = 'Échec'`,
      [ids.a],
    )) as Array<{ raison: string }>;
    expect(refus.map((r) => r.raison)).toEqual([
      'consentement_surveillance_requis',
      'consentement_surveillance_requis',
    ]);
  });

  it('refus explicite ou caméra absente : procédure alternative, refus journalisé ; QCM non surveillé 404 ; motif invalide 400 ; formateur 403', async () => {
    const res = await api()
      .post(`/api/qcm/${qcm.surveille}/surveillance/refus`)
      .set('Authorization', `Bearer ${jetons.b}`)
      .send({ motif: 'CAMERA_INDISPONIBLE' })
      .expect(200);
    expect(res.body.message).toMatch(/passage surveillé en présentiel/);
    const [trace] = (await dataSource.query(
      `SELECT cible, details_avant_apres->>'motif' AS motif FROM audit_logs
        WHERE user_id = $1 AND action = 'SURVEILLANCE_REFUSEE'`,
      [ids.b],
    )) as Array<{ cible: string; motif: string }>;
    expect(trace).toEqual({ cible: qcm.surveille, motif: 'CAMERA_INDISPONIBLE' });
    await api()
      .post(`/api/qcm/${qcm.libre}/surveillance/refus`)
      .set('Authorization', `Bearer ${jetons.b}`)
      .send({ motif: 'REFUS' })
      .expect(404);
    await api()
      .post(`/api/qcm/${qcm.surveille}/surveillance/refus`)
      .set('Authorization', `Bearer ${jetons.b}`)
      .send({ motif: 'AUTRE' })
      .expect(400);
    await api()
      .post(`/api/qcm/${qcm.surveille}/surveillance/refus`)
      .set('Authorization', `Bearer ${jetons.f}`)
      .send({ motif: 'REFUS' })
      .expect(403);
  });

  it('avec consentement : tentative créée, consentement horodaté et journalisé, surveillance active pour la page ; QCM libre : rien à consentir', async () => {
    const res = await api()
      .post(`/api/qcm/${qcm.surveille}/tentatives`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .send({ consentementSurveillance: true })
      .expect(201);
    tentativeSurveillee = res.body.id as string;
    const [t] = (await dataSource.query(
      `SELECT consentement_surveillance_le IS NOT NULL AS consenti FROM tentatives_qcm WHERE id = $1`,
      [tentativeSurveillee],
    )) as Array<{ consenti: boolean }>;
    expect(t.consenti).toBe(true);
    const [trace] = (await dataSource.query(
      `SELECT details_avant_apres AS d FROM audit_logs WHERE action = 'CONSENTEMENT_SURVEILLANCE' AND cible = $1`,
      [tentativeSurveillee],
    )) as Array<{ d: Record<string, unknown> }>;
    expect(trace.d).toMatchObject({ qcmId: qcm.surveille, notice: 'v1-2026-11' });
    const vue = await api()
      .get(`/api/tentatives/${tentativeSurveillee}`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .expect(200);
    expect(vue.body.surveillance).toEqual({ active: true, intervalleSecondes: 120 });

    const libre = await api()
      .post(`/api/qcm/${qcm.libre}/tentatives`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .expect(201);
    tentativeLibre = libre.body.id as string;
    const vueLibre = await api()
      .get(`/api/tentatives/${tentativeLibre}`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .expect(200);
    expect(vueLibre.body.surveillance.active).toBe(false);
  });

  it('dépôt : 201 ; trop rapproché 429 ; autre apprenant 404 ; pas une image 400 ; > 100 Ko 413 ; sans fichier 400 ; QCM non surveillé 409', async () => {
    const r = await deposer(tentativeSurveillee, JPEG).expect(201);
    expect(r.body).toMatchObject({ tailleOctets: JPEG.length });
    const rapproche = await deposer(tentativeSurveillee, JPEG).expect(429);
    expect(rapproche.body.message).toMatch(/trop rapprochée/);
    await reculerCaptures(tentativeSurveillee);
    await deposer(tentativeSurveillee, JPEG, jetons.b).expect(404);
    await deposer(tentativeSurveillee, Buffer.from('GIF89a pas un jpeg')).expect(400);
    await deposer(tentativeSurveillee, Buffer.concat([JPEG, Buffer.alloc(100 * 1024, 1)])).expect(
      413,
    );
    await api()
      .post(`/api/tentatives/${tentativeSurveillee}/captures`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .field('autre', 'x')
      .expect(400);
    await deposer(tentativeLibre, JPEG).expect(409);
    await deposer(tentativeSurveillee, JPEG, jetons.f).expect(403);
  });

  it('concurrence forcée : 5 dépôts simultanés -> un seul enregistré, les autres trop rapprochés', async () => {
    await reculerCaptures(tentativeSurveillee);
    const avant = (await dataSource.query(
      `SELECT count(*)::int AS n FROM captures_webcam WHERE tentative_id = $1`,
      [tentativeSurveillee],
    )) as Array<{ n: number }>;
    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => deposer(tentativeSurveillee, JPEG)),
    );
    const statuts = reponses.map((x) => x.status);
    expect(statuts.filter((s) => s === 201)).toHaveLength(1);
    expect(statuts.filter((s) => s === 429)).toHaveLength(4);
    const apres = (await dataSource.query(
      `SELECT count(*)::int AS n FROM captures_webcam WHERE tentative_id = $1`,
      [tentativeSurveillee],
    )) as Array<{ n: number }>;
    expect(apres[0].n).toBe(avant[0].n + 1);
  });

  it('revue : formateur affecté et administrateur seulement (403 tracé sinon), consultation journalisée, image par lien signé de courte durée', async () => {
    await api()
      .get(`/api/tentatives/${tentativeSurveillee}/captures`)
      .set('Authorization', `Bearer ${jetons.g}`)
      .expect(403);
    const [refus] = (await dataSource.query(
      `SELECT details_avant_apres->>'ressource' AS r FROM audit_logs
        WHERE user_id = $1 AND action = 'ACCES_RESSOURCE_REFUSE' AND cible = $2`,
      [ids.g, formationId],
    )) as Array<{ r: string }>;
    expect(refus.r).toBe('captures_webcam');
    await api()
      .get(`/api/tentatives/${tentativeSurveillee}/captures`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .expect(403);
    const liste = await api()
      .get(`/api/tentatives/${tentativeSurveillee}/captures`)
      .set('Authorization', `Bearer ${jetons.f}`)
      .expect(200);
    expect(liste.body).toMatchObject({ tentativeId: tentativeSurveillee, conservationJours: 30 });
    expect(liste.body.consentementLe).toEqual(expect.any(String));
    expect(liste.body.captures).toHaveLength(2);
    await api()
      .get(`/api/tentatives/${tentativeSurveillee}/captures`)
      .set('Authorization', `Bearer ${jetons.admin}`)
      .expect(200);
    const consultations = (await dataSource.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'CAPTURES_CONSULTEES' AND cible = $1`,
      [tentativeSurveillee],
    )) as Array<{ n: number }>;
    expect(consultations[0].n).toBe(2);

    const captureId = liste.body.captures[0].id as string;
    await api()
      .post(`/api/captures/${captureId}/lien`)
      .set('Authorization', `Bearer ${jetons.g}`)
      .expect(403);
    const lien = await api()
      .post(`/api/captures/${captureId}/lien`)
      .set('Authorization', `Bearer ${jetons.f}`)
      .expect(200);
    expect(lien.body.expireDansSecondes).toBe(120);
    const image = await api()
      .get(lien.body.url as string)
      .buffer(true)
      .parse((res, fin) => {
        const morceaux: Buffer[] = [];
        res.on('data', (m: Buffer) => morceaux.push(m));
        res.on('end', () => fin(null, Buffer.concat(morceaux)));
      })
      .expect(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toBe('no-store, private');
    expect(Buffer.compare(image.body as Buffer, JPEG)).toBe(0);
    await api()
      .get(`/api/captures/fichier/${'A'.repeat(43)}`)
      .expect(404);
  });

  it('tentative terminée : plus aucune capture acceptée (409)', async () => {
    await api()
      .post(`/api/tentatives/${tentativeSurveillee}/soumettre`)
      .set('Authorization', `Bearer ${jetons.a}`)
      .expect((r) => expect([200, 201]).toContain(r.status));
    await reculerCaptures(tentativeSurveillee);
    await deposer(tentativeSurveillee, JPEG).expect(409);
  });

  it('purge : captures plus anciennes que la conservation supprimées (stockage et base), suppression journalisée', async () => {
    const [ancienne] = (await dataSource.query(
      `SELECT id, cle_stockage FROM captures_webcam WHERE tentative_id = $1 ORDER BY prise_le LIMIT 1`,
      [tentativeSurveillee],
    )) as Array<{ id: string; cle_stockage: string }>;
    await dataSource.query(
      `UPDATE captures_webcam SET prise_le = now() - interval '31 days' WHERE id = $1`,
      [ancienne.id],
    );
    const supprimees = await moduleRef.get(SurveillanceService).purger();
    expect(supprimees).toBeGreaterThanOrEqual(1);
    const reste = (await dataSource.query(
      `SELECT count(*)::int AS n FROM captures_webcam WHERE id = $1`,
      [ancienne.id],
    )) as Array<{ n: number }>;
    expect(reste[0].n).toBe(0);
    await expect(moduleRef.get(StockageService).lire(ancienne.cle_stockage)).rejects.toBeDefined();
    const [trace] = (await dataSource.query(
      `SELECT details_avant_apres AS d FROM audit_logs
        WHERE action = 'CAPTURES_PURGEES' AND user_id IS NULL ORDER BY horodatage DESC LIMIT 1`,
    )) as Array<{ d: Record<string, unknown> }>;
    expect(trace.d).toMatchObject({ cause: 'CONSERVATION', conservationJours: 30 });
    expect(JSON.stringify(trace.d)).not.toMatch(/surveillance\/|@/);
  });

  it('anonymisation du compte (US-CPT-04) : ses captures sont supprimées, la tentative reste', async () => {
    const avant = (await dataSource.query(
      `SELECT count(*)::int AS n FROM captures_webcam WHERE tentative_id = $1`,
      [tentativeSurveillee],
    )) as Array<{ n: number }>;
    expect(avant[0].n).toBeGreaterThanOrEqual(1);
    const res = await api()
      .post(`/api/admin/users/${ids.a}/anonymiser`)
      .set('Authorization', `Bearer ${jetons.admin}`)
      .send({ motDePasseAdmin: MDP, confirmation: 'ANONYMISER' })
      .expect(200);
    expect(res.body.statut).toBe('ANONYMISE');
    const apres = (await dataSource.query(
      `SELECT count(*)::int AS n FROM captures_webcam WHERE tentative_id = $1`,
      [tentativeSurveillee],
    )) as Array<{ n: number }>;
    expect(apres[0].n).toBe(0);
    const [trace] = (await dataSource.query(
      `SELECT details_avant_apres AS d FROM audit_logs WHERE action = 'COMPTE_ANONYMISE' AND cible = $1 AND resultat = 'Succès'`,
      [ids.a],
    )) as Array<{ d: Record<string, number> }>;
    expect(trace.d.capturesWebcamSupprimees).toBe(avant[0].n);
    const tentatives = (await dataSource.query(
      `SELECT count(*)::int AS n FROM tentatives_qcm WHERE apprenant_id = $1`,
      [ids.a],
    )) as Array<{ n: number }>;
    expect(tentatives[0].n).toBe(2);
  });
});
