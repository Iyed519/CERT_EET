# US-CPT-02 — Import CSV de comptes par l'administrateur

## En une phrase
L'administrateur importe une promotion depuis un fichier CSV : tout est
validé avant de créer quoi que ce soit (colonnes, adresses, doublons dans le
fichier et en base), l'import est tout ou rien, les comptes sont créés en
attente d'activation et chacun reçoit, de façon asynchrone, un lien pour
choisir son mot de passe.

## Point de départ
Backlog E2, US-CPT-02 (Should, 3 pts, UC1 Admin / DS-15 P1) : valider les
colonnes obligatoires, les formats d'email et l'absence de doublons AVANT
l'import, créer les comptes en EN_ATTENTE_ACTIVATION avec envoi des emails
d'activation ; lignes invalides listées, sans création partielle silencieuse.
Dépendance historique : US-CPT-01 / US-AUTH-05 (création par l'admin et lien
d'activation), RETIRÉES en v1.2 : aucun compte « créé vide » n'existait
jusqu'ici. Existant réutilisé : primitive de lien email (US-AUTH-06), garde de
limitation (US-AUTH-06 / 13), modèle d'import CSV d'inscriptions (US-INSC-02),
BullMQ (US-CERT-01), politique de mot de passe (US-AUTH-08).

## Découpage
- **API** : règles pures `admin/import-comptes/import-comptes.regles.ts`
  (lecteur CSV RFC 4180, en-tête, bornes, validation ligne par ligne) ;
  `ImportComptesService` (transaction, verrou consultatif, insertion unique,
  audits) ; `ImportComptesController` (`POST /admin/users/import`,
  `POST /admin/users/:id/activation`) ; `auth/ActivationComptesService` (file
  BullMQ `activations-comptes` et son worker, activation) ; route publique
  `POST /auth/activate` (limitée par IP) ; email `sendActivationCompteEmail` ;
  configuration `activations` (`COMPTES_WORKER`), limite `activation`.
- **Web** : bouton « Importer un CSV » et modale `ImportComptesModal` sur
  `/admin/utilisateurs` (exemple de fichier, rapport ligne par ligne, comptes
  créés) ; bouton « Renvoyer l'activation » sur les comptes en attente ; page
  `/activer-compte` (sans Referer, non indexée, jeton retiré de l'URL).
- Pas de migration : la table `jetons_lien_email` (US-AUTH-06) prévoyait déjà
  l'objet `ACTIVATION_COMPTE`.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/admin/users/import` (multipart `fichier`) | ADMINISTRATEUR | 201 `{ crees, comptes[] }` ; 400 fichier inexploitable, ou `{ message, lignesAnalysees, lignesEnErreur, erreurs[] }` (rien créé) ; 401 ; 403 ; 409 collision tardive ; 413 > 256 Ko |
| POST | `/api/admin/users/:id/activation` | ADMINISTRATEUR | 202 ; 404 ; 409 compte qui n'attend pas d'activation par lien |
| POST | `/api/auth/activate` `{ token, nouveauMotDePasse }` | public | 200 ; 400 lien invalide / expiré / utilisé / autre usage, mot de passe non conforme ; 429 au-delà de 10 / 15 min par IP |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Format | En-tête OBLIGATOIRE (colonnes nommées, ordre libre, casse et accents indifférents) : `email`, `nom`, `prenom`, `role` facultative. Séparateur `;` ou `,` déduit de l'en-tête, guillemets RFC 4180 (une virgule dans un nom passe), BOM toléré. |
| D2 | Rôles | APPRENANT (par défaut) ou FORMATEUR. ADMINISTRATEUR refusé à l'import : une élévation passe par le changement de rôle avec mot de passe (US-ROL-01). |
| D3 | Tout ou rien | Le backlog laissait « rejeter les lignes ou bloquer selon le mode » ; la consigne du porteur tranche : une seule transaction, la moindre erreur bloque tout, rapport complet (toutes les erreurs de toutes les lignes, pas seulement la première). Refus en 400 avec le rapport. |
| D4 | Doublons | Dans le fichier (sans casse) et en base (`lower(email)`). Les adresses sont enregistrées en minuscules. |
| D5 | Concurrence | Verrou consultatif transactionnel : les imports sont sérialisés, le second relit la base et rend un rapport `COMPTE_EXISTANT` (5 imports simultanés -> 1 × 201, 4 × 400). Une collision avec une auto-inscription simultanée (unicité) annule tout -> 409. |
| D6 | Bornes | 256 Ko (multer, 413) et 500 comptes ; nom et prénom 100 caractères ; email 254. |
| D7 | Activation | Comptes EN_ATTENTE_ACTIVATION sans mot de passe. Après COMMIT, un travail BullMQ par compte ; le travail ne porte que l'identifiant : le worker émet le jeton (48 h, objet `ACTIVATION_COMPTE`, empreinte seule en base) au moment d'envoyer, avec reprises. Aucun jeton ne transite par Redis. |
| D8 | Renvoi | Le lien expire en 48 h : l'administrateur peut renvoyer l'email (nouveau jeton, l'ancien ne marche plus). Refusé (409) pour un compte inscrit lui-même (il a un mot de passe et sa propre vérification d'email). |
| D9 | Audit | `COMPTES_IMPORTES` (Succès avec le nombre par rôle ; Échec avec lignes analysées / en erreur), `COMPTE_CREE` par compte (cible, origine `IMPORT_CSV`), `ACTIVATION_RENVOYEE`, `COMPTE_ACTIVE` (Succès / Échec). Aucune adresse dans les détails. |
| D10 | Connexion | Un compte en attente ne se connecte pas et ne reçoit pas de lien « mot de passe oublié » (réservé aux comptes actifs) : seule l'activation l'ouvre. |

## Fichiers
- `apps/api/src/modules/admin/import-comptes/` : `import-comptes.regles.ts`, `import-comptes.service.ts`, `import-comptes.controller.ts`, `import-comptes.spec.ts` ; `admin.module.ts`
- `apps/api/src/modules/auth/` : `activation-comptes.service.ts`, `activation-comptes.spec.ts`, `auth.controller.ts`, `auth.module.ts`, `dto/mot-de-passe-oublie.dto.ts`
- `apps/api/src/mail/mail.service.ts` (+ spec), `src/config/configuration.ts`, `src/config/env.validation.ts`
- `apps/api/test/import-comptes.e2e-spec.ts` (marqueur `E2E-CPT02`)
- `apps/web/src/components/ImportComptesModal.tsx`, `app/admin/utilisateurs/page.tsx`, `app/activer-compte/{layout,page}.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Le conteneur de travail a redémarré pendant l'e2e complet : services
  relancés, suite relancée depuis le début.
- Mutant « comparaison sensible à la casse » : survivait faute de compte
  existant en majuscules ; cas ajouté à l'e2e (adresse en base avec
  majuscules, importée en minuscules -> `COMPTE_EXISTANT`).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **111 suites / 1 422 tests** (+ 16 :
  lecture du CSV, guillemets, refus de structure, validation ligne par ligne ;
  service nominal, refus sans écriture, collision 409, fichier inexploitable,
  renvoi ; worker, comptes ignorés, activation, refus ; email), e2e complet en
  série **66 suites / 795 tests** (+ 1 ignoré), dont `E2E-CPT02` (6 tests : accès, fichier absent /
  trop gros ; structure ; tout ou rien avec 6 erreurs dont doublon sans casse
  et compte existant en majuscules ; nominal — virgule dans un nom, rôles,
  audits, 3 emails asynchrones, jeton haché 48 h, connexion refusée avant
  activation, activation, usage unique — ; renvoi 202 / 409 / 404 / 403 ;
  5 imports simultanés -> un seul).
- Mutations : **14 / 14 tuées** — verrou retiré, création partielle, existants
  ignorés, casse, comptes créés ACTIF, rôle ignoré, doublon du fichier non vu,
  ADMINISTRATEUR importable, activations non planifiées, worker servant un
  compte avec mot de passe (unitaire), activation d'un compte non en attente
  (unitaire), jeton d'un autre usage accepté, taille maximale ×10, audit par
  compte absent.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px (Chromium,
  pile locale, administrateur de démonstration) : modale d'import avec rapport
  d'erreurs (adresse invalide, compte existant) ; import réussi (tableau des
  comptes créés) ; comptes « En attente » dans la liste avec « Renvoyer
  l'activation » ; page `/activer-compte` -> compte ACTIF ; pas de défilement
  horizontal, aucune erreur de page.
- Incident : `next build` a perdu `jest-worker` dans le node_modules web
  partagé (piège connu) -> `npm ci` puis nouveau build.

## CI
Voir la PR.

## Suites
- US-CPT-04 : anonymisation RGPD d'un compte.
