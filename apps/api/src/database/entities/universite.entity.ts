import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Etablissement } from './etablissement.entity';
/**
 * Université — référentiel (US-AUTH-15).
 *
 * Une université (publique ou privée) regroupe des établissements
 * (facultés, instituts, écoles, ISET…). Réseau ISET modélisé comme une
 * « université » parente pour rester cohérent. `type` = 'public' | 'prive'.
 */
@Entity('universites')
export class Universite {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  nom: string;
  // 'public' | 'prive'
  @Column({ type: 'varchar', length: 10 })
  type: string;
  @Column({ type: 'varchar', length: 50, nullable: true })
  gouvernorat: string | null;
  @OneToMany(() => Etablissement, (etablissement) => etablissement.universite)
  etablissements: Etablissement[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
