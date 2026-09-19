import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoleDemande } from '../enums/role-demande.enum';
import { StatutDemande } from '../enums/statut-demande.enum';

/**
 * Demande de changement de rôle en self-service (US-ROL-02).
 *
 * Complète US-ROL-01 (nomination directe par l'admin) : ici l'utilisateur
 * initie, l'administrateur approuve ou rejette. Je garde `user_id` et
 * `traite_par` en simples colonnes uuid (comme audit_logs) plutôt qu'en
 * relations ManyToOne : les FK sont posées et contraintes en base par la
 * migration, et le service n'a jamais besoin de charger l'entité User liée.
 *
 * Index sur (statut) — la file admin filtre EN_ATTENTE — et sur (user_id) —
 * l'utilisateur consulte ses propres demandes et on vérifie l'unicité d'une
 * demande en attente.
 */
@Entity('demandes_role')
export class DemandeRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Auteur de la demande (utilisateur authentifié). FK users, ON DELETE CASCADE. */
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'role_demande', type: 'enum', enum: RoleDemande })
  roleDemande: RoleDemande;

  @Column({ type: 'text' })
  justification: string;

  @Index()
  @Column({
    type: 'enum',
    enum: StatutDemande,
    default: StatutDemande.EN_ATTENTE,
  })
  statut: StatutDemande;

  /** Motif du REJET (nul tant que la demande n'est pas rejetée). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  motif: string | null;

  /** Administrateur ayant traité la demande. FK users, ON DELETE SET NULL. */
  @Column({ name: 'traite_par', type: 'uuid', nullable: true })
  traitePar: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** Horodatage de traitement (approbation/rejet) ; nul tant qu'EN_ATTENTE. */
  @Column({ name: 'traite_at', type: 'timestamptz', nullable: true })
  traiteAt: Date | null;
}
