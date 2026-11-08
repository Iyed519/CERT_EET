import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Livrable } from './livrable.entity';

/**
 * Fichier d'un livrable (US-ATEL-04, DS-03 `fichiers_livrables`).
 *
 * Le contenu vit dans le stockage objet (MinIO / S3, ADR-07) sous
 * `cleStockage` ; la base garde le nom d'origine, l'extension (déjà contrôlée
 * contre la liste de l'atelier), la taille et le SHA-256 du fichier.
 * Supprimé avec son livrable (CASCADE) : il n'existe pas sans lui.
 */
@Index('UQ_fichiers_livrables_ordre', ['livrableId', 'ordre'], { unique: true })
@Entity('fichiers_livrables')
export class FichierLivrable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'livrable_id', type: 'uuid' })
  livrableId: string;

  @ManyToOne(() => Livrable, (l) => l.fichiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'livrable_id', foreignKeyConstraintName: 'FK_fichiers_livrables_livrable' })
  livrable?: Livrable;

  @Column({ type: 'int' })
  ordre: number;

  @Column({ name: 'nom_original', type: 'varchar', length: 255 })
  nomOriginal: string;

  @Column({ type: 'varchar', length: 10 })
  extension: string;

  // bigint : le pilote renvoie une chaîne, convertie en nombre (≤ 100 Mo).
  @Column({
    name: 'taille_octets',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  tailleOctets: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'cle_stockage', type: 'varchar', length: 500, unique: true })
  cleStockage: string;
}
