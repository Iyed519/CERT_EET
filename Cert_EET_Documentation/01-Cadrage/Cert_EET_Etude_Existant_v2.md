# ÉTUDE DE L'EXISTANT
## Plateformes de Certification et de Formations Digitales

**Esprit Entreprise** — Projet de Fin d'Études — Ingénierie Logicielle  
**Projet :** Cert_EET | **Phase :** 2 | **Version :** 1.1 | **Date :** Mai 2026  
**Étudiant :** Iyed Omri

---

## 1. Contexte du Projet

Esprit Entreprise, entité de formation continue rattachée au groupe Esprit, ambitionne de digitaliser ses cycles de formation par une infrastructure de certification numérique moderne. Ce projet s'inscrit dans trois tendances sectorielles observées en 2025-2026 :

- La démocratisation des LLM dans les outils éducatifs, créant une nouvelle catégorie de plateformes dites « AI-native »
- La montée en puissance des micro-certifications et badges numériques dans les processus de recrutement
- L'émergence d'exigences sur la souveraineté des données apprenants dans les établissements tunisiens

La plateforme Cert_EET doit couvrir quatre besoins fondamentaux : les évaluations QCM anti-fraude, les ateliers pratiques notés par formateur, la génération de certificats vérifiables, et un chatbot IA contextuel pour accompagner l'apprenant tout au long de sa progression.

---

## 2. Outils Actuellement Utilisés chez Esprit

Esprit utilise partiellement trois outils numériques dans son dispositif de formation. Aucun n'a été déployé de manière complète ou unifiée — leur usage est fragmenté selon les formateurs, les sessions et les besoins ponctuels.

### 2.1 Blackboard

Blackboard est la plateforme LMS institutionnelle du groupe Esprit. Elle est utilisée principalement pour la diffusion de contenus pédagogiques (supports de cours, vidéos) et la gestion des sessions académiques officielles.

**Usage observé chez Esprit Entreprise :**
- Dépôt et consultation de supports de cours
- Quelques évaluations QCM de base, sans configuration avancée d'anti-fraude
- Suivi de présence et gestion administrative des groupes

**Limites dans le contexte Cert_EET :**
- Aucun workflow d'atelier pratique avec grille de notation configurable
- Certification générique sans vérification cryptographique ni QR code
- Pas d'intégration IA côté apprenant — aucun chatbot ni agent conversationnel
- Interface datée, adoption inégale selon les formateurs
- Hébergement SaaS Anthology (USA) : aucune maîtrise de la souveraineté des données

---

### 2.2 Microsoft Teams

Microsoft Teams est utilisé pour les sessions de formation à distance (visioconférence) et les échanges informels entre formateurs et apprenants. Son usage est spontané et non structuré pédagogiquement.

**Usage observé chez Esprit Entreprise :**
- Sessions live (cours à distance, corrections, Q&A)
- Partage de fichiers et de livrables via les canaux et le chat
- Communications ad hoc formateur ↔ apprenant

**Limites dans le contexte Cert_EET :**
- Aucune traçabilité pédagogique : les échanges ne sont pas enregistrés dans un système de suivi
- Les livrables partagés dans Teams ne sont pas reliés à une grille d'évaluation
- Aucun mécanisme de certification, de scoring ou de feedback structuré
- Usage conditionné à une licence Microsoft — dépendance externe non maîtrisée

---

### 2.3 Moodle (usage ponctuel)

Moodle est utilisé de manière occasionnelle par certains formateurs, de façon autonome et non coordonnée avec le reste du dispositif. Son déploiement n'est pas institutionnalisé chez Esprit Entreprise.

**Usage observé :**
- Création de QCM pour des modules spécifiques (initiative individuelle du formateur)
- Dépôt de ressources complémentaires

**Limites dans le contexte Cert_EET :**
- Aucun chatbot IA natif — les plugins tiers sont expérimentaux et non contextualisés
- Ateliers pratiques rudimentaires, sans workflow formateur ni grille de compétences
- Certificats PDF simples, sans signature cryptographique
- Pas de synchronisation avec Blackboard ni Teams : silo de données supplémentaire

---

## 3. Impact de l'Usage Fragmenté sur les Formations

L'utilisation partielle et non coordonnée de trois outils distincts génère des dysfonctionnements directs sur la qualité du dispositif de formation :

| Problème observé | Cause (outil impliqué) | Impact sur Cert_EET |
|---|---|---|
| Parcours apprenant non unifié | Cours sur Blackboard, sessions sur Teams, QCM sur Moodle → 3 environnements distincts | Impossible de suivre la progression complète d'un apprenant depuis un seul tableau de bord |
| Données cloisonnées (silos) | Aucune synchronisation entre les trois outils — les scores Moodle ne remontent pas dans Blackboard | Pas de vue consolidée formateur / administrateur sur la performance des apprenants |
| Évaluation des livrables non structurée | Livrables envoyés par Teams ou e-mail, notés manuellement sans grille | Notation hétérogène, non archivée, impossible à auditer |
| Certification sans valeur vérifiable | Blackboard génère des attestations PDF sans signature ni URL de vérification | Les certificats ne sont pas opposables sur le marché de l'emploi |
| Dépendance à des tiers non maîtrisés | Blackboard (Anthology USA), Microsoft Teams (Azure) — données hébergées hors Tunisie | Non-conformité avec les exigences de souveraineté institutionnelle locale |


---

## 4. Solutions Existantes Étudiées (Benchmark)

Au-delà des outils utilisés en interne, six plateformes LMS/LXP du marché ont été analysées sur 13 critères couvrant les dimensions fonctionnelle (50%), technique (25%) et stratégique (25%). Les données proviennent de la documentation officielle, des retours publiés (G2, Capterra, Gartner) et de tests ciblés conduits entre janvier et avril 2026.

| Plateforme | Type | Score /100 | Verdict | Limite principale |
|---|---|---|---|---|
| **Moodle 4.x** | LMS Open Source | 52,6 | Partiel | Ateliers rudimentaires, aucun chatbot IA |
| **TalentLMS** | SaaS Corporate | 36,4 | Inadapté | Aucun atelier, aucune IA, aucune souveraineté |
| **360Learning** | LXP Collaboratif | 41,3 | Hors Scope | Tarification inadaptée, QCM limité |
| **Open edX (Redwood)** | MOOC Open Source | 57,5 | Trop complexe | Déploiement Kubernetes, équipe DevOps requise |
| **Docebo Learn** | LMS Enterprise IA | 52,8 | Hors Scope | Coût 1 500–5 000 USD/mois, chatbot en bêta |
| **Canvas LMS** | LMS Académique | 51,9 | Complexe | IA absente côté apprenant, certification basique |

---

## 5. Lacunes Identifiées

L'analyse combinée des outils internes (Blackboard, Teams, Moodle) et des plateformes du marché révèle des lacunes structurelles communes. Aucune solution existante — qu'elle soit déjà en usage chez Esprit ou disponible sur le marché — ne couvre l'ensemble des exigences de Cert_EET.

| Réf. | Lacune | Constat | Criticité |
|---|---|---|---|
| **G1** | Chatbot IA contextualisé à la progression | Absent sur les 6 plateformes du marché et sur Blackboard/Teams/Moodle. Aucune intégration stable côté apprenant. | 🔴 CRITIQUE |
| **G2** | Ateliers pratiques avec workflow formateur | Livrables gérés manuellement via Teams/email chez Esprit. Absent ou rudimentaire sur 5/6 plateformes du marché. | 🔴 CRITIQUE |
| **G3** | Certification numérique vérifiable (QR + SHA-256) | Blackboard génère des PDF non vérifiables. Seul Open edX via Open Badges, mais complexité opérationnelle rédhibitoire. | 🟠 MAJEUR |
| **G4** | Vue consolidée et suivi unifié de l'apprenant | 3 outils cloisonnés chez Esprit (Blackboard, Teams, Moodle) : aucune donnée consolidée, parcours fragmenté. | 🟠 MAJEUR |
| **G5** | Souveraineté des données (hébergement local) | Blackboard (Anthology USA) et Teams (Microsoft Azure) : données hors Tunisie. Non-conformité institutionnelle. | 🟡 SIGNIFICATIF |

---

## 6. Diagnostic

### Points forts de l'existant

- Blackboard assure une base administrative et de diffusion de contenus fonctionnelle
- Teams facilite la communication synchrone et le partage informel de ressources
- Moodle, utilisé ponctuellement, prouve la capacité de certains formateurs à adopter un outil structuré d'évaluation
- L'écosystème existant témoigne d'une culture numérique partiellement installée chez les formateurs Esprit

### Points faibles structurels

- Trois outils non intégrés créent une expérience apprenant fragmentée et non traçable de bout en bout
- Aucun des outils en usage ne supporte les quatre fonctionnalités P0 de Cert_EET (QCM certifiant, ateliers notés, certification vérifiable, chatbot IA)
- La dépendance à des SaaS étrangers (Anthology, Microsoft) est incompatible avec les exigences de souveraineté des données
- L'absence d'un système unifié empêche toute analyse de la performance globale des formations

L'analyse de l'existant interne confirme et amplifie les conclusions du benchmark : ni les outils actuellement utilisés chez Esprit Entreprise, ni les plateformes disponibles sur le marché ne permettent de répondre aux exigences de Cert_EET sans un effort de développement équivalent à une solution sur mesure. Le développement d'une plateforme full-stack avec intégration LLM native constitue la seule voie techniquement viable, institutionnellement cohérente et pédagogiquement justifiée.
