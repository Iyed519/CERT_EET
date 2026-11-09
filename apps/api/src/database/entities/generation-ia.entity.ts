import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutGeneration } from '../enums/statut-generation.enum';
import { ModuleFormation } from './module-formation.entity';
import { SupportPedagogique } from './support-pedagogique.entity';
import { User } from './user.entity';

/**
 * Génération de questions par IA (US-IA-02, DS-06 partie 2, table
 * `generations_ia`).
 *
 *  - une génération part d'UN support INDEXE du module (FK RESTRICT : un
 *    support qui a servi ne peut plus être supprimé) ;
 *  - paramètres figés au lancement : nombre (1–20), types, niveau, thème ;
 *  - UNE génération EN_COURS au plus par formateur (index unique partiel) :
 *    coût borné, pas de rafale ;
 *  - le modèle utilisé, le nombre de suggestions valides et rejetées par la
 *    validation, les tentatives et le dernier motif d'échec sont remplis par
 *    le pipeline (US-IA-03).
 */
@Entity('generations_ia')
export class GenerationIa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => ModuleFormation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'module_id', foreignKeyConstraintName: 'FK_generations_module' })
  module?: ModuleFormation;

  @Column({ name: 'support_id', type: 'uuid' })
  supportId: string;

  @ManyToOne(() => SupportPedagogique, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'support_id', foreignKeyConstraintName: 'FK_generations_support' })
  support?: SupportPedagogique;

  @Column({ name: 'formateur_id', type: 'uuid' })
  formateurId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'formateur_id', foreignKeyConstraintName: 'FK_generations_formateur' })
  formateur?: User;

  @Column({ name: 'nb_questions_demandees', type: 'int' })
  nbQuestionsDemandees: number;

  @Column({ name: 'types_questions', type: 'varchar', array: true })
  typesQuestions: string[];

  @Column({ type: 'varchar', length: 20 })
  niveau: string;

  @Column({ name: 'focus_thematique', type: 'varchar', length: 200, nullable: true })
  focusThematique: string | null;

  @Column({ type: 'enum', enum: StatutGeneration, default: StatutGeneration.EN_COURS })
  statut: StatutGeneration;

  @Column({ name: 'modele_llm', type: 'varchar', length: 100, nullable: true })
  modeleLlm: string | null;

  @Column({ name: 'nb_suggestions', type: 'int', nullable: true })
  nbSuggestions: number | null;

  @Column({ name: 'nb_invalides', type: 'int', nullable: true })
  nbInvalides: number | null;

  @Column({ name: 'nb_tentatives', type: 'int', default: 0 })
  nbTentatives: number;

  @Column({ name: 'derniere_erreur', type: 'varchar', length: 500, nullable: true })
  derniereErreur: string | null;

  @Column({ name: 'date_lancement', type: 'timestamptz' })
  dateLancement: Date;

  @Column({ name: 'date_fin', type: 'timestamptz', nullable: true })
  dateFin: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
