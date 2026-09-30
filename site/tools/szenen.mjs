// Szenen für die Website in nativer Spielauflösung (spriteRes 2 → 960×540), verlustfrei, Helligkeit eingebacken.
// Je Szene eine Serie; Dateiname enthält den Bosszustand, damit Ansagen (Telegraph) leicht zu finden sind.
// Aufruf: node capn.mjs OUT [ids] [URL]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = 'cn', only, URL = 'http://localhost:8101/emberfall.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const SOV = ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet'];
const G40 = {
  warrior: ['human', [...SOV, 'kingsbane']],
  rogue: ['emberborn', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  ranger: ['elf', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  mage: ['elf', ['staff_of_last_ash', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
};
const WARDEN = ['emberwarden_helm', 'emberwarden_mail', 'emberwarden_gauntlets', 'emberwarden_boots', 'ember_heart'];
const G20 = {
  warrior: ['human', ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade', 'ember_heart']],
  rogue: ['emberborn', [...WARDEN, 'nightwhisper']],
  ranger: ['elf', [...WARDEN, 'starfall']],
  mage: ['emberborn', ['worldstaff', 'arcane_robe', 'emberwarden_helm', 'ember_grips', 'shadowstep_boots', 'ember_heart']],
};
const S = (id, cls, zone, target, dist, seq, extra = {}) => {
  const G = extra.g20 ? G20 : G40;
  return { id, race: G[cls][0], cls, gear: G[cls][1], zone, target, dist, seq, frames: 12, every: 110, bright: 1.5, ...extra };
};
export const SCENES = [
  // Titel: Gruppe aus drei Klassen gegen Skalvyr, der seinen Eisatem ansagt
  S('titel', 'ranger', 'rime_caverns', 'boss', 108, [], { party: [['warrior', 'tank', 'dwarf'], ['mage', 'dps', 'emberborn']], frames: 70, every: 90, bright: 1.3, forceBreath: true, side: 1, calm: true, pin: true }),
  S('aschenfuerst', 'mage', 'ashen_throne', 'boss', 80, [['g', 300], ['t', 0]], { party: [['warrior', 'tank', 'human'], ['rogue', 'dps', 'emberborn']], frames: 40, every: 110, bright: 1.35, side: 1, pin: true }),
  S('welt-glutsenke', 'warrior', 'emberhollow', 'few', 30, [['q', 0]], { g20: true }),
  S('welt-katakomben', 'mage', 'catacombs', 'cluster', 60, [['t', 250], ['q', 0]], { g20: true }),
  S('welt-aschenwald', 'ranger', 'ashwood', 'few', 90, [['g', 250], ['q', 0]], { g20: true }),
  S('welt-tempel', 'warrior', 'sunken_temple', 'cluster', 30, [['g', 250], ['q', 0]], { g20: true }),
  S('welt-schlacke', 'mage', 'cinder_peaks', 'cluster', 70, [['g', 300], ['t', 0]], { g20: true }),
  S('welt-schmiede', 'rogue', 'molten_forge', 'cluster', 40, [['r', 200], ['q', 0]], { g20: true }),
  S('welt-steppe', 'warrior', 'ashen_steppe', 'few', 35, [['q', 0]]),
  S('welt-huegelgrab', 'rogue', 'howling_barrow', 'boss', 40, [['r', 200], ['q', 0]]),
  S('welt-marsch', 'ranger', 'blighted_marsh', 'few', 90, [['g', 250], ['q', 0]]),
  S('welt-sporenschlund', 'mage', 'spore_hollow', 'boss', 80, [['g', 300], ['t', 0]]),
  S('welt-frostzinnen', 'warrior', 'frostspire', 'few', 35, [['q', 0]]),
  S('welt-reifhoehlen', 'ranger', 'rime_caverns', 'boss', 95, [['g', 250], ['q', 0]]),
  S('welt-gluetoede', 'mage', 'ember_wastes', 'few', 70, [['g', 300], ['t', 0]]),
  S('welt-aschethron', 'warrior', 'ashen_throne', 'boss', 40, [['g', 250], ['q', 0]]),
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const meta = {};
for (const sc of SCENES.filter((s) => !only || only.split(',').includes(s.id))) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('ERR', sc.id, e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  const info = await p.evaluate(async (sc) => {
    const g = window.emberfall;
    g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Demo'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: sc.race, classId: sc.cls } });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(600);
    for (let i = 0; i < 40; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
    for (const id of sc.gear) {
      g.state.commit('inventory:add', { itemId: id, qty: 1 });
      const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
      if (slot >= 0) g.state.commit('inventory:equip', { slot });
    }
    if (sc.party) {
      const f = g.finder;
      const members = [{ kind: 'player', role: 'dps', classId: sc.cls, raceId: sc.race, level: 40, name: 'Zolva' }];
      sc.party.forEach(([cls, role, race], i) => members.push({ kind: 'merc', id: 'm' + i, name: ['Grimmbart', 'Feuerlilie'][i], level: 40, role, classId: cls, raceId: race, look: { variant: i, hairStyle: null, dye: null }, gearSeed: 7 + i * 13, style: { reaction: 0.2, skill: 0.9, chatty: 0, caps: 0, lang: 'de' } }));
      f.group = { id: 'g1', dungeonId: sc.zone, members };
      f.state = 'active';
    }
    g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
    setInterval(() => { const w = g.scenes.current.world; if (!w) return; for (const a of w.actors) if (a.hero || a === w.hero || a.companion) { a.hp = a.maxHp; a.resource = a.maxResource; } const h = w.hero; if (h) { h.hp = h.maxHp; h.resource = h.maxResource; } }, 50);
    const fs = g.scenes.current.systems?.finder ?? null;
    return { party: !!sc.party, bots: g.scenes.current.world.actors.filter((a) => a.companion).length };
  }, sc);
  await p.addStyleTag({ content: '#ui{display:none!important}' });
  await p.waitForTimeout(800);
  const tp = await p.evaluate(({ target, dist, side = -1, pin }) => {
    const w = window.emberfall.scenes.current.world, h = w.hero;
    const alive = [...w.enemies].filter((e) => !e.dead);
    let t;
    if (target === 'boss') t = w.boss;
    else if (target === 'few') {
      let bestD = 99;
      for (const e of alive) { const n = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < 90).length; const d = Math.abs(n - 3); if (d < bestD) { bestD = d; t = e; } }
    } else {
      let best = 0;
      for (const e of alive) { const n = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < 70).length; if (n > best) { best = n; t = e; } }
    }
    if (!t) return null;
    h.x = t.x + side * dist; h.y = t.y + 8;
    // Gruppenmitglieder mitnehmen: Tank vor den Helden, Magier dahinter
    const comps = w.actors.filter((a) => a.companion);
    const pins = comps.map((c, i) => ({ c, x: i === 0 ? t.x + side * 58 : h.x + side * 16, y: i === 0 ? t.y + 16 : h.y + 34 }));
    for (const q of pins) { q.c.x = q.x; q.c.y = q.y; }
    if (pin) setInterval(() => { for (const q of pins) { q.c.x = q.x; q.c.y = q.y; } h.x = t.x + side * dist; h.y = t.y - 4; }, 8);
    window.__target = t;
    return { x: t.x, y: t.y, n: alive.length };
  }, sc);
  await p.waitForTimeout(sc.target === 'boss' ? 1800 : 1400);
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
  if (sc.forceBreath) await p.evaluate(() => { const bo = window.emberfall.scenes.current.world.boss; if (bo?.timers) { bo.timers.breath = 1.2; bo.timers.burrow = 99; bo.timers.call = 99; } });
  for (const [key, ms] of sc.seq) { await p.keyboard.press(key); if (ms) await p.waitForTimeout(ms); await aim(); }
  for (let i = 0; i < sc.frames; i++) {
    if (!sc.calm && i % 3 === 0) { await aim(); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); }
    if (sc.forceBreath) await p.evaluate(() => { const bo = window.emberfall.scenes.current.world.boss; window.__rnd ??= Math.random; Math.random = bo?.state === 'chase' && !window.__breathed ? () => 0.99 : window.__rnd; if (bo?.state === 'breath') window.__breathed = true; if (bo?.timers && bo.state === 'chase') { bo.timers.breath = 0; bo.timers.burrow = 99; bo.timers.call = 99; bo.last = 'bite'; bo.facing = Math.sign(window.emberfall.scenes.current.world.hero.x - bo.x) || 1; } });
    const r = await p.evaluate(async ({ bright }) => {
      const g = window.emberfall, s = g.scenes.current, w = s.world, h = w.hero, cam = s.camera;
      g.loop.running = false;
      await new Promise((r) => requestAnimationFrame(r));
      for (const k of ['effects', 'entities']) { const arr = w[k]; if (Array.isArray(arr)) for (let i = arr.length - 1; i >= 0; i--) if (arr[i]?.constructor?.name === 'FloatingText') arr.splice(i, 1); }
      for (const a of [...(w.actors ?? []), ...(w.enemies ?? [])]) { a.flash = 0; a.hpBarTimer = 0; }
      s.hurtFlash = 0;
      g.render(0);
      const v = g.view, k = v.width / 480;
      const t = window.__target && !window.__target.dead ? window.__target : w.boss && !w.boss.dead ? w.boss : h;
      const toV = (o) => ({ x: Math.round((o.x - cam.rx) * k), y: Math.round((o.y - 14 - cam.ry) * k) });
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
      const cx = c.getContext('2d');
      cx.filter = `brightness(${bright}) saturate(1.1)`;
      cx.drawImage(v, 0, 0);
      const out = c.toDataURL('image/png');
      g.loop.start();
      return { out, w: v.width, h: v.height, hero: toV(h), target: toV(t), state: w.boss?.state ?? '' };
    }, sc);
    const tag = r.state ? `-${r.state}` : '';
    const name = `${sc.id}-${String(i).padStart(2, '0')}${tag}`;
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.out.split(',')[1], 'base64'));
    meta[name] = { w: r.w, h: r.h, hero: r.hero, target: r.target };
    await p.waitForTimeout(sc.every);
  }
  console.log(sc.id, JSON.stringify(tp), JSON.stringify(info));
  await p.close();
}
writeFileSync(`${OUT}/meta-${only ?? 'all'}.json`.replace(/,/g, '_'), JSON.stringify(meta, null, 1));
await b.close();
