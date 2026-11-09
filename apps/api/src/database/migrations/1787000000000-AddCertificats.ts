import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-CERT-01 — Certificats (DS-04, ADR-04, ADR-10).
 *
 *  1. Type enum `certificats_statut_enum` : EN_ATTENTE_GENERATION,
 *     EN_GENERATION, ACTIF, REVOQUE (US-CERT-06).
 *  2. `certificats` : UN par (apprenant, formation) (UNIQUE) ; FK RESTRICT ;
 *     score 0–100, mention dans la liste fermée, organisme non vide ;
 *     clé de stockage unique ; empreinte SHA-256 hexadécimale ;
 *     nb_tentatives ≥ 0. CHECK : un certificat ACTIF ou REVOQUE porte sa clé,
 *     son empreinte et sa date de génération.
 *  3. Déclencheur `trg_certificats_actif_immuable` (BEFORE UPDATE, ligne
 *     ACTIF avant modification) : aucune donnée certifiante ne change ; le
 *     statut ne peut que passer à REVOQUE (US-CERT-06). La suppression reste
 *     possible (nettoyage des tests ; aucune route ne supprime un certificat).
 *
 * Idempotence : garde sur le type, IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
 * DROP TRIGGER IF EXISTS. `down()` retire tout.
 */
export class AddCertificats1787000000000 implements MigrationInterface {
  name = 'AddCertificats1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificats_statut_enum') THEN
          CREATE TYPE "public"."certificats_statut_enum" AS ENUM(
            'EN_ATTENTE_GENERATION', 'EN_GENERATION', 'ACTIF', 'REVOQUE'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "certificats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apprenant_id" uuid NOT NULL,
        "formation_id" uuid NOT NULL,
        "statut" "public"."certificats_statut_enum" NOT NULL DEFAULT 'EN_ATTENTE_GENERATION',
        "score_final" numeric(5,2) NOT NULL,
        "mention" character varying(20) NOT NULL,
        "organisme_emetteur" character varying(120) NOT NULL,
        "date_emission" TIMESTAMP WITH TIME ZONE NOT NULL,
        "date_generation" TIMESTAMP WITH TIME ZONE,
        "cle_stockage" character varying(200),
        "empreinte_sha256" character(64),
        "nb_tentatives" integer NOT NULL DEFAULT 0,
        "derniere_erreur" character varying(500),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_certificats" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_certificats_apprenant_formation" UNIQUE ("apprenant_id", "formation_id"),
        CONSTRAINT "UQ_certificats_cle_stockage" UNIQUE ("cle_stockage"),
        CONSTRAINT "FK_certificats_apprenant" FOREIGN KEY ("apprenant_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_certificats_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_certificats_score" CHECK ("score_final" BETWEEN 0 AND 100),
        CONSTRAINT "CHK_certificats_mention" CHECK (
          "mention" IN ('Passable', 'Assez bien', 'Bien', 'Très bien')
        ),
        CONSTRAINT "CHK_certificats_organisme" CHECK (char_length(btrim("organisme_emetteur")) >= 1),
        CONSTRAINT "CHK_certificats_empreinte" CHECK (
          "empreinte_sha256" IS NULL OR "empreinte_sha256" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_certificats_tentatives" CHECK ("nb_tentatives" >= 0),
        CONSTRAINT "CHK_certificats_genere" CHECK (
          "statut" NOT IN ('ACTIF', 'REVOQUE')
          OR ("cle_stockage" IS NOT NULL AND "empreinte_sha256" IS NOT NULL
              AND "date_generation" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION certificats_actif_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.statut NOT IN ('ACTIF', 'REVOQUE')
           OR NEW.apprenant_id IS DISTINCT FROM OLD.apprenant_id
           OR NEW.formation_id IS DISTINCT FROM OLD.formation_id
           OR NEW.score_final IS DISTINCT FROM OLD.score_final
           OR NEW.mention IS DISTINCT FROM OLD.mention
           OR NEW.organisme_emetteur IS DISTINCT FROM OLD.organisme_emetteur
           OR NEW.date_emission IS DISTINCT FROM OLD.date_emission
           OR NEW.date_generation IS DISTINCT FROM OLD.date_generation
           OR NEW.cle_stockage IS DISTINCT FROM OLD.cle_stockage
           OR NEW.empreinte_sha256 IS DISTINCT FROM OLD.empreinte_sha256
        THEN
          RAISE EXCEPTION
            'certificats : un certificat ACTIF est immuable (seule la révocation est permise, US-CERT-01 / NF3)'
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_certificats_actif_immuable ON certificats`);
    await queryRunner.query(`
      CREATE TRIGGER trg_certificats_actif_immuable
        BEFORE UPDATE ON certificats
        FOR EACH ROW
        WHEN (OLD.statut = 'ACTIF')
        EXECUTE FUNCTION certificats_actif_immuable();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_certificats_actif_immuable ON certificats`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS certificats_actif_immuable()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "certificats"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."certificats_statut_enum"`);
  }
}
