/**
 * Génère les icônes PNG de l'extension (16/32/48/128/192/512) en pur Node.
 *
 * Source : src/icons/icon.png (logo Clefkey). Redimensionnement bilinéaire
 * + encodeur PNG (node:zlib), sans dépendance native.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src', 'icons', 'icon.png');
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

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

// ── Décodage PNG (8-bit RGBA) ────────────────────────────

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('Fichier PNG invalide.');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`PNG non supporté (bit=${bitDepth}, color=${colorType}). Attendu RGBA 8-bit.`);
  }
  const inflated = inflateSync(Buffer.concat(idatParts));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = Buffer.alloc(stride * height);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const out = rgba.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bpp ? out[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let value = row[i];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Filtre PNG non supporté : ${filter}`);
      out[i] = value;
    }
    prev = Buffer.from(out);
  }
  return { width, height, rgba };
}

function resizeRgba(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return Buffer.from(src);
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const sy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < dw; x += 1) {
      const sx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const fx = Math.min(1, Math.max(0, sx - x0));
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const p00 = src[(y0 * sw + x0) * 4 + c];
        const p10 = src[(y0 * sw + x1) * 4 + c];
        const p01 = src[(y1 * sw + x0) * 4 + c];
        const p11 = src[(y1 * sw + x1) * 4 + c];
        dst[o + c] = Math.round(
          p00 * (1 - fx) * (1 - fy)
          + p10 * fx * (1 - fy)
          + p01 * (1 - fx) * fy
          + p11 * fx * fy,
        );
      }
    }
  }
  return dst;
}

/** Génère toutes les icônes dans OUT_DIR. Retourne la liste des fichiers. */
export function generateIcons() {
  const source = decodePng(readFileSync(SOURCE));
  const written = [];
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const rgba = resizeRgba(source.rgba, source.width, source.height, size, size);
    const file = join(OUT_DIR, `icon-${size}.png`);
    writeFileSync(file, encodePng(size, size, rgba));
    written.push(file);
    console.log(`  icon-${size}.png`);
  }
  console.log('Icônes générées.');
  return written;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  generateIcons();
}
