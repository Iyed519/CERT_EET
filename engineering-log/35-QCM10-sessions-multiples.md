# US-QCM-10 — Bloquer les sessions multiples

## En une phrase
Quand le formateur a coché « Bloquer les sessions multiples », une tentative
EN_COURS n'est utilisable que depuis la session (la connexion) qui l'a
démarrée : un second appareil reçoit un 409 `session_active_ailleurs` au
démarrage, à la lecture, à chaque réponse et à la soumission, et chaque refus
est tracé ; le verrou tombe quand la session détentrice se termine
(déconnexion, révocation) ou à l'échéance de la tentative.

## Découpage
- **A — API.** Claim `sid` dans l'access token ; colonne
  `tentatives_qcm.session_id` (migration) ; règles pures
  (`tentative-session.regles.ts`) ; `TentativeSessionService` (contrôle sous
  verrou, adoption, miroir Redis, refus audité) ; contrôle dans le
  démarrage, la consultation, la réponse et la soumission ; Swagger ; tests
  unitaires et e2e.
- **B — UI.** Page de la tentative (« Évaluation ouverte sur un autre
  appareil »), modale de démarrage, paramètres du formateur (case sortie de
  « Bientôt actif »).
- **C — Journal + PR.**

Une migration (`1786200000000-AddTentativeSessionId`), aucune dépendance
ajoutée. La partie « limites tentatives / délai » de la story est livrée
depuis US-QCM-05 (409 `tentatives_epuisees`, `delai_non_respecte`, date de
réouverture affichée) : rien à ajouter (D1).

## Endpoints
Aucune nouvelle route. Quatre routes gagnent un refus :

| Méthode | Route | Ajout |
|---|---|---|
| POST | `/qcm/:qcmId/tentatives` | reprise refusée : 409 `{ message, raison: 'session_active_ailleurs' }` |
| GET | `/tentatives/:tentativeId` | idem pendant le temps de passage (une tentative terminée reste consultable de partout) |
| PUT | `/tentatives/:tentativeId/reponses/:questionId` | idem |
| POST | `/tentatives/:tentativeId/soumettre` | idem |

Message : « Vous passez déjà ce QCM sur un autre appareil. » Audit
`SESSION_MULTIPLE_REFUSEE` (acteur = apprenant, cible = tentative, détails :
`qcmId`, `raison`, `route`). `POST /auth/login`, `/auth/refresh`, OAuth et
MFA : l'access token porte désormais `sid`.

## Flux
1. Connexion (mot de passe, MFA ou OAuth) : une famille de refresh token est
   créée ; son identifiant part dans l'access token (`sid`). Le refresh garde
   la famille, donc le même `sid` ; la déconnexion la termine.
2. Démarrage : sous le verrou de l'inscription, la tentative créée reçoit
   `session_id = sid` (même blocage désactivé). Miroir Redis
   `session_qcm:{apprenantId}:{qcmId}` = `sid`, `PXAT` = échéance.
3. Appareil 2 (autre connexion) : la route verrouille (inscription au
   démarrage, ligne de la tentative ailleurs), puis
   `evaluerSession` : même session ou blocage désactivé → autorisé ;
   tentative sans session (créée avant US-QCM-10) → adoptée ; autre session
   → `sessionOuverte` lit `refresh_tokens` (famille active et non expirée,
   `clock_timestamp()`) : ouverte → refus ; terminée → adoptée
   (`session_id` réécrit dans la transaction, miroir reposé).
4. Refus : renvoyé par la transaction, levé après le COMMIT (D5) ; audit puis
   409. Dans la réponse et la soumission, l'échéance passe avant la session :
   une clôture à l'échéance reste validée (409 `temps_ecoule`).
5. Clôture (soumission, échéance, balayage) : miroir Redis supprimé.

## Décisions
Tableau D du handoff appliqué tel quel (recommandations, D6 compris).
- **D2 — Session = famille du refresh token (`sid`).** Stable pendant la
  rotation de 15 min, terminée à la déconnexion. Un identifiant d'appareil
  envoyé par le navigateur se falsifie ; IP et User-Agent ne sont pas
  fiables. Jeton émis avant le déploiement (sans `sid`) : son `jti` tient
  lieu de session ; il n'a pas de famille, donc il est vu comme terminé et la
  session suivante adopte la tentative — pas de blocage de l'apprenant
  lui-même au déploiement.
- **D3 — `session_id` en base, Redis en miroir (écart avec le Backlog :
  « Redis »).** PostgreSQL décide, comme pour l'échéance (US-QCM-07, D1).
  Colonne `uuid` nullable, sans clé étrangère (un `jti` n'a pas de ligne).
- **D4 — Quatre routes contrôlées**, pas `GET …/correction` (tentative
  close).
- **D5 — 409** (écart avec DS-02 v1.0 : 403), cohérent avec les autres refus
  d'état.
- **D6 — Appareil perdu : le verrou tombe avec la session** (déconnexion,
  famille révoquée par rejeu, changement de rôle, compte désactivé), sinon à
  l'échéance. Pas de bouton « continuer ici » ; déblocage par le formateur →
  perspective.
- **D7 — Blocage désactivé :** comportement inchangé ; `session_id` quand
  même enregistré à la création (utile à US-QCM-11).
- **D8 — Audit `SESSION_MULTIPLE_REFUSEE`** à chaque refus (preuve de
  fraude), « au mieux » : une panne d'audit n'empêche pas le 409.
- **Ajout — Ordre du refresh.** Le nouveau refresh token est enregistré
  AVANT de brûler l'ancien : sinon la famille aurait zéro jeton actif un
  instant, et une session vivante paraîtrait terminée (adoption à tort).
- **Ajout — Contrôle à la consultation seulement si la session diffère** et
  que le blocage est actif : le cas courant reste une lecture sans
  transaction.

## Fichiers
- `apps/api/src/modules/auth/` : `auth.service.ts` (`sid`, ordre du
  refresh), `auth.types.ts` (`sid?`)
- `apps/api/src/database/` : `entities/tentative-qcm.entity.ts`
  (`sessionId`), `migrations/1786200000000-AddTentativeSessionId.ts`
  (nouveau)
- `apps/api/src/modules/tentatives/` : `tentative-session.regles.ts`,
  `tentative-session.service.ts` et leurs specs (nouveaux) ;
  `tentative-demarrage.service.ts`, `tentative-consultation.service.ts`,
  `tentative-passage.service.ts`, `tentative-balayage.service.ts` (+ specs) ;
  `tentatives.controller.ts` (session transmise, Swagger 409) ;
  `tentatives.module.ts`
- `apps/api/test/tentative-session.e2e-spec.ts` (nouveau, marqueur
  `E2E-SESSION`)
- `apps/web/src/app/tentatives/[id]/page.tsx` (vue « autre appareil »,
  arrêt des enregistrements) ; `components/DemarrageTentative.tsx`
  (conseil) ; `components/ConfigurationModal.tsx` (case dans « Tentatives ») ;
  `lib/api.ts` (`session_active_ailleurs`, `sessionAilleurs`,
  `CONSEIL_SESSION_AILLEURS`, `getTentative` lit le motif) ;
  `app/globals.css` (`carte-ailleurs`)

## Incidents
- **Pas d'accès GitHub dans la session** : repli sur l'ancien mode (fichiers
  écrits dans le dépôt local, git et Docker lancés par moi).
- **Contrôle de navigateur : nouvelle connexion bloquée au chargement.** Le
  premier script laissait sa session ouverte (pas de déconnexion) : le
  second navigateur, nouvelle session, a été refusé — comportement attendu.
  Libéré en base (`session_id = NULL`, adoption) pour tester le refus en
  cours de passage.
- **Libellé ambigu corrigé** : « Terminez-la sur cet appareil » se lisait
  « sur celui-ci » ; remplacé par « sur l'autre appareil ».

## Vérification
- **Lint** : propre. **Tests unitaires** : 38 suites, 502 tests (+2 suites,
  +34) — règles (même session, autre session, blocage désactivé, tentative
  sans session, session détentrice ouverte / terminée, jeton sans `sid`,
  clé Redis) ; service (pas de requête si même session, refus sans écriture,
  adoption écrite, requête `refresh_tokens`, miroir `PXAT`, panne Redis
  silencieuse, audit puis 409, audit en panne) ; démarrage (contrôle sous
  verrou avec le paramètre du QCM, refus sans création, adoption, course
  23505 relue sous verrou), consultation, passage (sauvegarde et
  soumission refusées sans écriture, échéance avant session), balayage
  (miroir supprimé).
- **e2e** : 22 suites, 281 tests, dont `tentative-session` (8) — `sid`
  présent, conservé au refresh, propre à chaque connexion ; appareil 1
  démarre (`session_id`, miroir Redis ≤ 30 min) ; appareil 2 : démarrer,
  consulter, répondre, soumettre → 409 et 4 audits, tentative intacte ;
  appareil 1 continue après un refresh, soumet (NOTEE), miroir supprimé ;
  tentative terminée lisible de l'appareil 2 ; déconnexion de l'appareil 1 →
  l'appareil 2 reprend et détient, un appareil 3 est refusé ; blocage
  désactivé → les deux passent ; **course** : deux sessions démarrent
  ensemble (table verrouillée ~1 s) → une tentative, un 201 et un 409.
- **Mutations** (chaque protection retirée, la suite échoue) : sans contrôle
  au démarrage → 3 échecs (dont la course) ; session toujours « ouverte » →
  la reprise après déconnexion échoue ; sans contrôle dans le passage → 1
  échec ; sans contrôle à la consultation → 2 échecs ; `sid` non conservé au
  refresh → 3 échecs.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; dans Chromium,
  1280 px et 390 px : modale « Démarrer » refusée (message + conseil) ;
  page de la tentative bloquée au chargement et en cours de passage (clic
  sur une option) ; reprise après déconnexion de l'autre appareil ;
  paramètres du formateur (case dans « Tentatives ») ; aucun débordement
  horizontal.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart web
# attendre ~30 s et ouvrir une page avant tsc
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : la migration passe par
`migration:run`, la nouvelle suite e2e s'ajoute aux autres. Front hors CI
(action 2 de la rétrospective).

## Suites
- Documents à aligner : Backlog v1.8 (verrou en base, Redis en miroir ;
  409) ; DS-02 étape 1 (409 au lieu de 403, quatre routes, libération à la
  déconnexion).
- Perspectives : déblocage d'une tentative par le formateur ; afficher la
  session dans l'historique (US-QCM-11).
- Sprint 3 : US-ATEL-01 ensuite.
