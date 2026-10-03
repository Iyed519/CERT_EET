"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddOauthAccounts1785400000000 = void 0;
class AddOauthAccounts1785400000000 {
    constructor() {
        this.name = 'AddOauthAccounts1785400000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "mot_de_passe_hash" DROP NOT NULL`);
        await queryRunner.query(`CREATE TABLE "comptes_oauth" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "provider" character varying(30) NOT NULL, "provider_id" character varying(255) NOT NULL, "email" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_comptes_oauth" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_comptes_oauth_user_id" ON "comptes_oauth" ("user_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_comptes_oauth_provider_pid" ON "comptes_oauth" ("provider", "provider_id")`);
        await queryRunner.query(`ALTER TABLE "comptes_oauth" ADD CONSTRAINT "FK_comptes_oauth_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "comptes_oauth" DROP CONSTRAINT "FK_comptes_oauth_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_comptes_oauth_provider_pid"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_comptes_oauth_user_id"`);
        await queryRunner.query(`DROP TABLE "comptes_oauth"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "mot_de_passe_hash" SET NOT NULL`);
    }
}
exports.AddOauthAccounts1785400000000 = AddOauthAccounts1785400000000;
//# sourceMappingURL=1785400000000-AddOauthAccounts.js.map