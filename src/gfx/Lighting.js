import { makeCanvas } from './PixelCanvas.js';
import { CONFIG } from '../config.js';
import { getLightSprite } from '../sprites/effects.js';

// Punktlicht. Kann einer Entity folgen, flackern und zeitlich begrenzt sein.
export class Light {
  constructor({ x = 0, y = 0, radius = 60, color = [255, 180, 110], intensity = 1, flicker = 0, follow = null, offsetX = 0, offsetY = 0, ttl = Infinity, bloom = 0.25 }) {
    Object.assign(this, { x, y, radius, color, intensity, flicker, follow, offsetX, offsetY, ttl, bloom });
    this.maxTtl = ttl;
    this.seed = Math.random() * 100;
    this.value = intensity;
    this.dead = false;
  }
  update(dt, t) {
    if (this.follow) {
      if (this.follow.removed) { this.dead = true; return; }
      this.x = this.follow.x + this.offsetX * (this.follow.facing ?? 1);
      this.y = this.follow.y + this.offsetY;
    }
    if (this.ttl !== Infinity) {
      this.ttl -= dt;
      if (this.ttl <= 0) { this.dead = true; return; }
    }
    const fade = this.ttl === Infinity ? 1 : this.ttl / this.maxTtl;
    const s = this.seed;
    const n = Math.sin(t * 9.1 + s) * 0.5 + Math.sin(t * 23.7 + s * 1.7) * 0.3 + Math.sin(t * 3.3 + s * 3.1) * 0.2;
    this.value = this.intensity * fade * (1 - this.flicker * (0.5 + 0.5 * n));
  }
}

// Lightmap-Verfahren: Umgebungsdunkel + additive Lichter, dann per
// "multiply" über die Szene. Danach optional additiver Bloom-Schimmer.
// Die Lightmap hat halbe Auflösung und wird weich vergrößert: Licht besteht nur aus weichen Verläufen,
// sichtbar ändert sich nichts, aber Füllen und Mischen kosten ein Viertel (Handy, große Außenkarten).
const LM = 0.5;
const lmSize = (v) => Math.max(1, Math.ceil(v * LM));
export class LightingSystem {
  constructor(w, h, ambient) {
    this.w = w; this.h = h;
    this.canvas = makeCanvas(lmSize(w), lmSize(h));
    this.ctx = this.canvas.getContext('2d');
    this.ambient = ambient;
    this.ambientBoost = 0; // für Blitz-Effekte (z. B. Kills)
  }

  // Passt die Lightmap an eine geänderte Bildgröße an (Hochformat auf dem Handy).
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas = makeCanvas(lmSize(w), lmSize(h));
    this.ctx = this.canvas.getContext('2d');
  }

  apply(ctx, camX, camY, lights) {
    // Weltpixel, nicht ctx.canvas: das Spielbild ist überabgetastet (CONFIG.renderScale).
    if (CONFIG.viewWidth !== this.w || CONFIG.viewHeight !== this.h) this.resize(CONFIG.viewWidth, CONFIG.viewHeight);
    const l = this.ctx;
    const [ar, ag, ab] = this.ambient;
    const k = this.ambientBoost;
    l.setTransform(LM, 0, 0, LM, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = `rgb(${Math.min(255, ar + k * 60)},${Math.min(255, ag + k * 40)},${Math.min(255, ab + k * 30)})`;
    l.fillRect(0, 0, this.w, this.h);
    l.globalCompositeOperation = 'lighter';
    l.imageSmoothingEnabled = true;
    for (const li of lights) {
      const r = li.radius;
      const sx = li.x - camX, sy = li.y - camY;
      if (sx + r < 0 || sy + r < 0 || sx - r > this.w || sy - r > this.h) continue;
      l.globalAlpha = Math.max(0, Math.min(1, li.value));
      l.drawImage(getLightSprite(64, li.color), sx - r, sy - r, r * 2, r * 2);
    }
    l.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, this.canvas.width / LM, this.canvas.height / LM);
    ctx.imageSmoothingEnabled = smooth;
    ctx.globalCompositeOperation = 'source-over';
  }

  bloom(ctx, camX, camY, lights) {
    if (this.bloomScale === 0) return; // Qualität „Niedrig“: kein Leuchten-Pass
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    for (const li of lights) {
      if (!li.bloom) continue;
      const r = li.radius * 0.45;
      const sx = li.x - camX, sy = li.y - camY;
      if (sx + r < 0 || sy + r < 0 || sx - r > this.w || sy - r > this.h) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, li.value * li.bloom * (this.bloomScale ?? 1)));
      ctx.drawImage(getLightSprite(32, li.color), sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
  }
}
