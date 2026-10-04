import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enabler Sprint 2 (1/2) — Modèle de données E2 : formations, modules,
 * inscriptions, affectations de formateurs.
 *
 *  1. Deux types enum : statut de formation (OUVERTE/FERMEE/ARCHIVEE) et
 *     statut d'inscription (EN_COURS/TERMINEE/SUSPENDUE). Noms au format
 *     TypeORM `<table>_<colonne>_enum`, alignés sur les entités.
 *  2. `formations` (squelette du Sprint 1) : ajout des attributs du diagramme
 *     de classes + deux CHECK (capacité > 0, seuil dans [0,100]).
 *  3. `modules` : composition de la formation (CASCADE).
 *  4. `inscriptions` : classe d'association apprenant <-> formation, unicité
 *     du couple, RESTRICT (donnée de traçabilité).
 *  5. `formation_formateurs` : affectation formateur <-> formation, support de
 *     l'autorisation par ressource (US-AUTH-16).
 *
 * Écrite à la main et IDEMPOTENTE (IF NOT EXISTS + gardes sur les types et les
 * contraintes), comme AddDemandesRole : elle peut être rejouée sans erreur.
 * TypeORM l'exécute dans une transaction : un échec annule tout (rollback).
 */
export class AddFormationsInscriptions1785900000000 implements MigrationInterface {
  name = 'AddFormationsInscriptions1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Types enum (créés seulement s'ils n'existent pas déjà) ---
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'formations_statut_enum') THEN
          CREATE TYPE "public"."formations_statut_enum" AS ENUM('OUVERTE', 'FERMEE', 'ARCHIVEE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inscriptions_statut_enum') THEN
          CREATE TYPE "public"."inscriptions_statut_enum" AS ENUM('EN_COURS', 'TERMINEE', 'SUSPENDUE');
        END IF;
      END $$;
    `);

    // --- formations : colonnes facultatives ---
    await queryRunner.query(`
      ALTER TABLE "formations"
        ADD COLUMN IF NOT EXISTS "objectifs" text,
        ADD COLUMN IF NOT EXISTS "prerequis" text,
        ADD COLUMN IF NOT EXISTS "date_debut" date,
        ADD COLUMN IF NOT EXISTS "date_fin" date,
        ADD COLUMN IF NOT EXISTS "duree_heures" integer,
        ADD COLUMN IF NOT EXISTS "modele_certificat" character varying(255),
        ADD COLUMN IF NOT EXISTS "statut" "public"."formations_statut_enum" NOT NULL DEFAULT 'OUVERTE'
    `);

    // --- formations : colonnes obligatoires ---
    // Aucun code n'écrit encore dans `formations` : la table est vide partout.
    // Je pose quand même un DEFAULT transitoire pour que l'ALTER passe si une
    // ligne existait, puis je le retire aussitôt : la capacité et le seuil
    // doivent toujours venir de la saisie de l'administrateur (US-FORM-01),
    // jamais d'une valeur implicite.
    await queryRunner.query(`
      ALTER TABLE "formations"
        ADD COLUMN IF NOT EXISTS "capacite_max" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "note_min_certification" numeric(5,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "formations"
        ALTER COLUMN "capacite_max" DROP DEFAULT,
        ALTER COLUMN "note_min_certification" DROP DEFAULT
    `);

    // --- formations : contraintes CHECK (gardées : ADD CONSTRAINT n'a pas de IF NOT EXISTS) ---
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_formations_capacite_max') THEN
          ALTER TABLE "formations"
            ADD CONSTRAINT "CHK_formations_capacite_max" CHECK ("capacite_max" > 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_formations_note_min_certification') THEN
          ALTER TABLE "formations"
            ADD CONSTRAINT "CHK_formations_note_min_certification"
            CHECK ("note_min_certification" >= 0 AND "note_min_certification" <= 100);
        END IF;
      END $$;
    `);

    // --- modules ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "modules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "formation_id" uuid NOT NULL,
        "titre" character varying(255) NOT NULL,
        "ordre" integer NOT NULL,
        "description" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_modules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_modules_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_modules_formation_ordre" ON "modules" ("formation_id", "ordre")`,
    );

    // --- inscriptions ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apprenant_id" uuid NOT NULL,
        "formation_id" uuid NOT NULL,
        "date_inscription" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date_echeance" date,
        "statut" "public"."inscriptions_statut_enum" NOT NULL DEFAULT 'EN_COURS',
        "taux_avancement" numeric(5,2) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_inscriptions_taux_avancement"
          CHECK ("taux_avancement" >= 0 AND "taux_avancement" <= 100),
        CONSTRAINT "FK_inscriptions_apprenant" FOREIGN KEY ("apprenant_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_inscriptions_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inscriptions_apprenant_formation" ON "inscriptions" ("apprenant_id", "formation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inscriptions_formation_statut" ON "inscriptions" ("formation_id", "statut")`,
    );

    // --- formation_formateurs ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "formation_formateurs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "formation_id" uuid NOT NULL,
        "formateur_id" uuid NOT NULL,
        "affecte_par" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_formation_formateurs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_formation_formateurs_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_formation_formateurs_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_formation_formateurs_affecte_par" FOREIGN KEY ("affecte_par")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_formation_formateurs_formation_formateur" ON "formation_formateurs" ("formation_id", "formateur_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_formation_formateurs_formateur" ON "formation_formateurs" ("formateur_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordre inverse de la création : les tables filles d'abord. DROP TABLE
    // emporte ses index et ses contraintes.
    await queryRunner.query(`DROP TABLE IF EXISTS "formation_formateurs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "modules"`);

    // `formations` revient à son squelette du Sprint 1 (id, titre, description).
    await queryRunner.query(`
      ALTER TABLE "formations"
        DROP CONSTRAINT IF EXISTS "CHK_formations_note_min_certification",
        DROP CONSTRAINT IF EXISTS "CHK_formations_capacite_max"
    `);
    await queryRunner.query(`
      ALTER TABLE "formations"
        DROP COLUMN IF EXISTS "note_min_certification",
        DROP COLUMN IF EXISTS "capacite_max",
        DROP COLUMN IF EXISTS "statut",
        DROP COLUMN IF EXISTS "modele_certificat",
        DROP COLUMN IF EXISTS "duree_heures",
        DROP COLUMN IF EXISTS "date_fin",
        DROP COLUMN IF EXISTS "date_debut",
        DROP COLUMN IF EXISTS "prerequis",
        DROP COLUMN IF EXISTS "objectifs"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."inscriptions_statut_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."formations_statut_enum"`);
  }
}
