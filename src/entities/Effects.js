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

// Schadenszahl: springt im Bogen zur Seite (abwechselnd links/rechts, damit sich
// Zahlen nicht stapeln), „ploppt“ beim Erscheinen. Krit: erst weiß und groß,
// dann gold mit kurzem Zittern. kind: 'normal' | 'crit' | 'kill'
let dmgSide = 1;
export class DamageNumber extends Entity {
  constructor(x, y, text, { font, kind = 'normal', color } = {}) {
    super(x, y);
    this.text = String(text); this.font = font; this.kind = kind;
    this.crit = kind === 'crit';
    this.color = color ?? (this.crit ? '#ffe070' : kind === 'kill' ? '#ffc890' : '#ffffff');
    this.life = this.max = this.crit ? 1.0 : 0.75;
    dmgSide = -dmgSide;
    this.vx = dmgSide * (14 + Math.random() * 16) * (this.crit ? 0.6 : 1);
    this.vy = this.crit ? -64 : -78;
    this.z = 0;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 150 * dt;                 // Bogen: steigt, wird langsamer, sinkt leicht
    this.vx *= Math.exp(-dt * 2.5);
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const age = this.max - this.life;
    let scale = this.crit ? 2 : 1, color = this.color, jx = 0, jy = 0;
    if (this.crit) {
      if (age < 0.07) { scale = 3; color = '#ffffff'; }
      else if (age < 0.22) { jx = Math.round((Math.random() - 0.5) * 2); jy = Math.round((Math.random() - 0.5) * 2); }
    } else if (age < 0.05) scale = 2;
    ctx.globalAlpha = Math.min(1, this.life / (this.max * 0.35));
    const x = Math.round(this.x - cx) + jx, y = Math.round(this.y - cy) + jy;
    if (this.crit && age < 0.3) {
      // Glanzstern hinter der Krit-Zahl
      const k = age / 0.3, r = Math.round(4 + k * 10);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,224,112,${(1 - k) * 0.5})`;
      ctx.fillRect(x - r, y + 4, r * 2 + 1, 1);
      ctx.fillRect(x, y + 4 - Math.round(r / 2), 1, r + 1);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.font.draw(ctx, this.text, x, y, { color, scale, align: 'center', outline: true });
    ctx.globalAlpha = 1;
  }
}

// Seelenfunke (EP-Kugel): springt aus dem besiegten Gegner, schwebt kurz und
// fliegt dann beschleunigt in den Helden. onAbsorb() beim Ankommen (Klang, Funken).
export class XpOrb extends Entity {
  constructor(x, y, target, { color = '#c6a8ff', delay = 0.32, onAbsorb = null } = {}) {
    super(x, y);
    this.target = target; this.rgb = hexRgb(color); this.onAbsorb = onAbsorb;
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 50;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s * 0.6;
    this.z = 4; this.vz = 50 + Math.random() * 50;
    this.t = 0; this.delay = delay + Math.random() * 0.15; this.speed = 0;
    this.trail = [];
    this.ph = Math.random() * 6;
  }
  update(dt) {
    this.t += dt;
    const h = this.target;
    if (!h || h.removed || h.dead || this.t > 3) { this.removed = true; return; }
    this.trail.unshift([this.x, this.y - this.z]); if (this.trail.length > 5) this.trail.pop();
    if (this.t < this.delay) {
      // Auswurf mit kleinem Sprung
      this.vz -= 220 * dt; this.z = Math.max(0, this.z + this.vz * dt);
      const f = Math.exp(-dt * 4); this.vx *= f; this.vy *= f;
      this.x += this.vx * dt; this.y += this.vy * dt;
      return;
    }
    // Heimflug: Geschwindigkeit wächst, Kurve durch Restschwung
    const tx = h.x, ty = h.y - (h.bodyHeight ?? 16) * 0.55;
    const dx = tx - this.x, dy = ty - (this.y - this.z), d = Math.hypot(dx, dy);
    this.speed = Math.min(420, this.speed + 900 * dt);
    if (d < 5 + this.speed * dt) { this.removed = true; this.onAbsorb?.(this); return; }
    const k = Math.min(1, dt * 10);
    this.vx += ((dx / d) * this.speed - this.vx) * k;
    this.vy += ((dy / d) * this.speed - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.z = Math.max(0, this.z - dt * 30);
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 18 + this.ph);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < this.trail.length; i++) {
      const [tx, ty] = this.trail[i];
      ctx.fillStyle = rgbStr(this.rgb, 0.45 * (1 - i / this.trail.length));
      ctx.fillRect(Math.round(tx - cx), Math.round(ty - cy), 1, 1);
    }
    ctx.fillStyle = rgbStr(this.rgb, 0.3 * pulse);
    ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = rgbStr(this.rgb, 0.9);
    ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Stufenaufstieg: Runenkreis am Boden dehnt sich und dreht, Lichtstrahlen
// steigen rundherum auf, Funken wirbeln spiralförmig nach oben. Folgt dem Helden.
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
    const fade = Math.min(1, (this.life / this.max) * 3);
    const open = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
    ctx.globalCompositeOperation = 'lighter';
    // Runenkreis: zwei Ringe, dazwischen drehende Zeichen
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
      ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
      ctx.fillRect(px, py - 1, 1, 3); if (i % 2) ctx.fillRect(px - 1, py, 3, 1);
    }
    // aufsteigende Lichtstrahlen am Kreisrand
    for (const ray of this.rays) {
      const t = Math.max(0, Math.min(1, (k - ray.d) * 2.2));
      if (t <= 0 || t >= 1) continue;
      const px = Math.round(x + Math.cos(ray.a + spin * 0.5) * r * 0.9), py = Math.round(y + Math.sin(ray.a + spin * 0.5) * r * 0.4);
      const hgt = Math.round(ray.h * Math.sin(t * Math.PI));
      for (let j = 0; j < hgt; j++) {
        const f = 1 - j / hgt;
        ctx.fillStyle = j < 3 ? `rgba(255,255,255,${0.8 * f})` : rgbStr(this.rgb, 0.55 * f);
        ctx.fillRect(px, py - j, 1, 1);
      }
    }
    // Funkenspirale
    for (let i = 0; i < 14; i++) {
      const ph = (k * 1.4 + i / 14) % 1;
      const a = i * 2.4 + ph * 7, rr = (1 - ph) * r * 0.8;
      ctx.fillStyle = ph < 0.5 ? `rgba(255,255,255,${(1 - ph) * fade})` : rgbStr(this.rgb, (1 - ph) * fade);
      ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y - 4 - ph * 46 + Math.sin(a) * rr * 0.4), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Beute-Strahl: Für seltene, epische und legendäre Beute schlägt ein Lichtstrahl in
// Seltenheitsfarbe vom Himmel ein und folgt dem Beutestück, bis es liegt.
// Das Beutestück wird über dropId gesucht (C spawnt es nach dem Ereignis).
// onLand() beim Einschlag (Ring, Klang, Wackeln aus dem Feedback).
export class LootBeam extends Entity {
  constructor(x, y, { dropId, rgb = [255, 214, 106], tier = 1, onLand = null } = {}) {
    super(x, y);
    this.dropId = dropId; this.rgb = rgb; this.tier = tier; this.onLand = onLand;
    this.drop = null; this.t = 0; this.landed = false;
    this.fall = 0.16;                         // Zeit, bis der Strahl den Boden erreicht
    this.max = 0.9 + tier * 0.35;
  }
  update(dt, world) {
    this.t += dt;
    if (!this.drop && this.dropId) this.drop = world?.entities?.find((e) => e.drop?.dropId === this.dropId) ?? null;
    if (this.drop) {
      if (this.drop.removed) this.t = Math.max(this.t, this.max - 0.15);
      this.x = this.drop.x; this.y = this.drop.y;
    }
    if (!this.landed && this.t >= this.fall) { this.landed = true; this.onLand?.(this); }
    if (this.t >= this.max) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const top = -10;                               // Strahl beginnt knapp über dem oberen Bildrand
    const fallK = Math.min(1, this.t / this.fall);
    const yBottom = Math.round(top + (y - top) * fallK);
    const after = Math.max(0, this.t - this.fall) / (this.max - this.fall);
    const fade = this.landed ? Math.pow(1 - after, 1.4) : 1;
    const w = Math.max(1, Math.round((2 + this.tier * 2) * (this.landed ? 1 - after * 0.6 : 0.6)));
    ctx.globalCompositeOperation = 'lighter';
    // Säule in Abschnitten: unten hell, nach oben ausblendend (wirkt wie Licht, nicht wie ein Laser)
    const len = 110 + this.tier * 40, step = 3;
    for (let j = 0; j < len && yBottom - j > 0; j += step) {
      const v = 1 - j / len, rowA = v * v * fade;
      // weicher Lichthof neben der Säule (breiter bei höherer Seltenheit)
      const halo = w + 1 + this.tier * 2;
      ctx.fillStyle = rgbStr(this.rgb, (0.14 * rowA).toFixed(3));
      ctx.fillRect(x - halo, yBottom - j - step, halo * 2 + 1, step);
      for (let i = -w; i <= w; i++) {
        const edge = Math.abs(i) / (w + 1);
        ctx.fillStyle = edge < 0.3 ? `rgba(255,255,255,${(0.85 * rowA).toFixed(3)})` : rgbStr(this.rgb, ((1 - edge) * 0.6 * rowA).toFixed(3));
        ctx.fillRect(x + i, yBottom - j - step, 1, step);
      }
    }
    if (this.landed && after < 0.5) {
      // Einschlag: flacher Lichtfleck und Strahlenkranz
      const k = after / 0.5, r = Math.round(4 + k * (10 + this.tier * 6));
      ctx.fillStyle = rgbStr(this.rgb, (1 - k) * 0.7);
      ctx.fillRect(x - r, y, r * 2 + 1, 1);
      ctx.fillRect(x - Math.round(r * 0.6), y - 1, Math.round(r * 1.2) + 1, 3);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const l = r * (i % 2 ? 0.7 : 1.1);
        ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
        ctx.fillRect(Math.round(x + Math.cos(a) * l), Math.round(y - 4 + Math.sin(a) * l * 0.6), 1, 1);
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
