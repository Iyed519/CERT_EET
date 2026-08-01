import { AuditLog } from '../../database/entities/audit-log.entity';

/**
 * Sérialisation CSV du journal d'audit (US-AUTH-12, export DS-16).
 *
 * Format RFC 4180 : séparateur virgule, guillemets doublés, champ entre
 * guillemets s'il contient virgule / guillemet / saut de ligne. Colonnes
 * alignées sur l'affichage DS-16 (horodatage, action, acteur, cible, IP,
 * résultat) + le détail JSON. L'appelant préfixe un BOM UTF-8 pour qu'Excel
 * lise correctement les accents.
 */

/** En-têtes de colonnes (ordre stable, réutilisé par les tests). */
export const AUDIT_CSV_HEADERS = [
  'horodatage',
  'action',
  'acteur',
  'cible',
  'adresse_ip',
  'resultat',
  'details',
] as const;

/** Échappe une valeur en cellule CSV (RFC 4180). */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Une ligne d'audit -> tableau de cellules (mêmes colonnes que les en-têtes). */
function ligneToCells(ligne: AuditLog): string[] {
  const horodatage =
    ligne.horodatage instanceof Date
      ? ligne.horodatage.toISOString()
      : String(ligne.horodatage ?? '');
  const details = ligne.detailsAvantApres
    ? JSON.stringify(ligne.detailsAvantApres)
    : '';
  return [
    horodatage,
    ligne.action ?? '',
    ligne.userId ?? '', // "acteur"
    ligne.cible ?? '',
    ligne.adresseIp ?? '',
    ligne.resultat ?? '',
    details,
  ];
}

/**
 * Convertit des lignes d'audit en CSV (en-tête + lignes, séparateur CRLF).
 * Ne préfixe PAS le BOM : c'est le contrôleur qui l'ajoute au moment de l'envoi.
 */
export function auditLogsToCsv(lignes: AuditLog[]): string {
  const rows = [
    AUDIT_CSV_HEADERS.join(','),
    ...lignes.map((l) => ligneToCells(l).map(csvCell).join(',')),
  ];
  return rows.join('\r\n');
}
