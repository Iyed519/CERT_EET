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
 * E2E-DASH03 — US-DASH-03 : tableau de bord global du formateur.
 *
 * Deux formateurs, trois formations (une co-animée). Vérifie : accès
 * (401, 403 apprenant et administrateur), périmètre limité aux affectations,
 * chiffres exacts (instantanés et période), tri du tableau, période (400,
 * période sans données), nombre de requêtes SQL constant (pas de N+1),
 * requêtes simultanées identiques, et le compteur « demandes de rôle en
 * attente » du tableau de bord administrateur.
 */
describe('E2E-DASH03 — Tableau de bord du formateur (US-DASH-03)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;

  const MARQUEUR = 'E2E-DASH03';
  const MOT_DE_PASSE = 'Dash03Passe123';
  const EMAIL = {
    admin: 'e2e-dash03-admin@cert-eet.local',
    f1: 'e2e-dash03-f1@cert-eet.local',
    f2: 'e2e-dash03-f2@cert-eet.local',
    a: 'e2e-dash03-a@cert-eet.local',
    b: 'e2e-dash03-b@cert-eet.local',
    c: 'e2e-dash03-c@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const sql = async <T = Record<string, unknown>>(texte: string, params: unknown[] = []): Promise<T[]> =>
    (await dataSource.query(texte, params)) as T[];
  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;
  const get = (url: string, token = tokens.f1): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

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
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM alertes_decrochage WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM certificats WHERE formation_id = ANY($1)`, [formations]);
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
      await qr.query(`DELETE FROM demandes_role WHERE user_id = ANY($1)`, [uids]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    await sql(`DELETE FROM refresh_tokens WHERE user_id = ANY($1)`, [uids]);
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

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 4);
    const roles: Record<string, Role> = {
      admin: Role.ADMINISTRATEUR,
      f1: Role.FORMATEUR,
      f2: Role.FORMATEUR,
      a: Role.APPRENANT,
      b: Role.APPRENANT,
      c: Role.APPRENANT,
    };
    for (const [cle, email] of Object.entries(EMAIL)) {
      const u = await userRepository.save(
        userRepository.create({ email, role: roles[cle], motDePasseHash, statut: StatutCompte.ACTIF, prenom: cle, nom: 'Dash03' }),
      );
      ids[cle] = u.id;
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: MOT_DE_PASSE })
        .expect(200);
      tokens[cle] = res.body.accessToken as string;
    }

    const formation = (titre: string, statut: string): Promise<string> =>
      un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, $2, 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`, statut],
      );
    ids.fa = await formation('B — Back-end', 'OUVERTE'); // f1 et f2
    ids.fb = await formation('A — Archivée', 'ARCHIVEE'); // f1
    ids.fc = await formation('C — Ailleurs', 'OUVERTE'); // f2 seulement
    const affecter = (f: string, formateur: string): Promise<unknown> =>
      sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [f, formateur]);
    await affecter(ids.fa, ids.f1);
    await affecter(ids.fa, ids.f2);
    await affecter(ids.fb, ids.f1);
    await affecter(ids.fc, ids.f2);

    const inscrire = (a: string, f: string, statut: string, joursAvant: number): Promise<unknown> =>
      sql(
        `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription)
         VALUES ($1, $2, $3, now() - make_interval(days => $4))`,
        [a, f, statut, joursAvant],
      );
    await inscrire(ids.a, ids.fa, 'EN_COURS', 3);
    await inscrire(ids.b, ids.fa, 'SUSPENDUE', 60);
    await inscrire(ids.c, ids.fa, 'TERMINEE', 90);
    await inscrire(ids.a, ids.fb, 'TERMINEE', 200);
    await inscrire(ids.b, ids.fc, 'EN_COURS', 1);

    const module = (f: string): Promise<string> =>
      un(`INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module', 1) RETURNING id`, [f]);
    const ma = await module(ids.fa);
    const mc = await module(ids.fc);
    const qcm = (m: string, statut: string): Promise<string> =>
      un(`INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, $3) RETURNING id`, [m, `${MARQUEUR} QCM`, statut]);
    const qa = await qcm(ma, 'PUBLIE');
    const qbrouillon = await qcm(ma, 'BROUILLON');
    const qc = await qcm(mc, 'PUBLIE');
    const tentative = (
      a: string,
      q: string,
      joursAvant: number,
      statut: string,
      score: number | null,
      reussie: boolean | null,
    ): Promise<unknown> =>
      sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin, duree_effective, score, est_reussie, statut)
         VALUES ($1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '30 minutes',
                 CASE WHEN $4 = 'NOTEE' THEN now() - make_interval(days => $3) + interval '10 minutes' END,
                 CASE WHEN $4 = 'NOTEE' THEN 600 END, $5, $6, $4::tentatives_qcm_statut_enum)`,
        [a, q, joursAvant, statut, score, reussie],
      );
    await tentative(ids.a, qa, 2, 'NOTEE', 90, true);
    await tentative(ids.b, qa, 5, 'NOTEE', 40, false);
    await tentative(ids.c, qa, 6, 'NOTEE', 80, true);
    await tentative(ids.c, qa, 100, 'NOTEE', 10, false); // hors période par défaut
    await tentative(ids.a, qa, 1, 'SOUMISE', null, null); // à évaluer
    await tentative(ids.b, qa, 1, 'ABANDONNEE_TIMER', null, null); // à évaluer
    await tentative(ids.a, qbrouillon, 1, 'NOTEE', 100, true); // QCM brouillon : ignorée
    await tentative(ids.b, qc, 1, 'NOTEE', 100, true); // formation d'un autre

    const atelier = (m: string): Promise<string> =>
      un(
        `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
         VALUES ($1, $2, 'Énoncé de test du tableau de bord.', now() + interval '5 days', '{pdf}', 'PUBLIE') RETURNING id`,
        [m, `${MARQUEUR} Atelier`],
      );
    const ata = await atelier(ma);
    const atc = await atelier(mc);
    const livrable = (at: string, a: string, statut: string, h: string): Promise<unknown> =>
      sql(
        `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
         VALUES (uuid_generate_v4(), $1, $2, $3, now() - interval '1 day', $4)`,
        [at, a, statut, h.repeat(64)],
      );
    await livrable(ata, ids.a, 'SOUMIS', 'a');
    await livrable(ata, ids.b, 'EN_CORRECTION', 'b');
    await livrable(ata, ids.c, 'NOTE', 'c');
    await livrable(atc, ids.b, 'SOUMIS', 'd');

    const alerte = (f: string, a: string, statut: string): Promise<unknown> =>
      sql(
        `INSERT INTO alertes_decrochage (formation_id, apprenant_id, critere, statut, donnees, suggestion, date_traitement)
         VALUES ($1, $2, 'INACTIVITE', $3::alertes_decrochage_statut_enum, '{}'::jsonb, 'Relancer l’apprenant.',
                 CASE WHEN $3::text = 'TRAITEE' THEN now() END)`,
        [f, a, statut],
      );
    await alerte(ids.fa, ids.a, 'OUVERTE');
    await alerte(ids.fa, ids.b, 'TRAITEE');
    await alerte(ids.fc, ids.b, 'OUVERTE');

    const certificat = (a: string, f: string, statut: string, joursAvant: number, h: string): Promise<unknown> =>
      sql(
        `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
           date_emission, date_generation, cle_stockage, empreinte_sha256)
         VALUES ($1, $2, $3, 80, 'Bien', 'ESPRIT Entreprise', now() - make_interval(days => $4),
                 now() - make_interval(days => $4), $5, $6)`,
        [a, f, statut, joursAvant, `certificats/${MARQUEUR}-${h}.pdf`, h.repeat(64)],
      );
    await certificat(ids.c, ids.fa, 'ACTIF', 2, 'e');
    await certificat(ids.a, ids.fb, 'EXPIRE', 200, 'f'); // hors période par défaut
    await certificat(ids.b, ids.fc, 'ACTIF', 1, '1'); // formation d'un autre
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  it('accès : 401 sans jeton ; 403 apprenant et administrateur', async () => {
    await request(app.getHttpServer()).get('/api/formateur/tableau-de-bord').expect(401);
    await get('/api/formateur/tableau-de-bord', tokens.a).expect(403);
    await get('/api/formateur/tableau-de-bord', tokens.admin).expect(403);
  });

  it('formateur 1 : ses deux formations seulement, chiffres exacts sur la période par défaut', async () => {
    const res = await get('/api/formateur/tableau-de-bord').expect(200);
    const t = res.body;
    expect(t.periode.jours).toBe(30);
    expect(t.formations).toEqual({ parStatut: { OUVERTE: 1, FERMEE: 0, ARCHIVEE: 1 }, total: 2 });
    expect(t.apprenants).toEqual({ inscrits: 4, actifs: 1, nouveaux: 1 });
    expect(t.qcm).toEqual({ tentativesNotees: 3, reussies: 2, tauxReussite: 66.7, scoreMoyen: 70, aEvaluer: 2 });
    expect(t.ateliers).toEqual({ livrablesAEvaluer: 2 });
    expect(t.alertesOuvertes).toBe(1);
    expect(t.certificatsDelivres).toBe(1);
    // Tableau : OUVERTE avant ARCHIVEE, puis par titre.
    expect(t.mesFormations.map((f: { id: string }) => f.id)).toEqual([ids.fa, ids.fb]);
    expect(t.mesFormations[0]).toEqual({
      id: ids.fa,
      titre: `${MARQUEUR} B — Back-end`,
      statut: 'OUVERTE',
      inscrits: 3,
      actifs: 1,
      tentativesNotees: 3,
      tauxReussite: 66.7,
      scoreMoyen: 70,
      tentativesAEvaluer: 2,
      livrablesAEvaluer: 2,
      alertesOuvertes: 1,
      certificatsDelivres: 1,
    });
    expect(t.mesFormations[1]).toMatchObject({ id: ids.fb, inscrits: 1, actifs: 0, tentativesNotees: 0, scoreMoyen: null, certificatsDelivres: 0 });
    // Activité : un point par jour ; 3 tentatives notées et 2 livrables (fa) sur la période.
    expect(t.activite).toHaveLength(30);
    const total = (cle: 'tentatives' | 'livrables'): number =>
      t.activite.reduce((s: number, j: Record<string, number>) => s + j[cle], 0);
    expect(total('tentatives')).toBe(3);
    expect(total('livrables')).toBe(3);
  });

  it('formateur 2 : la formation co-animée et la sienne, jamais celles du formateur 1 seul', async () => {
    const t = (await get('/api/formateur/tableau-de-bord', tokens.f2).expect(200)).body;
    expect(t.mesFormations.map((f: { id: string }) => f.id).sort()).toEqual([ids.fa, ids.fc].sort());
    expect(t.formations.total).toBe(2);
    expect(t.alertesOuvertes).toBe(2);
    expect(t.ateliers.livrablesAEvaluer).toBe(3);
    expect(t.certificatsDelivres).toBe(2);
  });

  it('période : un an inclut les données anciennes ; période inversée, trop longue ou date fausse -> 400', async () => {
    const t = (await get('/api/formateur/tableau-de-bord?du=2000-01-01&au=2000-12-31').expect(200)).body;
    expect(t.qcm.tentativesNotees).toBe(0);
    expect(t.qcm.scoreMoyen).toBeNull();
    expect(t.apprenants.inscrits).toBe(4); // instantané, indépendant de la période
    const debut = new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10);
    const large = (await get(`/api/formateur/tableau-de-bord?du=${debut}`).expect(200)).body;
    expect(large.qcm.tentativesNotees).toBe(4);
    expect(large.certificatsDelivres).toBe(2);
    await get('/api/formateur/tableau-de-bord?du=2026-10-31&au=2026-10-01').expect(400);
    await get('/api/formateur/tableau-de-bord?du=2024-01-01&au=2026-01-01').expect(400);
    await get('/api/formateur/tableau-de-bord?du=2026-02-30').expect(400);
    await get('/api/formateur/tableau-de-bord?du=hier').expect(400);
  });

  it('formateur sans formation : zéros, aucune erreur', async () => {
    await sql(`DELETE FROM formation_formateurs WHERE formateur_id = $1`, [ids.f2]);
    try {
      const t = (await get('/api/formateur/tableau-de-bord', tokens.f2).expect(200)).body;
      expect(t.formations.total).toBe(0);
      expect(t.mesFormations).toEqual([]);
      expect(t.qcm.scoreMoyen).toBeNull();
    } finally {
      await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2), ($3, $2)`, [ids.fa, ids.f2, ids.fc]);
    }
  });

  it('pas de N+1 : deux requêtes SQL, quel que soit le nombre de formations', async () => {
    const espion = jest.spyOn(dataSource, 'query');
    try {
      await get('/api/formateur/tableau-de-bord').expect(200);
      const avant = espion.mock.calls.filter(([s]) => String(s).includes('formation_formateurs WHERE formateur_id')).length;
      expect(avant).toBe(2);
      const extra = await un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification) VALUES ($1, 'FERMEE', 10, 60) RETURNING id`,
        [`${MARQUEUR} D — En plus`],
      );
      await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [extra, ids.f1]);
      espion.mockClear();
      const t = (await get('/api/formateur/tableau-de-bord').expect(200)).body;
      expect(t.formations.parStatut.FERMEE).toBe(1);
      const apres = espion.mock.calls.filter(([s]) => String(s).includes('formation_formateurs WHERE formateur_id')).length;
      expect(apres).toBe(2);
      await sql(`DELETE FROM formation_formateurs WHERE formation_id = $1`, [extra]);
      await sql(`DELETE FROM formations WHERE id = $1`, [extra]);
    } finally {
      espion.mockRestore();
    }
  });

  it('concurrence : 10 lectures simultanées donnent le même résultat', async () => {
    const reponses = await Promise.all(Array.from({ length: 10 }, () => get('/api/formateur/tableau-de-bord')));
    expect(reponses.every((r) => r.status === 200)).toBe(true);
    const corps = new Set(reponses.map((r) => JSON.stringify(r.body)));
    expect(corps.size).toBe(1);
  });

  it('administrateur : compteur permanent des demandes de rôle en attente', async () => {
    const avant = (await get('/api/admin/tableau-de-bord', tokens.admin).expect(200)).body;
    expect(typeof avant.demandesEnAttente.role).toBe('number');
    await sql(
      `INSERT INTO demandes_role (user_id, role_demande, justification, statut) VALUES ($1, 'FORMATEUR', $2, 'EN_ATTENTE')`,
      [ids.a, 'Justification de test du tableau de bord.'],
    );
    const apres = (await get('/api/admin/tableau-de-bord', tokens.admin).expect(200)).body;
    expect(apres.demandesEnAttente.role).toBe(avant.demandesEnAttente.role + 1);
  });
});
