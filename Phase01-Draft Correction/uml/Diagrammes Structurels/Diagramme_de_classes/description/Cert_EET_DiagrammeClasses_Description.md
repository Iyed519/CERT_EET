# Cert_EET — Description du Diagramme de Classes (Domain Model)

> Document complémentaire au diagramme `Cert_EET_DiagrammeDeClasses.puml`
> Version 2.0 · Juin 2026 · Iyed Omri · PFE ESPRIT — Ingénierie Logicielle
>
> Ce document décrit, en langage accessible, **ce que représente** le diagramme de classes de
> Cert_EET, classe par classe et relation par relation. Il permet à un lecteur — jury, encadrant,
> nouveau développeur — de comprendre la structure des données de la plateforme sans avoir à
> déchiffrer la notation. Les termes techniques sont définis dans le glossaire compagnon
> `Cert_EET_Glossaire_Termes_Techniques.md`.

---

## À quoi sert ce diagramme

Là où les **diagrammes de cas d'utilisation** décrivent *ce que les acteurs font*, le **diagramme de classes** décrit *les informations que la plateforme manipule et conserve*. C'est le squelette du système : chaque classe (rectangle) représente un **concept du domaine** — un utilisateur, une formation, un certificat — qui deviendra une **table** dans la base de données. Les lignes entre les classes expriment **comment ces concepts sont reliés**.

Le modèle comporte **36 classes** et **8 énumérations**, regroupées en **8 zones colorées (packages)** correspondant aux grands besoins fonctionnels du cahier des charges (F1 à F7).

---

## Comment lire le diagramme en une minute

**Un rectangle = une classe** (un concept). Il se lit en trois compartiments superposés :
- en haut, le **nom** du concept (et parfois un stéréotype entre guillemets, ex. `«value object»`) ;
- au milieu, les **attributs** (les données : `dateEmission`, `score`…), précédés de `-` (privé) ou `+` (public) ;
- en bas, les **opérations** (les comportements : `revoquer()`, `calculerScore()`).

**Une ligne = une relation.** Sa couleur indique sa nature (rappelée dans la légende du diagramme) :
- **noir** : héritage (« est une sorte de ») ;
- **rouge** : composition (« est une partie indissociable de ») ;
- **vert** : agrégation (« regroupe / réutilise ») ;
- **bleu** : association simple (« est lié à ») ;
- **gris pointillé** : dépendance (« utilise ponctuellement ») ;
- **orange pointillé** : raccordement d'une classe d'association.

**Les chiffres aux extrémités** (`1`, `0..*`, `1..*`…) indiquent **combien** d'éléments participent : `0..*` veut dire « zéro à plusieurs », `1..*` « au moins un », `0..1` « optionnel ».

---

## Package 1 — Utilisateurs & Sécurité

Cette zone modélise **qui** utilise la plateforme et **comment** son accès est sécurisé.

**User** est la classe « mère » abstraite : elle rassemble ce que tout compte possède en commun (nom, e-mail, mot de passe haché, rôle, statut, activation de la double authentification). Elle n'est jamais utilisée telle quelle ; elle se décline en trois rôles qui en **héritent** :
- **Apprenant** — l'utilisateur final, identifié par un matricule, qui suit des formations, passe des QCM, soumet des livrables et obtient des certificats.
- **Formateur** — caractérisé par son domaine d'expertise ; il crée les évaluations, corrige les travaux et peut lancer des générations de questions assistées par IA.
- **Administrateur** — gère les comptes, attribue les rôles et révoque les certificats.

**VisiteurPublic** est un cas particulier : c'est un acteur **anonyme, sans compte** (d'où le stéréotype `«non persisté»`, qui signifie qu'il n'a aucune table en base). Il n'apparaît que pour vérifier l'authenticité d'un certificat. C'est pourquoi il n'hérite pas de `User`.

La sécurité est portée par deux classes : **SessionUtilisateur** (une connexion ouverte, avec son adresse IP et sa date d'expiration) et **TokenJWT** (les jetons d'authentification — un jeton d'accès et un jeton de rafraîchissement — émis pour chaque session). Une session « possède » ses jetons (composition) et est invalidée avec eux.

---

## Package 2 — Formations & Pédagogie

Cette zone décrit l'**ossature pédagogique**.

**Formation** est le cursus certifiant (titre, objectifs, prérequis, dates, capacité, note minimale de certification). Elle est **composée** de **Module** (ses subdivisions internes, ordonnées) : un module n'existe pas en dehors de sa formation.

**Inscription** est une **classe d'association** : elle matérialise le lien entre un `Apprenant` et une `Formation`, et porte les données propres à *ce lien* — date d'inscription, échéance, statut (En cours / Terminée / Suspendue) et taux d'avancement. C'est elle qui « sait » où en est un apprenant dans une formation donnée. Un même apprenant peut être inscrit à plusieurs formations, et une formation accueille plusieurs apprenants ; elle est par ailleurs animée par un ou plusieurs **Formateur**.

---

## Package 3 — Évaluations QCM (F1)

Cette zone est le **moteur de QCM sécurisé**, cœur du besoin F1.

**QCM** est le questionnaire rattaché à un module. Il est **composé** d'une **ConfigurationAntiFraude** unique, qui centralise tous les paramètres de sécurité de l'épreuve : randomisation des questions et des options, durée maximale (minuterie côté serveur), nombre et délai entre tentatives, blocage des sessions multiples, mode d'affichage des résultats, seuil de validation, etc.

Un QCM **agrège** des **Question** : le mot « agrège » est important, car les questions vivent dans une **BanqueQuestions réutilisable** et peuvent servir à plusieurs QCM ; supprimer un QCM ne détruit donc pas ses questions. Chaque question (de type QCM, QCU, Vrai/Faux…) **compose** ses **Option** (au moins deux), dont l'attribut `estCorrecte` reste exclusivement côté serveur — il n'est jamais envoyé au navigateur, pour empêcher la triche.

Quand un apprenant passe un QCM, le système crée une **TentativeQCM** (heure de début/fin, durée effective, score, statut). Cette tentative **compose** les **Reponse** de l'apprenant, chacune renvoyant à la question concernée et aux options sélectionnées. Le score est calculé côté serveur : le QCM connaît les règles de notation, la tentative connaît les réponses.

---

## Package 4 — Ateliers Pratiques (F2)

Cette zone gère les **travaux pratiques corrigés manuellement** (besoin F2).

**Atelier** décrit un travail à rendre (énoncé, compétences visées, date limite, types et tailles de fichiers acceptés). Il **agrège** une **GrilleNotation** : la grille est réutilisable comme **modèle** d'un atelier à l'autre (d'où l'agrégation, et l'attribut `estModele`). Une grille **compose** ses **Critere** (les axes d'évaluation pondérés), et chaque critère **compose** ses **NiveauPerformance** (les paliers « Insuffisant » à « Excellent », avec plages de points et descripteurs).

Côté apprenant, une soumission est un **Livrable** (date, version, statut, plus un `hashTracabilite` servant de preuve d'antériorité contre le plagiat). Il **compose** ses **FichierLivrable** (les fichiers déposés). Un livrable est rattaché à la fois à son **Atelier** et à son **Apprenant** auteur.

La correction est représentée par **Correction**, produite par un **Formateur**, qui **compose** un **Feedback** (commentaire général et fichiers annotés). Le détail de la notation par critère est porté par **NoteCritere**, une **classe d'association** entre `Correction` et `Critere` : elle conserve, pour chaque critère, la note attribuée, le niveau atteint et le commentaire du formateur. C'est ce qui permet d'expliquer une note point par point. Le score total est ensuite agrégé automatiquement à partir de ces notes pondérées.

---

## Package 5 — Certification Numérique (F3)

Cette zone produit le **certificat vérifiable**, différenciateur du projet (besoin F3).

**Certificat** est le document officiel émis au nom d'un apprenant pour une formation (titre, titulaire, organisme émetteur, date d'émission et d'expiration, score, mention, statut, URL de vérification). Sa **signature est institutionnelle** : elle provient d'ESPRIT via l'attribut `organismeEmetteur`, et non d'un formateur nominatif.

Le certificat **compose** une **EmpreinteSHA256** (`«value object»`) : une trace cryptographique calculée sur son contenu, qui garantit son intégrité — toute modification du PDF invaliderait la vérification. Si nécessaire, un certificat peut être lié à une **Revocation** (au plus une), décidée par un administrateur, qui en conserve le motif et les justificatifs **sans** supprimer le certificat (un certificat émis est immuable).

Chaque consultation publique est enregistrée dans une **VerificationCertificat** (date, adresse IP, résultat), ce qui alimente le compteur de consultations et l'audit. C'est l'unique point de contact du **VisiteurPublic** avec le système.

---

## Package 6 — Assistance IA aux Formateurs (F4)

Cette zone porte les **outils d'assistance intelligente au formateur** pour la création de QCM et le suivi pédagogique.

**SupportPedagogique** représente un document de cours uploadé par le formateur (PDF, PPTX, TXT…). Il est rattaché à un module et passe par un pipeline d'**indexation asynchrone** : le document est découpé en fragments, transformé en vecteurs et stocké dans la base vectorielle. Une fois indexé (statut « Indexé »), il devient la **source** sur laquelle l'IA s'appuie pour générer des questions pertinentes — c'est le principe du *RAG* (Retrieval-Augmented Generation) : l'IA ne génère pas dans le vide, elle s'ancre dans le vrai contenu du cours.

**GenerationIA** représente un **lot de génération** : la demande du formateur (module cible, nombre de questions souhaitées, niveau de difficulté, type de questions, focus thématique optionnel, modèle LLM utilisé). Ce lot **compose** ses **SuggestionQuestionIA** : les suggestions n'existent pas sans leur lot, et le lot est la trace complète de chaque demande — formateur, module, paramètres, date. C'est l'équivalent, pour la génération IA, de ce qu'est `TentativeQCM` pour le passage d'un QCM.

**SuggestionQuestionIA** est une **question candidate** produite par l'IA : énoncé, type, options proposées (dont les *distracteurs* — les mauvaises réponses plausibles), explication, niveau de difficulté, score de confiance. Elle porte un `statut` (`StatutSuggestion`) qui trace la décision du formateur : PROPOSEE → ACCEPTEE, MODIFIEE ou REJETEE. La méthode `accepter()` convertit la suggestion en une vraie `Question` ajoutée à la `BanqueQuestions`. La méthode `rejeter()` l'archive sans la publier. **Aucune suggestion n'est jamais publiée automatiquement** : la validation humaine est obligatoire.

**AlerteDecrochage** est le signal proactif envoyé au formateur quand le système détecte un pattern de risque chez un apprenant (absence prolongée, échecs consécutifs, retards…). Elle s'appuie sur des faits mesurables, propose une action et attend d'être marquée comme traitée par le formateur.

---

## Package 7 — Transverse (F6/F7)

Cette zone regroupe deux services communs à tout le système.

**AuditLog** (`«immuable»`) journalise les actions sensibles (action, cible, adresse IP, résultat, différentiel avant/après). Une fois écrite, une entrée ne peut être ni modifiée ni supprimée — exigence de conformité et de traçabilité. Une entrée peut être rattachée à un utilisateur, ou rester anonyme lorsqu'elle provient d'une action système.

**Notification** représente les messages adressés à un utilisateur (type, contenu, canal In-App ou e-mail, lu/non lu), par exemple lors de l'émission d'un certificat ou de la réception d'un feedback.

---

## Package 8 — Énumérations

Les **énumérations** sont des listes fermées de valeurs autorisées. Elles fixent notamment les **statuts** des objets clés (`StatutCertificat`, `StatutTentative`, `StatutLivrable`, `StatutCompte`, `StatutSuggestion`) et reprennent exactement les états des futurs diagrammes d'états-transitions, garantissant la cohérence entre les deux représentations. S'y ajoutent `Role`, `TypeQuestion` et `MotifRevocation`.

---

## Le modèle raconté comme un parcours

Pour relier toutes ces classes, voici le parcours type à travers le modèle, vu de deux angles.

**Côté apprenant :**

1. Un **Apprenant** (sous-classe de **User**) ouvre une **SessionUtilisateur** munie de ses **TokenJWT**.
2. Il est lié à une **Formation** par une **Inscription** qui suit son avancement. La formation est faite de **Module**.
3. Dans un module, il passe un **QCM** : le système crée une **TentativeQCM** contenant ses **Reponse** aux **Question** (issues d'une **BanqueQuestions**), le tout encadré par une **ConfigurationAntiFraude**.
4. Toujours dans le module, il rend un **Livrable** (avec ses **FichierLivrable**) pour un **Atelier**. Un **Formateur** produit une **Correction** via une **GrilleNotation**, détaille la note par **Critere** grâce à **NoteCritere**, et joint un **Feedback**.
5. Une fois la formation validée, un **Certificat** est émis, scellé par une **EmpreinteSHA256**. Un recruteur **VisiteurPublic** le vérifie, créant une **VerificationCertificat**.
6. Tout au long du parcours, l'apprenant reçoit des **Notification** et chaque action sensible est tracée dans un **AuditLog**. En cas de désengagement, une **AlerteDecrochage** prévient son formateur.

**Côté formateur (flux IA) :**

7. Le **Formateur** uploade un **SupportPedagogique** (PDF de cours) rattaché à un **Module**. L'indexation s'exécute en arrière-plan.
8. Il lance une **GenerationIA** sur ce module (nombre, type, niveau de difficulté). Le système interroge le LLM en s'appuyant sur les supports indexés (*RAG*).
9. Le lot produit des **SuggestionQuestionIA**. Le formateur révise chaque suggestion : il peut l'accepter (→ elle devient une **Question** dans la **BanqueQuestions**), la modifier puis l'accepter, ou la rejeter.
10. Les questions validées alimentent ses **QCM**, prêtes à être utilisées pour l'évaluation des apprenants.

---

## Synthèse — rôle de chaque classe

| Classe | Rôle en une phrase |
|---|---|
| User (abstraite) | Socle commun de tout compte (identité, sécurité). |
| Apprenant / Formateur / Administrateur | Les trois rôles, avec leurs droits propres (RBAC). |
| VisiteurPublic | Acteur anonyme vérifiant un certificat (non persisté). |
| SessionUtilisateur / TokenJWT | Connexion ouverte et ses jetons d'authentification. |
| Formation / Module | Le cursus certifiant et ses subdivisions. |
| Inscription | Lien apprenant↔formation et suivi d'avancement. |
| QCM / ConfigurationAntiFraude | Questionnaire et ses règles anti-fraude. |
| Question / Option / BanqueQuestions | Les questions réutilisables et leurs choix. |
| TentativeQCM / Reponse | Une passation de QCM et ses réponses. |
| Atelier / GrilleNotation / Critere / NiveauPerformance | Travail pratique et son barème d'évaluation. |
| Livrable / FichierLivrable | La soumission de l'apprenant et ses fichiers. |
| Correction / NoteCritere / Feedback | L'évaluation manuelle détaillée du formateur. |
| Certificat / EmpreinteSHA256 | Le document certifiant et sa preuve d'intégrité. |
| Revocation / VerificationCertificat | L'invalidation et la journalisation des vérifications publiques. |
| SupportPedagogique | Document de cours uploadé, indexé pour le RAG. |
| GenerationIA | Lot de génération IA (formateur, module, paramètres, modèle LLM). |
| SuggestionQuestionIA | Question candidate proposée par l'IA, en attente de validation humaine. |
| AlerteDecrochage | Le signalement de désengagement au formateur. |
| AuditLog / Notification | La traçabilité et les messages aux utilisateurs. |

---

*Fin du document — Description du diagramme de classes · Cert_EET v2.0*
