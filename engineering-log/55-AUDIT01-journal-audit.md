# US-AUDIT-01 — Consulter le journal d'audit

## En une phrase
L'administrateur consulte le journal d'audit en lecture seule, filtré par
action (liste des actions présentes), email de l'acteur, cible, résultat et
période ; l'acteur s'affiche par son nom et son email, une période inversée
est refusée, l'export CSV suit les mêmes filtres, et des index gardent la
consultation rapide quand le journal grossit.

## Point de départ
US-AUTH-12 (Sprint 1) avait déjà livré l'essentiel : table `audit_logs`
immuable (déclencheur `trg_audit_logs_immutable`), `GET /admin/audit-logs`
(filtres action, userId, période ; pagination ; tri décroissant), export CSV
et une page d'administration. US-AUDIT-01 **complète** cet existant au lieu de
le refaire (D1).

## Découpage
- **Base.** Migration `1787800000000-AddIndexAuditLogs` (index seulement) :
  `IDX_audit_logs_horodatage` (horodatage DESC, id DESC),
  `IDX_audit_logs_action_horodatage` (action, horodatage DESC),
  `IDX_audit_logs_cible` (cible — servira aussi au compte des consultations
  publiques d'un certificat, US-DASH-02).
- **API.**
  - `AuditService` : une requête commune à la liste et à l'export
    (`requeteFiltree`), jointure `users` en liste blanche (id, email, prénom,
    nom, rôle) ; filtres `acteur` (email « contient », sans casse, jokers
    LIKE neutralisés par `echapperLike`), `cible` (exacte), `resultat` ;
    période contrôlée (`from` > `to` : 400, `MESSAGE_PERIODE_INVALIDE`) ; tri
    horodatage DESC puis id DESC (pages stables) ; `actions()` (actions
    distinctes, triées).
  - `AuditQueryDto` : `acteur`, `cible` (≤ 255), `resultat`
    (« Succès » | « Échec »).
  - `AuditController` : `GET /admin/audit-logs/actions`.
  - CSV : colonne `acteur_email` ajoutée après `acteur`.
- **Web.** `admin/audit` : liste déroulante des actions, filtres email de
  l'acteur, cible, résultat ; contrôle immédiat de la période (même message
  que l'API) ; colonne « Acteur » = nom + email (« Anonyme » sans acteur,
  identifiant si le compte n'existe plus) ; détails JSON repliables ;
  `lib/api` : `getAuditActions`, message de l'API affiché sur un 400.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/audit-logs?action&userId&acteur&cible&resultat&from&to&page&limit` | ADMINISTRATEUR | 200 `{ items[{ …, acteur }], total, page, limit }` (tracé `AUDIT_CONSULTE`) ; 400 (période inversée, résultat hors liste, saisie trop longue, UUID) ; 401 ; 403 |
| GET | `/api/admin/audit-logs/actions` | ADMINISTRATEUR | 200 `string[]` ; 401 ; 403 |
| GET | `/api/admin/audit-logs/export?…` (mêmes filtres) | ADMINISTRATEUR | 200 CSV (tracé `AUDIT_EXPORTE`) ; 400 ; 401 ; 403 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Existant | Compléter US-AUTH-12 (mêmes routes, même page) plutôt qu'un second module : une seule source de vérité. |
| D2 | Acteur | Recherche par **email** (« contient », sans casse) : l'administrateur ne connaît pas les UUID. `userId` exact reste accepté (compatibilité). `%`, `_` et `\` de la saisie sont des caractères, pas des jokers. |
| D3 | Affichage de l'acteur | Jointure en liste blanche (id, email, prénom, nom, rôle) : jamais le hash du mot de passe ni le secret MFA. Acteur absent (action anonyme, compte supprimé) : `acteur = null`. |
| D4 | Cible | Égalité exacte : la cible est un identifiant ; « commence par » renverrait d'autres ressources. |
| D5 | Période | `from` > `to` : 400 explicite (liste et export) ; bornes incluses ; `from` = `to` accepté. |
| D6 | Pagination | Par page (existant) avec tri secondaire par id : deux pages ne se recouvrent pas même à horodatage égal. Pas de curseur (volumes de l'institution). |
| D7 | Lecture seule | Aucune route PUT / PATCH / DELETE / POST (prouvé par l'e2e) ; le déclencheur reste la garantie en base. La liste des actions n'est pas tracée (métadonnée, appelée à chaque ouverture de page). |
| D8 | Index | Trois index, sans toucher aux données (table immuable). |

## Fichiers
- `apps/api/src/database/migrations/1787800000000-AddIndexAuditLogs.ts`
- `apps/api/src/modules/audit/{audit.service,audit.controller,audit-csv.util}.ts` (+ specs), `dto/audit-query.dto.ts`
- `apps/api/test/audit-journal.e2e-spec.ts` (marqueur `E2E-AUDIT01`), `test/audit.e2e-spec.ts` (en-tête CSV)
- `apps/web/src/app/admin/audit/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Prettier lancé sur tout le dossier `audit/` a reformaté des fichiers hors
  périmètre (intercepteur, module) : restaurés, seuls les fichiers de la
  story sont touchés.
- Première CI rouge : `npm run lint` impose `--max-warnings 0` ; trois
  types de retour manquaient dans les tests (avertissements lus comme
  bénins en local). Corrigé ; je lis désormais le code de sortie du lint,
  pas seulement le nombre d'erreurs.
- Deuxième CI rouge : la liste des actions était triée par le classement de
  la base ; en CI (en_US) « CERTIFICATION_DECLENCHEE » passe après
  « CERTIFICAT_EMIS » (le « _ » est ignoré), en local (C.UTF-8) avant.
  Tri imposé en octets : `SELECT DISTINCT action COLLATE "C" … ORDER BY 1` (un premier essai, `ORDER BY action COLLATE "C"`, est refusé par PostgreSQL avec DISTINCT : 500, vu par l’e2e local).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **77 suites / 1 135 tests**,
  migration run + revert + run (28 migrations), e2e **42 suites / 612 tests**
  (+ 1 ignoré : essai Anthropic réel sans clé), dont `E2E-AUDIT01`
  (20 tests : filtres acteur sans casse et jokers neutralisés, cible exacte,
  résultat + action + période combinés, bornes incluses, action anonyme,
  pagination sans recouvrement, 400 période inversée liste et export, 400
  résultat hors liste et saisie trop longue, liste des actions et RBAC,
  export CSV avec `acteur_email`, aucune route PUT / PATCH / DELETE / POST et
  ligne inchangée, concurrence : 8 consultations simultanées -> 8 traces).
- Mutations tuées (11 / 11 ; une 12ᵉ refusée par le typage : acteur sans
  email) : contrôle de période, ILIKE, échappement des jokers, cible exacte,
  filtre résultat, bornes `>=` et `<=`, liste des résultats admis, longueur
  maximale de l'acteur, `trim` de la cible.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px (Chromium, compte
  administrateur de démonstration) : 14 actions dans la liste déroulante,
  filtre « DEMO-IA-FORM » -> 7 lignes « Sami Ben Salah | email », détails
  repliables, période inversée refusée avec le message de l'API ; pas de
  défilement horizontal de la page (le tableau défile dans son cadre).

## CI
Voir la PR.

## Suites
- US-DASH-02 : compter les consultations publiques (`CERTIFICAT_- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **77 suites / 1 135 tests**,
  migration run + revert + run (28 migrations), e2e **42 suites / 612 tests**
  (+ 1 ignoré : essai Anthropic réel sans clé), dont `E2E-AUDIT01`
  (20 tests : filtres acteur sans casse et jokers neutralisés, cible exacte,
  résultat + action + période combinés, bornes incluses, action anonyme,
  pagination sans recouvrement, 400 période inversée liste et export, 400
  résultat hors liste et saisie trop longue, liste des actions et RBAC,
  export CSV avec `acteur_email`, aucune route PUT / PATCH / DELETE / POST et
  ligne inchangée, concurrence : 8 consultations simultanées -> 8 traces).
- Mutations tuées (11 / 11 ; une 12ᵉ refusée par le typage : acteur sans
  email) : contrôle de période, ILIKE, échappement des jokers, cible exacte,
  filtre résultat, bornes `>=` et `<=`, liste des résultats admis, longueur
  maximale de l'acteur, `trim` de la cible.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px (Chromium, compte
  administrateur de démonstration) : 14 actions dans la liste déroulante,
  filtre « DEMO-IA-FORM » -> 7 lignes « Sami Ben Salah | email », détails
  repliables, période inversée refusée avec le message de l'API ; pas de
  défilement horizontal de la page (le tableau défile dans son cadre).IE`)
  grâce à l'index sur `cible`.
