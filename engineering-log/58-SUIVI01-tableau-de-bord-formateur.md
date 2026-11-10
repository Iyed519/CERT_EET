# US-SUIVI-01 — Tableau de bord pédagogique (formateur)

## En une phrase
Le formateur affecté ouvre, depuis sa formation, un suivi pédagogique :
indicateurs (inscrits, actifs, inactifs depuis plus de 7 jours, terminés,
suspendus, taux de complétion, scores moyens, certifiés), histogramme des
moyennes, tableau des apprenants triable et filtrable avec un badge de risque,
et une fiche détaillée par apprenant (tentatives, livrables, certificat,
chronologie).

## Point de départ
Le module `pilotage` (US-DASH-01) existe ; le garde `@FormateurDeLaFormation`
(US-AUTH-16) refuse un formateur non affecté (403 + audit
`ACCES_RESSOURCE_REFUSE`). Les données sont là : inscriptions, tentatives
notées (`est_reussie`, immuables), livrables et corrections finalisées,
certificats. DS-14 P1 décrit l'écran et la fiche.

## Découpage
- **Base.** Rien de nouveau.
- **API** (module `pilotage`) :
  - `suivi.regles.ts` (pur) : `etatRisque` (inactif = inscription EN_COURS
    et plus de 7 jours sans connexion ; référence = dernière connexion, ou
    l'inscription si elle est plus récente ou s'il n'y a jamais eu de
    connexion), `avancement`, `moyenne`, `histogramme` (10 tranches, 100
    dans la dernière), `plusRecente`.
  - `SuiviFormationService.suivi(formationId)` : quatre lectures plates
    (inscrits + certificat, compteurs d'évaluations publiées et d'ateliers
    échus, meilleure tentative notée par QCM publié, livrables des ateliers
    publiés avec leur correction finalisée), agrégées en mémoire par les
    règles ; `fiche(formationId, apprenantId)` (404 si l'apprenant n'est pas
    inscrit à cette formation).
  - `SuiviFormateurController` : `GET /formateur/formations/:id/suivi` et
    `GET /formateur/formations/:id/apprenants/:apprenantId`, rôles FORMATEUR
    et ADMINISTRATEUR, `@FormateurDeLaFormation`.
- **Web.** Bouton « Suivi pédagogique des apprenants » sur la fiche de la
  formation ; page `formateur/formations/[id]/suivi` : trois cartes
  (apprenants, complétion, scores + histogramme), recherche, filtre (tous,
  inactifs, statuts), tri (nom, avancement, moyenne, dernière activité),
  tableau (jauge d'avancement, QCM, ateliers, moyenne, badge « Inactif ·
  N j »), modale « Fiche ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/formateur/formations/:formationId/suivi` | FORMATEUR affecté, ADMINISTRATEUR | 200 `{ formation, kpis, histogramme[10], apprenants[] }` ; 400 ; 401 ; 403 (+ audit) ; 404 |
| GET | `/api/formateur/formations/:formationId/apprenants/:apprenantId` | idem | 200 `{ apprenant, tentatives[], livrables[], certificat, chronologie[] }` ; 400 ; 401 ; 403 ; 404 formation inconnue ou apprenant non inscrit |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Isolation | Le garde par ressource existant ; aucune requête ne lit hors de la formation (toutes filtrent `formation_id = $1`). Un apprenant d'une autre formation : absent du tableau, 404 sur la fiche. |
| D2 | « Décrocheur » | Ici, un indicateur factuel unique : **inactif** = inscription EN_COURS sans connexion depuis plus de 7 jours (`JOURS_INACTIVITE`). Les autres critères (2 échecs consécutifs, retard > 48 h, score en chute) et les alertes persistées sont US-SUIVI-02. Un inscrit récent jamais connecté n'est pas signalé. |
| D3 | Évaluations comptées | Seulement les QCM et ateliers **publiés** (un brouillon n'est pas attendu de l'apprenant). La fiche liste toutes les tentatives, mais l'agrégat reste limité aux évaluations publiées. |
| D4 | Scores | QCM : meilleure tentative notée par QCM (la règle de certification) ; ateliers : note de la correction finalisée. Moyenne de l'apprenant = moyenne de ces notes ; `null` sans note. |
| D5 | Avancement | (QCM publiés réussis + ateliers publiés notés) / évaluations publiées, borné à 100 % ; taux de complétion = moyenne des avancements, suspendus exclus. |
| D6 | Ateliers non rendus | Ateliers publiés dont la date limite **plus la tolérance de retard** est passée, sans livrable de l'apprenant. |
| D7 | Fiche | Tentatives : date, durée, score, réussite, statut — jamais les réponses ni les bonnes réponses (US-QCM-06 / 09) ; livrables : version, retard, statut, note ; chronologie décroissante. |
| D8 | Tri et filtre | Côté navigateur (au plus la capacité de la formation en lignes). |
| D9 | Lecture non tracée | Comme les autres tableaux de bord ; seuls les refus sont tracés (garde). |

## Fichiers
- `apps/api/src/modules/pilotage/` : `suivi.regles.ts` (+ spec), `suivi-formation.service.ts` (+ spec), `suivi-formateur.controller.ts`, `pilotage.module.ts`
- `apps/api/test/suivi-formation.e2e-spec.ts` (marqueur `E2E-SUIVI01`)
- `apps/web/src/app/formateur/formations/[id]/suivi/page.tsx`, `formateur/formations/[id]/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Trois mutants survivants au premier passage : deux visés par des tests
  unitaires trop étroits (suspendus dans la complétion, certifiés de tout
  statut), tués par la suite e2e après l'ajout d'un certificat en attente ;
  le troisième (corrections non finalisées jointes) est **équivalent** : une
  correction EN_COURS n'a jamais de note (contrainte CHECK), elle ne change
  aucune moyenne.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **82 suites / 1 182 tests**
  (+ 19 : règles de suivi, service), aucune migration (28), e2e complet en
  série **45 suites / 642 tests** (+ 1 ignoré), dont `E2E-SUIVI01` (9
  tests : 401 ; 403 apprenant ; 403 formateur non affecté tracé deux fois
  `ACCES_RESSOURCE_REFUSE` ; formateur affecté et administrateur 200 ; 404
  formation inconnue ; 400 identifiants mal formés ; KPIs exacts, QCM
  brouillon ignoré, inscrit d'une autre formation absent ; lignes : avancement,
  QCM, ateliers rendus / notés / en retard / non rendus, moyenne, risque, tri
  par nom ; fiche : 4 tentatives sans bonne réponse, livrable, certificat,
  chronologie décroissante ; 404 apprenant non inscrit ; concurrence : 8
  lectures simultanées identiques, aucune trace écrite).
- Mutations : **16 / 16 tuées** + 1 équivalente (voir « Incidents ») —
  QCM non publiés, ateliers échus (tolérance), meilleure tentative, isolation
  de la formation, 404 de la fiche, suspendus exclus de la complétion, actifs
  sans inactifs, certifiés = ACTIF, ateliers non rendus, agrégat de la fiche
  limité aux publiés, ordre de la chronologie, seuil `> 7`, inactivité
  réservée à EN_COURS, référence de connexion, avancement borné, tranche 100.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, compte formateur de démonstration affecté à une formation de
  démonstration de 3 apprenants) : cartes, histogramme, badge « Inactif ·
  12 j », jauges, modale « Fiche » (tentatives, livrable, chronologie) ; pas
  de défilement horizontal de la page (le tableau défile dans son cadre).

## CI
Voir la PR.

## Suites
- US-SUIVI-02 : alertes de décrochage persistées (balayage planifié), badge
  dans ce tableau et dans la fiche.
- US-RPT-01 : export de ce suivi (CSV / PDF, asynchrone).
