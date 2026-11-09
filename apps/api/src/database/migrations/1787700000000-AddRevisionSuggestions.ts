import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-IA-04 — Révision humaine des suggestions de questions (DS-06 P3, état
 * *SuggestionQuestionIA* : PROPOSEE -> ACCEPTEE / MODIFIEE / REJETEE).
 *
 *  1. `questions.origine` (MANUELLE par défaut, IA, IA_MODIFIEE) : l'origine
 *     d'une question reste lisible dans le QCM.
 *  2. `suggestions_questions_ia` : décision (`question_id` créée, `qcm_id`
 *     cible, `decide_par`, `date_decision`, `motif_rejet`). La question et le
 *     QCM peuvent être supprimés plus tard (SET NULL) : la décision reste.
 *  3. CHECK `CHK_suggestions_decision` : une suggestion PROPOSEE n'a ni
 *     question, ni QCM, ni décideur — elle ne peut donc **jamais** être
 *     reliée à un QCM ; ACCEPTEE / MODIFIEE : décideur et date ; REJETEE :
 *     décideur et date, sans question ni QCM. Une question ne vient que d'une
 *     suggestion (UNIQUE).
 *  4. Déclencheur `trg_suggestions_transitions` : une suggestion naît
 *     PROPOSEE ; son contenu (énoncé, type, options, explication, score,
 *     passages, génération, ordre) ne change jamais ; une décision ne se prend
 *     qu'une fois, depuis PROPOSEE ; une fois décidée, seule la remise à NULL
 *     de la question ou du QCM (suppression ultérieure) est permise.
 *
 * Idempotence : gardes sur le type et les colonnes, CREATE OR REPLACE,
 * DROP ... IF EXISTS. `down()` retire tout.
 */
export class AddRevisionSuggestions1787700000000 implements MigrationInterface {
  name = 'AddRevisionSuggestions1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'questions_origine_enum') THEN
          CREATE TYPE "public"."questions_origine_enum" AS ENUM('MANUELLE', 'IA', 'IA_MODIFIEE');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "questions"
        ADD COLUMN IF NOT EXISTS "origine" "public"."questions_origine_enum" NOT NULL DEFAULT 'MANUELLE'
    `);
    await queryRunner.query(`
      ALTER TABLE "suggestions_questions_ia"
        ADD COLUMN IF NOT EXISTS "question_id" uuid,
        ADD COLUMN IF NOT EXISTS "qcm_id" uuid,
        ADD COLUMN IF NOT EXISTS "decide_par" uuid,
        ADD COLUMN IF NOT EXISTS "date_decision" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "motif_rejet" text
    `);
    await queryRunner.query(`
      ALTER TABLE "suggestions_questions_ia"
        DROP CONSTRAINT IF EXISTS "UQ_suggestions_question",
        DROP CONSTRAINT IF EXISTS "FK_suggestions_question",
        DROP CONSTRAINT IF EXISTS "FK_suggestions_qcm",
        DROP CONSTRAINT IF EXISTS "FK_suggestions_decide_par",
        DROP CONSTRAINT IF EXISTS "CHK_suggestions_decision",
        DROP CONSTRAINT IF EXISTS "CHK_suggestions_motif_rejet",
        ADD CONSTRAINT "UQ_suggestions_question" UNIQUE ("question_id"),
        ADD CONSTRAINT "FK_suggestions_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_suggestions_qcm" FOREIGN KEY ("qcm_id")
          REFERENCES "qcm"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_suggestions_decide_par" FOREIGN KEY ("decide_par")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        ADD CONSTRAINT "CHK_suggestions_decision" CHECK (
          ("statut" = 'PROPOSEE' AND "question_id" IS NULL AND "qcm_id" IS NULL
            AND "decide_par" IS NULL AND "date_decision" IS NULL AND "motif_rejet" IS NULL)
          OR ("statut" IN ('ACCEPTEE', 'MODIFIEE') AND "decide_par" IS NOT NULL
            AND "date_decision" IS NOT NULL AND "motif_rejet" IS NULL)
          OR ("statut" = 'REJETEE' AND "question_id" IS NULL AND "qcm_id" IS NULL
            AND "decide_par" IS NOT NULL AND "date_decision" IS NOT NULL)
        ),
        ADD CONSTRAINT "CHK_suggestions_motif_rejet" CHECK (
          "motif_rejet" IS NULL OR char_length(btrim("motif_rejet")) BETWEEN 1 AND 500
        )
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION suggestions_garde_transitions()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.statut <> 'PROPOSEE' THEN
            RAISE EXCEPTION 'Une suggestion de question naît PROPOSEE.'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.generation_id IS DISTINCT FROM OLD.generation_id
          OR NEW.ordre IS DISTINCT FROM OLD.ordre
          OR NEW.enonce IS DISTINCT FROM OLD.enonce
          OR NEW.type IS DISTINCT FROM OLD.type
          OR NEW.options IS DISTINCT FROM OLD.options
          OR NEW.explication IS DISTINCT FROM OLD.explication
          OR NEW.score_confiance IS DISTINCT FROM OLD.score_confiance
          OR NEW.passages_sources IS DISTINCT FROM OLD.passages_sources THEN
          RAISE EXCEPTION 'Le contenu d''une suggestion de question ne change pas : la version modifiée est la question créée.'
            USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.statut <> 'PROPOSEE' AND (
          NEW.statut IS DISTINCT FROM OLD.statut
          OR NEW.decide_par IS DISTINCT FROM OLD.decide_par
          OR NEW.date_decision IS DISTINCT FROM OLD.date_decision
          OR NEW.motif_rejet IS DISTINCT FROM OLD.motif_rejet
          OR (NEW.question_id IS DISTINCT FROM OLD.question_id AND NEW.question_id IS NOT NULL)
          OR (NEW.qcm_id IS DISTINCT FROM OLD.qcm_id AND NEW.qcm_id IS NOT NULL)
        ) THEN
          RAISE EXCEPTION 'Une suggestion de question déjà décidée ne change plus.'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_suggestions_transitions ON "suggestions_questions_ia"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_suggestions_transitions
        BEFORE INSERT OR UPDATE ON "suggestions_questions_ia"
        FOR EACH ROW EXECUTE FUNCTION suggestions_garde_transitions()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_suggestions_transitions ON "suggestions_questions_ia"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS suggestions_garde_transitions()`);
    await queryRunner.query(`
      ALTER TABLE "suggestions_questions_ia"
        DROP CONSTRAINT IF EXISTS "CHK_suggestions_motif_rejet",
        DROP CONSTRAINT IF EXISTS "CHK_suggestions_decision",
        DROP CONSTRAINT IF EXISTS "FK_suggestions_decide_par",
        DROP CONSTRAINT IF EXISTS "FK_suggestions_qcm",
        DROP CONSTRAINT IF EXISTS "FK_suggestions_question",
        DROP CONSTRAINT IF EXISTS "UQ_suggestions_question",
        DROP COLUMN IF EXISTS "motif_rejet",
        DROP COLUMN IF EXISTS "date_decision",
        DROP COLUMN IF EXISTS "decide_par",
        DROP COLUMN IF EXISTS "qcm_id",
        DROP COLUMN IF EXISTS "question_id"
    `);
    await queryRunner.query(`ALTER TABLE "questions" DROP COLUMN IF EXISTS "origine"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."questions_origine_enum"`);
  }
}
