#!/usr/bin/env bash
# Cert_EET — sauvegarde de la base PostgreSQL dans sauvegardes/ (ignoré par git).
#   deploy/hetzner/scripts/sauvegarder.sh
# Restauration (base vide, pile démarrée) :
#   gunzip -c sauvegardes/<fichier>.sql.gz | docker compose exec -T postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
# Les fichiers MinIO (livrables, certificats PDF) sont couverts par l'instantané Hetzner.
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

utilisateur="$(lire_env POSTGRES_USER)"
base="$(lire_env POSTGRES_DB)"
mkdir -p sauvegardes
fichier="sauvegardes/cert_eet_$(date +%Y%m%d_%H%M%S).sql.gz"
docker compose exec -T postgres pg_dump -U "$utilisateur" -d "$base" --no-owner | gzip > "$fichier"
chmod 600 "$fichier"
info "Sauvegarde : $fichier ($(du -h "$fichier" | cut -f1))"
