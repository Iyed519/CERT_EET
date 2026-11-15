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
- **Web** : `app/admin/tableau-de-bord/page.tsx` (réécrite : `AFaireMaintenant` dans `#alertes`, `SectionPage` « Indicateurs » avec `GroupeIndicateurs` et sélecteur de période, `SectionPage` « Activité »), `app/admin/formations/page.tsx` et `app/admin/certificats/page.tsx` (`?statut=`, garde `derniereDemande`), `app/formateur/apprenants/page.tsx`, `app/formateur/tableau-de-bord/page.tsx`, `app/formateur/formations/[id]/vue-d-ensemble/page.tsx` (D6), `lib/ui-regles.ts` (`acteurAudit`, `repartitionTexte`, `statutDepuisAdresse`, + tests), `app/globals.css` (bloc US-UX-06).
- **Docs** : `docs/GUIDE_DEMO.md` (§ 4.3 « Apprenants en cours », § 4.4), `docs/GUIDE_STYLE.md` (§ 10 : filtre dans l'adresse, activité récente), backlog, `CHANGELOG.md`. Le guide de style n'avait pas de capture du tableau de bord administrateur : la capture de référence est ajoutée avec US-UX-09.

## Vérification
- Web : tests unitaires **111 / 111** (`acteurAudit` : « Système », nom, nom seul, adresse ; `repartitionTexte` : zéros omis, minuscules, code inconnu, formateur de nombre, « aucun pour l'instant » ; `statutDepuisAdresse` : valeur connue, absente, vide, casse, inconnue) ; `tsc`, `next lint --max-warnings 0`, `next build`.
- Mutation à la main : **7 / 7 tués** (« Système / visiteur », adresse à défaut retirée, zéros gardés, minuscules retirées, repli vide, liste blanche retirée, formateur de nombre ignoré). La garde `derniereDemande` (composant) est vérifiée en recette : `?statut=OUVERTE` affiche bien 3 formations malgré le premier chargement sans filtre.
- Recette Playwright (build de production, 1280 / 390 px, captures relues) : ordre À faire maintenant (3 demandes) → Indicateurs (4 groupes, période 30 j, « Personnaliser ») → Activité ; « Formations ouvertes » mène à `/admin/formations?statut=OUVERTE` (filtre « Ouverte », 3 lignes) ; `/admin/certificats?statut=REVOQUE` active « Révoqués » ; activité : « Connexion — Amira Ben Salah · Connexions », « Certificat émis — Système · Certificats », pastille « Échec » sur une ligne d'échec (entrée d'audit d'essai insérée dans la base locale) ; aucun « Système / visiteur » ni code en capitales dans `main.site-main` ; aucun défilement horizontal ; aucune erreur console.
- API inchangée : ESLint `--max-warnings 0`, `tsc`, unitaires **130 suites / 1 671 tests**, e2e **81 suites / 940 tests** (+ 1 ignoré).
- Audit de navigation formateur + administrateur (1280 et 390 px) : **68 pages, 0 problème**.
- Inventaire comparé à « avant » : **295 conservées, 0 perdue, 0 plus loin** (le bandeau d'alertes et la carte « Demandes en attente » n'avaient pas d'action propre hors des liens repris par « À faire maintenant » et le menu ; « Prédiction du risque (IA) » est dans le menu latéral). Aucune équivalence ajoutée.
