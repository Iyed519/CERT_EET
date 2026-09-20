import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';

/**
 * US-AUTH-09 + US-AUTH-02 (e2e) — Enrôlement MFA + connexion en deux temps.
 *
 * Le code TOTP est calculé côté test avec otplib, à partir du secret extrait de
 * l'URI otpauth renvoyée par /auth/mfa/setup. On exerce le parcours complet
 * contre la vraie base + Redis (comme les autres e2e).
 */
describe('MFA (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const EMAIL = 'e2e-mfa@cert-eet.local';

  const secretDepuisOtpauth = (url: string): string =>
    new URL(url).searchParams.get('secret') ?? '';

  // Code garanti invalide : on retourne un code d'un AUTRE secret.
  const codeInvalide = (): string =>
    authenticator.generate(authenticator.generateSecret());

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
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
    auditRepository = moduleRef.get<Repository<AuditLog>>(
      getRepositoryToken(AuditLog),
    );
    dataSource = moduleRef.get(DataSource, { strict: false });

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    await userRepository.save(
      userRepository.create({
        email: EMAIL,
        motDePasseHash,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
      }),
    );
  });

  afterAll(async () => {
    const users = await userRepository.find({ where: { email: EMAIL } });
    const ids = users.map((u) => u.id);
    // US-AUTH-12 : audit_logs est immuable (trigger). Le nettoyage des traces de
    // test passe par le bypass maintenance (GUC), encadré par une transaction.
    if (ids.length > 0) {
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
    }
    await userRepository.delete({ email: EMAIL });
    await app.close();
  });

  const login = (): request.Test =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL, password: MOT_DE_PASSE });

  const bearer = async (): Promise<string> => {
    const res = await login().expect(200);
    return res.body.accessToken as string;
  };

  it('parcours complet : login -> setup -> enable -> login MFA (2 temps) -> rejeu 401 -> disable', async () => {
    // 1) login sans MFA : jetons émis directement.
    const token = await bearer();

    // 2) setup : QR + otpauth.
    const setup = await request(app.getHttpServer())
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const secret = secretDepuisOtpauth(setup.body.otpauthUrl);
    expect(secret.length).toBeGreaterThan(0);

    // 3) enable avec un code valide.
    await request(app.getHttpServer())
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);

    // audit MFA_ACTIVEE présent.
    const user = await userRepository.findOne({ where: { email: EMAIL } });
    const traces = await auditRepository.find({
      where: { userId: (user as User).id, action: 'MFA_ACTIVEE' },
    });
    expect(traces.length).toBeGreaterThan(0);

    // 4) login : MFA active -> mfaRequired + mfaToken, AUCUN jeton ni cookie.
    const defi = await login().expect(200);
    expect(defi.body.mfaRequired).toBe(true);
    expect(defi.body.mfaToken).toBeDefined();
    expect(defi.body.accessToken).toBeUndefined();
    expect(defi.headers['set-cookie']).toBeUndefined();
    const mfaToken = defi.body.mfaToken as string;

    // 5) verify code invalide -> 401.
    await request(app.getHttpServer())
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: codeInvalide() })
      .expect(401);

    // 6) verify code valide -> jetons + cookie refresh.
    const ok = await request(app.getHttpServer())
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: authenticator.generate(secret) })
      .expect(200);
    expect(ok.body.accessToken).toBeDefined();
    const setCookie = ok.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((c) => c.startsWith('refreshToken='))).toBeDefined();

    // 7) rejeu du mfaToken (usage unique) -> 401.
    await request(app.getHttpServer())
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: authenticator.generate(secret) })
      .expect(401);

    // 8) disable avec un code valide (token émis à l'étape 6).
    const token2 = ok.body.accessToken as string;
    await request(app.getHttpServer())
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${token2}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);

    // 9) login de nouveau : plus de MFA -> jetons directs.
    const apres = await login().expect(200);
    expect(apres.body.accessToken).toBeDefined();
    expect(apres.body.mfaRequired).toBeUndefined();
  });

  it('setup -> 409 si la MFA est déjà active', async () => {
    const token = await bearer();
    const setup = await request(app.getHttpServer())
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const secret = secretDepuisOtpauth(setup.body.otpauthUrl);
    await request(app.getHttpServer())
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);

    // Le token reste valide (émis avant l'activation) -> setup renvoie 409.
    await request(app.getHttpServer())
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    // Nettoyage : on redésactive pour ne pas polluer l'état du compte de test.
    await request(app.getHttpServer())
      .post('/api/auth/mfa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);
  });

  it('login sans MFA inchangé : accessToken + cookie refresh httpOnly', async () => {
    const res = await login().expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.mfaRequired).toBeUndefined();
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const rc = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(rc).toContain('HttpOnly');
    expect(rc).toContain('Path=/api/auth');
  });
});
