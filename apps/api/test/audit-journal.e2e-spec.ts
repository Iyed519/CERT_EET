import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { MESSAGE_PERIODE_INVALIDE } from '../src/modules/audit/audit.service';

/**
 * Tests d'intégration US-AUDIT-01 — Consulter le journal d'audit (DS-16 P5).
 *
 * Complète la suite US-AUTH-12 (écriture, trigger, RBAC, export) :
 *  - filtres acteur (email contient, sans casse, jokers LIKE neutralisés),
 *    cible exacte, résultat, période ; combinaison des filtres ;
 *  - période inversée -> 400 (liste ET export) ; résultat hors liste -> 400 ;
 *  - l'acteur est joint en liste blanche (jamais le hash du mot de passe) ;
 *  - GET /admin/audit-logs/actions : actions distinctes triées (admin seul) ;
 *  - export CSV : colonne acteur_email, mêmes filtres ;
 *  - lecture seule : aucune route PUT / PATCH / DELETE / POST ;
 *  - concurrence : N consultations simultanées -> N traces AUDIT_CONSULTE.
 *
 * Marqueur `E2E-AUDIT01` dans les cibles et les emails : la suite ne lit que
 * ses propres lignes, même quand d'autres suites écrivent en parallèle.
 */
describe('Journal d audit (e2e) — US-AUDIT-01', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MARQUEUR = 'E2E-AUDIT01';
  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const EMAIL_ADMIN = 'e2e-audit01-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-audit01-form@cert-eet.local';
  const EMAIL_JOKER = 'e2e-audit01-x_y@cert-eet.local';
  const EMAIL_JOKER_LEURRE = 'e2e-audit01-xzy@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_FORMATEUR, EMAIL_JOKER, EMAIL_JOKER_LEURRE];

  let adminId: string;
  let formateurId: string;
  let jokerId: string;
  let leurreId: string;
  let tokenAdmin: string;
  let tokenFormateur: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const lister = (qs: string, token = tokenAdmin) =>
    request(app.getHttpServer())
      .get(`/api/admin/audit-logs?${qs}`)
      .set('Authorization', `Bearer ${token}`);

  const inserer = (
    userId: string | null,
    action: string,
    cible: string,
    resultat: string,
    horodatage: string,
  ) =>
    dataSource.query(
      `INSERT INTO audit_logs (user_id, action, cible, resultat, horodatage)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, cible, resultat, horodatage],
    );

  const purge = async (): Promise<void> => {
    const ids = [adminId, formateurId, jokerId, leurreId].filter(Boolean);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible LIKE $2', [
        ids,
        `${MARQUEUR}%`,
      ]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
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

    userRepository = moduleRef.get(getRepositoryToken(User));
    auditLogRepository = moduleRef.get(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });

    for (const email of ALL_EMAILS) {
      await userRepository.delete({ email });
    }
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, formateur, joker, leurre] = await userRepository.save([
      userRepository.create({
        email: EMAIL_ADMIN,
        motDePasseHash,
        prenom: 'Amel',
        nom: 'Audit',
        role: Role.ADMINISTRATEUR,
        statut: StatutCompte.ACTIF,
      }),
      userRepository.create({
        email: EMAIL_FORMATEUR,
        motDePasseHash,
        prenom: 'Farès',
        nom: 'Formateur',
        role: Role.FORMATEUR,
        statut: StatutCompte.ACTIF,
      }),
      userRepository.create({
        email: EMAIL_JOKER,
        motDePasseHash,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
      }),
      userRepository.create({
        email: EMAIL_JOKER_LEURRE,
        motDePasseHash,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
      }),
    ]);
    adminId = admin.id;
    formateurId = formateur.id;
    jokerId = joker.id;
    leurreId = leurre.id;

    // Jeu de données daté (janvier 2026), distinct des traces « du jour ».
    await inserer(
      formateurId,
      'ATELIER_CREE',
      `${MARQUEUR}-atelier-1`,
      'Succès',
      '2026-01-10T09:00:00Z',
    );
    await inserer(
      formateurId,
      'ATELIER_PUBLIE',
      `${MARQUEUR}-atelier-1`,
      'Succès',
      '2026-01-12T09:00:00Z',
    );
    await inserer(
      formateurId,
      'ATELIER_PUBLIE',
      `${MARQUEUR}-atelier-2`,
      'Échec',
      '2026-01-20T09:00:00Z',
    );
    await inserer(jokerId, 'LOGIN', `${MARQUEUR}-joker`, 'Succès', '2026-01-15T09:00:00Z');
    await inserer(leurreId, 'LOGIN', `${MARQUEUR}-leurre`, 'Succès', '2026-01-15T10:00:00Z');
    await inserer(
      null,
      'CERTIFICAT_VERIFIE',
      `${MARQUEUR}-anonyme`,
      'Succès',
      '2026-01-16T09:00:00Z',
    );

    tokenAdmin = await login(EMAIL_ADMIN);
    tokenFormateur = await login(EMAIL_FORMATEUR);
  });

  afterAll(async () => {
    await purge();
    for (const email of ALL_EMAILS) {
      await userRepository.delete({ email });
    }
    await app.close();
  });

  // ---- Filtres ----
  it('filtre acteur : email « contient », sans casse ; acteur joint en liste blanche', async () => {
    const res = await lister(
      `acteur=E2E-AUDIT01-FORM&from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z`,
    ).expect(200);

    expect(res.body.total).toBe(3);
    for (const item of res.body.items) {
      expect(item.userId).toBe(formateurId);
      expect(item.acteur).toEqual({
        id: formateurId,
        email: EMAIL_FORMATEUR,
        prenom: 'Farès',
        nom: 'Formateur',
        role: Role.FORMATEUR,
      });
    }
    // Aucune fuite de colonnes sensibles de users.
    expect(JSON.stringify(res.body)).not.toMatch(/motDePasse|mot_de_passe|mfa/i);
  });

  it('filtre acteur : « _ » est un caractère, pas un joker LIKE', async () => {
    const res = await lister('acteur=audit01-x_y').expect(200);
    const cibles = res.body.items.map((i: { cible: string }) => i.cible);
    expect(cibles).toContain(`${MARQUEUR}-joker`);
    expect(cibles).not.toContain(`${MARQUEUR}-leurre`);
  });

  it('filtre cible exacte (et non « commence par »)', async () => {
    const res = await lister(`cible=${MARQUEUR}-atelier-1`).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i: { action: string }) => i.action)).toEqual([
      'ATELIER_PUBLIE',
      'ATELIER_CREE',
    ]); // tri horodatage DESC

    const partiel = await lister(`cible=${MARQUEUR}-atelier`).expect(200);
    expect(partiel.body.total).toBe(0);
  });

  it('filtre résultat + action + période combinés', async () => {
    const res = await lister(
      `action=ATELIER_PUBLIE&resultat=${encodeURIComponent('Échec')}&acteur=e2e-audit01-form` +
        '&from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
    ).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].cible).toBe(`${MARQUEUR}-atelier-2`);
    expect(res.body.items[0].resultat).toBe('Échec');
  });

  it('période : bornes incluses ; dehors -> exclu', async () => {
    const inclus = await lister(
      `acteur=e2e-audit01-form&from=2026-01-12T09:00:00Z&to=2026-01-20T09:00:00Z`,
    ).expect(200);
    expect(inclus.body.total).toBe(2);

    const exclu = await lister(
      `acteur=e2e-audit01-form&from=2026-01-12T09:00:01Z&to=2026-01-19T00:00:00Z`,
    ).expect(200);
    expect(exclu.body.total).toBe(0);
  });

  it('action anonyme (sans acteur) : acteur null, userId null', async () => {
    const res = await lister(`cible=${MARQUEUR}-anonyme`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId).toBeNull();
    expect(res.body.items[0].acteur).toBeNull();
  });

  it('pagination stable : deux pages de 2, sans recouvrement', async () => {
    const qs = 'acteur=e2e-audit01-form&from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z&limit=2';
    const p1 = await lister(`${qs}&page=1`).expect(200);
    const p2 = await lister(`${qs}&page=2`).expect(200);
    expect(p1.body.items).toHaveLength(2);
    expect(p2.body.items).toHaveLength(1);
    const ids1 = p1.body.items.map((i: { id: string }) => i.id);
    expect(ids1).not.toContain(p2.body.items[0].id);
  });

  // ---- Validation ----
  it('période inversée -> 400 (liste) avec message explicite', async () => {
    const res = await lister('from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z').expect(400);
    expect(res.body.message).toBe(MESSAGE_PERIODE_INVALIDE);
  });

  it('période inversée -> 400 (export)', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/audit-logs/export?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(400);
  });

  it('résultat hors liste -> 400', async () => {
    await lister('resultat=Peut-%C3%AAtre').expect(400);
  });

  it('acteur trop long (> 255) -> 400', async () => {
    await lister(`acteur=${'a'.repeat(256)}`).expect(400);
  });

  // ---- Liste des actions ----
  it('GET /admin/audit-logs/actions -> actions distinctes triées (admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/audit-logs/actions')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const actions: string[] = res.body;
    expect(actions).toEqual(
      expect.arrayContaining(['ATELIER_CREE', 'ATELIER_PUBLIE', 'CERTIFICAT_VERIFIE']),
    );
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual([...actions].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('GET /admin/audit-logs/actions -> 403 non-admin, 401 sans jeton', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/audit-logs/actions')
      .set('Authorization', `Bearer ${tokenFormateur}`)
      .expect(403);
    await request(app.getHttpServer()).get('/api/admin/audit-logs/actions').expect(401);
  });

  it('les filtres sont refusés à un non-admin (403 avant toute lecture)', async () => {
    await lister('acteur=e2e', tokenFormateur).expect(403);
  });

  // ---- Export ----
  it('export CSV : colonne acteur_email et mêmes filtres que la liste', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/audit-logs/export?cible=${MARQUEUR}-atelier-1`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const lignes = res.text.replace(/^﻿/, '').split('\r\n');
    expect(lignes[0]).toBe(
      'horodatage,action,acteur,acteur_email,cible,adresse_ip,resultat,details',
    );
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toContain(
      `ATELIER_PUBLIE,${formateurId},${EMAIL_FORMATEUR},${MARQUEUR}-atelier-1`,
    );
  });

  // ---- Lecture seule ----
  it.each(['put', 'patch', 'delete', 'post'] as const)(
    'aucune route %s sur le journal (404)',
    async (verbe) => {
      const ligne = await auditLogRepository.findOneByOrFail({
        cible: `${MARQUEUR}-atelier-1`,
        action: 'ATELIER_CREE',
      });
      await request(app.getHttpServer())
        [verbe]('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        [verbe](`/api/admin/audit-logs/${ligne.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ resultat: 'Échec' })
        .expect(404);
      const relue = await auditLogRepository.findOneByOrFail({ id: ligne.id });
      expect(relue.resultat).toBe('Succès');
    },
  );

  // ---- Concurrence ----
  it('concurrence : 8 consultations simultanées -> 8 traces AUDIT_CONSULTE', async () => {
    const avant = new Date();
    const reponses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => lister(`cible=${MARQUEUR}-atelier-1&page=${i + 1}`)),
    );
    for (const r of reponses) expect(r.status).toBe(200);

    let n = 0;
    for (let essai = 0; essai < 30; essai += 1) {
      const [{ count }] = await dataSource.query(
        `SELECT count(*)::int AS count FROM audit_logs
          WHERE user_id = $1 AND action = 'AUDIT_CONSULTE' AND horodatage >= $2`,
        [adminId, avant],
      );
      n = count;
      if (n >= 8) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(n).toBe(8);
  });
});
