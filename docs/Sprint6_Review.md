# Cert_EET — Sprint 6 · Revue de Sprint (Sprint Review) et rétrospective

> **Projet :** Cert_EET — Certification ESPRIT Entreprise · PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 6 — « Prêt pour la démonstration »
> **Statut :** ✅ **CLÔTURÉ** — 6 / 6 stories, **26 pts** (PR #97 → #102), réalisé le 11/11/2026 avec un
> agent de développement, sans intervention du porteur pendant le sprint.
> **But de ce document :** expliquer simplement ce qui a été construit, pourquoi, comment le démontrer,
> et ce qui reste à décider.

---

## 1. Le contexte en une page

Le porteur présente l'application à son encadrant le lendemain. Un défaut bloquant était apparu : après
un **rafraîchissement de page (F5)**, l'utilisateur semblait déconnecté et voyait la page publique. Par
ailleurs, chaque connexion menait à un accueil intermédiaire, le formateur n'avait pas de tableau de bord
ni de moyen de demander ou de proposer une formation, et il n'existait pas de données de démonstration
cohérentes. Le sprint corrige le défaut, simplifie la navigation, ajoute les fonctions du formateur, puis
vérifie toute la navigation avec un outil rejouable.

---

## 2. Le but du Sprint et son verdict

> *Rendre la plateforme démontrable sans accroc.* — **Atteint.** Les 6 stories sont livrées ; l'audit
> final parcourt 5 rôles × 2 largeurs sans aucun problème ; un jeu de démonstration se charge en une
> commande et un guide décrit la démonstration pas à pas (`docs/GUIDE_DEMO.md`).

---

## 3. Bilan chiffré

| Indicateur | Sprint 5 | Sprint 6 |
|---|---:|---:|
| Stories / points | 6 / 23 | 6 / 26 |
| Tests unitaires | 1 446 | **1 464** |
| Tests e2e (série) | 808 | **846** |
| Suites e2e | 68 | **72** |
| Mutants tués | 89 | **79** (+ 1 équivalent documenté) |
| Migrations | 37 | **39** |
| Pages parcourues par l'audit final | — | **104**, 0 problème |

---

## 4. Ce qui a été construit (expliqué simplement)

### 4.1 La session tient au rafraîchissement *(US-AUTH-17 — PR #97, journal 83)*
- **Quoi :** après F5, on reste connecté sur la même page ; un chargement neutre s'affiche le temps de
  restaurer la session ; après une déconnexion, F5 laisse déconnecté.
- **Pourquoi :** sans cela, aucune démonstration n'était possible.
- **Comment :** le jeton d'accès reste en mémoire (protection contre le vol par script) ; au chargement,
  la session est restaurée **une seule fois** grâce au cookie sécurisé ; côté serveur, deux demandes
  simultanées avec le même cookie ne peuvent plus « se tuer » : une seule gagne, l'autre est refusée
  proprement, et la session continue.

### 4.2 Chacun arrive chez soi *(US-NAV-01 — PR #98, journal 84)*
- **Quoi :** administrateur -> tableau de bord, formateur -> son tableau de bord, apprenant -> catalogue ;
  un connecté ne revoit jamais l'écran de connexion ; une page protégée ouverte sans session ramène, après
  connexion, sur cette page.
- **Comment :** une seule règle pour toutes les pages ; le chemin de retour n'accepte que des adresses
  internes (pas de redirection vers un autre site).

### 4.3 Le tableau de bord du formateur *(US-DASH-03 — PR #99, journal 85)*
- **Quoi :** sur toutes ses formations : statuts, inscrits et actifs, réussite et score moyen aux QCM,
  tentatives et livrables à évaluer, alertes de décrochage, certificats délivrés, activité par jour, et
  une ligne par formation avec un lien vers son suivi. L'administrateur voit en permanence les demandes
  qui attendent sa décision.
- **Comment :** deux requêtes agrégées, quel que soit le nombre de formations ; le formateur ne voit que
  ses formations.

### 4.4 Demander à enseigner une formation *(US-FORM-07 — PR #100, journal 86)*
- **Quoi :** un formateur demande une formation existante avec un motif ; l'administrateur accepte
  (affectation immédiate) ou refuse avec un motif ; le formateur peut annuler ; emails et journal d'audit.
- **Comment :** une seule demande en attente par formateur et formation (garantie par la base), une
  seule décision possible même si plusieurs clics arrivent en même temps.

### 4.5 Proposer une nouvelle formation *(US-FORM-08 — PR #101, journal 87)*
- **Quoi :** un formateur propose une formation (cinq en cours au plus) ; l'administrateur l'accepte —
  elle est créée **en brouillon** avec le proposant affecté —, demande des modifications ou refuse ; un
  brouillon se publie ensuite.
- **Comment :** nouveau statut BROUILLON (hors catalogue, sans inscription) ; publication tracée
  différemment d'une réouverture.

### 4.6 Recette de navigation et démonstration *(US-QUAL-01 — PR #102, journal 88)*
- **Quoi :** un outil parcourt automatiquement toute l'application pour chaque rôle, sur ordinateur et
  téléphone, et signale liens morts, pages vides, erreurs, boutons sans effet, accès au mauvais rôle ; un
  jeu de démonstration réaliste se charge en une commande ; un guide décrit la démonstration.
- **Corrigé grâce à l'audit :** page « introuvable » en français (au lieu de la page anglaise par
  défaut), icône de l'application (erreur 404 à chaque page), accessibilité des filtres, deux tests
  rendus déterministes.

---

## 5. Script de démonstration (pour la Sprint Review)

Voir `docs/GUIDE_DEMO.md` (préparation, comptes, données, scénario rôle par rôle, dépannage).

---

## 6. Qualité, décisions et écarts assumés

### Principes retenus pendant le sprint
- **Corriger à la racine** : la déconnexion au F5 venait de trois appels concurrents et d'une course
  côté serveur ; les deux côtés sont corrigés et prouvés (e2e et navigateur, y compris deux onglets).
- **Pas de lien mort entre deux fusions** : boutons et compteurs ajoutés par la story qui crée leur page.
- **Un outil plutôt qu'une vérification** : l'audit est rejouable et prouve, par mutations, qu'il
  détecte chaque classe de défaut qu'il annonce.

### Écarts assumés
- Les trois « accueils de rôle » du Sprint 4 sont retirés : chaque rôle arrive désormais sur sa page de
  travail (choix demandé).
- « Public visé » d'une proposition : ajouté à la description de la formation créée (pas de nouvelle
  colonne dans les formations).
- Un mutant équivalent (US-FORM-07, verrou de création) : l'index unique donne le même résultat ; noté.

---

## 7. Incidents et leçons

| Incident | Leçon |
|---|---|
| Échec ponctuel de la CI de `main` (rapports : le worker prenait la tâche avant la réponse) | Un test qui dépend d'un ordre de traitement asynchrone doit accepter les deux états ; rendu déterministe dans US-QUAL-01. |
| `node_modules` web partagé par lien symbolique vidé par un build | Une installation par copie de travail web. |
| Limite de connexions atteinte par les scénarios navigateur | Réglable par variable ; relevée seulement dans la pile de recette locale. |

---

## 8. Rétrospective

### Ce qui a bien marché
- Les scénarios navigateur rejoués à chaque story (session, navigation) ont attrapé des régressions
  invisibles aux tests d'api.
- Les mutations « web » tuées par le navigateur : la preuve que les scénarios testent vraiment.

### Ce qui n'a pas marché
- Le défaut de session aurait dû être vu au Sprint 4 : la page d'accueil décidait avant la restauration.

### Ce qu'on essaie ensuite
- Lancer l'audit de navigation en CI (pile docker de recette) à chaque PR qui touche le web.

---

## 9. Actions pour le porteur

- Charger le jeu de démonstration (`npm run demo:charger`) et répéter le scénario du guide.
- Rotation des secrets exposés sur la branche `docs` (action d'exploitation).
- Vrais certificats TLS sur le serveur, puis `docker/nginx/verifier-durcissement.sh`.
- Webcam : `SURVEILLANCE_WEBCAM=off` tant que l'accord encadrant / RGPD / INPDP n'est pas obtenu.
- Décider de la pseudonymisation de l'audit antérieur à une anonymisation et des durées de conservation.
- Renouveler la clé Anthropic avant son expiration (variable d'environnement seulement).

---

*Revue de Sprint · Cert_EET — Sprint 6 · clôturé · Iyed Omri, PFE ESPRIT.*
