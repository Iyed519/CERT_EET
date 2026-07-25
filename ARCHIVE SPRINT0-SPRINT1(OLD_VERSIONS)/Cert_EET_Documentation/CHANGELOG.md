# Cert_EET — Journal des mises à jour documentaires (juillet 2026)

> Ce journal consigne **quoi** a changé, **où**, et **pourquoi**, lors de la consolidation documentaire
> de juillet 2026 (fin de Sprint 1). Il fait le lien entre les décisions prises pendant la réalisation
> et leur traduction dans chaque document. Les documents non listés ont été repris **à l'identique**.

---

## 1. Les trois décisions qui motivent ces mises à jour

**D1 — Rotation des refresh tokens (Sprint 1, US-AUTH-03).** La première rédaction de la story disait
« sans renouveler le refresh token », en contradiction avec l'ADR-08 qui prescrivait la rotation avec
détection de rejeu (défense OWASP). Décision : suivre l'ADR — la story a été réécrite et livrée avec
rotation + détection de rejeu (colonne `famille_id`, identifiant `jti` par jeton).

**D2 — Inscription publique en self-service (décision produit).** Le modèle initial (comptes créés
uniquement par un administrateur) évolue vers une plateforme ouverte type Coursera/edX : toute personne
peut créer un compte APPRENANT (email + mot de passe, ou OAuth2 Google/Facebook/GitHub). La création par
l'admin (US-CPT-01) est conservée pour les comptes internes.

**D3 — Onboarding formateur curaté + autorisation par ressource.** Devenir formateur passe par un
dossier approuvé par un administrateur (éligibilité globale) ; les droits d'enseignement sont limités
**aux cours** créés ou rejoints (affectation cours ↔ formateur, notion de créateur) ; un domaine
« Demande » gère les workflows d'approbation. Les stories détaillées seront rédigées avec l'épopée Cours.

---

## 2. Modifications document par document

### `02-Exigences/Cert_EET_Backlog_Produit.md` → version 1.1
| Changement | Motif |
|---|---|
| Version 1.0 → **1.1** + tableau « Historique des révisions » | Tracer l'évolution du périmètre pour le jury (rien ne disparaît silencieusement). |
| **US-AUTH-03** : ligne du tableau + bloc Gherkin réécrits (rotation, détection de rejeu, 3 → 5 pts, réf. ADR-08 ajoutée) | D1 — la version « sans renouveler le refresh token » contredisait l'ADR-08 et ne correspond plus à ce qui est livré et testé. |
| **US-CPT-05 — Créer son propre compte** : nouvelle ligne (épopée E2) + bloc Gherkin complet (rôle APPRENANT forcé, vérification email 48 h, 409 en doublon) | D2. **Nota :** l'identifiant initialement envisagé (US-CPT-04) était déjà pris par « Anonymiser un compte (RGPD) » — d'où US-CPT-**05**. |
| **US-AUTH-14 — Authentification sociale (OAuth2)** : nouvelle ligne (épopée E1) + bloc Gherkin (Google d'abord, liaison de compte, rôle forcé) | D2. **Nota :** l'identifiant initialement envisagé (US-AUTH-13) était déjà pris par « Chiffrement en transit & durcissement » — d'où US-AUTH-**14**. |

### `03-Decisions-ADR/Cert_EET_ADR_v2_2.md` (nouveau nom, ex-v2.1)
| Changement | Motif |
|---|---|
| Version 2.0 → **2.2** (en-tête, pied de page) + entrée ADR-11 dans la table des matières et le tableau récapitulatif | Nouvelle décision majeure = nouvelle version du dossier. |
| **Révision ADR-08-R1** insérée en fin d'ADR-08 (bilan d'implémentation Sprint 1 : rotation effective, `jti`, guards faits main plutôt que passport-jwt, guards globaux + `@Public`, marqueur `sessions-valid-after`, Redis porteur/AOF) | D1 + livraison AUTH-04/AUTH-11. La règle de l'Annexe B (« un ADR validé est immuable, une modification = révision suffixée ») est respectée : la décision n'est pas modifiée, son implémentation est consignée. |
| **ADR-11 — Inscription publique et onboarding formateur — modèle ouvert curaté** : nouvel ADR complet (contexte marché Udemy vs Coursera/edX, 4 décisions, justification, conséquences, alternatives écartées) | D2 + D3 — un changement de modèle produit qui impacte l'architecture (nouvelle couche d'autorisation par ressource, domaine Demande, OAuth) doit être un ADR, pas une note de bas de page. |
| Annexe A : « ADR-01 à ADR-10 » → « ADR-01 à ADR-11 » + ligne de stack « Inscription & connexion sociale » | Cohérence du récapitulatif technique. |
| Annexe B : ligne d'historique (ADR-08-R1, ADR-11, validation encadrant à présenter) | Application de leur propre règle de versionnage. |

### `05-Sprints/Sprint-1/Cert_EET_Sprint1_Backlog.md` (remplacé par la version révisée)
| Changement | Motif |
|---|---|
| Statuts réels : 9/11 stories **Terminé** (toute l'infra + AUTH-01/03/04/11), reste CPT-01 et AUTH-05 | Le Sprint Backlog est un artefact vivant ; il doit refléter la réalité. |
| Bloc de tâches US-AUTH-03 : 3 tâches (~5 h) → **6 tâches** (~8 h) : module Redis, rotation, détection de rejeu, intercepteur, tests | D1 — le plan de tâches doit correspondre au travail réellement effectué. |
| Repointing US-AUTH-03 : 3 → 5 pts ; total engagé 39 → **41 pts** | Honnêteté d'estimation (le périmètre a changé) — assumé et expliqué en soutenance. |
| §2.3 « Évolution de périmètre » : D1/D2/D3 consignées avec renvois (ADR-08-R1, ADR-11, US-CPT-05, US-AUTH-14) | Traçabilité Scrum : le changement de périmètre se documente, il ne s'improvise pas. |

### `05-Sprints/Sprint-1/Cert_EET_Sprint1_Plan.md`
| Changement | Motif |
|---|---|
| Note de révision en en-tête + ligne US-AUTH-03 (5 pts, « avec rotation ») + total 39 → 41 + bloc descriptif US-AUTH-03 réécrit | Le plan est un document d'engagement : plutôt que le réécrire (c'est un instantané), une note de révision datée corrige les seuls éléments devenus faux. |

### `04-Conception/04d-Sequences/Cert_EET_DiagrammesSequence_Scenarios.md`
| Changement | Motif |
|---|---|
| **DS-01, étape 4** réécrite : rotation (nouvelle paire, ancien brûlé), détection de rejeu (révocation de famille), chemins d'erreur élargis | D1 — l'étape disait explicitement « le refresh token n'est pas renouvelé », désormais faux. |

### `04-Conception/04b-Modele-de-donnees/` (3 fichiers)
| Changement | Motif |
|---|---|
| `Cert_EET_DiagrammeDeClasses.puml` : attribut **`familleId : UUID`** ajouté à `SessionUtilisateur` | D1 — la colonne existe en base (migration Sprint 1) ; le modèle doit la refléter. **PNG à régénérer.** |
| `Cert_EET_DiagrammeClasses_Description.md` : phrase d'explication de la famille de tokens (section sécurité) | Le lecteur du diagramme doit comprendre le rôle de l'attribut. |
| `Cert_EET_Dossier_Conception_DiagrammeClasses.md` : ligne de justification `SessionUtilisateur.familleId` dans le tableau des attributs | Ce dossier justifie chaque attribut : le nouveau ne fait pas exception. |
| *Non ajouté volontairement :* le `jti` | Le `jti` vit dans le **payload JWT**, pas en base — il n'a pas sa place dans le modèle de données. |

### `06-Notes-Techniques/Cert_EET_Glossaire_Termes_Techniques.md`
| Changement | Motif |
|---|---|
| 5 entrées ajoutées dans le bloc sécurité (après « Refresh token ») : **Rotation des refresh tokens, Détection de rejeu, Famille de tokens, jti, Denylist** + index alphabétique complété | Ces termes sont désormais utilisés dans le backlog, l'ADR et les DS ; le glossaire doit les couvrir. La note « denylist = blocklist/blacklist des premiers documents » évite toute confusion de vocabulaire entre versions. |

### Versions Word (.docx) — mêmes mises à jour, mêmes documents
| Changement | Motif |
|---|---|
| `02-Exigences/Cert_EET_Backlog_Produit.docx` : **exactement les mêmes modifications que le .md** (version 1.1 + historique, US-AUTH-03 réécrite et repointée, insertion de US-CPT-05 et US-AUTH-14 — lignes de tableaux et blocs Gherkin), appliquées **dans le document Word d'origine** (styles, polices et mise en page conservés) | Chaque document reste dans son format d'origine ; le .docx est la version jury. Validation OOXML : conforme. |
| `03-Decisions-ADR/Cert_EET_ADR_v2_2.docx` : idem (version 2.2, ligne ADR-11 au récapitulatif, révision ADR-08-R1, section ADR-11 complète, annexes A/B, pied de page) | Même principe. Validation OOXML : conforme. |
| **Réparation au passage** : l'ADR .docx d'origine contenait un lien hypertexte cassé (référence `rId14` sans relation associée — le lien vers « Cert eet note authentification sécurité.md » dans la Décision de l'ADR-08). La relation manquante a été recréée et pointe désormais vers `06-Notes-Techniques/Cert_EET_Note_Authentification_Securite.md` | Défaut préexistant détecté par la validation OOXML ; corrigé plutôt que reconduit. |
| Originaux archivés : `02-Exigences/archive/` (Backlog v1.0 .docx + .md) et `03-Decisions-ADR/archive/` (ADR v2.1 .docx + .md) | Rien n'est supprimé : les versions antérieures restent consultables. |
| Tables des matières Word : à rafraîchir à l'ouverture (Ctrl+A puis F9) pour voir ADR-11 et les nouvelles entrées | Les TOC Word sont des champs calculés ; leur contenu se met à jour dans Word, pas dans le fichier. |

### Réorganisation (sans modification de contenu)
Tous les autres documents ont été **copiés à l'identique** dans l'arborescence `01…06` (voir README),
chacun dans son format d'origine (.docx, .md, .puml, .html, .txt). `available ressources` est présent
sous ses noms et formats d'origine (.md et .txt) ; une copie au nom normalisé
(`Cert_EET_Standards_ELearning_Phase2.md`) coexiste, même contenu.

---

## 3. Reste à faire (assumé, planifié)

1. **Régénérer les PNG** des diagrammes modifiés : diagramme de classes (nouvel attribut `familleId`).
2. **`Cert_EET_DS01_Authentification.puml`** (source du diagramme de séquence DS-01, présent dans le
   dépôt Git mais absent de ce dossier) : mettre à jour l'étape 4 avec le même contenu que le scénario
   textuel réécrit, puis régénérer le PNG.
3. **Après livraison du bloc inscription/connexion (Sprint 2)** : mettre à jour les cas d'utilisation
   (le Visiteur peut créer un compte), DS-15, et le Cahier des Charges (modèle ouvert curaté) — listé
   dans les « Conséquences » de l'ADR-11.
4. **Stories du domaine formateur/Demande** : à rédiger avec l'épopée Cours/Formations (D3).
5. **Validation encadrant** : présenter ADR-08-R1 et ADR-11 à la prochaine revue (règle Annexe B des ADR).

---

*Journal de consolidation documentaire · Cert_EET · juillet 2026 · Iyed Omri, PFE ESPRIT.*
