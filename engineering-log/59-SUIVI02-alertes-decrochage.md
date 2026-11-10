# US-SUIVI-02 — Alertes de décrochage automatiques

## En une phrase
Un balayage planifié examine chaque inscription en cours et crée une alerte
de décrochage par critère factuel vérifié — inactivité de plus de 7 jours,
deux échecs de QCM consécutifs, atelier non rendu 48 h après la date limite,
note en forte baisse — avec les faits et une suggestion d'action ; le
formateur affecté reçoit un email récapitulatif, voit un compteur, une page
d'alertes et des badges dans son suivi ; aucun apprenant sans critère n'est
signalé.

## Point de départ
US-SUIVI-01 calcule déjà l'inactivité (`etatRisque`) et sert le suivi.
DS-14 P2 décrit le cron, la table `alertes_decrochage` (apprenant, formateur,
type de risque, données factuelles, suggestion, statut « Nouvelle ») et la
notification. Le balayage des tentatives (US-QCM-07) fixe le modèle du
minuteur (setInterval, désactivé en test).

## Découpage
- **Base.** Migration `1787900000000-AddAlertesDecrochage` : types
  critère / statut, table `alertes_decrochage` (formation CASCADE, apprenant
  RESTRICT, faits `jsonb`, suggestion, dates, traitement pour US-SUIVI-03,
  CHECK de cohérence), index unique partiel `UQ_alertes_ouvertes`
  (formation, apprenant, critère) WHERE statut = 'OUVERTE', index (formation,
  statut). Entité `AlerteDecrochage`, enums `CritereAlerte`, `StatutAlerte`.
- **Configuration.** `alertes` : `ALERTES_BALAYAGE_ACTIF` (défaut vrai),
  `ALERTES_INTERVALLE_MINUTES` (5–1440, défaut 60), `ALERTES_EMAIL` (défaut
  vrai) ; validées par Joi, documentées dans `.env.example`.
- **API** (module `pilotage`) :
  - `alertes.regles.ts` (pur) : `echecsConsecutifs`, `scoreEnChute`,
    `ateliersEnRetard`, suggestions par critère ; l'inactivité réutilise
    `etatRisque` (même définition que le suivi).
  - `AlertesDecrochageService` : `detecter(maintenant)` (quatre lectures
    plates, agrégation par les règles), `balayer(maintenant)` (insertion
    idempotente, audit `ALERTE_DECROCHAGE_CREEE`, email récapitulatif par
    formateur), `lister`, `compteur`.
  - `AlertesBalayageService` : minuteur (`ALERTES_INTERVALLE_MINUTES`), jamais
    deux tours simultanés, erreur journalisée.
  - Routes `GET /formateur/alertes`, `GET /formateur/alertes/compteur`,
    `POST /admin/alertes/balayer` (`@Audit('ALERTES_BALAYAGE_DECLENCHE')`).
  - Suivi (US-SUIVI-01) : `alertes` (critères ouverts) par apprenant,
    `kpis.alertesOuvertes`, `alertes` de la fiche.
  - Email `sendAlertesDecrochageEmail` (faits seulement, lien vers la page).
- **Web.** Page `formateur/alertes` (filtre Ouvertes / Traitées / Toutes,
  carte : critère, apprenant, formation vers le suivi, faits, suggestion) ;
  bouton « Alertes de décrochage » avec compteur sur « Mes formations » ;
  badges par critère et carte « Alertes ouvertes » dans le suivi ; section
  « Alertes » de la fiche.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/formateur/alertes?statut&formationId` | FORMATEUR (ses formations), ADMINISTRATEUR (toutes) | 200 `[{ id, critere, statut, donnees, suggestion, dateCreation, dateTraitement, formation, apprenant }]` ; 400 statut inconnu, identifiant mal formé ; 401 ; 403 |
| GET | `/api/formateur/alertes/compteur` | idem | 200 `{ ouvertes }` ; 401 ; 403 |
| POST | `/api/admin/alertes/balayer` | ADMINISTRATEUR | 200 `{ creees }` ; 401 ; 403 ; audit `ALERTES_BALAYAGE_DECLENCHE` |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Critères | Factuels seulement (DS-14) : **inactivité** = inscription EN_COURS, plus de 7 jours sans connexion (référence : l'inscription si plus récente) ; **échecs QCM** = les 2 dernières tentatives notées de QCM publiés sont des échecs (les ateliers intercalés ne rompent pas la série) ; **livrable en retard** = atelier publié, date limite dépassée de plus de 48 h, aucun livrable, date limite postérieure à l'inscription ; **note en chute** = au moins 3 notes (QCM notés et ateliers corrigés), la dernière ≤ moyenne des précédentes − 20. |
| D2 | Pas de faux positif | Seules les inscriptions EN_COURS de formations non archivées et de comptes actifs ; une correction EN_COURS ou un QCM brouillon ne compte pas ; un inscrit récent n'est pas inactif ; un atelier échu avant l'inscription n'est pas attendu. |
| D3 | Idempotence et concurrence | Index unique partiel + `ON CONFLICT DO NOTHING` : au plus une alerte OUVERTE par (formation, apprenant, critère), même avec plusieurs balayages simultanés ou plusieurs instances. |
| D4 | Répit | Pas de nouvelle alerte d'un critère traité il y a moins de 7 jours (`JOURS_REPIT`) : le formateur n'est pas relancé chaque heure pour une situation qu'il suit. |
| D5 | Une alerte par critère | « Livrable en retard » regroupe les ateliers manquants dans ses faits (une seule alerte, pas une par atelier). |
| D6 | Pas d'auto-fermeture | Une alerte reste ouverte jusqu'à son traitement (US-SUIVI-03), même si le critère disparaît : la trace de l'intervention prime. |
| D7 | Notification | « Badge + email facultatif » (DS-14) : compteur dans l'interface ; un email récapitulatif par formateur affecté et par balayage (`ALERTES_EMAIL`), sans détail sensible ; un échec d'envoi n'annule rien. Pas de notification in-app persistée (écart déjà assumé aux Sprints 2–3). |
| D8 | Planification | `setInterval` dans le processus de l'API (pas de dépendance), désactivé en test ; balayage à la demande pour l'administrateur (démonstration, rattrapage). |
| D9 | Isolation | Liste et compteur filtrés en SQL sur `formation_formateurs` : un formateur ne voit jamais l'alerte d'une formation où il n'est pas affecté (liste vide, pas de 403 : la route n'expose aucune formation particulière). |
| D10 | Traçabilité | Audit par alerte créée (acteur système, cible = alerte, faits minimaux : formation, apprenant, critère). |

## Fichiers
- `apps/api/src/database/migrations/1787900000000-AddAlertesDecrochage.ts`, `entities/alerte-decrochage.entity.ts`, `enums/critere-alerte.enum.ts`, `enums/statut-alerte.enum.ts`
- `apps/api/src/config/configuration.ts`, `env.validation.ts` ; `.env.example`
- `apps/api/src/modules/pilotage/` : `alertes.regles.ts` (+ spec), `alertes-decrochage.service.ts` (+ spec, avec le minuteur), `alertes-balayage.service.ts`, `alertes.controller.ts`, `alertes.dto.ts`, `suivi-formation.service.ts` (+ spec), `pilotage.module.ts`
- `apps/api/src/mail/mail.service.ts` (+ spec)
- `apps/api/test/alertes-decrochage.e2e-spec.ts` (marqueur `E2E-SUIVI02`)
- `apps/web/src/app/formateur/alertes/page.tsx`, `formateur/formations/page.tsx`, `formateur/formations/[id]/suivi/page.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- Premier passage de mutations : 3 survivants (QCM non publiés, corrections
  non finalisées, notification sans alerte nouvelle) et 4 mutants non
  compilés (variable devenue inutilisée), réécrits. Données e2e ajoutées
  (QCM brouillon en échec pour l'apprenant modèle, second atelier en cours
  de correction), assertion « aucune requête de notification » et test
  « email désactivé » avec des formateurs : tous tués.
- Prettier sur `mail.service.ts` reformatait d'autres méthodes : fichier
  restauré, seule la nouvelle méthode ajoutée.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **84 suites / 1 210 tests**
  (+ 28 : règles d'alertes, service et minuteur, email, suivi), migration
  run + revert + run (**29 migrations**), e2e complet en série **46 suites /
  651 tests** (+ 1 ignoré), dont `E2E-SUIVI02` (9 tests : une alerte par
  critère — échecs, inactivité, chute, retard — avec les faits, aucune pour
  l'apprenant modèle, l'inscription suspendue, la formation archivée, le QCM
  brouillon, la correction en cours ; audit et email récapitulatif ;
  idempotence ; concurrence : 4 balayages simultanés -> 4 alertes et 4
  traces ; répit de 7 jours ; liste et compteur isolés par formateur,
  filtres, 400 / 401 / 403 ; balayage à la demande tracé ; badges et fiche
  du suivi). Le premier e2e complet a révélé l'attente de `kpis` du suivi
  (US-SUIVI-01) à compléter (`alertesOuvertes`) : corrigé, relancé, vert.
- Mutations : **21 / 21 tuées** (après renfort, voir « Incidents ») —
  formations archivées, inscriptions suspendues, QCM publiés, corrections
  finalisées, ateliers échus après l'inscription, répit (absent, infini),
  audit seulement à la création, notification seulement s'il y a du nouveau,
  option d'email, isolation de la liste et du compteur, réussite des QCM,
  ateliers hors série d'échecs, seuil et effectif de la chute, ordre
  chronologique, 48 h, livrables rendus, minuteur désactivé en test, un seul
  balayage à la fois.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, compte formateur de démonstration, alertes créées par le
  balayage sur la formation de démonstration) : page « Alertes de
  décrochage » (3 alertes : retard ×2, inactivité 12 jours, suggestions),
  bouton avec compteur « 3 » sur « Mes formations », badges dans le suivi ;
  pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-SUIVI-03 : traiter une alerte (action, « Traitée », réouverture,
  historique jamais écrasé, audit `ALERTE_TRAITEE`).
