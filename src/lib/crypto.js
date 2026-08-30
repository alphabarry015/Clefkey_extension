/* Crypto côté extension — compatible avec le backend Clefkey.
 *
 * Dérivé de frontend/js/crypto.js du coffre (mêmes paramètres Argon2id et
 * AES-GCM, pour rester interopérable). Les flux X25519 / récupération ne sont
 * pas nécessaires à l'extension v1 et sont donc absents ici.
 */

import { argon2id } from '../vendor/hash-wasm.esm.min.js';

const SALT_SIZE = 16;
const NONCE_SIZE = 12;
const KEY_SIZE = 32;
/** Ne pas changer : les comptes existants dépendent de ces paramètres. */
const MEMORY_COST = 65536;
const TIME_COST = 3;
const PARALLELISM = 4;

function assertCryptoReady() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Chiffrement indisponible.');
  }
}

// ── Utilitaires ──────────────────────────────────────────

export function toB64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function toBuffer(u8) {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ── Dérivation de clé (Argon2id) ───────────────────────

export function generateSalt() {
  assertCryptoReady();
  return crypto.getRandomValues(new Uint8Array(SALT_SIZE));
}

/**
 * Dérive la clé maître. En service worker MV3, aucun Web Worker n'est
 * disponible : la dérivation s'exécute sur le thread du background. Un
 * document offscreen pourra héberger Argon2 dans une révision ultérieure.
 */
export async function deriveKey(masterPassword, salt) {
  assertCryptoReady();
  try {
    const hash = await argon2id({
      password: new TextEncoder().encode(masterPassword),
      salt,
      parallelism: PARALLELISM,
      iterations: TIME_COST,
      memorySize: MEMORY_COST,
      hashLength: KEY_SIZE,
      outputType: 'binary',
    });
    return new Uint8Array(hash);
  } catch (err) {
    const msg = err && err.message ? String(err.message) : 'Erreur inconnue';
    if (/out of memory/i.test(msg)) {
      throw new Error('Mémoire insuffisante. Réessayez.');
    }
    throw new Error('Impossible de dériver la clé.');
  }
}

export async function createAuthVerifier(derivedKey) {
  const data = concat(derivedKey, new TextEncoder().encode('auth_verifier'));
  const hash = await crypto.subtle.digest('SHA-256', toBuffer(data));
  return new Uint8Array(hash);
}

// ── AES-256-GCM ──────────────────────────────────────────

async function importAesKey(rawKey) {
  assertCryptoReady();
  return crypto.subtle.importKey('raw', toBuffer(rawKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(plaintext, key) {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const aesKey = await importAesKey(key);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBuffer(nonce) }, aesKey, toBuffer(plaintext)),
  );
  return concat(nonce, ciphertext);
}

export async function decryptBytes(encrypted, key) {
  const nonce = encrypted.slice(0, NONCE_SIZE);
  const ciphertext = encrypted.slice(NONCE_SIZE);
  const aesKey = await importAesKey(key);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(nonce) }, aesKey, toBuffer(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export async function encryptData(data, key) {
  const json = new TextEncoder().encode(JSON.stringify(data));
  return encryptBytes(json, key);
}

export async function decryptData(encrypted, key) {
  const plaintext = await decryptBytes(encrypted, key);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export function generateVaultKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ── Générateur de mots de passe ──────────────────────────

const PASSWORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

export function generatePassword(length = 20) {
  const n = Math.max(12, Math.min(64, Number(length) || 20));
  const maxUnbiased = 256 - (256 % PASSWORD_CHARS.length);
  let out = '';
  while (out.length < n) {
    const buf = new Uint8Array(n - out.length + 8);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= maxUnbiased) continue;
      out += PASSWORD_CHARS[b % PASSWORD_CHARS.length];
      if (out.length >= n) break;
    }
  }
  return out;
}

// ── Connexion & déverrouillage ───────────────────────────

/**
 * Étape 1 du login : récupère le sel, dérive le vérificateur.
 * Retourne { authVerifier (b64), derived, saltB64 }.
 */
export async function prepareLogin(email, masterPassword, apiBase) {
  let resp;
  try {
    resp = await fetch(`${apiBase}/auth/salt?email=${encodeURIComponent(email)}`);
  } catch {
    throw new Error('Impossible de joindre Clefkey. Vérifiez votre connexion.');
  }
  if (!resp.ok) {
    let detail = '';
    try {
      const body = await resp.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch { /* ignore */ }
    if (resp.status === 429) {
      throw new Error(detail || 'Trop de tentatives. Réessayez plus tard.');
    }
    throw new Error(detail || 'Impossible de préparer la connexion.');
  }
  const { salt: saltB64 } = await resp.json();
  const salt = fromB64(saltB64);
  const derived = await deriveKey(masterPassword, salt);
  const authVerifier = await createAuthVerifier(derived);
  return {
    authVerifier: toB64(authVerifier),
    derived,
    saltB64,
  };
}

/**
 * Déverrouille la session après login : déchiffre la clé de coffre puis la
 * clé privée. Retourne { vaultKey, privateKey, publicKey }.
 */
export async function unlockSession(authResponse, masterPassword, options = {}) {
  const salt = fromB64(authResponse.salt);
  let derived = options.derivedKey || null;
  if (!derived || (options.saltB64 && options.saltB64 !== authResponse.salt)) {
    derived = await deriveKey(masterPassword, salt);
  }
  const vaultKey = await decryptBytes(fromB64(authResponse.encrypted_vault_key), derived);
  const privateKey = authResponse.encrypted_private_key
    ? await decryptBytes(fromB64(authResponse.encrypted_private_key), vaultKey)
    : null;
  const publicKey = authResponse.public_key ? fromB64(authResponse.public_key) : null;
  if (derived && !options.keepDerived) derived.fill(0);
  return { vaultKey, privateKey, publicKey };
}