# US-QUAL-01 — Audit complet de navigation avant la démonstration

## En une phrase
Un outil rejouable parcourt toute l'application dans un vrai navigateur,
pour chaque rôle et à 1280 / 390 px (liens, menus, boutons, pages d'autres
rôles, adresse inconnue) ; les défauts trouvés sont corrigés, et un jeu de
démonstration complet se charge en une commande idempotente, avec un guide de
démonstration.

## Point de départ
Démonstration à l'encadrant le lendemain : aucune page ne doit être cassée,
morte ou vide ; il fallait aussi des données réalistes et un scénario.

## Découpage
- `outils/recette/audit-navigation.js` (+ `package.json`, `README.md`) :
  Playwright (`playwright-core` 1.64.1, version exacte publiée depuis plus de
  deux semaines ; `otplib` 12.0.1 déjà utilisé par l'api) ; parcours en
  largeur de tous les liens internes atteints depuis la page du rôle, son menu
  de compte et son menu mobile (un exemple par gabarit de route) ; examen de
  chaque page ; clic de chaque bouton **sûr** (liste noire des actions qui
  écrivent ou changent la session) avec contrôle d'un effet ; pages d'autres
  rôles ; adresse inconnue. Rapport JSON, code de sortie 0 / 1.
- `apps/api/src/database/demo/charger-demo.ts` + `npm run demo:charger` :
  jeu de démonstration (voir `docs/GUIDE_DEMO.md`).
- `docs/GUIDE_DEMO.md` : préparation, comptes, données, scénario rôle par
  rôle, dépannage.

## Défauts trouvés et corrigés
| # | Constat (outil ou recette) | Correction |
|---|---|---|
| 1 | Adresse inconnue : page 404 par défaut de Next, **en anglais**, sans en-tête ni lien de retour (tous rôles, 1280 et 390 px). | `app/not-found.tsx` : « Page introuvable » en français, dans la coquille, bouton « Revenir à l'accueil » (qui mène à la page du rôle). |
| 2 | `/favicon.ico` en 404 à chaque chargement (erreur visible dans la console). | `app/icon.svg` (badge « CE » aux couleurs de la plateforme), servi par Next. |
| 3 | Filtres des alertes (« Ouvertes », « Traitées »…) : état actif seulement visuel. | `aria-pressed` (lecteurs d'écran ; même convention que les filtres des certificats et des livrables). |
| 4 | CI de `main` rouge une fois après la fusion de US-NAV-01 : `rapports-institutionnels` attendait `EN_ATTENTE` alors que le worker avait déjà pris le rapport (`EN_COURS`). Même course possible dans `rapports-session`. | Tests rendus déterministes : `EN_ATTENTE` **ou** `EN_COURS` à la réponse, le reste inchangé (état final `PRET` toujours vérifié). |
| 5 | Corrigés pendant les stories du sprint (relevés par la même méthode) : session perdue au F5 (US-AUTH-17), clignotement de l'écran de connexion, accès sans redirection aux pages d'un autre rôle (US-NAV-01), statut invisible sur mobile dans « Mes demandes », onglets d'administration coupés à 1280 px (US-FORM-07). | Voir les journaux 83 à 87. |

Faux positifs écartés par l'outil : un filtre déjà sélectionné (bouton
`aria-pressed="true"`) n'a pas d'effet quand on le reclique — normal.

## Jeu de démonstration
| Décision | Choix |
|---|---|
| Idempotence | Comptes : `INSERT … ON CONFLICT (email) DO UPDATE` (mot de passe remis à chaque passage). Structure (formations, modules, inscriptions, QCM, atelier, grille, alertes, demandes) : une transaction, créée seulement si la formation repère n'existe pas. Tentatives, livrables, certificats : créés seulement s'ils manquent. Deux passages -> même état (vérifié). |
| Réalisme | Ce qui a des règles métier passe par l'api ou sa file : QCM **passés** par les apprenants (réponses, soumission, notation serveur) ; livrables **déposés** en multipart (PDF réel dans le stockage objet) ; certificats **générés** par le worker (PDF réels, vérification publique fonctionnelle). Seules les données sans logique propre sont écrites en SQL. |
| MFA | Secret TOTP fixe de démonstration, documenté ; jamais en production. |
| Coexistence | Ne touche à aucune autre donnée (anciens comptes de démonstration compris). |

## Fichiers
- `outils/recette/audit-navigation.js`, `package.json`, `package-lock.json`, `README.md` (nouveaux)
- `apps/api/src/database/demo/charger-demo.ts` (nouveau), `apps/api/package.json` (`demo:charger`)
- `apps/api/test/rapports-institutionnels.e2e-spec.ts`, `test/rapports-session.e2e-spec.ts`
- `apps/web/src/app/not-found.tsx`, `app/icon.svg` (nouveaux), `app/formateur/alertes/page.tsx`
- `docs/GUIDE_DEMO.md` (nouveau)

## Vérification
- Audit complet (pile locale derrière nginx, build de production, base
  vierge + `demo:charger`) : **5 rôles × 2 largeurs, 104 parcours de pages,
  0 problème** après corrections (26 au premier passage, dont 20 pour la page
  404 et 6 faux positifs de filtres déjà actifs).
- Mutations : **12 / 12 tuées**.
  - Web, tués par l'outil d'audit lui-même (8) : page 404 en anglais, lien de
    menu mort, page blanche, erreur JavaScript, défilement horizontal, bouton
    sans effet, page d'administration ouverte au formateur, appel à une route
    d'api inexistante — l'outil détecte bien chaque classe de défaut qu'il
    promet.
  - Jeu de démonstration, tués par un double chargement suivi d'un comptage
    exact (4) : structure recréée, QCM repassé, livrable redéposé,
    certificats dupliqués.
- Parcours de démonstration vérifiés à la main dans le navigateur : atelier
  avec ses deux livrables « À corriger » et sa grille validée, ouverture
  d'une correction (fichier téléchargeable, hash, grille), certificats
  générés, tableau de bord du formateur.
- Api : lint 0 avertissement, `tsc`, unitaires **117 suites / 1 464 tests**,
  e2e complet en série **72 suites / 846 tests** (+ 1 ignoré).
- Web : `tsc`, `next lint`, `next build`.

## CI
Voir la PR.
