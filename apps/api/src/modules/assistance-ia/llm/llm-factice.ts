import { DemandeExtraction, FournisseurLlm, PromptGeneration } from './fournisseur-llm';

export const MODELE_FACTICE = 'factice-v1';

/**
 * Fournisseur FACTICE (tests, CI, démonstration sans clé) : déterministe,
 * sans réseau, sans coût. Il lit dans le prompt le nombre demandé, les types
 * permis et les passages fournis, et fabrique des questions à partir des
 * phrases de ces passages — de quoi faire tourner tout le pipeline.
 *
 * Pour éprouver la validation et les échecs, le thème demandé peut contenir
 * (et seulement avec ce fournisseur) :
 *  - `[factice:invalides]` : ajoute des questions non conformes ;
 *  - `[factice:vide]` : ne renvoie aucune question ;
 *  - `[factice:panne]` : échoue comme un service injoignable.
 *
 * US-IA-08 — Extraction : analyse DÉTERMINISTE du document (voir
 * `analyserDocumentFactice`) ; une image ou un PDF scanné donne une question
 * fixe ; mêmes marqueurs `[factice:vide]` / `[factice:panne]` dans le texte.
 */
export class LlmFactice implements FournisseurLlm {
  readonly modele = MODELE_FACTICE;

  async extraireQuestions(demande: DemandeExtraction): Promise<unknown> {
    if (demande.fichier) {
      return {
        questions: [
          {
            enonce: `Question lue ${demande.fichier.nature === 'image' ? 'sur l’image' : 'dans le PDF scanné'} : quelle est la capitale de la Tunisie ?`,
            type: 'QCU',
            options: [
              { texte: 'Tunis', estCorrecte: true },
              { texte: 'Sfax', estCorrecte: false },
              { texte: 'Sousse', estCorrecte: false },
            ],
            explication: null,
            niveau: null,
          },
        ],
      };
    }
    const document = /<document>\n?([\s\S]*?)\n?<\/document>/.exec(demande.texte ?? '')?.[1] ?? '';
    if (document.includes('[factice:panne]'))
      throw new Error('Fournisseur factice : panne simulée.');
    if (document.includes('[factice:vide]')) return { questions: [] };
    return { questions: analyserDocumentFactice(document) };
  }

  async genererQuestions(prompt: PromptGeneration): Promise<unknown> {
    const texte = prompt.utilisateur;
    if (texte.includes('[factice:panne]')) throw new Error('Fournisseur factice : panne simulée.');
    if (texte.includes('[factice:vide]')) return { questions: [] };
    const nb = Number(/Nombre de questions : (\d+)/.exec(texte)?.[1] ?? '1');
    const types = (/Types permis : ([A-Z_, ]+)/.exec(texte)?.[1] ?? 'QCU')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const passages = [
      ...texte.matchAll(/<passage numero="(\d+)">\n?([\s\S]*?)\n?<\/passage>/g),
    ].map((m) => ({ numero: Number(m[1]), texte: m[2] }));
    const phrases = passages.flatMap((p) =>
      p.texte
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 20)
        .map((s) => ({ numero: p.numero, phrase: s.slice(0, 300) })),
    );
    const questions = Array.from({ length: nb }, (_v, i) => {
      const source = phrases[i % Math.max(phrases.length, 1)] ?? {
        numero: 1,
        phrase: 'Le support de cours.',
      };
      const type = types[i % types.length];
      const enonce = `Question ${i + 1} : que dit le cours à propos de « ${source.phrase.slice(0, 80)} » ?`;
      if (type === 'VRAI_FAUX') {
        return {
          enonce: `Vrai ou faux (${i + 1}) : ${source.phrase}`,
          type,
          options: [
            { texte: 'Vrai', estCorrecte: true },
            { texte: 'Faux', estCorrecte: false },
          ],
          explication: `Le passage ${source.numero} l’affirme.`,
          passages: [source.numero],
          scoreConfiance: 0.9,
        };
      }
      return {
        enonce,
        type,
        options: [
          { texte: source.phrase, estCorrecte: true },
          { texte: `Le contraire de l’affirmation ${i + 1}`, estCorrecte: false },
          { texte: `Une notion absente du cours (${i + 1})`, estCorrecte: type === 'QCM' },
          { texte: `Aucune de ces réponses (${i + 1})`, estCorrecte: false },
        ],
        explication: `D’après le passage ${source.numero}.`,
        passages: [source.numero],
        scoreConfiance: 0.8,
      };
    });
    if (texte.includes('[factice:invalides]')) {
      questions.push(
        {
          enonce: 'Trop court',
          type: 'QCU',
          options: [],
          explication: '',
          passages: [],
          scoreConfiance: 2,
        },
        {
          enonce: 'Question à choix unique avec deux bonnes réponses ?',
          type: 'QCU',
          options: [
            { texte: 'A', estCorrecte: true },
            { texte: 'B', estCorrecte: true },
          ],
          explication: '',
          passages: [1],
          scoreConfiance: 0.5,
        } as never,
      );
    }
    return { questions };
  }
}

/** Une question telle que le fournisseur factice la « recopie » (format du schéma). */
interface QuestionFactice {
  enonce: string;
  type: 'QCU' | 'QCM' | 'VRAI_FAUX';
  options: Array<{ texte: string; estCorrecte: boolean | null }>;
  explication: string | null;
  niveau: string | null;
}

const sansAccent = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const NIVEAUX: Record<string, string> = {
  debutant: 'DEBUTANT',
  facile: 'DEBUTANT',
  intermediaire: 'INTERMEDIAIRE',
  moyen: 'INTERMEDIAIRE',
  avance: 'AVANCE',
  difficile: 'AVANCE',
};

/** Lettres (« B », « A, C ») ou textes d'options -> indices des bonnes réponses. */
function indicesReponses(reponse: string, options: string[]): number[] {
  const propre = reponse.trim();
  const parLettres = propre
    .split(/(?:\s*[,;/+]\s*|\s+et\s+|\s+)/i)
    .filter(Boolean)
    .map((l) => l.toUpperCase());
  if (parLettres.length > 0 && parLettres.every((l) => /^[A-J]$/.test(l))) {
    return parLettres.map((l) => l.charCodeAt(0) - 65).filter((i) => i < options.length);
  }
  const i = options.findIndex((o) => sansAccent(o) === sansAccent(propre));
  return i >= 0 ? [i] : [];
}

/** Assemble une question : type déduit (Vrai/Faux, nombre de bonnes réponses). */
function question(
  enonce: string,
  options: string[],
  reponse: string | null,
  explication: string | null,
  niveau: string | null,
  marquees: number[] = [],
): QuestionFactice | null {
  if (!enonce || options.length < 2) return null;
  const justes = reponse !== null ? indicesReponses(reponse, options) : marquees;
  const connue = justes.length > 0;
  const vraiFaux =
    options.length === 2 && options.every((o) => ['vrai', 'faux'].includes(sansAccent(o)));
  return {
    enonce,
    type: vraiFaux ? 'VRAI_FAUX' : justes.length > 1 ? 'QCM' : 'QCU',
    options: options.map((texte, i) => ({
      texte,
      estCorrecte: connue ? justes.includes(i) : null,
    })),
    explication,
    niveau: niveau ? (NIVEAUX[sansAccent(niveau)] ?? null) : null,
  };
}

/**
 * Lecture d'un tableau rendu en texte (« Ligne N : a | b | c », 1re ligne =
 * en-têtes) : colonnes reconnues par leur en-tête (question / énoncé,
 * option / choix / A…F, réponse / bonne / correcte, explication, niveau).
 */
function analyserTableau(lignes: string[][]): QuestionFactice[] {
  const [entetes, ...donnees] = lignes;
  const cols = entetes.map(sansAccent);
  const col = (...mots: string[]): number => cols.findIndex((c) => mots.some((m) => c.includes(m)));
  const iEnonce = col('enonce', 'question', 'intitule');
  const iReponse = col('bonne', 'correct', 'reponse', 'solution');
  const iExplication = col('explication', 'justification');
  const iNiveau = col('niveau', 'difficulte');
  const iOptions = cols
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c, i }) => i !== iReponse && (/^(option|choix|proposition)/.test(c) || /^[a-f]$/.test(c)),
    )
    .map(({ i }) => i);
  if (iEnonce < 0 || iOptions.length < 2) return [];
  return donnees
    .map((l) =>
      question(
        (l[iEnonce] ?? '').trim(),
        iOptions.map((i) => (l[i] ?? '').trim()).filter(Boolean),
        iReponse >= 0 && (l[iReponse] ?? '').trim() ? l[iReponse] : null,
        iExplication >= 0 ? (l[iExplication] ?? '').trim() || null : null,
        iNiveau >= 0 ? (l[iNiveau] ?? '').trim() || null : null,
      ),
    )
    .filter((q): q is QuestionFactice => q !== null);
}

/**
 * Analyse factice d'un document (US-IA-08), sans réseau : un tableau
 * (« Ligne N : … ») ou un sujet rédigé — « 1. Énoncé », options « A) … »
 * (une option suivie de « * » ou « (x) » est marquée juste), « Réponse : B »,
 * « Explication : … », « Niveau : … ». Tout autre texte (dont une consigne
 * glissée dans le document) est ignoré : le factice ne fait que recopier.
 */
export function analyserDocumentFactice(document: string): QuestionFactice[] {
  const lignes = document.split(/\r?\n/);
  const tableau = lignes
    .map((l) => /^Ligne \d+ : (.*)$/.exec(l.trim())?.[1])
    .filter((l): l is string => l !== undefined)
    .map((l) => l.split(' | '));
  if (tableau.length >= 2) return analyserTableau(tableau);

  const questions: QuestionFactice[] = [];
  let courante: {
    enonce: string;
    options: string[];
    marquees: number[];
    reponse: string | null;
    explication: string | null;
    niveau: string | null;
  } | null = null;
  const clore = (): void => {
    if (!courante) return;
    const q = question(
      courante.enonce,
      courante.options,
      courante.reponse,
      courante.explication,
      courante.niveau,
      courante.marquees,
    );
    if (q) questions.push(q);
    courante = null;
  };
  for (const brute of lignes) {
    const l = brute.trim();
    const debut = /^(?:Q(?:uestion)?\s*)?\d{1,3}\s*[.):-]\s*(.+)$/i.exec(l);
    const option = /^([A-Ja-j])\s*[).:-]\s*(.+)$/.exec(l);
    const reponse = /^(?:bonnes?\s+)?r[ée]ponses?(?:\s+correctes?)?\s*:\s*(.+)$/i.exec(l);
    const explication = /^explication\s*:\s*(.+)$/i.exec(l);
    const niveau = /^niveau\s*:\s*(.+)$/i.exec(l);
    if (option && courante) {
      const marque = /\s*(\*|\(x\)|✓)\s*$/i.test(option[2]);
      if (marque) courante.marquees.push(courante.options.length);
      courante.options.push(option[2].replace(/\s*(\*|\(x\)|✓)\s*$/i, '').trim());
    } else if (reponse && courante) {
      courante.reponse = reponse[1];
    } else if (explication && courante) {
      courante.explication = explication[1].trim();
    } else if (niveau && courante) {
      courante.niveau = niveau[1].trim();
    } else if (debut) {
      clore();
      courante = {
        enonce: debut[1].trim(),
        options: [],
        marquees: [],
        reponse: null,
        explication: null,
        niveau: null,
      };
    }
  }
  clore();
  return questions;
}
