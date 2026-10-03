import { DomaineEtudes } from '../../database/entities/domaine-etudes.entity';
import { EtablissementVue, ReferentielService } from './referentiel.service';
export declare class ReferentielController {
    private readonly referentielService;
    constructor(referentielService: ReferentielService);
    getDomaines(): Promise<DomaineEtudes[]>;
    getEtablissements(): Promise<EtablissementVue[]>;
}
