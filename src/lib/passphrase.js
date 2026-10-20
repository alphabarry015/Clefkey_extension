/**
 * Passphrase de déverrouillage — formatage auto + validation (min. 3 mots).
 * Aligné sur le coffre web (frontend/js/passphrase.js).
 */

export const PASSPHRASE_MIN_WORDS = 3;

export function formatPassphraseInput(raw) {
  const text = String(raw ?? '');
  let out = '';
  let capitalizeNext = true;
  for (const ch of text) {
    if (capitalizeNext && /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(ch)) {
      out += ch.toLocaleUpperCase('fr-FR');
      capitalizeNext = false;
      continue;
    }
    out += ch;
    if (ch === '.') capitalizeNext = true;
  }
  return out;
}

export function countPassphraseWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function applyPassphraseFormatting(el) {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value;
  const after = formatPassphraseInput(before);
  if (before === after) return;
  el.value = after;
  if (typeof start === 'number' && typeof end === 'number') {
    const delta = after.length - before.length;
    try {
      el.setSelectionRange(Math.max(0, start + delta), Math.max(0, end + delta));
    } catch {
      /* ignore */
    }
  }
}

export function validatePassphrase(passphrase) {
  const formatted = formatPassphraseInput(passphrase || '');
  if (!formatted.trim()) return 'La passphrase est requise';
  if (countPassphraseWords(formatted) < PASSPHRASE_MIN_WORDS) {
    return `Minimum ${PASSPHRASE_MIN_WORDS} mots`;
  }
  if (!/^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ]/.test(formatted.trim())) {
    return 'La passphrase doit commencer par une majuscule';
  }
  return null;
}

export function hasPassphraseMaterial(authMaterial) {
  return Boolean(
    authMaterial?.passphrase_salt && authMaterial?.encrypted_vault_key_passphrase,
  );
}
