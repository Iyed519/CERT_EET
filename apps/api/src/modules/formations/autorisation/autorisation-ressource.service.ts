import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlerteDecrochage } from '../../../database/entities/alerte-decrochage.entity';
import { Atelier } from '../../../database/entities/atelier.entity';
import { AffectationFormateur } from '../../../database/entities/affectation-formateur.entity';
import { Formation } from '../../../database/entities/formation.entity';
import { GenerationIa } from '../../../database/entities/generation-ia.entity';
import { Livrable } from '../../../database/entities/livrable.entity';
import { ModuleFormation } from '../../../database/entities/module-formation.entity';
import { Qcm } from '../../../database/entities/qcm.entity';
import { RessourceModule } from '../../../database/entities/ressource-module.entity';
import { SuggestionQuestionIa } from '../../../database/entities/suggestion-question-ia.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';

/** Type de ressource à partir de laquelle on remonte à la formation. */
export type TypeRessource =
  | 'formation'
  | 'module'
  | 'qcm'
  | 'atelier'
  | 'livrable'
  | 'support'
  | 'generation'
  | 'ressource'
  | 'suggestion'
  | 'alerte'
  | 'extraction'
  | 'questionExtraite';

/**
 * Lectures dont a besoin l'autorisation par ressource (US-AUTH-16) : retrouver
 * la formation d'une ressource, puis savoir si un formateur y est affecté.
 *
 * Deux requêtes courtes par appel, toutes deux servies par un index :
 * la clé primaire de la ressource, puis l'index unique
 * (formation, formateur) de `formation_formateurs`.
 */
@Injectable()
export class AutorisationRessourceService {
  constructor(
    @InjectRepository(Formation)
    private readonly formationRepository: Repository<Formation>,
    @InjectRepository(ModuleFormation)
    private readonly moduleRepository: Repository<ModuleFormation>,
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    @InjectRepository(Atelier)
    private readonly atelierRepository: Repository<Atelier>,
    @InjectRepository(Livrable)
    private readonly livrableRepository: Repository<Livrable>,
    @InjectRepository(SupportPedagogique)
    private readonly supportRepository: Repository<SupportPedagogique>,
    @InjectRepository(GenerationIa)
    private readonly generationRepository: Repository<GenerationIa>,
    @InjectRepository(RessourceModule)
    private readonly ressourceRepository: Repository<RessourceModule>,
    @InjectRepository(SuggestionQuestionIa)
    private readonly suggestionRepository: Repository<SuggestionQuestionIa>,
    @InjectRepository(AlerteDecrochage)
    private readonly alerteRepository: Repository<AlerteDecrochage>,
    @InjectRepository(AffectationFormateur)
    private readonly affectationRepository: Repository<AffectationFormateur>,
  ) {}

  /**
   * Identifiant de la formation à laquelle appartient la ressource, ou null
   * si la ressource n'existe pas. Un QCM ou un atelier remonte par son module :
   * la formation n'est stockée ni sur l'un ni sur l'autre (voir les entités) ;
   * un livrable remonte par son atelier (US-ATEL-06) ; un support pédagogique
   * par son module (US-IA-01) ; une génération IA aussi (US-IA-02), et une ressource de module
   * (US-FORM-05) ; une suggestion de question par sa génération (US-IA-04) ;
   * une alerte de décrochage porte sa formation (US-SUIVI-03) ; une
   * extraction de questions par son QCM, une question extraite par son
   * extraction (US-IA-08, requête directe : aucune entité à injecter de plus).
   */
  async formationDe(type: TypeRessource, id: string): Promise<string | null> {
    if (type === 'formation') {
      return (await this.formationRepository.countBy({ id })) > 0 ? id : null;
    }
    if (type === 'module') {
      const module = await this.moduleRepository.findOne({
        where: { id },
        select: { id: true, formationId: true },
      });
      return module?.formationId ?? null;
    }
    if (type === 'atelier') {
      const atelier = await this.atelierRepository.findOne({
        where: { id },
        relations: { module: true },
        select: { id: true, module: { id: true, formationId: true } },
      });
      return atelier?.module?.formationId ?? null;
    }
    if (type === 'livrable') {
      const livrable = await this.livrableRepository.findOne({
        where: { id },
        relations: { atelier: { module: true } },
        select: { id: true, atelier: { id: true, module: { id: true, formationId: true } } },
      });
      return livrable?.atelier?.module?.formationId ?? null;
    }
    if (type === 'support') {
      const support = await this.supportRepository.findOne({
        where: { id },
        relations: { module: true },
        select: { id: true, module: { id: true, formationId: true } },
      });
      return support?.module?.formationId ?? null;
    }
    if (type === 'generation') {
      const generation = await this.generationRepository.findOne({
        where: { id },
        relations: { module: true },
        select: { id: true, module: { id: true, formationId: true } },
      });
      return generation?.module?.formationId ?? null;
    }
    if (type === 'ressource') {
      const ressource = await this.ressourceRepository.findOne({
        where: { id },
        relations: { module: true },
        select: { id: true, module: { id: true, formationId: true } },
      });
      return ressource?.module?.formationId ?? null;
    }
    if (type === 'alerte') {
      const alerte = await this.alerteRepository.findOne({
        where: { id },
        select: { id: true, formationId: true },
      });
      return alerte?.formationId ?? null;
    }
    if (type === 'suggestion') {
      const suggestion = await this.suggestionRepository.findOne({
        where: { id },
        relations: { generation: { module: true } },
        select: {
          id: true,
          generation: { id: true, module: { id: true, formationId: true } },
        },
      });
      return suggestion?.generation?.module?.formationId ?? null;
    }
    if (type === 'extraction' || type === 'questionExtraite') {
      const lignes = (await this.qcmRepository.manager.query(
        type === 'extraction'
          ? `SELECT m.formation_id FROM extractions_questions_ia e
               JOIN qcm q ON q.id = e.qcm_id JOIN modules m ON m.id = q.module_id
              WHERE e.id = $1`
          : `SELECT m.formation_id FROM questions_extraites_ia x
               JOIN extractions_questions_ia e ON e.id = x.extraction_id
               JOIN qcm q ON q.id = e.qcm_id JOIN modules m ON m.id = q.module_id
              WHERE x.id = $1`,
        [id],
      )) as Array<{ formation_id: string }>;
      return lignes[0]?.formation_id ?? null;
    }
    const qcm = await this.qcmRepository.findOne({
      where: { id },
      relations: { module: true },
      select: { id: true, module: { id: true, formationId: true } },
    });
    return qcm?.module?.formationId ?? null;
  }

  /** Le formateur a-t-il une ligne d'affectation sur cette formation ? */
  async estAffecte(formationId: string, formateurId: string): Promise<boolean> {
    return (await this.affectationRepository.countBy({ formationId, formateurId })) > 0;
  }
}
