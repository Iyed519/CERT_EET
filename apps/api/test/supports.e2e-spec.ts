import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
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
import { existsSync, readdirSync } from 'fs';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { SupportPedagogique } from '../src/database/entities/support-pedagogique.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutSupport } from '../src/database/enums/statut-support.enum';
import { genererPdfCertificat } from '../src/modules/certificats/certificat-pdf';
import { MODELE_HACHAGE } from '../src/modules/assistance-ia/embeddings/embeddings-hachage';
import { DOSSIER_SUPPORTS } from '../src/modules/assistance-ia/supports/depot-support';
import { MESSAGE_ECHEC_TRANSITOIRE } from '../src/modules/assistance-ia/supports/supports.service';
import { StockageService } from '../src/stockage/stockage.service';
import { docx, pptx } from './outils/fichiers-office';

/**
 * Tests d'intégration US-IA-01 — Dépôt et indexation d'un support pédagogique
 * (DS-06 partie 1, AC-04), sur l'application réelle : PostgreSQL + pgvector,
 * Redis (BullMQ, worker dans le processus), stockage S3 (MinIO en CI).
 *
 * Couvre :
 *  - nominal TXT, PDF, PPTX, DOCX : 202 EN_INDEXATION, puis INDEXE ; segments
 *    en base avec des vecteurs de dimension 384 ; objet présent dans le
 *    bucket ; audit SUPPORT_DEPOSE puis SUPPORT_INDEXE ; liste et fiche
 *    (aperçu du texte, jamais la clé de stockage) ;
 *  - refus 400 (fichier absent, format, signature, binaire, trop gros, champ,
 *    titre) : rien en base ni dans le bucket, fichiers temporaires supprimés ;
 *    403 (formateur non affecté tracé, apprenant), 404, 409 (doublon,
 *    formation archivée) ; administrateur autorisé ;
 *  - erreur du Backlog : PDF illisible / sans texte -> ECHEC_INDEXATION en une
 *    tentative, motif français, jamais INDEXE ; relance -> nouvel essai ;
 *    panne passagère rattrapée par la reprise ; trois pannes -> échec, puis
 *    relance réussie ;
 *  - suppression (ligne, segments, objet) ; garanties en base ;
 *  - concurrence FORCÉE : deux dépôts du même fichier (un 202, un 409, un seul
 *    objet) ; deux relances simultanées (un 202, un 409).
 *
 * Nettoyage rejouable (avant ET après) : objets `supports/<module>/` ->
 * supports (CASCADE segments) -> formations (CASCADE modules) -> audit
 * (bypass maintenance) -> utilisateurs.
 */
describe('Supports pédagogiques (e2e) — US-IA-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let supportRepository: Repository<SupportPedagogique>;
  let dataSource: DataSource;
  let stockage: StockageService;

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
  const MARQUEUR = 'E2E-IASUPPORT';
  const EMAIL = {
    admin: 'e2e-iasupport-admin@cert-eet.local',
    formateur: 'e2e-iasupport-form@cert-eet.local',
    autre: 'e2e-iasupport-autre@cert-eet.local',
    apprenant: 'e2e-iasupport-appr@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let moduleId: string;
  let moduleArchiveId: string;

  const COURS =
    'Chapitre 1 — Les jetons JWT.\n\nUn jeton JWT contient un en-tête, une charge utile et une ' +
    'signature. La signature RS256 utilise une clé privée ; la clé publique permet de la vérifier.\n\n' +
    'Chapitre 2 — La rotation des jetons de rafraîchissement protège contre le vol de session.';
  const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (methode: 'get' | 'post' | 'delete', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const deposer = (
    contenu: Buffer,
    nom: string,
    token = tokens.formateur,
    module = moduleId,
  ): request.Test =>
    api('post', `/modules/${module}/supports`, token).attach('fichier', contenu, nom);

  const objets = async (module: string): Promise<string[]> => {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `supports/${module}/` }),
    );
    return (res.Contents ?? []).map((o) => o.Key as string).sort();
  };

  const lireObjet = async (cle: string): Promise<Buffer> => {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }));
    return Buffer.from(
      await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
    );
  };

  /**
   * Le worker écrit le statut PUIS la trace d'audit : on attend la trace
   * (5 s au plus) au lieu de la lire une seule fois — sinon test instable
   * (constaté au Sprint 4, US-FORM-04).
   */
  const attendreTraces = async (
    action: string,
    cible: string,
    attendu: number,
  ): Promise<number> => {
    const fin = Date.now() + 5_000;
    for (;;) {
      const n = await auditLogRepository.countBy({ action, cible });
      if (n >= attendu || Date.now() > fin) return n;
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  const attendreStatut = async (
    supportId: string,
    attendu: StatutSupport,
  ): Promise<SupportPedagogique> => {
    const fin = Date.now() + 25_000;
    for (;;) {
      const s = await supportRepository.findOneByOrFail({ id: supportId });
      if (s.statut === attendu) return s;
      if (Date.now() > fin) {
        throw new Error(
          `Support ${supportId} : ${s.statut} au lieu de ${attendu} (${s.derniereErreur})`,
        );
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const nbSegments = async (supportId: string): Promise<number> => {
    const [{ n }] = (await dataSource.query(
      'SELECT count(*)::int AS n FROM segments_support WHERE support_id = $1',
      [supportId],
    )) as Array<{ n: number }>;
    return n;
  };

  const fichiersTemporaires = (): number =>
    existsSync(DOSSIER_SUPPORTS) ? readdirSync(DOSSIER_SUPPORTS).length : 0;

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
    const supports =
      moduleIds.length === 0
        ? []
        : await supportRepository.find({
            where: { moduleId: In(moduleIds) },
            select: { id: true },
          });
    for (const id of moduleIds) {
      const cles = await objets(id).catch(() => [] as string[]);
      if (cles.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: cles.map((Key) => ({ Key })) },
          }),
        );
      }
    }
    if (supports.length > 0) await supportRepository.delete({ id: In(supports.map((s) => s.id)) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    await purgeAudit([
      ...formationIds,
      ...supports.map((s) => s.id),
      ...utilisateurs.map((u) => u.id),
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    process.env.IA_BACKOFF_MS = '50';
    process.env.IA_TENTATIVES = '3';
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
    supportRepository = dataSource.getRepository(SupportPedagogique);
    stockage = moduleRef.get(StockageService);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle],
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
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    const creer = async (titre: string, statut: StatutFormation): Promise<string> => {
      const f = await formationRepo.save(
        formationRepo.create({ titre, statut, capaciteMax: 20, noteMinCertification: 60 }),
      );
      const m = await moduleRepo.save(
        moduleRepo.create({ formationId: f.id, titre: 'Sécurité', ordre: 1 }),
      );
      await affectationRepo.save(
        affectationRepo.create({
          formationId: f.id,
          formateurId: ids.formateur,
          affectePar: ids.admin,
        }),
      );
      return m.id;
    };
    moduleId = await creer(`${MARQUEUR} Back-end`, StatutFormation.OUVERTE);
    moduleArchiveId = await creer(`${MARQUEUR} Archivée`, StatutFormation.ARCHIVEE);
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.IA_BACKOFF_MS;
    delete process.env.IA_TENTATIVES;
  });

  // ===================================================================
  //  Nominal
  // ===================================================================

  describe('Dépôt et indexation (nominal)', () => {
    let txtId: string;

    it('TXT : 202 EN_INDEXATION, puis INDEXE avec des vecteurs pgvector', async () => {
      const contenu = Buffer.from(COURS, 'utf8');
      const res = await deposer(contenu, 'cours-jwt.txt')
        .field('titre', '  Cours   JWT ')
        .expect(202);
      expect(res.body).toEqual(
        expect.objectContaining({
          moduleId,
          titre: 'Cours JWT',
          nomOriginal: 'cours-jwt.txt',
          extension: 'txt',
          tailleOctets: contenu.length,
          sha256: sha(contenu),
          statut: StatutSupport.EN_INDEXATION,
          deposePar: { id: ids.formateur, prenom: 'Test', nom: 'formateur' },
        }),
      );
      expect(res.body).not.toHaveProperty('cleStockage');
      txtId = res.body.id as string;

      const indexe = await attendreStatut(txtId, StatutSupport.INDEXE);
      expect(indexe.nbSegments).toBe(1);
      expect(indexe.modeleEmbeddings).toBe(MODELE_HACHAGE);
      expect(indexe.nbTentatives).toBe(1);
      expect(indexe.dateIndexation).not.toBeNull();
      const [segment] = (await dataSource.query(
        `SELECT ordre, texte, vector_dims(embedding) AS dims,
                round((embedding <=> embedding)::numeric, 6) AS distance
           FROM segments_support WHERE support_id = $1`,
        [txtId],
      )) as Array<{ ordre: number; texte: string; dims: number; distance: string }>;
      expect(segment).toEqual(expect.objectContaining({ ordre: 1, dims: 384 }));
      expect(Number(segment.distance)).toBe(0);
      expect(segment.texte).toContain('signature RS256');

      expect(await lireObjet(indexe.cleStockage)).toEqual(contenu);
      expect(indexe.cleStockage).toBe(`supports/${moduleId}/${txtId}/original.txt`);
      expect(await auditLogRepository.countBy({ action: 'SUPPORT_DEPOSE', cible: txtId })).toBe(1);
      expect(await attendreTraces('SUPPORT_INDEXE', txtId, 1)).toBe(1);
    }, 30_000);

    it('PDF : texte extrait (processus enfant), découpé en plusieurs passages', async () => {
      const pdf = await genererPdfCertificat({
        certificatId: '00000000-0000-4000-8000-000000000001',
        nomApprenant: 'Support de cours',
        titreFormation: `Sécurité des API REST ${'et des jetons JWT '.repeat(5)}`,
        scoreFinal: 90,
        mention: 'Très bien',
        dateEmission: new Date('2026-11-09T10:00:00Z'),
        organismeEmetteur: 'ESPRIT Entreprise',
        urlVerification: 'http://localhost/verifier/x',
      });
      const res = await deposer(pdf, 'Chapitre_PDF.pdf').expect(202);
      expect(res.body.titre).toBe('Chapitre PDF');
      const indexe = await attendreStatut(res.body.id as string, StatutSupport.INDEXE);
      expect(indexe.nbSegments).toBeGreaterThanOrEqual(1);
      const fiche = await api('get', `/supports/${indexe.id}`, tokens.formateur).expect(200);
      expect(fiche.body.apercu[0].texte).toContain('Sécurité des API REST');
      expect(fiche.body).not.toHaveProperty('cleStockage');
    }, 40_000);

    it('PPTX et DOCX : texte des diapositives et du document', async () => {
      const longue = Array.from(
        { length: 40 },
        (_v, i) => `Diapositive sur la rotation des clés numéro ${i}.`,
      );
      const p = await deposer(pptx(['Les jetons JWT', ...longue]), 'cours.pptx').expect(202);
      const d = await deposer(
        docx(['Le chiffrement TLS protège le transport.', COURS]),
        'notes.docx',
      ).expect(202);
      const sp = await attendreStatut(p.body.id as string, StatutSupport.INDEXE);
      const sd = await attendreStatut(d.body.id as string, StatutSupport.INDEXE);
      expect(sp.nbCaracteres).toBeGreaterThan(1000);
      expect(await nbSegments(sd.id)).toBe(sd.nbSegments);
      const [{ texte }] = (await dataSource.query(
        'SELECT texte FROM segments_support WHERE support_id = $1 AND ordre = 1',
        [sd.id],
      )) as Array<{ texte: string }>;
      expect(texte.startsWith('Le chiffrement TLS protège le transport.')).toBe(true);
    }, 40_000);

    it('nom de fichier accentué conservé (multer le décode en latin1)', async () => {
      const res = await deposer(Buffer.from(`${COURS}\nAccents.`), 'Résumé été.txt').expect(202);
      expect(res.body.nomOriginal).toBe('Résumé été.txt');
      expect(res.body.titre).toBe('Résumé été');
      await attendreStatut(res.body.id as string, StatutSupport.INDEXE);
    }, 30_000);

    it('liste du module : plus récents d’abord, jamais la clé de stockage', async () => {
      const res = await api('get', `/modules/${moduleId}/supports`, tokens.formateur).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
      const dates = (res.body as Array<{ dateDepot: string }>).map((s) => s.dateDepot);
      expect([...dates].sort().reverse()).toEqual(dates);
      for (const s of res.body as Array<Record<string, unknown>>) {
        expect(s).not.toHaveProperty('cleStockage');
      }
    });

    it('administrateur : accès global', async () => {
      await api('get', `/modules/${moduleId}/supports`, tokens.admin).expect(200);
      await api('get', `/supports/${txtId}`, tokens.admin).expect(200);
    });
  });

  // ===================================================================
  //  Refus
  // ===================================================================

  describe('Refus (rien n’est enregistré)', () => {
    let avant: { lignes: number; objets: number; temporaires: number };
    beforeAll(async () => {
      avant = {
        lignes: await supportRepository.countBy({ moduleId }),
        objets: (await objets(moduleId)).length,
        temporaires: fichiersTemporaires(),
      };
    });
    afterAll(async () => {
      expect(await supportRepository.countBy({ moduleId })).toBe(avant.lignes);
      expect((await objets(moduleId)).length).toBe(avant.objets);
      await new Promise((r) => setTimeout(r, 200));
      expect(fichiersTemporaires()).toBe(avant.temporaires);
    });

    const message = (res: request.Response): string => res.body.message as string;

    it('400 : fichier absent, format, signature, binaire renommé', async () => {
      const sans = await api('post', `/modules/${moduleId}/supports`, tokens.formateur)
        .field('titre', 'x')
        .expect(400);
      expect(message(sans)).toBe('Joignez le fichier du support dans le champ « fichier ».');
      expect(message(await deposer(Buffer.from('MZ'), 'outil.exe').expect(400))).toMatch(
        /^Format non pris en charge/,
      );
      expect(message(await deposer(Buffer.from('PK\u0003\u0004'), 'faux.pdf').expect(400))).toBe(
        'Le contenu du fichier ne correspond pas à son extension.',
      );
      expect(message(await deposer(Buffer.from([0x41, 0, 0x42]), 'faux.txt').expect(400))).toMatch(
        /données binaires/,
      );
    });

    it('400 : trop gros, champ inattendu, titre trop long', async () => {
      const gros = Buffer.alloc(20 * 1024 * 1024 + 1, 0x41);
      expect(message(await deposer(gros, 'gros.txt').expect(400))).toBe(
        'Le fichier dépasse 20 Mo, la taille maximale d’un support.',
      );
      const champ = await api('post', `/modules/${moduleId}/supports`, tokens.formateur)
        .attach('autre', Buffer.from('texte'), 'a.txt')
        .expect(400);
      expect(message(champ)).toBe('Joignez le fichier du support dans le champ « fichier ».');
      const titre = await deposer(Buffer.from(COURS), 'a.txt')
        .field('titre', 't'.repeat(201))
        .expect(400);
      expect(JSON.stringify(titre.body.message)).toContain('200 caractères');
    }, 30_000);

    it('403 : formateur non affecté (tracé) et apprenant ; 404 ; 400 identifiant', async () => {
      const refus = await auditLogRepository.countBy({
        action: 'ACCES_RESSOURCE_REFUSE',
        userId: ids.autre,
      });
      await deposer(Buffer.from(COURS), 'a.txt', tokens.autre).expect(403);
      await api('get', `/modules/${moduleId}/supports`, tokens.autre).expect(403);
      expect(
        await auditLogRepository.countBy({ action: 'ACCES_RESSOURCE_REFUSE', userId: ids.autre }),
      ).toBe(refus + 2);
      await deposer(Buffer.from(COURS), 'a.txt', tokens.apprenant).expect(403);
      await deposer(Buffer.from(COURS), 'a.txt', tokens.formateur, UUID_INCONNU).expect(404);
      await deposer(Buffer.from(COURS), 'a.txt', tokens.admin, UUID_INCONNU).expect(404);
      await api('get', `/supports/${UUID_INCONNU}`, tokens.formateur).expect(404);
      await api('get', '/supports/pas-un-uuid', tokens.formateur).expect(400);
    });

    it('409 : même fichier déjà déposé dans le module ; formation archivée', async () => {
      const doublon = await deposer(Buffer.from(COURS, 'utf8'), 'copie.txt').expect(409);
      expect(message(doublon)).toBe('Ce fichier a déjà été déposé dans ce module.');
      await deposer(Buffer.from(COURS), 'a.txt', tokens.formateur, moduleArchiveId).expect(409);
      expect(await supportRepository.countBy({ moduleId: moduleArchiveId })).toBe(0);
      expect(await objets(moduleArchiveId)).toEqual([]);
    });
  });

  // ===================================================================
  //  Échecs d'indexation (critère d'erreur du Backlog) et relance
  // ===================================================================

  describe('Échecs d’indexation et relance', () => {
    it('PDF illisible : ECHEC_INDEXATION en UNE tentative, motif français, jamais INDEXE', async () => {
      const res = await deposer(Buffer.from('%PDF-1.4\nrien de lisible\n'), 'casse.pdf').expect(
        202,
      );
      const id = res.body.id as string;
      const echec = await attendreStatut(id, StatutSupport.ECHEC_INDEXATION);
      expect(echec.derniereErreur).toBe('PDF illisible ou endommagé.');
      expect(echec.nbTentatives).toBe(1);
      expect(echec.nbSegments).toBeNull();
      expect(await nbSegments(id)).toBe(0);
      expect(await attendreTraces('SUPPORT_ECHEC_INDEXATION', id, 1)).toBe(1);

      // Relance : nouvel essai (le contenu reste illisible -> nouvel échec).
      const relance = await api('post', `/supports/${id}/reindexer`, tokens.formateur).expect(202);
      expect(relance.body.statut).toBe(StatutSupport.EN_INDEXATION);
      expect(relance.body.derniereErreur).toBeNull();
      await new Promise((r) => setTimeout(r, 300));
      const encore = await attendreStatut(id, StatutSupport.ECHEC_INDEXATION);
      expect(encore.nbTentatives).toBe(2);
      expect(await auditLogRepository.countBy({ action: 'SUPPORT_REINDEXATION', cible: id })).toBe(
        1,
      );
    }, 40_000);

    it('texte sans contenu exploitable (« PDF scanné ») : échec explicite', async () => {
      const res = await deposer(Buffer.from(' . \n - \n . '), 'vide.md').expect(202);
      const echec = await attendreStatut(res.body.id as string, StatutSupport.ECHEC_INDEXATION);
      expect(echec.derniereErreur).toMatch(/^Aucun texte exploitable/);
    }, 30_000);

    it('relance refusée (409) pour un support indexé ; 404 inconnu', async () => {
      const [indexe] = await supportRepository.find({
        where: { moduleId, statut: StatutSupport.INDEXE },
        take: 1,
      });
      await api('post', `/supports/${indexe.id}/reindexer`, tokens.formateur).expect(409);
      await api('post', `/supports/${UUID_INCONNU}/reindexer`, tokens.formateur).expect(404);
      await api('post', `/supports/${indexe.id}/reindexer`, tokens.autre).expect(403);
    });

    it('panne passagère du stockage : rattrapée à la 2e tentative', async () => {
      const espion = jest
        .spyOn(stockage, 'lire')
        .mockRejectedValueOnce(new Error('S3 momentanément injoignable'));
      try {
        const res = await deposer(
          Buffer.from(`${COURS}\nVersion passagère.`),
          'passager.txt',
        ).expect(202);
        const indexe = await attendreStatut(res.body.id as string, StatutSupport.INDEXE);
        expect(indexe.nbTentatives).toBe(2);
      } finally {
        espion.mockRestore();
      }
    }, 30_000);

    it('trois pannes : échec avec un motif générique ; la relance réussit', async () => {
      const espion = jest.spyOn(stockage, 'lire').mockRejectedValue(new Error('S3 en panne'));
      let id: string;
      try {
        const res = await deposer(Buffer.from(`${COURS}\nVersion panne.`), 'panne.txt').expect(202);
        id = res.body.id as string;
        const echec = await attendreStatut(id, StatutSupport.ECHEC_INDEXATION);
        expect(echec.nbTentatives).toBe(3);
        expect(echec.derniereErreur).toBe(MESSAGE_ECHEC_TRANSITOIRE);
      } finally {
        espion.mockRestore();
      }
      await api('post', `/supports/${id}/reindexer`, tokens.formateur).expect(202);
      const indexe = await attendreStatut(id, StatutSupport.INDEXE);
      expect(indexe.nbTentatives).toBe(4);
      expect(indexe.derniereErreur).toBeNull();
    }, 40_000);
  });

  // ===================================================================
  //  Suppression et garanties en base
  // ===================================================================

  describe('Suppression', () => {
    it('supprime la ligne, ses segments et l’objet ; trace', async () => {
      const res = await deposer(Buffer.from(`${COURS}\nÀ supprimer.`), 'jetable.txt').expect(202);
      const id = res.body.id as string;
      const indexe = await attendreStatut(id, StatutSupport.INDEXE);
      await api('delete', `/supports/${id}`, tokens.autre).expect(403);
      await api('delete', `/supports/${id}`, tokens.formateur).expect(204);
      expect(await supportRepository.countBy({ id })).toBe(0);
      expect(await nbSegments(id)).toBe(0);
      expect(await objets(moduleId)).not.toContain(indexe.cleStockage);
      expect(await auditLogRepository.countBy({ action: 'SUPPORT_SUPPRIME', cible: id })).toBe(1);
      await api('delete', `/supports/${id}`, tokens.formateur).expect(404);
    }, 30_000);
  });

  describe('Garanties en base', () => {
    it('aucun support INDEXE sans segments ni modèle ; vecteur de 384 dimensions exigé', async () => {
      const [echec] = await supportRepository.find({
        where: { moduleId, statut: StatutSupport.ECHEC_INDEXATION },
        take: 1,
      });
      await expect(
        dataSource.query(`UPDATE supports_pedagogiques SET statut = 'INDEXE' WHERE id = $1`, [
          echec.id,
        ]),
      ).rejects.toThrow(/CHK_supports_indexe/);
      await expect(
        dataSource.query(
          `INSERT INTO segments_support (support_id, ordre, texte, embedding) VALUES ($1, 99, 'x', '[1,2,3]')`,
          [echec.id],
        ),
      ).rejects.toThrow(/dimensions/);
      await expect(
        dataSource.query(`UPDATE supports_pedagogiques SET extension = 'exe' WHERE id = $1`, [
          echec.id,
        ]),
      ).rejects.toThrow(/CHK_supports_extension/);
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux dépôts simultanés du même fichier : un 202, un 409, un seul objet', async () => {
      // SHARE ROW EXCLUSIVE laisse passer la lecture « déjà déposé ? » mais
      // bloque les INSERT : les deux requêtes déposent leur objet, puis
      // écrivent ensemble ; seule la contrainte UNIQUE les départage.
      const contenu = Buffer.from(`${COURS}\nVersion concurrente.`);
      const objetsAvant = await objets(moduleId);
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('LOCK TABLE supports_pedagogiques IN SHARE ROW EXCLUSIVE MODE');
        const premier = deposer(contenu, 'premier.txt').then((r) => r);
        const second = deposer(contenu, 'second.txt').then((r) => r);
        await new Promise((r) => setTimeout(r, 1500));
        await bloqueur.commitTransaction();
        statuts = (await Promise.all([premier, second])).map((r) => r.status).sort();
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(statuts).toEqual([202, 409]);
      const gagnants = await supportRepository.findBy({ moduleId, sha256: sha(contenu) });
      expect(gagnants).toHaveLength(1);
      const nouveaux = (await objets(moduleId)).filter((c) => !objetsAvant.includes(c));
      expect(nouveaux).toEqual([gagnants[0].cleStockage]);
      await attendreStatut(gagnants[0].id, StatutSupport.INDEXE);
    }, 30_000);

    it('deux relances simultanées : une seule passe (verrou de ligne)', async () => {
      const res = await deposer(Buffer.from('%PDF-1.4\nencore illisible\n'), 'casse2.pdf').expect(
        202,
      );
      const id = res.body.id as string;
      await attendreStatut(id, StatutSupport.ECHEC_INDEXATION);
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('SELECT id FROM supports_pedagogiques WHERE id = $1 FOR UPDATE', [id]);
        const a = api('post', `/supports/${id}/reindexer`, tokens.formateur).then((r) => r);
        const b = api('post', `/supports/${id}/reindexer`, tokens.formateur).then((r) => r);
        await new Promise((r) => setTimeout(r, 1000));
        await bloqueur.commitTransaction();
        statuts = (await Promise.all([a, b])).map((r) => r.status).sort();
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(statuts).toEqual([202, 409]);
      expect(await auditLogRepository.countBy({ action: 'SUPPORT_REINDEXATION', cible: id })).toBe(
        1,
      );
      await attendreStatut(id, StatutSupport.ECHEC_INDEXATION);
    }, 40_000);
  });
});
