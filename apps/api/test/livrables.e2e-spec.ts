import {
  DeleteObjectsCommand,
  GetObjectCommand,
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
import { createHash } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { Atelier } from '../src/database/entities/atelier.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { FichierLivrable } from '../src/database/entities/fichier-livrable.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { Livrable } from '../src/database/entities/livrable.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import { DOSSIER_TEMPORAIRE } from '../src/modules/ateliers/livrables/depot-fichiers';

/**
 * Tests d'intégration US-ATEL-04 — Soumettre un livrable (DS-03 partie 1,
 * UC4 Apprenant), sur l'application réelle ET un vrai stockage S3 (MinIO en
 * CI ; serveur S3 compatible en local).
 *
 * Couvre :
 *  - dépôt nominal multipart (2 fichiers, commentaire, liens) : version 1,
 *    SOUMIS, SHA-256 de chaque fichier, hash de traçabilité, objets présents
 *    dans le bucket avec le bon contenu, audit LIVRABLE_SOUMIS, fiche à jour ;
 *  - nom accentué conservé ; dépôt pendant la tolérance -> enRetard ;
 *  - refus 400 (aucun fichier, format, contenu renommé, trop gros, trop de
 *    fichiers, champ inattendu, lien, commentaire) ; 409 (déjà soumis, délai
 *    dépassé) ; 403 (non inscrit tracé, suspendu, terminé, formateur) ; 404 ;
 *    dans tous les refus : rien en base, rien dans le bucket ;
 *  - concurrence FORCÉE : deux dépôts simultanés du même apprenant -> un 201,
 *    un 409, et les objets du perdant sont supprimés du bucket ;
 *  - fichiers temporaires toujours supprimés.
 *
 * Nettoyage rejouable (avant ET après), ordre RESTRICT : livrables (CASCADE
 * fichiers) et objets du bucket -> inscriptions -> ateliers (CASCADE grilles)
 * -> formations -> audit (bypass maintenance) -> utilisateurs.
 */
describe('Soumettre un livrable (e2e) — US-ATEL-04', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let livrableRepository: Repository<Livrable>;
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
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe
  // (E2E-AFFECT, E2E-ATEL01, E2E-ATELPUB, E2E-AUTH16, E2E-CORRIGE, E2E-DM,
  // E2E-ESPACE, E2E-FORM01, E2E-GRILLE, E2E-INSC01, E2E-MODULES, E2E-NOTATION,
  // E2E-QCM01, E2E-QCMCONF, E2E-QCMPUB, E2E-REPONSE, E2E-SESSION, E2E-TENTDEM,
  // E2E-TIRAGE).
  const MARQUEUR = 'E2E-LIVRABLE';
  const EMAIL = {
    admin: 'e2e-livrable-admin@cert-eet.local',
    formateur: 'e2e-livrable-form@cert-eet.local',
    apprenant: 'e2e-livrable-appr@cert-eet.local',
    course: 'e2e-livrable-course@cert-eet.local',
    retard: 'e2e-livrable-retard@cert-eet.local',
    libre: 'e2e-livrable-libre@cert-eet.local',
    suspendu: 'e2e-livrable-susp@cert-eet.local',
    termine: 'e2e-livrable-fini@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let formationId: string;
  // P publié ouvert, R publié en tolérance, C publié clos, B brouillon.
  const at = { P: '', R: '', C: '', B: '' };

  const PDF = Buffer.from('%PDF-1.7\nRapport du projet API REST\n%%EOF\n');
  const MD = Buffer.from('# README\n\nLancer : npm start\n');
  const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'patch' | 'put' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const deposer = (atelierId: string, token: string): request.Test =>
    api('post', `/ateliers/${atelierId}/livrable`, token);

  const objetsDe = async (apprenantId: string): Promise<string[]> => {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `livrables/${apprenantId}/` }),
    );
    return (res.Contents ?? []).map((o) => o.Key as string).sort();
  };

  const fichiersTemporaires = (): number =>
    existsSync(DOSSIER_TEMPORAIRE) ? readdirSync(DOSSIER_TEMPORAIRE).length : 0;

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
    const livrables =
      utilisateurIds.length === 0
        ? []
        : await livrableRepository.find({
            where: { apprenantId: In(utilisateurIds) },
            select: { id: true },
          });
    for (const id of utilisateurIds) {
      const cles = await objetsDe(id).catch(() => [] as string[]);
      if (cles.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: cles.map((Key) => ({ Key })) },
          }),
        );
      }
    }
    if (livrables.length > 0) {
      await livrableRepository.delete({ id: In(livrables.map((l) => l.id)) });
    }
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    const ateliers =
      formationIds.length === 0
        ? []
        : await atelierRepository.find({
            where: { module: { formationId: In(formationIds) } },
            relations: { module: true },
            select: { id: true, module: { id: true } },
          });
    if (formationIds.length > 0) {
      await dataSource.getRepository(Inscription).delete({ formationId: In(formationIds) });
    }
    if (ateliers.length > 0) {
      await atelierRepository.delete({ id: In(ateliers.map((a) => a.id)) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([
      ...formationIds,
      ...ateliers.map((a) => a.id),
      ...livrables.map((l) => l.id),
      ...utilisateurIds,
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  /** Crée un atelier, sa grille validée (100 %) et le publie. */
  const atelierPublie = async (
    moduleId: string,
    titre: string,
    dateLimite: string,
  ): Promise<string> => {
    const tf = tokens.formateur;
    const res = await api('post', `/modules/${moduleId}/ateliers`, tf)
      .send({
        titre: `${MARQUEUR} ${titre}`,
        enonce: 'Livrez le rapport en PDF et le README du projet.',
        dateLimite,
        typesLivrables: ['pdf', 'zip', 'md'],
        tailleMaxMo: 1,
        nbMaxFichiers: 2,
        toleranceRetardHeures: 12,
      })
      .expect(201);
    const id = res.body.id as string;
    await api('post', `/ateliers/${id}/grille/criteres`, tf)
      .send({ intitule: 'Qualité', ponderation: 100 })
      .expect(201);
    await api('post', `/ateliers/${id}/grille/valider`, tf).expect(200);
    await api('patch', `/ateliers/${id}/publier`, tf).expect(200);
    return id;
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
    atelierRepository = moduleRef.get<Repository<Atelier>>(getRepositoryToken(Atelier));
    dataSource = moduleRef.get(DataSource, { strict: false });
    livrableRepository = dataSource.getRepository(Livrable);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
      course: Role.APPRENANT,
      retard: Role.APPRENANT,
      libre: Role.APPRENANT,
      suspendu: Role.APPRENANT,
      termine: Role.APPRENANT,
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
    const formation = await formationRepo.save(
      formationRepo.create({
        titre: `${MARQUEUR} Back-end`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    formationId = formation.id;
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const module = await moduleRepo.save(
      moduleRepo.create({ formationId, titre: 'API REST', ordre: 1 }),
    );
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      affectationRepo.create({ formationId, formateurId: ids.formateur, affectePar: ids.admin }),
    );
    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save(
      [
        { apprenantId: ids.apprenant },
        { apprenantId: ids.course },
        { apprenantId: ids.retard },
        { apprenantId: ids.suspendu, statut: StatutInscription.SUSPENDUE },
        { apprenantId: ids.termine, statut: StatutInscription.TERMINEE },
      ].map((i) => inscriptionRepo.create({ ...i, formationId })),
    );

    const [dates] = (await dataSource.query(
      `SELECT (now() + interval '30 days') AS futur`,
    )) as Array<{ futur: Date }>;
    const futur = new Date(dates.futur).toISOString();
    at.P = await atelierPublie(module.id, 'Projet API', futur);
    at.R = await atelierPublie(module.id, 'En tolérance', futur);
    at.C = await atelierPublie(module.id, 'Clos', futur);
    const brouillon = await api('post', `/modules/${module.id}/ateliers`, tokens.formateur)
      .send({
        titre: `${MARQUEUR} Brouillon`,
        enonce: 'Atelier encore en préparation.',
        dateLimite: futur,
        typesLivrables: ['pdf'],
      })
      .expect(201);
    at.B = brouillon.body.id as string;
    // Le temps passe (heure de PostgreSQL) : R est dans sa tolérance de 12 h,
    // C l'a dépassée.
    await dataSource.query(
      `UPDATE ateliers SET date_limite = now() - interval '1 hour' WHERE id = $1`,
      [at.R],
    );
    await dataSource.query(
      `UPDATE ateliers SET date_limite = now() - interval '13 hours' WHERE id = $1`,
      [at.C],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
  });

  // ===================================================================
  //  Refus — rien en base, rien dans le bucket
  // ===================================================================

  describe('Refus (rien n’est enregistré)', () => {
    let temporairesAvant: number;
    beforeAll(() => {
      temporairesAvant = fichiersTemporaires();
    });

    afterAll(async () => {
      expect(await livrableRepository.countBy({ apprenantId: ids.apprenant })).toBe(0);
      expect(await objetsDe(ids.apprenant)).toEqual([]);
      expect(fichiersTemporaires()).toBe(temporairesAvant);
    });

    it.each([
      ['sans fichier', [] as Array<[string, string]>, 'Joignez au moins un fichier.'],
      [
        'extension hors de la liste',
        [['PNG', 'photo.png']],
        'Format non autorisé pour « photo.png ». Extensions acceptées : .pdf, .zip, .md.',
      ],
      [
        'contenu renommé',
        [['ZIP', 'faux.pdf']],
        'Le contenu de « faux.pdf » ne correspond pas à un fichier .pdf.',
      ],
      [
        'trop de fichiers pour l’atelier',
        [
          ['PDF', 'a.pdf'],
          ['PDF', 'b.pdf'],
          ['MD', 'c.md'],
        ],
        'Trop de fichiers : cet atelier en accepte 2 au plus par soumission.',
      ],
    ])('400 %s', async (_cas, fichiers, message) => {
      const contenus: Record<string, Buffer> = { PDF, MD, ZIP, PNG };
      let req = deposer(at.P, tokens.apprenant);
      for (const [type, nom] of fichiers) req = req.attach('fichiers', contenus[type], nom);
      if (fichiers.length === 0) req = req.field('commentaire', 'rien');
      const res = await req.expect(400);
      expect(res.body.message).toBe(message);
    });

    it('400 fichier trop volumineux pour l’atelier (1 Mo)', async () => {
      const gros = Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]);
      const res = await deposer(at.P, tokens.apprenant)
        .attach('fichiers', gros, 'gros.pdf')
        .expect(400);
      expect(res.body.message).toBe(
        'Le fichier « gros.pdf » est trop volumineux : 1 Mo au plus par fichier.',
      );
    });

    it('400 en français pour un champ de fichier inattendu (refus de multer)', async () => {
      const res = await deposer(at.P, tokens.apprenant).attach('fichier', PDF, 'a.pdf').expect(400);
      expect(res.body.message).toBe(
        'Champ de fichier inattendu : joignez les fichiers dans le champ « fichiers ».',
      );
    });

    it('400 lien non http(s) et commentaire trop long', async () => {
      const lien = await deposer(at.P, tokens.apprenant)
        .attach('fichiers', PDF, 'a.pdf')
        .field('liens', 'ftp://exemple.tn/projet')
        .expect(400);
      expect(lien.body.message).toBe(
        'Seuls les liens http(s) sont acceptés : « ftp://exemple.tn/projet ».',
      );
      await deposer(at.P, tokens.apprenant)
        .attach('fichiers', PDF, 'a.pdf')
        .field('commentaire', 'x'.repeat(2001))
        .expect(400);
    });

    it('403 non inscrit (tracé), suspendu, formation terminée, formateur', async () => {
      const refus = await deposer(at.P, tokens.libre).attach('fichiers', PDF, 'a.pdf').expect(403);
      expect(refus.body.message).toBe('Vous n’êtes pas inscrit à cette formation.');
      const traces = await auditLogRepository.find({
        where: { action: 'ACCES_RESSOURCE_REFUSE', userId: ids.libre, cible: formationId },
      });
      expect(traces).toHaveLength(1);
      await deposer(at.P, tokens.suspendu).attach('fichiers', PDF, 'a.pdf').expect(403);
      const fini = await deposer(at.P, tokens.termine).attach('fichiers', PDF, 'a.pdf').expect(403);
      expect(fini.body.message).toBe(
        'Votre formation est terminée : vous ne pouvez plus déposer de livrable.',
      );
      await deposer(at.P, tokens.formateur).attach('fichiers', PDF, 'a.pdf').expect(403);
      for (const cle of ['libre', 'suspendu', 'termine']) {
        expect(await objetsDe(ids[cle])).toEqual([]);
      }
    });

    it('404 brouillon et atelier inconnu ; 400 identifiant mal formé', async () => {
      await deposer(at.B, tokens.apprenant).attach('fichiers', PDF, 'a.pdf').expect(404);
      await deposer(UUID_INCONNU, tokens.apprenant).attach('fichiers', PDF, 'a.pdf').expect(404);
      await api('post', '/ateliers/pas-un-uuid/livrable', tokens.apprenant)
        .attach('fichiers', PDF, 'a.pdf')
        .expect(400);
    });

    it('409 après la tolérance (heure de PostgreSQL)', async () => {
      const res = await deposer(at.C, tokens.apprenant)
        .attach('fichiers', PDF, 'a.pdf')
        .expect(409);
      expect(res.body.message).toBe(
        'La date limite de dépôt est dépassée : cet atelier n’accepte plus de livrable.',
      );
    });
  });

  // ===================================================================
  //  Dépôt nominal
  // ===================================================================

  describe('Dépôt nominal', () => {
    it('201 : version 1 SOUMIS, SHA-256, objets dans le bucket, audit LIVRABLE_SOUMIS', async () => {
      const res = await deposer(at.P, tokens.apprenant)
        .attach('fichiers', PDF, 'Rapport résumé.pdf')
        .attach('fichiers', MD, 'README.md')
        .field('commentaire', '  Voici mon travail.  ')
        .field('liens', 'https://github.com/exemple/projet-api')
        .expect(201);

      const attendu = createHash('sha256')
        .update([sha(PDF), sha(MD)].sort().join('\n'))
        .digest('hex');
      expect(res.body).toMatchObject({
        atelierId: at.P,
        version: 1,
        statut: 'SOUMIS',
        enRetard: false,
        hashTracabilite: attendu,
        commentaire: 'Voici mon travail.',
        liens: ['https://github.com/exemple/projet-api'],
      });
      expect(res.body.fichiers).toEqual([
        {
          ordre: 1,
          nomOriginal: 'Rapport résumé.pdf',
          extension: 'pdf',
          tailleOctets: PDF.length,
          sha256: sha(PDF),
        },
        {
          ordre: 2,
          nomOriginal: 'README.md',
          extension: 'md',
          tailleOctets: MD.length,
          sha256: sha(MD),
        },
      ]);
      expect(res.body).not.toHaveProperty('cleStockage');

      // Les objets existent, avec le bon contenu et le SHA-256 en métadonnée.
      const fichiers = await dataSource
        .getRepository(FichierLivrable)
        .find({ where: { livrableId: res.body.id }, order: { ordre: 'ASC' } });
      expect(await objetsDe(ids.apprenant)).toEqual(fichiers.map((f) => f.cleStockage).sort());
      const objet = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: fichiers[0].cleStockage }),
      );
      const contenu = Buffer.from(
        await (
          objet.Body as { transformToByteArray(): Promise<Uint8Array> }
        ).transformToByteArray(),
      );
      expect(sha(contenu)).toBe(sha(PDF));
      const tete = await s3.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: fichiers[0].cleStockage }),
      );
      expect(tete.Metadata?.sha256).toBe(sha(PDF));
      expect(fichiers[0].cleStockage).toMatch(
        new RegExp(`^livrables/${ids.apprenant}/${at.P}/${res.body.id}/v1/1-Rapport_resume\\.pdf$`),
      );

      const [trace] = await auditLogRepository.find({
        where: { action: 'LIVRABLE_SOUMIS', cible: res.body.id },
      });
      expect(trace).toMatchObject({ userId: ids.apprenant, resultat: 'Succès' });
      expect(trace.detailsAvantApres).toMatchObject({
        atelierId: at.P,
        formationId,
        hashTracabilite: attendu,
        nbFichiers: 2,
        enRetard: false,
      });
    });

    it('la fiche de l’atelier et « Mon espace » montrent mon livrable', async () => {
      const res = await api('get', `/mes-ateliers/${at.P}`, tokens.apprenant).expect(200);
      expect(res.body.monLivrable).toMatchObject({ version: 1, statut: 'SOUMIS' });
      expect(res.body.monLivrable.fichiers).toHaveLength(2);
      const espace = await api('get', `/formations/${formationId}/mon-espace`, tokens.apprenant);
      const statuts = Object.fromEntries(
        espace.body.modules[0].ateliers.map((a: { id: string; statutMonLivrable: string }) => [
          a.id,
          a.statutMonLivrable,
        ]),
      );
      expect(statuts).toEqual({ [at.P]: 'SOUMIS', [at.R]: null, [at.C]: null });
    });

    it('409 pour un deuxième dépôt : rien de plus en base ni dans le bucket', async () => {
      const avant = await objetsDe(ids.apprenant);
      const res = await deposer(at.P, tokens.apprenant)
        .attach('fichiers', PDF, 'v2.pdf')
        .expect(409);
      expect(res.body.message).toBe(
        'Vous avez déjà soumis un livrable pour cet atelier : remplacez-le plutôt (avant la date limite).',
      );
      expect(await livrableRepository.countBy({ apprenantId: ids.apprenant })).toBe(1);
      expect(await objetsDe(ids.apprenant)).toEqual(avant);
    });

    it('201 pendant la tolérance : marqué en retard', async () => {
      const res = await deposer(at.R, tokens.retard)
        .attach('fichiers', ZIP, 'projet.zip')
        .expect(201);
      expect(res.body).toMatchObject({ enRetard: true, hashTracabilite: sha(ZIP) });
    });

    it('CHECK en base : un hash non hexadécimal est refusé', async () => {
      await expect(
        dataSource.query(
          `UPDATE livrables SET hash_tracabilite = repeat('Z', 64) WHERE apprenant_id = $1`,
          [ids.apprenant],
        ),
      ).rejects.toThrow(/CHK_livrables_hash/);
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux dépôts simultanés : un 201, un 409, les objets du perdant sont supprimés', async () => {
      // SHARE ROW EXCLUSIVE laisse passer les lectures (contrôle « déjà
      // soumis ») mais bloque les INSERT : les deux requêtes déposent leurs
      // objets, puis attendent ensemble au moment d'écrire en base.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('LOCK TABLE livrables IN SHARE ROW EXCLUSIVE MODE');
        const envoyer = (nom: string): Promise<request.Response> =>
          deposer(at.P, tokens.course)
            .attach('fichiers', PDF, nom)
            .then((r) => r);
        const premier = envoyer('premier.pdf');
        const second = envoyer('second.pdf');
        await new Promise((fin) => setTimeout(fin, 1500));
        await bloqueur.commitTransaction();
        statuts = (await Promise.all([premier, second])).map((r) => r.status).sort();
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }

      expect(statuts).toEqual([201, 409]);
      const livrables = await livrableRepository.find({
        where: { apprenantId: ids.course },
        relations: { fichiers: true },
      });
      expect(livrables).toHaveLength(1);
      // Le bucket ne garde que l'objet du gagnant.
      expect(await objetsDe(ids.course)).toEqual(
        (livrables[0].fichiers ?? []).map((f) => f.cleStockage),
      );
    }, 30_000);
  });
});
