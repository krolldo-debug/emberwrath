// Englische Website unter /en/ – wird von build-site.mjs aus den fertigen deutschen Seiten erzeugt.
// Texte: site/i18n/en.json (Schlüssel = deutscher Text bzw. innerer HTML-Text, siehe html.mjs) plus die
// Namen aus dem Spiel (src/i18n/en.js). Fehlende Texte bleiben deutsch und werden beim Build gemeldet.
// Dynamische Texte aus site.js/shop.js übersetzt /en/i18n.js im Browser (gleiche Technik wie im Spiel).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, serialize, translateTree, walkElements, getAttr, setAttr } from './html.mjs';
import { Translator } from '../../src/i18n/translate.js';

export const ORIGIN = 'https://www.emberwrath.com';
// deutsche Adresse → englische Adresse (Cloudflare liefert x.html als /x aus)
export const SLUGS = {
  '/': '/en/', '/welt': '/en/world', '/support': '/en/support', '/impressum': '/en/legal-notice',
  '/datenschutz': '/en/privacy', '/nutzungsbedingungen': '/en/terms', '/newsletter': '/en/newsletter', '/shop': '/en/shop', '/kaufbedingungen': '/en/purchase-terms',
};
const FILE = (slug) => (slug === '/en/' ? 'en/index.html' : `${slug.slice(1)}.html`);
const LEGAL = new Set(['/impressum', '/datenschutz', '/nutzungsbedingungen', '/kaufbedingungen']);
const pageSlug = (page) => (page === 'index.html' ? '/' : `/${page.replace(/\.html$/, '')}`);

export function loadDict(root) {
  const site = JSON.parse(readFileSync(resolve(root, 'site/i18n/en.json'), 'utf8'));
  // Namen und Begriffe aus dem Spiel (Klassen, Bosse, Gebiete …) gelten auch auf der Website.
  const gameSrc = readFileSync(resolve(root, 'src/i18n/en.js'), 'utf8');
  const game = JSON.parse(gameSrc.slice(gameSrc.indexOf('{', gameSrc.indexOf('export const EN')), gameSrc.lastIndexOf('}') + 1));
  return { ...game, ...site };
}

// Links einer englischen Seite: deutsche Seiten → englische, alles andere absolut ab Wurzel.
function mapUrl(url) {
  if (!url || /^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(url)) return url;
  const abs = new URL(url, `${ORIGIN}/`);
  const path = abs.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  const en = SLUGS[path];
  return (en ?? abs.pathname) + abs.search + abs.hash;
}

function hreflang(slug) {
  const en = SLUGS[slug];
  return `<link rel="alternate" hreflang="de" href="${ORIGIN}${slug}">\n  <link rel="alternate" hreflang="en" href="${ORIGIN}${en}">\n  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${en}">\n  <script src="/lang.js"></script>`;
}

// Deutsche Seite: hreflang-Verweise und Umschalter „English“ ergänzen.
export function decorateGerman(html, page) {
  const slug = pageSlug(page);
  if (page === '404.html') return html.replace('</title>', '</title>\n  <meta name="ew-lang-auto" content="1">\n  <script src="/lang.js"></script>');
  if (!SLUGS[slug]) return html;
  html = html.replace(/(\s*)<link rel="canonical"[^>]*>|(\s*)<\/title>/, (m) => `${m}\n  ${hreflang(slug)}`);
  return html.replace('<a class="nav-extra"', `<a class="nav-lang" href="${SLUGS[slug].replace(/^\//, '')}" hreflang="en" lang="en" data-setlang="en">English</a>\n      <a class="nav-extra"`);
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

export function buildEnglish(html, page, outDir, tr, missing) {
  const slug = pageSlug(page);
  const en = SLUGS[slug];
  if (!en) return null;
  const root = parse(html);
  translateTree(root, (key, kind) => {
    const t = tr.exact.get(key.replace(/\s+/g, ' ').trim()) ?? tr.tr(key);
    if (t === key) { if (!tr.known(key)) missing.add(key); return null; }
    return safeTranslation(key, t, kind);
  });
  walkElements(root, (el) => {
    if (el.tag === 'html') setAttr(el, 'lang', 'en');
    for (const a of ['href', 'src', 'action', 'poster']) {
      const v = getAttr(el, a);
      if (v != null && !(el.tag === 'link' && /alternate|canonical/.test(getAttr(el, 'rel') ?? ''))) setAttr(el, a, mapUrl(v));
    }
    const style = getAttr(el, 'style');
    if (style && /url\(/.test(style)) setAttr(el, 'style', style.replace(/url\((?!["']?(?:\/|https?:|data:))["']?([^)"']+)["']?\)/g, 'url(/$1)'));
    if (el.tag === 'meta' && getAttr(el, 'property') === 'og:locale') setAttr(el, 'content', 'en_US');
    if (el.tag === 'meta' && getAttr(el, 'property') === 'og:url') setAttr(el, 'content', `${ORIGIN}${en}`);
    if (el.tag === 'link' && getAttr(el, 'rel') === 'canonical') setAttr(el, 'href', `${ORIGIN}${en}`);
    if (el.tag === 'script' && getAttr(el, 'type') === 'application/ld+json' && el.rawBody) {
      const data = JSON.parse(el.rawBody);
      const fix = (v) => {
        if (typeof v === 'string') {
          if (v === 'de') return 'en';
          if (v.startsWith(`${ORIGIN}/`) && !/\/(img|spielen)\//.test(v)) return `${ORIGIN}${mapUrl(v.slice(ORIGIN.length))}`;
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
  // Umschalter zurück auf Deutsch
  out = out.replace('<a class="nav-extra"', `<a class="nav-lang" href="${slug}" hreflang="de" lang="de" data-setlang="de">Deutsch</a>\n      <a class="nav-extra"`);
  // Dynamische Texte (site.js, shop.js) im Browser übersetzen: vor allen anderen Skripten laden
  out = out.replace(/<script src="\/config\.js"><\/script>/, '<script src="/en/i18n.js"></script>\n<script src="/config.js"></script>');
  if (LEGAL.has(slug)) {
    out = out.replace(/(<\/h1>)/, `$1\n  <p class="legal-lang" role="note">This English version is provided for convenience. Only the <a href="${slug}" hreflang="de" lang="de" data-setlang="de">German version</a> is legally binding.</p>`);
  }
  const file = join(outDir, FILE(en));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, out);
  return en;
}

// Laufzeit-Übersetzer für /en/: translate.js + die Website-Texte, die nur aus Skripten kommen.
export function buildRuntime(root, outDir, dict) {
  const code = readFileSync(resolve(root, 'src/i18n/translate.js'), 'utf8').replace(/^export\s+/gm, '');
  const js = `// Erzeugt von site/i18n/build-en.mjs – nicht von Hand ändern.
(() => {
${code}
const tr = new Translator(${JSON.stringify(dict)});
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
Number.prototype.toLocaleString = function (loc, o) { return nl.call(this, !loc || String(loc).startsWith('de') ? 'en-US' : loc, o); };
const dl = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (loc, o) { return dl.call(this, !loc || String(loc).startsWith('de') ? 'en-US' : loc, o); };
})();
`;
  mkdirSync(join(outDir, 'en'), { recursive: true });
  writeFileSync(join(outDir, 'en/i18n.js'), js);
}

export function sitemapAlternates(xml) {
  // Jede deutsche Adresse bekommt ihr englisches Gegenstück samt hreflang-Verweisen.
  let out = xml.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
  out = out.replace(/  <url><loc>https:\/\/www\.emberwrath\.com(\/[^<]*)<\/loc>(.*?)<\/url>\n/g, (m, path, rest) => {
    const en = SLUGS[path];
    if (!en) return m;
    const alt = `<xhtml:link rel="alternate" hreflang="de" href="${ORIGIN}${path}"/><xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${en}"/>`;
    return `  <url><loc>${ORIGIN}${path}</loc>${rest}${alt}</url>\n  <url><loc>${ORIGIN}${en}</loc>${rest}${alt}</url>\n`;
  });
  return out;
}

export function newTranslator(dict) { return new Translator(dict); }
