import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { MailService } from '../src/mail/mail.service';
/**
 * E2E US-CPT-05 — auto-inscription publique + vérification d'email.
 *
 * MailService est REMPLACÉ par un mock : aucun serveur SMTP requis en test/CI,
 * et on récupère le jeton de vérification directement depuis l'appel capté
 * (mock.calls) plutôt qu'en lisant un email. Tout le reste (DB, Redis, guards,
 * ValidationPipe global) est réel, exactement comme en production.
 */
describe('Inscription + verification email (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;
  const mailMock = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const EMAIL_NOUVEAU = 'e2e-cpt05-nouveau@cert-eet.local';
  const PASSWORD = 'MotDePasse123';
  let tokenVerification = '';
  const supprimerUtilisateursTest = async (): Promise<void> => {
    const users = await userRepository.find({
      where: [{ email: EMAIL_NOUVEAU }],
    });
    const ids = users.map((u) => u.id);
    // US-AUTH-12 : audit_logs est immuable (trigger BDD). Le nettoyage des
    // traces de test contourne le trigger via le bypass maintenance (GUC
    // app.audit_maintenance), encadré par une transaction (SET LOCAL ->
    // reset au COMMIT). Sans ça, ce DELETE serait rejeté.
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
    await userRepository.delete({ email: EMAIL_NOUVEAU });
  };
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();
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
    dataSource = moduleRef.get(DataSource, { strict: false });
    await supprimerUtilisateursTest();
  });
  afterAll(async () => {
    await supprimerUtilisateursTest();
    await app.close();
  });
  it('POST /api/auth/register -> 201 : compte APPRENANT EN_ATTENTE_ACTIVATION + email envoyé', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ nom: 'Omri', prenom: 'Iyed', email: EMAIL_NOUVEAU, password: PASSWORD })
      .expect(201);
    const user = await userRepository.findOne({ where: { email: EMAIL_NOUVEAU } });
    expect(user).not.toBeNull();
    expect((user as User).role).toBe(Role.APPRENANT);
    expect((user as User).statut).toBe(StatutCompte.EN_ATTENTE_ACTIVATION);
    expect(mailMock.sendVerificationEmail).toHaveBeenCalledWith(
      EMAIL_NOUVEAU,
      expect.any(String),
    );
    tokenVerification = mailMock.sendVerificationEmail.mock
      .calls[0][1] as string;
    expect(tokenVerification).toHaveLength(36);
  });
  it('POST /api/auth/register -> 409 si l email est déjà utilisé', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ nom: 'Omri', prenom: 'Iyed', email: EMAIL_NOUVEAU, password: PASSWORD })
      .expect(409);
  });
  it('POST /api/auth/register -> 400 : un champ role est refusé (anti-élévation)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        nom: 'Hack',
        prenom: 'Er',
        email: 'e2e-cpt05-hack@cert-eet.local',
        password: PASSWORD,
        role: 'ADMINISTRATEUR',
      })
      .expect(400);
  });
  it('POST /api/auth/register -> 400 : mot de passe trop faible', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        nom: 'Weak',
        prenom: 'Pass',
        email: 'e2e-cpt05-weak@cert-eet.local',
        password: 'abc',
      })
      .expect(400);
  });
  it('POST /api/auth/verify-email -> 400 : jeton bien formé mais inexistant', () => {
    return request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: '00000000-0000-4000-8000-000000000000' })
      .expect(400);
  });
  it('POST /api/auth/verify-email -> 200 : active le compte (ACTIF)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: tokenVerification })
      .expect(200);
    const user = await userRepository.findOne({ where: { email: EMAIL_NOUVEAU } });
    expect((user as User).statut).toBe(StatutCompte.ACTIF);
  });
  it('POST /api/auth/verify-email -> 400 : jeton déjà consommé (usage unique)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: tokenVerification })
      .expect(400);
  });
  it('POST /api/auth/login -> 200 : le compte vérifié peut désormais se connecter', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_NOUVEAU, password: PASSWORD })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.user.role).toBe(Role.APPRENANT);
      });
  });
});
