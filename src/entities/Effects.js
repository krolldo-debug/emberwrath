import { Entity } from './Entity.js';
import { getSlashFrame, getEnemySlashFrame, SLASH_FRAMES } from '../sprites/effects.js';

// Kurzlebige visuelle Objekte. Sie leben in world.effects und werden
// (größtenteils) im Emissive-Pass gezeichnet – also nicht abgedunkelt.

export class SlashEffect extends Entity {
  constructor(owner, angle, style, reverse, duration, enemy = false) {
    super(owner.x, owner.y);
    this.owner = owner; this.angle = angle; this.style = style;
    this.reverse = reverse; this.duration = duration; this.t = 0; this.enemy = enemy;
    this.offX = Math.cos(angle) * 3; this.offY = -8 + Math.sin(angle) * 3;
  }
  update(dt) {
    this.t += dt;
    this.x = this.owner.x + this.offX; this.y = this.owner.y + this.offY;
    if (this.t >= this.duration) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const f = Math.min(SLASH_FRAMES - 1, Math.floor((this.t / this.duration) * SLASH_FRAMES));
    const img = this.enemy ? getEnemySlashFrame(this.angle, f) : getSlashFrame(this.style, this.angle, f, this.reverse);
    ctx.drawImage(img, Math.round(this.x - cx - img.width / 2), Math.round(this.y - cy - img.height / 2));
  }
}

export class Afterimage extends Entity {
  constructor(frame, x, y, flip) {
    super(x, y);
    this.frame = frame; this.flip = flip; this.life = this.max = 0.22;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (this.life / this.max) * 0.35;
    const img = this.flip ? this.frame.flashFlipped : this.frame.flash;
    const ax = this.flip ? this.frame.canvas.width - this.frame.ax : this.frame.ax;
    ctx.drawImage(img, Math.round(this.x - cx - ax), Math.round(this.y - cy - this.frame.ay));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Beschwörungszeichen: kündigt einen Gegner-Spawn an (Telegraphing).
export class SpawnMarker extends Entity {
  constructor(x, y, duration, onDone) {
    super(x, y);
    this.t = 0; this.duration = duration; this.onDone = onDone;
  }
  update(dt, world) {
    this.t += dt;
    if (Math.random() < 0.6) world.particles.magic(this.x, this.y, 1, 9 * (this.t / this.duration));
    if (this.t >= this.duration) { this.removed = true; this.onDone(); }
  }
  renderEmissive(ctx, cx, cy) {
    const k = this.t / this.duration;
    const r = 3 + k * 9;
    const x = this.x - cx, y = this.y - cy;
    ctx.fillStyle = `rgba(160,96,240,${0.25 + k * 0.5})`;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.t * 5;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.55), 1, 1);
    }
    ctx.fillStyle = `rgba(224,184,255,${k})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

// Schadenszahlen – "Pop" beim Erscheinen, dann Aufsteigen und Ausblenden.
export class FloatingText extends Entity {
  constructor(x, y, text, { color = '#ffffff', scale = 1, life = 0.8, font }) {
    super(x, y);
    this.text = text; this.color = color; this.scale = scale; this.life = this.max = life; this.font = font;
    this.vy = -38; this.vx = (Math.random() - 0.5) * 20;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy *= Math.exp(-dt * 4);
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const age = this.max - this.life;
    const pop = age < 0.08 ? this.scale + 1 : this.scale;
    ctx.globalAlpha = Math.min(1, this.life / (this.max * 0.4));
    this.font.draw(ctx, this.text, Math.round(this.x - cx), Math.round(this.y - cy), { color: this.color, scale: pop, align: 'center', outline: true });
    ctx.globalAlpha = 1;
  }
}

// Pulsierender Runenkreis in der Raummitte.
export class RuneGlow extends Entity {
  constructor(x, y, rune) {
    super(x, y);
    this.rune = rune; this.t = 0; this.surge = 0;
  }
  update(dt) { this.t += dt; this.surge = Math.max(0, this.surge - dt); }
  renderEmissive(ctx, cx, cy) {
    const g = this.rune.glow;
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 1.7) + this.surge;
    ctx.drawImage(g, Math.round(this.x - cx - g.width / 2), Math.round(this.y - cy - g.height / 2));
    ctx.globalAlpha = 1;
  }
}

// Sich ausbreitender Ring (Einschlag, Aura, Stufenaufstieg). Pixelgenau als
// Ellipse in Bodenperspektive gezeichnet, äußerer Rand hell, innen transparent.
export class Shockwave extends Entity {
  constructor(x, y, { radius = 24, color = '#ffffff', life = 0.4 } = {}) {
    super(x, y);
    this.radius = radius; this.color = color; this.life = this.max = life;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const r = 2 + this.radius * (1 - Math.pow(1 - k, 3));
    const x = this.x - cx, y = this.y - cy;
    const n = Math.max(12, Math.round(r * 3));
    ctx.fillStyle = this.color;
    ctx.globalAlpha = (1 - k) * 0.9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.5);
      ctx.fillRect(px, py, 1, 1);
      if (k < 0.5) ctx.fillRect(Math.round(x + Math.cos(a) * (r - 1)), Math.round(y + Math.sin(a) * (r - 1) * 0.5), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

// Lichtsäule (Stufenaufstieg, Boss besiegt): vertikaler Strahl mit Kern.
export class LightPillar extends Entity {
  constructor(x, y, { color = '#ffd66a', life = 1.2, follow = null, height = 90 } = {}) {
    super(x, y);
    this.color = color; this.life = this.max = life; this.follow = follow; this.height = height;
  }
  update(dt) {
    this.life -= dt;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const grow = Math.min(1, k * 6), fade = Math.min(1, (this.life / this.max) * 2.5);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const w = Math.max(1, Math.round(10 * grow * fade));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < w; i++) {
      const edge = Math.abs(i - (w - 1) / 2) / Math.max(1, w / 2);
      ctx.globalAlpha = (1 - edge) * 0.5 * fade;
      ctx.fillStyle = edge < 0.3 ? '#ffffff' : this.color;
      const hgt = Math.round(this.height * grow * (1 - edge * 0.3));
      ctx.fillRect(x - Math.floor(w / 2) + i, y - hgt, 1, hgt + 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------------------
// Runde 2: Kampf- und Magieeffekte. Alle pixelgenau, im Emissive-Pass, additiv.
const rgbStr = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// Treffer-Stern: kurzer Kreuz-/Sternblitz am Einschlagpunkt, dreht leicht.
export class ImpactStar extends Entity {
  constructor(x, y, { size = 7, color = '#ffe8a0', life = 0.14, rays = 4, angle = 0 } = {}) {
    super(x, y);
    this.size = size; this.rgb = hexRgb(color); this.life = this.max = life; this.rays = rays; this.angle = angle;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const len = this.size * (k < 0.3 ? 0.5 + k * 1.7 : 1.1 - (k - 0.3) * 0.6);
    const x = this.x - cx, y = this.y - cy;
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 0; r < this.rays; r++) {
      const a = this.angle + (r / this.rays) * Math.PI + k * 0.6;
      const l = r % 2 ? len * 0.6 : len;
      for (let i = -l; i <= l; i++) {
        const f = 1 - Math.abs(i) / (l + 1);
        ctx.fillStyle = f > 0.7 ? `rgba(255,255,255,${(1 - k) * f})` : rgbStr(this.rgb, (1 - k) * f);
        ctx.fillRect(Math.round(x + Math.cos(a) * i), Math.round(y + Math.sin(a) * i), 1, 1);
      }
    }
    const core = Math.max(1, Math.round(3 * (1 - k)));
    ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
    ctx.fillRect(Math.round(x - core / 2), Math.round(y - core / 2), core, core);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Flammen-/Elementring am Boden: breites, gefülltes Band mit züngelnden Spitzen,
// innen verglühend. colors: [dunkel, mittel, hell, weiß]
export class NovaBurst extends Entity {
  constructor(x, y, { radius = 38, colors = ['#7a2208', '#f07a1c', '#ffb640', '#fff0b0'], life = 0.5, tongues = 18 } = {}) {
    super(x, y);
    this.radius = radius; this.cols = colors.map(hexRgb); this.life = this.max = life; this.tongues = tongues;
    this.seed = Math.random() * 100;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const R = 3 + this.radius * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3));
    const band = Math.max(2, this.radius * 0.35 * (1 - k));
    const x0 = this.x - cx, y0 = this.y - cy;
    const fade = 1 - k * k;
    ctx.globalCompositeOperation = 'lighter';
    const r0 = Math.max(0, R - band), n = Math.ceil(R + 8);
    for (let dy = -Math.ceil(n * 0.5); dy <= Math.ceil(n * 0.5); dy++) {
      for (let dx = -n; dx <= n; dx++) {
        const d = Math.hypot(dx, dy * 2);
        const a = Math.atan2(dy * 2, dx);
        const tongue = Math.max(0, Math.sin(a * this.tongues * 0.5 + this.seed + k * 6)) * 4 * (1 - k);
        if (d > R + tongue || d < r0) continue;
        const t = (d - r0) / Math.max(1, R + tongue - r0); // 0 innen … 1 außen
        const idx = t > 0.92 ? 3 : t > 0.7 ? 2 : t > 0.35 ? 1 : 0;
        const alpha = fade * (idx === 0 ? 0.35 : idx === 1 ? 0.6 : 0.85);
        ctx.fillStyle = rgbStr(this.cols[idx], alpha);
        ctx.fillRect(Math.round(x0 + dx), Math.round(y0 + dy), 1, 1);
      }
    }
    // Innenglut
    if (k < 0.5) {
      ctx.fillStyle = rgbStr(this.cols[2], (0.5 - k) * 0.6);
      for (let dy = -3; dy <= 3; dy++) { const w = Math.round(Math.sqrt(9 - dy * dy) * 2); ctx.fillRect(Math.round(x0 - w), Math.round(y0 + dy), w * 2 + 1, 1); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Wirbel um den Helden (Wirbelsturm): zwei gegenläufige Sichelbögen am Boden.
export class SpinVortex extends Entity {
  constructor(follow, { radius = 26, color = '#ffc050', life = 0.5 } = {}) {
    super(follow.x, follow.y);
    this.follow = follow; this.radius = radius; this.rgb = hexRgb(color); this.life = this.max = life;
  }
  update(dt) { this.life -= dt; this.x = this.follow.x; this.y = this.follow.y; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max, fade = Math.min(1, (1 - k) * 2.5);
    const x = this.x - cx, y = this.y - cy - 2;
    ctx.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 3; arm++) {
      const base = k * 22 + arm * (Math.PI * 2 / 3);
      for (let i = 0; i < 26; i++) {
        const t = i / 26, a = base - t * 2.2;
        const r = this.radius * (0.55 + 0.45 * (1 - t));
        const al = (1 - t) * fade;
        ctx.fillStyle = t < 0.15 ? `rgba(255,255,255,${al})` : rgbStr(this.rgb, al * 0.8);
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5), 1, 1);
        if (t < 0.5) ctx.fillRect(Math.round(x + Math.cos(a) * (r - 1)), Math.round(y + Math.sin(a) * (r - 1) * 0.5), 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Riss / Portalblitz (Blinzeln, Schattenschritt): vertikaler Spalt, der aufreißt und sich schließt.
export class RiftFlash extends Entity {
  constructor(x, y, { color = '#b884ff', life = 0.35, height = 22 } = {}) {
    super(x, y);
    this.rgb = hexRgb(color); this.life = this.max = life; this.height = height;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const open = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
    const w = Math.max(1, Math.round(3 * open)), hgt = Math.round(this.height * (0.6 + 0.4 * open));
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < hgt; i++) {
      const t = i / hgt, ww = Math.max(1, Math.round(w * Math.sin(t * Math.PI)));
      ctx.fillStyle = rgbStr(this.rgb, 0.28 * open);
      ctx.fillRect(x - ww, y - i, ww * 2 + 1, 1);
      if (ww > 1) { ctx.fillStyle = rgbStr(this.rgb, 0.6 * open); ctx.fillRect(x - ww, y - i, 1, 1); ctx.fillRect(x + ww, y - i, 1, 1); }
      ctx.fillStyle = `rgba(255,255,255,${0.9 * open})`;
      ctx.fillRect(x, y - i, 1, 1);
    }
    // Bodenellipse
    ctx.fillStyle = rgbStr(this.rgb, 0.6 * open);
    for (let a = 0; a < 20; a++) { const an = a / 20 * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(an) * (5 + 6 * k)), Math.round(y + Math.sin(an) * (2.5 + 3 * k)), 1, 1); }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Aufladen (Durchschuss, Zauber): Lichtpunkte ziehen spiralförmig zur Hand.
export class ChargeGlow extends Entity {
  constructor(follow, { color = '#a8ff90', life = 0.3, offY = -12, reach = 14 } = {}) {
    super(follow.x, follow.y);
    this.follow = follow; this.rgb = hexRgb(color); this.life = this.max = life; this.offY = offY; this.reach = reach + 4;
  }
  update(dt) { this.life -= dt; this.x = this.follow.x + (this.follow.facing ?? 1) * 7; this.y = this.follow.y + this.offY; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const x = this.x - cx, y = this.y - cy;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const ph = (i / 16 + k * 1.5) % 1;
      const r = this.reach * (1 - ph), a = i * 2.4 + ph * 4;
      ctx.fillStyle = rgbStr(this.rgb, 0.3 + ph * 0.7);
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 1, 1);
      if (ph > 0.6) ctx.fillRect(Math.round(x + Math.cos(a - 0.3) * (r + 1.5)), Math.round(y + Math.sin(a - 0.3) * (r + 1.5) * 0.7), 1, 1);
    }
    const c = Math.round(1 + k * 3);
    ctx.fillStyle = rgbStr(this.rgb, 0.5); ctx.fillRect(Math.round(x - c), Math.round(y - c / 2), c * 2 + 1, c + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Seelenlicht beim Tod eines Gegners: kleines Irrlicht steigt schlingernd auf.
export class SoulWisp extends Entity {
  constructor(x, y, { color = '#c6a8ff', life = 1.1 } = {}) {
    super(x, y);
    this.rgb = hexRgb(color); this.life = this.max = life; this.ph = Math.random() * 6;
  }
  update(dt) { this.life -= dt; this.y -= dt * 22; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max, a = Math.min(1, (1 - k) * 1.6) * Math.min(1, k * 8);
    const x = Math.round(this.x - cx + Math.sin(this.ph + k * 9) * 3), y = Math.round(this.y - cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgbStr(this.rgb, a * 0.35);
    ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
    for (let i = 1; i < 6; i++) { ctx.fillStyle = rgbStr(this.rgb, a * (1 - i / 6) * 0.6); ctx.fillRect(Math.round(x - Math.sin(this.ph + k * 9 - i * 0.5) * 2), y + i + 1, 1, 1); }
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, 1, 1);
    ctx.globalCompositeOperation = 'source-over';
  }
}
