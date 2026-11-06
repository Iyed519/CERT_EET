import { QuestionTiree } from '../../database/entities/tentative-qcm.entity';
import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';

/**
 * Règles PURES du corrigé d'une tentative (US-QCM-09) : quand le corrigé
 * peut-il être révélé, et que contient-il. Aucune dépendance (ni base, ni
 * Redis) : testées seules, importables sans risque d'import circulaire.
 */

// Messages renvoyés à l'apprenant (et vérifiés par les tests).
export const MESSAGE_CORRECTION_NON_NOTEE =
  'Le corrigé sera disponible une fois la tentative notée.';
export const MESSAGE_CORRECTION_DIFFEREE = 'Le corrigé sera disponible après la fermeture du QCM.';
export const MESSAGE_CORRECTION_TENTATIVES_RESTANTES =
  'Le corrigé sera disponible après votre dernière tentative, ou à la fermeture du QCM.';

/** Motif d'indisponibilité du corrigé (409), renvoyé tel quel dans `raison`. */
export type RaisonCorrectionIndisponible =
  | 'non_notee'
  | 'correction_differee'
  | 'tentatives_restantes';

/** Ce que la décision lit : la tentative, la configuration du QCM, l'horloge de la base. */
export interface ContexteCorrection {
  statut: StatutTentative;
  mode: AffichageResultats;
  // Heure de PostgreSQL : jamais celle du navigateur ni celle du serveur Node.
  maintenant: Date;
  // Relue à chaque demande : le formateur peut la repousser après les premières tentatives.
  dateFermeture: Date;
  nbTentativesMax: number;
  // Toutes MES tentatives sur ce QCM, quel que soit leur état.
  nbTentativesPassees: number;
  // Une de MES tentatives sur ce QCM est-elle encore EN_COURS ?
  tentativeEnCours: boolean;
}

/** État du corrigé, exposé tel quel par la consultation (D12) — sans aucune réponse. */
export interface EtatCorrection {
  mode: AffichageResultats;
  disponible: boolean;
  raison: RaisonCorrectionIndisponible | null;
  // Date à laquelle le corrigé sera au plus tard disponible (fermeture), si connue.
  disponibleLe: Date | null;
}

/**
 * Le corrigé est-il disponible ? Dans cet ordre :
 *   1. la tentative doit être NOTEE (sinon `non_notee`) ;
 *   2. fenêtre fermée (maintenant >= fermeture) : disponible, quel que soit le mode (D2) ;
 *   3. DIFFERE avant la fermeture : `correction_differee`, disponible à la fermeture ;
 *   4. IMMEDIAT : disponible si l'apprenant n'a plus aucune tentative possible — quota
 *      atteint ET aucune tentative EN_COURS ; sinon `tentatives_restantes` (D4, option B :
 *      le corrigé de la 1re tentative ne doit pas servir à la 2e).
 */
export const evaluerCorrection = (c: ContexteCorrection): EtatCorrection => {
  const fermeture = new Date(c.dateFermeture);
  if (c.statut !== StatutTentative.NOTEE) {
    return { mode: c.mode, disponible: false, raison: 'non_notee', disponibleLe: null };
  }
  if (new Date(c.maintenant).getTime() >= fermeture.getTime()) {
    return { mode: c.mode, disponible: true, raison: null, disponibleLe: null };
  }
  if (c.mode === AffichageResultats.DIFFERE) {
    return {
      mode: c.mode,
      disponible: false,
      raison: 'correction_differee',
      disponibleLe: fermeture,
    };
  }
  const plusAucuneTentative = c.nbTentativesPassees >= c.nbTentativesMax && !c.tentativeEnCours;
  if (plusAucuneTentative) {
    return { mode: c.mode, disponible: true, raison: null, disponibleLe: null };
  }
  return {
    mode: c.mode,
    disponible: false,
    raison: 'tentatives_restantes',
    disponibleLe: fermeture,
  };
};

/** Message du refus, selon son motif. */
export const messageCorrection = (raison: RaisonCorrectionIndisponible): string => {
  switch (raison) {
    case 'non_notee':
      return MESSAGE_CORRECTION_NON_NOTEE;
    case 'correction_differee':
      return MESSAGE_CORRECTION_DIFFEREE;
    case 'tentatives_restantes':
      return MESSAGE_CORRECTION_TENTATIVES_RESTANTES;
  }
};

/** Une question telle qu'elle est en base (lecture explicite, sans `estCorrecte`). */
export interface QuestionACorriger {
  id: string;
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  explication: string | null;
  options: Array<{ id: string; texte: string }>;
}

/** Ce que la notation a écrit pour une question répondue (US-QCM-08). */
export interface ReponseNotee {
  estCorrecte: boolean | null;
  pointsObtenus: number | null;
  optionIds: string[];
}

/** Une question du corrigé — liste BLANCHE, construite champ par champ. */
export interface QuestionCorrigee {
  id: string;
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  repondue: boolean;
  estCorrecte: boolean;
  pointsObtenus: number;
  explication: string | null;
  options: Array<{ id: string; texte: string; cochee: boolean; estCorrecte: boolean }>;
}

/**
 * Corrigé dans l'ordre du tirage, options dans l'ordre tiré (ce que l'apprenant a vu).
 * Juste / faux et points : ce que la notation a ÉCRIT, jamais recalculé (D6) ; une
 * question sans réponse compte faux, 0 point. Une question ou une option absente du
 * contenu (impossible : le QCM est verrouillé dès la 1re tentative) est ignorée.
 */
export const construireCorrection = (
  plan: QuestionTiree[],
  questions: QuestionACorriger[],
  optionsCorrectes: ReadonlySet<string>,
  reponses: ReadonlyMap<string, ReponseNotee>,
): QuestionCorrigee[] => {
  const parId = new Map(questions.map((q) => [q.id, q]));
  const corrigees: QuestionCorrigee[] = [];
  for (const tiree of plan) {
    const question = parId.get(tiree.questionId);
    if (!question) continue;
    const reponse = reponses.get(question.id);
    const cochees = new Set(reponse?.optionIds ?? []);
    const options = new Map(question.options.map((o) => [o.id, o]));
    corrigees.push({
      id: question.id,
      enonce: question.enonce,
      type: question.type,
      ponderation: question.ponderation,
      repondue: cochees.size > 0,
      estCorrecte: reponse?.estCorrecte === true,
      pointsObtenus: reponse?.pointsObtenus ?? 0,
      explication: question.explication,
      options: tiree.optionIds
        .map((id) => options.get(id))
        .filter((o): o is NonNullable<typeof o> => o !== undefined)
        .map((o) => ({
          id: o.id,
          texte: o.texte,
          cochee: cochees.has(o.id),
          estCorrecte: optionsCorrectes.has(o.id),
        })),
    });
  }
  return corrigees;
};
