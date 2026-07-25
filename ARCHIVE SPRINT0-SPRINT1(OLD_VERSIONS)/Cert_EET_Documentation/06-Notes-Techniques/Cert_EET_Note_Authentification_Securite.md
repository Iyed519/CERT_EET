# Authentification & Sécurité — Explication du Dispositif

> Note explicative — Projet Cert_EET
> Justification des choix d'authentification : JWT RS256, rotation des refresh tokens, MFA TOTP, RBAC NestJS, denylist Redis.

---

Tu as retenu une pile d'authentification moderne pour Cert_EET. Voici ce que chaque brique fait, pourquoi elle a été choisie, et comment l'ensemble s'articule.

---

## 1. JWT asymétrique (RS256)

**Ce que c'est.** Un JSON Web Token est un jeton signé qui transporte l'identité de l'utilisateur (son `userId`, son rôle, ses permissions) et que le serveur peut vérifier sans rappeler la base de données à chaque requête.

**Symétrique (HS256) vs asymétrique (RS256).** La différence porte sur la clé qui signe et vérifie le jeton :

| Algorithme | Clé de signature | Clé de vérification | Conséquence |
|---|---|---|---|
| **HS256** (symétrique) | Une seule clé secrète partagée | La même clé secrète | Toute personne capable de vérifier peut aussi forger des tokens |
| **RS256** (asymétrique) | Clé **privée** (gardée par l'auth service) | Clé **publique** (diffusable) | Seul le service d'authentification peut émettre ; tout le monde peut vérifier |

**Pourquoi RS256 pour Cert_EET.** L'architecture est modulaire : module QCM, module Ateliers, module Certification, module Chatbot. Chacun doit vérifier l'identité de l'appelant. Avec RS256, on distribue uniquement la clé publique à ces modules — si l'un d'eux est compromis, l'attaquant ne peut pas forger de tokens valides pour les autres. Avec HS256, la fuite de la clé secrète d'un seul module compromettrait l'ensemble du système.

C'est aussi le standard quand on prévoit d'ouvrir l'API à des intégrations futures (NF8 — interopérabilité du cahier des charges) : on publie la clé publique sans aucun risque.

---

## 2. Rotation des refresh tokens

**Le problème de base.** Un access token JWT a une durée de vie courte (typiquement 15 minutes) pour limiter les dégâts en cas de vol. Mais on ne va pas demander à l'apprenant de se reconnecter toutes les 15 minutes — d'où le refresh token, à durée de vie longue (7 jours par exemple), qui sert uniquement à obtenir un nouvel access token.

**La rotation.** À chaque utilisation, le refresh token est **remplacé** par un nouveau. L'ancien est invalidé immédiatement.

```
1. Login           →  access_v1 (15 min) + refresh_v1 (7 jours)
2. access_v1 expire
3. POST /refresh avec refresh_v1
4. Réponse         →  access_v2 (15 min) + refresh_v2 (7 jours)
                      refresh_v1 est BRÛLÉ (invalidé en base)
```

**Pourquoi c'est important.** Sans rotation, un attaquant qui vole un refresh token l'utilise pendant 7 jours sans que personne le sache. Avec rotation, dès que la victime ou l'attaquant utilise le token volé, le légitime se retrouve avec un refresh invalide à sa prochaine tentative — détection automatique de la compromission.

On parle de **reuse detection** : si un refresh token déjà consommé est représenté, le système révoque toute la famille de tokens de cet utilisateur et force une reconnexion. C'est la défense recommandée par l'OWASP pour les tokens longue durée.

---

## 3. MFA via TOTP

**TOTP** (Time-based One-Time Password, RFC 6238) est l'algorithme standard derrière Google Authenticator, Microsoft Authenticator, Authy, etc.

**Le mécanisme.**

1. À l'activation, le serveur génère un secret aléatoire (160 bits typiquement) pour l'utilisateur.
2. Ce secret est encodé dans un QR code au format `otpauth://` que l'utilisateur scanne avec son application.
3. À chaque connexion ultérieure, l'application calcule un code à 6 chiffres = `HMAC-SHA1(secret, timestamp/30)`. Le serveur fait le même calcul de son côté et compare.

Le code change toutes les 30 secondes, sans aucune communication entre le téléphone et le serveur après l'enrôlement — c'est ce qui rend TOTP supérieur aux SMS (interceptables) tout en restant gratuit.

**Position dans Cert_EET.** Activable optionnellement par l'utilisateur (NF3 du cahier des charges, F7). Recommandé pour les rôles Formateur et Administrateur ; facultatif pour Apprenant. Le flux de login devient en deux étapes : `email + password` → si MFA actif, demande du code à 6 chiffres → émission des tokens.

À prévoir : un jeu de **codes de récupération** générés à l'enrôlement, en cas de perte du téléphone.

---

## 4. RBAC par guards NestJS + décorateur de rôles

**RBAC** (Role-Based Access Control) = chaque utilisateur a un rôle, chaque endpoint exige un ou plusieurs rôles autorisés. Trois rôles dans Cert_EET : Administrateur, Formateur, Apprenant.

**L'implémentation NestJS.** NestJS fournit deux primitives qui s'assemblent proprement :

- **Décorateur custom** `@Roles('formateur', 'admin')` qu'on pose sur un contrôleur ou une route. Il attache des métadonnées à la méthode.
- **Guard** `RolesGuard` qui s'exécute avant chaque requête : il lit le rôle de l'utilisateur dans le JWT (déjà vérifié par un `JwtAuthGuard` en amont), lit les métadonnées posées par `@Roles`, et autorise ou rejette.

Schéma typique :

```
Requête HTTP
     ↓
JwtAuthGuard          → vérifie la signature RS256, extrait le payload
     ↓
RolesGuard            → lit @Roles(...), compare au rôle du payload
     ↓
Contrôleur            → exécute la logique métier
```

**Pourquoi c'est propre.** L'autorisation est **déclarative** (une annotation au-dessus de la méthode), centralisée dans le guard, testable indépendamment de la logique métier. Pas de `if (user.role !== 'admin') throw...` dispersé dans le code.

Exemple concret : la route `POST /ateliers/:id/notation` porte `@Roles('formateur')`. Un apprenant qui essaie d'y accéder est rejeté avec 403 avant même que la méthode soit exécutée.

---

## 5. Liste de tokens révoqués dans Redis

**Le problème que ça résout.** Les JWT sont **stateless** par construction — c'est leur force (performance, scalabilité), mais aussi leur faiblesse : une fois émis, un token reste valide jusqu'à expiration, même si l'utilisateur clique sur « Déconnexion », même si l'administrateur veut bannir le compte.

**La solution.** Une **denylist** (anciennement blacklist) stockée dans Redis. À la déconnexion ou à la révocation, le `jti` du token (identifiant unique inscrit dans le payload JWT) est inséré dans Redis avec un TTL égal à la durée de vie restante du token. Le `JwtAuthGuard` consulte Redis avant d'accepter un token.

```
Logout              →  SET revoked:jti:abc123  ""  EX 900   (TTL 15 min)
Requête suivante    →  GET revoked:jti:abc123
                       Si présent → 401 Unauthorized
```

**Pourquoi Redis et pas PostgreSQL.** Cette consultation se fait à **chaque requête authentifiée**. Redis répond en moins d'une milliseconde, PostgreSQL serait un goulot d'étranglement. Le TTL automatique de Redis nettoie aussi la liste sans cron job — un token expiré disparaît de la denylist en même temps qu'il devient invalide naturellement.

**Bénéfice pour Cert_EET.** Déconnexion immédiate effective, possibilité pour un Administrateur de révoquer un compte compromis sans attendre 15 minutes, conformité aux exigences d'audit (F7, NF3).

---

## Synthèse — Comment tout s'enchaîne

Login d'un Formateur avec MFA activé :

```
1.  POST /auth/login {email, password}
2.  Serveur vérifie le mot de passe (hash bcrypt en base)
3.  MFA actif → réponse 200 {mfa_required: true, mfa_session_id: ...}
4.  POST /auth/mfa/verify {mfa_session_id, code: "458211"}
5.  Vérification TOTP côté serveur
6.  Émission :
       - access_token  RS256, 15 min, claims {sub, role: 'formateur', jti}
       - refresh_token RS256, 7 jours, stocké en base hashé
7.  Frontend stocke les tokens (httpOnly cookie ou mémoire)

À chaque requête API :
   Authorization: Bearer <access_token>
       ↓
   JwtAuthGuard  →  vérif signature (clé publique) + vérif denylist Redis
       ↓
   RolesGuard    →  vérif @Roles
       ↓
   Métier

À expiration (15 min) :
   POST /auth/refresh {refresh_token}
   → ancien refresh brûlé, nouvelle paire émise

Logout :
   POST /auth/logout
   → jti de l'access courant ajouté à Redis avec TTL
   → refresh courant invalidé en base
```

**Couverture du cahier des charges.** Ce dispositif adresse explicitement F7 (Sécurité et Conformité — JWT, MFA, audit logs) et NF3 (Sécurité). La séparation clé privée/publique (RS256) prépare aussi NF8 (interopérabilité API). Le tout reste compatible avec un déploiement souverain (NF4) : Redis et PostgreSQL tournent localement, aucune dépendance à un service d'identité externe.

Tu peux justifier chaque choix en soutenance par un trade-off précis : RS256 pour l'isolation modules, rotation pour la détection de vol, TOTP pour ne pas dépendre d'un SMS gateway, guards NestJS pour la déclarativité, Redis pour la latence de la denylist. Aucun de ces choix n'est gratuit, chacun répond à un risque identifié.

---

*Cert_EET — Note technique annexe — Mai 2026 — Iyed Omri*
