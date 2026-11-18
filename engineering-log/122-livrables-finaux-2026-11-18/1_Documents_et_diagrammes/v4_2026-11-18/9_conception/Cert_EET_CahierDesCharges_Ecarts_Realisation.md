# Cert_EET — Cahier des charges v4 : écarts de réalisation

> **Version :** 1.0 — 18/11/2026 · Iyed Omri · PFE ESPRIT 2026
> **Objet :** le cahier des charges v4 (juillet 2026) reste le document de besoin et n'est pas réécrit.
> Ce complément indique, exigence par exigence, ce qui a été réalisé au 16/11/2026 (`main` = `e7216f2`,
> PR #141) et ce qui diffère. Légende : ✅ conforme · ⚠️ réalisé avec écart · ❌ non réalisé · ➕ au-delà
> du cahier des charges.

## 1. Exigences fonctionnelles

| Réf. | Exigence | État | Réalisation et écarts |
|---|---|:-:|---|
| F1 | Moteur de QCM anti-fraude | ✅ ➕ | Minuterie, tirage, notation et session unique côté serveur ; bonnes réponses jamais envoyées ; ➕ surveillance webcam par IA (ADR-15) ; ➕ rapport PDF de la tentative |
| F2 | Ateliers pratiques évalués | ⚠️ | Grille pondérée, correction, feedback, remplacement du livrable ; **non réalisés** : annotation de fichiers, anti-plagiat, ateliers de groupe (déjà hors PFE) |
| F3 | Certification vérifiable | ✅ ➕ | PDF + QR + SHA-256 + page publique ; ➕ expiration, réémission, reprise des échecs |
| F4 | Assistance IA | ⚠️ ➕ | Pivot acté en v2.0 : IA **pour les formateurs** (génération RAG, ➕ import de fichiers, ➕ analyse des points faibles) ; chatbot apprenant **non réalisé** (E7) |
| F5 | Gestion multi-rôles (RBAC) | ✅ | RBAC + autorisation par ressource ; inscription publique, demandes de rôle, import CSV |
| F6 | Analytics et reporting | ✅ ➕ | Tableaux de bord, alertes, rapports CSV / PDF, audit ; ➕ prédiction du risque (LightGBM, ADR-14) |
| F7 | Sécurité et conformité | ⚠️ | JWT RS256, rotation, MFA, audit immuable, anonymisation RGPD ; **US-AUTH-07** (modifier son identité) non réalisée ; déclaration INPDP non faite |

## 2. Exigences non fonctionnelles

| Réf. | Exigence | État | Constat |
|---|---|:-:|---|
| NF1 | Performance (API ≤ 500 ms, page < 3 s) | ⚠️ | Travaux lourds en files ; **aucun test de charge** réalisé, cibles non mesurées |
| NF2 | Disponibilité 99 % | ❌ | Un seul serveur de démonstration, sans réplication ni supervision |
| NF3 | Sécurité (JWT, MFA, RBAC, audit) | ✅ | Voir ADR-08-R1 à R3 ; limites de débit, TLS, CSP |
| NF4 | Souveraineté (hébergement local / VPS tunisien) | ⚠️ | Pile auto-hébergeable ; la **démonstration est en Europe** (Hetzner, Helsinki) ; la cible tunisienne reste à réaliser |
| NF5 | Montée en charge | ⚠️ | API sans état (JWT) et travaux dans Redis : multiplication possible, **non éprouvée** |
| NF6 | Maintenabilité | ✅ | TypeScript strict, modules, 2 763 tests, CI, journaux par story, ADR |
| NF7 | Utilisabilité / responsive | ✅ | Charte ESPRIT, contrastes WCAG AA, audit à 1 280 et 390 px (114 pages, 0 problème en ligne) |
| NF8 | Interopérabilité (REST / OpenAPI) | ✅ | Swagger ; adaptateur LLM compatible OpenAI |
| NF9 | Portabilité (Docker) | ✅ | Compose dev / recette / démonstration ; images GHCR |

## 3. Planning
Le cahier des charges prévoyait 12 sprints de deux semaines (24/04 → 24/10/2026). Le projet a été mené en
**6 sprints** puis des extensions (PR #104 → #141), terminé et déployé le **16/11/2026** ; la cadence
réelle est décrite dans les revues de sprint et `8_apres_sprints/Bilan_Apres_Sprints.md`.

*Cert_EET — écarts de réalisation · 18/11/2026*
