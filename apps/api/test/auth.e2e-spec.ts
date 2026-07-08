import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';

/**
 * Test e2e de la connexion (US-AUTH-01).
 *
 * Contrairement à auth.service.spec.ts (qui isole AuthService avec des
 * faux repositories), ce test démarre la VRAIE application NestJS
 * (AppModule complet) et parle à une VRAIE base Postgres (celle démarrée
 * par CI en service container, ou Postgres en local — cf. INF05). Objectif :
 * vérifier que TOUTE la chaîne fonctionne ensemble — ValidationPipe global,
 * connexion TypeORM réelle, ET signature RS256 avec les VRAIES clés
 * (générées par CI dans /tmp, ou celles de secrets/ en local).
 *
 * Deux comptes de test sont créés avant les tests et supprimés après
 * (afterAll), pour ne rien laisser dans la base au-delà de l'exécution du
 * test.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;

  const MOT_DE_PASSE_TEST = 'MotDePasseTest123!';
  const EMAIL_ACTIF = 'e2e-actif@cert-eet.local';
  const EMAIL_INACTIF = 'e2e-inactif@cert-eet.local';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

app = moduleRef.createNestApplication();

    // Même préfixe global que main.ts (app.setGlobalPrefix) : sans cette
    // ligne, les routes de ce test app existent à /auth/login au lieu de
    // /api/auth/login, et ne correspondent plus à la vraie API. Oubli
    // initial corrigé après un premier run qui renvoyait 404 partout.
    app.setGlobalPrefix('api', { exclude: ['health'] });

    // Même ValidationPipe globale que main.ts : sans ça, ce test ne
    // vérifierait pas le comportement réel de l'API en production/CI.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();

    userRepository = moduleRef.get<Repository<User>>(
      getRepositoryToken(User),
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
    // Nettoyage : ne rien laisser en base après ce test, pour ne pas
    // polluer les exécutions suivantes (locales ou CI).
    await userRepository.delete({ email: EMAIL_ACTIF });
    await userRepository.delete({ email: EMAIL_INACTIF });
    await app.close();
  });

  it('POST /api/auth/login -> 200 et emet les jetons pour un compte ACTIF avec le bon mot de passe', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL_ACTIF, password: MOT_DE_PASSE_TEST })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();
        expect(res.body.user.email).toBe(EMAIL_ACTIF);
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
});