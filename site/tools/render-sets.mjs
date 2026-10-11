// Klassen-Sets im Shop (site/shop.html): jede Klasse einmal in gewöhnlicher Ausrüstung („Vorher“) und einmal im Set
// („Nachher“), Ruhe-Animation aus dem Spielcode (getHeroSprites, RES 2), Leuchtpunkte hart wie in reittiere-gang.mjs.
// Ergebnis je Klasse: set-<klasse>.png = zwei Reihen (oben Vorher, unten Nachher), alle Bilder gleich groß, gleicher Fußpunkt.
// Maße stehen in der Ausgabe und gehören an .set-fig in site/shop.html (data-f = Breite Höhe FußX FußY Bilder fps).
// Bis der Thread „Klassen-Skinsets“ die echten Sets liefert, stehen hier legendäre Sets aus dem Spiel als Platzhalter;
// danach nur AFTER (und ggf. dye) ersetzen und neu rendern.
//   npx http-server . -p 8102 -s &     (Module direkt aus dem Projektordner)
//   node site/tools/render-sets.mjs site/img [klassen]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'sets'; mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3]?.split(',');
const BASE = process.env.EW_URL ?? 'http://localhost:8102';
// Klasse: [Volk, Vorher-Ausrüstung, Nachher-Ausrüstung, Färbung Nachher]
const LOOKS = {
  warrior: ['human', ['iron_helm', 'iron_cuirass', 'borderwatch_gauntlets', 'ironshod_boots', 'steel_blade'],
    ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'kingsbane'], null],
  rogue: ['emberborn', ['leather_cap', 'nightstalker_vest', 'leather_gloves', 'traveler_boots', 'desert_kris'],
    ['wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots', 'veilpiercer'], null],
  ranger: ['elf', ['trackers_hood', 'hunter_leather', 'suede_grips', 'hunters_boots', 'longbow'],
    ['bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots', 'dawnstring'], null],
  mage: ['elf', ['wanderer_hood', 'mage_robe', 'linen_gloves', 'linen_shoes', 'crystal_staff'],
    ['colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers', 'staff_of_last_ash'], null],
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 30000 });
const res = await p.evaluate(async ({ LOOKS, ONLY }) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const out = {}, meta = {}, log = [];
  const S = 400, AX = 200, AY = 320, RES = 2;
  const frames = (raceId, classId, gear, dye) => {
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push(`fehlt ${id}`); }
    const anim = getHeroSprites(raceId, classId, 0, resolveGear(equipment, g.content), dye ? { dye, hairStyle: null } : null, RES).idle;
    return { fps: anim.fps ?? 6, list: anim.frames.map((fr) => {
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.setTransform(RES, 0, 0, RES, 0, 0);
      fr.draw(x, AX / RES, AY / RES, {});
      for (const gl of fr.glows ?? []) {
        const gx = Math.round(AX / RES + gl.x), gy = Math.round(AY / RES + gl.y), r = Math.max(1, Math.min(4, Math.round(gl.r)));
        x.globalAlpha = 0.2; x.fillStyle = gl.color;
        x.fillRect(gx - r, gy - r + 1, r * 2 + 1, r * 2 - 1); x.fillRect(gx - r + 1, gy - r, r * 2 - 1, r * 2 + 1);
        x.globalAlpha = 0.9; x.fillRect(gx, gy, 1, 1); x.globalAlpha = 1;
      }
      return c;
    }) };
  };
  for (const [cls, [raceId, before, after, dye]] of Object.entries(LOOKS)) {
    if (ONLY && !ONLY.includes(cls)) continue;
    const A = frames(raceId, cls, before, null), B = frames(raceId, cls, after, dye);
    const n = Math.max(A.list.length, B.list.length);
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const c of [...A.list, ...B.list]) {
      const d = c.getContext('2d').getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    // Rahmen in ganzen Weltpixeln, Fußpunkt auf einem Weltpixel
    const pad = 2;
    x0 = AX - Math.ceil((AX - x0 + pad) / RES) * RES; y0 = AY - Math.ceil((AY - y0 + pad) / RES) * RES;
    x1 = AX + Math.ceil((x1 - AX + pad) / RES) * RES; y1 = AY + Math.max(2, Math.ceil((y1 - AY + pad) / RES)) * RES;
    const w = x1 - x0, h = y1 - y0;
    const sheet = document.createElement('canvas'); sheet.width = w * n; sheet.height = h * 2;
    const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
    for (let i = 0; i < n; i++) {
      sx.drawImage(A.list[i % A.list.length], x0, y0, w, h, i * w, 0, w, h);
      sx.drawImage(B.list[i % B.list.length], x0, y0, w, h, i * w, h, w, h);
    }
    out[`set-${cls}.png`] = sheet.toDataURL('image/png');
    meta[cls] = { w: w / RES, h: h / RES, res: RES, frames: n, fps: B.fps, foot: { x: (AX - x0) / RES, y: (AY - y0) / RES } };
  }
  return { out, meta, log };
}, { LOOKS, ONLY });
for (const [f, url] of Object.entries(res.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
if (res.log.length) console.log(res.log.join('\n'));
for (const [cls, m] of Object.entries(res.meta)) console.log(`${cls}: data-f="${m.w} ${m.h} ${m.foot.x} ${m.foot.y} ${m.frames} ${m.fps}"`);
await b.close();
