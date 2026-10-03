import { StatutDemande } from '../../../database/enums/statut-demande.enum';
export declare class ListRoleRequestsDto {
    statut?: StatutDemande;
    page?: number;
    limit?: number;
}
