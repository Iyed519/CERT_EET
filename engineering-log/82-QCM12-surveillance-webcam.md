# US-QCM-12 — Surveillance webcam par captures

## En une phrase
Quand le formateur l'active pour un QCM (désactivée par défaut), l'apprenant
doit consentir avant de commencer ; la page prend alors une petite image de
la caméra au démarrage puis toutes les 2 minutes, stockée en privé et
consultable seulement par le formateur affecté et l'administration, puis
supprimée au bout de 30 jours — sans vidéo, sans son, sans analyse automatique.

## Point de départ
Révision v1.6 du backlog (`Cert_EET_Revision_v1.6_US-QCM-12_Surveillance_Webcam.md`)
et critères d'acceptation v1.8 : captures périodiques (et au démarrage) liées
à la tentative, sans URL publique, consultables par le formateur affecté ;
refus ou absence de caméra -> démarrage refusé avec un message clair et la
procédure alternative (passage surveillé en présentiel), refus journalisé ;
purge planifiée au-delà de la durée de conservation, journalisée. Règles
transverses : formateur affecté et administrateur seulement
(`ACCES_RESSOURCE_REFUSE` sinon), liens de lecture signés à durée courte,
aucune analyse biométrique, consentement horodaté et journalisé, paramètre
figé dès la première tentative (déjà vrai depuis US-QCM-03). Condition posée
par la révision : accord de l'encadrant et décision sur la protection des
données (RGPD, loi 2004-63 / INPDP). Existant : paramètre `proctoringWebcam`
enregistré dans `config_anti_fraude`, affiché « Bientôt actif ».

## Découpage
- **Migration** `1788700000000-AddSurveillanceWebcam` :
  `tentatives_qcm.consentement_surveillance_le`, table `captures_webcam`
  (clé de stockage unique, taille > 0, type JPEG / PNG, date ; CASCADE sur la
  tentative ; index pour la revue et pour la purge).
- **API** :
  - démarrage (`TentativeDemarrageService`) : corps facultatif
    `{ consentementSurveillance }` ; QCM surveillé sans consentement -> 409
    `consentement_surveillance_requis` (tracé), consentement enregistré à la
    création et journalisé `CONSENTEMENT_SURVEILLANCE` ;
  - consultation de la tentative : `surveillance: { active, intervalleSecondes }` ;
    « Mon espace » : `surveillanceWebcam` par QCM ;
  - nouveau module `surveillance` : refus explicite, dépôt des captures, liste,
    lien signé, image servie, purge (balayage horaire) ;
  - anonymisation (US-CPT-04) : captures du compte supprimées ;
  - configuration `surveillance` (`SURVEILLANCE_WEBCAM`, intervalle,
    conservation, balayage).
- **Web** : modale de démarrage avec la notice et le consentement (« Je
  refuse » / « Accepter et démarrer », vérification de la caméra) ; composant
  `SurveillanceWebcam` sur la page de passage (aperçu, état, captures) ;
  galerie des captures dans le détail d'une tentative côté formateur ;
  paramètre sorti de « Bientôt actif » dans la configuration du QCM.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/qcm/:qcmId/tentatives` `{ consentementSurveillance? }` | APPRENANT | inchangé + 409 `consentement_surveillance_requis` ; 400 si la valeur n'est pas un booléen |
| POST | `/api/qcm/:qcmId/surveillance/refus` `{ motif: REFUS \| CAMERA_INDISPONIBLE }` | APPRENANT | 200 procédure alternative (refus journalisé) ; 400 ; 404 QCM non surveillé ; 429 |
| POST | `/api/tentatives/:id/captures` (multipart `capture`) | APPRENANT (titulaire) | 201 ; 400 pas une image ; 404 autre apprenant ; 409 terminée / non surveillée / maximum ; 413 > 100 Ko ; 429 trop rapprochée |
| GET | `/api/tentatives/:id/captures` | FORMATEUR affecté, ADMINISTRATEUR | 200 liste (consultation journalisée) ; 403 tracé ; 404 |
| POST | `/api/captures/:id/lien` | FORMATEUR affecté, ADMINISTRATEUR | 200 `{ url, expireDansSecondes: 120 }` ; 403 ; 404 |
| GET | `/api/captures/fichier/:jeton` | public (jeton) | 200 image `no-store` ; 404 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Opt-in | Par QCM, choix du formateur, désactivé par défaut (déjà le cas en base). Interrupteur de plateforme `SURVEILLANCE_WEBCAM` (on par défaut) pour tout couper sans redéploiement, par exemple tant que la décision RGPD / INPDP n'est pas prise. |
| D2 | Consentement | Exigé pour CRÉER une tentative d'un QCM surveillé (pas pour reprendre). Booléen strict : la conversion implicite du ValidationPipe est neutralisée, « "oui" » ne vaut pas consentement. Horodaté dans la tentative et journalisé avec la version de la notice. |
| D3 | Refus | Sans consentement, refus de la caméra par le navigateur ou caméra absente : aucune tentative, message avec la procédure alternative (passage surveillé en présentiel), refus journalisé (`TENTATIVE_DEMARREE` Échec, `SURVEILLANCE_REFUSEE` avec le motif). |
| D4 | Minimisation | Images 320 × 240 en JPEG compressé (≈ 15 Ko), une au démarrage puis une toutes les 120 s ; ni vidéo ni son transmis ; aucune analyse automatique. Côté serveur : 100 Ko au plus, image reconnue à sa signature, écart minimal de 60 s, nombre borné par la durée du QCM. |
| D5 | Concurrence | Dépôt décidé sous le verrou de la tentative (`FOR UPDATE`) : 5 envois simultanés -> 1 × 201, 4 × 429. |
| D6 | Stockage | Bucket privé existant, préfixe `surveillance/<tentative>/`. Une panne du stockage annule la ligne (pas de capture fantôme). |
| D7 | Accès | Formateur affecté (autorisation par ressource) et administrateur ; l'apprenant ne revoit pas ses images. Refus -> 403 + `ACCES_RESSOURCE_REFUSE`. Chaque consultation journalisée `CAPTURES_CONSULTEES` ; images par lien signé de 2 minutes (jeton aléatoire dans Redis, comme US-FORM-06), `no-store`, `noindex`, sans Referer. |
| D8 | Conservation | 30 jours (`SURVEILLANCE_CONSERVATION_JOURS`), purge toutes les heures (jamais en test) : stockage puis base, `CAPTURES_PURGEES` sans donnée personnelle. Anonymisation d'un compte (US-CPT-04) : toutes ses captures supprimées. |
| D9 | Paramètre figé | Inchangé : dès la première tentative, la configuration du QCM ne bouge plus (US-QCM-03). |

## À décider par un humain (périmètre livré : le sous-ensemble sûr)
- **Accord de l'encadrant** et **décision de protection des données** (base
  légale, déclaration éventuelle à l'INPDP, information des apprenants,
  durée de conservation) : préalables posés par la révision v1.6. Tant
  qu'elles ne sont pas prises, `SURVEILLANCE_WEBCAM=off` coupe la fonction
  partout (le paramètre reste enregistré).
- La notice affichée à l'apprenant (version `v1-2026-11`) est un texte de
  travail à faire valider.
- Organisation concrète du passage surveillé en présentiel (procédure hors
  plateforme).

## Fichiers
- `apps/api/src/database/migrations/1788700000000-AddSurveillanceWebcam.ts`, `entities/tentative-qcm.entity.ts`
- `apps/api/src/modules/surveillance/` : `surveillance.regles.ts`, `surveillance.service.ts`, `surveillance.controller.ts`, `surveillance.module.ts`, `surveillance.spec.ts` ; `app.module.ts`
- `apps/api/src/modules/tentatives/` : `tentative-demarrage.regles.ts`, `tentative-demarrage.service.ts`, `tentative-consultation.service.ts` (+ spec), `tentatives.controller.ts`, `dto/demarrer-tentative.dto.ts`
- `apps/api/src/modules/inscriptions/espace-formation.service.ts` (+ spec), `modules/qcm/qcm.controller.ts`
- `apps/api/src/modules/admin/` : `admin.module.ts`, `anonymisation/anonymisation.service.ts` (+ spec)
- `apps/api/src/config/configuration.ts`, `env.validation.ts`
- `apps/api/test/surveillance-webcam.e2e-spec.ts` (marqueur `E2E-QCM12`)
- `apps/web/src/components/DemarrageTentative.tsx`, `SurveillanceWebcam.tsx`, `ConfigurationModal.tsx`, `app/tentatives/[id]/page.tsx`, `app/mes-inscriptions/[formationId]/page.tsx`, `app/formateur/qcm/[id]/tentatives/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- `enableImplicitConversion` transformait « "oui" » en `true` : consentement
  accepté à tort. Corrigé dans le DTO (valeur brute) et prouvé par l'e2e.
- Deux tests unitaires et un e2e (US-INSC-04) comparent la liste exacte des
  champs (« Mon espace », consultation d'une tentative) : nouveaux champs
  ajoutés, puis e2e complet relancé.
- `ConfigService` injecté en `@Optional` dans les services de démarrage et de
  consultation : les tests unitaires existants restent inchangés.
- Le conteneur de travail a redémarré au début de la story : services
  relancés.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **113 suites / 1 446 tests** (+ 16 :
  règles ×5, dépôt nominal, refus avant transaction, refus d'état ×5, écart et
  maximum, revue et accès, lien signé, purge ; anonymisation), migration run +
  revert + run (**37 migrations**), e2e complet en série **68 suites / 808 tests** (+ 1 ignoré), dont
  `E2E-QCM12` (9 tests : « Mon espace » et refus sans consentement ; refus
  explicite et procédure alternative ; consentement horodaté et journalisé ;
  contrôles du dépôt ; 5 dépôts simultanés -> un seul ; revue réservée, lien
  signé, image servie ; tentative terminée ; purge ; anonymisation).
- Mutations : **17 / 17 tuées** (4 réécrits : ne compilaient pas) —
  consentement non exigé / non enregistré / non journalisé / « oui » accepté,
  dépôt sur la tentative d'un autre, sans consentement, écart ignoré, sans
  verrou, signature non vérifiée, taille ×10, formateur non affecté admis,
  apprenant admis (unitaire), consultation non journalisée, purge sans effet,
  captures conservées à l'anonymisation, image en cache, capture après la fin.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px (Chromium
  avec caméra simulée, pile locale) : modale de démarrage avec la notice,
  bouton inactif tant que le consentement n'est pas coché ; tentative créée,
  bandeau « Surveillance webcam active » avec l'aperçu, première capture
  enregistrée ; « Je refuse » -> procédure alternative, aucune tentative,
  refus journalisé ; formateur : galerie des captures dans le détail d'une
  tentative (images chargées par lien signé) ; paramètre « Surveillance par
  webcam (captures) » hors de « Bientôt actif » ; pas de défilement
  horizontal, aucune erreur de page.

## CI
Voir la PR.

## Suites
- Documents du Sprint 5 (backlog, revue, révision v1.9 du backlog produit).
