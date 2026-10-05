# Enabler Sprint 2 — Modèle de données (formations, inscriptions, moteur de QCM)

## En une phrase
Avant toute story du Sprint 2, je pose en une fois les 12 tables du cœur métier
(11 créées, `formations` complétée : modules, inscriptions, affectations de
formateurs, QCM, configuration anti-fraude, questions, options, tentatives,
réponses) par deux migrations réversibles, en faisant porter au schéma lui-même
une partie des garanties anti-fraude.

## Découpage
- **A — Plan du modèle.** Lecture du diagramme de classes + DS-02/08/09/11/12/16
  + ET-02, puis plan validé AVANT d'écrire une entité (six décisions, voir
  « Décisions »).
- **B — E2 : formations & inscriptions.** 2 enums, 4 entités (`Formation`
  étendue), migration `1785900000000-AddFormationsInscriptions`.
- **C — E3 : moteur de QCM.** 4 enums, 8 entités, migration
  `1786000000000-AddQcmSchema`.
- **D — Tests + journal + PR.** `test/data-model.e2e-spec.ts` (20 tests sur la
  vraie base), journal 21.

Pas de story « utilisateur » ici : c'est un prérequis technique (Sprint Backlog
§2.3). Aucun endpoint, aucune dépendance npm ajoutée.

## Schéma
| Table (entité) | Rôle | Garanties portées par la base |
|---|---|---|
| `formations` (`Formation`) | Cursus certifiant | CHECK `capacite_max > 0`, seuil ∈ [0,100], statut par défaut `OUVERTE` |
| `modules` (`ModuleFormation`) | Subdivision ordonnée | CASCADE avec la formation |
| `inscriptions` (`Inscription`) | Lien apprenant ↔ formation | UNIQUE (apprenant, formation), RESTRICT des deux côtés |
| `formation_formateurs` (`AffectationFormateur`) | Lien formateur ↔ formation | UNIQUE (formation, formateur) — support d'US-AUTH-16 |
| `qcm` (`Qcm`) | Questionnaire d'un module | RESTRICT vers le module, statut par défaut `BROUILLON` |
| `config_anti_fraude` (`ConfigurationAntiFraude`) | Paramètres anti-fraude (1–1) | UNIQUE `qcm_id`, 7 CHECK (fenêtre, durée, seuils, tentatives…) |
| `questions` (`Question`) | Question réutilisable | CHECK `ponderation > 0` |
| `qcm_questions` (`QcmQuestion`) | Liaison N–N + `ordre` | UNIQUE (qcm, question), RESTRICT côté question |
| `options` (`Option`) | Choix de réponse | CASCADE avec la question ; `est_correcte` en `select: false` |
| `tentatives_qcm` (`TentativeQcm`) | Passage d'un apprenant | Index unique PARTIEL sur `EN_COURS`, CHECK score ∈ [0,100], RESTRICT |
| `reponses` (`Reponse`) | Réponse à une question | UNIQUE (tentative, question), CASCADE avec la tentative |
| `reponse_options` (`ReponseOption`) | Options cochées | PK composite, RESTRICT côté option |

Enums : `StatutFormation` (OUVERTE/FERMEE/ARCHIVEE), `StatutInscription`
(EN_COURS/TERMINEE/SUSPENDUE), `StatutQcm` (BROUILLON/NON_PUBLIE/PUBLIE),
`AffichageResultats` (IMMEDIAT/DIFFERE), `TypeQuestion` (5 valeurs du diagramme),
`StatutTentative` (EN_COURS/SOUMISE/ABANDONNEE_TIMER/NOTEE).

## Flux (ce que le schéma permet, story par story)
1. **US-FORM-01/03** : `formations` + `modules`, puis une ligne
   `formation_formateurs` par affectation.
2. **US-AUTH-16** : le garde lit `formation_formateurs` ; pour un QCM, il
   remonte `qcm → module → formation` (la formation n'est pas dupliquée sur le QCM).
3. **US-INSC-01/04** : une ligne `inscriptions` par (apprenant, formation) ;
   `SUSPENDUE` retire l'accès sans jamais supprimer.
4. **US-QCM-01/03/04** : `qcm` (BROUILLON) → `questions`/`options` liées par
   `qcm_questions` → `config_anti_fraude` (NON_PUBLIE) → PUBLIE.
5. **US-QCM-05/06** : `tentatives_qcm` créée EN_COURS avec `date_limite`
   (échéance serveur) et `plan_tirage` (questions tirées + ordre des options).
6. **US-QCM-07/08** : `reponses` + `reponse_options` mises à jour à chaque
   auto-sauvegarde, puis `est_correcte`/`points_obtenus`/`score` écrits une fois
   par le scoring.

## Décisions
- **Statut d'inscription à 3 valeurs** (EN_COURS/TERMINEE/SUSPENDUE) : je suis le
  diagramme de classes et DS-08/DS-11, pas le raccourci « ACTIVE/SUSPENDUE ».
- **Pas de colonne `type` sur `modules`** : d'après le diagramme, un module
  contient 0..* QCM ET 0..* ateliers. Ce sont les évaluations qui pointent vers
  le module ; `ateliers.module_id` (Sprint 4) ne touchera pas `modules`.
- **Configuration, réponses et options cochées créées dès maintenant** : QCM-03,
  07 et 08 en dépendent ; une seule revue de schéma. `BanqueQuestions` reste
  pour US-QCM-02 (stretch).
- **QCM ↔ Question en N–N** (`qcm_questions`) : conforme à l'agrégation du
  diagramme ; l'import depuis la banque sera un simple ajout.
- **Colonnes techniques hors diagramme** : `tentatives_qcm.date_limite` (filet si
  la clé Redis du timer disparaît), `tentatives_qcm.plan_tirage` (tirage figé :
  un rechargement ne re-mélange pas), `options.ordre`, `qcm_questions.ordre`,
  `est_reussie` (présent dans DS-02), `formation_formateurs.affecte_par`.
- **Classe `ModuleFormation`** (table `modules`) : évite la collision avec le
  décorateur `@Module` de NestJS.
- **`est_correcte` en `select: false`** : aucune requête TypeORM ne charge la
  bonne réponse par défaut ; le scoring et l'éditeur formateur doivent écrire
  `addSelect('option.estCorrecte')`. Première barrière, avant les DTO et le test
  de non-fuite HTTP d'US-QCM-06.
- **Index unique partiel `WHERE statut = 'EN_COURS'`** : deux démarrages
  simultanés ne peuvent pas créer deux tentatives, même en concurrence.
- **RESTRICT sur les données certifiantes** (inscriptions, tentatives, options
  cochées), **CASCADE sur les compositions** (dossier de conception §5.4).
- **`numericTransformer`** : `pg` renvoie les `numeric` en chaînes ; sans
  conversion, un score se comparerait à un seuil comme du texte.
- **FK sans relation TypeORM** pour `qcm.formateur_id` et
  `formation_formateurs.affecte_par` (SET NULL posé par la migration), comme
  `demandes_role.traite_par` : je n'ai jamais besoin de charger ces comptes.
- **Hors périmètre, volontairement** : le trigger d'immuabilité des tentatives
  NOTEE (migration d'US-QCM-08).

## Fichiers
- `apps/api/src/database/enums/` : `statut-formation`, `statut-inscription`,
  `statut-qcm`, `affichage-resultats`, `type-question`, `statut-tentative` (nouveaux)
- `apps/api/src/database/entities/` : `formation` (modifié) ; `module-formation`,
  `inscription`, `affectation-formateur`, `qcm`, `configuration-anti-fraude`,
  `question`, `qcm-question`, `option`, `tentative-qcm`, `reponse`,
  `reponse-option` (nouveaux)
- `apps/api/src/database/transformers/numeric.transformer.ts` + spec (nouveaux)
- `apps/api/src/database/migrations/1785900000000-AddFormationsInscriptions.ts` (nouveau)
- `apps/api/src/database/migrations/1786000000000-AddQcmSchema.ts` (nouveau)
- `apps/api/test/data-model.e2e-spec.ts` (nouveau)

## Incidents
- **`.env` et clés JWT supprimés par un aller-retour sur la branche `docs`.**
  Symptômes : `docker compose` affiche « variable is not set » pour toutes les
  variables, puis `getaddrinfo ENOTFOUND postgres` et une API « unhealthy ».
  Cause : la branche `docs` SUIT `.env` et `secrets/*.pem` ; ces fichiers étant
  ignorés sur `main`, git les écrase à l'aller et les supprime au retour.
  Correctif immédiat : `git restore --source=origin/docs --worktree -- .env
  secrets/jwt_private.pem secrets/jwt_public.pem`, puis `restart api` et `up -d`.
  **Reste à faire** : retirer ces fichiers de `docs` et régénérer les secrets
  (ils sont dans l'historique poussé).
- **`formations` existait déjà** (squelette Sprint 1) : la migration fait un
  `ALTER`. Les deux colonnes obligatoires reçoivent un DEFAULT transitoire,
  retiré aussitôt, pour que l'ALTER passe même si la table contenait des lignes.
- **`psql` ouvre un pager** sur les sorties longues et bloque un collage de
  commandes : ajouter `-P pager=off`.

## Vérification
- **Migrations (Docker dev)** : `migration:run` → `AddFormationsInscriptions`
  puis `AddQcmSchema` exécutées ; `migration:revert` → `AddQcmSchema` annulée
  proprement ; nouveau `migration:run` → rejouée. `\dt` : **22 tables**.
- **Idempotence** : `up()` rejoué deux fois de suite sans erreur (base de test
  PostgreSQL 16 vierge).
- **Entités ↔ base** : `typeorm schema:log` ne signale que les deux FK posées
  volontairement par la migration seule (`formateur_id`, `affecte_par`).
- **Lint** : `eslint --max-warnings 0` propre. **Tests unitaires** : 12 suites,
  113 tests.
- **e2e modèle** (`data-model.e2e-spec.ts`, 20 tests) : CHECK, unicités,
  RESTRICT/CASCADE, tentative EN_COURS unique, `estCorrecte` absent de `find()`,
  d'une relation et d'un QueryBuilder, présent uniquement avec `addSelect`.
  Contrôle par mutation : en retirant `select: false`, le test de non-fuite
  échoue — il protège bien ce qu'il annonce.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run test:e2e -- data-model
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres psql -U cert_eet -d cert_eet -P pager=off -c "\dt"
```

## CI
Pipeline inchangé : `migration:run` joue les deux nouvelles migrations sur la
base vierge du job, puis `test:e2e` exécute `data-model.e2e-spec.ts` avec les
autres suites. La spec n'a besoin ni de l'application Nest ni de Redis (elle
ouvre directement la DataSource) et nettoie ses données avant et après.

## Suites
- US-FORM-01 (créer/configurer une formation) : première story à écrire dans ces tables.
- US-QCM-08 : trigger d'immuabilité des tentatives NOTEE (migration dédiée).
- US-QCM-02 (stretch) : table `banques_questions` + rattachement des questions.
- Chore sécurité : retirer `.env` et `secrets/` de la branche `docs`, régénérer
  les secrets OAuth, le mot de passe admin et les clés JWT.
