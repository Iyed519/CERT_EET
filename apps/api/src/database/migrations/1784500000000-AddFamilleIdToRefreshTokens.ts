import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-AUTH-03 — Ajout de la colonne famille_id à refresh_tokens.
 *
 * La rotation des refresh tokens (ADR-08) a besoin de regrouper les jetons
 * issus d'une même connexion en une "famille" : détection de rejeu = si un
 * jeton déjà consommé est represente, on révoque toute la famille.
 *
 * On procède en 4 temps pour rester sûr même si la table contient déjà des
 * lignes (sessions créées pendant les tests d'AUTH-01) : on NE PEUT PAS
 * ajouter directement une colonne NOT NULL à une table déjà peuplée. Donc :
 *   1. ajout de la colonne en nullable,
 *   2. backfill : on donne à chaque ligne existante sa propre famille,
 *   3. passage en NOT NULL une fois toutes les lignes remplies,
 *   4. index (on filtrera sur famille_id lors des révocations en masse).
 * C'est aussi pourquoi cette migration est écrite à la main plutôt que
 * générée : migration:generate ne sait pas produire l'étape de backfill.
 */
export class AddFamilleIdToRefreshTokens1784500000000
  implements MigrationInterface
{
  name = 'AddFamilleIdToRefreshTokens1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "famille_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "famille_id" = uuid_generate_v4() WHERE "famille_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ALTER COLUMN "famille_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_famille_id" ON "refresh_tokens" ("famille_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_tokens_famille_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "famille_id"`,
    );
  }
}
