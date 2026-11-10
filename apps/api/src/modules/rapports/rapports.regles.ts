import { FormatRapport } from '../../database/enums/rapport.enum';
import { DonneesModule, EvaluationModule } from './rapport-session';

/**
 * Règles PURES des rapports exportés (US-RPT-01) : limite de demandes,
 * clé de stockage, type MIME, assemblage du rapport par module.
 */

/** Au plus 5 demandes par demandeur sur une minute glissante (429 au-delà). */
export const LIMITE_DEMANDES_PAR_MINUTE = 5;

/** Vrai si une nouvelle demande dépasserait la limite. */
export function limiteAtteinte(demandesDerniereMinute: number): boolean {
  return demandesDerniereMinute >= LIMITE_DEMANDES_PAR_MINUTE;
}

/** Clé de l'objet dans le stockage : préfixe propre aux rapports. */
export function cleStockageRapport(rapportId: string, nomFichier: string): string {
  return `rapports/${rapportId}/${nomFichier}`;
}

/** Type MIME servi au téléchargement. */
export function typeMime(format: FormatRapport): string {
  return format === FormatRapport.PDF ? 'application/pdf' : 'text/csv; charset=utf-8';
}

/** Un inscrit, dans l'ordre du rapport. */
export interface InscritModule {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  statut: string;
}

/** Meilleure note d'un apprenant pour une évaluation. */
export interface NoteEvaluation {
  apprenantId: string;
  evaluationId: string;
  note: number;
}

/**
 * Rapport par module : une ligne par inscrit (ordre conservé), une colonne
 * par évaluation publiée (ordre conservé), meilleure note ou null.
 */
export function assemblerModule(
  module: DonneesModule['module'],
  evaluations: EvaluationModule[],
  inscrits: InscritModule[],
  notes: NoteEvaluation[],
): DonneesModule {
  const index = new Map<string, number>();
  for (const n of notes) {
    const cle = `${n.apprenantId}|${n.evaluationId}`;
    const actuelle = index.get(cle);
    if (actuelle === undefined || n.note > actuelle) index.set(cle, n.note);
  }
  return {
    module,
    evaluations,
    lignes: inscrits.map((i) => ({
      prenom: i.prenom,
      nom: i.nom,
      email: i.email,
      statutInscription: i.statut,
      notes: evaluations.map((e) => index.get(`${i.id}|${e.id}`) ?? null),
    })),
  };
}
