import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-IA-08 — Extraction des questions d'un document par l'IA.
 *
 * `extractions_questions_ia` : un document déposé sur un QCM par un formateur.
 *  - cycle EN_ATTENTE -> EN_COURS -> TERMINEE | ECHEC ; ECHEC -> EN_ATTENTE
 *    (relance) ; une fin (TERMINEE, ECHEC) porte sa date ; TERMINEE porte ses
 *    compteurs ; ECHEC porte son motif ;
 *  - au plus UNE extraction active (EN_ATTENTE ou EN_COURS) par formateur :
 *    index unique PARTIEL, filet du contrôle du service ;
 *  - `cle_stockage` : objet MinIO, NULL une fois le fichier supprimé
 *    (extraction terminée) ; jamais exposée.
 *
 * `questions_extraites_ia` : une question recopiée du document, à relire.
 *  - options jsonb : 2 à 10 objets `{ texte, estCorrecte }` ; `reponse_connue`
 *    faux = le document ne donnait pas la bonne réponse (le formateur la coche) ;
 *  - décision unique : PROPOSEE -> ACCEPTEE | MODIFIEE | REJETEE ; une
 *    question décidée l'est par quelqu'un, à une date ; un motif seulement
 *    pour un rejet ; déclencheur : une décision ne revient jamais en arrière.
 *
 * Suppression du QCM -> extractions et questions extraites supprimées
 * (CASCADE) ; suppression d'une question créée -> `question_id` à NULL.
 */
export class AddExtractionsQuestionsIa1789100000000 implements MigrationInterface {
  name = 'AddExtractionsQuestionsIa1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "extractions_questions_ia" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "qcm_id" uuid NOT NULL,
        "formateur_id" uuid NOT NULL,
        "nom_fichier" varchar(255) NOT NULL,
        "format" varchar(10) NOT NULL,
        "taille_octets" integer NOT NULL,
        "sha256" char(64) NOT NULL,
        "cle_stockage" varchar(300),
        "statut" varchar(20) NOT NULL DEFAULT 'EN_ATTENTE',
        "mode_lecture" varchar(20),
        "tronque" boolean NOT NULL DEFAULT false,
        "modele_llm" varchar(100),
        "nb_questions" integer,
        "nb_ecartees" integer,
        "nb_tentatives" integer NOT NULL DEFAULT 0,
        "derniere_erreur" varchar(500),
        "date_lancement" timestamptz NOT NULL DEFAULT now(),
        "date_fin" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extractions_questions_ia" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_extractions_statut"
          CHECK ("statut" IN ('EN_ATTENTE', 'EN_COURS', 'TERMINEE', 'ECHEC')),
        CONSTRAINT "CHK_extractions_format" CHECK (
          "format" IN ('pdf', 'docx', 'txt', 'md', 'csv', 'xlsx', 'png', 'jpg', 'jpeg', 'webp')),
        CONSTRAINT "CHK_extractions_taille"
          CHECK ("taille_octets" BETWEEN 1 AND 10485760),
        CONSTRAINT "CHK_extractions_mode"
          CHECK ("mode_lecture" IS NULL OR "mode_lecture" IN ('TEXTE', 'TABLEAU', 'VISION')),
        CONSTRAINT "CHK_extractions_compteurs" CHECK (
          ("nb_questions" IS NULL OR "nb_questions" BETWEEN 0 AND 100)
          AND ("nb_ecartees" IS NULL OR "nb_ecartees" >= 0) AND "nb_tentatives" >= 0),
        CONSTRAINT "CHK_extractions_terminee" CHECK (
          "statut" <> 'TERMINEE'
          OR ("date_fin" IS NOT NULL AND "nb_questions" IS NOT NULL AND "nb_ecartees" IS NOT NULL)),
        CONSTRAINT "CHK_extractions_echec" CHECK (
          "statut" <> 'ECHEC' OR ("date_fin" IS NOT NULL AND "derniere_erreur" IS NOT NULL)),
        CONSTRAINT "CHK_extractions_active" CHECK (
          "statut" NOT IN ('EN_ATTENTE', 'EN_COURS') OR "date_fin" IS NULL),
        CONSTRAINT "FK_extractions_qcm" FOREIGN KEY ("qcm_id")
          REFERENCES "qcm"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_extractions_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_extractions_une_active_par_formateur"
        ON "extractions_questions_ia" ("formateur_id")
        WHERE "statut" IN ('EN_ATTENTE', 'EN_COURS')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_extractions_qcm_date"
        ON "extractions_questions_ia" ("qcm_id", "date_lancement" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "questions_extraites_ia" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "extraction_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        "enonce" text NOT NULL,
        "type" varchar(10) NOT NULL,
        "options" jsonb NOT NULL,
        "reponse_connue" boolean NOT NULL,
        "explication" text,
        "niveau" varchar(20),
        "statut" varchar(10) NOT NULL DEFAULT 'PROPOSEE',
        "question_id" uuid,
        "decide_par" uuid,
        "date_decision" timestamptz,
        "motif_rejet" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_questions_extraites_ia" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_questions_extraites_ordre" UNIQUE ("extraction_id", "ordre"),
        CONSTRAINT "CHK_questions_extraites_ordre" CHECK ("ordre" BETWEEN 1 AND 100),
        CONSTRAINT "CHK_questions_extraites_enonce"
          CHECK (char_length(btrim("enonce")) BETWEEN 1 AND 4000),
        CONSTRAINT "CHK_questions_extraites_type" CHECK ("type" IN ('QCU', 'QCM', 'VRAI_FAUX')),
        CONSTRAINT "CHK_questions_extraites_options" CHECK (
          jsonb_typeof("options") = 'array'
          AND jsonb_array_length("options") BETWEEN 2 AND 10),
        CONSTRAINT "CHK_questions_extraites_niveau" CHECK (
          "niveau" IS NULL OR "niveau" IN ('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE')),
        CONSTRAINT "CHK_questions_extraites_statut"
          CHECK ("statut" IN ('PROPOSEE', 'ACCEPTEE', 'MODIFIEE', 'REJETEE')),
        CONSTRAINT "CHK_questions_extraites_decision" CHECK (
          ("statut" = 'PROPOSEE' AND "decide_par" IS NULL AND "date_decision" IS NULL
             AND "question_id" IS NULL)
          OR ("statut" <> 'PROPOSEE' AND "date_decision" IS NOT NULL)),
        CONSTRAINT "CHK_questions_extraites_motif" CHECK (
          "motif_rejet" IS NULL OR "statut" = 'REJETEE'),
        CONSTRAINT "FK_questions_extraites_extraction" FOREIGN KEY ("extraction_id")
          REFERENCES "extractions_questions_ia"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_questions_extraites_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_questions_extraites_decideur" FOREIGN KEY ("decide_par")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION questions_extraites_garde_transitions()
      RETURNS trigger AS $$
      BEGIN
        IF OLD.statut <> 'PROPOSEE' AND NEW.statut IS DISTINCT FROM OLD.statut THEN
          RAISE EXCEPTION 'Question extraite déjà décidée : décision définitive.'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_questions_extraites_transitions ON "questions_extraites_ia"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_questions_extraites_transitions
        BEFORE UPDATE ON "questions_extraites_ia"
        FOR EACH ROW EXECUTE FUNCTION questions_extraites_garde_transitions()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_questions_extraites_transitions ON "questions_extraites_ia"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS questions_extraites_garde_transitions()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questions_extraites_ia"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_extractions_qcm_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_extractions_une_active_par_formateur"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "extractions_questions_ia"`);
  }
}
