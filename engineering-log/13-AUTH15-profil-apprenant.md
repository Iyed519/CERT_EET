# 13 — US-AUTH-15 · Compléter mon profil apprenant

**Épopée :** E1 (Comptes & Authentification) · **Points :** 3 · **Branche :** `feature/US-AUTH-15-profil-apprenant`
**Dépend de :** US-CPT-05, US-AUTH-01 · **Réf :** UC « Gérer son profil » (DS-10), ADR-11

## 0. En une phrase
À la première connexion, un apprenant remplit une carte bloquante (date de naissance, niveau, domaine,
établissement) avant d'accéder au site. Données rangées en référentiel propre (FK), pour usage ML futur.

## 1. Découpage
- **A** — schéma : enum `niveau_etudes`, 4 tables référentiel + colonnes profil sur `users`, 2 migrations
  (structure + seed).
- **B** — backend : `PATCH /auth/profile`, `GET /referentiel/domaines`, `GET /referentiel/etablissements`,
  `profil_complet` exposé dans `/auth/me`.
- **C** — frontend : carte bloquante (`ProfilGate`) montée dans le layout.
- **D** — tests + journal + PR.

## 2. Modèle de données
Référentiels (normalisés, ML-ready) :
- `domaines_etudes` (16) — code + libellé.
- `universites` (71 : 14 public dont réseau ISET, 57 privé) — nom, type, gouvernorat.
- `etablissements` (263) — FK université, type, gouvernorat.
- `etablissement_domaine` (M:N) — **vide en v1**, schéma prêt pour le filtre domaine→établissement (v2).

`users` + : `date_naissance` (âge **dérivé**, jamais stocké), `niveau_etudes` (enum), `domaine_etudes_id`
(FK SET NULL), `etablissement_id` (FK SET NULL), `etablissement_autre` (texte libre), `profil_complet` (bool).

Enum : SANS_BAC, BAC, PREPA, BTS, LICENCE, MAITRISE, MASTERE, INGENIEUR, DOCTORAT, AUTRE.

## 3. Flux
1. Après connexion (mot de passe **ou** OAuth), le frontend appelle `GET /auth/me`.
2. Si `profil_complet = false` **et** rôle APPRENANT -> `ProfilGate` affiche l'overlay bloquant.
3. Soumission -> `PATCH /auth/profile` : âge >= 13, cohérence domaine/établissement selon « en études »,
   `profil_complet = true`, audit `PROFIL_COMPLETE`.
4. Succès -> l'overlay disparaît.

## 4. Décisions
- **Référentiel = tables, pas enum, pas texte libre** : IDs stables, jointures propres, extension par
  données. `etablissement_autre` = seule échappatoire (curée plus tard).
- **Seed via migration** (pas un script) : la donnée de référence est reproduite sur toute base neuve
  (dev, CI) automatiquement à `migration:run`. FK établissement→université résolue par nom dans le seed.
- **Filtre domaine→établissement différé (v2)** : le mapping officiel (data.gov.tn) n'était pas
  récupérable proprement au build ; le schéma (`etablissement_domaine`) le supporte, on le remplira sans
  changer le schéma. v1 : liste déroulante groupée par université + recherche + « Autre ».
- **Carte réservée aux apprenants** : garde côté frontend (`role === 'APPRENANT'`) — admin/formateur non
  bloqués.
- **`completeProfile` sans nouvelle dépendance de constructeur** : l'existence domaine/établissement est
  vérifiée via `userRepository.manager.findOne`, pour NE PAS casser le spec DI d'AuthService (piège
  récurrent des US-CPT-05 / US-AUTH-14).
- **Âge dérivé, jamais stocké** (RGPD/minimisation) : seule la date de naissance est persistée.

## 5. Fichiers
**Nouveaux — backend :** `database/enums/niveau-etudes.enum.ts` ; `database/entities/{universite,
etablissement,domaine-etudes,etablissement-domaine}.entity.ts` ; `migrations/1785500000000-AddProfilApprenant.ts`
+ `migrations/1785600000000-SeedReferentielUniversites.ts` ; `modules/auth/dto/complete-profile.dto.ts` ;
`modules/referentiel/{referentiel.module,referentiel.service,referentiel.controller}.ts`.
**Modifiés — backend :** `database/entities/user.entity.ts` (colonnes profil) ; `modules/auth/auth.service.ts`
(`completeProfile`, `getMe`, `mapProfil`, `calculerAge`, `ProfilResult`) ; `modules/auth/auth.controller.ts`
(`PATCH /auth/profile`, `/auth/me` -> profil) ; `app.module.ts` (ReferentielModule) ;
`modules/auth/auth.service.spec.ts` (tests).
**Nouveaux — frontend :** `components/ProfilGate.tsx`.
**Modifiés — frontend :** `lib/api.ts` (getMe, completeProfile, getDomaines, getEtablissements) ;
`app/layout.tsx` (montage ProfilGate) ; `app/globals.css` (overlay + carte).

## 6. Incidents & corrections
- **« Rien enregistré » (faux positif)** : la carte se fermait bien mais la requête SQL de contrôle portait
  sur le **compte GitHub** alors que le profil avait été rempli sur le **compte Google** — deux comptes
  apprenants distincts, chacun son profil. Les logs (`UPDATE users … profil_complet=true` + audit
  `PROFIL_COMPLETE`) confirmaient la sauvegarde. Aucune correction : mauvaise cible de vérification.
- **Watcher web (Windows/Docker)** : la carte n'apparaissait qu'après `restart web` (même souci que les
  US précédentes).

## 7. Vérification
- **Manuel (bout en bout)** : carte affichée pour les 2 comptes apprenants (Google + GitHub), soumission ->
  `profil_complet=t`, valeurs en base, audit `PROFIL_COMPLETE`. Admin **non** bloqué.
- **Unitaires** : suites `completeProfile` (401 no user, 400 âge<13, en études + domaine valide -> PROFIL_COMPLETE,
  domaine inconnu -> 400, plus en études -> null) et `getMe` (âge dérivé, 401). `npm run test`.
- **Migrations** : `migration:run` -> 16 / 71 / 263 (domaines / universités / établissements).

## 8. CI
Aucune variable d'environnement nouvelle. L'étape `migration:run` existante applique les deux migrations
(structure + seed) sur la base neuve de CI. Le seed (263 INSERT) tient dans une transaction.

## 9. Suites (v2)
- Remplir `etablissement_domaine` (source officielle) -> filtre établissement par domaine.
- **US-AUTH-07** : édition ultérieure du profil.
- Recommandation de cours (modèle) exploitant `domaine`, `etablissement`, `universite`.
