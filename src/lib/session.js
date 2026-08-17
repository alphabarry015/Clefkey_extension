/* Persistance de session — modèle identique au coffre :
 * on persiste JWT + authMaterial (salt + blobs chiffrés), JAMAIS les clés
 * déchiffrées ni le mot de passe maître.
 *
 * - prefs (non sensibles)        → chrome.storage.local
 * - session (JWT + authMaterial) → chrome.storage.session (effacé à la fermeture
 *   du navigateur, non accessible aux content scripts).
 */

import { PREFS_DEFAULTS, STORAGE_KEYS } from './constants.js';

const ext = globalThis.browser || globalThis.chrome || {};

function storageArea(name) {
  return ext.storage && ext.storage[name];
}

export async function getPrefs() {
  const area = storageArea('local');
  if (!area) return { ...PREFS_DEFAULTS };
  const data = await area.get(STORAGE_KEYS.prefs);
  return { ...PREFS_DEFAULTS, ...(data[STORAGE_KEYS.prefs] || {}) };
}

export async function savePrefs(prefs) {
  const area = storageArea('local');
  if (!area) return;
  await area.set({ [STORAGE_KEYS.prefs]: prefs });
}

/** Bloque l'accès des content scripts à storage.session (défaut MV3, réaffirmé). */
export async function ensureSessionAccessLevel() {
  const area = storageArea('session');
  if (!area || !area.setAccessLevel) return;
  try {
    await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch { /* navigateur sans support */ }
}

export async function getStoredSession() {
  const area = storageArea('session');
  if (!area) return null;
  const data = await area.get(STORAGE_KEYS.session);
  const s = data[STORAGE_KEYS.session];
  if (!s || !s.token || !s.authMaterial?.salt || !s.authMaterial?.encrypted_vault_key) {
    return null;
  }
  return s;
}

export async function saveSession(payload) {
  const area = storageArea('session');
  if (!area) return;
  const existing = await getStoredSession();
  await area.set({
    [STORAGE_KEYS.session]: {
      ...(existing || {}),
      ...payload,
    },
  });
}

export async function clearSession() {
  const area = storageArea('session');
  if (!area) return;
  await area.remove(STORAGE_KEYS.session);
}

/** Efface les octets d'une clé en mémoire (best-effort). */
export function wipeKeyBytes(key) {
  if (key instanceof Uint8Array) key.fill(0);
}

export function wipeUnlockedMemory(memory) {
  if (!memory) return;
  wipeKeyBytes(memory.vaultKey);
  wipeKeyBytes(memory.privateKey);
  wipeKeyBytes(memory.publicKey);
  memory.vaultKey = null;
  memory.privateKey = null;
  memory.publicKey = null;
  memory.entries = [];
  memory.unlockedAt = 0;
}