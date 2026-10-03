import { Response } from 'express';
import { AuditPage, AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    list(query: AuditQueryDto): Promise<AuditPage>;
    export(query: AuditQueryDto, res: Response): Promise<string>;
}
