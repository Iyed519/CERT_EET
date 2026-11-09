/**
 * Motif d'une révocation de certificat (US-CERT-06, DS-07). Liste fermée ;
 * la description détaillée reste interne (audit, administration).
 */
export enum MotifRevocation {
  FRAUDE = 'FRAUDE',
  ERREUR_ADMIN = 'ERREUR_ADMIN',
  DISCIPLINAIRE = 'DISCIPLINAIRE',
  JUDICIAIRE = 'JUDICIAIRE',
}
