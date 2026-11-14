/**
 * US-UX-01 — Libellés humains de l'interface (dictionnaire web, aucune API changée).
 *
 * - Actions du journal d'audit : « Connexion », « Compte activé »… au lieu du
 *   code brut (`LOGIN`, `COMPTE_ACTIVE`), avec leur catégorie (connexions,
 *   comptes, formations, évaluations, certificats, IA, sécurité) pour les
 *   filtres et les icônes.
 * - Statuts : libellé français et ton de pastille (succès, attention, danger,
 *   info, neutre, brouillon) — couleur + icône + texte, jamais la couleur seule.
 *
 * Module sans import : testé directement par `node --test`
 * (`npm run test:unitaires`, Node 22+).
 */

export const LIBELLES_ACTION_AUDIT: Record<string, string> = {
  // Connexions et session
  LOGIN: 'Connexion',
  LOGOUT: 'Déconnexion',
  CONNEXION_OAUTH: 'Connexion par Google ou GitHub',
  SESSION_MULTIPLE_REFUSEE: 'Seconde session refusée',
  // Comptes
  COMPTE_CREE: 'Compte créé',
  COMPTE_ACTIVE: 'Compte activé',
  COMPTE_DESACTIVE: 'Compte désactivé',
  COMPTE_REACTIVE: 'Compte réactivé',
  COMPTE_ANONYMISE: 'Compte anonymisé',
  COMPTES_IMPORTES: 'Comptes importés',
  ACTIVATION_RENVOYEE: 'Lien d’activation renvoyé',
  EMAIL_VERIFIE: 'Adresse e-mail vérifiée',
  PROFIL_COMPLETE: 'Profil complété',
  ROLE_CHANGE: 'Rôle modifié',
  DEMANDE_ROLE_TRAITEE: 'Demande de rôle traitée',
  // Sécurité
  MDP_CHANGE: 'Mot de passe changé',
  MDP_RESET: 'Mot de passe réinitialisé',
  MDP_RESET_DEMANDE: 'Réinitialisation du mot de passe demandée',
  MFA_ACTIVEE: 'Double authentification activée',
  MFA_DESACTIVEE: 'Double authentification désactivée',
  ACCES_RESSOURCE_REFUSE: 'Accès refusé',
  LIMITE_REQUETES_ATTEINTE: 'Limite de requêtes atteinte',
  VERIFICATION_LIMITE_ATTEINTE: 'Limite de vérifications atteinte',
  AUDIT_CONSULTE: 'Journal d’audit consulté',
  AUDIT_EXPORTE: 'Journal d’audit exporté',
  // Formations
  FORMATION_CREEE: 'Formation créée',
  FORMATION_MODIFIEE: 'Formation modifiée',
  MODULE_CREE: 'Module créé',
  MODULE_MODIFIE: 'Module modifié',
  MODULE_SUPPRIME: 'Module supprimé',
  MODULES_REORDONNES: 'Modules réordonnés',
  RESSOURCE_AJOUTEE: 'Ressource ajoutée',
  RESSOURCE_MODIFIEE: 'Ressource modifiée',
  RESSOURCE_SUPPRIMEE: 'Ressource supprimée',
  RESSOURCES_REORDONNEES: 'Ressources réordonnées',
  FORMATEUR_AFFECTE: 'Formateur affecté',
  FORMATEUR_RETIRE: 'Formateur retiré',
  DEMANDE_AFFECTATION_CREEE: 'Demande d’affectation envoyée',
  DEMANDE_AFFECTATION_ACCEPTEE: 'Demande d’affectation acceptée',
  DEMANDE_AFFECTATION_REFUSEE: 'Demande d’affectation refusée',
  DEMANDE_AFFECTATION_ANNULEE: 'Demande d’affectation annulée',
  PROPOSITION_FORMATION_CREEE: 'Proposition de formation envoyée',
  PROPOSITION_FORMATION_RESOUMISE: 'Proposition de formation renvoyée',
  INSCRIPTION_CREEE: 'Inscription',
  INSCRIPTION_AJOUTEE: 'Inscription ajoutée',
  INSCRIPTIONS_IMPORTEES: 'Inscriptions importées',
  INSCRIPTION_DESINSCRITE: 'Désinscription',
  INSCRIPTION_SUSPENDUE: 'Inscription suspendue',
  INSCRIPTION_REACTIVEE: 'Inscription réactivée',
  ALERTE_DECROCHAGE_CREEE: 'Alerte de décrochage',
  ALERTE_TRAITEE: 'Alerte traitée',
  ALERTE_ROUVERTE: 'Alerte rouverte',
  ALERTES_BALAYAGE_DECLENCHE: 'Recherche des décrochages lancée',
  FEEDBACK_CONSULTE: 'Retours consultés',
  // Évaluations
  QCM_CREE: 'QCM créé',
  QCM_MODIFIE: 'QCM modifié',
  QCM_CONFIGURE: 'QCM paramétré',
  QCM_PUBLIE: 'QCM publié',
  QCM_SUPPRIME: 'QCM supprimé',
  QCM_SOUMIS: 'QCM rendu',
  QUESTION_AJOUTEE: 'Question ajoutée',
  QUESTION_MODIFIEE: 'Question modifiée',
  QUESTION_SUPPRIMEE: 'Question supprimée',
  QUESTIONS_REORDONNEES: 'Questions réordonnées',
  QUESTIONS_IMPORTEES: 'Questions importées',
  TENTATIVE_DEMARREE: 'Tentative commencée',
  TENTATIVE_NOTEE: 'Tentative notée',
  TENTATIVE_EXPIREE: 'Tentative expirée',
  RAPPORT_QCM_TELECHARGE: 'Rapport de tentative téléchargé',
  ATELIER_CREE: 'Atelier créé',
  ATELIER_MODIFIE: 'Atelier modifié',
  ATELIER_PUBLIE: 'Atelier publié',
  ATELIER_SUPPRIME: 'Atelier supprimé',
  LIVRABLE_SOUMIS: 'Livrable déposé',
  LIVRABLE_REMPLACE: 'Livrable remplacé',
  LIVRABLE_FICHIER_TELECHARGE: 'Fichier de livrable téléchargé',
  CORRECTION_OUVERTE: 'Correction commencée',
  CORRECTION_FINALISEE: 'Correction terminée',
  NOTE_CRITERE_ENREGISTREE: 'Note d’un critère enregistrée',
  GRILLE_CRITERE_AJOUTE: 'Critère ajouté à la grille',
  GRILLE_CRITERE_MODIFIE: 'Critère de la grille modifié',
  GRILLE_CRITERE_SUPPRIME: 'Critère retiré de la grille',
  GRILLE_CRITERES_REORDONNES: 'Critères de la grille réordonnés',
  GRILLE_VALIDEE: 'Grille validée',
  GRILLE_MODELE_ENREGISTRE: 'Modèle de grille enregistré',
  GRILLE_MODELE_COPIE: 'Modèle de grille réutilisé',
  GRILLE_MODELE_SUPPRIME: 'Modèle de grille supprimé',
  CONSENTEMENT_SURVEILLANCE: 'Surveillance acceptée',
  SURVEILLANCE_REFUSEE: 'Surveillance refusée',
  SURVEILLANCE_ALERTE: 'Alerte de surveillance',
  ALERTE_SURVEILLANCE_EXAMINEE: 'Alerte de surveillance examinée',
  ALERTES_SURVEILLANCE_CONSULTEES: 'Alertes de surveillance consultées',
  CAPTURES_CONSULTEES: 'Photos de surveillance consultées',
  CAPTURES_PURGEES: 'Photos de surveillance supprimées',
  // Certificats
  CERTIFICAT_DEMANDE: 'Émission demandée',
  CERTIFICATION_DECLENCHEE: 'Certification déclenchée',
  CERTIFICATION_FORMATION_EVALUEE: 'Certification évaluée',
  CERTIFICAT_EMIS: 'Certificat émis',
  CERTIFICAT_ECHEC: 'Échec de génération du certificat',
  CERTIFICAT_RELANCE: 'Génération relancée',
  CERTIFICAT_REPRIS: 'Génération reprise automatiquement',
  CERTIFICAT_REEMIS: 'Certificat réémis',
  CERTIFICAT_TELECHARGE: 'Certificat téléchargé',
  CERTIFICAT_VERIFIE: 'Certificat vérifié',
  CERTIFICAT_REVOQUE: 'Certificat révoqué',
  CERTIFICAT_REVOCATION_REFUSEE: 'Révocation refusée (mot de passe)',
  CERTIFICAT_EXPIRE: 'Certificat expiré',
  CERTIFICAT_PDF_CONSULTE_ADMIN: 'PDF consulté par un administrateur',
  // IA
  GENERATION_IA_LANCEE: 'Génération IA lancée',
  GENERATION_IA_TERMINEE: 'Génération IA terminée',
  GENERATION_IA_ECHEC: 'Échec de la génération IA',
  SUGGESTION_REJETEE: 'Suggestion de l’IA écartée',
  QUESTIONS_EXTRACTION_LANCEE: 'Extraction de questions lancée',
  QUESTIONS_EXTRACTION_RELANCEE: 'Extraction de questions relancée',
  QUESTIONS_EXTRACTION_TERMINEE: 'Extraction de questions terminée',
  QUESTIONS_EXTRACTION_ECHEC: 'Échec de l’extraction de questions',
  QUESTION_EXTRAITE_ACCEPTEE: 'Question extraite acceptée',
  QUESTION_EXTRAITE_REJETEE: 'Question extraite écartée',
  SUPPORT_DEPOSE: 'Support pour l’IA déposé',
  SUPPORT_INDEXE: 'Support indexé',
  SUPPORT_REINDEXATION: 'Support réindexé',
  SUPPORT_ECHEC_INDEXATION: 'Échec de l’indexation d’un support',
  SUPPORT_SUPPRIME: 'Support supprimé',
  // Rapports
  RAPPORT_DEMANDE: 'Rapport demandé',
  RAPPORT_GENERE: 'Rapport généré',
  RAPPORT_ECHEC: 'Échec du rapport',
  RAPPORT_TELECHARGE: 'Rapport téléchargé',
};

const SIGLES = new Set(['QCM', 'IA', 'PDF', 'MFA', 'OAUTH', 'CSV', 'URL', 'API']);

/** Libellé humain d'une action d'audit ; repli lisible pour un code inconnu (« NOUVEAU_CODE » → « Nouveau code »). */
export function libelleActionAudit(code: string | null | undefined): string {
  if (!code) return '—';
  const connu = LIBELLES_ACTION_AUDIT[code];
  if (connu) return connu;
  const mots = code
    .split('_')
    .filter((m) => m.length > 0)
    .map((m) => (SIGLES.has(m) ? m : m.toLowerCase()));
  if (mots.length === 0) return code;
  const premier = mots[0];
  mots[0] = SIGLES.has(premier) ? premier : premier.charAt(0).toUpperCase() + premier.slice(1);
  return mots.join(' ');
}

export type CategorieAudit =
  | 'connexions'
  | 'comptes'
  | 'formations'
  | 'evaluations'
  | 'certificats'
  | 'ia'
  | 'securite';

export const LIBELLES_CATEGORIE_AUDIT: Record<CategorieAudit, string> = {
  connexions: 'Connexions',
  comptes: 'Comptes',
  formations: 'Formations',
  evaluations: 'Évaluations',
  certificats: 'Certificats',
  ia: 'IA',
  securite: 'Sécurité',
};

/** Nom d'icône (composant `Icone`) de chaque catégorie. */
export const ICONE_CATEGORIE_AUDIT: Record<CategorieAudit, string> = {
  connexions: 'connexion',
  comptes: 'utilisateurs',
  formations: 'formation',
  evaluations: 'qcm',
  certificats: 'certificat',
  ia: 'ia',
  securite: 'securite',
};

const REGLES_CATEGORIE: Array<[RegExp, CategorieAudit]> = [
  [/^(LOGIN|LOGOUT|CONNEXION_|SESSION_)/, 'connexions'],
  [/^(MDP_|MFA_|ACCES_|LIMITE_|VERIFICATION_LIMITE|AUDIT_)/, 'securite'],
  [/^(GENERATION_IA|SUGGESTION_|QUESTIONS?_EXTRA|SUPPORT_)/, 'ia'],
  [/^CERTIFICA/, 'certificats'],
  [/^(COMPTE|ACTIVATION_|EMAIL_|PROFIL_|ROLE_|DEMANDE_ROLE)/, 'comptes'],
  [
    /^(QCM_|QUESTION|TENTATIVE_|RAPPORT_QCM|ATELIER_|LIVRABLE_|CORRECTION_|NOTE_|GRILLE_|CONSENTEMENT_|SURVEILLANCE_|ALERTES?_SURVEILLANCE|CAPTURES_)/,
    'evaluations',
  ],
  [/^(FORMATION|MODULE|RESSOURCE|FORMATEUR_|DEMANDE_AFFECTATION|PROPOSITION_|INSCRIPTION|ALERTE|FEEDBACK|RAPPORT_)/, 'formations'],
];

/** Catégorie d'une action d'audit (filtre et icône du journal) ; « securite » par défaut. */
export function categorieAudit(code: string | null | undefined): CategorieAudit {
  if (!code) return 'securite';
  for (const [regle, categorie] of REGLES_CATEGORIE) if (regle.test(code)) return categorie;
  return 'securite';
}

export type TonStatut = 'succes' | 'attention' | 'danger' | 'info' | 'neutre' | 'brouillon';

/**
 * Pastille par défaut d'un code de statut de l'API. Les pages qui ont un libellé
 * propre à leur contexte (par exemple `SOUMIS` = « À corriger » pour le formateur)
 * le passent explicitement ; le ton, lui, reste celui-ci.
 */
export const PASTILLES_STATUT: Record<string, { libelle: string; ton: TonStatut }> = {
  ACTIF: { libelle: 'Actif', ton: 'succes' },
  DESACTIVE: { libelle: 'Désactivé', ton: 'danger' },
  ANONYMISE: { libelle: 'Anonymisé', ton: 'neutre' },
  EN_ATTENTE_ACTIVATION: { libelle: 'En attente d’activation', ton: 'attention' },
  EN_ATTENTE: { libelle: 'En attente', ton: 'attention' },
  APPROUVEE: { libelle: 'Approuvée', ton: 'succes' },
  ACCEPTEE: { libelle: 'Acceptée', ton: 'succes' },
  REJETEE: { libelle: 'Rejetée', ton: 'danger' },
  REFUSEE: { libelle: 'Refusée', ton: 'danger' },
  ANNULEE: { libelle: 'Annulée', ton: 'neutre' },
  A_MODIFIER: { libelle: 'À modifier', ton: 'attention' },
  BROUILLON: { libelle: 'Brouillon', ton: 'brouillon' },
  NON_PUBLIE: { libelle: 'Non publié', ton: 'brouillon' },
  PUBLIE: { libelle: 'Publié', ton: 'succes' },
  ARCHIVE: { libelle: 'Archivé', ton: 'neutre' },
  OUVERTE: { libelle: 'Ouverte', ton: 'succes' },
  FERMEE: { libelle: 'Fermée', ton: 'neutre' },
  ARCHIVEE: { libelle: 'Archivée', ton: 'neutre' },
  A_VENIR: { libelle: 'À venir', ton: 'info' },
  EN_COURS: { libelle: 'En cours', ton: 'info' },
  TERMINEE: { libelle: 'Terminée', ton: 'succes' },
  SUSPENDUE: { libelle: 'Suspendue', ton: 'attention' },
  COMPLETE: { libelle: 'Complété', ton: 'succes' },
  SOUMIS: { libelle: 'Soumis', ton: 'attention' },
  SOUMISE: { libelle: 'Soumise', ton: 'info' },
  EN_CORRECTION: { libelle: 'En correction', ton: 'info' },
  NOTE: { libelle: 'Noté', ton: 'succes' },
  NOTEE: { libelle: 'Notée', ton: 'succes' },
  REUSSI: { libelle: 'Réussi', ton: 'succes' },
  ECHOUE: { libelle: 'Échoué', ton: 'danger' },
  A_FAIRE: { libelle: 'À faire', ton: 'neutre' },
  REVOQUE: { libelle: 'Révoqué', ton: 'danger' },
  EXPIRE: { libelle: 'Expiré', ton: 'neutre' },
  EN_ATTENTE_GENERATION: { libelle: 'En attente', ton: 'attention' },
  EN_GENERATION: { libelle: 'En génération', ton: 'info' },
  ECHEC: { libelle: 'Échec', ton: 'danger' },
  SUCCES: { libelle: 'Succès', ton: 'succes' },
  INDEXE: { libelle: 'Indexé', ton: 'succes' },
  EN_INDEXATION: { libelle: 'Indexation…', ton: 'info' },
  ECHEC_INDEXATION: { libelle: 'Échec', ton: 'danger' },
  NOUVEAU: { libelle: 'À examiner', ton: 'danger' },
  EXAMINE: { libelle: 'Examinée', ton: 'neutre' },
  TRAITEE: { libelle: 'Traitée', ton: 'succes' },
  ABANDONNEE_TIMER: { libelle: 'Temps écoulé', ton: 'attention' },
};

/** Libellé et ton d'un statut ; code inconnu → libellé lisible et ton neutre. */
export function pastilleDuStatut(code: string): { libelle: string; ton: TonStatut } {
  return PASTILLES_STATUT[code] ?? { libelle: libelleActionAudit(code), ton: 'neutre' };
}

/** Acteur d'une entrée d'audit : son e-mail, ou « Système » quand aucun compte n'agit. */
export function libelleActeur(email: string | null | undefined): string {
  return email && email.trim() ? email : 'Système';
}
