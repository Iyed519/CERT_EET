import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IA — Scores de risque calculés par le modèle de prédiction (service ml).
 *
 * Table `scores_risque` : une ligne par inscription et par calcul périodique
 * (probabilité, niveau FAIBLE / MOYEN / ELEVE, 3 raisons en français, les 16
 * variables envoyées au modèle, version du modèle). Supprimée avec
 * l'inscription (CASCADE) : elle ne bloque jamais une suppression existante.
 *
 * Index : dernier score d'une inscription (inscription, date DESC) et purge
 * des scores anciens (date).
 *
 * Aucune table existante n'est modifiée. Down : suppression de la table.
 */
export class AddScoresRisque1789000000000 implements MigrationInterface {
  name = 'AddScoresRisque1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scores_risque" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "inscription_id" uuid NOT NULL,
        "date_calcul" timestamptz NOT NULL,
        "probabilite" numeric(5,4) NOT NULL,
        "niveau" varchar(10) NOT NULL,
        "raisons" jsonb NOT NULL DEFAULT '[]',
        "variables" jsonb NOT NULL DEFAULT '{}',
        "version_modele" varchar(50) NOT NULL,
        CONSTRAINT "PK_scores_risque" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_scores_risque_probabilite" CHECK ("probabilite" BETWEEN 0 AND 1),
        CONSTRAINT "CHK_scores_risque_niveau" CHECK ("niveau" IN ('FAIBLE', 'MOYEN', 'ELEVE')),
        CONSTRAINT "CHK_scores_risque_raisons" CHECK (jsonb_typeof("raisons") = 'array'),
        CONSTRAINT "FK_scores_risque_inscription" FOREIGN KEY ("inscription_id")
          REFERENCES "inscriptions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scores_risque_inscription_date"
        ON "scores_risque" ("inscription_id", "date_calcul" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scores_risque_date" ON "scores_risque" ("date_calcul")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scores_risque_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scores_risque_inscription_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scores_risque"`);
  }
}
