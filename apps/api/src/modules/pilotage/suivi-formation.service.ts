import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  EtatRisque,
  Tranche,
  avancement,
  etatRisque,
  histogramme,
  moyenne,
  plusRecente,
} from './suivi.regles';

/** Un apprenant dans le tableau de suivi (DS-14 P1). */
export interface ApprenantSuivi {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  statutInscription: string;
  dateInscription: Date;
  derniereConnexion: Date | null;
  derniereActivite: Date | null;
  avancement: number;
  qcm: { reussis: number; passes: number; total: number; scoreMoyen: number | null };
  ateliers: {
    rendus: number;
    notes: number;
    total: number;
    noteMoyenne: number | null;
    enRetard: number;
    nonRendus: number;
  };
  moyenne: number | null;
  certificat: string | null;
  risque: EtatRisque;
  /** US-SUIVI-02 — critères des alertes de décrochage OUVERTES. */
  alertes: string[];
}

/** US-SUIVI-01 — Tableau de bord pédagogique d'une formation. */
export interface SuiviFormation {
  formation: { id: string; titre: string; statut: string };
  kpis: {
    inscrits: number;
    actifs: number;
    inactifs: number;
    termines: number;
    suspendus: number;
    tauxCompletion: number;
    scoreMoyenQcm: number | null;
    noteMoyenneAteliers: number | null;
    certifies: number;
    alertesOuvertes: number;
    qcmPublies: number;
    ateliersPublies: number;
  };
  histogramme: Tranche[];
  apprenants: ApprenantSuivi[];
}

export interface EvenementApprenant {
  date: Date;
  type: 'INSCRIPTION' | 'TENTATIVE' | 'LIVRABLE' | 'CORRECTION' | 'CERTIFICAT';
  libelle: string;
}

/** US-SUIVI-01 — Fiche détaillée d'un apprenant (DS-14 P1, « fiche »). */
export interface FicheApprenant {
  apprenant: ApprenantSuivi;
  tentatives: Array<{
    id: string;
    qcmId: string;
    qcmTitre: string;
    dateDebut: Date;
    dateFin: Date | null;
    dureeEffective: number | null;
    score: number | null;
    reussie: boolean | null;
    statut: string;
  }>;
  livrables: Array<{
    id: string;
    atelierId: string;
    atelierTitre: string;
    version: number;
    dateSoumission: Date;
    enRetard: boolean;
    statut: string;
    note: number | null;
  }>;
  certificat: {
    id: string;
    statut: string;
    scoreFinal: number;
    dateGeneration: Date | null;
  } | null;
  chronologie: EvenementApprenant[];
  /** US-SUIVI-02 — alertes de décrochage (toutes, plus récentes d'abord). */
  alertes: Array<{
    id: string;
    critere: string;
    statut: string;
    donnees: Record<string, unknown>;
    suggestion: string;
    dateCreation: Date;
    dateTraitement: Date | null;
  }>;
}

interface LigneInscrit {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  statut: string;
  date_inscription: Date;
  derniere_connexion: Date | null;
  certificat: string | null;
}

/** Évaluations publiées de la formation (QCM et ateliers, via les modules). */
const EVALUATIONS = `
  q AS (SELECT q.id FROM qcm q JOIN modules m ON m.id = q.module_id
         WHERE m.formation_id = $1 AND q.statut = 'PUBLIE'),
  a AS (SELECT a.id, a.date_limite, a.tolerance_retard_heures FROM ateliers a
          JOIN modules m ON m.id = a.module_id
         WHERE m.formation_id = $1 AND a.statut = 'PUBLIE')`;

/**
 * US-SUIVI-01 — Suivi pédagogique d'une formation (formateur affecté ou
 * administrateur ; l'isolation est faite par le garde @FormateurDeLaFormation).
 *
 * Lecture seule, non tracée. Cinq requêtes plates pour toute la formation (au
 * plus sa capacité en apprenants), agrégées en mémoire par les règles pures :
 * meilleure tentative notée par QCM publié, livrables des ateliers publiés et
 * leur correction finalisée, dernière activité (tentative ou dépôt).
 */
@Injectable()
export class SuiviFormationService {
  constructor(private readonly dataSource: DataSource) {}

  async suivi(formationId: string, maintenant: Date = new Date()): Promise<SuiviFormation> {
    const formation = await this.formation(formationId);
    const [inscrits, compteurs, tentatives, livrables, alertes] = await Promise.all([
      this.q<LigneInscrit>(
        `SELECT u.id, u.prenom, u.nom, u.email, i.statut::text AS statut, i.date_inscription,
                u.derniere_connexion, c.statut::text AS certificat
           FROM inscriptions i
           JOIN users u ON u.id = i.apprenant_id
           LEFT JOIN certificats c ON c.apprenant_id = i.apprenant_id AND c.formation_id = i.formation_id
                AND NOT EXISTS (SELECT 1 FROM certificats n WHERE n.remplace_certificat_id = c.id)
          WHERE i.formation_id = $1
          ORDER BY u.nom COLLATE "C" NULLS LAST, u.prenom COLLATE "C" NULLS LAST, u.email COLLATE "C"`,
        [formationId],
      ),
      this.compteurs(formationId),
      this.q<{
        apprenant_id: string;
        qcm_id: string;
        meilleur: string | null;
        reussi: boolean | null;
        notees: number;
        derniere: Date;
      }>(
        `WITH ${EVALUATIONS}
         SELECT t.apprenant_id, t.qcm_id,
                max(t.score) FILTER (WHERE t.statut = 'NOTEE') AS meilleur,
                bool_or(t.est_reussie) FILTER (WHERE t.statut = 'NOTEE') AS reussi,
                count(*) FILTER (WHERE t.statut = 'NOTEE')::int AS notees,
                max(GREATEST(t.date_debut, COALESCE(t.date_fin, t.date_debut))) AS derniere
           FROM tentatives_qcm t
          WHERE t.qcm_id IN (SELECT id FROM q)
          GROUP BY t.apprenant_id, t.qcm_id`,
        [formationId],
      ),
      this.q<{
        apprenant_id: string;
        atelier_id: string;
        statut: string;
        en_retard: boolean;
        date_soumission: Date;
        note: string | null;
      }>(
        `WITH ${EVALUATIONS}
         SELECT l.apprenant_id, l.atelier_id, l.statut::text AS statut, l.en_retard,
                l.date_soumission, c.score_total AS note
           FROM livrables l
           LEFT JOIN corrections c ON c.livrable_id = l.id AND c.statut = 'TERMINEE'
          WHERE l.atelier_id IN (SELECT id FROM a)`,
        [formationId],
      ),
      this.q<{ apprenant_id: string; critere: string }>(
        `SELECT apprenant_id, critere::text AS critere FROM alertes_decrochage
          WHERE formation_id = $1 AND statut = 'OUVERTE'
          ORDER BY critere`,
        [formationId],
      ),
    ]);

    const apprenants = inscrits.map((i) => ({
      ...this.ligne(
        i,
        tentatives.filter((t) => t.apprenant_id === i.id),
        livrables.filter((l) => l.apprenant_id === i.id),
        compteurs,
        maintenant,
      ),
      alertes: alertes.filter((a) => a.apprenant_id === i.id).map((a) => a.critere),
    }));

    const suivis = apprenants.filter((a) => a.statutInscription !== 'SUSPENDUE');
    const moyennes = apprenants.map((a) => a.moyenne).filter((m): m is number => m !== null);
    return {
      formation,
      kpis: {
        inscrits: apprenants.length,
        actifs: apprenants.filter((a) => a.statutInscription === 'EN_COURS' && !a.risque.inactif)
          .length,
        inactifs: apprenants.filter((a) => a.risque.inactif).length,
        termines: apprenants.filter((a) => a.statutInscription === 'TERMINEE').length,
        suspendus: apprenants.filter((a) => a.statutInscription === 'SUSPENDUE').length,
        tauxCompletion: moyenne(suivis.map((a) => a.avancement)) ?? 0,
        scoreMoyenQcm: moyenne(
          tentatives.filter((t) => t.meilleur !== null).map((t) => Number(t.meilleur)),
        ),
        noteMoyenneAteliers: moyenne(
          livrables.filter((l) => l.note !== null).map((l) => Number(l.note)),
        ),
        certifies: apprenants.filter((a) => a.certificat === 'ACTIF').length,
        alertesOuvertes: alertes.length,
        qcmPublies: compteurs.qcm,
        ateliersPublies: compteurs.ateliers,
      },
      histogramme: histogramme(moyennes),
      apprenants,
    };
  }

  async fiche(
    formationId: string,
    apprenantId: string,
    maintenant: Date = new Date(),
  ): Promise<FicheApprenant> {
    await this.formation(formationId);
    const [inscrit] = await this.q<LigneInscrit>(
      `SELECT u.id, u.prenom, u.nom, u.email, i.statut::text AS statut, i.date_inscription,
              u.derniere_connexion, c.statut::text AS certificat
         FROM inscriptions i
         JOIN users u ON u.id = i.apprenant_id
         LEFT JOIN certificats c ON c.apprenant_id = i.apprenant_id AND c.formation_id = i.formation_id
                AND NOT EXISTS (SELECT 1 FROM certificats n WHERE n.remplace_certificat_id = c.id)
        WHERE i.formation_id = $1 AND i.apprenant_id = $2`,
      [formationId, apprenantId],
    );
    if (!inscrit) throw new NotFoundException('Apprenant non inscrit à cette formation.');

    const [compteurs, tentatives, livrables, certificats, alertes] = await Promise.all([
      this.compteurs(formationId),
      this.q<{
        id: string;
        qcm_id: string;
        qcm_titre: string;
        date_debut: Date;
        date_fin: Date | null;
        duree_effective: number | null;
        score: string | null;
        est_reussie: boolean | null;
        statut: string;
        publie: boolean;
      }>(
        `SELECT t.id, t.qcm_id, q.titre AS qcm_titre, t.date_debut, t.date_fin, t.duree_effective,
                t.score, t.est_reussie, t.statut::text AS statut, q.statut = 'PUBLIE' AS publie
           FROM tentatives_qcm t
           JOIN qcm q ON q.id = t.qcm_id
           JOIN modules m ON m.id = q.module_id
          WHERE m.formation_id = $1 AND t.apprenant_id = $2
          ORDER BY t.date_debut DESC, t.id`,
        [formationId, apprenantId],
      ),
      this.q<{
        id: string;
        atelier_id: string;
        atelier_titre: string;
        version: number;
        date_soumission: Date;
        en_retard: boolean;
        statut: string;
        note: string | null;
        date_finalisation: Date | null;
        publie: boolean;
      }>(
        `SELECT l.id, l.atelier_id, a.titre AS atelier_titre, l.version, l.date_soumission,
                l.en_retard, l.statut::text AS statut, c.score_total AS note, c.date_finalisation,
                a.statut = 'PUBLIE' AS publie
           FROM livrables l
           JOIN ateliers a ON a.id = l.atelier_id
           JOIN modules m ON m.id = a.module_id
           LEFT JOIN corrections c ON c.livrable_id = l.id AND c.statut = 'TERMINEE'
          WHERE m.formation_id = $1 AND l.apprenant_id = $2
          ORDER BY l.date_soumission DESC, l.id`,
        [formationId, apprenantId],
      ),
      this.q<{ id: string; statut: string; score_final: string; date_generation: Date | null }>(
        `SELECT id, statut::text AS statut, score_final, date_generation
           FROM certificats c WHERE formation_id = $1 AND apprenant_id = $2
            AND NOT EXISTS (SELECT 1 FROM certificats n WHERE n.remplace_certificat_id = c.id)`,
        [formationId, apprenantId],
      ),
      this.q<{
        id: string;
        critere: string;
        statut: string;
        donnees: Record<string, unknown>;
        suggestion: string;
        date_creation: Date;
        date_traitement: Date | null;
      }>(
        `SELECT id, critere::text AS critere, statut::text AS statut, donnees, suggestion,
                date_creation, date_traitement
           FROM alertes_decrochage WHERE formation_id = $1 AND apprenant_id = $2
          ORDER BY date_creation DESC, id`,
        [formationId, apprenantId],
      ),
    ]);

    // Même agrégation que le tableau (évaluations publiées seulement).
    const parQcm = new Map<
      string,
      {
        apprenant_id: string;
        qcm_id: string;
        meilleur: string | null;
        reussi: boolean | null;
        notees: number;
        derniere: Date;
      }
    >();
    for (const t of tentatives.filter((x) => x.publie)) {
      const date = plusRecente(t.date_debut, t.date_fin) as Date;
      const e = parQcm.get(t.qcm_id) ?? {
        apprenant_id: apprenantId,
        qcm_id: t.qcm_id,
        meilleur: null,
        reussi: null,
        notees: 0,
        derniere: date,
      };
      if (t.statut === 'NOTEE') {
        e.notees += 1;
        if (t.score !== null && (e.meilleur === null || Number(t.score) > Number(e.meilleur))) {
          e.meilleur = t.score;
        }
        e.reussi = (e.reussi ?? false) || t.est_reussie === true;
      }
      if (date > e.derniere) e.derniere = date;
      parQcm.set(t.qcm_id, e);
    }
    const ligneApprenant = this.ligne(
      inscrit,
      [...parQcm.values()],
      livrables.filter((l) => l.publie).map((l) => ({ ...l, apprenant_id: apprenantId })),
      compteurs,
      maintenant,
    );

    const apprenant = {
      ...ligneApprenant,
      alertes: alertes.filter((a) => a.statut === 'OUVERTE').map((a) => a.critere),
    };
    const [cert] = certificats;
    const chronologie: EvenementApprenant[] = [
      { date: inscrit.date_inscription, type: 'INSCRIPTION' as const, libelle: 'Inscription' },
      ...tentatives.map((t) => ({
        date: plusRecente(t.date_debut, t.date_fin) as Date,
        type: 'TENTATIVE' as const,
        libelle:
          t.statut === 'NOTEE'
            ? `QCM « ${t.qcm_titre} » : ${Number(t.score)} / 100${t.est_reussie ? ' (réussi)' : ''}`
            : `QCM « ${t.qcm_titre} » : tentative ${t.statut === 'EN_COURS' ? 'en cours' : 'soumise'}`,
      })),
      ...livrables.map((l) => ({
        date: l.date_soumission,
        type: 'LIVRABLE' as const,
        libelle: `Livrable « ${l.atelier_titre} » déposé${l.en_retard ? ' en retard' : ''}`,
      })),
      ...livrables
        .filter((l) => l.date_finalisation !== null)
        .map((l) => ({
          date: l.date_finalisation as Date,
          type: 'CORRECTION' as const,
          libelle: `Livrable « ${l.atelier_titre} » noté ${Number(l.note)} / 100`,
        })),
      ...(cert?.date_generation
        ? [
            {
              date: cert.date_generation,
              type: 'CERTIFICAT' as const,
              libelle:
                cert.statut === 'REVOQUE' ? 'Certificat émis (révoqué depuis)' : 'Certificat émis',
            },
          ]
        : []),
    ].sort((x, y) => y.date.getTime() - x.date.getTime());

    return {
      apprenant,
      tentatives: tentatives.map((t) => ({
        id: t.id,
        qcmId: t.qcm_id,
        qcmTitre: t.qcm_titre,
        dateDebut: t.date_debut,
        dateFin: t.date_fin,
        dureeEffective: t.duree_effective,
        score: t.score === null ? null : Number(t.score),
        reussie: t.est_reussie,
        statut: t.statut,
      })),
      livrables: livrables.map((l) => ({
        id: l.id,
        atelierId: l.atelier_id,
        atelierTitre: l.atelier_titre,
        version: l.version,
        dateSoumission: l.date_soumission,
        enRetard: l.en_retard,
        statut: l.statut,
        note: l.note === null ? null : Number(l.note),
      })),
      certificat: cert
        ? {
            id: cert.id,
            statut: cert.statut,
            scoreFinal: Number(cert.score_final),
            dateGeneration: cert.date_generation,
          }
        : null,
      chronologie,
      alertes: alertes.map((a) => ({
        id: a.id,
        critere: a.critere,
        statut: a.statut,
        donnees: a.donnees,
        suggestion: a.suggestion,
        dateCreation: a.date_creation,
        dateTraitement: a.date_traitement,
      })),
    };
  }

  /** Une ligne du tableau à partir des lectures plates d'un apprenant. */
  private ligne(
    i: LigneInscrit,
    tentatives: Array<{
      meilleur: string | null;
      reussi: boolean | null;
      notees: number;
      derniere: Date;
    }>,
    livrables: Array<{
      atelier_id: string;
      en_retard: boolean;
      date_soumission: Date;
      note: string | null;
    }>,
    compteurs: { qcm: number; ateliers: number; echus: string[] },
    maintenant: Date,
  ): ApprenantSuivi {
    const scores = tentatives.filter((t) => t.meilleur !== null).map((t) => Number(t.meilleur));
    const notes = livrables.filter((l) => l.note !== null).map((l) => Number(l.note));
    const reussis = tentatives.filter((t) => t.reussi === true).length;
    const rendus = new Set(livrables.map((l) => l.atelier_id));
    return {
      id: i.id,
      prenom: i.prenom,
      nom: i.nom,
      email: i.email,
      statutInscription: i.statut,
      dateInscription: i.date_inscription,
      derniereConnexion: i.derniere_connexion,
      derniereActivite: plusRecente(
        ...tentatives.map((t) => t.derniere),
        ...livrables.map((l) => l.date_soumission),
      ),
      avancement: avancement(reussis, compteurs.qcm, notes.length, compteurs.ateliers),
      qcm: {
        reussis,
        passes: tentatives.filter((t) => t.notees > 0).length,
        total: compteurs.qcm,
        scoreMoyen: moyenne(scores),
      },
      ateliers: {
        rendus: rendus.size,
        notes: notes.length,
        total: compteurs.ateliers,
        noteMoyenne: moyenne(notes),
        enRetard: livrables.filter((l) => l.en_retard).length,
        nonRendus: compteurs.echus.filter((id) => !rendus.has(id)).length,
      },
      moyenne: moyenne([...scores, ...notes]),
      certificat: i.certificat,
      risque: etatRisque(i.statut, i.derniere_connexion, i.date_inscription, maintenant),
      alertes: [],
    };
  }

  private async formation(id: string): Promise<{ id: string; titre: string; statut: string }> {
    const [f] = await this.q<{ id: string; titre: string; statut: string }>(
      `SELECT id, titre, statut::text AS statut FROM formations WHERE id = $1`,
      [id],
    );
    if (!f) throw new NotFoundException('Formation introuvable.');
    return f;
  }

  /** Évaluations publiées, et ateliers échus (date limite + tolérance passée). */
  private async compteurs(
    formationId: string,
  ): Promise<{ qcm: number; ateliers: number; echus: string[] }> {
    const [c] = await this.q<{ qcm: number; ateliers: number; echus: string[] | null }>(
      `WITH ${EVALUATIONS}
       SELECT (SELECT count(*)::int FROM q) AS qcm,
              (SELECT count(*)::int FROM a) AS ateliers,
              (SELECT array_agg(id::text) FROM a
                WHERE date_limite + make_interval(hours => tolerance_retard_heures) < now()) AS echus`,
      [formationId],
    );
    return { qcm: c.qcm, ateliers: c.ateliers, echus: c.echus ?? [] };
  }

  private q<T>(sql: string, parametres: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, parametres) as Promise<T[]>;
  }
}
