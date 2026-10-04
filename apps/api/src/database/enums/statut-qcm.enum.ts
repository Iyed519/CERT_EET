/**
 * Cycle de vie d'un QCM côté formateur (DS-12).
 *
 * Libellés du diagramme de classes (« Brouillon | NonPublié | Publié ») typés
 * par une énumération (dossier de conception §2.4).
 *
 * BROUILLON (contenu en cours de rédaction, US-QCM-01) -> NON_PUBLIE
 * (configuration anti-fraude enregistrée, US-QCM-03) -> PUBLIE (visible des
 * apprenants pendant la fenêtre d'ouverture, US-QCM-04). Seul un QCM PUBLIE
 * peut donner lieu à une tentative.
 */
export enum StatutQcm {
  BROUILLON = 'BROUILLON',
  NON_PUBLIE = 'NON_PUBLIE',
  PUBLIE = 'PUBLIE',
}
