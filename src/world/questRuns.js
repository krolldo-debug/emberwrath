import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { Actor } from '../entities/Actor.js';
import { getShadow } from '../entities/Entity.js';
import { ENEMY_TYPES } from '../entities/enemyTypes.js';
import { Animation, SpriteFrame } from '../gfx/Sprite.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { Light } from '../gfx/Lighting.js';
import { createCaravanSprites } from '../sprites/caravan.js';
import { dangerAt } from '../finder/dangers.js';

// Thread B – Eskorte und Verteidigen (Vertrag C §4).
//
// Start: Der Held spricht den Start an (EV.OBJECT_INTERACT { objectId } bzw. EV.NPC_INTERACT { npcId })
// oder nimmt beim Start-NPC die Quest an (EV.QUEST_ACCEPTED, Held steht daneben). Gestartet wird nur,
// wenn game.progression.openObjectives() ein offenes Ziel { kind: 'escort'|'defend', target,
// start: { kind: 'object'|'npc', id }, zone } liefert und die Karte level.questRoutes[target] hat:
//   Eskorte:     { kind: 'escort', path: [[tx, ty], …], ambush: [{ at: i, type, n = 3 }] }
//   Verteidigen: { kind: 'defend', at: [tx, ty], spawns: [[tx, ty], …], foe, seconds = 90 }
// Meldung an C: bus.emit('quest:objective', { kind: 'escort'|'defend', target }) bei Erfolg,
// { kind: 'escortFailed'|'defendFailed', target } bei Fehlschlag (Begleiter tot, Held tot, Zone verlassen).
//
// Die Begleiter sind Verbündete (team 'hero', companion): Gegner-Trefferzonen treffen sie, Hiebe des
// Helden nicht. Die Gegner des Ablaufs sehen die Welt über eine Sicht, in der world.hero ihr Ziel ist
// (wie src/finder/Party.js): der nächste Begleiter, oder der Held, wenn er sie gerade angreift.
const T = CONFIG.tileSize;
const OBJECTIVE = EV.QUEST_OBJECTIVE ?? 'quest:objective';
export const QUEST_RUN_FEATURES = ['escort', 'defend'];

const WAIT_DIST = 8 * T;       // weiter weg wartet die Eskorte
const FIGHT_DIST = 7 * T;      // kämpfende Gegner so nah an einem Begleiter -> Eskorte hält an
const PROVOKE_TIME = 4;        // so lange bleibt ein Gegner am Helden, nachdem dieser ihn getroffen hat
const MAX_RUN_FOES = 10;
const DODGE_REACT = 0.35, DODGE_MISS = 0.5; // Begleiter weichen Warnflächen aus: Reaktionszeit, Anteil übersehener Warnungen

// Besetzung je Ablauf. hits = Treffer des Referenzgegners, die ein Begleiter aushält.
// look: 'cart' | 'caravan' (Gefährt aus sprites/caravan.js) oder npc: Sprite-Satz eines NPCs.
export const RUN_CAST = {
  escort_vesk_cart: {
    title: 'Tamms Karren', start: 'Eskorte: Bring Tamms Karren sicher zur Passstraße.', speed: 30, foe: 'bandit',
    members: [{ look: 'cart', name: 'Karren', hits: 16 }, { npc: 'quartermaster_dunn', name: 'Tamm', hits: 8, side: 1 }],
  },
  escort_imra_caravan: {
    title: 'Imras Karawane', start: 'Eskorte: Bring Imras Karawane zum Außenposten.', speed: 26, foe: 'gnoll_trapper',
    members: [{ look: 'caravan', name: 'Karawane', hits: 24 }],
  },
  escort_pilgrims: {
    title: 'Die Pilger', start: 'Eskorte: Führe die sechs Pilger zum Kronenschrein.', speed: 24, foe: 'cinder_bombardier',
    members: [0, 1, 2, 3, 4, 5].map((i) => ({ npc: 'pilgrim_aldo', name: i ? 'Pilger' : 'Aldo', hits: 8, hue: [0, 140, 210, 300, 60, 250][i] })),
  },
  defend_rift_ritual: {
    title: 'Ysoldes Ritual', start: 'Verteidige Ysolde, bis das Ritual vollendet ist.', foe: 'cinder_cultist', circle: true,
    members: [{ npc: 'seer_ysolde', name: 'Ysolde', hits: 78 }],
  },
  defend_sigrun_lodge: {
    title: 'Sigruns Jagdhütte', start: 'Halte die Jagdhütte mit Sigrun, bis der Sturm vorüber ist.', foe: 'frost_revenant',
    members: [{ npc: 'hunter_sigrun', name: 'Sigrun', hits: 40 }],
  },
};

// Neue Gegnertypen anderer Bereiche, solange sie fehlen: nächstverwandter vorhandener Typ.
const FOE_FALLBACK = {
  gnoll_trapper: ['steppe_raider', 'dust_hyena'],
  cinder_bombardier: ['ash_wraith', 'ember_cultist_adept'],
  frost_revenant: ['frozen_knight', 'snow_stalker', 'ice_troll'],
  cinder_cultist: ['fire_imp'],
  bandit: ['steppe_raider'],
};

export function installQuestRuns(game) {
  game.addSessionSystem('questRuns', (session) => {
    const sys = new QuestRunSystem(session);
    // Die Welt kann Eskorte und Verteidigen: C schaltet die Quests frei.
    try { game.progression?.setWorldFeatures?.(QUEST_RUN_FEATURES); } catch (err) { console.warn('setWorldFeatures', err); }
    return { sys, update: (dt, s) => sys.update(dt, s), draw: (ctx, s) => sys.draw(ctx, s), dispose: () => sys.dispose() };
  }, 12);
}

// ------------------------------------------------------------------ Sitzungssystem
export class QuestRunSystem {
  constructor(session) {
    this.s = session;
    this.run = null;
    this.idle = [];     // abgeschlossene Abläufe: Begleiter bleiben stehen, bis die Welt wechselt
    this.offs = [];
    const on = (ev, fn) => { const off = session.bus.on(ev, fn); if (typeof off === 'function') this.offs.push(off); };
    on(EV.OBJECT_INTERACT, (e) => this.tryStart('object', e?.objectId));
    on(EV.NPC_INTERACT, (e) => this.tryStart('npc', e?.npcId));
    on(EV.QUEST_ACCEPTED, () => queueMicrotask(() => this.#startNearNpc()));
    on(EV.PLAYER_DIED, () => this.run?.fail('Du bist gefallen'));
    on(EV.ZONE_LEAVE, () => { this.run?.fail('Du hast das Gebiet verlassen'); this.idle = []; });
    on('hit', (e) => this.run?.onHit(e));
  }

  get world() { return this.s.world; }

  get sprites() {
    const a = this.s.assets?.sprites;
    return a?.caravan ?? (QuestRunSystem.ownSprites ??= createCaravanSprites());
  }

  // Offenes Ziel zu diesem Start (C: openObjectives) + Karte des Ablaufs
  findObjective(kind, id) {
    const w = this.world;
    if (!w || !id) return null;
    let list = [];
    try { list = this.s.game?.progression?.openObjectives?.() ?? []; } catch (err) { console.warn('openObjectives', err); }
    const zoneId = w.zone.id;
    const o = list.find((q) => q && !q.done && (q.kind === 'escort' || q.kind === 'defend') && q.start?.kind === kind && q.start?.id === id && (!q.zone || q.zone === zoneId));
    if (!o) return null;
    const route = w.dungeon.level.questRoutes?.[o.target];
    if (!route || (route.kind && route.kind !== o.kind)) { console.warn(`questRoutes.${o.target} fehlt in ${zoneId}`); return null; }
    return { objective: o, route };
  }

  tryStart(kind, id) {
    if (this.run || !this.world || this.world.hero.dead) return false;
    const found = this.findObjective(kind, id);
    if (!found) return false;
    const w = this.world;
    const src = kind === 'npc' ? w.npcs.find((n) => n.npcId === id) : w.interactables.find((o) => o.objectId === id);
    const { objective, route } = found;
    const Run = objective.kind === 'escort' ? EscortRun : DefendRun;
    this.run = new Run(this, w, objective.target, route, src, { kind, id });
    this.run.begin();
    return true;
  }

  // Quest gerade beim Start-NPC angenommen: sofort losgehen, ohne ein zweites Gespräch
  #startNearNpc() {
    const w = this.world;
    if (this.run || !w) return;
    const h = w.hero;
    for (const n of w.npcs) if (Math.hypot(n.x - h.x, n.y - h.y) < 48 && this.tryStart('npc', n.npcId)) return;
  }

  finish(run) {
    if (this.run === run) this.run = null;
    if (run.keep) this.idle.push(run);
  }

  update(dt, session) {
    const run = this.run;
    if (!run) return;
    if (session.world !== run.world) { run.fail('Du hast das Gebiet verlassen'); return; }
    if (session.paused) return;
    run.update(dt);
  }

  draw(ctx, session) {
    const cam = session.camera, font = session.font;
    if (!cam || !font || !session.world) return;
    for (const r of this.idle) if (r.world === session.world) r.drawLabels(ctx, cam.rx, cam.ry, font);
    const run = this.run;
    if (!run || run.world !== session.world) return;
    run.drawLabels(ctx, cam.rx, cam.ry, font);
    run.drawPanel(ctx, font);
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.run?.cleanup(false);
    this.run = null;
    this.idle = [];
  }
}

// ------------------------------------------------------------------ Begleiter
export class QuestAlly extends Actor {
  constructor(x, y, anims, o) {
    super(x, y, anims);
    this.team = 'hero';
    this.companion = true;       // Feedback: kleine Trefferanzeige, kein Hitstop/Bildschirmwackeln
    this.questAlly = true;
    this.name = o.name;
    this.maxHp = this.hp = Math.max(1, Math.round(o.hp));
    this.wagon = !!o.wagon;
    this.radius = o.radius ?? 5;
    this.mass = o.mass ?? 1.6;
    this.hurtRadius = o.hurtRadius ?? 8;
    this.bodyHeight = o.bodyHeight ?? 24;
    this.shadowW = o.shadowW ?? 14;
    this.material = this.wagon ? 'stone' : 'flesh';
    this.speed = o.speed ?? 28;
    this.goal = null;            // { x, y, tol, boost }
    this.moving = false;
    this.stuck = 0;
    this.deadTime = 0;
    this.labelY = o.labelY ?? 34;
  }

  update(dt, world) {
    this.tickTimers(dt);
    if (this.dead) { this.vx = this.vy = 0; this.deadTime += dt; return; }
    let want = 0;
    const g = this.goal;
    if (g) {
      const dx = g.x - this.x, dy = g.y - this.y, d = Math.hypot(dx, dy);
      if (d > (g.tol ?? 3)) {
        want = Math.min(this.speed * (g.boost ?? 1), d / Math.max(dt, 1e-3));
        this.vx = (dx / d) * want; this.vy = (dy / d) * want;
        if (Math.abs(dx) > 1.5) this.facing = Math.sign(dx);
      }
    }
    if (!want) { this.vx *= 0.6; this.vy *= 0.6; }
    const bx = this.x, by = this.y;
    this.integrate(dt, world);
    const moved = Math.hypot(this.x - bx, this.y - by);
    this.moving = moved > 4 * dt;
    this.stuck = want > 1 && moved < want * dt * 0.3 ? this.stuck + dt : 0;
    if (!this.wagon && !this.moving && !g) {
      const h = world.hero;
      if (Math.hypot(h.x - this.x, h.y - this.y) < 60 && Math.abs(h.x - this.x) > 2) this.facing = h.x < this.x ? -1 : 1;
    }
    const walk = this.moving && this.animator.anims.walk;
    this.animator.play(walk ? 'walk' : 'idle');
  }

  die(hit) {
    super.die(hit);
    this.vx = this.vy = 0;
  }

  render(ctx, cx, cy) {
    const sh = getShadow(this.shadowW);
    ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
    // Gehen ohne eigene Laufanimation: leichtes Wippen
    const bob = this.moving && !this.animator.anims.walk && Math.floor(this.stateTime * 8) % 2 ? 1 : 0;
    if (this.dead) ctx.globalAlpha = 0.45;
    this.drawSprite(ctx, cx, cy + bob);
    ctx.globalAlpha = 1;
  }

  renderEmissive(ctx, cx, cy) {
    super.renderEmissive(ctx, cx, cy);
    if (this.dead) return;
    const f = this.currentFrame();
    if (f.glow) f.glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 });
    else if (f.glowCanvas) {
      const flip = this.facing < 0;
      const x = Math.round(this.x - cx - (flip ? f.canvas.width - f.ax : f.ax)), y = Math.round(this.y - cy - f.ay);
      if (flip) { ctx.save(); ctx.translate(x + f.canvas.width, y); ctx.scale(-1, 1); ctx.drawImage(f.glowCanvas, 0, 0); ctx.restore(); }
      else ctx.drawImage(f.glowCanvas, x, y);
    }
  }
}

// Ritualkreis unter Ysolde (wenn das Start-Objekt nicht selbst dort liegt)
class GroundCircle {
  constructor(x, y, look) { this.x = x; this.y = y; this.look = look; this.t = 0; this.removed = false; }
  get sortY() { return this.y - 40; }
  update(dt) { this.t += dt; }
  render(ctx, cx, cy) { this.look.sprite.draw(ctx, this.x - cx, this.y - cy); }
  renderEmissive(ctx, cx, cy) {
    const s = this.look.sprite, g = this.look.glow;
    if (!g) return;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.t * 3);
    ctx.drawImage(g, Math.round(this.x - cx - s.ax), Math.round(this.y - cy - s.ay));
    ctx.globalAlpha = 1;
  }
}

// Sicht auf die Welt mit eigenem world.hero; Methoden laufen am Original (private Felder bleiben gültig).
function viewOf(target, getHero) {
  const bound = new Map();
  return new Proxy(target, {
    get(t, k) {
      if (k === 'hero') return getHero();
      const v = t[k];
      if (typeof v !== 'function' || k === 'constructor') return v;
      let b = bound.get(k);
      if (!b || b.src !== v) { b = v.bind(t); b.src = v; bound.set(k, b); }
      return b;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// NPC-Sprite mit Farbton-Verschiebung (Pilger sehen nicht alle gleich aus)
function tintAnims(anims, hue) {
  if (!hue) return anims;
  const tintFrame = (f) => {
    const c = makeCanvas(f.canvas.width, f.canvas.height), x = c.getContext('2d');
    try { x.filter = `hue-rotate(${hue}deg) saturate(0.85)`; } catch { /* ohne Filter: Originalfarben */ }
    x.drawImage(f.canvas, 0, 0);
    const nf = new SpriteFrame(c, f.ax, f.ay, f.res);
    if (f.glow) nf.glow = f.glow;
    return nf;
  };
  const out = {};
  for (const [k, a] of Object.entries(anims)) out[k] = new Animation(a.frames.map(tintFrame), a.fps, a.loop);
  return out;
}

// ------------------------------------------------------------------ Gemeinsamer Ablauf
class QuestRun {
  constructor(sys, world, target, route, src, start) {
    this.sys = sys; this.world = world; this.target = target; this.route = route;
    this.src = src; this.startRef = start;
    this.cast = RUN_CAST[target] ?? this.defaultCast(start);
    this.members = [];
    this.foes = new Set();
    this.over = false;
    this.keep = false;
    this.time = 0;
    this.hurtWarn = 0;
  }

  get bus() { return this.world.bus; }
  get hero() { return this.world.hero; }
  get alive() { return this.members.filter((m) => !m.dead); }

  defaultCast(start) {
    const npc = start.kind === 'npc' ? start.id : 'seer_ysolde';
    return { title: this.route.title ?? 'Auftrag', start: null, speed: 28, members: [this.route.kind === 'escort' && start.kind === 'object' ? { look: 'cart', name: 'Karren', hits: 16 } : { npc, name: this.world.session.content.find('npc', npc)?.name ?? 'Begleiter', hits: 20 }] };
  }

  // Gegnertyp der Karte, sonst Ersatz, sonst häufigster Gegner der Zone
  foeType(type) {
    if (type && ENEMY_TYPES[type]) return type;
    for (const t of FOE_FALLBACK[type] ?? []) if (ENEMY_TYPES[t]) return t;
    const count = new Map();
    for (const m of this.world.dungeon.enemyMarks ?? []) if (!m.boss && ENEMY_TYPES[m.type] && !ENEMY_TYPES[m.type].boss) count.set(m.type, (count.get(m.type) ?? 0) + 1);
    let best = null, n = 0;
    for (const [t, c] of count) if (c > n) { best = t; n = c; }
    return best ?? 'bandit';
  }

  refDamage() {
    const def = ENEMY_TYPES[this.foeType(this.route.foe ?? this.route.ambush?.[0]?.type ?? this.cast.foe)];
    return def?.attack?.damage ?? 14;
  }

  makeMember(spec, x, y) {
    const w = this.world, A = w.assets.sprites, car = this.sys.sprites;
    const dmg = this.refDamage();
    const o = { name: spec.name, hp: dmg * (spec.hits ?? 10), speed: this.cast.speed ?? 28 };
    let anims;
    if (spec.look === 'cart' || spec.look === 'caravan') {
      anims = spec.look === 'cart' ? car.cartAnims : car.caravanAnims;
      Object.assign(o, spec.look === 'cart'
        ? { wagon: true, radius: 8, mass: 6, hurtRadius: 12, bodyHeight: 22, shadowW: 40, labelY: 34 }
        : { wagon: true, radius: 10, mass: 8, hurtRadius: 15, bodyHeight: 30, shadowW: 56, labelY: 46 });
    } else {
      const base = A.npcs?.[spec.npc] ?? A.npcs2?.[spec.npc] ?? A.npcs3?.[spec.npc] ?? A.npcs2?.trader_vesk;
      anims = tintAnims(base, spec.hue ?? 0);
    }
    const p = w.dungeon.nearestFree(x, y, o.radius ?? 5);
    const m = new QuestAlly(p.x, p.y, anims, o);
    m.npcId = spec.npc ?? null;
    w.actors.push(m);
    this.members.push(m);
    w.particles.magic?.(p.x, p.y - 8, 6, 6);
    return m;
  }

  // Start (Objekt/NPC) für die Dauer des Ablaufs ausblenden
  hideStart(on) {
    const s = this.src;
    if (!s) return;
    if (s.objectId) {
      if (this.route.kind === 'escort') {
        // Das Gefährt fährt los: Bild und Kollisionskasten des stehenden Objekts weg
        s.hidden = on;
        if (on) this.startBoxes = this.world.dungeon.boxes.filter((b) => !b.off && s.x >= b.x0 - 1 && s.x <= b.x1 + 1 && s.y - 1 >= b.y0 - 1 && s.y - 1 <= b.y1 + 1);
        for (const b of this.startBoxes ?? []) b.off = on;
      }
      if (!on) s.used = false; // erneut startbar
      return;
    }
    if (on) {
      if (s.questHidden) return;
      s.questHidden = { render: s.render, renderEmissive: s.renderEmissive, canInteract: s.canInteract };
      s.render = () => {}; s.renderEmissive = () => {}; s.canInteract = () => false;
      if (s.box) s.box.off = true;
      if (s.light) s.light.intensity = 0;
    } else if (s.questHidden) {
      Object.assign(s, s.questHidden);
      delete s.render; delete s.renderEmissive; delete s.canInteract; // Methoden der Klasse wieder sichtbar
      s.questHidden = null;
      if (s.box) s.box.off = false;
      if (s.light) s.light.intensity = 0.85;
    }
  }

  tilePx([tx, ty]) { return { x: tx * T + T / 2, y: ty * T + T / 2 + 4 }; }

  // Ziel eines Ablauf-Gegners: Held, wenn er ihn gerade bedrängt, sonst der nächste Begleiter
  targetFor(e) {
    const h = this.hero;
    if (!this.over) {
      if (e.provokedAt != null && this.world.time - e.provokedAt < PROVOKE_TIME && !h.dead && Math.hypot(h.x - e.x, h.y - e.y) < 150) { e.questTarget = h; return h; }
      let best = null, bd = Infinity;
      for (const m of this.members) {
        if (m.dead || !m.hurtable) continue;
        const d = Math.hypot(m.x - e.x, m.y - e.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) { e.questTarget = best; return best; }
    }
    e.questTarget = h;
    return h;
  }

  spawnFoe(type, x, y) {
    const w = this.world;
    const p = w.dungeon.nearestFree(x, y, 7);
    const e = w.spawnEnemy(this.foeType(type), p.x, p.y, { home: { x: p.x, y: p.y }, respawned: true });
    e.aggroed = true;          // nach dem Erscheinen direkt zur Jagd
    e.leashFree = true;        // keine Leine: sie verfolgen die Begleiter über die ganze Strecke
    e.questRun = this;
    const run = this, view = viewOf(w, () => run.targetFor(e));
    const own = Object.prototype.hasOwnProperty.call(e, 'update') ? e.update : null;
    const orig = own ?? Object.getPrototypeOf(e).update;
    e.update = function (dt, world) { return orig.call(this, dt, world === w ? view : world); };
    e.questRestore = () => { if (own) e.update = own; else delete e.update; e.home = { x: e.x, y: e.y }; };
    this.foes.add(e);
    return e;
  }

  // Geschosse der Ablauf-Gegner treffen das Ziel ihres Schützen (sonst prüfen sie nur den Helden)
  wrapProjectiles() {
    const w = this.world;
    for (const p of w.projectiles) {
      if (p.questWrapped || p.team !== 'enemy' || !this.foes.has(p.owner)) continue;
      p.questWrapped = true;
      const owner = p.owner, view = viewOf(w, () => { const t = owner.questTarget; return t && !t.dead && !this.over ? t : w.hero; });
      const orig = p.update;
      p.update = function (dt, world) { return orig.call(this, dt, world === w ? view : world); };
    }
  }

  onHit(e) {
    const h = this.hero;
    if (!e?.target) return;
    if (this.foes.has(e.target) && (e.attacker === h || e.attacker?.hero === h)) e.target.provokedAt = this.world.time;
    if (e.target.questAlly && this.members.includes(e.target)) this.allyHitAt = this.time;
    if (e.target.questAlly && this.members.includes(e.target) && this.time - this.hurtWarn > 12 && !this.over) {
      this.hurtWarn = this.time;
      this.bus.emit(EV.UI_TOAST, { text: `${this.cast.title}: Angriff!`, kind: 'warn' });
    }
  }

  begin() {
    this.hideStart(true);
    this.setup();
    if (this.cast.start) this.bus.emit(EV.UI_TOAST, { text: this.cast.start, kind: 'quest' });
  }

  tick(dt) {
    this.time += dt;
    for (const e of this.foes) if (e.removed) this.foes.delete(e);
    this.wrapProjectiles();
  }

  succeed(sub) {
    if (this.over) return;
    this.over = true;
    this.arrived = this.alive.length;  // Begleiter, die das Ziel erreicht bzw. überlebt haben
    const kind = this.route.kind;
    this.bus.emit(OBJECTIVE, { kind, target: this.target });
    this.bus.emit(EV.UI_BANNER, { title: kind === 'escort' ? 'Eskorte geschafft' : 'Verteidigung gehalten', sub: sub ?? this.cast.title, color: '#ffd66a' });
    this.cleanup(true);
  }

  fail(reason) {
    if (this.over) return;
    this.over = true;
    const kind = this.route.kind;
    this.bus.emit(OBJECTIVE, { kind: kind === 'escort' ? 'escortFailed' : 'defendFailed', target: this.target });
    this.bus.emit(EV.UI_BANNER, { title: kind === 'escort' ? 'Eskorte gescheitert' : 'Verteidigung gescheitert', sub: reason, color: '#ff6a5a' });
    this.cleanup(false);
  }

  // success: Begleiter bleiben am Ziel stehen (bis die Welt wechselt), sonst verschwinden sie und der Start wird wieder frei.
  cleanup(success) {
    this.over = true;
    for (const e of this.foes) e.questRestore?.();
    this.foes.clear();
    this.circle && (this.circle.removed = true);
    if (this.light) this.light.dead = true;
    if (success) {
      // Wer eine Quest abgibt, muss wieder an seinem Platz stehen (Aldo, Sigrun): dessen Doppel am Ziel verschwindet.
      // Verteidigte (Ysolde, Sigrun) gehen nach dem Sieg zurück; Gefährt und übrige Pilger bleiben am Ziel stehen.
      const startNpc = this.startRef.kind === 'npc' ? this.startRef.id : null;
      const double = startNpc ? this.members.find((m) => m.npcId === startNpc) : null;
      for (const m of this.members) {
        m.goal = null; m.hurtable = false;
        if (this.route.kind === 'defend' || m === double) {
          m.removed = true;
          this.world.particles.magic?.(m.x, m.y - 10, 10, 8);
        }
      }
      this.members = this.members.filter((m) => !m.removed);
      if (startNpc) this.hideStart(false);
      this.keep = this.members.length > 0;
    } else {
      for (const m of this.members) m.removed = true;
      this.hideStart(false);
    }
    this.sys.finish(this);
  }

  // Name und Lebensleiste über jedem Begleiter
  drawLabels(ctx, cx, cy, font) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    for (const m of this.members) {
      if (m.removed) continue;
      const x = Math.round(m.x - cx), y = Math.round(m.y - cy - m.labelY);
      if (x < -40 || x > W + 40 || y < -10 || y > H + 40) continue;
      ctx.globalAlpha = m.dead ? 0.45 : 0.95;
      // Bei großen Gruppen (Pilger) trägt nur der Führende einen Namen
      if (this.members.length <= 2 || m === this.leader) font.draw(ctx, m.name.toUpperCase(), x, y - 7, { color: m.dead ? '#a8a0a0' : '#8fe08a', align: 'center', outline: true });
      if (!m.dead && !this.over) {
        const w = 20, f = Math.max(0, m.hp / m.maxHp);
        ctx.fillStyle = '#0b0710'; ctx.fillRect(x - w / 2 - 1, y, w + 2, 3);
        ctx.fillStyle = f > 0.35 ? '#5ad07a' : '#e05a4a'; ctx.fillRect(x - w / 2, y + 1, Math.round(w * f), 1);
      }
      ctx.globalAlpha = 1;
    }
    const lead = this.leader;
    if (this.waiting && lead && !lead.dead && !this.over) {
      const x = Math.round(lead.x - cx), y = Math.round(lead.y - cy - lead.labelY - 14);
      font.draw(ctx, this.waiting, x, y, { color: '#e8c25a', align: 'center', outline: true });
    }
  }

  // Kleine Leiste oben in der Mitte: Titel, Zustand, Fortschritt, Lebenskraft der Begleiter
  drawPanel(ctx, font) {
    const W = CONFIG.viewWidth, bw = 120, x0 = Math.round(W / 2 - bw / 2), y0 = 6;
    const { status, progress } = this.panelInfo();
    ctx.fillStyle = 'rgba(11,7,16,0.72)';
    ctx.fillRect(x0 - 4, y0 - 2, bw + 8, 19);
    font.draw(ctx, this.cast.title.toUpperCase(), x0, y0, { color: '#e8c25a', shadow: true });
    if (status) font.draw(ctx, status, x0 + bw, y0, { color: '#c8c2d0', align: 'right', shadow: true });
    const by = y0 + 8;
    ctx.fillStyle = '#2a2018'; ctx.fillRect(x0, by, bw, 3);
    ctx.fillStyle = '#e8c25a'; ctx.fillRect(x0, by, Math.round(bw * Math.max(0, Math.min(1, progress))), 3);
    ctx.fillStyle = '#fff0a8'; ctx.fillRect(x0, by, Math.round(bw * Math.max(0, Math.min(1, progress))), 1);
    let hp = 0, max = 0;
    for (const m of this.members) { hp += Math.max(0, m.hp); max += m.maxHp; }
    const f = max ? hp / max : 0;
    ctx.fillStyle = '#1a1014'; ctx.fillRect(x0, by + 5, bw, 2);
    ctx.fillStyle = f > 0.35 ? '#5ad07a' : '#e05a4a'; ctx.fillRect(x0, by + 5, Math.round(bw * f), 2);
  }
}

// ------------------------------------------------------------------ Eskorte
class EscortRun extends QuestRun {
  setup() {
    const w = this.world;
    this.path = (this.route.path ?? []).map((p) => this.tilePx(p));
    if (!this.path.length) this.path = [{ x: w.hero.x, y: w.hero.y }];
    this.ambush = (this.route.ambush ?? []).map((a) => ({ ...a, done: false })).sort((a, b) => a.at - b.at);
    const s = this.src ?? w.hero;
    const sx = this.src?.objectId ? s.x : this.path[0].x, sy = this.src?.objectId ? s.y : this.path[0].y;
    this.idx = 0;
    this.trail = [];
    this.cast.members.forEach((spec, i) => {
      const m = this.makeMember(spec, sx - i * 12 * (spec.side ? 0 : 1), sy + (spec.side ? 14 : i * 4));
      if (i === 0) this.leader = m;
    });
    // Strecke für die Fortschrittsanzeige
    this.total = 0;
    let prev = { x: this.leader.x, y: this.leader.y };
    for (const p of this.path) { this.total += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
  }

  // Der Zug folgt dem ersten lebenden Begleiter (Karren, Karawane, Aldo)
  #leaderAlive() {
    if (this.leader && !this.leader.dead) return this.leader;
    const next = this.alive[0];
    if (next && next !== this.leader) {
      this.leader = next; next.labelY = Math.max(next.labelY, 34);
      next.speed = this.cast.speed ?? 28;
    }
    return next ?? null;
  }

  // Kampf am Zug: 2 = Überfall-Gegner in der Nähe, 1 = nur Gegner der Zone, 0 = ruhig
  #fightNear() {
    const w = this.world, al = this.alive;
    let level = 0;
    for (const e of w.enemies) {
      if (e.dead || e.isHidden || !e.aggroed || e.state === 'return' || e.state === 'idle') continue;
      for (const m of al) if (Math.hypot(e.x - m.x, e.y - m.y) < FIGHT_DIST) { if (e.questRun === this) return 2; level = 1; break; }
    }
    return level;
  }

  #spawnAmbush(a) {
    a.done = true;
    const lead = this.leader;
    // Ein Stück voraus, seitlich versetzt
    let ahead = this.path[Math.min(this.path.length - 1, a.at + 1)] ?? lead;
    if (Math.hypot(ahead.x - lead.x, ahead.y - lead.y) < 4 * T) {
      const dir = this.path[Math.min(this.path.length - 1, a.at + 1)] ?? lead;
      const dx = dir.x - lead.x, dy = dir.y - lead.y, d = Math.hypot(dx, dy) || 1;
      ahead = { x: lead.x + (dx / d) * 7 * T, y: lead.y + (dy / d) * 7 * T };
    }
    const dx = ahead.x - lead.x, dy = ahead.y - lead.y, d = Math.hypot(dx, dy) || 1;
    const px = -dy / d, py = dx / d;
    const n = Math.max(1, a.n ?? 3);
    for (let i = 0; i < n; i++) {
      const side = (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2)) * 1.5 * T;
      this.spawnFoe(a.type ?? this.cast.foe, ahead.x + px * side, ahead.y + py * side);
    }
    this.bus.emit(EV.UI_TOAST, { text: 'Überfall!', kind: 'warn' });
    this.hurtWarn = this.time;
  }

  update(dt) {
    this.tick(dt);
    const w = this.world, h = this.hero;
    if (h.dead) { this.fail('Du bist gefallen'); return; }
    const lead = this.#leaderAlive();
    if (!lead) { this.fail(this.members.length > 1 ? 'Alle Begleiter sind gefallen' : `${this.members[0]?.name ?? 'Der Begleiter'} wurde zerstört`); return; }
    // Gruppen (Pilger): mindestens die Hälfte muss ankommen
    if (this.members.length > 2 && this.alive.length < Math.ceil(this.members.length / 2)) { this.fail('Zu viele Pilger sind gefallen'); return; }

    // Überfälle an den Wegpunkten
    for (const a of this.ambush) if (!a.done && this.idx > a.at) this.#spawnAmbush(a);

    const far = Math.hypot(h.x - lead.x, h.y - lead.y) > WAIT_DIST;
    // Bei Gegnern der Zone hält der Zug nur kurz (6 s), solange niemand die Begleiter trifft: ein Schütze
    // hinter einer Mauer, an den der Held nicht herankommt, soll die Eskorte nicht endlos festhalten.
    const lvl = this.#fightNear();
    this.fightT = lvl ? (this.fightT ?? 0) + dt : 0;
    const fight = lvl === 2 || (lvl === 1 && (this.fightT < 6 || this.time - (this.allyHitAt ?? -99) < 3));
    this.waiting = far ? 'WARTET' : fight ? 'KAMPF' : null;

    // Führung: Wegpunkt für Wegpunkt
    const goal = this.path[this.idx];
    if (!goal) { this.succeed(); return; }
    if (this.waiting) lead.goal = null;
    else {
      lead.goal = { x: goal.x, y: goal.y, tol: 2 };
      const dist = Math.hypot(goal.x - lead.x, goal.y - lead.y);
      if (dist < 7) {
        this.idx++;
        this.prog = null;
        if (this.idx >= this.path.length) { this.succeed(); return; }
      } else {
        // Festgefahren (Deko, Engstelle, Gedränge): kommt der Zug dem Wegpunkt 3 s nicht näher, ein Stück
        // vorwärts freischieben; beim zweiten Mal direkt an den Wegpunkt setzen.
        if (!this.prog || dist < this.prog.best - 4) this.prog = { best: dist, t: 0, tries: this.prog?.tries ?? 0 };
        else this.prog.t += dt;
        if (this.prog.t > 3) {
          const jump = this.prog.tries >= 1;
          const p = jump ? w.dungeon.nearestFree(goal.x, goal.y, lead.radius) : w.dungeon.nearestFree(lead.x + ((goal.x - lead.x) / dist) * 14, lead.y + ((goal.y - lead.y) / dist) * 14, lead.radius);
          lead.x = p.x; lead.y = p.y;
          this.nudges = (this.nudges ?? 0) + 1;
          this.prog = { best: Math.hypot(goal.x - p.x, goal.y - p.y), t: 0, tries: jump ? 0 : 1 };
        }
      }
    }
    // Spur des Führenden für die Folgenden
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - lead.x, last.y - lead.y) >= 4) { this.trail.push({ x: lead.x, y: lead.y }); if (this.trail.length > 200) this.trail.shift(); }
    let k = 0;
    for (const m of this.members) {
      if (m === lead || m.dead) continue;
      k++;
      const back = Math.round((k * (lead.wagon ? 18 : 24) + (lead.wagon ? 14 : 0)) / 4);
      const p = this.trail[Math.max(0, this.trail.length - 1 - back)] ?? lead;
      m.speed = (this.cast.speed ?? 28) * 1.25;
      if (this.waiting === 'KAMPF') m.goal = null;
      else m.goal = { x: p.x, y: p.y, tol: 4 };
      if (m.stuck > 2) { const q = w.dungeon.nearestFree(p.x, p.y, m.radius); m.x = q.x; m.y = q.y; m.stuck = 0; }
    }
    this.dodge();
  }

  // Wer laufen kann, tritt aus Warnflächen und Geschossbahnen (Gefährte nicht); danach geht es weiter wie zuvor.
  // Begleiter sind keine Kämpfer: sie reagieren spät (0,35 s) und übersehen etwa jede zweite Warnung.
  dodge() {
    const now = this.time;
    for (const m of this.members) {
      if (m.dead || m.wagon) continue;
      const d = dangerAt(this.world, m);
      if (!d || d.timeLeft > 1.2) continue;
      m.seen ??= new Map();
      if (!m.seen.has(d.key)) {
        m.seen.set(d.key, Math.random() < DODGE_MISS ? Infinity : now);
        if (m.seen.size > 40) m.seen.delete(m.seen.keys().next().value);
      }
      if (now - m.seen.get(d.key) < DODGE_REACT) continue;
      m.goal = { x: m.x + d.dir.x * 28, y: m.y + d.dir.y * 28, tol: 2, boost: 2 };
    }
  }

  panelInfo() {
    const lead = this.leader;
    let left = 0, prev = lead ?? this.path[0];
    for (let i = this.idx; i < this.path.length; i++) { left += Math.hypot(this.path[i].x - prev.x, this.path[i].y - prev.y); prev = this.path[i]; }
    const progress = this.total > 0 ? 1 - left / this.total : 0;
    const n = this.members.length;
    const status = n > 1 ? `${this.alive.length}/${n}` : this.waiting === 'WARTET' ? 'WARTET' : '';
    return { status, progress };
  }
}

// ------------------------------------------------------------------ Verteidigen
class DefendRun extends QuestRun {
  setup() {
    const w = this.world, r = this.route;
    const at = r.at ? this.tilePx(r.at) : { x: this.src?.x ?? w.hero.x, y: this.src?.y ?? w.hero.y };
    this.at = at;
    this.seconds = Math.max(10, r.seconds ?? 90);
    this.spawns = (r.spawns?.length ? r.spawns : [[Math.floor(at.x / T) + 10, Math.floor(at.y / T)]]).map((p) => this.tilePx(p));
    this.foe = r.foe ?? this.cast.foe;
    // Wellen: etwa alle 15 s, die letzte rund 12 s vor Schluss; Größe steigt
    const n = Math.max(3, Math.round(this.seconds / 15));
    const last = Math.max(4, this.seconds - 12);
    this.waves = Array.from({ length: n }, (_, k) => ({ t: 3 + (k * (last - 3)) / (n - 1), size: (r.n ?? 2) + Math.floor(k * 0.75), done: false }));
    this.wave = 0;
    // Der Platz wird frei: Gegner der Zone rings um den Punkt ziehen sich zurück (sonst fällt der NPC schon,
    // bevor die erste Welle steht). Sie kommen mit dem nächsten Zonenaufbau wieder.
    const clear = (r.clearRadius ?? 14) * T;
    for (const e of w.enemies) {
      if (e.dead || e.def?.boss || e.questRun || Math.hypot(e.x - at.x, e.y - at.y) > clear) continue;
      e.removed = true;
      w.particles.dust?.(e.x, e.y, 6);
    }
    const spec = this.cast.members[0];
    this.leader = this.makeMember(spec, at.x, at.y);
    this.leader.speed = 0;
    if (this.cast.circle) {
      const near = this.src?.objectId && Math.hypot(this.src.x - at.x, this.src.y - at.y) < 24;
      if (!near) this.circle = w.spawn(new GroundCircle(at.x, at.y + 3, this.sys.sprites.riftCircle));
      this.light = w.addLight(new Light({ x: at.x, y: at.y - 10, radius: 80, color: [170, 100, 255], intensity: 0.8, flicker: 0.2, bloom: 0.3 }));
    }
  }

  update(dt) {
    this.tick(dt);
    const w = this.world, h = this.hero;
    if (h.dead) { this.fail('Du bist gefallen'); return; }
    const m = this.leader;
    if (m.dead) { this.fail(`${m.name} ist gefallen`); return; }
    // Gesicht zum nächsten Angreifer
    let near = null, nd = Infinity;
    for (const e of this.foes) { if (e.dead) continue; const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < nd) { nd = d; near = e; } }
    if (near && Math.abs(near.x - m.x) > 2) m.facing = near.x < m.x ? -1 : 1;
    if (this.cast.circle && Math.random() < dt * 6) w.particles.magic?.(m.x + (Math.random() - 0.5) * 30, m.y - Math.random() * 6, 1, 4);

    for (const wv of this.waves) {
      if (wv.done || this.time < wv.t) continue;
      wv.done = true;
      this.wave++;
      const alive = [...this.foes].filter((e) => !e.dead).length;
      const size = Math.min(wv.size, MAX_RUN_FOES - alive);
      const k = this.wave - 1;
      for (let i = 0; i < size; i++) {
        const sp = this.spawns[(k + (i >= Math.ceil(size / 2) ? 1 : 0)) % this.spawns.length];
        this.spawnFoe(this.foe, sp.x + ((i % 3) - 1) * 14, sp.y + (Math.floor(i / 3) - 0.5) * 12);
      }
    }
    if (this.time >= this.seconds) this.succeed();
  }

  panelInfo() {
    const left = Math.max(0, this.seconds - this.time);
    const status = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    return { status, progress: this.time / this.seconds };
  }
}
