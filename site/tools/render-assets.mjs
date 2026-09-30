import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'assets';
const HEROES = { warrior: ['human', ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade']],
  rogue: ['emberborn', ['nightwhisper', 'nightstalker_coat', 'shadowstep_boots', 'ember_grips']],
  ranger: ['elf', ['starfall', 'nightstalker_coat', 'shadowstep_boots']],
  mage: ['dwarf', ['worldstaff', 'arcane_robe', 'shadowstep_boots']] };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8102/index.html');
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
const files = await p.evaluate(async (HEROES) => {
  const g = window.emberfall;
  const { logoCanvas } = await import('/src/gfx/Logo.js');
  const { iconCanvas, abilityIcon } = await import('/src/gfx/Icons.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { CLASSES, ABILITIES } = await import('/src/character/classes.js');
  const out = {};
  const png = (c) => c.toDataURL('image/png');
  // Auf die Figur zuschneiden (Sprites haben viel leeren Rand für Waffen und Effekte)
  const trim = (src, pad = 2) => {
    const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1 + pad * 2; c.height = y1 - y0 + 1 + pad * 2;
    c.getContext('2d').drawImage(src, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  };
  out['logo.png'] = png(logoCanvas());
  for (const [cls, [race, gear]] of Object.entries(HEROES)) {
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); equipment[d.slot] = id; }
    const set = getHeroSprites(race, cls, 0, resolveGear(equipment, g.content), null);
    const idle = typeof set.idle === 'function' ? set.idle() : set.idle;
    out[`held-${cls}.png`] = png(trim(idle.frames[0].canvas));
    for (const a of CLASSES[cls].abilities) out[`skill-${a}.png`] = png(iconCanvas(abilityIcon(a, ABILITIES[a])));
  }
  return out;
}, HEROES);
for (const [f, url] of Object.entries(files)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(files).join(' '));
await b.close();
