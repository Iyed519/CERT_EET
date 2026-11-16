# DEPLOY-smtp-auth — Authentification SMTP facultative (vrai relais d'e-mails)

## En une phrase
L'api peut désormais envoyer de vrais e-mails par un relais authentifié (Gmail avec un mot de passe
d'application, `smtp.gmail.com:587`) grâce à trois variables facultatives, `SMTP_USER`,
`SMTP_PASSWORD` et `SMTP_SECURE` ; sans elles, rien ne change (Mailhog en dev, CI inchangée).

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Variables | nouvelle URL `SMTP_URL` ; variables séparées | Variables séparées, comme `SMTP_HOST` / `SMTP_PORT` : `SMTP_USER`, `SMTP_PASSWORD` (facultatives, vides acceptées), `SMTP_SECURE` (booléen, défaut `false`). |
| D2 | Cohérence | accepter un identifiant seul ; refuser | `SMTP_USER` sans `SMTP_PASSWORD` **refuse le démarrage** (fail-fast, même règle que `ANTHROPIC_API_KEY`) : message « SMTP_PASSWORD est obligatoire quand SMTP_USER est fourni. ». |
| D3 | Chiffrement | TLS opportuniste ; STARTTLS exigé | Avec authentification et `secure: false` (587) : `requireTLS: true`, le mot de passe ne part jamais en clair et l'envoi échoue si le serveur n'offre pas TLS. `SMTP_SECURE=true` : TLS dès la connexion (465). Sans authentification : connexion simple (Mailhog), comme avant. |
| D4 | Testabilité | tester le module Nest ; fonction pure | Options construites par la fonction pure `construireOptionsSmtp(MailConfig)` (`mail/options-smtp.ts`), testée sans connexion ; le module ne fait que l'appeler. Délais bornés de US-FORM-03 conservés. |
| D5 | Journaux | — | Le journal de démarrage indique l'hôte, le port et le mode (« sans authentification », « authentifié, STARTTLS exigé », « authentifié, TLS ») ; jamais l'identifiant ni le mot de passe. |
| D6 | Secrets | — | Valeurs réelles uniquement dans le `.env` de l'hôte (jamais dans le dépôt, les images ni la CI). `.env.example` documente sans valeur. `MAIL_FROM` = l'adresse Gmail, sinon Gmail réécrit l'expéditeur. |

## Fichiers
- **API** : `config/configuration.ts` (`MailConfig` : `user`, `password`, `secure`), `config/env.validation.ts` (Joi), `mail/options-smtp.ts` (nouveau), `mail/mail.module.ts` (utilise la fonction, journal du mode).
- **Tests** : `mail/options-smtp.spec.ts` (sans auth, 587 STARTTLS, 465 TLS, identifiant ou mot de passe seul), `config/env.validation.smtp.spec.ts` (défauts, Gmail accepté, identifiant sans mot de passe refusé, `SMTP_SECURE`).
- **Docs** : `.env.example` (racine) et `apps/api/.env.example`, `CHANGELOG.md`.

## Vérification
- API : ESLint `--max-warnings 0`, `tsc --noEmit`, unitaires **132 suites / 1 683 tests** (+2 suites, +11 tests). Aucun e2e touché (la CI garde `SMTP_HOST=localhost`, `SMTP_PORT=1025`, sans identifiants).
- Mutation à la main : `requireTLS` toujours vrai → le test 465 échoue ; authentification dès l'identifiant seul → le test « identifiant seul » échoue ; suppression de la règle Joi → les deux tests « démarrage refusé » échouent.
- Mailhog en dev : options strictement identiques à avant (premier test).
