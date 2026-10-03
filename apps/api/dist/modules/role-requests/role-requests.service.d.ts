import { Repository } from 'typeorm';
import { DemandeRole } from '../../database/entities/demande-role.entity';
import { User } from '../../database/entities/user.entity';
import { RoleDemande } from '../../database/enums/role-demande.enum';
import { StatutDemande } from '../../database/enums/statut-demande.enum';
import { AuditService } from '../audit/audit.service';
import { AdminUsersService } from '../admin/admin-users.service';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';
import { ListRoleRequestsDto } from './dto/list-role-requests.dto';
export interface DemandeRoleVue {
    id: string;
    roleDemande: RoleDemande;
    justification: string;
    statut: StatutDemande;
    motif: string | null;
    traiteAt: Date | null;
    createdAt: Date;
}
export interface Demandeur {
    id: string;
    email: string;
    nom: string | null;
    prenom: string | null;
}
export interface DemandeRoleAdminVue extends DemandeRoleVue {
    demandeur: Demandeur;
    traitePar: string | null;
}
export interface DemandeRolePage {
    items: DemandeRoleAdminVue[];
    total: number;
    page: number;
    limit: number;
}
export declare class RoleRequestsService {
    private readonly demandeRepository;
    private readonly userRepository;
    private readonly auditService;
    private readonly adminUsersService;
    constructor(demandeRepository: Repository<DemandeRole>, userRepository: Repository<User>, auditService: AuditService, adminUsersService: AdminUsersService);
    creer(userId: string, dto: CreateRoleRequestDto): Promise<DemandeRoleVue>;
    listerMes(userId: string): Promise<DemandeRoleVue[]>;
    listerAdmin(query: ListRoleRequestsDto): Promise<DemandeRolePage>;
    approuver(adminId: string, demandeId: string, context: {
        adresseIp: string | null;
    }): Promise<DemandeRoleAdminVue>;
    rejeter(adminId: string, demandeId: string, motif: string, context: {
        adresseIp: string | null;
    }): Promise<DemandeRoleAdminVue>;
    private chargerEnAttente;
    private chargerDemandeurs;
    private versRole;
    private toVue;
    private toAdminVue;
    private toAdminVueAvecUser;
}
