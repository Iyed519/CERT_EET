import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { NatureRessource } from '../../database/enums/nature-ressource.enum';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { ModeLecture } from './fichier-ressource.regles';
import {
  analyserLien,
  MESSAGE_ADRESSE_FICHIER,
  domaineDe,
  MESSAGE_RESSOURCE_INTROUVABLE,
  nettoyerTexte,
  Plateforme,
  verifierNouvelOrdre,
  verifierPlace,
} from './ressource.regles';
import { AjouterLienDto, ModifierRessourceDto, ReordonnerRessourcesDto } from './ressources.dto';

export interface ContexteRessource {
  adresseIp: string | null;
}

/**
 * Une ressource, telle que la voient le formateur ET l'apprenant (liste
 * blanche). Pour une vidéo, le lecteur se construit avec `plateforme` +
 * `videoId` (+ `debutSecondes`), jamais avec l'adresse saisie.
 */
export interface RessourceVue {
  id: string;
  ordre: number;
  nature: NatureRessource;
  titre: string;
  description: string | null;
  url: string | null;
  plateforme: Plateforme | null;
  videoId: string | null;
  debutSecondes: number | null;
  domaine: string | null;
  /** US-FORM-06 — fichier (null pour un lien) ; jamais la clé de stockage. */
  fichier: {
    nomOriginal: string;
    extension: string;
    tailleOctets: number;
    /** VIDEO, AUDIO, PDF, IMAGE : lisible dans la plateforme ; null : à télécharger. */
    lecture: ModeLecture | null;
  } | null;
}

export function versVueRessource(r: RessourceModule): RessourceVue {
  return {
    id: r.id,
    ordre: r.ordre,
    nature: r.nature,
    titre: r.titre,
    description: r.description,
    url: r.url,
    plateforme: r.plateforme as Plateforme | null,
    videoId: r.videoId,
    debutSecondes: r.debutSecondes,
    domaine: r.url ? domaineDe(r.url) : null,
    fichier:
      r.nature === NatureRessource.FICHIER
        ? {
            nomOriginal: r.nomOriginal as string,
            extension: r.extension as string,
            tailleOctets: r.tailleOctets as number,
            lecture: r.lecture as ModeLecture | null,
          }
        : null,
  };
}

/**
 * Ressources pédagogiques de module — liens (US-FORM-05, révision v1.5).
 * Formateur AFFECTÉ ou administrateur (garde @FormateurDeLaFormation) ;
 * formation archivée -> 409 pour toute écriture.
 *
 * Concurrence : ajout, réordonnancement et suppression verrouillent la ligne
 * du MODULE (FOR UPDATE) — l'ordre est calculé et réécrit sous ce verrou,
 * donc deux ajouts simultanés reçoivent deux rangs distincts. La modification
 * verrouille la ressource.
 */
@Injectable()
export class RessourcesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly formationsService: FormationsService,
    private readonly stockageService: StockageService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /** Ressources d'un module dans l'ordre d'affichage. */
  async listerDuModule(moduleId: string): Promise<RessourceVue[]> {
    const module = await this.dataSource.manager.findOne(ModuleFormation, {
      where: { id: moduleId },
      select: { id: true },
    });
    if (!module) throw new NotFoundException('Module introuvable.');
    const ressources = await this.dataSource.manager.find(RessourceModule, {
      where: { moduleId },
      order: { ordre: 'ASC' },
    });
    return ressources.map(versVueRessource);
  }

  async ajouterLien(
    acteurId: string,
    moduleId: string,
    dto: AjouterLienDto,
    contexte: ContexteRessource,
  ): Promise<RessourceVue> {
    const lien = analyserLien(dto.url);
    const titre = nettoyerTexte(dto.titre);
    if (!titre) throw new BadRequestException('Le titre est obligatoire.');
    const description = nettoyerTexte(dto.description);

    const { id, formationId } = await this.dataSource.transaction(async (manager) => {
      const module = await this.verrouillerModule(manager, moduleId);
      const [{ nb, max }] = (await manager.query(
        `SELECT count(*)::int AS nb, coalesce(max(ordre), 0)::int AS max
           FROM ressources_module WHERE module_id = $1`,
        [moduleId],
      )) as Array<{ nb: number; max: number }>;
      verifierPlace(nb);
      const [ligne] = (await manager.query(
        `INSERT INTO ressources_module
           (module_id, ordre, nature, titre, description, url, plateforme, video_id,
            debut_secondes, ajoute_par)
         VALUES ($1, $2, 'LIEN', $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          moduleId,
          max + 1,
          titre,
          description,
          lien.url,
          lien.plateforme,
          lien.videoId,
          lien.debutSecondes,
          acteurId,
        ],
      )) as Array<{ id: string }>;
      return { id: ligne.id, formationId: module.formationId };
    });

    await this.auditService.record({
      action: 'RESSOURCE_AJOUTEE',
      acteur: acteurId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId,
        moduleId,
        nature: NatureRessource.LIEN,
        titre,
        url: lien.url,
        plateforme: lien.plateforme,
      },
    });
    return this.vue(id);
  }

  async modifier(
    acteurId: string,
    ressourceId: string,
    dto: ModifierRessourceDto,
    contexte: ContexteRessource,
  ): Promise<RessourceVue> {
    if (dto.titre === undefined && dto.url === undefined && dto.description === undefined) {
      throw new BadRequestException('Indiquez au moins un champ à modifier.');
    }
    const titre = dto.titre === undefined ? undefined : nettoyerTexte(dto.titre);
    if (titre === null) throw new BadRequestException('Le titre ne peut pas être vide.');
    const lien = dto.url === undefined ? undefined : analyserLien(dto.url);

    const avant = await this.dataSource.transaction(async (manager) => {
      const ressource = await manager.findOne(RessourceModule, {
        where: { id: ressourceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!ressource) throw new NotFoundException(MESSAGE_RESSOURCE_INTROUVABLE);
      if (lien && ressource.nature === NatureRessource.FICHIER) {
        throw new BadRequestException(MESSAGE_ADRESSE_FICHIER);
      }
      await this.verifierFormationModifiable(manager, ressource.moduleId);
      await manager.update(
        RessourceModule,
        { id: ressourceId },
        {
          ...(titre !== undefined ? { titre } : {}),
          ...(dto.description !== undefined ? { description: nettoyerTexte(dto.description) } : {}),
          ...(lien
            ? {
                url: lien.url,
                plateforme: lien.plateforme,
                videoId: lien.videoId,
                debutSecondes: lien.debutSecondes,
              }
            : {}),
        },
      );
      return ressource;
    });

    const apres = await this.vue(ressourceId);
    await this.auditService.record({
      action: 'RESSOURCE_MODIFIEE',
      acteur: acteurId,
      cible: ressourceId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        avant: { titre: avant.titre, description: avant.description, url: avant.url },
        apres: { titre: apres.titre, description: apres.description, url: apres.url },
      },
    });
    return apres;
  }

  /** Réécrit l'ordre complet du module (en deux passes : jamais de doublon transitoire). */
  async reordonner(
    acteurId: string,
    moduleId: string,
    dto: ReordonnerRessourcesDto,
    contexte: ContexteRessource,
  ): Promise<RessourceVue[]> {
    await this.dataSource.transaction(async (manager) => {
      await this.verrouillerModule(manager, moduleId);
      const existants = (await manager.query(
        'SELECT id FROM ressources_module WHERE module_id = $1',
        [moduleId],
      )) as Array<{ id: string }>;
      verifierNouvelOrdre(
        existants.map((e) => e.id),
        dto.ids,
      );
      await manager.query(
        'UPDATE ressources_module SET ordre = ordre + 1000 WHERE module_id = $1',
        [moduleId],
      );
      await manager.query(
        `UPDATE ressources_module r SET ordre = n.rang, updated_at = now()
           FROM unnest($2::uuid[]) WITH ORDINALITY AS n(id, rang)
          WHERE r.id = n.id AND r.module_id = $1`,
        [moduleId, dto.ids],
      );
    });
    await this.auditService.record({
      action: 'RESSOURCES_REORDONNEES',
      acteur: acteurId,
      cible: moduleId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { ordre: dto.ids },
    });
    return this.listerDuModule(moduleId);
  }

  async supprimer(
    acteurId: string,
    ressourceId: string,
    contexte: ContexteRessource,
  ): Promise<void> {
    const supprimee = await this.dataSource.transaction(async (manager) => {
      const ressource = await manager.findOne(RessourceModule, {
        where: { id: ressourceId },
        select: { id: true, moduleId: true },
      });
      if (!ressource) throw new NotFoundException(MESSAGE_RESSOURCE_INTROUVABLE);
      await this.verrouillerModule(manager, ressource.moduleId);
      const complete = await manager.findOne(RessourceModule, { where: { id: ressourceId } });
      if (!complete) throw new NotFoundException(MESSAGE_RESSOURCE_INTROUVABLE);
      await manager.delete(RessourceModule, { id: ressourceId });
      return complete;
    });
    // US-FORM-06 : l'objet du fichier, après validation (au mieux).
    if (supprimee.cleStockage) await this.stockageService.supprimer([supprimee.cleStockage]);
    await this.auditService.record({
      action: 'RESSOURCE_SUPPRIMEE',
      acteur: acteurId,
      cible: ressourceId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        moduleId: supprimee.moduleId,
        titre: supprimee.titre,
        nature: supprimee.nature,
        url: supprimee.url,
        sha256: supprimee.sha256,
      },
    });
  }

  private async vue(ressourceId: string): Promise<RessourceVue> {
    const ressource = await this.dataSource.manager.findOne(RessourceModule, {
      where: { id: ressourceId },
    });
    if (!ressource) throw new NotFoundException(MESSAGE_RESSOURCE_INTROUVABLE);
    return versVueRessource(ressource);
  }

  /** Verrou du module (FOR UPDATE), 404 s'il n'existe pas, 409 si la formation est archivée. */
  private async verrouillerModule(
    manager: EntityManager,
    moduleId: string,
  ): Promise<ModuleFormation> {
    const module = await manager.findOne(ModuleFormation, {
      where: { id: moduleId },
      select: { id: true, formationId: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!module) throw new NotFoundException('Module introuvable.');
    await this.formationsService.chargerPourEcriture(module.formationId);
    return module;
  }

  private async verifierFormationModifiable(
    manager: EntityManager,
    moduleId: string,
  ): Promise<void> {
    const module = await manager.findOneOrFail(ModuleFormation, {
      where: { id: moduleId },
      select: { id: true, formationId: true },
    });
    await this.formationsService.chargerPourEcriture(module.formationId);
  }
}
