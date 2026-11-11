import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FUSEAU_INSTITUTION, Periode } from './periode.regles';
import { STATUTS_FORMATION, TableauDeBordService } from './tableau-de-bord.service';
import {
  FormationTableauDeBord,
  LigneFormationFormateur,
  TotauxFormateur,
  totaliser,
  versFormation,
} from './tableau-de-bord-formateur.regles';

/** Un jour de l'activité de ses formations. */
export interface JourActiviteFormateur {
  jour: string;
  tentatives: number;
  livrables: number;
}

/** US-DASH-03 — Tableau de bord global du formateur. */
export interface TableauDeBordFormateur extends TotauxFormateur {
  periode: Periode;
  activite: JourActiviteFormateur[];
  mesFormations: FormationTableauDeBord[];
}

/** Bornes SQL : $1 = premier jour inclus, $2 = dernier jour inclus (Tunis). */
const DEBUT = `(($1::date)::timestamp AT TIME ZONE '${FUSEAU_INSTITUTION}')`;
const FIN = `((($2::date) + 1)::timestamp AT TIME ZONE '${FUSEAU_INSTITUTION}')`;
const dans = (colonne: string): string => `${colonne} >= ${DEBUT} AND ${colonne} < ${FIN}`;

/** Les formations du formateur ($3) : SEULE source du périmètre. */
const MES_FORMATIONS = `SELECT formation_id AS id FROM formation_formateurs WHERE formateur_id = $3`;

/**
 * US-DASH-03 — Indicateurs agrégés sur TOUTES les formations d'un formateur
 * (affectations `formation_formateurs`), lecture seule, non tracée (comme
 * US-DASH-01). Deux requêtes SQL quel que soit le nombre de formations (pas
 * de N+1) : une ligne agrégée par formation, puis l'activité quotidienne.
 *
 * Instantanés : inscrits, actifs (inscription EN_COURS), tentatives à évaluer
 * (SOUMISE ou ABANDONNEE_TIMER, pas encore notées), livrables à évaluer
 * (SOUMIS ou EN_CORRECTION), alertes de décrochage OUVERTES. Sur la période :
 * nouveaux inscrits, tentatives notées (réussite, score moyen), certificats
 * délivrés (générés : actifs, expirés ou révoqués depuis). QCM brouillons
 * exclus (comme le suivi, US-SUIVI-01).
 */
@Injectable()
export class TableauDeBordFormateurService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tableauDeBord: TableauDeBordService,
  ) {}

  async pour(formateurId: string, du?: string, au?: string): Promise<TableauDeBordFormateur> {
    const periode = this.tableauDeBord.periode(du, au);
    const p = [periode.du, periode.au, formateurId];
    const [lignes, activite] = await Promise.all([
      this.q<LigneFormationFormateur>(
        `WITH mes AS (${MES_FORMATIONS}),
         ins AS (
           SELECT formation_id,
                  count(*)::int AS inscrits,
                  count(*) FILTER (WHERE statut = 'EN_COURS')::int AS actifs,
                  count(*) FILTER (WHERE ${dans('date_inscription')})::int AS nouveaux
             FROM inscriptions WHERE formation_id IN (SELECT id FROM mes)
            GROUP BY formation_id),
         tq AS (
           SELECT m.formation_id,
                  count(*) FILTER (WHERE t.statut = 'NOTEE' AND ${dans('t.date_fin')})::int AS notees,
                  count(*) FILTER (WHERE t.statut = 'NOTEE' AND t.est_reussie AND ${dans('t.date_fin')})::int AS reussies,
                  sum(t.score) FILTER (WHERE t.statut = 'NOTEE' AND ${dans('t.date_fin')}) AS somme,
                  count(*) FILTER (WHERE t.statut IN ('SOUMISE', 'ABANDONNEE_TIMER'))::int AS a_evaluer
             FROM tentatives_qcm t
             JOIN qcm q ON q.id = t.qcm_id AND q.statut <> 'BROUILLON'
             JOIN modules m ON m.id = q.module_id
            WHERE m.formation_id IN (SELECT id FROM mes)
            GROUP BY m.formation_id),
         lv AS (
           SELECT m.formation_id,
                  count(*) FILTER (WHERE l.statut IN ('SOUMIS', 'EN_CORRECTION'))::int AS a_evaluer
             FROM livrables l
             JOIN ateliers a ON a.id = l.atelier_id
             JOIN modules m ON m.id = a.module_id
            WHERE m.formation_id IN (SELECT id FROM mes)
            GROUP BY m.formation_id),
         al AS (
           SELECT formation_id, count(*)::int AS n FROM alertes_decrochage
            WHERE statut = 'OUVERTE' AND formation_id IN (SELECT id FROM mes)
            GROUP BY formation_id),
         ce AS (
           SELECT formation_id, count(*)::int AS n FROM certificats
            WHERE statut IN ('ACTIF', 'EXPIRE', 'REVOQUE') AND ${dans('date_generation')}
              AND formation_id IN (SELECT id FROM mes)
            GROUP BY formation_id)
         SELECT f.id, f.titre, f.statut::text AS statut,
                coalesce(ins.inscrits, 0) AS inscrits, coalesce(ins.actifs, 0) AS actifs,
                coalesce(ins.nouveaux, 0) AS nouveaux,
                coalesce(tq.notees, 0) AS tentatives_notees,
                coalesce(tq.reussies, 0) AS tentatives_reussies,
                tq.somme AS somme_scores,
                coalesce(tq.a_evaluer, 0) AS tentatives_a_evaluer,
                coalesce(lv.a_evaluer, 0) AS livrables_a_evaluer,
                coalesce(al.n, 0) AS alertes_ouvertes,
                coalesce(ce.n, 0) AS certificats_delivres
           FROM formations f
           JOIN mes ON mes.id = f.id
           LEFT JOIN ins ON ins.formation_id = f.id
           LEFT JOIN tq ON tq.formation_id = f.id
           LEFT JOIN lv ON lv.formation_id = f.id
           LEFT JOIN al ON al.formation_id = f.id
           LEFT JOIN ce ON ce.formation_id = f.id
          ORDER BY array_position($4::text[], f.statut::text), f.titre, f.id`,
        [...p, STATUTS_FORMATION],
      ),
      this.q<JourActiviteFormateur>(
        `WITH mes AS (${MES_FORMATIONS}),
         t AS (
           SELECT (t.date_fin AT TIME ZONE '${FUSEAU_INSTITUTION}')::date AS j, count(*)::int AS n
             FROM tentatives_qcm t
             JOIN qcm q ON q.id = t.qcm_id AND q.statut <> 'BROUILLON'
             JOIN modules m ON m.id = q.module_id
            WHERE m.formation_id IN (SELECT id FROM mes)
              AND t.statut = 'NOTEE' AND ${dans('t.date_fin')}
            GROUP BY 1),
         l AS (
           SELECT (l.date_soumission AT TIME ZONE '${FUSEAU_INSTITUTION}')::date AS j, count(*)::int AS n
             FROM livrables l
             JOIN ateliers a ON a.id = l.atelier_id
             JOIN modules m ON m.id = a.module_id
            WHERE m.formation_id IN (SELECT id FROM mes) AND ${dans('l.date_soumission')}
            GROUP BY 1)
         SELECT to_char(g, 'YYYY-MM-DD') AS jour,
                coalesce(t.n, 0)::int AS tentatives, coalesce(l.n, 0)::int AS livrables
           FROM generate_series($1::date, $2::date, interval '1 day') AS g
           LEFT JOIN t ON t.j = g::date
           LEFT JOIN l ON l.j = g::date
          ORDER BY g`,
        p,
      ),
    ]);
    return {
      periode,
      ...totaliser(lignes, STATUTS_FORMATION),
      activite,
      mesFormations: lignes.map(versFormation),
    };
  }

  private q<T>(sql: string, parametres: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, parametres) as Promise<T[]>;
  }
}
