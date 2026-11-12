# US-QCM-13 — Rapport PDF détaillé du résultat d'un QCM

## En une phrase
L'apprenant télécharge le rapport PDF d'une de ses tentatives notées (en-tête, synthèse, détail par
question), avec le corrigé seulement quand la règle d'US-QCM-09 l'autorise ; le formateur affecté
(ou l'administrateur) télécharge le même rapport, corrigé toujours inclus ; chaque téléchargement
est journalisé `RAPPORT_QCM_TELECHARGE`.

## Point de départ
Story ajoutée le 12/11/2026 (révision v2.1, `claude/Cert_EET_Revision_v2.1_US-QCM-13.md`, E3,
Should, 5 pts). Tout existait pour la produire : tentative figée NOTEE (US-QCM-08), décision du
corrigé `TentativeCorrectionService.etat` (US-QCM-09), lecture du corrigé `lireCorrection`
(réutilisée par l'historique, US-QCM-11), garde `@FormateurDeLaFormation` (US-AUTH-16), moteur
PDFKit du certificat (US-CERT-01). Aucune migration, aucune nouvelle dépendance.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Route | Une route `GET /tentatives/:id/rapport.pdf` pour les trois rôles · **deux routes** | **Deux routes, un service.** Apprenant : `GET /api/tentatives/:tentativeId/rapport.pdf` (`@Roles(APPRENANT)`, sa tentative). Formateur / administrateur : `GET /api/formateur/qcm/:qcmId/tentatives/:tentativeId/rapport.pdf` (`@Roles(FORMATEUR, ADMINISTRATEUR)` + `@FormateurDeLaFormation({ qcmId })`), même préfixe que l'historique formateur d'US-QCM-11. Le garde existant refuse un apprenant (403 « rôle insuffisant ») : une route unique aurait demandé une autorisation écrite à la main. Ici la garde est réutilisée telle quelle (403 + `ACCES_RESSOURCE_REFUSE`). |
| D2 | Disponibilité | — | NOTEE seulement ; sinon 409 `{ raison: 'tentative_non_notee' }`, aucun PDF, aucun audit. Ordre : propriétaire / QCM (404) → notée (409). |
| D3 | Accès | — | Apprenant propriétaire : oui ; autre apprenant : 404 identique à une inconnue ; formateur affecté et administrateur : oui ; formateur non affecté : 403 + `ACCES_RESSOURCE_REFUSE` (garde) ; tentative d'un autre QCM sur la route formateur : 404. |
| D4 | Corrigé | Recopier la règle · **même fonction** | Apprenant : `TentativeCorrectionService.etat(...)`, la fonction appelée par `GET /tentatives/:id/correction` (donc aussi `tentatives_restantes`, l'option B d'US-QCM-09). Formateur / admin : toujours inclus (comme le détail d'US-QCM-11). Règle pure `corrigeInclus(role, etat)`. |
| D5 | Non-fuite | Masquer à l'impression · **ne jamais copier** | `construireLignesRapport` ne copie ni bonne réponse ni explication sans corrigé : le générateur PDF ne reçoit pas ce qu'il ne doit pas imprimer. Seules les options **cochées** sont listées (comme le demande la story) : la bonne réponse d'une question ratée ou sans réponse n'apparaît pas. Phrase « Corrigé non inclus : … à partir du {fermeture} » ; pour `tentatives_restantes` : « après votre dernière tentative, et au plus tard le {fermeture} ». |
| D6 | Données | Recalculer · **lire la tentative figée** | Score, réussite : colonnes de la tentative ; juste / faux et points : `reponses` (ce que la notation a écrit) via `lireCorrection` ; ordre : `planTirage`. Synthèse = comptes de ces lignes (points obtenus / possibles = somme des points écrits / des pondérations). Une NOTEE est figée par déclencheur : pas de verrou nécessaire. |
| D7 | Clôture « Temps écoulé » | Colonne nouvelle · audit `TENTATIVE_EXPIREE` · **dates** | Une notée a perdu son statut de clôture. La soumission n'est admise qu'avant l'échéance (409 `temps_ecoule` sinon) et toute clôture par le temps écrit `dateFin = dateLimite` : `dateFin >= dateLimite` ⇔ temps écoulé (règle pure `clotureDe`). Aucune migration. Sans réponse : « Faux (sans réponse) », comptées fausses dans la synthèse. |
| D8 | Rang « n° x / max » | — | Même rang que l'historique (US-QCM-11) : ordre `(date_debut, id)` sur toutes les tentatives de l'apprenant pour ce QCM. |
| D9 | Génération | BullMQ · **synchrone** | Synchrone, en mémoire, jamais stockée (un document court ; ~0,1 s mesuré en e2e). `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="rapport-<titre ascii>-tentative-<n>.pdf"`, `Cache-Control: no-store`. |
| D10 | Audit | — | `RAPPORT_QCM_TELECHARGE` : acteur = demandeur, **cible = apprenant**, détails `{ tentativeId, qcmId, role, corrigeInclus, score }`. Écrit après la génération ; s'il échoue, la requête échoue (aucun téléchargement non tracé), comme US-CERT-09. Les refus (404 / 409) ne sont pas journalisés ; le 403 du formateur l'est par la garde. |
| D11 | Polices | Embarquer une police · **Helvetica standard** | Pas de nouvelle dépendance ni de fichier de police : les caractères hors WinAnsi (≤, →, emoji, arabe…) sortaient illisibles ; `texteImprimable` remplace les courants par un équivalent (`<=`, `->`) et les autres par « ? ». Dates à l'heure de Tunis, comme le certificat. |
| D12 | Web : « Mon espace » | Page d'une formation · **« Mes évaluations »** | La page « Mon espace » d'une formation ne liste pas les tentatives ; l'historique (US-QCM-11, `/mes-tentatives`, menu « Mes évaluations ») est la page « historique des tentatives » : bouton sur chaque ligne notée et dans le détail. Plus la page de résultat (`/tentatives/:id`) et le suivi formateur (`/formateur/qcm/:id/tentatives`, ligne et détail). Composant commun `BoutonRapportPdf`. |
| D14 | À qui sert le rapport | — | Précision du porteur en cours de story : le rapport est **pour l'apprenant** (comprendre ses erreurs, ses points faibles). Ajout d'une section « Vos points à revoir » après la synthèse : questions fausses ou sans réponse (énoncé, verdict, points perdus — jamais la bonne réponse, donc identique avec ou sans corrigé) et **réussite par niveau de difficulté** (débutant / intermédiaire / avancé, champ déjà saisi par le formateur ; « à travailler » sous 50 %), lue à part pour ne pas toucher la vue du corrigé d'US-QCM-09. Le rapport agrégé de la classe pour le formateur (questions ratées par toute la cohorte, efforts à porter) reste une story séparée (US-QCM-14), comme le prévoit la révision v2.1. |
| D13 | Numéro du journal | 90 (demandé) · **93** | 90, 91 et 92 sont déjà pris (#105 à #112) : journal 93. |

## Découpage
- Api, dossier `apps/api/src/modules/tentatives/rapport/` (module à part comme l'historique : il
  importe `FormationsModule` pour la garde) :
  - `rapport-tentative.regles.ts` : `rapportDisponible`, `corrigeInclus`, `clotureDe`,
    `construireLignesRapport` (liste blanche), `syntheseRapport`, `pointsARevoir`,
    `reussiteParNiveau`, formats (`nombreFr` 2 décimales,
    `dureeFr`), `phraseCorrigeAbsent`, `nomFichierRapport` ;
  - `rapport-tentative-pdf.ts` : `genererPdfRapport` (PDFKit, A4 portrait, en-tête, synthèse,
    points à revoir, détail, pied de page paginé « Page x / y » avec la mention, la date de génération et
    l'identifiant), `texteImprimable`, `dateHeureTunis` ;
  - `rapport-tentative.service.ts` : une requête pour la tentative et tout l'en-tête, `etat` pour
    l'apprenant, `lireCorrection`, génération, audit ;
  - `rapport-tentative.controller.ts` : `RapportApprenantController`, `RapportFormateurController` ;
  - `rapport-tentative.module.ts`, enregistré dans `app.module.ts`.
- Web : `components/BoutonRapportPdf.tsx`, `lib/api.ts` (`telechargerRapportTentative`, nom de
  fichier lu dans `Content-Disposition`), pages `tentatives/[id]`, `mes-tentatives`,
  `formateur/qcm/[id]/tentatives`, styles `rapport-pdf`, correctif `.btn.btn-secondaire`.

## Fichiers
- `apps/api/src/modules/tentatives/rapport/*` (nouveau, + 3 specs), `apps/api/src/app.module.ts`
- `apps/api/test/rapport-tentative.e2e-spec.ts` (nouveau, `E2E-RAPPORT`)
- `apps/web/src/components/BoutonRapportPdf.tsx` (nouveau), `lib/api.ts`, `app/globals.css`,
  `app/tentatives/[id]/page.tsx`, `app/mes-tentatives/page.tsx`,
  `app/formateur/qcm/[id]/tentatives/page.tsx`
- `docs/projet/v3_2026-11-09/1_backlog/Cert_EET_Backlog_Produit.md` (E3, v2.1), `CHANGELOG.md`

## Vérification
- Unitaires : 3 nouvelles suites, 37 tests (règles, générateur, service simulé). Complet :
  **123 suites / 1 541 tests**.
- e2e `E2E-RAPPORT` (18 tests, texte des PDF extrait avec pdf.js comme l'ingestion des
  supports) : 401 / 400 ; autre apprenant 404 identique à une inconnue ; rôles croisés 403 ;
  formateur non affecté 403 + `ACCES_RESSOURCE_REFUSE` ; autre QCM / QCM inconnu 404 ; EN_COURS et
  SOUMISE 409 sans PDF ni audit ; **non-fuite** (différé avant fermeture : aucune bonne réponse non
  cochée, aucune explication, ni « Bonne réponse » ni « Explication » dans le texte ; date de
  fermeture affichée ; points à revoir sans bonne réponse, réussite par niveau ; même 409 sur `/correction`) ; immédiat sans tentative restante : en-tête,
  synthèse, points à revoir et réussite par niveau, détail complet, audit exact ; ordre du tirage (questions mélangées) ; « Temps écoulé »
  (clôture par le balayage) et sans réponse comptées fausses ; formateur et administrateur corrigé
  inclus, audit acteur / cible ; score, points, verdict = base sur 3 générations, tentative et
  réponses inchangées (scores non entiers : 9,09 / 81,82 / 45,45) ; fenêtre fermée : corrigé inclus
  pour l'apprenant ; concurrence : 6 rapports pendant la soumission (409 ou score final, audits =
  rapports servis) et 8 téléchargements simultanés tous servis et journalisés.
  Complet en série : **76 suites / 882 tests** (881 verts + 1 ignoré, comme avant).
- Mutations : **22 / 22 tuées** (corrigé toujours inclus, explication et bonnes réponses copiées
  sans corrigé, SOUMISE admise, autre apprenant servi, autre QCM servi, garde retirée, décision
  inversée par rôle, clôture `>` au lieu de `>=`, score arrondi, verdict forcé, rang constant,
  audit absent, cible = demandeur, `Cache-Control` absent, affichage en ligne, sans réponse
  comptées « fausses répondues », date de disponibilité absente ; puis, pour les points à revoir : toutes les questions listées, « à travailler » jamais affiché, niveau non recopié, niveaux confondus) ; les 5 mutants de fuite et
  d'autorisation et les 4 des points à revoir sont tués par l'e2e seul.
- Lint api `--max-warnings 0`, `tsc` ; web `tsc`, `next lint`, `next build`.
- Navigateur (jeu de démonstration, pile api + web derrière un mandataire HTTPS), 1280 et 390 px,
  apprenant `demo-apprenant2@` et formateur `demo-formateur@` : page de résultat, « Mes
  évaluations » (ligne et détail), tentatives du QCM côté formateur (ligne et détail) ; chaque
  bouton télécharge un vrai PDF (`%PDF-`, nom `rapport-qcm-les-bases-de-nestjs-tentative-n.pdf`),
  ouvert et relu : côté apprenant, tentative 1 de `demo-apprenant2@` (IMMÉDIAT, tentatives restantes) →
  « Corrigé non inclus … au plus tard le … », points à revoir sans bonne réponse ; côté formateur,
  corrigé et explications. Aucune erreur hors le 401 attendu de `/auth/refresh` avant connexion ;
  aucun débordement horizontal de page.

## Incidents
- **Bouton secondaire illisible** (vu en capture) : la refonte visuelle (#106) redéfinit `.btn`
  après `.btn-secondaire`, donc tout « btn btn-secondaire » (dont « Voir le corrigé » d'US-QCM-09)
  devenait plein vert avec un texte vert foncé. Règle `.btn.btn-secondaire` plus spécifique ajoutée
  en fin de `globals.css` : les deux boutons retrouvent le style secondaire.
- Caractères hors WinAnsi illisibles dans un PDF en Helvetica (vu en essai) : D11.
- `toLocaleString('fr-FR')` met ou non une virgule entre date et heure selon la version d'ICU
  (Node 20 en CI, 22 ici) : `dateHeureTunis` assemble les parties (`formatToParts`).
- Premier jeu de pondérations (1 à 4, total 10) : tous les scores entiers, le mutant « score
  arrondi » aurait survécu ; pondérations 1, 2, 3, 5 (total 11).

## CI
Voir la PR.
