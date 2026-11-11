# US-NAV-01 — Redirection par rôle après connexion

## En une phrase
Chaque connexion mène à la page du rôle (administrateur : tableau de bord ;
formateur : ses formations, puis son tableau de bord avec US-DASH-03 ;
apprenant : catalogue), un connecté ne voit plus jamais l'écran de connexion
ni la page publique, et un visiteur arrêté sur une page protégée y revient
après s'être connecté.

## Point de départ
- Toutes les connexions (mot de passe, MFA, retour OAuth) poussaient vers `/`,
  qui affichait un « accueil du rôle » (Sprint 4) : un écran de plus avant
  le travail.
- Un connecté pouvait rouvrir `/login`, `/register` ou les pages de lien
  d'email et y voir un formulaire de visiteur.
- Un visiteur sur une page protégée voyait la page se rendre, ses appels
  partir sans jeton (401), puis un rechargement complet vers `/login` ; après
  connexion, il repartait de `/`.
- Un apprenant pouvait ouvrir `/admin/...` : l'api refusait (403), mais la
  page s'affichait avec une erreur.

## Découpage
- `components/navigation.ts` : `PAGE_ACCUEIL_PAR_ROLE` et
  `pageAccueilDuRole(role)`, **seule** source côté web (logo, « Accueil » du
  menu de compte et du menu mobile, redirections).
- `lib/acces.ts` (nouveau, fonctions pures) : pages de visiteur, pages
  protégées et rôles admis, `suiteSure` (chemin de retour interne seulement),
  `destinationApresConnexion`, `lienConnexion`, `decisionNavigation`.
- `components/SessionPrete.tsx` : après la restauration de session
  (US-AUTH-17), une seule décision pour toutes les pages ; pendant une
  redirection, le même chargement neutre (aucun clignotement).
- `app/login/page.tsx` : après mot de passe ou MFA, `router.replace` vers la
  destination (suite sûre et admise pour le rôle, sinon page du rôle) ; avant
  de partir chez Google / GitHub, la suite est retenue (sessionStorage).
- `app/oauth/callback/page.tsx` : même destination, suite relue une fois.
- `lib/api.ts` : une session morte en cours de route renvoie vers
  `/login?suite=<page>` ; une déconnexion volontaire vers `/login`.
- `app/page.tsx` : accueil public seulement ; les trois accueils de rôle du
  Sprint 4 (`AccueilAdmin`, `AccueilFormateur`, `AccueilApprenant`,
  `elements`) sont retirés (inaccessibles).
- Api : `common/navigation/page-accueil-role.ts`, même table pour les liens
  des emails ; l'email d'affectation d'un formateur mène à sa page.
- Activation de compte, réinitialisation et vérification d'email n'ouvrent
  pas de session : elles mènent à la connexion, qui applique la règle.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Une seule règle | La décision est prise à un seul endroit (`SessionPrete`, après la restauration) avec des fonctions pures ; aucune page n'a sa propre garde. Purement UI : l'api reste la barrière (`@Roles`, autorisation par ressource). |
| D2 | Page du formateur | `/formateur/formations` dans cette story : `/formateur/tableau-de-bord` n'existe qu'avec US-DASH-03 ; pointer dessus avant aurait créé un lien mort sur `main`. US-DASH-03 change la valeur à un seul endroit (web et api). |
| D3 | Chemin de retour | Interne seulement : un seul « / » en tête (« // » et « /\\ » désignent un autre site), aucun caractère de contrôle, 2 048 caractères au plus, jamais une page de visiteur. Une suite non admise pour le rôle (apprenant vers `/admin/...`) donne la page du rôle. |
| D4 | OAuth | La suite traverse l'aller-retour chez le fournisseur dans `sessionStorage` (aucun secret ; relue une fois puis effacée) plutôt que dans le paramètre `state` d'OAuth, géré par l'api. |
| D5 | Mauvais rôle | Page d'un autre rôle -> page du rôle, sans rendu ni appel refusé. `/formateur/*` et `/rapports` restent ouverts à l'administrateur (l'api les lui autorise). |
| D6 | Emails | L'api ne peut pas importer le web : même table recopiée (`page-accueil-role.ts`), commentaire croisé et test des trois valeurs. |
| D7 | Accueils de rôle | Retirés plutôt que laissés morts : leur contenu est couvert par la page de chaque rôle (tableau de bord administrateur, formations / tableau de bord du formateur, catalogue). Classes CSS gardées (règle D5 du journal 76). |

## Fichiers
- `apps/web/src/components/navigation.ts`, `components/SessionPrete.tsx`, `components/SiteHeader.tsx`, `lib/acces.ts` (nouveau), `lib/api.ts`, `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`, `app/oauth/callback/page.tsx`
- Retirés : `components/accueil/AccueilAdmin.tsx`, `AccueilApprenant.tsx`, `AccueilFormateur.tsx`, `elements.tsx`
- `apps/api/src/common/navigation/page-accueil-role.ts` (+ spec), `mail/mail.service.ts` (+ spec)

## Incidents
- Exporter une constante depuis `app/login/page.tsx` est refusé par Next
  (exports de page contrôlés) : la clé de stockage vit dans `lib/acces.ts`.
- `useSearchParams` dans `SessionPrete` : frontière `Suspense` dans le layout,
  avec le même chargement neutre en repli.
- Premier passage des mutations : « visiteur sur page protégée non redirigé »
  survivait — l'intercepteur 401 renvoyait quand même vers la connexion
  (défense en profondeur). Le scénario vérifie désormais qu'**aucun** appel
  à l'api ne part sans session : tué.

## Vérification
- Api : lint 0 avertissement, `tsc`, unitaires **114 suites / 1 451 tests**
  (+ 2), e2e complet en série **69 suites / 815 tests** (+ 1 ignoré).
- Mutations : **13 / 13 tuées** — web (11, par le scénario navigateur) :
  « // » admis, « /\\ » admis, chemin non interne admis, connecté sur `/`
  non redirigé, page de visiteur non redirigée, page d'un autre rôle
  affichée, visiteur non redirigé, suite perdue, accueil administrateur faux,
  suite non retenue avant OAuth, page quittée rendue pendant la redirection ;
  api (2) : email vers la racine, accueil apprenant faux.
- Web : `tsc`, `next lint`, `next build`.
- Navigateur, pile locale derrière nginx (https://localhost), 1280 et 390 px,
  quatre comptes (administrateur, formateur, apprenant, apprenant avec MFA) :
  connexion -> page du rôle ; logo -> page du rôle ; `/`, `/login`,
  `/register`, `/mot-de-passe-oublie`, `/reinitialiser-mot-de-passe`,
  `/activer-compte` -> page du rôle sans voir le formulaire ni la page
  publique ; page d'un autre rôle -> page du rôle. Visiteur : `/` -> page
  publique ; cinq pages protégées -> `/login?suite=…` sans aucun appel à
  l'api, puis retour sur la page après connexion (ou page du rôle si la suite
  n'est pas admise) ; `//exemple.com`, `https://exemple.com`, `/\exemple.com`,
  `/login`, `javascript:` refusés ; retour OAuth (simulé) avec et sans suite.
  Scénario US-AUTH-17 rejoué : vert.

## CI
Voir la PR.
