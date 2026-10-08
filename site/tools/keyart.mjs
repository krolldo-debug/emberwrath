// Key-Art für die Website: echte Spielgrafik, aber inszeniert. Feste Aufstellung (Weltkoordinaten relativ zum
// Ziel), Kamera auf die Szene, Warnflächen und Namensschilder beim Zeichnen ausgeblendet, Gegenlicht als echtes
// Licht der Engine, Farbgebung beim Export eingerechnet. Quer (1920×1080 → 960×540) und hoch (390×844 @3 → 540×…).
// Aufruf: node keyart.mjs OUT ids [URL]; Standard-URL :8103 = Server im Ordner emberfall/ (python3 -m http.server 8103), Quellstand mit import("/src/...")
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = 'ka', only, URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const SOV = [process.env.HELM ?? 'rimeforged_coif', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet'];
const G40 = {
  warrior: ['human', [...SOV, 'kingsbane']],
  rogue: ['emberborn', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  ranger: ['elf', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  mage: ['elf', ['staff_of_last_ash', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
};
// rel: Positionen relativ zum Ziel (Boss oder gewähltes Gegner-Exemplar); cam: Bildmitte relativ zum Ziel
const K = (id, o) => ({ id, frames: +(process.env.FRAMES ?? 36), every: 100, grade: 'brightness(1.35) contrast(1.12) saturate(1.15)', ...o });
const SCENES = [
  // Titel: Skalvyr, Gruppe eng beieinander vor dem Kopf
  K('titel', { noGlows: true, floorClean: { biome: 'biome_rime', keep: [2, 4, 8] }, cls: 'warrior', zone: 'rime_caverns', target: 'boss', party: [['mage', 'dps', 'emberborn'], ['ranger', 'dps', 'elf']], density: 0.2, hideFx: process.env.HIDE ?? 'ImpactStar',
    hero: [-58, 16], comps: [[-86, 2], [-82, 30]], cam: [-50, -4], light: [[20, -60, 150, [140, 200, 255], 1.1], [-80, 10, 70, [255, 190, 140], 0.5]], keys: [['r', 900], ['t', 2600]] }),
  // Malgareth: Goldraster im Boden entfernt, warmes Fülllicht auf der Gruppe
  K('malgareth', { cls: 'warrior', zone: 'ashen_throne', target: 'boss', party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], floorPatch: 'biome_throne', density: 0.3, hideFx: 'ImpactStar',
    grade: 'brightness(1.05) contrast(1.12) saturate(1.05)', hero: [-40, 10], comps: [[-66, -2], [-62, 24]], cam: [-24, -26], light: [[-60, 4, 80, [255, 200, 160], 0.7], [-70, -14, 46, [230, 210, 255], 0.9]], keys: [['r', 900], ['g', 2600]] }),
  // Ulgrim: vom Thron weggezogen, wenig Partikel, mehr Kontrast
  K('ulgrim', { cls: 'warrior', zone: 'howling_barrow', target: 'boss', party: [['mage', 'dps', 'emberborn'], ['ranger', 'dps', 'elf']], at: [0, 40], density: 0.06, hideFx: 'ImpactStar|Shockwave|Afterimage',
    grade: 'brightness(1.3) contrast(1.3) saturate(1.1)', hero: [-34, 10], comps: [[-60, -2], [-56, 22]], cam: [-22, -20], light: [[-50, 0, 90, [255, 180, 110], 0.7], [20, -30, 80, [110, 240, 220], 0.35]], keys: [['r', 900], ['g', 2600]] }),
  K('ulgrim2', { cls: 'warrior', zone: 'howling_barrow', target: 'boss', party: [['mage', 'dps', 'emberborn'], ['ranger', 'dps', 'elf']], at: [0, 60], density: 0.05, hideFx: 'ImpactStar|Shockwave|Afterimage|ChargeGlow',
    grade: 'brightness(1.35) contrast(1.35) saturate(1.1)', hero: [-34, 10], comps: [[-60, -2], [-56, 22]], cam: [-22, -20], light: [[-50, 0, 90, [255, 180, 110], 0.6], [30, -40, 90, [150, 230, 255], 0.5]], keys: [] }),
  K('nerith', { cls: 'warrior', zone: 'sunken_temple', target: 'boss', party: [['mage', 'dps', 'emberborn'], ['ranger', 'dps', 'elf']], density: 0.3, hideFx: 'ImpactStar',
    grade: 'brightness(1.3) contrast(1.2) saturate(1.1)', hero: [-40, 10], comps: [[-66, -2], [-62, 22]], cam: [-24, -18], light: [[-60, 0, 80, [255, 180, 110], 0.6]], keys: [['r', 900]] }),
  // Mutter Fäulnis im Sporenschlund
  K('faeulnis', { cls: 'warrior', zone: 'spore_hollow', target: 'boss', party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], density: 0.25, hideFx: 'ImpactStar|Shockwave',
    grade: 'brightness(1.25) contrast(1.18) saturate(1.1)', hero: [-50, 10], comps: [[-78, -2], [-74, 24]], cam: [-30, -16], light: [[-70, 0, 80, [255, 190, 140], 0.6]], keys: [['r', 900], ['g', 2600]] }),
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const meta = {};
for (const sc of SCENES.filter((s) => !only || only.split(',').includes(s.id))) {
  const ctx = await b.newContext(sc.portrait ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: false, hasTouch: false } : { viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', sc.id, e.message)); p.on('console', (m) => { if (m.type() === 'warning' && /missing/.test(m.text())) console.log(m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  // Volle Bildqualität erzwingen: „Auto“ senkt sie im Headless-Browser sonst auf 480 × 270
  await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
  await p.evaluate(async (sc) => {
    const g = window.emberfall, G = sc.G;
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
    if (sc.party) {
      const members = [{ kind: 'player', role: 'tank', classId: sc.cls, raceId: sc.race, level: 40, name: 'Zolva' }];
      sc.party.forEach(([cls, role, race], i) => members.push({ kind: 'merc', id: 'm' + i, name: 'x' + i, level: 40, role, classId: cls, raceId: race, look: { variant: i, hairStyle: null, dye: null }, gearSeed: 7 + i * 13, style: { reaction: 0.2, skill: 0.9, chatty: 0, caps: 0, lang: 'de' } }));
      g.finder.group = { id: 'g1', dungeonId: sc.zone, members };
      g.finder.state = 'active';
    }
    if (sc.floorPatch) {
      // Goldeinlage (obere Zeile und linke Spalte jeder Bodenkachel) durch die Nachbarpixel ersetzen
      for (const t of g.assets.sprites[sc.floorPatch].floor) {
        const c = t.canvas ?? t, x = c.getContext('2d'), s = c.width / 32;
        x.drawImage(c, 0, s, c.width, s, 0, 0, c.width, s);
        x.drawImage(c, s, 0, s, c.height, 0, 0, s, c.height);
      }
      // Kronen-Medaillon (Kachel 8) wie eine schlichte Kachel aussehen lassen
      const fl = g.assets.sprites[sc.floorPatch].floor, m = fl[8]?.canvas ?? fl[8], z = fl[0]?.canvas ?? fl[0];
      if (m && z) { const x = m.getContext('2d'); x.clearRect(0, 0, m.width, m.height); x.drawImage(z, 0, 0); }
    }
    if (sc.floorClean) {
      // Bodenkacheln mit Schneewehen/Eisflächen durch schlichte Kacheln derselben Serie ersetzen
      const fl = g.assets.sprites[sc.floorClean.biome].floor, keep = sc.floorClean.keep;
      fl.forEach((t, i) => { if (keep.includes(i)) return; const c = t.canvas ?? t, x = c.getContext('2d'), src = fl[keep[i % keep.length]]; x.clearRect(0, 0, c.width, c.height); x.drawImage(src.canvas ?? src, 0, 0); });
    }
    g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
    {
      const [{ getHeroSprites }, { resolveGear }, { spriteStyle }] = await Promise.all([import('/src/sprites/hero.js'), import('/src/character/gearLook.js'), import('/src/character/cosmetics.js')]);
      const CG = { ranger: ['jarl_cap', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots', 'dawnstring'], mage: [sc.mageHood, 'colossus_robe', 'colossus_gloves', 'colossus_slippers', 'staff_of_last_ash'] };
      for (const c of g.scenes.current.world.actors.filter((a) => a.companion)) {
        const cls = c.member?.classId ?? c.cls?.id, ids = CG[cls]; if (!ids) continue;
        const eq = {}; for (const id of ids) { const d = g.content.get('item', id); if (d?.slot) eq[d.slot] = id; else console.warn('missing item', id); }
        const gear = resolveGear(eq, g.content), look = c.member?.look ?? {};
        c.equipment = eq;
        c.refreshLook = () => c.setAnims(getHeroSprites(c.raceId, cls, look.variant ?? 0, gear, spriteStyle(look)));
        c.refreshLook();
      }
    }
    if (sc.density != null) g.scenes.current.world.particles.density = sc.density;
    setInterval(() => { const w = g.scenes.current.world; if (!w) return; for (const a of w.actors) if (a === w.hero || a.companion) { a.hp = a.maxHp; a.resource = a.maxResource; } }, 50);
  }, { ...sc, mageHood: process.env.MAGEHOOD ?? 'colossus_hood', race: G40[sc.cls][0], gear: G40[sc.cls][1] });
  await p.addStyleTag({ content: '#ui{display:none!important}' });
  await p.waitForTimeout(800);
  const tp = await p.evaluate((sc) => {
    const g = window.emberfall, w = g.scenes.current.world, h = w.hero;
    let t;
    if (sc.target === 'boss') t = w.boss;
    else {
      const type = sc.target.slice(5);
      const all = [...w.enemies].filter((e) => !e.dead && (e.def?.id === type || e.type === type || e.typeId === type));
      t = all.sort((a, b2) => [...w.enemies].filter((o) => Math.hypot(o.x - b2.x, o.y - b2.y) < 80).length - [...w.enemies].filter((o) => Math.hypot(o.x - a.x, o.y - a.y) < 80).length)[0];
    }
    if (!t) return null;
    const T = { x: t.x + (sc.at?.[0] ?? 0), y: t.y + (sc.at?.[1] ?? 0) };
    window.__target = t;
    const comps = w.actors.filter((a) => a.companion);
    const party = g.finder?.session?.party;
    if (party) party.draw = () => {};
    const set = () => {
      t.x = T.x; t.y = T.y; if (t.maxHp) t.hp = t.maxHp;
      h.x = T.x + sc.hero[0]; h.y = T.y + sc.hero[1];
      comps.forEach((c, i) => { c.x = T.x + sc.comps[i][0]; c.y = T.y + sc.comps[i][1]; });
      if (t.facing !== undefined) t.facing = Math.sign(h.x - t.x) || -1;
    };
    set(); setInterval(set, 8);
    const L = w.lights[0]?.constructor;
    if (L) for (const [dx, dy, r, color, intensity] of sc.light ?? []) w.addLight(new L({ x: T.x + dx, y: T.y + dy, radius: r, color, intensity, flicker: 0.05, bloom: 0.5 }));
    window.__camC = { x: T.x + sc.cam[0], y: T.y + sc.cam[1] };
    return { x: T.x, y: T.y, id: t.def?.id ?? t.type };
  }, sc);
  await p.waitForTimeout(1500);
  const aim = async () => {
    const pt = await p.evaluate(() => {
      const s = window.emberfall.scenes.current, t = window.__target, cam = s.camera;
      const r = document.getElementById('game').getBoundingClientRect(), k = r.width / (window.emberfall.view.width / (window.emberfall.view.width / 480 > 0 ? 1 : 1));
      const vw = r.width / (s.world ? (document.documentElement.classList.contains('ef-portrait') ? 270 : 480) : 480);
      return { x: r.left + (t.x - cam.x) * vw, y: r.top + (t.y - 10 - cam.y) * vw };
    });
    await p.mouse.move(pt.x, pt.y);
  };
  let ki = 0, tk = 0;
  for (let i = 0; i < sc.frames; i++) {
    await aim();
    if (i % 2 === 0) { await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up(); }
    tk += sc.every;
    if (sc.keys?.[ki] && tk >= sc.keys[ki][1]) { await p.keyboard.press(sc.keys[ki][0]); ki = (ki + 1) % sc.keys.length; tk = 0; }
    const r = await p.evaluate(async (sc) => { const { grade } = sc;
      const g = window.emberfall, s = g.scenes.current, w = s.world, cam = s.camera;
      g.loop.running = false;
      await new Promise((res) => requestAnimationFrame(res));
      const hidden = [];
      for (const key of ['effects', 'entities']) {
        const arr = w[key]; if (!Array.isArray(arr)) continue;
        for (let j = arr.length - 1; j >= 0; j--) {
          const n = arr[j]?.constructor?.name;
          if (n === 'FloatingText') arr.splice(j, 1);
          else if (sc.hideFx && new RegExp(sc.hideFx).test(n ?? '')) hidden.push([arr, arr.splice(j, 1)[0]]);
          else if (/Telegraph|DamageWave|Marker|Fissure|Spear|Meteor|Pillar|Cataclysm|Patch|AshWave|GraveRift|Shockwave|SpinVortex|ChargeGlow|RiftFlash|NovaBurst|FlameRing|Whirlpool|FrostField|ToxicRing|RootSpikes|FireField/.test(n ?? '')) hidden.push([arr, arr.splice(j, 1)[0]]);
        }
      }
      const names = {};
      for (const key of ['effects', 'entities', 'particles']) for (const e of (Array.isArray(w[key]) ? w[key] : [])) { const n = key + ':' + e?.constructor?.name; names[n] = (names[n] ?? 0) + 1; }
      window.__names = names;
      for (const a of [...(w.actors ?? []), ...(w.enemies ?? [])]) { a.flash = 0; a.hpBarTimer = 0; }
      const undo = [];
      for (const a of [...(w.actors ?? []), ...(w.enemies ?? [])]) if (typeof a.type === 'string' && a.def) {
        Object.defineProperty(a, 'isEngaged', { value: false, configurable: true, writable: true });
        const nh = a.nearHero; a.nearHero = false; undo.push(() => { delete a.isEngaged; a.nearHero = nh; });
      }
      const F = Object.getPrototypeOf(g.font), fd = F.draw; F.draw = () => {}; undo.push(() => { F.draw = fd; });
      const C = CanvasRenderingContext2D.prototype, oe = C.ellipse, ob = C.beginPath, os = C.stroke;
      C.ellipse = function (...a) { this.__ell = true; return oe.apply(this, a); };
      C.beginPath = function () { this.__ell = false; return ob.call(this); };
      C.stroke = function (...a) { if (this.__ell) return; return os.apply(this, a); };
      undo.push(() => { C.ellipse = oe; C.beginPath = ob; C.stroke = os; });
      s.hurtFlash = 0;
      const saved = { x: cam.x, y: cam.y, sx: cam.shakeX, sy: cam.shakeY, kx: cam.kickX, ky: cam.kickY };
      const VW = w.lighting?.w ?? null;
      const vw = g.view.width / (g.view.width / 480 === 2 ? 2 : 2), k = 2;
      const worldW = g.view.width / k, worldH = g.view.height / k;
      cam.x = Math.round(window.__camC.x - worldW / 2); cam.y = Math.round(window.__camC.y - worldH / 2);
      cam.shakeX = cam.shakeY = cam.kickX = cam.kickY = 0;
      // Zeitpunkt wählen, an dem kein Glanzkreuz über eine Waffe wandert (entities/Hero.js, performance.now)
      const hs = (w.actors ?? []).filter((a) => a === w.hero || a.companion);
      let T = performance.now() / 1000;
      for (let k = 0; k < 400; k++, T += 0.013) if (hs.every((a) => [1.6, 2.4].every((per) => ((T + (a.id ?? 0) * 0.37) % per) / 0.4 >= 1.05))) break;
      const pn = performance.now; performance.now = () => T * 1000;
      const ems = [];
      if (sc.probe) for (const a of hs) { ems.push([a, a.renderEmissive]); a.renderEmissive = () => {}; }
      if (sc.noGlows) for (const a of hs) { const f = a.currentFrame?.(); if (f?.glows?.length) { ems.push([f, null, f.glows]); f.glows = []; } }
      try { g.render(0); } finally { for (const u of undo.reverse()) u(); }
      for (const [o, fn, gl] of ems) { if (gl) o.glows = gl; else delete o.renderEmissive; }
      performance.now = pn;
      const v = g.view;
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
      const cx = c.getContext('2d'); cx.filter = grade; cx.drawImage(v, 0, 0);
      const out = c.toDataURL('image/png');
      for (const [arr, e] of hidden) arr.push(e);
      Object.assign(cam, { x: saved.x, y: saved.y, shakeX: saved.sx, shakeY: saved.sy, kickX: saved.kx, kickY: saved.ky });
      g.loop.start();
      const toV = (o) => ({ x: Math.round((o.x - cam.x) * k), y: Math.round((o.y - cam.y) * k) });
      return { out, w: v.width, h: v.height, state: window.__target?.state ?? '', names, keys: Object.keys(w).filter((k) => Array.isArray(w[k])).map((k) => k + ':' + w[k].length).join(' ') };
    }, sc);
    const name = `${sc.id}-${String(i).padStart(2, '0')}${r.state ? '-' + r.state : ''}`;
    if (process.env.FXLOG && i % 6 === 5) console.log(name, r.keys, JSON.stringify(r.names));
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.out.split(',')[1], 'base64'));
    meta[name] = { w: r.w, h: r.h };
    await p.waitForTimeout(sc.every);
  }
  console.log(sc.id, JSON.stringify(tp), JSON.stringify(meta[Object.keys(meta).pop()]));
  await ctx.close();
}
await b.close();
