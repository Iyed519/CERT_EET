import { RoleDemande } from '../enums/role-demande.enum';
import { StatutDemande } from '../enums/statut-demande.enum';
export declare class DemandeRole {
    id: string;
    userId: string;
    roleDemande: RoleDemande;
    justification: string;
    statut: StatutDemande;
    motif: string | null;
    traitePar: string | null;
    createdAt: Date;
    traiteAt: Date | null;
}
