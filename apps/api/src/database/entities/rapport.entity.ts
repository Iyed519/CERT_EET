import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FormatRapport, StatutRapport, TypeRapport } from '../enums/rapport.enum';
import { Formation } from './formation.entity';
import { User } from './user.entity';

/**
 * US-RPT-01 / US-RPT-02 — Rapport exporté (table `rapports`).
 *
 * Demandé par un formateur (session d'une formation) ou un administrateur
 * (institutionnel), produit EN ARRIÈRE-PLAN par la file BullMQ `rapports`,
 * déposé dans le stockage objet ; seul le demandeur peut le télécharger.
 */
@Entity('rapports')
@Index('IDX_rapports_demandeur', ['demandeurId', 'dateDemande'])
export class Rapport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TypeRapport })
  type: TypeRapport;

  @Column({ type: 'enum', enum: FormatRapport })
  format: FormatRapport;

  @Column({ type: 'enum', enum: StatutRapport, default: StatutRapport.EN_ATTENTE })
  statut: StatutRapport;

  @Column({ name: 'demandeur_id', type: 'uuid' })
  demandeurId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  demandeur?: User;

  @Column({ name: 'formation_id', type: 'uuid', nullable: true })
  formationId: string | null;

  @ManyToOne(() => Formation, { onDelete: 'CASCADE' })
  formation?: Formation | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  parametres: Record<string, unknown>;

  @Column({ name: 'nom_fichier', type: 'varchar', length: 200, nullable: true })
  nomFichier: string | null;

  @Column({ name: 'cle_stockage', type: 'varchar', length: 400, nullable: true, unique: true })
  cleStockage: string | null;

  @Column({ name: 'taille_octets', type: 'int', nullable: true })
  tailleOctets: number | null;

  @Column({ name: 'empreinte_sha256', type: 'char', length: 64, nullable: true })
  empreinteSha256: string | null;

  @Column({ name: 'nb_tentatives', type: 'int', default: 0 })
  nbTentatives: number;

  @Column({ name: 'derniere_erreur', type: 'text', nullable: true })
  derniereErreur: string | null;

  @CreateDateColumn({ name: 'date_demande', type: 'timestamptz' })
  dateDemande: Date;

  @Column({ name: 'date_fin', type: 'timestamptz', nullable: true })
  dateFin: Date | null;
}
