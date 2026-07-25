# Cert_EET — Référentiel des Diagrammes de Séquence

> Document de référence · Version 1.0 · Juin 2026
> Iyed Omri — PFE ESPRIT — Ingénierie Logicielle
>
> Ce document recense l'intégralité des **16 diagrammes de séquence** produits pour Cert_EET,
> couvrant **tous les scénarios réels** de l'application pour les 4 acteurs (Apprenant,
> Formateur, Administrateur, Visiteur Public). Chaque scénario est décrit par ses étapes,
> ses participants, ses chemins d'erreur et ses références au cahier des charges.
>
> **Ordre de lecture :** les diagrammes sont numérotés dans l'ordre du flux applicatif réel,
> du premier accès jusqu'à la supervision institutionnelle.

---

## Flux applicatif global

```
DS-01 (Auth)
    ↓
DS-08 (Inscription)  ←  DS-15 (Admin : créer compte)
    ↓                ←  DS-16 (Admin : gérer formations)
DS-09 (Accès module)
    ├── DS-02 (Passer QCM)
    └── DS-03 (Soumettre livrable)  →  DS-04 (Émettre certificat)
                                            ↓
                                       DS-05 (Vérification publique)

DS-06 (Générer questions IA)     ← Formateur
DS-07 (Révoquer certificat)      ← Admin
DS-10 (Gérer profil)             ← Tout utilisateur
DS-11 (Désinscription)           ← Apprenant + Admin
DS-12 (Créer QCM)                ← Formateur
DS-13 (Créer atelier)            ← Formateur
DS-14 (Suivi + alertes + export) ← Formateur
DS-15 (Comptes utilisateurs)     ← Admin
DS-16 (Formations + audit)       ← Admin
```

---

## Tableau de synthèse

| # | Nom | Acteur(s) | UC référencé | Besoin CdC | Parties |
|---|---|---|---|---|---|
| DS-01 | Authentification + MFA | Tous | — | F5, F7 | 4 |
| DS-02 | Passer un QCM | Apprenant | UC2 App | F1 | 5 |
| DS-03 | Soumettre + Corriger un livrable | Apprenant + Formateur | UC4 App, UC5 For | F2 | 2 |
| DS-04 | Émettre un certificat | Système (asynchrone) | — | F3 | 3 |
| DS-05 | Vérification publique d'un certificat | Visiteur Public | UC1-3 VP | F3 | 4 |
| DS-06 | Générer des questions QCM par IA | Formateur | UC10-11 For | F4 | 3 |
| DS-07 | Révoquer un certificat | Administrateur | UC6 Admin | F3, NF3 | 5 |
| DS-08 | S'inscrire à une formation | Apprenant + Admin | UC1 App, UC4 Admin | F5 | 3 |
| DS-09 | Accéder au module et lancer une évaluation | Apprenant | UC2+UC4 App | F1, F2 | 3 |
| DS-10 | Gestion du profil utilisateur | Tous | — | F7 | 4 |
| DS-11 | Désinscription d'une formation | Apprenant + Admin | UC1 App, UC4 Admin | F5 | 3 |
| DS-12 | Créer un QCM complet | Formateur | UC1+UC2 For | F1 | 3 |
| DS-13 | Créer un atelier + grille de notation | Formateur | UC3+UC4 For | F2 | 3 |
| DS-14 | Suivi progression + alertes + export rapport | Formateur | UC7+UC8+UC9 For | F6 | 3 |
| DS-15 | Gestion des comptes utilisateurs | Administrateur | UC1+UC2 Admin | F5, F7 | 4 |
| DS-16 | Gestion formations + rapports + audit | Administrateur | UC3-5+UC7-10 Admin | F5, F6, F7 | 5 |

---

## DS-01 — Authentification + MFA

**Fichier :** `DS01_Authentification.puml`
**Acteur :** Tout utilisateur authentifiable (Apprenant / Formateur / Administrateur)
**Références :** F5 (RBAC), F7 (Sécurité), ADR-08 (JWT RS256)

### Participants
`Utilisateur` · `Frontend` · `AuthController` · `AuthService` · `PostgreSQL` · `Redis` · `JwtService`

### Étapes et scénarios couverts

**Étape 1 — Saisie des identifiants**
- Validation du DTO (format email, longueur)
- Vérification de l'existence du compte et de son statut (`ACTIF` requis)
- Vérification du mot de passe via `bcrypt.compare()`
- ⚠️ Chemin d'erreur : compte inexistant, statut DESACTIVE/ANONYMISE, mot de passe incorrect → même message générique (sécurité par opacité)

**Étape 2 — MFA désactivée** → émission directe des tokens JWT
- Génération access token (15 min) + refresh token (7 j) via RS256
- Création de la session en base
- Mise à jour de `derniereConnexion`

**Étape 3 — MFA activée** → vérification TOTP
- Émission d'un `mfaToken` temporaire (5 min)
- Vérification du code TOTP (Google Authenticator) côté serveur
- Usage unique : suppression du `mfa_session` dans Redis après validation
- ⚠️ Chemin d'erreur : token expiré, code TOTP invalide

**Étape 4 — Refresh automatique (avec rotation)**
- Interception transparente des HTTP 401 par le frontend
- Vérification de la signature RS256 du refresh token + consultation de la denylist Redis
- Émission d'une nouvelle paire access + refresh (rotation) : l'ancien refresh token est brûlé (marqué consommé en base + denylist Redis)
- Détection de rejeu : un refresh token déjà consommé qui est représenté révoque toute la famille de tokens de la connexion
- ⚠️ Chemin d'erreur : refresh token expiré, révoqué ou rejeu détecté → redirection /login

**Étape 5 — Déconnexion**
- Blacklisting de l'access token ET du refresh token dans Redis (TTL = durée restante)
- Mise à jour de la session en base (`active = false`)
- Journal d'audit `LOGOUT`

### Points de conception clés
- Messages d'erreur identiques pour « compte inexistant » et « mauvais mot de passe » (opacité)
- Tokens stockés côté client : access token en mémoire JavaScript, refresh token en cookie `httpOnly`
- Révocation instantanée via Redis blocklist (stateless JWT avec révocation)

---

## DS-02 — Passer un QCM

**Fichier :** `DS02_PasserQCM.puml`
**Acteur :** Apprenant
**Références :** F1 (QCM anti-fraude), `ConfigurationAntiFraude`

### Participants
`Apprenant` · `Frontend` · `QCMController` · `QCMService` · `AntiFraudeService` · `PostgreSQL` · `Redis`

### Étapes et scénarios couverts

**Étape 1 — Vérification d'accès (100% côté serveur)**
- QCM statut `Publié` ?
- `NOW()` dans la fenêtre `[dateOuverture, dateFermeture]` ?
- `nbTentativesPassees < nbTentativesMax` ?
- Délai depuis la dernière tentative respecté ?
- Session QCM active sur un autre appareil ? (blocage multi-session)
- ⚠️ Chemin d'erreur : refus avec motif précis pour chaque condition

**Étape 2 — Création de la tentative et randomisation**
- Chargement de toutes les questions avec leurs options
- Randomisation via algorithme Fisher-Yates (si activée) : ordre des questions ET des options
- Piochage de K questions parmi N (si banque configurée)
- **Les bonnes réponses (`estCorrecte`) ne sont jamais transmises au frontend**
- Démarrage du timer côté serveur dans Redis (`SETEX` avec TTL)
- Création de la `TentativeQCM` (`statut: EN_COURS`)
- Verrouillage de session (empêche double passage)

**Étape 3 — Sauvegarde automatique des réponses**
- Sauvegarde incrémentale à chaque réponse sélectionnée
- Vérification du timer Redis à chaque requête
- ⚠️ Timer expiré → soumission automatique avec `statut: ABANDONNEE_TIMER`

**Étape 4 — Soumission finale et scoring**
- Scoring entièrement côté serveur : comparaison réponses vs `estCorrecte` en base
- Calcul pondéré : `score = Σ(pondération × estCorrecte) / Σ(pondération) × 100`
- Mise à jour de la tentative (`statut: SOUMISE`, `score`, `dateFin`, `dureeEffective`)
- Nettoyage Redis (timer + session lock)
- Journal d'audit `QCM_SOUMIS`

**Étape 5 — Affichage du résultat**
- Affichage immédiat : score + bonnes réponses + explications
- Affichage différé : score uniquement (les corrections attendent la fermeture de la fenêtre)

### Points de conception clés
- Toute la logique d'évaluation est côté serveur (F1) — rien de confidentiel n'est transmis au client
- Timer contrôlé par Redis TTL, non par le navigateur — incontournable
- Scoring immuable après soumission (historique certifiant)

---

## DS-03 — Soumettre + Corriger un livrable

**Fichier :** `DS03_Livrable_Correction.puml`
**Acteurs :** Apprenant (soumission) + Formateur (correction)
**Références :** F2 (Ateliers pratiques)

### Participants
`Apprenant` · `Formateur` · `Frontend` · `AtelierController` · `AtelierService` · `StorageService` · `PostgreSQL` · `NotifService`

### Étapes et scénarios couverts

**Partie 1 — Soumission (Apprenant)**
- Affichage de l'atelier avec statut actuel (nouveau / déjà soumis)
- Vérifications : date limite non dépassée, taille fichier, type MIME
- Calcul du `hashTracabilite` (SHA-256 du contenu déposé, anti-plagiat)
- Upload vers S3/MinIO
- Première soumission → `INSERT` avec `version: 1`
- Remplacement avant deadline → `UPDATE` avec `version: version + 1`, suppression ancien fichier
- ⚠️ Chemins d'erreur : deadline dépassée, fichier trop volumineux, format non autorisé
- Notification automatique au formateur

**Partie 2 — Correction (Formateur)**
- Listage des livrables avec statut `SOUMIS`
- Ouverture de la correction → livrable passe à `EN_CORRECTION`
- **Verrouillage** : l'apprenant ne peut plus remplacer son livrable
- Chargement du livrable, de la grille et des critères
- Notation critère par critère (niveau atteint + commentaire par critère)
- Recalcul temps réel du score total pondéré : `Σ(note × pondération / 100)`
- Validation : tous critères notés + total pondérations = 100%
- `INSERT INTO feedbacks` → feedback immuable après envoi
- Livrable passe à `NOTE`
- Notification à l'apprenant
- ⚠️ Déclenchement du workflow de certification (DS-04) si conditions réunies

### Points de conception clés
- Verrouillage progressif : BROUILLON → SOUMIS → EN_CORRECTION → NOTE
- Le feedback est immuable après envoi (aucune modification possible)
- `hashTracabilite` : preuve d'antériorité contre le plagiat et les substitutions

---

## DS-04 — Émission d'un certificat

**Fichier :** `DS04_Emission_Certificat.puml`
**Acteur :** Système (déclenché automatiquement post-validation)
**Références :** F3 (Certification numérique), ADR-04 (Bull/Redis), ADR-10

### Participants
`CertificatService` · `Bull Queue` · `CertificatWorker` · `PDFService` · `CryptoService` · `QRCodeService` · `StorageService` · `PostgreSQL` · `NotifService` · `Apprenant`

### Étapes et scénarios couverts

**Déclenchement**
- Vérification de l'éligibilité : tous QCM requis ≥ seuil ET tous ateliers ≥ seuil ET formation non clôturée
- `INSERT INTO certificats` avec `statut: EN_ATTENTE_GENERATION`
- Mise en file Bull et retour immédiat (thread web non bloqué)

**Traitement Worker (asynchrone)**
- Passage à `EN_GENERATION`
- Génération PDF en mémoire (PDFKit) avec métadonnées complètes
- Calcul SHA-256 du PDF (`crypto.createHash("sha256")`)
- Génération QR code contenant uniquement l'URL + UUID (aucune donnée personnelle)
- Reconstruction du PDF final avec QR et hash en pied de page
- Upload vers S3/MinIO
- Mise à jour du certificat : `statut: ACTIF`, `cheminPdf`, `urlVerification`
- `INSERT INTO empreintes_sha256`
- Notification In-App + Email à l'apprenant

**Gestion des erreurs (retry policy)**
- Tentative 1 ou 2 échouée → replanification avec backoff exponentiel (5s, 10s, 20s)
- Échec définitif (3 tentatives) → reset à `EN_ATTENTE_GENERATION`, alerte admin

### Points de conception clés
- Entièrement asynchrone (ADR-04) : le thread web n'est jamais bloqué
- Immuabilité : un certificat ACTIF ne peut être ni modifié ni supprimé
- Le QR code n'encode que l'UUID (RGPD, minimisation)

---

## DS-05 — Vérification publique d'un certificat

**Fichier :** `DS05_Verification_Certificat.puml`
**Acteur :** Visiteur Public (anonyme, sans compte)
**Références :** F3, Lacune G3 du Benchmark

### Participants
`Visiteur Public` · `Smartphone/Navigateur` · `VerificationController` · `VerificationService` · `CryptoService` · `PostgreSQL` · `Redis` · `StorageService`

### Étapes et scénarios couverts

**Étape 1 — Accès**
- Via scan QR code (décode l'URL contenant l'UUID)
- Ou saisie directe de l'URL publique
- Route publique sans JWT

**Étape 2 — Protection anti-abus**
- Rate limiting par IP (Redis `INCR`, TTL 60s)
- ⚠️ > 20 req/min/IP → HTTP 429

**Étape 3 — Recherche et vérification**
- UUID introuvable → badge orange « Certificat introuvable »
- Statut RÉVOQUÉ → badge rouge + date de révocation
- Statut EXPIRÉ → badge gris + date d'expiration
- Statut ACTIF → vérification cryptographique SHA-256 :
  - Récupération du PDF depuis S3
  - Recalcul du hash
  - Comparaison avec `empreintes_sha256`
  - ⚠️ Hash ne correspond pas → « Intégrité compromise »
  - Hash valide → badge vert ✅

**Données exposées publiquement (minimisation RGPD)**
- ✅ Nom + prénom, titre formation, dates, organisme, mention
- ❌ Email, ID interne, notes détaillées, commentaires formateur

**Étape 4 — Téléchargement optionnel du PDF certifié**

**Traçabilité**
- `INSERT INTO verifications_certificat` (IP, date, résultat) pour chaque consultation
- Incrément du compteur `nbConsultationsPubliques`

---

## DS-06 — Générer des questions QCM par IA (RAG)

**Fichier :** `DS06_Generation_IA.puml`
**Acteur :** Formateur
**Références :** F4 (Assistance IA), ADR-05 (LLM), ADR-04 (Bull/Redis)

### Participants
`Formateur` · `Frontend` · `AssistanceIAController` · `AssistanceIAService` · `Bull Queue` · `IndexationWorker` · `GenerationWorker` · `VecteurService (pgvector)` · `LLMService` · `StorageService` · `PostgreSQL` · `NotifService`

### Étapes et scénarios couverts

**Partie 1 — Upload et indexation du support pédagogique**
- Upload du PDF/PPTX/TXT rattaché à un module
- Réponse immédiate (`statut: EnIndexation`) + mise en file Bull
- Worker : extraction du texte → découpage en chunks (512 tokens, overlap 50) → embeddings vectoriels → stockage pgvector
- Passage à `statut: Indexé` + notification formateur

**Partie 2 — Paramétrage et lancement de la génération**
- Sélection du support indexé comme source RAG
- Paramètres : module, nb questions (ex: 10), types (QCM/QCU/VF), niveau, focus thématique
- `INSERT INTO generations_ia` + mise en file Bull
- Worker : embeddings de la requête → recherche similarité cosinus pgvector (top 8 chunks) → construction du prompt (system + contexte RAG + instructions JSON) → appel LLM → parsing + validation des suggestions
- `INSERT INTO suggestions_question_ia` × N (statut: PROPOSEE)
- Notification formateur

**Partie 3 — Révision et validation (humain dans la boucle)**
- Affichage des suggestions avec score de confiance IA
- Accepter → question convertie en vraie `Question` dans la `BanqueQuestions` (origine: IA)
- Modifier puis accepter → statut `MODIFIEE`
- Rejeter → statut `REJETEE` (archivé, tracé)
- **Aucune suggestion n'est publiée automatiquement**

### Points de conception clés
- RAG : les questions reflètent le vrai contenu enseigné, pas des connaissances génériques
- Humain dans la boucle : principe non contournable (certification)
- Traçabilité complète : lot de génération + statut de chaque suggestion + origine des questions

---

## DS-07 — Révoquer un certificat

**Fichier :** `DS07_Revocation_Certificat.puml`
**Acteur :** Administrateur
**Références :** F3, UC6 Admin, NF3 (immuabilité)

### Participants
`Administrateur` · `Frontend` · `CertificatController` · `CertificatService` · `PostgreSQL` · `NotifService` · `Apprenant`

### Étapes et scénarios couverts

**Étape 1 — Recherche du certificat**
- Filtrage par nom ou UUID dans les certificats ACTIFS

**Étape 2 — Formulaire de révocation**
- Motif obligatoire (FRAUDE / ERREUR_ADMIN / DISCIPLINAIRE / JUDICIAIRE)
- Description détaillée obligatoire
- Pièces justificatives (optionnel)
- Double confirmation : checkbox + saisie mot de passe admin

**Étape 3 — Validations serveur**
- Certificat déjà révoqué → HTTP 409 Conflict
- Mot de passe admin incorrect → HTTP 401
- ⚠️ Ces deux vérifications protègent contre les révocations accidentelles

**Étape 4 — Révocation (transaction atomique)**
- `UPDATE certificats SET statut = REVOQUE`
- `INSERT INTO revocations` (motif, description, pièces, date, adminId)
- `INSERT INTO audit_log` (détailsAvantApres, immuable)
- **Le PDF et le hash SHA-256 sont conservés** — jamais supprimés

**Étape 5 — Effets immédiats**
- Page publique de vérification affiche immédiatement « Révoqué »
- Notification In-App + Email à l'apprenant avec motif

**Cas particulier — Réémission**
- Révocation ERREUR_ADMIN → déclencher DS-04 avec données corrigées

### Points de conception clés
- Immuabilité : révocation sans suppression, trace conservée (NF3)
- Double confirmation obligatoire (action irréversible)
- AuditLog non modifiable par aucun rôle

---

## DS-08 — S'inscrire à une formation

**Fichier :** `DS08_Inscription_Formation.puml`
**Acteurs :** Apprenant (demande) + Administrateur (gestion)
**Références :** UC1 Apprenant, UC4 Admin, F5

### Participants
`Apprenant` · `Administrateur` · `Frontend` · `FormationController` · `FormationService` · `InscriptionService` · `PostgreSQL` · `NotifService`

### Étapes et scénarios couverts

**Étape 1 — Consultation du catalogue**
- Formations ouvertes filtrées par « non déjà inscrit »
- Affichage détaillé : programme, évaluations, condition de certification

**Étape 2 — Demande d'inscription**
- Vérifications : formation ouverte, capacité non atteinte, non déjà inscrit
- ⚠️ Chemins d'erreur : formation fermée (403), capacité atteinte (403), déjà inscrit (409)
- `INSERT INTO inscriptions` (`statut: EnCours`, `tauxAvancement: 0`)
- Notification aux formateurs et confirmation à l'apprenant
- Accès immédiat (pas de validation manuelle pour une formation ouverte)

**Étape 3 — Gestion admin (UC4)**
- Suspension d'une inscription (avec notification à l'apprenant)
- Import en masse via CSV

### Points de conception clés
- `Inscription` est la classe d'association apprenant↔formation (Domain Model)
- Suspension conserve les données (audit) — pas de suppression
- L'accès aux évaluations est conditionné à `inscription.statut == "EnCours"`

---

## DS-09 — Accéder à un module et lancer une évaluation

**Fichier :** `DS09_Acces_Module_Evaluation.puml`
**Acteur :** Apprenant
**Références :** UC2 + UC4 Apprenant, F1, F2
**Rôle :** Pont entre DS-08 (Inscription) et DS-02 (QCM) ou DS-03 (Atelier)

### Participants
`Apprenant` · `Frontend` · `FormationController` · `FormationService` · `QCMService` · `AtelierService` · `PostgreSQL`

### Étapes et scénarios couverts

**Étape 1 — Tableau de bord de la formation**
- Vérification inscription active (accès refusé si `statut != EnCours`)
- Chargement des modules ordonnés
- Calcul du statut de chaque évaluation pour cet apprenant (personnalisé)
- Calcul du `tauxAvancement` → mise à jour de `Inscription`
- Affichage : barre de progression + modules avec statuts Verrouillé/En cours/Complété

**Étape 2 — Ouverture d'un module**
- Chargement des QCM disponibles avec statut (DISPONIBLE / RÉUSSI / ÉCHOUÉ)
- Chargement des ateliers avec statut (EN ATTENTE / SOUMIS / NOTÉ)

**Étape 3A — Lancer un QCM**
- Contrôles d'accès anti-fraude côté serveur (statut, fenêtre, tentatives, délai)
- ⚠️ Refus avec message ciblé selon la condition
- ✅ Accès accordé → remise du contrôle à DS-02

**Étape 3B — Accéder à un atelier**
- Contrôles : atelier publié, apprenant inscrit
- Affichage de l'énoncé + **grille de notation visible avant soumission** (transparence)
- 3 états possibles : pas soumis (→ DS-03), soumis en attente, noté (→ consultation feedback)

**Mise à jour de progression**
- Après chaque évaluation : recalcul `tauxAvancement`, vérification éligibilité certification → DS-04

---

## DS-10 — Gestion du profil utilisateur

**Fichier :** `DS10_Gestion_Profil.puml`
**Acteur :** Tout utilisateur authentifié (Apprenant / Formateur / Admin)
**Références :** F7 (Sécurité)

### Participants
`Utilisateur` · `Frontend` · `UserController` · `UserService` · `AuthService` · `Redis` · `PostgreSQL`

### Étapes et scénarios couverts

**Partie 1 — Modifier ses informations personnelles**
- Modification du nom et prénom (l'email n'est pas modifiable par l'utilisateur)
- Journal d'audit `PROFIL_MODIFIE`

**Partie 2 — Changer de mot de passe**
- Vérification de l'ancien mot de passe via `bcrypt.compare()`
- Validation de la complexité du nouveau mot de passe
- Hachage du nouveau mot de passe (`bcrypt`, cost 12)
- **Invalidation de TOUTES les sessions actives** (Redis) après changement
- ⚠️ Chemin d'erreur : ancien mot de passe incorrect

**Partie 3 — Activer la double authentification (MFA)**
- Génération d'un secret TOTP (`otplib.authenticator.generateSecret()`)
- Affichage du QR code pour Google Authenticator
- Confirmation obligatoire par saisie du code TOTP avant activation effective
- ⚠️ Chemin d'erreur : code TOTP invalide lors de la confirmation

**Partie 4 — Désactiver la MFA**
- Double vérification : mot de passe + code TOTP actuel obligatoires
- Suppression du `mfaSecret` en base après confirmation
- ⚠️ Chemin d'erreur : vérification échouée

---

## DS-11 — Désinscription d'une formation

**Fichier :** `DS11_Desinscription.puml`
**Acteurs :** Apprenant (auto-désinscription) + Administrateur (retrait forcé)
**Références :** UC1 Apprenant, UC4 Admin

### Participants
`Apprenant` · `Administrateur` · `Frontend` · `InscriptionController` · `InscriptionService` · `PostgreSQL` · `NotifService`

### Étapes et scénarios couverts

**Partie 1 — Auto-désinscription (Apprenant)**
- Affichage des conséquences avant confirmation (données conservées, certificats valides, accès retiré)
- `UPDATE inscriptions SET statut = "Suspendue"` (jamais de suppression)
- Les certificats déjà obtenus ne sont pas affectés
- Journal d'audit + notification aux formateurs
- ⚠️ Chemin d'erreur : inscription non trouvée ou n'appartenant pas à cet apprenant

**Partie 2 — Retrait forcé (Administrateur)**
- Mode `hard` (aucune activité) : `DELETE FROM inscriptions`
- Mode `soft` (activité enregistrée) : `UPDATE statut = "Suspendue"` + notification à l'apprenant
- Journal d'audit dans les deux cas

**Partie 3 — Ré-inscription après suspension (Admin)**
- `UPDATE statut = "EnCours"` + notification à l'apprenant

### Points de conception clés
- Suspension préférée à la suppression pour conserver la traçabilité
- L'apprenant ne peut pas se supprimer lui-même (il peut seulement se suspendre)

---

## DS-12 — Créer un QCM complet

**Fichier :** `DS12_Creer_QCM.puml`
**Acteur :** Formateur
**Références :** UC1 + UC2 Formateur, F1

### Participants
`Formateur` · `Frontend` · `QCMController` · `QCMService` · `PostgreSQL`

### Étapes et scénarios couverts

**Partie 1 — Création du contenu (UC1)**
- Vérification que le formateur anime bien la formation cible (RBAC)
- `INSERT INTO qcm` avec `statut: "Brouillon"`

**Partie 2 — Ajout des questions**
- Validation serveur : ≥ 2 options, ≥ 1 correcte, QCU → exactement 1 correcte
- Saisie unitaire (énoncé, type, pondération, options, explication)
- Import depuis la banque de questions (liaison sans copie)
- ⚠️ Chemin d'erreur : validation échouée (message ciblé)

**Partie 3 — Configuration anti-fraude et publication (UC2)**
- 10 paramètres configurables (randomisation, timer, fenêtre, tentatives, délai, blocage, affichage, seuil, pondération, proctoring)
- Validation des contraintes : dates cohérentes, valeurs dans les plages
- `statut: "NonPublié"` après configuration
- Publication : vérification qu'au moins 1 question et 1 configuration existent
- `statut: "Publié"` → visible aux apprenants dès l'ouverture de la fenêtre

### Points de conception clés
- UC1 (contenu) et UC2 (sécurité) sont deux étapes distinctes
- Modification bloquée après la première tentative (sauf explications)
- La banque de questions est une agrégation (les questions ne sont pas copiées)

---

## DS-13 — Créer un atelier + grille de notation

**Fichier :** `DS13_Creer_Atelier.puml`
**Acteur :** Formateur
**Références :** UC3 + UC4 Formateur, F2

### Participants
`Formateur` · `Frontend` · `AtelierController` · `AtelierService` · `PostgreSQL`

### Étapes et scénarios couverts

**Partie 1 — Création de l'atelier (UC3)**
- Configuration : titre, énoncé, module, date limite, types de livrables, taille max, tolérance retard
- `INSERT INTO ateliers` avec `statut: "Brouillon"`

**Partie 2 — Définition de la grille de notation (UC4)**
- Option A : réutiliser un modèle existant (`estModele = true`) → copie distincte
- Option B : créer une nouvelle grille
- Ajout de critères un par un avec pondération + niveaux de performance (Insuffisant → Excellent)
- Validation temps réel : total des pondérations ≤ 100% à chaque ajout
- Validation finale : total == exactement 100%
- Option : enregistrer la grille comme modèle réutilisable (`estModele = true`)
- ⚠️ Chemins d'erreur : pondération dépassant 100%, total final ≠ 100%

**Partie 3 — Publication de l'atelier**
- Vérifications : grille validée, date limite dans le futur
- `UPDATE statut = "Publié"` → visible aux apprenants inscrits

---

## DS-14 — Suivi progression + alertes décrochage + export rapport

**Fichier :** `DS14_Suivi_Formateur.puml`
**Acteur :** Formateur
**Références :** UC7 + UC8 + UC9 Formateur, F6 (Analytics)

### Participants
`Formateur` · `Frontend` · `SuiviController` · `SuiviService` · `AlerteService` · `ReportWorker` · `PostgreSQL` · `NotifService`

### Étapes et scénarios couverts

**Partie 1 — Tableau de bord pédagogique (UC7)**
- Vérification RBAC : le formateur ne voit que ses propres formations
- KPIs calculés : nbInscrits/actifs/décrocheurs, taux complétion, scores moyens, histogramme
- Vue collective (graphiques) + vue individuelle (tableau triable/filtrable)
- Fiche détaillée par apprenant : historique chronologique, tentatives QCM, livrables, alertes

**Partie 2 — Alertes de décrochage (UC8)**
- Détection automatique par cron job (critères : absence > 7j, 2 échecs consécutifs QCM, livrable en retard > 48h, score en chute)
- `INSERT INTO alertes_decrochage` + notification formateur (badge + email optionnel)
- Consultation du détail : données factuelles + suggestion d'action
- Marquage « Traitée » avec saisie de l'action prise
- Journal d'audit `ALERTE_TRAITEE`

**Partie 3 — Export rapport de session (UC9)**
- Types : global / individuel / par module
- Formats : PDF (en-tête ESPRIT) ou CSV
- Génération asynchrone via Bull/Redis (mêmes workers que les certificats)
- Téléchargement sur notification

### Points de conception clés
- Isolation RBAC absolue : données uniquement des formations du formateur
- Les alertes sont basées sur des faits mesurables (pas de jugement subjectif)

---

## DS-15 — Gestion des comptes utilisateurs

**Fichier :** `DS15_Gestion_Comptes_Admin.puml`
**Acteur :** Administrateur
**Références :** UC1 + UC2 Admin, F5 (RBAC), F7 (Sécurité)

### Participants
`Administrateur` · `Frontend` · `UserAdminController` · `UserAdminService` · `Redis` · `EmailService` · `PostgreSQL`

### Étapes et scénarios couverts

**Partie 1 — Créer un compte**
- Vérification unicité email
- Création avec `statut: EN_ATTENTE_ACTIVATION`
- Génération d'un token d'activation (UUID, TTL 48h)
- Envoi d'un email d'activation avec lien
- ⚠️ Chemin d'erreur : email déjà utilisé

**Partie 2 — Désactiver / bannir un compte**
- Recherche par nom, email ou matricule
- Saisie du motif obligatoire
- `UPDATE statut = "DESACTIVE"`
- Invalidation de toutes les sessions actives (Redis blacklist)
- **Protection anti-lockout** : refus si c'est le dernier administrateur actif
- ⚠️ Chemins d'erreur : tentative sur le seul admin actif

**Partie 3 — Changer le rôle d'un utilisateur (UC2)**
- Double confirmation : sélection du rôle + saisie du mot de passe admin
- Invalidation des sessions (le nouveau rôle prend effet à la prochaine connexion)
- Journal d'audit avec `ancienRole` et `nouveauRole`
- ⚠️ Chemin d'erreur : mot de passe admin incorrect

**Partie 4 — Anonymisation RGPD**
- Cas d'usage : « droit à l'oubli » pour un compte avec données liées
- Remplacement des données personnelles par des pseudonymes
- Conservation des données pédagogiques (tentatives, livrables, certificats)
- Transaction atomique (rollback en cas d'erreur)
- Irréversible : protection par confirmation + mot de passe admin

### Points de conception clés
- `statut: ANONYMISE` : le compte ne peut plus se connecter, ses données perso sont effacées
- Invalidation Redis immédiate après désactivation ou changement de rôle
- Journal d'audit immuable sur toutes les opérations de gestion de comptes

---

## DS-16 — Gestion formations + rapports institutionnels + audit

**Fichier :** `DS16_Gestion_Formations_Admin.puml`
**Acteur :** Administrateur
**Références :** UC3+UC4+UC5+UC7+UC8+UC9+UC10 Admin, F5, F6, F7

### Participants
`Administrateur` · `Frontend` · `AdminController` · `FormationAdminService` · `ReportWorker` · `PostgreSQL` · `NotifService`

### Étapes et scénarios couverts

**Partie 1 — Créer et gérer une formation (UC3)**
- Création : titre, description, prérequis, objectifs, dates, capacité, note min certification, modèle certificat
- Affectation d'un formateur (notification automatique)
- Clôturer une formation (les certificats restent vérifiables)
- Archiver une formation (disparaît du catalogue mais accessible en consultation)

**Partie 2 — Tableau de bord global (UC7)**
- KPIs plateforme entière : nb users actifs par rôle, formations, certificats, taux complétion/réussite
- Graphiques de tendance : inscriptions, certifications (mensuel)
- Alertes système : erreurs techniques, pics anormaux, connexions suspectes
- Activité récente : derniers certificats, utilisateurs, révocations

**Partie 3 — Supervision des certificats (UC5)**
- Vue exhaustive avec UUID, titulaire, formation, date, score, statut, nbConsultations
- Fiche détaillée : historique complet (émission, consultations, révocation éventuelle)
- Exportable en CSV ou PDF

**Partie 4 — Export rapports institutionnels (UC8)**
- Types : activité globale / certifications / par formation / par formateur / conformité RGPD
- Génération asynchrone Bull/Redis (même pipeline que DS-04, DS-14)
- Format PDF avec en-tête institutionnel ESPRIT ou CSV brut
- Périmètre total (contrairement à l'export formateur limité à ses formations)

**Partie 5 — Consultation des journaux d'audit (UC10)**
- Filtrage : par action, par utilisateur, par période, par ressource
- Données affichées : horodatage, action, acteur, cible, IP, résultat
- **Aucun endpoint DELETE ou UPDATE** sur `/audit-logs` — immuabilité garantie côté API

### Points de conception clés
- L'admin a une vue globale et croisée (contrairement au formateur isolé à ses formations)
- L'immuabilité des audit logs est garantie au niveau de l'API (pas de route de modification)
- Les rapports institutionnels sont utilisables pour les bilans ESPRIT, audits RGPD, financements

---

## Couverture des acteurs

### Apprenant (9 diagrammes)
| Scénario | DS |
|---|---|
| S'authentifier | DS-01 |
| Gérer son profil (MFA, mot de passe) | DS-10 |
| S'inscrire à une formation | DS-08 |
| Se désinscrire | DS-11 |
| Accéder au module / choisir évaluation | DS-09 |
| Passer un QCM | DS-02 |
| Soumettre un livrable | DS-03 (Partie 1) |
| Consulter le feedback | DS-03 (Partie 2) |
| Consulter/télécharger son certificat | DS-04 + DS-05 |

### Formateur (7 diagrammes)
| Scénario | DS |
|---|---|
| S'authentifier | DS-01 |
| Créer un QCM + anti-fraude | DS-12 |
| Créer un atelier + grille | DS-13 |
| Corriger un livrable | DS-03 (Partie 2) |
| Suivre la progression des apprenants | DS-14 (Partie 1) |
| Gérer les alertes de décrochage | DS-14 (Partie 2) |
| Exporter un rapport de session | DS-14 (Partie 3) |
| Générer des questions QCM par IA | DS-06 |

### Administrateur (7 diagrammes)
| Scénario | DS |
|---|---|
| S'authentifier | DS-01 |
| Créer un compte utilisateur | DS-15 (Partie 1) |
| Désactiver / bannir un compte | DS-15 (Partie 2) |
| Changer le rôle d'un utilisateur | DS-15 (Partie 3) |
| Anonymiser un compte (RGPD) | DS-15 (Partie 4) |
| Créer et gérer une formation | DS-16 (Partie 1) |
| Gérer inscriptions (suspension, CSV) | DS-08 (Partie 3) + DS-11 (Partie 2) |
| Superviser les certificats | DS-16 (Partie 3) |
| Révoquer un certificat | DS-07 |
| Tableau de bord global | DS-16 (Partie 2) |
| Exporter rapports institutionnels | DS-16 (Partie 4) |
| Consulter les journaux d'audit | DS-16 (Partie 5) |

### Visiteur Public (1 diagramme)
| Scénario | DS |
|---|---|
| Vérifier l'authenticité d'un certificat | DS-05 |

---

## Couverture des besoins fonctionnels

| Besoin | Diagrammes |
|---|---|
| F1 — QCM anti-fraude | DS-02, DS-12 |
| F2 — Ateliers pratiques | DS-03, DS-13 |
| F3 — Certification numérique | DS-04, DS-05, DS-07 |
| F4 — Assistance IA Formateurs | DS-06 |
| F5 — RBAC multi-rôles | DS-01, DS-08, DS-09, DS-11, DS-15, DS-16 |
| F6 — Analytics et reporting | DS-14, DS-16 |
| F7 — Sécurité et conformité | DS-01, DS-10, DS-15 |

---

*Fin du document — Référentiel des diagrammes de séquence · Cert_EET v1.0*
