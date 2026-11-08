/**
 * Cycle de vie d'un atelier côté formateur (DS-13, UC3 Formateur).
 *
 * BROUILLON (créé et modifiable, US-ATEL-01) -> PUBLIE (visible des apprenants
 * inscrits, US-ATEL-03). ARCHIVE est réservé : je le déclare dès maintenant
 * pour ne pas avoir à modifier le type PostgreSQL plus tard, mais aucune route
 * n'y conduit encore.
 *
 * À ne pas confondre avec le statut d'un LIVRABLE (BROUILLON -> SOUMIS ->
 * EN_CORRECTION -> NOTE, US-ATEL-04 et suivantes).
 */
export enum StatutAtelier {
  BROUILLON = 'BROUILLON',
  PUBLIE = 'PUBLIE',
  ARCHIVE = 'ARCHIVE',
}
