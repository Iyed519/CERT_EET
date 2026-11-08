import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-02 — Grille de notation pondérée (DS-13 partie 2, UC4 Formateur).
 *
 *  1. `grilles` : soit la grille de travail d'UN atelier (`atelier_id` unique,
 *     CASCADE : la grille d'un brouillon supprimé part avec lui), soit un
 *     MODÈLE réutilisable (sans atelier, avec un nom). Le CHECK
 *     `CHK_grilles_nature` interdit tout mélange ; un modèle n'est jamais
 *     « validé » (seule la grille d'un atelier l'est). Nom de modèle unique par
 *     formateur, sans tenir compte de la casse (index partiel).
 *  2. `criteres` : intitulé 3–200, pondération entière 1–100 %, description
 *     ≤ 2 000, ordre ≥ 1 unique par grille (contrainte DIFFÉRÉE : un
 *     réordonnancement permute les rangs dans une seule transaction).
 *  3. `niveaux_performance` : exactement les 4 niveaux Insuffisant /
 *     Acceptable / Bon / Excellent (libellé lié au rang), plage de points en
 *     % du critère (0–100, min < max), descripteur ≤ 1 000.
 *
 * Les règles qui portent sur PLUSIEURS lignes (Σ pondérations ≤ 100, plages
 * contiguës couvrant 0–100, exactement 4 niveaux) ne peuvent pas être des
 * CHECK : le service les vérifie sous verrou (grille.regles.ts).
 *
 * Idempotence (CI / rejeu) : IF NOT EXISTS.
 */
export class AddGrillesNotation1786500000000 implements MigrationInterface {
  name = 'AddGrillesNotation1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "grilles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "atelier_id" uuid,
        "formateur_id" uuid,
        "validee" boolean NOT NULL DEFAULT false,
        "est_modele" boolean NOT NULL DEFAULT false,
        "nom_modele" character varying(120),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_grilles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_grilles_atelier" UNIQUE ("atelier_id"),
        CONSTRAINT "FK_grilles_atelier" FOREIGN KEY ("atelier_id")
          REFERENCES "ateliers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_grilles_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "CHK_grilles_nature" CHECK (
          ("est_modele" AND "atelier_id" IS NULL AND "nom_modele" IS NOT NULL AND NOT "validee")
          OR (NOT "est_modele" AND "atelier_id" IS NOT NULL AND "nom_modele" IS NULL)
        ),
        CONSTRAINT "CHK_grilles_nom_modele" CHECK (
          "nom_modele" IS NULL OR char_length(btrim("nom_modele")) BETWEEN 3 AND 120
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_grilles_nom_modele_formateur"
        ON "grilles" ("formateur_id", lower("nom_modele")) WHERE "est_modele"
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "criteres" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "grille_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        "intitule" character varying(200) NOT NULL,
        "ponderation" integer NOT NULL,
        "description" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_criteres" PRIMARY KEY ("id"),
        CONSTRAINT "FK_criteres_grille" FOREIGN KEY ("grille_id")
          REFERENCES "grilles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "UQ_criteres_grille_ordre" UNIQUE ("grille_id", "ordre")
          DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT "CHK_criteres_ordre" CHECK ("ordre" >= 1),
        CONSTRAINT "CHK_criteres_intitule" CHECK (char_length(btrim("intitule")) >= 3),
        CONSTRAINT "CHK_criteres_ponderation" CHECK ("ponderation" BETWEEN 1 AND 100),
        CONSTRAINT "CHK_criteres_description" CHECK (
          "description" IS NULL OR char_length("description") <= 2000
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "niveaux_performance" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "critere_id" uuid NOT NULL,
        "ordre" smallint NOT NULL,
        "libelle" character varying(20) NOT NULL,
        "points_min_pct" integer NOT NULL,
        "points_max_pct" integer NOT NULL,
        "descripteur" text,
        CONSTRAINT "PK_niveaux_performance" PRIMARY KEY ("id"),
        CONSTRAINT "FK_niveaux_performance_critere" FOREIGN KEY ("critere_id")
          REFERENCES "criteres"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "UQ_niveaux_performance_critere_ordre" UNIQUE ("critere_id", "ordre"),
        CONSTRAINT "CHK_niveaux_performance_libelle" CHECK (
          ("ordre" = 1 AND "libelle" = 'Insuffisant')
          OR ("ordre" = 2 AND "libelle" = 'Acceptable')
          OR ("ordre" = 3 AND "libelle" = 'Bon')
          OR ("ordre" = 4 AND "libelle" = 'Excellent')
        ),
        CONSTRAINT "CHK_niveaux_performance_plage" CHECK (
          "points_min_pct" >= 0 AND "points_max_pct" <= 100
          AND "points_min_pct" < "points_max_pct"
        ),
        CONSTRAINT "CHK_niveaux_performance_descripteur" CHECK (
          "descripteur" IS NULL OR char_length("descripteur") <= 1000
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "niveaux_performance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "criteres"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_grilles_nom_modele_formateur"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "grilles"`);
  }
}
