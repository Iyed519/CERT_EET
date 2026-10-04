import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Option } from './option.entity';
import { Reponse } from './reponse.entity';

/**
 * Option cochée dans une réponse (association Reponse -> Option du diagramme,
 * table `reponse_options`).
 *
 * Clé primaire composite (reponse, option) : une option ne peut pas être
 * cochée deux fois dans la même réponse. Table explicite plutôt qu'un
 * @ManyToMany implicite, pour choisir le comportement de chaque clé étrangère :
 *
 *  - côté réponse : CASCADE (la sélection suit la réponse) ;
 *  - côté option : RESTRICT — une option déjà choisie par un apprenant ne peut
 *    plus être supprimée. C'est la garantie en base de la règle de DS-12 :
 *    après la première tentative, le contenu d'un QCM est figé.
 */
@Index('IDX_reponse_options_option', ['optionId'])
@Entity('reponse_options')
export class ReponseOption {
  @PrimaryColumn({ name: 'reponse_id', type: 'uuid' })
  reponseId: string;

  @ManyToOne(() => Reponse, (reponse) => reponse.optionsSelectionnees, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'reponse_id',
    foreignKeyConstraintName: 'FK_reponse_options_reponse',
  })
  reponse: Reponse;

  @PrimaryColumn({ name: 'option_id', type: 'uuid' })
  optionId: string;

  @ManyToOne(() => Option, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'option_id',
    foreignKeyConstraintName: 'FK_reponse_options_option',
  })
  option: Option;
}
