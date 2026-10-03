"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAuditImmutabilityTrigger1785700000000 = void 0;
class AddAuditImmutabilityTrigger1785700000000 {
    constructor() {
        this.name = 'AddAuditImmutabilityTrigger1785700000000';
    }
    async up(queryRunner) {
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
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`);
        await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_mutation();
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS audit_logs_prevent_mutation()`);
    }
}
exports.AddAuditImmutabilityTrigger1785700000000 = AddAuditImmutabilityTrigger1785700000000;
//# sourceMappingURL=1785700000000-AddAuditImmutabilityTrigger.js.map