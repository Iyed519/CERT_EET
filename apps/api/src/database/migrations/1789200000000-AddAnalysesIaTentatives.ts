import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-IA-10 — Analyse des points faibles par l'IA, conservée par tentative.
 *
 * Table `analyses_ia_tentatives` : une analyse RÉUSSIE par tentative notée et
 * par version (avec ou sans corrigé : la version de l'apprenant n'a jamais vu
 * les bonnes réponses). Une tentative notée est figée : l'analyse reste
 * valable, le rapport PDF la réutilise au lieu de rappeler le modèle.
 * Supprimée avec la tentative (CASCADE). Aucune donnée d'identité : ni nom,
 * ni e-mail ne sont envoyés au modèle.
 *
 * Aucune table existante n'est modifiée. Down : suppression de la table.
 */
export class AddAnalysesIaTentatives1789200000000 implements MigrationInterface {
  name = 'AddAnalysesIaTentatives1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analyses_ia_tentatives" (
        "tentative_id" uuid NOT NULL,
        "avec_corrige" boolean NOT NULL,
        "modele" varchar(100) NOT NULL,
        "contenu" jsonb NOT NULL,
        "date_creation" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analyses_ia_tentatives" PRIMARY KEY ("tentative_id", "avec_corrige"),
        CONSTRAINT "CHK_analyses_ia_contenu" CHECK (jsonb_typeof("contenu") = 'object'),
        CONSTRAINT "FK_analyses_ia_tentative" FOREIGN KEY ("tentative_id")
          REFERENCES "tentatives_qcm"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analyses_ia_tentatives"`);
  }
}
