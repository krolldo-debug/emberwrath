// Zero-Dependency-Build: bündelt alle ES-Module in eine einzelne HTML-Datei
// (dist/emberfall.html), die ohne Server per Doppelklick läuft.
// Aufruf: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

let bundle = 'const __defs = {}, __cache = {};\n';
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
const site = resolve(root, 'dist/site');
mkdirSync(site, { recursive: true });
writeFileSync(resolve(site, 'index.html'), out);
// Cloudflare Pages / Netlify lesen _headers: HTML immer frisch laden (neue Versionen sofort sichtbar),
// dazu übliche Sicherheits-Header. Kein externer Inhalt nötig – das Spiel ist eine einzige Datei.
writeFileSync(resolve(site, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'",
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '/index.html',
  '  Cache-Control: no-cache',
  '/',
  '  Cache-Control: no-cache',
  '',
].join('\n'));
writeFileSync(resolve(site, 'robots.txt'), 'User-agent: *\nAllow: /\n');
console.log(`dist/emberfall.html geschrieben (${modules.size} Module, ${(out.length / 1024).toFixed(1)} KB)`);
