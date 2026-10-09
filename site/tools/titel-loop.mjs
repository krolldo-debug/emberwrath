// Lebendes Titelbild für die Startseite: dieselbe Inszenierung wie keyart.mjs, Szene 'titel' (Skalvyr in den
// Raureifhöhlen, Krieger, Magierin und Waldläuferin davor), aber als nahtlose Schleife. Die Spielschleife steht
// still; jedes Bild wird von Hand gestellt und gezeichnet: Animationsframes, Lichtflackern, Flammen, Waffenglanz
// und Glutpuls hängen nur von der Bildnummer ab und laufen in ganzen Zyklen, Bild N schließt nahtlos an Bild 0 an.
// Partikel, Schaden, Warnflächen, Lebensbalken und Namen sind ausgeblendet (die Seite legt eigene Glut darüber).
// Aufruf: node titel-loop.mjs [OUT-Ordner für PNG-Einzelbilder] [URL]; danach baut Pillow die animierte WebP
// (site/img/titel-loop.webp) und das Standbild titel-loop-0.webp – siehe Ende der Datei.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUT = '/tmp/titel-loop', URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
// 40 Bilder bei 12 fps = 3,33 s. Heldenruhe: 4 Frames à 6 fps = 8 Bilder (5 Zyklen);
// Skalvyrs Ruhewelle: 10 Frames, je 2 Bilder (2 Zyklen, 6 statt 7 fps).
const N = +(process.env.N ?? 40), FPS = 12;
// Stärke des Lichtflackerns (1 = wie im Spiel). Flackern ändert in jedem Bild gut ein Viertel aller Pixel ein wenig
// und verdoppelt die Datei (≈ 2,5 MB statt 1,4 MB); daher steht das Licht standardmäßig ruhig (Mittelwert),
// Flammen, Glutpuls und Figuren bewegen sich trotzdem.
const FLICK = +(process.env.FLICK ?? 0);
const SOV = ['rimeforged_coif', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet', 'kingsbane'];
const sc = {
  id: 'titel', cls: 'warrior', race: 'human', gear: SOV, zone: 'rime_caverns', mageHood: 'colossus_hood',
  party: [['mage', 'dps', 'emberborn'], ['ranger', 'dps', 'elf']],
  floorClean: { biome: 'biome_rime', keep: [2, 4, 8] },
  grade: 'brightness(1.35) contrast(1.12) saturate(1.15)',
  heroRes: 1,
  // Aufstellung: Krieger vorn am Wurm, Magierin dahinter oben, Waldläuferin dahinter unten – gestaffelt, ohne Überdeckung
  hero: [-54, 12], comps: [[-78, -6], [-100, 10]], cam: [-50, -4], shadowW: 18,
  light: [[20, -60, 150, [140, 200, 255], 1.1], [-72, 14, 80, [255, 190, 140], 0.85]],
};
if (process.env.POS) Object.assign(sc, JSON.parse(process.env.POS));   // Aufstellung zum Ausprobieren überschreiben
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(URL);
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
// Volle Bildqualität erzwingen: „Auto“ senkt sie im Headless-Browser sonst auf 480 × 270
await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
// Aufbau wie keyart.mjs: Charakter Stufe 40, Ausrüstung, Gruppe, Boden ohne Schneewehen, Reise in die Zone
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
  const members = [{ kind: 'player', role: 'tank', classId: sc.cls, raceId: sc.race, level: 40, name: 'Zolva' }];
  sc.party.forEach(([cls, role, race], i) => members.push({ kind: 'merc', id: 'm' + i, name: 'x' + i, level: 40, role, classId: cls, raceId: race, look: { variant: i, hairStyle: null, dye: null }, gearSeed: 7 + i * 13, style: { reaction: 0.2, skill: 0.9, chatty: 0, caps: 0, lang: 'de' } }));
  g.finder.group = { id: 'g1', dungeonId: sc.zone, members };
  g.finder.state = 'active';
  // Bodenkacheln mit Schneewehen/Eisflächen durch schlichte Kacheln derselben Serie ersetzen
  const fl = g.assets.sprites[sc.floorClean.biome].floor, keep = sc.floorClean.keep;
  fl.forEach((t, i) => { if (keep.includes(i)) return; const c = t.canvas ?? t, x = c.getContext('2d'), src = fl[keep[i % keep.length]]; x.clearRect(0, 0, c.width, c.height); x.drawImage(src.canvas ?? src, 0, 0); });
  g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
  {
    const [{ getHeroSprites, setHeroRes }, { resolveGear }, { spriteStyle }] = await Promise.all([import('/src/sprites/hero.js'), import('/src/character/gearLook.js'), import('/src/character/cosmetics.js')]);
    // Heldenfiguren in Weltauflösung (1 Texel je Weltpixel) wie Skalvyr und die Wände: sonst wären ihre Pixel halb so
    // groß wie die der Umgebung. Die Figuren behalten dabei ihre Größe, nur die Pixelvorlage wird gröber.
    setHeroRes(sc.heroRes);
    g.scenes.current.world.hero.refreshLook?.();
    const CG = { ranger: ['jarl_cap', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots', 'dawnstring'], mage: [sc.mageHood, 'colossus_robe', 'colossus_gloves', 'colossus_slippers', 'staff_of_last_ash'] };
    for (const c of g.scenes.current.world.actors.filter((a) => a.companion)) {
      const cls = c.member?.classId ?? c.cls?.id, ids = CG[cls]; if (!ids) continue;
      const eq = {}; for (const id of ids) { const d = g.content.get('item', id); if (d?.slot) eq[d.slot] = id; }
      const gear = resolveGear(eq, g.content), look = c.member?.look ?? {};
      c.equipment = eq;
      c.refreshLook = () => c.setAnims(getHeroSprites(c.raceId, cls, look.variant ?? 0, gear, spriteStyle(look)));
      c.refreshLook();
    }
  }
  g.scenes.current.world.particles.density = 0;
  setInterval(() => { const w = g.scenes.current.world; if (!w) return; for (const a of w.actors) if (a === w.hero || a.companion) { a.hp = a.maxHp; a.resource = a.maxResource; } }, 50);
}, sc);
await p.addStyleTag({ content: '#ui{display:none!important}' });
await p.waitForTimeout(800);
// Aufstellung relativ zum Boss, Gegenlichter wie im Standbild; Boss erwacht (Arena), danach wird angehalten
await p.evaluate((sc) => {
  const g = window.emberfall, w = g.scenes.current.world, h = w.hero, t = w.boss;
  const T = { x: t.x, y: t.y };
  const comps = w.actors.filter((a) => a.companion);
  const party = g.finder?.session?.party;
  if (party) party.draw = () => {};
  const set = () => {
    t.x = T.x; t.y = T.y; if (t.maxHp) t.hp = t.maxHp;
    h.x = T.x + sc.hero[0]; h.y = T.y + sc.hero[1];
    comps.forEach((c, i) => { c.x = T.x + sc.comps[i][0]; c.y = T.y + sc.comps[i][1]; });
    t.facing = Math.sign(h.x - t.x) || -1;
  };
  set(); window.__set = setInterval(set, 8);
  // Bodenflecken (Blut, Ruß) des kurzen Kampfes nach dem Aufstellen später wieder entfernen: Stand jetzt merken
  window.__decals = new Map([...w.decals.tiles].map(([key, d]) => { const c = document.createElement('canvas'); c.width = d.c.width; c.height = d.c.height; c.getContext('2d').drawImage(d.c, 0, 0); return [key, c]; }));
  const L = w.lights[0]?.constructor;
  for (const [dx, dy, r, color, intensity] of sc.light) w.addLight(new L({ x: T.x + dx, y: T.y + dy, radius: r, color, intensity, flicker: 0.05, bloom: 0.5 }));
  window.__T = T;
  window.__camC = { x: T.x + sc.cam[0], y: T.y + sc.cam[1] };
}, sc);
await p.waitForTimeout(+(process.env.WAIT ?? 400));

// Anhalten und die Szene in einen ruhigen, zyklischen Zustand bringen
const info = await p.evaluate(async ({ N, sc }) => {
  const g = window.emberfall, s = g.scenes.current, w = s.world, h = w.hero, t = w.boss, T = window.__T;
  g.loop.running = false;
  await new Promise((res) => requestAnimationFrame(res));
  clearInterval(window.__set);
  const hs = w.actors.filter((a) => a === h || a.companion);
  // Positionen exakt wie im Standbild, alle blicken zum Boss
  h.x = T.x + sc.hero[0]; h.y = T.y + sc.hero[1];
  hs.filter((a) => a.companion).forEach((c, i) => { c.x = T.x + sc.comps[i][0]; c.y = T.y + sc.comps[i][1]; });
  t.x = T.x; t.y = T.y; t.facing = -1;
  for (const a of w.actors) { a.vx = a.vy = 0; a.kbx = a.kby = 0; a.flash = 0; a.hpBarTimer = 0; a.invuln = 0; }
  for (const a of hs) { a.facing = 1; a.aimAngle = 0; a.buffs = (a.buffs ?? []).filter((b) => b.id !== 'guard'); a.animator.play('idle', true); a.riding = false; }
  // Wurmzustand: wach, ruhig (Glutpuls im Takt der Schleife), Ruheanimation
  t.state = 'chase'; t.hidden = false; t.hurtAnim = 0; t.rise = 1; t.animator.play('idle', true);
  // Alle Effekte, Geschosse, Gefahrenflächen und Partikel entfernen; Schnee und Funken legt die Seite selbst darüber
  w.effects.length = 0; w.projectiles.length = 0;
  const FX = /Arrow|Trap|Burst|Nova|Projectile|FloatingText|ImpactStar|Telegraph|DamageWave|Marker|Fissure|Spear|Meteor|Pillar|Icicle|Cataclysm|Patch|AshWave|GraveRift|Shockwave|SpinVortex|ChargeGlow|RiftFlash|NovaBurst|FlameRing|Whirlpool|FrostField|ToxicRing|RootSpikes|FireField|Trail|Slash/;
  const gone = [];
  for (let j = w.entities.length - 1; j >= 0; j--) if (FX.test(w.entities[j]?.constructor?.name ?? '')) gone.push(w.entities.splice(j, 1)[0]?.constructor?.name);
  w.particles.active.length = 0;
  for (const [key, d] of [...w.decals.tiles]) {
    const c = window.__decals.get(key);
    if (!c) { w.decals.tiles.delete(key); continue; }
    d.ctx.save(); d.ctx.setTransform(1, 0, 0, 1, 0, 0); d.ctx.clearRect(0, 0, d.c.width, d.c.height); d.ctx.drawImage(c, 0, 0); d.ctx.restore();
  }
  // Kontaktschatten der Helden (Spielschatten getShadow) etwas breiter, damit sie sichtbar auf dem Boden stehen
  for (const a of hs) a.shadowW = sc.shadowW;
  w.combat.hitboxes = [];
  w.lighting.ambientBoost = 0;
  s.hurtFlash = 0;
  // Leuchtpunkte der Heldenframes aus (wie noGlows im Standbild: Glutaugen, Stabkristall)
  for (const a of hs) for (const f of a.animator.anims.idle.frames) f.glows = [];
  // Kurzlebige Lichter (Treffer, Zauber) entfernen
  w.lights = w.lights.filter((l) => l.ttl === Infinity && !(l.follow && l.follow !== t && !hs.includes(l.follow)));
  const cam = s.camera, k = 2, worldW = g.view.width / k, worldH = g.view.height / k;
  const C = { x: Math.round(window.__camC.x - worldW / 2), y: Math.round(window.__camC.y - worldH / 2) };
  const vis = (o) => o.x > C.x - 80 && o.x < C.x + worldW + 80 && o.y > C.y - 40 && o.y < C.y + worldH + 110;
  return {
    view: [g.view.width, g.view.height], gone,
    heroIdle: hs.map((a) => [a.animator.anims.idle.frames.length, a.animator.anims.idle.fps]),
    bossIdle: [t.animator.anims.idle.frames.length, t.animator.anims.idle.fps],
    lights: w.lights.length,
    props: [...w.props, ...w.entities].filter(vis).filter((o) => o.flames?.length || o.o?.flames || o.o?.glow).map((o) => ({ n: o.constructor.name, k: o.kind, fl: (o.flames ?? o.o?.flames ?? []).map((f) => [f.frames.length, f.fps]), glow: !!o.o?.glow })),
    ents: w.entities.filter(vis).map((e) => e.constructor.name).join(','),
  };
}, { N, sc });
console.log(JSON.stringify(info));

// Einzelbilder: alles Zeitabhängige als Funktion der Bildnummer i (0 … N-1), Phase u = i / N
for (let i = 0; i < N; i++) {
  const r = await p.evaluate(({ i, N, FPS, FLICK, grade }) => {
    const g = window.emberfall, s = g.scenes.current, w = s.world, cam = s.camera, t = w.boss, h = w.hero;
    const u = i / N, TAU = Math.PI * 2;
    const hs = w.actors.filter((a) => a === h || a.companion);
    // Heldenruhe: 4 Frames, ein Frame je 2 Bilder (6 fps); jede Figur leicht versetzt, damit sie nicht im Gleichtakt atmen
    hs.forEach((a, j) => { const an = a.animator.anims.idle, n = an.frames.length; const fi = (Math.floor(i / 2) + j) % n; a.animator.current = an; a.animator.name = 'idle'; a.animator.time = (fi + 0.5) / an.fps; });
    // Skalvyr: Ruhewelle in genau CYC Zyklen pro Schleife
    { const an = t.animator.anims.idle, n = an.frames.length, CYC = Math.max(1, Math.round((N / FPS) / (n / an.fps)));
      const fi = Math.floor(u * CYC * n) % n; t.animator.current = an; t.animator.name = 'idle'; t.animator.time = (fi + 0.5) / an.fps;
      // Glutpuls sin(stateTime·4): eine volle Periode je Ruhezyklus
      t.stateTime = (TAU * CYC * u) / 4; }
    // Lichter: Flackern aus drei Sinus wie in Lighting.js, Frequenzen auf ganze Schwingungen je Schleife gerundet
    const D = N / FPS, q = (om) => Math.max(1, Math.round((om * D) / TAU)) * TAU * u;
    for (const l of w.lights) {
      if (l.follow) { l.x = l.follow.x + l.offsetX * (l.follow.facing ?? 1); l.y = l.follow.y + l.offsetY; }
      const sd = l.seed, n = Math.sin(q(9.1) + sd) * 0.5 + Math.sin(q(23.7) + sd * 1.7) * 0.3 + Math.sin(q(3.3) + sd * 3.1) * 0.2;
      l.value = l.intensity * (1 - l.flicker * (0.5 + 0.5 * n * FLICK));
    }
    // Flammen (Fackeln, Becken, Deko): Bildfolge mit 12 fps, ein Frame je Bild; Deko-Glimmen sin(t·2.3) einmal je Schleife
    for (const o of [...w.props, ...w.entities]) {
      if (o.__t0 === undefined) o.__t0 = Math.floor((o.t ?? 0) * 12);
      const fl = o.flames?.length ? o.flames : o.o?.flames;
      // Bildfolge der Flamme in ganzen Durchläufen je Schleife (6 Frames: 7 Durchläufe auf 40 Bilder ≈ 12,6 fps)
      if (fl?.length) { const f = fl[0], n = f.frames.length, cyc = Math.max(1, Math.round(N / n)); o.t = (o.__t0 + Math.floor(u * cyc * n) + 0.5) / f.fps; }
      else if (o.o?.glow) o.t = (TAU * u + o.__t0) / 2.3;
      else if (o.t !== undefined) o.t = o.__t0 / 12;
    }
    w.time = 0;
    // Waffenglanz/Aura lesen performance.now: 3,2 s Waffenzeit je Schleife = genau zwei Glanzperioden (1,6 s)
    const PT = 1000 + 3.2 * u;
    const pn = performance.now; performance.now = () => PT * 1000;
    const undo = [];
    for (const a of [...w.actors, ...w.enemies]) if (typeof a.type === 'string' && a.def) {
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
    const k = 2, worldW = g.view.width / k, worldH = g.view.height / k;
    cam.x = Math.round(window.__camC.x - worldW / 2); cam.y = Math.round(window.__camC.y - worldH / 2);
    cam.shakeX = cam.shakeY = cam.kickX = cam.kickY = 0;
    try { g.render(0); } finally { for (const f of undo.reverse()) f(); performance.now = pn; }
    const v = g.view;
    const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
    const cx = c.getContext('2d'); cx.filter = grade; cx.drawImage(v, 0, 0);
    return { out: c.toDataURL('image/png'), w: v.width, h: v.height };
  }, { i, N, FPS, FLICK, grade: sc.grade });
  writeFileSync(`${OUT}/f${String(i).padStart(3, '0')}.png`, Buffer.from(r.out.split(',')[1], 'base64'));
  if (i === 0) console.log('Bildgröße', r.w, r.h);
}
await b.close();

// Animierte WebP mit Pillow: auf 960 × 540 (Nächster Nachbar, Pixel bleiben scharf), 83 ms je Bild, endlos
if (process.env.NOWEBP) process.exit(0);   // nur Einzelbilder (Vorschau beim Einrichten)
const IMG = resolve(HERE, '../img');
const py = `
import sys, glob
from PIL import Image
src, out, out0, q = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
fr = [Image.open(f).convert('RGB') for f in sorted(glob.glob(src + '/f*.png'))]
fr = [f if f.size == (960, 540) else f.resize((960, 540), Image.NEAREST) for f in fr]
kw = dict(lossless=True, method=6) if q == 'lossless' else dict(quality=int(q), method=6)
akw = dict(kw, minimize_size=True)
fr[0].save(out, save_all=True, append_images=fr[1:], duration=${Math.round(1000 / FPS)}, loop=0, **akw)
fr[0].save(out0, **kw)
print(len(fr))
`;
// Verlustfrei: mit ruhigem Licht und minimize_size (nur geänderte Bildausschnitte) ≈ 1 MB; Q=90 wäre ≈ 0,75 MB,
// verwischt aber die Farbkanten der Figuren. Standbild ebenfalls verlustfrei, damit beim Wechsel nichts springt.
const Q = process.env.Q ?? 'lossless';
const n = execFileSync('python3', ['-c', py, OUT, `${IMG}/titel-loop.webp`, `${IMG}/titel-loop-0.webp`, Q]).toString().trim();
console.log(`titel-loop.webp: ${n} Bilder, ${FPS} fps, ${(statSync(`${IMG}/titel-loop.webp`).size / 1024).toFixed(0)} KB (${Q}); Standbild ${(statSync(`${IMG}/titel-loop-0.webp`).size / 1024).toFixed(0)} KB`);
