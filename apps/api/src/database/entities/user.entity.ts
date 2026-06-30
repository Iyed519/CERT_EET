import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums/role.enum';
import { StatutCompte } from '../enums/statut-compte.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  // Jamais le mot de passe en clair — uniquement le haché bcrypt (cost 12).
  @Column({ name: 'mot_de_passe_hash', type: 'varchar', length: 255 })
  motDePasseHash: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'enum', enum: StatutCompte, default: StatutCompte.EN_ATTENTE_ACTIVATION })
  statut: StatutCompte;

  @Column({ name: 'mfa_active', type: 'boolean', default: false })
  mfaActive: boolean;

  @Column({ name: 'mfa_secret', type: 'varchar', length: 255, nullable: true })
  mfaSecret: string | null;

  @Column({ name: 'derniere_connexion', type: 'timestamptz', nullable: true })
  derniereConnexion: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}