/**
 * État d'une suggestion de question produite par l'IA (diagramme d'états
 * *SuggestionQuestionIA* : PROPOSEE -> ACCEPTEE / MODIFIEE / REJETEE).
 * US-IA-03 crée les suggestions PROPOSEE ; la révision humaine (US-IA-04)
 * les fait passer à un état final, sans retour.
 */
export enum StatutSuggestion {
  PROPOSEE = 'PROPOSEE',
  ACCEPTEE = 'ACCEPTEE',
  MODIFIEE = 'MODIFIEE',
  REJETEE = 'REJETEE',
}
