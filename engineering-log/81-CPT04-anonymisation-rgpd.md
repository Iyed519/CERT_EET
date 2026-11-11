# US-CPT-04 — Anonymisation RGPD d'un compte

## En une phrase
L'administrateur anonymise un compte (droit à l'oubli) après une double
confirmation : les données personnelles sont remplacées ou effacées dans une
seule transaction verrouillée, les sessions sont fermées, et les données
pédagogiques comme les certificats restent — vérifiables publiquement, sans
aucune identité.

## Point de départ
Backlog E2, US-CPT-04 (Should, 3 pts, UC1 Admin / DS-15 P4 + état ANONYMISE) :
dans une transaction atomique, remplacer les données personnelles par des
pseudonymes (nom, email, matricule, secrets effacés), passer en ANONYMISE,
conserver tentatives / livrables / certificats, journaliser COMPTE_ANONYMISE,
invalider les sessions ; mot de passe administrateur faux -> rien n'est
modifié. Consignes du porteur : irréversible, certificats toujours vérifiables
sans PII, journal conservé (entrée sans PII), refus du dernier administrateur
actif, confirmation explicite, concurrence (FOR UPDATE). Existant : statut
`ANONYMISE` déjà dans l'énumération et refusé à la connexion (US-AUTH-01),
anti-verrouillage d'US-CPT-03, `invalidateUserSessions` (US-AUTH-08).

## Découpage
- **API** : `admin/anonymisation/` — DTO (mot de passe + mot « ANONYMISER »),
  règles pures (adresse de remplacement, anti-verrouillage), service
  (transaction verrouillée), contrôleur `POST /admin/users/:id/anonymiser` ;
  vérification publique : titulaire « Titulaire anonymisé », PDF public refusé
  pour un titulaire anonymisé.
- **Web** : bouton « Anonymiser » sur `/admin/utilisateurs` (pas sur son
  propre compte ni sur un compte déjà anonymisé) et modale `AnonymiserModal`
  (ce qui est effacé / conservé, mot de passe, mot à recopier).
- Pas de migration.

## Endpoint
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/admin/users/:id/anonymiser` `{ motDePasseAdmin, confirmation: "ANONYMISER" }` | ADMINISTRATEUR | 200 `{ id, statut, email, nom, sessionsRevoquees }` ; 400 confirmation absente ou fausse, champ inconnu ; 401 mot de passe faux (rien modifié, tentative tracée) ; 403 rôle, son propre compte, dernier administrateur actif ; 404 ; 409 déjà anonymisé |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Confirmation | Double : mot de passe de l'administrateur (réauthentification, comme US-ROL-01) ET mot « ANONYMISER » recopié. Mot de passe faux -> 401, aucune transaction, tentative journalisée. |
| D2 | Comptes visés | Tout compte non anonymisé (actif, désactivé ou en attente) : une demande d'effacement peut venir d'un compte encore actif. Le backlog parlait d'un compte « inactif » : la révocation des sessions dans la même opération couvre ce cas. Son propre compte : 403 (on ne se retire pas en pleine session). |
| D3 | Remplacements | email `anonyme-<id>@anonymise.invalid` (unique ; domaine réservé RFC 2606, aucun email ne peut y partir), nom « Compte anonymisé », prénom, mot de passe, MFA (secret et activation), dernière connexion, date de naissance, niveau, domaine, établissement : effacés. Statut ANONYMISE. |
| D4 | Données liées | Liaisons Google / GitHub et liens email : supprimés. Sessions : IP et navigateur effacés, toutes révoquées (base + Redis). Justifications libres des demandes de rôle : « [anonymisé] ». |
| D5 | Conservé | Tentatives, livrables (fichiers et commentaires), corrections, alertes, certificats : données pédagogiques et preuves institutionnelles (obligation légale / intérêt légitime, RGPD art. 17-3). |
| D6 | Certificats | La ligne, l'empreinte et le PDF stocké sont conservés : la vérification publique reste VALIDE et INTÈGRE (empreinte recalculée), avec « Titulaire anonymisé » à la place du nom. Le PDF contient le nom : il n'est plus servi publiquement (404) mais reste en stockage privé comme preuve. |
| D7 | Concurrence | Si la cible est administrateur, les administrateurs actifs sont verrouillés (ordre stable) avant la cible, puis la cible (`FOR UPDATE`). 5 anonymisations simultanées -> 1 × 200, 4 × 409 ; deux administrateurs seuls actifs qui s'anonymisent l'un l'autre en même temps -> il en reste un. |
| D8 | Audit | `COMPTE_ANONYMISE` (acteur, cible = identifiant, rôle, ancien statut, sessions révoquées, liaisons supprimées) ; aucune donnée personnelle. Le journal antérieur est conservé tel quel (immuable, US-AUTH-12). |

## À décider par un humain (hors périmètre technique)
- **Journal d'audit antérieur** : certaines entrées passées contiennent l'email
  de la personne dans leurs détails (`cibleEmail` des changements de rôle et
  désactivations) et des adresses IP. Le journal est immuable par conception ;
  le conserver relève de l'obligation de traçabilité. Une pseudonymisation
  rétroactive (via la porte de maintenance) est possible mais doit être
  validée par le porteur / l'encadrant (et, le cas échéant, l'INPDP).
- **Fichiers générés** : les rapports PDF / CSV déjà produits (US-RPT-01 / 02)
  peuvent contenir le nom ; ils ne sont pas réécrits. Une purge ou une durée
  de conservation des rapports reste à fixer.
- **PDF de certificat** conservé en stockage privé (D6) : durée de
  conservation à fixer avec l'institution.

## Fichiers
- `apps/api/src/modules/admin/anonymisation/` : `anonymisation.dto.ts`, `anonymisation.regles.ts`, `anonymisation.service.ts`, `anonymisation.controller.ts`, `anonymisation.spec.ts` ; `admin.module.ts`
- `apps/api/src/modules/certificats/verification.service.ts` (+ spec)
- `apps/api/test/anonymisation.e2e-spec.ts` (marqueur `E2E-CPT04`)
- `apps/web/src/components/AnonymiserModal.tsx`, `app/admin/utilisateurs/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Fixture avec MFA active : la connexion de la cible rendait un défi MFA au
  lieu d'une session ; le secret reste posé (pour vérifier son effacement),
  la MFA désactivée.
- Le test « dernier administrateur actif » met de côté, le temps du test, les
  autres administrateurs actifs de la base et les rétablit (bloc `finally`).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **112 suites / 1 430 tests** (+ 8 :
  règles ×2, mot de passe faux, soi-même, nominal, dernier administrateur,
  409 / 404 ; vérification publique d'un titulaire anonymisé), e2e complet en
  série **67 suites / 799 tests** (+ 1 ignoré), dont `E2E-CPT04` (4 tests : confirmation et refus ;
  nominal — données effacées, sessions coupées, ancienne adresse refusée,
  certificat VALIDE / VERIFIEE avec « Titulaire anonymisé », PDF public 404,
  audit sans PII, journal conservé, liste d'administration, 409 — ;
  5 anonymisations simultanées -> une seule ; anonymisation croisée des deux
  seuls administrateurs actifs -> il en reste un).
- Mutations : **14 / 14 tuées** — mot de passe non vérifié (réécrit : ne
  compilait pas), auto-anonymisation, cible non verrouillée, administrateurs
  non verrouillés, dernier administrateur non protégé, double anonymisation,
  email conservé, liaisons OAuth conservées, sessions non révoquées, traces de
  connexion conservées, justification conservée, titulaire non masqué, PDF
  public servi, secret MFA conservé.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px (Chromium,
  pile locale, administrateur de démonstration) : pas de bouton « Anonymiser »
  sur son propre compte ; modale (effacé / conservé, mot de passe, mot à
  recopier — bouton inactif tant que le mot n'est pas exact) ; anonymisation
  réelle -> « Compte anonymisé » dans la liste, statut ANONYMISE ; pas de
  défilement horizontal de la page, aucune erreur.

## CI
Voir la PR.

## Suites
- US-QCM-12 : surveillance webcam (purger les captures d'un compte anonymisé).
