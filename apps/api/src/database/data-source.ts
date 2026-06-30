import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Options de connexion TypeORM — source unique de vérité.
 *
 * Consommé par DEUX clients :
 *  1. NestJS au runtime (TypeOrmModule.forRoot) pour ouvrir la connexion.
 *  2. La CLI TypeORM (migration:generate / migration:run), qui s'exécute
 *     HORS du conteneur d'injection Nest et a donc besoin d'un DataSource
 *     autonome — d'où l'export par défaut en bas.
 *
 * Les valeurs viennent de process.env (validé par Joi au démarrage). En
 * conteneur, Docker Compose injecte DB_HOST=postgres, etc. ; les valeurs de
 * repli ne servent qu'à un lancement local hors Docker.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'certeet',
  password: process.env.DB_PASSWORD ?? 'certeet',
  database: process.env.DB_NAME ?? 'certeet',

  // Globs : retrouvent automatiquement entités et migrations, en .ts (CLI via
  // ts-node) comme en .js (image compilée).
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],

  synchronize: false, // jamais d'auto-schéma — migrations uniquement
  migrationsRun: false, // on lance les migrations explicitement (étape dédiée)
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
