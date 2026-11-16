# DEPLOY-mise-en-ligne — Démonstration en ligne (https://cert-eet.duckdns.org)

## En une phrase
Cert_EET tourne en ligne, en HTTPS, avec le jeu de démonstration, sur un serveur Hetzner Cloud
(Helsinki), derrière un nom DuckDNS et un certificat Let's Encrypt ; connexions GitHub et Google,
vrais e-mails par Gmail et assistant IA actifs ; recette de navigation : 114 pages, 0 problème.

## Décisions (table D)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Hébergement | DigitalOcean, Azure for Students, Google Cloud, Oracle Always Free, GitHub Codespaces, poste personnel, VPS payant | Les cinq premiers écartés (hors Student Pack, « not eligible », prépaiement exigé, échec de création, pile jamais `healthy` sous Codespaces) ; le poste est trop léger. **Hetzner Cloud CPX32** (4 vCPU AMD, 8 Go, 160 Go, Ubuntu 24.04, Helsinki), environ 0,057 €/h. |
| D2 | Souveraineté (NF4) | — | Présenté comme **environnement de démonstration hébergé en Europe**. La cible de production reste un hébergement en Tunisie (ADR-07) ; le pied de page « données hébergées en Tunisie » décrit la cible : le dire à l'oral. |
| D3 | Nom de domaine | IP brute ; domaine payant ; DuckDNS | **DuckDNS** (gratuit) : `cert-eet.duckdns.org` ; l'IP se change dans DuckDNS si le serveur est recréé. |
| D4 | HTTPS | auto-signé ; Let's Encrypt | **Let's Encrypt** (certbot en conteneur, mode `standalone`, nginx arrêté le temps du défi), certificat copié dans `docker/nginx/certs/` (ignoré par git) ; valable 90 jours. |
| D5 | Mode de la pile | recette (`docker-compose.recette.yml`) ; dev | **dev** (`docker-compose.yml` + `docker-compose.dev.yml`), éprouvé par toute la recette E11, plus une **surcharge locale** `docker-compose.hetzner.yml` (non versionnée, dans `.git/info/exclude`) : URL publiques, ports internes sur `127.0.0.1`, `restart: unless-stopped`. |
| D6 | Exposition | — | Pare-feu Hetzner : entrant TCP 22, 80, 443 et ICMP seulement. api (3000), web (3001) et Mailhog (8025) liés à `127.0.0.1` : tout passe par nginx. Connexion SSH par clé uniquement. |
| D7 | OAuth | réutiliser les applications locales ; applications dédiées | **Applications dédiées** : OAuth App GitHub « Cert_EET (démo en ligne) » et client Web Google « Cert_EET démo » (projet Google Cloud `cert-eet`), rappels sur le domaine. Aucun essai payant Google Cloud activé (inutile pour OAuth). |
| D8 | E-mails | Mailhog ; Gmail | **Gmail** (compte dédié à la démo, mot de passe d'application) grâce à DEPLOY-smtp-auth (journal 118) : `smtp.gmail.com:587`, STARTTLS exigé. `MAIL_FROM` = l'adresse du compte. |
| D9 | Secrets | — | Uniquement dans le `.env` et `secrets/` du serveur, saisis avec `read -s` (jamais affichés, jamais dans le dépôt ni dans une conversation). Mots de passe des services tirés au hasard. Un secret GitHub apparu dans une capture d'écran a été révoqué et régénéré. |
| D10 | Tâches de fond | — | `SURVEILLANCE_INTERVALLE_SECONDES=0` : pas de balayage périodique des alertes sur la démo (calcul à la demande). |
| D11 | Coût hors soutenance | laisser tourner ; éteindre ; instantané | Un serveur éteint reste facturé : **pause = instantané (snapshot) puis suppression**, recréation depuis l'instantané avant la soutenance, puis mise à jour de l'IP dans DuckDNS. |

## Surcharge `docker-compose.hetzner.yml` (modèle ; le fichier réel reste sur le serveur)
```yaml
services:
  api:
    environment:
      APP_BASE_URL: "https://cert-eet.duckdns.org"
      GOOGLE_CALLBACK_URL: "https://cert-eet.duckdns.org/api/auth/oauth/google/callback"
      GITHUB_CALLBACK_URL: "https://cert-eet.duckdns.org/api/auth/oauth/github/callback"
      SMTP_HOST: smtp.gmail.com
      SMTP_PORT: "587"
      MAIL_FROM: "Cert_EET <adresse-du-compte@gmail.com>"
      SURVEILLANCE_INTERVALLE_SECONDES: "0"
    ports: !override ["127.0.0.1:3000:3000"]
    restart: unless-stopped
  web:
    ports: !override ["127.0.0.1:3001:3001"]
    restart: unless-stopped
  mailhog:
    ports: !override ["127.0.0.1:8025:8025"]
```
`.env` : `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml:docker-compose.hetzner.yml` (les commandes
`docker compose …` n'ont plus besoin de `-f`), `CORS_ORIGIN` sur le domaine, `SMTP_USER` / `SMTP_PASSWORD`,
identifiants OAuth, `ANTHROPIC_API_KEY` (clé dédiée au serveur).

## Mise en place (résumé)
1. Serveur CPX32 + cloud-config (Docker, Compose, swap 4 Go), pare-feu, clé SSH.
2. DuckDNS → IP du serveur ; certificat Let's Encrypt ; copie de `fullchain.pem` et `privkey.pem`.
3. Clonage du dépôt, `.env` (mots de passe aléatoires), clés JWT dans `secrets/`, surcharge ci-dessus.
4. `docker compose up -d --build --wait` ; `migration:run` ; `demo:charger`.
5. Applications OAuth GitHub et Google, Gmail, clé Anthropic ; redémarrage de l'api après chaque changement du `.env`.

## Défaut trouvé en ligne
Lien « mot de passe oublié » affiché comme « incomplet » : rejeu des effets par le mode strict de React en
mode dev ; corrigé par DEPLOY-lien-jeton (journal 119, PR #139).

## Vérification
- 8 services `healthy` (Mailhog sans sonde : `Up`), y compris après un redémarrage du serveur (mise à jour du noyau) : tout revient seul.
- Recette de navigation (`outils/recette`, `BASE=https://cert-eet.duckdns.org`, Edge) : 5 rôles × 1280 et 390 px, **114 pages, 0 problème**.
- Connexion GitHub et Google depuis l'extérieur ; e-mails réels reçus ; « mot de passe oublié » de bout en bout (lien, nouveau mot de passe, connexion).
- Connexion SMTP Gmail testée avant le redémarrage de l'api (`smtplib`, STARTTLS + authentification).

## Limites
- Pile en mode dev (rechargement à chaud, React en mode strict) : suffisant pour une démonstration, pas une production.
- Un seul serveur, sans sauvegarde automatique : `docker compose down -v` est interdit (efface les volumes).
- Certificat à renouveler avant le 13/02/2027 (`docker compose stop nginx`, `certbot renew` en standalone, recopie des deux `.pem`, `docker compose start nginx`).
- Hébergement en Europe, pas en Tunisie (D2).
