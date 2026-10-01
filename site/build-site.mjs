// Baut die Startseite und die Unterseiten (Welt, Support, Impressum, Datenschutz) nach outDir.
// Aufruf aus tools/build.mjs: buildSite(root, resolve(root, 'dist/site')).
// Das Spiel selbst schreibt tools/build.mjs nach outDir/spielen/index.html.
// Seiten binden Kopf und Fuß per <!--#include name--> aus site/partials/ ein.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

// impressum.html ist vorerst nicht veröffentlicht (Nutzerwunsch 30.09.); zum Aktivieren wieder eintragen und verlinken.
const PAGES = ['index.html', 'welt.html', 'support.html', 'datenschutz.html'];
// robots.txt und sitemap.xml nennen https://www.emberwrath.com (canonical in den Seitenköpfen ebenso).
const STATIC = ['site.css', 'site.js', 'config.js', 'favicon.svg', 'robots.txt', 'sitemap.xml'];

export function buildSite(root, outDir) {
  const src = resolve(root, 'site');
  const partial = (name) => readFileSync(join(src, 'partials', `${name}.html`), 'utf8').trim();
  mkdirSync(outDir, { recursive: true });
  for (const page of PAGES) {
    let html = readFileSync(join(src, page), 'utf8');
    html = html.replace(/<!--#include ([a-z-]+)-->/g, (_, name) => partial(name));
    // Aktuelle Seite in der Navigation markieren
    // Cloudflare liefert support.html als /support aus (html_handling), daher Links ohne Endung.
    // Pfade sind relativ, damit die Seiten auch in einer Vorschau ohne Server-Wurzel funktionieren.
    const path = page === 'index.html' ? './' : page.replace(/\.html$/, '');
    html = html.replace(`<a href="${path}">`, `<a href="${path}" aria-current="page">`);
    if (/<!--#include/.test(html)) throw new Error(`Unaufgelöstes include in site/${page}`);
    writeFileSync(join(outDir, page), html);
  }
  for (const f of STATIC) copyFileSync(join(src, f), join(outDir, f));
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
  return { pages: PAGES.length, imagesKB: Math.round(bytes / 1024) };
}
