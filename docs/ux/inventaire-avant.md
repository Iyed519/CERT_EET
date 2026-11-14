# Inventaire des actions

Relevé le 2026-11-14 sur https://localhost (jeu de démonstration).

## formateur — 19 pages, 150 actions

### `(coque)` — En-tête et menus

- [lien] Cert_EET → `/formateur/tableau-de-bord`
- [recherche] Rechercher une formation
- [lien] Accueil → `/formateur/tableau-de-bord`
- [lien] Mes formations → `/formateur/formations`
- [lien] Alertes → `/formateur/alertes`
- [lien] Rapports → `/rapports`
- [lien] Catalogue → `/catalogue`
- [bouton] DF Mon compte
- [menu] Accueil → `/formateur/tableau-de-bord` _(menu du compte)_
- [menu] Mes demandes → `/formateur/demandes` _(menu du compte)_
- [menu] Mes propositions → `/formateur/propositions` _(menu du compte)_
- [menu] Changer de rôle → `/mon-role` _(menu du compte)_
- [menu] Sécurité du compte → `/securite` _(menu du compte)_
- [menu] Se déconnecter _(menu du compte)_

### `/formateur/tableau-de-bord` — Tableau de bord

- [lien] Mes formations → `/formateur/formations`
- [lien] Demander une formation → `/formateur/demandes`
- [lien] Proposer une formation → `/formateur/propositions`
- [lien] Voir les alertes → `/formateur/alertes`
- [lien] Corriger → `/formateur/formations/:id`
- [bouton] Appliquer
- [bouton] # j
- [bouton] # an
- [lien] Développement web full-stack (NestJS et Next.js) → `/formateur/formations/:id`
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
- [bouton] × _(fenêtre « Ahmed Mejri »)_
- [bouton] Fermer _(fenêtre « Ahmed Mejri »)_

### `/formateur/formations` — Mes formations

- [lien] Alertes de décrochage # → `/formateur/alertes`
- [bouton] Actualiser
- [lien] Développement web full-stack (NestJS et Next.js) → `/formateur/formations/:id`
- [lien] Ouvrir → `/formateur/formations/:id`
- [lien] DevOps : Docker, CI/CD et Kubernetes → `/formateur/formations/:id`
- [lien] Bureautique avancée et Power BI → `/formateur/formations/:id`

### `/formateur/alertes` — Alertes de décrochage

- [lien] Décrochage → `/formateur/alertes`
- [lien] Surveillance des QCM → `/formateur/alertes/surveillance`
- [bouton] Ouvertes
- [bouton] Traitées
- [bouton] Toutes
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

### `/formateur/demandes` — Mes demandes

- [lien] Mes propositions → `/formateur/propositions`
- [lien] Tableau de bord → `/formateur/tableau-de-bord`
- [liste] Formation
- [bouton] Envoyer la demande

### `/formateur/propositions` — Mes propositions

- [lien] Mes demandes → `/formateur/demandes`
- [lien] Tableau de bord → `/formateur/tableau-de-bord`
- [bouton] Envoyer la proposition

### `/mon-role` — Changer de rôle

- [liste] Rôle souhaité
- [bouton] Soumettre la demande

### `/securite` — Sécurité

- [bouton] Changer mon mot de passe
- [bouton] Activer la double authentification

### `/formateur/formations/:id` — Développement web full-stack (NestJS et Next.js)

- [lien] Suivi pédagogique des apprenants → `/formateur/formations/:id/suivi`
- [bouton] Modifier le contenu
- [bouton] + Nouveau QCM
- [bouton] + Nouvel atelier
- [lien] QCM · QCM — Les bases de NestJS → `/formateur/qcm/:id`
- [lien] Ouvrir → `/formateur/qcm/:id`
- [bouton] + Lien ou vidéo
- [bouton] + Fichier
- [bouton] + Support
- [lien] Atelier · Atelier — API REST de réservation → `/formateur/ateliers/:id`
- [lien] Ouvrir → `/formateur/ateliers/:id`
- [bouton] × _(fenêtre « Modifier le contenu »)_
- [bouton] Enregistrer le contenu _(fenêtre « Modifier le contenu »)_
- [bouton] ↑ _(fenêtre « Modifier le contenu »)_
- [bouton] ↓ _(fenêtre « Modifier le contenu »)_
- [bouton] Renommer _(fenêtre « Modifier le contenu »)_
- [bouton] Supprimer _(fenêtre « Modifier le contenu »)_
- [bouton] Ajouter _(fenêtre « Modifier le contenu »)_
- [bouton] Annuler _(fenêtre « + Nouveau QCM »)_
- [bouton] Créer _(fenêtre « + Nouveau QCM »)_
- [bouton] Enregistrer _(fenêtre « + Lien ou vidéo »)_
- [bouton] Déposer _(fenêtre « + Fichier »)_

### `/formateur/formations/:id/suivi` — Suivi pédagogique

- [lien] Exporter un rapport → `/formateur/formations/:id/rapports`
- [lien] # → `/formateur/alertes`
- [lien] # → `/formateur/alertes/surveillance`
- [liste] Afficher
- [liste] Trier par
- [bouton] Fiche
- [bouton] × _(fenêtre « Fiche »)_
- [bouton] Fermer _(fenêtre « Fiche »)_

### `/formateur/alertes/surveillance` — Surveillance des QCM

- [lien] Décrochage → `/formateur/alertes`
- [lien] Surveillance des QCM → `/formateur/alertes/surveillance`
- [bouton] À examiner
- [bouton] Examinées
- [bouton] Toutes

### `/catalogue/:id` — Développement web full-stack (NestJS et Next.js)


### `/formateur/qcm/:id` — QCM — Les bases de NestJS

- [bouton] Modifier le titre
- [bouton] Supprimer le QCM
- [bouton] Modifier les paramètres
- [lien] Voir l’historique → `/formateur/qcm/:id/tentatives`
- [bouton] Importer depuis ma banque
- [bouton] Importer depuis un fichier
- [bouton] + Ajouter une question
- [bouton] ↑
- [bouton] ↓
- [bouton] Explication
- [bouton] Retirer
- [bouton] × _(fenêtre « Modifier le titre »)_
- [bouton] Annuler _(fenêtre « Modifier le titre »)_
- [bouton] Enregistrer _(fenêtre « Modifier le titre »)_
- [liste] Affichage du résultat _(fenêtre « Modifier les paramètres »)_
- [liste] Type _(fenêtre « Explication »)_
- [liste] Difficulté _(fenêtre « Explication »)_
- [bouton] + Ajouter une option _(fenêtre « Explication »)_

### `/formateur/ateliers/:id` — Atelier — API REST de réservation

- [bouton] Modifier
- [bouton] Supprimer
- [bouton] Tous
- [bouton] À corriger
- [bouton] En correction
- [bouton] Notés
- [lien] Reprendre → `/formateur/livrables/:id`
- [bouton] Corriger
- [bouton] Enregistrer comme modèle

### `/formateur/formations/:id/rapports` — Rapports de session

- [bouton] Demander le rapport

### `/formateur/qcm/:id/tentatives` — Tentatives — QCM — Les bases de NestJS

- [lien] ← Retour au QCM → `/formateur/qcm/:id`
- [recherche] Filtrer par apprenant
- [bouton] Toutes (#)
- [bouton] Signalées par l’IA (#)
- [bouton] Détail
- [bouton] Télécharger le rapport (PDF)
- [bouton] × _(fenêtre « Détail »)_
- [bouton] Voir les photos de contrôle _(fenêtre « Détail »)_

### `/formateur/livrables/:id` — Correction — Sana Gharbi

- [bouton] Télécharger
- [bouton] Insuffisant #–# %
- [bouton] Acceptable #–# %
- [bouton] Bon #–# %
- [bouton] Excellent #–# %
- [bouton] Enregistrer
- [bouton] Envoyer le feedback

## administrateur — 15 pages, 147 actions

### `(coque)` — En-tête et menus

- [lien] Cert_EET → `/admin/tableau-de-bord`
- [recherche] Rechercher une formation
- [lien] Accueil → `/admin/tableau-de-bord`
- [lien] Utilisateurs → `/admin/utilisateurs`
- [lien] Formations → `/admin/formations`
- [lien] Certificats → `/admin/certificats`
- [lien] Pilotage → `/admin/rapports`
- [bouton] DA Mon compte
- [menu] Accueil → `/admin/tableau-de-bord` _(menu du compte)_
- [menu] Demandes de rôle → `/admin/role-requests` _(menu du compte)_
- [menu] Demandes d’affectation → `/admin/demandes-affectation` _(menu du compte)_
- [menu] Propositions de formation → `/admin/propositions-formation` _(menu du compte)_
- [menu] Rapports → `/admin/rapports` _(menu du compte)_
- [menu] Générations IA → `/admin/generations-ia` _(menu du compte)_
- [menu] Prédiction du risque → `/admin/risque` _(menu du compte)_
- [menu] Journal d'audit → `/admin/audit` _(menu du compte)_
- [menu] Sécurité du compte → `/securite` _(menu du compte)_
- [menu] Se déconnecter _(menu du compte)_

### `/admin/tableau-de-bord` — Tableau de bord

- [lien] Traiter → `/admin/demandes-affectation`
- [lien] Traiter → `/admin/role-requests`
- [lien] Traiter → `/admin/propositions-formation`
- [lien] Prédiction du risque (IA) → `/admin/risque`
- [bouton] Appliquer
- [bouton] # j
- [bouton] # an
- [lien] Voir → `/admin/role-requests`
- [lien] Demandes de rôle → `/admin/role-requests`
- [lien] Demandes d’affectation → `/admin/demandes-affectation`
- [lien] Propositions de formation → `/admin/propositions-formation`
- [lien] Ouvrir le journal d’audit → `/admin/audit`

### `/admin/utilisateurs` — Gestion des utilisateurs

- [lien] Comptes → `/admin/utilisateurs`
- [lien] Demandes de rôle → `/admin/role-requests`
- [bouton] Importer un CSV
- [bouton] Actualiser
- [bouton] Changer le rôle
- [bouton] Désactiver
- [bouton] Anonymiser

### `/admin/formations` — Formations

- [lien] Formations → `/admin/formations`
- [lien] Demandes d’affectation → `/admin/demandes-affectation`
- [lien] Propositions → `/admin/propositions-formation`
- [liste] Filtrer par statut
- [bouton] Actualiser
- [bouton] Nouvelle formation
- [bouton] Modifier
- [bouton] Modules
- [bouton] Formateurs
- [bouton] Statut
- [lien] Inscriptions → `/admin/formations/:id/inscriptions`
- [bouton] Précédent
- [bouton] Suivant
- [bouton] × _(fenêtre « Nouvelle formation »)_
- [bouton] Annuler _(fenêtre « Nouvelle formation »)_
- [bouton] Créer la formation _(fenêtre « Nouvelle formation »)_
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

### `/admin/certificats` — Certificats

- [bouton] Tous
- [bouton] En attente
- [bouton] En génération
- [bouton] Émis
- [bouton] Révoqués
- [bouton] Échecs définitifs
- [bouton] Rechercher
- [bouton] Fiche
- [bouton] Révoquer
- [bouton] × _(fenêtre « Fiche »)_
- [bouton] Voir le PDF _(fenêtre « Fiche »)_
- [lien] Page de vérification publique ↗ → `/verifier/:id` _(fenêtre « Fiche »)_
- [bouton] Fermer _(fenêtre « Fiche »)_

### `/admin/rapports` — Rapports institutionnels

- [lien] Rapports → `/admin/rapports`
- [lien] Prédiction du risque → `/admin/risque`
- [lien] Générations IA → `/admin/generations-ia`
- [lien] Journal d’audit → `/admin/audit`
- [bouton] Demander le rapport

### `/admin/role-requests` — Demandes de changement de rôle

- [lien] Comptes → `/admin/utilisateurs`
- [lien] Demandes de rôle → `/admin/role-requests`
- [liste] Filtrer par statut
- [bouton] Actualiser
- [bouton] Approuver
- [bouton] Rejeter

### `/admin/demandes-affectation` — Demandes d’affectation

- [lien] Formations → `/admin/formations`
- [lien] Demandes d’affectation → `/admin/demandes-affectation`
- [lien] Propositions → `/admin/propositions-formation`
- [liste] Filtrer par statut
- [bouton] Actualiser
- [lien] DevOps : Docker, CI/CD et Kubernetes → `/admin/formations/:id/inscriptions`
- [bouton] Accepter
- [bouton] Refuser

### `/admin/propositions-formation` — Propositions de formation

- [lien] Formations → `/admin/formations`
- [lien] Demandes d’affectation → `/admin/demandes-affectation`
- [lien] Propositions → `/admin/propositions-formation`
- [liste] Filtrer par statut
- [bouton] Actualiser
- [bouton] Accepter
- [bouton] Demander des modifications
- [bouton] Refuser

### `/admin/generations-ia` — Générations IA

- [lien] Rapports → `/admin/rapports`
- [lien] Prédiction du risque → `/admin/risque`
- [lien] Générations IA → `/admin/generations-ia`
- [lien] Journal d’audit → `/admin/audit`
- [liste] Statut

### `/admin/risque` — Prédiction du risque

- [lien] Rapports → `/admin/rapports`
- [lien] Prédiction du risque → `/admin/risque`
- [lien] Générations IA → `/admin/generations-ia`
- [lien] Journal d’audit → `/admin/audit`
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

### `/admin/audit` — Journal d'audit

- [lien] Rapports → `/admin/rapports`
- [lien] Prédiction du risque → `/admin/risque`
- [lien] Générations IA → `/admin/generations-ia`
- [lien] Journal d’audit → `/admin/audit`
- [bouton] Télécharger (CSV)
- [liste] Action
- [liste] Résultat
- [bouton] Filtrer
- [bouton] Réinitialiser
- [volet] Voir
- [bouton] Précédent
- [bouton] Suivant

### `/securite` — Sécurité

- [bouton] Changer mon mot de passe
- [bouton] Activer la double authentification

### `/admin/formations/:id/inscriptions` — Inscriptions

- [lien] Formations → `/admin/formations`
- [lien] Demandes d’affectation → `/admin/demandes-affectation`
- [lien] Propositions → `/admin/propositions-formation`
- [bouton] Inscrire
- [bouton] Importer
- [liste] Filtrer par statut
- [bouton] Suspendre
- [bouton] × _(fenêtre « Suspendre »)_
- [bouton] Annuler _(fenêtre « Suspendre »)_

### `/verifier/:id` — Certificat valide et authentique

- [lien] Télécharger le PDF certifié → `/api/verification/:id/pdf`

