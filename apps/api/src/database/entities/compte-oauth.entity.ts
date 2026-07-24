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
/**
 * Identité OAuth externe liée à un compte (US-AUTH-14, ADR-11).
 *
 * Un utilisateur peut lier plusieurs fournisseurs (Google, GitHub, Facebook) :
 * une ligne par (provider, provider_id). L'unicité sur ce couple garantit
 * qu'une même identité externe n'appartient qu'à un seul compte. Table séparée
 * (plutôt que des colonnes sur users) pour supporter proprement le multi-
 * fournisseur et la liaison de compte (ADR-11 : « liaison si l'email existe »).
 */
@Index(['provider', 'providerId'], { unique: true })
@Entity('comptes_oauth')
export class CompteOauth {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  // 'google' | 'github' | 'facebook'
  @Column({ type: 'varchar', length: 30 })
  provider: string;
  // Identifiant stable de l'utilisateur chez le fournisseur (sub OIDC / id).
  @Column({ name: 'provider_id', type: 'varchar', length: 255 })
  providerId: string;
  // Email renvoyé par le fournisseur (info / liaison ; peut différer).
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
