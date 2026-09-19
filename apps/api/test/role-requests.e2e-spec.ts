import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { DemandeRole } from '../src/database/entities/demande-role.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutDemande } from '../src/database/enums/statut-demande.enum';

/**
 * Tests d'intégration US-ROL-02 — Demande de changement de rôle.
 *
 * Couvre les critères d'acceptation de bout en bout :
 *  - création : 201 EN_ATTENTE ; 400 rôle déjà détenu ; 409 demande déjà en
 *    attente ; 401 sans token ;
 *  - GET /admin/role-requests : 403 non-admin, 200 admin (avec demandeur) ;
 *  - approbation : rôle de la cible changé + demande APPROUVEE + audit
 *    ROLE_CHANGE présent (UNE fois) ; 409 si déjà traitée ;
 *  - rejet : REJETEE + audit DEMANDE_ROLE_TRAITEE ; 400 sans motif.
 *
 * Teardown : demandes_role (pas de trigger -> DELETE normal), puis audit_logs
 * via le bypass maintenance (GUC app.audit_maintenance dans une transaction),
 * puis les utilisateurs de test.
 */
describe('Role requests (e2e) — US-ROL-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let demandeRepository: Repository<DemandeRole>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const EMAIL_ADMIN = 'e2e-rr-admin@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-rr-appr@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-rr-form@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_APPRENANT, EMAIL_FORMATEUR];

  let adminId: string;
  let apprenantId: string;
  let formateurId: string;
  let demandeApprenantId: string;
  let demandeFormateurId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

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
    demandeRepository = moduleRef.get<Repository<DemandeRole>>(
      getRepositoryToken(DemandeRole),
      { strict: false },
    );
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(
      getRepositoryToken(AuditLog),
    );
    dataSource = moduleRef.get(DataSource, { strict: false });

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, appr, form] = await userRepository.save([
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
      userRepository.create({
        email: EMAIL_FORMATEUR,
        motDePasseHash,
        role: Role.FORMATEUR,
        statut: StatutCompte.ACTIF,
      }),
    ]);
    adminId = admin.id;
    apprenantId = appr.id;
    formateurId = form.id;
  });

  afterAll(async () => {
    const ids = [adminId, apprenantId, formateurId].filter(Boolean);
    await demandeRepository.delete({ userId: In(ids) });
    await purgeAudit(ids);
    await userRepository.delete({ email: In(ALL_EMAILS) });
    await app.close();
  });

  // ---- Création (utilisateur) ----

  it('401 sans token', async () => {
    await request(app.getHttpServer())
      .post('/api/role-requests')
      .send({ roleDemande: 'FORMATEUR', justification: 'x' })
      .expect(401);
  });

  it('201 crée une demande EN_ATTENTE (apprenant -> FORMATEUR)', async () => {
    const token = await login(EMAIL_APPRENANT);
    const res = await request(app.getHttpServer())
      .post('/api/role-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleDemande: 'FORMATEUR', justification: 'Je veux évaluer les TP.' })
      .expect(201);
    expect(res.body.statut).toBe(StatutDemande.EN_ATTENTE);
    demandeApprenantId = res.body.id;
  });

  it('409 si une demande est déjà en attente', async () => {
    const token = await login(EMAIL_APPRENANT);
    await request(app.getHttpServer())
      .post('/api/role-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleDemande: 'ADMINISTRATEUR', justification: 'encore' })
      .expect(409);
  });

  it('400 si l’utilisateur possède déjà le rôle demandé (formateur -> FORMATEUR)', async () => {
    const token = await login(EMAIL_FORMATEUR);
    await request(app.getHttpServer())
      .post('/api/role-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleDemande: 'FORMATEUR', justification: 'x' })
      .expect(400);
  });

  it('GET /role-requests/me renvoie mes demandes', async () => {
    const token = await login(EMAIL_APPRENANT);
    const res = await request(app.getHttpServer())
      .get('/api/role-requests/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  // ---- Consultation admin ----

  it('403 pour un non-admin sur GET /admin/role-requests', async () => {
    const token = await login(EMAIL_APPRENANT);
    await request(app.getHttpServer())
      .get('/api/admin/role-requests')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('200 pour un admin, avec l’identité du demandeur', async () => {
    const token = await login(EMAIL_ADMIN);
    const res = await request(app.getHttpServer())
      .get('/api/admin/role-requests?statut=EN_ATTENTE')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('items');
    const item = res.body.items.find(
      (d: { id: string }) => d.id === demandeApprenantId,
    );
    expect(item).toBeDefined();
    expect(item.demandeur.email).toBe(EMAIL_APPRENANT);
  });

  // ---- Approbation ----

  it('approuve : rôle cible changé + demande APPROUVEE + audit ROLE_CHANGE', async () => {
    const token = await login(EMAIL_ADMIN);
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/role-requests/${demandeApprenantId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.statut).toBe(StatutDemande.APPROUVEE);
    expect(res.body.traitePar).toBe(adminId);

    // Rôle de la cible réellement changé.
    const cible = await userRepository.findOne({ where: { id: apprenantId } });
    expect(cible?.role).toBe(Role.FORMATEUR);

    // Audit ROLE_CHANGE émis UNE fois (par le cœur ROL-01) pour cette cible.
    const audits = await auditLogRepository.find({
      where: { action: 'ROLE_CHANGE', cible: apprenantId },
    });
    expect(audits.length).toBe(1);
  });

  it('409 si on ré-approuve une demande déjà traitée', async () => {
    const token = await login(EMAIL_ADMIN);
    await request(app.getHttpServer())
      .patch(`/api/admin/role-requests/${demandeApprenantId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  // ---- Rejet ----

  it('400 si le motif de rejet est manquant', async () => {
    // Nouvelle demande (le formateur demande ADMINISTRATEUR).
    const tokenForm = await login(EMAIL_FORMATEUR);
    const cree = await request(app.getHttpServer())
      .post('/api/role-requests')
      .set('Authorization', `Bearer ${tokenForm}`)
      .send({ roleDemande: 'ADMINISTRATEUR', justification: 'Je veux administrer.' })
      .expect(201);
    demandeFormateurId = cree.body.id;

    const tokenAdmin = await login(EMAIL_ADMIN);
    await request(app.getHttpServer())
      .patch(`/api/admin/role-requests/${demandeFormateurId}/reject`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({})
      .expect(400);
  });

  it('rejette : demande REJETEE + audit DEMANDE_ROLE_TRAITEE', async () => {
    const token = await login(EMAIL_ADMIN);
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/role-requests/${demandeFormateurId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motif: 'Dossier incomplet.' })
      .expect(200);
    expect(res.body.statut).toBe(StatutDemande.REJETEE);
    expect(res.body.motif).toBe('Dossier incomplet.');

    // Le rôle du formateur n'a PAS changé (un rejet ne touche pas le compte).
    const form = await userRepository.findOne({ where: { id: formateurId } });
    expect(form?.role).toBe(Role.FORMATEUR);

    // Audit de la décision de rejet présent.
    const audits = await auditLogRepository.find({
      where: { action: 'DEMANDE_ROLE_TRAITEE', cible: formateurId },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });
});
