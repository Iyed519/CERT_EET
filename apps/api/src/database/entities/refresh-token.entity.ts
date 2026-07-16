import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Identifiant de la "famille" de refresh tokens (US-AUTH-03, rotation).
   * Tous les refresh tokens issus d'une même connexion partagent ce même
   * famille_id : le token émis au login en est la racine, et chaque rotation
   * le transmet au nouveau token. Sert à la détection de rejeu (reuse
   * detection) : si un token déjà consommé est represente, on révoque TOUTE
   * la famille (tous les tokens de la même connexion) d'un seul coup. Indexé
   * car c'est le critère de filtrage de cette révocation en masse.
   */
  @Index()
  @Column({ name: 'famille_id', type: 'uuid' })
  familleId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ name: 'adresse_ip', type: 'varchar', length: 45, nullable: true })
  adresseIp: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'date_expiration', type: 'timestamptz' })
  dateExpiration: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
