import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutCorrection } from '../enums/statut-correction.enum';
import { Livrable } from './livrable.entity';
import { NoteCritere } from './note-critere.entity';
import { User } from './user.entity';

/**
 * Correction d'un livrable (US-ATEL-06, DS-03 partie 2, UC5 Formateur, table
 * `corrections`).
 *
 *  - UNE correction par livrable (UNIQUE) : créée quand un formateur ouvre la
 *    correction (SOUMIS -> EN_CORRECTION, sous le verrou de la ligne du
 *    livrable) ;
 *  - `correcteurId` : le formateur (ou l'administrateur) qui l'a ouverte ; tout
 *    formateur affecté peut ensuite noter, chaque écriture est tracée avec son
 *    auteur ;
 *  - `dateOuverture` : heure de PostgreSQL à l'ouverture ;
 *  - CASCADE avec le livrable (elle n'existe pas sans lui) ; RESTRICT vers le
 *    correcteur.
 * Le score n'est pas stocké ici tant que la correction est en cours : il se
 * recalcule à partir des notes (US-ATEL-07 le fige à la finalisation).
 */
@Entity('corrections')
export class Correction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'livrable_id', type: 'uuid', unique: true })
  livrableId: string;

  @OneToOne(() => Livrable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'livrable_id', foreignKeyConstraintName: 'FK_corrections_livrable' })
  livrable?: Livrable;

  @Column({ name: 'correcteur_id', type: 'uuid' })
  correcteurId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'correcteur_id', foreignKeyConstraintName: 'FK_corrections_correcteur' })
  correcteur?: User;

  @Column({ type: 'enum', enum: StatutCorrection, default: StatutCorrection.EN_COURS })
  statut: StatutCorrection;

  @Column({ name: 'date_ouverture', type: 'timestamptz' })
  dateOuverture: Date;

  @OneToMany(() => NoteCritere, (n) => n.correction)
  notes?: NoteCritere[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
