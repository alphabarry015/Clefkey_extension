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

/** Messages autorisés depuis un content script (le reste : pages d'extension seulement). */
export const MSG_ALLOW_CONTENT = new Set([
  MSG.GET_STATE,
  MSG.GET_ENTRIES_FOR_DOMAIN,
  MSG.FILL_ACTIVE_TAB,
  MSG.GENERATE_PASSWORD,
  MSG.SAVE_ENTRY,
  MSG.OFFER_CAPTURE,
  MSG.GET_PENDING_CAPTURE,
  MSG.DISMISS_CAPTURE,
  MSG.CONFIRM_CAPTURE,
]);

export const MESSAGE_ERROR = {
  NOT_UNLOCKED: 'NOT_UNLOCKED',
  BAD_CREDENTIALS: 'BAD_CREDENTIALS',
  NETWORK: 'NETWORK',
};
