import { FournisseurLlm, PromptGeneration } from './fournisseur-llm';

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
 */
export class LlmFactice implements FournisseurLlm {
  readonly modele = MODELE_FACTICE;

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
