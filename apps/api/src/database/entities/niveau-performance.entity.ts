import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Critere } from './critere.entity';

/**
 * Niveau de performance d'un critère (US-ATEL-02, table
 * `niveaux_performance`) : rang 1–4 lié à son libellé (Insuffisant,
 * Acceptable, Bon, Excellent — CHECK en base), plage de points exprimée en %
 * du critère, descripteur facultatif. US-ATEL-06 notera chaque critère en
 * choisissant un niveau puis un nombre de points dans sa plage.
 */
@Entity('niveaux_performance')
export class NiveauPerformance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'critere_id', type: 'uuid' })
  critereId: string;

  @ManyToOne(() => Critere, (c) => c.niveaux, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'critere_id', foreignKeyConstraintName: 'FK_niveaux_performance_critere' })
  critere: Critere;

  @Column({ type: 'smallint' })
  ordre: number;

  @Column({ type: 'varchar', length: 20 })
  libelle: string;

  @Column({ name: 'points_min_pct', type: 'int' })
  pointsMinPct: number;

  @Column({ name: 'points_max_pct', type: 'int' })
  pointsMaxPct: number;

  @Column({ type: 'text', nullable: true })
  descripteur: string | null;
}
