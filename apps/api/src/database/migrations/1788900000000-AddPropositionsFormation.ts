import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-FORM-08 — Propositions de nouvelles formations par les formateurs, et
 * statut BROUILLON d'une formation.
 *
 * 1. `formations_statut_enum` reçoit BROUILLON (avant OUVERTE) : une
 *    proposition acceptée devient une formation BROUILLON (hors catalogue,
 *    sans inscription) que l'administrateur publie ensuite (-> OUVERTE).
 * 2. Table `propositions_formation` : mêmes bornes que la création d'une
 *    formation par l'administrateur (US-FORM-01) pour titre, description,
 *    objectifs, durée et capacité ; public visé et motif ; cycle
 *    EN_ATTENTE -> ACCEPTEE | REFUSEE | A_MODIFIER (commentaire), et
 *    A_MODIFIER -> EN_ATTENTE quand le formateur resoumet (`version` + 1).
 *    Une proposition acceptée pointe vers la formation créée.
 *
 * Down : les formations BROUILLON repassent FERMEE (hors catalogue, comme
 * avant), puis l'énumération est recréée sans BROUILLON.
 */
export class AddPropositionsFormation1788900000000 implements MigrationInterface {
  name = 'AddPropositionsFormation1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."formations_statut_enum" ADD VALUE IF NOT EXISTS 'BROUILLON' BEFORE 'OUVERTE'`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "propositions_formation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "formateur_id" uuid NOT NULL,
        "titre" varchar(255) NOT NULL,
        "description" varchar(5000),
        "objectifs" varchar(5000),
        "duree_heures" integer,
        "capacite_max" integer NOT NULL,
        "public_vise" varchar(1000),
        "motif" varchar(1000) NOT NULL,
        "statut" varchar(20) NOT NULL DEFAULT 'EN_ATTENTE',
        "commentaire_admin" varchar(1000),
        "formation_id" uuid,
        "version" integer NOT NULL DEFAULT 1,
        "traite_par" uuid,
        "traite_le" timestamptz,
        "cree_le" timestamptz NOT NULL DEFAULT now(),
        "modifie_le" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_propositions_formation" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_propositions_formation_statut"
          CHECK ("statut" IN ('EN_ATTENTE', 'A_MODIFIER', 'ACCEPTEE', 'REFUSEE')),
        CONSTRAINT "CHK_propositions_formation_titre"
          CHECK (char_length(btrim("titre")) BETWEEN 1 AND 255),
        CONSTRAINT "CHK_propositions_formation_motif"
          CHECK (char_length(btrim("motif")) BETWEEN 10 AND 1000),
        CONSTRAINT "CHK_propositions_formation_duree"
          CHECK ("duree_heures" IS NULL OR "duree_heures" BETWEEN 1 AND 10000),
        CONSTRAINT "CHK_propositions_formation_capacite"
          CHECK ("capacite_max" BETWEEN 1 AND 100000),
        CONSTRAINT "CHK_propositions_formation_commentaire" CHECK (
          ("statut" IN ('A_MODIFIER', 'REFUSEE') AND "commentaire_admin" IS NOT NULL
             AND char_length(btrim("commentaire_admin")) BETWEEN 10 AND 1000)
          OR ("statut" IN ('EN_ATTENTE', 'ACCEPTEE'))),
        CONSTRAINT "CHK_propositions_formation_acceptee"
          CHECK ("statut" = 'ACCEPTEE' OR "formation_id" IS NULL),
        CONSTRAINT "CHK_propositions_formation_version" CHECK ("version" >= 1),
        CONSTRAINT "FK_propositions_formation_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_propositions_formation_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_propositions_formation_traite_par" FOREIGN KEY ("traite_par")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_propositions_formation_formateur"
        ON "propositions_formation" ("formateur_id", "statut")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_propositions_formation_statut_cree"
        ON "propositions_formation" ("statut", "cree_le" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_propositions_formation_statut_cree"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_propositions_formation_formateur"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "propositions_formation"`);
    await queryRunner.query(`UPDATE "formations" SET "statut" = 'FERMEE' WHERE "statut" = 'BROUILLON'`);
    await queryRunner.query(`ALTER TABLE "formations" ALTER COLUMN "statut" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TYPE "public"."formations_statut_enum" RENAME TO "formations_statut_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."formations_statut_enum" AS ENUM('OUVERTE', 'FERMEE', 'ARCHIVEE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "formations" ALTER COLUMN "statut" TYPE "public"."formations_statut_enum"
         USING "statut"::text::"public"."formations_statut_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "formations" ALTER COLUMN "statut" SET DEFAULT 'OUVERTE'`);
    await queryRunner.query(`DROP TYPE "public"."formations_statut_enum_old"`);
  }
}
