import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutFormation } from '../enums/statut-formation.enum';
import { numericTransformer } from '../transformers/numeric.transformer';
import { ModuleFormation } from './module-formation.entity';

/**
 * Formation — cursus certifiant (US-FORM-01, DS-16 P1).
 *
 * Squelette posé au Sprint 1 (id, titre, description), complété ici avec les
 * attributs du diagramme de classes. Je double en base les deux règles de
 * validation du Gherkin d'US-FORM-01 (capacité > 0, seuil dans [0,100]) par
 * des contraintes CHECK : même si un service oubliait la validation, la base
 * refuserait une formation incohérente.
 */
@Check('CHK_formations_capacite_max', '"capacite_max" > 0')
@Check(
  'CHK_formations_note_min_certification',
  '"note_min_certification" >= 0 AND "note_min_certification" <= 100',
)
@Entity('formations')
export class Formation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  titre: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  objectifs: string | null;

  @Column({ type: 'text', nullable: true })
  prerequis: string | null;

  // Dates de calendrier (sans heure) : type `date`, lu comme 'YYYY-MM-DD'.
  @Column({ name: 'date_debut', type: 'date', nullable: true })
  dateDebut: string | null;

  // Sert aussi d'échéance par défaut des inscriptions (DS-08).
  @Column({ name: 'date_fin', type: 'date', nullable: true })
  dateFin: string | null;

  @Column({ name: 'duree_heures', type: 'int', nullable: true })
  dureeHeures: number | null;

  // Nombre maximal d'inscriptions non suspendues (contrôlé à l'inscription).
  @Column({ name: 'capacite_max', type: 'int' })
  capaciteMax: number;

  @Column({
    type: 'enum',
    enum: StatutFormation,
    default: StatutFormation.OUVERTE,
  })
  statut: StatutFormation;

  // Seuil d'éligibilité à la certification, en pourcentage (0 à 100).
  @Column({
    name: 'note_min_certification',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  noteMinCertification: number;

  // Référence du gabarit PDF utilisé à l'émission du certificat (épopée E5).
  @Column({
    name: 'modele_certificat',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  modeleCertificat: string | null;

  // Composition : un module n'existe pas hors de sa formation.
  @OneToMany(() => ModuleFormation, (module) => module.formation)
  modules: ModuleFormation[];

  /** US-CERT-07 — Validité des certificats (mois) ; null = sans expiration. */
  @Column({ name: 'duree_validite_mois', type: 'int', nullable: true })
  dureeValiditeMois: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
