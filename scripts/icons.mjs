/**
 * Génère les icônes PNG de l'extension (16/32/48/128/192/512) en pur Node.
 *
 * Aucune dépendance native : rasterisation SDF + encodeur PNG minimal
 * (node:zlib). Dessine l'icône Clefkey : fond noir arrondi, clef blanche,
 * trou de serrure accent bleu.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'dist', 'icons');
const SIZES = [16, 32, 48, 128, 192, 512];

// ── Encodage PNG ─────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Scanlines filtrées (filter 0) compressées.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    rgba.copy(raw, offset, y * width * 4, (y + 1) * width * 4);
    offset += width * 4;
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rasterisation SDF de l'icône ─────────────────────────

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** SDF d'un rectangle arrondi dans un repère 0..1. */
function roundedRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

/** SDF d'un disque. */
function circle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function pixelColor(x, y) {
  // Icône conçue dans le repère 0..1 (coordonnées).
  const ACCENT = [54, 98, 215, 255];
  const WHITE = [255, 255, 255, 255];
  const BLACK = [0, 0, 0, 255];

  const bg = roundedRect(x, y, 0.5, 0.5, 1.0, 1.0, 0.22);
  if (bg > 0) return [0, 0, 0, 0]; // transparent hors fond arrondi

  // Lettre « C » (Clefkey) : anneau ouvert à droite, motif réduit et centré
  // pour laisser de la marge par rapport aux bords de l'icône.
  const ringOut = circle(x, y, 0.5, 0.5, 0.26);
  const ringIn = circle(x, y, 0.5, 0.5, 0.17);
  const ring = Math.max(ringOut, -ringIn);
  const notch = roundedRect(x, y, 0.72, 0.5, 0.42, 0.34, 0.08);
  const cShape = Math.max(ring, -notch);

  const cCoverage = 1 - smoothstep(0, 0.5, cShape);

  // Point accent (trou de serrure) dans l'ouverture du « C ».
  const dot = circle(x, y, 0.75, 0.5, 0.03);
  const dotCoverage = 1 - smoothstep(0, 0.5, dot);

  let r = 0, g = 0, b = 0, a = 0;
  if (dotCoverage > 0) {
    r = ACCENT[0]; g = ACCENT[1]; b = ACCENT[2]; a = Math.round(255 * dotCoverage);
  } else if (cCoverage > 0) {
    r = WHITE[0]; g = WHITE[1]; b = WHITE[2]; a = Math.round(255 * cCoverage);
  } else {
    r = BLACK[0]; g = BLACK[1]; b = BLACK[2]; a = BLACK[3];
  }
  return [r, g, b, a];
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // Échantillon au centre du pixel (repère 0..1).
      const x = (px + 0.5) * step;
      const y = (py + 0.5) * step;
      const [r, g, b, a] = pixelColor(x, y);
      const o = (py * size + px) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
  return encodePng(size, size, rgba);
}

/** Génère toutes les icônes dans OUT_DIR. Retourne la liste des fichiers. */
export function generateIcons() {
  const written = [];
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const png = render(size);
    const file = join(OUT_DIR, `icon-${size}.png`);
    writeFileSync(file, png);
    written.push(file);
    console.log(`  icon-${size}.png`);
  }
  console.log('Icônes générées.');
  return written;
}

// Exécution directe : node scripts/icons.mjs
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  generateIcons();
}