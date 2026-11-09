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
 * Le score n'est pas stocké tant que la correction est en cours : il se
 * recalcule à partir des notes. La finalisation (US-ATEL-07) le fige avec le
 * commentaire général et la date ; la correction devient alors IMMUABLE
 * (déclencheurs de la migration 1786800000000).
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

  // US-ATEL-07 : renseignés à la finalisation (CHECK : tous ou aucun).
  @Column({
    name: 'score_total',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  scoreTotal: number | null;

  @Column({ name: 'commentaire_general', type: 'text', nullable: true })
  commentaireGeneral: string | null;

  @Column({ name: 'date_finalisation', type: 'timestamptz', nullable: true })
  dateFinalisation: Date | null;

  @OneToMany(() => NoteCritere, (n) => n.correction)
  notes?: NoteCritere[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
