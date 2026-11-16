#!/usr/bin/env bash
# Cert_EET — certificat HTTPS Let's Encrypt pour DOMAINE (certbot en conteneur, mode standalone).
#   deploy/hetzner/scripts/certificat.sh obtenir      # première fois
#   deploy/hetzner/scripts/certificat.sh renouveler   # avant l'expiration (90 jours)
#   deploy/hetzner/scripts/certificat.sh etat         # date d'expiration du certificat servi
# nginx est arrêté quelques secondes (le défi HTTP de Let's Encrypt utilise le port 80),
# puis relancé même en cas d'échec. Aucune adresse e-mail n'est enregistrée.
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

action="${1:-}"
dom="$(domaine)"
LE=/etc/letsencrypt
CERTS=docker/nginx/certs

etat() {
  [ -f "$CERTS/fullchain.pem" ] || erreur "aucun certificat dans $CERTS"
  openssl x509 -in "$CERTS/fullchain.pem" -noout -subject -enddate
}

copier() {
  mkdir -p "$CERTS"
  cp -L "$LE/live/$dom/fullchain.pem" "$CERTS/fullchain.pem"
  cp -L "$LE/live/$dom/privkey.pem" "$CERTS/privkey.pem"
  chmod 644 "$CERTS/fullchain.pem"
  chmod 600 "$CERTS/privkey.pem"
}

certbot() {
  docker run --rm -p 80:80 -v "$LE:/etc/letsencrypt" -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    certbot/certbot "$@"
}

relancer_nginx() { docker compose start nginx >/dev/null 2>&1 || docker compose up -d nginx; }

case "$action" in
  obtenir|renouveler)
    info "Arrêt de nginx (libère le port 80)"
    docker compose stop nginx >/dev/null 2>&1 || true
    trap relancer_nginx EXIT
    if [ "$action" = "renouveler" ] && [ -d "$LE/live/$dom" ]; then
      certbot renew --standalone --non-interactive
    else
      certbot certonly --standalone -d "$dom" --agree-tos \
        --register-unsafely-without-email --non-interactive --keep-until-expiring
    fi
    copier
    info "Certificat copié dans $CERTS ; relance de nginx"
    relancer_nginx
    trap - EXIT
    etat
    ;;
  etat) etat ;;
  *) erreur "usage : $0 obtenir | renouveler | etat" ;;
esac
