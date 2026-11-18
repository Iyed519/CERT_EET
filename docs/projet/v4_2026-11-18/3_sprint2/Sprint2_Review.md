# Cert_EET — Sprint 2 · Revue de Sprint (Sprint Review) et rétrospective

> **Projet :** Cert_EET — Certification ESPRIT Entreprise · PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 2 — « Formations, inscriptions & moteur de QCM anti-fraude »
> **Statut :** ✅ **CLÔTURÉ** — 12/12 stories engagées (46 pts) + 1 story d'extension (2 pts) ; 6 stories
> d'extension (16 pts) reportées en tête du Sprint 3.
> **Réalisé du 05/10/2026 au 07/11/2026** (PR #23 → #38) — planifié du 22/05 au 04/06/2026 (Gantt), voir §9.
> **But de ce document :** expliquer **simplement** ce qui a été construit pendant le Sprint 2, **pourquoi**,
> **comment ça marche**, **comment le démontrer**, et ce que l'on change pour la suite (rétrospective) —
> lisible par un non-spécialiste comme par le jury.

---

## 0. Comment lire ce document

Même logique que la revue du Sprint 1 (`docs/Sprint1_Review.md`) : pour chaque bloc, **Quoi** (ce qui a
été fait), **Pourquoi** (le problème résolu), **Comment** (le mécanisme, sans jargon). Les termes
techniques nouveaux de ce sprint (tentative, tirage, fenêtre, balayage, verrou, trigger…) sont définis
dans le **glossaire (§12)** ; ceux du Sprint 1 (JWT, RBAC, CI…) dans celui de la revue du Sprint 1.

Le détail technique de chaque story est dans son journal : `engineering-log/21` à `engineering-log/34`.

---

## 1. Le contexte en une page

Le Sprint 1 a coulé les **fondations** : serveur, base de données, sécurité des comptes, chaîne de
livraison. Le Sprint 2 construit le **premier étage habitable** : la plateforme sait maintenant organiser
une formation, y inscrire des apprenants et leur faire passer une **évaluation certifiante**.

C'est le cœur du projet. Une certification n'a de valeur que si l'examen qui la délivre est **fiable** :
impossible de connaître les réponses à l'avance, impossible de tricher sur le temps, impossible de
modifier une note après coup. Le benchmark de la phase 1 l'a montré : c'est ce qui manque aux outils
actuels (Blackboard, Teams, Moodle). Le Sprint 2 livre ce **moteur de QCM anti-fraude**, entièrement
décidé par le serveur : le navigateur de l'apprenant n'est jamais cru sur parole.

Une image : un examen sur table, où la copie, le sujet, le chronomètre et le barème restent dans la
**salle des professeurs** (le serveur). L'étudiant ne voit que les questions qu'on lui tend, dans un ordre
qui lui est propre, et ne repart jamais avec le corrigé avant l'heure.

---

## 2. Le but du Sprint (Sprint Goal) et son verdict

> **Objectif engagé (Plan de Sprint 2, §1) :** « À la fin du Sprint 2, un administrateur crée et configure
> une formation et y affecte un formateur ; un apprenant s'inscrit et accède aux modules ; un formateur
> crée et publie un QCM sur ses formations affectées ; un apprenant passe ce QCM dans des conditions
> anti-fraude réelles — temps géré côté serveur, questions/options randomisées, bonnes réponses jamais
> envoyées au client, score calculé et figé côté serveur. »

**Verdict : objectif atteint.** Chaque maillon de la phrase est livré, testé et démontrable :

| Maillon de l'objectif | Livré par | Preuve |
|---|---|---|
| Créer / configurer une formation | US-FORM-01 | e2e `formations`, `formation-modules` |
| Affecter un formateur | US-FORM-03 | e2e `formation-formateurs` |
| Le formateur n'agit que sur ses formations | US-AUTH-16 | e2e `formateur-formations` (403 + audit) |
| L'apprenant s'inscrit, accède aux modules | US-INSC-01, US-INSC-04 | e2e `inscriptions`, `espace-formation` |
| Créer, configurer, publier un QCM | US-QCM-01, 03, 04 | e2e `qcm`, `qcm-configuration`, `qcm-publication` |
| Accès contrôlé, tirage, non-fuite | US-QCM-05, 06 | e2e `tentative-demarrage`, `tentative-tirage` |
| Temps décidé par le serveur | US-QCM-07 | e2e `tentative-passage` |
| Score calculé et figé | US-QCM-08 | e2e `tentative-notation` (trigger d'immuabilité) |

**En plus de l'objectif :** US-QCM-09 (extension) — l'apprenant voit son **corrigé** selon le mode choisi
par le formateur, toujours sans fuite des réponses.

---

## 3. Bilan chiffré

| Indicateur | Valeur | Ce que ça veut dire |
|---|---|---|
| Stories livrées | **13** + 1 enabler | 12 engagées + 1 d'extension ; l'enabler (modèle de données) n'est pas une story utilisateur |
| Points engagés | **46 pts** (12/12) | Tout l'engagement ferme est tenu (le Plan annonçait « ~51 » : erreur d'addition, la somme du tableau fait 46) |
| Points d'extension | **2 pts** (1/7) | US-QCM-09 livrée ; 16 pts reportés (§11) |
| **Vélocité** | **48 pts** | Sprint 1 : 41 + 25 (+ 3) — voir l'explication ci-dessous |
| Pull Requests mergées | **#23 → #38** (16) | Dont une annulation et sa reprise (#27 → #28 → #29, §7) |
| Tests automatisés (API) | **741** verts | 468 unitaires (36 suites) + 273 d'intégration e2e (21 suites) ; **110** à la fin du Sprint 1 |
| Migrations | 3 | Modèle de données (2) + trigger d'immuabilité des tentatives notées (1) |
| Journaux techniques | `engineering-log/` 21 → 34 | Un compte rendu écrit par story |
| Durée réelle | **≈ 5 semaines** (05/10 → 07/11/2026) | Durée nominale : 2 semaines (§9) |

**Pourquoi moins de points qu'au Sprint 1 ?** Le Plan de Sprint 2 (§2) l'avait annoncé : le Sprint 1
était fait d'outillage balisé (Docker, CI, authentification), le Sprint 2 de **logique serveur sensible**
où chaque protection doit être **prouvée** — tests de concurrence qui forcent le chevauchement, tests de
non-fuite sur le trafic réel, et tests de « mutation » (on retire la protection une fois pour vérifier
que le test échoue). Un point du Sprint 2 coûte plus cher qu'un point du Sprint 1.

---

## 4. Ce qui a été construit (expliqué simplement)

Trois épopées sont concernées : **E2** (formations, inscriptions), **E3** (moteur de QCM) et **E1**
(autorisation). On les présente dans l'ordre du parcours : la formation, l'inscription, le QCM du
formateur, le passage de l'apprenant, le résultat.

### 4.1 Le socle de données *(enabler — PR #23, journal 21)*

*Quoi :* créer en une fois les **12 tables** du cœur métier (formations, modules, inscriptions,
affectations de formateurs, QCM, configuration anti-fraude, questions, options, tentatives, réponses…).
*Pourquoi :* aucune story ne se code sans elles ; les poser d'abord évite des reprises coûteuses.
*Comment :* deux migrations réversibles. Le schéma porte **lui-même** une partie des garanties : contraintes
d'unicité (pas deux inscriptions identiques), clés étrangères qui interdisent de supprimer une question
déjà utilisée, et la colonne « bonne réponse » marquée pour n'être **jamais chargée par défaut**.

### 4.2 Formations et autorisation

**US-FORM-01 — Créer et configurer une formation** *(PR #24, journal 22)*.
*Quoi :* l'administrateur crée une formation (objectifs, capacité, seuil de certification, modèle de
certificat) et gère ses modules. *Pourquoi :* c'est la racine de tout le métier. *Comment :* la formation
naît OUVERTE et apparaît au catalogue ; chaque écriture est tracée dans le journal d'audit du Sprint 1.

**US-FORM-03 — Affecter un formateur** *(PR #25, journal 23)*.
*Quoi :* l'administrateur affecte un ou plusieurs formateurs à une formation, ou les retire. *Pourquoi :*
c'est l'information que lit l'autorisation par ressource. *Comment :* le formateur est prévenu par email ;
affectation et retrait sont tracés.

**US-AUTH-16 — Autorisation par ressource** *(PR #26, journal 24)*.
*Quoi :* un formateur n'agit **que** sur les formations auxquelles il est affecté. *Pourquoi :* le contrôle
par rôle du Sprint 1 dit « un formateur peut créer un QCM » ; il ne dit pas « sur quelle formation ». Sans
cette règle, n'importe quel formateur pourrait modifier l'examen d'un collègue (ADR-11). *Comment :* un
garde réutilisable, `@FormateurDeLaFormation`, vérifie l'affectation avant chaque action ; sinon refus
**403** et trace `ACCES_RESSOURCE_REFUSE`. L'administrateur passe toujours. Le formateur obtient son
premier écran, « Mes formations ».

### 4.3 Inscriptions et espace de l'apprenant

**US-INSC-01 — S'inscrire à une formation** *(PR #29, journal 25)*.
*Quoi :* l'apprenant s'inscrit lui-même à une formation ouverte qui a encore de la place. *Pourquoi :* sans
inscription, pas d'accès aux évaluations. *Comment :* la capacité ne peut **jamais** être dépassée, même
si cent apprenants cliquent à la même seconde : l'inscription se fait dans une transaction qui
**verrouille** la formation le temps de compter les places. Email de bienvenue, trace `INSCRIPTION_CREEE`.
Premiers écrans apprenant : catalogue, fiche d'une formation, « Mes inscriptions ».

**US-INSC-04 — Accéder aux modules** *(PR #30, journal 26)*.
*Quoi :* « Mon espace » dans une formation : progression, échéance, modules dans l'ordre et, pour chacun,
les QCM publiés avec **mon** avancement (à faire, en cours, réussi, échoué). *Pourquoi :* c'est la porte
d'entrée du passage d'un QCM. *Comment :* l'accès est ouvert par l'inscription ; un apprenant non inscrit
ou suspendu reçoit un 403 tracé. Aucune question n'est envoyée à ce stade.

### 4.4 Le QCM côté formateur

**US-QCM-01 — Créer le contenu d'un QCM** *(PR #31, journal 27)*.
*Quoi :* le formateur affecté crée des QCM (au brouillon) avec des questions à choix unique, à choix
multiple ou vrai / faux, leurs options, bonnes réponses, pondérations et explications. *Pourquoi :* c'est
la matière de l'évaluation. *Comment :* chaque question est validée par le serveur avec un message ciblé
(« Une question doit avoir au moins une bonne réponse. », « Une question à choix unique (QCU) doit avoir
exactement une bonne réponse. »…). Dès la **première tentative**
d'un apprenant, le contenu se **fige** (seules les explications restent modifiables) : on ne change pas
les questions d'un examen déjà commencé.

**US-QCM-03 — Paramètres anti-fraude** *(PR #32, journal 28)*.
*Quoi :* randomisation, tirage de K questions parmi N, durée, fenêtre d'ouverture, nombre de tentatives,
délai entre tentatives, mode d'affichage du résultat (immédiat / différé), seuil de réussite.
*Pourquoi :* c'est ce qui transforme un quiz en **évaluation certifiante**. *Comment :* le serveur vérifie
la cohérence de l'ensemble (K ≤ N, fermeture après ouverture…) ; ces règles se figent à la première
tentative (seule la fermeture peut alors être **repoussée**). Deux paramètres — surveillance webcam et
blocage du copier-coller — sont **enregistrés mais affichés « Bientôt actif »** : ils ne sont pas
appliqués (révision v1.6 du Backlog, US-QCM-12).

**US-QCM-04 — Publier un QCM** *(PR #33, journal 29)*.
*Quoi :* le formateur publie un QCM complet ; l'apprenant le voit alors dans « Mon espace » avec sa
fenêtre (à venir, ouverte, fermée). *Pourquoi :* séparer la préparation de la mise à disposition.
*Comment :* au moment de publier, sous verrou, le serveur **revérifie tout** (au moins une question,
configuration présente, tirage possible, fermeture encore à venir) ; trace `QCM_PUBLIE`.

### 4.5 Le passage du QCM — le moteur anti-fraude

**US-QCM-05 — Démarrer une tentative** *(PR #34, journal 30)*.
*Quoi :* l'apprenant démarre une tentative. *Pourquoi :* c'est l'entrée de l'examen, et le premier point
où l'on peut tricher (démarrer hors fenêtre, dépasser le nombre d'essais). *Comment :* le serveur vérifie,
avec **sa propre horloge** (celle de la base de données, pas celle du navigateur) : QCM publié,
inscription active, instant dans la fenêtre, tentative restante, délai respecté. Sinon il refuse avec le
**motif précis** et la date de réouverture. L'échéance de la tentative ne dépasse jamais la fermeture du
QCM. Une tentative déjà en cours est **reprise**, pas dupliquée.

**US-QCM-06 — Randomisation et confidentialité des réponses** *(PR #35, journal 31)*.
*Quoi :* chaque apprenant reçoit ses questions et ses options dans un ordre qui lui est propre, **sans
jamais** la bonne réponse. *Pourquoi :* deux voisins ne voient pas le même ordre (« la réponse est C » ne
veut plus rien dire), et inspecter le trafic réseau ne révèle rien. *Comment :* le tirage est fait par un
générateur **cryptographique** à la création de la tentative, puis **figé** (`planTirage`) : chaque
rechargement montre exactement le même examen. La réponse envoyée au navigateur est construite par
**liste blanche** (on liste ce qu'on envoie, au lieu de retirer ce qu'on cache) ; un test de non-fuite
inspecte le trafic réel.

**US-QCM-07 — Minuterie serveur et sauvegarde des réponses** *(PR #36, journal 32)*.
*Quoi :* l'apprenant répond ; chaque réponse est enregistrée sur le serveur peu après chaque clic,
restaurée au rechargement, et **refusée** dès que l'échéance est atteinte. *Pourquoi :* le temps ne doit
pas être contournable (changer l'heure de son ordinateur ne sert à rien), et une coupure ne doit rien
faire perdre. *Comment :* l'échéance est fixée et vérifiée par **PostgreSQL** ; à l'échéance, la tentative
est close « temps écoulé », réponses conservées. Un **balayage** toutes les 60 s clôt les tentatives
échues que plus personne ne touche. Redis tient une copie de la minuterie, sans jamais la décider (écart
assumé, §6).

**US-QCM-08 — Notation serveur et tentative figée** *(PR #37, journal 33)*.
*Quoi :* chaque tentative terminée est **notée par le serveur** : score pondéré, réussite au seuil,
correction écrite sur chaque réponse. *Pourquoi :* un score calculé par le navigateur se falsifie ; un
score modifiable après coup n'a aucune valeur probante. *Comment :* question à choix multiples en « tout
ou rien » ; seules les questions tirées comptent. La tentative passe à **NOTEE** et une règle de la base
(**trigger**) refuse ensuite **toute** modification, même par une commande SQL directe. Le taux
d'avancement de l'inscription est mis à jour.

### 4.6 Le résultat *(extension)*

**US-QCM-09 — Voir son résultat (corrigé)** *(PR #38, journal 34)*.
*Quoi :* sous son score, l'apprenant voit soit « Voir le corrigé », soit la date à partir de laquelle il
le pourra ; le corrigé montre, par question, sa réponse, juste / faux, les points, la bonne réponse et
l'explication. *Pourquoi :* comprendre ses erreurs — sans que le corrigé ne fuite vers ceux qui n'ont pas
encore passé l'examen. *Comment :* le **serveur** décide : en mode **différé**, jamais avant la fermeture
du QCM ; en mode **immédiat**, dès que l'apprenant n'a plus de tentative possible (avec une seule
tentative, c'est à la soumission). Le corrigé a sa **propre route** : ni la page de passage ni la
soumission ne portent jamais de bonne réponse.

---

## 5. Script de démonstration (pour la Sprint Review)

Ordre conseillé (≈ 15–20 min). Préparer trois comptes (administrateur, formateur, apprenant) et ouvrir une
fenêtre de navigation privée par compte.

1. **Administrateur** — `Formations` : créer une formation (objectifs, capacité, seuil), ajouter deux
   modules, **affecter le formateur**.
2. **Autorisation par ressource** — avec un **second** formateur non affecté, ouvrir
   `/formateur/formations/{id}` de cette formation → **refus 403** ; montrer la trace `ACCES_RESSOURCE_REFUSE` dans le journal d'audit (admin).
3. **Apprenant** — catalogue → s'inscrire → « Mes inscriptions » → « Mon espace » : progression 0 %,
   modules dans l'ordre.
4. **Formateur** — « Mes formations » → module → créer un QCM de 4 questions (choix unique, choix
   multiple, vrai / faux) avec explications ; **Paramètres** : randomisation activée, durée 10 min,
   fenêtre ouverte, **1 tentative**, affichage **immédiat**, seuil 60 % ; **Publier**.
   Montrer que webcam et copier-coller sont signalés « Bientôt actif » (non appliqués).
5. **Apprenant** — « Commencer » : questions **mélangées**, compte à rebours calé sur le serveur.
   Ouvrir l'**inspecteur réseau** (F12 → Réseau) : aucune bonne réponse, aucune explication dans les
   données reçues. Recharger la page : mêmes questions, même ordre, réponses restaurées.
6. **Soumission** — soumettre : score calculé par le serveur, « Réussi » / « Échoué » ; cliquer
   **« Voir le corrigé »** : réponse donnée, bonne réponse, explication, par question.
7. **Mode différé** — un second QCM en affichage **différé** : après soumission, le score s'affiche mais
   le corrigé indique « disponible le {date de fermeture} ».
8. **Temps écoulé** — un QCM d'une minute : laisser expirer ; la tentative est close et **notée** par le
   serveur, réponses partielles comptées.
9. **Immuabilité** — (optionnel, en terminal) tenter un `UPDATE` SQL sur une tentative NOTEE → refusé par
   le trigger.
10. **« Mon espace »** — progression mise à jour, badge Réussi / Échoué par QCM.
11. **Swagger et CI** — `http://localhost/api/docs` : nouvelles routes (formations, inscriptions, QCM,
    tentatives) ; GitHub → **Actions** : CI verte (exigée avant chaque fusion).

---

## 6. Qualité, décisions et écarts assumés

### Definition of Done
Chaque story livrée respecte la DoD du Plan (§9) : critères d'acceptation, tests unitaires **et** e2e
(cas d'erreur compris), RBAC + autorisation par ressource, validation serveur, audit, Swagger, **CI
verte** avant squash-merge, front vérifié dans un navigateur (`tsc --noEmit`, `next lint`, parcours réel à
1280 px et 390 px), journal écrit.

### Principes de conception retenus pendant le sprint
- **Le serveur décide, toujours.** Horloge de PostgreSQL (`now()`), jamais celle du navigateur ni du
  serveur Node ; aucune règle d'examen exécutée côté client.
- **Liste blanche** pour tout ce qui part vers l'apprenant ; la bonne réponse n'est lue que par des
  requêtes explicites, à deux endroits (notation, corrigé).
- **Règles pures** dans des fichiers séparés (`*.regles.ts`), testées sans base de données.
- **Un refus n'annule jamais une écriture légitime** : il est renvoyé par la transaction et levé après
  sa validation (ex. : la clôture « temps écoulé » est enregistrée, puis le 409 est renvoyé).
- **Chaque protection est prouvée** : chevauchement forcé pour la concurrence, mutation (retirer la
  protection, voir le test échouer).

### Écarts assumés avec les documents de conception
Tous décidés **avant** de coder, dans le tableau D de la story, et tracés dans son journal :

| Document | Ce qu'il dit | Ce qui est fait | Pourquoi |
|---|---|---|---|
| DS-02 ét. 1 | Refus en 403 | **409** pour les refus liés au temps (hors fenêtre, temps écoulé, corrigé différé) | 403 = « tu n'as pas le droit » ; 409 = « pas maintenant » |
| DS-02 ét. 2–4 | `/qcm/tentative/…`, `PATCH …/reponse` | `POST /qcm/:qcmId/tentatives`, `PUT /tentatives/:id/reponses/:questionId`, `POST …/soumettre` | Routes REST cohérentes avec le reste de l'API |
| Backlog US-QCM-07 | Minuterie = TTL Redis | Échéance décidée par **PostgreSQL**, Redis en miroir | Une seule horloge de référence, transactionnelle |
| DS-02 ét. 4 | État final SOUMISE + score | État final **NOTEE** | ET-02 et le Backlog concordent |
| Backlog US-QCM-08 | Audit `QCM_SOUMIS` à la notation | `TENTATIVE_NOTEE` | `QCM_SOUMIS` existe déjà à la soumission |
| DS-09 | Progression calculée à la lecture | Recalculée **à la notation** | Une lecture reste sans effet |
| DS-02 ét. 5 | Corrigé dans la réponse de soumission | Route dédiée `GET …/correction` | Un seul point de sortie des bonnes réponses |
| Backlog US-QCM-09 | Corrigé immédiat à la soumission | Immédiat **après la dernière tentative** (identique avec 1 tentative) | UC_Apprenant UC3 : pas de fuite vers une tentative suivante |

Ces écarts sont reportés dans les documents (Backlog Produit v1.7, DS-02, DS-09) à la clôture du sprint.

### Décisions de périmètre (révisions du Backlog Produit)
- **v1.4 (10/10)** — le formateur affecté gère le **contenu pédagogique** de ses formations : US-FORM-04
  (3 pts), en extension.
- **v1.5 (11/10)** — **ressources de module** consultables par l'apprenant : US-FORM-05 liens (3 pts,
  extension), US-FORM-06 fichiers (5 pts, Sprint 4 avec MinIO).
- **v1.6 (12/10)** — surveillance webcam : US-QCM-12 (Could, 8 pts, Sprint 5+), conditionnée à l'accord de
  l'encadrant et à une décision sur la protection des données (RGPD, loi 2004-63 / INPDP).

---

## 7. Incidents et leçons

| Incident | Effet | Correction / leçon |
|---|---|---|
| **Annulation d'une story sur `main`** : bouton « Revert » de GitHub cliqué après la fusion d'US-INSC-01 (#27 → #28) | La story a disparu de `main` | Reprise par une nouvelle PR (#29). Règle : ne jamais cliquer « Revert » ; une correction passe par une nouvelle PR |
| **Titres de fusion par défaut** (#29, #30, #38 : « Feature/us … ») | Historique de `main` moins lisible | Laissés tels quels (pas de réécriture de `main`) ; action de rétrospective §8 |
| **Test à retardement** (`qcm-configuration.service.spec.ts`) : dates fixes comparées à l'horloge réelle | 8 tests rouges sur `main` à partir du 02/11 | Horloge figée dans le test (#37). Règle : jamais de date fixe face à l'horloge réelle |
| **Tests de concurrence qui ne prouvaient rien** (US-INSC-01, US-QCM-05, US-QCM-06) | Vert sans que la protection soit exercée | Chevauchement **forcé** (verrou tenu ~1 s) et preuve par mutation |
| **CSS non recompilé** dans le conteneur `web` (Windows) | Styles absents malgré le code à jour | `restart web` + rechargement forcé ; `WATCHPACK_POLLING` à activer (§9) |
| **Prettier sur les fichiers web** | Fichiers entiers reformatés | Ne jamais lancer Prettier sur `apps/web` ; modifications à la main |
| **`tsc` juste après `restart web`** | Erreurs TS6053 sur `.next/types` en cours de régénération | Lancer `tsc` une fois `next dev` stabilisé |
| **Base de référence faussée** (tests lancés pendant l'édition du code, Redis arrêté) | Mesure de départ fausse | Référence toujours prise sur une copie intacte, Postgres **et** Redis démarrés |
| **Réseau absent** à la création d'une branche | Branche sans suivi distant, `git push` refusé | `git push -u origin <branche>` une fois le réseau revenu |
| **Poste en veille** pendant les e2e | Durées affichées de plusieurs heures | Aucune incidence sur le résultat ; relancer si besoin |

---

## 8. Rétrospective

### Ce qui a bien marché (à garder)
- **Documents d'abord, tableau D avant de coder** : aucun écart découvert après coup ; tous sont tracés.
- **Une étape à la fois** (API → UI → journal), chacune vérifiée sur le poste avant la suivante.
- **Tests qui prouvent** : non-fuite sur le trafic réel, concurrence forcée, mutation.
- **Règles pures séparées** : tests rapides, aucune dépendance circulaire.
- **Vérification dans un vrai navigateur** (bureau et mobile) avant de livrer l'UI.

### Ce qui n'a pas marché (à arrêter)
- Laisser GitHub décider à notre place : bouton « Revert », titre de fusion par défaut.
- Lancer des outils globaux sur des fichiers qui ne les suivent pas (Prettier sur le web).
- Comparer des dates fixes à l'horloge réelle dans un test.
- Lancer une vérification pendant qu'un outil régénère ses fichiers (`tsc` après `restart web`).

### Ce qu'on essaie au Sprint 3
| # | Action | Mesure de réussite |
|---|---|---|
| 1 | **Liste de contrôle de fusion** en fin de texte de PR : titre remplacé, branche conservée, CI verte | 0 titre par défaut sur `main` au Sprint 3 |
| 2 | **Front dans la CI** : job `tsc --noEmit` + `next lint` sur `apps/web` (une PR `chore` en début de sprint, avec `WATCHPACK_POLLING` et le délai e2e global de 30 s) | Job vert sur chaque PR du Sprint 3 |
| 3 | **Re-planifier au Sprint 3 Planning** : durée du sprint fixée à l'avance et engagement calé sur la vélocité observée (48 pts sur ≈ 5 semaines) | Sprint 3 clôturé à la date prévue |
| 4 | **Secrets** : rotation avant tout partage du dépôt (§9) | Aucun secret valide accessible à un tiers |

---

## 9. Risques et dette assumée

- **Écart de calendrier.** Le Sprint 2 a duré ≈ 5 semaines (05/10 → 07/11/2026) au lieu des 2 prévues
  (Gantt : 22/05 → 04/06/2026). Plus largement, le Backlog Produit prévoit 12 sprints du 24/04 au
  **24/10/2026** : cette date de fin est **dépassée**, alors que les épopées E4 (ateliers), E5
  (certification), E6 (IA) et E8 (analytics) restent à faire. **À traiter avec l'encadrant au Sprint 3
  Planning** : nouvelle date de fin, priorisation des épopées restantes (MoSCoW), éventuel recentrage du
  périmètre de démonstration sur le parcours certifiant (E3 → E5).
- **Secrets sur la branche `docs`.** Depuis le commit `9cd3913`, la branche `docs` (et elle seule) suit
  `.env` (mots de passe Postgres et administrateur, secrets OAuth Google et GitHub), `secrets/jwt_*.pem`
  et une ancienne clé TLS auto-signée. **Décision (Iyed) : traitement en fin de projet** — PR vers `docs`
  qui retire ces fichiers du suivi, puis **rotation de toutes les valeurs**, sans réécriture d'historique.
  D'ici là : dépôt privé, aucun collaborateur ajouté. **Recommandation : faire la rotation avant tout
  partage du dépôt** (encadrant, jury), même si ce partage arrive avant la fin du projet.
- **Front hors CI** (dette du Sprint 1) : vérifié à la main à chaque story ; action 2 du §8.
- **Environnement de développement Windows** : `WATCHPACK_POLLING=true` à ajouter pour le service `web` ;
  délai e2e global de 30 s à poser dans `apps/api/test/jest-e2e.json` ; action 2 du §8.
- **Paramètres enregistrés sans effet** : surveillance webcam (US-QCM-12) et blocage du copier-coller
  (à rattacher à une story) — affichés « Bientôt actif », jamais présentés comme fonctionnels.
- **Documents à aligner** avec ce qui est livré (tableau du §6) : reportés à la clôture du sprint
  (Backlog Produit v1.7, DS-02, DS-09, DS-12, totaux du Plan et du Sprint Backlog).

---

## 10. Métriques de livraison (vue synthétique)

```
Engagement ferme (committed)        ████████████████████  12/12  (46 pts)
Extension (stretch)                 ███                    1/7   (2 / 18 pts)
Vélocité                            48 pts  (Sprint 1 : 69 pts)
Tests automatisés                   741 verts  (468 unitaires + 273 e2e ; 110 au Sprint 1)
Pull Requests                       #23 → #38  (16, CI verte avant chaque fusion)
Durée réelle                        ≈ 5 semaines  (nominale : 2)
```

---

## 11. Et après (Sprint 3)

**Reporté du Sprint 2, en tête du Sprint 3, dans cet ordre :** US-FORM-04 contenu pédagogique géré par le
formateur (3) · US-FORM-05 ressources de module, liens (3) · US-FORM-02 clôturer / archiver une formation
(2) · US-INSC-02 gérer les inscriptions, import CSV (3) · US-INSC-03 se désinscrire (2) · US-QCM-02
importer des questions depuis une banque (3) — **16 pts**.

**Prévu au Sprint 3 (Gantt, épopée E3) :** US-QCM-10 blocage des sessions multiples (Redis) et
US-QCM-11 historique immuable des tentatives (apprenant et formateur), qui réutilisera le corrigé
d'US-QCM-09.

**Première PR du sprint (`chore`) :** front dans la CI, `WATCHPACK_POLLING`, délai e2e global (§8,
action 2).

**Plus loin :** ateliers et MinIO (E4, Sprint 4, avec US-FORM-06), certification vérifiable (E5),
assistance IA (E6) — à re-planifier avec l'encadrant (§9).

---

## 12. Glossaire (termes nouveaux du Sprint 2)

- **Formation / module** — un cours et ses chapitres ; un module porte des évaluations (QCM, plus tard
  des ateliers).
- **Inscription** — le lien entre un apprenant et une formation ; elle ouvre l'accès aux modules.
- **Affectation** — le lien entre un formateur et une formation ; elle ouvre le droit d'agir dessus.
- **Autorisation par ressource** — au-delà du rôle (« formateur »), vérifier **sur quelle** ressource on
  agit (« sa » formation).
- **QCM** — questionnaire à choix multiples ; ici trois types : choix unique, choix multiple, vrai / faux.
- **Pondération** — le poids d'une question dans le score (une question à 3 points compte triple).
- **Tentative** — un passage d'un QCM par un apprenant ; états : EN_COURS → SOUMISE ou ABANDONNEE_TIMER
  (temps écoulé) → NOTEE.
- **Fenêtre d'ouverture** — la période (ouverture → fermeture) pendant laquelle un QCM peut être passé.
- **Tirage (randomisation)** — le choix et l'ordre des questions et options propres à une tentative,
  fait au hasard par le serveur puis figé.
- **Générateur cryptographique** — une source de hasard imprévisible, même pour qui connaît le code.
- **Non-fuite** — la garantie qu'aucune bonne réponse ne transite vers le navigateur avant l'heure.
- **Liste blanche** — construire une réponse en listant ce qu'on envoie, plutôt qu'en retirant ce qu'on
  cache (un oubli ne fait alors rien fuiter).
- **Échéance** — l'instant où la tentative se termine d'elle-même ; fixée par la base, jamais après la
  fermeture du QCM.
- **Balayage** — une tâche du serveur qui, toutes les 60 s, clôt et note les tentatives échues.
- **Transaction / verrou** — une transaction regroupe des écritures qui réussissent ou échouent
  ensemble ; un verrou empêche deux requêtes simultanées de modifier la même ligne en même temps (ex. :
  la dernière place d'une formation).
- **Trigger** — une règle posée dans la base de données elle-même, qui s'exécute à chaque modification ;
  ici, elle refuse toute modification d'une tentative notée.
- **Immédiat / différé** — le mode d'affichage du corrigé choisi par le formateur.
- **Corrigé** — pour chaque question : la réponse donnée, juste ou fausse, les points, la bonne réponse
  et l'explication.
- **HTTP 403 / 409** — 403 : « tu n'as pas le droit » ; 409 : « pas maintenant » (conflit avec l'état
  courant : hors fenêtre, temps écoulé, corrigé pas encore disponible).
- **Test e2e (de bout en bout)** — un test qui appelle la vraie API, sur une vraie base, comme le ferait
  le navigateur.
- **Test de mutation** — retirer volontairement une protection pour vérifier que le test échoue : un
  test qui reste vert ne protégeait rien.
- **Enabler** — un travail technique sans valeur directe pour l'utilisateur, mais indispensable aux
  stories (ici, le modèle de données).
- **Vélocité** — le nombre de points livrés en un sprint ; sert à calibrer l'engagement du suivant.
- **Rétrospective** — la réunion de fin de sprint où l'on décide quoi garder, arrêter et essayer.

---

*Revue de Sprint et rétrospective · Cert_EET — Sprint 2 · Iyed Omri, PFE ESPRIT · ESPRIT Entreprise.*
