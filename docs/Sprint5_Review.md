# Cert_EET — Sprint 5 · Revue de Sprint (Sprint Review) et rétrospective

> **Projet :** Cert_EET — Certification ESPRIT Entreprise · PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 5 — « Comptes et sécurité soldés : mots de passe, durcissement, import, RGPD, surveillance »
> **Statut :** ✅ **CLÔTURÉ** — 6 / 6 stories, **23 pts** (PR #90 → #95), réalisé le 11/11/2026 avec un
> agent de développement, sans intervention du porteur pendant le sprint.
> **But de ce document :** expliquer **simplement** ce qui a été construit, **pourquoi**, **comment ça
> marche**, **comment le démontrer**, et ce qui reste à décider — lisible par un non-spécialiste comme par
> le jury.

---

## 0. Comment lire ce document

Même logique que les revues précédentes : pour chaque bloc, **Quoi**, **Pourquoi**, **Comment** (sans
jargon). Les termes nouveaux sont définis au **glossaire (§11)**. Le détail technique de chaque story est
dans son journal : `engineering-log/77` à `engineering-log/82`.

---

## 1. Le contexte en une page

À la fin du Sprint 4, toutes les épopées fonctionnelles étaient livrées : formations, QCM anti-fraude,
ateliers, certificats vérifiables, assistance IA, suivi et rapports. Six stories restaient, repoussées
volontairement « en fin de projet » : elles touchent aux **mots de passe**, à la **sécurité de la
plateforme**, à la **gestion des comptes** et aux **données personnelles**. Ce sont les fondations de
confiance du cahier des charges (F7 « Sécurité et conformité », NF3 sécurité, NF4 RGPD) : sans elles, une
certification « crédible » reposerait sur des comptes impossibles à récupérer, une plateforme exposée aux
abus et aucune réponse à une demande d'effacement.

---

## 2. Le but du Sprint et son verdict

> **But :** solder toutes les stories restantes — mots de passe, durcissement, import, anonymisation,
> surveillance webcam — dans une conception prudente et respectueuse des données personnelles.

**Verdict : atteint.** Les 6 stories sont livrées, testées et fusionnées avec une CI verte sur la PR et
sur `main` (API, Web, deux images). Trois points relèvent d'une **décision humaine** et sont documentés
plutôt que tranchés par l'équipe technique (§6, « À décider ») : le cadre juridique de la surveillance
webcam, la pseudonymisation éventuelle du journal d'audit antérieur, et les durées de conservation.

---

## 3. Bilan chiffré

| Indicateur | Début du sprint (`main` après #89) | Fin du sprint (après #95) |
|---|---|---|
| Stories livrées dans le sprint | — | **6 / 6 (23 pts)** |
| Tests unitaires | 104 suites / 1 372 tests | **113 suites / 1 446 tests** |
| Tests e2e (en série, base réelle) | 62 suites / 768 tests | **68 suites / 808 tests** (+ 1 ignoré) |
| Migrations | 35 | **37** (`jetons_lien_email`, surveillance webcam) |
| Mutants tués (tests de mutation) | — | **89 / 89** (13 + 13 + 14 + 14 + 14 + 17 ; réécrits quand ils ne compilaient pas) |
| Nouvelle dépendance | — | **1** : `helmet` 8.3.0 (exacte, publiée le 12/07/2026, sans dépendance) |
| Pages vérifiées au navigateur (1280 / 390 px) | — | connexion, sécurité, mot de passe oublié, réinitialisation, activation, utilisateurs (import, anonymisation), passage d'un QCM surveillé, tentatives côté formateur, configuration d'un QCM, et 18 pages des trois rôles sous la nouvelle CSP |

---

## 4. Ce qui a été construit (expliqué simplement)

### 4.1 Changer son mot de passe *(US-AUTH-08 — PR #90, journal 77)*
- **Quoi :** dans « Sécurité », l'utilisateur change son mot de passe en donnant l'actuel. Toutes ses
  sessions, sur tous ses appareils, sont fermées ; un email le prévient.
- **Pourquoi :** si un mot de passe a fuité, le changer doit couper immédiatement tout accès volé.
- **Comment :** la ligne du compte est verrouillée le temps de vérifier l'ancien mot de passe ; les jetons
  de session sont révoqués en base et dans Redis ; le « marqueur » qui invalide les jetons est désormais à
  la milliseconde (avant, un jeton émis dans la même seconde passait encore).

### 4.2 Mot de passe oublié *(US-AUTH-06 — PR #91, journal 78)*
- **Quoi :** depuis « Mot de passe oublié ? » sur la page de connexion, l'utilisateur reçoit un lien valable
  30 minutes, utilisable une seule fois, pour choisir un nouveau mot de passe.
- **Pourquoi :** récupérer son compte en autonomie, sans révéler à un curieux quelles adresses ont un compte.
- **Comment :** la réponse est **la même** que l'adresse existe ou non ; seul un compte actif reçoit un
  lien. Le jeton n'est jamais stocké : seule son **empreinte** l'est. Trop de demandes depuis une même
  adresse IP -> refus (429) ; plus de 3 liens par heure pour une même adresse -> plus d'envoi, sans le dire.

### 4.3 TLS et durcissement *(US-AUTH-13 — PR #92, journal 79)*
- **Quoi :** échanges chiffrés modernes (TLS 1.2 / 1.3, redirection HTTP -> HTTPS, HSTS), en-têtes de
  sécurité sur toutes les réponses, taille des requêtes bornée, CORS strict, limites de débit sur la
  connexion, le refresh, l'inscription, la vérification d'email et la réinitialisation.
- **Pourquoi :** protéger les données en transit et résister aux abus courants (force brute, requêtes
  géantes, affichage de la plateforme dans un cadre piégé).
- **Comment :** deux couches — nginx à l'entrée, l'API derrière, qui reste protégée même jointe
  directement. Aucun certificat réel dans le dépôt : des chemins de remplacement et une procédure, plus un
  script qui vérifie un déploiement (`docker/nginx/verifier-durcissement.sh`). Les limites sont réglables
  sans recompiler, pour une salle de cours entière derrière une seule adresse.

### 4.4 Import CSV de comptes *(US-CPT-02 — PR #93, journal 80)*
- **Quoi :** l'administrateur importe une promotion depuis un fichier CSV ; chaque personne reçoit un
  email pour activer son compte et choisir son mot de passe.
- **Pourquoi :** enrôler une promotion en une opération, sans saisie compte par compte.
- **Comment :** **tout est vérifié avant de créer quoi que ce soit** (colonnes, adresses, doublons dans le
  fichier et en base). **Tout ou rien** : une seule ligne fautive et rien n'est créé, avec un rapport ligne
  par ligne. Les emails partent en arrière-plan (file de travaux) ; le lien d'activation vaut 48 h et peut
  être renvoyé.

### 4.5 Anonymisation RGPD *(US-CPT-04 — PR #94, journal 81)*
- **Quoi :** l'administrateur efface l'identité d'un compte (droit à l'oubli), de façon irréversible, après
  une double confirmation (son mot de passe et le mot « ANONYMISER »).
- **Pourquoi :** répondre à une demande d'effacement sans détruire les preuves pédagogiques ni les
  certificats déjà délivrés.
- **Comment :** nom, email, mot de passe, profil, liaisons Google / GitHub, traces de connexion sont
  remplacés ou effacés dans une seule transaction ; les sessions sont fermées. Les certificats restent
  **vérifiables** publiquement, avec « Titulaire anonymisé » à la place du nom ; le PDF (qui porte le nom)
  n'est plus servi publiquement. On ne peut pas anonymiser le dernier administrateur actif.

### 4.6 Surveillance webcam par captures *(US-QCM-12 — PR #95, journal 82)*
- **Quoi :** le formateur peut activer la surveillance d'un QCM (désactivée par défaut). L'apprenant doit
  alors **consentir** avant de commencer ; la page prend une petite image de la caméra au démarrage puis
  toutes les 2 minutes ; le formateur affecté peut les consulter en cas de doute.
- **Pourquoi :** dissuader et prouver une substitution d'identité, sans transformer l'examen en
  vidéosurveillance.
- **Comment :** pas de vidéo, pas de son, **aucune analyse automatique** ; images stockées en privé, vues
  seulement par le formateur affecté et l'administration (chaque consultation est journalisée), par des
  liens de 2 minutes ; supprimées au bout de 30 jours. Sans consentement ou sans caméra : pas de tentative,
  et le message indique la procédure de passage surveillé en présentiel. Un interrupteur général permet de
  tout couper tant que le cadre juridique n'est pas validé.

---

## 5. Script de démonstration (pour la Sprint Review)

1. **Sécurité** (apprenant) : changer son mot de passe -> retour à la connexion avec un message ; l'ancien
   mot de passe est refusé ; une autre session ouverte est coupée.
2. **Mot de passe oublié** : demander un lien avec une adresse inconnue puis connue -> même message ; ouvrir
   le lien, choisir un mot de passe ; le même lien ne marche plus.
3. **Durcissement** : `INSECURE=1 ./docker/nginx/verifier-durcissement.sh <hôte>` -> 10 OK ; 31 connexions
   en une minute depuis la même adresse -> 429.
4. **Import** (administrateur) : un CSV avec une ligne fautive -> rapport, rien de créé ; corriger -> comptes
   « En attente » ; ouvrir le lien d'activation, choisir un mot de passe, se connecter.
5. **Anonymisation** : anonymiser un apprenant certifié -> « Compte anonymisé » dans la liste ; la page
   publique du certificat reste « Valide », titulaire masqué.
6. **Surveillance** (formateur) : activer la surveillance d'un QCM ; (apprenant) consentir, passer le QCM
   avec le bandeau « Surveillance webcam active » ; « Je refuse » sur un autre QCM -> procédure
   alternative ; (formateur) voir les captures dans le détail de la tentative.

---

## 6. Qualité, décisions et écarts assumés

### Definition of Done
Respectée pour chaque story : critères d'acceptation, unitaires + e2e avec concurrence forcée, mutations
toutes tuées, RBAC et autorisation par ressource, validation serveur, audit, CI verte sur la PR et sur
`main`, navigateur 1280 / 390 px, journal.

### Principes retenus pendant le sprint
- **Une seule source de vérité par mécanisme** : politique de mot de passe, gabarit d'email, primitive de
  lien email (empreinte, usage unique, objet), limitation de débit générique, réglages HTTP communs
  (`configurerApplication`, partagés par l'API et ses tests).
- **Les secrets ne transitent pas** : jetons jamais stockés en clair, jamais dans une file de travaux,
  jamais dans le journal.
- **Verrou en base pour chaque course** : changement de mot de passe, consommation d'un lien, import,
  anonymisation, dépôt de capture — chaque fois prouvé par N requêtes simultanées.

### Écarts assumés avec les documents
| Story | Document | Écart et raison |
|---|---|---|
| US-AUTH-06 | « Même mécanisme que le lien d'activation » (US-AUTH-05, retirée en v1.2) | Nouvelle primitive en base (empreinte seule, objets distincts) ; le lien de vérification d'email d'US-CPT-05 est inchangé. |
| US-CPT-02 | « Rejeter les lignes ou bloquer selon le mode » | Tout ou rien seulement (consigne du porteur), rapport complet. ADMINISTRATEUR non importable. |
| US-CPT-04 | « Compte inactif » ; « avec son mot de passe » | Tout compte non anonymisé (sessions révoquées dans la même opération) ; mot de passe ET mot « ANONYMISER ». |
| US-QCM-12 | « Sprint 5 ou après, conditionné à l'accord de l'encadrant et à une décision RGPD » | Sous-ensemble sûr livré ; conditions documentées ; interrupteur `SURVEILLANCE_WEBCAM` pour couper sans redéployer. |

### À décider (hors périmètre technique)
- **Webcam** : accord de l'encadrant, base légale et éventuelle déclaration INPDP (loi 2004-63), validation
  de la notice affichée à l'apprenant, organisation du passage surveillé en présentiel.
- **Journal d'audit antérieur** : des entrées passées contiennent l'email de comptes ensuite anonymisés ; le
  journal est immuable par conception. Pseudonymisation rétroactive possible, à valider.
- **Durées de conservation** : rapports générés (US-RPT-01 / 02), PDF de certificat d'un compte anonymisé.

---

## 7. Incidents et leçons

- **Conteneur de travail redémarré deux fois** pendant le sprint : services relancés, suites relancées
  depuis le début ; aucune perte (tout est commité par story, les documents de reprise sont à jour).
- **Conversion implicite du ValidationPipe** : « "oui" » devenait `true` pour un consentement ; un booléen
  de consentement est désormais lu brut. *Leçon :* un champ qui exprime un accord ne doit jamais être
  converti.
- **401 métier contre 401 de session** : l'intercepteur du frontend déconnectait l'utilisateur sur un mot
  de passe actuel mal saisi. *Leçon :* un refus métier porte un code stable que le client distingue.
- **Listes exactes de champs** dans d'anciens tests (« Mon espace », consultation d'une tentative) : mises
  à jour à chaque champ ajouté, comme prévu par les pièges connus.
- **GraphQL indisponible** pour l'agent : PR ouvertes par l'API REST de GitHub.

---

## 8. Rétrospective

### Ce qui a bien marché (à garder)
- Chaque story réutilise les briques de la précédente : aucune duplication de mécanisme de sécurité.
- Les décisions humaines sont isolées et écrites, au lieu d'être tranchées en silence.
- Les tests de mutation ont fait ajouter des cas réels (adresse existante en majuscules, jeton d'un autre
  usage, consentement non booléen).

### Ce qui n'a pas marché (à arrêter)
- Laisser des tests anciens comparer des listes exactes sans le signaler dans leur nom : chaque ajout de
  champ casse une suite éloignée.

### Ce qu'on essaie ensuite
- Revue des Sprints 3 à 5 par le porteur et l'encadrant ; validation juridique de la surveillance webcam
  avant toute démonstration publique de cette fonction.

---

## 9. Actions pour le porteur

1. **Rotation des secrets exposés sur la branche `docs`** (action d'exploitation, branche non modifiée par
   l'équipe).
2. Déposer les **vrais certificats TLS** sur l'hôte et lancer `docker/nginx/verifier-durcissement.sh`.
3. Décider du **cadre juridique de la surveillance webcam** ; en attendant, `SURVEILLANCE_WEBCAM=off`.
4. Trancher les questions de **conservation** et de **journal d'audit antérieur** (§6).

---

## 10. Métriques de livraison (vue synthétique)

| Story | PR | Mutants | e2e (marqueur) |
|---|---|:---:|---|
| US-AUTH-08 | #90 | 13 / 13 | `E2E-AUTH08` (5) |
| US-AUTH-06 | #91 | 13 / 13 | `E2E-AUTH06` (7) |
| US-AUTH-13 | #92 | 14 / 14 | `E2E-AUTH13` (9) |
| US-CPT-02 | #93 | 14 / 14 | `E2E-CPT02` (6) |
| US-CPT-04 | #94 | 14 / 14 | `E2E-CPT04` (4) |
| US-QCM-12 | #95 | 17 / 17 | `E2E-QCM12` (9) |

---

## 11. Glossaire (termes nouveaux du Sprint 5)

- **Empreinte (hachage)** : résumé non réversible d'une donnée ; on stocke l'empreinte d'un jeton, jamais
  le jeton, pour qu'une fuite de la base ne permette pas de l'utiliser.
- **Anti-énumération** : répondre de la même façon qu'un compte existe ou non, pour ne rien révéler.
- **HSTS** : en-tête qui impose au navigateur de ne plus jamais joindre le site sans chiffrement.
- **CSP (Content Security Policy)** : liste des sources de contenu autorisées sur une page ; bloque par
  exemple l'affichage de la plateforme dans le cadre d'un site piégé.
- **Limitation de débit (429)** : refus temporaire au-delà d'un nombre de requêtes par période.
- **Tout ou rien (transaction)** : soit toutes les écritures réussissent, soit aucune n'est gardée.
- **Anonymisation** : remplacement irréversible des données d'identité, en gardant les données utiles
  (résultats, certificats) sans lien avec la personne.
- **Opt-in** : fonction désactivée par défaut, activée par un choix explicite.
- **Lien signé** : adresse temporaire (ici 2 minutes) qui donne accès à un fichier privé.

---

*Revue de Sprint · Cert_EET — Sprint 5 · 6 stories, 23 pts · Iyed Omri, PFE ESPRIT.*
