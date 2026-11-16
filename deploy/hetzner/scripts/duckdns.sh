#!/usr/bin/env bash
# Cert_EET — pointe le nom DuckDNS vers l'IP publique de CE serveur (après une recréation
# depuis un instantané). Le jeton DuckDNS est saisi sans être affiché ni enregistré.
#   deploy/hetzner/scripts/duckdns.sh
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

dom="$(domaine)"
sous_domaine="${dom%.duckdns.org}"
[ "$sous_domaine" != "$dom" ] || erreur "DOMAINE n'est pas un nom duckdns.org : rien à faire"

read -rs -p "Jeton DuckDNS (rien ne s'affiche) : " jeton
echo
[ -n "$jeton" ] || erreur "jeton vide"
# ip= vide : DuckDNS prend l'adresse d'où part la requête, donc celle du serveur.
reponse="$(curl -fsS "https://www.duckdns.org/update?domains=$sous_domaine&token=$jeton&ip=")"
unset jeton
[ "$reponse" = "OK" ] || erreur "DuckDNS a répondu « $reponse »"
info "$dom pointe vers $(curl -fsS https://api.ipify.org 2>/dev/null || echo 'cette machine') (propagation : quelques minutes)"
