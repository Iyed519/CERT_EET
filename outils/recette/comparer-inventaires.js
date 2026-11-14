#!/usr/bin/env node
/**
 * Cert_EET — US-UX-01 — Compare deux inventaires d'actions (garde-fou E11).
 *
 * Usage :
 *   node comparer-inventaires.js ../../docs/ux/inventaire-avant.json ../../docs/ux/inventaire.json \
 *     [../../docs/ux/equivalences.json] [rapport.md]
 * Code de sortie : 1 si une action « avant » est perdue ou à plus d'un clic de
 * plus, 0 sinon (les actions déplacées sont listées, sans échec).
 */
const fs = require('fs');
const { comparer, rapportMarkdown } = require('./inventaire-lib');

const [avantF, apresF, eqF, rapportF] = process.argv.slice(2);
if (!avantF || !apresF) {
  console.error('Usage : node comparer-inventaires.js avant.json apres.json [equivalences.json] [rapport.md]');
  process.exit(2);
}
const lire = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const equivalences = eqF && fs.existsSync(eqF) ? lire(eqF).libelles ?? {} : {};
const cmp = comparer(lire(avantF), lire(apresF), equivalences);
const md = rapportMarkdown(cmp);
if (rapportF) fs.writeFileSync(rapportF, md);
console.log(md);
process.exit(cmp.perdues || cmp.plusLoin ? 1 : 0);
