import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { GenerationIa } from '../src/database/entities/generation-ia.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { SupportPedagogique } from '../src/database/entities/support-pedagogique.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutGeneration } from '../src/database/enums/statut-generation.enum';
import { StatutSupport } from '../src/database/enums/statut-support.enum';
import { MailService } from '../src/mail/mail.service';
import {
  FOURNISSEUR_LLM,
  FournisseurLlm,
  OUTIL_QUESTIONS,
} from '../src/modules/assistance-ia/llm/fournisseur-llm';
import { LlmCompatibleOpenAi } from '../src/modules/assistance-ia/llm/llm-compatible-openai';
import { LlmFactice } from '../src/modules/assistance-ia/llm/llm-factice';

/**
 * Tests d'intégration US-IA-06 — Couche d'abstraction LLM : le VRAI pipeline
 * (worker BullMQ, RAG, validation, insertion des suggestions) tourne avec le
 * fournisseur « compatible OpenAI » choisi par la seule configuration
 * (LLM_FOURNISSEUR, LLM_URL, LLM_MODELE), contre un serveur HTTP local qui
 * imite `/chat/completions` (il fabrique ses réponses avec le fournisseur
 * factice, à partir du prompt reçu).
 *
 * Couvre :
 *  - nominal : génération TERMINEE, modèle enregistré, suggestions valides,
 *    requête conforme (modèle, outil imposé, clé), formateur prévenu ;
 *  - fournisseur indisponible (503) : reprise (2 tentatives), puis ECHEC,
 *    erreur en français, audit GENERATION_IA_ECHEC, formateur prévenu ;
 *  - clé refusée (401) : échec immédiat, sans reprise ;
 *  - concurrence : 2 lancements simultanés sur le même module -> un seul
 *    accepté (une génération en cours par module), un seul appel au modèle.
 *
 * Marqueur `E2E-LLMOAI` ; emails `e2e-llmoai-…`.
 */
describe('Fournisseur LLM compatible OpenAI (e2e) — US-IA-06', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let emails: jest.SpyInstance;
  let serveur: Server;
  let mode: 'ok' | '503' | '401' = 'ok';
  const recues: Array<{ auth?: string; corps: Record<string, unknown> }> = [];

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
  const MARQUEUR = 'E2E-LLMOAI';
  const email = (cle: string): string => `e2e-llmoai-${cle}@cert-eet.local`;
  const CLES = ['admin', 'formateur'];
  const ALL_EMAILS = CLES.map(email);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const factice = new LlmFactice();
  const COURS =
    'Les jetons JWT sont signés avec une clé privée et vérifiés avec la clé publique. ' +
    'La charge utile contient des revendications comme le sujet et la date d’expiration. ' +
    'Un jeton expiré doit être refusé par le serveur, même si sa signature est valide.';

  const api = (methode: 'get' | 'post', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);
  const attendre = async <T>(lire: () => Promise<T>, fini: (v: T) => boolean): Promise<T> => {
    const fin = Date.now() + 25_000;
    for (;;) {
      const v = await lire();
      if (fini(v)) return v;
      if (Date.now() > fin) throw new Error(`délai dépassé (${JSON.stringify(v)})`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const generations = (): Repository<GenerationIa> => dataSource.getRepository(GenerationIa);
  const deposer = async (titre: string): Promise<string> => {
    const res = await api('post', `/modules/${ids.module}/supports`, tokens.formateur)
      .attach('fichier', Buffer.from(`${COURS} (${titre})`, 'utf8'), `${titre}.txt`)
      .expect(202);
    const id = res.body.id as string;
    await attendre(
      () => dataSource.getRepository(SupportPedagogique).findOneByOrFail({ id }),
      (s) => s.statut === StatutSupport.INDEXE,
    );
    return id;
  };
  const lancer = async (supportId: string): Promise<GenerationIa> => {
    const avant = emails.mock.calls.length;
    const res = await api('post', `/modules/${ids.module}/generations`, tokens.formateur)
      .send({ supportId, nbQuestions: 3, types: ['QCU'], niveau: 'INTERMEDIAIRE' })
      .expect(202);
    const g = await attendre(
      () => generations().findOneByOrFail({ id: res.body.id as string }),
      (x) => x.statut !== StatutGeneration.EN_COURS,
    );
    await attendre(
      async () => emails.mock.calls.length,
      (n) => n > avant,
    );
    return g;
  };

  const nettoyer = async (): Promise<void> => {
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    const modules =
      formationIds.length === 0
        ? []
        : await dataSource
            .getRepository(ModuleFormation)
            .find({ where: { formationId: In(formationIds) }, select: { id: true } });
    const moduleIds = modules.map((m) => m.id);
    const gens =
      moduleIds.length === 0
        ? []
        : await generations().find({ where: { moduleId: In(moduleIds) }, select: { id: true } });
    if (gens.length > 0) await generations().delete({ id: In(gens.map((g) => g.id)) });
    const supports =
      moduleIds.length === 0
        ? []
        : await dataSource
            .getRepository(SupportPedagogique)
            .find({ where: { moduleId: In(moduleIds) }, select: { id: true } });
    for (const id of moduleIds) {
      const res = await s3
        .send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `supports/${id}/` }))
        .catch(() => ({ Contents: [] }));
      const cles = (res.Contents ?? []).map((o) => ({ Key: o.Key as string }));
      if (cles.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: cles } }));
      }
    }
    if (supports.length > 0) {
      await dataSource
        .getRepository(SupportPedagogique)
        .delete({ id: In(supports.map((s) => s.id)) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const cibles = [
      ...uids,
      ...formationIds,
      ...gens.map((g) => g.id),
      ...supports.map((s) => s.id),
    ];
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
    serveur = createServer((req: IncomingMessage, res: ServerResponse) => {
      let brut = '';
      req.on('data', (m) => (brut += m));
      req.on('end', () => {
        const corps = JSON.parse(brut) as {
          messages: Array<{ content: string }>;
        } & Record<string, unknown>;
        recues.push({ auth: req.headers.authorization, corps });
        if (mode !== 'ok') {
          res.writeHead(mode === '503' ? 503 : 401, { 'Content-Type': 'application/json' });
          res.end('{"error":"indisponible"}');
          return;
        }
        void factice
          .genererQuestions({
            systeme: corps.messages[0].content,
            utilisateur: corps.messages[1].content,
          })
          .then((sortie) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      tool_calls: [
                        { function: { name: OUTIL_QUESTIONS, arguments: JSON.stringify(sortie) } },
                      ],
                    },
                  },
                ],
              }),
            );
          });
      });
    });
    await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
    process.env.LLM_FOURNISSEUR = 'compatible-openai';
    process.env.LLM_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/v1`;
    process.env.LLM_MODELE = 'mistral-test';
    process.env.LLM_CLE = 'cle-e2e';
    process.env.IA_TENTATIVES = '2';
    process.env.IA_BACKOFF_MS = '50';
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
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });
    emails = jest
      .spyOn(moduleRef.get(MailService), 'sendGenerationTermineeEmail')
      .mockResolvedValue();

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: cle === 'admin' ? Role.ADMINISTRATEUR : Role.FORMATEUR,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle,
          nom: 'Llm',
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
    ids.s1 = await deposer('cours-1');
    ids.s2 = await deposer('cours-2');
  }, 90_000);

  afterAll(async () => {
    emails.mockRestore();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    await new Promise<void>((r) => serveur.close(() => r()));
    for (const v of [
      'LLM_FOURNISSEUR',
      'LLM_URL',
      'LLM_MODELE',
      'LLM_CLE',
      'IA_TENTATIVES',
      'IA_BACKOFF_MS',
      'IA_GENERATIONS_PAR_HEURE',
    ]) {
      delete process.env[v];
    }
  });

  it('la configuration seule choisit l’adaptateur', () => {
    const llm = moduleRef.get<FournisseurLlm>(FOURNISSEUR_LLM);
    expect(llm).toBeInstanceOf(LlmCompatibleOpenAi);
    expect(llm.modele).toBe('mistral-test');
  });

  it('nominal : TERMINEE, modèle enregistré, suggestions valides, requête conforme', async () => {
    mode = 'ok';
    recues.length = 0;
    const g = await lancer(ids.s1);
    expect(g.statut).toBe(StatutGeneration.TERMINEE);
    expect(g.modeleLlm).toBe('mistral-test');
    const suggestions = (await dataSource.query(
      'SELECT type, statut FROM suggestions_questions_ia WHERE generation_id = $1',
      [g.id],
    )) as Array<{ type: string; statut: string }>;
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.every((s) => s.type === 'QCU' && s.statut === 'PROPOSEE')).toBe(true);
    expect(recues).toHaveLength(1);
    expect(recues[0].auth).toBe('Bearer cle-e2e');
    expect(recues[0].corps).toMatchObject({
      model: 'mistral-test',
      tool_choice: { type: 'function', function: { name: OUTIL_QUESTIONS } },
    });
    expect(emails).toHaveBeenLastCalledWith(email('formateur'), expect.anything());
  });

  it('fournisseur indisponible : reprise puis ECHEC en français, tracé, formateur prévenu', async () => {
    mode = '503';
    recues.length = 0;
    const g = await lancer(ids.s1);
    expect(g.statut).toBe(StatutGeneration.ECHEC);
    expect(g.derniereErreur).toMatch(/plusieurs tentatives .*indisponible/);
    expect(recues).toHaveLength(2);
    expect(await auditLogRepository.countBy({ action: 'GENERATION_IA_ECHEC', cible: g.id })).toBe(
      1,
    );
  });

  it('clé refusée : échec immédiat, sans reprise', async () => {
    mode = '401';
    recues.length = 0;
    const g = await lancer(ids.s1);
    expect(g.statut).toBe(StatutGeneration.ECHEC);
    expect(g.derniereErreur).toMatch(/Clé du fournisseur d’IA refusée/);
    expect(recues).toHaveLength(1);
  });

  it('concurrence : 2 lancements simultanés sur le module -> un seul accepté, TERMINEE', async () => {
    mode = 'ok';
    recues.length = 0;
    const avant = emails.mock.calls.length;
    const reponses = await Promise.all(
      [ids.s1, ids.s2].map((supportId) =>
        api('post', `/modules/${ids.module}/generations`, tokens.formateur).send({
          supportId,
          nbQuestions: 3,
          types: ['QCU'],
          niveau: 'INTERMEDIAIRE',
        }),
      ),
    );
    const codes = reponses.map((r) => r.status).sort();
    expect(codes).toEqual([202, 409]);
    const acceptee = reponses.find((r) => r.status === 202);
    const g = await attendre(
      () => generations().findOneByOrFail({ id: acceptee?.body.id as string }),
      (x) => x.statut !== StatutGeneration.EN_COURS,
    );
    await attendre(
      async () => emails.mock.calls.length,
      (n) => n > avant,
    );
    expect(g.statut).toBe(StatutGeneration.TERMINEE);
    expect(recues).toHaveLength(1);
  });
});
