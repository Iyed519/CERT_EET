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
  MESSAGE_ARCHIVEE_DEFINITIF,
  MESSAGE_CONFIRMATION_REQUISE,
  MESSAGE_FORMATION_ARCHIVEE_PARCOURS,
} from '../src/modules/formations/cycle-formation.regles';

/**
 * Tests d'intégration US-FORM-02 — Clôturer / archiver une formation
 * (DS-16 P1), sur l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur ; 400 statut, champ inconnu, corps vide,
 *    identifiant ; 404 ;
 *  - impact : transitions possibles, inscriptions, évaluations en cours,
 *    certificats actifs ;
 *  - transitions : OUVERTE -> ARCHIVEE refusée (409) ; clôture (plus
 *    d'inscription au catalogue) ; réouverture ; CONFIRMATION_REQUISE (409 +
 *    détail) puis confirmation ; archivage ; ARCHIVEE définitif ; modification
 *    refusée ; audit FORMATION_CLOTUREE / ROUVERTE / ARCHIVEE ;
 *  - parcours figé : démarrage de QCM refusé (409) ; certificat émis
 *    toujours vérifiable publiquement ;
 *  - concurrence : 8 clôtures simultanées -> 1 succès, 7 × 409, une trace.
 *
 * Marqueur `E2E-FORM02` (titres) ; emails `e2e-form02-…`.
 */
describe('Cycle de vie d’une formation (e2e) — US-FORM-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-FORM02';
  const EMAIL = {
    admin: 'e2e-form02-admin@cert-eet.local',
    formateur: 'e2e-form02-form@cert-eet.local',
    a: 'e2e-form02-a@cert-eet.local',
    b: 'e2e-form02-b@cert-eet.local',
    c: 'e2e-form02-c@cert-eet.local',
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
  const get = (url: string, token = tokens.admin): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: object, token = tokens.admin): request.Test =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const statut = (formation: string, body: object, token = tokens.admin): request.Test =>
    post(`/api/admin/formations/${formation}/statut`, body, token);

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
    const certificats = (
      await sql<{ id: string }>(`SELECT id FROM certificats WHERE formation_id = ANY($1)`, [
        formations,
      ])
    ).map((c) => c.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...certificats],
      ]);
      await qr.query(`DELETE FROM certificats WHERE id = ANY($1)`, [certificats]);
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
    const roles: Record<string, Role> = { admin: Role.ADMINISTRATEUR, formateur: Role.FORMATEUR };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle] ?? Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Cycle',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }
    ids.f = await formation('Back-end');
    ids.rafale = await formation('Rafale');
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [
      ids.f,
      ids.formateur,
    ]);
    await sql(`INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $3), ($2, $3)`, [
      ids.a,
      ids.b,
      ids.f,
    ]);
    const m1 = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    ids.q = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
      [m1, `${MARQUEUR} QCM`],
    );
    await sql(
      `INSERT INTO config_anti_fraude (qcm_id, duree_max_minutes, date_ouverture, date_fermeture,
         nb_tentatives_max, delai_entre_tentatives, affichage_resultats, score_min_validation,
         ponderation_formation)
       VALUES ($1, 30, now() - interval '1 day', now() + interval '10 days', 3, 0, 'DIFFERE', 60, 10)`,
      [ids.q],
    );
    // Tentative déjà notée : n'est pas une évaluation « en cours ».
    await sql(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin,
         duree_effective, score, est_reussie, statut)
       VALUES ($1, $2, now() - interval '2 hours', now() - interval '90 minutes',
         now() - interval '100 minutes', 1200, 72, true, 'NOTEE')`,
      [ids.b, ids.q],
    );
    ids.cert = await un(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
         date_emission, date_generation, cle_stockage, empreinte_sha256)
       VALUES ($1, $2, 'ACTIF', 80, 'Très bien', 'ESPRIT Entreprise', now(), now(), $3, $4) RETURNING id`,
      [ids.b, ids.f, `certificats/${MARQUEUR}-b.pdf`, 'c'.repeat(64)],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  const urlImpact = (f = ids.f): string => `/api/admin/formations/${f}/cycle`;

  describe('Accès et validation', () => {
    it('401 ; 403 formateur ; 404 ; 400 identifiant', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/formations/${ids.f}/statut`)
        .send({ statut: 'FERMEE' })
        .expect(401);
      await statut(ids.f, { statut: 'FERMEE' }, tokens.formateur).expect(403);
      await get(urlImpact(), tokens.formateur).expect(403);
      await statut(INCONNU, { statut: 'FERMEE' }).expect(404);
      await get(urlImpact(INCONNU)).expect(404);
      await statut('pas-un-uuid', { statut: 'FERMEE' }).expect(400);
    });

    it('400 : statut inconnu, champ inconnu, corps vide', async () => {
      await statut(ids.f, { statut: 'SUPPRIMEE' }).expect(400);
      await statut(ids.f, { statut: 'FERMEE', motif: 'x' }).expect(400);
      await statut(ids.f, {}).expect(400);
    });
  });

  describe('Transitions', () => {
    it('impact initial : OUVERTE, aucune évaluation en cours, 1 certificat actif', async () => {
      const res = await get(urlImpact()).expect(200);
      expect(res.body).toEqual({
        statut: 'OUVERTE',
        transitionsPossibles: ['FERMEE'],
        inscriptionsEnCours: 2,
        evaluationsEnCours: {
          tentativesEnCours: 0,
          livrablesACorriger: 0,
          correctionsEnCours: 0,
          certificatsEnEmission: 0,
        },
        certificatsActifs: 1,
      });
    });

    it('OUVERTE -> ARCHIVEE refusée (409), rien de tracé', async () => {
      const res = await statut(ids.f, { statut: 'ARCHIVEE', confirmer: true }).expect(409);
      expect(res.body.message).toBe(
        'Transition impossible : une formation ouverte ne peut pas devenir archivée.',
      );
      expect(await traces('FORMATION_ARCHIVEE', ids.f)).toBe(0);
    });

    it('clôture : plus d’inscription au catalogue ; puis réouverture', async () => {
      const res = await statut(ids.f, { statut: 'FERMEE' }).expect(200);
      expect(res.body.statut).toBe('FERMEE');
      expect(await traces('FORMATION_CLOTUREE', ids.f)).toBe(1);
      await post(`/api/formations/${ids.f}/inscriptions`, {}, tokens.c).expect(404);
      await statut(ids.f, { statut: 'FERMEE' }).expect(409);

      expect((await statut(ids.f, { statut: 'OUVERTE' }).expect(200)).body.statut).toBe('OUVERTE');
      expect(await traces('FORMATION_ROUVERTE', ids.f)).toBe(1);
    });

    it('évaluation en cours : 409 CONFIRMATION_REQUISE avec le détail, puis confirmée', async () => {
      await sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, statut)
         VALUES ($1, $2, now(), now() + interval '30 minutes', 'EN_COURS')`,
        [ids.a, ids.q],
      );
      const refus = await statut(ids.f, { statut: 'FERMEE' }).expect(409);
      expect(refus.body).toMatchObject({
        code: 'CONFIRMATION_REQUISE',
        message: MESSAGE_CONFIRMATION_REQUISE,
        evaluationsEnCours: { tentativesEnCours: 1 },
      });
      expect((await get(urlImpact()).expect(200)).body.statut).toBe('OUVERTE');

      await statut(ids.f, { statut: 'FERMEE', confirmer: true }).expect(200);
      const [audit] = await sql<{ details: Record<string, unknown> }>(
        `SELECT details_avant_apres AS details FROM audit_logs
          WHERE action = 'FORMATION_CLOTUREE' AND cible = $1 ORDER BY horodatage DESC LIMIT 1`,
        [ids.f],
      );
      expect(audit.details).toMatchObject({
        avant: 'OUVERTE',
        apres: 'FERMEE',
        confirme: true,
        evaluationsEnCours: { tentativesEnCours: 1 },
      });
    });

    it('archivage (confirmé), puis définitif ; modification refusée', async () => {
      await statut(ids.f, { statut: 'ARCHIVEE' }).expect(409);
      expect(
        (await statut(ids.f, { statut: 'ARCHIVEE', confirmer: true }).expect(200)).body.statut,
      ).toBe('ARCHIVEE');
      expect(await traces('FORMATION_ARCHIVEE', ids.f)).toBe(1);
      for (const s of ['OUVERTE', 'FERMEE', 'ARCHIVEE']) {
        const r = await statut(ids.f, { statut: s, confirmer: true }).expect(409);
        expect(r.body.message).toBe(MESSAGE_ARCHIVEE_DEFINITIF);
      }
      expect((await get(urlImpact()).expect(200)).body.transitionsPossibles).toEqual([]);
      await request(app.getHttpServer())
        .patch(`/api/admin/formations/${ids.f}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ titre: `${MARQUEUR} Renommée` })
        .expect(409);
    });
  });

  describe('Parcours figé', () => {
    it('démarrage d’un QCM refusé (409)', async () => {
      const r = await post(`/api/qcm/${ids.q}/tentatives`, {}, tokens.b).expect(409);
      expect(r.body.message).toBe(MESSAGE_FORMATION_ARCHIVEE_PARCOURS);
    });

    it('le certificat émis reste vérifiable publiquement', async () => {
      const r = await request(app.getHttpServer()).get(`/api/verification/${ids.cert}`).expect(200);
      expect(r.body).toMatchObject({ certificatId: ids.cert, verdict: 'VALIDE' });
      const [{ statut: s }] = await sql<{ statut: string }>(
        `SELECT statut::text AS statut FROM certificats WHERE id = $1`,
        [ids.cert],
      );
      expect(s).toBe('ACTIF');
    });
  });

  describe('Concurrence', () => {
    it('8 clôtures simultanées : 1 succès, 7 × 409, une seule trace', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () => statut(ids.rafale, { statut: 'FERMEE' })),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([
        200, 409, 409, 409, 409, 409, 409, 409,
      ]);
      expect(await traces('FORMATION_CLOTUREE', ids.rafale)).toBe(1);
    });
  });
});
