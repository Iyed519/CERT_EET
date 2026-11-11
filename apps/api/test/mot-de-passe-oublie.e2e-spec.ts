import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * E2E-AUTH06 — US-AUTH-06 : mot de passe oublié.
 *
 * Tout est réel (base, Redis, guards, ValidationPipe) sauf l'envoi d'email,
 * espionné : le jeton est lu dans le lien capté. Vérifie la réponse neutre
 * (anti-énumération), le stockage de l'empreinte seule, l'usage unique,
 * l'expiration, le remplacement par un nouveau lien, la révocation de toutes
 * les sessions, l'audit, les limites (429 par IP, quota silencieux par
 * adresse) et 6 réinitialisations simultanées avec le même lien.
 */
describe('E2E-AUTH06 — Mot de passe oublié (US-AUTH-06)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let redis: Redis;
  let lienMail: jest.SpyInstance;
  let confirmationMail: jest.SpyInstance;

  const PREFIXE = 'e2e-auth06-';
  const EMAIL = `${PREFIXE}actif@cert-eet.local`;
  const EMAIL_ATTENTE = `${PREFIXE}attente@cert-eet.local`;
  const EMAIL_INCONNU = `${PREFIXE}inconnu@cert-eet.local`;
  const ACTUEL = 'AncienPasse123';
  let userId = '';

  const nettoyer = async (): Promise<void> => {
    const ids = (
      (await dataSource.query(`SELECT id FROM users WHERE email LIKE $1`, [
        `${PREFIXE}%`,
      ])) as Array<{
        id: string;
      }>
    ).map((u) => u.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      if (ids.length > 0) {
        await qr.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [ids]);
      }
      await qr.query(
        `DELETE FROM audit_logs WHERE user_id IS NULL
           AND action IN ('MDP_RESET', 'LIMITE_REQUETES_ATTEINTE')
           AND adresse_ip IN ('127.0.0.1', '::1', '::ffff:127.0.0.1')`,
      );
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    if (ids.length > 0) {
      await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [ids]);
      await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    }
  };

  const viderLimites = async (): Promise<void> => {
    for (const motif of [
      'limite:mdp-oublie:*',
      'limite:mdp-reinitialisation:*',
      'limite:mdp-oublie-email:*',
    ]) {
      const cles = await redis.keys(motif);
      if (cles.length > 0) await redis.del(...cles);
    }
  };

  const demander = (email: string): request.Test =>
    request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email });

  const reinitialiser = (token: string, nouveauMotDePasse: string): request.Test =>
    request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, nouveauMotDePasse });

  /** Jeton contenu dans le dernier lien envoyé. */
  const dernierJeton = (): string => {
    const appels = lienMail.mock.calls;
    const lien = (appels[appels.length - 1][1] as { lien: string }).lien;
    return decodeURIComponent(new URL(lien).searchParams.get('token') as string);
  };

  const connecter = async (motDePasse: string): Promise<{ access: string; cookie: string }> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL, password: motDePasse })
      .expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refreshToken='),
    ) as string;
    return { access: res.body.accessToken as string, cookie: cookie.split(';')[0] };
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
    const mail = moduleRef.get(MailService);
    lienMail = jest.spyOn(mail, 'sendReinitialisationMotDePasseEmail').mockResolvedValue();
    confirmationMail = jest.spyOn(mail, 'sendMotDePasseModifieEmail').mockResolvedValue();
    await nettoyer();
    const hash = await bcrypt.hash(ACTUEL, 4);
    const lignes = (await dataSource.query(
      `INSERT INTO users (email, nom, prenom, mot_de_passe_hash, role, statut, profil_complet)
       VALUES ($1, 'Test', 'Auth06', $3, 'APPRENANT', 'ACTIF', true),
              ($2, 'Test', 'Attente', $3, 'APPRENANT', 'EN_ATTENTE_ACTIVATION', false)
       RETURNING id, email`,
      [EMAIL, EMAIL_ATTENTE, hash],
    )) as Array<{ id: string; email: string }>;
    userId = (lignes.find((l) => l.email === EMAIL) as { id: string }).id;
  });

  afterAll(async () => {
    await viderLimites();
    await nettoyer();
    await app.close();
  });

  beforeEach(async () => {
    lienMail.mockClear();
    confirmationMail.mockClear();
    await viderLimites();
  });

  it('demande : 400 mal formée ; réponse IDENTIQUE pour inconnu, en attente et actif ; seul l’actif reçoit un lien', async () => {
    await demander('pas-un-email').expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: EMAIL, role: 'ADMINISTRATEUR' })
      .expect(400);
    const inconnu = await demander(EMAIL_INCONNU).expect(200);
    const attente = await demander(EMAIL_ATTENTE).expect(200);
    const actif = await demander(EMAIL).expect(200);
    expect(inconnu.body).toEqual(actif.body);
    expect(attente.body).toEqual(actif.body);
    expect(actif.body.message).toMatch(/Si un compte actif correspond/);
    expect(lienMail).toHaveBeenCalledTimes(1);
    expect(lienMail.mock.calls[0][0]).toBe(EMAIL);
    expect(lienMail.mock.calls[0][1]).toMatchObject({ prenom: 'Auth06', minutes: 30 });
  });

  it('le jeton n’est stocké que sous forme d’empreinte SHA-256, avec une échéance de 30 minutes', async () => {
    await demander(EMAIL).expect(200);
    const jeton = dernierJeton();
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const lignes = (await dataSource.query(
      `SELECT empreinte, objet, utilise_le,
              round(extract(epoch FROM expire_le - cree_le)) AS duree
         FROM jetons_lien_email WHERE user_id = $1 AND utilise_le IS NULL`,
      [userId],
    )) as Array<{ empreinte: string; objet: string; utilise_le: Date | null; duree: string }>;
    expect(lignes).toHaveLength(1);
    expect(lignes[0].empreinte).toBe(crypto.createHash('sha256').update(jeton).digest('hex'));
    expect(lignes[0].objet).toBe('REINITIALISATION_MDP');
    expect(Number(lignes[0].duree)).toBe(1800);
    const brut = (await dataSource.query(
      `SELECT count(*)::int AS n FROM jetons_lien_email WHERE empreinte = $1`,
      [jeton],
    )) as Array<{ n: number }>;
    expect(brut[0].n).toBe(0);
  });

  it('réinitialisation : 400 lien mal formé / inconnu / mot de passe faible (sans consommer le lien)', async () => {
    await demander(EMAIL).expect(200);
    const jeton = dernierJeton();
    await reinitialiser('court', 'Nouveau123').expect(400);
    const inconnu = await reinitialiser(crypto.randomBytes(32).toString('base64url'), 'Nouveau123');
    expect(inconnu.status).toBe(400);
    expect(inconnu.body.message).toMatch(/invalide, expiré ou déjà utilisé/);
    await reinitialiser(jeton, 'faible').expect(400);
    // Le lien reste utilisable après un mot de passe refusé par la politique.
    const actifs = (await dataSource.query(
      `SELECT count(*)::int AS n FROM jetons_lien_email WHERE user_id = $1 AND utilise_le IS NULL`,
      [userId],
    )) as Array<{ n: number }>;
    expect(actifs[0].n).toBe(1);
  });

  it('un nouveau lien remplace le précédent ; un lien expiré ou d’un autre usage est refusé', async () => {
    await demander(EMAIL).expect(200);
    const premier = dernierJeton();
    await demander(EMAIL).expect(200);
    const second = dernierJeton();
    expect(second).not.toBe(premier);
    await reinitialiser(premier, 'Nouveau123').expect(400);
    // Expiration forcée du second (création et échéance reculées d'une heure).
    await dataSource.query(
      `UPDATE jetons_lien_email SET cree_le = cree_le - interval '2 hours',
              expire_le = now() - interval '1 minute'
        WHERE empreinte = $1`,
      [crypto.createHash('sha256').update(second).digest('hex')],
    );
    await reinitialiser(second, 'Nouveau123').expect(400);
    // Un jeton valable mais émis pour un AUTRE usage (activation) est refusé.
    const activation = crypto.randomBytes(32).toString('base64url');
    await dataSource.query(
      `INSERT INTO jetons_lien_email (user_id, objet, empreinte, expire_le)
       VALUES ($1, 'ACTIVATION_COMPTE', $2, now() + interval '1 hour')`,
      [userId, crypto.createHash('sha256').update(activation).digest('hex')],
    );
    await reinitialiser(activation, 'Nouveau123').expect(400);
    // Le mot de passe n'a pas changé.
    await connecter(ACTUEL);
  });

  it('nominal : mot de passe remplacé, toutes les sessions révoquées, lien à usage unique, audit, email', async () => {
    const a = await connecter(ACTUEL);
    const b = await connecter(ACTUEL);
    await demander(EMAIL).expect(200);
    const jeton = dernierJeton();
    const res = await reinitialiser(jeton, 'Reinitialise789').expect(200);
    expect(res.body.message).toMatch(/réinitialisé/);
    for (const s of [a, b]) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${s.access}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', s.cookie)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL, password: ACTUEL })
      .expect(401);
    await connecter('Reinitialise789');
    // Usage unique.
    await reinitialiser(jeton, 'EncoreAutre123').expect(400);
    expect(confirmationMail).toHaveBeenCalledTimes(1);
    const audits = (await dataSource.query(
      `SELECT action, resultat, details_avant_apres AS d FROM audit_logs
        WHERE user_id = $1 AND action IN ('MDP_RESET', 'MDP_RESET_DEMANDE') ORDER BY horodatage`,
      [userId],
    )) as Array<{ action: string; resultat: string; d: Record<string, unknown> | null }>;
    const reset = audits.filter((x) => x.action === 'MDP_RESET');
    expect(reset).toHaveLength(1);
    expect(reset[0]).toMatchObject({ resultat: 'Succès' });
    expect(Number(reset[0].d?.sessionsRevoquees)).toBeGreaterThanOrEqual(2);
    expect(audits.some((x) => x.action === 'MDP_RESET_DEMANDE' && x.resultat === 'Succès')).toBe(
      true,
    );
    expect(JSON.stringify(audits)).not.toContain(jeton);
  });

  it('limites : 429 par IP à la 6e demande (Retry-After, audit) ; quota silencieux de 3 liens par heure et par adresse', async () => {
    for (let i = 0; i < 5; i += 1) {
      await demander(EMAIL).expect(200);
    }
    // 3 liens seulement sur 5 demandes acceptées (quota par adresse).
    expect(lienMail).toHaveBeenCalledTimes(3);
    const refus = await demander(EMAIL).expect(429);
    expect(Number(refus.headers['retry-after'])).toBeGreaterThan(0);
    expect(lienMail).toHaveBeenCalledTimes(3);
    const traces = (await dataSource.query(
      `SELECT details_avant_apres AS d FROM audit_logs
        WHERE action = 'LIMITE_REQUETES_ATTEINTE' AND details_avant_apres->>'limite' = 'mdp-oublie'
          AND horodatage > now() - interval '1 minute'`,
    )) as Array<{ d: { route: string } }>;
    expect(traces.length).toBeGreaterThanOrEqual(1);
    expect(traces[0].d.route).toBe('/api/auth/forgot-password');
  });

  it('concurrence forcée : 6 réinitialisations simultanées avec le même lien -> une seule réussit', async () => {
    await demander(EMAIL).expect(200);
    const jeton = dernierJeton();
    const reponses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => reinitialiser(jeton, `Simultane${i}Passe`)),
    );
    const statuts = reponses.map((r) => r.status);
    expect(statuts.filter((s) => s === 200)).toHaveLength(1);
    expect(statuts.filter((s) => s === 400)).toHaveLength(5);
    const gagnant = statuts.indexOf(200);
    await connecter(`Simultane${gagnant}Passe`);
    expect(confirmationMail).toHaveBeenCalledTimes(1);
  });
});
