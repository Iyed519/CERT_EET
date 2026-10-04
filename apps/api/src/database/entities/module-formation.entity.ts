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
import { Formation } from './formation.entity';

/**
 * Module — subdivision ordonnée d'une formation (classe « Module » du
 * diagramme de classes, table `modules`).
 *
 * Je nomme la classe `ModuleFormation` et non `Module` pour ne pas entrer en
 * collision avec le décorateur `@Module` de NestJS dans les fichiers qui
 * importeront les deux.
 *
 * Le module ne porte PAS de type (QCM / livrable) : d'après le diagramme, un
 * module contient 0..* QCM et 0..* ateliers. Ce sont les évaluations qui
 * pointent vers le module (`qcm.module_id` ce sprint, `ateliers.module_id` au
 * Sprint 4), donc ajouter les ateliers ne touchera pas à cette table.
 *
 * Composition Formation *-- Module : suppression en cascade.
 */
@Index('IDX_modules_formation_ordre', ['formationId', 'ordre'])
@Entity('modules')
export class ModuleFormation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'formation_id', type: 'uuid' })
  formationId: string;

  @ManyToOne(() => Formation, (formation) => formation.modules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'formation_id',
    foreignKeyConstraintName: 'FK_modules_formation',
  })
  formation: Formation;

  @Column({ type: 'varchar', length: 255 })
  titre: string;

  // Position du module dans la formation (affichage trié, DS-09).
  @Column({ type: 'int' })
  ordre: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
