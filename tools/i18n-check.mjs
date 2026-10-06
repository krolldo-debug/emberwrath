// Listet deutsche Texte im Code, für die src/i18n/en.js (Spiel) noch keine englische Fassung hat.
// Aufruf: node tools/i18n-check.mjs [--json]   (ohne Abhängigkeiten, grobe Suche nach String-Literalen)
// Die Website prüft site/build-site.mjs beim Build selbst („Website /en/: N Texte ohne Übersetzung“).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Translator } from '../src/i18n/translate.js';
import { EN } from '../src/i18n/en.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tr = new Translator(EN);
const SKIP_DIRS = new Set(['test', 'sprites', 'i18n']);
const SKIP_FILES = new Set(['chatFilter.js']); // Wortlisten, keine Anzeige
// Deutsch erkennen: Umlaute oder typische kurze Wörter. Nur Texte mit mindestens einem Wort.
const GERMAN = /[äöüßÄÖÜ]|\b(und|der|die|das|den|dem|des|ein|eine|einen|nicht|mit|zu|im|ist|für|von|auf|du|dein|deine|noch|schon|wird|bitte|keine?)\b/;

function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(f)) files(p, out); } else if (f.endsWith('.js') && !SKIP_FILES.has(f)) out.push(p);
  }
  return out;
}

const found = new Map();
for (const file of files(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''));
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (let m; (m = re.exec(src));) {
    let s = m[1] ?? m[2] ?? m[3];
    if (m[3] != null) { let i = 0; s = s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${i++}}`); }
    s = s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
    if (s.includes('${')) continue; // verschachteltes Template: hier nicht sicher zu zerlegen
    for (s of s.split(/<[^>]+>/)) {
    if (!GERMAN.test(s) || !/[a-zäöü]{2,}\s|\s[a-zäöü]{2,}|^[A-ZÄÖÜ][a-zäöüß]+$/.test(s) || /^[\w.-]+\.(js|css|png)$|^https?:|^\s*[.#][\w-]+[\s{]/.test(s)) continue;
    if (tr.known(s.trim())) continue;
    const line = src.slice(0, m.index).split('\n').length;
    if (!found.has(s)) found.set(s, `${relative(root, file)}:${line}`);
    }
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(found), null, 1));
else {
  for (const [s, where] of found) console.log(`${where}\t${JSON.stringify(s)}`);
  console.log(`\n${found.size} Texte ohne englische Fassung (Einträge in src/i18n/en.js ergänzen; Schlüssel = deutscher Text, \${…} als {0}, {1} …).`);
}
