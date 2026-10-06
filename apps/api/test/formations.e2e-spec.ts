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
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';

/**
 * Tests d'intégration US-FORM-01 — Créer et consulter une formation.
 *
 * Couvre les critères d'acceptation de bout en bout :
 *  - création : 401 sans token ; 403 non-admin ; 400 sur capacité ≤ 0, seuil
 *    hors [0,100], titre vide, dates incohérentes, champ inconnu (statut) ;
 *    201 -> statut OUVERTE + audit FORMATION_CREEE ;
 *  - catalogue : la formation créée est visible d'un apprenant ; une formation
 *    FERMEE ne l'est que de l'administrateur (liste filtrée, 404 au détail,
 *    403 si l'apprenant demande explicitement un autre statut) ;
 *  - détail : modules triés par ordre ; 400 UUID mal formé ; 404 inconnu.
 *
 * Teardown : formations de test (marqueur de titre ; CASCADE sur les modules),
 * puis audit_logs via le bypass maintenance, puis les utilisateurs de test.
 */
describe('Formations (e2e) — US-FORM-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let formationRepository: Repository<Formation>;
  let moduleRepository: Repository<ModuleFormation>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-FORM01';
  const EMAIL_ADMIN = 'e2e-form01-admin@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-form01-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_APPRENANT];

  let adminId: string;
  let tokenAdmin: string;
  let tokenApprenant: string;
  let formationId: string;
  let formationFermeeId: string;

  const valide = {
    titre: `${MARQUEUR} Full-Stack JS`,
    description: 'Parcours certifiant.',
    objectifs: 'Concevoir une API REST sécurisée.',
    dateDebut: '2026-11-02',
    dateFin: '2026-12-18',
    dureeHeures: 120,
    capaciteMax: 25,
    noteMinCertification: 60,
    modeleCertificat: 'modele-esprit-standard',
  };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const creer = (token: string, corps: Record<string, unknown>): request.Test =>
    request(app.getHttpServer())
      .post('/api/admin/formations')
      .set('Authorization', `Bearer ${token}`)
      .send(corps);

  // Purge des audit logs de test en contournant le trigger d'immuabilité.
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

  // Rejouable : appelé avant ET après la suite (un run interrompu ne bloque
  // pas le suivant).
  const nettoyer = async (): Promise<void> => {
    const formations = await formationRepository.find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    await formationRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurs.map((u) => u.id)]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(
      getRepositoryToken(AuditLog),
    );
    dataSource = moduleRef.get(DataSource, { strict: false });
    formationRepository = dataSource.getRepository(Formation);
    moduleRepository = dataSource.getRepository(ModuleFormation);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin] = await userRepository.save([
      userRepository.create({
        email: EMAIL_ADMIN,
        motDePasseHash,
        role: Role.ADMINISTRATEUR,
        statut: StatutCompte.ACTIF,
      }),
      userRepository.create({
        email: EMAIL_APPRENANT,
        motDePasseHash,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
      }),
    ]);
    adminId = admin.id;
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenApprenant = await login(EMAIL_APPRENANT);
  });

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  // ---- Création : contrôle d'accès ----

  it('401 sans token', async () => {
    await request(app.getHttpServer()).post('/api/admin/formations').send(valide).expect(401);
  });

  it('403 pour un non-admin', async () => {
    await creer(tokenApprenant, valide).expect(403);
  });

  // ---- Création : validation (Gherkin « paramètres incohérents ») ----

  it('400 si la capacité est ≤ 0', async () => {
    const res = await creer(tokenAdmin, { ...valide, capaciteMax: 0 }).expect(400);
    expect(res.body.message).toContain('La capacité doit être supérieure à 0.');
  });

  it('400 si le seuil de certification est hors [0,100]', async () => {
    const res = await creer(tokenAdmin, { ...valide, noteMinCertification: 101 }).expect(400);
    expect(res.body.message).toContain(
      'Le seuil de certification doit être compris entre 0 et 100.',
    );
  });

  it('400 si le titre est vide ou fait d’espaces', async () => {
    await creer(tokenAdmin, { ...valide, titre: '   ' }).expect(400);
  });

  it('400 si la date de fin précède la date de début', async () => {
    await creer(tokenAdmin, {
      ...valide,
      dateDebut: '2026-12-18',
      dateFin: '2026-11-02',
    }).expect(400);
  });

  it('400 si le client tente d’imposer le statut (champ non autorisé)', async () => {
    await creer(tokenAdmin, { ...valide, statut: StatutFormation.ARCHIVEE }).expect(400);
  });

  it('n’a rien créé après les requêtes refusées', async () => {
    expect(await formationRepository.countBy({ titre: Like(`${MARQUEUR}%`) })).toBe(0);
  });

  // ---- Création : nominal ----

  it('201 crée la formation au statut OUVERTE', async () => {
    const res = await creer(tokenAdmin, valide).expect(201);

    expect(res.body).toMatchObject({
      titre: valide.titre,
      statut: StatutFormation.OUVERTE,
      capaciteMax: 25,
      noteMinCertification: 60,
      dateDebut: '2026-11-02',
      dateFin: '2026-12-18',
      prerequis: null,
    });
    formationId = res.body.id;

    const enBase = await formationRepository.findOneByOrFail({ id: formationId });
    expect(enBase.statut).toBe(StatutFormation.OUVERTE);
  });

  it('journalise FORMATION_CREEE (acteur = admin, cible = formation)', async () => {
    const audits = await auditLogRepository.find({
      where: { action: 'FORMATION_CREEE', cible: formationId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBe(adminId);
    expect(audits[0].resultat).toBe('Succès');
  });

  // ---- Catalogue ----

  it('la formation créée est visible au catalogue pour un apprenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/formations?limit=100')
      .set('Authorization', `Bearer ${tokenApprenant}`)
      .expect(200);

    expect(res.body).toMatchObject({ page: 1, limit: 100 });
    const item = res.body.items.find((f: { id: string }) => f.id === formationId);
    expect(item).toBeDefined();
    expect(item.statut).toBe(StatutFormation.OUVERTE);
  });

  it('401 sur le catalogue sans token', async () => {
    await request(app.getHttpServer()).get('/api/formations').expect(401);
  });

  it('une formation FERMEE est masquée à l’apprenant mais visible de l’admin', async () => {
    const fermee = await formationRepository.save(
      formationRepository.create({
        titre: `${MARQUEUR} formation fermée`,
        capaciteMax: 10,
        noteMinCertification: 50,
        statut: StatutFormation.FERMEE,
      }),
    );
    formationFermeeId = fermee.id;

    const vueApprenant = await request(app.getHttpServer())
      .get('/api/formations?limit=100')
      .set('Authorization', `Bearer ${tokenApprenant}`)
      .expect(200);
    const idsApprenant = vueApprenant.body.items.map((f: { id: string }) => f.id);
    expect(idsApprenant).not.toContain(formationFermeeId);

    const vueAdmin = await request(app.getHttpServer())
      .get('/api/formations?statut=FERMEE&limit=100')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const idsAdmin = vueAdmin.body.items.map((f: { id: string }) => f.id);
    expect(idsAdmin).toContain(formationFermeeId);
    expect(idsAdmin).not.toContain(formationId);
  });

  it('403 si un apprenant filtre sur un statut non ouvert', async () => {
    await request(app.getHttpServer())
      .get('/api/formations?statut=FERMEE')
      .set('Authorization', `Bearer ${tokenApprenant}`)
      .expect(403);
  });

  it('400 sur un filtre de statut inconnu', async () => {
    await request(app.getHttpServer())
      .get('/api/formations?statut=INCONNU')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(400);
  });

  // ---- Détail ----

  it('détail : renvoie les modules triés par ordre', async () => {
    await moduleRepository.save([
      moduleRepository.create({ formationId, titre: 'Sécurité', ordre: 2 }),
      moduleRepository.create({ formationId, titre: 'Introduction', ordre: 1 }),
    ]);

    const res = await request(app.getHttpServer())
      .get(`/api/formations/${formationId}`)
      .set('Authorization', `Bearer ${tokenApprenant}`)
      .expect(200);

    expect(res.body.id).toBe(formationId);
    expect(res.body.modules.map((m: { titre: string }) => m.titre)).toEqual([
      'Introduction',
      'Sécurité',
    ]);
  });

  it('détail d’une formation FERMEE : 404 pour l’apprenant, 200 pour l’admin', async () => {
    await request(app.getHttpServer())
      .get(`/api/formations/${formationFermeeId}`)
      .set('Authorization', `Bearer ${tokenApprenant}`)
      .expect(404);

    const res = await request(app.getHttpServer())
      .get(`/api/formations/${formationFermeeId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(res.body.statut).toBe(StatutFormation.FERMEE);
    expect(res.body.modules).toEqual([]);
  });

  it('400 si l’identifiant n’est pas un UUID, 404 s’il est inconnu', async () => {
    await request(app.getHttpServer())
      .get('/api/formations/pas-un-uuid')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/formations/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(404);
  });
});
