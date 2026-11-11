# US-AUTH-17 — Garder la session après un rafraîchissement de page

## En une phrase
Un rechargement de page (F5) ne déconnecte plus : la session est restaurée
une seule fois au chargement, aucune page ne s'affiche avant (chargement
neutre), et deux rafraîchissements simultanés du même cookie ne peuvent plus
tuer la session.

## Point de départ
Bug constaté par le porteur avant la démonstration : après F5, l'utilisateur
voyait la page publique (« tout est supprimé »). Le jeton d'accès vit en
mémoire seulement (choix anti-XSS, DS-01, inchangé) ; au chargement :

- l'accueil (`app/page.tsx`) et les pages qui lisent `user` décidaient
  **avant** la restauration : page publique, « Vous devez être connecté » ;
- trois chemins envoyaient `POST /api/auth/refresh` **en parallèle** avec le
  même cookie : l'en-tête (`restaurerSession`), l'intercepteur 401 des pages
  (`apiFetch`, appels partis sans jeton) et le retour OAuth
  (`bootstrapSession`, hors du partage). La rotation n'accepte qu'un seul de
  ces appels ; les autres recevaient 401 — `apiFetch` vidait alors la session
  et renvoyait vers `/login`, le retour OAuth vers `/login?erreur=oauth` ;
- côté api, une course existait aussi : le jeton brûlé était désactivé
  **avant** d'être mis sur la denylist ; une requête concurrente qui le lisait
  dans cet intervalle le prenait pour un rejeu et **révoquait toute la
  famille**, y compris le jeton tout neuf du gagnant (déconnexion au F5
  suivant) ;
- derrière nginx, `/api/auth/refresh` partageait la zone des connexions
  (30 / min / IP) alors que l'api en accepte 120 : une salle de cours qui
  recharge ses pages aurait reçu des 429.

## Découpage
- **Web**
  - `lib/api.ts` : `restaurerSessionInitiale()` — une seule restauration par
    chargement (promesse de module), qui passe par le refresh partagé
    d'`apiFetch` (single-flight) ; délai de 8 s au-delà duquel le visiteur est
    traité en anonyme (api injoignable). `bootstrapSession()` (retour OAuth)
    attend cette même restauration au lieu d'un second appel. Verrou Web Locks
    autour de l'appel réseau : deux **onglets** rechargés ensemble se
    succèdent (le second part avec le cookie déjà pivoté).
  - `contexts/AuthContext.tsx` : restauration au montage, état `chargement`
    exposé par `useAuth()`.
  - `components/SessionPrete.tsx` (nouveau, dans `app/layout.tsx`) : tant que
    `chargement` est vrai, aucune page n'est rendue ; un rond de chargement
    neutre la remplace (`role="status"`).
  - `components/SiteHeader.tsx` : ne restaure plus lui-même ; pendant le
    chargement, ni menu de compte ni « Se connecter ».
- **Api** (`auth.service.ts`) : brûlage d'un refresh token en deux temps sûrs
  — denylist posée d'abord, puis désactivation **conditionnelle**
  (`UPDATE … WHERE id = $1 AND active = true`) ; un seul rafraîchissement
  concurrent la gagne. Le perdant retire le jeton qu'il venait d'enregistrer et
  reçoit 401, sans toucher au gagnant. Un jeton inactif déjà sur la denylist
  (rotation concurrente) est refusé **sans** révoquer la famille ; le vrai
  rejeu (jeton consommé hors de la denylist) révoque toujours la famille.
- **Nginx** : zone `rafraichissement` dédiée (120 / min / IP, rafale 60),
  alignée sur la limite de l'api.
- Aucune migration, aucun nouvel endpoint, aucune dépendance.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Stockage du jeton | Inchangé : mémoire seulement (anti-XSS). La session survit au rechargement grâce au cookie httpOnly de refresh (déjà là depuis US-AUTH-03), pas à un stockage navigateur. |
| D2 | Une seule restauration | Promesse de module, créée au premier appel : React 18 rejoue les effets en développement (StrictMode), l'en-tête et le retour OAuth la demandent aussi ; tous reçoivent la même. Elle passe par le single-flight d'`apiFetch` : jamais deux rotations du même jeton depuis un onglet. |
| D3 | Pendant la restauration | Aucune page rendue (`SessionPrete`) plutôt qu'un test dans chaque page : une seule règle, impossible à oublier sur une nouvelle page ; les pages ne partent plus sans jeton (plus de 401 parasites dans la console). Coût : ~50 ms de rond de chargement au premier affichage, y compris pour un visiteur. |
| D4 | Plusieurs onglets | Web Locks (`navigator.locks`, tous les navigateurs actuels, contexte sécurisé) : sérialise les rafraîchissements du même navigateur. Absent : comportement d'avant (l'api reste correcte, voir D5). |
| D5 | Concurrence côté api | Pas de « délai de grâce » qui accepterait un jeton déjà consommé (un jeton volé rejoué dans la fenêtre ouvrirait une session) : on garde la règle « un jeton, une rotation » et on la rend **atomique**. Exactement un gagnant ; la famille n'est jamais révoquée par une simple course ; le test existant « rejeu d'un refresh consommé -> 401 » reste vrai. |
| D6 | Délai de restauration | 8 s : au-delà, page affichée en visiteur plutôt qu'un chargement sans fin si l'api ne répond pas. |
| D7 | Limite nginx | Zone propre au refresh (120 / min / IP, comme `LIMITE_RAFRAICHISSEMENT`) : un rechargement = un refresh. Le refresh exige un cookie signé valide, rien à deviner : la limite stricte des connexions n'a pas de sens ici. |
| D8 | Marqueur `tms` (US-AUTH-08) | Inchangé et vérifié : après un changement de mot de passe, l'ancien cookie est refusé ; une nouvelle session se restaure et son jeton passe le marqueur. |

## Fichiers
- `apps/web/src/lib/api.ts`, `contexts/AuthContext.tsx`, `components/SiteHeader.tsx`, `components/SessionPrete.tsx` (nouveau), `app/layout.tsx`, `app/globals.css`
- `apps/api/src/modules/auth/auth.service.ts`, `auth.service.spec.ts`
- `apps/api/test/session-rafraichissement.e2e-spec.ts` (nouveau, `E2E-AUTH17`)
- `docker/nginx/nginx.conf`

## Incidents
- `node_modules` du web en lien symbolique entre deux copies de travail :
  `next build` (sortie `standalone`) finit par vider le dossier cible (cause
  probable du piège « jest-worker manquant » noté au Sprint 4). Une copie
  `npm ci` par copie de travail web.
- nginx 1.24 local (recette) ne connaît pas `http2 on;` (1.25.1+) : la
  configuration est adaptée **à la volée** pour la pile locale ; le fichier
  versionné, lu par l'image `nginx` récente de docker-compose, n'est pas
  modifié sur ce point.
- La console signale un 404 sur `/favicon.ico` (aucune icône) : hors
  périmètre, corrigé par l'audit de navigation (US-QUAL-01).

## Vérification
- Api : lint 0 avertissement, `tsc`, unitaires **113 suites / 1 449 tests**
  (+ 3 : course perdue, ordre denylist / désactivation, jeton inactif déjà sur
  la denylist), e2e `E2E-AUTH17` (7 tests : attributs du cookie ;
  20 rafraîchissements répétés ; deux simultanés -> un seul gagnant et session
  vivante ; cinq simultanés -> un succès, un seul jeton actif ; vrai rejeu ->
  famille révoquée ; déconnexion puis rechargement -> reste déconnecté ;
  changement de mot de passe et marqueur `tms`), e2e complet en série (voir
  la PR).
- Mutations : **13 / 13 tuées** — api (10) : denylist après la désactivation,
  désactivation non conditionnelle, brûlage toujours gagnant, perdant qui
  garde son jeton, perdant qui reçoit 200, pas de seconde lecture de la
  denylist, vrai rejeu sans révocation, cookie sur `/`, `SameSite=Lax`,
  rotation sans brûler ; web (3, par le scénario navigateur) : aucune
  restauration au montage, pages rendues pendant la restauration,
  « Se connecter » affiché pendant la restauration.
- Web : `tsc`, `next lint` (0 avertissement), `next build`.
- Navigateur (Chromium), pile locale **derrière nginx en https://localhost**,
  en build de production **et** en `next dev` (StrictMode) : pour chaque rôle
  (apprenant, formateur, administrateur), à 1280 et 390 px, connexion puis F5
  sur l'accueil et trois pages internes -> toujours connecté, même page,
  **un seul** appel `/api/auth/refresh` par rechargement, aucune page publique
  ni « Se connecter » affichés même un instant ; déconnexion puis F5 -> reste
  déconnecté ; deux onglets rechargés ensemble cinq fois -> tous deux restent
  connectés ; aucune erreur de page, aucun 500.

## CI
Voir la PR.
