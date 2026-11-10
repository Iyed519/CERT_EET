import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { CertificatAdminVue, CertificatsService } from './certificats.service';

/** Action d'audit écrite à chaque vérification publique (US-CERT-04). */
export const ACTION_VERIFICATION = 'CERTIFICAT_VERIFIE';

/** Nombre de consultations récentes montrées dans la fiche. */
export const NB_CONSULTATIONS_RECENTES = 20;

/** Plafond de l'historique d'une fiche (événements du cycle de vie). */
export const MAX_HISTORIQUE = 200;

/** US-DASH-02 — Compteur de consultations publiques d'un certificat. */
export interface ConsultationsResume {
  total: number;
  derniere: Date | null;
}

/** Un certificat dans la supervision : vue d'administration + consultations. */
export interface CertificatSupervisionVue extends CertificatAdminVue {
  consultations: ConsultationsResume;
}

/** Un événement de l'historique d'un certificat (audit, liste blanche). */
export interface EvenementCertificat {
  horodatage: Date;
  action: string;
  resultat: string | null;
  acteur: { id: string; email: string; prenom: string | null; nom: string | null } | null;
  details: Record<string, unknown> | null;
}

/** Une consultation publique : date et verdict seulement (pas d'adresse IP). */
export interface ConsultationPublique {
  horodatage: Date;
  verdict: string | null;
}

/** Fiche détaillée d'un certificat (US-DASH-02, DS-16 P3). */
export interface FicheCertificat {
  certificat: CertificatSupervisionVue;
  consultations: ConsultationsResume & { valides: number; refusees: number };
  consultationsRecentes: ConsultationPublique[];
  historique: EvenementCertificat[];
}

/**
 * US-DASH-02 — Supervision des certificats (ADMINISTRATEUR).
 *
 * Lecture seule. Le nombre de consultations publiques n'est pas stocké : il
 * se compte dans le journal d'audit (`CERTIFICAT_VERIFIE`, une ligne par
 * vérification, cible = identifiant du certificat), en une requête groupée
 * pour toute la page (index `IDX_audit_logs_cible`). La fiche ajoute
 * l'historique (les autres actions d'audit visant le certificat, acteur joint
 * en liste blanche) et les dernières consultations (date, verdict — jamais
 * l'adresse IP du visiteur : données minimales).
 */
@Injectable()
export class SupervisionCertificatsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly certificatsService: CertificatsService,
  ) {}

  async lister(statut?: StatutCertificat, recherche?: string): Promise<CertificatSupervisionVue[]> {
    const vues = await this.certificatsService.lister(statut, recherche?.trim() || undefined);
    return this.enrichir(vues);
  }

  /** Ajoute le compteur de consultations à des vues (une seule requête). */
  async enrichir(vues: CertificatAdminVue[]): Promise<CertificatSupervisionVue[]> {
    if (vues.length === 0) return [];
    const lignes = (await this.dataSource.query(
      `SELECT cible, count(*)::int AS total, max(horodatage) AS derniere
         FROM audit_logs
        WHERE action = $1 AND cible = ANY($2::varchar[])
        GROUP BY cible`,
      [ACTION_VERIFICATION, vues.map((v) => v.id)],
    )) as Array<{ cible: string; total: number; derniere: Date }>;
    const parCible = new Map(lignes.map((l) => [l.cible, l]));
    return vues.map((v) => {
      const l = parCible.get(v.id);
      return {
        ...v,
        consultations: { total: l?.total ?? 0, derniere: l?.derniere ?? null },
      };
    });
  }

  async enrichirUne(vue: CertificatAdminVue): Promise<CertificatSupervisionVue> {
    const [enrichie] = await this.enrichir([vue]);
    return enrichie;
  }

  /** Fiche détaillée ; 404 si le certificat n'existe pas. */
  async fiche(certificatId: string): Promise<FicheCertificat> {
    const vue = await this.certificatsService.vueAdminOu404(certificatId);
    const [resume] = (await this.dataSource.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE resultat = 'Succès')::int AS valides,
              max(horodatage) AS derniere
         FROM audit_logs
        WHERE action = $1 AND cible = $2`,
      [ACTION_VERIFICATION, certificatId],
    )) as Array<{ total: number; valides: number; derniere: Date | null }>;
    const recentes = (await this.dataSource.query(
      `SELECT horodatage, details_avant_apres ->> 'verdict' AS verdict
         FROM audit_logs
        WHERE action = $1 AND cible = $2
        ORDER BY horodatage DESC, id DESC
        LIMIT $3`,
      [ACTION_VERIFICATION, certificatId, NB_CONSULTATIONS_RECENTES],
    )) as Array<{ horodatage: Date; verdict: string | null }>;
    const evenements = (await this.dataSource.query(
      `SELECT a.horodatage, a.action, a.resultat, a.details_avant_apres AS details,
              a.user_id, u.email, u.prenom, u.nom
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.cible = $1 AND a.action <> $2
        ORDER BY a.horodatage ASC, a.id ASC
        LIMIT $3`,
      [certificatId, ACTION_VERIFICATION, MAX_HISTORIQUE],
    )) as Array<{
      horodatage: Date;
      action: string;
      resultat: string | null;
      details: Record<string, unknown> | null;
      user_id: string | null;
      email: string | null;
      prenom: string | null;
      nom: string | null;
    }>;
    return {
      certificat: {
        ...vue,
        consultations: { total: resume.total, derniere: resume.derniere },
      },
      consultations: {
        total: resume.total,
        valides: resume.valides,
        refusees: resume.total - resume.valides,
        derniere: resume.derniere,
      },
      consultationsRecentes: recentes.map((r) => ({
        horodatage: r.horodatage,
        verdict: r.verdict,
      })),
      historique: evenements.map((e) => ({
        horodatage: e.horodatage,
        action: e.action,
        resultat: e.resultat,
        acteur:
          e.user_id && e.email
            ? { id: e.user_id, email: e.email, prenom: e.prenom, nom: e.nom }
            : null,
        details: e.details,
      })),
    };
  }
}
