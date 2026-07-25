Cert_EET · Diagrammes d'etats-transitions

**Cert_EET**

Plateforme de certification numerique — ESPRIT Entreprise

**Dossier de conception — Diagrammes d****'****etats-transitions**

5 cycles de vie modelises en UML 2.5

**Iyed Omri**

Projet de Fin d'Etudes — ESPRIT 2026

Stack : NestJS · Next.js · PostgreSQL/TypeORM · Redis · Bull

# Sommaire

# 1. Objet du document

Ce dossier rassemble les cinq diagrammes d'etats-transitions du systeme Cert_EET. Chaque diagramme decrit le cycle de vie complet d'un objet metier porteur d'un statut : de son etat initial jusqu'a ses etats terminaux, en passant par toutes les transitions autorisees, leurs evenements declencheurs, leurs gardes et leurs actions.

Les statuts modelises correspondent exactement aux enumerations TypeScript definies dans le package 8 du diagramme de classes v3.2, garantissant qu'aucune divergence n'existe entre la vue statique (classes) et la vue comportementale (etats-transitions). Les transitions sont alignees sur les scenarios des diagrammes de sequence DS-02, DS-03, DS-04, DS-06, DS-07 et DS-15.

## Conventions de lecture

**Format des transitions : **chaque fleche porte un libelle de la forme *Acteur : evenement [garde] / action*. L'acteur est l'entite qui declenche la transition (Apprenant, Formateur, Administrateur, Systeme, Cron, Worker). La garde, entre crochets, est la condition booleenne qui doit etre vraie. L'action, apres la barre oblique, est l'effet de bord produit.

**Pseudo-etats : **le cercle plein noir marque l'etat initial ; le cercle cercle marque un etat final. Un objet peut posseder plusieurs etats finaux.

**Code couleur (criticite) : **les etats sont colores selon leur nature, suivant la charte du projet identique aux diagrammes de sequence.

| **Etat** | **Criticite** | **Signification metier** |
| --- | --- | --- |
| **En attente** |  | Etat transitoire en amont d'un traitement (file, activation, validation) |
| **En cours** |  | Traitement actif ou etat intermediaire reversible |
| **Nominal actif** |  | Etat cible reussi ; objet pleinement valide et operationnel |
| **Erreur / rejet** |  | Echec, revocation, abandon ou rejet ; sortie hors du chemin nominal |
| **Terminal** |  | Etat final irreversible ; aucune transition sortante metier |

# 2. ET-01 — Certificat

**Enumeration : **StatutCertificat**    Sequences liees : **DS-04 (emission), DS-05 (verification publique), DS-07 (revocation)

Le certificat est l'artefact final de toute la chaine de certification. Son cycle de vie est entierement pilote par le systeme jusqu'a l'emission, puis par l'Administrateur pour la revocation.

## Etats

| **Etat** | **Criticite** | **Signification metier** |
| --- | --- | --- |
| **EN_ATTENTE_GENERATION** |  | Toutes les conditions de certification sont reunies (tous les QCM et ateliers au-dessus du seuil). Un job est mis en file Bull/Redis. Aucun PDF n'existe encore. |
| **EN_GENERATION** |  | Un worker asynchrone produit le PDF, calcule l'empreinte SHA-256, integre le QR code et publie l'URL de verification. La politique de reprise autorise 3 tentatives. |
| **ACTIF** |  | Le certificat est valide et verifiable publiquement (DS-05). Badge vert sur la page publique. |
| **REVOQUE** |  | Revocation par l'Administrateur (DS-07) apres double confirmation et choix d'un motif normalise. Le PDF est conserve (immuabilite NF3). Badge rouge. |
| **EXPIRE** |  | La date d'expiration est depassee ; un cron fait basculer l'etat automatiquement. Badge gris. |

## Choix de conception

- L'emission n'est jamais declenchee manuellement : c'est le systeme (DS-04) qui cree le certificat des que la garde de certification est satisfaite.

- En cas d'echec de generation, le worker re-enfile le job tant que le compteur de tentatives reste sous 3 ; au-dela, le certificat bascule en EXPIRE et l'Administrateur est alerte, evitant tout objet bloque indefiniment en EN_GENERATION.

- REVOQUE et EXPIRE sont terminaux mais l'objet reste consultable publiquement : la transition vers l'etat final modelise la fin du cycle metier, pas une suppression — exigence d'immuabilite NF3.

# 3. ET-02 — TentativeQCM

**Enumeration : **StatutTentative**    Sequences liees : **DS-02 (passage de QCM)

Une tentative materialise un passage de QCM par un apprenant. Sa securite repose sur un timer serveur et un scoring entierement cote serveur.

## Etats

| **Etat** | **Criticite** | **Signification metier** |
| --- | --- | --- |
| **EN_COURS** |  | Tentative active. Le timer est gere exclusivement cote serveur via Redis TTL (jamais cote client). Les reponses sont auto-sauvegardees toutes les 10 secondes. |
| **SOUMISE** |  | L'apprenant a confirme la soumission avant l'expiration du timer. |
| **ABANDONNEE_TIMER** |  | Le timer a expire sans soumission. Les reponses partielles deja auto-sauvegardees sont conservees pour le scoring. |
| **NOTEE** |  | Scoring calcule a 100% cote serveur (pondere sur les bonnes reponses, jamais transmises au frontend). Etat immuable constituant l'historique certifiant. |

## Choix de conception

- La garde de fin de timer [TTL = 0] est evaluee par le serveur : aucune manipulation de l'horloge du navigateur ne peut la contourner (mesure anti-fraude F1).

- ABANDONNEE_TIMER n'est pas une impasse : les reponses partielles sont notees, ce qui garantit l'equite de traitement.

- NOTEE est terminal et immuable : aucune renotation n'est possible, l'historique certifiant ne peut etre altere.

# 4. ET-03 — Livrable

**Enumeration : **StatutLivrable**    Sequences liees : **DS-03 (depot et correction), DS-04 (emission)

Le livrable est la production rendue par l'apprenant pour un atelier. Son cycle separe nettement la phase modifiable (apprenant) de la phase de correction (formateur).

## Etats

| **Etat** | **Criticite** | **Signification metier** |
| --- | --- | --- |
| **BROUILLON** |  | Etat initial a la creation. Le livrable n'est pas encore depose et reste librement modifiable. |
| **SOUMIS** |  | Apres depot (DS-03) : l'empreinte hashTracabilite est calculee, les fichiers sont televerses (S3/MinIO), la version est incrementee. Remplacement possible tant que la date limite n'est pas atteinte. |
| **EN_CORRECTION** |  | Le formateur a ouvert le livrable : verrouillage. L'apprenant ne peut plus le remplacer. |
| **NOTE** |  | Correction finalisee : grille complete, somme des ponderations egale a 100%, feedback immuable envoye. |

## Choix de conception

- Le remplacement est une transition reflexive sur SOUMIS, gardee par [NOW() < dateLimite]. Une fois la date limite passee, ou le livrable ouvert par le formateur, le verrouillage est definitif.

- EN_CORRECTION est l'etat de verrou qui protege l'integrite de la correction : la production evaluee ne peut plus changer sous le formateur.

- La sortie de NOTE peut declencher l'emission d'un certificat (DS-04) si et seulement si le score atteint le minimum requis et que tous les modules sont valides.

# 5. ET-04 — CompteUtilisateur

**Enumeration : **StatutCompte**    Sequences liees : **DS-15 (gestion des comptes)

Le compte utilisateur porte le cycle de vie de l'identite sur la plateforme, depuis sa creation par l'Administrateur jusqu'a l'anonymisation RGPD. C'est le cycle le plus riche, avec une branche reversible et une branche irreversible.

## Etats

| **Etat** | **Criticite** | **Signification metier** |
| --- | --- | --- |
| **EN_ATTENTE_ACTIVATION** |  | Compte cree par l'Administrateur (DS-15). Un token d'activation a duree de vie 48h est envoye par email. La connexion est impossible. |
| **ACTIF** |  | Compte operationnel apres clic sur le lien d'activation. Un changement de role reste possible (Administrateur, DS-15). |
| **DESACTIVE** |  | Desactivation par l'Administrateur : toutes les sessions Redis sont invalidees immediatement. Une protection anti-lockout empeche la desactivation du dernier administrateur. |
| **ANONYMISE** |  | Droit a l'oubli RGPD : les donnees personnelles sont remplacees par des pseudonymes, tandis que les donnees pedagogiques (tentatives, livrables, certificats) sont conservees. Operation atomique PostgreSQL, irreversible. |

## Choix de conception

- DESACTIVE est reversible (reactivation possible vers ACTIF) alors qu'ANONYMISE est terminal : c'est la frontiere entre une suspension administrative et l'exercice du droit a l'oubli.

- La garde [NOT dernier admin] sur la desactivation materialise la protection anti-lockout exigee par DS-15.

- Le changement de role est une transition reflexive sur ACTIF (l'etat du cycle de vie ne change pas) mais declenche l'invalidation des sessions Redis, car les autorisations RBAC portees par le JWT doivent etre recalculees.

- Un token d'activation non consomme apres 48h fait expirer le compte vers l'etat final : un compte jamais active n'encombre pas l'etat ACTIF.

# 6. ET-05 — SuggestionQuestionIA

**Enumeration : **StatutSuggestion**    Sequences liees : **DS-06 (generation IA)

Une suggestion est une question candidate produite par le LLM. Son cycle illustre le principe de l'humain dans la boucle : aucune publication automatique.

## Etats

| **Etat** | **Criticite** | **Signification metier** |
| --- | --- | --- |
| **PROPOSEE** |  | Generee par le LLM dans un lot GenerationIA (DS-06, pipeline RAG ancre sur les supports pedagogiques indexes dans pgvector). En attente de decision du formateur. |
| **ACCEPTEE** |  | Le formateur accepte sans modification ; une Question est creee dans la banque avec origine = IA. |
| **MODIFIEE** |  | Le formateur modifie l'enonce, les options ou l'explication, puis accepte ; une Question est creee avec origine = IA_MODIFIEE. |
| **REJETEE** |  | Suggestion archivee, non publiee. La tracabilite du rejet est conservee pour l'analyse des taux d'acceptation par modele et par module. |

## Choix de conception

- Aucune transition n'est automatique : chaque sortie de PROPOSEE exige une decision explicite du formateur. Le LLM ne declenche que l'entree dans PROPOSEE, jamais la publication.

- ACCEPTEE et MODIFIEE se distinguent par l'attribut origine de la Question creee, ce qui permet l'analyse fine des taux d'acceptation brute par rapport aux acceptations apres retouche.

- REJETEE est conserve plutot que supprime : la tracabilite des rejets alimente le suivi qualite des modeles generatifs.

# 7. Matrice de coherence — enumerations / sequences

Le tableau suivant verifie l'alignement de chaque diagramme avec sa source d'enumeration (package 8 du diagramme de classes v3.2) et ses diagrammes de sequence de reference.

| **Diagramme** | **Enumeration** | **Etats couverts** | **Sequences** |
| --- | --- | --- | --- |
| **ET-01 Certificat** | StatutCertificat | 5 / 5 | DS-04, DS-05, DS-07 |
| **ET-02 TentativeQCM** | StatutTentative | 4 / 4 | DS-02 |
| **ET-03 Livrable** | StatutLivrable | 4 / 4 | DS-03, DS-04 |
| **ET-04 CompteUtilisateur** | StatutCompte | 4 / 4 | DS-15 |
| **ET-05 SuggestionQuestionIA** | StatutSuggestion | 4 / 4 | DS-06 |

*Tous les etats des cinq enumerations sont couverts sans exception (21 etats au total).*

Iyed Omri — PFE ESPRIT 2026     Page  /