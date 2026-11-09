import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-IA-02 — Générations de questions par IA (DS-06 partie 2).
 *
 *  1. Type enum `generations_ia_statut_enum` : EN_COURS, TERMINEE, ECHEC.
 *  2. `generations_ia` : FK RESTRICT vers le module, le support (un support
 *     qui a servi ne se supprime plus) et le formateur ; nombre demandé 1–20 ;
 *     types non vides, sans doublon, pris dans QCU / QCM / VRAI_FAUX ; niveau
 *     dans la liste fermée ; thème de 200 caractères au plus (null ou non
 *     vide) ; compteurs ≥ 0 ; suggestions ≤ demandées.
 *     CHECK : TERMINEE ⇒ date de fin, nombre de suggestions et de rejets ;
 *     ECHEC ⇒ date de fin et motif ; EN_COURS ⇒ pas de date de fin.
 *  3. Index unique PARTIEL (formateur) WHERE statut = 'EN_COURS' : une seule
 *     génération en cours par formateur, garanti par la base même si deux
 *     lancements arrivent ensemble.
 *
 * Idempotence : garde sur le type, IF NOT EXISTS. `down()` retire tout.
 */
export class AddGenerationsIa1787300000000 implements MigrationInterface {
  name = 'AddGenerationsIa1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'generations_ia_statut_enum') THEN
          CREATE TYPE "public"."generations_ia_statut_enum" AS ENUM('EN_COURS', 'TERMINEE', 'ECHEC');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "generations_ia" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "module_id" uuid NOT NULL,
        "support_id" uuid NOT NULL,
        "formateur_id" uuid NOT NULL,
        "nb_questions_demandees" integer NOT NULL,
        "types_questions" character varying array NOT NULL,
        "niveau" character varying(20) NOT NULL,
        "focus_thematique" character varying(200),
        "statut" "public"."generations_ia_statut_enum" NOT NULL DEFAULT 'EN_COURS',
        "modele_llm" character varying(100),
        "nb_suggestions" integer,
        "nb_invalides" integer,
        "nb_tentatives" integer NOT NULL DEFAULT 0,
        "derniere_erreur" character varying(500),
        "date_lancement" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date_fin" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_generations_ia" PRIMARY KEY ("id"),
        CONSTRAINT "FK_generations_module" FOREIGN KEY ("module_id")
          REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_generations_support" FOREIGN KEY ("support_id")
          REFERENCES "supports_pedagogiques"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_generations_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_generations_nb" CHECK ("nb_questions_demandees" BETWEEN 1 AND 20),
        CONSTRAINT "CHK_generations_types" CHECK (
          cardinality("types_questions") BETWEEN 1 AND 3
          AND "types_questions" <@ ARRAY['QCU', 'QCM', 'VRAI_FAUX']::varchar[]
          AND cardinality(array_positions("types_questions", 'QCU'::varchar)) <= 1
          AND cardinality(array_positions("types_questions", 'QCM'::varchar)) <= 1
          AND cardinality(array_positions("types_questions", 'VRAI_FAUX'::varchar)) <= 1
        ),
        CONSTRAINT "CHK_generations_niveau" CHECK (
          "niveau" IN ('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE')
        ),
        CONSTRAINT "CHK_generations_focus" CHECK (
          "focus_thematique" IS NULL OR char_length(btrim("focus_thematique")) >= 1
        ),
        CONSTRAINT "CHK_generations_compteurs" CHECK (
          "nb_tentatives" >= 0
          AND ("nb_suggestions" IS NULL OR "nb_suggestions" BETWEEN 0 AND "nb_questions_demandees")
          AND ("nb_invalides" IS NULL OR "nb_invalides" >= 0)
        ),
        CONSTRAINT "CHK_generations_terminee" CHECK (
          "statut" <> 'TERMINEE' OR (
            "date_fin" IS NOT NULL AND "nb_suggestions" IS NOT NULL AND "nb_invalides" IS NOT NULL
          )
        ),
        CONSTRAINT "CHK_generations_echec" CHECK (
          "statut" <> 'ECHEC' OR ("date_fin" IS NOT NULL AND "derniere_erreur" IS NOT NULL)
        ),
        CONSTRAINT "CHK_generations_en_cours" CHECK (
          "statut" <> 'EN_COURS' OR "date_fin" IS NULL
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_generations_une_en_cours_par_formateur"
        ON "generations_ia" ("formateur_id") WHERE "statut" = 'EN_COURS'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_generations_module_date"
        ON "generations_ia" ("module_id", "date_lancement" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "generations_ia"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."generations_ia_statut_enum"`);
  }
}
