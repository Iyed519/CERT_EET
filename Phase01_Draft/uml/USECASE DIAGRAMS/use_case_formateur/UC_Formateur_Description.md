# Cert_EET — Description Détaillée des Cas d'Utilisation

## Acteur : **Formateur**

> Document complémentaire au diagramme `Cert_EET_UC_Formateur.puml`
> Version 1.0 · Mai 2026 · Iyed Omri · PFE ESPRIT

---

### Profil de l'acteur

Le **Formateur** est un intervenant pédagogique habilité par ESPRIT Entreprise à animer un ou plusieurs cycles de formation certifiante. Il est responsable de la conception des évaluations, de la correction des travaux des apprenants, et du suivi pédagogique individualisé.

Contrairement à l'Administrateur, son périmètre d'action est **strictement limité à ses propres formations** : il ne voit pas les apprenants des autres formateurs, ne peut pas modifier les comptes utilisateurs, et n'a pas accès aux paramètres globaux de la plateforme. Cette isolation est garantie par le RBAC (F5 du cahier des charges).

---

## UC1 — Créer un QCM

**Objectif métier** : Concevoir une évaluation à choix multiples pour mesurer les connaissances théoriques des apprenants sur un module donné.

**Déclencheur** : Le formateur accède à l'espace "Mes formations" et clique sur **"Nouveau QCM"** dans une formation dont il est responsable.

**Déroulement nominal** :
1. Le formateur saisit les métadonnées du QCM :
   - **Titre** (ex : "QCM Module 3 — Sécurité JWT")
   - **Description** affichée à l'apprenant avant le démarrage
   - **Formation rattachée** (sélectionnée parmi celles dont il est responsable)
   - **Module ou chapitre** ciblé
2. Il ajoute les questions une par une. Pour chaque question :
   - Saisie de l'**énoncé** (texte enrichi, support d'images/code)
   - Choix du **type** : QCM (plusieurs bonnes réponses possibles), QCU (une seule), Vrai/Faux, réponse courte, association
   - Saisie des **options de réponse** et marquage de la/des bonne(s)
   - Définition de la **pondération** (poids relatif de la question dans le score global)
   - Saisie optionnelle d'une **explication** affichée à l'apprenant après la fermeture de la fenêtre d'examen
3. Le formateur peut **importer** des questions depuis un fichier (format GIFT, CSV, ou JSON) pour gagner du temps.
4. Il peut sauvegarder en **brouillon** à tout moment et reprendre plus tard.
5. Une fois les questions complètes, il valide la création du QCM — qui reste à l'état **"Non publié"** jusqu'à configuration de l'anti-fraude (UC2).

**Bonnes pratiques pédagogiques intégrées** :
- Le système affiche un compteur de questions par niveau de difficulté (si tagué).
- Un score de "qualité" indicatif est calculé (questions trop courtes, options trop similaires, etc.) — non bloquant, simplement informatif.

**Cas alternatifs** :
- *Banque de questions* : le formateur peut piocher dans une bibliothèque réutilisable (questions stockées hors d'un QCM particulier).
- *Édition d'un QCM existant* : tant qu'aucune tentative n'a été enregistrée, le QCM est librement modifiable. Dès la première tentative, l'édition est restreinte (seules les explications peuvent être modifiées).

---

## UC2 — Configurer les paramètres anti-fraude d'un QCM

**Objectif métier** : Paramétrer les mécanismes techniques qui empêchent les apprenants de tricher pendant le passage du QCM. C'est l'étape qui transforme un simple quiz en **évaluation certifiante**.

**Déclencheur** : Après la création du contenu (UC1), le formateur clique sur **"Paramètres et publication"** sur la fiche du QCM.

**Déroulement nominal** — le formateur configure les paramètres suivants :

### 2.1 Randomisation
- **Ordre des questions** : activé / désactivé. Si activé, deux apprenants côte à côte ne voient pas les questions dans le même ordre.
- **Ordre des options** : activé / désactivé. Si activé, "la bonne réponse est C" ne veut rien dire car C n'est pas au même endroit pour tout le monde.
- **Piochage dans une banque** : possibilité de définir une banque de N questions et de n'en tirer que K au hasard par tentative (ex : 50 questions dans la banque → 20 tirées au sort par apprenant).

### 2.2 Contrôle du temps
- **Durée maximale** de la tentative en minutes (contrôlée **côté serveur** — l'apprenant ne peut pas trafiquer son horloge).
- **Fenêtre d'ouverture** : date/heure d'ouverture et de fermeture du QCM (le QCM n'est accessible que pendant cette fenêtre).

### 2.3 Contrôle des tentatives
- **Nombre maximum de tentatives** par apprenant (1, 2, 3… ou illimité).
- **Délai minimum entre deux tentatives** (ex : 24 heures) — empêche le brute-force par essais successifs.
- **Blocage des sessions multiples** : un même compte ne peut pas passer le QCM depuis deux navigateurs simultanément.

### 2.4 Affichage des résultats
- **Affichage immédiat** : à la soumission, l'apprenant voit son score et les bonnes réponses.
- **Affichage différé** : l'apprenant voit uniquement son score à la soumission ; les bonnes réponses ne sont révélées qu'après la fermeture de la fenêtre d'examen (évite la fuite des réponses).

### 2.5 Seuil de validation
- **Score minimum** requis pour considérer le QCM comme "réussi" (ex : 60%).
- **Pondération** dans la note finale de la formation (si le QCM compte pour 30% de la certification, par exemple).

### 2.6 (Optionnel) Proctoring léger
- **Vérification d'identité par webcam** à intervalles aléatoires pendant la tentative (photo instantanée stockée pour audit ultérieur).
- **Désactivation du copier-coller** dans le navigateur pendant la tentative.

**Action finale** : le formateur clique sur **"Publier"**. Le QCM devient visible et accessible aux apprenants dans la fenêtre d'ouverture définie.

**Pourquoi cet UC est séparé de "Créer un QCM"** : la création concerne le **contenu pédagogique** (questions, réponses). La configuration anti-fraude concerne la **sécurité de l'évaluation** (timer, randomisation, tentatives). Les séparer permet à un formateur de réutiliser le même contenu avec des paramètres différents selon le contexte (auto-évaluation libre vs examen certifiant).

---

## UC3 — Créer un atelier pratique

**Objectif métier** : Concevoir un travail pratique évalué demandant à l'apprenant de produire un livrable concret (code, document, vidéo, etc.), à corriger manuellement selon une grille de notation.

**Déclencheur** : Depuis l'espace d'une formation, le formateur clique sur **"Nouvel atelier"**.

**Déroulement nominal** :
1. Le formateur saisit les informations de l'atelier :
   - **Titre** (ex : "Atelier 4 — Implémentation d'une API REST sécurisée")
   - **Énoncé détaillé** (texte enrichi, support images, code, liens)
   - **Compétences visées** (tags rattachés au référentiel)
   - **Ressources** fournies aux apprenants (fichiers attachés, liens, vidéos)
   - **Date limite** de soumission
2. Il configure les modalités de soumission :
   - **Types de livrables acceptés** : fichiers (et extensions autorisées), liens externes, texte libre
   - **Taille maximale** par fichier
   - **Nombre maximum** de fichiers par soumission
3. Il définit (ou réutilise) une **grille de notation** — voir UC4.
4. Il sauvegarde en brouillon ou publie l'atelier — qui devient visible aux apprenants inscrits dès la date d'ouverture.

**Cas alternatifs** :
- *Atelier collaboratif* : possibilité de configurer un atelier nécessitant une soumission de groupe (mode V2 — hors PFE initial).
- *Atelier à étapes* : possibilité de définir plusieurs jalons intermédiaires avec dates limites distinctes (mode V2 — hors PFE initial).

---

## UC4 — Définir une grille de notation

**Objectif métier** : Établir les critères objectifs sur lesquels un livrable sera évalué, garantissant une notation **transparente, structurée et auditable**.

**Déclencheur** : Lors de la création (UC3) ou de l'édition d'un atelier, le formateur clique sur **"Grille de notation"**.

**Déroulement nominal** :
1. Le formateur ajoute des **critères** un par un. Pour chaque critère :
   - **Intitulé** (ex : "Qualité du code", "Sécurité de l'API", "Documentation", "Tests unitaires")
   - **Pondération** (poids dans la note finale, en %)
   - **Niveaux de performance** (ex : Insuffisant / Acceptable / Bon / Excellent — chacun associé à une plage de points)
   - **Description** précise de ce qui est attendu à chaque niveau (descripteur pédagogique)
2. Le total des pondérations doit faire 100% — un avertissement s'affiche sinon.
3. Le formateur peut **enregistrer la grille comme modèle** pour la réutiliser sur d'autres ateliers.

**Exemple concret de grille** :

| Critère | Pondération | Insuffisant (0-25%) | Acceptable (25-50%) | Bon (50-75%) | Excellent (75-100%) |
|---|---|---|---|---|---|
| Fonctionnement | 40% | API non fonctionnelle | Quelques endpoints OK | Tous endpoints OK | Tous endpoints OK + cas limites gérés |
| Sécurité | 30% | Aucune protection | JWT présent mais mal géré | JWT + RBAC corrects | JWT + RBAC + protection CSRF/XSS |
| Documentation | 15% | Aucune | README minimal | README + OpenAPI | README + OpenAPI + diagrammes |
| Tests | 15% | Aucun | Quelques tests unitaires | Tests unitaires + intégration | Couverture > 80% + e2e |

**Visibilité de la grille** : la grille est **affichée à l'apprenant dès l'ouverture de l'atelier** — il sait exactement ce sur quoi il sera évalué (principe d'évaluation transparente).

---

## UC5 — Corriger un livrable

**Objectif métier** : Évaluer le travail soumis par un apprenant selon la grille définie, attribuer une note objective et préparer un retour pédagogique.

**Déclencheur** : Un apprenant a soumis un livrable. Le formateur reçoit une notification et le livrable apparaît dans sa file de corrections.

**Déroulement nominal** :
1. Le formateur ouvre la fiche de soumission, qui affiche :
   - Identité de l'apprenant (nom, photo si disponible)
   - Date et heure de soumission (horodatage scellé)
   - Fichiers/liens/texte soumis
   - Historique des soumissions précédentes (s'il y en a eu)
2. Il consulte le livrable :
   - Téléchargement des fichiers ou aperçu intégré (PDF, code, images)
   - Suivi des liens externes (GitHub, Drive, déploiement)
3. Il applique la **grille de notation** :
   - Pour chaque critère, il sélectionne le niveau atteint (Insuffisant → Excellent)
   - Il peut ajuster finement la note dans la plage du niveau
   - Il saisit un **commentaire textuel** par critère pour justifier sa note
4. Le système **calcule automatiquement** le score total pondéré.
5. Le statut de la soumission passe à **"En correction"** (verrouille toute modification de l'apprenant).
6. Le formateur peut **interrompre la correction** et la reprendre plus tard — son travail est sauvegardé en brouillon.

**Outils complémentaires** :
- **Annotation de fichiers PDF** : surligneur, commentaires en marge.
- **Vérification anti-plagiat** (optionnel V2) : comparaison aux autres soumissions de la même promotion.

**Statut final** : "Soumis" → "En correction" → "Noté".

---

## UC6 — Rédiger un feedback structuré

**Objectif métier** : Compléter la correction par un retour pédagogique qualitatif qui aide l'apprenant à progresser, au-delà de la simple note.

**Déclencheur** : Le formateur a complété la grille (UC5) et clique sur **"Rédiger le feedback"**.

**Déroulement nominal** :
1. Le formateur saisit un **commentaire général** (synthèse de la performance — points forts, axes d'amélioration, encouragements).
2. Pour chaque critère noté, il peut compléter ou enrichir le commentaire précédemment saisi.
3. Il peut joindre des **fichiers annotés** (le PDF du livrable avec ses annotations, des captures d'écran de code commenté, etc.).
4. Il prévisualise le rendu côté apprenant.
5. Il clique sur **"Envoyer le feedback"** :
   - Le statut de la soumission passe à **"Noté — Feedback envoyé"**
   - L'apprenant reçoit une notification
   - Le feedback est archivé de manière immuable

**Bonne pratique pédagogique** : Cert_EET impose au minimum :
- Le commentaire général ne peut pas être vide
- Au moins **un critère** doit avoir un commentaire textuel (pas seulement une note)

Cette contrainte évite les corrections "sèches" sans retour qualitatif.

**Lien avec la certification** : la moyenne de l'apprenant sur tous les ateliers et QCM de la formation détermine s'il est éligible à recevoir un certificat (cf. UC du Visiteur Public et workflow de certification).

---

## UC7 — Suivre la progression de ses apprenants

**Objectif métier** : Disposer d'une vue analytique sur la performance individuelle et collective des apprenants de ses formations.

**Déclencheur** : Le formateur accède à l'onglet **"Suivi"** d'une de ses formations.

**Déroulement nominal** :
1. Le formateur sélectionne une formation dans sa liste.
2. La plateforme affiche un tableau de bord pédagogique :
   - **Vue collective** :
     - Nombre d'apprenants inscrits / actifs / décrocheurs
     - Taux de complétion global de la formation
     - Score moyen sur les QCM
     - Score moyen sur les ateliers
     - Histogramme de répartition des scores
   - **Vue individuelle** (tableau triable et filtrable) :
     - Nom de chaque apprenant
     - Avancement (%)
     - Dernière activité
     - Scores QCM
     - Scores ateliers
     - Statut de risque (alerte décrochage) — voir UC8
3. Le formateur peut cliquer sur un apprenant pour accéder à sa **fiche détaillée** :
   - Historique chronologique de toutes ses activités
   - Détail des tentatives QCM
   - Détail des soumissions d'ateliers
   - Conversations chatbot (si l'apprenant l'a explicitement autorisé)

**Isolation RBAC** : le formateur ne voit **que les apprenants de ses propres formations**. Aucun croisement avec les autres formateurs n'est possible.

**Cas d'usage typique** : avant chaque session live (Teams), le formateur consulte cette vue pour adapter son discours aux lacunes observées.

---

## UC8 — Recevoir une alerte de décrochage

**Objectif métier** : Être informé proactivement qu'un apprenant montre des signes d'abandon ou de difficulté, afin d'intervenir avant qu'il ne décroche définitivement.

**Déclencheur** : Le **chatbot IA en Mode Suivi** (cf. F4 du CdC) détecte un pattern de risque chez un apprenant et émet une alerte au formateur responsable.

**Critères de déclenchement** (analysés par le chatbot) :
- Absence de connexion depuis plus de 7 jours
- Échec consécutif sur 2 tentatives QCM
- Livrable d'atelier en retard de plus de 48h après la date limite
- Score moyen en chute libre sur les 3 dernières évaluations
- Réduction marquée du temps passé sur la plateforme

**Déroulement nominal** :
1. Le système identifie le pattern et génère une alerte.
2. Le formateur reçoit la notification via :
   - Badge sur l'icône "Alertes" de son tableau de bord
   - (Optionnel) Email de synthèse hebdomadaire
3. Il consulte le détail de l'alerte :
   - Identité de l'apprenant concerné
   - Type de risque détecté
   - Données factuelles (dates, scores, historique)
   - Suggestion d'action (proposée par le LLM : "Envoyer un message d'encouragement", "Proposer un rendez-vous", "Aménager le délai de l'atelier en cours")
4. Le formateur peut **marquer l'alerte comme traitée** après avoir entrepris une action (le système enregistre l'action pour audit).

**Caractère différenciant** : aucune des plateformes du benchmark ne propose ce mode de suivi proactif assisté par IA.

---

## UC9 — Exporter un rapport de session

**Objectif métier** : Générer un document de synthèse exportable pour la documentation institutionnelle, les bilans pédagogiques ou les comptes-rendus à la direction.

**Déclencheur** : Le formateur clique sur **"Exporter"** depuis la vue de suivi d'une formation.

**Déroulement nominal** :
1. Le formateur choisit le **type de rapport** :
   - Rapport global de session (tous les apprenants, tous les modules)
   - Rapport individuel (un apprenant, tous ses résultats)
   - Rapport par module (un QCM ou atelier, tous les apprenants)
2. Il choisit le **format** : PDF (mise en page institutionnelle) ou CSV (données brutes exploitables dans Excel).
3. Il sélectionne la **période** couverte.
4. Le système génère le fichier (en tâche de fond pour les gros volumes — cf. note technique synchrone/asynchrone) et propose le téléchargement.

**Contenu du rapport** :
- En-tête institutionnel ESPRIT
- Métadonnées de la formation (titre, dates, formateur, nombre d'apprenants)
- Statistiques agrégées
- Détail par apprenant (selon le type choisi)
- Graphiques de progression

**Limitation** : le formateur ne peut exporter que les données **de ses propres formations** — l'export global de la plateforme est réservé à l'Administrateur.

---

## Synthèse — Ce que le formateur **NE PEUT PAS** faire

| Action | Raison |
|---|---|
| Voir les apprenants d'autres formateurs | Isolation RBAC (F5) |
| Créer ou modifier des comptes utilisateurs | Réservé à l'Administrateur |
| Émettre un certificat manuellement | Émission automatique sur validation des conditions de réussite |
| Révoquer un certificat | Réservé à l'Administrateur (cas grave de fraude détectée a posteriori) |
| Modifier un QCM après la première tentative | Intégrité de l'évaluation |
| Modifier une note après envoi du feedback | Sauf procédure de révision tracée (cas exceptionnel) |
| Accéder aux journaux d'audit globaux | Réservé à l'Administrateur |

---

*Fin du document — UC Formateur · Cert_EET v1.0*