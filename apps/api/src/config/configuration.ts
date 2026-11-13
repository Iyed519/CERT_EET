/**
 * Fabrique de configuration typée.
 *
 * Centralise la lecture de process.env (déjà validé par Joi au chargement du
 * ConfigModule) et expose un objet de configuration fortement typé. Aucun
 * module métier ne lit process.env directement : ils passent par ConfigService
 * (Règle 3 / PKG-02 — tout dépend de config, config ne dépend de rien).
 */
export interface AppConfig {
  nodeEnv: 'development' | 'recette' | 'production' | 'test';
  port: number;
  corsOrigin: string;
  apiPrefix: string;
  databaseUrl?: string;
  redisUrl?: string;
}
export interface JwtConfig {
  privateKeyPath: string;
  publicKeyPath: string;
  /** En secondes, pas en minutes : @nestjs/jwt attend un nombre de
   *  secondes pour expiresIn quand ce n'est pas une chaîne au format
   *  spécifique de la lib "ms" (ex: '15m'). Un nombre lève toute
   *  ambiguïté de type ET de format. ADR-08 : 15 minutes = 900 s. */
  accessTokenExpiresIn: number;
  /** ADR-08 : 7 jours = 604800 s. */
  refreshTokenExpiresIn: number;
}
/**
 * Configuration de connexion Redis (US-AUTH-03).
 * Redis devient load-bearing à partir de cette story : il porte la denylist
 * des jetons révoqués (consultée à chaque refresh). On lit host + port
 * séparément (et non une URL) car le conteneur api reçoit REDIS_HOST=redis /
 * REDIS_PORT=6379 via docker-compose (réseau interne Docker).
 */
export interface RedisConfig {
  host: string;
  port: number;
}
/**
 * Configuration email / SMTP (US-CPT-05).
 * On lit host + port séparément (comme Redis) car le conteneur api reçoit
 * SMTP_HOST=mailhog / SMTP_PORT=1025 via docker-compose (réseau interne).
 * `from` = expéditeur affiché des emails ; `appBaseUrl` = base du FRONTEND,
 * utilisée pour construire le lien de vérification envoyé à l'inscrit.
 */
export interface MailConfig {
  host: string;
  port: number;
  from: string;
  appBaseUrl: string;
}
/**
 * Configuration OAuth Google (US-AUTH-14).
 * clientId / clientSecret viennent de la console Google (secrets, jamais
 * committés) ; callbackUrl = URL de redirection enregistrée chez Google, sur
 * l'origine Nginx (https://localhost) pour que le cookie de session soit
 * utilisable par le frontend après le retour de Google.
 */
export interface OauthGoogleConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
/**
 * Configuration OAuth GitHub (US-AUTH-14 — 2e fournisseur).
 * Même forme que Google : clientId / clientSecret viennent de l'OAuth App
 * GitHub (secrets, jamais committés) ; callbackUrl = URL de redirection
 * enregistrée chez GitHub, sur l'origine Nginx (https://localhost) pour que le
 * cookie de session soit utilisable par le frontend après le retour de GitHub.
 */
export interface OauthGithubConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
/**
 * Minuterie des tentatives de QCM (US-QCM-07).
 * Le balayage clôture toutes les `intervalleSecondes` les tentatives EN_COURS
 * échues depuis plus de `delaiGraceSecondes` (D2, D11). Désactivable par
 * MINUTERIE_BALAYAGE_ACTIF=false ; toujours désactivé en test (NODE_ENV=test).
 */
export interface MinuterieConfig {
  balayageActif: boolean;
  intervalleSecondes: number;
  delaiGraceSecondes: number;
}
/**
 * Stockage objet S3 / MinIO (US-ATEL-04, ADR-07) : livrables d'ateliers.
 * `forcePathStyle` : MinIO sert les buckets sous le chemin
 * (http://minio:9000/<bucket>/<clé>), pas en sous-domaine.
 */
/** US-CERT-05 — protection de la vérification publique. */
export interface VerificationConfig {
  limiteParMinute: number;
}

/**
 * US-AUTH-13 — Limites de débit par IP des routes sensibles (garde
 * `LimiteRequetesGuard`), indexées par le nom de la limite. Une limite absente
 * ici garde la valeur posée sur la route. Réglables par LIMITE_<NOM> (par ex.
 * LIMITE_CONNEXION) : une salle de cours derrière une seule adresse publique
 * peut demander des valeurs plus hautes.
 */
export type LimitesConfig = Record<string, number>;

/**
 * US-CPT-02 — Envoi asynchrone des emails d'activation des comptes importés
 * (file BullMQ, worker dans le processus de l'api ; COMPTES_WORKER=off le coupe).
 */
/**
 * US-QCM-12 — Surveillance webcam par captures. `active` : interrupteur de la
 * plateforme (SURVEILLANCE_WEBCAM=off la coupe partout, par exemple tant que
 * la décision sur la protection des données n'est pas prise) ; chaque QCM
 * reste en plus soumis au choix du formateur (désactivé par défaut).
 */
export interface SurveillanceConfig {
  active: boolean;
  intervalleSecondes: number;
  tailleMaxOctets: number;
  conservationJours: number;
  balayageActif: boolean;
  balayageMinutes: number;
}

export interface ActivationsConfig {
  workerActif: boolean;
  tentatives: number;
  backoffMs: number;
}

/** Valeurs par défaut (requêtes par fenêtre de la route) et variable associée. */
export const LIMITES_PAR_DEFAUT: Record<string, { variable: string; valeur: number; relacheeEnTest: boolean }> = {
  connexion: { variable: 'LIMITE_CONNEXION', valeur: 30, relacheeEnTest: true },
  mfa: { variable: 'LIMITE_MFA', valeur: 30, relacheeEnTest: true },
  rafraichissement: { variable: 'LIMITE_RAFRAICHISSEMENT', valeur: 120, relacheeEnTest: true },
  inscription: { variable: 'LIMITE_INSCRIPTION', valeur: 30, relacheeEnTest: true },
  'verification-email': { variable: 'LIMITE_VERIFICATION_EMAIL', valeur: 30, relacheeEnTest: true },
  'mdp-oublie': { variable: 'LIMITE_MDP_OUBLIE', valeur: 5, relacheeEnTest: false },
  'mdp-reinitialisation': { variable: 'LIMITE_MDP_REINITIALISATION', valeur: 10, relacheeEnTest: false },
  activation: { variable: 'LIMITE_ACTIVATION', valeur: 10, relacheeEnTest: false },
};

/**
 * Lit les limites. En test (NODE_ENV=test), les limites des routes que toutes
 * les suites e2e appellent sans cesse depuis 127.0.0.1 (connexion, refresh…)
 * sont relâchées SAUF si la variable est posée : la suite qui prouve le 429
 * pose la sienne avant de démarrer l'application.
 */
export function lireLimites(env: NodeJS.ProcessEnv): LimitesConfig {
  const limites: LimitesConfig = {};
  for (const [nom, defaut] of Object.entries(LIMITES_PAR_DEFAUT)) {
    const brut = env[defaut.variable];
    if (brut !== undefined && brut !== '') {
      limites[nom] = parseInt(brut, 10);
    } else if (env.NODE_ENV === 'test' && defaut.relacheeEnTest) {
      limites[nom] = 1_000_000;
    } else {
      limites[nom] = defaut.valeur;
    }
  }
  return limites;
}

/**
 * US-SUIVI-02 — Alertes de décrochage : balayage planifié toutes les
 * `intervalleMinutes` (désactivable par ALERTES_BALAYAGE_ACTIF=false ;
 * toujours désactivé en test) ; email aux formateurs affectés si `email`.
 */
export interface AlertesConfig {
  balayageActif: boolean;
  intervalleMinutes: number;
  email: boolean;
}

/**
 * IA — Prédiction des apprenants à risque : calcul périodique des scores par
 * le service ml (conteneur séparé). Désactivable par RISQUE_BALAYAGE_ACTIF=false ;
 * toujours désactivé en test. `delaiMs` : délai court de chaque appel, sans
 * nouvelle tentative (repli silencieux sur les règles d'alerte).
 */
export interface RisqueConfig {
  balayageActif: boolean;
  intervalleMinutes: number;
  /** Délai avant le premier calcul après le démarrage de l'api. */
  premierCalculSecondes: number;
  mlUrl: string;
  delaiMs: number;
}

/** US-RPT-01 — file de génération des rapports exportés (BullMQ, ADR-04). */
export interface RapportsConfig {
  workerActif: boolean;
  tentatives: number;
  backoffMs: number;
}

/** US-CERT-01 — file d'émission des certificats (BullMQ, ADR-04). */
export interface CertificatsConfig {
  workerActif: boolean;
  tentatives: number;
  backoffMs: number;
}

/**
 * US-IA-01 — assistance IA : files BullMQ (indexation des supports) et
 * fournisseur d'embeddings (ADR-05, interchangeable par configuration).
 */
export interface IaConfig {
  workerActif: boolean;
  tentatives: number;
  backoffMs: number;
  embeddingsFournisseur: 'hachage';
  /** US-IA-02 — générations lancées par formateur et par heure (coût borné). */
  generationsParHeure: number;
}

/** US-IA-03 — fournisseur du modèle de langage (ADR-05). */
/**
 * US-IA-09 — Fournisseur d'IA réellement utilisé. La clé Anthropic PRIME : dès
 * qu'elle est présente, Claude est appelé (sauf `compatible-openai` demandé
 * explicitement). `factice` n'est retenu que s'il est demandé ET sans clé
 * (tests, CI). Ni clé ni fournisseur : `non-configure` (appels refusés avec un
 * message clair, jamais de réponse d'exemple silencieuse).
 */
export function resoudreFournisseurLlm(
  demande: string | undefined,
  cleAnthropic: string | undefined,
): LlmConfig['fournisseur'] {
  const voulu = (demande ?? '').trim();
  const cle = (cleAnthropic ?? '').trim();
  if (voulu === 'compatible-openai') return 'compatible-openai';
  if (cle) return 'anthropic';
  if (voulu === 'factice') return 'factice';
  return 'non-configure';
}

export interface LlmConfig {
  fournisseur: 'anthropic' | 'compatible-openai' | 'factice' | 'non-configure';
  modele: string;
  /** Jamais journalisée ni renvoyée ; lue seulement par le fournisseur Anthropic. */
  cleAnthropic: string | undefined;
  /** US-IA-06 — fournisseur « compatible OpenAI » : adresse de base (…/v1) et clé facultative. */
  urlCompatible: string | undefined;
  cle: string | undefined;
  delaiMs: number;
  promptMaxCaracteres: number;
}

/** US-FORM-06 — ressources « fichier » des modules. */
export interface RessourcesConfig {
  tailleMaxMo: number;
}

export interface StockageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketLivrables: string;
}
export default (): {
  app: AppConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
  mail: MailConfig;
  oauthGoogle: OauthGoogleConfig;
  oauthGithub: OauthGithubConfig;
  minuterie: MinuterieConfig;
  stockage: StockageConfig;
  certificats: CertificatsConfig;
  alertes: AlertesConfig;
  risque: RisqueConfig;
  rapports: RapportsConfig;
  verification: VerificationConfig;
  limites: LimitesConfig;
  activations: ActivationsConfig;
  surveillance: SurveillanceConfig;
  ia: IaConfig;
  ressources: RessourcesConfig;
  llm: LlmConfig;
} => ({
  app: {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    apiPrefix: process.env.API_PREFIX ?? 'api',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
  },
  jwt: {
    privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH as string,
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH as string,
    accessTokenExpiresIn: 900, // 15 minutes
    refreshTokenExpiresIn: 604800, // 7 jours
  },
  redis: {
    host: process.env.REDIS_HOST as string,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  mail: {
    host: process.env.SMTP_HOST as string,
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    from: process.env.MAIL_FROM ?? 'Cert_EET <no-reply@cert-eet.local>',
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3001',
  },
  oauthGoogle: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      'https://localhost/api/auth/oauth/google/callback',
  },
  oauthGithub: {
    clientId: process.env.GITHUB_CLIENT_ID as string,
    clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL ??
      'https://localhost/api/auth/oauth/github/callback',
  },
  minuterie: {
    balayageActif: process.env.MINUTERIE_BALAYAGE_ACTIF !== 'false',
    intervalleSecondes: 60,
    delaiGraceSecondes: 30,
  },
  stockage: {
    endpoint: process.env.S3_ENDPOINT as string,
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY as string,
    secretKey: process.env.S3_SECRET_KEY as string,
    bucketLivrables: process.env.S3_BUCKET_LIVRABLES ?? 'livrables',
  },
  certificats: {
    workerActif: (process.env.CERTIFICATS_WORKER ?? 'on') !== 'off',
    tentatives: parseInt(process.env.CERTIFICATS_TENTATIVES ?? '3', 10),
    backoffMs: parseInt(process.env.CERTIFICATS_BACKOFF_MS ?? '5000', 10),
  },
  rapports: {
    workerActif: (process.env.RAPPORTS_WORKER ?? 'on') !== 'off',
    tentatives: parseInt(process.env.RAPPORTS_TENTATIVES ?? '3', 10),
    backoffMs: parseInt(process.env.RAPPORTS_BACKOFF_MS ?? '2000', 10),
  },
  alertes: {
    balayageActif: process.env.ALERTES_BALAYAGE_ACTIF !== 'false',
    intervalleMinutes: parseInt(process.env.ALERTES_INTERVALLE_MINUTES ?? '60', 10),
    email: process.env.ALERTES_EMAIL !== 'false',
  },
  risque: {
    balayageActif: process.env.RISQUE_BALAYAGE_ACTIF !== 'false',
    intervalleMinutes: parseInt(process.env.RISQUE_INTERVALLE_MINUTES ?? '1440', 10),
    premierCalculSecondes: parseInt(process.env.RISQUE_PREMIER_CALCUL_SECONDES ?? '60', 10),
    mlUrl: process.env.ML_URL || 'http://ml:8000',
    delaiMs: parseInt(process.env.ML_DELAI_MS ?? '3000', 10),
  },
  verification: {
    limiteParMinute: parseInt(process.env.VERIFICATION_LIMITE_PAR_MINUTE ?? '20', 10),
  },
  limites: lireLimites(process.env),
  surveillance: {
    active: (process.env.SURVEILLANCE_WEBCAM ?? 'on') !== 'off',
    intervalleSecondes: parseInt(process.env.SURVEILLANCE_INTERVALLE_SECONDES ?? '120', 10),
    tailleMaxOctets: 100 * 1024,
    conservationJours: parseInt(process.env.SURVEILLANCE_CONSERVATION_JOURS ?? '30', 10),
    // Purge planifiée : jamais en test (les e2e appellent la purge directement).
    balayageActif:
      process.env.NODE_ENV !== 'test' && process.env.SURVEILLANCE_BALAYAGE_ACTIF !== 'false',
    balayageMinutes: 60,
  },
  activations: {
    workerActif: (process.env.COMPTES_WORKER ?? 'on') !== 'off',
    tentatives: 3,
    backoffMs: 2000,
  },
  ia: {
    workerActif: (process.env.IA_WORKER ?? 'on') !== 'off',
    tentatives: parseInt(process.env.IA_TENTATIVES ?? '3', 10),
    backoffMs: parseInt(process.env.IA_BACKOFF_MS ?? '5000', 10),
    embeddingsFournisseur: 'hachage',
    generationsParHeure: parseInt(process.env.IA_GENERATIONS_PAR_HEURE ?? '10', 10),
  },
  ressources: {
    tailleMaxMo: parseInt(process.env.RESSOURCES_TAILLE_MAX_MO ?? '500', 10),
  },
  llm: {
    fournisseur: resoudreFournisseurLlm(process.env.LLM_FOURNISSEUR, process.env.ANTHROPIC_API_KEY),
    modele:
      process.env.LLM_MODELE ||
      (resoudreFournisseurLlm(process.env.LLM_FOURNISSEUR, process.env.ANTHROPIC_API_KEY) === 'anthropic'
        ? 'claude-sonnet-5-5'
        : 'factice-v1'),
    cleAnthropic: process.env.ANTHROPIC_API_KEY || undefined,
    urlCompatible: process.env.LLM_URL || undefined,
    cle: process.env.LLM_CLE || undefined,
    delaiMs: parseInt(process.env.LLM_DELAI_MS ?? '90000', 10),
    promptMaxCaracteres: parseInt(process.env.LLM_PROMPT_MAX_CARACTERES ?? '24000', 10),
  },
});
