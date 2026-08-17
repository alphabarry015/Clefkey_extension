# Clefkey_extension

Documentation du projet d'extension navigateur Clefkey.

| Fichier | Contenu |
|---------|---------|
| [`README.md`](../README.md) | Présentation du projet, structure, build, sécurité |
| [`EXTENSION-NAVIGATEUR.md`](./EXTENSION-NAVIGATEUR.md) | Spec produit (jalons, architecture, sécurité, risques) |

## Références au coffre Clefkey

L'extension réutilise la logique et les contrats du coffre (dépôt voisin) :

- `frontend/js/crypto.js` → dérivé dans `src/lib/crypto.js` (Argon2id, AES-GCM, login/unlock).
- `frontend/js/api.js` → adapté dans `src/lib/api.js`.
- `frontend/js/session.js` → adapté dans `src/lib/session.js` (`storage.session`).
- `docs/API.md` → endpoints utilisés.
- `frontend/css/theme.css` → tokens repris dans le popup et les options.