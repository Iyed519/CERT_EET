import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutSuggestion } from '../enums/statut-suggestion.enum';
import { GenerationIa } from './generation-ia.entity';

const nombre = {
  to: (v: number | null): number | null => v,
  from: (v: string | null): number | null => (v === null ? null : Number(v)),
};

/**
 * Suggestion de question produite par le pipeline RAG (US-IA-03, DS-06,
 * table `suggestions_questions_ia`). Partie de sa génération (CASCADE).
 * Validée côté serveur AVANT l'enregistrement (CHECK en base aussi) ; elle
 * naît PROPOSEE et n'entre dans aucun QCM sans décision du formateur
 * (US-IA-04).
 */
@Entity('suggestions_questions_ia')
export class SuggestionQuestionIa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'generation_id', type: 'uuid' })
  generationId: string;

  @ManyToOne(() => GenerationIa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id', foreignKeyConstraintName: 'FK_suggestions_generation' })
  generation?: GenerationIa;

  @Column({ type: 'int' })
  ordre: number;

  @Column({ type: 'text' })
  enonce: string;

  @Column({ type: 'varchar', length: 10 })
  type: string;

  @Column({ type: 'jsonb' })
  options: Array<{ texte: string; estCorrecte: boolean }>;

  @Column({ type: 'text', nullable: true })
  explication: string | null;

  @Column({
    name: 'score_confiance',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: nombre,
  })
  scoreConfiance: number | null;

  @Column({ name: 'passages_sources', type: 'int', array: true, default: () => "'{}'" })
  passagesSources: number[];

  @Column({ type: 'enum', enum: StatutSuggestion, default: StatutSuggestion.PROPOSEE })
  statut: StatutSuggestion;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
