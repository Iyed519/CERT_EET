import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

/**
 * Entrée d'audit à enregistrer (US-AUTH-12).
 *
 * `acteur` = utilisateur à l'origine de l'action (mappé vers AuditLog.userId).
 * Tous les champs sauf `action` sont optionnels : certaines actions n'ont ni
 * cible ni détail (ex. LOGOUT).
 */
export interface AuditRecordInput {
  action: string;
  acteur?: string | null;
  cible?: string | null;
  adresseIp?: string | null;
  resultat?: string | null; // "Succès" | "Échec"
  detailsAvantApres?: Record<string, unknown> | null;
}

/**
 * Critères de consultation du journal (US-AUTH-12, DS-16). Structurellement
 * satisfait par AuditQueryDto ; le service ne dépend pas de la couche HTTP.
 */
export interface AuditQueryInput {
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Réponse paginée de la consultation (DS-16). */
export interface AuditPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

/**
 * AuditService — point d'écriture UNIQUE + lecture du journal d'audit
 * (US-AUTH-12, NF3).
 *
 * Je centralise ici ce qui était dispersé dans auth/admin : une trace probante
 * exige un writer unique. L'entité AuditLog est append-only par conception
 * (@CreateDateColumn, aucun updated_at) ; l'immuabilité au niveau BDD est
 * garantie par un trigger (migration dédiée). Je n'expose donc QUE l'écriture
 * (INSERT) et la lecture — jamais d'update ni de delete.
 */
@Injectable()
export class AuditService {
  /** Garde-fou : nombre max de lignes exportées en un appel (anti-OOM). */
  private static readonly MAX_EXPORT = 100000;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Écrit une (et une seule) entrée d'audit. Je mappe `acteur` vers userId et
   * je normalise les champs absents à null pour rester cohérent en base.
   */
  async record(input: AuditRecordInput): Promise<void> {
    const entry = this.auditLogRepository.create({
      userId: input.acteur ?? null,
      action: input.action,
      cible: input.cible ?? null,
      adresseIp: input.adresseIp ?? null,
      resultat: input.resultat ?? null,
      detailsAvantApres: input.detailsAvantApres ?? null,
    });
    await this.auditLogRepository.save(entry);
  }

  /**
   * US-AUTH-12 / DS-16 — Consultation paginée, filtrée, triée horodatage DESC.
   *
   * Filtres tous optionnels : action (exact), userId (acteur), et une période
   * [from, to] (bornes ISO). Lecture seule — aucune mutation possible ici (ni
   * ailleurs : pas de route UPDATE/DELETE, trigger d'immuabilité en base).
   */
  async list(query: AuditQueryInput): Promise<AuditPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [items, total] = await this.auditLogRepository.findAndCount({
      where: this.buildWhere(query),
      order: { horodatage: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  /**
   * US-AUTH-12 (extension) — Export : TOUTES les lignes correspondant aux MÊMES
   * filtres que list() (page/limit ignorés — on exporte le résultat complet de
   * la recherche, pas une seule page). Tri horodatage DESC. Garde-fou
   * MAX_EXPORT pour ne pas charger un volume déraisonnable en mémoire.
   */
  async export(query: AuditQueryInput): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: this.buildWhere(query),
      order: { horodatage: 'DESC' },
      take: AuditService.MAX_EXPORT,
    });
  }

  /**
   * Construit le filtre commun à list() et export() : action (exact), userId
   * (acteur), période [from, to] (Between, ou borne unique). Aucun filtre -> {}.
   */
  private buildWhere(query: AuditQueryInput): FindOptionsWhere<AuditLog> {
    const where: FindOptionsWhere<AuditLog> = {};
    if (query.action) {
      where.action = query.action;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    // Période : Between si les deux bornes, sinon borne unique.
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && to) {
      where.horodatage = Between(from, to);
    } else if (from) {
      where.horodatage = MoreThanOrEqual(from);
    } else if (to) {
      where.horodatage = LessThanOrEqual(to);
    }
    return where;
  }
}
