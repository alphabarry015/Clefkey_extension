/* Constantes partagées de l'extension. */

export const STORAGE_KEYS = {
  prefs: 'clefkey_prefs',
  session: 'clefkey_session',
  pendingCapture: 'clefkey_pending_capture',
};

/** URL du coffre Clefkey — figée, pas de page Options. */
export const DEFAULT_SERVER_URL = 'https://clefkey.vercel.app';

export const PREFS_DEFAULTS = {
  serverUrl: DEFAULT_SERVER_URL,
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
  SAVE_ENTRY: 'save-entry',
  OFFER_CAPTURE: 'offer-capture',
  GET_PENDING_CAPTURE: 'get-pending-capture',
  DISMISS_CAPTURE: 'dismiss-capture',
  CONFIRM_CAPTURE: 'confirm-capture',
};

export const MESSAGE_ERROR = {
  NOT_UNLOCKED: 'NOT_UNLOCKED',
  BAD_CREDENTIALS: 'BAD_CREDENTIALS',
  NETWORK: 'NETWORK',
};
