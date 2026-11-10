# Interface — en-tête commun, accueil par rôle, catalogue en cartes

## En une phrase
Toute l'application partage désormais un même en-tête (navigation du rôle,
recherche dans le catalogue, menu de compte avec déconnexion, menu mobile),
la connexion mène à une page d'accueil propre à chaque rôle, et le catalogue
présente les formations en cartes illustrées.

## Point de départ
Demande du porteur de projet (fin du Sprint 4) : une barre de navigation
inspirée des grandes plateformes de cours en ligne qui relie toute
l'application, une page d'accueil après connexion pour chaque rôle
(administrateur, apprenant, formateur), le catalogue en cartes avec une image
(provisoire), un style global cohérent sur toutes les pages — sans rien casser
de l'existant.

Avant : un bandeau vert avec cinq liens isolés (`AdminNav`, `ApprenantNav`,
`FormateurNav`, `RoleRequestNav`, `SecuriteNav`), aucun bouton de
déconnexion, une page d'accueil « squelette » (Sprint 1) et un catalogue en
tableau.

## Découpage
- **Aucun changement d'API ni de base.**
- `components/SiteHeader.tsx` : en-tête collant ; marque (lien vers
  l'accueil) ; recherche (`/catalogue?q=`) ; liens du rôle avec l'onglet actif
  souligné ; avatar et menu de compte (identité, rôle, liens secondaires,
  « Se déconnecter » -> `logout()` existant) ; visiteur : « Se connecter » /
  « S'inscrire » ; sous 920 px : bouton menu et panneau mobile.
- `components/navigation.ts` : liens par rôle (une seule source pour l'en-tête
  et le menu mobile), état actif, initiales.
- `app/page.tsx` + `components/accueil/*` : accueil public (présentation,
  atouts, étapes, appel à l'inscription) ; apprenant (formations en cours avec
  avancement, derniers certificats, formations à découvrir) ; formateur (ses
  formations : contenu, suivi, rapports ; outils) ; administrateur (chiffres
  clés du tableau de bord, accès à chaque écran d'administration).
- `components/FormationVisuel.tsx` : visuel de remplacement déterministe
  (dégradé et motif tirés de l'identifiant, initiales du titre).
- `app/catalogue/page.tsx` : cartes (visuel, titre, description, durée,
  période, places, seuil de certification, inscription) ; recherche.
- `app/layout.tsx` : en-tête, contenu, pied de page ; `globals.css` : section
  « Refonte visuelle » ajoutée à la fin (les classes existantes sont gardées).
- `lib/api.ts` : `restaurerSession()`.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Sécurité | Purement UI : les liens affichés selon le rôle ne protègent rien, l'API reste la barrière (`@Roles`, autorisation par ressource). |
| D2 | Session au rechargement | La session vit en mémoire seulement (anti-XSS, inchangé). L'en-tête la restaure une fois par chargement avec le refresh existant, **partagé** avec `apiFetch` (un seul appel à la fois : pas de double rotation du jeton) et **sans** redirection vers `/login` si le visiteur est anonyme. |
| D3 | Recherche | L'API du catalogue n'a pas de recherche : avec `?q=`, la page charge les 100 premières formations (maximum de l'API) et filtre titre et description sans casse ni accents. Une recherche côté serveur sera nécessaire au-delà. |
| D4 | Images | Pas de stockage d'image de formation pour l'instant : visuel généré, toujours le même pour une formation, décoratif (`aria-hidden`). Le jour où une image existe, `FormationVisuel` est le seul endroit à changer. |
| D5 | Non-régression | Pas de renommage ni de suppression de classes CSS utilisées : les écrans existants gardent leur structure ; seuls les jetons (fond, largeur utile 1180 px) et l'en-tête changent. Les cinq anciens composants de liens sont retirés (plus utilisés). |
| D6 | Accessibilité | Onglet actif `aria-current`, menus fermés par Échap, clic extérieur et changement de page, libellés de recherche pour lecteurs d'écran, `prefers-reduced-motion` respecté. |

## Fichiers
- `apps/web/src/components/SiteHeader.tsx`, `navigation.ts`, `FormationVisuel.tsx`, `accueil/AccueilPublic.tsx`, `accueil/AccueilApprenant.tsx`, `accueil/AccueilFormateur.tsx`, `accueil/AccueilAdmin.tsx`, `accueil/elements.tsx`
- `apps/web/src/app/layout.tsx`, `app/page.tsx`, `app/catalogue/page.tsx`, `app/globals.css`, `lib/api.ts`
- Retirés : `components/AdminNav.tsx`, `ApprenantNav.tsx`, `FormateurNav.tsx`, `RoleRequestNav.tsx`, `SecuriteNav.tsx`

## Incidents
- `useSearchParams` impose une frontière `Suspense` au build Next 14 : le
  catalogue est enveloppé.
- Les dates d'inscription sont des horodatages : `jourFr` (et non `dateFr`,
  prévu pour `AAAA-MM-JJ`).
- Menu mobile : la recherche héritait de `flex: 1 1 320px` dans une colonne
  (hauteur de 320 px) : base remise à `auto`.

## Vérification
- Web : `tsc`, `next lint` (0 avertissement), `next build`.
- API : aucun changement ; e2e complet non concerné.
- Navigateur 1280 / 390 px (Chromium, comptes de démonstration) : accueil
  public, accueil apprenant, formateur et administrateur, catalogue, menu de
  compte, menu mobile, déconnexion (retour à `/login`, puis accueil public),
  et pages existantes sous le nouvel en-tête (connexion, mes inscriptions,
  mes certificats, formations du formateur, utilisateurs, changer de rôle) :
  pas de défilement horizontal, aucune erreur de page.

## CI
Voir la PR.
