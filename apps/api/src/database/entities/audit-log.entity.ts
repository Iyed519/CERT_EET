import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cible: string | null;

  @Column({ name: 'adresse_ip', type: 'varchar', length: 45, nullable: true })
  adresseIp: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  resultat: string | null; // "Succès" | "Échec"

  @Column({ name: 'details_avant_apres', type: 'jsonb', nullable: true })
  detailsAvantApres: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'horodatage', type: 'timestamptz' })
  horodatage: Date;
}