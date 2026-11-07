# CERT_EET · Sprint 2 · Handoff — from US-QCM-09 to the end of Sprint 2

> Paste this whole file as the first message of a new conversation in the `cert_eet` project.
> It is self-contained: rules, project state, the next story in full (what / why / how, with
> document sources), the decisions to validate, the step plan, every command, and what follows.

---

## 1. Context

I am Iyed Omri (PFE ESPRIT 2026). CERT_EET is a learning and certification platform for ESPRIT
Entreprise: NestJS 10 + TypeORM 0.3 + PostgreSQL 16 + Redis 7 (`apps/api`), Next.js 14 App Router
(`apps/web`), Docker Compose, GitHub Actions CI.

We are in **Sprint 2 — « Formations, inscriptions & moteur de QCM anti-fraude »**. The committed
scope is **done (46 / 46 pts)**. We now do the **stretch** stories one by one, starting with
**US-QCM-09**, then the Sprint 2 Review (§12).

Reply to me **in English**. Everything that goes into the repo (code comments, commit messages, PR
text, journals, API messages) stays **in French**.

## 2. Collaboration rules (non-negotiable)

1. Always give the **WHAT, the HOW and the WHY**. Brief, direct, detailed, no filler, no repetition.
   End every reply with a bullet recap.
2. **Step by step**: deliver one step, I test and validate, then you advance. Never everything at once.
   When I'm confused, give me short, simple, numbered instructions (« in very simple words »).
3. You write all the code and put it in the local repo **`C:\Users\omriy\Desktop\cert_eet_repository\CERT_EET`**
   (Git Bash, MINGW64). **I run every command** (git, docker, tests) and paste the output back.
4. **Never run git on my machine** (not even `git status`). Reading `.git/HEAD`, `.git/logs/HEAD`,
   `.git/refs/...` as plain files is fine.
5. For every change: what changed, what was added or removed, and why.
6. **First thing of a story is the branch.** 1 story = 1 branch = 1 PR = squash-merge, **green CI
   mandatory**. Branches are **never deleted**.
7. **Never put a session link or an attribution line** (Co-Authored-By, Claude-Session, "Generated
   with…") in commits, titles or PRs.
8. **Always check the documents first** and tell me when two documents disagree, with your
   recommendation, **before coding**. Present the disagreements as a numbered D-table.
9. One French journal per story in `engineering-log/`, same structure as journals 29–33:
   En une phrase · Découpage · Endpoints · Flux · Décisions · Fichiers · Incidents · Vérification ·
   CI · Suites. **US-QCM-09 is journal 34**, then 35, 36…
10. GitHub: never click « Revert » or « Delete branch » ; when squash-merging, **replace GitHub's
    default title** with the PR title ; once a PR is merged, later commits go into a new PR.
11. When I say « do all the recommended options », apply your recommendation for every D-row and
    proceed — still one step at a time.

## 3. How we work, per story

- **Step 0** — documents + D-table + branch commands. No code before I validate.
- **Step 1** — API: service, controller, DTOs, Swagger, audit, unit tests, e2e suite. You run
  everything in your own workspace first, then write the files into my repo; I run lint / unit /
  e2e and commit.
- **Step 2** — UI (`apps/web`). You check it in a real browser (Chromium via Playwright, 1280 px +
  390 px, and look at the screenshots) before handing it over; I run `tsc` + `next lint` and commit.
- **Step 3** — journal, PR title + French PR text (Objet · API · UI · Écarts assumés · Tests); I
  squash-merge after green CI and pull `main`.

**Your workspace**
- Pack my repo on my machine with the device shell (`tar czf` excluding `node_modules`, `dist`,
  `.next`, `.git`, `*.pem`, `.env`) into `C:\Users\omriy\Desktop\cert_eet\Claude outputs\`, stage
  the archive, unpack it into a work folder **and keep an untouched copy of it** (the baseline and
  the diff reference). `npm ci`, local Postgres 16 + Redis 7, CI env variables
  (`.github/workflows/ci.yml`, throwaway RS256 keys), `npm run migration:run`.
- **Background processes are stopped between turns**: start Postgres **and** Redis in the same
  command that runs the tests (`pg_ctlcluster 16 main start; redis-server --daemonize yes`). If
  every e2e suite fails with connection errors, that is the cause.
- **Run the baseline on the untouched copy**, never while editing (ts-jest compiles the sources).
- Browser check: API (`node dist/main.js` after `nest build`) + `next dev -p 3001` with a
  **workspace-only** rewrite `/api/:path* → http://localhost:3000/api/:path*` in `next.config.mjs`,
  then **restore the original** (diff it against the untouched copy). Demo data by SQL; the demo
  learner needs `profil_complet = true` (otherwise the US-AUTH-15 profile card covers the page).

**Writing files into my repo:** before modifying a file, check that my copy still has the md5 of the
untouched copy. Copy from a fresh output folder, then compare md5s (one combined md5 of the list is
enough). **The copy tool may resend an older version of a path already sent: always use a NEW
staging folder for a re-send, and re-check the md5 on my machine.**

## 4. Where the project stands (06/11/2026)

**Merged on `main` (Sprint 2):** enabler data model (#23), US-FORM-01, US-FORM-03, US-AUTH-16,
US-INSC-01 (#29), US-INSC-04 (#30), US-QCM-01 (#31), US-QCM-03 (#32), US-QCM-04 (#33),
US-QCM-05 (#34), US-QCM-06 (#35), **US-QCM-07 (#36, `c385783`, journal 32)**,
**US-QCM-08 (#37, `6bf4ba7`, journal 33)**.

**Baseline on `main` after #37:** lint clean, **34 unit suites / 442 tests**, **20 e2e suites /
262 tests**. (A dated-test time bomb in `qcm-configuration.service.spec.ts` was fixed in #37.)

**Stretch, in my chosen order:** **US-QCM-09 (2)** → US-FORM-04 (3, revision v1.4) → US-FORM-05
(3, revision v1.5) → US-FORM-02 (2) → US-INSC-02 (3) → US-INSC-03 (2) → US-QCM-02 (3). Not done →
top of Sprint 3.

**Out of Sprint 2:** US-FORM-06 files (Sprint 4, MinIO) ; US-QCM-10 multi-device lock (Sprint 3) ;
US-QCM-11 attempt history (Sprint 3) ; US-QCM-12 webcam proctoring (v1.6, Could, Sprint 5+).

**Housekeeping (not stories):**
- a. **Security — postponed to the end of the project (my decision).** Branch `docs` tracks `.env`
  (real Postgres / admin passwords, Google and GitHub OAuth secrets), `secrets/jwt_*.pem` and an
  archived self-signed TLS key, all from commit `9cd3913`; no other branch contains it. Plan
  agreed: untrack via a branch + PR **into `docs`**, rotate all values, no history rewrite. Until
  then: repo private, nobody added. Remind me in the Sprint 2 Review.
- b. Copy revisions v1.4, v1.5, v1.6 into `Cert_EET_Backlog_Produit.md` and the Sprint 2 Backlog.
- c. Committed total « ~51 pts » → **46** in the Sprint 2 Backlog and Plan.
- d. Align DS-02 (routes `PUT …/reponses/:questionId`, `POST …/soumettre`, 409 `temps_ecoule`,
  `dateFin = dateLimite`, final state NOTEE, audit `TENTATIVE_NOTEE`), DS-09 (progress recomputed
  at grading), DS-12 ; « ADR-04 timer » wording in the Sprint 2 Backlog §7.
- e. Global e2e `testTimeout` of 30 s in `apps/api/test/jest-e2e.json`.
- f. End of sprint: Sprint 2 Review + retrospective (model: `claude/Cert_EET_Sprint1_Review.md`).
- g. `WATCHPACK_POLLING=true` for the `web` service in `docker-compose.dev.yml` (Windows: a
  `globals.css` change was not recompiled until `restart web` + Ctrl+Shift+R).
- h. The web Prettier config does not match how its files are written: **never run Prettier on
  `apps/web` files** (`lib/api.ts`, `app/tentatives/[id]/page.tsx`) — edit them by hand.

## 5. What already exists that US-QCM-09 builds on

**Attempts module** (`apps/api/src/modules/tentatives/`, learner only)
- `POST /qcm/:qcmId/tentatives` (start, US-QCM-05/06), `GET /tentatives/:id` (consultation:
  `maintenant`, `numero`, questions + `reponses` only while running, **`score` / `estReussie` once
  NOTEE**), `PUT /tentatives/:id/reponses/:questionId` and `POST /tentatives/:id/soumettre`
  (US-QCM-07), grading at every closing + catch-up by the 60 s sweep (US-QCM-08).
- `TentativeTirageService.presenter(manager, plan)` → learner view as an **allow-list**
  `{ id, enonce, type, options: [{ id, texte }] }` in the frozen draw order (`planTirage`).
- `TentativeNotationService`: correct options read by an **explicit** query
  (`SELECT … FROM options WHERE … est_correcte = true`) — `options.estCorrecte` is `select: false`
  and must never be loaded elsewhere.
- Pure rules files (`*.regles.ts`) for every service; refusals returned from the transaction and
  thrown after commit; Postgres clock only (`SELECT now()` / `clock_timestamp()` after a lock).

**Data model (no migration expected)**
- `tentatives_qcm`: `statut` (… NOTEE), `score` numeric(5,2), `estReussie`, `dateFin`,
  `planTirage` jsonb `[{ questionId, optionIds[] }]`. A **trigger refuses any UPDATE of a NOTEE
  row** (US-QCM-08).
- `reponses`: one row per answered question, **`estCorrecte` and `pointsObtenus` written by the
  grading**; `reponse_options` = ticked options. No row = unanswered.
- `questions`: `enonce`, `type`, `ponderation`, **`explication` (text, nullable)**. `options`:
  `texte`, `ordre`, `estCorrecte` (select: false).
- `config_anti_fraude`: **`affichageResultats` (`IMMEDIAT` | `DIFFERE`)**, `dateOuverture`,
  **`dateFermeture`**, `nbTentativesMax`, `scoreMinValidation`.
- A QCM's content is locked once it has attempts: the correction shown is exactly what was graded.

**Web**
- `apps/web/src/app/tentatives/[id]/page.tsx`: at the end, a result block (« Tentative soumise /
  notée / Temps écoulé », **score + Réussi / Échoué**), re-reads the attempt after a time-up.
- `lib/api.ts`: `getTentative`, `TentativeConsultee` (`score`, `estReussie`), `PassageRefuse`,
  `AdminError`. `lib/format.ts`: `dateHeureFr`, `scoreFr`, `LIBELLES_TENTATIVE`,
  `CONSIGNES_TYPE_QUESTION`, `LIBELLES_AFFICHAGE` (« Immédiat (score, corrigé et explications à la
  soumission) », « Différé (score seul ; corrigé après la fermeture) »).
- « Mon espace » shows progress (`tauxAvancement`) and Réussi / Échoué per QCM.
- Styles: background `#e9eee9`, white cards, `--muted #56657a`, links `--primary-dark` (WCAG AA
  checked); badges `.avancement-REUSSI` / `.avancement-ECHOUE`.

## 6. The next story — US-QCM-09 « Voir son résultat » — WHAT

| Source | What it says |
|---|---|
| **Product Backlog**, E3, US-QCM-09 (Should, 2 pts) | « En tant qu'apprenant, je veux voir mon résultat selon le mode configuré (immédiat ou différé) afin de connaître mon score sans fuite des réponses. » *Nominal (immédiat) :* « Étant donné un QCM en affichage immédiat, Quand l'apprenant soumet, Alors il voit son score + les bonnes réponses + les explications. » *Alternatif (différé) :* « Étant donné un QCM en affichage différé, Quand l'apprenant soumet, Alors il ne voit que son score ; les corrections ne sont révélées qu'après la fermeture de la fenêtre d'examen. » |
| **DS-02**, Étape 5 | Immédiat → `{ score, estReussie, detailParQuestion }` : « Affiche le score, les bonnes réponses, et les explications ». Différé → `{ score, estReussie }` « (sans détail des réponses) » : « Les corrections seront disponibles après la clôture du QCM ». |
| **US-QCM-03** (config) | `affichageResultats` chosen by the trainer; the settings screen already labels both modes. |
| **US-QCM-06** | The correct answers never reach the client **during** the attempt (tests of non-leak). |
| **ET-02** | NOTEE is final and immutable — the correction is read-only. |

Read again before coding: `Cert_EET_Backlog_Produit.md` (E3), `Cert_EET_DS02_Passer_QCM.puml`
(step 5), `Cert_EET_Diagrammes_Etats_Transitions_Description.md` (ET-02), `UC_Apprenant_Description.md`
(UC2), journals 31 (non-leak), 33 (grading).

## 7. WHY this story, now

- It completes the learner journey: start → answer → submit → grade → **understand the result**.
- It is the « sans fuite des réponses » rule made concrete: the server decides when the correction
  may be revealed, never the browser.
- Small (2 pts) and built directly on US-QCM-08 (`reponses.estCorrecte`, `pointsObtenus`).

## 8. HOW — proposed design (to validate with the D-table)

**No migration, no new dependency expected.**

- **Route:** `GET /tentatives/:tentativeId/correction` (apprenant, owner only) — separate from
  `GET /tentatives/:id` so the consultation never carries correct answers.
- **Checks, with the Postgres clock:** owner (404) → attempt NOTEE (else 409 `raison:
  non_notee`) → mode: `IMMEDIAT` → available; `DIFFERE` → available only when `now() >=
  dateFermeture`, else 409 `raison: correction_differee` + `disponibleLe` (= `dateFermeture`).
- **Body (allow-list, plan order):** `{ tentativeId, score, estReussie, scoreMinValidation,
  questions: [{ id, enonce, type, ponderation, pointsObtenus, estCorrecte, repondue, explication,
  options: [{ id, texte, cochee, estCorrecte }] }] }`. Correct options read by an explicit query
  (as in the grading); question-level `estCorrecte` / `pointsObtenus` read from `reponses` (what was
  graded), not recomputed.
- **`GET /tentatives/:id`** gains `correction: { disponible: boolean, disponibleLe: Date | null,
  mode }` so the page knows whether to show the button or the date — still no answers in it.
- **UI:** on the attempt page, under the result: IMMEDIAT → « Voir le corrigé » → per question:
  your answer, right / wrong, correct option(s) highlighted, explanation ; DIFFERE before closing →
  « Le corrigé sera disponible le {date} » ; after closing → the same correction.
- **Tests:** unit (rules: availability by mode and clock, allow-list) ; e2e marker
  **`E2E-CORRIGE`** (check it is not a prefix of another marker): IMMEDIAT available right after
  grading ; DIFFERE refused before `dateFermeture` (409 + date) then available (move the date by
  SQL) ; 404 other learner ; 409 not graded ; no `estCorrecte` anywhere in `GET /tentatives/:id` or
  in any response before the correction is allowed ; plan order and partial answers.

## 9. Disagreements to validate before coding (D-table to present at Step 0)

| # | Point | Options | My recommendation (to confirm) |
|---|---|---|---|
| D1 | Where the correction lives | In `GET /tentatives/:id` · in the submit response (DS-02) · **own route** | **`GET /tentatives/:tentativeId/correction`**: the consultation and the submission never carry answers ; one place to test the non-leak |
| D2 | « Fermeture de la fenêtre d'examen » | `dateFermeture` of the QCM · last attempt used · both | **`now() >= dateFermeture`** (Postgres clock), as written in the Backlog |
| D3 | Refusal before availability | 403 · 200 `{ disponible: false }` · **409** | **409 `raison: correction_differee` + `disponibleLe`**, consistent with the time-based 409s of US-QCM-05/07 ; 409 `non_notee` for an attempt not yet graded |
| D4 | **IMMEDIAT with attempts left** — the correct answers of attempt 1 help attempt 2 | Follow the Backlog · reveal correct options only when no attempt is left or the window is closed | To decide. Following the Backlog is simplest ; the stricter option protects the certification. If we follow the Backlog: add a hint in the trainer settings (« le corrigé immédiat révèle les bonnes réponses dès la première tentative ») |
| D5 | Which attempts | Last one · **each NOTEE attempt** | **Each NOTEE attempt** (by id) ; listing them is US-QCM-11 |
| D6 | Source of right / wrong | Recompute · **what the grading wrote** | **`reponses.estCorrecte` / `pointsObtenus`** — the correction shows exactly what was graded ; unanswered = no row → `repondue: false`, 0 point |
| D7 | Audit | `CORRECTION_CONSULTEE` · none | **None** (a read by the owner ; no read is audited except the admin's audit consultation) |
| D8 | Score in DIFFERE | Hidden · **shown** | **Shown** (Backlog: « il ne voit que son score ») — already the case since US-QCM-08 |
| D9 | Trainer's view | In this story · **US-QCM-11** | **US-QCM-11** (history for learner and trainer) |
| D10 | UI | — | Button « Voir le corrigé » or availability date ; per question: my answer, right / wrong, correct option(s), explanation ; mobile 390 px |

Re-read the documents yourself: if you find another disagreement, add it to the table.

## 10. Commands (I run them)

**10.1 Branch**
```bash
git checkout main
git pull
git log --oneline -3
git checkout -b feature/US-QCM-09-resultat
git push -u origin feature/US-QCM-09-resultat
git status
```
The top line of `git log` must be `6bf4ba7` (US-QCM-08, #37).

**10.2 Stack up — always the whole stack**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```
If `cert_eet_api` is `unhealthy`: `restart api`, wait ~40 s, `ps` again, then `up -d`.

**10.3 After each API step** (add `exec api npm run migration:run` if a migration was added)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
```
`--runInBand` is required (slow machine). If old suites time out right after `restart api`, run
the e2e command a second time. A suite time of hours means my PC went to sleep.

**10.4 After the UI step**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```
Then reload with **Ctrl + Shift + R**. If a CSS change does not show: `stop web`, delete
`apps/web/.next`, `up -d web`, Ctrl + Shift + R.

**10.5 Commits** — one per step, explicit paths, French messages, no attribution:
```bash
git add apps/api
git commit -m "feat(qcm): <titre> (US-QCM-09)" -m "<détail en français>"
git push
```
Same for `apps/web` (`feat(web): …`) and the journal (`docs(journal): …`).

**10.6 PR** — title `US-QCM-09 — Voir son résultat`, French description (Objet · API · UI ·
Écarts assumés · Tests), squash-merge with **that** title after green CI, keep the branch, then
`git checkout main && git pull && git log --oneline -3`.

**10.7 Links to test by hand** (`http://localhost`, one private window per account)
- Trainer: `/formateur/formations` → formation → QCM → settings (« Affichage des résultats »)
- Learner: `/mes-inscriptions` → formation → « Commencer » → answer → « Soumettre » → corrigé
- API docs: `http://localhost/api/docs`

## 11. Conventions and known pitfalls

- DTOs: `@ApiProperty` + class-validator with **French messages**. Comments in French, first person.
  Swagger on every endpoint (`@ApiOperation`, every `@ApiResponse`).
- **No accented identifiers** — accents only in comments and messages.
- e2e markers must never be a prefix of each other. Existing: `E2E-DM`, `E2E-FORM01`,
  `E2E-MODULES`, `E2E-AFFECT`, `E2E-AUTH16`, `E2E-INSC01`, `E2E-ESPACE`, `E2E-QCM01`,
  `E2E-QCMCONF`, `E2E-QCMPUB`, `E2E-TENTDEM`, `E2E-TIRAGE`, `E2E-REPONSE`, `E2E-NOTATION`.
  Clean-up before **and** after, in RESTRICT order (attempts → enrolments → QCM → questions →
  formations), audit purged with `SET LOCAL app.audit_maintenance = 'on'` **by account and by
  attempt id** (system actions have no actor). NOTEE rows cannot be updated (trigger) but can be
  deleted.
- **Never compare fixed dates with the real clock in a test** (that was the US-QCM-03 time bomb):
  use `Date.now()`-relative dates, or freeze `Date` with
  `jest.useFakeTimers({ now, doNotFake: [timers…] })`.
- Heavy `beforeAll`: explicit timeout (`60_000`), batched inserts.
- **Concurrency tests force the overlap** (`LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE` held ~1 s),
  and each protection is proven by a mutation (remove it once, see the test fail).
- **A refusal must not roll back a legitimate write**: return it from the transaction, throw after
  commit.
- Prettier: only on the **API** files you changed ; **never on `apps/web` files** (see h).
- Web: `next lint` fails on straight apostrophes in JSX text: use ’.
- New dependency between services: watch for circular imports (pure rules in separate files).
- Docker on Windows: `restart api` / `restart web` after every code change.
- **Documented deviations to keep consistent** (journals 30–33): `POST /qcm/:qcmId/tentatives` ;
  409 (not 403) for time-based refusals ; questions served by `GET /tentatives/:id` ; True/False
  never shuffled ; `PUT …/reponses/:questionId` ; `dateFin = dateLimite` at expiry ; final state
  NOTEE ; audit `TENTATIVE_NOTEE` ; progress recomputed at grading.

## 12. After US-QCM-09

| # | Item | Pts | Main sources | Key points to analyse at Step 0 |
|---|---|:--:|---|---|
| 1 | **Sprint 2 Review + retrospective** (housekeeping f, with b / c / d) | — | `claude/Cert_EET_Sprint1_Review.md` (model), Sprint 2 Plan §7 (demo), journals 21–34 | Goal met, 46 / 46 + stretch done, velocity, demo script, incidents (time bomb, CSS on Windows, Prettier), debts (a, e, g, h, front out of CI) ; remind me of **a** |
| 2 | US-FORM-04 Contenu pédagogique géré par le formateur | 3 | `claude/Cert_EET_Revision_v1.4_US-FORM-04.md` | Description / objectives / prerequisites / modules only ; institutional fields → 400 ; non-assigned → 403 |
| 3 | US-FORM-05 Ressources de module : liens | 3 | `claude/Cert_EET_Revision_v1.5_Ressources_Module.md` | HTTP(S) links only, titled, ordered, shown in « Mon espace » |
| 4 | US-FORM-02, US-INSC-02, US-INSC-03, US-QCM-02 | 2/3/2/3 | Backlog E2 / E3 | Only if time allows ; otherwise top of Sprint 3 |

## 13. Definition of Done

Acceptance criteria met · unit + e2e tests including the error branches · RBAC + per-resource
authorization, server-side validation and audit applied · Swagger documented · **CI green** ·
front checked in a browser (`tsc --noEmit` + `next lint` + manual run) · journal written ·
demonstrable in Sprint Review.

## 14. Start here

1. Use the linked computer (folder `C:\Users\omriy\Desktop\cert_eet_repository\CERT_EET`; request
   access if only `Desktop\cert_eet` is attached), check that my branch is
   `feature/US-QCM-09-resultat` (read `.git/HEAD`), set up your workspace (§3) and check the
   baseline on the untouched copy: **34 unit suites / 442 tests, 20 e2e suites / 262 tests**.
2. Re-read the documents of §6 and tell me if anything contradicts this handoff.
3. Give me the D1–D10 table for validation (with any new row). **D4 needs my decision.** **Do not
   code before I confirm.**

*Handoff · Cert_EET · 06/11/2026 · Iyed Omri, PFE ESPRIT.*