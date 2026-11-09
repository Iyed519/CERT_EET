# US-CERT-06 — Révoquer un certificat

## En une phrase
Un administrateur révoque un certificat émis, avec un motif, une description
interne et une double confirmation (case d'irréversibilité et mot de passe) ;
la révocation est atomique, irréversible (déclencheur en base), conserve le
PDF et son empreinte, prévient le titulaire par email et se voit
immédiatement sur la vérification publique (« Révoqué » et date, sans motif).

## Découpage
- **Base.** Migration `1787100000000-AddRevocationCertificats` : type
  `certificats_motif_revocation_enum` (FRAUDE, ERREUR_ADMIN, DISCIPLINAIRE,
  JUDICIAIRE) ; colonnes `date_revocation`, `motif_revocation`,
  `description_revocation` (10–2 000 caractères), `revoque_par` (FK users
  RESTRICT) ; CHECK « REVOQUE ⇔ les quatre renseignées ». Le déclencheur
  d'immuabilité couvre désormais ACTIF **et** REVOQUE : un certificat révoqué
  ne change plus du tout.
- **API.** `POST /api/admin/certificats/:id/revoquer` (administrateur) ;
  `CertificatsService.revoquer` ; règle `verifierRevocable` et libellés des
  motifs ; `RevoquerCertificatDto` ; `MailService.sendCertificatRevoqueEmail` ;
  la liste administrateur, « Mes certificats » et la vérification publique
  exposent la révocation (chacune à son niveau de détail).
- **Web.** `/admin/certificats` : bouton « Révoquer » et modale (motif,
  description, case, mot de passe) ; détail de la révocation sur la ligne.
  `/mes-certificats` : date et motif. `/verifier/[id]` : « Révoqué le … ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/admin/certificats/:id/revoquer` | ADMINISTRATEUR | 200 vue administrateur ; 400 entrée ; 401 mot de passe ; 403 rôle ; 404 inconnu ; 409 déjà révoqué ou en préparation |

## Flux
1. Mot de passe revérifié (bcrypt ; hash factice pour un compte sans mot de
   passe local) **avant** tout verrou. Faux : audit
   `CERTIFICAT_REVOCATION_REFUSEE`, 401.
2. Transaction : verrou de la ligne, statut vérifié, `ACTIF → REVOQUE` avec
   motif, description, auteur et heure de PostgreSQL.
3. Après validation : audit `CERTIFICAT_REVOQUE` (avant/après, motif), email
   au titulaire (au mieux : un échec SMTP n'annule pas la révocation).
4. La vérification publique lit la base à chaque appel : l'effet est
   immédiat, sans cache (no-store depuis US-CERT-05).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Motif | Liste fermée de DS-07 + description obligatoire (10–2 000), interne : audit et administration seulement. |
| D2 | Double confirmation | `confirmationIrreversible` doit valoir `true` (400 sinon) ; mot de passe revérifié comme pour le changement de rôle (US-ROL-01) -> 401. |
| D3 | Statut non révocable | Déjà révoqué ou encore en préparation -> **409** (refus d'état, convention du projet ; DS-07 dit 400 pour « pas ACTIF »). |
| D4 | Page publique | Verdict « Révoqué » + date ; **aucun motif** (note de confidentialité de DS-07 : une fraude ou une décision disciplinaire ne se publie pas). |
| D5 | Email | Formation, catégorie du motif, date, qui contacter ; jamais la description interne ; pas de lien de vérification. |
| D6 | Irréversibilité | Garantie par la base (déclencheur), pas seulement par le service : même un UPDATE SQL direct est refusé. Le PDF, la clé et l'empreinte restent (DS-07). |
| D7 | Pièces jointes | Hors périmètre (DS-07 « facultatives ») : la description suffit pour l'audit. |
| D8 | Contact | Pas d'adresse de contact dédiée dans la configuration : l'email renvoie à l'administration d'ESPRIT Entreprise. |

## Fichiers
- `apps/api/src/database/migrations/1787100000000-AddRevocationCertificats.ts`, `database/enums/motif-revocation.enum.ts`, `database/entities/certificat.entity.ts`
- `apps/api/src/modules/certificats/{certificat.regles,certificats.dto,certificats.service,certificats-admin.controller,verification.service}.ts` (+ specs)
- `apps/api/src/mail/mail.service.ts`
- `apps/api/test/revocation.e2e-spec.ts` (marqueur `E2E-REVOC`) ; `test/{certificats,mes-certificats,verification,verification-protection}.e2e-spec.ts` (révocation SQL complète, nouveaux champs)
- `apps/web/src/app/admin/certificats/page.tsx`, `app/mes-certificats/page.tsx`, `app/verifier/[id]/page.tsx`, `lib/{api,format}.ts`

## Incidents
- Test de concurrence : la sonde `pg_stat_activity` ne voyait pas les deux
  requêtes en attente — le texte de la requête TypeORM est tronqué avant le
  `FROM`. Sonde sur l'alias `"Certificat"."id"`, en tête de la requête.
- Une première passe e2e lancée pendant les mutations a compilé un mutant :
  relancée seule. Règle : jamais de mutation pendant l'e2e.
- La suite US-CERT-05 fige la liste des champs publics : `dateRevocation`
  ajouté (le motif, lui, n'y est pas).
- Un 401 « mot de passe » passe par `apiFetch`, qui tente un
  rafraîchissement puis rejoue la requête : deux audits de refus pour une
  saisie (même comportement que le changement de rôle) ; la session n'est
  pas perdue.

## Vérification
- API : lint 0, `tsc`, unitaires **60 suites / 823 tests**, migration
  revert + run + run (colonnes et branche REVOQUE du déclencheur retirées puis
  remises), e2e **35 suites / 469 tests** (en série).
- Mutations tuées (10) : en unitaire, refus « déjà révoqué », contrôle du mot
  de passe, verrou de ligne, auteur, heure de PostgreSQL, libellé du motif
  dans l'email, action d'audit ; en base, branche REVOQUE du déclencheur et
  CHECK de révocation ; en e2e, verrou retiré -> le test de concurrence
  échoue. Un mutant équivalent : la date de révocation non filtrée par statut
  sur la page publique (le CHECK garantit déjà null hors REVOQUE).
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : bouton inactif tant
  que le formulaire est incomplet ; mot de passe faux -> message dans la
  modale, la session reste ouverte ; révocation -> ligne « Révoqué » avec
  date, motif et description ; page publique « Révoqué le … » sans motif ;
  « Mes certificats » : date et motif. Pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- Aligner DS-07 : 409 (et non 400) pour un certificat non actif ; page
  publique sans motif ; pièces jointes reportées.
