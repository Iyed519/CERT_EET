import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-IA-03 — Suggestions de questions produites par le pipeline RAG (DS-06,
 * état *SuggestionQuestionIA*).
 *
 *  1. Type enum `suggestions_questions_ia_statut_enum` : PROPOSEE, ACCEPTEE,
 *     MODIFIEE, REJETEE (les transitions sont US-IA-04).
 *  2. `suggestions_questions_ia` : partie de la génération (CASCADE) ; UNIQUE
 *     (génération, ordre) ; CHECK reprenant la validation du serveur — énoncé
 *     10–1 000 caractères, type QCU / QCM / VRAI_FAUX, 2 à 6 options (tableau
 *     JSON), Vrai/Faux = 2 options, score de confiance 0–1. Défense en
 *     profondeur : aucune suggestion malformée ne peut exister, même écrite à
 *     la main.
 *
 * Idempotence : garde sur le type, IF NOT EXISTS. `down()` retire tout.
 */
export class AddSuggestionsQuestionsIa1787600000000 implements MigrationInterface {
  name = 'AddSuggestionsQuestionsIa1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestions_questions_ia_statut_enum') THEN
          CREATE TYPE "public"."suggestions_questions_ia_statut_enum" AS ENUM(
            'PROPOSEE', 'ACCEPTEE', 'MODIFIEE', 'REJETEE'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suggestions_questions_ia" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "generation_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        "enonce" text NOT NULL,
        "type" character varying(10) NOT NULL,
        "options" jsonb NOT NULL,
        "explication" text,
        "score_confiance" numeric(3,2),
        "passages_sources" integer array NOT NULL DEFAULT '{}',
        "statut" "public"."suggestions_questions_ia_statut_enum" NOT NULL DEFAULT 'PROPOSEE',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_suggestions_questions_ia" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_suggestions_generation_ordre" UNIQUE ("generation_id", "ordre"),
        CONSTRAINT "FK_suggestions_generation" FOREIGN KEY ("generation_id")
          REFERENCES "generations_ia"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_suggestions_ordre" CHECK ("ordre" >= 1),
        CONSTRAINT "CHK_suggestions_enonce" CHECK (char_length(btrim("enonce")) BETWEEN 10 AND 1000),
        CONSTRAINT "CHK_suggestions_type" CHECK ("type" IN ('QCU', 'QCM', 'VRAI_FAUX')),
        CONSTRAINT "CHK_suggestions_options" CHECK (
          jsonb_typeof("options") = 'array'
          AND jsonb_array_length("options") BETWEEN 2 AND 6
          AND ("type" <> 'VRAI_FAUX' OR jsonb_array_length("options") = 2)
        ),
        CONSTRAINT "CHK_suggestions_score" CHECK (
          "score_confiance" IS NULL OR "score_confiance" BETWEEN 0 AND 1
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "suggestions_questions_ia"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."suggestions_questions_ia_statut_enum"`);
  }
}
