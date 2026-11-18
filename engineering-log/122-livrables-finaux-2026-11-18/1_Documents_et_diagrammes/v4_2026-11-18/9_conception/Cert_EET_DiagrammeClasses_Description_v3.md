# Cert_EET — Description du diagramme de classes (v3.0, modèle réalisé)

> **Version :** 3.0 — 18/11/2026 (v2.0 : juin–juillet 2026, modèle de conception à 36 classes) · Iyed Omri
> **Méthode :** les 43 migrations de `main` (PR #141) ont été exécutées sur PostgreSQL 16 + pgvector, puis le
> schéma a été relu (tables, colonnes, 83 clés étrangères, contraintes, 10 déclencheurs). Les diagrammes
> `10_diagrammes/classes/CLS-00` à `CLS-11` sont **générés depuis ce schéma** : chaque classe est une table
> réelle, chaque attribut une colonne. Rien n'est dessiné à la main.

## 1. Chiffres

| Élément | Conception (v2.0) | Réalisé (v3.0) |
|---|:-:|:-:|
| Classes / tables métier | 36 | **48** |
| Entités TypeORM | — | **41** (7 tables en SQL direct) |
| Énumérations | 8 | **27** types ENUM + 9 listes CHECK |
| Packages | 8 | **10** |
| Clés étrangères | — | **83** |
| Déclencheurs d'immuabilité | — | **10** |

## 2. Principaux écarts avec le modèle de conception

- **Pas d'héritage `User` → Apprenant / Formateur / Administrateur** : une seule table `users` avec la colonne `role` (la conception prévoyait déjà une *Single Table Inheritance*) ; les rôles apparaissent dans les noms des associations (apprenant, formateur, correcteur…).
- **`SessionUtilisateur` + `TokenJWT` → `RefreshToken`** : la session est la *famille* du refresh token ; le jeton d'accès n'est pas stocké (denylist Redis).
- **`Revocation`, `EmpreinteSHA256` et `VerificationCertificat` → colonnes de `Certificat`** (motif, date, auteur, empreinte) ; les vérifications publiques sont tracées dans `audit_logs`.
- **`BanqueQuestions` → table de liaison `qcm_questions`** : la banque est l'ensemble des questions des QCM du formateur.
- **`Feedback` → colonnes de `Correction`** (commentaire général) + `ConsultationFeedback` ; pas de fichiers annotés.
- **`Notification` supprimée** : e-mails et compteurs, sans table.
- **Livrable sans état BROUILLON** (SOUMIS → EN_CORRECTION → NOTE).
- **Nouvelles classes** : `CompteOauth`, `JetonLienEmail`, `DemandeRole`, référentiel (4), `AffectationFormateur`, `RessourceModule`, `DemandeAffectation`, `PropositionFormation`, `AnalyseIaTentative`, `CaptureWebcam`, `EvenementSurveillance`, `SegmentSupport`, `ExtractionQuestionsIa`, `QuestionExtraiteIa`, `ActionAlerte`, `ScoreRisque`, `Rapport`.

## 3. CLS-01 — Utilisateurs & sécurité

Figure : `classes/Cert_EET_CLS-01_Utilisateurs_securite.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **User** (`users`) | Compte unique pour les trois rôles (colonne role) ; profil apprenant ; MFA. | email, motDePasseHash, role, statut, mfaActive, mfaSecret, derniereConnexion, createdAt, updatedAt, nom, prenom, dateNaissance, niveauEtudes, etablissementAutre, profilComplet |
| **RefreshToken** (`refresh_tokens`) | Jetons de rafraîchissement (empreinte), regroupés par famille = session. | tokenHash, adresseIp, userAgent, active, dateExpiration, createdAt, familleId |
| **CompteOauth** (`comptes_oauth`) | Identité Google / GitHub liée à un compte. | provider, providerId, email, createdAt |
| **JetonLienEmail** (`jetons_lien_email`) *(SQL direct)* | Liens à usage unique (mot de passe oublié, activation) : empreinte SHA-256, expiration. | objet, empreinte, expireLe, utiliseLe, creeLe |
| **DemandeRole** (`demandes_role`) | Demande de montée en rôle et décision de l'administrateur. | roleDemande, justification, statut, motif, createdAt, traiteAt |

## 4. CLS-02 — Référentiel des établissements

Figure : `classes/Cert_EET_CLS-02_Referentiel_des_etablissements.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **Universite** (`universites`) | Référentiel : universités. | nom, type, gouvernorat, createdAt |
| **Etablissement** (`etablissements`) | Référentiel : établissements. | nom, type, gouvernorat, createdAt |
| **DomaineEtudes** (`domaines_etudes`) | Référentiel : domaines d'études. | code, libelle, createdAt |
| **EtablissementDomaine** (`etablissement_domaine`) | Association établissement ↔ domaine. |  |

## 5. CLS-03 — Formations & pédagogie

Figure : `classes/Cert_EET_CLS-03_Formations_pedagogie.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **Formation** (`formations`) | Formation certifiante : statut, capacité, seuil de certification, durée de validité. | titre, description, createdAt, updatedAt, objectifs, prerequis, dateDebut, dateFin, dureeHeures, modeleCertificat, statut, capaciteMax, noteMinCertification, dureeValiditeMois |
| **ModuleFormation** (`modules`) | Module ordonné d'une formation. | titre, ordre, description, createdAt, updatedAt |
| **AffectationFormateur** (`formation_formateurs`) | Affectation d'un formateur à une formation (droits par ressource). | createdAt |
| **Inscription** (`inscriptions`) | Lien apprenant ↔ formation : statut, avancement, suspension. | dateInscription, dateEcheance, statut, tauxAvancement, updatedAt, motifSuspension, dateSuspension |
| **RessourceModule** (`ressources_module`) | Lien ou fichier mis à disposition dans un module. | ordre, nature, titre, description, url, plateforme, videoId, debutSecondes, createdAt, updatedAt, nomOriginal, extension, typeMime, tailleOctets, sha256, cleStockage, lecture |
| **DemandeAffectation** (`demandes_affectation`) *(SQL direct)* | Demande d'un formateur pour enseigner une formation (US-FORM-07). | motif, statut, motifRefus, traiteLe, creeLe |
| **PropositionFormation** (`propositions_formation`) *(SQL direct)* | Proposition de nouvelle formation par un formateur, avec versions (US-FORM-08). | titre, description, objectifs, dureeHeures, capaciteMax, publicVise, motif, statut, commentaireAdmin, version, traiteLe, creeLe, modifieLe |

## 6. CLS-04 — Évaluations QCM (F1)

Figure : `classes/Cert_EET_CLS-04_Evaluations_QCM.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **Qcm** (`qcm`) | Questionnaire d'un module : BROUILLON, NON_PUBLIE, PUBLIE. | titre, description, statut, createdAt, updatedAt |
| **ConfigurationAntiFraude** (`config_anti_fraude`) | Paramètres anti-fraude (un par QCM). | randomiserQuestions, randomiserOptions, nbQuestionsTirees, dureeMaxMinutes, dateOuverture, dateFermeture, nbTentativesMax, delaiEntreTentatives, blocageSessionsMultiples, affichageResultats, scoreMinValidation, ponderationFormation, proctoringWebcam, desactiverCopierColler, createdAt, updatedAt |
| **Question** (`questions`) | Question réutilisable (origine MANUELLE, IA, IA_MODIFIEE). | enonce, type, ponderation, explication, niveauDifficulte, createdAt, updatedAt, origine |
| **Option** (`options`) | Choix d'une question ; est_correcte jamais envoyé au navigateur. | texte, estCorrecte, ordre |
| **QcmQuestion** (`qcm_questions`) | Liaison QCM ↔ question (banque sans copie). | ordre |
| **TentativeQcm** (`tentatives_qcm`) | Passage d'un QCM : minuterie serveur, plan de tirage, session, consentement. | dateDebut, dateLimite, dateFin, dureeEffective, score, estReussie, statut, planTirage, sessionId, consentementSurveillanceLe |
| **Reponse** (`reponses`) | Réponse à une question dans une tentative. | estCorrecte, pointsObtenus, updatedAt |
| **ReponseOption** (`reponse_options`) | Options cochées. |  |
| **AnalyseIaTentative** (`analyses_ia_tentatives`) *(SQL direct)* | Analyse des points faibles conservée (avec / sans corrigé). | avecCorrige, modele, contenu, dateCreation |

## 7. CLS-05 — Surveillance des QCM (F1)

Figure : `classes/Cert_EET_CLS-05_Surveillance_des_QCM.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **CaptureWebcam** (`captures_webcam`) *(SQL direct)* | Photo de contrôle (US-QCM-12 ; désactivée par défaut). | cleStockage, tailleOctets, typeContenu, priseLe |
| **EvenementSurveillance** (`evenements_surveillance`) *(SQL direct)* | Alerte de la surveillance IA avec photo et examen par le formateur. | type, confiance, cleStockage, tailleOctets, typeContenu, detecteLe, statut, examineLe |

## 8. CLS-06 — Ateliers pratiques (F2)

Figure : `classes/Cert_EET_CLS-06_Ateliers_pratiques.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **Atelier** (`ateliers`) | Travail pratique d'un module. | titre, enonce, competencesVisees, dateLimite, typesLivrables, tailleMaxMo, nbMaxFichiers, toleranceRetardHeures, statut, createdAt, updatedAt |
| **Grille** (`grilles`) | Grille de notation (ou modèle réutilisable). | validee, estModele, nomModele, createdAt, updatedAt |
| **Critere** (`criteres`) | Critère pondéré. | ordre, intitule, ponderation, description, createdAt, updatedAt |
| **NiveauPerformance** (`niveaux_performance`) | Palier d'un critère. | ordre, libelle, pointsMinPct, pointsMaxPct, descripteur |
| **Livrable** (`livrables`) | Dépôt d'un apprenant (version, hash de traçabilité). | version, statut, dateSoumission, enRetard, hashTracabilite, commentaire, liens, createdAt, updatedAt |
| **FichierLivrable** (`fichiers_livrables`) | Fichier d'un livrable. | ordre, nomOriginal, extension, tailleOctets, sha256, cleStockage |
| **Correction** (`corrections`) | Correction d'un livrable (EN_COURS, TERMINEE). | statut, dateOuverture, createdAt, updatedAt, scoreTotal, commentaireGeneral, dateFinalisation |
| **NoteCritere** (`notes_criteres`) | Note d'un critère dans une correction. | pointsPct, commentaire, createdAt, updatedAt |
| **ConsultationFeedback** (`consultations_feedback`) | Date de première lecture du feedback. | dateConsultation |

## 9. CLS-07 — Certification (F3)

Figure : `classes/Cert_EET_CLS-07_Certification.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **Certificat** (`certificats`) | Certificat : PDF, SHA-256, révocation, expiration, réémission (remplace_certificat_id). | statut, scoreFinal, mention, organismeEmetteur, dateEmission, dateGeneration, cleStockage, empreinteSha256, nbTentatives, derniereErreur, createdAt, updatedAt, dateRevocation, motifRevocation, descriptionRevocation, echecDefinitifLe, debutGeneration, dateExpiration |

## 10. CLS-08 — Assistance IA aux formateurs (F4)

Figure : `classes/Cert_EET_CLS-08_Assistance_IA_aux_formateurs.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **SupportPedagogique** (`supports_pedagogiques`) | Support de cours déposé pour le RAG. | titre, nomOriginal, extension, tailleOctets, sha256, cleStockage, statut, nbSegments, nbCaracteres, modeleEmbeddings, nbTentatives, derniereErreur, dateDepot, dateIndexation, createdAt, updatedAt |
| **SegmentSupport** (`segments_support`) *(SQL direct)* | Passage de 2 000 caractères et son vecteur (384). | ordre, texte, embedding |
| **GenerationIa** (`generations_ia`) | Lot de génération IA (paramètres, modèle, résultat). | nbQuestionsDemandees, typesQuestions, niveau, focusThematique, statut, modeleLlm, nbSuggestions, nbInvalides, nbTentatives, derniereErreur, dateLancement, dateFin, createdAt, updatedAt |
| **SuggestionQuestionIa** (`suggestions_questions_ia`) | Question proposée par l'IA et décision du formateur. | ordre, enonce, type, options, explication, scoreConfiance, passagesSources, statut, createdAt, updatedAt, dateDecision, motifRejet |
| **ExtractionQuestionsIa** (`extractions_questions_ia`) | Import d'un fichier de questions par l'IA (US-IA-08). | nomFichier, format, tailleOctets, sha256, cleStockage, statut, modeLecture, tronque, modeleLlm, nbQuestions, nbEcartees, nbTentatives, derniereErreur, dateLancement, dateFin, createdAt, updatedAt |
| **QuestionExtraiteIa** (`questions_extraites_ia`) | Question recopiée d'un document, à accepter ou rejeter. | ordre, enonce, type, options, reponseConnue, explication, niveau, statut, dateDecision, motifRejet, createdAt, updatedAt |

## 11. CLS-09 — Pilotage, rapports & prédiction (F6)

Figure : `classes/Cert_EET_CLS-09_Pilotage_rapports_prediction.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **AlerteDecrochage** (`alertes_decrochage`) | Alerte factuelle (4 critères). | critere, statut, donnees, suggestion, dateCreation, dateTraitement |
| **ActionAlerte** (`actions_alerte`) | Historique des actions sur une alerte. | type, commentaire, dateAction |
| **ScoreRisque** (`scores_risque`) | Score quotidien du modèle LightGBM (probabilité, niveau, raisons). | dateCalcul, probabilite, niveau, raisons, variables, versionModele |
| **Rapport** (`rapports`) | Rapport demandé (session ou institutionnel), produit par la file. | type, format, statut, parametres, nomFichier, cleStockage, tailleOctets, empreinteSha256, nbTentatives, derniereErreur, dateDemande, dateFin |

## 12. CLS-10 — Transverse (F7)

Figure : `classes/Cert_EET_CLS-10_Transverse.png`

| Classe (table) | Rôle | Attributs (colonnes hors clés étrangères) |
|---|---|---|
| **AuditLog** (`audit_logs`) | Journal d'audit, en ajout seul (déclencheur). | userId, action, cible, adresseIp, resultat, detailsAvantApres, horodatage |

## 13. Énumérations

| Énumération | Valeurs |
|---|---|
| Role | APPRENANT, FORMATEUR, ADMINISTRATEUR |
| StatutCompte | EN_ATTENTE_ACTIVATION, ACTIF, DESACTIVE, ANONYMISE |
| NiveauEtudes | SANS_BAC, BAC, PREPA, BTS, LICENCE, MAITRISE, MASTERE, INGENIEUR, DOCTORAT, AUTRE |
| RoleDemande | FORMATEUR, ADMINISTRATEUR |
| StatutDemande | EN_ATTENTE, APPROUVEE, REJETEE |
| StatutFormation | BROUILLON, OUVERTE, FERMEE, ARCHIVEE |
| StatutInscription | EN_COURS, TERMINEE, SUSPENDUE |
| NatureRessource | LIEN, FICHIER |
| StatutQcm | BROUILLON, NON_PUBLIE, PUBLIE |
| AffichageResultats | IMMEDIAT, DIFFERE |
| TypeQuestion | QCM, QCU, VRAI_FAUX, REPONSE_COURTE, ASSOCIATION |
| OrigineQuestion | MANUELLE, IA, IA_MODIFIEE |
| StatutTentative | EN_COURS, SOUMISE, ABANDONNEE_TIMER, NOTEE |
| StatutAtelier | BROUILLON, PUBLIE, ARCHIVE |
| StatutLivrable | SOUMIS, EN_CORRECTION, NOTE |
| StatutCorrection | EN_COURS, TERMINEE |
| StatutCertificat | EN_ATTENTE_GENERATION, EN_GENERATION, ACTIF, REVOQUE, EXPIRE |
| MotifRevocation | FRAUDE, ERREUR_ADMIN, DISCIPLINAIRE, JUDICIAIRE |
| StatutSupport | EN_INDEXATION, INDEXE, ECHEC_INDEXATION |
| StatutGeneration | EN_COURS, TERMINEE, ECHEC |
| StatutSuggestion | PROPOSEE, ACCEPTEE, MODIFIEE, REJETEE |
| CritereAlerte | INACTIVITE, ECHECS_QCM, LIVRABLE_EN_RETARD, SCORE_EN_CHUTE |
| StatutAlerte | OUVERTE, TRAITEE |
| TypeActionAlerte | TRAITEMENT, REOUVERTURE |
| TypeRapport | SESSION, INSTITUTIONNEL |
| FormatRapport | CSV, PDF |
| StatutRapport | EN_ATTENTE, EN_COURS, PRET, ECHEC |
| StatutExtraction *(CHECK)* | EN_ATTENTE, EN_COURS, TERMINEE, ECHEC |
| StatutQuestionExtraite *(CHECK)* | PROPOSEE, ACCEPTEE, MODIFIEE, REJETEE |
| TypeEvenementSurveillance *(CHECK)* | PERSONNES_MULTIPLES, ABSENCE, TELEPHONE, DOCUMENT, CAMERA_MASQUEE, ONGLET_QUITTE, ANALYSE_INDISPONIBLE |
| StatutEvenementSurveillance *(CHECK)* | NOUVEAU, EXAMINE |
| NiveauRisque *(CHECK)* | FAIBLE, MOYEN, ELEVE |
| StatutDemandeAffectation *(CHECK)* | EN_ATTENTE, ACCEPTEE, REFUSEE, ANNULEE |
| StatutProposition *(CHECK)* | EN_ATTENTE, A_MODIFIER, ACCEPTEE, REFUSEE |
| ObjetJetonLien *(CHECK)* | REINITIALISATION_MDP, ACTIVATION_COMPTE |
| NiveauDifficulte *(CHECK)* | DEBUTANT, INTERMEDIAIRE, AVANCE |

## 14. Déclencheurs d'immuabilité

| Table | Règle |
|---|---|
| audit_logs | ni UPDATE ni DELETE |
| tentatives_qcm | une tentative NOTEE ne change plus |
| livrables | un livrable NOTE ne change plus |
| corrections | une correction TERMINEE ne change plus |
| notes_criteres | cohérence avec la grille ; figées quand la correction est TERMINEE |
| certificats | ACTIF immuable sauf → REVOQUE ou EXPIRE ; REVOQUE et EXPIRE définitifs |
| actions_alerte | historique jamais modifié |
| suggestions_questions_ia, questions_extraites_ia | décision définitive |

*Cert_EET — Description du diagramme de classes v3.0 · 18/11/2026*
