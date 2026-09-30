import { Entity } from './Entity.js';
import { Light } from '../gfx/Lighting.js';
import { rand } from '../core/math.js';

// Statische Dungeon-Objekte mit optionaler Flamme, Licht und Kollision.
export class Prop extends Entity {
  constructor(kind, x, y, assets, world) {
    super(x, y);
    this.kind = kind;
    this.props = assets.props;
    this.t = rand(0, 5);
    this.flames = [];
    switch (kind) {
      case 'torch':
        this.sortOffset = -10000; // hängt an der Wand, immer hinten
        this.flames.push({ frames: this.props.torchFlame, dx: 0, dy: -1, fps: 12 });
        world.addLight(new Light({ x, y: y + 4, radius: 92, color: [255, 150, 70], intensity: 0.95, flicker: 0.25, bloom: 0.35 }));
        this.emberRate = 1.5;
        break;
      case 'brazier':
        this.flames.push({ frames: this.props.brazierFlame, dx: 0, dy: -13, fps: 12 });
        world.addLight(new Light({ x, y: y - 14, radius: 125, color: [255, 140, 60], intensity: 1, flicker: 0.3, bloom: 0.4 }));
        world.dungeon.boxes.push({ x0: x - 6, y0: y - 4, x1: x + 6, y1: y + 1 });
        this.emberRate = 5;
        break;
      case 'pillar':
        world.dungeon.boxes.push({ x0: x - 7, y0: y - 6, x1: x + 7, y1: y + 1 });
        break;
      case 'candles':
        this.flames.push({ frames: this.props.candleFlame, dx: -3, dy: -5, fps: 9 });
        this.flames.push({ frames: this.props.candleFlame, dx: 0, dy: -8, fps: 10 });
        this.flames.push({ frames: this.props.candleFlame, dx: 3, dy: -4, fps: 8 });
        this.sortOffset = -4;
        world.addLight(new Light({ x, y: y - 6, radius: 48, color: [255, 190, 120], intensity: 0.8, flicker: 0.2, bloom: 0.3 }));
        break;
    }
  }

  update(dt, world) {
    this.t += dt;
    if (this.emberRate && Math.random() < this.emberRate * dt) {
      const f = this.flames[0];
      world.particles.embers(this.x + f.dx, this.y + f.dy - 6, 1);
    }
  }

  render(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - cy;
    const P = this.props;
    switch (this.kind) {
      case 'torch': P.torchBracket.draw(ctx, x, y); break;
      case 'brazier': P.brazier.draw(ctx, x, y); break;
      case 'pillar': P.pillar.draw(ctx, x, y + 1); break;
      case 'candles': P.candles.draw(ctx, x, y); break;
    }
  }

  renderEmissive(ctx, cx, cy) {
    for (const f of this.flames) {
      const img = f.frames[Math.floor(this.t * f.fps) % f.frames.length];
      ctx.drawImage(img, Math.round(this.x - cx + f.dx - img.width / 2), Math.round(this.y - cy + f.dy - img.height + 1));
    }
  }
}
