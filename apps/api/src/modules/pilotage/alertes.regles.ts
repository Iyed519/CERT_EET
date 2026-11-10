import { CritereAlerte } from '../../database/enums/critere-alerte.enum';

/**
 * Règles PURES des alertes de décrochage (US-SUIVI-02, DS-14 P2) : critères
 * factuels seulement, aucune base, aucune horloge (l'instant est fourni).
 */

/** Deux tentatives notées consécutives en échec. */
export const NB_ECHECS_CONSECUTIFS = 2;
/** Un atelier publié non rendu 48 h après sa date limite. */
export const HEURES_RETARD_LIVRABLE = 48;
/** Chute : dernière note ≤ moyenne des précédentes − 20 points… */
export const POINTS_CHUTE = 20;
/** … avec au moins 3 notes au total. */
export const NB_NOTES_CHUTE = 3;

/** Suggestion d'action affichée avec l'alerte (DS-14 : « suggestionAction »). */
export const SUGGESTIONS: Record<CritereAlerte, string> = {
  [CritereAlerte.INACTIVITE]:
    'Prendre contact avec l’apprenant pour comprendre son absence et lui proposer un point d’étape.',
  [CritereAlerte.ECHECS_QCM]:
    'Proposer une révision ciblée des notions du QCM ou un entretien avant la prochaine tentative.',
  [CritereAlerte.LIVRABLE_EN_RETARD]:
    'Relancer l’apprenant sur le livrable attendu et vérifier s’il rencontre une difficulté.',
  [CritereAlerte.SCORE_EN_CHUTE]:
    'Faire le point sur les dernières évaluations et identifier les notions à reprendre.',
};

/** Une note datée de l'apprenant dans la formation (QCM noté ou atelier corrigé). */
export interface NoteDatee {
  type: 'QCM' | 'ATELIER';
  titre: string;
  valeur: number;
  date: Date;
  /** QCM seulement : tentative réussie ? */
  reussie?: boolean | null;
}

const chrono = (notes: NoteDatee[]): NoteDatee[] =>
  [...notes].sort((a, b) => a.date.getTime() - b.date.getTime());

const resume = (n: NoteDatee): Record<string, unknown> => ({
  type: n.type,
  titre: n.titre,
  note: n.valeur,
  date: n.date.toISOString(),
});

/**
 * ECHECS_QCM : les `NB_ECHECS_CONSECUTIFS` dernières tentatives de QCM notées
 * (ordre chronologique) sont toutes des échecs. Renvoie les faits, ou null.
 */
export function echecsConsecutifs(notes: NoteDatee[]): Record<string, unknown> | null {
  const qcm = chrono(notes.filter((n) => n.type === 'QCM'));
  if (qcm.length < NB_ECHECS_CONSECUTIFS) return null;
  const dernieres = qcm.slice(-NB_ECHECS_CONSECUTIFS);
  if (!dernieres.every((n) => n.reussie === false)) return null;
  return { tentatives: dernieres.map(resume) };
}

/**
 * SCORE_EN_CHUTE : au moins `NB_NOTES_CHUTE` notes ; la dernière est
 * inférieure d'au moins `POINTS_CHUTE` points à la moyenne des précédentes.
 */
export function scoreEnChute(notes: NoteDatee[]): Record<string, unknown> | null {
  const toutes = chrono(notes);
  if (toutes.length < NB_NOTES_CHUTE) return null;
  const derniere = toutes[toutes.length - 1];
  const precedentes = toutes.slice(0, -1);
  const moyenne = precedentes.reduce((s, n) => s + n.valeur, 0) / precedentes.length;
  if (derniere.valeur > moyenne - POINTS_CHUTE) return null;
  return {
    derniere: resume(derniere),
    moyennePrecedentes: Math.round(moyenne * 100) / 100,
    ecart: Math.round((moyenne - derniere.valeur) * 100) / 100,
    nbNotes: toutes.length,
  };
}

export interface AtelierAttendu {
  id: string;
  titre: string;
  dateLimite: Date;
}

/**
 * LIVRABLE_EN_RETARD : ateliers publiés dont la date limite est dépassée de
 * plus de `HEURES_RETARD_LIVRABLE` heures sans livrable de l'apprenant.
 */
export function ateliersEnRetard(
  ateliers: AtelierAttendu[],
  rendus: Set<string>,
  maintenant: Date,
): Record<string, unknown> | null {
  const seuil = maintenant.getTime() - HEURES_RETARD_LIVRABLE * 3_600_000;
  const manquants = ateliers
    .filter((a) => !rendus.has(a.id) && a.dateLimite.getTime() < seuil)
    .sort((a, b) => a.dateLimite.getTime() - b.dateLimite.getTime());
  if (manquants.length === 0) return null;
  return {
    ateliers: manquants.map((a) => ({
      id: a.id,
      titre: a.titre,
      dateLimite: a.dateLimite.toISOString(),
    })),
  };
}
