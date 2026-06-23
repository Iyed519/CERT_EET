# Cert_EET — Description Détaillée des Cas d'Utilisation

## Acteur : **Administrateur**

> Document complémentaire au diagramme `Cert_EET_UC_Administrateur.puml`
> Version 1.0 · Mai 2026 · Iyed Omri · PFE ESPRIT

---

### Profil de l'acteur

L'**Administrateur** est le responsable opérationnel et institutionnel de la plateforme Cert_EET. Il représente la direction d'ESPRIT Entreprise et garantit le bon fonctionnement global du système. Il dispose des droits les plus étendus du RBAC (F5 du CdC) : accès à tous les utilisateurs, à toutes les formations, à toutes les données analytiques agrégées, et aux fonctions de configuration et d'audit.

Contrairement au Formateur, son rôle n'est **pas pédagogique** : il ne crée pas de contenu, ne corrige pas de livrables, ne note pas d'apprenants. Son périmètre est exclusivement la **gouvernance, l'administration et la supervision** de la plateforme.

---

## UC1 — Gérer les comptes utilisateurs

**Objectif métier** : Maintenir le référentiel des comptes utilisateurs de la plateforme : créer, modifier, désactiver, supprimer les comptes des apprenants, formateurs et autres administrateurs.

**Déclencheur** : L'administrateur accède à la section **"Utilisateurs"** depuis le panneau d'administration.

**Déroulement nominal** :
1. L'administrateur visualise la liste paginée et filtrable de tous les utilisateurs :
   - Nom, prénom, email
   - Rôle attribué (Apprenant / Formateur / Administrateur)
   - Statut du compte (Actif / Désactivé / En attente d'activation)
   - Date de création, dernière connexion
   - Nombre de formations rattachées
2. Pour créer un nouveau compte, il clique sur **"Nouvel utilisateur"** et saisit :
   - Identité (nom, prénom)
   - Email institutionnel ou personnel
   - Rôle (cf. UC2 pour le détail du RBAC)
   - Données complémentaires selon le rôle (matricule étudiant, domaine d'expertise pour un formateur, etc.)
3. Le système envoie automatiquement un **email d'activation** avec un lien à usage unique permettant à l'utilisateur de définir son mot de passe.
4. L'administrateur peut éditer un compte existant : corriger des informations, désactiver temporairement, réactiver, ou supprimer (avec confirmation explicite).

**Création en masse** :
- Import depuis un fichier CSV (cas typique : début d'année universitaire, inscription d'une promotion entière).
- Le système valide le fichier (colonnes obligatoires, formats d'email, absence de doublons) avant import.

**Cas particuliers** :
- *Suppression d'un compte* : si l'utilisateur a des données rattachées (tentatives QCM, livrables, certificats), une **anonymisation** est proposée comme alternative (conformité au principe de minimisation des données).
- *Désactivation temporaire* : le compte reste en base mais l'utilisateur ne peut plus se connecter (utile pour les suspensions disciplinaires ou les départs).

---

## UC2 — Attribuer les rôles (RBAC)

**Objectif métier** : Définir et modifier le rôle de chaque utilisateur, ce qui détermine l'ensemble de ses permissions sur la plateforme.

**Déclencheur** : L'administrateur édite la fiche d'un utilisateur et accède à l'onglet **"Permissions"**.

**Déroulement nominal** :
1. L'administrateur visualise le rôle actuel et les permissions associées.
2. Il sélectionne un nouveau rôle dans la liste :
   - **Apprenant** : passe les évaluations, soumet des livrables, consulte ses certificats
   - **Formateur** : crée du contenu, corrige les livrables de ses apprenants
   - **Administrateur** : gestion globale de la plateforme
3. Il confirme le changement. Le système journalise l'opération dans l'audit log (UC10) avec horodatage et identité de l'administrateur.
4. L'utilisateur affecté reçoit une notification de changement de rôle.

**Règles de sécurité importantes** :
- Un administrateur **ne peut pas se rétrograder lui-même** sans qu'un autre administrateur confirme l'opération (évite le verrouillage accidentel).
- Le système maintient **au moins un administrateur actif** en permanence (impossible de désactiver le dernier compte admin).
- Les changements de rôle sont **immédiats** : la session active de l'utilisateur affecté est invalidée, forçant une reconnexion avec les nouvelles permissions.

**Granularité** : dans la version initiale du PFE, les rôles sont **prédéfinis** (Apprenant, Formateur, Administrateur). Une évolution V2 pourrait introduire des rôles personnalisables avec attribution fine de permissions (ex : "Formateur principal" vs "Formateur invité").

---

## UC3 — Gérer les formations

**Objectif métier** : Créer, modifier et clôturer les cycles de formation proposés par ESPRIT Entreprise, indépendamment de tout contenu pédagogique spécifique.

**Déclencheur** : L'administrateur accède à la section **"Formations"** du panneau d'administration.

**Déroulement nominal** :
1. L'administrateur visualise le catalogue de toutes les formations :
   - Titre
   - Description et objectifs
   - Durée (en heures ou en semaines)
   - Statut (Ouverte / Fermée / Archivée)
   - Nombre d'apprenants inscrits
   - Formateur(s) responsable(s)
2. Il crée une nouvelle formation en saisissant :
   - **Métadonnées** : titre, description, prérequis, objectifs pédagogiques
   - **Période** : date de début et date de fin
   - **Capacité maximale** d'inscription (si applicable)
   - **Critères de certification** : note minimale globale pour obtenir le certificat, modules obligatoires
   - **Modèle de certificat** à utiliser (logo, mentions légales, signataire)
3. Il peut modifier une formation existante (sauf restrictions liées aux apprenants déjà inscrits — voir cas alternatifs).
4. Il peut clôturer une formation (cycle terminé) — les certificats émis restent valides et vérifiables.

**Cas alternatifs** :
- *Formation en cours avec apprenants inscrits* : la modification des critères de certification est interdite (intégrité contractuelle envers les apprenants).
- *Archivage* : une formation archivée n'apparaît plus dans le catalogue mais reste accessible en consultation. Les certificats restent vérifiables publiquement.

---

## UC4 — Affecter formateurs et apprenants

**Objectif métier** : Établir les liens entre les utilisateurs et les formations : qui anime quoi, qui suit quoi.

**Déclencheur** : Depuis la fiche d'une formation, l'administrateur clique sur **"Gérer les participants"**.

**Déroulement nominal** :
1. L'administrateur visualise deux listes :
   - **Formateurs affectés** à la formation
   - **Apprenants inscrits** à la formation
2. Pour **affecter un formateur** :
   - Recherche par nom dans la base des utilisateurs ayant le rôle Formateur
   - Définition de son rôle dans la formation (Formateur principal, Formateur invité — V2)
   - Validation
3. Pour **inscrire des apprenants** :
   - Inscription individuelle (recherche par nom/email)
   - Inscription en masse via import CSV
   - Inscription via lien d'inscription publique avec validation administrative
4. Pour **retirer un participant** :
   - Si aucune activité enregistrée → désinscription directe
   - Si activité enregistrée → confirmation explicite, données conservées pour audit

**Notifications automatiques** :
- Le formateur affecté reçoit un email de notification avec accès direct à la formation.
- Les apprenants inscrits reçoivent un email de bienvenue avec consignes d'accès et description de la formation.

**Règle importante** : un même apprenant peut être inscrit à plusieurs formations simultanément. Un même formateur peut animer plusieurs formations en parallèle.

---

## UC5 — Superviser les certificats émis

**Objectif métier** : Disposer d'une vue centralisée et auditable de tous les certificats émis par la plateforme, pour garantir la traçabilité institutionnelle.

**Déclencheur** : L'administrateur accède à la section **"Certificats"** du panneau d'administration.

**Déroulement nominal** :
1. L'administrateur visualise la liste exhaustive des certificats :
   - Identifiant unique (UUID)
   - Nom de l'apprenant titulaire
   - Titre de la formation certifiée
   - Date d'émission
   - Score final / mention obtenue
   - Statut (Actif / Révoqué / Suspendu)
   - Empreinte SHA-256
   - URL publique de vérification
   - Nombre de consultations publiques (audit)
2. Il peut filtrer par : période, formation, formateur, statut, apprenant.
3. Il peut consulter le détail d'un certificat : historique complet (émission, consultations, éventuelle révocation).
4. Il peut **exporter** la liste filtrée au format CSV ou PDF pour reporting institutionnel.

**Vue analytique disponible** :
- Nombre total de certificats émis sur la période
- Répartition par formation
- Taux de vérification publique (combien de fois les certificats ont été scannés/vérifiés)

**Caractère immuable** : l'administrateur **ne peut pas modifier le contenu** d'un certificat émis (ni le nom, ni le score, ni la date). Toute correction nécessite une **révocation suivie d'une réémission** (UC6).

---

## UC6 — Révoquer un certificat

**Objectif métier** : Invalider publiquement un certificat émis lorsqu'une fraude est avérée, une erreur grave détectée, ou une plainte fondée reçue.

**Déclencheur** : L'administrateur décide, sur la base de preuves documentées, qu'un certificat doit être retiré de la validité publique.

**Déroulement nominal** :
1. Depuis la fiche d'un certificat, l'administrateur clique sur **"Révoquer"**.
2. Le système affiche un formulaire de motivation **obligatoire** :
   - **Motif** (sélection parmi : Fraude détectée a posteriori, Erreur administrative, Décision disciplinaire, Demande judiciaire)
   - **Description libre** justifiant la décision
   - **Pièces jointes** (preuves, courriers, décisions)
3. L'administrateur confirme — une double confirmation est requise pour cette action irréversible (saisie de son mot de passe).
4. Le système :
   - Passe le statut du certificat à **"Révoqué"**
   - Met à jour la page publique de vérification : tout visiteur qui scanne le QR code voit désormais "Certificat révoqué"
   - Notifie l'apprenant concerné (email + notification interne)
   - Enregistre l'opération dans l'audit log avec l'identité de l'administrateur, l'horodatage et le motif

**Garanties** :
- Le certificat **n'est pas supprimé** physiquement : sa trace cryptographique reste en base pour audit. Seul son statut change.
- La révocation est **publique et immédiate** — un employeur qui aurait scanné le QR avant la révocation peut le re-scanner et voir le nouveau statut.

**Cas d'usage typique** : un apprenant a triché lors d'un QCM (preuve apportée a posteriori par un autre apprenant ou par une analyse de logs), et son certificat est révoqué pour préserver la crédibilité institutionnelle.

---

## UC7 — Consulter le tableau de bord global

**Objectif métier** : Disposer d'une vue stratégique sur l'activité globale de la plateforme pour le pilotage institutionnel.

**Déclencheur** : Page d'accueil par défaut de l'espace administrateur.

**Déroulement nominal** :
1. Le tableau de bord affiche :
   - **Indicateurs clés (KPI)** :
     - Nombre total d'utilisateurs actifs par rôle
     - Nombre de formations en cours / clôturées
     - Nombre de certificats émis (cumul et tendance)
     - Taux de complétion moyen
     - Taux de réussite global
   - **Graphiques de tendance** :
     - Évolution mensuelle des inscriptions
     - Évolution mensuelle des certifications
     - Répartition des scores QCM (histogramme)
   - **Alertes système** :
     - Erreurs techniques détectées
     - Pics d'utilisation anormaux
     - Tentatives de connexion suspectes
   - **Activité récente** :
     - Derniers certificats émis
     - Derniers utilisateurs créés
     - Dernières révocations
2. L'administrateur peut filtrer par période (semaine, mois, trimestre, année).
3. Chaque widget est cliquable pour accéder au détail.

**Différence avec le tableau du Formateur** : le formateur voit **uniquement ses formations**. L'administrateur a une **vue globale et croisée** sur l'ensemble de la plateforme.

---

## UC8 — Exporter les rapports institutionnels

**Objectif métier** : Produire des documents de reporting officiels destinés à la direction d'ESPRIT, aux audits externes, ou aux partenaires institutionnels.

**Déclencheur** : L'administrateur clique sur **"Rapports"** dans le panneau d'administration.

**Déroulement nominal** :
1. L'administrateur sélectionne le **type de rapport** :
   - **Rapport d'activité** (synthèse globale sur une période)
   - **Rapport de certifications** (toutes les certifications émises sur une période)
   - **Rapport par formation** (analyse approfondie d'une formation)
   - **Rapport par formateur** (activité et performance d'un formateur)
   - **Rapport de conformité** (logs d'audit, accès, modifications)
2. Il définit les paramètres : période, formations concernées, niveau de détail.
3. Il choisit le **format** : PDF (mise en page institutionnelle, avec en-tête ESPRIT) ou CSV (données brutes).
4. Le système génère le rapport en arrière-plan (file Bull pour les gros volumes — cf. note technique).
5. Une fois prêt, le rapport est téléchargeable depuis l'espace administrateur.

**Différence avec l'export Formateur** :
- Formateur : export limité à ses propres formations
- Administrateur : export sur **tout le périmètre** de la plateforme

**Usage typique** : préparation du bilan annuel d'ESPRIT Entreprise, audit RGPD, justification d'un financement institutionnel.

---

## UC9 — Configurer la plateforme

**Objectif métier** : Paramétrer les comportements globaux et les politiques transverses de Cert_EET.

**Déclencheur** : L'administrateur accède à la section **"Configuration"** du panneau d'administration.

**Catégories de paramètres configurables** :

### 9.1 Identité institutionnelle
- Logo, couleurs, mentions légales
- Modèles de certificats (mise en page, signataires)
- Modèles d'emails (activation, notification, alerte)

### 9.2 Politiques de sécurité
- Politique de mot de passe (longueur, complexité, expiration)
- MFA obligatoire pour certains rôles (typiquement Formateur et Administrateur)
- Durée de validité des tokens JWT et refresh tokens
- Délai d'expiration de session par inactivité

### 9.3 Paramètres pédagogiques par défaut
- Valeurs par défaut pour les nouveaux QCM (durée standard, nombre de tentatives, etc.)
- Modèles de grilles d'évaluation à proposer aux formateurs

### 9.4 Intégrations
- Configuration du fournisseur LLM utilisé (GPT-4o / Claude / Mistral) et clés API
- Configuration du service d'envoi d'emails (SMTP)
- (V2) Intégrations Blackboard / Teams / Moodle

### 9.5 Maintenance
- Activation/désactivation de fonctionnalités spécifiques (feature flags)
- Mise en mode maintenance de la plateforme
- Sauvegardes manuelles déclenchables

**Restrictions** :
- Certains paramètres critiques (clés cryptographiques de signature des certificats) ne sont **pas modifiables via l'interface** mais uniquement via la configuration serveur (sécurité par séparation des privilèges).
- Toute modification est journalisée dans l'audit log.

---

## UC10 — Consulter les journaux d'audit

**Objectif métier** : Tracer l'historique exhaustif des actions sensibles effectuées sur la plateforme pour les besoins de sécurité, de conformité et d'investigation.

**Déclencheur** : L'administrateur accède à la section **"Audit"** du panneau d'administration.

**Déroulement nominal** :
1. L'administrateur visualise le journal sous forme de tableau filtré et trié :
   - **Horodatage** précis (à la milliseconde)
   - **Acteur** (utilisateur ayant effectué l'action)
   - **Action** (libellé clair : "Révocation de certificat", "Modification de rôle utilisateur", "Connexion échouée", etc.)
   - **Cible** (objet impacté : utilisateur, formation, certificat…)
   - **Adresse IP** d'origine
   - **Résultat** (Succès / Échec)
   - **Détails contextuels** (avant/après pour les modifications)
2. Il peut filtrer par : période, type d'action, acteur, niveau de criticité.
3. Il peut exporter une plage de logs (PDF horodaté pour valeur légale, ou CSV pour analyse).

**Actions journalisées en priorité** :
- Connexions et déconnexions (réussies et échouées)
- Création, modification, suppression de comptes utilisateurs
- Changements de rôle
- Émission et révocation de certificats
- Modifications des paramètres de configuration
- Tentatives d'accès non autorisées (403)
- Exports massifs de données

**Caractère immuable** :
- Les logs d'audit **ne sont pas supprimables** par l'administrateur via l'interface — leur conservation est garantie par la politique de rétention de l'infrastructure.
- Toute consultation de l'audit log est elle-même journalisée (méta-audit) pour éviter les abus.

**Usage typique** :
- Investigation après détection d'une intrusion
- Démonstration de conformité lors d'un audit RGPD
- Vérification a posteriori d'une opération litigieuse

---

## Synthèse — Ce que l'Administrateur **NE PEUT PAS** faire

Même l'administrateur a des limites — c'est essentiel pour la sécurité de la plateforme :

| Action | Raison |
|---|---|
| Modifier le contenu pédagogique des QCM/ateliers | Réservé aux formateurs (séparation des rôles) |
| Corriger un livrable à la place du formateur | Intégrité pédagogique |
| Voir les conversations privées du chatbot sans consentement | Confidentialité apprenant |
| Modifier ou supprimer un journal d'audit | Intégrité de l'audit (principe d'inaltérabilité) |
| Émettre un certificat à un apprenant n'ayant pas validé la formation | Intégrité du processus de certification |
| Modifier le contenu d'un certificat émis | Immuabilité cryptographique (seule la révocation est possible) |
| Accéder aux mots de passe en clair | Stockés en hash bcrypt — non réversibles |

---

*Fin du document — UC Administrateur · Cert_EET v1.0*