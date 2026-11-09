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
import { StatutSupport } from '../enums/statut-support.enum';
import { ModuleFormation } from './module-formation.entity';
import { User } from './user.entity';

/**
 * Support pédagogique déposé pour l'assistance IA (US-IA-01, DS-06 partie 1,
 * table `supports_pedagogiques`).
 *
 *  - rattaché à un MODULE (FK RESTRICT) et à son déposant (FK RESTRICT) ;
 *  - le fichier d'origine est sur MinIO (`cleStockage`, préfixe `supports/`),
 *    jamais renvoyé au navigateur ; son SHA-256 sert de traçabilité et
 *    d'anti-doublon : UN même fichier par module (UNIQUE module × sha256) ;
 *  - INDEXE ⇔ segments, modèle d'embeddings et date d'indexation renseignés
 *    (CHECK en base) ;
 *  - les segments vectorisés sont dans `segments_support` (colonne pgvector,
 *    lue et écrite en SQL : TypeORM ne connaît pas le type `vector`) ; ils
 *    sont supprimés avec le support (CASCADE : un segment n'existe pas seul).
 */
@Index('UQ_supports_module_sha256', ['moduleId', 'sha256'], { unique: true })
@Entity('supports_pedagogiques')
export class SupportPedagogique {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => ModuleFormation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'module_id', foreignKeyConstraintName: 'FK_supports_module' })
  module?: ModuleFormation;

  @Column({ name: 'depose_par', type: 'uuid' })
  deposePar: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'depose_par', foreignKeyConstraintName: 'FK_supports_depose_par' })
  deposant?: User;

  @Column({ type: 'varchar', length: 200 })
  titre: string;

  @Column({ name: 'nom_original', type: 'varchar', length: 255 })
  nomOriginal: string;

  @Column({ type: 'varchar', length: 8 })
  extension: string;

  @Column({ name: 'taille_octets', type: 'int' })
  tailleOctets: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'cle_stockage', type: 'varchar', length: 400, unique: true })
  cleStockage: string;

  @Column({ type: 'enum', enum: StatutSupport, default: StatutSupport.EN_INDEXATION })
  statut: StatutSupport;

  @Column({ name: 'nb_segments', type: 'int', nullable: true })
  nbSegments: number | null;

  @Column({ name: 'nb_caracteres', type: 'int', nullable: true })
  nbCaracteres: number | null;

  @Column({ name: 'modele_embeddings', type: 'varchar', length: 100, nullable: true })
  modeleEmbeddings: string | null;

  @Column({ name: 'nb_tentatives', type: 'int', default: 0 })
  nbTentatives: number;

  @Column({ name: 'derniere_erreur', type: 'varchar', length: 500, nullable: true })
  derniereErreur: string | null;

  @Column({ name: 'date_depot', type: 'timestamptz' })
  dateDepot: Date;

  @Column({ name: 'date_indexation', type: 'timestamptz', nullable: true })
  dateIndexation: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
