/**
 * US-QCM-02 — Règles PURES de la banque de questions du formateur.
 *
 * Banque = les questions des QCM dont le formateur est le créateur
 * (`qcm.formateur_id`), sauf celles déjà liées au QCM cible. L'import crée
 * une LIAISON (`qcm_questions`), jamais une copie : la même question peut
 * servir à plusieurs QCM.
 */

export const BORNES_BANQUE = { rechercheMax: 200, resultatsMax: 100, importMax: 50 } as const;

export const MESSAGE_IMPORT_VIDE = 'Choisissez au moins une question à importer.';
export const MESSAGE_HORS_BANQUE =
  'Certaines questions ne font pas partie de votre banque (ou sont déjà dans ce QCM).';
export const MESSAGE_AUCUN_RESULTAT = 'Aucune question de votre banque ne correspond.';
export const MESSAGE_QUESTION_PARTAGEE_FIGEE =
  'Cette question est aussi utilisée par un QCM qui a déjà des tentatives : son contenu est figé, seule l’explication reste modifiable.';

/** Motif ILIKE littéral : `%`, `_` et `\` sont échappés. */
export function motifRecherche(recherche: string | undefined): string | null {
  const t = recherche?.trim() ?? '';
  if (t === '') return null;
  return `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Identifiants demandés hors de la banque (dans l'ordre de la demande). */
export function horsBanque(demandes: string[], banque: Set<string>): string[] {
  return demandes.filter((id) => !banque.has(id));
}

/** Doublons retirés, ordre de la première apparition conservé. */
export function sansDoublons(ids: string[]): string[] {
  return [...new Set(ids)];
}
