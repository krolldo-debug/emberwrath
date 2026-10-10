// Baut die Startseite und die Unterseiten (Welt, Support, Impressum, Datenschutz, Nutzungsbedingungen) nach outDir.
// Aufruf aus tools/build.mjs: buildSite(root, resolve(root, 'dist/site')).
// Das Spiel selbst schreibt tools/build.mjs nach outDir/spielen/index.html.
// Seiten binden Kopf und Fuß per <!--#include name--> aus site/partials/ ein.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { loadDict, newTranslator, decorateGerman, buildEnglish, buildRuntime, sitemapAlternates } from './i18n/build-en.mjs';

// newsletter.html ist die Rückmeldeseite für Bestätigen/Abmelden (noindex, nicht in der Sitemap).
// 404.html liefert Cloudflare bei unbekannten Pfaden aus (not_found_handling); <base href="/"> hält die Links heil.
const PAGES = ['index.html', 'welt.html', 'support.html', 'impressum.html', 'datenschutz.html', 'nutzungsbedingungen.html', 'newsletter.html', '404.html', 'shop.html', 'kaufbedingungen.html'];
// robots.txt und sitemap.xml nennen https://www.emberwrath.com (canonical in den Seitenköpfen ebenso).
const STATIC = ['site.css', 'site.js', 'titel.js', 'bosskino.js', 'shop.css', 'shop.js', 'config.js', 'lang.js', 'favicon.svg', 'robots.txt'];

export function buildSite(root, outDir) {
  const src = resolve(root, 'site');
  const partial = (name) => readFileSync(join(src, 'partials', `${name}.html`), 'utf8').trim();
  mkdirSync(outDir, { recursive: true });
  // Englische Fassung unter /en/ aus denselben Seiten (site/i18n/build-en.mjs, Texte in site/i18n/en.json)
  const dict = loadDict(root);
  const tr = newTranslator(dict);
  const missing = new Set();
  let enPages = 0;
  for (const page of PAGES) {
    let html = readFileSync(join(src, page), 'utf8');
    html = html.replace(/<!--#include ([a-z-]+)-->/g, (_, name) => partial(name));
    // Aktuelle Seite in der Navigation markieren
    // Cloudflare liefert support.html als /support aus (html_handling), daher Links ohne Endung.
    // Pfade sind relativ, damit die Seiten auch in einer Vorschau ohne Server-Wurzel funktionieren.
    const path = page === 'index.html' ? './' : page.replace(/\.html$/, '');
    html = html.replace(`<a href="${path}">`, `<a href="${path}" aria-current="page">`);
    if (/<!--#include/.test(html)) throw new Error(`Unaufgelöstes include in site/${page}`);
    writeFileSync(join(outDir, page), decorateGerman(html, page));
    if (buildEnglish(html, page, outDir, tr, missing)) enPages++;
  }
  for (const f of STATIC) copyFileSync(join(src, f), join(outDir, f));
  writeFileSync(join(outDir, 'sitemap.xml'), sitemapAlternates(readFileSync(join(src, 'sitemap.xml'), 'utf8')));
  buildRuntime(root, outDir, JSON.parse(readFileSync(join(src, 'i18n/en.json'), 'utf8')));
  if (missing.size) console.warn(`Website /en/: ${missing.size} Texte ohne Übersetzung (bleiben deutsch), z. B. ${[...missing].slice(0, 3).map((m) => JSON.stringify(m.slice(0, 60))).join(', ')}`);
  const imgOut = join(outDir, 'img');
  mkdirSync(imgOut, { recursive: true });
  let bytes = 0;
  for (const f of readdirSync(join(src, 'img'))) {
    if (!['.png', '.webp', '.jpg', '.svg'].includes(extname(f))) continue;
    copyFileSync(join(src, 'img', f), join(imgOut, f));
    bytes += statSync(join(src, 'img', f)).size;
  }
  // Selbst gehostete Schriften (OFL, Lizenztexte liegen daneben); CSP bleibt 'self'
  const fontOut = join(outDir, 'fonts');
  mkdirSync(fontOut, { recursive: true });
  for (const f of readdirSync(join(src, 'fonts'))) if (['.woff2', '.txt'].includes(extname(f))) copyFileSync(join(src, 'fonts', f), join(fontOut, f));
  return { pages: PAGES.length, enPages, enMissing: missing.size, imagesKB: Math.round(bytes / 1024) };
}
