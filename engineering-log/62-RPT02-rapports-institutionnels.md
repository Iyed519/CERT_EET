# US-RPT-02 — Rapports institutionnels (administrateur, asynchrone)

## En une phrase
L'administrateur demande un rapport institutionnel — synthèse de la
plateforme, bilan par formation ou registre des certificats émis — sur une
période (jours inclus, heure de Tunis), en CSV ou en PDF ; comme pour
US-RPT-01, la demande rend 202, la file `rapports` produit le fichier et un
email prévient le demandeur, seul à pouvoir le télécharger.

## Point de départ
DS-16 P4 et Backlog : « type, format, période ; agrège les données sur la
période, produit le fichier de façon asynchrone (Bull) et notifie ; période
invalide (début > fin) -> erreur de validation ». US-RPT-01 a posé la table
`rapports` (type INSTITUTIONNEL déjà prévu), la file, le stockage, « Mes
rapports » et le téléchargement ; US-DASH-01 la période (`periode.regles`)
et les indicateurs globaux.

## Découpage
- **Aucune migration** : `rapports.type = 'INSTITUTIONNEL'`, `formation_id`
  NULL (le CHECK n'exige une formation que pour une session).
- **Règles pures.** `rapport-institutionnel.ts` : contenu CSV / PDF des trois
  modèles, libellé de période, taux de réussite, nom de fichier.
- **API.** `RapportsService.demanderInstitutionnel` (période résolue par
  `TableauDeBordService.periode`, 400 si invalide, conservée dans les
  paramètres), insertion commune sous verrou (`inserer`, partagée avec les
  rapports de session), génération selon le type (`contenuInstitutionnel`) ;
  `POST /admin/rapports` ; DTO.
- **Web.** Onglet « Rapports » de l'administration : modèle, format, période
  (30 derniers jours par défaut), liste « Mes rapports » (libellé et période
  des rapports institutionnels).

## Endpoint
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/admin/rapports` `{ modele, format, du?, au? }` | ADMINISTRATEUR | 202 rapport EN_ATTENTE ; 400 modèle, format, date mal formée ou inexistante, début > fin, > 366 jours, champ inconnu ; 401 ; 403 ; 429 |

Statut, liste et fichier : routes d'US-RPT-01 (`/api/rapports…`), demandeur seul.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Modèles | SYNTHESE (indicateurs d'US-DASH-01 sur la période), FORMATIONS (une ligne par formation : inscrits, nouvelles inscriptions, terminées, suspendues, tentatives notées, taux de réussite, score moyen, corrections finalisées, note moyenne, certificats émis et révoqués), CERTIFICATS (certificats émis : titulaire, formation, score, mention, statut, date, consultations publiques). |
| D2 | Période | Mêmes règles qu'US-DASH-01 (jours calendaires de Tunis, 30 derniers jours par défaut, 366 au plus, début ≤ fin) ; résolue à la demande et conservée : le fichier reproduit exactement la période demandée, même généré plus tard. |
| D3 | Bornes | `[du 00:00 ; au + 1 jour 00:00[` à l'heure de Tunis ; une tentative terminée le 29/02 à 23 h 30 (Tunis) compte, celle de 00 h 30 le 1er mars non (e2e). |
| D4 | Instantané / période | Inscrits, terminées, suspendues : instantané ; le reste : activité datée dans la période (inscription, fin de tentative, finalisation de correction, émission, révocation). |
| D5 | Limite | La limite de 5 demandes par minute est commune aux rapports de session et institutionnels (même verrou, même compteur). |
| D6 | Accès | Administrateur pour demander ; le fichier reste réservé au demandeur (un autre administrateur reçoit 404). |
| D7 | Confidentialité | Liste blanche : identité du titulaire et résultats ; ni mot de passe, ni IP, ni réponse ; consultations publiques = nombre de traces `CERTIFICAT_VERIFIE`, jamais leur IP. |

## Fichiers
- `apps/api/src/modules/rapports/rapport-institutionnel.ts` (+ spec), `rapports.service.ts` (+ spec), `rapports.controller.ts`, `rapports.dto.ts`
- `apps/api/test/rapports-institutionnels.e2e-spec.ts` (marqueur `E2E-RPT02`, données en février 2004)
- `apps/web/src/app/admin/rapports/page.tsx`, `app/admin/layout.tsx`, `components/ListeRapports.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Données de test : un certificat révoqué exige motif, description (10 à
  2 000 caractères) et auteur (`CHK_certificats_revocation`) ; le motif
  valide est `ERREUR_ADMIN`. Corrigé dans le jeu de données de la suite.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **90 suites / 1 267 tests**
  (+ 11 : contenu des trois modèles en CSV et PDF, période résolue et
  conservée, 400 sans insertion, limite partagée, génération selon le type),
  aucune migration (**31**), e2e complet en série **49 suites / 679 tests**
  (+ 1 ignoré), dont `E2E-RPT02` (7 tests : 401 / 403 formateur et apprenant ;
  400 modèle, format, date mal formée, date inexistante, début > fin (message
  exact), > 366 jours, champ inconnu, sans insertion ; bilan par formation aux
  comptes exacts sur février 2004 — borne de minuit à l'heure de Tunis,
  tentative abandonnée exclue, révocation de mars exclue — ; registre des
  certificats avec consultations publiques ; synthèse PDF et période vide ;
  isolation entre administrateurs ; concurrence : 8 demandes simultanées ->
  5 × 202, 3 × 429). La suite a été renforcée après l'e2e complet (voir
  « Mutations ») et relancée seule : 7 / 7.
- Mutations : **12 / 12 tuées** (dont 2 après renfort du jeu de données :
  tentative abandonnée dans la période, certificat révoqué après la période) —
  période non validée, type, fuseau de la borne de fin, statut NOTEE,
  révocations et inscriptions hors période, action des consultations, registre
  hors période, garde ADMINISTRATEUR, taux de réussite, période de la
  synthèse, limite commune.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, compte administrateur de démonstration) : onglet « Rapports »,
  demande d'un bilan par formation -> « En cours » puis « Prêt » sans
  recharger, libellé et période dans « Mes rapports » ; PDF de synthèse relu ;
  pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- Rétention des rapports (purge après N jours) : hors périmètre.
