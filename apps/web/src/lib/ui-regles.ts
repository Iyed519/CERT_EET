/**
 * US-UX-01 — Règles pures des briques d'interface (onglets, étapes), testées
 * par `node --test` (`npm run test:unitaires`). Module sans import.
 */

/** Compteur d'un onglet : rien si absent ; un zéro « à traiter » est masqué, un zéro informatif reste. */
export function texteCompteur(o: { compteur?: number | null; compteurAlerte?: boolean }): string | null {
  if (o.compteur === undefined || o.compteur === null) return null;
  if (o.compteur === 0 && o.compteurAlerte) return null;
  return o.compteur > 999 ? '999+' : String(o.compteur);
}

/** Première étape qui n'est pas faite (la « prochaine étape »), ou -1 si tout est fait. */
export function etapeCourante(etapes: Array<{ etat: string }>): number {
  return etapes.findIndex((e) => e.etat !== 'fait');
}

/** US-UX-02 — Regroupe des lignes par formation, dans l'ordre reçu (l'API trie déjà). */
export function parFormation<T extends { formationId: string; formationTitre: string }>(
  lignes: T[],
): Array<{ id: string; titre: string; lignes: T[] }> {
  const groupes = new Map<string, { id: string; titre: string; lignes: T[] }>();
  for (const l of lignes) {
    const g = groupes.get(l.formationId) ?? { id: l.formationId, titre: l.formationTitre, lignes: [] };
    g.lignes.push(l);
    groupes.set(l.formationId, g);
  }
  return [...groupes.values()];
}

/**
 * US-UX-03 — Avancement moyen (en %) des apprenants EN COURS d'une formation,
 * arrondi à l'entier ; null s'il n'y en a aucun.
 */
export function avancementMoyen(apprenants: Array<{ statutInscription: string; avancement: number }>): number | null {
  const enCours = apprenants.filter((a) => a.statutInscription === 'EN_COURS');
  if (enCours.length === 0) return null;
  const somme = enCours.reduce((n, a) => n + Math.min(100, Math.max(0, a.avancement)), 0);
  return Math.round(somme / enCours.length);
}

/**
 * US-UX-04 — Résumé d'un module : « 3 QCM dont 1 publié · 1 atelier · 2 ressources ·
 * 1 support IA ». Ressources et supports absents tant qu'ils ne sont pas chargés.
 */
export function resumeModule(m: {
  qcm: string[];
  ateliers: number;
  ressources?: number;
  supports?: number;
}): string {
  const pl = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;
  const publies = m.qcm.filter((s) => s === 'PUBLIE').length;
  const parties = [
    m.qcm.length === 0 ? '0 QCM' : `${m.qcm.length} QCM dont ${pl(publies, 'publié', 'publiés')}`,
    pl(m.ateliers, 'atelier', 'ateliers'),
  ];
  if (m.ressources !== undefined) parties.push(pl(m.ressources, 'ressource', 'ressources'));
  if (m.supports !== undefined) parties.push(pl(m.supports, 'support IA', 'supports IA'));
  return parties.join(' · ');
}

/**
 * US-UX-05 — Étapes d'un QCM : 1 Questions, 2 Paramètres anti-fraude,
 * 3 Publication, 4 Résultats. `parametresBloquants` : paramètres enregistrés
 * mais une condition de publication qui en dépend n'est pas remplie (tirage
 * trop grand, fermeture passée).
 */
export function etapesQcm(q: {
  nbQuestions: number;
  configure: boolean;
  parametresBloquants: string | null;
  publie: boolean;
  tentatives: boolean;
}): Array<{ cle: 'questions' | 'parametres' | 'publication' | 'resultats'; libelle: string; etat: 'fait' | 'en-cours' | 'a-faire' | 'bloquant'; detail: string }> {
  const n = q.nbQuestions;
  return [
    {
      cle: 'questions',
      libelle: 'Questions',
      etat: n > 0 ? 'fait' : 'a-faire',
      detail: `${n} question${n > 1 ? 's' : ''}`,
    },
    {
      cle: 'parametres',
      libelle: 'Paramètres anti-fraude',
      etat: q.parametresBloquants ? 'bloquant' : q.configure ? 'fait' : 'a-faire',
      detail: q.parametresBloquants ?? (q.configure ? 'enregistrés' : 'durée, fenêtre, tentatives'),
    },
    {
      cle: 'publication',
      libelle: 'Publication',
      etat: q.publie ? 'fait' : 'a-faire',
      detail: q.publie ? 'visible des apprenants' : 'après les deux premières étapes',
    },
    {
      cle: 'resultats',
      libelle: 'Résultats',
      etat: !q.publie ? 'a-faire' : q.tentatives ? 'en-cours' : 'a-faire',
      detail: !q.publie ? 'après la publication' : q.tentatives ? 'tentatives à consulter' : 'en attente des tentatives',
    },
  ];
}

/** US-UX-06 — Acteur d'une action d'audit : « Prénom Nom », l'adresse à défaut, « Système » sans compte. */
export function acteurAudit(a: { email: string; prenom: string | null; nom: string | null } | null): string {
  if (!a) return 'Système';
  return [a.prenom, a.nom].filter(Boolean).join(' ') || a.email;
}

/** US-UX-06 — Répartition « 12 apprenants · 3 formateurs » (valeurs nulles omises). */
export function repartitionTexte(
  valeurs: Record<string, number>,
  libelles: Record<string, string>,
  nombre: (n: number) => string = String,
): string {
  const parties = Object.entries(valeurs)
    .filter(([, n]) => n > 0)
    .map(([cle, n]) => `${nombre(n)} ${(libelles[cle] ?? cle).toLowerCase()}`);
  return parties.length > 0 ? parties.join(' · ') : 'aucun pour l’instant';
}

/** US-UX-06 — Filtre initial lu dans l'adresse (`?statut=…`), seulement s'il fait partie des valeurs connues. */
export function statutDepuisAdresse<T extends string>(recherche: string, valeurs: readonly T[]): T | null {
  const statut = new URLSearchParams(recherche).get('statut');
  return statut !== null && (valeurs as readonly string[]).includes(statut) ? (statut as T) : null;
}
