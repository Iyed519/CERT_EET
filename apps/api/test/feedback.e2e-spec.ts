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
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { Livrable } from '../src/database/entities/livrable.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutLivrable } from '../src/database/enums/statut-livrable.enum';
import { MailService } from '../src/mail/mail.service';
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-ATEL-07 — Feedback immuable et notification
 * (DS-03 partie 2, finalisation), sur l'application réelle et la vraie base.
 *
 * Couvre :
 *  - finalisation nominale : score figé (Σ points × pondération / 100),
 *    commentaire général rogné, correction TERMINEE, livrable NOTE, date de
 *    finalisation (heure de PostgreSQL), audit CORRECTION_FINALISEE, email à
 *    l'apprenant (espion sur MailService : la CI n'a pas de serveur SMTP) ;
 *  - refus : 409 correction pas ouverte, 400 correction incomplète, 400
 *    commentaire général absent / vide / trop long, 403 non affecté et
 *    apprenant, 409 formation archivée ;
 *  - IMMUABILITÉ : après l'envoi, renoter, refinaliser, rouvrir -> 409 ; et la
 *    base refuse toute modification en SQL direct (correction, notes,
 *    livrable), ainsi qu'une correction en cours qui porterait un score ;
 *  - concurrence FORCÉE (verrou de la ligne du livrable tenu) : deux
 *    finalisations -> un 200, un 409, un seul audit, un seul email ;
 *    finalisation puis note simultanées -> la note est refusée (409).
 *
 * Nettoyage rejouable (avant ET après) : même ordre RESTRICT que la suite
 * US-ATEL-06 (la suppression d'un livrable noté reste permise : seules les
 * modifications sont bloquées).
 */
describe('Feedback immuable et notification (e2e) — US-ATEL-07', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let atelierRepository: Repository<Atelier>;
  let livrableRepository: Repository<Livrable>;
  let dataSource: DataSource;
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
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe
  // (E2E-AFFECT, E2E-ATEL01, E2E-ATELPUB, E2E-AUTH16, E2E-CORRIGE, E2E-DM,
  // E2E-ATEL06, E2E-ESPACE, E2E-FORM01, E2E-GRILLE, E2E-INSC01, E2E-LIVRABLE,
  // E2E-MODULES, E2E-NOTATION, E2E-QCM01, E2E-QCMCONF, E2E-QCMPUB,
  // E2E-REPONSE, E2E-SESSION, E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-FEEDBACK';
  const EMAIL = {
    admin: 'e2e-feedback-admin@cert-eet.local',
    formateur: 'e2e-feedback-form@cert-eet.local',
    intrus: 'e2e-feedback-intrus@cert-eet.local',
    a: 'e2e-feedback-a@cert-eet.local',
    b: 'e2e-feedback-b@cert-eet.local',
    c: 'e2e-feedback-c@cert-eet.local',
    d: 'e2e-feedback-d@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const APPRENANTS = ['a', 'b', 'c', 'd'] as const;

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const liv: Record<string, string> = {};
  let formationId: string;
  let atelierId: string;
  // c1 Fonctionnement 60 %, c2 Tests 40 %.
  const crit = { c1: '', c2: '' };

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

  const finaliser = (
    livrableId: string,
    corps: Record<string, unknown>,
    token = tokens.formateur,
  ): request.Test =>
    api('post', `/livrables/${livrableId}/correction/finaliser`, token).send(corps);

  /** Ouvre la correction et note les deux critères : 50 % sur c1 (60), 100 % sur c2 (40). */
  const corrigerEntierement = async (livrableId: string): Promise<void> => {
    await ouvrir(livrableId).expect(200);
    await noter(livrableId, crit.c1, { niveau: 3, pointsPct: 50 }).expect(200);
    await noter(livrableId, crit.c2, { niveau: 4, pointsPct: 100 }).expect(200);
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
    // US-ATEL-09 : des apprenants de la suite peuvent être devenus éligibles.
    await purgerCertificats(dataSource, MARQUEUR);
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
    envoiMail = jest
      .spyOn(moduleRef.get(MailService), 'sendCorrectionFinaliseeEmail')
      .mockResolvedValue(undefined);

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
  //  Refus avant l'envoi
  // ===================================================================

  describe('Refus (rien n’est envoyé)', () => {
    it('409 : correction pas encore ouverte', async () => {
      const res = await finaliser(liv.c, { commentaireGeneral: 'Bien.' }).expect(409);
      expect(res.body.message).toBe(
        'Ouvrez d’abord la correction de ce livrable avant de noter ses critères.',
      );
    });

    it('400 : correction incomplète (un critère non noté)', async () => {
      await ouvrir(liv.a).expect(200);
      await noter(liv.a, crit.c1, { niveau: 3, pointsPct: 50 }).expect(200);
      const res = await finaliser(liv.a, { commentaireGeneral: 'Bien.' }).expect(400);
      expect(res.body.message).toBe('Correction incomplète : 1 critère sur 2 n’est pas noté.');
      expect(await statut(liv.a)).toBe(StatutLivrable.EN_CORRECTION);
    });

    it.each([
      ['absent', {}, 'Le commentaire général doit être un texte.'],
      ['vide après rognage', { commentaireGeneral: '   ' }, 'obligatoire'],
      [
        'trop long',
        { commentaireGeneral: 'x'.repeat(5001) },
        'Le commentaire général dépasse 5 000 caractères.',
      ],
    ])('400 : commentaire général %s', async (_cas, corps, message) => {
      await noter(liv.a, crit.c2, { niveau: 4, pointsPct: 100 }).expect(200);
      const res = await finaliser(liv.a, corps).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(message);
      expect(await statut(liv.a)).toBe(StatutLivrable.EN_CORRECTION);
    });

    it('403 non affecté et apprenant ; 409 formation archivée', async () => {
      await finaliser(liv.a, { commentaireGeneral: 'Bien.' }, tokens.intrus).expect(403);
      await finaliser(liv.a, { commentaireGeneral: 'Bien.' }, tokens.a).expect(403);
      await dataSource.query(`UPDATE formations SET statut = 'ARCHIVEE' WHERE id = $1`, [
        formationId,
      ]);
      try {
        await finaliser(liv.a, { commentaireGeneral: 'Bien.' }).expect(409);
      } finally {
        await dataSource.query(`UPDATE formations SET statut = 'OUVERTE' WHERE id = $1`, [
          formationId,
        ]);
      }
      expect(await statut(liv.a)).toBe(StatutLivrable.EN_CORRECTION);
      expect(await traces('CORRECTION_FINALISEE', liv.a)).toHaveLength(0);
      expect(envoiMail).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  //  Envoi et immuabilité
  // ===================================================================

  describe('Envoi du feedback', () => {
    it('200 : score figé, TERMINEE, NOTE, tracé, apprenant prévenu', async () => {
      const res = await finaliser(liv.a, {
        commentaireGeneral: '  API fonctionnelle ; ajoutez la pagination.  ',
      }).expect(200);
      expect(res.body.statut).toBe('NOTE');
      expect(res.body.correction).toMatchObject({
        statut: 'TERMINEE',
        scoreActuel: 70,
        scoreFinal: 70,
        commentaireGeneral: 'API fonctionnelle ; ajoutez la pagination.',
        avancement: { notes: 2, total: 2, complete: true },
      });
      const [{ ecart }] = (await dataSource.query(
        `SELECT abs(extract(epoch FROM now() - date_finalisation)) AS ecart
           FROM corrections WHERE livrable_id = $1`,
        [liv.a],
      )) as Array<{ ecart: number }>;
      expect(Number(ecart)).toBeLessThan(60);
      expect(await statut(liv.a)).toBe(StatutLivrable.NOTE);

      const t = await traces('CORRECTION_FINALISEE', liv.a);
      expect(t).toHaveLength(1);
      expect(t[0].userId).toBe(ids.formateur);
      expect(t[0].detailsAvantApres).toMatchObject({ score: 70, nbCriteres: 2 });

      expect(envoiMail).toHaveBeenCalledTimes(1);
      expect(envoiMail).toHaveBeenCalledWith(EMAIL.a, {
        prenom: 'Test',
        titreAtelier: `${MARQUEUR} Projet API`,
        titreFormation: `${MARQUEUR} Back-end`,
        atelierId,
        score: 70,
      });

      const liste = await api(
        'get',
        `/ateliers/${atelierId}/livrables?statut=NOTE`,
        tokens.formateur,
      ).expect(200);
      expect(liste.body).toHaveLength(1);
      expect(liste.body[0].scoreFinal).toBe(70);
    });

    it('immuable : renoter, refinaliser, rouvrir -> 409', async () => {
      const note = await noter(liv.a, crit.c1, { niveau: 4, pointsPct: 100 }).expect(409);
      expect(note.body.message).toBe(
        'Ce livrable est déjà noté : sa correction est finalisée et ne se modifie plus.',
      );
      await finaliser(liv.a, { commentaireGeneral: 'Autre avis.' }).expect(409);
      await ouvrir(liv.a).expect(409);
      const fiche = await api('get', `/livrables/${liv.a}`, tokens.formateur).expect(200);
      expect(fiche.body.correction.scoreFinal).toBe(70);
      expect(fiche.body.correction.commentaireGeneral).toBe(
        'API fonctionnelle ; ajoutez la pagination.',
      );
      expect(envoiMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('Immuabilité garantie par la base (SQL direct)', () => {
    it('refuse de modifier une correction TERMINEE', async () => {
      await expect(
        dataSource.query(
          `UPDATE corrections SET commentaire_general = 'modifié' WHERE livrable_id = $1`,
          [liv.a],
        ),
      ).rejects.toThrow('immuable');
    });

    it('refuse de modifier ou d’ajouter une note d’une correction TERMINEE', async () => {
      await expect(
        dataSource.query(
          `UPDATE notes_criteres SET commentaire = 'modifié'
            WHERE correction_id = (SELECT id FROM corrections WHERE livrable_id = $1)`,
          [liv.a],
        ),
      ).rejects.toThrow('immuables');
      await dataSource.query(
        `DELETE FROM notes_criteres WHERE critere_id = $1 AND correction_id =
           (SELECT id FROM corrections WHERE livrable_id = $2)`,
        [crit.c2, liv.a],
      );
      await expect(
        dataSource.query(
          `INSERT INTO notes_criteres (correction_id, critere_id, niveau_id, points_pct)
           SELECT co.id, $2, n.id, 100 FROM corrections co, niveaux_performance n
            WHERE co.livrable_id = $1 AND n.critere_id = $2 AND n.ordre = 4`,
          [liv.a, crit.c2],
        ),
      ).rejects.toThrow('immuables');
    });

    it('refuse de modifier un livrable NOTE', async () => {
      await expect(
        dataSource.query(`UPDATE livrables SET statut = 'EN_CORRECTION' WHERE id = $1`, [liv.a]),
      ).rejects.toThrow('immuable');
    });

    it('refuse une correction EN_COURS qui porterait un score (CHECK)', async () => {
      await ouvrir(liv.d).expect(200);
      await expect(
        dataSource.query(`UPDATE corrections SET score_total = 50 WHERE livrable_id = $1`, [liv.d]),
      ).rejects.toThrow('CHK_corrections_finalisation');
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
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

    it('deux finalisations simultanées : un 200, un 409, un audit, un email', async () => {
      await corrigerEntierement(liv.b);
      envoiMail.mockClear();
      const [premiere, seconde] = await sousVerrou(liv.b, [
        (): Promise<request.Response> =>
          finaliser(liv.b, { commentaireGeneral: 'Premier avis.' }).then((r) => r),
        (): Promise<request.Response> =>
          finaliser(liv.b, { commentaireGeneral: 'Second avis.' }, tokens.admin).then((r) => r),
      ]);
      expect(premiere.status).toBe(200);
      expect(seconde.status).toBe(409);
      expect(await traces('CORRECTION_FINALISEE', liv.b)).toHaveLength(1);
      expect(envoiMail).toHaveBeenCalledTimes(1);
      const fiche = await api('get', `/livrables/${liv.b}`, tokens.formateur).expect(200);
      expect(fiche.body.correction.commentaireGeneral).toBe('Premier avis.');
    }, 30_000);

    it('finalisation puis note simultanées : la note est refusée (409)', async () => {
      await corrigerEntierement(liv.c);
      const [envoi, note] = await sousVerrou(liv.c, [
        (): Promise<request.Response> =>
          finaliser(liv.c, { commentaireGeneral: 'Envoyé.' }).then((r) => r),
        (): Promise<request.Response> =>
          noter(liv.c, crit.c1, { niveau: 1, pointsPct: 0 }).then((r) => r),
      ]);
      expect(envoi.status).toBe(200);
      expect(note.status).toBe(409);
      const fiche = await api('get', `/livrables/${liv.c}`, tokens.formateur).expect(200);
      expect(fiche.body.correction.scoreFinal).toBe(70);
    }, 30_000);
  });
});
