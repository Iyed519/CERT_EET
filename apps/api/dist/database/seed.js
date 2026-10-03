"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const bcrypt = require("bcryptjs");
const data_source_1 = require("./data-source");
const user_entity_1 = require("./entities/user.entity");
const role_enum_1 = require("./enums/role.enum");
const statut_compte_enum_1 = require("./enums/statut-compte.enum");
async function seed() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        console.error('[seed] ADMIN_EMAIL et ADMIN_PASSWORD sont requis. Abandon.');
        process.exit(1);
    }
    const dataSource = new typeorm_1.DataSource(data_source_1.dataSourceOptions);
    await dataSource.initialize();
    const userRepository = dataSource.getRepository(user_entity_1.User);
    const existing = await userRepository.findOne({ where: { email } });
    if (existing) {
        console.log(`[seed] L'admin "${email}" existe déjà. Aucune action.`);
        await dataSource.destroy();
        return;
    }
    const motDePasseHash = await bcrypt.hash(password, 12);
    const admin = userRepository.create({
        email,
        motDePasseHash,
        role: role_enum_1.Role.ADMINISTRATEUR,
        statut: statut_compte_enum_1.StatutCompte.ACTIF,
    });
    await userRepository.save(admin);
    console.log(`[seed] Administrateur initial créé : ${email}`);
    await dataSource.destroy();
}
seed().catch((error) => {
    console.error('[seed] Échec :', error);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map