import { Controller, Get, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
import { AuthService } from '../src/modules/auth/auth.service';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';

/**
 * Contrôleur de TEST uniquement (US-AUTH-11) : routes protégées par rôle pour
 * exercer la matrice rôle × route. Il n'existe pas en production ; les guards
 * globaux (JwtAuthGuard + RolesGuard) s'y appliquent comme partout ailleurs.
 */
@Controller('test-rbac')
class TestRbacController {
  @Get('any')
  any(): { ok: boolean } {
    return { ok: true };
  }

  @Get('admin')
  @Roles(Role.ADMINISTRATEUR)
  admin(): { ok: string } {
    return { ok: 'admin' };
  }

  @Get('formateur')
  @Roles(Role.FORMATEUR)
  formateur(): { ok: string } {
    return { ok: 'formateur' };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;

  const MOT_DE_PASSE_TEST = 'MotDePasseTest123!';
  const EMAIL_ACTIF = 'e2e-actif@cert-eet.local';
  const EMAIL_INACTIF = 'e2e-inactif@cert-eet.local';
  const EMAIL_ADMIN = 'e2e-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-formateur@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ACTIF, EMAIL_INACTIF, EMAIL_ADMIN, EMAIL_FORMATEUR];

  const getToken = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE_TEST })
      .expect(200);
    return res.body.accessToken as string;
  };

  const cookieRefresh = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const c = cookies.find((x) => x.startsWith('refreshToken='));
    return (c as string).split(';')[0];
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRbacController],
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
      userRepository.create({
        email: EMAIL_ADMIN,
        motDePasseHash,
        role: Role.ADMINISTRATEUR,
        statut: StatutCompte.ACTIF,
      }),
      userRepository.create({
        email: EMAIL_FORMATEUR,
        motDePasseHash,
        role: Role.FORMATEUR,
        statut: StatutCompte.ACTIF,
      }),
    ]);
  });

  afterAll(async () => {
    const testUsers = await userRepository.find({
      where: ALL_EMAILS.map((email) => ({ email })),
    });
    const ids = testUsers.map((u) => u.id);
    if (ids.length > 0) {
      await auditLogRepository.delete({ userId: In(ids) });
    }
    for (const email of ALL_EMAILS) {
      await userRepository.delete({ email });
    }
    await app.close();
  });

  // ---- US-AUTH-01 : login ----
  it('POST /api/auth/login -> 200, accessToken en JSON, refreshToken en cookie httpOnly', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeUndefined();
        const setCookie = res.headers['set-cookie'] as unknown as string[];
        const rc = setCookie.find((c) => c.startsWith('refreshToken='));
        expect(rc).toContain('HttpOnly');
        expect(rc).toContain('Path=/api/auth');
      });
  });

  it('POST /api/auth/login -> 401 email inconnu', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'personne@cert-eet.local', password: 'x' })
      .expect(401);
  });

  it('POST /api/auth/login -> 401 mot de passe incorrect', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: 'MauvaisMotDePasse!' })
      .expect(401);
  });

  it('POST /api/auth/login -> 401 compte non ACTIF', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_INACTIF, password: MOT_DE_PASSE_TEST })
      .expect(401);
  });

  it('POST /api/auth/login -> 400 corps invalide', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password: MOT_DE_PASSE_TEST })
      .expect(400);
  });

  // ---- US-AUTH-03 : refresh ----
  it('POST /api/auth/refresh -> 200 + rotation', async () => {
    const cookie = await cookieRefresh();
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        const sc = res.headers['set-cookie'] as unknown as string[];
        expect(sc?.find((c) => c.startsWith('refreshToken='))).toBeDefined();
      });
  });

  it('POST /api/auth/refresh -> 401 sans cookie', () => {
    return request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('POST /api/auth/refresh -> 401 cookie invalide', () => {
    return request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=pas-un-vrai-jwt')
      .expect(401);
  });

  it('POST /api/auth/refresh -> 401 rejeu d un refresh consommé', async () => {
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

  // ---- US-AUTH-04 : logout ----
  it('POST /api/auth/logout -> 200 et invalide le refresh', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200);
    const accessToken = res.body.accessToken as string;
    const cookie = (
      res.headers['set-cookie'] as unknown as string[]
    )
      .find((c) => c.startsWith('refreshToken='))!
      .split(';')[0];

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('POST /api/auth/logout -> 200 même sans jeton (idempotent)', () => {
    return request(app.getHttpServer()).post('/api/auth/logout').expect(200);
  });

  // ---- US-AUTH-11 : /me + matrice RBAC ----
  it('GET /api/auth/me -> 401 sans token', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('GET /api/auth/me -> 200 avec un token valide', async () => {
    const token = await getToken(EMAIL_ACTIF);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe(EMAIL_ACTIF);
        expect(res.body.role).toBe(Role.APPRENANT);
      });
  });

  it('route authentifiée sans contrainte de rôle : 401 sans token, 200 avec', async () => {
    await request(app.getHttpServer()).get('/api/test-rbac/any').expect(401);
    const token = await getToken(EMAIL_ACTIF);
    await request(app.getHttpServer())
      .get('/api/test-rbac/any')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('route @Roles(ADMINISTRATEUR) : 403 pour un apprenant, 200 pour un admin', async () => {
    const apprenant = await getToken(EMAIL_ACTIF);
    await request(app.getHttpServer())
      .get('/api/test-rbac/admin')
      .set('Authorization', `Bearer ${apprenant}`)
      .expect(403);
    const admin = await getToken(EMAIL_ADMIN);
    await request(app.getHttpServer())
      .get('/api/test-rbac/admin')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
  });

  it('route @Roles(FORMATEUR) : 403 pour un apprenant, 200 pour un formateur', async () => {
    const apprenant = await getToken(EMAIL_ACTIF);
    await request(app.getHttpServer())
      .get('/api/test-rbac/formateur')
      .set('Authorization', `Bearer ${apprenant}`)
      .expect(403);
    const formateur = await getToken(EMAIL_FORMATEUR);
    await request(app.getHttpServer())
      .get('/api/test-rbac/formateur')
      .set('Authorization', `Bearer ${formateur}`)
      .expect(200);
  });

  it('invalidateUserSessions() -> un access token émis avant est refusé (401)', async () => {
    const token = await getToken(EMAIL_ACTIF);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Marqueur en secondes : on attend >1 s pour qu'il soit strictement
    // postérieur au iat du token.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const user = await userRepository.findOne({ where: { email: EMAIL_ACTIF } });
    await moduleRef
      .get(AuthService, { strict: false })
      .invalidateUserSessions((user as User).id);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
