# US-UX-06 — Tableau de bord administrateur réorganisé

## En une phrase
Le tableau de bord de l'administrateur sépare ce qui attend sa décision (« À faire maintenant », une
seule fois) de l'état de la plateforme (indicateurs groupés Personnes / Formations / Évaluations /
Certificats, chacun cliquable vers sa liste filtrée), puis montre l'activité avec des libellés
humains, une icône par catégorie et l'acteur — au lieu de trois répétitions des mêmes demandes et de
codes bruts.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Ordre | — | « À faire maintenant » → section « Indicateurs » (groupée, sélecteur de période compact dans son en-tête, comme le tableau de bord formateur de US-UX-03) → section « Activité » (récente, puis quotidienne). |
| D2 | Doublons | garder ; retirer | Retirer le bandeau des alertes système et la carte « Demandes en attente » : leurs chiffres et leurs liens sont déjà dans « À faire maintenant » (`aFaireAdministrateur` : une ligne par type de demande en attente, une par alerte système avec son écran). L'ancre `#alertes` (lien de repli des alertes sans écran) pointe sur « À faire maintenant ». Le lien « Prédiction du risque (IA) » est dans le menu latéral (Pilotage), même adresse. **Aucun chiffre ne disparaît.** |
| D3 | Indicateurs | 7 cartes `kpi` ; groupes | `GroupeIndicateurs` titrés Personnes (Comptes, Connectés sur la période) / Formations (Formations ouvertes, en brouillon, Inscriptions) / Évaluations (Réussite aux QCM, Livrables d'atelier) / Certificats (émis, révoqués, vérifications publiques). Les répartitions d'avant (par rôle, par statut) passent dans l'aide de la carte. Cartes cliquables vers la **liste filtrée** : `/admin/formations?statut=OUVERTE`, `?statut=BROUILLON`, `/admin/certificats?statut=ACTIF`, `?statut=REVOQUE` ; Comptes → `/admin/utilisateurs`, Connectés → `/admin/audit`. Les deux indicateurs d'évaluation n'ont pas de liste administrateur : pas de lien (une carte non cliquable n'a pas de flèche). |
| D4 | Activité récente | — | Une ligne : icône de la catégorie (`categorieAudit`, `ICONE_CATEGORIE_AUDIT`), libellé humain (`libelleActionAudit`), acteur (« Prénom Nom », l'adresse à défaut, **« Système »** sans compte — plus « Système / visiteur »), catégorie, heure ; pastille « Échec » (`PastilleStatut ton="danger"`) quand `resultat === 'Échec'` (valeur écrite par l'API, vérifiée dans `tableau-de-bord.service.ts`). La cible n'est pas dans la réponse de l'API : la catégorie la remplace, **sans changer l'API**. |
| D5 | Filtre depuis l'adresse | — | `?statut=` est lu au chargement par les pages Formations et Certificats (valeurs connues seulement) ; `?enEchec=true` (Certificats) inchangé. Le premier chargement (sans filtre) et celui du filtre partent presque ensemble : seule la **dernière** requête de liste est appliquée (compteur `derniereDemande`), pour qu'une réponse en retard n'écrase pas la liste filtrée. |
| D6 | Libellé « actifs » | garder ; préciser | Le mot avait deux sens : inscription EN_COURS (page *Apprenants*, tableau de bord formateur) et « en cours **et** connecté depuis moins de 7 jours » (onglet *Vue d'ensemble*, `suivi-formation.service.ts`). Désormais « En cours » pour le premier (phrase d'explication sur *Apprenants*), « Actifs ces 7 derniers jours » pour le second. Sur *Apprenants*, une formation sans inscrit dit que le suivi se remplira avec les inscriptions et son bouton « Suivi pédagogique » passe en secondaire. Aucune règle de calcul changée. |
| D7 | Conteneur | `<main>` ; `<div>` | `<div className="page">` : la coque fournit déjà le `<main>` (un seul repère principal par page). |

Pages touchées : `app/admin/tableau-de-bord/page.tsx` (réécrite), `app/admin/formations/page.tsx` et `app/admin/certificats/page.tsx` (`?statut=`, garde de la dernière requête), `app/formateur/apprenants/page.tsx`, `app/formateur/tableau-de-bord/page.tsx`, `app/formateur/formations/[id]/vue-d-ensemble/page.tsx` (libellés D6) ; CSS (bloc US-UX-06).

Arborescence de la page :
```
Tableau de bord (titre, phrase)
├── À faire maintenant (#alertes) — demandes de rôle / d'affectation / propositions, alertes système
├── Indicateurs [7 j · 30 j · 90 j · 1 an · Personnaliser]
│   ├── Personnes : Comptes → /admin/utilisateurs · Connectés sur la période → /admin/audit
│   ├── Formations : ouvertes → ?statut=OUVERTE · en brouillon → ?statut=BROUILLON · Inscriptions
│   ├── Évaluations : Réussite aux QCM · Livrables d'atelier
│   └── Certificats : émis → ?statut=ACTIF · révoqués → ?statut=REVOQUE · Vérifications publiques
└── Activité [Ouvrir le journal d'audit]
    ├── Activité récente (icône, libellé, acteur · catégorie, pastille Échec, heure)
    └── Activité quotidienne (graphique)
```

## Fichiers
_(complété en fin de story)_

## Vérification
_(complété en fin de story)_
