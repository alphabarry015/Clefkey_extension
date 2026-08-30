/* Popup — état, connexion, verrouillage. */

import { DEFAULT_SERVER_URL, MSG } from '../lib/constants.js';
import { send } from '../lib/messaging.js';
import { getPrefs, savePrefs } from '../lib/session.js';

const $ = (id) => document.getElementById(id);

const screens = {
  login: $('screen-login'),
  unlock: $('screen-unlock'),
  main: $('screen-main'),
  generator: $('screen-generator'),
};

let toastTimer = null;

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolvedTheme() {
  const stored = document.documentElement.dataset.theme;
  if (stored === 'light' || stored === 'dark') return stored;
  return systemTheme();
}

function applyTheme(theme) {
  const next = theme === 'light' || theme === 'dark' ? theme : systemTheme();
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const label = next === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
  document.querySelectorAll('.btn-theme').forEach((btn) => {
    btn.title = next === 'dark' ? 'Mode clair' : 'Mode sombre';
    btn.setAttribute('aria-label', label);
  });
}

async function initTheme() {
  const prefs = await getPrefs();
  applyTheme(prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : systemTheme());
  document.querySelectorAll('.btn-theme').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      const latest = await getPrefs();
      await savePrefs({ ...latest, theme: next });
    });
  });
}

function showToast(message, tone = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast${tone === 'error' ? ' is-error' : tone === 'success' ? ' is-success' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  if (button.classList.contains('gen-run')) return;
  if (busy && label) button.dataset.label = button.textContent;
  if (busy) button.textContent = label;
  else if (button.dataset.label) button.textContent = button.dataset.label;
}

function openVault() {
  chrome.tabs.create({ url: DEFAULT_SERVER_URL });
  window.close();
}

function renderState(state) {
  if (!state.locked) {
    $('main-user').textContent = state.user && state.user.email ? state.user.email : 'Déverrouillé';
    showScreen('main');
    loadAccounts();
    return;
  }
  if (state.hasSession) {
    const who = state.email ? state.email : 'Session verrouillée';
    $('unlock-who').textContent = who;
    $('unlock-master').value = '';
    showScreen('unlock');
    $('unlock-master').focus();
    return;
  }
  $('login-email').value = '';
  $('login-master').value = '';
  showScreen('login');
  $('login-email').focus();
}

async function refreshState() {
  const res = await send(MSG.GET_STATE);
  if (res.ok) renderState(res);
  else showToast(res.message || 'Impossible de charger Clefkey.', 'error');
}

let activeTab = null;

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tabs && tabs[0] ? tabs[0] : null;
  return activeTab;
}

function renderAccounts(entries) {
  const el = $('accounts');
  el.textContent = '';
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = 'Ouvrez une page web pour remplir un formulaire.';
    el.appendChild(p);
    return;
  }
  if (entries.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = 'Aucun identifiant pour ce site.';
    el.appendChild(p);
    return;
  }
  for (const entry of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'account';
    btn.dataset.id = entry.id;
    const title = document.createElement('span');
    title.className = 'account-title';
    title.textContent = entry.title || entry.username || 'Identifiant';
    const user = document.createElement('span');
    user.className = 'account-user';
    user.textContent = entry.username;
    btn.appendChild(title);
    btn.appendChild(user);
    btn.addEventListener('click', async () => {
      const res = await send(MSG.FILL_ACTIVE_TAB, { entryId: entry.id, tabId: activeTab.id, url: activeTab.url });
      if (res.ok) {
        window.close();
      } else {
        showToast(res.message || 'Remplissage impossible.', 'error');
      }
    });
    el.appendChild(btn);
  }
}

async function loadAccounts() {
  const el = $('accounts');
  el.textContent = '';
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = 'Chargement…';
  el.appendChild(p);
  $('main-host').textContent = '';
  await getActiveTab();
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) {
    $('main-host').textContent = activeTab ? activeTab.url : '';
    renderAccounts([]);
    return;
  }
  $('main-host').textContent = new URL(activeTab.url).hostname;
  const res = await send(MSG.GET_ENTRIES_FOR_DOMAIN, { url: activeTab.url });
  if (res.ok) {
    renderAccounts(res.entries || []);
  } else {
    el.textContent = '';
    const err = document.createElement('p');
    err.className = 'placeholder';
    err.textContent = res.message || 'Impossible de charger les identifiants.';
    el.appendChild(err);
  }
}

async function runUnlock(form) {
  const email = ($('login-email').value || '').trim();
  const master = $('login-master').value;
  const btn = $('btn-login');
  setBusy(btn, true, 'Déverrouillage…');
  const res = await send(MSG.UNLOCK, { email, master });
  setBusy(btn, false);
  if (res.ok) {
    renderState(await send(MSG.GET_STATE));
  } else {
    showToast(res.message || 'Identifiants incorrects.', 'error');
    $('login-master').value = '';
    $('login-master').focus();
  }
}

async function runUnlockExisting() {
  const master = $('unlock-master').value;
  const btn = $('btn-unlock');
  setBusy(btn, true, 'Déverrouillage…');
  const res = await send(MSG.UNLOCK, { master });
  setBusy(btn, false);
  if (res.ok) {
    renderState(await send(MSG.GET_STATE));
  } else {
    showToast(res.message || 'Mot de passe maître incorrect.', 'error');
    $('unlock-master').value = '';
    $('unlock-master').focus();
  }
}

$('form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  runUnlock();
});
$('form-unlock').addEventListener('submit', (e) => {
  e.preventDefault();
  runUnlockExisting();
});

$('btn-lock').addEventListener('click', async () => {
  await send(MSG.LOCK);
  renderState(await send(MSG.GET_STATE));
});

$('btn-reload').addEventListener('click', () => loadAccounts());

$('btn-unlock-logout').addEventListener('click', async () => {
  await send(MSG.LOGOUT);
  renderState(await send(MSG.GET_STATE));
});

$('btn-login-vault').addEventListener('click', () => openVault());
$('btn-open-vault').addEventListener('click', () => openVault());

// ── Générateur ───────────────────────────────────────────

const CLIPBOARD_CLEAR_MS = 30000;
let clipTimer = null;
let clipValue = '';

function scheduleClipboardClear(text) {
  clipValue = text;
  clearTimeout(clipTimer);
  clipTimer = setTimeout(async () => {
    try {
      const now = await navigator.clipboard.readText();
      if (now === clipValue) await navigator.clipboard.writeText('');
    } catch { /* lecture presse-papiers indisponible */ }
    clipValue = '';
  }, CLIPBOARD_CLEAR_MS);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    scheduleClipboardClear(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.value = '';
    ta.remove();
    if (ok) scheduleClipboardClear(text);
    return ok;
  }
}

function clamp(value, min, max, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function setGenStatus(el, text, tone = 'error') {
  el.textContent = text;
  el.hidden = false;
  el.classList.toggle('is-safe', tone === 'safe');
}

function bindGenerator() {
  const modeTabs = Array.from(document.querySelectorAll('.gen-tab'));
  const panels = Array.from(document.querySelectorAll('.gen-panel'));
  const setMode = (mode) => {
    modeTabs.forEach((tab) => {
      const active = tab.dataset.genMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.genPanel !== mode; });
  };
  modeTabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.genMode)));

  const lengthInput = $('gen-length');
  const ppCount = $('gen-pp-count');
  const bindStepper = (minus, plus, input, min, max, fallback) => {
    minus.addEventListener('click', () => { input.value = String(clamp(input.value, min, max, fallback) - 1); });
    plus.addEventListener('click', () => { input.value = String(clamp(input.value, min, max, fallback) + 1); });
    input.addEventListener('change', () => { input.value = String(clamp(input.value, min, max, fallback)); });
  };
  bindStepper($('gen-length-minus'), $('gen-length-plus'), lengthInput, 8, 64, 20);
  bindStepper($('gen-pp-minus'), $('gen-pp-plus'), ppCount, 3, 10, 5);

  const genBtn = $('btn-gen-password');
  const valueInput = $('gen-password-value');
  const copyBtn = $('btn-gen-copy');
  const status = $('gen-password-status');

  const saveBox = $('gen-save');
  const saveSite = $('gen-save-site');
  const saveUser = $('gen-save-user');
  const saveBtn = $('btn-gen-save');
  let saveUrl = '';

  const hideSave = () => {
    if (saveBox) saveBox.hidden = true;
    if (saveUser) saveUser.value = '';
    saveUrl = '';
  };

  const showSave = async () => {
    if (!saveBox) return;
    await getActiveTab();
    const url = activeTab && /^https?:/.test(activeTab.url || '') ? activeTab.url : '';
    saveUrl = url;
    try {
      saveSite.textContent = url ? new URL(url).hostname : 'Ouvrez le site dans un onglet.';
    } catch {
      saveSite.textContent = 'Ouvrez le site dans un onglet.';
    }
    saveBox.hidden = false;
  };

  const resetOutput = () => {
    valueInput.value = '';
    copyBtn.hidden = true;
    status.hidden = true;
    hideSave();
  };

  genBtn.addEventListener('click', async () => {
    resetOutput();
    setBusy(genBtn, true, 'Vérification…');
    status.hidden = false;
    status.classList.remove('is-safe');
    status.textContent = 'Vérification en cours…';
    const res = await send(MSG.GENERATE_PASSWORD, { length: lengthInput.value });
    setBusy(genBtn, false);
    if (res.ok) {
      valueInput.value = res.password;
      copyBtn.hidden = false;
      setGenStatus(status, 'Mot de passe sûr. Absent des fuites connues.', 'safe');
      await showSave();
    } else {
      setGenStatus(status, res.message || 'Génération impossible.');
    }
  });

  saveBtn.addEventListener('click', async () => {
    const password = valueInput.value;
    const username = (saveUser.value || '').trim();
    if (!password) return;
    setBusy(saveBtn, true, 'Enregistrement…');
    const res = await send(MSG.SAVE_ENTRY, {
      title: saveUrl ? new URL(saveUrl).hostname : '',
      username,
      password,
      url: saveUrl,
    });
    setBusy(saveBtn, false);
    if (res.ok) {
      hideSave();
      showToast('Enregistré dans Clefkey.', 'success');
    } else {
      showToast(res.message || 'Enregistrement impossible.', 'error');
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (valueInput.value && await copyText(valueInput.value)) {
      showToast('Mot de passe copié.', 'success');
    }
  });

  const ppBtn = $('btn-gen-pp');
  const ppValue = $('gen-pp-value');
  const ppCopy = $('btn-pp-copy');

  ppBtn.addEventListener('click', async () => {
    ppValue.value = '';
    ppCopy.hidden = true;
    setBusy(ppBtn, true, 'Génération…');
    const res = await send(MSG.GENERATE_PASSPHRASE, { count: ppCount.value });
    setBusy(ppBtn, false);
    if (res.ok) {
      ppValue.value = res.passphrase;
      ppCopy.hidden = false;
    } else {
      showToast(res.message || 'Génération impossible.', 'error');
    }
  });

  ppCopy.addEventListener('click', async () => {
    if (ppValue.value && await copyText(ppValue.value)) {
      showToast('Passphrase copiée.', 'success');
    }
  });
}

$('btn-generator').addEventListener('click', () => {
  resetGeneratorOutputs();
  showScreen('generator');
});
$('btn-gen-back').addEventListener('click', () => showScreen('main'));

let generatorBound = false;
function resetGeneratorOutputs() {
  if (!generatorBound) return;
  const status = $('gen-password-status');
  $('gen-password-value').value = '';
  $('btn-gen-copy').hidden = true;
  status.hidden = true;
  $('gen-pp-value').value = '';
  $('btn-pp-copy').hidden = true;
  const saveBox = $('gen-save');
  if (saveBox) saveBox.hidden = true;
  const saveUser = $('gen-save-user');
  if (saveUser) saveUser.value = '';
}
if (!generatorBound) {
  bindGenerator();
  generatorBound = true;
}

initTheme();
refreshState();