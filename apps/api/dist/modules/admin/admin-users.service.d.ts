import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ChangeRoleDto } from './dto/change-role.dto';
export interface UserAdminVue {
    id: string;
    email: string;
    nom: string | null;
    prenom: string | null;
    role: Role;
    statut: StatutCompte;
}
export declare class AdminUsersService {
    private readonly userRepository;
    private readonly auditService;
    private readonly authService;
    constructor(userRepository: Repository<User>, auditService: AuditService, authService: AuthService);
    listUsers(): Promise<UserAdminVue[]>;
    changeRole(adminId: string, cibleId: string, dto: ChangeRoleDto, context: {
        adresseIp: string | null;
    }): Promise<UserAdminVue>;
    appliquerChangementRole(adminId: string, cibleId: string, nouveauRole: Role, context: {
        adresseIp: string | null;
    }): Promise<UserAdminVue>;
    desactiverCompte(adminId: string, cibleId: string, motif: string, context: {
        adresseIp: string | null;
    }): Promise<UserAdminVue>;
    reactiverCompte(adminId: string, cibleId: string, context: {
        adresseIp: string | null;
    }): Promise<UserAdminVue>;
    private compterAdminsActifs;
    private toVue;
    private journaliserEchec;
}
