# US-QCM-16 — Photos seulement en cas d'anomalie, détection du téléphone fiabilisée

## En une phrase
Après le premier essai réel du propriétaire (13/11/2026, soir) : un téléphone montré à la caméra n'a
déclenché aucune alerte, et les photos toutes les 2 minutes continuaient. Les photos périodiques sont
supprimées par défaut (une photo seulement en cas d'anomalie, une photo de contrôle par minute en
développement pour tester), la détection tolère les ratés du modèle, la photo envoyée est la meilleure
image de l'épisode, la page quittée est mesurée par les événements du navigateur, et le bandeau dit si
l'analyse tourne.

## Diagnostic (avant de coder)
- **Le modèle fonctionne** : exécuté dans Chrome sur des photos réelles (jeux de démonstration publics
  de TensorFlow et d'Ultralytics), il trouve 2 personnes (0,70 et 0,68) et un magazine (« book »,
  0,61). Mais ses scores sont **modestes** : EfficientDet-Lite0 est le modèle le plus léger.
- **La règle du téléphone était trop stricte** (US-QCM-15) : score ≥ 0,5 sur **toutes** les images
  pendant 2 s, analysées une fois par seconde. Une seule image ratée (fréquent avec ce modèle) remettait
  le compteur à zéro ; un téléphone montré brièvement, ou tenu avec un score de 0,3 à 0,5, ne donnait
  rien. Même défaut, moins visible, pour le livre et les personnes.
- **La photo** était prise au moment de la confirmation : le téléphone pouvait déjà avoir disparu.
- **Les photos toutes les 2 minutes** (US-QCM-12) avaient été gardées en plus des alertes ; le
  propriétaire ne les veut plus.
- **La page quittée** était jugée image par image, alors que le navigateur ralentit les minuteurs d'une
  page cachée.

## Décisions (table D)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Photos périodiques | garder 2 min ; supprimer | **0 par défaut** (`SURVEILLANCE_INTERVALLE_SECONDES=0`) : une photo seulement en cas d'anomalie. Réglage de test : 30 à 900 s ; **60 dans `docker-compose.dev.yml`** (une photo de contrôle par minute, demande du propriétaire « pour tester »). Dépôt d'une photo de contrôle quand c'est désactivé : 409, rien compté. Le formateur les voit sous « Voir les photos de contrôle ». |
| D2 | Cadence | 1 / s ; 2 / s | **2 analyses par seconde** (≈ 30 ms par image sur un portable). |
| D3 | Confirmation | présence ininterrompue ; nombre d'images avec tolérance | Épisode **tolérant** : un trou de moins de `toleranceMs` ne le clôt pas ; confirmation par un **nombre d'images** (`minVus`) sur une durée minimale. Téléphone : **score ≥ 0,30**, vu sur **2 images** (≈ 0,5 s), trous ≤ 1,5 s. Livre / document : score ≥ 0,40, 3 images sur 1,5 s. Plusieurs personnes : 3 images sur 1,5 s, trous ≤ 1 s. Absence (5 min) et caméra masquée (10 s) restent continues. Score minimal du moteur : 0,25. |
| D4 | Photo de l'alerte | image de la confirmation ; meilleure image | **Meilleure image de l'épisode** (score le plus haut, ou le plus de personnes), copiée en mémoire au fil de l'analyse : l'objet y est visible même s'il a disparu à la confirmation. |
| D5 | Page quittée | image par image ; événements | Événement `visibilitychange` : durée cachée mesurée au retour (≥ 5 s → alerte, photo 0,6 s après le retour). |
| D6 | Visibilité des pannes | silence ; bandeau | Bandeau de l'apprenant : « Analyse automatique : démarrage… / en marche / indisponible sur ce poste : votre formateur est prévenu ». Jamais ce qui a été détecté. Envoi d'une alerte en échec (réseau, 5xx) : un nouvel essai 3 s après, puis erreur dans la console. |
| D7 | Réglage sur un vrai poste | à l'aveugle ; diagnostic | **En développement seulement** (`NODE_ENV=development`, donc jamais dans l'image de recette ou de production) : ligne « Diagnostic » dans le bandeau avec ce que voit le modèle (personnes, score téléphone / livre et seuil, luminosité), pour tester avec une vraie caméra. |
| D8 | Textes | — | Consentement, aide de la configuration du QCM (« analyse par IA », plus « aucune analyse automatique »), section du formateur (« photos de contrôle »). |

## Fichiers
- **Web** : `lib/surveillance-regles.ts` (épisodes tolérants, `minVus`, meilleures images, `retourSurLaPage`), `lib/surveillance-regles.test.ts` (15 tests à 2 analyses / s), `lib/surveillance-ia.ts` (500 ms, meilleures images, visibilité, état, lecture de diagnostic), `components/SurveillanceWebcam.tsx`, `components/DemarrageTentative.tsx`, `components/ConfigurationModal.tsx`, `app/formateur/qcm/[id]/tentatives/page.tsx`, `lib/api.ts` (statut HTTP de l'envoi), `globals.css`.
- **API** : `config/configuration.ts`, `config/env.validation.ts` (0 ou 30–900, défaut 0), `surveillance.service.ts` (409 `MESSAGE_CONTROLE_DESACTIVE`).
- **Docker** : `docker-compose.dev.yml` (`SURVEILLANCE_INTERVALLE_SECONDES: "60"`, dev seulement).

## Vérification
- Unitaires API 1 663 ; e2e 80 suites (dont : défaut sans photo de contrôle → 409 et rien en base ; le scénario US-QCM-12 active le réglage de test à 120 s) ; règles web 15 tests.
- Mutation : règles web **12 / 12** tués ; API 2 / 3 (le survivant, défaut `'0'` dans `configuration.ts`, est équivalent : la validation Joi fixe déjà 0).
- **Recette réelle** (Chrome, caméra alimentée par de vraies photos, build de production) : deux personnes → « Plusieurs personnes » en ≈ 2 s avec la photo ; magazine sur une table → « Livre ou document » (0,64) avec la photo ; page cachée 6,5 s → « Page du QCM quittée » ; **aucune photo périodique** ; bandeau « Analyse automatique : en marche » ; aucune requête vers l'extérieur ; `audit-navigation.js` formateur et apprenant : 0 problème.
- **Non vérifiable ici** : un vrai téléphone (aucune photo de téléphone joignable depuis l'environnement ; un téléphone dessiné n'est pas reconnu, ce qui est normal). À tester avec la ligne « Diagnostic » sur le poste du propriétaire ; si le score reste sous 0,30, baisser `scoreTelephone`.
