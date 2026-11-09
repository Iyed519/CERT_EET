import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { arrondiScore } from './certificat.regles';

/**
 * Règles PURES de l'éligibilité à la certification (US-ATEL-09, DS-03 ->
 * DS-04, AC-03) : aucune base, aucune horloge, aucune entrée/sortie.
 *
 * Éligible si, et seulement si :
 *  - la formation n'est pas clôturée (ARCHIVEE) ;
 *  - l'inscription existe et n'est pas suspendue ;
 *  - la formation compte au moins une évaluation publiée ;
 *  - CHAQUE QCM publié est réussi (une tentative notée réussie : son seuil
 *    est celui de sa configuration) ;
 *  - CHAQUE atelier publié est noté avec un score ≥ seuil de certification
 *    de la formation.
 * Score final = moyenne des évaluations (meilleur score noté de chaque QCM,
 * score de chaque atelier), à poids égal, au centième.
 */

export type TypeEvaluation = 'QCM' | 'ATELIER';

/** Une évaluation requise, telle que lue en base. */
export interface EvaluationLue {
  type: TypeEvaluation;
  id: string;
  titre: string;
  /** QCM : meilleur score noté ; atelier : score de la correction finalisée. */
  score: number | null;
  /** QCM seulement : au moins une tentative notée réussie. */
  reussie?: boolean;
}

/** Une évaluation jugée. */
export interface EvaluationJugee extends EvaluationLue {
  validee: boolean;
}

export interface Verdict {
  eligible: boolean;
  /** null si éligible ; sinon la raison, en français. */
  raison: string | null;
  evaluations: EvaluationJugee[];
  validees: number;
  requises: number;
  /** Moyenne des évaluations ; null tant qu'une évaluation n'a pas de score. */
  scoreFinal: number | null;
}

export const PREFIXE_NON_ELIGIBLE = 'Certification non éligible';

export function verdictEligibilite(entree: {
  statutFormation: StatutFormation;
  statutInscription: StatutInscription | null;
  seuilCertification: number;
  evaluations: readonly EvaluationLue[];
}): Verdict {
  const evaluations: EvaluationJugee[] = entree.evaluations.map((e) => ({
    ...e,
    validee:
      e.type === 'QCM'
        ? e.reussie === true
        : e.score !== null && e.score >= entree.seuilCertification,
  }));
  const validees = evaluations.filter((e) => e.validee).length;
  const requises = evaluations.length;
  const scores = evaluations.map((e) => e.score);
  const scoreFinal =
    requises > 0 && scores.every((s) => s !== null)
      ? arrondiScore((scores as number[]).reduce((t, s) => t + s, 0) / requises)
      : null;

  const raison = ((): string | null => {
    if (entree.statutFormation === StatutFormation.ARCHIVEE) {
      return `${PREFIXE_NON_ELIGIBLE} : la formation est clôturée.`;
    }
    if (entree.statutInscription === null) {
      return `${PREFIXE_NON_ELIGIBLE} : pas d’inscription à cette formation.`;
    }
    if (entree.statutInscription === StatutInscription.SUSPENDUE) {
      return `${PREFIXE_NON_ELIGIBLE} : l’inscription est suspendue.`;
    }
    if (requises === 0) {
      return `${PREFIXE_NON_ELIGIBLE} : la formation ne compte encore aucune évaluation publiée.`;
    }
    if (validees < requises) {
      return `${PREFIXE_NON_ELIGIBLE} : ${validees} évaluation${validees > 1 ? 's' : ''} validée${validees > 1 ? 's' : ''} sur ${requises}.`;
    }
    return null;
  })();

  return {
    eligible: raison === null,
    raison,
    evaluations,
    validees,
    requises,
    scoreFinal: raison === null ? scoreFinal : null,
  };
}
