/* Background — service worker (MV3, module).
 *
 * Détient la session déverrouillée (clés en mémoire uniquement), orchestre
 * connexion/déverrouillage, auto-lock et persiste JWT + authMaterial dans
 * storage.session (jamais de secret en clair).
 */

import { api } from '../lib/api.js';
import { MSG, STORAGE_KEYS } from '../lib/constants.js';
import { decryptData, encryptData, fromB64, prepareLogin, toB64, unlockSession } from '../lib/crypto.js';
import { entryMatchesUrl, normalizeEntryUrl, pageHostname } from '../lib/domain.js';
import { generatePassphrase, generateSafePassword } from '../lib/generator.js';
import {
  getPrefs, getStoredSession, saveSession, clearSession,
  wipeUnlockedMemory, ensureSessionAccessLevel,
} from '../lib/session.js';

/** Session déverrouillée : uniquement en mémoire du background. */
const memory = {
  vaultKey: null,
  privateKey: null,
  publicKey: null,
  entries: [],
  unlockedAt: 0,
};

let autoLockTimer = null;

// ── Auto-lock ────────────────────────────────────────────

function clearAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

async function scheduleAutoLock() {
  clearAutoLockTimer();
  const prefs = await getPrefs();
  const minutes = Number(prefs.autoLockMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return; // fermeture navigateur uniquement
  const delay = minutes * 60 * 1000;
  autoLockTimer = setTimeout(() => {
    autoLockTimer = null;
    softLock('idle');
  }, delay);
}

function softLock(reason = 'idle') {
  clearAutoLockTimer();
  wipeUnlockedMemory(memory);
  void reason;
}

// ── Utilitaires ──────────────────────────────────────────

function userFromProfile(data) {
  return {
    email: data.email,
    first_name: data.first_name || '',
    middle_name: data.middle_name || '',
    last_name: data.last_name || '',
  };
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    email: user.email || '',
    first_name: user.first_name || '',
    middle_name: user.middle_name || '',
    last_name: user.last_name || '',
  };
}

function isUnlocked() {
  return Boolean(memory.vaultKey);
}

function authMaterialFromPayload(payload) {
  if (!payload?.salt || !payload?.encrypted_vault_key) return null;
  return {
    salt: payload.salt,
    encrypted_vault_key: payload.encrypted_vault_key,
    encrypted_private_key: payload.encrypted_private_key || null,
    public_key: payload.public_key || null,
  };
}

async function currentPrefs() {
  return getPrefs();
}

// ── Actions ──────────────────────────────────────────────

async function doUnlock({ email, master, autoRelock = true }) {
  if (!master) throw new Error('Mot de passe maître requis.');
  const prefs = await getPrefs();
  const apiBase = prefs.serverUrl;
  const stored = await getStoredSession();

  let token;
  let user;
  let authMaterial;

  if (stored && stored.authMaterial) {
    // Verrouillage : le sel est connu, on redérive localement.
    const keys = await unlockSession(stored.authMaterial, master);
    token = stored.token;
    user = stored.user;
    authMaterial = stored.authMaterial;
    Object.assign(memory, keys, { entries: [], unlockedAt: Date.now() });
  } else {
    if (!email) throw new Error('E-mail requis.');
    const prepared = await prepareLogin(email, master, apiBase);
    const data = await api.login(apiBase, email, prepared.authVerifier);
    const keys = await unlockSession(data, master, {
      derivedKey: prepared.derived,
      saltB64: prepared.saltB64,
    });
    token = data.access_token;
    user = userFromProfile(data);
    authMaterial = authMaterialFromPayload(data);
    Object.assign(memory, keys, { entries: [], unlockedAt: Date.now() });
  }

  await saveSession({
    token,
    user: normalizeUser(user),
    authMaterial,
    lastActivity: Date.now(),
  });
  if (autoRelock) await scheduleAutoLock();
  return { ok: true, user: normalizeUser(user) };
}

async function doLock() {
  softLock('manual');
  return { ok: true };
}

async function doLogout() {
  clearAutoLockTimer();
  wipeUnlockedMemory(memory);
  await clearSession();
  await clearPendingCapture();
  return { ok: true };
}

async function requireEntriesLoaded() {
  if (memory.entries.length > 0) return memory.entries;
  if (!isUnlocked()) throw { code: 'NOT_UNLOCKED', message: 'Clefkey est verrouillé.' };
  const prefs = await getPrefs();
  const stored = await getStoredSession();
  if (!stored?.token) throw { code: 'NOT_UNLOCKED', message: 'Session invalide.' };
  try {
    const blobs = await api.getEntries(prefs.serverUrl, stored.token);
    const raw = Array.isArray(blobs) ? blobs : [];
    const decrypted = [];
    for (const e of raw) {
      try {
        const data = await decryptData(fromB64(e.encrypted_data), memory.vaultKey);
        if (data && typeof data === 'object' && data.type !== 'vault_meta') {
          decrypted.push({
            id: e.id,
            title: data.title || '',
            type: data.type || 'login',
            username: data.username || '',
            password: data.password || '',
            notes: data.notes || '',
            url: data.url || '',
            created_at: e.created_at || '',
            updated_at: e.updated_at || '',
          });
        }
      } catch {
        // Blob indéchiffrable (ancien, autre appareil) → ignoré.
      }
    }
    memory.entries = decrypted;
    await scheduleAutoLock();
    return memory.entries;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      await doLogout();
      throw { code: 'NOT_UNLOCKED', message: 'Session expirée. Reconnectez-vous.' };
    }
    throw err;
  }
}

async function doGetEntries() {
  const entries = await requireEntriesLoaded();
  return { ok: true, entries };
}

async function doGetEntriesForDomain(url) {
  const entries = await requireEntriesLoaded();
  const matches = entries.filter(
    (e) => e.type === 'login' && e.username && entryMatchesUrl(e, url),
  );
  return {
    ok: true,
    hostname: pageHostname(url),
    entries: matches.map((e) => ({
      id: e.id,
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
    })),
  };
}

async function sendFillToTab(tabId, entry) {
  const payload = {
    type: 'ck-fill',
    entry: { username: entry.username, password: entry.password },
  };
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return;
  } catch {
    // Pas de content script actif (page ouverte avant le chargement/rechargement
    // de l'extension) : on injecte dans la frame principale puis on renvoie.
    // L'injection est idempotente (drapeau window.__clefkeyReady dans le monde
    // isolé) : relancer le script sur un onglet déjà équipé ne duplique rien.
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ['content/content.js'],
    });
  } catch {
    throw {
      code: 'NO_CONTENT',
      message: 'Impossible de remplir cette page.',
    };
  }
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    throw {
      code: 'NO_CONTENT',
      message: 'Rechargez la page puis réessayez.',
    };
  }
}

async function doFillActiveTab({ entryId, tabId, url }) {
  const entries = await requireEntriesLoaded();
  const entry = entries.find(
    (e) => e.id === entryId && e.type === 'login' && entryMatchesUrl(e, url || ''),
  );
  if (!entry) throw { code: 'NOT_FOUND', message: 'Identifiant introuvable.' };
  if (!Number.isInteger(tabId)) throw { code: 'ERROR', message: 'Onglet invalide.' };
  try {
    await sendFillToTab(tabId, entry);
  } catch {
    throw {
      code: 'NO_CONTENT',
      message: 'Impossible de remplir cette page. Rechargez-la puis réessayez.',
    };
  }
  return { ok: true };
}

async function doGeneratePassword({ length }) {
  try {
    const password = await generateSafePassword({ length: Number(length) || 20 });
    return { ok: true, password };
  } catch (err) {
    throw { code: 'GEN_ERROR', message: (err && err.message) || 'Génération impossible.' };
  }
}

async function doGeneratePassphrase({ count }) {
  return { ok: true, passphrase: generatePassphrase(count || 5) };
}

const CAPTURE_TTL_MS = 10 * 60 * 1000;
let pendingCapture = null;

function captureIsFresh(entry) {
  return Boolean(entry && entry.password && entry.url && (Date.now() - Number(entry.at || 0) < CAPTURE_TTL_MS));
}

async function persistPendingCapture(entry) {
  pendingCapture = entry;
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.pendingCapture]: entry });
  } catch { /* session storage indisponible */ }
}

async function readPendingCapture() {
  if (captureIsFresh(pendingCapture)) return pendingCapture;
  try {
    const data = await chrome.storage.session.get(STORAGE_KEYS.pendingCapture);
    const stored = data[STORAGE_KEYS.pendingCapture];
    if (captureIsFresh(stored)) {
      pendingCapture = stored;
      return stored;
    }
  } catch { /* ignore */ }
  pendingCapture = null;
  return null;
}

async function clearPendingCapture() {
  pendingCapture = null;
  try {
    await chrome.storage.session.remove(STORAGE_KEYS.pendingCapture);
  } catch { /* ignore */ }
}

async function doOfferCapture({ title, username, password, url }) {
  const pageUrl = normalizeEntryUrl(url);
  const user = String(username || '').trim();
  const secret = String(password || '');
  if (!pageUrl || !user || !secret) {
    throw new Error('Identifiant et mot de passe requis.');
  }
  await persistPendingCapture({
    title: String(title || '').trim() || pageHostname(pageUrl) || 'Identifiant',
    username: user,
    password: secret,
    url: pageUrl,
    at: Date.now(),
  });
  return { ok: true };
}

async function doGetPendingCapture() {
  const [cap, state] = await Promise.all([readPendingCapture(), getState()]);
  if (!cap) return { ok: true, capture: null, locked: state.locked, hasSession: state.hasSession };
  return {
    ok: true,
    locked: state.locked,
    hasSession: state.hasSession,
    email: state.email,
    capture: {
      title: cap.title,
      username: cap.username,
      url: cap.url,
      password: cap.password,
    },
  };
}

async function doDismissCapture() {
  await clearPendingCapture();
  return { ok: true };
}

async function doConfirmCapture({ email, master }) {
  const cap = await readPendingCapture();
  if (!cap) throw new Error('Aucune proposition.');
  if (!isUnlocked()) {
    await doUnlock({ email, master });
  }
  const saved = await doSaveEntry(cap);
  await clearPendingCapture();
  return saved;
}

async function doSaveEntry({ title, username, password, url }) {
  if (!isUnlocked()) throw { code: 'NOT_UNLOCKED', message: 'Clefkey est verrouillé.' };
  const secret = String(password || '');
  const user = String(username || '').trim();
  const pageUrl = normalizeEntryUrl(url);
  if (!secret) throw new Error('Mot de passe requis.');
  if (!user) throw new Error('Indiquez un identifiant.');
  if (!pageUrl) throw new Error('Ouvrez le site dans un onglet.');
  const prefs = await getPrefs();
  const stored = await getStoredSession();
  if (!stored?.token) throw { code: 'NOT_UNLOCKED', message: 'Session invalide.' };
  const host = pageHostname(pageUrl);
  const payload = {
    title: String(title || '').trim() || host || 'Identifiant',
    type: 'login',
    username: user,
    password: secret,
    notes: '',
    url: pageUrl,
  };
  try {
    const encrypted = await encryptData(payload, memory.vaultKey);
    await api.createEntry(prefs.serverUrl, stored.token, toB64(encrypted));
    memory.entries = [];
    await scheduleAutoLock();
    return { ok: true, title: payload.title, username: payload.username, url: payload.url };
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      await doLogout();
      throw { code: 'NOT_UNLOCKED', message: 'Session expirée. Reconnectez-vous.' };
    }
    throw err;
  }
}

// ── État ─────────────────────────────────────────────────

async function getState() {  const [prefs, stored] = await Promise.all([getPrefs(), getStoredSession()]);
  return {
    ok: true,
    locked: !isUnlocked(),
    hasSession: Boolean(stored),
    user: normalizeUser(stored?.user || null),
    email: (stored?.user?.email) || null,
    serverUrl: prefs.serverUrl,
    autoLockMinutes: Number(prefs.autoLockMinutes) || 0,
  };
}

// ── Message routing ──────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  // Seuls les messages de notre propre extension sont acceptés (popup,
  // content scripts). Une autre extension ne doit pouvoir ni lire les entrées
  // déchiffrées, ni déverrouiller/verrouiller la session.
  if (!sender || sender.id !== chrome.runtime.id) return false;
  const handle = (promise) => {
    promise.then(sendResponse, (err) => {
      const code = err && err.code ? err.code : (err && err.status ? `HTTP_${err.status}` : 'ERROR');
      sendResponse({ ok: false, code, message: (err && err.message) || 'Une erreur s\'est produite.' });
    });
    return true; // réponse asynchrone
  };

  switch (message.type) {
    case MSG.GET_STATE:
      return handle(getState());
    case MSG.UNLOCK:
      return handle(doUnlock(message));
    case MSG.LOCK:
      return handle(doLock());
    case MSG.LOGOUT:
      return handle(doLogout());
    case MSG.GET_ENTRIES:
      return handle(doGetEntries());
    case MSG.GET_ENTRIES_FOR_DOMAIN:
      return handle(doGetEntriesForDomain(message.url));
    case MSG.FILL_ACTIVE_TAB:
      return handle(doFillActiveTab(message));
    case MSG.GENERATE_PASSWORD:
      return handle(doGeneratePassword(message));
    case MSG.GENERATE_PASSPHRASE:
      return handle(doGeneratePassphrase(message));
    case MSG.SAVE_ENTRY:
      return handle(doSaveEntry(message));
    case MSG.OFFER_CAPTURE:
      return handle(doOfferCapture(message));
    case MSG.GET_PENDING_CAPTURE:
      return handle(doGetPendingCapture());
    case MSG.DISMISS_CAPTURE:
      return handle(doDismissCapture());
    case MSG.CONFIRM_CAPTURE:
      return handle(doConfirmCapture(message));
    default:
      return false;
  }
});

// ── Init ─────────────────────────────────────────────────

ensureSessionAccessLevel().catch(() => {});
chrome.runtime.onStartup.addListener(() => {
  // storage.session est déjà vide après un redémarrage du navigateur.
  softLock('browser_close');
});
chrome.runtime.onInstalled.addListener(() => {
  softLock('installed');
});