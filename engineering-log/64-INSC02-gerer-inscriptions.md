# US-INSC-02 — Gérer les inscriptions (administrateur, import CSV)

## En une phrase
L'administrateur gère les inscriptions d'une formation : il les liste,
inscrit un apprenant par son email, suspend une inscription avec un motif
(jamais de suppression), la réactive, ou importe un CSV d'adresses avec un
rapport ligne par ligne ; l'apprenant est prévenu par email.

## Point de départ
UC4 Administrateur, DS-08 P3, DS-11 P2 ; Sprint 4 § 3.2 : « suspendre
plutôt que supprimer ; ré-inscrire ; import CSV borné (taille, lignes) avec
rapport ligne par ligne ; notification ». Existant : l'inscription en
libre-service (US-INSC-01 : verrou de la formation, capacité hors
suspendues, email de bienvenue, une inscription SUSPENDUE bloque la
ré-inscription et « seul un administrateur peut la réactiver ») ; l'espace
apprenant refuse une inscription suspendue (US-INSC-04).

## Découpage
- **Migration** `1788200000000-AddSuspensionInscriptions` : `motif_suspension`
  (500), `date_suspension`, `suspendue_par` (SET NULL) ; CHECK « un motif
  n'existe que sur une inscription SUSPENDUE ».
- **Règles pures.** `admin/import-inscriptions.regles.ts` : lecture du fichier
  (une adresse par ligne, en-tête facultatif, `;` ou `,`, BOM, CRLF), bornes,
  validation d'email, résultats et libellés, bilan.
- **API.** `AdminInscriptionsService` (lister, inscrire, suspendre,
  réactiver, importer), `AdminInscriptionsController`, DTO ; email
  `sendStatutInscriptionEmail` (suspension / réactivation).
- **Web.** Lien « Inscriptions » dans la liste des formations ; page
  dédiée : places occupées, ajout par email, import CSV et rapport, liste
  filtrable, « Suspendre » (motif obligatoire) et « Réactiver ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/formations/:formationId/inscriptions?statut` | ADMINISTRATEUR | 200 ; 400 ; 401 ; 403 ; 404 |
| POST | `/api/admin/formations/:formationId/inscriptions` `{ email }` | ADMINISTRATEUR | 201 ; 400 email ; 404 formation ou compte ; 409 déjà inscrit, suspendu, pas apprenant, compte inactif, complet, formation non ouverte |
| POST | `/api/admin/formations/:formationId/inscriptions/import` (multipart `fichier`) | ADMINISTRATEUR | 200 rapport ; 400 sans fichier, vide, > 500 lignes, non UTF-8 ; 409 formation non ouverte ; 413 > 64 Ko |
| POST | `/api/admin/inscriptions/:inscriptionId/suspendre` `{ motif }` | ADMINISTRATEUR | 200 ; 400 motif ; 404 ; 409 déjà suspendue, terminée, formation archivée |
| POST | `/api/admin/inscriptions/:inscriptionId/reactiver` | ADMINISTRATEUR | 200 ; 404 ; 409 pas suspendue, complète, formation archivée |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Jamais de suppression | Suspendre conserve tout (avancement, tentatives, livrables, certificats) ; la réactivation rend l'accès. |
| D2 | Motif | Obligatoire (1 à 500 caractères, nettoyé), conservé avec la date et l'auteur, communiqué à l'apprenant ; effacé à la réactivation (gardé dans l'audit). |
| D3 | Capacité | Comptée hors inscriptions suspendues (règle d'US-INSC-01), sous VERROU de la formation pour l'ajout, la réactivation et l'import : 8 ajouts simultanés sur 3 places -> 3 réussis. |
| D4 | Ajout | Compte existant, rôle APPRENANT, statut ACTIF, email insensible à la casse ; formation OUVERTE (US-FORM-02 : plus d'inscription une fois fermée). |
| D5 | Import | 64 Ko et 500 lignes au plus ; une transaction, lignes traitées dans l'ordre ; une ligne refusée n'arrête pas l'import ; rapport : INSCRIT, DEJA_INSCRIT, INSCRIPTION_SUSPENDUE, COMPTE_INCONNU, PAS_APPRENANT, COMPTE_INACTIF, EMAIL_INVALIDE, DOUBLON, COMPLET. Pas de création de compte (gestion des comptes hors périmètre). |
| D6 | Concurrence | Suspension : `UPDATE … WHERE statut = 'EN_COURS'` -> 8 suspensions simultanées : une seule réussit, une trace. |
| D7 | Notifications | Email de bienvenue (existant) à l'ajout et à l'import ; email de suspension (avec motif) ou de réactivation ; au mieux, jamais bloquant. |
| D8 | Audit | `INSCRIPTION_AJOUTEE`, `INSCRIPTION_SUSPENDUE` (motif), `INSCRIPTION_REACTIVEE` (motif précédent), `INSCRIPTIONS_IMPORTEES` (total et bilan, une trace par import). |
| D9 | Formation archivée | Ses inscriptions ne changent plus (409), cohérent avec US-FORM-02. |

## Fichiers
- `apps/api/src/database/migrations/1788200000000-AddSuspensionInscriptions.ts`, `entities/inscription.entity.ts`
- `apps/api/src/modules/inscriptions/admin/` : `import-inscriptions.regles.ts`, `admin-inscriptions.service.ts`, `admin-inscriptions.controller.ts`, `admin-inscriptions.dto.ts` (+ specs) ; `inscriptions.module.ts`
- `apps/api/src/mail/mail.service.ts`
- `apps/api/test/admin-inscriptions.e2e-spec.ts` (marqueur `E2E-INSC02`)
- `apps/web/src/app/admin/formations/[id]/inscriptions/page.tsx`, `app/admin/formations/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Prettier sur `inscription.entity.ts` a replié un décorateur `@Check`
  existant : remis tel quel, seul le bloc ajouté reste.
- Jeu e2e « réactivation sur formation complète » : capacité de 4 au
  premier passage, une place restait libre ; ramenée à 3.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **94 suites / 1 295 tests**
  (+ 14 : lecture du fichier — en-tête, BOM, séparateurs, bornes, encodage —,
  validation d'email, bilan ; service — ajout sous verrou, refus traduits,
  formation non ouverte, suspension conditionnelle, réactivation sous la
  capacité, import ligne par ligne, email non bloquant), migration run +
  revert + run (**32 migrations**), e2e complet en série **51 suites /
  699 tests** (+ 1 ignoré), dont `E2E-INSC02` (10 tests : 401 / 403 formateur
  et apprenant / 404 ; 400 email, champ inconnu, filtre, identifiant ; ajout
  insensible à la casse et refus ; suspension motivée — accès à l'espace
  perdu, ré-inscription seule refusée, auteur enregistré — ; réactivation ;
  réactivation refusée sur formation complète ; import CSV et rapport ligne
  par ligne ; 400 / 413 / 409 de l'import ; concurrence : 8 ajouts simultanés
  sur 3 places -> 3 × 201, 5 × 409 ; 8 suspensions simultanées -> 1 × 200,
  7 × 409, une trace).
- Mutations : **16 / 16 tuées** — verrou de la formation, capacité (suspendues
  comptées, borne, décrément de l'import, réactivation), doublon, suspension
  conditionnelle, motif effacé, rôle et statut du compte, casse de l'email,
  formation non ouverte, bornes et en-tête de l'import, garde ADMINISTRATEUR,
  action d'audit.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, compte administrateur de démonstration, formation de
  démonstration) : places occupées, ajout par email, import CSV, liste
  filtrable avec « Suspendre » ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-INSC-03 : désinscription par l'apprenant (même statut SUSPENDUE,
  conséquences affichées, formateurs notifiés).
