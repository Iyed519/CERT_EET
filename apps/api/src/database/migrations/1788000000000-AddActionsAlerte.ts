import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-SUIVI-03 — Traiter une alerte de décrochage (DS-14 P2).
 *
 *  1. Type `actions_alerte_type_enum` (TRAITEMENT, REOUVERTURE).
 *  2. Table `actions_alerte` : alerte (CASCADE : suit sa formation), auteur
 *     (SET NULL : l'action reste si le compte disparaît), type, commentaire
 *     (1 à 2 000 caractères), date. Index (alerte, date).
 *  3. Déclencheur `trg_actions_alerte_immuable` : aucune modification d'une
 *     action (l'historique n'est jamais écrasé) ; seule la remise à NULL de
 *     l'auteur (suppression du compte) est permise.
 *
 * Idempotence : garde sur le type, IF NOT EXISTS, CREATE OR REPLACE,
 * DROP ... IF EXISTS. `down()` retire tout.
 */
export class AddActionsAlerte1788000000000 implements MigrationInterface {
  name = 'AddActionsAlerte1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'actions_alerte_type_enum') THEN
          CREATE TYPE "public"."actions_alerte_type_enum" AS ENUM('TRAITEMENT', 'REOUVERTURE');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "actions_alerte" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "alerte_id" uuid NOT NULL,
        "auteur_id" uuid,
        "type" "public"."actions_alerte_type_enum" NOT NULL,
        "commentaire" text NOT NULL,
        "date_action" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_actions_alerte" PRIMARY KEY ("id"),
        CONSTRAINT "FK_actions_alerte_alerte" FOREIGN KEY ("alerte_id")
          REFERENCES "alertes_decrochage"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_actions_alerte_auteur" FOREIGN KEY ("auteur_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "CHK_actions_alerte_commentaire"
          CHECK (char_length(btrim("commentaire")) BETWEEN 1 AND 2000)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_actions_alerte_alerte"
        ON "actions_alerte" ("alerte_id", "date_action")
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actions_alerte_immuable() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.id = OLD.id AND NEW.alerte_id = OLD.alerte_id AND NEW.type = OLD.type
           AND NEW.commentaire = OLD.commentaire AND NEW.date_action = OLD.date_action
           AND NEW.auteur_id IS NULL THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Historique d''alerte immuable : action % non modifiable', OLD.id
          USING ERRCODE = 'check_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_actions_alerte_immuable ON actions_alerte`);
    await queryRunner.query(`
      CREATE TRIGGER trg_actions_alerte_immuable
        BEFORE UPDATE ON actions_alerte
        FOR EACH ROW EXECUTE FUNCTION actions_alerte_immuable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_actions_alerte_immuable ON actions_alerte`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS actions_alerte_immuable()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "actions_alerte"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."actions_alerte_type_enum"`);
  }
}
