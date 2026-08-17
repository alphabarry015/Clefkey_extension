# Clefkey_extension

Extension navigateur pour le coffre [Clefkey](https://github.com/alphabarry015/Gardefort) : **autofill**, **générateur** et **capture** d'identifiants.

L'extension n'est pas un coffre autonome : c'est un **client** du serveur Clefkey. Elle récupère les blobs via l'API et les **déchiffre localement** avec le mot de passe maître. Aucune donnée en clair ne transite par le serveur.

## État

| Jalon | Contenu | Statut |
|-------|---------|--------|
| 1 | Socle & session (manifestes, background, connexion, déchiffrage, popup, options) | ✅ implémenté |
| 2 | Autofill (détection de formulaires, proposition, injection) | ⏳ à venir |
| 3 | Générateur (bouton + popup, logique partagée) | ⏳ à venir |
| 4 | Capture (détection de soumission, création d'entrée) | ⏳ à venir |
| 5 | Polissage & sécurité (auto-lock, revue, stores) | ⏳ à venir |

Spec complète : [`docs/EXTENSION-NAVIGATEUR.md`](./docs/EXTENSION-NAVIGATEUR.md).

## Structure

```
src/
├── manifest.chromium.json   # Chromium / Edge / Chrome (MV3)
├── manifest.firefox.json    # Firefox (MV3, gecko.id, FF 121+)
├── background/              # Service worker (MV3, module) : session, API, crypto
├── content/                 # (réservé jalon 2 : autofill/capture)
├── lib/                     # crypto.js, api.js, session.js, constants.js
├── popup/                   # Déverrouillage + état de session
├── options/                 # Serveur (URL), auto-verrouillage, thème
├── vendor/                  # hash-wasm (Argon2id) — vendored, pas de CDN
└── icons/                   # icon.svg (source) → PNG générés au build
scripts/
├── build.mjs                # Copie src/ → dist/ + manifest selon la cible
└── icons.mjs                # Rasteriseur PNG pur Node (zéro dépendance native)
```

## Build

```bash
npm install
npm run build          # → dist/ (Chromium MV3)
npm run build:firefox  # → dist/ (Firefox MV3)
```

Le `dist/` produit est chargeable directement via **Charger l'extension non empaquetée** (chrome://extensions) ou `about:debugging#/runtime/this-firefox` (Firefox).

## Démarrage rapide

1. Lancez le serveur Clefkey local (`python manage.py runserver` → `http://127.0.0.1:8000`).
2. `npm run build` puis chargez `dist/`.
3. Options → **Tester la connexion** : la permission d'accès au serveur (HTTPS
   en production, `localhost` en développement) est demandée automatiquement.
4. Ouvrez le popup et connectez-vous avec le compte Clefkey existant.

> L'URL du serveur est configurable (Options) et doit être en **HTTPS** hors
> développement. Les `host_permissions` couvrent `https://*.vercel.app/*`
> (serveur de production) ; `localhost`/`127.0.0.1` sont en
> `optional_host_permissions` (développement) et accordés à la volée.

## Sécurité

- Mot de passe maître **jamais stocké** : seulement en mémoire pendant la dérivation.
- JWT + `authMaterial` (blobs chiffrés) dans `storage.session` — effacés à la fermeture du navigateur, invisibles aux content scripts.
- Clés déchiffrées (`vaultKey`…) **mémoire du background uniquement** ; perdues au verrouillage, à l'inactivité (auto-lock, défaut 5 min) ou à la mort du service worker.
- Dérivation Argon2id m=64 MiB, t=3, p=4 — identique au coffre (interopérable).

## Compatibilité

- **Chrome / Edge / Chromium** : Manifest V3.
- **Firefox** : Manifest V3 (ESM background) — requiert Firefox 121+.

## Notes de build

- `scripts/icons.mjs` rasterise les icônes en pur Node (encodage PNG + SDF) :
  évite `sharp`, qui n'a pas de binaire stable sur win32-arm64. Sur Linux/Windows x64,
  le résultat est identique.
- `scripts/build.mjs` remplace `cpSync` par une copie récursive manuelle :
  `cpSync` crash Node 24 sur win32-arm64.