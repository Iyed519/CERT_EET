# US-QCM-17 — Apprenants signalés par l'IA dans les listes du formateur

## En une phrase
Demande du propriétaire (14/11/2026) : en parcourant ses listes, le formateur doit voir tout de suite
quel apprenant a été signalé par la surveillance par IA, sans passer par l'onglet des alertes. Un
signal rouge « N alertes IA à examiner » apparaît sur la ligne de la tentative et sur la ligne de
l'apprenant dans le suivi de la formation ; il devient gris quand tout a été examiné.

## Décisions (table D)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Où signaler | onglet seul ; listes | **Liste des tentatives d'un QCM** (ligne de la tentative, liseré rouge, filtre « Signalées par l'IA (n) ») et **suivi pédagogique** de la formation (ligne de l'apprenant, filtre « Signalés par l'IA (QCM) », ligne de KPI « Alertes de surveillance (IA) à examiner », fiche de l'apprenant). |
| D2 | Ce qui compte | toutes ; à examiner | Les deux : **rouge** s'il reste des alertes NOUVEAU (« 2 alertes IA à examiner »), **gris** si toutes ont été examinées (« 3 alertes IA examinées »), rien sinon. Les filtres et le liseré ne retiennent que les alertes à examiner. |
| D3 | API | nouvel appel par ligne ; champ dans les listes existantes | Champ ajouté aux réponses existantes, une requête groupée de plus par liste : `alertesSurveillance { total, aExaminer }` sur `GET /api/formateur/qcm/:qcmId/tentatives` ; `surveillance { alertes, aExaminer }` par apprenant et `kpis.surveillanceAExaminer` sur `GET /api/formateur/formations/:id/suivi` ; `surveillance` dans la fiche. Accès inchangé (formateur affecté ou administrateur, garde existant). |
| D4 | Apprenant | — | **Jamais** dans ses réponses : l'historique de l'apprenant partage la lecture des tentatives, les comptes ne sont ajoutés que dans `tentativesDuQcm` (formateur). Vérifié en e2e. |
| D5 | Fraîcheur | — | Liste des tentatives rechargée à la fermeture du détail et à chaque examen d'alerte : le signal passe au gris immédiatement. Dans le suivi, le signal mène à « Alertes › Surveillance des QCM ». |
| D6 | Constat en recette | — | Fiche de l'apprenant : « Aucune connexion depuis undefined jours » pour les alertes de décrochage sans faits détaillés (données de démonstration). `faitsAlerteFr` écrit désormais une phrase générale quand les faits manquent (inactivité, échecs, retard). |

## Fichiers
- **API** : `tentatives/historique/historique-tentatives.service.ts` (`LigneTentativeQcm`, comptes groupés), contrôleur ; `pilotage/suivi-formation.service.ts` (`SURVEILLANCE_PAR_APPRENANT`, `surveillance`, `surveillanceAExaminer`, fiche).
- **Web** : `components/AlertesSurveillance.tsx` (`SignalIA`, `onChange` de la section de tentative), `app/formateur/qcm/[id]/tentatives/page.tsx` (signal, liseré, filtre, rechargement), `app/formateur/formations/[id]/suivi/page.tsx` (signal, filtre, KPI, fiche), `lib/api.ts`, `lib/format.ts`, `globals.css`.

## Vérification
- Unitaires API 1 667 (comptes par tentative et par apprenant, pas de requête sans tentative, historique de l'apprenant sans comptes, fiche filtrée sur l'apprenant) ; e2e 80 suites (dont : comptes exacts après examen d'une alerte, QCM non surveillé à zéro, non affecté 403, suivi et fiche, apprenant sans comptes ; `suivi-formation` mis à jour pour le nouveau KPI).
- Mutation : **6 / 6** tués (filtre « à examiner », rattachement par tentative, formation, apprenant de la fiche, KPI).
- Recette (build de production, alerte réelle produite par la caméra) : signal rouge, liseré et filtre dans la liste des tentatives ; signal, filtre, KPI et fiche dans le suivi ; examen depuis le détail → signal gris, plus de liseré ; 1280 et 390 px relus ; `audit-navigation.js` formateur : 0 problème.
