// Titelbild der Startseite „Der Himmel reißt auf“ (site/titel.js zeichnet es live auf ein Canvas, Abschnitt .hero).
// Nacht über der Glutöde, über dem Aschethron reißt der Himmel auf und zeigt die Inseln der Sternenglut; die vier Klassen
// stehen auf einer Felsnase und blicken hinüber.
//   1. Browser: die echten Heldenfiguren des Spiels im Feinraster (getHeroSprites, RES 2): Ruhe und je ein Moment
//      (Krieger Erdspalter, Waldläuferin Pfeilhagel, Glutmagierin Zauber, Schurke Ausfall), ein Bildstreifen je Held.
//   2. Python (titel-riss.py): Himmel, Riss (Bildfolge), Ferne mit Aschethron, Ebene mit Lavastrom (Bildfolge),
//      Felsnase, Standbild titel.webp – alles in Szenenpixeln, ganzzahlig ×2 im Feinraster, harte Rampen.
//   3. Maße und Bildfolgen in den Block META von site/titel.js.
// Aufruf (Server im Repo-Ordner, z. B. python3 -m http.server 8102): node site/tools/titel-riss.mjs [URL]
// Zwischenbilder und Vorschau nach $ZWISCHEN/titel-riss (Standard /tmp).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [BASE = 'http://localhost:8102'] = process.argv.slice(2);
const IMG = join(HERE, '../img'), JS = join(HERE, '../titel.js');
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'titel-riss');
mkdirSync(TMP, { recursive: true });
// Held: Volk, Klasse, Ausrüstung (Endgame-Sets wie auf der Seite), Moment-Animation des Spiels
const HELDEN = {
  ranger: ['elf', 'ranger', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots'], 'rainshot'],
  mage: ['dwarf', 'mage', ['staff_of_last_ash', 'colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers'], 'cast'],
  warrior: ['human', 'warrior', ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'kingsbane'], 'slam'],
  rogue: ['emberborn', 'rogue', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'], 'lunge'],
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 60000 });
const res = await p.evaluate(async (HELDEN) => {
  const g = window.emberfall, log = [];
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const S = 400, AX = 200, AY = 300, RES = 2;
  const render = (fr) => {
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.setTransform(RES, 0, 0, RES, 0, 0);
    fr.draw(x, AX / RES, AY / RES, {}); x.setTransform(1, 0, 0, 1, 0, 0);
    const id = x.getImageData(0, 0, S, S); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] < 128 ? 0 : 255;
    x.putImageData(id, 0, 0); return c;
  };
  const rows = [], helden = {};
  for (const [k, [raceId, classId, gear, mom]] of Object.entries(HELDEN)) {
    const eq = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) eq[d.slot] = id; else log.push(`fehlt ${id}`); }
    const set = getHeroSprites(raceId, classId, 0, resolveGear(eq, g.content), null, RES);
    const an = (n) => (typeof set[n] === 'function' ? set[n]() : set[n]);
    const idle = an('idle'), m = an(mom);
    const list = [...idle.frames, ...m.frames].map(render);
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const c of list) { const d = c.getContext('2d').getImageData(0, 0, S, S).data; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    x0 -= x0 & 1; y0 -= y0 & 1; const w = ((x1 - x0 + 2) >> 1) << 1, h = Math.max(((y1 - y0 + 2) >> 1) << 1, AY - y0 + 2);
    rows.push({ k, list, x0, y0, w, h });
    helden[k] = { w, h, fx: AX - x0, fy: AY - y0, ruhe: idle.frames.length, ruheFps: idle.fps ?? 6, moment: mom, n: m.frames.length, fps: m.fps ?? 12 };
  }
  const SW = Math.max(...rows.map((r) => r.w * r.list.length)), SH = rows.reduce((s, r) => s + r.h, 0);
  const sh = document.createElement('canvas'); sh.width = SW; sh.height = SH;
  const sx = sh.getContext('2d'); let row = 0;
  for (const r of rows) { r.list.forEach((c, i) => sx.drawImage(c, r.x0, r.y0, r.w, r.h, i * r.w, row, r.w, r.h)); helden[r.k].row = row; row += r.h; }
  return { png: sh.toDataURL('image/png'), helden, log };
}, HELDEN);
writeFileSync(join(TMP, 'helden.png'), Buffer.from(res.png.split(',')[1], 'base64'));
writeFileSync(join(TMP, 'helden.json'), JSON.stringify({ helden: res.helden }));
if (res.log.length) console.log(res.log.join('\n'));
await b.close();

const out = JSON.parse(execFileSync('python3', [join(HERE, 'titel-riss.py'), TMP, IMG], { cwd: HERE, maxBuffer: 1 << 26 }).toString());
{
  const h = createHash('sha256');
  for (const f of Object.keys(out.sizes).sort()) h.update(readFileSync(join(IMG, f)));
  out.meta.v = h.digest('hex').slice(0, 10);
}
let total = 0;
for (const [f, n] of Object.entries(out.sizes)) { total += n; console.log(`${f.padEnd(24)} ${(n / 1024).toFixed(1).padStart(7)} KB`); }
console.log(`zusammen ${(total / 1024).toFixed(1)} KB; Vorschau ${join(TMP, 'vorschau.png')}`);

const src = readFileSync(JS, 'utf8');
const block = `  // <titel-riss.mjs> – von tools/titel-riss.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(out.meta)};\n  // </titel-riss.mjs>`;
const next = src.replace(/  \/\/ <titel-riss\.mjs>[\s\S]*?\/\/ <\/titel-riss\.mjs>/, block);
if (next === src && !src.includes(block)) throw new Error('META-Block in titel.js nicht gefunden');
writeFileSync(JS, next);
