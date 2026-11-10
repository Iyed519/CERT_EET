# US-IA-05 — Traçabilité des générations IA

## En une phrase
L'administrateur dispose d'un registre de toutes les générations de
questions par IA — qui, sur quel module et quel support, avec quel modèle et
quels paramètres, quand, avec quel résultat — et, pour chacune, de chaque
suggestion avec sa décision (auteur, date, motif), la question créée et son
origine IA conservée, et l'historique d'audit.

## Point de départ
Backlog E6, US-IA-05 (Should, 3 pts, stretch du Sprint 4) : « le système
enregistre formateur, module, modèle LLM, paramètres, date, et le statut
final de chaque suggestion ; une question acceptée conserve la mention de son
origine IA » ; « l'administrateur consulte l'historique complet des
générations et décisions ». L'enregistrement existait déjà (US-IA-02 à 04 :
`generations_ia`, `suggestions_questions_ia`, `questions.origine`, audits
`GENERATION_IA_*` et `SUGGESTION_*`) : il manquait la consultation.

## Découpage
- **Aucune migration.**
- **Module** `assistance-ia/tracabilite/` : règles pures (période, décompte,
  pagination, actions tracées), `TracabiliteGenerationsService` (SQL en
  lecture), contrôleur administrateur, DTO de filtres.
- **Web.** Onglet « Générations IA » de l'administration : filtres (statut,
  période), tableau paginé, fenêtre de détail (paramètres, résultat,
  suggestions et décisions, historique).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/generations-ia?formateurId&formationId&statut&du&au&page&limite` | ADMINISTRATEUR | 200 `{ total, page, limite, generations }` ; 400 filtre invalide, période inversée, limite > 100, paramètre inconnu ; 401 ; 403 |
| GET | `/api/admin/generations-ia/:generationId` | ADMINISTRATEUR | 200 génération + suggestions + historique ; 400 ; 404 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Source | Rien de neuf n'est écrit : le registre lit ce que le lancement, le pipeline et la révision ont déjà enregistré (paramètres figés au lancement, modèle, tentatives, erreur, décisions, question créée). |
| D2 | Origine IA | Lue sur la question elle-même (`IA` / `IA_MODIFIEE`), donc toujours celle de la base, même après des retouches d'explication. |
| D3 | Historique | Audit des actions `GENERATION_IA_*` et `SUGGESTION_*` visant la génération ou ses suggestions, dans l'ordre chronologique, avec l'acteur. |
| D4 | Accès | Administrateur seulement (le formateur voit déjà ses propres générations par module, US-IA-02). Lecture seule : aucune route d'écriture. |
| D5 | Pagination | 20 par page par défaut, 100 au plus ; plus récentes d'abord ; total renvoyé. |
| D6 | Période | Bornes incluses sur la date de lancement ; `du` après `au` -> 400. |

## Fichiers
- `apps/api/src/modules/assistance-ia/tracabilite/` : `tracabilite.regles.ts`, `tracabilite.dto.ts`, `tracabilite-generations.service.ts`, `tracabilite-generations.controller.ts` (+ specs) ; `assistance-ia.module.ts`
- `apps/api/test/tracabilite-generations.e2e-spec.ts` (marqueur `E2E-TRACEIA`, période réservée mars 2005)
- `apps/web/src/app/admin/generations-ia/page.tsx`, `app/admin/layout.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Premier passage e2e : le rejet d'une suggestion répond 200 (pas 201) ;
  attente corrigée. Un passage interrompu avait laissé des questions liées :
  le nettoyage supprime maintenant les QCM avant leurs questions.
- Deux mutants survivaient : borne basse de période ignorée (aucune
  génération plus ancienne dans la période testée) et « acceptées /
  modifiées confondues » (même nombre dans le jeu e2e). Ajout de tests sur
  chaque borne de période, et le second mutant est jugé par le test
  unitaire du décompte (qui distingue les deux) ; un mutant de borne haute
  a été ajouté.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **101 suites / 1 343 tests**
  (+ 8 : période, décompte, décalage ; filtres paramétrés, ordre, page,
  période inversée avant toute requête, 404, historique filtré), aucune
  migration (**32**), e2e complet en série **57 suites / 745 tests** (+ 1 ignoré), dont `E2E-TRACEIA`
  (6 tests : accès et validation ; registre de la période réservée ;
  filtres, bornes et pagination ; détail — décisions, questions et origine,
  historique ordonné — ; lecture seule ; concurrence : 8 lectures pendant une
  décision, chaque réponse cohérente).
- Mutations : **11 / 11 tuées** — filtres formateur, formation, statut,
  bornes basse et haute, ordre, décalage de page, période inversée,
  historique sans les décisions, décompte confondu, registre ouvert aux
  formateurs.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, administrateur de démonstration, une génération de démonstration
  posée en base locale) : onglet « Générations IA », filtres, tableau,
  fenêtre de détail (formateur, formation, support, modèle, paramètres,
  résultat, suggestions et décisions, historique) ; pas de défilement
  horizontal.

## CI
Voir la PR.

## Suites
- US-CERT-02 : échecs de génération des certificats.
