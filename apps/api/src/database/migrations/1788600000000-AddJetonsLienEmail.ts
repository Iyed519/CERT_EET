import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-AUTH-06 — Jetons des liens envoyés par email (réinitialisation du mot de
 * passe ; activation d'un compte importé, US-CPT-02).
 *
 * Le jeton lui-même n'est JAMAIS stocké : seule son empreinte SHA-256
 * (`empreinte`, unique) l'est. Un jeton est à usage unique (`utilise_le`) et à
 * durée limitée (`expire_le`) ; la consommation est un seul UPDATE conditionnel
 * (non utilisé ET non expiré), donc atomique face à des clics simultanés.
 * `objet` borne les usages (liste fermée) : un jeton de réinitialisation ne
 * peut pas servir d'activation, et inversement.
 *
 * Suppression du compte -> jetons supprimés (CASCADE).
 */
export class AddJetonsLienEmail1788600000000 implements MigrationInterface {
  name = 'AddJetonsLienEmail1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jetons_lien_email" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "objet" varchar(30) NOT NULL,
        "empreinte" char(64) NOT NULL,
        "expire_le" timestamptz NOT NULL,
        "utilise_le" timestamptz,
        "cree_le" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_jetons_lien_email" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_jetons_lien_email_empreinte" UNIQUE ("empreinte"),
        CONSTRAINT "CHK_jetons_lien_email_objet"
          CHECK ("objet" IN ('REINITIALISATION_MDP', 'ACTIVATION_COMPTE')),
        CONSTRAINT "CHK_jetons_lien_email_dates" CHECK ("expire_le" > "cree_le"),
        CONSTRAINT "FK_jetons_lien_email_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_jetons_lien_email_user_objet"
        ON "jetons_lien_email" ("user_id", "objet") WHERE "utilise_le" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jetons_lien_email_user_objet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jetons_lien_email"`);
  }
}
