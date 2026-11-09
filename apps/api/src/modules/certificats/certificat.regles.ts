import { ConflictException } from '@nestjs/common';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';

/**
 * Règles PURES des certificats (US-CERT-01, DS-04, ADR-10) : aucune base,
 * aucune horloge, aucune entrée/sortie.
 */

/** Organisme émetteur imprimé sur chaque certificat (DS-04). */
export const ORGANISME_EMETTEUR = 'ESPRIT Entreprise';

/** Mentions, du seuil le plus haut au plus bas (score sur 100). */
export const MENTIONS: ReadonlyArray<{ seuil: number; mention: string }> = [
  { seuil: 80, mention: 'Très bien' },
  { seuil: 70, mention: 'Bien' },
  { seuil: 60, mention: 'Assez bien' },
  { seuil: 0, mention: 'Passable' },
];

/** Mention d'un score final (0–100) ; hors bornes : erreur de programmation. */
export function mentionPour(score: number): string {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError(`Score final hors bornes : ${score}.`);
  }
  return (MENTIONS.find((m) => score >= m.seuil) ?? MENTIONS[MENTIONS.length - 1]).mention;
}

/** Score arrondi au centième (la colonne garde deux décimales). */
export function arrondiScore(score: number): number {
  return Math.round(score * 100) / 100;
}

/**
 * URL publique de vérification : elle n'encode QUE l'identifiant du
 * certificat (UUID aléatoire) — aucune donnée personnelle dans le QR (DS-04).
 */
export function urlVerification(baseUrl: string, certificatId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/verifier/${certificatId}`;
}

/** Clé de l'objet PDF dans le stockage (même bucket, préfixe dédié). */
export function cleStockageCertificat(certificatId: string): string {
  return `certificats/${certificatId}.pdf`;
}

/** Le worker ne prend qu'un certificat en attente (idempotence, reprise). */
export function estAGenerer(statut: StatutCertificat): boolean {
  return statut === StatutCertificat.EN_ATTENTE_GENERATION;
}

export const MESSAGE_PAS_RELANCABLE =
  'Seul un certificat en attente ou bloqué en génération peut être relancé.';

/** Relance manuelle (administrateur) : jamais un certificat ACTIF ou révoqué. */
export function verifierRelancable(statut: StatutCertificat): void {
  if (
    statut !== StatutCertificat.EN_ATTENTE_GENERATION &&
    statut !== StatutCertificat.EN_GENERATION
  ) {
    throw new ConflictException(MESSAGE_PAS_RELANCABLE);
  }
}

/** Message d'erreur conservé en base : une ligne, 500 caractères au plus. */
export function resumeErreur(erreur: unknown): string {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  const ligne = texte.replace(/\s+/g, ' ').trim() || 'Erreur inconnue';
  return ligne.length > 500 ? `${ligne.slice(0, 497)}...` : ligne;
}
