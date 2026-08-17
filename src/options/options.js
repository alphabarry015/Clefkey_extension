/* Options — chargement / enregistrement des préférences. */

import { getPrefs, savePrefs } from '../lib/session.js';

const $ = (id) => document.getElementById(id);

function setResult(kind, text) {
  const el = kind === 'test' ? $('test-result') : $('save-result');
  el.textContent = text;
  el.className = kind === 'test' ? `test-result ${el.dataset.tone || ''}` : 'save-result';
}

async function load() {
  const prefs = await getPrefs();
  $('opt-server-url').value = prefs.serverUrl || '';
  $('opt-autolock').value = prefs.autoLockMinutes;
  $('opt-theme').value = prefs.theme || 'auto';
}

/** Demande la permission d'hôte pour le serveur configuré (demande à la volée). */
async function ensureServerAccess(serverUrl) {
  try {
    const origin = `${new URL(serverUrl).origin}/*`;
    if (await chrome.permissions.contains({ origins: [origin] })) return true;
    return await new Promise((resolve) => {
      chrome.permissions.request({ origins: [origin] }, (granted) => resolve(Boolean(granted)));
    });
  } catch {
    return false;
  }
}

$('form-options').addEventListener('submit', async (e) => {
  e.preventDefault();
  const serverUrl = $('opt-server-url').value.trim().replace(/\/+$/, '');
  const autoLockMinutes = Math.max(0, Math.min(120, parseInt($('opt-autolock').value, 10) || 0));
  const theme = $('opt-theme').value;

  const isHttps = /^https:\/\/.+/i.test(serverUrl);
  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(serverUrl);
  if (!isHttps && !isLocalhost) {
    setResult('save', 'URL invalide — HTTPS requis (localhost autorisé pour le développement).');
    return;
  }

  const btn = $('btn-save');
  btn.disabled = true;
  try {
    const granted = await ensureServerAccess(serverUrl);
    if (!granted) {
      setResult('save', 'Accès au serveur refusé (permission d\'hôte).');
      btn.disabled = false;
      return;
    }
    await savePrefs({ serverUrl, autoLockMinutes, theme });
    setResult('save', 'Enregistré.');
    btn.disabled = false;
  } catch (err) {
    setResult('save', err && err.message ? err.message : 'Erreur d\'enregistrement.');
    btn.disabled = false;
  }
});

$('btn-test').addEventListener('click', async () => {
  const serverUrl = $('opt-server-url').value.trim().replace(/\/+$/, '');
  const result = $('test-result');
  result.dataset.tone = '';
  result.className = 'test-result';
  result.textContent = 'Test en cours…';
  const btn = $('btn-test');
  btn.disabled = true;
  try {
    const granted = await ensureServerAccess(serverUrl);
    if (!granted) {
      result.dataset.tone = 'is-error';
      result.className = 'test-result';
      result.textContent = 'Accès au serveur refusé (permission d\'hôte).';
      return;
    }
    const resp = await fetch(`${serverUrl}/health/`);
    const ok = resp.ok;
    result.dataset.tone = ok ? 'is-ok' : 'is-error';
    result.className = 'test-result';
    result.textContent = ok ? 'Serveur joignable.' : `Réponse inattendue (${resp.status}).`;
  } catch {
    result.dataset.tone = 'is-error';
    result.className = 'test-result';
    result.textContent = 'Serveur injoignable depuis l\'extension (permissions d\'hôtes ?).';
  } finally {
    btn.disabled = false;
  }
});

load();