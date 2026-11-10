import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { AuditService } from '../audit/audit.service';
import { CreateFormationDto } from './dto/create-formation.dto';
import { ListFormationsDto } from './dto/list-formations.dto';
import { UpdateFormationDto } from './dto/update-formation.dto';

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
  /** US-CERT-07 — validité des certificats (mois) ; null = sans expiration. */
  dureeValiditeMois: number | null;
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

/**
 * Ce que le catalogue ajoute à chaque formation (US-INSC-01, DS-08 étape 1) :
 *  - `placesRestantes` : capacité moins les inscriptions non suspendues ;
 *  - `statutInscription` : l'inscription de l'APPRENANT connecté à cette
 *    formation (null s'il n'y en a pas, et toujours null pour un autre rôle).
 */
export interface PlacesEtInscription {
  placesRestantes: number;
  statutInscription: StatutInscription | null;
}

/** Formation telle que la renvoie le catalogue (liste). */
export type FormationCatalogueVue = FormationVue & PlacesEtInscription;

/** Détail d'une formation tel que le renvoie le catalogue. */
export type FormationCatalogueDetailVue = FormationDetailVue & PlacesEtInscription;

/** Réponse paginée de GET /formations (même forme que les autres listes). */
export interface FormationPage {
  items: FormationCatalogueVue[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Ce que le service a besoin de savoir sur l'appelant : son rôle pour filtrer,
 * son identifiant pour indiquer ses propres inscriptions (US-INSC-01).
 */
export interface Lecteur {
  id: string;
  role: Role;
}

/** Champs d'une formation modifiables par PATCH (jamais `statut`). */
const CHAMPS_MODIFIABLES = [
  'titre',
  'description',
  'objectifs',
  'prerequis',
  'dateDebut',
  'dateFin',
  'dureeHeures',
  'capaciteMax',
  'noteMinCertification',
  'modeleCertificat',
  'dureeValiditeMois',
] as const;

/** Champs qui ne peuvent pas être vidés (NOT NULL en base). */
const CHAMPS_OBLIGATOIRES: ReadonlySet<string> = new Set([
  'titre',
  'capaciteMax',
  'noteMinCertification',
]);

/** Vue d'un module, partagée avec le service des modules. */
export function versModuleVue(module: ModuleFormation): ModuleVue {
  return {
    id: module.id,
    titre: module.titre,
    ordre: module.ordre,
    description: module.description,
  };
}

/** Vue d'une formation, partagée avec l'espace formateur (US-AUTH-16). */
export function versFormationVue(formation: Formation): FormationVue {
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
    dureeValiditeMois: formation.dureeValiditeMois,
    createdAt: formation.createdAt,
    updatedAt: formation.updatedAt,
  };
}

@Injectable()
export class FormationsService {
  constructor(
    @InjectRepository(Formation)
    private readonly formationRepository: Repository<Formation>,
    @InjectRepository(Inscription)
    private readonly inscriptionRepository: Repository<Inscription>,
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
      dureeValiditeMois: dto.dureeValiditeMois ?? null,
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

    const complements = await this.placesEtInscriptions(lecteur, formations);
    const items = formations.map((f) => ({
      ...this.toVue(f),
      ...(complements.get(f.id) as PlacesEtInscription),
    }));
    return { items, total, page, limit };
  }

  /**
   * US-FORM-01 — Détail d'une formation avec ses modules (triés par ordre).
   *
   * Une formation non OUVERTE est rendue en 404 à un non-administrateur, avec
   * le MÊME message qu'un identifiant inconnu : je ne révèle pas l'existence
   * d'une formation fermée ou archivée.
   */
  async consulter(lecteur: Lecteur, formationId: string): Promise<FormationCatalogueDetailVue> {
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

    const complements = await this.placesEtInscriptions(lecteur, [formation]);
    return {
      ...this.toVue(formation),
      ...(complements.get(formation.id) as PlacesEtInscription),
      modules: (formation.modules ?? []).map((m) => versModuleVue(m)),
    };
  }

  /**
   * US-FORM-01 (configurer) — Un administrateur modifie une formation.
   *
   *   1. formation chargée pour écriture -> 404 si inconnue, 409 si archivée ;
   *   2. je ne retiens que les champs réellement fournis ET différents de
   *      l'existant (un PATCH qui ne change rien ne produit ni écriture ni
   *      audit) ; `null` vide un champ facultatif, mais est refusé (400) sur
   *      un champ obligatoire ;
   *   3. cohérence des dates sur les valeurs FINALES (existant + modification) ;
   *   4. la capacité ne peut pas descendre sous le nombre d'inscrits actuels
   *      -> 409 : je ne mets jamais une formation en sur-effectif ;
   *   5. enregistrement, puis audit FORMATION_MODIFIEE avec l'avant / l'après.
   */
  async modifier(
    adminId: string,
    formationId: string,
    dto: UpdateFormationDto,
    context: { adresseIp: string | null },
  ): Promise<FormationVue> {
    const formation = await this.chargerPourEcriture(formationId);

    const saisie = dto as Record<string, unknown>;
    const existant = formation as unknown as Record<string, unknown>;
    const avant: Record<string, unknown> = {};
    const apres: Record<string, unknown> = {};
    let champsFournis = 0;

    for (const champ of CHAMPS_MODIFIABLES) {
      const valeur = saisie[champ];
      if (valeur === undefined) {
        continue;
      }
      champsFournis += 1;
      if (valeur === null && CHAMPS_OBLIGATOIRES.has(champ)) {
        throw new BadRequestException(`Le champ ${champ} est obligatoire et ne peut pas être vidé.`);
      }
      if (valeur !== existant[champ]) {
        avant[champ] = existant[champ];
        apres[champ] = valeur;
      }
    }

    if (champsFournis === 0) {
      throw new BadRequestException('Aucune modification fournie.');
    }
    if (Object.keys(apres).length === 0) {
      // Tout est déjà à la valeur demandée : rien à écrire, rien à tracer.
      return this.toVue(formation);
    }

    const dateDebut = ('dateDebut' in apres ? apres.dateDebut : formation.dateDebut) as string | null;
    const dateFin = ('dateFin' in apres ? apres.dateFin : formation.dateFin) as string | null;
    if (dateDebut && dateFin && dateFin < dateDebut) {
      throw new BadRequestException(
        'La date de fin doit être postérieure ou égale à la date de début.',
      );
    }

    if (typeof apres.capaciteMax === 'number' && apres.capaciteMax < formation.capaciteMax) {
      const inscrits = await this.inscriptionRepository.count({
        where: { formationId, statut: Not(StatutInscription.SUSPENDUE) },
      });
      if (inscrits > apres.capaciteMax) {
        throw new ConflictException(
          `La capacité ne peut pas être inférieure au nombre d'inscrits (${inscrits}).`,
        );
      }
    }

    Object.assign(formation, apres);
    const enregistree = await this.formationRepository.save(formation);

    await this.auditService.record({
      action: 'FORMATION_MODIFIEE',
      acteur: adminId,
      cible: enregistree.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { avant, apres },
    });

    return this.toVue(enregistree);
  }

  /**
   * Charge une formation en vue d'une ÉCRITURE (elle-même ou ses modules).
   * 404 si elle n'existe pas ; 409 si elle est archivée — l'archivage fige le
   * parcours, plus rien ne doit y bouger. Partagé avec le service des modules.
   */
  async chargerPourEcriture(formationId: string): Promise<Formation> {
    const formation = await this.formationRepository.findOne({
      where: { id: formationId },
    });
    if (!formation) {
      throw new NotFoundException('Formation introuvable.');
    }
    if (formation.statut === StatutFormation.ARCHIVEE) {
      throw new ConflictException('Une formation archivée ne peut plus être modifiée.');
    }
    return formation;
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /**
   * Places restantes et inscription de l'apprenant connecté, pour un lot de
   * formations (US-INSC-01). Deux requêtes au plus, quel que soit le nombre
   * de formations de la page :
   *  1. le nombre d'inscriptions NON SUSPENDUES par formation (GROUP BY) —
   *     même règle que le contrôle de capacité à l'inscription ;
   *  2. pour un apprenant seulement, ses propres inscriptions à ces formations.
   *
   * Une formation déjà suivie reste visible au catalogue, avec son statut
   * d'inscription (DS-08 la masquait : je préfère l'afficher marquée).
   */
  private async placesEtInscriptions(
    lecteur: Lecteur,
    formations: Formation[],
  ): Promise<Map<string, PlacesEtInscription>> {
    const complements = new Map<string, PlacesEtInscription>();
    if (formations.length === 0) {
      return complements;
    }
    const ids = formations.map((f) => f.id);

    const comptes = await this.inscriptionRepository
      .createQueryBuilder('inscription')
      .select('inscription.formationId', 'formationId')
      .addSelect('COUNT(*)', 'inscrits')
      .where('inscription.formationId IN (:...ids)', { ids })
      .andWhere('inscription.statut != :suspendue', {
        suspendue: StatutInscription.SUSPENDUE,
      })
      .groupBy('inscription.formationId')
      .getRawMany<{ formationId: string; inscrits: string }>();
    // PostgreSQL renvoie COUNT(*) en bigint, donc en chaîne : je convertis.
    const inscritsParFormation = new Map(comptes.map((c) => [c.formationId, Number(c.inscrits)]));

    const statuts = new Map<string, StatutInscription>();
    if (lecteur.role === Role.APPRENANT) {
      const miennes = await this.inscriptionRepository.find({
        where: { apprenantId: lecteur.id, formationId: In(ids) },
        select: { id: true, formationId: true, statut: true },
      });
      for (const inscription of miennes) {
        statuts.set(inscription.formationId, inscription.statut);
      }
    }

    for (const formation of formations) {
      const inscrits = inscritsParFormation.get(formation.id) ?? 0;
      complements.set(formation.id, {
        placesRestantes: Math.max(0, formation.capaciteMax - inscrits),
        statutInscription: statuts.get(formation.id) ?? null,
      });
    }
    return complements;
  }

  /** Seul l'administrateur voit les formations de tous les statuts. */
  private voitTout(lecteur: Lecteur): boolean {
    return lecteur.role === Role.ADMINISTRATEUR;
  }

  private toVue(formation: Formation): FormationVue {
    return versFormationVue(formation);
  }
}
