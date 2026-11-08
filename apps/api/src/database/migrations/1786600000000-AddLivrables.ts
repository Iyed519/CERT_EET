import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-04 — Livrables d'ateliers (DS-03 partie 1, UC4 Apprenant).
 *
 *  1. Type enum `livrables_statut_enum` : SOUMIS, EN_CORRECTION, NOTE.
 *  2. `livrables` : UN par (atelier, apprenant) (UNIQUE), FK RESTRICT vers
 *     l'atelier et l'apprenant ; version ≥ 1 ; hash SHA-256 en hexadécimal
 *     minuscule ; commentaire ≤ 2 000 caractères ; au plus 5 liens.
 *  3. `fichiers_livrables` : 1 à 10 fichiers par livrable (ordre 1–10, unique
 *     par livrable), CASCADE avec le livrable ; extension dans la liste fermée
 *     des ateliers ; taille de 1 octet à 100 Mo ; SHA-256 hexadécimal ; clé de
 *     stockage unique.
 *
 * Les bornes reprennent celles des règles pures (livrable.regles.ts) : une
 * écriture qui contournerait l'API ne peut pas créer un livrable incohérent.
 * Idempotence (CI / rejeu) : IF NOT EXISTS + garde sur le type.
 */
export class AddLivrables1786600000000 implements MigrationInterface {
  name = 'AddLivrables1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'livrables_statut_enum') THEN
          CREATE TYPE "public"."livrables_statut_enum" AS ENUM('SOUMIS', 'EN_CORRECTION', 'NOTE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "livrables" (
        "id" uuid NOT NULL,
        "atelier_id" uuid NOT NULL,
        "apprenant_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "statut" "public"."livrables_statut_enum" NOT NULL DEFAULT 'SOUMIS',
        "date_soumission" TIMESTAMP WITH TIME ZONE NOT NULL,
        "en_retard" boolean NOT NULL DEFAULT false,
        "hash_tracabilite" character(64) NOT NULL,
        "commentaire" text,
        "liens" character varying(500) array NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_livrables" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_livrables_atelier_apprenant" UNIQUE ("atelier_id", "apprenant_id"),
        CONSTRAINT "FK_livrables_atelier" FOREIGN KEY ("atelier_id")
          REFERENCES "ateliers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_livrables_apprenant" FOREIGN KEY ("apprenant_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_livrables_version" CHECK ("version" >= 1),
        CONSTRAINT "CHK_livrables_hash" CHECK ("hash_tracabilite" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_livrables_commentaire" CHECK (
          "commentaire" IS NULL OR char_length("commentaire") BETWEEN 1 AND 2000
        ),
        CONSTRAINT "CHK_livrables_liens" CHECK (cardinality("liens") <= 5)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fichiers_livrables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "livrable_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        "nom_original" character varying(255) NOT NULL,
        "extension" character varying(10) NOT NULL,
        "taille_octets" bigint NOT NULL,
        "sha256" character(64) NOT NULL,
        "cle_stockage" character varying(500) NOT NULL,
        CONSTRAINT "PK_fichiers_livrables" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fichiers_livrables_ordre" UNIQUE ("livrable_id", "ordre"),
        CONSTRAINT "UQ_fichiers_livrables_cle" UNIQUE ("cle_stockage"),
        CONSTRAINT "FK_fichiers_livrables_livrable" FOREIGN KEY ("livrable_id")
          REFERENCES "livrables"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_fichiers_livrables_ordre" CHECK ("ordre" BETWEEN 1 AND 10),
        CONSTRAINT "CHK_fichiers_livrables_nom" CHECK (char_length(btrim("nom_original")) >= 1),
        CONSTRAINT "CHK_fichiers_livrables_extension" CHECK ("extension" IN (
          'pdf', 'zip', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'png', 'jpg',
          'js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'sql', 'html', 'css', 'json', 'ipynb'
        )),
        CONSTRAINT "CHK_fichiers_livrables_taille" CHECK ("taille_octets" BETWEEN 1 AND 104857600),
        CONSTRAINT "CHK_fichiers_livrables_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "fichiers_livrables"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "livrables"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."livrables_statut_enum"`);
  }
}
