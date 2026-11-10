# US-RPT-01 — Exporter un rapport de session (PDF / CSV, asynchrone)

## En une phrase
Le formateur affecté (ou l'administrateur) demande un rapport de session
— vue globale, un apprenant, ou un module — en CSV (Excel) ou en PDF ; la
demande rend 202 tout de suite, une file BullMQ produit le fichier, le dépose
dans le stockage objet et prévient le demandeur par email ; lui seul peut le
télécharger.

## Point de départ
DS-14 P3 : « Exporte -> 202 Accepted ; rapport-worker -> génère PDF/CSV,
stocke ; notifier(formateur, rapport prêt) ». Les agrégats existent
(US-SUIVI-01 : suivi et fiche ; US-SUIVI-02 : alertes) ; la file BullMQ et
le stockage S3 aussi (US-CERT-01). Le Backlog demande « global / individuel /
par module ».

## Découpage
- **Base.** Migration `1788100000000-AddRapports` : types
  `rapports_type_enum` (SESSION, INSTITUTIONNEL — ce dernier pour
  US-RPT-02), `rapports_format_enum`, `rapports_statut_enum` (EN_ATTENTE,
  EN_COURS, PRET, ECHEC) ; table `rapports` (demandeur CASCADE, formation
  CASCADE, paramètres `jsonb`, fichier : nom, clé unique, taille, SHA-256 ;
  tentatives, dernière erreur, dates) ; CHECK (un rapport PRET a son fichier,
  un rapport de session a sa formation, empreinte hexadécimale) ; index
  (demandeur, date). Entité `Rapport`, enums.
- **Règles pures.** `rapport-format.ts` (CSV : `;`, BOM UTF-8, CRLF, virgule
  décimale, injection de formule neutralisée ; PDF tabulaire PDFKit, en-têtes
  répétés à chaque page), `rapport-session.ts` (contenu des trois portées en
  liste blanche, nom de fichier ASCII), `rapports.regles.ts` (limite,
  clé, type MIME, assemblage par module).
- **File.** `FileRapportsService` (file `rapports`, identifiant de travail =
  identifiant du rapport, 3 essais, délai exponentiel, worker dans l'api,
  `RAPPORTS_WORKER=off` pour le couper).
- **API** (module `rapports`) : `RapportsService` — `demanderSession`,
  `mesRapports`, `monRapport`, `fichier`, `generer`, `echecDefinitif` ;
  `RapportsController` ; DTO ; email `sendRapportPretEmail`.
- **Web.** Bouton « Exporter un rapport » sur le suivi ; page « Rapports de
  session » (format, portée, apprenant / module, liste rafraîchie tant qu'un
  rapport est en cours) ; page « Mes rapports » (lien de l'email).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/formateur/formations/:formationId/rapports` `{ format, portee, apprenantId?, moduleId? }` | FORMATEUR affecté, ADMINISTRATEUR | 202 rapport EN_ATTENTE ; 400 ; 401 ; 403 (+ audit) ; 404 formation, apprenant non inscrit, module d'une autre formation ; 429 |
| GET | `/api/rapports?formationId` | FORMATEUR, ADMINISTRATEUR | 200 mes 50 derniers ; 400 ; 401 ; 403 apprenant |
| GET | `/api/rapports/:rapportId` | demandeur | 200 ; 400 ; 401 ; 404 inconnu ou d'un autre |
| GET | `/api/rapports/:rapportId/fichier` | demandeur | 200 CSV / PDF ; 404 ; 409 pas prêt ou en échec ; 503 stockage |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Asynchrone | Même modèle que les certificats : la requête insère EN_ATTENTE et ajoute un travail (202) ; le worker relit la base au moment de générer (données à jour). |
| D2 | Portées | GLOBAL (indicateurs + une ligne par apprenant, réutilise le suivi), INDIVIDUEL (fiche), MODULE (meilleure note par évaluation PUBLIÉE du module). Pas de période : le suivi est cumulatif (la période vaut pour US-RPT-02). |
| D3 | Confidentialité | Colonnes en liste blanche (identité, résultats) ; jamais de mot de passe, d'adresse IP ni de réponse ; le fichier n'est jamais joint à l'email. |
| D4 | Accès au fichier | Demandeur SEUL ; un autre utilisateur (même administrateur) reçoit 404, comme pour un rapport inconnu (pas de fuite d'existence). |
| D5 | Abus | 5 demandes par minute et par demandeur (429), comptées sous verrou consultatif PostgreSQL : des demandes simultanées ne dépassent pas la limite. |
| D6 | Un seul fichier | Prise `UPDATE … WHERE statut = 'EN_ATTENTE'` : exécutions simultanées -> une seule produit le fichier ; une erreur remet EN_ATTENTE (reprise BullMQ) ; après le dernier essai, ECHEC + erreur conservée. |
| D7 | CSV pour Excel | `;`, BOM UTF-8, CRLF, virgule décimale, dates à l'heure de Tunis ; cellule commençant par = + - @ ou tabulation préfixée d'une apostrophe (injection de formule). |
| D8 | Intégrité | SHA-256 du fichier en base et en métadonnée de l'objet ; taille vérifiée au téléchargement (e2e). |
| D9 | Audit | `RAPPORT_DEMANDE` (acteur, paramètres), `RAPPORT_GENERE`, `RAPPORT_ECHEC`, `RAPPORT_TELECHARGE`. |
| D10 | Rétention | Hors périmètre : les rapports restent jusqu'à la suppression du demandeur ou de la formation (CASCADE). |

## Fichiers
- `apps/api/src/database/migrations/1788100000000-AddRapports.ts`, `entities/rapport.entity.ts`, `enums/rapport.enum.ts`
- `apps/api/src/modules/rapports/` : `rapport-format.ts`, `rapport-session.ts`, `rapports.regles.ts`, `file-rapports.service.ts`, `rapports.service.ts`, `rapports.controller.ts`, `rapports.dto.ts`, `rapports.module.ts` (+ specs)
- `apps/api/src/mail/mail.service.ts` (+ spec), `app.module.ts`, `config/configuration.ts`, `config/env.validation.ts`, `.env.example`
- `apps/api/test/rapports-session.e2e-spec.ts` (marqueur `E2E-RPT01`)
- `apps/web/src/app/formateur/formations/[id]/rapports/page.tsx`, `app/rapports/page.tsx`, `components/ListeRapports.tsx`, `app/formateur/formations/[id]/suivi/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- L'e2e a révélé une requête invalide que les tests unitaires (base
  simulée) ne voyaient pas : `ORDER BY 3 COLLATE "C"` sur le résultat d'un
  `UNION` (PostgreSQL n'accepte qu'un nom de colonne de sortie). Corrigé par
  une sous-requête triée ; le rapport par module passait en ECHEC après
  3 essais.

## Vérification
VERIF

## CI
Voir la PR.

## Suites
- US-RPT-02 : rapports institutionnels (administrateur, période), même
  table et même file (`type = INSTITUTIONNEL`).
