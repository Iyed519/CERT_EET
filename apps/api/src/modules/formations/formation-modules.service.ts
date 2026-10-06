import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { AuditService } from '../audit/audit.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { FormationsService, ModuleVue, versModuleVue } from './formations.service';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/**
 * Gestion des modules d'une formation (US-FORM-01, FORM01-2).
 *
 * Invariant que je maintiens ici : dans une formation, les modules sont
 * numérotés 1, 2, 3… SANS TROU et sans doublon. C'est le serveur qui attribue
 * l'ordre (ajout en fin de liste), le recalcule à la suppression et l'applique
 * en bloc au réordonnancement — le client n'écrit jamais un numéro d'ordre.
 *
 * Toute écriture passe d'abord par FormationsService.chargerPourEcriture :
 * 404 si la formation n'existe pas, 409 si elle est archivée.
 */
@Injectable()
export class FormationModulesService {
  constructor(
    @InjectRepository(ModuleFormation)
    private readonly moduleRepository: Repository<ModuleFormation>,
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    private readonly formationsService: FormationsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /** Ajoute un module en DERNIÈRE position de la formation. */
  async ajouter(
    adminId: string,
    formationId: string,
    dto: CreateModuleDto,
    context: Contexte,
  ): Promise<ModuleVue> {
    await this.formationsService.chargerPourEcriture(formationId);

    const dernier = await this.moduleRepository.findOne({
      where: { formationId },
      order: { ordre: 'DESC' },
    });
    const module = await this.moduleRepository.save(
      this.moduleRepository.create({
        formationId,
        titre: dto.titre,
        description: dto.description ?? null,
        ordre: (dernier?.ordre ?? 0) + 1,
      }),
    );

    await this.auditService.record({
      action: 'MODULE_CREE',
      acteur: adminId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { moduleId: module.id, titre: module.titre, ordre: module.ordre },
    });

    return versModuleVue(module);
  }

  /** Modifie le titre et/ou la description d'un module (jamais son ordre). */
  async modifier(
    adminId: string,
    formationId: string,
    moduleId: string,
    dto: UpdateModuleDto,
    context: Contexte,
  ): Promise<ModuleVue> {
    await this.formationsService.chargerPourEcriture(formationId);
    const module = await this.chargerModule(formationId, moduleId);

    const saisie = dto as Record<string, unknown>;
    if (saisie.titre === undefined && saisie.description === undefined) {
      throw new BadRequestException('Aucune modification fournie.');
    }
    if (saisie.titre === null) {
      throw new BadRequestException('Le titre du module est obligatoire et ne peut pas être vidé.');
    }

    const avant = { titre: module.titre, description: module.description };
    if (dto.titre !== undefined) {
      module.titre = dto.titre;
    }
    if (saisie.description !== undefined) {
      module.description = (saisie.description as string | null) ?? null;
    }
    const enregistre = await this.moduleRepository.save(module);

    await this.auditService.record({
      action: 'MODULE_MODIFIE',
      acteur: adminId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        moduleId,
        avant,
        apres: { titre: enregistre.titre, description: enregistre.description },
      },
    });

    return versModuleVue(enregistre);
  }

  /**
   * Supprime un module, puis referme le trou dans la numérotation.
   *
   * Refus (409) si le module porte déjà une évaluation : la base l'interdirait
   * de toute façon (FK RESTRICT), mais je préfère un message clair à une
   * erreur de contrainte. Suppression + renumérotation dans UNE transaction :
   * la liste n'est jamais visible dans un état intermédiaire.
   */
  async supprimer(
    adminId: string,
    formationId: string,
    moduleId: string,
    context: Contexte,
  ): Promise<void> {
    await this.formationsService.chargerPourEcriture(formationId);
    const module = await this.chargerModule(formationId, moduleId);

    const evaluations = await this.qcmRepository.count({ where: { moduleId } });
    if (evaluations > 0) {
      throw new ConflictException(
        'Ce module contient des évaluations et ne peut pas être supprimé.',
      );
    }

    await this.moduleRepository.manager.transaction(async (manager) => {
      await manager.delete(ModuleFormation, { id: moduleId });
      await manager.decrement(
        ModuleFormation,
        { formationId, ordre: MoreThan(module.ordre) },
        'ordre',
        1,
      );
    });

    await this.auditService.record({
      action: 'MODULE_SUPPRIME',
      acteur: adminId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { moduleId, titre: module.titre, ordre: module.ordre },
    });
  }

  /**
   * Réordonne TOUS les modules de la formation d'un coup.
   *
   * La liste reçue doit être exactement l'ensemble des modules de la
   * formation (400 sinon) : un oubli laisserait deux modules au même rang, un
   * intrus toucherait une autre formation. Application en une transaction.
   */
  async reordonner(
    adminId: string,
    formationId: string,
    moduleIds: string[],
    context: Contexte,
  ): Promise<ModuleVue[]> {
    await this.formationsService.chargerPourEcriture(formationId);

    const modules = await this.moduleRepository.find({
      where: { formationId },
      order: { ordre: 'ASC' },
    });
    const existants = new Set(modules.map((m) => m.id));
    const complet =
      moduleIds.length === existants.size && moduleIds.every((id) => existants.has(id));
    if (!complet) {
      throw new BadRequestException(
        'La liste doit contenir exactement tous les modules de la formation, une fois chacun.',
      );
    }

    await this.moduleRepository.manager.transaction(async (manager) => {
      for (const [index, id] of moduleIds.entries()) {
        await manager.update(ModuleFormation, { id }, { ordre: index + 1 });
      }
    });

    await this.auditService.record({
      action: 'MODULES_REORDONNES',
      acteur: adminId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { avant: modules.map((m) => m.id), apres: moduleIds },
    });

    const parId = new Map(modules.map((m) => [m.id, m]));
    return moduleIds.map((id, index) =>
      versModuleVue({ ...(parId.get(id) as ModuleFormation), ordre: index + 1 }),
    );
  }

  /**
   * Charge un module EN VÉRIFIANT qu'il appartient à la formation de l'URL :
   * un identifiant de module valide mais rattaché à une autre formation est
   * traité comme introuvable (404).
   */
  private async chargerModule(formationId: string, moduleId: string): Promise<ModuleFormation> {
    const module = await this.moduleRepository.findOne({
      where: { id: moduleId, formationId },
    });
    if (!module) {
      throw new NotFoundException('Module introuvable dans cette formation.');
    }
    return module;
  }
}
