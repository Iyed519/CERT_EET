import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { NiveauRisque } from '../src/database/enums/niveau-risque.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { MailService } from '../src/mail/mail.service';
import { AlertesDecrochageService } from '../src/modules/pilotage/alertes-decrochage.service';
import { ClientMlService } from '../src/modules/prediction-risque/client-ml.service';
import { PredictionRisqueService } from '../src/modules/prediction-risque/prediction-risque.service';
import { Variables } from '../src/modules/prediction-risque/risque.variables';

/**
 * Tests d'intégration — IA : prédiction des apprenants à risque, sur
 * l'application réelle (PostgreSQL, Redis). Le service ml est SIMULÉ (espion
 * sur ClientMlService.predire), ou réellement injoignable (adresse fermée).
 *
 * Couvre :
 *  - calcul : variables calculées depuis les vraies tables (connexions,
 *    renouvellements de session, ateliers et livrables, QCM et corrections,
 *    inscription, début de formation) ; inscriptions exclues (suspendue,
 *    formation pas commencée) ; scores enregistrés ; purge des scores anciens ;
 *  - repli silencieux : service ml injoignable -> aucune erreur, aucun score,
 *    « prédiction indisponible », et les alertes des règles sont toujours
 *    créées ;
 *  - lecture : niveau, raisons, rappel, alertes ouvertes à côté ; score trop
 *    ancien ignoré ; résumé par formation (formateur : ses formations ;
 *    administrateur : toutes) ;
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté + audit
 *    ACCES_RESSOURCE_REFUSE ; administrateur 200 ; 404 ; 400.
 *
 * Marqueur `E2E-RISQUE` (titres) ; emails `e2e-risque-…`.
 */
describe('Prédiction du risque (e2e) — IA', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;
  let prediction: PredictionRisqueService;
  let client: ClientMlService;
  let alertes: AlertesDecrochageService;
  const urlMlInitiale = process.env.ML_URL;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-RISQUE';
  const EMAIL = {
    admin: 'e2e-risque-admin@cert-eet.local',
    formateur: 'e2e-risque-form@cert-eet.local',
    autre: 'e2e-risque-autre@cert-eet.local',
    a: 'e2e-risque-a@cert-eet.local',
    b: 'e2e-risque-b@cert-eet.local',
    s: 'e2e-risque-s@cert-eet.local',
    n: 'e2e-risque-n@cert-eet.local',
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

  const risqueUrl = (f = ids.f): string => `/api/formateur/formations/${f}/risque`;

  /** Simule le service ml : élevé sans activité, moyen avec au moins un non-rendu, sinon faible. */
  const simulerMl = (): jest.SpyInstance =>
    jest.spyOn(client, 'predire').mockImplementation(async (lot) => ({
      versionModele: 'risque_v1',
      predictions: lot.map(({ identifiant, variables }) => {
        const niveau =
          variables.jours_actifs === 0
            ? NiveauRisque.ELEVE
            : variables.nb_non_rendues > 0
              ? NiveauRisque.MOYEN
              : NiveauRisque.FAIBLE;
        return {
          identifiant,
          probabilite: niveau === NiveauRisque.ELEVE ? 0.9 : niveau === NiveauRisque.MOYEN ? 0.45 : 0.1,
          niveau,
          raisons:
            niveau === NiveauRisque.FAIBLE
              ? []
              : ['Aucune activité depuis 30 jours', 'Aucun travail échu n’a été rendu'],
        };
      }),
    }));

  const scoresDe = (formationId: string): Promise<Array<{ inscription_id: string; niveau: string }>> =>
    sql(
      `SELECT s.inscription_id, s.niveau FROM scores_risque s
         JOIN inscriptions i ON i.id = s.inscription_id WHERE i.formation_id = $1`,
      [formationId],
    );

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
      // Les scores partent avec les inscriptions (ON DELETE CASCADE).
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
    // Adresse fermée : le vrai client échoue tout de suite (connexion refusée).
    process.env.ML_URL = 'http://127.0.0.1:9';
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
    prediction = moduleRef.get(PredictionRisqueService);
    client = moduleRef.get(ClientMlService);
    alertes = moduleRef.get(AlertesDecrochageService);
    jest.spyOn(moduleRef.get(MailService), 'sendAlertesDecrochageEmail').mockResolvedValue();

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
          nom: 'Risque',
        }),
      );
      ids[cle] = u.id;
      if (['admin', 'formateur', 'autre', 'a'].includes(cle)) tokens[cle] = await login(EMAIL[cle]);
    }
    // b : aucune connexion depuis 9 jours (règle INACTIVITE) ; a : connecté hier.
    await sql(`UPDATE users SET derniere_connexion = now() - interval '1 day' WHERE id = $1`, [ids.a]);
    await sql(`UPDATE users SET derniere_connexion = now() - interval '9 days' WHERE id = ANY($1)`, [
      [ids.b, ids.s, ids.n],
    ]);

    // F : commencée il y a 30 jours ; G : autre formateur ; N : commence dans 10 jours.
    const formation = (titre: string, debut: string): Promise<string> =>
      un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification, date_debut)
         VALUES ($1, 'OUVERTE', 20, 60, (now() AT TIME ZONE 'UTC')::date + $2::int) RETURNING id`,
        [`${MARQUEUR} ${titre}`, debut],
      );
    ids.f = await formation('Back-end', '-30');
    ids.g = await formation('Autre', '-20');
    ids.nf = await formation('Pas commencée', '10');
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2), ($3, $4)`,
      [ids.f, ids.formateur, ids.g, ids.autre],
    );
    const inscrire = (apprenant: string, f: string, statut = 'EN_COURS', jours = 35): Promise<string> =>
      un(
        `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription)
         VALUES ($1, $2, $3, now() - make_interval(days => $4)) RETURNING id`,
        [apprenant, f, statut, jours],
      );
    ids.ia = await inscrire(ids.a, ids.f);
    ids.ib = await inscrire(ids.b, ids.f);
    ids.is = await inscrire(ids.s, ids.f, 'SUSPENDUE');
    ids.in = await inscrire(ids.n, ids.nf);
    ids.ig = await inscrire(ids.b, ids.g);

    // a : connexions il y a 2, 3 et 20 jours (deux le même jour), session renouvelée il y a 5 jours.
    for (const jours of [2, 2, 3, 20]) {
      await sql(
        `INSERT INTO audit_logs (user_id, action, resultat, horodatage)
         VALUES ($1, 'LOGIN', 'Succès', now() - make_interval(days => $2))`,
        [ids.a, jours],
      );
    }
    await sql(
      `INSERT INTO refresh_tokens (user_id, famille_id, token_hash, date_expiration, created_at, active)
       VALUES ($1, gen_random_uuid(), 'e2e-risque-hash', now() + interval '1 day', now() - interval '5 days', false)`,
      [ids.a],
    );

    // Atelier échu il y a 10 jours (a l'a rendu avec 2 jours de retard, corrigé 35/100),
    // atelier à échéance future (non compté), QCM noté 80 (QCM : note, pas une remise).
    const m = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module', 1) RETURNING id`,
      [ids.f],
    );
    const atelier = (titre: string, jours: number): Promise<string> =>
      un(
        `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
         VALUES ($1, $2, 'Énoncé de l’atelier de prédiction (test).', now() + make_interval(days => $3), '{pdf}', 'PUBLIE')
         RETURNING id`,
        [m, `${MARQUEUR} ${titre}`, jours],
      );
    const at1 = await atelier('Atelier 1', -10);
    await atelier('Atelier futur', 12);
    const livrable = await un(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, created_at, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'NOTE', now() - interval '8 days', now() - interval '8 days', $3)
       RETURNING id`,
      [at1, ids.a, 'a'.repeat(64)],
    );
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture, score_total,
         commentaire_general, date_finalisation)
       VALUES ($1, $2, 'TERMINEE', now() - interval '6 days', 35, 'À reprendre.', now() - interval '6 days')`,
      [livrable, ids.formateur],
    );
    const q = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, 'QCM', 'PUBLIE') RETURNING id`,
      [m],
    );
    await sql(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin, score, est_reussie, statut)
       VALUES ($1, $2, now() - interval '15 days', now() - interval '15 days' + interval '30 minutes',
               now() - interval '15 days' + interval '10 minutes', 80, true, 'NOTEE')`,
      [ids.a, q],
    );
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    process.env.ML_URL = urlMlInitiale;
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('repli silencieux (service ml injoignable)', () => {
    it('aucune erreur, aucun score, et les règles d’alerte fonctionnent toujours', async () => {
      const bilan = await prediction.calculer();
      expect(bilan.serviceDisponible).toBe(false);
      expect(bilan.enregistres).toBe(0);
      expect(await scoresDe(ids.f)).toHaveLength(0);

      // Règles : b inactif depuis 9 jours -> alerte INACTIVITE, comme avant.
      await alertes.balayer();
      const ouvertes = await sql<{ critere: string }>(
        `SELECT critere::text AS critere FROM alertes_decrochage
          WHERE formation_id = $1 AND apprenant_id = $2 AND statut = 'OUVERTE'`,
        [ids.f, ids.b],
      );
      expect(ouvertes.map((o) => o.critere)).toContain('INACTIVITE');
    });

    it('lecture : prédiction indisponible, alertes des règles visibles', async () => {
      const res = await get(risqueUrl()).expect(200);
      expect(res.body.disponible).toBe(false);
      expect(res.body.rappel).toBe('Suggestion du modèle, à valider par le formateur');
      const b = res.body.apprenants.find((l: { apprenant: { id: string } }) => l.apprenant.id === ids.b);
      expect(b.risque).toBeNull();
      expect(b.alertesOuvertes).toContain('INACTIVITE');
    });
  });

  describe('calcul (service ml simulé)', () => {
    let espion: jest.SpyInstance;
    beforeAll(() => {
      espion = simulerMl();
    });
    afterAll(() => espion.mockRestore());

    it('calcule les 16 variables depuis les tables Cert_EET', async () => {
      const bilan = await prediction.calculer();
      expect(bilan.serviceDisponible).toBe(true);
      const envoyes = espion.mock.calls.flatMap(
        (c) => c[0] as Array<{ identifiant: string; variables: Variables }>,
      );
      const parId = new Map(envoyes.map((e) => [e.identifiant, e.variables]));
      // Exclues : inscription suspendue, formation pas encore commencée.
      expect(parId.has(ids.is)).toBe(false);
      expect(parId.has(ids.in)).toBe(false);
      expect(parId.has(ids.ia) && parId.has(ids.ib) && parId.has(ids.ig)).toBe(true);

      const a = parId.get(ids.ia) as Variables;
      expect(a).toEqual({
        jours_actifs: 4, // 20, 5 (session renouvelée), 3 et 2 jours avant : la connexion du test (aujourd'hui) est exclue
        taux_jours_actifs: 4 / 30,
        jours_depuis_derniere_activite: 2,
        jours_actifs_14_derniers: 3,
        delai_inscription: -5,
        nb_evaluations_echues: 1, // l'atelier à échéance future ne compte pas
        taux_remise: 1,
        nb_non_rendues: 0,
        nb_remises_en_retard: 1,
        nb_notes: 2, // QCM 80 puis atelier 35
        score_moyen: 57.5,
        nb_echecs: 1,
        echecs_consecutifs_fin: 1,
        tendance_score: -45,
        a_au_moins_une_note: 1,
        coupure: 30,
      });
      const b = parId.get(ids.ib) as Variables;
      expect(b).toMatchObject({
        jours_actifs: 0,
        jours_depuis_derniere_activite: 30,
        nb_evaluations_echues: 1,
        taux_remise: 0,
        nb_non_rendues: 1,
        nb_notes: 0,
        score_moyen: null,
        tendance_score: null,
        a_au_moins_une_note: 0,
      });
    });

    it('enregistre un score par inscription, avec les variables et la version du modèle', async () => {
      const lignes = await sql<{
        inscription_id: string;
        niveau: string;
        probabilite: string;
        raisons: string[];
        variables: Record<string, unknown>;
        version_modele: string;
      }>(
        `SELECT DISTINCT ON (inscription_id) inscription_id, niveau, probabilite, raisons, variables, version_modele
           FROM scores_risque WHERE inscription_id = ANY($1) ORDER BY inscription_id, date_calcul DESC`,
        [[ids.ia, ids.ib]],
      );
      const b = lignes.find((l) => l.inscription_id === ids.ib);
      expect(b?.niveau).toBe('ELEVE');
      expect(Number(b?.probabilite)).toBeCloseTo(0.9);
      expect(b?.raisons).toHaveLength(2);
      expect(b?.variables.coupure).toBe(30);
      expect(b?.version_modele).toBe('risque_v1');
      expect(lignes.find((l) => l.inscription_id === ids.ia)?.niveau).toBe('FAIBLE');
    });

    it('purge les scores de plus de 180 jours', async () => {
      await sql(
        `INSERT INTO scores_risque (inscription_id, date_calcul, probabilite, niveau, version_modele)
         VALUES ($1, now() - interval '200 days', 0.5, 'MOYEN', 'ancien')`,
        [ids.ia],
      );
      await prediction.calculer();
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM scores_risque WHERE inscription_id = $1 AND version_modele = 'ancien'`,
        [ids.ia],
      );
      expect(n).toBe(0);
    });

    it('lecture formateur : niveau, raisons, rappel, alertes à côté ; plus risqués d’abord', async () => {
      const res = await get(risqueUrl()).expect(200);
      expect(res.body.formation).toEqual({ id: ids.f, titre: `${MARQUEUR} Back-end` });
      expect(res.body.disponible).toBe(true);
      expect(res.body.versionModele).toBe('risque_v1');
      expect(res.body.rappel).toBe('Suggestion du modèle, à valider par le formateur');
      const lignes = res.body.apprenants as Array<{
        apprenant: { id: string };
        risque: { niveau: string; raisons: string[] } | null;
        alertesOuvertes: string[];
      }>;
      // Seulement les inscriptions en cours ; la probabilité n'est jamais exposée.
      expect(lignes.map((l) => l.apprenant.id)).toEqual([ids.b, ids.a]);
      expect(lignes[0].risque?.niveau).toBe('ELEVE');
      expect(lignes[0].risque?.raisons).toEqual([
        'Aucune activité depuis 30 jours',
        'Aucun travail échu n’a été rendu',
      ]);
      expect(lignes[0].alertesOuvertes).toContain('INACTIVITE');
      expect(JSON.stringify(res.body)).not.toContain('probabilite');
    });

    it('un score trop ancien n’est pas montré (prédiction indisponible)', async () => {
      await sql(`UPDATE scores_risque SET date_calcul = now() - interval '10 days' WHERE inscription_id = $1`, [
        ids.ig,
      ]);
      const res = await get(risqueUrl(ids.g), tokens.admin).expect(200);
      expect(res.body.disponible).toBe(false);
      expect(res.body.apprenants[0].risque).toBeNull();
    });

    it('résumé : formateur limité à ses formations, administrateur : toutes', async () => {
      const f = await get('/api/formateur/risque/formations').expect(200);
      const ligne = (corps: Array<{ formation: { id: string } }>, id: string): unknown =>
        corps.find((l) => l.formation.id === id);
      expect(ligne(f.body, ids.f)).toMatchObject({
        inscrits: 2,
        eleve: 1,
        moyen: 0,
        faible: 1,
        sansPrediction: 0,
        disponible: true,
      });
      expect(ligne(f.body, ids.g)).toBeUndefined();
      const adm = await get('/api/formateur/risque/formations', tokens.admin).expect(200);
      expect(ligne(adm.body, ids.f)).toBeDefined();
      expect(ligne(adm.body, ids.g)).toMatchObject({ inscrits: 1, sansPrediction: 1, disponible: false });
    });
  });

  describe('accès', () => {
    it('401 sans jeton', async () => {
      await request(app.getHttpServer()).get(risqueUrl()).expect(401);
      await request(app.getHttpServer()).get('/api/formateur/risque/formations').expect(401);
    });

    it('403 apprenant (jamais visible par un apprenant)', async () => {
      await get(risqueUrl(), tokens.a).expect(403);
      await get('/api/formateur/risque/formations', tokens.a).expect(403);
    });

    it('403 formateur non affecté, tracé ACCES_RESSOURCE_REFUSE', async () => {
      await get(risqueUrl(), tokens.autre).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1 AND cible = $2`,
        [ids.autre, ids.f],
      );
      expect(n).toBe(1);
    });

    it('administrateur 200 ; 404 formation inconnue ; 400 identifiant mal formé', async () => {
      await get(risqueUrl(), tokens.admin).expect(200);
      await get(risqueUrl('00000000-0000-4000-8000-000000000000'), tokens.admin).expect(404);
      await get('/api/formateur/formations/pas-un-uuid/risque', tokens.admin).expect(400);
    });
  });
});
