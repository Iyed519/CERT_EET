# US-DASH-01 — Tableau de bord global (administrateur)

## En une phrase
L'administrateur ouvre un tableau de bord qui agrège toute la plateforme sur
une période choisie (30 derniers jours par défaut) : utilisateurs par rôle et
statut, formations, inscriptions, évaluations (QCM et ateliers), certificats
(émis, révoqués, consultations publiques), activité quotidienne, activité
récente et alertes système ; une période sans données affiche des zéros.

## Point de départ
Toutes les données existent (Sprints 1 à 3) mais aucun écran ne les
rassemble. US-AUDIT-01 a posé les index du journal d'audit (horodatage,
action) ; US-DASH-02 la règle « lecture de supervision non tracée » (D6).

## Découpage
- **Base.** Rien de nouveau : les agrégats s'appuient sur les tables et index
  existants.
- **API** (nouveau module `pilotage`, réutilisé par US-SUIVI-01 et les
  rapports) :
  - `periode.regles.ts` (pur) : `resoudrePeriode(aujourdhui, du, au)` —
    jours calendaires inclus, défaut 30 jours, `du` seul = jusqu'à
    aujourd'hui, refus d'une date inexistante (2026-02-30), d'une période
    inversée ou de plus de 366 jours ; `aujourdhuiInstitution()` (Tunis) ;
    `taux`, `arrondi2`.
  - `TableauDeBordService.global(du, au)` : onze requêtes agrégées lancées
    en parallèle (une par bloc), bornes `[du 00:00, au + 1 00:00)` à Tunis
    calculées par PostgreSQL ; répartitions complétées à zéro pour toutes les
    valeurs d'énumération ; série quotidienne par `generate_series` (jours
    vides à zéro).
  - `GET /api/admin/tableau-de-bord?du&au` (`PeriodeQueryDto` : format
    `AAAA-MM-JJ`, paramètre inconnu refusé).
- **Web.** Onglet « Tableau de bord » en tête de l'administration (le lien
  « Administration » de l'en-tête y mène) : période (dates + raccourcis 7 j,
  30 j, 90 j, 1 an), alertes avec lien vers l'écran concerné, six cartes
  d'indicateurs, histogramme quotidien en CSS (connexions en foncé),
  activité récente et lien vers le journal d'audit.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/tableau-de-bord?du&au` | ADMINISTRATEUR | 200 `{ periode, utilisateurs, formations, inscriptions, evaluations: { qcm, ateliers }, certificats, activite[], activiteRecente[], alertes[] }` ; 400 date invalide, période inversée, > 366 jours, paramètre inconnu ; 401 ; 403 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Période | Jours calendaires inclus `du`–`au` (`AAAA-MM-JJ`), fuseau de l'institution (Africa/Tunis) : 23 h 30 UTC la veille compte pour le lendemain. 30 jours par défaut, 366 au plus (borne de coût). |
| D2 | « Sur la période » vs instantané | Nouveaux comptes, connexions (`derniere_connexion`), formations créées, inscriptions, tentatives notées (`date_fin`), livrables déposés, corrections finalisées, certificats émis (`date_generation`, statut ACTIF ou REVOQUE) et révoqués (`date_revocation`), consultations (`CERTIFICAT_VERIFIE`) : période. Répartitions par rôle / statut, tentatives en cours, livrables à corriger, alertes : état actuel. L'écran le dit. |
| D3 | Coût (NF1) | Une requête agrégée par bloc (`count(*) FILTER`, `avg`), en parallèle ; aucune ligne détaillée ne remonte, sauf les 10 derniers événements. |
| D4 | Utilisateurs par rôle | Les comptes anonymisés ne comptent dans aucun rôle (ils restent dans la répartition par statut). |
| D5 | Activité | Série quotidienne du journal d'audit : événements, connexions réussies (`LOGIN`, `CONNEXION_OAUTH`), échecs. Activité récente : action, date, résultat, acteur en liste blanche (email, prénom, nom) ; jamais l'adresse IP ni les détails. |
| D6 | Alertes système | Seulement les compteurs non nuls : certificats bloqués (en attente avec erreur), supports en échec d'indexation, générations IA en échec sur la période, demandes de rôle en attente, livrables en attente de correction depuis plus de 7 jours. Pas d'alerte « métier » (décrochage : US-SUIVI-02). |
| D7 | Moyennes | `null` (affiché « — ») quand il n'y a rien à moyenner, jamais 0 trompeur ; taux de réussite 0 sans tentative. |
| D8 | Lecture non tracée | Comme la supervision (US-DASH-02 D6) : consulter le tableau de bord n'écrit pas d'audit (prouvé en e2e). |

## Fichiers
- `apps/api/src/modules/pilotage/` : `periode.regles.ts` (+ spec), `periode.dto.ts`, `tableau-de-bord.service.ts` (+ spec), `tableau-de-bord-admin.controller.ts`, `pilotage.module.ts` ; `app.module.ts`
- `apps/api/test/tableau-de-bord.e2e-spec.ts` (marqueur `E2E-DASH01`)
- `apps/web/src/app/admin/tableau-de-bord/page.tsx`, `app/admin/layout.tsx`, `components/AdminNav.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Tests e2e : données datées
Les compteurs « sur la période » sont globaux : la suite écrit ses données en
**mars 2003** (aucune autre suite n'y écrit) et interroge cette période, ce
qui donne des attentes exactes (2 nouveaux comptes, 1 connexion, 2
inscriptions dont une à 0 h 30 heure de Tunis le 1er mars, 2 tentatives
notées à 50 % de réussite et 60 de moyenne, etc.). Les instantanés sont
vérifiés par écart (+1).

## Incidents
- Trois mutants survivants au premier passage (fin de période non décalée,
  « émis » compté sur la date de demande, série quotidienne en UTC) :
  données ajoutées (consultation le dernier jour, consultation à 23 h 30 UTC,
  certificat demandé en mars mais non généré), puis tués.
- Le test de concurrence échouait une fois sur six (`ECONNRESET`) : supertest
  ouvrait un port éphémère par requête. Le serveur de la suite écoute
  désormais une fois pour toutes (`app.listen(0)`).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **80 suites / 1 163 tests**
  (+ 21 : règles de période, service), aucune migration (28), e2e complet en
  série **44 suites / 633 tests** (+ 1 ignoré : essai Anthropic réel sans
  clé), dont `E2E-DASH01` (10 tests : 401 / 403 formateur et apprenant ; 400
  date inexistante, mal formée, période inversée, 367 jours, paramètre
  inconnu ; 366 jours acceptés ; défaut 30 jours finissant aujourd'hui à
  Tunis ; période vide à zéro ; mars 2003 exact sur chaque bloc ; bornes à
  23 h 30 UTC ; série quotidienne et activité récente sans adresse IP ;
  répartitions cohérentes ; alertes +1 ; concurrence : 8 lectures
  simultanées identiques, aucune trace écrite). Suite relancée 10 fois de
  suite : stable.
- Mutations tuées **17 / 17** (14 au premier passage, 3 après renfort des
  données) : fin de période exclusive, fuseau des bornes et de la série,
  connexions sur `derniere_connexion`, réussite `est_reussie`, moyenne
  bornée à la période, « émis » = généré, révocation sur `date_revocation`,
  action des consultations, résultat des connexions, certificat bloqué,
  comptes anonymisés, alertes à zéro masquées, 366 jours, période inversée,
  date normalisée, `du` dans le futur.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, compte administrateur de démonstration) : onglet « Tableau de
  bord » actif, six cartes, histogramme quotidien, activité récente,
  « Aucune alerte système » ; pas de défilement horizontal de la page ;
  aucune erreur de rendu.

## CI
Voir la PR.

## Suites
- US-SUIVI-01 : même module, même période, restreint aux formations du
  formateur.
- US-RPT-02 : rapport institutionnel = ces agrégats, exportés en asynchrone.
