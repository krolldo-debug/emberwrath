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
    const r = this.frame.res ?? 1; // Texel je Weltpixel (§11.12)
    ctx.drawImage(img, Math.round((this.x - cx) * r - ax) / r, Math.round((this.y - cy) * r - this.frame.ay) / r, img.width / r, img.height / r);
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

// ---------------------------------------------------------------------------
// Belohnungsrunde (10.10.): Effekte, die Treffer, Kills, Beute und Aufstiege
// belohnend machen. Alle additiv im Emissive-Pass, pixelgenau, ganzzahlig skaliert.

// Schadenszahl: springt im Bogen zur Seite, „ploppt“ beim Erscheinen. Krit: Ziffern
// 2× groß, nur 3 Bilder lang weiß, dann gold mit kurzem Zittern; 1-px-Kontur dunkelbraun.
// kind: 'normal' | 'crit' | 'kill'. side/lane (Feedback): Richtung und Abstand, damit sich
// mehrere Zahlen am selben Ziel nicht senkrecht stapeln. add(n) fasst weitere Treffer zusammen.
const NUM_EDGE = '#2a1206';
const EDGE8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export class DamageNumber extends Entity {
  constructor(x, y, value, { font, kind = 'normal', color, side = 1, lane = 0 } = {}) {
    super(x, y);
    this.value = value; this.text = String(value); this.font = font; this.kind = kind;
    this.crit = kind === 'crit';
    this.color = color ?? (this.crit ? '#ffd23a' : kind === 'kill' ? '#ffc890' : '#ffffff');
    this.life = this.max = this.crit ? 0.95 : 0.75;
    this.vx = side * (20 + lane * 16 + Math.random() * 10);
    this.vy = -72 + lane * 8;
    this.age = 0;
  }
  add(n) { this.value += n; this.text = String(this.value); this.age = 0; this.life = this.max; }
  update(dt) {
    this.age += dt; this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 150 * dt;                 // Bogen: steigt, wird langsamer, sinkt leicht
    this.vx *= Math.exp(-dt * 2.5);
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const age = this.age;
    let scale = this.crit ? 2 : 1, color = this.color, jx = 0, jy = 0;
    if (this.crit) {
      if (age < 0.05) color = '#ffffff';
      else if (age < 0.16) { jx = Math.round((Math.random() - 0.5) * 2); jy = Math.round((Math.random() - 0.5) * 2); }
    } else if (age < 0.05) scale = 2;
    ctx.globalAlpha = Math.min(1, this.life / (this.max * 0.35));
    const x = Math.round(this.x - cx) + jx, y = Math.round(this.y - cy) + jy;
    // Kontur 1 px (unabhängig von der Schriftgröße), dann die Ziffern
    for (const [ox, oy] of EDGE8) this.font.draw(ctx, this.text, x + ox, y + oy, { color: NUM_EDGE, scale, align: 'center' });
    this.font.draw(ctx, this.text, x, y, { color, scale, align: 'center' });
    ctx.globalAlpha = 1;
  }
}

// Seelenfunke (EP): springt aus dem besiegten Gegner und fliegt nach kurzem Zögern
// beschleunigt in den Helden (gesamt etwa 0,4–0,6 s). Glutfarben, 2×2 Pixel.
// onAbsorb() beim Ankommen (Klang, Funken). XpOrb.live zählt aktive Funken (Deckel im Feedback).
export class XpOrb extends Entity {
  static live = 0;
  constructor(x, y, target, { delay = 0.1, onAbsorb = null } = {}) {
    super(x, y);
    this.target = target; this.onAbsorb = onAbsorb;
    const a = Math.random() * Math.PI * 2, s = 24 + Math.random() * 30;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s * 0.6;
    this.z = 4; this.vz = 40 + Math.random() * 30;
    this.t = 0; this.delay = delay + Math.random() * 0.06; this.speed = 60;
    this.trail = [];
    this.ph = Math.random() * 6;
    XpOrb.live++;
  }
  #end() { if (!this.removed) { this.removed = true; XpOrb.live--; } }
  update(dt) {
    this.t += dt;
    const h = this.target;
    if (!h || h.removed || h.dead || this.t > 1.5) { this.#end(); return; }
    this.trail.unshift([this.x, this.y - this.z]); if (this.trail.length > 3) this.trail.pop();
    if (this.t < this.delay) {
      this.vz -= 220 * dt; this.z = Math.max(0, this.z + this.vz * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      return;
    }
    const tx = h.x, ty = h.y - (h.bodyHeight ?? 16) * 0.55;
    const dx = tx - this.x, dy = ty - (this.y - this.z), d = Math.hypot(dx, dy);
    this.speed = Math.min(560, this.speed + 1700 * dt);
    if (d < 5 + this.speed * dt) { this.#end(); this.onAbsorb?.(this); return; }
    const k = Math.min(1, dt * 14);
    this.vx += ((dx / d) * this.speed - this.vx) * k;
    this.vy += ((dy / d) * this.speed - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.z = Math.max(0, this.z - dt * 40);
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const hot = Math.sin(this.t * 22 + this.ph) > 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < this.trail.length; i++) {
      const [tx, ty] = this.trail[i];
      ctx.fillStyle = i === 1 ? 'rgba(240,122,28,0.7)' : 'rgba(200,66,12,0.45)';
      ctx.fillRect(Math.round(tx - cx), Math.round(ty - cy), 1, 1);
    }
    ctx.fillStyle = 'rgba(240,122,28,0.55)';
    ctx.fillRect(x - 1, y, 1, 2); ctx.fillRect(x + 2, y, 1, 2); ctx.fillRect(x, y - 1, 2, 1); ctx.fillRect(x, y + 2, 2, 1);
    ctx.fillStyle = hot ? '#fff0b0' : '#ffb640';
    ctx.fillRect(x, y, 2, 2);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Örtlicher Pixel-Blitz (Stufenaufstieg, legendäre Beute): vierzackiger Stern, der in
// wenigen festen Stufen aufgeht und verglüht – statt eines Schleiers über dem ganzen Bild.
export class PixelFlash extends Entity {
  constructor(x, y, { color = '#ffd66a', size = 22, life = 0.24, follow = null, offY = 0 } = {}) {
    super(x, y);
    this.rgb = hexRgb(color); this.size = size; this.life = this.max = life; this.follow = follow; this.offY = offY;
  }
  update(dt) {
    this.life -= dt;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const step = Math.min(3, Math.floor(k * 4));               // 4 feste Stufen
    const len = Math.round(this.size * [0.45, 1, 0.8, 0.5][step]);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy + this.offY);
    const col = step === 0 ? 'rgba(255,255,255,1)' : rgbStr(this.rgb, [1, 0.95, 0.7, 0.4][step]);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col;
    ctx.fillRect(x - len, y, len * 2 + 1, 1);                   // waagrecht
    ctx.fillRect(x, y - len, 1, len * 2 + 1);                   // senkrecht
    const d = Math.round(len * 0.45);                           // kurze Diagonalen
    for (let i = 1; i <= d; i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x - i, y + i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); ctx.fillRect(x - i, y - i, 1, 1); }
    const c = step < 2 ? 2 : 1;                                  // heller Kern
    ctx.fillStyle = step < 2 ? '#ffffff' : rgbStr(this.rgb, 0.8);
    ctx.fillRect(x - c, y - c, c * 2 + 1, c * 2 + 1);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Stufenaufstieg: Runenkreis am Boden dehnt sich und dreht, Lichtstrahlen steigen
// rundherum auf, Funken wirbeln nach oben. Helligkeit in festen Stufen (Pixel-Look).
const q3 = (v) => Math.ceil(Math.max(0, v) * 3) / 3;
export class LevelUpBurst extends Entity {
  constructor(hero, { color = '#ffd66a', life = 1.8 } = {}) {
    super(hero.x, hero.y);
    this.hero = hero; this.rgb = hexRgb(color); this.life = this.max = life;
    this.rays = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2 + Math.random() * 0.3, h: 30 + Math.random() * 40, d: Math.random() * 0.35 }));
  }
  update(dt) {
    this.life -= dt;
    this.x = this.hero.x; this.y = this.hero.y;
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const fade = q3(Math.min(1, (this.life / this.max) * 3));
    const open = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
    ctx.globalCompositeOperation = 'lighter';
    const r = 8 + open * 22, spin = k * 2.4;
    for (const [rr, a0, n] of [[r, 0.8, 40], [r * 0.72, 0.5, 28]]) {
      ctx.fillStyle = rgbStr(this.rgb, a0 * fade);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.45), 1, 1);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = spin + (i / 8) * Math.PI * 2, rr = r * 0.86;
      const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr * 0.45);
      ctx.fillStyle = `rgba(255,240,176,${0.9 * fade})`;
      ctx.fillRect(px, py - 1, 1, 3); if (i % 2) ctx.fillRect(px - 1, py, 3, 1);
    }
    // aufsteigende Lichtstrahlen am Kreisrand, in drei Helligkeitsstufen
    for (const ray of this.rays) {
      const t = Math.max(0, Math.min(1, (k - ray.d) * 2.2));
      if (t <= 0 || t >= 1) continue;
      const px = Math.round(x + Math.cos(ray.a + spin * 0.5) * r * 0.9), py = Math.round(y + Math.sin(ray.a + spin * 0.5) * r * 0.4);
      const hgt = Math.round(ray.h * Math.sin(t * Math.PI));
      for (let j = 0; j < hgt; j++) {
        const f = q3(1 - j / hgt);
        ctx.fillStyle = j < 2 ? `rgba(255,240,176,${0.8 * f})` : rgbStr(this.rgb, 0.55 * f);
        ctx.fillRect(px, py - j, 1, 1);
      }
    }
    for (let i = 0; i < 14; i++) {
      const ph = (k * 1.4 + i / 14) % 1;
      const a = i * 2.4 + ph * 7, rr = (1 - ph) * r * 0.8;
      ctx.fillStyle = rgbStr(this.rgb, q3(1 - ph) * fade);
      ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y - 4 - ph * 46 + Math.sin(a) * rr * 0.4), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Beute-Strahl: Für seltene, epische und legendäre Beute schlägt eine Lichtsäule in
// Seltenheitsfarbe vom Himmel ein und folgt dem Beutestück (über dropId gesucht, C spawnt
// es nach dem Ereignis). Pixel-Säule: Kern, Seltenheitsfarbe, geditherter Rand, nach oben
// in festen Stufen ausblendend; am Boden kreisen Pixelfunken. onLand() beim Einschlag.
const BEAM_BANDS = [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12];
export class LootBeam extends Entity {
  constructor(x, y, { dropId, rgb = [255, 214, 106], tier = 1, onLand = null } = {}) {
    super(x, y);
    this.dropId = dropId; this.rgb = rgb; this.tier = tier; this.onLand = onLand;
    this.drop = null; this.t = 0; this.landed = false;
    this.fall = 0.14;                         // Zeit, bis die Säule den Boden erreicht
    this.max = 1.1 + tier * 0.55;
    this.motes = Array.from({ length: 4 + tier * 3 }, () => ({ o: Math.random(), s: 0.5 + Math.random(), dx: Math.floor(Math.random() * 3) - 1 }));
  }
  update(dt, world) {
    this.t += dt;
    if (!this.drop && this.dropId) this.drop = world?.entities?.find((e) => e.drop?.dropId === this.dropId) ?? null;
    if (this.drop) {
      if (this.drop.removed) this.t = Math.max(this.t, this.max - 0.2);
      this.x = this.drop.x; this.y = this.drop.y;
    }
    if (!this.landed && this.t >= this.fall) { this.landed = true; this.onLand?.(this); }
    if (this.t >= this.max) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const fallK = Math.min(1, this.t / this.fall);
    const yBottom = Math.round(-10 + (y + 10) * fallK);
    const after = Math.max(0, this.t - this.fall) / (this.max - this.fall);
    const fade = after < 0.6 ? 1 : after < 0.8 ? 0.6 : 0.3;      // Ausblenden in Stufen
    // Breite in Stufen: Aufblitzen beim Einschlag, dann ruhige Säule, zum Ende schmaler
    const flare = this.landed && after < 0.08 ? 1 : 0;
    const shrink = after > 0.8 ? 1 : 0;
    const core = Math.max(0, this.tier - 1 + flare - shrink);     // halbe Breiten
    const mid = core + 1 + this.tier + flare - shrink;
    const outer = mid + 2;
    const [r, g, b] = this.rgb;
    ctx.globalCompositeOperation = 'lighter';
    const band = 22;
    for (let j = 0; yBottom - j > 0; j += 2) {
      const bi = Math.floor(j / band);
      if (bi >= BEAM_BANDS.length) break;
      const a = BEAM_BANDS[bi] * fade, row = yBottom - j - 2;
      ctx.fillStyle = `rgba(${r},${g},${b},${(a * 0.75).toFixed(2)})`;
      ctx.fillRect(x - mid, row, mid * 2 + 1, 2);
      ctx.fillStyle = `rgba(255,248,220,${a.toFixed(2)})`;
      ctx.fillRect(x - core, row, core * 2 + 1, 2);
      // geditherter Rand: jedes zweite Pixel, versetzt je Zeile
      ctx.fillStyle = `rgba(${r},${g},${b},${(a * 0.45).toFixed(2)})`;
      for (let i = mid + 1; i <= outer; i++) {
        const o = ((i + (j >> 1)) & 1);
        ctx.fillRect(x - i, row + o, 1, 1); ctx.fillRect(x + i, row + 1 - o, 1, 1);
      }
    }
    if (this.landed) {
      // Funken steigen in der Säule auf
      ctx.fillStyle = `rgba(255,248,220,${fade})`;
      for (const m of this.motes) {
        const p = (m.o + this.t * m.s) % 1;
        ctx.fillRect(x + m.dx * (core + 1), Math.round(y - 4 - p * 70), 1, 1);
      }
      // Bodenring aus kreisenden Pixelfunken, beim Einschlag kurz weiter
      const rr = 6 + this.tier * 3 + (after < 0.15 ? Math.round((0.15 - after) * 60) : 0);
      const n = 10 + this.tier * 4;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + this.t * 2.2;
        const on = (i + Math.floor(this.t * 12)) % 3 !== 0;
        if (!on) continue;
        ctx.fillStyle = i % 2 ? `rgba(255,248,220,${fade})` : `rgba(${r},${g},${b},${fade})`;
        ctx.fillRect(Math.round(x + Math.cos(ang) * rr), Math.round(y + Math.sin(ang) * rr * 0.4), 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Goldfontäne (Quest abgeschlossen, große Goldfunde): Münzen springen im Bogen
// aus dem Boden und blitzen beim Drehen auf.
export class CoinFountain extends Entity {
  constructor(x, y, { count = 14, life = 1.1, spread = 1 } = {}) {
    super(x, y);
    this.life = this.max = life;
    this.coins = Array.from({ length: count }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6 * spread, s = 50 + Math.random() * 60;
      return { x: 0, y: 0, z: 0, vx: Math.cos(a) * s * 0.7, vy: (Math.random() - 0.5) * 12, vz: -Math.sin(a) * s + 30, ph: Math.random() * 6, d: Math.random() * 0.2 };
    });
  }
  update(dt) {
    this.life -= dt;
    const age = this.max - this.life;
    for (const c of this.coins) {
      if (age < c.d) continue;
      c.vz -= 260 * dt; c.z += c.vz * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.z < 0) { c.z = 0; c.vz = Math.abs(c.vz) > 30 ? -c.vz * 0.35 : 0; c.vx *= 0.6; }
    }
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const age = this.max - this.life, fade = Math.min(1, (this.life / this.max) * 3);
    ctx.globalAlpha = fade;
    for (const c of this.coins) {
      if (age < c.d) continue;
      const x = Math.round(this.x + c.x - cx), y = Math.round(this.y + c.y - c.z - cy);
      const spin = Math.abs(Math.sin(age * 12 + c.ph));
      const w = spin > 0.66 ? 3 : spin > 0.25 ? 2 : 1;
      ctx.fillStyle = '#b8862a'; ctx.fillRect(x - (w >> 1), y - 1, w, 3);
      ctx.fillStyle = spin > 0.9 ? '#ffffff' : '#ffd66a'; ctx.fillRect(x - (w >> 1), y - 1, Math.max(1, w - 1), 2);
    }
    ctx.globalAlpha = 1;
  }
}
