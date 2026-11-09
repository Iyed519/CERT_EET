import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrigineQuestion } from '../enums/origine-question.enum';
import { TypeQuestion } from '../enums/type-question.enum';
import { numericTransformer } from '../transformers/numeric.transformer';
import { Option } from './option.entity';

/**
 * Question d'évaluation (US-QCM-01, DS-12 P2).
 *
 * Une question n'appartient PAS à un QCM : elle y est rattachée par la table
 * de liaison `qcm_questions` (agrégation du diagramme de classes). Elle peut
 * donc être réutilisée par plusieurs QCM, et supprimer un QCM ne la détruit
 * pas — c'est ce qui rendra l'import depuis la banque (US-QCM-02) possible
 * sans reprise du schéma.
 *
 * `ponderation` est le poids de la question dans le score :
 * score = Σ(pondération × correcte) / Σ(pondération) × 100 (US-QCM-08).
 * Le CHECK > 0 garantit que le dénominateur n'est jamais nul.
 */
@Check('CHK_questions_ponderation', '"ponderation" > 0')
@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  enonce: string;

  @Column({ type: 'enum', enum: TypeQuestion })
  type: TypeQuestion;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 1,
    transformer: numericTransformer,
  })
  ponderation: number;

  // Feedback pédagogique affiché APRÈS la tentative, selon le mode configuré
  // (US-QCM-09). Jamais envoyé pendant le passage : il trahirait la réponse.
  @Column({ type: 'text', nullable: true })
  explication: string | null;

  @Column({
    name: 'niveau_difficulte',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  niveauDifficulte: string | null;

  // Saisie manuelle ou issue d'une suggestion IA (US-IA-04).
  @Column({ type: 'enum', enum: OrigineQuestion, default: OrigineQuestion.MANUELLE })
  origine: OrigineQuestion;

  // Composition : au moins deux options (règle validée par le service).
  @OneToMany(() => Option, (option) => option.question)
  options: Option[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
