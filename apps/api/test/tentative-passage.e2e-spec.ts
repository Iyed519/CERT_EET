import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { ConfigurationAntiFraude } from '../src/database/entities/configuration-anti-fraude.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Option } from '../src/database/entities/option.entity';
import { QcmQuestion } from '../src/database/entities/qcm-question.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { Reponse } from '../src/database/entities/reponse.entity';
import { ReponseOption } from '../src/database/entities/reponse-option.entity';
import { QuestionTiree, TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';
import { TypeQuestion } from '../src/database/enums/type-question.enum';
import { TentativeBalayageService } from '../src/modules/tentatives/tentative-balayage.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Tests d'intégration US-QCM-07 — Minuterie serveur et sauvegarde des
 * réponses.
 *
 * Couvre, sur l'application réelle, la vraie base et le vrai Redis :
 *  - minuterie : clé `timer:{id}` posée au démarrage, expiration ABSOLUE à
 *    l'échéance (PEXPIRETIME), supprimée à la soumission et à l'expiration ;
 *  - enregistrement : réponse créée, remplacée (une seule ligne), effacée
 *    par `[]`, restaurée par GET ; options rangées dans l'ordre du tirage ;
 *  - refus : 400 corps invalide, question hors tirage, option étrangère,
 *    deux options sur un QCU / Vrai-Faux ; 404 tentative d'un autre ; 403
 *    formateur ; 409 après soumission ;
 *  - temps écoulé : 409 `temps_ecoule`, tentative clôturée ABANDONNEE_TIMER à
 *    son échéance, réponses conservées, audit ;
 *  - soumission : SOUMISE, durée effective, audit QCM_SOUMIS ;
 *  - balayage : seules les EN_COURS échues depuis plus que la grâce ;
 *  - concurrence (chevauchement FORCÉ) : une sauvegarde arrivée pendant une
 *    soumission n'écrit rien après la fin de la tentative.
 *
 * Les échéances sont reculées par SQL : `now() - 1 s` pour une requête de
 * l'apprenant (le balayage, 30 s de grâce, ne les touche pas — y compris
 * celui d'une API de développement qui tournerait sur la même base, D11) ;
 * `now() - 1 h` pour le balayage. Les assertions portent sur l'état final.
 *
 * Nettoyage rejouable (avant ET après), dans l'ordre des clés RESTRICT :
 * tentatives (CASCADE réponses) -> inscriptions -> QCM -> questions ->
 * formations -> audit (par compte et par tentative) -> comptes.
 */
describe('Minuterie serveur et sauvegarde des réponses (e2e) — US-QCM-07', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let tentativeRepository: Repository<TentativeQcm>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let redis: Redis;
  let balayage: TentativeBalayageService;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-TENTDEM, E2E-TIRAGE).
  const MARQUEUR = 'E2E-REPONSE';
  const APPRENANTS = ['a', 'b', 'c', 'd', 'e'] as const;
  type Cle = (typeof APPRENANTS)[number];
  const email = (cle: string): string => `e2e-reponse-${cle}@cert-eet.local`;
  const EMAIL_FORMATEUR = email('form');
  const EMAILS = [...APPRENANTS.map(email), EMAIL_FORMATEUR];
  const MINUTE = 60_000;
  const PREPARATION_MS = 60_000;

  const comptes = {} as Record<Cle, { id: string; token: string }>;
  let tokenFormateur: string;
  let qcmId: string;
  let qcmAutreId: string;
  // Questions du QCM principal, par type, avec leurs options (ordre de rédaction).
  const questions: Record<string, { id: string; type: TypeQuestion; options: string[] }> = {};
  let optionAutreQcm: string;

  const serveur = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();
  const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  const login = async (adresse: string): Promise<string> => {
    const res = await request(serveur())
      .post('/api/auth/login')
      .send({ email: adresse, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const demarrer = (token: string, id = qcmId): request.Test =>
    request(serveur())
      .post(`/api/qcm/${id}/tentatives`)
      .set(...auth(token));

  const consulter = (tentativeId: string, token: string): request.Test =>
    request(serveur())
      .get(`/api/tentatives/${tentativeId}`)
      .set(...auth(token));

  const enregistrer = (
    tentativeId: string,
    questionId: string,
    optionIds: unknown,
    token: string,
  ): request.Test =>
    request(serveur())
      .put(`/api/tentatives/${tentativeId}/reponses/${questionId}`)
      .set(...auth(token))
      .send({ optionIds });

  const soumettre = (tentativeId: string, token: string): request.Test =>
    request(serveur())
      .post(`/api/tentatives/${tentativeId}/soumettre`)
      .set(...auth(token));

  /** Démarre une tentative neuve et renvoie son id et son plan figé. */
  const nouvelleTentative = async (
    cle: Cle,
    id = qcmId,
  ): Promise<{ id: string; plan: QuestionTiree[] }> => {
    const res = await demarrer(comptes[cle].token, id).expect(201);
    const ligne = await tentativeRepository.findOneByOrFail({ id: res.body.id });
    return { id: ligne.id, plan: ligne.planTirage as QuestionTiree[] };
  };

  /** Ordre des options de la question `type` dans le plan (ordre vu par l'apprenant). */
  const optionsTirees = (plan: QuestionTiree[], type: TypeQuestion): string[] =>
    plan.find((q) => q.questionId === questions[type].id)?.optionIds ?? [];

  /** Recule l'échéance (et le début, 30 min avant) d'une tentative. */
  const reculerEcheance = (tentativeId: string, intervalle: string): Promise<unknown> =>
    dataSource.query(
      `UPDATE tentatives_qcm
          SET date_limite = now() - $2::interval,
              date_debut = now() - $2::interval - interval '30 minutes'
        WHERE id = $1`,
      [tentativeId, intervalle],
    );

  const optionsEnregistrees = async (
    tentativeId: string,
    questionId: string,
  ): Promise<string[]> => {
    const reponse = await dataSource
      .getRepository(Reponse)
      .findOne({ where: { tentativeId, questionId } });
    if (!reponse) return [];
    const lignes = await dataSource
      .getRepository(ReponseOption)
      .find({ where: { reponseId: reponse.id } });
    return lignes.map((l) => l.optionId).sort();
  };

  const audits = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

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
    let tentativeIds: string[] = [];
    if (utilisateurIds.length > 0) {
      const tentatives = await tentativeRepository.find({
        where: { apprenantId: In(utilisateurIds) },
        select: { id: true },
      });
      tentativeIds = tentatives.map((t) => t.id);
      if (tentativeIds.length > 0) {
        await redis.del(...tentativeIds.map((id) => `timer:${id}`));
      }
      // CASCADE : réponses et options cochées partent avec la tentative.
      await tentativeRepository.delete({ apprenantId: In(utilisateurIds) });
      await dataSource.getRepository(Inscription).delete({ apprenantId: In(utilisateurIds) });
    }
    await dataSource.getRepository(Qcm).delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Question).delete({ enonce: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    // Les clôtures du balayage n'ont pas d'acteur : purge aussi par tentative.
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurIds, ...tentativeIds]);
    await userRepository.delete({ email: In(EMAILS) });
  };

  /** QCM publié : une question par type donné, 4 options (2 pour un Vrai/Faux). */
  const creerQcm = async (
    titre: string,
    moduleId: string,
    types: TypeQuestion[],
    reglages: Partial<ConfigurationAntiFraude> = {},
  ): Promise<{
    id: string;
    questions: Array<{ id: string; type: TypeQuestion; options: string[] }>;
  }> => {
    const cree = await dataSource
      .getRepository(Qcm)
      .save({ moduleId, titre: `${MARQUEUR} ${titre}`, statut: StatutQcm.PUBLIE });
    const lignes = await dataSource.getRepository(Question).save(
      types.map((type, i) => ({
        enonce: `${MARQUEUR} ${titre} question ${i + 1}`,
        type,
        ponderation: 1,
      })),
    );
    const textes = (type: TypeQuestion): string[] =>
      type === TypeQuestion.VRAI_FAUX ? ['Vrai', 'Faux'] : ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const options = await dataSource.getRepository(Option).save(
      lignes.flatMap((question) =>
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
        lignes.map((question, i) => ({ qcmId: cree.id, questionId: question.id, ordre: i + 1 })),
      );
    await dataSource.getRepository(ConfigurationAntiFraude).save({
      qcmId: cree.id,
      dureeMaxMinutes: 30,
      dateOuverture: new Date(Date.now() - 24 * 60 * MINUTE),
      dateFermeture: new Date(Date.now() + 10 * 24 * 60 * MINUTE),
      nbTentativesMax: 20,
      delaiEntreTentatives: 0,
      affichageResultats: AffichageResultats.DIFFERE,
      scoreMinValidation: 60,
      ponderationFormation: 10,
      randomiserQuestions: true,
      randomiserOptions: true,
      nbQuestionsTirees: null,
      ...reglages,
    });
    return {
      id: cree.id,
      questions: lignes.map((question) => ({
        id: question.id,
        type: question.type,
        options: options
          .filter((o) => o.questionId === question.id)
          .sort((a, b) => a.ordre - b.ordre)
          .map((o) => o.id),
      })),
    };
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
    auditLogRepository = moduleRef.get(DataSource, { strict: false }).getRepository(AuditLog);
    dataSource = moduleRef.get(DataSource, { strict: false });
    redis = moduleRef.get<Redis>(REDIS_CLIENT);
    balayage = moduleRef.get(TentativeBalayageService);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const crees = await userRepository.save(
      EMAILS.map((adresse) =>
        userRepository.create({
          email: adresse,
          role: adresse === EMAIL_FORMATEUR ? Role.FORMATEUR : Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
        }),
      ),
    );
    for (const compte of crees) {
      const token = await login(compte.email);
      if (compte.email === EMAIL_FORMATEUR) {
        tokenFormateur = token;
      } else {
        const cle = APPRENANTS.find((c) => email(c) === compte.email) as Cle;
        comptes[cle] = { id: compte.id, token };
      }
    }

    const formation = await dataSource.getRepository(Formation).save({
      titre: `${MARQUEUR} Kubernetes`,
      statut: StatutFormation.OUVERTE,
      capaciteMax: 20,
      noteMinCertification: 70,
    });
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save({ formationId: formation.id, titre: 'Pods', ordre: 1 });

    // QCM principal : 3 questions tirées parmi 4 (une hors tirage par tentative).
    const principal = await creerQcm(
      'principal',
      module.id,
      [TypeQuestion.QCU, TypeQuestion.QCM, TypeQuestion.VRAI_FAUX, TypeQuestion.QCU],
      { nbQuestionsTirees: 3 },
    );
    qcmId = principal.id;
    // Les trois premières servent aux tests (forcées dans le plan par tentativeDeTest) ;
    // la quatrième reste hors tirage.
    questions[TypeQuestion.QCU] = principal.questions[0];
    questions[TypeQuestion.QCM] = principal.questions[1];
    questions[TypeQuestion.VRAI_FAUX] = principal.questions[2];
    const autre = await creerQcm('autre', module.id, [TypeQuestion.QCU]);
    qcmAutreId = autre.id;
    optionAutreQcm = autre.questions[0].options[0];

    await dataSource
      .getRepository(Inscription)
      .save(APPRENANTS.map((cle) => ({ apprenantId: comptes[cle].id, formationId: formation.id })));
  }, PREPARATION_MS);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(EMAILS) })).toBe(0);
    await app.close();
  }, PREPARATION_MS);

  /**
   * Démarre une tentative et réécrit son plan pour qu'il contienne les trois
   * questions de test (options dans un ordre mélangé, Vrai/Faux dans l'ordre),
   * la quatrième question restant HORS tirage.
   */
  const tentativeDeTest = async (cle: Cle): Promise<{ id: string; plan: QuestionTiree[] }> => {
    const { id } = await nouvelleTentative(cle);
    const inverse = (ids: string[]): string[] => [...ids].reverse();
    const plan: QuestionTiree[] = [
      { questionId: questions.QCM.id, optionIds: inverse(questions.QCM.options) },
      { questionId: questions.VRAI_FAUX.id, optionIds: questions.VRAI_FAUX.options },
      { questionId: questions.QCU.id, optionIds: inverse(questions.QCU.options) },
    ];
    await tentativeRepository.update({ id }, { planTirage: plan });
    return { id, plan };
  };

  describe('minuterie Redis', () => {
    it('clé timer:{id} posée au démarrage, expiration absolue = échéance', async () => {
      const { id } = await nouvelleTentative('e');
      const tentative = await tentativeRepository.findOneByOrFail({ id });

      expect(await redis.get(`timer:${id}`)).toBe(String(tentative.dateLimite.getTime()));
      const expiration = (await redis.call('PEXPIRETIME', `timer:${id}`)) as number;
      expect(expiration).toBe(tentative.dateLimite.getTime());

      // Reprise : la clé perdue est reposée à la MÊME échéance (jamais rallongée).
      await redis.del(`timer:${id}`);
      await demarrer(comptes.e.token).expect(200);
      expect((await redis.call('PEXPIRETIME', `timer:${id}`)) as number).toBe(
        tentative.dateLimite.getTime(),
      );

      await soumettre(id, comptes.e.token).expect(200);
      expect(await redis.exists(`timer:${id}`)).toBe(0);
    });
  });

  describe('PUT /tentatives/:id/reponses/:questionId', () => {
    let tentativeId: string;
    let plan: QuestionTiree[];

    beforeAll(async () => {
      ({ id: tentativeId, plan } = await tentativeDeTest('a'));
    });

    afterAll(async () => {
      await soumettre(tentativeId, comptes.a.token);
    });

    it('enregistre, remplace (une seule ligne), et la consultation restaure la sélection', async () => {
      const [premiere, seconde] = optionsTirees(plan, TypeQuestion.QCU);

      const res = await enregistrer(
        tentativeId,
        questions.QCU.id,
        [premiere],
        comptes.a.token,
      ).expect(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'dateLimite',
        'enregistreeLe',
        'maintenant',
        'optionIds',
        'questionId',
      ]);
      expect(res.body).toMatchObject({ questionId: questions.QCU.id, optionIds: [premiere] });
      expect(new Date(res.body.enregistreeLe).getTime()).toBeLessThanOrEqual(
        new Date(res.body.maintenant).getTime() + 1000,
      );

      // Même corps renvoyé : même résultat. Autre option : remplacement.
      await enregistrer(tentativeId, questions.QCU.id, [premiere], comptes.a.token).expect(200);
      await enregistrer(tentativeId, questions.QCU.id, [seconde], comptes.a.token).expect(200);
      expect(
        await dataSource
          .getRepository(Reponse)
          .countBy({ tentativeId, questionId: questions.QCU.id }),
      ).toBe(1);
      expect(await optionsEnregistrees(tentativeId, questions.QCU.id)).toEqual([seconde]);

      const vue = await consulter(tentativeId, comptes.a.token).expect(200);
      expect(vue.body.reponses).toMatchObject({ [questions.QCU.id]: [seconde] });
    });

    it('QCM : plusieurs options, renvoyées dans l’ordre du tirage', async () => {
      const ordre = optionsTirees(plan, TypeQuestion.QCM);
      const choisies = [ordre[2], ordre[0]];
      const res = await enregistrer(
        tentativeId,
        questions.QCM.id,
        choisies,
        comptes.a.token,
      ).expect(200);
      expect(res.body.optionIds).toEqual([ordre[0], ordre[2]]);
      const vue = await consulter(tentativeId, comptes.a.token).expect(200);
      expect(vue.body.reponses[questions.QCM.id]).toEqual([ordre[0], ordre[2]]);
    });

    it('[] efface la réponse : plus de ligne, plus rien à restaurer', async () => {
      const [vrai] = optionsTirees(plan, TypeQuestion.VRAI_FAUX);
      await enregistrer(tentativeId, questions.VRAI_FAUX.id, [vrai], comptes.a.token).expect(200);
      const res = await enregistrer(
        tentativeId,
        questions.VRAI_FAUX.id,
        [],
        comptes.a.token,
      ).expect(200);
      expect(res.body).toMatchObject({ optionIds: [], enregistreeLe: null });
      expect(
        await dataSource
          .getRepository(Reponse)
          .countBy({ tentativeId, questionId: questions.VRAI_FAUX.id }),
      ).toBe(0);
      const vue = await consulter(tentativeId, comptes.a.token).expect(200);
      expect(vue.body.reponses[questions.VRAI_FAUX.id]).toBeUndefined();
    });

    it.each([
      ['optionIds absent', undefined],
      ['optionIds non liste', 'abc'],
      ['identifiant non UUID', ['pas-un-uuid']],
      ['doublon', 'DOUBLON'],
    ])('400 corps invalide (%s)', async (_cas, corps) => {
      const valeur =
        corps === 'DOUBLON'
          ? [optionsTirees(plan, TypeQuestion.QCM)[0], optionsTirees(plan, TypeQuestion.QCM)[0]]
          : corps;
      await enregistrer(tentativeId, questions.QCM.id, valeur, comptes.a.token).expect(400);
    });

    it('400 champ inconnu dans le corps ; 400 identifiant de question mal formé', async () => {
      await request(serveur())
        .put(`/api/tentatives/${tentativeId}/reponses/${questions.QCU.id}`)
        .set(...auth(comptes.a.token))
        .send({ optionIds: [], estCorrecte: true })
        .expect(400);
      await enregistrer(tentativeId, 'pas-un-uuid', [], comptes.a.token).expect(400);
    });

    it('400 question hors du tirage (4e question du QCM, question d’un autre QCM)', async () => {
      const lien = await dataSource
        .getRepository(QcmQuestion)
        .find({ where: { qcmId }, order: { ordre: 'ASC' } });
      const horsTirage = lien[3].questionId;
      const res = await enregistrer(tentativeId, horsTirage, [], comptes.a.token).expect(400);
      expect(res.body).toMatchObject({
        raison: 'question_hors_tirage',
        message: 'Cette question ne fait pas partie de votre tentative.',
      });
      const autre = await dataSource
        .getRepository(QcmQuestion)
        .findOneByOrFail({ qcmId: qcmAutreId });
      await enregistrer(tentativeId, autre.questionId, [], comptes.a.token).expect(400);
    });

    it('400 option d’une autre question ou d’un autre QCM, rien n’est écrit', async () => {
      const avant = await optionsEnregistrees(tentativeId, questions.QCU.id);
      const res = await enregistrer(
        tentativeId,
        questions.QCU.id,
        [questions.QCM.options[0]],
        comptes.a.token,
      ).expect(400);
      expect(res.body.raison).toBe('option_hors_question');
      await enregistrer(tentativeId, questions.QCU.id, [optionAutreQcm], comptes.a.token).expect(
        400,
      );
      expect(await optionsEnregistrees(tentativeId, questions.QCU.id)).toEqual(avant);
    });

    it.each([TypeQuestion.QCU, TypeQuestion.VRAI_FAUX])(
      '400 deux options sur un %s',
      async (type) => {
        const res = await enregistrer(
          tentativeId,
          questions[type].id,
          optionsTirees(plan, type).slice(0, 2),
          comptes.a.token,
        ).expect(400);
        expect(res.body).toMatchObject({
          raison: 'une_seule_option',
          message: 'Une seule réponse est possible pour cette question.',
        });
      },
    );

    it('404 pour la tentative d’un autre apprenant ; 403 formateur ; 401 sans jeton', async () => {
      const res = await enregistrer(tentativeId, questions.QCU.id, [], comptes.b.token).expect(404);
      expect(res.body.message).toBe('Tentative introuvable.');
      await soumettre(tentativeId, comptes.b.token).expect(404);
      await enregistrer(tentativeId, questions.QCU.id, [], tokenFormateur).expect(403);
      await request(serveur())
        .put(`/api/tentatives/${tentativeId}/reponses/${questions.QCU.id}`)
        .send({ optionIds: [] })
        .expect(401);
      // La tentative de A est intacte.
      expect((await tentativeRepository.findOneByOrFail({ id: tentativeId })).statut).toBe(
        StatutTentative.EN_COURS,
      );
    });

    it('aucune bonne réponse dans les réponses de l’API', async () => {
      const res = await enregistrer(
        tentativeId,
        questions.QCU.id,
        [optionsTirees(plan, TypeQuestion.QCU)[0]],
        comptes.a.token,
      ).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/estCorrecte|est_correcte|score|ponderation/i);
    });
  });

  describe('POST /tentatives/:id/soumettre', () => {
    it('SOUMISE, durée effective à l’heure de la base, audit QCM_SOUMIS, clé supprimée ; puis 409', async () => {
      const { id, plan } = await tentativeDeTest('b');
      await enregistrer(
        id,
        questions.QCU.id,
        [optionsTirees(plan, TypeQuestion.QCU)[0]],
        comptes.b.token,
      ).expect(200);

      const res = await soumettre(id, comptes.b.token).expect(200);
      expect(res.body).toMatchObject({
        id,
        qcmId,
        // Notée dans la foulée de la soumission (US-QCM-08) ; le score est
        // vérifié par la suite E2E-NOTATION.
        statut: StatutTentative.NOTEE,
        nbQuestions: 3,
        nbReponses: 1,
      });
      expect(typeof res.body.score).toBe('number');
      const ligne = await tentativeRepository.findOneByOrFail({ id });
      expect(ligne.statut).toBe(StatutTentative.NOTEE);
      expect(ligne.dateFin).not.toBeNull();
      expect(ligne.dureeEffective).toBe(
        Math.round(((ligne.dateFin as Date).getTime() - ligne.dateDebut.getTime()) / 1000),
      );
      expect(await redis.exists(`timer:${id}`)).toBe(0);

      const [audit] = await audits('QCM_SOUMIS', id);
      expect(audit).toMatchObject({ userId: comptes.b.id, resultat: 'Succès' });
      expect(audit.detailsAvantApres).toMatchObject({ nbQuestions: 3, nbReponses: 1 });

      // Terminée : ni sauvegarde ni seconde soumission ; réponses conservées.
      const refus = await enregistrer(id, questions.QCU.id, [], comptes.b.token).expect(409);
      expect(refus.body).toMatchObject({
        message: 'Cette tentative est terminée.',
        raison: 'tentative_terminee',
        statut: StatutTentative.NOTEE,
      });
      await soumettre(id, comptes.b.token).expect(409);
      expect(await optionsEnregistrees(id, questions.QCU.id)).toHaveLength(1);
      expect(await audits('QCM_SOUMIS', id)).toHaveLength(1);

      // Plus de questions ni de réponses servies après la fin.
      const vue = await consulter(id, comptes.b.token).expect(200);
      expect(vue.body).toMatchObject({
        statut: StatutTentative.NOTEE,
        questions: [],
        reponses: {},
      });
    });
  });

  describe('temps écoulé (échéance reculée par SQL)', () => {
    it('sauvegarde : 409 temps_ecoule, clôture à l’échéance, réponses conservées, audit', async () => {
      const { id, plan } = await tentativeDeTest('c');
      const [option] = optionsTirees(plan, TypeQuestion.QCU);
      await enregistrer(id, questions.QCU.id, [option], comptes.c.token).expect(200);
      await reculerEcheance(id, '1 second');

      const res = await enregistrer(
        id,
        questions.QCM.id,
        [optionsTirees(plan, TypeQuestion.QCM)[0]],
        comptes.c.token,
      ).expect(409);
      expect(res.body).toMatchObject({
        message: 'Le temps est écoulé : vos réponses enregistrées sont conservées.',
        raison: 'temps_ecoule',
        statut: StatutTentative.ABANDONNEE_TIMER,
      });

      const ligne = await tentativeRepository.findOneByOrFail({ id });
      // Clôturée ABANDONNEE_TIMER (statut du 409), puis notée (US-QCM-08).
      expect(ligne.statut).toBe(StatutTentative.NOTEE);
      expect(ligne.dateFin?.getTime()).toBe(ligne.dateLimite.getTime());
      expect(ligne.dureeEffective).toBe(1800);
      // La réponse d'avant l'échéance est conservée ; celle d'après n'est pas écrite.
      expect(await optionsEnregistrees(id, questions.QCU.id)).toEqual([option]);
      expect(await optionsEnregistrees(id, questions.QCM.id)).toEqual([]);
      expect(await redis.exists(`timer:${id}`)).toBe(0);

      const [audit] = await audits('TENTATIVE_EXPIREE', id);
      expect(audit).toMatchObject({ userId: comptes.c.id, resultat: 'Succès' });
      expect(audit.detailsAvantApres).toMatchObject({ cause: 'echeance_depassee_a_la_sauvegarde' });

      // Requête suivante : la tentative est terminée.
      await enregistrer(id, questions.QCU.id, [], comptes.c.token).expect(409);
    });

    it('soumission après l’échéance : 409 temps_ecoule, ABANDONNEE_TIMER (pas SOUMISE)', async () => {
      const { id } = await tentativeDeTest('c');
      await reculerEcheance(id, '1 second');
      const res = await soumettre(id, comptes.c.token).expect(409);
      expect(res.body.raison).toBe('temps_ecoule');
      // Clôturée ABANDONNEE_TIMER puis notée (US-QCM-08) — jamais SOUMISE.
      expect((await tentativeRepository.findOneByOrFail({ id })).statut).toBe(
        StatutTentative.NOTEE,
      );
      expect(await audits('QCM_SOUMIS', id)).toHaveLength(0);
      expect(await audits('TENTATIVE_EXPIREE', id)).toHaveLength(1);
    });
  });

  describe('balayage des tentatives échues', () => {
    it('ne clôture que les EN_COURS échues depuis plus que la grâce (30 s)', async () => {
      // d : échue depuis 1 h (à clôturer) ; e : échue depuis 1 s (dans la grâce) ;
      // a : valide ; b : déjà SOUMISE.
      const ancienne = await tentativeDeTest('d');
      const [option] = optionsTirees(ancienne.plan, TypeQuestion.QCU);
      await enregistrer(ancienne.id, questions.QCU.id, [option], comptes.d.token).expect(200);
      await reculerEcheance(ancienne.id, '1 hour');
      const recente = await tentativeDeTest('e');
      await reculerEcheance(recente.id, '1 second');
      const valide = await tentativeDeTest('a');
      const soumise = await tentativeDeTest('b');
      await soumettre(soumise.id, comptes.b.token).expect(200);

      const cloturees = await balayage.balayer();
      expect(cloturees).not.toContain(recente.id);
      expect(cloturees).not.toContain(valide.id);
      expect(cloturees).not.toContain(soumise.id);

      // État final (une API de développement sur la même base a pu passer avant).
      const etat = async (id: string): Promise<TentativeQcm> =>
        tentativeRepository.findOneByOrFail({ id });
      const close = await etat(ancienne.id);
      // Clôturée puis notée par le rattrapage du balayage (US-QCM-08).
      expect(close.statut).toBe(StatutTentative.NOTEE);
      expect(close.dateFin?.getTime()).toBe(close.dateLimite.getTime());
      expect(close.dureeEffective).toBe(1800);
      expect(await optionsEnregistrees(ancienne.id, questions.QCU.id)).toEqual([option]);
      expect((await etat(recente.id)).statut).toBe(StatutTentative.EN_COURS);
      expect((await etat(valide.id)).statut).toBe(StatutTentative.EN_COURS);
      expect((await etat(soumise.id)).statut).toBe(StatutTentative.NOTEE);
      expect(await redis.exists(`timer:${ancienne.id}`)).toBe(0);
      expect(await redis.exists(`timer:${valide.id}`)).toBe(1);

      // Clôture SYSTÈME : un seul audit, sans acteur.
      const traces = await audits('TENTATIVE_EXPIREE', ancienne.id);
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({ userId: null, resultat: 'Succès' });
      expect(traces[0].detailsAvantApres).toMatchObject({
        cause: 'balayage',
        apprenantId: comptes.d.id,
      });

      // Un second passage ne retrouve rien de plus à clôturer pour ces tentatives.
      expect(await balayage.balayer()).not.toContain(ancienne.id);
      expect(await audits('TENTATIVE_EXPIREE', ancienne.id)).toHaveLength(1);

      // La consultation reflète la clôture.
      const vue = await consulter(ancienne.id, comptes.d.token).expect(200);
      expect(vue.body).toMatchObject({ statut: StatutTentative.NOTEE, questions: [] });

      // Grâce 0 : la récente est clôturée à son tour.
      await balayage.balayer(0);
      expect((await etat(recente.id)).statut).toBe(StatutTentative.NOTEE);
      await soumettre(valide.id, comptes.a.token).expect(200);
    });
  });

  describe('concurrence (chevauchement forcé)', () => {
    it('une sauvegarde arrivée pendant une soumission n’écrit rien après la fin', async () => {
      const { id, plan } = await tentativeDeTest('e');
      const [option] = optionsTirees(plan, TypeQuestion.QCU);

      // Les UPDATE sur tentatives_qcm attendent ; les SELECT … FOR UPDATE passent.
      // La soumission prend le verrou de la ligne puis attend sur son UPDATE ;
      // la sauvegarde arrive ensuite et attend le verrou de la ligne.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let reponses: request.Response[];
      try {
        await bloqueur.query('LOCK TABLE tentatives_qcm IN SHARE ROW EXCLUSIVE MODE');
        const soumission = soumettre(id, comptes.e.token).then((r) => r);
        await new Promise((fin) => setTimeout(fin, 400));
        const sauvegarde = enregistrer(id, questions.QCU.id, [option], comptes.e.token).then(
          (r) => r,
        );
        await new Promise((fin) => setTimeout(fin, 600));
        await bloqueur.commitTransaction();
        reponses = await Promise.all([soumission, sauvegarde]);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }

      expect(reponses[0].status).toBe(200);
      expect(reponses[1].status).toBe(409);
      expect(reponses[1].body.raison).toBe('tentative_terminee');
      // Soumise puis notée (US-QCM-08), sans la réponse arrivée trop tard.
      expect((await tentativeRepository.findOneByOrFail({ id })).statut).toBe(
        StatutTentative.NOTEE,
      );
      expect(await dataSource.getRepository(Reponse).countBy({ tentativeId: id })).toBe(0);
    });
  });
});
