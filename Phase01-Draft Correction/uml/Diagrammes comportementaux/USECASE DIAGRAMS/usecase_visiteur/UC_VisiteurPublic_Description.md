# Cert_EET — Description Détaillée des Cas d'Utilisation

## Acteur : **Visiteur Public**

> Document complémentaire au diagramme `Cert_EET_UC_VisiteurPublic.puml`
> Version 1.0 · Mai 2026 · Iyed Omri · PFE ESPRIT

---

### Profil de l'acteur

Le **Visiteur Public** est un acteur **anonyme et non authentifié**. Il s'agit typiquement de :

- Un **recruteur** qui reçoit un CV mentionnant un certificat Cert_EET et veut en vérifier l'authenticité
- Un **employeur** présenté physiquement à un certificat papier et qui scanne le QR code
- Un **partenaire institutionnel** ou une **administration** demandant à vérifier la validité d'une attestation
- Un **organisme de validation des acquis** dans le cadre d'une équivalence

C'est le **seul acteur de Cert_EET qui n'a pas de compte** et n'a pas besoin de s'authentifier. Cette particularité est essentielle : elle traduit la promesse fondamentale d'un certificat numérique vérifiable — toute personne, sans inscription préalable, doit pouvoir vérifier la validité d'un certificat. C'est ce qui distingue Cert_EET des plateformes du marché comme Blackboard ou TalentLMS, dont les certificats PDF ne sont pas vérifiables (cf. lacune G3 du benchmark).

L'accès du Visiteur Public est strictement limité à la **zone publique** de la plateforme. Aucune donnée pédagogique, aucune note, aucun feedback, aucune conversation n'est accessible — uniquement les métadonnées d'authenticité d'un certificat précis.

---

## UC1 — Scanner le QR code d'un certificat

**Objectif métier** : Accéder à la page de vérification d'un certificat de manière simple, rapide et universelle, depuis n'importe quel appareil disposant d'un appareil photo.

**Déclencheur** : Le visiteur dispose d'un certificat (au format PDF imprimé ou affiché à l'écran) et souhaite vérifier son authenticité.

**Déroulement nominal** :
1. Le visiteur ouvre l'application appareil photo de son smartphone (ou un lecteur QR dédié).
2. Il pointe la caméra vers le QR code imprimé sur le certificat.
3. Le QR code est décodé et révèle une URL de vérification, par exemple :
   ```
   https://cert-eet.esprit.tn/verify/a7b3c9d2-4e51-4f8a-9c3b-1d2e3f4a5b6c
   ```
4. L'utilisateur confirme l'ouverture du lien dans son navigateur.
5. Le navigateur charge la page publique de vérification (UC2).

**Caractéristiques techniques du QR code** :
- **Contenu unique** : le QR ne contient **que l'URL de vérification** (avec un identifiant unique UUID), aucune donnée personnelle de l'apprenant.
- **Sans authentification** : l'URL est accessible sans login.
- **Fonctionne hors connexion à Cert_EET** : aucune application spécifique requise — n'importe quel lecteur QR du marché fonctionne.

**Pourquoi cette approche** : la lacune G3 du benchmark a montré que les autres plateformes (Blackboard, TalentLMS, etc.) génèrent des PDF sans aucun mécanisme de vérification publique. Cert_EET adresse cette lacune en s'appuyant sur un standard universel (QR code) et un protocole web public.

**Cas alternatif** : si le visiteur n'a pas de smartphone, il peut **saisir manuellement l'URL** affichée également en clair sur le certificat (sous le QR code), ce qui mène au même résultat.

---

## UC2 — Vérifier l'authenticité d'un certificat

**Objectif métier** : Confirmer ou infirmer qu'un certificat présenté est bien un certificat authentique émis par Cert_EET, non révoqué et non falsifié.

**Déclencheur** : Le visiteur accède à l'URL de vérification (via QR scanné ou saisie manuelle).

**Déroulement nominal** :
1. Le navigateur charge la page publique de vérification.
2. Le système Cert_EET interroge sa base de données avec l'identifiant unique du certificat.
3. Selon le résultat, la page affiche l'un des trois statuts possibles :

### Cas 1 — Certificat **ACTIF et VALIDE** ✅

La page affiche en évidence :
- Un **badge vert** "Certificat authentique"
- Le **nom complet** de l'apprenant
- Le **titre exact** de la formation certifiée
- Le **nom de l'institution émettrice** (ESPRIT Entreprise)
- La **date d'émission**
- Le **formateur signataire**
- L'**empreinte SHA-256** du certificat

Aucune donnée sensible n'est affichée : pas de score détaillé, pas de commentaires de feedback, pas d'historique pédagogique.

### Cas 2 — Certificat **RÉVOQUÉ** ❌

La page affiche :
- Un **badge rouge** "Certificat révoqué — Non valide"
- Le **titre de la formation** (pour confirmer qu'on parle bien du bon document)
- La **date de révocation**
- Le **motif générique** de révocation (par exemple : "Fraude détectée a posteriori") — **sans détails personnels**
- Une mention claire : "Ce certificat ne peut plus être considéré comme valide."

Le contenu détaillé du certificat n'est pas affiché — la révocation neutralise la consultation publique.

### Cas 3 — Certificat **INTROUVABLE** ⚠️

Si l'identifiant ne correspond à aucun certificat en base, la page affiche :
- Un **badge orange** "Certificat introuvable"
- Le message : "Aucun certificat correspondant à cet identifiant n'a été émis par Cert_EET."
- Une explication : "Si vous avez scanné un QR code, le certificat est probablement falsifié."

**Garanties techniques** :
- La page de vérification est servie en **HTTPS uniquement** (TLS) — l'identité du serveur cert-eet.esprit.tn est elle-même certifiée.
- Le **hash SHA-256 affiché** correspond exactement au hash du contenu du PDF original. Si le visiteur dispose du PDF, il peut recalculer le hash et le comparer pour confirmer que le fichier PDF n'a pas été altéré.
- Les requêtes de vérification sont **journalisées** côté serveur (date, IP, identifiant consulté) — ces logs sont visibles par l'Administrateur (UC10 de l'Administrateur) mais **pas exposés publiquement**.

**Aucune donnée sensible exposée** : le visiteur n'apprend rien sur l'apprenant au-delà du strict nécessaire à l'authentification — pas d'email, pas d'adresse, pas de scores, pas de notes, pas de formateur autre que le signataire institutionnel.

**Cas particulier — Limitation de débit** : pour éviter qu'un attaquant ne tente de deviner des identifiants par force brute, la page est protégée par un mécanisme de **rate limiting** (nombre maximal de vérifications par IP par minute). Au-delà du seuil, une vérification CAPTCHA peut être demandée.

---

## UC3 — Consulter les métadonnées publiques du certificat

**Objectif métier** : Consulter en détail les informations publiques associées à un certificat authentifié, pour validation contextuelle (correspondance avec le CV présenté, par exemple).

**Déclencheur** : Le visiteur est sur la page de vérification (UC2) d'un certificat **actif et valide**, et souhaite voir plus de détails.

**Déroulement nominal** :
1. La page de vérification affiche par défaut les informations essentielles (UC2).
2. Le visiteur peut cliquer sur **"Voir plus de détails"** pour révéler des métadonnées complémentaires (toutes publiques) :
   - **Durée totale** de la formation (en heures de formation)
   - **Compétences validées** (liste des skills certifiés — issus du référentiel de la formation)
   - **Date d'émission précise** (avec horodatage)
   - **Date d'expiration** (si applicable — certaines certifications ont une durée de validité limitée)
   - **Lien vers la page institutionnelle de la formation** (description publique du cursus, prérequis, objectifs)
   - **Logo de l'institution** et signature numérique visuelle
3. Le visiteur peut **télécharger un PDF certifié de la fiche de vérification** (différent du certificat original) pour archiver la preuve de sa propre vérification.

**Ce qui reste strictement caché** :
- Le **score détaillé** obtenu (sauf si une "mention" générique a été configurée publique par l'institution)
- Les **réponses** données aux QCM
- Les **livrables** soumis et leurs corrections
- Les **commentaires** du formateur
- L'**email personnel** ou les coordonnées de l'apprenant
- Toute donnée d'autres apprenants ou formations

**Principe directeur** : "**vérification, pas exposition**". Le rôle du Visiteur Public est de **confirmer l'authenticité** d'un document qu'il a sous les yeux, pas de **découvrir des informations** sur la personne titulaire du certificat. Toute donnée non strictement nécessaire à la vérification reste privée.

**Conformité RGPD** : ce mode de divulgation minimale est aligné sur le principe de **minimisation des données** du RGPD. Même si Cert_EET n'est pas hébergé en Europe, ce niveau de respect de la vie privée est une garantie institutionnelle volontaire d'ESPRIT.

---

## Synthèse — Ce que le Visiteur Public **NE PEUT PAS** faire

Cette section est particulièrement importante car elle définit le **périmètre de sécurité publique** de la plateforme :

| Action | Raison |
|---|---|
| Créer un compte automatiquement | Réservé à l'Administrateur (UC1 Admin) |
| Se connecter avec un compte existant | Le Visiteur Public est par définition non authentifié — s'il a un compte, il devient Apprenant/Formateur/Admin |
| Lister les certificats émis | Aucune route publique de listing — la vérification se fait certificat par certificat |
| Rechercher un certificat par nom d'apprenant | Pas de moteur de recherche public — il faut posséder l'UUID exact |
| Voir les scores détaillés ou commentaires | Données strictement privées |
| Accéder à un QCM, atelier, ou cours | Réservé aux Apprenants inscrits |
| Contacter directement l'apprenant via la plateforme | Pas de canal de communication public |
| Consulter les journaux d'audit | Réservé à l'Administrateur |
| Télécharger le PDF original du certificat | Réservé au titulaire (Apprenant) |

---

## Pourquoi cet acteur a-t-il sa place dans le modèle ?

On pourrait penser qu'un "simple visiteur d'une page web" n'est pas digne d'être modélisé comme acteur dans un diagramme UML. C'est une erreur classique. Voici pourquoi le Visiteur Public **doit** être modélisé :

1. **C'est une exigence fonctionnelle explicite** : le besoin F3 du cahier des charges impose une URL de vérification publique. Sans cette URL accessible sans authentification, la certification "vérifiable" n'existe pas.

2. **C'est la justification de tout l'effort cryptographique** : le SHA-256, le QR code, l'URL publique — toutes ces décisions techniques ont un seul objectif final : satisfaire l'usage du Visiteur Public. Si on n'avait modélisé que les rôles authentifiés, on n'aurait pas justifié ces choix.

3. **C'est un argument fort vis-à-vis du benchmark** : la lacune G3 démontre que les plateformes concurrentes (Blackboard, TalentLMS) génèrent des PDF non vérifiables. Modéliser explicitement le Visiteur Public souligne ce que ces plateformes **ne savent pas faire**.

4. **C'est une question de sécurité** : tracer explicitement ce qu'un acteur **non authentifié** peut faire (et surtout ne pas faire) est une démarche de conception sécurisée. Sans cet acteur dans le diagramme, le risque est de "laisser des portes ouvertes" sans s'en rendre compte.

5. **C'est conforme à UML 2.5** : un acteur est défini comme un rôle joué par une entité externe interagissant avec le système. Le Visiteur Public est exactement cela.

---

*Fin du document — UC Visiteur Public · Cert_EET v1.0*