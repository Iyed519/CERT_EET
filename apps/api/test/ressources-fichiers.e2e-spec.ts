import {
  DeleteObjectsCommand,
  HeadObjectCommand,
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
import { existsSync, readdirSync } from 'fs';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { RessourceModule } from '../src/database/entities/ressource-module.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import { MESSAGE_CONTENU_NON_CONFORME } from '../src/modules/ressources/fichier-ressource.regles';
import { PREFIXE_JETON } from '../src/modules/ressources/fichiers-ressources.service';
import { DOSSIER_RESSOURCES } from '../src/modules/ressources/depot-ressource';
import { RedisService } from '../src/redis/redis.service';

/**
 * Tests d'intégration US-FORM-06 — Ressources de module : fichiers (révision
 * v1.5), sur l'application réelle et un vrai stockage S3 (MinIO en CI).
 * RESSOURCES_TAILLE_MAX_MO = 1 pour la suite.
 *
 * Couvre : dépôt (PDF et vidéo lisibles, exécutable en téléchargement), objet
 * dans le bucket, audit ; refus 400 / 403 / 404 / 409 / 413, fichiers
 * temporaires supprimés ; lien signé (apprenant inscrit, formateur affecté,
 * administrateur ; refus tracés), lecture SANS jeton d'accès par le lien,
 * en-têtes (inline / attachment, nosniff), plages 206 et 416, lien expiré ;
 * « Mon espace » ; modification, suppression (objet retiré) ; garanties en
 * base ; concurrence FORCÉE de deux dépôts.
 */
describe('Ressources de module — fichiers (e2e) — US-FORM-06', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let ressourceRepository: Repository<RessourceModule>;
  let dataSource: DataSource;
  let redis: RedisService;

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
  const MARQUEUR = 'E2E-RESSFICH';
  const EMAIL = {
    admin: 'e2e-ressfich-admin@cert-eet.local',
    formateur: 'e2e-ressfich-form@cert-eet.local',
    autre: 'e2e-ressfich-autre@cert-eet.local',
    apprenant: 'e2e-ressfich-appr@cert-eet.local',
    suspendu: 'e2e-ressfich-susp@cert-eet.local',
    libre: 'e2e-ressfich-libre@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';

  const PDF = Buffer.from('%PDF-1.7\nCours sur les jetons JWT\n%%EOF\n');
  const MP4 = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftypisom'),
    Buffer.alloc(200, 7),
  ]);
  const EXE = Buffer.from('MZ\u0090\u0000 programme');

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let formationId: string;
  const mod = { M: '', A: '', C: '' };
  const r = { pdf: '', video: '', exe: '', lien: '' };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const api = (
    methode: 'get' | 'post' | 'patch' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);
  const deposer = (
    contenu: Buffer,
    nom: string,
    token = tokens.formateur,
    module = mod.M,
  ): request.Test =>
    api('post', `/modules/${module}/ressources/fichiers`, token).attach('fichier', contenu, nom);
  const lien = (ressourceId: string, token: string): request.Test =>
    api('post', `/ressources/${ressourceId}/lien`, token);
  /** Lecture par le lien signé, SANS jeton d'accès (comme un <video> ou un onglet). */
  const lire = (url: string): request.Test =>
    request(app.getHttpServer())
      .get(url)
      .buffer(true)
      .parse((res, fin) => {
        const morceaux: Buffer[] = [];
        res.on('data', (m: Buffer) => morceaux.push(m));
        res.on('end', () => fin(null, Buffer.concat(morceaux)));
      });
  const objets = async (module: string): Promise<string[]> =>
    (
      (await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `ressources/${module}/` })))
        .Contents ?? []
    ).map((o) => o.Key as string);
  const temporaires = (): number =>
    existsSync(DOSSIER_RESSOURCES) ? readdirSync(DOSSIER_RESSOURCES).length : 0;

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
            .find({ where: { formationId: In(formationIds) } });
    const ressources =
      modules.length === 0
        ? []
        : await ressourceRepository.find({
            where: { moduleId: In(modules.map((m) => m.id)) },
            select: { id: true },
          });
    for (const m of modules) {
      const cles = await objets(m.id).catch(() => [] as string[]);
      if (cles.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: cles.map((Key) => ({ Key })) },
          }),
        );
      }
    }
    if (formationIds.length > 0) {
      await dataSource.getRepository(Inscription).delete({ formationId: In(formationIds) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    await purgeAudit([
      ...formationIds,
      ...ressources.map((x) => x.id),
      ...utilisateurs.map((u) => u.id),
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    process.env.RESSOURCES_TAILLE_MAX_MO = '1';
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
    ressourceRepository = dataSource.getRepository(RessourceModule);
    redis = moduleRef.get(RedisService);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
      suspendu: Role.APPRENANT,
      libre: Role.APPRENANT,
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
      await affectationRepo.save(
        affectationRepo.create({
          formationId: f.id,
          formateurId: ids.formateur,
          affectePar: ids.admin,
        }),
      );
      return f.id;
    };
    formationId = await creer(`${MARQUEUR} Back-end`, StatutFormation.OUVERTE);
    mod.M = (await moduleRepo.save(moduleRepo.create({ formationId, titre: 'JWT', ordre: 1 }))).id;
    mod.C = (
      await moduleRepo.save(moduleRepo.create({ formationId, titre: 'Concurrence', ordre: 2 }))
    ).id;
    const archivee = await creer(`${MARQUEUR} Archivée`, StatutFormation.ARCHIVEE);
    mod.A = (
      await moduleRepo.save(moduleRepo.create({ formationId: archivee, titre: 'X', ordre: 1 }))
    ).id;
    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save(
      [
        { apprenantId: ids.apprenant },
        { apprenantId: ids.suspendu, statut: StatutInscription.SUSPENDUE },
      ].map((i) => inscriptionRepo.create({ ...i, formationId })),
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
    delete process.env.RESSOURCES_TAILLE_MAX_MO;
  });

  describe('Dépôt', () => {
    it('201 : PDF et vidéo lisibles, exécutable en téléchargement ; objets dans le bucket ; audit', async () => {
      const pdf = await deposer(PDF, 'Cours été.pdf')
        .field('description', 'À lire avant le QCM.')
        .expect(201);
      expect(pdf.body).toEqual(
        expect.objectContaining({
          nature: 'FICHIER',
          titre: 'Cours été',
          description: 'À lire avant le QCM.',
          url: null,
          plateforme: null,
          fichier: {
            nomOriginal: 'Cours été.pdf',
            extension: 'pdf',
            tailleOctets: PDF.length,
            lecture: 'PDF',
          },
        }),
      );
      expect(pdf.body).not.toHaveProperty('cleStockage');
      r.pdf = pdf.body.id as string;
      r.video = (await deposer(MP4, 'demo.mp4').field('titre', 'Démo vidéo').expect(201)).body
        .id as string;
      const exe = await deposer(EXE, 'outil.exe').expect(201);
      expect(exe.body.fichier.lecture).toBeNull();
      r.exe = exe.body.id as string;
      expect((await objets(mod.M)).length).toBe(3);
      const stocke = await ressourceRepository.findOneByOrFail({ id: r.pdf });
      const tete = await s3.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: stocke.cleStockage as string }),
      );
      expect(tete.ContentLength).toBe(PDF.length);
      expect(
        await auditLogRepository.countBy({
          action: 'RESSOURCE_AJOUTEE',
          cible: In(Object.values(r).filter(Boolean)),
        }),
      ).toBe(3);
      r.lien = (
        await api('post', `/modules/${mod.M}/ressources/liens`, tokens.formateur)
          .send({ titre: 'Doc', url: 'https://exemple.tn/doc' })
          .expect(201)
      ).body.id as string;
    });

    describe('Refus (rien n’est enregistré)', () => {
      let avant: { lignes: number; objets: number; temp: number };
      beforeAll(async () => {
        avant = {
          lignes: await ressourceRepository.count(),
          objets: (await objets(mod.M)).length,
          temp: temporaires(),
        };
      });
      afterAll(async () => {
        expect(await ressourceRepository.count()).toBe(avant.lignes);
        expect((await objets(mod.M)).length).toBe(avant.objets);
        await new Promise((x) => setTimeout(x, 200));
        expect(temporaires()).toBe(avant.temp);
      });

      it('400 : contenu non conforme, vide, absent', async () => {
        const faux = await deposer(Buffer.from('PK\u0003\u0004'), 'faux.pdf').expect(400);
        expect(faux.body.message).toBe(MESSAGE_CONTENU_NON_CONFORME);
        await deposer(Buffer.alloc(0), 'vide.txt').expect(400);
        await api('post', `/modules/${mod.M}/ressources/fichiers`, tokens.formateur)
          .field('titre', 'x')
          .expect(400);
      });

      it('413 au-delà de la taille configurée (1 Mo pour la suite)', async () => {
        const res = await deposer(Buffer.alloc(1024 * 1024 + 1, 0x41), 'gros.bin').expect(413);
        expect(res.body.message).toBe(
          'Le fichier dépasse 1 Mo, la taille maximale d’une ressource.',
        );
      });

      it('403 formateur non affecté et apprenant ; 404 module ; 409 formation archivée', async () => {
        await deposer(PDF, 'a.pdf', tokens.autre).expect(403);
        await deposer(PDF, 'a.pdf', tokens.apprenant).expect(403);
        await deposer(PDF, 'a.pdf', tokens.admin, UUID_INCONNU).expect(404);
        await deposer(PDF, 'a.pdf', tokens.formateur, mod.A).expect(409);
      });
    });
  });

  describe('Lecture par lien signé', () => {
    it('apprenant inscrit : lien, puis lecture SANS jeton d’accès — PDF en ligne, vrai type, nosniff', async () => {
      const res = await lien(r.pdf, tokens.apprenant).expect(200);
      expect(res.body.url).toMatch(/^\/api\/ressources\/fichiers\/[A-Za-z0-9_-]{43}$/);
      expect(res.body.expireDansSecondes).toBe(600);
      const fichier = await lire(res.body.url as string).expect(200);
      expect(fichier.body).toEqual(PDF);
      expect(fichier.headers['content-type']).toBe('application/pdf');
      expect(fichier.headers['content-disposition']).toBe(
        `inline; filename="Cours _t_.pdf"; filename*=UTF-8''Cours%20%C3%A9t%C3%A9.pdf`,
      );
      expect(fichier.headers['x-content-type-options']).toBe('nosniff');
      expect(fichier.headers['accept-ranges']).toBe('bytes');
    });

    it('vidéo : plages d’octets (206) et plage hors du fichier (416)', async () => {
      const { url } = (await lien(r.video, tokens.apprenant).expect(200)).body as { url: string };
      const debut = await lire(url).set('Range', 'bytes=4-11').expect(206);
      expect(debut.body.toString('latin1')).toBe('ftypisom');
      expect(debut.headers['content-range']).toBe(`bytes 4-11/${MP4.length}`);
      expect(debut.headers['content-type']).toBe('video/mp4');
      const fin = await lire(url).set('Range', `bytes=-10`).expect(206);
      expect(fin.body).toEqual(MP4.subarray(MP4.length - 10));
      const hors = await request(app.getHttpServer())
        .get(url)
        .set('Range', 'bytes=99999-')
        .expect(416);
      expect(hors.headers['content-range']).toBe(`bytes */${MP4.length}`);
    });

    it('format non lisible : téléchargement en octet-stream', async () => {
      const { url } = (await lien(r.exe, tokens.formateur).expect(200)).body as { url: string };
      const res = await lire(url).expect(200);
      expect(res.headers['content-type']).toBe('application/octet-stream');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="outil.exe"/);
    });

    it('administrateur oui ; non inscrit, suspendu, formateur non affecté : 403 tracés', async () => {
      await lien(r.pdf, tokens.admin).expect(200);
      for (const cle of ['libre', 'suspendu', 'autre']) {
        await lien(r.pdf, tokens[cle]).expect(403);
        expect(
          await auditLogRepository.countBy({ action: 'ACCES_RESSOURCE_REFUSE', userId: ids[cle] }),
        ).toBeGreaterThan(0);
      }
    });

    it('404 : ressource inconnue, lien (pas un fichier), jeton invalide ou expiré', async () => {
      await lien(UUID_INCONNU, tokens.admin).expect(404);
      await lien(r.lien, tokens.apprenant).expect(404);
      await request(app.getHttpServer()).get('/api/ressources/fichiers/nimporte-quoi').expect(404);
      const { url } = (await lien(r.pdf, tokens.apprenant).expect(200)).body as { url: string };
      await redis.del(`${PREFIXE_JETON}${url.split('/').pop()}`);
      await request(app.getHttpServer()).get(url).expect(404);
    });
  });

  describe('Mon espace, modification, suppression', () => {
    it('l’apprenant voit les fichiers avec leur mode de lecture, jamais la clé', async () => {
      const res = await api(
        'get',
        `/formations/${formationId}/mon-espace`,
        tokens.apprenant,
      ).expect(200);
      const ressources = res.body.modules[0].ressources as Array<Record<string, unknown>>;
      expect(ressources.map((x) => x.titre)).toEqual(['Cours été', 'Démo vidéo', 'outil', 'Doc']);
      expect(ressources[1].fichier).toEqual(
        expect.objectContaining({ lecture: 'VIDEO', extension: 'mp4' }),
      );
      expect(JSON.stringify(res.body)).not.toContain('ressources/');
    });

    it('PATCH : titre oui, adresse non (400)', async () => {
      await api('patch', `/ressources/${r.exe}`, tokens.formateur)
        .send({ titre: 'Outil de démo' })
        .expect(200);
      await api('patch', `/ressources/${r.exe}`, tokens.formateur)
        .send({ url: 'https://exemple.tn' })
        .expect(400);
    });

    it('DELETE : la ligne et l’objet disparaissent ; le lien existant ne sert plus', async () => {
      const { url } = (await lien(r.exe, tokens.formateur).expect(200)).body as { url: string };
      const cle = (await ressourceRepository.findOneByOrFail({ id: r.exe })).cleStockage as string;
      await api('delete', `/ressources/${r.exe}`, tokens.formateur).expect(204);
      expect(await objets(mod.M)).not.toContain(cle);
      await request(app.getHttpServer()).get(url).expect(404);
    });
  });

  describe('Garanties en base', () => {
    it('un lien sans colonne de fichier, un fichier sans adresse', async () => {
      await expect(
        dataSource.query(`UPDATE ressources_module SET nom_original = 'x.pdf' WHERE id = $1`, [
          r.lien,
        ]),
      ).rejects.toThrow(/CHK_ressources_nature/);
      await expect(
        dataSource.query(`UPDATE ressources_module SET url = 'https://exemple.tn' WHERE id = $1`, [
          r.pdf,
        ]),
      ).rejects.toThrow(/CHK_ressources_nature/);
      await expect(
        dataSource.query(`UPDATE ressources_module SET lecture = 'HTML' WHERE id = $1`, [r.pdf]),
      ).rejects.toThrow(/CHK_ressources_fichier/);
    });
  });

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux dépôts simultanés dans le même module : deux rangs distincts, jamais de 500', async () => {
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('SELECT id FROM modules WHERE id = $1 FOR UPDATE', [mod.C]);
        const a = deposer(PDF, 'a.pdf', tokens.formateur, mod.C).then((x) => x);
        const b = deposer(MP4, 'b.mp4', tokens.formateur, mod.C).then((x) => x);
        await new Promise((x) => setTimeout(x, 1200));
        await bloqueur.commitTransaction();
        statuts = (await Promise.all([a, b])).map((x) => x.status);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(statuts).toEqual([201, 201]);
      const rangs = (await ressourceRepository.find({ where: { moduleId: mod.C } }))
        .map((x) => x.ordre)
        .sort();
      expect(rangs).toEqual([1, 2]);
    }, 30_000);
  });
});
