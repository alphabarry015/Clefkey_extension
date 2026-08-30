/**
 * Build de l'extension Clefkey.
 *
 * - Génère les icônes PNG (scripts/icons.mjs, pur Node, zéro dépendance native).
 * - Copie src/ (hors manifestes) vers dist/.
 * - Copie le manifest Chromium (MV3) ou Firefox (MV3) selon la cible.
 *
 * Usage :
 *   node scripts/build.mjs --target chromium|firefox|all|icons
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIcons } from './icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

/** Copie récursive manuelle (cpSync crashe sur node win32-arm64). */
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) copyDir(src, dst);
    else copyFileSync(src, dst);
  }
}

const args = process.argv.slice(2);
const targetIndex = args.findIndex((a) => a === '--target');
const target = targetIndex >= 0
  ? (args[targetIndex + 1] || 'chromium')
  : args.find((a) => a.startsWith('--target='))?.split('=').pop() || 'chromium';

const targets = target === 'all' ? ['chromium', 'firefox'] : [target];

const FILES_TO_COPY = [
  'lib',
  'background',
  'content',
  'popup',
  'vendor',
];

function buildVariant(variant) {
  const manifestSrc = join(SRC, `manifest.${variant}.json`);
  const manifestDst = join(DIST, 'manifest.json');
  if (!existsSync(manifestSrc)) {
    throw new Error(`Manifest introuvable : ${manifestSrc}`);
  }
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, 'icons'), { recursive: true });
  for (const name of FILES_TO_COPY) {
    const from = join(SRC, name);
    if (existsSync(from)) copyDir(from, join(DIST, name));
  }
  copyFileSync(join(SRC, 'icons', 'icon.svg'), join(DIST, 'icons', 'icon.svg'));
  copyFileSync(join(SRC, 'icons', 'icon.png'), join(DIST, 'icons', 'icon.png'));
  copyFileSync(manifestSrc, manifestDst);
  generateIcons();
  console.log(`  ${variant} → dist/ prêt (${manifestSrc.split(/[\\/]/).pop()})`);
}

function main() {
  if (!existsSync(SRC)) {
    throw new Error(`Dossier source introuvable : ${SRC}`);
  }
  if (target === 'icons') {
    rmSync(DIST, { recursive: true, force: true });
    mkdirSync(join(DIST, 'icons'), { recursive: true });
    copyFileSync(join(SRC, 'icons', 'icon.svg'), join(DIST, 'icons', 'icon.svg'));
    copyFileSync(join(SRC, 'icons', 'icon.png'), join(DIST, 'icons', 'icon.png'));
    generateIcons();
    return;
  }
  for (const variant of targets) {
    buildVariant(variant);
  }
  console.log('Build terminé.');
}

main();