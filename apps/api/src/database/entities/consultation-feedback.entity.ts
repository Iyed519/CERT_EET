import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Livrable } from './livrable.entity';

/**
 * Première consultation d'un feedback par son apprenant (US-ATEL-08, table
 * `consultations_feedback`). Une ligne par livrable noté, écrite la PREMIÈRE
 * fois que l'apprenant ouvre la fiche de l'atelier ; tant qu'elle n'existe pas,
 * « Mon espace » affiche « Nouveau feedback ».
 *
 * Table à part : la correction et le livrable notés sont immuables (US-ATEL-07).
 * CASCADE avec le livrable (elle n'existe pas sans lui).
 */
@Entity('consultations_feedback')
export class ConsultationFeedback {
  @PrimaryColumn({ name: 'livrable_id', type: 'uuid' })
  livrableId: string;

  @OneToOne(() => Livrable, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'livrable_id',
    foreignKeyConstraintName: 'FK_consultations_feedback_livrable',
  })
  livrable?: Livrable;

  @Column({ name: 'date_consultation', type: 'timestamptz', default: () => 'now()' })
  dateConsultation: Date;
}
