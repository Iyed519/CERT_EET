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

/**
 * Tests d'intégration US-SUIVI-01 — Tableau de bord pédagogique (DS-14 P1),
 * sur l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté + audit
 *    ACCES_RESSOURCE_REFUSE ; formateur affecté et administrateur 200 ;
 *    404 formation inconnue ; 400 identifiant mal formé ;
 *  - isolation : un inscrit d'une autre formation n'apparaît pas ;
 *  - KPIs : inscrits, actifs, inactifs (> 7 jours sans connexion), suspendus,
 *    taux de complétion (suspendus exclus), score moyen QCM (meilleure
 *    tentative notée par QCM publié), note moyenne ateliers, certifiés ;
 *    QCM brouillon ignoré ; histogramme ;
 *  - ligne apprenant : avancement, QCM, ateliers (rendus, notés, en retard,
 *    non rendus échus), moyenne, risque, tri par nom ;
 *  - fiche : tentatives (toutes, plus récente d'abord, sans bonne réponse),
 *    livrables, certificat, chronologie ; 404 apprenant non inscrit ;
 *  - concurrence : 8 lectures simultanées identiques, aucune trace écrite.
 *
 * Marqueur `E2E-SUIVI01` (titres) ; emails `e2e-suivi01-…`.
 */
describe('Suivi pédagogique (e2e) — US-SUIVI-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-SUIVI01';
  const EMAIL = {
    admin: 'e2e-suivi01-admin@cert-eet.local',
    formateur: 'e2e-suivi01-form@cert-eet.local',
    autre: 'e2e-suivi01-autre@cert-eet.local',
    a: 'e2e-suivi01-a@cert-eet.local',
    b: 'e2e-suivi01-b@cert-eet.local',
    c: 'e2e-suivi01-c@cert-eet.local',
    d: 'e2e-suivi01-d@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const INCONNU = '77777777-7777-4777-8777-777777777777';
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

  const suiviUrl = (): string => `/api/formateur/formations/${ids.f}/suivi`;

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations],
      ]);
      await qr.query(`DELETE FROM certificats WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(
        `DELETE FROM corrections WHERE livrable_id IN (SELECT id FROM livrables WHERE apprenant_id = ANY($1))`,
        [uids],
      );
      await qr.query(`DELETE FROM livrables WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
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
    // Serveur à l'écoute une fois pour toutes (requêtes simultanées, cf. US-DASH-01).
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const profils: Record<keyof typeof EMAIL, [Role, string, string]> = {
      admin: [Role.ADMINISTRATEUR, 'Leïla', 'Admin'],
      formateur: [Role.FORMATEUR, 'Sami', 'Affecté'],
      autre: [Role.FORMATEUR, 'Nour', 'Ailleurs'],
      a: [Role.APPRENANT, 'Amel', 'Abidi'],
      b: [Role.APPRENANT, 'Bilel', 'Ben Ammar'],
      c: [Role.APPRENANT, 'Chiraz', 'Chaabane'],
      d: [Role.APPRENANT, 'Dali', 'Dridi'],
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
    // Connexions après les logins de test (qui écrivent derniere_connexion).
    await sql(`UPDATE users SET derniere_connexion = now() - interval '1 day' WHERE id = $1`, [
      ids.a,
    ]);
    await sql(`UPDATE users SET derniere_connexion = now() - interval '10 days' WHERE id = $1`, [
      ids.b,
    ]);
    await sql(`UPDATE users SET derniere_connexion = NULL WHERE id = $1`, [ids.c]);

    const nouvelleFormation = (titre: string): Promise<string> =>
      un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`],
      );
    ids.f = await nouvelleFormation('Back-end');
    ids.g = await nouvelleFormation('Autre');
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      ids.f,
      ids.formateur,
    ]);
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      ids.g,
      ids.autre,
    ]);
    const inscrire = (apprenant: string, formation: string, statut: string): Promise<unknown[]> =>
      sql(
        `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription)
         VALUES ($1, $2, $3, now() - interval '30 days')`,
        [apprenant, formation, statut],
      );
    await inscrire(ids.a, ids.f, 'EN_COURS');
    await inscrire(ids.b, ids.f, 'EN_COURS');
    await inscrire(ids.c, ids.f, 'SUSPENDUE');
    await inscrire(ids.d, ids.g, 'EN_COURS');

    const m1 = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    const qcm = (titre: string, statut: string): Promise<string> =>
      un(`INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, $3) RETURNING id`, [
        m1,
        `${MARQUEUR} ${titre}`,
        statut,
      ]);
    ids.q1 = await qcm('QCM 1', 'PUBLIE');
    ids.q2 = await qcm('QCM 2', 'PUBLIE');
    ids.qb = await qcm('Brouillon', 'BROUILLON');
    const tentative = (
      apprenant: string,
      q: string,
      joursAvant: number,
      statut: string,
      score: number | null,
      reussie: boolean | null,
    ): Promise<unknown[]> =>
      sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin,
           duree_effective, score, est_reussie, statut)
         VALUES ($1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '30 minutes',
           CASE WHEN $4 = 'NOTEE' THEN now() - make_interval(days => $3) + interval '12 minutes' END,
           CASE WHEN $4 = 'NOTEE' THEN 720 END, $5, $6, $4::tentatives_qcm_statut_enum)`,
        [apprenant, q, joursAvant, statut, score, reussie],
      );
    await tentative(ids.a, ids.q1, 6, 'NOTEE', 50, false);
    await tentative(ids.a, ids.q1, 5, 'NOTEE', 80, true);
    await tentative(ids.a, ids.q2, 4, 'NOTEE', 40, false);
    await tentative(ids.a, ids.qb, 2, 'NOTEE', 100, true); // QCM brouillon : ignoré
    await tentative(ids.b, ids.q1, 12, 'SOUMISE', null, null);

    const atelier = (titre: string, limite: string): Promise<string> =>
      un(
        `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
         VALUES ($1, $2, 'Énoncé de l’atelier de suivi (test).', now() + $3::interval, '{pdf}', 'PUBLIE')
         RETURNING id`,
        [m1, `${MARQUEUR} ${titre}`, limite],
      );
    ids.at1 = await atelier('Atelier échu', '-3 days');
    ids.at2 = await atelier('Atelier ouvert', '5 days');
    const la = await un(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, en_retard, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'NOTE', now() - interval '3 days', true, $3) RETURNING id`,
      [ids.at1, ids.a, 'a'.repeat(64)],
    );
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture, score_total,
         commentaire_general, date_finalisation)
       VALUES ($1, $2, 'TERMINEE', now() - interval '2 days', 90, 'Très bien.', now() - interval '2 days')`,
      [la, ids.formateur],
    );
    await sql(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'SOUMIS', now() - interval '1 day', $3)`,
      [ids.at2, ids.b, 'b'.repeat(64)],
    );
    await sql(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256)
       VALUES ($1, $2, 'ACTIF', 70, 'Bien', 'ESPRIT Entreprise', now() - interval '1 day', now() - interval '1 day', $3, $4)`,
      [ids.a, ids.f, `certificats/${MARQUEUR}-a.pdf`, 'c'.repeat(64)],
    );
    // Certificat demandé mais pas encore généré : pas « certifié ».
    await sql(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur, date_emission)
       VALUES ($1, $2, 61, 'Assez bien', 'ESPRIT Entreprise', now())`,
      [ids.b, ids.f],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès', () => {
    it('401 sans jeton ; 403 apprenant', async () => {
      await request(app.getHttpServer()).get(suiviUrl()).expect(401);
      await get(suiviUrl(), tokens.a).expect(403);
      await get(`/api/formateur/formations/${ids.f}/apprenants/${ids.a}`, tokens.a).expect(403);
    });

    it('403 formateur non affecté, tracé ACCES_RESSOURCE_REFUSE (suivi et fiche)', async () => {
      await get(suiviUrl(), tokens.autre).expect(403);
      await get(`/api/formateur/formations/${ids.f}/apprenants/${ids.a}`, tokens.autre).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1 AND cible = $2`,
        [ids.autre, ids.f],
      );
      expect(n).toBe(2);
    });

    it('formateur affecté et administrateur : 200 ; 404 inconnue ; 400 mal formé', async () => {
      await get(suiviUrl()).expect(200);
      await get(suiviUrl(), tokens.admin).expect(200);
      await get(`/api/formateur/formations/${INCONNU}/suivi`, tokens.admin).expect(404);
      await get('/api/formateur/formations/pas-un-uuid/suivi').expect(400);
      await get(`/api/formateur/formations/${ids.f}/apprenants/pas-un-uuid`).expect(400);
    });
  });

  describe('Tableau', () => {
    it('KPIs ; QCM brouillon ignoré ; isolation des autres formations', async () => {
      const s = (await get(suiviUrl()).expect(200)).body;
      expect(s.formation).toEqual({ id: ids.f, titre: `${MARQUEUR} Back-end`, statut: 'OUVERTE' });
      expect(s.kpis).toEqual({
        inscrits: 3,
        actifs: 1,
        inactifs: 1,
        termines: 0,
        suspendus: 1,
        tauxCompletion: 25,
        scoreMoyenQcm: 60,
        noteMoyenneAteliers: 90,
        certifies: 1,
        alertesOuvertes: 0,
        qcmPublies: 2,
        ateliersPublies: 2,
      });
      expect(s.apprenants.map((a: { email: string }) => a.email)).toEqual([
        EMAIL.a,
        EMAIL.b,
        EMAIL.c,
      ]);
      expect(JSON.stringify(s)).not.toContain(EMAIL.d);
      expect(s.histogramme).toHaveLength(10);
      expect(s.histogramme[7]).toEqual({ tranche: '70–79', min: 70, max: 79, effectif: 1 });
      expect(s.histogramme.reduce((t: number, h: { effectif: number }) => t + h.effectif, 0)).toBe(
        1,
      );
    });

    it('lignes : avancement, QCM, ateliers, moyenne, risque', async () => {
      const s = (await get(suiviUrl()).expect(200)).body;
      const [a, b, c] = s.apprenants;
      expect(a).toMatchObject({
        id: ids.a,
        prenom: 'Amel',
        nom: 'Abidi',
        statutInscription: 'EN_COURS',
        avancement: 50,
        qcm: { reussis: 1, passes: 2, total: 2, scoreMoyen: 60 },
        ateliers: { rendus: 1, notes: 1, total: 2, noteMoyenne: 90, enRetard: 1, nonRendus: 0 },
        moyenne: 70,
        certificat: 'ACTIF',
        risque: { inactif: false, joursSansConnexion: 1 },
      });
      expect(new Date(a.derniereActivite).getTime()).toBeGreaterThan(Date.now() - 3.5 * 86_400_000);
      expect(b).toMatchObject({
        avancement: 0,
        qcm: { reussis: 0, passes: 0, scoreMoyen: null },
        ateliers: { rendus: 1, notes: 0, nonRendus: 1 },
        moyenne: null,
        certificat: 'EN_ATTENTE_GENERATION',
        risque: { inactif: true, joursSansConnexion: 10 },
      });
      expect(c).toMatchObject({
        statutInscription: 'SUSPENDUE',
        derniereActivite: null,
        risque: { inactif: false, joursSansConnexion: 30 },
      });
    });
  });

  describe('Fiche apprenant', () => {
    it('tentatives (sans bonne réponse), livrables, certificat, chronologie', async () => {
      const f = (await get(`/api/formateur/formations/${ids.f}/apprenants/${ids.a}`).expect(200))
        .body;
      expect(f.apprenant).toMatchObject({ id: ids.a, avancement: 50, moyenne: 70 });
      expect(f.tentatives).toHaveLength(4);
      expect(f.tentatives[0]).toMatchObject({
        qcmId: ids.qb,
        score: 100,
        reussie: true,
        statut: 'NOTEE',
        dureeEffective: 720,
      });
      expect(f.tentatives.map((t: { score: number }) => t.score)).toEqual([100, 40, 80, 50]);
      expect(f.livrables).toEqual([
        expect.objectContaining({
          atelierId: ids.at1,
          version: 1,
          enRetard: true,
          statut: 'NOTE',
          note: 90,
        }),
      ]);
      expect(f.certificat).toMatchObject({ statut: 'ACTIF', scoreFinal: 70 });
      expect(f.chronologie[f.chronologie.length - 1]).toMatchObject({ type: 'INSCRIPTION' });
      const dates = f.chronologie.map((e: { date: string }) => new Date(e.date).getTime());
      expect([...dates].sort((x, y) => y - x)).toEqual(dates);
      const texte = JSON.stringify(f);
      for (const interdit of ['estCorrecte', 'est_correcte', 'optionIds', 'motDePasse']) {
        expect(texte).not.toContain(interdit);
      }
    });

    it('404 apprenant non inscrit à cette formation (inscrit ailleurs ou inconnu)', async () => {
      const res = await get(`/api/formateur/formations/${ids.f}/apprenants/${ids.d}`).expect(404);
      expect(res.body.message).toBe('Apprenant non inscrit à cette formation.');
      await get(`/api/formateur/formations/${ids.f}/apprenants/${INCONNU}`).expect(404);
    });

    it('administrateur : fiche accessible', async () => {
      await get(`/api/formateur/formations/${ids.f}/apprenants/${ids.b}`, tokens.admin).expect(200);
    });
  });

  describe('Concurrence et lecture seule', () => {
    it('8 lectures simultanées : réponses identiques ; aucune trace écrite', async () => {
      const compte = async (): Promise<number> =>
        (
          await sql<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1`, [
            ids.formateur,
          ])
        )[0].n;
      const avant = await compte();
      const reponses = await Promise.all(Array.from({ length: 8 }, () => get(suiviUrl())));
      for (const r of reponses) expect(r.status).toBe(200);
      expect(new Set(reponses.map((r) => JSON.stringify(r.body))).size).toBe(1);
      expect(await compte()).toBe(avant);
    });
  });
});
