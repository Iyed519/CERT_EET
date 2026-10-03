import { Role } from '../enums/role.enum';
import { StatutCompte } from '../enums/statut-compte.enum';
import { NiveauEtudes } from '../enums/niveau-etudes.enum';
import { DomaineEtudes } from './domaine-etudes.entity';
import { Etablissement } from './etablissement.entity';
export declare class User {
    id: string;
    email: string;
    nom: string | null;
    prenom: string | null;
    motDePasseHash: string | null;
    role: Role;
    statut: StatutCompte;
    mfaActive: boolean;
    mfaSecret: string | null;
    derniereConnexion: Date | null;
    dateNaissance: string | null;
    niveauEtudes: NiveauEtudes | null;
    domaineEtudesId: string | null;
    domaineEtudes: DomaineEtudes | null;
    etablissementId: string | null;
    etablissement: Etablissement | null;
    etablissementAutre: string | null;
    profilComplet: boolean;
    createdAt: Date;
    updatedAt: Date;
}
