# US-CERT-02 — Gestion des échecs de génération des certificats

## En une phrase
Quand la génération d'un certificat échoue définitivement (trois tentatives),
le certificat reste en attente sans aucun document partiel, l'échec est daté
et chaque administrateur actif est alerté par email une seule fois ; un
certificat resté bloqué « en génération » (worker arrêté) est repris
automatiquement ; la supervision filtre les échecs et permet la relance.

## Point de départ
Backlog E5, US-CERT-02 (Should, 3 pts, stretch) : « trois tentatives
échouées -> le système remet le certificat en EN_ATTENTE_GENERATION et alerte
l'administrateur » ; « stockage indisponible -> le job échoue proprement et
entre dans la politique de reprise (pas de certificat partiel publié) ».
Existant (US-CERT-01) : reprises BullMQ (5 / 10 / 20 s, 3 tentatives),
retrait de l'objet déposé si la base échoue, remise en attente, audit
`CERTIFICAT_ECHEC`, relance manuelle.

## Découpage
- **Migration** `1788300000000-AddEchecsCertificats` : `echec_definitif_le`,
  `debut_generation` (facultatives), index partiel des échecs définitifs.
- **API** (`CertificatsService`) : `echecDefinitif` (datation conditionnelle,
  alerte unique), `reprendreBloques`, `RepriseCertificatsService` (minuteur,
  5 min) ; `generer` date le début de génération et efface l'échec au succès ;
  `relancer` l'efface aussi ; filtre `enEchec=true` de la supervision ; email
  `sendCertificatEchecEmail`.
- **Web.** Filtre « Échecs définitifs » dans la supervision des certificats
  (ouvert par le lien de l'email, `?enEchec=true`) ; mention de l'échec et de
  l'alerte sur la ligne.

## Endpoint modifié
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/certificats?statut&recherche&enEchec=true` | ADMINISTRATEUR | 200 (chaque certificat porte `echecDefinitifLe`) ; 400 `enEchec` autre que `true` ; 401 ; 403 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | État après échec | EN_ATTENTE_GENERATION (pas d'état EXPIRE : rien n'a été émis). L'objet éventuellement déposé est déjà retiré par `generer` : jamais de certificat partiel. |
| D2 | Alerte unique | `UPDATE … SET echec_definitif_le = now() WHERE … echec_definitif_le IS NULL RETURNING` : seul le premier échec définitif alerte (8 échecs simultanés -> 8 traces, une alerte). L'audit `CERTIFICAT_ECHEC` porte `alerte: true/false`. |
| D3 | Destinataires | Administrateurs ACTIFS seulement ; email au mieux (un échec d'envoi est journalisé, n'arrête ni les autres envois ni le worker). |
| D4 | Effacement | Relance manuelle ou génération réussie -> `echec_definitif_le = NULL` : un nouvel échec définitif alertera de nouveau. |
| D5 | Reprise | EN_GENERATION depuis 15 min ou plus (`debut_generation`, à défaut `updated_at`) -> EN_ATTENTE_GENERATION, message « reprise automatique », audit `CERTIFICAT_REPRIS`, nouveau travail en file. UPDATE conditionnel : 4 tours simultanés reprennent un certificat une seule fois. Minuteur sans dépendance (comme les autres balayages), désactivé en test. |
| D6 | Configuration | Délai et intervalle en constantes (`REPRISE_CERTIFICATS`) : aucune variable d'environnement de plus. |

## Fichiers
- `apps/api/src/database/migrations/1788300000000-AddEchecsCertificats.ts`, `entities/certificat.entity.ts`
- `apps/api/src/modules/certificats/` : `certificat.regles.ts`, `certificats.service.ts`, `reprise-certificats.service.ts`, `certificats.dto.ts`, `certificats-admin.controller.ts`, `supervision-certificats.service.ts`, `certificats.module.ts` (+ specs)
- `apps/api/src/mail/mail.service.ts`
- `apps/api/test/echecs-certificats.e2e-spec.ts` (marqueur `E2E-CERTECHEC`)
- `apps/web/src/app/admin/certificats/page.tsx`, `lib/api.ts`

## Incidents
- Premier e2e : les trois échecs n'arrivaient jamais. Cause : l'API locale de
  démonstration (pile lancée pour les captures) tournait encore et son worker
  consommait la même file Redis avec un vrai stockage. Pile arrêtée ; règle
  ajoutée au mémo : jamais d'e2e avec la pile de démonstration active.
- Prettier sur `mail.service.ts` repliait des lignes hors périmètre : fichier
  remis tel quel, seul le bloc ajouté reste.
- Une règle pure `estBloqueEnGeneration` écrite d'abord n'était utilisée nulle
  part (le délai est appliqué en SQL) : retirée.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **101 suites / 1 345 tests**
  (+ 3 : premier échec — datation conditionnelle, administrateurs actifs,
  audit, emails — ; déjà signalé sans alerte et email en échec non bloquant ;
  reprise conditionnelle, audit et file ; tests existants mis à jour : début de
  génération daté, échec effacé au succès et à la relance), migration run +
  revert + run (**33 migrations**), e2e complet en série **58 suites / 750 tests** (+ 1 ignoré), dont
  `E2E-CERTECHEC` (5 tests : trois échecs -> en attente, rien publié, daté,
  tracé, une alerte par administrateur actif et aucune au désactivé ;
  supervision filtrée, 400, 403 ; relance -> échec effacé puis ACTIF ;
  concurrence : 8 échecs définitifs simultanés -> une alerte ; reprise d'un
  certificat bloqué, une seule sur 4 tours simultanés, puis ACTIF, un
  certificat récent ignoré).
- Mutations : **10 / 10 tuées** — échec daté à chaque fois (alerte répétée),
  alerte même si déjà signalé, administrateurs désactivés alertés, relance sans
  effacer l'échec, succès sans effacer l'échec, reprise sans délai, repris sans
  être renvoyé dans la file, action d'audit de la reprise, début de génération
  non daté, filtre `enEchec` ignoré (deux mutants réécrits : ils ne
  compilaient pas).
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, administrateur de démonstration, un échec définitif posé en base
  locale) : lien `?enEchec=true` -> filtre « Échecs définitifs » actif, ligne
  avec tentatives, dernière erreur, mention de l'alerte et « Relancer » ; pas
  de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-IA-06 : couche d'abstraction LLM.
