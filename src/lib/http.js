/* Fetch avec délai — évite qu'un service worker ou le popup reste bloqué. */

const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(url, options = {}, ms = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Délai dépassé. Vérifiez votre connexion.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
