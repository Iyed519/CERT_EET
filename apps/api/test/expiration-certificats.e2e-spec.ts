import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
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
import { MailService } from '../src/mail/mail.service';
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { ExpirationCertificatsService } from '../src/modules/certificats/expiration-certificats.service';

/**
 * Tests d'intégration US-CERT-07 — Expiration automatique des certificats,
 * sur l'application réelle (PostgreSQL, Redis/BullMQ, S3).
 *
 * Couvre :
 *  - durée de validité de la formation (administrateur) : 400 hors 1–120 ;
 *    émission -> date d'expiration = émission + durée ; sans durée -> jamais ;
 *  - balayage : certificat ACTIF échu -> EXPIRE, audit CERTIFICAT_EXPIRE ; un
 *    certificat non échu et un certificat sans expiration restent ACTIFS ;
 *  - après expiration : vérification publique « EXPIRE » avec la date (le
 *    document reste authentique), PDF public refusé (404), téléchargement du
 *    titulaire permis, révocation refusée (409) ;
 *  - déclencheur : un certificat expiré est définitif, la date d'expiration
 *    d'un certificat ACTIF ne change pas ;
 *  - concurrence : 4 balayages simultanés -> une seule expiration tracée.
 *
 * Marqueur `E2E-CERTEXP` ; emails `e2e-certexp-…`.
 */
describe('Expiration des certificats (e2e) — US-CERT-07', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let certificats: CertificatsService;
  let expiration: ExpirationCertificatsService;

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
  const MARQUEUR = 'E2E-CERTEXP';
  const email = (cle: string): string => `e2e-certexp-${cle}@cert-eet.local`;
  const CLES = ['admin', 'a', 'b', 'c', 'd'];
  const ALL_EMAILS = CLES.map(email);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const api = (methode: 'get' | 'post', chemin: string, token?: string): request.Test => {
    const r = request(app.getHttpServer())[methode](`/api${chemin}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const ligne = (id: string): Promise<Certificat> =>
    dataSource.getRepository(Certificat).findOneByOrFail({ id });
  const attendreActif = async (id: string): Promise<Certificat> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      const c = await ligne(id);
      if (c.statut === StatutCertificat.ACTIF) return c;
      if (Date.now() > fin) throw new Error(`Certificat ${id} : ${c.statut}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  /** Certificat posé directement, déjà échu, puis généré pour de vrai (PDF, empreinte). */
  const certificatEchu = async (apprenantId: string, formationId: string): Promise<string> => {
    const [{ id }] = (await dataSource.query(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention,
          organisme_emetteur, date_emission, date_expiration)
       VALUES ($1, $2, 75, 'Bien', 'ESPRIT Entreprise', now() - interval '2 years',
               now() - interval '1 day')
       RETURNING id`,
      [apprenantId, formationId],
    )) as Array<{ id: string }>;
    await certificats.generer(id);
    await attendreActif(id);
    return id;
  };

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
    expiration = moduleRef.get(ExpirationCertificatsService);
    jest.spyOn(moduleRef.get(MailService), 'sendCertificatEmisEmail').mockResolvedValue(undefined);

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: cle === 'admin' ? Role.ADMINISTRATEUR : Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Expire',
        }),
      );
      ids[cle] = u.id;
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email(cle), password: MOT_DE_PASSE })
        .expect(200);
      tokens[cle] = res.body.accessToken as string;
    }
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
  });

  describe('Durée de validité et émission', () => {
    it('400 hors 1–120 ; formation avec 12 mois et formation sans expiration', async () => {
      const base = { capaciteMax: 20, noteMinCertification: 60 };
      for (const v of [0, 121, 1.5]) {
        await api('post', '/admin/formations', tokens.admin)
          .send({ ...base, titre: `${MARQUEUR} Refus`, dureeValiditeMois: v })
          .expect(400);
      }
      const avec = await api('post', '/admin/formations', tokens.admin)
        .send({ ...base, titre: `${MARQUEUR} Douze mois`, dureeValiditeMois: 12 })
        .expect(201);
      expect(avec.body.dureeValiditeMois).toBe(12);
      ids.f12 = avec.body.id as string;
      const sans = await api('post', '/admin/formations', tokens.admin)
        .send({ ...base, titre: `${MARQUEUR} Sans expiration` })
        .expect(201);
      expect(sans.body.dureeValiditeMois).toBeNull();
      ids.fSans = sans.body.id as string;
    });

    it('émission : expiration = émission + 12 mois ; sans durée -> aucune', async () => {
      const { certificatId } = await certificats.demanderEmission(ids.a, ids.f12, 82);
      ids.cA = certificatId;
      await attendreActif(certificatId);
      const [{ ecart }] = (await dataSource.query(
        `SELECT (date_expiration = date_emission + interval '12 months') AS ecart
           FROM certificats WHERE id = $1`,
        [certificatId],
      )) as Array<{ ecart: boolean }>;
      expect(ecart).toBe(true);
      const sans = await certificats.demanderEmission(ids.b, ids.fSans, 70);
      ids.cB = sans.certificatId;
      expect((await attendreActif(sans.certificatId)).dateExpiration).toBeNull();
    }, 30_000);
  });

  describe('Expiration', () => {
    it('balayage : échu -> EXPIRE et tracé ; non échu et sans expiration restent ACTIFS', async () => {
      ids.cC = await certificatEchu(ids.c, ids.f12);
      await expect(expiration.tourner()).resolves.toBeGreaterThanOrEqual(1);
      expect((await ligne(ids.cC)).statut).toBe(StatutCertificat.EXPIRE);
      expect((await ligne(ids.cA)).statut).toBe(StatutCertificat.ACTIF);
      expect((await ligne(ids.cB)).statut).toBe(StatutCertificat.ACTIF);
      const [trace] = await auditLogRepository.findBy({
        action: 'CERTIFICAT_EXPIRE',
        cible: ids.cC,
      });
      expect(trace.detailsAvantApres).toMatchObject({
        avant: { statut: 'ACTIF' },
        apres: { statut: 'EXPIRE' },
        apprenantId: ids.c,
      });
    }, 30_000);

    it('vérification publique EXPIRE avec la date ; PDF public 404 ; titulaire télécharge ; révocation 409', async () => {
      const v = await api('get', `/verification/${ids.cC}`).expect(200);
      expect(v.body).toMatchObject({ verdict: 'EXPIRE', integrite: 'VERIFIEE' });
      expect(v.body.dateExpiration).not.toBeNull();
      await api('get', `/verification/${ids.cC}/pdf`).expect(404);
      const actif = await api('get', `/verification/${ids.cA}`).expect(200);
      expect(actif.body.verdict).toBe('VALIDE');
      const pdf = await api('get', `/mes-certificats/${ids.cC}/pdf`, tokens.c).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      const mes = await api('get', '/mes-certificats', tokens.c).expect(200);
      expect(mes.body[0]).toMatchObject({ statut: 'EXPIRE' });
      expect(mes.body[0].urlVerification).not.toBeNull();
      await api('post', `/admin/certificats/${ids.cC}/revoquer`, tokens.admin)
        .send({
          motif: 'ERREUR_ADMIN',
          description: 'Essai de révocation après expiration.',
          confirmationIrreversible: true,
          motDePasseAdmin: MOT_DE_PASSE,
        })
        .expect(409);
    });

    it('déclencheur : expiré définitif ; date d’expiration d’un ACTIF figée', async () => {
      await expect(
        dataSource.query(`UPDATE certificats SET statut = 'ACTIF' WHERE id = $1`, [ids.cC]),
      ).rejects.toThrow(/expiré est définitif/);
      await expect(
        dataSource.query(
          `UPDATE certificats SET date_expiration = now() + interval '10 years' WHERE id = $1`,
          [ids.cA],
        ),
      ).rejects.toThrow(/immuable/);
    });
  });

  describe('Concurrence', () => {
    it('4 balayages simultanés : une seule expiration tracée', async () => {
      const id = await certificatEchu(ids.d, ids.f12);
      await Promise.all(Array.from({ length: 4 }, () => certificats.expirerEchus()));
      expect((await ligne(id)).statut).toBe(StatutCertificat.EXPIRE);
      expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_EXPIRE', cible: id })).toBe(1);
    }, 30_000);
  });
});
