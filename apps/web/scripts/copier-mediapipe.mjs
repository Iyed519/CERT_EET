// US-QCM-15 — Copie le moteur WebAssembly de MediaPipe (paquet npm
// @mediapipe/tasks-vision, version exacte de package.json) dans
// public/mediapipe/wasm, pour qu'il soit servi par la plateforme elle-même :
// aucun appel à un CDN tiers pendant un QCM. Lancé avant `dev` et `build`.
// Le modèle (public/mediapipe/efficientdet_lite0.tflite) est versionné.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const cible = join(racine, 'public', 'mediapipe', 'wasm');
const fichiers = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

if (!existsSync(source)) {
  console.error(`MediaPipe introuvable (${source}) : lancez « npm ci ».`);
  process.exit(1);
}
mkdirSync(cible, { recursive: true });
for (const f of fichiers) copyFileSync(join(source, f), join(cible, f));
console.log(`MediaPipe : ${fichiers.length} fichiers copiés dans public/mediapipe/wasm.`);
