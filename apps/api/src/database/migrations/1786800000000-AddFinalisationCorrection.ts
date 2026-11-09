import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-07 — Finalisation d'une correction et feedback immuable (DS-03
 * partie 2, NF3).
 *
 *  1. `corrections` : `score_total` (0–100, deux décimales), `commentaire_general`
 *     (1–5 000 caractères), `date_finalisation`. CHECK de cohérence : une
 *     correction TERMINEE porte les trois ; une correction EN_COURS n'en porte
 *     aucun.
 *  2. Immuabilité AU NIVEAU DE LA BASE (même principe que les tentatives
 *     notées, migration 1786100000000) :
 *     - `trg_corrections_terminee_immuable` : BEFORE UPDATE d'une correction
 *       dont le statut AVANT modification est TERMINEE -> refus ;
 *     - `trg_notes_criteres_terminee_immuable` : BEFORE INSERT OR UPDATE d'une
 *       note dont la correction est TERMINEE -> refus ;
 *     - `trg_livrables_note_immuable` : BEFORE UPDATE d'un livrable NOTE ->
 *       refus.
 *     La suppression reste possible (nettoyage des tests, CASCADE depuis le
 *     livrable) : aucune route ne supprime un livrable, une correction ou
 *     une note.
 *
 * Idempotence : ADD COLUMN IF NOT EXISTS, contrainte posée si absente,
 * CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS. `down()` retire tout.
 */
export class AddFinalisationCorrection1786800000000 implements MigrationInterface {
  name = 'AddFinalisationCorrection1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "corrections"
        ADD COLUMN IF NOT EXISTS "score_total" numeric(5,2),
        ADD COLUMN IF NOT EXISTS "commentaire_general" text,
        ADD COLUMN IF NOT EXISTS "date_finalisation" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_corrections_score') THEN
          ALTER TABLE "corrections" ADD CONSTRAINT "CHK_corrections_score"
            CHECK ("score_total" IS NULL OR "score_total" BETWEEN 0 AND 100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_corrections_commentaire_general') THEN
          ALTER TABLE "corrections" ADD CONSTRAINT "CHK_corrections_commentaire_general"
            CHECK ("commentaire_general" IS NULL OR char_length("commentaire_general") BETWEEN 1 AND 5000);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_corrections_finalisation') THEN
          ALTER TABLE "corrections" ADD CONSTRAINT "CHK_corrections_finalisation" CHECK (
            ("statut" = 'TERMINEE' AND "score_total" IS NOT NULL
               AND "commentaire_general" IS NOT NULL AND "date_finalisation" IS NOT NULL)
            OR ("statut" = 'EN_COURS' AND "score_total" IS NULL
               AND "commentaire_general" IS NULL AND "date_finalisation" IS NULL)
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION corrections_terminee_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION
          'corrections : une correction TERMINEE (feedback envoyé) est immuable (US-ATEL-07 / NF3)'
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_corrections_terminee_immuable ON corrections`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_corrections_terminee_immuable
        BEFORE UPDATE ON corrections
        FOR EACH ROW
        WHEN (OLD.statut = 'TERMINEE')
        EXECUTE FUNCTION corrections_terminee_immuable();
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notes_criteres_terminee_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM corrections WHERE id = NEW.correction_id AND statut = 'TERMINEE')
           OR (TG_OP = 'UPDATE' AND EXISTS (
             SELECT 1 FROM corrections WHERE id = OLD.correction_id AND statut = 'TERMINEE'))
        THEN
          RAISE EXCEPTION
            'notes_criteres : la correction est finalisée, ses notes sont immuables (US-ATEL-07 / NF3)'
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notes_criteres_terminee_immuable ON notes_criteres`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_notes_criteres_terminee_immuable
        BEFORE INSERT OR UPDATE ON notes_criteres
        FOR EACH ROW
        EXECUTE FUNCTION notes_criteres_terminee_immuable();
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION livrables_note_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION
          'livrables : un livrable NOTE est immuable (US-ATEL-07 / NF3)'
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_livrables_note_immuable ON livrables`);
    await queryRunner.query(`
      CREATE TRIGGER trg_livrables_note_immuable
        BEFORE UPDATE ON livrables
        FOR EACH ROW
        WHEN (OLD.statut = 'NOTE')
        EXECUTE FUNCTION livrables_note_immuable();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_livrables_note_immuable ON livrables`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS livrables_note_immuable()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notes_criteres_terminee_immuable ON notes_criteres`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS notes_criteres_terminee_immuable()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_corrections_terminee_immuable ON corrections`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS corrections_terminee_immuable()`);
    await queryRunner.query(`
      ALTER TABLE "corrections"
        DROP CONSTRAINT IF EXISTS "CHK_corrections_finalisation",
        DROP CONSTRAINT IF EXISTS "CHK_corrections_commentaire_general",
        DROP CONSTRAINT IF EXISTS "CHK_corrections_score",
        DROP COLUMN IF EXISTS "date_finalisation",
        DROP COLUMN IF EXISTS "commentaire_general",
        DROP COLUMN IF EXISTS "score_total"
    `);
  }
}
