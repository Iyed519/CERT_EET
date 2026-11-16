#!/usr/bin/env bash
# Cert_EET — saisit une valeur du .env SANS l'afficher (ni à l'écran, ni dans l'historique).
#   deploy/hetzner/scripts/definir-secret.sh SMTP_PASSWORD
# Remplace la ligne existante ou l'ajoute. Pour SMTP_PASSWORD, les espaces sont retirés
# (Google affiche le mot de passe d'application en 4 groupes de 4 lettres).
# Puis : docker compose up -d --wait api   (prise en compte par l'api).
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

nom="${1:-}"
[[ "$nom" =~ ^[A-Z][A-Z0-9_]*$ ]] || erreur "usage : $0 NOM_DE_VARIABLE (majuscules, ex. SMTP_PASSWORD)"
[ -f .env ] || erreur ".env introuvable (lancer d'abord preparer.sh)"

read -rs -p "Valeur de $nom (rien ne s'affiche) : " valeur
echo
[ -n "$valeur" ] || erreur "valeur vide : rien n'est modifié"
[ "$nom" = "SMTP_PASSWORD" ] && valeur="${valeur// /}"
[[ "$valeur" == *$'\n'* ]] && erreur "la valeur ne doit pas contenir de retour à la ligne"
# Docker Compose remplace « $NOM » dans le .env : une valeur contenant « $ » est écrite
# entre apostrophes (texte littéral). Une valeur avec « $ » ET une apostrophe est refusée.
if [[ "$valeur" == *'$'* ]]; then
  [[ "$valeur" == *"'"* ]] && erreur "valeur avec « \$ » et une apostrophe : non prise en charge"
  valeur="'$valeur'"
fi

temp="$(mktemp .env.XXXXXX)"
NOM="$nom" VALEUR="$valeur" awk '
  BEGIN { nom = ENVIRON["NOM"]; val = ENVIRON["VALEUR"]; fait = 0 }
  index($0, nom "=") == 1 { if (!fait) { print nom "=" val; fait = 1 }; next }
  { print }
  END { if (!fait) print nom "=" val }
' .env > "$temp"
chmod 600 "$temp"
mv "$temp" .env
info "$nom enregistré dans .env (${#valeur} caractères)."
