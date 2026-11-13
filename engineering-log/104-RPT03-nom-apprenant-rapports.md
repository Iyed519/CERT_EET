# US-RPT-03 — Nom de l'apprenant dans le titre de ses rapports

## En une phrase
Dans « Mes rapports de cette formation », un rapport individuel s'intitule « PDF · *Prénom Nom* »
au lieu de « PDF · Un apprenant », pour retrouver d'un coup d'œil le rapport de chacun.

## Point de départ
Demande du propriétaire, 13/11/2026, capture à l'appui : trois rapports « PDF · Un apprenant »
impossibles à distinguer. Le rapport ne garde que `parametres.apprenantId` ; le web n'affichait
que le libellé de la portée.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Où trouver le nom | web (requête par apprenant) ; API | API : la liste et le détail renvoient un nouveau champ `cible` (chaîne ou `null`), calculé par jointure au moment de la lecture (`users` via `parametres->>'apprenantId'`, `modules` via `parametres->>'moduleId'`). Aucune migration ; le nom suit un changement de nom ou une anonymisation. |
| D2 | Contenu de `cible` | — | Portée `INDIVIDUEL` : « Prénom Nom » (ou l'adresse e-mail si le profil n'a pas de nom) ; portée `MODULE` : titre du module ; sinon `null`. Le demandeur ne voit que ses propres rapports, donc aucun nom nouveau ne lui est révélé (il a choisi l'apprenant). |
| D3 | Titre affiché | — | « PDF · Prénom Nom » pour un rapport individuel, « PDF · Module : titre » pour un rapport par module ; inchangé sinon (« PDF · Vue globale »). Repli « Un apprenant » si `cible` est vide. |

## Fichiers
- API : `modules/rapports/rapports.service.ts` (`cible` dans `SELECT_RAPPORT` et `RapportVue`).
- Web : `components/ListeRapports.tsx`, `lib/api.ts`.
- Tests : `test/rapports-session.e2e-spec.ts` (+1 : nom, module, vue globale nulle, repli e-mail, nom lu à la lecture).
- Backlog, `CHANGELOG.md`.

## Vérification
- Mutations : 2 / 2 tuées (cible toujours nulle, repli e-mail retiré).
- Unitaires et e2e complets ; ESLint API, `tsc`, `next lint`, `next build`.
- Capture 1280 px de « Mes rapports de cette formation » : « PDF · *Prénom Nom* ».
