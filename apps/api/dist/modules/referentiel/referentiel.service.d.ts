import { Repository } from 'typeorm';
import { DomaineEtudes } from '../../database/entities/domaine-etudes.entity';
import { Etablissement } from '../../database/entities/etablissement.entity';
export interface EtablissementVue {
    id: string;
    nom: string;
    type: string;
    gouvernorat: string | null;
    universite: {
        id: string;
        nom: string;
        type: string;
    } | null;
}
export declare class ReferentielService {
    private readonly domaineRepository;
    private readonly etablissementRepository;
    constructor(domaineRepository: Repository<DomaineEtudes>, etablissementRepository: Repository<Etablissement>);
    getDomaines(): Promise<DomaineEtudes[]>;
    getEtablissements(): Promise<EtablissementVue[]>;
}
