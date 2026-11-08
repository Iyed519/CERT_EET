import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { Atelier } from '../src/database/entities/atelier.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Critere } from '../src/database/entities/critere.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Grille } from '../src/database/entities/grille.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutAtelier } from '../src/database/enums/statut-atelier.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';

/**
 * Tests d'intégration US-ATEL-02 — Grille de notation pondérée (DS-13
 * partie 2, UC4 Formateur).
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - lecture d'une grille vide (GET n'écrit rien) ;
 *  - ajout / modification / suppression / réordonnancement de critères, avec
 *    leurs 4 niveaux (plages par défaut ou choisies) ;
 *  - critères d'erreur du Backlog : ajout faisant dépasser 100 % -> 400 ;
 *    validation à ≠ 100 % -> 400, message explicite ; validation à 100 % ;
 *  - toute modification réelle d'une grille validée la remet à « non validée »
 *    (l'ordre, lui, ne compte pas) ;
 *  - 409 hors brouillon et en formation archivée ; 403 apprenant / formateur
 *    non affecté ; 404 ;
 *  - modèles : enregistrer (copie), lister, copier (copie profonde
 *    indépendante), supprimer, nom en double -> 409, modèle d'un autre -> 404,
 *    le modèle survit à l'atelier ;
 *  - CHECK en base ; concurrence (chevauchement FORCÉ) : deux ajouts
 *    simultanés ne dépassent jamais 100 %.
 *
 * Nettoyage rejouable (avant ET après) : modèles des comptes de test ->
 * ateliers (CASCADE grilles, critères, niveaux) -> formations (CASCADE
 * modules, affectations) -> audit (bypass maintenance) -> utilisateurs.
 */
describe('Grille de notation (e2e) — US-ATEL-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let grilleRepository: Repository<Grille>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe
  // (E2E-AFFECT, E2E-ATEL01, E2E-AUTH16, E2E-CORRIGE, E2E-DM, E2E-ESPACE,
  // E2E-FORM01, E2E-INSC01, E2E-MODULES, E2E-NOTATION, E2E-QCM01, E2E-QCMCONF,
  // E2E-QCMPUB, E2E-REPONSE, E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-GRILLE';
  const EMAIL_ADMIN = 'e2e-grille-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-grille-form1@cert-eet.local';
  const EMAIL_AUTRE_FORMATEUR = 'e2e-grille-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-grille-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_FORMATEUR, EMAIL_AUTRE_FORMATEUR, EMAIL_APPRENANT];
  const UUID_INCONNU = '66666666-6666-4666-8666-666666666666';

  let tokenAdmin: string;
  let tokenFormateur: string;
  let tokenAutre: string;
  let tokenApprenant: string;
  let moduleId: string;
  let atelierId: string; // grille principale (exemple de l'UC4)
  let atelierCopieId: string; // reçoit la copie d'un modèle
  let atelierCourseId: string; // concurrence
  let atelierArchiveId: string; // formation archivée
  let dansUnMois: string;
  const ids: Record<string, string> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'patch' | 'put' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const grille = (id: string): string => `/ateliers/${id}/grille`;

  const creerAtelier = async (titre: string): Promise<string> => {
    const res = await api('post', `/modules/${moduleId}/ateliers`, tokenFormateur)
      .send({
        titre: `${MARQUEUR} ${titre}`,
        enonce: 'Implémentez une API REST NestJS protégée par JWT, avec ses tests.',
        dateLimite: dansUnMois,
        typesLivrables: ['zip'],
      })
      .expect(201);
    return res.body.id as string;
  };

  const nbCriteres = async (id: string): Promise<number> => {
    const g = await grilleRepository.findOne({ where: { atelierId: id } });
    return g ? dataSource.getRepository(Critere).countBy({ grilleId: g.id }) : 0;
  };

  const traces = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

  const purgeAudit = async (cibles: string[]): Promise<void> => {
    if (cibles.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        cibles,
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
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);
    const modeles = await grilleRepository.find({
      where: [
        { estModele: true, nomModele: Like(`${MARQUEUR}%`) },
        ...(utilisateurIds.length > 0
          ? [{ estModele: true, formateurId: In(utilisateurIds) }]
          : []),
      ],
      select: { id: true },
    });
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    const ateliers =
      formationIds.length === 0
        ? []
        : await atelierRepository.find({
            where: { module: { formationId: In(formationIds) } },
            relations: { module: true },
            select: { id: true, module: { id: true } },
          });

    if (modeles.length > 0) {
      await grilleRepository.delete({ id: In(modeles.map((m) => m.id)) });
    }
    if (ateliers.length > 0) {
      await atelierRepository.delete({ id: In(ateliers.map((a) => a.id)) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([
      ...formationIds,
      ...ateliers.map((a) => a.id),
      ...modeles.map((m) => m.id),
      ...utilisateurIds,
    ]);
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
    await app.init();

    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    atelierRepository = moduleRef.get<Repository<Atelier>>(getRepositoryToken(Atelier));
    dataSource = moduleRef.get(DataSource, { strict: false });
    grilleRepository = dataSource.getRepository(Grille);

    await nettoyer();

    const [dates] = (await dataSource.query(
      `SELECT (now() + interval '30 days') AS futur`,
    )) as Array<{ futur: Date }>;
    dansUnMois = new Date(dates.futur).toISOString();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, formateur] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_AUTRE_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenAutre = await login(EMAIL_AUTRE_FORMATEUR);
    tokenApprenant = await login(EMAIL_APPRENANT);

    const formationRepo = dataSource.getRepository(Formation);
    const [ouverte, archivee] = await formationRepo.save(
      [
        { titre: `${MARQUEUR} Back-end`, statut: StatutFormation.OUVERTE },
        { titre: `${MARQUEUR} Ancienne`, statut: StatutFormation.ARCHIVEE },
      ].map((f) => formationRepo.create({ ...f, capaciteMax: 10, noteMinCertification: 60 })),
    );
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const [module, moduleArchive] = await moduleRepo.save([
      moduleRepo.create({ formationId: ouverte.id, titre: 'API REST', ordre: 1 }),
      moduleRepo.create({ formationId: archivee.id, titre: 'Ancien', ordre: 1 }),
    ]);
    moduleId = module.id;

    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      [ouverte.id, archivee.id].map((id) =>
        affectationRepo.create({
          formationId: id,
          formateurId: formateur.id,
          affectePar: admin.id,
        }),
      ),
    );

    atelierId = await creerAtelier('Projet API');
    atelierCopieId = await creerAtelier('Projet API bis');
    atelierCourseId = await creerAtelier('Course');
    // Un atelier dans une formation archivée ne se crée plus par l'API.
    const archive = await atelierRepository.save(
      atelierRepository.create({
        moduleId: moduleArchive.id,
        formateurId: formateur.id,
        titre: `${MARQUEUR} Archivé`,
        enonce: 'Atelier d’une formation archivée.',
        dateLimite: new Date(dansUnMois),
        typesLivrables: ['zip'],
        statut: StatutAtelier.BROUILLON,
      }),
    );
    atelierArchiveId = archive.id;
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    expect(
      await grilleRepository.countBy({ estModele: true, nomModele: Like(`${MARQUEUR}%`) }),
    ).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Lecture et autorisations
  // ===================================================================

  describe('Lire et autoriser', () => {
    it('GET d’une grille jamais écrite : vide, id null — et rien n’est créé en base', async () => {
      const res = await api('get', grille(atelierId), tokenFormateur).expect(200);
      expect(res.body).toEqual({
        id: null,
        atelierId,
        statutAtelier: 'BROUILLON',
        modifiable: true,
        validee: false,
        totalPonderations: 0,
        criteres: [],
        updatedAt: null,
      });
      expect(await grilleRepository.countBy({ atelierId })).toBe(0);
    });

    it('403 pour un formateur non affecté et pour un apprenant ; 404 ; 400', async () => {
      await api('get', grille(atelierId), tokenAutre).expect(403);
      await api('get', grille(atelierId), tokenApprenant).expect(403);
      await api('post', `${grille(atelierId)}/criteres`, tokenAutre)
        .send({ intitule: 'Intrus', ponderation: 10 })
        .expect(403);
      await api('get', '/grilles/modeles', tokenApprenant).expect(403);
      await api('get', grille(UUID_INCONNU), tokenFormateur).expect(404);
      await api('get', '/ateliers/pas-un-uuid/grille', tokenFormateur).expect(400);
      expect(await nbCriteres(atelierId)).toBe(0);
    });
  });

  // ===================================================================
  //  Critères et total
  // ===================================================================

  describe('Ajouter des critères (total ≤ 100 %)', () => {
    it('201 : premier critère, plages par défaut, grille créée, tracé GRILLE_CRITERE_AJOUTE', async () => {
      const res = await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({
          intitule: '  Fonctionnement ',
          ponderation: 40,
          description: 'Les routes répondent.',
        })
        .expect(201);

      expect(res.body).toMatchObject({ totalPonderations: 40, validee: false, modifiable: true });
      expect(res.body.id).toEqual(expect.any(String));
      const [c] = res.body.criteres;
      expect(c).toMatchObject({ ordre: 1, intitule: 'Fonctionnement', ponderation: 40 });
      expect(
        c.niveaux.map((n: { libelle: string; pointsMinPct: number; pointsMaxPct: number }) => [
          n.libelle,
          n.pointsMinPct,
          n.pointsMaxPct,
        ]),
      ).toEqual([
        ['Insuffisant', 0, 25],
        ['Acceptable', 25, 50],
        ['Bon', 50, 75],
        ['Excellent', 75, 100],
      ]);
      ids.fonctionnement = c.id;

      const t = await traces('GRILLE_CRITERE_AJOUTE', atelierId);
      expect(t).toHaveLength(1);
      expect(t[0].detailsAvantApres).toMatchObject({ critereId: c.id, totalPonderations: 40 });
    });

    it('201 : plages et descripteurs choisis', async () => {
      const res = await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({
          intitule: 'Sécurité',
          ponderation: 30,
          niveaux: [
            { pointsMinPct: 0, pointsMaxPct: 40, descripteur: 'Routes non protégées.' },
            { pointsMinPct: 40, pointsMaxPct: 60 },
            { pointsMinPct: 60, pointsMaxPct: 85, descripteur: 'JWT + RBAC.' },
            { pointsMinPct: 85, pointsMaxPct: 100, descripteur: 'JWT + RBAC + tests d’accès.' },
          ],
        })
        .expect(201);
      expect(res.body.totalPonderations).toBe(70);
      expect(res.body.criteres[1].niveaux[0]).toEqual({
        ordre: 1,
        libelle: 'Insuffisant',
        pointsMinPct: 0,
        pointsMaxPct: 40,
        descripteur: 'Routes non protégées.',
      });
      ids.securite = res.body.criteres[1].id;
    });

    it('400 pour un ajout qui ferait dépasser 100 % — message explicite, rien n’est écrit', async () => {
      const res = await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Documentation', ponderation: 31 })
        .expect(400);
      expect(res.body.message).toBe(
        'Total des pondérations : 101 % (au-delà de 100 %). Réduisez une pondération.',
      );
      expect(await nbCriteres(atelierId)).toBe(2);
    });

    it.each([
      ['pondération 0', { intitule: 'Tests', ponderation: 0 }],
      ['pondération 101', { intitule: 'Tests', ponderation: 101 }],
      ['pondération décimale', { intitule: 'Tests', ponderation: 12.5 }],
      ['intitulé trop court', { intitule: 'ab', ponderation: 5 }],
      ['intitulé blanc', { intitule: '     ', ponderation: 5 }],
      [
        '3 niveaux',
        {
          intitule: 'Tests',
          ponderation: 5,
          niveaux: [
            { pointsMinPct: 0, pointsMaxPct: 30 },
            { pointsMinPct: 30, pointsMaxPct: 60 },
            { pointsMinPct: 60, pointsMaxPct: 100 },
          ],
        },
      ],
      [
        'plages avec un trou',
        {
          intitule: 'Tests',
          ponderation: 5,
          niveaux: [
            { pointsMinPct: 0, pointsMaxPct: 25 },
            { pointsMinPct: 30, pointsMaxPct: 50 },
            { pointsMinPct: 50, pointsMaxPct: 75 },
            { pointsMinPct: 75, pointsMaxPct: 100 },
          ],
        },
      ],
      [
        'plage au-delà de 100 %',
        {
          intitule: 'Tests',
          ponderation: 5,
          niveaux: [
            { pointsMinPct: 0, pointsMaxPct: 25 },
            { pointsMinPct: 25, pointsMaxPct: 50 },
            { pointsMinPct: 50, pointsMaxPct: 75 },
            { pointsMinPct: 75, pointsMaxPct: 120 },
          ],
        },
      ],
      ['libellé imposé par le client', { intitule: 'Tests', ponderation: 5, libelle: 'Bon' }],
    ])('400 : %s — rien n’est écrit', async (_libelle, corps) => {
      await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send(corps)
        .expect(400);
      expect(await nbCriteres(atelierId)).toBe(2);
    });
  });

  describe('Valider (total exactement 100 %)', () => {
    it('400 à 70 % : « Total des pondérations = 70 % (doit être 100 %). »', async () => {
      const res = await api('post', `${grille(atelierId)}/valider`, tokenFormateur).expect(400);
      expect(res.body.message).toBe('Total des pondérations = 70 % (doit être 100 %).');
    });

    it('400 pour une grille vide (0 %), sans créer de grille', async () => {
      await api('post', `${grille(atelierCopieId)}/valider`, tokenFormateur).expect(400);
      expect(await grilleRepository.countBy({ atelierId: atelierCopieId })).toBe(0);
    });

    it('200 à 100 % (exemple de l’UC4) : validee = true, tracé une seule fois', async () => {
      await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Documentation', ponderation: 15 })
        .expect(201);
      const ajout = await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Tests', ponderation: 15 })
        .expect(201);
      expect(ajout.body.totalPonderations).toBe(100);
      ids.tests = ajout.body.criteres[3].id;
      ids.documentation = ajout.body.criteres[2].id;

      const res = await api('post', `${grille(atelierId)}/valider`, tokenFormateur).expect(200);
      expect(res.body).toMatchObject({ validee: true, totalPonderations: 100 });
      // Rejouer la validation ne trace rien de plus.
      await api('post', `${grille(atelierId)}/valider`, tokenFormateur).expect(200);
      const t = await traces('GRILLE_VALIDEE', atelierId);
      expect(t).toHaveLength(1);
      expect(t[0].detailsAvantApres).toMatchObject({ nbCriteres: 4, totalPonderations: 100 });
    });

    it('un ajout de plus (même 1 %) est refusé à 100 %', async () => {
      await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Bonus', ponderation: 1 })
        .expect(400);
    });
  });

  describe('Modifier, réordonner, supprimer', () => {
    it('PATCH réel : avant/après tracés et la grille n’est plus validée', async () => {
      const res = await api('patch', `${grille(atelierId)}/criteres/${ids.tests}`, tokenFormateur)
        .send({ ponderation: 10, description: 'Couverture des services.' })
        .expect(200);
      expect(res.body).toMatchObject({ validee: false, totalPonderations: 95 });

      const t = await traces('GRILLE_CRITERE_MODIFIE', atelierId);
      expect(t).toHaveLength(1);
      expect(t[0].detailsAvantApres).toMatchObject({
        avant: { ponderation: 15, description: null },
        apres: { ponderation: 10, description: 'Couverture des services.' },
        invalidee: true,
      });
    });

    it('400 si la nouvelle pondération fait dépasser 100 %', async () => {
      const res = await api('patch', `${grille(atelierId)}/criteres/${ids.tests}`, tokenFormateur)
        .send({ ponderation: 16 })
        .expect(400);
      expect(res.body.message).toMatch(/101 %/);
    });

    it('PATCH sans effet : 200, aucune trace, la validation tient', async () => {
      await api('patch', `${grille(atelierId)}/criteres/${ids.tests}`, tokenFormateur)
        .send({ ponderation: 15 })
        .expect(200);
      await api('post', `${grille(atelierId)}/valider`, tokenFormateur).expect(200);
      await api('patch', `${grille(atelierId)}/criteres/${ids.tests}`, tokenFormateur)
        .send({ ponderation: 15, intitule: ' Tests ' })
        .expect(200)
        .expect((r) => expect(r.body.validee).toBe(true));
      expect(await traces('GRILLE_CRITERE_MODIFIE', atelierId)).toHaveLength(2);
    });

    it('400 : corps vide, intitulé vidé ; 404 : critère inconnu', async () => {
      const chemin = `${grille(atelierId)}/criteres/${ids.tests}`;
      await api('patch', chemin, tokenFormateur).send({}).expect(400);
      await api('patch', chemin, tokenFormateur).send({ intitule: null }).expect(400);
      await api('patch', `${grille(atelierId)}/criteres/${UUID_INCONNU}`, tokenFormateur)
        .send({ ponderation: 5 })
        .expect(404);
      await api('delete', `${grille(atelierId)}/criteres/${UUID_INCONNU}`, tokenFormateur).expect(
        404,
      );
    });

    it('réordonner : nouvel ordre, validation conservée, tracé', async () => {
      const ordre = [ids.securite, ids.fonctionnement, ids.documentation, ids.tests];
      const res = await api('put', `${grille(atelierId)}/criteres/ordre`, tokenFormateur)
        .send({ critereIds: ordre })
        .expect(200);
      expect(res.body.criteres.map((c: { id: string }) => c.id)).toEqual(ordre);
      expect(res.body.criteres.map((c: { ordre: number }) => c.ordre)).toEqual([1, 2, 3, 4]);
      expect(res.body.validee).toBe(true);
      expect(await traces('GRILLE_CRITERES_REORDONNES', atelierId)).toHaveLength(1);
    });

    it('400 pour un ordre incomplet ou contenant un intrus', async () => {
      const chemin = `${grille(atelierId)}/criteres/ordre`;
      await api('put', chemin, tokenFormateur)
        .send({ critereIds: [ids.securite, ids.fonctionnement] })
        .expect(400);
      await api('put', chemin, tokenFormateur)
        .send({ critereIds: [ids.securite, ids.fonctionnement, ids.documentation, UUID_INCONNU] })
        .expect(400);
    });

    it('supprimer : rangs resserrés, grille non validée, tracé', async () => {
      const ajout = await api('post', `${grille(atelierCopieId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Temporaire', ponderation: 50 })
        .expect(201);
      const temporaire = ajout.body.criteres[0].id as string;
      // Un critère d'une autre grille : 404 sur cette grille-ci.
      await api('delete', `${grille(atelierId)}/criteres/${temporaire}`, tokenFormateur).expect(
        404,
      );

      const res = await api(
        'delete',
        `${grille(atelierId)}/criteres/${ids.securite}`,
        tokenFormateur,
      ).expect(200);
      expect(res.body).toMatchObject({ validee: false, totalPonderations: 70 });
      expect(res.body.criteres.map((c: { ordre: number }) => c.ordre)).toEqual([1, 2, 3]);
      expect(await traces('GRILLE_CRITERE_SUPPRIME', atelierId)).toHaveLength(1);

      // On remet Sécurité 30 % et on revalide pour la suite.
      const remis = await api('post', `${grille(atelierId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Sécurité', ponderation: 30 })
        .expect(201);
      ids.securite = remis.body.criteres[3].id;
      await api('post', `${grille(atelierId)}/valider`, tokenFormateur).expect(200);
    });
  });

  // ===================================================================
  //  Modèles
  // ===================================================================

  describe('Modèles réutilisables', () => {
    const NOM = `${MARQUEUR} Projet API`;

    it('400 : une grille incomplète ne devient pas un modèle', async () => {
      const res = await api('post', `${grille(atelierCopieId)}/modele`, tokenFormateur)
        .send({ nomModele: `${MARQUEUR} Incomplet` })
        .expect(400);
      expect(res.body.message).toMatch(/= 50 % \(doit être 100 %\)/);
    });

    it('201 : enregistre une COPIE (la grille de l’atelier reste la même), tracé', async () => {
      const res = await api('post', `${grille(atelierId)}/modele`, tokenFormateur)
        .send({ nomModele: `  ${NOM}  ` })
        .expect(201);
      expect(res.body).toMatchObject({
        nomModele: NOM,
        nbCriteres: 4,
        totalPonderations: 100,
        estAMoi: true,
      });
      ids.modele = res.body.id;

      const enBase = await grilleRepository.findOneByOrFail({ id: ids.modele });
      expect(enBase).toMatchObject({ estModele: true, atelierId: null, validee: false });
      const g = await api('get', grille(atelierId), tokenFormateur).expect(200);
      expect(g.body).toMatchObject({ validee: true, totalPonderations: 100 });
      expect(await traces('GRILLE_MODELE_ENREGISTRE', ids.modele)).toHaveLength(1);
    });

    it('409 pour un nom déjà pris (casse ignorée) ; 400 pour un nom trop court', async () => {
      const res = await api('post', `${grille(atelierId)}/modele`, tokenFormateur)
        .send({ nomModele: NOM.toLowerCase() })
        .expect(409);
      expect(res.body.message).toBe(`Vous avez déjà un modèle nommé « ${NOM.toLowerCase()} ».`);
      await api('post', `${grille(atelierId)}/modele`, tokenFormateur)
        .send({ nomModele: 'ab' })
        .expect(400);
    });

    it('liste : le formateur voit les siens, un autre formateur rien, l’administrateur tout', async () => {
      const miens = await api('get', '/grilles/modeles', tokenFormateur).expect(200);
      const marques = (corps: Array<{ nomModele: string }>): Array<{ nomModele: string }> =>
        corps.filter((m) => m.nomModele.startsWith(MARQUEUR));
      expect(marques(miens.body)).toHaveLength(1);
      expect(marques(miens.body)[0]).toMatchObject({
        criteres: [
          { intitule: 'Fonctionnement', ponderation: 40 },
          { intitule: 'Documentation', ponderation: 15 },
          { intitule: 'Tests', ponderation: 15 },
          { intitule: 'Sécurité', ponderation: 30 },
        ],
      });
      const autres = await api('get', '/grilles/modeles', tokenAutre).expect(200);
      expect(marques(autres.body)).toHaveLength(0);
      const admin = await api('get', '/grilles/modeles', tokenAdmin).expect(200);
      expect(marques(admin.body)[0]).toMatchObject({ id: ids.modele, estAMoi: false });
    });

    it('copier : remplace la grille, copie profonde indépendante, NON validée, tracé', async () => {
      const res = await api('post', `${grille(atelierCopieId)}/copier`, tokenFormateur)
        .send({ modeleId: ids.modele })
        .expect(200);
      expect(res.body).toMatchObject({ validee: false, totalPonderations: 100 });
      expect(res.body.criteres.map((c: { intitule: string }) => c.intitule)).toEqual([
        'Fonctionnement',
        'Documentation',
        'Tests',
        'Sécurité',
      ]);
      expect(res.body.criteres[3].niveaux[2]).toMatchObject({ libelle: 'Bon' });
      const t = await traces('GRILLE_MODELE_COPIE', atelierCopieId);
      expect(t[0].detailsAvantApres).toMatchObject({ modeleId: ids.modele, criteresRemplaces: 1 });

      // Indépendance : modifier la copie ne touche ni le modèle ni l'original.
      await api(
        'patch',
        `${grille(atelierCopieId)}/criteres/${res.body.criteres[0].id}`,
        tokenFormateur,
      )
        .send({ intitule: 'Fonctionnement (copie)' })
        .expect(200);
      const modele = await api('get', '/grilles/modeles', tokenFormateur).expect(200);
      expect(
        modele.body.find((m: { id: string }) => m.id === ids.modele).criteres[0].intitule,
      ).toBe('Fonctionnement');
      const original = await api('get', grille(atelierId), tokenFormateur).expect(200);
      expect(original.body.criteres[0].intitule).toBe('Fonctionnement');
    });

    it('404 : modèle d’un autre formateur ou inconnu ; l’administrateur copie et supprime tout', async () => {
      // L'administrateur enregistre son propre modèle depuis la même grille.
      const sien = await api('post', `${grille(atelierId)}/modele`, tokenAdmin)
        .send({ nomModele: `${MARQUEUR} Modèle admin` })
        .expect(201);
      await api('post', `${grille(atelierCopieId)}/copier`, tokenFormateur)
        .send({ modeleId: sien.body.id })
        .expect(404);
      await api('post', `${grille(atelierCopieId)}/copier`, tokenFormateur)
        .send({ modeleId: UUID_INCONNU })
        .expect(404);
      await api('delete', `/grilles/modeles/${sien.body.id}`, tokenFormateur).expect(404);
      await api('delete', `/grilles/modeles/${ids.modele}`, tokenAutre).expect(404);
      await api('post', `${grille(atelierCopieId)}/copier`, tokenAdmin)
        .send({ modeleId: ids.modele })
        .expect(200);
      await api('delete', `/grilles/modeles/${sien.body.id}`, tokenAdmin).expect(204);
      expect(await traces('GRILLE_MODELE_SUPPRIME', sien.body.id)).toHaveLength(1);
    });

    it('le modèle survit à la suppression de l’atelier (dont la grille part avec lui)', async () => {
      const temporaire = await creerAtelier('Éphémère');
      await api('post', `${grille(temporaire)}/criteres`, tokenFormateur)
        .send({ intitule: 'Tout', ponderation: 100 })
        .expect(201);
      const modele = await api('post', `${grille(temporaire)}/modele`, tokenFormateur)
        .send({ nomModele: `${MARQUEUR} Survivant` })
        .expect(201);
      await api('delete', `/ateliers/${temporaire}`, tokenFormateur).expect(204);

      expect(await grilleRepository.countBy({ atelierId: temporaire })).toBe(0);
      const liste = await api('get', '/grilles/modeles', tokenFormateur).expect(200);
      expect(liste.body.some((m: { id: string }) => m.id === modele.body.id)).toBe(true);
    });

    it('204 : supprimer un modèle laisse intactes les grilles copiées', async () => {
      await api('delete', `/grilles/modeles/${ids.modele}`, tokenFormateur).expect(204);
      await api('delete', `/grilles/modeles/${ids.modele}`, tokenFormateur).expect(404);
      const copie = await api('get', grille(atelierCopieId), tokenFormateur).expect(200);
      expect(copie.body.totalPonderations).toBe(100);
    });
  });

  // ===================================================================
  //  États qui bloquent
  // ===================================================================

  describe('Hors brouillon et formation archivée', () => {
    it('409 sur toutes les écritures d’un atelier publié ; lecture « non modifiable »', async () => {
      await dataSource.query(`UPDATE ateliers SET statut = 'PUBLIE' WHERE id = $1`, [atelierId]);
      try {
        const base = grille(atelierId);
        const res = await api('post', `${base}/criteres`, tokenFormateur)
          .send({ intitule: 'Tard', ponderation: 1 })
          .expect(409);
        expect(res.body.message).toBe(
          'La grille ne se modifie que tant que l’atelier est en brouillon.',
        );
        await api('patch', `${base}/criteres/${ids.tests}`, tokenFormateur)
          .send({ ponderation: 5 })
          .expect(409);
        await api('delete', `${base}/criteres/${ids.tests}`, tokenFormateur).expect(409);
        await api('put', `${base}/criteres/ordre`, tokenFormateur)
          .send({ critereIds: [ids.tests] })
          .expect(409);
        await api('post', `${base}/valider`, tokenFormateur).expect(409);
        await api('post', `${base}/copier`, tokenFormateur)
          .send({ modeleId: UUID_INCONNU })
          .expect(409);

        const lu = await api('get', base, tokenFormateur).expect(200);
        expect(lu.body).toMatchObject({
          statutAtelier: 'PUBLIE',
          modifiable: false,
          validee: true,
        });
        // Réutiliser la grille d'un atelier publié reste possible.
        await api('post', `${base}/modele`, tokenFormateur)
          .send({ nomModele: `${MARQUEUR} Depuis publié` })
          .expect(201);
      } finally {
        await dataSource.query(`UPDATE ateliers SET statut = 'BROUILLON' WHERE id = $1`, [
          atelierId,
        ]);
      }
    });

    it('409 dans une formation archivée', async () => {
      await api('post', `${grille(atelierArchiveId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Archivé', ponderation: 10 })
        .expect(409);
    });
  });

  // ===================================================================
  //  Base de données et concurrence
  // ===================================================================

  describe('Garde-fous en base', () => {
    it('les CHECK refusent une pondération hors bornes, un libellé faux, un modèle rattaché', async () => {
      await expect(
        dataSource.query(`UPDATE criteres SET ponderation = 101 WHERE id = $1`, [ids.tests]),
      ).rejects.toThrow(/CHK_criteres_ponderation/);
      await expect(
        dataSource.query(
          `UPDATE niveaux_performance SET libelle = 'Excellent' WHERE critere_id = $1 AND ordre = 1`,
          [ids.tests],
        ),
      ).rejects.toThrow(/CHK_niveaux_performance_libelle/);
      await expect(
        dataSource.query(
          `UPDATE niveaux_performance SET points_min_pct = 60 WHERE critere_id = $1 AND ordre = 2`,
          [ids.tests],
        ),
      ).rejects.toThrow(/CHK_niveaux_performance_plage/);
      await expect(
        dataSource.query(`UPDATE grilles SET est_modele = true WHERE atelier_id = $1`, [atelierId]),
      ).rejects.toThrow(/CHK_grilles_nature/);
    });
  });

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux ajouts simultanés de 60 % : un 201, un 400 — le total ne dépasse jamais 100 %', async () => {
      // La grille existe déjà (un premier critère, retiré ensuite).
      const amorce = await api('post', `${grille(atelierCourseId)}/criteres`, tokenFormateur)
        .send({ intitule: 'Amorce', ponderation: 1 })
        .expect(201);
      await api(
        'delete',
        `${grille(atelierCourseId)}/criteres/${amorce.body.criteres[0].id}`,
        tokenFormateur,
      ).expect(200);

      // Les INSERT dans `criteres` attendent ; les SELECT … FOR UPDATE passent.
      // Le premier ajout prend le verrou de l'atelier, lit 0 %, puis attend sur
      // son INSERT ; le second attend le verrou de l'atelier. Sans ce verrou,
      // tous deux liraient 0 % et le total finirait à 120 %.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('LOCK TABLE criteres IN SHARE ROW EXCLUSIVE MODE');
        const ajouter = (intitule: string): Promise<request.Response> =>
          api('post', `${grille(atelierCourseId)}/criteres`, tokenFormateur)
            .send({ intitule, ponderation: 60 })
            .then((r) => r);
        const premier = ajouter('Course A');
        await new Promise((fin) => setTimeout(fin, 300));
        const second = ajouter('Course B');
        await new Promise((fin) => setTimeout(fin, 700));
        await bloqueur.commitTransaction();
        statuts = (await Promise.all([premier, second])).map((r) => r.status).sort();
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }

      expect(statuts).toEqual([201, 400]);
      const res = await api('get', grille(atelierCourseId), tokenFormateur).expect(200);
      expect(res.body.totalPonderations).toBe(60);
      expect(res.body.criteres).toHaveLength(1);
    }, 30_000);
  });
});
