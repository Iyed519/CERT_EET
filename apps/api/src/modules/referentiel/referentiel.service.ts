import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomaineEtudes } from '../../database/entities/domaine-etudes.entity';
import { Etablissement } from '../../database/entities/etablissement.entity';
/**
 * Service référentiel (US-AUTH-15) — alimente la carte de profil apprenant :
 * liste des domaines et des établissements (avec leur université).
 */
export interface EtablissementVue {
  id: string;
  nom: string;
  type: string;
  gouvernorat: string | null;
  universite: { id: string; nom: string; type: string } | null;
}
@Injectable()
export class ReferentielService {
  constructor(
    @InjectRepository(DomaineEtudes)
    private readonly domaineRepository: Repository<DomaineEtudes>,
    @InjectRepository(Etablissement)
    private readonly etablissementRepository: Repository<Etablissement>,
  ) {}
  /** Les 16 domaines, triés par intitulé. */
  getDomaines(): Promise<DomaineEtudes[]> {
    return this.domaineRepository.find({ order: { libelle: 'ASC' } });
  }
  /**
   * Tous les établissements (avec université), triés par nom. Le frontend fait
   * une liste déroulante cherchable groupée par université. Le filtre par
   * domaine (etablissement_domaine) sera branché en v2.
   */
  async getEtablissements(): Promise<EtablissementVue[]> {
    const rows = await this.etablissementRepository.find({
      relations: { universite: true },
      order: { nom: 'ASC' },
    });
    return rows.map((e) => ({
      id: e.id,
      nom: e.nom,
      type: e.type,
      gouvernorat: e.gouvernorat,
      universite: e.universite
        ? { id: e.universite.id, nom: e.universite.nom, type: e.universite.type }
        : null,
    }));
  }
}
