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

/**
 * Tests d'intégration US-CERT-08 — Réémission d'un certificat révoqué pour
 * erreur administrative, sur l'application réelle (PostgreSQL, BullMQ, S3).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 404 inconnu ; 400 confirmation absente /
 *    fausse ;
 *  - 409 : certificat non révoqué, révoqué pour un autre motif (fraude) ;
 *  - réémission : nouveau certificat (mêmes titulaire, formation, score,
 *    mention) généré pour de vrai, lié au révoqué ; le révoqué reste REVOQUE,
 *    sa vérification publique renvoie vers le nouveau (VALIDE) ; supervision
 *    et « Mes certificats » ; audit CERTIFICAT_REEMIS ; deuxième réémission
 *    -> 409 ; l'émission automatique reste bloquée par le certificat d'origine ;
 *  - concurrence : 6 réémissions simultanées -> 1 × 201, 5 × 409, un seul
 *    nouveau certificat.
 *
 * Marqueur `E2E-CERTREEM` ; emails `e2e-certreem-…`.
 */
describe('Réémission des certificats (e2e) — US-CERT-08', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let certificats: CertificatsService;

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
  const MARQUEUR = 'E2E-CERTREEM';
  const email = (cle: string): string => `e2e-certreem-${cle}@cert-eet.local`;
  const CLES = ['admin', 'a', 'b', 'c', 'd'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '77777777-7777-4777-8777-777777777777';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const cert: Record<string, string> = {};

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
  const emettre = async (cle: string, score: number): Promise<string> => {
    const { certificatId } = await certificats.demanderEmission(ids[cle], ids.f, score);
    await attendreActif(certificatId);
    return certificatId;
  };
  const revoquer = (certificatId: string, motif: string): request.Test =>
    api('post', `/admin/certificats/${certificatId}/revoquer`, tokens.admin)
      .send({
        motif,
        description: 'Révocation de test pour la réémission.',
        confirmationIrreversible: true,
        motDePasseAdmin: MOT_DE_PASSE,
      })
      .expect(200);
  const reemettre = (certificatId: string, corps: object = { confirmer: true }): request.Test =>
    api('post', `/admin/certificats/${certificatId}/reemettre`, tokens.admin).send(corps);

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
      // Les réémissions d'abord (clé étrangère vers le certificat remplacé).
      await dataSource.query(
        `DELETE FROM certificats WHERE apprenant_id = ANY($1) AND remplace_certificat_id IS NOT NULL`,
        [uids],
      );
      await dataSource.query(`DELETE FROM certificats WHERE apprenant_id = ANY($1)`, [uids]);
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
    const mail = moduleRef.get(MailService);
    jest.spyOn(mail, 'sendCertificatEmisEmail').mockResolvedValue(undefined);
    jest.spyOn(mail, 'sendCertificatRevoqueEmail').mockResolvedValue(undefined);

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
          nom: 'Reemis',
        }),
      );
      ids[cle] = u.id;
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email(cle), password: MOT_DE_PASSE })
        .expect(200);
      tokens[cle] = res.body.accessToken as string;
    }
    const [{ id }] = (await dataSource.query(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Back-end`],
    )) as Array<{ id: string }>;
    ids.f = id;
    cert.a = await emettre('a', 81.5);
    cert.b = await emettre('b', 70);
    cert.c = await emettre('c', 66);
    cert.d = await emettre('d', 90);
    await revoquer(cert.a, 'ERREUR_ADMIN');
    await revoquer(cert.b, 'FRAUDE');
    await revoquer(cert.d, 'ERREUR_ADMIN');
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
  });

  it('401 ; 403 apprenant ; 404 inconnu ; 400 confirmation', async () => {
    await api('post', `/admin/certificats/${cert.a}/reemettre`)
      .send({ confirmer: true })
      .expect(401);
    await api('post', `/admin/certificats/${cert.a}/reemettre`, tokens.a)
      .send({ confirmer: true })
      .expect(403);
    await reemettre(INCONNU).expect(404);
    await reemettre(cert.a, {}).expect(400);
    await reemettre(cert.a, { confirmer: false }).expect(400);
  });

  it('409 : non révoqué ; révoqué pour fraude', async () => {
    await reemettre(cert.c)
      .expect(409)
      .expect((r) => expect(r.body.message).toMatch(/Seul un certificat révoqué/));
    await reemettre(cert.b)
      .expect(409)
      .expect((r) => expect(r.body.message).toMatch(/erreur administrative/));
  });

  it('réémission : nouveau certificat lié, généré ; l’ancien reste révoqué et renvoie vers lui', async () => {
    const res = await reemettre(cert.a).expect(201);
    const nouveau = res.body.id as string;
    expect(res.body).toMatchObject({ remplaceCertificatId: cert.a, scoreFinal: 81.5 });
    const actif = await attendreActif(nouveau);
    const ancien = await ligne(cert.a);
    expect(actif).toMatchObject({
      apprenantId: ids.a,
      formationId: ids.f,
      mention: ancien.mention,
      remplaceCertificatId: cert.a,
    });
    expect(actif.empreinteSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ancien.statut).toBe(StatutCertificat.REVOQUE);

    const verifAncien = await api('get', `/verification/${cert.a}`).expect(200);
    expect(verifAncien.body).toMatchObject({ verdict: 'REVOQUE', remplacePar: nouveau });
    const verifNouveau = await api('get', `/verification/${nouveau}`).expect(200);
    expect(verifNouveau.body).toMatchObject({ verdict: 'VALIDE', remplacePar: null });

    const liste = await api('get', '/admin/certificats', tokens.admin).expect(200);
    const vueAncien = liste.body.find((x: { id: string }) => x.id === cert.a);
    expect(vueAncien.remplacePar).toBe(nouveau);
    const mes = await api('get', '/mes-certificats', tokens.a).expect(200);
    expect(mes.body.map((x: { id: string }) => x.id).sort()).toEqual([cert.a, nouveau].sort());

    const [trace] = await auditLogRepository.findBy({
      action: 'CERTIFICAT_REEMIS',
      cible: nouveau,
    });
    expect(trace).toMatchObject({ userId: ids.admin, detailsAvantApres: { remplace: cert.a } });

    await reemettre(cert.a)
      .expect(409)
      .expect((r) => expect(r.body.message).toBe('Ce certificat a déjà été réémis.'));
    // L'émission automatique reste bloquée par le certificat d'origine.
    await expect(certificats.demanderEmission(ids.a, ids.f, 95)).resolves.toEqual({
      certificatId: cert.a,
      cree: false,
    });
  }, 30_000);

  it('6 réémissions simultanées : une seule réussit', async () => {
    const codes = (await Promise.all(Array.from({ length: 6 }, () => reemettre(cert.d)))).map(
      (r) => r.status,
    );
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(5);
    const [{ n }] = (await dataSource.query(
      'SELECT count(*)::int AS n FROM certificats WHERE remplace_certificat_id = $1',
      [cert.d],
    )) as Array<{ n: number }>;
    expect(n).toBe(1);
  });
});
