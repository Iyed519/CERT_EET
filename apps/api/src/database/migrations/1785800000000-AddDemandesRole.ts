import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ROL-02 — Table des demandes de changement de rôle (self-service).
 *
 *  1. Deux types enum PostgreSQL : rôle demandé (FORMATEUR/ADMINISTRATEUR) et
 *     statut (EN_ATTENTE/APPROUVEE/REJETEE). Les noms suivent la convention
 *     TypeORM `<table>_<colonne>_enum` pour rester alignés avec l'entité.
 *  2. Table `demandes_role` : auteur (FK users, CASCADE), rôle demandé,
 *     justification, statut (défaut EN_ATTENTE), motif (rejet), admin ayant
 *     traité (FK users, SET NULL), horodatages.
 *  3. Index sur (user_id) et (statut).
 *
 * Écrite à la main et IDEMPOTENTE (IF NOT EXISTS + garde sur les types) : elle
 * peut être rejouée sans erreur, y compris dans le pipeline CI qui joue les
 * migrations avant les e2e.
 */
export class AddDemandesRole1785800000000 implements MigrationInterface {
  name = 'AddDemandesRole1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Types enum (créés seulement s'ils n'existent pas déjà) ---
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

    // --- Table (FK inline pour rester atomique avec la création) ---
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

    // --- Index ---
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_demandes_role_user_id" ON "demandes_role" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_demandes_role_statut" ON "demandes_role" ("statut")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_demandes_role_statut"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_demandes_role_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "demandes_role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."demandes_role_statut_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."demandes_role_role_demande_enum"`);
  }
}
