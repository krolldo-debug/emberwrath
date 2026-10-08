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
// Pfeilform als Pixelmaske, Spitze in Richtung `ang` (Bildraum), auf 8 Richtungen gerastet.
// Gerade: ">" mit 45°-Stufen; schräg: rechter Winkel, dessen Ecke in Laufrichtung zeigt.
const CHEVRONS = new Map();
export function chevronMask(ang, big) {
  const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8, key = idx * 2 + (big ? 1 : 0);
  if (CHEVRONS.has(key)) return CHEVRONS.get(key);
  const pts = [], n = big ? 4 : 3, th = big ? 2 : 1;
  if (idx % 2 === 0) {
    for (let r = -n; r <= n; r++) for (let t = 0; t < th; t++) pts.push([n - Math.abs(r) - t - Math.round(n / 2), r]);
  } else {
    for (let i = 0; i <= n + 1; i++) for (let t = 0; t < th; t++) { pts.push([1 - t, 1 - i]); pts.push([1 - i, 1 - t]); }
  }
  // um Vielfache von 90° drehen: (x, y) → (−y, x)
  let out = pts;
  for (let q = 0; q < (idx >> 1); q++) out = out.map(([x, y]) => [-y, x]);
  const uniq = [...new Map(out.map((p) => [p[0] * 64 + p[1], p])).values()];
  CHEVRONS.set(key, uniq);
  return uniq;
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
  // Linienraum: (u, v) → Fußpunkt + u · Richtung + v · Normale (genau die Geometrie der Trefferprüfung)
  #lineFrame(ctx, cx, cy) {
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75;
    ctx.transform(dx, dy, -dy, dx, this.x - cx, this.y - cy);
  }
  #path(ctx, cx, cy, scale = 1) {
    const x = this.x - cx, y = this.y - cy;
    ctx.beginPath();
    if (this.shape === 'circle') ctx.ellipse(x, y, this.r * scale, this.r * 0.6 * scale, 0, 0, Math.PI * 2);
    else if (this.shape === 'arc') {
      ctx.moveTo(x, y);
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = this.angle - this.arc / 2 + (this.arc * i) / n;
        ctx.lineTo(x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale);
      }
      ctx.closePath();
    } else {
      const hw = this.width / 2, L = Math.max(0.5, this.len * scale);
      ctx.save();
      this.#lineFrame(ctx, cx, cy);
      ctx.rect(0, -hw, L, hw * 2);
      ctx.restore();
    }
  }
  // Weicher Verlauf passend zur Form: Mitte zart, Rand kräftig (wie eine glühende Bodenrune)
  #grad(ctx, cx, cy, inner, outer, scale = 1) {
    const x = this.x - cx, y = this.y - cy;
    if (this.shape === 'line') {
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, hw = this.width / 2;
      const nx = -dy, ny = dx;
      const gr = ctx.createLinearGradient(x + nx * hw, y + ny * hw, x - nx * hw, y - ny * hw);
      gr.addColorStop(0, outer); gr.addColorStop(0.5, inner); gr.addColorStop(1, outer);
      return gr;
    }
    const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, this.r * scale));
    gr.addColorStop(0, inner); gr.addColorStop(0.62, inner); gr.addColorStop(1, outer);
    return gr;
  }
  #fill(ctx, cx, cy, scale, inner, outer) {
    ctx.save();
    if (this.shape !== 'line') {
      // Elliptischer Verlauf: im 0,6-gestauchten Raum zeichnen
      const y = this.y - cy;
      ctx.translate(0, y); ctx.scale(1, 0.6); ctx.translate(0, -y);
      ctx.fillStyle = this.#grad(ctx, cx, cy, inner, outer, scale);
      ctx.translate(0, y); ctx.scale(1, 1 / 0.6); ctx.translate(0, -y);
    } else ctx.fillStyle = this.#grad(ctx, cx, cy, inner, outer, scale);
    this.#path(ctx, cx, cy, scale);
    ctx.fill();
    ctx.restore();
  }
  #k() { return Math.min(1, this.t / this.duration); }
  #fillScale(k) { return this.shape === 'line' ? k : Math.max(0.05, k); }
  // Lit-Pass: zarte, durchscheinende Fläche, die sich bis zum Schlag füllt
  render(ctx, cx, cy) {
    const k = this.#k(), [r, g, b] = this.color;
    if (this.shape === 'line' && this.width < 8) return; // schmale Strahlen: nur der Pixelstrahl im Emissive-Pass
    const intro = Math.min(1, this.t / 0.12);
    // Kühle Farben (Wasser, Eis, Gift) wirken auf dunklem Boden heller: Fläche etwas zarter
    const cool = b > r || g > r ? 0.75 : 1;
    const rgba = (m, a) => `rgba(${r * m | 0},${g * m | 0},${b * m | 0},${a * cool})`;
    ctx.save();
    ctx.globalAlpha = intro;
    this.#fill(ctx, cx, cy, 1, rgba(0.4, 0.04), rgba(0.6, 0.1));
    if (k > 0.02) this.#fill(ctx, cx, cy, this.#fillScale(k), rgba(0.9, 0.04 + 0.04 * k), rgba(1, 0.09 + 0.07 * k));
    ctx.restore();
  }
  // Umriss als Pixelpunkte (ganzzahlig, ohne Kantenglättung – passt zum Pixelstil)
  #outline(cx, cy, scale = 1, grow = 0) {
    const ox = this.x - cx, oy = this.y - cy, pts = new Map();
    const put = (x, y) => { const px = Math.round(x), py = Math.round(y); pts.set(px * 4096 + py, [px, py]); };
    // Bresenham: genau ein Pixel breite Kanten ohne Doppelpunkte
    const seg = (x0, y0, x1, y1) => {
      let x = Math.round(x0), y = Math.round(y0);
      const X = Math.round(x1), Y = Math.round(y1), dx = Math.abs(X - x), dy = -Math.abs(Y - y), sx = x < X ? 1 : -1, sy = y < Y ? 1 : -1;
      let err = dx + dy;
      for (;;) { put(x, y); if (x === X && y === Y) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } }
    };
    if (this.shape === 'line') {
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, d = Math.hypot(dx, dy), g = grow / d;
      const hw = this.width / 2 + g, L = this.len * scale + g;
      const P = (u, v) => [ox + dx * u - dy * v, oy + dy * u + dx * v];
      const c = [P(-g, -hw), P(L, -hw), P(L, hw), P(-g, hw)];
      for (let i = 0; i < 4; i++) seg(...c[i], ...c[(i + 1) % 4]);
    } else {
      const R = this.r * scale + grow, Ry = this.r * 0.6 * scale + grow, full = this.shape === 'circle';
      const a0 = full ? 0 : this.angle - this.arc / 2, span = full ? Math.PI * 2 : this.arc;
      // Stützpunkte etwa alle 2 px, dazwischen Bresenham: saubere, einfache Pixelkontur
      const n = Math.max(12, Math.ceil(R * span / 2));
      let px = ox + Math.cos(a0) * R, py = oy + Math.sin(a0) * Ry;
      for (let i = 1; i <= n; i++) { const a = a0 + span * i / n, qx = ox + Math.cos(a) * R, qy = oy + Math.sin(a) * Ry; seg(px, py, qx, qy); px = qx; py = qy; }
      if (!full) { seg(ox, oy, ox + Math.cos(a0) * R, oy + Math.sin(a0) * Ry); seg(ox, oy, ox + Math.cos(a0 + span) * R, oy + Math.sin(a0 + span) * Ry); }
    }
    return [...pts.values()];
  }
  #dots(ctx, pts, size = 1) { for (const [x, y] of pts) ctx.fillRect(x, y, size, size); }
  // Emissive-Pass: Pixel-Umriss (dunkle Kante + Glutrand), wandernde Schlagkante, Runenzeichen
  // bzw. Laufpfeile und aufsteigende Funken. Kurz vor dem Schlag blinkt der Rand heller.
  renderEmissive(ctx, cx, cy) {
    const k = this.#k(), [r, g, b] = this.color;
    const thin = this.shape === 'line' && this.width < 8, cool = b > r || g > r;
    const intro = Math.min(1, this.t / 0.12);
    const hot = k > 0.7 && Math.sin(this.t * 24) > 0;
    const lite = (m) => `rgb(${Math.round(r + (255 - r) * m)},${Math.round(g + (255 - g) * m)},${Math.round(b + (255 - b) * m)})`;
    ctx.save();
    // Farbschleier, damit der Farbcode auch auf dunklem Boden erhalten bleibt
    ctx.globalAlpha = (0.03 + 0.04 * k) * intro;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.#path(ctx, cx, cy);
    ctx.fill();
    if (thin) this.#thinBeam(ctx, cx, cy, k, intro, hot, lite);
    else {
      if (this.shape === 'line') this.#chevrons(ctx, cx, cy, k, intro, lite);
      else this.#runes(ctx, cx, cy, k, intro, lite);
      // Wachsende Schlagkante
      if (k > 0.06 && k < 0.88) {
        ctx.globalAlpha = 0.7 * intro; ctx.fillStyle = lite(0.4);
        this.#dots(ctx, this.#outline(cx, cy, this.#fillScale(k)));
      }
      // Rand: dunkle Pixelkante rundum, darauf der Glutrand
      ctx.globalAlpha = 0.55 * intro; ctx.fillStyle = 'rgb(14,6,10)';
      this.#dots(ctx, this.#outline(cx, cy, 1, 1));
      ctx.globalAlpha = intro; ctx.fillStyle = lite(hot ? 0.6 : cool ? 0.2 : 0.35);
      this.#dots(ctx, this.#outline(cx, cy));
      this.#embers(ctx, cx, cy, intro, lite);
    }
    ctx.restore();
  }
  // Pseudozufall pro Index (stabil zwischen Frames, kein Flimmern)
  static #h(i) { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
  // Punkt auf dem Rand für Anteil q (bei line: auf einer der Längskanten)
  #edgePoint(q, cx, cy, scale = 1) {
    const x = this.x - cx, y = this.y - cy;
    if (this.shape === 'circle') { const a = q * Math.PI * 2; return [x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale]; }
    if (this.shape === 'arc') { const a = this.angle - this.arc / 2 + this.arc * q; return [x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale]; }
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, hw = this.width / 2, u = q * 2 % 1 * this.len, v = q < 0.5 ? -hw : hw;
    return [x + dx * u - dy * v, y + dy * u + dx * v];
  }
  // Runenzeichen: kleine Pixelrauten auf einem inneren Ring, der langsam kreist
  #runes(ctx, cx, cy, k, intro, lite) {
    const arc = this.shape === 'arc';
    const n = Math.max(arc ? 4 : 6, Math.round(this.r / (arc ? 14 : 9))), rot = arc ? 0 : this.t * 0.06;
    const big = this.r >= 40;
    ctx.globalAlpha = (0.45 + 0.4 * k) * intro;
    ctx.fillStyle = lite(0.35 + 0.35 * k);
    for (let i = 0; i < n; i++) {
      const q = arc ? (i + 0.5) / n : (i / n + rot) % 1;
      const [fx, fy] = this.#edgePoint(q, cx, cy, 0.78);
      const x = Math.round(fx), y = Math.round(fy);
      ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
      if (big) { ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1); }
    }
  }
  // Laufpfeile entlang der Angriffsrichtung: handgesetzte Pixelformen in 8 Richtungen (keine gedrehten Linien)
  #chevrons(ctx, cx, cy, k, intro, lite) {
    const hw = this.width / 2, big = this.width >= 24, gap = Math.max(16, Math.round(this.width * 0.9)), L = this.len, span = big ? 6 : 4;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, d = Math.hypot(dx, dy), ox = this.x - cx, oy = this.y - cy;
    const mask = chevronMask(Math.atan2(dy, dx), big);
    const off = (this.t * 60) % gap, front = L * k, step = span / d;
    for (let u0 = off + 3; u0 < L - step - 3; u0 += gap) {
      // Pfeil, den die Schlagkante gerade kreuzt, auslassen (kein abgeschnittener Pfeil)
      if (front > u0 - 2 && front < u0 + step + 2) continue;
      const done = u0 + step < front, uc = u0 + step / 2;
      ctx.globalAlpha = (done ? 0.75 : 0.4) * intro;
      ctx.fillStyle = lite(done ? 0.6 : 0.3);
      const X = Math.round(ox + dx * uc), Y = Math.round(oy + dy * uc);
      for (const [mx, my] of mask) ctx.fillRect(X + mx, Y + my, 1, 1);
    }
  }
  // Schmale Strahlen (Pfeile, Speere, Stacheln): Pixelstrahl, zur Spitze schwächer, mit wanderndem Lichtpunkt
  #thinBeam(ctx, cx, cy, k, intro, hot, lite) {
    const x = this.x - cx, y = this.y - cy;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, L = this.len;
    // Ein einzelner, sauberer Pixelstrahl (Bresenham), zur Spitze hin schwächer
    const X0 = Math.round(x), Y0 = Math.round(y), X1 = Math.round(x + dx * L), Y1 = Math.round(y + dy * L);
    const ax = Math.abs(X1 - X0), ay = -Math.abs(Y1 - Y0), sx = X0 < X1 ? 1 : -1, sy = Y0 < Y1 ? 1 : -1, n = Math.max(ax, -ay) || 1;
    let px = X0, py = Y0, err = ax + ay, i = 0;
    ctx.fillStyle = lite(hot ? 0.6 : 0.35);
    for (;;) {
      ctx.globalAlpha = (0.9 - 0.75 * (i++ / n)) * intro;
      ctx.fillRect(px, py, 1, 1);
      if (px === X1 && py === Y1) break;
      const e2 = 2 * err;
      if (e2 >= ay) { err += ay; px += sx; }
      if (e2 <= ax) { err += ax; py += sy; }
    }
    // Wandernder Lichtpunkt zeigt Richtung und Zeitpunkt
    ctx.globalAlpha = intro; ctx.fillStyle = lite(0.75);
    ctx.fillRect(Math.round(x + dx * L * k), Math.round(y + dy * L * k), 2, 1);
  }
  // Aufsteigende Funken am Rand
  #embers(ctx, cx, cy, intro, lite) {
    const size = this.shape === 'line' ? this.len / 16 : this.r / 6;
    const n = Math.min(18, Math.max(3, Math.round(size)));
    ctx.fillStyle = lite(0.65);
    for (let i = 0; i < n; i++) {
      const h1 = Telegraph.#h(i + 1), h2 = Telegraph.#h(i + 37);
      const ph = (this.t * (0.6 + h2 * 0.6) + h1) % 1;
      const [px, py] = this.#edgePoint(h1, cx, cy, 0.96);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8 * intro;
      ctx.fillRect(Math.round(px + Math.sin(ph * 6 + i)), Math.round(py - ph * 12), 1, 1);
    }
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
