// Spannende Kampfszenen: Held Stufe 20 mit bester Ausrüstung, Ultimates gegen Boss oder Gruppe.
// Nimmt je Szene eine Serie von Bildern auf (view-Canvas), die beste wird von Hand gewählt.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = 'action', only, URL = 'http://localhost:8101/emberfall.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const TYRANT = ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'ember_heart'];
const WARDEN = ['emberwarden_helm', 'emberwarden_mail', 'emberwarden_gauntlets', 'emberwarden_boots', 'ember_heart'];
const CLS = {
  warrior: ['human', ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade', 'ember_heart']],
  rogue: ['emberborn', ['nightwhisper', 'nightstalker_coat', 'ember_grips', 'shadowstep_boots', 'ember_heart']],
  ranger: ['elf', ['starfall', 'hunter_leather', 'wanderer_hood', 'borderwatch_gauntlets', 'shadowstep_boots', 'ember_heart']],
  mage: ['elf', ['worldstaff', 'arcane_robe', 'silk_gloves', 'shadowstep_boots', 'ember_heart']],
};
const W = (id, cls, zone, dist, seq, extra = {}) => ({ id, race: CLS[cls][0], cls, gear: CLS[cls][1], zone, target: 'cluster', dist, zoom: 0.8, seq, ...extra });
export const SCENES = [
  // Regionen für /welt: eng um das Geschehen (zoom 0,42–0,45), Bild für die Seite von Hand gewählt
  W('welt-aschenwald', 'warrior', 'ashwood', 35, [['q', 0]], { zoom: 0.45, target: 'few' }),
  W('welt-glutsenke', 'warrior', 'emberhollow', 30, [['q', 0]], { zoom: 0.42 }),
  W('welt-katakomben', 'mage', 'catacombs', 60, [['t', 250], ['q', 0]], { zoom: 0.42 }),
  W('welt-tempel', 'warrior', 'sunken_temple', 30, [['g', 250], ['q', 0]], { zoom: 0.42 }),
  W('welt-schlacke', 'mage', 'cinder_peaks', 70, [['g', 300], ['t', 0]], { zoom: 0.42 }),
  W('welt-schmiede', 'warrior', 'molten_forge', 45, [['g', 250], ['q', 0]], { zoom: 0.42 }),
  { id: 'titel', race: 'human', cls: 'warrior', gear: CLS.warrior[1], zone: 'molten_forge', target: 'boss', dist: 40, zoom: 0.66, shift: [-50, -6], seq: [['g', 250], ['q', 0]] },
  { id: 'krieger-ignaroth', race: 'human', cls: 'warrior', gear: [...TYRANT, 'crown_of_embers_blade'], zone: 'molten_forge', target: 'boss', dist: 40, seq: [['g', 250], ['q', 0]] },
  { id: 'magier-meteor', race: 'emberborn', cls: 'mage', gear: ['worldstaff', 'arcane_robe', 'emberwarden_helm', 'ember_grips', 'shadowstep_boots', 'ember_heart'], zone: 'cinder_peaks', target: 'cluster', dist: 70, seq: [['g', 700], ['t', 0]] },
  { id: 'waldlaeufer-pfeilhagel', race: 'elf', cls: 'ranger', gear: [...WARDEN, 'starfall'], zone: 'molten_forge', target: 'cluster', dist: 115, seq: [['g', 300], ['q', 0]] },
  { id: 'schurke-nerith', race: 'emberborn', cls: 'rogue', gear: [...WARDEN, 'nightwhisper'], zone: 'sunken_temple', target: 'boss', dist: 45, seq: [['r', 200], ['q', 0]] },
  { id: 'krieger-varkhul', race: 'dwarf', cls: 'warrior', gear: [...TYRANT, 'obsidian_greatsword'], zone: 'catacombs', target: 'boss', dist: 40, seq: [['r', 200], ['q', 0]] },
  { id: 'magier-gruppe', race: 'human', cls: 'mage', gear: ['worldstaff', 'arcane_robe', 'emberwarden_helm', 'ember_grips', 'shadowstep_boots', 'ember_heart'], zone: 'catacombs', target: 'cluster', dist: 50, seq: [['q', 350], ['t', 0]] },
  { id: 'waldlaeufer-varkhul', race: 'elf', cls: 'ranger', gear: [...WARDEN, 'starfall'], zone: 'catacombs', target: 'boss', dist: 95, zoom: 0.6, seq: [['g', 250], ['q', 0]] },
  { id: 'waldlaeufer-nerith', race: 'elf', cls: 'ranger', gear: [...TYRANT, 'starfall'], zone: 'sunken_temple', target: 'boss', dist: 95, zoom: 0.6, seq: [['q', 200], ['g', 0]] },
  { id: 'titel-varkhul', race: 'human', cls: 'warrior', gear: [...TYRANT, 'crown_of_embers_blade'], zone: 'catacombs', target: 'boss', dist: 40, zoom: 0.8, seq: [['q', 0]] },
  { id: 'titel-ignaroth', race: 'human', cls: 'warrior', gear: [...TYRANT, 'crown_of_embers_blade'], zone: 'molten_forge', target: 'boss', dist: 40, zoom: 0.8, seq: [['q', 0]] },
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const sc of SCENES.filter((s) => !only || only.split(',').includes(s.id))) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('ERR', sc.id, e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  await p.evaluate(async (sc) => {
    const g = window.emberfall;
    g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Demo'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: sc.race, classId: sc.cls } });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(600);
    g.state.commit('progress:grantXp', { amount: 5e6, source: 'shot' });
    for (const id of sc.gear) {
      g.state.commit('inventory:add', { itemId: id, qty: 1 });
      const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
      if (slot >= 0) g.state.commit('inventory:equip', { slot });
    }
    g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
    // unverwundbar für die Aufnahme
    setInterval(() => { const h = g.scenes.current.world?.hero; if (h) { h.hp = h.maxHp; h.resource = h.maxResource; } }, 50);
  }, sc);
  await p.addStyleTag({ content: '#ui{display:none!important}' });
  await p.waitForTimeout(800);
  const place = () => p.evaluate(({ target, dist }) => {
    const w = window.emberfall.scenes.current.world, h = w.hero;
    const alive = [...w.enemies].filter((e) => !e.dead);
    let t;
    if (target === 'boss') t = w.boss;
    else if (target === 'few') {
      // kleine Gruppe (2–3 Gegner), damit das Gebiet selbst sichtbar bleibt
      let bestD = 99;
      for (const e of alive) { const n = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < 90).length; const d = Math.abs(n - 3); if (d < bestD) { bestD = d; t = e; } }
    } else {
      let best = 0;
      for (const e of alive) { const n = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < 70).length; if (n > best) { best = n; t = e; } }
    }
    if (!t) return null;
    h.x = t.x - dist; h.y = t.y + 8;
    return { x: t.x, y: t.y, n: alive.length };
  }, sc);
  const tp = await place();
  await p.waitForTimeout(sc.target === 'boss' ? 1800 : 1400);
  // Maus auf das Ziel richten (Weltpunkt -> Bildschirm)
  const aim = async () => {
    const pt = await p.evaluate(({ target }) => {
      const s = window.emberfall.scenes.current, w = s.world, h = w.hero, cam = s.camera;
      const alive = [...w.enemies].filter((e) => !e.dead);
      const t = target === 'boss' && w.boss ? w.boss : alive.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      const r = document.getElementById('game').getBoundingClientRect(), k = r.width / 480;
      return t ? { x: r.left + (t.x - cam.x) * k, y: r.top + (t.y - 8 - cam.y) * k } : { x: 1200, y: 540 };
    }, sc);
    await p.mouse.move(pt.x, pt.y);
  };
  await aim();
  // Bildmitte beim Auslösen festhalten (Mitte zwischen Held und Ziel)
  await p.evaluate(({ target }) => {
    const w = window.emberfall.scenes.current.world, h = w.hero;
    const t = target === 'boss' && w.boss ? w.boss : [...w.enemies].filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0] ?? h;
    window.__shotCenter = { x: (h.x + t.x) / 2, y: (h.y + t.y) / 2 - 14 };
  }, sc);
  for (const [key, ms] of sc.seq) { await p.keyboard.press(key); if (ms) await p.waitForTimeout(ms); await aim(); }
  for (let i = 0; i < 18; i++) {
    if (i % 3 === 0) { await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); }
    // Ausschnitt um das Geschehen (Mitte zwischen Held und Ziel), zoom = Anteil der Bildbreite
    const url = await p.evaluate(async ({ target, zoom, shift = [0, 0] }) => {
      const g = window.emberfall, s = g.scenes.current, w = s.world, h = w.hero, cam = s.camera;
      // Aufnahmemodus: Schadenszahlen, Trefferblitze und Lebensbalken ausblenden (reine Anzeige, nicht das Geschehen)
      // Schleife kurz anhalten, aufräumen und genau ein Bild zeichnen
      g.loop.running = false;
      await new Promise((r) => requestAnimationFrame(r));
      for (const k of ['effects', 'entities']) { const arr = w[k]; if (Array.isArray(arr)) for (let i = arr.length - 1; i >= 0; i--) if (arr[i]?.constructor?.name === 'FloatingText') arr.splice(i, 1); }
      for (const a of w.actors ?? []) { a.flash = 0; a.hpBarTimer = 0; }
      s.hurtFlash = 0;
      g.render(0);
      const v = g.view, k = v.width / 480;
      const c0 = window.__shotCenter;
      const cx = (c0.x - cam.rx + shift[0]) * k, cy = (c0.y - cam.ry + shift[1]) * k;
      const cw = Math.round(v.width * zoom), ch = Math.round(v.height * zoom);
      const x = Math.max(0, Math.min(v.width - cw, Math.round(cx - cw / 2))), y = Math.max(0, Math.min(v.height - ch, Math.round(cy - ch / 2)));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(v, x, y, cw, ch, 0, 0, cw, ch);
      const out = c.toDataURL('image/png');
      g.loop.start();
      return out;
    }, { target: sc.target, zoom: sc.zoom ?? 0.55, shift: sc.shift });
    writeFileSync(`${OUT}/${sc.id}-${String(i).padStart(2, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
    await p.waitForTimeout(70);
  }
  console.log(sc.id, JSON.stringify(tp));
  await p.close();
}
await b.close();
