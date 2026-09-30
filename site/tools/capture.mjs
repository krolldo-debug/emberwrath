import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'shots';
const only = process.argv[3];
const GEAR = {
  warrior: ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade', 'ember_heart'],
  mage: ['worldstaff', 'arcane_robe', 'shadowstep_boots', 'ember_heart'],
  ranger: ['starfall', 'nightstalker_coat', 'shadowstep_boots', 'ember_grips'],
  rogue: ['nightwhisper', 'nightstalker_coat', 'shadowstep_boots', 'ember_grips'],
};
export const SHOTS = [
  { id: 'glutsenke', race: 'human', cls: 'warrior', zone: 'emberhollow', near: 'enemy', keys: ['q'], wait: 700 },
  { id: 'katakomben', race: 'dwarf', cls: 'warrior', zone: 'catacombs', near: 'enemy', keys: ['r'], wait: 500 },
  { id: 'aschenwald', race: 'elf', cls: 'ranger', zone: 'ashwood', near: 'enemy', keys: ['q'], wait: 400 },
  { id: 'tempel', race: 'human', cls: 'mage', zone: 'sunken_temple', near: 'enemy', keys: ['r'], wait: 600 },
  { id: 'schlackenhoehen', race: 'emberborn', cls: 'rogue', zone: 'cinder_peaks', near: 'enemy', keys: ['q'], wait: 400 },
  { id: 'glutschmiede', race: 'emberborn', cls: 'mage', zone: 'molten_forge', near: 'enemy', keys: ['q'], wait: 500 },
  { id: 'boss-varkhul', race: 'human', cls: 'warrior', zone: 'catacombs', near: 'boss', keys: ['t'], wait: 900 },
  { id: 'boss-nerith', race: 'elf', cls: 'mage', zone: 'sunken_temple', near: 'boss', keys: ['q'], wait: 800 },
  { id: 'boss-ignaroth', race: 'dwarf', cls: 'warrior', zone: 'molten_forge', near: 'boss', keys: ['q'], wait: 900 },
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const shot of SHOTS.filter((s) => !only || only.split(',').includes(s.id))) {
  for (const hud of [false, true]) {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    p.on('pageerror', (e) => console.log('ERR', shot.id, e.message));
    await p.goto('http://localhost:8101/emberfall.html');
    await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
    await p.evaluate(async ({ shot, gear }) => {
      const g = window.emberfall;
      g.prefs.set('muted', true); g.prefs.set('guidePath', false);
      const acc = g.save.createAccount('Demo'); g.login(acc.id);
      g.newGame({ character: { name: 'Zolva', raceId: shot.race, classId: shot.cls } });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(600);
      g.state.commit('progress:grantXp', { amount: 5e6, source: 'shot' });
      for (const id of gear) {
        g.state.commit('inventory:add', { itemId: id, qty: 1 });
        const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
        if (slot >= 0) g.state.commit('inventory:equip', { slot });
      }
      if (shot.zone !== 'emberhollow') { g.scenes.current.travel(shot.zone, 'start'); await wait(2500); }
      document.querySelectorAll('.ui-toasts, .ui-panels').forEach((e) => e.replaceChildren());
    }, { shot, gear: GEAR[shot.cls] });
    await p.waitForTimeout(1500);
    const pos = await p.evaluate(({ near }) => {
      const w = window.emberfall.scenes.current.world, h = w.hero;
      let t = null;
      if (near === 'boss') t = w.boss;
      else t = [...w.enemies].filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (t) { const d = near === 'boss' ? 58 : 34; h.x = t.x - d; h.y = t.y + (near === 'boss' ? 26 : 6); }
      return t ? [t.x, t.y, t.type ?? t.id] : null;
    }, shot);
    await p.waitForTimeout(1600);
    if (!hud) await p.addStyleTag({ content: '#ui{display:none!important}' });
    await p.mouse.move(1920 / 2 + 300, 1080 / 2);
    for (const k of shot.keys) await p.keyboard.press(k);
    await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up();
    await p.waitForTimeout(shot.wait);
    if (!hud) {
      const url = await p.evaluate(() => window.emberfall.view.toDataURL('image/png'));
      writeFileSync(`${OUT}/${shot.id}.png`, Buffer.from(url.split(',')[1], 'base64'));
    } else {
      await p.screenshot({ path: `${OUT}/${shot.id}-hud.png` });
    }
    console.log(shot.id, hud ? 'hud' : 'clean', JSON.stringify(pos));
    await p.close();
  }
}
await b.close();
