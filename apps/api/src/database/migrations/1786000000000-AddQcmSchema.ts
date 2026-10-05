import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enabler Sprint 2 (2/2) — Modèle de données E3 : moteur de QCM anti-fraude.
 *
 *  1. Quatre types enum : statut du QCM, mode d'affichage des résultats, type
 *     de question, statut de tentative (noms `<table>_<colonne>_enum`).
 *  2. `qcm` : questionnaire rattaché à un module (RESTRICT).
 *  3. `config_anti_fraude` : configuration 1-1 du QCM (CASCADE) + CHECK des
 *     règles de DS-12 (fenêtre, durée, seuils, tentatives).
 *  4. `questions` + `options` : contenu ; `options.est_correcte` est la donnée
 *     sensible, jamais exposée au client.
 *  5. `qcm_questions` : liaison N-N QCM <-> question (agrégation).
 *  6. `tentatives_qcm` : passages, avec index unique partiel (une seule
 *     tentative EN_COURS par apprenant et par QCM).
 *  7. `reponses` + `reponse_options` : réponses et options cochées.
 *
 * Écrite à la main et IDEMPOTENTE (IF NOT EXISTS + garde sur les types). Les
 * contraintes sont déclarées dans les CREATE TABLE : elles sont créées avec la
 * table, de façon atomique. TypeORM exécute le tout dans une transaction.
 */
export class AddQcmSchema1786000000000 implements MigrationInterface {
  name = 'AddQcmSchema1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Types enum (créés seulement s'ils n'existent pas déjà) ---
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qcm_statut_enum') THEN
          CREATE TYPE "public"."qcm_statut_enum" AS ENUM('BROUILLON', 'NON_PUBLIE', 'PUBLIE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_anti_fraude_affichage_resultats_enum') THEN
          CREATE TYPE "public"."config_anti_fraude_affichage_resultats_enum" AS ENUM('IMMEDIAT', 'DIFFERE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'questions_type_enum') THEN
          CREATE TYPE "public"."questions_type_enum" AS ENUM('QCM', 'QCU', 'VRAI_FAUX', 'REPONSE_COURTE', 'ASSOCIATION');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tentatives_qcm_statut_enum') THEN
          CREATE TYPE "public"."tentatives_qcm_statut_enum" AS ENUM('EN_COURS', 'SOUMISE', 'ABANDONNEE_TIMER', 'NOTEE');
        END IF;
      END $$;
    `);

    // --- qcm ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qcm" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "module_id" uuid NOT NULL,
        "formateur_id" uuid,
        "titre" character varying(255) NOT NULL,
        "description" text,
        "statut" "public"."qcm_statut_enum" NOT NULL DEFAULT 'BROUILLON',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_qcm" PRIMARY KEY ("id"),
        CONSTRAINT "FK_qcm_module" FOREIGN KEY ("module_id")
          REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_qcm_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_qcm_module" ON "qcm" ("module_id")`,
    );

    // --- config_anti_fraude (1-1 avec qcm) ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "config_anti_fraude" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "qcm_id" uuid NOT NULL,
        "randomiser_questions" boolean NOT NULL DEFAULT false,
        "randomiser_options" boolean NOT NULL DEFAULT false,
        "nb_questions_tirees" integer,
        "duree_max_minutes" integer NOT NULL,
        "date_ouverture" TIMESTAMP WITH TIME ZONE NOT NULL,
        "date_fermeture" TIMESTAMP WITH TIME ZONE NOT NULL,
        "nb_tentatives_max" integer NOT NULL DEFAULT 1,
        "delai_entre_tentatives" integer NOT NULL DEFAULT 0,
        "blocage_sessions_multiples" boolean NOT NULL DEFAULT false,
        "affichage_resultats" "public"."config_anti_fraude_affichage_resultats_enum" NOT NULL,
        "score_min_validation" numeric(5,2) NOT NULL,
        "ponderation_formation" numeric(5,2) NOT NULL,
        "proctoring_webcam" boolean NOT NULL DEFAULT false,
        "desactiver_copier_coller" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_config_anti_fraude" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_config_anti_fraude_qcm" UNIQUE ("qcm_id"),
        CONSTRAINT "CHK_config_anti_fraude_fenetre"
          CHECK ("date_ouverture" < "date_fermeture"),
        CONSTRAINT "CHK_config_anti_fraude_duree"
          CHECK ("duree_max_minutes" > 0),
        CONSTRAINT "CHK_config_anti_fraude_nb_questions_tirees"
          CHECK ("nb_questions_tirees" IS NULL OR "nb_questions_tirees" > 0),
        CONSTRAINT "CHK_config_anti_fraude_nb_tentatives"
          CHECK ("nb_tentatives_max" >= 1),
        CONSTRAINT "CHK_config_anti_fraude_delai"
          CHECK ("delai_entre_tentatives" >= 0),
        CONSTRAINT "CHK_config_anti_fraude_score_min"
          CHECK ("score_min_validation" >= 0 AND "score_min_validation" <= 100),
        CONSTRAINT "CHK_config_anti_fraude_ponderation"
          CHECK ("ponderation_formation" >= 0 AND "ponderation_formation" <= 100),
        CONSTRAINT "FK_config_anti_fraude_qcm" FOREIGN KEY ("qcm_id")
          REFERENCES "qcm"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // --- questions ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "enonce" text NOT NULL,
        "type" "public"."questions_type_enum" NOT NULL,
        "ponderation" numeric(6,2) NOT NULL DEFAULT 1,
        "explication" text,
        "niveau_difficulte" character varying(50),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_questions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_questions_ponderation" CHECK ("ponderation" > 0)
      )
    `);

    // --- options (est_correcte : jamais exposée au client) ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question_id" uuid NOT NULL,
        "texte" text NOT NULL,
        "est_correcte" boolean NOT NULL,
        "ordre" integer NOT NULL,
        CONSTRAINT "PK_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_options_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_options_question_ordre" ON "options" ("question_id", "ordre")`,
    );

    // --- qcm_questions (liaison N-N) ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qcm_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "qcm_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "ordre" integer NOT NULL,
        CONSTRAINT "PK_qcm_questions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_qcm_questions_qcm" FOREIGN KEY ("qcm_id")
          REFERENCES "qcm"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_qcm_questions_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_qcm_questions_qcm_question" ON "qcm_questions" ("qcm_id", "question_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_qcm_questions_question" ON "qcm_questions" ("question_id")`,
    );

    // --- tentatives_qcm ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tentatives_qcm" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apprenant_id" uuid NOT NULL,
        "qcm_id" uuid NOT NULL,
        "date_debut" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date_limite" TIMESTAMP WITH TIME ZONE NOT NULL,
        "date_fin" TIMESTAMP WITH TIME ZONE,
        "duree_effective" integer,
        "score" numeric(5,2),
        "est_reussie" boolean,
        "statut" "public"."tentatives_qcm_statut_enum" NOT NULL DEFAULT 'EN_COURS',
        "plan_tirage" jsonb,
        CONSTRAINT "PK_tentatives_qcm" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tentatives_qcm_score"
          CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
        CONSTRAINT "FK_tentatives_qcm_apprenant" FOREIGN KEY ("apprenant_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_tentatives_qcm_qcm" FOREIGN KEY ("qcm_id")
          REFERENCES "qcm"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    // Index unique PARTIEL : au plus une tentative EN_COURS par (apprenant, QCM).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tentatives_qcm_en_cours" ON "tentatives_qcm" ("apprenant_id", "qcm_id") WHERE "statut" = 'EN_COURS'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tentatives_qcm_apprenant_qcm" ON "tentatives_qcm" ("apprenant_id", "qcm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tentatives_qcm_qcm" ON "tentatives_qcm" ("qcm_id")`,
    );

    // --- reponses ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reponses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tentative_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "est_correcte" boolean,
        "points_obtenus" numeric(6,2),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reponses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reponses_tentative" FOREIGN KEY ("tentative_id")
          REFERENCES "tentatives_qcm"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_reponses_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reponses_tentative_question" ON "reponses" ("tentative_id", "question_id")`,
    );

    // --- reponse_options (options cochées) ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reponse_options" (
        "reponse_id" uuid NOT NULL,
        "option_id" uuid NOT NULL,
        CONSTRAINT "PK_reponse_options" PRIMARY KEY ("reponse_id", "option_id"),
        CONSTRAINT "FK_reponse_options_reponse" FOREIGN KEY ("reponse_id")
          REFERENCES "reponses"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_reponse_options_option" FOREIGN KEY ("option_id")
          REFERENCES "options"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reponse_options_option" ON "reponse_options" ("option_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordre inverse des dépendances. DROP TABLE emporte index et contraintes.
    await queryRunner.query(`DROP TABLE IF EXISTS "reponse_options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reponses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tentatives_qcm"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "qcm_questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "config_anti_fraude"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "qcm"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."tentatives_qcm_statut_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."questions_type_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."config_anti_fraude_affichage_resultats_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."qcm_statut_enum"`);
  }
}
