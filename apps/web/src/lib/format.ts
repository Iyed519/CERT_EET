import type {
  AffichageResultats,
  AvancementModule,
  AvancementQcm,
  EtatDepot,
  EtatFenetre,
  NiveauDifficulte,
  RaisonCorrection,
  StatutAtelier,
  StatutCertificat,
  StatutInscription,
  StatutLivrable,
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

/** Libellés FR des statuts d'un atelier (US-ATEL-01). */
export const LIBELLES_STATUT_ATELIER: Record<StatutAtelier, string> = {
  BROUILLON: 'Brouillon',
  PUBLIE: 'Publié',
  ARCHIVE: 'Archivé',
};

/** Libellés FR des types de questions (US-QCM-01). */
export const LIBELLES_TYPE_QUESTION: Record<TypeQuestion, string> = {
  QCU: 'Choix unique',
  QCM: 'Choix multiple',
  VRAI_FAUX: 'Vrai / Faux',
};

/** Consigne affichée à l'apprenant sous chaque question (US-QCM-06). */
export const CONSIGNES_TYPE_QUESTION: Record<TypeQuestion, string> = {
  QCU: 'Une seule bonne réponse',
  QCM: 'Plusieurs réponses possibles',
  VRAI_FAUX: 'Vrai ou faux',
};

/** Libellés FR des niveaux de difficulté (US-QCM-01). */
export const LIBELLES_NIVEAU: Record<NiveauDifficulte, string> = {
  DEBUTANT: 'Débutant',
  INTERMEDIAIRE: 'Intermédiaire',
  AVANCE: 'Avancé',
};

/** Libellés FR de l'affichage du résultat (US-QCM-03). */
export const LIBELLES_AFFICHAGE: Record<AffichageResultats, string> = {
  // US-QCM-09 (D4) : avec plusieurs tentatives permises, le corrigé attend la dernière.
  IMMEDIAT:
    'Immédiat (score à la soumission ; corrigé et explications après la dernière tentative)',
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

/** « 1 question sans réponse », « 3 questions sans réponse » (US-QCM-07). */
export const sansReponseFr = (n: number): string =>
  `${n} question${n > 1 ? 's' : ''} sans réponse`;

/** Score d'une tentative : « 40 % », « 33,33 % » (US-QCM-08). */
export const scoreFr = (score: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(score)} %`;

/** Points d'une question : « 1 / 2 pts », « 0 / 1 pt », « 1,5 / 3 pts » (US-QCM-09). */
export const pointsFr = (obtenus: number, ponderation: number): string => {
  const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const unite = ponderation > 1 ? 'pts' : 'pt';
  return `${nombre.format(obtenus)} / ${nombre.format(ponderation)} ${unite}`;
};

/**
 * Pourquoi le corrigé n'est pas encore visible, en une phrase (US-QCM-09).
 * Null quand il n'y a rien à dire (tentative pas encore notée).
 */
export const attenteCorrigeFr = (
  raison: RaisonCorrection | null,
  disponibleLe: string | null,
): string | null => {
  const date = disponibleLe ? dateHeureFr(disponibleLe) : null;
  if (raison === 'correction_differee') {
    return date
      ? `Le corrigé sera disponible le ${date}, après la fermeture du QCM.`
      : 'Le corrigé sera disponible après la fermeture du QCM.';
  }
  if (raison === 'tentatives_restantes') {
    return date
      ? `Le corrigé sera disponible après votre dernière tentative, ou au plus tard le ${date}.`
      : 'Le corrigé sera disponible après votre dernière tentative.';
  }
  return null;
};

/** Libellés FR de l'état du dépôt d'un atelier publié (US-ATEL-03). */
export const LIBELLES_ETAT_DEPOT: Record<EtatDepot, string> = {
  OUVERT: 'Dépôt ouvert',
  EN_RETARD: 'Tolérance de retard',
  CLOS: 'Dépôt clos',
};

/**
 * Date limite d'un atelier en une phrase pour l'apprenant (US-ATEL-03).
 * L'état vient du serveur ; la fin de tolérance se déduit de la date limite.
 */
export const echeanceAtelierFr = (
  etat: EtatDepot,
  dateLimite: string,
  toleranceRetardHeures: number,
): string => {
  const finTolerance = new Date(
    new Date(dateLimite).getTime() + toleranceRetardHeures * 3_600_000,
  ).toISOString();
  switch (etat) {
    case 'OUVERT':
      return `À rendre avant le ${dateHeureFr(dateLimite)}`;
    case 'EN_RETARD':
      return `Date limite dépassée : dépôt accepté en retard jusqu’au ${dateHeureFr(finTolerance)}`;
    case 'CLOS':
      return `Dépôt clos depuis le ${dateHeureFr(toleranceRetardHeures > 0 ? finTolerance : dateLimite)}`;
  }
};

/** Taille en octets -> « 820 o », « 12,4 Ko », « 3,1 Mo » (US-ATEL-04). */
export const tailleFr = (octets: number): string => {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
};

/** Libellés courts du statut de mon livrable, pour « Mon espace » (US-ATEL-04). */
export const LIBELLES_LIVRABLE_COURT: Record<StatutLivrable, string> = {
  SOUMIS: 'Livrable soumis',
  EN_CORRECTION: 'En correction',
  NOTE: 'Noté',
};

/** Libellés du statut d'un livrable côté formateur (US-ATEL-06). */
export const LIBELLES_LIVRABLE_FORMATEUR: Record<StatutLivrable, string> = {
  SOUMIS: 'À corriger',
  EN_CORRECTION: 'En correction',
  NOTE: 'Noté',
};

/** Nombre décimal à la française, deux décimales au plus (« 62,5 ») — US-ATEL-06. */
export const nombreFr = (valeur: number): string =>
  valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/** « Sami Ben Ali », ou l'email à défaut de nom (US-ATEL-06). */
export const nomApprenantFr = (a: { prenom: string | null; nom: string | null; email: string }): string =>
  [a.prenom, a.nom].filter(Boolean).join(' ') || a.email;

/** Statut d'un certificat, pour l'administrateur (US-CERT-01). */
export const LIBELLES_STATUT_CERTIFICAT: Record<StatutCertificat, string> = {
  EN_ATTENTE_GENERATION: 'En attente',
  EN_GENERATION: 'En génération',
  ACTIF: 'Émis',
  REVOQUE: 'Révoqué',
};
