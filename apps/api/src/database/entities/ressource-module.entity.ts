import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NatureRessource } from '../enums/nature-ressource.enum';
import { ModuleFormation } from './module-formation.entity';
import { User } from './user.entity';

/**
 * Ressource pédagogique d'un module, consultée par les apprenants inscrits
 * (US-FORM-05 liens ; US-FORM-06 fichiers ; table `ressources_module`).
 *
 *  - partie du module (CASCADE : une ressource n'existe pas sans lui) ;
 *  - `ordre` unique dans le module (affichage) ;
 *  - un LIEN porte son adresse normalisée et, pour une vidéo YouTube ou
 *    Vimeo, l'identifiant de la vidéo (et un début facultatif) : le lecteur
 *    intégré est construit À PARTIR DE CET IDENTIFIANT, jamais de l'adresse
 *    saisie — aucune page arbitraire n'est affichée dans l'application.
 */
@Entity('ressources_module')
export class RessourceModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => ModuleFormation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id', foreignKeyConstraintName: 'FK_ressources_module' })
  module?: ModuleFormation;

  @Column({ type: 'int' })
  ordre: number;

  @Column({ type: 'enum', enum: NatureRessource })
  nature: NatureRessource;

  @Column({ type: 'varchar', length: 200 })
  titre: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  plateforme: string | null;

  @Column({ name: 'video_id', type: 'varchar', length: 32, nullable: true })
  videoId: string | null;

  @Column({ name: 'debut_secondes', type: 'int', nullable: true })
  debutSecondes: number | null;

  @Column({ name: 'ajoute_par', type: 'uuid' })
  ajoutePar: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ajoute_par', foreignKeyConstraintName: 'FK_ressources_ajoute_par' })
  auteur?: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
