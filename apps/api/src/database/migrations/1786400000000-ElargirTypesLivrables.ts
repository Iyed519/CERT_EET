import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-ATEL-01 (complément du 08/11) — Types de livrables : ajout des fichiers
 * de code source (js, ts, py, java, c, cpp, cs, php, sql, html, css, json,
 * ipynb) à la liste fermée. Seul le CHECK `CHK_ateliers_types_livrables`
 * change ; la liste reste identique à `EXTENSIONS_LIVRABLE` (atelier.regles.ts).
 *
 * down : rétablit la liste initiale. Il échoue (volontairement) si un atelier
 * utilise déjà un type de code : PostgreSQL refuse alors le CHECK, rien n'est
 * perdu en silence.
 */
const DOCUMENTS = `'pdf', 'zip', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'png', 'jpg'`;
const CODE = `'js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'sql', 'html', 'css', 'json', 'ipynb'`;

const check = (liste: string): string => `
  ALTER TABLE "ateliers" ADD CONSTRAINT "CHK_ateliers_types_livrables" CHECK (
    cardinality("types_livrables") >= 1
    AND "types_livrables" <@ ARRAY[${liste}]::character varying(10)[]
  )`;

export class ElargirTypesLivrables1786400000000 implements MigrationInterface {
  name = 'ElargirTypesLivrables1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ateliers" DROP CONSTRAINT IF EXISTS "CHK_ateliers_types_livrables"`,
    );
    await queryRunner.query(check(`${DOCUMENTS}, ${CODE}`));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ateliers" DROP CONSTRAINT IF EXISTS "CHK_ateliers_types_livrables"`,
    );
    await queryRunner.query(check(DOCUMENTS));
  }
}
