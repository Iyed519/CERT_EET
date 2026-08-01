import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-AUTH-12 — Immuabilité du journal d'audit (NF3).
 *
 * L'entité AuditLog est déjà append-only côté application (aucune route
 * UPDATE/DELETE, écriture centralisée dans AuditService). Cette migration pose
 * la garantie AU NIVEAU DE LA BASE : un trigger BEFORE UPDATE OR DELETE sur
 * `audit_logs` lève une exception -> même un accès SQL direct (psql, ORM,
 * compromission d'un compte applicatif) ne peut ni modifier ni supprimer une
 * ligne. Seul l'INSERT reste autorisé.
 *
 * Bypass maintenance/tests : si la variable de session (GUC) `app.audit_maintenance`
 * vaut 'on', le trigger laisse passer. Cela sert UNIQUEMENT au nettoyage
 * contrôlé (teardown e2e) — jamais exposé via une route.
 *
 * Idempotence (CI / rejeu) : CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS
 * avant CREATE, pour que la migration soit rejouable sans casser.
 */
export class AddAuditImmutabilityTrigger1785700000000
  implements MigrationInterface
{
  name = 'AddAuditImmutabilityTrigger1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fonction du trigger : bloque toute mutation, sauf bypass maintenance.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_logs_prevent_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Bypass explicite pour la maintenance / le teardown des tests.
        -- 2e argument 'true' = missing_ok : renvoie NULL si la GUC n'est pas
        -- définie (au lieu de lever une erreur).
        IF current_setting('app.audit_maintenance', true) = 'on' THEN
          -- UPDATE -> NEW ; DELETE -> OLD (NEW est NULL sur un DELETE).
          RETURN COALESCE(NEW, OLD);
        END IF;
        RAISE EXCEPTION
          'audit_logs est immuable : % interdit (US-AUTH-12 / NF3)', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger idempotent : on le recrée proprement.
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS audit_logs_prevent_mutation()`,
    );
  }
}
