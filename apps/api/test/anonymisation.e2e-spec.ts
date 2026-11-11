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
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * E2E-CPT04 — US-CPT-04 : anonymisation RGPD d'un compte par l'administrateur.
 *
 * Tout est réel (base, Redis, stockage, génération du certificat). Vérifie la
 * double confirmation, les refus, l'effacement des données personnelles, la
 * révocation des sessions, la conservation des données pédagogiques et du
 * certificat (toujours vérifiable, intègre, sans identité, PDF public coupé),
 * l'audit sans donnée personnelle, 5 anonymisations simultanées -> une seule,
 * et deux administrateurs qui s'anonymisent l'un l'autre en même temps alors
 * qu'ils sont les deux seuls actifs -> il en reste un.
 */
describe('E2E-CPT04 — Anonymisation RGPD (US-CPT-04)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let redis: Redis;
  const PREFIXE = 'e2e-cpt04-';
  const MARQUEUR = 'E2E-CPT04';
  const MDP = 'Passe123456';
  const email = (n: string): string => `${PREFIXE}${n}@cert-eet.local`;
  const ids: Record<string, string> = {};
  let tokenAdmin = '';
  let formationId = '';
  let certificatId = '';

  const nettoyer = async (): Promise<void> => {
    await purgerCertificats(dataSource, MARQUEUR);
    const lignes = (await dataSource.query(
      `SELECT id FROM users WHERE email LIKE $1 OR id = ANY($2::uuid[])`,
      [`${PREFIXE}%`, Object.values(ids)],
    )) as Array<{ id: string }>;
    const tous = lignes.map((l) => l.id);
    if (tous.length > 0) {
      const qr = dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await qr.query("SET LOCAL app.audit_maintenance = 'on'");
        await qr.query('DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)', [
          tous,
          tous.map(String),
        ]);
        await qr.commitTransaction();
      } catch (erreur) {
        await qr.rollbackTransaction();
        throw erreur;
      } finally {
        await qr.release();
      }
      await dataSource.query('DELETE FROM demandes_role WHERE user_id = ANY($1)', [tous]);
      await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [tous]);
    }
    await dataSource.query(`DELETE FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`]);
    if (tous.length > 0) await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [tous]);
  };

  const creer = async (n: string, role: string, extra = ''): Promise<string> => {
    const hash = await bcrypt.hash(MDP, 4);
    const [l] = (await dataSource.query(
      `INSERT INTO users (email, nom, prenom, mot_de_passe_hash, role, statut, profil_complet ${extra ? ', date_naissance, etablissement_autre, mfa_active, mfa_secret' : ''})
       VALUES ($1, 'Gharbi', 'Inès', $2, $3, 'ACTIF', true ${extra ? ", '2000-05-04', 'Lycée pilote', false, 'SECRETBASE32'" : ''})
       RETURNING id`,
      [email(n), hash, role],
    )) as Array<{ id: string }>;
    return l.id;
  };

  const connecter = async (adresse: string): Promise<{ access: string; cookie: string }> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adresse, password: MDP })
      .expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refreshToken='),
    ) as string;
    return { access: res.body.accessToken as string, cookie: cookie.split(';')[0] };
  };

  const anonymiser = (
    cible: string,
    corps: Record<string, unknown>,
    jeton = tokenAdmin,
  ): request.Test =>
    request(app.getHttpServer())
      .post(`/api/admin/users/${cible}/anonymiser`)
      .set('Authorization', `Bearer ${jeton}`)
      .send(corps);

  const CONFIRME = { motDePasseAdmin: MDP, confirmation: 'ANONYMISER' };

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
    jest.spyOn(moduleRef.get(MailService), 'sendCertificatEmisEmail').mockResolvedValue(undefined);
    await nettoyer();
    ids.admin = await creer('admin', 'ADMINISTRATEUR');
    ids.cible = await creer('cible', 'APPRENANT', 'profil');
    ids.course = await creer('course', 'APPRENANT');
    tokenAdmin = (await connecter(email('admin'))).access;
    const [f] = (await dataSource.query(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Sécurité applicative`],
    )) as Array<{ id: string }>;
    formationId = f.id;
    certificatId = (
      await moduleRef.get(CertificatsService).demanderEmission(ids.cible, formationId, 81)
    ).certificatId;
    const fin = Date.now() + 20_000;
    for (;;) {
      const [c] = (await dataSource.query('SELECT statut FROM certificats WHERE id = $1', [
        certificatId,
      ])) as Array<{ statut: string }>;
      if (c?.statut === 'ACTIF') break;
      if (Date.now() > fin) throw new Error(`Certificat : ${c?.statut}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    await dataSource.query(
      `INSERT INTO comptes_oauth (user_id, provider, provider_id, email) VALUES ($1, 'google', $2, $3)`,
      [ids.cible, `cpt04-${crypto.randomUUID()}`, email('cible')],
    );
    await dataSource.query(
      `INSERT INTO jetons_lien_email (user_id, objet, empreinte, expire_le)
       VALUES ($1, 'REINITIALISATION_MDP', $2, now() + interval '30 minutes')`,
      [ids.cible, crypto.randomBytes(32).toString('hex')],
    );
    await dataSource.query(
      `INSERT INTO demandes_role (user_id, role_demande, justification, statut)
       VALUES ($1, 'FORMATEUR', 'Je suis Inès Gharbi, joignable au 22 000 000', 'EN_ATTENTE')`,
      [ids.cible],
    );
  }, 90_000);

  afterAll(async () => {
    const cles = await redis.keys('limite:verification:*');
    if (cles.length > 0) await redis.del(...cles);
    await nettoyer();
    await app.close();
  });

  it('confirmation et refus : 401 sans jeton, 400 sans le mot exact, 401 mauvais mot de passe (rien modifié, tentative tracée), 403 soi-même, 404', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/users/${ids.cible}/anonymiser`)
      .send(CONFIRME)
      .expect(401);
    await anonymiser(ids.cible, { motDePasseAdmin: MDP }).expect(400);
    await anonymiser(ids.cible, { motDePasseAdmin: MDP, confirmation: 'oui' }).expect(400);
    await anonymiser(ids.cible, { ...CONFIRME, autre: 1 }).expect(400);
    await anonymiser(ids.cible, { ...CONFIRME, motDePasseAdmin: 'Mauvais123' }).expect(401);
    const [u] = (await dataSource.query('SELECT statut, email FROM users WHERE id = $1', [
      ids.cible,
    ])) as Array<{ statut: string; email: string }>;
    expect(u).toEqual({ statut: 'ACTIF', email: email('cible') });
    const echecs = (await dataSource.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'COMPTE_ANONYMISE' AND resultat = 'Échec' AND cible = $1`,
      [ids.cible],
    )) as Array<{ n: number }>;
    expect(echecs[0].n).toBe(1);
    await anonymiser(ids.admin, CONFIRME).expect(403);
    await anonymiser('00000000-0000-4000-8000-000000000000', CONFIRME).expect(404);
    const apprenant = await connecter(email('course'));
    await anonymiser(ids.cible, CONFIRME, apprenant.access).expect(403);
  });

  it('nominal : données personnelles effacées, sessions révoquées, certificat toujours vérifiable sans identité, données pédagogiques et audit conservés', async () => {
    const session = await connecter(email('cible'));
    const avant = await request(app.getHttpServer())
      .get(`/api/verification/${certificatId}`)
      .expect(200);
    expect(avant.body.titulaire).toBe('Inès Gharbi');
    await request(app.getHttpServer()).get(`/api/verification/${certificatId}/pdf`).expect(200);

    const res = await anonymiser(ids.cible, CONFIRME).expect(200);
    expect(res.body).toMatchObject({
      id: ids.cible,
      statut: 'ANONYMISE',
      email: `anonyme-${ids.cible}@anonymise.invalid`,
      nom: 'Compte anonymisé',
    });
    expect(res.body.sessionsRevoquees).toBeGreaterThanOrEqual(1);

    const [u] = (await dataSource.query(
      `SELECT email, nom, prenom, mot_de_passe_hash, mfa_active, mfa_secret, date_naissance,
              etablissement_autre, derniere_connexion, statut FROM users WHERE id = $1`,
      [ids.cible],
    )) as Array<Record<string, unknown>>;
    expect(u).toEqual({
      email: `anonyme-${ids.cible}@anonymise.invalid`,
      nom: 'Compte anonymisé',
      prenom: null,
      mot_de_passe_hash: null,
      mfa_active: false,
      mfa_secret: null,
      date_naissance: null,
      etablissement_autre: null,
      derniere_connexion: null,
      statut: 'ANONYMISE',
    });
    const compte = async (sql: string): Promise<number> =>
      ((await dataSource.query(sql, [ids.cible])) as Array<{ n: number }>)[0].n;
    expect(await compte('SELECT count(*)::int AS n FROM comptes_oauth WHERE user_id = $1')).toBe(0);
    expect(
      await compte('SELECT count(*)::int AS n FROM jetons_lien_email WHERE user_id = $1'),
    ).toBe(0);
    expect(
      await compte(
        'SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND (active OR adresse_ip IS NOT NULL OR user_agent IS NOT NULL)',
      ),
    ).toBe(0);
    const [demande] = (await dataSource.query(
      'SELECT justification FROM demandes_role WHERE user_id = $1',
      [ids.cible],
    )) as Array<{ justification: string }>;
    expect(demande.justification).toBe('[anonymisé]');

    // Sessions : jeton d'accès et refresh refusés ; ancienne adresse inconnue.
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.access}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email('cible'), password: MDP })
      .expect(401);

    // Certificat conservé : vérifiable, intègre, titulaire masqué, PDF public coupé.
    const apres = await request(app.getHttpServer())
      .get(`/api/verification/${certificatId}`)
      .expect(200);
    expect(apres.body).toMatchObject({
      verdict: 'VALIDE',
      integrite: 'VERIFIEE',
      titulaire: 'Titulaire anonymisé',
      scoreFinal: 81,
    });
    const corps = JSON.stringify(apres.body);
    expect(corps).not.toMatch(/Inès|Gharbi|cpt04-cible/);
    await request(app.getHttpServer()).get(`/api/verification/${certificatId}/pdf`).expect(404);
    expect(
      await compte(
        "SELECT count(*)::int AS n FROM certificats WHERE apprenant_id = $1 AND statut = 'ACTIF'",
      ),
    ).toBe(1);

    // Audit : l'anonymisation est tracée sans donnée personnelle ; le journal
    // antérieur est conservé.
    const [trace] = (await dataSource.query(
      `SELECT user_id, details_avant_apres AS d FROM audit_logs
        WHERE action = 'COMPTE_ANONYMISE' AND resultat = 'Succès' AND cible = $1`,
      [ids.cible],
    )) as Array<{ user_id: string; d: Record<string, unknown> }>;
    expect(trace.user_id).toBe(ids.admin);
    expect(trace.d).toMatchObject({
      role: 'APPRENANT',
      ancienStatut: 'ACTIF',
      liaisonsOauthSupprimees: 1,
    });
    expect(JSON.stringify(trace.d)).not.toMatch(/Inès|Gharbi|cpt04-cible|@/);
    expect(
      await compte(
        "SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1 AND action = 'LOGIN'",
      ),
    ).toBeGreaterThanOrEqual(1);

    // Liste d'administration : plus d'identité.
    const liste = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const ligne = (liste.body as Array<{ id: string; nom: string; prenom: string | null }>).find(
      (x) => x.id === ids.cible,
    );
    expect(ligne).toMatchObject({ nom: 'Compte anonymisé', prenom: null });

    // Irréversible : une seconde anonymisation est refusée.
    await anonymiser(ids.cible, CONFIRME).expect(409);
  });

  it('concurrence forcée : 5 anonymisations simultanées du même compte -> une seule réussit', async () => {
    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => anonymiser(ids.course, CONFIRME)),
    );
    const statuts = reponses.map((r) => r.status);
    expect(statuts.filter((s) => s === 200)).toHaveLength(1);
    expect(statuts.filter((s) => s === 409)).toHaveLength(4);
    const succes = (await dataSource.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'COMPTE_ANONYMISE' AND resultat = 'Succès' AND cible = $1`,
      [ids.course],
    )) as Array<{ n: number }>;
    expect(succes[0].n).toBe(1);
  });

  it('dernier administrateur actif : deux administrateurs seuls actifs s’anonymisent l’un l’autre en même temps -> il en reste un', async () => {
    ids.adminB = await creer('admin-b', 'ADMINISTRATEUR');
    const tokenB = (await connecter(email('admin-b'))).access;
    // Les autres administrateurs actifs de la base sont mis de côté le temps du test.
    const autres = (
      (await dataSource.query(
        `SELECT id FROM users WHERE role = 'ADMINISTRATEUR' AND statut = 'ACTIF' AND id <> ALL($1::uuid[])`,
        [[ids.admin, ids.adminB]],
      )) as Array<{ id: string }>
    ).map((l) => l.id);
    await dataSource.query(`UPDATE users SET statut = 'DESACTIVE' WHERE id = ANY($1::uuid[])`, [
      autres,
    ]);
    try {
      const [ab, ba] = await Promise.all([
        anonymiser(ids.adminB, CONFIRME, tokenAdmin),
        anonymiser(ids.admin, CONFIRME, tokenB),
      ]);
      const statuts = [ab.status, ba.status];
      expect(statuts.filter((s) => s === 200)).toHaveLength(1);
      expect(statuts.filter((s) => s === 403 || s === 401)).toHaveLength(1);
      const actifs = (await dataSource.query(
        `SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND statut = 'ACTIF'`,
        [[ids.admin, ids.adminB]],
      )) as Array<{ n: number }>;
      expect(actifs[0].n).toBe(1);
    } finally {
      await dataSource.query(`UPDATE users SET statut = 'ACTIF' WHERE id = ANY($1::uuid[])`, [
        autres,
      ]);
    }
  });
});
