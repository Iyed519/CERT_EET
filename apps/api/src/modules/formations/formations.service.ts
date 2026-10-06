import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { AuditService } from '../audit/audit.service';
import { CreateFormationDto } from './dto/create-formation.dto';
import { ListFormationsDto } from './dto/list-formations.dto';

/** Vue d'une formation renvoyée par l'API (liste et création). */
export interface FormationVue {
  id: string;
  titre: string;
  description: string | null;
  objectifs: string | null;
  prerequis: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  dureeHeures: number | null;
  capaciteMax: number;
  statut: StatutFormation;
  noteMinCertification: number;
  modeleCertificat: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Vue d'un module dans le détail d'une formation. */
export interface ModuleVue {
  id: string;
  titre: string;
  ordre: number;
  description: string | null;
}

/** Détail d'une formation : la formation + ses modules, triés par ordre. */
export interface FormationDetailVue extends FormationVue {
  modules: ModuleVue[];
}

/** Réponse paginée de GET /formations (même forme que les autres listes). */
export interface FormationPage {
  items: FormationVue[];
  total: number;
  page: number;
  limit: number;
}

/** Ce que le service a besoin de savoir sur l'appelant pour filtrer. */
export interface Lecteur {
  role: Role;
}

@Injectable()
export class FormationsService {
  constructor(
    @InjectRepository(Formation)
    private readonly formationRepository: Repository<Formation>,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * US-FORM-01 — Un administrateur crée une formation.
   *
   * Ordre volontaire (aucune écriture avant validation complète) :
   *   1. cohérence des dates (la seule règle qui croise deux champs ; les
   *      règles champ par champ sont déjà passées dans le DTO) -> 400 ;
   *   2. création au statut OUVERTE, FORCÉ ici : il ne vient jamais du client ;
   *   3. audit FORMATION_CREEE (qui a créé quoi).
   *
   * Une formation OUVERTE est immédiatement visible au catalogue (lister).
   */
  async creer(
    adminId: string,
    dto: CreateFormationDto,
    context: { adresseIp: string | null },
  ): Promise<FormationVue> {
    // Deux dates AAAA-MM-JJ se comparent correctement comme des chaînes.
    if (dto.dateDebut && dto.dateFin && dto.dateFin < dto.dateDebut) {
      throw new BadRequestException(
        'La date de fin doit être postérieure ou égale à la date de début.',
      );
    }

    const formation = this.formationRepository.create({
      titre: dto.titre,
      description: dto.description ?? null,
      objectifs: dto.objectifs ?? null,
      prerequis: dto.prerequis ?? null,
      dateDebut: dto.dateDebut ?? null,
      dateFin: dto.dateFin ?? null,
      dureeHeures: dto.dureeHeures ?? null,
      capaciteMax: dto.capaciteMax,
      noteMinCertification: dto.noteMinCertification,
      modeleCertificat: dto.modeleCertificat ?? null,
      statut: StatutFormation.OUVERTE,
    });
    const enregistree = await this.formationRepository.save(formation);

    await this.auditService.record({
      action: 'FORMATION_CREEE',
      acteur: adminId,
      cible: enregistree.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        titre: enregistree.titre,
        capaciteMax: enregistree.capaciteMax,
        noteMinCertification: enregistree.noteMinCertification,
        statut: enregistree.statut,
      },
    });

    return this.toVue(enregistree);
  }

  /**
   * US-FORM-01 — Liste paginée, la plus récente d'abord.
   *
   * Règle de visibilité :
   *  - ADMINISTRATEUR : toutes les formations, filtre `statut` libre ;
   *  - autres rôles : le CATALOGUE, c'est-à-dire les formations OUVERTE. Un
   *    filtre sur un autre statut est refusé en 403 plutôt qu'ignoré : je
   *    préfère un refus explicite à une réponse qui ne correspond pas à la
   *    question posée.
   */
  async lister(lecteur: Lecteur, query: ListFormationsDto): Promise<FormationPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<Formation> = {};
    if (this.voitTout(lecteur)) {
      if (query.statut) {
        where.statut = query.statut;
      }
    } else {
      if (query.statut && query.statut !== StatutFormation.OUVERTE) {
        throw new ForbiddenException(
          'Seul un administrateur peut consulter les formations fermées ou archivées.',
        );
      }
      where.statut = StatutFormation.OUVERTE;
    }

    const [formations, total] = await this.formationRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items: formations.map((f) => this.toVue(f)), total, page, limit };
  }

  /**
   * US-FORM-01 — Détail d'une formation avec ses modules (triés par ordre).
   *
   * Une formation non OUVERTE est rendue en 404 à un non-administrateur, avec
   * le MÊME message qu'un identifiant inconnu : je ne révèle pas l'existence
   * d'une formation fermée ou archivée.
   */
  async consulter(lecteur: Lecteur, formationId: string): Promise<FormationDetailVue> {
    const formation = await this.formationRepository.findOne({
      where: { id: formationId },
      relations: { modules: true },
      order: { modules: { ordre: 'ASC' } },
    });

    const visible =
      formation !== null &&
      (this.voitTout(lecteur) || formation.statut === StatutFormation.OUVERTE);
    if (!formation || !visible) {
      throw new NotFoundException('Formation introuvable.');
    }

    return {
      ...this.toVue(formation),
      modules: (formation.modules ?? []).map((m) => this.toModuleVue(m)),
    };
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /** Seul l'administrateur voit les formations de tous les statuts. */
  private voitTout(lecteur: Lecteur): boolean {
    return lecteur.role === Role.ADMINISTRATEUR;
  }

  private toVue(formation: Formation): FormationVue {
    return {
      id: formation.id,
      titre: formation.titre,
      description: formation.description,
      objectifs: formation.objectifs,
      prerequis: formation.prerequis,
      dateDebut: formation.dateDebut,
      dateFin: formation.dateFin,
      dureeHeures: formation.dureeHeures,
      capaciteMax: formation.capaciteMax,
      statut: formation.statut,
      noteMinCertification: formation.noteMinCertification,
      modeleCertificat: formation.modeleCertificat,
      createdAt: formation.createdAt,
      updatedAt: formation.updatedAt,
    };
  }

  private toModuleVue(module: ModuleFormation): ModuleVue {
    return {
      id: module.id,
      titre: module.titre,
      ordre: module.ordre,
      description: module.description,
    };
  }
}
