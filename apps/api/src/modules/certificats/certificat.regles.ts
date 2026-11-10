import { ConflictException } from '@nestjs/common';
import { MotifRevocation } from '../../database/enums/motif-revocation.enum';
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

export const MESSAGE_CERTIFICAT_EN_PREPARATION =
  'Votre certificat est en cours d’émission : il sera téléchargeable dans quelques instants.';
export const MESSAGE_CERTIFICAT_REVOQUE =
  'Ce certificat a été révoqué : il n’est plus téléchargeable.';

/**
 * Téléchargement par son titulaire (US-CERT-03) : un certificat ACTIF — ou
 * EXPIRE (US-CERT-07 : le document reste authentique, sa vérification publique
 * dit « Expiré ») — se télécharge ; en préparation ou révoqué -> 409 (état).
 */
export function verifierTelechargeable(statut: StatutCertificat): void {
  if (statut === StatutCertificat.REVOQUE) {
    throw new ConflictException(MESSAGE_CERTIFICAT_REVOQUE);
  }
  if (statut !== StatutCertificat.ACTIF && statut !== StatutCertificat.EXPIRE) {
    throw new ConflictException(MESSAGE_CERTIFICAT_EN_PREPARATION);
  }
}

/** Nom du fichier téléchargé : « certificat-<titre-sans-accents>.pdf ». */
export function nomFichierCertificat(titreFormation: string): string {
  const base = titreFormation
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `certificat-${base || 'formation'}.pdf`;
}

/** Libellés des motifs de révocation (DS-07), pour l'email et l'interface. */
export const LIBELLES_MOTIF_REVOCATION: Readonly<Record<MotifRevocation, string>> = {
  [MotifRevocation.FRAUDE]: 'Fraude avérée',
  [MotifRevocation.ERREUR_ADMIN]: 'Erreur administrative',
  [MotifRevocation.DISCIPLINAIRE]: 'Décision disciplinaire',
  [MotifRevocation.JUDICIAIRE]: 'Décision judiciaire',
};

export const MESSAGE_DEJA_REVOQUE =
  'Ce certificat est déjà révoqué : la révocation est définitive.';
export const MESSAGE_PAS_REVOCABLE =
  'Seul un certificat émis (actif) peut être révoqué : celui-ci est encore en préparation.';

/**
 * Révocation (US-CERT-06, DS-07) : seul un certificat ACTIF se révoque ; déjà
 * révoqué ou encore en préparation -> 409 (état).
 */
export function verifierRevocable(statut: StatutCertificat): void {
  if (statut === StatutCertificat.REVOQUE) throw new ConflictException(MESSAGE_DEJA_REVOQUE);
  if (statut !== StatutCertificat.ACTIF) throw new ConflictException(MESSAGE_PAS_REVOCABLE);
}

// ---------------------------------------------------------------------
//  US-CERT-02 — Échecs de génération
// ---------------------------------------------------------------------

/**
 * Un certificat resté EN_GENERATION au-delà de ce délai est considéré comme
 * bloqué (worker arrêté en cours de route) : la reprise le remet en attente
 * et le renvoie dans la file. Largement au-dessus d'une génération normale
 * (quelques secondes, trois tentatives espacées de 5 / 10 / 20 s).
 */
export const REPRISE_CERTIFICATS = { bloqueApresMinutes: 15, intervalleMinutes: 5 } as const;

export const MESSAGE_REPRISE_AUTOMATIQUE =
  'Génération interrompue (worker arrêté) : reprise automatique.';

// ---------------------------------------------------------------------
//  US-CERT-07 — Expiration
// ---------------------------------------------------------------------

/** Balayage d'expiration : toutes les heures (une expiration au plus une heure en retard). */
export const EXPIRATION_CERTIFICATS = { intervalleMinutes: 60 } as const;

/** Émis (PDF, empreinte, lien public) : ACTIF, REVOQUE ou EXPIRE. */
export function estEmis(statut: StatutCertificat): boolean {
  return (
    statut === StatutCertificat.ACTIF ||
    statut === StatutCertificat.REVOQUE ||
    statut === StatutCertificat.EXPIRE
  );
}

// ---------------------------------------------------------------------
//  US-CERT-08 — Réémission après révocation pour erreur
// ---------------------------------------------------------------------

export const MESSAGE_PAS_REVOQUE_REEMISSION = 'Seul un certificat révoqué peut être réémis.';
export const MESSAGE_MOTIF_REEMISSION =
  'Seule une révocation pour erreur administrative permet de réémettre le certificat.';
export const MESSAGE_DEJA_REEMIS = 'Ce certificat a déjà été réémis.';

/** Réémission (US-CERT-08) : révoqué, et pour ERREUR_ADMIN seulement (409 sinon). */
export function verifierReemettable(statut: string, motif: string | null): void {
  if (statut !== StatutCertificat.REVOQUE)
    throw new ConflictException(MESSAGE_PAS_REVOQUE_REEMISSION);
  if (motif !== MotifRevocation.ERREUR_ADMIN) throw new ConflictException(MESSAGE_MOTIF_REEMISSION);
}
