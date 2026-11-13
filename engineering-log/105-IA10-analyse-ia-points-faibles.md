# US-IA-10 — Analyse des points faibles par Claude dans les rapports

## En une phrase
Chaque rapport d'un apprenant — le PDF d'une tentative de QCM (apprenant, formateur, administrateur)
et le rapport de session individuel du formateur — contient une section écrite par Claude : les 2 à 4
notions où l'apprenant est le plus faible, pourquoi (d'après ses réponses), et quoi travailler
concrètement, en s'appuyant sur les passages du cours indexés ; si l'IA ne répond pas, une encadré
le dit, avec la cause.

## Point de départ
Demande du propriétaire, 13/11/2026, rapport « QCM — Les bases de NestJS, tentative 2 » à l'appui :
le rapport ne contenait que la liste mécanique des questions fausses (« Vos points à revoir »,
US-QCM-13) ; rien n'interprétait les erreurs ni ne disait à l'apprenant sur quoi se concentrer, alors
que la clé Claude est configurée (US-IA-09). Le rapport de session individuel (US-RPT-01) n'avait que
des tableaux.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Couche IA | appel direct ; interface du fournisseur | Nouvelle méthode `analyserPointsFaibles(prompt, options)` de `FournisseurLlm` (ADR-05) : Anthropic (outil `analyser_points_faibles`, choix `auto` comme la génération), compatible OpenAI (même outil), non configuré (refus, message US-IA-09), factice (analyse de démonstration déterministe, seulement sur demande explicite). JSON validé et borné (`validerAnalyse`) : synthèse, 1 à 4 axes `{ notion, constat, conseil, questions[] }`, encouragement ; textes tronqués, numéros de question filtrés sur ceux envoyés. |
| D2 | Ancrage sur le cours | sans ; RAG | RAG : les passages des supports **indexés** des modules concernés les plus proches des questions ratées (pgvector, 6 au plus, même fournisseur d'embeddings que la génération) sont joints ; le modèle peut citer le support (« relisez dans *Cours NestJS* le passage sur… »). Sans support : conseils généraux, signalés comme tels. |
| D3 | Corrigé pas encore disponible pour l'apprenant | même analyse ; analyse sans réponses | Les bonnes réponses ne sont **jamais envoyées** au modèle quand le rapport de l'apprenant n'inclut pas le corrigé (règle US-QCM-09), et la consigne interdit de donner la bonne option : l'analyse nomme la notion et la méthode, pas la réponse. Formateur, administrateur, ou corrigé disponible : bonnes réponses et explications envoyées. |
| D4 | Coût et délai (PDF de tentative, synchrone) | appel à chaque téléchargement ; cache | Une tentative notée est figée : l'analyse réussie est **conservée** dans `analyses_ia_tentatives` (clé : tentative + avec/sans corrigé, migration `1789200000000`) et réutilisée ; un échec n'est pas conservé (le prochain téléchargement réessaie). Délai : le PDF de tentative est servi dans la requête HTTP, sous le délai du mandataire nginx (60 s) → un seul essai de 45 s au plus ; rapport de session (file) : 60 s et une nouvelle tentative si l’erreur est récupérable. |
| D5 | Rapport de session individuel (file `rapports`) | — | Généré une fois par la file : l'analyse porte sur la **dernière tentative notée de chaque QCM** (questions ratées, avec corrigé : le lecteur est formateur ou administrateur) et sur les **livrables notés** (note, commentaire général du formateur). Section « Analyse de Claude » après la synthèse. CSV : inchangé (données brutes). Un échec de l'IA ne fait **pas** échouer le rapport : la section affiche la cause. |
| D6 | Échec visible | — | Encadré « Analyse IA indisponible : *cause* » (messages français d'US-IA-09 : crédit épuisé, clé refusée, IA non configurée, surcharge…) ; le reste du rapport est produit normalement. Mention du modèle sous l'analyse (« Analyse générée par Claude (claude-sonnet-5-5) — à relire avec votre formateur »). |
| D7 | Audit | — | `RAPPORT_QCM_TELECHARGE` garde ses champs ; ajout `analyseIa: 'GENEREE' | 'CACHE' | 'INDISPONIBLE'` dans les détails. Aucun texte de l'analyse dans l'audit. |
| D9 | Mise en page | — | Section après la synthèse, avant « Vos points à revoir » ; « Détail par question » ne reste plus seul en bas de page (saut de page s'il manque la place d'une question). Rapport de session : « ✓ » (absent des polices WinAnsi, imprimé « ' ») remplacé par « (réussi) ». |
| D8 | Données envoyées | — | **Aucune identité** (ni nom, ni prénom, ni e-mail : l'analyse s'adresse à « vous ») ; énoncés, réponses cochées, verdicts, niveaux, titres de formation / module / QCM / atelier, commentaires des formateurs, passages du cours. Rien d'autre. |

## Fichiers
- Migration `1789200000000-AddAnalysesIaTentatives` (table `analyses_ia_tentatives`).
- `assistance-ia/llm/` : `fournisseur-llm.ts` (`analyserPointsFaibles`, `OUTIL_ANALYSE`, `SCHEMA_ANALYSE`,
  `MODELE_FACTICE`), `llm-anthropic.ts`, `llm-compatible-openai.ts`, `llm-factice.ts`, `llm-non-configure.ts`.
- `assistance-ia/analyse-points-faibles/` (nouveau) : `analyse-points-faibles.regles.ts` (prompt, validation,
  entrée d'une tentative), `analyse-points-faibles.service.ts` (RAG, appel, conservation),
  `analyse-ia-pdf.ts` (section PDF), `analyse-ia.module.ts`, et leurs tests.
- `tentatives/rapport/` : `rapport-tentative.service.ts`, `rapport-tentative-pdf.ts`, `rapport-tentative.module.ts`.
- `rapports/` : `rapports.service.ts` (`analyseApprenant`), `rapport-session.ts`, `rapport-format.ts` (section `dessin`),
  `rapports.module.ts`.
- Web : `components/BoutonRapportPdf.tsx` (« Analyse par l'IA et préparation du rapport… »).
- Tests e2e : `rapport-tentative.e2e-spec.ts` (+3 : sans corrigé rien ne fuit, conservation et réutilisation,
  version formateur à part, IA en échec), `rapports-session.e2e-spec.ts` (+1 : IA en échec, rapport PRET).
- Backlog (v2.5), `CHANGELOG.md`.

## Vérification
- Unitaires **1 634** ; e2e **921** (920 + 1 ignoré) ; ESLint API `--max-warnings 0`, `tsc`, `next lint`, `next build`.
- Mutations : 11 / 11 tuées (bonnes réponses ou explications envoyées sans corrigé, consigne de secret,
  conservation ignorée, version du lecteur ignorée, nouvelle tentative, analyse absente du rapport de
  session, cause absente de l'encadré, audit figé, supports non indexés).
- Aperçu PDF rendu et regardé (2 pages : analyse sur la page 1, détail sur la page 2).
- Non vérifié ici : la qualité du texte de Claude lui-même (aucune clé dans cet environnement ; la CI
  utilise le fournisseur factice). À juger sur la machine du propriétaire.
