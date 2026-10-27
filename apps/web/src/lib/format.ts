import type {
  AffichageResultats,
  AvancementModule,
  AvancementQcm,
  EtatFenetre,
  NiveauDifficulte,
  StatutInscription,
  StatutQcm,
  StatutTentative,
  TypeQuestion,
} from './api';

/** AAAA-MM-JJ -> JJ/MM/AAAA, sans passer par Date (pas de décalage horaire). */
export const dateFr = (iso: string | null): string => {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
};

/** Horodatage ISO -> JJ/MM/AAAA (date locale du navigateur). */
export const jourFr = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR');

/** Période d'une formation, ou null si aucune date n'est fixée. */
export const periodeFr = (dateDebut: string | null, dateFin: string | null): string | null =>
  dateDebut || dateFin ? `${dateFr(dateDebut)} → ${dateFr(dateFin)}` : null;

/** Libellés FR des statuts d'inscription (US-INSC-01). */
export const LIBELLES_INSCRIPTION: Record<StatutInscription, string> = {
  EN_COURS: 'Inscrit',
  TERMINEE: 'Terminée',
  SUSPENDUE: 'Suspendue',
};

/** Libellés FR de l'avancement d'un QCM (US-INSC-04). */
export const LIBELLES_AVANCEMENT_QCM: Record<AvancementQcm, string> = {
  A_FAIRE: 'À faire',
  EN_COURS: 'En cours',
  REUSSI: 'Réussi',
  ECHOUE: 'Échoué',
};

/** Libellés FR de l'avancement d'un module (US-INSC-04). */
export const LIBELLES_AVANCEMENT_MODULE: Record<AvancementModule, string> = {
  SANS_EVALUATION: 'Sans évaluation',
  A_FAIRE: 'À faire',
  COMPLETE: 'Complété',
};

/** Libellés FR des statuts d'un QCM (US-QCM-01). */
export const LIBELLES_STATUT_QCM: Record<StatutQcm, string> = {
  BROUILLON: 'Brouillon',
  NON_PUBLIE: 'Non publié',
  PUBLIE: 'Publié',
};

/** Libellés FR des types de questions (US-QCM-01). */
export const LIBELLES_TYPE_QUESTION: Record<TypeQuestion, string> = {
  QCU: 'Choix unique',
  QCM: 'Choix multiple',
  VRAI_FAUX: 'Vrai / Faux',
};

/** Libellés FR des niveaux de difficulté (US-QCM-01). */
export const LIBELLES_NIVEAU: Record<NiveauDifficulte, string> = {
  DEBUTANT: 'Débutant',
  INTERMEDIAIRE: 'Intermédiaire',
  AVANCE: 'Avancé',
};

/** Libellés FR de l'affichage du résultat (US-QCM-03). */
export const LIBELLES_AFFICHAGE: Record<AffichageResultats, string> = {
  IMMEDIAT: 'Immédiat (score, corrigé et explications à la soumission)',
  DIFFERE: 'Différé (score seul ; corrigé après la fermeture)',
};

/** Horodatage ISO -> « JJ/MM/AAAA HH:MM » (heure locale du navigateur). */
export const dateHeureFr = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Horodatage ISO -> valeur d'un <input type="datetime-local"> (heure locale). */
export const versSaisieLocale = (iso: string): string => {
  const d = new Date(iso);
  const deux = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
};

/** Valeur d'un <input type="datetime-local"> (heure locale) -> ISO 8601 en UTC. */
export const depuisSaisieLocale = (valeur: string): string => new Date(valeur).toISOString();

/**
 * Fenêtre d'un QCM publié, en une phrase pour l'apprenant (US-QCM-04).
 * L'état vient du serveur ; les dates s'affichent en heure locale.
 */
export const fenetreQcmFr = (
  fenetre: EtatFenetre,
  dateOuverture: string,
  dateFermeture: string,
): string => {
  switch (fenetre) {
    case 'A_VENIR':
      return `Ouvre le ${dateHeureFr(dateOuverture)} · jusqu’au ${dateHeureFr(dateFermeture)}`;
    case 'OUVERTE':
      return `Ouvert jusqu’au ${dateHeureFr(dateFermeture)}`;
    case 'FERMEE':
      return `Fermé depuis le ${dateHeureFr(dateFermeture)}`;
  }
};

export const LIBELLES_FENETRE: Record<EtatFenetre, string> = {
  A_VENIR: 'À venir',
  OUVERTE: 'Ouvert',
  FERMEE: 'Fermé',
};

/** Durée en minutes -> « 45 min », « 1 h », « 1 h 30 » (US-QCM-05). */
export const dureeFr = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
};

/** Millisecondes restantes -> « 29:59 » ou « 1:05:09 » ; jamais négatif. */
export const compteAReboursFr = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const deux = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${deux(m)}:${deux(s)}`;
};

/** Libellés FR des statuts d'une tentative (US-QCM-05). */
export const LIBELLES_TENTATIVE: Record<StatutTentative, string> = {
  EN_COURS: 'En cours',
  SOUMISE: 'Soumise',
  ABANDONNEE_TIMER: 'Temps écoulé',
  NOTEE: 'Notée',
};
