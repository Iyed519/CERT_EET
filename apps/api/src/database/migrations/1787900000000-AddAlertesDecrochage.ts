import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-SUIVI-02 — Alertes de décrochage (DS-14 P2).
 *
 *  1. Types `alertes_decrochage_critere_enum` (INACTIVITE, ECHECS_QCM,
 *     LIVRABLE_EN_RETARD, SCORE_EN_CHUTE) et `alertes_decrochage_statut_enum`
 *     (OUVERTE, TRAITEE).
 *  2. Table `alertes_decrochage` : formation (CASCADE : l'alerte n'a pas de
 *     sens sans sa formation), apprenant (RESTRICT), critère, statut, faits
 *     (`donnees` jsonb), suggestion d'action, dates ; traitement (date, auteur
 *     SET NULL) pour US-SUIVI-03. CHECK : une alerte OUVERTE n'a pas de date
 *     de traitement, une alerte TRAITEE en a une.
 *  3. Index unique partiel `UQ_alertes_ouvertes` (formation, apprenant,
 *     critère) WHERE statut = 'OUVERTE' : une seule alerte ouverte par
 *     critère — le balayage est idempotent ; index (formation, statut) pour
 *     les listes et les badges.
 *
 * Idempotence : gardes sur les types, IF NOT EXISTS. `down()` retire tout.
 */
export class AddAlertesDecrochage1787900000000 implements MigrationInterface {
  name = 'AddAlertesDecrochage1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alertes_decrochage_critere_enum') THEN
          CREATE TYPE "public"."alertes_decrochage_critere_enum"
            AS ENUM('INACTIVITE', 'ECHECS_QCM', 'LIVRABLE_EN_RETARD', 'SCORE_EN_CHUTE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alertes_decrochage_statut_enum') THEN
          CREATE TYPE "public"."alertes_decrochage_statut_enum" AS ENUM('OUVERTE', 'TRAITEE');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alertes_decrochage" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "formation_id" uuid NOT NULL,
        "apprenant_id" uuid NOT NULL,
        "critere" "public"."alertes_decrochage_critere_enum" NOT NULL,
        "statut" "public"."alertes_decrochage_statut_enum" NOT NULL DEFAULT 'OUVERTE',
        "donnees" jsonb NOT NULL DEFAULT '{}',
        "suggestion" character varying(300) NOT NULL,
        "date_creation" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date_traitement" TIMESTAMP WITH TIME ZONE,
        "traite_par" uuid,
        CONSTRAINT "PK_alertes_decrochage" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alertes_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_alertes_apprenant" FOREIGN KEY ("apprenant_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_alertes_traite_par" FOREIGN KEY ("traite_par")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "CHK_alertes_traitement" CHECK (
          ("statut" = 'OUVERTE' AND "date_traitement" IS NULL)
          OR ("statut" = 'TRAITEE' AND "date_traitement" IS NOT NULL)
        ),
        CONSTRAINT "CHK_alertes_suggestion" CHECK (char_length(btrim("suggestion")) >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_alertes_ouvertes"
        ON "alertes_decrochage" ("formation_id", "apprenant_id", "critere")
        WHERE "statut" = 'OUVERTE'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_alertes_formation_statut"
        ON "alertes_decrochage" ("formation_id", "statut")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "alertes_decrochage"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."alertes_decrochage_statut_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."alertes_decrochage_critere_enum"`);
  }
}
