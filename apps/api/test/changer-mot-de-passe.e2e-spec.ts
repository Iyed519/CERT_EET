import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { MailService } from '../src/mail/mail.service';
import { RedisService } from '../src/redis/redis.service';
import { AuthService } from '../src/modules/auth/auth.service';

/**
 * E2E-AUTH08 — US-AUTH-08 : changer son mot de passe (utilisateur connecté).
 *
 * Tout est réel (base, Redis, guards, ValidationPipe) sauf l'envoi d'email,
 * espionné. Vérifie : accès, validation, mot de passe actuel faux (401 sans
 * effet), compte OAuth (409), révocation de TOUTES les sessions (jetons
 * d'accès et refresh, en base et dans Redis), audit, email, et N changements
 * simultanés avec le même ancien mot de passe -> un seul succès.
 */
describe('E2E-AUTH08 — Changer mon mot de passe (US-AUTH-08)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let redis: RedisService;
  let mail: jest.SpyInstance;

  const PREFIXE = 'e2e-auth08-';
  const EMAIL = `${PREFIXE}apprenant@cert-eet.local`;
  const EMAIL_OAUTH = `${PREFIXE}oauth@cert-eet.local`;
  const EMAIL_COURSE = `${PREFIXE}course@cert-eet.local`;
  const ACTUEL = 'AncienPasse123';
  const NOUVEAU = 'NouveauPasse456';

  const nettoyer = async (): Promise<void> => {
    const ids = (
      (await dataSource.query(`SELECT id FROM users WHERE email LIKE $1`, [
        `${PREFIXE}%`,
      ])) as Array<{
        id: string;
      }>
    ).map((u) => u.id);
    if (ids.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [ids]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [ids]);
    await dataSource.query('DELETE FROM comptes_oauth WHERE user_id = ANY($1)', [ids]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  };

  const creer = async (email: string, motDePasse: string | null): Promise<User> =>
    userRepository.save(
      userRepository.create({
        email,
        nom: 'Test',
        prenom: 'Auth08',
        motDePasseHash: motDePasse ? await bcrypt.hash(motDePasse, 4) : null,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
        profilComplet: true,
      }),
    );

  /** Connexion : renvoie l'access token et le cookie refresh. */
  const connecter = async (
    email: string,
    motDePasse: string,
  ): Promise<{ access: string; cookie: string; refresh: string }> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: motDePasse })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((c) => c.startsWith('refreshToken=')) as string;
    const refresh = cookie.split(';')[0].slice('refreshToken='.length);
    return { access: res.body.accessToken as string, cookie: cookie.split(';')[0], refresh };
  };

  const changer = (access: string, corps: Record<string, unknown>): request.Test =>
    request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send(corps);

  const auditsDe = async (
    userId: string,
  ): Promise<
    Array<{ action: string; resultat: string; details: Record<string, unknown> | null }>
  > =>
    dataSource.query(
      `SELECT action, resultat, details_avant_apres AS details FROM audit_logs
        WHERE user_id = $1 AND action = 'MDP_CHANGE' ORDER BY horodatage`,
      [userId],
    );

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
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    redis = moduleRef.get(RedisService);
    mail = jest.spyOn(moduleRef.get(MailService), 'sendMotDePasseModifieEmail').mockResolvedValue();
    await nettoyer();
  });

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  beforeEach(() => mail.mockClear());

  it('accès et validation : 401 sans jeton ; 400 politique, champ inconnu, identique', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .send({ motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU })
      .expect(401);
    const user = await creer(EMAIL, ACTUEL);
    const { access } = await connecter(EMAIL, ACTUEL);
    await changer(access, { motDePasseActuel: ACTUEL, nouveauMotDePasse: 'court1' }).expect(400);
    await changer(access, { motDePasseActuel: ACTUEL, nouveauMotDePasse: 'sanschiffres' }).expect(
      400,
    );
    await changer(access, {
      motDePasseActuel: ACTUEL,
      nouveauMotDePasse: `${'a'.repeat(72)}1`,
    }).expect(400);
    await changer(access, {
      motDePasseActuel: ACTUEL,
      nouveauMotDePasse: NOUVEAU,
      role: 'ADMINISTRATEUR',
    }).expect(400);
    await changer(access, { nouveauMotDePasse: NOUVEAU }).expect(400);
    const identique = await changer(access, {
      motDePasseActuel: ACTUEL,
      nouveauMotDePasse: ACTUEL,
    });
    expect(identique.status).toBe(400);
    expect(identique.body.message).toMatch(/différent/);
    // Rien n'a changé : la session fonctionne et l'ancien mot de passe aussi.
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(await auditsDe(user.id)).toEqual([]);
  });

  it('mot de passe actuel faux : 401 avec code stable, rien de modifié, session conservée, audit Échec', async () => {
    const user = (await userRepository.findOne({ where: { email: EMAIL } })) as User;
    const hashAvant = user.motDePasseHash;
    const { access } = await connecter(EMAIL, ACTUEL);
    const res = await changer(access, {
      motDePasseActuel: 'Mauvais123',
      nouveauMotDePasse: NOUVEAU,
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      code: 'MOT_DE_PASSE_ACTUEL_INCORRECT',
      message: 'Mot de passe actuel incorrect.',
    });
    expect(
      ((await userRepository.findOne({ where: { id: user.id } })) as User).motDePasseHash,
    ).toBe(hashAvant);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    const audits = await auditsDe(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ resultat: 'Échec' });
    expect(JSON.stringify(audits[0].details)).not.toContain('Mauvais123');
    expect(mail).not.toHaveBeenCalled();
  });

  it('compte sans mot de passe local (connexion sociale) : 409', async () => {
    const oauth = await creer(EMAIL_OAUTH, null);
    // Pas de login par mot de passe possible : on forge une session réelle
    // via le service d'authentification OAuth.
    const session = await moduleRef.get(AuthService).loginWithOauth(
      {
        provider: 'google',
        providerId: `auth08-${crypto.randomUUID()}`,
        email: oauth.email,
        nom: null,
        prenom: null,
      },
      { adresseIp: null, userAgent: null },
    );
    const res = await changer(session.accessToken, {
      motDePasseActuel: 'Nimporte123',
      nouveauMotDePasse: NOUVEAU,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SANS_MOT_DE_PASSE_LOCAL');
    await dataSource.query('DELETE FROM comptes_oauth WHERE user_id = $1', [oauth.id]);
  });

  it('nominal : toutes les sessions révoquées (accès + refresh, base + Redis), audit, email, nouveau mot de passe seul valable', async () => {
    const user = (await userRepository.findOne({ where: { email: EMAIL } })) as User;
    const a = await connecter(EMAIL, ACTUEL);
    const b = await connecter(EMAIL, ACTUEL);
    const res = await changer(a.access, { motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU });
    expect(res.status).toBe(200);
    expect(res.body.sessionsRevoquees).toBeGreaterThanOrEqual(2);
    expect(res.body.message).toMatch(/Toutes vos sessions ont été déconnectées/);
    // Cookie refresh effacé par la réponse.
    const efface = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refreshToken=;'),
    );
    expect(efface).toBeDefined();

    // Jetons d'accès des DEUX sessions refusés immédiatement (même seconde).
    for (const access of [a.access, b.access]) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(401);
    }
    // Refresh des deux sessions refusé ; inactifs en base et sur la denylist Redis.
    for (const s of [a, b]) {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', s.cookie)
        .expect(401);
      const hash = crypto.createHash('sha256').update(s.refresh).digest('hex');
      expect(await redis.exists(`denylist:refresh:${hash}`)).toBe(true);
    }
    const actives = (await dataSource.query(
      'SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND active',
      [user.id],
    )) as Array<{ n: number }>;
    expect(actives[0].n).toBe(0);

    // Ancien mot de passe refusé, nouveau accepté ; la nouvelle session marche.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL, password: ACTUEL })
      .expect(401);
    const c = await connecter(EMAIL, NOUVEAU);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${c.access}`)
      .expect(200);

    const audits = await auditsDe(user.id);
    expect(audits[audits.length - 1]).toMatchObject({ resultat: 'Succès' });
    expect(audits[audits.length - 1].details).toMatchObject({
      sessionsRevoquees: res.body.sessionsRevoquees,
    });
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail).toHaveBeenCalledWith(EMAIL, { prenom: 'Auth08' });
  });

  it('concurrence forcée : 6 changements simultanés avec le même ancien mot de passe -> un seul succès', async () => {
    const user = await creer(EMAIL_COURSE, ACTUEL);
    const sessions = await Promise.all(
      Array.from({ length: 6 }, () => connecter(EMAIL_COURSE, ACTUEL)),
    );
    const reponses = await Promise.all(
      sessions.map((s, i) =>
        changer(s.access, { motDePasseActuel: ACTUEL, nouveauMotDePasse: `Gagnant${i}Passe` }),
      ),
    );
    const statuts = reponses.map((r) => r.status);
    expect(statuts.filter((s) => s === 200)).toHaveLength(1);
    expect(statuts.filter((s) => s === 401)).toHaveLength(5);
    const gagnant = statuts.indexOf(200);
    // Seul le mot de passe du gagnant est valable.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_COURSE, password: `Gagnant${gagnant}Passe` })
      .expect(200);
    for (let i = 0; i < 6; i += 1) {
      if (i === gagnant) continue;
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: EMAIL_COURSE, password: `Gagnant${i}Passe` })
        .expect(401);
    }
    const succes = (await auditsDe(user.id)).filter((a) => a.resultat === 'Succès');
    expect(succes).toHaveLength(1);
    expect(mail).toHaveBeenCalledTimes(1);
  });
});
