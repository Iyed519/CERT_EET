import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-INSC-02 — Gérer les inscriptions (administrateur) : suspension motivée.
 *
 *  Colonnes de `inscriptions` (toutes facultatives) :
 *   - `motif_suspension` (1 à 500 caractères) ;
 *   - `date_suspension` ;
 *   - `suspendue_par` (SET NULL : la suspension reste si le compte disparaît).
 *  CHECK : un motif n'existe que sur une inscription SUSPENDUE (la
 *  réactivation l'efface). Pas de CHECK inverse : des inscriptions
 *  SUSPENDUE antérieures (US-INSC-01, jeux de test) n'ont pas de motif.
 *
 * Idempotence : IF NOT EXISTS, garde sur les contraintes. `down()` retire tout.
 */
export class AddSuspensionInscriptions1788200000000 implements MigrationInterface {
  name = 'AddSuspensionInscriptions1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inscriptions"
        ADD COLUMN IF NOT EXISTS "motif_suspension" character varying(500),
        ADD COLUMN IF NOT EXISTS "date_suspension" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "suspendue_par" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_inscriptions_suspendue_par') THEN
          ALTER TABLE "inscriptions" ADD CONSTRAINT "FK_inscriptions_suspendue_par"
            FOREIGN KEY ("suspendue_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_inscriptions_motif_suspension') THEN
          ALTER TABLE "inscriptions" ADD CONSTRAINT "CHK_inscriptions_motif_suspension" CHECK (
            "motif_suspension" IS NULL
            OR ("statut" = 'SUSPENDUE' AND char_length(btrim("motif_suspension")) BETWEEN 1 AND 500)
          );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inscriptions" DROP CONSTRAINT IF EXISTS "CHK_inscriptions_motif_suspension"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inscriptions" DROP CONSTRAINT IF EXISTS "FK_inscriptions_suspendue_par"`,
    );
    await queryRunner.query(`
      ALTER TABLE "inscriptions"
        DROP COLUMN IF EXISTS "suspendue_par",
        DROP COLUMN IF EXISTS "date_suspension",
        DROP COLUMN IF EXISTS "motif_suspension"
    `);
  }
}
