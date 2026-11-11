#!/usr/bin/env bash
# US-AUTH-13 — Vérification du durcissement d'un déploiement (recette / prod).
# Usage : ./docker/nginx/verifier-durcissement.sh <hôte> [port_https=443] [port_http=80]
# Ajouter INSECURE=1 pour un certificat auto-signé (recette). Ne modifie rien.
set -u
HOTE=${1:?hôte requis}; HTTPS=${2:-443}; HTTP=${3:-80}
K=""; [ "${INSECURE:-0}" = "1" ] && K="-k"
ok=0; ko=0
verifier() { if eval "$2" >/dev/null 2>&1; then echo "OK   $1"; ok=$((ok+1)); else echo "ÉCHEC $1"; ko=$((ko+1)); fi; }

ENTETES=$(curl -s $K -o /dev/null -D - "https://$HOTE:$HTTPS/api/docs-json")
verifier "HTTP -> HTTPS (301)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' http://$HOTE:$HTTP/)\" = 301 ]"
verifier "HSTS présent (max-age >= 1 an)" "echo \"\$ENTETES\" | grep -qiE 'strict-transport-security: max-age=(3[1-9][0-9]{6}|[4-9][0-9]{7}|[0-9]{9,})'"
verifier "X-Content-Type-Options: nosniff" "echo \"\$ENTETES\" | grep -qi 'x-content-type-options: nosniff'"
verifier "Content-Security-Policy présent" "echo \"\$ENTETES\" | grep -qi 'content-security-policy:'"
verifier "Pas de version nginx (server_tokens off)" "! echo \"\$ENTETES\" | grep -qiE '^server: nginx/[0-9]'"
verifier "Pas de X-Powered-By" "! echo \"\$ENTETES\" | grep -qi 'x-powered-by'"
verifier "TLS 1.2 accepté" "echo | openssl s_client -connect $HOTE:$HTTPS -tls1_2 -servername $HOTE"
verifier "TLS 1.3 accepté" "echo | openssl s_client -connect $HOTE:$HTTPS -tls1_3 -servername $HOTE"
verifier "TLS 1.1 refusé" "! (echo | openssl s_client -connect $HOTE:$HTTPS -tls1_1 -servername $HOTE)"
verifier "Suite faible (CBC/RSA statique) refusée" "! (echo | openssl s_client -connect $HOTE:$HTTPS -tls1_2 -cipher AES128-SHA -servername $HOTE)"
echo "Résultat : $ok OK, $ko échec(s)"; [ "$ko" -eq 0 ]
