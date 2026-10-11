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
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';

/**
 * Tests d'intégration US-QCM-03 — Paramètres anti-fraude d'un QCM.
 *
 * Couvre, sur l'application réelle : enregistrement (BROUILLON -> NON_PUBLIE,
 * configuration visible dans le détail, audit QCM_CONFIGURE), remplacement
 * sans doublon, QCM sans question (409), validations de champ et croisées
 * (400), formateur non affecté (403), QCM publié jamais rétrogradé, et QCM
 * déjà tenté : seule la fermeture peut être repoussée.
 *
 * Nettoyage rejouable (avant ET après) : tentatives -> QCM (CASCADE
 * configuration et liaisons) -> questions -> formations -> audit -> comptes.
 */
describe('Paramètres anti-fraude (e2e) — US-QCM-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-QCM01 …).
  const MARQUEUR = 'E2E-QCMCONF';
  const EMAIL_FORMATEUR = 'e2e-qcmconf-form1@cert-eet.local';
  const EMAIL_AUTRE = 'e2e-qcmconf-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-qcmconf-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_FORMATEUR, EMAIL_AUTRE, EMAIL_APPRENANT];

  let apprenantId: string;
  let tokenFormateur: string;
  let tokenAutre: string;
  let moduleId: string;
  let qcmId: string;

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

  const api = (methode: 'get' | 'post' | 'put', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const configurer = (
    id: string,
    corps: Record<string, unknown>,
    token = tokenFormateur,
  ): request.Test => api('put', `/qcm/${id}/configuration`, token).send(corps);

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
      await dataSource.getRepository(TentativeQcm).delete({ apprenantId: In(utilisateurIds) });
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
    apprenantId = apprenant.id;
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenAutre = await login(EMAIL_AUTRE);

    const formationRepo = dataSource.getRepository(Formation);
    const formation = await formationRepo.save(
      formationRepo.create({
        titre: `${MARQUEUR} DevOps`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 10,
        noteMinCertification: 60,
      }),
    );
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

    qcmId = await creerQcmAvecQuestions('Principal', 3);
  });

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  it('200 : configuration enregistrée, QCM en NON_PUBLIE, visible dans le détail, tracée', async () => {
    const res = await configurer(qcmId, configuration()).expect(200);
    expect(res.body).toMatchObject({
      dureeMaxMinutes: 30,
      nbTentativesMax: 2,
      blocageSessionsMultiples: true,
    });

    const detail = await api('get', `/qcm/${qcmId}`, tokenFormateur).expect(200);
    expect(detail.body.statut).toBe('NON_PUBLIE');
    expect(detail.body.configuration).toMatchObject({
      affichageResultats: 'DIFFERE',
      scoreMinValidation: 60,
      nbQuestionsTirees: null,
    });

    const traces = await auditLogRepository.find({
      where: { action: 'QCM_CONFIGURE', cible: qcmId },
    });
    expect(traces).toHaveLength(1);
    expect(traces[0].detailsAvantApres).toMatchObject({
      avant: null,
      statut: { avant: 'BROUILLON', apres: 'NON_PUBLIE' },
    });
  });

  it('un second enregistrement remplace la configuration, sans doublon', async () => {
    await configurer(qcmId, configuration({ dureeMaxMinutes: 45, nbQuestionsTirees: 2 })).expect(
      200,
    );

    const lignes = await dataSource.getRepository(ConfigurationAntiFraude).findBy({ qcmId });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ dureeMaxMinutes: 45, nbQuestionsTirees: 2 });
  });

  it('409 pour un QCM sans question', async () => {
    const vide = await creerQcmAvecQuestions('Vide', 0);
    const res = await configurer(vide, configuration()).expect(409);
    expect(res.body.message).toBe(
      'Ajoutez au moins une question avant de configurer les paramètres anti-fraude.',
    );
  });

  it.each([
    [
      'ouverture après fermeture',
      { dateOuverture: dans(11), dateFermeture: dans(10) },
      'La date d’ouverture doit précéder la date de fermeture.',
    ],
    [
      'fermeture passée',
      { dateOuverture: dans(-3), dateFermeture: dans(-1) },
      'La date de fermeture doit être dans le futur.',
    ],
    [
      'fenêtre trop courte',
      { dureeMaxMinutes: 90, dateOuverture: dans(10), dateFermeture: dans(10, 1) },
      /plus courte que la durée/,
    ],
    [
      'tirage trop grand',
      { nbQuestionsTirees: 4 },
      'Impossible de tirer 4 questions : le QCM n’en contient que 3.',
    ],
  ])('400 (règle croisée) : %s', async (_cas, surcharge, message) => {
    const res = await configurer(qcmId, configuration(surcharge)).expect(400);
    expect(res.body.message).toEqual(expect.stringMatching(message));
  });

  it.each([
    ['seuil 120 %', { scoreMinValidation: 120 }],
    ['0 tentative', { nbTentativesMax: 0 }],
    ['durée de 0 minute', { dureeMaxMinutes: 0 }],
    ['affichage inconnu', { affichageResultats: 'JAMAIS' }],
    ['date mal formée', { dateOuverture: '02/11/2026' }],
    ['champ obligatoire absent', { affichageResultats: undefined }],
  ])('400 (champ) : %s', async (_cas, surcharge) => {
    await configurer(qcmId, configuration(surcharge)).expect(400);
  });

  it('403 pour un formateur non affecté', async () => {
    await configurer(qcmId, configuration(), tokenAutre).expect(403);
  });

  it('un QCM publié reste publié après reconfiguration', async () => {
    const publie = await creerQcmAvecQuestions('Publié', 1);
    await dataSource.getRepository(Qcm).update({ id: publie }, { statut: StatutQcm.PUBLIE });

    await configurer(publie, configuration()).expect(200);

    const detail = await api('get', `/qcm/${publie}`, tokenFormateur).expect(200);
    expect(detail.body.statut).toBe('PUBLIE');
  });

  describe('QCM déjà tenté', () => {
    let base: Record<string, unknown>;

    beforeAll(async () => {
      base = configuration({ dateOuverture: dans(20), dateFermeture: dans(20, 8) });
      await configurer(qcmId, base).expect(200);
      // Aucune route ne crée encore de tentative (US-QCM-05) : insertion directe.
      const tentativeRepo = dataSource.getRepository(TentativeQcm);
      await tentativeRepo.save(
        tentativeRepo.create({ apprenantId, qcmId, dateLimite: new Date(Date.now() + 3_600_000) }),
      );
    });

    it('la fermeture peut être repoussée', async () => {
      await configurer(qcmId, { ...base, dateFermeture: dans(25) }).expect(200);
    });

    it('409 pour avancer la fermeture ou changer un autre paramètre', async () => {
      await configurer(qcmId, { ...base, dateFermeture: dans(20, 6) }).expect(409);
      const res = await configurer(qcmId, {
        ...base,
        dateFermeture: dans(25),
        nbTentativesMax: 5,
      }).expect(409);
      expect(res.body.message).toMatch(/Seule la date de fermeture peut être repoussée/);
    });
  });
});
