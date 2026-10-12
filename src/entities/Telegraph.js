import { Entity } from './Entity.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { fineRes } from '../gfx/Fine.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { ellipsePts, pixelRuns, drawRuns } from './Effects.js';

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
  // Form als Teilpfad (ohne beginPath); inset (nur Linie): Längskanten um so viele Weltpixel nach innen
  #shape(ctx, cx, cy, scale = 1, inset = 0) {
    const x = this.x - cx, y = this.y - cy;
    if (this.shape === 'circle') { ctx.moveTo(x + this.r * scale, y); ctx.ellipse(x, y, this.r * scale, this.r * 0.6 * scale, 0, 0, Math.PI * 2); }
    else if (this.shape === 'arc') {
      ctx.moveTo(x, y);
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = this.angle - this.arc / 2 + (this.arc * i) / n;
        ctx.lineTo(x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale);
      }
      ctx.closePath();
    } else {
      const hw = this.width / 2 - inset, L = Math.max(0.5, this.len * scale);
      ctx.save();
      this.#lineFrame(ctx, cx, cy);
      ctx.rect(0, -hw, L, hw * 2);
      ctx.restore();
    }
  }
  #path(ctx, cx, cy, scale = 1) { ctx.beginPath(); this.#shape(ctx, cx, cy, scale); }
  #k() { return Math.min(1, this.t / this.duration); }
  #fillScale(k) { return this.shape === 'line' ? k : Math.max(0.05, k); }
  // Einblenden in drei harten Stufen statt stetig
  #intro() { const v = this.t / 0.12; return v >= 1 ? 1 : v > 0.5 ? 0.66 : 0.33; }
  // Lit-Pass: flache, durchscheinende Fläche in harten Stufen (kein Verlauf): innen zart, am Rand ein kräftigeres
  // Band, dazu die Füllung, die bis zum Schlag wächst.
  render(ctx, cx, cy) {
    const k = this.#k(), [r, g, b] = this.color;
    if (this.shape === 'line' && this.width < 8) return; // schmale Strahlen: nur der Pixelstrahl im Emissive-Pass
    // Kühle Farben (Wasser, Eis, Gift) wirken auf dunklem Boden heller: Fläche etwas zarter
    const cool = b > r || g > r ? 0.75 : 1;
    const rgba = (m, a) => `rgba(${r * m | 0},${g * m | 0},${b * m | 0},${a * cool})`;
    const line = this.shape === 'line';
    ctx.save();
    ctx.globalAlpha = this.#intro();
    ctx.fillStyle = rgba(0.45, 0.06);
    this.#path(ctx, cx, cy);
    ctx.fill();
    // Randband: Ring zwischen voller Form und 82 % (Linie: Längskanten um 18 % der Breite nach innen)
    ctx.beginPath();
    this.#shape(ctx, cx, cy, 1);
    if (line) this.#shape(ctx, cx, cy, 1, this.width * 0.18); else this.#shape(ctx, cx, cy, 0.82);
    ctx.fillStyle = rgba(0.65, 0.1);
    ctx.fill('evenodd');
    if (k > 0.02) { ctx.fillStyle = rgba(0.95, k > 0.6 ? 0.16 : 0.11); this.#path(ctx, cx, cy, this.#fillScale(k)); ctx.fill(); }
    ctx.restore();
  }
  // Umriss als Feinpixel (Texel, relativ zum auf das Feinraster gerundeten Fußpunkt), Bresenham ohne Doppelpunkte.
  // grow in Texeln nach außen (negativ = nach innen).
  #outline(q, scale = 1, grow = 0) {
    const pts = new Map();
    const put = (x, y) => { const px = Math.round(x), py = Math.round(y); pts.set(px * 65536 + py, [px, py]); };
    const seg = (x0, y0, x1, y1) => {
      let x = Math.round(x0), y = Math.round(y0);
      const X = Math.round(x1), Y = Math.round(y1), dx = Math.abs(X - x), dy = -Math.abs(Y - y), sx = x < X ? 1 : -1, sy = y < Y ? 1 : -1;
      let err = dx + dy;
      for (;;) { put(x, y); if (x === X && y === Y) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } }
    };
    if (this.shape === 'line') {
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, d = Math.hypot(dx, dy), g = grow / d;
      const hw = (this.width / 2) * q + g, L = this.len * scale * q + g;
      const P = (u, v) => [dx * u - dy * v, dy * u + dx * v];
      const c = [P(-g, -hw), P(L, -hw), P(L, hw), P(-g, hw)];
      for (let i = 0; i < 4; i++) seg(...c[i], ...c[(i + 1) % 4]);
    } else {
      const R = this.r * scale * q + grow, Ry = this.r * 0.6 * scale * q + grow, full = this.shape === 'circle';
      const a0 = full ? 0 : this.angle - this.arc / 2, span = full ? Math.PI * 2 : this.arc;
      // Stützpunkte etwa alle 2 Texel, dazwischen Bresenham: saubere, einfache Pixelkontur
      const n = Math.max(12, Math.ceil(R * span / 2));
      let px = Math.cos(a0) * R, py = Math.sin(a0) * Ry;
      for (let i = 1; i <= n; i++) { const a = a0 + span * i / n, qx = Math.cos(a) * R, qy = Math.sin(a) * Ry; seg(px, py, qx, qy); px = qx; py = qy; }
      if (!full) { seg(0, 0, Math.cos(a0) * R, Math.sin(a0) * Ry); seg(0, 0, Math.cos(a0 + span) * R, Math.sin(a0 + span) * Ry); }
    }
    return [...pts.values()];
  }
  // Kontur als Bild (gecacht, neu nur bei geänderter Richtung oder Feinstufe): außen dunkle Kante, darauf der helle
  // Rand (im Feinraster 2 Feinpixel: außen heller, innen in der Farbe), innen eine zweite dunkle Kante. Die
  // Hell-Dunkel-Folge hält die Warnung auf hellem Schnee wie auf dunklem Waldboden lesbar.
  #contour(q, hot, lite) {
    const key = `${q}|${hot ? 1 : 0}|${Math.round(this.angle * 2000)}|${this.r}|${this.len}|${this.width}|${this.arc}`;
    const c = this.#ring;
    if (c?.key === key) return c;
    const cool = this.color[2] > this.color[0] || this.color[1] > this.color[0];
    const layers = q > 1
      ? [[2, [14, 6, 10, 200]], [-2, [14, 6, 10, 140]], [1, lite(hot ? 0.7 : cool ? 0.3 : 0.4)], [0, lite(hot ? 0.45 : cool ? 0.08 : 0.12)], [-1, hot ? lite(0.2) : this.color.map((v) => Math.round(v * 0.72))]]
      : [[1, [14, 6, 10, 140]], [0, lite(hot ? 0.6 : cool ? 0.2 : 0.35)]];
    const sets = layers.map(([g, col]) => [this.#outline(q, 1, g), col]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [pts] of sets) for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const W = x1 - x0 + 1, H = y1 - y0 + 1, buf = new Uint32Array(W * H);
    for (const [pts, [r, g, b, a = 255]] of sets) {
      const v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
      for (const [x, y] of pts) buf[(y - y0) * W + x - x0] = v;
    }
    const canvas = makeCanvas(W, H);
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.buffer), W, H), 0, 0);
    return (this.#ring = { key, canvas, x0, y0 });
  }
  #ring = null;
  // Emissive-Pass: Pixel-Kontur (dunkel – hell – dunkel), wandernde Schlagkante, Runenzeichen bzw. Laufpfeile und
  // aufsteigende Funken, alles in Feinpixeln. Kurz vor dem Schlag blinkt der Rand heller.
  renderEmissive(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    const k = this.#k(), [r, g, b] = this.color;
    const thin = this.shape === 'line' && this.width < 8;
    const intro = this.#intro();
    const hot = k > 0.7 && Math.sin(this.t * 24) > 0;
    const liteRgb = (m) => [Math.round(r + (255 - r) * m), Math.round(g + (255 - g) * m), Math.round(b + (255 - b) * m)];
    const lite = (m) => `rgb(${liteRgb(m).join(',')})`;
    const X = Math.round(this.x * q) / q - cx, Y = Math.round(this.y * q) / q - cy;   // Fußpunkt auf dem Feinraster
    ctx.save();
    // Farbschleier, damit der Farbcode auch auf dunklem Boden erhalten bleibt
    ctx.globalAlpha = (k > 0.5 ? 0.07 : 0.04) * intro;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.#path(ctx, cx, cy);
    ctx.fill();
    if (thin) this.#thinBeam(ctx, cx, cy, k, intro, hot, lite, q);
    else {
      if (this.shape === 'line') this.#chevrons(ctx, cx, cy, k, intro, lite, q);
      else this.#runes(ctx, cx, cy, k, intro, lite, q);
      // Wachsende Schlagkante (Feinpixel, eine Stufe heller als die Farbe)
      if (k > 0.06 && k < 0.88) {
        ctx.globalAlpha = 0.66 * intro; ctx.fillStyle = lite(0.4);
        drawRuns(ctx, X, Y, pixelRuns(this.#outline(q, this.#fillScale(k)).flat()), P);
      }
      // Kontur: vorgerechnetes Bild
      const c = this.#contour(q, hot, liteRgb);
      ctx.globalAlpha = intro;
      ctx.drawImage(c.canvas, X + c.x0 * P, Y + c.y0 * P, c.canvas.width * P, c.canvas.height * P);
      this.#embers(ctx, cx, cy, intro, lite, q);
    }
    ctx.restore();
  }
  // Pseudozufall pro Index (stabil zwischen Frames, kein Flimmern)
  static #h(i) { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
  // Punkt auf dem Rand für Anteil q (bei line: auf einer der Längskanten)
  #edgePoint(t, cx, cy, scale = 1) {
    const x = this.x - cx, y = this.y - cy;
    if (this.shape === 'circle') { const a = t * Math.PI * 2; return [x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale]; }
    if (this.shape === 'arc') { const a = this.angle - this.arc / 2 + this.arc * t; return [x + Math.cos(a) * this.r * scale, y + Math.sin(a) * this.r * 0.6 * scale]; }
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, hw = this.width / 2, u = t * 2 % 1 * this.len, v = t < 0.5 ? -hw : hw;
    return [x + dx * u - dy * v, y + dy * u + dx * v];
  }
  // Runenzeichen auf einem inneren Ring, der langsam kreist. Im Feinraster echte kleine Runen (drei Formen im
  // Wechsel, 5 × 5 bzw. 7 × 7 Feinpixel) mit hellem Kernpunkt; bei „Niedrig“ das alte Pixelkreuz.
  #runes(ctx, cx, cy, k, intro, lite, q) {
    const arc = this.shape === 'arc';
    const n = Math.max(arc ? 4 : 6, Math.round(this.r / (arc ? 14 : 9))), rot = arc ? 0 : this.t * 0.06;
    const big = this.r >= 40, P = 1 / q;
    ctx.globalAlpha = intro;
    ctx.fillStyle = lite(q > 1 ? 0.5 + 0.3 * k : 0.35 + 0.35 * k);
    for (let i = 0; i < n; i++) {
      const t = arc ? (i + 0.5) / n : (i / n + rot) % 1;
      const [fx, fy] = this.#edgePoint(t, cx, cy, 0.78);
      if (q === 1) {
        const x = Math.round(fx), y = Math.round(fy);
        ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
        if (big) { ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1); }
        continue;
      }
      const x = Math.round(fx * q) / q, y = Math.round(fy * q) / q;
      for (const [rx, ry] of RUNES[(i % 3) + (big ? 3 : 0)]) ctx.fillRect(x + rx * P, y + ry * P, P, P);
    }
    if (q > 1) {
      ctx.fillStyle = lite(0.85);
      for (let i = 0; i < n; i++) {
        const t = arc ? (i + 0.5) / n : (i / n + rot) % 1;
        const [fx, fy] = this.#edgePoint(t, cx, cy, 0.78);
        ctx.fillRect(Math.round(fx * q) / q, Math.round(fy * q) / q, P, P);
      }
    }
  }
  // Laufpfeile entlang der Angriffsrichtung: handgesetzte Pixelformen in 8 Richtungen (keine gedrehten Linien).
  // Feinraster: Pfeil in Weltpixeln, die Vorderkante (Spitze) eine Stufe heller in Feinpixeln.
  #chevrons(ctx, cx, cy, k, intro, lite, q) {
    const hw = this.width / 2, big = this.width >= 24, gap = Math.max(16, Math.round(this.width * 0.9)), L = this.len, span = big ? 6 : 4;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, d = Math.hypot(dx, dy), ox = this.x - cx, oy = this.y - cy;
    const ang = Math.atan2(dy, dx), mask = chevronMask(ang, big), P = 1 / q;
    const fx = Math.round(Math.cos(ang)), fy = Math.round(Math.sin(ang));   // Laufrichtung, auf Pixel gerundet
    const off = (this.t * 60) % gap, front = L * k, step = span / d;
    for (let u0 = off + 3; u0 < L - step - 3; u0 += gap) {
      // Pfeil, den die Schlagkante gerade kreuzt, auslassen (kein abgeschnittener Pfeil)
      if (front > u0 - 2 && front < u0 + step + 2) continue;
      const done = u0 + step < front, uc = u0 + step / 2;
      ctx.globalAlpha = (done ? 1 : 0.66) * intro;
      ctx.fillStyle = lite(done ? 0.6 : 0.3);
      const X = Math.round(ox + dx * uc), Y = Math.round(oy + dy * uc);
      for (const [mx, my] of mask) ctx.fillRect(X + mx, Y + my, 1, 1);
      if (q > 1) {
        ctx.fillStyle = lite(done ? 0.9 : 0.6);
        for (const [mx, my] of mask) ctx.fillRect(X + mx + (fx > 0 ? 1 - P : 0), Y + my + (fy > 0 ? 1 - P : 0), fx ? P : 1, fy ? P : (fx ? 1 : P));
      }
    }
  }
  // Schmale Strahlen (Pfeile, Speere, Stacheln): Pixelstrahl, zur Spitze schwächer, mit wanderndem Lichtpunkt.
  // Feinraster: Strahl 1 Weltpixel stark, mit dunkler Feinpixel-Kante zu beiden Seiten (lesbar auf hellem Boden).
  #thinBeam(ctx, cx, cy, k, intro, hot, lite, q) {
    const x = this.x - cx, y = this.y - cy;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75, L = this.len, P = 1 / q;
    // Ein einzelner, sauberer Pixelstrahl (Bresenham), zur Spitze hin schwächer
    const X0 = Math.round(x), Y0 = Math.round(y), X1 = Math.round(x + dx * L), Y1 = Math.round(y + dy * L);
    const ax = Math.abs(X1 - X0), ay = -Math.abs(Y1 - Y0), sx = X0 < X1 ? 1 : -1, sy = Y0 < Y1 ? 1 : -1, n = Math.max(ax, -ay) || 1;
    const flat = ax >= -ay;   // eher waagrecht: Kanten oben/unten, sonst links/rechts
    const pts = [];
    let px = X0, py = Y0, err = ax + ay;
    for (;;) {
      pts.push(px, py);
      if (px === X1 && py === Y1) break;
      const e2 = 2 * err;
      if (e2 >= ay) { err += ay; px += sx; }
      if (e2 <= ax) { err += ax; py += sy; }
    }
    // drei Helligkeitsstufen entlang des Strahls; je Stufe und Farbe ein Durchgang (wenige Zustandswechsel)
    const m = pts.length / 2, dark = 'rgb(14,6,10)', body = lite(hot ? 0.6 : 0.35), shine = lite(hot ? 0.85 : 0.6);
    for (let lvl = 0; lvl < 3; lvl++) {
      const i0 = Math.ceil((lvl / 3) * m), i1 = Math.ceil(((lvl + 1) / 3) * m);
      if (i1 <= i0) continue;
      ctx.globalAlpha = [1, 0.66, 0.33][lvl] * intro;
      if (q > 1) {
        ctx.fillStyle = dark;
        for (let i = i0; i < i1; i++) { const x = pts[2 * i], y = pts[2 * i + 1]; if (flat) { ctx.fillRect(x, y - P, 1, P); ctx.fillRect(x, y + 1, 1, P); } else { ctx.fillRect(x - P, y, P, 1); ctx.fillRect(x + 1, y, P, 1); } }
      }
      ctx.fillStyle = body;
      for (let i = i0; i < i1; i++) ctx.fillRect(pts[2 * i], pts[2 * i + 1], 1, 1);
      if (q > 1) { ctx.fillStyle = shine; for (let i = i0; i < i1; i++) ctx.fillRect(pts[2 * i], pts[2 * i + 1], flat ? 1 : P, flat ? P : 1); }
    }
    // Wandernder Lichtpunkt zeigt Richtung und Zeitpunkt
    ctx.globalAlpha = intro; ctx.fillStyle = lite(0.75);
    ctx.fillRect(Math.round(x + dx * L * k), Math.round(y + dy * L * k), 2, 1);
    if (q > 1) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x + dx * L * k) + (dx >= 0 ? 2 - P : 0), Math.round(y + dy * L * k), P, P); }
  }
  // Aufsteigende Funken am Rand (Feinraster: Funke mit dunklerem Schweif-Feinpixel darunter)
  #embers(ctx, cx, cy, intro, lite, q) {
    const size = this.shape === 'line' ? this.len / 16 : this.r / 6;
    const n = Math.min(18, Math.max(3, Math.round(size))), P = 1 / q;
    const head = lite(0.65), tail = lite(0.2);
    for (let i = 0; i < n; i++) {
      const h1 = Telegraph.#h(i + 1), h2 = Telegraph.#h(i + 37);
      const ph = (this.t * (0.6 + h2 * 0.6) + h1) % 1;
      const [px, py] = this.#edgePoint(h1, cx, cy, 0.96);
      const v = Math.sin(ph * Math.PI) * 0.8 * intro;
      if (v < 0.1) continue;
      ctx.globalAlpha = v > 0.5 ? 1 : 0.66;
      const X = Math.round((px + Math.sin(ph * 6 + i)) * q) / q, Y = Math.round((py - ph * 12) * q) / q;
      ctx.fillStyle = head; ctx.fillRect(X, Y, P, P);
      if (q > 1) { ctx.fillStyle = tail; ctx.fillRect(X, Y + P, P, P); }
    }
  }
}

// Runenformen (Feinpixel-Versätze zur Mitte): drei kleine (5 × 5) und drei große (7 × 7)
const RUNE_MAPS = [
  ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  ['.###.', '..#..', '#.#.#', '..#..', '.###.'],
  ['...#...', '..#.#..', '.#...#.', '#..#..#', '.#...#.', '..#.#..', '...#...'],
  ['#.....#', '.#...#.', '..#.#..', '...#...', '...#...', '..###..', '...#...'],
  ['..###..', '...#...', '#..#..#', '#######', '#..#..#', '...#...', '..###..'],
];
const RUNES = RUNE_MAPS.map((m) => {
  const o = (m.length - 1) / 2, pts = [];
  m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') pts.push([x - o, y - o]); }));
  return pts;
});

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
  // Feinraster: Ring aus Feinpixeln – außen ein heller Saum, zwei Feinpixel in der Farbe, innen eine dunkle Kante
  // (lesbar auf hellem wie dunklem Boden); Ausblenden in drei Stufen. Bei „Niedrig“ wie früher in Weltpixeln.
  renderEmissive(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    const k = this.t / this.duration;
    const [r, g, b] = this.color;
    const al = 1 - k * 0.8, A = al > 0.66 ? 1 : al > 0.4 ? 0.66 : 0.33;
    const X = Math.round((this.x - cx) * q) / q, Y = Math.round((this.y - cy) * q) / q;
    const R = this.r, pts = (rr) => ellipsePts(rr, rr * 0.6, q);
    const draw = (e, col) => { ctx.fillStyle = col; drawRuns(ctx, X, Y, e.runs, P); };
    ctx.save();
    ctx.globalAlpha = A;
    if (q > 1) {
      draw(pts(R + P), 'rgba(14,6,10,0.66)');
      draw(pts(R), `rgb(${Math.round(r + (255 - r) * 0.55)},${Math.round(g + (255 - g) * 0.55)},${Math.round(b + (255 - b) * 0.55)})`);
      draw(pts(R - P), `rgb(${r},${g},${b})`);
      draw(pts(R - 2 * P), `rgb(${r},${g},${b})`);
      draw(pts(R - 3 * P), 'rgba(14,6,10,0.66)');
      if (k < 0.5) { ctx.globalAlpha = 0.66; const e = pts(R - 2); ctx.fillStyle = '#ffffff'; for (let i = 0; i < e.n; i += 3) ctx.fillRect(X + e.xy[2 * i] * P, Y + e.xy[2 * i + 1] * P, P, P); }
    } else {
      draw(pts(R), `rgb(${r},${g},${b})`); draw(pts(R - 1), `rgb(${r},${g},${b})`);
      ctx.globalAlpha = (1 - k) > 0.5 ? 0.66 : 0.33; draw(pts(R - 2), '#ffffff');
    }
    ctx.restore();
  }
}

// Kleiner Helfer, damit Boss-Banner nicht an UI-Details hängen.
export function bossBanner(world, title, sub) {
  world.bus.emit(EV.UI_BANNER, { title, sub, color: '#c080ff' });
}
