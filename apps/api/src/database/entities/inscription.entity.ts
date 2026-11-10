import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutInscription } from '../enums/statut-inscription.enum';
import { numericTransformer } from '../transformers/numeric.transformer';
import { Formation } from './formation.entity';
import { User } from './user.entity';

/**
 * Inscription — classe d'association Apprenant <-> Formation (DS-08).
 *
 * Elle porte les données propres au LIEN : date, échéance, statut, taux
 * d'avancement. C'est elle qui ouvre (EN_COURS) ou ferme (SUSPENDUE) l'accès
 * aux modules (US-INSC-04).
 *
 *  - Unicité (apprenant, formation) : un apprenant n'a qu'UNE inscription par
 *    formation. Une ré-inscription réactive la ligne existante (DS-11 P3),
 *    elle n'en crée pas une seconde. La base garantit le 409 « déjà inscrit »
 *    même si deux requêtes arrivent en même temps.
 *  - Index (formation, statut) : le contrôle de capacité compte les
 *    inscriptions non suspendues d'une formation.
 *  - RESTRICT des deux côtés : une inscription est une donnée de traçabilité,
 *    supprimer un compte ou une formation ne doit jamais l'effacer en silence.
 */
@Index('UQ_inscriptions_apprenant_formation', ['apprenantId', 'formationId'], {
  unique: true,
})
@Index('IDX_inscriptions_formation_statut', ['formationId', 'statut'])
@Check(
  'CHK_inscriptions_taux_avancement',
  '"taux_avancement" >= 0 AND "taux_avancement" <= 100',
)
@Entity('inscriptions')
export class Inscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'apprenant_id', type: 'uuid' })
  apprenantId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'apprenant_id',
    foreignKeyConstraintName: 'FK_inscriptions_apprenant',
  })
  apprenant: User;

  @Column({ name: 'formation_id', type: 'uuid' })
  formationId: string;

  @ManyToOne(() => Formation, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'formation_id',
    foreignKeyConstraintName: 'FK_inscriptions_formation',
  })
  formation: Formation;

  @CreateDateColumn({ name: 'date_inscription', type: 'timestamptz' })
  dateInscription: Date;

  // Copie de formation.dateFin au moment de l'inscription (DS-08).
  @Column({ name: 'date_echeance', type: 'date', nullable: true })
  dateEcheance: string | null;

  @Column({
    type: 'enum',
    enum: StatutInscription,
    default: StatutInscription.EN_COURS,
  })
  statut: StatutInscription;

  // Pourcentage d'évaluations validées (0 à 100), recalculé côté serveur.
  @Column({
    name: 'taux_avancement',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  tauxAvancement: number;

  // US-INSC-02 : suspension motivée par un administrateur (effacée à la réactivation).
  @Column({ name: 'motif_suspension', type: 'varchar', length: 500, nullable: true })
  motifSuspension: string | null;

  @Column({ name: 'date_suspension', type: 'timestamptz', nullable: true })
  dateSuspension: Date | null;

  @Column({ name: 'suspendue_par', type: 'uuid', nullable: true })
  suspenduePar: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
