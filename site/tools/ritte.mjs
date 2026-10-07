// Reiter im Lauf für die Startseite: alle Frames von 'rideRun' (Reittier läuft, Reiter wippt mit) als waagrechter
// Streifen, jeder Frame gleich groß und am selben Fußpunkt. Die Seite schiebt den Streifen mit steps() durch,
// im Takt des Spiels (Maße und fps gibt das Skript aus). Ausrüstung wie in render40.mjs.
//   npx http-server . -p 8102 -s &     (Module direkt aus dem Projektordner)
//   node site/tools/ritte.mjs site/img
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'ritte'; mkdirSync(OUT, { recursive: true });
const BASE = process.env.EW_URL ?? 'http://localhost:8102';
const RIDERS = {
  hellhound: ['emberborn', 'warrior', ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade']],
  rime_drake: ['elf', 'ranger', ['skalvyr_rib_bow', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  cinder_drake: ['human', 'warrior', ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'kingsbane']],
  nightmare_steed: ['emberborn', 'rogue', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  frost_elk: ['elf', 'ranger', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  ash_wolf: ['dwarf', 'mage', ['staff_of_last_ash', 'colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
  ember_charger: ['human', 'warrior', ['tyrant_helm', 'khar_hauberk', 'khar_grips', 'khar_boots', 'kingsbane']],
  bone_stallion: ['dwarf', 'warrior', ['rimeforged_coif', 'hillking_cuirass', 'hillking_gauntlets', 'kingsbane']],
  spore_beetle: ['elf', 'mage', ['staff_of_last_ash', 'rotmother_hood', 'rotmother_robe', 'rotmother_gloves']],
};
const ONLY = process.argv[3]?.split(',');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 30000 });
const res = await p.evaluate(async ({ RIDERS, ONLY }) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { animsForLook } = await import('/src/character/mounts.js');
  const out = {}, meta = {}, log = [];
  const S = 600, AX = 300, AY = 420;
  for (const [mountId, [raceId, classId, gear]] of Object.entries(RIDERS)) {
    if (ONLY && !ONLY.includes(mountId)) continue;
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push('fehlt ' + id); }
    const look = { raceId, classId, gear: resolveGear(equipment, g.content), mountId };
    const anim = animsForLook(g.content, look, 2).rideRun;
    // Jeden Frame auf eine große Fläche am selben Fußpunkt zeichnen, dann gemeinsamen Rahmen suchen
    const cs = anim.frames.map((fr) => { const c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; fr.draw(x, AX, AY, {}); return c; });
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const c of cs) {
      const d = c.getContext('2d').getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const pad = 1, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2;
    const sheet = document.createElement('canvas'); sheet.width = w * cs.length; sheet.height = h;
    const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
    cs.forEach((c, i) => sx.drawImage(c, x0 - pad, y0 - pad, w, h, i * w, 0, w, h));
    out[`ritt-${mountId}-lauf.png`] = sheet.toDataURL('image/png');
    meta[mountId] = { w, h, frames: cs.length, fps: anim.fps };
  }
  return { out, meta, log };
}, { RIDERS, ONLY });
for (const [f, url] of Object.entries(res.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(res.log.join('\n')); console.log(JSON.stringify(res.meta));
await b.close();
