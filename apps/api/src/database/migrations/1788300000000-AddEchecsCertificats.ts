import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-CERT-02 — Gestion des échecs de génération des certificats.
 *
 *  Colonnes de `certificats` (facultatives) :
 *   - `echec_definitif_le` : date de l'échec DÉFINITIF (tentatives épuisées) ;
 *     posée une seule fois (l'administrateur n'est alerté qu'une fois),
 *     effacée par une relance ou une génération réussie ;
 *   - `debut_generation` : passage en EN_GENERATION, pour reprendre un
 *     certificat resté bloqué (worker arrêté en cours de route).
 *  Index partiel des certificats en échec définitif (filtre de l'administration).
 *
 * Idempotence : IF NOT EXISTS. `down()` retire tout.
 */
export class AddEchecsCertificats1788300000000 implements MigrationInterface {
  name = 'AddEchecsCertificats1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "certificats"
        ADD COLUMN IF NOT EXISTS "echec_definitif_le" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "debut_generation" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_certificats_echec_definitif"
        ON "certificats" ("echec_definitif_le") WHERE "echec_definitif_le" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_certificats_echec_definitif"`);
    await queryRunner.query(`
      ALTER TABLE "certificats"
        DROP COLUMN IF EXISTS "debut_generation",
        DROP COLUMN IF EXISTS "echec_definitif_le"
    `);
  }
}
