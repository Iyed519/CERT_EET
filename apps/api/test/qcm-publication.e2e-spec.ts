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
import { ConfigurationAntiFraude } from '../src/database/entities/configuration-anti-fraude.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';

/**
 * Tests d'intégration US-QCM-04 — Publier un QCM.
 *
 * Couvre, sur l'application réelle : refus « QCM incomplet pour
 * publication » (sans question, sans configuration, tirage trop grand),
 * fenêtre close, publication (PUBLIE, audit QCM_PUBLIE), double publication,
 * accès (formateur non affecté, apprenant), visibilité dans « Mon espace »
 * avec l'état de la fenêtre, retrait de question sur un QCM publié, et
 * publications simultanées (une seule réussit).
 *
 * Nettoyage rejouable (avant ET après) : inscriptions -> QCM (CASCADE
 * configuration et liaisons) -> questions -> formations -> audit -> comptes.
 */
describe('Publication d’un QCM (e2e) — US-QCM-04', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-QCM01, E2E-QCMCONF …).
  const MARQUEUR = 'E2E-QCMPUB';
  const EMAIL_FORMATEUR = 'e2e-qcmpub-form1@cert-eet.local';
  const EMAIL_AUTRE = 'e2e-qcmpub-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-qcmpub-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_FORMATEUR, EMAIL_AUTRE, EMAIL_APPRENANT];

  let tokenFormateur: string;
  let tokenAutre: string;
  let tokenApprenant: string;
  let formationId: string;
  let moduleId: string;

  /** Dates relatives : la fermeture doit toujours être dans le futur. */
  const dans = (jours: number, heures = 0): string =>
    new Date(Date.now() + (jours * 24 + heures) * 3_600_000).toISOString();

  const configuration = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
    randomiserQuestions: true,
    randomiserOptions: true,
    nbQuestionsTirees: null,
    dureeMaxMinutes: 30,
    dateOuverture: dans(10),
    dateFermeture: dans(10, 10),
    nbTentativesMax: 2,
    delaiEntreTentatives: 24,
    blocageSessionsMultiples: true,
    affichageResultats: 'DIFFERE',
    scoreMinValidation: 60,
    ponderationFormation: 30,
    proctoringWebcam: false,
    desactiverCopierColler: false,
    ...surcharge,
  });

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

  const configurer = (id: string, corps: Record<string, unknown> = configuration()): request.Test =>
    api('put', `/qcm/${id}/configuration`, tokenFormateur).send(corps);

  const publier = (id: string, token = tokenFormateur): request.Test =>
    api('patch', `/qcm/${id}/publier`, token);

  const questionIds = async (id: string): Promise<string[]> => {
    const detail = await api('get', `/qcm/${id}`, tokenFormateur).expect(200);
    return (detail.body.questions as Array<{ id: string }>).map((q) => q.id);
  };

  const retirer = (id: string, questionId: string): request.Test =>
    api('delete', `/qcm/${id}/questions/${questionId}`, tokenFormateur);

  const creerQcmAvecQuestions = async (titre: string, nb: number): Promise<string> => {
    const qcm = await api('post', `/modules/${moduleId}/qcm`, tokenFormateur)
      .send({ titre: `${MARQUEUR} ${titre}` })
      .expect(201);
    for (let i = 1; i <= nb; i++) {
      await api('post', `/qcm/${qcm.body.id}/questions`, tokenFormateur)
        .send({
          enonce: `${MARQUEUR} Question ${i}`,
          type: 'QCU',
          options: [
            { texte: 'Oui', estCorrecte: true },
            { texte: 'Non', estCorrecte: false },
          ],
        })
        .expect(201);
    }
    return qcm.body.id as string;
  };

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
    const qcms = await dataSource
      .getRepository(Qcm)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);
    if (utilisateurIds.length > 0) {
      await dataSource.getRepository(Inscription).delete({ apprenantId: In(utilisateurIds) });
    }
    await dataSource.getRepository(Qcm).delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Question).delete({ enonce: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...qcms.map((q) => q.id), ...formations.map((f) => f.id), ...utilisateurIds]);
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
    const [formateur, , apprenant] = await userRepository.save(
      [
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_AUTRE, role: Role.FORMATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenAutre = await login(EMAIL_AUTRE);
    tokenApprenant = await login(EMAIL_APPRENANT);

    const formationRepo = dataSource.getRepository(Formation);
    const formation = await formationRepo.save(
      formationRepo.create({
        titre: `${MARQUEUR} Kubernetes`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 10,
        noteMinCertification: 60,
      }),
    );
    formationId = formation.id;
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    moduleId = (
      await moduleRepo.save(
        moduleRepo.create({ formationId: formation.id, titre: 'Introduction', ordre: 1 }),
      )
    ).id;
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    await affectationRepo.save(
      affectationRepo.create({ formationId: formation.id, formateurId: formateur.id }),
    );

    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save(
      inscriptionRepo.create({ apprenantId: apprenant.id, formationId: formation.id }),
    );
  });

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  it('409 « incomplet » pour un QCM sans question', async () => {
    const vide = await creerQcmAvecQuestions('Vide', 0);

    const res = await publier(vide).expect(409);
    expect(res.body.message).toBe(
      'QCM incomplet pour publication : ajoutez au moins une question.',
    );
  });

  it('409 « incomplet » pour un QCM sans configuration', async () => {
    const brouillon = await creerQcmAvecQuestions('Sans configuration', 2);

    const res = await publier(brouillon).expect(409);
    expect(res.body.message).toBe(
      'QCM incomplet pour publication : configurez les paramètres anti-fraude.',
    );
  });

  it('409 « incomplet » si le tirage dépasse le nombre actuel de questions', async () => {
    const id = await creerQcmAvecQuestions('Tirage', 3);
    await configurer(id, configuration({ nbQuestionsTirees: 3 })).expect(200);
    // Non publié : le retrait est permis, mais rend le tirage impossible.
    await retirer(id, (await questionIds(id))[0]).expect(204);

    const res = await publier(id).expect(409);
    expect(res.body.message).toBe(
      'QCM incomplet pour publication : le tirage prévoit 3 questions, le QCM n’en contient que 2. Ajoutez des questions ou réduisez le tirage.',
    );
  });

  it('409 si la fenêtre d’ouverture est déjà close', async () => {
    const id = await creerQcmAvecQuestions('Fenêtre close', 1);
    await configurer(id).expect(200);
    // Le temps a passé depuis la configuration : simulé directement en base.
    await dataSource
      .getRepository(ConfigurationAntiFraude)
      .update({ qcmId: id }, { dateOuverture: dans(-3), dateFermeture: dans(-1) });

    const res = await publier(id).expect(409);
    expect(res.body.message).toMatch(/fenêtre d’ouverture de ce QCM est close/);
  });

  it('403 pour un formateur non affecté et pour un apprenant', async () => {
    const id = await creerQcmAvecQuestions('Accès', 1);
    await configurer(id).expect(200);

    await publier(id, tokenAutre).expect(403);
    await publier(id, tokenApprenant).expect(403);
    const detail = await api('get', `/qcm/${id}`, tokenFormateur).expect(200);
    expect(detail.body.statut).toBe('NON_PUBLIE');
  });

  describe('QCM complet', () => {
    let qcmId: string;

    beforeAll(async () => {
      qcmId = await creerQcmAvecQuestions('Complet', 3);
      await configurer(qcmId, configuration({ nbQuestionsTirees: 2 })).expect(200);
    });

    it('apprenant : invisible dans « Mon espace » tant qu’il n’est pas publié', async () => {
      const res = await api('get', `/formations/${formationId}/mon-espace`, tokenApprenant).expect(
        200,
      );
      expect(res.body.modules[0].qcms).toEqual([]);
    });

    it('200 : QCM publié, détail renvoyé, publication tracée', async () => {
      const res = await publier(qcmId).expect(200);
      expect(res.body).toMatchObject({ id: qcmId, statut: 'PUBLIE' });

      const traces = await auditLogRepository.find({
        where: { action: 'QCM_PUBLIE', cible: qcmId },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].detailsAvantApres).toMatchObject({
        statut: { avant: 'NON_PUBLIE', apres: 'PUBLIE' },
        nbQuestions: 3,
      });
    });

    it('409 pour une seconde publication', async () => {
      const res = await publier(qcmId).expect(409);
      expect(res.body.message).toBe('Ce QCM est déjà publié.');
    });

    it('apprenant : visible dans « Mon espace », fenêtre « à venir » avec ses dates', async () => {
      const res = await api('get', `/formations/${formationId}/mon-espace`, tokenApprenant).expect(
        200,
      );
      const qcm = res.body.modules[0].qcms[0];
      expect(qcm).toMatchObject({ id: qcmId, fenetre: 'A_VENIR', avancement: 'A_FAIRE' });
      expect(new Date(qcm.dateOuverture).getTime()).toBeGreaterThan(Date.now());
      expect(qcm.dateFermeture).toEqual(expect.any(String));
    });

    it('retrait d’une question : permis tant que le tirage reste possible, 409 ensuite', async () => {
      const [premiere, seconde] = await questionIds(qcmId);

      await retirer(qcmId, premiere).expect(204);
      const res = await retirer(qcmId, seconde).expect(409);
      expect(res.body.message).toBe(
        'Ce QCM est publié et tire 2 questions à chaque tentative : il doit en garder au moins 2.',
      );
      expect(await questionIds(qcmId)).toHaveLength(2);
    });
  });

  it('QCM publié : sa dernière question ne peut pas être retirée', async () => {
    const id = await creerQcmAvecQuestions('Une question', 1);
    await configurer(id).expect(200);
    await publier(id).expect(200);

    const res = await retirer(id, (await questionIds(id))[0]).expect(409);
    expect(res.body.message).toBe('Ce QCM est publié : il doit garder au moins une question.');
  });

  it('publications simultanées : une seule réussit, une seule trace', async () => {
    const id = await creerQcmAvecQuestions('Concurrence', 1);
    await configurer(id).expect(200);

    const reponses = await Promise.all(Array.from({ length: 5 }, () => publier(id)));
    const codes = reponses.map((r) => r.status).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409]);
    expect(await auditLogRepository.countBy({ action: 'QCM_PUBLIE', cible: id })).toBe(1);
  });
});
