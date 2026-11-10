import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-CERT-04 — Vérification publique d'un certificat,
 * SANS COMPTE (DS-05, ADR-10), sur l'application réelle : vrais PostgreSQL,
 * Redis (file et worker) et S3.
 *
 * Couvre (aucune requête ne porte de jeton) :
 *  - certificat valide : verdict VALIDE, intégrité VERIFIEE (SHA-256 du PDF
 *    stocké recalculé), données minimales (jamais l'email ni un identifiant
 *    de personne), audit CERTIFICAT_VERIFIE sans acteur ;
 *  - PDF altéré dans le stockage : INTEGRITE_COMPROMISE ; son téléchargement
 *    public est refusé ;
 *  - révoqué : REVOQUE ; pas de PDF public ;
 *  - inconnu, mal formé, pas encore émis : la même 404 ;
 *  - PDF public d'un certificat valide : le contenu exact.
 *
 * Nettoyage rejouable (avant ET après) : certificats (objets S3, lignes,
 * audit) -> formations -> audit -> utilisateurs.
 */
describe('Vérification publique (e2e) — US-CERT-04', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

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

  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-VERIFPUB';
  const EMAIL = {
    a: 'e2e-verifpub-a@cert-eet.local',
    b: 'e2e-verifpub-b@cert-eet.local',
    c: 'e2e-verifpub-c@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const ids: Record<string, string> = {};
  const cert: Record<string, string> = {};
  let formationId: string;
  const INCONNU = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

  const publique = (chemin: string): request.Test =>
    request(app.getHttpServer()).get(`/api/verification${chemin}`);

  const binaire = (res: request.Response, fin: (e: Error | null, corps: Buffer) => void): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };

  const objet = async (cle: string): Promise<Buffer> => {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }));
    return Buffer.from(
      await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
    );
  };
  const remplacer = (cle: string, contenu: Buffer): Promise<unknown> =>
    s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: cle, Body: contenu }));

  const attendreActif = async (id: string): Promise<void> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      const [c] = (await dataSource.query('SELECT statut FROM certificats WHERE id = $1', [
        id,
      ])) as Array<{ statut: string }>;
      if (c?.statut === 'ACTIF') return;
      if (Date.now() > fin) throw new Error(`Certificat ${id} : ${c?.statut}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

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
    await purgerCertificats(dataSource, MARQUEUR);
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurs.map((u) => u.id)]);
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
    jest.spyOn(moduleRef.get(MailService), 'sendCertificatEmisEmail').mockResolvedValue(undefined);

    // US-CERT-05 : la suite parle depuis la boucle locale ; je remets ses
    // compteurs de limitation de débit à zéro (fenêtre d'une minute).
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
    await redis.del('limite:verification:127.0.0.1', 'limite:verification:::1');
    redis.disconnect();

    await nettoyer();
    const motDePasseHash = await bcrypt.hash('MotDePasseTest123!', 12);
    for (const [cle, prenom] of [
      ['a', 'Inès'],
      ['b', 'Sami'],
      ['c', 'Youssef'],
    ] as const) {
      ids[cle] = (
        await userRepository.save(
          userRepository.create({
            email: EMAIL[cle],
            role: Role.APPRENANT,
            motDePasseHash,
            statut: StatutCompte.ACTIF,
            prenom,
            nom: 'Test',
          }),
        )
      ).id;
    }
    const repo = dataSource.getRepository(Formation);
    formationId = (
      await repo.save(
        repo.create({
          titre: `${MARQUEUR} Développement back-end`,
          statut: StatutFormation.OUVERTE,
          capaciteMax: 20,
          noteMinCertification: 60,
        }),
      )
    ).id;
    const certificats = moduleRef.get(CertificatsService);
    cert.a = (await certificats.demanderEmission(ids.a, formationId, 72)).certificatId;
    cert.b = (await certificats.demanderEmission(ids.b, formationId, 90)).certificatId;
    await attendreActif(cert.a);
    await attendreActif(cert.b);
    await dataSource.query(
      `UPDATE certificats SET statut = 'REVOQUE', date_revocation = now(),
         motif_revocation = 'ERREUR_ADMIN', description_revocation = 'Révocation de test (e2e).',
         revoque_par = apprenant_id WHERE id = $1`,
      [cert.b],
    );
    const [ligne] = (await dataSource.query(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur,
         date_emission, nb_tentatives, derniere_erreur)
       VALUES ($1, $2, 70, 'Bien', 'ESPRIT Entreprise', now(), 3, 'S3 en panne') RETURNING id`,
      [ids.c, formationId],
    )) as Array<{ id: string }>;
    cert.c = ligne.id;
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
  });

  it('valide : VERIFIEE, données minimales, tracé sans acteur', async () => {
    const res = await publique(`/${cert.a}`).expect(200);
    const [{ empreinte_sha256: empreinte }] = (await dataSource.query(
      'SELECT empreinte_sha256 FROM certificats WHERE id = $1',
      [cert.a],
    )) as Array<{ empreinte_sha256: string }>;
    expect(res.body).toEqual({
      certificatId: cert.a,
      verdict: 'VALIDE',
      integrite: 'VERIFIEE',
      titulaire: 'Inès Test',
      formation: `${MARQUEUR} Développement back-end`,
      organismeEmetteur: 'ESPRIT Entreprise',
      mention: 'Bien',
      scoreFinal: 72,
      dateEmission: expect.any(String),
      empreinteSha256: empreinte,
      dateRevocation: null,
      dateExpiration: null,
    });
    const corps = JSON.stringify(res.body);
    expect(corps).not.toContain(EMAIL.a);
    expect(corps).not.toContain(ids.a);
    expect(corps).not.toContain(formationId);
    const traces = await auditLogRepository.find({
      where: { action: 'CERTIFICAT_VERIFIE', cible: cert.a },
    });
    expect(traces).toHaveLength(1);
    expect(traces[0].userId).toBeNull();
    expect(traces[0].resultat).toBe('Succès');
  });

  it('PDF public d’un certificat valide : le contenu exact', async () => {
    const res = await publique(`/${cert.a}/pdf`).buffer(true).parse(binaire).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(res.body as Buffer, await objet(`certificats/${cert.a}.pdf`))).toBe(0);
  });

  it('PDF altéré dans le stockage : INTEGRITE_COMPROMISE, plus de PDF public', async () => {
    const cle = `certificats/${cert.a}.pdf`;
    const original = await objet(cle);
    await remplacer(cle, Buffer.concat([original, Buffer.from('\n% ajout frauduleux\n')]));
    try {
      const res = await publique(`/${cert.a}`).expect(200);
      expect(res.body).toMatchObject({ verdict: 'INTEGRITE_COMPROMISE', integrite: 'COMPROMISE' });
      await publique(`/${cert.a}/pdf`).expect(404);
    } finally {
      await remplacer(cle, original);
    }
    expect(
      createHash('sha256')
        .update(await objet(cle))
        .digest('hex'),
    ).toBe((await publique(`/${cert.a}`).expect(200)).body.empreinteSha256);
  });

  it('révoqué : REVOQUE ; pas de PDF public', async () => {
    const res = await publique(`/${cert.b}`).expect(200);
    expect(res.body).toMatchObject({
      verdict: 'REVOQUE',
      titulaire: 'Sami Test',
      dateRevocation: expect.any(String),
    });
    // US-CERT-06 : le motif et sa description restent internes.
    expect(JSON.stringify(res.body)).not.toMatch(/ERREUR_ADMIN|Révocation de test/);
    await publique(`/${cert.b}/pdf`).expect(404);
  });

  it('inconnu, mal formé, pas encore émis : la même 404', async () => {
    const reponses = await Promise.all([
      publique(`/${INCONNU}`).expect(404),
      publique('/pas-un-uuid').expect(404),
      publique(`/${cert.c}`).expect(404),
      publique(`/${cert.c}/pdf`).expect(404),
    ]);
    for (const r of reponses) {
      expect(r.body).toEqual(reponses[0].body);
    }
    expect(reponses[0].body.message).toBe('Aucun certificat ne correspond à ce lien.');
    expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_VERIFIE', cible: cert.c })).toBe(
      0,
    );
  });
});
