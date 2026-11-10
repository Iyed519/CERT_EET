import { MigrationInterface, QueryRunner } from 'typeorm';

/** Corps commun des deux versions du déclencheur (avant / après US-CERT-07). */
const CHAMPS_CERTIFIANTS = `
           OR NEW.apprenant_id IS DISTINCT FROM OLD.apprenant_id
           OR NEW.formation_id IS DISTINCT FROM OLD.formation_id
           OR NEW.score_final IS DISTINCT FROM OLD.score_final
           OR NEW.mention IS DISTINCT FROM OLD.mention
           OR NEW.organisme_emetteur IS DISTINCT FROM OLD.organisme_emetteur
           OR NEW.date_emission IS DISTINCT FROM OLD.date_emission
           OR NEW.date_generation IS DISTINCT FROM OLD.date_generation
           OR NEW.cle_stockage IS DISTINCT FROM OLD.cle_stockage
           OR NEW.empreinte_sha256 IS DISTINCT FROM OLD.empreinte_sha256`;

/**
 * US-CERT-07 — Expiration automatique des certificats.
 *
 *  1. Valeur `EXPIRE` du type `certificats_statut_enum` (ADD VALUE IF NOT
 *     EXISTS ; une valeur d'enum ne se retire pas : `down()` la laisse).
 *  2. `formations.duree_validite_mois` (facultative, 1 à 120) : durée de
 *     validité des certificats de la formation ; vide = sans expiration.
 *  3. `certificats.date_expiration` (facultative), fixée à la demande
 *     d'émission, jamais modifiée ensuite (champ certifiant).
 *  4. Déclencheur d'immuabilité : ACTIF -> REVOQUE (existant) ou ACTIF ->
 *     EXPIRE, sans toucher aux données certifiantes (dont la date
 *     d'expiration) ; REVOQUE et EXPIRE sont définitifs.
 *
 * Idempotence : IF NOT EXISTS, garde sur la contrainte, CREATE OR REPLACE.
 */
export class AddExpirationCertificats1788400000000 implements MigrationInterface {
  name = 'AddExpirationCertificats1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."certificats_statut_enum" ADD VALUE IF NOT EXISTS 'EXPIRE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "formations" ADD COLUMN IF NOT EXISTS "duree_validite_mois" integer`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_formations_duree_validite') THEN
          ALTER TABLE "formations" ADD CONSTRAINT "CHK_formations_duree_validite"
            CHECK ("duree_validite_mois" IS NULL OR "duree_validite_mois" BETWEEN 1 AND 120);
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "certificats" ADD COLUMN IF NOT EXISTS "date_expiration" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_certificats_expiration_actifs"
        ON "certificats" ("date_expiration") WHERE "statut" = 'ACTIF' AND "date_expiration" IS NOT NULL
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
        IF OLD.statut::text = 'EXPIRE' THEN
          RAISE EXCEPTION
            'certificats : un certificat expiré est définitif (US-CERT-07 / NF3)'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.statut::text NOT IN ('ACTIF', 'REVOQUE', 'EXPIRE')
           OR NEW.date_expiration IS DISTINCT FROM OLD.date_expiration ${CHAMPS_CERTIFIANTS}
        THEN
          RAISE EXCEPTION
            'certificats : un certificat ACTIF est immuable (seules la révocation et l''expiration sont permises, NF3)'
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
        WHEN (OLD.statut::text IN ('ACTIF', 'REVOQUE', 'EXPIRE'))
        EXECUTE FUNCTION certificats_actif_immuable();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Déclencheur d'US-CERT-06 (ACTIF et REVOQUE).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION certificats_actif_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.statut = 'REVOQUE' THEN
          RAISE EXCEPTION
            'certificats : une révocation est irréversible (US-CERT-06 / NF3)'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.statut NOT IN ('ACTIF', 'REVOQUE') ${CHAMPS_CERTIFIANTS}
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
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_certificats_expiration_actifs"`);
    await queryRunner.query(`ALTER TABLE "certificats" DROP COLUMN IF EXISTS "date_expiration"`);
    await queryRunner.query(
      `ALTER TABLE "formations" DROP CONSTRAINT IF EXISTS "CHK_formations_duree_validite"`,
    );
    await queryRunner.query(`ALTER TABLE "formations" DROP COLUMN IF EXISTS "duree_validite_mois"`);
  }
}
