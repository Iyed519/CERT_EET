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
  MESSAGE_DEJA_OUVERTE,
  MESSAGE_DEJA_TRAITEE,
  MESSAGE_OUVERTE_EXISTANTE,
} from '../src/modules/pilotage/traitement-alertes.service';

/**
 * Tests d'intégration US-SUIVI-03 — Traiter une alerte (DS-14 P2), sur
 * l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté + audit
 *    ACCES_RESSOURCE_REFUSE ; 404 alerte inconnue ; 400 identifiant ;
 *    administrateur autorisé ;
 *  - traiter : 400 action vide ou trop longue ; OUVERTE -> TRAITEE, auteur et
 *    date, historique, audit ALERTE_TRAITEE ; 409 déjà traitée ;
 *  - rouvrir : TRAITEE -> OUVERTE, motif historisé, audit ALERTE_ROUVERTE ;
 *    409 déjà ouverte ; 409 si une autre alerte du même critère est ouverte ;
 *  - historique jamais écrasé (ajout seul ; UPDATE refusé par la base) ;
 *  - concurrence : 8 traitements simultanés -> 1 succès, 7 × 409, une seule
 *    entrée et une seule trace.
 *
 * Marqueur `E2E-SUIVI03` (titres) ; emails `e2e-suivi03-…`.
 */
describe('Traiter une alerte (e2e) — US-SUIVI-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-SUIVI03';
  const EMAIL = {
    admin: 'e2e-suivi03-admin@cert-eet.local',
    formateur: 'e2e-suivi03-form@cert-eet.local',
    autre: 'e2e-suivi03-autre@cert-eet.local',
    a: 'e2e-suivi03-a@cert-eet.local',
    b: 'e2e-suivi03-b@cert-eet.local',
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
  const post = (url: string, body: object, token = tokens.formateur): request.Test =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);

  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];

  const alerte = async (apprenant: string, critere: string): Promise<string> =>
    (
      await sql<{ id: string }>(
        `INSERT INTO alertes_decrochage (formation_id, apprenant_id, critere, donnees, suggestion)
         VALUES ($1, $2, $3, '{"test": true}', 'Suggestion de test.') RETURNING id`,
        [ids.f, apprenant, critere],
      )
    )[0].id;

  const traces = async (action: string, cible: string): Promise<number> =>
    (
      await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = $1 AND cible = $2`,
        [action, cible],
      )
    )[0].n;

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const alertesIds = (
      await sql<{ id: string }>(`SELECT id FROM alertes_decrochage WHERE formation_id = ANY($1)`, [
        formations,
      ])
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
      // Formation -> alertes -> actions (CASCADE).
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
          nom: 'Suivitrois',
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }
    const formation = async (titre: string): Promise<string> =>
      (
        await sql<{ id: string }>(
          `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
           VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
          [`${MARQUEUR} ${titre}`],
        )
      )[0].id;
    ids.f = await formation('Back-end');
    ids.g = await formation('Autre');
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2), ($3, $4)`,
      [ids.f, ids.formateur, ids.g, ids.autre],
    );
    await sql(`INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $3), ($2, $3)`, [
      ids.a,
      ids.b,
      ids.f,
    ]);
    ids.al1 = await alerte(ids.a, 'INACTIVITE');
    ids.al2 = await alerte(ids.b, 'ECHECS_QCM');
    ids.al3 = await alerte(ids.a, 'SCORE_EN_CHUTE');
    ids.al4 = await alerte(ids.b, 'LIVRABLE_EN_RETARD');
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  const url = (id: string, suite = ''): string => `/api/formateur/alertes/${id}${suite}`;

  describe('Accès', () => {
    it('401 ; 403 apprenant ; 400 identifiant ; 404 inconnue', async () => {
      await request(app.getHttpServer()).get(url(ids.al1)).expect(401);
      await get(url(ids.al1), tokens.a).expect(403);
      await post(url(ids.al1, '/traiter'), { action: 'x' }, tokens.a).expect(403);
      await get(url('pas-un-uuid')).expect(400);
      const inconnue = await get(url(INCONNU)).expect(404);
      expect(inconnue.body.message).toBe('Alerte introuvable.');
      await get(url(INCONNU), tokens.admin).expect(404);
    });

    it('403 formateur non affecté (lecture, traitement, réouverture), tracé', async () => {
      await get(url(ids.al1), tokens.autre).expect(403);
      await post(url(ids.al1, '/traiter'), { action: 'x' }, tokens.autre).expect(403);
      await post(url(ids.al1, '/rouvrir'), { motif: 'x' }, tokens.autre).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1 AND cible = $2`,
        [ids.autre, ids.f],
      );
      expect(n).toBe(3);
      const [{ statut }] = await sql<{ statut: string }>(
        `SELECT statut::text AS statut FROM alertes_decrochage WHERE id = $1`,
        [ids.al1],
      );
      expect(statut).toBe('OUVERTE');
    });

    it('détail : alerte et historique vide', async () => {
      const d = (await get(url(ids.al1)).expect(200)).body;
      expect(d).toMatchObject({
        id: ids.al1,
        critere: 'INACTIVITE',
        statut: 'OUVERTE',
        dateTraitement: null,
        formation: { id: ids.f, titre: `${MARQUEUR} Back-end` },
        apprenant: { id: ids.a },
        historique: [],
      });
    });
  });

  describe('Traiter et rouvrir', () => {
    it('400 : action vide ou trop longue, champ inconnu', async () => {
      await post(url(ids.al1, '/traiter'), { action: '   ' }).expect(400);
      await post(url(ids.al1, '/traiter'), { action: 'x'.repeat(2001) }).expect(400);
      await post(url(ids.al1, '/traiter'), {}).expect(400);
      await post(url(ids.al1, '/traiter'), { action: 'ok', statut: 'TRAITEE' }).expect(400);
      await post(url(ids.al1, '/rouvrir'), { motif: '' }).expect(400);
    });

    it('traiter : OUVERTE -> TRAITEE, auteur, historique, audit ; puis 409', async () => {
      const d = (
        await post(url(ids.al1, '/traiter'), { action: '  Appel passé, reprise lundi.  ' }).expect(
          200,
        )
      ).body;
      expect(d.statut).toBe('TRAITEE');
      expect(d.dateTraitement).not.toBeNull();
      expect(d.historique).toEqual([
        expect.objectContaining({
          type: 'TRAITEMENT',
          commentaire: 'Appel passé, reprise lundi.',
          auteur: expect.objectContaining({ id: ids.formateur, email: EMAIL.formateur }),
        }),
      ]);
      const [ligne] = await sql<{ traite_par: string }>(
        `SELECT traite_par FROM alertes_decrochage WHERE id = $1`,
        [ids.al1],
      );
      expect(ligne.traite_par).toBe(ids.formateur);
      expect(await traces('ALERTE_TRAITEE', ids.al1)).toBe(1);

      const encore = await post(url(ids.al1, '/traiter'), { action: 'Encore.' }).expect(409);
      expect(encore.body.message).toBe(MESSAGE_DEJA_TRAITEE);
      expect((await get(url(ids.al1)).expect(200)).body.historique).toHaveLength(1);
    });

    it('rouvrir : TRAITEE -> OUVERTE, motif ajouté ; 409 déjà ouverte ; historique jamais écrasé', async () => {
      const d = (await post(url(ids.al1, '/rouvrir'), { motif: 'Pas de reprise.' }).expect(200))
        .body;
      expect(d.statut).toBe('OUVERTE');
      expect(d.dateTraitement).toBeNull();
      expect(d.historique.map((h: { type: string }) => h.type)).toEqual([
        'TRAITEMENT',
        'REOUVERTURE',
      ]);
      expect(await traces('ALERTE_ROUVERTE', ids.al1)).toBe(1);
      const encore = await post(url(ids.al1, '/rouvrir'), { motif: 'x' }).expect(409);
      expect(encore.body.message).toBe(MESSAGE_DEJA_OUVERTE);

      const fin = (await post(url(ids.al1, '/traiter'), { action: 'Entretien fait.' }).expect(200))
        .body;
      expect(fin.historique.map((h: { commentaire: string }) => h.commentaire)).toEqual([
        'Appel passé, reprise lundi.',
        'Pas de reprise.',
        'Entretien fait.',
      ]);
      await expect(
        sql(`UPDATE actions_alerte SET commentaire = 'falsifié' WHERE alerte_id = $1`, [ids.al1]),
      ).rejects.toThrow(/immuable/);
      await expect(
        sql(`UPDATE actions_alerte SET auteur_id = $2 WHERE alerte_id = $1`, [ids.al1, ids.admin]),
      ).rejects.toThrow(/immuable/);
    });

    it('rouvrir refusé si une autre alerte du même critère est ouverte', async () => {
      await post(url(ids.al2, '/traiter'), { action: 'Révision proposée.' }).expect(200);
      const nouvelle = await alerte(ids.b, 'ECHECS_QCM'); // nouveau balayage
      const res = await post(url(ids.al2, '/rouvrir'), { motif: 'Nouvel échec.' }).expect(409);
      expect(res.body.message).toBe(MESSAGE_OUVERTE_EXISTANTE);
      const d = (await get(url(ids.al2)).expect(200)).body;
      expect(d.statut).toBe('TRAITEE');
      expect(d.historique).toHaveLength(1);
      expect(await traces('ALERTE_ROUVERTE', ids.al2)).toBe(0);
      const liste = (
        await get(`/api/formateur/alertes?formationId=${ids.f}&statut=OUVERTE`).expect(200)
      ).body.map((a: { id: string }) => a.id);
      expect(liste).toContain(nouvelle);
      expect(liste).not.toContain(ids.al2);
    });

    it('administrateur : peut traiter', async () => {
      const d = (
        await post(url(ids.al4, '/traiter'), { action: 'Relance faite.' }, tokens.admin).expect(200)
      ).body;
      expect(d.historique[0].auteur.id).toBe(ids.admin);
    });
  });

  describe('Concurrence', () => {
    it('8 traitements simultanés : 1 succès, 7 × 409, une entrée, une trace', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          post(url(ids.al3, '/traiter'), { action: `Essai ${i}` }),
        ),
      );
      const codes = reponses.map((r) => r.status).sort();
      expect(codes).toEqual([200, 409, 409, 409, 409, 409, 409, 409]);
      const d = (await get(url(ids.al3)).expect(200)).body;
      expect(d.historique).toHaveLength(1);
      expect(await traces('ALERTE_TRAITEE', ids.al3)).toBe(1);
    });
  });
});
