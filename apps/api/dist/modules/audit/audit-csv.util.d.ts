import { AuditLog } from '../../database/entities/audit-log.entity';
export declare const AUDIT_CSV_HEADERS: readonly ["horodatage", "action", "acteur", "cible", "adresse_ip", "resultat", "details"];
export declare function auditLogsToCsv(lignes: AuditLog[]): string;
