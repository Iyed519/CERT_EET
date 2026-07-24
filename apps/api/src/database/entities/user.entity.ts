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
import { Role } from '../enums/role.enum';
import { StatutCompte } from '../enums/statut-compte.enum';
import { NiveauEtudes } from '../enums/niveau-etudes.enum';
import { DomaineEtudes } from './domaine-etudes.entity';
import { Etablissement } from './etablissement.entity';
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
  // --- Profil apprenant (US-AUTH-15) : complété à la première connexion ---
  // Date de naissance stockée ; l'âge est DÉRIVÉ à la lecture, jamais stocké.
  @Column({ name: 'date_naissance', type: 'date', nullable: true })
  dateNaissance: string | null;
  @Column({
    name: 'niveau_etudes',
    type: 'enum',
    enum: NiveauEtudes,
    nullable: true,
  })
  niveauEtudes: NiveauEtudes | null;
  // Domaine + établissement : FK vers le référentiel (nullable — un profil « plus
  // en études » n'en a pas). onDelete SET NULL : supprimer une entrée du
  // référentiel ne casse pas le compte.
  @Column({ name: 'domaine_etudes_id', type: 'uuid', nullable: true })
  domaineEtudesId: string | null;
  @ManyToOne(() => DomaineEtudes, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'domaine_etudes_id' })
  domaineEtudes: DomaineEtudes | null;
  @Column({ name: 'etablissement_id', type: 'uuid', nullable: true })
  etablissementId: string | null;
  @ManyToOne(() => Etablissement, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'etablissement_id' })
  etablissement: Etablissement | null;
  // Échappatoire quand l'établissement n'est pas dans le référentiel (texte
  // libre, à curer plus tard). Le reste des données reste FK-propre.
  @Column({
    name: 'etablissement_autre',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  etablissementAutre: string | null;
  // Passe à true une fois le profil complété -> la carte bloquante ne
  // s'affiche plus.
  @Column({ name: 'profil_complet', type: 'boolean', default: false })
  profilComplet: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
