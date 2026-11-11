import { arrondi2, taux } from './periode.regles';

/**
 * US-DASH-03 — Règles PURES du tableau de bord global du formateur : aucune
 * base, aucune horloge. Le service lit UNE ligne agrégée par formation (une
 * seule requête SQL) ; les totaux de toutes ses formations sont calculés ici,
 * à partir des sommes (jamais une moyenne de moyennes).
 */

/** Ligne agrégée d'une formation, telle que lue en base. */
export interface LigneFormationFormateur {
  id: string;
  titre: string;
  statut: string;
  inscrits: number;
  actifs: number;
  nouveaux: number;
  tentatives_notees: number;
  tentatives_reussies: number;
  somme_scores: string | number | null;
  tentatives_a_evaluer: number;
  livrables_a_evaluer: number;
  alertes_ouvertes: number;
  certificats_delivres: number;
}

/** Une formation dans le tableau « Mes formations ». */
export interface FormationTableauDeBord {
  id: string;
  titre: string;
  statut: string;
  inscrits: number;
  actifs: number;
  tentativesNotees: number;
  tauxReussite: number;
  scoreMoyen: number | null;
  tentativesAEvaluer: number;
  livrablesAEvaluer: number;
  alertesOuvertes: number;
  certificatsDelivres: number;
}

export interface TotauxFormateur {
  formations: { parStatut: Record<string, number>; total: number };
  apprenants: { inscrits: number; actifs: number; nouveaux: number };
  qcm: {
    tentativesNotees: number;
    reussies: number;
    tauxReussite: number;
    scoreMoyen: number | null;
    aEvaluer: number;
  };
  ateliers: { livrablesAEvaluer: number };
  alertesOuvertes: number;
  certificatsDelivres: number;
}

const n = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

/** Score moyen à partir d'une somme et d'un nombre (null sans tentative notée). */
export function moyenne(somme: number | string | null | undefined, nombre: number): number | null {
  return nombre > 0 ? arrondi2(n(somme) / nombre) : null;
}

/** Une ligne SQL -> une formation du tableau. */
export function versFormation(l: LigneFormationFormateur): FormationTableauDeBord {
  return {
    id: l.id,
    titre: l.titre,
    statut: l.statut,
    inscrits: n(l.inscrits),
    actifs: n(l.actifs),
    tentativesNotees: n(l.tentatives_notees),
    tauxReussite: taux(n(l.tentatives_reussies), n(l.tentatives_notees)),
    scoreMoyen: moyenne(l.somme_scores, n(l.tentatives_notees)),
    tentativesAEvaluer: n(l.tentatives_a_evaluer),
    livrablesAEvaluer: n(l.livrables_a_evaluer),
    alertesOuvertes: n(l.alertes_ouvertes),
    certificatsDelivres: n(l.certificats_delivres),
  };
}

/**
 * Totaux sur toutes les formations du formateur. `statuts` : toutes les
 * valeurs de l'énumération (zéro compris), dans l'ordre d'affichage.
 */
export function totaliser(lignes: LigneFormationFormateur[], statuts: string[]): TotauxFormateur {
  const parStatut: Record<string, number> = Object.fromEntries(statuts.map((s) => [s, 0]));
  let notees = 0;
  let reussies = 0;
  let sommeScores = 0;
  const t = {
    inscrits: 0,
    actifs: 0,
    nouveaux: 0,
    aEvaluer: 0,
    livrables: 0,
    alertes: 0,
    certificats: 0,
  };
  for (const l of lignes) {
    parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1;
    t.inscrits += n(l.inscrits);
    t.actifs += n(l.actifs);
    t.nouveaux += n(l.nouveaux);
    notees += n(l.tentatives_notees);
    reussies += n(l.tentatives_reussies);
    sommeScores += n(l.somme_scores);
    t.aEvaluer += n(l.tentatives_a_evaluer);
    t.livrables += n(l.livrables_a_evaluer);
    t.alertes += n(l.alertes_ouvertes);
    t.certificats += n(l.certificats_delivres);
  }
  return {
    formations: { parStatut, total: lignes.length },
    apprenants: { inscrits: t.inscrits, actifs: t.actifs, nouveaux: t.nouveaux },
    qcm: {
      tentativesNotees: notees,
      reussies,
      tauxReussite: taux(reussies, notees),
      scoreMoyen: moyenne(sommeScores, notees),
      aEvaluer: t.aEvaluer,
    },
    ateliers: { livrablesAEvaluer: t.livrables },
    alertesOuvertes: t.alertes,
    certificatsDelivres: t.certificats,
  };
}
