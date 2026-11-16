#!/usr/bin/env bash
# Cert_EET — (re)démarrage de la pile sur l'hôte : récupère main, reconstruit si besoin,
# attend que tout soit sain, applique les migrations.
#   deploy/hetzner/scripts/mettre-a-jour.sh          # mise à jour courante
#   deploy/hetzner/scripts/mettre-a-jour.sh --demo   # + recharge le jeu de démonstration
# Ne supprime jamais de volume (pas de « down -v ») ni de branche.
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

[ -f docker/nginx/certs/fullchain.pem ] || erreur "certificat absent : lancer d'abord certificat.sh obtenir"

info "Récupération de main"
git pull --ff-only

info "Démarrage (construction si nécessaire), attente des sondes de santé"
docker compose up -d --build --wait

info "Migrations de la base"
docker compose exec -T api npm run migration:run

if [ "${1:-}" = "--demo" ]; then
  info "Chargement du jeu de démonstration"
  docker compose exec -T api npm run demo:charger
fi

docker compose ps
info "Terminé : https://$(domaine)"
