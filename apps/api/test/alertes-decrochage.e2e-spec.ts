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
import { MailService } from '../src/mail/mail.service';
import { AlertesDecrochageService } from '../src/modules/pilotage/alertes-decrochage.service';

/**
 * Tests d'intégration US-SUIVI-02 — Alertes de décrochage (DS-14 P2), sur
 * l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - balayage : une alerte par critère vérifié (inactivité > 7 jours, deux
 *    échecs de QCM consécutifs, note en chute, atelier non rendu 48 h après
 *    la date limite), avec les faits et la suggestion ; AUCUNE alerte pour
 *    l'apprenant sans critère, l'inscription suspendue, la formation archivée ;
 *    audit ALERTE_DECROCHAGE_CREEE ; un email récapitulatif par formateur ;
 *  - idempotence : un second balayage ne crée rien ;
 *  - concurrence : 4 balayages simultanés -> chaque alerte une seule fois ;
 *  - répit : pas de nouvelle alerte d'un critère traité il y a moins de 7 j ;
 *  - routes : liste et compteur (formateur : ses formations seulement ;
 *    administrateur : toutes), filtres, 400 / 401 / 403 ; balayage à la
 *    demande (administrateur, tracé) ;
 *  - suivi (US-SUIVI-01) : critères ouverts par apprenant, compteur, fiche.
 *
 * Marqueur `E2E-SUIVI02` (titres) ; emails `e2e-suivi02-…`.
 */
describe('Alertes de décrochage (e2e) — US-SUIVI-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;
  let alertes: AlertesDecrochageService;
  let mail: jest.SpyInstance;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-SUIVI02';
  const EMAIL = {
    admin: 'e2e-suivi02-admin@cert-eet.local',
    formateur: 'e2e-suivi02-form@cert-eet.local',
    autre: 'e2e-suivi02-autre@cert-eet.local',
    a: 'e2e-suivi02-a@cert-eet.local',
    b: 'e2e-suivi02-b@cert-eet.local',
    c: 'e2e-suivi02-c@cert-eet.local',
    d: 'e2e-suivi02-d@cert-eet.local',
    e: 'e2e-suivi02-e@cert-eet.local',
    s: 'e2e-suivi02-s@cert-eet.local',
    z: 'e2e-suivi02-z@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const get = (url: string, token = tokens.formateur): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];

  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;

  type Ligne = {
    id: string;
    apprenant_id: string;
    critere: string;
    statut: string;
    donnees: Record<string, unknown>;
  };
  /** Alertes des formations de la suite (F et H), triées par apprenant puis critère. */
  const nosAlertes = async (): Promise<Ligne[]> =>
    sql<Ligne>(
      `SELECT a.id, a.apprenant_id, a.critere::text AS critere, a.statut::text AS statut, a.donnees
         FROM alertes_decrochage a JOIN users u ON u.id = a.apprenant_id
        WHERE a.formation_id = ANY($1)
        ORDER BY u.email, a.critere, a.date_creation`,
      [[ids.f, ids.h]],
    );

  const purgerAlertes = async (): Promise<void> => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const lignes = (await qr.query(
        `SELECT id FROM alertes_decrochage WHERE formation_id = ANY($1)`,
        [[ids.f, ids.h].filter(Boolean)],
      )) as Array<{ id: string }>;
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE cible = ANY($1)`, [lignes.map((l) => l.id)]);
      await qr.query(`DELETE FROM alertes_decrochage WHERE formation_id = ANY($1)`, [
        [ids.f, ids.h].filter(Boolean),
      ]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  };

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const alertesIds = (
      await sql<{ id: string }>(
        `SELECT id FROM alertes_decrochage WHERE formation_id = ANY($1) OR apprenant_id = ANY($2)`,
        [formations, uids],
      )
    ).map((a) => a.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...alertesIds],
      ]);
      await qr.query(`DELETE FROM alertes_decrochage WHERE id = ANY($1)`, [alertesIds]);
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
    alertes = moduleRef.get(AlertesDecrochageService);
    mail = jest.spyOn(moduleRef.get(MailService), 'sendAlertesDecrochageEmail').mockResolvedValue();

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<string, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle] ?? Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Suivideux',
        }),
      );
      ids[cle] = u.id;
      if (['admin', 'formateur', 'autre', 'a'].includes(cle)) tokens[cle] = await login(EMAIL[cle]);
    }
    // Connexions (après les logins de test) : récentes sauf b, s et z (9 jours).
    await sql(
      `UPDATE users SET derniere_connexion = now() - interval '1 day' WHERE email = ANY($1)`,
      [[EMAIL.a, EMAIL.c, EMAIL.d, EMAIL.e]],
    );
    await sql(
      `UPDATE users SET derniere_connexion = now() - interval '9 days' WHERE email = ANY($1)`,
      [[EMAIL.b, EMAIL.s, EMAIL.z]],
    );

    const formation = (titre: string, statut: string): Promise<string> =>
      un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, $2, 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`, statut],
      );
    ids.f = await formation('Back-end', 'OUVERTE');
    ids.g = await formation('Autre', 'OUVERTE');
    ids.h = await formation('Archivée', 'ARCHIVEE');
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2), ($3, $4)`,
      [ids.f, ids.formateur, ids.g, ids.autre],
    );
    for (const [cle, statut] of [
      ['a', 'EN_COURS'],
      ['b', 'EN_COURS'],
      ['c', 'EN_COURS'],
      ['d', 'EN_COURS'],
      ['e', 'EN_COURS'],
      ['s', 'SUSPENDUE'],
    ]) {
      await sql(
        `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription)
         VALUES ($1, $2, $3, now() - interval '30 days')`,
        [ids[cle], ids.f, statut],
      );
    }
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id, date_inscription)
       VALUES ($1, $2, now() - interval '30 days')`,
      [ids.z, ids.h],
    );

    const m = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module', 1) RETURNING id`,
      [ids.f],
    );
    const q1 = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, 'QCM 1', 'PUBLIE') RETURNING id`,
      [m],
    );
    const q2 = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, 'QCM 2', 'PUBLIE') RETURNING id`,
      [m],
    );
    const tentative = (
      cle: string,
      q: string,
      jours: number,
      score: number,
      reussie: boolean,
    ): Promise<unknown[]> =>
      sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin, score, est_reussie, statut)
         VALUES ($1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '30 minutes',
                 now() - make_interval(days => $3) + interval '10 minutes', $4, $5, 'NOTEE')`,
        [ids[cle], q, jours, score, reussie],
      );
    await tentative('a', q1, 6, 30, false);
    await tentative('a', q2, 5, 25, false);
    await tentative('c', q1, 8, 80, true);
    await tentative('c', q2, 2, 60, true);
    await tentative('e', q1, 6, 90, true);
    ids.at1 = await un(
      `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
       VALUES ($1, $2, 'Énoncé de l’atelier des alertes (test).', now() - interval '3 days', '{pdf}', 'PUBLIE')
       RETURNING id`,
      [m, `${MARQUEUR} Atelier`],
    );
    for (const cle of ['a', 'b', 'c', 'e', 's']) {
      ids[`l_${cle}`] = await un(
        `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
         VALUES (uuid_generate_v4(), $1, $2, 'SOUMIS', now() - interval '4 days', $3) RETURNING id`,
        [
          ids.at1,
          ids[cle],
          cle
            .repeat(64)
            .slice(0, 64)
            .replace(/[^a-f]/g, 'a'),
        ],
      );
    }
    // e : deux échecs à un QCM BROUILLON (non publié) : ignorés.
    const qb = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, 'Brouillon', 'BROUILLON') RETURNING id`,
      [m],
    );
    await tentative('e', qb, 3, 10, false);
    await tentative('e', qb, 2, 5, false);
    // c : second atelier (date limite à venir) en cours de correction : une
    // correction EN_COURS n'est pas une note.
    const at2 = await un(
      `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
       VALUES ($1, $2, 'Énoncé du second atelier des alertes (test).', now() + interval '5 days', '{pdf}', 'PUBLIE')
       RETURNING id`,
      [m, `${MARQUEUR} Atelier 2`],
    );
    const lc2 = await un(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'EN_CORRECTION', now() - interval '1 day', $3) RETURNING id`,
      [at2, ids.c, 'c'.repeat(64)],
    );
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture)
       VALUES ($1, $2, 'EN_COURS', now() - interval '1 hour')`,
      [lc2, ids.formateur],
    );
    // c : atelier corrigé 85 il y a 5 jours (notes c : 80, 85, puis 60 -> chute).
    await sql(`UPDATE livrables SET statut = 'NOTE' WHERE id = $1`, [ids.l_c]);
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture, score_total,
         commentaire_general, date_finalisation)
       VALUES ($1, $2, 'TERMINEE', now() - interval '5 days', 85, 'Bien.', now() - interval '5 days')`,
      [ids.l_c, ids.formateur],
    );
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  const ATTENDUES = (): Array<[string, string]> => [
    [ids.a, 'ECHECS_QCM'],
    [ids.b, 'INACTIVITE'],
    [ids.c, 'SCORE_EN_CHUTE'],
    [ids.d, 'LIVRABLE_EN_RETARD'],
  ];

  describe('Balayage', () => {
    it('une alerte par critère vérifié, aucune sans critère ; faits, audit, email', async () => {
      mail.mockClear();
      await alertes.balayer();
      const lignes = await nosAlertes();
      expect(lignes.map((l) => [l.apprenant_id, l.critere])).toEqual(ATTENDUES());
      expect(lignes.every((l) => l.statut === 'OUVERTE')).toBe(true);
      const par = (id: string): Ligne => lignes.find((l) => l.apprenant_id === id) as Ligne;
      expect((par(ids.a).donnees.tentatives as unknown[]).length).toBe(2);
      expect(par(ids.b).donnees).toMatchObject({ joursSansConnexion: 9 });
      expect(par(ids.c).donnees).toMatchObject({
        moyennePrecedentes: 82.5,
        ecart: 22.5,
        nbNotes: 3,
      });
      expect(par(ids.d).donnees.ateliers).toEqual([
        expect.objectContaining({ id: ids.at1, titre: `${MARQUEUR} Atelier` }),
      ]);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ALERTE_DECROCHAGE_CREEE' AND cible = ANY($1)`,
        [lignes.map((l) => l.id)],
      );
      expect(n).toBe(4);
      const appel = mail.mock.calls.find(([to]) => to === EMAIL.formateur);
      expect(appel?.[1].alertes).toHaveLength(4);
      expect(mail.mock.calls.some(([to]) => to === EMAIL.autre)).toBe(false);
    });

    it('idempotent : un second balayage ne crée rien', async () => {
      const avant = await nosAlertes();
      await alertes.balayer();
      expect(await nosAlertes()).toEqual(avant);
    });

    it('concurrence : 4 balayages simultanés -> chaque alerte une seule fois', async () => {
      await purgerAlertes();
      await Promise.all(Array.from({ length: 4 }, () => alertes.balayer()));
      const lignes = await nosAlertes();
      expect(lignes.map((l) => [l.apprenant_id, l.critere])).toEqual(ATTENDUES());
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ALERTE_DECROCHAGE_CREEE' AND cible = ANY($1)`,
        [lignes.map((l) => l.id)],
      );
      expect(n).toBe(4);
    });

    it('répit : critère traité il y a moins de 7 jours -> pas de nouvelle alerte ; au-delà -> oui', async () => {
      const b = (await nosAlertes()).find((l) => l.apprenant_id === ids.b) as Ligne;
      await sql(
        `UPDATE alertes_decrochage SET statut = 'TRAITEE', date_traitement = now() - interval '2 days' WHERE id = $1`,
        [b.id],
      );
      await alertes.balayer();
      let deB = (await nosAlertes()).filter((l) => l.apprenant_id === ids.b);
      expect(deB.map((l) => l.statut)).toEqual(['TRAITEE']);
      await sql(
        `UPDATE alertes_decrochage SET date_traitement = now() - interval '8 days' WHERE id = $1`,
        [b.id],
      );
      await alertes.balayer();
      deB = (await nosAlertes()).filter((l) => l.apprenant_id === ids.b);
      expect(deB.map((l) => l.statut).sort()).toEqual(['OUVERTE', 'TRAITEE']);
    });
  });

  describe('Routes', () => {
    it('401 ; 403 apprenant (liste, compteur, balayage) ; 403 formateur sur le balayage', async () => {
      await request(app.getHttpServer()).get('/api/formateur/alertes').expect(401);
      await get('/api/formateur/alertes', tokens.a).expect(403);
      await get('/api/formateur/alertes/compteur', tokens.a).expect(403);
      await request(app.getHttpServer())
        .post('/api/admin/alertes/balayer')
        .set('Authorization', `Bearer ${tokens.formateur}`)
        .expect(403);
    });

    it('formateur : ses formations seulement ; filtres ; 400', async () => {
      const res = await get(`/api/formateur/alertes?formationId=${ids.f}&statut=OUVERTE`).expect(
        200,
      );
      expect(res.body.map((a: { apprenant: { id: string } }) => a.apprenant.id).sort()).toEqual(
        [ids.a, ids.b, ids.c, ids.d].sort(),
      );
      expect(res.body[0]).toEqual(
        expect.objectContaining({
          formation: { id: ids.f, titre: `${MARQUEUR} Back-end` },
          statut: 'OUVERTE',
          suggestion: expect.any(String),
        }),
      );
      const traitees = await get(
        `/api/formateur/alertes?formationId=${ids.f}&statut=TRAITEE`,
      ).expect(200);
      expect(traitees.body).toHaveLength(1);
      const autre = await get(`/api/formateur/alertes?formationId=${ids.f}`, tokens.autre).expect(
        200,
      );
      expect(autre.body).toEqual([]);
      await get('/api/formateur/alertes?statut=FERMEE').expect(400);
      await get('/api/formateur/alertes?formationId=x').expect(400);
    });

    it('compteur : formateur (ses formations), administrateur (au moins autant)', async () => {
      const f = (await get('/api/formateur/alertes/compteur').expect(200)).body;
      expect(f).toEqual({ ouvertes: 4 });
      expect((await get('/api/formateur/alertes/compteur', tokens.autre).expect(200)).body).toEqual(
        {
          ouvertes: 0,
        },
      );
      const a = (await get('/api/formateur/alertes/compteur', tokens.admin).expect(200)).body;
      expect(a.ouvertes).toBeGreaterThanOrEqual(4);
      const liste = await get(`/api/formateur/alertes?formationId=${ids.f}`, tokens.admin).expect(
        200,
      );
      expect(liste.body).toHaveLength(5);
    });

    it('balayage à la demande (administrateur) : idempotent, tracé', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/alertes/balayer')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(res.body).toEqual({ creees: expect.any(Number) });
      expect((await nosAlertes()).length).toBe(5);
      const trace = async (): Promise<number> =>
        (
          await sql<{ n: number }>(
            `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ALERTES_BALAYAGE_DECLENCHE' AND user_id = $1`,
            [ids.admin],
          )
        )[0].n;
      for (let i = 0; i < 20 && (await trace()) === 0; i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(await trace()).toBe(1);
    });
  });

  describe('Suivi pédagogique (US-SUIVI-01)', () => {
    it('critères ouverts par apprenant, compteur, fiche', async () => {
      const s = (await get(`/api/formateur/formations/${ids.f}/suivi`).expect(200)).body;
      const de = (id: string): string[] =>
        s.apprenants.find((a: { id: string }) => a.id === id).alertes as string[];
      expect(de(ids.a)).toEqual(['ECHECS_QCM']);
      expect(de(ids.b)).toEqual(['INACTIVITE']);
      expect(de(ids.e)).toEqual([]);
      expect(s.kpis.alertesOuvertes).toBe(4);
      const fiche = (
        await get(`/api/formateur/formations/${ids.f}/apprenants/${ids.b}`).expect(200)
      ).body;
      expect(fiche.alertes.map((a: { statut: string }) => a.statut)).toEqual([
        'OUVERTE',
        'TRAITEE',
      ]);
      expect(fiche.apprenant.alertes).toEqual(['INACTIVITE']);
    });
  });
});
