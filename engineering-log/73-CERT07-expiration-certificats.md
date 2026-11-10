# US-CERT-07 — Expiration automatique des certificats

## En une phrase
Une formation peut fixer une durée de validité (en mois) à ses certificats :
la date d'expiration est fixée à l'émission, un balayage horaire fait passer
les certificats échus à l'état « Expiré », et la vérification publique le dit
— le document reste authentique et téléchargeable par son titulaire, mais il
n'est plus valide.

## Point de départ
Backlog E5, US-CERT-07 (Could, 2 pts, stretch) : « faire expirer
automatiquement les certificats échus afin de refléter leur cycle de vie »
(état *Certificat* : … -> ACTIF -> REVOQUE / EXPIRE). Sprint 4 § 2 : « demande
une date d'expiration (modèle) ». Existant : émission (US-CERT-01),
vérification publique (US-CERT-04), révocation et déclencheur d'immuabilité
(US-CERT-06).

## Découpage
- **Migration** `1788400000000-AddExpirationCertificats` : valeur `EXPIRE` du
  statut, `formations.duree_validite_mois` (1–120, facultative),
  `certificats.date_expiration`, index partiel des ACTIFS à échéance,
  déclencheur étendu (ACTIF -> REVOQUE ou EXPIRE ; REVOQUE et EXPIRE
  définitifs ; date d'expiration figée).
- **API** : émission avec date d'expiration ; `expirerEchus` +
  `ExpirationCertificatsService` (minuteur horaire) ; vérification publique
  (verdict `EXPIRE`, `dateExpiration`) ; téléchargement du titulaire permis ;
  champ `dureeValiditeMois` des formations (administrateur ; refusé au
  formateur comme réglage institutionnel) ; tableau de bord (statut compté).
- **Web** : libellés « Expiré » (supervision, mes certificats, mon espace,
  page publique), date « valable jusqu'au / expiré le », champ « Validité des
  certificats (mois) » dans la fiche formation de l'administration.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Source de la durée | Réglage de la FORMATION (institutionnel) ; vide = sans expiration (comportement d'avant inchangé). |
| D2 | Date figée | Calculée à la demande d'émission (`date_emission + durée`) et jamais modifiée : changer la durée d'une formation ne touche pas les certificats déjà émis (le déclencheur l'interdit). |
| D3 | Après expiration | Le PDF, l'empreinte et le lien public sont conservés ; la vérification publique affiche « Expiré » avec la date (verdict distinct de VALIDE, même intègre) ; le PDF public est refusé (comme pour un révoqué) ; le titulaire peut toujours télécharger son document. |
| D4 | Définitif | EXPIRE ne se révoque pas et ne revient pas à ACTIF (déclencheur) ; seules transitions depuis ACTIF : REVOQUE ou EXPIRE. |
| D5 | Balayage | `UPDATE … WHERE statut = 'ACTIF' AND date_expiration <= now()` (heure de PostgreSQL), conditionnel : 4 balayages simultanés -> une seule expiration tracée (`CERTIFICAT_EXPIRE`). Toutes les heures, désactivé en test. |
| D6 | Enum | `ADD VALUE IF NOT EXISTS 'EXPIRE'` : une valeur d'enum ne se retire pas ; `down()` rétablit le déclencheur et retire les colonnes, la valeur reste. |
| D7 | Email | Pas d'email au titulaire à l'expiration (le mémo ne le demande pas ; « Mes certificats » l'affiche). |

## Fichiers
- `apps/api/src/database/migrations/1788400000000-AddExpirationCertificats.ts`, `enums/statut-certificat.enum.ts`, `entities/certificat.entity.ts`, `entities/formation.entity.ts`
- `apps/api/src/modules/certificats/` : `certificat.regles.ts`, `certificats.service.ts`, `expiration-certificats.service.ts`, `verification.regles.ts`, `verification.service.ts`, `certificats.module.ts`, `expiration.spec.ts`
- `apps/api/src/modules/formations/` : `dto/create-formation.dto.ts`, `dto/contenu-pedagogique.dto.ts` (+ spec), `formations.service.ts` ; `modules/pilotage/tableau-de-bord.service.ts` (+ spec)
- `apps/api/test/expiration-certificats.e2e-spec.ts` (marqueur `E2E-CERTEXP`) ; `test/tableau-de-bord.e2e-spec.ts` (clé EXPIRE)
- `apps/web/src/app/admin/formations/page.tsx`, `app/mes-certificats/page.tsx`, `app/mes-inscriptions/[formationId]/page.tsx`, `app/verifier/[id]/page.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- Ajouter `EXPIRE` à l'enum rend incomplets les `Record<StatutCertificat, …>`
  du web : `tsc` les a tous signalés (5 fichiers), complétés.
- Le tableau de bord listait les statuts en dur : statut ajouté (sinon les
  certificats expirés n'auraient été comptés nulle part) ; e2e et unitaire mis
  à jour.
- Le formateur ne doit pas pouvoir régler la validité : champ ajouté à la
  liste des réglages institutionnels d'US-FORM-04 (spec : 9 champs).
- e2e complet : trois e2e existants (US-CERT-03, US-CERT-04, US-CERT-05)
  comparaient la réponse à la liste exacte des champs ; `dateExpiration` y a
  été ajouté (c'est voulu : la minimisation reste vérifiée champ par champ).
  Un `ECONNRESET` passager sur l'e2e du journal d'audit (8 requêtes
  simultanées sous charge) : suite relancée seule, verte.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **103 suites / 1 364 tests** (+ 3 :
  règles — émis, public, verdict, téléchargement — ; balayage conditionnel et
  audit ; bornes de la durée de validité), migration run + revert + run
  (**34 migrations**), e2e complet en série **59 suites / 756 tests** (+ 1 ignoré ; trois e2e existants corrigés puis relancés, voir Incidents), dont `E2E-CERTEXP`
  (6 tests : 400 hors bornes ; émission + 12 mois et sans expiration ;
  balayage — échu expiré, autres intacts, audit — ; vérification publique
  EXPIRE avec la date, PDF public 404, titulaire télécharge, révocation 409 ;
  déclencheur ; 4 balayages simultanés -> une expiration).
- Mutations : **9 / 9 tuées** — expiration non calculée, balayage sans
  condition de date, balayage sans condition de statut, action d'audit,
  verdict VALIDE pour un expiré, expiré absent de la vérification publique,
  téléchargement refusé, expiré non compté comme émis, borne de 120 mois.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, comptes de démonstration, un certificat expiré posé en base
  locale) : « Mes certificats » (badge « Expiré », « expiré le », PDF
  téléchargeable), supervision administrateur, page publique « Certificat
  expiré » avec la date, champ « Validité des certificats (mois) » dans la
  fiche formation ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-CERT-08 : réémission après révocation pour erreur.
