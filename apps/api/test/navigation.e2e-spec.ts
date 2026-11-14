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
 * E2E-UX02 — US-UX-02 : compteurs du menu latéral et pages d'ensemble du formateur.
 *
 * Deux formateurs, deux formations (une chacun). Vérifie : accès (401,
 * 403 apprenant ; 403 administrateur sur les évaluations du formateur),
 * périmètre limité aux affectations, chiffres exacts (livrables, tentatives,
 * alertes de décrochage et de surveillance), concordance avec le tableau de
 * bord du formateur et le compteur de surveillance existants, compteurs de
 * l'administrateur (écart avant / après l'ajout de demandes), lecture seule
 * (aucune trace d'audit) et requêtes simultanées identiques.
 */
describe('E2E-UX02 — Compteurs de la navigation latérale (US-UX-02)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;

  const MARQUEUR = 'E2E-UX02';
  const MOT_DE_PASSE = 'Ux02Passe1234';
  const EMAIL = {
    admin: 'e2e-ux02-admin@cert-eet.local',
    f1: 'e2e-ux02-f1@cert-eet.local',
    f2: 'e2e-ux02-f2@cert-eet.local',
    a: 'e2e-ux02-a@cert-eet.local',
    b: 'e2e-ux02-b@cert-eet.local',
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
      await qr.query(
        `DELETE FROM evenements_surveillance WHERE tentative_id IN (SELECT id FROM tentatives_qcm WHERE apprenant_id = ANY($1))`,
        [uids],
      );
      await qr.query(`DELETE FROM alertes_decrochage WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM livrables WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM demandes_affectation WHERE formateur_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM propositions_formation WHERE formateur_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM demandes_role WHERE user_id = ANY($1)`, [uids]);
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
    };
    for (const [cle, email] of Object.entries(EMAIL)) {
      const u = await userRepository.save(
        userRepository.create({ email, role: roles[cle], motDePasseHash, statut: StatutCompte.ACTIF, prenom: cle, nom: 'Ux02' }),
      );
      ids[cle] = u.id;
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: MOT_DE_PASSE })
        .expect(200);
      tokens[cle] = res.body.accessToken as string;
    }

    const formation = (titre: string): Promise<string> =>
      un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`],
      );
    ids.fa = await formation('A — à moi');
    ids.fb = await formation('B — à l’autre');
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2), ($3, $4)`, [
      ids.fa,
      ids.f1,
      ids.fb,
      ids.f2,
    ]);
    for (const f of [ids.fa, ids.fb]) {
      for (const a of [ids.a, ids.b]) {
        await sql(`INSERT INTO inscriptions (apprenant_id, formation_id, statut) VALUES ($1, $2, 'EN_COURS')`, [a, f]);
      }
    }
    const module = (f: string): Promise<string> =>
      un(`INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`, [f]);
    const ma = await module(ids.fa);
    const mb = await module(ids.fb);
    const qcm = (m: string, titre: string, statut: string): Promise<string> =>
      un(`INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, $3) RETURNING id`, [m, `${MARQUEUR} ${titre}`, statut]);
    ids.qa = await qcm(ma, 'QCM publié', 'PUBLIE');
    ids.qbrouillon = await qcm(ma, 'QCM brouillon', 'BROUILLON');
    ids.qb = await qcm(mb, 'QCM ailleurs', 'PUBLIE');
    const tentative = (a: string, q: string, statut: string): Promise<string> =>
      un(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, statut)
         VALUES ($1, $2, now() - interval '1 hour', now() + interval '1 hour', $3::tentatives_qcm_statut_enum) RETURNING id`,
        [a, q, statut],
      );
    ids.ta1 = await tentative(ids.a, ids.qa, 'SOUMISE'); // à évaluer
    ids.ta2 = await tentative(ids.b, ids.qa, 'ABANDONNEE_TIMER'); // à évaluer
    await tentative(ids.a, ids.qbrouillon, 'SOUMISE'); // QCM brouillon : ignorée
    ids.tb = await tentative(ids.a, ids.qb, 'SOUMISE'); // formation de l'autre
    const evenement = (t: string, statut: string): Promise<unknown> =>
      sql(
        `INSERT INTO evenements_surveillance (id, tentative_id, type, cle_stockage, taille_octets, type_contenu, statut)
         VALUES (uuid_generate_v4(), $1, 'TELEPHONE', $2, 10, 'image/jpeg', $3)`,
        [t, `surveillance/${MARQUEUR}-${Math.random().toString(36).slice(2)}.jpg`, statut],
      );
    await evenement(ids.ta1, 'NOUVEAU');
    await evenement(ids.ta1, 'NOUVEAU');
    await evenement(ids.ta2, 'EXAMINE');
    await evenement(ids.tb, 'NOUVEAU');

    const atelier = (m: string, titre: string): Promise<string> =>
      un(
        `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
         VALUES ($1, $2, 'Énoncé de test de la navigation.', now() + interval '5 days', '{pdf}', 'PUBLIE') RETURNING id`,
        [m, `${MARQUEUR} ${titre}`],
      );
    ids.ata = await atelier(ma, 'Atelier à moi');
    ids.atb = await atelier(mb, 'Atelier ailleurs');
    const livrable = (at: string, a: string, statut: string, h: string): Promise<unknown> =>
      sql(
        `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
         VALUES (uuid_generate_v4(), $1, $2, $3, now() - interval '1 day', $4)`,
        [at, a, statut, h.repeat(64)],
      );
    await livrable(ids.ata, ids.a, 'SOUMIS', '1');
    await livrable(ids.ata, ids.b, 'EN_CORRECTION', '2');
    await livrable(ids.atb, ids.a, 'SOUMIS', '3');
    await livrable(ids.atb, ids.b, 'NOTE', '4');

    const alerte = (f: string, a: string, statut: string): Promise<unknown> =>
      sql(
        `INSERT INTO alertes_decrochage (formation_id, apprenant_id, critere, statut, donnees, suggestion, date_traitement)
         VALUES ($1, $2, 'INACTIVITE', $3::alertes_decrochage_statut_enum, '{}'::jsonb, 'Relancer l’apprenant.',
                 CASE WHEN $3::text = 'TRAITEE' THEN now() END)`,
        [f, a, statut],
      );
    await alerte(ids.fa, ids.a, 'OUVERTE');
    await alerte(ids.fa, ids.b, 'TRAITEE');
    await alerte(ids.fb, ids.a, 'OUVERTE');
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  it('accès : 401 sans jeton ; 403 apprenant ; évaluations réservées au formateur', async () => {
    await request(app.getHttpServer()).get('/api/navigation/compteurs').expect(401);
    await get('/api/navigation/compteurs', tokens.a).expect(403);
    await request(app.getHttpServer()).get('/api/formateur/evaluations').expect(401);
    await get('/api/formateur/evaluations', tokens.a).expect(403);
    await get('/api/formateur/evaluations', tokens.admin).expect(403);
  });

  it('formateur 1 : compteurs de ses seules formations, brouillon et éléments examinés exclus', async () => {
    const res = await get('/api/navigation/compteurs').expect(200);
    expect(res.body).toEqual({
      role: 'FORMATEUR',
      alertes: 3,
      alertesDecrochage: 1,
      alertesSurveillance: 2,
      livrablesACorriger: 2,
      tentativesAEvaluer: 2,
    });
  });

  it('formateur 2 : son propre périmètre', async () => {
    const res = await get('/api/navigation/compteurs', tokens.f2).expect(200);
    expect(res.body).toEqual({
      role: 'FORMATEUR',
      alertes: 2,
      alertesDecrochage: 1,
      alertesSurveillance: 1,
      livrablesACorriger: 1,
      tentativesAEvaluer: 1,
    });
  });

  it('concorde avec le tableau de bord du formateur et le compteur de surveillance existants', async () => {
    const compteurs = (await get('/api/navigation/compteurs').expect(200)).body;
    const tdb = (await get('/api/formateur/tableau-de-bord').expect(200)).body;
    const surveillance = (await get('/api/surveillance/alertes/a-examiner').expect(200)).body;
    expect(compteurs.livrablesACorriger).toBe(tdb.ateliers.livrablesAEvaluer);
    expect(compteurs.tentativesAEvaluer).toBe(tdb.qcm.aEvaluer);
    expect(compteurs.alertesDecrochage).toBe(tdb.alertesOuvertes);
    expect(compteurs.alertesSurveillance).toBe(surveillance.nombre);
  });

  it('évaluations du formateur 1 : ses ateliers et QCM, comptes par objet', async () => {
    const res = await get('/api/formateur/evaluations').expect(200);
    expect(res.body.ateliers).toEqual([
      {
        id: ids.ata,
        titre: `${MARQUEUR} Atelier à moi`,
        statut: 'PUBLIE',
        moduleTitre: 'Module 1',
        formationId: ids.fa,
        formationTitre: `${MARQUEUR} A — à moi`,
        aCorriger: 1,
        enCorrection: 1,
        notes: 0,
      },
    ]);
    const parId = Object.fromEntries(
      (res.body.qcm as Array<{ id: string }>).map((q) => [q.id, q]),
    ) as Record<string, Record<string, unknown>>;
    expect(Object.keys(parId).sort()).toEqual([ids.qa, ids.qbrouillon].sort());
    expect(parId[ids.qa]).toMatchObject({ statut: 'PUBLIE', tentatives: 2, aEvaluer: 2, alertesAExaminer: 2, formationId: ids.fa });
    expect(parId[ids.qbrouillon]).toMatchObject({ statut: 'BROUILLON', tentatives: 1, aEvaluer: 1, alertesAExaminer: 0 });
  });

  it('administrateur : demandes en attente comptées (écart avant / après)', async () => {
    const avant = (await get('/api/navigation/compteurs', tokens.admin).expect(200)).body;
    expect(avant.role).toBe('ADMINISTRATEUR');
    await sql(
      `INSERT INTO demandes_role (user_id, role_demande, justification) VALUES ($1, 'FORMATEUR', 'Test de la navigation.')`,
      [ids.a],
    );
    await sql(
      `INSERT INTO demandes_affectation (formation_id, formateur_id, motif) VALUES ($1, $2, 'Test de la navigation.'), ($3, $2, 'Test de la navigation.')`,
      [ids.fb, ids.f1, ids.fa],
    );
    // Une proposition refusée ne compte pas.
    await sql(
      `INSERT INTO propositions_formation (formateur_id, titre, capacite_max, motif, statut, commentaire_admin)
       VALUES ($1, $2, 10, 'Test de la navigation.', 'REFUSEE', 'Refusée pour le test.')`,
      [ids.f1, `${MARQUEUR} Refusée`],
    );
    await sql(
      `INSERT INTO propositions_formation (formateur_id, titre, capacite_max, motif, statut)
       VALUES ($1, $2, 10, 'Test de la navigation.', 'EN_ATTENTE')`,
      [ids.f1, `${MARQUEUR} Proposition`],
    );
    const apres = (await get('/api/navigation/compteurs', tokens.admin).expect(200)).body;
    expect(apres).toEqual({
      role: 'ADMINISTRATEUR',
      demandesRole: avant.demandesRole + 1,
      demandesAffectation: avant.demandesAffectation + 2,
      propositions: avant.propositions + 1,
    });
    const tdb = (await get('/api/admin/tableau-de-bord', tokens.admin).expect(200)).body;
    expect(tdb.demandesEnAttente).toEqual({
      role: apres.demandesRole,
      affectation: apres.demandesAffectation,
      propositions: apres.propositions,
    });
  });

  it('lecture seule : aucune trace d’audit ; requêtes simultanées identiques', async () => {
    const [{ n: avant }] = await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1`,
      [ids.f1],
    );
    const reponses = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        get(i % 2 ? '/api/navigation/compteurs' : '/api/formateur/evaluations').expect(200),
      ),
    );
    const corps = reponses.map((r) => JSON.stringify(r.body));
    expect(new Set(corps.filter((_, i) => i % 2)).size).toBe(1);
    expect(new Set(corps.filter((_, i) => !(i % 2))).size).toBe(1);
    const [{ n: apres }] = await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1`,
      [ids.f1],
    );
    expect(apres).toBe(avant);
  });
});
