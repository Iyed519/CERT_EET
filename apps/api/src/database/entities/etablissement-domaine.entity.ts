import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Etablissement } from './etablissement.entity';
import { DomaineEtudes } from './domaine-etudes.entity';
/**
 * Lien établissement <-> domaine d'études (M:N) — US-AUTH-15.
 *
 * « Quel établissement enseigne quel domaine. » Table de liaison explicite
 * (plutôt qu'un @ManyToMany implicite) pour pouvoir y ajouter des métadonnées
 * plus tard. Alimentée en v2 (source officielle) ; le schéma est prêt dès
 * maintenant pour filtrer les établissements par domaine.
 */
@Index(['etablissementId', 'domaineId'], { unique: true })
@Entity('etablissement_domaine')
export class EtablissementDomaine {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Index()
  @Column({ name: 'etablissement_id', type: 'uuid' })
  etablissementId: string;
  @ManyToOne(() => Etablissement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'etablissement_id' })
  etablissement: Etablissement;
  @Index()
  @Column({ name: 'domaine_id', type: 'uuid' })
  domaineId: string;
  @ManyToOne(() => DomaineEtudes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domaine_id' })
  domaine: DomaineEtudes;
}
