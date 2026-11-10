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
  MESSAGE_DEJA_DESINSCRIT,
  MESSAGE_PAS_INSCRIT,
  MOTIF_DESINSCRIPTION,
} from '../src/modules/inscriptions/desinscription/desinscription.service';

/**
 * Tests d'intégration US-INSC-03 — Se désinscrire (DS-11 P1), sur
 * l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur ; 404 formation où l'apprenant n'est pas
 *    inscrit ; 400 confirmation absente, fausse, champ inconnu ;
 *  - conséquences : accès retiré, tentative en cours annoncée, certificat
 *    conservé ;
 *  - désinscription : SUSPENDUE (motif, auteur = l'apprenant), espace refusé
 *    (403), ré-inscription seule refusée (409), certificat toujours VALIDE à la
 *    vérification publique, audit ; 409 en double ; réactivation par un
 *    administrateur (US-INSC-02) ;
 *  - concurrence : 8 désinscriptions simultanées -> 1 × 200, 7 × 409, une trace.
 *
 * Marqueur `E2E-INSC03` (titres) ; emails `e2e-insc03-…`.
 */
describe('Désinscription (e2e) — US-INSC-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-INSC03';
  const email = (cle: string): string => `e2e-insc03-${cle}@cert-eet.local`;
  const CLES = ['admin', 'formateur', 'a', 'b'];
  const ALL_EMAILS = CLES.map(email);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const get = (url: string, token = tokens.a): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: object, token = tokens.a): request.Test =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const url = (f: string): string => `/api/formations/${f}/desinscription`;

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
  const formation = (titre: string): Promise<string> =>
    un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} ${titre}`],
    );

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
    const certificats = (
      await sql<{ id: string }>(
        `SELECT id::text AS id FROM certificats WHERE formation_id = ANY($1)`,
        [formations],
      )
    ).map((c) => c.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...inscriptions, ...certificats],
      ]);
      await qr.query(`DELETE FROM certificats WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(
        `DELETE FROM qcm WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
        [formations],
      );
      await qr.query(`DELETE FROM modules WHERE formation_id = ANY($1)`, [formations]);
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
    for (const cle of CLES) {
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
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Desinscription',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(email(cle));
    }
    ids.f = await formation('Back-end');
    ids.autre = await formation('Autre');
    ids.rafale = await formation('Rafale');
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      ids.f,
      ids.formateur,
    ]);
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $3), ($2, $3), ($1, $4)`,
      [ids.a, ids.b, ids.f, ids.rafale],
    );
    const m1 = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    const q = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
      [m1, `${MARQUEUR} QCM`],
    );
    await sql(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, statut)
       VALUES ($1, $2, now(), now() + interval '30 minutes', 'EN_COURS')`,
      [ids.a, q],
    );
    ids.cert = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256)
       VALUES ($1, $2, 'ACTIF', 82, 'Très bien', 'ESPRIT Entreprise', now(), now(), $3, $4) RETURNING id`,
      [ids.a, ids.f, `certificats/${MARQUEUR}-a.pdf`, 'a'.repeat(64)],
    );
    ids.insA = await un(
      `SELECT id FROM inscriptions WHERE apprenant_id = $1 AND formation_id = $2`,
      [ids.a, ids.f],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et validation', () => {
    it('401 ; 403 formateur ; 404 si pas inscrit ; 400 identifiant', async () => {
      await request(app.getHttpServer()).get(url(ids.f)).expect(401);
      await get(url(ids.f), tokens.formateur).expect(403);
      await post(url(ids.f), { confirmer: true }, tokens.formateur).expect(403);
      const r = await get(url(ids.autre)).expect(404);
      expect(r.body.message).toBe(MESSAGE_PAS_INSCRIT);
      await post(url(ids.autre), { confirmer: true }).expect(404);
      await get('/api/formations/pas-un-uuid/desinscription').expect(400);
    });

    it('400 : confirmation absente, fausse, champ inconnu ; rien ne change', async () => {
      await post(url(ids.f), {}).expect(400);
      await post(url(ids.f), { confirmer: false }).expect(400);
      await post(url(ids.f), { confirmer: true, motif: 'x' }).expect(400);
      const [{ statut }] = await sql<{ statut: string }>(
        `SELECT statut::text AS statut FROM inscriptions WHERE id = $1`,
        [ids.insA],
      );
      expect(statut).toBe('EN_COURS');
    });
  });

  describe('Désinscription', () => {
    it('conséquences : tentative en cours et certificat conservé annoncés', async () => {
      const res = await get(url(ids.f)).expect(200);
      expect(res.body).toMatchObject({
        formation: { id: ids.f, titre: `${MARQUEUR} Back-end` },
        statut: 'EN_COURS',
        possible: true,
        tentativesEnCours: 1,
        livrablesEnAttente: 0,
        certificatsConserves: 1,
      });
      expect((res.body.consequences as string[]).join(' ')).toContain(
        '1 certificat(s) obtenu(s) restent valides',
      );
    });

    it('SUSPENDUE, accès retiré, pas de ré-inscription seule, certificat VALIDE, audit', async () => {
      const res = await post(url(ids.f), { confirmer: true }).expect(200);
      expect(res.body).toEqual({
        statut: 'SUSPENDUE',
        formation: { id: ids.f, titre: `${MARQUEUR} Back-end` },
      });
      const [i] = await sql<{ statut: string; motif: string; par: string }>(
        `SELECT statut::text AS statut, motif_suspension AS motif, suspendue_par AS par
           FROM inscriptions WHERE id = $1`,
        [ids.insA],
      );
      expect(i).toEqual({ statut: 'SUSPENDUE', motif: MOTIF_DESINSCRIPTION, par: ids.a });
      expect(await traces('INSCRIPTION_DESINSCRITE', ids.insA)).toBe(1);

      await get(`/api/formations/${ids.f}/mon-espace`).expect(403);
      await post(`/api/formations/${ids.f}/inscriptions`, {}).expect(409);
      const v = await request(app.getHttpServer()).get(`/api/verification/${ids.cert}`).expect(200);
      expect(v.body).toMatchObject({ verdict: 'VALIDE' });

      const mes = await get('/api/mes-inscriptions').expect(200);
      const ligne = (mes.body as Array<{ statut: string; formation: { id: string } }>).find(
        (x) => x.formation.id === ids.f,
      );
      expect(ligne?.statut).toBe('SUSPENDUE');
      // L'autre apprenant n'est pas touché.
      await get(`/api/formations/${ids.f}/mon-espace`, tokens.b).expect(200);
    });

    it('409 en double ; conséquences : « impossible » ; réactivation par l’administrateur', async () => {
      const r = await post(url(ids.f), { confirmer: true }).expect(409);
      expect(r.body.message).toBe(MESSAGE_DEJA_DESINSCRIT);
      expect((await get(url(ids.f)).expect(200)).body.possible).toBe(false);
      await post(`/api/admin/inscriptions/${ids.insA}/reactiver`, {}, tokens.admin).expect(200);
      await get(`/api/formations/${ids.f}/mon-espace`).expect(200);
    });
  });

  describe('Concurrence', () => {
    it('8 désinscriptions simultanées : 1 × 200, 7 × 409, une trace', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () => post(url(ids.rafale), { confirmer: true })),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([
        200, 409, 409, 409, 409, 409, 409, 409,
      ]);
      const ins = await un(
        `SELECT id FROM inscriptions WHERE apprenant_id = $1 AND formation_id = $2`,
        [ids.a, ids.rafale],
      );
      expect(await traces('INSCRIPTION_DESINSCRITE', ins)).toBe(1);
    });
  });
});
