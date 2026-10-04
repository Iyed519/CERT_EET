import { DataSource, In, Repository } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { ConfigurationAntiFraude } from '../src/database/entities/configuration-anti-fraude.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Option } from '../src/database/entities/option.entity';
import { QcmQuestion } from '../src/database/entities/qcm-question.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { ReponseOption } from '../src/database/entities/reponse-option.entity';
import { Reponse } from '../src/database/entities/reponse.entity';
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';
import { TypeQuestion } from '../src/database/enums/type-question.enum';

/**
 * Tests d'intégration de l'enabler « modèle de données » du Sprint 2.
 *
 * Je vérifie ici, sur la VRAIE base (migrations déjà jouées, comme en CI), que
 * les garanties que le schéma est censé porter tiennent réellement :
 *  - contraintes CHECK (capacité, seuils, fenêtre du QCM, pondération, score) ;
 *  - unicités (inscription, affectation, configuration 1-1, réponse) ;
 *  - RESTRICT sur les données certifiantes, CASCADE sur les compositions ;
 *  - anti-fraude : une seule tentative EN_COURS par (apprenant, QCM) et
 *    `estCorrecte` JAMAIS chargé par défaut (première barrière d'US-QCM-06).
 *
 * Je n'ai besoin ni de l'application Nest ni de Redis : j'ouvre directement la
 * DataSource du projet (mêmes options que l'app et que la CLI de migration).
 *
 * Les lignes de test portent le marqueur « E2E-DM » (ou un email dédié) : le
 * nettoyage est rejoué avant ET après la suite, donc un run interrompu ne
 * laisse pas la base dans un état qui ferait échouer le suivant.
 */
describe('Modèle de données Sprint 2 (e2e) — enabler', () => {
  let dataSource: DataSource;
  let users: Repository<User>;
  let formations: Repository<Formation>;
  let modules: Repository<ModuleFormation>;
  let inscriptions: Repository<Inscription>;
  let affectations: Repository<AffectationFormateur>;
  let qcms: Repository<Qcm>;
  let configurations: Repository<ConfigurationAntiFraude>;
  let questions: Repository<Question>;
  let options: Repository<Option>;
  let qcmQuestions: Repository<QcmQuestion>;
  let tentatives: Repository<TentativeQcm>;
  let reponses: Repository<Reponse>;
  let reponseOptions: Repository<ReponseOption>;

  const MARQUEUR = 'E2E-DM';
  const EMAIL_APPRENANT = 'e2e-dm-appr@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-dm-form@cert-eet.local';
  const EMAILS = [EMAIL_APPRENANT, EMAIL_FORMATEUR];

  let apprenantId: string;
  let formateurId: string;
  let formationId: string;
  let moduleId: string;
  let qcmId: string;
  let questionId: string;
  let optionCorrecteId: string;
  let optionFausseId: string;
  let tentativeId: string;
  let reponseId: string;

  /**
   * Supprime tout ce que la suite a pu créer, dans l'ordre imposé par les
   * RESTRICT : tentatives -> QCM -> questions -> inscriptions -> formations
   * -> comptes. Les CASCADE emportent le reste (réponses, configuration,
   * liens, options, modules, affectations).
   */
  const nettoyer = async (): Promise<void> => {
    await dataSource.query(
      `DELETE FROM "tentatives_qcm" WHERE "apprenant_id" IN (SELECT "id" FROM "users" WHERE "email" = ANY($1))`,
      [EMAILS],
    );
    await dataSource.query(`DELETE FROM "qcm" WHERE "titre" LIKE $1`, [`${MARQUEUR}%`]);
    await dataSource.query(`DELETE FROM "questions" WHERE "enonce" LIKE $1`, [`${MARQUEUR}%`]);
    await dataSource.query(
      `DELETE FROM "inscriptions" WHERE "apprenant_id" IN (SELECT "id" FROM "users" WHERE "email" = ANY($1))`,
      [EMAILS],
    );
    await dataSource.query(`DELETE FROM "formations" WHERE "titre" LIKE $1`, [`${MARQUEUR}%`]);
    await users.delete({ email: In(EMAILS) });
  };

  /** Fabrique une formation valide, surchargée champ par champ. */
  const nouvelleFormation = (surcharge: Partial<Formation> = {}): Formation =>
    formations.create({
      titre: `${MARQUEUR} formation`,
      capaciteMax: 20,
      noteMinCertification: 60,
      ...surcharge,
    });

  /** Fabrique une configuration anti-fraude valide pour le QCM de test. */
  const nouvelleConfiguration = (
    surcharge: Partial<ConfigurationAntiFraude> = {},
  ): ConfigurationAntiFraude =>
    configurations.create({
      qcmId,
      dureeMaxMinutes: 30,
      dateOuverture: new Date('2026-10-01T08:00:00Z'),
      dateFermeture: new Date('2026-10-31T18:00:00Z'),
      affichageResultats: AffichageResultats.DIFFERE,
      scoreMinValidation: 50,
      ponderationFormation: 20,
      ...surcharge,
    });

  /** Fabrique une tentative du QCM de test pour l'apprenant de test. */
  const nouvelleTentative = (surcharge: Partial<TentativeQcm> = {}): TentativeQcm =>
    tentatives.create({
      apprenantId,
      qcmId,
      dateLimite: new Date(Date.now() + 30 * 60 * 1000),
      ...surcharge,
    });

  beforeAll(async () => {
    // Journalisation SQL coupée : en conteneur de dev, elle noierait la sortie.
    dataSource = new DataSource({ ...dataSourceOptions, logging: false });
    await dataSource.initialize();

    users = dataSource.getRepository(User);
    formations = dataSource.getRepository(Formation);
    modules = dataSource.getRepository(ModuleFormation);
    inscriptions = dataSource.getRepository(Inscription);
    affectations = dataSource.getRepository(AffectationFormateur);
    qcms = dataSource.getRepository(Qcm);
    configurations = dataSource.getRepository(ConfigurationAntiFraude);
    questions = dataSource.getRepository(Question);
    options = dataSource.getRepository(Option);
    qcmQuestions = dataSource.getRepository(QcmQuestion);
    tentatives = dataSource.getRepository(TentativeQcm);
    reponses = dataSource.getRepository(Reponse);
    reponseOptions = dataSource.getRepository(ReponseOption);

    await nettoyer();

    const [apprenant, formateur] = await users.save([
      users.create({
        email: EMAIL_APPRENANT,
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
      }),
      users.create({
        email: EMAIL_FORMATEUR,
        role: Role.FORMATEUR,
        statut: StatutCompte.ACTIF,
      }),
    ]);
    apprenantId = apprenant.id;
    formateurId = formateur.id;

    formationId = (await formations.save(nouvelleFormation())).id;
    moduleId = (
      await modules.save(modules.create({ formationId, titre: 'Module 1', ordre: 1 }))
    ).id;
    qcmId = (
      await qcms.save(qcms.create({ moduleId, formateurId, titre: `${MARQUEUR} QCM` }))
    ).id;

    questionId = (
      await questions.save(
        questions.create({ enonce: `${MARQUEUR} 2 + 2 ?`, type: TypeQuestion.QCU }),
      )
    ).id;
    const [correcte, fausse] = await options.save([
      options.create({ questionId, texte: '4', estCorrecte: true, ordre: 1 }),
      options.create({ questionId, texte: '5', estCorrecte: false, ordre: 2 }),
    ]);
    optionCorrecteId = correcte.id;
    optionFausseId = fausse.id;
    await qcmQuestions.save(qcmQuestions.create({ qcmId, questionId, ordre: 1 }));
  });

  afterAll(async () => {
    await nettoyer();
    await dataSource.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('Formations, inscriptions, affectations (E2)', () => {
    it('applique les valeurs par défaut et relit les seuils en nombre', async () => {
      const formation = await formations.findOneByOrFail({ id: formationId });
      expect(formation.statut).toBe(StatutFormation.OUVERTE);
      // numeric PostgreSQL -> number (et non la chaîne "60.00").
      expect(formation.noteMinCertification).toBe(60);
    });

    it('refuse une capacité nulle ou négative (CHECK)', async () => {
      await expect(formations.save(nouvelleFormation({ capaciteMax: 0 }))).rejects.toThrow(
        'CHK_formations_capacite_max',
      );
    });

    it('refuse un seuil de certification hors [0,100] (CHECK)', async () => {
      await expect(
        formations.save(nouvelleFormation({ noteMinCertification: 101 })),
      ).rejects.toThrow('CHK_formations_note_min_certification');
    });

    it("crée une inscription EN_COURS à 0 % et refuse la double inscription", async () => {
      const inscription = await inscriptions.save(
        inscriptions.create({ apprenantId, formationId }),
      );
      const relue = await inscriptions.findOneByOrFail({ id: inscription.id });
      expect(relue.statut).toBe(StatutInscription.EN_COURS);
      expect(relue.tauxAvancement).toBe(0);

      await expect(
        inscriptions.save(inscriptions.create({ apprenantId, formationId })),
      ).rejects.toThrow('UQ_inscriptions_apprenant_formation');
    });

    it("protège l'inscription : ni l'apprenant ni la formation ne sont supprimables (RESTRICT)", async () => {
      await expect(users.delete({ id: apprenantId })).rejects.toThrow(
        'FK_inscriptions_apprenant',
      );
      await expect(formations.delete({ id: formationId })).rejects.toThrow(
        'FK_inscriptions_formation',
      );
    });

    it('refuse la double affectation du même formateur', async () => {
      await affectations.save(affectations.create({ formationId, formateurId }));
      await expect(
        affectations.save(affectations.create({ formationId, formateurId })),
      ).rejects.toThrow('UQ_formation_formateurs_formation_formateur');
    });

    it('supprime modules et affectations avec la formation (CASCADE)', async () => {
      const jetable = await formations.save(
        nouvelleFormation({ titre: `${MARQUEUR} formation jetable` }),
      );
      await modules.save(modules.create({ formationId: jetable.id, titre: 'M', ordre: 1 }));
      await affectations.save(affectations.create({ formationId: jetable.id, formateurId }));

      await formations.delete({ id: jetable.id });

      expect(await modules.countBy({ formationId: jetable.id })).toBe(0);
      expect(await affectations.countBy({ formationId: jetable.id })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('QCM, configuration anti-fraude, questions (E3)', () => {
    it('crée un QCM en BROUILLON et protège son module (RESTRICT)', async () => {
      const qcm = await qcms.findOneByOrFail({ id: qcmId });
      expect(qcm.statut).toBe(StatutQcm.BROUILLON);
      await expect(modules.delete({ id: moduleId })).rejects.toThrow('FK_qcm_module');
    });

    it('refuse une configuration incohérente (CHECK)', async () => {
      await expect(
        configurations.save(
          nouvelleConfiguration({ dateOuverture: new Date('2026-11-15T08:00:00Z') }),
        ),
      ).rejects.toThrow('CHK_config_anti_fraude_fenetre');
      await expect(
        configurations.save(nouvelleConfiguration({ dureeMaxMinutes: 0 })),
      ).rejects.toThrow('CHK_config_anti_fraude_duree');
      await expect(
        configurations.save(nouvelleConfiguration({ scoreMinValidation: 120 })),
      ).rejects.toThrow('CHK_config_anti_fraude_score_min');
      await expect(
        configurations.save(nouvelleConfiguration({ nbTentativesMax: 0 })),
      ).rejects.toThrow('CHK_config_anti_fraude_nb_tentatives');
    });

    it("n'accepte qu'UNE configuration par QCM (1-1)", async () => {
      const configuration = await configurations.save(nouvelleConfiguration());
      const relue = await configurations.findOneByOrFail({ id: configuration.id });
      // Aucune mesure n'est activée implicitement.
      expect(relue.randomiserQuestions).toBe(false);
      expect(relue.blocageSessionsMultiples).toBe(false);
      expect(relue.nbTentativesMax).toBe(1);
      expect(relue.scoreMinValidation).toBe(50);

      await expect(configurations.save(nouvelleConfiguration())).rejects.toThrow(
        'UQ_config_anti_fraude_qcm',
      );
    });

    it('refuse une pondération nulle et un doublon de question dans le QCM', async () => {
      await expect(
        questions.save(
          questions.create({
            enonce: `${MARQUEUR} pondération nulle`,
            type: TypeQuestion.QCU,
            ponderation: 0,
          }),
        ),
      ).rejects.toThrow('CHK_questions_ponderation');
      await expect(
        qcmQuestions.save(qcmQuestions.create({ qcmId, questionId, ordre: 2 })),
      ).rejects.toThrow('UQ_qcm_questions_qcm_question');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Non-exposition des bonnes réponses (F1, US-QCM-06)', () => {
    it("ne charge JAMAIS estCorrecte par défaut (find, relation, QueryBuilder)", async () => {
      const parFind = await options.find({ where: { questionId } });
      const parRelation = await questions.findOneOrFail({
        where: { id: questionId },
        relations: { options: true },
      });
      const parQueryBuilder = await questions
        .createQueryBuilder('question')
        .leftJoinAndSelect('question.options', 'option')
        .where('question.id = :questionId', { questionId })
        .getOneOrFail();

      expect(parFind).toHaveLength(2);
      for (const option of [...parFind, ...parRelation.options, ...parQueryBuilder.options]) {
        expect(option).not.toHaveProperty('estCorrecte');
      }
      // Ce qui partirait dans une réponse HTTP ne contient pas le champ.
      expect(JSON.stringify([parFind, parRelation, parQueryBuilder])).not.toContain(
        'estCorrecte',
      );
    });

    it("ne rend estCorrecte qu'à une demande explicite (scoring serveur)", async () => {
      const pourScoring = await options
        .createQueryBuilder('option')
        .addSelect('option.estCorrecte')
        .where('option.questionId = :questionId', { questionId })
        .orderBy('option.ordre', 'ASC')
        .getMany();

      expect(pourScoring.map((option) => option.estCorrecte)).toEqual([true, false]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tentatives et réponses (E3)', () => {
    it("n'autorise qu'UNE tentative EN_COURS par apprenant et par QCM", async () => {
      const tentative = await tentatives.save(nouvelleTentative());
      tentativeId = tentative.id;
      const relue = await tentatives.findOneByOrFail({ id: tentativeId });
      expect(relue.statut).toBe(StatutTentative.EN_COURS);
      expect(relue.score).toBeNull();

      await expect(tentatives.save(nouvelleTentative())).rejects.toThrow(
        'UQ_tentatives_qcm_en_cours',
      );
    });

    it('autorise une nouvelle tentative une fois la précédente NOTEE', async () => {
      await tentatives.update(tentativeId, {
        statut: StatutTentative.NOTEE,
        score: 87.5,
        estReussie: true,
        dateFin: new Date(),
        dureeEffective: 600,
      });
      const notee = await tentatives.findOneByOrFail({ id: tentativeId });
      expect(notee.score).toBe(87.5);

      const suivante = await tentatives.save(nouvelleTentative());
      expect(suivante.id).not.toBe(tentativeId);
      tentativeId = suivante.id;
    });

    it('refuse un score hors [0,100] (CHECK)', async () => {
      await expect(tentatives.update(tentativeId, { score: 150 })).rejects.toThrow(
        'CHK_tentatives_qcm_score',
      );
    });

    it('conserve le tirage figé de la tentative (plan_tirage)', async () => {
      const planTirage = [
        { questionId, optionIds: [optionFausseId, optionCorrecteId] },
      ];
      await tentatives.update(tentativeId, { planTirage });
      const relue = await tentatives.findOneByOrFail({ id: tentativeId });
      // L'ORDRE des options doit être restitué tel quel.
      expect(relue.planTirage).toEqual(planTirage);
    });

    it("n'enregistre qu'UNE réponse par question et qu'une fois chaque option", async () => {
      const reponse = await reponses.save(reponses.create({ tentativeId, questionId }));
      reponseId = reponse.id;
      expect(reponse.estCorrecte ?? null).toBeNull();

      await expect(
        reponses.save(reponses.create({ tentativeId, questionId })),
      ).rejects.toThrow('UQ_reponses_tentative_question');

      await reponseOptions.insert({ reponseId, optionId: optionCorrecteId });
      await expect(
        reponseOptions.insert({ reponseId, optionId: optionCorrecteId }),
      ).rejects.toThrow('PK_reponse_options');
    });

    it('fige le contenu dès qu\'un apprenant a répondu (RESTRICT)', async () => {
      // Une option cochée, une question répondue, un QCM passé et le compte de
      // l'apprenant ne peuvent plus être supprimés.
      await expect(options.delete({ id: optionCorrecteId })).rejects.toThrow(
        'FK_reponse_options_option',
      );
      await expect(qcms.delete({ id: qcmId })).rejects.toThrow('FK_tentatives_qcm_qcm');
      await expect(users.delete({ id: apprenantId })).rejects.toThrow(
        'FK_inscriptions_apprenant',
      );
    });

    it('supprime réponses et sélections avec la tentative (CASCADE)', async () => {
      await tentatives.delete({ id: tentativeId });

      expect(await reponses.countBy({ tentativeId })).toBe(0);
      expect(await reponseOptions.countBy({ reponseId })).toBe(0);
    });
  });
});
