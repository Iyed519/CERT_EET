import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { dataSourceOptions } from './data-source';
import { User } from './entities/user.entity';
import { Role } from './enums/role.enum';
import { StatutCompte } from './enums/statut-compte.enum';

/**
 * Seed du compte administrateur initial (INF04).
 *
 * Problème résolu : la plateforme n'a aucune inscription publique ; seul un
 * admin crée des comptes. Sans ce premier admin, personne ne pourrait se
 * connecter. Ce script insère UN administrateur, une seule fois.
 *
 * Sécurité : l'email et le mot de passe viennent des variables
 * d'environnement (jamais codés en dur). Le mot de passe est haché (bcrypt
 * cost 12) avant insertion — la base ne contient jamais le mot de passe en clair.
 */
async function seed(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  // Refus de démarrer si les identifiants ne sont pas fournis (fail-fast).
  if (!email || !password) {
    console.error(
      '[seed] ADMIN_EMAIL et ADMIN_PASSWORD sont requis. Abandon.',
    );
    process.exit(1);
  }

  // Ouvre la connexion à la base (mêmes options que l'app et les migrations).
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  const userRepository = dataSource.getRepository(User);

  // Idempotence : si un admin avec cet email existe déjà, on ne fait rien.
  const existing = await userRepository.findOne({ where: { email } });
  if (existing) {
    console.log(`[seed] L'admin "${email}" existe déjà. Aucune action.`);
    await dataSource.destroy();
    return;
  }

  // Hachage du mot de passe (cost 12).
  const motDePasseHash = await bcrypt.hash(password, 12);

  // Création de la ligne admin, déjà ACTIF pour pouvoir se connecter.
  const admin = userRepository.create({
    email,
    motDePasseHash,
    role: Role.ADMINISTRATEUR,
    statut: StatutCompte.ACTIF,
  });
  await userRepository.save(admin);

  console.log(`[seed] Administrateur initial créé : ${email}`);

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('[seed] Échec :', error);
  process.exit(1);
});