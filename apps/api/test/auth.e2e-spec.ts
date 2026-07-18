import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';

/**
 * Test e2e de l authentification (US-AUTH-01 + US-AUTH-03 + US-AUTH-04).
 * Vraie app + Postgres + Redis + clés RS256 réelles. On reproduit la config
 * de main.ts qui compte ici : setGlobalPrefix, ValidationPipe, cookie-parser.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  const MOT_DE_PASSE_TEST = 'MotDePasseTest123!';
  const EMAIL_ACTIF = 'e2e-actif@cert-eet.local';
  const EMAIL_INACTIF = 'e2e-inactif@cert-eet.local';

  // Renvoie le cookie brut "refreshToken=...".
  async function cookieRefresh(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const c = cookies.find((x) => x.startsWith('refreshToken='));
    return (c as string).split(';')[0];
  }

  // Renvoie l access token ET le cookie de refresh (pour les tests logout).
  async function seConnecter(): Promise<{ accessToken: string; cookie: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const c = cookies.find((x) => x.startsWith('refreshToken='));
    return {
      accessToken: res.body.accessToken as string,
      cookie: (c as string).split(';')[0],
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(
      getRepositoryToken(AuditLog),
    );

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
    // Les refresh_tokens partent en CASCADE avec les users ; les audit_logs
    // NON (l'audit doit survivre à la suppression d'un compte) -> nettoyage
    // explicite par userId.
    const testUsers = await userRepository.find({
      where: [{ email: EMAIL_ACTIF }, { email: EMAIL_INACTIF }],
    });
    const ids = testUsers.map((u) => u.id);
    if (ids.length > 0) {
      await auditLogRepository.delete({ userId: In(ids) });
    }
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

  it('POST /api/auth/login -> 401 pour un mot de passe incorrect', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: 'MauvaisMotDePasse!' })
      .expect(401);
  });

  it('POST /api/auth/login -> 401 pour un compte non ACTIF (bon mot de passe)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_INACTIF, password: MOT_DE_PASSE_TEST })
      .expect(401);
  });

  it('POST /api/auth/login -> 400 si le corps est invalide (email manquant)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password: MOT_DE_PASSE_TEST })
      .expect(400);
  });

  it('POST /api/auth/refresh -> 200, rote le cookie, pas de refresh en JSON', async () => {
    const cookie = await cookieRefresh();
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

  it('POST /api/auth/refresh -> 401 si on rejoue un refresh token deja consomme', async () => {
    const cookie = await cookieRefresh();
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('POST /api/auth/logout -> 200 et invalide le refresh token (un refresh ensuite -> 401)', async () => {
    const { accessToken, cookie } = await seConnecter();
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .expect(200);
    // Le refresh token est brûlé : un refresh échoue.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('POST /api/auth/logout -> idempotent (rejeu sans erreur)', async () => {
    const { accessToken, cookie } = await seConnecter();
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .expect(200);
  });

  it('POST /api/auth/logout -> 200 même sans jeton (idempotent)', () => {
    return request(app.getHttpServer()).post('/api/auth/logout').expect(200);
  });
});
