# Inventaire des actions

Relevé le 2026-11-15 sur https://localhost (jeu de démonstration).

## formateur — 23 pages, 230 actions

### `(coque)` — En-tête et menus

- [lien] Cert_EET → `/formateur/tableau-de-bord`
- [recherche] Rechercher une formation
- [bouton] DF Mon compte
- [lien] Accueil → `/formateur/tableau-de-bord`
- [lien] Mes formations → `/formateur/formations`
- [lien] Demander une formation → `/formateur/demandes`
- [lien] Proposer une formation → `/formateur/propositions`
- [lien] Livrables à corriger # , # en attente → `/formateur/livrables`
- [lien] Tentatives des QCM → `/formateur/qcm`
- [lien] Apprenants → `/formateur/apprenants`
- [lien] Alertes # , # en attente → `/formateur/alertes`
- [lien] Rapports → `/rapports`
- [lien] Catalogue → `/catalogue`
- [bouton] Réduire le menu
- [menu] Accueil → `/formateur/tableau-de-bord` _(menu du compte)_
- [menu] Changer de rôle → `/mon-role` _(menu du compte)_
- [menu] Sécurité du compte → `/securite` _(menu du compte)_
- [menu] Se déconnecter _(menu du compte)_

### `/formateur/tableau-de-bord` — Tableau de bord

- [lien] Voir les alertes → `/formateur/alertes`
- [lien] Corriger → `/formateur/formations/:id`
- [lien] À corriger # livrables à corriger ou en correction → `/formateur/livrables`
- [lien] Alertes # # décrochage · # surveillance → `/formateur/alertes`
- [lien] Apprenants en cours # sur # inscrits → `/formateur/apprenants`
- [lien] Réussite aux QCM # % # tentatives notées du #/#/# au #/#/# · # jours → `/formateur/qcm`
- [bouton] Vue en cartes
- [bouton] Vue tableau
- [lien] Développement web full-stack (NestJS et Next.js) → `/formateur/formations/:id`
- [lien] # à corriger → `/formateur/livrables`
- [lien] # alertes → `/formateur/alertes`
- [lien] Ouvrir → `/formateur/formations/:id`
- [lien] Suivi → `/formateur/formations/:id/suivi`
- [lien] DevOps : Docker, CI/CD et Kubernetes → `/formateur/formations/:id`
- [lien] Bureautique avancée et Power BI → `/formateur/formations/:id`
- [bouton] Affichée
- [bouton] Voir les apprenants
- [liste] Formation affichée
- [lien] Suivi pédagogique → `/formateur/formations/:id/suivi`
- [bouton] Ahmed Mejri
- [bouton] Mariem Ayari
- [bouton] Sana Gharbi
- [bouton] Yassine Mansouri
- [bouton] Youssef Jlassi
- [bouton] # j
- [bouton] # an
- [volet] Personnaliser
- [bouton] × _(fenêtre « Ahmed Mejri »)_
- [bouton] Fermer _(fenêtre « Ahmed Mejri »)_
- [bouton] Appliquer _(menu « Personnaliser »)_

### `/formateur/formations` — Mes formations

- [lien] Alertes de décrochage # → `/formateur/alertes`
- [bouton] Actualiser
- [lien] Développement web full-stack (NestJS et Next.js) → `/formateur/formations/:id`
- [lien] Ouvrir → `/formateur/formations/:id`
- [lien] DevOps : Docker, CI/CD et Kubernetes → `/formateur/formations/:id`
- [lien] Bureautique avancée et Power BI → `/formateur/formations/:id`

### `/formateur/demandes` — Mes demandes

- [lien] Mes propositions → `/formateur/propositions`
- [lien] Tableau de bord → `/formateur/tableau-de-bord`
- [liste] Formation
- [bouton] Envoyer la demande

### `/formateur/propositions` — Mes propositions

- [lien] Mes demandes → `/formateur/demandes`
- [lien] Tableau de bord → `/formateur/tableau-de-bord`
- [bouton] Envoyer la proposition

### `/formateur/livrables` — Livrables à corriger

- [bouton] Avec des livrables à corriger #
- [bouton] Tous les ateliers #
- [lien] Atelier — API REST de réservation → `/formateur/ateliers/:id`
- [lien] Ouvrir l’atelier → `/formateur/ateliers/:id`

### `/formateur/qcm` — Tentatives des QCM

- [bouton] Avec des tentatives #
- [bouton] Signalés par l’IA #
- [bouton] Tous les QCM #
- [lien] QCM — Les bases de NestJS → `/formateur/qcm/:id`
- [lien] Voir les tentatives → `/formateur/qcm/:id/tentatives`
- [bouton] Voir tous les QCM _(après « Signalés par l’IA # »)_

### `/formateur/apprenants` — Apprenants

- [lien] Suivi pédagogique → `/formateur/formations/:id/suivi`
- [lien] Rapports → `/formateur/formations/:id/rapports`

### `/formateur/alertes` — Alertes de décrochage

- [lien] Décrochage → `/formateur/alertes`
- [lien] Surveillance des QCM → `/formateur/alertes/surveillance`
- [bouton] Ouvertes #
- [bouton] Traitées #
- [bouton] Toutes #
- [bouton] Actualiser
- [lien] Développement web full-stack (NestJS et Next.js) → `/formateur/formations/:id/suivi`
- [bouton] Traiter
- [bouton] Historique
- [bouton] Masquer l’historique _(après « Historique »)_

### `/rapports` — Mes rapports


### `/catalogue` — Catalogue des formations

- [recherche] Rechercher dans le catalogue
- [bouton] Rechercher
- [lien] DW → `/catalogue/:id`
- [lien] Développement web full-stack (NestJS et Next.js) → `/catalogue/:id`
- [lien] Détails → `/catalogue/:id`
- [lien] CO → `/catalogue/:id`
- [lien] Cybersécurité opérationnelle (SOC) → `/catalogue/:id`
- [lien] DS → `/catalogue/:id`
- [lien] Data science avec Python → `/catalogue/:id`

### `/mon-role` — Changer de rôle

- [liste] Rôle souhaité
- [bouton] Soumettre la demande

### `/securite` — Sécurité

- [bouton] Changer mon mot de passe
- [bouton] Activer la double authentification

### `/formateur/formations/:id` — Développement web full-stack (NestJS et Next.js)

- [lien] Vue d’ensemble → `/formateur/formations/:id/vue-d-ensemble`
- [lien] Contenu # → `/formateur/formations/:id`
- [lien] Apprenants → `/formateur/formations/:id/suivi`
- [lien] Rapports → `/formateur/formations/:id/rapports`
- [bouton] Tout replier
- [bouton] Modifier le contenu
- [bouton] # Module # — API REST avec NestJS # QCM dont # publié · # atelier · # ressource · # support IA
- [bouton] Ajouter
- [lien] QCM · QCM — Les bases de NestJS → `/formateur/qcm/:id`
- [lien] Ouvrir → `/formateur/qcm/:id`
- [bouton] # Module # — Interfaces avec Next.js # QCM · # atelier · # ressource · # support IA
- [lien] Atelier · Atelier — API REST de réservation → `/formateur/ateliers/:id`
- [lien] Ouvrir → `/formateur/ateliers/:id`
- [bouton] Tout déplier _(après « Tout replier »)_
- [bouton] × _(fenêtre « Modifier le contenu »)_
- [bouton] Enregistrer le contenu _(fenêtre « Modifier le contenu »)_
- [bouton] ↑ _(fenêtre « Modifier le contenu »)_
- [bouton] ↓ _(fenêtre « Modifier le contenu »)_
- [bouton] Renommer _(fenêtre « Modifier le contenu »)_
- [bouton] Supprimer _(fenêtre « Modifier le contenu »)_
- [menu] Nouveau QCM _(menu « Ajouter »)_
- [menu] Nouvel atelier _(menu « Ajouter »)_
- [menu] Lien ou vidéo _(menu « Ajouter »)_
- [menu] Fichier _(menu « Ajouter »)_
- [menu] Support pour l’IA _(menu « Ajouter »)_
- [bouton] Annuler _(fenêtre « Nouveau QCM »)_
- [bouton] Créer _(fenêtre « Nouveau QCM »)_
- [bouton] Enregistrer _(fenêtre « Lien ou vidéo »)_
- [bouton] Déposer _(fenêtre « Fichier »)_

### `/formateur/formations/:id/suivi` — Développement web full-stack (NestJS et Next.js)

- [lien] Vue d’ensemble → `/formateur/formations/:id/vue-d-ensemble`
- [lien] Contenu # → `/formateur/formations/:id`
- [lien] Apprenants → `/formateur/formations/:id/suivi`
- [lien] Rapports → `/formateur/formations/:id/rapports`
- [lien] Exporter un rapport → `/formateur/formations/:id/rapports`
- [lien] # → `/formateur/alertes`
- [lien] # → `/formateur/alertes/surveillance`
- [recherche] Rechercher un apprenant
- [liste] Afficher
- [liste] Trier par
- [bouton] Fiche
- [bouton] × _(fenêtre « Fiche »)_
- [bouton] Fermer _(fenêtre « Fiche »)_

### `/formateur/ateliers/:id` — Atelier — API REST de réservation

- [bouton] Plus d’actions — Atelier — API REST de réservation
- [bouton] Énoncé fait · à rendre avant le #/#/# #:#
- [bouton] Grille de notation fait · validée (# %)
- [bouton] Corriger les livrables
- [onglet] Énoncé
- [onglet] Grille de notation
- [onglet] Livrables et résultats # à traiter
- [bouton] Tous
- [bouton] À corriger
- [bouton] En correction
- [bouton] Notés
- [lien] Reprendre → `/formateur/livrables/:id`
- [bouton] Corriger
- [menu] Modifier _(menu « Plus d’actions — Atelier — API REST de réservation »)_
- [menu] Supprimer _(menu « Plus d’actions — Atelier — API REST de réservation »)_
- [bouton] # Correction et résultats en cours · # livrable à corriger _(après « Énoncé fait · à rendre avant le #/#/# #:# »)_
- [bouton] Enregistrer comme modèle _(après « Grille de notation fait · validée (# %) »)_

### `/formateur/qcm/:id` — QCM — Les bases de NestJS

- [bouton] Plus d’actions — QCM — Les bases de NestJS
- [bouton] Paramètres anti-fraude fait · enregistrés
- [bouton] Publication fait · visible des apprenants
- [bouton] # Résultats en cours · tentatives à consulter
- [lien] Voir les tentatives → `/formateur/qcm/:id/tentatives`
- [onglet] Questions #
- [onglet] Paramètres
- [onglet] Tentatives et résultats
- [bouton] Ajouter des questions
- [bouton] Tout déplier
- [bouton] Quel décorateur déclare un contrôleur NestJS ? Choix unique Pondération # · # options
- [bouton] ↑
- [bouton] ↓
- [bouton] Explication
- [bouton] Retirer
- [bouton] Un service NestJS est injecté par le constructeur. Vrai / Faux Pondération # · # options
- [bouton] Quel élément valide automatiquement le corps d’une requête ? Choix unique Pondération # · # options
- [bouton] Quel module relie NestJS à une base PostgreSQL dans ce projet ? Choix unique Pondération # · # options
- [bouton] Un garde (guard) s’exécute après le contrôleur. Vrai / Faux Pondération # · # options
- [menu] Modifier le titre _(menu « Plus d’actions — QCM — Les bases de NestJS »)_
- [menu] Supprimer le QCM _(menu « Plus d’actions — QCM — Les bases de NestJS »)_
- [bouton] × _(fenêtre « Modifier le titre »)_
- [bouton] Annuler _(fenêtre « Modifier le titre »)_
- [bouton] Enregistrer _(fenêtre « Modifier le titre »)_
- [bouton] Questions fait · # questions _(après « Paramètres anti-fraude fait · enregistrés »)_
- [bouton] Modifier les paramètres _(après « Paramètres anti-fraude fait · enregistrés »)_
- [lien] Voir l’historique → `/formateur/qcm/:id/tentatives` _(après « # Résultats en cours · tentatives à consulter »)_
- [liste] Affichage du résultat _(fenêtre « Modifier les paramètres »)_
- [menu] Saisir une question _(menu « Ajouter des questions »)_
- [menu] Importer depuis ma banque _(menu « Ajouter des questions »)_
- [menu] Importer depuis un fichier _(menu « Ajouter des questions »)_
- [menu] Générer avec l’IA (supports du module) _(menu « Ajouter des questions »)_
- [bouton] Tout replier _(après « Tout déplier »)_
- [liste] Type _(fenêtre « Explication »)_
- [liste] Difficulté _(fenêtre « Explication »)_
- [bouton] + Ajouter une option _(fenêtre « Explication »)_

### `/formateur/qcm/:id/tentatives` — Tentatives — QCM — Les bases de NestJS

- [lien] ← Retour au QCM → `/formateur/qcm/:id`
- [recherche] Filtrer par apprenant
- [bouton] Toutes (#)
- [bouton] Signalées par l’IA (#)
- [bouton] Détail
- [bouton] Télécharger le rapport (PDF)
- [bouton] × _(fenêtre « Détail »)_
- [bouton] Voir les photos de contrôle _(fenêtre « Détail »)_

### `/formateur/formations/:id/rapports` — Développement web full-stack (NestJS et Next.js)

- [lien] Vue d’ensemble → `/formateur/formations/:id/vue-d-ensemble`
- [lien] Contenu # → `/formateur/formations/:id`
- [lien] Apprenants → `/formateur/formations/:id/suivi`
- [lien] Rapports → `/formateur/formations/:id/rapports`
- [bouton] PDF
- [bouton] CSV (Excel)
- [bouton] Générer
- [liste] Apprenant
- [liste] Module

### `/formateur/alertes/surveillance` — Surveillance des QCM

- [lien] Décrochage → `/formateur/alertes`
- [lien] Surveillance des QCM → `/formateur/alertes/surveillance`
- [bouton] À examiner #
- [bouton] Examinées #
- [bouton] Toutes #
- [bouton] Actualiser

### `/catalogue/:id` — Développement web full-stack (NestJS et Next.js)


### `/formateur/formations/:id/vue-d-ensemble` — Développement web full-stack (NestJS et Next.js)

- [lien] Vue d’ensemble → `/formateur/formations/:id/vue-d-ensemble`
- [lien] Contenu # → `/formateur/formations/:id`
- [lien] Apprenants → `/formateur/formations/:id/suivi`
- [lien] Rapports → `/formateur/formations/:id/rapports`
- [lien] Actifs ces # derniers jours # en cours et connectés depuis moins de # jours · sur # inscrits → `/formateur/formations/:id/suivi`
- [lien] Avancement moyen # % des apprenants en cours → `/formateur/formations/:id/suivi`
- [lien] Alertes ouvertes # # décrochage · # surveillance → `/formateur/alertes`
- [lien] Contenu publié # # QCM · # atelier · # modules → `/formateur/formations/:id`
- [lien] Préparer le contenu → `/formateur/formations/:id`

### `/formateur/livrables/:id` — Correction — Sana Gharbi

- [bouton] Télécharger
- [bouton] Insuffisant #–# %
- [bouton] Acceptable #–# %
- [bouton] Bon #–# %
- [bouton] Excellent #–# %
- [bouton] Enregistrer
- [bouton] Envoyer le feedback

## administrateur — 15 pages, 183 actions

### `(coque)` — En-tête et menus

- [lien] Cert_EET → `/admin/tableau-de-bord`
- [recherche] Rechercher une formation
- [bouton] DA Mon compte
- [lien] Accueil → `/admin/tableau-de-bord`
- [lien] Comptes → `/admin/utilisateurs`
- [lien] Demandes de rôle # , # en attente → `/admin/role-requests`
- [lien] Formations → `/admin/formations`
- [lien] Demandes d’affectation # , # en attente → `/admin/demandes-affectation`
- [lien] Propositions # , # en attente → `/admin/propositions-formation`
- [lien] Certificats → `/admin/certificats`
- [lien] Rapports → `/admin/rapports`
- [lien] Prédiction du risque → `/admin/risque`
- [lien] Générations IA → `/admin/generations-ia`
- [lien] Journal d’audit → `/admin/audit`
- [bouton] Réduire le menu
- [menu] Accueil → `/admin/tableau-de-bord` _(menu du compte)_
- [menu] Sécurité du compte → `/securite` _(menu du compte)_
- [menu] Se déconnecter _(menu du compte)_

### `/admin/tableau-de-bord` — Tableau de bord

- [lien] Traiter → `/admin/demandes-affectation`
- [lien] Traiter → `/admin/role-requests`
- [lien] Traiter → `/admin/propositions-formation`
- [bouton] # j
- [bouton] # an
- [volet] Personnaliser
- [lien] Comptes # # apprenants · # formateurs · # administrateurs → `/admin/utilisateurs`
- [lien] Connectés sur la période # # nouveaux comptes sur la période → `/admin/audit`
- [lien] Formations ouvertes # # au total : # ouvertes · # fermées · # archivées · # créées sur la période → `/admin/formations`
- [lien] Formations en brouillon # à préparer puis publier → `/admin/formations`
- [lien] Inscriptions # # en cours · # terminées · # suspendues · # sur la période → `/admin/formations`
- [lien] Certificats émis # # émis → `/admin/certificats`
- [lien] Certificats révoqués # consulter les motifs de révocation → `/admin/certificats`
- [lien] Vérifications publiques # consultations de la page de vérification sur la période → `/admin/certificats`
- [lien] Ouvrir le journal d’audit → `/admin/audit`
- [bouton] Appliquer _(menu « Personnaliser »)_

### `/admin/utilisateurs` — Comptes

- [bouton] Importer des comptes
- [recherche] Rechercher un compte
- [bouton] Tous les rôles #
- [bouton] Apprenants #
- [bouton] Formateurs #
- [bouton] Administrateurs #
- [bouton] Tous les statuts #
- [bouton] Actif #
- [bouton] Désactivé #
- [bouton] En attente #
- [bouton] Anonymisé #
- [bouton] Actualiser
- [bouton] Changer le rôle
- [bouton] Plus d’actions — Amira Ben Salah
- [bouton] Plus d’actions — Youssef Jlassi
- [bouton] Plus d’actions — Mariem Ayari
- [bouton] Plus d’actions — Ahmed Mejri
- [bouton] Plus d’actions — Sana Gharbi
- [bouton] Plus d’actions — Nour Chebbi
- [bouton] Plus d’actions — Leïla Haddad
- [bouton] Plus d’actions — Karim Trabelsi
- [bouton] Plus d’actions — Yassine Mansouri
- [bouton] Précédent
- [bouton] Suivant
- [menu] Désactiver _(menu « Plus d’actions — Amira Ben Salah »)_
- [menu] Anonymiser _(menu « Plus d’actions — Youssef Jlassi »)_

### `/admin/role-requests` — Demandes de rôle

- [bouton] En attente #
- [bouton] Approuvée #
- [bouton] Rejetée #
- [bouton] Actualiser
- [bouton] Approuver
- [bouton] Plus d’actions — Nour Chebbi
- [menu] Rejeter _(menu « Plus d’actions — Nour Chebbi »)_

### `/admin/formations` — Formations

- [bouton] Nouvelle formation
- [bouton] Tous les statuts #
- [bouton] Brouillon #
- [bouton] Ouverte #
- [bouton] Fermée #
- [bouton] Archivée #
- [bouton] Actualiser
- [bouton] Gérer
- [bouton] Précédent
- [bouton] Suivant
- [bouton] × _(fenêtre « Nouvelle formation »)_
- [bouton] Annuler _(fenêtre « Nouvelle formation »)_
- [bouton] Créer la formation _(fenêtre « Nouvelle formation »)_
- [menu] Modifier _(menu « Gérer »)_
- [menu] Modules _(menu « Gérer »)_
- [menu] Formateurs _(menu « Gérer »)_
- [menu] Inscriptions → `/admin/formations/:id/inscriptions` _(menu « Gérer »)_
- [menu] Statut _(menu « Gérer »)_
- [bouton] Enregistrer _(fenêtre « Modifier »)_
- [bouton] ↑ _(fenêtre « Modules »)_
- [bouton] ↓ _(fenêtre « Modules »)_
- [bouton] Renommer _(fenêtre « Modules »)_
- [bouton] Supprimer _(fenêtre « Modules »)_
- [bouton] Fermer _(fenêtre « Modules »)_
- [bouton] Ajouter le module _(fenêtre « Modules »)_
- [bouton] Retirer _(fenêtre « Formateurs »)_
- [liste] Affecter un formateur _(fenêtre « Formateurs »)_
- [bouton] Affecter _(fenêtre « Formateurs »)_
- [bouton] Clôturer _(fenêtre « Statut »)_

### `/admin/demandes-affectation` — Demandes d’affectation

- [bouton] En attente #
- [bouton] Acceptée #
- [bouton] Refusée #
- [bouton] Annulée #
- [bouton] Actualiser
- [lien] DevOps : Docker, CI/CD et Kubernetes → `/admin/formations/:id/inscriptions`
- [bouton] Accepter
- [bouton] Plus d’actions — Leïla Haddad
- [menu] Refuser _(menu « Plus d’actions — Leïla Haddad »)_

### `/admin/propositions-formation` — Propositions de formation

- [bouton] En attente #
- [bouton] À modifier #
- [bouton] Acceptée #
- [bouton] Refusée #
- [bouton] Actualiser
- [bouton] Accepter
- [bouton] Plus d’actions — Kubernetes en production
- [menu] Demander des modifications _(menu « Plus d’actions — Kubernetes en production »)_
- [menu] Refuser _(menu « Plus d’actions — Kubernetes en production »)_

### `/admin/certificats` — Certificats

- [recherche] Rechercher un certificat
- [bouton] Rechercher
- [bouton] Tous #
- [bouton] En attente #
- [bouton] En génération #
- [bouton] Émis #
- [bouton] Révoqués #
- [bouton] Échecs définitifs
- [bouton] Actualiser
- [bouton] Mariem Ayari
- [bouton] Fiche
- [bouton] Plus d’actions — Mariem Ayari
- [bouton] Youssef Jlassi
- [bouton] Plus d’actions — Youssef Jlassi
- [bouton] Sana Gharbi
- [bouton] Plus d’actions — Sana Gharbi
- [bouton] Précédent
- [bouton] Suivant
- [bouton] × _(fenêtre « Mariem Ayari »)_
- [bouton] Voir le PDF _(fenêtre « Mariem Ayari »)_
- [lien] Page de vérification publique ↗ → `/verifier/:id` _(fenêtre « Mariem Ayari »)_
- [bouton] Fermer _(fenêtre « Mariem Ayari »)_
- [menu] Révoquer _(menu « Plus d’actions — Mariem Ayari »)_

### `/admin/rapports` — Rapports institutionnels

- [bouton] PDF
- [bouton] CSV (Excel)
- [bouton] Générer

### `/admin/risque` — Prédiction du risque

- [bouton] Affichée
- [bouton] Voir les apprenants
- [liste] Formation affichée
- [bouton] Ahmed Mejri
- [bouton] Mariem Ayari
- [bouton] Sana Gharbi
- [bouton] Yassine Mansouri
- [bouton] Youssef Jlassi
- [bouton] × _(fenêtre « Ahmed Mejri »)_
- [bouton] Fermer _(fenêtre « Ahmed Mejri »)_

### `/admin/generations-ia` — Générations IA

- [bouton] Tous #
- [bouton] En cours #
- [bouton] Terminée #
- [bouton] Échec #
- [bouton] Actualiser

### `/admin/audit` — Journal d’audit

- [bouton] Télécharger (CSV)
- [bouton] Échecs # cliquer pour n’afficher que les échecs
- [bouton] Toutes #
- [bouton] Connexions #
- [bouton] Comptes #
- [bouton] Formations #
- [bouton] Évaluations #
- [bouton] Certificats #
- [bouton] IA #
- [bouton] Sécurité #
- [bouton] Actualiser
- [liste] Action
- [liste] Résultat
- [bouton] Filtrer
- [bouton] Réinitialiser
- [volet] Voir
- [bouton] Précédent
- [bouton] Suivant
- [bouton] Échecs # affichés seuls : cliquer pour tout revoir _(après « Échecs # cliquer pour n’afficher que les échecs »)_

### `/securite` — Sécurité

- [bouton] Changer mon mot de passe
- [bouton] Activer la double authentification

### `/admin/formations/:id/inscriptions` — Inscriptions

- [bouton] Inscrire
- [bouton] Importer
- [liste] Filtrer par statut
- [bouton] Suspendre
- [bouton] × _(fenêtre « Suspendre »)_
- [bouton] Annuler _(fenêtre « Suspendre »)_

### `/verifier/:id` — Certificat valide et authentique

- [lien] Télécharger le PDF certifié → `/api/verification/:id/pdf`

