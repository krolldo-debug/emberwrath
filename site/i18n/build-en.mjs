// Fremdsprachige Website unter /en/, /es/ und /fr/ – wird von build-site.mjs aus den fertigen deutschen Seiten erzeugt.
// Texte: site/i18n/<id>.json (Schlüssel = deutscher Text bzw. innerer HTML-Text, siehe html.mjs) plus die
// Namen aus dem Spiel (src/i18n/<id>.js). es/fr: fehlende Texte kommen englisch, sonst bleiben sie deutsch;
// beides meldet der Build. Dynamische Texte aus site.js/shop.js übersetzt /<id>/i18n.js im Browser (wie im Spiel).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, serialize, translateTree, walkElements, getAttr, setAttr } from './html.mjs';
import { Translator } from '../../src/i18n/translate.js';

export const ORIGIN = 'https://www.emberwrath.com';
// Sprachen der Website in der Reihenfolge der Auswahl (wie im Spiel, src/i18n/index.js), Beschriftung in eigener Schreibweise.
export const SITE_LANGS = [
  { id: 'de', label: 'Deutsch', locale: 'de-DE', og: 'de_DE' },
  { id: 'en', label: 'English', locale: 'en-US', og: 'en_US' },
  { id: 'es', label: 'Español', locale: 'es-ES', og: 'es_ES' },
  { id: 'fr', label: 'Français', locale: 'fr-FR', og: 'fr_FR' },
];
export const FOREIGN = SITE_LANGS.filter((l) => l.id !== 'de').map((l) => l.id);
// deutsche Adresse → Adresse je Sprache (Cloudflare liefert x.html als /x aus)
export const SLUGS = {
  en: {
    '/': '/en/', '/welt': '/en/world', '/support': '/en/support', '/impressum': '/en/legal-notice',
    '/datenschutz': '/en/privacy', '/nutzungsbedingungen': '/en/terms', '/newsletter': '/en/newsletter', '/shop': '/en/shop', '/kaufbedingungen': '/en/purchase-terms',
  },
  es: {
    '/': '/es/', '/welt': '/es/mundo', '/support': '/es/soporte', '/impressum': '/es/aviso-legal',
    '/datenschutz': '/es/privacidad', '/nutzungsbedingungen': '/es/terminos', '/newsletter': '/es/newsletter', '/shop': '/es/tienda', '/kaufbedingungen': '/es/condiciones-de-compra',
  },
  fr: {
    '/': '/fr/', '/welt': '/fr/monde', '/support': '/fr/assistance', '/impressum': '/fr/mentions-legales',
    '/datenschutz': '/fr/confidentialite', '/nutzungsbedingungen': '/fr/conditions', '/newsletter': '/fr/newsletter', '/shop': '/fr/boutique', '/kaufbedingungen': '/fr/conditions-de-vente',
  },
};
const slugFor = (id, slug) => (id === 'de' ? slug : SLUGS[id][slug]);
const FILE = (slug) => (/^\/[a-z]{2}\/$/.test(slug) ? `${slug.slice(1)}index.html` : `${slug.slice(1)}.html`);
const LEGAL = new Set(['/impressum', '/datenschutz', '/nutzungsbedingungen', '/kaufbedingungen']);
const LEGAL_NOTE = {
  en: (h) => `This English version is provided for convenience. Only the <a href="${h}" hreflang="de" lang="de" data-setlang="de">German version</a> is legally binding.`,
  es: (h) => `Esta versión en español se ofrece para tu comodidad. Solo la <a href="${h}" hreflang="de" lang="de" data-setlang="de">versión alemana</a> es jurídicamente vinculante.`,
  fr: (h) => `Cette version française est fournie pour ta commodité. Seule la <a href="${h}" hreflang="de" lang="de" data-setlang="de">version allemande</a> fait foi.`,
};
const pageSlug = (page) => (page === 'index.html' ? '/' : `/${page.replace(/\.html$/, '')}`);

const readJson = (root, f) => JSON.parse(readFileSync(resolve(root, f), 'utf8'));
const gameDict = (root, id) => {
  const src = readFileSync(resolve(root, `src/i18n/${id}.js`), 'utf8');
  return JSON.parse(src.slice(src.indexOf('{', src.indexOf(`export const ${id.toUpperCase()}`)), src.lastIndexOf('}') + 1));
};
// Website-Texte einer Sprache (ohne Spielnamen); es/fr mit englischem Ersatz für Fehlendes.
export function siteTexts(root, id) {
  const own = readJson(root, `site/i18n/${id}.json`);
  return id === 'en' ? own : { ...readJson(root, 'site/i18n/en.json'), ...own };
}
// Namen und Begriffe aus dem Spiel (Klassen, Bosse, Gebiete …) gelten auch auf der Website.
export function loadDict(root, id = 'en') {
  const base = id === 'en' ? {} : { ...gameDict(root, 'en'), ...readJson(root, 'site/i18n/en.json') };
  return { ...base, ...gameDict(root, id), ...readJson(root, `site/i18n/${id}.json`) };
}
// Schlüssel, die in dieser Sprache selbst übersetzt sind (für die Meldung „kommt englisch“).
export function ownKeys(root, id) {
  return new Set([...Object.keys(gameDict(root, id)), ...Object.keys(readJson(root, `site/i18n/${id}.json`))].map((k) => k.replace(/\s+/g, ' ').trim()));
}

// Links einer fremdsprachigen Seite: deutsche Seiten → Seiten der Sprache, alles andere absolut ab Wurzel.
function mapUrl(url, id) {
  if (!url || /^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(url)) return url;
  const abs = new URL(url, `${ORIGIN}/`);
  const path = abs.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  return (SLUGS[id][path] ?? abs.pathname) + abs.search + abs.hash;
}

function hreflang(slug) {
  const alt = SITE_LANGS.map((l) => `<link rel="alternate" hreflang="${l.id}" href="${ORIGIN}${slugFor(l.id, slug)}">`);
  return `${alt.join('\n  ')}\n  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${SLUGS.en[slug]}">\n  <script src="/lang.js"></script>`;
}

// Sprachauswahl in der Kopfleiste: Pixel-Erdkugel (Breiten- und Längengrade, 13 × 13) mit Kürzel, darunter die Sprachen in eigener Schreibweise (lang.js öffnet sie).
// Auf dem Handy steht die Liste offen im Menü. Links führen auf dieselbe Seite in der anderen Sprache.
const GLOBE = '<svg viewBox="0 0 13 13" width="13" height="13" aria-hidden="true" shape-rendering="crispEdges" fill="currentColor"><path d="M4 0h5v1H4zM2 1h2v1H2zM6 1h1v1H6zM9 1h2v1H9zM1 2h1v1H1zM5 2h1v1H5zM7 2h1v1H7zM11 2h1v1H11zM1 3h11v1H1zM0 4h1v1H0zM4 4h1v1H4zM8 4h1v1H8zM12 4h1v1H12zM0 5h1v1H0zM4 5h1v1H4zM8 5h1v1H8zM12 5h1v1H12zM0 6h13v1H0zM0 7h1v1H0zM4 7h1v1H4zM8 7h1v1H8zM12 7h1v1H12zM0 8h1v1H0zM4 8h1v1H4zM8 8h1v1H8zM12 8h1v1H12zM1 9h11v1H1zM1 10h1v1H1zM5 10h1v1H5zM7 10h1v1H7zM11 10h1v1H11zM2 11h2v1H2zM6 11h1v1H6zM9 11h2v1H9zM4 12h5v1H4z"/></svg>';
export function langMenu(cur, slug) {
  const items = SITE_LANGS.map((l) => {
    const href = slugFor(l.id, slug);
    const here = l.id === cur ? ' aria-current="true"' : '';
    return `<li><a href="${href}" hreflang="${l.id}" lang="${l.id}" data-setlang="${l.id}"${here}>${l.label}</a></li>`;
  });
  const label = SITE_LANGS.find((l) => l.id === cur).label;
  return `<div class="nav-lang" data-lang-menu translate="no">
        <button class="lang-btn" type="button" aria-expanded="false" aria-controls="sprachen" aria-label="Languages / Sprachen: ${label}" title="Languages / Sprachen">${GLOBE}<span class="lang-cur">${cur.toUpperCase()}</span></button>
        <ul class="lang-list" id="sprachen" aria-label="Languages / Sprachen">${items.join('')}</ul>
      </div>`;
}
const withMenu = (html, cur, slug) => html.replace('<a class="nav-extra"', `${langMenu(cur, slug)}\n      <a class="nav-extra"`);

// Deutsche Seite: hreflang-Verweise und Sprachauswahl ergänzen.
export function decorateGerman(html, page) {
  const slug = pageSlug(page);
  if (page === '404.html') return html.replace('</title>', '</title>\n  <meta name="ew-lang-auto" content="1">\n  <script src="/lang.js"></script>');
  if (!SLUGS.en[slug]) return html;
  html = html.replace(/(\s*)<link rel="canonical"[^>]*>|(\s*)<\/title>/, (m) => `${m}\n  ${hreflang(slug)}`);
  return withMenu(html, 'de', slug);
}

// Übersetzungen landen ungeprüft im HTML der englischen Seiten. Darum nur, was die deutschen Seiten selbst verwenden:
// Textstücke ohne Markup; ganze Absätze ('html') nur mit Inline-Tags und harmlosen Attributen, keine Skript-Links.
const SAFE_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'span', 'br', 'small', 'abbr', 'time', 'code', 'kbd', 'sup', 'sub', 'mark', 'wbr', 'q', 'cite']);
const SAFE_ATTRS = new Set(['href', 'rel', 'target', 'class', 'lang', 'hreflang', 'title', 'translate', 'datetime']);
function safeTranslation(key, t, kind) {
  const bad = (why) => { throw new Error(`site/i18n: unsichere Übersetzung (${why}) für „${key.slice(0, 80)}“`); };
  if (kind !== 'html') { if (kind === 'text' && /[<>]/.test(t)) bad('Markup in Textstück'); return t; }
  for (const [, close, tag, attrs] of t.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    if (!SAFE_TAGS.has(tag.toLowerCase())) bad(`<${tag}>`);
    if (close) continue;
    for (const [, name, , v1, v2, v3] of attrs.matchAll(/([^\s=\/>]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const n = name.toLowerCase();
      if (!SAFE_ATTRS.has(n) && !n.startsWith('data-')) bad(`Attribut ${name}`);
      if (n === 'href' && /^\s*(javascript|data|vbscript):/i.test(v1 ?? v2 ?? v3 ?? '')) bad('Skript-Link');
    }
  }
  if (t.replace(/<\/?[a-zA-Z][\w-]*[^>]*>/g, '').includes('<')) bad('offenes „<“');
  return t;
}

export function buildLang(id, html, page, outDir, tr, missing) {
  const slug = pageSlug(page);
  const to = SLUGS[id][slug];
  if (!to) return null;
  const meta = SITE_LANGS.find((l) => l.id === id);
  const root = parse(html);
  translateTree(root, (key, kind) => {
    const n = key.replace(/\s+/g, ' ').trim();
    const t = tr.exact.get(n) ?? tr.tr(key);
    if (t === key) { if (!tr.known(key)) missing.add(key); return null; }
    if (tr.own && !tr.own.has(n) && tr.exact.has(n)) missing.add(key);
    return safeTranslation(key, t, kind);
  });
  walkElements(root, (el) => {
    if (el.tag === 'html') setAttr(el, 'lang', id);
    for (const a of ['href', 'src', 'action', 'poster']) {
      const v = getAttr(el, a);
      if (v != null && !(el.tag === 'link' && /alternate|canonical/.test(getAttr(el, 'rel') ?? ''))) setAttr(el, a, mapUrl(v, id));
    }
    // srcset (<picture><source>, <img>): jede Adresse wie src
    const set = getAttr(el, 'srcset');
    if (set != null) setAttr(el, 'srcset', set.split(',').map((part) => part.trim().replace(/^\S+/, (u) => mapUrl(u, id))).join(', '));
    const style = getAttr(el, 'style');
    if (style && /url\(/.test(style)) setAttr(el, 'style', style.replace(/url\((?!["']?(?:\/|https?:|data:))["']?([^)"']+)["']?\)/g, 'url(/$1)'));
    if (el.tag === 'meta' && getAttr(el, 'property') === 'og:locale') setAttr(el, 'content', meta.og);
    if (el.tag === 'meta' && getAttr(el, 'property') === 'og:url') setAttr(el, 'content', `${ORIGIN}${to}`);
    if (el.tag === 'link' && getAttr(el, 'rel') === 'canonical') setAttr(el, 'href', `${ORIGIN}${to}`);
    if (el.tag === 'script' && getAttr(el, 'type') === 'application/ld+json' && el.rawBody) {
      const data = JSON.parse(el.rawBody);
      const fix = (v) => {
        if (typeof v === 'string') {
          if (v === 'de') return id;
          if (v.startsWith(`${ORIGIN}/`) && !/\/(img|spielen)\//.test(v)) return `${ORIGIN}${mapUrl(v.slice(ORIGIN.length), id)}`;
          const t = tr.tr(v);
          if (t === v && !tr.known(v) && /[äöüß]|[a-z] [a-z]/i.test(v) && !/^https?:/.test(v)) missing.add(v);
          return t;
        }
        if (Array.isArray(v)) return v.map(fix);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'name' && x === 'Dominic Paul Kroll' ? x : fix(x)]));
        return v;
      };
      // „<“ maskieren: ein übersetzter Text mit </script> darf den Datenblock nicht beenden
      el.rawBody = JSON.stringify(fix(data)).replace(/</g, '\\u003c');
    }
  });
  let out = serialize(root);
  out = out.replace(/(\s*)<link rel="canonical"[^>]*>|(\s*)<\/title>/, (m) => `${m}\n  ${hreflang(slug)}`);
  out = withMenu(out, id, slug);
  // Dynamische Texte (site.js, shop.js) im Browser übersetzen: vor allen anderen Skripten laden
  out = out.replace(/<script src="\/config\.js"><\/script>/, `<script src="/${id}/i18n.js"></script>\n<script src="/config.js"></script>`);
  if (LEGAL.has(slug)) out = out.replace(/(<\/h1>)/, `$1\n  <p class="legal-lang" role="note">${LEGAL_NOTE[id](slug)}</p>`);
  const file = join(outDir, FILE(to));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, out);
  return to;
}

// Laufzeit-Übersetzer für /<id>/: translate.js + die Website-Texte, die nur aus Skripten kommen.
export function buildRuntime(root, outDir, id) {
  const dict = siteTexts(root, id);
  const locale = SITE_LANGS.find((l) => l.id === id).locale;
  const code = readFileSync(resolve(root, 'src/i18n/translate.js'), 'utf8').replace(/^export\s+/gm, '');
  const js = `// Erzeugt von site/i18n/build-en.mjs – nicht von Hand ändern.
(() => {
${code}
const tr = new Translator(${JSON.stringify(dict)}, { quotes: '${id}' });
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const done = new WeakMap();
const skip = (el) => !el || el.closest('[translate="no"], .notranslate') || SKIP.has(el.tagName);
const text = (n) => { if (done.get(n) === n.data || skip(n.parentElement)) return; const t = tr.tr(n.data); if (t !== n.data) n.data = t; done.set(n, n.data); };
const attrs = (el) => { if (skip(el)) return; for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr.tr(v); if (t !== v) el.setAttribute(a, t); } } };
const walk = (r) => { if (r.nodeType === 3) return text(r); if (r.nodeType !== 1) return; attrs(r); const it = document.createTreeWalker(r, 5); for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? text(n) : attrs(n); };
new MutationObserver((list) => { for (const m of list) { if (m.type === 'characterData') text(m.target); else if (m.type === 'attributes') attrs(m.target); else m.addedNodes.forEach(walk); } })
  .observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
walk(document.documentElement); // schon Vorhandenes (z. B. <title>)
const title = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
Object.defineProperty(document, 'title', { get: () => title.get.call(document), set: (v) => title.set.call(document, tr.tr(String(v))) });
for (const name of ['alert', 'confirm']) { const f = window[name].bind(window); window[name] = (m, ...r) => f(tr.tr(String(m ?? '')), ...r); }
const nl = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (loc, o) { return nl.call(this, !loc || String(loc).startsWith('de') ? '${locale}' : loc, o); };
const dl = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (loc, o) { return dl.call(this, !loc || String(loc).startsWith('de') ? '${locale}' : loc, o); };
})();
`;
  mkdirSync(join(outDir, id), { recursive: true });
  writeFileSync(join(outDir, `${id}/i18n.js`), js);
}

export function sitemapAlternates(xml) {
  // Jede deutsche Adresse bekommt ihre Gegenstücke in allen Sprachen samt hreflang-Verweisen.
  let out = xml.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
  out = out.replace(/  <url><loc>https:\/\/www\.emberwrath\.com(\/[^<]*)<\/loc>(.*?)<\/url>\n/g, (m, path, rest) => {
    if (!SLUGS.en[path]) return m;
    const urls = SITE_LANGS.map((l) => slugFor(l.id, path));
    const alt = SITE_LANGS.map((l, i) => `<xhtml:link rel="alternate" hreflang="${l.id}" href="${ORIGIN}${urls[i]}"/>`).join('')
      + `<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${SLUGS.en[path]}"/>`;
    return urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc>${rest}${alt}</url>\n`).join('');
  });
  return out;
}

export function newTranslator(dict, id = 'en', own = null) {
  const tr = new Translator(dict, { quotes: id });
  tr.own = own;
  return tr;
}
