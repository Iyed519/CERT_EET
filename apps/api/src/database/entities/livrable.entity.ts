import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutLivrable } from '../enums/statut-livrable.enum';
import { Atelier } from './atelier.entity';
import { FichierLivrable } from './fichier-livrable.entity';
import { User } from './user.entity';

/**
 * Livrable — dépôt d'un apprenant pour un atelier publié (US-ATEL-04, DS-03
 * partie 1, UC4 Apprenant, table `livrables`).
 *
 *  - UN livrable par (atelier, apprenant) : contrainte UNIQUE ; le
 *    remplacement (US-ATEL-05) incrémentera `version` sur la même ligne ;
 *  - `id` fourni par le service (et non généré par la base) : il sert dans la
 *    clé de stockage des fichiers, envoyés AVANT l'insertion ;
 *  - `dateSoumission` : heure de PostgreSQL à la RÉCEPTION de la requête,
 *    celle qui a décidé du délai ; `enRetard` : déposé pendant la tolérance ;
 *  - `hashTracabilite` : SHA-256 (hex) du contenu — d'un fichier seul, ou de
 *    la liste triée des SHA-256 de plusieurs fichiers (preuve d'antériorité,
 *    ADR-10) ;
 *  - FK RESTRICT vers l'atelier et vers l'apprenant : un livrable n'est jamais
 *    supprimé par effet de bord.
 */
@Index('UQ_livrables_atelier_apprenant', ['atelierId', 'apprenantId'], { unique: true })
@Entity('livrables')
export class Livrable {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'atelier_id', type: 'uuid' })
  atelierId: string;

  @ManyToOne(() => Atelier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'atelier_id', foreignKeyConstraintName: 'FK_livrables_atelier' })
  atelier?: Atelier;

  @Column({ name: 'apprenant_id', type: 'uuid' })
  apprenantId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'apprenant_id', foreignKeyConstraintName: 'FK_livrables_apprenant' })
  apprenant?: User;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: StatutLivrable, default: StatutLivrable.SOUMIS })
  statut: StatutLivrable;

  @Column({ name: 'date_soumission', type: 'timestamptz' })
  dateSoumission: Date;

  @Column({ name: 'en_retard', type: 'boolean', default: false })
  enRetard: boolean;

  @Column({ name: 'hash_tracabilite', type: 'char', length: 64 })
  hashTracabilite: string;

  @Column({ type: 'text', nullable: true })
  commentaire: string | null;

  @Column({ type: 'varchar', length: 500, array: true, default: () => "'{}'" })
  liens: string[];

  @OneToMany(() => FichierLivrable, (f) => f.livrable)
  fichiers?: FichierLivrable[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
