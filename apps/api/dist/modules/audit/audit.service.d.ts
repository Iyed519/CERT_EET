import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
export interface AuditRecordInput {
    action: string;
    acteur?: string | null;
    cible?: string | null;
    adresseIp?: string | null;
    resultat?: string | null;
    detailsAvantApres?: Record<string, unknown> | null;
}
export interface AuditQueryInput {
    action?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}
export interface AuditPage {
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
}
export declare class AuditService {
    private readonly auditLogRepository;
    private static readonly MAX_EXPORT;
    constructor(auditLogRepository: Repository<AuditLog>);
    record(input: AuditRecordInput): Promise<void>;
    list(query: AuditQueryInput): Promise<AuditPage>;
    export(query: AuditQueryInput): Promise<AuditLog[]>;
    private buildWhere;
}
