import { Universite } from './universite.entity';
export declare class Etablissement {
    id: string;
    universiteId: string;
    universite: Universite;
    nom: string;
    type: string;
    gouvernorat: string | null;
    createdAt: Date;
}
