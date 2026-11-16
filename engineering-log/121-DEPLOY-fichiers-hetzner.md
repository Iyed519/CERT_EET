# DEPLOY-fichiers-hetzner — Fichiers de déploiement versionnés (`deploy/hetzner/`)

## En une phrase
Tout ce qui permet de remettre la démonstration en ligne est maintenant dans le dépôt, sans aucun
secret : initialisation du serveur, surcharge Compose, modèle du `.env` et sept scripts
(préparation, saisie des secrets, certificat, mise à jour, vérification, sauvegarde, DuckDNS).

## Décisions (table D)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Emplacement | racine ; `deploy/hetzner/` | `deploy/hetzner/` : un seul dossier, propre à cet hôte ; la racine reste celle de la pile. |
| D2 | Surcharge Compose | fichier local non versionné (journal 120) ; fichier versionné paramétré | Versionnée, **aucune valeur en dur** : `DOMAINE` et les variables SMTP viennent du `.env` ; `${DOMAINE:?}`, `${SMTP_HOST:?}`, `${MAIL_FROM:?}` font échouer le démarrage avec un message clair si elles manquent. |
| D3 | Ports internes | ajout ; remplacement | `ports: !override` (Compose ≥ 2.24) : api, web et Mailhog liés à `127.0.0.1` seulement, au lieu de s'ajouter aux ports de `docker-compose.dev.yml`. |
| D4 | Secrets | éditer le `.env` à la main ; script | `definir-secret.sh` : `read -s` (rien à l'écran ni dans l'historique), remplacement de ligne par `awk` (aucun caractère spécial interprété), `.env` en 600. Valeur contenant `$` écrite entre apostrophes, sinon Compose la prend pour une variable. Espaces retirés du mot de passe d'application Gmail. |
| D5 | Mots de passe internes | saisis ; tirés au hasard | `preparer.sh` : `openssl rand -hex 24` (48 caractères) pour PostgreSQL, admin et MinIO ; clés JWT RS256 ; refuse d'écraser un `.env` ou des clés existants. |
| D6 | Certificat | commandes à la main ; script | `certificat.sh obtenir | renouveler | etat` : certbot en conteneur (standalone, sans e-mail), nginx arrêté le temps du défi et **relancé même en cas d'échec** (`trap`). |
| D7 | Sauvegarde | aucune ; `pg_dump` | `sauvegarder.sh` : `pg_dump` compressé dans `sauvegardes/` (ajouté au `.gitignore`) ; les fichiers MinIO restent couverts par l'instantané Hetzner. |
| D8 | Hôte existant | migration imposée ; facultative | Facultative (README, section 8) avec comparaison `docker compose config` avant / après et retour arrière : le serveur actuel continue de fonctionner tel quel. |
| D9 | Suppressions | — | Aucun script ne supprime de volume (`down -v`), de fichier de données ni de branche. |

## Vérification
- `shellcheck -x` : 0 avertissement sur les 8 scripts.
- `preparer.sh` sur un clone vierge : `.env` sans aucun `__ALEATOIRE__`, trois mots de passe de 48 caractères, `.env` en 600, clés JWT créées ; second lancement refusé (code 1), rien modifié.
- `definir-secret.sh` : remplacement d'une ligne existante sans doublon, ajout d'une variable absente, espaces retirés de `SMTP_PASSWORD`, valeurs avec `& / | \ $` conservées à l'identique.
- `docker compose config` (Compose v5.7) avec les trois fichiers : 0 avertissement ; ports `127.0.0.1:3000/3001/8025`, nginx sur 80/443, `restart: unless-stopped` partout, URL publiques et rappels OAuth construits depuis `DOMAINE`, `SURVEILLANCE_INTERVALLE_SECONDES=0` ; sans `DOMAINE` : refus explicite (code 1).
- Non testés ici (exigent le serveur et le réseau) : `certificat.sh`, `verifier.sh`, `duckdns.sh`, `mettre-a-jour.sh` — à lancer sur l'hôte (README, section 5).
