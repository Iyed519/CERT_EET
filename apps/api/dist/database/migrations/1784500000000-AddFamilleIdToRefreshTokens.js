"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddFamilleIdToRefreshTokens1784500000000 = void 0;
class AddFamilleIdToRefreshTokens1784500000000 {
    constructor() {
        this.name = 'AddFamilleIdToRefreshTokens1784500000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "famille_id" uuid`);
        await queryRunner.query(`UPDATE "refresh_tokens" SET "famille_id" = uuid_generate_v4() WHERE "famille_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "famille_id" SET NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_famille_id" ON "refresh_tokens" ("famille_id")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_famille_id"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "famille_id"`);
    }
}
exports.AddFamilleIdToRefreshTokens1784500000000 = AddFamilleIdToRefreshTokens1784500000000;
//# sourceMappingURL=1784500000000-AddFamilleIdToRefreshTokens.js.map