import { Entity } from './Entity.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';

// Bodenwarnungen für Boss-Angriffe: zeigen VOR dem Treffer, wo es gefährlich
// wird. Die Innenfläche füllt sich bis zum Zeitpunkt des Schlags.
//   shape: 'circle' { r } | 'arc' { r, angle, arc } | 'line' { angle, len, width, screen }
// Konventionen (gelten auch für die Trefferprüfung in Combat.update):
//   circle/arc: Ellipse mit 0,6-facher Höhe um den Fußpunkt; `angle` des Bogens gilt im
//     Ellipsenraum, d. h. getroffen wird, wer bei atan2((y - y0) / 0.6, x - x0) im Bogen steht.
//   line: Standard (Bodenraum): Richtung (cos a, sin a · 0,75), Länge len in diesem Raum –
//     passend zu Angriffen, die sich selbst mit 0,75 gestaucht bewegen (Wellen, Ranken …).
//     Mit `screen: true` gilt Bildraum: Richtung (cos a, sin a), Länge len in Pixeln – passend zu
//     allem, was sich unverzerrt bewegt (Ansturm, Geschosse mit vx = cos·v, vy = sin·v).
//     Intern wird dafür der Winkel in den Bodenraum umgerechnet, die Zeichnung bleibt dieselbe.
export function screenLine(angle, len) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { angle: Math.atan2(s / 0.75, c), len: len * Math.hypot(c, s / 0.75) };
}
export class Telegraph extends Entity {
  constructor(x, y, { shape = 'circle', r = 30, angle = 0, arc = Math.PI, len = 100, width = 16, duration = 1, follow = null, color = [255, 70, 50], screen = false }) {
    super(x, y);
    if (shape === 'line' && screen) ({ angle, len } = screenLine(angle, len));
    Object.assign(this, { shape, r, angle, arc, len, width, duration, follow, color });
    this.t = 0;
    this.sortOffset = -20000; // liegt auf dem Boden, unter allen Figuren
  }
  update(dt, world) {
    this.t += dt;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (!this.light) {
      // Rotes Licht färbt Boden UND wer darin steht – gut lesbar auch im Dunkeln
      const line = this.shape === 'line';
      const lx = line ? this.x + Math.cos(this.angle) * this.len / 2 : this.x;
      const ly = line ? this.y + Math.sin(this.angle) * this.len * 0.375 : this.y;
      this.light = world.addLight(new Light({ x: lx, y: ly, radius: line ? Math.max(30, this.len * 0.6) : this.r * 1.3, color: this.color, intensity: 0.5, flicker: 0, ttl: this.duration, bloom: 0 }));
    }
    if (this.follow) { this.light.x = this.x; this.light.y = this.y; }
    if (this.t >= this.duration) this.removed = true;
  }
  #path(ctx, cx, cy, scale = 1) {
    const x = this.x - cx, y = this.y - cy;
    ctx.beginPath();
    if (this.shape === 'circle') ctx.ellipse(x, y, this.r * scale, this.r * 0.6 * scale, 0, 0, Math.PI * 2);
    else if (this.shape === 'arc') {
      ctx.moveTo(x, y);
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const a = this.angle - this.arc / 2 + (this.arc * i) / n;
        ctx.lineTo(x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale);
      }
      ctx.closePath();
    } else {
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75;
      const nx = -dy, ny = dx, hw = this.width / 2, L = this.len * scale;
      ctx.moveTo(x + nx * hw, y + ny * hw);
      ctx.lineTo(x + dx * L + nx * hw, y + dy * L + ny * hw);
      ctx.lineTo(x + dx * L - nx * hw, y + dy * L - ny * hw);
      ctx.lineTo(x - nx * hw, y - ny * hw);
      ctx.closePath();
    }
  }
  // Lit-Pass: Fläche liegt unter den Figuren und füllt sich bis zum Schlag
  render(ctx, cx, cy) {
    const k = Math.min(1, this.t / this.duration);
    const [r, g, b] = this.color;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = `rgb(${r * 0.5 | 0},${g * 0.3 | 0},${b * 0.3 | 0})`;
    this.#path(ctx, cx, cy);
    ctx.fill();
    ctx.globalAlpha = 0.35 + 0.4 * k;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.#path(ctx, cx, cy, this.shape === 'line' ? k : Math.max(0.05, k));
    ctx.fill();
    ctx.restore();
  }
  // Emissive-Pass: lesbarer Rand auf jedem Boden – dunkle Kontur außen/innen, darauf ein heller,
  // zur Gefahrenfarbe getönter Rand. Dazu die wachsende Innenkante (Zeitpunkt des Schlags)
  // und ein leichter Farbschleier, damit der Farbcode auch im Dunkeln erhalten bleibt.
  renderEmissive(ctx, cx, cy) {
    const k = Math.min(1, this.t / this.duration);
    const [r, g, b] = this.color;
    const thin = this.shape === 'line' && this.width < 8;
    const pulse = k > 0.7 ? 0.5 + 0.5 * Math.sin(this.t * 26) : 0;
    const lite = (v, m) => Math.min(255, Math.round(v + (255 - v) * m));
    ctx.save();
    ctx.lineJoin = 'round';
    // Farbschleier (nach der Beleuchtung, also auch auf dunklem Boden in Gefahrenfarbe)
    ctx.globalAlpha = 0.05 + 0.08 * k;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.#path(ctx, cx, cy);
    ctx.fill();
    // Wachsende Innenkante: zeigt, wann der Schlag kommt
    if (k > 0.08 && k < 0.99) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = `rgb(${lite(r, 0.35)},${lite(g, 0.35)},${lite(b, 0.35)})`;
      ctx.lineWidth = 1;
      this.#path(ctx, cx, cy, this.shape === 'line' ? k : Math.max(0.05, k));
      ctx.stroke();
    }
    // Dunkle Kontur
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgb(10,6,12)';
    ctx.lineWidth = thin ? 2.5 : 3;
    this.#path(ctx, cx, cy);
    ctx.stroke();
    // Heller Rand (kurz vor dem Schlag fast weiß und pulsierend)
    const m = 0.55 + 0.35 * pulse;
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = `rgb(${lite(r, m)},${lite(g, m)},${lite(b, m)})`;
    ctx.lineWidth = 1;
    this.#path(ctx, cx, cy);
    ctx.stroke();
    ctx.restore();
  }
}

// Ringförmige Druckwelle, die sich ausbreitet. Wer im Ring steht, wird getroffen
// (Ausweichrolle schützt). Trifft den Helden höchstens einmal.
// harmless: nur sichtbar (z. B. Brüllen beim Phasenwechsel), kein Treffer.
export class DamageWave extends Entity {
  constructor(x, y, owner, { maxR = 110, duration = 0.8, damage = 12, color = [170, 110, 255], harmless = false }) {
    super(x, y);
    Object.assign(this, { owner, maxR, duration, damage, color, harmless });
    this.t = 0; this.hitDone = false; this.sortOffset = -19000;
  }
  get r() { return 6 + (this.maxR - 6) * Math.min(1, this.t / this.duration); }
  update(dt, world) {
    this.t += dt;
    if (this.t >= this.duration) { this.removed = true; return; }
    const h = world.hero;
    // Nach dem Tod des Verursachers läuft die Welle nur noch optisch aus
    if (this.harmless || this.hitDone || h.dead || this.owner?.dead) return;
    const dx = h.x - this.x, dy = (h.y - this.y) / 0.6;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - this.r) < 7) {
      const l = d || 1;
      const hit = { damage: this.damage, dirX: dx / l, dirY: dy / l, knockback: 160, source: this.owner };
      if (h.takeHit(hit)) {
        this.hitDone = true;
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: true, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
      } else if (h.dodgedTimer > 0) this.hitDone = true;
    }
  }
  renderEmissive(ctx, cx, cy) {
    const k = this.t / this.duration;
    const [r, g, b] = this.color;
    ctx.save();
    ctx.globalAlpha = 1 - k * 0.8;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(this.x - cx, this.y - cy, this.r, this.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.6;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(this.x - cx, this.y - cy, this.r - 2, (this.r - 2) * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// Kleiner Helfer, damit Boss-Banner nicht an UI-Details hängen.
export function bossBanner(world, title, sub) {
  world.bus.emit(EV.UI_BANNER, { title, sub, color: '#c080ff' });
}
