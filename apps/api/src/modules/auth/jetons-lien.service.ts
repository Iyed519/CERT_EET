import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import * as crypto from 'crypto';

/** Usages autorisés d'un lien envoyé par email (liste fermée, cf. migration). */
export type ObjetJetonLien = 'REINITIALISATION_MDP' | 'ACTIVATION_COMPTE';

/** Empreinte SHA-256 (hex) d'un jeton : seule forme stockée en base. */
export function empreinteJeton(jeton: string): string {
  return crypto.createHash('sha256').update(jeton).digest('hex');
}

/**
 * Primitive « lien email à usage unique » (US-AUTH-06, réutilisée par
 * US-CPT-02 pour l'activation des comptes importés).
 *
 * - `emettre` : jeton aléatoire de 256 bits (base64url) ; seule son empreinte
 *   est enregistrée, avec l'échéance. Les jetons encore valables du même
 *   compte et du même objet sont retirés : seul le dernier lien fonctionne.
 * - `consommer` : un seul UPDATE conditionnel (non utilisé, non expiré, bon
 *   objet) marque le jeton utilisé et rend le compte ; deux consommations
 *   simultanées -> une seule réussit.
 *
 * Les deux méthodes acceptent le gestionnaire d'une transaction en cours.
 */
@Injectable()
export class JetonsLienService {
  constructor(private readonly dataSource: DataSource) {}

  async emettre(
    userId: string,
    objet: ObjetJetonLien,
    dureeSecondes: number,
    em: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const jeton = crypto.randomBytes(32).toString('base64url');
    await em.query(
      `DELETE FROM jetons_lien_email WHERE user_id = $1 AND objet = $2 AND utilise_le IS NULL`,
      [userId, objet],
    );
    await em.query(
      `INSERT INTO jetons_lien_email (user_id, objet, empreinte, expire_le)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [userId, objet, empreinteJeton(jeton), dureeSecondes],
    );
    return jeton;
  }

  async consommer(
    jeton: string,
    objet: ObjetJetonLien,
    em: EntityManager = this.dataSource.manager,
  ): Promise<string | null> {
    type Ligne = { user_id: string };
    const resultat = (await em.query(
      `UPDATE jetons_lien_email SET utilise_le = now()
        WHERE empreinte = $1 AND objet = $2 AND utilise_le IS NULL AND expire_le > now()
        RETURNING user_id`,
      [empreinteJeton(jeton), objet],
    )) as [Ligne[], number] | Ligne[];
    // Le pilote PostgreSQL de TypeORM renvoie [lignes, nombre] pour un UPDATE.
    const lignes = (Array.isArray(resultat[0]) ? resultat[0] : resultat) as Ligne[];
    return lignes[0]?.user_id ?? null;
  }
}
