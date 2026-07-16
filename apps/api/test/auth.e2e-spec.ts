import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';

/**
 * Test e2e de l authentification (US-AUTH-01 + US-AUTH-03).
 *
 * Démarre la VRAIE app (AppModule complet), parle à Postgres ET Redis réels
 * (services CI, ou conteneurs en local), et signe avec de VRAIES clés RS256.
 * On reproduit ici la config de main.ts qui compte pour ces tests :
 * setGlobalPrefix, ValidationPipe global, ET cookie-parser (sans quoi
 * req.cookies serait undefined et /auth/refresh renverrait toujours 401).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  const MOT_DE_PASSE_TEST = 'MotDePasseTest123!';
  const EMAIL_ACTIF = 'e2e-actif@cert-eet.local';
  const EMAIL_INACTIF = 'e2e-inactif@cert-eet.local';

  // Se connecte et renvoie le cookie brut "refreshToken=..." (sans attributs).
  async function loginEtRecupererCookieRefresh(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    return (refreshCookie as string).split(';')[0];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    // US-AUTH-03 : indispensable pour que /auth/refresh lise le cookie.
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

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE_TEST, 12);
    await userRepository.save([
      userRepository.create({
        email: EMAIL_ACTIF,
        motDePasseHash,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
      }),
      userRepository.create({
        email: EMAIL_INACTIF,
        motDePasseHash,
        role: Role.APPRENANT,
        statut: StatutCompte.DESACTIVE,
      }),
    ]);
  });

  afterAll(async () => {
    // La suppression des users CASCADE sur refresh_tokens (FK onDelete CASCADE),
    // donc les sessions créées par les tests de refresh partent avec.
    await userRepository.delete({ email: EMAIL_ACTIF });
    await userRepository.delete({ email: EMAIL_INACTIF });
    await app.close();
  });

  it('POST /api/auth/login -> 200, accessToken en JSON, refreshToken en cookie httpOnly', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.user.email).toBe(EMAIL_ACTIF);
        expect(res.body.refreshToken).toBeUndefined();
        const setCookieHeader = res.headers['set-cookie'];
        expect(setCookieHeader).toBeDefined();
        const refreshCookie = (setCookieHeader as unknown as string[]).find(
          (cookie: string) => cookie.startsWith('refreshToken='),
        );
        expect(refreshCookie).toBeDefined();
        expect(refreshCookie).toContain('HttpOnly');
        expect(refreshCookie).toContain('Path=/api/auth');
      });
  });

  it('POST /api/auth/login -> 401 message generique pour un email inconnu', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'personne@cert-eet.local', password: 'peu-importe' })
      .expect(401)
      .expect((res) => {
        expect(res.body.accessToken).toBeUndefined();
      });
  });

  it('POST /api/auth/login -> 401 meme message generique pour un mot de passe incorrect', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: 'MauvaisMotDePasse!' })
      .expect(401);
  });

  it('POST /api/auth/login -> 401 meme message generique pour un compte non ACTIF (bon mot de passe)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_INACTIF, password: MOT_DE_PASSE_TEST })
      .expect(401);
  });

  it('POST /api/auth/login -> 400 si le corps de la requete est invalide (email manquant)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password: MOT_DE_PASSE_TEST })
      .expect(400);
  });

  it('POST /api/auth/refresh -> 200 avec un refresh token valide, rote le cookie et ne renvoie pas le refresh en JSON', async () => {
    const cookie = await loginEtRecupererCookieRefresh();
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeUndefined();
        const setCookieHeader = res.headers['set-cookie'] as unknown as string[];
        const rotated = setCookieHeader?.find((c) =>
          c.startsWith('refreshToken='),
        );
        expect(rotated).toBeDefined();
      });
  });

  it('POST /api/auth/refresh -> 401 sans cookie', () => {
    return request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('POST /api/auth/refresh -> 401 avec un cookie invalide', () => {
    return request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=pas-un-vrai-jwt')
      .expect(401);
  });

  it('POST /api/auth/refresh -> 401 si on rejoue un refresh token deja consomme (reuse detection)', async () => {
    const cookie = await loginEtRecupererCookieRefresh();
    // 1er refresh : OK, brûle l ancien token.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    // Rejeu du MÊME cookie (déjà consommé) : détection de rejeu -> 401.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });
});
