# Redis et Bull

> Note explicative — ADR-04 (Base de données) · Projet Cert_EET
> Pourquoi Cert_EET a besoin de Redis en plus de PostgreSQL, et à quoi sert Bull.

---

## 1. Le problème de départ

Cert_EET stocke beaucoup de données dans PostgreSQL : utilisateurs, formations, QCM, tentatives, certificats. PostgreSQL fait très bien son travail pour ces données *durables* — celles qu'on ne veut surtout pas perdre.

Mais le projet a aussi besoin de gérer trois choses pour lesquelles PostgreSQL n'est pas le bon outil :

| Besoin | Pourquoi PostgreSQL convient mal |
|---|---|
| Garder des sessions actives, des tokens, des compteurs | Trop lent et trop lourd pour des données qui changent toutes les secondes. |
| Mettre en cache les questions fréquentes du chatbot | Aller en base à chaque fois ralentit l'expérience. |
| Lancer des tâches lourdes en arrière-plan (génération de PDF) | Une base relationnelle n'est pas faite pour ça. |

C'est là que **Redis** et **Bull** entrent en jeu.

---

## 2. Qu'est-ce que Redis ?

**Redis** est une base de données **en mémoire** (RAM), pas sur disque. C'est ce qui la rend extrêmement rapide.

### L'analogie du bureau

Imagine que tu travailles à un bureau :

- **PostgreSQL** = ton armoire de classement dans le couloir. Très organisée, énorme capacité, mais chaque accès demande de se lever, d'ouvrir un tiroir, de chercher.
- **Redis** = la petite pile de notes posée à côté de ton clavier. Tu y mets ce dont tu te sers tout le temps : un post-it avec un numéro de téléphone, ta liste du jour, un mot de passe temporaire. L'accès est instantané, mais si quelqu'un débranche la lampe, tout tombe.

Tu ne mets pas tes contrats officiels sur la pile de post-its. Et tu ne fouilles pas l'armoire pour relire ta liste du jour. **Chacun son rôle.**

### Caractéristiques clés

| Aspect | Redis |
|---|---|
| Stockage | En mémoire vive (RAM) |
| Vitesse | Très rapide — millisecondes |
| Type de données | Clés/valeurs simples (texte, listes, ensembles, compteurs) |
| Persistance | Optionnelle — peut survivre à un redémarrage si on l'active |
| Limite | La quantité de RAM disponible |

### Les types de structures utiles

Redis n'est pas qu'un simple « clé → valeur ». Il propose plusieurs structures, et chacune sert un usage différent :

- **Strings** : la plus simple. `cle = valeur`. Utile pour les sessions, les tokens, les configs.
- **Listes** : suite ordonnée d'éléments. Utile comme file d'attente (push à un bout, pop à l'autre).
- **Sets** : ensemble sans doublon. Utile pour la liste noire des tokens révoqués.
- **Hashes** : objet avec champs. Utile pour stocker un objet structuré sous une seule clé.
- **Sorted sets** : ensemble trié par score. Utile pour un classement ou pour limiter le nombre d'actions par minute.

Dans Cert_EET on utilise surtout les **strings** (sessions, cache) et les **sorted sets** (rate limiting).

---

## 3. Les usages de Redis dans Cert_EET

### Usage 1 — Liste noire des JWT révoqués

À la déconnexion ou à la révocation d'un compte, on veut **annuler immédiatement** le token de l'utilisateur. PostgreSQL fonctionnerait, mais la vérification se ferait à chaque requête API — beaucoup trop lent.

```javascript
// À la déconnexion
await redis.set(`blacklist:${tokenId}`, '1', 'EX', 900);
// EX 900 = expire automatiquement dans 15 minutes (durée du token)

// À chaque requête API
const estRevoque = await redis.get(`blacklist:${tokenId}`);
if (estRevoque) {
  throw new UnauthorizedException();
}
```

Avantage : la vérification prend une fraction de milliseconde, et la clé disparaît toute seule à l'expiration.

### Usage 2 — Limitation du nombre de tentatives (rate limiting)

Pour empêcher un apprenant de relancer un QCM en boucle ou un attaquant de spammer le chatbot, on compte les actions par minute.

```javascript
const cle = `qcm:tentatives:${userId}:${qcmId}`;
const compteur = await redis.incr(cle);
if (compteur === 1) {
  await redis.expire(cle, 60);  // remise à zéro après 60 secondes
}
if (compteur > 5) {
  throw new TooManyRequestsException();
}
```

Le compteur s'incrémente à chaque tentative, et Redis le supprime tout seul après une minute.

### Usage 3 — Cache des réponses du chatbot

Si plusieurs apprenants posent la même question (« comment fonctionne le scoring d'un QCM ? »), inutile d'appeler l'API LLM à chaque fois. La première réponse est mise en cache pour un certain temps.

```javascript
const cleCache = `chatbot:cache:${hashDeLaQuestion}`;
const enCache = await redis.get(cleCache);
if (enCache) return JSON.parse(enCache);

const reponse = await appelerLLM(question);
await redis.set(cleCache, JSON.stringify(reponse), 'EX', 3600);
// expire dans 1 heure
return reponse;
```

Gain : moins d'appels payants à l'API, réponses instantanées pour les questions fréquentes.

### Usage 4 — Stockage des files de tâches

C'est ici qu'intervient Bull. Voir section suivante.

---

## 4. Qu'est-ce que Bull ?

**Bull** est une bibliothèque Node.js qui transforme Redis en **système de files de tâches**.

### L'analogie de la cuisine de restaurant

Imagine un restaurant :

- Le **serveur** prend la commande et la pose sur un **présentoir de tickets** au passe-plat. Il retourne immédiatement servir un autre client.
- Les **cuisiniers** prennent les tickets dans l'ordre, préparent les plats, et marquent chaque ticket comme « prêt ».
- Personne ne bloque tout le service en attendant qu'une viande cuise pendant 20 minutes.

Bull, c'est exactement ça :

- **L'API NestJS** est le serveur. Elle pose des « tickets » (des tâches) sur Redis.
- **Les workers** sont les cuisiniers. Ce sont des processus Node séparés qui consomment les tâches et les exécutent.
- **Redis** est le présentoir de tickets. Il garde la file en mémoire.

### Pourquoi pas faire le travail directement dans l'API ?

Reprenons l'exemple de la génération d'un certificat. Sans Bull :

```javascript
// L'apprenant valide une formation
@Post('valider')
async valider(@Body() data) {
  await marquerFormationValidee(data);
  const pdf = await genererPDF(data);         // 800 ms
  const hash = await calculerSHA256(pdf);     // 200 ms
  const qr = await genererQRCode(data);       // 100 ms
  await stockerCertificat(pdf, hash, qr);     // 100 ms
  return { statut: 'OK' };
  // → l'utilisateur attend 1,2 seconde
}
```

Pendant ces 1,2 seconde, le thread principal de Node est bien occupé (génération PDF = calcul CPU). Tous les autres apprenants connectés ressentent une lenteur. Et si dix apprenants valident en même temps, ça empire.

Avec Bull :

```javascript
@Post('valider')
async valider(@Body() data) {
  await marquerFormationValidee(data);
  await this.certificatsQueue.add('generer', data);  // 5 ms
  return { statut: 'En cours de génération' };
  // → l'utilisateur attend 5 ms
}
```

L'API répond presque instantanément. La tâche est partie sur la file Redis. Un **worker séparé** la prend en charge et fait le travail. Quand c'est prêt, on notifie l'apprenant (e-mail, notification dans l'interface, etc.).

### Schéma

```
[Apprenant valide une formation]
              ↓
        [API NestJS]
              ↓
      Pose la tâche dans
              ↓
       [File Bull / Redis]   ← Redis stocke la liste de tâches
              ↓
        [Worker séparé]      ← Processus Node distinct
              ↓
  Génère PDF + SHA-256 + QR
              ↓
   Stocke le certificat
              ↓
   Notifie l'apprenant
```

---

## 5. Ce que Bull apporte en plus

Bull n'est pas qu'une simple file. Il offre des fonctionnalités utiles pour un projet sérieux :

| Fonctionnalité | À quoi ça sert dans Cert_EET |
|---|---|
| **Retry automatique** | Si la génération PDF échoue (erreur disque, fichier corrompu), Bull relance la tâche jusqu'à 3 fois avant d'abandonner. |
| **Délai programmé** | Envoyer un rappel à l'apprenant 3 jours après une formation incomplète. |
| **Priorités** | Une régénération demandée par un administrateur passe avant les générations standard. |
| **Concurrence configurable** | On peut limiter à 2 PDF générés en parallèle pour ne pas saturer la RAM. |
| **Tableau de bord (Bull Board)** | Une interface web qui montre les tâches en cours, terminées et en échec. Très utile pour le debug. |

---

## 6. Les usages de Bull dans Cert_EET

| File de tâches | Tâche | Pourquoi en file |
|---|---|---|
| `certificats` | Générer le PDF, le SHA-256, le QR code | Calcul lourd, ne doit pas bloquer l'API |
| `notifications` | Envoyer un e-mail à un apprenant ou à un formateur | Dépend d'un service externe (SMTP), peut échouer et nécessiter un retry |
| `chatbot-archivage` | Archiver les longs historiques de conversation | Tâche périodique non urgente |
| `analytics` | Recalculer les statistiques agrégées en fin de journée | Tâche planifiée, peut tourner la nuit |

---

## 7. PostgreSQL, Redis et Bull : qui fait quoi

| Outil | Rôle dans Cert_EET | Donnée typique |
|---|---|---|
| **PostgreSQL** | Source de vérité, données durables, intégrité relationnelle | Utilisateurs, certificats émis, scores QCM, historique des ateliers |
| **Redis** | Cache rapide et stockage temporaire | Sessions, tokens révoqués, compteurs de rate limit, cache chatbot |
| **Bull (sur Redis)** | Files de tâches asynchrones | Génération PDF, envois d'e-mails, traitements de fond |

Une donnée qui doit survivre à un redémarrage et à un crash → PostgreSQL.
Une donnée qui peut être recalculée ou qui expire → Redis.
Un traitement qui ne doit pas bloquer une requête utilisateur → Bull.

---

## 8. À retenir pour la soutenance

> Cert_EET utilise PostgreSQL comme source de vérité pour toutes les données métier — c'est une base relationnelle classique, fiable, qui respecte les propriétés ACID. À côté, Redis sert de base mémoire ultra-rapide pour les besoins temporaires : sessions, tokens révoqués, rate limiting, cache du chatbot. Et Bull, qui repose sur Redis, transforme cette base en système de files de tâches : c'est ce qui permet de générer un certificat PDF en arrière-plan sans bloquer l'API. Chaque outil joue le rôle pour lequel il est conçu.

---

## 9. Glossaire express

| Terme | Définition courte |
|---|---|
| **Cache** | Stockage temporaire d'une donnée déjà calculée, pour éviter de la recalculer à chaque demande. |
| **TTL** | Time To Live. Durée de vie d'une clé Redis avant suppression automatique. |
| **Rate limiting** | Limiter le nombre d'actions qu'un utilisateur peut faire dans un intervalle de temps. |
| **File de tâches** | Liste de travaux à exécuter, dépilée par un ou plusieurs workers. |
| **Worker** | Processus séparé qui consomme les tâches d'une file et les exécute. |
| **Retry** | Réessai automatique d'une tâche qui a échoué. |
| **AOF** | Append-Only File. Mode de persistance de Redis qui journalise chaque écriture pour les rejouer après un redémarrage. |
| **ACID** | Propriétés qui garantissent la fiabilité des transactions d'une base de données (Atomicity, Consistency, Isolation, Durability). |

---

*Cert_EET — Note technique annexe à l'ADR-04 — Mai 2026 — Iyed Omri*
