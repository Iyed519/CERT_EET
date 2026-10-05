import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Qcm } from './qcm.entity';
import { Question } from './question.entity';

/**
 * Lien QCM <-> Question (agrégation N-N, table `qcm_questions` de DS-12).
 *
 * Table de liaison explicite, comme `etablissement_domaine`, parce qu'elle
 * porte une donnée propre au lien : `ordre`, la position de la question dans
 * CE QCM (ordre de rédaction, utilisé quand la randomisation est désactivée).
 *
 *  - Côté QCM : CASCADE — supprimer un QCM retire ses liens, pas les questions.
 *  - Côté question : RESTRICT — on ne supprime pas une question encore
 *    utilisée par un QCM.
 */
@Index('UQ_qcm_questions_qcm_question', ['qcmId', 'questionId'], {
  unique: true,
})
@Index('IDX_qcm_questions_question', ['questionId'])
@Entity('qcm_questions')
export class QcmQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'qcm_id', type: 'uuid' })
  qcmId: string;

  @ManyToOne(() => Qcm, (qcm) => qcm.qcmQuestions, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'qcm_id',
    foreignKeyConstraintName: 'FK_qcm_questions_qcm',
  })
  qcm: Qcm;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @ManyToOne(() => Question, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'question_id',
    foreignKeyConstraintName: 'FK_qcm_questions_question',
  })
  question: Question;

  @Column({ type: 'int' })
  ordre: number;
}
