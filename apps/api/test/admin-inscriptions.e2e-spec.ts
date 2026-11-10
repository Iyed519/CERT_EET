import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import {
  MESSAGE_DEJA_SUSPENDUE,
  MESSAGE_FORMATION_COMPLETE,
  MESSAGE_FORMATION_NON_OUVERTE,
  MESSAGE_PAS_SUSPENDUE,
} from '../src/modules/inscriptions/admin/admin-inscriptions.service';
import { MESSAGE_FICHIER_CSV_MANQUANT } from '../src/modules/inscriptions/admin/admin-inscriptions.controller';
import {
  MESSAGE_IMPORT_TROP_GROS,
  MESSAGE_IMPORT_TROP_LONG,
} from '../src/modules/inscriptions/admin/import-inscriptions.regles';

/**
 * Tests d'intégration US-INSC-02 — Gérer les inscriptions (administrateur),
 * sur l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur et apprenant ; 404 ; 400 email, motif,
 *    filtre, champ inconnu ;
 *  - ajout par email : 201 + audit ; 409 déjà inscrit, compte formateur,
 *    compte désactivé, formation fermée ; 404 compte inconnu ;
 *  - suspension motivée : l'apprenant perd l'accès à son espace (403) et ne
 *    peut pas se ré-inscrire seul ; 409 déjà suspendue ; réactivation (motif
 *    effacé, accès rendu) ; 409 pas suspendue ; capacité respectée ;
 *  - import CSV : rapport ligne par ligne (inscrit, doublon, inconnu, pas
 *    apprenant, email invalide, déjà inscrit, suspendu, complet), une trace ;
 *    400 sans fichier, > 500 lignes ; 413 > 64 Ko ;
 *  - concurrence : 8 ajouts simultanés sur 3 places -> 3 × 201, 5 × 409 ;
 *    8 suspensions simultanées -> 1 × 200, 7 × 409.
 *
 * Marqueur `E2E-INSC02` (titres) ; emails `e2e-insc02-…`.
 */
describe('Gestion des inscriptions (e2e) — US-INSC-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-INSC02';
  const email = (cle: string): string => `e2e-insc02-${cle}@cert-eet.local`;
  const APPRENANTS = [
    'a',
    'b',
    'c',
    'd',
    'inactif',
    ...Array.from({ length: 8 }, (_, i) => `r${i}`),
  ];
  const ALL_EMAILS = ['admin', 'formateur', ...APPRENANTS].map(email);
  const INCONNU = '77777777-7777-4777-8777-777777777777';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const get = (url: string, token = tokens.admin): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: object, token = tokens.admin): request.Test =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const ajouter = (formation: string, e: string, token = tokens.admin): request.Test =>
    post(`/api/admin/formations/${formation}/inscriptions`, { email: e }, token);
  const importer = (formation: string, contenu: Buffer | string): request.Test =>
    request(app.getHttpServer())
      .post(`/api/admin/formations/${formation}/inscriptions/import`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .attach('fichier', Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu), {
        filename: 'inscriptions.csv',
        contentType: 'text/csv',
      });

  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];
  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;
  const traces = async (action: string, cible: string): Promise<number> =>
    (
      await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = $1 AND cible = $2`,
        [action, cible],
      )
    )[0].n;
  const formation = (titre: string, capacite: number, statut = 'OUVERTE'): Promise<string> =>
    un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, $2, $3, 60) RETURNING id`,
      [`${MARQUEUR} ${titre}`, statut, capacite],
    );
  const inscriptionDe = async (apprenant: string, f: string): Promise<string> =>
    un(`SELECT id FROM inscriptions WHERE apprenant_id = $1 AND formation_id = $2`, [apprenant, f]);

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const inscriptions = (
      await sql<{ id: string }>(
        `SELECT id::text AS id FROM inscriptions WHERE formation_id = ANY($1)`,
        [formations],
      )
    ).map((i) => i.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...inscriptions],
      ]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formations WHERE id = ANY($1)`, [formations]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    await userRepository.delete({ email: In(ALL_EMAILS) });
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
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const cle of ['admin', 'formateur', ...APPRENANTS]) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role:
            cle === 'admin'
              ? Role.ADMINISTRATEUR
              : cle === 'formateur'
                ? Role.FORMATEUR
                : Role.APPRENANT,
          motDePasseHash,
          statut: cle === 'inactif' ? StatutCompte.DESACTIVE : StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Inscription',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      if (['admin', 'formateur', 'a', 'b'].includes(cle)) tokens[cle] = await login(email(cle));
    }
    ids.f = await formation('Back-end', 3);
    ids.fermee = await formation('Fermée', 10, 'FERMEE');
    ids.rafale = await formation('Rafale', 3);
    ids.imp = await formation('Import', 3);
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et validation', () => {
    it('401 ; 403 formateur et apprenant ; 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/formations/${ids.f}/inscriptions`)
        .expect(401);
      await get(`/api/admin/formations/${ids.f}/inscriptions`, tokens.formateur).expect(403);
      await ajouter(ids.f, email('c'), tokens.a).expect(403);
      await get(`/api/admin/formations/${INCONNU}/inscriptions`).expect(404);
      await ajouter(INCONNU, email('c')).expect(404);
      await post(`/api/admin/inscriptions/${INCONNU}/reactiver`, {}).expect(404);
    });

    it('400 : email, champ inconnu, filtre, identifiant', async () => {
      await ajouter(ids.f, 'pas-un-email').expect(400);
      await post(`/api/admin/formations/${ids.f}/inscriptions`, {
        email: email('c'),
        role: 'x',
      }).expect(400);
      await get(`/api/admin/formations/${ids.f}/inscriptions?statut=SUPPRIMEE`).expect(400);
      await post(`/api/admin/inscriptions/pas-un-uuid/suspendre`, { motif: 'x' }).expect(400);
    });
  });

  describe('Ajout, suspension, réactivation', () => {
    it('ajout par email (casse ignorée) : 201, audit ; refus explicites', async () => {
      const res = await ajouter(ids.f, email('a').toUpperCase()).expect(201);
      expect(res.body).toMatchObject({ statut: 'EN_COURS', apprenant: { email: email('a') } });
      ids.insA = res.body.id;
      expect(await traces('INSCRIPTION_AJOUTEE', ids.insA)).toBe(1);
      await ajouter(ids.f, email('b')).expect(201);

      expect((await ajouter(ids.f, email('a')).expect(409)).body.message).toBe('Déjà inscrit.');
      await ajouter(ids.f, email('formateur')).expect(409);
      await ajouter(ids.f, email('inactif')).expect(409);
      await ajouter(ids.f, 'personne-e2e-insc02@cert-eet.local').expect(404);
      expect((await ajouter(ids.fermee, email('a')).expect(409)).body.message).toBe(
        MESSAGE_FORMATION_NON_OUVERTE,
      );
    });

    it('suspension : 400 sans motif ; accès perdu ; pas de ré-inscription seul ; 409 en double', async () => {
      await post(`/api/admin/inscriptions/${ids.insA}/suspendre`, { motif: '   ' }).expect(400);
      await post(`/api/admin/inscriptions/${ids.insA}/suspendre`, {
        motif: 'x'.repeat(501),
      }).expect(400);
      const res = await post(`/api/admin/inscriptions/${ids.insA}/suspendre`, {
        motif: '  Absences répétées.  ',
      }).expect(200);
      expect(res.body).toMatchObject({
        statut: 'SUSPENDUE',
        motifSuspension: 'Absences répétées.',
      });
      expect(res.body.dateSuspension).toEqual(expect.any(String));
      expect(await traces('INSCRIPTION_SUSPENDUE', ids.insA)).toBe(1);

      await get(`/api/formations/${ids.f}/mon-espace`, tokens.a).expect(403);
      await post(`/api/formations/${ids.f}/inscriptions`, {}, tokens.a).expect(409);
      const double = await post(`/api/admin/inscriptions/${ids.insA}/suspendre`, {
        motif: 'Encore.',
      });
      expect(double.status).toBe(409);
      expect(double.body.message).toBe(MESSAGE_DEJA_SUSPENDUE);
      const [{ suspendue_par: par }] = await sql<{ suspendue_par: string }>(
        `SELECT suspendue_par FROM inscriptions WHERE id = $1`,
        [ids.insA],
      );
      expect(par).toBe(ids.admin);

      const filtre = await get(
        `/api/admin/formations/${ids.f}/inscriptions?statut=SUSPENDUE`,
      ).expect(200);
      expect((filtre.body as Array<{ id: string }>).map((i) => i.id)).toEqual([ids.insA]);
    });

    it('réactivation : motif effacé, accès rendu ; 409 si pas suspendue', async () => {
      const res = await post(`/api/admin/inscriptions/${ids.insA}/reactiver`, {}).expect(200);
      expect(res.body).toMatchObject({
        statut: 'EN_COURS',
        motifSuspension: null,
        dateSuspension: null,
      });
      expect(await traces('INSCRIPTION_REACTIVEE', ids.insA)).toBe(1);
      await get(`/api/formations/${ids.f}/mon-espace`, tokens.a).expect(200);
      const r = await post(`/api/admin/inscriptions/${ids.insA}/reactiver`, {}).expect(409);
      expect(r.body.message).toBe(MESSAGE_PAS_SUSPENDUE);
    });

    it('réactivation refusée si la formation est complète', async () => {
      // 3 places : a, b, c inscrits ; a suspendu ; d prend la place ; a ne peut pas revenir.
      await ajouter(ids.f, email('c')).expect(201);
      await post(`/api/admin/inscriptions/${ids.insA}/suspendre`, { motif: 'Pause.' }).expect(200);
      await ajouter(ids.f, email('d')).expect(201);
      const r = await post(`/api/admin/inscriptions/${ids.insA}/reactiver`, {}).expect(409);
      expect(r.body.message).toBe(MESSAGE_FORMATION_COMPLETE);
      const liste = await get(`/api/admin/formations/${ids.f}/inscriptions`).expect(200);
      expect(liste.body).toHaveLength(4);
    });
  });

  describe('Import CSV', () => {
    it('rapport ligne par ligne, capacité respectée, une trace', async () => {
      await ajouter(ids.imp, email('c')).expect(201);
      await post(`/api/admin/inscriptions/${await inscriptionDe(ids.c, ids.imp)}/suspendre`, {
        motif: 'Test.',
      }).expect(200);
      await ajouter(ids.imp, email('d')).expect(201);
      const csv = [
        'email;nom',
        `${email('a')};A`,
        `${email('A').toUpperCase()};doublon`,
        `${email('formateur')}`,
        'inconnu-e2e-insc02@cert-eet.local',
        'pas un email',
        `${email('d')}`,
        `${email('c')}`,
        '',
        `${email('b')}`,
        `${email('r0')}`,
      ].join('\r\n');
      const res = await importer(ids.imp, csv).expect(200);
      expect(
        (res.body.lignes as Array<{ ligne: number; resultat: string }>).map((l) => [
          l.ligne,
          l.resultat,
        ]),
      ).toEqual([
        [2, 'INSCRIT'],
        [3, 'DOUBLON'],
        [4, 'PAS_APPRENANT'],
        [5, 'COMPTE_INCONNU'],
        [6, 'EMAIL_INVALIDE'],
        [7, 'DEJA_INSCRIT'],
        [8, 'INSCRIPTION_SUSPENDUE'],
        [10, 'INSCRIT'],
        [11, 'COMPLET'],
      ]);
      expect(res.body.total).toBe(9);
      expect(res.body.bilan).toMatchObject({ INSCRIT: 2, COMPLET: 1, DOUBLON: 1 });
      expect(res.body.lignes[0].libelle).toBe('Inscrit');
      expect(await traces('INSCRIPTIONS_IMPORTEES', ids.imp)).toBe(1);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM inscriptions WHERE formation_id = $1 AND statut <> 'SUSPENDUE'`,
        [ids.imp],
      );
      expect(n).toBe(3);
    });

    it('400 sans fichier ou > 500 lignes ; 413 > 64 Ko ; 409 formation fermée', async () => {
      const sansFichier = await post(
        `/api/admin/formations/${ids.imp}/inscriptions/import`,
        {},
      ).expect(400);
      expect(sansFichier.body.message).toBe(MESSAGE_FICHIER_CSV_MANQUANT);
      const long = Array.from({ length: 501 }, (_, i) => `u${i}@x.tn`).join('\n');
      expect((await importer(ids.imp, long).expect(400)).body.message).toBe(
        MESSAGE_IMPORT_TROP_LONG,
      );
      const gros = await importer(ids.imp, Buffer.alloc(64 * 1024 + 1, 'a')).expect(413);
      expect(gros.body.message).toBe(MESSAGE_IMPORT_TROP_GROS);
      await importer(ids.fermee, email('a')).expect(409);
    });
  });

  describe('Concurrence', () => {
    it('8 ajouts simultanés sur 3 places : 3 × 201, 5 × 409', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, (_, i) => ajouter(ids.rafale, email(`r${i}`))),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([
        201, 201, 201, 409, 409, 409, 409, 409,
      ]);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM inscriptions WHERE formation_id = $1`,
        [ids.rafale],
      );
      expect(n).toBe(3);
    });

    it('8 suspensions simultanées : 1 × 200, 7 × 409, une trace', async () => {
      const ins = await inscriptionDe(ids.b, ids.f);
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () =>
          post(`/api/admin/inscriptions/${ins}/suspendre`, { motif: 'Rafale.' }),
        ),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([
        200, 409, 409, 409, 409, 409, 409, 409,
      ]);
      expect(await traces('INSCRIPTION_SUSPENDUE', ins)).toBe(1);
    });
  });
});
