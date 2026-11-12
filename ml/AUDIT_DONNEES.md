# Étape 1 — Audit des données de Cert_EET et correspondance avec OULAD

> Objectif : ne garder comme variables du modèle que des signaux **disponibles des deux côtés**
> (OULAD pour l'entraînement, Cert_EET pour l'usage réel). Audit fait sur `main` au commit `6ab3651`.

## 1. Ce que Cert_EET enregistre réellement par apprenant

| Signal | Où (table / colonne) | Granularité | Remarque |
|---|---|---|---|
| Connexions | `audit_logs` (`action = 'LOGIN'`, `horodatage`, `user_id`) | chaque connexion | Liée à l'utilisateur, **pas à la formation**. |
| Renouvellement de session | `refresh_tokens.created_at` (rotation à chaque rafraîchissement) | chaque rotation | Montre une activité même sans nouvelle connexion. |
| Dernière connexion | `users.derniere_connexion` | une valeur (écrasée) | Utilisée par la règle `INACTIVITE` ; pas d'historique. |
| Inscription | `inscriptions.date_inscription`, `statut` (EN_COURS / TERMINEE / SUSPENDUE), `date_echeance` | par formation | La **date de suspension** n'est pas une colonne (seulement dans l'audit). |
| Progression | `inscriptions.taux_avancement` = QCM réussis / QCM publiés | par formation | Valeur courante seulement, pas d'historique. |
| Tentatives de QCM | `tentatives_qcm` (`date_debut`, `date_fin`, `score` 0–100, `est_reussie`, `statut`) | par tentative | Les QCM **n'ont pas de date limite** (seulement une durée de tentative). |
| Livrables d'atelier | `livrables` (`date_soumission`, `en_retard`, `version`) + `ateliers.date_limite` | par remise | Seuls les ateliers ont une échéance. |
| Notes d'atelier | `corrections.score_total` (sur 100), `date_finalisation` | par livrable | Même échelle que les QCM. |
| Consultation des retours | `consultations_feedback.date_consultation` | par consultation | Petit signal d'engagement. |
| Consultation des ressources | **non enregistrée** (seul `ACCES_RESSOURCE_REFUSE` est audité) | — | Manque principal (voir §4). |
| Profil | `users.date_naissance`, `niveau_etudes`, établissement | une valeur | **Exclu** des entrées (équité) ; pas de genre ni handicap dans Cert_EET. |
| Alertes existantes | `alertes_decrochage` (critère, données, statut, dates) | par alerte | Sert de **référence** à comparer au modèle. |

Règles actuelles (`alertes.regles.ts`, `alertes-decrochage.service.ts`, enum `CritereAlerte`) :
`INACTIVITE` (aucune connexion depuis > 7 jours), `ECHECS_QCM` (2 dernières tentatives notées en échec),
`LIVRABLE_EN_RETARD` (atelier non rendu 48 h après la date limite), `SCORE_EN_CHUTE`
(dernière note ≤ moyenne des précédentes − 20 points, au moins 3 notes).
Le balayage est un `setInterval` (`alertes-balayage.service.ts`) ; la file de l'API est **BullMQ** 6.4.2.

## 2. Correspondance OULAD ↔ Cert_EET

OULAD : Kuzilek J., Hlosta M., Zdrahal Z., *Open University Learning Analytics dataset*, Sci. Data 4:170171 (2017),
doi:10.1038/sdata.2017.171 — licence **CC BY 4.0** (réutilisation libre avec citation).

| OULAD (table.colonne) | Cert_EET | Transposable ? |
|---|---|---|
| `studentVle` (date, sum_click par jour) | jours avec `LOGIN` ou rotation de `refresh_tokens` | **Oui, sous forme « jour actif / inactif »** (pas le volume de clics) |
| `studentVle` par `vle.activity_type` (resource, quiz, forum…) | — (consultations non tracées) | Non (à ajouter) |
| `assessments` type CMA (quiz notés auto) + `studentAssessment.score` | `tentatives_qcm.score`, `est_reussie` | Oui (score /100, échec si < seuil ; OULAD : < 40) |
| `assessments` type TMA (devoir corrigé par tuteur) + `date` (échéance) | `ateliers.date_limite` + `livrables` + `corrections.score_total` | Oui (rendu / non rendu / retard / note) |
| `studentAssessment.date_submitted` vs `assessments.date` | `livrables.date_soumission` vs `ateliers.date_limite` (`en_retard`) | Oui |
| `assessments` type Exam | — | Non (et postérieur à la date de prédiction) |
| `studentRegistration.date_registration` | `inscriptions.date_inscription` − `formations.date_debut` | Oui (inscription tardive / précoce) |
| `studentRegistration.date_unregistration` | suspension (audit) | **Non comme entrée** : c'est l'issue elle-même (fuite) |
| `courses.module_presentation_length` | `formations.date_debut` / `date_fin` / `duree_heures` | Oui, pour normaliser le temps écoulé |
| `studentInfo.final_result` | `inscriptions.statut` + certificat obtenu / non | Étiquette (Fail ou Withdrawn = « à risque ») |
| `studentInfo.num_of_prev_attempts`, `studied_credits` | — | Non |
| `studentInfo.gender`, `age_band`, `disability`, `region`, `imd_band`, `highest_education` | (date_naissance, niveau_etudes) | **Exclu des entrées** ; genre/âge/handicap gardés pour l'**audit d'équité** sur OULAD seulement |

## 3. Variables retenues (calculées à chaque date de coupure J, avec uniquement les données ≤ J)

| Variable | Sens | Lien avec une règle actuelle |
|---|---|---|
| `jours_actifs` | nombre de jours avec activité depuis le début | — |
| `taux_jours_actifs` | jours actifs / jours écoulés | — |
| `jours_depuis_derniere_activite` | ancienneté de la dernière activité (plafonnée) | `INACTIVITE` |
| `jours_actifs_14_derniers` | activité récente (tendance) | `INACTIVITE` |
| `delai_inscription` | jours entre inscription et début de session (négatif = avant) | — |
| `nb_evaluations_echues` | évaluations à échéance ≤ J | — |
| `taux_remise` | évaluations rendues / échues | `LIVRABLE_EN_RETARD` |
| `nb_non_rendues` | échues et non rendues à J | `LIVRABLE_EN_RETARD` |
| `nb_remises_en_retard` | rendues après l'échéance | — |
| `score_moyen` | moyenne des notes connues à J (/100) | — |
| `nb_echecs`, `echecs_consecutifs_fin` | notes sous le seuil ; série finale d'échecs | `ECHECS_QCM` |
| `tendance_score` | dernière note − moyenne des précédentes | `SCORE_EN_CHUTE` |
| `a_au_moins_une_note` | indicateur « pas encore de note » (évite de confondre absence et 0) | — |

Le temps est exprimé **en jours depuis le début de la session** des deux côtés. Les coupures (J+14, J+28, J+42…)
seront aussi exprimées en fraction de la durée de session pour l'étape 3 (formations Cert_EET plus courtes qu'OULAD).

## 4. Suivi d'activité à ajouter dans Cert_EET (pour un futur réentraînement sur nos données)

1. **Consultation de ressource réussie** : événement `RESSOURCE_CONSULTEE` (ressource, nature, formation, horodatage)
   — équivalent direct de `studentVle`, signal le plus prédictif dans la littérature OULAD.
2. **Activité quotidienne par inscription** : table `activite_quotidienne (apprenant, formation, jour, nb_actions)`
   pour ne pas balayer `audit_logs` et pour rattacher l'activité **à une formation** (aujourd'hui une connexion vaut pour toutes).
3. **Date et motif de suspension** dans `inscriptions` (désinscription volontaire / retrait administratif) — étiquette propre.
4. **Résultat final par inscription** figé à la clôture (certifié / échec / abandon) — étiquette sans ambiguïté.
5. (Optionnel) **Échéance indicative des QCM** pour mesurer les QCM « dus mais non tentés ».

## 5. Limites connues dès cet audit

- Une connexion ≠ un clic : `jours_actifs` est un signal plus grossier côté Cert_EET (et le JWT court peut masquer
  une activité sans rotation). Le modèle n'apprend donc **pas** le volume de clics, seulement présence/absence par jour.
- Les QCM OULAD (CMA) ont une échéance ; ceux de Cert_EET non : `taux_remise` portera surtout sur les ateliers (TMA).
- Décalage de domaine (enseignement à distance au Royaume-Uni, 2013–2014 ↔ formation continue en Tunisie) : traité à l'étape 10.
