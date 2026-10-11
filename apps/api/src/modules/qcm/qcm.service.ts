import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Option } from '../../database/entities/option.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { Question } from '../../database/entities/question.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { CreateQcmDto } from './dto/create-qcm.dto';
import { OptionDto, QuestionDto } from './dto/question.dto';
import { UpdateQcmDto } from './dto/update-qcm.dto';
import { ConfigurationVue, versConfigurationVue } from './qcm-configuration.service';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/** Un QCM dans une liste (sans ses questions). */
export interface QcmResumeVue {
  id: string;
  moduleId: string;
  titre: string;
  description: string | null;
  statut: StatutQcm;
  nbQuestions: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Une option, vue par le FORMATEUR (bonne réponse comprise). */
export interface OptionVue {
  id: string;
  texte: string;
  estCorrecte: boolean;
  ordre: number;
}

/** Une question du QCM, vue par le FORMATEUR. */
export interface QuestionVue {
  id: string;
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  explication: string | null;
  niveauDifficulte: string | null;
  ordre: number;
  options: OptionVue[];
}

/**
 * Détail d'un QCM pour son éditeur. `verrouille` : au moins une tentative
 * existe, le contenu est figé (seules les explications restent modifiables).
 * `configuration` : paramètres anti-fraude (US-QCM-03), null tant qu'ils ne
 * sont pas enregistrés.
 */
export interface QcmDetailVue extends QcmResumeVue {
  formationId: string;
  verrouille: boolean;
  configuration: ConfigurationVue | null;
  questions: QuestionVue[];
}

/** Types de questions dont la correction est définie (Backlog, DS-12). */
const TYPES_PRIS_EN_CHARGE: ReadonlySet<TypeQuestion> = new Set([
  TypeQuestion.QCM,
  TypeQuestion.QCU,
  TypeQuestion.VRAI_FAUX,
]);

const MAX_OPTIONS = 10;

const MESSAGE_VERROUILLE =
  'Ce QCM a déjà des tentatives : son contenu est figé, seules les explications restent modifiables.';

/**
 * Contenu des QCM : le QCM lui-même, ses questions et leurs options
 * (US-QCM-01, DS-12 partie 1 et 2, UC1 Formateur).
 *
 * Qui : le contrôleur pose @FormateurDeLaFormation — seul un formateur
 * AFFECTÉ à la formation (ou un administrateur) arrive ici.
 *
 * Règles transverses :
 *  - toute écriture passe par chargerPourEcriture : 404 si le QCM n'existe
 *    pas, 409 si sa formation est archivée ;
 *  - dès la première tentative, le contenu est FIGÉ (intégrité de
 *    l'évaluation certifiante) : seules les explications restent modifiables ;
 *  - les bonnes réponses (`estCorrecte`, colonne non sélectionnée par défaut)
 *    ne sortent QUE par ce service, réservé aux formateurs et administrateurs.
 */
@Injectable()
export class QcmService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    @InjectRepository(QcmQuestion)
    private readonly lienRepository: Repository<QcmQuestion>,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
    @InjectRepository(ModuleFormation)
    private readonly moduleRepository: Repository<ModuleFormation>,
    @InjectRepository(ConfigurationAntiFraude)
    private readonly configurationRepository: Repository<ConfigurationAntiFraude>,
    private readonly formationsService: FormationsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  // ===================================================================
  //  QCM
  // ===================================================================

  /**
   * Crée un QCM vide, au statut BROUILLON (imposé), dans un module.
   * Le créateur (`formateur_id`) est l'utilisateur du jeton. 404 si le module
   * n'existe pas, 409 si sa formation est archivée.
   */
  async creer(
    acteurId: string,
    moduleId: string,
    dto: CreateQcmDto,
    contexte: Contexte,
  ): Promise<QcmResumeVue> {
    const module = await this.moduleRepository.findOne({
      where: { id: moduleId },
      select: { id: true, formationId: true },
    });
    if (!module) {
      throw new NotFoundException('Module introuvable.');
    }
    await this.formationsService.chargerPourEcriture(module.formationId);

    const titre = this.texteObligatoire(dto.titre, 'Le titre est obligatoire.');
    const qcm = await this.qcmRepository.save(
      this.qcmRepository.create({
        moduleId,
        formateurId: acteurId,
        titre,
        description: this.texteFacultatif(dto.description),
        statut: StatutQcm.BROUILLON,
      }),
    );

    await this.auditService.record({
      action: 'QCM_CREE',
      acteur: acteurId,
      cible: qcm.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { formationId: module.formationId, moduleId, titre },
    });

    return this.versResume(qcm, 0);
  }

  /** Les QCM d'un module (tous statuts), du plus ancien au plus récent. */
  async listerDuModule(moduleId: string): Promise<QcmResumeVue[]> {
    const qcms = await this.qcmRepository.find({
      where: { moduleId },
      order: { createdAt: 'ASC' },
    });
    if (qcms.length === 0) {
      return [];
    }
    const comptes = await this.lienRepository
      .createQueryBuilder('lien')
      .select('lien.qcmId', 'qcmId')
      .addSelect('COUNT(*)', 'nb')
      .where('lien.qcmId IN (:...ids)', { ids: qcms.map((q) => q.id) })
      .groupBy('lien.qcmId')
      .getRawMany<{ qcmId: string; nb: string }>();
    const parQcm = new Map(comptes.map((c) => [c.qcmId, Number(c.nb)]));
    return qcms.map((q) => this.versResume(q, parQcm.get(q.id) ?? 0));
  }

  /** Le QCM, ses questions dans l'ordre et leurs options (bonnes réponses comprises). */
  async detail(qcmId: string): Promise<QcmDetailVue> {
    const qcm = await this.qcmRepository.findOne({
      where: { id: qcmId },
      relations: { module: true },
    });
    if (!qcm) {
      throw new NotFoundException('QCM introuvable.');
    }
    const questions = await this.chargerQuestions(this.dataSource.manager, qcmId);
    const configuration = await this.configurationRepository.findOne({ where: { qcmId } });
    return {
      ...this.versResume(qcm, questions.length),
      formationId: qcm.module.formationId,
      verrouille: await this.estVerrouille(qcmId),
      configuration: configuration ? versConfigurationVue(configuration) : null,
      questions,
    };
  }

  /**
   * Modifie le titre et/ou la description. Ce sont des métadonnées : elles
   * restent modifiables même après une tentative (elles ne changent ni les
   * questions ni la correction). Un PATCH sans changement n'écrit rien.
   */
  async modifier(
    acteurId: string,
    qcmId: string,
    dto: UpdateQcmDto,
    contexte: Contexte,
  ): Promise<QcmDetailVue> {
    const { qcm } = await this.chargerPourEcriture(qcmId);
    if (dto.titre === undefined && dto.description === undefined) {
      throw new BadRequestException('Aucune modification fournie.');
    }

    const avant: Record<string, unknown> = {};
    const apres: Record<string, unknown> = {};
    if (dto.titre !== undefined) {
      const titre = this.texteObligatoire(dto.titre, 'Le titre ne peut pas être vide.');
      if (titre !== qcm.titre) {
        avant.titre = qcm.titre;
        apres.titre = titre;
      }
    }
    if (dto.description !== undefined) {
      const description = this.texteFacultatif(dto.description);
      if (description !== qcm.description) {
        avant.description = qcm.description;
        apres.description = description;
      }
    }

    if (Object.keys(apres).length > 0) {
      await this.qcmRepository.update({ id: qcmId }, apres);
      await this.auditService.record({
        action: 'QCM_MODIFIE',
        acteur: acteurId,
        cible: qcmId,
        adresseIp: contexte.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: { avant, apres },
      });
    }
    return this.detail(qcmId);
  }

  /**
   * Supprime un QCM, seulement s'il n'est pas publié et n'a aucune tentative
   * (409 sinon). Ses questions partent avec lui, sauf celles qu'un autre QCM
   * utilise encore (banque de questions, US-QCM-02).
   */
  async supprimer(acteurId: string, qcmId: string, contexte: Contexte): Promise<void> {
    const { qcm, formationId } = await this.chargerPourEcriture(qcmId);
    if (qcm.statut === StatutQcm.PUBLIE) {
      throw new ConflictException('Un QCM publié ne peut pas être supprimé.');
    }
    if (await this.estVerrouille(qcmId)) {
      throw new ConflictException('Ce QCM a déjà des tentatives : il ne peut plus être supprimé.');
    }

    let nbQuestions = 0;
    await this.dataSource.transaction(async (manager) => {
      const liens = await manager.find(QcmQuestion, { where: { qcmId } });
      nbQuestions = liens.length;
      await manager.delete(Qcm, { id: qcmId }); // CASCADE sur qcm_questions
      await this.supprimerQuestionsOrphelines(
        manager,
        liens.map((l) => l.questionId),
      );
    });

    await this.auditService.record({
      action: 'QCM_SUPPRIME',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { formationId, moduleId: qcm.moduleId, titre: qcm.titre, nbQuestions },
    });
  }

  // ===================================================================
  //  Questions
  // ===================================================================

  /**
   * Ajoute une question à la fin du QCM. Validation complète AVANT toute
   * écriture (400, rien n'est enregistré), puis question + options + liaison
   * dans une seule transaction.
   */
  async ajouterQuestion(
    acteurId: string,
    qcmId: string,
    dto: QuestionDto,
    contexte: Contexte,
  ): Promise<QuestionVue> {
    await this.chargerPourEcriture(qcmId);
    await this.exigerNonVerrouille(qcmId);
    const saisie = this.validerQuestion(dto);

    const questionId = await this.dataSource.transaction(async (manager) => {
      const question = await manager.save(
        manager.create(Question, {
          enonce: saisie.enonce,
          type: saisie.type,
          ponderation: saisie.ponderation,
          explication: saisie.explication,
          niveauDifficulte: saisie.niveauDifficulte,
        }),
      );
      await this.enregistrerOptions(manager, question.id, saisie.options);
      const dernier = await manager
        .createQueryBuilder(QcmQuestion, 'lien')
        .select('COALESCE(MAX(lien.ordre), 0)', 'max')
        .where('lien.qcmId = :qcmId', { qcmId })
        .getRawOne<{ max: number | string }>();
      await manager.save(
        manager.create(QcmQuestion, {
          qcmId,
          questionId: question.id,
          ordre: Number(dernier?.max ?? 0) + 1,
        }),
      );
      return question.id;
    });

    await this.auditService.record({
      action: 'QUESTION_AJOUTEE',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { questionId, type: saisie.type, nbOptions: saisie.options.length },
    });

    return this.questionDuQcm(qcmId, questionId);
  }

  /**
   * Remplace une question (énoncé, type, pondération, explication, niveau,
   * options). QCM verrouillé : seule l'explication peut changer — toute autre
   * différence donne 409 ; une demande identique au reste ne modifie que
   * l'explication.
   */
  async remplacerQuestion(
    acteurId: string,
    qcmId: string,
    questionId: string,
    dto: QuestionDto,
    contexte: Contexte,
  ): Promise<QuestionVue> {
    await this.chargerPourEcriture(qcmId);
    const actuelle = await this.questionDuQcm(qcmId, questionId);
    const saisie = this.validerQuestion(dto);

    if (await this.estVerrouille(qcmId)) {
      if (!this.memeContenuHorsExplication(actuelle, saisie)) {
        throw new ConflictException(MESSAGE_VERROUILLE);
      }
      await this.dataSource.manager.update(
        Question,
        { id: questionId },
        { explication: saisie.explication },
      );
    } else {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          Question,
          { id: questionId },
          {
            enonce: saisie.enonce,
            type: saisie.type,
            ponderation: saisie.ponderation,
            explication: saisie.explication,
            niveauDifficulte: saisie.niveauDifficulte,
          },
        );
        await manager.delete(Option, { questionId });
        await this.enregistrerOptions(manager, questionId, saisie.options);
      });
    }

    await this.auditService.record({
      action: 'QUESTION_MODIFIEE',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        questionId,
        avant: { enonce: actuelle.enonce, type: actuelle.type, nbOptions: actuelle.options.length },
        apres: { enonce: saisie.enonce, type: saisie.type, nbOptions: saisie.options.length },
      },
    });

    return this.questionDuQcm(qcmId, questionId);
  }

  /** Retire une question du QCM et renumérote les suivantes (409 si verrouillé). */
  async supprimerQuestion(
    acteurId: string,
    qcmId: string,
    questionId: string,
    contexte: Contexte,
  ): Promise<void> {
    await this.chargerPourEcriture(qcmId);
    await this.exigerNonVerrouille(qcmId);
    const question = await this.questionDuQcm(qcmId, questionId);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(QcmQuestion, { qcmId, questionId });
      await this.supprimerQuestionsOrphelines(manager, [questionId]);
      const restants = await manager.find(QcmQuestion, {
        where: { qcmId },
        order: { ordre: 'ASC' },
      });
      for (const [index, lien] of restants.entries()) {
        if (lien.ordre !== index + 1) {
          await manager.update(QcmQuestion, { id: lien.id }, { ordre: index + 1 });
        }
      }
    });

    await this.auditService.record({
      action: 'QUESTION_SUPPRIMEE',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { questionId, enonce: question.enonce },
    });
  }

  /**
   * Réordonne TOUTES les questions d'un coup. La liste doit être exactement
   * celle des questions du QCM (400 sinon), même règle que les modules.
   */
  async reordonnerQuestions(
    acteurId: string,
    qcmId: string,
    questionIds: string[],
    contexte: Contexte,
  ): Promise<QcmDetailVue> {
    await this.chargerPourEcriture(qcmId);
    await this.exigerNonVerrouille(qcmId);

    const liens = await this.lienRepository.find({ where: { qcmId }, order: { ordre: 'ASC' } });
    const existants = new Set(liens.map((l) => l.questionId));
    const complet =
      questionIds.length === existants.size && questionIds.every((id) => existants.has(id));
    if (!complet) {
      throw new BadRequestException(
        'La liste doit contenir exactement toutes les questions du QCM, une fois chacune.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      for (const [index, questionId] of questionIds.entries()) {
        await manager.update(QcmQuestion, { qcmId, questionId }, { ordre: index + 1 });
      }
    });

    await this.auditService.record({
      action: 'QUESTIONS_REORDONNEES',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { avant: liens.map((l) => l.questionId), apres: questionIds },
    });

    return this.detail(qcmId);
  }

  // ===================================================================
  //  Règles de validation d'une question (exportées pour les tests)
  // ===================================================================

  /**
   * Valide une question et la normalise (textes rognés, pondération par
   * défaut). Une règle = un message ciblé (critère d'erreur de la story) :
   *  - type pris en charge : QCM, QCU, VRAI_FAUX ;
   *  - Vrai/Faux : exactement 2 options, une seule bonne réponse ;
   *  - au moins 2 options, au plus 10 ;
   *  - pas deux options au même texte ;
   *  - au moins une bonne réponse ; QCU : exactement une.
   */
  validerQuestion(dto: QuestionDto): QuestionValidee {
    if (!TYPES_PRIS_EN_CHARGE.has(dto.type)) {
      throw new BadRequestException(
        `Le type de question ${dto.type} n’est pas encore pris en charge (types acceptés : QCM, QCU, VRAI_FAUX).`,
      );
    }
    const enonce = this.texteObligatoire(dto.enonce, 'L’énoncé est obligatoire.');
    const options = dto.options.map((o: OptionDto) => ({
      texte: this.texteObligatoire(o.texte, 'Le texte d’une option ne peut pas être vide.'),
      estCorrecte: o.estCorrecte,
    }));
    const nbCorrectes = options.filter((o) => o.estCorrecte).length;

    if (dto.type === TypeQuestion.VRAI_FAUX && (options.length !== 2 || nbCorrectes !== 1)) {
      throw new BadRequestException(
        'Une question Vrai/Faux doit avoir exactement 2 options, dont une seule bonne réponse.',
      );
    }
    if (options.length < 2) {
      throw new BadRequestException('Une question doit proposer au moins 2 options.');
    }
    if (options.length > MAX_OPTIONS) {
      throw new BadRequestException(
        `Une question ne peut pas proposer plus de ${MAX_OPTIONS} options.`,
      );
    }
    const textes = new Set(options.map((o) => o.texte.toLocaleLowerCase('fr')));
    if (textes.size !== options.length) {
      throw new BadRequestException(
        'Deux options d’une même question ne peuvent pas avoir le même texte.',
      );
    }
    if (nbCorrectes === 0) {
      throw new BadRequestException('Une question doit avoir au moins une bonne réponse.');
    }
    if (dto.type === TypeQuestion.QCU && nbCorrectes !== 1) {
      throw new BadRequestException(
        'Une question à choix unique (QCU) doit avoir exactement une bonne réponse.',
      );
    }

    return {
      enonce,
      type: dto.type,
      ponderation: dto.ponderation ?? 1,
      explication: this.texteFacultatif(dto.explication),
      niveauDifficulte: dto.niveauDifficulte ?? null,
      options,
    };
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /** 404 si le QCM n'existe pas ; 409 (via la formation) si elle est archivée. */
  private async chargerPourEcriture(qcmId: string): Promise<{ qcm: Qcm; formationId: string }> {
    const qcm = await this.qcmRepository.findOne({
      where: { id: qcmId },
      relations: { module: true },
    });
    if (!qcm) {
      throw new NotFoundException('QCM introuvable.');
    }
    await this.formationsService.chargerPourEcriture(qcm.module.formationId);
    return { qcm, formationId: qcm.module.formationId };
  }

  /** Une tentative existe-t-elle (quel que soit son état) ? */
  private async estVerrouille(qcmId: string): Promise<boolean> {
    return (await this.tentativeRepository.countBy({ qcmId })) > 0;
  }

  private async exigerNonVerrouille(qcmId: string): Promise<void> {
    if (await this.estVerrouille(qcmId)) {
      throw new ConflictException(MESSAGE_VERROUILLE);
    }
  }

  /**
   * Questions du QCM, triées, avec options triées et bonnes réponses.
   * `estCorrecte` est `select: false` sur l'entité : je l'ajoute
   * explicitement ici, et nulle part ailleurs.
   */
  private async chargerQuestions(manager: EntityManager, qcmId: string): Promise<QuestionVue[]> {
    const liens = await manager
      .createQueryBuilder(QcmQuestion, 'lien')
      .innerJoinAndSelect('lien.question', 'question')
      .leftJoinAndSelect('question.options', 'option')
      .addSelect('option.estCorrecte')
      .where('lien.qcmId = :qcmId', { qcmId })
      .orderBy('lien.ordre', 'ASC')
      .addOrderBy('option.ordre', 'ASC')
      .getMany();
    return liens.map((lien) => ({
      id: lien.question.id,
      enonce: lien.question.enonce,
      type: lien.question.type,
      ponderation: lien.question.ponderation,
      explication: lien.question.explication,
      niveauDifficulte: lien.question.niveauDifficulte,
      ordre: lien.ordre,
      options: (lien.question.options ?? []).map((o) => ({
        id: o.id,
        texte: o.texte,
        estCorrecte: o.estCorrecte,
        ordre: o.ordre,
      })),
    }));
  }

  /** Une question précise de ce QCM, ou 404 si elle n'y est pas liée. */
  private async questionDuQcm(qcmId: string, questionId: string): Promise<QuestionVue> {
    const question = (await this.chargerQuestions(this.dataSource.manager, qcmId)).find(
      (q) => q.id === questionId,
    );
    if (!question) {
      throw new NotFoundException('Question introuvable dans ce QCM.');
    }
    return question;
  }

  private async enregistrerOptions(
    manager: EntityManager,
    questionId: string,
    options: Array<{ texte: string; estCorrecte: boolean }>,
  ): Promise<void> {
    await manager.save(
      options.map((o, index) =>
        manager.create(Option, {
          questionId,
          texte: o.texte,
          estCorrecte: o.estCorrecte,
          ordre: index + 1,
        }),
      ),
    );
  }

  /** Supprime celles de ces questions qu'aucun QCM n'utilise plus (options en CASCADE). */
  private async supprimerQuestionsOrphelines(
    manager: EntityManager,
    questionIds: string[],
  ): Promise<void> {
    if (questionIds.length === 0) return;
    const encoreUtilisees = await manager.find(QcmQuestion, {
      where: { questionId: In(questionIds) },
      select: { id: true, questionId: true },
    });
    const utilisees = new Set(encoreUtilisees.map((l) => l.questionId));
    const orphelines = questionIds.filter((id) => !utilisees.has(id));
    if (orphelines.length > 0) {
      await manager.delete(Question, { id: In(orphelines) });
    }
  }

  /** Tout est-il identique, sauf l'explication ? (règle du QCM verrouillé) */
  private memeContenuHorsExplication(actuelle: QuestionVue, saisie: QuestionValidee): boolean {
    return (
      actuelle.enonce === saisie.enonce &&
      actuelle.type === saisie.type &&
      Number(actuelle.ponderation) === Number(saisie.ponderation) &&
      (actuelle.niveauDifficulte ?? null) === saisie.niveauDifficulte &&
      actuelle.options.length === saisie.options.length &&
      actuelle.options.every(
        (o, i) =>
          o.texte === saisie.options[i].texte && o.estCorrecte === saisie.options[i].estCorrecte,
      )
    );
  }

  private texteObligatoire(valeur: string | null | undefined, message: string): string {
    const texte = (valeur ?? '').trim();
    if (texte.length === 0) {
      throw new BadRequestException(message);
    }
    return texte;
  }

  private texteFacultatif(valeur: string | null | undefined): string | null {
    const texte = (valeur ?? '').trim();
    return texte.length === 0 ? null : texte;
  }

  private versResume(qcm: Qcm, nbQuestions: number): QcmResumeVue {
    return {
      id: qcm.id,
      moduleId: qcm.moduleId,
      titre: qcm.titre,
      description: qcm.description,
      statut: qcm.statut,
      nbQuestions,
      createdAt: qcm.createdAt,
      updatedAt: qcm.updatedAt,
    };
  }
}

/** Question validée et normalisée, prête à être enregistrée. */
export interface QuestionValidee {
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  explication: string | null;
  niveauDifficulte: string | null;
  options: Array<{ texte: string; estCorrecte: boolean }>;
}
