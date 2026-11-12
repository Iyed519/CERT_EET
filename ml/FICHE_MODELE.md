# Fiche du modèle — prédiction du risque de décrochage (`risque_v1`)

**Auteur :** Iyed Omri — PFE ESPRIT 2026 — projet Cert_EET
**Fichiers :** `ml/modeles/risque_v1.joblib` (modèle) et `ml/modeles/risque_v1.json` (fiche technique)

## 1. À quoi sert ce modèle
- **Usage prévu :** pendant une formation, **suggérer** au formateur les apprenants qui risquent
  d'échouer ou d'abandonner, avec un niveau de risque (faible / moyen / élevé) et trois raisons
  lisibles. Il **complète** les règles d'alerte existantes de Cert_EET (module `pilotage`), il ne les
  remplace pas.
- **Le modèle ne décide jamais seul.** Le formateur valide chaque suggestion.
- **Usages exclus :** noter, sanctionner ou exclure un apprenant ; refuser une inscription ou une
  certification ; toute décision automatique.

## 2. Données d'entraînement
- **OULAD** — Open University Learning Analytics Dataset : 32 593 inscriptions anonymisées,
  7 modules, sessions 2013–2014, enseignement à distance (Royaume-Uni).
- Référence : Kuzilek J., Hlosta M., Zdrahal Z. *Open University Learning Analytics dataset.*
  Scientific Data 4, 170171 (2017). doi:10.1038/sdata.2017.171
- **Licence : CC BY 4.0.** Les données brutes ne sont pas versionnées dans le dépôt.

## 3. Ce que le modèle prédit
- **Étiquette « à risque »** = résultat final *Fail* ou *Withdrawn*.
- **Dates de prédiction :** J+14, J+28, J+42, J+56 (jours depuis le début de la session).
- À chaque date, seuls les apprenants **encore inscrits** sont pris en compte, et seules les
  informations **antérieures** à la date sont utilisées. L'absence de fuite est **vérifiée par un
  test** : variables identiques avec ou sans les données futures (notebook 02).

## 4. Variables d'entrée (16)
Uniquement des signaux disponibles aussi dans Cert_EET :
- **activité** (jours actifs, pas de clics) ;
- **remises** (taux, non rendues, retards) ;
- **notes** (moyenne, échecs, tendance) ;
- **délai d'inscription** et **date de coupure**.

**Exclues volontairement :** genre, âge, handicap, région, indice de défavorisation, niveau d'études,
module. Le genre, l'âge et le handicap servent **uniquement** à l'audit d'équité.

## 5. Méthode
- **Découpage chronologique :** entraînement sur 2013B, 2013J et 2014B ; test sur 2014J (jamais vue).
- **Réglages :** validation croisée groupée par session (5 plis), critère PR-AUC.
- **Modèles comparés :** règles actuelles de Cert_EET, régression logistique, **LightGBM (retenu)**
  avec 200 arbres, 15 feuilles et un taux d'apprentissage de 0,05. Graine fixe (42), mode déterministe.
- **Seuil d'alerte : 0,355**, choisi sur l'entraînement (validation croisée) pour viser 80 % de rappel.

## 6. Performances sur le test (2014J)

| Date | Rappel modèle (règles) | Précision modèle (règles) | ROC-AUC modèle (règles) | PR-AUC modèle (règles) |
|---|---|---|---|---|
| J+14 | 0,87 (0,28) | 0,48 (0,61) | 0,66 (0,58) | 0,54 (0,47) |
| J+28 | 0,76 (0,39) | 0,54 (0,63) | 0,72 (0,63) | 0,58 (0,53) |
| J+42 | 0,73 (0,51) | 0,57 (0,62) | 0,74 (0,67) | 0,61 (0,56) |
| J+56 | 0,79 (0,58) | 0,56 (0,63) | 0,78 (0,70) | 0,70 (0,59) |

- **En résumé :** le modèle repère 2 à 3 fois plus d'apprenants à risque que les règles, au prix
  d'environ une fausse alerte sur deux.
- **Calibration :** fiable jusqu'à environ 0,65 ; au-delà, le modèle surestime le risque. D'où
  l'affichage par niveaux plutôt qu'en pourcentage. Score de Brier : 0,215.

## 7. Explicabilité
- Contributions **SHAP** calculées nativement par LightGBM (TreeSHAP), exactes à 10⁻¹⁴.
- Chaque suggestion affiche les **3 raisons** qui augmentent le plus le risque, en français simple
  (`ml/risque/explications.py`).
- **Variables les plus influentes :** moyenne des notes, taux de remise, activité récente.

## 8. Équité
- **Rappel quasi identique dans tous les groupes :** écart de 1,4 point (genre), 4,3 (âge,
  0–35 / 35+) et 0,3 (handicap).
- **Limite constatée :** précision plus faible pour les femmes (0,47 contre 0,59) et ROC-AUC plus
  faible (0,67 contre 0,77). Les femmes reçoivent donc plus de fausses alertes. Écart documenté, non
  corrigé par un seuil par groupe (cela imposerait d'utiliser le genre). À surveiller lors du
  réentraînement.

## 9. Limites et décalage de domaine
- **Contexte différent :** OULAD = enseignement à distance au Royaume-Uni, sessions d'environ 9 mois,
  2013–2014. Cert_EET = formation continue en Tunisie, formations plus courtes, publics adultes.
  Les performances mesurées sur OULAD **ne sont pas garanties** sur Cert_EET.
- **Durée des formations :** une même date (J+28) ne correspond pas au même avancement dans une
  formation courte. Le modèle doit être recalibré sur les durées réelles de Cert_EET.
- **Signal d'activité plus grossier :** Cert_EET enregistre des connexions, pas des interactions par
  ressource.
- **Performance modeste** (ROC-AUC de 0,66 à 0,78) : c'est le prix du choix de variables transposables.

## 10. Données personnelles
- Le modèle n'utilise **aucune donnée sensible** (ni genre, ni âge, ni handicap) et aucune donnée
  identifiante comme entrée : seulement des indicateurs d'activité et de résultats pédagogiques.
- Finalité limitée à l'**accompagnement pédagogique** ; scores stockés dans Cert_EET et visibles
  uniquement par les rôles autorisés (formateur, administrateur).
- Principes appliqués : minimisation, information des apprenants, intervention humaine
  (loi organique tunisienne n° 2004-63 sur la protection des données personnelles ; principes du RGPD).

## 11. Plan de réentraînement sur Cert_EET
1. Ajouter le suivi d'activité manquant (consultations de ressources, activité quotidienne par
   formation, date et motif de suspension, résultat final figé).
2. Accumuler des formations **clôturées** avec un résultat connu.
3. Réentraîner avec le **même code** (`ml/risque/variables.py`), sur un découpage chronologique.
4. Comparer au modèle actuel et aux règles, refaire l'audit d'équité, puis publier `risque_v2`.
5. Réévaluer au moins une fois par an.
## 12. Mise en service dans Cert_EET
- **Service `ml`** (`ml/service/`, conteneur séparé, réseau interne) : charge ce modèle et cette
  fiche au démarrage ; `GET /sante`, `POST /predire` (probabilité, niveau, 3 raisons). Versions de
  scikit-learn (1.9.1), LightGBM (4.7.0) et numpy (2.5.4) identiques à l'entraînement.
- **Variables côté Cert_EET** : calculées par l'API avec les mêmes définitions que
  `ml/risque/variables.py` (parité vérifiée : 0 écart sur 1 443 cas) à partir des connexions, des
  livrables d'atelier, des notes de QCM et d'atelier, de l'inscription et du début de formation.
- **Calcul** une fois par jour, jamais pendant une requête ; scores conservés 180 jours.
- **Affichage** : niveau en texte, 3 raisons, alertes des règles à côté, rappel « Suggestion du
  modèle, à valider par le formateur ». Pour un niveau faible, les raisons ne sont pas listées.
- **Repli** : service arrêté → aucune prédiction, les règles continuent ; l'écran l'indique.
- Démarche complète et questions du jury : `docs/IA_PREDICTION_RISQUE.md`.
