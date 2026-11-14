# US-UX-03 — Tableau de bord formateur réorganisé

## En une phrase
Le tableau de bord du formateur se lit désormais de haut en bas dans l'ordre où il travaille : ce
qu'il doit faire, quatre indicateurs clés cliquables, ses formations en cartes visuelles (avancement
en jauge, compteurs cliquables), les apprenants à risque, puis l'activité et les statistiques avec un
sélecteur de période compact — au lieu de six cartes de même poids et d'un tableau à neuf colonnes.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Ordre de lecture | — | « À faire maintenant » → 4 indicateurs → « Mes formations » (cartes) → « Apprenants à risque (IA) » → « Activité et statistiques ». |
| D2 | Les 4 indicateurs | parmi les 6 cartes | **À corriger** (livrables à corriger ou en correction → *Livrables à corriger*, état alerte s'il y en a), **Alertes** (décrochage ouvertes + surveillance à examiner → *Alertes*), **Apprenants actifs** (actifs sur inscrits → *Apprenants*), **Réussite aux QCM** (sur la période, score moyen en aide → *Tentatives des QCM*). Chaque carte est un lien vers la liste correspondante (`CarteIndicateur`). |
| D3 | Ce que deviennent les autres chiffres | supprimés ; regroupés | **Rien n'est retiré** : formations par statut, nouveaux inscrits, tentatives notées, score moyen, tentatives à évaluer et certificats délivrés passent dans « Activité et statistiques », en liste compacte, avec le graphique d'activité quotidienne. |
| D4 | Période | formulaire entre « À faire » et les chiffres ; sélecteur compact | Dans l'en-tête de la section des statistiques : raccourcis 7 j / 30 j / 90 j / 1 an en pastilles, « Personnaliser » (volet `<details>`) pour les dates « Du / Au » et « Appliquer ». La période choisie s'affiche aussi sur l'indicateur de réussite (seul indicateur qui en dépend). |
| D5 | Formations en cartes | tableau ; cartes | Une carte par formation : titre (lien vers l'espace de la formation), pastille de statut, inscrits / actifs, **jauge d'avancement moyen**, réussite QCM, et des compteurs cliquables « à corriger » (→ *Livrables à corriger*), « alertes » (→ *Alertes*), « signalés par l'IA » (→ *Alertes › Surveillance des QCM*), affichés seulement s'ils ne sont pas nuls ; actions « Ouvrir » (principale) et « Suivi ». Les colonnes du tableau d'avant restent disponibles : bouton **« Vue tableau »** (choix mémorisé) qui rend le tableau d'avant, à l'identique. |
| D6 | Avancement moyen et « signalés par l'IA » | changer l'API du tableau de bord ; appels existants | Aucune API changée : ces deux chiffres viennent du **suivi pédagogique existant** (`GET /api/formateur/formations/:id/suivi`, non tracé), appelé en parallèle pour chaque formation après le tableau de bord ; moyenne des avancements des apprenants **en cours** (règle pure `avancementMoyen`, testée). En cas d'échec, la carte affiche « — » sans gêner le reste. |
| D7 | En-tête | 3 boutons ; aucun | Les liens « Mes formations », « Demander une formation », « Proposer une formation » sont dans le menu latéral (mêmes adresses) : l'en-tête garde le titre et la phrase, sans action principale concurrente d'« À faire maintenant ». |
| D8 | Mobile | — | Indicateurs sur deux colonnes, cartes empilées, sélecteur de période qui passe à la ligne ; aucun défilement horizontal (vue tableau dans `.table-wrap`). |

Pages touchées : `app/formateur/tableau-de-bord/page.tsx` ; nouvelle règle dans `lib/ui-regles.ts` ; CSS.

## Fichiers
- **Web** : `app/formateur/tableau-de-bord/page.tsx` (ordre, indicateurs `CarteIndicateur`, cartes `CarteFormation`, `VueTableau` = tableau d'avant à l'identique, sélecteur de période dans `SectionPage`), `components/PredictionRisque.tsx` (titre avec icône, comme les autres sections), `lib/ui-regles.ts` (`avancementMoyen`, + test), `app/globals.css` (bloc US-UX-03).
- **Docs** : `docs/GUIDE_DEMO.md` (§ 4.3), `docs/guide-style/formateur-accueil.png` (capture mise à jour), backlog, `CHANGELOG.md`.

## Vérification
- Web : tests unitaires 97 / 97 (`avancementMoyen` : seuls les apprenants en cours, arrondi, bornes, aucun → null) ; `tsc`, `next lint --max-warnings 0`, `next build`.
- Mutation : 3 / 3 tués (filtre « en cours » retiré, borne supérieure retirée, arrondi retiré).
- Recette Playwright (1280 / 390 px, captures relues) : ordre des sections (À faire maintenant, indicateurs, Mes formations, Apprenants à risque, Activité et statistiques) ; les 4 indicateurs mènent à *Livrables à corriger*, *Alertes*, *Apprenants*, *Tentatives des QCM* ; jauge 20 % et compteurs « 2 à corriger », « 2 alertes » sur « Développement web » ; « Vue tableau » rend les 9 colonnes d'avant et reste choisie après rechargement ; « 7 j » met à jour la période (« du 08/11/2026 au 14/11/2026 · 7 jours ») ; « Personnaliser » ouvre les dates ; aucune erreur console. Un premier rendu montrait une jauge écrasée (classe `.jauge` déjà prise par une liste de l'apprenant) : classes renommées `jauge-formation-*`.
- API inchangée : ESLint, `tsc`, unitaires **130 suites / 1 671 tests**, e2e **81 suites / 940 tests** (+ 1 ignoré).
- Audit de navigation formateur et administrateur (1280 et 390 px) : **68 pages, 0 problème** (apprenant, visiteur et compte MFA : pages non touchées, 0 problème à US-UX-02).
- Inventaire comparé à « avant » : **295 conservées, 0 perdue** (les liens « Mes formations », « Demander une formation », « Proposer une formation » de l'en-tête de page sont dans le menu latéral, mêmes adresses ; « Appliquer » et les raccourcis de période sont dans la section des statistiques).
