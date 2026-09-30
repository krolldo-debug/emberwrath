import { Entity, getShadow } from './Entity.js';
import { Light } from '../gfx/Lighting.js';
import { rand } from '../core/math.js';

// Statisches Weltobjekt aus Daten: Sprite (SpriteFrame), optional
// Kollisionsbox, Flammen, Licht, Leuchtebene, Rauch und Verdeckung
// (wird halbtransparent, wenn der Held dahinter steht).
//   opts: { sprite, box: [dx0, dy0, dx1, dy1], low, shadow, flames: [{frames, dx, dy, fps}],
//           light: { dx, dy, radius, color, intensity, flicker, bloom }, glow: canvas,
//           smoke: { dx, dy, rate }, embers: { dx, dy, rate }, occlude: [dx0, dy0, dx1, dy1], sortOffset }
export class Decor extends Entity {
  constructor(x, y, opts, world) {
    super(x, y);
    this.o = opts;
    this.world = world;
    this.sprite = opts.sprite;
    this.flip = !!opts.flip;
    this.t = rand(0, 5);
    this.alpha = 1;
    this.sortOffset = opts.sortOffset ?? 0;
    if (opts.box) {
      const [a, b, c, d] = opts.box;
      this.box = { x0: x + a, y0: y + b, x1: x + c, y1: y + d, low: !!opts.low };
      world.dungeon.boxes.push(this.box);
    }
    if (opts.light) {
      const L = opts.light;
      this.light = world.addLight(new Light({ x: x + (L.dx ?? 0), y: y + (L.dy ?? 0), radius: L.radius, color: L.color, intensity: L.intensity ?? 0.9, flicker: L.flicker ?? 0.15, bloom: L.bloom ?? 0.3 }));
    }
  }

  update(dt, world) {
    this.t += dt;
    const o = this.o;
    if (o.smoke && Math.random() < o.smoke.rate * dt) {
      world.particles.spawn({
        x: this.x + o.smoke.dx + rand(-1, 1), y: this.y + o.smoke.dy, vx: rand(2, 6), vy: rand(-2, 0), rise: rand(8, 14), wobble: 4,
        life: rand(2.5, 4), colors: ['#3a3444', '#2a2632', '#4a4454'], alpha: 0.35,
      });
    }
    if (o.embers && Math.random() < o.embers.rate * dt) world.particles.embers(this.x + o.embers.dx, this.y + o.embers.dy, 1);
    if (o.occlude) {
      const h = world.hero, [a, b, c, d] = o.occlude;
      const behind = h && h.y < this.y && h.x > this.x + a && h.x < this.x + c && h.y > this.y + b && h.y < this.y + d;
      this.alpha += ((behind ? 0.45 : 1) - this.alpha) * Math.min(1, dt * 10);
    }
  }

  render(ctx, cx, cy) {
    if (!this.sprite) return;
    const x = this.x - cx, y = this.y - cy;
    if (this.o.shadow) {
      const sh = getShadow(this.o.shadow);
      ctx.drawImage(sh, Math.round(x - sh.width / 2), Math.round(y - sh.height / 2));
    }
    this.sprite.draw(ctx, x, y, { flip: this.flip, alpha: this.alpha });
  }

  renderEmissive(ctx, cx, cy) {
    const o = this.o;
    if (o.glow) {
      const g = o.glow, s = this.sprite;
      ctx.globalAlpha = (0.8 + 0.2 * Math.sin(this.t * 2.3)) * this.alpha;
      ctx.drawImage(g, Math.round(this.x - cx - s.ax), Math.round(this.y - cy - s.ay));
      ctx.globalAlpha = 1;
    }
    if (o.flames) for (const f of o.flames) {
      const img = f.frames[Math.floor(this.t * f.fps) % f.frames.length];
      ctx.drawImage(img, Math.round(this.x - cx + f.dx - img.width / 2), Math.round(this.y - cy + f.dy - img.height + 1));
    }
  }
}
