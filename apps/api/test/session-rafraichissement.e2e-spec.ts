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

/**
 * E2E-AUTH17 — US-AUTH-17 : garder la session après un rafraîchissement de page.
 *
 * Le navigateur restaure la session au chargement par POST /api/auth/refresh
 * (cookie httpOnly). Vérifie, avec la vraie base et le vrai Redis : attributs
 * du cookie, rafraîchissements répétés (rotation à chaque fois), deux puis
 * cinq rafraîchissements SIMULTANÉS avec le même cookie (un seul gagnant, la
 * session reste vivante), vrai rejeu (famille révoquée), déconnexion (reste
 * déconnecté) et changement de mot de passe (marqueur `tms`).
 */
describe('E2E-AUTH17 — Session gardée au rafraîchissement (US-AUTH-17)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let redis: RedisService;

  const PREFIXE = 'e2e-auth17-';
  const MOT_DE_PASSE = 'SessionPasse123';
  const NOUVEAU = 'SessionPasse456';

  const nettoyer = async (): Promise<void> => {
    const ids = (
      (await dataSource.query(`SELECT id FROM users WHERE email LIKE $1`, [
        `${PREFIXE}%`,
      ])) as Array<{ id: string }>
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
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  };

  const creer = async (suffixe: string, role: Role = Role.APPRENANT): Promise<User> =>
    userRepository.save(
      userRepository.create({
        email: `${PREFIXE}${suffixe}@cert-eet.local`,
        nom: 'Test',
        prenom: 'Auth17',
        motDePasseHash: await bcrypt.hash(MOT_DE_PASSE, 4),
        role,
        statut: StatutCompte.ACTIF,
        profilComplet: true,
      }),
    );

  const cookieDe = (res: request.Response): string | undefined => {
    const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    return cookies.find((c) => c.startsWith('refreshToken='));
  };

  const connecter = async (
    email: string,
    motDePasse = MOT_DE_PASSE,
  ): Promise<{ access: string; cookie: string; brut: string }> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: motDePasse })
      .expect(200);
    const brut = cookieDe(res) as string;
    return { access: res.body.accessToken as string, cookie: brut.split(';')[0], brut };
  };

  const rafraichir = (cookie: string): request.Test =>
    request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);

  const empreinte = (cookie: string): string =>
    crypto.createHash('sha256').update(cookie.slice('refreshToken='.length)).digest('hex');

  const jetonsActifsDeLaFamille = async (cookie: string): Promise<number> => {
    const [ligne] = (await dataSource.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
        WHERE active = true AND famille_id = (
          SELECT famille_id FROM refresh_tokens WHERE token_hash = $1)`,
      [empreinte(cookie)],
    )) as Array<{ n: number }>;
    return ligne.n;
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
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    redis = moduleRef.get(RedisService);
    jest.spyOn(moduleRef.get(MailService), 'sendMotDePasseModifieEmail').mockResolvedValue();
    await nettoyer();
  });

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  it('cookie de session : httpOnly, Secure, SameSite=Strict, Path=/api/auth, durée de 7 jours', async () => {
    const user = await creer('cookie');
    const { brut } = await connecter(user.email);
    expect(brut).toMatch(/HttpOnly/i);
    expect(brut).toMatch(/Secure/i);
    expect(brut).toMatch(/SameSite=Strict/i);
    expect(brut).toMatch(/Path=\/api\/auth/);
    expect(brut).toMatch(/Max-Age=604800/);
    const res = await rafraichir(brut.split(';')[0]).expect(200);
    const pivote = cookieDe(res) as string;
    expect(pivote).toMatch(/HttpOnly/i);
    expect(pivote).toMatch(/Path=\/api\/auth/);
  });

  it('rafraîchissements répétés (20 rechargements) : 200 à chaque fois, rotation, même utilisateur, /me accessible', async () => {
    const user = await creer('repete', Role.FORMATEUR);
    let { cookie } = await connecter(user.email);
    const vus = new Set<string>([cookie]);
    let access = '';
    for (let i = 0; i < 20; i++) {
      const res = await rafraichir(cookie).expect(200);
      expect(res.body.user).toEqual({ id: user.id, email: user.email, role: Role.FORMATEUR });
      access = res.body.accessToken as string;
      cookie = (cookieDe(res) as string).split(';')[0];
      expect(vus.has(cookie)).toBe(false);
      vus.add(cookie);
    }
    expect(await jetonsActifsDeLaFamille(cookie)).toBe(1);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(me.body.id).toBe(user.id);
  });

  it('deux rafraîchissements simultanés avec le même cookie : un seul gagnant, la session reste vivante', async () => {
    const user = await creer('double');
    const { cookie } = await connecter(user.email);
    const reponses = await Promise.all([rafraichir(cookie), rafraichir(cookie)]);
    const statuts = reponses.map((r) => r.status).sort();
    expect(statuts).toEqual([200, 401]);
    const gagnant = reponses.find((r) => r.status === 200) as request.Response;
    const cookieGagnant = (cookieDe(gagnant) as string).split(';')[0];
    expect(await jetonsActifsDeLaFamille(cookieGagnant)).toBe(1);
    // Le rechargement suivant (avec le cookie du gagnant) fonctionne toujours.
    const suite = await rafraichir(cookieGagnant).expect(200);
    expect(suite.body.user.id).toBe(user.id);
  });

  it('concurrence forcée : 5 rafraîchissements simultanés -> exactement un succès, un seul jeton actif, aucun jeton orphelin', async () => {
    const user = await creer('cinq');
    const { cookie } = await connecter(user.email);
    const reponses = await Promise.all(Array.from({ length: 5 }, () => rafraichir(cookie)));
    expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 401)).toHaveLength(4);
    const gagnant = reponses.find((r) => r.status === 200) as request.Response;
    const cookieGagnant = (cookieDe(gagnant) as string).split(';')[0];
    expect(await jetonsActifsDeLaFamille(cookieGagnant)).toBe(1);
    const [{ n }] = (await dataSource.query(
      'SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND active = true',
      [user.id],
    )) as Array<{ n: number }>;
    expect(n).toBe(1);
    await rafraichir(cookieGagnant).expect(200);
  });

  it('vrai rejeu (jeton consommé hors de la denylist) : la famille entière est révoquée', async () => {
    const user = await creer('rejeu');
    const { cookie } = await connecter(user.email);
    const res = await rafraichir(cookie).expect(200);
    const cookieGagnant = (cookieDe(res) as string).split(';')[0];
    // Simule un jeton volé rejoué longtemps après (denylist expirée).
    await redis.del(`denylist:refresh:${empreinte(cookie)}`);
    await rafraichir(cookie).expect(401);
    expect(await jetonsActifsDeLaFamille(cookieGagnant)).toBe(0);
    await rafraichir(cookieGagnant).expect(401);
  });

  it('déconnexion puis rechargement : reste déconnecté (cookie effacé, refresh refusé)', async () => {
    const user = await creer('deconnexion');
    const { access, cookie } = await connecter(user.email);
    const sortie = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .set('Cookie', cookie)
      .expect(200);
    const efface = cookieDe(sortie) as string;
    expect(efface).toMatch(/^refreshToken=;/);
    expect(efface).toMatch(/Path=\/api\/auth/);
    await rafraichir(cookie).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('changement de mot de passe : l’ancien cookie est refusé ; une nouvelle session se restaure et son jeton passe le marqueur tms', async () => {
    const user = await creer('mdp');
    const { access, cookie } = await connecter(user.email);
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ motDePasseActuel: MOT_DE_PASSE, nouveauMotDePasse: NOUVEAU })
      .expect(200);
    await rafraichir(cookie).expect(401);
    const nouvelle = await connecter(user.email, NOUVEAU);
    const res = await rafraichir(nouvelle.cookie).expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken as string}`)
      .expect(200);
  });
});
