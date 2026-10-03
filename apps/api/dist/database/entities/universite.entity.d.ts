import { Etablissement } from './etablissement.entity';
export declare class Universite {
    id: string;
    nom: string;
    type: string;
    gouvernorat: string | null;
    etablissements: Etablissement[];
    createdAt: Date;
}
