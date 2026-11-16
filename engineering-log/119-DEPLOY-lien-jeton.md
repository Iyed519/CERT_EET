# DEPLOY-lien-jeton — Lien « mot de passe oublié » / « activer le compte » vu comme incomplet

## En une phrase
Sur la démonstration en ligne (pile en mode dev), ouvrir le lien reçu par e-mail affichait
« Ce lien est incomplet » ; le jeton est maintenant lu une seule fois et conservé, le formulaire s'affiche.

## Cause
`reinitialiser-mot-de-passe/page.tsx` et `activer-compte/page.tsx` lisent `?token=` dans un `useEffect`,
puis retirent le jeton de la barre d'adresse (`history.replaceState`). En développement,
`reactStrictMode: true` fait **rejouer l'effet** : le second passage relit une adresse déjà nettoyée,
trouve `null` et écrase le jeton. En production (`next build`), l'effet ne s'exécute qu'une fois : le
défaut n'apparaissait pas en recette, seulement sur l'hôte de démonstration, qui tourne avec
`docker-compose.dev.yml`. `verifier-email` (useSearchParams, sans nettoyage) n'est pas touché.

## Décisions (table D)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Correction | désactiver le mode strict ; ne plus nettoyer l'adresse ; lecture unique | **Lecture unique dans une `useRef`** : la ref survit au rejeu du mode strict ; le jeton reste retiré de l'adresse et de l'historique (exigence US-AUTH-06 conservée). |
| D2 | Portée | page signalée seule ; toutes les pages au même motif | Les deux pages qui partagent le motif (`reinitialiser-mot-de-passe`, `activer-compte`). |

## Vérification
- `tsc --noEmit` et `next lint` sans erreur sur `apps/web`.
- `next dev` (mode strict actif), Playwright, `/<page>?token=abc123` pour les deux pages :
  - **avant** : « Ce lien est incomplet » affiché, 0 champ mot de passe ;
  - **après** : 0 message d'erreur, 2 champs mot de passe, jeton retiré de l'adresse.
- Sur l'hôte : `git pull` suffit (le conteneur web recharge à chaud) ; puis demande « mot de passe oublié » réelle par Gmail.
