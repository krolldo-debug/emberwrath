// Bosskino der Startseite (site/bosskino.js zeichnet es live auf ein Canvas, Abschnitt #bosse):
// Die vier Bosse als eigene Pixel-Art in Seitenansicht, riesig in ihrem Gebiet, je mit einer Signatur-Attacke.
// Gleiches Prinzip wie das Titelbild (tools/titel-held.mjs): ein Szenenraster für alle Ebenen (560 × 216 Szenenpixel),
// jede Ebene und jede Figur 1:1 darin, ganzzahlig vergrößert, keine Ebene skaliert oder verzerrt.
// Gezeichnet in Python (tools/bosskino.py mit je einem Modul bosskino_<boss>.py): Ebenen (Ferne, Mitte, Boden mit
// Fugen, Vordergrund, je mit Glut-Ebene), Figur in Ruhe aus Teilen mit eigenen Zyklen, Attacke als ganze Bilder,
// Effekte als Bildfolgen. Je Boss ein Atlas img/bosskino-<boss>.webp (verlustfrei), Standbild img/bosskino.webp
// (Malgareth; ohne JS und bei reduzierter Bewegung). Maße, Bildfolgen und Ereignisse schreibt dieses Skript in den Block
// <bosskino.mjs> in site/bosskino.js.
// Aufruf: node site/tools/bosskino.mjs [bosse,kommagetrennt]   (ohne Angabe alle vier; braucht Python 3 mit numpy, Pillow)
// Zwischenbilder (Atlanten als PNG, Standbilder, Momentblätter) nach $ZWISCHEN/bosskino (Standard /tmp).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const IMG = join(HERE, '../img'), JS = join(HERE, '../bosskino.js');
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'bosskino');
mkdirSync(TMP, { recursive: true });
const only = process.argv[2] ?? '';

let raw;
try { raw = execFileSync('python3', [join(HERE, 'bosskino.py'), IMG, TMP, only], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] }); } catch { process.exit(1); }
const out = JSON.parse(raw.toString());
let total = 0;
for (const [f, n] of Object.entries(out.sizes)) { total += n; console.log(`${f.padEnd(26)} ${(n / 1024).toFixed(1).padStart(7)} KB`); }
console.log(`zusammen ${(total / 1024).toFixed(1)} KB; Zwischenbilder in ${TMP}`);

// Maße nach bosskino.js; bei Teilaufruf die übrigen Bosse aus dem bestehenden Block behalten
const src = readFileSync(JS, 'utf8');
const re = /  \/\/ <bosskino\.mjs>[\s\S]*?\/\/ <\/bosskino\.mjs>/;
const old = src.match(/  const META = (.*);\n  \/\/ <\/bosskino\.mjs>/);
const prev = old && old[1] !== 'null' ? JSON.parse(old[1]) : null;
const meta = out.meta;
if (prev && only) meta.bosse = { ...prev.bosse, ...meta.bosse };
const block = `  // <bosskino.mjs> – von tools/bosskino.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(meta)};\n  // </bosskino.mjs>`;
if (!re.test(src)) throw new Error('META-Block in bosskino.js nicht gefunden');
writeFileSync(JS, src.replace(re, block));
