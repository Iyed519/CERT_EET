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
  // Nom + prénom saisis à l'auto-inscription (US-CPT-05). Nullable en base car
  // les comptes créés avant cette story (admin bootstrap) n'en ont pas.
  @Column({ type: 'varchar', length: 100, nullable: true })
  nom: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  prenom: string | null;
  // Haché bcrypt — NULLABLE depuis US-AUTH-14 : un compte créé via un
  // fournisseur OAuth (Google...) n'a pas de mot de passe local. La sécurité
  // tient : AuthService.login compare toujours contre un hash factice quand
  // celui-ci est null, donc un compte sans mot de passe ne peut JAMAIS être
  // authentifié par mot de passe.
  @Column({
    name: 'mot_de_passe_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  motDePasseHash: string | null;
  @Column({ type: 'enum', enum: Role })
  role: Role;
  @Column({
    type: 'enum',
    enum: StatutCompte,
    default: StatutCompte.EN_ATTENTE_ACTIVATION,
  })
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
