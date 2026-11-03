import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { Entity } from '../entities/Entity.js';
import { drawGlowLayer } from '../gfx/Sprite.js';
import { Light } from '../gfx/Lighting.js';
import { serverNow } from '../progression/clock.js';
import { createStarfallSprites } from '../sprites/starfall.js';

// Weltereignis „Sternenfall“ (Sternenglut Teil 1): Alle 30 Minuten stürzt in den Treibenden Gärten und in den
// Splitterweiten (um 15 Minuten versetzt) ein Stern ab. Zeit und Ort ergeben sich aus der Serverzeit
// (progression/clock.js), darum sehen alle Spieler eines Gebiets denselben Stern zur selben Zeit am selben Ort,
// ohne dass der Shard etwas wissen muss. Gegner rechnet wie überall noch jeder Client selbst (worker/shard.js, Stufe 1).
//
// Ablauf je Stern:
//   Ankündigung  60 s vorher: Meldung mit Ort, Lichtsäule und Markierung auf Karte und Minikarte
//   Einschlag    Stern fällt sichtbar vom Himmel, Krater mit Sternenherz bleibt 5 Minuten
//   Kampf        wer an den Krater tritt, löst drei Wellen von Leerenwesen aus (Gegner des Gebiets, normale Beute)
//   Belohnung    danach bricht das Sternenherz auf: eine Truhe (EV.OBJECT_INTERACT kind 'chest', id 'starfall_<zone>',
//                Beute wie jede Truhe, im Fortschrittsbuch über den Truhen-Eimer gedeckt)
// Jeder Spieler kann jeden Stern einmal öffnen.
//
// Glutsturz (Durchlauf 03.11.): dieselbe Mechanik in den alten Gebieten Stufe 1–40 (theme 'ember'). Ein Glutbrocken
// stürzt vom Berg, die Glut lockt Kreaturen des Gebiets an, danach bricht das Glutherz auf (Truhe 'glutsturz_<zone>').
// Kürzerer Takt (period), damit man ihn beim Durchziehen eines Gebiets meist einmal erlebt. Orte ohne eigene
// starfallSites sucht emberSites() aus der Karte (offene, erreichbare Plätze abseits von Siedlungen).

const T = CONFIG.tileSize;
const MIN = 60_000;
export const STARFALL = {
  period: 30 * MIN,
  warn: 60_000,
  open: 5 * MIN,
  zones: {
    drifting_gardens: { offset: 0, foes: [['void_wisp', 'void_wisp', 'bloom_stalker'], ['void_wisp', 'bloom_stalker', 'vine_horror', 'void_wisp'], ['rootbound', 'void_wisp', 'bloom_stalker', 'void_wisp', 'vine_horror']] },
    splitterweiten: { offset: 15 * MIN, foes: [['void_hound', 'shard_crawler', 'void_hound'], ['prism_elemental', 'void_hound', 'shard_crawler', 'void_hound'], ['statue_wraith', 'void_hound', 'prism_elemental', 'void_hound', 'shard_crawler']] },
    // Glutsturz in den alten Gebieten (theme 'ember'): Takt so, dass man ihn beim Durchziehen meist einmal erlebt
    emberhollow: { theme: 'ember', period: 12 * MIN, offset: 4 * MIN, foes: [['ember_beetle', 'wolf', 'ember_beetle'], ['wolf', 'ember_beetle', 'wolf', 'ember_beetle']] },
    ashwood: { theme: 'ember', period: 20 * MIN, offset: 2 * MIN, foes: [['ember_beetle', 'ember_beetle', 'ash_boar'], ['ember_beetle', 'thorn_crawler', 'ash_boar', 'ember_beetle'], ['bandit', 'ember_beetle', 'bandit_archer', 'thorn_crawler', 'ember_beetle']] },
    cinder_peaks: { theme: 'ember', period: 20 * MIN, offset: 9 * MIN, foes: [['fire_imp', 'fire_imp', 'magma_hound'], ['fire_imp', 'magma_hound', 'cinder_cultist', 'fire_imp'], ['ash_golem', 'fire_imp', 'magma_hound', 'cinder_cultist', 'fire_imp']] },
    ashen_steppe: { theme: 'ember', period: 20 * MIN, offset: 16 * MIN, foes: [['dust_hyena', 'dust_hyena', 'steppe_raider'], ['steppe_raider', 'raider_archer', 'dust_hyena', 'steppe_raider'], ['dust_shaman', 'steppe_raider', 'raider_archer', 'dust_hyena', 'gnoll_trapper']] },
    blighted_marsh: { theme: 'ember', period: 20 * MIN, offset: 6 * MIN, foes: [['swamp_leech', 'plague_toad', 'swamp_leech'], ['bog_lurker', 'plague_toad', 'swamp_leech', 'rot_shaman'], ['bog_slime', 'bog_lurker', 'rot_shaman', 'plague_toad', 'swamp_leech']] },
    frostspire: { theme: 'ember', period: 20 * MIN, offset: 13 * MIN, foes: [['frost_wolf', 'frost_wolf', 'snow_stalker'], ['ice_troll', 'frost_wolf', 'rime_witch', 'frost_wolf'], ['frost_revenant', 'ice_troll', 'snow_stalker', 'rime_witch', 'frost_wolf']] },
    ember_wastes: { theme: 'ember', period: 20 * MIN, offset: 0, foes: [['ash_wraith', 'ash_wraith', 'magma_serpent'], ['cinder_knight', 'ash_wraith', 'ember_cultist_adept', 'magma_serpent'], ['cinder_bombardier', 'cinder_knight', 'ash_wraith', 'ember_cultist_adept', 'phase_wraith']] },
  },
};

// Aussehen und Texte je Art (Sternenfall in den Sternenscherben, Glutsturz in den alten Gebieten)
const THEMES = {
  star: {
    chest: 'starfall', icon: 'gem_starglass', sprites: 'star',
    mark: '#b070ff', beam: ['#b070ff', '#f0dcff'], tail: ['#ffffff', '#fff0c0', '#f6b860', '#b070ff'],
    light: [200, 170, 255], heartLight: [190, 150, 255], sparks: ['#e8c8ff', '#b070ff'], burst: ['#ffffff', '#f6d888', '#b070ff', '#7a3ac8'], spawn: ['#e8c8ff', '#b070ff', '#4a1a80'],
    soon: (a) => `Ein Stern stürzt bald herab, ${a}.`, now: (a) => `Ein Stern stürzt gleich herab, ${a}.`, here: (a) => `Hier ist gerade ein Stern gefallen, ${a}.`,
    start: 'Leerenwesen kriechen aus dem Krater!', wave: 'Eine neue Welle bricht aus dem Stern.', last: 'Die letzte Welle bricht aus dem Stern.',
    done: 'Sternenfall überstanden', doneSub: 'Das Sternenherz ist aufgebrochen', doneColor: '#c8a8ff', prompt: 'Das Sternenherz nehmen',
  },
  ember: {
    chest: 'glutsturz', icon: 'ore_ember', sprites: 'ember',
    mark: '#ff6a1a', beam: ['#ff6a1a', '#ffe0b0'], tail: ['#ffffff', '#fff0c0', '#ffb040', '#e8401a'],
    light: [255, 150, 80], heartLight: [255, 130, 60], sparks: ['#ffd080', '#ff6a1a'], burst: ['#ffffff', '#ffd080', '#ff6a1a', '#a8300c'], spawn: ['#ffd080', '#ff6a1a', '#6a1e0a'],
    soon: () => 'Ein Glutbrocken stürzt bald vom Berg herab.', now: () => 'Ein Glutbrocken schlägt gleich ein!', here: () => 'Hier ist gerade ein Glutbrocken eingeschlagen.',
    start: 'Die Glut lockt Kreaturen an!', wave: 'Eine neue Welle stürmt heran.', last: 'Die letzte Welle stürmt heran.',
    done: 'Glutsturz überstanden', doneSub: 'Das Glutherz ist aufgebrochen', doneColor: '#ffb070', prompt: 'Das Glutherz nehmen',
  },
};
const themeOf = (zoneId) => THEMES[STARFALL.zones[zoneId]?.theme ?? 'star'];
const TRIGGER_DIST = 9 * T;     // so nah am Krater beginnen die Wellen
const WAVE_GAP = 2.5;           // Pause zwischen den Wellen (s)
const NEAR_FX = 320;            // Einschlag in diesem Abstand: Beben und Klang

// Zustand für ein Gebiet zu einer Zeit (rein, ohne Welt): null oder { slot, impactAt, warnAt, endsAt, phase }
export function starfallAt(zoneId, now, offset = STARFALL.zones[zoneId]?.offset) {
  if (offset == null) return null;
  const P = STARFALL.zones[zoneId]?.period ?? STARFALL.period;
  // nächster Einschlag, der noch nicht länger als „open“ her ist
  const slot = Math.floor((now - offset + P - STARFALL.open) / P);
  const impactAt = slot * P + offset;
  const warnAt = impactAt - STARFALL.warn, endsAt = impactAt + STARFALL.open;
  const phase = now < warnAt ? 'idle' : now < impactAt ? 'warn' : now < endsAt ? 'open' : 'idle';
  return { slot, impactAt, warnAt, endsAt, phase };
}

// Ort eines Sterns: fester Wurf aus Gebiet und Takt, damit alle denselben Platz sehen
export function starfallSite(zoneId, slot, sites) {
  if (!sites?.length) return null;
  let h = 2166136261;
  for (const c of `${zoneId}:${slot}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return sites[(h >>> 0) % sites.length];
}

export function installStarfall(game) {
  game.addSessionSystem('starfall', (session) => {
    const sys = new StarfallSystem(session);
    session.starfall = sys;
    return { sys, update: (dt, s) => sys.update(dt, s), dispose: () => sys.dispose() };
  }, 13);
}

export class StarfallSystem {
  constructor(session) {
    this.s = session;
    this.ev = null;          // laufender Stern in diesem Gebiet
    this.opened = new Set(); // geöffnete Sterne (zone:slot) dieser Sitzung
    this.shift = 0;          // Probe (nur lokal): verschiebt die Uhr dieses Spiels
    this.offs = [];
    const on = (ev, fn) => { const off = session.bus.on(ev, fn); if (typeof off === 'function') this.offs.push(off); };
    on(EV.ZONE_LEAVE, () => this.#clear());
    on(EV.ZONE_ENTER, () => { this.entered = true; });
    on(EV.PLAYER_DIED, () => { if (this.ev?.waves) this.ev.waves.failed = true; });
  }

  get world() { return this.s.world; }
  now() { return serverNow() + this.shift; }

  // Probe für Bilder und Videos (nur auf dem eigenen Rechner): nächster Stern in sec Sekunden
  trigger(sec = 5) {
    if (!/^(localhost|127\.0\.0\.1)$/.test(globalThis.location?.hostname ?? '')) return false;
    const z = STARFALL.zones[this.world?.zone?.id];
    if (!z) return false;
    const st = starfallAt(this.world.zone.id, this.now());
    const next = st.phase === 'idle' && st.impactAt > this.now() ? st.impactAt : st.impactAt + (z.period ?? STARFALL.period);
    this.shift += next - (this.now() + sec * 1000);
    this.#clear();
    return true;
  }

  dispose() { this.#clear(); for (const off of this.offs) off(); this.offs = []; }

  #clear() {
    const e = this.ev;
    if (!e) return;
    for (const x of [e.beam, e.light]) if (x) x.dead = true;
    for (const x of [e.fall, e.heart]) if (x) x.removed = true;
    if (e.heart) this.world?.interactables && (this.world.interactables = this.world.interactables.filter((i) => i !== e.heart));
    this.ev = null;
  }

  update(dt, s) {
    const w = this.world;
    if (!w || s.paused) return;
    const zoneId = w.zone?.id, z = STARFALL.zones[zoneId];
    if (!z || w.zone.instanced) { if (this.ev) this.#clear(); return; }
    const now = this.now(), st = starfallAt(zoneId, now);
    if (this.ev && (this.ev.slot !== st.slot || st.phase === 'idle' || this.ev.world !== w)) this.#clear();
    if (st.phase === 'idle') { this.entered = false; return; }
    if (!this.ev) {
      const site = starfallSite(zoneId, st.slot, w.dungeon?.level?.starfallSites ?? emberSites(w));
      if (!site) return;
      const x = site[0] * T + T / 2, y = site[1] * T + T / 2;
      this.ev = { slot: st.slot, world: w, x, y, area: areaName(w, site) ?? w.zone.name, key: `${zoneId}:${st.slot}`, said: {}, th: themeOf(zoneId) };
    }
    const e = this.ev;
    if (st.phase === 'warn') this.#warn(e, now, st);
    else this.#open(e, now, st, dt);
    this.entered = false;
  }

  #say(e, id, text, kind = 'warn') {
    if (e.said[id]) return;
    e.said[id] = true;
    this.s.bus.emit(EV.UI_TOAST, { text, kind, icon: e.th.icon });
  }

  #sprites(th) { return ((StarfallSystem.sprites ??= {})[th.sprites] ??= createStarfallSprites(th.sprites)); }

  #warn(e, now, st) {
    const w = this.world;
    const sec = Math.max(1, Math.ceil((st.impactAt - now) / 1000));
    if (sec > 20) this.#say(e, 'warn', e.th.soon(e.area));
    else this.#say(e, 'warn', e.th.now(e.area));
    if (!e.fall) {
      e.fall = w.spawn(new FallingStar(e.x, e.y, st.impactAt, this, e.th));
      e.beam = w.addLight(new Light({ x: e.x, y: e.y - 6, radius: 46, color: e.th.light, intensity: 0.5, flicker: 0.3, bloom: 0.4 }));
    }
    // die letzten Sekunden: der Stern ist am Himmel zu sehen und zu hören
    if (sec <= 3 && !e.whoosh) {
      e.whoosh = true;
      if (dist(w.hero, e) < NEAR_FX * 2) this.s.sfx?.play?.('meteorFall');
    }
  }

  #open(e, now, st, dt) {
    const w = this.world, h = w.hero;
    if (!e.heart) {
      if (e.fall) e.fall.removed = true;
      if (e.beam) e.beam.dead = true;
      e.heart = w.spawn(new StarHeart(e.x, e.y, this.#sprites(e.th), this, e));
      w.interactables.push(e.heart);
      e.light = w.addLight(new Light({ x: e.x, y: e.y - 18, radius: 90, color: e.th.heartLight, intensity: 0.9, flicker: 0.15, bloom: 0.5 }));
      // Wer beim Einschlag schon da ist, sieht und hört ihn; wer später kommt, findet nur den Krater
      if (now - st.impactAt < 1500) {
        w.particles.ring(e.x, e.y - 4, 26, 40, e.th.burst, 120);
        w.particles.magic?.(e.x, e.y - 8, 30, 20);
        w.addLight(new Light({ x: e.x, y: e.y - 10, radius: 220, color: [255, 230, 190], intensity: 1.6, ttl: 0.7, bloom: 0.9 }));
        const d = dist(h, e);
        if (d < NEAR_FX) { this.s.camera?.shake?.(5 * (1 - d / NEAR_FX) + 1); this.s.sfx?.play?.('quake'); }
      }
      if (this.entered) this.#say(e, 'here', e.th.here(e.area));
    }
    if (this.opened.has(e.key)) { e.heart.state = 'spent'; return; }
    // Wellen: beginnen, sobald der Held am Krater steht
    const near = !h.dead && dist(h, e) < TRIGGER_DIST;
    if (!e.waves && near && e.heart.state === 'whole') {
      e.waves = { i: 0, live: [], gap: 0.6, failed: false };
      this.#say(e, 'start', e.th.start);
    }
    const wv = e.waves;
    if (!wv || e.heart.state !== 'whole') return;
    if (wv.failed) {
      // gefallen: Wellen beginnen von vorn, sobald man zurückkommt; Übriggebliebene bleiben am Krater
      e.waves = null;
      return;
    }
    wv.live = wv.live.filter((x) => !x.dead && !x.removed);
    if (wv.live.length) return;
    const foes = STARFALL.zones[w.zone.id].foes;
    if (wv.i >= foes.length) {
      e.heart.state = 'open';
      this.s.bus.emit(EV.UI_BANNER, { title: e.th.done, sub: e.th.doneSub, color: e.th.doneColor });
      w.particles.ring(e.x, e.y - 18, 14, 24, ['#ffffff', '#f6d888', '#d8a440'], 70);
      return;
    }
    wv.gap -= dt;
    if (wv.gap > 0) return;
    const list = foes[wv.i];
    wv.i++; wv.gap = WAVE_GAP;
    if (wv.i > 1) this.#say(e, `wave${wv.i}`, wv.i === foes.length ? e.th.last : e.th.wave, 'info');
    list.forEach((type, k) => {
      const a = (k / list.length) * Math.PI * 2 + wv.i * 0.7, r = 26 + (k % 2) * 8;
      const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r * 0.6;
      const foe = w.spawnEnemy(type, x, y, { home: { x: e.x, y: e.y }, respawned: true });
      foe.starfall = true;
      w.particles.ring(x, y - 6, 6, 12, e.th.spawn, 40);
      try { foe.aggro(w); } catch { /* Gegner noch im Aufbau */ }
      wv.live.push(foe);
    });
  }

  // Sternenherz geöffnet: Truhe wie jede andere, je Stern einmal
  claim(e) {
    const w = this.world;
    if (this.opened.has(e.key)) return;
    this.opened.add(e.key);
    w.bus.emit('chestOpen', { x: e.x, y: e.y });
    w.bus.emit(EV.OBJECT_INTERACT, { objectId: `${e.th.chest}_${w.zone.id}`, kind: 'chest', x: e.x, y: e.y - 6, zoneId: w.zone.id });
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Orte für den Glutsturz in Gebieten ohne eigene starfallSites: offene Plätze (6 × 4 Felder frei), vom Eingang aus
// erreichbar, abseits von Siedlungen, Portalen und Eingang; gleichmäßig verteilt (höchstens 8). Die Karte ist für alle
// Spieler gleich, darum sehen alle denselben Ort. Einmal je Karte berechnet.
const SITE_CACHE = new WeakMap();
export function emberSites(w) {
  const d = w?.dungeon;
  if (!d?.level) return null;
  if (SITE_CACHE.has(d.level)) return SITE_CACHE.get(d.level);
  const W = d.w, H = d.h, start = d.spawns?.start ?? d.heroStart;
  const out = [];
  if (start && W && H) {
    const free = (tx, ty, rx, ry) => { const px = tx * T + T / 2, py = ty * T + T / 2; return !d.collidesRect(px - rx, py - ry, px + rx, py + ry); };
    // erreichbare Felder: Flutfüllung vom Eingang (wie TileMap.reachable)
    const seen = new Uint8Array(W * H), queue = new Int32Array(W * H);
    let head = 0, tail = 0;
    const s0 = Math.floor(start.y / T) * W + Math.floor(start.x / T);
    seen[s0] = 1; queue[tail++] = s0;
    while (head < tail) {
      const i = queue[head++], x = i % W, y = (i - x) / W;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (seen[n] || !free(nx, ny, 5, 4)) continue;
        seen[n] = 1; queue[tail++] = n;
      }
    }
    const avoid = [...(w.npcs ?? []).map((n) => [n.x, n.y, 14 * T]), ...(d.level.portals ?? []).map((p) => [p.x * T, p.y * T, 7 * T]), [start.x, start.y, 16 * T]];
    const cand = [];
    for (let ty = 4; ty < H - 4; ty += 3) for (let tx = 4; tx < W - 4; tx += 3) {
      if (!seen[ty * W + tx] || !free(tx, ty, 3 * T, 2 * T)) continue;
      const px = tx * T + T / 2, py = ty * T + T / 2;
      if (avoid.some(([ax, ay, r]) => Math.hypot(ax - px, ay - py) < r)) continue;
      cand.push([tx, ty]);
    }
    // gleichmäßig verteilen: immer den Platz, der am weitesten von den schon gewählten liegt
    if (cand.length) out.push(cand[Math.floor(cand.length / 2)]);
    while (out.length < 8 && out.length < cand.length) {
      let best = null, bd = -1;
      for (const c of cand) { const m = Math.min(...out.map((o) => Math.hypot(o[0] - c[0], o[1] - c[1]))); if (m > bd) { bd = m; best = c; } }
      if (!best || bd < 10) break;
      out.push(best);
    }
  }
  SITE_CACHE.set(d.level, out.length ? out : null);
  return SITE_CACHE.get(d.level);
}

function areaName(w, [tx, ty]) {
  const a = (w.dungeon?.level?.areas ?? []).find((r) => !r.town && tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
  return a ? a.name : null;
}

// ------------------------------------------------------------------ Ankündigung: Lichtsäule, dann der fallende Stern
class FallingStar extends Entity {
  constructor(x, y, impactAt, sys, th = THEMES.star) {
    super(x, y);
    this.impactAt = impactAt; this.sys = sys; this.t = 0; this.th = th;
    this.mapStar = true;
  }
  get sortY() { return this.y + 400; }
  update(dt, world) {
    this.t += dt;
    const left = (this.impactAt - this.sys.now()) / 1000;
    this.left = left;
    // Funken steigen aus der Markierung
    if (Math.random() < dt * 6) world.particles.spawn({ x: this.x + (Math.random() - 0.5) * 24, y: this.y, vx: 0, vy: 0, rise: 14 + Math.random() * 10, wobble: 6, life: 1 + Math.random(), colors: this.th.sparks, emissive: true });
  }
  // Ziel am Boden: pulsierender Ring aus Pixeln
  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const k = 0.5 + 0.5 * Math.sin(this.t * 4), r = 20 + k * 3;
    ctx.fillStyle = this.th.mark;
    for (let i = 0; i < 40; i++) {
      if (i % 4 === 3) continue;
      const a = (i / 40) * Math.PI * 2 + this.t * 0.5;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.45), 1, 1);
    }
  }
  renderEmissive(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - cy, left = this.left ?? 99;
    // Lichtsäule: dünner Strahl nach oben, wird zum Einschlag hin heller
    const a = Math.min(1, 0.35 + Math.max(0, 1 - left / 60) * 0.5);
    ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(this.t * 6));
    ctx.fillStyle = this.th.beam[0]; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 140, 3, 140);
    ctx.fillStyle = this.th.beam[1]; ctx.fillRect(Math.round(x), Math.round(y) - 140, 1, 140);
    ctx.globalAlpha = 1;
    // die letzten 1,6 s: der Stern selbst, schräg von oben rechts, mit Schweif aus Glut und Leerenlicht
    if (left < 1.6) {
      const f = Math.pow(1 - Math.max(0, left) / 1.6, 1.4);
      const DX = 130, DY = -150, sx = x + DX * (1 - f), sy = y + DY * (1 - f);
      for (let i = 18; i >= 0; i--) {
        const g = i / 18, px = sx + DX * g * 0.32, py = sy + DY * g * 0.32;
        ctx.globalAlpha = (1 - g) * (1 - g * 0.3);
        const tl = this.th.tail;
        ctx.fillStyle = i < 2 ? tl[0] : i < 6 ? tl[1] : i < 11 ? tl[2] : tl[3];
        const sz = i < 2 ? 6 : i < 5 ? 5 : i < 10 ? 4 : 3;
        ctx.fillRect(Math.round(px - sz / 2), Math.round(py - sz / 2), sz, sz);
      }
      // Hof und Funkelkreuz um den Kopf
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#f6d888'; ctx.fillRect(Math.round(sx) - 5, Math.round(sy) - 5, 11, 11);
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(sx) - 7, Math.round(sy), 15, 1); ctx.fillRect(Math.round(sx), Math.round(sy) - 7, 1, 15);
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ Krater mit Sternenherz
class StarHeart extends Entity {
  constructor(x, y, sprites, sys, ev) {
    super(x, y);
    this.sp = sprites; this.sys = sys; this.ev = ev;
    this.state = 'whole'; this.t = 0; this.interactRange = 26;
    this.mapStar = true;
  }
  get sortY() { return this.y + 2; }
  canInteract(world) { return this.state === 'open' && !world.hero.dead; }
  prompt() { return this.ev.th.prompt; }
  promptAnchor() { return { x: this.x, y: this.y - 40 }; }
  interact() {
    if (this.state !== 'open') return;
    this.sys.claim(this.ev);
    this.state = 'spent';
  }
  update(dt, world) {
    this.t += dt;
    if (this.state !== 'spent' && Math.random() < dt * (this.state === 'open' ? 8 : 3)) {
      world.particles.spawn({ x: this.x + (Math.random() - 0.5) * 10, y: this.y - 20, vx: 0, vy: 0, rise: 10 + Math.random() * 12, wobble: 8, life: 0.8 + Math.random(), colors: this.state === 'open' ? ['#fff6d8', '#f6d888'] : this.ev.th.sparks, emissive: true });
    }
  }
  #heart() {
    const sp = this.sp;
    if (this.state === 'spent') return sp.heartSpent;
    const list = this.state === 'open' ? sp.heartOpen : sp.heart;
    return list[Math.floor(this.t * 4) % list.length];
  }
  render(ctx, cx, cy) {
    this.sp.crater.draw(ctx, this.x - cx, this.y - cy);
    this.#heart().draw(ctx, this.x - cx, this.y - cy - 4);
  }
  renderEmissive(ctx, cx, cy) {
    const c = this.sp.crater;
    if (c.glowCanvas) { ctx.globalAlpha = this.state === 'spent' ? 0.35 : 0.75 + 0.25 * Math.sin(this.t * 2.5); drawGlowLayer(ctx, c, c.glowCanvas, this.x - cx, this.y - cy); }
    const h = this.#heart();
    if (h.glowCanvas) { ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this.t * 5); drawGlowLayer(ctx, h, h.glowCanvas, this.x - cx, this.y - cy - 4); }
    ctx.globalAlpha = 1;
  }
}
