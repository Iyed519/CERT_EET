import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExtractionQuestionsIa } from './extraction-questions-ia.entity';

/** Décision du formateur sur une question extraite (US-IA-08). */
export type StatutQuestionExtraite = 'PROPOSEE' | 'ACCEPTEE' | 'MODIFIEE' | 'REJETEE';

/**
 * Question recopiée d'un document par l'IA (US-IA-08, table
 * `questions_extraites_ia`), partie de son extraction (CASCADE). Validée côté
 * serveur avant l'enregistrement ; `reponseConnue` faux : le document ne
 * donnait pas la bonne réponse, le formateur doit la cocher avant d'accepter.
 * Décision unique et définitive (CHECK + déclencheur en base).
 */
@Entity('questions_extraites_ia')
export class QuestionExtraiteIa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'extraction_id', type: 'uuid' })
  extractionId: string;

  @ManyToOne(() => ExtractionQuestionsIa, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'extraction_id',
    foreignKeyConstraintName: 'FK_questions_extraites_extraction',
  })
  extraction?: ExtractionQuestionsIa;

  @Column({ type: 'int' })
  ordre: number;

  @Column({ type: 'text' })
  enonce: string;

  @Column({ type: 'varchar', length: 10 })
  type: string;

  @Column({ type: 'jsonb' })
  options: Array<{ texte: string; estCorrecte: boolean }>;

  @Column({ name: 'reponse_connue', type: 'boolean' })
  reponseConnue: boolean;

  @Column({ type: 'text', nullable: true })
  explication: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  niveau: string | null;

  @Column({ type: 'varchar', length: 10, default: 'PROPOSEE' })
  statut: StatutQuestionExtraite;

  @Column({ name: 'question_id', type: 'uuid', nullable: true })
  questionId: string | null;

  @Column({ name: 'decide_par', type: 'uuid', nullable: true })
  decidePar: string | null;

  @Column({ name: 'date_decision', type: 'timestamptz', nullable: true })
  dateDecision: Date | null;

  @Column({ name: 'motif_rejet', type: 'varchar', length: 500, nullable: true })
  motifRejet: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
