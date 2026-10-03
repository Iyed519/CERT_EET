export declare class AuditLog {
    id: string;
    userId: string | null;
    action: string;
    cible: string | null;
    adresseIp: string | null;
    resultat: string | null;
    detailsAvantApres: Record<string, unknown> | null;
    horodatage: Date;
}
