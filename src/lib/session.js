/* Persistance de session — modèle identique au coffre :
 * on persiste JWT + authMaterial (salt + blobs chiffrés), JAMAIS les clés
 * déchiffrées ni le mot de passe maître.
 *
 * - prefs (non sensibles)        → chrome.storage.local
 * - session (JWT + authMaterial) → chrome.storage.session (effacé à la fermeture
 *   du navigateur, non accessible aux content scripts).
 */

import { DEFAULT_SERVER_URL, PREFS_DEFAULTS, STORAGE_KEYS } from './constants.js';

const ext = globalThis.browser || globalThis.chrome || {};
const THEMES = new Set(['auto', 'light', 'dark']);

let prefsCache = null;

function storageArea(name) {
  return ext.storage && ext.storage[name];
}

function clampLockMinutes(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(120, Math.round(n)));
}

function sanitizePrefs(raw) {
  const base = { ...PREFS_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    serverUrl: DEFAULT_SERVER_URL,
    autoLockMinutes: clampLockMinutes(base.autoLockMinutes, PREFS_DEFAULTS.autoLockMinutes),
    theme: THEMES.has(base.theme) ? base.theme : PREFS_DEFAULTS.theme,
  };
}

export async function getPrefs() {
  if (prefsCache) return prefsCache;
  const area = storageArea('local');
  if (!area) {
    prefsCache = sanitizePrefs(null);
    return prefsCache;
  }
  const data = await area.get(STORAGE_KEYS.prefs);
  prefsCache = sanitizePrefs(data[STORAGE_KEYS.prefs]);
  return prefsCache;
}

export async function savePrefs(prefs) {
  const next = sanitizePrefs({ ...(await getPrefs()), ...prefs });
  const area = storageArea('local');
  if (!area) {
    prefsCache = next;
    return next;
  }
  await area.set({ [STORAGE_KEYS.prefs]: next });
  prefsCache = next;
  return next;
}

try {
  if (ext.storage && ext.storage.onChanged) {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEYS.prefs]) {
        const neu = changes[STORAGE_KEYS.prefs].newValue;
        prefsCache = neu ? sanitizePrefs(neu) : null;
      }
    });
  }
} catch { /* contexte sans storage events */ }

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
  memory.entriesLoaded = false;
  memory.unlockedAt = 0;
  memory.lastActivity = 0;
}
