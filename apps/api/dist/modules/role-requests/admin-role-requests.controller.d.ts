import { AuthenticatedRequest } from '../auth/auth.types';
import { DemandeRoleAdminVue, DemandeRolePage, RoleRequestsService } from './role-requests.service';
import { ListRoleRequestsDto } from './dto/list-role-requests.dto';
import { RejectRoleRequestDto } from './dto/reject-role-request.dto';
export declare class AdminRoleRequestsController {
    private readonly roleRequestsService;
    constructor(roleRequestsService: RoleRequestsService);
    list(query: ListRoleRequestsDto): Promise<DemandeRolePage>;
    approuver(id: string, req: AuthenticatedRequest): Promise<DemandeRoleAdminVue>;
    rejeter(id: string, dto: RejectRoleRequestDto, req: AuthenticatedRequest): Promise<DemandeRoleAdminVue>;
}
