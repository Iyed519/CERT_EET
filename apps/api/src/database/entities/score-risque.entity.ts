import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NiveauRisque } from '../enums/niveau-risque.enum';
import { numericTransformer } from '../transformers/numeric.transformer';
import { Inscription } from './inscription.entity';

/**
 * IA — Score de risque d'une inscription (table `scores_risque`).
 *
 * Écrit seulement par le calcul périodique (service ml), jamais par un
 * utilisateur ni pendant une requête. Une ligne par calcul : l'historique est
 * conservé 180 jours. `variables` garde les 16 entrées envoyées au modèle
 * (traçabilité : pourquoi ce niveau à cette date) ; aucune donnée personnelle
 * (ni nom, ni âge, ni genre).
 */
@Entity('scores_risque')
@Index('IDX_scores_risque_inscription_date', ['inscriptionId', 'dateCalcul'])
@Index('IDX_scores_risque_date', ['dateCalcul'])
export class ScoreRisque {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inscription_id', type: 'uuid' })
  inscriptionId: string;

  @ManyToOne(() => Inscription, { onDelete: 'CASCADE' })
  inscription?: Inscription;

  @Column({ name: 'date_calcul', type: 'timestamptz' })
  dateCalcul: Date;

  @Column({ type: 'numeric', precision: 5, scale: 4, transformer: numericTransformer })
  probabilite: number;

  @Column({ type: 'varchar', length: 10 })
  niveau: NiveauRisque;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  raisons: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  variables: Record<string, number | null>;

  @Column({ name: 'version_modele', type: 'varchar', length: 50 })
  versionModele: string;
}
