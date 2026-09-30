import { Actor } from './Actor.js';
import { Entity } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { DEFS } from './defs_rot_mother.js';
import { Telegraph, DamageWave } from './Telegraph.js';
import { Shockwave, SpawnMarker } from './Effects.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand, pick, angleDiff } from '../core/math.js';

// Mutter Fäulnis – Boss des Sporenschlunds (Stufe 32).
// Riesige Brutmutter, kriecht nur langsam. Angriffe (jeder mit Bodenwarnung):
//   Rankenhieb     Linie zum Helden: eine Dornenranke peitscht über den Boden
//   Rankenfeger    nah: Bogen vor ihr
//   Sporen-Salve   Fächer aus Giftsporen (Projektile, element 'poison'); Phase 3 doppelt
//   Sporenwolken   Säcke werden auf markierte Kreise geschleudert -> bleibende Giftfelder
//   Brut           speit Sporlinge (`sporeling`, höchstens 4 gleichzeitig)
//   Wurzelbruch    ab Phase 2: Arme in den Boden, mehrere Kreise -> Wurzeldornen brechen hervor
//   Platzende Säcke ab Phase 3: großer Kreis um sie, danach Giftfelder und Sporenring
// Phasen: 1 (> 66 %), 2 (66–33 %, „Die Wurzeln erwachen“), 3 (< 33 %, „Raserei der Brut“:
// schneller, Giftring schnürt die Arena ein – außerhalb frisst das Gift).
// Felder wie Nerith/Ignaroth: type, def, bossId, level, hp/maxHp, phase, engaged, hurtable, adds, home;
// engage(world), update, die, renderEmissive.

const GREEN = ['#f4ffd8', '#b4f478', '#5ad040', '#22882e'];
const VIOLET = ['#fff2ff', '#dea8ff', '#a458f4', '#6224b0'];
const RAGE = ['#ffffff', '#ffa8ee', '#ec48c8', '#9a1a88'];
const SLIME = ['#162a12', '#24421a', '#3c6426'];
const GREEN_RGB = [110, 230, 80], VIOLET_RGB = [170, 90, 255], RAGE_RGB = [230, 80, 210];
const WARN_POISON = [170, 235, 60], WARN_ROOT = [255, 90, 60];

// Schaden (Magier-HP Stufe 32 ≈ 591): normal 8–12 %, groß 20–30 %
const DMG = { lash: 66, sweep: 60, bolt: 38, lob: 44, cloud: 17, root: 84, burst: 150, roar: 40, ring: 24 };

function hurtHero(world, owner, damage, dirX, dirY, knockback, heavy = false) {
  const h = world.hero;
  if (h.dead) return false;
  const hit = { damage: Math.round(damage * rand(0.9, 1.1)), dirX, dirY, knockback, source: owner, element: 'poison' };
  if (!h.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: owner, target: h, damage: hit.damage, crit: false, heavy, dirX, dirY, x: h.x, y: h.centerY, killed: h.dead, element: 'poison' });
  return true;
}

// Treffer in einer Bodenellipse (wie die Kreis-Warnung gezeichnet: Höhe 0,6)
function areaHit(world, owner, x, y, r, damage, knockback, heavy = true) {
  const h = world.hero;
  if (h.dead) return false;
  const dx = h.x - x, dy = (h.y - y) / 0.6, d = Math.hypot(dx, dy);
  if (d > r + h.hurtRadius * 0.5) return false;
  const l = d || 1;
  return hurtHero(world, owner, damage, dx / l, dy / l, knockback, heavy);
}

function puff(world, x, y, count, colors = GREEN, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), s = rand(8, 40) * power;
    world.particles.spawn({ x: x + rand(-3, 3), y: y + rand(-2, 2), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, drag: 3, rise: rand(6, 22), wobble: 14, life: rand(0.5, 1.1), colors, emissive: true, size: Math.random() < 0.35 ? 2 : 1, shrink: true });
  }
}

// ------------------------------------------------------------------ Projektile / Gefahren

// Giftspore: pulsierende Kugel mit Schweif. Nicht abwehrbar.
export class SporeBolt extends Entity {
  constructor(x, y, angle, speed, damage, owner, { delay = 0, curve = 0 } = {}) {
    super(x, y);
    Object.assign(this, { angle, speed, damage, owner, delay, curve });
    this.team = owner.team; this.z = 16; this.life = 3.2; this.t = 0;
    this.deflectable = false; this.stuck = false; this.element = 'poison';
  }
  update(dt, world) {
    this.t += dt;
    if (this.t < this.delay) return;
    this.life -= dt;
    if (this.life <= 0 || this.owner.dead) { this.#pop(world); return; }
    this.angle += this.curve * dt;
    const sp = this.speed * Math.min(1, 0.45 + (this.t - this.delay) * 3);
    const nx = this.x + Math.cos(this.angle) * sp * dt, ny = this.y + Math.sin(this.angle) * sp * dt;
    if (world.dungeon.isWall(Math.floor(nx / 16), Math.floor((ny - 4) / 16))) { this.#pop(world); return; }
    this.x = nx; this.y = ny;
    this.z = Math.max(6, this.z - dt * 10);
    if (Math.random() < dt * 22) world.particles.spawn({ x: this.x + rand(-1, 1), y: this.y, z: this.z, vx: 0, vy: 0, rise: rand(4, 10), wobble: 6, life: 0.4, colors: this.owner.enraged ? RAGE.slice(1) : GREEN.slice(1), emissive: true });
    const h = world.hero;
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.3)) < h.hurtRadius + 3) {
      if (hurtHero(world, this.owner, this.damage, Math.cos(this.angle), Math.sin(this.angle), 90)) this.#pop(world);
    }
  }
  #pop(world) {
    this.removed = true;
    puff(world, this.x, this.y - 2, 7, this.owner.enraged ? RAGE : GREEN, 0.8);
    world.decals.splat(this.x, this.y, SLIME, 3);
    world.bus.emit('arrowStuck', { x: this.x, y: this.y });
  }
  render(ctx, cx, cy) {
    if (this.t < this.delay) return;
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(Math.round(this.x - cx - 2), Math.round(this.y - cy), 5, 1);
  }
  renderEmissive(ctx, cx, cy) {
    if (this.t < this.delay) return;
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const c = this.owner.enraged ? RAGE : GREEN;
    for (let i = 1; i <= 5; i++) {
      ctx.globalAlpha = 0.7 - i * 0.12;
      ctx.fillStyle = i < 3 ? c[2] : c[3];
      ctx.fillRect(Math.round(x - Math.cos(this.angle) * i * 2), Math.round(y - Math.sin(this.angle) * i * 2 + Math.sin(this.t * 20 + i) * 0.6), 1, 1);
    }
    ctx.globalAlpha = 1;
    const p = Math.sin(this.t * 16) > 0;
    ctx.fillStyle = c[3]; ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = c[2]; ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = p ? c[0] : c[1]; ctx.fillRect(x, y - (p ? 1 : 0), 1, 1);
  }
}

// Bleibendes Giftfeld: wabernder Nebel, schadet in Takten.
export class ToxicCloud extends Entity {
  constructor(x, y, owner, { r = 26, duration = 9, damage = DMG.cloud, tick = 0.5, delay = 0 } = {}) {
    super(x, y);
    Object.assign(this, { owner, r, duration, damage, tick, delay });
    this.t = 0; this.cool = 0; this.sortOffset = -19400; this.seed = Math.random() * 100;
  }
  get alive() { return this.t >= this.delay; }
  update(dt, world) {
    this.t += dt;
    const life = this.t - this.delay;
    if (life >= this.duration || (this.owner.dead && life > 0.5 && !this.fading)) {
      if (this.owner.dead && !this.fading) { this.fading = true; this.duration = Math.min(this.duration, life + 1.2); }
      if (life >= this.duration) { this.removed = true; if (this.light) this.light.dead = true; return; }
    }
    if (!this.alive) return;
    if (!this.light) this.light = world.addLight(new Light({ x: this.x, y: this.y, radius: this.r * 2.2, color: this.owner.enraged ? RAGE_RGB : GREEN_RGB, intensity: 0.45, flicker: 0.2, ttl: this.duration, bloom: 0.1 }));
    if (Math.random() < dt * 9) {
      const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * this.r;
      world.particles.spawn({ x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr * 0.6, vx: rand(-4, 4), vy: 0, rise: rand(3, 10), wobble: 10, life: rand(0.8, 1.6), colors: this.owner.enraged ? RAGE.slice(1) : GREEN.slice(1), emissive: true, alpha: 0.8 });
    }
    this.cool -= dt;
    const h = world.hero;
    if (this.cool <= 0 && !h.dead && life < this.duration - 0.4 && Math.hypot(h.x - this.x, (h.y - this.y) / 0.6) < this.r) {
      if (hurtHero(world, this.owner, this.damage, 0, -1, 10)) this.cool = this.tick;
    }
  }
  renderEmissive(ctx, cx, cy) {
    if (!this.alive) return;
    const life = this.t - this.delay;
    const fade = Math.min(1, life * 3, (this.duration - life) * 1.2);
    if (fade <= 0) return;
    const c = this.owner.enraged ? ['#4a0a40', '#9a1a88', '#ec48c8', '#ffa8ee'] : ['#0e4a1c', '#22882e', '#5ad040', '#b4f478'];
    // Bodenschleier: ringförmige Schwaden, die langsam kreisen
    const n = Math.round(this.r * 3.2);
    for (let i = 0; i < n; i++) {
      const k = ((i * 0.618 + this.seed) % 1);
      const rr = Math.sqrt(k) * this.r * (0.92 + 0.08 * Math.sin(this.t * 2 + i));
      const a = i * 2.39996 + this.t * (0.4 + (i % 3) * 0.15) * (i % 2 ? 1 : -1);
      const x = Math.round(this.x - cx + Math.cos(a) * rr), y = Math.round(this.y - cy + Math.sin(a) * rr * 0.6);
      const edge = rr / this.r;
      const ci = edge > 0.85 ? 1 : (Math.sin(this.t * 3 + i) > 0.6 ? 3 : 2);
      ctx.globalAlpha = (0.55 - edge * 0.25) * fade;
      ctx.fillStyle = c[ci];
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
      // aufsteigende Schwaden
      if (i % 5 === 0) {
        const hgt = ((this.t * 6 + i * 3) % 10);
        ctx.globalAlpha = 0.45 * fade * (1 - hgt / 10);
        ctx.fillRect(x, y - Math.round(hgt), 1, 1);
      }
    }
    // Rand
    ctx.globalAlpha = 0.35 * fade;
    ctx.strokeStyle = c[2]; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(this.x - cx, this.y - cy, this.r, this.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// Geschleuderter Sporensack: fliegt im Bogen, platzt auf der Markierung und hinterlässt ein Giftfeld.
export class SporeLob extends Entity {
  constructor(x, y, z, tx, ty, owner, { flight = 1.0, r = 26, cloud = 9 } = {}) {
    super(x, y);
    Object.assign(this, { sx: x, sy: y, sz: z, tx, ty, owner, flight, r, cloud });
    this.t = 0; this.z = z; this.sortOffset = 4000;
  }
  update(dt, world) {
    this.t += dt;
    const k = Math.min(1, this.t / this.flight);
    this.x = this.sx + (this.tx - this.sx) * k;
    this.y = this.sy + (this.ty - this.sy) * k;
    this.z = this.sz * (1 - k) + Math.sin(k * Math.PI) * 60;
    if (Math.random() < 0.6) world.particles.spawn({ x: this.x, y: this.y, z: this.z, vx: 0, vy: 0, gravity: 120, life: 0.4, colors: this.owner.enraged ? RAGE.slice(1) : GREEN.slice(1), emissive: true });
    if (k >= 1) {
      this.removed = true;
      if (this.owner.dead) return;
      areaHit(world, this.owner, this.tx, this.ty, this.r, DMG.lob, 120, false);
      puff(world, this.tx, this.ty, 22, this.owner.enraged ? RAGE : GREEN, 1.4);
      world.particles.ring(this.tx, this.ty, 6, 18, this.owner.enraged ? RAGE : GREEN, 80);
      world.decals.splat(this.tx, this.ty, SLIME, 9);
      world.addLight(new Light({ x: this.tx, y: this.ty - 6, radius: 70, color: this.owner.enraged ? RAGE_RGB : GREEN_RGB, intensity: 0.9, ttl: 0.35, bloom: 0.5 }));
      world.session.camera?.shake(3);
      world.bus.emit('spellImpact', { x: this.tx, y: this.ty, element: 'poison', radius: this.r });
      this.owner.addHazard(world, new ToxicCloud(this.tx, this.ty, this.owner, { r: this.r, duration: this.cloud }));
    }
  }
  render(ctx, cx, cy) {
    const k = Math.min(1, this.t / this.flight);
    const s = Math.round(2 + k * 3);
    ctx.fillStyle = 'rgba(4,2,8,0.45)';
    ctx.fillRect(Math.round(this.x - cx - s), Math.round(this.y - cy), s * 2 + 1, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const c = this.owner.enraged ? RAGE : GREEN;
    const w = Math.sin(this.t * 14) > 0 ? 1 : 0;
    ctx.fillStyle = '#583656'; ctx.fillRect(x - 3, y - 2, 7, 5); ctx.fillRect(x - 2, y - 3, 5, 7);
    ctx.fillStyle = c[3]; ctx.fillRect(x - 2, y - 2, 5 + w, 5);
    ctx.fillStyle = c[2]; ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = c[0]; ctx.fillRect(x - 1, y - 2, 1, 1);
  }
}

// Peitschende Dornenranke: schießt vom Arm aus die markierte Linie entlang und zieht sich zurück.
export class VineLash extends Entity {
  constructor(x, y, angle, len, owner, { width = 18, damage = DMG.lash } = {}) {
    super(x, y);
    Object.assign(this, { angle, len, owner, width, damage });
    this.t = 0; this.hitDone = false; this.sortOffset = -19000;
    this.cos = Math.cos(angle); this.sin = Math.sin(angle);
    this.out = 0.12; this.hold = 0.22; this.back = 0.3;
  }
  get ext() {
    const t = this.t;
    if (t < this.out) { const k = t / this.out; return 1 - (1 - k) * (1 - k); }
    if (t < this.out + this.hold) return 1;
    const k = (t - this.out - this.hold) / this.back;
    return Math.max(0, 1 - k * k);
  }
  #pt(s, k = 0) { return { x: this.x + this.cos * s - this.sin * k, y: this.y + (this.sin * s + this.cos * k) * 0.75 }; }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead || this.t > this.out + this.hold + this.back) { this.removed = true; return; }
    const L = this.len * this.ext;
    if (this.t < this.out + 0.03 && Math.random() < 0.9) {
      const p = this.#pt(L); world.particles.dust(p.x, p.y, 2, '#2c2618');
    }
    if (!this.impacted && this.t >= this.out) {
      this.impacted = true;
      const p = this.#pt(this.len);
      world.particles.dust(p.x, p.y, 10, '#2c2618');
      for (let s = 12; s < this.len; s += 14) { const q = this.#pt(s, rand(-3, 3)); world.particles.dust(q.x, q.y, 2, '#1a1610'); }
      world.session.camera?.shake(5);
      world.session.hitstop?.(0.04);
    }
    const h = world.hero;
    if (this.hitDone || h.dead || this.t > this.out + this.hold) return;
    const rx = h.x - this.x, ry = (h.y - this.y) / 0.75;
    const along = rx * this.cos + ry * this.sin, perp = -rx * this.sin + ry * this.cos;
    if (along > 0 && along < L + 4 && Math.abs(perp) < this.width / 2 + 3) {
      if (hurtHero(world, this.owner, this.damage, this.cos, this.sin, 260, true)) { this.hitDone = true; world.particles.sparks(h.x, h.centerY, this.angle, 8, ['#ffffff', '#d4caac', '#847450']); }
      else if (h.dodgedTimer > 0) this.hitDone = true;
    }
  }
  // Ranke liegt auf dem Boden (Lit-Pass, wird beleuchtet), Dornen und Knoten zusätzlich im Emissive-Pass
  render(ctx, cx, cy) {
    const L = this.len * this.ext;
    if (L < 2) return;
    const cols = ['#1a1610', '#3a3220', '#5a4e30', '#7e6e44', '#a8966a'];
    for (let s = 0; s <= L; s += 1) {
      const f = s / this.len;
      const wob = Math.sin(s * 0.22 - this.t * 30) * 2.2 * (1 - f * 0.5) * (this.t < this.out + 0.1 ? 1 : 0.4);
      const w = 5.5 - f * 3 + (Math.abs((s % 16) - 8) < 1.5 ? 1 : 0);
      for (let k = -w; k <= w; k += 1) {
        const p = this.#pt(s, k + wob);
        const e = (k + w) / (2 * w);
        ctx.fillStyle = e < 0.2 ? cols[4] : e < 0.45 ? cols[3] : e < 0.8 ? cols[2] : cols[0];
        ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy - 2), 1, 1);
      }
      if (s % 7 === 3) {
        const side = (s % 14 === 3) ? 1 : -1, p = this.#pt(s, (w + 2) * side + wob);
        ctx.fillStyle = '#d4caac'; ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy - 2), 1, 1);
      }
    }
    // Wurzelkralle an der Spitze
    const tip = this.#pt(L);
    ctx.fillStyle = '#847450';
    for (let i = -1; i <= 1; i++) { const q = this.#pt(L + 4, i * 3); ctx.fillRect(Math.round(q.x - cx), Math.round(q.y - cy - 2), 1, 1); }
    ctx.fillStyle = '#443a24'; ctx.fillRect(Math.round(tip.x - cx) - 1, Math.round(tip.y - cy) - 3, 3, 3);
  }
  renderEmissive(ctx, cx, cy) {
    const L = this.len * this.ext;
    // leuchtende Ader entlang der Ranke (liest sich auch im Dunkeln)
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = this.owner.enraged ? '#22882e' : '#6224b0';
    for (let s = 2; s < L; s += 1) {
      const f = s / this.len;
      const wob = Math.sin(s * 0.22 - this.t * 30) * 2.2 * (1 - f * 0.5) * (this.t < this.out + 0.1 ? 1 : 0.4);
      const p = this.#pt(s, wob - 1);
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy - 3), 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.owner.enraged ? '#5ad040' : '#a458f4';
    for (let s = 10; s < L; s += 16) { const p = this.#pt(s); ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy - 3), 1, 1); }
    if (this.t < this.out + 0.08) {
      const p = this.#pt(L);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(p.x - cx) - 1, Math.round(p.y - cy) - 3, 2, 2);
    }
  }
}

// Wurzeldornen: brechen nach der Warnzeit aus dem Boden, ragen kurz auf, versinken wieder.
export class RootSpikes extends Entity {
  constructor(x, y, owner, { r = 22, delay = 1.1, damage = DMG.root } = {}) {
    super(x, y);
    Object.assign(this, { owner, r, delay, damage });
    this.t = 0; this.burst = false; this.seed = Math.floor(Math.random() * 1000);
    this.spikes = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), rr = i === 0 ? 0 : rand(0.35, 0.85) * r;
      this.spikes.push({ dx: Math.cos(a) * rr, dy: Math.sin(a) * rr * 0.6, h: i === 0 ? rand(30, 36) : rand(14, 24), lean: rand(-0.3, 0.3) + Math.cos(a) * 0.3 * (rr / r), w: i === 0 ? 6 : rand(3.5, 4.8) });
    }
    this.spikes.sort((a, b) => a.dy - b.dy);
  }
  get sortY() { return this.y + 2; }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead && !this.burst) { this.removed = true; return; }
    if (!this.burst && this.t < this.delay && Math.random() < dt * 14) world.particles.dust(this.x + rand(-this.r, this.r) * 0.7, this.y + rand(-4, 4), 1, '#2c2618');
    if (!this.burst && this.t >= this.delay) {
      this.burst = true;
      areaHit(world, this.owner, this.x, this.y, this.r, this.damage, 200);
      world.particles.dust(this.x, this.y, 16, '#2c2618');
      world.particles.bones(this.x, this.y, 4, -Math.PI / 2, 8, ['#1a1610', '#2c2618', '#443a24', '#605234']);
      puff(world, this.x, this.y - 4, 8, this.owner.enraged ? RAGE : VIOLET, 1);
      world.decals.splat(this.x, this.y, ['#140e0a', '#1e160e', '#2a2014'], 10);
      world.addLight(new Light({ x: this.x, y: this.y - 12, radius: 60, color: VIOLET_RGB, intensity: 0.8, ttl: 0.3, bloom: 0.4 }));
      world.session.camera?.shake(4);
      world.bus.emit('spellImpact', { x: this.x, y: this.y, element: 'nature', radius: this.r });
    }
    if (this.t >= this.delay + 0.95) this.removed = true;
  }
  #grow() {
    const k = this.t - this.delay;
    if (k < 0) return 0;
    if (k < 0.1) return 1 - (1 - k / 0.1) ** 3;
    if (k < 0.55) return 1;
    return Math.max(0, 1 - (k - 0.55) / 0.4);
  }
  render(ctx, cx, cy) {
    const g = this.#grow();
    if (g <= 0) return;
    const cols = ['#0c0a08', '#1a1610', '#2c2618', '#443a24', '#605234', '#847450'];
    for (const s of this.spikes) {
      const bx = this.x + s.dx - cx, by = this.y + s.dy - cy;
      const H = s.h * g;
      for (let y = 0; y < H; y++) {
        const f = y / s.h;
        const w = s.w * (1 - f) + 0.6;
        const x0 = bx + s.lean * y + Math.sin(f * 5 + s.dx) * 0.8;
        for (let k = -w; k <= w; k += 1) {
          const e = (k + w) / (2 * w);
          ctx.fillStyle = e < 0.25 ? cols[5] : e < 0.5 ? cols[4] : e < 0.8 ? cols[3] : cols[1];
          if (f > 0.82) ctx.fillStyle = e < 0.5 ? '#d4caac' : '#a0947a';
          ctx.fillRect(Math.round(x0 + k), Math.round(by - y), 1, 1);
        }
        // Seitentriebe
        if (Math.abs(y - s.h * 0.45) < 0.5 && H > s.h * 0.5) {
          ctx.fillStyle = cols[4];
          ctx.fillRect(Math.round(x0 + w + 1), Math.round(by - y - 1), 2, 1); ctx.fillRect(Math.round(x0 + w + 3), Math.round(by - y - 2), 1, 1);
        }
      }
      // aufgeworfene Erde
      ctx.fillStyle = cols[2]; ctx.fillRect(Math.round(bx - s.w - 2), Math.round(by - 1), Math.round(s.w * 2 + 5), 2);
      ctx.fillStyle = cols[4]; ctx.fillRect(Math.round(bx - s.w - 1), Math.round(by - 1), 2, 1);
    }
  }
  renderEmissive(ctx, cx, cy) {
    const g = this.#grow();
    if (!this.burst) {
      // Leuchtende Risse vor dem Ausbruch
      const k = Math.min(1, this.t / this.delay);
      ctx.fillStyle = this.owner.enraged ? '#5ad040' : '#a458f4';
      for (let i = 0; i < 12; i++) {
        const a = i * 0.52 + this.seed, rr = (0.2 + ((i * 0.37) % 0.8)) * this.r * k;
        ctx.globalAlpha = 0.4 + 0.5 * k;
        ctx.fillRect(Math.round(this.x - cx + Math.cos(a) * rr), Math.round(this.y - cy + Math.sin(a) * rr * 0.6), 1, 1);
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (g <= 0) return;
    ctx.fillStyle = this.owner.enraged ? '#b4f478' : '#dea8ff';
    for (const s of this.spikes) {
      const H = s.h * g * 0.55;
      ctx.fillRect(Math.round(this.x + s.dx + s.lean * H - cx), Math.round(this.y + s.dy - H - cy), 1, 1);
    }
  }
}

// Giftring (Phase 3): Schwaden kriechen vom Arenarand nach innen. Wer außerhalb steht, nimmt Schaden.
export class ToxicRing extends Entity {
  constructor(cx, cy, owner, { rx0, ry0, rx1, ry1, shrink = 22, damage = DMG.ring, tick = 0.7 }) {
    super(cx, cy);
    Object.assign(this, { owner, rx0, ry0, rx1, ry1, shrink, damage, tick });
    this.t = 0; this.cool = 0.8; this.sortOffset = -19300;
  }
  get k() { const k = Math.min(1, this.t / this.shrink); return k * k * (3 - 2 * k); }
  get rx() { return this.rx0 + (this.rx1 - this.rx0) * this.k; }
  get ry() { return this.ry0 + (this.ry1 - this.ry0) * this.k; }
  outside(x, y) { return ((x - this.x) / this.rx) ** 2 + ((y - this.y) / this.ry) ** 2 > 1; }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) {
      this.fade = (this.fade ?? 1) - dt * 0.8;
      if (this.fade <= 0) this.removed = true;
      return;
    }
    // Schwaden am Rand
    for (let i = 0; i < 3; i++) {
      const a = rand(0, Math.PI * 2);
      const x = this.x + Math.cos(a) * (this.rx + rand(0, 10)), y = this.y + Math.sin(a) * (this.ry + rand(0, 6));
      world.particles.spawn({ x, y, vx: -Math.cos(a) * rand(2, 8), vy: -Math.sin(a) * rand(1, 5), rise: rand(2, 10), wobble: 10, life: rand(0.9, 1.6), colors: ['#b4f478', '#5ad040', '#22882e'], emissive: true, alpha: 0.7 });
    }
    this.cool -= dt;
    const h = world.hero;
    if (this.cool <= 0 && !h.dead && this.outside(h.x, h.y)) {
      const dx = this.x - h.x, dy = this.y - h.y, d = Math.hypot(dx, dy) || 1;
      if (hurtHero(world, this.owner, this.damage, dx / d, dy / d, 40)) {
        this.cool = this.tick;
        puff(world, h.x, h.y - 6, 6, GREEN, 0.8);
      }
    }
  }
  renderEmissive(ctx, cx, cy) {
    const fade = this.fade ?? 1;
    const W = 480, H = 270; // Sichtfläche in Weltpixeln (Obergrenze)
    const x = this.x - cx, y = this.y - cy;
    // grünlicher Schleier außerhalb (even-odd: alles außer der Ellipse)
    ctx.save();
    ctx.globalAlpha = 0.16 * fade * Math.min(1, this.t * 0.8);
    ctx.fillStyle = '#3c8a2a';
    ctx.beginPath(); ctx.rect(-10, -10, W + 20, H + 20); ctx.ellipse(x, y, this.rx, this.ry, 0, 0, Math.PI * 2); ctx.fill('evenodd');
    ctx.restore();
    // Rand: dichte, wabernde Nebelkante
    const n = Math.round((this.rx + this.ry) * 1.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = Math.sin(a * 9 + this.t * 2.2) * 2.5 + Math.sin(a * 23 - this.t * 3.1) * 1.5;
      const px = Math.round(x + Math.cos(a) * (this.rx + wob)), py = Math.round(y + Math.sin(a) * (this.ry + wob * 0.6));
      ctx.globalAlpha = (0.55 + 0.3 * Math.sin(this.t * 5 + i)) * fade;
      ctx.fillStyle = i % 3 === 0 ? '#b4f478' : '#5ad040';
      ctx.fillRect(px, py, 1, 1);
      ctx.globalAlpha = 0.3 * fade;
      ctx.fillStyle = '#22882e';
      ctx.fillRect(Math.round(px + Math.cos(a) * 3), Math.round(py + Math.sin(a) * 2), 2, 1);
      if (i % 4 === 0) { const hh = (this.t * 7 + i) % 8; ctx.globalAlpha = 0.4 * fade * (1 - hh / 8); ctx.fillStyle = '#b4f478'; ctx.fillRect(px, Math.round(py - hh), 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ Boss

export class RotMother extends Actor {
  constructor(x, y, assets) {
    const def = { ...ENEMY_TYPES.rot_mother, ...(DEFS.rot_mother ?? {}) };
    super(x, y, assets.sprites[def.sprites]);
    this.type = 'rot_mother';
    this.def = def;
    this.bossId = def.bossId;
    this.team = 'enemy';
    this.level = def.level;
    this.maxHp = this.hp = def.hp;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = def.bodyHeight;
    this.shadowW = def.shadowW; this.material = def.material;
    this.assets = assets;
    this.home = { x, y };
    this.facing = -1;
    this.phase = 1;
    this.engaged = false;
    this.hurtable = false;
    this.cooldown = 1.5;
    this.aim = Math.PI;
    this.adds = [];
    this.hazards = [];
    this.pending = [];
    this.timers = { lob: 2.5, brood: 7, roots: 1, burst: 3, spit: 0 };
    this.last = '';
    this.hurtAnim = 0;
    this.animSpeed = 1;
    this.lastFrame = null;
    this.ring = null;
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
    puff(world, this.x, this.y - 20, 30, GREEN, 1.4);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -46, radius: 110, color: GREEN_RGB, intensity: 0.55, flicker: 0.12, bloom: 0.3 }));
    this.gillLight = world.addLight(new Light({ follow: this, offsetY: -84, radius: 70, color: VIOLET_RGB, intensity: 0.35, flicker: 0.1, bloom: 0.2 }));
  }

  addHazard(world, h) {
    // höchstens 9 Giftfelder gleichzeitig: älteste verblassen
    if (h instanceof ToxicCloud) {
      const clouds = this.hazards.filter((z) => z instanceof ToxicCloud && !z.removed);
      if (clouds.length >= 9) { const o = clouds[0]; o.duration = Math.min(o.duration, o.t - o.delay + 0.6); }
    }
    world.spawn(h);
    this.hazards.push(h);
    return h;
  }

  update(dt, world) {
    this.tickTimers(dt);
    if (this.animSpeed !== 1) this.animator.time += dt * (this.animSpeed - 1);
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
    this.#frameEvents(world);
    this.#checkPhase(world);
    this.#ambient(dt, world);

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        if (Math.random() < dt * 2) puff(world, this.x + rand(-30, 20), this.y - rand(10, 40), 1, GREEN, 0.3);
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime < 1.2 && Math.random() < dt * 30) world.particles.dust(this.x + rand(-40, 40), this.y + rand(-4, 4), 1, '#2c2618');
        if (this.stateTime > 2.0) { this.hurtable = true; this.setState('chase'); }
        break;

      case 'roar':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 30) puff(world, this.x + rand(-30, 30), this.y - rand(10, 70), 1, this.enraged ? RAGE : GREEN, 0.6);
        if (this.stateTime > 1.5) { this.hurtable = true; this.cooldown = 0.4; this.setState('chase'); }
        break;

      case 'chase': {
        this.animSpeed = 1;
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); break; }
        this.cooldown -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        const spd = this.def.speed * [1, 1.15, 1.45][this.phase - 1];
        const want = dist > 96 ? spd : 0;
        const k = 1 - Math.exp(-dt * 3);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        if (Math.abs(dx) > 8) this.facing = Math.sign(dx);
        if (this.hurtAnim > 0) this.animator.play('hurt');
        else this.animator.play(want > 1 ? 'walk' : 'idle');
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'lashWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < this.windup * 0.45) {
          this.#track(world, dt, 2.2);
          if (this.lashTele) { this.lashTele.angle = this.aim; this.lashTele.len = this.lashLen = this.#rayLength(world, this.aim, 150); }
        }
        if (this.stateTime >= this.windup) this.#lash(world);
        break;

      case 'sweepWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.windup) this.#sweep(world);
        break;

      case 'castWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.castKind === 'spit') this.#track(world, dt, 2.5);
        if (Math.random() < dt * 30) {
          const m = this.#meta(this.castKind === 'lob' || this.castKind === 'burst' ? 'sac' : 'mouth');
          world.particles.spawn({ x: m.x + rand(-5, 5), y: m.y + rand(-5, 5), vx: 0, vy: 0, rise: rand(-18, -6), wobble: 8, life: 0.4, colors: this.enraged ? RAGE : GREEN, emissive: true });
        }
        if (this.stateTime >= this.windup) this.#release(world);
        break;

      case 'rooted':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 20) world.particles.dust(this.x + rand(-40, 40), this.y + rand(-6, 6), 1, '#2c2618');
        if (this.stateTime >= this.recover) { this.setState('chase'); this.cooldown = this.enraged ? 0.4 : 0.8; }
        break;

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) this.setState('chase');
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.stateTime < 3.5 && Math.random() < dt * (14 - this.stateTime * 3.5)) {
          world.particles.spawn({ x: this.x + rand(-40, 40), y: this.y - rand(0, 40), vx: rand(-4, 4), vy: 0, rise: rand(6, 16), wobble: 12, life: rand(1, 2), colors: GREEN.slice(1), emissive: true, alpha: 0.8 });
        }
        break;
    }
    this.integrate(dt, world);
  }

  // ---------------------------------------------------------------- Phasen

  #checkPhase(world) {
    if (this.dead || !this.engaged || this.state === 'intro' || this.state === 'roar') return;
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f <= 0.66) {
      this.phase = 2;
      world.bus.emit(EV.UI_BANNER, { title: 'Die Wurzeln erwachen', sub: 'Der Boden selbst gehorcht Mutter Fäulnis', color: '#c080ff' });
      this.#roar(world);
      this.timers.roots = 2.2; this.timers.brood = Math.min(this.timers.brood, 4);
      if (this.gillLight) this.gillLight.intensity = 0.55;
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 2 });
    } else if (this.phase === 2 && f <= 0.33) {
      this.phase = 3;
      world.bus.emit(EV.UI_BANNER, { title: 'Raserei der Brut', sub: 'Giftschwaden schnüren den Schlund ein', color: '#9ae060' });
      this.#roar(world);
      this.timers.burst = 3.5; this.timers.brood = Math.min(this.timers.brood, 6);
      if (this.coreLight) { this.coreLight.color = RAGE_RGB; this.coreLight.intensity = 0.7; this.coreLight.radius = 125; }
      if (this.gillLight) { this.gillLight.color = GREEN_RGB; this.gillLight.intensity = 0.5; }
      this.pending.push({ t: 1.2, fn: (w) => this.#startRing(w) });
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 3 });
    }
  }

  #roar(world) {
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    if (this.lashTele) this.lashTele.removed = true;
    this.hurtable = false;
    this.animSpeed = 1;
    this.setState('roar');
    this.animator.play('roar', true);
    world.session.slowmo?.(0.5, 0.5);
    this.pending.push({ t: 0.4, fn: () => {
      world.addEffect(new DamageWave(this.x, this.y, this, { maxR: 140, duration: 0.9, damage: DMG.roar, color: this.enraged ? RAGE_RGB : VIOLET_RGB }));
    } });
  }

  #startRing(world) {
    if (this.dead || this.ring) return;
    const A = world.arena;
    let cx = this.home.x, cy = this.home.y, rx0 = 190, ry0 = 130;
    if (A) { cx = (A.x0 + A.x1) / 2; cy = (A.y0 + A.y1) / 2; rx0 = (A.x1 - A.x0) / 2 + 14; ry0 = (A.y1 - A.y0) / 2 + 12; }
    this.ring = this.addHazard(world, new ToxicRing(cx, cy, this, { rx0, ry0, rx1: Math.max(72, rx0 * 0.45), ry1: Math.max(50, ry0 * 0.5), shrink: 24 }));
    world.bus.emit('bossRing', { bossId: this.bossId });
  }

  // ---------------------------------------------------------------- Angriffswahl

  #chooseAttack(world, dist) {
    const hero = world.hero;
    this.aim = Math.atan2(hero.y - this.y, hero.x - this.x);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
    const T = this.timers, P = this.phase, q = this.quick;
    if (T.brood <= 0 && this.adds.length < 4) {
      T.brood = rand(16, 20) * (P >= 3 ? 0.8 : 1);
      return this.#beginCast(world, 'brood', 'broodWindup', 0.8 * q);
    }
    if (P >= 3 && T.burst <= 0) {
      T.burst = rand(13, 16);
      return this.#beginBurst(world);
    }
    const opts = [];
    const add = (id, w) => { if (w > 0) opts.push([id, id === this.last ? w * 0.25 : w]); };
    if (dist < 62) { add('sweep', 3); add('lash', 1); if (T.spit <= 0) add('spit', 0.6); }
    else {
      if (dist < 170) add('lash', 2.5);
      if (T.spit <= 0) add('spit', 2.2);
      if (T.lob <= 0) add('lob', 2);
      if (P >= 2 && T.roots <= 0) add('roots', 2.6);
    }
    if (P >= 2 && T.roots <= 0 && dist < 62) add('roots', 1);
    if (!opts.length) { this.cooldown = 0.3; return; }
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), choice = opts[0][0];
    for (const [id, w] of opts) { r -= w; if (r <= 0) { choice = id; break; } }
    this.last = choice;
    switch (choice) {
      case 'sweep': {
        const w = 0.75 * q;
        world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'arc', r: 68, angle: this.aim, arc: 2.3, duration: w, follow: this }));
        this.sweepAim = this.aim;
        return this.#begin(world, 'sweepWindup', 'lashWindup', w);
      }
      case 'lash': {
        const w = 0.8 * q;
        this.lashLen = this.#rayLength(world, this.aim, 150);
        this.lashTele = world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: this.aim, len: this.lashLen, width: 20, duration: w, color: WARN_ROOT }));
        return this.#begin(world, 'lashWindup', 'lashWindup', w);
      }
      case 'spit': T.spit = rand(3.5, 5) * q; return this.#beginCast(world, 'spit', 'spitWindup', 0.75 * q);
      case 'lob': T.lob = rand(8, 11) * q; return this.#beginCast(world, 'lob', 'puffWindup', 0.75 * q);
      case 'roots': T.roots = rand(9, 12) * q; return this.#beginRoots(world);
    }
  }

  #begin(world, state, anim, windup) {
    this.setState(state);
    this.animator.play(anim, true);
    this.windup = windup;
    const a = this.animator.current;
    this.animSpeed = a ? Math.max(0.6, Math.min(1.8, a.duration / windup)) : 1;
    this.cooldown = (this.enraged ? 0.35 : 0.8) + rand(0, 0.45);
    world.bus.emit('telegraph', { actor: this, attack: state });
  }

  #beginCast(world, kind, anim, windup) {
    this.castKind = kind;
    if (kind === 'spit') {
      const n = this.phase >= 3 ? 7 : 5, spread = 0.95;
      for (let i = 0; i < n; i++) {
        const a = this.aim - spread / 2 + (spread * i) / (n - 1);
        world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'line', angle: a, len: 150, width: 5, duration: windup, color: WARN_POISON }));
      }
    } else if (kind === 'lob') {
      // Ziele sofort markieren: eines auf den Helden (vorausgesagt), die übrigen um ihn herum
      const h = world.hero, n = [3, 4, 5][this.phase - 1];
      this.lobTargets = [];
      for (let i = 0; i < n; i++) {
        let tx, ty;
        if (i === 0) { tx = h.x + (h.vx ?? 0) * 0.4; ty = h.y + (h.vy ?? 0) * 0.4; }
        else { const a = rand(0, Math.PI * 2), r = rand(40, 95); tx = h.x + Math.cos(a) * r; ty = h.y + Math.sin(a) * r * 0.65; }
        const A = world.arena;
        if (A) { tx = Math.max(A.x0 + 18, Math.min(A.x1 - 18, tx)); ty = Math.max(A.y0 + 14, Math.min(A.y1 - 10, ty)); }
        const p = world.dungeon.nearestFree(tx, ty);
        const flight = 0.85 + i * 0.12;
        this.lobTargets.push({ x: p.x, y: p.y, flight });
        world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 26, duration: windup + flight, color: WARN_POISON }));
      }
    } else if (kind === 'brood') {
      this.broodSpots = [];
      const n = Math.min(this.phase >= 3 ? 3 : 2, 4 - this.adds.length);
      for (let i = 0; i < n; i++) {
        const a = this.aim + (i - (n - 1) / 2) * 0.7;
        const p = world.dungeon.nearestFree(this.x + Math.cos(a) * 46, this.y + Math.sin(a) * 30);
        this.broodSpots.push(p);
      }
    }
    this.#begin(world, 'castWindup', anim, windup);
    world.bus.emit('cast', { actor: this, element: 'poison' });
  }

  #beginRoots(world) {
    const q = this.quick;
    const h = world.hero;
    const n = this.phase >= 3 ? 7 : 5;
    const wind = 0.7 * q;
    const spots = [];
    const lead = { x: h.x + (h.vx ?? 0) * 0.3, y: h.y + (h.vy ?? 0) * 0.3 };
    for (let i = 0; i < n; i++) {
      let tx, ty;
      if (i === 0) { tx = lead.x; ty = lead.y; }
      else if (i < 3) { const a = rand(0, Math.PI * 2); tx = h.x + Math.cos(a) * rand(30, 50); ty = h.y + Math.sin(a) * rand(20, 32); }
      else { const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(50, 110); tx = this.x + Math.cos(a) * r; ty = this.y + Math.sin(a) * r * 0.6; }
      const A = world.arena;
      if (A) { tx = Math.max(A.x0 + 14, Math.min(A.x1 - 14, tx)); ty = Math.max(A.y0 + 12, Math.min(A.y1 - 8, ty)); }
      spots.push(world.dungeon.nearestFree(tx, ty));
    }
    spots.forEach((p, i) => {
      const delay = wind + 0.45 + i * 0.14 + (i === 0 ? 0 : 0.1);
      world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 22, duration: delay, color: WARN_ROOT }));
      this.addHazard(world, new RootSpikes(p.x, p.y, this, { r: 22, delay }));
    });
    this.castKind = 'roots';
    this.#begin(world, 'castWindup', 'plungeWindup', wind);
    world.bus.emit('bossRoots', { bossId: this.bossId, count: n });
  }

  #beginBurst(world) {
    const w = 1.2 * this.quick;
    this.castKind = 'burst';
    world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'circle', r: 76, duration: w, follow: this, color: [255, 60, 90] }));
    this.#begin(world, 'castWindup', 'burstWindup', w);
    world.bus.emit('cast', { actor: this, element: 'poison' });
  }

  // Blick (aim) dem Helden nachführen, höchstens rate rad/s
  #track(world, dt, rate) {
    const h = world.hero;
    const want = Math.atan2(h.y - this.y, h.x - this.x);
    const d = angleDiff(this.aim, want);
    this.aim += Math.max(-rate * dt, Math.min(rate * dt, d));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  // ---------------------------------------------------------------- Ausführung

  #lash(world) {
    this.animSpeed = 1;
    this.setState('strike'); this.recover = this.enraged ? 0.45 : 0.7;
    this.animator.play('lash', true);
    if (this.lashTele) { this.lashTele.removed = true; this.lashTele = null; }
    const len = this.lashLen ?? 130;
    world.spawn(new VineLash(this.x + Math.cos(this.aim) * 14, this.y + Math.sin(this.aim) * 8, this.aim, len - 14, this, { width: 20 }));
    world.bus.emit('enemySwing', { actor: this, heavy: true });
    // Phase 3: zweite Ranke leicht versetzt
    if (this.enraged) this.pending.push({ t: 0.35, fn: (w) => {
      if (this.dead) return;
      const a = this.aim + (Math.random() < 0.5 ? -0.45 : 0.45);
      const l2 = this.#rayLength(w, a, 140);
      w.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: a, len: l2, width: 18, duration: 0.45, color: WARN_ROOT }));
      this.pending.push({ t: 0.45, fn: (w2) => { if (!this.dead) w2.spawn(new VineLash(this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 8, a, l2 - 14, this, { width: 18 })); } });
    } });
  }

  #sweep(world) {
    this.animSpeed = 1;
    this.setState('strike'); this.recover = this.enraged ? 0.5 : 0.75;
    this.animator.play('lash', true);
    const a = this.sweepAim;
    world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 10, r: 68, angle: a, arc: 2.3, damage: DMG.sweep, knockback: 250, heavy: true, ttl: 0.14 });
    for (let i = 0; i < 9; i++) {
      const b = a - 1.1 + i * 0.28;
      world.particles.dust(this.x + Math.cos(b) * 48, this.y + Math.sin(b) * 28, 2, '#2c2618');
    }
    world.session.camera?.shake(5);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  #release(world) {
    this.animSpeed = 1;
    const kind = this.castKind;
    this.setState('strike'); this.recover = this.enraged ? 0.45 : 0.65;
    const col = this.enraged ? RAGE_RGB : GREEN_RGB;
    if (kind === 'spit') {
      this.animator.play('spit', true);
      const m = this.#meta('mouth');
      const n = this.phase >= 3 ? 7 : 5, spread = 0.95;
      const fire = (off, delay) => {
        for (let i = 0; i < n; i++) {
          const a = this.aim - spread / 2 + (spread * i) / (n - 1) + off;
          const b = new SporeBolt(this.x + Math.cos(a) * 18, this.y + Math.sin(a) * 10, a, 125, DMG.bolt, this, { delay });
          b.z = Math.max(8, this.y - m.y);
          world.addProjectile(b);
        }
      };
      fire(0, 0);
      if (this.phase >= 3) fire(spread / (n - 1) / 2, 0.3);
      world.addLight(new Light({ x: m.x, y: m.y, radius: 70, color: col, intensity: 1, ttl: 0.25, bloom: 0.6 }));
      world.bus.emit('shoot', { actor: this });
      return;
    }
    if (kind === 'lob') {
      this.animator.play('puff', true);
      const s = this.#meta('sac');
      for (const t of this.lobTargets ?? []) {
        world.spawn(new SporeLob(s.x, this.y, this.y - s.y, t.x, t.y, this, { flight: t.flight, r: 26, cloud: this.enraged ? 12 : 9 }));
      }
      puff(world, s.x, s.y, 16, this.enraged ? RAGE : GREEN, 1.2);
      world.addLight(new Light({ x: s.x, y: s.y, radius: 80, color: col, intensity: 0.9, ttl: 0.3, bloom: 0.6 }));
      world.bus.emit('bossSporeLob', { bossId: this.bossId, count: this.lobTargets?.length ?? 0 });
      return;
    }
    if (kind === 'brood') {
      this.animator.play('brood', true);
      this.recover = 0.8;
      const m = this.#meta('mouth');
      puff(world, m.x, m.y, 14, GREEN, 1);
      for (const p of this.broodSpots ?? []) {
        if (this.adds.length >= 4) break;
        world.decals.splat(p.x, p.y, SLIME, 7);
        const marker = new SpawnMarker(p.x, p.y, 0.55, () => {
          if (this.dead || this.adds.length >= 4) return;
          const type = this.#addType(world);
          const e = world.spawnEnemy(type, p.x, p.y, { respawned: true, home: { ...this.home } });
          e.aggroed = true; e.summoned = true; e.xpOverride = 18;
          this.adds.push(e);
          puff(world, p.x, p.y, 10, GREEN, 0.9);
        });
        world.spawn(marker);
        this.adds.push(marker); // Platz reservieren, bis der Sporling schlüpft
        const clear = () => { this.adds = this.adds.filter((a) => a !== marker); };
        this.pending.push({ t: 0.6, fn: clear });
      }
      world.bus.emit('bossSummon', { bossId: this.bossId, count: this.broodSpots?.length ?? 0 });
      return;
    }
    if (kind === 'roots') {
      this.animator.play('plunge', true);
      this.setState('rooted'); this.recover = this.enraged ? 0.9 : 1.15;
      return;
    }
    if (kind === 'burst') {
      this.animator.play('burst', true);
      this.recover = 0.9;
      areaHit(world, this, this.x, this.y, 76, DMG.burst, 320);
      const c = this.#meta('core');
      for (let i = 0; i < 6; i++) puff(world, c.x + rand(-26, 26), c.y + rand(-16, 16), 8, RAGE, 1.8);
      world.particles.ring(this.x, this.y - 6, 16, 40, RAGE, 170);
      world.addEffect(new Shockwave(this.x, this.y - 2, { radius: 84, color: '#ffa8ee', life: 0.5 }));
      world.addLight(new Light({ x: this.x, y: this.y - 30, radius: 160, color: RAGE_RGB, intensity: 1.3, ttl: 0.45, bloom: 0.9 }));
      world.decals.splat(this.x, this.y, SLIME, 22);
      world.session.hitstop?.(0.08);
      world.session.camera?.shake(10);
      // Giftfelder rund um sie und ein Sporenring
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rand(-0.4, 0.4), r = rand(58, 80);
        const p = world.dungeon.nearestFree(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.6);
        this.addHazard(world, new ToxicCloud(p.x, p.y, this, { r: 22, duration: 8, delay: 0.25 }));
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const b = new SporeBolt(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 12, a, 95, DMG.bolt, this, { delay: 0.2, curve: 0.35 });
        b.z = 24;
        world.addProjectile(b);
      }
      world.bus.emit('spellImpact', { x: this.x, y: this.y - 20, element: 'poison', radius: 76, big: true });
      world.bus.emit('bossBurst', { bossId: this.bossId });
    }
  }

  #addType(world) {
    try {
      if (ENEMY_TYPES.sporeling && world.assets.sprites.sporeling?.idle) return 'sporeling';
    } catch (e) { /* Grafik fehlt noch */ }
    return 'spider';
  }

  #rayLength(world, ang, max = 150) {
    let len = 0;
    while (len < max) {
      const x = this.x + Math.cos(ang) * (len + 14), y = this.y + Math.sin(ang) * 0.75 * (len + 14);
      if (world.dungeon.isWall(Math.floor(x / 16), Math.floor((y - 4) / 16))) break;
      len += 6;
    }
    return Math.max(40, len + 8);
  }

  // Position eines Rig-Punkts in Weltkoordinaten
  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 0, dy: -50 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
  }

  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'roar') {
      const h = this.#meta('mouth');
      if (this.dead) { puff(world, h.x, h.y, 26, GREEN, 1.4); world.session.camera?.shake(5); return; }
      world.session.camera?.shake(8);
      const cols = this.enraged ? RAGE : this.phase >= 2 ? VIOLET : GREEN;
      world.particles.ring(h.x, h.y, 10, 36, cols, 120);
      world.addEffect(new Shockwave(this.x, this.y - 4, { radius: 96, color: cols[1], life: 0.7 }));
      world.addLight(new Light({ x: h.x, y: h.y, radius: 160, color: this.enraged ? RAGE_RGB : GREEN_RGB, intensity: 1, ttl: 0.5, bloom: 0.7 }));
      for (let i = 0; i < 8; i++) puff(world, this.x + rand(-40, 40), this.y - rand(20, 70), 3, cols, 1.2);
      world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
      const hero = world.hero, dx = hero.x - this.x, dy = hero.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (!hero.dead && d < 120) { hero.kbx += (dx / d) * 250; hero.kby += (dy / d) * 250; }
    } else if (f.fx === 'cast') {
      const m = this.#meta(this.castKind === 'lob' ? 'sac' : 'mouth');
      world.particles.ring(m.x, m.y, 4, 14, this.enraged ? RAGE : GREEN, 70);
    } else if (f.fx === 'impact') {
      if (this.dead) {
        world.session.camera?.shake(6);
        world.particles.dust(this.x, this.y, 20, '#2c2618');
        puff(world, this.x, this.y - 20, 30, GREEN, 1.6);
        world.decals.splat(this.x + rand(-10, 10), this.y, SLIME, 16);
      } else if (this.animator.name === 'plunge') {
        const hl = this.#meta('hand'), hb = this.#meta('handB');
        for (const p of [hl, hb]) { world.particles.dust(p.x, this.y, 10, '#2c2618'); world.particles.bones(p.x, this.y, 2, -Math.PI / 2, 5, ['#1a1610', '#2c2618', '#443a24']); }
        world.addEffect(new Shockwave(this.x, this.y - 2, { radius: 60, color: '#a458f4', life: 0.5 }));
        world.session.camera?.shake(7);
        world.session.hitstop?.(0.05);
      } else if (this.animator.name === 'lash') {
        const hd = this.#meta('hand');
        world.particles.dust(hd.x, this.y + 2, 6, '#2c2618');
      }
    }
  }

  #ambient(dt, world) {
    if (this.state === 'sleep' || this.dead) return;
    const rate = [4, 6, 12][this.phase - 1];
    if (Math.random() < dt * rate) {
      const s = this.#meta('sac');
      world.particles.spawn({ x: s.x + rand(-30, 20) * this.facing, y: s.y + rand(-10, 30), vx: rand(-5, 5), vy: 0, rise: rand(6, 16), wobble: 12, life: rand(1, 2), colors: this.enraged ? RAGE.slice(1) : Math.random() < 0.3 ? VIOLET.slice(1) : GREEN.slice(1), emissive: true, alpha: 0.85 });
    }
    if (Math.random() < dt * 1.5) world.decals.splat(this.x + rand(-26, 26), this.y + rand(-3, 4), SLIME, 3);
  }

  onHurt(hit) {
    if (this.state === 'sleep') return;
    if (this.state === 'chase' && this.hurtAnim <= 0 && (hit?.heavy || Math.random() < 0.25)) { this.hurtAnim = 0.33; this.animator.play('hurt', true); }
    if (this.world && Math.random() < 0.4) puff(this.world, this.x + rand(-16, 16), this.y - rand(20, 50), 3, GREEN, 0.6);
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.animSpeed = 1;
    this.setState('dead');
    this.animator.play('death', true);
    const w = this.world;
    if (!w) return;
    for (const a of this.adds) { if (a.takeHit && !a.dead) a.takeHit({ damage: 99999, dirX: 0, dirY: 1, knockback: 0, source: this }); else a.removed = true; }
    for (const h of this.hazards) if (h instanceof RootSpikes || h instanceof SporeLob) h.removed = true;
    this.pending = [];
    if (this.lashTele) this.lashTele.removed = true;
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.owner.team !== 'enemy');
    w.projectiles.forEach((p) => { if (p.owner === this) p.removed = true; });
    w.session.slowmo?.(0.3, 1.6);
    w.session.camera?.shake(8);
    if (this.coreLight) this.coreLight.dead = true;
    if (this.gillLight) this.gillLight.dead = true;
    w.addLight(new Light({ x: this.x, y: this.y - 40, radius: 190, color: [170, 255, 130], intensity: 1.2, ttl: 1.4, bloom: 0.9 }));
    this.deathLight = w.addLight(new Light({ x: this.x, y: this.y - 14, radius: 90, color: GREEN_RGB, intensity: 0.6, flicker: 0.15, ttl: 6, bloom: 0.2 }));
    puff(w, this.x, this.y - 30, 50, GREEN, 1.8);
    puff(w, this.x, this.y - 40, 20, VIOLET, 1.4);
    w.bus.emit('spellImpact', { x: this.x, y: this.y - 20, element: 'poison', radius: 70, big: true });
  }

  renderEmissive(ctx, cx, cy) {
    super.renderEmissive(ctx, cx, cy);
    const f = this.animator.frame;
    const glow = this.enraged ? f.glowEnraged : f.glow;
    if (!glow) return;
    const fade = this.dead ? Math.max(0, 1 - Math.max(0, this.stateTime - 2.2) * 0.3) : 1;
    if (fade <= 0) return;
    const pulse = this.state === 'sleep' ? 0.5 : 0.84 + 0.16 * Math.sin(this.stateTime * (this.enraged ? 8 : 4));
    glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, alpha: pulse * fade });
    // Glanz am Maul / an der Ranke kurz vor dem Angriff
    if (/Windup$/.test(this.state) && this.stateTime > this.windup * 0.55) {
      const key = this.state === 'castWindup' ? (this.castKind === 'lob' || this.castKind === 'burst' ? 'sac' : this.castKind === 'roots' ? 'hand' : 'mouth') : 'hand';
      const t = this.#meta(key);
      const k = (this.stateTime - this.windup * 0.55) / (this.windup * 0.45);
      const r = Math.round(2 + k * 5), x = Math.round(t.x - cx), y = Math.round(t.y - cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = this.enraged ? '#ffa8ee' : '#b4f478';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }
}
