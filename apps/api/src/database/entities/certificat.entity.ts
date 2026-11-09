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
import { StatutCertificat } from '../enums/statut-certificat.enum';
import { Formation } from './formation.entity';
import { User } from './user.entity';

const nombre = {
  to: (v: number | null): number | null => v,
  from: (v: string | null): number | null => (v === null ? null : Number(v)),
};

/**
 * Certificat (US-CERT-01, DS-04, ADR-04 / ADR-10, table `certificats`).
 *
 *  - UN certificat par (apprenant, formation) : contrainte UNIQUE — la
 *    demande d'émission est idempotente (une seule ligne, un seul job) ;
 *  - `id` (UUID v4, 122 bits aléatoires) est l'identifiant public encodé dans
 *    le QR code et l'URL de vérification : il ne révèle rien de la personne ;
 *  - `scoreFinal` (0–100) et `mention` sont fixés à la demande ;
 *  - `cleStockage`, `empreinteSha256` et `dateGeneration` sont fixés quand le
 *    worker a produit le PDF (statut ACTIF ; CHECK en base) ;
 *  - un certificat ACTIF est IMMUABLE (déclencheur de la migration
 *    1787000000000) ; seule la révocation (US-CERT-06) le fera évoluer ;
 *  - FK RESTRICT vers l'apprenant et la formation.
 */
@Index('UQ_certificats_apprenant_formation', ['apprenantId', 'formationId'], { unique: true })
@Entity('certificats')
export class Certificat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'apprenant_id', type: 'uuid' })
  apprenantId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'apprenant_id', foreignKeyConstraintName: 'FK_certificats_apprenant' })
  apprenant?: User;

  @Column({ name: 'formation_id', type: 'uuid' })
  formationId: string;

  @ManyToOne(() => Formation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'formation_id', foreignKeyConstraintName: 'FK_certificats_formation' })
  formation?: Formation;

  @Column({
    type: 'enum',
    enum: StatutCertificat,
    default: StatutCertificat.EN_ATTENTE_GENERATION,
  })
  statut: StatutCertificat;

  @Column({
    name: 'score_final',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: nombre,
  })
  scoreFinal: number;

  @Column({ type: 'varchar', length: 20 })
  mention: string;

  @Column({ name: 'organisme_emetteur', type: 'varchar', length: 120 })
  organismeEmetteur: string;

  @Column({ name: 'date_emission', type: 'timestamptz' })
  dateEmission: Date;

  @Column({ name: 'date_generation', type: 'timestamptz', nullable: true })
  dateGeneration: Date | null;

  @Column({ name: 'cle_stockage', type: 'varchar', length: 200, nullable: true, unique: true })
  cleStockage: string | null;

  @Column({ name: 'empreinte_sha256', type: 'char', length: 64, nullable: true })
  empreinteSha256: string | null;

  @Column({ name: 'nb_tentatives', type: 'int', default: 0 })
  nbTentatives: number;

  @Column({ name: 'derniere_erreur', type: 'varchar', length: 500, nullable: true })
  derniereErreur: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
