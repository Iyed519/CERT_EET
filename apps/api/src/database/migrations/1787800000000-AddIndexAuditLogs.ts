import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-AUDIT-01 — Index de consultation du journal d'audit (DS-16 P5).
 *
 * Le journal grossit à chaque action sensible ; la consultation trie par
 * horodatage décroissant et filtre par action, par cible ou par période. Sans
 * index, chaque page relit toute la table. J'ajoute :
 *  - `IDX_audit_logs_horodatage` (horodatage DESC, id DESC) : tri et période ;
 *  - `IDX_audit_logs_action_horodatage` (action, horodatage DESC) : filtre
 *    d'action + tri ;
 *  - `IDX_audit_logs_cible` (cible) : recherche par ressource (et compte des
 *    consultations publiques d'un certificat, US-DASH-02).
 * Index seulement : aucune donnée n'est modifiée (la table est immuable).
 */
export class AddIndexAuditLogs1787800000000 implements MigrationInterface {
  name = 'AddIndexAuditLogs1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_horodatage" ON "audit_logs" ("horodatage" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_horodatage" ON "audit_logs" ("action", "horodatage" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_cible" ON "audit_logs" ("cible")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_cible"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_action_horodatage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_horodatage"`);
  }
}
