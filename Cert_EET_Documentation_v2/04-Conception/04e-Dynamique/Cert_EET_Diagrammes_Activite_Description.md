Cert_EET — Diagrammes d'activite

**Cert_EET**

**Diagrammes d****'****activite**

Document maitre de description — AC-01 a AC-04

Projet de Fin d'Etudes — ESPRIT, Ingenierie Logicielle

Iyed Omri  ·  Version 1.0  ·  Juin 2026

# Sommaire

# 1. Objet et conventions

Ce document presente les quatre diagrammes d'activite de la plateforme Cert_EET. Chaque diagramme modelise un workflow metier : enchainement d'etapes, branches conditionnelles, parallelisme et points de decision. La ou les diagrammes de sequence repondent a la question « qui parle a qui, dans quel ordre », les diagrammes d'activite repondent a « quelles etapes s'enchainent et sous quelles conditions ».

**Demarche. **Les quatre workflows sont derives directement des diagrammes de sequence (DS-01 a DS-16), de la note technique Synchrone/Asynchrone et des besoins fonctionnels F1 a F4 du cahier des charges. Aucune etape n'a ete introduite sans source. La matrice de coherence (section 6) trace chaque diagramme vers ses sources.

**Conventions graphiques. **Le rendu adopte un routage orthogonal strict (segments horizontaux et verticaux, sans courbe), des couloirs (swimlanes) pour attribuer chaque action a un acteur ou un processus, et un code couleur des noeuds rappele ci-dessous. Le noeud initial est un cercle noir plein, le noeud final un cercle cercle, et les barres de synchronisation noires materialisent les fork/join.

| **Vert — action** | **Bleu — async / worker** | **Jaune — decision** | **Rouge — erreur / rejet** |
| --- | --- | --- | --- |

*Cette palette est alignee sur les legendes des diagrammes de sequence du projet (bleu asynchrone, rouge erreur, vert succes, jaune variante), garantissant la coherence transverse des artefacts.*

# 2. AC-01 — Cycle complet de certification

**Couloirs : **Apprenant | Systeme | Formateur

**Pourquoi ce diagramme. **Ce diagramme donne la vue d'ensemble du parcours apprenant, de la consultation du catalogue jusqu'a la mise en file de generation du certificat. Il agrege en un seul flux les quatre scenarios de sequence qui jalonnent le cycle (inscription, QCM, correction d'atelier, emission), ce qu'aucun diagramme de sequence isole ne montre.

**Ce qu****'****il apporte. **Il rend visibles le parallelisme entre les evaluations (QCM et ateliers menes de front, materialise par une barre de fork/join) et le point de decision unique qui conditionne l'eligibilite a la certification.

**Choix de conception illustres. **La generation du certificat n'est pas executee dans le flux synchrone : le diagramme la represente comme une mise en file (noeud bleu) renvoyant immediatement, conformement a l'ADR-04. L'echec d'inscription (formation complete) et la non-eligibilite sont deux fins distinctes, traitees en rouge.

**Sources de sequence : **DS-08 (inscription), DS-02 (QCM), DS-03 (correction), DS-04 (emission)**   ·   Cahier des charges : **F1, F2, F3

*Figure 1 — AC-01 (rendu Graphviz, routage orthogonal).*

## 2.1 Noeuds cles

| **Noeud / etape** | **Type** | **Role** | **Cle** |
| --- | --- | --- | --- |
| **Consulter le catalogue** | Action | Apprenant parcourt les formations ouvertes |  |
| **Places disponibles ?** | Decision | Garde a l'inscription ; sinon rejet (formation complete) |  |
| **Fork QCM / Ateliers** | Fork/Join | Les deux familles d'evaluations sont menees en parallele |  |
| **Corriger les livrables** | Action (Formateur) | Correction des ateliers ; rejoint la barre de synchronisation |  |
| **Tous QCM/ateliers ****>****= seuil ?** | Decision | Condition d'eligibilite a la certification |  |
| **Mettre en file la generation** | Async | Job Bull/Redis ; le thread web n'est pas bloque |  |

# 3. AC-02 — Generation PDF asynchrone du certificat

**Couloirs : **Thread web | File Bull/Redis | Worker | Stockage/Notif

**Pourquoi ce diagramme. **Ce diagramme materialise la decision d'architecture centrale du projet (note Synchrone/Asynchrone, cas 2) : sortir un calcul lourd (PDF + SHA-256 + QR) du thread web pour le confier a un worker separe via une file Bull/Redis.

**Ce qu****'****il apporte. **La separation thread/worker est visible par les couloirs : le thread web atteint une premiere fin (reponse HTTP 202) tandis que le travail reel se poursuit dans le worker. La generation du PDF et du QR code s'execute en parallele (fork/join), puis converge vers le calcul d'empreinte.

**Choix de conception illustres. **La politique de reprise est explicite : un losange evalue le succes du job ; en cas d'echec, un backoff exponentiel (5/10/20s) precede un nouveau passage en file, jusqu'a trois tentatives ; l'echec definitif remet le certificat en attente et alerte l'administrateur. Les deux noeuds finaux (retour HTTP et fin de workflow) traduisent fidelement l'asynchronisme.

**Sources de sequence : **DS-04 (emission asynchrone)**   ·   Cahier des charges : **F3, ADR-04

*Figure 2 — AC-02 (rendu Graphviz, routage orthogonal).*

## 3.1 Noeuds cles

| **Noeud / etape** | **Type** | **Role** | **Cle** |
| --- | --- | --- | --- |
| **Enfiler le job** | Async | queue.add avec attempts:3, backoff:5s |  |
| **Repondre HTTP 202** | Action | Le thread web est libere — premiere fin |  |
| **Fork PDF / QR code** | Fork/Join | PDFKit et QR code generes en parallele |  |
| **Calculer SHA-256** | Async | Empreinte cryptographique du PDF |  |
| **Job reussi ?** | Decision | Porte d'entree de la boucle de reprise |  |
| **Backoff exponentiel** | Async | Re-planification 5/10/20s avant nouvelle tentative |  |
| **Reset EN_ATTENTE + alerte admin** | Erreur | Echec definitif apres 3 tentatives |  |

# 4. AC-03 — Correction d'un atelier

**Couloirs : **Apprenant | Systeme | Formateur

**Pourquoi ce diagramme. **Ce diagramme illustre la logique metier la plus riche en branches : double garde a la soumission, verrouillage progressif du livrable, boucle de notation critere par critere, et declenchement conditionnel de la certification.

**Ce qu****'****il apporte. **Il montre le verrouillage (noeud bleu EN_CORRECTION) qui interdit a l'apprenant de remplacer son livrable une fois la correction ouverte, et l'immuabilite du feedback une fois le statut NOTE atteint.

**Choix de conception illustres. **Les deux refus de soumission (HTTP 403 date depassee, HTTP 400 format) sont des fins distinctes en rouge. La correction incomplete reboucle (fleche pointillee) vers la notation plutot que d'echouer. Le dernier losange enchaine, le cas echeant, sur le workflow d'emission (AC-02).

**Sources de sequence : **DS-03 (soumission + correction), enchainement DS-04**   ·   Cahier des charges : **F2, F3

*Figure 3 — AC-03 (rendu Graphviz, routage orthogonal).*

## 4.1 Noeuds cles

| **Noeud / etape** | **Type** | **Role** | **Cle** |
| --- | --- | --- | --- |
| **Avant la date limite ?** | Decision | Sinon rejet HTTP 403 |  |
| **Format et taille valides ?** | Decision | Sinon rejet HTTP 400 |  |
| **Statut = SOUMIS + hash** | Action | Hash de tracabilite anti-substitution |  |
| **Verrouillage EN_CORRECTION** | Async | L'apprenant ne peut plus remplacer le livrable |  |
| **Noter chaque critere** | Action (boucle) | Grille de notation, score recalcule en continu |  |
| **Ponderations = 100% ?** | Decision | Sinon correction incomplete (reboucle) |  |
| **Declencher l****'****emission** | Async | Si score >= seuil ET modules valides |  |

# 5. AC-04 — Generation de questions QCM par IA / RAG

**Couloirs : **Formateur | Systeme | Worker IA | LLM externe

**Pourquoi ce diagramme. **Ce diagramme demontre le pipeline RAG a deux etages (indexation puis generation) et le principe non negociable d'humain dans la boucle, qui differencie Cert_EET des plateformes du marche (niveau N4 du benchmark).

**Ce qu****'****il apporte. **Il distingue les deux passages asynchrones par la file (job 1 indexation, job 2 generation), montre la phase de Retrieval (similarite cosinus top-8 sur pgvector) puis d'Augmented Generation (construction du prompt + appel LLM), et isole le LLM externe dans son propre couloir.

**Choix de conception illustres. **Aucune suggestion n'entre dans la banque de questions sans validation explicite : la decision du formateur est un losange a trois issues (accepter, modifier, rejeter) place dans le couloir Formateur, en aval de tout traitement automatique. La boucle de revision parcourt chaque suggestion proposee.

**Sources de sequence : **DS-06 (generation QCM par IA / RAG)**   ·   Cahier des charges : **F4, ADR-04, ADR-05

*Figure 4 — AC-04 (rendu Graphviz, routage orthogonal).*

## 5.1 Noeuds cles

| **Noeud / etape** | **Type** | **Role** | **Cle** |
| --- | --- | --- | --- |
| **Uploader un support** | Action | PDF/PPTX rattache a un module |  |
| **Extraire + chunker** | Async | 512 tokens, overlap 50 |  |
| **Embeddings des chunks** | Async (LLM) | Vectorisation par chunk |  |
| **Retrieval top-8** | Async | Similarite cosinus sur pgvector |  |
| **Chat completion** | Async (LLM) | Generation des questions ancree sur le contexte |  |
| **INSERT suggestions PROPOSEE** | Action | En attente de validation humaine |  |
| **Decision formateur ?** | Decision | Accepter / Modifier / Rejeter — humain dans la boucle |  |

# 6. Matrice de coherence

La matrice relie chaque workflow a ses sources documentaires et aux cycles de vie (diagrammes d'etats-transitions) qu'il met en mouvement. Elle permet au jury de verifier qu'aucun diagramme n'est orphelin et que les statuts manipules correspondent aux enumerations du modele de domaine.

| **Diag.** | **Couloirs** | **Sources DS** | **CdC / Note** | **Etats relies** |
| --- | --- | --- | --- | --- |
| **AC-01** | Apprenant · Systeme · Formateur | DS-02, 03, 04, 08 | F1·F2·F3 | StatutCertificat, StatutLivrable, StatutTentative |
| **AC-02** | Thread · Bull · Worker · Stockage | DS-04 | F3 · ADR-04 · Note cas 2 | StatutCertificat (EN_ATTENTE → EN_GENERATION → ACTIF) |
| **AC-03** | Apprenant · Systeme · Formateur | DS-03 (+ DS-04) | F2·F3 | StatutLivrable (SOUMIS → EN_CORRECTION → NOTE) |
| **AC-04** | Formateur · Systeme · Worker IA · LLM | DS-06 | F4 · ADR-04/05 · Note cas 4 | StatutSuggestion, statut SupportPedagogique |

**Cible de coherence. **Chaque noeud bleu (asynchrone) d'un diagramme d'activite correspond a une mise en file dans un diagramme de sequence ; chaque statut nomme correspond a une valeur d'enumeration du diagramme de classes et a un etat des diagrammes d'etats-transitions. Les acteurs des couloirs sont ceux des diagrammes de cas d'utilisation.

# 7. Rendu et reproduction

Chaque diagramme est fourni dans son propre sous-dossier sous trois formes : la source PlantUML (.puml), la source Graphviz (.dot) et l'image (.png). Les deux sources decrivent le meme diagramme.

**Rendu de reference (Graphviz). **Les PNG inclus dans ce document ont ete produits via Graphviz, qui offre un controle precis du routage orthogonal et de la mise en page sans superposition :

dot -Tpng -Gdpi=160 AC02_Generation_PDF_Async/Cert_EET_AC02_Generation_PDF_Async.dot -o sortie.png

**Rendu PlantUML. **Le renderer PlantUML etant inaccessible dans l'environnement de production, les sources .puml (avec skinparam linetype ortho) sont fournies pour integration dans une chaine outillee PlantUML — StarUML ou l'extension VS Code :

java -jar plantuml.jar AC02_Generation_PDF_Async/Cert_EET_AC02_Generation_PDF_Async.puml

Iyed Omri — PFE ESPRIT 2026     ·     Page  /