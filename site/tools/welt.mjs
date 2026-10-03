// Weltbilder (/welt) als inszenierte Key-Art: echte Spielgrafik in nativer Auflösung (960×540), aber
// feste Aufstellung relativ zum Ziel (Held + einige Gegner festgehalten), Kamera auf die Szene,
// keine Spiel-UI im Bild: Namensschilder, Stufen, Lebensbalken, Schadenszahlen, Warnflächen/-ringe
// (Telegraph, Meteor-/Pfeilregen-Kreise, Schutz-Aura) werden nur beim Aufnehmen unterdrückt.
// Helme ohne roten Helmbusch (sahen wie Weihnachtsmützen aus).
// Aufruf: node welt.mjs OUT [ids] [URL]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = 'wa', only, URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
// Ausrüstung: keine *_coif/*_helm-Varianten mit rotem Busch, kein gorm/khar/hillking/forge_helm
const G40 = {
  warrior: ['human', ['rimeforged_coif', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet', 'kingsbane']],
  rogue: ['emberborn', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  ranger: ['elf', ['dawnstring', 'jarl_cap', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  mage: ['elf', ['staff_of_last_ash', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
};
const G20 = {
  warrior: ['human', ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade', 'ember_heart']],
  rogue: ['emberborn', ['wyrmscale_cap', 'emberwarden_mail', 'emberwarden_gauntlets', 'emberwarden_boots', 'ember_heart', 'nightwhisper']],
  ranger: ['elf', ['jarl_cap', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots', 'ember_heart', 'starfall']],
  mage: ['emberborn', ['worldstaff', 'arcane_robe', 'ember_grips', 'shadowstep_boots', 'ember_heart']],
};
// target: 'boss' | 'type:<enemy>' | 'rare:<name>'; hero/foes/cam relativ zum Ziel (Weltpixel);
// foes: weitere Gegner (Typ foeType, sonst wie Ziel) an festen Plätzen; keys: [Taste, ms] zyklisch
const W = (id, o) => ({ id, frames: +(process.env.FRAMES ?? 18), every: 120, click: true, density: 0.35,
  grade: 'brightness(1.5) contrast(1.08) saturate(1.1)', hideFx: 'ImpactStar', cam: [-16, -14], ...o });
export const SCENES = [
  W('welt-glutsenke', { cls: 'warrior', g20: true, zone: 'emberhollow', target: 'type:wolf', amb: 1.3, pos: [700, 440], hero: [-26, 4], foes: [[20, -14], [8, 18], [-58, 12]], keys: [['q', 1400]], light: [[-20, -6, 70, [255, 200, 150], 0.45]] }),
  W('welt-katakomben', { cls: 'mage', g20: true, zone: 'catacombs', target: 'type:skeleton', pos: [490, 112], hero: [-28, 6], foes: [[22, -10], [-4, 26], [-54, -4]], keys: [['q', 700]], click: false, cam: [-20, -4] }),
  W('welt-aschenwald', { cls: 'ranger', g20: true, zone: 'ashwood', target: 'type:ash_boar', pos: [440, 240], hero: [-56, 8], foes: [[20, 24], [34, -14]], keys: [['q', 1000], ['r', 1000]], cam: [-24, -14], amb: 2.2, light: [[-50, -6, 70, [255, 200, 150], 0.5], [16, 0, 60, [255, 150, 90], 0.35]] }),
  W('welt-tempel', { cls: 'warrior', g20: true, zone: 'sunken_temple', target: 'type:tide_cultist', pos: [836, 178], hero: [-26, 4], foes: [[20, 16]], foeType: 'drowned', keys: [['q', 1600]], cam: [-20, -26], amb: 1.3 }),
  W('welt-schlacke', { cls: 'mage', g20: true, zone: 'cinder_peaks', target: 'type:fire_imp', pos: [600, 446], hero: [-56, 6], foes: [[16, -16], [12, 20]], keys: [['t', 1200]], cam: [-28, -18] }),
  W('welt-schmiede', { cls: 'rogue', g20: true, zone: 'molten_forge', target: 'rare:Glutschwinge', pos: [560, 360], hero: [-64, 12], foes: [[40, 34]], foeType: 'ember_drake', keys: [['r', 1100]], cam: [-20, 6], amb: 1.9, light: [[-46, -4, 70, [255, 190, 140], 0.5], [10, -10, 80, [255, 120, 50], 0.5]] }),
  W('welt-steppe', { cls: 'warrior', zone: 'ashen_steppe', target: 'type:steppe_raider', pos: [1345, 204], hero: [-24, 4], foes: [[18, 18], [26, -14]], keys: [['q', 1500]], cam: [-50, -28] }),
  W('welt-huegelgrab', { cls: 'rogue', zone: 'howling_barrow', target: 'boss', hero: [-48, 12], foes: [], keys: [['r', 1600]], cam: [-20, -22], at: [0, 40], amb: 1.6, light: [[-48, 0, 60, [255, 190, 140], 0.6], [10, -40, 100, [120, 230, 220], 0.4]] }),
  W('welt-marsch', { cls: 'ranger', zone: 'blighted_marsh', target: 'type:swamp_leech', pos: [330, 372], hero: [-42, 4], foes: [[16, 16], [24, -12]], keys: [['q', 1500]], cam: [0, -10], amb: 1.6, light: [[-42, -6, 46, [230, 220, 190], 0.45]] }),
  W('welt-sporenschlund', { cls: 'mage', zone: 'spore_hollow', target: 'boss', hero: [-92, -2], foes: [], keys: [['t', 1300]], cam: [-36, -22] }),
  W('welt-frostzinnen', { cls: 'warrior', zone: 'frostspire', target: 'type:frost_wolf', pos: [880, 480], hero: [-26, 4], foes: [[20, -14], [10, 18]], keys: [['q', 1500]], cam: [-20, -26], grade: 'brightness(1.3) contrast(1.1) saturate(1.1)' }),
  W('welt-reifhoehlen', { cls: 'ranger', zone: 'rime_caverns', target: 'boss', hero: [-66, 16], foes: [], keys: [['r', 1500]], cam: [-24, -14] }),
  W('welt-gluetoede', { cls: 'mage', zone: 'ember_wastes', target: 'type:cinder_knight', pos: [1250, 690], hero: [-50, 6], foes: [[-104, 14], [26, 28]], keys: [['t', 1300]], cam: [-30, -16] }),
  W('welt-aschethron', { cls: 'warrior', zone: 'ashen_throne', target: 'boss', hero: [-52, 14], foes: [], keys: [['q', 1500]], cam: [-22, -28], floorPatch: 'biome_throne', amb: 1.7, light: [[-52, 4, 70, [255, 200, 160], 0.55], [-10, -40, 90, [255, 140, 80], 0.35]], grade: 'brightness(1.45) contrast(1.1) saturate(1.05)' }),
];
const env = (k, d) => (process.env[k] ? JSON.parse(process.env[k]) : d);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const meta = {};
const run = async (sc0) => {
  const sc = { ...sc0, ...env('OVR', {})[sc0.id] };
  const G = sc.g20 ? G20 : G40;
  sc.race = sc.raceO ?? G[sc.cls][0]; sc.gear = sc.gearO ?? G[sc.cls][1];
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('ERR', sc.id, e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 90000 });
  await p.evaluate(async (sc) => {
    const g = window.emberfall;
    g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Zolva'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: sc.race, classId: sc.cls } });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(600);
    for (let i = 0; i < 40; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
    for (const id of sc.gear) {
      g.state.commit('inventory:add', { itemId: id, qty: 1 });
      const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
      if (slot >= 0) g.state.commit('inventory:equip', { slot });
    }
    if (sc.floorPatch) {
      for (const t of g.assets.sprites[sc.floorPatch].floor) {
        const c = t.canvas ?? t, x = c.getContext('2d'), s = c.width / 32;
        x.drawImage(c, 0, s, c.width, s, 0, 0, c.width, s);
        x.drawImage(c, s, 0, s, c.height, 0, 0, s, c.height);
      }
      const fl = g.assets.sprites[sc.floorPatch].floor, m = fl[8]?.canvas ?? fl[8], z = fl[0]?.canvas ?? fl[0];
      if (m && z) { const x = m.getContext('2d'); x.clearRect(0, 0, m.width, m.height); x.drawImage(z, 0, 0); }
    }
    g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
    const w0 = g.scenes.current.world;
    if (sc.density != null) w0.particles.density = sc.density;
    if (sc.amb) w0.lighting.ambient = w0.lighting.ambient.map((v) => v * sc.amb);
    // kein Blut am Boden, wenig Blutspritzer
    for (const k of ['splat', 'scorch', 'stamp', 'stampFrame', 'pixel']) if (w0.decals?.[k]) w0.decals[k] = () => {};
    const gore = w0.particles.gore.bind(w0.particles);
    w0.particles.gore = (x, y, z, a, n, pal) => gore(x, y, z, a, Math.ceil(n * (sc.gore ?? 0.3)), pal, false);
    setInterval(() => {
      const w = g.scenes.current.world; if (!w) return;
      for (const a of w.actors) if (a === w.hero || a.companion) { a.hp = a.maxHp; a.resource = a.maxResource; for (const ab of a.abilities ?? []) ab.cdLeft = 0; }
    }, 50);
  }, sc);
  await p.addStyleTag({ content: '#ui{display:none!important}' });
  await p.waitForTimeout(800);
  const tp = await p.evaluate((sc) => {
    const g = window.emberfall, w = g.scenes.current.world, h = w.hero;
    const alive = [...w.enemies].filter((e) => !e.dead);
    const near = (e, r) => alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < r).length;
    let t;
    if (sc.target === 'boss') t = w.boss;
    else if (sc.target.startsWith('rare:')) t = alive.find((e) => e.rareName === sc.target.slice(5));
    else {
      const type = sc.target.slice(5);
      t = alive.filter((e) => e.type === type && !e.rareId).sort((a, b2) => near(b2, 90) - near(a, 90))[0];
    }
    if (!t) return null;
    const T = sc.pos ? { x: sc.pos[0], y: sc.pos[1] } : { x: t.x + (sc.at?.[0] ?? 0), y: t.y + (sc.at?.[1] ?? 0) };
    window.__target = t;
    const ft = sc.foeType ?? t.type;
    const foes = alive.filter((e) => e !== t && e.type === ft && !e.rareId && !e.def?.elite).sort((a, b2) => Math.hypot(a.x - T.x, a.y - T.y) - Math.hypot(b2.x - T.x, b2.y - T.y)).slice(0, sc.foes.length);
    window.__foes = foes;
    const keep = new Set([t, ...foes]), far = new Map();
    const set = () => {
      // keine Toten (keine Leichen/Beute), andere Gegner aus dem Bild halten
      for (const e of w.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - T.x, e.y - T.y) < 600 && e.maxHp) { if (e.maxHp < 1e8) e.maxHp = 1e9; e.hp = e.maxHp; }
        if (sc.clear !== false && !keep.has(e) && (far.has(e) || Math.hypot(e.x - T.x, e.y - T.y) < (sc.clear ?? 300))) {
          if (!far.has(e)) far.set(e, { x: T.x + 3000 + far.size * 40, y: T.y + 3000 });
          const q = far.get(e); e.x = q.x; e.y = q.y;
        }
      }
      t.x = T.x; t.y = T.y; if (t.maxHp) { if (t.maxHp < 1e8) t.maxHp = 1e9; t.hp = t.maxHp; }
      h.x = T.x + sc.hero[0]; h.y = T.y + sc.hero[1];
      foes.forEach((f, i) => { f.x = T.x + sc.foes[i][0]; f.y = T.y + sc.foes[i][1]; });
      for (const e of [t, ...foes]) if (e.facing !== undefined) e.facing = Math.sign(h.x - e.x) || -1;
      h.facing = Math.sign(T.x - h.x) || 1;
    };
    set(); setInterval(set, 8);
    const L = w.lights[0]?.constructor;
    if (L) for (const [dx, dy, r, color, intensity] of sc.light ?? []) w.addLight(new L({ x: T.x + dx, y: T.y + dy, radius: r, color, intensity, flicker: 0.05, bloom: 0.5 }));
    window.__camC = { x: T.x + sc.cam[0], y: T.y + sc.cam[1] };
    window.__T = T;
    return { x: T.x, y: T.y, type: t.type ?? t.constructor.name, foes: foes.length, L: L?.name, nl: w.lights.length };
  }, sc);
  if (!tp) { console.log('NO TARGET', sc.id); await p.close(); return; }
  await p.waitForTimeout(1200);
  const aim = async () => {
    const pt = await p.evaluate(() => {
      const s = window.emberfall.scenes.current, t = window.__target, cam = s.camera;
      const r = document.getElementById('game').getBoundingClientRect(), vw = r.width / 480;
      return { x: r.left + (t.x - cam.x) * vw, y: r.top + (t.y - 10 - cam.y) * vw };
    });
    await p.mouse.move(pt.x, pt.y);
  };
  let ki = 0, tk = 0;
  for (let i = 0; i < sc.frames; i++) {
    await aim();
    if (sc.click && i % 2 === 0) { await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up(); }
    tk += sc.every;
    if (sc.keys?.[ki] && tk >= sc.keys[ki][1]) { await p.keyboard.press(sc.keys[ki][0]); ki = (ki + 1) % sc.keys.length; tk = 0; }
    const r = await p.evaluate(async (sc) => {
      const g = window.emberfall, s = g.scenes.current, w = s.world, cam = s.camera;
      g.loop.running = false;
      await new Promise((res) => requestAnimationFrame(res));
      const undo = [];
      // Effekte: Schadenszahlen weg, Warnflächen (samt ihrem roten Licht) ausblenden
      const HIDE = new RegExp('Shockwave|Telegraph|DamageWave|SpawnMarker|GraveMarker|Fissure|Cataclysm|EmberPatch|AshWave|GraveRift|FireField|FrostField|ToxicRing|RootSpikes|SpinVortex|ChargeGlow|RiftFlash|NovaBurst|FlameRing|Whirlpool|Shockwave|GraveMarker' + (sc.hideFx ? '|' + sc.hideFx : ''));
      for (const key of ['effects', 'entities']) {
        const arr = w[key]; if (!Array.isArray(arr)) continue;
        for (let j = arr.length - 1; j >= 0; j--) {
          const e = arr[j], n = e?.constructor?.name ?? '';
          if (n === 'FloatingText') arr.splice(j, 1);
          else if (HIDE.test(n) || e?.visual === 'road') {
            arr.splice(j, 1); undo.push(() => arr.push(e));
            if (e.light) { const L = e.light, v = L.intensity; L.intensity = 0; undo.push(() => { L.intensity = v; }); }
          }
        }
      }
      // Lebensbalken, Stufe, Namensschilder, Angriffs-Ausrufezeichen
      for (const a of [...(w.actors ?? []), ...(w.enemies ?? [])]) {
        a.flash = 0; a.hpBarTimer = 0;
        if (typeof a.type === 'string' && a.def) {
          Object.defineProperty(a, 'isEngaged', { value: false, configurable: true, writable: true });
          const st = a.stateTime, nh = a.nearHero, s0 = a.state, al = a.alpha; a.stateTime = 0; a.nearHero = false;
          if (s0 === 'return') a.state = 'chase';
          if (sc.noFoeGlow) { const f = a.currentFrame?.(); if (f?.glow) { const gl = f.glow; f.glow = { draw() {}, canvas: null }; undo.push(() => { f.glow = gl; }); } }
          if (al !== undefined && al < 1 && !a.dead) a.alpha = 1;
          undo.push(() => { delete a.isEngaged; a.stateTime = st; a.nearHero = nh; a.state = s0; a.alpha = al; });
        }
      }
      const F = Object.getPrototypeOf(g.font), fd = F.draw; F.draw = () => {}; undo.push(() => { F.draw = fd; });
      // Boden-Ringe (Ellipse + stroke): Schutz-Aura, Meteor-/Pfeilregen-Warnkreis, Boss-Ringe
      const C = CanvasRenderingContext2D.prototype, oe = C.ellipse, ob = C.beginPath, os = C.stroke;
      C.ellipse = function (...a) { this.__ell = true; return oe.apply(this, a); };
      C.beginPath = function () { this.__ell = false; return ob.call(this); };
      C.stroke = function (...a) { if (this.__ell) return; return os.apply(this, a); };
      undo.push(() => { C.ellipse = oe; C.beginPath = ob; C.stroke = os; });
      s.hurtFlash = 0;
      if (sc.noGlows) for (const a of (w.actors ?? []).filter((a) => a === w.hero || a.companion)) { const f = a.currentFrame?.(); if (f?.glows?.length) { const gl = f.glows; f.glows = []; undo.push(() => { f.glows = gl; }); } }
      const saved = { x: cam.x, y: cam.y, sx: cam.shakeX, sy: cam.shakeY, kx: cam.kickX, ky: cam.kickY };
      const k = 2, worldW = g.view.width / k, worldH = g.view.height / k;
      cam.x = Math.round(window.__camC.x - worldW / 2); cam.y = Math.round(window.__camC.y - worldH / 2);
      cam.shakeX = cam.shakeY = cam.kickX = cam.kickY = 0;
      // Zeitpunkt ohne wandernden Glanz auf Waffen (entities/Hero.js nutzt performance.now)
      const hs = (w.actors ?? []).filter((a) => a === w.hero || a.companion);
      let T = performance.now() / 1000;
      for (let q = 0; q < 400; q++, T += 0.013) if (hs.every((a) => [1.6, 2.4].every((per) => ((T + (a.id ?? 0) * 0.37) % per) / 0.4 >= 1.05))) break;
      const pn = performance.now; performance.now = () => T * 1000;
      try { g.render(0); } finally { performance.now = pn; for (const u of undo.reverse()) u(); }
      const v = g.view;
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
      const cx = c.getContext('2d'); cx.filter = sc.grade; cx.drawImage(v, 0, 0);
      const out = c.toDataURL('image/png');
      const toV = (o) => ({ x: Math.round((o.x - cam.x) * k), y: Math.round((o.y - 12 - cam.y) * k) });
      const res = { out, hero: toV(w.hero), target: toV(window.__target), state: window.__target?.state ?? '', hstate: w.hero.state ?? '' };
      Object.assign(cam, { x: saved.x, y: saved.y, shakeX: saved.sx, shakeY: saved.sy, kickX: saved.kx, kickY: saved.ky });
      g.loop.start();
      return res;
    }, sc);
    const name = `${sc.id}-${String(i).padStart(2, '0')}`;
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.out.split(',')[1], 'base64'));
    meta[name] = { hero: r.hero, target: r.target, state: r.state, hstate: r.hstate };
    await p.waitForTimeout(sc.every);
  }
  console.log(sc.id, JSON.stringify(tp));
  await p.close();
};
const list = SCENES.filter((s) => !only || only.split(',').includes(s.id) || only.split(',').includes(s.id.slice(5)));
const PAR = +(process.env.PAR ?? 3);
for (let i = 0; i < list.length; i += PAR) await Promise.all(list.slice(i, i + PAR).map(run));
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
