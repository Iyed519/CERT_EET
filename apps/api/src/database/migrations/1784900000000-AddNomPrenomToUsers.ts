import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * US-CPT-05 — Ajout des colonnes nom + prenom à users.
 *
 * L'auto-inscription publique (ADR-11) demande nom et prénom à l'inscrit. La
 * table users est déjà peuplée (au moins l'admin bootstrap seedé en INF04),
 * donc on NE PEUT PAS ajouter directement des colonnes NOT NULL. On les ajoute
 * en NULLABLE : les comptes existants restent valides sans nom/prénom, tandis
 * que tout nouveau compte auto-inscrit fournit toujours les deux (c'est le
 * RegisterDto qui l'impose côté application). Écrite à la main pour rester
 * cohérente avec le style du projet.
 */
export class AddNomPrenomToUsers1784900000000 implements MigrationInterface {
  name = 'AddNomPrenomToUsers1784900000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "nom" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "prenom" character varying(100)`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "prenom"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "nom"`);
  }
}
