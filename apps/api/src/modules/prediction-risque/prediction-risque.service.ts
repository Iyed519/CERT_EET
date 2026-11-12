import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RisqueConfig } from '../../config/configuration';
import { CritereAlerte } from '../../database/enums/critere-alerte.enum';
import { NiveauRisque } from '../../database/enums/niveau-risque.enum';
import { Role } from '../../database/enums/role.enum';
import { ClientMlService, TAILLE_LOT } from './client-ml.service';
import { DonneesInscription, Variables, calculerVariables, debutFormation } from './risque.variables';

/** Historique des scores conservé (jours). */
export const CONSERVATION_JOURS = 180;

/** Rappel affiché avec chaque prédiction : le modèle suggère, le formateur décide. */
export const RAPPEL = 'Suggestion du modèle, à valider par le formateur';

const ORDRE: Record<NiveauRisque, number> = {
  [NiveauRisque.ELEVE]: 0,
  [NiveauRisque.MOYEN]: 1,
  [NiveauRisque.FAIBLE]: 2,
};

/** Résultat d'un calcul périodique. */
export interface BilanCalcul {
  /** Inscriptions examinées (formations commencées). */
  examinees: number;
  /** Scores enregistrés (0 si le service ml est indisponible). */
  enregistres: number;
  /** false : service ml indisponible, aucune prédiction (les règles restent actives). */
  serviceDisponible: boolean;
}

export interface RisqueApprenant {
  niveau: NiveauRisque;
  raisons: string[];
  dateCalcul: Date;
  versionModele: string;
}

export interface LigneRisque {
  inscriptionId: string;
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
  /** null : prédiction indisponible pour cet apprenant (aucun score récent). */
  risque: RisqueApprenant | null;
  /** Alertes des règles existantes, ouvertes (complémentarité). */
  alertesOuvertes: CritereAlerte[];
}

export interface RisqueFormation {
  formation: { id: string; titre: string };
  /** false : aucun score récent (service arrêté ou calcul pas encore fait). */
  disponible: boolean;
  dateCalcul: Date | null;
  versionModele: string | null;
  rappel: string;
  apprenants: LigneRisque[];
}

export interface ResumeRisqueFormation {
  formation: { id: string; titre: string; statut: string };
  inscrits: number;
  eleve: number;
  moyen: number;
  faible: number;
  sansPrediction: number;
  alertesOuvertes: number;
  disponible: boolean;
  dateCalcul: Date | null;
}

interface Inscrite {
  id: string;
  formation_id: string;
  apprenant_id: string;
  date_inscription: Date;
  date_debut: string | null;
}

/**
 * IA — Prédiction des apprenants à risque (complète les alertes à règles,
 * sans rien y changer).
 *
 * `calculer` (appelé seulement par le minuteur, jamais pendant une requête) :
 * pour chaque inscription EN_COURS d'une formation OUVERTE commencée, calcule
 * les 16 variables à partir des tables Cert_EET (`risque.variables.ts`),
 * demande au service ml probabilité, niveau et raisons, puis enregistre les
 * scores. Service ml indisponible : rien n'est écrit, aucune erreur.
 *
 * Lecture : formateur limité aux formations auxquelles il est affecté
 * (`formation_formateurs`), administrateur : toutes. Un score n'est montré
 * que s'il est récent (`fraicheurMs`) ; sinon « prédiction indisponible ».
 */
@Injectable()
export class PredictionRisqueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly client: ClientMlService,
    private readonly configService: ConfigService,
  ) {}

  /** Âge maximal d'un score affiché : deux intervalles de calcul, et au moins 26 h. */
  fraicheurMs(): number {
    const { intervalleMinutes } = this.configService.getOrThrow<RisqueConfig>('risque');
    return Math.max(2 * intervalleMinutes * 60_000, 26 * 3_600_000);
  }

  // ---------------------------------------------------------------------------
  // Calcul périodique
  // ---------------------------------------------------------------------------

  /** Données de chaque inscription à évaluer, lues dans les tables Cert_EET (lecture seule). */
  async collecter(maintenant: Date): Promise<Array<{ inscriptionId: string; donnees: DonneesInscription }>> {
    const inscrites = await this.q<Inscrite>(
      `SELECT i.id, i.formation_id, i.apprenant_id, i.date_inscription, f.date_debut::text AS date_debut
         FROM inscriptions i
         JOIN formations f ON f.id = i.formation_id
         JOIN users u ON u.id = i.apprenant_id
        WHERE i.statut = 'EN_COURS' AND f.statut = 'OUVERTE' AND u.statut = 'ACTIF'
          AND i.date_inscription < $1
          AND (f.date_fin IS NULL OR f.date_fin >= ($1::timestamptz AT TIME ZONE 'UTC')::date)`,
      [maintenant.toISOString()],
    );
    if (inscrites.length === 0) return [];
    const apprenants = [...new Set(inscrites.map((i) => i.apprenant_id))];
    const formations = [...new Set(inscrites.map((i) => i.formation_id))];
    const avant = maintenant.toISOString();

    const [activites, ateliers, remises, notes] = await Promise.all([
      // Un jour actif = au moins une connexion ou un renouvellement de session (jour UTC).
      this.q<{ user_id: string; jour: string }>(
        `SELECT DISTINCT user_id, (instant AT TIME ZONE 'UTC')::date::text AS jour FROM (
           SELECT user_id, horodatage AS instant FROM audit_logs
            WHERE action = 'LOGIN' AND user_id = ANY($1::uuid[]) AND horodatage < $2
           UNION ALL
           SELECT user_id, created_at AS instant FROM refresh_tokens
            WHERE user_id = ANY($1::uuid[]) AND created_at < $2
         ) a`,
        [apprenants, avant],
      ),
      this.q<{ formation_id: string; id: string; date_limite: Date }>(
        `SELECT m.formation_id, a.id, a.date_limite
           FROM ateliers a JOIN modules m ON m.id = a.module_id
          WHERE a.statut = 'PUBLIE' AND m.formation_id = ANY($1::uuid[])`,
        [formations],
      ),
      // Première soumission : un remplacement (US-ATEL-05) ne change pas la date de remise.
      this.q<{ formation_id: string; apprenant_id: string; atelier_id: string; date: Date }>(
        `SELECT m.formation_id, l.apprenant_id, l.atelier_id,
                LEAST(l.created_at, l.date_soumission) AS date
           FROM livrables l
           JOIN ateliers a ON a.id = l.atelier_id
           JOIN modules m ON m.id = a.module_id
          WHERE a.statut = 'PUBLIE' AND m.formation_id = ANY($1::uuid[])
            AND l.apprenant_id = ANY($2::uuid[])`,
        [formations, apprenants],
      ),
      // Une note est datée du moment où elle est connue (fin de tentative, fin de correction).
      this.q<{ formation_id: string; apprenant_id: string; id: string; valeur: string; date: Date }>(
        `SELECT m.formation_id, t.apprenant_id, t.id, t.score AS valeur, t.date_fin AS date
           FROM tentatives_qcm t
           JOIN qcm q ON q.id = t.qcm_id
           JOIN modules m ON m.id = q.module_id
          WHERE t.statut = 'NOTEE' AND q.statut = 'PUBLIE' AND t.score IS NOT NULL
            AND t.date_fin IS NOT NULL AND m.formation_id = ANY($1::uuid[])
            AND t.apprenant_id = ANY($2::uuid[])
         UNION ALL
         SELECT m.formation_id, l.apprenant_id, c.id, c.score_total AS valeur, c.date_finalisation AS date
           FROM corrections c
           JOIN livrables l ON l.id = c.livrable_id
           JOIN ateliers a ON a.id = l.atelier_id
           JOIN modules m ON m.id = a.module_id
          WHERE c.statut = 'TERMINEE' AND a.statut = 'PUBLIE' AND c.score_total IS NOT NULL
            AND c.date_finalisation IS NOT NULL AND m.formation_id = ANY($1::uuid[])
            AND l.apprenant_id = ANY($2::uuid[])`,
        [formations, apprenants],
      ),
    ]);

    const grouper = <T, K>(lignes: T[], cle: (l: T) => string, val: (l: T) => K): Map<string, K[]> => {
      const m = new Map<string, K[]>();
      for (const l of lignes) {
        const k = cle(l);
        const liste = m.get(k) ?? [];
        liste.push(val(l));
        m.set(k, liste);
      }
      return m;
    };
    const activitesPar = grouper(activites, (a) => a.user_id, (a) => new Date(`${a.jour}T12:00:00Z`));
    const ateliersPar = grouper(ateliers, (a) => a.formation_id, (a) => ({
      id: a.id,
      dateLimite: new Date(a.date_limite),
    }));
    const remisesPar = grouper(remises, (r) => `${r.formation_id}|${r.apprenant_id}`, (r) => ({
      atelierId: r.atelier_id,
      date: new Date(r.date),
    }));
    const notesPar = grouper(notes, (n) => `${n.formation_id}|${n.apprenant_id}`, (n) => ({
      id: n.id,
      valeur: Number(n.valeur),
      date: new Date(n.date),
    }));

    return inscrites.map((i) => {
      const k = `${i.formation_id}|${i.apprenant_id}`;
      const dateInscription = new Date(i.date_inscription);
      return {
        inscriptionId: i.id,
        donnees: {
          debut: debutFormation(i.date_debut, dateInscription),
          dateInscription,
          activites: activitesPar.get(i.apprenant_id) ?? [],
          ateliers: ateliersPar.get(i.formation_id) ?? [],
          remises: remisesPar.get(k) ?? [],
          notes: notesPar.get(k) ?? [],
        },
      };
    });
  }

  /** Un calcul complet : variables, prédictions par lots, enregistrement, purge. */
  async calculer(maintenant: Date = new Date()): Promise<BilanCalcul> {
    const aEvaluer: Array<{ identifiant: string; variables: Variables }> = [];
    for (const { inscriptionId, donnees } of await this.collecter(maintenant)) {
      const variables = calculerVariables(donnees, maintenant);
      if (variables) aEvaluer.push({ identifiant: inscriptionId, variables });
    }
    if (aEvaluer.length === 0) return { examinees: 0, enregistres: 0, serviceDisponible: true };

    const scores: Array<{
      inscriptionId: string;
      probabilite: number;
      niveau: NiveauRisque;
      raisons: string[];
      variables: Variables;
      versionModele: string;
    }> = [];
    for (let debut = 0; debut < aEvaluer.length; debut += TAILLE_LOT) {
      const lot = aEvaluer.slice(debut, debut + TAILLE_LOT);
      const reponse = await this.client.predire(lot);
      // Service indisponible : on s'arrête là, sans rien écrire (les règles restent actives).
      if (!reponse) return { examinees: aEvaluer.length, enregistres: 0, serviceDisponible: false };
      reponse.predictions.forEach((p, i) =>
        scores.push({
          inscriptionId: p.identifiant,
          probabilite: p.probabilite,
          niveau: p.niveau,
          raisons: p.raisons,
          variables: lot[i].variables,
          versionModele: reponse.versionModele,
        }),
      );
    }

    await this.dataSource.transaction(async (m) => {
      for (let debut = 0; debut < scores.length; debut += TAILLE_LOT) {
        const lot = scores.slice(debut, debut + TAILLE_LOT);
        const params: unknown[] = [];
        const valeurs = lot.map((s) => {
          params.push(
            s.inscriptionId,
            maintenant.toISOString(),
            s.probabilite,
            s.niveau,
            JSON.stringify(s.raisons),
            JSON.stringify(s.variables),
            s.versionModele,
          );
          const n = params.length;
          return `($${n - 6}, $${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}::jsonb, $${n - 1}::jsonb, $${n})`;
        });
        await m.query(
          `INSERT INTO scores_risque
             (inscription_id, date_calcul, probabilite, niveau, raisons, variables, version_modele)
           VALUES ${valeurs.join(', ')}`,
          params,
        );
      }
      await m.query(
        `DELETE FROM scores_risque WHERE date_calcul < $1::timestamptz - make_interval(days => $2)`,
        [maintenant.toISOString(), CONSERVATION_JOURS],
      );
    });
    return { examinees: aEvaluer.length, enregistres: scores.length, serviceDisponible: true };
  }

  // ---------------------------------------------------------------------------
  // Lecture (formateur affecté ou administrateur)
  // ---------------------------------------------------------------------------

  /** Apprenants d'une formation avec leur dernier score récent et leurs alertes ouvertes. */
  async parFormation(formationId: string, maintenant: Date = new Date()): Promise<RisqueFormation> {
    const [formation] = await this.q<{ id: string; titre: string }>(
      `SELECT id, titre FROM formations WHERE id = $1`,
      [formationId],
    );
    if (!formation) throw new NotFoundException('Formation introuvable.');
    const lignes = await this.q<{
      inscription_id: string;
      apprenant_id: string;
      prenom: string | null;
      nom: string | null;
      email: string;
      niveau: NiveauRisque | null;
      raisons: string[] | null;
      date_calcul: Date | null;
      version_modele: string | null;
      alertes: CritereAlerte[] | null;
    }>(
      `SELECT i.id AS inscription_id, u.id AS apprenant_id, u.prenom, u.nom, u.email,
              s.niveau, s.raisons, s.date_calcul, s.version_modele,
              (SELECT array_agg(DISTINCT a.critere::text ORDER BY a.critere::text)
                 FROM alertes_decrochage a
                WHERE a.formation_id = i.formation_id AND a.apprenant_id = i.apprenant_id
                  AND a.statut = 'OUVERTE') AS alertes
         FROM inscriptions i
         JOIN users u ON u.id = i.apprenant_id
         LEFT JOIN LATERAL (
           SELECT niveau, raisons, date_calcul, version_modele FROM scores_risque
            WHERE inscription_id = i.id AND date_calcul > $2::timestamptz - make_interval(secs => $3)
            ORDER BY date_calcul DESC LIMIT 1
         ) s ON true
        WHERE i.formation_id = $1 AND i.statut = 'EN_COURS'`,
      [formationId, maintenant.toISOString(), this.fraicheurMs() / 1000],
    );
    const apprenants: LigneRisque[] = lignes.map((l) => ({
      inscriptionId: l.inscription_id,
      apprenant: { id: l.apprenant_id, prenom: l.prenom, nom: l.nom, email: l.email },
      risque:
        l.niveau && l.date_calcul
          ? {
              niveau: l.niveau,
              raisons: l.raisons ?? [],
              dateCalcul: new Date(l.date_calcul),
              versionModele: l.version_modele ?? '',
            }
          : null,
      alertesOuvertes: l.alertes ?? [],
    }));
    const nomComplet = (a: LigneRisque['apprenant']): string =>
      [a.nom, a.prenom].filter(Boolean).join(' ') || a.email;
    apprenants.sort(
      (a, b) =>
        (a.risque ? ORDRE[a.risque.niveau] : 3) - (b.risque ? ORDRE[b.risque.niveau] : 3) ||
        b.alertesOuvertes.length - a.alertesOuvertes.length ||
        nomComplet(a.apprenant).localeCompare(nomComplet(b.apprenant), 'fr'),
    );
    const avecScore = apprenants.filter((a) => a.risque);
    const plusRecent = avecScore.reduce<RisqueApprenant | null>(
      (r, a) => (!r || (a.risque as RisqueApprenant).dateCalcul > r.dateCalcul ? a.risque : r),
      null,
    );
    return {
      formation,
      disponible: avecScore.length > 0,
      dateCalcul: plusRecent?.dateCalcul ?? null,
      versionModele: plusRecent?.versionModele ?? null,
      rappel: RAPPEL,
      apprenants,
    };
  }

  /** Une ligne par formation visible : répartition des niveaux et alertes ouvertes. */
  async resume(
    utilisateur: { sub: string; role: Role },
    maintenant: Date = new Date(),
  ): Promise<ResumeRisqueFormation[]> {
    const admin = utilisateur.role === Role.ADMINISTRATEUR;
    const params: unknown[] = [maintenant.toISOString(), this.fraicheurMs() / 1000];
    if (!admin) params.push(utilisateur.sub);
    const lignes = await this.q<{
      id: string;
      titre: string;
      statut: string;
      inscrits: number;
      eleve: number;
      moyen: number;
      faible: number;
      alertes: number;
      date_calcul: Date | null;
    }>(
      `SELECT f.id, f.titre, f.statut::text AS statut,
              count(i.id)::int AS inscrits,
              count(*) FILTER (WHERE s.niveau = 'ELEVE')::int AS eleve,
              count(*) FILTER (WHERE s.niveau = 'MOYEN')::int AS moyen,
              count(*) FILTER (WHERE s.niveau = 'FAIBLE')::int AS faible,
              max(s.date_calcul) AS date_calcul,
              (SELECT count(*)::int FROM alertes_decrochage a
                WHERE a.formation_id = f.id AND a.statut = 'OUVERTE') AS alertes
         FROM formations f
         LEFT JOIN inscriptions i ON i.formation_id = f.id AND i.statut = 'EN_COURS'
         LEFT JOIN LATERAL (
           SELECT niveau, date_calcul FROM scores_risque
            WHERE inscription_id = i.id AND date_calcul > $1::timestamptz - make_interval(secs => $2)
            ORDER BY date_calcul DESC LIMIT 1
         ) s ON true
        WHERE f.statut IN ('OUVERTE', 'FERMEE')
          ${admin ? '' : 'AND f.id IN (SELECT formation_id FROM formation_formateurs WHERE formateur_id = $3)'}
        GROUP BY f.id
        ORDER BY count(*) FILTER (WHERE s.niveau = 'ELEVE') DESC, f.titre`,
      params,
    );
    return lignes.map((l) => {
      const avecScore = l.eleve + l.moyen + l.faible;
      return {
        formation: { id: l.id, titre: l.titre, statut: l.statut },
        inscrits: l.inscrits,
        eleve: l.eleve,
        moyen: l.moyen,
        faible: l.faible,
        sansPrediction: l.inscrits - avecScore,
        alertesOuvertes: l.alertes,
        disponible: avecScore > 0,
        dateCalcul: l.date_calcul ? new Date(l.date_calcul) : null,
      };
    });
  }

  private q<T>(sql: string, parametres: unknown[] = []): Promise<T[]> {
    return this.dataSource.query(sql, parametres) as Promise<T[]>;
  }
}
