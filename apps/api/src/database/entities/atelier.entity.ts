import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutAtelier } from '../enums/statut-atelier.enum';
import { ModuleFormation } from './module-formation.entity';

/**
 * Atelier — travail pratique évalué, rattaché à un module (DS-13 partie 1,
 * UC3 Formateur, US-ATEL-01, table `ateliers`).
 *
 * Même modèle que le QCM :
 *  - la formation n'est pas stockée : elle se déduit du module
 *    (atelier -> module -> formation), chemin suivi par l'autorisation par
 *    ressource (US-AUTH-16) ;
 *  - `module_id` en RESTRICT : on ne supprime pas un module qui porte une
 *    évaluation ;
 *  - `formateur_id` : compte qui a créé l'atelier ; FK SET NULL posée par la
 *    migration, l'atelier survit au compte.
 *
 * Les bornes (taille, nombre de fichiers, tolérance, extensions autorisées)
 * sont vérifiées par les DTO ET par des CHECK en base : une écriture qui
 * contournerait l'API ne peut pas créer un atelier incohérent.
 * La grille de notation (US-ATEL-02) vivra dans sa propre table.
 */
@Index('IDX_ateliers_module', ['moduleId'])
@Entity('ateliers')
export class Atelier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => ModuleFormation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'module_id', foreignKeyConstraintName: 'FK_ateliers_module' })
  module: ModuleFormation;

  @Column({ name: 'formateur_id', type: 'uuid', nullable: true })
  formateurId: string | null;

  @Column({ type: 'varchar', length: 200 })
  titre: string;

  @Column({ type: 'text' })
  enonce: string;

  @Column({ name: 'competences_visees', type: 'text', nullable: true })
  competencesVisees: string | null;

  @Column({ name: 'date_limite', type: 'timestamptz' })
  dateLimite: Date;

  // Extensions acceptées (liste fermée, voir atelier.regles.ts), sans point.
  @Column({ name: 'types_livrables', type: 'varchar', length: 10, array: true })
  typesLivrables: string[];

  @Column({ name: 'taille_max_mo', type: 'int', default: 20 })
  tailleMaxMo: number;

  @Column({ name: 'nb_max_fichiers', type: 'int', default: 1 })
  nbMaxFichiers: number;

  @Column({ name: 'tolerance_retard_heures', type: 'int', default: 0 })
  toleranceRetardHeures: number;

  @Column({ type: 'enum', enum: StatutAtelier, default: StatutAtelier.BROUILLON })
  statut: StatutAtelier;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
