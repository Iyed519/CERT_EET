import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-QCM-10 — Verrou de session d'une tentative (DS-02 étape 1, NF3).
 *
 * `session_id` : session (famille du refresh token, claim `sid`) qui détient la
 * tentative. Posé à la création, sous le verrou de l'inscription ; c'est
 * PostgreSQL qui décide, comme pour l'échéance (US-QCM-07, D1). La clé Redis
 * `session_qcm:{apprenantId}:{qcmId}` n'en est que le miroir.
 *
 * Nullable : les tentatives créées avant US-QCM-10 n'en ont pas ; la première
 * session qui les reprend les adopte. Pas de clé étrangère : la session peut
 * être un ancien `jti` (jeton émis avant le déploiement), sans ligne associée.
 *
 * Idempotence (CI / rejeu) : IF NOT EXISTS / IF EXISTS.
 */
export class AddTentativeSessionId1786200000000 implements MigrationInterface {
  name = 'AddTentativeSessionId1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tentatives_qcm" ADD COLUMN IF NOT EXISTS "session_id" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tentatives_qcm" DROP COLUMN IF EXISTS "session_id"`);
  }
}
