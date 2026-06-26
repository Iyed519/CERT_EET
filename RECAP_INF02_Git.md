# Cert_EET — Récapitulatif de session : INF02 + mise en place Git

Date : 25 juin 2026
Auteur : Iyed Omri
Sprint 1 — Fondations (E0 / Socle & Infrastructure)

---

## 1. Ce qui a été produit : INF02 (Squelette applicatif)

Le squelette de l'application a été généré et **vérifié en local** (sur la machine).

### Backend — NestJS
- Structure `src/modules` conforme à la carte des dossiers (diagramme PKG-01).
- Module de configuration avec validation des variables d'environnement via **Joi**
  (une bibliothèque de validation), en mode **fail-fast** (échec immédiat au démarrage
  si une variable requise manque ou est invalide).
- Endpoint `GET /health` (point de contrôle de disponibilité) via **Terminus**
  (le module de health-check — vérification de santé — de NestJS).
- Documentation **OpenAPI / Swagger** exposée sur `/api/docs`.

### Frontend — Next.js
- **App Router** (le système de routage par dossiers de Next.js).
- Layout (gabarit de page) de base.
- Coquille de la page `/login` — formulaire volontairement **non actif**
  (la logique de connexion arrivera en US-AUTH-01).

### Qualité vérifiée
- Compilation TypeScript en mode strict : OK.
- ESLint (analyseur de code) : 0 avertissement.
- Tests : 3 tests au vert (2 unitaires + 1 end-to-end, c.-à-d. de bout en bout).
- `GET /health` renvoie `{"status":"ok"}` au démarrage réel.
- Fail-fast confirmé : une variable invalide arrête le démarrage avec un code d'erreur.

---

## 2. Vérification en local (sur la machine)

Backend (dans `apps/api`) :
```
npm install
copy .env.example .env
npm run start:dev
```
→ `http://localhost:3000/health` affiche `{"status":"ok",...}` ✅

Frontend (dans `apps/web`, nouveau terminal) :
```
npm install
npm run dev
```
→ `http://localhost:3001` fonctionne ✅
→ `http://localhost:3001/login` affiche la coquille avec « Formulaire non actif » ✅

**Note :** Nest et Next ne s'installent PAS globalement sur le PC. Ils sont installés
**localement** dans le dossier `node_modules` de chaque application par `npm install`.

---

## 3. Environnement

- **Node.js** installé (le moteur d'exécution JavaScript).
- Versions des dépendances figées par le fichier `package.json` + `package-lock.json`.
- On ne lance PAS `npm audit fix --force` (cela casserait les versions figées).

---

## 4. Stratégie Git (gestion de versions) convenue

- **Modèle : GitHub Flow** — une seule branche permanente `main`, toujours fonctionnelle.
- **Une branche par user story** (récit utilisateur), PAS par sprint.
- **Convention de nommage des branches :** `feature/US-XXX-slug`
  (exemple : `feature/US-INFRA-02-squelette`).
- **Boucle répétée pour chaque user story :**
  1. Créer la branche depuis `main`
  2. Développer + commits (validations) petits et logiques
  3. Pousser la branche (push) vers GitHub
  4. Ouvrir une Pull Request (PR — demande de fusion)
  5. Laisser la CI (intégration continue) vérifier
  6. Squash-and-merge (fusion en un seul commit propre)
  7. Supprimer la branche, revenir sur `main`
- **Revue :** solo — auto-revue (lecture de son propre diff dans l'onglet « Files changed »).
- **Convention de messages de commit :** `feat:` (fonctionnalité), `fix:` (correction),
  `test:` (tests), `chore:` (configuration/outillage), `docs:` (documentation).

---

## 5. État actuel et prochaine étape

- INF02 est en cours de push sur la branche `feature/US-INFRA-02-squelette`.
- Prochaine étape après fusion : **INF03 (Docker Compose)** — conteneurisation
  (mise en conteneurs) des services api, web, postgres, redis, nginx.
