/**
 * IA — Les 16 variables du modèle de prédiction du risque, calculées à partir
 * des tables Cert_EET. Fonctions PURES : aucune base, aucune horloge
 * (l'instant de calcul est fourni).
 *
 * Mêmes définitions que `ml/risque/variables.py` (code d'entraînement) :
 *  - le temps est compté en JOURS ENTIERS depuis le début de la formation
 *    (jour 0 = `formations.date_debut`, minuit UTC) ;
 *  - à l'instant de calcul, au jour J (la « coupure »), on n'utilise que ce
 *    qui s'est passé AVANT le jour J (anti-fuite) ;
 *  - une échéance future ne compte ni comme rendue ni comme non rendue ;
 *  - un échec est une note < 40/100 ;
 *  - `score_moyen` est vide sans note, `tendance_score` vide avec moins de
 *    2 notes (dernière note − moyenne des précédentes).
 *
 * Correspondance (ml/AUDIT_DONNEES.md §2) : un jour actif = au moins une
 * connexion (`audit_logs` LOGIN) ou un renouvellement de session
 * (`refresh_tokens`) ce jour-là ; les évaluations à échéance sont les
 * ateliers publiés (`ateliers.date_limite`) et leurs `livrables` ; les notes
 * sont les tentatives de QCM notées et les corrections terminées. Les QCM
 * n'ont pas d'échéance : ils comptent pour les notes, pas pour les remises.
 */

/** Ordre exact de la fiche du modèle (`ml/modeles/risque_v1.json`, « entrees »). */
export const VARIABLES = [
  'jours_actifs',
  'taux_jours_actifs',
  'jours_depuis_derniere_activite',
  'jours_actifs_14_derniers',
  'delai_inscription',
  'nb_evaluations_echues',
  'taux_remise',
  'nb_non_rendues',
  'nb_remises_en_retard',
  'nb_notes',
  'score_moyen',
  'nb_echecs',
  'echecs_consecutifs_fin',
  'tendance_score',
  'a_au_moins_une_note',
  'coupure',
] as const;

export type NomVariable = (typeof VARIABLES)[number];

/** Les 16 valeurs envoyées au service ml (seules deux peuvent être vides). */
export type Variables = Record<Exclude<NomVariable, 'score_moyen' | 'tendance_score'>, number> & {
  score_moyen: number | null;
  tendance_score: number | null;
};

/** Note minimale de réussite (même seuil qu'à l'entraînement, Open University). */
export const SEUIL_ECHEC = 40;
/** Fenêtre de l'activité récente, en jours. */
export const FENETRE_RECENTE = 14;

const JOUR_MS = 86_400_000;

export interface DonneesInscription {
  /** Début de la formation (jour 0). */
  debut: Date;
  dateInscription: Date;
  /** Instants d'activité de l'apprenant (connexions, renouvellements de session). */
  activites: Date[];
  /** Ateliers publiés de la formation, avec leur date limite. */
  ateliers: Array<{ id: string; dateLimite: Date }>;
  /** Remises de l'apprenant (première soumission du livrable de chaque atelier). */
  remises: Array<{ atelierId: string; date: Date }>;
  /** Notes de l'apprenant (sur 100), datées du moment où elles sont connues. */
  notes: Array<{ id: string; valeur: number; date: Date }>;
}

/** Début d'une formation : `date_debut` (DATE) à minuit UTC, sinon le jour de l'inscription. */
export function debutFormation(dateDebut: string | null, dateInscription: Date): Date {
  if (dateDebut) return new Date(`${dateDebut.slice(0, 10)}T00:00:00Z`);
  const d = new Date(dateInscription);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Numéro du jour d'un instant (0 = jour du début ; négatif = avant le début). */
export function numeroJour(instant: Date, debut: Date): number {
  return Math.floor((instant.getTime() - debut.getTime()) / JOUR_MS);
}

/**
 * Les 16 variables à `maintenant`, ou `null` si la formation n'a pas encore
 * commencé depuis au moins un jour entier (J < 1 : rien à prédire).
 */
export function calculerVariables(d: DonneesInscription, maintenant: Date): Variables | null {
  const J = numeroJour(maintenant, d.debut);
  if (J < 1) return null;
  const jour = (instant: Date): number => numeroJour(instant, d.debut);
  const jourInscription = jour(d.dateInscription);

  // 1. Activité : jours distincts avant J, à partir du jour de l'inscription
  const jours = new Set<number>();
  for (const a of d.activites) {
    const n = jour(a);
    if (n < J && n >= jourInscription) jours.add(n);
  }
  const liste = [...jours];
  const joursSession = liste.filter((n) => n >= 0).length;
  const recents = liste.filter((n) => n >= J - FENETRE_RECENTE).length;
  const derniere = liste.length ? Math.max(...liste) : null;

  // 2. Remises : seulement les ateliers dont la date limite est passée (jour < J)
  const limites = new Map(d.ateliers.map((a) => [a.id, jour(a.dateLimite)]));
  const echus = new Set(d.ateliers.filter((a) => jour(a.dateLimite) < J).map((a) => a.id));
  const remisesPassees = d.remises.filter((r) => limites.has(r.atelierId) && jour(r.date) < J);
  const rendus = new Set(remisesPassees.filter((r) => echus.has(r.atelierId)).map((r) => r.atelierId));
  const retards = remisesPassees.filter(
    (r) => jour(r.date) > (limites.get(r.atelierId) as number),
  ).length;
  const nbEchues = echus.size;

  // 3. Notes connues avant J, dans l'ordre chronologique
  const notes = d.notes
    .filter((n) => jour(n.date) < J)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((n) => n.valeur);
  const nbNotes = notes.length;
  const somme = notes.reduce((s, v) => s + v, 0);
  let serie = 0;
  for (let i = notes.length - 1; i >= 0 && notes[i] < SEUIL_ECHEC; i -= 1) serie += 1;
  const derniereNote = nbNotes ? notes[nbNotes - 1] : null;

  return {
    jours_actifs: liste.length,
    taux_jours_actifs: joursSession / J,
    jours_depuis_derniere_activite: derniere === null ? J : Math.min(J - derniere, J),
    jours_actifs_14_derniers: recents,
    delai_inscription: jourInscription,
    nb_evaluations_echues: nbEchues,
    taux_remise: nbEchues > 0 ? rendus.size / nbEchues : 1,
    nb_non_rendues: Math.max(nbEchues - rendus.size, 0),
    nb_remises_en_retard: retards,
    nb_notes: nbNotes,
    score_moyen: nbNotes ? somme / nbNotes : null,
    nb_echecs: notes.filter((v) => v < SEUIL_ECHEC).length,
    echecs_consecutifs_fin: serie,
    tendance_score:
      nbNotes >= 2 && derniereNote !== null
        ? derniereNote - (somme - derniereNote) / (nbNotes - 1)
        : null,
    a_au_moins_une_note: nbNotes > 0 ? 1 : 0,
    coupure: J,
  };
}
