#!/usr/bin/env bash
# Cert_EET — fonctions communes des scripts de l'hôte de démonstration (sourcé, jamais exécuté).
set -euo pipefail

# Racine du dépôt : deploy/hetzner/scripts/../../..
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$RACINE"

erreur() { echo "ERREUR : $*" >&2; exit 1; }
info() { echo "==> $*"; }

# Valeur d'une variable du .env (dernière occurrence), sans l'afficher ailleurs.
lire_env() {
  [ -f .env ] || erreur ".env introuvable dans $RACINE (lancer d'abord preparer.sh)"
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- || true
}

domaine() {
  local d
  d="$(lire_env DOMAINE)"
  [ -n "$d" ] || erreur "DOMAINE est vide dans .env"
  echo "$d"
}
