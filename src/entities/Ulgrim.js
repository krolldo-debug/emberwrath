import { Actor } from './Actor.js';
import { Entity, getShadow } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { DEFS } from './defs_barrow_king.js';
import { Telegraph, DamageWave } from './Telegraph.js';
import { Shockwave } from './Effects.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand, pick, angleDiff } from '../core/math.js';

// Ulgrim, der Hügelkönig – Boss des Heulenden Hügelgrabs (Stufe 26).
// Angriffe (jeder mit Bodenwarnung):
//   Schwungschlag   weiter Bogen vor ihm; Phase 2: Kombo mit Rückhand und Grabspalter
//   Grabspalter     Schwert senkrecht in den Boden, ein Geisterriss läuft die markierte Bahn entlang
//   Sprung-Stampfer springt auf die markierte Stelle (Kreis); Phase 2 mit Geister-Druckwelle
//   Beschwörung     Grabunholde (barrow_wight) brechen aus der Erde, höchstens 3 gleichzeitig
// Phase 2 (≤ 50 % LP, „Der Hügelkönig erzürnt“): Brüllen mit Druckwelle, Geisterflammen am Geweih,
//   Geisterheulen (zwei Ringwellen – durchrollen), Geister-Nachbilder (Trugbilder des Königs
//   erscheinen um den Helden und schlagen zeitversetzt zu), schnellere Kombos.
// Öffentliche Felder wie Nerith/Ignaroth: type, def, bossId, level, hp/maxHp, phase,
// engaged, hurtable, adds, home; engage(world), update, die, render/renderEmissive.

const GHOST = ['#e8fff8', '#7ef0d6', '#22b0a4', '#127272'];
const GHOST_HI = ['#ffffff', '#baffee', '#4ae6d8', '#1c9aa6'];
const GHOST_RGB = [70, 220, 200], GHOST_HI_RGB = [140, 255, 235];
const WARN_GHOST = [80, 230, 210];
const EARTH = '#3a2e24';
const EARTH_BITS = ['#1c1510', '#2e241a', '#4a3a2a', '#6a5640'];
const DUST = '#6e665a';

function hurtHero(world, owner, damage, dirX, dirY, knockback, heavy = false) {
  const h = world.hero;
  if (h.dead) return false;
  const hit = { damage: Math.round(damage * rand(0.92, 1.08)), dirX, dirY, knockback, source: owner };
  if (!h.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: owner, target: h, damage: hit.damage, crit: false, heavy, dirX, dirY, x: h.x, y: h.centerY, killed: h.dead });
  return true;
}

function wisps(world, x, y, n, spread = 8, hi = false) {
  for (let i = 0; i < n; i++) {
    world.particles.spawn({
      x: x + rand(-spread, spread), y: y + rand(-2, 2), z: rand(0, 6), vx: rand(-8, 8), vy: rand(-3, 3),
      rise: rand(14, 34), wobble: 10, life: rand(0.5, 1.1), colors: hi ? GHOST_HI : GHOST, emissive: true,
    });
  }
}
function earthBurst(world, x, y, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(10, 55) * power;
    world.particles.spawn({
      x: x + rand(-3, 3), y: y + rand(-2, 2), z: rand(0, 3), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
      vz: rand(50, 150) * power, gravity: 420, drag: 1, life: rand(0.5, 0.9), colors: [pick(EARTH_BITS)],
      size: Math.random() < 0.35 ? 2 : 1, decal: Math.random() < 0.25 ? EARTH_BITS[0] : null,
    });
  }
}

// ------------------------------------------------------------------ Hilfs-Entitäten

// Grabmal-Zeichen: Erde wölbt sich, Geisterlicht dringt aus Rissen, dann bricht ein Unhold hervor.
export class GraveMarker extends Entity {
  constructor(x, y, duration, onDone) {
    super(x, y);
    this.t = 0; this.duration = duration; this.onDone = onDone; this.sortOffset = -19400;
  }
  update(dt, world) {
    this.t += dt;
    const k = this.t / this.duration;
    if (Math.random() < dt * 14 * k) earthBurst(world, this.x + rand(-5, 5), this.y, 1, 0.4);
    if (Math.random() < dt * 20) wisps(world, this.x, this.y, 1, 6 * k + 2);
    if (this.t >= this.duration) {
      this.removed = true;
      earthBurst(world, this.x, this.y, 16, 1.1);
      world.particles.dust(this.x, this.y, 8, DUST);
      world.addLight(new Light({ x: this.x, y: this.y - 8, radius: 45, color: GHOST_RGB, intensity: 0.8, ttl: 0.5, bloom: 0.4 }));
      this.onDone();
    }
  }
  render(ctx, cx, cy) {
    // Erdhügel, der wächst
    const k = Math.min(1, this.t / this.duration);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const r = Math.round(3 + k * 6);
    ctx.fillStyle = '#1c1510';
    ctx.fillRect(x - r, y - 1, r * 2 + 1, 2);
    ctx.fillStyle = '#2e241a';
    ctx.fillRect(x - r + 2, y - 2, r * 2 - 3, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const k = Math.min(1, this.t / this.duration);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.globalAlpha = 0.35 + k * 0.6;
    ctx.fillStyle = k > 0.7 ? '#7ef0d6' : '#22b0a4';
    // Risse strahlen aus
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.3, L = 2 + k * 8;
      for (let s = 1; s < L; s++) ctx.fillRect(Math.round(x + Math.cos(a) * s), Math.round(y + Math.sin(a) * s * 0.5 + (s % 3 === 0 ? 1 : 0)), 1, 1);
    }
    ctx.fillStyle = '#e8fff8';
    ctx.fillRect(x - 1, y - 1, 3, 1);
    ctx.globalAlpha = 1;
  }
}

// Geisterriss: läuft vom Einschlag die markierte Bahn entlang, trifft höchstens einmal.
export class GraveRift extends Entity {
  constructor(x, y, angle, len, owner, { width = 20, speed = 230, damage = 50 } = {}) {
    super(x, y);
    Object.assign(this, { angle, len, owner, width, speed, damage });
    this.t = 0; this.s = 0; this.hitDone = false; this.lastMark = 0; this.sortOffset = -19300;
    this.cos = Math.cos(angle); this.sin = Math.sin(angle);
    this.seed = Math.random() * 100;
  }
  #pt(s, k) {
    const gx = this.cos * s - this.sin * k, gy = this.sin * s + this.cos * k;
    return { x: this.x + gx, y: this.y + gy * 0.75 };
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    this.s = Math.min(this.len, this.t * this.speed);
    const f = this.#pt(this.s, rand(-4, 4));
    if (this.s < this.len) {
      earthBurst(world, f.x, f.y, 2, 0.8);
      wisps(world, f.x, f.y, 1, 4, this.owner.phase >= 2);
      if (this.s - this.lastMark > 10) { this.lastMark = this.s; world.particles.dust(f.x, f.y, 2, DUST); }
    }
    if (this.t > this.len / this.speed + 0.7) { this.removed = true; return; }
    const h = world.hero;
    if (this.hitDone || h.dead || this.s >= this.len) return;
    const rx = h.x - this.x, ry = (h.y - this.y) / 0.75;
    const along = rx * this.cos + ry * this.sin, perp = -rx * this.sin + ry * this.cos;
    if (Math.abs(along - this.s) < 10 && Math.abs(perp) < this.width / 2 + 3) {
      if (hurtHero(world, this.owner, this.damage, this.cos, this.sin, 220, true)) {
        this.hitDone = true;
        wisps(world, h.x, h.y, 8, 5, true);
      } else if (h.dodgedTimer > 0) this.hitDone = true;
    }
  }
  render(ctx, cx, cy) {
    // aufgerissene Erde (dunkle Spalte)
    ctx.fillStyle = '#0c0907';
    for (let s = 0; s < this.s; s += 1) {
      const w = Math.sin(s * 0.45 + this.seed) * 2.2 + Math.sin(s * 0.13) * 1.5;
      const p = this.#pt(s, w);
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), 1, 1);
      if (s % 3 === 0) ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy) + 1, 1, 1);
    }
  }
  renderEmissive(ctx, cx, cy) {
    const fade = Math.max(0, 1 - Math.max(0, this.t - this.len / this.speed) / 0.7);
    const hi = this.owner.phase >= 2;
    for (let s = 0; s < this.s; s += 1) {
      const w = Math.sin(s * 0.45 + this.seed) * 2.2 + Math.sin(s * 0.13) * 1.5;
      const p = this.#pt(s, w);
      const age = (this.s - s) / 40;
      ctx.globalAlpha = Math.max(0, 1 - age) * fade;
      ctx.fillStyle = age < 0.15 ? '#ffffff' : age < 0.4 ? (hi ? '#baffee' : '#7ef0d6') : '#22b0a4';
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
      ctx.fillRect(x, y, 1, 1);
      // Geisterflammen züngeln aus dem Riss
      const hgt = Math.max(0, Math.round((1 - age * 1.5) * (4 + 5 * Math.abs(Math.sin(s * 0.7 + this.t * 14)))));
      if (hgt > 0 && s % 2 === 0) {
        ctx.globalAlpha *= 0.8;
        ctx.fillStyle = hi ? '#4ae6d8' : '#22b0a4';
        ctx.fillRect(x, y - hgt, 1, hgt);
        ctx.fillStyle = '#e8fff8';
        ctx.fillRect(x, y - hgt, 1, 1);
      }
    }
    // Front
    if (this.s < this.len) {
      const p = this.#pt(this.s, 0);
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#e8fff8';
      ctx.fillRect(Math.round(p.x - cx) - 1, Math.round(p.y - cy) - 5, 3, 6);
    }
    ctx.globalAlpha = 1;
  }
}

// Geister-Nachbild des Königs: erscheint, holt aus (mit Bodenwarnung), schlägt zu, verweht.
const ghostTint = new WeakMap();
function tinted(frame) {
  let c = ghostTint.get(frame);
  if (c) return c;
  const src = frame.canvas, w = src.width, h = src.height;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const d = src.getContext('2d').getImageData(0, 0, w, h);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 20) continue;
    const l = (px[i] * 0.3 + px[i + 1] * 0.55 + px[i + 2] * 0.15) / 255;
    const k = Math.min(1, l * 2.2);
    px[i] = Math.round(10 + 120 * k); px[i + 1] = Math.round(70 + 185 * k); px[i + 2] = Math.round(80 + 160 * k);
    px[i + 3] = Math.round(120 + 135 * k);
  }
  c.getContext('2d').putImageData(d, 0, 0);
  ghostTint.set(frame, c);
  return c;
}
export class PhantomKing extends Entity {
  constructor(x, y, owner, { kind = 'sweep', aim = 0, delay = 1.1, damage = 50 } = {}) {
    super(x, y);
    Object.assign(this, { owner, kind, aim, delay, damage });
    this.facing = Math.cos(aim) >= 0 ? 1 : -1;
    this.t = 0; this.struck = false; this.life = delay + 0.75;
  }
  get anims() { return this.owner.animator.anims; }
  #frame() {
    const A = this.anims;
    if (this.t < this.delay) {
      const wind = A[this.kind === 'chop' ? 'chopWindup' : 'sweepWindup'];
      const k = Math.max(0, (this.t - (this.delay - wind.duration)));
      return this.t < this.delay - wind.duration ? A.idle.frameAt(this.t) : wind.frameAt(k);
    }
    return A[this.kind].frameAt(this.t - this.delay);
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; wisps(world, this.x, this.y - 20, 10, 10); return; }
    if (Math.random() < dt * 10) wisps(world, this.x, this.y - rand(0, 40), 1, 8, true);
    if (!this.struck && this.t >= this.delay) {
      this.struck = true;
      const w = world;
      if (this.kind === 'sweep') {
        w.combat.add({ owner: this.owner, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 10, lift: 6, r: 56, angle: this.aim, arc: 2.3, damage: this.damage, knockback: 220, heavy: true, ttl: 0.12 });
      } else {
        const ix = this.x + Math.cos(this.aim) * 30, iy = this.y + Math.sin(this.aim) * 18;
        w.combat.add({ owner: this.owner, team: 'enemy', shape: 'circle', follow: false, x: ix, y: iy - 4, lift: 4, r: 22, damage: this.damage, knockback: 200, heavy: true, ttl: 0.12 });
        earthBurst(w, ix, iy, 10, 0.9);
      }
      w.particles.ring(this.x + Math.cos(this.aim) * 24, this.y + Math.sin(this.aim) * 14, 6, 18, GHOST_HI, 90);
      w.addLight(new Light({ x: this.x, y: this.y - 20, radius: 70, color: GHOST_HI_RGB, intensity: 0.9, ttl: 0.3, bloom: 0.5 }));
      w.session.camera?.shake(3);
      w.bus.emit('enemySwing', { actor: this.owner, heavy: true });
    }
    if (this.t >= this.life) { this.removed = true; wisps(world, this.x, this.y - 20, 12, 10, true); }
  }
  renderEmissive(ctx, cx, cy) {
    const f = this.#frame();
    if (!f) return;
    const fadeIn = Math.min(1, this.t / 0.35), fadeOut = Math.min(1, (this.life - this.t) / 0.35);
    const a = fadeIn * fadeOut;
    const img = tinted(f);
    const flip = this.facing < 0;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // leichtes Flimmern: waagrecht versetzte Zeilenbänder
    const jitter = Math.sin(this.t * 40) > 0.6 ? 1 : 0;
    ctx.globalAlpha = 0.55 * a;
    if (flip) { ctx.translate(x + jitter, 0); ctx.scale(-1, 1); ctx.drawImage(img, -f.ax, y - f.ay); }
    else ctx.drawImage(img, x - f.ax + jitter, y - f.ay);
    ctx.restore();
    const g = f.glowEnraged;
    g?.draw(ctx, this.x - cx, this.y - cy, { flip, alpha: 0.8 * a });
  }
}

// ------------------------------------------------------------------ Boss

export class Ulgrim extends Actor {
  constructor(x, y, assets) {
    const def = { ...ENEMY_TYPES.barrow_king, ...(DEFS.barrow_king ?? {}) };
    super(x, y, assets.sprites[def.sprites]);
    this.type = 'barrow_king';
    this.def = def;
    this.bossId = def.bossId;
    this.team = 'enemy';
    this.level = def.level;
    this.maxHp = this.hp = def.hp;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = def.bodyHeight;
    this.shadowW = def.shadowW; this.material = def.material;
    this.dmg = def.damage;
    this.assets = assets;
    this.home = { x, y };
    this.facing = -1;
    this.phase = 1;
    this.engaged = false;
    this.hurtable = false;
    this.cooldown = 1.2;
    this.aim = Math.PI;
    this.z = 0;
    this.adds = [];
    this.pendingAdds = 0;
    this.hazards = [];
    this.pending = [];
    this.timers = { summon: 9, leap: 3, howl: 0, phantom: 2, chop: 0 };
    this.combo = 0;
    this.last = '';
    this.hurtAnim = 0;
    this.ghosts = [];
    this.lastFrame = null;
    this.setState('sleep');
    this.animator.play('dormant');
  }

  get enraged() { return this.phase >= 2; }
  get quick() { return this.phase >= 2 ? 0.75 : 1; }

  engage(world) {
    if (this.engaged || this.dead) return;
    this.engaged = true;
    this.world = world;
    this.setState('intro');
    this.animator.play('awaken', true);
    world.bus.emit(EV.BOSS_ENGAGED, { bossId: this.bossId, name: this.def.name });
    world.session.camera?.shake(4);
    wisps(world, this.x, this.y - 20, 20, 14);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -36, radius: 90, color: GHOST_RGB, intensity: 0.55, flicker: 0.18, bloom: 0.3 }));
  }

  #after(t, fn) { this.pending.push({ t, fn }); }

  update(dt, world) {
    this.tickTimers(dt);
    this.world = world;
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.adds = this.adds.filter((a) => !a.removed && !a.dead);
    this.hazards = this.hazards.filter((h) => !h.removed);
    this.hurtAnim = Math.max(0, this.hurtAnim - dt);
    for (const k in this.timers) this.timers[k] -= this.state === 'chase' ? dt : dt * 0.5;
    if (!this.dead && this.pending.length) {
      for (const p of this.pending) p.t -= dt;
      const due = this.pending.filter((p) => p.t <= 0);
      this.pending = this.pending.filter((p) => p.t > 0);
      for (const p of due) p.fn(world);
    }
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.35);
    this.#frameEvents(world);
    this.#checkPhase(world);
    this.#ambient(dt, world);
    const spd = this.def.speed * (this.enraged ? 1.2 : 1);

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        if (Math.random() < dt * 2.5) wisps(world, this.x + rand(-6, 10), this.y - rand(20, 44), 1, 2);
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime > 0.35 && this.stateTime < 1.3 && Math.random() < dt * 30) world.particles.dust(this.x + rand(-12, 12), this.y, 1, DUST);
        if (this.stateTime > 1.95) { this.hurtable = true; this.setState('chase'); }
        break;

      case 'roar':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 40) wisps(world, this.x + rand(-16, 16), this.y - rand(0, 50), 1, 3, true);
        if (this.stateTime > 1.45) { this.hurtable = true; this.cooldown = 0.3; this.setState('chase'); }
        break;

      case 'chase': {
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); break; }
        this.cooldown -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        const want = dist > 42 ? spd : 0;
        const k = 1 - Math.exp(-dt * 5);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        if (Math.abs(dx) > 3) this.facing = Math.sign(dx);
        this.animator.play(this.hurtAnim > 0 ? 'hurt' : want > 1 ? 'walk' : 'idle');
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'sweepWindup':
      case 'chopWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < this.windup * 0.5) this.#track(world, dt, 4);
        if (this.tele) { this.tele.angle = this.aim; }
        if (this.stateTime >= this.windup) this.state === 'chopWindup' ? this.#chop(world) : this.#sweep(world, false);
        break;

      case 'comboWindup':
        this.vx *= 0.7; this.vy *= 0.7;
        if (this.stateTime >= this.windup) this.#sweep(world, true);
        break;

      case 'leapWindup':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 25) world.particles.dust(this.x + rand(-10, 10), this.y, 1, DUST);
        if (this.stateTime >= this.windup) this.#jump(world);
        break;

      case 'leap': {
        const k = Math.min(1, this.stateTime / this.airTime);
        const e = k * k * (3 - 2 * k);
        this.x = this.from.x + (this.target.x - this.from.x) * e;
        this.y = this.from.y + (this.target.y - this.from.y) * e;
        this.z = Math.sin(k * Math.PI) * 52 * (k < 0.5 ? 1 : 1 - (k - 0.5) * 0.3);
        this.vx = this.vy = 0;
        if (this.stateTime % 0.06 < dt) this.ghosts.push({ frame: this.animator.frame, x: this.x, y: this.y - this.z, flip: this.facing < 0, t: 0 });
        if (Math.random() < dt * 20) wisps(world, this.x, this.y - this.z - 20, 1, 8, this.enraged);
        if (k >= 1) this.#land(world);
        return; // in der Luft: keine Kollision
      }

      case 'castWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.random() < dt * 40) { const c = this.#meta('cast'); world.particles.spawn({ x: c.x + rand(-4, 4), y: c.y + rand(-4, 4), vx: 0, vy: 0, rise: rand(8, 24), wobble: 8, life: 0.45, colors: this.enraged ? GHOST_HI : GHOST, emissive: true }); }
        if (this.stateTime >= this.windup) this.#release(world);
        break;

      case 'howlWindup':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 30) { const m = this.#meta('mouth'); world.particles.spawn({ x: m.x, y: m.y, vx: rand(-10, 10), vy: 0, rise: rand(-10, 10), life: 0.4, colors: GHOST_HI, emissive: true }); }
        if (this.stateTime >= this.windup) this.#howl(world);
        break;

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) {
          if (this.next) { const n = this.next; this.next = null; n(world); }
          else this.setState('chase');
        }
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.stateTime > 1.3 && this.stateTime < 3.2 && Math.random() < 0.5) {
          // Staub und Seelenlicht steigen beim Zerfall auf
          const h = 44 * Math.max(0, 1 - (this.stateTime - 1.3) / 1.8);
          world.particles.spawn({ x: this.x + rand(-12, 12), y: this.y, z: rand(0, h), vx: rand(-14, 4), vy: rand(-3, 3), rise: rand(10, 26), wobble: 8, life: rand(0.8, 1.4), colors: ['#a89c86', '#6e665a', '#48443e'] });
          if (Math.random() < 0.4) wisps(world, this.x + rand(-10, 10), this.y - rand(4, h + 4), 1, 2, true);
        }
        break;
    }
    this.integrate(dt, world);
  }

  // ---------------------------------------------------------------- Phasen

  #checkPhase(world) {
    if (this.dead || !this.engaged || this.phase >= 2) return;
    if (!['chase', 'strike', 'sweepWindup', 'chopWindup', 'castWindup'].includes(this.state)) return;
    if (this.hp / this.maxHp > 0.5) return;
    this.phase = 2;
    world.bus.emit(EV.UI_BANNER, { title: 'Der Hügelkönig erzürnt', sub: 'Die Toten des Hügels heulen mit ihm', color: '#7ef0d6' });
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    if (this.tele) this.tele.removed = true;
    this.next = null; this.combo = 0;
    this.hurtable = false;
    this.setState('roar');
    this.animator.play('roar', true);
    world.session.slowmo?.(0.5, 0.55);
    this.timers.summon = 1.2; this.timers.howl = 4; this.timers.phantom = 7; this.timers.leap = Math.min(this.timers.leap, 3);
    if (this.coreLight) { this.coreLight.color = GHOST_HI_RGB; this.coreLight.intensity = 0.75; this.coreLight.radius = 110; }
    // Phasenwechsel schadlos (wie Varkhul/Ignaroth): Welle nur sichtbar, das Brüllen stößt zurück
    this.#after(0.4, (w) => {
      w.addEffect(new DamageWave(this.x, this.y, this, { maxR: 140, duration: 0.85, damage: 0, harmless: true, color: GHOST_HI_RGB }));
      const h = w.hero, dx = h.x - this.x, dy = h.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (!h.dead && d < 120) { h.kbx += (dx / d) * 260; h.kby += (dy / d) * 260; }
    });
    world.bus.emit('bossPhase', { bossId: this.bossId, phase: 2 });
  }

  // ---------------------------------------------------------------- Angriffswahl

  #chooseAttack(world, dist) {
    const hero = world.hero;
    this.aim = Math.atan2(hero.y - this.y, hero.x - this.x);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
    const T = this.timers, P = this.phase;
    if (T.summon <= 0 && this.adds.length + this.pendingAdds < 3) {
      T.summon = P >= 2 ? rand(17, 21) : rand(21, 25);
      return this.#beginCast(world, 'summon');
    }
    const opts = [];
    const add = (id, w) => { if (w > 0) opts.push([id, id === this.last ? w * 0.3 : w]); };
    if (dist < 62) {
      add('sweep', 3.2); add('chop', 1.2);
      if (T.leap <= 0) add('leap', 0.6);
      if (P >= 2 && T.howl <= 0) add('howl', 2.2);
    } else if (dist < 160) {
      add('chop', 2.2);
      if (T.leap <= 0) add('leap', 2.6);
      if (P >= 2 && T.phantom <= 0) add('phantom', 2.4);
      if (P >= 2 && T.howl <= 0 && dist < 110) add('howl', 1.2);
    } else {
      if (T.leap <= 0) add('leap', 3);
      if (P >= 2 && T.phantom <= 0) add('phantom', 2.5);
      add('chop', 0.8);
    }
    if (!opts.length) { this.cooldown = 0.3; return; }
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), choice = opts[0][0];
    for (const [id, w] of opts) { r -= w; if (r <= 0) { choice = id; break; } }
    this.last = choice;
    const q = this.quick;
    switch (choice) {
      case 'sweep': {
        this.combo = P >= 2 ? (Math.random() < 0.75 ? 2 : 1) : (Math.random() < 0.3 ? 1 : 0);
        const w = 0.8 * q;
        this.tele = world.spawn(new Telegraph(this.x, this.y - 4, { shape: 'arc', r: 60, angle: this.aim, arc: 2.4, duration: w, follow: this }));
        return this.#begin(world, 'sweepWindup', 'sweepWindup', w);
      }
      case 'chop': return this.#beginChop(world, 0.95 * q);
      case 'leap': {
        T.leap = rand(8, 11) * q;
        return this.#begin(world, 'leapWindup', 'leapWindup', 0.5 * q);
      }
      case 'howl': {
        T.howl = rand(11, 14);
        const w = 1.0;
        world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: 150, duration: w, color: [40, 120, 115] }));
        world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: 40, duration: w, color: WARN_GHOST, follow: this }));
        world.bus.emit('cast', { actor: this, element: 'frost' });
        return this.#begin(world, 'howlWindup', 'howlWindup', w);
      }
      case 'phantom': T.phantom = rand(12, 15); return this.#beginCast(world, 'phantom');
    }
  }

  #begin(world, state, anim, windup) {
    this.setState(state);
    this.animator.play(anim, true);
    this.windup = windup;
    this.cooldown = (this.enraged ? 0.5 : 0.95) + rand(0, 0.45);
    world.bus.emit('telegraph', { actor: this, attack: state });
  }

  #beginChop(world, wind) {
    const len = Math.min(170, this.#rayLength(world, this.aim));
    this.chopLen = len;
    this.tele = null;
    world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: this.aim, len, width: 30, duration: wind }));
    this.#begin(world, 'chopWindup', 'chopWindup', wind);
  }

  #beginCast(world, kind) {
    this.castKind = kind;
    this.#begin(world, 'castWindup', 'cast', kind === 'summon' ? 1.0 : 0.85 * this.quick);
    world.bus.emit('cast', { actor: this, element: 'frost' });
    if (kind === 'phantom') this.#phantoms(world);
    if (kind === 'summon') this.#markGraves(world);
  }

  #track(world, dt, rate) {
    const h = world.hero;
    const want = Math.atan2(h.y - this.y, h.x - this.x);
    const d = angleDiff(this.aim, want);
    this.aim += Math.max(-rate * dt, Math.min(rate * dt, d));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  // ---------------------------------------------------------------- Angriffe

  #sweep(world, back) {
    this.setState('strike');
    this.recover = this.enraged ? 0.42 : 0.7;
    this.animator.play(back ? 'backsweep' : 'sweep', true);
    this.tele = null;
    const dmg = back ? this.dmg.backsweep : this.dmg.sweep;
    world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 10, r: 60, angle: this.aim, arc: 2.4, damage: dmg, knockback: 230, heavy: true, ttl: 0.14 });
    this.kbx += Math.cos(this.aim) * 80; this.kby += Math.sin(this.aim) * 80;
    for (let i = 0; i < 9; i++) {
      const a = this.aim - 1.2 + i * 0.3;
      world.particles.sparks(this.x + Math.cos(a) * 44, this.y - 8 + Math.sin(a) * 26, a, 2, this.enraged ? GHOST_HI : GHOST);
    }
    world.particles.dust(this.x + Math.cos(this.aim) * 26, this.y + Math.sin(this.aim) * 14, 8, DUST);
    world.session.camera?.shake(4);
    world.session.hitstop?.(0.04);
    world.addLight(new Light({ x: this.x + Math.cos(this.aim) * 30, y: this.y - 12, radius: 70, color: this.enraged ? GHOST_HI_RGB : GHOST_RGB, intensity: 0.8, ttl: 0.22, bloom: 0.4 }));
    world.bus.emit('enemySwing', { actor: this, heavy: true });
    // Kombo: Rückhand, danach Grabspalter
    if (this.combo > 0) {
      this.combo--;
      const q = this.quick;
      if (!back) {
        this.recover = 0.18;
        this.next = (w) => {
          if (this.dead) return;
          this.aim = Math.atan2(w.hero.y - this.y, w.hero.x - this.x);
          this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
          const wind = Math.max(0.55, 0.5 * q); // Folgehieb: mindestens 0,55 s Warnung
          this.tele = w.spawn(new Telegraph(this.x, this.y - 4, { shape: 'arc', r: 60, angle: this.aim, arc: 2.4, duration: wind, follow: this }));
          this.setState('comboWindup'); this.windup = wind;
          w.bus.emit('telegraph', { actor: this, attack: 'comboWindup' });
        };
      } else {
        this.recover = 0.2;
        this.next = (w) => {
          if (this.dead) return;
          this.aim = Math.atan2(w.hero.y - this.y, w.hero.x - this.x);
          this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
          this.#beginChop(w, 0.7 * q);
        };
      }
    }
  }

  #chop(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.55 : 0.85;
    this.animator.play('chop', true);
    const ix = this.x + Math.cos(this.aim) * 30, iy = this.y + Math.sin(this.aim) * 20;
    world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x: ix, y: iy - 4, lift: 4, r: 16, damage: this.dmg.chop, knockback: 240, heavy: true, ttl: 0.12 });
    this.#addHazard(world, new GraveRift(this.x + Math.cos(this.aim) * 22, this.y + Math.sin(this.aim) * 14, this.aim, Math.max(20, this.chopLen - 22), this, { width: 22, speed: this.enraged ? 280 : 230, damage: this.dmg.rift }));
    earthBurst(world, ix, iy, 16, 1.2);
    world.particles.dust(ix, iy, 10, DUST);
    world.session.camera?.shake(7);
    world.session.hitstop?.(0.06);
    world.addLight(new Light({ x: ix, y: iy - 6, radius: 90, color: this.enraged ? GHOST_HI_RGB : GHOST_RGB, intensity: 1, ttl: 0.35, bloom: 0.6 }));
    world.bus.emit('bossSlam', { x: ix, y: iy });
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  #jump(world) {
    const h = world.hero;
    let tx = h.x + (h.vx ?? 0) * 0.3, ty = h.y + (h.vy ?? 0) * 0.3;
    const A = world.arena;
    if (A) { tx = Math.max(A.x0 + 18, Math.min(A.x1 - 18, tx)); ty = Math.max(A.y0 + 14, Math.min(A.y1 - 10, ty)); }
    const p = world.dungeon.nearestFree(tx, ty);
    this.from = { x: this.x, y: this.y };
    this.target = { x: p.x, y: p.y };
    this.airTime = this.enraged ? 0.7 : 0.8;
    if (Math.abs(p.x - this.x) > 3) this.facing = Math.sign(p.x - this.x);
    this.setState('leap');
    this.animator.play('leapAir', true);
    this.hurtable = false; this.solid = false;
    world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 46, duration: this.airTime }));
    if (this.enraged) world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 130, duration: this.airTime, color: WARN_GHOST }));
    world.particles.dust(this.x, this.y, 14, DUST);
    earthBurst(world, this.x, this.y, 8, 0.8);
    world.session.camera?.shake(3);
    world.bus.emit('telegraph', { actor: this, attack: 'leap' });
  }

  #land(world) {
    const { x, y } = this.target;
    this.x = x; this.y = y; this.z = 0;
    this.hurtable = true; this.solid = true;
    this.setState('strike'); this.recover = this.enraged ? 0.6 : 0.9;
    this.animator.play('leapLand', true);
    world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 6, lift: 6, r: 46, damage: this.dmg.leap, knockback: 300, heavy: true, ttl: 0.14 });
    earthBurst(world, x, y, 34, 1.5);
    world.particles.dust(x, y, 22, DUST);
    world.particles.ring(x, y, 10, 30, this.enraged ? GHOST_HI : GHOST, 140);
    world.addEffect(new Shockwave(x, y - 2, { radius: 50, color: '#a8f0dc', life: 0.5 }));
    world.decals.splat(x, y, EARTH_BITS, 12);
    world.session.hitstop?.(0.1);
    world.session.camera?.shake(10);
    world.addLight(new Light({ x, y: y - 16, radius: 120, color: this.enraged ? GHOST_HI_RGB : GHOST_RGB, intensity: 1.1, ttl: 0.4, bloom: 0.7 }));
    if (this.enraged) world.addEffect(new DamageWave(x, y, this, { maxR: 130, duration: 0.8, damage: this.dmg.wave, color: GHOST_HI_RGB }));
    world.bus.emit('spellImpact', { x, y, element: 'frost', radius: 46, big: true });
    world.bus.emit('bossSlam', { x, y });
  }

  #howl(world) {
    this.setState('strike'); this.recover = 0.9;
    this.animator.play('howl', true);
    const ring = (delay, maxR) => this.#after(delay, (w) => {
      if (this.dead) return;
      w.addEffect(new DamageWave(this.x, this.y, this, { maxR, duration: 0.95, damage: this.dmg.howl, color: GHOST_HI_RGB }));
      w.particles.ring(this.x, this.y - 30, 10, 30, GHOST_HI, 150);
    });
    ring(0.12, 165);
    ring(0.7, 165);
    world.addLight(new Light({ x: this.x, y: this.y - 40, radius: 160, color: GHOST_HI_RGB, intensity: 1.1, ttl: 1.1, bloom: 0.8 }));
    world.session.camera?.shake(6);
    world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
  }

  // Geister-Nachbilder um den Helden: jedes zeigt seinen Schlag am Boden an
  #phantoms(world) {
    const h = world.hero;
    const n = this.hp / this.maxHp < 0.25 ? 3 : 2;
    const base = rand(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2;
      const r = 42;
      const p = world.dungeon.nearestFree(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r * 0.65);
      const aim = Math.atan2(h.y - p.y, h.x - p.x);
      const kind = i % 2 === 0 ? 'sweep' : 'chop';
      const delay = 1.25 + i * 0.35;
      if (kind === 'sweep') world.spawn(new Telegraph(p.x, p.y - 4, { shape: 'arc', r: 56, angle: aim, arc: 2.3, duration: delay, color: WARN_GHOST }));
      else world.spawn(new Telegraph(p.x + Math.cos(aim) * 30, p.y + Math.sin(aim) * 18, { shape: 'circle', r: 22, duration: delay, color: WARN_GHOST }));
      this.#addHazard(world, new PhantomKing(p.x, p.y, this, { kind, aim, delay, damage: this.dmg.phantom }));
      wisps(world, p.x, p.y - 20, 10, 10, true);
    }
    world.bus.emit('bossPhantoms', { bossId: this.bossId, count: n });
  }

  #markGraves(world) {
    const n = Math.min(this.enraged ? 3 : 2, 3 - this.adds.length - this.pendingAdds);
    this.graves = [];
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + rand(-0.5, 0.5);
      const p = world.dungeon.nearestFree(this.home.x + Math.cos(a) * 72, this.home.y + Math.sin(a) * 46);
      this.graves.push(p);
    }
  }

  #release(world) {
    this.setState('strike'); this.recover = 0.55;
    const c = this.#meta('cast');
    world.addLight(new Light({ x: c.x, y: c.y, radius: 80, color: GHOST_HI_RGB, intensity: 1, ttl: 0.4, bloom: 0.6 }));
    if (this.castKind === 'summon') {
      const type = this.#addType(world);
      for (const p of this.graves ?? []) {
        if (this.adds.length + this.pendingAdds >= 3) break;
        this.pendingAdds++;
        world.spawn(new GraveMarker(p.x, p.y, 0.9, () => {
          this.pendingAdds--;
          if (this.dead) return;
          const e = world.spawnEnemy(type, p.x, p.y, { respawned: true, home: { ...this.home } });
          e.aggroed = true; e.summoned = true; e.xpOverride = 20;
          this.adds.push(e);
        }));
      }
      this.graves = [];
      world.bus.emit('bossSummon', { bossId: this.bossId, count: this.pendingAdds });
    }
  }

  #addType(world) {
    try {
      if (ENEMY_TYPES.barrow_wight && world.assets.sprites.barrow_wight?.idle) return 'barrow_wight';
    } catch (e) { /* Grafik fehlt noch */ }
    return 'skeleton';
  }

  #addHazard(world, h) {
    world.spawn(h);
    this.hazards.push(h);
    return h;
  }

  #rayLength(world, ang) {
    let len = 0;
    const T = 16;
    while (len < 320) {
      const x = this.x + Math.cos(ang) * (len + 12), y = this.y + Math.sin(ang) * 0.75 * (len + 12);
      if (world.dungeon.isWall(Math.floor(x / T), Math.floor((y - 4) / T))) break;
      len += 6;
    }
    return len + 8;
  }

  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 0, dy: -40 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy - this.z };
  }

  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'step') {
      world.particles.dust(this.x + rand(-8, 8), this.y, 4, DUST);
      world.session.camera?.shake(1);
      world.bus.emit('bossStep', { x: this.x, y: this.y });
    } else if (f.fx === 'roar') {
      const h = this.#meta('head');
      world.session.camera?.shake(8);
      world.particles.ring(h.x, h.y + 8, 12, 36, this.enraged ? GHOST_HI : GHOST, 120);
      world.addEffect(new Shockwave(this.x, this.y - 4, { radius: 90, color: '#baffee', life: 0.7 }));
      world.addLight(new Light({ x: h.x, y: h.y, radius: 150, color: this.enraged ? GHOST_HI_RGB : GHOST_RGB, intensity: 1, ttl: 0.5, bloom: 0.7 }));
      wisps(world, this.x, this.y - 30, 24, 18, true);
      world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
      if (this.state === 'intro' || this.state === 'roar') {
        const hero = world.hero, dx = hero.x - this.x, dy = hero.y - this.y, d = Math.hypot(dx, dy) || 1;
        if (!hero.dead && d < 110) { hero.kbx += (dx / d) * 250; hero.kby += (dy / d) * 250; }
      }
    } else if (f.fx === 'cast') {
      const c = this.#meta('cast');
      world.particles.ring(c.x, c.y, 4, 14, GHOST_HI, 70);
      wisps(world, c.x, c.y, 6, 3, true);
    } else if (f.fx === 'impact' && this.dead) {
      world.session.camera?.shake(5);
      world.particles.dust(this.x, this.y, 16, DUST);
      earthBurst(world, this.x, this.y, 10, 0.7);
    }
  }

  #ambient(dt, world) {
    if (this.state === 'sleep' || this.dead) return;
    // Geisterlicht tropft vom Umhangsaum, Staub rieselt aus der Rüstung
    if (Math.random() < dt * (this.enraged ? 12 : 5)) wisps(world, this.x - this.facing * rand(4, 14), this.y - rand(0, 8), 1, 3, this.enraged);
    if (Math.random() < dt * 3) world.particles.spawn({ x: this.x + rand(-8, 8), y: this.y, z: rand(10, 36), vx: 0, vy: 0, vz: 0, gravity: 160, life: 0.5, colors: ['#6e665a', '#48443e'] });
    if (this.enraged && Math.random() < dt * 14) {
      const e = this.#meta('eye');
      world.particles.spawn({ x: e.x - this.facing * 2, y: e.y, vx: -this.facing * rand(6, 16), vy: 0, rise: rand(12, 26), wobble: 6, life: rand(0.3, 0.6), colors: GHOST_HI, emissive: true });
    }
  }

  onHurt(hit) {
    if (this.state === 'sleep') return;
    if (this.state === 'chase' && this.hurtAnim <= 0 && (hit?.heavy ? Math.random() < 0.45 : Math.random() < 0.12)) this.hurtAnim = 0.28;
    if (this.world && Math.random() < 0.4) this.world.particles.dust(this.x, this.y - rand(10, 30), 2, DUST);
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.z = 0;
    this.setState('dead');
    this.animator.play('death', true);
    const w = this.world;
    if (!w) return;
    for (const a of this.adds) if (!a.dead) a.takeHit({ damage: 99999, dirX: 0, dirY: 1, knockback: 0, source: this });
    for (const h of this.hazards) h.removed = true;
    this.hazards = []; this.pending = []; this.next = null;
    if (this.tele) this.tele.removed = true;
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.owner.team !== 'enemy');
    w.projectiles.forEach((p) => { if (p.owner === this) p.removed = true; });
    w.session.slowmo?.(0.3, 1.6);
    w.session.camera?.shake(8);
    if (this.coreLight) this.coreLight.dead = true;
    w.addLight(new Light({ x: this.x, y: this.y - 36, radius: 190, color: GHOST_HI_RGB, intensity: 1.3, ttl: 1.5, bloom: 0.9 }));
    w.addLight(new Light({ x: this.x, y: this.y - 10, radius: 60, color: GHOST_RGB, intensity: 0.5, flicker: 0.2, ttl: 5, bloom: 0.2 }));
    wisps(w, this.x, this.y - 30, 40, 16, true);
    w.particles.ring(this.x, this.y - 30, 10, 40, GHOST_HI, 150);
  }

  // ---------------------------------------------------------------- Zeichnen

  render(ctx, cx, cy) {
    const f = this.animator.frame;
    const sw = Math.max(8, Math.round(this.shadowW * (1 - this.z / 120)));
    const sh = getShadow(sw);
    ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
    f.draw(ctx, this.x - cx, this.y - this.z - cy, { flip: this.facing < 0 });
  }

  renderEmissive(ctx, cx, cy) {
    const glowOf = (fr) => (this.enraged ? fr.glowEnraged : fr.glow);
    for (const g of this.ghosts) {
      const k = 1 - g.t / 0.35;
      g.frame.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, flash: true, alpha: 0.12 * k });
      glowOf(g.frame)?.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, alpha: 0.5 * k });
    }
    const f = this.animator.frame;
    const x = this.x - cx, y = this.y - this.z - cy;
    if (this.flash > 0) f.draw(ctx, x, y, { flip: this.facing < 0, flash: true, alpha: Math.min(1, this.flash * 14) });
    const glow = glowOf(f);
    if (!glow) return;
    const fade = this.dead ? Math.max(0, 1 - Math.max(0, this.stateTime - 2.2) * 0.3) : 1;
    if (fade <= 0) return;
    const pulse = this.state === 'roar' || this.state === 'howlWindup' ? 1 : 0.8 + 0.2 * Math.sin(this.stateTime * (this.enraged ? 8 : 4.5));
    glow.draw(ctx, x, y, { flip: this.facing < 0, alpha: (this.state === 'sleep' ? 0.5 : pulse) * fade });
    // Glanz an der Klingenspitze kurz vor dem Schlag
    if (/Windup$/.test(this.state) && this.state !== 'castWindup' && this.stateTime > this.windup * 0.55) {
      const t = this.#meta(this.state === 'howlWindup' ? 'mouth' : 'tip'), k = (this.stateTime - this.windup * 0.55) / (this.windup * 0.45);
      const r = Math.round(2 + k * 5), px = Math.round(t.x - cx), py = Math.round(t.y - cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - r, py, r * 2 + 1, 1); ctx.fillRect(px, py - r, 1, r * 2 + 1);
      ctx.fillStyle = this.enraged ? '#baffee' : '#7ef0d6';
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
  }
}
