// Shop-Designs: Reiter auf den exklusiven Reittieren und Symbole, direkt aus dem Spielcode (für site/shop.html).
// Aufruf: npx http-server . -p 8102 -s &  dann  node site/tools/render-shop.mjs site/img
// Ergebnis je Design: shop-<mountId>.png = Bildstreifen der Laufanimation (rideRun, mit Leuchten), alle Bilder gleich groß.
// Die Bildgröße steht in der Ausgabe und gehört in site/shop.html (data-frame-w / data-frames).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'shop-render'; mkdirSync(OUT, { recursive: true });
const RIDERS = {
  phoenix_wing: ['human', 'warrior', ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'kingsbane'], 'phoenix'],
  astral_stallion: ['elf', 'mage', ['staff_of_last_ash', 'colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers'], 'starnight'],
  soul_wolf: ['emberborn', 'rogue', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'], 'soullight'],
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8102/index.html');
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 20000 });
const files = await p.evaluate(async ({ RIDERS }) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { animsForLook } = await import('/src/character/mounts.js');
  const out = {}; const log = [];
  const png = (c) => c.toDataURL('image/png');
  // Rahmen mit Leuchten (wie Hero.renderEmissive: additive weiche Kreise), damit die Glut sichtbar ist
  const drawFrame = (fr, glow) => {
    // In Feinpixeln zeichnen (res 2): sonst rechnet der Browser die Feinpixel weich herunter
    const c = document.createElement('canvas'); c.width = 400; c.height = 400; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.save(); x.scale(2, 2); fr.draw(x, 100, 150, {}); x.restore();
    if (glow) {
      x.globalCompositeOperation = 'lighter';
      for (const gl of fr.glows ?? []) {
        const r = gl.r * 2 * 2.2, gx = 200 + gl.x * 2, gy = 300 + gl.y * 2;
        const grad = x.createRadialGradient(gx, gy, 0, gx, gy, r);
        grad.addColorStop(0, gl.color + 'aa'); grad.addColorStop(1, gl.color + '00');
        x.fillStyle = grad; x.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
    }
    return c;
  };
  // Gemeinsamer Ausschnitt aller Bilder, damit die Animation nicht springt
  const strip = (canvases) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const c of canvases) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const w = x1 - x0 + 3, hh = y1 - y0 + 3;
    const out = document.createElement('canvas'); out.width = w * canvases.length; out.height = hh;
    canvases.forEach((c, i) => out.getContext('2d').drawImage(c, x0 - 1, y0 - 1, w, hh, i * w, 0, w, hh));
    return { canvas: out, w, h: hh, n: canvases.length };
  };
  for (const [mountId, [raceId, classId, gear, dye]] of Object.entries(RIDERS)) {
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push('fehlt ' + id); }
    const look = { raceId, classId, gear: resolveGear(equipment, g.content), mountId, appearance: { variant: 1, dye } };
    const set = animsForLook(g.content, look, 2);
    const st = strip(set.rideRun.frames.map((f) => drawFrame(f, true)));
    out[`shop-${mountId}.png`] = png(st.canvas);
    log.push(`shop-${mountId}.png: ${st.n} Bilder à ${st.w} × ${st.h}`);
  }
  return { out, log };
}, { RIDERS });
for (const [f, url] of Object.entries(files.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(files.log.join('\n')); console.log(Object.keys(files.out).length, 'Dateien');
await b.close();
