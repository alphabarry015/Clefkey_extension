/* Générateur — mots de passe forts et passphrases.
 * Porté depuis frontend/js/generator.js + breach-check.js du coffre (100 % local ;
 * vérification anti-fuite zéro-connaissance via HIBP, k-anonymity SHA-1).
 */

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const SEPARATORS = ['-', '_', '.'];

const PASSPHRASE_WORDS = [
  'abeille', 'abricot', 'accord', 'acier', 'action', 'aigle', 'aiguille', 'alarme', 'alchimie', 'algue',
  'alliance', 'amande', 'amour', 'ancre', 'ange', 'animal', 'annonce', 'antenne', 'appareil',
  'arcade', 'arche', 'argile', 'argent', 'armure', 'arome', 'artisan', 'atelier', 'atlas', 'aurore',
  'avalanche', 'aventure', 'avenir', 'balade', 'baleine', 'ballon', 'bambou', 'banque', 'barque', 'bataille',
  'bateau', 'batterie', 'bec', 'berceau', 'bibliotheque', 'bijou', 'biscuit', 'blason', 'bleuet', 'blizzard',
  'bloc', 'bois', 'bonbon', 'bougie', 'boussole', 'boutique', 'brindille', 'broche', 'bronze',
  'brouillard', 'bureau', 'cactus', 'cadence', 'cadran', 'cage', 'cahier', 'calice', 'calme', 'camion',
  'campagne', 'canal', 'canape', 'canard', 'canyon', 'cap', 'capitaine', 'capuche', 'carnet',
  'carotte', 'carreau', 'cascade', 'casque', 'casserole', 'cavale', 'cavalier', 'ceinture', 'cellule', 'cerf',
  'cerisier', 'cerveau', 'chaine', 'chaleur', 'chandelier', 'chapeau', 'chapitre', 'charbon', 'charge', 'charme',
  'chasse', 'chateau', 'chaudron', 'chaussure', 'chemin', 'chemise', 'chene', 'cheval', 'chevre', 'chiffre',
  'chocolat', 'chouette', 'ciel', 'cigale', 'cinema', 'cirque', 'citron', 'citrouille', 'clairiere', 'clavier',
  'clef', 'clic', 'climat', 'cloche', 'clou', 'cobra', 'coccinelle', 'coffre', 'colombe', 'colonne',
  'comete', 'conte', 'coquelicot', 'coquille', 'corail', 'corbeau', 'corde', 'couronne', 'couteau', 'crabe',
  'craie', 'crayon', 'cristal', 'croissant', 'crocodile', 'cygne', 'cypres', 'dahlia', 'dame', 'dauphin',
  'delta', 'dent', 'dentelle', 'desert', 'diamant', 'dicton', 'digue', 'dinde', 'diplome', 'dix',
  'domino', 'donjon', 'dragon', 'drapeau', 'eclair', 'ecole', 'ecorce', 'ecran', 'ecu', 'effet',
  'elephant', 'ellipse', 'embarcadere', 'emeraude', 'empire', 'encre', 'energie', 'engrenage', 'enquete', 'enveloppe',
  'epaule', 'epice', 'epine', 'escadre', 'espace', 'esprit', 'esquive', 'etoile', 'eveil', 'eventail',
  'fabrique', 'falaise', 'famille', 'fantome', 'farine', 'faucon', 'fauvette', 'fenetre', 'fer', 'ferme',
  'feuillage', 'feuille', 'fiamme', 'ficelle', 'figurine', 'filon', 'fleur', 'fleuve', 'flocon', 'flot',
  'flute', 'fonte', 'forage', 'foret', 'forme', 'fort', 'fossile', 'four',
  'fourmi', 'fraise', 'frayeur', 'frelon', 'frisson', 'fronde', 'fumee', 'fusee', 'gabarit', 'galaxie',
  'galerie', 'galet', 'gant', 'garde', 'gazelle', 'gazon', 'gelee', 'genie', 'gibier', 'girouette',
  'glace', 'glaive', 'globe', 'gobelins', 'gondole', 'gourde', 'goutte', 'graine', 'grand', 'grenier',
  'griffe', 'grillon', 'grimoire', 'grotte', 'grue', 'guerrier', 'guirlande', 'habit', 'hameau', 'harpe',
  'haut', 'herbe', 'hermine', 'hibou', 'hiver', 'horizon', 'horloge', 'houle', 'huile', 'huit',
  'humus', 'iceberg', 'idole', 'if', 'igloo', 'illustration', 'imaginaire', 'imperial', 'incendie', 'indice',
  'insecte', 'instant', 'interieur', 'invention', 'iris', 'ile', 'ivoire', 'jardin', 'jasmin', 'jet',
  'jeu', 'joaillier', 'jongleur', 'jubile', 'juge', 'jument', 'jungle', 'jupe', 'juron', 'kayak',
  'kiwi', 'lac', 'lagon', 'lame', 'lampe', 'lancelot', 'lande', 'lanterne', 'lapin', 'laurier',
  'lave', 'legende', 'lentille', 'lettre', 'lievre', 'ligne', 'lilas', 'limier', 'lion', 'livre',
  'locomotive', 'lointain', 'loup', 'loutre', 'lueur', 'lune', 'luth', 'lyre', 'machine', 'madone',
  'magie', 'magma', 'maison', 'malle', 'mammouth', 'mandragore', 'manche', 'mangeoire', 'manoir', 'manteau',
  'maquis', 'marche', 'mare', 'marguerite', 'marin', 'marron', 'marteau', 'mascotte', 'mastodonte', 'mecanisme',
  'mecene', 'medaille', 'melon', 'menhir', 'menthe', 'mepris', 'mer', 'merise', 'mesange', 'message',
  'mestre', 'metal', 'meteore', 'meule', 'miel', 'migraine', 'minaret', 'mine', 'minute', 'miroir',
  'molecule', 'monde', 'monstre', 'montagne', 'montre', 'morceau', 'mousse', 'mouton', 'muguet', 'murmure',
  'musique', 'mystere', 'nacre', 'nageoire', 'nappe', 'neige', 'nektar', 'nid', 'ninja', 'niveau',
  'noix', 'nuage', 'nuit', 'oasis', 'obelisque', 'occulte', 'ocean', 'oeuf', 'oignon',
  'oiseau', 'olive', 'ombre', 'ondine', 'oncle', 'opera', 'orange', 'orchestre', 'orchidee', 'ordinateur',
  'oreille', 'orge', 'origine', 'orion', 'orpailleur', 'ours', 'outil', 'outremer', 'ouvrage', 'ovale',
  'paille', 'palais', 'palmier', 'pampa', 'panier', 'panthere', 'paon', 'papillon', 'parade', 'parchemin',
  'parfum', 'paroi', 'passage', 'pastille', 'pate', 'pavot', 'peche', 'pelle', 'pendule', 'pensee',
  'perche', 'perle', 'perroquet', 'personnage', 'phare', 'phoenix', 'phoque', 'photo', 'piano', 'pieuvre',
  'pigeon', 'pinceau', 'pionnier', 'piste', 'pivoine', 'planete', 'plante', 'plastron', 'plat', 'pluie',
  'plume', 'poire', 'poison', 'poisson', 'pomme', 'pont', 'populaire', 'portail', 'porte', 'pot',
  'poulain', 'poulpe', 'poussiere', 'prairie', 'praline', 'pre', 'presse', 'prince', 'prisme', 'profil',
  'promesse', 'prunelle', 'puce', 'puits', 'pulse', 'pyramide', 'quai', 'quartz', 'quatre', 'question',
  'quete', 'queue', 'radar', 'radeau', 'rage', 'rail', 'raisin', 'rameau', 'rapace', 'rat',
  'raven', 'rayon', 'recif', 'refuge', 'regle', 'remous', 'renard', 'rencontre', 'riviere', 'robinet',
  'roc', 'roche', 'roi', 'roman', 'ronde', 'rosace', 'rose', 'roue', 'ruban', 'ruche',
  'ruse', 'sable', 'sabre', 'safran', 'saga', 'sagesse', 'saison', 'salamandre', 'salle', 'sapin',
  'sardine', 'satellite', 'saut', 'saule', 'scarabee', 'scintillement', 'secret', 'sel', 'serpent', 'serval',
  'signal', 'silence', 'sirius', 'socle', 'soleil', 'sommet', 'sonate', 'songe', 'sorciere',
  'souffle', 'source', 'souris', 'souterrain', 'spectre', 'sphinx', 'spiral', 'statue', 'steppe', 'strophe',
  'sultan', 'sucre', 'sumac', 'sursis', 'talisman', 'tambour', 'taureau', 'tempete', 'temps', 'tente',
  'terrasse', 'terre', 'theatre', 'theiere', 'tigre', 'timbre', 'titan', 'tonneau', 'toit', 'tomate',
  'tonnerre', 'torche', 'tour', 'tourbillon', 'tramway', 'trebuchet', 'tremplin', 'treve', 'triangle', 'tricorne',
  'trolle', 'trompette', 'tronc', 'troupe', 'truffe', 'tsunami', 'tulipe', 'tunnel', 'turban', 'truite',
  'unicorne', 'univers', 'urne', 'usine', 'vague', 'vallee', 'vampire', 'vanille', 'vapeur', 'vase',
  'veau', 'velours', 'vent', 'veranda', 'verdure', 'verre', 'verseau', 'vestige', 'viaduc', 'vigne',
  'village', 'violon', 'violette', 'virgule', 'vision', 'vitrail', 'voile', 'voisin', 'volcan', 'voltige',
  'vortex', 'voute', 'voyage', 'wagon', 'yaourt', 'zebre', 'zelote', 'zenith', 'zephyr', 'zone',
  'zoo', 'zorille',
];

function clampWordCount(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(3, Math.min(10, n)) : 5;
}

function clampLength(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(8, Math.min(64, n)) : 20;
}

function randomInt(max) {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function randomChars(count, chars) {
  const maxUnbiased = 256 - (256 % chars.length);
  const buf = new Uint8Array(count + 8);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) {
    if (out.length >= count) break;
    if (b >= maxUnbiased) continue;
    out += chars[b % chars.length];
  }
  while (out.length < count) out += chars[out.length % chars.length];
  return out;
}

/**
 * Construit un mot de passe combinant les textes fournis avec de l'aléa.
 * La longueur finale est toujours `length`, avec au moins 1 chiffre et 1 symbole
 * si les options correspondantes sont actives.
 */
export function buildPassword({
  base = '',
  bg = '',
  length = 20,
  upper = true,
  digits = true,
  symbols = true,
} = {}) {
  const n = clampLength(length);
  const letters = LOWER + (upper ? UPPER : '');
  const pool = letters + (digits ? DIGITS : '') + (symbols ? SYMBOLS : '');
  if (!pool) return null;

  let core = '';
  const seed = [base, bg].filter((s) => s && s.trim()).join(' ');
  if (seed.trim()) {
    const words = seed.trim().split(/\s+/).filter(Boolean);
    for (const [i, word] of words.entries()) {
      let w = word.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
      if (!w) continue;
      if (upper) w = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      if (i > 0 && core) core += SEPARATORS[randomInt(SEPARATORS.length)];
      core += w;
    }
  }

  let guaranteed = '';
  if (digits) guaranteed += DIGITS[randomInt(DIGITS.length)];
  if (symbols) guaranteed += SYMBOLS[randomInt(SYMBOLS.length)];

  let fill = n - core.length - guaranteed.length;
  if (fill < 0) {
    core = core.slice(0, Math.max(0, n - guaranteed.length));
    fill = n - core.length - guaranteed.length;
  }

  return core + randomChars(fill, pool) + guaranteed;
}

/** Génère une passphrase : N mots courants séparés par des tirets. 100 % local. */
export function generatePassphrase(count = 5) {
  const picked = new Set();
  const list = [];
  const n = clampWordCount(count);
  while (list.length < n) {
    const w = PASSPHRASE_WORDS[randomInt(PASSPHRASE_WORDS.length)];
    if (!picked.has(w)) {
      picked.add(w);
      list.push(w);
    }
  }
  return list.join('-');
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

async function sha1(value) {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto non disponible.');
  }
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return toHex(digest);
}

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/** @returns {Promise<number>} nombre d'occurrences dans les fuites (0 = non compromis). */
export async function checkPassword(password) {
  const hash = await sha1(password);
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5);
  const response = await fetch(`${HIBP_RANGE_URL}${prefix}`);
  if (!response.ok) throw new Error('Service de vérification indisponible.');
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    const [hashSuffix, count] = line.split(':');
    if (hashSuffix === suffix) return parseInt(count, 10) || 0;
  }
  return 0;
}

/** Génère un mot de passe sûr (non présent dans les fuites connues). */
export async function generateSafePassword({ length = 20 } = {}) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const pw = buildPassword({ length, upper: true, digits: true, symbols: true });
    if (!pw) throw new Error('Génération impossible.');
    const count = await checkPassword(pw);
    if (count === 0) return pw;
  }
  throw new Error('Aucun mot de passe sûr trouvé — réessayez.');
}
