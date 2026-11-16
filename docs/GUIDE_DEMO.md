# Cert_EET — Guide de démonstration

> Une démonstration de 15 à 20 minutes, rôle par rôle, sur le jeu de
> démonstration chargé par `npm run demo:charger` (US-QUAL-01).

## 1. Préparer (une fois, 5 minutes avant)

> Démonstration **en ligne** (https://cert-eet.duckdns.org) : voir la section 6 ; les comptes et le
> scénario ci-dessous sont les mêmes.

Sous Git Bash, à la racine du dépôt, la pile de développement lancée
(`docker-compose.yml` + `docker-compose.dev.yml`) :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run demo:charger
```

Le script est **idempotent** : le relancer ne duplique rien et remet les mots
de passe des comptes de démonstration. Il affiche « Jeu de démonstration
prêt ». Les certificats sont produits par le worker de l'api en quelques
secondes (PDF réels, vérifiables).

Ouvrir **https://localhost** dans Chrome. Pour enchaîner les rôles sans se
déconnecter, utiliser une fenêtre normale et une fenêtre de navigation privée
(chaque fenêtre garde sa session, même après un rafraîchissement — US-AUTH-17).

## 2. Comptes

Mot de passe commun : **`Demo_Passe123!`**

| Rôle | Email | Ce qu'il montre |
|---|---|---|
| Administrateur | `demo-admin@cert-eet.local` | Tableau de bord global, demandes à traiter, formations, certificats, audit |
| Formateur | `demo-formateur@cert-eet.local` (Karim Trabelsi) | Tableau de bord formateur, correction d'un livrable, demande et proposition de formation |
| Formatrice | `demo-formateur2@cert-eet.local` (Leïla Haddad) | A une demande d'affectation et une proposition en attente |
| Apprenante | `demo-apprenant@cert-eet.local` (Sana Gharbi) | Catalogue, parcours, QCM réussi (100), certificat |
| Apprenant | `demo-apprenant2@cert-eet.local` (Youssef Jlassi) | QCM échoué puis réussi (40 puis 80), livrable déposé |
| Apprenante | `demo-apprenant3@cert-eet.local` (Mariem Ayari) | Échec au QCM (alerte), certificat d'une formation archivée |
| Apprenant | `demo-apprenant4@cert-eet.local` (Ahmed Mejri) | Inactif (alerte), inscription suspendue |
| Candidat | `demo-candidat@cert-eet.local` (Nour Chebbi) | Demande de rôle formateur en attente |
| Compte sécurité (MFA) | `demo-securite@cert-eet.local` | Connexion en deux étapes |

Compte MFA : secret TOTP de démonstration `JBSWY3DPEHPK3PXP` — l'ajouter une
fois dans une application d'authentification (Google Authenticator,
FreeOTP…) par saisie manuelle, puis taper le code à 6 chiffres affiché.
**Valeur de démonstration uniquement**, jamais en production.

## 3. Données chargées

| Formation | Statut | Formateur(s) | Contenu |
|---|---|---|---|
| Développement web full-stack (NestJS et Next.js) | Ouverte | Karim, Leïla | 2 modules, QCM publié (5 questions, 4 tentatives notées), atelier publié avec grille validée, 2 livrables à corriger, 2 alertes ouvertes |
| DevOps : Docker, CI/CD et Kubernetes | Fermée | Karim | Sana et Youssef certifiés, Ahmed suspendu |
| Cybersécurité opérationnelle (SOC) | Ouverte | Leïla | Sana inscrite ; Karim peut demander à l'enseigner |
| Bureautique avancée et Power BI | Archivée | Karim | Mariem certifiée |
| Data science avec Python | Ouverte | Leïla | Commence dans 5 jours |

En attente d'une décision de l'administrateur : 1 demande de rôle, 1 demande
d'affectation (Leïla -> DevOps), 1 proposition de formation (Leïla,
« Kubernetes en production »).

## 4. Scénario conseillé

L'apprenant a au plus cinq entrées de menu dans l'en-tête ; le formateur et
l'administrateur ont un **menu latéral groupé** (US-UX-02), avec une icône par
entrée et un compteur rouge de ce qui les attend (réductible aux icônes par
« Réduire le menu », en tiroir sur mobile). Chaque accueil commence par
**« À faire maintenant »** (US-UI-03). Les écrans suivent
la charte ESPRIT décrite dans `docs/GUIDE_STYLE.md` (captures dans
`docs/guide-style/`).

### 4.1 Visiteur (1 min)
1. https://localhost : page publique (présentation, atouts) ; « Se connecter »
   et « S'inscrire » en haut à droite.
2. Ouvrir une page protégée, par exemple https://localhost/mes-certificats :
   redirection vers la connexion ; après connexion, retour sur la page
   demandée (US-NAV-01).

### 4.2 Apprenante — Sana (4 min)
1. Connexion -> arrivée sur **Mon espace** (page du rôle, US-UI-03) : « À faire maintenant » puis les formations en cours ; le catalogue reste dans le menu. Pour voir des éléments à faire, se connecter avec `demo-apprenant3@cert-eet.local` (QCM à retenter, livrable à rendre).
2. **F5** : la session est gardée (US-AUTH-17).
3. *Mes formations* -> « Développement web full-stack » : modules, QCM,
   atelier, avancement.
4. *Mes évaluations* : tentative notée 100 / 100 et son corrigé.
5. *Mes certificats* : liste compacte ; ouvrir la fiche du certificat DevOps
   (fenêtre) -> télécharger le PDF ; ouvrir la
   **page de vérification publique** (lien du certificat) dans la fenêtre
   privée : authenticité vérifiable sans compte.

### 4.3 Formateur — Karim (6 min)
1. Connexion -> **Accueil** (tableau de bord formateur, US-DASH-03, réorganisé
   par US-UX-03) : « À faire maintenant », puis 4 indicateurs cliquables (À
   corriger, Alertes, Apprenants en cours, Réussite aux QCM), *Mes formations* en
   cartes (jauge d'avancement, compteurs « à corriger », « alertes », « signalés
   par l'IA » ; « Vue tableau » pour toutes les colonnes), les apprenants à
   risque, puis *Activité et statistiques* avec la période (7 j, 30 j, 90 j,
   1 an, « Personnaliser »).
   Menu latéral : Accueil · **Enseigner** (Mes formations, Demander une
   formation, Proposer une formation) · **Évaluer** (Livrables à corriger,
   Tentatives des QCM) · **Suivre** (Apprenants, Alertes, Rapports) ·
   **Explorer** (Catalogue). Montrer les compteurs (« Livrables à corriger »,
   « Alertes ») : ils baissent sans recharger la page quand on traite.
2. Carte « Développement web » -> *Suivi* (ou menu *Apprenants*) : apprenants
   à risque (Ahmed inactif, Mariem en échec).
   Plus bas, section **Apprenants à risque (IA)** : niveau suggéré par le
   modèle (Ahmed élevé ; Mariem, Youssef, Yassine moyen ; Sana faible), trois
   raisons en français et, à côté, les alertes des règles. Rappeler : « le
   modèle suggère, le formateur décide ». Le premier calcul a lieu une minute
   après le démarrage de l'api, puis une fois par jour.
3. *Alertes* : pastilles « Ouvertes · Traitées · Toutes » avec leur nombre ;
   traiter l'alerte d'Ahmed (action, commentaire). *Rapports* d'une
   formation : une carte par portée (vue globale, un apprenant, un module),
   format PDF ou CSV, « Générer ».
4. *Mes formations* -> formation : onglets **Vue d'ensemble**, **Contenu**
   (modules repliables, un bouton « Ajouter » par module : QCM, atelier, lien ou
   vidéo, fichier, support pour l'IA ; « Masquer les brouillons »),
   **Apprenants** (suivi), **Rapports** (US-UX-04).
   Puis *Livrables à corriger* (ou l'onglet Contenu) -> atelier « API REST de réservation » ->
   corriger le livrable de Youssef avec la grille, finaliser : le feedback
   devient visible à l'apprenant.
5. **Importer des questions depuis un fichier** (US-IA-08) : *Mes formations*
   -> formation -> « Ajouter » -> « Nouveau QCM » ; dans l'éditeur, le bandeau
   d'étapes (Questions, Paramètres anti-fraude, Publication, Résultats) donne la
   prochaine action (US-UX-05) ; « Ajouter des questions » -> « Importer depuis un fichier » (PDF, PDF
   scanné, DOCX, TXT, CSV, XLSX ou image) ; l'IA recopie les questions, le
   formateur relit, corrige et choisit celles à ajouter. L'IA réelle (Claude)
   répond dès que `ANTHROPIC_API_KEY` est dans le `.env` (US-IA-09) ; sans
   clé, la fenêtre affiche « IA non configurée » et le lancement est bloqué.
   Toute erreur (crédit épuisé, clé refusée, surcharge) s'affiche en français
   dans la carte de l'import ou de la génération.
6. **Surveillance par IA** (US-QCM-15) : sur un QCM dont la surveillance webcam
   est activée, l'apprenant accepte, passe le QCM : il ne voit pas sa vidéo,
   seulement le bandeau « Surveillance par caméra active ». Montrer un
   téléphone à la caméra (2 s), ou faire entrer une deuxième personne (3 s),
   ou quitter la page plus de 5 s. Côté Karim : « À faire maintenant » ->
   « Voir les photos », onglet *Alertes › Surveillance des QCM* : carte avec
   la photo de l'instant, « Agrandir », « Voir la tentative », « Marquer
   examinée ». Pour la démonstration de l'absence, mettre
   `SURVEILLANCE_ABSENCE_SECONDES=60` (5 minutes par défaut). Rappeler :
   l'analyse tourne sur le poste de l'apprenant, l'IA signale, le formateur
   décide. Une photo n'est prise qu'en cas d'anomalie (US-QCM-16) ; en
   développement, une photo de contrôle par minute en plus et une ligne
   « Diagnostic » dans le bandeau (scores du modèle) pour vérifier la caméra.
   Montrer ensuite le signal rouge « alerte IA à examiner » dans la liste
   des tentatives du QCM (filtre « Signalées par l'IA ») et dans le suivi
   pédagogique de la formation (US-QCM-17).
7. **Demander une formation** (US-FORM-07) : choisir « Cybersécurité
   opérationnelle », motif -> demande en attente.
8. **Proposer une formation** (US-FORM-08) : remplir le formulaire -> en
   attente.

### 4.4 Administrateur (6 min)
1. Connexion -> **Accueil** (tableau de bord global) : « À faire maintenant »
   (demandes à décider et alertes système, une seule fois), puis
   **Indicateurs** groupés *Personnes*, *Formations*, *Évaluations*,
   *Certificats* (période en pastilles 7 j / 30 j / 90 j / 1 an ou
   « Personnaliser ») : chaque carte mène à sa liste filtrée — cliquer
   « Formations ouvertes » ouvre *Formations* filtrée sur « Ouverte »,
   « Certificats révoqués » ouvre *Certificats* sur « Révoqués ». Puis
   **Activité** : dernières actions en clair (icône, libellé, acteur ou
   « Système », pastille « Échec ») et graphique quotidien.
   Menu latéral : Accueil · **Personnes** (Comptes, Demandes de rôle) ·
   **Formations** (Formations, Demandes d'affectation, Propositions) ·
   **Certificats** · **Pilotage** (Rapports, Prédiction du risque, Générations
   IA) · **Sécurité** (Journal d'audit) ; les demandes en attente ont leur
   compteur.
   Toutes les listes (US-UX-07) ont la même barre : recherche, filtres en
   pastilles avec compteurs, « Actualiser » ; chaque ligne montre **une**
   action et range les autres dans « ⋯ » (les dangereuses en dernier, en
   rouge, toujours confirmées). Sous 640 px, chaque ligne devient une carte.
2. *Demandes d'affectation* : **Accepter** la demande de Karim (« ⋯ » ›
   Refuser pour l'autre choix) -> il enseigne désormais « Cybersécurité »
   (email envoyé, visible dans Mailhog http://localhost:8025).
3. *Propositions* : sur la proposition de Karim, « ⋯ » › **Demander des
   modifications** (commentaire) ; en fenêtre privée, Karim corrige et
   renvoie ; puis **Accepter** -> formation créée **en brouillon** ; dans
   *Formations* (pastille « Brouillon »), « **Gérer** » › Statut pour la
   **publier** (elle entre au catalogue). « Gérer » réunit aussi Modifier,
   Modules, Formateurs et Inscriptions.
4. *Demandes de rôle* : **Approuver** Nour comme formatrice. *Comptes* :
   recherche par nom ou adresse, pastilles par rôle et par statut,
   « Importer des comptes » en haut à droite.
5. *Prédiction du risque* : même présentation, pour toutes les formations.
   Pour montrer le repli silencieux : `docker compose … stop ml` ; l'application
   continue normalement (les règles s'appliquent) et, sans score récent,
   l'écran affiche « Prédiction indisponible ».
6. *Certificats* : liste compacte, fiche en fenêtre (clic sur le nom du
   titulaire ou « Fiche » ; croix, Échap ou clic à l'extérieur pour fermer),
   « ⋯ » › Révoquer ; *Journal d'audit* : toutes les actions
   précédentes, en clair (icône, libellé humain, « Système »), filtrables par
   catégorie (pastilles avec compteurs), acteur, résultat et période, et
   exportables ; la carte « Échecs » n'affiche que les échecs. *Rapports* :
   une carte par modèle (format PDF ou CSV, « Générer »), puis « Mes
   rapports » (« Télécharger » quand c'est prêt).

### 4.5 Sécurité (2 min)
1. Connexion de `demo-securite@` : mot de passe puis **code MFA**.
2. *Sécurité du compte* : MFA active, changement de mot de passe.
3. Déconnexion puis **F5** : reste déconnecté.

## 5. Si quelque chose coince

| Symptôme | Remède |
|---|---|
| « Connexion … impossible » au chargement | L'api n'est pas encore prête : attendre la fin de `nest start --watch`, relancer `demo:charger`. |
| Certificats encore « en attente » | Vérifier que le worker tourne (`CERTIFICATS_WORKER=on`) ; ils sont générés en quelques secondes. |
| Écran de connexion après un rafraîchissement | Vider les cookies de `localhost`, se reconnecter ; vérifier l'heure du PC (jeton signé). |
| « Prédiction indisponible » partout | Service `ml` arrêté ou calcul pas encore fait : `docker compose … ps ml` (doit être `healthy`), puis attendre une minute après le redémarrage de l'api. |
| Erreur 429 | Trop de connexions en une minute depuis le même poste : patienter une minute. |

Recette automatique de toute la navigation (avant la démo) :
`outils/recette/README.md`.

## 6. Démonstration en ligne

Adresse : **https://cert-eet.duckdns.org** — mêmes comptes (section 2), mêmes données (section 3), même
scénario (section 4). Serveur Hetzner Cloud à Helsinki : à présenter comme **environnement de
démonstration hébergé en Europe** (la cible de production reste un hébergement en Tunisie, ADR-07).
Détails et décisions : `engineering-log/120-DEPLOY-mise-en-ligne.md`. Réinstaller le serveur
depuis zéro : `deploy/hetzner/README.md` (contrôle complet : `deploy/hetzner/scripts/verifier.sh`).

En plus de la version locale :
- **Connexion avec GitHub ou Google** fonctionnelle (applications OAuth dédiées au domaine).
- **Vrais e-mails** (Gmail) : inscription, activation, « mot de passe oublié » — avec une vraie adresse.
- **Assistant IA** actif : déposer un support de cours dans un module puis générer des questions.

### La veille de la soutenance
Sur le serveur (`ssh -i ~/.ssh/cert_eet_hetzner root@<IP>`), dans `/root/CERT_EET` :

```bash
docker compose ps                          # 8 services, tous healthy (Mailhog : Up)
docker compose exec api npm run demo:charger   # remet les données et les mots de passe
```

Puis, depuis un poste, la recette automatique (`outils/recette`, Git Bash) :

```bash
BASE=https://cert-eet.duckdns.org CHROME="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node audit-navigation.js
```

Résultat attendu : « 0 problème(s) ».

### Exploitation
| Besoin | Commande (sur le serveur, dans `/root/CERT_EET`) |
|---|---|
| État | `docker compose ps` |
| Relancer | `docker compose up -d --wait` |
| Arrêter | `docker compose down` (**jamais `-v`** : effacerait les données) |
| Mettre à jour | `git pull` (le web se recharge seul ; `docker compose up -d --wait api` si l'api change de dépendances) |
| Journaux | `docker compose logs -f api` |

Le fichier `docker-compose.hetzner.yml` et le `.env` du serveur ne sont pas versionnés ; `COMPOSE_FILE`
dans le `.env` évite les `-f`.

### Entre deux démonstrations
Un serveur Hetzner éteint reste facturé. Pour faire une pause : instantané (snapshot) du serveur, puis
suppression. Avant la démonstration : recréer le serveur depuis l'instantané, mettre la nouvelle IP dans
DuckDNS, attendre que le nom pointe dessus, puis `docker compose ps`.

### Si quelque chose coince (en ligne)
| Symptôme | Remède |
|---|---|
| Le site ne répond pas | `docker compose ps` ; si un service manque : `docker compose up -d --wait`. Serveur recréé : vérifier l'IP dans DuckDNS. |
| Avertissement de certificat | Certificat expiré (90 jours) : le renouveler (journal 120, « Limites »). |
| Aucun e-mail reçu | Regarder les indésirables ; journaux de l’api (`docker compose logs api`, chercher « SMTP »). |
| Connexion GitHub / Google refusée | L'adresse de rappel de l'application OAuth doit être exactement celle du domaine. |

