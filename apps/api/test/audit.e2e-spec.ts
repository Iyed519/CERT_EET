import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';

/**
 * Tests d'intégration US-AUTH-12 — Journal d'audit immuable.
 *
 * Couvre les critères d'acceptation de bout en bout :
 *  - une action sensible (LOGIN) écrit UNE entrée d'audit (INSERT autorisé) ;
 *  - UPDATE/DELETE SQL direct sur audit_logs -> rejeté par le trigger BDD ;
 *  - GET /admin/audit-logs : 401 sans token, 403 non-admin, 200 admin avec
 *    filtres + pagination + tri horodatage DESC, 400 sur filtre invalide ;
 *  - la consultation est elle-même tracée (AUDIT_CONSULTE, via l'intercepteur) ;
 *  - export CSV : 200 admin (text/csv, pièce jointe), 403 non-admin.
 *
 * Le trigger d'immuabilité étant actif, le teardown des audit logs de test
 * passe par le bypass maintenance (GUC app.audit_maintenance), encadré par une
 * transaction (SET LOCAL -> reset automatique au COMMIT).
 */
describe('Audit (e2e) — US-AUTH-12', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const EMAIL_ADMIN = 'e2e-audit-admin@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-audit-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_APPRENANT];

  let adminId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  // L'intercepteur écrit l'audit APRÈS la réponse (best-effort) : on attend
  // qu'une entrée correspondant au filtre apparaisse (polling court).
  const attendreAudit = async (
    where: FindOptionsWhere<AuditLog>,
    essais = 20,
    delaiMs = 100,
  ): Promise<AuditLog[]> => {
    for (let i = 0; i < essais; i += 1) {
      const rows = await auditLogRepository.find({ where });
      if (rows.length > 0) {
        return rows;
      }
      await new Promise((resolve) => setTimeout(resolve, delaiMs));
    }
    return [];
  };

  // Purge des audit logs de test en contournant le trigger d'immuabilité :
  // SET LOCAL app.audit_maintenance='on' dans une transaction (reset au COMMIT).
  const purgeAuditFor = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [ids]);
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
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });

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
  });

  afterAll(async () => {
    const testUsers = await userRepository.find({
      where: ALL_EMAILS.map((email) => ({ email })),
    });
    // 1) purge des audit logs (bypass trigger) AVANT de supprimer les users.
    await purgeAuditFor(testUsers.map((u) => u.id));
    // 2) suppression des utilisateurs de test (users n'a pas de trigger).
    for (const email of ALL_EMAILS) {
      await userRepository.delete({ email });
    }
    await app.close();
  });

  // ---- Écriture (INSERT autorisé) ----
  it('une action sensible (LOGIN) écrit une entrée d audit', async () => {
    await login(EMAIL_ADMIN);
    const rows = await auditLogRepository.find({
      where: { userId: adminId, action: 'LOGIN' },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].resultat).toBe('Succès');
  });

  // ---- Immuabilité (trigger BDD) ----
  it('UPDATE/DELETE SQL direct sur audit_logs est rejeté par le trigger', async () => {
    // On s'assure qu'une ligne existe (sinon on en insère une — INSERT autorisé).
    let row = await auditLogRepository.findOne({
      where: { userId: adminId },
      order: { horodatage: 'DESC' },
    });
    if (!row) {
      row = await auditLogRepository.save(
        auditLogRepository.create({
          userId: adminId,
          action: 'SEED',
          resultat: 'Succès',
        }),
      );
    }

    await expect(
      dataSource.query("UPDATE audit_logs SET resultat = 'HACK' WHERE id = $1", [row.id]),
    ).rejects.toThrow(/immuable/i);

    await expect(
      dataSource.query('DELETE FROM audit_logs WHERE id = $1', [row.id]),
    ).rejects.toThrow(/immuable/i);
  });

  // ---- Consultation : RBAC ----
  it('GET /api/admin/audit-logs -> 401 sans token', () => {
    return request(app.getHttpServer()).get('/api/admin/audit-logs').expect(401);
  });

  it('GET /api/admin/audit-logs -> 403 pour un non-admin', async () => {
    const token = await login(EMAIL_APPRENANT);
    await request(app.getHttpServer())
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  // ---- Consultation : filtres + pagination + tri ----
  it('GET /api/admin/audit-logs -> 200 admin : filtre action, pagination, tri DESC', async () => {
    const token = await login(EMAIL_ADMIN);
    const res = await request(app.getHttpServer())
      .get('/api/admin/audit-logs?action=LOGIN&page=1&limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(5);
    expect(res.body.items.length).toBeLessThanOrEqual(5);

    // Filtre respecté.
    for (const item of res.body.items) {
      expect(item.action).toBe('LOGIN');
    }
    // Tri horodatage DESC.
    const times = res.body.items.map((i: { horodatage: string }) =>
      new Date(i.horodatage).getTime(),
    );
    const sorted = [...times].sort((a: number, b: number) => b - a);
    expect(times).toEqual(sorted);
  });

  it('GET /api/admin/audit-logs -> 400 si userId n est pas un UUID', async () => {
    const token = await login(EMAIL_ADMIN);
    await request(app.getHttpServer())
      .get('/api/admin/audit-logs?userId=pas-un-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  // ---- La consultation est elle-même tracée (intercepteur @Audit) ----
  it('la consultation du journal est tracée (AUDIT_CONSULTE)', async () => {
    const token = await login(EMAIL_ADMIN);
    await request(app.getHttpServer())
      .get('/api/admin/audit-logs?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rows = await attendreAudit({
      userId: adminId,
      action: 'AUDIT_CONSULTE',
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  // ---- Export CSV ----
  it('GET /api/admin/audit-logs/export -> 200 CSV pour un admin', async () => {
    const token = await login(EMAIL_ADMIN);
    const res = await request(app.getHttpServer())
      .get('/api/admin/audit-logs/export?action=LOGIN')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    // En-tête de colonnes présent (le BOM UTF-8 précède, toContain reste vrai).
    expect(res.text).toContain(
      'horodatage,action,acteur,acteur_email,cible,adresse_ip,resultat,details',
    );
  });

  it('GET /api/admin/audit-logs/export -> 403 pour un non-admin', async () => {
    const token = await login(EMAIL_APPRENANT);
    await request(app.getHttpServer())
      .get('/api/admin/audit-logs/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
