"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT_CSV_HEADERS = void 0;
exports.auditLogsToCsv = auditLogsToCsv;
exports.AUDIT_CSV_HEADERS = [
    'horodatage',
    'action',
    'acteur',
    'cible',
    'adresse_ip',
    'resultat',
    'details',
];
function csvCell(value) {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
function ligneToCells(ligne) {
    const horodatage = ligne.horodatage instanceof Date
        ? ligne.horodatage.toISOString()
        : String(ligne.horodatage ?? '');
    const details = ligne.detailsAvantApres
        ? JSON.stringify(ligne.detailsAvantApres)
        : '';
    return [
        horodatage,
        ligne.action ?? '',
        ligne.userId ?? '',
        ligne.cible ?? '',
        ligne.adresseIp ?? '',
        ligne.resultat ?? '',
        details,
    ];
}
function auditLogsToCsv(lignes) {
    const rows = [
        exports.AUDIT_CSV_HEADERS.join(','),
        ...lignes.map((l) => ligneToCells(l).map(csvCell).join(',')),
    ];
    return rows.join('\r\n');
}
//# sourceMappingURL=audit-csv.util.js.map