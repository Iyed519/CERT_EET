import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
/**
 * Domaine (champ) d'études — référentiel (US-AUTH-15).
 *
 * Table de référence, pas un enum : IDs stables, jointures propres, extension
 * par données (pas de migration). `code` = clé courte stable (INFO, GENIE…) ;
 * `libelle` = intitulé affiché. Sert à qualifier le profil apprenant et, plus
 * tard, à filtrer les établissements (table etablissement_domaine).
 */
@Entity('domaines_etudes')
export class DomaineEtudes {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30 })
  code: string;
  @Column({ type: 'varchar', length: 120 })
  libelle: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
