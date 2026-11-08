import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StatutTentative } from '../enums/statut-tentative.enum';
import { numericTransformer } from '../transformers/numeric.transformer';
import { Qcm } from './qcm.entity';
import { Reponse } from './reponse.entity';
import { User } from './user.entity';

/**
 * Une question tirée pour une tentative, avec l'ordre de ses options tel
 * qu'il est présenté à l'apprenant. Ne contient QUE des identifiants.
 */
export interface QuestionTiree {
  questionId: string;
  optionIds: string[];
}

/**
 * Tentative de QCM — un passage d'un apprenant (DS-02, ET-02 ; table
 * `tentatives_qcm`).
 *
 * Trois garanties anti-fraude sont portées par le schéma lui-même :
 *
 *  1. UNE SEULE tentative EN_COURS par (apprenant, QCM) : index unique
 *     partiel. Deux démarrages simultanés (double clic, deux onglets) ne
 *     peuvent pas créer deux tentatives — la base refuse la seconde.
 *  2. `date_limite` : échéance absolue calculée par le SERVEUR au démarrage
 *     (dateDebut + durée). Redis porte le timer (US-QCM-07) ; cette colonne
 *     est le filet de sécurité si la clé Redis disparaît (redémarrage).
 *  3. `plan_tirage` : questions tirées et ordre des options, figés par
 *     tentative (US-QCM-06). Un rechargement de page ne re-mélange pas, et le
 *     scoring sait exactement sur quelles questions noter.
 *
 * RESTRICT des deux côtés : une tentative est une trace certifiante, ni la
 * suppression d'un compte ni celle d'un QCM ne doit l'effacer.
 */
@Index('UQ_tentatives_qcm_en_cours', ['apprenantId', 'qcmId'], {
  unique: true,
  where: `"statut" = 'EN_COURS'`,
})
@Index('IDX_tentatives_qcm_apprenant_qcm', ['apprenantId', 'qcmId'])
@Index('IDX_tentatives_qcm_qcm', ['qcmId'])
@Check('CHK_tentatives_qcm_score', '"score" IS NULL OR ("score" >= 0 AND "score" <= 100)')
@Entity('tentatives_qcm')
export class TentativeQcm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'apprenant_id', type: 'uuid' })
  apprenantId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'apprenant_id',
    foreignKeyConstraintName: 'FK_tentatives_qcm_apprenant',
  })
  apprenant: User;

  @Column({ name: 'qcm_id', type: 'uuid' })
  qcmId: string;

  @ManyToOne(() => Qcm, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'qcm_id',
    foreignKeyConstraintName: 'FK_tentatives_qcm_qcm',
  })
  qcm: Qcm;

  // Horloge du serveur de base de données, jamais celle du navigateur.
  @CreateDateColumn({ name: 'date_debut', type: 'timestamptz' })
  dateDebut: Date;

  @Column({ name: 'date_limite', type: 'timestamptz' })
  dateLimite: Date;

  @Column({ name: 'date_fin', type: 'timestamptz', nullable: true })
  dateFin: Date | null;

  // Durée réelle du passage, en secondes (dateFin - dateDebut).
  @Column({ name: 'duree_effective', type: 'int', nullable: true })
  dureeEffective: number | null;

  // Score en pourcentage (0 à 100) ; null tant que la tentative n'est pas notée.
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  score: number | null;

  // Figé au scoring (score >= scoreMinValidation à cet instant, DS-02).
  @Column({ name: 'est_reussie', type: 'boolean', nullable: true })
  estReussie: boolean | null;

  @Column({
    type: 'enum',
    enum: StatutTentative,
    default: StatutTentative.EN_COURS,
  })
  statut: StatutTentative;

  @Column({ name: 'plan_tirage', type: 'jsonb', nullable: true })
  planTirage: QuestionTiree[] | null;

  // US-QCM-10 — session (claim `sid`) qui détient la tentative ; null pour
  // une tentative créée avant US-QCM-10 (adoptée par la première session).
  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  // Composition : les réponses n'existent pas hors de leur tentative.
  @OneToMany(() => Reponse, (reponse) => reponse.tentative)
  reponses: Reponse[];
}
