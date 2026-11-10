import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export const MESSAGE_PERIODE_INVALIDE =
  'La période est invalide : la date de début doit précéder la date de fin.';

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
  /** US-AUDIT-01 : recherche de l'acteur par email (contient, sans casse). */
  acteur?: string;
  /** US-AUDIT-01 : cible exacte (identifiant de la ressource). */
  cible?: string;
  /** US-AUDIT-01 : « Succès » ou « Échec ». */
  resultat?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Acteur d'une entrée, en liste blanche (US-AUDIT-01). */
export interface AuditActeurVue {
  id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
  role: string;
}

/** Une entrée du journal telle que l'expose la consultation (US-AUDIT-01). */
export interface AuditEntreeVue {
  id: string;
  userId: string | null;
  acteur: AuditActeurVue | null;
  action: string;
  cible: string | null;
  adresseIp: string | null;
  resultat: string | null;
  detailsAvantApres: Record<string, unknown> | null;
  horodatage: Date;
}

/** Réponse paginée de la consultation (DS-16). */
export interface AuditPage {
  items: AuditEntreeVue[];
  total: number;
  page: number;
  limit: number;
}

interface LigneAudit {
  id: string;
  user_id: string | null;
  action: string;
  cible: string | null;
  adresse_ip: string | null;
  resultat: string | null;
  details_avant_apres: Record<string, unknown> | null;
  horodatage: Date;
  acteur_email: string | null;
  acteur_prenom: string | null;
  acteur_nom: string | null;
  acteur_role: string | null;
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
   * US-AUTH-12 / US-AUDIT-01 / DS-16 — Consultation paginée, filtrée, triée
   * horodatage DESC (puis id, pour un ordre stable entre deux pages).
   *
   * Filtres tous optionnels : action (exact), acteur (userId exact, ou email
   * « contient » sans casse), cible (exacte), résultat, période [from, to]
   * (from > to : 400). L'acteur est joint en liste blanche (email, prénom,
   * nom, rôle). Lecture seule — aucune mutation possible ici (ni ailleurs :
   * pas de route UPDATE/DELETE, trigger d'immuabilité en base).
   */
  async list(query: AuditQueryInput): Promise<AuditPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const base = this.requeteFiltree(query);
    const total = await base.clone().getCount();
    const lignes = await base
      .clone()
      .orderBy('a.horodatage', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<LigneAudit>();
    return { items: lignes.map(versVue), total, page, limit };
  }

  /**
   * US-AUTH-12 (extension) — Export : TOUTES les lignes correspondant aux MÊMES
   * filtres que list() (page/limit ignorés — on exporte le résultat complet de
   * la recherche, pas une seule page). Tri horodatage DESC. Garde-fou
   * MAX_EXPORT pour ne pas charger un volume déraisonnable en mémoire.
   */
  async export(query: AuditQueryInput): Promise<AuditEntreeVue[]> {
    const lignes = await this.requeteFiltree(query)
      .orderBy('a.horodatage', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .limit(AuditService.MAX_EXPORT)
      .getRawMany<LigneAudit>();
    return lignes.map(versVue);
  }

  /** US-AUDIT-01 — Types d'action présents dans le journal (liste des filtres). */
  async actions(): Promise<string[]> {
    const lignes = (await this.auditLogRepository.query(
      'SELECT DISTINCT action FROM audit_logs ORDER BY action',
    )) as Array<{ action: string }>;
    return lignes.map((l) => l.action);
  }

  /** Requête commune à list() et export(), acteur joint en liste blanche. */
  private requeteFiltree(query: AuditQueryInput): SelectQueryBuilder<AuditLog> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(MESSAGE_PERIODE_INVALIDE);
    }
    const qb = this.auditLogRepository
      .createQueryBuilder('a')
      .leftJoin('users', 'u', 'u.id = a.user_id')
      .select([
        'a.id AS id',
        'a.user_id AS user_id',
        'a.action AS action',
        'a.cible AS cible',
        'a.adresse_ip AS adresse_ip',
        'a.resultat AS resultat',
        'a.details_avant_apres AS details_avant_apres',
        'a.horodatage AS horodatage',
        'u.email AS acteur_email',
        'u.prenom AS acteur_prenom',
        'u.nom AS acteur_nom',
        'u.role AS acteur_role',
      ]);
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.userId) qb.andWhere('a.user_id = :userId', { userId: query.userId });
    if (query.acteur) {
      qb.andWhere("u.email ILIKE :acteur ESCAPE '\\'", {
        acteur: `%${echapperLike(query.acteur.trim())}%`,
      });
    }
    if (query.cible) qb.andWhere('a.cible = :cible', { cible: query.cible.trim() });
    if (query.resultat) qb.andWhere('a.resultat = :resultat', { resultat: query.resultat });
    if (from) qb.andWhere('a.horodatage >= :from', { from });
    if (to) qb.andWhere('a.horodatage <= :to', { to });
    return qb;
  }
}

/** Neutralise les jokers de LIKE dans une saisie (%, _ et l'échappement). */
export function echapperLike(saisie: string): string {
  return saisie.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function versVue(l: LigneAudit): AuditEntreeVue {
  return {
    id: l.id,
    userId: l.user_id,
    acteur:
      l.user_id && l.acteur_email
        ? {
            id: l.user_id,
            email: l.acteur_email,
            prenom: l.acteur_prenom,
            nom: l.acteur_nom,
            role: String(l.acteur_role),
          }
        : null,
    action: l.action,
    cible: l.cible,
    adresseIp: l.adresse_ip,
    resultat: l.resultat,
    detailsAvantApres: l.details_avant_apres,
    horodatage: l.horodatage,
  };
}
