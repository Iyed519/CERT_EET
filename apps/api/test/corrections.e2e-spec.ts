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
import { Atelier } from '../src/database/entities/atelier.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Correction } from '../src/database/entities/correction.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { Livrable } from '../src/database/entities/livrable.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { NoteCritere } from '../src/database/entities/note-critere.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutLivrable } from '../src/database/enums/statut-livrable.enum';

/**
 * Tests d'intégration US-ATEL-06 — Corriger un livrable critère par critère
 * (DS-03 partie 2, UC5 Formateur), sur l'application réelle, la vraie base et
 * un vrai stockage S3 (MinIO en CI ; serveur S3 compatible en local).
 *
 * Couvre :
 *  - liste des livrables d'un atelier (filtre de statut), fiche du livrable
 *    (grille, correction null), téléchargement d'un fichier (contenu exact,
 *    nom d'origine, tracé) ;
 *  - ouverture : SOUMIS -> EN_CORRECTION, correction créée, tracée ; seconde
 *    ouverture 409 ; l'apprenant voit « en correction », sans aucune note ;
 *  - notation : note, renote (même ligne), score pondéré recalculé,
 *    avancement ; refus 400 (plage, niveau, décimales, champ inconnu,
 *    commentaire), 404 (critère d'un autre atelier), 409 (pas ouverte,
 *    formation archivée) ; administrateur accepté ;
 *  - autorisation par ressource : formateur non affecté 403 tracé, apprenant
 *    403, sur chaque route ;
 *  - garanties de la base : le déclencheur refuse une note incohérente
 *    écrite en SQL direct (points hors plage, niveau d'un autre critère,
 *    critère d'un autre atelier) ;
 *  - concurrence FORCÉE (verrou de la ligne du livrable tenu) : deux
 *    ouvertures -> un 200, un 409 ; deux notes du même critère -> une seule
 *    ligne, la dernière arrivée gagne.
 *
 * Nettoyage rejouable (avant ET après), ordre RESTRICT : objets du bucket et
 * livrables (CASCADE corrections, notes, fichiers) -> inscriptions ->
 * ateliers (CASCADE grilles) -> formations -> audit (bypass maintenance) ->
 * utilisateurs.
 */
describe('Corriger un livrable (e2e) — US-ATEL-06', () => {
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
  // E2E-ESPACE, E2E-FORM01, E2E-GRILLE, E2E-INSC01, E2E-LIVRABLE, E2E-MODULES,
  // E2E-NOTATION, E2E-QCM01, E2E-QCMCONF, E2E-QCMPUB, E2E-REPONSE,
  // E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-ATEL06';
  const EMAIL = {
    admin: 'e2e-atel06-admin@cert-eet.local',
    formateur: 'e2e-atel06-form@cert-eet.local',
    intrus: 'e2e-atel06-intrus@cert-eet.local',
    a: 'e2e-atel06-a@cert-eet.local',
    b: 'e2e-atel06-b@cert-eet.local',
    c: 'e2e-atel06-c@cert-eet.local',
    d: 'e2e-atel06-d@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const APPRENANTS = ['a', 'b', 'c', 'd'] as const;
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const liv: Record<string, string> = {};
  let formationId: string;
  let atelierId: string;
  let autreAtelierId: string;
  // c1 Fonctionnement 60 %, c2 Tests 40 % ; x1 : critère de l'autre atelier.
  const crit = { c1: '', c2: '', x1: '' };

  const PDF = Buffer.from('%PDF-1.7\nRapport du projet API REST\n%%EOF\n');
  const MD = Buffer.from('# README\n\nLancer : npm start\n');

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

  const ouvrir = (livrableId: string, token = tokens.formateur): request.Test =>
    api('patch', `/livrables/${livrableId}/ouvrir`, token);

  const noter = (
    livrableId: string,
    critereId: string,
    corps: Record<string, unknown>,
    token = tokens.formateur,
  ): request.Test =>
    api('put', `/livrables/${livrableId}/correction/criteres/${critereId}`, token).send(corps);

  const binaire = (
    res: request.Response,
    fin: (erreur: Error | null, corps: Buffer) => void,
  ): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };

  const traces = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

  const statut = async (livrableId: string): Promise<StatutLivrable> =>
    (await livrableRepository.findOneByOrFail({ id: livrableId })).statut;

  const objetsDe = async (apprenantId: string): Promise<string[]> => {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `livrables/${apprenantId}/` }),
    );
    return (res.Contents ?? []).map((o) => o.Key as string);
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
      // CASCADE : corrections, notes des critères, fichiers.
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

  /** Crée un atelier, sa grille (critères donnés) validée, et le publie. */
  const atelierPublie = async (
    moduleId: string,
    titre: string,
    dateLimite: string,
    criteres: Array<{ intitule: string; ponderation: number }>,
  ): Promise<{ id: string; criteres: string[] }> => {
    const tf = tokens.formateur;
    const res = await api('post', `/modules/${moduleId}/ateliers`, tf)
      .send({
        titre: `${MARQUEUR} ${titre}`,
        enonce: 'Livrez le rapport en PDF et le README du projet.',
        dateLimite,
        typesLivrables: ['pdf', 'md'],
        tailleMaxMo: 1,
        nbMaxFichiers: 2,
      })
      .expect(201);
    const id = res.body.id as string;
    for (const c of criteres) {
      await api('post', `/ateliers/${id}/grille/criteres`, tf).send(c).expect(201);
    }
    await api('post', `/ateliers/${id}/grille/valider`, tf).expect(200);
    await api('patch', `/ateliers/${id}/publier`, tf).expect(200);
    const grille = await api('get', `/ateliers/${id}/grille`, tf).expect(200);
    return { id, criteres: (grille.body.criteres as Array<{ id: string }>).map((c) => c.id) };
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
      intrus: Role.FORMATEUR,
      a: Role.APPRENANT,
      b: Role.APPRENANT,
      c: Role.APPRENANT,
      d: Role.APPRENANT,
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
      APPRENANTS.map((cle) => inscriptionRepo.create({ apprenantId: ids[cle], formationId })),
    );

    const [dates] = (await dataSource.query(
      `SELECT (now() + interval '30 days') AS futur`,
    )) as Array<{ futur: Date }>;
    const futur = new Date(dates.futur).toISOString();
    const principal = await atelierPublie(module.id, 'Projet API', futur, [
      { intitule: 'Fonctionnement', ponderation: 60 },
      { intitule: 'Tests', ponderation: 40 },
    ]);
    atelierId = principal.id;
    [crit.c1, crit.c2] = principal.criteres;
    const autre = await atelierPublie(module.id, 'Autre atelier', futur, [
      { intitule: 'Qualité', ponderation: 100 },
    ]);
    autreAtelierId = autre.id;
    [crit.x1] = autre.criteres;

    for (const cle of APPRENANTS) {
      const res = await api('post', `/ateliers/${atelierId}/livrable`, tokens[cle])
        .attach('fichiers', PDF, 'Rapport résumé.pdf')
        .attach('fichiers', MD, 'README.md')
        .expect(201);
      liv[cle] = res.body.id as string;
    }
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
    s3.destroy();
  });

  // ===================================================================
  //  Liste, fiche, téléchargement
  // ===================================================================

  describe('Liste des livrables d’un atelier', () => {
    it('200 : les 4 livrables SOUMIS, avancement null, liste blanche', async () => {
      const res = await api('get', `/ateliers/${atelierId}/livrables`, tokens.formateur).expect(
        200,
      );
      expect(res.body).toHaveLength(4);
      expect(res.body.map((l: { id: string }) => l.id).sort()).toEqual(
        APPRENANTS.map((c) => liv[c]).sort(),
      );
      const ligneA = res.body.find((l: { id: string }) => l.id === liv.a);
      expect(ligneA).toEqual({
        id: liv.a,
        apprenant: { id: ids.a, prenom: 'Test', nom: 'a', email: EMAIL.a },
        version: 1,
        statut: 'SOUMIS',
        dateSoumission: expect.any(String),
        enRetard: false,
        nbFichiers: 2,
        avancement: null,
        scoreFinal: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/cle|motDePasse|livrables\//);
    });

    it('filtre statut ; 400 statut inconnu ; autre atelier vide', async () => {
      const soumis = await api(
        'get',
        `/ateliers/${atelierId}/livrables?statut=SOUMIS`,
        tokens.formateur,
      ).expect(200);
      expect(soumis.body).toHaveLength(4);
      const notes = await api(
        'get',
        `/ateliers/${atelierId}/livrables?statut=NOTE`,
        tokens.formateur,
      ).expect(200);
      expect(notes.body).toEqual([]);
      await api('get', `/ateliers/${atelierId}/livrables?statut=FOO`, tokens.formateur).expect(400);
      const autre = await api(
        'get',
        `/ateliers/${autreAtelierId}/livrables`,
        tokens.formateur,
      ).expect(200);
      expect(autre.body).toEqual([]);
    });

    it('403 formateur non affecté (tracé) et apprenant ; 404 atelier inconnu', async () => {
      await api('get', `/ateliers/${atelierId}/livrables`, tokens.intrus).expect(403);
      const refus = await auditLogRepository.find({
        where: { action: 'ACCES_RESSOURCE_REFUSE', userId: ids.intrus, cible: formationId },
      });
      expect(refus.length).toBeGreaterThanOrEqual(1);
      await api('get', `/ateliers/${atelierId}/livrables`, tokens.a).expect(403);
      await api('get', `/ateliers/${UUID_INCONNU}/livrables`, tokens.formateur).expect(404);
    });
  });

  describe('Fiche du livrable et téléchargement', () => {
    it('200 : fichiers, grille, correction null ; jamais la clé de stockage', async () => {
      const res = await api('get', `/livrables/${liv.a}`, tokens.formateur).expect(200);
      expect(res.body.statut).toBe('SOUMIS');
      expect(res.body.atelier).toEqual({
        id: atelierId,
        titre: `${MARQUEUR} Projet API`,
        formationId,
        formationTitre: `${MARQUEUR} Back-end`,
      });
      expect(res.body.fichiers.map((f: { nomOriginal: string }) => f.nomOriginal)).toEqual([
        'Rapport résumé.pdf',
        'README.md',
      ]);
      expect(res.body.criteres.map((c: { id: string }) => c.id)).toEqual([crit.c1, crit.c2]);
      expect(res.body.criteres[0].niveaux).toHaveLength(4);
      expect(res.body.correction).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/cleStockage|livrables\//);
    });

    it('403 non affecté et apprenant ; 404 inconnu ; 400 identifiant mal formé', async () => {
      await api('get', `/livrables/${liv.a}`, tokens.intrus).expect(403);
      await api('get', `/livrables/${liv.a}`, tokens.a).expect(403);
      await api('get', `/livrables/${UUID_INCONNU}`, tokens.formateur).expect(404);
      await api('get', '/livrables/pas-un-uuid', tokens.formateur).expect(400);
    });

    it('téléchargement : contenu exact, nom d’origine, tracé', async () => {
      const res = await api('get', `/livrables/${liv.a}/fichiers/1`, tokens.formateur)
        .buffer(true)
        .parse(binaire)
        .expect(200);
      expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
      expect(res.headers['content-type']).toBe('application/octet-stream');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="Rapport resume.pdf"; filename*=UTF-8''Rapport%20r%C3%A9sum%C3%A9.pdf`,
      );
      const md = await api('get', `/livrables/${liv.a}/fichiers/2`, tokens.formateur)
        .buffer(true)
        .parse(binaire)
        .expect(200);
      expect((md.body as Buffer).toString()).toBe(MD.toString());
      const t = await traces('LIVRABLE_FICHIER_TELECHARGE', liv.a);
      expect(t).toHaveLength(2);
      expect(t[0].userId).toBe(ids.formateur);
      expect(t[0].detailsAvantApres).toMatchObject({ ordre: 1, nomOriginal: 'Rapport résumé.pdf' });
    });

    it('téléchargement : 404 rang inconnu, 400 rang mal formé, 403 apprenant et non affecté', async () => {
      await api('get', `/livrables/${liv.a}/fichiers/9`, tokens.formateur).expect(404);
      await api('get', `/livrables/${liv.a}/fichiers/abc`, tokens.formateur).expect(400);
      await api('get', `/livrables/${liv.a}/fichiers/1`, tokens.a).expect(403);
      await api('get', `/livrables/${liv.a}/fichiers/1`, tokens.intrus).expect(403);
    });
  });

  // ===================================================================
  //  Ouverture
  // ===================================================================

  describe('Ouverture de la correction', () => {
    it('409 : noter avant d’ouvrir', async () => {
      const res = await noter(liv.a, crit.c1, { niveau: 3, pointsPct: 60 }).expect(409);
      expect(res.body.message).toBe(
        'Ouvrez d’abord la correction de ce livrable avant de noter ses critères.',
      );
    });

    it('403 non affecté et apprenant (rien ne change)', async () => {
      await ouvrir(liv.a, tokens.intrus).expect(403);
      await ouvrir(liv.a, tokens.a).expect(403);
      expect(await statut(liv.a)).toBe(StatutLivrable.SOUMIS);
    });

    it('200 : EN_CORRECTION, correction créée et tracée ; seconde ouverture 409', async () => {
      const res = await ouvrir(liv.a).expect(200);
      expect(res.body.statut).toBe('EN_CORRECTION');
      expect(res.body.correction).toMatchObject({
        statut: 'EN_COURS',
        correcteur: { id: ids.formateur, prenom: 'Test', nom: 'formateur' },
        notes: [],
        scoreActuel: 0,
        avancement: { notes: 0, total: 2, complete: false },
      });
      expect(await statut(liv.a)).toBe(StatutLivrable.EN_CORRECTION);
      const t = await traces('CORRECTION_OUVERTE', liv.a);
      expect(t).toHaveLength(1);
      expect(t[0].userId).toBe(ids.formateur);

      const encore = await ouvrir(liv.a).expect(409);
      expect(encore.body.message).toBe(
        'Ce livrable est déjà en correction : reprenez la correction en cours.',
      );
      expect(await dataSource.getRepository(Correction).countBy({ livrableId: liv.a })).toBe(1);
    });

    it('l’apprenant voit « en correction », sans aucune note, et ne peut plus déposer', async () => {
      const fiche = await api('get', `/mes-ateliers/${atelierId}`, tokens.a).expect(200);
      expect(fiche.body.monLivrable.statut).toBe('EN_CORRECTION');
      expect(JSON.stringify(fiche.body)).not.toMatch(/pointsPct|scoreActuel|correction"/);
      await api('post', `/ateliers/${atelierId}/livrable`, tokens.a)
        .attach('fichiers', PDF, 'v2.pdf')
        .expect(409);
    });

    it('liste : avancement 0/2 pour le livrable ouvert', async () => {
      const res = await api(
        'get',
        `/ateliers/${atelierId}/livrables?statut=EN_CORRECTION`,
        tokens.formateur,
      ).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].avancement).toEqual({ notes: 0, total: 2, complete: false });
    });
  });

  // ===================================================================
  //  Notation critère par critère
  // ===================================================================

  describe('Notation critère par critère', () => {
    it('note, renote (même ligne), score pondéré recalculé, avancement', async () => {
      const premiere = await noter(liv.a, crit.c1, {
        niveau: 3,
        pointsPct: 62.5,
        commentaire: '  Les routes répondent, la pagination manque.  ',
      }).expect(200);
      expect(premiere.body).toEqual({
        note: {
          critereId: crit.c1,
          niveau: 3,
          libelleNiveau: 'Bon',
          pointsPct: 62.5,
          contribution: 37.5,
          commentaire: 'Les routes répondent, la pagination manque.',
          updatedAt: expect.any(String),
        },
        scoreActuel: 37.5,
        avancement: { notes: 1, total: 2, complete: false },
      });

      const renote = await noter(liv.a, crit.c1, { niveau: 4, pointsPct: 80 }).expect(200);
      expect(renote.body.scoreActuel).toBe(48);
      expect(renote.body.note.commentaire).toBeNull();

      const tests = await noter(liv.a, crit.c2, {
        niveau: 4,
        pointsPct: 100,
        commentaire: 'Couverture complète.',
      }).expect(200);
      expect(tests.body.scoreActuel).toBe(88);
      expect(tests.body.avancement).toEqual({ notes: 2, total: 2, complete: true });

      expect(await dataSource.getRepository(NoteCritere).countBy({ critereId: crit.c1 })).toBe(1);
      const t = await traces('NOTE_CRITERE_ENREGISTREE', liv.a);
      expect(t).toHaveLength(3);
      expect(t[1].detailsAvantApres).toMatchObject({
        critereId: crit.c1,
        avant: {
          niveau: 3,
          pointsPct: 62.5,
          commentaire: 'Les routes répondent, la pagination manque.',
        },
        apres: { niveau: 4, pointsPct: 80, commentaire: null },
        scoreActuel: 48,
      });

      const fiche = await api('get', `/livrables/${liv.a}`, tokens.formateur).expect(200);
      expect(fiche.body.correction.scoreActuel).toBe(88);
      expect(fiche.body.correction.notes.map((n: { critereId: string }) => n.critereId)).toEqual([
        crit.c1,
        crit.c2,
      ]);
    });

    it.each([
      ['points au-dessus de la plage', { niveau: 3, pointsPct: 80 }, 'Niveau « Bon »'],
      ['points sous la plage', { niveau: 3, pointsPct: 40 }, 'Niveau « Bon »'],
      ['niveau hors 1–4', { niveau: 5, pointsPct: 80 }, 'Le niveau doit être un entier de 1 à 4.'],
      [
        'plus de deux décimales',
        { niveau: 3, pointsPct: 60.555 },
        'Les points sont un nombre avec deux décimales au plus.',
      ],
      [
        'points négatifs',
        { niveau: 1, pointsPct: -1 },
        'Les points sont compris entre 0 et 100 %.',
      ],
      ['champ inconnu', { niveau: 3, pointsPct: 60, note: 12 }, 'property note should not exist'],
      [
        'commentaire trop long',
        { niveau: 3, pointsPct: 60, commentaire: 'x'.repeat(2001) },
        'Le commentaire d’un critère dépasse 2 000 caractères.',
      ],
    ])('400 %s (rien ne change)', async (_cas, corps, message) => {
      const res = await noter(liv.a, crit.c1, corps).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(message);
      const fiche = await api('get', `/livrables/${liv.a}`, tokens.formateur).expect(200);
      expect(fiche.body.correction.scoreActuel).toBe(88);
    });

    it('404 critère d’un autre atelier ou inconnu ; 400 identifiant mal formé', async () => {
      const res = await noter(liv.a, crit.x1, { niveau: 3, pointsPct: 60 }).expect(404);
      expect(res.body.message).toBe('Critère introuvable dans la grille de cet atelier.');
      await noter(liv.a, UUID_INCONNU, { niveau: 3, pointsPct: 60 }).expect(404);
      await api('put', `/livrables/${liv.a}/correction/criteres/pas-un-uuid`, tokens.formateur)
        .send({ niveau: 3, pointsPct: 60 })
        .expect(400);
    });

    it('403 non affecté et apprenant ; administrateur accepté (accès global)', async () => {
      await noter(liv.a, crit.c2, { niveau: 1, pointsPct: 0 }, tokens.intrus).expect(403);
      await noter(liv.a, crit.c2, { niveau: 1, pointsPct: 0 }, tokens.a).expect(403);
      await ouvrir(liv.d, tokens.admin).expect(200);
      const res = await noter(liv.d, crit.c2, { niveau: 2, pointsPct: 50 }, tokens.admin).expect(
        200,
      );
      expect(res.body.scoreActuel).toBe(20);
      const t = await traces('NOTE_CRITERE_ENREGISTREE', liv.d);
      expect(t[0].userId).toBe(ids.admin);
    });

    it('409 formation archivée : ni ouverture ni note', async () => {
      await dataSource.query(`UPDATE formations SET statut = 'ARCHIVEE' WHERE id = $1`, [
        formationId,
      ]);
      try {
        await ouvrir(liv.b).expect(409);
        await noter(liv.a, crit.c1, { niveau: 1, pointsPct: 10 }).expect(409);
        expect(await statut(liv.b)).toBe(StatutLivrable.SOUMIS);
      } finally {
        await dataSource.query(`UPDATE formations SET statut = 'OUVERTE' WHERE id = $1`, [
          formationId,
        ]);
      }
      const fiche = await api('get', `/livrables/${liv.a}`, tokens.formateur).expect(200);
      expect(fiche.body.correction.scoreActuel).toBe(88);
    });
  });

  // ===================================================================
  //  Garanties de la base
  // ===================================================================

  describe('Déclencheur de cohérence (SQL direct)', () => {
    const insererNote = async (
      critereId: string,
      ordreNiveau: number,
      points: number,
    ): Promise<unknown> => {
      const [{ id: correctionId }] = (await dataSource.query(
        'SELECT id FROM corrections WHERE livrable_id = $1',
        [liv.d],
      )) as Array<{ id: string }>;
      const [{ id: niveauId }] = (await dataSource.query(
        'SELECT id FROM niveaux_performance WHERE critere_id = $1 AND ordre = $2',
        [ordreNiveau === 0 ? crit.c2 : critereId, ordreNiveau || 1],
      )) as Array<{ id: string }>;
      return dataSource.query(
        `INSERT INTO notes_criteres (correction_id, critere_id, niveau_id, points_pct)
         VALUES ($1, $2, $3, $4)`,
        [correctionId, critereId, niveauId, points],
      );
    };

    it('refuse des points hors de la plage du niveau', async () => {
      await expect(insererNote(crit.c1, 3, 90)).rejects.toThrow('points hors de la plage');
    });

    it('refuse le niveau d’un autre critère', async () => {
      await expect(insererNote(crit.c1, 0, 10)).rejects.toThrow('le niveau n');
    });

    it('refuse un critère étranger à la grille de l’atelier', async () => {
      await expect(insererNote(crit.x1, 3, 60)).rejects.toThrow('critère étranger');
    });

    it('refuse aussi une mise à jour incohérente', async () => {
      await expect(
        dataSource.query(
          `UPDATE notes_criteres SET points_pct = 99
            WHERE correction_id = (SELECT id FROM corrections WHERE livrable_id = $1)`,
          [liv.d],
        ),
      ).rejects.toThrow('points hors de la plage');
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
    /**
     * Je tiens le verrou de LA LIGNE du livrable : les requêtes l'attendent et
     * PostgreSQL le leur accorde dans l'ordre d'arrivée.
     */
    const sousVerrou = async <T>(
      livrableId: string,
      envois: Array<() => Promise<T>>,
    ): Promise<T[]> => {
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      try {
        await bloqueur.query('SELECT id FROM livrables WHERE id = $1 FOR UPDATE', [livrableId]);
        const enCours: Array<Promise<T>> = [];
        for (const envoi of envois) {
          enCours.push(envoi());
          await new Promise((fin) => setTimeout(fin, 300));
        }
        await new Promise((fin) => setTimeout(fin, 400));
        await bloqueur.commitTransaction();
        return await Promise.all(enCours);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
    };

    it('deux ouvertures simultanées : un 200, un 409, une seule correction', async () => {
      const [premiere, seconde] = await sousVerrou(liv.b, [
        (): Promise<request.Response> => ouvrir(liv.b).then((r) => r),
        (): Promise<request.Response> => ouvrir(liv.b, tokens.admin).then((r) => r),
      ]);
      expect(premiere.status).toBe(200);
      expect(seconde.status).toBe(409);
      expect(await dataSource.getRepository(Correction).countBy({ livrableId: liv.b })).toBe(1);
      expect(await traces('CORRECTION_OUVERTE', liv.b)).toHaveLength(1);
    }, 30_000);

    it('deux notes simultanées du même critère : une seule ligne, la dernière gagne', async () => {
      await ouvrir(liv.c).expect(200);
      const [premiere, seconde] = await sousVerrou(liv.c, [
        (): Promise<request.Response> =>
          noter(liv.c, crit.c1, { niveau: 2, pointsPct: 30 }).then((r) => r),
        (): Promise<request.Response> =>
          noter(liv.c, crit.c1, { niveau: 3, pointsPct: 70 }).then((r) => r),
      ]);
      expect(premiere.status).toBe(200);
      expect(seconde.status).toBe(200);
      const notes = await dataSource.getRepository(NoteCritere).find({
        where: { critereId: crit.c1, correction: { livrableId: liv.c } },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0].pointsPct).toBe(70);
      expect(seconde.body.scoreActuel).toBe(42);
    }, 30_000);
  });
});
