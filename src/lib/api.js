/* Client HTTP vers l'API Clefkey (Django). Toutes les méthodes lèvent Error. */

function formatApiError(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = payload.detail ?? payload.error ?? payload.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.msg === 'string') return item.msg;
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(' ') || fallback;
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return fallback;
}

async function request(apiBase, path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  let resp;
  try {
    resp = await fetch(`${apiBase}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Impossible de joindre le serveur (${apiBase}${path}). Vérifiez que le serveur tourne et que la permission d'accès à cette URL est accordée (Options → Serveur).`,
    );
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    const message = formatApiError(err, `Erreur serveur (${resp.status})`);
    const e = new Error(message);
    e.status = resp.status;
    throw e;
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export const api = {
  login(apiBase, email, authVerifierB64) {
    return request(apiBase, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, auth_verifier: authVerifierB64 }),
    });
  },

  getProfile(apiBase, token) {
    return request(apiBase, '/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  getEntries(apiBase, token) {
    return request(apiBase, '/vault/entries', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  createEntry(apiBase, token, encryptedDataB64) {
    return request(apiBase, '/vault/entries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ encrypted_data: encryptedDataB64 }),
    });
  },

  updateEntry(apiBase, token, id, encryptedDataB64) {
    return request(apiBase, `/vault/entries/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ encrypted_data: encryptedDataB64 }),
    });
  },

  deleteEntry(apiBase, token, id) {
    return request(apiBase, `/vault/entries/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};