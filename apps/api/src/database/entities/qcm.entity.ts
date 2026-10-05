import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutQcm } from '../enums/statut-qcm.enum';
import { ConfigurationAntiFraude } from './configuration-anti-fraude.entity';
import { ModuleFormation } from './module-formation.entity';
import { QcmQuestion } from './qcm-question.entity';

/**
 * QCM — questionnaire rattaché à un module (DS-12, table `qcm`).
 *
 * La formation n'est pas stockée ici : elle se déduit du module
 * (qcm -> module -> formation). C'est ce chemin que suivra l'autorisation par
 * ressource (US-AUTH-16) pour vérifier que le formateur est bien affecté à la
 * formation du QCM.
 *
 *  - `module_id` en RESTRICT : association (et non composition), on ne
 *    supprime pas un module qui porte une évaluation.
 *  - `formateur_id` : compte qui a créé le QCM (DS-12). Simple colonne uuid,
 *    FK SET NULL posée par la migration : le QCM survit au compte.
 *  - La configuration anti-fraude vit dans une table à part (1-1) : son
 *    absence signifie « QCM pas encore configuré », ce qui bloque la
 *    publication (US-QCM-04).
 */
@Index('IDX_qcm_module', ['moduleId'])
@Entity('qcm')
export class Qcm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => ModuleFormation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'module_id', foreignKeyConstraintName: 'FK_qcm_module' })
  module: ModuleFormation;

  @Column({ name: 'formateur_id', type: 'uuid', nullable: true })
  formateurId: string | null;

  @Column({ type: 'varchar', length: 255 })
  titre: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: StatutQcm, default: StatutQcm.BROUILLON })
  statut: StatutQcm;

  // Composition 1-1 : la configuration n'existe pas sans son QCM.
  @OneToOne(() => ConfigurationAntiFraude, (configuration) => configuration.qcm)
  configuration: ConfigurationAntiFraude | null;

  // Agrégation N-N vers les questions, portée par la table de liaison.
  @OneToMany(() => QcmQuestion, (qcmQuestion) => qcmQuestion.qcm)
  qcmQuestions: QcmQuestion[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
