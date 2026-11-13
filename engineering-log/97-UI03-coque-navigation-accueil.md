# US-UI-03 — Coque de l'application : navigation simple par rôle, accueil « que faire maintenant »

## En une phrase
Chaque rôle ouvre l'application sur une page d'accueil qui commence par « À faire maintenant »
(chaque élément mène en un clic à l'écran qui permet de le faire) ; le menu de chaque rôle a
5 entrées au plus, dans le même ordre partout (« Accueil » en tête) ; chaque page interne affiche
un fil d'Ariane ; l'administration n'a plus deux barres de navigation empilées.

## Point de départ
Révision v2.2, E10, Must, 5 pts. Avant : l'apprenant arrive sur le catalogue (rien sur ce qu'il a à
faire) ; formateur et administrateur arrivent sur un tableau de bord d'indicateurs ; l'administration
empile l'en-tête (5 liens) et une barre de 11 onglets.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Accueil apprenant | Bandeau sur le catalogue · **page `/mon-espace`** | Nouvelle page `/mon-espace` : « Bonjour, … », « À faire maintenant », « Mes formations en cours » (progression, « Continuer »), lien vers le catalogue. `pageAccueilDuRole(APPRENANT)` = `/mon-espace`, **à l'identique** côté web (`components/navigation.ts`) et api (`common/navigation/page-accueil-role.ts` + son test). `/catalogue` reste ouvert à tous (aucune redirection à garder : aucune route supprimée). `/mon-espace` réservée à l'apprenant (`lib/acces.ts`) : un autre rôle est renvoyé vers sa page. |
| D2 | « À faire » apprenant | — | Calculé dans le navigateur à partir d'API existantes (`/mes-inscriptions` puis `/formations/:id/mon-espace` de chaque inscription EN_COURS) : QCM à reprendre (tentative en cours), QCM ouvert à passer (fenêtre OUVERTE, à faire ou échoué avec tentatives restantes), livrable à rendre (dépôt OUVERT ou EN_RETARD sans livrable), nouveau feedback à lire. Tri : à reprendre, en retard, puis échéance la plus proche. Règle pure `aFaireApprenant`. |
| D3 | « À faire » formateur | — | En tête du tableau de bord (sa page d'accueil), depuis `/formateur/tableau-de-bord` : livrables à corriger et tentatives à évaluer par formation (→ la formation), alertes de décrochage ouvertes (→ `/formateur/alertes`). Règle pure `aFaireFormateur`. Les indicateurs restent dessous. |
| D4 | « À faire » administrateur | — | En tête du tableau de bord, depuis `/admin/tableau-de-bord` : demandes de rôle, d'affectation, propositions de formation en attente (→ leur écran), alertes système (certificats en échec, etc., → écran concerné). Règle pure `aFaireAdministrateur`. |
| D5 | Rien à faire | — | État vide (`.etat-vide`, US-UI-02) : « Rien à faire pour l'instant » + une phrase utile + une action (apprenant : « Parcourir le catalogue »). |
| D6 | Menus | — | 5 entrées, « Accueil » toujours en tête. Apprenant : Accueil · Mes formations · Mes évaluations · Mes certificats · Catalogue. Formateur : Accueil · Mes formations · Alertes · Rapports · Catalogue. Administrateur : Accueil · Utilisateurs · Formations · Certificats · Pilotage. Le libellé « Tableau de bord » devient « Accueil » dans le menu (la page garde son titre). L’administrateur n’a plus « Catalogue » dans son menu (il gère les formations dans « Formations ») ; `/catalogue` lui reste ouvert. L’audit de navigation le confirme : les 11 pages d’administration restent atteignables depuis l’accueil. |
| D7 | Administration | Garder les 11 onglets · **sous-navigation de section** | La barre de 11 onglets est remplacée par une sous-navigation qui ne montre que les pages de la section courante : Utilisateurs (Comptes, Demandes de rôle), Formations (Formations, Demandes d'affectation, Propositions), Certificats, Pilotage (Rapports, Prédiction du risque, Générations IA, Journal d'audit). Toutes les pages restent atteignables, en deux clics au plus. |
| D8 | Fil d'Ariane | — | Composant `FilAriane` affiché sous l'en-tête sur toute page interne d'un connecté (pas sur la page d'accueil du rôle) : « Accueil › Section › Page », déduit du menu du rôle et de la sous-navigation (règle pure `filAriane`), `nav aria-label="Fil d'Ariane"`, dernier élément `aria-current="page"`. Les pages profondes (fiche, éditeur) gardent leur lien « Retour » jusqu'à leur story de parcours. |
| D9 | Mobile | — | Menu mobile existant, mêmes 5 entrées ; sous-navigation d'administration défilante sans débordement de page ; fil d'Ariane qui revient à la ligne. |
| D10 | Tests | — | Règles pures testées par `tsc` + recette Playwright (contenu de « À faire », clic sur chaque élément, 1280 / 390 px) ; `page-accueil-role.spec.ts` mis à jour (même valeur que le web) ; audit de navigation mis à jour (accueil apprenant `/mon-espace`) et à 0 problème. Aucune autre API changée. |

## Fichiers
- `apps/web/src/components/navigation.ts` (menus, `SOUS_NAVIGATION_ADMIN`, `sectionDe`,
  `filAriane`, accueil apprenant), `lib/a-faire.ts` (règles pures), `components/AFaireMaintenant.tsx`,
  `components/FilAriane.tsx`, `components/SiteHeader.tsx` (menu mobile sans doublon « Accueil »),
  `app/mon-espace/page.tsx` (nouveau), `app/formateur/tableau-de-bord/page.tsx`,
  `app/admin/tableau-de-bord/page.tsx`, `app/admin/layout.tsx`, `app/layout.tsx`, `lib/acces.ts`,
  `app/globals.css` (section US-UI-03)
- `apps/api/src/common/navigation/page-accueil-role.ts` (+ spec) : `/mon-espace`, identique au web
- `outils/recette/audit-navigation.js` (accueil apprenant, `/mon-espace` interdite au formateur)
- `docs/GUIDE_DEMO.md`, backlog (E10), `CHANGELOG.md`

## Vérification
- `tsc`, lint api et web, `next lint`, `next build` ; unitaires **125 suites / 1 584 tests**.
- Playwright `ws/pw/ui03.js`, 1280 / 390 px, trois rôles : arrivée sur la bonne page, « À faire
  maintenant » en haut de page, menu de 5 entrées dans l'ordre (en-tête et menu mobile), chaque
  élément « à faire » mène à son écran (alertes, formation à corriger, demandes d'affectation, de
  rôle, propositions), sous-navigation « Pilotage » et fil d'Ariane « Accueil › Pilotage ›
  Prédiction du risque », pas de sous-navigation pour une section d'une page, apprenant renvoyé
  d'une page admin vers `/mon-espace`, formateur renvoyé de `/mon-espace` ; console propre.
- Données vérifiées par l'API : l'apprenante de démonstration principale n'a réellement rien à
  faire (QCM réussi, livrable rendu → état vide) ; `demo-apprenant3` a un QCM à retenter et un
  livrable à rendre (deux éléments, captures).
- e2e complet : **77 suites / 907 tests** (906 + 1 ignoré). Audit de navigation : **104 pages, 0 problème** (11 pages d'administration atteintes depuis l'accueil).
