import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-QCM-08 — Immuabilité d'une tentative NOTEE (ET-02, NF3).
 *
 * Une tentative notée constitue l'historique certifiant : aucune renotation.
 * Côté application, la notation ne touche que les tentatives SOUMISE ou
 * ABANDONNEE_TIMER, sous verrou, et aucune route ne la relance. Cette
 * migration pose la garantie AU NIVEAU DE LA BASE, comme pour le journal
 * d'audit (US-AUTH-12) : un trigger BEFORE UPDATE refuse toute modification
 * d'une ligne dont le statut AVANT modification est NOTEE — même par un accès
 * SQL direct.
 *
 * Seul l'UPDATE est bloqué : la suppression reste possible (nettoyage des
 * tests, et aucune route ne supprime une tentative). Pas de bypass.
 *
 * Idempotence (CI / rejeu) : CREATE OR REPLACE FUNCTION + DROP TRIGGER IF
 * EXISTS avant CREATE.
 */
export class AddTentativeNoteeImmutabilityTrigger1786100000000 implements MigrationInterface {
  name = 'AddTentativeNoteeImmutabilityTrigger1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION tentatives_qcm_notee_immuable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION
          'tentatives_qcm : une tentative NOTEE est immuable (US-QCM-08 / NF3)'
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_tentatives_qcm_notee_immuable ON tentatives_qcm`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_tentatives_qcm_notee_immuable
        BEFORE UPDATE ON tentatives_qcm
        FOR EACH ROW
        WHEN (OLD.statut = 'NOTEE')
        EXECUTE FUNCTION tentatives_qcm_notee_immuable();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_tentatives_qcm_notee_immuable ON tentatives_qcm`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS tentatives_qcm_notee_immuable()`);
  }
}
