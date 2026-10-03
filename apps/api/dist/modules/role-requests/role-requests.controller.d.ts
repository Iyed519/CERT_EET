import { AuthenticatedRequest } from '../auth/auth.types';
import { DemandeRoleVue, RoleRequestsService } from './role-requests.service';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';
export declare class RoleRequestsController {
    private readonly roleRequestsService;
    constructor(roleRequestsService: RoleRequestsService);
    creer(dto: CreateRoleRequestDto, req: AuthenticatedRequest): Promise<DemandeRoleVue>;
    listerMes(req: AuthenticatedRequest): Promise<DemandeRoleVue[]>;
}
