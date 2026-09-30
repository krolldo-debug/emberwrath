import { PixelCanvas } from '../gfx/PixelCanvas.js';

let nextId = 1;
const shadowCache = new Map();

export function getShadow(w) {
  let c = shadowCache.get(w);
  if (!c) {
    const h = Math.max(3, Math.round(w * 0.38));
    const p = new PixelCanvas(w, h);
    p.ellipse((w - 1) / 2, (h - 1) / 2, w / 2, h / 2, 'rgba(4,2,8,0.55)');
    p.ellipse((w - 1) / 2, (h - 1) / 2, w / 2 - 2, h / 2 - 1, 'rgba(4,2,8,0.35)');
    c = p.canvas; shadowCache.set(w, c);
  }
  return c;
}

// Basisklasse für alles, was in der Welt existiert und gezeichnet wird.
export class Entity {
  constructor(x, y) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 6;
    this.team = 'neutral';
    this.solid = false;
    this.removed = false;
    this.sortOffset = 0;
  }
  get sortY() { return this.y + this.sortOffset; }
  update(dt, world) {}
  render(ctx, cx, cy) {}
  renderEmissive(ctx, cx, cy) {}
}
