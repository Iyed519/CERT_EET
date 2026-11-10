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
import { messageChampInstitutionnel } from '../src/modules/formations/dto/contenu-pedagogique.dto';

/**
 * Tests d'intégration US-FORM-04 — Contenu pédagogique géré par le formateur
 * (révision v1.4, ADR-11), sur l'application réelle (PostgreSQL, Redis).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté + audit
 *    ACCES_RESSOURCE_REFUSE ; 404 formation inconnue ; administrateur admis ;
 *  - contenu : description / objectifs / prérequis modifiés, audit
 *    FORMATION_MODIFIEE avec le formateur pour acteur ; 400 nommant chaque
 *    réglage institutionnel (rien de modifié) ; 400 champ inconnu, corps vide ;
 *  - modules : ajout en fin, renommage, réordonnancement, suppression d'un
 *    module vide ; 409 module portant un QCM ou une ressource ; 404 module
 *    d'une autre formation ;
 *  - formation archivée : 409 ;
 *  - concurrence : 8 ajouts simultanés -> 8 modules aux rangs 1 à 8, sans
 *    doublon (verrou de la formation).
 *
 * Marqueur `E2E-FORM04` (titres) ; emails `e2e-form04-…`.
 */
describe('Contenu pédagogique par le formateur (e2e) — US-FORM-04', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-FORM04';
  const email = (cle: string): string => `e2e-form04-${cle}@cert-eet.local`;
  const CLES = ['admin', 'formateur', 'autre', 'apprenant'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '77777777-7777-4777-8777-777777777777';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const appel = (
    methode: 'patch' | 'post' | 'put' | 'delete',
    url: string,
    corps: object = {},
    token = tokens.formateur,
  ): request.Test =>
    request(app.getHttpServer())[methode](url).set('Authorization', `Bearer ${token}`).send(corps);
  const base = (f = ids.f): string => `/api/formateur/formations/${f}`;

  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];
  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;
  const formation = (titre: string, statut = 'OUVERTE'): Promise<string> =>
    un(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification, description)
       VALUES ($1, $2, 20, 60, 'Description initiale.') RETURNING id`,
      [`${MARQUEUR} ${titre}`, statut],
    );
  const ordres = async (f: string): Promise<Array<{ titre: string; ordre: number }>> =>
    sql(`SELECT titre, ordre FROM modules WHERE formation_id = $1 ORDER BY ordre`, [f]);

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
      await qr.query(
        `DELETE FROM ressources_module WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
        [formations],
      );
      await qr.query(
        `DELETE FROM qcm WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
        [formations],
      );
      await qr.query(`DELETE FROM modules WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
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
      apprenant: Role.APPRENANT,
    };
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Contenu',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(email(cle));
    }
    ids.f = await formation('Back-end');
    ids.g = await formation('Autre');
    ids.archivee = await formation('Archivée', 'ARCHIVEE');
    ids.rafale = await formation('Rafale');
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id)
       VALUES ($1, $4), ($2, $4), ($3, $4), ($5, $6)`,
      [ids.f, ids.archivee, ids.rafale, ids.formateur, ids.g, ids.autre],
    );
    ids.mQcm = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Avec QCM', 1) RETURNING id`,
      [ids.f],
    );
    ids.mRes = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Avec ressource', 2) RETURNING id`,
      [ids.f],
    );
    await sql(`INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'BROUILLON')`, [
      ids.mQcm,
      `${MARQUEUR} QCM`,
    ]);
    await sql(
      `INSERT INTO ressources_module (module_id, ordre, nature, titre, url, plateforme, ajoute_par)
       VALUES ($1, 1, 'LIEN', 'Cours', 'https://exemple.tn/cours', 'WEB', $2)`,
      [ids.mRes, ids.formateur],
    );
    ids.mG = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module G', 1) RETURNING id`,
      [ids.g],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès', () => {
    it('401 ; 403 apprenant ; 403 non affecté tracé ; 404 inconnue ; administrateur admis', async () => {
      await request(app.getHttpServer())
        .patch(`${base()}/contenu`)
        .send({ objectifs: 'x' })
        .expect(401);
      await appel('patch', `${base()}/contenu`, { objectifs: 'x' }, tokens.apprenant).expect(403);
      await appel('patch', `${base()}/contenu`, { objectifs: 'x' }, tokens.autre).expect(403);
      await appel('post', `${base()}/modules`, { titre: 'x' }, tokens.autre).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1`,
        [ids.autre],
      );
      expect(n).toBeGreaterThanOrEqual(2);
      await appel('patch', `${base(INCONNU)}/contenu`, { objectifs: 'x' }, tokens.admin).expect(
        404,
      );
      await appel(
        'patch',
        `${base()}/contenu`,
        { prerequis: 'Bases de JavaScript.' },
        tokens.admin,
      ).expect(200);
    });
  });

  describe('Contenu pédagogique', () => {
    it('description, objectifs, prérequis ; audit avec le formateur pour acteur', async () => {
      const res = await appel('patch', `${base()}/contenu`, {
        description: 'Nouvelle description.',
        objectifs: 'Concevoir une API REST.',
        prerequis: null,
      }).expect(200);
      expect(res.body).toMatchObject({
        description: 'Nouvelle description.',
        objectifs: 'Concevoir une API REST.',
        prerequis: null,
        titre: `${MARQUEUR} Back-end`,
      });
      const [audit] = await sql<{ user_id: string; details: { apres: Record<string, unknown> } }>(
        `SELECT user_id, details_avant_apres AS details FROM audit_logs
          WHERE action = 'FORMATION_MODIFIEE' AND cible = $1 ORDER BY horodatage DESC LIMIT 1`,
        [ids.f],
      );
      expect(audit.user_id).toBe(ids.formateur);
      expect(audit.details.apres).toMatchObject({ objectifs: 'Concevoir une API REST.' });
    });

    it('400 nommant chaque réglage institutionnel ; rien n’est modifié', async () => {
      const champs: Record<string, unknown> = {
        titre: 'Renommée',
        dateDebut: '2026-12-01',
        dateFin: '2026-12-31',
        dureeHeures: 10,
        capaciteMax: 99,
        noteMinCertification: 10,
        modeleCertificat: 'autre',
        statut: 'FERMEE',
      };
      for (const [champ, valeur] of Object.entries(champs)) {
        const r = await appel('patch', `${base()}/contenu`, {
          objectifs: 'Tentative.',
          [champ]: valeur,
        }).expect(400);
        expect(r.body.message).toContain(messageChampInstitutionnel(champ));
      }
      const [f] = await sql<{
        titre: string;
        capacite_max: number;
        objectifs: string;
        statut: string;
      }>(
        `SELECT titre, capacite_max, objectifs, statut::text AS statut FROM formations WHERE id = $1`,
        [ids.f],
      );
      expect(f).toEqual({
        titre: `${MARQUEUR} Back-end`,
        capacite_max: 20,
        objectifs: 'Concevoir une API REST.',
        statut: 'OUVERTE',
      });
    });

    it('400 champ inconnu ou corps vide', async () => {
      await appel('patch', `${base()}/contenu`, { couleur: 'bleu' }).expect(400);
      await appel('patch', `${base()}/contenu`, {}).expect(400);
    });
  });

  describe('Modules', () => {
    it('ajout en fin, renommage, réordonnancement, suppression d’un module vide', async () => {
      const ajout = await appel('post', `${base()}/modules`, { titre: 'Bilan' }).expect(201);
      expect(ajout.body).toMatchObject({ titre: 'Bilan', ordre: 3 });
      ids.mBilan = ajout.body.id;
      await appel('patch', `${base()}/modules/${ids.mBilan}`, { titre: 'Bilan final' }).expect(200);
      await appel('put', `${base()}/modules/ordre`, {
        moduleIds: [ids.mBilan, ids.mQcm, ids.mRes],
      }).expect(200);
      expect(await ordres(ids.f)).toEqual([
        { titre: 'Bilan final', ordre: 1 },
        { titre: 'Avec QCM', ordre: 2 },
        { titre: 'Avec ressource', ordre: 3 },
      ]);
      await appel('delete', `${base()}/modules/${ids.mBilan}`).expect(204);
      expect((await ordres(ids.f)).map((m) => m.ordre)).toEqual([1, 2]);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE cible = $1 AND user_id = $2 AND action IN ('MODULE_CREE', 'MODULE_MODIFIE', 'MODULES_REORDONNES', 'MODULE_SUPPRIME')`,
        [ids.f, ids.formateur],
      );
      expect(n).toBe(4);
    });

    it('409 module portant un QCM ou une ressource ; 404 module d’une autre formation', async () => {
      await appel('delete', `${base()}/modules/${ids.mQcm}`).expect(409);
      const r = await appel('delete', `${base()}/modules/${ids.mRes}`).expect(409);
      expect(r.body.message).toBe(
        'Ce module contient des ressources : retirez-les avant de le supprimer.',
      );
      await appel('patch', `${base()}/modules/${ids.mG}`, { titre: 'Piraté' }).expect(404);
      await appel('delete', `${base()}/modules/${ids.mG}`).expect(404);
      expect(await ordres(ids.g)).toEqual([{ titre: 'Module G', ordre: 1 }]);
    });

    it('formation archivée : 409', async () => {
      await appel('patch', `${base(ids.archivee)}/contenu`, { objectifs: 'x' }).expect(409);
      await appel('post', `${base(ids.archivee)}/modules`, { titre: 'x' }).expect(409);
    });
  });

  describe('Concurrence', () => {
    it('8 ajouts simultanés : rangs 1 à 8, sans doublon', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          appel('post', `${base(ids.rafale)}/modules`, { titre: `Module ${i}` }),
        ),
      );
      expect(reponses.every((r) => r.status === 201)).toBe(true);
      expect((await ordres(ids.rafale)).map((m) => m.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });
});
