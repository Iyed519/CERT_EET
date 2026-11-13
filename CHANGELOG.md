# CHANGELOG — Cert_EET

> Journal des changements du dépôt, du plus récent au plus ancien.
> Projet : **Cert_EET** (Certification ESPRIT Entreprise) — PFE ESPRIT 2026 · Iyed Omri.
>
> **Comment lire ce fichier.** Chaque entrée correspond à une **story** (une fonctionnalité) livrée via
> une **Pull Request** (PR). Pour chaque story : **Quoi** (ce qui a été fait), **Pourquoi** (le besoin),
> et le **numéro de PR**. Les termes techniques (CI, CD, JWT, RBAC, MFA…) sont expliqués dans le
> **glossaire en fin de fichier**.
>
> **Conventions du dépôt.** 1 story = 1 branche = 1 PR = squash-merge, avec **CI verte obligatoire** avant
> intégration. Un journal technique détaillé par story est disponible dans `engineering-log/`.

---

## [Après le Sprint 6] — Stories hors sprint

#### US-UI-06 — Parcours administrateur refondu — journal `engineering-log/100`
- **Quoi :** chaque écran d'administration a une phrase d'usage sans code interne, au plus une
  action pleine (« Nouvelle formation »), un fil d'Ariane jusqu'à la page courante (inscriptions
  d'une formation comprises) et des états vides utiles ; les fenêtres « changer le rôle »,
  « désactiver », « anonymiser », « rejeter une demande », « révoquer » et la fiche d'un certificat
  ont une croix et se ferment par Échap ou un clic à l'extérieur ; la liste des comptes devient
  des cartes lisibles sur mobile.
- **Pourquoi :** que l'administrateur gère comptes, formations et certificats sans chercher.

#### US-UI-05 — Parcours formateur refondu — journal `engineering-log/99`
- **Quoi :** chaque écran formateur a une phrase d'usage, un fil d'Ariane jusqu'à la page
  courante et des états vides utiles ; l'éditeur de QCM n'a plus qu'une action pleine, l'étape
  suivante (ajouter, configurer, publier) ; toutes les anciennes fenêtres de formulaire (question,
  configuration, banque, atelier, grille, génération…) réagissent comme la fenêtre unique (Échap,
  clic à l'extérieur, focus gardé puis rendu), y compris empilées.
- **Pourquoi :** que le formateur prépare, corrige et suive sans chercher.

#### US-UI-04 — Parcours apprenant refondu — journal `engineering-log/98`
- **Quoi :** chaque écran apprenant (catalogue, fiche, mes formations, page d'une formation,
  atelier, tentative, mes évaluations, mes certificats) a un titre, une phrase qui dit à quoi il
  sert, au plus une action pleine, un fil d'Ariane jusqu'à la page courante et des états vides qui
  disent quoi faire ; les mots suivent le menu ; un QCM réussi ne propose plus « Nouvelle
  tentative » en rouge ; une tentative notée n'affiche plus de chronomètre ; fenêtres de démarrage,
  d'inscription et de désinscription accessibles au clavier.
- **Pourquoi :** que l'apprenant accomplisse chaque tâche sans aide.

#### US-UI-03 — Coque : navigation simple par rôle, accueil « À faire maintenant » — journal `engineering-log/97`
- **Quoi :** chaque rôle arrive sur une page qui commence par « À faire maintenant » (apprenant :
  nouvelle page « Mon espace » — QCM à passer ou à reprendre, livrables à rendre, retours à lire ;
  formateur : livrables et tentatives à corriger, alertes ; administrateur : demandes en attente,
  alertes système), chaque élément menant en un clic à l'écran utile ; menus de 5 entrées,
  « Accueil » en tête ; fil d'Ariane ; l'administration n'empile plus deux barres de navigation.
- **Pourquoi :** en ouvrant l'application, savoir exactement quoi faire et où cliquer.

#### US-UI-02 — Charte graphique ESPRIT — journal `engineering-log/96`
- **Quoi :** couleurs d'ESPRIT (rouge de marque, noir, gris, blanc) avec contrastes calculés ;
  logo ESPRIT dans l'en-tête et le pied de page ; le rouge est réservé à la marque et à l'action
  principale, la réussite reste verte, l'erreur est un rouge plus sombre avec une icône ; boutons
  définis une seule fois (fin des redéfinitions qui se contredisaient), messages, focus et état vide
  communs ; PDF du certificat et du rapport QCM aux couleurs ESPRIT, contenu inchangé.
- **Pourquoi :** reconnaître immédiatement l'établissement et lire chaque écran sans effort.

#### US-UI-01 — Listes compactes et fiche détaillée en fenêtre — journal `engineering-log/95`
- **Quoi :** la prédiction du risque affiche une ligne par apprenant (nom, niveau, facteur
  principal, alertes ouvertes), du risque le plus élevé au plus faible ; le détail s'ouvre dans une
  fenêtre. « Mes certificats » suit le même modèle. Une seule fenêtre modale accessible
  (`Fenetre` : Échap, clic à l'extérieur, focus gardé puis rendu, plein écran sur mobile) remplace
  les fenêtres recopiées (confirmation, détails de tentative, import).
- **Pourquoi :** voir toute la classe d'un coup d'œil au lieu de faire défiler de longues cartes.

#### US-IA-08 — Importer des questions depuis un fichier (extraction par l'IA) — journal `engineering-log/94`
- **Quoi :** dans l'éditeur de QCM, « Importer depuis un fichier » : le formateur dépose un ancien
  examen, une banque Excel ou CSV, un sujet Word, un PDF (même scanné) ou la photo d'une feuille ;
  l'IA recopie les questions en tâche de fond (sans en inventer ; « bonne réponse à choisir » si le
  document ne la donne pas), puis il relit chaque question : accepter telle quelle ou retouchée,
  rejeter, ou tout accepter pour les questions complètes. Fichier contrôlé sur son contenu (400 sans
  appel à l'IA), supprimé du stockage dès la fin, gardé en cas d'échec pour la relance ; tout est
  journalisé.
- **Pourquoi :** ne plus ressaisir à la main des questions qui existent déjà dans des documents,
  tout en gardant le contrôle humain sur ce qui entre dans un QCM certifiant.

#### US-QCM-13 — Rapport PDF détaillé du résultat d'un QCM — journal `engineering-log/93`
- **Quoi :** bouton « Télécharger le rapport (PDF) » sur la page de résultat, dans « Mes évaluations »
  et dans le suivi des tentatives du formateur. Le PDF reprend l'en-tête de la tentative, la synthèse
  (score sur 100, seuil, verdict, justes / fausses / sans réponse, points), « Vos points à revoir »
  (questions ratées, réussite par niveau de difficulté) et le détail par question dans l'ordre du tirage. Bonnes réponses et explications seulement si le corrigé est disponible
  (même règle que la page du corrigé) ; toujours pour le formateur affecté et l'administrateur.
  Généré à la demande, jamais stocké, journalisé (`RAPPORT_QCM_TELECHARGE`).
- **Pourquoi :** garder une trace de son résultat et comprendre ses erreurs ; appuyer un entretien
  ou un bilan pédagogique côté formateur, sans jamais révéler le corrigé trop tôt.

---

## [Sprint 6] — Prêt pour la démonstration : session stable, navigation par rôle, formateur outillé — ✅ CLÔTURÉ

**Résumé :** 6 stories livrées (26 pts), le 11/11/2026 (PR #97 → #102). **2 310 tests automatisés verts**
(1 464 unitaires + 846 e2e) et 79 mutants tués. La session survit au rafraîchissement, chaque rôle arrive
sur sa page, le formateur a son tableau de bord et peut demander ou proposer une formation ; un audit
rejouable vérifie toute la navigation, et un jeu de démonstration se charge en une commande.
Backlog et revue : `docs/Sprint6_Backlog.md`, `docs/Sprint6_Review.md` ; guide : `docs/GUIDE_DEMO.md`.

#### US-AUTH-17 — Garder la session après un rafraîchissement — PR #97 · journal `engineering-log/83`
- **Quoi :** restauration unique de la session au chargement, aucune page rendue avant, rotation du
  refresh token rendue atomique, zone nginx dédiée. **Pourquoi :** F5 déconnectait l'utilisateur.

#### US-NAV-01 — Redirection par rôle après connexion — PR #98 · journal `engineering-log/84`
- **Quoi :** page de rôle après toute connexion, pas d'écran de connexion pour un connecté, retour sur
  la page demandée (chemins internes seulement), pages d'autres rôles redirigées. **Pourquoi :** arriver
  directement au travail, sans page intermédiaire.

#### US-DASH-03 — Tableau de bord du formateur — PR #99 · journal `engineering-log/85`
- **Quoi :** indicateurs sur toutes ses formations, période, graphique, tableau par formation ; demandes
  en attente sur le tableau de bord administrateur. **Pourquoi :** savoir où intervenir en premier.

#### US-FORM-07 — Demande d'affectation — PR #100 · journal `engineering-log/86`
- **Quoi :** le formateur demande une formation existante ; l'administrateur accepte (affectation dans la
  même transaction) ou refuse avec motif ; emails, audit. **Pourquoi :** exprimer un souhait d'enseigner.

#### US-FORM-08 — Proposition de formation — PR #101 · journal `engineering-log/87`
- **Quoi :** propositions (5 en cours au plus), modifications demandées puis resoumission, acceptation en
  formation BROUILLON avec le proposant affecté, publication. **Pourquoi :** enrichir l'offre à partir du
  terrain.

#### US-QUAL-01 — Audit de navigation — PR #102 · journal `engineering-log/88`
- **Quoi :** outil Playwright rejouable (`outils/recette`), page « introuvable » en français, icône,
  tests rendus déterministes, jeu de démonstration idempotent, guide de démonstration. **Pourquoi :**
  aucune page cassée devant l'encadrant.

---

## [Sprint 5] — Comptes et sécurité soldés : mots de passe, durcissement, import, RGPD, surveillance — ✅ CLÔTURÉ

**Résumé :** 6 stories livrées (23 pts), le 11/11/2026 (PR #90 → #95), avec un agent de développement qui
suit la procédure fixée par le porteur. **2 254 tests automatisés verts** (1 446 unitaires + 808 e2e) et
89 mutants tués. Un utilisateur gère seul son mot de passe ; la plateforme chiffre ses échanges et résiste
aux abus courants ; l'administrateur importe une promotion et anonymise un compte sans perdre les
certificats ; le formateur peut faire surveiller un QCM par webcam, avec le consentement de l'apprenant.
Backlog et revue : `docs/Sprint5_Backlog.md`, `docs/Sprint5_Review.md`.

### Authentification & sécurité (E1)

#### US-AUTH-08 — Changer son mot de passe — PR #90 · journal `engineering-log/77`
- **Quoi :** changement avec le mot de passe actuel, politique commune, révocation de toutes les sessions
  (base et Redis), audit, email. **Pourquoi :** couper immédiatement un accès volé.

#### US-AUTH-06 — Mot de passe oublié — PR #91 · journal `engineering-log/78`
- **Quoi :** lien à usage unique de 30 min (empreinte seule en base), réponse identique pour toute adresse,
  limites par IP et par adresse, sessions révoquées, audit. **Pourquoi :** récupérer son compte en
  autonomie sans révéler l'existence des comptes.

#### US-AUTH-13 — TLS et durcissement — PR #92 · journal `engineering-log/79`
- **Quoi :** TLS 1.2 / 1.3 et HSTS au reverse proxy (chemins de certificat de remplacement), en-têtes de
  sécurité et CSP (API et web), tailles de corps, CORS strict, limites de débit réglables sur les routes
  sensibles. **Pourquoi :** protéger les échanges et résister aux abus (NF3, NF2).

### Comptes (E2)

#### US-CPT-02 — Import CSV de comptes — PR #93 · journal `engineering-log/80`
- **Quoi :** validation complète avant création, tout ou rien, rapport ligne par ligne, comptes en attente
  d'activation, emails d'activation asynchrones (48 h, renvoi possible). **Pourquoi :** enrôler une
  promotion en une opération.

#### US-CPT-04 — Anonymisation RGPD — PR #94 · journal `engineering-log/81`
- **Quoi :** effacement irréversible de l'identité après double confirmation, sessions révoquées,
  certificats toujours vérifiables sans identité, dernier administrateur protégé. **Pourquoi :** droit à
  l'oubli (NF4) sans perdre les preuves de certification.

### QCM anti-fraude (E3)

#### US-QCM-12 — Surveillance webcam par captures — PR #95 · journal `engineering-log/82`
- **Quoi :** opt-in par QCM, consentement avant de commencer, une image toutes les 2 min, accès réservé
  au formateur affecté et à l'administration, liens signés, purge à 30 jours, interrupteur de plateforme.
  **Pourquoi :** dissuader la substitution d'identité sans vidéosurveillance ni analyse automatique.

---

## [Sprint 3] — Parcours certifiant complet : ateliers, certificat vérifiable, assistance IA — ✅ CLÔTURÉ

**Résumé :** 20 stories livrées (14 engagées, 54 pts ; 4 d'extension, 24 pts ; 2 ajoutées, 8 pts) et 5 PR de
maintenance, du 08/11 au 09/11/2026 (PR #40 → #65), avec un agent de développement qui suit la procédure
fixée par le porteur. **1 720 tests automatisés verts** (1 128 unitaires + 592 e2e). L'apprenant rend des
ateliers corrigés par critères, reçoit un **certificat PDF avec QR code** fabriqué seul et vérifiable par
n'importe qui ; le formateur fait **proposer des questions par l'IA** à partir de son cours et les valide.
Revue de sprint et rétrospective : `docs/Sprint3_Review.md`.

### QCM anti-fraude (E3)

#### US-QCM-10 — Bloquer les sessions multiples — PR #40 · journal `engineering-log/35`
- **Quoi :** une tentative ne sert que depuis la connexion qui l'a démarrée ; ailleurs, 409 tracé ; verrou
  levé à la déconnexion ou à l'échéance. **Pourquoi :** empêcher deux personnes de passer le même examen
  sur un compte partagé.

### Ateliers pratiques & correction (E4)

#### US-ATEL-01 — Créer un atelier — PR #41, #43 · journal `engineering-log/36`
- **Quoi :** atelier en brouillon sous un module (énoncé, date limite, types de fichiers dont le code
  source, taille, tolérance de retard). **Pourquoi :** proposer une évaluation pratique (F2).

#### US-ATEL-02 — Grille de notation pondérée — PR #44 · journal `engineering-log/37`
- **Quoi :** critères pondérés en %, quatre niveaux à plages de points, validation à 100 %, modèles
  réutilisables. **Pourquoi :** une note objective et reproductible.

#### US-ATEL-03 — Publier l'atelier — PR #45 · journal `engineering-log/38`
- **Quoi :** publication sous verrou, atelier et grille figés, fiche apprenant avec la grille.
  **Pourquoi :** les règles connues avant de rendre et inchangeables ensuite.

#### US-ATEL-04 — Soumettre un livrable — PR #47 · journal `engineering-log/39`
- **Quoi :** dépôt contrôlé (contenu réel, taille, délai jugé par la base), SHA-256, stockage MinIO, email
  aux formateurs. **Pourquoi :** une preuve d'antériorité du travail rendu.

#### US-ATEL-06 — Corriger critère par critère — PR #49 · journal `engineering-log/40`
- **Quoi :** ouverture qui verrouille le livrable, niveau + points + commentaire par critère, score en
  direct, téléchargement des fichiers tracé. **Pourquoi :** une note pondérée fiable.

#### US-ATEL-07 — Feedback immuable et notification — PR #50 · journal `engineering-log/41`
- **Quoi :** finalisation (tout noté, commentaire général), note figée par l'API et par la base, email.
  **Pourquoi :** une correction envoyée ne se retouche plus.

#### US-ATEL-08 — Consulter son feedback — PR #51 · journal `engineering-log/42`
- **Quoi :** détail par critère pour l'apprenant, badge « Nouveau feedback », aucune note partielle.
  **Pourquoi :** comprendre sa note et progresser.

#### US-ATEL-09 — Déclencher la certification — PR #53 · journal `engineering-log/44`
- **Quoi :** éligibilité évaluée après chaque note, demande d'émission une seule fois ; état visible dans
  « Mon espace ». **Pourquoi :** automatiser la certification.

### Certification vérifiable (E5)

#### US-CERT-01 — Émission asynchrone des certificats — PR #52 · journal `engineering-log/43`
- **Quoi :** file BullMQ sur Redis, worker : PDF (PDFKit) + QR + SHA-256, MinIO, certificat ACTIF
  immuable, reprises et relance administrateur. **Pourquoi :** ne jamais faire attendre une requête et ne
  jamais produire deux certificats.

#### US-CERT-03 — Consulter et télécharger son certificat — PR #54 · journal `engineering-log/45`
- **Quoi :** « Mes certificats », PDF réservé au titulaire, empreinte, lien public. **Pourquoi :** la preuve
  de réussite entre les mains de l'apprenant.

#### US-CERT-04 — Vérification publique sans compte — PR #55 · journal `engineering-log/46`
- **Quoi :** page `/verifier/{id}` : valide, révoqué ou intégrité compromise (empreinte recalculée) ;
  comparaison d'un PDF dans le navigateur. **Pourquoi :** un certificat vérifiable par un recruteur
  (lacune G3 du benchmark).

#### US-CERT-05 — Protection et minimisation de la page publique — PR #56 · journal `engineering-log/47`
- **Quoi :** 20 requêtes / min / IP (429), IP réelle derrière nginx, réponses jamais mises en cache ni
  indexées, données minimales. **Pourquoi :** RGPD et résistance aux abus.

#### US-CERT-06 — Révoquer un certificat — PR #57 · journal `engineering-log/48`
- **Quoi :** révocation à double confirmation (case + mot de passe), irréversible en base, email au
  titulaire, page publique « Révoqué » sans motif. **Pourquoi :** corriger une erreur ou une fraude sans
  effacer la trace.

### Ressources du cours (E2 — révision v1.5)

#### US-FORM-05 — Ressources de module : liens et vidéos — PR #62 · journal `engineering-log/51`
- **Quoi :** liens et vidéos YouTube / Vimeo par module, lecteur intégré sans cookie de suivi.
  **Pourquoi :** le cours vit dans la plateforme, pas dans des outils dispersés.

#### US-FORM-06 — Ressources de module : fichiers — PR #63 · journal `engineering-log/52`
- **Quoi :** fichiers de tout type, lus par un lien signé de 10 minutes (vidéo, audio, image dans la page ;
  PDF dans un onglet ; le reste téléchargé). **Pourquoi :** partager les supports sans adresse permanente.

### Assistance IA aux formateurs (E6)

#### US-IA-01 — Déposer et indexer un support — PR #60 · journal `engineering-log/49`
- **Quoi :** dépôt (PDF, PPTX, DOCX, TXT, MD), indexation en arrière-plan : texte, passages, embeddings dans
  pgvector ; email. **Pourquoi :** une source fiable pour l'IA.

#### US-IA-02 — Lancer une génération paramétrée — PR #61 · journal `engineering-log/50`
- **Quoi :** nombre, types, niveau, thème ; réponse 202 ; une génération en cours par formateur, plafond
  horaire. **Pourquoi :** des suggestions adaptées au module, à coût maîtrisé.

#### US-IA-03 — Pipeline RAG de génération de questions — PR #64 · journal `engineering-log/53`
- **Quoi :** 8 passages les plus proches du support ciblé, modèle Claude (Anthropic) derrière une
  interface, JSON imposé, validation serveur, suggestions PROPOSEE ; échec avec motif ; email.
  **Pourquoi :** des questions ancrées dans le vrai cours.

#### US-IA-04 — Révision humaine des suggestions — PR #65 · journal `engineering-log/54`
- **Quoi :** accepter, modifier puis accepter, ou rejeter ; question ajoutée à un QCM du module avec son
  origine (« IA » / « IA modifiée ») ; décision unique garantie en base. **Pourquoi :** rien n'entre dans un
  QCM sans validation humaine.

### Maintenance
- **#42** rechargement à chaud sous Docker Windows · **#46** CI e2e déterministe (suites en série) ·
  **#48** délai de grâce de la sonde de l'api · **#58** job frontend en CI (`tsc` + `next lint`) ·
  **#59** délai e2e par défaut à 30 s.

### Décisions de périmètre (Sprint 3)
- **Bloc B (IA) démarré** : API hébergée Anthropic Claude derrière `FournisseurLlm` (fournisseur factice en
  CI), clé dans le `.env` local uniquement.
- **US-FORM-05 et 06 ajoutées** en cours de sprint (demande du 09/11).
- **Écarts assumés avec DS-02, 03, 04, 05, 06, 07, 09, 13** : tableau dans `docs/Sprint3_Review.md` §6 ;
  diagrammes réalignés dans `docs/projet/v3_2026-11-09/`.
- **Reporté :** US-FORM-04, US-FORM-02, US-INSC-02, US-INSC-03, US-QCM-02, US-QCM-11, US-ATEL-05 (à trier au
  Sprint 4).

---

## [Sprint 2] — Formations, inscriptions & moteur de QCM anti-fraude — ✅ CLÔTURÉ

**Résumé :** 13 stories livrées (12 engagées, 46 pts + 1 d'extension, 2 pts) et le modèle de données,
du 05/10 au 07/11/2026 (PR #23 → #38). **741 tests automatisés verts** (468 unitaires + 273 e2e). Un
administrateur organise une formation, un apprenant s'y inscrit et passe un **QCM certifiant** dont
toutes les règles — tirage, temps, notation, corrigé — sont décidées par le serveur. Revue de sprint et
rétrospective : `docs/Sprint2_Review.md`.

### Socle

#### Enabler — Modèle de données du Sprint 2 — PR #23 · journal `engineering-log/21`
- **Quoi :** 12 tables du cœur métier (formations, modules, inscriptions, affectations, QCM,
  configuration anti-fraude, questions, options, tentatives, réponses) en deux migrations réversibles.
  **Pourquoi :** aucune story ne se code sans elles ; le schéma porte lui-même une partie des garanties
  (unicités, clés étrangères, bonne réponse jamais chargée par défaut).

### Formations & autorisation (E2 / E1)

#### US-FORM-01 — Créer et configurer une formation — PR #24 · journal `engineering-log/22`
- **Quoi :** l'administrateur crée, modifie une formation (objectifs, capacité, seuil, modèle de
  certificat) et gère ses modules ; chaque écriture est auditée. **Pourquoi :** la racine du métier.

#### US-FORM-03 — Affecter un formateur à une formation — PR #25 · journal `engineering-log/23`
- **Quoi :** affectation et retrait de formateurs, email au formateur, audit. **Pourquoi :** c'est la
  donnée que lit l'autorisation par ressource.

#### US-AUTH-16 — Autorisation par ressource — PR #26 · journal `engineering-log/24`
- **Quoi :** garde réutilisable `@FormateurDeLaFormation` : un formateur n'agit que sur ses formations
  affectées, sinon **403** + audit `ACCES_RESSOURCE_REFUSE` ; écran « Mes formations ». **Pourquoi :** le
  rôle seul ne dit pas *sur quelle* formation un formateur peut agir (ADR-11).

### Inscriptions (E2)

#### US-INSC-01 — S'inscrire à une formation — PR #29 · journal `engineering-log/25`
- **Quoi :** inscription immédiate à une formation ouverte ; capacité jamais dépassée (transaction +
  verrou), email de bienvenue, audit ; catalogue, fiche, « Mes inscriptions ». **Pourquoi :** sans
  inscription, pas d'accès aux évaluations. *(Une première fusion, #27, a été annulée par erreur via le
  bouton « Revert » (#28), puis rétablie par #29.)*

#### US-INSC-04 — Accéder aux modules et choisir une évaluation — PR #30 · journal `engineering-log/26`
- **Quoi :** « Mon espace » : progression, échéance, modules dans l'ordre, QCM publiés avec mon
  avancement ; 403 audité si non inscrit ou suspendu. **Pourquoi :** porte d'entrée du passage d'un QCM.

### Moteur de QCM anti-fraude (E3)

#### US-QCM-01 — Créer le contenu d'un QCM — PR #31 · journal `engineering-log/27`
- **Quoi :** questions à choix unique, multiple ou vrai / faux, options, pondérations, explications,
  validées par le serveur ; contenu figé dès la première tentative (sauf explications). **Pourquoi :** la
  matière de l'évaluation, stable une fois l'examen commencé.

#### US-QCM-03 — Paramètres anti-fraude d'un QCM — PR #32 · journal `engineering-log/28`
- **Quoi :** randomisation, tirage K parmi N, durée, fenêtre, tentatives, délai, mode d'affichage du
  résultat, seuil ; cohérence vérifiée, règles figées à la première tentative (seule la fermeture peut
  être repoussée). **Pourquoi :** transformer un quiz en évaluation certifiante. *(Webcam et copier-coller :
  enregistrés, signalés « Bientôt actif », non appliqués — révision v1.6.)*

#### US-QCM-04 — Publier un QCM — PR #33 · journal `engineering-log/29`
- **Quoi :** publication après revérification complète sous verrou, audit `QCM_PUBLIE` ; le QCM apparaît
  dans « Mon espace » avec sa fenêtre. **Pourquoi :** séparer préparation et mise à disposition.

#### US-QCM-05 — Démarrer une tentative (contrôle serveur) — PR #34 · journal `engineering-log/30`
- **Quoi :** démarrage vérifié avec l'horloge de la base (publié, inscrit, dans la fenêtre, tentative
  restante, délai) ; refus **409** avec motif précis ; échéance jamais après la fermeture ; reprise d'une
  tentative en cours. **Pourquoi :** l'entrée de l'examen est le premier point de triche possible.

#### US-QCM-06 — Randomisation et confidentialité des réponses — PR #35 · journal `engineering-log/31`
- **Quoi :** tirage cryptographique des questions et des options, figé par tentative (`planTirage`) ;
  questions servies en liste blanche, sans bonne réponse, explication ni pondération (test de non-fuite
  sur le trafic réel). **Pourquoi :** ni le voisin ni l'inspecteur réseau ne donnent la réponse.

#### US-QCM-07 — Minuterie serveur et sauvegarde des réponses — PR #36 · journal `engineering-log/32`
- **Quoi :** réponses enregistrées au fil de l'eau et restaurées ; refus dès l'échéance fixée par
  PostgreSQL (clôture ABANDONNEE_TIMER, réponses conservées) ; soumission ; balayage des tentatives
  échues toutes les 60 s ; Redis en miroir. **Pourquoi :** le temps n'est pas contournable et une coupure
  ne fait rien perdre.

#### US-QCM-08 — Notation serveur et tentative figée — PR #37 · journal `engineering-log/33`
- **Quoi :** score pondéré (choix multiple en tout ou rien), réussite au seuil, correction écrite par
  réponse, état **NOTEE** protégé par un **trigger** (aucune modification possible, même en SQL),
  avancement de l'inscription recalculé, audit `TENTATIVE_NOTEE`. **Pourquoi :** un résultat fiable et
  immuable, base de la future certification.

#### US-QCM-09 — Voir son résultat (corrigé) — PR #38 · journal `engineering-log/34` *(extension)*
- **Quoi :** route `GET /tentatives/:id/correction` : par question, ma réponse, juste / faux, points,
  bonne réponse, explication ; disponible après la fermeture en mode différé, après la dernière tentative
  en mode immédiat, sinon 409 avec la date. **Pourquoi :** comprendre ses erreurs sans faire fuiter le
  corrigé vers une autre tentative ou un autre apprenant.

### Décisions de périmètre (Sprint 2)
- **Révision v1.4 (10/10)** — US-FORM-04 : le formateur affecté gère le contenu pédagogique de ses
  formations (extension, reportée au Sprint 3).
- **Révision v1.5 (11/10)** — ressources de module : US-FORM-05 liens (extension, reportée au Sprint 3),
  US-FORM-06 fichiers (Sprint 4, avec MinIO).
- **Révision v1.6 (12/10)** — US-QCM-12 surveillance webcam (Could, Sprint 5+, sous conditions :
  encadrant, protection des données).
- **Écarts assumés avec DS-02 / DS-09** (409 pour les refus liés au temps, routes REST, échéance décidée
  par PostgreSQL, état final NOTEE, audit `TENTATIVE_NOTEE`, avancement recalculé à la notation, corrigé
  sur une route dédiée et après la dernière tentative) : tableau dans `docs/Sprint2_Review.md` §6.
- **Reporté au Sprint 3 :** US-FORM-04, US-FORM-05, US-FORM-02, US-INSC-02, US-INSC-03, US-QCM-02
  (16 pts d'extension).

---

## [Sprint 1] — Fondations backend & infrastructure — ✅ CLÔTURÉ

**Résumé :** 15 stories livrées (9 engagées + 6 d'extension + bonus), 110 tests automatisés verts,
pipelines CI **et** CD opérationnels. Le socle technique de la plateforme est en place.

### Infrastructure (E0)

#### US-INFRA-06 — Pipeline CD (livraison continue vers GHCR) — PR mergée · journal `engineering-log/20`
- **Quoi :** un workflow qui, après une CI verte sur `main`, **construit et publie** les images Docker de
  production (API + web) sur **GHCR** (le magasin d'images de GitHub).
- **Pourquoi :** avoir en permanence une version installable prête à déployer, sans fabrication manuelle.
- **Détails :** déclenché via `workflow_run` (donc **seulement si la CI réussit**) + `workflow_dispatch`
  (manuel) ; images `cert_eet-api` et `cert_eet-web` taguées `latest` + SHA court ; authentification par
  `GITHUB_TOKEN` (aucun secret externe). `docker-compose.recette.yml` référence les images GHCR pour un
  `pull && up -d` direct. Déploiement sur serveur **manuel et documenté** (`docs/DEPLOIEMENT_RECETTE.md`)
  tant qu'il n'y a pas de VM de staging. **Validé : premier run CD vert en 4 min 07 s, 2 images publiées.**
- **Fichiers :** `.github/workflows/cd.yml` (nouveau), `docker-compose.recette.yml` (images GHCR),
  `docs/DEPLOIEMENT_RECETTE.md` (nouveau).

#### US-INFRA-08 — Documentation API (OpenAPI / Swagger) — PR #20 · journal `engineering-log/19`
- **Quoi :** finaliser la page interactive `/api/docs` qui documente toute l'API et permet de la tester.
- **Pourquoi :** mode d'emploi de l'API (démo, intégration frontend, contrat d'API — exigence de la DoD).
- **Détails :** `@ApiBearerAuth('access-token')` appliqué de façon **ciblée** → **17 routes protégées**
  affichent un cadenas, **11 routes publiques** n'en ont pas ; schéma bearer JWT nommé ;
  `persistAuthorization` (le jeton collé survit au rafraîchissement) ; `/api/docs-json` exposé ; 5 tags
  décrits ; réponses du endpoint `health` documentées. **Lint propre + 110 tests verts.**

#### US-INFRA-05 — Pipeline CI (intégration continue)
- **Quoi :** un robot GitHub Actions qui vérifie le code à chaque modification (style + 110 tests avec
  PostgreSQL et Redis réels + couverture). **Pourquoi :** détecter les erreurs immédiatement ; CI verte
  requise avant tout merge.

#### US-INFRA-04 — Schéma de base de données + migrations
- **Quoi :** structure de la base (User, AuditLog, RefreshToken, Formation…) + mécanisme de migrations +
  compte admin initial. **Pourquoi :** des données bien rangées et une évolution de schéma contrôlée.

#### US-INFRA-03 — Docker Compose multi-services
- **Quoi :** 5 conteneurs orchestrés (api, web, postgres, redis, nginx) + Dockerfiles multi-stage.
  **Pourquoi :** une appli qui tourne pareil partout (dev, test, production).

#### US-INFRA-07 — Gestion des secrets
- **Quoi :** clés RS256 injectées hors du code, `.env.example`, démarrage fail-fast si un secret manque.
  **Pourquoi :** ne jamais exposer d'information sensible dans le code.

#### US-INFRA-02 — Squelette NestJS + Next.js
- **Quoi :** initialisation du backend (NestJS) et du frontend (Next.js) + endpoint `/health`.
  **Pourquoi :** une structure de départ propre.

### Authentification (E1)

#### US-AUTH-09 + US-AUTH-02 — MFA (double authentification TOTP) — PR #19 · journal `engineering-log/18`
- **Quoi :** activation de la double authentification par QR code, puis connexion en deux temps (mot de
  passe **puis** code à 6 chiffres). **Pourquoi :** protéger les comptes même en cas de mot de passe volé.
- **Détails :** secret en attente stocké en Redis (TTL court, jamais en base tant que non confirmé) ;
  jeton MFA à usage unique (anti-rejeu) ; désactivation protégée par code TOTP.

#### US-AUTH-12 — Journal d'audit immuable — PR #17 · journal `engineering-log/16`
- **Quoi :** enregistrement inaltérable des actions sensibles (writer unique + trigger base de données qui
  empêche modification/suppression) + consultation et export CSV. **Pourquoi :** traçabilité fiable et
  crédible (exigence institutionnelle).

#### US-AUTH-14 — Connexion sociale Google & GitHub — PR #12, #13
- **Quoi :** connexion via un compte Google ou GitHub (OAuth2, Passport), liaison au compte par email.
  **Pourquoi :** réduire la friction d'inscription. L'émission de session reste faite maison (JWT RS256).

#### US-AUTH-11 — Contrôle d'accès par rôle (RBAC)
- **Quoi :** gardes globaux qui vérifient l'identité (jeton) puis le rôle (autorisé ?) ; routes publiques
  marquées `@Public` ; `GET /auth/me`. **Pourquoi :** chaque rôle (apprenant/formateur/admin) n'accède
  qu'à ce qui le concerne.

#### US-AUTH-03 — Rafraîchir la session avec rotation
- **Quoi :** renouvellement silencieux de la session avec **rotation** (ancien jeton brûlé) et
  **détection de rejeu** (révocation de toute la famille si un jeton volé est réutilisé).
  **Pourquoi :** rester connecté sans compromettre la sécurité (défense OWASP).

#### US-AUTH-04 — Se déconnecter
- **Quoi :** déconnexion qui **invalide réellement** les jetons (denylist Redis). **Pourquoi :** une vraie
  déconnexion, pas un simple oubli côté navigateur.

#### US-AUTH-01 — Se connecter
- **Quoi :** connexion email + mot de passe (bcrypt), émission de jetons JWT RS256 (access 15 min / refresh
  7 j). **Pourquoi :** la porte d'entrée de l'application.

### Comptes & inscription (E2 / Sprint 2 tiré en avance)

#### US-ROL-02 — Demande de changement de rôle (self-service) — PR #18 · journal `engineering-log/17`
- **Quoi :** un utilisateur demande un changement de rôle ; un admin approuve ou rejette. **Pourquoi :**
  gouvernance des rôles sans intervention manuelle systématique.

#### US-CPT-03 — Désactiver / réactiver un compte (anti-lockout) — PR #16 · journal `engineering-log/15`
- **Quoi :** suspension/réactivation d'un compte **avec motif**, avec garde empêchant de désactiver le
  dernier administrateur. **Pourquoi :** gouvernance des comptes sans risque de blocage total.

#### US-ROL-01 — L'admin change le rôle d'un utilisateur — PR #15
- **Quoi :** changement de rôle avec **invalidation immédiate** des sessions. **Pourquoi :** le nouveau
  rôle s'applique instantanément.

#### US-AUTH-15 — Profil apprenant — PR #14
- **Quoi :** complétion de profil à la première connexion + référentiel des établissements tunisiens.
  **Pourquoi :** données apprenant structurées pour la suite (formations, certificats).

#### US-CPT-05 — Auto-inscription publique + refonte UI auth — PR #10, #11
- **Quoi :** création de compte apprenant (email + mot de passe) avec vérification email + design system.
  **Pourquoi :** ouvrir la plateforme en self-service (modèle type Coursera/edX).

### Décisions de périmètre (Sprint 1)
- **D4 — Retrait de US-CPT-01 (admin crée un compte) et US-AUTH-05 (activation).** Remplacées par
  l'auto-inscription (US-CPT-05) + OAuth (US-AUTH-14). Tracé dans l'ADR.
- **ADR-08-R1 / ADR-11** — rotation des refresh tokens confirmée ; modèle d'inscription ouvert curaté +
  onboarding formateur par ressource (à détailler au Sprint 2).

---

## Glossaire

- **CI (Intégration Continue)** — robot qui vérifie le code à chaque modification (style + tests).
- **CD (Livraison Continue)** — robot qui, après la CI, fabrique et publie les versions installables.
- **Docker / image / conteneur** — Docker met l'appli dans une **boîte** standardisée ; l'**image** est la
  boîte scellée prête à lancer ; le **conteneur** est la boîte en train de tourner.
- **GHCR** — GitHub Container Registry, le magasin en ligne où sont publiées les images Docker.
- **JWT** — jeton signé prouvant l'identité ; **access token** (court) + **refresh token** (pour renouveler).
- **Rotation / détection de rejeu** — à chaque renouvellement, l'ancien jeton est invalidé ; un jeton volé
  réutilisé est détecté et toute la famille est révoquée.
- **RBAC** — contrôle d'accès basé sur les rôles (apprenant / formateur / administrateur).
- **MFA / TOTP** — double authentification ; code à 6 chiffres changeant toutes les 30 s.
- **OpenAPI / Swagger** — standard de description d'API + page web interactive générée (`/api/docs`).
- **Lint** — vérification automatique du style et des erreurs courantes du code.
- **Migration** — script qui fait évoluer la structure de la base de façon contrôlée.
- **PR (Pull Request)** — proposition de modification relue avant intégration.
- **squash-merge** — intégration qui condense les commits d'une branche en un seul, propre, sur `main`.
- **Story points** — estimation de complexité (échelle relative), pas des heures.
- **Autorisation par ressource** — au-delà du rôle, vérifier *sur quelle* ressource on agit (« sa »
  formation).
- **Tentative** — un passage de QCM : EN_COURS → SOUMISE ou ABANDONNEE_TIMER (temps écoulé) → NOTEE.
- **Tirage / randomisation** — choix et ordre des questions et options propres à une tentative, faits
  au hasard par le serveur puis figés.
- **Non-fuite / liste blanche** — aucune bonne réponse ne part vers le navigateur ; on liste ce qu'on
  envoie plutôt que de retirer ce qu'on cache.
- **Balayage** — tâche serveur qui, toutes les 60 s, clôt et note les tentatives échues.
- **Verrou / transaction** — empêche deux requêtes simultanées de modifier la même donnée (ex. : la
  dernière place d'une formation).
- **Trigger** — règle posée dans la base elle-même ; ici, elle refuse toute modification d'une tentative
  notée.
- **HTTP 403 / 409** — 403 : « tu n'as pas le droit » ; 409 : « pas maintenant » (hors fenêtre, temps
  écoulé, corrigé pas encore disponible).
- **Test e2e / test de mutation** — e2e : appelle la vraie API sur une vraie base ; mutation : on retire
  volontairement une protection pour vérifier que le test échoue.
- **MinIO / stockage objet** — entrepôt de fichiers séparé de la base (livrables, certificats, supports).
- **SHA-256 / empreinte** — 64 caractères calculés à partir d'un fichier ; un octet changé change tout :
  prouve qu'un fichier n'a pas été modifié.
- **File de travaux (BullMQ)** — tâches lentes faites en arrière-plan (PDF, indexation, IA), rejouées en cas
  d'échec ; la requête répond tout de suite (HTTP 202).
- **Vérification publique / révocation** — page sans compte qui dit si un certificat est valide ; la
  révocation l'annule définitivement sans effacer sa trace.
- **RAG / embeddings / pgvector** — retrouver les passages utiles du cours (par leur « signature »
  numérique, rangée dans PostgreSQL par pgvector), puis demander au modèle de langage de s'appuyer dessus.
- **Humain dans la boucle** — aucune question proposée par l'IA n'entre dans un QCM sans décision du
  formateur.

---

*CHANGELOG · Cert_EET · PFE ESPRIT 2026 · Iyed Omri. Trace technique détaillée : `engineering-log/`.*
