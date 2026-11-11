# Cert_EET — Guide de démonstration

> Une démonstration de 15 à 20 minutes, rôle par rôle, sur le jeu de
> démonstration chargé par `npm run demo:charger` (US-QUAL-01).

## 1. Préparer (une fois, 5 minutes avant)

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

### 4.1 Visiteur (1 min)
1. https://localhost : page publique (présentation, atouts).
2. Ouvrir une page protégée, par exemple https://localhost/mes-certificats :
   redirection vers la connexion ; après connexion, retour sur la page
   demandée (US-NAV-01).

### 4.2 Apprenante — Sana (4 min)
1. Connexion -> arrivée directe sur le **catalogue** (page du rôle).
2. **F5** : la session est gardée (US-AUTH-17).
3. *Mes formations* -> « Développement web full-stack » : modules, QCM,
   atelier, avancement.
4. *Mes évaluations* : tentative notée 100 / 100 et son corrigé.
5. *Mes certificats* : certificat DevOps -> télécharger le PDF ; ouvrir la
   **page de vérification publique** (lien du certificat) dans la fenêtre
   privée : authenticité vérifiable sans compte.

### 4.3 Formateur — Karim (6 min)
1. Connexion -> **tableau de bord formateur** (US-DASH-03) : formations par
   statut, réussite QCM, 2 livrables à évaluer, 2 alertes, graphique ; filtre
   de période (7 j, 30 j…).
2. Tableau « Mes formations » -> *Suivi* de « Développement web » : apprenants
   à risque (Ahmed inactif, Mariem en échec).
3. *Alertes* : traiter l'alerte d'Ahmed (action, commentaire).
4. *Mes formations* -> formation -> atelier « API REST de réservation » ->
   corriger le livrable de Youssef avec la grille, finaliser : le feedback
   devient visible à l'apprenant.
5. **Demander une formation** (US-FORM-07) : choisir « Cybersécurité
   opérationnelle », motif -> demande en attente.
6. **Proposer une formation** (US-FORM-08) : remplir le formulaire -> en
   attente.

### 4.4 Administrateur (6 min)
1. Connexion -> **tableau de bord global** : utilisateurs par rôle,
   formations par statut, inscriptions, réussite, certificats, carte
   **Demandes en attente** (rôle, affectations, propositions).
2. *Affectations* : accepter la demande de Karim -> il enseigne désormais
   « Cybersécurité » (email envoyé, visible dans Mailhog
   http://localhost:8025).
3. *Propositions* : sur la proposition de Karim, **demander des
   modifications** (commentaire) ; en fenêtre privée, Karim corrige et
   renvoie ; puis **accepter** -> formation créée **en brouillon** ; dans
   *Formations*, la **publier** (elle entre au catalogue).
4. *Demandes de rôle* : approuver Nour comme formatrice.
5. *Certificats* : supervision ; *Journal d'audit* : toutes les actions
   précédentes, filtrables et exportables.

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
| Erreur 429 | Trop de connexions en une minute depuis le même poste : patienter une minute. |

Recette automatique de toute la navigation (avant la démo) :
`outils/recette/README.md`.
