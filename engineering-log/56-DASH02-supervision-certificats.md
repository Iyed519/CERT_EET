# US-DASH-02 — Superviser les certificats

## En une phrase
L'administrateur voit, pour chaque certificat, le titulaire, la formation, le
score, le statut, l'empreinte et le nombre de consultations publiques ; il
filtre par statut, recherche par titulaire, formation ou identifiant, et ouvre
une fiche détaillée (empreinte SHA-256, consultations valides / refusées,
historique du certificat).

## Point de départ
La liste `GET /admin/certificats` (US-CERT-01, filtre de statut, relance,
révocation US-CERT-06) existait déjà. Chaque vérification publique écrit une
ligne d'audit `CERTIFICAT_VERIFIE` (US-CERT-04) avec la cible = identifiant du
certificat. US-DASH-02 ajoute le compteur, la recherche et la fiche (D1).

## Découpage
- **Base.** Rien de nouveau : l'index `IDX_audit_logs_cible` (US-AUDIT-01)
  sert le comptage.
- **API.**
  - `SupervisionCertificatsService` : `lister(statut, recherche)` (vues de
    `CertificatsService` + compteur en **une** requête groupée par cible),
    `enrichir` / `enrichirUne` (réponses de relance et de révocation),
    `fiche(id)` (404 ; résumé total / valides / refusées / dernière ; 20
    dernières consultations : date + verdict ; historique des autres actions
    d'audit visant le certificat, ordre chronologique, acteur en liste
    blanche, 200 au plus).
  - `CertificatsService` : `lister(statut, recherche)`, `vueAdminOu404`,
    `criteresRecherche` (OU sur email, prénom, nom, titre — `ILike`, jokers
    neutralisés par `echapperLike` — et identifiant exact si la saisie est un
    UUID ; chaque critère garde le filtre de statut).
  - `FiltreCertificatsDto.recherche` (≤ 255) ; route
    `GET /admin/certificats/:certificatId`.
- **Web.** `admin/certificats` : champ de recherche, ligne « N consultations
  publiques · dernière le … », bouton « Fiche » (modale : identité,
  empreinte, consultations avec verdict, historique libellé) ; `lib/format` :
  libellés des verdicts et des actions.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/certificats?statut&recherche` | ADMINISTRATEUR | 200 `[{ …, consultations: { total, derniere } }]` ; 400 statut inconnu, recherche > 255 ; 401 ; 403 |
| GET | `/api/admin/certificats/:certificatId` | ADMINISTRATEUR | 200 `{ certificat, consultations: { total, valides, refusees, derniere }, consultationsRecentes[{ horodatage, verdict }], historique[{ horodatage, action, resultat, acteur, details }] }` ; 400 ; 401 ; 403 ; 404 |
| POST | `/api/admin/certificats/:id/relancer` · `/revoquer` | ADMINISTRATEUR | inchangées ; la réponse porte aussi `consultations` |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Source du compteur | Le journal d'audit (`CERTIFICAT_VERIFIE`), pas une colonne : aucune écriture de plus à chaque vérification, aucune course sur un compteur, chiffre toujours égal à la trace. |
| D2 | Coût | Une requête groupée par page (200 certificats au plus), servie par l'index sur `cible`. |
| D3 | Données minimales | La fiche montre la date et le verdict des consultations, **jamais l'adresse IP** du visiteur (elle reste dans le journal d'audit, réservé à l'administrateur). |
| D4 | Historique | Toutes les actions d'audit visant le certificat sauf les vérifications (comptées à part) : demande, déclenchement, émission, échecs, relances, téléchargements par le titulaire, révocation (refusée ou faite). Acteur en liste blanche ; « Système » sans acteur. |
| D5 | Recherche | « Contient », sans casse, sur titulaire et formation ; identifiant exact seulement si la saisie est un UUID (sinon PostgreSQL refuserait la comparaison). |
| D6 | Lecture non tracée | La fiche, comme la liste, n'écrit pas d'audit (supervision courante) ; les actions (relance, révocation) restent tracées. |

## Fichiers
- `apps/api/src/modules/certificats/supervision-certificats.service.ts` (+ spec), `certificats.service.ts`, `certificats-admin.controller.ts`, `certificats.dto.ts`, `certificats.module.ts`
- `apps/api/test/supervision-certificats.e2e-spec.ts` (marqueur `E2E-DASH02`)
- `apps/web/src/app/admin/certificats/page.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- Deux mutants d'abord « non compilés » (import ou constante devenus
  inutilisés) : réécrits pour garder le code compilable, puis tués.
- e2e complet : la recherche « TRABELSI » trouvait aussi un certificat de
  démonstration créé pour le contrôle navigateur (même nom). Nom de test
  rendu unique (« Trabelsi-Dashdeux »).

## Vérification
VERIF

## CI
Voir la PR.

## Suites
- US-DASH-01 : agrégats globaux (certificats émis / révoqués, consultations).
