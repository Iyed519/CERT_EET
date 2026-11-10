/**
 * Cycle de vie d'un certificat (DS-04, DS-07, diagramme d'états *Certificat*).
 *
 * EN_ATTENTE_GENERATION (demandé, en file ; aussi après un échec définitif,
 * pour une relance manuelle) -> EN_GENERATION (pris par le worker) -> ACTIF
 * (PDF, empreinte SHA-256 et QR fixés : immuable) -> REVOQUE (US-CERT-06,
 * irréversible) ou -> EXPIRE (US-CERT-07 : date d'expiration atteinte,
 * définitif).
 */
export enum StatutCertificat {
  EN_ATTENTE_GENERATION = 'EN_ATTENTE_GENERATION',
  EN_GENERATION = 'EN_GENERATION',
  ACTIF = 'ACTIF',
  REVOQUE = 'REVOQUE',
  EXPIRE = 'EXPIRE',
}
