import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-RPT-01 (et US-RPT-02) — Rapports exportés, générés en arrière-plan.
 *
 *  1. Types `rapports_type_enum` (SESSION, INSTITUTIONNEL),
 *     `rapports_format_enum` (CSV, PDF), `rapports_statut_enum`
 *     (EN_ATTENTE, EN_COURS, PRET, ECHEC).
 *  2. Table `rapports` : demandeur (CASCADE : un rapport n'a de sens que pour
 *     lui), formation (CASCADE, obligatoire pour un rapport de session),
 *     paramètres (`jsonb`), fichier produit (nom, clé de stockage unique,
 *     taille, SHA-256), reprises (nombre, dernière erreur), dates.
 *     CHECK : un rapport PRET a son fichier et sa date de fin, et
 *     réciproquement ; un rapport de session a une formation.
 *  3. Index (demandeur, date de demande) : « Mes rapports ».
 *
 * Idempotence : gardes sur les types, IF NOT EXISTS. `down()` retire tout.
 */
export class AddRapports1788100000000 implements MigrationInterface {
  name = 'AddRapports1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rapports_type_enum') THEN
          CREATE TYPE "public"."rapports_type_enum" AS ENUM('SESSION', 'INSTITUTIONNEL');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rapports_format_enum') THEN
          CREATE TYPE "public"."rapports_format_enum" AS ENUM('CSV', 'PDF');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rapports_statut_enum') THEN
          CREATE TYPE "public"."rapports_statut_enum" AS ENUM('EN_ATTENTE', 'EN_COURS', 'PRET', 'ECHEC');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rapports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "public"."rapports_type_enum" NOT NULL,
        "format" "public"."rapports_format_enum" NOT NULL,
        "statut" "public"."rapports_statut_enum" NOT NULL DEFAULT 'EN_ATTENTE',
        "demandeur_id" uuid NOT NULL,
        "formation_id" uuid,
        "parametres" jsonb NOT NULL DEFAULT '{}',
        "nom_fichier" character varying(200),
        "cle_stockage" character varying(400),
        "taille_octets" integer,
        "empreinte_sha256" character(64),
        "nb_tentatives" integer NOT NULL DEFAULT 0,
        "derniere_erreur" text,
        "date_demande" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date_fin" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_rapports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rapports_cle_stockage" UNIQUE ("cle_stockage"),
        CONSTRAINT "FK_rapports_demandeur" FOREIGN KEY ("demandeur_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_rapports_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_rapports_fichier" CHECK (
          ("statut" = 'PRET' AND "cle_stockage" IS NOT NULL AND "date_fin" IS NOT NULL
             AND "taille_octets" IS NOT NULL AND "empreinte_sha256" IS NOT NULL)
          OR ("statut" <> 'PRET')
        ),
        CONSTRAINT "CHK_rapports_session" CHECK ("type" <> 'SESSION' OR "formation_id" IS NOT NULL),
        CONSTRAINT "CHK_rapports_empreinte" CHECK (
          "empreinte_sha256" IS NULL OR "empreinte_sha256" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_rapports_tentatives" CHECK ("nb_tentatives" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rapports_demandeur"
        ON "rapports" ("demandeur_id", "date_demande")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rapports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."rapports_statut_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."rapports_format_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."rapports_type_enum"`);
  }
}
