import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Universite } from './universite.entity';
/**
 * Établissement — référentiel (US-AUTH-15).
 *
 * Institution rattachée à une université : faculté, institut, école, ISET, ENI.
 * C'est ce que l'apprenant sélectionne dans son profil. `type` = 'faculte' |
 * 'institut' | 'ecole' | 'iset' | 'eni' | 'autre'. Le lien vers les domaines
 * (etablissement_domaine) permettra de filtrer par champ d'études (v2).
 */
@Entity('etablissements')
export class Etablissement {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Index()
  @Column({ name: 'universite_id', type: 'uuid' })
  universiteId: string;
  @ManyToOne(() => Universite, (universite) => universite.etablissements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'universite_id' })
  universite: Universite;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  nom: string;
  // 'faculte' | 'institut' | 'ecole' | 'iset' | 'eni' | 'autre'
  @Column({ type: 'varchar', length: 20 })
  type: string;
  @Column({ type: 'varchar', length: 50, nullable: true })
  gouvernorat: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
