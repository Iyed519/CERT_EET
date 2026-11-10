/** US-RPT-01 / US-RPT-02 — Nature d'un rapport exporté. */
export enum TypeRapport {
  /** Rapport de session d'une formation (formateur, US-RPT-01). */
  SESSION = 'SESSION',
  /** Rapport institutionnel (administrateur, US-RPT-02). */
  INSTITUTIONNEL = 'INSTITUTIONNEL',
}

/** Format du fichier produit. */
export enum FormatRapport {
  CSV = 'CSV',
  PDF = 'PDF',
}

/** Cycle de vie d'un rapport (génération asynchrone, file BullMQ). */
export enum StatutRapport {
  EN_ATTENTE = 'EN_ATTENTE',
  EN_COURS = 'EN_COURS',
  PRET = 'PRET',
  ECHEC = 'ECHEC',
}
