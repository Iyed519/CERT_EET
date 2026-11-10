import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AlertesConfig } from '../../config/configuration';
import { CritereAlerte } from '../../database/enums/critere-alerte.enum';
import { Role } from '../../database/enums/role.enum';
import { StatutAlerte } from '../../database/enums/statut-alerte.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import {
  AtelierAttendu,
  NoteDatee,
  SUGGESTIONS,
  ateliersEnRetard,
  echecsConsecutifs,
  scoreEnChute,
} from './alertes.regles';
import { etatRisque } from './suivi.regles';

/** Après le traitement d'une alerte, pas de nouvelle alerte du même critère avant N jours. */
export const JOURS_REPIT = 7;

/** Plafond d'une liste d'alertes. */
export const MAX_ALERTES = 200;

/** Une alerte à créer (avant l'insertion). */
export interface AlerteCandidate {
  formationId: string;
  apprenantId: string;
  critere: CritereAlerte;
  donnees: Record<string, unknown>;
}

/** Une alerte telle que listée au formateur. */
export interface AlerteVue {
  id: string;
  critere: CritereAlerte;
  statut: StatutAlerte;
  donnees: Record<string, unknown>;
  suggestion: string;
  dateCreation: Date;
  dateTraitement: Date | null;
  formation: { id: string; titre: string };
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
}

interface Inscrit {
  formation_id: string;
  apprenant_id: string;
  date_inscription: Date;
  derniere_connexion: Date | null;
}

const cle = (formationId: string, apprenantId: string): string => `${formationId}|${apprenantId}`;

/**
 * US-SUIVI-02 — Alertes de décrochage automatiques (DS-14 P2).
 *
 * Le balayage (`balayer`, appelé par le minuteur ou par l'administrateur)
 * examine chaque inscription EN_COURS d'une formation non archivée et crée une
 * alerte OUVERTE par critère vérifié — critères factuels des règles pures :
 * inactivité (même définition que le suivi, US-SUIVI-01), deux échecs de QCM
 * consécutifs, atelier non rendu 48 h après sa date limite, note en chute.
 *
 * - Idempotent et sûr en concurrence : index unique partiel (une alerte
 *   OUVERTE par formation, apprenant et critère) + ON CONFLICT DO NOTHING.
 * - Répit : pas de nouvelle alerte d'un critère traité il y a moins de
 *   `JOURS_REPIT` jours.
 * - Chaque alerte créée est tracée (`ALERTE_DECROCHAGE_CREEE`, acteur
 *   système) ; les formateurs affectés reçoivent UN email récapitulatif par
 *   balayage (si `ALERTES_EMAIL`), dont l'échec n'annule rien.
 */
@Injectable()
export class AlertesDecrochageService {
  private readonly logger = new Logger(AlertesDecrochageService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /** Calcule les alertes dues à `maintenant` (lecture seule). */
  async detecter(maintenant: Date = new Date()): Promise<AlerteCandidate[]> {
    const [inscrits, notes, ateliers, rendus] = await Promise.all([
      this.q<Inscrit>(
        `SELECT i.formation_id, i.apprenant_id, i.date_inscription, u.derniere_connexion
           FROM inscriptions i
           JOIN formations f ON f.id = i.formation_id
           JOIN users u ON u.id = i.apprenant_id
          WHERE i.statut = 'EN_COURS' AND f.statut <> 'ARCHIVEE' AND u.statut = 'ACTIF'`,
      ),
      this.q<{
        formation_id: string;
        apprenant_id: string;
        type: 'QCM' | 'ATELIER';
        titre: string;
        valeur: string;
        date: Date;
        reussie: boolean | null;
      }>(
        `SELECT m.formation_id, t.apprenant_id, 'QCM' AS type, q.titre, t.score AS valeur,
                t.date_fin AS date, t.est_reussie AS reussie
           FROM tentatives_qcm t
           JOIN qcm q ON q.id = t.qcm_id
           JOIN modules m ON m.id = q.module_id
          WHERE t.statut = 'NOTEE' AND q.statut = 'PUBLIE' AND t.score IS NOT NULL
            AND t.date_fin IS NOT NULL
         UNION ALL
         SELECT m.formation_id, l.apprenant_id, 'ATELIER' AS type, a.titre, c.score_total AS valeur,
                c.date_finalisation AS date, NULL AS reussie
           FROM corrections c
           JOIN livrables l ON l.id = c.livrable_id
           JOIN ateliers a ON a.id = l.atelier_id
           JOIN modules m ON m.id = a.module_id
          WHERE c.statut = 'TERMINEE' AND a.statut = 'PUBLIE'`,
      ),
      this.q<{ formation_id: string; id: string; titre: string; date_limite: Date }>(
        `SELECT m.formation_id, a.id, a.titre, a.date_limite
           FROM ateliers a JOIN modules m ON m.id = a.module_id
          WHERE a.statut = 'PUBLIE'`,
      ),
      this.q<{ formation_id: string; apprenant_id: string; atelier_id: string }>(
        `SELECT m.formation_id, l.apprenant_id, l.atelier_id
           FROM livrables l
           JOIN ateliers a ON a.id = l.atelier_id
           JOIN modules m ON m.id = a.module_id`,
      ),
    ]);

    const notesPar = new Map<string, NoteDatee[]>();
    for (const n of notes) {
      const k = cle(n.formation_id, n.apprenant_id);
      const liste = notesPar.get(k) ?? [];
      liste.push({
        type: n.type,
        titre: n.titre,
        valeur: Number(n.valeur),
        date: new Date(n.date),
        reussie: n.reussie,
      });
      notesPar.set(k, liste);
    }
    const ateliersPar = new Map<string, AtelierAttendu[]>();
    for (const a of ateliers) {
      const liste = ateliersPar.get(a.formation_id) ?? [];
      liste.push({ id: a.id, titre: a.titre, dateLimite: new Date(a.date_limite) });
      ateliersPar.set(a.formation_id, liste);
    }
    const rendusPar = new Map<string, Set<string>>();
    for (const r of rendus) {
      const k = cle(r.formation_id, r.apprenant_id);
      const s = rendusPar.get(k) ?? new Set<string>();
      s.add(r.atelier_id);
      rendusPar.set(k, s);
    }

    const candidates: AlerteCandidate[] = [];
    for (const i of inscrits) {
      const k = cle(i.formation_id, i.apprenant_id);
      const base = { formationId: i.formation_id, apprenantId: i.apprenant_id };
      const risque = etatRisque('EN_COURS', i.derniere_connexion, i.date_inscription, maintenant);
      if (risque.inactif) {
        candidates.push({
          ...base,
          critere: CritereAlerte.INACTIVITE,
          donnees: {
            joursSansConnexion: risque.joursSansConnexion,
            derniereConnexion: i.derniere_connexion ? i.derniere_connexion.toISOString() : null,
          },
        });
      }
      const sesNotes = notesPar.get(k) ?? [];
      const echecs = echecsConsecutifs(sesNotes);
      if (echecs) candidates.push({ ...base, critere: CritereAlerte.ECHECS_QCM, donnees: echecs });
      const chute = scoreEnChute(sesNotes);
      if (chute)
        candidates.push({ ...base, critere: CritereAlerte.SCORE_EN_CHUTE, donnees: chute });
      // Seuls les ateliers échus APRÈS l'inscription sont attendus de l'apprenant.
      const attendus = (ateliersPar.get(i.formation_id) ?? []).filter(
        (a) => a.dateLimite > new Date(i.date_inscription),
      );
      const retard = ateliersEnRetard(attendus, rendusPar.get(k) ?? new Set(), maintenant);
      if (retard) {
        candidates.push({ ...base, critere: CritereAlerte.LIVRABLE_EN_RETARD, donnees: retard });
      }
    }
    return candidates;
  }

  /** Détecte puis crée les alertes nouvelles ; renvoie celles créées. */
  async balayer(maintenant: Date = new Date()): Promise<AlerteCandidate[]> {
    const candidates = await this.detecter(maintenant);
    const creees: Array<AlerteCandidate & { id: string }> = [];
    for (const c of candidates) {
      const lignes = await this.q<{ id: string }>(
        `INSERT INTO alertes_decrochage (formation_id, apprenant_id, critere, donnees, suggestion)
         SELECT $1, $2, $3::alertes_decrochage_critere_enum, $4::jsonb, $5
          WHERE NOT EXISTS (
            SELECT 1 FROM alertes_decrochage
             WHERE formation_id = $1 AND apprenant_id = $2
               AND critere = $3::alertes_decrochage_critere_enum
               AND statut = 'TRAITEE'
               AND date_traitement > $6::timestamptz - make_interval(days => $7))
         ON CONFLICT (formation_id, apprenant_id, critere) WHERE statut = 'OUVERTE' DO NOTHING
         RETURNING id`,
        [
          c.formationId,
          c.apprenantId,
          c.critere,
          JSON.stringify(c.donnees),
          SUGGESTIONS[c.critere],
          maintenant.toISOString(),
          JOURS_REPIT,
        ],
      );
      if (lignes.length === 0) continue;
      creees.push({ ...c, id: lignes[0].id });
      await this.auditService.record({
        action: 'ALERTE_DECROCHAGE_CREEE',
        acteur: null,
        cible: lignes[0].id,
        resultat: 'Succès',
        detailsAvantApres: {
          formationId: c.formationId,
          apprenantId: c.apprenantId,
          critere: c.critere,
        },
      });
    }
    if (creees.length > 0) await this.notifier(creees);
    return creees;
  }

  /** Alertes visibles par l'utilisateur (formateur : ses formations ; admin : toutes). */
  async lister(
    utilisateur: { sub: string; role: Role },
    filtre: { statut?: StatutAlerte; formationId?: string } = {},
  ): Promise<AlerteVue[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (utilisateur.role !== Role.ADMINISTRATEUR) {
      params.push(utilisateur.sub);
      conditions.push(
        `a.formation_id IN (SELECT formation_id FROM formation_formateurs WHERE formateur_id = $${params.length})`,
      );
    }
    if (filtre.statut) {
      params.push(filtre.statut);
      conditions.push(`a.statut = $${params.length}::alertes_decrochage_statut_enum`);
    }
    if (filtre.formationId) {
      params.push(filtre.formationId);
      conditions.push(`a.formation_id = $${params.length}`);
    }
    const lignes = await this.q<{
      id: string;
      critere: CritereAlerte;
      statut: StatutAlerte;
      donnees: Record<string, unknown>;
      suggestion: string;
      date_creation: Date;
      date_traitement: Date | null;
      formation_id: string;
      titre: string;
      apprenant_id: string;
      prenom: string | null;
      nom: string | null;
      email: string;
    }>(
      `SELECT a.id, a.critere, a.statut, a.donnees, a.suggestion, a.date_creation, a.date_traitement,
              f.id AS formation_id, f.titre, u.id AS apprenant_id, u.prenom, u.nom, u.email
         FROM alertes_decrochage a
         JOIN formations f ON f.id = a.formation_id
         JOIN users u ON u.id = a.apprenant_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY a.date_creation DESC, a.id
        LIMIT ${MAX_ALERTES}`,
      params,
    );
    return lignes.map((l) => ({
      id: l.id,
      critere: l.critere,
      statut: l.statut,
      donnees: l.donnees,
      suggestion: l.suggestion,
      dateCreation: l.date_creation,
      dateTraitement: l.date_traitement,
      formation: { id: l.formation_id, titre: l.titre },
      apprenant: { id: l.apprenant_id, prenom: l.prenom, nom: l.nom, email: l.email },
    }));
  }

  /** Nombre d'alertes ouvertes visibles (badge). */
  async compteur(utilisateur: { sub: string; role: Role }): Promise<{ ouvertes: number }> {
    const admin = utilisateur.role === Role.ADMINISTRATEUR;
    const [{ n }] = await this.q<{ n: number }>(
      `SELECT count(*)::int AS n FROM alertes_decrochage a
        WHERE a.statut = 'OUVERTE'
          ${admin ? '' : 'AND a.formation_id IN (SELECT formation_id FROM formation_formateurs WHERE formateur_id = $1)'}`,
      admin ? [] : [utilisateur.sub],
    );
    return { ouvertes: n };
  }

  /** Un email récapitulatif par formateur affecté ; une erreur d'envoi est seulement journalisée. */
  private async notifier(creees: AlerteCandidate[]): Promise<void> {
    if (!this.configService.get<AlertesConfig>('alertes')?.email) return;
    const formations = [...new Set(creees.map((c) => c.formationId))];
    const lignes = await this.q<{
      formateur_email: string;
      formateur_prenom: string | null;
      formation_id: string;
      titre: string;
    }>(
      `SELECT u.email AS formateur_email, u.prenom AS formateur_prenom, f.id AS formation_id, f.titre
         FROM formation_formateurs ff
         JOIN users u ON u.id = ff.formateur_id AND u.statut = 'ACTIF'
         JOIN formations f ON f.id = ff.formation_id
        WHERE ff.formation_id = ANY($1::uuid[])`,
      [formations],
    );
    const apprenants = await this.q<{
      id: string;
      prenom: string | null;
      nom: string | null;
      email: string;
    }>(`SELECT id, prenom, nom, email FROM users WHERE id = ANY($1::uuid[])`, [
      [...new Set(creees.map((c) => c.apprenantId))],
    ]);
    const nom = (id: string): string => {
      const a = apprenants.find((x) => x.id === id);
      return a ? [a.prenom, a.nom].filter(Boolean).join(' ') || a.email : 'Apprenant';
    };
    const parFormateur = new Map<
      string,
      {
        prenom: string | null;
        alertes: Array<{ apprenant: string; formation: string; critere: CritereAlerte }>;
      }
    >();
    for (const l of lignes) {
      const entree = parFormateur.get(l.formateur_email) ?? {
        prenom: l.formateur_prenom,
        alertes: [],
      };
      for (const c of creees.filter((x) => x.formationId === l.formation_id)) {
        entree.alertes.push({
          apprenant: nom(c.apprenantId),
          formation: l.titre,
          critere: c.critere,
        });
      }
      parFormateur.set(l.formateur_email, entree);
    }
    for (const [email, { prenom, alertes }] of parFormateur) {
      try {
        await this.mailService.sendAlertesDecrochageEmail(email, { prenom, alertes });
      } catch (erreur) {
        this.logger.error(`Email d'alertes non envoyé à ${email} : ${String(erreur)}`);
      }
    }
  }

  private q<T>(sql: string, parametres: unknown[] = []): Promise<T[]> {
    return this.dataSource.query(sql, parametres) as Promise<T[]>;
  }
}
