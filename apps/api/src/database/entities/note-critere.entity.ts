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
import { Correction } from './correction.entity';
import { Critere } from './critere.entity';
import { NiveauPerformance } from './niveau-performance.entity';

/**
 * Note d'UN critère dans une correction (US-ATEL-06, DS-03 `note_criteres`,
 * table `notes_criteres`).
 *
 * Le formateur choisit d'abord le niveau atteint, puis un nombre de points
 * DANS la plage de ce niveau (en % des points du critère, deux décimales au
 * plus), et peut ajouter un commentaire. Une note par critère et par
 * correction (UNIQUE) : la renoter remplace la note (brouillon).
 *
 * Cohérence garantie par la base (déclencheur de la migration
 * 1786700000000) : le niveau appartient au critère, les points sont dans sa
 * plage, et le critère appartient à la grille de l'atelier du livrable.
 * CASCADE avec la correction ; RESTRICT vers le critère et le niveau.
 */
@Index('UQ_notes_criteres_correction_critere', ['correctionId', 'critereId'], { unique: true })
@Entity('notes_criteres')
export class NoteCritere {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'correction_id', type: 'uuid' })
  correctionId: string;

  @ManyToOne(() => Correction, (c) => c.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'correction_id', foreignKeyConstraintName: 'FK_notes_criteres_correction' })
  correction?: Correction;

  @Column({ name: 'critere_id', type: 'uuid' })
  critereId: string;

  @ManyToOne(() => Critere, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'critere_id', foreignKeyConstraintName: 'FK_notes_criteres_critere' })
  critere?: Critere;

  @Column({ name: 'niveau_id', type: 'uuid' })
  niveauId: string;

  @ManyToOne(() => NiveauPerformance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'niveau_id', foreignKeyConstraintName: 'FK_notes_criteres_niveau' })
  niveau?: NiveauPerformance;

  // numeric : le pilote renvoie une chaîne, convertie en nombre.
  @Column({
    name: 'points_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  pointsPct: number;

  @Column({ type: 'text', nullable: true })
  commentaire: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
