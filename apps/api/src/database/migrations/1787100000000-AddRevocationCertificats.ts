import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-CERT-06 — Révocation d'un certificat (DS-07, NF3).
 *
 *  1. Type enum `certificats_motif_revocation_enum` (FRAUDE, ERREUR_ADMIN,
 *     DISCIPLINAIRE, JUDICIAIRE).
 *  2. `certificats` : `date_revocation`, `motif_revocation`,
 *     `description_revocation` (10–2 000 caractères), `revoque_par` (FK
 *     users RESTRICT). CHECK : un certificat REVOQUE porte les quatre ; tout
 *     autre statut n'en porte aucun.
 *  3. Le déclencheur d'immuabilité couvre désormais ACTIF ET REVOQUE :
 *     - ACTIF : aucune donnée certifiante ne change ; seul le passage à
 *       REVOQUE est permis (avec ses quatre colonnes, CHECK) ;
 *     - REVOQUE : AUCUNE modification — la révocation est irréversible.
 *     Le PDF, la clé et l'empreinte sont conservés (DS-07). La suppression
 *     reste possible (nettoyage des tests ; aucune route ne supprime).
 *
 * Idempotence : garde sur le type, ADD COLUMN IF NOT EXISTS, contrainte posée
 * si absente, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS. `down()`
 * rétablit le déclencheur de 1787000000000 et retire le reste.
 */
export class AddRevocationCertificats1787100000000 implements MigrationInterface {
  name = 'AddRevocationCertificats1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificats_motif_revocation_enum') THEN
          CREATE TYPE "public"."certificats_motif_revocation_enum" AS ENUM(
            'FRAUDE', 'ERREUR_ADMIN', 'DISCIPLINAIRE', 'JUDICIAIRE'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "certificats"
        ADD COLUMN IF NOT EXISTS "date_revocation" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "motif_revocation" "public"."certificats_motif_revocation_enum",
        ADD COLUMN IF NOT EXISTS "description_revocation" text,
        ADD COLUMN IF NOT EXISTS "revoque_par" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_certificats_revoque_par') THEN
          ALTER TABLE "certificats" ADD CONSTRAINT "FK_certificats_revoque_par"
            FOREIGN KEY ("revoque_par") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_certificats_description_revocation') THEN
          ALTER TABLE "certificats" ADD CONSTRAINT "CHK_certificats_description_revocation" CHECK (
            "description_revocation" IS NULL
            OR char_length(btrim("description_revocation")) BETWEEN 10 AND 2000
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_certificats_revocation') THEN
          ALTER TABLE "certificats" ADD CONSTRAINT "CHK_certificats_revocation" CHECK (
            ("statut" = 'REVOQUE' AND "date_revocation" IS NOT NULL AND "motif_revocation" IS NOT NULL
               AND "description_revocation" IS NOT NULL AND "revoque_par" IS NOT NULL)
            OR ("statut" <> 'REVOQUE' AND "date_revocation" IS NULL AND "motif_revocation" IS NULL
               AND "description_revocation" IS NULL AND "revoque_par" IS NULL)
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION certificats_actif_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.statut = 'REVOQUE' THEN
          RAISE EXCEPTION
            'certificats : une révocation est irréversible (US-CERT-06 / NF3)'
            USING ERRCODE = 'restrict_violation';
        END IF;
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
        WHEN (OLD.statut IN ('ACTIF', 'REVOQUE'))
        EXECUTE FUNCTION certificats_actif_immuable();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Déclencheur de 1787000000000 (ACTIF seulement, sans branche REVOQUE).
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
    await queryRunner.query(`
      ALTER TABLE "certificats"
        DROP CONSTRAINT IF EXISTS "CHK_certificats_revocation",
        DROP CONSTRAINT IF EXISTS "CHK_certificats_description_revocation",
        DROP CONSTRAINT IF EXISTS "FK_certificats_revoque_par",
        DROP COLUMN IF EXISTS "revoque_par",
        DROP COLUMN IF EXISTS "description_revocation",
        DROP COLUMN IF EXISTS "motif_revocation",
        DROP COLUMN IF EXISTS "date_revocation"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."certificats_motif_revocation_enum"`);
  }
}
