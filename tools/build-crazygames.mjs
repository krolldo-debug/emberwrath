// CrazyGames-Fassung bauen (docs/CRAZYGAMES.md). Läuft nach tools/build.mjs (npm run build ruft beide auf) und nimmt
// dessen fertiges Spiel (dist/emberfall.html), damit beide Fassungen garantiert denselben Stand haben.
//
// Ergebnis:
//   dist/site/crazygames/game.js, game.css   Spielcode für CrazyGames, liegt auf www.emberwrath.com (wird mit jeder
//                                            Veröffentlichung aktuell; dist/site/_headers: no-cache)
//   dist/crazygames/emberwrath-crazygames.zip
//       Lade-ZIP zum Hochladen bei CrazyGames: index.html + loader.js holen game.js/game.css von www.emberwrath.com.
//       Neue Versionen des Spiels sind damit ohne neuen Upload bei CrazyGames sofort da. Neu hochladen nur, wenn sich
//       die Lade-Seite selbst ändert (selten).
//   dist/crazygames/emberwrath-crazygames-komplett.zip   (nur mit --komplett)
//       Alles in einer index.html, ohne Nachladen. Rückfall, falls CrazyGames das Nachladen einmal nicht akzeptiert.
//
// Aufruf: node tools/build-crazygames.mjs [--komplett] [--base=https://www.emberwrath.com]
//   --base   Adresse, von der die Lade-ZIP den Spielcode holt (Tests: http://127.0.0.1:8080)
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const full = args.includes('--komplett');
const base = (args.find((a) => a.startsWith('--base='))?.slice(7) ?? 'https://www.emberwrath.com').replace(/\/+$/, '');
if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(base)) { console.error(`Ungültige --base: ${base}`); process.exit(1); }
const SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const MAX_FILES = 1500, MAX_BYTES = 50 * 1024 * 1024; // CrazyGames: höchstens 1500 Dateien, erster Download ≤ 50 MB

const built = resolve(root, 'dist/emberfall.html');
if (!existsSync(built)) execFileSync(process.execPath, [resolve(root, 'tools/build.mjs')], { stdio: 'inherit' });
const html = readFileSync(built, 'utf8');

// Spielcode und Styles aus dem fertigen Spiel lösen (tools/build.mjs bettet beides genau einmal ein).
const styleStart = html.indexOf('<style>\n'), styleEnd = html.indexOf('</style>', styleStart);
const scriptStart = html.indexOf('<script>'), scriptEnd = html.indexOf('</script>', scriptStart);
if (styleStart < 0 || styleEnd < 0 || scriptStart < 0 || scriptEnd < 0 || html.indexOf('<script>', scriptEnd) >= 0) {
  console.error('dist/emberfall.html: Spielcode oder Styles nicht gefunden (Aufbau von tools/build.mjs geändert?)');
  process.exit(1);
}
const css = `${html.slice(styleStart + 8, styleEnd)}\n/* src/crazygames/crazygames.css */\n${readFileSync(resolve(root, 'src/crazygames/crazygames.css'), 'utf8')}`;
// Schalter für src/platform.js vor dem Spielcode: Gast-Start, kein Shop, Welt-Server über www.emberwrath.com.
const js = `globalThis.EMBERWRATH_PLATFORM = 'crazygames';\n${html.slice(scriptStart + 8, scriptEnd)}`;
const build = /EMBERWRATH_BUILD = (\{[^}]*\})/.exec(js)?.[1] ?? '{}';

// ------------------------------------------------------------------ Spielcode auf der eigenen Seite
const site = resolve(root, 'dist/site');
if (existsSync(site)) {
  mkdirSync(resolve(site, 'crazygames'), { recursive: true });
  writeFileSync(resolve(site, 'crazygames/game.js'), js);
  writeFileSync(resolve(site, 'crazygames/game.css'), css);
  writeFileSync(resolve(site, 'crazygames/version.json'), `${build}\n`);
  // Immer frisch prüfen (ETag): Neue Versionen kommen bei CrazyGames-Spielern sofort an.
  const headers = resolve(site, '_headers');
  if (existsSync(headers) && !readFileSync(headers, 'utf8').includes('/crazygames/*')) {
    appendFileSync(headers, ['/crazygames/*', '  Cache-Control: no-cache', ''].join('\n'));
  }
}

// ------------------------------------------------------------------ Seiten der ZIPs
const head = (extra) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#05020a">
  <title>Emberwrath</title>
${extra}
</head>
<body>
  <canvas id="game" width="480" height="270" aria-label="Emberwrath"></canvas>
  <div id="ui"></div>
  <div id="boot">EMBERWRATH</div>
`;
// Lade-Seite: Styles und SDK sofort, Spielcode über loader.js (zeigt eine Meldung mit „Erneut versuchen“, falls der
// Server nicht erreichbar ist). Keine Inline-Skripte.
const loaderHtml = `${head(`  <link rel="stylesheet" href="${base}/crazygames/game.css">
  <script src="${SDK}"></script>`)}  <script src="loader.js"></script>
</body>
</html>
`;
const loaderJs = `// Emberwrath auf CrazyGames: lädt den aktuellen Spielcode von ${base} (docs/CRAZYGAMES.md im Spiel-Repository).
(function () {
  var BASE = ${JSON.stringify(base)};
  var de = /^de/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '');
  function fail() {
    var boot = document.getElementById('boot');
    if (boot) boot.remove();
    var box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;inset:0;display:grid;place-content:center;gap:14px;padding:16px;text-align:center;color:#e8d8b8;background:#05020a;font:15px/1.5 system-ui,sans-serif');
    var p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = de ? 'Der Spielserver ist gerade nicht erreichbar.' : 'The game server cannot be reached right now.';
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('style', 'justify-self:center;padding:8px 18px;font:inherit;color:#1a0e04;background:#e8742c;border:0;border-radius:3px;cursor:pointer');
    b.textContent = de ? 'Erneut versuchen' : 'Try again';
    b.onclick = function () { location.reload(); };
    box.appendChild(p);
    box.appendChild(b);
    document.body.appendChild(box);
  }
  var s = document.createElement('script');
  s.src = BASE + '/crazygames/game.js';
  s.onerror = fail;
  document.body.appendChild(s);
})();
`;

// ------------------------------------------------------------------ ZIP (ohne Fremdpaket)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  const t = new Date();
  const time = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1);
  const date = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const packed = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, packed);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function writeZip(name, files) {
  const count = Object.keys(files).length;
  const bytes = Object.values(files).reduce((n, c) => n + Buffer.byteLength(c), 0);
  if (count > MAX_FILES || bytes > MAX_BYTES) { console.error(`${name}: ${count} Dateien / ${(bytes / 1048576).toFixed(1)} MB – über der Grenze von CrazyGames`); process.exit(1); }
  const out = resolve(root, 'dist/crazygames', name);
  writeFileSync(out, zip(files));
  return `${name} (${count} Dateien, ${(readFileSync(out).length / 1024).toFixed(0)} KB gepackt)`;
}

mkdirSync(resolve(root, 'dist/crazygames'), { recursive: true });
const made = [writeZip('emberwrath-crazygames.zip', { 'index.html': loaderHtml, 'loader.js': loaderJs })];
if (full) {
  const fullHtml = `${head(`  <style>\n${css}</style>\n  <script src="${SDK}"></script>`)}  <script>\n(() => {\n${js}})();\n</script>\n</body>\n</html>\n`;
  made.push(writeZip('emberwrath-crazygames-komplett.zip', { 'index.html': fullHtml }));
}
console.log(`CrazyGames: ${made.join(', ')}; Spielcode unter dist/site/crazygames/ (lädt von ${base})`);
