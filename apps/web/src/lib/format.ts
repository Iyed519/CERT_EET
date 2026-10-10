import type { AvancementModule, AvancementQcm, StatutInscription } from './api';

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
