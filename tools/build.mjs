// Zero-Dependency-Build: bündelt alle ES-Module in eine einzelne HTML-Datei
// (dist/emberfall.html), die ohne Server per Doppelklick läuft.
// Aufruf: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildSite } from '../site/build-site.mjs';

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
const build = { commit: commit ? commit.slice(0, 7) : 'lokal', builtAt: new Date().toISOString() };

let bundle = `globalThis.EMBERWRATH_BUILD = ${JSON.stringify(build)};\n`;
bundle += 'const __defs = {}, __cache = {};\n';
bundle += 'function __require(id) { if (!(id in __cache)) __cache[id] = __defs[id](); return __cache[id]; }\n';
for (const m of modules.values()) bundle += `__defs[${JSON.stringify(m.id)}] = function () {\n${m.code}\n};\n`;
bundle += `__require(${JSON.stringify(relative(root, entry))});\n`;

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
// Alle in index.html verlinkten Stylesheets werden in Reihenfolge eingebettet.
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const css = cssFiles.map((f) => `/* ${f} */\n${readFileSync(resolve(root, f), 'utf8')}`).join('\n');
const out = html
  .replace(/(\s*<link rel="stylesheet" href="[^"]+">)+/, () => `\n  <style>\n${css}</style>`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script>\n(() => {\n${bundle}})();\n</script>`);
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
const connectSrc = supabaseUrl ? `'self' ${supabaseUrl}` : "'self'";
const site = resolve(root, 'dist/site');
mkdirSync(resolve(site, 'spielen'), { recursive: true });
writeFileSync(resolve(site, 'spielen/index.html'), out);
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
// Cloudflare Pages / Netlify lesen _headers: HTML immer frisch laden (neue Versionen sofort sichtbar),
// dazu übliche Sicherheits-Header. Kein externer Inhalt nötig – das Spiel ist eine einzige Datei.
writeFileSync(resolve(site, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  `  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src ${connectSrc}; frame-ancestors 'self'`,
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
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
  '',
].join('\n'));
writeFileSync(resolve(site, 'version.json'), JSON.stringify(build) + '\n');
console.log(`dist/emberfall.html geschrieben (${modules.size} Module, ${(out.length / 1024).toFixed(1)} KB)`);
console.log(`dist/site: Startseite (${landing.pages} Seiten, Bilder ${landing.imagesKB} KB), Spiel unter /spielen/`);
