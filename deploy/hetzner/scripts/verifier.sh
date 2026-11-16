#!/usr/bin/env bash
# Cert_EET — contrôle rapide de l'hôte (la veille d'une démonstration, après un redémarrage…).
#   deploy/hetzner/scripts/verifier.sh
# Code de sortie 0 : tout va bien.
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

dom="$(domaine)"
echecs=0
ok() { echo "  OK    $*"; }
ko() { echo "  ÉCHEC $*"; echecs=$((echecs + 1)); }

echo "Services :"
for s in postgres redis minio ml api web nginx; do
  etat="$(docker inspect -f '{{.State.Health.Status}}' "cert_eet_$s" 2>/dev/null || echo absent)"
  if [ "$etat" = "healthy" ]; then ok "$s"; else ko "$s ($etat)"; fi
done

echo "Accès public :"
code="$(curl -s -o /dev/null -w '%{http_code}' "http://$dom/" || true)"
if [ "$code" = "301" ]; then ok "http -> https (301)"; else ko "http://$dom/ a répondu $code (301 attendu)"; fi
code="$(curl -s -o /dev/null -w '%{http_code}' "https://$dom/" || true)"
if [ "$code" = "200" ]; then ok "https://$dom/ (200)"; else ko "https://$dom/ a répondu $code (200 attendu)"; fi

echo "Certificat :"
fin="$(echo | openssl s_client -connect "$dom:443" -servername "$dom" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
if [ -n "$fin" ]; then
  jours=$(( ($(date -d "$fin" +%s) - $(date +%s)) / 86400 ))
  if [ "$jours" -ge 14 ]; then ok "expire dans $jours jours ($fin)"; else ko "expire dans $jours jours : certificat.sh renouveler"; fi
else
  ko "certificat illisible"
fi

echo "E-mails :"
if [ -n "$(lire_env SMTP_USER)" ] && [ -n "$(lire_env SMTP_PASSWORD)" ]; then ok "SMTP authentifié configuré"; else ko "SMTP_USER / SMTP_PASSWORD vides (e-mails vers Mailhog)"; fi
echo "IA :"
if [ -n "$(lire_env ANTHROPIC_API_KEY)" ]; then ok "clé Anthropic présente"; else ko "ANTHROPIC_API_KEY vide (IA « non configurée »)"; fi

echo
if [ "$echecs" -eq 0 ]; then echo "Tout est en ordre."; else echo "$echecs point(s) à corriger."; fi
exit "$echecs"
