import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-CERT-08 — Réémission d'un certificat révoqué pour erreur administrative.
 *
 *  1. `certificats.remplace_certificat_id` (facultative, FK vers le certificat
 *     révoqué qu'il remplace) : la réémission crée une NOUVELLE ligne — le
 *     certificat révoqué reste tel quel (immuable) et vérifiable « Révoqué ».
 *  2. L'unicité (apprenant, formation) ne porte plus que sur les certificats
 *     d'ORIGINE (`remplace_certificat_id IS NULL`) : l'émission automatique
 *     reste bloquée par un certificat existant, même révoqué (une révocation
 *     pour fraude ne se contourne pas) ; un certificat révoqué n'est remplacé
 *     qu'UNE fois (index unique sur `remplace_certificat_id`).
 *
 * Idempotence : IF NOT EXISTS, gardes. `down()` rétablit la contrainte
 * d'origine (échoue s'il existe des réémissions : à retirer d'abord).
 */
export class AddReemissionCertificats1788500000000 implements MigrationInterface {
  name = 'AddReemissionCertificats1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "certificats" ADD COLUMN IF NOT EXISTS "remplace_certificat_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_certificats_remplace') THEN
          ALTER TABLE "certificats" ADD CONSTRAINT "FK_certificats_remplace"
            FOREIGN KEY ("remplace_certificat_id") REFERENCES "certificats"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "certificats" DROP CONSTRAINT IF EXISTS "UQ_certificats_apprenant_formation"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_certificats_apprenant_formation"
        ON "certificats" ("apprenant_id", "formation_id") WHERE "remplace_certificat_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_certificats_remplace"
        ON "certificats" ("remplace_certificat_id") WHERE "remplace_certificat_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_certificats_remplace"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_certificats_apprenant_formation"`);
    await queryRunner.query(`
      ALTER TABLE "certificats" ADD CONSTRAINT "UQ_certificats_apprenant_formation"
        UNIQUE ("apprenant_id", "formation_id")
    `);
    await queryRunner.query(
      `ALTER TABLE "certificats" DROP CONSTRAINT IF EXISTS "FK_certificats_remplace"`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificats" DROP COLUMN IF EXISTS "remplace_certificat_id"`,
    );
  }
}
