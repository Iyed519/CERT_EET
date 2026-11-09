# Cert_EET — Sprint 3 · Revue de Sprint (Sprint Review) et rétrospective

> **Projet :** Cert_EET — Certification ESPRIT Entreprise · PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 3 — « Parcours certifiant complet : ateliers, certificat vérifiable, assistance IA »
> **Statut :** ✅ **CLÔTURÉ** — bloc A engagé 14/14 (54 pts) + bloc B d'extension 4/4 (24 pts) + 2 stories
> ajoutées en cours de sprint (8 pts) : **20 stories, 86 pts**.
> **Réalisé du 08/11/2026 au 09/11/2026** (PR #40 → #65), avec un agent de développement (§3).
> **But de ce document :** expliquer **simplement** ce qui a été construit pendant le Sprint 3, **pourquoi**,
> **comment ça marche**, **comment le démontrer**, et ce que l'on change pour la suite (rétrospective) —
> lisible par un non-spécialiste comme par le jury.

---

## 0. Comment lire ce document

Même logique que les revues des Sprints 1 et 2 (`docs/Sprint1_Review.md`, `docs/Sprint2_Review.md`) : pour
chaque bloc, **Quoi** (ce qui a été fait), **Pourquoi** (le problème résolu), **Comment** (le mécanisme,
sans jargon). Les termes nouveaux de ce sprint (grille, livrable, file de travaux, empreinte, RAG,
embeddings…) sont définis dans le **glossaire (§12)**.

Le détail technique de chaque story est dans son journal : `engineering-log/35` à `engineering-log/54`.

---

## 1. Le contexte en une page

Le Sprint 2 a livré le **moteur de QCM anti-fraude**. Mais une certification d'ESPRIT Entreprise ne repose
pas que sur un QCM : le cahier des charges demande aussi des **ateliers pratiques corrigés par un
formateur** (F2) et un **certificat vérifiable par n'importe qui** (F3). Sans ces deux étages, la
plateforme fait passer des examens mais ne certifie rien.

Le Sprint 3 termine donc le **parcours certifiant** de bout en bout : l'apprenant passe ses QCM (désormais
sur un seul appareil à la fois), rend ses ateliers, reçoit une correction détaillée et immuable ; dès que
tout est validé, la plateforme fabrique **seule** son certificat PDF avec un QR code ; un recruteur scanne
le QR et lit, sans compte, si le certificat est authentique, révoqué ou falsifié.

Il livre aussi l'**extension** prévue : l'**assistance IA du formateur**. Le formateur dépose son cours ;
la plateforme y cherche les passages utiles et demande à un modèle de langage des questions **ancrées
dans ce cours** ; le formateur les accepte, les corrige ou les rejette — rien n'entre dans un QCM sans lui.

Une image : un diplôme papier a de la valeur parce que l'école garde le registre et que n'importe qui peut
l'appeler pour vérifier. Ici, le registre est la base de données, l'appel est le QR code, et le tampon est
une **empreinte numérique** du PDF que personne ne peut imiter.

---

## 2. Le but du Sprint (Sprint Goal) et son verdict

> **Objectif engagé (document de passation du Sprint 3, §5) :** « Compléter le parcours certifiant — QCM
> anti-fraude terminé, ateliers pratiques évalués par le formateur, certificat vérifiable avec QR — puis
> l'IA du formateur si le temps le permet. »

**Verdict : objectif atteint, extension comprise.** Chaque maillon est livré, testé et démontrable :

| Maillon de l'objectif | Livré par | Preuve (suite e2e) |
|---|---|---|
| QCM anti-fraude terminé (un seul appareil) | US-QCM-10 | `tentative-session` (`E2E-SESSION`) |
| Le formateur crée un atelier et sa grille, le publie | US-ATEL-01, 02, 03 | `ateliers`, `grilles`, `ateliers-publication` |
| L'apprenant rend un livrable horodaté et scellé | US-ATEL-04 | `livrables` (MinIO, SHA-256) |
| Le formateur corrige critère par critère, feedback immuable | US-ATEL-06, 07 | `corrections`, `feedback` |
| L'apprenant lit son feedback | US-ATEL-08 | `mon-feedback` |
| Le certificat est fabriqué seul, une seule fois | US-ATEL-09, US-CERT-01 | `eligibilite`, `certificats` |
| L'apprenant télécharge son certificat | US-CERT-03 | `mes-certificats` |
| N'importe qui vérifie, sans compte, sans abus | US-CERT-04, 05 | `verification`, `verification-protection` |
| L'administrateur révoque, irréversiblement | US-CERT-06 | `revocation` |
| *(extension)* IA : support indexé, questions générées, révisées | US-IA-01 à 04 | `supports`, `generations`, `pipeline-rag`, `revision-suggestions` |

**En plus de l'objectif :** les **ressources du cours** (US-FORM-05, 06 — liens, vidéos YouTube / Vimeo,
fichiers) que l'apprenant consulte dans la plateforme, ajoutées à la demande du porteur.

---

## 3. Bilan chiffré

| Indicateur | Valeur | Ce que ça veut dire |
|---|---|---|
| Stories livrées | **20** | 14 engagées + 4 d'extension + 2 ajoutées en cours de sprint |
| Points engagés | **54 pts** (14/14) | Tout le bloc A est tenu |
| Points d'extension | **24 pts** (4/4) | Tout le bloc B (IA) est livré |
| Points ajoutés | **8 pts** | US-FORM-05 et 06 (révision v1.5) |
| **Vélocité** | **86 pts** | Sprint 2 : 48 ; Sprint 1 : 69 — voir l'explication ci-dessous |
| Pull Requests mergées | **#40 → #65** (26) | 21 PR de stories (US-ATEL-01 en deux) + 5 PR de maintenance |
| Tests automatisés (API) | **1 720** verts | 1 128 unitaires (77 suites) + 592 e2e (41 suites) ; **741** à la fin du Sprint 2 ; 1 essai facultatif (vraie API du modèle de langage) ignoré sans clé |
| Tests de mutation | **> 130** mutants tués | Chaque protection retirée une fois a fait échouer un test (détail par journal) |
| Migrations | **16** (11 → 27) | Ateliers, grilles, livrables, corrections, certificats, IA, ressources, sessions |
| Journaux techniques | `engineering-log/` 35 → 54 | Un compte rendu par story |
| Durée réelle | **2 jours** (08/11 → 09/11/2026) | Voir ci-dessous |

**Pourquoi tant de points en si peu de temps ?** Le Sprint 3 a été mené avec un **agent de développement**
(Claude, d'Anthropic) qui exécute, story après story, la procédure décrite dans le document de passation :
lire les documents, coder l'API et l'écran, écrire les tests, vérifier, ouvrir la PR, attendre la CI,
fusionner. Le porteur du projet fixe le périmètre, tranche les décisions (choix du modèle de langage,
ressources de module), relit et teste sur son poste. Cette vélocité **ne se compare donc pas** à celle d'un
développeur seul ; ce qui reste comparable d'un sprint à l'autre, c'est **l'exigence de preuve** — la même
Definition of Done, renforcée (§6).

---

## 4. Ce qui a été construit (expliqué simplement)

Cinq épopées sont concernées : **E3** (fin du QCM), **E4** (ateliers), **E5** (certification), **E6**
(IA) et **E2** (ressources du cours). On les présente dans l'ordre du parcours.

### 4.1 Le QCM sur un seul appareil *(US-QCM-10 — PR #40, journal 35)*

**Quoi.** Quand le formateur coche « Bloquer les sessions multiples », une tentative en cours ne sert que
depuis la connexion qui l'a ouverte. Un second appareil est refusé au démarrage, à l'affichage, à chaque
réponse et à la soumission ; chaque refus est tracé.
**Pourquoi.** Sans cela, deux personnes peuvent partager un compte et passer le même examen en même temps.
**Comment.** Chaque connexion porte un identifiant de session stable ; la tentative retient celle qui l'a
démarrée. Le verrou tombe quand cette session se termine (déconnexion) ou à l'échéance de la tentative —
un téléphone perdu ne bloque pas l'apprenant au-delà de la durée du QCM.

### 4.2 Les ateliers pratiques, côté formateur *(US-ATEL-01, 02, 03 — PR #41, #43, #44, #45, journaux 36–38)*

**Quoi.** Le formateur crée un atelier dans un module : énoncé, compétences visées, date limite, types de
fichiers acceptés (y compris du code source), taille, tolérance de retard. Il compose une **grille de
notation** : des critères pondérés en %, chacun avec quatre niveaux (Insuffisant, Acceptable, Bon,
Excellent) et leurs plages de points ; la grille doit valoir **exactement 100 %** pour être validée et peut
devenir un **modèle** réutilisable. Il publie ensuite l'atelier, qui se fige.
**Pourquoi.** Une note pratique n'est crédible que si les critères sont connus à l'avance et ne changent
plus une fois l'atelier ouvert.
**Comment.** Tant que l'atelier est en brouillon, tout se modifie ; chaque écriture prend un **verrou** sur
la ligne de l'atelier pour que deux modifications simultanées ne cassent pas le total de 100 %. À la
publication, l'atelier et sa grille deviennent non modifiables, et l'apprenant inscrit les voit, grille
comprise, **avant** de rendre son travail.

### 4.3 Le livrable de l'apprenant *(US-ATEL-04 — PR #47, journal 39)*

**Quoi.** L'apprenant dépose ses fichiers, un commentaire et des liens. Le serveur contrôle le **contenu
réel** des fichiers (un `.zip` renommé en `.pdf` est refusé), leur taille et leur nombre, juge le délai
**à la réception** sur l'horloge de la base, calcule l'**empreinte SHA-256** de chaque fichier et range le
tout dans le stockage objet (MinIO). Les formateurs reçoivent un email.
**Pourquoi.** C'est la preuve d'antériorité : on peut démontrer plus tard que le fichier corrigé est
exactement celui rendu, à l'heure dite.
**Comment.** Le dépôt est définitif (le remplacement, US-ATEL-05, n'est pas livré) ; un dépôt hors délai
est refusé, un dépôt dans la tolérance est accepté et marqué « en retard ».

### 4.4 La correction et le feedback *(US-ATEL-06, 07, 08 — PR #49, #50, #51, journaux 40–42)*

**Quoi.** Le formateur ouvre un livrable — l'apprenant ne peut alors plus y toucher —, choisit pour chaque
critère le niveau atteint, des points dans la plage de ce niveau et un commentaire ; le score pondéré se
recalcule en direct. Il écrit un commentaire général et **envoie** : la note est figée, l'apprenant reçoit
un email et lit le détail par critère ; « Mon espace » affiche « Nouveau feedback » jusqu'à la première
lecture.
**Pourquoi.** La correction doit être reproductible (même grille pour tous) et **immuable** une fois
envoyée — sinon une note pourrait être retouchée après coup.
**Comment.** L'immuabilité est garantie **deux fois** : par l'API, et par des règles posées dans la base
elle-même (déclencheurs) qui refusent toute modification, même par une commande SQL directe. Tant que la
correction est en cours, l'apprenant ne voit aucune note partielle.

### 4.5 Le certificat, fabriqué seul *(US-ATEL-09, US-CERT-01, US-CERT-03 — PR #52, #53, #54, journaux 43–45)*

**Quoi.** Après chaque note (QCM réussi, correction envoyée), la plateforme vérifie si l'apprenant a tout
validé : chaque QCM publié réussi, chaque atelier publié noté au-dessus du seuil de la formation. Si oui,
elle demande son certificat — **une seule fois**. Un travail en arrière-plan fabrique le PDF (nom,
formation, score, mention, QR code), calcule son empreinte, le range et prévient l'apprenant, qui le
télécharge depuis « Mes certificats ».
**Pourquoi.** Fabriquer un PDF prend du temps : la page de l'apprenant ne doit jamais attendre (ADR-04).
Et deux notes simultanées ne doivent pas produire deux certificats.
**Comment.** Une **file de travaux** (BullMQ, sur le Redis existant) sépare la demande de la fabrication.
Une contrainte d'unicité en base garantit un seul certificat par apprenant et formation. En cas d'échec,
le travail est repris trois fois, puis laissé en attente d'une relance par l'administrateur.

### 4.6 La vérification publique et la révocation *(US-CERT-04, 05, 06 — PR #55, #56, #57, journaux 46–48)*

**Quoi.** N'importe qui ouvre le lien du QR code et lit un verdict : **valide et authentique**,
**révoqué** (avec la date), ou **intégrité compromise**. Il peut aussi comparer un PDF reçu par email :
l'empreinte est calculée dans son navigateur, le fichier n'est jamais envoyé. La page est protégée (20
consultations par minute et par adresse, jamais indexée par les moteurs de recherche) et ne montre que le
strict nécessaire. L'administrateur peut **révoquer** un certificat (motif, case « irréversible », mot de
passe) : l'effet est immédiat et définitif.
**Pourquoi.** C'est la lacune G3 du benchmark : un certificat que personne ne peut vérifier ne vaut rien
sur le marché du travail. Et une erreur ou une fraude doit pouvoir être corrigée sans effacer la trace.
**Comment.** À chaque vérification, le serveur relit le PDF stocké et recalcule son empreinte : un fichier
modifié dans le stockage est détecté. La révocation ne supprime rien : le PDF et son empreinte restent, le
statut passe à « révoqué » et une règle en base interdit tout retour en arrière. Le motif reste interne.

### 4.7 L'assistance IA du formateur *(US-IA-01 à 04 — PR #60, #61, #64, #65, journaux 49, 50, 53, 54)*

**Quoi.** Le formateur dépose un support de cours (PDF, PowerPoint, Word, texte). La plateforme l'**indexe**
en arrière-plan : elle extrait le texte, le découpe en passages et range chaque passage avec sa
« signature » numérique (embedding) dans la base. Le formateur demande ensuite, par exemple, « 5 questions,
choix unique et vrai / faux, niveau intermédiaire, sur la rotation des jetons » : la plateforme retrouve
les **8 passages du support les plus proches** du thème, les donne au modèle de langage avec des consignes
strictes, **vérifie** chaque question reçue (une seule bonne réponse en choix unique, options distinctes…)
et propose les questions conformes. Le formateur les **accepte**, les **modifie puis accepte**, ou les
**rejette** ; une question acceptée entre dans un QCM du module, marquée « IA » ou « IA modifiée ».
**Pourquoi.** Rédiger de bons QCM prend des heures. C'est le différenciant N4 du benchmark : des questions
**ancrées dans le vrai cours** du formateur, et **toujours validées par un humain**.
**Comment.** Le modèle (Claude, d'Anthropic) est appelé derrière une interface : on peut en changer par
configuration, et un fournisseur factice sert aux tests. Le texte du cours est donné comme une **donnée**,
jamais comme une consigne (protection contre l'« injection » d'instructions cachées dans un PDF). La base
garantit qu'une proposition non décidée n'est jamais reliée à un QCM et qu'une décision ne se prend
qu'une fois.

### 4.8 Les ressources du cours *(US-FORM-05, 06 — PR #62, #63, journaux 51, 52)*

**Quoi.** Le formateur ajoute à chaque module des liens (pages, dépôts), des vidéos YouTube ou Vimeo et des
fichiers de tout type. L'apprenant inscrit les retrouve dans « Mon espace » : il regarde les vidéos **dans
la plateforme**, voit les images, ouvre les PDF, télécharge le reste.
**Pourquoi.** Demande du porteur : le cours doit vivre dans la plateforme, pas dans des outils dispersés
(Teams, Blackboard) — c'est le problème de départ du projet.
**Comment.** Les vidéos en ligne sont affichées par un lecteur intégré sans cookie de suivi ; un fichier ne
s'ouvre que par un **lien temporaire de 10 minutes**, délivré à un inscrit, jamais par une adresse
permanente. Un fichier dont le format n'est pas sûr est toujours téléchargé, jamais exécuté dans le
navigateur.

---

## 5. Script de démonstration (pour la Sprint Review)

Ordre conseillé (≈ 25–30 min). Préparer quatre comptes (administrateur, formateur, apprenant, visiteur en
navigation privée), une formation avec un module, un QCM publié (Sprint 2) et un PDF de cours.

1. **Sessions multiples** — sur le QCM, cocher « Bloquer les sessions multiples » ; l'apprenant commence
   sur un navigateur, puis essaie sur un second → « Vous passez déjà ce QCM sur un autre appareil ».
2. **Atelier** — formateur : « + Atelier » (date limite, types PDF et ZIP) ; grille de trois critères
   (40 / 35 / 25 %) ; montrer le refus au-delà de 100 % ; « Valider » ; « Enregistrer comme modèle » ;
   « Publier ».
3. **Livrable** — apprenant : ouvrir l'atelier (grille visible), déposer un PDF ; montrer le refus d'un
   `.zip` renommé en `.pdf` ; Mailhog : email au formateur.
4. **Correction** — formateur : « Corriger », niveau + points + commentaire par critère (score en direct),
   commentaire général, « Envoyer le feedback » ; Mailhog : email à l'apprenant.
5. **Feedback** — apprenant : badge « Nouveau feedback », détail par critère.
6. **Certificat** — le QCM étant réussi et l'atelier noté au-dessus du seuil, « Mon espace » indique
   « Certificat en préparation » puis « Mes certificats » → télécharger le PDF (QR, empreinte).
7. **Vérification publique** — navigation privée : scanner le QR / ouvrir le lien → « Valide et
   authentique » ; déposer le PDF → « identique » ; déposer un autre PDF → « différent ».
8. **Révocation** — administrateur : `/admin/certificats` → « Révoquer » (mot de passe faux puis juste) ;
   la page publique affiche « Révoqué le … » ; email au titulaire.
9. **Ressources du cours** — formateur : ajouter une vidéo YouTube et un fichier MP4 ; apprenant :
   « Regarder » lit la vidéo dans la page.
10. **IA** — formateur : « + Support » (le PDF de cours) → « Indexé » ; « Générer » (5 questions, choix
    unique + vrai / faux, thème) → « Terminée » (email) ; « Réviser les questions » : accepter une
    question, en modifier une, en rejeter une avec un motif ; ouvrir le QCM : pastilles « IA » et
    « IA modifiée ».
11. **Swagger et CI** — `http://localhost/api/docs` : nouvelles routes ; GitHub → **Actions** : CI verte
    (API, Web, images) sur chaque PR et sur `main`.

> *L'étape 10 fonctionne sans clé avec le fournisseur factice (questions de démonstration) ; avec la clé
> Anthropic dans le `.env` local (`LLM_FOURNISSEUR=anthropic`), les questions sont rédigées par Claude.*

---

## 6. Qualité, décisions et écarts assumés

### Definition of Done
Chaque story respecte la DoD (Backlog Produit, L1) **renforcée** pendant ce sprint : critères
d'acceptation, tests unitaires **et** e2e (cas d'erreur compris), **test de concurrence forcée** pour chaque
course possible, **preuve par mutation** de chaque protection, RBAC + autorisation par ressource,
validation serveur, audit, Swagger, **CI verte sur le commit de tête de la PR** et **fusion épinglée sur ce
commit**, **CI verte sur `main`** après fusion (y compris la construction des images de production), front
vérifié dans un navigateur (1280 px et 390 px), journal écrit.

### Principes de conception retenus pendant le sprint
- **Le serveur décide, toujours** — l'horloge est celle de PostgreSQL (délais, dates limites, échéances).
- **Ce qui est figé l'est en base** — feedback, certificat actif, révocation, décisions sur les
  suggestions IA : des déclencheurs refusent la modification, même en SQL direct.
- **Exactement une fois** — certificat, consultation d'un feedback, décision sur une suggestion : une
  contrainte d'unicité ou un verrou de ligne, prouvé par un test de concurrence forcée.
- **Lent = en arrière-plan** — PDF, indexation, génération IA passent par une file de travaux ; la requête
  répond tout de suite (202) et l'état se lit ensuite.
- **Liste blanche** pour tout ce qui sort (page publique, réponses apprenant) ; aucune clé de stockage,
  aucun email exposé.
- **Interfaces pour les dépendances externes** — stockage, embeddings, modèle de langage : un fournisseur
  factice remplace le vrai en test.

### Écarts assumés avec les documents de conception
Tous décidés **avant** de coder, dans le tableau D de la story, et tracés dans son journal :

| Document | Ce qu'il dit | Ce qui est fait | Pourquoi |
|---|---|---|---|
| Backlog US-QCM-10 / DS-02 ét. 1 | Verrou de session dans Redis, refus 403 | Colonne `session_id` en base (Redis en miroir), refus **409** | Une seule source de vérité ; « pas maintenant » plutôt que « interdit » |
| DS-13 P1–P3 | `POST /ateliers` (module et formation dans le corps), grille sous `/grilles/:id` | Routes sous le module et sous l'atelier ; modèles sous `/grilles/modeles` | La formation se déduit du module ; le garde par ressource s'applique |
| DS-13 / UC4 | Niveaux « Correct / Bien » | « Acceptable / Bon » | L'UC4 et le Backlog font foi |
| DS-13 P3 | Grille non validée → 400 | **409** | C'est l'état qui bloque, comme pour un QCM |
| UC3 Formateur | Date d'ouverture, ressources jointes, compétences du référentiel | Publier = ouvrir ; ressources au niveau du module ; compétences en texte libre | Ni le Backlog ni DS-13 ne les prévoient |
| DS-03 P1 | Délai dépassé → 403 ; table `notifications` ; remplacement du livrable | **409** ; **email** ; pas de remplacement (US-ATEL-05 non livrée) | Refus de temps = 409 ; pas de notifications in-app dans le projet |
| DS-03 P2 | `PATCH /corrections/:id/critere`, table `feedbacks`, fichiers annotés | Routes sous le livrable ; feedback dans `corrections` ; pas de fichiers annotés | Garde par ressource ; une ligne immuable d'un bloc ; hors critères |
| DS-04 / ADR-04 | Bull, worker en processus séparé, table d'empreintes | **BullMQ** (successeur), worker dans l'API, empreinte dans `certificats` | Aucun nouveau service à déployer ; l'empreinte porte sur le PDF final |
| DS-05 | `GET /v/{uuid}`, verdict EXPIRE, table de vérifications | `/verifier/{id}` + `/api/verification/:id` ; pas d'expiration ; **audit** | Pas de date d'expiration dans le modèle ; l'audit suffit |
| DS-07 | Statut non actif → 400, pièces jointes | **409** ; pas de pièces jointes ; motif jamais public | Convention du projet ; confidentialité (fraude, discipline) |
| DS-06 P1–P2 | Routes sous la formation, 512 jetons / 50, `text-embedding-ada-002` | Routes sous le module ; **2 000 / 200 caractères** ; embeddings lexicaux locaux (384 dim.) derrière une interface | Modèle neuronal non vérifiable ici ; souveraineté ; changement par configuration |
| DS-06 pipeline | GPT-4o, JSON parsé à la main | **Claude (Anthropic)** derrière `FournisseurLlm`, JSON **imposé par appel d'outil** | Décision du porteur (qualité) ; schéma contraint + validation serveur |
| DS-06 P3 / état *SuggestionQuestionIA* | Ajout à une « banque de questions » | Ajout à un **QCM du même module** ; origine IA / IA_MODIFIEE ; décision garantie en base | Pas de banque séparée dans le modèle de données |
| Révision v1.5 (FORM-05/06) | — | Lien signé par **jeton Redis** (10 min) plutôt qu'URL pré-signée ; **413** pour la taille | MinIO n'est pas exposé ; l'accès est revérifié à chaque lien |

Les diagrammes de séquence concernés sont réalignés à la clôture (DS-02 v1.2, DS-03, DS-04, DS-05, DS-06,
DS-07 v1.1, DS-09 v1.2, DS-13 v1.1 — dossier `docs/projet/v3_2026-11-09/`), ainsi que le Backlog Produit
(v1.8).

### Décisions de périmètre
- **Bloc B (IA) démarré** sur décision du porteur : API hébergée (Anthropic Claude) pour la précision, clé
  dans le `.env` local seulement.
- **US-FORM-05 et 06 ajoutées** (demande du 09/11), faites avant US-IA-03.
- **Mots de passe, rotation des secrets, comptes** : décision du porteur — traités en fin de projet.

---

## 7. Incidents et leçons

| Incident | Effet | Correction / leçon |
|---|---|---|
| **Pas d'accès GitHub** au début du sprint (US-QCM-10) | Repli sur l'ancien mode (fichiers écrits sur le poste, git lancé à la main) | Accès rétabli dès US-ATEL-01 ; tout le git est fait depuis l'espace de travail de l'agent |
| **Image MinIO introuvable en CI** (« pull access denied ») | US-ATEL-04 bloquée en CI | MinIO ne publie plus d'images : sonde temporaire en CI, image Bitnami archivée figée |
| **Tests de concurrence instables en CI** (suites en parallèle, verrou de table) | Rouge intermittent | Suites e2e **en série** (#46) ; verrou de **ligne** tenu par un bloqueur plutôt qu'un verrou de table |
| **Sonde de verrou aveugle** : texte de requête tronqué dans `pg_stat_activity` | Test qui n'attendait pas le bon moment | Détection par `pg_blocking_pids` (et la file d'attente du verrou de ligne) |
| **Mutant compilé par l'e2e** (mutations lancées pendant l'e2e complet) | Faux rouge | Règle : jamais de mutation pendant l'e2e |
| **Suites existantes cassées par un champ ajouté** (comparaisons exactes) | Rouge local | Mise à jour des attentes dans la même PR ; rechercher les comparaisons exactes avant d'étendre une vue |
| **Certificats générés par d'anciennes suites** (apprenants devenus éligibles) | Nettoyage bloqué (clé étrangère) | Utilitaire commun qui attend la génération puis retire certificats et PDF |
| **Prettier sur des fichiers de configuration** | Lignes étrangères reformatées | Prettier seulement sur les fichiers modifiés, puis `git diff` ; jamais sur `apps/web`, `src/config`, `src/main.ts` |
| **Noms de fichiers accentués** mal décodés par multer | « RÃ©sumÃ© » au lieu de « Résumé » | Décodage UTF-8 commun aux livrables, supports et ressources (trouvé par l'e2e) |
| **Windows-1252 sous Node 20** (CI) différent de Node 22 (espace de travail) | Rouge en CI seulement | Table de conversion explicite ; vérification sous Node 20 avant de pousser |
| **Dépôt de modèles d'IA injoignable** dans l'espace de travail | Embeddings neuronaux non vérifiables | Fournisseur lexical local derrière une interface ; le neuronal reste branchable |
| **Mise en page mobile** (boutons décalés, actions tantôt à côté, tantôt sous le texte) | Écrans irréguliers à 390 px | Vu sur les captures, corrigé avant la PR |

---

## 8. Rétrospective

### Suivi des actions du Sprint 2
| # | Action | Résultat |
|---|---|---|
| 1 | Liste de contrôle de fusion, titre remplacé | ✅ 0 titre par défaut sur `main` ; fusions épinglées sur le commit vérifié |
| 2 | Front dans la CI, `WATCHPACK_POLLING`, délai e2e 30 s | ✅ #58, #42, #59 |
| 3 | Re-planifier avec l'encadrant | ⚠ Non fait (le sprint est clôturé dans les temps, mais la date de fin du projet reste à revoir) |
| 4 | Rotation des secrets avant partage | ⏸ Reportée en fin de projet (décision du porteur) |

### Ce qui a bien marché (à garder)
- **Une procédure écrite, appliquée à chaque story** (passation) : rien n'est fusionné sans CI verte sur le
  commit exact, et chaque fusion attend la CI verte sur `main` avant la story suivante.
- **Documents d'abord** : un tableau D par story, tous les écarts tracés avant de coder.
- **La preuve plutôt que la confiance** : concurrence forcée, mutations, garanties en base.
- **Interfaces + fournisseurs factices** : la CI teste l'IA et le stockage sans réseau ni coût.
- **Vérification dans un vrai navigateur**, desktop et mobile, captures relues.

### Ce qui n'a pas marché (à arrêter)
- Supposer qu'une image Docker existe encore (MinIO) sans le prouver en CI.
- Comparer des réponses à l'identique dans les tests quand la vue peut s'enrichir.
- Lancer deux vérifications qui compilent les mêmes sources en même temps (mutations + e2e).
- Laisser des stories reportées sans décision : l'extension du Sprint 2 (FORM-04, FORM-02, INSC-02/03,
  QCM-02) a encore glissé.

### Ce qu'on essaie au Sprint 4
| # | Action | Mesure de réussite |
|---|---|---|
| 1 | **Parcours complet sur le poste** (Docker) avant la revue : le porteur clique tout le Sprint 3 (script §5) | 0 anomalie bloquante ; anomalies mineures en PR `chore` |
| 2 | **Essai réel du modèle de langage** avec la clé (test facultatif `llm-anthropic`) | Questions conformes générées depuis un vrai cours |
| 3 | **Re-planifier avec l'encadrant** : date de fin, priorités E8 (analytics) et stories reportées | Date de fin et périmètre de soutenance validés |
| 4 | **Trier les reportées** : faire ou retirer (Won't) FORM-04, FORM-02, INSC-02/03, QCM-02, ATEL-05 | Plus aucune story reportée deux fois sans décision |

---

## 9. Risques et dette assumée

- **Calendrier.** Le Backlog prévoit la fin au **24/10/2026** : date dépassée. Restent E8 (suivi, tableaux
  de bord, exports), des stories *Should* reportées et le durcissement (Sprint 10). **À traiter avec
  l'encadrant** : nouvelle date, périmètre de soutenance.
- **Secrets sur la branche `docs`** (`.env`, `secrets/jwt_*.pem`, clé TLS du commit `9cd3913`). Décision :
  fin de projet. **Recommandation : rotation avant tout partage du dépôt** (encadrant, jury).
- **Image MinIO archivée** (`bitnamilegacy/minio:2025.4.22`) : plus de mises à jour de sécurité ; piste :
  construire l'image depuis les sources de MinIO.
- **Modèle de langage externe** : coût et dépendance à un fournisseur hors Tunisie (souveraineté NF4) ;
  atténué par l'interface (changement par configuration), les plafonds (20 questions, une génération en
  cours, plafond horaire, taille du prompt, délai) et la relecture humaine ; à discuter avec l'encadrant
  (modèle local possible derrière la même interface).
- **Embeddings lexicaux** : moins fins qu'un modèle neuronal pour retrouver les passages ; le neuronal
  reste branchable (US-IA-06).
- **Pas d'antivirus** sur les fichiers déposés (livrables, ressources) : jamais exécutés côté serveur ni
  affichés s'ils ne sont pas sûrs ; ClamAV à arbitrer.
- **Ateliers absents du taux d'avancement** de « Mon espace » (QCM seulement) ; l'éligibilité, elle, les
  compte.
- **Paramètres enregistrés sans effet** : surveillance webcam (US-QCM-12) et copier-coller — toujours
  affichés « Bientôt actif ».
- **Vérifications faites hors du poste du porteur** : l'agent a tout vérifié dans son espace (PostgreSQL,
  Redis, S3 local, Chromium) et la CI a vérifié MinIO et les images ; la lecture réelle des vidéos YouTube /
  Vimeo et l'appel réel au modèle de langage restent à voir sur le poste (§8, actions 1 et 2).

---

## 10. Métriques de livraison (vue synthétique)

```
Engagement ferme (bloc A)           ████████████████████  14/14  (54 pts)
Extension (bloc B, IA)              ████████████████████   4/4   (24 pts)
Ajout en cours de sprint            ████████████████████   2/2   ( 8 pts)
Vélocité                            86 pts  (Sprint 2 : 48 ; Sprint 1 : 69)
Tests automatisés                   1 720 verts  (1 128 unitaires + 592 e2e ; 741 au Sprint 2)
Pull Requests                       #40 → #65  (26, CI verte sur la PR et sur main avant de continuer)
Durée réelle                        2 jours  (avec un agent de développement)
```

---

## 11. Et après (Sprint 4)

**À décider d'abord avec l'encadrant (§8, action 3) :** date de fin, périmètre de soutenance.

**Candidats, par valeur pour la soutenance :**
- **E8 — Suivi et tableaux de bord** (alertes de décrochage, tableaux de bord formateur et administrateur,
  exports PDF / CSV, consultation de l'audit) : dernière épopée P1 non commencée.
- **Stories reportées** (trier, §8 action 4) : US-FORM-04 contenu pédagogique géré par le formateur (3) ·
  US-FORM-02 clôturer / archiver (2) · US-INSC-02 gérer les inscriptions (3) · US-INSC-03 se désinscrire (2)
  · US-QCM-02 importer depuis une banque (3) · US-QCM-11 historique des tentatives (3) · US-ATEL-05
  remplacer son livrable (2).
- **Compléments IA** : US-IA-05 traçabilité de l'origine (amorcée), US-IA-06 abstraction LLM (amorcée,
  modèle local possible), US-IA-07 suivi en temps réel (SSE).
- **Compléments certification** : US-CERT-02 (reste : alerte), US-CERT-07 expiration, US-CERT-08
  réémission.
- **Durcissement** (Sprint 10 du Gantt) : rotation des secrets, antivirus, image MinIO, OWASP, charge.

---

## 12. Glossaire (termes nouveaux du Sprint 3)

- **Session (de connexion)** — la suite de jetons née d'une connexion ; elle se termine à la déconnexion.
- **Atelier** — une évaluation pratique : un énoncé, une date limite, des fichiers à rendre.
- **Grille de notation** — la liste des critères d'un atelier, chacun pondéré en % et décrit par quatre
  niveaux (Insuffisant, Acceptable, Bon, Excellent) avec leurs plages de points.
- **Modèle de grille** — une copie de grille réutilisable dans un autre atelier.
- **Livrable** — ce que l'apprenant rend pour un atelier (fichiers, commentaire, liens).
- **Tolérance de retard** — un délai après la date limite pendant lequel un dépôt est accepté, marqué
  « en retard ».
- **Stockage objet (MinIO)** — un entrepôt de fichiers séparé de la base de données ; compatible S3.
- **Empreinte SHA-256** — une suite de 64 caractères calculée à partir d'un fichier ; changer un seul octet
  du fichier change toute l'empreinte. Elle prouve qu'un fichier n'a pas été modifié.
- **Déclencheur (trigger)** — une règle posée dans la base de données, qui refuse certaines modifications
  quel que soit le programme qui les tente.
- **File de travaux (BullMQ)** — une liste de tâches à faire en arrière-plan, gardée dans Redis ; un
  *worker* les prend une à une et les rejoue en cas d'échec.
- **Idempotent** — une opération qu'on peut refaire sans effet supplémentaire (demander deux fois le même
  certificat n'en crée qu'un).
- **QR code** — un carré imprimé qui contient un lien ; ici, celui de la page de vérification.
- **Vérification publique** — la page, sans compte, qui dit si un certificat est valide, révoqué ou
  falsifié.
- **Limitation de débit (rate limiting)** — un plafond de requêtes par minute et par adresse, contre les
  abus ; au-delà : HTTP 429.
- **Révocation** — l'annulation définitive d'un certificat, sans effacer sa trace.
- **Support pédagogique** — un document de cours déposé pour l'IA.
- **Indexation** — préparer un support : en extraire le texte, le découper en passages, calculer la
  signature de chaque passage.
- **Embedding (signature numérique)** — une liste de nombres qui résume un texte ; deux textes proches ont
  des signatures proches.
- **pgvector** — l'extension de PostgreSQL qui range les embeddings et trouve les plus proches.
- **RAG (génération augmentée par la recherche)** — d'abord **retrouver** les passages utiles du cours,
  puis **demander** au modèle de langage de s'appuyer uniquement sur eux.
- **Modèle de langage (LLM)** — le programme d'IA qui rédige les questions ; ici Claude, d'Anthropic.
- **Injection d'instructions** — une consigne cachée dans un document pour détourner l'IA ; ici, le cours
  est toujours traité comme une donnée.
- **Humain dans la boucle** — aucune production de l'IA n'entre dans un QCM sans décision du formateur.
- **Lien signé / temporaire** — une adresse qui ne fonctionne que quelques minutes, délivrée à une
  personne autorisée.
- **Agent de développement** — un assistant d'IA qui écrit le code, les tests et les PR en suivant une
  procédure fixée par le porteur du projet, sous sa supervision.
- **Fusion épinglée** — fusionner une PR en désignant le commit exact dont la CI est verte.

---

*Revue de Sprint et rétrospective · Cert_EET — Sprint 3 · Iyed Omri, PFE ESPRIT · ESPRIT Entreprise.*
