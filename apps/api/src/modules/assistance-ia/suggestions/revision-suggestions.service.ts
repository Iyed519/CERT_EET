import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { GenerationIa } from '../../../database/entities/generation-ia.entity';
import { SuggestionQuestionIa } from '../../../database/entities/suggestion-question-ia.entity';
import { OrigineQuestion } from '../../../database/enums/origine-question.enum';
import { StatutSuggestion } from '../../../database/enums/statut-suggestion.enum';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { QcmService, QuestionVue } from '../../qcm/qcm.service';
import { AccepterSuggestionDto, RejeterSuggestionDto } from './revision.dto';
import {
  estModifiee,
  MESSAGE_QCM_AUTRE_MODULE,
  MESSAGE_SUGGESTION_DECIDEE,
  nettoyerMotif,
  questionProposee,
} from './revision.regles';
import { SuggestionVue, versSuggestionVue } from './suggestion.vue';

interface Contexte {
  adresseIp: string | null;
}

/** Résultat d'une acceptation : la suggestion décidée et la question créée. */
export interface AcceptationVue {
  suggestion: SuggestionVue;
  question: QuestionVue;
}

/**
 * Révision humaine des suggestions de l'IA (US-IA-04, DS-06 P3, UC11
 * Formateur ; état *SuggestionQuestionIA*). Humain dans la boucle : aucune
 * question proposée n'entre dans un QCM sans cette décision.
 *
 *  - Accepter : vers un QCM **du même module** que la génération, ouvert à
 *    l'écriture (formation non archivée, aucune tentative) ; la question —
 *    proposée, ou retouchée par le formateur — passe les règles de l'éditeur
 *    de QCM (400) ; question créée en fin de QCM avec l'origine IA (telle
 *    quelle) ou IA_MODIFIEE (différente), suggestion ACCEPTEE ou MODIFIEE,
 *    dans UNE transaction, sous le verrou de la suggestion.
 *  - Rejeter : formation non archivée ; suggestion REJETEE, motif facultatif.
 *  - Une décision ne se prend qu'une fois (409) : la suggestion est verrouillée
 *    et doit être PROPOSEE ; la base le garantit aussi (déclencheur).
 * Audit SUGGESTION_ACCEPTEE / SUGGESTION_MODIFIEE / SUGGESTION_REJETEE.
 */
@Injectable()
export class RevisionSuggestionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly qcmService: QcmService,
    private readonly formationsService: FormationsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  async accepter(
    acteurId: string,
    suggestionId: string,
    dto: AccepterSuggestionDto,
    contexte: Contexte,
  ): Promise<AcceptationVue> {
    const { suggestion, generation } = await this.charger(suggestionId);
    const qcm = await this.qcmService.exigerAjoutPossible(dto.qcmId);
    if (qcm.moduleId !== generation.moduleId) {
      throw new BadRequestException(MESSAGE_QCM_AUTRE_MODULE);
    }
    const proposee = this.qcmService.validerQuestion(
      questionProposee(suggestion, generation.niveau),
    );
    const saisie = dto.question ? this.qcmService.validerQuestion(dto.question) : proposee;
    const modifiee = estModifiee(proposee, saisie);

    const questionId = await this.dataSource.transaction(async (manager) => {
      await this.verrouillerProposee(manager, suggestionId);
      const id = await this.qcmService.insererQuestionEnFin(
        manager,
        dto.qcmId,
        saisie,
        modifiee ? OrigineQuestion.IA_MODIFIEE : OrigineQuestion.IA,
      );
      await manager.query(
        `UPDATE suggestions_questions_ia
            SET statut = $2, question_id = $3, qcm_id = $4, decide_par = $5,
                date_decision = now(), updated_at = now()
          WHERE id = $1`,
        [
          suggestionId,
          modifiee ? StatutSuggestion.MODIFIEE : StatutSuggestion.ACCEPTEE,
          id,
          dto.qcmId,
          acteurId,
        ],
      );
      return id;
    });

    await this.auditService.record({
      action: modifiee ? 'SUGGESTION_MODIFIEE' : 'SUGGESTION_ACCEPTEE',
      acteur: acteurId,
      cible: suggestionId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        generationId: generation.id,
        qcmId: dto.qcmId,
        questionId,
        ...(modifiee
          ? {
              avant: {
                enonce: proposee.enonce,
                type: proposee.type,
                nbOptions: proposee.options.length,
              },
              apres: { enonce: saisie.enonce, type: saisie.type, nbOptions: saisie.options.length },
            }
          : {}),
      },
    });

    return {
      suggestion: await this.vue(suggestionId),
      question: await this.qcmService.vueQuestion(dto.qcmId, questionId),
    };
  }

  async rejeter(
    acteurId: string,
    suggestionId: string,
    dto: RejeterSuggestionDto,
    contexte: Contexte,
  ): Promise<SuggestionVue> {
    const { generation, formationId } = await this.charger(suggestionId);
    await this.formationsService.chargerPourEcriture(formationId);
    const motif = nettoyerMotif(dto.motif);

    await this.dataSource.transaction(async (manager) => {
      await this.verrouillerProposee(manager, suggestionId);
      await manager.query(
        `UPDATE suggestions_questions_ia
            SET statut = 'REJETEE', motif_rejet = $2, decide_par = $3,
                date_decision = now(), updated_at = now()
          WHERE id = $1`,
        [suggestionId, motif, acteurId],
      );
    });

    await this.auditService.record({
      action: 'SUGGESTION_REJETEE',
      acteur: acteurId,
      cible: suggestionId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { generationId: generation.id, motif },
    });
    return this.vue(suggestionId);
  }

  /** Suggestion, sa génération et la formation (404 si absente). */
  private async charger(suggestionId: string): Promise<{
    suggestion: SuggestionQuestionIa;
    generation: GenerationIa;
    formationId: string;
  }> {
    const suggestion = await this.dataSource.manager.findOne(SuggestionQuestionIa, {
      where: { id: suggestionId },
      relations: { generation: { module: true } },
    });
    if (!suggestion?.generation?.module) throw new NotFoundException('Suggestion introuvable.');
    if (suggestion.statut !== StatutSuggestion.PROPOSEE) {
      throw new ConflictException(MESSAGE_SUGGESTION_DECIDEE);
    }
    return {
      suggestion,
      generation: suggestion.generation,
      formationId: suggestion.generation.module.formationId,
    };
  }

  /** Verrou de la suggestion ; elle doit être encore PROPOSEE (409 sinon). */
  private async verrouillerProposee(manager: EntityManager, suggestionId: string): Promise<void> {
    const ligne = await manager.findOne(SuggestionQuestionIa, {
      where: { id: suggestionId },
      lock: { mode: 'pessimistic_write' },
      select: { id: true, statut: true },
    });
    if (!ligne) throw new NotFoundException('Suggestion introuvable.');
    if (ligne.statut !== StatutSuggestion.PROPOSEE) {
      throw new ConflictException(MESSAGE_SUGGESTION_DECIDEE);
    }
  }

  private async vue(suggestionId: string): Promise<SuggestionVue> {
    const s = await this.dataSource.manager.findOneOrFail(SuggestionQuestionIa, {
      where: { id: suggestionId },
    });
    return versSuggestionVue(s);
  }
}
