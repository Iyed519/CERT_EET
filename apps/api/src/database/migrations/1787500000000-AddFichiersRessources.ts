import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-FORM-06 — Ressources de module : fichiers (révision v1.5 du Backlog).
 *
 *  1. Colonnes du fichier sur `ressources_module` : nom d'origine, extension
 *     (minuscules, 16 caractères au plus, éventuellement vide), type MIME
 *     servi, taille (octets, 1 octet – 1 Gio), SHA-256, clé de stockage
 *     (unique), mode de lecture (VIDEO, AUDIO, PDF, IMAGE ou null =
 *     téléchargement seul).
 *  2. CHK_ressources_lien (US-FORM-05) est REMPLACÉ par CHK_ressources_nature :
 *     un LIEN a son adresse et sa plateforme et AUCUNE colonne de fichier ; un
 *     FICHIER a toutes ses colonnes de fichier et ni adresse ni plateforme.
 *     CHK_ressources_video est remplacé pour accepter un fichier (pas de
 *     plateforme, pas de vidéo hébergée).
 *
 * Idempotence : ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS.
 * `down()` supprime les fichiers en base (les objets MinIO restent) et remet
 * les contraintes d'US-FORM-05.
 */
export class AddFichiersRessources1787500000000 implements MigrationInterface {
  name = 'AddFichiersRessources1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ressources_module"
        ADD COLUMN IF NOT EXISTS "nom_original" character varying(255),
        ADD COLUMN IF NOT EXISTS "extension" character varying(16),
        ADD COLUMN IF NOT EXISTS "type_mime" character varying(100),
        ADD COLUMN IF NOT EXISTS "taille_octets" bigint,
        ADD COLUMN IF NOT EXISTS "sha256" character(64),
        ADD COLUMN IF NOT EXISTS "cle_stockage" character varying(400),
        ADD COLUMN IF NOT EXISTS "lecture" character varying(10)
    `);
    await queryRunner.query(`
      ALTER TABLE "ressources_module"
        DROP CONSTRAINT IF EXISTS "UQ_ressources_cle_stockage",
        DROP CONSTRAINT IF EXISTS "CHK_ressources_lien",
        DROP CONSTRAINT IF EXISTS "CHK_ressources_nature",
        DROP CONSTRAINT IF EXISTS "CHK_ressources_video",
        DROP CONSTRAINT IF EXISTS "CHK_ressources_fichier"
    `);
    await queryRunner.query(`
      ALTER TABLE "ressources_module"
        ADD CONSTRAINT "UQ_ressources_cle_stockage" UNIQUE ("cle_stockage"),
        ADD CONSTRAINT "CHK_ressources_nature" CHECK (
          (
            "nature" = 'LIEN' AND "url" ~ '^https?://'
            AND "plateforme" IN ('YOUTUBE', 'VIMEO', 'WEB')
            AND "nom_original" IS NULL AND "extension" IS NULL AND "type_mime" IS NULL
            AND "taille_octets" IS NULL AND "sha256" IS NULL AND "cle_stockage" IS NULL
            AND "lecture" IS NULL
          ) OR (
            "nature" = 'FICHIER' AND "url" IS NULL AND "plateforme" IS NULL
            AND "video_id" IS NULL AND "debut_secondes" IS NULL
            AND "nom_original" IS NOT NULL AND "extension" IS NOT NULL AND "type_mime" IS NOT NULL
            AND "taille_octets" IS NOT NULL AND "sha256" IS NOT NULL AND "cle_stockage" IS NOT NULL
          )
        ),
        ADD CONSTRAINT "CHK_ressources_video" CHECK (
          "nature" = 'FICHIER'
          OR ("plateforme" = 'YOUTUBE' AND "video_id" ~ '^[A-Za-z0-9_-]{11}$')
          OR ("plateforme" = 'VIMEO' AND "video_id" ~ '^[0-9]{1,12}$')
          OR ("plateforme" = 'WEB' AND "video_id" IS NULL AND "debut_secondes" IS NULL)
        ),
        ADD CONSTRAINT "CHK_ressources_fichier" CHECK (
          "nature" <> 'FICHIER' OR (
            char_length(btrim("nom_original")) >= 1
            AND "extension" ~ '^[a-z0-9]{0,16}$'
            AND "taille_octets" BETWEEN 1 AND 1073741824
            AND "sha256" ~ '^[0-9a-f]{64}$'
            AND ("lecture" IS NULL OR "lecture" IN ('VIDEO', 'AUDIO', 'PDF', 'IMAGE'))
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ressources_module" WHERE "nature" = 'FICHIER'`);
    await queryRunner.query(`
      ALTER TABLE "ressources_module"
        DROP CONSTRAINT IF EXISTS "CHK_ressources_fichier",
        DROP CONSTRAINT IF EXISTS "CHK_ressources_nature",
        DROP CONSTRAINT IF EXISTS "CHK_ressources_video",
        DROP CONSTRAINT IF EXISTS "UQ_ressources_cle_stockage"
    `);
    await queryRunner.query(`
      ALTER TABLE "ressources_module"
        DROP COLUMN IF EXISTS "lecture",
        DROP COLUMN IF EXISTS "cle_stockage",
        DROP COLUMN IF EXISTS "sha256",
        DROP COLUMN IF EXISTS "taille_octets",
        DROP COLUMN IF EXISTS "type_mime",
        DROP COLUMN IF EXISTS "extension",
        DROP COLUMN IF EXISTS "nom_original"
    `);
    await queryRunner.query(`
      ALTER TABLE "ressources_module"
        ADD CONSTRAINT "CHK_ressources_lien" CHECK (
          "nature" = 'LIEN' AND "url" ~ '^https?://' AND "plateforme" IN ('YOUTUBE', 'VIMEO', 'WEB')
        ),
        ADD CONSTRAINT "CHK_ressources_video" CHECK (
          ("plateforme" = 'YOUTUBE' AND "video_id" ~ '^[A-Za-z0-9_-]{11}$')
          OR ("plateforme" = 'VIMEO' AND "video_id" ~ '^[0-9]{1,12}$')
          OR ("plateforme" = 'WEB' AND "video_id" IS NULL AND "debut_secondes" IS NULL)
        )
    `);
  }
}
