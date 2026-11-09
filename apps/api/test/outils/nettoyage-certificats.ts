import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';

/**
 * Nettoyage des certificats d'une suite e2e (US-ATEL-09).
 *
 * Depuis US-ATEL-09, finaliser une correction ou réussir un QCM peut rendre un
 * apprenant de test éligible : un certificat est alors demandé et généré EN
 * ARRIÈRE-PLAN. Une suite qui supprime ses formations et ses utilisateurs doit
 * d'abord retirer ces certificats (FK RESTRICT). J'attends la fin des
 * générations en cours (sinon le PDF serait déposé après la suppression), puis
 * je supprime les objets S3, les lignes et leurs traces d'audit.
 */
export async function purgerCertificats(
  dataSource: DataSource,
  marqueurFormation: string,
): Promise<void> {
  const enCours = async (): Promise<number> => {
    const [{ n }] = (await dataSource.query(
      `SELECT count(*)::int AS n FROM certificats c JOIN formations f ON f.id = c.formation_id
        WHERE f.titre LIKE $1 AND c.statut IN ('EN_ATTENTE_GENERATION', 'EN_GENERATION')
          AND c.derniere_erreur IS NULL`,
      [`${marqueurFormation}%`],
    )) as Array<{ n: number }>;
    return n;
  };
  const fin = Date.now() + 15_000;
  while ((await enCours()) > 0 && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 100));
  }

  const lignes = (await dataSource.query(
    `SELECT c.id FROM certificats c JOIN formations f ON f.id = c.formation_id
      WHERE f.titre LIKE $1`,
    [`${marqueurFormation}%`],
  )) as Array<{ id: string }>;
  if (lignes.length === 0) return;
  const ids = lignes.map((l) => l.id);

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });
  try {
    await s3
      .send(
        new DeleteObjectsCommand({
          Bucket: process.env.S3_BUCKET_LIVRABLES ?? 'livrables',
          Delete: { Objects: ids.map((id) => ({ Key: `certificats/${id}.pdf` })) },
        }),
      )
      .catch(() => undefined);
  } finally {
    s3.destroy();
  }

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query('DELETE FROM certificats WHERE id = ANY($1)', [ids]);
    await qr.query("SET LOCAL app.audit_maintenance = 'on'");
    await qr.query('DELETE FROM audit_logs WHERE cible = ANY($1)', [ids]);
    await qr.commitTransaction();
  } catch (erreur) {
    await qr.rollbackTransaction();
    throw erreur;
  } finally {
    await qr.release();
  }
}
