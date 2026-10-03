"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddNomPrenomToUsers1784900000000 = void 0;
class AddNomPrenomToUsers1784900000000 {
    constructor() {
        this.name = 'AddNomPrenomToUsers1784900000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ADD "nom" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "prenom" character varying(100)`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "prenom"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "nom"`);
    }
}
exports.AddNomPrenomToUsers1784900000000 = AddNomPrenomToUsers1784900000000;
//# sourceMappingURL=1784900000000-AddNomPrenomToUsers.js.map