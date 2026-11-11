/**
 * Règles d'éligibilité au démarrage d'une tentative (US-QCM-05, DS-02 étape 1).
 *
 * Fonctions PURES, dans un fichier à part (comme qcm-publication.regles.ts) :
 * elles ne lisent ni la base ni l'horloge du serveur Node. L'instant
 * `maintenant` leur est TOUJOURS fourni par l'appelant, qui le lit dans
 * PostgreSQL (`SELECT now()`) : une seule horloge décide de toutes les règles
 * (décision D12), la même qui date `date_debut` de la tentative.
 *
 * Chaque règle renvoie `null` si elle est respectée, sinon le refus précis
 * (motif + message français + date de réouverture éventuelle). Le service
 * décide quoi en faire (409 + audit) ; je ne lève pas d'exception ici, car un
 * refus ne doit pas annuler la transaction qui a pu clôturer une tentative
 * expirée (décision D11).
 */

/** Motif machine d'un refus, repris de DS-02 (`raison`). */
export type RaisonRefus =
  | 'hors_fenetre'
  | 'tentatives_epuisees'
  | 'delai_non_respecte'
  // US-QCM-12 — QCM surveillé par webcam sans consentement de l'apprenant.
  | 'consentement_surveillance_requis';

/** US-QCM-12 — refus sans consentement, avec la procédure alternative. */
export const MESSAGE_CONSENTEMENT_SURVEILLANCE =
  'Ce QCM est surveillé par webcam : votre consentement est nécessaire pour le commencer. ' +
  'Si vous refusez ou n’avez pas de caméra, demandez à votre formateur un passage surveillé en présentiel.';

/**
 * US-QCM-12 — Consentement exigé pour CRÉER une tentative d'un QCM surveillé
 * (une reprise n'en redemande pas : il a été donné à la création).
 */
export function verifierConsentement(
  surveillance: boolean,
  consentement: boolean,
): RefusDemarrage | null {
  if (!surveillance || consentement) return null;
  return {
    raison: 'consentement_surveillance_requis',
    message: MESSAGE_CONSENTEMENT_SURVEILLANCE,
    dateReouverture: null,
  };
}

/** Refus d'une règle : motif, message affichable, date de réouverture éventuelle. */
export interface RefusDemarrage {
  raison: RaisonRefus;
  message: string;
  // Instant à partir duquel un nouveau démarrage pourra réussir, quand il existe.
  dateReouverture: Date | null;
}

const MS_PAR_MINUTE = 60_000;
const MS_PAR_HEURE = 3_600_000;

/**
 * Fenêtre d'ouverture, semi-ouverte [ouverture, fermeture) — exactement la
 * règle d'`etatFenetre` (US-QCM-04) : le bouton « Commencer » et le serveur
 * ne peuvent pas se contredire (décision D9).
 *  - avant l'ouverture : refus, réouverture = date d'ouverture ;
 *  - à partir de la fermeture : refus définitif, pas de réouverture.
 */
export function verifierFenetre(
  maintenant: Date,
  ouverture: Date,
  fermeture: Date,
): RefusDemarrage | null {
  const t = maintenant.getTime();
  if (t < new Date(ouverture).getTime()) {
    return {
      raison: 'hors_fenetre',
      message: 'Ce QCM n’est pas encore ouvert.',
      dateReouverture: new Date(ouverture),
    };
  }
  if (t >= new Date(fermeture).getTime()) {
    return {
      raison: 'hors_fenetre',
      message: 'Ce QCM est fermé : sa fenêtre d’ouverture est passée.',
      dateReouverture: null,
    };
  }
  return null;
}

/**
 * Quota : TOUTES les tentatives comptent, quel que soit leur statut (DS-02 :
 * `COUNT(*)` sans filtre — décision D6). Une tentative abandonnée au timer
 * est une tentative consommée.
 */
export function verifierQuota(
  nbTentativesPassees: number,
  nbTentativesMax: number,
): RefusDemarrage | null {
  if (nbTentativesPassees < nbTentativesMax) {
    return null;
  }
  const pluriel = nbTentativesMax > 1 ? 's' : '';
  return {
    raison: 'tentatives_epuisees',
    message: `Vous avez utilisé ${nbTentativesMax === 1 ? 'votre' : `vos ${nbTentativesMax}`} tentative${pluriel} autorisée${pluriel} pour ce QCM.`,
    dateReouverture: null,
  };
}

/**
 * Délai minimal entre deux tentatives, en heures (DS-12). Il court depuis la
 * FIN de la tentative précédente, ou depuis son début si elle n'a pas de fin
 * (décision D6). Un délai de 0 désactive la règle.
 *
 * Si la date de réouverture tombe à la fermeture du QCM ou après, je le dis :
 * l'apprenant ne pourra plus repasser ce QCM, inutile de lui donner une date.
 */
export function verifierDelai(
  maintenant: Date,
  precedente: { dateDebut: Date; dateFin: Date | null } | null,
  delaiHeures: number,
  fermeture: Date,
): RefusDemarrage | null {
  if (!precedente || delaiHeures <= 0) {
    return null;
  }
  const depart = new Date(precedente.dateFin ?? precedente.dateDebut).getTime();
  const reouverture = new Date(depart + delaiHeures * MS_PAR_HEURE);
  if (maintenant.getTime() >= reouverture.getTime()) {
    return null;
  }
  if (reouverture.getTime() >= new Date(fermeture).getTime()) {
    return {
      raison: 'delai_non_respecte',
      message: `Un délai de ${delaiHeures} h est imposé entre deux tentatives : le QCM sera fermé d’ici là.`,
      dateReouverture: null,
    };
  }
  return {
    raison: 'delai_non_respecte',
    message: `Un délai de ${delaiHeures} h est imposé entre deux tentatives.`,
    dateReouverture: reouverture,
  };
}

/**
 * Échéance absolue d'une tentative : début + durée, sans jamais dépasser la
 * fermeture du QCM (décision D5) — une tentative ne survit pas à sa fenêtre.
 */
export function calculerDateLimite(debut: Date, dureeMaxMinutes: number, fermeture: Date): Date {
  const finDuree = new Date(debut).getTime() + dureeMaxMinutes * MS_PAR_MINUTE;
  return new Date(Math.min(finDuree, new Date(fermeture).getTime()));
}
