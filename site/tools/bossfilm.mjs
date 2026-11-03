// Bossfilme für das Bosskino der Startseite: echte Bosskämpfe aus dem Spiel (neue Bossgrafik und Bosseffekte),
// feste Aufstellung wie welt.mjs (Boss, Held, zwei Mitspieler), aber Bild für Bild im festen Takt aufgenommen:
// die Spielschleife steht, je Bild rechnet das Werkzeug genau 60/FPS Logikschritte und zeichnet einmal. So laufen
// Angriffe, Effekte und Partikel im Film so schnell wie im Spiel. Bosseffekte bleiben im Bild, nur Warnflächen,
// Schadenszahlen, Namensschilder und Lebensbalken werden beim Zeichnen ausgeblendet.
// Aufruf: node bossfilm.mjs OUT [ids] [URL]   (Server im Repo-Ordner: python3 -m http.server 8103)
// Ausgabe: OUT/<id>-NNN.png (960×540) und OUT/meta.json; tools/bossfilm.py wählt Ausschnitt und Schleife.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = 'bf', only, URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
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
const FPS = +(process.env.FPS ?? 15), STEPS = Math.round(60 / FPS);
const F = (id, o) => ({ id, frames: +(process.env.FRAMES ?? 180), click: true, density: 0.5, grade: 'brightness(1.4) contrast(1.1) saturate(1.05)', hideFx: 'ArrowRain|Meteor|ImpactStar|Afterimage',
  party: [['ranger', 'dps', 'elf'], ['warrior', 'dps', 'dwarf']], foes: [], keys: [], ...o });
export const SCENES = [
  F('aasmutter', { lightMode: 'soft', cls: 'warrior', zone: 'spore_hollow', target: 'boss', hero: [-50, 10], comps: [[-78, -2], [-74, 24]], cam: [-30, -16], amb: 2.2, light: [[-70, 0, 80, [255, 190, 140], 0.6]] }),
  F('nerith', { cls: 'warrior', zone: 'sunken_temple', target: 'boss', hero: [-40, 10], comps: [[-66, -2], [-62, 22]], cam: [-24, -18], amb: 1.3, light: [[-60, 0, 80, [255, 180, 110], 0.6]] }),
  F('skalvyr', { cls: 'warrior', zone: 'rime_caverns', target: 'boss', hero: [-58, 16], comps: [[-86, 2], [-82, 30]], cam: [-40, -8], light: [[-80, 10, 70, [255, 190, 140], 0.5]] }),
  F('ignaroth', { hideFx: 'ArrowRain|ImpactStar|Afterimage', lightMode: 'soft', cls: 'warrior', zone: 'molten_forge', target: 'boss', hero: [-58, 18], comps: [[-88, 2], [-84, 34]], cam: [-30, -24], amb: 1.6, light: [[-60, 4, 80, [255, 200, 160], 0.6]] }),
  F('malgareth', { lightMode: 'soft', cls: 'warrior', zone: 'ashen_throne', target: 'boss', hero: [-52, 14], comps: [[-80, 0], [-76, 28]], cam: [-22, -28], floorPatch: 'biome_throne', amb: 1.7, light: [[-52, 4, 70, [255, 200, 160], 0.55]] }),
];
const env = (k, d) => (process.env[k] ? JSON.parse(process.env[k]) : d);
const b = await chromium.launch();
const meta = {};
const run = async (sc0) => {
  const sc = { ...sc0, ...env('OVR', {})[sc0.id], FPS, STEPS };
  const G = sc.g20 ? G20 : G40;
  sc.race = sc.raceO ?? G[sc.cls][0]; sc.gear = sc.gearO ?? G[sc.cls][1];
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('ERR', sc.id, e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 90000 });
  // Volle Bildqualität erzwingen: „Auto“ senkt sie im Headless-Browser sonst auf 480 × 270
  await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
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
    if (sc.party) {
      // Mitspieler (Söldner-Gruppe der Dungeonsuche) als Begleiter, Ausrüstung wie bei keyart.mjs
      const members = [{ kind: 'player', role: 'tank', classId: sc.cls, raceId: sc.race, level: 40, name: 'Zolva' }];
      sc.party.forEach(([cls, role, race], i) => members.push({ kind: 'merc', id: 'm' + i, name: 'x' + i, level: 40, role, classId: cls, raceId: race, look: { variant: i, hairStyle: null, dye: null }, gearSeed: 7 + i * 13, style: { reaction: 0.2, skill: 0.9, chatty: 0, caps: 0, lang: 'de' } }));
      g.finder.group = { id: 'g1', dungeonId: sc.zone, members };
      g.finder.state = 'active';
    }
    if (sc.mount) { g.state.commit('mount:learn', { mountId: sc.mount, shop: true }); g.state.commit('mount:select', { mountId: sc.mount }); }
    // Glutarena ohne Kampfpartner: die Arena-Sitzung schickt sonst sofort nach Hause (pvp/ArenaSession.js)
    if (sc.zone === 'pvp_arena' && g.pvp) g.pvp.returnHome = () => {};
    g.scenes.current.travel(sc.zone, sc.spawn ?? 'start'); await wait(2500);
    const w0 = g.scenes.current.world;
    if (sc.party) {
      const [{ getHeroSprites }, { resolveGear }, { spriteStyle }] = await Promise.all([import('/src/sprites/hero.js'), import('/src/character/gearLook.js'), import('/src/character/cosmetics.js')]);
      const CG = { ranger: ['jarl_cap', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots', 'dawnstring'], mage: ['colossus_robe', 'colossus_gloves', 'colossus_slippers', 'staff_of_last_ash'], rogue: ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'] };
      for (const c of w0.actors.filter((a) => a.companion)) {
        const cls = c.member?.classId ?? c.cls?.id, ids = CG[cls]; if (!ids) continue;
        const eq = {}; for (const id of ids) { const d = g.content.get('item', id); if (d?.slot) eq[d.slot] = id; }
        const gear = resolveGear(eq, g.content), look = c.member?.look ?? {};
        c.equipment = eq;
        c.refreshLook = () => c.setAnims(getHeroSprites(c.raceId, cls, look.variant ?? 0, gear, spriteStyle(look)));
        c.refreshLook();
      }
      const party = g.finder?.session?.party; if (party) party.draw = () => {};
    }
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
    else if (sc.target === 'pos') t = { x: 0, y: 0 };
    else if (sc.target.startsWith('npc:')) t = [...w.actors, ...w.entities].find((a) => a.constructor.name === 'Npc' && (a.npcId ?? a.id) === sc.target.slice(4));
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
    const keep = new Set([t, ...foes]), far = new Map(), comps = w.actors.filter((a) => a.companion);
    // Aufsitzen ohne Reitstunde (q_first_ride): Zustand direkt setzen, der Held übernimmt ihn im nächsten Schritt
    if (sc.mount) g.state.slices.character.mounts.riding = true;
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
      h.facing = sc.face ?? (Math.sign(T.x - h.x) || 1);
      comps.forEach((c, i) => { if (!sc.comps?.[i]) return; c.x = T.x + sc.comps[i][0]; c.y = T.y + sc.comps[i][1]; if (sc.comps[i][2]) c.facing = sc.comps[i][2]; });
    };
    set(); window.__set = set;
    const L = w.lights[0]?.constructor;
    // Gegenlicht ohne Leuchten-Pass (bloom 0): der gestufte Schein des Feinrasters läge als flache Scheibe über den Figuren
    if (L) for (const [dx, dy, r, color, intensity] of sc.light ?? []) w.addLight(new L({ x: T.x + dx, y: T.y + dy, radius: r, color, intensity, flicker: 0.05, bloom: 0 }));
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
  if (sc.hold) await p.keyboard.down(sc.hold);
  let ki = 0, tk = 0;
  for (let i = 0; i < sc.frames; i++) {
    await aim();
    if (sc.click && i % 2 === 0) { await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up(); }
    tk += 1000 / FPS;
    if (sc.keys?.[ki] && tk >= sc.keys[ki][1]) { await p.keyboard.press(sc.keys[ki][0]); ki = (ki + 1) % sc.keys.length; tk = 0; }
    const r = await p.evaluate(async (sc) => {
      const g = window.emberfall, s = g.scenes.current, w = s.world, cam = s.camera;
      if (g.loop.running) { g.loop.running = false; await new Promise((res) => requestAnimationFrame(res)); window.__t0 = performance.now(); window.__i = 0; }
      for (let q = 0; q < sc.STEPS; q++) { window.__set(); for (const L of w.lights) L.flicker = 0; for (const a of w.actors) if (a === w.hero || a.companion) a.hp = a.maxHp; g.loop.update(1 / 60); }   // ruhiges Licht: sonst ändert sich jedes Bild überall
      window.__i++;
      const undo = [];
      // Licht für die Aufnahme (sc.lightMode): Die gestuften Lichtscheiben des Feinrasters erscheinen im Standbild als
      // Kästen/Scheiben um Feuer und Laternen. 'flat' = keine Punktlichter, nur Grundlicht sc.flat (RGB);
      // 'soft' = Punktlichter mit weichem Verlauf (wie vor dem Feinraster). Beide ohne Leuchten-Pass (bloom).
      if (sc.lightMode && w.lighting) {
        const lt = w.lighting, amb0 = lt.ambient, ap = lt.apply, bl = lt.bloom;
        if (sc.lightMode === 'flat') {
          if (sc.flat) lt.ambient = sc.flat;
          lt.apply = function (ctx, cx, cy) { return ap.call(this, ctx, cx, cy, []); };
        } else {
          const { getLightSprite } = await import('/src/sprites/effects.js');
          lt.apply = function (ctx, camX, camY, lights) {
            const l = this.ctx, LM = this.canvas.width / this.w;
            const [ar, ag, ab] = this.ambient;
            l.setTransform(LM, 0, 0, LM, 0, 0); l.globalCompositeOperation = 'source-over'; l.globalAlpha = 1;
            l.fillStyle = `rgb(${ar},${ag},${ab})`; l.fillRect(0, 0, this.w, this.h);
            l.globalCompositeOperation = 'lighter'; l.imageSmoothingEnabled = true;
            for (const li of lights) {
              const r = li.radius, sx = li.x - camX, sy = li.y - camY;
              if (sx + r < 0 || sy + r < 0 || sx - r > this.w || sy - r > this.h) continue;
              l.globalAlpha = Math.max(0, Math.min(1, li.value));
              l.drawImage(getLightSprite(64, li.color, false), sx - r, sy - r, r * 2, r * 2);
            }
            l.globalAlpha = 1;
            ctx.globalCompositeOperation = 'multiply'; const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
            ctx.drawImage(this.canvas, 0, 0, this.canvas.width / LM, this.canvas.height / LM);
            ctx.imageSmoothingEnabled = sm; ctx.globalCompositeOperation = 'source-over';
          };
        }
        lt.bloom = () => {};
        undo.push(() => { lt.ambient = amb0; lt.apply = ap; lt.bloom = bl; });
      }
      // Lichtkreis legendärer Waffen am Boden (gfx/weaponFx.js getRarityRing) sieht im Standbild wie ein Zielring aus: ausblenden
      const RG = window.__ringSet ??= await (async () => {
        const [{ getRarityRing, RING_FRAMES }, { ELEMENTS }] = await Promise.all([import('/src/sprites/effects.js'), import('/src/gfx/Particles.js')]);
        const set = new Set(); for (const el of Object.values(ELEMENTS)) for (let f = 0; f < RING_FRAMES; f++) for (const q of [1, 2]) set.add(getRarityRing(el.colors, q, f).canvas);
        return set;
      })();
      const DI = CanvasRenderingContext2D.prototype, odi = DI.drawImage;
      DI.drawImage = function (im, ...a) { if (RG.has(im)) return; return odi.call(this, im, ...a); };
      undo.push(() => { DI.drawImage = odi; });
      // Effekte: Schadenszahlen weg, Warnflächen (samt ihrem roten Licht) ausblenden
      const HIDE = new RegExp('Telegraph|DamageWave|SpawnMarker|GraveMarker' + (sc.hideFx ? '|' + sc.hideFx : ''));
      for (const key of ['effects', 'entities']) {
        const arr = w[key]; if (!Array.isArray(arr)) continue;
        for (let j = arr.length - 1; j >= 0; j--) {
          const e = arr[j], n = e?.constructor?.name ?? '';
          if (n === 'FloatingText' || n === 'DamageNumber') arr.splice(j, 1);
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
      const T = (window.__t0 + (window.__i * 1000) / sc.FPS) / 1000;
      const pn = performance.now; performance.now = () => T * 1000;
      try { g.render(0); } finally { performance.now = pn; for (const u of undo.reverse()) u(); }
      const v = g.canvas.width === g.view.width && g.canvas.height === g.view.height ? g.canvas : g.view;   // Spiel zeichnet bei gleicher Größe direkt in die Anzeige
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
      const cx = c.getContext('2d'); cx.filter = sc.grade; cx.drawImage(v, 0, 0);
      const out = c.toDataURL('image/png');
      const toV = (o) => ({ x: Math.round((o.x - cam.x) * k), y: Math.round((o.y - 12 - cam.y) * k) });
      const fx = {}; for (const key of ['effects', 'entities']) for (const e of (Array.isArray(w[key]) ? w[key] : [])) { const n = e?.constructor?.name; fx[n] = (fx[n] ?? 0) + 1; }
      const res = { fx, out, hero: toV(w.hero), target: toV(window.__target), state: window.__target?.state ?? '', hstate: w.hero.state ?? '' };
      Object.assign(cam, { x: saved.x, y: saved.y, shakeX: saved.sx, shakeY: saved.sy, kickX: saved.kx, kickY: saved.ky });
      return res;
    }, sc);
    const name = `${sc.id}-${String(i).padStart(3, '0')}`;
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.out.split(',')[1], 'base64'));
    meta[name] = { fx: r.fx, hero: r.hero, target: r.target, state: r.state, hstate: r.hstate };
  }
  console.log(sc.id, JSON.stringify(tp));
  await p.close();
};
const list = SCENES.filter((s) => !only || only.split(',').includes(s.id) || false);
const PAR = +(process.env.PAR ?? 3);
for (let i = 0; i < list.length; i += PAR) await Promise.all(list.slice(i, i + PAR).map(run));
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
