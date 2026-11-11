import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * E2E-CPT02 — US-CPT-02 : import CSV de comptes par l'administrateur.
 *
 * Tout est réel (base, Redis, file BullMQ et son worker, guards) sauf l'envoi
 * d'email, espionné : le lien d'activation est lu dans l'appel capté. Vérifie
 * l'accès, les refus de fichier, le rapport ligne par ligne SANS création
 * partielle, la création EN_ATTENTE_ACTIVATION, les emails asynchrones,
 * l'activation par le lien, le renvoi, l'audit, et 5 imports simultanés du
 * même fichier -> un seul réussit.
 */
describe('E2E-CPT02 — Import CSV de comptes (US-CPT-02)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let redis: Redis;
  let activationMail: jest.SpyInstance;
  let tokenAdmin = '';
  let tokenApprenant = '';
  let adminId = '';

  const PREFIXE = 'e2e-cpt02-';
  const MDP = 'Passe123456';
  const email = (nom: string): string => `${PREFIXE}${nom}@cert-eet.local`;

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
      await qr.query('DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)', [
        ids,
        ids.map(String),
      ]);
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

  const connecter = async (adresse: string, motDePasse = MDP): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adresse, password: motDePasse })
      .expect(200);
    return res.body.accessToken as string;
  };

  const importer = (contenu: string | Buffer, jeton = tokenAdmin): request.Test =>
    request(app.getHttpServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${jeton}`)
      .attach('fichier', Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu, 'utf8'), {
        filename: 'comptes.csv',
        contentType: 'text/csv',
      });

  const comptesImportes = async (): Promise<
    Array<{ email: string; role: string; statut: string; mot_de_passe_hash: string | null }>
  > =>
    dataSource.query(
      `SELECT email, role, statut, mot_de_passe_hash FROM users
        WHERE email LIKE $1 AND email NOT IN ($2, $3) ORDER BY email`,
      [`${PREFIXE}%`, email('admin'), email('apprenant')],
    );

  /** Attend que le worker ait envoyé `n` emails d'activation (asynchrones). */
  const attendreEmails = async (n: number): Promise<void> => {
    for (let i = 0; i < 100 && activationMail.mock.calls.length < n; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(activationMail).toHaveBeenCalledTimes(n);
  };

  const jetonPour = (adresse: string): string => {
    const appels = activationMail.mock.calls.filter((c) => c[0] === adresse);
    const lien = (appels[appels.length - 1][1] as { lien: string }).lien;
    return decodeURIComponent(new URL(lien).searchParams.get('token') as string);
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
    redis = moduleRef.get<Redis>(REDIS_CLIENT);
    activationMail = jest
      .spyOn(moduleRef.get(MailService), 'sendActivationCompteEmail')
      .mockResolvedValue();
    await nettoyer();
    const hash = await bcrypt.hash(MDP, 4);
    const lignes = (await dataSource.query(
      `INSERT INTO users (email, nom, prenom, mot_de_passe_hash, role, statut, profil_complet)
       VALUES ($1, 'Admin', 'Cpt02', $3, 'ADMINISTRATEUR', 'ACTIF', true),
              ($2, 'Apprenant', 'Cpt02', $3, 'APPRENANT', 'ACTIF', true)
       RETURNING id, email`,
      [email('admin'), email('apprenant'), hash],
    )) as Array<{ id: string; email: string }>;
    adminId = (lignes.find((l) => l.email === email('admin')) as { id: string }).id;
    tokenAdmin = await connecter(email('admin'));
    tokenApprenant = await connecter(email('apprenant'));
  });

  afterAll(async () => {
    const cles = await redis.keys('limite:activation:*');
    if (cles.length > 0) await redis.del(...cles);
    await nettoyer();
    await app.close();
  });

  beforeEach(() => activationMail.mockClear());

  it('accès : 401 sans jeton, 403 pour un apprenant ; fichier absent 400, trop gros 413', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/users/import')
      .attach('fichier', Buffer.from('email;nom;prenom\n'), 'c.csv')
      .expect(401);
    await importer('email;nom;prenom\nx@y.tn;A;B\n', tokenApprenant).expect(403);
    const sansFichier = await request(app.getHttpServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('autre', 'x')
      .expect(400);
    expect(sansFichier.body.message).toMatch(/Joignez un fichier CSV/);
    const gros = await importer(Buffer.alloc(256 * 1024 + 10, 97)).expect(413);
    expect(gros.body.message).toMatch(/256 Ko/);
  });

  it('structure : colonnes obligatoires absentes ou fichier vide -> 400, rien créé', async () => {
    const r = await importer(`email;nom\n${email('a')};A\n`).expect(400);
    expect(r.body.message).toMatch(/prenom/);
    await importer('email;nom;prenom\n').expect(400);
    expect(await comptesImportes()).toEqual([]);
  });

  it('tout ou rien : une seule ligne fautive bloque tout, rapport ligne par ligne, audit Échec', async () => {
    // Un compte existant enregistré avec des majuscules est reconnu sans casse.
    await dataSource.query(
      `INSERT INTO users (email, nom, prenom, role, statut) VALUES ($1, 'M', 'Aj', 'APPRENANT', 'ACTIF')`,
      [email('Majuscule')],
    );
    const r = await importer(
      'email;nom;prenom;role\n' +
        `${email('bon1')};Abidi;Amel;\n` +
        `pas-un-email;Ben;Bilel;\n` +
        `${email('bon2')};;Sami;FORMATEUR\n` +
        `${email('bon1').toUpperCase()};X;Y;\n` +
        `${email('admin')};Admin;Deja;\n` +
        `${email('bon3')};Chaabane;Rim;ADMINISTRATEUR\n` +
        `${email('majuscule')};Min;Uscule;\n`,
    ).expect(400);
    expect(r.body).toMatchObject({ lignesAnalysees: 7, lignesEnErreur: 6 });
    expect(r.body.message).toMatch(/Aucun compte n'a été créé/);
    expect(
      (r.body.erreurs as Array<{ ligne: number; erreurs: string[] }>).map((e) => [
        e.ligne,
        e.erreurs,
      ]),
    ).toEqual([
      [3, ['EMAIL_INVALIDE']],
      [4, ['NOM_MANQUANT']],
      [5, ['DOUBLON_FICHIER']],
      [6, ['COMPTE_EXISTANT']],
      [7, ['ROLE_INVALIDE']],
      [8, ['COMPTE_EXISTANT']],
    ]);
    await dataSource.query(`DELETE FROM users WHERE email = $1`, [email('Majuscule')]);
    expect(await comptesImportes()).toEqual([]);
    const audits = (await dataSource.query(
      `SELECT resultat, details_avant_apres AS d FROM audit_logs
        WHERE user_id = $1 AND action = 'COMPTES_IMPORTES' ORDER BY horodatage DESC LIMIT 1`,
      [adminId],
    )) as Array<{ resultat: string; d: Record<string, number> }>;
    expect(audits[0]).toMatchObject({
      resultat: 'Échec',
      d: { lignesAnalysees: 7, lignesEnErreur: 6 },
    });
    expect(activationMail).not.toHaveBeenCalled();
  });

  it('nominal : comptes EN_ATTENTE_ACTIVATION sans mot de passe, audits, emails d’activation asynchrones, activation par le lien', async () => {
    const r = await importer(
      'Prénom,Nom,Email,Rôle\n'.replace('Rôle', 'role') +
        `Amel,"Abidi, épouse Ben",${email('amel')},\n` +
        `Bilel,Ben Salah,${email('bilel').toUpperCase()},formateur\n` +
        `Rim,Chaabane,${email('rim')},APPRENANT\n`,
    ).expect(201);
    expect(r.body.crees).toBe(3);
    expect(r.body.comptes.map((c: { email: string }) => c.email)).toEqual([
      email('amel'),
      email('bilel'),
      email('rim'),
    ]);
    const comptes = await comptesImportes();
    expect(comptes).toEqual([
      {
        email: email('amel'),
        role: 'APPRENANT',
        statut: 'EN_ATTENTE_ACTIVATION',
        mot_de_passe_hash: null,
      },
      {
        email: email('bilel'),
        role: 'FORMATEUR',
        statut: 'EN_ATTENTE_ACTIVATION',
        mot_de_passe_hash: null,
      },
      {
        email: email('rim'),
        role: 'APPRENANT',
        statut: 'EN_ATTENTE_ACTIVATION',
        mot_de_passe_hash: null,
      },
    ]);
    const nom = (await dataSource.query(`SELECT nom FROM users WHERE email = $1`, [
      email('amel'),
    ])) as Array<{
      nom: string;
    }>;
    expect(nom[0].nom).toBe('Abidi, épouse Ben');
    const audits = (await dataSource.query(
      `SELECT action, cible FROM audit_logs WHERE user_id = $1 AND action IN ('COMPTES_IMPORTES', 'COMPTE_CREE')
         AND horodatage > now() - interval '1 minute' AND resultat = 'Succès'`,
      [adminId],
    )) as Array<{ action: string }>;
    expect(audits.filter((a) => a.action === 'COMPTES_IMPORTES')).toHaveLength(1);
    expect(audits.filter((a) => a.action === 'COMPTE_CREE')).toHaveLength(3);

    await attendreEmails(3);
    // Jeton : empreinte seule en base, objet ACTIVATION_COMPTE, 48 h.
    const jeton = jetonPour(email('amel'));
    const enBase = (await dataSource.query(
      `SELECT objet, round(extract(epoch FROM expire_le - cree_le)) AS duree FROM jetons_lien_email j
         JOIN users u ON u.id = j.user_id WHERE u.email = $1 AND j.utilise_le IS NULL`,
      [email('amel')],
    )) as Array<{ objet: string; duree: string }>;
    expect(enBase).toEqual([{ objet: 'ACTIVATION_COMPTE', duree: '172800' }]);

    // Pas de connexion avant activation.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email('amel'), password: 'Choisi123' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/activate')
      .send({ token: jeton, nouveauMotDePasse: 'faible' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/activate')
      .send({ token: jeton, nouveauMotDePasse: 'Choisi123' })
      .expect(200);
    await connecter(email('amel'), 'Choisi123');
    // Usage unique.
    await request(app.getHttpServer())
      .post('/api/auth/activate')
      .send({ token: jeton, nouveauMotDePasse: 'Autre12345' })
      .expect(400);
  });

  it('renvoi de l’activation : 202 pour un compte en attente (l’ancien lien ne marche plus), 409 actif, 404 inconnu', async () => {
    const [bilel] = (await dataSource.query(`SELECT id FROM users WHERE email = $1`, [
      email('bilel'),
    ])) as Array<{ id: string }>;
    const [amel] = (await dataSource.query(`SELECT id FROM users WHERE email = $1`, [
      email('amel'),
    ])) as Array<{ id: string }>;
    const ancien = (await dataSource.query(
      `SELECT empreinte FROM jetons_lien_email WHERE user_id = $1 AND utilise_le IS NULL`,
      [bilel.id],
    )) as Array<{ empreinte: string }>;
    expect(ancien).toHaveLength(1);
    await request(app.getHttpServer())
      .post(`/api/admin/users/${bilel.id}/activation`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(202);
    await attendreEmails(1);
    const actuels = (await dataSource.query(
      `SELECT empreinte FROM jetons_lien_email WHERE user_id = $1 AND utilise_le IS NULL`,
      [bilel.id],
    )) as Array<{ empreinte: string }>;
    expect(actuels).toHaveLength(1);
    expect(actuels[0].empreinte).not.toBe(ancien[0].empreinte);
    await request(app.getHttpServer())
      .post(`/api/admin/users/${amel.id}/activation`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/admin/users/00000000-0000-4000-8000-000000000000/activation')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/admin/users/${bilel.id}/activation`)
      .set('Authorization', `Bearer ${tokenApprenant}`)
      .expect(403);
  });

  it('concurrence forcée : 5 imports simultanés du même fichier -> un seul crée les comptes', async () => {
    const contenu = `email;nom;prenom\n${email('c1')};C;Un\n${email('c2')};C;Deux\n`;
    const reponses = await Promise.all(Array.from({ length: 5 }, () => importer(contenu)));
    const statuts = reponses.map((r) => r.status);
    expect(statuts.filter((s) => s === 201)).toHaveLength(1);
    expect(statuts.filter((s) => s === 400)).toHaveLength(4);
    for (const r of reponses.filter((x) => x.status === 400)) {
      expect(r.body.erreurs.map((e: { erreurs: string[] }) => e.erreurs[0])).toEqual([
        'COMPTE_EXISTANT',
        'COMPTE_EXISTANT',
      ]);
    }
    const crees = (await dataSource.query(
      `SELECT count(*)::int AS n FROM users WHERE email IN ($1, $2)`,
      [email('c1'), email('c2')],
    )) as Array<{ n: number }>;
    expect(crees[0].n).toBe(2);
    await attendreEmails(2);
  });
});
