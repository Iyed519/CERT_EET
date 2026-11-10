/**
 * Règles PURES du suivi pédagogique d'une formation (US-SUIVI-01, DS-14 P1) :
 * aucune base, aucune horloge (l'instant présent est fourni), aucune E/S.
 */

/** Au-delà de ce nombre de jours sans connexion, un inscrit actif est « inactif ». */
export const JOURS_INACTIVITE = 7;

const JOUR_MS = 86_400_000;

export interface EtatRisque {
  /** Inscription en cours et aucune connexion depuis plus de `JOURS_INACTIVITE` jours. */
  inactif: boolean;
  /** Jours entiers depuis la dernière connexion (ou l'inscription si jamais connecté). */
  joursSansConnexion: number;
}

/**
 * Inactivité d'un inscrit. La référence est la dernière connexion, ou la date
 * d'inscription si l'apprenant ne s'est jamais connecté depuis : un inscrit
 * récent n'est donc jamais signalé (pas de faux positif). Seule une
 * inscription EN_COURS peut être « inactive » (une inscription terminée ou
 * suspendue n'attend plus d'activité).
 */
export function etatRisque(
  statutInscription: string,
  derniereConnexion: Date | null,
  dateInscription: Date,
  maintenant: Date,
): EtatRisque {
  const reference =
    derniereConnexion && derniereConnexion > dateInscription ? derniereConnexion : dateInscription;
  const jours = Math.max(0, Math.floor((maintenant.getTime() - reference.getTime()) / JOUR_MS));
  return {
    inactif: statutInscription === 'EN_COURS' && jours > JOURS_INACTIVITE,
    joursSansConnexion: jours,
  };
}

/**
 * Avancement d'un apprenant (%) : QCM publiés réussis + ateliers publiés notés,
 * rapportés au nombre d'évaluations publiées ; 0 sans évaluation publiée.
 * Arrondi à 1 décimale.
 */
export function avancement(
  qcmReussis: number,
  qcmPublies: number,
  ateliersNotes: number,
  ateliersPublies: number,
): number {
  const total = qcmPublies + ateliersPublies;
  if (total <= 0) return 0;
  const fait = Math.min(qcmReussis, qcmPublies) + Math.min(ateliersNotes, ateliersPublies);
  return Math.round((fait / total) * 1000) / 10;
}

/** Moyenne arrondie à 2 décimales ; null pour une liste vide. */
export function moyenne(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const s = valeurs.reduce((a, b) => a + b, 0);
  return Math.round((s / valeurs.length) * 100) / 100;
}

export interface Tranche {
  /** « 0–9 », …, « 90–100 ». */
  tranche: string;
  min: number;
  max: number;
  effectif: number;
}

/**
 * Histogramme des moyennes en 10 tranches de 10 points ; 100 tombe dans la
 * dernière tranche (90–100). Les valeurs hors [0, 100] sont bornées.
 */
export function histogramme(valeurs: number[]): Tranche[] {
  const tranches: Tranche[] = Array.from({ length: 10 }, (_, i) => ({
    tranche: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`,
    min: i * 10,
    max: i === 9 ? 100 : i * 10 + 9,
    effectif: 0,
  }));
  for (const v of valeurs) {
    const borne = Math.min(100, Math.max(0, v));
    tranches[Math.min(9, Math.floor(borne / 10))].effectif += 1;
  }
  return tranches;
}

/** La plus récente des dates fournies (null si aucune). */
export function plusRecente(...dates: Array<Date | null | undefined>): Date | null {
  let r: Date | null = null;
  for (const d of dates) if (d && (!r || d > r)) r = d;
  return r;
}
