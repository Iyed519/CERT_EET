import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
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
import { StockageService } from '../src/stockage/stockage.service';

/**
 * Tests d'intégration US-CERT-01 — Émission asynchrone d'un certificat
 * (DS-04, ADR-04, ADR-10), sur l'application réelle : vrais PostgreSQL,
 * Redis (file BullMQ et worker dans le processus) et S3.
 *
 * Couvre :
 *  - demande -> la main est rendue tout de suite (EN_ATTENTE_GENERATION),
 *    puis le worker produit un vrai PDF déposé sous certificats/{id}.pdf,
 *    dont le SHA-256 est celui stocké ; ACTIF, mention, audits
 *    CERTIFICAT_DEMANDE et CERTIFICAT_EMIS, email (espion : pas de SMTP en CI) ;
 *  - idempotence : seconde demande -> même certificat, pas de second travail ;
 *    concurrence FORCÉE : cinq demandes simultanées -> une ligne, un PDF ;
 *  - reprises : un échec passager est rattrapé (2e tentative) ; trois échecs
 *    -> ligne remise en attente, CERTIFICAT_ECHEC, aucun objet ; relance
 *    manuelle de l'administrateur -> ACTIF ;
 *  - administrateur : liste, filtre, relance (409 actif, 404, 403 apprenant) ;
 *  - immuabilité garantie par la base : un certificat ACTIF ne change plus ;
 *    seule la révocation (US-CERT-06) est permise.
 *
 * Délai de reprise réduit à 50 ms pour la suite (CERTIFICATS_BACKOFF_MS).
 * Nettoyage rejouable (avant ET après) : objets S3 et certificats ->
 * formations -> audit (bypass maintenance) -> utilisateurs.
 */
describe('Émission asynchrone d’un certificat (e2e) — US-CERT-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let certificats: CertificatsService;
  let stockage: StockageService;
  let envoiMail: jest.SpyInstance;

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
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-CERT01';
  const EMAIL = {
    admin: 'e2e-cert01-admin@cert-eet.local',
    a: 'e2e-cert01-a@cert-eet.local',
    b: 'e2e-cert01-b@cert-eet.local',
    c: 'e2e-cert01-c@cert-eet.local',
    d: 'e2e-cert01-d@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let formationId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (methode: 'get' | 'post', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const ligne = (id: string): Promise<Certificat> =>
    dataSource.getRepository(Certificat).findOneByOrFail({ id });

  /** Attend (heure réelle) que le certificat atteigne un statut. */
  const attendreStatut = async (id: string, attendu: StatutCertificat): Promise<Certificat> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      const c = await ligne(id);
      if (c.statut === attendu) return c;
      if (Date.now() > fin) throw new Error(`Certificat ${id} : ${c.statut} au lieu de ${attendu}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  /** Attend qu'une action d'audit atteigne un nombre de lignes. */
  const attendreAudit = async (action: string, cible: string, n: number): Promise<void> => {
    const fin = Date.now() + 20_000;
    while ((await auditLogRepository.countBy({ action, cible })) < n) {
      if (Date.now() > fin) throw new Error(`${action} ${cible} : moins de ${n} lignes`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const objet = async (cle: string): Promise<Buffer> => {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }));
    return Buffer.from(
      await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
    );
  };

  const existe = (cle: string): Promise<boolean> =>
    s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: cle })).then(
      () => true,
      () => false,
    );

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
    const lignes =
      utilisateurIds.length === 0
        ? []
        : await dataSource
            .getRepository(Certificat)
            .find({ where: { apprenantId: In(utilisateurIds) } });
    const cles = lignes.map((c) => `certificats/${c.id}.pdf`);
    if (cles.length > 0) {
      await s3
        .send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: cles.map((Key) => ({ Key })) },
          }),
        )
        .catch(() => undefined);
      await dataSource.getRepository(Certificat).delete({ id: In(lignes.map((c) => c.id)) });
    }
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([
      ...formations.map((f) => f.id),
      ...lignes.map((c) => c.id),
      ...utilisateurIds,
    ]);
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
    await app.init();

    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });
    certificats = moduleRef.get(CertificatsService);
    stockage = moduleRef.get(StockageService);
    envoiMail = jest
      .spyOn(moduleRef.get(MailService), 'sendCertificatEmisEmail')
      .mockResolvedValue(undefined);

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: cle === 'admin' ? Role.ADMINISTRATEUR : Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: 'Test',
          nom: cle,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
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

  describe('Émission nominale', () => {
    let certificatId: string;

    it('la demande rend la main, puis le worker émet un vrai PDF signé', async () => {
      const demande = await certificats.demanderEmission(ids.a, formationId, 82.456);
      expect(demande.cree).toBe(true);
      certificatId = demande.certificatId;
      const juste = await ligne(certificatId);
      expect([StatutCertificat.EN_ATTENTE_GENERATION, StatutCertificat.EN_GENERATION]).toContain(
        juste.statut,
      );
      expect(juste.scoreFinal).toBe(82.46);
      expect(juste.mention).toBe('Très bien');
      expect(juste.organismeEmetteur).toBe('ESPRIT Entreprise');

      const actif = await attendreStatut(certificatId, StatutCertificat.ACTIF);
      expect(actif.cleStockage).toBe(`certificats/${certificatId}.pdf`);
      expect(actif.nbTentatives).toBe(1);
      expect(actif.dateGeneration).not.toBeNull();
      const pdf = await objet(actif.cleStockage as string);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(createHash('sha256').update(pdf).digest('hex')).toBe(actif.empreinteSha256);
      expect(pdf.toString('latin1')).toContain(`Certificat ${certificatId}`);

      await attendreAudit('CERTIFICAT_EMIS', certificatId, 1);
      expect(
        await auditLogRepository.countBy({ action: 'CERTIFICAT_DEMANDE', cible: certificatId }),
      ).toBe(1);
      expect(envoiMail).toHaveBeenCalledWith(EMAIL.a, {
        prenom: 'Test',
        titreFormation: `${MARQUEUR} Back-end`,
        urlVerification: `${process.env.APP_BASE_URL}/verifier/${certificatId}`,
      });
    }, 30_000);

    it('seconde demande : même certificat, aucun nouveau travail', async () => {
      const demande = await certificats.demanderEmission(ids.a, formationId, 50);
      expect(demande).toEqual({ certificatId, cree: false });
      await new Promise((r) => setTimeout(r, 500));
      expect(
        await auditLogRepository.countBy({ action: 'CERTIFICAT_EMIS', cible: certificatId }),
      ).toBe(1);
      expect((await ligne(certificatId)).scoreFinal).toBe(82.46);
    });

    it('immuable en base : aucune donnée certifiante ne change, seule la révocation passe', async () => {
      for (const sql of [
        'UPDATE certificats SET score_final = 10 WHERE id = $1',
        "UPDATE certificats SET empreinte_sha256 = repeat('0', 64) WHERE id = $1",
        "UPDATE certificats SET statut = 'EN_ATTENTE_GENERATION' WHERE id = $1",
      ]) {
        await expect(dataSource.query(sql, [certificatId])).rejects.toThrow('immuable');
      }
      // US-CERT-06 : une révocation porte motif, description, auteur et date.
      await expect(
        dataSource.query("UPDATE certificats SET statut = 'REVOQUE' WHERE id = $1", [certificatId]),
      ).rejects.toThrow('CHK_certificats_revocation');
      await dataSource.query(
        `UPDATE certificats SET statut = 'REVOQUE', date_revocation = now(),
         motif_revocation = 'ERREUR_ADMIN', description_revocation = 'Révocation de test (e2e).',
         revoque_par = apprenant_id WHERE id = $1`,
        [certificatId],
      );
      expect((await ligne(certificatId)).statut).toBe(StatutCertificat.REVOQUE);
      // Irréversible : plus aucune modification, même du motif.
      for (const sql of [
        "UPDATE certificats SET statut = 'ACTIF' WHERE id = $1",
        "UPDATE certificats SET motif_revocation = 'FRAUDE' WHERE id = $1",
      ]) {
        await expect(dataSource.query(sql, [certificatId])).rejects.toThrow('irréversible');
      }
    });
  });

  describe('Concurrence (chevauchement forcé)', () => {
    it('cinq demandes simultanées : une ligne, un travail, un PDF', async () => {
      // Le verrou de table fait attendre les cinq INSERT ; libérés ensemble,
      // ils se disputent la clé (apprenant, formation) : seul ON CONFLICT
      // évite l'erreur et le doublon.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let demandes: Array<{ certificatId: string; cree: boolean }>;
      try {
        await bloqueur.query('LOCK TABLE certificats IN SHARE ROW EXCLUSIVE MODE');
        const enCours = Array.from({ length: 5 }, () =>
          certificats.demanderEmission(ids.b, formationId, 65),
        );
        await new Promise((r) => setTimeout(r, 700));
        await bloqueur.commitTransaction();
        demandes = await Promise.all(enCours);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(demandes.filter((d) => d.cree)).toHaveLength(1);
      expect(new Set(demandes.map((d) => d.certificatId)).size).toBe(1);
      const id = demandes[0].certificatId;
      expect(await dataSource.getRepository(Certificat).countBy({ apprenantId: ids.b })).toBe(1);
      const actif = await attendreStatut(id, StatutCertificat.ACTIF);
      expect(actif.mention).toBe('Assez bien');
      await new Promise((r) => setTimeout(r, 500));
      expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_EMIS', cible: id })).toBe(1);
    }, 30_000);
  });

  describe('Reprises et relance manuelle', () => {
    it('un échec passager est rattrapé à la 2e tentative', async () => {
      const espion = jest
        .spyOn(stockage, 'deposerTampon')
        .mockRejectedValueOnce(new Error('S3 momentanément injoignable'));
      try {
        const { certificatId } = await certificats.demanderEmission(ids.d, formationId, 75);
        const actif = await attendreStatut(certificatId, StatutCertificat.ACTIF);
        expect(actif.nbTentatives).toBe(2);
        expect(actif.derniereErreur).toBeNull();
        expect(await existe(`certificats/${certificatId}.pdf`)).toBe(true);
      } finally {
        espion.mockRestore();
      }
    }, 30_000);

    it('trois échecs : en attente, CERTIFICAT_ECHEC, rien dans le bucket ; relance -> ACTIF', async () => {
      const espion = jest
        .spyOn(stockage, 'deposerTampon')
        .mockRejectedValue(new Error('S3 en panne'));
      let certificatId: string;
      try {
        ({ certificatId } = await certificats.demanderEmission(ids.c, formationId, 59));
        await attendreAudit('CERTIFICAT_ECHEC', certificatId, 1);
      } finally {
        espion.mockRestore();
      }
      const enAttente = await ligne(certificatId);
      expect(enAttente.statut).toBe(StatutCertificat.EN_ATTENTE_GENERATION);
      expect(enAttente.nbTentatives).toBe(3);
      expect(enAttente.derniereErreur).toBe('S3 en panne');
      expect(enAttente.mention).toBe('Passable');
      expect(await existe(`certificats/${certificatId}.pdf`)).toBe(false);

      const liste = await api(
        'get',
        '/admin/certificats?statut=EN_ATTENTE_GENERATION',
        tokens.admin,
      ).expect(200);
      expect(liste.body.map((c: { id: string }) => c.id)).toContain(certificatId);
      const vue = liste.body.find((c: { id: string }) => c.id === certificatId);
      expect(vue).toMatchObject({
        nbTentatives: 3,
        derniereErreur: 'S3 en panne',
        mention: 'Passable',
      });
      expect(JSON.stringify(vue)).not.toMatch(/cleStockage|motDePasse/);

      await api('post', `/admin/certificats/${certificatId}/relancer`, tokens.c).expect(403);
      await api('post', `/admin/certificats/${UUID_INCONNU}/relancer`, tokens.admin).expect(404);
      await api('post', '/admin/certificats/pas-un-uuid/relancer', tokens.admin).expect(400);
      await api('post', `/admin/certificats/${certificatId}/relancer`, tokens.admin).expect(200);
      const actif = await attendreStatut(certificatId, StatutCertificat.ACTIF);
      expect(actif.nbTentatives).toBe(4);
      expect(
        await auditLogRepository.countBy({ action: 'CERTIFICAT_RELANCE', cible: certificatId }),
      ).toBe(1);

      const refus = await api(
        'post',
        `/admin/certificats/${certificatId}/relancer`,
        tokens.admin,
      ).expect(409);
      expect(refus.body.message).toBe(
        'Seul un certificat en attente ou bloqué en génération peut être relancé.',
      );
    }, 40_000);

    it('liste : 400 statut inconnu, 403 apprenant', async () => {
      await api('get', '/admin/certificats?statut=FOO', tokens.admin).expect(400);
      await api('get', '/admin/certificats', tokens.a).expect(403);
    });
  });
});
