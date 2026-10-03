import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminUsersService, UserAdminVue } from './admin-users.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeStatutDto } from './dto/change-statut.dto';
export declare class AdminUsersController {
    private readonly adminUsersService;
    constructor(adminUsersService: AdminUsersService);
    listUsers(): Promise<UserAdminVue[]>;
    changeRole(cibleId: string, dto: ChangeRoleDto, req: AuthenticatedRequest): Promise<UserAdminVue>;
    changeStatut(cibleId: string, dto: ChangeStatutDto, req: AuthenticatedRequest): Promise<UserAdminVue>;
}
