# Politique de confidentialité — Extension Clefkey

Dernière mise à jour : août 2026
Version : 0.1

## 1. Responsable

L'extension navigateur **Clefkey** est un client du coffre de mots de passe
Clefkey. Elle est éditée par le responsable du projet Clefkey (voir le dépôt
[Clefkey](https://github.com/alphabarry015/Gardefort) pour les coordonnées de
contact).

## 2. Principe général : pas de collecte

L'extension **ne collecte aucune donnée**, **n'utilise aucun service
d'analyse**, de mesure d'audience ou de publicité, et **n'envoie aucune donnée
en clair** vers des services tiers. Toutes les opérations sensibles
(déverrouillage, déchiffrement) sont réalisées **localement** sur votre
appareil.

## 3. Données traitées localement (jamais stockées)

- **Mot de passe maître** : utilisé uniquement en mémoire pendant la dérivation
  de la clé de chiffrement (Argon2id). Il n'est jamais écrit sur disque ni
  transmis au serveur.
- **Clés de déchiffrement** (`vaultKey`, clé privée) : conservées uniquement en
  mémoire du service worker de l'extension, et effacées à la fermeture du
  navigateur, au verrouillage manuel, après la durée d'inactivité configurée ou
  à la déconnexion.
- **Identifiants déchiffrés** : chargés en mémoire uniquement lorsque vous
  déverrouillez la session, et effacés au verrouillage.

## 4. Données stockées par l'extension

- **Préférences** (durée d'auto-verrouillage, thème) : stockées
  dans `chrome.storage.local`. Aucune donnée sensible. L'URL du coffre est
  figée (`https://clefkey.vercel.app`).
- **Session** (jeton d'authentification et blobs **chiffrés**) : stockés dans
  `chrome.storage.session`, une zone de stockage effacée à la fermeture du
  navigateur et inaccessible aux scripts de contenu. Aucun secret n'est
  stocké en clair.

## 5. Transmissions réseau

- **Serveur Clefkey** (`https://clefkey.vercel.app`, HTTPS) : l'extension
  transmet uniquement
  - le jeton d'authentification (session), et
  - des **blobs chiffrés** (jamais d'identifiants en clair),
  pour se connecter et récupérer votre coffre.
- **Service de vérification anti-fuite** (`api.pwnedpasswords.com`) : lors de la
  génération d'un mot de passe, l'extension envoie uniquement les 5 premiers
  caractères de l'empreinte SHA-1 (principe de k-anonymité). Le mot de passe
  complet n'est jamais transmis.
- Aucune donnée d'utilisation, télémétrie ou journal d'activité n'est envoyée.

## 6. Permissions demandées et justification

| Permission | Usage |
|---|---|
| `storage` | Enregistrer vos préférences et la session chiffrée. |
| `activeTab` + `scripting` | Injecter le remplissage automatique dans le formulaire actif, **uniquement sur votre demande explicite**. |
| Accès hôte au serveur Clefkey (`https://clefkey.vercel.app/*`) | Communiquer avec votre coffre (HTTPS uniquement). |
| Accès hôte à `api.pwnedpasswords.com` | Vérification anti-fuite des mots de passe générés (empreinte partielle SHA-1 uniquement). |

## 7. Remplissage automatique

L'extension ne remplit jamais un formulaire de manière autonome : les
identifiants ne sont injectés que lorsque vous cliquez explicitement sur un
compte (dans la popup ou sur l'icône flottante). Elle ne lit que les champs de
connexion de la page active, au moment où vous utilisez le remplissage.

## 8. Conservation et suppression

- Les secrets en mémoire sont effacés au verrouillage, à la déconnexion ou à la
  fermeture du navigateur.
- Le jeton et les blobs de session sont supprimés automatiquement à la fermeture
  du navigateur ; vous pouvez les supprimer immédiatement via « Se déconnecter ».
- Aucune donnée n'est conservée par l'éditeur de l'extension (aucun serveur de
  collecte).

## 9. Sécurité

- Dérivation de clé : Argon2id (64 MiB, t=3, p=4) — conforme au coffre Clefkey.
- Chiffrement : AES-256-GCM avec nonce aléatoire, sel aléatoire.
- Le mot de passe maître et les clés ne quittent jamais votre appareil.

## 10. Contact

Pour toute question relative à cette politique ou à vos données, contactez le
responsable du projet Clefkey via le dépôt public
[Clefkey](https://github.com/alphabarry015/Gardefort).

---
Cette politique peut évoluer ; la date en tête de document reflète la dernière
mise à jour.
