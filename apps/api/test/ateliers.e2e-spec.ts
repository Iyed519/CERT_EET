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
import { Formation } from '../src/database/entities/formation.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';

/**
 * Tests d'intégration US-ATEL-01 — Créer un atelier (DS-13 partie 1).
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - autorisation par ressource sur les routes atelier : formateur affecté et
 *    administrateur passent ; formateur non affecté (403 + audit), apprenant
 *    (403) refusés ; module / atelier inconnus (404) ; formation archivée (409) ;
 *  - création en BROUILLON avec valeurs par défaut et audit ATELIER_CREE ;
 *  - critère d'erreur du Backlog : date limite passée -> 400, RIEN enregistré ;
 *  - bornes (types hors liste, taille, fichiers, tolérance, champ inconnu) ;
 *  - liste par module, fiche, modification (audit avant/après), suppression ;
 *  - 409 dès que l'atelier n'est plus en brouillon (statut posé en SQL :
 *    la publication arrive avec US-ATEL-03) ;
 *  - un module qui porte un atelier ne se supprime pas (409).
 *
 * Dates RELATIVES à l'horloge de PostgreSQL (jamais une date fixe comparée à
 * l'heure réelle). Nettoyage rejouable (avant ET après), dans l'ordre des
 * clés RESTRICT : ateliers -> formations (CASCADE modules, affectations) ->
 * audit (bypass maintenance) -> utilisateurs. Les titres portent le marqueur.
 */
describe('Ateliers (e2e) — US-ATEL-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe
  // (E2E-AFFECT, E2E-AUTH16, E2E-CORRIGE, E2E-DM, E2E-ESPACE, E2E-FORM01,
  // E2E-INSC01, E2E-MODULES, E2E-NOTATION, E2E-QCM01, E2E-QCMCONF, E2E-QCMPUB,
  // E2E-REPONSE, E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-ATEL01';
  const EMAIL_ADMIN = 'e2e-atel01-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-atel01-form1@cert-eet.local';
  const EMAIL_AUTRE_FORMATEUR = 'e2e-atel01-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-atel01-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_FORMATEUR, EMAIL_AUTRE_FORMATEUR, EMAIL_APPRENANT];
  const UUID_INCONNU = '55555555-5555-4555-8555-555555555555';

  let tokenAdmin: string;
  let tokenFormateur: string;
  let tokenAutre: string;
  let tokenApprenant: string;
  let formationId: string;
  let moduleId: string;
  let moduleArchiveId: string;
  let atelierId: string;
  let dansUnMois: string;
  let hier: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'patch' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const corps = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
    titre: `${MARQUEUR} API REST sécurisée`,
    enonce: 'Implémentez une API REST NestJS protégée par JWT, avec ses tests.',
    dateLimite: dansUnMois,
    typesLivrables: ['zip', 'pdf'],
    ...surcharge,
  });

  const nbAteliersMarques = (): Promise<number> =>
    atelierRepository.countBy({ titre: Like(`${MARQUEUR}%`) });

  const purgeAudit = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        ids,
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
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    // Tous les ateliers des formations de test, même ceux d'un titre inattendu.
    const ateliers =
      formationIds.length === 0
        ? []
        : await atelierRepository.find({
            where: { module: { formationId: In(formationIds) } },
            relations: { module: true },
            select: { id: true, module: { id: true } },
          });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);

    if (ateliers.length > 0) {
      await atelierRepository.delete({ id: In(ateliers.map((a) => a.id)) });
    }
    await atelierRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formationIds, ...ateliers.map((a) => a.id), ...utilisateurIds]);
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

    await nettoyer();

    // Dates relatives à l'horloge de PostgreSQL, celle qui décide côté service.
    const [dates] = (await dataSource.query(
      `SELECT (now() + interval '30 days') AS futur, (now() - interval '1 day') AS passe`,
    )) as Array<{ futur: Date; passe: Date }>;
    dansUnMois = new Date(dates.futur).toISOString();
    hier = new Date(dates.passe).toISOString();

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
    formationId = ouverte.id;

    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const [module, moduleArchive] = await moduleRepo.save([
      moduleRepo.create({ formationId, titre: 'API REST', ordre: 1 }),
      moduleRepo.create({ formationId: archivee.id, titre: 'Ancien', ordre: 1 }),
    ]);
    moduleId = module.id;
    moduleArchiveId = moduleArchive.id;

    // Le formateur 1 est affecté aux deux formations ; le formateur 2 à aucune.
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      [formationId, archivee.id].map((id) =>
        affectationRepo.create({
          formationId: id,
          formateurId: formateur.id,
          affectePar: admin.id,
        }),
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    expect(await nbAteliersMarques()).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Création
  // ===================================================================

  describe('Créer un atelier', () => {
    it('201 pour le formateur affecté : BROUILLON, valeurs par défaut, tracé ATELIER_CREE', async () => {
      const res = await api('post', `/modules/${moduleId}/ateliers`, tokenFormateur)
        .send(corps({ competencesVisees: 'Sécurité des API' }))
        .expect(201);

      expect(res.body).toMatchObject({
        moduleId,
        formationId,
        moduleTitre: 'API REST',
        statut: 'BROUILLON',
        typesLivrables: ['pdf', 'zip'],
        tailleMaxMo: 20,
        nbMaxFichiers: 1,
        toleranceRetardHeures: 0,
        competencesVisees: 'Sécurité des API',
      });
      expect(new Date(res.body.dateLimite).toISOString()).toBe(dansUnMois);
      expect(res.body).not.toHaveProperty('formateurId');
      atelierId = res.body.id;

      const traces = await auditLogRepository.find({
        where: { action: 'ATELIER_CREE', cible: atelierId },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].detailsAvantApres).toMatchObject({ formationId, moduleId });
    });

    it('400 pour une date limite passée — rien n’est enregistré', async () => {
      const avant = await nbAteliersMarques();
      const res = await api('post', `/modules/${moduleId}/ateliers`, tokenFormateur)
        .send(corps({ titre: `${MARQUEUR} En retard`, dateLimite: hier }))
        .expect(400);

      expect(res.body.message).toMatch(/date limite doit être dans le futur/);
      expect(await nbAteliersMarques()).toBe(avant);
    });

    it.each([
      ['type hors liste', { typesLivrables: ['pdf', 'exe'] }],
      ['aucun type', { typesLivrables: [] }],
      ['taille > 100 Mo', { tailleMaxMo: 101 }],
      ['0 fichier', { nbMaxFichiers: 0 }],
      ['tolérance > 168 h', { toleranceRetardHeures: 169 }],
      ['titre trop court', { titre: 'ab' }],
      ['énoncé trop court', { enonce: 'Court' }],
      ['date non ISO', { dateLimite: '15/12/2026' }],
      ['formationId fourni par le client', { formationId: UUID_INCONNU }],
    ])('400 : %s — rien n’est enregistré', async (_libelle, surcharge) => {
      const avant = await nbAteliersMarques();
      await api('post', `/modules/${moduleId}/ateliers`, tokenFormateur)
        .send(corps(surcharge))
        .expect(400);
      expect(await nbAteliersMarques()).toBe(avant);
    });

    it('201 avec des fichiers de code source (complément du 08/11)', async () => {
      const res = await api('post', `/modules/${moduleId}/ateliers`, tokenFormateur)
        .send(corps({ titre: `${MARQUEUR} Code`, typesLivrables: ['ipynb', 'py', 'java', 'zip'] }))
        .expect(201);
      expect(res.body.typesLivrables).toEqual(['zip', 'py', 'java', 'ipynb']);
      await api('delete', `/ateliers/${res.body.id}`, tokenFormateur).expect(204);
    });

    it('la base refuse elle aussi un type hors liste (CHECK)', async () => {
      await expect(
        dataSource.query(`UPDATE ateliers SET types_livrables = ARRAY['exe'] WHERE id = $1`, [
          atelierId,
        ]),
      ).rejects.toThrow(/CHK_ateliers_types_livrables/);
      await expect(
        dataSource.query(
          `UPDATE ateliers SET types_livrables = ARRAY['py', 'ipynb'] WHERE id = $1`,
          [atelierId],
        ),
      ).resolves.toBeDefined();
      await dataSource.query(
        `UPDATE ateliers SET types_livrables = ARRAY['pdf', 'zip'] WHERE id = $1`,
        [atelierId],
      );
    });

    it('403 + ACCES_RESSOURCE_REFUSE pour un formateur non affecté ; 403 pour un apprenant', async () => {
      await api('post', `/modules/${moduleId}/ateliers`, tokenAutre)
        .send(corps({ titre: `${MARQUEUR} Intrus` }))
        .expect(403);
      await api('post', `/modules/${moduleId}/ateliers`, tokenApprenant)
        .send(corps({ titre: `${MARQUEUR} Intrus` }))
        .expect(403);

      const refus = await auditLogRepository.find({
        where: { action: 'ACCES_RESSOURCE_REFUSE', cible: formationId },
      });
      expect(refus.length).toBeGreaterThanOrEqual(1);
      expect(refus[0].detailsAvantApres).toMatchObject({ ressource: 'module' });
    });

    it('l’administrateur passe sans affectation', async () => {
      const res = await api('post', `/modules/${moduleId}/ateliers`, tokenAdmin)
        .send(corps({ titre: `${MARQUEUR} Créé par l’admin`, nbMaxFichiers: 3 }))
        .expect(201);
      expect(res.body).toMatchObject({ statut: 'BROUILLON', nbMaxFichiers: 3 });
    });

    it('404 pour un module inconnu, 400 pour un identifiant mal formé', async () => {
      await api('post', `/modules/${UUID_INCONNU}/ateliers`, tokenFormateur)
        .send(corps())
        .expect(404);
      await api('post', `/modules/pas-un-uuid/ateliers`, tokenFormateur).send(corps()).expect(400);
    });

    it('409 dans une formation archivée', async () => {
      await api('post', `/modules/${moduleArchiveId}/ateliers`, tokenFormateur)
        .send(corps({ titre: `${MARQUEUR} Archivé` }))
        .expect(409);
    });
  });

  // ===================================================================
  //  Consultation
  // ===================================================================

  describe('Lister et consulter', () => {
    it('liste les ateliers du module, du plus ancien au plus récent, sans énoncé', async () => {
      const res = await api('get', `/modules/${moduleId}/ateliers`, tokenFormateur).expect(200);

      expect(res.body.map((a: { titre: string }) => a.titre)).toEqual([
        `${MARQUEUR} API REST sécurisée`,
        `${MARQUEUR} Créé par l’admin`,
      ]);
      expect(res.body[0]).not.toHaveProperty('enonce');
    });

    it('renvoie la fiche complète au formateur affecté', async () => {
      const res = await api('get', `/ateliers/${atelierId}`, tokenFormateur).expect(200);
      expect(res.body).toMatchObject({ id: atelierId, formationId, enonce: expect.any(String) });
    });

    it('403 pour un formateur non affecté et pour un apprenant ; 404 pour un atelier inconnu', async () => {
      await api('get', `/ateliers/${atelierId}`, tokenAutre).expect(403);
      await api('get', `/ateliers/${atelierId}`, tokenApprenant).expect(403);
      await api('get', `/modules/${moduleId}/ateliers`, tokenApprenant).expect(403);
      await api('get', `/ateliers/${UUID_INCONNU}`, tokenFormateur).expect(404);

      const refus = await auditLogRepository.find({
        where: { action: 'ACCES_RESSOURCE_REFUSE', cible: formationId },
      });
      expect(refus.some((r) => r.detailsAvantApres?.ressource === 'atelier')).toBe(true);
    });
  });

  // ===================================================================
  //  Modification et suppression en brouillon
  // ===================================================================

  describe('Modifier un brouillon', () => {
    it('200 : n’écrit que ce qui change et trace ATELIER_MODIFIE (avant/après)', async () => {
      const res = await api('patch', `/ateliers/${atelierId}`, tokenFormateur)
        .send({ tailleMaxMo: 50, typesLivrables: ['pdf', 'zip'], competencesVisees: null })
        .expect(200);

      expect(res.body).toMatchObject({ tailleMaxMo: 50, competencesVisees: null });
      const traces = await auditLogRepository.find({
        where: { action: 'ATELIER_MODIFIE', cible: atelierId },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].detailsAvantApres).toEqual({
        avant: { tailleMaxMo: 20, competencesVisees: 'Sécurité des API' },
        apres: { tailleMaxMo: 50, competencesVisees: null },
      });
    });

    it('400 pour une nouvelle date limite passée, un corps vide ou un titre vidé', async () => {
      await api('patch', `/ateliers/${atelierId}`, tokenFormateur)
        .send({ dateLimite: hier })
        .expect(400);
      await api('patch', `/ateliers/${atelierId}`, tokenFormateur).send({}).expect(400);
      await api('patch', `/ateliers/${atelierId}`, tokenFormateur)
        .send({ titre: null })
        .expect(400);

      const atelier = await atelierRepository.findOneByOrFail({ id: atelierId });
      expect(atelier.dateLimite.toISOString()).toBe(dansUnMois);
    });

    it('403 pour un formateur non affecté', async () => {
      await api('patch', `/ateliers/${atelierId}`, tokenAutre).send({ tailleMaxMo: 5 }).expect(403);
      await api('delete', `/ateliers/${atelierId}`, tokenAutre).expect(403);
    });
  });

  describe('Hors brouillon et module', () => {
    it('un module qui porte un atelier ne se supprime pas (409)', async () => {
      await api(
        'delete',
        `/admin/formations/${formationId}/modules/${moduleId}`,
        tokenAdmin,
      ).expect(409);
    });

    it('409 pour modifier ou supprimer un atelier qui n’est plus en brouillon', async () => {
      await dataSource.query(`UPDATE ateliers SET statut = 'PUBLIE' WHERE id = $1`, [atelierId]);

      const res = await api('patch', `/ateliers/${atelierId}`, tokenFormateur)
        .send({ titre: `${MARQUEUR} Trop tard` })
        .expect(409);
      expect(res.body.message).toBe('Seul un atelier en brouillon peut être modifié.');
      await api('delete', `/ateliers/${atelierId}`, tokenFormateur).expect(409);

      await dataSource.query(`UPDATE ateliers SET statut = 'BROUILLON' WHERE id = $1`, [atelierId]);
    });

    it('204 : supprime un brouillon et trace ATELIER_SUPPRIME ; ensuite 404', async () => {
      await api('delete', `/ateliers/${atelierId}`, tokenFormateur).expect(204);

      const traces = await auditLogRepository.find({
        where: { action: 'ATELIER_SUPPRIME', cible: atelierId },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].detailsAvantApres).toMatchObject({ formationId, moduleId });
      await api('get', `/ateliers/${atelierId}`, tokenFormateur).expect(404);
    });
  });
});
