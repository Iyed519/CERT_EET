import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CritereAlerte } from '../enums/critere-alerte.enum';
import { StatutAlerte } from '../enums/statut-alerte.enum';
import { Formation } from './formation.entity';
import { User } from './user.entity';

/**
 * US-SUIVI-02 — Alerte de décrochage (DS-14 P2, table `alertes_decrochage`).
 *
 * Créée par le balayage planifié, jamais par un utilisateur. Au plus UNE
 * alerte OUVERTE par (formation, apprenant, critère) : index unique partiel
 * `UQ_alertes_ouvertes` — le balayage est idempotent (ON CONFLICT DO NOTHING).
 * `donnees` porte les faits qui ont déclenché l'alerte (jours d'inactivité,
 * tentatives, atelier, notes), jamais de donnée sensible.
 */
@Entity('alertes_decrochage')
@Index('UQ_alertes_ouvertes', ['formationId', 'apprenantId', 'critere'], {
  unique: true,
  where: `"statut" = 'OUVERTE'`,
})
export class AlerteDecrochage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'formation_id', type: 'uuid' })
  formationId: string;

  @ManyToOne(() => Formation, { onDelete: 'CASCADE' })
  formation?: Formation;

  @Column({ name: 'apprenant_id', type: 'uuid' })
  apprenantId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  apprenant?: User;

  @Column({ type: 'enum', enum: CritereAlerte })
  critere: CritereAlerte;

  @Column({ type: 'enum', enum: StatutAlerte, default: StatutAlerte.OUVERTE })
  statut: StatutAlerte;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  donnees: Record<string, unknown>;

  @Column({ type: 'varchar', length: 300 })
  suggestion: string;

  @CreateDateColumn({ name: 'date_creation', type: 'timestamptz' })
  dateCreation: Date;

  @Column({ name: 'date_traitement', type: 'timestamptz', nullable: true })
  dateTraitement: Date | null;

  @Column({ name: 'traite_par', type: 'uuid', nullable: true })
  traitePar: string | null;
}
