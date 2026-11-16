#!/usr/bin/env bash
# Cert_EET — première préparation de l'hôte, une seule fois, juste après le clonage du dépôt.
#   deploy/hetzner/scripts/preparer.sh
# Crée .env depuis env.hetzner.example avec des mots de passe internes tirés au hasard,
# génère les clés JWT RS256 dans secrets/ et le dossier des certificats TLS.
# Ne remplace jamais un .env ou des clés existants.
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

[ -f .env ] && erreur ".env existe déjà : rien n'est modifié (le supprimer à la main pour repartir de zéro)."
command -v openssl >/dev/null || erreur "openssl est requis"

info "Création de .env (mots de passe aléatoires)"
umask 077
while IFS= read -r ligne || [ -n "$ligne" ]; do
  if [[ "$ligne" == *__ALEATOIRE__* ]]; then
    ligne="${ligne//__ALEATOIRE__/$(openssl rand -hex 24)}"
  fi
  printf '%s\n' "$ligne"
done < deploy/hetzner/env.hetzner.example > .env
chmod 600 .env

if [ -f secrets/jwt_private.pem ]; then
  info "Clés JWT déjà présentes dans secrets/ : conservées"
else
  info "Génération des clés JWT RS256 dans secrets/"
  mkdir -p secrets
  openssl genrsa -out secrets/jwt_private.pem 2048 2>/dev/null
  openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem 2>/dev/null
  # Lisibles par l'utilisateur non root du conteneur api (montage en lecture seule).
  chmod 644 secrets/jwt_private.pem secrets/jwt_public.pem
fi

mkdir -p docker/nginx/certs
umask 022

cat <<FIN

Préparation terminée. Étapes suivantes (README, section 4) :
  1. Vérifier DOMAINE et ADMIN_EMAIL :       nano .env
  2. Saisir les secrets, un par un :          deploy/hetzner/scripts/definir-secret.sh SMTP_USER
     (SMTP_PASSWORD, MAIL_FROM, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY)
  3. Certificat HTTPS :                       deploy/hetzner/scripts/certificat.sh obtenir
  4. Démarrage + données de démonstration :   deploy/hetzner/scripts/mettre-a-jour.sh --demo
FIN
