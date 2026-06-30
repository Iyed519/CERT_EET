import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1782849449261 implements MigrationInterface {
    name = 'InitSchema1782849449261'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('APPRENANT', 'FORMATEUR', 'ADMINISTRATEUR')`);
        await queryRunner.query(`CREATE TYPE "public"."users_statut_enum" AS ENUM('EN_ATTENTE_ACTIVATION', 'ACTIF', 'DESACTIVE', 'ANONYMISE')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "mot_de_passe_hash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL, "statut" "public"."users_statut_enum" NOT NULL DEFAULT 'EN_ATTENTE_ACTIVATION', "mfa_active" boolean NOT NULL DEFAULT false, "mfa_secret" character varying(255), "derniere_connexion" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "adresse_ip" character varying(45), "user_agent" character varying(255), "active" boolean NOT NULL DEFAULT true, "date_expiration" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "action" character varying(100) NOT NULL, "cible" character varying(255), "adresse_ip" character varying(45), "resultat" character varying(20), "details_avant_apres" jsonb, "horodatage" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON "audit_logs" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "formations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "titre" character varying(255) NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e071aaba3322392364953ba5c95" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`DROP TABLE "formations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bd2726fd31b35443f2245b93ba"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_statut_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
