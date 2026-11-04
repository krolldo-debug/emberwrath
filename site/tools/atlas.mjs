// Weltkarte „Atlas“ der Seite Welt (welt.html, Abschnitt .atlas; atlas.js zeichnet Glutpfad und Funkeln live darüber).
// Die echten Gebietskarten des Spiels (ui/MapArt.js, 3 Bildpunkte je Kachel, wie auf der großen Karte im Spiel) liegen
// als Blätter untereinander, ein Glutpfad verbindet sie von der Glutsenke bis zum Aschethron; unter dem Thron reißt der
// Grund auf, dahinter liegen hinter einem Sternenschleier die Gebiete der Sternenglut (seit 04.11.2026 offen, ohne eigene Etappe).
//   1. Browser: Gebietskarten (renderZoneMap) als PNG nach $ZWISCHEN/atlas
//   2. Python (atlas.py): Blätter, Rahmen, Schleier, Pfad → site/img/atlas.webp + Maße
//   3. Maße und Pfad in den Block META von site/atlas.js, die Beschriftungen in den Block <atlas.mjs> von welt.html
// Aufruf (Server im Repo-Ordner, z. B. python3 -m http.server 8102): node site/tools/atlas.mjs [URL]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [BASE = 'http://localhost:8102'] = process.argv.slice(2);
const IMG = join(HERE, '../img'), JS = join(HERE, '../atlas.js'), HTML = join(HERE, '../welt.html');
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'atlas');
mkdirSync(TMP, { recursive: true });
const ZONES = ['emberhollow', 'ashwood', 'cinder_peaks', 'ashen_steppe', 'blighted_marsh', 'frostspire', 'ember_wastes', 'ashen_throne', 'splitterweiten', 'drifting_gardens'];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 90000 });
await p.evaluate(async () => {
  const g = window.emberfall; g.prefs.set('muted', true);
  const acc = g.save.createAccount('Atlas'); g.login(acc.id);
  g.newGame({ character: { name: 'Atlas', raceId: 'human', classId: 'warrior' } });
  await new Promise((r) => setTimeout(r, 800));
  for (let i = 0; i < 60; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
});
for (const z of ZONES) {
  const r = await p.evaluate(async (z) => {
    const g = window.emberfall; g.scenes.current.travel(z, 'start');
    await new Promise((r) => setTimeout(r, 2500));
    const { renderZoneMap } = await import('/src/ui/MapArt.js');
    const c = renderZoneMap(g.scenes.current.world, 3, { detail: true, frame: false });
    return c.toDataURL('image/png');
  }, z);
  writeFileSync(join(TMP, `${z}.png`), Buffer.from(r.split(',')[1], 'base64'));
}
await b.close();

const out = JSON.parse(execFileSync('python3', [join(HERE, 'atlas.py'), TMP, IMG], { cwd: HERE, maxBuffer: 1 << 26 }).toString());
out.meta.v = createHash('sha256').update(readFileSync(join(IMG, 'atlas.webp'))).digest('hex').slice(0, 10);
console.log(`atlas.webp ${(out.size / 1024).toFixed(1)} KB, ${out.meta.W} × ${out.meta.H}; Vorschau ${join(TMP, 'vorschau.png')}`);

const put = (file, re, block) => {
  const src = readFileSync(file, 'utf8'), next = src.replace(re, block);
  if (next === src && !src.includes(block)) throw new Error(`Block in ${file} nicht gefunden`);
  writeFileSync(file, next);
};
put(JS, /  \/\/ <atlas\.mjs>[\s\S]*?\/\/ <\/atlas\.mjs>/, `  // <atlas.mjs> – von tools/atlas.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(out.meta)};\n  // </atlas.mjs>`);
// Beschriftungen: Lage in Prozent der Karte, Name wie die Überschrift der Etappe (übersetzt), Stufen als Schild
const pct = (v, n) => `${+((v / n) * 100).toFixed(3)}%`;
const lab = out.meta.zonen.map((z) => {
  // Gebiete der rechten Spalte: Beschriftung an der rechten Kante, damit sie am Handy nicht über den Rand ragt
  const [x, y, w] = z.box, rechts = x + w / 2 > out.meta.W / 2;
  const pos = `${rechts ? `right:${pct(out.meta.W - x - w, out.meta.W)}` : `left:${pct(x, out.meta.W)}`};top:${pct(y, out.meta.H)}`;
  const inner = `<b>${z.name}</b><span class="schild">${z.stufe}</span>`;
  return z.ziel ? `        <a class="ort${rechts ? ' rechts' : ''}" style="${pos}" href="#${z.ziel}" data-i="${z.i}">${inner}</a>` : `        <span class="ort sterne${rechts ? ' rechts' : ''}" style="${pos}" data-i="${z.i}">${inner}</span>`;
}).join('\n');
put(HTML, /        <!-- <atlas\.mjs>[\s\S]*?<!-- <\/atlas\.mjs> -->/, `        <!-- <atlas.mjs> von tools/atlas.mjs geschrieben -->\n${lab}\n        <!-- </atlas.mjs> -->`);
