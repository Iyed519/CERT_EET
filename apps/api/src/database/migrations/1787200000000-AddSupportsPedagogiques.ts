import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-IA-01 — Supports pédagogiques et segments vectorisés (DS-06 partie 1,
 * AC-04, ADR-05 : RAG sur pgvector).
 *
 *  1. Extension `vector` (pgvector ; l'image Postgres du projet est
 *     `pgvector/pgvector:pg16`, en local comme en CI).
 *  2. Type enum `supports_pedagogiques_statut_enum` : EN_INDEXATION, INDEXE,
 *     ECHEC_INDEXATION.
 *  3. `supports_pedagogiques` : FK RESTRICT vers le module et le déposant ;
 *     UN même fichier par module (UNIQUE module × sha256) ; clé de stockage
 *     unique ; extension dans la liste fermée ; taille 1 octet – 20 Mo ;
 *     titre non vide ; SHA-256 hexadécimal ; compteurs ≥ 0.
 *     CHECK : INDEXE ⇔ (segments > 0, caractères > 0, modèle, date
 *     d'indexation) — aucun support « indexé » sans vecteurs.
 *  4. `segments_support` : passages du support (ordre ≥ 1, texte non vide,
 *     embedding `vector(384)`), UNIQUE (support, ordre), CASCADE (un segment
 *     n'existe pas sans son support). Index HNSW en distance cosinus : la
 *     recherche des passages proches (US-IA-03) reste rapide quand les
 *     supports s'accumulent.
 *
 * Idempotence : IF NOT EXISTS partout, garde sur le type. `down()` retire tout,
 * extension comprise (aucune autre table ne l'utilise).
 */
export class AddSupportsPedagogiques1787200000000 implements MigrationInterface {
  name = 'AddSupportsPedagogiques1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supports_pedagogiques_statut_enum') THEN
          CREATE TYPE "public"."supports_pedagogiques_statut_enum" AS ENUM(
            'EN_INDEXATION', 'INDEXE', 'ECHEC_INDEXATION'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supports_pedagogiques" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "module_id" uuid NOT NULL,
        "depose_par" uuid NOT NULL,
        "titre" character varying(200) NOT NULL,
        "nom_original" character varying(255) NOT NULL,
        "extension" character varying(8) NOT NULL,
        "taille_octets" integer NOT NULL,
        "sha256" character(64) NOT NULL,
        "cle_stockage" character varying(400) NOT NULL,
        "statut" "public"."supports_pedagogiques_statut_enum" NOT NULL DEFAULT 'EN_INDEXATION',
        "nb_segments" integer,
        "nb_caracteres" integer,
        "modele_embeddings" character varying(100),
        "nb_tentatives" integer NOT NULL DEFAULT 0,
        "derniere_erreur" character varying(500),
        "date_depot" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date_indexation" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supports_pedagogiques" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_supports_module_sha256" UNIQUE ("module_id", "sha256"),
        CONSTRAINT "UQ_supports_cle_stockage" UNIQUE ("cle_stockage"),
        CONSTRAINT "FK_supports_module" FOREIGN KEY ("module_id")
          REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_supports_depose_par" FOREIGN KEY ("depose_par")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_supports_titre" CHECK (char_length(btrim("titre")) >= 1),
        CONSTRAINT "CHK_supports_nom" CHECK (char_length(btrim("nom_original")) >= 1),
        CONSTRAINT "CHK_supports_extension" CHECK (
          "extension" IN ('pdf', 'txt', 'md', 'pptx', 'docx')
        ),
        CONSTRAINT "CHK_supports_taille" CHECK ("taille_octets" BETWEEN 1 AND 20971520),
        CONSTRAINT "CHK_supports_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_supports_tentatives" CHECK ("nb_tentatives" >= 0),
        CONSTRAINT "CHK_supports_compteurs" CHECK (
          ("nb_segments" IS NULL OR "nb_segments" >= 1)
          AND ("nb_caracteres" IS NULL OR "nb_caracteres" >= 1)
        ),
        CONSTRAINT "CHK_supports_indexe" CHECK (
          ("statut" = 'INDEXE') = (
            "nb_segments" IS NOT NULL AND "nb_caracteres" IS NOT NULL
            AND "modele_embeddings" IS NOT NULL AND "date_indexation" IS NOT NULL
          )
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_supports_module_statut"
        ON "supports_pedagogiques" ("module_id", "statut")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "segments_support" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "support_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        "texte" text NOT NULL,
        "embedding" vector(384) NOT NULL,
        CONSTRAINT "PK_segments_support" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_segments_support_ordre" UNIQUE ("support_id", "ordre"),
        CONSTRAINT "FK_segments_support" FOREIGN KEY ("support_id")
          REFERENCES "supports_pedagogiques"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_segments_ordre" CHECK ("ordre" >= 1),
        CONSTRAINT "CHK_segments_texte" CHECK (char_length(btrim("texte")) >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_segments_support_embedding"
        ON "segments_support" USING hnsw ("embedding" vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "segments_support"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "supports_pedagogiques"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."supports_pedagogiques_statut_enum"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
