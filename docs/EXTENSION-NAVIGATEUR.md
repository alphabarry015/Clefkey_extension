# Spec — Extension navigateur Clefkey

> Statut : **brouillon — jalon 1 (socle & session) implémenté**
> Version : 0.1
> Périmètre : extension navigateur (Chromium MV3 + Firefox WebExtensions) pour le coffre Clefkey.

---

## 0. État d'avancement

| Jalon | Contenu | Statut |
|-------|---------|--------|
| 1 | Socle & session | ✅ implémenté (background, connexion, déchiffrage, popup, options) |
| 2 | Autofill | ✅ implémenté (badge, liste par domaine, injection, login 2 étapes) |
| 3 | Générateur | 🚧 en cours (popup + content, vérification HIBP) |
| 4 | Capture | ⏳ |
| 5 | Polissage & sécurité | ⏳ |

Décisions de mise en œuvre (vs brouillon) :
- **Firefox en MV3** (et non MV2) : background ESM, `gecko.strict_min_version: 121.0`.
- **Argon2 exécuté dans le service worker** (pas de Web Worker — indisponible en MV3).
  Un document `offscreen` pourra l'héberger dans une révision ultérieure.
- **Build sans bundler** : modules ESM natifs + copie de `src/` vers `dist/`.
- URL serveur **configurable dans les Options** ; les hôtes doivent être déclarés dans
  le manifeste (`host_permissions`). Voir section 7.

## 1. Objectif & positionnement

Extension de navigateur qui étend le coffre Clefkey **hors de l'onglet de l'application** :

- **Autofill** des identifiants (username / mot de passe) sur les sites enregistrés.
- **Génération** d'un mot de passe fort à la volée (mêmes règles que le Générateur du coffre).
- **Capture** : sauvegarde dans le coffre des identifiants saisis sur un site.

Positionnement : *l'extension n'est pas un coffre autonome.* Elle est un **client** du serveur
Clefkey : elle récupère les blobs via l'API et les **déchiffre localement** avec le mot de passe
maître. Aucune donnée en clair ne transite par le serveur.

## 2. Cibles

| Navigateur | Technologie | Compatibilité |
|-----------|-------------|---------------|
| Chrome / Edge / Chromium | Manifest V3 | Dès v1 |
| Firefox | WebExtensions (Manifest V2) | Dès v1 |

Stratégie : **une seule base de code**, abstraction `browser.*` (polyfill
`webextension-polyfill`), deux manifestes (MV3 Chromium, MV2/V3 Firefox).

## 3. Notions techniques existantes (à réutiliser)

Modèle crypto du coffre (ne pas réinventer) :

| Paramètre | Valeur |
|-----------|--------|
| Dérivation | Argon2id — m=65536 KiB, t=3, p=4, sortie 32 o |
| Chiffrement des entrées | AES-GCM 256, nonce 12 o |
| Sel | 16 o aléatoire (stocké côté serveur) |
| Clé de coffre | 32 o, stockée chiffrée côté serveur, déchiffrée en local |

Entrée en clair (JSON chiffré dans le blob ; `type` ∈ `login` | `api_key` | `ssh_key`) :

```json
{ "title": "…", "type": "login", "username": "…", "password": "…", "notes": "…", "url": "https://…" }
```

Endpoints API existants utilisés :

| Endpoint | Usage |
|----------|-------|
| `GET /auth/salt?email=` | Récupérer le sel pour dériver |
| `POST /auth/login` | S'authentifier → JWT (corps : `{ email, auth_verifier }`) |
| `GET /auth/me` | Profil (email, noms) |
| `GET /vault/entries` | Lister les blobs chiffrés |
| `POST /vault/entries` | Créer un blob |
| `PUT /vault/entries/<id>` | Mettre à jour un blob |
| `GET /vault/favicon?url=` | Favicon des sites (proxy serveur) |

Références : `docs/API.md`, `docs/CARTOGRAPHIE-COFFRE.md`, `frontend/js/crypto.js`.

## 4. Périmètre v1 (MVP)

### 4.1 Autofill des identifiants
- Détection de la page de connexion (heuristique : présence d'un champ mot de passe,
  `input[type=password]`, formulaires de login).
- Proposition d'autofill : badge/icône flottante à côté du champ, liste des comptes
  correspondant au domaine (match exact du `url` de l'entrée, sinon sous-domaine).
- Remplissage automatique au clic + soumission optionnelle du formulaire.
- **Hors périmètre v1** : autofill multi-facteurs, OTP, cartes de paiement.

### 4.2 Générateur de mots de passe
- Bouton « générer » dans le popup et à côté des champs de mot de passe.
- Réutilise la logique `buildPassword()` du coffre (longueur 8–64, majuscules/chiffres/
  symboles garantis, combinaison avec des mots si demandé).
- Vérification anti-fuite HIBP k-anonymity (5 premiers caractères du hash SHA-1) — même
  logique que `checkPassword()`.

### 4.3 Capture / sauvegarde
- Détection d'un formulaire de connexion/inscription avec des identifiants saisis.
- Popup « Enregistrer dans Clefkey ? » (titre du site, username, mot de passe, URL).
- Choix du projet/dossier (optionnel), création de l'entrée via `POST /vault/entries`.
- **Hors périmètre v1** : import en masse, détection de changement de mot de passe.

### 4.4 Hors périmètre v1
- Alertes de fuite (HIBP/XON) intégrées à l'extension — envisagé en v2.
- Édition/suppression d'entrées depuis l'extension (délegué au coffre).
- Synchronisation multi-comptes, gestion de conflits.

## 5. Flux utilisateur

### 5.1 Déverrouillage
1. L'utilisateur clique sur l'icône de l'extension (ou une capture/autofill est demandée).
2. Si déverrouillée → accès direct. Sinon → écran « Mot de passe maître ».
3. L'extension demande `GET /auth/salt?email=`, dérive `auth_verifier` (Argon2id),
   appelle `POST /auth/login`, reçoit le JWT, **déchiffre la clé de coffre en local**.
4. Session active : JWT + clés en mémoire de l'extension (jamais persistées en clair).

### 5.2 Autofill
1. Sur une page de login, l'extension détecte le champ mot de passe.
2. Elle charge les entrées (`GET /vault/entries`) et les déchiffre en mémoire.
3. Elle filtre par domaine et affiche une liste de comptes.
4. Au clic : injection du username/password (monde isolé du content script).

### 5.3 Capture
1. Détection de soumission (ou focus perdu) d'un formulaire avec password.
2. Bouton/popup « Enregistrer » → confirmation → `POST /vault/entries`.

## 6. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Content script (monde isolé)                                │
│  • détection formulaires, badges, injection autofill          │
└───────────────▲───────────────────────────────────────────────┘
                │ messages (chrome.runtime / browser.runtime)
┌───────────────┴───────────────────────────────────────────────┐
│  Service worker (background, MV3) / page de fond (Firefox)     │
│  • session Clefkey (JWT + clés)                                │
│  • API HTTP (fetch)                                            │
│  • crypto (Argon2id, AES-GCM)                                  │
│  • logique générateur & vérification HIBP                      │
└───────────────▲───────────────────────────────────────────────┘
                │
┌───────────────┴───────────────────────────────────────────────┐
│  Popup / Options                                               │
│  • déverrouillage, liste des comptes du domaine, générateur    │
└───────────────────────────────────────────────────────────────┘
```

- **Crypto dans le background** : Argon2id via `hash-wasm` (déjà vendorisé dans le coffre) ;
  AES-GCM via WebCrypto. Un Worker peut être nécessaire pour ne pas bloquer le service
  worker MV3 pendant la dérivation.
- **Content scripts** : monde isolé, aucun accès aux variables de la page ; communication
  par messages typés (JSON).
- **Réutilisation** : extraire `crypto.js` (Argon2/AES-GCM), `buildPassword()`,
  `checkPassword()` du front actuel dans un module partagé.

## 7. Permissions & manifeste

### Chromium (MV3)
- `storage` (préférences), `activeTab` (injection à la demande).
- `optional_host_permissions` : origine du serveur Clefkey (configurable, ex.
  `https://*.vercel.app` ou `http://127.0.0.1:8000`) + domaines des sites pour l'autofill
  (demandées au moment du besoin).
- `notifications` (facultatif : verrouillage/rappel).

### Firefox (WebExtensions)
- Équivalents via `browser.*` (polyfill).
- `browser_specific_settings.gecko.id` pour AMO.

## 8. Sécurité & confidentialité

- **Le mot de passe maître n'est jamais stocké** — seulement en mémoire pendant la dérivation.
- JWT et clé de coffre : **mémoire du background uniquement**, effacés au :
  - verrouillage manuel,
  - verrouillage automatique après inactivité (défaut : 5 min, réglable, y compris
    « à la fermeture du navigateur » via `storage.session`),
  - déconnexion.
- L'extension n'écrit **aucun secret** dans `storage.local` (préférences non sensibles
  uniquement). Le JWT peut vivre dans `storage.session` (effacé à la fermeture du navigateur).
- Les identifiants ne sont injectés qu'à la demande explicite de l'utilisateur.
- Content scripts : injection uniquement sur les pages HTTP(S), jamais sur les pages du
  navigateur (`chrome://`, etc.).
- Pas de télémétrie, pas de logs de secrets.
- Respect des contraintes de sécurité Clefkey : jamais de clés dans le dépôt public, code
  audité comme le coffre.

## 9. Intégration & état de session

- L'extension partage le **même compte** que le coffre (pas de second compte).
- Une session ouverte dans le coffre (onglet) **ne déverrouille pas** l'extension : chaque
  surface demande son propre déverrouillage (sécurité par défaut). Option v2 : liaison
  via message entre l'extension et la page du coffre si l'utilisateur l'active.
- L'extension gère les 401/expiration JWT : re-déverrouillage silencieux si le sel est
  encore dispo, sinon demande du mot de passe maître.

## 10. Design & UX

- Popup compact : verrou/état, liste des comptes du domaine actif, bouton générateur,
  accès au coffre (ouvrir dans un onglet).
- Badge (icône flottante) dans les champs de connexion, non intrusif, masqué si le champ
  a déjà une valeur.
- Icône de l'extension : état verrouillé/déverrouillé différencié.
- Thème sombre/clair aligné sur le coffre ; français par défaut (le coffre est en français).

## 11. Tests & critères d'acceptation

- **Autofill** : sur un site de test (ex. Github, Wikipédia, formulaires locaux), le
  compte correspondant au domaine est proposé et injecté correctement.
- **Générateur** : le mot de passe généré respecte longueur/jeu de caractères et n'est
  pas trouvé en fuite (HIBP).
- **Capture** : après saisie + soumission, une entrée apparaît dans le coffre (blob
  déchiffré correct).
- **Sécurité** : après verrouillage/fermeture du navigateur, plus aucun secret en mémoire
  (vérification manuelle + revue de code).
- **Compatibilité** : testé sur Chrome, Edge et Firefox (au moins une version stable).

## 12. Jalons

| # | Jalon | Livrable |
|---|-------|----------|
| 1 | Socle & session | Manifestes, background, connexion, déchiffrage, popup de verrouillage |
| 2 | Autofill | Détection de formulaires, proposition, injection |
| 3 | Générateur | Bouton + popup, logique partagée avec le coffre |
| 4 | Capture | Détection de soumission, création d'entrée |
| 5 | Polissage & sécurité | Auto-lock, revue, tests multi-navigateurs, publication (stores) |

## 13. Risques & questions ouvertes

- **Match de domaine** : critère exact de correspondance entrée ↔ site (sous-domaines,
  ports, chemins). → À trancher (défaut : domaine registrable).
- **Argon2 en service worker MV3** : coût CPU (m=64 Mo, t=3) → Worker obligatoire ; à
  valider en perf.
- **Où héberger la logique commune** : package partagé (workspace/monorepo) vs copie.
- **Permissions MV3** : `optional_host_permissions` demandées dynamiquement — validation
  de l'UX du navigateur (Chrome demande une confirmation).
- **Soumission de mot de passe au store** : politiques Chrome/Firefox sur les extensions
  de gestionnaire de mots de passe (déclarations de permissions, `privacy_policy`).
- L'extension doit-elle proposer un **mot de passe principal** propre, distinct de celui
  du coffre ? → Défaut : non (on réutilise le mot de passe maître du coffre).