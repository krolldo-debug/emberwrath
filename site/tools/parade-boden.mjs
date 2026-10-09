// Boden für die Reittier-Parade der Startseite: ein breiter Streifen echter Aschensteppe (Spielgrafik, Qualität „Hoch“
// = 2 Texel je Weltpixel), über den die Seite die Reiter von links nach rechts galoppieren lässt.
// Mehrere Kamerabilder nebeneinander, die Kamera rückt jeweils um genau eine Bildbreite (480 Weltpixel) weiter,
// damit die Nahtstellen pixelgenau passen (wird am Ende mit einem versetzten Kontrollbild geprüft).
// Beim Zeichnen weg: Held, Gegner, NPCs, Begleiter, Geschosse, Effekte, Partikel, Questpfad, Systeme (Gruppe usw.),
// alle Punktlichter (nur das Umgebungslicht der Zone bleibt; es ist recht dunkel, daher Aufhellung wie bei keyart.mjs,
// nur kräftiger, siehe GRADE) und jede hohe oder leuchtende Deko (Jurten, Wegmarken, Laternen, Karren …).
// Ausschnitt: die Weide südlich der Steppenwacht, vom westlichen Randhügel über die Heerstraße bis an die rote Erde vor der
// Rotschlucht (Welt x 0–1080, y 860–964). Breiter geht es nirgends ohne Schlucht, Tafelberg, Lager oder Salzsee: die
// Rotschlucht teilt die Karte bei x ≈ 1000–1450, östlich davon liegen Knochensenke, Flussbett und Faulmarschrand.
// Dornbüsche fallen auch weg (dunkelrot, wirken im Streifen wie ein Kadaver).
// Aufruf: node parade-boden.mjs [OUT.webp] [URL]; Standard site/img/parade-boden.webp, Server :8103 = Repo-Wurzel.
// Zwischenbilder (PNG) landen in $ZWISCHEN/parade-boden (Standard /tmp).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUT = join(HERE, '../img/parade-boden.webp'), URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'parade-boden');
mkdirSync(TMP, { recursive: true });
// Ausschnitt in Weltpixeln (Karte 2560 × 1664); per Umgebungsvariable REGION='[x, y, w, h]' änderbar
const [X0, Y0, WW, HH] = process.env.REGION ? JSON.parse(process.env.REGION) : [0, 860, 1080, 104];
const K = 2;                                   // Texel je Weltpixel bei Qualität „Hoch“
// Deko, die stehen bleibt (Namen aus sprites/decor_steppe.js): Grasbüschel, Felsbrocken, Salzkruste, Schilf
const KEEP = (process.env.KEEP ?? 'steppeGrass,boulders,saltCrust,reeds').split(',');
const GRADE = process.env.GRADE ?? 'brightness(1.85) contrast(1.1) saturate(1.1)';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(URL);
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 90000 });
// Volle Bildqualität erzwingen: „Auto“ senkt sie im Headless-Browser sonst auf 480 × 270
await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
await p.evaluate(async () => {
  const g = window.emberfall;
  g.prefs.set('muted', true); g.prefs.set('guidePath', false);
  const acc = g.save.createAccount('Zolva'); g.login(acc.id);
  g.newGame({ character: { name: 'Zolva', raceId: 'human', classId: 'warrior' } });
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 0; i < 40; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
  g.scenes.current.travel('ashen_steppe', 'start');
  await new Promise((r) => setTimeout(r, 2500));
});
await p.addStyleTag({ content: '#ui{display:none!important}' });
await p.waitForTimeout(500);

// Ein Kamerabild mit linker oberer Ecke (cx, cy) in Weltpixeln; liefert PNG (data-URL) mit Farbkorrektur
const shot = (cx, cy) => p.evaluate(async ({ cx, cy, KEEP, GRADE, X0, Y0, WW, HH }) => {
  const g = window.emberfall, s = g.scenes.current, w = s.world, cam = s.camera;
  g.loop.running = false;
  await new Promise((r) => requestAnimationFrame(r));
  // nur niedrige Naturdeko behalten: Decor-Objekte, deren Sprite aus einem der KEEP-Einträge des Deko-Satzes stammt
  const set = g.assets.sprites[w.dungeon.level.decorSet] ?? {}, ok = new Set();
  for (const k of KEEP) for (const e of [set[k]].flat()) if (e?.sprite) ok.add(e.sprite);
  const flat = (d) => ok.has(d.sprite) && !d.o?.light && !d.o?.flames;
  const sv = { actors: w.actors, entities: w.entities, projectiles: w.projectiles, effects: w.effects, lights: w.lights, props: w.props };
  const sys = s.systems, P = w.particles, pd = [P.drawShadows, P.drawLit, P.drawEmissive], gr = [w.guide.render, w.guide.renderEmissive];
  const inR = (d) => d.x > X0 - 40 && d.x < X0 + WW + 40 && d.y > Y0 - 10 && d.y < Y0 + HH + 60;
  const dropped = {};
  for (const d of w.props) if (inR(d) && !flat(d)) { const h = Math.round(d.sprite?.canvas ? d.sprite.canvas.height / (d.sprite.res || 1) : 0); dropped[h] = (dropped[h] ?? 0) + 1; }
  Object.assign(w, { actors: [], entities: [], projectiles: [], effects: [], lights: [], props: w.props.filter(flat) });
  s.systems = [];
  P.drawShadows = P.drawLit = P.drawEmissive = () => {};
  w.guide.render = w.guide.renderEmissive = () => {};
  const F = Object.getPrototypeOf(g.font), fd = F.draw; F.draw = () => {};
  const saved = { x: cam.x, y: cam.y, sx: cam.shakeX, sy: cam.shakeY, kx: cam.kickX, ky: cam.kickY };
  Object.assign(cam, { x: cx, y: cy, shakeX: 0, shakeY: 0, kickX: 0, kickY: 0 });
  s.hurtFlash = 0; w.lighting.ambientBoost = 0;
  try { g.render(0); } finally {
    Object.assign(w, sv); s.systems = sys; [P.drawShadows, P.drawLit, P.drawEmissive] = pd; [w.guide.render, w.guide.renderEmissive] = gr; F.draw = fd;
    Object.assign(cam, { x: saved.x, y: saved.y, shakeX: saved.sx, shakeY: saved.sy, kickX: saved.kx, kickY: saved.ky });
  }
  const v = g.view, c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
  const x = c.getContext('2d'); x.filter = GRADE; x.drawImage(v, 0, 0);
  return { url: c.toDataURL('image/png'), vw: v.width, vh: v.height, dropped };
}, { cx, cy, KEEP, GRADE, X0, Y0, WW, HH });

// Kamera so, dass der Streifen senkrecht in der Bildmitte liegt (Deko ober- und unterhalb wird noch gezeichnet)
const first = await shot(X0, Y0);
const VW = first.vw / K, VH = first.vh / K;
const CY = Math.round(Y0 - (VH - HH) / 2), top = (Y0 - CY) * K;
const n = Math.ceil(WW / VW), files = [];
let dropped = {};
for (let i = 0; i < n; i++) {
  const r = await shot(X0 + i * VW, CY);
  const f = join(TMP, `teil-${i}.png`); writeFileSync(f, Buffer.from(r.url.split(',')[1], 'base64')); files.push(f);
  dropped = r.dropped;
}
// Kontrollbild um eine halbe Bildbreite versetzt: muss die Naht zwischen Teil 0 und 1 deckungsgleich enthalten
const ctl = await shot(X0 + VW / 2, CY);
const ctlF = join(TMP, 'kontrolle.png'); writeFileSync(ctlF, Buffer.from(ctl.url.split(',')[1], 'base64'));
await b.close();

// Zusammensetzen, zuschneiden, verlustfrei als WebP speichern; Naht gegen das Kontrollbild prüfen
const py = `
import sys, json
from PIL import Image, ImageChops
files, ctl, out, top, W, H, K, VW = json.loads(sys.argv[1])
parts = [Image.open(f).convert('RGB') for f in files]
pw, ph = parts[0].size
full = Image.new('RGB', (pw * len(parts), ph))
for i, im in enumerate(parts): full.paste(im, (i * pw, 0))
strip = full.crop((0, top, W * K, top + H * K))
strip.save(out, 'WEBP', lossless=True, quality=100, method=6)
c = Image.open(ctl).convert('RGB')
ref = full.crop((VW * K // 2, 0, VW * K // 2 + pw, ph))
d = ImageChops.difference(ref, c).getbbox()
print(json.dumps({'size': strip.size, 'seam_diff_bbox': d}))
`;
const res = JSON.parse(execFileSync('python3', ['-c', py, JSON.stringify([files, ctlF, OUT, top, WW, HH, K, VW])]).toString());
console.log(`Ausschnitt Welt x ${X0}–${X0 + WW}, y ${Y0}–${Y0 + HH}; ${n} Kamerabilder à ${VW}×${VH} Weltpixel`);
console.log('ausgeblendete hohe Deko (Höhe: Anzahl):', JSON.stringify(dropped));
console.log(`Naht-Kontrolle: Unterschied ${res.seam_diff_bbox ? 'in ' + JSON.stringify(res.seam_diff_bbox) : 'keiner'}`);
console.log(`${OUT}: ${res.size[0]} × ${res.size[1]} px, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
