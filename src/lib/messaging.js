/* Message bus partagé (popup / content script) vers le background. */

export function send(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({ ok: false, message: lastError.message || 'Erreur de communication.' });
          return;
        }
        resolve(response || { ok: false, message: 'Réponse vide.' });
      });
    } catch (err) {
      resolve({ ok: false, message: err && err.message ? err.message : 'Erreur de communication.' });
    }
  });
}

/** Attente d'un message runtime typé envoyé au content script. */
export function listen(type, handler) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== type) return false;
    Promise.resolve(handler(message, sender))
      .then((result) => sendResponse({ ok: true, ...result }), (err) => {
        sendResponse({
          ok: false,
          code: err && err.code ? err.code : 'ERROR',
          message: (err && err.message) || 'Erreur inconnue.',
        });
      });
    return true;
  });
}