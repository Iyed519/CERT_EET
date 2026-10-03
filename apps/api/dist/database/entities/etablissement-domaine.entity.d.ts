import { Etablissement } from './etablissement.entity';
import { DomaineEtudes } from './domaine-etudes.entity';
export declare class EtablissementDomaine {
    id: string;
    etablissementId: string;
    etablissement: Etablissement;
    domaineId: string;
    domaine: DomaineEtudes;
}
