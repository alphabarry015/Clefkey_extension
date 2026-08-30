/* Content script — autofill Clefkey.
 *
 * Monde isolé : aucun accès aux variables de la page, communication avec le
 * background par messages typés. Badge + liste des comptes dans un Shadow DOM
 * fermé (styles isolés de la page). Les identifiants ne sont injectés qu'à la
 * demande explicite de l'utilisateur.
 *
 * NB : les content scripts MV3 ne supportent pas les imports ES ; le script est
 * volontairement autonome (MSG + send dupliqués depuis lib/).
 */

const MSG = {
  GET_STATE: 'get-state',
  UNLOCK: 'unlock',
  GET_ENTRIES_FOR_DOMAIN: 'get-entries-for-domain',
  GENERATE_PASSWORD: 'generate-password',
  SAVE_ENTRY: 'save-entry',
  OFFER_CAPTURE: 'offer-capture',
  GET_PENDING_CAPTURE: 'get-pending-capture',
  DISMISS_CAPTURE: 'dismiss-capture',
  CONFIRM_CAPTURE: 'confirm-capture',
};

function send(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({ ok: false, message: lastError.message || 'Connexion interrompue.' });
          return;
        }
        resolve(response || { ok: false, message: 'Aucune réponse.' });
      });
    } catch (err) {
      resolve({ ok: false, message: err && err.message ? err.message : 'Connexion interrompue.' });
    }
  });
}

// ── Détection des champs (partagée badge + remplissage) ─

/** Score d'un champ comme champ de login (0 = non pertinent). */
function loginFieldScore(input) {
  if (!input || input.disabled || input.type === 'hidden') return 0;
  const t = (input.type || '').toLowerCase();
  if (t === 'password') return 3;
  if (t === 'email') return 2;
  if (t === 'text' || t === 'tel' || t === 'username' || t === 'search') {
    const hint = `${input.name || ''} ${input.id || ''} ${input.getAttribute('autocomplete') || ''} ${input.placeholder || ''}`.toLowerCase();
    if (/(user|email|e-mail|login|identif|account|mail|tel|phone)/.test(hint)) return 2;
  }
  return 0;
}

function getLoginFields() {
  const out = [];
  for (const input of document.querySelectorAll('input')) {
    const score = loginFieldScore(input);
    if (score > 0) out.push({ input, score });
  }
  return out;
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function pickField() {
  const candidates = getLoginFields().filter((f) => isVisible(f.input));
  if (candidates.length === 0) return null;
  const focused = document.activeElement;
  const focusedMatch = candidates.find((f) => f.input === focused);
  if (focusedMatch) return focusedMatch.input;
  const bestScore = Math.max(...candidates.map((f) => f.score));
  let best = candidates.filter((f) => f.score === bestScore);
  if (bestScore === 2) {
    const inPasswordForm = best.find((f) => f.input.form && f.input.form.querySelector('input[type="password"]'));
    if (inPasswordForm) return inPasswordForm.input;
  }
  return best[best.length - 1].input;
}

// ── Remplissage ────────────────────────────────────────

function findUsernameField(passwordField) {
  const form = passwordField.form;
  const isCandidate = (i) => {
    if (!i || i === passwordField || i.disabled || i.type === 'hidden') return false;
    const t = (i.type || '').toLowerCase();
    return t === 'text' || t === 'email' || t === 'tel' || t === 'username';
  };
  const hint = (i) => `${i.name || ''} ${i.id || ''} ${i.getAttribute('autocomplete') || ''}`.toLowerCase();
  if (form) {
    const candidates = Array.from(form.querySelectorAll('input')).filter(isCandidate);
    const byHint = candidates.filter((c) => /user|email|login|identif|e-mail/.test(hint(c)));
    if (byHint.length) return byHint[0];
    if (candidates.length) return candidates[0];
  }
  const all = Array.from(document.querySelectorAll('input')).filter(isCandidate);
  const byHint = all.filter((c) => /user|email|login|identif|e-mail/.test(hint(c)));
  return (byHint.length ? byHint : all)[0] || null;
}

function setNativeValue(element, value) {
  if (!element) return;
  const proto = Object.getPrototypeOf(element);
  const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const ownSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  if (protoSetter && ownSetter && ownSetter !== protoSetter) {
    protoSetter.call(element, value);
  } else if (protoSetter) {
    protoSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillForm(username, password, target, submit) {
  const isPassword = (target.type || '').toLowerCase() === 'password';
  if (isPassword) {
    const userField = findUsernameField(target);
    setNativeValue(userField, username);
    setNativeValue(target, password);
    target.focus();
    if (submit && target.form) {
      setTimeout(() => {
        if (!target.form.checkValidity || target.form.checkValidity()) {
          target.form.submit();
        }
      }, 150);
    }
    return;
  }
  // Login en deux étapes : seul le champ e-mail/identifiant est affiché.
  setNativeValue(target, username);
  target.focus();
}

// Remplissage demandé depuis le popup (message du background). Le listener est
// enregistré à chaque exécution du script, indépendamment du badge : le
// remplissage fonctionne même si le badge n'a pas pu être initialisé, ou après
// un rechargement de l'extension sur un onglet déjà ouvert.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ck-fill') return false;
  if (!sender || sender.id !== chrome.runtime.id) return false;
  const field = pickField();
  if (!field) {
    sendResponse({ ok: false, message: 'Aucun formulaire de connexion.' });
    return false;
  }
  fillForm(message.entry.username, message.entry.password, field, false);
  sendResponse({ ok: true });
  return false;
});

// Drapeau sur le `window` du monde isolé (partagé entre l'injection du manifeste
// et l'injection à la demande via executeScript). Contrairement à un attribut
// DOM, il est recréé après un rechargement de l'extension, ce qui permet de
// ré-initialiser proprement le badge sur un onglet déjà ouvert.
if (window.top === window.self && !window.__clefkeyReady) {
  window.__clefkeyReady = true;
  try {
    initContentScript();
    initCaptureOffer();
  } catch (err) {
    window.__clefkeyReady = false;
    throw err;
  }
}

function initContentScript() {
  const host = document.createElement('div');
  host.setAttribute('data-clefkey-extension', '');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = buildTemplate();

  const badge = shadow.querySelector('.ck-badge');
  const panel = shadow.querySelector('.ck-panel');
  const listEl = shadow.querySelector('.ck-list');
  const hostEl = shadow.querySelector('.ck-host');
  const footEl = shadow.querySelector('.ck-foot');
  const submitBtn = shadow.querySelector('.ck-submit');
  const saveBtn = shadow.querySelector('.ck-save');
  const genBtn = shadow.querySelector('.ck-gen');

  let currentField = null;
  let entries = [];
  let panelOpen = false;
  let pendingSave = null;
  let badgeTimer = null;
  let repositionInterval = null;

  document.documentElement.appendChild(host);

  // ── Positionnement du badge ────────────────────────────

  /** Boucle de recalage : active uniquement quand un champ est ciblé. */
  function ensureInterval() {
    if (repositionInterval) return;
    repositionInterval = setInterval(() => {
      if (!currentField) {
        clearInterval(repositionInterval);
        repositionInterval = null;
        return;
      }
      reposition();
    }, 1000);
  }

  /** Recalage différé après mutations du DOM (évite un scan à chaque mutation). */
  function scheduleBadgeCheck() {
    if (badgeTimer) return;
    badgeTimer = setTimeout(() => {
      badgeTimer = null;
      const f = currentField;
      if (!f || !isVisible(f) || pickField() !== f) positionBadge();
    }, 200);
  }

  function positionBadge() {
    const field = currentField || pickField();
    currentField = field;
    if (!field) {
      host.style.display = 'none';
      closePanel();
      return;
    }
    ensureInterval();
    const rect = field.getBoundingClientRect();
    const hasValue = Boolean(field.value);
    if (hasValue && !pendingSave) {
      host.style.display = 'none';
      closePanel();
      return;
    }
    host.style.display = 'block';
    host.style.top = `${rect.top + rect.height / 2}px`;
    host.style.left = `${rect.right + 6}px`;
  }

  function reposition() {
    if (!currentField) return;
    const rect = currentField.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      currentField = null;
      positionBadge();
      return;
    }
    host.style.top = `${rect.top + rect.height / 2}px`;
    host.style.left = `${rect.right + 6}px`;
    if (currentField.value && !pendingSave) {
      host.style.display = 'none';
      closePanel();
    } else {
      host.style.display = 'block';
    }
  }

  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition);
  document.addEventListener('focusin', reposition, true);
  document.addEventListener('input', (e) => {
    if (e.target === currentField) reposition();
  }, true);

  new MutationObserver(scheduleBadgeCheck).observe(
    document.documentElement,
    { childList: true, subtree: true },
  );

  // ── Panneau des comptes ────────────────────────────────

  function openPanel() {
    panel.hidden = false;
    panelOpen = true;
    listEl.textContent = '';
    listEl.classList.add('is-loading');
    listEl.textContent = 'Chargement…';
    submitBtn.hidden = true;
    saveBtn.hidden = true;
    pendingSave = null;
    footEl.textContent = '';
    hostEl.textContent = location.hostname;
    loadEntries();
  }

  function closePanel() {
    panel.hidden = true;
    panelOpen = false;
    saveBtn.hidden = true;
    pendingSave = null;
  }

  async function loadEntries() {
    const res = await send(MSG.GET_ENTRIES_FOR_DOMAIN, { url: location.href });
    if (!res.ok) {
      listEl.classList.remove('is-loading');
      if (res.code === 'NOT_UNLOCKED') {
        listEl.textContent = 'Clefkey est verrouillé. Ouvrez l\'extension pour continuer.';
        submitBtn.hidden = true;
      } else {
        listEl.textContent = res.message || 'Impossible de charger les identifiants.';
        submitBtn.hidden = true;
      }
      return;
    }
    entries = res.entries || [];
    renderEntries();
  }

  function renderEntries() {
    listEl.classList.remove('is-loading');
    listEl.textContent = '';
    if (entries.length === 0) {
      listEl.textContent = 'Aucun identifiant pour ce site.';
      submitBtn.hidden = true;
      footEl.textContent = '';
      return;
    }
    for (const entry of entries) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ck-item';
      item.dataset.id = entry.id;
      const title = document.createElement('span');
      title.className = 'ck-item-title';
      title.textContent = entry.title || entry.username || 'Identifiant';
      const user = document.createElement('span');
      user.className = 'ck-item-user';
      user.textContent = entry.username;
      item.appendChild(title);
      item.appendChild(user);
      item.addEventListener('click', () => fillEntry(entry));
      listEl.appendChild(item);
    }
    footEl.textContent = '';
    updateSubmitButton();
  }

  // ── Remplissage ────────────────────────────────────────

  function fillEntry(entry) {
    const field = currentField || pickField();
    if (!field) return;
    fillForm(entry.username, entry.password, field, false);
    closePanel();
  }

  function updateSubmitButton() {
    const field = currentField || pickField();
    const hasPassword = Boolean(field && (field.type || '').toLowerCase() === 'password');
    submitBtn.hidden = !(hasPassword && entries.length === 1);
    genBtn.hidden = !hasPassword;
  }

  submitBtn.addEventListener('click', () => {
    const field = currentField || pickField();
    if (!field || entries.length !== 1) return;
    fillForm(entries[0].username, entries[0].password, field, true);
    closePanel();
  });

  genBtn.addEventListener('click', async () => {
    const field = currentField || pickField();
    if (!field || (field.type || '').toLowerCase() !== 'password') return;
    genBtn.disabled = true;
    footEl.textContent = 'Vérification en cours…';
    const res = await send(MSG.GENERATE_PASSWORD, { length: 20 });
    genBtn.disabled = false;
    if (!res.ok) {
      footEl.textContent = res.message || 'Génération impossible.';
      return;
    }
    pendingSave = { password: res.password };
    fillGenerated(res.password, field);
    saveBtn.hidden = false;
    footEl.textContent = 'Mot de passe généré.';
  });

  saveBtn.addEventListener('click', async () => {
    if (!pendingSave) return;
    const field = currentField || pickField();
    const userField = field ? findUsernameField(field) : null;
    const username = userField && userField.value ? userField.value.trim() : '';
    if (!username) {
      footEl.textContent = 'Indiquez un identifiant.';
      return;
    }
    saveBtn.disabled = true;
    footEl.textContent = 'Enregistrement…';
    const res = await send(MSG.SAVE_ENTRY, {
      title: location.hostname,
      username,
      password: pendingSave.password,
      url: location.href,
    });
    saveBtn.disabled = false;
    if (!res.ok) {
      footEl.textContent = res.message || 'Enregistrement impossible.';
      return;
    }
    pendingSave = null;
    saveBtn.hidden = true;
    footEl.textContent = 'Enregistré dans Clefkey.';
    setTimeout(() => closePanel(), 900);
  });

  function fillGenerated(password, passwordField) {
    setNativeValue(passwordField, password);
    const form = passwordField.form;
    if (form) {
      for (const input of form.querySelectorAll('input[type="password"]')) {
        if (input !== passwordField) setNativeValue(input, password);
      }
    }
  }

  // ── Événements badge ───────────────────────────────────

  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panelOpen) closePanel();
    else openPanel();
  });
  badge.addEventListener('mousedown', (e) => e.preventDefault());

  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) closePanel();
  }, true);
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (!document.hasFocus()) closePanel();
    }, 120);
  });

  positionBadge();
}

// ── Template Shadow DOM ─────────────────────────────────

function buildTemplate() {
  return `
<style>
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  .ck-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: #111111;
    color: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .ck-badge:hover { transform: scale(1.08); }
  .ck-badge svg { width: 14px; height: 14px; }
  .ck-panel {
    position: absolute;
    top: 34px;
    left: -8px;
    width: 250px;
    max-height: 280px;
    overflow-y: auto;
    border-radius: 12px;
    background: #111111;
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ck-panel[hidden] { display: none; }
  .ck-title-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 6px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 4px;
  }
  .ck-title {
    font-weight: 700;
    font-size: 12px;
    color: #3662D7;
  }
  .ck-host {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .ck-gen {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .ck-gen[hidden] { display: none; }
  .ck-gen:hover { background: rgba(54, 98, 215, 0.3); }
  .ck-gen svg { width: 13px; height: 13px; }
  .ck-list { display: flex; flex-direction: column; gap: 4px; }
  .ck-list.is-loading {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    padding: 8px 6px;
  }
  .ck-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    width: 100%;
    padding: 7px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #ffffff;
    text-align: left;
    cursor: pointer;
  }
  .ck-item:hover { background: rgba(54, 98, 215, 0.18); }
  .ck-item-title { font-size: 12px; font-weight: 600; }
  .ck-item-user { font-size: 11px; color: rgba(255, 255, 255, 0.6); }
  .ck-submit {
    width: 100%;
    margin-top: 4px;
    padding: 7px;
    border: none;
    border-radius: 8px;
    background: #3662D7;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .ck-submit[hidden], .ck-save[hidden] { display: none; }
  .ck-submit:hover, .ck-save:hover { background: #2f58c8; }
  .ck-save {
    width: 100%;
    margin-top: 6px;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: #3662D7;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .ck-foot { font-size: 10px; color: rgba(255, 255, 255, 0.5); padding: 2px 6px; }
  @media (prefers-color-scheme: light) {
    .ck-badge { background: #ffffff; color: #1a1d26; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
    .ck-panel { background: #ffffff; color: #1a1d26; border: 1px solid #d8dce8; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
    .ck-title-row { border-bottom: 1px solid #eceef4; }
    .ck-title { color: #2f58c8; }
    .ck-host { color: rgba(26, 29, 38, 0.55); }
    .ck-gen { color: #1a1d26; }
    .ck-gen:hover { background: rgba(54, 98, 215, 0.15); }
    .ck-list.is-loading { color: rgba(26, 29, 38, 0.6); }
    .ck-item { color: #1a1d26; }
    .ck-item:hover { background: rgba(54, 98, 215, 0.12); }
    .ck-item-user { color: rgba(26, 29, 38, 0.6); }
    .ck-submit, .ck-save { background: #3662D7; color: #ffffff; }
    .ck-foot { color: rgba(26, 29, 38, 0.5); }
  }
</style>
<button type="button" class="ck-badge" title="Clefkey" aria-label="Remplir avec Clefkey">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
</button>
<div class="ck-panel" hidden>
  <div class="ck-title-row">
    <span class="ck-title">Clefkey</span>
    <span class="ck-host"></span>
    <button type="button" class="ck-gen" title="Générer un mot de passe" aria-label="Générer un mot de passe" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
    </button>
  </div>
  <div class="ck-list"></div>
  <button type="button" class="ck-submit" hidden>Remplir et envoyer</button>
  <button type="button" class="ck-save" hidden>Enregistrer</button>
  <div class="ck-foot"></div>
</div>
`;
}

// ── Proposition d'enregistrement après inscription ───────

const SIGNUP_RE = /sign[\s-]?up|signup|register|registration|inscription|inscrire|cr[eé]er?\s*(un\s*)?compte|create[\s-]?account|join|rejoindre|nouveau\s*compte|ouvrir\s*un\s*compte/;
const LOGIN_RE = /connexion|connecter|connectez|log[\s-]?in|sign[\s-]?in|signin|s['’ ]identifier|se\s+connecter|already\s+have/;

function isVaultHost() {
  return /(^|\.)clefkey\.vercel\.app$/i.test(location.hostname);
}

function elementText(el) {
  if (!el) return '';
  return `${el.textContent || ''} ${el.value || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('name') || ''} ${el.id || ''} ${el.className || ''}`.toLowerCase();
}

function pageLooksLikeSignup() {
  const path = `${location.pathname} ${location.hash} ${document.title || ''}`.toLowerCase();
  if (LOGIN_RE.test(path) && !SIGNUP_RE.test(path)) return false;
  return SIGNUP_RE.test(path);
}

function formLooksLikeSignup(form) {
  if (!form) return false;
  const passwords = Array.from(form.querySelectorAll('input[type="password"]')).filter((el) => isVisible(el));
  if (passwords.some((el) => (el.getAttribute('autocomplete') || '').toLowerCase() === 'new-password')) return true;
  if (passwords.length >= 2) return true;
  return SIGNUP_RE.test(elementText(form));
}

function isSignupSubmit(el, form) {
  if (!el || el.closest('[data-clefkey-capture]')) return false;
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'password' || type === 'email' || type === 'text') return false;
  const text = elementText(el);
  if (LOGIN_RE.test(text) && !SIGNUP_RE.test(text)) return false;
  if (SIGNUP_RE.test(text)) return true;
  return pageLooksLikeSignup() || formLooksLikeSignup(form);
}

function credentialsFromForm(form) {
  const scope = form || document;
  const passwords = Array.from(scope.querySelectorAll('input[type="password"]')).filter((el) => isVisible(el) && el.value);
  if (passwords.length === 0) return null;
  const passwordField = passwords[passwords.length - 1];
  const userField = findUsernameField(passwordField);
  const username = userField && userField.value ? userField.value.trim() : '';
  const password = passwordField.value;
  if (!username || !password) return null;
  return {
    title: location.hostname,
    username,
    password,
    url: location.href,
  };
}

function sameSite(url) {
  try {
    return new URL(url).hostname === location.hostname;
  } catch {
    return false;
  }
}

function initCaptureOffer() {
  if (isVaultHost() || window.__clefkeyCapture) return;
  window.__clefkeyCapture = true;

  const host = document.createElement('div');
  host.setAttribute('data-clefkey-capture', '');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
<style>
  :host { all: initial; }
  .wrap {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483646;
    width: 300px;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #fff;
  }
  .card {
    padding: 14px;
    border-radius: 12px;
    background: #111;
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 32px rgba(0,0,0,0.45);
  }
  .card[hidden] { display: none; }
  h2 { margin: 0 0 6px; font-size: 14px; }
  .meta { margin: 0 0 10px; font-size: 12px; color: rgba(255,255,255,0.65); word-break: break-all; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .field span { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); text-transform: uppercase; }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 8px;
    background: #000;
    color: #fff;
    font-size: 13px;
  }
  .row { display: flex; gap: 8px; }
  .btn {
    flex: 1;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: #3662D7;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.18); }
  .status { margin: 8px 0 0; font-size: 11px; color: rgba(255,255,255,0.6); }
  .unlock[hidden], .ask[hidden] { display: none; }
  @media (prefers-color-scheme: light) {
    .card { background: #fff; color: #1a1d26; border-color: #d8dce8; box-shadow: 0 12px 32px rgba(0,0,0,0.12); }
    .meta { color: #5c6378; }
    .field span { color: #5c6378; }
    input { background: #f0f2f7; color: #1a1d26; border-color: #d8dce8; }
    .btn-ghost { color: #1a1d26; border-color: #d8dce8; }
    .status { color: #5c6378; }
  }
</style>
<div class="wrap">
  <div class="card" hidden>
    <h2>Enregistrer ce compte dans Clefkey ?</h2>
    <p class="meta"></p>
    <div class="ask">
      <div class="row">
        <button type="button" class="btn" data-act="accept">Enregistrer</button>
        <button type="button" class="btn btn-ghost" data-act="dismiss">Ignorer</button>
      </div>
    </div>
    <form class="unlock" hidden>
      <label class="field" data-email-field>
        <span>E-mail du coffre</span>
        <input type="email" name="email" autocomplete="username" />
      </label>
      <label class="field">
        <span>Mot de passe maître</span>
        <input type="password" name="master" autocomplete="current-password" />
      </label>
      <div class="row">
        <button type="submit" class="btn">Déverrouiller</button>
        <button type="button" class="btn btn-ghost" data-act="dismiss">Ignorer</button>
      </div>
    </form>
    <p class="status" hidden></p>
  </div>
</div>`;
  document.documentElement.appendChild(host);

  const card = shadow.querySelector('.card');
  const meta = shadow.querySelector('.meta');
  const ask = shadow.querySelector('.ask');
  const unlock = shadow.querySelector('.unlock');
  const emailField = shadow.querySelector('[data-email-field]');
  const emailInput = unlock.querySelector('input[name="email"]');
  const masterInput = unlock.querySelector('input[name="master"]');
  const status = shadow.querySelector('.status');
  let lastOfferKey = '';
  let offering = false;

  function setStatus(text) {
    status.hidden = !text;
    status.textContent = text || '';
  }

  function hideCard() {
    card.hidden = true;
    ask.hidden = false;
    unlock.hidden = true;
    emailInput.value = '';
    masterInput.value = '';
    setStatus('');
  }

  function showCard(capture) {
    meta.textContent = `${capture.title || location.hostname}\n${capture.username}`;
    card.hidden = false;
    ask.hidden = false;
    unlock.hidden = true;
    setStatus('');
  }

  async function alreadySaved(capture) {
    const res = await send(MSG.GET_ENTRIES_FOR_DOMAIN, { url: capture.url });
    if (!res.ok) return false;
    return (res.entries || []).some(
      (entry) => entry.username === capture.username && entry.password === capture.password,
    );
  }

  async function propose(capture) {
    const key = `${capture.url}|${capture.username}|${capture.password}`;
    if (offering || key === lastOfferKey) return;
    if (await alreadySaved(capture)) return;
    offering = true;
    const stored = await send(MSG.OFFER_CAPTURE, capture);
    offering = false;
    if (!stored.ok) return;
    lastOfferKey = key;
    showCard(capture);
  }

  async function accept() {
    const state = await send(MSG.GET_PENDING_CAPTURE);
    if (!state.ok || !state.capture) {
      hideCard();
      return;
    }
    if (!state.locked) {
      setStatus('Enregistrement…');
      const saved = await send(MSG.CONFIRM_CAPTURE, {});
      if (saved.ok) {
        setStatus('Enregistré dans Clefkey.');
        setTimeout(hideCard, 1200);
      } else {
        setStatus(saved.message || 'Enregistrement impossible.');
      }
      return;
    }
    ask.hidden = true;
    unlock.hidden = false;
    emailField.hidden = Boolean(state.hasSession);
    if (state.hasSession && state.email) emailInput.value = state.email;
    masterInput.focus();
  }

  unlock.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const master = masterInput.value;
    if (!master) {
      setStatus('Mot de passe maître requis.');
      return;
    }
    setStatus('Déverrouillage…');
    const saved = await send(MSG.CONFIRM_CAPTURE, { email, master });
    if (saved.ok) {
      setStatus('Enregistré dans Clefkey.');
      setTimeout(hideCard, 1200);
    } else {
      setStatus(saved.message || 'Identifiants incorrects.');
      masterInput.value = '';
      masterInput.focus();
    }
  });

  shadow.querySelectorAll('[data-act="accept"]').forEach((btn) => {
    btn.addEventListener('click', () => accept());
  });
  shadow.querySelectorAll('[data-act="dismiss"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await send(MSG.DISMISS_CAPTURE);
      lastOfferKey = '';
      hideCard();
    });
  });

  document.addEventListener('submit', (e) => {
    if (e.target.closest && e.target.closest('[data-clefkey-capture]')) return;
    const trigger = e.submitter || null;
    if (!isSignupSubmit(trigger, e.target) && !formLooksLikeSignup(e.target) && !pageLooksLikeSignup()) return;
    if (trigger && LOGIN_RE.test(elementText(trigger)) && !SIGNUP_RE.test(elementText(trigger))) return;
    const capture = credentialsFromForm(e.target);
    if (capture) void propose(capture);
  }, true);

  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, input[type="submit"], [role="button"]');
    if (!target) return;
    const form = target.form || target.closest('form');
    if (!isSignupSubmit(target, form)) return;
    const capture = credentialsFromForm(form);
    if (capture) void propose(capture);
  }, true);

  void send(MSG.GET_PENDING_CAPTURE).then((res) => {
    if (res.ok && res.capture && sameSite(res.capture.url)) showCard(res.capture);
  });
}