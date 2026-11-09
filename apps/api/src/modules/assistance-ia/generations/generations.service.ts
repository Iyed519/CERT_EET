import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError } from 'typeorm';
import { IaConfig } from '../../../config/configuration';
import { GenerationIa } from '../../../database/entities/generation-ia.entity';
import { ModuleFormation } from '../../../database/entities/module-formation.entity';
import { SuggestionQuestionIa } from '../../../database/entities/suggestion-question-ia.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';
import { StatutGeneration } from '../../../database/enums/statut-generation.enum';
import { StatutSupport } from '../../../database/enums/statut-support.enum';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { FileIaService } from '../file-ia.service';
import {
  MESSAGE_GENERATION_EN_COURS,
  nettoyerFocus,
  normaliserTypes,
  verifierQuotaGenerations,
  verifierSupportGenerable,
} from './generation.regles';
import { SuggestionVue, versSuggestionVue } from '../suggestions/suggestion.vue';
import { LancerGenerationDto } from './generations.dto';

export interface ContexteGeneration {
  adresseIp: string | null;
}

/** Une génération, vue par le formateur (liste blanche). */
export interface GenerationVue {
  id: string;
  moduleId: string;
  support: { id: string; titre: string };
  formateur: { id: string; prenom: string | null; nom: string | null };
  nbQuestionsDemandees: number;
  types: string[];
  niveau: string;
  focusThematique: string | null;
  statut: StatutGeneration;
  modeleLlm: string | null;
  nbSuggestions: number | null;
  nbInvalides: number | null;
  nbTentatives: number;
  derniereErreur: string | null;
  dateLancement: Date;
  dateFin: Date | null;
}

export const MESSAGE_GENERATION_INTROUVABLE = 'Génération introuvable.';
export const MESSAGE_FILE_GENERATION =
  'La mise en file de la génération a échoué : relancez une génération.';
/** Fenêtre du plafond horaire (secondes). */
const FENETRE_QUOTA = 3600;
const VIOLATION_UNICITE = '23505';

/**
 * Lancement d'une génération de questions par IA (US-IA-02, DS-06 partie 2,
 * UC10 Formateur). Réponse 202 : le pipeline RAG (US-IA-03) tourne ensuite
 * dans le worker de la file `ia-generation`.
 *
 * Ordre :
 *   1. module existant (404), formation non archivée (409) ;
 *   2. paramètres validés par le DTO (400) ;
 *   3. dans une transaction, support verrouillé en PARTAGE (FOR SHARE : il ne
 *      peut ni être supprimé ni changer de statut pendant le lancement) :
 *      support du module (404) et INDEXE (409 ; s'il n'y en a aucun dans le
 *      module, le message invite à en indexer un) ; génération déjà en cours
 *      pour ce formateur -> 409 (contrôle, puis index unique partiel en base
 *      pour deux lancements simultanés) ;
 *   4. plafond horaire par formateur (Redis ; 429 ; Redis injoignable =
 *      pas de plafond, comme la vérification publique) ;
 *   5. INSERT EN_COURS (heure de PostgreSQL), audit GENERATION_IA_LANCEE,
 *      travail en file (file injoignable -> ECHEC avec motif).
 */
@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);
  private readonly config: IaConfig;

  constructor(
    private readonly dataSource: DataSource,
    private readonly formationsService: FormationsService,
    private readonly file: FileIaService,
    private readonly redisService: RedisService,
    configService: ConfigService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {
    this.config = configService.getOrThrow<IaConfig>('ia');
  }

  async lancer(
    acteurId: string,
    moduleId: string,
    dto: LancerGenerationDto,
    contexte: ContexteGeneration,
  ): Promise<GenerationVue> {
    const module = await this.chargerModule(moduleId);
    await this.formationsService.chargerPourEcriture(module.formationId);
    const types = normaliserTypes(dto.types);
    const focus = nettoyerFocus(dto.focusThematique);

    let generationId: string;
    try {
      generationId = await this.dataSource.transaction(async (manager) => {
        const support = await manager.findOne(SupportPedagogique, {
          where: { id: dto.supportId },
          lock: { mode: 'pessimistic_read' },
        });
        const nbIndexes =
          support?.statut === StatutSupport.INDEXE
            ? 1
            : await manager.countBy(SupportPedagogique, { moduleId, statut: StatutSupport.INDEXE });
        verifierSupportGenerable(support, moduleId, nbIndexes);
        if (
          await manager.existsBy(GenerationIa, {
            formateurId: acteurId,
            statut: StatutGeneration.EN_COURS,
          })
        ) {
          throw new ConflictException(MESSAGE_GENERATION_EN_COURS);
        }
        await this.verifierQuota(acteurId);
        const [{ id }] = (await manager.query(
          `INSERT INTO generations_ia
             (module_id, support_id, formateur_id, nb_questions_demandees, types_questions,
              niveau, focus_thematique, statut, date_lancement)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'EN_COURS', now())
           RETURNING id`,
          [moduleId, dto.supportId, acteurId, dto.nbQuestions, types, dto.niveau, focus],
        )) as Array<{ id: string }>;
        return id;
      });
    } catch (erreur) {
      if (
        erreur instanceof QueryFailedError &&
        (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
      ) {
        throw new ConflictException(MESSAGE_GENERATION_EN_COURS);
      }
      throw erreur;
    }

    await this.auditService.record({
      action: 'GENERATION_IA_LANCEE',
      acteur: acteurId,
      cible: generationId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId: module.formationId,
        moduleId,
        supportId: dto.supportId,
        nbQuestions: dto.nbQuestions,
        types,
        niveau: dto.niveau,
        focusThematique: focus,
      },
    });
    try {
      await this.file.ajouterGeneration(generationId);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Mise en file de la génération impossible (${generationId}) : ${detail}`);
      await this.dataSource.query(
        `UPDATE generations_ia
            SET statut = 'ECHEC', derniere_erreur = $2, date_fin = now(), updated_at = now()
          WHERE id = $1 AND statut = 'EN_COURS'`,
        [generationId, MESSAGE_FILE_GENERATION],
      );
    }
    return this.vue(generationId);
  }

  /** Générations d'un module, plus récentes d'abord (50 au plus). */
  async listerDuModule(moduleId: string): Promise<GenerationVue[]> {
    await this.chargerModule(moduleId);
    const generations = await this.dataSource.manager.find(GenerationIa, {
      where: { moduleId },
      relations: { support: true, formateur: true },
      order: { dateLancement: 'DESC', id: 'ASC' },
      take: 50,
    });
    return generations.map(versVue);
  }

  /** Une génération (suivi de l'état, US-IA-02 ; suggestions : US-IA-04). */
  async vue(generationId: string): Promise<GenerationVue> {
    const generation = await this.dataSource.manager.findOne(GenerationIa, {
      where: { id: generationId },
      relations: { support: true, formateur: true },
    });
    if (!generation) throw new NotFoundException(MESSAGE_GENERATION_INTROUVABLE);
    return versVue(generation);
  }

  /**
   * Suggestions d'une génération (US-IA-03), dans l'ordre proposé par le
   * modèle : énoncé, type, options, explication, score de confiance, passages
   * sources, statut (relecture : US-IA-04). 404 si la génération n'existe pas.
   */
  async suggestions(generationId: string): Promise<SuggestionVue[]> {
    const existe = await this.dataSource.manager.exists(GenerationIa, {
      where: { id: generationId },
    });
    if (!existe) throw new NotFoundException(MESSAGE_GENERATION_INTROUVABLE);
    const lignes = await this.dataSource.manager.find(SuggestionQuestionIa, {
      where: { generationId },
      order: { ordre: 'ASC' },
    });
    return lignes.map(versSuggestionVue);
  }

  private async chargerModule(moduleId: string): Promise<ModuleFormation> {
    const module = await this.dataSource.manager.findOne(ModuleFormation, {
      where: { id: moduleId },
      select: { id: true, formationId: true },
    });
    if (!module) throw new NotFoundException('Module introuvable.');
    return module;
  }

  /** Plafond horaire ; Redis injoignable : journalisé, pas de blocage. */
  private async verifierQuota(formateurId: string): Promise<void> {
    let compteur: { compte: number; resteSecondes: number };
    try {
      compteur = await this.redisService.incrementer(
        `limite:ia-generation:${formateurId}`,
        FENETRE_QUOTA,
      );
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Plafond des générations non vérifié (Redis) : ${detail}`);
      return;
    }
    verifierQuotaGenerations(
      compteur.compte,
      this.config.generationsParHeure,
      compteur.resteSecondes,
    );
  }
}

function versVue(g: GenerationIa): GenerationVue {
  return {
    id: g.id,
    moduleId: g.moduleId,
    support: { id: g.supportId, titre: g.support?.titre ?? '' },
    formateur: {
      id: g.formateurId,
      prenom: g.formateur?.prenom ?? null,
      nom: g.formateur?.nom ?? null,
    },
    nbQuestionsDemandees: g.nbQuestionsDemandees,
    types: g.typesQuestions,
    niveau: g.niveau,
    focusThematique: g.focusThematique,
    statut: g.statut,
    modeleLlm: g.modeleLlm,
    nbSuggestions: g.nbSuggestions,
    nbInvalides: g.nbInvalides,
    nbTentatives: g.nbTentatives,
    derniereErreur: g.derniereErreur,
    dateLancement: g.dateLancement,
    dateFin: g.dateFin,
  };
}
