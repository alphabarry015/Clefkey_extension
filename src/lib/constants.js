/* Constantes partagées de l'extension. */

export const STORAGE_KEYS = {
  prefs: 'clefkey_prefs',
  session: 'clefkey_session',
};

export const PREFS_DEFAULTS = {
  serverUrl: 'https://votre-domaine.vercel.app',
  autoLockMinutes: 5,
  theme: 'auto', // 'auto' | 'light' | 'dark'
};

/** Verrouillage « à la fermeture du navigateur » (storage.session s'efface seul). */
export const LOCK_ON_BROWSER_CLOSE = 0;

export const MSG = {
  GET_STATE: 'get-state',
  UNLOCK: 'unlock',
  LOCK: 'lock',
  LOGOUT: 'logout',
  GET_ENTRIES: 'get-entries',
  GET_ENTRIES_FOR_DOMAIN: 'get-entries-for-domain',
  FILL_ACTIVE_TAB: 'fill-active-tab',
  GENERATE_PASSWORD: 'generate-password',
  GENERATE_PASSPHRASE: 'generate-passphrase',
};

export const MESSAGE_ERROR = {
  NOT_UNLOCKED: 'NOT_UNLOCKED',
  BAD_CREDENTIALS: 'BAD_CREDENTIALS',
  NETWORK: 'NETWORK',
};