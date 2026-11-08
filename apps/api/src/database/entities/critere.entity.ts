import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Grille } from './grille.entity';
import { NiveauPerformance } from './niveau-performance.entity';

/**
 * Critère d'une grille de notation (US-ATEL-02, table `criteres`) :
 * intitulé, pondération entière en % (1–100), description facultative et
 * ses 4 niveaux de performance. Bornes vérifiées par les DTO ET par des
 * CHECK ; la somme des pondérations (≤ 100) l'est par le service sous verrou.
 */
@Entity('criteres')
export class Critere {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'grille_id', type: 'uuid' })
  grilleId: string;

  @ManyToOne(() => Grille, (g) => g.criteres, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grille_id', foreignKeyConstraintName: 'FK_criteres_grille' })
  grille: Grille;

  @Column({ type: 'int' })
  ordre: number;

  @Column({ type: 'varchar', length: 200 })
  intitule: string;

  @Column({ type: 'int' })
  ponderation: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => NiveauPerformance, (n) => n.critere)
  niveaux: NiveauPerformance[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
