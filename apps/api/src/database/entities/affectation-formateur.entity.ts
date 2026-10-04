import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Formation } from './formation.entity';
import { User } from './user.entity';

/**
 * Affectation d'un formateur à une formation (US-FORM-03, DS-16 P1 ; table
 * `formation_formateurs`).
 *
 * C'est la table sur laquelle repose l'autorisation par ressource (US-AUTH-16,
 * ADR-11) : le RBAC dit « vous êtes formateur », cette table dit « vous êtes
 * formateur de CETTE formation ». Sans ligne ici, un formateur ne peut ni
 * créer ni publier d'évaluation sur la formation.
 *
 *  - Unicité (formation, formateur) : pas de double affectation ; c'est aussi
 *    l'index utilisé par le garde à chaque requête.
 *  - Index (formateur) : lister « mes formations ».
 *  - `affecte_par` : administrateur auteur de l'affectation (traçabilité).
 *    Simple colonne uuid, comme `demandes_role.traite_par` : la FK (SET NULL)
 *    est posée par la migration, je n'ai jamais besoin de charger ce compte.
 *
 * Le rôle FORMATEUR du compte affecté est vérifié par le service (un rôle peut
 * changer, US-ROL-01), pas par une contrainte de base.
 */
@Index('UQ_formation_formateurs_formation_formateur', ['formationId', 'formateurId'], {
  unique: true,
})
@Index('IDX_formation_formateurs_formateur', ['formateurId'])
@Entity('formation_formateurs')
export class AffectationFormateur {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'formation_id', type: 'uuid' })
  formationId: string;

  @ManyToOne(() => Formation, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'formation_id',
    foreignKeyConstraintName: 'FK_formation_formateurs_formation',
  })
  formation: Formation;

  @Column({ name: 'formateur_id', type: 'uuid' })
  formateurId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'formateur_id',
    foreignKeyConstraintName: 'FK_formation_formateurs_formateur',
  })
  formateur: User;

  @Column({ name: 'affecte_par', type: 'uuid', nullable: true })
  affectePar: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
