# US-UX-08 — Suivi, alertes, rapports, risque, IA, audit : pages homogènes et lisibles

## En une phrase
Les pages d'analyse suivent désormais le même modèle — en-tête (titre, phrase, action), bande
d'indicateurs cliquables, barre de filtres commune, liste compacte, fiche en fenêtre, état vide —,
le journal d'audit s'affiche en clair (icônes, libellés humains, « Système », catégories, pagination
lisible, plus aucun code brut à l'écran) et chaque modèle de rapport devient une carte qui dit à quoi
il sert, ses formats et son bouton de génération.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Modèle commun | — | `EnTetePage` → bande `GroupeIndicateurs` / `CarteIndicateur` (cliquable quand elle filtre la liste) → `BarreListe` (US-UX-07) → liste compacte (`table-compacte` ou cartes) → fiche en fenêtre → `EtatVide`. Pages : journal d'audit, rapports (administrateur, formateur, « Mes rapports »), alertes de décrochage et de surveillance, suivi pédagogique, prédiction du risque, générations IA (déjà mises au modèle de liste par US-UX-07). |
| D2 | Journal d'audit : catégories | filtrer la page affichée ; paramètre d'API | Un filtre par catégorie sur la seule page affichée serait trompeur (50 lignes sur des milliers). **Point d'API en lecture seule, additif** : `GET /api/admin/audit` (et l'export CSV, même DTO) accepte `actions=A,B,C` (codes en capitales, 100 au plus, validés), filtre `a.action = ANY(…)`. Les autres paramètres et les réponses ne changent pas. La page calcule la liste d'une catégorie avec `categorieAudit` sur `GET /api/admin/audit/actions` (existant). Testé en e2e (filtre, combinaison avec `action`, refus d'un code invalide). |
| D3 | Journal d'audit : affichage | — | Pastilles « Toutes » + 7 catégories (connexions, comptes, formations, évaluations, certificats, IA, sécurité) avec compteurs (`limit=1`, total seul) ; liste « Action » en libellés humains, groupés par catégorie, restreinte à la catégorie choisie ; acteur (adresse), cible, résultat, période, « Filtrer » et « Réinitialiser » dans un volet de filtres sous la barre ; chaque ligne : icône de catégorie, libellé humain (code en infobulle seulement), acteur (nom et adresse, « Système » sans compte, identifiant si le compte n'existe plus), cible, IP, `PastilleStatut` du résultat, « Voir » les détails ; `PaginationListe`. Indicateurs : « Entrées » (filtre courant) et « Échecs » (cliquable : filtre résultat « Échec »). |
| D4 | Rapports en cartes | formulaire + boutons radio ; cartes | Une carte par modèle (titre, à quoi il sert, formats PDF / CSV en pastilles, bouton « Générer ») ; la période reste commune, au-dessus des cartes (administrateur : institutionnels ; formateur : rapports de la formation, portée et apprenant / module dans la carte). Même appel d'API. « Mes rapports » : une carte par rapport, `PastilleStatut`, une action (« Télécharger » quand prêt). Équivalence « Demander le rapport » → « Générer ». |
| D5 | Alertes | boutons de filtre | `EnTetePage`, `BarreListe` + `FiltresPastilles` (Ouvertes / Traitées / Toutes, compteurs lus par les appels existants), critère en `PastilleStatut`, état vide `EtatVide`. Actions des cartes inchangées (Traiter, Rouvrir, Historique). Surveillance des QCM : même barre. |
| D6 | Suivi pédagogique et risque | — | Même en-tête et même barre (les listes « Afficher » / « Trier par » restent des listes, dans la barre) ; indicateurs existants inchangés ; aucune règle de calcul modifiée. |

Pages touchées : `app/admin/audit`, `app/admin/rapports`, `app/formateur/formations/[id]/rapports`, `app/rapports`, `app/formateur/alertes` (+ `surveillance`), `app/formateur/formations/[id]/suivi`, composants `ListeRapports`, `PredictionRisque` (en-tête de section), `AlertesSurveillance` ; API : `modules/audit` (DTO, service) + e2e.

Arborescence d'une page d'analyse :
```
En-tête (titre, phrase, [action])
Indicateurs : [Entrées n] [Échecs n →]
Barre : [Toutes n] [Connexions n] … [Sécurité n]   [Actualiser]
Filtres détaillés (volet) : Action · Acteur · Cible · Résultat · Du · Au  [Filtrer] [Réinitialiser]
Liste compacte : icône · libellé · acteur · cible · IP · pastille · Voir
Pagination : « n entrées · page p / q »  [Précédent] [Suivant]
```

## Fichiers
_(complété en fin de story)_

## Vérification
_(complété en fin de story)_
