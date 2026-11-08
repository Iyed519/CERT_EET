import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { ContexteAcces, EspaceFormationService } from '../inscriptions/espace-formation.service';
import { etatDepot, EtatDepot } from './atelier.regles';
import { AteliersService } from './ateliers.service';
import { CritereVue, GrillesService } from './grille/grilles.service';

/** Fiche d'un atelier publié, pour un apprenant inscrit (liste blanche). */
export interface AtelierApprenantVue {
  id: string;
  formationId: string;
  formationTitre: string;
  moduleId: string;
  moduleTitre: string;
  titre: string;
  enonce: string;
  competencesVisees: string | null;
  dateLimite: Date;
  toleranceRetardHeures: number;
  typesLivrables: string[];
  tailleMaxMo: number;
  nbMaxFichiers: number;
  etatDepot: EtatDepot;
  grille: { totalPonderations: number; criteres: CritereVue[] };
}

export const MESSAGE_ATELIER_INTROUVABLE = 'Atelier introuvable.';

/**
 * Ateliers côté APPRENANT (US-ATEL-03 : « rendu visible aux apprenants
 * inscrits » ; UC4 Apprenant étape 1 : énoncé, consignes, grille visible).
 *
 * Règles :
 *  - seul un atelier PUBLIÉ existe pour l'apprenant : un identifiant inconnu
 *    et un brouillon donnent le même 404 (un brouillon n'est jamais révélé) ;
 *  - l'accès suit l'inscription, comme « Mon espace » : EN_COURS ou TERMINEE ;
 *    absente ou SUSPENDUE -> 403 tracé (EspaceFormationService) ;
 *  - réponse en liste blanche : ni formateur, ni horodatages internes ;
 *    l'état du dépôt se calcule à l'heure de PostgreSQL.
 */
@Injectable()
export class AteliersApprenantService {
  constructor(
    @InjectRepository(Atelier)
    private readonly atelierRepository: Repository<Atelier>,
    private readonly ateliersService: AteliersService,
    private readonly grillesService: GrillesService,
    private readonly espaceFormationService: EspaceFormationService,
  ) {}

  async fiche(
    apprenantId: string,
    atelierId: string,
    contexte: ContexteAcces,
  ): Promise<AtelierApprenantVue> {
    const atelier = await this.atelierRepository.findOne({
      where: { id: atelierId, statut: StatutAtelier.PUBLIE },
      relations: { module: { formation: true } },
    });
    if (!atelier) {
      throw new NotFoundException(MESSAGE_ATELIER_INTROUVABLE);
    }
    await this.espaceFormationService.exigerAccesContenu(
      apprenantId,
      atelier.module.formationId,
      contexte,
    );

    const criteres = await this.grillesService.criteresDeLAtelier(atelierId);
    const maintenant = await this.ateliersService.maintenant(this.atelierRepository.manager);
    return {
      id: atelier.id,
      formationId: atelier.module.formationId,
      formationTitre: atelier.module.formation.titre,
      moduleId: atelier.moduleId,
      moduleTitre: atelier.module.titre,
      titre: atelier.titre,
      enonce: atelier.enonce,
      competencesVisees: atelier.competencesVisees,
      dateLimite: atelier.dateLimite,
      toleranceRetardHeures: atelier.toleranceRetardHeures,
      typesLivrables: atelier.typesLivrables,
      tailleMaxMo: atelier.tailleMaxMo,
      nbMaxFichiers: atelier.nbMaxFichiers,
      etatDepot: etatDepot(atelier.dateLimite, atelier.toleranceRetardHeures, maintenant),
      grille: {
        totalPonderations: criteres.reduce((total, c) => total + c.ponderation, 0),
        criteres,
      },
    };
  }
}
