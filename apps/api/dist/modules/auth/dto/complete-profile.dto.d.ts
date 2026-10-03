import { NiveauEtudes } from '../../../database/enums/niveau-etudes.enum';
export declare class CompleteProfileDto {
    dateNaissance: string;
    niveauEtudes: NiveauEtudes;
    enEtudes: boolean;
    domaineEtudesId?: string;
    etablissementId?: string;
    etablissementAutre?: string;
}
