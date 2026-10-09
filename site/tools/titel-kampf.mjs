// Titelbild der Startseite als echter Kampf (Nachfolger von titel-loop.mjs, gleiche Bühne und gleicher Bildausschnitt):
// Skalvyr in den Raureifhöhlen, davor Krieger, Magierin und Waldläuferin an ihren festen Plätzen. Diesmal läuft
// die echte Spiellogik: Die Simulation wird von Hand in 60-Hz-Schritten getaktet, die Helden lösen ihre echten
// Fähigkeiten über dieselben Eingabe-Aktionen aus, die ein Spieler drückt (Salve, Feuerball, Erdspalter, Meteor,
// Pfeilregen, Wirbelsturm …), Skalvyr antwortet mit seinem echten Frostatem (Warnfläche, dann Atem), erzwungen
// über seine Angriffswahl statt Zufall. Niemand stirbt oder weicht vom Platz: Leben und Positionen werden nach
// jedem Schritt zurückgesetzt. Schadenszahlen, Lebensbalken, Namen und HUD bleiben unsichtbar.
// Bildregeln: Skalvyr steht rechts versetzt (Kopf eine Heldenbreite vor dem Krieger), Helden liegen über Wurm und
// Effekten (zweiter Durchgang ohne Effekte, per Sprite-Umriss eingesetzt), der Atem endet vor der Waldläuferin.
// Schleife: N Bilder bei 12 fps; Anfang und Ende in Ruhe (alle Effekte verklungen), Ruheanimationen, Lichter,
// Flammen und Waffenglanz hängen dort nur von der Bildnummer ab – Bild N schließt nahtlos an Bild 0 an.
// Aufruf: node titel-kampf.mjs [OUT-Ordner für PNG-Einzelbilder] [URL]
//   Umgebung: N (Bildzahl, Vielfaches von 8), Q (lossless | Qualität), TH/BITS (siehe Ende), NOWEBP=1 (nur PNG),
//   FROM/TO (nur diesen Bildbereich zeichnen, zum Ausprobieren), ATEM (Atemdauer in s), QUIET (Bild ohne neue Partikel)
// Ergebnis: site/img/titel-loop.webp (animiert) und site/img/titel-loop-0.webp (= Bild 0).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUT = '/tmp/titel-kampf', URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
// 96 Bilder bei 12 fps = 8 s; Heldenruhe: 4 Frames, je 2 Bilder (Zyklus 8 Bilder) → N muss Vielfaches von 8 sein
const N = +(process.env.N ?? 96), FPS = 12, STEPS = 60 / FPS;
// Drehbuch [Bild, Wer, Aktion]: wer = 'krieger' | 'magierin' | 'waldl'; Aktion = attack | skill1..skill4
//   Krieger:  skill1 Wirbelsturm, skill2 Kriegsschrei, skill4 Erdspalter (skill3 Ansturm bewegt ihn – nicht benutzt)
//   Magierin: skill3 Feuerball, skill4 Meteor (skill1 Flammennova, skill2 Blinzeln bewegt sie – nicht benutzt)
//   Waldl.:   skill1 Salve, skill2 Durchschuss, skill4 Pfeilregen
// Skalvyr: 'atem' erzwingt den Frostatem (Warnfläche ≈ 0,95 s, dann ATEM s Atem)
const PLAN = [
  [4, 'waldl', 'skill1'],
  [8, 'magierin', 'skill3'],
  [12, 'krieger', 'skill4'],
  [16, 'waldl', 'attack'],
  [18, 'magierin', 'attack'],
  [22, 'boss', 'atem'],
  [34, 'treffer'],
  [36, 'krieger', 'skill2'],
  [42, 'treffer'],
  [52, 'magierin', 'skill4'],
  [54, 'waldl', 'skill4'],
  [56, 'krieger', 'skill1'],
  [61, 'waldl', 'skill2'],
  [63, 'magierin', 'skill3'],
];
const ATEM = +(process.env.ATEM ?? 1.7);
// Ab diesem Bild entstehen keine neuen Partikel mehr; bis zum Ende ist alles verklungen
const QUIET = +(process.env.QUIET ?? N - 16);
const SOV = ['rimeforged_coif', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet', 'kingsbane'];
const sc = {
  id: 'titel', cls: 'warrior', race: 'human', gear: SOV, zone: 'rime_caverns', mageHood: 'colossus_hood',
  party: [['mage', 'dps', 'emberborn'], ['ranger', 'dps', 'elf']],
  floorClean: { biome: 'biome_rime', keep: [2, 4, 8] },
  grade: 'brightness(1.35) contrast(1.12) saturate(1.15)',
  heroRes: 1,
  // Aufstellung (abgestimmt mit der Seite, nicht ändern): Krieger vorn am Wurm, Magierin dahinter oben, Waldläuferin unten
  hero: [-54, 12], comps: [[-78, -6], [-100, 10]], cam: [-50, -4], shadowW: 18,
  // Skalvyr steht um boss[0] nach rechts versetzt (Bühne, Helden und Ausschnitt bleiben an T): Sein Kopf (vorderster
  // Punkt der Ruhepose −73 ab Körpermitte) bleibt so eine Heldenbreite (16) vor der Schwertkante des Kriegers (−47).
  // Beim Atem senkt er den Kopf 9 weiter vor – dafür weicht er um bossAtem zurück (gleitend, nicht springend).
  boss: [42, 0], bossAtem: 9,
  // Atemkegel endet vor dem Rücken der Waldläuferin (Körpermitte −100, Rücken −107): Warnfläche bis atemEnde,
  // der Atem selbst (Kegel, Nebel, Kristalle) läuft von atemWeich[0] bis atemWeich[1] weich aus
  atemEnde: -100, atemWeich: [-68, -102],
  light: [[20, -60, 150, [140, 200, 255], 1.1], [-72, 14, 80, [255, 190, 140], 0.85]],
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('KONSOLE', m.text()); });
await p.goto(URL);
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
// Volle Bildqualität erzwingen: „Auto“ senkt sie im Headless-Browser sonst auf 480 × 270
await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
// Aufbau wie titel-loop.mjs: Charakter Stufe 40, Ausrüstung, Gruppe, Boden ohne Schneewehen, Reise in die Zone
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
  const fl = g.assets.sprites[sc.floorClean.biome].floor, keep = sc.floorClean.keep;
  fl.forEach((t, i) => { if (keep.includes(i)) return; const c = t.canvas ?? t, x = c.getContext('2d'), src = fl[keep[i % keep.length]]; x.clearRect(0, 0, c.width, c.height); x.drawImage(src.canvas ?? src, 0, 0); });
  g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
  {
    const [{ getHeroSprites, setHeroRes }, { resolveGear }, { spriteStyle }] = await Promise.all([import('/src/sprites/hero.js'), import('/src/character/gearLook.js'), import('/src/character/cosmetics.js')]);
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
await p.evaluate((sc) => {
  const g = window.emberfall, w = g.scenes.current.world, h = w.hero, t = w.boss;
  const T = { x: t.x, y: t.y };
  const comps = w.actors.filter((a) => a.companion);
  const party = g.finder?.session?.party;
  if (party) party.draw = () => {};
  const set = () => {
    t.x = T.x + sc.boss[0]; t.y = T.y + sc.boss[1]; if (t.maxHp) t.hp = t.maxHp;
    h.x = T.x + sc.hero[0]; h.y = T.y + sc.hero[1];
    comps.forEach((c, i) => { c.x = T.x + sc.comps[i][0]; c.y = T.y + sc.comps[i][1]; });
    t.facing = Math.sign(h.x - t.x) || -1;
  };
  set(); window.__set = setInterval(set, 8);
  window.__decals = new Map([...w.decals.tiles].map(([key, d]) => { const c = document.createElement('canvas'); c.width = d.c.width; c.height = d.c.height; c.getContext('2d').drawImage(d.c, 0, 0); return [key, c]; }));
  const L = w.lights[0]?.constructor;
  window.__szene = sc.light.map(([dx, dy, r, color, intensity]) => w.addLight(new L({ x: T.x + dx, y: T.y + dy, radius: r, color, intensity, flicker: 0.05, bloom: 0.5 })) ?? w.lights.at(-1));
  window.__T = T;
  window.__camC = { x: T.x + sc.cam[0], y: T.y + sc.cam[1] };
}, sc);
await p.waitForTimeout(400);

// Anhalten, aufräumen (wie titel-loop.mjs) und die Steuerung für den Kampf einrichten
const info = await p.evaluate(async ({ sc, ATEM, QUIET }) => {
  const g = window.emberfall, s = g.scenes.current, w = s.world, h = w.hero, t = w.boss, T = window.__T;
  g.loop.running = false;
  await new Promise((res) => requestAnimationFrame(res));
  clearInterval(window.__set);
  const { makeView } = await import('/src/finder/Party.js');
  const { BotInput } = await import('/src/finder/BotBrain.js');
  const party = g.finder?.session?.party;
  const comps = w.actors.filter((a) => a.companion);
  const hs = [h, ...comps];
  const byCls = (c) => comps.find((a) => (a.member?.classId ?? a.cls?.id) === c);
  const who = { krieger: h, magierin: byCls('mage'), waldl: byCls('ranger') };
  const POS = new Map([[h, sc.hero], [who.magierin, sc.comps[0]], [who.waldl, sc.comps[1]]]);
  const bx = { v: sc.boss[0] };
  const place = () => {
    for (const [a, [dx, dy]] of POS) { a.x = T.x + dx; a.y = T.y + dy; a.vx = a.vy = 0; a.kbx = a.kby = 0; }
    t.x = T.x + Math.round(bx.v); t.y = T.y + sc.boss[1]; t.vx = t.vy = 0; t.kbx = t.kby = 0; t.facing = -1;
    // Helden liegen immer über dem Wurmkörper (er steht eine Spur weiter hinten) – außer beim Biss
    t.sortOffset = /bite/.test(t.state) ? 0 : -10;
  };
  place();
  for (const a of w.actors) { a.vx = a.vy = 0; a.kbx = a.kby = 0; a.flash = 0; a.hpBarTimer = 0; a.invuln = 0; }
  for (const a of hs) { a.facing = 1; a.aimAngle = 0; a.buffs = (a.buffs ?? []).filter((b) => b.id !== 'guard'); a.setState?.('move'); a.skill = null; a.attackBuffer = 0; a.dodgeBuffer = 0; a.skillBuffer?.fill(0); a.combo = 0; a.animator.play('idle', true); a.riding = false; a.shadowW = sc.shadowW; }
  t.state = 'chase'; t.hidden = false; t.hurtAnim = 0; t.rise = 1; t.animator.play('idle', true); t.stateTime = 0;
  t.pending = []; t.hazards = []; t.breathTele = null; t.breathLight = null; t.phase = 1;
  w.effects.length = 0; w.projectiles.length = 0;
  const FX = /Arrow|Trap|Burst|Nova|Projectile|FloatingText|ImpactStar|Telegraph|DamageWave|Marker|Fissure|Spear|Meteor|Pillar|Icicle|Cataclysm|Patch|AshWave|GraveRift|Shockwave|SpinVortex|ChargeGlow|RiftFlash|NovaBurst|FlameRing|Whirlpool|FrostField|ToxicRing|RootSpikes|FireField|Trail|Slash/;
  for (let j = w.entities.length - 1; j >= 0; j--) if (FX.test(w.entities[j]?.constructor?.name ?? '')) w.entities.splice(j, 1);
  w.particles.active.length = 0;
  for (const [key, d] of [...w.decals.tiles]) {
    const c = window.__decals.get(key);
    if (!c) { w.decals.tiles.delete(key); continue; }
    d.ctx.save(); d.ctx.setTransform(1, 0, 0, 1, 0, 0); d.ctx.clearRect(0, 0, d.c.width, d.c.height); d.ctx.drawImage(c, 0, 0); d.ctx.restore();
  }
  // Boden bleibt sauber (Schleife!): keine Brandspuren, Reifpixel oder Risse
  for (const k of ['pixel', 'splat', 'scorch', 'stamp', 'stampFrame']) w.decals[k] = () => {};
  w.combat.hitboxes = [];
  w.lighting.ambientBoost = 0;
  s.hurtFlash = 0;
  for (const a of hs) for (const f of a.animator.anims.idle.frames) f.glows = [];
  w.lights = w.lights.filter((l) => l.ttl === Infinity && !(l.follow && l.follow !== t && !hs.includes(l.follow)));
  // Kein Spielstopp, keine Zeitlupe (die Schleife läuft in fester Taktung)
  // Wetter (Glint, Schnee, Bodenschimmer im Bildschirmraum) steht still wie im alten Standbild – sonst ändert sich
  // jedes Bild flächig (Schimmer-Verlauf über die untere Bildhälfte) und die Schleife würde riesig
  if (s.weather) s.weather.update = () => {};
  s.hitstop = () => {}; s.slowmo = () => {}; s.hitstopTime = 0; s.slowmoTime = 0;
  // Umgebungspartikel (Zonen-Schnee, Atemwölkchen und Rückenreif des Wurms) aus, die Seite legt eigene darüber;
  // ab Bild QUIET entstehen gar keine Partikel mehr, damit am Ende alles verklungen ist
  w.particles.density = 1;
  const P = w.particles, sp = P.spawn.bind(P);
  window.__frame = 0;
  P.spawn = (o) => {
    if (window.__frame >= QUIET) return null;
    const st = new Error().stack;
    if (/ambientParticles|#ambient|Skalvyr\.update/.test(st) && !/breath|Breath|#bite|#release|frameEvents/.test(st)) return null;
    const q = sp(o);
    if (q && /breath|Breath/.test(st)) q.__br = q.alpha;
    else if (q) q.__br = undefined;
    return q;
  };
  // Eingaben je Held (wie ein Spieler bzw. ein Söldner): eigene Tasten, Ziel auf Skalvyr
  const aimAt = { x: T.x + sc.boss[0] - 4, y: T.y - 26 };
  // Söldner behalten ihre Gruppen-Sicht (Party.js) – nur ihr Gehirn schweigt, Tasten und Ziel setzt das Drehbuch
  const inputs = new Map();
  for (const br of party?.brains ?? []) { br.update = () => {}; br.aim = aimAt; br.input.clear(); br.input.stick = { x: 0, y: 0 }; inputs.set(br.bot, br.input); }
  { const inp = new BotInput(), HU = Object.getPrototypeOf(h).update; inputs.set(h, inp);
    h.update = function (dt, world) { return HU.call(this, dt, makeView(world, { input: inp, aim: aimAt })); }; }
  // Skalvyrs Sicht: sein Ziel ist ein Punkt vor der Gruppe (nah = er steht still, fern = Atem auf die Gruppe)
  const ziel = { x: T.x + sc.boss[0] - 50, y: T.y + 4, vx: 0, vy: 0, dead: false, hurtRadius: 6, radius: 5, centerY: T.y - 4, team: 'hero', hp: 1, maxHp: 1, takeHit: () => false, buff: () => {} };
  if (party) party.targetOf = () => ziel;
  const atem = () => {
    ziel.x = T.x - 84; ziel.y = T.y + 6; ziel.centerY = ziel.y - 8;
    t.cooldown = 0;
    for (const k in t.timers) t.timers[k] = 99;
    t.timers.breath = 0; t.last = '';
    t.__atem = true;
  };
  // Atem weich auslaufen lassen (Weltkoordinate x → Deckkraft 0…1)
  const [W0, W1] = sc.atemWeich, weich = (x) => Math.max(0, Math.min(1, (x - (T.x + W1)) / (W0 - W1)));
  const RE = Object.getPrototypeOf(t).renderEmissive, CP = CanvasRenderingContext2D.prototype, fr = CP.fillRect;
  t.renderEmissive = function (ctx, cx, cy) {
    if (this.state !== 'breath') return RE.call(this, ctx, cx, cy);
    ctx.fillRect = function (x, y, w, hh) { const k = window.__ohneAtem ? 0 : weich(x + cx); if (k <= 0) return; const a = this.globalAlpha; this.globalAlpha = a * k; fr.call(this, x, y, w, hh); this.globalAlpha = a; };
    try { RE.call(this, ctx, cx, cy); } finally { delete ctx.fillRect; }
  };
  // Atempartikel (Kristalle, Nebel) merken sich ihre Deckkraft und verblassen im selben Verlauf
  const breathFx = () => {
    for (const q of P.active) if (q.__br !== undefined) { const k = weich(q.x); if (k <= 0) { q.alpha = 0; q.life = Math.min(q.life, 1e-4); } else q.alpha = q.__br * k; }
    const tele = t.breathTele;
    if (tele) {
      tele.r = Math.max(40, tele.x - (T.x + sc.atemEnde));
      if (!tele.__titel) { tele.__titel = true; tele.render = () => {}; tele.renderEmissive = warnZeichnen; }
      if (tele.light) tele.light.dead = true; else tele.light = { dead: true, x: 0, y: 0 };
    }
  };
  // Eigene Atemwarnung statt der Spielwarnfläche: gefüllte rote Bodenmarke auf dem Weltpixelraster, Rand eine Stufe
  // heller, Pulsieren in 3 Stufen, Innenfläche wächst in 4 Stufen bis zum Atem; kein Licht, keine Verläufe.
  // Gezeichnet im Leuchtdurchgang, Wurmumriss ausgespart (Helden setzt der zweite Durchgang ohnehin darüber).
  const WARN = { fill: [0.3, 0.37, 0.44], inner: [0.44, 0.51, 0.58], edge: [0.78, 0.88, 0.98] };
  const off = document.createElement('canvas'); off.width = g.view.width / 2; off.height = g.view.height / 2;
  function warnZeichnen(ctx, cx, cy) {
    if (t.state !== 'breathWindup') return;
    const o = off.getContext('2d'); o.clearRect(0, 0, off.width, off.height);
    const ox = Math.round(this.x - cx), oy = Math.round(this.y - cy), r = this.r, half = this.arc / 2, a0 = this.angle;
    const k = Math.min(1, this.t / this.duration), inner = r * Math.ceil(k * 4) / 4, lv = Math.floor(this.t * 6) % 3;
    const col = { fill: `rgba(190,34,26,${WARN.fill[lv]})`, inner: `rgba(232,64,40,${WARN.inner[lv]})`, edge: `rgba(255,118,86,${WARN.edge[lv]})` };
    const ry = Math.ceil(r * 0.6) + 1;
    for (let py = -ry; py <= ry; py++) for (let px = -Math.ceil(r) - 1; px <= Math.ceil(r) + 1; px++) {
      const dx = px, dy = py / 0.6, d = Math.hypot(dx, dy);
      if (d > r) continue;
      let da = Math.atan2(dy, dx) - a0; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (da > half) continue;
      const edge = d > r - 1.6 || (half - da) * d < 1.2;
      o.fillStyle = edge ? col.edge : d <= inner ? col.inner : col.fill;
      o.fillRect(ox + px, oy + py, 1, 1);
    }
    o.globalCompositeOperation = 'destination-out'; t.drawSprite(o, cx, cy); o.globalCompositeOperation = 'source-over';
    ctx.drawImage(off, 0, 0);
  }
  window.__ctl = { who, inputs, atem, ziel, place, hs, T, bx, breathFx, sc };
  return { hs: hs.map((a) => a.member?.classId ?? a.cls?.id), lights: w.lights.length, bossState: t.state, view: [g.view.width, g.view.height] };
}, { sc, ATEM, QUIET });
console.log(JSON.stringify(info));

const FROM = +(process.env.FROM ?? 0), TO = +(process.env.TO ?? N);
const log = [];
for (let i = 0; i < Math.min(N, TO); i++) {
  const acts = PLAN.filter(([f]) => f === i).map(([, a, c]) => [a, c]);
  const r = await p.evaluate(({ i, N, FPS, STEPS, acts, ATEM, grade, render }) => {
    const g = window.emberfall, s = g.scenes.current, w = s.world, cam = s.camera, t = w.boss, h = w.hero;
    const C = window.__ctl, ev = [];
    function meteorZeichnen(ctx, cx, cy) {
      const k = this.t / this.delay; if (k < 0.66) return;
      const a = Math.min(1, (k - 0.66) / 0.1), x = Math.round(this.x - cx), y = Math.round(this.y - cy);
      const fx = x - Math.round((1 - k) * 60), fy = y - Math.round((1 - k) * 170);
      for (let i = 1; i < 5; i++) { ctx.globalAlpha = (0.5 - i * 0.1) * a; ctx.fillStyle = '#f07a1c'; ctx.fillRect(fx - i * 3, fy - i * 8, 2, 2); }
      ctx.globalAlpha = 0.35 * a; ctx.fillStyle = '#f07a1c'; ctx.fillRect(fx - 4, fy - 3, 9, 7); ctx.fillRect(fx - 3, fy - 4, 7, 9);
      ctx.globalAlpha = a; ctx.fillStyle = '#c8420c'; ctx.fillRect(fx - 3, fy - 2, 7, 5); ctx.fillRect(fx - 2, fy - 3, 5, 7);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(fx - 2, fy - 2, 5, 4); ctx.fillStyle = '#fff0b0'; ctx.fillRect(fx - 1, fy - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
    window.__frame = i;
    for (const [a, c] of acts) {
      if (a === 'boss') C.atem();
      else if (a === 'treffer') {
        // Der Atem erfasst die ganze Gruppe: echter Treffer (Zucken, Blitz, Reiffunken), Leben wird sofort aufgefüllt
        for (const m of C.hs) {
          const hit = { damage: 1, dirX: -1, dirY: 0, knockback: 0, source: t };
          if (m.takeHit(hit) !== false) w.bus.emit('hit', { attacker: t, target: m, damage: 1, crit: false, heavy: false, dirX: -1, dirY: 0, x: m.x, y: m.centerY, killed: false });
          m.invuln = 0;
        }
      } else C.inputs.get(C.who[a])?.press(c);
    }
    for (let k = 0; k < STEPS; k++) {
      if (k === 1) for (const inp of C.inputs.values()) inp.clear();
      for (const m of C.hs) { m.hp = m.maxHp; m.resource = m.maxResource; for (const ab of m.abilities ?? []) ab.cdLeft = 0; m.dead = false; }
      t.hp = t.maxHp; t.dead = false;
      if (!t.__atem) t.cooldown = 99;
      if (t.state === 'breath' && t.breathDur > ATEM) t.breathDur = ATEM;
      g.update(1 / 60);
      // Zurückweichen für den Atem: in der zweiten Hälfte der Warnzeit hin, nach dem Atem wieder zurück (30 px/s)
      { const back = (t.state === 'breathWindup' && t.stateTime > t.windup - 0.45) || t.state === 'breath', to = C.sc.boss[0] + (back ? C.sc.bossAtem : 0);
        C.bx.v += Math.max(-0.5, Math.min(0.5, to - C.bx.v)); }
      C.breathFx();
      // Meteor der Magierin: der Brocken erscheint erst kurz vor dem Einschlag (nicht als Block am oberen Bildrand)
      for (const e of w.entities) if (e.constructor?.name === 'Meteor' && e.hero && !e.__titel) { e.__titel = true; e.renderEmissive = meteorZeichnen; }
      if (t.__atem && t.state !== 'chase') { t.__atem = false; }
      if (t.state === 'chase' && !t.__atem) { C.ziel.x = C.T.x + C.sc.boss[0] - 50; C.ziel.y = C.T.y + 4; C.ziel.centerY = C.ziel.y - 8; }
      C.place();
      // Schadenszahlen nie zeigen
      w.effects = w.effects.filter((e) => e.constructor?.name !== 'FloatingText');
      w.entities = w.entities.filter((e) => e.constructor?.name !== 'FloatingText');
      s.hurtFlash = 0; s.hitstopTime = 0; s.slowmoTime = 0;
    }
    ev.push(`${t.state}/${t.animator.name}`, ...C.hs.map((m) => `${m.state}/${m.animator.name}`), `fx${w.effects.length}+${w.entities.length}+${w.projectiles.length} p${w.particles.active.length} l${w.lights.length}`);
    if (!render) return { ev };

    // ---- Zeichnen: alles Ruhende als Funktion der Bildnummer, damit Anfang und Ende gleich aussehen
    const u = i / N, TAU = Math.PI * 2, undo = [];
    C.hs.forEach((a, j) => {
      if (a.animator.name !== 'idle' || a.state !== 'move') return;
      const an = a.animator.anims.idle, n = an.frames.length, fi = (Math.floor(i / 2) + j) % n;
      const t0 = a.animator.time; a.animator.current = an; a.animator.time = (fi + 0.5) / an.fps; undo.push(() => { a.animator.time = t0; });
    });
    if (t.state === 'chase' && t.animator.name === 'idle') {
      const an = t.animator.anims.idle, n = an.frames.length, CYC = Math.max(1, Math.round((N / FPS) / (n / an.fps)));
      const fi = Math.floor(u * CYC * n) % n, t0 = t.animator.time, st = t.stateTime;
      t.animator.current = an; t.animator.time = (fi + 0.5) / an.fps; t.stateTime = (TAU * CYC * u) / 4;
      undo.push(() => { t.animator.time = t0; t.stateTime = st; });
    }
    // Dauerlichter ruhig (Mittelwert des Flackerns); kurzlebige Zauberlichter wie im Spiel
    // (Fackeln und Becken verändern Stärke und Radius ihres Lichts im Update – hier gilt der Stand vom Anfang)
    window.__licht ??= new Map(w.lights.map((l) => [l, { radius: l.radius, intensity: l.intensity, x: l.x, y: l.y }]));
    for (const l of w.lights) if (l.ttl === Infinity) {
      const s0 = window.__licht.get(l);
      if (s0) { const r0 = l.radius, i0 = l.intensity; l.radius = s0.radius; l.intensity = s0.intensity; undo.push(() => { l.radius = r0; l.intensity = i0; }); if (!l.follow) { l.x = s0.x; l.y = s0.y; } }
      if (l.follow) { l.x = l.follow.x + l.offsetX * (l.follow.facing ?? 1); l.y = l.follow.y + l.offsetY; }
      l.value = l.intensity * (1 - l.flicker * 0.5);
    }
    // Zauberlichter (kurzlebig): Auf- und Abklingen wie im Spiel, aber ohne Flackerrauschen – das Rauschen
    // änderte in jedem Bild große Bodenflächen um wenige Stufen und blähte die verlustfreie Schleife auf
    for (const l of w.lights) if (l.ttl !== Infinity && l.flicker) {
      const v0 = l.value; l.value = l.intensity * (l.ttl / l.maxTtl) * (1 - l.flicker * 0.5); undo.push(() => { l.value = v0; });
    }
    // Flammen und Glimmen der Kulisse in ganzen Zyklen je Schleife
    window.__deko ??= new Set([...w.props, ...w.entities]);
    for (const o of window.__deko) {
      if (o.__t0 === undefined) o.__t0 = Math.floor((o.t ?? 0) * 12);
      const fl = o.flames?.length ? o.flames : o.o?.flames;
      const t0 = o.t; undo.push(() => { o.t = t0; });
      if (fl?.length) { const f = fl[0], n = f.frames.length, cyc = Math.max(1, Math.round(N / n)); o.t = (o.__t0 + Math.floor(u * cyc * n) + 0.5) / f.fps; }
      else if (o.o?.glow) o.t = (TAU * u + o.__t0) / 2.3;
      else if (o.t !== undefined) o.t = o.__t0 / 12;
    }
    const wt = w.time; w.time = 0; undo.push(() => { w.time = wt; });
    // Waffenglanz/Aura lesen performance.now: 4,8 s Waffenzeit je Schleife (3 × 1,6 s, 2 × 2,4 s)
    const PT = 1000 + 4.8 * u;
    const pn = performance.now; performance.now = () => PT * 1000;
    for (const a of [...w.actors, ...w.enemies]) if (typeof a.type === 'string' && a.def) {
      Object.defineProperty(a, 'isEngaged', { value: false, configurable: true, writable: true });
      const nh = a.nearHero; a.nearHero = false; undo.push(() => { delete a.isEngaged; a.nearHero = nh; });
    }
    for (const a of w.actors) a.hpBarTimer = 0;
    const F = Object.getPrototypeOf(g.font), fd = F.draw; F.draw = () => {}; undo.push(() => { F.draw = fd; });
    const CP = CanvasRenderingContext2D.prototype, oe = CP.ellipse, ob = CP.beginPath, os = CP.stroke;
    CP.ellipse = function (...a) { this.__ell = true; return oe.apply(this, a); };
    CP.beginPath = function () { this.__ell = false; return ob.call(this); };
    CP.stroke = function (...a) { if (this.__ell) return; return os.apply(this, a); };
    undo.push(() => { CP.ellipse = oe; CP.beginPath = ob; CP.stroke = os; });
    s.hurtFlash = 0;
    const k = 2, worldW = g.view.width / k, worldH = g.view.height / k;
    cam.x = Math.round(window.__camC.x - worldW / 2); cam.y = Math.round(window.__camC.y - worldH / 2);
    cam.shakeX = cam.shakeY = cam.kickX = cam.kickY = 0;
    // Helden immer über Effekten (Feuerstoß, Einschlag, Atem …): Ein zweiter Durchgang ohne Effekte, Geschosse
    // und Partikel liefert die Helden unverdeckt (gleiche Lichter); deren Sprite-Umriss wird über das Bild gelegt.
    const v = g.view, mk = () => { const q = document.createElement('canvas'); q.width = v.width; q.height = v.height; return q; };
    const cA = mk(), cB = mk(), cM = mk();
    // Warmes Gruppenlicht: im Bild nur als harte, gestufte Lichtinsel (unten); die Helden selbst bleiben davon beleuchtet
    const warm = window.__szene[1], wv = warm.value;
    try {
      warm.value = 0;
      g.render(0);
      warm.value = wv;
      { const a = cA.getContext('2d'); a.drawImage(v, 0, 0);
        const ix = Math.round(warm.x - cam.rx), iy = Math.round(C.T.y + 8 - cam.ry);
        a.save(); a.globalCompositeOperation = 'lighter'; a.fillStyle = 'rgba(255,186,128,0.07)';
        for (const [rx, ry] of [[46, 15], [33, 11], [20, 7]]) for (let y = -ry; y <= ry; y++) {
          const hw = Math.floor(rx * Math.sqrt(1 - (y / (ry + 0.5)) ** 2)); a.fillRect((ix - hw) * 2, (iy + y) * 2, (hw * 2 + 1) * 2, 2);
        }
        a.restore(); }
      const keep = { e: w.effects, n: w.entities, p: w.projectiles, a: w.particles.active };
      w.effects = []; w.entities = keep.n.filter((e) => window.__deko.has(e)); w.projectiles = []; w.particles.active = [];
      // Zauberlichter ohne Überstrahlen (das Bloom der Einschläge überdeckt sonst die Figuren)
      const kurz = w.lights.filter((l) => !window.__licht.has(l)).map((l) => [l, l.bloom]);
      for (const [l] of kurz) l.bloom = 0;
      window.__ohneAtem = true;
      try { g.render(0); } finally { Object.assign(w, { effects: keep.e, entities: keep.n, projectiles: keep.p }); w.particles.active = keep.a; window.__ohneAtem = false; for (const [l, b] of kurz) l.bloom = b; }
      cB.getContext('2d').drawImage(v, 0, 0);
      const m = cM.getContext('2d'); m.setTransform(2, 0, 0, 2, 0, 0); m.imageSmoothingEnabled = false;
      for (const a of C.hs) a.drawSprite(m, cam.rx, cam.ry);
    } finally { for (const f of undo.reverse()) f(); performance.now = pn; }
    const bx = cB.getContext('2d'); bx.globalCompositeOperation = 'destination-in'; bx.drawImage(cM, 0, 0);
    const c = mk();
    const cx = c.getContext('2d'); cx.filter = grade; cx.drawImage(cA, 0, 0); cx.drawImage(cB, 0, 0);
    return { ev, out: c.toDataURL('image/png'), w: v.width, h: v.height };
  }, { i, N, FPS, STEPS, acts, ATEM, grade: sc.grade, render: i >= FROM });
  log.push(`${i}: ${r.ev.join(' ')}`);
  if (r.out) writeFileSync(`${OUT}/f${String(i).padStart(3, '0')}.png`, Buffer.from(r.out.split(',')[1], 'base64'));
}
writeFileSync(`${OUT}/ablauf.txt`, log.join('\n'));
console.log(log.filter((_, j) => j % 4 === 0).join('\n'));
await b.close();

if (process.env.NOWEBP || TO < N || FROM > 0) process.exit(0);
const IMG = resolve(HERE, '../img');
// Animierte WebP mit Pillow, verlustfrei kodiert. Die Zauberlichter verändern in jedem Kampfbild große Bodenflächen
// um wenige Farbstufen (weiche Lichtverläufe); verlustfrei wären das ≈ 11 MB. Daher vor dem Kodieren:
//   BITS (Standard 2): Farbkanäle auf 6 Bit runden (Stufe 4, Mitte der Stufe) – mit bloßem Auge nicht zu sehen;
//   TH (Standard 4): ändert sich ein Pixel gegenüber dem vorigen Ausgabebild um höchstens TH Stufen, bleibt er
//   stehen – so ändern sich nur Pixel, die wirklich die Stufe wechseln. Pixelkanten bleiben exakt (kein Weichzeichnen,
//   keine Farbsäume wie bei verlustbehaftetem WebP Q 90, das zudem ≈ 3,6 MB bräuchte).
// Das Standbild titel-loop-0.webp ist exakt Bild 0 der Schleife (ebenfalls verlustfrei).
const py = `
import sys, glob
import numpy as np
from PIL import Image
src, out, out0, q, th, bits = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
fr = [Image.open(f).convert('RGB') for f in sorted(glob.glob(src + '/f*.png'))]
fr = [np.array(f if f.size == (960, 540) else f.resize((960, 540), Image.NEAREST)).astype(np.int16) for f in fr]
if bits:
    s = 1 << bits
    fr = [np.clip((f // s) * s + s // 2, 0, 255) for f in fr]
res = [fr[0]]
for f in fr[1:]:
    p = res[-1]
    res.append(np.where((np.abs(f - p).max(2) <= th)[..., None], p, f))
ims = [Image.fromarray(r.astype(np.uint8)) for r in res]
kw = dict(lossless=True, method=6) if q == 'lossless' else dict(quality=int(q), method=6)
ims[0].save(out, save_all=True, append_images=ims[1:], duration=${Math.round(1000 / FPS)}, loop=0, minimize_size=True, **kw)
ims[0].save(out0, lossless=True, method=6)
print(len(ims))
`;
const Q = process.env.Q ?? 'lossless', TH = process.env.TH ?? '4', BITS = process.env.BITS ?? '2';
const n = execFileSync('python3', ['-c', py, OUT, `${IMG}/titel-loop.webp`, `${IMG}/titel-loop-0.webp`, Q, TH, BITS], { maxBuffer: 1 << 26 }).toString().trim();
console.log(`titel-loop.webp: ${n} Bilder, ${FPS} fps, ${(statSync(`${IMG}/titel-loop.webp`).size / 1024).toFixed(0)} KB (${Q}, TH ${TH}, BITS ${BITS}); Standbild ${(statSync(`${IMG}/titel-loop-0.webp`).size / 1024).toFixed(0)} KB`);
