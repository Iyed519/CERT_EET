import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';
import { TypeQuestion } from '../src/database/enums/type-question.enum';
import { TentativeBalayageService } from '../src/modules/tentatives/tentative-balayage.service';
import { TentativeNotationService } from '../src/modules/tentatives/tentative-notation.service';

/**
 * Tests d'intégration US-QCM-08 — Notation serveur et tentative figée.
 *
 * Sur l'application réelle et la vraie base :
 *  - score pondéré Σ(pondération × correcte) / Σ(pondération) × 100 sur les
 *    seules questions du tirage, question sans réponse = 0, QCM tout ou rien ;
 *  - réussite au seuil du QCM (égalité comprise) ; `estCorrecte` et
 *    `pointsObtenus` sur chaque réponse ; score renvoyé par la soumission et
 *    la consultation ; audit TENTATIVE_NOTEE ;
 *  - notation à chaque clôture : soumission, échéance à la sauvegarde,
 *    rattrapage du balayage (sans acteur) ;
 *  - taux d'avancement de l'inscription (QCM publiés réussis / publiés) ;
 *  - immuabilité : la base refuse toute modification d'une tentative NOTEE,
 *    et une seconde notation ne fait rien ;
 *  - concurrence (chevauchement FORCÉ) : deux notations simultanées, une
 *    seule note, un seul audit.
 *
 * Nettoyage rejouable (avant ET après), dans l'ordre des clés RESTRICT ;
 * audit purgé par compte et par tentative (le rattrapage n'a pas d'acteur).
 */
describe('Notation serveur et tentative figée (e2e) — US-QCM-08', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let tentativeRepository: Repository<TentativeQcm>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let notation: TentativeNotationService;
  let balayage: TentativeBalayageService;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-REPONSE, E2E-TIRAGE).
  const MARQUEUR = 'E2E-NOTATION';
  const APPRENANTS = ['a', 'b', 'c', 'd'] as const;
  type Cle = (typeof APPRENANTS)[number];
  const email = (cle: string): string => `e2e-notation-${cle}@cert-eet.local`;
  const EMAILS = APPRENANTS.map(email);
  const MINUTE = 60_000;
  const PREPARATION_MS = 60_000;

  const comptes = {} as Record<Cle, { id: string; token: string }>;
  let formationId: string;
  interface QuestionTest {
    id: string;
    ponderation: number;
    // Options dans l'ordre de rédaction ; `correctes` = sous-ensemble.
    options: string[];
    correctes: string[];
    fausse: string;
  }
  // Principal (seuil 40) : q1 QCU ×1, q2 QCM ×2 (2 bonnes), q3 Vrai/Faux ×3, q4 QCU ×4.
  let principal: { id: string; questions: QuestionTest[] };
  // Second QCM de la formation (seuil 50) : une QCU ×1.
  let second: { id: string; questions: QuestionTest[] };

  const serveur = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();
  const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  const demarrer = async (cle: Cle, qcmId = principal.id): Promise<string> => {
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

  const audits = (action: string, cible: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action, cible }, order: { horodatage: 'ASC' } });

  const tauxInscription = async (cle: Cle): Promise<number> =>
    (
      await dataSource
        .getRepository(Inscription)
        .findOneByOrFail({ apprenantId: comptes[cle].id, formationId })
    ).tauxAvancement;

  /** Passe la tentative à SOUMISE sans la noter (simule une notation en échec). */
  const forcerSoumise = (tentativeId: string): Promise<unknown> =>
    dataSource.query(
      `UPDATE tentatives_qcm SET statut = 'SOUMISE', date_fin = now(), duree_effective = 60 WHERE id = $1`,
      [tentativeId],
    );

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

  /** QCM publié, sans mélange (plan = ordre de rédaction), seuil donné. */
  const creerQcm = async (
    titre: string,
    moduleId: string,
    seuil: number,
    definitions: Array<{ type: TypeQuestion; ponderation: number; nbCorrectes: number }>,
  ): Promise<{ id: string; questions: QuestionTest[] }> => {
    const qcm = await dataSource
      .getRepository(Qcm)
      .save({ moduleId, titre: `${MARQUEUR} ${titre}`, statut: StatutQcm.PUBLIE });
    const lignes = await dataSource.getRepository(Question).save(
      definitions.map((d, i) => ({
        enonce: `${MARQUEUR} ${titre} question ${i + 1}`,
        type: d.type,
        ponderation: d.ponderation,
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
      nbTentativesMax: 20,
      delaiEntreTentatives: 0,
      affichageResultats: AffichageResultats.DIFFERE,
      scoreMinValidation: seuil,
      ponderationFormation: 10,
      randomiserQuestions: false,
      randomiserOptions: false,
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
    auditLogRepository = dataSource.getRepository(AuditLog);
    notation = moduleRef.get(TentativeNotationService);
    balayage = moduleRef.get(TentativeBalayageService);

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
      titre: `${MARQUEUR} Kubernetes`,
      statut: StatutFormation.OUVERTE,
      capaciteMax: 20,
      noteMinCertification: 70,
    });
    formationId = formation.id;
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save({ formationId, titre: 'Pods', ordre: 1 });

    principal = await creerQcm('principal', module.id, 40, [
      { type: TypeQuestion.QCU, ponderation: 1, nbCorrectes: 1 },
      { type: TypeQuestion.QCM, ponderation: 2, nbCorrectes: 2 },
      { type: TypeQuestion.VRAI_FAUX, ponderation: 3, nbCorrectes: 1 },
      { type: TypeQuestion.QCU, ponderation: 4, nbCorrectes: 1 },
    ]);
    second = await creerQcm('second', module.id, 50, [
      { type: TypeQuestion.QCU, ponderation: 1, nbCorrectes: 1 },
    ]);

    await dataSource
      .getRepository(Inscription)
      .save(APPRENANTS.map((cle) => ({ apprenantId: comptes[cle].id, formationId })));
  }, PREPARATION_MS);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(EMAILS) })).toBe(0);
    await app.close();
  }, PREPARATION_MS);

  describe('soumission notée', () => {
    let tentativeId: string;

    it('score pondéré sur 10 points : 4/10 = 40 %, seuil 40 atteint, QCM tout ou rien', async () => {
      const [q1, q2, q3] = principal.questions;
      tentativeId = await demarrer('a');
      await repondre('a', tentativeId, q1.id, q1.correctes).expect(200); // +1
      await repondre('a', tentativeId, q2.id, [q2.correctes[0]]).expect(200); // incomplète : 0
      await repondre('a', tentativeId, q3.id, q3.correctes).expect(200); // +3
      // q4 (×4) sans réponse : 0, mais compte.

      const res = await soumettre('a', tentativeId).expect(200);
      expect(res.body).toMatchObject({
        statut: StatutTentative.NOTEE,
        score: 40,
        estReussie: true,
        nbQuestions: 4,
        nbReponses: 3,
      });

      const ligne = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(ligne).toMatchObject({ statut: StatutTentative.NOTEE, score: 40, estReussie: true });

      const reponses = await dataSource
        .getRepository(Reponse)
        .find({
          where: { tentativeId },
          select: { questionId: true, estCorrecte: true, pointsObtenus: true },
        });
      const parQuestion = Object.fromEntries(reponses.map((r) => [r.questionId, r]));
      expect(parQuestion[q1.id]).toMatchObject({ estCorrecte: true, pointsObtenus: 1 });
      expect(parQuestion[q2.id]).toMatchObject({ estCorrecte: false, pointsObtenus: 0 });
      expect(parQuestion[q3.id]).toMatchObject({ estCorrecte: true, pointsObtenus: 3 });
      expect(reponses).toHaveLength(3);
    });

    it('la consultation renvoie la note ; aucune bonne réponse dans les réponses de l’API', async () => {
      const res = await request(serveur())
        .get(`/api/tentatives/${tentativeId}`)
        .set(...auth(comptes.a.token))
        .expect(200);
      expect(res.body).toMatchObject({
        statut: StatutTentative.NOTEE,
        score: 40,
        estReussie: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /estCorrecte|est_correcte|pointsObtenus|ponderation/,
      );
    });

    it('audit TENTATIVE_NOTEE par l’apprenant, après QCM_SOUMIS ; avancement 1 QCM sur 2', async () => {
      const [soumis] = await audits('QCM_SOUMIS', tentativeId);
      const [note] = await audits('TENTATIVE_NOTEE', tentativeId);
      expect(note).toMatchObject({ userId: comptes.a.id, resultat: 'Succès' });
      expect(note.detailsAvantApres).toMatchObject({
        statut: { avant: StatutTentative.SOUMISE, apres: StatutTentative.NOTEE },
        score: 40,
        estReussie: true,
        scoreMinValidation: 40,
        nbQuestions: 4,
        nbCorrectes: 2,
        tauxAvancement: 50,
      });
      expect(note.horodatage.getTime()).toBeGreaterThanOrEqual(soumis.horodatage.getTime());
      expect(await tauxInscription('a')).toBe(50);
    });

    it('immuable : la base refuse de modifier une tentative NOTEE ; renoter ne fait rien', async () => {
      await expect(
        dataSource.query('UPDATE tentatives_qcm SET score = 100 WHERE id = $1', [tentativeId]),
      ).rejects.toThrow(/NOTEE est immuable/);
      await expect(
        dataSource.query(`UPDATE tentatives_qcm SET statut = 'SOUMISE' WHERE id = $1`, [
          tentativeId,
        ]),
      ).rejects.toThrow(/NOTEE est immuable/);

      await expect(notation.noter(tentativeId, comptes.a.id)).resolves.toBeNull();
      expect(await audits('TENTATIVE_NOTEE', tentativeId)).toHaveLength(1);
      expect((await tentativeRepository.findOneByOrFail({ id: tentativeId })).score).toBe(40);
      await soumettre('a', tentativeId).expect(409);
    });
  });

  it('tout juste : 100 % ; second QCM raté : 0 %, avancement 1 sur 2 (réussi au moins une fois)', async () => {
    const id = await demarrer('b');
    for (const q of principal.questions) {
      await repondre('b', id, q.id, q.correctes).expect(200);
    }
    const res = await soumettre('b', id).expect(200);
    expect(res.body).toMatchObject({ score: 100, estReussie: true });
    expect(await tauxInscription('b')).toBe(50);

    const rate = await demarrer('b', second.id);
    await repondre('b', rate, second.questions[0].id, [second.questions[0].fausse]).expect(200);
    const echec = await soumettre('b', rate).expect(200);
    expect(echec.body).toMatchObject({
      statut: StatutTentative.NOTEE,
      score: 0,
      estReussie: false,
    });
    expect(await tauxInscription('b')).toBe(50);

    const reussi = await demarrer('b', second.id);
    await repondre('b', reussi, second.questions[0].id, second.questions[0].correctes).expect(200);
    await soumettre('b', reussi).expect(200);
    expect(await tauxInscription('b')).toBe(100);
  });

  it('seules les questions du tirage comptent : plan réduit à q1 et q3 -> 1/4 = 25 %', async () => {
    const [q1, , q3] = principal.questions;
    const id = await demarrer('c');
    await tentativeRepository.update(
      { id },
      { planTirage: [q1, q3].map((q) => ({ questionId: q.id, optionIds: q.options })) },
    );
    await repondre('c', id, q1.id, q1.correctes).expect(200);
    await repondre('c', id, q3.id, [q3.fausse]).expect(200);
    const res = await soumettre('c', id).expect(200);
    expect(res.body).toMatchObject({ score: 25, estReussie: false, nbQuestions: 2 });
  });

  it('temps écoulé à la sauvegarde : réponses partielles notées (1/10 = 10 %)', async () => {
    const [q1, q2] = principal.questions;
    const id = await demarrer('c');
    await repondre('c', id, q1.id, q1.correctes).expect(200);
    await dataSource.query(
      `UPDATE tentatives_qcm
          SET date_limite = now() - interval '1 second',
              date_debut = now() - interval '31 minutes'
        WHERE id = $1`,
      [id],
    );
    const refus = await repondre('c', id, q2.id, q2.correctes).expect(409);
    expect(refus.body.raison).toBe('temps_ecoule');

    expect(await tentativeRepository.findOneByOrFail({ id })).toMatchObject({
      statut: StatutTentative.NOTEE,
      score: 10,
      estReussie: false,
    });
    const [note] = await audits('TENTATIVE_NOTEE', id);
    expect(note).toMatchObject({ userId: comptes.c.id });
    expect(note.detailsAvantApres).toMatchObject({
      statut: { avant: StatutTentative.ABANDONNEE_TIMER, apres: StatutTentative.NOTEE },
    });
  });

  it('rattrapage par le balayage : une tentative restée SOUMISE est notée par le système', async () => {
    const id = await demarrer('d');
    for (const q of principal.questions) {
      await repondre('d', id, q.id, q.correctes).expect(200);
    }
    await forcerSoumise(id);

    await balayage.balayer();

    expect(await tentativeRepository.findOneByOrFail({ id })).toMatchObject({
      statut: StatutTentative.NOTEE,
      score: 100,
      estReussie: true,
    });
    const traces = await audits('TENTATIVE_NOTEE', id);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ userId: null });
    expect(await tauxInscription('d')).toBe(50);
  });

  it('concurrence : deux notations simultanées -> une seule note, un seul audit', async () => {
    const q1 = principal.questions[0];
    const id = await demarrer('d');
    await repondre('d', id, q1.id, q1.correctes).expect(200);
    await forcerSoumise(id);

    // Les UPDATE sur tentatives_qcm attendent ; les SELECT … FOR UPDATE passent.
    // La première notation prend le verrou de la ligne puis attend sur son
    // UPDATE ; la seconde attend le verrou de la ligne.
    const bloqueur = dataSource.createQueryRunner();
    await bloqueur.connect();
    await bloqueur.startTransaction();
    let resultats: PromiseSettledResult<unknown>[];
    try {
      await bloqueur.query('LOCK TABLE tentatives_qcm IN SHARE ROW EXCLUSIVE MODE');
      const premiere = notation.noter(id, comptes.d.id);
      await new Promise((fin) => setTimeout(fin, 300));
      const seconde = notation.noter(id, null);
      await new Promise((fin) => setTimeout(fin, 700));
      await bloqueur.commitTransaction();
      resultats = await Promise.allSettled([premiere, seconde]);
    } finally {
      if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
      await bloqueur.release();
    }

    expect(resultats.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const valeurs = resultats.map((r) => (r as PromiseFulfilledResult<unknown>).value);
    expect(valeurs[0]).toMatchObject({ tentativeId: id, score: 10 });
    expect(valeurs[1]).toBeNull();
    expect(await audits('TENTATIVE_NOTEE', id)).toHaveLength(1);
  });
});
