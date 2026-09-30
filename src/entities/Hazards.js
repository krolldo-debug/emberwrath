import { Entity } from './Entity.js';
import { rand } from '../core/math.js';

// Bleibende Gefahrenfläche am Boden (Giftwolke, Frostfeld, Glutfeld) für
// Spezialangriff `cloud` normaler Gegner (Enemy.js). Schadet dem Helden in
// Takten, solange er darin steht; rein kreisförmig, blockiert nichts.
const LOOK = {
  poison: { base: [70, 160, 60], puff: ['#9ae070', '#62b048', '#3c7a30'], glow: '#c8ff90' },
  frost: { base: [120, 190, 255], puff: ['#e8f6ff', '#a8d8f8', '#5a9ad0'], glow: '#ffffff' },
  fire: { base: [255, 120, 40], puff: ['#ffd070', '#f07a1c', '#a8300a'], glow: '#fff0b0' },
  spore: { base: [170, 110, 220], puff: ['#e0b8ff', '#a070d8', '#5a3a8a'], glow: '#f4e0ff' },
};

export class HazardCloud extends Entity {
  constructor(x, y, owner, { radius = 26, duration = 5, damage = 20, tick = 0.5, element = 'poison' } = {}) {
    super(x, y);
    Object.assign(this, { owner, radius, duration, damage, tick, element });
    this.look = LOOK[element] ?? LOOK.poison;
    this.t = 0; this.cool = 0.3;
    this.sortOffset = -19000; // unter den Figuren
    this.puffs = Array.from({ length: Math.round(radius / 2.2) }, () => ({ a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()) * radius, s: rand(3, 7), ph: rand(0, 6) }));
  }

  update(dt, world) {
    this.t += dt;
    if (this.t >= this.duration) { this.removed = true; return; }
    const grow = Math.min(1, this.t * 3);
    this.cool -= dt;
    const h = world.hero;
    if (this.cool <= 0 && !h.dead && Math.hypot((h.x - this.x) / this.radius, (h.y - this.y) / (this.radius * 0.6)) <= grow) {
      this.cool = this.tick;
      const hit = { damage: Math.round(this.damage * rand(0.9, 1.1)), dirX: 0, dirY: -1, knockback: 0, source: this.owner, dot: true };
      if (h.takeHit(hit)) world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, dot: true, dirX: 0, dirY: 0, x: h.x, y: h.centerY, killed: h.dead });
    }
    if (Math.random() < dt * this.radius * 0.2) world.particles?.dust?.(this.x + rand(-this.radius, this.radius), this.y + rand(-this.radius * 0.5, this.radius * 0.5), 1, this.look.puff[1]);
  }

  #alpha() {
    const fadeIn = Math.min(1, this.t * 3), fadeOut = Math.min(1, (this.duration - this.t) * 1.5);
    return Math.min(fadeIn, fadeOut);
  }

  render(ctx, cx, cy) {
    const a = this.#alpha();
    if (a <= 0) return;
    const x = this.x - cx, y = this.y - cy, [r, g, b] = this.look.base;
    // Bodenfleck
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), this.radius, this.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    // Schwaden
    for (const p of this.puffs) {
      const k = Math.sin(this.t * 1.3 + p.ph);
      const px = x + Math.cos(p.a + this.t * 0.25) * p.r, py = y + Math.sin(p.a + this.t * 0.25) * p.r * 0.6 - 3 - k * 2;
      ctx.globalAlpha = (0.32 + 0.12 * k) * a;
      ctx.fillStyle = this.look.puff[(p.ph * 10 | 0) % 3];
      ctx.fillRect(Math.round(px - p.s / 2), Math.round(py - p.s / 3), Math.round(p.s), Math.max(1, Math.round(p.s * 0.6)));
    }
    ctx.globalAlpha = 1;
  }

  renderEmissive(ctx, cx, cy) {
    const a = this.#alpha();
    if (a <= 0) return;
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = this.look.glow;
    for (let i = 0; i < this.puffs.length; i += 3) {
      const p = this.puffs[i];
      const px = this.x - cx + Math.cos(p.a + this.t * 0.25) * p.r, py = this.y - cy + Math.sin(p.a + this.t * 0.25) * p.r * 0.6 - 4;
      if (Math.sin(this.t * 3 + p.ph) > 0.6) ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
