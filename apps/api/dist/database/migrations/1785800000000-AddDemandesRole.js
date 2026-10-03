"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddDemandesRole1785800000000 = void 0;
class AddDemandesRole1785800000000 {
    constructor() {
        this.name = 'AddDemandesRole1785800000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'demandes_role_role_demande_enum') THEN
          CREATE TYPE "public"."demandes_role_role_demande_enum" AS ENUM('FORMATEUR', 'ADMINISTRATEUR');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'demandes_role_statut_enum') THEN
          CREATE TYPE "public"."demandes_role_statut_enum" AS ENUM('EN_ATTENTE', 'APPROUVEE', 'REJETEE');
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "demandes_role" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "role_demande" "public"."demandes_role_role_demande_enum" NOT NULL,
        "justification" text NOT NULL,
        "statut" "public"."demandes_role_statut_enum" NOT NULL DEFAULT 'EN_ATTENTE',
        "motif" character varying(500),
        "traite_par" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "traite_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_demandes_role" PRIMARY KEY ("id"),
        CONSTRAINT "FK_demandes_role_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_demandes_role_traite_par" FOREIGN KEY ("traite_par")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_demandes_role_user_id" ON "demandes_role" ("user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_demandes_role_statut" ON "demandes_role" ("statut")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_demandes_role_statut"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_demandes_role_user_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "demandes_role"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."demandes_role_statut_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."demandes_role_role_demande_enum"`);
    }
}
exports.AddDemandesRole1785800000000 = AddDemandesRole1785800000000;
//# sourceMappingURL=1785800000000-AddDemandesRole.js.map