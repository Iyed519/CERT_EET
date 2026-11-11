# US-DASH-03 — Tableau de bord global du formateur

## En une phrase
Le formateur arrive sur un tableau de bord qui couvre **toutes** ses
formations : statuts, inscrits et actifs, réussite et score moyen aux QCM,
tentatives et livrables à évaluer, alertes de décrochage, certificats
délivrés, activité quotidienne et une ligne par formation avec un lien vers
son suivi ; l'administrateur voit en permanence les demandes qui attendent
sa décision.

## Point de départ
- Le formateur n'avait qu'une liste de formations et un suivi **par**
  formation (US-SUIVI-01) : aucune vue d'ensemble, rien pour savoir où
  intervenir en premier.
- Le tableau de bord administrateur (US-DASH-01) montrait les demandes de rôle
  en attente seulement sous forme d'alerte, quand il y en avait.

## Découpage
- Api (`modules/pilotage`) :
  - `tableau-de-bord-formateur.regles.ts` (pur) : une ligne SQL -> une
    formation ; totaux sur toutes les formations à partir des **sommes**
    (score moyen pondéré, jamais une moyenne de moyennes) ;
  - `tableau-de-bord-formateur.service.ts` : **deux** requêtes, quel que soit
    le nombre de formations (une ligne agrégée par formation via des CTE ;
    activité quotidienne sur `generate_series`) ; périmètre unique :
    `formation_formateurs WHERE formateur_id = $3` ;
  - `GET /api/formateur/tableau-de-bord?du&au` (`@Roles(FORMATEUR)`), même
    période que US-DASH-01 (`PeriodeQueryDto`, `resoudrePeriode`) ;
  - tableau de bord administrateur : `demandesEnAttente.role` toujours
    présent (zéro compris).
- Web : `app/formateur/tableau-de-bord/page.tsx` (filtre de période et
  raccourcis, cartes d'indicateurs, graphique quotidien, tableau « Mes
  formations » avec lien « Suivi »), dans le style de `/admin/tableau-de-bord`
  (mêmes classes) ; entrée « Tableau de bord » en premier dans le menu du
  formateur ; page d'accueil du formateur = ce tableau de bord
  (`pageAccueilDuRole`, web et api) ; carte « Demandes en attente » sur le
  tableau de bord administrateur.

## Indicateurs
| Indicateur | Définition |
|---|---|
| Formations par statut | Formations où il est affecté (instantané). |
| Inscrits / actifs | Toutes les inscriptions / inscriptions `EN_COURS` (instantané) ; nouveaux inscrits sur la période. |
| Réussite, score moyen | Tentatives `NOTEE` terminées sur la période, QCM non brouillons (comme US-SUIVI-01). |
| Tentatives à évaluer | `SOUMISE` ou `ABANDONNEE_TIMER` (pas encore notées). |
| Livrables à évaluer | `SOUMIS` ou `EN_CORRECTION`. |
| Alertes | Alertes de décrochage `OUVERTE`. |
| Certificats délivrés | Générés sur la période (`ACTIF`, `EXPIRE` ou `REVOQUE` depuis). |
| Activité | Par jour (Tunis) : tentatives notées et livrables déposés. |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Périmètre | La seule source est `formation_formateurs` ($3 = le formateur connecté, jamais un paramètre) ; une formation co-animée apparaît chez chacun de ses formateurs. Administrateur : 403 (il a son propre tableau de bord). |
| D2 | Pas de N+1 | Deux requêtes SQL constantes ; prouvé en e2e en ajoutant une formation (le nombre de requêtes ne bouge pas). |
| D3 | Totaux | Calculés en mémoire à partir des sommes par formation (règles pures, testées) : un seul aller-retour pour le tableau ET les cartes. |
| D4 | Certificats délivrés | Statuts `ACTIF`, `EXPIRE`, `REVOQUE` : un certificat expiré ou révoqué depuis a bien été délivré pendant la période. |
| D5 | Boutons « Demander une formation » / « Proposer une formation » | Ajoutés avec US-FORM-07 et US-FORM-08 : leurs pages n'existent pas encore, un bouton ici serait un lien mort. Même règle pour les compteurs d'affectation et de propositions de l'administrateur. |
| D6 | Lecture seule | Non tracée dans le journal d'audit (comme US-DASH-01 et la supervision). |

## Fichiers
- `apps/api/src/modules/pilotage/tableau-de-bord-formateur.{regles,service,controller}.ts`, `tableau-de-bord-formateur.spec.ts`, `pilotage.module.ts`, `tableau-de-bord.service.ts`
- `apps/api/src/common/navigation/page-accueil-role.ts` (+ spec), `mail/mail.service.spec.ts`
- `apps/api/test/tableau-de-bord-formateur.e2e-spec.ts` (nouveau, `E2E-DASH03`)
- `apps/web/src/app/formateur/tableau-de-bord/page.tsx` (nouveau), `app/admin/tableau-de-bord/page.tsx`, `components/navigation.ts`, `lib/api.ts`, `lib/format.ts`

## Incidents
- Contraintes des fixtures (alerte traitée : date de traitement ; certificat
  révoqué : motif, auteur et description) : l'e2e utilise un certificat
  expiré pour la donnée hors période.
- La pile locale atteignait la limite de connexions (30 / min) pendant les
  scénarios navigateur répétés : limite relevée **dans la pile de recette
  locale seulement** (`LIMITE_CONNEXION`), la valeur du dépôt ne change pas.

## Vérification
- Api : lint 0 avertissement, `tsc`, unitaires **115 suites / 1 457 tests**
  (+ 6), e2e complet en série **70 suites / 823 tests** (+ 1 ignoré), dont
  `E2E-DASH03` (8 tests : accès ; chiffres exacts du formateur 1 ; formation
  co-animée vue par le formateur 2 ; période large, période vide, 400 ×4 ;
  formateur sans formation ; deux requêtes quel que soit le nombre de
  formations ; 10 lectures simultanées identiques ; compteur administrateur).
- Mutations : **13 / 13 tuées** — périmètre ouvert, actifs mal définis,
  tentatives hors période, réussite sans `est_reussie`, abandons non comptés,
  QCM brouillons comptés, livrables en correction oubliés, alertes traitées
  comptées, certificats hors période, moyenne de moyennes, tri, administrateur
  admis, activité hors périmètre.
- Web : `tsc`, `next lint`, `next build`.
- Navigateur (pile locale derrière nginx), 1280 et 390 px : tableau de bord
  du formateur (cartes, graphique, tableau avec défilement dans son cadre),
  tableau de bord administrateur (carte « Demandes en attente »), page « Mes
  formations » ; scénarios US-NAV-01 (page du formateur = tableau de bord) et
  US-AUTH-17 rejoués : verts ; pas de défilement horizontal, aucune erreur.

## CI
Voir la PR.
