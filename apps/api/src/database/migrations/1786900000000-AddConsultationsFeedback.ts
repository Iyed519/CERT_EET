import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-08 — Consultation du feedback par l'apprenant.
 *
 * `consultations_feedback` : une ligne par livrable noté, à la première
 * ouverture de la fiche par son apprenant (heure de PostgreSQL). Elle sert au
 * badge « Nouveau feedback » de « Mon espace ». Table séparée : la correction
 * et le livrable notés sont immuables (migration 1786800000000). CASCADE avec
 * le livrable.
 *
 * Idempotence : IF NOT EXISTS. `down()` retire la table.
 */
export class AddConsultationsFeedback1786900000000 implements MigrationInterface {
  name = 'AddConsultationsFeedback1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consultations_feedback" (
        "livrable_id" uuid NOT NULL,
        "date_consultation" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consultations_feedback" PRIMARY KEY ("livrable_id"),
        CONSTRAINT "FK_consultations_feedback_livrable" FOREIGN KEY ("livrable_id")
          REFERENCES "livrables"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "consultations_feedback"`);
  }
}
