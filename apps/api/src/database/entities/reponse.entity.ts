import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../transformers/numeric.transformer';
import { Question } from './question.entity';
import { ReponseOption } from './reponse-option.entity';
import { TentativeQcm } from './tentative-qcm.entity';

/**
 * Réponse d'un apprenant à UNE question d'une tentative (DS-02 étapes 3-4).
 *
 *  - Unicité (tentative, question) : l'auto-sauvegarde (US-QCM-07) met à jour
 *    la ligne existante, elle n'empile jamais de doublons.
 *  - `estCorrecte` et `pointsObtenus` restent nuls pendant le passage : ils
 *    sont écrits UNE fois par le scoring serveur (US-QCM-08), à partir des
 *    `estCorrecte` des options lus en base.
 *  - `updated_at` : horodatage de la dernière sauvegarde.
 *
 * Les options cochées sont dans `reponse_options` (0, 1 ou plusieurs selon le
 * type de question).
 */
@Index('UQ_reponses_tentative_question', ['tentativeId', 'questionId'], {
  unique: true,
})
@Entity('reponses')
export class Reponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tentative_id', type: 'uuid' })
  tentativeId: string;

  @ManyToOne(() => TentativeQcm, (tentative) => tentative.reponses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'tentative_id',
    foreignKeyConstraintName: 'FK_reponses_tentative',
  })
  tentative: TentativeQcm;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @ManyToOne(() => Question, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'question_id',
    foreignKeyConstraintName: 'FK_reponses_question',
  })
  question: Question;

  @Column({ name: 'est_correcte', type: 'boolean', nullable: true })
  estCorrecte: boolean | null;

  @Column({
    name: 'points_obtenus',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  pointsObtenus: number | null;

  @OneToMany(() => ReponseOption, (reponseOption) => reponseOption.reponse)
  optionsSelectionnees: ReponseOption[];

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
