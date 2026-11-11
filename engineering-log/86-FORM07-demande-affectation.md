# US-FORM-07 — Le formateur demande à enseigner une formation existante

## En une phrase
Un formateur — qu'il enseigne déjà ou non d'autres formations — demande à
enseigner une formation non archivée avec un motif ; l'administrateur
l'accepte (l'affectation est créée dans la même transaction) ou la refuse avec
un motif ; le formateur suit ses demandes et peut annuler celles en attente ;
chaque décision est envoyée par email et journalisée.

## Point de départ
Seul l'administrateur pouvait affecter un formateur (US-FORM-03), sans que
le formateur puisse exprimer un souhait dans la plateforme.

## Découpage
- **Migration** `1788800000000-AddDemandesAffectation` : table
  `demandes_affectation` (motif 10–1 000, statut `EN_ATTENTE` / `ACCEPTEE` /
  `REFUSEE` / `ANNULEE`, motif de refus obligatoire si refusée et interdit
  sinon, cohérence décision ↔ date et auteur), **index unique partiel**
  `(formation_id, formateur_id) WHERE statut = 'EN_ATTENTE'`, index de liste.
- **Api** (`modules/demandes-affectation`) :
  - règles pures (motif, statut modifiable, formation ouverte aux demandes) ;
  - formateur (`@Roles(FORMATEUR)`) : `GET /formateur/demandes-affectation`,
    `GET …/formations-disponibles` (non archivées, pas encore les siennes,
    marquées « en attente »), `POST` (201), `PATCH …/:id/annuler` ;
  - administrateur (`@Roles(ADMINISTRATEUR)`) : `GET /admin/demandes-affectation`
    (filtre de statut, pagination), `PATCH …/:id/accepter`,
    `PATCH …/:id/refuser` (motif) ;
  - email `sendDecisionDemandeAffectationEmail` (gabarit `gabaritEmail`,
    saisies échappées ; acceptée -> lien vers la formation, refusée -> motif
    et lien vers « Mes demandes ») ;
  - audit `DEMANDE_AFFECTATION_CREEE`, `…_ACCEPTEE` (avec
    `affectationCreee`, `notificationEnvoyee`), `…_REFUSEE`, `…_ANNULEE` ;
  - tableau de bord administrateur : `demandesEnAttente.affectation`.
- **Web** :
  - `/formateur/demandes` : formulaire (formation, motif avec compteur),
    tableau de ses demandes (statut, motif de refus, annulation confirmée) ;
    accès par le bouton « Demander une formation » du tableau de bord et
    « Mes demandes » du menu de compte ;
  - `/admin/demandes-affectation` : même présentation que les demandes de
    rôle (filtre, « Accepter », « Refuser » avec motif obligatoire) ; onglet
    d'administration et menu de compte ; compteur et lien sur le tableau de
    bord administrateur.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Unicité | Une seule demande EN_ATTENTE par (formateur, formation) : vérifiée par le service sous verrou de la ligne du formateur, garantie par l'index unique partiel (une violation devient 409). Une demande annulée ou refusée n'empêche pas d'en refaire une. |
| D2 | Acceptation | Une transaction : demande `FOR UPDATE` (doit être EN_ATTENTE), formation `FOR UPDATE` (non archivée), demandeur encore formateur actif, `INSERT … ON CONFLICT DO NOTHING` dans `formation_formateurs` (s'il a été affecté entre-temps, la demande est quand même acceptée : l'état voulu est atteint ; `affectationCreee` le dit), puis statut ACCEPTEE. Email et audit après validation. |
| D3 | Refus et annulation | `UPDATE … WHERE statut = 'EN_ATTENTE'` : une seule décision gagne ; les autres reçoivent 409. Annuler la demande d'un autre : 404 (sans révéler qu'elle existe). |
| D4 | Email | Non bloquant : une panne d'envoi n'annule pas la décision ; l'audit le note (`notificationEnvoyee: false`). |
| D5 | Formation fermée | Une formation FERMEE peut être demandée (elle peut rouvrir) ; seule ARCHIVEE est exclue. |
| D6 | Lien vers la formation (admin) | Vers la page d'inscriptions de la formation, page existante de l'administration. |

## Fichiers
- `apps/api/src/database/migrations/1788800000000-AddDemandesAffectation.ts`
- `apps/api/src/modules/demandes-affectation/*` (règles + spec, DTO, service, contrôleurs, module), `app.module.ts`
- `apps/api/src/mail/mail.service.ts`, `modules/pilotage/tableau-de-bord.service.ts`
- `apps/api/test/demandes-affectation.e2e-spec.ts` (nouveau, `E2E-FORM07`)
- `apps/web/src/app/formateur/demandes/page.tsx`, `app/admin/demandes-affectation/page.tsx` (nouveaux), `app/admin/layout.tsx`, `app/admin/tableau-de-bord/page.tsx`, `app/formateur/tableau-de-bord/page.tsx`, `components/SiteHeader.tsx`, `components/navigation.ts`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- Après la fusion de US-NAV-01, la CI de `main` a échoué une fois sur
  `rapports-institutionnels` (le worker de rapports avait déjà pris la tâche :
  statut `EN_COURS` au lieu d'`EN_ATTENTE` dans la réponse). Sans lien avec le
  code fusionné ; job relancé, vert. Le test sera rendu déterministe dans
  l'audit de qualité (US-QUAL-01).

## Vérification
- Migration : run / revert / run (**38 migrations**).
- Api : lint 0 avertissement, `tsc`, unitaires **116 suites / 1 460 tests**
  (+ 3), e2e complet en série (voir ci-dessous), dont `E2E-FORM07`
  (13 tests : accès ; formations disponibles ; validations ; création, audit,
  « mes demandes » ; annulation ; acceptation avec affectation, email, audit ;
  refus avec motif ; email en panne ; formation archivée et formateur
  désactivé ; liste et filtres ; **6 créations simultanées -> 1** ;
  **accepter ×3, refuser ×2 et annuler simultanés -> 1 décision, au plus
  1 affectation** ; compteur du tableau de bord).
- Mutations : **13 / 13 tuées** sur 14 écrites — motif non vérifié,
  formation archivée acceptée, déjà affecté, 409 d'unicité, annulation de la
  demande d'un autre, acceptation sans verrou, acceptation d'une demande
  traitée, acceptation sans affectation, formateur désactivé accepté, refus
  d'une demande traitée, refus sans email, acceptation non journalisée,
  administrateur admis côté formateur. **Un mutant équivalent** : retirer le
  verrou de création ne change rien d'observable, l'index unique partiel
  donne le même 409 (le verrou évite seulement l'erreur SQL) ; gardé tel quel
  et noté ici.
- Web : `tsc`, `next lint`, `next build` ; navigateur (voir la PR).

## CI
Voir la PR.
