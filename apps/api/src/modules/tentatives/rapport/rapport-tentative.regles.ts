import { Role } from '../../../database/enums/role.enum';
import { StatutTentative } from '../../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { EtatCorrection, QuestionCorrigee } from '../tentative-correction.regles';

/**
 * US-QCM-13 — Règles PURES du rapport PDF d'une tentative de QCM.
 *
 * Le rapport est une LECTURE de la tentative figée (NOTEE, immuable depuis
 * US-QCM-08) : aucune note n'est recalculée ici. Le corrigé (bonnes réponses,
 * explications) n'y entre que si la règle d'US-QCM-09 l'autorise pour
 * l'apprenant ; le formateur affecté et l'administrateur le voient toujours,
 * comme dans l'historique (US-QCM-11). Aucune dépendance (ni base, ni
 * Nest) : testées seules.
 */

export const RAISON_RAPPORT_NON_NOTEE = 'tentative_non_notee';
export const MESSAGE_RAPPORT_NON_NOTEE = 'Le rapport sera disponible une fois la tentative notée.';
export const MESSAGE_RAPPORT_INTROUVABLE = 'Tentative introuvable.';
export const MENTION_GENERATEUR = 'Document généré par Cert_EET — ESPRIT Entreprise';

/** Seule une tentative NOTEE (score figé) a un rapport. */
export const rapportDisponible = (statut: StatutTentative): boolean =>
  statut === StatutTentative.NOTEE;

/**
 * Le corrigé entre-t-il dans le rapport ? Formateur (affecté : le garde l'a
 * vérifié) et administrateur : toujours. Apprenant : exactement la décision
 * de `GET /tentatives/:id/correction` (`etat`), jamais une autre règle.
 */
export const corrigeInclus = (role: Role, etat: EtatCorrection | null): boolean => {
  if (role === Role.FORMATEUR || role === Role.ADMINISTRATEUR) return true;
  return etat !== null && etat.disponible;
};

/** Comment la tentative s'est terminée. */
export type ClotureTentative = 'SOUMISE' | 'TEMPS_ECOULE';

/**
 * Une tentative notée ne garde plus son statut de clôture : je le relis dans
 * ses dates. La soumission n'est admise qu'AVANT l'échéance (sinon 409
 * `temps_ecoule`), et toute clôture par le temps écrit `dateFin = dateLimite`
 * (US-QCM-07/08). Donc `dateFin >= dateLimite` ⇔ temps écoulé.
 */
export const clotureDe = (dateFin: Date | null, dateLimite: Date): ClotureTentative =>
  dateFin !== null && new Date(dateFin).getTime() >= new Date(dateLimite).getTime()
    ? 'TEMPS_ECOULE'
    : 'SOUMISE';

export const LIBELLES_CLOTURE: Record<ClotureTentative, string> = {
  SOUMISE: 'Soumise',
  TEMPS_ECOULE: 'Temps écoulé',
};

export const LIBELLES_TYPE: Record<TypeQuestion, string> = {
  [TypeQuestion.QCU]: 'QCU',
  [TypeQuestion.QCM]: 'QCM',
  [TypeQuestion.VRAI_FAUX]: 'Vrai / Faux',
  [TypeQuestion.REPONSE_COURTE]: 'Réponse courte',
  [TypeQuestion.ASSOCIATION]: 'Association',
};

/** Une question du rapport — liste BLANCHE, construite champ par champ. */
export interface LigneRapport {
  rang: number;
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  pointsObtenus: number;
  repondue: boolean;
  estCorrecte: boolean;
  /** Textes des options cochées, dans l'ordre tiré. */
  optionsCochees: string[];
  /** Textes des bonnes options ; null si le corrigé n'est pas inclus. */
  bonnesReponses: string[] | null;
  /** Explication ; null si le corrigé n'est pas inclus (ou s'il n'y en a pas). */
  explication: string | null;
}

/**
 * Lignes du rapport, dans l'ordre du tirage (celui de `lireCorrection`).
 * Corrigé exclu : ni bonne réponse, ni explication ne sont COPIÉES — le
 * générateur PDF ne peut pas imprimer ce qu'il ne reçoit pas.
 */
export const construireLignesRapport = (
  questions: QuestionCorrigee[],
  avecCorrige: boolean,
): LigneRapport[] =>
  questions.map((q, i) => ({
    rang: i + 1,
    enonce: q.enonce,
    type: q.type,
    ponderation: q.ponderation,
    pointsObtenus: q.pointsObtenus,
    repondue: q.repondue,
    estCorrecte: q.estCorrecte,
    optionsCochees: q.options.filter((o) => o.cochee).map((o) => o.texte),
    bonnesReponses: avecCorrige ? q.options.filter((o) => o.estCorrecte).map((o) => o.texte) : null,
    explication: avecCorrige ? q.explication : null,
  }));

export interface SyntheseRapport {
  nbQuestions: number;
  nbJustes: number;
  /** Répondues mais fausses. */
  nbFausses: number;
  /** Sans réponse : comptées fausses par la notation (0 point). */
  nbSansReponse: number;
  pointsObtenus: number;
  pointsPossibles: number;
}

/** Comptes de la synthèse, tirés de ce que la notation a écrit (pas recalculés). */
export const syntheseRapport = (lignes: LigneRapport[]): SyntheseRapport => ({
  nbQuestions: lignes.length,
  nbJustes: lignes.filter((l) => l.estCorrecte).length,
  nbFausses: lignes.filter((l) => l.repondue && !l.estCorrecte).length,
  nbSansReponse: lignes.filter((l) => !l.repondue).length,
  pointsObtenus: arrondi2(lignes.reduce((s, l) => s + l.pointsObtenus, 0)),
  pointsPossibles: arrondi2(lignes.reduce((s, l) => s + l.ponderation, 0)),
});

const arrondi2 = (n: number): number => Math.round(n * 100) / 100;

/** « 72,50 » : toujours deux décimales, virgule française. */
export const nombreFr = (n: number): string =>
  n
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/ | /g, ' ');

/** « 12 min 05 s », « 45 s » ; « — » si inconnue. */
export const dureeFr = (secondes: number | null): string => {
  if (secondes === null || secondes < 0) return '—';
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min ${ss} s`;
  if (m > 0) return `${m} min ${ss} s`;
  return `${s} s`;
};

/**
 * Phrase du rapport quand le corrigé n'y est pas : la date à partir de
 * laquelle il le sera (fermeture du QCM), selon le motif d'US-QCM-09.
 */
export const phraseCorrigeAbsent = (etat: EtatCorrection, dateFr: (d: Date) => string): string => {
  if (etat.raison === 'tentatives_restantes' && etat.disponibleLe) {
    return (
      'Corrigé non inclus : il sera disponible après votre dernière tentative, et au plus tard ' +
      `le ${dateFr(etat.disponibleLe)} (fermeture du QCM).`
    );
  }
  if (etat.disponibleLe) {
    return `Corrigé non inclus : il sera disponible à partir du ${dateFr(etat.disponibleLe)} (fermeture du QCM).`;
  }
  return 'Corrigé non inclus.';
};

/** `rapport-<titre en ascii>-tentative-<n>.pdf`, sans caractère risqué dans l'en-tête HTTP. */
export const nomFichierRapport = (qcmTitre: string, numero: number): string => {
  const slug = qcmTitre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `rapport-${slug || 'qcm'}-tentative-${numero}.pdf`;
};
