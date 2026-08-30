/* Correspondance d'URL / domaine entre une entrée du coffre et la page active.
 *
 * Approche : domaine registrable (eTLD+1) avec une liste limitée de suffixes
 * publics multi-niveaux. Suffisant pour le MVP ; une lib PSL complète
 * (tldts / psl) pourra être vendored dans une révision ultérieure.
 */

const SINGLE_SUFFIXES = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'io', 'co', 'ai', 'app',
  'dev', 'me', 'info', 'biz', 'xyz', 'online', 'site', 'tech', 'fr', 'de',
  'uk', 'us', 'ca', 'au', 'jp', 'br', 'in', 'nl', 'se', 'no', 'ch', 'at',
  'be', 'es', 'it', 'pl', 'ru', 'cn', 'kr', 'mx', 'za', 'pt', 'cz', 'dk',
  'fi', 'ie', 'gr', 'hu', 'ro', 'sk', 'si', 'tr', 'vn', 'th', 'id', 'ph',
  'ar', 'cl', 'co', 'pe', 'uy', 'ec', 've', 'eg', 'ma', 'tn', 'ke', 'ng',
  'gh', 'tz', 'ug', 'sa', 'ae', 'qa', 'il', 'ua', 'by', 'ee', 'lt', 'lv',
  'hr', 'rs', 'bg', 'is', 'lu', 'mt', 'cy', 'md', 'ge', 'am', 'az', 'kz',
  'uz', 'tw', 'hk', 'mo', 'my', 'sg', 'pk', 'bd', 'lk', 'np', 'mm', 'kh',
  'la', 'mn', 'az', 'ir', 'iq', 'jo', 'lb', 'om', 'bh', 'kw', 'ye', 'af',
  'cd', 'cm', 'ci', 'sn', 'ne', 'ml', 'bf', 'bj', 'tg', 'dj', 'so', 'et',
  'er', 'sd', 'ly', 'dz', 'ma', 'mr', 'gm', 'gw', 'gn', 'sl', 'lr', 'sv',
  'gt', 'hn', 'ni', 'cr', 'pa', 'do', 'ht', 'cu', 'jm', 'tt', 'bb', 'bs',
  'gy', 'sr', 'bo', 'py', 'zw', 'zm', 'mw', 'mz', 'ao', 'na', 'bw', 'sz',
  'ls', 'mg', 'mu', 'sc', 'km', 'cv', 'st', 'bj', 'gn', 'cf', 'td', 'ga',
  'gq', 'cg', 'bi', 'rw', 'ug', 'fm', 'pw', 'mh', 'ki', 'tv', 'vu', 'sb',
  'fj', 'ws', 'to', 'as', 'pf', 'nc', 'wf', 'tk', 'nu', 'ck', 'cc', 'sh',
  'ac', 'ax', 'bq', 'bv', 'cx', 'eh', 'fk', 'gg', 'gs', 'hm', 'im', 'je',
  'io', 'ky', 'pn', 'sj', 'sm', 'tc', 'tf', 'tl', 'va', 'vg', 'vi', 'yt',
]);

/** Suffixes publics à deux niveaux (co.uk, com.fr, github.io, vercel.app…). */
const MULTI_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'nhs.uk', 'police.uk', 'mod.uk',
  'com.fr', 'net.fr', 'org.fr', 'gouv.fr', 'asso.fr', 'tm.fr',
  'com.br', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'go.kr', 'ac.kr',
  'com.mx', 'com.cn', 'com.sg', 'com.hk', 'co.in', 'ac.in', 'gov.in',
  'co.nz', 'org.nz', 'ac.nz', 'govt.nz',
  'com.ar', 'com.pe', 'com.co', 'com.ve', 'com.ec', 'com.uy', 'com.bo',
  'com.eg', 'com.ma', 'com.tn', 'com.ng', 'com.ke', 'com.gh',
  'com.sa', 'com.ae', 'com.qa', 'co.il', 'com.ua', 'com.tr',
  'com.tw', 'com.my', 'com.ph', 'co.id', 'com.vn', 'co.th',
  'vercel.app', 'github.io', 'gitlab.io', 'netlify.app', 'pages.dev',
  'web.app', 'firebaseapp.com', 'herokuapp.com', 'railway.app',
  'blogspot.com', 'wordpress.com', 'medium.com', 'wixsite.com',
  'co.at', 'gv.at', 'or.at', 'com.de', 'co.nz', 'info.pl', 'com.pl',
]);

/** Normalise une URL libre en URL valide, ou '' si invalide. */
export function normalizeEntryUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '';
  }
}

/** Domaine registrable (eTLD+1) d'un hostname, sans www. */
export function registrableDomain(hostname) {
  const h = String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
  if (!h) return null;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  for (const suffix of MULTI_SUFFIXES) {
    if (h === suffix) return h;
    if (h.endsWith(`.${suffix}`)) {
      const label = h.slice(0, -(suffix.length + 1)).split('.').pop();
      return `${label}.${suffix}`;
    }
  }
  return parts.slice(-2).join('.');
}

/** Domaine registrable à partir d'une URL quelconque. */
export function domainFromUrl(url) {
  const normalized = normalizeEntryUrl(url);
  if (!normalized) return null;
  try {
    return registrableDomain(new URL(normalized).hostname);
  } catch {
    return null;
  }
}

function hostnameOf(url) {
  const normalized = normalizeEntryUrl(url);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isIpHostname(hostname) {
  const h = String(hostname || '').replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return true;
  return h.includes(':');
}

function isPublicSuffix(domain) {
  return SINGLE_SUFFIXES.has(domain) || MULTI_SUFFIXES.has(domain);
}

/**
 * Une entrée du coffre correspond-elle à la page active ?
 * Comparaison sur le domaine registrable uniquement (pas de suffixe trop large).
 */
export function entryMatchesUrl(entry, pageUrl) {
  if (!entry || typeof entry.url !== 'string') return false;
  const entryHost = hostnameOf(entry.url);
  const pageHost = hostnameOf(pageUrl);
  if (!entryHost || !pageHost) return false;
  if (isIpHostname(entryHost) || isIpHostname(pageHost)) {
    return entryHost === pageHost;
  }
  const entryDomain = registrableDomain(entryHost);
  const pageDomain = registrableDomain(pageHost);
  if (!entryDomain || !pageDomain) return false;
  if (isPublicSuffix(entryDomain) || isPublicSuffix(pageDomain)) return false;
  return entryDomain === pageDomain;
}

/** Extrait le hostname de la page pour l'UI. */
export function pageHostname(pageUrl) {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return '';
  }
}