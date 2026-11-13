import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { RedisService } from '../src/redis/redis.service';
import { MESSAGE_ECHEC_EXTRACTION } from '../src/modules/assistance-ia/extraction-questions/extraction-questions.service';
import {
  MESSAGE_EXTRACTION_EN_COURS,
  MESSAGE_EXTRACTION_NON_RELANCABLE,
  MESSAGE_EXTRACTION_TROP_GROS,
  MESSAGE_FICHIER_EXTRACTION_ABSENT,
  MESSAGE_FICHIER_SUPPRIME,
  MESSAGE_FORMAT_EXTRACTION,
  MESSAGE_QUESTION_EXTRAITE_DECIDEE,
  MESSAGE_REPONSE_A_CHOISIR,
  MESSAGE_SIGNATURE_EXTRACTION,
} from '../src/modules/assistance-ia/extraction-questions/extraction-questions.regles';
import {
  ErreurLlm,
  FOURNISSEUR_LLM,
  FournisseurLlm,
} from '../src/modules/assistance-ia/llm/fournisseur-llm';

/**
 * Tests d'intégration US-IA-08 — Extraction des questions d'un document par
 * l'IA, sur l'application réelle (PostgreSQL, Redis/BullMQ, stockage S3
 * local, worker d'extraction démarré, fournisseur FACTICE).
 *
 * Couvre : DOCX (types, options, réponses), PDF texte sans corrigé (bonne
 * réponse à choisir), PDF scanné et photo JPEG (lecture visuelle), CSV
 * Windows-1252 et XLSX (tableaux), document sans question, fichier piégé
 * (injection : rien publié, rien ajouté) ; revue (accepter telle quelle,
 * modifiée, réponse à choisir obligatoire, rejeter, tout accepter, décision
 * unique) ; fichier supprimé du stockage une fois terminé, gardé en échec ;
 * panne -> ECHEC puis relance ; erreur non récupérable -> échec immédiat ;
 * refus 400 (format, taille, signature, absent) sans appel à l'IA, 401, 403
 * tracé, 404, 409 (QCM tenté, extraction déjà en cours), 429 ; garanties en
 * base ; concurrence FORCÉE (deux acceptations, deux dépôts, tout accepter
 * contre une acceptation).
 */
describe('Extraction de questions par l’IA (e2e) — US-IA-08', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let llm: FournisseurLlm;
  let redis: RedisService;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-EXTRACTQ';
  const EMAIL = {
    admin: 'e2e-extractq-admin@cert-eet.local',
    formateur: 'e2e-extractq-form@cert-eet.local',
    second: 'e2e-extractq-second@cert-eet.local',
    autre: 'e2e-extractq-autre@cert-eet.local',
    apprenant: 'e2e-extractq-appr@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';
  const FIXTURES = join(__dirname, 'fixtures/extraction');
  const BUCKET = process.env.S3_BUCKET_LIVRABLES ?? 'livrables';
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const qcm = { A: '', B: '', tente: '' };
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

  const fixture = (nom: string): Buffer => readFileSync(join(FIXTURES, nom));

  const deposer = (
    qcmId: string,
    contenu: Buffer,
    nom: string,
    token = tokens.formateur,
  ): request.Test =>
    api('post', `/qcm/${qcmId}/extractions`, token).attach('fichier', contenu, nom);

  type Detail = {
    id: string;
    statut: string;
    modeLecture: string | null;
    nbQuestions: number | null;
    nbEcartees: number | null;
    nbTentatives: number;
    derniereErreur: string | null;
    fichierConserve: boolean;
    tronque: boolean;
    modeleLlm: string | null;
    questions: Array<{
      id: string;
      ordre: number;
      enonce: string;
      type: string;
      options: Array<{ texte: string; estCorrecte: boolean }>;
      reponseConnue: boolean;
      explication: string | null;
      niveau: string | null;
      statut: string;
      questionId: string | null;
    }>;
  };

  const detail = async (id: string, token = tokens.formateur): Promise<Detail> =>
    (await api('get', `/extractions/${id}`, token).expect(200)).body as Detail;

  /** Attend une fin (TERMINEE ou ECHEC) : le worker tourne dans l'application. */
  const attendreFin = async (id: string): Promise<Detail> => {
    const fin = Date.now() + 25_000;
    for (;;) {
      const d = await detail(id);
      if (d.statut === 'TERMINEE' || d.statut === 'ECHEC') return d;
      if (Date.now() > fin) throw new Error(`extraction ${id} toujours ${d.statut}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  /** Dépôt + attente de la fin. */
  const extraire = async (qcmId: string, nom: string, contenu = fixture(nom)): Promise<Detail> => {
    const res = await deposer(qcmId, contenu, nom).expect(202);
    return attendreFin(res.body.id as string);
  };

  const objets = async (prefixe: string): Promise<number> =>
    (await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefixe }))).KeyCount ?? 0;

  const nbQuestionsQcm = async (qcmId: string): Promise<number> =>
    (
      (await dataSource.query('SELECT count(*)::int AS n FROM qcm_questions WHERE qcm_id = $1', [
        qcmId,
      ])) as Array<{ n: number }>
    )[0].n;

  const nbExtractions = async (): Promise<number> =>
    (
      (await dataSource.query(
        'SELECT count(*)::int AS n FROM extractions_questions_ia WHERE qcm_id = ANY($1)',
        [Object.values(qcm)],
      )) as Array<{ n: number }>
    )[0].n;

  const audits = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

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
    const formations = (await dataSource.query('SELECT id FROM formations WHERE titre LIKE $1', [
      `${MARQUEUR}%`,
    ])) as Array<{ id: string }>;
    const fIds = formations.map((f) => f.id);
    const qcms = (await dataSource.query(
      `SELECT q.id FROM qcm q JOIN modules m ON m.id = q.module_id WHERE m.formation_id = ANY($1)`,
      [fIds],
    )) as Array<{ id: string }>;
    const qIds = qcms.map((q) => q.id);
    const extractions = (await dataSource.query(
      'SELECT id FROM extractions_questions_ia WHERE qcm_id = ANY($1)',
      [qIds],
    )) as Array<{ id: string }>;
    const extraites = (await dataSource.query(
      'SELECT id FROM questions_extraites_ia WHERE extraction_id = ANY($1)',
      [extractions.map((e) => e.id)],
    )) as Array<{ id: string }>;
    await dataSource.query('DELETE FROM tentatives_qcm WHERE qcm_id = ANY($1)', [qIds]);
    await dataSource.query('DELETE FROM extractions_questions_ia WHERE qcm_id = ANY($1)', [qIds]);
    const questions = (await dataSource.query(
      'SELECT question_id FROM qcm_questions WHERE qcm_id = ANY($1)',
      [qIds],
    )) as Array<{ question_id: string }>;
    await dataSource.query('DELETE FROM qcm_questions WHERE qcm_id = ANY($1)', [qIds]);
    await dataSource.query('DELETE FROM questions WHERE id = ANY($1)', [
      questions.map((q) => q.question_id),
    ]);
    await dataSource.query('DELETE FROM qcm WHERE id = ANY($1)', [qIds]);
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    for (const u of utilisateurs) await redis.del(`limite:ia-extraction:${u.id}`);
    await purgeAudit([
      ...fIds,
      ...qIds,
      ...extractions.map((e) => e.id),
      ...extraites.map((e) => e.id),
      ...utilisateurs.map((u) => u.id),
    ]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    process.env.IA_TENTATIVES = '2';
    process.env.IA_BACKOFF_MS = '100';
    process.env.IA_GENERATIONS_PAR_HEURE = '40';
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
    await app.listen(0);

    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });
    llm = moduleRef.get<FournisseurLlm>(FOURNISSEUR_LLM);
    redis = moduleRef.get(RedisService);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      second: Role.FORMATEUR,
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

    const formation = await dataSource.getRepository(Formation).save(
      dataSource.getRepository(Formation).create({
        titre: `${MARQUEUR} DevOps`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    formationId = formation.id;
    for (const f of ['formateur', 'second']) {
      await dataSource.getRepository(AffectationFormateur).save(
        dataSource.getRepository(AffectationFormateur).create({
          formationId,
          formateurId: ids[f],
          affectePar: ids.admin,
        }),
      );
    }
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const moduleId = (
      await moduleRepo.save(moduleRepo.create({ formationId, titre: 'Outils', ordre: 1 }))
    ).id;
    const creerQcm = async (titre: string): Promise<string> =>
      (await api('post', `/modules/${moduleId}/qcm`, tokens.formateur).send({ titre }).expect(201))
        .body.id as string;
    qcm.A = await creerQcm('Examen importé');
    qcm.B = await creerQcm('Banque importée');
    qcm.tente = await creerQcm('Examen déjà tenté');
    await dataSource.query(
      `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_limite, statut)
       VALUES ($1, $2, now() + interval '1 hour', 'EN_COURS')`,
      [ids.apprenant, qcm.tente],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Extraction : formats
  // ===================================================================

  describe('Extraction (formats)', () => {
    it('sujet Word : tâche de fond, questions recopiées, fichier supprimé, audit', async () => {
      const res = await deposer(qcm.A, fixture('examen-2025.docx'), 'examen-2025.docx').expect(202);
      expect(res.body).toEqual(
        expect.objectContaining({
          qcmId: qcm.A,
          nomFichier: 'examen-2025.docx',
          format: 'docx',
          statut: expect.stringMatching(/^(EN_ATTENTE|EN_COURS|TERMINEE)$/),
          fichierConserve: true,
          formateur: { id: ids.formateur, prenom: 'Test', nom: 'formateur' },
        }),
      );
      expect(res.body).not.toHaveProperty('cleStockage');
      const id = res.body.id as string;
      const [lancee] = await audits('QUESTIONS_EXTRACTION_LANCEE', id);
      expect(lancee).toEqual(
        expect.objectContaining({ userId: ids.formateur, resultat: 'Succès' }),
      );
      expect(lancee.detailsAvantApres).toEqual(
        expect.objectContaining({ qcmId: qcm.A, formationId, format: 'docx' }),
      );

      const d = await attendreFin(id);
      expect(d).toEqual(
        expect.objectContaining({
          statut: 'TERMINEE',
          modeLecture: 'TEXTE',
          nbQuestions: 3,
          nbEcartees: 0,
          nbTentatives: 1,
          modeleLlm: 'factice-v1',
          fichierConserve: false,
          tronque: false,
          derniereErreur: null,
        }),
      );
      expect(d.questions.map((q) => [q.ordre, q.type, q.reponseConnue, q.statut])).toEqual([
        [1, 'QCU', true, 'PROPOSEE'],
        [2, 'QCM', true, 'PROPOSEE'],
        [3, 'VRAI_FAUX', true, 'PROPOSEE'],
      ]);
      expect(d.questions[0]).toEqual(
        expect.objectContaining({
          enonce: 'Quel protocole chiffre les échanges entre un navigateur et un site web ?',
          explication: 'HTTPS ajoute TLS à HTTP.',
          niveau: 'DEBUTANT',
        }),
      );
      expect(d.questions[1].options.filter((o) => o.estCorrecte).map((o) => o.texte)).toEqual([
        'git push',
        'git pull',
      ]);
      expect(await objets(`extractions/${qcm.A}/${id}/`)).toBe(0);
      const [terminee] = await audits('QUESTIONS_EXTRACTION_TERMINEE', id);
      expect(terminee.detailsAvantApres).toEqual(
        expect.objectContaining({
          nbQuestions: 3,
          nbEcartees: 0,
          modeLecture: 'TEXTE',
          tentative: 1,
        }),
      );
      // Rien n'entre dans le QCM sans acceptation.
      expect(await nbQuestionsQcm(qcm.A)).toBe(0);
      const liste = await api('get', `/qcm/${qcm.A}/extractions`, tokens.formateur).expect(200);
      expect((liste.body as Array<{ id: string }>)[0].id).toBe(id);
    });

    it('PDF texte sans corrigé : « bonne réponse à choisir »', async () => {
      const d = await extraire(qcm.A, 'examen-texte.pdf');
      expect(d).toEqual(
        expect.objectContaining({ statut: 'TERMINEE', modeLecture: 'TEXTE', nbQuestions: 3 }),
      );
      expect(d.questions.every((q) => !q.reponseConnue)).toBe(true);
      expect(d.questions.every((q) => q.options.every((o) => !o.estCorrecte))).toBe(true);
    });

    it.each([
      ['PDF scanné (sans texte)', 'examen-scanne.pdf', /dans le PDF scanné/],
      ['photo JPEG d’une feuille', 'feuille.jpg', /sur l’image/],
    ])('%s : lecture visuelle', async (_l, nom, enonce) => {
      const d = await extraire(qcm.B, nom);
      expect(d).toEqual(
        expect.objectContaining({ statut: 'TERMINEE', modeLecture: 'VISION', nbQuestions: 1 }),
      );
      expect(d.questions[0].enonce).toMatch(enonce);
    });

    it('CSV « ; » Windows-1252 et XLSX : une question par ligne, colonnes reconnues', async () => {
      const csv = await extraire(qcm.B, 'banque.csv');
      expect(csv).toEqual(
        expect.objectContaining({ statut: 'TERMINEE', modeLecture: 'TABLEAU', nbQuestions: 3 }),
      );
      expect(csv.questions[2]).toEqual(
        expect.objectContaining({ enonce: 'Que signifie « CI » ?', reponseConnue: false }),
      );
      expect(csv.questions[2].options[0].texte).toBe('Intégration continue');
      const xlsx = await extraire(qcm.B, 'banque.xlsx');
      expect(xlsx).toEqual(expect.objectContaining({ modeLecture: 'TABLEAU', nbQuestions: 2 }));
      expect(xlsx.questions.map((q) => q.niveau)).toEqual(['DEBUTANT', 'INTERMEDIAIRE']);
    });

    it('document sans question : terminée avec 0 question, rien proposé', async () => {
      const d = await extraire(qcm.A, 'sans-question.txt');
      expect(d).toEqual(
        expect.objectContaining({ statut: 'TERMINEE', nbQuestions: 0, nbEcartees: 0 }),
      );
      expect(d.questions).toEqual([]);
    });

    it('fichier piégé (injection) : seule la vraie question est proposée, QCM ni modifié ni publié', async () => {
      const avant = await api('get', `/qcm/${qcm.A}`, tokens.formateur).expect(200);
      const d = await extraire(qcm.A, 'piege.txt');
      expect(d.questions.map((q) => q.enonce)).toEqual(['Quel outil versionne le code source ?']);
      const apres = await api('get', `/qcm/${qcm.A}`, tokens.formateur).expect(200);
      expect(apres.body.statut).toBe('BROUILLON');
      expect(apres.body.nbQuestions).toBe(avant.body.nbQuestions);
    });
  });

  // ===================================================================
  //  Revue humaine
  // ===================================================================

  describe('Revue', () => {
    let docx: Detail;
    beforeAll(async () => {
      docx = await extraire(qcm.A, 'examen-2025.docx');
    });

    it('accepter telle quelle : question en fin de QCM, origine IA, ACCEPTEE, audit', async () => {
      const q = docx.questions[0];
      const avant = await nbQuestionsQcm(qcm.A);
      const res = await api('post', `/questions-extraites/${q.id}/accepter`, tokens.formateur)
        .send({})
        .expect(201);
      expect(res.body.questionExtraite).toEqual(
        expect.objectContaining({ id: q.id, statut: 'ACCEPTEE', decidePar: ids.formateur }),
      );
      expect(res.body.question).toEqual(
        expect.objectContaining({
          enonce: q.enonce,
          type: 'QCU',
          origine: 'IA',
          ordre: avant + 1,
          explication: 'HTTPS ajoute TLS à HTTP.',
          niveauDifficulte: 'DEBUTANT',
          ponderation: 1,
        }),
      );
      expect(res.body.questionExtraite.questionId).toBe(res.body.question.id);
      expect(await nbQuestionsQcm(qcm.A)).toBe(avant + 1);
      const [audit] = await audits('QUESTION_EXTRAITE_ACCEPTEE', q.id);
      expect(audit.detailsAvantApres).toEqual({
        extractionId: docx.id,
        qcmId: qcm.A,
        questionId: res.body.question.id,
        modifiee: false,
      });
    });

    it('accepter retouchée : MODIFIEE, origine IA_MODIFIEE, audit avant / après', async () => {
      const q = docx.questions[1];
      const res = await api('post', `/questions-extraites/${q.id}/accepter`, tokens.formateur)
        .send({
          question: {
            enonce: 'Quelles commandes Git échangent des commits avec un dépôt distant ?',
            type: 'QCM',
            options: q.options,
          },
        })
        .expect(201);
      expect(res.body.questionExtraite.statut).toBe('MODIFIEE');
      expect(res.body.question.origine).toBe('IA_MODIFIEE');
      const [audit] = await audits('QUESTION_EXTRAITE_ACCEPTEE', q.id);
      expect(audit.detailsAvantApres).toEqual(
        expect.objectContaining({
          modifiee: true,
          avant: expect.objectContaining({ type: 'QCM', nbOptions: 4 }),
          apres: expect.objectContaining({
            enonce: 'Quelles commandes Git échangent des commits avec un dépôt distant ?',
          }),
        }),
      );
    });

    it('rejeter avec motif ; une décision ne se prend qu’une fois (409)', async () => {
      const q = docx.questions[2];
      const res = await api('post', `/questions-extraites/${q.id}/rejeter`, tokens.formateur)
        .send({ motif: '  Hors   programme ' })
        .expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({ statut: 'REJETEE', motifRejet: 'Hors programme' }),
      );
      const [audit] = await audits('QUESTION_EXTRAITE_REJETEE', q.id);
      expect(audit.detailsAvantApres).toEqual({
        extractionId: docx.id,
        qcmId: qcm.A,
        motif: 'Hors programme',
      });
      const avant = await nbQuestionsQcm(qcm.A);
      const r1 = await api('post', `/questions-extraites/${q.id}/accepter`, tokens.formateur)
        .send({})
        .expect(409);
      expect(r1.body.message).toBe(MESSAGE_QUESTION_EXTRAITE_DECIDEE);
      await api('post', `/questions-extraites/${docx.questions[0].id}/rejeter`, tokens.formateur)
        .send({})
        .expect(409);
      expect(await nbQuestionsQcm(qcm.A)).toBe(avant);
      await api('post', `/questions-extraites/${q.id}/rejeter`, tokens.formateur)
        .send({ motif: 'x'.repeat(501) })
        .expect(400);
    });

    it('bonne réponse à choisir : 400 sans version retouchée ; acceptée une fois cochée (MODIFIEE)', async () => {
      const pdf = await extraire(qcm.A, 'examen-texte.pdf');
      const q = pdf.questions[0];
      const avant = await nbQuestionsQcm(qcm.A);
      const r = await api('post', `/questions-extraites/${q.id}/accepter`, tokens.formateur)
        .send({})
        .expect(400);
      expect(r.body.message).toBe(MESSAGE_REPONSE_A_CHOISIR);
      // Toujours aucune bonne réponse cochée : règle de l'éditeur.
      await api('post', `/questions-extraites/${q.id}/accepter`, tokens.formateur)
        .send({ question: { enonce: q.enonce, type: 'QCU', options: q.options } })
        .expect(400);
      expect(await nbQuestionsQcm(qcm.A)).toBe(avant);
      expect((await detail(pdf.id)).questions[0].statut).toBe('PROPOSEE');
      // « Tout accepter » ne prend jamais une question incomplète.
      const tout = await api(
        'post',
        `/extractions/${pdf.id}/tout-accepter`,
        tokens.formateur,
      ).expect(200);
      expect(tout.body).toEqual(expect.objectContaining({ acceptees: 0, ignorees: 0 }));
      const res = await api('post', `/questions-extraites/${q.id}/accepter`, tokens.formateur)
        .send({
          question: {
            enonce: q.enonce,
            type: 'QCU',
            options: q.options.map((o) => ({ texte: o.texte, estCorrecte: o.texte === 'HTTPS' })),
          },
        })
        .expect(201);
      expect(res.body.questionExtraite.statut).toBe('MODIFIEE');
      expect(res.body.question.origine).toBe('IA_MODIFIEE');
      expect(await nbQuestionsQcm(qcm.A)).toBe(avant + 1);
    });

    it('tout accepter : seulement les complètes encore à traiter, dans l’ordre du document', async () => {
      const csv = await extraire(qcm.B, 'banque.csv');
      await api('post', `/questions-extraites/${csv.questions[1].id}/rejeter`, tokens.formateur)
        .send({})
        .expect(200);
      const avant = await nbQuestionsQcm(qcm.B);
      const res = await api(
        'post',
        `/extractions/${csv.id}/tout-accepter`,
        tokens.formateur,
      ).expect(200);
      expect(res.body.acceptees).toBe(1);
      expect(res.body.ignorees).toBe(0);
      expect((res.body.extraction as Detail).questions.map((q) => q.statut)).toEqual([
        'ACCEPTEE',
        'REJETEE',
        'PROPOSEE',
      ]);
      expect(await nbQuestionsQcm(qcm.B)).toBe(avant + 1);
      expect(await audits('QUESTION_EXTRAITE_ACCEPTEE', csv.questions[0].id)).toHaveLength(1);
    });

    it('administrateur : lit et décide ; QCM figé entre-temps : 409, rien écrit', async () => {
      const xlsx = await extraire(qcm.B, 'banque.xlsx');
      await api('get', `/extractions/${xlsx.id}`, tokens.admin).expect(200);
      await api('post', `/questions-extraites/${xlsx.questions[0].id}/accepter`, tokens.admin)
        .send({})
        .expect(201);
      const [{ id: tentativeId }] = (await dataSource.query(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_limite, statut)
         VALUES ($1, $2, now() + interval '1 hour', 'EN_COURS') RETURNING id`,
        [ids.apprenant, qcm.B],
      )) as Array<{ id: string }>;
      try {
        const avant = await nbQuestionsQcm(qcm.B);
        await api('post', `/questions-extraites/${xlsx.questions[1].id}/accepter`, tokens.formateur)
          .send({})
          .expect(409);
        await api('post', `/extractions/${xlsx.id}/tout-accepter`, tokens.formateur).expect(409);
        await deposer(qcm.B, fixture('banque.csv'), 'banque.csv').expect(409);
        expect(await nbQuestionsQcm(qcm.B)).toBe(avant);
        // Le rejet reste possible sur un QCM figé.
        await api('post', `/questions-extraites/${xlsx.questions[1].id}/rejeter`, tokens.formateur)
          .send({})
          .expect(200);
      } finally {
        await dataSource.query('DELETE FROM tentatives_qcm WHERE id = $1', [tentativeId]);
      }
    });
  });

  // ===================================================================
  //  Échecs, relance
  // ===================================================================

  describe('Échecs et relance', () => {
    it('panne du fournisseur : ECHEC après les tentatives, fichier gardé ; relance réussie, fichier supprimé', async () => {
      const res = await deposer(
        qcm.A,
        Buffer.from('[factice:panne]\n1. Q ?\nA) a\nB) b\n'),
        'panne.txt',
      ).expect(202);
      const id = res.body.id as string;
      const echec = await attendreFin(id);
      expect(echec).toEqual(
        expect.objectContaining({
          statut: 'ECHEC',
          derniereErreur: MESSAGE_ECHEC_EXTRACTION,
          nbTentatives: 2,
          fichierConserve: true,
        }),
      );
      expect(await objets(`extractions/${qcm.A}/${id}/`)).toBe(1);
      expect(await audits('QUESTIONS_EXTRACTION_ECHEC', id)).toHaveLength(1);

      // Le formateur corrige le fichier à la source ; on simule en remplaçant l'objet.
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `extractions/${qcm.A}/${id}/original.txt`,
          Body: '1. Quelle commande liste les conteneurs ?\nA) docker ps\nB) docker rmi\nRéponse : A\n',
        }),
      );
      const relance = await api('post', `/extractions/${id}/relancer`, tokens.formateur).expect(
        202,
      );
      expect(relance.body.derniereErreur).toBeNull();
      const [audit] = await audits('QUESTIONS_EXTRACTION_RELANCEE', id);
      expect(audit.detailsAvantApres).toEqual({ qcmId: qcm.A, tentativesPrecedentes: 2 });
      const fin = await attendreFin(id);
      expect(fin).toEqual(
        expect.objectContaining({ statut: 'TERMINEE', nbQuestions: 1, fichierConserve: false }),
      );
      expect(await objets(`extractions/${qcm.A}/${id}/`)).toBe(0);
      const r = await api('post', `/extractions/${id}/relancer`, tokens.formateur).expect(409);
      expect(r.body.message).toBe(MESSAGE_EXTRACTION_NON_RELANCABLE);
    });

    it('échec dont le fichier n’est plus conservé : relance refusée (409)', async () => {
      const d = await extraire(qcm.A, 'casse2.pdf', Buffer.from('%PDF-1.4\nillisible'));
      expect(d.statut).toBe('ECHEC');
      await dataSource.query(
        'UPDATE extractions_questions_ia SET cle_stockage = NULL WHERE id = $1',
        [d.id],
      );
      const r = await api('post', `/extractions/${d.id}/relancer`, tokens.formateur).expect(409);
      expect(r.body.message).toBe(MESSAGE_FICHIER_SUPPRIME);
      expect((await detail(d.id)).statut).toBe('ECHEC');
    });

    it('erreur non récupérable (clé refusée) : échec immédiat, message compréhensible', async () => {
      const espion = jest
        .spyOn(llm, 'extraireQuestions')
        .mockRejectedValueOnce(
          new ErreurLlm('Clé du fournisseur d’IA refusée : vérifiez ANTHROPIC_API_KEY.', false),
        );
      try {
        const d = await extraire(qcm.A, 'examen-2025.docx');
        expect(d).toEqual(
          expect.objectContaining({
            statut: 'ECHEC',
            nbTentatives: 1,
            derniereErreur: 'Clé du fournisseur d’IA refusée : vérifiez ANTHROPIC_API_KEY.',
            fichierConserve: true,
          }),
        );
      } finally {
        espion.mockRestore();
      }
    });

    it('PDF illisible : échec définitif sans nouvelle tentative', async () => {
      const d = await extraire(qcm.A, 'casse.pdf', Buffer.from('%PDF-1.4\nrien de lisible'));
      expect(d.statut).toBe('ECHEC');
      expect(d.nbTentatives).toBe(1);
      expect(d.derniereErreur).toMatch(/PDF/);
    });
  });

  // ===================================================================
  //  Refus
  // ===================================================================

  describe('Refus', () => {
    it('fichier refusé : 400 clair, rien enregistré, l’IA n’est pas appelée', async () => {
      const espion = jest.spyOn(llm, 'extraireQuestions');
      const avant = await nbExtractions();
      const cas: Array<[Buffer, string, string]> = [
        [Buffer.alloc(10 * 1024 * 1024 + 1, 0x41), 'gros.txt', MESSAGE_EXTRACTION_TROP_GROS],
        [Buffer.from('diapo'), 'cours.pptx', MESSAGE_FORMAT_EXTRACTION],
        [fixture('examen-2025.docx'), 'renomme.xlsx', MESSAGE_SIGNATURE_EXTRACTION],
        [Buffer.from('pas un pdf'), 'faux.pdf', MESSAGE_SIGNATURE_EXTRACTION],
        [fixture('examen-texte.pdf'), 'photo.jpg', MESSAGE_SIGNATURE_EXTRACTION],
        [Buffer.alloc(0), 'vide.txt', 'Le fichier est vide.'],
      ];
      for (const [contenu, nom, message] of cas) {
        const r = await deposer(qcm.A, contenu, nom).expect(400);
        expect(r.body.message).toBe(message);
      }
      const sans = await api('post', `/qcm/${qcm.A}/extractions`, tokens.formateur).expect(400);
      expect(sans.body.message).toBe(MESSAGE_FICHIER_EXTRACTION_ABSENT);
      await api('post', `/qcm/${qcm.A}/extractions`, tokens.formateur)
        .attach('autre', Buffer.from('x'), 'a.txt')
        .expect(400);
      expect(await nbExtractions()).toBe(avant);
      expect(espion).not.toHaveBeenCalled();
      espion.mockRestore();
    });

    it('401, 403 (rôle, formateur non affecté tracé), 404', async () => {
      await request(app.getHttpServer()).get(`/api/qcm/${qcm.A}/extractions`).expect(401);
      await deposer(qcm.A, fixture('piege.txt'), 'piege.txt', tokens.apprenant).expect(403);
      const [extraction] = (await dataSource.query(
        `SELECT e.id, (SELECT id FROM questions_extraites_ia WHERE extraction_id = e.id LIMIT 1) AS q
           FROM extractions_questions_ia e WHERE e.qcm_id = $1 AND e.nb_questions > 0 LIMIT 1`,
        [qcm.A],
      )) as Array<{ id: string; q: string }>;
      const refus = async (r: request.Test, ressource: string): Promise<void> => {
        await r.expect(403);
        const [a] = await auditLogRepository.find({
          where: { action: 'ACCES_RESSOURCE_REFUSE', userId: ids.autre },
          order: { horodatage: 'DESC' },
          take: 1,
        });
        expect(a.cible).toBe(formationId);
        expect((a.detailsAvantApres as { ressource: string }).ressource).toBe(ressource);
      };
      await refus(deposer(qcm.A, fixture('piege.txt'), 'piege.txt', tokens.autre), 'qcm');
      await refus(api('get', `/extractions/${extraction.id}`, tokens.autre), 'extraction');
      await refus(
        api('post', `/questions-extraites/${extraction.q}/rejeter`, tokens.autre).send({}),
        'questionExtraite',
      );
      await refus(
        api('post', `/extractions/${extraction.id}/tout-accepter`, tokens.autre),
        'extraction',
      );
      await api('get', `/qcm/${UUID_INCONNU}/extractions`, tokens.formateur).expect(404);
      await api('get', `/extractions/${UUID_INCONNU}`, tokens.formateur).expect(404);
      await api('post', `/questions-extraites/${UUID_INCONNU}/accepter`, tokens.formateur)
        .send({})
        .expect(404);
      await api('get', '/extractions/pas-un-uuid', tokens.formateur).expect(400);
    });

    it('409 : QCM déjà tenté ; extraction déjà en cours pour ce formateur', async () => {
      await deposer(qcm.tente, fixture('piege.txt'), 'piege.txt').expect(409);
      const [{ id }] = (await dataSource.query(
        `INSERT INTO extractions_questions_ia
           (qcm_id, formateur_id, nom_fichier, format, taille_octets, sha256, statut)
         VALUES ($1, $2, 'bloque.txt', 'txt', 1, $3, 'EN_COURS') RETURNING id`,
        [qcm.A, ids.second, 'a'.repeat(64)],
      )) as Array<{ id: string }>;
      try {
        const r = await deposer(qcm.A, fixture('piege.txt'), 'piege.txt', tokens.second).expect(
          409,
        );
        expect(r.body.message).toBe(MESSAGE_EXTRACTION_EN_COURS);
        // Un autre formateur n'est pas bloqué.
        const ok = await deposer(qcm.A, fixture('sans-question.txt'), 'sans-question.txt').expect(
          202,
        );
        await attendreFin(ok.body.id as string);
      } finally {
        await dataSource.query('DELETE FROM extractions_questions_ia WHERE id = $1', [id]);
      }
    });

    it('429 : plafond horaire atteint', async () => {
      const cle = `limite:ia-extraction:${ids.second}`;
      for (let i = 0; i < 40; i += 1) await redis.incrementer(cle, 3600);
      try {
        const r = await deposer(qcm.A, fixture('piege.txt'), 'piege.txt', tokens.second).expect(
          429,
        );
        expect(r.body.message).toMatch(/40 extractions par heure/);
      } finally {
        await redis.del(cle);
      }
    });
  });

  // ===================================================================
  //  Base et concurrence
  // ===================================================================

  describe('Garanties en base et concurrence', () => {
    it('une décision ne revient jamais en arrière ; options bornées', async () => {
      const [q] = (await dataSource.query(
        `SELECT x.id FROM questions_extraites_ia x JOIN extractions_questions_ia e ON e.id = x.extraction_id
          WHERE e.qcm_id = ANY($1) AND x.statut <> 'PROPOSEE' LIMIT 1`,
        [[qcm.A, qcm.B]],
      )) as Array<{ id: string }>;
      await expect(
        dataSource.query(
          `UPDATE questions_extraites_ia SET statut = 'PROPOSEE', decide_par = NULL,
             date_decision = NULL, question_id = NULL, motif_rejet = NULL WHERE id = $1`,
          [q.id],
        ),
      ).rejects.toThrow(/définitive/);
      const [e] = (await dataSource.query(
        'SELECT id FROM extractions_questions_ia WHERE qcm_id = $1 LIMIT 1',
        [qcm.A],
      )) as Array<{ id: string }>;
      await expect(
        dataSource.query(
          `INSERT INTO questions_extraites_ia (extraction_id, ordre, enonce, type, options, reponse_connue)
           VALUES ($1, 99, 'Q ?', 'QCU', '[{"texte":"A","estCorrecte":true}]', true)`,
          [e.id],
        ),
      ).rejects.toThrow(/CHK_questions_extraites_options/);
    });

    it('deux acceptations simultanées de la même question : une seule passe', async () => {
      const d = await extraire(qcm.A, 'examen-2025.docx');
      const q = d.questions[0];
      const avant = await nbQuestionsQcm(qcm.A);
      const reponses = await Promise.all(
        [tokens.formateur, tokens.second].map((t) =>
          api('post', `/questions-extraites/${q.id}/accepter`, t).send({}),
        ),
      );
      expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await nbQuestionsQcm(qcm.A)).toBe(avant + 1);
      expect(await audits('QUESTION_EXTRAITE_ACCEPTEE', q.id)).toHaveLength(1);
    });

    it('tout accepter contre des acceptations unitaires : chaque question au plus une fois', async () => {
      const d = await extraire(qcm.A, 'examen-2025.docx');
      const avant = await nbQuestionsQcm(qcm.A);
      const reponses = await Promise.all([
        api('post', `/extractions/${d.id}/tout-accepter`, tokens.formateur),
        ...d.questions.map((q) =>
          api('post', `/questions-extraites/${q.id}/accepter`, tokens.second).send({}),
        ),
      ]);
      expect(reponses[0].status).toBe(200);
      const unitaires = reponses.slice(1).filter((r) => r.status === 201).length;
      expect(reponses[0].body.acceptees + unitaires).toBe(3);
      expect(await nbQuestionsQcm(qcm.A)).toBe(avant + 3);
      const fin = await detail(d.id);
      expect(fin.questions.every((q) => q.statut === 'ACCEPTEE' && q.questionId !== null)).toBe(
        true,
      );
    });

    it('deux dépôts simultanés du même formateur : un seul accepté, l’autre 409', async () => {
      const avant = await nbExtractions();
      const reponses = await Promise.all(
        [1, 2].map(() =>
          deposer(qcm.A, fixture('sans-question.txt'), 'sans-question.txt', tokens.second),
        ),
      );
      const statuts = reponses.map((r) => r.status).sort();
      // Le premier peut déjà être terminé quand le second arrive : 202 + 202 possible.
      expect([JSON.stringify([202, 409]), JSON.stringify([202, 202])]).toContain(
        JSON.stringify(statuts),
      );
      const crees = reponses.filter((r) => r.status === 202);
      expect(await nbExtractions()).toBe(avant + crees.length);
      for (const r of crees) await attendreFin(r.body.id as string);
      const actives = (await dataSource.query(
        `SELECT count(*)::int AS n FROM extractions_questions_ia
          WHERE formateur_id = $1 AND statut IN ('EN_ATTENTE', 'EN_COURS')`,
        [ids.second],
      )) as Array<{ n: number }>;
      expect(actives[0].n).toBe(0);
    });
  });
});
