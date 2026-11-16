# Cert_EET — Déploiement de la démonstration en ligne (Hetzner Cloud)

Tout ce qu'il faut pour remettre en ligne **https://cert-eet.duckdns.org** depuis zéro, ou depuis un
instantané. Décisions et vérifications : `engineering-log/120-DEPLOY-mise-en-ligne.md` ;
utilisation pendant la soutenance : `docs/GUIDE_DEMO.md`, section 6.

> **Secrets.** Aucun fichier de ce dossier ne contient de valeur réelle. Les mots de passe, clés OAuth,
> mot de passe d'application Gmail et clé Anthropic vont **uniquement** dans le `.env` du serveur,
> saisis avec `definir-secret.sh` (rien ne s'affiche). Ne jamais les coller dans une conversation,
> une capture d'écran ou un commit ; s'ils y apparaissent, les révoquer et en créer de nouveaux.

## Contenu

| Fichier | Rôle |
|---|---|
| `cloud-config.yaml` | Initialisation du serveur à sa création : Docker + Compose, git, swap 4 Go, mises à jour de sécurité. |
| `docker-compose.hetzner.yml` | Surcharge de l'hôte (adresses publiques, e-mails réels, ports internes sur `127.0.0.1`, redémarrage automatique). |
| `env.hetzner.example` | Modèle du `.env` du serveur (aucune valeur réelle). |
| `scripts/preparer.sh` | Une fois : `.env` avec mots de passe aléatoires, clés JWT dans `secrets/`. |
| `scripts/definir-secret.sh NOM` | Saisit une valeur du `.env` sans l'afficher. |
| `scripts/certificat.sh obtenir \| renouveler \| etat` | Certificat Let's Encrypt (certbot en conteneur). |
| `scripts/mettre-a-jour.sh [--demo]` | `git pull`, démarrage, attente des sondes, migrations (+ jeu de démonstration). |
| `scripts/verifier.sh` | Contrôle complet : services, HTTPS, redirection, expiration du certificat, SMTP, IA. |
| `scripts/sauvegarder.sh` | Sauvegarde de la base dans `sauvegardes/` (ignoré par git). |
| `scripts/duckdns.sh` | Fait pointer le nom DuckDNS vers ce serveur (après une recréation). |

Toutes les commandes ci-dessous se lancent **sur le serveur**, dans `/root/CERT_EET`.

## 1. Créer le serveur (console Hetzner Cloud)

1. **Serveur** : type **CPX32** (4 vCPU, 8 Go, 160 Go) ou plus grand, image **Ubuntu 24.04**,
   région Helsinki (ou Nuremberg / Falkenstein), IPv4 publique.
2. **Clé SSH** : sur le PC (Git Bash), une seule fois :
   `ssh-keygen -t ed25519 -f ~/.ssh/cert_eet_hetzner`, puis coller le contenu de
   `~/.ssh/cert_eet_hetzner.pub` dans la console.
3. **Cloud config** : coller le contenu de `deploy/hetzner/cloud-config.yaml`.
4. **Pare-feu** (`cert-eet-web`), règles **entrantes** uniquement :

   | Protocole | Port | Usage |
   |---|---|---|
   | TCP | 22 | SSH (clé uniquement) |
   | TCP | 80 | Let's Encrypt + redirection vers HTTPS |
   | TCP | 443 | Site |
   | ICMP | — | ping |

5. Attendre 3 à 5 minutes (installation de Docker), puis se connecter :
   `ssh -i ~/.ssh/cert_eet_hetzner root@<IP>` et vérifier `docker compose version`.

## 2. Nom de domaine (DuckDNS)

Sur https://www.duckdns.org (connexion GitHub) : créer le sous-domaine `cert-eet` et y mettre l'IP du
serveur. Depuis le serveur, une fois le dépôt cloné : `deploy/hetzner/scripts/duckdns.sh`.

## 3. Récupérer le dépôt

```bash
cd /root && git clone https://github.com/Iyed519/CERT_EET.git && cd CERT_EET
chmod +x deploy/hetzner/scripts/*.sh
```

## 4. Configurer

```bash
deploy/hetzner/scripts/preparer.sh
nano .env                     # vérifier DOMAINE et ADMIN_EMAIL
```

Puis saisir chaque secret (une commande par valeur ; rien ne s'affiche) :

```bash
deploy/hetzner/scripts/definir-secret.sh SMTP_USER            # adresse Gmail dédiée à la démo
deploy/hetzner/scripts/definir-secret.sh SMTP_PASSWORD        # mot de passe d'APPLICATION (16 lettres)
deploy/hetzner/scripts/definir-secret.sh MAIL_FROM            # même adresse que SMTP_USER
deploy/hetzner/scripts/definir-secret.sh GITHUB_CLIENT_ID
deploy/hetzner/scripts/definir-secret.sh GITHUB_CLIENT_SECRET
deploy/hetzner/scripts/definir-secret.sh GOOGLE_CLIENT_ID
deploy/hetzner/scripts/definir-secret.sh GOOGLE_CLIENT_SECRET
deploy/hetzner/scripts/definir-secret.sh ANTHROPIC_API_KEY    # clé dédiée au serveur
```

**Applications OAuth** (dédiées au domaine, distinctes de celles du poste de développement) :
- GitHub → *Settings › Developer settings › OAuth Apps* : Homepage `https://cert-eet.duckdns.org`,
  callback `https://cert-eet.duckdns.org/api/auth/oauth/github/callback`.
- Google Cloud → *Google Auth Platform* → client **Application Web** : origine
  `https://cert-eet.duckdns.org`, URI de redirection
  `https://cert-eet.duckdns.org/api/auth/oauth/google/callback`. Ne pas activer l'essai payant.

**Gmail** : compte dédié, validation en deux étapes activée, puis *Compte Google › Sécurité ›
Mots de passe des applications*.

## 5. HTTPS puis démarrage

```bash
deploy/hetzner/scripts/certificat.sh obtenir
deploy/hetzner/scripts/mettre-a-jour.sh --demo
deploy/hetzner/scripts/verifier.sh
```

Le premier démarrage construit les images (5 à 10 minutes). `verifier.sh` doit finir par
« Tout est en ordre. ». Puis, depuis le PC, la recette de navigation
(`docs/GUIDE_DEMO.md`, section 6) : « 0 problème(s) ».

## 6. Exploitation courante

| Besoin | Commande |
|---|---|
| Contrôle complet | `deploy/hetzner/scripts/verifier.sh` |
| Mettre à jour après une fusion sur `main` | `deploy/hetzner/scripts/mettre-a-jour.sh` |
| Remettre les données de démonstration | `docker compose exec api npm run demo:charger` |
| Changer un secret | `deploy/hetzner/scripts/definir-secret.sh NOM` puis `docker compose up -d --wait api` |
| Renouveler le certificat (avant 90 jours) | `deploy/hetzner/scripts/certificat.sh renouveler` |
| Sauvegarder la base | `deploy/hetzner/scripts/sauvegarder.sh` |
| Journaux | `docker compose logs -f api` |
| Arrêter | `docker compose down` — **jamais `-v`** (effacerait toutes les données) |

Mise à jour du système : `apt upgrade` puis `reboot` si « System restart required » ; les conteneurs
redémarrent seuls. **Pas** de `do-release-upgrade` avant la soutenance.

## 7. Pause et reprise (coût)

Un serveur Hetzner éteint reste facturé.
- **Pause** : (facultatif) `sauvegarder.sh`, puis dans la console : *Snapshots › Create snapshot*,
  attendre la fin, puis supprimer le serveur.
- **Reprise** : *Create server* depuis l'instantané (même type ou plus grand), même pare-feu, même
  clé SSH. Puis `deploy/hetzner/scripts/duckdns.sh`, attendre quelques minutes, et
  `deploy/hetzner/scripts/verifier.sh`.

## 8. Hôte installé avant ce dossier (16/11/2026)

Le serveur actuel utilise une surcharge locale à la racine (`docker-compose.hetzner.yml`, non
versionnée). Il fonctionne tel quel : **rien n'est obligatoire**. Pour passer aux fichiers versionnés
(en dehors d'une période de démonstration) :

```bash
cd /root/CERT_EET && git pull
cp .env .env.avant-migration
docker compose config > /tmp/avant.yml
deploy/hetzner/scripts/definir-secret.sh DOMAINE      # cert-eet.duckdns.org
nano .env    # COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml:deploy/hetzner/docker-compose.hetzner.yml
             # + SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, MAIL_FROM s'ils n'y sont pas
docker compose config > /tmp/apres.yml
diff /tmp/avant.yml /tmp/apres.yml    # seules différences attendues : restart des autres services
docker compose up -d --wait && deploy/hetzner/scripts/verifier.sh
```

En cas de souci : `cp .env.avant-migration .env && docker compose up -d --wait`.
