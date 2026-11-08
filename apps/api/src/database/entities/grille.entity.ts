import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Atelier } from './atelier.entity';
import { Critere } from './critere.entity';

/**
 * Grille de notation (DS-13 partie 2, UC4 Formateur, US-ATEL-02, table
 * `grilles`).
 *
 * Deux natures, séparées par un CHECK en base (`CHK_grilles_nature`) :
 *  - la grille de travail d'UN atelier (`atelierId` renseigné, unique) :
 *    elle se modifie tant que l'atelier est en brouillon et doit être
 *    VALIDÉE (Σ pondérations = 100 %) avant la publication (US-ATEL-03) ;
 *  - un MODÈLE réutilisable (`estModele`, `nomModele`, sans atelier) : une
 *    copie indépendante appartenant au formateur, qui survit à l'atelier.
 *
 * `formateurId` : auteur (FK SET NULL posée par la migration).
 */
@Entity('grilles')
export class Grille {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'atelier_id', type: 'uuid', nullable: true })
  atelierId: string | null;

  @OneToOne(() => Atelier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atelier_id', foreignKeyConstraintName: 'FK_grilles_atelier' })
  atelier: Atelier | null;

  @Column({ name: 'formateur_id', type: 'uuid', nullable: true })
  formateurId: string | null;

  @Column({ type: 'boolean', default: false })
  validee: boolean;

  @Column({ name: 'est_modele', type: 'boolean', default: false })
  estModele: boolean;

  @Column({ name: 'nom_modele', type: 'varchar', length: 120, nullable: true })
  nomModele: string | null;

  @OneToMany(() => Critere, (c) => c.grille)
  criteres: Critere[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
