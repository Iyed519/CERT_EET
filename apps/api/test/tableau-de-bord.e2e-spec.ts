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
  MESSAGE_DATE_INVALIDE,
  MESSAGE_PERIODE_INVERSEE,
  MESSAGE_PERIODE_TROP_LONGUE,
  aujourdhuiInstitution,
} from '../src/modules/pilotage/periode.regles';

/**
 * Tests d'intégration US-DASH-01 — Tableau de bord global (DS-16 P2), sur
 * l'application réelle (PostgreSQL, Redis).
 *
 * Les indicateurs « sur la période » sont globaux : pour des attentes exactes,
 * la suite place ses données en MARS 2003 (aucune autre suite n'y écrit) et
 * interroge cette période. Les instantanés (alertes) sont vérifiés par écart.
 *
 * Couvre :
 *  - accès : 401 sans jeton, 403 formateur et apprenant ;
 *  - entrée : 400 date inexistante, mal formée, période inversée, > 366 jours,
 *    paramètre inconnu ; période par défaut = 30 jours finissant aujourd'hui ;
 *  - période vide : zéros, série quotidienne à zéro, aucune activité ;
 *  - période de mars 2003 : nouveaux comptes, connexions, formations,
 *    inscriptions, tentatives notées (taux, moyenne), livrables, corrections,
 *    certificats émis / révoqués, consultations, série quotidienne, activité
 *    récente (acteur en liste blanche, jamais d'adresse IP) ;
 *  - bornes en jours de Tunis : 23 h 30 UTC la veille compte pour le lendemain ;
 *  - alertes système (certificat bloqué, demande de rôle en attente, livrable
 *    en attente de correction) ;
 *  - concurrence : 8 lectures simultanées -> réponses identiques, aucune trace.
 *
 * Marqueur `E2E-DASH01` (titres) ; emails `e2e-dash01-…`.
 */
describe('Tableau de bord global (e2e) — US-DASH-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-DASH01';
  const EMAIL = {
    admin: 'e2e-dash01-admin@cert-eet.local',
    formateur: 'e2e-dash01-form@cert-eet.local',
    a: 'e2e-dash01-a@cert-eet.local',
    b: 'e2e-dash01-b@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const MARS = '/api/admin/tableau-de-bord?du=2003-03-01&au=2003-03-31';
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

  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];

  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;

  const hex = (c: string): string => c.repeat(64);

  /** Audit avec horodatage imposé (insertion autorisée ; seules UPDATE / DELETE sont bloquées). */
  const audit = (
    action: string,
    horodatage: string,
    userId: string | null,
    cible: string,
    resultat = 'Succès',
  ): Promise<unknown[]> =>
    sql(
      `INSERT INTO audit_logs (user_id, action, cible, adresse_ip, resultat, horodatage)
       VALUES ($1, $2, $3, '203.0.113.9', $4, $5)`,
      [userId, action, cible, resultat, horodatage],
    );

  const nettoyer = async (): Promise<void> => {
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const uids = utilisateurs.map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const certs = (
      await sql<{ id: string }>(
        `SELECT id FROM certificats WHERE apprenant_id = ANY($1) OR formation_id = ANY($2)`,
        [uids, formations],
      )
    ).map((c) => c.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(
        `DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2) OR cible LIKE $3`,
        [uids, [...uids, ...certs, ...formations], `${MARQUEUR}%`],
      );
      await qr.query(`DELETE FROM certificats WHERE id = ANY($1)`, [certs]);
      await qr.query(
        `DELETE FROM corrections WHERE livrable_id IN (SELECT id FROM livrables WHERE apprenant_id = ANY($1))`,
        [uids],
      );
      await qr.query(`DELETE FROM livrables WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM demandes_role WHERE user_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM inscriptions WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(
        `DELETE FROM ateliers WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
        [formations],
      );
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
    // Serveur à l'écoute une fois pour toutes : sans cela, supertest ouvre un port
    // éphémère par requête et 8 requêtes simultanées peuvent se couper (ECONNRESET).
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const profils: Record<keyof typeof EMAIL, [Role, string, string]> = {
      admin: [Role.ADMINISTRATEUR, 'Leïla', 'Pilote'],
      formateur: [Role.FORMATEUR, 'Sami', 'Formateur'],
      a: [Role.APPRENANT, 'Amel', 'Dashun'],
      b: [Role.APPRENANT, 'Bilel', 'Dashun'],
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const [role, prenom, nom] = profils[cle];
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom,
          nom,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }

    // --- Données de mars 2003 (après les connexions, qui écrivent derniere_connexion). ---
    await sql(
      `UPDATE users SET created_at = '2003-03-05T10:00:00Z', derniere_connexion = '2003-03-06T09:00:00Z' WHERE id = $1`,
      [ids.a],
    );
    // 23 h 30 UTC le 31 mars = 0 h 30 le 1er avril à Tunis : hors période.
    await sql(
      `UPDATE users SET created_at = '2003-03-05T11:00:00Z', derniere_connexion = '2003-03-31T23:30:00Z' WHERE id = $1`,
      [ids.b],
    );
    const f1 = await un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification, created_at)
       VALUES ($1, 'OUVERTE', 20, 60, '2003-03-10T08:00:00Z') RETURNING id`,
      [`${MARQUEUR} Pilotage 2003`],
    );
    const f2 = await un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Actuelle`],
    );
    ids.f1 = f1;
    ids.f2 = f2;
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id, date_inscription) VALUES ($1, $2, '2003-03-11T09:00:00Z')`,
      [ids.a, f1],
    );
    // 23 h 30 UTC le 28 février = 0 h 30 le 1er mars à Tunis : dans la période.
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id, date_inscription) VALUES ($1, $2, '2003-02-28T23:30:00Z')`,
      [ids.b, f1],
    );
    const m1 = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [f1],
    );
    const q1 = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
      [m1, `${MARQUEUR} QCM`],
    );
    const tentative = (
      apprenant: string,
      fin: string,
      score: number,
      reussie: boolean,
    ): Promise<unknown[]> =>
      sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin, score, est_reussie, statut)
         VALUES ($1, $2, $3::timestamptz - interval '20 minutes', $3::timestamptz + interval '10 minutes', $3, $4, $5, 'NOTEE')`,
        [apprenant, q1, fin, score, reussie],
      );
    await tentative(ids.a, '2003-03-12T10:00:00Z', 80, true);
    await tentative(ids.b, '2003-03-13T10:00:00Z', 40, false);
    await tentative(ids.a, '2003-04-02T10:00:00Z', 90, true); // hors période
    const at = await un(
      `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables)
       VALUES ($1, $2, 'Énoncé de l’atelier de pilotage (test).', '2003-03-30T23:00:00Z', '{pdf}') RETURNING id`,
      [m1, `${MARQUEUR} Atelier`],
    );
    const la = await un(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'NOTE', '2003-03-14T10:00:00Z', $3) RETURNING id`,
      [at, ids.a, hex('a')],
    );
    await sql(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'SOUMIS', '2003-03-20T10:00:00Z', $3)`,
      [at, ids.b, hex('b')],
    );
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture, score_total, commentaire_general, date_finalisation)
       VALUES ($1, $2, 'TERMINEE', '2003-03-15T08:00:00Z', 75, 'Bon travail.', '2003-03-15T09:00:00Z')`,
      [la, ids.formateur],
    );
    ids.cA = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256)
       VALUES ($1, $2, 'ACTIF', 77.5, 'Bien', 'ESPRIT Entreprise', '2003-03-16T08:00:00Z', '2003-03-16T08:01:00Z', $3, $4)
       RETURNING id`,
      [ids.a, f1, `certificats/${MARQUEUR}-a.pdf`, hex('c')],
    );
    ids.cB = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256,
         date_revocation, motif_revocation, description_revocation, revoque_par)
       VALUES ($1, $2, 'REVOQUE', 62, 'Assez bien', 'ESPRIT Entreprise', '2003-03-17T08:00:00Z', '2003-03-17T08:01:00Z',
         $3, $4, '2003-03-18T08:00:00Z', 'ERREUR_ADMIN', 'Émis par erreur (test).', $5)
       RETURNING id`,
      [ids.b, f1, `certificats/${MARQUEUR}-b.pdf`, hex('d'), ids.admin],
    );
    await audit('LOGIN', '2003-03-06T09:00:00Z', ids.a, ids.a);
    await audit('LOGIN', '2003-03-06T09:05:00Z', null, `${MARQUEUR}-inconnu`, 'Échec');
    for (const h of ['2003-03-16T10:00:00Z', '2003-03-16T11:00:00Z', '2003-03-16T12:00:00Z']) {
      await audit('CERTIFICAT_VERIFIE', h, null, ids.cA);
    }
    await audit('CERTIFICAT_VERIFIE', '2003-03-31T23:30:00Z', null, ids.cA); // 1er avril à Tunis
    // Dernier jour inclus en entier ; 23 h 30 UTC le 6 = le 7 à Tunis (série quotidienne).
    await audit('CERTIFICAT_VERIFIE', '2003-03-31T12:00:00Z', null, ids.cA);
    await audit('CERTIFICAT_VERIFIE', '2003-03-06T23:30:00Z', null, ids.cA);
    // En attente de génération (demande en mars) : pas « émis ».
    await sql(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur, date_emission)
       VALUES ($1, $2, 65, 'Assez bien', 'ESPRIT Entreprise', '2003-03-20T08:00:00Z')`,
      [ids.b, f2],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et entrée', () => {
    it('401 sans jeton ; 403 formateur et apprenant', async () => {
      await request(app.getHttpServer()).get('/api/admin/tableau-de-bord').expect(401);
      await get('/api/admin/tableau-de-bord', tokens.formateur).expect(403);
      await get('/api/admin/tableau-de-bord', tokens.a).expect(403);
    });

    it('400 : date inexistante ou mal formée, période inversée ou trop longue, paramètre inconnu', async () => {
      const cas: Array<[string, string]> = [
        ['du=2003-02-30', MESSAGE_DATE_INVALIDE],
        ['au=2003-3-01', MESSAGE_DATE_INVALIDE],
        ['du=2003-03-31&au=2003-03-01', MESSAGE_PERIODE_INVERSEE],
        ['du=2001-01-01&au=2002-01-02', MESSAGE_PERIODE_TROP_LONGUE],
      ];
      for (const [qs, message] of cas) {
        const res = await get(`/api/admin/tableau-de-bord?${qs}`).expect(400);
        expect([res.body.message].flat()).toContain(message);
      }
      await get('/api/admin/tableau-de-bord?formation=x').expect(400);
      // 366 jours exactement : accepté.
      await get('/api/admin/tableau-de-bord?du=2004-01-01&au=2004-12-31').expect(200);
    });

    it('période par défaut : 30 jours se terminant aujourd’hui (Tunis)', async () => {
      const res = await get('/api/admin/tableau-de-bord').expect(200);
      expect(res.body.periode.jours).toBe(30);
      expect(res.body.periode.au).toBe(aujourdhuiInstitution());
      expect(res.body.activite).toHaveLength(30);
      expect(res.body.utilisateurs.parRole.ADMINISTRATEUR).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Indicateurs', () => {
    it('période vide : zéros sans erreur, série quotidienne à zéro', async () => {
      const res = await get('/api/admin/tableau-de-bord?du=2001-02-01&au=2001-02-28').expect(200);
      const t = res.body;
      expect(t.periode).toEqual({ du: '2001-02-01', au: '2001-02-28', jours: 28 });
      expect(t.utilisateurs.nouveaux).toBe(0);
      expect(t.utilisateurs.connectes).toBe(0);
      expect(t.formations.nouvelles).toBe(0);
      expect(t.inscriptions.nouvelles).toBe(0);
      expect(t.evaluations.qcm).toMatchObject({
        tentativesNotees: 0,
        reussies: 0,
        tauxReussite: 0,
        scoreMoyen: null,
      });
      expect(t.evaluations.ateliers).toMatchObject({
        livrablesSoumis: 0,
        correctionsFinalisees: 0,
        noteMoyenne: null,
      });
      expect(t.certificats).toMatchObject({ emis: 0, revoques: 0, consultations: 0 });
      expect(t.activite).toHaveLength(28);
      expect(t.activite[0]).toEqual({
        jour: '2001-02-01',
        evenements: 0,
        connexions: 0,
        echecs: 0,
      });
      expect(t.activite.every((j: { evenements: number }) => j.evenements === 0)).toBe(true);
      expect(t.activiteRecente).toEqual([]);
    });

    it('mars 2003 : chaque bloc compte exactement les données de la période', async () => {
      const t = (await get(MARS).expect(200)).body;
      expect(t.periode).toEqual({ du: '2003-03-01', au: '2003-03-31', jours: 31 });
      expect(t.utilisateurs.nouveaux).toBe(2);
      expect(t.utilisateurs.connectes).toBe(1); // b : 1er avril à Tunis
      expect(t.formations.nouvelles).toBe(1);
      expect(t.inscriptions.nouvelles).toBe(2); // b : 1er mars à Tunis
      expect(t.evaluations.qcm).toMatchObject({
        tentativesNotees: 2,
        reussies: 1,
        tauxReussite: 50,
        scoreMoyen: 60,
      });
      expect(t.evaluations.ateliers).toMatchObject({
        livrablesSoumis: 2,
        correctionsFinalisees: 1,
        noteMoyenne: 75,
      });
      expect(t.certificats).toMatchObject({ emis: 2, revoques: 1, consultations: 5 });
    });

    it('série quotidienne et activité récente (acteur en liste blanche, sans adresse IP)', async () => {
      const t = (await get(MARS).expect(200)).body;
      expect(t.activite).toHaveLength(31);
      const jour = (j: string): Record<string, unknown> | undefined =>
        t.activite.find((x: { jour: string }) => x.jour === j);
      expect(jour('2003-03-06')).toEqual({
        jour: '2003-03-06',
        evenements: 2,
        connexions: 1,
        echecs: 1,
      });
      expect(jour('2003-03-16')).toMatchObject({ evenements: 3, connexions: 0, echecs: 0 });
      expect(jour('2003-03-07')).toMatchObject({ evenements: 1 });
      expect(jour('2003-03-31')).toMatchObject({ evenements: 1 });
      expect(t.activite.reduce((s: number, j: { evenements: number }) => s + j.evenements, 0)).toBe(
        7,
      );

      expect(t.activiteRecente).toHaveLength(7);
      expect(t.activiteRecente[0]).toMatchObject({
        horodatage: '2003-03-31T12:00:00.000Z',
        action: 'CERTIFICAT_VERIFIE',
        acteur: null,
      });
      const connexion = t.activiteRecente[6];
      expect(connexion).toEqual({
        horodatage: '2003-03-06T09:00:00.000Z',
        action: 'LOGIN',
        resultat: 'Succès',
        acteur: { email: EMAIL.a, prenom: 'Amel', nom: 'Dashun' },
      });
      expect(JSON.stringify(t)).not.toContain('203.0.113.9');
    });

    it('instantanés : répartition par statut cohérente avec les totaux', async () => {
      const t = (await get(MARS).expect(200)).body;
      const somme = (r: Record<string, number>): number =>
        Object.values(r).reduce((a, b) => a + b, 0);
      expect(somme(t.utilisateurs.parRole)).toBe(t.utilisateurs.total);
      expect(somme(t.formations.parStatut)).toBe(t.formations.total);
      expect(somme(t.inscriptions.parStatut)).toBe(t.inscriptions.total);
      expect(Object.keys(t.certificats.parStatut).sort()).toEqual([
        'ACTIF',
        'EN_ATTENTE_GENERATION',
        'EN_GENERATION',
        'REVOQUE',
      ]);
      expect(t.certificats.parStatut.ACTIF).toBeGreaterThanOrEqual(1);
      expect(t.certificats.parStatut.REVOQUE).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Alertes système', () => {
    const nombre = (
      t: { alertes: Array<{ code: string; nombre: number }> },
      code: string,
    ): number => t.alertes.find((a) => a.code === code)?.nombre ?? 0;

    it('livrable en attente de correction depuis plus de 7 jours : signalé', async () => {
      const t = (await get(MARS).expect(200)).body;
      expect(nombre(t, 'LIVRABLES_EN_ATTENTE')).toBeGreaterThanOrEqual(1);
      expect(t.alertes.every((a: { nombre: number }) => a.nombre > 0)).toBe(true);
    });

    it('certificat bloqué et demande de rôle en attente : +1 chacun', async () => {
      const avant = (await get(MARS).expect(200)).body;
      await sql(
        `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur,
           date_emission, nb_tentatives, derniere_erreur)
         VALUES ($1, $2, 70, 'Bien', 'ESPRIT Entreprise', now(), 3, 'S3 en panne')`,
        [ids.a, ids.f2],
      );
      await sql(
        `INSERT INTO demandes_role (user_id, role_demande, justification) VALUES ($1, 'FORMATEUR', 'Test E2E-DASH01')`,
        [ids.b],
      );
      const apres = (await get(MARS).expect(200)).body;
      expect(nombre(apres, 'CERTIFICATS_BLOQUES')).toBe(nombre(avant, 'CERTIFICATS_BLOQUES') + 1);
      expect(nombre(apres, 'DEMANDES_ROLE_EN_ATTENTE')).toBe(
        nombre(avant, 'DEMANDES_ROLE_EN_ATTENTE') + 1,
      );
      expect(apres.certificats.parStatut.EN_ATTENTE_GENERATION).toBe(
        avant.certificats.parStatut.EN_ATTENTE_GENERATION + 1,
      );
    });
  });

  describe('Concurrence et lecture seule', () => {
    it('8 lectures simultanées : réponses identiques ; aucune trace d’audit écrite', async () => {
      const compte = async (): Promise<number> =>
        (
          await sql<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1`, [
            ids.admin,
          ])
        )[0].n;
      const avant = await compte();
      const reponses = await Promise.all(Array.from({ length: 8 }, () => get(MARS)));
      for (const r of reponses) expect(r.status).toBe(200);
      const corps = reponses.map((r) => JSON.stringify({ ...r.body, alertes: undefined }));
      expect(new Set(corps).size).toBe(1);
      expect(await compte()).toBe(avant);
    });
  });
});
