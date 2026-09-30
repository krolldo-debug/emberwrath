import { Actor } from './Actor.js';
import { Entity } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { DEFS } from './defs_frost_wyrm.js';
import { Telegraph, DamageWave } from './Telegraph.js';
import { Shockwave } from './Effects.js';
import { Light } from '../gfx/Lighting.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { EV } from '../core/events.js';
import { rand, pick, angleDiff } from '../core/math.js';
import { moveAndCollide } from '../systems/Physics.js';

// Skalvyr, der Frostwurm – Boss der Reifhöhlen (Stufe 37, 3 Phasen: 66 % / 33 %).
// Angriffe (jeder mit Bodenwarnung):
//   Biss            schneller Bogen vor ihm (Grundangriff)
//   Schwanzfeger    weiter Bogen HINTER ihm – wer am Schwanz steht, fliegt
//   Frostatem       Kegel vor ihm, schwenkt langsam nach; Eissäulen blocken den Atem
//   Eissplitter     brüllt zur Decke, 5–9 Eiszapfen stürzen in markierte Kreise
//   Eingraben       taucht ins Eis, ein Kreis folgt dem Helden kurz, dann bricht er dort hervor
//   Eiswände        ab Phase 2: Säulenreihen teilen die Arena (blockieren Weg und Atem)
//   Frostnova       ab Phase 3: innerer Kreis + Druckring, hinterlässt Frostfelder
// Phase 3 = Raserei: schnellere Muster, Doppelbiss, glühende Adern (frame.glowEnraged).
// Frost-Treffer verlangsamen kurz (Buff 'frost_chill' mit moveSpeed 0,7).
// Öffentliche Felder wie die anderen Bosse: type, def, bossId, level, hp/maxHp, phase,
// engaged, hurtable, adds, home, enraged; engage(world), update, die, render*.

const ICE = ['#ffffff', '#dcf8ff', '#9ae4f8', '#4aa6d8', '#25649c'];
const SNOW = ['#ffffff', '#e4f4fa', '#b8d8e6'];
const FROST_RGB = [120, 200, 255], FURY_RGB = [170, 215, 255];
const WARN = [255, 80, 60], WARN_ICE = [90, 170, 255], WARN_TAIL = [255, 120, 70];
const OUT = '#0a1220';

// Schaden (Magier-HP Stufe 37 ≈ 673): normal 8–12 %, groß 20–30 %
const DMG = { bite: 72, tail: 84, breath: 24, shard: 78, erupt: 165, wall: 68, nova: 175, novaRing: 66, roar: 40, field: 16 };

let shadowCanvas = null;
function wyrmShadow() {
  if (shadowCanvas) return shadowCanvas;
  const w = 112, h = 14, p = new PixelCanvas(w, h);
  p.ellipse((w - 1) / 2, (h - 1) / 2, w / 2, h / 2, 'rgba(4,2,8,0.45)');
  p.ellipse((w - 1) / 2 + 8, (h - 1) / 2, w / 2 - 14, h / 2 - 2, 'rgba(4,2,8,0.3)');
  return (shadowCanvas = p.canvas);
}

function hurtHero(world, owner, damage, dirX, dirY, knockback, heavy = false) {
  const h = world.hero;
  if (h.dead) return false;
  const hit = { damage: Math.round(damage * rand(0.9, 1.1)), dirX, dirY, knockback, source: owner };
  if (!h.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: owner, target: h, damage: hit.damage, crit: false, heavy, dirX, dirY, x: h.x, y: h.centerY, killed: h.dead });
  return true;
}

// Frost-Splitter: fliegen hoch, fallen zurück, bleiben kurz als Reif liegen
function shards(world, x, y, count, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), s = rand(15, 70) * power;
    world.particles.spawn({
      x: x + rand(-3, 3), y: y + rand(-2, 2), z: rand(0, 5), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
      vz: rand(50, 160) * power, gravity: 400, drag: 1, bounce: 0.3, life: rand(0.5, 1.1), colors: [pick(ICE)],
      size: Math.random() < 0.3 ? 2 : 1, emissive: true, decal: Math.random() < 0.25 ? pick(SNOW) : null,
    });
  }
}
function mist(world, x, y, count, spread = 10) {
  for (let i = 0; i < count; i++) {
    world.particles.spawn({ x: x + rand(-spread, spread), y: y + rand(-3, 3), vx: rand(-12, 12), vy: rand(-4, 4), rise: rand(4, 14), wobble: 8, drag: 2, life: rand(0.6, 1.3), colors: ['#e4f4fa', '#b8d8e6', '#7aa8c0'], alpha: 0.55, size: 2, shrink: true });
  }
}

// ------------------------------------------------------------------ Gefahren

// Eissäule: wächst aus dem Boden, ist fest (schiebt Held und Wurm weg), blockt den Frostatem.
export class IcePillar extends Entity {
  constructor(x, y, owner, { delay = 0, life = 11, damage = DMG.wall } = {}) {
    super(x, y);
    Object.assign(this, { owner, delay, life, damage });
    this.t = 0; this.r = 7; this.up = false; this.broken = false; this.breakT = 0;
    this.fx = owner.fxSprites;
  }
  get solidNow() { return this.up && !this.broken && this.t - this.delay > 0.12; }
  update(dt, world) {
    this.t += dt;
    if (this.t < this.delay) return;
    if (!this.up) {
      this.up = true;
      shards(world, this.x, this.y, 10, 0.9);
      mist(world, this.x, this.y, 3, 6);
      const h = world.hero, dx = h.x - this.x, dy = (h.y - this.y) / 0.6;
      if (Math.hypot(dx, dy) < 14 && !this.owner.dead) {
        const l = Math.hypot(dx, dy) || 1;
        if (hurtHero(world, this.owner, this.damage, dx / l, dy / l, 240, true)) this.owner.chill(world, 1.5);
      }
    }
    if (this.owner.dead && !this.broken) this.shatter(world);
    if (!this.broken && this.t - this.delay > this.life) this.shatter(world);
    if (this.broken) { this.breakT += dt; if (this.breakT > 0.4) this.removed = true; return; }
    if (this.solidNow) {
      for (const a of [world.hero, this.owner]) {
        if (a.dead || a.hidden) continue;
        const dx = a.x - this.x, dy = (a.y - this.y) * 1.4;
        const min = this.r + (a === this.owner ? 6 : a.radius ?? 5);
        const d = Math.hypot(dx, dy);
        if (d >= min || d === 0) continue;
        const push = min - d;
        moveAndCollide(a, (dx / d) * push, (dy / d) * push / 1.4, world.dungeon);
      }
    }
  }
  shatter(world) {
    if (this.broken) return;
    this.broken = true; this.breakT = 0;
    shards(world, this.x, this.y - 12, 16, 1.1);
    world.bus.emit('spellImpact', { x: this.x, y: this.y - 8, element: 'frost', radius: 8 });
  }
  // Blockt eine Strecke (Frostatem)?
  blocks(ax, ay, bx, by) {
    if (!this.solidNow) return false;
    const dx = bx - ax, dy = (by - ay) / 0.6, px = this.x - ax, py = (this.y - ay) / 0.6;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
    return Math.hypot(px - dx * t, py - dy * t) < this.r + 2 && t > 0.05 && t < 0.98;
  }
  #frame() {
    const f = this.fx;
    if (this.broken) return f.pillarBreak[Math.min(f.pillarBreak.length - 1, Math.floor(this.breakT / 0.1))];
    const k = (this.t - this.delay) / 0.2;
    return f.pillar[Math.max(0, Math.min(f.pillar.length - 1, Math.floor(k * f.pillar.length)))];
  }
  render(ctx, cx, cy) {
    if (this.t < this.delay) return;
    ctx.fillStyle = 'rgba(4,2,8,0.35)';
    ctx.fillRect(Math.round(this.x - cx - 8), Math.round(this.y - cy), 17, 2);
    this.#frame().draw(ctx, this.x - cx, this.y - cy);
  }
  renderEmissive(ctx, cx, cy) {
    if (this.t < this.delay) return;
    const f = this.#frame();
    const k = this.broken ? 1 - this.breakT / 0.4 : 0.75 + 0.25 * Math.sin(this.t * 4 + this.x);
    f.glow?.draw(ctx, this.x - cx, this.y - cy, { alpha: Math.max(0, k) });
  }
}

// Eiszapfen fällt von der Höhlendecke in einen markierten Kreis.
export class FallingIcicle extends Entity {
  constructor(x, y, owner, { delay = 1.1, r = 18, damage = DMG.shard } = {}) {
    super(x, y);
    Object.assign(this, { owner, delay, r, damage });
    this.t = 0; this.done = false; this.sortOffset = 1;
    this.fx = owner.fxSprites;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead && !this.done) { this.removed = true; return; }
    if (!this.done && this.t >= this.delay) {
      this.done = true;
      const h = world.hero, dx = h.x - this.x, dy = (h.y - this.y) / 0.6;
      if (Math.hypot(dx, dy) < this.r + 3) {
        const l = Math.hypot(dx, dy) || 1;
        if (hurtHero(world, this.owner, this.damage, dx / l, dy / l, 150)) this.owner.chill(world, 1.6);
      }
      shards(world, this.x, this.y, 22, 1.2);
      mist(world, this.x, this.y, 4, 8);
      world.decals.stamp(this.fx.crackSmall, this.x, this.y, 0.7);
      world.addEffect(new Shockwave(this.x, this.y, { radius: this.r + 6, color: '#dcf8ff', life: 0.35 }));
      world.addLight(new Light({ x: this.x, y: this.y - 6, radius: 50, color: FROST_RGB, intensity: 0.8, ttl: 0.25, bloom: 0.5 }));
      world.session.camera?.shake(2);
      world.bus.emit('spellImpact', { x: this.x, y: this.y, element: 'frost', radius: this.r });
    }
    if (this.t >= this.delay + 0.5) this.removed = true;
  }
  #fallY() {
    const k = Math.max(0, Math.min(1, 1 - (this.delay - this.t) / 0.42));
    return (1 - k * k) * 170;
  }
  render(ctx, cx, cy) {
    if (this.done) {
      // Bruchstück bleibt kurz stecken
      const k = (this.t - this.delay) / 0.5;
      if (k < 0.7) this.fx.icicle.draw(ctx, this.x - cx, this.y - cy + 10 + k * 6);
      return;
    }
    if (this.delay - this.t > 0.42) return;
    const z = this.#fallY();
    // Schatten wächst
    const s = Math.round(2 + (1 - z / 170) * 6);
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(Math.round(this.x - cx - s), Math.round(this.y - cy), s * 2 + 1, 2);
    this.fx.icicle.draw(ctx, this.x - cx, this.y - cy - z);
  }
  renderEmissive(ctx, cx, cy) {
    if (this.done || this.delay - this.t > 0.42) return;
    const z = this.#fallY();
    this.fx.icicle.glow?.draw(ctx, this.x - cx, this.y - cy - z);
    // Fallstreifen
    ctx.fillStyle = 'rgba(200,240,255,0.35)';
    ctx.fillRect(Math.round(this.x - cx), Math.round(this.y - cy - z - 26), 1, 12);
  }
}

// Frostfeld (Phase 3): Reif am Boden, verlangsamt und schadet in Takten.
export class FrostField extends Entity {
  constructor(x, y, owner, { r = 22, duration = 8, damage = DMG.field, delay = 0.3 } = {}) {
    super(x, y);
    Object.assign(this, { owner, r, duration, damage, delay });
    this.t = 0; this.cool = 0; this.sortOffset = -19500;
    this.seed = (x * 7 + y * 13) % 100;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) this.duration = Math.min(this.duration, this.t + 0.6);
    if (this.t >= this.duration) { this.removed = true; return; }
    if (this.t < this.delay) return;
    this.cool -= dt;
    if (Math.random() < dt * 6) world.particles.spawn({ x: this.x + rand(-this.r, this.r) * 0.8, y: this.y + rand(-this.r, this.r) * 0.45, vx: 0, vy: 0, rise: rand(4, 10), wobble: 4, life: rand(0.5, 1), colors: ['#ffffff', '#9ae4f8'], emissive: true });
    const h = world.hero, dx = h.x - this.x, dy = (h.y - this.y) / 0.6;
    if (!h.dead && Math.hypot(dx, dy) < this.r) {
      this.owner.chill(world, 0.5);
      if (this.cool <= 0) { this.cool = 0.5; hurtHero(world, this.owner, this.damage, 0, 0, 0); }
    }
  }
  renderEmissive(ctx, cx, cy) {
    const k = Math.min(1, this.t / 0.3) * Math.min(1, (this.duration - this.t) / 0.6);
    if (k <= 0) return;
    const x = this.x - cx, y = this.y - cy;
    ctx.save();
    ctx.globalAlpha = 0.28 * k;
    ctx.fillStyle = '#6ac8f0';
    ctx.beginPath(); ctx.ellipse(x, y, this.r, this.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.8 * k;
    // Reifkristalle: kleine Sterne im Feld
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.4 + this.seed) % (Math.PI * 2), rr = ((i * 37 + this.seed) % 100) / 100 * this.r * 0.9;
      const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr * 0.6);
      const tw = Math.sin(this.t * 5 + i) > 0.3;
      ctx.fillStyle = tw ? '#ffffff' : '#9ae4f8';
      ctx.fillRect(px - 1, py, 3, 1); ctx.fillRect(px, py - 1, 1, 3);
    }
    ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5 * k;
    ctx.beginPath(); ctx.ellipse(x, y, this.r, this.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ Boss

export class Skalvyr extends Actor {
  constructor(x, y, assets) {
    const def = { ...ENEMY_TYPES.frost_wyrm, ...DEFS.frost_wyrm };
    const anims = assets.sprites[def.sprites];
    super(x, y, anims);
    this.type = 'frost_wyrm';
    this.def = def;
    this.bossId = def.bossId;
    this.team = 'enemy';
    this.level = def.level;
    this.maxHp = this.hp = def.hp;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = def.bodyHeight;
    this.shadowW = def.shadowW; this.material = def.material;
    this.fxSprites = anims.fx;
    this.home = { x, y };
    this.facing = 1;
    this.phase = 1;
    this.engaged = false;
    this.hurtable = false;
    this.hidden = false;
    this.cooldown = 1.5;
    this.aim = 0;
    this.adds = [];
    this.hazards = [];
    this.pending = [];
    this.timers = { breath: 2, call: 4, burrow: 9, tail: 0, wall: 0, nova: 3 };
    this.last = '';
    this.hurtAnim = 0;
    this.behind = 0;
    this.chillT = 0;
    this.lastFrame = null;
    this.setState('sleep');
    this.animator.play('dormant');
  }

  get enraged() { return this.phase >= 3; }
  get quick() { return [1, 0.86, 0.72][this.phase - 1]; }

  engage(world) {
    if (this.engaged || this.dead) return;
    this.engaged = true;
    this.world = world;
    this.setState('intro');
    this.animator.play('awaken', true);
    world.bus.emit(EV.BOSS_ENGAGED, { bossId: this.bossId, name: this.def.name });
    world.session.camera?.shake(4);
    mist(world, this.x, this.y, 14, 40);
    shards(world, this.x + 10 * this.facing, this.y, 16, 0.8);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -30, radius: 110, color: FROST_RGB, intensity: 0.5, flicker: 0.08, bloom: 0.3 }));
  }

  // Frost verlangsamt kurz (Heldentempo × 0,7) über A's Tempo-Buff; gleiche id erneuert nur die Dauer.
  chill(world, dur) {
    const h = world.hero;
    if (h.dead) return;
    this.chillT = Math.max(this.chillT, dur);
    h.buff?.('frost_chill', this.chillT, { moveSpeed: 0.7 });
  }
  #unchill() {
    this.chillT = 0;
  }

  update(dt, world) {
    this.tickTimers(dt);
    this.world = world;
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.hazards = this.hazards.filter((h) => !h.removed);
    this.hurtAnim = Math.max(0, this.hurtAnim - dt);
    for (const k in this.timers) this.timers[k] -= this.state === 'chase' ? dt : dt * 0.5;
    for (const p of this.pending) { p.t -= dt; if (p.t <= 0) p.fn(); }
    this.pending = this.pending.filter((p) => p.t > 0);
    if (this.chillT > 0) {
      this.chillT -= dt;
      if (Math.random() < dt * 14) world.particles.spawn({ x: hero.x + rand(-5, 5), y: hero.y, z: rand(2, 18), vx: 0, vy: 0, vz: -10, gravity: 0, life: 0.5, colors: ['#ffffff', '#9ae4f8'], emissive: true });
      if (this.chillT <= 0 || hero.dead) this.#unchill(world);
    }
    this.#frameEvents(world);
    this.#checkPhase(world);
    this.#ambient(dt, world);
    const spd = this.def.speed * [1, 1.12, 1.32][this.phase - 1];

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        if (Math.random() < dt * 1.5) mist(world, this.x + 40 * this.facing, this.y - 4, 1, 3);
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime > 0.5 && this.stateTime < 1.4 && Math.random() < dt * 20) shards(world, this.x + rand(-40, 40), this.y, 1, 0.6);
        if (this.animator.finished || this.stateTime > 2.1) { this.hurtable = true; this.setState('chase'); }
        break;

      case 'roar':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 40) world.particles.element(this.x + rand(-40, 40), this.y - rand(10, 70), 'frost', 1, 3);
        if (this.stateTime > 1.45) {
          this.hurtable = true;
          this.setState('chase');
          this.cooldown = 0.3;
          // Direkt nach dem Phasenwechsel: Phase 2 teilt die Arena, Phase 3 entlädt eine Nova
          if (this.phase === 2) this.#beginWall(world);
          else if (this.phase === 3) this.#beginNova(world);
        }
        break;

      case 'chase': {
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); break; }
        this.cooldown -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        const want = dist > 62 ? spd : 0;
        const k = 1 - Math.exp(-dt * 4);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        // Wenden: der lange Leib dreht sich nicht sofort um
        if (dx * this.facing < -20) this.behind += dt; else this.behind = Math.max(0, this.behind - dt * 2);
        if (this.behind > (dist > 90 ? 0.35 : 1.3) || (want > 1 && Math.sign(this.vx) === -this.facing && Math.abs(this.vx) > 8)) this.#turn(world);
        this.animator.play(this.hurtAnim > 0 ? 'hurt' : want > 1 ? 'walk' : 'idle');
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'biteWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < this.windup * 0.5) this.#track(world, dt, 3, 0.75);
        if (this.stateTime >= this.windup) this.#bite(world);
        break;

      case 'tailWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.windup) this.#tail(world);
        break;

      case 'breathWindup':
        this.vx *= 0.75; this.vy *= 0.75;
        this.#track(world, dt, 2.5, 0.95);
        if (this.breathTele) { this.breathTele.angle = this.aim; this.#placeBreathTele(); }
        if (Math.random() < dt * 30) { const m = this.#meta('mouth'); world.particles.spawn({ x: m.x + rand(-8, 8), y: m.y + rand(-6, 6), vx: 0, vy: 0, rise: -rand(4, 12), wobble: 6, life: 0.35, colors: ['#ffffff', '#9ae4f8', '#4aa6d8'], emissive: true }); }
        if (this.stateTime >= this.windup) this.#startBreath(world);
        break;

      case 'breath':
        this.vx *= 0.7; this.vy *= 0.7;
        this.#breathTick(dt, world);
        break;

      case 'castWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.random() < dt * 25) world.particles.spawn({ x: this.x + rand(-60, 60), y: this.y - rand(60, 110), vx: 0, vy: 0, rise: -rand(20, 40), life: 0.5, colors: ['#ffffff', '#9ae4f8'], emissive: true });
        if (this.stateTime >= this.windup) this.#release(world);
        break;

      case 'burrow':
        this.vx *= 0.6; this.vy *= 0.6;
        if (this.stateTime > 0.4 && this.hurtable) { this.hurtable = false; this.#holeFx(world, this.#holePos(), 1); }
        if (this.stateTime > 0.3 && Math.random() < dt * 25) { const p = this.#holePos(); shards(world, p.x, p.y, 1, 0.9); }
        if (this.animator.finished) this.#submerge(world);
        break;

      case 'under': {
        this.vx = this.vy = 0;
        const h = world.hero;
        if (this.stateTime < this.followT) this.target = world.dungeon.nearestFree(h.x, h.y);
        else if (this.tele) this.tele.follow = null;
        if (this.tele && this.stateTime < this.followT) { this.tele.x = this.target.x; this.tele.y = this.target.y; }
        // Unter dem Eis zum Ziel gleiten (Risslinie + Schneestaub an der Oberfläche)
        const k = 1 - Math.exp(-dt * 3.2);
        this.x += (this.target.x - this.x) * k; this.y += (this.target.y - this.y) * k;
        this.trail.push({ x: this.x, y: this.y, t: 0 });
        if (Math.random() < dt * 22) mist(world, this.x, this.y, 1, 5);
        if (Math.random() < dt * 14) shards(world, this.x, this.y, 1, 0.5);
        if (this.stateTime >= this.followT + this.lockT) this.#emerge(world);
        break;
      }

      case 'emerge':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime > 0.28 && !this.hurtable) this.hurtable = true;
        if (this.animator.finished) { this.cooldown = this.enraged ? 0.35 : 0.7; this.setState('chase'); }
        break;

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) {
          if (this.followUp) { const f = this.followUp; this.followUp = null; f(); break; }
          this.setState('chase');
        }
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        break;
    }
    for (const t of this.trail ?? []) t.t += dt;
    if (this.trail) this.trail = this.trail.filter((t) => t.t < 1.2);
    if (this.state === 'under') return; // unter dem Eis: keine Kollision
    this.integrate(dt, world);
  }

  // ---------------------------------------------------------------- Phasen

  #checkPhase(world) {
    if (this.dead || !this.engaged || ['intro', 'burrow', 'under', 'emerge', 'roar'].includes(this.state)) return;
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f <= 0.66) {
      this.phase = 2;
      world.bus.emit(EV.UI_BANNER, { title: 'Das Eis erwacht', sub: 'Skalvyr lässt Eiswände aus dem Boden brechen', color: '#9ae4f8' });
      this.#roar(world);
      this.timers.wall = 18; this.timers.burrow = Math.min(this.timers.burrow, 8);
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 2 });
    } else if (this.phase === 2 && f <= 0.33) {
      this.phase = 3;
      world.bus.emit(EV.UI_BANNER, { title: 'Raserei des Frostwurms', sub: 'Frostnova – hinter Eis Deckung suchen oder durch den Ring rollen', color: '#c8ecff' });
      this.#roar(world);
      this.timers.nova = 12; this.timers.wall = Math.min(this.timers.wall, 9);
      if (this.coreLight) { this.coreLight.color = FURY_RGB; this.coreLight.intensity = 0.75; this.coreLight.radius = 130; }
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 3 });
    }
  }

  #clearAttack(world) {
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    if (this.breathTele) { this.breathTele.removed = true; this.breathTele = null; }
    if (this.breathLight) { this.breathLight.dead = true; this.breathLight = null; }
    this.followUp = null;
  }

  // Phasenwechsel: unverwundbares Brüllen mit Druckwelle
  #roar(world) {
    this.#clearAttack(world);
    this.hurtable = false;
    this.setState('roar');
    this.animator.play('roar', true);
    world.session.slowmo?.(0.45, 0.6);
    this.pending.push({ t: 0.4, fn: () => {
      if (this.dead) return;
      world.addEffect(new DamageWave(this.x, this.y, this, { maxR: 150, duration: 0.9, damage: DMG.roar, color: [150, 220, 255] }));
    } });
  }

  // ---------------------------------------------------------------- Angriffswahl

  #chooseAttack(world, dist) {
    const hero = world.hero;
    const dx = hero.x - this.x;
    this.aim = Math.atan2(hero.y - this.y, dx);
    const T = this.timers, P = this.phase;
    const behind = dx * this.facing < -12;
    // Pflichtmuster der Phasen
    if (P >= 2 && T.wall <= 0) return this.#beginWall(world);
    if (P >= 3 && T.nova <= 0) return this.#beginNova(world);
    const opts = [];
    const add = (id, w) => { if (w > 0) opts.push([id, id === this.last ? w * 0.25 : w]); };
    if (behind && dist < 95) { add('tail', 5); if (T.burrow <= 0) add('burrow', 1); }
    else if (dist < 72) {
      add('bite', 4);
      if (T.breath <= 0) add('breath', 1.5);
      if (T.call <= 0) add('call', 1);
      if (T.tail <= 0 && behind) add('tail', 2);
    } else if (dist < 150) {
      if (T.breath <= 0) add('breath', 3);
      if (T.call <= 0) add('call', 2);
      if (T.burrow <= 0) add('burrow', 1.5);
    } else {
      if (T.burrow <= 0) add('burrow', 3);
      if (T.call <= 0) add('call', 2);
    }
    if (!opts.length) { this.cooldown = 0.3; return; }
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), id = opts[0][0];
    for (const [k, w] of opts) { r -= w; if (r <= 0) { id = k; break; } }
    this.last = id;
    if (id === 'bite') return this.#beginBite(world);
    if (id === 'tail') return this.#beginTail(world);
    if (id === 'breath') return this.#beginBreath(world);
    if (id === 'call') return this.#beginCall(world);
    if (id === 'burrow') return this.#beginBurrow(world);
  }

  #begin(world, state, anim, windup) {
    this.setState(state);
    this.animator.play(anim, true);
    this.windup = windup;
    this.cooldown = [1.1, 0.9, 0.6][this.phase - 1] + rand(0, 0.4);
    world.bus.emit('telegraph', { actor: this, attack: state });
  }

  // Blickwinkel dem Helden nachführen (höchstens rate rad/s), auf die Blickseite begrenzt
  #track(world, dt, rate, cone = 1) {
    const h = world.hero;
    const want = Math.atan2(h.y - this.y, h.x - this.x);
    this.aim += Math.max(-rate * dt, Math.min(rate * dt, angleDiff(this.aim, want)));
    this.aim = this.#clampAim(this.aim, cone);
  }
  #clampAim(a, cone) {
    const base = this.facing > 0 ? 0 : Math.PI;
    const d = angleDiff(base, a);
    return base + Math.max(-cone, Math.min(cone, d));
  }
  #turn(world) {
    this.facing = -this.facing;
    this.behind = 0;
    world.particles.dust(this.x, this.y, 8, '#9cc0d2');
    mist(world, this.x, this.y, 3, 30);
  }

  // ---------------------------------------------------------------- Angriffe

  #beginBite(world) {
    this.aim = this.#clampAim(this.aim, 0.75);
    const w = 0.6 * this.quick;
    const c = this.#biteCenter();
    world.spawn(new Telegraph(c.x, c.y, { shape: 'arc', r: 46, angle: this.aim, arc: 1.6, duration: w }));
    this.#begin(world, 'biteWindup', 'biteWindup', w);
  }
  #biteCenter() { return { x: this.x + this.facing * 26, y: this.y + 1 }; }
  #bite(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.35 : 0.6;
    this.animator.play('bite', true);
    const c = this.#biteCenter();
    const h = world.hero, dx = h.x - c.x, dy = (h.y - c.y) / 0.6, d = Math.hypot(dx, dy);
    if (d < 46 + h.hurtRadius && Math.abs(angleDiff(this.aim, Math.atan2(dy, dx))) < 0.8 + Math.atan2(h.hurtRadius, Math.max(1, d))) {
      if (hurtHero(world, this, DMG.bite, Math.cos(this.aim), Math.sin(this.aim), 200, true)) this.chill(world, 1.0);
    }
    this.kbx += Math.cos(this.aim) * 90; this.kby += Math.sin(this.aim) * 90;
    const m = { x: this.x + this.facing * 52, y: this.y - 14 };
    world.particles.sparks(m.x, m.y, this.aim, 8, ['#ffffff', '#dcf8ff', '#9ae4f8']);
    shards(world, c.x + Math.cos(this.aim) * 20, c.y + Math.sin(this.aim) * 10, 8, 0.7);
    world.session.camera?.shake(4);
    world.session.hitstop?.(0.04);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
    // Raserei: zweiter, schnellerer Biss
    if (this.enraged && !this.doubled && Math.random() < 0.6) {
      this.doubled = true;
      this.followUp = () => { this.aim = Math.atan2(world.hero.y - this.y, world.hero.x - this.x); this.#beginBite(world); this.windup = 0.4; };
    } else this.doubled = false;
  }

  #tailPivot() { return { x: this.x - this.facing * 8, y: this.y }; }
  #beginTail(world) {
    this.timers.tail = rand(3, 5) * this.quick;
    const w = 0.75 * this.quick;
    const p = this.#tailPivot();
    world.spawn(new Telegraph(p.x, p.y, { shape: 'arc', r: 84, angle: this.facing > 0 ? Math.PI : 0, arc: 2.9, duration: w, color: WARN_TAIL }));
    this.#begin(world, 'tailWindup', 'tailWindup', w);
  }
  #tail(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.45 : 0.7;
    this.animator.play('tail', true);
    const p = this.#tailPivot(), back = this.facing > 0 ? Math.PI : 0;
    const h = world.hero, dx = h.x - p.x, dy = (h.y - p.y) / 0.6, d = Math.hypot(dx, dy);
    if (d < 84 + h.hurtRadius && Math.abs(angleDiff(back, Math.atan2(dy, dx))) < 1.45 + Math.atan2(h.hurtRadius, Math.max(1, d))) {
      const l = d || 1;
      if (hurtHero(world, this, DMG.tail, dx / l, dy / l, 340, true)) this.chill(world, 1.2);
    }
    for (let i = 0; i < 12; i++) {
      const a = back - 1.4 + i * 0.25;
      world.particles.sparks(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 36 - 6, a, 1, ['#ffffff', '#dcf8ff', '#9ae4f8']);
    }
    mist(world, p.x - this.facing * 40, p.y, 6, 30);
    world.session.camera?.shake(5);
    world.session.hitstop?.(0.05);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  // Frostatem: Kegel vor dem Maul, am Boden verankert
  #breathOrigin() { return { x: this.x + this.facing * 40, y: this.y + 2 }; }
  #placeBreathTele() { const o = this.#breathOrigin(); this.breathTele.x = o.x; this.breathTele.y = o.y; }
  #beginBreath(world) {
    this.timers.breath = rand(7, 9) * this.quick;
    this.aim = this.#clampAim(this.aim, 0.95);
    const w = 0.95 * this.quick;
    const o = this.#breathOrigin();
    this.breathTele = world.spawn(new Telegraph(o.x, o.y, { shape: 'arc', r: 124, angle: this.aim, arc: 0.85, duration: w, color: WARN_ICE }));
    this.#begin(world, 'breathWindup', 'breathWindup', w);
    world.bus.emit('cast', { actor: this, element: 'frost' });
  }
  #startBreath(world) {
    this.setState('breath');
    this.animator.play('breath', true);
    this.breathDur = [2.2, 2.5, 2.8][this.phase - 1];
    this.breathTick = 0;
    if (this.breathTele) this.breathTele.removed = true;
    const o = this.#breathOrigin();
    this.breathTele = world.spawn(new Telegraph(o.x, o.y, { shape: 'arc', r: 124, angle: this.aim, arc: 0.85, duration: this.breathDur, color: [150, 210, 255] }));
    this.breathLight = world.addLight(new Light({ x: o.x, y: o.y, radius: 100, color: FROST_RGB, intensity: 0.9, flicker: 0.2, ttl: this.breathDur, bloom: 0.5 }));
    world.bus.emit('bossBreath', { actor: this, active: true, element: 'frost' });
    world.bus.emit('cast', { actor: this, element: 'frost' });
  }
  #breathTick(dt, world) {
    this.#track(world, dt, [0.45, 0.6, 0.8][this.phase - 1], 0.95);
    if (this.breathTele) { this.breathTele.angle = this.aim; this.#placeBreathTele(); }
    const o = this.#breathOrigin(), m = this.#meta('mouth');
    const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
    if (this.breathLight) { this.breathLight.x = o.x + ca * 60; this.breathLight.y = o.y + sa * 36; }
    // Frostnebel und Eiskristalle strömen aus dem Maul zum Boden
    const z0 = this.y - m.y;
    for (let i = 0; i < 3; i++) {
      const a = this.aim + rand(-0.36, 0.36), s = rand(130, 210);
      world.particles.spawn({ x: m.x, y: this.y, z: z0, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: -z0 * 1.4, gravity: 0, life: rand(0.5, 0.7), colors: ['#ffffff', '#dcf8ff', '#9ae4f8', '#4aa6d8'], emissive: true, size: Math.random() < 0.4 ? 2 : 1, drag: 1.5 });
    }
    if (Math.random() < dt * 8) mist(world, o.x + ca * rand(40, 120), o.y + sa * rand(24, 70), 1, 6);
    if (Math.random() < dt * 5) world.decals.pixel(o.x + ca * rand(20, 120) + rand(-8, 8), o.y + sa * rand(12, 70) + rand(-5, 5), pick(SNOW));
    this.breathTick -= dt;
    if (this.breathTick <= 0) {
      this.breathTick = 0.25;
      const h = world.hero, dx = h.x - o.x, dy = (h.y - o.y) / 0.6, d = Math.hypot(dx, dy);
      if (d < 124 + h.hurtRadius && Math.abs(angleDiff(this.aim, Math.atan2(dy, dx))) < 0.43 + Math.atan2(h.hurtRadius, Math.max(1, d))) {
        const blocked = this.hazards.some((p) => p instanceof IcePillar && p.blocks(o.x, o.y, h.x, h.y));
        if (!blocked && hurtHero(world, this, DMG.breath, ca, sa, 40)) this.chill(world, 1.2);
      }
    }
    if (this.stateTime >= this.breathDur) {
      if (this.breathTele) { this.breathTele.removed = true; this.breathTele = null; }
      if (this.breathLight) { this.breathLight.dead = true; this.breathLight = null; }
      world.bus.emit('bossBreath', { actor: this, active: false });
      this.setState('strike'); this.recover = 0.5;
      this.animator.play('idle', true);
    }
  }

  // Eissplitter-Regen: brüllt zur Decke, Eiszapfen stürzen in markierte Kreise
  #beginCall(world) {
    this.timers.call = rand(8, 11) * this.quick;
    const w = 0.95 * this.quick;
    this.#begin(world, 'castWindup', 'callWindup', w);
    world.bus.emit('cast', { actor: this, element: 'frost' });
    const h = world.hero, n = [5, 7, 9][this.phase - 1];
    const lead = { x: h.x + (h.vx ?? 0) * 0.4, y: h.y + (h.vy ?? 0) * 0.4 };
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = i === 0 ? 0 : i < 4 ? rand(28, 56) : rand(50, 110);
      const c = i === 0 ? lead : { x: (i < 4 ? h.x : this.x) + Math.cos(a) * r, y: (i < 4 ? h.y : this.y) + Math.sin(a) * r * 0.6 };
      const p = world.dungeon.nearestFree(c.x, c.y);
      const delay = w + 0.55 + i * 0.13;
      world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 18, duration: delay, color: WARN_ICE }));
      this.#addHazard(world, new FallingIcicle(p.x, p.y, this, { delay, r: 18 }));
    }
  }

  // Eiswände (ab Phase 2): Säulenreihen quer durch die Arena, je mit einer Lücke
  #beginWall(world) {
    this.timers.wall = rand(20, 24) * (this.enraged ? 0.85 : 1);
    const w = 1.15 * this.quick;
    this.#begin(world, 'slamWindup', 'slamWindup', w);
    this.cooldown = 1.2;
    const A = world.arena ?? { x0: this.home.x - 170, x1: this.home.x + 170, y0: this.home.y - 110, y1: this.home.y + 110 };
    const h = world.hero;
    const lines = [];
    // Senkrechte Wand zwischen Held und Wurm (oder durch die Mitte), waagrechte Wand ab Phase 3 zusätzlich
    // Nicht durch den Wurm selbst: zwischen Held und Wurm, sonst auf der anderen Seite des Helden
    let midX = (h.x + this.x) / 2 + rand(-12, 12);
    if (Math.abs(midX - this.x) < 56) midX = h.x + Math.sign(h.x - this.x || 1) * 40;
    midX = Math.max(A.x0 + 40, Math.min(A.x1 - 40, midX));
    lines.push({ vertical: true, c: midX });
    if (this.phase >= 3 || Math.random() < 0.5) lines.push({ vertical: false, c: Math.max(A.y0 + 40, Math.min(A.y1 - 30, (A.y0 + A.y1) / 2 + rand(-20, 20))) });
    this.walls = [];
    for (const L of lines) {
      const from = L.vertical ? A.y0 + 6 : A.x0 + 6, to = L.vertical ? A.y1 - 4 : A.x1 - 6;
      const step = L.vertical ? 11 : 16;
      const n = Math.floor((to - from) / step);
      const gap = Math.floor(rand(0.2, 0.8) * n);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        if (Math.abs(i - gap) <= 1) continue;
        const s = from + i * step;
        const x = L.vertical ? L.c + Math.sin(i * 1.7) * 2 : s, y = L.vertical ? s : L.c + Math.sin(i * 1.3) * 2;
        const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
        if (world.dungeon.isWall(tx, ty)) continue;
        pts.push({ x, y, i });
      }
      // Warnung: Linie je Teilstück (die Lücke bleibt frei)
      let run = [];
      const flush = () => {
        if (run.length) {
          const a = run[0], b = run[run.length - 1];
          const len = Math.hypot(b.x - a.x, (b.y - a.y) / 0.75) + 10;
          const ang = Math.atan2((b.y - a.y) / 0.75, b.x - a.x);
          const sx = a.x - Math.cos(ang) * 5, sy = a.y - Math.sin(ang) * 5 * 0.75;
          world.spawn(new Telegraph(sx, sy, { shape: 'line', angle: ang, len, width: 18, duration: w + 0.1, color: WARN_ICE }));
        }
        run = [];
      };
      for (const p of pts) { if (run.length && p.i - run[run.length - 1].i > 1) flush(); run.push(p); }
      flush();
      this.walls.push(pts);
    }
  }
  #raiseWalls(world) {
    const life = this.enraged ? 9 : 11;
    for (const pts of this.walls ?? []) {
      pts.forEach((p, k) => this.#addHazard(world, new IcePillar(p.x, p.y, this, { delay: 0.05 + k * 0.035, life: life + k * 0.02 })));
    }
    this.walls = null;
  }
  #slam(world) {
    this.setState('strike'); this.recover = 0.8;
    this.animator.play('slam', true);
  }

  // Frostnova (Phase 3): innerer Kreis, danach Druckring und Frostfelder
  #beginNova(world) {
    this.timers.nova = rand(13, 16);
    const w = 1.5;
    world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: 74, duration: w, color: WARN }));
    world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: 170, duration: w, color: [150, 210, 255] }));
    this.#begin(world, 'novaWindup', 'novaWindup', w);
    this.cooldown = 1;
    world.bus.emit('cast', { actor: this, element: 'frost' });
  }
  #nova(world) {
    this.setState('strike'); this.recover = 0.9;
    this.animator.play('nova', true);
    const x = this.x, y = this.y;
    const h = world.hero, dx = h.x - x, dy = (h.y - y) / 0.6, d = Math.hypot(dx, dy);
    const cover = this.hazards.some((p) => p instanceof IcePillar && p.blocks(x, y, h.x, h.y));
    if (d < 74 + 4 && !cover) { const l = d || 1; if (hurtHero(world, this, DMG.nova, dx / l, dy / l, 300, true)) this.chill(world, 2.2); }
    world.addEffect(new DamageWave(x, y, this, { maxR: 170, duration: 1.0, damage: DMG.novaRing, color: [170, 225, 255] }));
    world.addEffect(new Shockwave(x, y - 4, { radius: 90, color: '#dcf8ff', life: 0.6 }));
    world.particles.ring(x, y - 10, 16, 48, ['#ffffff', '#dcf8ff', '#9ae4f8'], 190);
    shards(world, x, y - 10, 40, 1.6);
    mist(world, x, y, 12, 50);
    world.addLight(new Light({ x, y: y - 20, radius: 200, color: FURY_RGB, intensity: 1.3, ttl: 0.5, bloom: 0.9 }));
    world.decals.stamp(this.fxSprites.crack, x, y, 0.8);
    world.session.camera?.shake(10);
    world.session.hitstop?.(0.08);
    world.bus.emit('spellImpact', { x, y, element: 'frost', radius: 74, big: true });
    // Frostfelder bleiben zurück
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4), r = rand(60, 120);
      const p = world.dungeon.nearestFree(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6);
      this.#addHazard(world, new FrostField(p.x, p.y, this, { r: rand(18, 26), duration: 8 }));
    }
  }

  // Eingraben -> unter dem Eis zum Helden -> Hervorbrechen
  #holePos() { const m = this.animator.frame.meta?.hole; return m ? { x: this.x + m.dx * this.facing, y: this.y + m.dy } : { x: this.x + this.facing * 50, y: this.y + 3 }; }
  #beginBurrow(world) {
    this.timers.burrow = rand(12, 15) * this.quick;
    this.#clearAttack(world);
    this.setState('burrow');
    this.animator.play('burrow', true);
    this.cooldown = 0.5;
    world.bus.emit('bossDive', { bossId: this.bossId, x: this.x, y: this.y });
    world.bus.emit('telegraph', { actor: this, attack: 'burrow' });
  }
  #holeFx(world, p, power) {
    shards(world, p.x, p.y, 18 * power, 1.1 * power);
    mist(world, p.x, p.y, 5, 10);
    world.decals.stamp(this.fxSprites.crackSmall, p.x, p.y, 0.8);
    world.session.camera?.shake(3 * power);
  }
  #submerge(world) {
    const p = this.#holePos();
    this.x = p.x; this.y = p.y;
    this.hidden = true; this.solid = false; this.hurtable = false;
    this.followT = [1.0, 0.9, 0.8][this.phase - 1];
    this.lockT = [0.7, 0.6, 0.5][this.phase - 1];
    this.target = world.dungeon.nearestFree(world.hero.x, world.hero.y);
    this.trail = [];
    this.tele = world.spawn(new Telegraph(this.target.x, this.target.y, { shape: 'circle', r: 42, duration: this.followT + this.lockT, color: WARN }));
    this.setState('under');
    world.bus.emit('telegraph', { actor: this, attack: 'emerge' });
  }
  #emerge(world) {
    const { x, y } = this.target;
    this.x = x; this.y = y;
    this.tele = null;
    this.hidden = false; this.solid = true;
    this.setState('emerge');
    this.animator.play('emerge', true);
    const h = world.hero;
    if (Math.abs(h.x - x) > 4) this.facing = Math.sign(h.x - x) || this.facing;
    // Kopf zeigt zur Arenamitte, wenn der Held genau darüber steht
    if (Math.abs(h.x - x) <= 4 && world.arena) this.facing = x < (world.arena.x0 + world.arena.x1) / 2 ? 1 : -1;
    const dx = h.x - x, dy = (h.y - y) / 0.6, d = Math.hypot(dx, dy);
    if (d < 42 + 4) { const l = d || 1; if (hurtHero(world, this, DMG.erupt, dx / l, dy / l, 320, true)) this.chill(world, 2); }
    shards(world, x, y, 50, 1.7);
    mist(world, x, y, 10, 30);
    world.addEffect(new Shockwave(x, y - 2, { radius: 56, color: '#dcf8ff', life: 0.5 }));
    world.decals.stamp(this.fxSprites.crack, x, y, 0.9);
    world.session.hitstop?.(0.09);
    world.session.camera?.shake(9);
    world.addLight(new Light({ x, y: y - 24, radius: 130, color: this.enraged ? FURY_RGB : FROST_RGB, intensity: 1.2, ttl: 0.45, bloom: 0.8 }));
    if (this.phase >= 2) world.addEffect(new DamageWave(x, y, this, { maxR: 120, duration: 0.8, damage: DMG.novaRing * 0.7, color: [150, 215, 255] }));
    world.bus.emit('spellImpact', { x, y, element: 'frost', radius: 42, big: true });
    world.bus.emit('bossEmerge', { bossId: this.bossId, x, y });
  }

  #release(world) {
    // Eissplitter: nur Effekte (die Zapfen fallen bereits verzögert)
    this.setState('strike'); this.recover = 0.55;
    const m = this.#meta('head');
    world.particles.ring(m.x, m.y, 6, 20, ['#ffffff', '#dcf8ff', '#9ae4f8'], 90);
    world.addLight(new Light({ x: m.x, y: m.y, radius: 90, color: FROST_RGB, intensity: 1, ttl: 0.35, bloom: 0.6 }));
    world.session.camera?.shake(4);
    world.bus.emit('bossMeteors', { bossId: this.bossId, element: 'frost' });
  }

  #addHazard(world, h) { world.spawn(h); this.hazards.push(h); return h; }

  // Rig-Punkt (mouth, eye, head, chest, tail, hole) in Weltkoordinaten
  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 30, dy: -44 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
  }

  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    switch (f.fx) {
      case 'step':
        world.particles.dust(this.x + this.facing * rand(14, 24), this.y + 2, 4, '#9cc0d2');
        if (Math.random() < 0.5) mist(world, this.x - this.facing * rand(0, 40), this.y, 1, 6);
        world.bus.emit('bossStep', { x: this.x, y: this.y });
        break;
      case 'roar': {
        if (this.dead) break;
        const hd = this.#meta('head');
        world.session.camera?.shake(8);
        world.particles.ring(hd.x, hd.y + 6, 12, 40, ['#ffffff', '#dcf8ff', '#9ae4f8'], 130);
        world.addLight(new Light({ x: hd.x, y: hd.y, radius: 160, color: this.enraged ? FURY_RGB : FROST_RGB, intensity: 1.1, ttl: 0.55, bloom: 0.8 }));
        world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
        // Druck stößt den Helden zurück (Schaden macht nur die Welle beim Phasenwechsel)
        const h = world.hero, dx = h.x - this.x, dy = h.y - this.y, d = Math.hypot(dx, dy) || 1;
        if (!h.dead && d < 120) { h.kbx += (dx / d) * 240; h.kby += (dy / d) * 240; }
        break;
      }
      case 'cast': {
        const hd = this.#meta('head');
        world.particles.ring(hd.x, hd.y, 5, 16, ['#ffffff', '#9ae4f8'], 70);
        break;
      }
      case 'impact':
        if (this.dead) { world.session.camera?.shake(4); shards(world, this.x, this.y, 20, 1); break; }
        if (this.state === 'strike' && this.animator.name === 'slam') {
          const p = { x: this.x + this.facing * 34, y: this.y + 2 };
          shards(world, p.x, p.y, 30, 1.3);
          mist(world, p.x, p.y, 8, 24);
          world.decals.stamp(this.fxSprites.crack, p.x, p.y, 0.8);
          world.addEffect(new Shockwave(p.x, p.y, { radius: 60, color: '#dcf8ff', life: 0.5 }));
          world.session.camera?.shake(10);
          world.session.hitstop?.(0.07);
          world.bus.emit('spellImpact', { x: p.x, y: p.y, element: 'frost', radius: 40, big: true });
          this.#raiseWalls(world);
        } else if (this.state === 'emerge') mist(world, this.x, this.y, 6, 30);
        else if (this.state === 'burrow') this.#holeFx(world, this.#holePos(), 1);
        break;
      case 'freeze':
        world.addLight(new Light({ x: this.x + this.facing * 16, y: this.y - 30, radius: 120, color: [200, 240, 255], intensity: 1, ttl: 1.2, bloom: 0.6 }));
        mist(world, this.x, this.y, 10, 50);
        break;
      case 'crack':
        world.session.camera?.shake(3);
        world.bus.emit('spellImpact', { x: this.x + this.facing * 16, y: this.y - 30, element: 'frost', radius: 20 });
        break;
      case 'shatter':
        world.session.camera?.shake(9);
        world.session.hitstop?.(0.06);
        shards(world, this.x + this.facing * 16, this.y - 30, 70, 1.8);
        mist(world, this.x, this.y, 16, 50);
        world.addLight(new Light({ x: this.x + this.facing * 16, y: this.y - 30, radius: 200, color: [210, 245, 255], intensity: 1.4, ttl: 0.8, bloom: 1 }));
        world.addEffect(new Shockwave(this.x, this.y, { radius: 100, color: '#ffffff', life: 0.6 }));
        world.bus.emit('spellImpact', { x: this.x, y: this.y - 20, element: 'frost', radius: 70, big: true });
        break;
    }
  }

  #ambient(dt, world) {
    if (this.state === 'sleep' || this.dead || this.hidden) return;
    // Frostatem aus den Nüstern, Schneekristalle rieseln vom Rücken
    if (Math.random() < dt * 3) {
      const m = this.#meta('mouth');
      world.particles.spawn({ x: m.x, y: m.y, vx: this.facing * rand(4, 12), vy: rand(-2, 2), rise: rand(2, 8), wobble: 6, drag: 2, life: rand(0.6, 1.1), colors: ['#e4f4fa', '#b8d8e6'], alpha: 0.5, size: 2, shrink: true });
    }
    const rate = [3, 5, 10][this.phase - 1];
    if (Math.random() < dt * rate) world.particles.spawn({ x: this.x + rand(-50, 20) * this.facing, y: this.y, z: rand(10, 30), vx: 0, vy: 0, vz: 0, gravity: 60, life: rand(0.6, 1), colors: ['#ffffff', '#9ae4f8'], emissive: true });
  }

  onHurt(hit) {
    if (this.state === 'sleep') return;
    if (this.state === 'chase' && hit?.heavy && Math.random() < 0.3) this.hurtAnim = 0.28;
    if (this.world && Math.random() < 0.4) shards(this.world, this.x + rand(-10, 10), this.y - rand(10, 30), 3, 0.5);
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.hidden = false;
    this.setState('dead');
    this.animator.play('death', true);
    const w = this.world;
    if (!w) return;
    this.#clearAttack(w);
    if (this.tele) this.tele.removed = true;
    for (const h of this.hazards) if (!(h instanceof IcePillar)) h.removed = true;
    this.pending = [];
    this.#unchill(w);
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.owner.team !== 'enemy');
    w.projectiles.forEach((p) => { if (p.owner === this) p.removed = true; });
    w.session.slowmo?.(0.35, 1.6);
    w.session.camera?.shake(8);
    if (this.coreLight) this.coreLight.dead = true;
    w.addLight(new Light({ x: this.x, y: this.y - 30, radius: 170, color: FROST_RGB, intensity: 1.1, ttl: 2.5, bloom: 0.8 }));
    w.addLight(new Light({ x: this.x, y: this.y - 6, radius: 80, color: [150, 210, 255], intensity: 0.5, flicker: 0.05, ttl: 12, bloom: 0.2 }));
  }

  // Stampfen/Nova lösen am Ende des Ausholens aus (Zustand castWindup-artig)
  tickTimers(dt) {
    super.tickTimers(dt);
    if (this.state === 'slamWindup' && this.stateTime >= this.windup) this.#slam(this.world);
    else if (this.state === 'novaWindup' && this.stateTime >= this.windup) this.#nova(this.world);
    else if ((this.state === 'slamWindup' || this.state === 'novaWindup') && Math.random() < dt * 30) {
      const w = this.world;
      if (w) w.particles.spawn({ x: this.x + rand(-40, 40), y: this.y - rand(0, 40), vx: 0, vy: 0, rise: rand(10, 30), life: 0.4, colors: ['#ffffff', '#9ae4f8'], emissive: true });
    }
  }

  render(ctx, cx, cy) {
    if (this.hidden) return;
    if (!this.dead || this.stateTime < 3) {
      const sh = wyrmShadow();
      ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2 + this.facing * 6), Math.round(this.y - cy - sh.height / 2));
    }
    this.drawSprite(ctx, cx, cy);
  }

  renderEmissive(ctx, cx, cy) {
    if (this.hidden) {
      // Risslinie unter dem Eis
      ctx.save();
      for (const t of this.trail ?? []) {
        const k = 1 - t.t / 1.2;
        ctx.globalAlpha = 0.7 * k;
        ctx.fillStyle = k > 0.7 ? '#dcf8ff' : '#4aa6d8';
        ctx.fillRect(Math.round(t.x - cx + Math.sin(t.x * 0.7) * 2), Math.round(t.y - cy), 2, 1);
      }
      const x = this.x - cx, y = this.y - cy;
      for (let i = 0; i < 3; i++) {
        const k = (this.stateTime * 1.8 + i / 3) % 1;
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.strokeStyle = this.enraged ? '#c8ecff' : '#9ae4f8';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), 5 + k * 14, (5 + k * 14) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    super.renderEmissive(ctx, cx, cy);
    const f = this.animator.frame;
    const glow = this.enraged ? f.glowEnraged : f.glow;
    if (glow) {
      const fade = this.dead ? Math.max(0, 1 - Math.max(0, this.stateTime - 2.4) * 0.5) : 1;
      if (fade > 0) {
        const pulse = this.state === 'breath' || this.state === 'roar' ? 1 : 0.8 + 0.2 * Math.sin(this.stateTime * (this.enraged ? 8 : 4));
        glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, alpha: (this.state === 'sleep' ? 0.5 : pulse) * fade });
      }
    }
    if (this.state === 'breath') this.#drawBreath(ctx, cx, cy);
  }

  // Frostatem: vom Maul schräg zum Boden, fächert auf, Kristallfunkeln
  #drawBreath(ctx, cx, cy) {
    const m = this.#meta('mouth'), o = this.#breathOrigin();
    const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
    const grow = Math.min(1, this.stateTime * 5), fade = Math.min(1, (this.breathDur - this.stateTime) * 4);
    const R = 124, L = R * grow;
    const ex = o.x + ca * L, ey = o.y + sa * L * 0.6;
    let nx = -sa * 0.6, ny = ca; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const cols = this.enraged ? ['#ffffff', '#e8f8ff', '#b4dcff', '#7ab4f0', '#3a6cc0'] : ['#ffffff', '#dcf8ff', '#9ae4f8', '#4aa6d8', '#25649c'];
    const t = Math.floor(this.stateTime * 18);
    for (let s = 0; s <= L; s += 1.5) {
      const k = s / R, kk = Math.min(1, s / (L || 1));
      const x = m.x + (ex - m.x) * kk, y = m.y + (ey - m.y) * kk + Math.sin(kk * Math.PI) * 5;
      const w = 2 + k * 40;
      for (let j = -w; j <= w; j += 1.5) {
        const e = Math.abs(j) / w;
        const hsh = ((Math.round(s * 3.1) * 73856093) ^ (Math.round(j * 5) * 19349663) ^ (t * 83492791)) >>> 0;
        const rnd = (hsh % 1000) / 1000;
        if (rnd < e * e * 0.9 + k * 0.35) continue;
        const ci = Math.min(4, Math.floor(e * 2 + k * 2.4 + rnd * 0.8));
        ctx.globalAlpha = (0.9 - k * 0.4) * fade;
        ctx.fillStyle = cols[ci];
        const px = Math.round(x + nx * j - cx), py = Math.round(y + ny * j * 0.6 - cy);
        if (rnd > 0.965) { ctx.fillRect(px - 1, py, 3, 1); ctx.fillRect(px, py - 1, 1, 3); } // Kristallfunkeln
        else ctx.fillRect(px, py, k > 0.5 && rnd > 0.8 ? 2 : 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}
