import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-QCM-12 — Surveillance webcam par captures (QCM dont le formateur a activé
 * le paramètre, opt-in, désactivé par défaut).
 *
 *  1. `tentatives_qcm.consentement_surveillance_le` : horodatage du
 *     consentement de l'apprenant, donné avant la création de la tentative
 *     (NULL pour un QCM non surveillé).
 *  2. `captures_webcam` : une ligne par image (clé de stockage privée, taille,
 *     type, date de prise). Aucune URL publique. Supprimées avec la tentative
 *     (CASCADE) et par la purge planifiée (index sur la date).
 *
 * Idempotence : IF NOT EXISTS.
 */
export class AddSurveillanceWebcam1788700000000 implements MigrationInterface {
  name = 'AddSurveillanceWebcam1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tentatives_qcm" ADD COLUMN IF NOT EXISTS "consentement_surveillance_le" timestamptz`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "captures_webcam" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tentative_id" uuid NOT NULL,
        "cle_stockage" varchar(255) NOT NULL,
        "taille_octets" integer NOT NULL,
        "type_contenu" varchar(30) NOT NULL,
        "prise_le" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_captures_webcam" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_captures_webcam_cle" UNIQUE ("cle_stockage"),
        CONSTRAINT "CHK_captures_webcam_taille" CHECK ("taille_octets" > 0),
        CONSTRAINT "CHK_captures_webcam_type" CHECK ("type_contenu" IN ('image/jpeg', 'image/png')),
        CONSTRAINT "FK_captures_webcam_tentative" FOREIGN KEY ("tentative_id")
          REFERENCES "tentatives_qcm"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_captures_webcam_tentative" ON "captures_webcam" ("tentative_id", "prise_le")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_captures_webcam_prise" ON "captures_webcam" ("prise_le")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_captures_webcam_prise"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_captures_webcam_tentative"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "captures_webcam"`);
    await queryRunner.query(
      `ALTER TABLE "tentatives_qcm" DROP COLUMN IF EXISTS "consentement_surveillance_le"`,
    );
  }
}
