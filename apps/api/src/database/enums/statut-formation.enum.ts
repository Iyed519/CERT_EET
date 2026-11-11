/**
 * Cycle de vie d'une formation (US-FORM-01 / US-FORM-02, DS-16 P1).
 *
 * Le diagramme de classes porte ce statut sous forme de libellés
 * (« Ouverte | Fermée | Archivée »). Je le type par une énumération, comme le
 * prescrit le dossier de conception (§2.4) : une valeur illégale est rejetée
 * dès la compilation et par PostgreSQL.
 *
 * OUVERTE (état initial, inscriptions possibles) -> FERMEE (clôturée) ->
 * ARCHIVEE (figée ; les certificats émis restent vérifiables).
 *
 * US-FORM-08 : BROUILLON — formation issue d'une proposition acceptée, hors
 * catalogue et sans inscription, jusqu'à sa publication (-> OUVERTE).
 */
export enum StatutFormation {
  BROUILLON = 'BROUILLON',
  OUVERTE = 'OUVERTE',
  FERMEE = 'FERMEE',
  ARCHIVEE = 'ARCHIVEE',
}
