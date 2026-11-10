# US-INSC-03 — Se désinscrire

## En une phrase
L'apprenant quitte une formation depuis « Mes inscriptions » : il voit d'abord
les conséquences (accès retiré, évaluations en cours, certificats conservés),
confirme, et son inscription passe SUSPENDUE — jamais supprimée — ; les
formateurs affectés sont prévenus par email.

## Point de départ
UC1 Apprenant, DS-11 P1 ; Sprint 4 § 3.2 : « conséquences affichées,
confirmation ; SUSPENDUE ; certificats conservés ; formateurs notifiés ».
Critère d'erreur du Backlog : « une inscription qui n'appartient pas à cet
apprenant -> refus (inscription non trouvée pour cet utilisateur) ».
Existant : US-INSC-02 (colonnes de suspension, réactivation par
l'administrateur), US-INSC-04 (espace refusé à une inscription suspendue),
US-INSC-01 (une inscription suspendue bloque la ré-inscription seule).

## Découpage
- **Aucune migration** (colonnes d'US-INSC-02).
- **API** (module `inscriptions`) : `DesinscriptionService` — `consequences`,
  `desinscrire` ; deux routes ajoutées au contrôleur apprenant ; DTO de
  confirmation ; email `sendDesinscriptionFormateurEmail`.
- **Web.** Colonne d'action « Se désinscrire » dans « Mes inscriptions » ;
  fenêtre : conséquences, case « j'ai compris », bouton « Me désinscrire ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/formations/:formationId/desinscription` | APPRENANT (le sien) | 200 conséquences ; 400 ; 401 ; 403 ; 404 pas inscrit |
| POST | `/api/formations/:formationId/desinscription` `{ confirmer: true }` | APPRENANT (le sien) | 200 SUSPENDUE ; 400 confirmation absente ou fausse, champ inconnu ; 401 ; 403 ; 404 ; 409 déjà suspendue ou terminée |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Identité | L'apprenant est celui du jeton ; aucune route ne prend d'identifiant d'inscription : on ne peut viser que SA ligne (404 sinon, comme le demande le Backlog). |
| D2 | Effet | SUSPENDUE avec le motif « Désinscription à la demande de l'apprenant », auteur = l'apprenant ; rien n'est supprimé. |
| D3 | Retour | Pas de ré-inscription seule : seul un administrateur réactive (règles d'US-INSC-01 / US-INSC-02) — évite d'utiliser la désinscription pour remettre à zéro des compteurs. |
| D4 | Évaluations en cours | Annoncées dans les conséquences ; une tentative EN_COURS sera close à l'échéance par le balayage existant ; les livrables restent en base. |
| D5 | Certificats | Jamais touchés : la vérification publique reste VALIDE (e2e). |
| D6 | Confirmation | `confirmer: true` exigé (`@Equals(true)`) ; l'écran exige en plus de cocher « j'ai compris ». |
| D7 | Concurrence | `UPDATE … WHERE statut = 'EN_COURS'` : 8 demandes simultanées -> 1 succès, 7 × 409, une trace. |
| D8 | Notifications | Email à chaque formateur affecté actif (au mieux, un échec n'arrête ni la désinscription ni les autres envois) ; audit `INSCRIPTION_DESINSCRITE` (avant, après, évaluations en cours, certificats conservés). |

## Fichiers
- `apps/api/src/modules/inscriptions/desinscription/desinscription.service.ts`, `desinscription.dto.ts` (+ spec) ; `inscriptions.controller.ts`, `inscriptions.module.ts`
- `apps/api/src/mail/mail.service.ts` (+ spec : aussi l'email d'US-INSC-02, sans test dédié jusqu'ici)
- `apps/api/test/desinscription.e2e-spec.ts` (marqueur `E2E-INSC03`)
- `apps/web/src/app/mes-inscriptions/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- La première écriture des routes a été interrompue en cours d'exécution
  (pause demandée) puis commitée telle quelle ; reprise : `tsc`, lint et
  Prettier vérifiés avant de poursuivre (un seul fichier à reformater, sans
  ligne hors périmètre).
- L'email de suspension / réactivation d'US-INSC-02 n'avait pas de test
  unitaire : ajouté ici plutôt que de relancer la CI de la PR #77.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **95 suites / 1 304 tests**
  (+ 9 : conséquences, 404 filtré par l'apprenant, UPDATE conditionnel,
  motif et auteur, 409 sans trace, notifications non bloquantes ; emails de
  désinscription et de suspension / réactivation), aucune migration (**32**),
  e2e complet en série **52 suites / 705 tests** (+ 1 ignoré), dont
  `E2E-INSC03` (6 tests : 401 / 403 formateur / 404 pas inscrit / 400 ;
  400 confirmation absente, fausse, champ inconnu ; conséquences avec
  tentative en cours et certificat conservé ; désinscription — SUSPENDUE,
  motif et auteur, espace refusé, ré-inscription seule refusée, certificat
  VALIDE, autre apprenant intact, audit — ; 409 en double puis réactivation
  par l'administrateur ; concurrence : 8 désinscriptions simultanées ->
  1 × 200, 7 × 409, une trace). Le premier e2e complet a tourné pendant
  qu'un import temporaire (préparation d'un mutant) était présent dans le
  DTO ; retiré, `tsc` + lint + e2e complet relancés sur le code final : verts.
- Mutations : **10 / 10 tuées** — statut conditionnel, auteur, filtre
  apprenant, statut des certificats et des tentatives, « possible »,
  confirmation contournée, action d'audit, notification des formateurs,
  motif. Un premier mutant de la confirmation (règle placée dans un groupe)
  s'est révélé équivalent — class-validator applique aussi les règles
  groupées quand aucun groupe n'est demandé — et a été remplacé.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, apprenant de démonstration) : « Se désinscrire », conséquences
  (livrable en attente annoncé), bouton désactivé tant que la case n'est pas
  cochée ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-FORM-04 : contenu pédagogique géré par le formateur.
