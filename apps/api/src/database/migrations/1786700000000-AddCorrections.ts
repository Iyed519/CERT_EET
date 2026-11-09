import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-06 — Correction critère par critère (DS-03 partie 2, UC5 Formateur).
 *
 *  1. Type enum `corrections_statut_enum` : EN_COURS, TERMINEE (US-ATEL-07).
 *  2. `corrections` : UNE par livrable (UNIQUE), CASCADE avec le livrable,
 *     RESTRICT vers le correcteur ; date d'ouverture (heure de PostgreSQL).
 *  3. `notes_criteres` : UNE note par (correction, critère) ; niveau atteint
 *     (FK RESTRICT), points en % du critère (0–100, deux décimales),
 *     commentaire facultatif (1–2 000 caractères) ; CASCADE avec la
 *     correction, RESTRICT vers le critère et le niveau.
 *  4. Déclencheur `trg_notes_criteres_coherence` (BEFORE INSERT OR UPDATE) :
 *     le niveau appartient au critère, les points sont dans la plage du
 *     niveau (bornes comprises), et le critère appartient à la grille de
 *     l'atelier du livrable corrigé. Ces règles portent sur plusieurs tables :
 *     un CHECK ne peut pas les exprimer. Une écriture qui contournerait l'API
 *     ne peut pas produire une note incohérente (ERRCODE check_violation).
 *
 * Idempotence (CI / rejeu) : IF NOT EXISTS, garde sur le type, CREATE OR
 * REPLACE FUNCTION + DROP TRIGGER IF EXISTS. `down()` retire tout.
 */
export class AddCorrections1786700000000 implements MigrationInterface {
  name = 'AddCorrections1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corrections_statut_enum') THEN
          CREATE TYPE "public"."corrections_statut_enum" AS ENUM('EN_COURS', 'TERMINEE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corrections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "livrable_id" uuid NOT NULL,
        "correcteur_id" uuid NOT NULL,
        "statut" "public"."corrections_statut_enum" NOT NULL DEFAULT 'EN_COURS',
        "date_ouverture" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_corrections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_corrections_livrable" UNIQUE ("livrable_id"),
        CONSTRAINT "FK_corrections_livrable" FOREIGN KEY ("livrable_id")
          REFERENCES "livrables"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_corrections_correcteur" FOREIGN KEY ("correcteur_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notes_criteres" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "correction_id" uuid NOT NULL,
        "critere_id" uuid NOT NULL,
        "niveau_id" uuid NOT NULL,
        "points_pct" numeric(5,2) NOT NULL,
        "commentaire" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notes_criteres" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notes_criteres_correction_critere" UNIQUE ("correction_id", "critere_id"),
        CONSTRAINT "FK_notes_criteres_correction" FOREIGN KEY ("correction_id")
          REFERENCES "corrections"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notes_criteres_critere" FOREIGN KEY ("critere_id")
          REFERENCES "criteres"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_notes_criteres_niveau" FOREIGN KEY ("niveau_id")
          REFERENCES "niveaux_performance"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_notes_criteres_points" CHECK ("points_pct" BETWEEN 0 AND 100),
        CONSTRAINT "CHK_notes_criteres_commentaire" CHECK (
          "commentaire" IS NULL OR char_length("commentaire") BETWEEN 1 AND 2000
        )
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notes_criteres_coherence()
      RETURNS TRIGGER AS $$
      DECLARE
        v_niveau RECORD;
        v_atelier_critere uuid;
        v_atelier_livrable uuid;
      BEGIN
        SELECT critere_id, points_min_pct, points_max_pct INTO v_niveau
          FROM niveaux_performance WHERE id = NEW.niveau_id;
        IF NOT FOUND OR v_niveau.critere_id <> NEW.critere_id THEN
          RAISE EXCEPTION 'notes_criteres : le niveau n''appartient pas au critère (US-ATEL-06)'
            USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.points_pct < v_niveau.points_min_pct OR NEW.points_pct > v_niveau.points_max_pct THEN
          RAISE EXCEPTION 'notes_criteres : points hors de la plage du niveau (US-ATEL-06)'
            USING ERRCODE = 'check_violation';
        END IF;
        SELECT g.atelier_id INTO v_atelier_critere
          FROM criteres c JOIN grilles g ON g.id = c.grille_id WHERE c.id = NEW.critere_id;
        SELECT l.atelier_id INTO v_atelier_livrable
          FROM corrections co JOIN livrables l ON l.id = co.livrable_id
          WHERE co.id = NEW.correction_id;
        IF v_atelier_critere IS NULL OR v_atelier_critere IS DISTINCT FROM v_atelier_livrable THEN
          RAISE EXCEPTION 'notes_criteres : critère étranger à la grille de l''atelier (US-ATEL-06)'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notes_criteres_coherence ON notes_criteres`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_notes_criteres_coherence
        BEFORE INSERT OR UPDATE ON notes_criteres
        FOR EACH ROW
        EXECUTE FUNCTION notes_criteres_coherence();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notes_criteres_coherence ON notes_criteres`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS notes_criteres_coherence()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notes_criteres"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "corrections"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."corrections_statut_enum"`);
  }
}
