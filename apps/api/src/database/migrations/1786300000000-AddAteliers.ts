import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-01 — Table `ateliers` (DS-13 partie 1, UC3 Formateur).
 *
 *  1. Type enum `ateliers_statut_enum` : BROUILLON, PUBLIE, ARCHIVE (réservé).
 *  2. `ateliers` : rattaché à un module (RESTRICT), créateur en SET NULL.
 *  3. CHECK sur les bornes, identiques à celles des DTO : titre 3–200,
 *     énoncé ≥ 10, compétences ≤ 2 000, taille 1–100 Mo, 1–10 fichiers,
 *     tolérance 0–168 h, au moins une extension, toutes dans la liste fermée.
 *
 * La règle « date limite dans le futur » n'est PAS un CHECK : elle dépend de
 * l'horloge (`now()` n'est pas autorisé dans un CHECK) et ne vaut qu'au moment
 * de l'enregistrement. Le service la vérifie avec l'horloge de PostgreSQL.
 *
 * Idempotence (CI / rejeu) : IF NOT EXISTS + garde sur le type.
 */
export class AddAteliers1786300000000 implements MigrationInterface {
  name = 'AddAteliers1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ateliers_statut_enum') THEN
          CREATE TYPE "public"."ateliers_statut_enum" AS ENUM('BROUILLON', 'PUBLIE', 'ARCHIVE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ateliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "module_id" uuid NOT NULL,
        "formateur_id" uuid,
        "titre" character varying(200) NOT NULL,
        "enonce" text NOT NULL,
        "competences_visees" text,
        "date_limite" TIMESTAMP WITH TIME ZONE NOT NULL,
        "types_livrables" character varying(10) array NOT NULL,
        "taille_max_mo" integer NOT NULL DEFAULT 20,
        "nb_max_fichiers" integer NOT NULL DEFAULT 1,
        "tolerance_retard_heures" integer NOT NULL DEFAULT 0,
        "statut" "public"."ateliers_statut_enum" NOT NULL DEFAULT 'BROUILLON',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ateliers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ateliers_module" FOREIGN KEY ("module_id")
          REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_ateliers_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "CHK_ateliers_titre" CHECK (char_length(btrim("titre")) >= 3),
        CONSTRAINT "CHK_ateliers_enonce" CHECK (char_length(btrim("enonce")) BETWEEN 10 AND 20000),
        CONSTRAINT "CHK_ateliers_competences" CHECK (
          "competences_visees" IS NULL OR char_length("competences_visees") <= 2000
        ),
        CONSTRAINT "CHK_ateliers_types_livrables" CHECK (
          cardinality("types_livrables") >= 1
          AND "types_livrables" <@ ARRAY['pdf', 'zip', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'png', 'jpg']::character varying(10)[]
        ),
        CONSTRAINT "CHK_ateliers_taille_max" CHECK ("taille_max_mo" BETWEEN 1 AND 100),
        CONSTRAINT "CHK_ateliers_nb_max_fichiers" CHECK ("nb_max_fichiers" BETWEEN 1 AND 10),
        CONSTRAINT "CHK_ateliers_tolerance" CHECK ("tolerance_retard_heures" BETWEEN 0 AND 168)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ateliers_module" ON "ateliers" ("module_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ateliers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ateliers_statut_enum"`);
  }
}
