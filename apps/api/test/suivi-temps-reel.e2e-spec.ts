import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { GenerationIa } from '../src/database/entities/generation-ia.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { SupportPedagogique } from '../src/database/entities/support-pedagogique.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';

/**
 * Tests d'intégration US-IA-07 — Suivi en temps réel (SSE) de l'indexation
 * d'un support et d'une génération, sur l'application réelle (workers BullMQ,
 * fournisseur LLM factice).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté ; 404 inconnu ;
 *  - support : dès le dépôt, le flux envoie l'état courant puis l'état final
 *    INDEXE (segments) et se ferme ; un flux ouvert après la fin envoie l'état
 *    final tout de suite (aucune information perdue) ; même état que la fiche
 *    REST (repli) ;
 *  - génération : flux jusqu'à TERMINEE (suggestions) ;
 *  - concurrence : 5 flux simultanés sur la même génération -> tous reçoivent
 *    l'état final, chacun une seule fois.
 *
 * Marqueur `E2E-SSE` ; emails `e2e-sse-…`.
 */
describe('Suivi en temps réel SSE (e2e) — US-IA-07', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
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
  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-SSE';
  const email = (cle: string): string => `e2e-sse-${cle}@cert-eet.local`;
  const CLES = ['admin', 'formateur', 'autre', 'apprenant'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '66666666-6666-4666-8666-666666666666';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const COURS =
    'Les jetons JWT sont signés avec une clé privée et vérifiés avec la clé publique. ' +
    'La charge utile contient des revendications comme le sujet et la date d’expiration. ' +
    'Un jeton expiré doit être refusé par le serveur, même si sa signature est valide.';

  interface Etat {
    statut: string;
    final: boolean;
    resultat: number | null;
    nature: string;
    id: string;
  }
  /** Lit un flux SSE jusqu'à sa fermeture et renvoie les états reçus. */
  const lireFlux = async (chemin: string, token = tokens.formateur): Promise<Etat[]> => {
    const res = await request(app.getHttpServer())
      .get(`/api${chemin}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .buffer(true)
      .parse((r, fin) => {
        let texte = '';
        r.on('data', (m: Buffer) => (texte += m.toString()));
        r.on('end', () => fin(null, texte));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    return (res.body as string)
      .split('\n\n')
      .map((bloc) =>
        bloc
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join(''),
      )
      .filter(Boolean)
      .map((d) => JSON.parse(d) as Etat);
  };
  const api = (methode: 'get' | 'post', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const nettoyer = async (): Promise<void> => {
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const fids = formations.map((f) => f.id);
    const modules =
      fids.length === 0
        ? []
        : await dataSource
            .getRepository(ModuleFormation)
            .find({ where: { formationId: In(fids) }, select: { id: true } });
    const mids = modules.map((m) => m.id);
    if (mids.length > 0) {
      await dataSource.getRepository(GenerationIa).delete({ moduleId: In(mids) });
      for (const id of mids) {
        const res = await s3
          .send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `supports/${id}/` }))
          .catch(() => ({ Contents: [] }));
        const cles = (res.Contents ?? []).map((o) => ({ Key: o.Key as string }));
        if (cles.length > 0) {
          await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: cles } }));
        }
      }
      await dataSource.getRepository(SupportPedagogique).delete({ moduleId: In(mids) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    if (uids.length + fids.length > 0) {
      const qr = dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await qr.query("SET LOCAL app.audit_maintenance = 'on'");
        await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
          [...uids, ...fids],
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
    process.env.LLM_FOURNISSEUR = 'factice';
    process.env.IA_GENERATIONS_PAR_HEURE = '50';
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
    dataSource = moduleRef.get(DataSource, { strict: false });
    const mail = moduleRef.get(MailService);
    jest.spyOn(mail, 'sendGenerationTermineeEmail').mockResolvedValue();
    jest.spyOn(mail, 'sendSupportIndexationEmail').mockResolvedValue();

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<string, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
    };
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle,
          nom: 'Sse',
        }),
      );
      ids[cle] = u.id;
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email(cle), password: MOT_DE_PASSE })
        .expect(200);
      tokens[cle] = res.body.accessToken as string;
    }
    const formation = await dataSource.getRepository(Formation).save(
      dataSource.getRepository(Formation).create({
        titre: `${MARQUEUR} Sécurité`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    await dataSource.getRepository(AffectationFormateur).save(
      dataSource.getRepository(AffectationFormateur).create({
        formationId: formation.id,
        formateurId: ids.formateur,
        affectePar: ids.admin,
      }),
    );
    ids.module = (
      await dataSource
        .getRepository(ModuleFormation)
        .save(
          dataSource
            .getRepository(ModuleFormation)
            .create({ formationId: formation.id, titre: 'JWT', ordre: 1 }),
        )
    ).id;
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.LLM_FOURNISSEUR;
    delete process.env.IA_GENERATIONS_PAR_HEURE;
  });

  it('accès : 401 ; 403 apprenant et formateur non affecté ; 404', async () => {
    await request(app.getHttpServer()).get(`/api/supports/${INCONNU}/evenements`).expect(401);
    await api('get', `/supports/${INCONNU}/evenements`, tokens.apprenant).expect(403);
    await api('get', `/generations/${INCONNU}/evenements`, tokens.formateur).expect(404);
  });

  it('support : état courant puis INDEXE, flux fermé ; flux tardif = état final ; même état que REST', async () => {
    const res = await api('post', `/modules/${ids.module}/supports`, tokens.formateur)
      .attach('fichier', Buffer.from(COURS, 'utf8'), 'cours.txt')
      .expect(202);
    ids.support = res.body.id as string;
    await api('get', `/supports/${ids.support}/evenements`, tokens.autre).expect(403);
    const etats = await lireFlux(`/supports/${ids.support}/evenements`);
    expect(etats.length).toBeGreaterThanOrEqual(1);
    const dernier = etats[etats.length - 1];
    expect(dernier).toMatchObject({
      nature: 'support',
      id: ids.support,
      statut: 'INDEXE',
      final: true,
    });
    expect(dernier.resultat).toBeGreaterThanOrEqual(1);
    expect(etats.filter((e) => e.final)).toHaveLength(1);
    const tardif = await lireFlux(`/supports/${ids.support}/evenements`);
    expect(tardif).toEqual([dernier]);
    const rest = await api('get', `/supports/${ids.support}`, tokens.formateur).expect(200);
    expect(rest.body.statut).toBe(dernier.statut);
    expect(rest.body.nbSegments).toBe(dernier.resultat);
  }, 30_000);

  it('génération : flux jusqu’à TERMINEE ; 5 flux simultanés reçoivent tous l’état final une fois', async () => {
    const res = await api('post', `/modules/${ids.module}/generations`, tokens.formateur)
      .send({ supportId: ids.support, nbQuestions: 3, types: ['QCU'], niveau: 'INTERMEDIAIRE' })
      .expect(202);
    const generationId = res.body.id as string;
    const flux = await Promise.all(
      Array.from({ length: 5 }, () => lireFlux(`/generations/${generationId}/evenements`)),
    );
    for (const etats of flux) {
      const finaux = etats.filter((e) => e.final);
      expect(finaux).toHaveLength(1);
      expect(finaux[0]).toMatchObject({ nature: 'generation', statut: 'TERMINEE' });
      expect(finaux[0].resultat).toBeGreaterThanOrEqual(1);
      expect(etats[etats.length - 1].final).toBe(true);
    }
  }, 30_000);
});
