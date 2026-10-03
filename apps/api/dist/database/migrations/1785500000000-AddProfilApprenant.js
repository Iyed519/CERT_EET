"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddProfilApprenant1785500000000 = void 0;
class AddProfilApprenant1785500000000 {
    constructor() {
        this.name = 'AddProfilApprenant1785500000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "domaines_etudes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(30) NOT NULL, "libelle" character varying(120) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_domaines_etudes" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_domaines_etudes_code" ON "domaines_etudes" ("code")`);
        await queryRunner.query(`CREATE TABLE "universites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nom" character varying(255) NOT NULL, "type" character varying(10) NOT NULL, "gouvernorat" character varying(50), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_universites" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_universites_nom" ON "universites" ("nom")`);
        await queryRunner.query(`CREATE TABLE "etablissements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "universite_id" uuid NOT NULL, "nom" character varying(255) NOT NULL, "type" character varying(20) NOT NULL, "gouvernorat" character varying(50), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_etablissements" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_etablissements_universite_id" ON "etablissements" ("universite_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_etablissements_nom" ON "etablissements" ("nom")`);
        await queryRunner.query(`ALTER TABLE "etablissements" ADD CONSTRAINT "FK_etablissements_universite" FOREIGN KEY ("universite_id") REFERENCES "universites"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "etablissement_domaine" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "etablissement_id" uuid NOT NULL, "domaine_id" uuid NOT NULL, CONSTRAINT "PK_etablissement_domaine" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_etab_domaine_etab" ON "etablissement_domaine" ("etablissement_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_etab_domaine_domaine" ON "etablissement_domaine" ("domaine_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_etab_domaine_unique" ON "etablissement_domaine" ("etablissement_id", "domaine_id")`);
        await queryRunner.query(`ALTER TABLE "etablissement_domaine" ADD CONSTRAINT "FK_etab_domaine_etab" FOREIGN KEY ("etablissement_id") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "etablissement_domaine" ADD CONSTRAINT "FK_etab_domaine_domaine" FOREIGN KEY ("domaine_id") REFERENCES "domaines_etudes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TYPE "public"."users_niveau_etudes_enum" AS ENUM('SANS_BAC', 'BAC', 'PREPA', 'BTS', 'LICENCE', 'MAITRISE', 'MASTERE', 'INGENIEUR', 'DOCTORAT', 'AUTRE')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "date_naissance" date`);
        await queryRunner.query(`ALTER TABLE "users" ADD "niveau_etudes" "public"."users_niveau_etudes_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "domaine_etudes_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "etablissement_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "etablissement_autre" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "profil_complet" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_domaine_etudes" FOREIGN KEY ("domaine_etudes_id") REFERENCES "domaines_etudes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_etablissement" FOREIGN KEY ("etablissement_id") REFERENCES "etablissements"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_etablissement"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_domaine_etudes"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profil_complet"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "etablissement_autre"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "etablissement_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "domaine_etudes_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "niveau_etudes"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "date_naissance"`);
        await queryRunner.query(`DROP TYPE "public"."users_niveau_etudes_enum"`);
        await queryRunner.query(`ALTER TABLE "etablissement_domaine" DROP CONSTRAINT "FK_etab_domaine_domaine"`);
        await queryRunner.query(`ALTER TABLE "etablissement_domaine" DROP CONSTRAINT "FK_etab_domaine_etab"`);
        await queryRunner.query(`DROP TABLE "etablissement_domaine"`);
        await queryRunner.query(`ALTER TABLE "etablissements" DROP CONSTRAINT "FK_etablissements_universite"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_etablissements_nom"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_etablissements_universite_id"`);
        await queryRunner.query(`DROP TABLE "etablissements"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_universites_nom"`);
        await queryRunner.query(`DROP TABLE "universites"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_domaines_etudes_code"`);
        await queryRunner.query(`DROP TABLE "domaines_etudes"`);
    }
}
exports.AddProfilApprenant1785500000000 = AddProfilApprenant1785500000000;
//# sourceMappingURL=1785500000000-AddProfilApprenant.js.map