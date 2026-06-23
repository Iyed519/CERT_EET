# Cert_EET — Description Détaillée des Cas d'Utilisation

## Acteur : **Apprenant**

> Document complémentaire au diagramme `Cert_EET_UC_Apprenant.puml`
> Version 1.0 · Mai 2026 · Iyed Omri · PFE ESPRIT

---

### Profil de l'acteur

L'**Apprenant** est l'utilisateur final principal de Cert_EET. Il s'agit d'un étudiant, d'un professionnel en formation continue ou d'un partenaire entreprise inscrit à un ou plusieurs cycles de formation certifiante chez ESPRIT Entreprise. Son objectif est de progresser dans son parcours, valider ses acquis par des évaluations, et obtenir des certificats numériques vérifiables.

Il interagit avec la plateforme à la fois en mode **autonome** (QCM, livrables, chatbot) et en mode **consultatif** (feedback formateur, certificats, historique).

---

## UC1 — Consulter ses formations

**Objectif métier** : Visualiser la liste complète des formations auxquelles l'apprenant est inscrit, avec leur statut de progression.

**Déclencheur** : Connexion à la plateforme et accès à l'espace personnel.

**Déroulement nominal** :
1. L'apprenant accède à la page d'accueil de son espace personnel.
2. La plateforme affiche la liste de ses formations sous forme de cartes.
3. Chaque carte contient : titre de la formation, formateur responsable, taux d'avancement (%), prochaine échéance, statut (En cours / Terminée / Suspendue).
4. L'apprenant peut filtrer par statut ou trier par date d'inscription.

**Données affichées** :
- Nom de la formation
- Nom du formateur
- Date d'inscription et date d'échéance
- Pourcentage d'avancement (calculé sur les QCM passés + ateliers soumis)
- Nombre de certificats obtenus / restant à obtenir

**Cas alternatif** : Si l'apprenant n'est inscrit à aucune formation, un message d'invitation à contacter l'administration s'affiche.

---

## UC2 — Passer une évaluation QCM

**Objectif métier** : Réaliser un test QCM certifiant dans un environnement sécurisé et chronométré pour valider ses acquis sur un module donné.

**Déclencheur** : L'apprenant clique sur un QCM ouvert dans la fenêtre temporelle définie par le formateur.

**Déroulement nominal** :
1. L'apprenant lit l'écran d'introduction : durée, nombre de questions, nombre de tentatives restantes, règles d'évaluation.
2. Il clique sur **"Démarrer"** — le serveur enregistre l'heure de début et démarre la minuterie côté serveur.
3. Les questions s'affichent une par une (ou en liste, selon configuration du formateur), avec un ordre **randomisé côté serveur**.
4. Pour chaque question, l'apprenant sélectionne sa/ses réponse(s). Le système autosauvegarde toutes les 10 secondes pour éviter toute perte en cas de coupure.
5. Une barre de progression affiche le temps restant. À 5 minutes, une alerte visuelle s'affiche.
6. L'apprenant peut naviguer librement entre les questions (avant/arrière) tant que le temps n'est pas écoulé.
7. Il clique sur **"Soumettre"** ou attend l'expiration du timer (auto-soumission).
8. Le serveur calcule le score, applique la pondération définie par le formateur, et affiche le résultat selon la configuration (immédiat ou différé).

**Règles métier importantes** :
- Toute la logique d'évaluation est **côté serveur** : le navigateur ne reçoit jamais les bonnes réponses (anti-tricherie).
- Si l'apprenant ferme l'onglet ou perd la connexion, sa tentative continue côté serveur — il peut rouvrir tant que le timer n'est pas écoulé.
- Une **deuxième session simultanée** (autre appareil) est automatiquement bloquée.

**Cas alternatifs** :
- *Tentatives épuisées* → Le bouton "Démarrer" est désactivé, un message indique le nombre de tentatives utilisées.
- *Hors fenêtre temporelle* → Le QCM est visible mais inaccessible (verrouillé par date).
- *Délai entre tentatives non respecté* → Affichage du temps restant avant la prochaine tentative possible.

---

## UC3 — Consulter l'historique de ses tentatives

**Objectif métier** : Permettre à l'apprenant de revoir ses tentatives passées pour identifier ses lacunes et préparer une nouvelle tentative ou une révision.

**Déclencheur** : L'apprenant accède à la section "Historique" depuis son tableau de bord ou la fiche d'une formation.

**Déroulement nominal** :
1. La plateforme affiche un tableau chronologique de toutes les tentatives QCM passées.
2. Chaque ligne contient : titre du QCM, date de tentative, durée effective, score obtenu (X/Y), statut (Réussi / Échoué).
3. L'apprenant peut cliquer sur une tentative pour voir le détail question par question.
4. Le détail affiche : sa réponse, la bonne réponse (si la fenêtre est fermée), explication éventuelle du formateur.

**Restrictions** :
- Les bonnes réponses ne sont visibles **qu'après la fermeture de la fenêtre d'examen** (configuration formateur), pour éviter la fuite vers les apprenants n'ayant pas encore passé l'épreuve.
- L'apprenant ne peut pas modifier ou supprimer une tentative — l'historique est immuable pour des raisons d'audit.

**Données disponibles à l'export** : aucune côté apprenant (l'export est réservé aux formateurs et administrateurs).

---

## UC4 — Soumettre un livrable d'atelier

**Objectif métier** : Déposer le résultat d'un travail pratique (code, document, présentation, lien…) demandé par le formateur dans le cadre d'un atelier noté.

**Déclencheur** : L'apprenant consulte un atelier ouvert et clique sur **"Soumettre un livrable"**.

**Déroulement nominal** :
1. L'apprenant lit l'énoncé complet de l'atelier : objectif, consignes, ressources fournies, grille de notation visible.
2. Il prépare son travail hors plateforme (code dans son IDE, document Word, etc.).
3. Il clique sur "Soumettre" et accède au formulaire de dépôt.
4. Selon la configuration de l'atelier, il peut joindre :
   - Un ou plusieurs **fichiers** (PDF, ZIP, images, code source — taille max configurée)
   - Un **texte de commentaire libre** (max 2000 caractères)
   - Un ou plusieurs **liens externes** (GitHub, Drive, Figma, déploiement)
5. Il valide la soumission. Le système calcule un hash du livrable pour traçabilité, horodate la soumission, et passe le statut à **"Soumis — En attente de correction"**.
6. Une notification est envoyée automatiquement au formateur (cf. UC du formateur).

**Règles métier** :
- Une soumission après la date limite est **bloquée** (sauf si le formateur a activé une tolérance).
- Tant que la date limite n'est pas dépassée, l'apprenant peut **remplacer sa soumission** — chaque remplacement est tracé, seule la dernière version est corrigée.
- Une fois la correction commencée par le formateur, la soumission est **verrouillée** (plus de remplacement possible).

**Cas alternatifs** :
- *Fichier trop volumineux* → Message d'erreur avec la limite autorisée.
- *Format non autorisé* → Liste des extensions acceptées affichée.
- *Date limite dépassée* → Bouton de soumission désactivé, message indiquant la date de clôture.

---

## UC5 — Consulter le feedback du formateur

**Objectif métier** : Recevoir et comprendre le retour structuré du formateur sur un livrable corrigé, identifier ses points forts et axes d'amélioration.

**Déclencheur** : Le formateur a terminé la correction et le statut de la soumission passe à **"Noté — Feedback envoyé"**. L'apprenant reçoit une notification.

**Déroulement nominal** :
1. L'apprenant clique sur la notification ou accède à la liste des ateliers depuis son tableau de bord.
2. L'atelier corrigé est marqué d'un badge **"Nouveau feedback"**.
3. Il ouvre la fiche détaillée et consulte :
   - La **note globale** (ex : 16/20) avec le détail par critère de la grille
   - Pour chaque critère : note obtenue, note maximale, commentaire textuel du formateur
   - Un **commentaire général** libre du formateur
   - D'éventuels fichiers annotés joints (PDF avec annotations, screenshots de code commenté)
4. L'apprenant peut télécharger le rapport de correction au format PDF.

**Caractéristique importante** : Le feedback est **archivé de manière permanente** dans le dossier de l'apprenant. Il reste consultable même après la fin de la formation, dans la perspective d'un futur certificat ou d'une vérification ultérieure.

**Pas d'interaction conversationnelle** : l'apprenant ne peut pas répondre directement au feedback — pour toute question, il doit utiliser le chatbot IA (UC8) ou les canaux de communication externes (Teams).

---

## UC6 — Consulter ses certificats

**Objectif métier** : Accéder à la liste des certificats numériques obtenus pour pouvoir les afficher, les partager ou les fournir comme preuve à un employeur.

**Déclencheur** : L'apprenant accède à la section "Mes certificats" depuis son tableau de bord.

**Déroulement nominal** :
1. La plateforme affiche la liste de tous les certificats émis au nom de l'apprenant.
2. Chaque certificat est représenté par une carte contenant :
   - Le **titre de la formation certifiée**
   - La **date d'émission**
   - Le **nom du formateur responsable**
   - Le **score final** obtenu (si applicable)
   - Le **statut** : Actif / Révoqué (en cas de fraude détectée a posteriori)
   - L'**URL publique de vérification** (copiable)
   - Un aperçu visuel du certificat
3. L'apprenant peut cliquer sur un certificat pour voir le détail complet.

**Affichage privé vs public** :
- Vue apprenant : toutes les métadonnées personnelles (score détaillé, commentaires formateur).
- Vue publique (UC du Visiteur Public) : uniquement les métadonnées d'authentification (nom, titre, date, hash).

---

## UC7 — Télécharger un certificat (PDF)

**Objectif métier** : Obtenir une copie locale du certificat au format PDF, signée cryptographiquement, pour archivage personnel ou transmission.

**Déclencheur** : L'apprenant clique sur le bouton **"Télécharger"** sur la fiche d'un certificat.

**Déroulement nominal** :
1. L'apprenant clique sur "Télécharger PDF".
2. Le système récupère le PDF généré (qui a été créé en arrière-plan lors de l'émission du certificat — cf. note technique synchrone/asynchrone, file Bull).
3. Le PDF contient :
   - Le **logo institutionnel** ESPRIT
   - Le **nom complet** de l'apprenant
   - Le **titre exact** de la formation certifiée
   - La **date d'émission** et la **date de validité** (le cas échéant)
   - Le **score** ou la mention obtenue
   - Le **nom et la signature** du formateur responsable
   - Un **QR code** redirigeant vers la page publique de vérification
   - L'**empreinte SHA-256** affichée en pied de page (preuve d'intégrité)
   - Un **identifiant unique** du certificat (UUID)
4. Le fichier est téléchargé sur l'appareil de l'apprenant.

**Garanties techniques** :
- Le SHA-256 affiché correspond au hash du contenu du PDF — toute modification ultérieure du fichier invaliderait la vérification publique.
- Le QR code n'expose **aucune donnée personnelle** dans son contenu : il ne contient que l'URL de la page de vérification.

**Cas d'usage typique** : l'apprenant joint le PDF à son CV, ou un recruteur scanne le QR code pour vérifier son authenticité.

---

## UC8 — Dialoguer avec le chatbot IA

**Objectif métier** : Bénéficier d'un assistant intelligent contextualisé à sa progression personnelle pour obtenir de l'aide pédagogique, des explications, ou des suggestions de révision.

**Déclencheur** : L'apprenant ouvre l'interface conversationnelle accessible en permanence depuis son tableau de bord (icône flottante ou panneau latéral).

**Déroulement nominal** :
1. L'apprenant tape une question en langage naturel dans l'interface de chat.
2. La plateforme construit dynamiquement le **contexte personnalisé** à envoyer au LLM :
   - Profil de l'apprenant (formations en cours)
   - Scores des derniers QCM
   - État d'avancement des ateliers
   - Lacunes identifiées (questions échouées récemment, ateliers en retard)
3. Cette charge contextuelle + la question sont envoyées à l'API LLM (GPT-4o, Claude ou Mistral — interchangeables grâce à la couche d'abstraction).
4. La réponse du LLM s'affiche progressivement en streaming (via Server-Sent Events).
5. L'apprenant peut poursuivre la conversation — l'historique du fil reste cohérent.

**Exemples concrets d'usage** :
- *"Je n'ai pas compris la question 7 de mon dernier QCM, peux-tu m'expliquer ?"* → Le chatbot retrouve la question dans le contexte injecté et l'explique.
- *"Sur quoi devrais-je réviser avant mon prochain QCM ?"* → Le chatbot analyse les lacunes des tentatives précédentes et propose un plan ciblé.
- *"Comment soumettre mon livrable de l'atelier 3 ?"* → Réponse procédurale guidée.
- *"Je bloque sur la partie authentification de l'atelier, quelle piste me conseilles-tu ?"* → Conseil pédagogique sans donner la solution complète.

**Limites volontaires** :
- Le chatbot **ne donne pas les bonnes réponses** aux QCM ouverts en cours (filtre côté serveur).
- Il **ne corrige pas les livrables** à la place du formateur.
- Il signale les sujets sensibles ou hors périmètre et redirige vers le formateur humain.

**Caractère différenciant** : aucune des 6 plateformes étudiées dans le benchmark (Moodle, TalentLMS, 360Learning, Open edX, Docebo, Canvas) n'offre cette fonctionnalité en production en avril 2026. C'est l'argument différenciant principal de Cert_EET.

---

## UC9 — Consulter son tableau de bord personnel

**Objectif métier** : Disposer d'une vue d'ensemble synthétique de sa progression globale et de ses actions à entreprendre.

**Déclencheur** : L'apprenant se connecte à la plateforme (page d'accueil par défaut).

**Déroulement nominal** :
1. Le tableau de bord s'affiche avec plusieurs blocs informatifs :
   - **Indicateurs clés** : nombre de formations en cours, certificats obtenus, score moyen global
   - **Échéances proches** : QCM à passer, livrables à soumettre dans les 7 jours
   - **Activité récente** : derniers feedbacks reçus, derniers certificats émis
   - **Graphique de progression** : évolution de la moyenne sur les 6 derniers mois
   - **Notifications non lues** : alertes formateur, nouveaux feedbacks, certificats émis
2. L'apprenant peut cliquer sur n'importe quel élément pour accéder au détail.

**Personnalisation** :
- L'apprenant peut masquer/réorganiser certains blocs selon ses préférences.
- Affichage responsive (desktop + mobile, conformément à NF7 du cahier des charges).

**Pas d'export côté apprenant** : la fonctionnalité d'export PDF/CSV est réservée aux formateurs et administrateurs (F6 du CdC).

---

## Synthèse — Ce que l'apprenant **NE PEUT PAS** faire

Pour clarifier le périmètre de l'acteur Apprenant, voici les actions explicitement hors de ses droits :

| Action | Raison |
|---|---|
| Modifier ou supprimer une tentative QCM | Intégrité de l'historique d'évaluation |
| Voir les questions d'un QCM en dehors de la fenêtre d'examen | Anti-fraude |
| Voir les notes d'autres apprenants | Confidentialité |
| Corriger un livrable | Réservé au Formateur |
| Émettre/révoquer un certificat | Réservé à l'Administrateur |
| Exporter des rapports analytiques | Réservé aux Formateurs et Administrateurs |
| Accéder aux journaux d'audit | Réservé à l'Administrateur |

---

*Fin du document — UC Apprenant · Cert_EET v1.0*