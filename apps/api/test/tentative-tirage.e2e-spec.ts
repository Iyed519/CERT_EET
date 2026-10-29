import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { ConfigurationAntiFraude } from '../src/database/entities/configuration-anti-fraude.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Option } from '../src/database/entities/option.entity';
import { QcmQuestion } from '../src/database/entities/qcm-question.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { QuestionTiree, TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';
import { TypeQuestion } from '../src/database/enums/type-question.enum';

/**
 * Tests d'intégration US-QCM-06 — Randomisation et confidentialité des
 * réponses.
 *
 * Couvre, sur l'application réelle et la vraie base :
 *  - NON-FUITE : ni la réponse de démarrage ni la consultation ne contiennent
 *    `estCorrecte`, l'explication (texte marqué), la pondération ou la
 *    difficulté ; chaque objet n'a QUE les clés attendues ;
 *  - sans mélange : ordre de rédaction des questions et des options ;
 *  - plan figé dans `planTirage` à la création, identique à chaque lecture ;
 *  - tirage de K parmi N avec mélange : K questions distinctes du QCM, ordre
 *    variable d'un apprenant à l'autre, Vrai/Faux jamais mélangé ;
 *  - tentative créée avant le tirage : plan tiré une seule fois à la
 *    première lecture, même sous 5 lectures simultanées (D8) ;
 *  - aucune question hors du temps de passage.
 *
 * Nettoyage rejouable (avant ET après), dans l'ordre des clés RESTRICT :
 * tentatives -> inscriptions -> QCM (CASCADE configuration et liaisons) ->
 * questions (CASCADE options) -> formations (CASCADE modules) -> audit ->
 * comptes.
 */
describe('Tirage et confidentialité des réponses (e2e) — US-QCM-06', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let tentativeRepository: Repository<TentativeQcm>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-QCMPUB, E2E-TENTDEM).
  const MARQUEUR = 'E2E-TIRAGE';
  // Texte des explications : s'il apparaît dans une réponse, c'est une fuite.
  const SECRET = `${MARQUEUR}-EXPLICATION-SECRETE`;
  const EMAILS = [1, 2, 3, 4, 5].map((n) => `e2e-tirage-appr${n}@cert-eet.local`);
  const MINUTE = 60_000;
  // Préparation lourde (5 connexions bcrypt, 3 QCM, 12 questions) : sur un
  // poste lent elle dépasse les 5 s par défaut de Jest. Délai explicite pour
  // la préparation et le nettoyage seulement ; chaque test garde 5 s.
  const PREPARATION_MS = 60_000;

  let formationId: string;
  const apprenants: Array<{ id: string; token: string }> = [];
  const qcm: Record<string, string> = {};
  // Questions de chaque QCM, dans l'ordre de rédaction, avec leurs options.
  const contenu: Record<string, Array<{ id: string; type: TypeQuestion; options: string[] }>> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const demarrer = (qcmId: string, token: string): request.Test =>
    request(app.getHttpServer())
      .post(`/api/qcm/${qcmId}/tentatives`)
      .set('Authorization', `Bearer ${token}`);

  const consulter = (tentativeId: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(`/api/tentatives/${tentativeId}`)
      .set('Authorization', `Bearer ${token}`);

  /** La preuve de non-fuite, appliquée au corps BRUT de chaque réponse. */
  const sansFuite = (texte: string): void => {
    expect(texte).not.toMatch(/estCorrecte|est_correcte|explication|ponderation|difficulte/i);
    expect(texte).not.toContain(SECRET);
  };

  type QuestionRecue = {
    id: string;
    enonce: string;
    type: string;
    options: Array<{ id: string; texte: string }>;
  };

  /** Liste blanche : chaque question et chaque option n'ont QUE ces clés. */
  const clesExactes = (questions: QuestionRecue[]): void => {
    for (const q of questions) {
      expect(Object.keys(q).sort()).toEqual(['enonce', 'id', 'options', 'type']);
      for (const o of q.options) {
        expect(Object.keys(o).sort()).toEqual(['id', 'texte']);
      }
    }
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
    const formations = await dataSource.getRepository(Formation).find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(EMAILS) },
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
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurIds]);
    await userRepository.delete({ email: In(EMAILS) });
  };

  /** Crée un QCM publié, ses questions (rédigées dans l'ordre donné) et sa configuration. */
  const creerQcm = async (
    cle: string,
    moduleId: string,
    types: TypeQuestion[],
    reglages: Partial<ConfigurationAntiFraude>,
  ): Promise<void> => {
    const cree = await dataSource
      .getRepository(Qcm)
      .save({ moduleId, titre: `${MARQUEUR} ${cle}`, statut: StatutQcm.PUBLIE });
    qcm[cle] = cree.id;
    // Insertions groupées (3 requêtes par QCM au lieu de 3 par question).
    const questions = await dataSource.getRepository(Question).save(
      types.map((type, i) => ({
        enonce: `${MARQUEUR} ${cle} question ${i + 1}`,
        type,
        ponderation: 2,
        explication: SECRET,
        niveauDifficulte: 'AVANCE',
      })),
    );
    const textes = (type: TypeQuestion): string[] =>
      type === TypeQuestion.VRAI_FAUX ? ['Vrai', 'Faux'] : ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const options = await dataSource.getRepository(Option).save(
      questions.flatMap((question) =>
        textes(question.type).map((texte, j) => ({
          questionId: question.id,
          texte,
          ordre: j + 1,
          estCorrecte: j === 0,
        })),
      ),
    );
    await dataSource
      .getRepository(QcmQuestion)
      .save(
        questions.map((question, i) => ({ qcmId: cree.id, questionId: question.id, ordre: i + 1 })),
      );
    contenu[cle] = questions.map((question) => ({
      id: question.id,
      type: question.type,
      options: options
        .filter((o) => o.questionId === question.id)
        .sort((a, b) => a.ordre - b.ordre)
        .map((o) => o.id),
    }));
    await dataSource.getRepository(ConfigurationAntiFraude).save({
      qcmId: cree.id,
      dureeMaxMinutes: 30,
      dateOuverture: new Date(Date.now() - 24 * 60 * MINUTE),
      dateFermeture: new Date(Date.now() + 10 * 24 * 60 * MINUTE),
      nbTentativesMax: 3,
      delaiEntreTentatives: 0,
      affichageResultats: AffichageResultats.DIFFERE,
      scoreMinValidation: 60,
      ponderationFormation: 10,
      randomiserQuestions: false,
      randomiserOptions: false,
      nbQuestionsTirees: null,
      ...reglages,
    });
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
    tentativeRepository = moduleRef.get<Repository<TentativeQcm>>(getRepositoryToken(TentativeQcm));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const comptes = await userRepository.save(
      EMAILS.map((email) =>
        userRepository.create({
          email,
          role: Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
        }),
      ),
    );
    for (const compte of comptes) {
      apprenants.push({ id: compte.id, token: await login(compte.email) });
    }

    const formation = await dataSource.getRepository(Formation).save({
      titre: `${MARQUEUR} Docker`,
      statut: StatutFormation.OUVERTE,
      capaciteMax: 20,
      noteMinCertification: 70,
    });
    formationId = formation.id;
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save({ formationId, titre: 'Images', ordre: 1 });

    // « ordre » : ni mélange ni tirage. « melange » : 3 tirées parmi 6, tout
    // mélangé, avec un Vrai/Faux. « ancienne » : tentative sans plan (D8).
    await creerQcm(
      'ordre',
      module.id,
      [TypeQuestion.QCU, TypeQuestion.QCM, TypeQuestion.VRAI_FAUX],
      {},
    );
    await creerQcm(
      'melange',
      module.id,
      [
        TypeQuestion.QCU,
        TypeQuestion.QCU,
        TypeQuestion.QCM,
        TypeQuestion.VRAI_FAUX,
        TypeQuestion.QCU,
        TypeQuestion.QCM,
      ],
      { randomiserQuestions: true, randomiserOptions: true, nbQuestionsTirees: 3 },
    );
    await creerQcm('ancienne', module.id, [TypeQuestion.QCU, TypeQuestion.QCU, TypeQuestion.QCU], {
      randomiserQuestions: true,
      randomiserOptions: true,
    });

    await dataSource
      .getRepository(Inscription)
      .save(apprenants.map((a) => ({ apprenantId: a.id, formationId })));
  }, PREPARATION_MS);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(EMAILS) })).toBe(0);
    await app.close();
  }, PREPARATION_MS);

  describe('sans mélange ni tirage', () => {
    let tentativeId: string;

    it('le démarrage fige le plan dans l’ordre de rédaction, et sa réponse ne fuit rien', async () => {
      const res = await demarrer(qcm.ordre, apprenants[0].token).expect(201);
      sansFuite(res.text);
      expect(res.body.questions).toBeUndefined();
      tentativeId = res.body.id as string;

      const enBase = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(enBase.planTirage).toEqual(
        contenu.ordre.map((q) => ({ questionId: q.id, optionIds: q.options })),
      );
    });

    it('GET : questions et options dans l’ordre de rédaction, liste blanche, aucune bonne réponse', async () => {
      const res = await consulter(tentativeId, apprenants[0].token).expect(200);

      sansFuite(res.text);
      const questions = res.body.questions as QuestionRecue[];
      clesExactes(questions);
      expect(res.body.nbQuestions).toBe(3);
      expect(questions.map((q) => q.id)).toEqual(contenu.ordre.map((q) => q.id));
      expect(questions.map((q) => q.type)).toEqual(['QCU', 'QCM', 'VRAI_FAUX']);
      expect(questions[0].options.map((o) => o.texte)).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
        'Delta',
      ]);
      expect(questions[2].options.map((o) => o.texte)).toEqual(['Vrai', 'Faux']);
      expect(questions[0].enonce).toBe(`${MARQUEUR} ordre question 1`);
    });

    it('le plan est figé : une seconde lecture renvoie exactement la même chose', async () => {
      const a = await consulter(tentativeId, apprenants[0].token).expect(200);
      const b = await consulter(tentativeId, apprenants[0].token).expect(200);
      expect(b.body.questions).toEqual(a.body.questions);
    });
  });

  describe('tirage de 3 parmi 6, tout mélangé', () => {
    const plans: string[][] = [];

    it('chaque apprenant reçoit 3 questions distinctes du QCM, Vrai/Faux non mélangé, rien ne fuit', async () => {
      for (const apprenant of apprenants.slice(0, 4)) {
        const debut = await demarrer(qcm.melange, apprenant.token).expect(201);
        const res = await consulter(debut.body.id, apprenant.token).expect(200);
        sansFuite(res.text);

        const questions = res.body.questions as QuestionRecue[];
        clesExactes(questions);
        expect(questions).toHaveLength(3);
        const ids = questions.map((q) => q.id);
        expect(new Set(ids).size).toBe(3);
        for (const q of questions) {
          const source = contenu.melange.find((c) => c.id === q.id);
          expect(source).toBeDefined();
          // Toutes les options, chacune une fois, quel que soit l'ordre.
          expect(q.options.map((o) => o.id).sort()).toEqual([...(source?.options ?? [])].sort());
          if (q.type === 'VRAI_FAUX') {
            expect(q.options.map((o) => o.texte)).toEqual(['Vrai', 'Faux']);
          }
        }

        // La base contient exactement le plan servi.
        const enBase = await tentativeRepository.findOneByOrFail({ id: debut.body.id });
        expect((enBase.planTirage as QuestionTiree[]).map((p) => p.questionId)).toEqual(ids);
        plans.push(ids);
      }
    });

    it('les tirages varient d’un apprenant à l’autre (hasard réel, côté serveur)', () => {
      // 120 suites ordonnées de 3 parmi 6 : 4 tirages identiques ont une
      // probabilité inférieure à 1 sur un million.
      expect(new Set(plans.map((p) => p.join(','))).size).toBeGreaterThan(1);
    });
  });

  describe('tentative créée avant le tirage (D8)', () => {
    it('5 lectures simultanées : un seul tirage, enregistré, servi à toutes', async () => {
      const apprenant = apprenants[4];
      const ancienne = await tentativeRepository.save({
        apprenantId: apprenant.id,
        qcmId: qcm.ancienne,
        dateLimite: new Date(Date.now() + 20 * MINUTE),
        statut: StatutTentative.EN_COURS,
        planTirage: null,
      });

      // Chevauchement FORCÉ (sinon les lectures passent l'une après l'autre et
      // le test ne prouve rien) : j'empêche les UPDATE sur la table pendant
      // 1 s — SHARE ROW EXCLUSIVE laisse passer lectures et SELECT … FOR
      // UPDATE. Vérifié : sans le verrou de la ligne ni la relecture du plan,
      // chaque lecture enregistre son propre tirage et ce test échoue.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let reponses: request.Response[];
      try {
        await bloqueur.query('LOCK TABLE tentatives_qcm IN SHARE ROW EXCLUSIVE MODE');
        const enVol = Promise.all(
          Array.from({ length: 5 }, () => consulter(ancienne.id, apprenant.token).then((r) => r)),
        );
        await new Promise((fin) => setTimeout(fin, 1000));
        await bloqueur.commitTransaction();
        reponses = await enVol;
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      for (const r of reponses) {
        expect(r.status).toBe(200);
        sansFuite(r.text);
        expect(r.body.questions).toEqual(reponses[0].body.questions);
      }
      expect(reponses[0].body.questions).toHaveLength(3);

      const enBase = await tentativeRepository.findOneByOrFail({ id: ancienne.id });
      expect((enBase.planTirage as QuestionTiree[]).map((p) => p.questionId)).toEqual(
        (reponses[0].body.questions as QuestionRecue[]).map((q) => q.id),
      );
    });

    it('aucune question hors du temps de passage (échéance atteinte)', async () => {
      const apprenant = apprenants[4];
      await tentativeRepository.update(
        { apprenantId: apprenant.id, qcmId: qcm.ancienne },
        { dateLimite: new Date(Date.now() - MINUTE) },
      );
      const ancienne = await tentativeRepository.findOneByOrFail({
        apprenantId: apprenant.id,
        qcmId: qcm.ancienne,
      });
      const res = await consulter(ancienne.id, apprenant.token).expect(200);
      expect(res.body).toMatchObject({ nbQuestions: 3, questions: [] });
    });
  });
});
