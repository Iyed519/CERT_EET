import type {
  AffichageResultats,
  AvancementModule,
  AvancementQcm,
  EtatDepot,
  EtatFenetre,
  MotifRevocation,
  NiveauDifficulte,
  NiveauGeneration,
  RaisonCorrection,
  StatutAtelier,
  StatutCertificat,
  StatutGeneration,
  StatutInscription,
  StatutLivrable,
  StatutQcm,
  StatutSupport,
  StatutTentative,
  TypeGenerable,
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
  EXPIRE: 'Expiré',
};

/** US-DASH-02 — Verdict d'une vérification publique. */
export const LIBELLES_VERDICT: Record<string, string> = {
  VALIDE: 'Valide',
  REVOQUE: 'Révoqué',
  EXPIRE: 'Expiré',
  INTEGRITE_COMPROMISE: 'Intégrité compromise',
};

/** US-DASH-02 — Actions d'audit du cycle de vie d'un certificat. */
export const LIBELLES_ACTION_CERTIFICAT: Record<string, string> = {
  CERTIFICAT_DEMANDE: 'Émission demandée',
  CERTIFICATION_DECLENCHEE: 'Certification déclenchée',
  CERTIFICAT_EMIS: 'Certificat émis',
  CERTIFICAT_ECHEC: 'Échec de génération',
  CERTIFICAT_RELANCE: 'Génération relancée',
  CERTIFICAT_TELECHARGE: 'PDF téléchargé par le titulaire',
  CERTIFICAT_REVOCATION_REFUSEE: 'Révocation refusée (mot de passe)',
  CERTIFICAT_REVOQUE: 'Certificat révoqué',
  CERTIFICAT_EXPIRE: 'Certificat expiré',
  CERTIFICAT_REPRIS: 'Génération reprise automatiquement',
};

/** US-DASH-02 — « 3 consultations publiques », « aucune consultation ». */
export const consultationsFr = (total: number): string =>
  total === 0
    ? 'Aucune consultation publique'
    : `${total} consultation${total > 1 ? 's' : ''} publique${total > 1 ? 's' : ''}`;

/** Motif d'une révocation (US-CERT-06) — mêmes libellés que l'email. */
export const LIBELLES_MOTIF_REVOCATION: Record<MotifRevocation, string> = {
  FRAUDE: 'Fraude avérée',
  ERREUR_ADMIN: 'Erreur administrative',
  DISCIPLINAIRE: 'Décision disciplinaire',
  JUDICIAIRE: 'Décision judiciaire',
};

/** Libellés FR du statut d'un support pédagogique (US-IA-01). */
export const LIBELLES_STATUT_SUPPORT: Record<StatutSupport, string> = {
  EN_INDEXATION: 'Indexation…',
  INDEXE: 'Indexé',
  ECHEC_INDEXATION: 'Échec',
};

/** Libellés FR d'une génération IA (US-IA-02). */
export const LIBELLES_STATUT_GENERATION: Record<StatutGeneration, string> = {
  EN_COURS: 'En cours…',
  TERMINEE: 'Terminée',
  ECHEC: 'Échec',
};
export const LIBELLES_TYPE_GENERABLE: Record<TypeGenerable, string> = {
  QCU: 'QCU (une réponse)',
  QCM: 'QCM (plusieurs réponses)',
  VRAI_FAUX: 'Vrai / Faux',
};
export const LIBELLES_NIVEAU_GENERATION: Record<NiveauGeneration, string> = {
  DEBUTANT: 'Débutant',
  INTERMEDIAIRE: 'Intermédiaire',
  AVANCE: 'Avancé',
};

/** US-DASH-01 — Libellés des alertes système du tableau de bord global. */
export const LIBELLES_ALERTE_SYSTEME: Record<string, [string, string]> = {
  CERTIFICATS_BLOQUES: ['certificat(s) bloqué(s) après échec de génération', '/admin/certificats'],
  SUPPORTS_EN_ECHEC: ['support(s) pédagogique(s) en échec d’indexation', ''],
  GENERATIONS_EN_ECHEC: ['génération(s) IA en échec sur la période', ''],
  DEMANDES_ROLE_EN_ATTENTE: ['demande(s) de rôle en attente', '/admin/role-requests'],
  LIVRABLES_EN_ATTENTE: ['livrable(s) en attente de correction depuis plus de 7 jours', ''],
};

/** US-FORM-07 / US-FORM-08 — Statuts d'une demande d'un formateur. */
export const LIBELLES_STATUT_DEMANDE_FORMATEUR: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  ACCEPTEE: 'Acceptée',
  REFUSEE: 'Refusée',
  ANNULEE: 'Annulée',
  A_MODIFIER: 'À modifier',
};

/** Statut d'UNE formation (badge), au singulier. */
export const LIBELLES_STATUT_FORMATION_UN: Record<string, string> = {
  BROUILLON: 'Brouillon',
  OUVERTE: 'Ouverte',
  FERMEE: 'Fermée',
  ARCHIVEE: 'Archivée',
};

/** US-DASH-01 — Libellés courts des rôles et statuts agrégés. */
export const LIBELLES_ROLE: Record<string, string> = {
  APPRENANT: 'Apprenants',
  FORMATEUR: 'Formateurs',
  ADMINISTRATEUR: 'Administrateurs',
};
export const LIBELLES_STATUT_FORMATION_COURT: Record<string, string> = {
  BROUILLON: 'Brouillons',
  OUVERTE: 'Ouvertes',
  FERMEE: 'Fermées',
  ARCHIVEE: 'Archivées',
};
export const LIBELLES_STATUT_INSCRIPTION_COURT: Record<string, string> = {
  EN_COURS: 'En cours',
  TERMINEE: 'Terminées',
  SUSPENDUE: 'Suspendues',
};

/** US-SUIVI-02 — Critère d'une alerte de décrochage. */
export const LIBELLES_CRITERE_ALERTE: Record<string, string> = {
  INACTIVITE: 'Inactivité',
  ECHECS_QCM: 'Échecs QCM consécutifs',
  LIVRABLE_EN_RETARD: 'Livrable en retard',
  SCORE_EN_CHUTE: 'Note en chute',
};

/** US-SUIVI-02 — Les faits d'une alerte, en une phrase. */
export function faitsAlerteFr(critere: string, d: Record<string, unknown>): string {
  switch (critere) {
    case 'INACTIVITE':
      return `Aucune connexion depuis ${String(d.joursSansConnexion)} jours.`;
    case 'ECHECS_QCM': {
      const t = (d.tentatives as Array<{ titre: string; note: number }> | undefined) ?? [];
      return `Deux échecs : ${t.map((x) => `${x.titre} (${x.note} / 100)`).join(', ')}.`;
    }
    case 'LIVRABLE_EN_RETARD': {
      const a = (d.ateliers as Array<{ titre: string }> | undefined) ?? [];
      return `Non rendu plus de 48 h après la date limite : ${a.map((x) => x.titre).join(', ')}.`;
    }
    case 'SCORE_EN_CHUTE': {
      const der = d.derniere as { titre: string; note: number } | undefined;
      return `Dernière note ${der ? `${der.note} / 100 (${der.titre})` : ''}, contre ${String(d.moyennePrecedentes)} de moyenne auparavant.`;
    }
    default:
      return '';
  }
}

/** Durée effective d'une tentative : « 4 min 05 s », « 35 s » ; « — » si inconnue (US-QCM-11). */
export const dureeSecondesFr = (secondes: number | null): string => {
  if (secondes === null) return '—';
  const min = Math.floor(secondes / 60);
  const s = secondes % 60;
  return min === 0 ? `${s} s` : `${min} min ${String(s).padStart(2, '0')} s`;
};
