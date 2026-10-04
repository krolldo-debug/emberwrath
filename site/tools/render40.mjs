// Stufe-40-Figuren: neue Bosse und Reiter auf Reittieren, direkt aus dem Spielcode.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'a40'; mkdirSync(OUT, { recursive: true });
const RIDERS = {
  cinder_drake: ['human', 'warrior', ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'kingsbane']],
  nightmare_steed: ['emberborn', 'rogue', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  frost_elk: ['elf', 'ranger', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  ash_wolf: ['dwarf', 'mage', ['staff_of_last_ash', 'colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
  ember_charger: ['human', 'warrior', ['tyrant_helm', 'khar_hauberk', 'khar_grips', 'khar_boots', 'kingsbane']],
  bone_stallion: ['dwarf', 'warrior', ['rimeforged_coif', 'hillking_cuirass', 'hillking_gauntlets', 'kingsbane']],
  spore_beetle: ['elf', 'mage', ['staff_of_last_ash', 'rotmother_hood', 'rotmother_robe', 'rotmother_gloves']],
  steppe_horse: ['human', 'ranger', ['dawnstring', 'khar_helm', 'khar_hauberk']],
  marsh_strider: ['emberborn', 'rogue', ['veilpiercer', 'bogdread_hood', 'bogdread_jerkin']],
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8102/index.html');
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 20000 });
const files = await p.evaluate(async ({ RIDERS }) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { animsForLook } = await import('/src/character/mounts.js');
  const { getMountSprites } = await import('/src/sprites/mounts.js');
  const { iconCanvas } = await import('/src/gfx/Icons.js');
  const mods = {
    ulgrim: ['/src/sprites/barrow_king.js', 'createUlgrimSprites'], rotmother: ['/src/sprites/rot_mother.js', 'createRotMotherSprites'],
    skalvyr: ['/src/sprites/frost_wyrm.js', 'createSkalvyrSprites'], malgareth: ['/src/sprites/ash_sovereign.js', 'createMalgarethSprites'],
  };
  const out = {}; const log = [];
  const png = (c) => c.toDataURL('image/png');
  const trim = (src, pad = 1) => {
    const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1 + pad * 2; c.height = y1 - y0 + 1 + pad * 2;
    c.getContext('2d').drawImage(src, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  };
  const drawFrame = (fr) => { const c = document.createElement('canvas'); c.width = 600; c.height = 600; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; fr.draw(x, 300, 400, {}); return trim(c); };
  const anim = (set, k) => (typeof set[k] === 'function' ? set[k]() : set[k]);
  for (const [name, [path, fn]] of Object.entries(mods)) {
    const set = (await import(path))[fn]();
    log.push(name + ': ' + Object.keys(set).join(','));
    for (const k of Object.keys(set)) { const a = anim(set, k); if (!a?.frames) continue; for (const i of [0, Math.floor(a.frames.length / 2)]) { const f = a.frames[i]; out[`boss-${name}-${k}${i}.png`] = png(trim(f.canvas ?? drawFrame(f))); } }
  }
  for (const [mountId, [raceId, classId, gear]] of Object.entries(RIDERS)) {
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push('fehlt ' + id); }
    const look = { raceId, classId, gear: resolveGear(equipment, g.content), mountId };
    const set = animsForLook(g.content, look, 2);
    out[`ritt-${mountId}.png`] = png(drawFrame(set.ride.frames[0]));
    const d = g.content.get('item', 'mount_' + mountId); if (d) out[`icon-mount_${mountId}.png`] = png(iconCanvas(d.icon));
  }
  for (const id of ['kingsbane', 'veilpiercer', 'dawnstring', 'staff_of_last_ash', 'sovereign_plate', 'sovereign_signet']) { const d = g.content.get('item', id); if (d) out[`item-${id}.png`] = png(iconCanvas(d.icon)); }
  return { out, log };
}, { RIDERS });
for (const [f, url] of Object.entries(files.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(files.log.join('\n')); console.log(Object.keys(files.out).length, 'Dateien');
await b.close();
