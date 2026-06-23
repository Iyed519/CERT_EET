# Synchrone vs Asynchrone

> Note explicative — ADR-02 (Backend NestJS) · Projet Cert_EET
> Pourquoi Node.js a besoin de Worker Threads et de files de tâches pour les traitements lourds.

---

## 1. L'idée de base

| Mode | Définition simple |
|---|---|
| **Synchrone** | J'attends que ce soit fini avant de passer à la suite. |
| **Asynchrone** | Je lance la tâche, je passe à la suite, et je serai prévenu quand c'est fini. |

---

## 2. L'analogie du café

Tu commandes un café dans un bar.

**Mode synchrone** — tu commandes, tu restes devant le comptoir, tu attends que le barista finisse, puis tu pars. Pendant ce temps, tu ne fais rien d'autre. Les dix personnes derrière toi attendent dans la file.

**Mode asynchrone** — tu commandes, tu reçois un buzzer, tu vas t'asseoir, tu réponds à un message. Quand le café est prêt, le buzzer sonne, tu vas le chercher. Le barista, lui, prend la commande suivante pendant que ta machine extrait l'espresso.

Dans les deux cas, le café met le même temps à être fait. La différence, c'est qu'en mode asynchrone, **ni toi ni le barista n'êtes bloqués à attendre**.

---

## 3. Côté code

Exemple : lire un fichier sur le disque.

### Synchrone

```javascript
const contenu = fs.readFileSync('certificat.pdf');  // bloque ici
console.log('Fichier lu');
genererSuite();  // ne s'exécute qu'APRÈS la lecture
```

Pendant que `readFileSync` tourne (disons 200 ms), **plus rien ne s'exécute** dans le programme. Si une requête HTTP arrive, elle attend.

### Asynchrone

```javascript
fs.readFile('certificat.pdf', (err, contenu) => {
  console.log('Fichier lu');  // s'exécute quand la lecture est finie
});
genererSuite();  // s'exécute IMMÉDIATEMENT, sans attendre la lecture
```

La lecture est lancée, le programme continue, et le callback sera appelé plus tard, quand le fichier sera prêt.

### Asynchrone moderne (`async / await`)

```javascript
const contenu = await fs.promises.readFile('certificat.pdf');
console.log('Fichier lu');
```

Plus lisible. Le `await` ne bloque pas vraiment : il met la fonction en pause et laisse le moteur exécuter autre chose pendant l'attente.

---

## 4. Le contexte Node.js

Node.js a une particularité importante : il n'a **qu'un seul thread principal** qui exécute ton code JavaScript. C'est l'*event loop*.

Conséquence :

> Si tu lances une opération synchrone et longue sur ce thread, **tout le reste du serveur s'arrête pendant ce temps**.

Les autres requêtes attendent. L'assistant IA ne peut plus traiter de nouvelles demandes. Les tableaux de bord ne se chargent plus. C'est ce qu'on appelle **bloquer l'event loop**.

L'asynchrone résout ça **pour les opérations d'entrée/sortie** (I/O) : lire un fichier, appeler une base de données, envoyer une requête HTTP. Ces opérations sont déléguées au système d'exploitation, et Node reprend la main une fois qu'elles sont terminées.

---

## 5. Le piège : asynchrone ≠ parallèle

C'est le point que beaucoup oublient.

> L'asynchrone classique ne résout pas le problème des calculs lourds.

Pour un vrai calcul CPU intensif — par exemple un hachage SHA-256 sur un gros PDF, ou la génération d'un certificat complexe — même écrit en `async / await`, **le travail reste fait sur le thread principal**.

Mettre `await` devant ne déplace pas la charge ailleurs. Si le calcul prend 2 secondes de CPU, le thread principal est bloqué 2 secondes. Tous les autres utilisateurs attendent.

---

## 6. Les trois mécanismes à connaître

| Mécanisme | À quoi ça sert | Quand l'utiliser |
|---|---|---|
| **Asynchrone (`await`)** | Attendre une opération externe sans bloquer le thread. | Appel base de données, requête HTTP, lecture fichier. |
| **Worker Threads** | Faire tourner du JS sur un autre thread du même processus. Vraiment en parallèle. | Calcul CPU intensif qui doit rester dans le même processus. |
| **Files de tâches (Bull + Redis)** | Sortir le travail du processus web et le faire traiter par un *worker* séparé, en arrière-plan. | Calcul lourd qui peut tolérer un délai de quelques secondes. |

---

## 7. Application au projet Cert_EET

### Cas 1 — Opérations d'I/O : asynchrone classique

La plupart des opérations de Cert_EET sont des appels externes :

- Lecture d'un QCM depuis PostgreSQL.
- Écriture d'une tentative dans la base.
- Appel à l'API LLM pour la génération de questions QCM.
- Récupération d'une session depuis Redis.

Toutes ces opérations sont traitées en `async / await`. Pendant l'attente, le thread principal sert d'autres requêtes. **Aucun blocage**.

### Cas 2 — Génération d'un certificat PDF : file de tâches

À la validation d'une formation, on doit :

1. Générer un PDF avec PDFKit.
2. Calculer l'empreinte SHA-256.
3. Générer le QR code.
4. Stocker le tout.

Si on faisait ça dans la requête HTTP qui valide la formation, le thread principal serait bloqué pendant plusieurs centaines de millisecondes — parfois plus si le PDF est complexe.

**Solution retenue** : la requête HTTP met la tâche dans une **file Bull** (stockée dans Redis) et répond immédiatement « certificat en cours de génération ». Un **worker séparé** (un autre processus Node) consomme la file, fait le travail lourd, et notifie l'utilisateur quand c'est prêt.

```
[Requête HTTP]  →  [API NestJS]  →  [File Bull / Redis]
                                          ↓
                                    [Worker séparé]
                                          ↓
                              Génère PDF + SHA-256 + QR
                                          ↓
                                [Notifie l'apprenant]
```

L'API reste réactive pour les autres utilisateurs pendant ce temps.

### Cas 3 — Hachage d'un lot de certificats : Worker Threads

Si l'administrateur lance un re-hachage de l'ensemble des certificats émis (cas rare mais possible), c'est un calcul CPU pur. On utilise alors des **Worker Threads** pour paralléliser sur plusieurs cœurs CPU sans sortir du processus principal.

---

### Cas 4 — Indexation RAG d'un support pédagogique : file de tâches

Quand un formateur uploade un document de cours (PDF, PPTX), celui-ci doit être découpé en fragments (*chunks*), vectorisé (*embeddings*) et stocké dans la base vectorielle (pgvector). C'est une opération **CPU-bound** qui peut durer plusieurs secondes selon la taille du document.

**Solution retenue** : la requête HTTP d'upload met la tâche d'indexation dans une **file Bull** et répond immédiatement « indexation en cours ». Un **worker séparé** effectue le découpage, la vectorisation et le stockage, puis met à jour le statut du `SupportPedagogique` à « Indexé » et notifie le formateur.

```
[Requête HTTP upload]  →  [API NestJS]  →  [File Bull / Redis]
                                                  ↓
                                          [Worker séparé]
                                                  ↓
                              Découpage chunks + embeddings + pgvector
                                                  ↓
                          [Statut = Indexé · Notifie le formateur]
```

Ce pipeline est **identique dans sa structure** au Cas 2 (génération de certificats) — c'est la même architecture Bull/Redis réutilisée pour un besoin différent.

---

## 8. À retenir pour la soutenance

> Node.js fonctionne avec un seul thread principal. L'asynchrone permet à ce thread de ne pas se bloquer pendant les attentes (base de données, API externe, fichiers). En revanche, pour un vrai calcul lourd comme générer un PDF, calculer un hash ou indexer un document de cours pour le RAG, l'asynchrone seul ne suffit pas : le travail reste sur le thread principal. Pour ces cas, Cert_EET déporte le calcul ailleurs — soit sur une file Bull avec Redis (génération de certificats, indexation RAG), soit sur un Worker Thread (traitements par lot).

---

## 9. Glossaire express

| Terme | Définition courte |
|---|---|
| **Thread** | Fil d'exécution. Une instance de calcul qui tourne sur un cœur du CPU. |
| **Event loop** | Boucle d'événements de Node.js. Elle prend les tâches dans une file et les exécute une par une sur le thread principal. |
| **I/O** | Input / Output. Toute opération qui sort du programme : disque, réseau, base de données. |
| **CPU-bound** | Tâche limitée par la puissance du processeur (calcul). |
| **I/O-bound** | Tâche limitée par l'attente d'une ressource externe (réseau, disque). |
| **Worker Thread** | Thread secondaire dans le même processus Node, capable d'exécuter du JS en parallèle. |
| **Bull** | Bibliothèque Node.js de files de tâches asynchrones, basée sur Redis. |
| **Callback** | Fonction passée en paramètre, appelée plus tard quand un événement se produit. |

---

*Cert_EET — Note technique annexe à l'ADR-02 — Mise à jour Juin 2026 — Iyed Omri*
