# US-QCM-09 — Voir son résultat (corrigé selon le mode d'affichage)

## En une phrase
Une fois sa tentative notée, l'apprenant voit sous son score soit un bouton
« Voir le corrigé », soit la date à partir de laquelle il le pourra : le
serveur décide seul, à l'heure de la base, selon le mode du QCM (immédiat
ou différé) et les tentatives qui lui restent ; le corrigé, servi par une
route à part, montre pour chaque question sa réponse, juste / faux et les
points tels que notés, la ou les bonnes réponses et l'explication.

## Découpage
- **A — API.** Règles pures (`tentative-correction.regles.ts`), service du
  corrigé (`TentativeCorrectionService`), route
  `GET /tentatives/:tentativeId/correction`, état du corrigé dans la
  consultation ; tests unitaires et e2e.
- **B — UI.** Bouton ou date sous le résultat, composant `CorrigeTentative`,
  relecture de la tentative après la soumission, libellé « Immédiat » des
  paramètres du formateur.
- **C — Journal + PR.**

Aucune migration, aucune dépendance ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| GET | `/tentatives/:tentativeId/correction` | **Nouveau.** 200 : `{ tentativeId, qcmId, qcmTitre, mode, score, estReussie, scoreMinValidation, nbQuestions, nbCorrectes, questions: [{ id, enonce, type, ponderation, repondue, estCorrecte, pointsObtenus, explication, options: [{ id, texte, cochee, estCorrecte }] }] }` dans l'ordre du tirage ; 404 tentative inconnue ou d'un autre apprenant ; 409 `{ message, raison, disponibleLe }` avec `raison` = `non_notee` \| `correction_differee` \| `tentatives_restantes` |
| GET | `/tentatives/:tentativeId` | + `correction: { mode, disponible, raison, disponibleLe }` — aucune réponse |

Rôle APPRENANT, propriétaire seulement. Lecture seule, **aucun audit** (D7).

## Flux
1. La tentative est notée (US-QCM-08). La page relit la tentative (aussi
   après une soumission, désormais) et reçoit l'état du corrigé.
2. État calculé par `evaluerCorrection`, dans cet ordre : pas NOTEE →
   `non_notee` ; `now() >= dateFermeture` → disponible ; DIFFERE →
   `correction_differee`, disponible à la fermeture ; IMMEDIAT → disponible
   si toutes mes tentatives sont utilisées **et** aucune n'est EN_COURS,
   sinon `tentatives_restantes` (au plus tard à la fermeture).
3. Disponible : la page affiche « Voir le corrigé ». Sinon : « Le corrigé
   sera disponible le {date}, après la fermeture du QCM » ou « … après votre
   dernière tentative, ou au plus tard le {date} ».
4. Au clic : `GET …/correction` refait toutes les vérifications (propriétaire,
   heure de la base, comptage de mes tentatives), lit les questions du
   tirage sans `estCorrecte`, les bonnes options par une requête explicite
   (`est_correcte = true`), les réponses notées, puis assemble le corrigé en
   liste blanche dans l'ordre du tirage.

## Décisions
Tableau D validé avant de coder (D1–D12, options recommandées ; D4 option B).
- **D1 — Route à part (écart avec DS-02 étape 5 : `detailParQuestion` dans
  la réponse de soumission).** Ni la consultation ni la soumission ne portent
  de bonne réponse : un seul endroit à protéger et à tester.
- **D2 — Fermeture = `now() >= dateFermeture`**, heure de PostgreSQL, relue à
  chaque demande : le formateur peut repousser la fermeture après les
  premières tentatives (seul réglage encore modifiable).
- **D3 — 409** avec `raison` et `disponibleLe`, comme les autres refus
  liés au temps (US-QCM-05, US-QCM-07).
- **D4 — Option B : en IMMÉDIAT, le corrigé attend la dernière tentative.**
  Le Backlog montre les bonnes réponses dès la soumission ; UC_Apprenant
  (UC3) les réserve à la fermeture de la fenêtre. Avec une seule tentative
  (le défaut), B se comporte comme le Backlog ; avec plusieurs, le corrigé
  de la 1re ne sert pas à la 2e. « Plus de tentative » = quota atteint
  **et** aucune EN_COURS ; le quota est borné (1–20), jamais illimité.
- **D5 — Toute tentative NOTEE**, par son identifiant ; la liste des
  tentatives reste US-QCM-11.
- **D6 — Juste / faux et points : ce que la notation a écrit**
  (`reponses.estCorrecte`, `pointsObtenus`), jamais recalculé ; sans réponse
  = `repondue: false`, 0 point, bonnes options montrées.
- **D7 — Aucun audit** : lecture par le propriétaire.
- **D8 — Score visible dans les deux modes** (déjà le cas depuis US-QCM-08).
- **D9 — Vue du formateur** : US-QCM-11.
- **D10 — UI** : bouton ou date sous le résultat ; par question : verdict,
  points, « Votre réponse », « Bonne réponse », explication ; chaque marque
  doublée d'un texte (jamais la couleur seule).
- **D11 — Explication actuelle**, pas celle du moment de la notation : UC1
  (formateur) laisse les explications modifiables après les premières
  tentatives ; le reste du contenu est figé, le verdict ne change donc pas.
- **D12 — État du corrigé dans la consultation**
  (`{ mode, disponible, raison, disponibleLe }`), sans aucune réponse, pour
  que la page choisisse entre le bouton et la date.
- **Libellé du formateur.** « Immédiat (score, corrigé et explications à la
  soumission) » devient « Immédiat (score à la soumission ; corrigé et
  explications après la dernière tentative) », conséquence de D4.

## Fichiers
- `apps/api/src/modules/tentatives/` : `tentative-correction.regles.ts`,
  `tentative-correction.service.ts` et leurs specs (nouveaux) ;
  `tentative-consultation.service.ts` (+ spec) (état du corrigé) ;
  `tentatives.controller.ts` (route, Swagger) ; `tentatives.module.ts`
- `apps/api/test/tentative-correction.e2e-spec.ts` (nouveau, marqueur
  `E2E-CORRIGE`)
- `apps/web/src/components/CorrigeTentative.tsx` (nouveau) ;
  `app/tentatives/[id]/page.tsx` (bouton ou date, relecture après
  soumission) ; `lib/api.ts` (types, `getCorrection`,
  `CorrectionIndisponible`) ; `lib/format.ts` (`pointsFr`,
  `attenteCorrigeFr`, libellé « Immédiat ») ; `app/globals.css`
  (`corrige-*`, `btn-secondaire`)

## Incidents
- **Pas de réseau au moment de créer la branche.** `git pull` et
  `git push -u` ont échoué (« Could not resolve host: github.com ») ; la
  branche locale existait sans branche suivie, d'où l'échec du `git push`
  après le premier commit. Résolu par `git push -u origin
  feature/US-QCM-09-resultat` une fois le réseau revenu.
- **`tsc --noEmit` juste après `restart web` : TS6053.** `tsconfig.json`
  inclut `.next/types/**/*.ts` ; au redémarrage, `next dev` vide `.next` et
  régénère ces fichiers page par page. `tsc` les a listés puis ne les a plus
  trouvés (4 erreurs, puis 2 au second essai). Aucune erreur dans les
  sources : relancé après ~30 s et l'ouverture d'une page, propre. À retenir :
  lancer `tsc` une fois `next dev` stabilisé, pas juste après un redémarrage.
- **Coquille dans un message de commit** (« aligned » pour « aligné ») ;
  sans conséquence : la fusion par squash remplace les messages.

## Vérification
- **Lint** : propre. **Tests unitaires** : 36 suites, 468 tests (+2 suites,
  +26) — règles (non notée dans chaque statut, immédiat unique, tentatives
  restantes, quota atteint mais une EN_COURS, différé avant / à la seconde de
  la fermeture, fenêtre fermée, dates sérialisées ; ordre du tirage, sans
  réponse, verdict tel que noté, liste blanche, contenu disparu, plan vide) ;
  service (404, 409 sans lecture du contenu, requête explicite des bonnes
  options, comptage de MES tentatives, plan absent) ; consultation (état
  transmis).
- **e2e** : 21 suites, 273 tests, dont `tentative-correction` (11) —
  immédiat : 409 `non_notee` pendant le passage, corrigé après soumission
  dans l'ordre du tirage mélangé (questions et options), réponse partielle
  (juste, faux, sans réponse), explications, relecture identique ; différé :
  409 `correction_differee` avec la date exacte, puis 200 une fois la
  fermeture passée (date déplacée en base) ; D4-B : refus après la 1re
  tentative, toujours refusé pendant la 2e EN_COURS, corrigé des deux
  ensuite ; 404 autre apprenant (même message qu'inconnue), 400, 401.
  **Non-fuite** : aucun `estCorrecte` ni `explication` dans la consultation,
  la soumission ou un refus. **Mutation** : sans la condition « aucune
  EN_COURS », un test unitaire et un test e2e échouent.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; dans Chromium,
  bureau 1280 px et mobile 390 px : réponses puis soumission dans la page,
  bouton apparu sans rechargement, corrigé de 4 questions (2 justes, 1 faux
  à choix multiples, 1 sans réponse ; 28,57 % = 2 / 7 points) ; QCM différé :
  date affichée, aucun bouton ; aucune réponse hors `/correction` dans le
  trafic réseau ; aucun débordement horizontal.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
# attendre ~30 s et ouvrir une page avant tsc (voir Incidents)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : la nouvelle suite e2e s'ajoute aux
autres. Front hors CI (dette Sprint 1).

## Suites
- US-QCM-11 : historique des tentatives (apprenant et formateur), qui
  réutilisera `GET …/correction` et ses règles de disponibilité.
- Documents à aligner (rangement d) : DS-02 étape 5 (route du corrigé,
  409, règle des tentatives restantes) ; UC_Formateur §2.4 (explications
  incluses, corrigé après la dernière tentative).
- `WATCHPACK_POLLING=true` pour le service `web` ; `tsc` après stabilisation
  de `next dev`.
- Sprint 2 : périmètre engagé 46 / 46 + US-QCM-09 (2 pts, stretch) ; ensuite
  la Sprint 2 Review, ou US-FORM-04.
