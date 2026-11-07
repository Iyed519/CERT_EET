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
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';
import { TypeQuestion } from '../src/database/enums/type-question.enum';

/**
 * Tests d'intégration US-QCM-09 — Voir son résultat (corrigé selon le mode).
 *
 * Sur l'application réelle et la vraie base :
 *  - IMMÉDIAT, tentative unique : corrigé disponible dès la notation — ordre
 *    du tirage (mélangé), ma réponse, juste / faux et points tels que notés,
 *    bonnes options, explications ; question sans réponse = 0 point ;
 *  - DIFFÉRÉ : 409 `correction_differee` + `disponibleLe` avant la fermeture,
 *    disponible une fois la fermeture passée (date déplacée en base) ;
 *  - IMMÉDIAT avec tentatives restantes (D4-B) : refusé tant qu'une
 *    tentative reste possible ou qu'une est EN_COURS, disponible ensuite ;
 *  - 409 `non_notee` pendant le passage ; 404 pour la tentative d'un autre ;
 *  - non-fuite : ni `estCorrecte` ni `explication` dans la consultation, la
 *    soumission ou un refus — seulement l'état du corrigé (D12).
 *
 * Nettoyage rejouable (avant ET après), dans l'ordre des clés RESTRICT ;
 * audit purgé par compte et par tentative (la notation journalise).
 */
describe('Corrigé selon le mode d’affichage (e2e) — US-QCM-09', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let tentativeRepository: Repository<TentativeQcm>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre, et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-CORRIGE';
  const APPRENANTS = ['a', 'b', 'c', 'd'] as const;
  type Cle = (typeof APPRENANTS)[number];
  const email = (cle: string): string => `e2e-corrige-${cle}@cert-eet.local`;
  const EMAILS = APPRENANTS.map(email);
  const MINUTE = 60_000;
  const PREPARATION_MS = 60_000;

  const comptes = {} as Record<Cle, { id: string; token: string }>;
  interface QuestionTest {
    id: string;
    ponderation: number;
    explication: string | null;
    options: string[];
    correctes: string[];
    fausse: string;
  }
  interface QcmTest {
    id: string;
    questions: QuestionTest[];
  }
  let immediat: QcmTest;
  let differe: QcmTest;
  let multi: QcmTest;

  const serveur = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();
  const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  const demarrer = async (cle: Cle, qcmId: string): Promise<string> => {
    const res = await request(serveur())
      .post(`/api/qcm/${qcmId}/tentatives`)
      .set(...auth(comptes[cle].token))
      .expect(201);
    return res.body.id as string;
  };
  const repondre = (
    cle: Cle,
    tentativeId: string,
    questionId: string,
    optionIds: string[],
  ): request.Test =>
    request(serveur())
      .put(`/api/tentatives/${tentativeId}/reponses/${questionId}`)
      .set(...auth(comptes[cle].token))
      .send({ optionIds });
  const soumettre = (cle: Cle, tentativeId: string): request.Test =>
    request(serveur())
      .post(`/api/tentatives/${tentativeId}/soumettre`)
      .set(...auth(comptes[cle].token));
  const consulter = (cle: Cle, tentativeId: string): request.Test =>
    request(serveur())
      .get(`/api/tentatives/${tentativeId}`)
      .set(...auth(comptes[cle].token));
  const corrige = (cle: Cle, tentativeId: string): request.Test =>
    request(serveur())
      .get(`/api/tentatives/${tentativeId}/correction`)
      .set(...auth(comptes[cle].token));

  /** Aucune bonne réponse ni explication dans ce corps, à aucune profondeur. */
  const sansFuite = (corps: unknown): void => {
    const texte = JSON.stringify(corps);
    expect(texte).not.toContain('estCorrecte');
    expect(texte).not.toContain('explication');
    expect(texte).not.toContain('Explication');
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
    let tentativeIds: string[] = [];
    if (utilisateurIds.length > 0) {
      const tentatives = await tentativeRepository.find({
        where: { apprenantId: In(utilisateurIds) },
        select: { id: true },
      });
      tentativeIds = tentatives.map((t) => t.id);
      // Une tentative NOTEE ne se modifie plus, mais se supprime (CASCADE réponses).
      await tentativeRepository.delete({ apprenantId: In(utilisateurIds) });
      await dataSource.getRepository(Inscription).delete({ apprenantId: In(utilisateurIds) });
    }
    await dataSource.getRepository(Qcm).delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Question).delete({ enonce: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurIds, ...tentativeIds]);
    await userRepository.delete({ email: In(EMAILS) });
  };

  /**
   * QCM publié : q1 QCU ×1 (explication), q2 QCM ×2 (2 bonnes, sans
   * explication), q3 Vrai/Faux ×3 (explication). Fenêtre ouverte 10 jours.
   */
  const creerQcm = async (
    titre: string,
    moduleId: string,
    reglages: {
      mode: AffichageResultats;
      nbTentativesMax: number;
      randomiser: boolean;
    },
  ): Promise<QcmTest> => {
    const definitions = [
      { type: TypeQuestion.QCU, ponderation: 1, nbCorrectes: 1, explication: 'Explication q1' },
      { type: TypeQuestion.QCM, ponderation: 2, nbCorrectes: 2, explication: null },
      {
        type: TypeQuestion.VRAI_FAUX,
        ponderation: 3,
        nbCorrectes: 1,
        explication: 'Explication q3',
      },
    ];
    const qcm = await dataSource
      .getRepository(Qcm)
      .save({ moduleId, titre: `${MARQUEUR} ${titre}`, statut: StatutQcm.PUBLIE });
    const lignes = await dataSource.getRepository(Question).save(
      definitions.map((d, i) => ({
        enonce: `${MARQUEUR} ${titre} question ${i + 1}`,
        type: d.type,
        ponderation: d.ponderation,
        explication: d.explication,
      })),
    );
    const textes = (type: TypeQuestion): string[] =>
      type === TypeQuestion.VRAI_FAUX ? ['Vrai', 'Faux'] : ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const options = await dataSource.getRepository(Option).save(
      lignes.flatMap((question, i) =>
        textes(question.type).map((texte, j) => ({
          questionId: question.id,
          texte,
          ordre: j + 1,
          estCorrecte: j < definitions[i].nbCorrectes,
        })),
      ),
    );
    await dataSource
      .getRepository(QcmQuestion)
      .save(
        lignes.map((question, i) => ({ qcmId: qcm.id, questionId: question.id, ordre: i + 1 })),
      );
    await dataSource.getRepository(ConfigurationAntiFraude).save({
      qcmId: qcm.id,
      dureeMaxMinutes: 30,
      dateOuverture: new Date(Date.now() - 24 * 60 * MINUTE),
      dateFermeture: new Date(Date.now() + 10 * 24 * 60 * MINUTE),
      nbTentativesMax: reglages.nbTentativesMax,
      delaiEntreTentatives: 0,
      affichageResultats: reglages.mode,
      scoreMinValidation: 50,
      ponderationFormation: 10,
      randomiserQuestions: reglages.randomiser,
      randomiserOptions: reglages.randomiser,
      nbQuestionsTirees: null,
    });
    return {
      id: qcm.id,
      questions: lignes.map((question, i) => {
        const ids = options
          .filter((o) => o.questionId === question.id)
          .sort((x, y) => x.ordre - y.ordre)
          .map((o) => o.id);
        const nb = definitions[i].nbCorrectes;
        return {
          id: question.id,
          ponderation: definitions[i].ponderation,
          explication: definitions[i].explication,
          options: ids,
          correctes: ids.slice(0, nb),
          fausse: ids[nb],
        };
      }),
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
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const crees = await userRepository.save(
      EMAILS.map((adresse) =>
        userRepository.create({
          email: adresse,
          role: Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
        }),
      ),
    );
    for (const compte of crees) {
      const res = await request(serveur())
        .post('/api/auth/login')
        .send({ email: compte.email, password: MOT_DE_PASSE })
        .expect(200);
      const cle = APPRENANTS.find((c) => email(c) === compte.email) as Cle;
      comptes[cle] = { id: compte.id, token: res.body.accessToken as string };
    }

    const formation = await dataSource.getRepository(Formation).save({
      titre: `${MARQUEUR} Réseaux`,
      statut: StatutFormation.OUVERTE,
      capaciteMax: 20,
      noteMinCertification: 70,
    });
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save({ formationId: formation.id, titre: 'HTTP', ordre: 1 });

    immediat = await creerQcm('immediat', module.id, {
      mode: AffichageResultats.IMMEDIAT,
      nbTentativesMax: 1,
      randomiser: true,
    });
    differe = await creerQcm('differe', module.id, {
      mode: AffichageResultats.DIFFERE,
      nbTentativesMax: 1,
      randomiser: false,
    });
    multi = await creerQcm('multi', module.id, {
      mode: AffichageResultats.IMMEDIAT,
      nbTentativesMax: 2,
      randomiser: false,
    });

    await dataSource
      .getRepository(Inscription)
      .save(APPRENANTS.map((cle) => ({ apprenantId: comptes[cle].id, formationId: formation.id })));
  }, PREPARATION_MS);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(EMAILS) })).toBe(0);
    await app.close();
  }, PREPARATION_MS);

  describe('affichage IMMÉDIAT, tentative unique', () => {
    let tentativeId: string;

    it('pendant le passage : 409 non_notee, et aucune bonne réponse dans la consultation', async () => {
      tentativeId = await demarrer('a', immediat.id);
      const res = await corrige('a', tentativeId).expect(409);
      expect(res.body).toMatchObject({ raison: 'non_notee', disponibleLe: null });
      sansFuite(res.body);

      const vue = await consulter('a', tentativeId).expect(200);
      expect(vue.body.questions).toHaveLength(3);
      expect(vue.body.correction).toEqual({
        mode: AffichageResultats.IMMEDIAT,
        disponible: false,
        raison: 'non_notee',
        disponibleLe: null,
      });
      sansFuite(vue.body);
    });

    it('après la soumission : soumission et consultation sans fuite, corrigé annoncé disponible', async () => {
      const [q1, q2] = immediat.questions;
      await repondre('a', tentativeId, q1.id, q1.correctes).expect(200); // juste : +1
      await repondre('a', tentativeId, q2.id, [q2.correctes[0], q2.fausse]).expect(200); // faux
      // q3 sans réponse.
      const soumise = await soumettre('a', tentativeId).expect(200);
      expect(soumise.body).toMatchObject({ statut: StatutTentative.NOTEE });
      sansFuite(soumise.body);

      const vue = await consulter('a', tentativeId).expect(200);
      expect(vue.body.correction).toEqual({
        mode: AffichageResultats.IMMEDIAT,
        disponible: true,
        raison: null,
        disponibleLe: null,
      });
      sansFuite(vue.body);
    });

    it('corrigé : ordre du tirage, ma réponse, juste / faux noté, bonnes options, explications', async () => {
      const res = await corrige('a', tentativeId).expect(200);
      const ligne = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      const plan = ligne.planTirage ?? [];

      expect(res.body).toMatchObject({
        tentativeId,
        qcmId: immediat.id,
        mode: AffichageResultats.IMMEDIAT,
        score: ligne.score,
        estReussie: ligne.estReussie,
        scoreMinValidation: 50,
        nbQuestions: 3,
        nbCorrectes: 1,
      });
      // Ordre des questions ET des options : celui du tirage figé (mélangé).
      expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual(
        plan.map((t) => t.questionId),
      );
      for (const question of res.body.questions as Array<{
        id: string;
        options: Array<{ id: string }>;
      }>) {
        const tiree = plan.find((t) => t.questionId === question.id);
        expect(question.options.map((o) => o.id)).toEqual(tiree?.optionIds);
      }

      const [q1, q2, q3] = immediat.questions;
      const parId = new Map(
        (res.body.questions as Array<Record<string, unknown>>).map((q) => [q.id as string, q]),
      );
      const options = (
        q: Record<string, unknown> | undefined,
      ): Map<string, { id: string; cochee: boolean; estCorrecte: boolean }> =>
        new Map(
          ((q?.options ?? []) as Array<{ id: string; cochee: boolean; estCorrecte: boolean }>).map(
            (o) => [o.id, o],
          ),
        );

      expect(parId.get(q1.id)).toMatchObject({
        repondue: true,
        estCorrecte: true,
        pointsObtenus: 1,
        ponderation: 1,
        explication: 'Explication q1',
      });
      expect(options(parId.get(q1.id)).get(q1.correctes[0])).toMatchObject({
        cochee: true,
        estCorrecte: true,
      });

      expect(parId.get(q2.id)).toMatchObject({
        repondue: true,
        estCorrecte: false,
        pointsObtenus: 0,
        explication: null,
      });
      const o2 = options(parId.get(q2.id));
      expect(o2.get(q2.correctes[1])).toMatchObject({ cochee: false, estCorrecte: true });
      expect(o2.get(q2.fausse)).toMatchObject({ cochee: true, estCorrecte: false });

      // Question sans réponse : 0 point, mais la bonne réponse est montrée.
      expect(parId.get(q3.id)).toMatchObject({
        repondue: false,
        estCorrecte: false,
        pointsObtenus: 0,
        explication: 'Explication q3',
      });
      expect(options(parId.get(q3.id)).get(q3.correctes[0])).toMatchObject({
        cochee: false,
        estCorrecte: true,
      });
    });

    it('lecture seule, sans effet : le corrigé relu est identique', async () => {
      const premier = await corrige('a', tentativeId).expect(200);
      const second = await corrige('a', tentativeId).expect(200);
      expect(second.body).toEqual(premier.body);
    });

    it('404 pour la tentative d’un autre apprenant (même réponse qu’inconnue)', async () => {
      const autre = await corrige('d', tentativeId).expect(404);
      const inconnue = await corrige('d', '00000000-0000-4000-8000-000000000000').expect(404);
      expect(autre.body.message).toBe(inconnue.body.message);
      sansFuite(autre.body);
    });

    it('400 pour un identifiant mal formé ; 401 sans jeton', async () => {
      await corrige('a', 'pas-un-uuid').expect(400);
      await request(serveur()).get(`/api/tentatives/${tentativeId}/correction`).expect(401);
    });
  });

  describe('affichage DIFFÉRÉ', () => {
    let tentativeId: string;

    it('avant la fermeture : score visible, corrigé refusé 409 avec la date de fermeture', async () => {
      tentativeId = await demarrer('b', differe.id);
      const [q1] = differe.questions;
      await repondre('b', tentativeId, q1.id, q1.correctes).expect(200);
      const soumise = await soumettre('b', tentativeId).expect(200);
      expect(soumise.body.score).not.toBeNull();
      sansFuite(soumise.body);

      const configuration = await dataSource
        .getRepository(ConfigurationAntiFraude)
        .findOneByOrFail({ qcmId: differe.id });
      const fermeture = new Date(configuration.dateFermeture).toISOString();

      const res = await corrige('b', tentativeId).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        raison: 'correction_differee',
        disponibleLe: fermeture,
      });
      sansFuite(res.body);

      const vue = await consulter('b', tentativeId).expect(200);
      expect(vue.body.score).not.toBeNull();
      expect(vue.body.correction).toEqual({
        mode: AffichageResultats.DIFFERE,
        disponible: false,
        raison: 'correction_differee',
        disponibleLe: fermeture,
      });
      sansFuite(vue.body);
    });

    it('fermeture passée (heure de la base) : corrigé disponible', async () => {
      await dataSource.query(
        `UPDATE config_anti_fraude SET date_fermeture = now() - interval '1 minute' WHERE qcm_id = $1`,
        [differe.id],
      );
      const vue = await consulter('b', tentativeId).expect(200);
      expect(vue.body.correction).toMatchObject({ disponible: true, raison: null });

      const res = await corrige('b', tentativeId).expect(200);
      expect(res.body.mode).toBe(AffichageResultats.DIFFERE);
      expect(res.body.questions).toHaveLength(3);
      expect(res.body.nbCorrectes).toBe(1);
    });
  });

  describe('affichage IMMÉDIAT avec tentatives restantes (D4-B)', () => {
    let premiere: string;
    let seconde: string;

    it('1re tentative notée, une autre possible : 409 tentatives_restantes', async () => {
      premiere = await demarrer('c', multi.id);
      await soumettre('c', premiere).expect(200);
      const res = await corrige('c', premiere).expect(409);
      expect(res.body).toMatchObject({ raison: 'tentatives_restantes' });
      expect(res.body.disponibleLe).not.toBeNull();
      sansFuite(res.body);
    });

    it('2e tentative EN_COURS : le corrigé de la 1re reste refusé', async () => {
      seconde = await demarrer('c', multi.id);
      const res = await corrige('c', premiere).expect(409);
      expect(res.body.raison).toBe('tentatives_restantes');
      const vue = await consulter('c', seconde).expect(200);
      expect(vue.body.questions).toHaveLength(3);
      sansFuite(vue.body);
    });

    it('quota atteint, plus rien en cours : corrigé des DEUX tentatives disponible', async () => {
      await soumettre('c', seconde).expect(200);
      const r1 = await corrige('c', premiere).expect(200);
      const r2 = await corrige('c', seconde).expect(200);
      expect(r1.body.tentativeId).toBe(premiere);
      expect(r2.body.tentativeId).toBe(seconde);
      // Aucune réponse donnée : tout est faux, 0 point, bonnes options montrées.
      expect(r1.body.nbCorrectes).toBe(0);
      expect(
        (r1.body.questions as Array<{ options: Array<{ estCorrecte: boolean }> }>).every((q) =>
          q.options.some((o) => o.estCorrecte),
        ),
      ).toBe(true);
    });
  });
});
