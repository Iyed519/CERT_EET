import { ErreurLlm, PromptGeneration } from '../llm/fournisseur-llm';

/**
 * US-IA-10 — Règles pures de l'analyse des points faibles par l'IA : ce qui
 * part au modèle (prompt) et ce qui est accepté de sa réponse (validation).
 */

export type VerdictQuestion = 'JUSTE' | 'FAUX' | 'SANS_REPONSE';

/** Une question telle que l'apprenant l'a vue, avec son verdict. */
export interface QuestionAnalysee {
  numero: number;
  /** Évaluation d'origine (rapport de session : plusieurs QCM). */
  evaluation?: string;
  enonce: string;
  type: string;
  niveau: string | null;
  verdict: VerdictQuestion;
  reponseApprenant: string[];
  /** null quand le corrigé n'est pas inclus : jamais envoyé au modèle. */
  bonnesReponses: string[] | null;
  explication: string | null;
}

/** Un livrable d'atelier noté (rapport de session). */
export interface AtelierAnalyse {
  titre: string;
  note: number | null;
  commentaire: string | null;
}

/** Un passage d'un support de cours indexé (RAG). */
export interface PassageCours {
  support: string;
  texte: string;
}

/** Tout ce que voit le modèle. Aucune identité (D8). */
export interface EntreeAnalyse {
  formation: string;
  /** Une phrase : de quelle évaluation il s'agit, score et seuil. */
  contexte: string;
  avecCorrige: boolean;
  questions: QuestionAnalysee[];
  ateliers: AtelierAnalyse[];
  passages: PassageCours[];
}

export interface AxeAnalyse {
  notion: string;
  constat: string;
  conseil: string;
  questions: number[];
}

/** L'analyse acceptée, prête à imprimer. */
export interface AnalysePointsFaibles {
  synthese: string;
  axes: AxeAnalyse[];
  encouragement: string;
  modele: string;
}

export type ResultatAnalyse =
  | { statut: 'OK'; analyse: AnalysePointsFaibles; source: 'GENEREE' | 'CACHE' }
  | { statut: 'INDISPONIBLE'; message: string };

export const MAX_AXES = 4;
export const MAX_PASSAGES = 6;
const MAX_SYNTHESE = 700;
const MAX_NOTION = 120;
const MAX_CONSTAT = 500;
const MAX_CONSEIL = 600;
const MAX_ENCOURAGEMENT = 300;
const MAX_TEXTE_QUESTION = 600;
const MAX_TEXTE_PASSAGE = 900;

export const MESSAGE_ANALYSE_INEXPLOITABLE = 'Réponse de l’IA inexploitable pour l’analyse.';

const coupe = (texte: string, max: number): string => {
  const plat = texte.replace(/\s+/g, ' ').trim();
  return plat.length <= max ? plat : `${plat.slice(0, max - 1).trimEnd()}…`;
};

const SYSTEME = [
  'Tu es un formateur bienveillant et exigeant d’ESPRIT Entreprise (Tunisie).',
  'Tu analyses les résultats d’un apprenant pour lui dire précisément sur quoi se concentrer pour progresser.',
  'Règles :',
  '- Écris en français, en vouvoyant l’apprenant (« vous »). N’utilise aucun nom.',
  '- Regroupe les erreurs par NOTION (pas une ligne par question) : 1 à 4 axes, du plus important au moins important.',
  '- Pour chaque axe : la notion, ce que ses réponses montrent (l’erreur de raisonnement probable), et un conseil concret et actionnable (quoi relire, quoi pratiquer, comment vérifier qu’il a compris).',
  '- Appuie-toi sur les passages du cours fournis quand ils sont pertinents : cite le titre du support. S’il n’y en a pas, donne des conseils généraux sans inventer de référence.',
  '- Ne cite que des numéros de questions fournis. N’invente ni question, ni note, ni fait.',
  '- Si tout est juste, propose un seul axe de consolidation.',
  '- Réponds UNIQUEMENT en appelant l’outil analyser_points_faibles.',
].join('\n');

const SANS_CORRIGE =
  '- IMPORTANT : le corrigé n’est pas encore disponible pour cet apprenant. Ne donne JAMAIS la bonne réponse, ni l’option correcte, ni un indice qui la révèle : nomme la notion et la méthode pour la retrouver.';

/** Le prompt : consignes, puis les données en JSON et les passages du cours. */
export function construirePromptAnalyse(entree: EntreeAnalyse): PromptGeneration {
  const donnees = {
    formation: entree.formation,
    contexte: entree.contexte,
    corrigeDisponible: entree.avecCorrige,
    questions: entree.questions.map((q) => ({
      numero: q.numero,
      ...(q.evaluation ? { evaluation: q.evaluation } : {}),
      enonce: coupe(q.enonce, MAX_TEXTE_QUESTION),
      type: q.type,
      niveau: q.niveau,
      verdict: q.verdict,
      reponseApprenant: q.reponseApprenant.map((r) => coupe(r, 200)),
      // D3 : sans corrigé, aucune bonne réponse ni explication ne part au modèle.
      ...(entree.avecCorrige && q.bonnesReponses
        ? { bonnesReponses: q.bonnesReponses.map((r) => coupe(r, 200)) }
        : {}),
      ...(entree.avecCorrige && q.explication ? { explication: coupe(q.explication, 400) } : {}),
    })),
    ateliers: entree.ateliers.map((a) => ({
      titre: a.titre,
      note: a.note,
      commentaireFormateur: a.commentaire ? coupe(a.commentaire, 600) : null,
    })),
  };
  const cours =
    entree.passages.length === 0
      ? 'Aucun support de cours indexé pour ces notions.'
      : entree.passages
          .slice(0, MAX_PASSAGES)
          .map(
            (p, i) => `[${i + 1}] Support « ${p.support} » :\n${coupe(p.texte, MAX_TEXTE_PASSAGE)}`,
          )
          .join('\n\n');
  return {
    systeme: entree.avecCorrige ? SYSTEME : `${SYSTEME}\n${SANS_CORRIGE}`,
    utilisateur: [
      'Voici les résultats à analyser.',
      `<donnees>\n${JSON.stringify(donnees)}\n</donnees>`,
      `<cours>\n${cours}\n</cours>`,
      'Analyse ses points faibles et dis-lui quoi travailler, en appelant l’outil.',
    ].join('\n\n'),
  };
}

const texte = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() !== '' ? coupe(v, max) : null;

/**
 * Valide la réponse BRUTE du modèle : textes non vides et bornés, 1 à 4 axes,
 * numéros de question limités à ceux envoyés. Sinon : erreur récupérable.
 */
export function validerAnalyse(
  brut: unknown,
  numerosValides: ReadonlySet<number>,
  modele: string,
): AnalysePointsFaibles {
  const o = (brut ?? {}) as Record<string, unknown>;
  const synthese = texte(o.synthese, MAX_SYNTHESE);
  const axesBruts = Array.isArray(o.axes) ? o.axes : [];
  const axes: AxeAnalyse[] = [];
  for (const a of axesBruts) {
    const x = (a ?? {}) as Record<string, unknown>;
    const notion = texte(x.notion, MAX_NOTION);
    const constat = texte(x.constat, MAX_CONSTAT);
    const conseil = texte(x.conseil, MAX_CONSEIL);
    if (!notion || !constat || !conseil) continue;
    const questions = Array.isArray(x.questions)
      ? [...new Set(x.questions.filter((n): n is number => Number.isInteger(n)))]
          .filter((n) => numerosValides.has(n))
          .sort((m, n) => m - n)
      : [];
    axes.push({ notion, constat, conseil, questions });
    if (axes.length === MAX_AXES) break;
  }
  if (!synthese || axes.length === 0) {
    throw new ErreurLlm(MESSAGE_ANALYSE_INEXPLOITABLE, true);
  }
  return {
    synthese,
    axes,
    encouragement: texte(o.encouragement, MAX_ENCOURAGEMENT) ?? '',
    modele,
  };
}

/** Texte de la requête RAG : les énoncés ratés d'abord (sinon tous). */
export function requetePassages(questions: QuestionAnalysee[]): string {
  const ratees = questions.filter((q) => q.verdict !== 'JUSTE');
  return (ratees.length > 0 ? ratees : questions)
    .map((q) => q.enonce)
    .join('\n')
    .slice(0, 2000);
}

/** Ligne d'un rapport de tentative (forme minimale lue ici). */
interface LigneTentative {
  rang: number;
  enonce: string;
  type: string;
  niveau: string | null;
  repondue: boolean;
  estCorrecte: boolean;
  optionsCochees: string[];
  bonnesReponses: string[] | null;
  explication: string | null;
}

const nombre = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace('.', ',');

/** Verdict d'une question à partir de la ligne notée (sans réponse = faux, compté à part). */
export const verdictDe = (l: { repondue: boolean; estCorrecte: boolean }): VerdictQuestion =>
  !l.repondue ? 'SANS_REPONSE' : l.estCorrecte ? 'JUSTE' : 'FAUX';

/** Entrée de l'analyse pour une tentative de QCM (rapport US-QCM-13). */
export function entreeAnalyseTentative(t: {
  formation: string;
  module: string;
  qcm: string;
  numero: number;
  nbTentativesMax: number;
  score: number;
  scoreMinValidation: number;
  estReussie: boolean;
  avecCorrige: boolean;
  lignes: LigneTentative[];
}): Omit<EntreeAnalyse, 'passages'> {
  return {
    formation: t.formation,
    contexte:
      `QCM « ${t.qcm} » (module « ${t.module} »), tentative n° ${t.numero} sur ${t.nbTentativesMax} : ` +
      `score ${nombre(t.score)} / 100, seuil de validation ${nombre(t.scoreMinValidation)} / 100 — ` +
      `${t.estReussie ? 'réussi' : 'échoué'}.`,
    avecCorrige: t.avecCorrige,
    questions: t.lignes.map((l) => ({
      numero: l.rang,
      enonce: l.enonce,
      type: l.type,
      niveau: l.niveau,
      verdict: verdictDe(l),
      reponseApprenant: l.optionsCochees,
      bonnesReponses: t.avecCorrige ? l.bonnesReponses : null,
      explication: t.avecCorrige ? l.explication : null,
    })),
    ateliers: [],
  };
}
