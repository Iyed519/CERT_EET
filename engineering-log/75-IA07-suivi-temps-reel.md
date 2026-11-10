# US-IA-07 — Suivi en temps réel de l'indexation et de la génération

## En une phrase
Pendant qu'un support s'indexe ou qu'une génération de questions tourne, la
page du module se met à jour en direct par un flux SSE (Server-Sent Events) :
l'état change à l'écran dès qu'il change en base, et le rafraîchissement
périodique existant reste le repli si le flux est coupé.

## Point de départ
Backlog E6, US-IA-07 (Could, 2 pts, stretch) : « suivre en temps réel
l'avancement de l'indexation et de la génération » (ADR-03 / ADR-06 : SSE,
repli REST). Existant : indexation (US-IA-01) et génération (US-IA-03)
asynchrones (BullMQ), vues REST `GET /supports/:id` et
`GET /generations/:id`, rafraîchissement toutes les quelques secondes dans
`SupportsModule`. nginx déjà réglé pour SSE (`proxy_buffering off`).

## Découpage
- **Aucune migration.**
- `assistance-ia/suivi/suivi.regles.ts` : états finaux, état envoyé (liste
  blanche : nature, identifiant, statut, tentatives, dernière erreur,
  résultat, final), comparaison.
- `suivi-temps-reel.service.ts` : `Observable` qui relit l'état toutes les
  secondes avec les MÊMES vues que l'API REST, envoie le premier état puis
  seulement les changements, se termine à l'état final ou après 10 minutes ;
  erreur de lecture -> fin du flux en erreur ; désabonnement -> plus aucune
  lecture.
- `suivi-temps-reel.controller.ts` : `@Sse` sur
  `supports/:supportId/evenements` et `generations/:generationId/evenements`,
  rôles FORMATEUR / ADMINISTRATEUR et garde `@FormateurDeLaFormation`.
- Web : `suivreEnDirect` (`lib/api.ts`, lecture du flux par `fetch` avec le
  jeton, car `EventSource` n'envoie pas d'en-tête `Authorization`) ;
  `SupportsModule` s'abonne aux traitements en cours et garde le
  rafraîchissement périodique en repli.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/supports/:supportId/evenements` | FORMATEUR affecté, ADMINISTRATEUR | 200 `text/event-stream` (événements `etat`) ; 401 ; 403 ; 404 |
| GET | `/api/generations/:generationId/evenements` | idem | idem |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Source de l'état | La BASE, relue toutes les secondes, et non un événement du worker : le flux fonctionne quelle que soit l'instance qui fait tourner le worker, et ne peut pas diverger de l'API REST (mêmes vues). |
| D2 | Premier état | Toujours envoyé : un client qui se (re)connecte n'a rien manqué ; un flux ouvert après la fin renvoie l'état final et se ferme. |
| D3 | Fin | À l'état final (INDEXE / ECHEC_INDEXATION ; TERMINEE / ECHEC) ou après 10 minutes (le client reprend alors par REST). Une seule émission finale par flux. |
| D4 | Données | Liste blanche : aucun contenu de support ni de suggestion dans le flux. |
| D5 | Authentification | `fetch` + lecture du corps en flux (jeton dans l'en-tête, refresh existant) plutôt qu'`EventSource` (pas d'en-tête possible ; pas de jeton dans l'URL). |
| D6 | Repli | Le rafraîchissement périodique existant n'est pas retiré : si le flux est coupé (proxy, réseau), l'écran reste juste. |
| D7 | Désabonnement | Onglet fermé ou flux abandonné : le minuteur est annulé et plus aucune lecture n'a lieu (vérifié en test). |

## Fichiers
- `apps/api/src/modules/assistance-ia/suivi/` : `suivi.regles.ts`, `suivi-temps-reel.service.ts`, `suivi-temps-reel.controller.ts`, `suivi-temps-reel.spec.ts` ; `assistance-ia.module.ts`
- `apps/api/test/suivi-temps-reel.e2e-spec.ts` (marqueur `E2E-SSE`)
- `apps/web/src/lib/api.ts`, `components/SupportsModule.tsx`

## Incidents
- Mutation « minuteur non annulé » d'abord survivante : le test tolérait une
  lecture de plus après le désabonnement. Le flux vérifie désormais l'arrêt
  AVANT de lire, et le test exige zéro lecture et un `clearTimeout`.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **105 suites / 1 372 tests** (+ 5 :
  règles ; premier état puis changements seulement, fin à l'état final ;
  durée maximale ; ressource disparue -> erreur ; désabonnement), aucune
  migration, e2e complet en série **62 suites / 768 tests** (+ 1 ignoré), dont `E2E-SSE` (3 tests : 401 /
  403 / 404 ; support indexé suivi jusqu'à INDEXE, flux tardif = état final,
  même état que l'API REST ; génération suivie jusqu'à TERMINEE par 5 flux
  simultanés, chacun recevant l'état final une seule fois).
- Mutations : **9 / 9 tuées** — fin à l'état final ignorée, dédoublonnage
  retiré, premier état non envoyé, INDEXE non final, TERMINEE non final,
  résultat absent, minuteur non annulé, garde de formation retirée, erreur de
  lecture avalée (un mutant réécrit : il ne compilait pas).
- Web : `tsc`, `next lint`, `next build`. Pile locale (API, Next, proxy
  comme nginx) : flux lu de bout en bout à travers le proxy (`curl -N` :
  événement `etat` INDEXE, `final: true`, puis fermeture) ; page du module du
  formateur 1280 / 390 px avec le nouveau support indexé ; pas de défilement
  horizontal, aucune erreur de page.

## CI
Voir la PR.

## Suites
- Sprint 4 terminé (engagé et stretch). Chantier interface (en-tête commun,
  accueil par rôle, catalogue en cartes).
