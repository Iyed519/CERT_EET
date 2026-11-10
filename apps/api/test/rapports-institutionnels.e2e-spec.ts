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
import { MESSAGE_PERIODE_INVERSEE } from '../src/modules/pilotage/periode.regles';
import {
  MESSAGE_LIMITE_RAPPORTS,
  MESSAGE_RAPPORT_INTROUVABLE,
} from '../src/modules/rapports/rapports.service';
import { StockageService } from '../src/stockage/stockage.service';

/**
 * Tests d'intégration US-RPT-02 — Rapports institutionnels (DS-16 P4), sur
 * l'application réelle (PostgreSQL, Redis / BullMQ, stockage S3).
 *
 * Les données datées sont placées en FÉVRIER 2004, période réservée à cette
 * suite (aucune autre suite n'y écrit) : les comptes sur la période sont
 * donc exacts, quel que soit le contenu de la base.
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur et apprenant ; 400 modèle, format, date mal
 *    formée, début > fin, période > 366 jours, champ inconnu ;
 *  - génération : 202, période résolue conservée ; bilan par formation
 *    (inscrits, nouvelles inscriptions, tentatives et réussites, corrections,
 *    certificats émis / révoqués sur la période) ; registre des certificats
 *    (consultations publiques) ; synthèse PDF ; période sans données ->
 *    fichier valide à zéro ; audit ;
 *  - isolation : un autre administrateur reçoit 404 ;
 *  - concurrence : 8 demandes simultanées -> 5 × 202, 3 × 429.
 *
 * Marqueur `E2E-RPT02` (titres) ; emails `e2e-rpt02-…`.
 */
describe('Rapports institutionnels (e2e) — US-RPT-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-RPT02';
  const EMAIL = {
    admin: 'e2e-rpt02-admin@cert-eet.local',
    admin2: 'e2e-rpt02-admin2@cert-eet.local',
    formateur: 'e2e-rpt02-form@cert-eet.local',
    a: 'e2e-rpt02-a@cert-eet.local',
    b: 'e2e-rpt02-b@cert-eet.local',
    c: 'e2e-rpt02-c@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const FEVRIER = { du: '2004-02-01', au: '2004-02-29' };
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const get = (url: string, token = tokens.admin): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (body: object, token = tokens.admin): request.Test =>
    request(app.getHttpServer())
      .post('/api/admin/rapports')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const binaire = (res: request.Response, fin: (e: Error | null, b: Buffer) => void): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };
  const telecharger = (id: string, token = tokens.admin): request.Test =>
    get(`/api/rapports/${id}/fichier`, token).buffer(true).parse(binaire);

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

  const attendre = async (id: string, token = tokens.admin): Promise<Record<string, unknown>> => {
    for (let i = 0; i < 80; i += 1) {
      const res = await get(`/api/rapports/${id}`, token).expect(200);
      if (res.body.statut === 'PRET' || res.body.statut === 'ECHEC') return res.body;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Rapport ${id} toujours en attente.`);
  };
  const csvDe = async (id: string): Promise<string[][]> =>
    ((await telecharger(id).expect(200)).body as Buffer)
      .toString('utf8')
      .slice(1)
      .trimEnd()
      .split('\r\n')
      .map((l) => l.split(';'));

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const certificats = (
      await sql<{ id: string }>(`SELECT id FROM certificats WHERE formation_id = ANY($1)`, [
        formations,
      ])
    ).map((c) => c.id);
    const rapports = await sql<{ id: string; cle_stockage: string | null }>(
      `SELECT id, cle_stockage FROM rapports WHERE demandeur_id = ANY($1)`,
      [uids],
    );
    const cles = rapports.map((r) => r.cle_stockage).filter((c): c is string => !!c);
    if (cles.length) await moduleRef.get(StockageService).supprimer(cles);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...certificats, ...rapports.map((r) => r.id)],
      ]);
      await qr.query(`DELETE FROM rapports WHERE id = ANY($1)`, [rapports.map((r) => r.id)]);
      await qr.query(`DELETE FROM certificats WHERE id = ANY($1)`, [certificats]);
      await qr.query(
        `DELETE FROM corrections WHERE livrable_id IN (SELECT id FROM livrables WHERE apprenant_id = ANY($1))`,
        [uids],
      );
      await qr.query(`DELETE FROM livrables WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      for (const table of ['ateliers', 'qcm']) {
        await qr.query(
          `DELETE FROM ${table} WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
          [formations],
        );
      }
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
    const roles: Record<string, Role> = {
      admin: Role.ADMINISTRATEUR,
      admin2: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      a: Role.APPRENANT,
      b: Role.APPRENANT,
      c: Role.APPRENANT,
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle === 'a' ? 'Amel' : cle.toUpperCase(),
          nom: 'Institution',
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }
    ids.f = await un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Back-end`],
    );
    // a : inscrit en février 2004 ; b : inscrit en 2003 (hors période), terminé.
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription)
       VALUES ($1, $3, 'EN_COURS', '2004-02-03T10:00:00Z'), ($2, $3, 'TERMINEE', '2003-06-01T10:00:00Z')`,
      [ids.a, ids.b, ids.f],
    );
    const m1 = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    const q1 = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
      [m1, `${MARQUEUR} QCM`],
    );
    const tentative = (apprenant: string, fin: string, score: number): Promise<unknown[]> =>
      sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin,
           duree_effective, score, est_reussie, statut)
         VALUES ($1, $2, $3::timestamptz - interval '20 minutes', $3::timestamptz + interval '10 minutes',
           $3::timestamptz, 1200, $4::numeric, $4::numeric >= 60, 'NOTEE')`,
        [apprenant, q1, fin, score],
      );
    await tentative(ids.a, '2004-02-10T09:00:00Z', 80);
    await tentative(ids.a, '2004-02-12T09:00:00Z', 40);
    await tentative(ids.b, '2004-02-29T22:30:00Z', 90); // 29/02 23:30 à Tunis : dans la période.
    await tentative(ids.b, '2004-02-29T23:30:00Z', 10); // 01/03 00:30 à Tunis : hors période.
    // Tentative abandonnée (minuterie) dans la période : jamais comptée comme notée.
    await sql(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin, statut)
       VALUES ($1, $2, '2004-02-11T09:00:00Z', '2004-02-11T09:30:00Z', '2004-02-11T09:30:00Z',
         'ABANDONNEE_TIMER')`,
      [ids.a, q1],
    );
    const at = await un(
      `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
       VALUES ($1, $2, 'Énoncé (test).', '2004-02-05T10:00:00Z', '{pdf}', 'PUBLIE') RETURNING id`,
      [m1, `${MARQUEUR} Atelier`],
    );
    const livrable = await un(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'NOTE', '2004-02-04T10:00:00Z', $3) RETURNING id`,
      [at, ids.a, 'a'.repeat(64)],
    );
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture, score_total,
         commentaire_general, date_finalisation)
       VALUES ($1, $2, 'TERMINEE', '2004-02-06T10:00:00Z', 72, 'Bien.', '2004-02-07T10:00:00Z')`,
      [livrable, ids.formateur],
    );
    ids.cA = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256)
       VALUES ($1, $2, 'ACTIF', 76, 'Bien', 'ESPRIT Entreprise', '2004-02-15T10:00:00Z',
         '2004-02-15T10:00:00Z', $3, $4) RETURNING id`,
      [ids.a, ids.f, `certificats/${MARQUEUR}-a.pdf`, 'd'.repeat(64)],
    );
    ids.cB = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256, date_revocation,
         motif_revocation, description_revocation, revoque_par)
       VALUES ($1, $2, 'REVOQUE', 64, 'Passable', 'ESPRIT Entreprise', '2004-02-20T10:00:00Z',
         '2004-02-20T10:00:00Z', $3, $4, '2004-02-25T10:00:00Z', 'ERREUR_ADMIN', 'Erreur de saisie de la note finale (test).', $5) RETURNING id`,
      [ids.b, ids.f, `certificats/${MARQUEUR}-b.pdf`, 'e'.repeat(64), ids.admin],
    );
    // Émis en février, révoqué en mars : émis sur la période, pas révoqué sur la période.
    ids.cC = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256, date_revocation,
         motif_revocation, description_revocation, revoque_par)
       VALUES ($1, $2, 'REVOQUE', 61, 'Passable', 'ESPRIT Entreprise', '2004-02-22T10:00:00Z',
         '2004-02-22T10:00:00Z', $3, $4, '2004-03-05T10:00:00Z', 'FRAUDE', 'Plagiat constaté après émission (test).', $5) RETURNING id`,
      [ids.c, ids.f, `certificats/${MARQUEUR}-c.pdf`, 'f'.repeat(64), ids.admin],
    );
    for (let i = 0; i < 3; i += 1) {
      await sql(
        `INSERT INTO audit_logs (action, cible, resultat, horodatage)
         VALUES ('CERTIFICAT_VERIFIE', $1, 'Succès', '2004-02-16T10:00:00Z')`,
        [ids.cA],
      );
    }
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et validation', () => {
    it('401 ; 403 formateur et apprenant', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/rapports')
        .send({ modele: 'SYNTHESE', format: 'CSV' })
        .expect(401);
      await post({ modele: 'SYNTHESE', format: 'CSV' }, tokens.formateur).expect(403);
      await post({ modele: 'SYNTHESE', format: 'CSV' }, tokens.a).expect(403);
    });

    it('400 : modèle, format, date mal formée, début > fin, > 366 jours, champ inconnu', async () => {
      await post({ modele: 'TOUT', format: 'CSV' }).expect(400);
      await post({ modele: 'SYNTHESE', format: 'DOCX' }).expect(400);
      await post({ modele: 'SYNTHESE', format: 'CSV', du: '01/02/2004' }).expect(400);
      await post({ modele: 'SYNTHESE', format: 'CSV', du: '2004-02-31' }).expect(400);
      const inversee = await post({
        modele: 'SYNTHESE',
        format: 'CSV',
        du: '2004-03-01',
        au: '2004-02-01',
      }).expect(400);
      expect(inversee.body.message).toBe(MESSAGE_PERIODE_INVERSEE);
      await post({ modele: 'SYNTHESE', format: 'CSV', du: '2003-01-01', au: '2004-02-01' }).expect(
        400,
      );
      await post({ modele: 'SYNTHESE', format: 'CSV', formationId: ids.f }).expect(400);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM rapports WHERE demandeur_id = $1`,
        [ids.admin],
      );
      expect(n).toBe(0);
    });
  });

  describe('Génération', () => {
    it('bilan par formation (CSV) : comptes exacts sur février 2004', async () => {
      const res = await post({ modele: 'FORMATIONS', format: 'CSV', ...FEVRIER }).expect(202);
      expect(res.body).toMatchObject({
        type: 'INSTITUTIONNEL',
        statut: 'EN_ATTENTE',
        formation: null,
        parametres: { modele: 'FORMATIONS', ...FEVRIER },
      });
      ids.rFormations = res.body.id;
      const fin = await attendre(ids.rFormations);
      expect(fin.statut).toBe('PRET');
      expect(fin.nomFichier).toBe('rapport-institutionnel-formations-2004-02-01-2004-02-29.csv');
      const [entete, ...lignes] = await csvDe(ids.rFormations);
      expect(entete[0]).toBe('formation');
      const ligne = lignes.find((l) => l[0] === `${MARQUEUR} Back-end`);
      expect(ligne).toEqual([
        `${MARQUEUR} Back-end`,
        'OUVERTE',
        '2', // inscrits (instantané)
        '1', // nouvelles inscriptions sur la période
        '1', // terminées
        '0', // suspendues
        '3', // tentatives notées sur la période (la 4e est le 1er mars à Tunis)
        '66,7', // 2 réussies sur 3
        '70', // (80 + 40 + 90) / 3
        '1', // corrections finalisées
        '72',
        '3', // certificats émis sur la période
        '1', // révoqués sur la période (le 3e l'est en mars)
      ]);
      expect(await traces('RAPPORT_DEMANDE', ids.rFormations)).toBe(1);
      expect(await traces('RAPPORT_GENERE', ids.rFormations)).toBe(1);
    });

    it('registre des certificats (CSV) : émis sur la période, consultations publiques', async () => {
      const res = await post({ modele: 'CERTIFICATS', format: 'CSV', ...FEVRIER }).expect(202);
      ids.rCertificats = res.body.id;
      expect((await attendre(ids.rCertificats)).statut).toBe('PRET');
      const [entete, ...lignes] = await csvDe(ids.rCertificats);
      expect(entete).toEqual([
        'certificat',
        'titulaire',
        'email',
        'formation',
        'score_final',
        'mention',
        'statut',
        'date_emission',
        'consultations_publiques',
      ]);
      expect(lignes).toEqual([
        [
          ids.cA,
          'Amel Institution',
          EMAIL.a,
          `${MARQUEUR} Back-end`,
          '76',
          'Bien',
          'ACTIF',
          '15/02/2004 11:00',
          '3',
        ],
        [
          ids.cB,
          'B Institution',
          EMAIL.b,
          `${MARQUEUR} Back-end`,
          '64',
          'Passable',
          'REVOQUE',
          '20/02/2004 11:00',
          '0',
        ],
        [
          ids.cC,
          'C Institution',
          EMAIL.c,
          `${MARQUEUR} Back-end`,
          '61',
          'Passable',
          'REVOQUE',
          '22/02/2004 11:00',
          '0',
        ],
      ]);
    });

    it('synthèse (PDF) et période sans données : fichiers valides', async () => {
      const synthese = await post({ modele: 'SYNTHESE', format: 'PDF', ...FEVRIER }).expect(202);
      expect((await attendre(synthese.body.id)).statut).toBe('PRET');
      const pdf = await telecharger(synthese.body.id).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const vide = await post({
        modele: 'CERTIFICATS',
        format: 'CSV',
        du: '2001-07-01',
        au: '2001-07-31',
      }).expect(202);
      expect((await attendre(vide.body.id)).statut).toBe('PRET');
      expect(await csvDe(vide.body.id)).toHaveLength(1);
    });
  });

  describe('Isolation et concurrence', () => {
    it('un autre administrateur reçoit 404 ; « Mes rapports » séparés', async () => {
      const r = await get(`/api/rapports/${ids.rFormations}`, tokens.admin2).expect(404);
      expect(r.body.message).toBe(MESSAGE_RAPPORT_INTROUVABLE);
      await telecharger(ids.rFormations, tokens.admin2).expect(404);
      const mes = await get('/api/rapports').expect(200);
      expect((mes.body as Array<{ id: string }>).map((x) => x.id)).toEqual(
        expect.arrayContaining([ids.rFormations, ids.rCertificats]),
      );
      expect((await get('/api/rapports', tokens.admin2).expect(200)).body).toEqual([]);
    });

    it('8 demandes simultanées : 5 × 202, 3 × 429', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () =>
          post({ modele: 'SYNTHESE', format: 'CSV', ...FEVRIER }, tokens.admin2),
        ),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([
        202, 202, 202, 202, 202, 429, 429, 429,
      ]);
      expect(reponses.find((r) => r.status === 429)?.body.message).toBe(MESSAGE_LIMITE_RAPPORTS);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM rapports WHERE demandeur_id = $1`,
        [ids.admin2],
      );
      expect(n).toBe(5);
    });
  });
});
