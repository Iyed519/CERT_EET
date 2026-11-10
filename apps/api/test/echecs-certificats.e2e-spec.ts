import { DeleteObjectsCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Certificat } from '../src/database/entities/certificat.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCertificat } from '../src/database/enums/statut-certificat.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { RepriseCertificatsService } from '../src/modules/certificats/reprise-certificats.service';
import { StockageService } from '../src/stockage/stockage.service';

/**
 * Tests d'intégration US-CERT-02 — Gestion des échecs de génération des
 * certificats, sur l'application réelle (PostgreSQL, Redis/BullMQ, S3).
 *
 * Couvre :
 *  - trois échecs (stockage en panne) : certificat EN_ATTENTE_GENERATION,
 *    rien dans le bucket, échec définitif daté, audit CERTIFICAT_ECHEC
 *    (alerte), UN email à chaque administrateur actif (pas aux désactivés) ;
 *  - supervision : filtre `enEchec=true`, 400 sur une autre valeur, 403
 *    apprenant ; relance -> échec effacé, ACTIF ;
 *  - idempotence et concurrence : 8 échecs définitifs simultanés -> 8 traces,
 *    une seule alerte ;
 *  - reprise d'un certificat bloqué EN_GENERATION depuis plus de 15 min :
 *    remis en attente, audit CERTIFICAT_REPRIS, régénéré (ACTIF) ; 4 reprises
 *    simultanées -> une seule ; un certificat récent n'est pas repris.
 *
 * Marqueur `E2E-CERTECHEC` ; emails `e2e-certechec-…`.
 */
describe('Échecs de génération des certificats (e2e) — US-CERT-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let certificats: CertificatsService;
  let reprise: RepriseCertificatsService;
  let stockage: StockageService;
  let alerte: jest.SpyInstance;

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });
  const BUCKET = process.env.S3_BUCKET_LIVRABLES ?? 'livrables';

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-CERTECHEC';
  const email = (cle: string): string => `e2e-certechec-${cle}@cert-eet.local`;
  const CLES = ['admin', 'admin2', 'inactif', 'a', 'b', 'c', 'd'];
  const ALL_EMAILS = CLES.map(email);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let formationId: string;

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const api = (methode: 'get' | 'post', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);
  const ligne = (id: string): Promise<Certificat> =>
    dataSource.getRepository(Certificat).findOneByOrFail({ id });
  const attendreStatut = async (id: string, attendu: StatutCertificat): Promise<Certificat> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      const c = await ligne(id);
      if (c.statut === attendu) return c;
      if (Date.now() > fin) throw new Error(`Certificat ${id} : ${c.statut} au lieu de ${attendu}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const attendreAudit = async (action: string, cible: string, n: number): Promise<void> => {
    const fin = Date.now() + 20_000;
    while ((await auditLogRepository.countBy({ action, cible })) < n) {
      if (Date.now() > fin) throw new Error(`${action} ${cible} : moins de ${n} lignes`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const existe = (cle: string): Promise<boolean> =>
    s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: cle })).then(
      () => true,
      () => false,
    );
  /** Alertes reçues par NOS comptes (la base locale peut contenir d'autres administrateurs). */
  const alertesPour = (certificatId: string): string[] =>
    alerte.mock.calls
      .filter(([a, d]) => ALL_EMAILS.includes(a as string) && d.certificatId === certificatId)
      .map(([a]) => a as string)
      .sort();

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const lignes =
      uids.length === 0
        ? []
        : await dataSource.getRepository(Certificat).find({ where: { apprenantId: In(uids) } });
    if (lignes.length > 0) {
      await s3
        .send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: lignes.map((c) => ({ Key: `certificats/${c.id}.pdf` })) },
          }),
        )
        .catch(() => undefined);
      await dataSource.getRepository(Certificat).delete({ id: In(lignes.map((c) => c.id)) });
    }
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const cibles = [...formations.map((f) => f.id), ...lignes.map((c) => c.id), ...uids];
    if (cibles.length > 0) {
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
    }
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    process.env.CERTIFICATS_BACKOFF_MS = '50';
    process.env.CERTIFICATS_TENTATIVES = '3';
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
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });
    certificats = moduleRef.get(CertificatsService);
    reprise = moduleRef.get(RepriseCertificatsService);
    stockage = moduleRef.get(StockageService);
    const mail = moduleRef.get(MailService);
    jest.spyOn(mail, 'sendCertificatEmisEmail').mockResolvedValue(undefined);
    alerte = jest.spyOn(mail, 'sendCertificatEchecEmail').mockResolvedValue(undefined);

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: cle.startsWith('admin') || cle === 'inactif' ? Role.ADMINISTRATEUR : Role.APPRENANT,
          motDePasseHash,
          statut: cle === 'inactif' ? StatutCompte.DESACTIVE : StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Echec',
        }),
      );
      ids[cle] = u.id;
      if (cle !== 'inactif') tokens[cle] = await login(email(cle));
    }
    const formationRepo = dataSource.getRepository(Formation);
    formationId = (
      await formationRepo.save(
        formationRepo.create({
          titre: `${MARQUEUR} Back-end`,
          statut: StatutFormation.OUVERTE,
          capaciteMax: 20,
          noteMinCertification: 60,
        }),
      )
    ).id;
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.CERTIFICATS_BACKOFF_MS;
    delete process.env.CERTIFICATS_TENTATIVES;
  });

  describe('Échec définitif', () => {
    let certificatId: string;

    it('trois échecs : en attente, rien publié, daté, tracé, une alerte par administrateur actif', async () => {
      const espion = jest
        .spyOn(stockage, 'deposerTampon')
        .mockRejectedValue(new Error('S3 en panne'));
      try {
        ({ certificatId } = await certificats.demanderEmission(ids.a, formationId, 72));
        await attendreAudit('CERTIFICAT_ECHEC', certificatId, 1);
      } finally {
        espion.mockRestore();
      }
      const c = await ligne(certificatId);
      expect(c.statut).toBe(StatutCertificat.EN_ATTENTE_GENERATION);
      expect(c.nbTentatives).toBe(3);
      expect(c.echecDefinitifLe).not.toBeNull();
      expect(await existe(`certificats/${certificatId}.pdf`)).toBe(false);
      const [trace] = await auditLogRepository.findBy({
        action: 'CERTIFICAT_ECHEC',
        cible: certificatId,
      });
      expect(trace.detailsAvantApres).toEqual({ erreur: 'S3 en panne', alerte: true });
      expect(alertesPour(certificatId)).toEqual([email('admin'), email('admin2')].sort());
      const [, donnees] = alerte.mock.calls.find(([a]) => a === email('admin')) ?? [];
      expect(donnees).toMatchObject({
        certificatId,
        nomApprenant: 'A Echec',
        titreFormation: `${MARQUEUR} Back-end`,
        nbTentatives: 3,
        erreur: 'S3 en panne',
      });
    }, 30_000);

    it('supervision : filtre enEchec ; 400 ; 403 apprenant', async () => {
      const res = await api('get', '/admin/certificats?enEchec=true', tokens.admin).expect(200);
      const vue = res.body.find((x: { id: string }) => x.id === certificatId);
      expect(vue).toMatchObject({ statut: 'EN_ATTENTE_GENERATION', derniereErreur: 'S3 en panne' });
      expect(vue.echecDefinitifLe).not.toBeNull();
      expect(
        res.body.every((x: { echecDefinitifLe: string | null }) => x.echecDefinitifLe !== null),
      ).toBe(true);
      await api('get', '/admin/certificats?enEchec=false', tokens.admin).expect(400);
      await api('get', '/admin/certificats?enEchec=true', tokens.a).expect(403);
    });

    it('relance : échec effacé, puis ACTIF', async () => {
      await api('post', `/admin/certificats/${certificatId}/relancer`, tokens.admin).expect(200);
      const actif = await attendreStatut(certificatId, StatutCertificat.ACTIF);
      expect(actif.echecDefinitifLe).toBeNull();
      const res = await api('get', '/admin/certificats?enEchec=true', tokens.admin).expect(200);
      expect(res.body.map((x: { id: string }) => x.id)).not.toContain(certificatId);
    }, 30_000);
  });

  describe('Concurrence', () => {
    it('8 échecs définitifs simultanés : 8 traces, une seule alerte', async () => {
      const [{ id }] = (await dataSource.query(
        `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention,
            organisme_emetteur, date_emission, nb_tentatives)
         VALUES ($1, $2, 'EN_ATTENTE_GENERATION', 64, 'Assez bien', 'ESPRIT Entreprise', now(), 3)
         RETURNING id`,
        [ids.c, formationId],
      )) as Array<{ id: string }>;
      await Promise.all(
        Array.from({ length: 8 }, () => certificats.echecDefinitif(id, new Error('panne'))),
      );
      expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_ECHEC', cible: id })).toBe(8);
      expect(alertesPour(id)).toEqual([email('admin'), email('admin2')].sort());
      expect((await ligne(id)).echecDefinitifLe).not.toBeNull();
    });
  });

  describe('Reprise des certificats bloqués', () => {
    it('bloqué depuis 20 min : repris une seule fois sur 4 tours simultanés, puis ACTIF ; récent ignoré', async () => {
      const inserer = async (apprenantId: string, minutes: number): Promise<string> =>
        (
          (await dataSource.query(
            `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention,
                organisme_emetteur, date_emission, nb_tentatives, debut_generation)
             VALUES ($1, $2, 'EN_GENERATION', 80, 'Très bien', 'ESPRIT Entreprise', now(), 1,
                     now() - make_interval(mins => $3))
             RETURNING id`,
            [apprenantId, formationId, minutes],
          )) as Array<{ id: string }>
        )[0].id;
      const bloque = await inserer(ids.d, 20);
      const recent = await inserer(ids.b, 1);
      await Promise.all(Array.from({ length: 4 }, () => certificats.reprendreBloques()));
      expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_REPRIS', cible: bloque })).toBe(
        1,
      );
      expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_REPRIS', cible: recent })).toBe(
        0,
      );
      expect((await ligne(recent)).statut).toBe(StatutCertificat.EN_GENERATION);
      const actif = await attendreStatut(bloque, StatutCertificat.ACTIF);
      expect(actif.nbTentatives).toBe(2);
      expect(await existe(`certificats/${bloque}.pdf`)).toBe(true);
      // Le minuteur ne tourne pas en test, mais son tour appelle bien la reprise.
      await expect(reprise.tourner()).resolves.toBe(0);
    }, 30_000);
  });
});
