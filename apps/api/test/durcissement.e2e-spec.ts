import { retirerLimitesBasses } from './outils/limites-basses';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import type { Redis } from 'ioredis';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/common/securite/configurer-application';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * E2E-AUTH13 — US-AUTH-13 : durcissement des endpoints sensibles.
 *
 * L'application est montée EXACTEMENT comme en production
 * (`configurerApplication`, partagé avec main.ts), avec des limites basses
 * (`outils/limites-basses`). Chaque test parle depuis sa propre adresse IP
 * (X-Forwarded-For, cru depuis la boucle locale comme derrière nginx) :
 * compteurs indépendants. Vérifie les en-têtes de sécurité, les tailles de
 * corps (413), la limitation de débit (429) de la connexion, de la MFA, du
 * refresh, de l'inscription et de la vérification d'email, le CORS, et une
 * rafale simultanée qui ne laisse passer que la limite.
 */
describe('E2E-AUTH13 — TLS et durcissement (US-AUTH-13)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let redis: Redis;
  const ORIGINE_AUTORISEE = 'http://localhost:3001';
  let ipSuivante = 10;
  const nouvelleIp = (): string => `203.0.113.${(ipSuivante += 1)}`;

  const viderCompteurs = async (): Promise<void> => {
    const cles = await redis.keys('limite:*:203.0.113.*');
    if (cles.length > 0) await redis.del(...cles);
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    configurerApplication(nest, nest.get(ConfigService));
    app = nest;
    await app.init();
    await app.listen(0);
    dataSource = moduleRef.get(DataSource, { strict: false });
    redis = moduleRef.get<Redis>(REDIS_CLIENT);
    await viderCompteurs();
  });

  afterAll(async () => {
    await viderCompteurs();
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(
        `DELETE FROM audit_logs WHERE action = 'LIMITE_REQUETES_ATTEINTE' AND adresse_ip LIKE '203.0.113.%'`,
      );
      await qr.commitTransaction();
    } finally {
      await qr.release();
    }
    await app.close();
    retirerLimitesBasses();
  });

  it('en-têtes de sécurité sur toutes les réponses (y compris les erreurs)', async () => {
    for (const chemin of ['/health', '/api/auth/me']) {
      const res = await request(app.getHttpServer())
        .get(chemin)
        .set('X-Forwarded-For', nouvelleIp());
      expect(res.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['content-security-policy']).toContain("object-src 'none'");
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('tailles de corps : JSON > 100 ko et formulaire > 20 ko -> 413 ; juste en dessous, traité', async () => {
    const ip = nouvelleIp();
    const gros = { email: 'x@cert-eet.local', password: 'a'.repeat(101 * 1024) };
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send(gros)
      .expect(413);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .type('form')
      .send(`email=x%40cert-eet.local&password=${'a'.repeat(21 * 1024)}`)
      .expect(413);
    // Sous la limite : la requête atteint bien la route (identifiants faux -> 401).
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'x@cert-eet.local', password: 'a'.repeat(90 * 1024) })
      .expect(401);
  });

  it.each([
    [
      'connexion',
      '/api/auth/login',
      { email: 'inconnu@cert-eet.local', password: 'Faux123456' },
      3,
    ],
    [
      'mfa',
      '/api/auth/mfa/verify',
      { mfaToken: '00000000-0000-4000-8000-000000000000', code: '123456' },
      2,
    ],
    ['rafraichissement', '/api/auth/refresh', {}, 2],
    [
      'inscription',
      '/api/auth/register',
      { nom: 'A', prenom: 'B', email: 'pas-un-email', password: 'Passe12345' },
      2,
    ],
    [
      'verification-email',
      '/api/auth/verify-email',
      { token: '00000000-0000-4000-8000-000000000000' },
      2,
    ],
  ])(
    'limite « %s » (%s) : 429 au-delà de la limite, Retry-After, audit du premier refus, autre IP non affectée',
    async (nom, route, corps, limite) => {
      const ip = nouvelleIp();
      for (let i = 0; i < limite; i += 1) {
        const res = await request(app.getHttpServer())
          .post(route)
          .set('X-Forwarded-For', ip)
          .send(corps);
        expect(res.status).not.toBe(429);
      }
      const refus = await request(app.getHttpServer())
        .post(route)
        .set('X-Forwarded-For', ip)
        .send(corps);
      expect(refus.status).toBe(429);
      expect(Number(refus.headers['retry-after'])).toBeGreaterThan(0);
      await request(app.getHttpServer())
        .post(route)
        .set('X-Forwarded-For', ip)
        .send(corps)
        .expect(429);
      // Une autre adresse n'est pas touchée.
      const autre = await request(app.getHttpServer())
        .post(route)
        .set('X-Forwarded-For', nouvelleIp())
        .send(corps);
      expect(autre.status).not.toBe(429);
      const traces = (await dataSource.query(
        `SELECT details_avant_apres AS d FROM audit_logs
          WHERE action = 'LIMITE_REQUETES_ATTEINTE' AND adresse_ip = $1`,
        [ip],
      )) as Array<{ d: { limite: string; route: string } }>;
      expect(traces).toHaveLength(1);
      expect(traces[0].d).toMatchObject({ limite: nom, route });
    },
  );

  it('concurrence forcée : 10 connexions simultanées depuis une IP limitée à 3 -> exactement 3 traitées', async () => {
    const ip = nouvelleIp();
    const reponses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/api/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'inconnu@cert-eet.local', password: 'Faux123456' }),
      ),
    );
    const statuts = reponses.map((r) => r.status);
    expect(statuts.filter((s) => s === 429)).toHaveLength(7);
    expect(statuts.filter((s) => s === 401)).toHaveLength(3);
  });

  it('CORS : origine autorisée servie avec cookies ; origine inconnue sans en-tête d’autorisation', async () => {
    const ok = await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', ORIGINE_AUTORISEE)
      .set('Access-Control-Request-Method', 'POST');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGINE_AUTORISEE);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    expect(ok.headers['access-control-allow-methods']).not.toContain('TRACE');
    const ko = await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', 'https://site-malveillant.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(ko.headers['access-control-allow-origin']).toBeUndefined();
  });
});
