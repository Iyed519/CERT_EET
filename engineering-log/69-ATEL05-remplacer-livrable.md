# US-ATEL-05 — Remplacer son livrable

## En une phrase
Tant que la date limite n'est pas passée et que le formateur n'a pas ouvert
la correction, l'apprenant remplace son livrable par une nouvelle version :
nouveaux fichiers contrôlés, version + 1, hash de traçabilité recalculé ;
l'ancienne version est retirée du stockage une fois la nouvelle enregistrée.

## Point de départ
UC4 Apprenant, DS-03 P1 ; Sprint 4 § 3.2 : « avant la date limite et tant
que SOUMIS ; version + 1 ; ancien objet retiré après succès ; hash
recalculé ; refus si EN_CORRECTION (409) ». Existant : dépôt d'US-ATEL-04
(contrôles de fichiers, SHA-256 en flux, hash de traçabilité, stockage S3 puis
base, un livrable par atelier), ouverture de la correction sous verrou de la
ligne du livrable (US-ATEL-06), livrable NOTE immuable (déclencheur).

## Découpage
- **Aucune migration.**
- **Règles pures** (`livrable.regles.ts`) : `verifierRemplacement` (statut,
  date limite) et ses messages ; message du double dépôt mis à jour (il
  renvoie maintenant au remplacement).
- **API** (`LivrablesService.remplacer`, `PUT /ateliers/:atelierId/livrable`) ;
  préparation des fichiers extraite dans `preparerDepot`, partagée avec le
  dépôt.
- **Web.** Bouton « Remplacer mon livrable » sous « Mon livrable » (dépôt
  ouvert et livrable SOUMIS) ; le formulaire de dépôt sert en mode
  remplacement (titre, bouton, confirmation « remplacera la version N »).

## Endpoint
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| PUT | `/api/ateliers/:atelierId/livrable` (multipart `fichiers`, `commentaire`, `liens`) | APPRENANT (le sien) | 200 version + 1 ; 400 fichiers, commentaire, liens ; 401 ; 403 rôle, pas inscrit ou suspendu (tracé), formation terminée ; 404 atelier, ou aucun livrable ; 409 date limite passée, en correction, noté, remplacement simultané, formation archivée ; 503 stockage |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Fenêtre | Avant la date limite (exclue). La tolérance de retard ne vaut que pour le premier dépôt : un remplacement tardif n'est jamais accepté. Le livrable remplacé n'est donc jamais en retard. |
| D2 | Statut | SOUMIS seulement : EN_CORRECTION -> 409 « en cours de correction », NOTE -> 409 « a été noté ». |
| D3 | Ordre des écritures | Nouveaux objets envoyés d'abord, sous un préfixe propre au dépôt (`v{n}-{uuid}`) ; puis, en base sous `FOR UPDATE` de la ligne : statut et version relus, fichiers remplacés, version + 1, hash, commentaire, liens, date de soumission ; anciens objets supprimés APRÈS le COMMIT. Un échec en base supprime les nouveaux objets : jamais d'objet orphelin, jamais de version sans fichier. |
| D4 | Concurrence | Ouverture de la correction et remplacement prennent le même verrou de ligne : un remplacement ne passe jamais après l'ouverture. Deux remplacements simultanés : celui qui relit une version dépassée -> 409 (« rechargez la page ») ; une demande partie après le COMMIT d'une autre remplace la version suivante (légitime). Le préfixe unique empêche qu'un perdant supprime les objets du gagnant (mutant tué par l'e2e). |
| D5 | Audit | `LIVRABLE_REMPLACE` : version et hash avant / après, nombre et taille des fichiers. |
| D6 | Notification | Pas d'email au formateur à chaque remplacement (le dépôt initial l'a déjà prévenu ; la liste des livrables montre la version). |

## Fichiers
- `apps/api/src/modules/ateliers/livrables/livrable.regles.ts`, `livrables.service.ts`, `livrables.controller.ts` (+ specs)
- `apps/api/test/remplacer-livrable.e2e-spec.ts` (marqueur `E2E-REMPLACE`) ; `test/livrables.e2e-spec.ts` (message du double dépôt)
- `apps/web/src/components/DepotLivrable.tsx`, `app/mes-ateliers/[atelierId]/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Premier e2e : hash attendu mal calculé dans le test (le hash de
  traçabilité trie les SHA-256 et les joint par `\n`) ; utilitaire corrigé.
- Concurrence : l'assertion « un seul succès sur 6 » était fausse — une
  demande partie après le COMMIT d'une autre est un remplacement légitime.
  Invariant retenu : version finale = départ + nombre de succès, une trace
  par succès, stockage identique à la base.
- Une assertion d'ordre sur l'horodatage de l'audit a été retirée : la
  trace est écrite après le COMMIT, son heure ne prouve rien sur l'ordre des
  transactions ; l'invariant « stockage = base, EN_CORRECTION, version =
  1 + succès » est vérifié à la place.
- Premier e2e complet avant le rebasage : échec connu de la concurrence
  d'`audit-journal` (ECONNRESET), corrigé sur `main` par US-QCM-02 ; relancé
  après rebasage.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **99 suites / 1 335 tests**
  (+ 8 : règle de remplacement — fenêtre, statuts — ; service : version + 1,
  préfixe, verrou, fichiers remplacés, anciens objets retirés après, audit ;
  404 sans livrable ; 409 clos ; EN_CORRECTION sous le verrou avec nouveaux
  objets supprimés ; version changée -> 409 sans toucher aux anciens), aucune
  migration (**32**), e2e complet en série **56 suites / 739 tests** (+ 1 ignoré), dont `E2E-REMPLACE`
  (7 tests, 3 passages verts : accès ; remplacement complet et deuxième
  remplacement ; 400 sans effet ; 409 date limite pendant la tolérance ; 409
  correction ouverte ; 6 remplacements simultanés ; ouverture de la
  correction pendant 4 remplacements).
- Mutations : **11 / 11 tuées** — message d'EN_CORRECTION, tolérance
  acceptée, sans verrou, version relue ignorée, statut non revérifié sous le
  verrou, anciens objets conservés, nouveaux objets gardés après un échec,
  version non incrémentée, hash non recalculé, action d'audit, préfixe commun
  aux remplacements simultanés (le mutant « anciens objets conservés » a été
  réécrit : la première version ne compilait pas).
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, apprenant de démonstration, date limite de l'atelier de
  démonstration repoussée en base locale) : « Remplacer mon livrable »,
  formulaire « Remplacer mon livrable (version 1) », « Annuler » et
  « Remplacer le livrable » ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-IA-05 : traçabilité des générations IA (stretch).
