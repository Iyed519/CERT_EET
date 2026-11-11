import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-FORM-07 — Demandes d'affectation : un formateur demande à enseigner une
 * formation existante où il n'est pas encore affecté.
 *
 * - `motif` : 10 à 1 000 caractères (hors blancs de bord) ;
 * - cycle EN_ATTENTE -> ACCEPTEE | REFUSEE (décision d'un administrateur) |
 *   ANNULEE (par le formateur) ; une décision porte toujours son auteur
 *   (`traite_par`, sauf annulation) et sa date (`traite_le`) ;
 * - `motif_refus` obligatoire pour REFUSEE (10 à 1 000), interdit sinon ;
 * - au plus UNE demande EN_ATTENTE par (formation, formateur) : index unique
 *   PARTIEL, filet de la règle vérifiée par le service sous verrou.
 *
 * Suppression de la formation ou du compte -> demandes supprimées (CASCADE) ;
 * suppression de l'administrateur décideur -> `traite_par` à NULL.
 */
export class AddDemandesAffectation1788800000000 implements MigrationInterface {
  name = 'AddDemandesAffectation1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "demandes_affectation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "formation_id" uuid NOT NULL,
        "formateur_id" uuid NOT NULL,
        "motif" varchar(1000) NOT NULL,
        "statut" varchar(20) NOT NULL DEFAULT 'EN_ATTENTE',
        "motif_refus" varchar(1000),
        "traite_par" uuid,
        "traite_le" timestamptz,
        "cree_le" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_demandes_affectation" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_demandes_affectation_statut"
          CHECK ("statut" IN ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE', 'ANNULEE')),
        CONSTRAINT "CHK_demandes_affectation_motif"
          CHECK (char_length(btrim("motif")) BETWEEN 10 AND 1000),
        CONSTRAINT "CHK_demandes_affectation_refus" CHECK (
          ("statut" = 'REFUSEE' AND "motif_refus" IS NOT NULL
             AND char_length(btrim("motif_refus")) BETWEEN 10 AND 1000)
          OR ("statut" <> 'REFUSEE' AND "motif_refus" IS NULL)),
        CONSTRAINT "CHK_demandes_affectation_traitement" CHECK (
          ("statut" = 'EN_ATTENTE' AND "traite_le" IS NULL AND "traite_par" IS NULL)
          OR ("statut" = 'ANNULEE' AND "traite_le" IS NOT NULL)
          OR ("statut" IN ('ACCEPTEE', 'REFUSEE') AND "traite_le" IS NOT NULL)),
        CONSTRAINT "FK_demandes_affectation_formation" FOREIGN KEY ("formation_id")
          REFERENCES "formations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_demandes_affectation_formateur" FOREIGN KEY ("formateur_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_demandes_affectation_traite_par" FOREIGN KEY ("traite_par")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_demandes_affectation_en_attente"
        ON "demandes_affectation" ("formation_id", "formateur_id") WHERE "statut" = 'EN_ATTENTE'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_demandes_affectation_statut_cree"
        ON "demandes_affectation" ("statut", "cree_le" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_demandes_affectation_formateur"
        ON "demandes_affectation" ("formateur_id", "cree_le" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_demandes_affectation_formateur"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_demandes_affectation_statut_cree"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_demandes_affectation_en_attente"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "demandes_affectation"`);
  }
}
