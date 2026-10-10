// Zero-Dependency-Build: bündelt alle ES-Module in eine einzelne HTML-Datei
// (dist/emberfall.html), die ohne Server per Doppelklick läuft.
// Aufruf: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildSite } from '../site/build-site.mjs';
import { pageHeaders } from '../worker/headers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = new Map();

function load(abs) {
  if (modules.has(abs)) return;
  const id = relative(root, abs).replace(/\\/g, '/');
  modules.set(abs, null);
  let src = readFileSync(abs, 'utf8');
  const exported = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*['"](.+?)['"];?\s*$/gm, (_, names, spec) => {
    const dep = resolve(dirname(abs), spec);
    load(dep);
    const depId = relative(root, dep).replace(/\\/g, '/');
    const binds = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${binds} } = __require(${JSON.stringify(depId)});`;
  });
  src = src.replace(/^export\s+(class|function|async function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`Nicht unterstützte import/export-Form in ${id}`);
  modules.set(abs, { id, code: `${src}\nreturn { ${exported.join(', ')} };` });
}

const entry = resolve(root, 'src/main.js');
load(entry);

// Syntaxprüfung je Modul: ein Fehler bricht den Build ab, statt still im dist zu landen.
for (const m of modules.values()) {
  try { new Function(m.code); } catch (e) { console.error(`Syntaxfehler in ${m.id}: ${e.message}`); process.exit(1); }
}

// Build-Kennung: Commit (Cloudflare Workers Builds setzt WORKERS_CI_COMMIT_SHA, sonst git), sichtbar im
// Titelbild-Fuß und unter /version.json – so lässt sich prüfen, welche Version live ausgeliefert wird.
let commit = process.env.WORKERS_CI_COMMIT_SHA ?? '';
if (!commit) { try { commit = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = ''; } }
const pkgVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const build = { version: pkgVersion, commit: commit ? commit.slice(0, 7) : 'dev', builtAt: new Date().toISOString() };

let bundle = `globalThis.EMBERWRATH_BUILD = ${JSON.stringify(build)};\n`;
bundle += 'const __defs = {}, __cache = {};\n';
bundle += 'function __require(id) { if (!(id in __cache)) __cache[id] = __defs[id](); return __cache[id]; }\n';
for (const m of modules.values()) bundle += `__defs[${JSON.stringify(m.id)}] = function () {\n${m.code}\n};\n`;
bundle += `__require(${JSON.stringify(relative(root, entry))});\n`;

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
// Das Spiel als ein Skript: in dist/emberfall.html eingebettet, auf der Website als eigene Datei (unten).
const gameScript = `\n(() => {\n${bundle}})();\n`;
// Alle in index.html verlinkten Stylesheets werden in Reihenfolge eingebettet.
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const css = cssFiles.map((f) => `/* ${f} */\n${readFileSync(resolve(root, f), 'utf8')}`).join('\n');
const out = html
  .replace(/(\s*<link rel="stylesheet" href="[^"]+">)+/, () => `\n  <style>\n${css}</style>`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script>${gameScript}</script>`);
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/emberfall.html'), out);
// Variante ohne Dokument-Gerüst (für Einbettung, z. B. als claude.ai-Artifact)
const fragment = `<title>Emberwrath</title>\n<style>\n:root { color-scheme: dark; }\n${css}</style>\n`
  + `<canvas id="game" width="480" height="270" aria-label="Emberwrath Spielszene"></canvas>\n<div id="ui"></div>\n<div id="rotate-hint">Gerät quer halten für die volle Ansicht</div>\n<div id="boot">EMBERFALL</div>\n`
  + `<script>\n(() => {\n${bundle}})();\n</script>\n`;
writeFileSync(resolve(root, 'dist/emberfall.fragment.html'), fragment);
// Veröffentlichungs-Ordner für statisches Hosting (Cloudflare Pages, GitHub Pages, Netlify …):
// dist/site/ enthält alles, was hochgeladen wird. Siehe docs/VEROEFFENTLICHEN.md.
// Aufbau: / = Startseite (site/, siehe site/README.md), /spielen/ = das Spiel.
// connect-src: nur die eigene Seite und – falls eingetragen – genau das Supabase-Projekt aus src/online/config.js.
const supabaseUrl = /supabaseUrl:\s*'([^']*)'/.exec(readFileSync(resolve(root, 'src/online/config.js'), 'utf8'))?.[1] ?? '';
if (supabaseUrl && !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(supabaseUrl)) { console.error(`Ungültige supabaseUrl in src/online/config.js: ${supabaseUrl}`); process.exit(1); }
const site = resolve(root, 'dist/site');
mkdirSync(resolve(site, 'spielen'), { recursive: true });
// Auf der Website liegt das Spiel als eigene Datei mit Inhalts-Kennung im Namen (spiel.<hash>.js, ein Jahr im
// Browser-Speicher): Der Browser bereitet sie schon beim Herunterladen vor, Wiederkehrer laden sie nur nach einem
// neuen Stand, und die Startseite kann sie vorab laden. Messung 10.10.: Titel am Handy 0,6–0,9 s früher.
for (const f of readdirSync(resolve(site, 'spielen'))) if (/^spiel\.[0-9a-f]+\.js$/.test(f)) rmSync(resolve(site, 'spielen', f));
const gameFile = `spiel.${createHash('sha256').update(gameScript, 'utf8').digest('hex').slice(0, 12)}.js`;
writeFileSync(resolve(site, 'spielen', gameFile), gameScript);
const siteGame = html
  .replace(/(\s*<link rel="stylesheet" href="[^"]+">)+/, () => `\n  <style>\n${css}</style>`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script src="${gameFile}"></script>`);
writeFileSync(resolve(site, 'spielen/index.html'), siteGame);
// Web-App vom Home-Bildschirm (src/ui/Fullscreen.js): Manifest und App-Symbole liegen neben dem Spiel.
for (const f of ['manifest.webmanifest', 'app-icon-180.png', 'app-icon-192.png', 'app-icon-512.png']) copyFileSync(resolve(root, 'src/ui/pwa', f), resolve(site, 'spielen', f));
// Browser und iOS fragen diese Adressen ohne Verweis im HTML ab: /apple-touch-icon.png und /favicon.ico (ICO mit eingebettetem PNG).
copyFileSync(resolve(root, 'src/ui/pwa/app-icon-180.png'), resolve(site, 'apple-touch-icon.png'));
{
  const png = readFileSync(resolve(root, 'src/ui/pwa/app-icon-192.png'));
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); // ICO, ein Bild
  head.writeUInt8(192, 6); head.writeUInt8(192, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  writeFileSync(resolve(site, 'favicon.ico'), Buffer.concat([head, png]));
}
const landing = buildSite(root, site);
// Startseite (de/en): Spiel unauffällig vorab laden, damit „Kostenlos spielen“ nicht mehr aufs Herunterladen wartet.
// site.js holt es dort nach, wo der Browser rel=prefetch nicht kennt (Safari).
for (const f of ['index.html', 'en/index.html']) {
  const p = resolve(site, f);
  let page;
  try { page = readFileSync(p, 'utf8'); } catch { continue; }
  writeFileSync(p, page.replace('</head>', `  <link rel="prefetch" href="/spielen/${gameFile}" as="script">\n</head>`));
}
// Cloudflare Pages / Netlify lesen _headers: HTML immer frisch laden (neue Versionen sofort sichtbar),
// dazu übliche Sicherheits-Header (worker/headers.js). Kein externer Inhalt nötig – das Spiel ist eine einzige Datei.
// Website-Seiten haben keine Inline-Skripte (JSON-LD ist kein ausführbares Skript), das Spiel nur das eine mit Hash.
const inlineScript = (page) => [...page.matchAll(/<script\b([^>]*)>/g)].some((m) => !/\bsrc=/.test(m[1]) && !/type="application\/ld\+json"/.test(m[1]));
if (inlineScript(html)) { console.error('index.html: Inline-Skripte blockiert die CSP – nur das gebündelte Spiel ist per Hash erlaubt.'); process.exit(1); }
for (const f of readdirSync(site, { recursive: true })) {
  if (!/\.html$/.test(f) || f.startsWith('spielen')) continue;
  const page = readFileSync(resolve(site, f), 'utf8');
  if (inlineScript(page)) { console.error(`dist/site/${f}: Inline-Skript wird von der CSP blockiert (in eine .js-Datei auslagern)`); process.exit(1); }
  // Doppelt eingebundene Skripte (z. B. site.js im Fuß und noch einmal in der Seite) laufen zweimal: doppelte Formular-Absendungen.
  const srcs = [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
  if (new Set(srcs).size !== srcs.length) { console.error(`dist/site/${f}: Skript doppelt eingebunden (${srcs.join(', ')})`); process.exit(1); }
}
writeFileSync(resolve(site, '_headers'), [
  '/*',
  // Keine Inline-Skripte mehr auf der Website (das Spiel liegt in spielen/spiel.<hash>.js): script-src nur 'self'
  ...Object.entries(pageHeaders(supabaseUrl, [])).map(([k, v]) => `  ${k}: ${v}`),
  '/index.html',
  '  Cache-Control: no-cache',
  '/',
  '  Cache-Control: no-cache',
  '/spielen/',
  '  Cache-Control: no-cache',
  '/spielen/index.html',
  '  Cache-Control: no-cache',
  '/config.js',
  '  Cache-Control: no-cache',
  '/version.json',
  '  Cache-Control: no-cache',
  '/img/*',
  '  Cache-Control: public, max-age=86400',
  '/spielen/spiel.*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n'));
writeFileSync(resolve(site, 'version.json'), JSON.stringify(build) + '\n');
console.log(`dist/emberfall.html geschrieben (${modules.size} Module, ${(out.length / 1024).toFixed(1)} KB)`);
console.log(`dist/site: Startseite (${landing.pages} Seiten, Bilder ${landing.imagesKB} KB), Spiel unter /spielen/`);
