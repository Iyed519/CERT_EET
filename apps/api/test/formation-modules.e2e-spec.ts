import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';

/**
 * Tests d'intégration US-FORM-01 (suite) — Configurer une formation : la
 * modifier et gérer ses modules.
 *
 * Couvre de bout en bout :
 *  - PATCH /admin/formations/:id : contrôle d'accès, validations (corps vide,
 *    valeur invalide, champ obligatoire vidé, dates finales incohérentes,
 *    statut interdit), avant / après dans l'audit, capacité jamais sous le
 *    nombre d'inscrits, formation archivée figée ;
 *  - modules : ajout en fin de liste, modification, réordonnancement complet,
 *    suppression avec renumérotation, refus si le module porte une
 *    évaluation, module d'une autre formation traité comme introuvable.
 *
 * Teardown rejouable (avant ET après) : QCM -> inscriptions -> formations
 * (CASCADE modules) -> audit (bypass maintenance) -> utilisateurs.
 */
describe('Formations — configuration et modules (e2e) — US-FORM-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let formationRepository: Repository<Formation>;
  let moduleRepository: Repository<ModuleFormation>;
  let inscriptionRepository: Repository<Inscription>;
  let qcmRepository: Repository<Qcm>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Je choisis un marqueur qui n'est le préfixe d'aucun autre : Jest lance les
  // suites e2e en parallèle, et le nettoyage par `LIKE 'E2E-FORM01%'` de
  // formations.e2e-spec.ts effacerait sinon les données de cette suite.
  const MARQUEUR = 'E2E-MODULES';
  const EMAIL_ADMIN = 'e2e-modules-admin@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-modules-appr1@cert-eet.local';
  const EMAIL_APPRENANT_2 = 'e2e-modules-appr2@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_APPRENANT, EMAIL_APPRENANT_2];

  let adminId: string;
  let apprenantId: string;
  let apprenant2Id: string;
  let tokenAdmin: string;
  let tokenApprenant: string;
  let formationId: string;
  let autreFormationId: string;
  let archiveeId: string;
  let moduleA: string;
  let moduleB: string;
  let moduleC: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const appel = (
    methode: 'post' | 'patch' | 'put' | 'delete' | 'get',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const ordreEnBase = async (id: string): Promise<string[]> =>
    (await moduleRepository.find({ where: { formationId: id }, order: { ordre: 'ASC' } })).map(
      (m) => `${m.ordre}:${m.titre}`,
    );

  const purgeAudit = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(
        'DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)',
        [ids],
      );
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  };

  const nettoyer = async (): Promise<void> => {
    const formations = await formationRepository.find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const formationIds = formations.map((f) => f.id);
    const userIds = utilisateurs.map((u) => u.id);

    await qcmRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    if (formationIds.length > 0) {
      await inscriptionRepository.delete({ formationId: In(formationIds) });
    }
    await formationRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formationIds, ...userIds]);
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
    dataSource = moduleRef.get(DataSource, { strict: false });
    formationRepository = dataSource.getRepository(Formation);
    moduleRepository = dataSource.getRepository(ModuleFormation);
    inscriptionRepository = dataSource.getRepository(Inscription);
    qcmRepository = dataSource.getRepository(Qcm);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, apprenant, apprenant2] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
        { email: EMAIL_APPRENANT_2, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    adminId = admin.id;
    apprenantId = apprenant.id;
    apprenant2Id = apprenant2.id;
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenApprenant = await login(EMAIL_APPRENANT);

    const cree = await appel('post', '/admin/formations', tokenAdmin)
      .send({
        titre: `${MARQUEUR} DevOps`,
        description: 'Version initiale.',
        dateDebut: '2026-11-02',
        dateFin: '2026-12-18',
        capaciteMax: 25,
        noteMinCertification: 60,
      })
      .expect(201);
    formationId = cree.body.id;

    const [autre, archivee] = await formationRepository.save([
      formationRepository.create({
        titre: `${MARQUEUR} autre formation`,
        capaciteMax: 10,
        noteMinCertification: 50,
      }),
      formationRepository.create({
        titre: `${MARQUEUR} formation archivée`,
        capaciteMax: 10,
        noteMinCertification: 50,
        statut: StatutFormation.ARCHIVEE,
      }),
    ]);
    autreFormationId = autre.id;
    archiveeId = archivee.id;
  });

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  // ===================================================================
  //  PATCH /admin/formations/:id
  // ===================================================================

  describe('Modifier une formation', () => {
    it('401 sans token, 403 pour un non-admin', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/formations/${formationId}`)
        .send({ capaciteMax: 30 })
        .expect(401);
      await appel('patch', `/admin/formations/${formationId}`, tokenApprenant)
        .send({ capaciteMax: 30 })
        .expect(403);
    });

    it('400 sur un corps vide, une valeur invalide ou un champ obligatoire vidé', async () => {
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin).send({}).expect(400);
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ capaciteMax: 0 })
        .expect(400);
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ noteMinCertification: 150 })
        .expect(400);
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ titre: null })
        .expect(400);
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ capaciteMax: null })
        .expect(400);
    });

    it('400 si le client tente de changer le statut par cette route', async () => {
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ statut: StatutFormation.ARCHIVEE })
        .expect(400);
    });

    it('400 si la nouvelle date de fin précède le début DÉJÀ enregistré', async () => {
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ dateFin: '2026-10-01' })
        .expect(400);
    });

    it('n’a rien modifié après les requêtes refusées', async () => {
      const enBase = await formationRepository.findOneByOrFail({ id: formationId });
      expect(enBase).toMatchObject({
        capaciteMax: 25,
        noteMinCertification: 60,
        dateFin: '2026-12-18',
        statut: StatutFormation.OUVERTE,
      });
    });

    it('200 modifie les champs fournis et trace l’avant / l’après', async () => {
      const res = await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ capaciteMax: 40, description: null, objectifs: 'Automatiser le déploiement.' })
        .expect(200);

      expect(res.body).toMatchObject({
        capaciteMax: 40,
        description: null,
        objectifs: 'Automatiser le déploiement.',
        // Champs non fournis : inchangés.
        noteMinCertification: 60,
        dateDebut: '2026-11-02',
      });

      const audits = await auditLogRepository.find({
        where: { action: 'FORMATION_MODIFIEE', cible: formationId },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].userId).toBe(adminId);
      expect(audits[0].detailsAvantApres).toEqual({
        avant: { capaciteMax: 25, description: 'Version initiale.', objectifs: null },
        apres: { capaciteMax: 40, description: null, objectifs: 'Automatiser le déploiement.' },
      });
    });

    it('200 sans nouvel audit quand la valeur envoyée est déjà en place', async () => {
      await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ capaciteMax: 40 })
        .expect(200);

      expect(
        await auditLogRepository.countBy({ action: 'FORMATION_MODIFIEE', cible: formationId }),
      ).toBe(1);
    });

    it('409 si la capacité demandée passe sous le nombre d’inscrits', async () => {
      await inscriptionRepository.save([
        inscriptionRepository.create({ apprenantId, formationId }),
        inscriptionRepository.create({ apprenantId: apprenant2Id, formationId }),
      ]);

      const refus = await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ capaciteMax: 1 })
        .expect(409);
      expect(refus.body.message).toContain('(2)');

      // Exactement le nombre d'inscrits : accepté.
      const ok = await appel('patch', `/admin/formations/${formationId}`, tokenAdmin)
        .send({ capaciteMax: 2 })
        .expect(200);
      expect(ok.body.capaciteMax).toBe(2);
    });

    it('404 sur une formation inconnue, 409 sur une formation archivée', async () => {
      await appel('patch', '/admin/formations/11111111-1111-4111-8111-111111111111', tokenAdmin)
        .send({ capaciteMax: 30 })
        .expect(404);
      await appel('patch', `/admin/formations/${archiveeId}`, tokenAdmin)
        .send({ capaciteMax: 30 })
        .expect(409);
    });
  });

  // ===================================================================
  //  Modules
  // ===================================================================

  describe('Gérer les modules', () => {
    const base = (): string => `/admin/formations/${formationId}/modules`;

    it('403 pour un non-admin, 404 sur une formation inconnue, 409 sur une archivée', async () => {
      await appel('post', base(), tokenApprenant).send({ titre: 'Intrus' }).expect(403);
      await appel(
        'post',
        '/admin/formations/11111111-1111-4111-8111-111111111111/modules',
        tokenAdmin,
      )
        .send({ titre: 'Nulle part' })
        .expect(404);
      await appel('post', `/admin/formations/${archiveeId}/modules`, tokenAdmin)
        .send({ titre: 'Trop tard' })
        .expect(409);
    });

    it('400 si le titre du module est vide', async () => {
      await appel('post', base(), tokenAdmin).send({ titre: '  ' }).expect(400);
      await appel('post', base(), tokenAdmin).send({ description: 'Sans titre' }).expect(400);
    });

    it('201 ajoute chaque module en fin de liste (ordre 1, 2, 3)', async () => {
      const a = await appel('post', base(), tokenAdmin)
        .send({ titre: 'Introduction', description: 'Panorama.' })
        .expect(201);
      const b = await appel('post', base(), tokenAdmin).send({ titre: 'Conteneurs' }).expect(201);
      const c = await appel('post', base(), tokenAdmin).send({ titre: 'CI/CD' }).expect(201);

      expect([a.body.ordre, b.body.ordre, c.body.ordre]).toEqual([1, 2, 3]);
      expect(a.body.description).toBe('Panorama.');
      expect(b.body.description).toBeNull();
      moduleA = a.body.id;
      moduleB = b.body.id;
      moduleC = c.body.id;

      expect(await auditLogRepository.countBy({ action: 'MODULE_CREE', cible: formationId })).toBe(
        3,
      );
    });

    it('200 modifie le titre d’un module sans changer son ordre', async () => {
      const res = await appel('patch', `${base()}/${moduleB}`, tokenAdmin)
        .send({ titre: 'Conteneurs & Docker' })
        .expect(200);
      expect(res.body).toMatchObject({ id: moduleB, titre: 'Conteneurs & Docker', ordre: 2 });
    });

    it('400 sur une modification vide ou un titre vidé', async () => {
      await appel('patch', `${base()}/${moduleB}`, tokenAdmin).send({}).expect(400);
      await appel('patch', `${base()}/${moduleB}`, tokenAdmin).send({ titre: null }).expect(400);
    });

    it('404 si le module est adressé via une AUTRE formation', async () => {
      await appel('patch', `/admin/formations/${autreFormationId}/modules/${moduleB}`, tokenAdmin)
        .send({ titre: 'Détourné' })
        .expect(404);
      await appel(
        'delete',
        `/admin/formations/${autreFormationId}/modules/${moduleB}`,
        tokenAdmin,
      ).expect(404);
      expect(await ordreEnBase(formationId)).toEqual([
        '1:Introduction',
        '2:Conteneurs & Docker',
        '3:CI/CD',
      ]);
    });

    it('200 réordonne tous les modules ; le détail les renvoie dans le nouvel ordre', async () => {
      const res = await appel('put', `${base()}/ordre`, tokenAdmin)
        .send({ moduleIds: [moduleC, moduleA, moduleB] })
        .expect(200);
      expect(res.body.map((m: { id: string; ordre: number }) => [m.id, m.ordre])).toEqual([
        [moduleC, 1],
        [moduleA, 2],
        [moduleB, 3],
      ]);

      const detail = await appel('get', `/formations/${formationId}`, tokenApprenant).expect(200);
      expect(detail.body.modules.map((m: { titre: string }) => m.titre)).toEqual([
        'CI/CD',
        'Introduction',
        'Conteneurs & Docker',
      ]);
    });

    it('400 si la liste de réordonnancement est incomplète, doublonnée ou étrangère', async () => {
      const [intrus] = await moduleRepository.save([
        moduleRepository.create({ formationId: autreFormationId, titre: 'Intrus', ordre: 1 }),
      ]);

      await appel('put', `${base()}/ordre`, tokenAdmin)
        .send({ moduleIds: [moduleA, moduleB] })
        .expect(400);
      await appel('put', `${base()}/ordre`, tokenAdmin)
        .send({ moduleIds: [moduleA, moduleA, moduleB] })
        .expect(400);
      await appel('put', `${base()}/ordre`, tokenAdmin)
        .send({ moduleIds: [moduleA, moduleB, intrus.id] })
        .expect(400);
      await appel('put', `${base()}/ordre`, tokenAdmin).send({ moduleIds: [] }).expect(400);

      // L'ordre précédent est intact, et le module de l'autre formation aussi.
      expect(await ordreEnBase(formationId)).toEqual([
        '1:CI/CD',
        '2:Introduction',
        '3:Conteneurs & Docker',
      ]);
      expect(await ordreEnBase(autreFormationId)).toEqual(['1:Intrus']);
    });

    it('409 si le module à supprimer porte déjà une évaluation', async () => {
      await qcmRepository.save(
        qcmRepository.create({ moduleId: moduleA, titre: `${MARQUEUR} QCM` }),
      );

      await appel('delete', `${base()}/${moduleA}`, tokenAdmin).expect(409);
      expect(await moduleRepository.countBy({ id: moduleA })).toBe(1);
    });

    it('204 supprime un module et renumérote les suivants sans trou', async () => {
      // Ordre courant : CI/CD (1), Introduction (2), Conteneurs & Docker (3).
      await appel('delete', `${base()}/${moduleC}`, tokenAdmin).expect(204);

      expect(await ordreEnBase(formationId)).toEqual([
        '1:Introduction',
        '2:Conteneurs & Docker',
      ]);
      expect(
        await auditLogRepository.countBy({ action: 'MODULE_SUPPRIME', cible: formationId }),
      ).toBe(1);

      // Un nouvel ajout repart bien de la fin de la liste renumérotée.
      const nouveau = await appel('post', base(), tokenAdmin).send({ titre: 'Bilan' }).expect(201);
      expect(nouveau.body.ordre).toBe(3);
    });
  });
});
