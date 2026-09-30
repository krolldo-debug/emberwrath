// Rendert Pixel-Art direkt aus dem Spielcode: Helden in legendärer Ausrüstung, Bosse, Fähigkeits- und Gegenstandssymbole, NPC-Porträts.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'assets2'; mkdirSync(OUT, { recursive: true });
const HEROES = {
  warrior: ['human', ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'kingsbane']],
  rogue: ['emberborn', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  ranger: ['elf', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  mage: ['elf', ['staff_of_last_ash', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
};
const POSES = { idle: [0], atk1: [2, 3], atk2: [3], spin: [1], cast: [2, 3], slam: [3], lunge: [3], hurl: [3], rainshot: [2] };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8102/index.html');
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 20000 });
const files = await p.evaluate(async ({ HEROES, POSES }) => {
  const g = window.emberfall;
  const { logoCanvas } = await import('/src/gfx/Logo.js');
  const { iconCanvas, abilityIcon } = await import('/src/gfx/Icons.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { CLASSES, ABILITIES } = await import('/src/character/classes.js');
  const { createBonelordSprites } = await import('/src/sprites/bonelord.js');
  const { createIgnarothSprites } = await import('/src/sprites/ignaroth.js');
  const { createNerithSprites } = await import('/src/sprites/nerith.js');
  const { npcPortrait } = await import('/src/gfx/Portraits.js');
  const out = {};
  const png = (c) => c.toDataURL('image/png');
  const trim = (src, pad = 1) => {
    const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1 + pad * 2; c.height = y1 - y0 + 1 + pad * 2;
    c.getContext('2d').drawImage(src, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  };
  const anim = (set, k) => (typeof set[k] === 'function' ? set[k]() : set[k]);
  out['logo.png'] = png(logoCanvas());
  for (const [cls, [race, gear]] of Object.entries(HEROES)) {
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; }
    const set = getHeroSprites(race, cls, 0, resolveGear(equipment, g.content), null, 2);
    for (const [k, fr] of Object.entries(POSES)) { const a = anim(set, k); if (!a) continue; for (const i of fr) if (a.frames[i]) out[`held-${cls}-${k}${i}.png`] = png(trim(a.frames[i].canvas)); }
    for (const a of CLASSES[cls].abilities) out[`skill-${a}.png`] = png(iconCanvas(abilityIcon(a, ABILITIES[a])));
  }
  for (const [name, set] of [['varkhul', createBonelordSprites()], ['ignaroth', createIgnarothSprites()], ['nerith', createNerithSprites()]]) {
    for (const k of ['idle', 'roar', 'cast', 'cleave', 'slam', 'sweep', 'breath']) { const a = anim(set, k); if (!a) continue; for (const i of [0, Math.floor(a.frames.length / 2)]) out[`boss-${name}-${k}${i}.png`] = png(trim(a.frames[i].canvas)); }
  }
  for (const id of ['crown_of_embers_blade', 'nightwhisper', 'starfall', 'worldstaff', 'tyrant_plate', 'ember_heart', 'tyrant_helm', 'emberwarden_mail']) {
    const d = g.content.get('item', id); if (d) out[`item-${id}.png`] = png(iconCanvas(d.icon));
  }
  for (const [race, cls] of [['human', 'warrior'], ['dwarf', 'warrior'], ['elf', 'ranger'], ['emberborn', 'mage']]) out[`volk-${race}.png`] = png(trim(anim(getHeroSprites(race, cls, 0, null, null, 2), 'idle').frames[0].canvas));
  for (const id of ['elder_maren', 'warden_ilsa', 'commander_hale', 'seer_ysolde', 'smith_brom']) out[`npc-${id}.png`] = png(npcPortrait(id));
  return out;
}, { HEROES, POSES });
for (const [f, url] of Object.entries(files)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(files).length, 'Dateien');
await b.close();
