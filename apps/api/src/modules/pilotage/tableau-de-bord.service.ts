import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  FUSEAU_INSTITUTION,
  Periode,
  PeriodeInvalide,
  arrondi2,
  aujourdhuiInstitution,
  resoudrePeriode,
  taux,
} from './periode.regles';

/** Nombre d'événements montrés dans « Activité récente ». */
export const NB_ACTIVITE_RECENTE = 10;

/** Un livrable SOUMIS depuis plus de N jours sans correction est signalé. */
export const JOURS_LIVRABLE_EN_ATTENTE = 7;

/** Actions d'audit comptées comme connexions réussies. */
export const ACTIONS_CONNEXION = ['LOGIN', 'CONNEXION_OAUTH'];

/** Compteurs par valeur d'énumération (toutes les valeurs, zéro compris). */
export type Repartition = Record<string, number>;

export interface AlerteSysteme {
  code:
    | 'CERTIFICATS_BLOQUES'
    | 'SUPPORTS_EN_ECHEC'
    | 'GENERATIONS_EN_ECHEC'
    | 'DEMANDES_ROLE_EN_ATTENTE'
    | 'LIVRABLES_EN_ATTENTE';
  nombre: number;
}

export interface EvenementRecent {
  horodatage: Date;
  action: string;
  resultat: string | null;
  acteur: { email: string; prenom: string | null; nom: string | null } | null;
}

export interface JourActivite {
  jour: string;
  evenements: number;
  connexions: number;
  echecs: number;
}

/** US-DASH-01 — Tableau de bord global (DS-16 P2). */
export interface TableauDeBordGlobal {
  periode: Periode;
  utilisateurs: {
    parRole: Repartition;
    parStatut: Repartition;
    total: number;
    nouveaux: number;
    connectes: number;
  };
  formations: { parStatut: Repartition; total: number; nouvelles: number };
  inscriptions: { parStatut: Repartition; total: number; nouvelles: number };
  evaluations: {
    qcm: {
      tentativesNotees: number;
      reussies: number;
      tauxReussite: number;
      scoreMoyen: number | null;
      enCours: number;
    };
    ateliers: {
      livrablesSoumis: number;
      correctionsFinalisees: number;
      noteMoyenne: number | null;
      enAttenteCorrection: number;
      enCorrection: number;
    };
  };
  certificats: {
    parStatut: Repartition;
    emis: number;
    revoques: number;
    consultations: number;
  };
  activite: JourActivite[];
  activiteRecente: EvenementRecent[];
  alertes: AlerteSysteme[];
}

const ROLES = ['APPRENANT', 'FORMATEUR', 'ADMINISTRATEUR'];
const STATUTS_COMPTE = ['EN_ATTENTE_ACTIVATION', 'ACTIF', 'DESACTIVE', 'ANONYMISE'];
const STATUTS_FORMATION = ['OUVERTE', 'FERMEE', 'ARCHIVEE'];
const STATUTS_INSCRIPTION = ['EN_COURS', 'TERMINEE', 'SUSPENDUE'];
const STATUTS_CERTIFICAT = ['EN_ATTENTE_GENERATION', 'EN_GENERATION', 'ACTIF', 'REVOQUE', 'EXPIRE'];

/** Bornes SQL : $1 = premier jour inclus, $2 = dernier jour inclus. */
const DEBUT = `(($1::date)::timestamp AT TIME ZONE '${FUSEAU_INSTITUTION}')`;
const FIN = `((($2::date) + 1)::timestamp AT TIME ZONE '${FUSEAU_INSTITUTION}')`;
const dans = (colonne: string): string => `${colonne} >= ${DEBUT} AND ${colonne} < ${FIN}`;

/** Toutes les valeurs à zéro, puis les comptes lus en base. */
export function repartition(
  valeurs: string[],
  lignes: Array<{ cle: string; n: number }>,
): Repartition {
  const r: Repartition = Object.fromEntries(valeurs.map((v) => [v, 0]));
  for (const l of lignes) r[l.cle] = (r[l.cle] ?? 0) + Number(l.n);
  return r;
}

const somme = (r: Repartition): number => Object.values(r).reduce((a, b) => a + b, 0);

/**
 * US-DASH-01 — Indicateurs agrégés de toute la plateforme (ADMINISTRATEUR).
 *
 * Lecture seule, non tracée (comme la supervision, US-DASH-02 D6). Une requête
 * SQL agrégée par bloc ; les compteurs « sur la période » portent sur des jours
 * calendaires de Tunis, les autres sont un instantané. Une période sans
 * données renvoie des zéros (et des moyennes nulles), jamais une erreur.
 */
@Injectable()
export class TableauDeBordService {
  constructor(private readonly dataSource: DataSource) {}

  /** Résout la période (400 si invalide) avec la date du jour de Tunis. */
  periode(du?: string, au?: string, maintenant: Date = new Date()): Periode {
    try {
      return resoudrePeriode(aujourdhuiInstitution(maintenant), du, au);
    } catch (erreur) {
      if (erreur instanceof PeriodeInvalide) throw new BadRequestException(erreur.message);
      throw erreur;
    }
  }

  async global(du?: string, au?: string): Promise<TableauDeBordGlobal> {
    const periode = this.periode(du, au);
    const p = [periode.du, periode.au];
    const [
      utilisateurs,
      formations,
      inscriptions,
      qcm,
      livrables,
      corrections,
      certificats,
      consultations,
      activite,
      activiteRecente,
      alertes,
    ] = await Promise.all([
      this.q<{ role: string; statut: string; n: number; nouveaux: number; connectes: number }>(
        `SELECT role::text AS role, statut::text AS statut, count(*)::int AS n,
                count(*) FILTER (WHERE ${dans('created_at')})::int AS nouveaux,
                count(*) FILTER (WHERE ${dans('derniere_connexion')})::int AS connectes
           FROM users GROUP BY role, statut`,
        p,
      ),
      this.q<{ cle: string; n: number; nouvelles: number }>(
        `SELECT statut::text AS cle, count(*)::int AS n,
                count(*) FILTER (WHERE ${dans('created_at')})::int AS nouvelles
           FROM formations GROUP BY statut`,
        p,
      ),
      this.q<{ cle: string; n: number; nouvelles: number }>(
        `SELECT statut::text AS cle, count(*)::int AS n,
                count(*) FILTER (WHERE ${dans('date_inscription')})::int AS nouvelles
           FROM inscriptions GROUP BY statut`,
        p,
      ),
      this.q<{ notees: number; reussies: number; moyenne: string | null; en_cours: number }>(
        `SELECT count(*) FILTER (WHERE statut = 'NOTEE' AND ${dans('date_fin')})::int AS notees,
                count(*) FILTER (WHERE statut = 'NOTEE' AND est_reussie AND ${dans('date_fin')})::int AS reussies,
                avg(score) FILTER (WHERE statut = 'NOTEE' AND ${dans('date_fin')}) AS moyenne,
                count(*) FILTER (WHERE statut = 'EN_COURS')::int AS en_cours
           FROM tentatives_qcm`,
        p,
      ),
      this.q<{ soumis: number; en_attente: number; en_correction: number }>(
        `SELECT count(*) FILTER (WHERE ${dans('date_soumission')})::int AS soumis,
                count(*) FILTER (WHERE statut = 'SOUMIS')::int AS en_attente,
                count(*) FILTER (WHERE statut = 'EN_CORRECTION')::int AS en_correction
           FROM livrables`,
        p,
      ),
      this.q<{ finalisees: number; moyenne: string | null }>(
        `SELECT count(*)::int AS finalisees, avg(score_total) AS moyenne
           FROM corrections WHERE date_finalisation IS NOT NULL AND ${dans('date_finalisation')}`,
        p,
      ),
      this.q<{ cle: string; n: number; emis: number; revoques: number }>(
        `SELECT statut::text AS cle, count(*)::int AS n,
                count(*) FILTER (WHERE statut IN ('ACTIF', 'REVOQUE') AND ${dans('date_generation')})::int AS emis,
                count(*) FILTER (WHERE statut = 'REVOQUE' AND ${dans('date_revocation')})::int AS revoques
           FROM certificats GROUP BY statut`,
        p,
      ),
      this.q<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'CERTIFICAT_VERIFIE' AND ${dans('horodatage')}`,
        p,
      ),
      this.q<{ jour: string; evenements: number; connexions: number; echecs: number }>(
        `SELECT to_char(j, 'YYYY-MM-DD') AS jour,
                count(a.id)::int AS evenements,
                count(a.id) FILTER (WHERE a.action = ANY($3::varchar[]) AND a.resultat = 'Succès')::int AS connexions,
                count(a.id) FILTER (WHERE a.resultat = 'Échec')::int AS echecs
           FROM generate_series($1::date, $2::date, interval '1 day') AS j
           LEFT JOIN audit_logs a
             ON a.horodatage >= (j::timestamp AT TIME ZONE '${FUSEAU_INSTITUTION}')
            AND a.horodatage < ((j + interval '1 day')::timestamp AT TIME ZONE '${FUSEAU_INSTITUTION}')
          GROUP BY j ORDER BY j`,
        [...p, ACTIONS_CONNEXION],
      ),
      this.q<{
        horodatage: Date;
        action: string;
        resultat: string | null;
        email: string | null;
        prenom: string | null;
        nom: string | null;
      }>(
        `SELECT a.horodatage, a.action, a.resultat, u.email, u.prenom, u.nom
           FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
          WHERE ${dans('a.horodatage')}
          ORDER BY a.horodatage DESC, a.id DESC
          LIMIT ${NB_ACTIVITE_RECENTE}`,
        p,
      ),
      this.q<{
        bloques: number;
        supports: number;
        generations: number;
        demandes: number;
        livrables: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM certificats
             WHERE statut = 'EN_ATTENTE_GENERATION' AND derniere_erreur IS NOT NULL) AS bloques,
           (SELECT count(*)::int FROM supports_pedagogiques WHERE statut = 'ECHEC_INDEXATION') AS supports,
           (SELECT count(*)::int FROM generations_ia
             WHERE statut = 'ECHEC' AND ${dans('updated_at')}) AS generations,
           (SELECT count(*)::int FROM demandes_role WHERE statut = 'EN_ATTENTE') AS demandes,
           (SELECT count(*)::int FROM livrables
             WHERE statut = 'SOUMIS' AND date_soumission < now() - make_interval(days => $3)) AS livrables`,
        [...p, JOURS_LIVRABLE_EN_ATTENTE],
      ),
    ]);

    const parRole = repartition(
      ROLES,
      utilisateurs.filter((u) => u.statut !== 'ANONYMISE').map((u) => ({ cle: u.role, n: u.n })),
    );
    const parStatut = repartition(
      STATUTS_COMPTE,
      utilisateurs.map((u) => ({ cle: u.statut, n: u.n })),
    );
    const formationsParStatut = repartition(STATUTS_FORMATION, formations);
    const inscriptionsParStatut = repartition(STATUTS_INSCRIPTION, inscriptions);
    const certificatsParStatut = repartition(STATUTS_CERTIFICAT, certificats);
    const [t] = qcm;
    const [l] = livrables;
    const [c] = corrections;
    const [al] = alertes;

    const listeAlertes: AlerteSysteme[] = (
      [
        ['CERTIFICATS_BLOQUES', al.bloques],
        ['SUPPORTS_EN_ECHEC', al.supports],
        ['GENERATIONS_EN_ECHEC', al.generations],
        ['DEMANDES_ROLE_EN_ATTENTE', al.demandes],
        ['LIVRABLES_EN_ATTENTE', al.livrables],
      ] as Array<[AlerteSysteme['code'], number]>
    )
      .filter(([, n]) => n > 0)
      .map(([code, nombre]) => ({ code, nombre }));

    return {
      periode,
      utilisateurs: {
        parRole,
        parStatut,
        total: somme(parRole),
        nouveaux: utilisateurs.reduce((a, u) => a + u.nouveaux, 0),
        connectes: utilisateurs.reduce((a, u) => a + u.connectes, 0),
      },
      formations: {
        parStatut: formationsParStatut,
        total: somme(formationsParStatut),
        nouvelles: formations.reduce((a, f) => a + f.nouvelles, 0),
      },
      inscriptions: {
        parStatut: inscriptionsParStatut,
        total: somme(inscriptionsParStatut),
        nouvelles: inscriptions.reduce((a, i) => a + i.nouvelles, 0),
      },
      evaluations: {
        qcm: {
          tentativesNotees: t.notees,
          reussies: t.reussies,
          tauxReussite: taux(t.reussies, t.notees),
          scoreMoyen: arrondi2(t.moyenne),
          enCours: t.en_cours,
        },
        ateliers: {
          livrablesSoumis: l.soumis,
          correctionsFinalisees: c.finalisees,
          noteMoyenne: arrondi2(c.moyenne),
          enAttenteCorrection: l.en_attente,
          enCorrection: l.en_correction,
        },
      },
      certificats: {
        parStatut: certificatsParStatut,
        emis: certificats.reduce((a, x) => a + x.emis, 0),
        revoques: certificats.reduce((a, x) => a + x.revoques, 0),
        consultations: consultations[0].n,
      },
      activite,
      activiteRecente: activiteRecente.map((e) => ({
        horodatage: e.horodatage,
        action: e.action,
        resultat: e.resultat,
        acteur: e.email ? { email: e.email, prenom: e.prenom, nom: e.nom } : null,
      })),
      alertes: listeAlertes,
    };
  }

  private q<T>(sql: string, parametres: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, parametres) as Promise<T[]>;
  }
}
