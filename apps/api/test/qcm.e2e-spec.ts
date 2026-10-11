import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';

/**
 * Tests d'intégration US-QCM-01 — Créer le contenu d'un QCM.
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - autorisation par ressource sur les routes QCM : formateur affecté et
 *    administrateur passent ; formateur non affecté (403 + audit), apprenant
 *    (403) refusés ; module inconnu (404) ; formation archivée (409) ;
 *  - création en BROUILLON, questions QCU / QCM / Vrai-Faux, règles de
 *    validation (400, rien d'enregistré), bonnes réponses renvoyées au
 *    formateur, ordre, remplacement, réordonnancement, retrait ;
 *  - verrouillage par une tentative : contenu figé (409), explication et
 *    titre toujours modifiables, suppression refusée ;
 *  - un QCM brouillon n'apparaît pas dans « Mon espace » de l'apprenant.
 *
 * Nettoyage rejouable (avant ET après), dans l'ordre des clés RESTRICT :
 * tentatives -> inscriptions -> QCM (CASCADE liaisons) -> questions
 * (CASCADE options) -> formations (CASCADE modules, affectations) -> audit
 * (bypass maintenance) -> utilisateurs. Énoncés et titres portent le marqueur.
 */
describe('Contenu des QCM (e2e) — US-QCM-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (E2E-AFFECT, E2E-AUTH16,
  // E2E-DM, E2E-ESPACE, E2E-FORM01, E2E-INSC01, E2E-MODULES).
  const MARQUEUR = 'E2E-QCM01';
  const EMAIL_ADMIN = 'e2e-qcm01-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-qcm01-form1@cert-eet.local';
  const EMAIL_AUTRE_FORMATEUR = 'e2e-qcm01-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-qcm01-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_FORMATEUR, EMAIL_AUTRE_FORMATEUR, EMAIL_APPRENANT];
  const UUID_INCONNU = '44444444-4444-4444-8444-444444444444';

  let apprenantId: string;
  let tokenAdmin: string;
  let tokenFormateur: string;
  let tokenAutre: string;
  let tokenApprenant: string;
  let formationId: string;
  let moduleId: string;
  let moduleArchiveId: string;
  let qcmId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'put' | 'patch' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const qcu = (enonce: string): Record<string, unknown> => ({
    enonce: `${MARQUEUR} ${enonce}`,
    type: 'QCU',
    explication: 'CI = Continuous Integration.',
    options: [
      { texte: 'Intégration continue', estCorrecte: true },
      { texte: 'Interface client', estCorrecte: false },
    ],
  });

  const purgeAudit = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        ids,
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
    const qcms = await dataSource
      .getRepository(Qcm)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);

    if (utilisateurIds.length > 0) {
      await dataSource.getRepository(TentativeQcm).delete({ apprenantId: In(utilisateurIds) });
      await dataSource.getRepository(Inscription).delete({ apprenantId: In(utilisateurIds) });
    }
    await dataSource.getRepository(Qcm).delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Question).delete({ enonce: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...qcms.map((q) => q.id), ...utilisateurIds]);
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

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, formateur, , apprenant] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_AUTRE_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    apprenantId = apprenant.id;
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenAutre = await login(EMAIL_AUTRE_FORMATEUR);
    tokenApprenant = await login(EMAIL_APPRENANT);

    const formationRepo = dataSource.getRepository(Formation);
    const [ouverte, archivee] = await formationRepo.save(
      [
        { titre: `${MARQUEUR} DevOps`, statut: StatutFormation.OUVERTE },
        { titre: `${MARQUEUR} Ancienne`, statut: StatutFormation.ARCHIVEE },
      ].map((f) => formationRepo.create({ ...f, capaciteMax: 10, noteMinCertification: 60 })),
    );
    formationId = ouverte.id;

    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const [module, moduleArchive] = await moduleRepo.save([
      moduleRepo.create({ formationId, titre: 'Introduction', ordre: 1 }),
      moduleRepo.create({ formationId: archivee.id, titre: 'Ancien', ordre: 1 }),
    ]);
    moduleId = module.id;
    moduleArchiveId = moduleArchive.id;

    // Le formateur 1 est affecté aux deux formations ; le formateur 2 à aucune.
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      [formationId, archivee.id].map((id) =>
        affectationRepo.create({
          formationId: id,
          formateurId: formateur.id,
          affectePar: admin.id,
        }),
      ),
    );

    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save(inscriptionRepo.create({ apprenantId, formationId }));
  });

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Autorisation et création
  // ===================================================================

  describe('Créer un QCM', () => {
    it('201 pour le formateur affecté : BROUILLON, tracé QCM_CREE', async () => {
      const res = await api('post', `/modules/${moduleId}/qcm`, tokenFormateur)
        .send({ titre: `${MARQUEUR} Fondamentaux`, description: 'Culture DevOps' })
        .expect(201);

      expect(res.body).toMatchObject({ moduleId, statut: 'BROUILLON', nbQuestions: 0 });
      qcmId = res.body.id;
      const traces = await auditLogRepository.find({
        where: { action: 'QCM_CREE', cible: qcmId },
      });
      expect(traces).toHaveLength(1);
    });

    it('403 + ACCES_RESSOURCE_REFUSE pour un formateur non affecté ; 403 pour un apprenant', async () => {
      await api('post', `/modules/${moduleId}/qcm`, tokenAutre)
        .send({ titre: `${MARQUEUR} Intrus` })
        .expect(403);
      await api('post', `/modules/${moduleId}/qcm`, tokenApprenant)
        .send({ titre: `${MARQUEUR} Intrus` })
        .expect(403);

      const refus = await auditLogRepository.find({
        where: { action: 'ACCES_RESSOURCE_REFUSE', cible: formationId },
      });
      expect(refus.length).toBeGreaterThanOrEqual(1);
      expect(refus[0].detailsAvantApres).toMatchObject({ ressource: 'module' });
    });

    it('l’administrateur passe sans affectation', async () => {
      const res = await api('post', `/modules/${moduleId}/qcm`, tokenAdmin)
        .send({ titre: `${MARQUEUR} Créé par l’admin` })
        .expect(201);
      await api('delete', `/qcm/${res.body.id}`, tokenAdmin).expect(204);
    });

    it('404 module inconnu ; 409 formation archivée ; 400 titre absent', async () => {
      await api('post', `/modules/${UUID_INCONNU}/qcm`, tokenFormateur)
        .send({ titre: `${MARQUEUR} X` })
        .expect(404);
      await api('post', `/modules/${moduleArchiveId}/qcm`, tokenFormateur)
        .send({ titre: `${MARQUEUR} X` })
        .expect(409);
      await api('post', `/modules/${moduleId}/qcm`, tokenFormateur).send({}).expect(400);
    });
  });

  // ===================================================================
  //  Questions
  // ===================================================================

  describe('Questions', () => {
    it('ajoute un QCU puis un QCM à plusieurs réponses, dans l’ordre, avec les bonnes réponses', async () => {
      const r1 = await api('post', `/qcm/${qcmId}/questions`, tokenFormateur)
        .send(qcu('Que désigne CI ?'))
        .expect(201);
      expect(r1.body).toMatchObject({ type: 'QCU', ordre: 1, ponderation: 1 });
      expect(r1.body.options.map((o: { estCorrecte: boolean }) => o.estCorrecte)).toEqual([
        true,
        false,
      ]);

      const r2 = await api('post', `/qcm/${qcmId}/questions`, tokenFormateur)
        .send({
          enonce: `${MARQUEUR} Outils de conteneurisation ?`,
          type: 'QCM',
          ponderation: 2,
          options: [
            { texte: 'Docker', estCorrecte: true },
            { texte: 'Podman', estCorrecte: true },
            { texte: 'Excel', estCorrecte: false },
          ],
        })
        .expect(201);
      expect(r2.body).toMatchObject({ type: 'QCM', ordre: 2, ponderation: 2 });
    });

    it('ajoute un Vrai/Faux', async () => {
      await api('post', `/qcm/${qcmId}/questions`, tokenFormateur)
        .send({
          enonce: `${MARQUEUR} Docker est une machine virtuelle.`,
          type: 'VRAI_FAUX',
          options: [
            { texte: 'Vrai', estCorrecte: false },
            { texte: 'Faux', estCorrecte: true },
          ],
        })
        .expect(201);
    });

    it.each([
      [
        'une seule option',
        { options: [{ texte: 'A', estCorrecte: true }] },
        'Une question doit proposer au moins 2 options.',
      ],
      [
        'aucune bonne réponse',
        {
          options: [
            { texte: 'A', estCorrecte: false },
            { texte: 'B', estCorrecte: false },
          ],
        },
        'Une question doit avoir au moins une bonne réponse.',
      ],
      [
        'un QCU à deux bonnes réponses',
        {
          options: [
            { texte: 'A', estCorrecte: true },
            { texte: 'B', estCorrecte: true },
          ],
        },
        'Une question à choix unique (QCU) doit avoir exactement une bonne réponse.',
      ],
    ])('400 pour %s, message ciblé, rien enregistré', async (_cas, surcharge, message) => {
      const avant = await dataSource
        .getRepository(Question)
        .countBy({ enonce: Like(`${MARQUEUR}%`) });

      const res = await api('post', `/qcm/${qcmId}/questions`, tokenFormateur)
        .send({ ...qcu('Invalide'), ...surcharge })
        .expect(400);
      expect(res.body.message).toBe(message);

      expect(
        await dataSource.getRepository(Question).countBy({ enonce: Like(`${MARQUEUR}%`) }),
      ).toBe(avant);
    });

    it('400 pour un type sans correction définie, et pour un champ inconnu', async () => {
      await api('post', `/qcm/${qcmId}/questions`, tokenFormateur)
        .send({ ...qcu('Courte'), type: 'REPONSE_COURTE' })
        .expect(400);
      await api('post', `/qcm/${qcmId}/questions`, tokenFormateur)
        .send({ ...qcu('Intrus'), statut: 'PUBLIE' })
        .expect(400);
    });

    it('GET : questions triées, options et bonnes réponses, non verrouillé', async () => {
      const res = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);

      expect(res.body).toMatchObject({ formationId, verrouille: false, nbQuestions: 3 });
      expect(res.body.questions.map((q: { ordre: number }) => q.ordre)).toEqual([1, 2, 3]);
      expect(res.body.questions[0].options[0]).toHaveProperty('estCorrecte', true);
    });

    it('PUT remplace une question (énoncé, type et options)', async () => {
      const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      const questionId = detail.body.questions[0].id;

      const res = await api('put', `/qcm/${qcmId}/questions/${questionId}`, tokenFormateur)
        .send({
          enonce: `${MARQUEUR} Que désigne CD ?`,
          type: 'QCU',
          options: [
            { texte: 'Déploiement continu', estCorrecte: true },
            { texte: 'Disque compact', estCorrecte: false },
            { texte: 'Code dupliqué', estCorrecte: false },
          ],
        })
        .expect(200);
      expect(res.body).toMatchObject({ id: questionId, ordre: 1 });
      expect(res.body.options).toHaveLength(3);
    });

    it('réordonne ; 400 si la liste est incomplète', async () => {
      const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      const ids = detail.body.questions.map((q: { id: string }) => q.id);

      const res = await api('put', `/qcm/${qcmId}/questions/ordre`, tokenFormateur)
        .send({ questionIds: [...ids].reverse() })
        .expect(200);
      expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual([...ids].reverse());

      await api('put', `/qcm/${qcmId}/questions/ordre`, tokenFormateur)
        .send({ questionIds: ids.slice(1) })
        .expect(400);
    });

    it('retire une question et renumérote les suivantes ; 404 pour une question étrangère', async () => {
      const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      const premiere = detail.body.questions[0].id;

      await api('delete', `/qcm/${qcmId}/questions/${premiere}`, tokenFormateur).expect(204);
      const apres = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      expect(apres.body.questions.map((q: { ordre: number }) => q.ordre)).toEqual([1, 2]);
      expect(await dataSource.getRepository(Question).countBy({ id: premiere })).toBe(0);

      await api('delete', `/qcm/${qcmId}/questions/${UUID_INCONNU}`, tokenFormateur).expect(404);
    });

    it('liste les QCM du module avec leur nombre de questions', async () => {
      const res = await api('get', `/modules/${moduleId}/qcm`, tokenFormateur).expect(200);
      expect(res.body).toEqual([
        expect.objectContaining({ id: qcmId, statut: 'BROUILLON', nbQuestions: 2 }),
      ]);
    });

    it('un formateur non affecté ne lit pas le QCM (403) ; un apprenant non plus', async () => {
      await api('get', `/qcm/${qcmId}`, tokenAutre).expect(403);
      await api('get', `/qcm/${qcmId}`, tokenApprenant).expect(403);
    });

    it('un QCM brouillon n’apparaît pas dans « Mon espace » de l’apprenant', async () => {
      const res = await api('get', `/formations/${formationId}/mon-espace`, tokenApprenant).expect(
        200,
      );
      expect(res.body.modules[0].qcms).toEqual([]);
    });
  });

  // ===================================================================
  //  Verrouillage par une tentative
  // ===================================================================

  describe('QCM verrouillé par une tentative', () => {
    let questionId: string;

    beforeAll(async () => {
      const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      questionId = detail.body.questions[0].id;
      // Aucune route ne crée encore de tentative (US-QCM-05) : insertion directe.
      const tentativeRepo = dataSource.getRepository(TentativeQcm);
      await tentativeRepo.save(
        tentativeRepo.create({ apprenantId, qcmId, dateLimite: new Date(Date.now() + 3_600_000) }),
      );
    });

    it('le détail l’indique (verrouille = true)', async () => {
      const res = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      expect(res.body.verrouille).toBe(true);
    });

    it('409 pour ajouter, retirer, réordonner, ou changer le contenu d’une question', async () => {
      await api('post', `/qcm/${qcmId}/questions`, tokenFormateur).send(qcu('Tardive')).expect(409);
      await api('delete', `/qcm/${qcmId}/questions/${questionId}`, tokenFormateur).expect(409);

      const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      const q = detail.body.questions[0];
      await api('put', `/qcm/${qcmId}/questions/ordre`, tokenFormateur)
        .send({ questionIds: detail.body.questions.map((x: { id: string }) => x.id) })
        .expect(409);
      await api('put', `/qcm/${qcmId}/questions/${questionId}`, tokenFormateur)
        .send({
          enonce: `${q.enonce} (modifié)`,
          type: q.type,
          ponderation: q.ponderation,
          options: q.options.map((o: { texte: string; estCorrecte: boolean }) => ({
            texte: o.texte,
            estCorrecte: o.estCorrecte,
          })),
        })
        .expect(409);
    });

    it('l’explication reste modifiable, ainsi que le titre du QCM', async () => {
      const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
      const q = detail.body.questions[0];

      const res = await api('put', `/qcm/${qcmId}/questions/${questionId}`, tokenFormateur)
        .send({
          enonce: q.enonce,
          type: q.type,
          ponderation: q.ponderation,
          explication: 'Explication enrichie après la session.',
          options: q.options.map((o: { texte: string; estCorrecte: boolean }) => ({
            texte: o.texte,
            estCorrecte: o.estCorrecte,
          })),
        })
        .expect(200);
      expect(res.body.explication).toBe('Explication enrichie après la session.');

      await api('patch', `/qcm/${qcmId}`, tokenFormateur)
        .send({ titre: `${MARQUEUR} Fondamentaux (session 1)` })
        .expect(200);
    });

    it('409 pour supprimer le QCM', async () => {
      await api('delete', `/qcm/${qcmId}`, tokenFormateur).expect(409);
    });
  });

  // ===================================================================
  //  Suppression d'un brouillon
  // ===================================================================

  it('supprime un QCM brouillon et ses questions ; tracé QCM_SUPPRIME', async () => {
    const cree = await api('post', `/modules/${moduleId}/qcm`, tokenFormateur)
      .send({ titre: `${MARQUEUR} Jetable` })
      .expect(201);
    const q = await api('post', `/qcm/${cree.body.id}/questions`, tokenFormateur)
      .send(qcu('Jetable'))
      .expect(201);

    await api('delete', `/qcm/${cree.body.id}`, tokenFormateur).expect(204);

    expect(await dataSource.getRepository(Qcm).countBy({ id: cree.body.id })).toBe(0);
    expect(await dataSource.getRepository(Question).countBy({ id: q.body.id })).toBe(0);
    expect(await auditLogRepository.countBy({ action: 'QCM_SUPPRIME', cible: cree.body.id })).toBe(
      1,
    );
  });
});
