# IA — Prédiction des apprenants à risque (partie données et modèle)

## En une phrase
Un modèle LightGBM entraîné sur OULAD **suggère** au formateur les apprenants à risque d'échec ou
d'abandon, avec un niveau (faible / moyen / élevé) et trois raisons en français. Il repère 2 à 3 fois
plus d'apprenants à risque que les règles actuelles du module `pilotage`, qu'il complète sans les
remplacer. Cette entrée couvre la partie données et modèle (`ml/`) ; le service et l'intégration
suivront.

## Point de départ
- Cert_EET signale déjà le décrochage par **4 règles fixes** (`alertes.regles.ts`, enum
  `CritereAlerte`) : inactivité de plus de 7 jours, 2 échecs consécutifs, livrable non rendu 48 h
  après la date limite, chute de 20 points.
- Pas encore assez de données Cert_EET pour entraîner un modèle : j'utilise **OULAD**
  (32 593 inscriptions, CC BY 4.0, Kuzilek et al. 2017).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Variables | Seulement des signaux disponibles **aussi** dans Cert_EET (audit `ml/AUDIT_DONNEES.md`) : jours actifs (pas de clics), remises, retards, notes. |
| D2 | Variables personnelles | Genre, âge, handicap, région, IMD : **exclus des entrées**. Genre, âge et handicap servent uniquement à l'audit d'équité. |
| D3 | Étiquette | À risque = *Fail* ou *Withdrawn* (52,8 % des inscriptions). |
| D4 | Prédiction précoce | Dates de coupure J+14, J+28, J+42, J+56 ; seuls les apprenants encore inscrits ; aucune information postérieure. |
| D5 | Anti-fuite | **Test** : variables identiques avec ou sans les données futures, aux 4 dates (notebook 02). |
| D6 | Code partagé | Calcul des variables dans `ml/risque/variables.py`, utilisé par les notebooks, les tests et l'entraînement. |
| D7 | Découpage | Chronologique : entraînement 2013B, 2013J, 2014B ; test 2014J. Validation croisée groupée par session. |
| D8 | Modèles | Règles reproduites (référence), régression logistique, LightGBM (retenu par PR-AUC en validation croisée : 0,740 contre 0,731). Graine 42, mode déterministe. |
| D9 | Seuil | 0,355, choisi sur l'entraînement pour viser 80 % de rappel (un apprenant manqué coûte plus qu'une fausse alerte). |
| D10 | Affichage | Niveaux plutôt que pourcentages : calibration fiable seulement jusqu'à environ 0,65. |
| D11 | Explicabilité | SHAP natif de LightGBM (aucune dépendance en plus) ; 3 raisons en français (`ml/risque/explications.py`). |
| D12 | Données | CSV OULAD jamais versionnés (`ml/donnees/` dans `.gitignore`) ; modèle et fiche versionnés. |

## Résultats (test 2014J)
| Date | Rappel modèle | Rappel règles | PR-AUC modèle | PR-AUC règles |
|---|---|---|---|---|
| J+14 | 0,87 | 0,28 | 0,54 | 0,47 |
| J+28 | 0,76 | 0,39 | 0,58 | 0,53 |
| J+42 | 0,73 | 0,51 | 0,61 | 0,56 |
| J+56 | 0,79 | 0,58 | 0,70 | 0,59 |

Équité : écart de rappel entre groupes de 1,4 point (genre), 4,3 (âge) et 0,3 (handicap).

## Limites
- Précision d'environ 0,5 : une alerte sur deux est une fausse alerte. Le formateur valide toujours.
- Objectif de 80 % de rappel non atteint à J+28 et J+42 : le test compte moins d'apprenants à risque
  (40,2 %) que l'entraînement (45,4 %).
- Plus de fausses alertes pour les femmes (précision 0,47 contre 0,59) ; écart documenté, non
  corrigé par un seuil par genre.
- Décalage de domaine (Royaume-Uni à distance, sessions de 9 mois ↔ formation continue en Tunisie) :
  réentraînement prévu sur les données Cert_EET (`ml/FICHE_MODELE.md`, §11).

## Fichiers
- `ml/AUDIT_DONNEES.md`, `ml/FICHE_MODELE.md`
- `ml/notebooks/01_exploration` à `04_explicabilite_equite`
- `ml/risque/variables.py`, `ml/risque/explications.py`
- `ml/modeles/risque_v1.joblib`, `ml/modeles/risque_v1.json`
- `ml/requirements-dev.txt` (Python 3.13, versions exactes)
---

# Étape 11 — Service `ml` (conteneur séparé)

## Ce qui a été fait
- `ml/service/` : FastAPI qui charge `risque_v1.joblib` et `risque_v1.json` une seule fois au
  démarrage, et vérifie que les 16 entrées de la fiche sont exactement celles du modèle, dans le même
  ordre (sinon le service refuse de démarrer).
  - `GET /sante` → `{statut, version_modele, seuil, nb_entrees}`.
  - `POST /predire` → `{apprenants: [{identifiant, 16 variables}]}` → pour chacun : probabilité,
    niveau, 3 raisons. Niveau et raisons : `risque/explications.py` (aucune duplication).
  - Explications : SHAP natif `predict(X, pred_contrib=True)`, sans la bibliothèque `shap`.
  - Validation Pydantic stricte : champ inconnu refusé, bornes (taux entre 0 et 1, notes sur 100,
    compteurs positifs, `a_au_moins_une_note` ∈ {0, 1}), NaN/infini refusés ; seuls `score_moyen`
    et `tendance_score` peuvent être vides. Lot de 1 à 500 apprenants (`ML_TAILLE_LOT_MAX`).
    Erreur 422 lisible : `{erreur, details: [{champ, message}]}`, sans renvoyer les valeurs reçues.
  - Documentation OpenAPI désactivée (service interne).
- Image Docker (`ml/service/Dockerfile`, contexte `ml/`) : `python:3.13-slim` + `libgomp1`,
  utilisateur système non root, `HEALTHCHECK` sur `/sante`, seulement `service/`, `risque/`,
  `modeles/` (`.dockerignore` exclut données, notebooks, tests).
- `docker-compose.yml` : service `ml` sur `cert_eet_net` uniquement, aucun port publié, système de
  fichiers en lecture seule, contrôle de santé. L'api **ne dépend pas** de `ml` (`depends_on`
  inchangé). Recette : `restart: unless-stopped`. Dev : rien de plus (même image).
- CI : nouveau job « ML (pytest + image) » : pytest, construction de l'image, démarrage, attente de
  l'état `healthy`, appel de `/sante`, vérification « pas root » et « pas de données ». Les jobs
  existants ne sont pas modifiés.
- Tests (`ml/service/tests`, `ml/tests`) : santé, prédiction (valeurs connues, valeurs vides, lot,
  ordre conservé, lot maximal), validation (8 cas + champ manquant + NaN + lot vide/trop grand),
  cohérence SHAP (base + contributions = score brut, sigmoïde = probabilité), niveaux, raisons.
  Le test anti-fuite de `variables.py` est sauté si les CSV OULAD sont absents (cas de la CI).

## Décisions
| # | Point | Décision |
|---|---|---|
| D13 | Versions | scikit-learn 1.9.1, LightGBM 4.7.0, numpy 2.5.4 : identiques à l'entraînement. Reste figé avec `uv pip compile --exclude-newer 2026-10-28` (tout est publié depuis au moins 2 semaines). |
| D14 | pandas | **Pas dans le service** : pandas 3.1.1 (version d'entraînement) a moins de 2 semaines, et le modèle se charge et prédit sans pandas (matrice numpy dans l'ordre de la fiche ; l'avertissement « feature names » est filtré de façon ciblée). Résultats identiques vérifiés par le test de cohérence. |
| D15 | Port | 8000, interne. Pas de port publié, même en dev : vérification par `docker compose ps ml` (état `healthy`). |
| D16 | Image en local | Le registre Docker n'est pas joignable depuis mon environnement de travail : l'image est construite et contrôlée par la CI (job ML). |
