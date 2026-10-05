import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Question } from './question.entity';

/**
 * Option de réponse d'une question (composition Question *-- Option).
 *
 * SÉCURITÉ (F1, US-QCM-06) — `estCorrecte` est la donnée la plus sensible du
 * modèle : si elle atteint le navigateur, l'évaluation ne vaut plus rien.
 * Je la déclare en `select: false` : AUCUNE requête TypeORM ne la charge par
 * défaut (find, relations, QueryBuilder). Le code qui en a légitimement besoin
 * — l'éditeur du formateur et le scoring serveur — doit la demander
 * explicitement (`addSelect('option.estCorrecte')`). Une fuite ne peut donc
 * plus venir d'un oubli, seulement d'un choix écrit et relu.
 *
 * C'est la première barrière ; les DTO de réponse et le test de non-fuite
 * d'US-QCM-06 forment les deux suivantes.
 */
@Index('IDX_options_question_ordre', ['questionId', 'ordre'])
@Entity('options')
export class Option {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @ManyToOne(() => Question, (question) => question.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'question_id',
    foreignKeyConstraintName: 'FK_options_question',
  })
  question: Question;

  @Column({ type: 'text' })
  texte: string;

  @Column({ name: 'est_correcte', type: 'boolean', select: false })
  estCorrecte: boolean;

  // Ordre de rédaction (affichage stable côté formateur ; l'ordre présenté à
  // l'apprenant est celui du tirage de sa tentative).
  @Column({ type: 'int' })
  ordre: number;
}
