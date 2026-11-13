import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-QCM-15 — Alertes de la surveillance par IA (détection dans le navigateur).
 *
 * Table `evenements_surveillance` : une ligne par anomalie détectée pendant une
 * tentative (type, score du modèle, photo prise à l'instant de la détection,
 * statut d'examen par le formateur). Supprimée avec la tentative (CASCADE) ;
 * examinateur mis à NULL si son compte disparaît.
 *
 * Index : alertes d'une tentative (tentative, date) et file du formateur
 * (statut, date).
 *
 * Aucune table existante n'est modifiée. Down : suppression de la table.
 */
export class AddEvenementsSurveillance1789300000000 implements MigrationInterface {
  name = 'AddEvenementsSurveillance1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "evenements_surveillance" (
        "id" uuid NOT NULL,
        "tentative_id" uuid NOT NULL,
        "type" varchar(30) NOT NULL,
        "confiance" numeric(4,3),
        "cle_stockage" varchar(255) NOT NULL,
        "taille_octets" integer NOT NULL,
        "type_contenu" varchar(30) NOT NULL,
        "detecte_le" timestamptz NOT NULL DEFAULT now(),
        "statut" varchar(10) NOT NULL DEFAULT 'NOUVEAU',
        "examine_par" uuid,
        "examine_le" timestamptz,
        CONSTRAINT "PK_evenements_surveillance" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_evenements_surveillance_type" CHECK ("type" IN (
          'PERSONNES_MULTIPLES', 'ABSENCE', 'TELEPHONE', 'DOCUMENT',
          'CAMERA_MASQUEE', 'ONGLET_QUITTE', 'ANALYSE_INDISPONIBLE')),
        CONSTRAINT "CHK_evenements_surveillance_statut" CHECK ("statut" IN ('NOUVEAU', 'EXAMINE')),
        CONSTRAINT "CHK_evenements_surveillance_confiance"
          CHECK ("confiance" IS NULL OR "confiance" BETWEEN 0 AND 1),
        CONSTRAINT "FK_evenements_surveillance_tentative" FOREIGN KEY ("tentative_id")
          REFERENCES "tentatives_qcm"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_evenements_surveillance_examinateur" FOREIGN KEY ("examine_par")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_evenements_surveillance_tentative"
        ON "evenements_surveillance" ("tentative_id", "detecte_le")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_evenements_surveillance_statut"
        ON "evenements_surveillance" ("statut", "detecte_le" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_evenements_surveillance_statut"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_evenements_surveillance_tentative"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "evenements_surveillance"`);
  }
}
