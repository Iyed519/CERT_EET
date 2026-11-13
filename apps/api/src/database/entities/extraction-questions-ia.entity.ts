import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Qcm } from './qcm.entity';
import { User } from './user.entity';

/** Cycle d'une extraction (US-IA-08). */
export type StatutExtraction = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINEE' | 'ECHEC';
/** Comment le document a été lu : texte, tableau (CSV / XLSX) ou lecture visuelle. */
export type ModeLecture = 'TEXTE' | 'TABLEAU' | 'VISION';

/**
 * Extraction des questions d'un document par l'IA (US-IA-08, table
 * `extractions_questions_ia`) : un fichier déposé sur un QCM par un
 * formateur, lu en tâche de fond ; les questions recopiées attendent sa
 * relecture (`questions_extraites_ia`). La clé de stockage n'est jamais
 * exposée ; elle passe à NULL quand le fichier est supprimé.
 */
@Entity('extractions_questions_ia')
export class ExtractionQuestionsIa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'qcm_id', type: 'uuid' })
  qcmId: string;

  @ManyToOne(() => Qcm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'qcm_id', foreignKeyConstraintName: 'FK_extractions_qcm' })
  qcm?: Qcm;

  @Column({ name: 'formateur_id', type: 'uuid' })
  formateurId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formateur_id', foreignKeyConstraintName: 'FK_extractions_formateur' })
  formateur?: User;

  @Column({ name: 'nom_fichier', type: 'varchar', length: 255 })
  nomFichier: string;

  @Column({ type: 'varchar', length: 10 })
  format: string;

  @Column({ name: 'taille_octets', type: 'int' })
  tailleOctets: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'cle_stockage', type: 'varchar', length: 300, nullable: true })
  cleStockage: string | null;

  @Column({ type: 'varchar', length: 20, default: 'EN_ATTENTE' })
  statut: StatutExtraction;

  @Column({ name: 'mode_lecture', type: 'varchar', length: 20, nullable: true })
  modeLecture: ModeLecture | null;

  @Column({ type: 'boolean', default: false })
  tronque: boolean;

  @Column({ name: 'modele_llm', type: 'varchar', length: 100, nullable: true })
  modeleLlm: string | null;

  @Column({ name: 'nb_questions', type: 'int', nullable: true })
  nbQuestions: number | null;

  @Column({ name: 'nb_ecartees', type: 'int', nullable: true })
  nbEcartees: number | null;

  @Column({ name: 'nb_tentatives', type: 'int', default: 0 })
  nbTentatives: number;

  @Column({ name: 'derniere_erreur', type: 'varchar', length: 500, nullable: true })
  derniereErreur: string | null;

  @Column({ name: 'date_lancement', type: 'timestamptz' })
  dateLancement: Date;

  @Column({ name: 'date_fin', type: 'timestamptz', nullable: true })
  dateFin: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
