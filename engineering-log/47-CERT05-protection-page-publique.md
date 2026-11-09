# US-CERT-05 — Protection et minimisation de la page publique

## En une phrase
La vérification publique est limitée à 20 requêtes par minute et par adresse
IP (compteur Redis à fenêtre fixe, 429 + Retry-After, premier refus tracé),
l'IP est enfin celle du visiteur derrière nginx (« trust proxy »), les
réponses et la page ne sont jamais indexées, mises en cache ni accompagnées
d'un référent, et la réponse ne porte que la liste blanche prévue par DS-05.

## Découpage
- **API.** `RedisService.incrementer` (INCR + EXPIRE NX + TTL en une
  transaction) ; `LimiteDebitGuard` + règles `limite-debit.regles.ts` sur
  `VerificationController` ; en-têtes `Cache-Control: no-store`,
  `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` ;
  `main.ts` : `app.set('trust proxy', TRUST_PROXY)` ; configuration
  `VERIFICATION_LIMITE_PAR_MINUTE` (20), `TRUST_PROXY`
  (`loopback, uniquelocal`).
- **Web.** `app/verifier/layout.tsx` (méta `robots` noindex/nofollow/nocache,
  `referrer` no-referrer, titre) ; message du 429 affiché sur la page.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Algorithme | Fenêtre fixe d'une minute par IP (DS-05 : INCR, TTL 60 s), commune aux deux routes publiques. |
| D2 | IP derrière nginx | `trust proxy` limité aux réseaux privés et à la boucle locale (le conteneur nginx) : X-Forwarded-For d'Internet n'est jamais cru tel quel. Seul nginx publie des ports. Corrige aussi l'IP de tous les audits. |
| D3 | Redis injoignable | La vérification reste ouverte (disponibilité NF2), incident journalisé. |
| D4 | Audit | Seul le premier refus de chaque fenêtre est tracé (`VERIFICATION_LIMITE_ATTEINTE`) : pas de flot d'audit pendant une attaque. |
| D5 | Énumération | Déjà uniforme depuis US-CERT-04 (même 404) ; identifiant UUID v4 (122 bits) : pas d'égalisation du temps de réponse, la recherche à l'aveugle n'est pas réaliste. |
| D6 | Minimisation | Réponse limitée à dix champs (titulaire prénom + nom, formation, organisme, date, mention, score, empreinte, verdict, intégrité, identifiant) ; vérifié champ par champ par l'e2e. |
| D7 | En-têtes sur les erreurs | Posés sur les réponses 200 ; une 404 ou une 429 ne contient aucune donnée personnelle. |

## Fichiers
- `apps/api/src/redis/redis.service.ts` (+ spec, nouvelle), `src/main.ts`, `src/config/{configuration,env.validation}.ts`, `.env.example`
- `apps/api/src/modules/certificats/{limite-debit.guard,limite-debit.regles,verification.controller,certificats.module}.ts` (+ specs)
- `apps/api/test/verification-protection.e2e-spec.ts` (marqueur `E2E-PROTECT`), `test/verification.e2e-spec.ts` (remise à zéro de ses compteurs)
- `apps/web/src/app/verifier/layout.tsx`, `lib/api.ts`

## Incidents
- Prettier avait reformaté des lignes étrangères à la story dans
  `env.validation.ts`, `configuration.ts` et `main.ts` : fichiers restaurés,
  seules mes lignes réappliquées.

## Vérification
- API : lint 0, `tsc`, unitaires **60 suites / 816 tests**, migration revert + run, e2e **34 suites / 453 tests** (en série).
- Mutations tuées (6) : garde posé sur le contrôleur, seuil (> et non ≥),
  audit du premier refus seulement, Retry-After, en-tête no-store ; en
  unitaire : EXPIRE NX (fenêtre fixe, non glissante).
- Démarrage réel (`node dist/main.js`, limite 3) avec X-Forwarded-For :
  200 200 200 429, une autre IP passe, l'audit porte l'IP du visiteur.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : méta robots et
  referrer présentes, message du 429 affiché ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-CERT-06 : révocation (motif public, date) — étendre le déclencheur
  d'immuabilité et la page publique.
