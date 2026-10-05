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
 */
export enum StatutFormation {
  OUVERTE = 'OUVERTE',
  FERMEE = 'FERMEE',
  ARCHIVEE = 'ARCHIVEE',
}
