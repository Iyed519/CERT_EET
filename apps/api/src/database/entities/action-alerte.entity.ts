import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TypeActionAlerte } from '../enums/type-action-alerte.enum';
import { AlerteDecrochage } from './alerte-decrochage.entity';
import { User } from './user.entity';

/**
 * US-SUIVI-03 — Historique des actions sur une alerte de décrochage
 * (table `actions_alerte`). Ajout seul : un déclencheur refuse toute
 * modification (l'historique n'est jamais écrasé, DS-14 P2).
 */
@Entity('actions_alerte')
export class ActionAlerte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'alerte_id', type: 'uuid' })
  alerteId: string;

  @ManyToOne(() => AlerteDecrochage, { onDelete: 'CASCADE' })
  alerte?: AlerteDecrochage;

  @Column({ name: 'auteur_id', type: 'uuid', nullable: true })
  auteurId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  auteur?: User | null;

  @Column({ type: 'enum', enum: TypeActionAlerte })
  type: TypeActionAlerte;

  @Column({ type: 'text' })
  commentaire: string;

  @CreateDateColumn({ name: 'date_action', type: 'timestamptz' })
  dateAction: Date;
}
