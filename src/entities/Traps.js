import { Entity } from './Entity.js';
import { Light } from '../gfx/Lighting.js';
import { Telegraph } from './Telegraph.js';
import { rand } from '../core/math.js';

// Dungeon-Fallen und Geheimnisse (Bereich B). Alles prozedural gezeichnet.
//   SpikeTrap  Druckplatte: Betreten -> Klicken + rotes Glimmen -> Dornen (trifft Held und Gegner)
//   JetTrap    Flammendüse: feste Taktung, Warnlinie am Boden, dann Flammenstrahl
//   Lever      Wandhebel: öffnet einen verborgenen Durchgang (world.openSecret)

const TRAP = { team: 'trap' };

function hurt(world, target, damage, dirX, dirY, kb, source) {
  if (target.dead || target.hurtable === false) return false;
  const hit = { damage: Math.round(damage * rand(0.9, 1.1)), dirX, dirY, knockback: kb, source };
  if (!target.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: source, target, damage: hit.damage, crit: false, heavy: false, dirX, dirY, x: target.x, y: target.centerY ?? target.y - 8, killed: target.dead });
  return true;
}

export class SpikeTrap extends Entity {
  constructor(x, y, { damage = 20 } = {}) {
    super(x, y);
    Object.assign(this, TRAP);
    this.damage = damage;
    this.state = 'idle'; this.t = 0; this.sortOffset = -19000; // Bodenschicht
    this.hitSet = new Set();
  }
  #inside(a) { return Math.abs(a.x - this.x) < 8 && Math.abs(a.y - this.y) < 6; }
  update(dt, world) {
    this.t += dt;
    const walkers = [world.hero, ...world.enemies.filter((e) => !e.dead && !e.boss && !e.def?.boss)];
    if (this.state === 'idle') {
      if (walkers.some((a) => !a.dead && this.#inside(a))) {
        this.state = 'armed'; this.t = 0;
        world.bus.emit('trapClick', { x: this.x, y: this.y });
      }
    } else if (this.state === 'armed' && this.t >= 0.42) {
      this.state = 'up'; this.t = 0; this.hitSet.clear();
      world.bus.emit('trapSpikes', { x: this.x, y: this.y });
      world.particles.dust(this.x, this.y, 5, '#4d4459');
      world.session.camera?.shake(1.5);
    } else if (this.state === 'up') {
      if (this.t < 0.25) for (const a of walkers) {
        if (this.hitSet.has(a) || !this.#inside(a)) continue;
        this.hitSet.add(a);
        hurt(world, a, a === world.hero ? this.damage : this.damage * 2.5, 0, 1, 70, this);
      }
      if (this.t >= 0.8) { this.state = 'down'; this.t = 0; }
    } else if (this.state === 'down' && this.t >= 1.3) { this.state = 'idle'; this.t = 0; }
  }
  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx) - 7, y = Math.round(this.y - cy) - 5;
    // Platte mit Fugen und Löchern
    ctx.fillStyle = 'rgba(8,6,12,0.55)'; ctx.fillRect(x - 1, y - 1, 16, 12);
    ctx.fillStyle = '#3a3444'; ctx.fillRect(x, y, 14, 10);
    ctx.fillStyle = '#4c4558'; ctx.fillRect(x, y, 14, 1);
    ctx.fillStyle = this.state === 'armed' ? '#2a2632' : '#302a3a';
    ctx.fillRect(x + 1, y + 1 + (this.state === 'armed' ? 1 : 0), 12, 8);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#120e18'; ctx.fillRect(x + 2 + i * 4, y + 2 + j * 4, 2, 2); }
    // Dornen
    if (this.state === 'up' || this.state === 'down') {
      const k = this.state === 'up' ? Math.min(1, this.t / 0.08) : Math.max(0, 1 - this.t / 0.25);
      const hgt = Math.round(k * 7);
      if (hgt > 0) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
        const sx = x + 2 + i * 4, sy = y + 3 + j * 4;
        ctx.fillStyle = '#6d7a94'; ctx.fillRect(sx, sy - hgt, 1, hgt);
        ctx.fillStyle = '#dfe7f2'; ctx.fillRect(sx + 1, sy - hgt, 1, hgt);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy - hgt - 1, 1, 1);
      }
    }
  }
  renderEmissive(ctx, cx, cy) {
    if (this.state !== 'armed') return;
    const x = Math.round(this.x - cx) - 7, y = Math.round(this.y - cy) - 5;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 40);
    ctx.fillStyle = '#ff5a3a';
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) ctx.fillRect(x + 2 + i * 4, y + 2 + j * 4, 2, 2);
    ctx.globalAlpha = 1;
  }
}

export class JetTrap extends Entity {
  constructor(x, y, { dir = [1, 0], damage = 14, period = 3.4, offset = 0, len = 58 } = {}) {
    super(x, y);
    Object.assign(this, TRAP);
    this.dir = dir; this.damage = damage; this.period = period; this.len = len;
    this.t = offset; this.phase = 'off'; this.cool = 0; this.sortOffset = -18900;
    this.angle = Math.atan2(dir[1], dir[0]);
  }
  #inside(a) {
    const rx = a.x - this.x, ry = a.y - this.y;
    const along = rx * this.dir[0] + ry * this.dir[1], across = Math.abs(-rx * this.dir[1] + ry * this.dir[0]);
    return along > 2 && along < this.len && across < 9;
  }
  update(dt, world) {
    this.t += dt;
    const k = this.t % this.period;
    const phase = k < this.period - 1.9 ? 'off' : k < this.period - 1.2 ? 'warn' : 'fire';
    if (phase !== this.phase) {
      this.phase = phase;
      if (phase === 'warn') {
        const near = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) < 260;
        if (near) world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: this.angle, len: this.len, width: 16, duration: 0.7, color: [255, 120, 40], screen: true }));
      }
      if (phase === 'fire') {
        const near = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) < 260;
        if (near) {
          this.light = world.addLight(new Light({ x: this.x + this.dir[0] * this.len * 0.5, y: this.y + this.dir[1] * this.len * 0.5, radius: 70, color: [255, 130, 50], intensity: 0.9, flicker: 0.4, ttl: 1.2, bloom: 0.4 }));
          world.bus.emit('trapFlame', { x: this.x, y: this.y });
        }
      }
    }
    if (this.phase === 'warn' && Math.random() < dt * 20) world.particles.sparks(this.x + this.dir[0] * 4, this.y + this.dir[1] * 4 - 4, this.angle, 1);
    if (this.phase === 'fire') {
      if (Math.random() < dt * 40) {
        const d = rand(4, this.len);
        world.particles.embers(this.x + this.dir[0] * d + rand(-3, 3), this.y + this.dir[1] * d - 4 + rand(-3, 3), 1);
      }
      this.cool -= dt;
      if (this.cool <= 0) {
        let any = false;
        for (const a of [world.hero, ...world.enemies]) {
          if (a.dead || a.def?.boss || !this.#inside(a)) continue;
          if (hurt(world, a, a === world.hero ? this.damage : this.damage * 2, this.dir[0], this.dir[1], 60, this)) any = true;
        }
        if (any) this.cool = 0.3;
      }
    }
  }
  render(ctx, cx, cy) {
    // Düse aus Messing im Boden
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = 'rgba(8,6,12,0.5)'; ctx.fillRect(x - 5, y - 3, 11, 7);
    ctx.fillStyle = '#5a3a1c'; ctx.fillRect(x - 4, y - 2, 9, 5);
    ctx.fillStyle = '#b8862a'; ctx.fillRect(x - 4, y - 2, 9, 1);
    ctx.fillStyle = '#1a0e0a'; ctx.fillRect(x - 1 + this.dir[0] * 3, y - 1 + this.dir[1] * 2, 3, 2);
  }
  renderEmissive(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - cy;
    if (this.phase === 'warn') {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 30);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(Math.round(x - 1 + this.dir[0] * 3), Math.round(y - 1 + this.dir[1] * 2), 3, 2);
      ctx.globalAlpha = 1;
      return;
    }
    if (this.phase !== 'fire') return;
    // Flammenzunge: Kette aus flackernden Kernen, außen rot, innen weißgelb
    const cols = ['#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
    for (let s = 2; s < this.len; s += 3) {
      const k = s / this.len;
      const wob = Math.sin(this.t * 30 + s * 0.7) * 2 * k;
      const px = x + this.dir[0] * s - this.dir[1] * wob, py = y - 4 + this.dir[1] * s * 0.8 + this.dir[0] * wob;
      const r = Math.round(2 + k * 4 + Math.sin(this.t * 20 + s) * 1);
      for (let i = 0; i < cols.length; i++) {
        const rr = Math.max(1, r - i * 1.3);
        ctx.globalAlpha = (1 - k * 0.6) * (i === 0 ? 0.55 : 0.85);
        ctx.fillStyle = cols[i];
        ctx.fillRect(Math.round(px - rr), Math.round(py - rr * 0.8), Math.round(rr * 2), Math.round(rr * 1.6));
      }
    }
    ctx.globalAlpha = 1;
  }
}

export class Lever extends Entity {
  constructor(x, y, secretId) {
    super(x, y);
    this.secretId = secretId; this.on = false; this.t = 0; this.interactRange = 22;
    this.sortOffset = -2;
  }
  canInteract(world) { return !this.on && !world.hero.dead; }
  prompt() { return 'Hebel ziehen'; }
  promptAnchor() { return { x: this.x, y: this.y - 22 }; }
  interact(world) {
    this.on = true; this.t = 0;
    world.bus.emit('leverPull', { x: this.x, y: this.y, secretId: this.secretId });
    world.openSecret?.(this.secretId);
  }
  update(dt) { this.t += dt; }
  render(ctx, cx, cy) {
    // Wandplatte (sitzt auf der Mauerfront über dem Bodenfeld) mit Hebel
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy) - 14;
    ctx.fillStyle = '#1c1822'; ctx.fillRect(x - 4, y - 5, 9, 11);
    ctx.fillStyle = '#48526a'; ctx.fillRect(x - 3, y - 4, 7, 9);
    ctx.fillStyle = '#6d7a94'; ctx.fillRect(x - 3, y - 4, 7, 1);
    ctx.fillStyle = '#2d3548'; ctx.fillRect(x, y - 3, 1, 7);
    const k = this.on ? Math.min(1, this.t / 0.2) : 0;
    const ang = -2.2 + k * 1.5; // von oben links nach unten rechts
    for (let i = 0; i < 7; i++) {
      const px = x + Math.round(Math.cos(ang) * i * -1), py = y + Math.round(Math.sin(ang) * i);
      ctx.fillStyle = i > 5 ? '#c8420c' : '#7c5636'; ctx.fillRect(px, py, 2, 1);
    }
  }
  renderEmissive(ctx, cx, cy) {
    if (this.on) return;
    // schwacher Schimmer, damit man ihn entdecken kann
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy) - 14;
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 2.5);
    ctx.fillStyle = '#ffd890'; ctx.fillRect(x - 3, y - 4, 7, 1);
    ctx.globalAlpha = 1;
  }
}
