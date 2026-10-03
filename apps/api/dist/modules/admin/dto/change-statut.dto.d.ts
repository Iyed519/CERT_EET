import { StatutCompte } from '../../../database/enums/statut-compte.enum';
export type StatutAdministrable = StatutCompte.ACTIF | StatutCompte.DESACTIVE;
export declare class ChangeStatutDto {
    statut: StatutAdministrable;
    motif?: string;
}
