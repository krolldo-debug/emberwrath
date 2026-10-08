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
  curse: { base: [150, 70, 170], puff: ['#d8a0f0', '#8a4aa8', '#3a1a4a'], glow: '#f0d0ff' },
};
// Warnfarbe der Scharfschaltphase (arm) je Element
const ARM_COLOR = { poison: '#c8ff90', frost: '#e8f6ff', fire: '#ffb640', spore: '#e0b8ff', curse: '#e0a0ff' };

export class HazardCloud extends Entity {
  // arm: Sekunden, in denen die Fläche nur als Warnung (Pixelrand) liegt und noch nicht schadet
  // slow: Tempo-Faktor für den Helden darin (Fluch), sonst nur Frost (0,7)
  constructor(x, y, owner, { radius = 26, duration = 5, damage = 20, tick = 0.5, element = 'poison', arm = 0, slow = null } = {}) {
    super(x, y);
    Object.assign(this, { owner, radius, duration, damage, tick, element, arm, slow });
    this.look = LOOK[element] ?? LOOK.poison;
    this.t = 0; this.cool = 0.3;
    this.sortOffset = -19000; // unter den Figuren
    this.puffs = Array.from({ length: Math.round(radius / 2.2) }, () => ({ a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()) * radius, s: rand(3, 7), ph: rand(0, 6) }));
  }

  update(dt, world) {
    this.t += dt;
    if (this.t >= this.duration) { this.removed = true; return; }
    if (this.t < this.arm) return; // Warnphase: noch kein Schaden
    const grow = Math.min(1, (this.t - this.arm) * 3);
    this.cool -= dt;
    const h = world.hero;
    if (this.cool <= 0 && !h.dead && Math.hypot((h.x - this.x) / this.radius, (h.y - this.y) / (this.radius * 0.6)) <= grow) {
      this.cool = this.tick;
      const hit = { damage: Math.round(this.damage * rand(0.9, 1.1)), dirX: 0, dirY: -1, knockback: 0, source: this.owner, dot: true };
      if (this.element === 'frost') h.buff?.('frost_slow', 1.5, { moveSpeed: 0.7 }); // Frost bremst (A: Hero.buffSpeed)
      if (this.slow) h.buff?.('curse_slow', 1.0, { moveSpeed: this.slow });
      if (h.takeHit(hit)) world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, dot: true, dirX: 0, dirY: 0, x: h.x, y: h.centerY, killed: h.dead });
    }
    if (Math.random() < dt * this.radius * 0.2) world.particles?.dust?.(this.x + rand(-this.radius, this.radius), this.y + rand(-this.radius * 0.5, this.radius * 0.5), 1, this.look.puff[1]);
  }

  #alpha() {
    const fadeIn = Math.min(1, Math.max(0, this.t - this.arm) * 3), fadeOut = Math.min(1, (this.duration - this.t) * 1.5);
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
    if (this.arm > 0 && this.t < this.arm + 0.3) armRing(ctx, this.x - cx, this.y - cy, this.radius, this.t / this.arm, ARM_COLOR[this.element] ?? '#ffb640', this.t);
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

// Pixelrand einer scharf werdenden Fläche: dunkle Kante + Glutrand, der schneller blinkt, je näher der Schaden
function armRing(ctx, x, y, r, k, color, t) {
  const n = Math.max(16, Math.round(r * 2.2));
  const on = k < 0.6 || Math.sin(t * 26) > -0.2;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.6);
    ctx.globalAlpha = 0.6; ctx.fillStyle = 'rgb(14,6,10)'; ctx.fillRect(px, py + 1, 1, 1);
    if (on) { ctx.globalAlpha = Math.min(1, 0.45 + k * 0.55); ctx.fillStyle = color; ctx.fillRect(px, py, 1, 1); }
  }
  ctx.restore();
}

// Netz (Fallensteller): hält das Ziel kurz fest (Tempo über hero.buff 'rooted') und liegt sichtbar über ihm.
export class NetSnare extends Entity {
  constructor(target, duration = 1.2) {
    super(target.x, target.y);
    this.target = target; this.duration = duration; this.t = 0;
    this.sortOffset = 2; // über dem Gefangenen
  }
  update(dt) {
    this.t += dt;
    const h = this.target;
    this.x = h.x; this.y = h.y;
    if (this.t >= this.duration || h.dead) this.removed = true;
  }
  render(ctx, cx, cy) {
    const k = this.t / this.duration;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const w = 18, top = y - 22;
    ctx.save();
    ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
    // Seile: dunkle Kontur, helles Hanf
    for (let i = 0; i <= 4; i++) {
      const u = Math.round(x - w / 2 + (i * w) / 4);
      for (let yy = top; yy <= y; yy++) {
        const sway = Math.round(Math.sin((yy - top) * 0.35 + i) * 0.8);
        ctx.fillStyle = '#2a1c10'; ctx.fillRect(u + sway + 1, yy, 1, 1);
        ctx.fillStyle = (yy + i) % 3 ? '#b89a62' : '#8a6e40'; ctx.fillRect(u + sway, yy, 1, 1);
      }
    }
    for (let j = 0; j <= 4; j++) {
      const yy = Math.round(top + 2 + (j * 20) / 4);
      ctx.fillStyle = '#2a1c10'; ctx.fillRect(x - w / 2, yy + 1, w + 1, 1);
      ctx.fillStyle = '#c8aa70'; ctx.fillRect(x - w / 2, yy, w + 1, 1);
    }
    // Gewichte an den Ecken
    ctx.fillStyle = '#4a4450';
    ctx.fillRect(x - w / 2 - 1, y - 1, 3, 2); ctx.fillRect(x + w / 2 - 1, y - 1, 3, 2);
    ctx.restore();
  }
}
