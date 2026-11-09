import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-FORM-05 — Ressources pédagogiques de module : liens (révision v1.5 du
 * Backlog ; US-FORM-06 y ajoutera les fichiers).
 *
 *  1. Type enum `ressources_module_nature_enum` : LIEN, FICHIER (la valeur
 *     FICHIER est réservée à US-FORM-06 : CHK_ressources_lien la refuse tant
 *     que ses colonnes n'existent pas).
 *  2. `ressources_module` : FK module CASCADE (partie du module), FK auteur
 *     RESTRICT ; UNIQUE (module, ordre) ; ordre ≥ 1 ; titre 1–200 ;
 *     description null ou 1–500 ; adresse http(s) ; plateforme YOUTUBE /
 *     VIMEO / WEB ; vidéo ⇔ identifiant (format contrôlé) ; début ≥ 0
 *     seulement pour une vidéo.
 *
 * Idempotence : garde sur le type, IF NOT EXISTS. `down()` retire tout.
 */
export class AddRessourcesModule1787400000000 implements MigrationInterface {
  name = 'AddRessourcesModule1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ressources_module_nature_enum') THEN
          CREATE TYPE "public"."ressources_module_nature_enum" AS ENUM('LIEN', 'FICHIER');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ressources_module" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "module_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        "nature" "public"."ressources_module_nature_enum" NOT NULL,
        "titre" character varying(200) NOT NULL,
        "description" character varying(500),
        "url" character varying(2048),
        "plateforme" character varying(10),
        "video_id" character varying(32),
        "debut_secondes" integer,
        "ajoute_par" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ressources_module" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ressources_module_ordre" UNIQUE ("module_id", "ordre"),
        CONSTRAINT "FK_ressources_module" FOREIGN KEY ("module_id")
          REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_ressources_ajoute_par" FOREIGN KEY ("ajoute_par")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_ressources_ordre" CHECK ("ordre" >= 1),
        CONSTRAINT "CHK_ressources_titre" CHECK (char_length(btrim("titre")) >= 1),
        CONSTRAINT "CHK_ressources_description" CHECK (
          "description" IS NULL OR char_length(btrim("description")) >= 1
        ),
        CONSTRAINT "CHK_ressources_lien" CHECK (
          "nature" = 'LIEN' AND "url" ~ '^https?://' AND "plateforme" IN ('YOUTUBE', 'VIMEO', 'WEB')
        ),
        CONSTRAINT "CHK_ressources_video" CHECK (
          ("plateforme" = 'YOUTUBE' AND "video_id" ~ '^[A-Za-z0-9_-]{11}$')
          OR ("plateforme" = 'VIMEO' AND "video_id" ~ '^[0-9]{1,12}$')
          OR ("plateforme" = 'WEB' AND "video_id" IS NULL AND "debut_secondes" IS NULL)
        ),
        CONSTRAINT "CHK_ressources_debut" CHECK ("debut_secondes" IS NULL OR "debut_secondes" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ressources_module"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ressources_module_nature_enum"`);
  }
}
