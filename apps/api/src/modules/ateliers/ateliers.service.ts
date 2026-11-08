import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import {
  BORNES_ATELIER,
  ExtensionLivrable,
  normaliserTypesLivrables,
  verifierDateLimite,
  verifierModifiable,
} from './atelier.regles';
import { CreateAtelierDto } from './dto/create-atelier.dto';
import { UpdateAtelierDto } from './dto/update-atelier.dto';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/** Un atelier dans la liste d'un module (sans son énoncé). */
export interface AtelierResumeVue {
  id: string;
  moduleId: string;
  titre: string;
  dateLimite: Date;
  typesLivrables: string[];
  statut: StatutAtelier;
  createdAt: Date;
  updatedAt: Date;
}

/** Fiche complète d'un atelier, pour son formateur. */
export interface AtelierDetailVue extends AtelierResumeVue {
  formationId: string;
  moduleTitre: string;
  enonce: string;
  competencesVisees: string | null;
  tailleMaxMo: number;
  nbMaxFichiers: number;
  toleranceRetardHeures: number;
}

/** Champs modifiables par PATCH, dans l'ordre où l'audit les présente. */
const CHAMPS = [
  'titre',
  'enonce',
  'competencesVisees',
  'dateLimite',
  'typesLivrables',
  'tailleMaxMo',
  'nbMaxFichiers',
  'toleranceRetardHeures',
] as const;
type Champ = (typeof CHAMPS)[number];

/** Valeurs prêtes à écrire (après nettoyage et normalisation). */
type Valeurs = Partial<{
  titre: string;
  enonce: string;
  competencesVisees: string | null;
  dateLimite: Date;
  typesLivrables: ExtensionLivrable[];
  tailleMaxMo: number;
  nbMaxFichiers: number;
  toleranceRetardHeures: number;
}>;

/**
 * Ateliers côté FORMATEUR affecté et ADMINISTRATEUR (US-ATEL-01, DS-13
 * partie 1, UC3 Formateur) : créer en brouillon, lister par module,
 * consulter, modifier et supprimer tant que l'atelier est en BROUILLON.
 *
 * Qui : le contrôleur pose @FormateurDeLaFormation — seul un formateur
 * AFFECTÉ à la formation du module (ou un administrateur) arrive ici.
 *
 * Règles transverses :
 *  - toute écriture vérifie la formation : 404 si le module ou l'atelier
 *    n'existe pas, 409 si la formation est archivée ;
 *  - la date limite est comparée à l'horloge de PostgreSQL (`now()`), jamais
 *    à celle du serveur Node ;
 *  - modification et suppression verrouillent la ligne (FOR UPDATE) : la
 *    publication (US-ATEL-03) ne pourra pas se glisser entre la vérification
 *    du statut et l'écriture.
 */
@Injectable()
export class AteliersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Atelier)
    private readonly atelierRepository: Repository<Atelier>,
    @InjectRepository(ModuleFormation)
    private readonly moduleRepository: Repository<ModuleFormation>,
    private readonly formationsService: FormationsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crée un atelier au statut BROUILLON (imposé) dans un module. Toute la
   * saisie est validée AVANT l'écriture : en cas de refus, rien n'est
   * enregistré (critère d'erreur du Backlog).
   */
  async creer(
    acteurId: string,
    moduleId: string,
    dto: CreateAtelierDto,
    contexte: Contexte,
  ): Promise<AtelierDetailVue> {
    const module = await this.moduleRepository.findOne({
      where: { id: moduleId },
      select: { id: true, formationId: true },
    });
    if (!module) {
      throw new NotFoundException('Module introuvable.');
    }
    await this.formationsService.chargerPourEcriture(module.formationId);

    const valeurs = this.nettoyer(dto, true);
    const maintenant = await this.maintenant(this.dataSource.manager);
    verifierDateLimite(valeurs.dateLimite as Date, maintenant);

    const atelier = await this.atelierRepository.save(
      this.atelierRepository.create({
        moduleId,
        formateurId: acteurId,
        titre: valeurs.titre,
        enonce: valeurs.enonce,
        competencesVisees: valeurs.competencesVisees ?? null,
        dateLimite: valeurs.dateLimite,
        typesLivrables: valeurs.typesLivrables,
        tailleMaxMo: valeurs.tailleMaxMo ?? BORNES_ATELIER.tailleMaxMo.defaut,
        nbMaxFichiers: valeurs.nbMaxFichiers ?? BORNES_ATELIER.nbMaxFichiers.defaut,
        toleranceRetardHeures:
          valeurs.toleranceRetardHeures ?? BORNES_ATELIER.toleranceRetardHeures.defaut,
        statut: StatutAtelier.BROUILLON,
      }),
    );

    await this.auditService.record({
      action: 'ATELIER_CREE',
      acteur: acteurId,
      cible: atelier.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId: module.formationId,
        moduleId,
        titre: atelier.titre,
        dateLimite: atelier.dateLimite,
        typesLivrables: atelier.typesLivrables,
      },
    });

    return this.detail(atelier.id);
  }

  /** Les ateliers d'un module (tous statuts), du plus ancien au plus récent. */
  async listerDuModule(moduleId: string): Promise<AtelierResumeVue[]> {
    const ateliers = await this.atelierRepository.find({
      where: { moduleId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return ateliers.map((a) => this.versResume(a));
  }

  /** La fiche complète d'un atelier. */
  async detail(atelierId: string): Promise<AtelierDetailVue> {
    const atelier = await this.atelierRepository.findOne({
      where: { id: atelierId },
      relations: { module: true },
    });
    if (!atelier) {
      throw new NotFoundException('Atelier introuvable.');
    }
    return this.versDetail(atelier);
  }

  /**
   * Modifie un atelier en BROUILLON. Ordre des contrôles : 404 / 409
   * formation archivée, 409 statut, 400 corps vide ou champ invalide, 400
   * nouvelle date limite déjà passée. Un PATCH sans changement réel n'écrit
   * rien et ne trace rien.
   */
  async modifier(
    acteurId: string,
    atelierId: string,
    dto: UpdateAtelierDto,
    contexte: Contexte,
  ): Promise<AtelierDetailVue> {
    const resultat = await this.dataSource.transaction(async (manager) => {
      const atelier = await this.verrouiller(manager, atelierId);
      verifierModifiable(atelier.statut, 'modifier');

      const fournis = CHAMPS.filter((c) => (dto as Record<string, unknown>)[c] !== undefined);
      if (fournis.length === 0) {
        throw new BadRequestException('Aucune modification fournie.');
      }
      const valeurs = this.nettoyer(dto, false);
      if (valeurs.dateLimite !== undefined) {
        verifierDateLimite(valeurs.dateLimite, await this.maintenant(manager));
      }

      const avant: Record<string, unknown> = {};
      const apres: Record<string, unknown> = {};
      for (const champ of fournis) {
        const nouvelle = valeurs[champ];
        const actuelle = atelier[champ];
        if (!memeValeur(actuelle, nouvelle)) {
          avant[champ] = actuelle;
          apres[champ] = nouvelle;
        }
      }
      if (Object.keys(apres).length > 0) {
        await manager.update(Atelier, { id: atelierId }, apres);
      }
      return { avant, apres };
    });

    if (Object.keys(resultat.apres).length > 0) {
      await this.auditService.record({
        action: 'ATELIER_MODIFIE',
        acteur: acteurId,
        cible: atelierId,
        adresseIp: contexte.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: resultat,
      });
    }
    return this.detail(atelierId);
  }

  /** Supprime un atelier en BROUILLON (409 sinon). */
  async supprimer(acteurId: string, atelierId: string, contexte: Contexte): Promise<void> {
    const supprime = await this.dataSource.transaction(async (manager) => {
      const atelier = await this.verrouiller(manager, atelierId);
      verifierModifiable(atelier.statut, 'supprimer');
      await manager.delete(Atelier, { id: atelierId });
      return atelier;
    });

    await this.auditService.record({
      action: 'ATELIER_SUPPRIME',
      acteur: acteurId,
      cible: atelierId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId: supprime.module.formationId,
        moduleId: supprime.moduleId,
        titre: supprime.titre,
      },
    });
  }

  // ===================================================================
  //  Outils
  // ===================================================================

  /**
   * Charge l'atelier en le verrouillant (FOR UPDATE), puis vérifie sa
   * formation : 404 s'il n'existe pas, 409 si la formation est archivée.
   * Le module est lu à part : PostgreSQL refuse FOR UPDATE sur le côté
   * nullable d'une jointure externe.
   */
  private async verrouiller(manager: EntityManager, atelierId: string): Promise<Atelier> {
    const atelier = await manager.findOne(Atelier, {
      where: { id: atelierId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!atelier) {
      throw new NotFoundException('Atelier introuvable.');
    }
    atelier.module = (await manager.findOneOrFail(ModuleFormation, {
      where: { id: atelier.moduleId },
      select: { id: true, formationId: true, titre: true },
    })) as ModuleFormation;
    await this.formationsService.chargerPourEcriture(atelier.module.formationId);
    return atelier;
  }

  /** L'heure de PostgreSQL : une seule horloge pour toutes les règles. */
  private async maintenant(manager: EntityManager): Promise<Date> {
    const [{ maintenant }] = (await manager.query('SELECT now() AS maintenant')) as Array<{
      maintenant: Date;
    }>;
    return new Date(maintenant);
  }

  /**
   * Nettoie la saisie : textes rognés (titre ≥ 3 et énoncé ≥ 10 caractères
   * APRÈS rognage), compétences vides -> null, date convertie, types
   * normalisés. À la création, titre, énoncé, date et types sont exigés ; au
   * PATCH, seul `competencesVisees` peut valoir null.
   */
  private nettoyer(dto: CreateAtelierDto | UpdateAtelierDto, creation: boolean): Valeurs {
    const saisie = dto as Record<Champ, unknown>;
    const valeurs: Valeurs = {};

    for (const champ of CHAMPS) {
      if (champ === 'competencesVisees') continue;
      if (saisie[champ] === null) {
        throw new BadRequestException(
          `Le champ ${champ} est obligatoire et ne peut pas être vidé.`,
        );
      }
    }

    if (dto.titre !== undefined) {
      valeurs.titre = dto.titre.trim();
      if (valeurs.titre.length < BORNES_ATELIER.titre.min) {
        throw new BadRequestException('Le titre doit contenir au moins 3 caractères.');
      }
    }
    if (dto.enonce !== undefined) {
      valeurs.enonce = dto.enonce.trim();
      if (valeurs.enonce.length < BORNES_ATELIER.enonce.min) {
        throw new BadRequestException('L’énoncé doit contenir au moins 10 caractères.');
      }
    }
    if (dto.competencesVisees !== undefined) {
      const texte = dto.competencesVisees?.trim() ?? '';
      valeurs.competencesVisees = texte.length > 0 ? texte : null;
    }
    if (dto.dateLimite !== undefined) {
      valeurs.dateLimite = new Date(dto.dateLimite);
    }
    if (dto.typesLivrables !== undefined) {
      valeurs.typesLivrables = normaliserTypesLivrables(dto.typesLivrables);
    }
    if (dto.tailleMaxMo !== undefined) valeurs.tailleMaxMo = dto.tailleMaxMo;
    if (dto.nbMaxFichiers !== undefined) valeurs.nbMaxFichiers = dto.nbMaxFichiers;
    if (dto.toleranceRetardHeures !== undefined) {
      valeurs.toleranceRetardHeures = dto.toleranceRetardHeures;
    }

    if (creation) {
      if (valeurs.titre === undefined || valeurs.enonce === undefined) {
        throw new BadRequestException('Le titre et l’énoncé sont obligatoires.');
      }
      if (valeurs.dateLimite === undefined || valeurs.typesLivrables === undefined) {
        throw new BadRequestException(
          'La date limite et les types de livrables sont obligatoires.',
        );
      }
    }
    return valeurs;
  }

  private versResume(atelier: Atelier): AtelierResumeVue {
    return {
      id: atelier.id,
      moduleId: atelier.moduleId,
      titre: atelier.titre,
      dateLimite: atelier.dateLimite,
      typesLivrables: atelier.typesLivrables,
      statut: atelier.statut,
      createdAt: atelier.createdAt,
      updatedAt: atelier.updatedAt,
    };
  }

  private versDetail(atelier: Atelier): AtelierDetailVue {
    return {
      ...this.versResume(atelier),
      formationId: atelier.module.formationId,
      moduleTitre: atelier.module.titre,
      enonce: atelier.enonce,
      competencesVisees: atelier.competencesVisees,
      tailleMaxMo: atelier.tailleMaxMo,
      nbMaxFichiers: atelier.nbMaxFichiers,
      toleranceRetardHeures: atelier.toleranceRetardHeures,
    };
  }
}

/** Égalité de valeurs pour le PATCH : dates à la milliseconde, listes élément par élément. */
function memeValeur(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() === new Date(b as Date).getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}
