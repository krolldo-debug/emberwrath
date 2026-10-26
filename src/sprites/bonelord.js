import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Varkhul, der Knochenfürst.
//
// Das Sprite ist ein kleines Skelett-Rig: Hüfte, Wirbelsäule, Kopf, zwei Arme
// und zwei Beine (Zwei-Gelenk-IK), dazu Umhang, Rüstteile und ein riesiges
// Knochen-Großschwert. Animationen sind Schlüsselposen, zwischen denen beim
// Laden weich interpoliert wird. Jeder Frame hat zusätzlich eine Leucht-Ebene
// (Augen, Seelenfeuer, Runen) in Violett und – für Phase 3 – in Glutrot, sowie
// Metadaten (Kopf, Hand, Klingenspitze) für Partikel und Effekte.
// Blickrichtung rechts, Anker = Mitte zwischen den Füßen.
export const W = 176, H = 136, AX = 66, AY = 128;
const B = PAL.bone, St = PAL.steel;
// Rüstung: dunkles, angelaufenes Eisen mit Rostkanten
const R = ['#141620', '#262a38', '#3c4052', '#5c5f70'];
const RUST = PAL.rust;
const CAPE = ['#0c0612', '#170b22', '#241036', '#34184c', '#46215f'];
const VOID = '#0d0610';
const GLOW = {
  violet: ['#3a1466', '#6a2cb0', '#a060f0', '#e0b8ff', '#ffffff'],
  ember: ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'],
};

export const THIGH = 15, SHIN = 15, SPINE = 22, UPPER = 12.5, FORE = 12.5, BLADE = 45;
// Posenwerte sind für das ursprüngliche (kleinere) Rig gesetzt; Abstände werden mit SK skaliert.
const SK = 1.16;
const SCALED = ['hipX', 'hipY', 'fFx', 'fFy', 'fBx', 'fBy', 'hFx', 'hFy', 'hBx', 'hBy'];

// Schädel (Dreiviertelansicht, Blick nach rechts): 0–4 = Knochenrampe (Hinterkopf im
// Schatten, Stirn und Wangenknochen vorn im Licht), o = dunkle Kante, V = tiefe Höhle,
// E/e = Seelenfeuer im Auge (Kern/Rand), T/t = Zähne. Brauen fallen zur Nase hin ab.
const SKULL = [
  '....12333321....',
  '..123444444321..',
  '.12344444444431.',
  '1233444444444442',
  '12233ooo444444o2',
  '1223oVVVoo44oVVo',
  '1223oVEeVo42oEVo',
  '1222oVVeVo32oVVo',
  '12223oVVo3443oo2',
  '1222234443oVo432',
  '.112221110oVo221',
  '..o112TtTtTtTto.',
];
const SKULL_JAW = [
  '...o12tTtTtTto..',
  '....0122222221..',
  '.....01111110...',
];

// ---------------------------------------------------------------- Pose

export const REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, jaw: 0,
  fFx: 7, fFy: 0, fBx: -8, fBy: 0,
  hFx: 9, hFy: 15, hBx: -5, hBy: 16,
  sword: 0.55, grip: 0, cape: 0.2, capeT: 0,
  cast: 0, eye: 1, soul: 1, kneel: 0,
};
export const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
export const mix = (a, b, t) => {
  const o = {};
  for (const k in REST) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
};
// Tastet eine Keyframe-Spur ab: keys = [[t 0..1, pose, easing?], ...]
export function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mix(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}
export const linear = (t) => t;
export const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t); // schnell rein, weich aus

// ---------------------------------------------------------------- Geometrie

export function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { jx: ax + ux * a - uy * h * bend, jy: ay + uy * a + ux * h * bend, ex: ax + dx, ey: ay + dy };
}

// ---------------------------------------------------------------- Feinraster-Werkzeuge
// Gezeichnet wird auf FineCanvas (docs/STYLE.md „Feinraster“, Stufe B). Bei res 1 zeichnen diese Helfer exakt wie
// früher PixelCanvas (Bildvergleich bei „Niedrig“); fein tasten sie Feinpixel ab. Handfeine Zusätze in `if (p.fine)`.

// Punkt in Weltkoordinaten: res 1 = gerundeter Weltpixel, fein = nächstgelegenes Feinpixel
export const pt = (p, x, y, c) => (p.res === 1 ? p.px(x, y, c) : p.dot(x + p.step / 2, y + p.step / 2, c));
// Gefüllte Ellipse wie PixelCanvas.ellipse, aber im Feinraster gerechnet (bei res 1 identisch)
export function ell(p, cx, cy, rx, ry, c) {
  if (!c) return;
  // fein: Radius um ein halbes Feinpixel größer, damit die Fläche so breit bleibt wie früher (2·hw+1 Weltpixel)
  const r = p.res, v = col32(c), X = (cx + p.ox) * r, Y = (cy + p.oy) * r, RX = rx * r + (r - 1) / 2, RY = ry * r + (r - 1) / 2, n = Math.ceil(RY);
  for (let y = -n; y <= n; y++) {
    const t = 1 - (y * y) / (RY * RY);
    if (t < 0) continue;
    const hw = Math.round(RX * Math.sqrt(t) - 0.15), F = Math.round(X - hw), G = Math.round(Y + y);
    for (let i = 0; i <= hw * 2; i++) p.put(F + i, G, v);
  }
}
// Linie 1 Weltpixel stark: res 1 Bresenham in Weltpixeln, fein im Feinraster (glattere Schrägen)
export function ln(p, x0, y0, x1, y1, c) {
  if (p.res === 1) p.line(x0, y0, x1, y1, c);
  else { const h = p.step / 2; p.fline(x0 + h, y0 + h, x1 + h, y1 + h, c, 1); }
}
// Feine Linie 1 Feinpixel (nur fein benutzt), gleiche Lage wie ln/pt
export const hair = (p, x0, y0, x1, y1, c) => { const h = p.step / 2; p.fline(x0 + h, y0 + h, x1 + h, y1 + h, c); };

// Dicker Knochen/Rüstteil mit Licht von links oben (fein: Kanten 1 Feinpixel).
export function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; } // Normale zeigt nach links oben
  // fein: halbe Breite + 0,25, weil ein Feinpixel nur halb so weit über den Abtastpunkt reicht (gleiche Silhouette)
  const q = p.step, e = Math.max(q, 0.5), steps = Math.ceil(len * 2 / q), grow = (1 - q) / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    const hw = (w0 + (w1 - w0) * t) / 2 + grow;
    for (let k = -hw; k <= hw + 0.01; k += 0.5 * q) {
      const c = k > hw - e ? ramp[3] : k < -hw + e ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
      pt(p, x + nx * k, y + ny * k, c);
    }
  }
}
// Gelenkkugel; fein mit Glanzpunkt und Lichtsichel
export function knob(p, x, y, r, ramp) {
  ell(p, x, y, r, r, ramp[1]);
  if (!p.fine) { p.px(x - r * 0.4, y - r * 0.4, ramp[3]); return; }
  for (let a = 3.3; a < 4.9; a += 0.25) pt(p, x + Math.cos(a) * (r - 0.4), y + Math.sin(a) * (r - 0.4), ramp[2]);
  pt(p, x - r * 0.45, y - r * 0.45, ramp[3]); pt(p, x - r * 0.45 + 0.5, y - r * 0.45, ramp[3]); pt(p, x - r * 0.45, y - r * 0.45 + 0.5, ramp[3]);
  pt(p, x - r * 0.45, y - r * 0.45, St[5]);
  pt(p, x + r * 0.35, y + r * 0.45, ramp[0]);
}
// Niete 2×2 Feinpixel: Glanz oben links, Schatten unten rechts (nur fein)
function rivet(p, x, y, lo = R[0], hi = St[4]) {
  pt(p, x, y, hi); pt(p, x + 0.5, y, R[2]); pt(p, x, y + 0.5, R[2]); pt(p, x + 0.5, y + 0.5, lo);
}

// Großschwert: Griff, Parierstange aus Wirbeln, breite gezackte Knochenklinge.
function greatsword(p, g, hx, hy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx;
  const flipN = nx + ny > 0; if (flipN) { nx = -nx; ny = -ny; }
  const q = p.step, fine = p.fine;
  // Griff + Knauf
  limb(p, hx - dx * 7, hy - dy * 7, hx + dx * 1, hy + dy * 1, 2, 2, [PAL.leather[0], PAL.leather[1], PAL.leather[2], PAL.leather[3]]);
  if (fine) {
    // Lederwicklung: schräge dunkle Bänder, Naht als Punktlinie
    for (let s = -6.5; s <= 0; s += 1.5) hair(p, hx + dx * s - nx * 0.9, hy + dy * s - ny * 0.9, hx + dx * (s + 0.7) + nx * 0.9, hy + dy * (s + 0.7) + ny * 0.9, PAL.leather[0]);
    for (let s = -6; s <= 0.5; s += 1) pt(p, hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, PAL.leather[3]);
  }
  ell(p, hx - dx * 8, hy - dy * 8, 1.5, 1.5, B[2]);
  if (fine) { pt(p, hx - dx * 8 - 0.5, hy - dy * 8 - 0.5, B[4]); pt(p, hx - dx * 8 - 0.5, hy - dy * 8 - 1, B[3]); pt(p, hx - dx * 8 + 0.5, hy - dy * 8 + 0.5, B[1]); }
  else p.px(hx - dx * 8 - 0.5, hy - dy * 8 - 0.5, B[4]);
  // Parierstange (fein: Wirbelglieder mit dunkler Fuge)
  for (let k = -6; k <= 6; k += 0.5 * q) {
    const v = Math.abs(k);
    let c = v > 5 ? B[1] : Math.round(k) % 3 === 0 ? B[1] : B[3];
    if (fine && c === B[3] && Math.round(k) % 3 === 1 && k - Math.floor(k) < 0.3) c = B[4];
    pt(p, hx + dx * 2 + nx * k, hy + dy * 2 + ny * k, c);
    pt(p, hx + dx * 3 + nx * k * 0.8, hy + dy * 3 + ny * k * 0.8, v > 4 ? B[2] : B[2]);
    if (fine) {
      pt(p, hx + dx * 2.5 + nx * k, hy + dy * 2.5 + ny * k, c === B[4] ? B[3] : c);
      pt(p, hx + dx * 3.5 + nx * k * 0.8, hy + dy * 3.5 + ny * k * 0.8, B[1]);
    }
  }
  pt(p, hx + dx * 2 + nx * 6.5, hy + dy * 2 + ny * 6.5, B[4]); pt(p, hx + dx * 2 - nx * 6.5, hy + dy * 2 - ny * 6.5, B[2]);
  // Klinge: breite Knochenklinge, Mittelgrat (obere Hälfte hell, untere dunkel),
  // helle Schneide vorn, Rücken mit eingekerbten Sägezähnen, spitz zulaufend.
  // Fein: Schneide 1 Feinpixel, Hohlkehle 1 Feinpixel mit Lichtkante, Glanzlinie und Glanzpunkt.
  const bx = hx + dx * 4, by = hy + dy * 4, e = Math.max(q, 0.5);
  for (let s = 0; s <= BLADE; s += 0.5 * q) {
    const f = s / BLADE;
    const hw0 = 3.9 - 1.6 * f * f - (f > 0.88 ? (f - 0.88) * 26 : 0);
    if (hw0 <= 0.2) continue;
    const hw = fine ? hw0 + 0.25 : hw0;
    // Kerben im Rücken (Seite -k)
    const notch = (s % 8) > 5.5 && f < 0.8 ? 1.2 * (1 - ((s % 8) - 5.5) / 2.5) : 0;
    for (let k = -hw + notch; k <= hw; k += 0.5 * q) {
      let c;
      if (k > hw - e) c = B[4];                       // Schneide
      else if (k < -hw + notch + 0.9) c = B[1];       // Rücken
      else if (Math.abs(k) < 0.5 * q && f < 0.82) c = B[1]; // Hohlkehle
      else if (fine && k >= 0.25 && k < 0.5 && f < 0.82) c = B[4]; // Lichtkante der Kehle
      else c = k > 0 ? B[3] : B[2];
      if (c === B[2] && hash2(Math.round(s), Math.round(k * 2), 7) < 0.05) c = PAL.rust[2];
      pt(p, bx + dx * s + nx * k, by + dy * s + ny * k, c);
    }
  }
  if (fine) {
    // Glanzlinie innen an der Schneide, Glanzpunkt, Kratzer und Kerbschatten
    for (let s = 3; s <= BLADE * 0.72; s += 0.25) {
      const f = s / BLADE, hw = 3.9 - 1.6 * f * f;
      pt(p, bx + dx * s + nx * (hw - 0.5), by + dy * s + ny * (hw - 0.5), s > BLADE * 0.18 && s < BLADE * 0.4 ? '#ffffff' : B[4]);
    }
    const gs = BLADE * 0.28, ghw = 3.9 - 1.6 * 0.28 * 0.28 - 0.5;
    for (const [o, m] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) pt(p, bx + dx * (gs + o) + nx * (ghw + m), by + dy * (gs + o) + ny * (ghw + m), '#ffffff');
    for (const [s0, k0, s1, k1] of [[9, -1.6, 11.5, -0.9], [21, 1.3, 23, 2.1], [30, -1.2, 31.5, -0.7]]) hair(p, bx + dx * s0 + nx * k0, by + dy * s0 + ny * k0, bx + dx * s1 + nx * k1, by + dy * s1 + ny * k1, B[1]);
  }
  // Runen entlang der Hohlkehle (Leucht-Ebene; fein mit heißem Kern)
  for (let s = 5; s < BLADE - 6; s += 5) {
    p.px(bx + dx * s, by + dy * s, B[1]);
    g.px(bx + dx * s, by + dy * s, glow[2]);
    if (fine) { pt(p, bx + dx * s, by + dy * s, glow[2]); pt(g, bx + dx * s, by + dy * s, glow[4]); pt(g, bx + dx * (s + 1), by + dy * (s + 1), glow[1]); pt(g, bx + dx * (s - 0.5), by + dy * (s - 0.5), glow[3]); }
    else g.px(bx + dx * (s + 1), by + dy * (s + 1), glow[1]);
  }
  return { tipX: bx + dx * BLADE, tipY: by + dy * BLADE };
}

// Schwung-Schleier (Smear) zwischen zwei Klingenwinkeln um einen Drehpunkt.
// Fein: Form und Farben je Feinpixel, die Dichte (Zufall) je Weltpixel – sonst flimmert es.
export function smear(p, g, cx, cy, a0, a1, r0, r1, glow, cols = [B[4], B[3], '#c8bce0', '#8a7aa8']) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1), q = p.step;
  for (let y = -R1; y <= R1; y += q) for (let x = -R1; x <= R1; x += q) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(y, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    // "fresh" = 1 an der aktuellen Klinge, 0 am Anfang des Schwungs
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const band = Math.max(0, 1 - (1 - radial) * 2.2);
    const dens = fresh * fresh * 0.4 + band * (0.25 + 0.75 * fresh);
    if (hash2(Math.floor(x) + 99, Math.floor(y) + 99, 13) > dens + (p.fine && radial > 0.86 ? 0.3 : 0)) continue;
    const c = radial > 0.86 ? cols[0] : radial > 0.7 ? cols[1] : fresh > 0.7 ? cols[2] : cols[3];
    pt(p, cx + x, cy + y, c);
    if (fresh > 0.45 && radial > 0.55) pt(g, cx + x, cy + y, radial > 0.85 ? glow[3] : glow[1]);
  }
}

// ---------------------------------------------------------------- Schädel fein
// Veredelt die als 2×2-Zellen gestempelte Pixelkarte (SKULL/SKULL_JAW) mit Feinpixeln: runde Kalotte, Risse,
// Brauenkante, Seelenfeuer mit heißem Kern und Glanzpunkt, dreieckige Nasenhöhle mit Licht, spitze Zähne mit Glanz.
// X/Y = Feinpixel relativ zur Kartenecke (hx, hy ganzzahlig).
function skullFine(p, g, hx, hy, jaw, eye, glow) {
  const T = (X, Y, c) => p.dot(hx + (X + 0.5) / 2, hy + (Y + 0.5) / 2, c);
  const TG = (X, Y, c) => g.dot(hx + (X + 0.5) / 2, hy + (Y + 0.5) / 2, c);
  // Kalotte: Treppen der Karte zum Bogen schließen, Lichtkante oben
  for (const [X, Y, c] of [[7, 1, B[1]], [6, 1, B[1]], [3, 3, B[1]], [1, 5, B[1]], [24, 1, B[2]], [25, 1, B[1]], [28, 3, B[2]], [30, 5, B[2]]]) T(X, Y, c);
  for (let X = 10; X < 22; X++) T(X, 0, X < 14 ? B[3] : B[4]);
  // Risse in der Kalotte und an der Schläfe (dunkle Fuge, helle Bruchkante)
  for (const [X, Y] of [[18, 1], [18, 2], [19, 3], [19, 4], [20, 5], [21, 6], [20, 4]]) T(X, Y, B[1]);
  T(19, 4, B[0]); T(17, 2, '#ffffff'); T(18, 4, '#ffffff');
  for (const [X, Y] of [[4, 9], [5, 10], [5, 11], [6, 12]]) T(X, Y, B[0]);
  // Brauenkante: helle harte Kante, darunter Übergang in die Höhle
  for (let X = 9; X < 16; X++) T(X, 7, '#ffffff');
  for (let X = 10; X < 16; X++) T(X, 8, B[1]);
  T(28, 8, B[1]); T(29, 8, B[1]); T(27, 7, '#ffffff'); T(28, 7, '#ffffff');
  // Wangenknochen: Lichtkante
  T(18, 16, '#ffffff'); T(19, 16, '#ffffff'); T(20, 17, B[4]);
  // Nase: dreieckige Höhle, Nasenrücken-Licht
  for (const [X, Y, c] of [[20, 18, B[3]], [21, 18, B[3]], [20, 19, B[3]], [24, 18, B[2]], [25, 18, B[2]], [25, 19, B[2]]]) T(X, Y, c);
  T(22, 16, '#ffffff'); T(22, 17, '#ffffff');
  // Augen: Seelenfeuer – heißer Kern mit Glanzpunkt im farbigen Saum, Höhle bleibt dunkel
  if (eye > 0.2) {
    for (const [X, Y, k] of [[12, 12, 5], [13, 12, 4], [12, 13, 3], [13, 13, 4], [14, 12, 3], [15, 12, 2], [14, 13, 3], [15, 13, 1],
      [14, 14, 2], [15, 14, 1], [14, 15, 1], [11, 13, 1], [11, 12, 0], [26, 12, 4], [27, 12, 3], [26, 13, 3], [27, 13, 2], [26, 14, 1]]) T(X, Y, k === 5 ? '#ffffff' : glow[k]);
    for (const [X, Y, k] of [[12, 12, 4], [13, 12, 4], [13, 13, 4], [12, 13, 3], [26, 12, 4], [27, 12, 3], [26, 13, 3]]) TG(X, Y, glow[k]);
  }
  // Zähne: spitz, Glanz auf der Kante; oben nach unten, unten nach oben verzahnt
  for (let c = 6; c <= 13; c++) {
    const big = c % 2 === 0, X = c * 2;
    T(X, 22, big ? '#ffffff' : B[2]); T(X + 1, 22, big ? B[4] : B[1]); T(X, 23, big ? B[3] : B[1]); T(X + 1, 23, VOID);
  }
  const J = 2 * (12 + jaw);
  for (let c = 6; c <= 12; c++) {
    const big = c % 2 === 1, X = c * 2;
    T(X, J, VOID); T(X + 1, J, big ? B[4] : B[2]); T(X, J + 1, big ? B[3] : B[1]); T(X + 1, J + 1, big ? B[4] : B[2]);
  }
  if (jaw) {
    // Fangzähne im offenen Rachen
    T(16, 24, B[4]); T(17, 24, B[3]); T(16, 25, B[3]); T(17, 25, VOID);
    T(24, 24, B[4]); T(25, 24, B[3]); T(24, 25, B[3]); T(25, 25, VOID);
  }
}

// ---------------------------------------------------------------- Zeichnen

// Geometrie des Rigs aus einer Pose (Weltpixel): Hüfte, Brust, Beine/Arme (IK), Schultern, Hände, Kopfecke.
// Auch für die Sternenglut-Bosse (sprites/star_bosses.js), die auf demselben Rig andere Gestalten zeichnen.
export function bonelordRig(P0) {
  const P = { ...P0 };
  for (const k of SCALED) P[k] *= SK;
  const gy = AY;
  const hipX = AX - 2 + P.hipX, hipY = gy - 28 + P.hipY + P.kneel * 11;
  const lean = P.lean;
  const chX = hipX + Math.sin(lean) * SPINE, chY = hipY - Math.cos(lean) * SPINE;
  const perpX = Math.cos(lean), perpY = Math.sin(lean); // "nach vorn" quer zum Rumpf

  // Füße / Knie (IK), Knie beugen nach vorn
  const fF = { x: AX + P.fFx, y: gy - P.fFy };
  const fB = { x: AX + P.fBx, y: gy - P.fBy };
  const legF = ik(hipX + 2, hipY, fF.x, fF.y, THIGH, SHIN, -1);
  const legB = ik(hipX - 2, hipY, fB.x, fB.y, THIGH, SHIN, -1);
  // Kniend: hinteres Knie auf dem Boden
  if (P.kneel > 0.01) {
    const kx = hipX - 5 - P.kneel * 3, ky = gy - 1;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 11 - legB.ex) * P.kneel; legB.ey += (gy - legB.ey) * P.kneel;
  }

  // Schultern und Arme
  const shF = { x: chX + perpX * 6, y: chY + perpY * 6 + 1 };
  const shB = { x: chX - perpX * 6, y: chY - perpY * 6 };
  const hF = { x: chX + P.hFx, y: chY + P.hFy };
  const sa = P.sword;
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(sa) * 5, y: hF.y - Math.sin(sa) * 5 }
    : { x: chX + P.hBx, y: chY + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);

  // Kopf
  const neckX = chX + Math.sin(lean) * 3, neckY = chY - Math.cos(lean) * 3;
  const hx = Math.round(neckX + P.head - 6), hy = Math.round(neckY - 17);

  return { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, hB, sa, armF, armB, neckX, neckY, hx, hy };
}

// ---------------------------------------------------------------- Gestalt „Grabfürst“
// Leichentuch statt Purpurumhang, Kapuze über dem Schädel, Totenkrone als Strahlenkranz hinter dem Kopf,
// Schulterkragen aus Leichentuch, Richtbeil aus geschwärztem Eisen. Rig, Posen und Seelenfeuer bleiben.
const SH = ['#0d100e', '#1b201c', '#2b322b', '#3f483d', '#566253', '#77836f'];   // Leichentuch: modriges Graugrün
const K = ['#0b0a0e', '#19171e', '#29262f', '#3e3a46', '#5c5768', '#878199'];     // geschwärztes Eisen, kalter Glanz
const GOLD = ['#2c1f08', '#5a4214', '#8f6c2a', '#c49e4e', '#ecd38c'];
const BONE4 = [B[0], B[1], B[2], B[3]];

// Totenkrone: Eisenreif als Halbkreis hinter dem Kopf, Knochenstrahlen nach außen, Seelenstein im Scheitel.
function deathHalo(p, g, cx, cy, glow) {
  const R0 = 12.5, A0 = Math.PI * 0.94, A1 = Math.PI * 2.06, fine = p.fine;
  // Strahlen zuerst (hinter dem Reif)
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = A0 + 0.12 + (A1 - A0 - 0.24) * (i / (N - 1));
    const long = i % 2 === 0, L = long ? 9 - Math.abs(i - 5) * 0.55 : 4.5;
    const x0 = cx + Math.cos(a) * (R0 + 0.5), y0 = cy + Math.sin(a) * (R0 + 0.5);
    const x1 = cx + Math.cos(a) * (R0 + L), y1 = cy + Math.sin(a) * (R0 + L);
    limb(p, x0, y0, x1, y1, long ? 2.6 : 2, 0.7, BONE4);
    if (fine) {
      pt(p, x1, y1, B[4]);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      hair(p, mx - Math.sin(a) * 0.8, my + Math.cos(a) * 0.8, mx + Math.sin(a) * 0.6, my - Math.cos(a) * 0.6, B[0]);
    } else p.px(x1, y1, B[4]);
  }
  // Reif: dicker Eisenbogen, Goldrand innen
  let qx = cx + Math.cos(A0) * R0, qy = cy + Math.sin(A0) * R0;
  for (let a = A0 + 0.14; a <= A1 + 0.001; a += 0.14) {
    const x = cx + Math.cos(a) * R0, y = cy + Math.sin(a) * R0;
    limb(p, qx, qy, x, y, 2.6, 2.6, [K[0], K[2], K[3], K[4]]);
    qx = x; qy = y;
  }
  for (let a = A0 + 0.05; a <= A1 - 0.05; a += fine ? 0.04 : 0.08) pt(p, cx + Math.cos(a) * (R0 - 1.3), cy + Math.sin(a) * (R0 - 1.3), a > Math.PI * 1.2 && a < Math.PI * 1.6 ? GOLD[3] : GOLD[2]);
  if (fine) for (let a = A0 + 0.3; a < A1 - 0.2; a += 0.55) { const x = cx + Math.cos(a) * R0, y = cy + Math.sin(a) * R0; pt(p, x, y, GOLD[4]); pt(p, x + 0.5, y + 0.5, GOLD[1]); }
  // Seelenstein im Scheitel
  const sx = cx, sy = cy - R0;
  ell(p, sx, sy, 2, 2.2, K[0]); ell(p, sx, sy, 1.3, 1.5, glow[1]);
  ell(g, sx, sy, 1.8, 2, glow[1]); ell(g, sx, sy, 1, 1.2, glow[3]);
  if (fine) { pt(p, sx - 0.5, sy - 0.5, glow[3]); pt(p, sx - 0.5, sy - 1, '#ffffff'); pt(g, sx, sy, glow[4]); }
  else g.px(sx, sy, glow[4]);
}

// Kapuze: großer Tuchkopf, aus dem vorn das Gesicht schaut. back = Rückseite (vor dem Schädel gezeichnet),
// sonst die Vorderkante, die den Oberkopf verdeckt und Schatten wirft.
function hood(p, hx, hy, back) {
  const cx = hx + 5.5, cy = hy + 5, rx = 11, ry = 12;
  const ox = hx + 11, oy = hy + 10, orx = 8.5, ory = 9.6;   // Gesichtsöffnung
  const q = p.step;
  for (let y = cy - ry - 1; y <= cy + ry; y += q) for (let x = cx - rx - 1; x <= cx + rx; x += q) {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) continue;
    const ou = (x - ox) / orx, ov = (y - oy) / ory, od = ou * ou + ov * ov;
    if (back) {
      // Innenseite der Kapuze hinter dem Kopf: tiefer Schatten
      pt(p, x, y, od < 1 ? SH[0] : d > 0.8 ? SH[2] : SH[1]);
      continue;
    }
    if (od < 1) continue;
    let c;
    if (od < 1.16) c = SH[0];               // Schattenkante an der Öffnung
    else if (od < 1.3) c = SH[1];
    else {
      const l = -(u * 0.55 + v * 0.85);
      c = d > 0.86 && l > 0.25 ? SH[5] : l > 0.35 ? SH[4] : l > -0.15 ? SH[3] : l > -0.6 ? SH[2] : SH[1];
    }
    pt(p, x, y, c);
  }
  if (back || !p.fine) return;
  // Falten: zwei Bögen über dem Scheitel, Saumnaht an der Öffnung
  for (let a = 3.6; a < 4.7; a += 0.06) {
    pt(p, cx + Math.cos(a) * (rx - 3.5), cy + 1 + Math.sin(a) * (ry - 3.5), SH[2]);
    pt(p, cx - 1 + Math.cos(a + 0.2) * (rx - 6), cy + 3 + Math.sin(a + 0.2) * (ry - 6.5), SH[2]);
  }
  for (let a = 3.3; a < 5.6; a += 0.09) pt(p, ox + Math.cos(a) * orx * 1.2, oy + Math.sin(a) * ory * 1.2, SH[4]);
}

// Schulterkragen aus Leichentuch: gewölbt, Saum in Zipfeln, Knochenschließe vorn.
function mantle(p, x, y, rx, ry, sway, dark) {
  const o = dark ? 1 : 0, fine = p.fine;
  // Zipfel unter dem Kragen
  for (let i = 0; i < 6; i++) {
    const zx = x - rx + 1.5 + i * (rx * 2 - 3) / 5, zl = 3 + hash2(i, 3, 41) * 4 + (i % 2 ? 0 : 2);
    limb(p, zx, y + ry - 2, zx - sway * 0.5 + (i - 2.5) * 0.3, y + ry - 1 + zl, 3, 1, [SH[0], SH[1 - o + 1], SH[3 - o], SH[4 - o]]);
  }
  ell(p, x, y, rx, ry, SH[1]);
  ell(p, x - 0.5, y - 0.5, rx - 1, ry - 1, SH[3 - o]);
  ell(p, x - 1.5, y - 1.5, rx - 3, ry - 3, SH[4 - o]);
  if (fine) {
    for (let a = 3.4; a < 4.9; a += 0.06) pt(p, x - 0.5 + Math.cos(a) * (rx - 1.4), y - 0.5 + Math.sin(a) * (ry - 1.4), SH[5 - o]);
    for (const t of [-0.35, 0.15, 0.6]) hair(p, x + rx * t, y - ry * 0.4, x + rx * t + 1, y + ry - 1.5, SH[2 - o + (dark ? 0 : 0)]);
  }
}

// Kleine Eisenkuppel für die hintere Schulter
function ironDome(p, x, y, rx, ry) {
  ell(p, x, y, rx, ry, K[0]); ell(p, x - 0.5, y - 0.5, rx - 1, ry - 1, K[1]); ell(p, x - 1.5, y - 1.5, rx - 3, ry - 2.5, K[2]);
  for (let l = 1; l <= 2; l++) ln(p, x - rx + 1 + l, y + ry - 1 + l * 2, x + rx - 1 - l, y + ry - 1 + l * 2, l === 1 ? K[2] : K[1]);
  if (p.fine) for (let a = 3.5; a < 4.9; a += 0.08) pt(p, x - 0.5 + Math.cos(a) * (rx - 1.3), y - 0.5 + Math.sin(a) * (ry - 1.3), K[3]);
}

// Richtbeil: Knochengriff mit Lederwicklung, Eisenzwinge, breites Blatt mit Loch, heller Schneide und Runen im Rücken.
// Das Blatt wächst zur Unterseite des Schwungs (-k), der Rücken (+k) bleibt gerade.
function cleaver(p, g, hx, hy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const q = p.step, fine = p.fine, e = Math.max(q, 0.5);
  limb(p, hx - dx * 8, hy - dy * 8, hx + dx * 2, hy + dy * 2, 2.3, 2.3, BONE4);
  if (fine) for (let s = -6.5; s <= 1; s += 1.5) hair(p, hx + dx * s - nx * 0.9, hy + dy * s - ny * 0.9, hx + dx * (s + 0.7) + nx * 0.9, hy + dy * (s + 0.7) + ny * 0.9, PAL.leather[1]);
  ell(p, hx - dx * 9, hy - dy * 9, 1.8, 1.8, K[1]); pt(p, hx - dx * 9 - 0.5, hy - dy * 9 - 0.5, K[4]);
  limb(p, hx + dx * 2, hy + dy * 2, hx + dx * 4.5, hy + dy * 4.5, 5, 5, [K[0], K[2], K[3], K[4]]);
  if (fine) { pt(p, hx + dx * 3 + nx * 1.5, hy + dy * 3 + ny * 1.5, GOLD[4]); pt(p, hx + dx * 3.5 - nx * 1.5, hy + dy * 3.5 - ny * 1.5, GOLD[2]); }
  const S0 = 4.5, L = BLADE, sp = 1.8;
  const hole = { s: L - 9, k: -4.2, r: 1.9 };
  const nicks = [14, 24, 33];
  for (let s = S0; s <= L + 1; s += 0.5 * q) {
    const f = (s - S0) / (L - S0), sm = Math.min(1, f / 0.5);
    const w = 2.4 + 6.4 * sm * sm * (3 - 2 * sm);
    const nick = nicks.some((n) => s > n && s < n + 1.6) ? 1 : 0;
    for (let k = -w + nick; k <= sp; k += 0.5 * q) {
      if (s > L - 1.2 + k * 0.32) continue;                       // schräges Blattende
      const hd = Math.hypot(s - hole.s, k - hole.k);
      if (hd < hole.r) continue;
      let c;
      if (k > sp - 0.9) c = k > sp - e ? K[1] : K[0];                // Rücken
      else if (k < -w + nick + e) c = St[4];                      // Schneide
      else if (k < -w + nick + 1.2) c = St[2];
      else if (hd < hole.r + 0.7) c = hole.k < k ? K[4] : K[0];   // Lochrand
      else if (s > L - 2 + k * 0.32) c = K[4];                    // Stirnkante im Licht
      else c = k > -w * 0.45 ? K[3] : K[2];
      if ((c === K[2] || c === K[3]) && hash2(Math.round(s * 2), Math.round(k * 2), 21) < 0.06) c = c === K[2] ? K[1] : K[4];
      pt(p, hx + dx * s + nx * k, hy + dy * s + ny * k, c);
    }
  }
  if (fine) {
    // Glanzlinie auf der Schneide, Schmiedekante entlang des Rückens
    for (let s = S0 + 6; s < L * 0.7; s += 0.25) {
      const f = (s - S0) / (L - S0), sm = Math.min(1, f / 0.5), w = 2.4 + 6.4 * sm * sm * (3 - 2 * sm);
      pt(p, hx + dx * s + nx * (-w + 0.75), hy + dy * s + ny * (-w + 0.75), s > L * 0.35 && s < L * 0.5 ? '#ffffff' : St[3]);
    }
    hair(p, hx + dx * (S0 + 1) + nx * (sp - 1.2), hy + dy * (S0 + 1) + ny * (sp - 1.2), hx + dx * (L - 3) + nx * (sp - 1.2), hy + dy * (L - 3) + ny * (sp - 1.2), K[4]);
  }
  // Runen im Rücken (Leucht-Ebene)
  for (let s = S0 + 5; s < L - 6; s += 6) {
    const x = hx + dx * s + nx * -0.6, y = hy + dy * s + ny * -0.6;
    p.px(x, y, K[0]); g.px(x, y, glow[2]);
    if (fine) {
      hair(p, x, y, x + dx * 1.5 - nx, y + dy * 1.5 - ny, glow[2]);
      hair(g, x, y, x + dx * 1.5 - nx, y + dy * 1.5 - ny, glow[4]);
      pt(g, x - nx, y - ny, glow[3]);
    }
  }
  return { tipX: hx + dx * (L - 1) - nx * 3, tipY: hy + dy * (L - 1) - ny * 3 };
}

function drawBonelord(p, g, P0, glow, extra = {}) {
  const { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, sa, armF, armB, hx, hy } = bonelordRig(P0);
  const meta = {};
  const fine = p.fine;

  // --- 1. Totenkrone hinter dem Kopf
  deathHalo(p, g, hx + 6, hy + 3, glow);

  // --- 2. Leichentuch hinten: lang, zerrissen, ausgefranster Saum
  const capeTopX = chX - perpX * 2, capeTopY = chY - 5;
  const capeLen = 50 - P.kneel * 12;
  const NC = 24;
  for (let i = 0; i < NC; i++) {
    const u = i / (NC - 1);
    const sx = capeTopX - 12 + i * 0.95;
    const top = capeTopY + Math.abs(u - 0.4) * 3;
    const rag = hash2(i, 1, 9);
    const len = capeLen - Math.abs(u - 0.5) * 10 + Math.sin(P.capeT + i * 0.9) * 2.2 + (rag * 9 | 0) - (i % 5 === 2 ? 6 : 0);
    const st = fine ? 0.5 : 1;
    for (let j = 0; j < len; j += st) {
      const v = j / len;
      const x = sx - P.cape * 18 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 4 + i * 0.4) * 1.4 * v;
      const fold = Math.sin(i * 0.9 + v * 1.2);
      let shade = u < 0.1 ? 4 : u > 0.9 ? 1 : fold > 0.5 ? 4 : fold < -0.4 ? 2 : 3;
      if (v > 0.8) shade = Math.max(1, shade - 1);
      if (v > 0.93) shade = Math.max(1, shade - 1);
      if (fine) {
        const hi = fold > 0.5 && v < 0.8 ? Math.min(5, shade + 1) : shade;
        pt(p, x, top + j, SH[hi]); pt(p, x + 0.5, top + j, SH[shade]);
        if (i < NC - 1) { pt(p, x + 1, top + j, SH[shade]); pt(p, x + 1.5, top + j, SH[fold < 0 ? Math.max(1, shade - 1) : shade]); }
      } else { p.px(x, top + j, SH[shade]); if (i < NC - 1) p.px(x + 1, top + j, SH[shade]); }
    }
    // Fransen am Saum
    if (i % 3 === 0) {
      const x = sx - P.cape * 18 - (1 - u) * 5 + Math.sin(P.capeT * 1.3 + 4 + i * 0.4) * 1.4;
      ln(p, x, top + len, x - 0.5 - P.cape, top + len + 2 + rag * 2, SH[1]);
    }
  }

  // --- 3. Hinteres Bein und Arm
  const darkB = [VOID, B[0], B[1], B[2]];
  limb(p, hipX - 2, hipY, legB.jx, legB.jy, 5, 4, darkB);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 6.5, 6, [K[0], K[0], K[1], K[2]]);
  p.rect(legB.ex - 3, legB.ey - 4, 10, 4, K[0]); p.rect(legB.ex - 3, legB.ey - 4, 10, 1, K[2]);
  knob(p, legB.jx, legB.jy, 2.5, [K[0], K[1], K[1], K[2]]);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3.5, 3.5, darkB);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 3.5, [K[0], K[0], K[1], K[2]]);
  const clawOpen = P.cast > 0.3 || P.grip > 0.5 ? 1 : 0;
  p.rect(armB.ex - 2, armB.ey - 1, 4, 3, B[1]);
  for (let k = -2; k <= 2; k += 2) ln(p, armB.ex + k * 0.6, armB.ey - 1, armB.ex + k * (clawOpen ? 1.4 : 0.8), armB.ey - (clawOpen ? 5 : 3), B[2]);
  if (fine) for (let k = -2; k <= 2; k += 2) pt(p, armB.ex + k * (clawOpen ? 1.4 : 0.8), armB.ey - (clawOpen ? 5 : 3), B[4]);
  meta.cast = { x: armB.ex, y: armB.ey - 3 };

  // --- 4. Becken, Leinenstreifen, Wirbelsäule, Brustkorb
  ell(p, hipX, hipY, 8, 3.5, B[1]); ell(p, hipX, hipY - 1, 7, 2.5, B[2]);
  for (let i = 0; i < 6; i++) {
    const tx = hipX - 9 + i * 3.4, ty = hipY;
    const sw = Math.sin(P.capeT + i * 1.3) * 0.9 + P.lean * 5;
    const tl = 13 - Math.abs(i - 2.5) * 1.4 + (hash2(i, 5, 9) * 3 | 0);
    for (let j = 0; j < tl; j += fine ? 0.5 : 1) {
      const v = j / tl, x = tx + sw * v;
      const c = i === 0 ? SH[4] : i === 5 ? SH[1] : (i % 2 ? SH[2] : SH[3]);
      p.rect(x, ty + j, 3, fine ? 0.5 : 1, v > 0.85 ? SH[1] : c);
      pt(p, x + 3, ty + j, SH[0]);
    }
    if (fine) { const x = tx + sw; hair(p, x, ty + tl, x + 1, ty + tl + 1.5, SH[2]); hair(p, x + 2, ty + tl, x + 2.5, ty + tl + 1, SH[1]); }
  }
  // Knochenanhänger an Schnüren
  for (const [ox, len] of [[-6, 9], [5, 7]]) {
    const sw = Math.sin(P.capeT + ox) * 0.8 + P.lean * 4;
    ln(p, hipX + ox, hipY - 1, hipX + ox + sw, hipY + len, SH[0]);
    const bx = hipX + ox + sw, by = hipY + len;
    p.rect(bx - 1, by, 3, 2, B[2]); p.px(bx - 1, by, B[4]); p.px(bx + 1, by + 1, B[1]);
    if (fine) { pt(p, bx - 0.5, by + 1, VOID); pt(p, bx + 0.5, by + 1, VOID); }
  }
  // Gürtel: dunkles Leder mit Eisenschnalle
  p.rect(hipX - 9, hipY - 3, 18, 3, K[1]); p.rect(hipX - 9, hipY - 3, 18, 1, K[3]);
  p.rect(hipX - 1, hipY - 4, 5, 5, K[3]); p.rect(hipX, hipY - 3, 3, 3, K[0]); p.px(hipX - 1, hipY - 4, K[5]);
  if (fine) { pt(p, hipX + 1, hipY - 2, GOLD[3]); pt(p, hipX + 1.5, hipY - 2, GOLD[2]); hair(p, hipX - 8.5, hipY - 3, hipX - 2, hipY - 3, K[4]); }
  for (let s = 2; s < SPINE - 9; s += 2) {
    const x = hipX + Math.sin(lean) * s, y = hipY - Math.cos(lean) * s;
    p.rect(x - 1, y - 1, 3, 2, B[2]); p.px(x - 1, y - 1, B[3]);
    if (fine) { hair(p, x - 1, y + 0.5, x + 1.5, y + 0.5, B[1]); pt(p, x - 1, y - 1, B[4]); }
  }
  const rcx = hipX + Math.sin(lean) * 16, rcy = hipY - Math.cos(lean) * 16;
  ell(p, rcx, rcy - 1, 9.5, 8.5, VOID);
  const soulR = 2.4 + P.soul * 1.4;
  ell(p, rcx, rcy, soulR, soulR + 1, glow[1]);
  ell(g, rcx, rcy, soulR + 0.5, soulR + 1.5, glow[1]);
  ell(g, rcx, rcy, soulR - 0.5, soulR, glow[2]);
  ell(g, rcx, rcy - 0.5, Math.max(0.6, soulR - 1.6), Math.max(0.6, soulR - 1.2), glow[3]);
  if (fine) {
    ell(p, rcx, rcy - 0.5, Math.max(0.6, soulR - 1.2), Math.max(0.6, soulR - 0.6), glow[2]);
    ell(p, rcx - 0.25, rcy - 0.75, Math.max(0.5, soulR - 2.4), Math.max(0.5, soulR - 1.8), glow[3]);
    ell(g, rcx - 0.25, rcy - 0.75, Math.max(0.5, soulR - 2.4), Math.max(0.5, soulR - 1.8), glow[4]);
    pt(g, rcx, rcy - soulR - 1, glow[3]); pt(g, rcx + 0.5, rcy - soulR - 2.5, glow[2]);
  }
  meta.chest = { x: rcx, y: rcy };
  for (let r = 0; r < 6; r++) {
    const off = -7.5 + r * 3;
    const cx = rcx + Math.sin(lean) * -off, cy = rcy - Math.cos(lean) * -off;
    const hw = 9.5 - Math.abs(r - 1.8) * 1.1;
    const ax = cx - perpX * hw, ay = cy - perpY * hw + 1.5, bx = cx + perpX * hw, by = cy + perpY * hw + 1.5;
    ln(p, ax, ay, cx, cy, B[2]); ln(p, cx, cy, bx, by, B[3]);
    ln(p, cx, cy + 1, bx - perpX, by + 1 - perpY, B[1]);
    if (fine) { hair(p, cx + perpX * 1.5, cy + perpY * 1.5 + 0.2, bx - perpX * 1.5, by - perpY * 1.5 - 0.2, B[4]); pt(p, bx, by, B[4]); }
  }
  limb(p, rcx + Math.sin(lean) * 8, rcy - Math.cos(lean) * 8, rcx - Math.sin(lean) * 5, rcy + Math.cos(lean) * 5, 2.5, 2, BONE4);
  // Schärpe aus Leichentuch: von der vorderen Schulter quer zur hinteren Hüfte
  {
    const x0 = shF.x - 1, y0 = shF.y - 1, x1 = hipX - 7, y1 = hipY - 1;
    limb(p, x0, y0, x1, y1, 5.5, 4.5, [SH[1], SH[3], SH[4], SH[5]]);
    if (fine) {
      for (const t of [0.25, 0.55, 0.8]) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; hair(p, x - 1.5, y - 1.5, x + 1.2, y + 1.8, SH[2]); }
      hair(p, x0 - 1.8, y0 + 1.6, x1 - 1.4, y1 + 1.4, SH[1]);
    }
  }

  // --- 5. Vorderes Bein
  const lightB = BONE4;
  limb(p, hipX + 2, hipY, legF.jx, legF.jy, 5.5, 4.5, lightB);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 7, 6, [K[0], K[2], K[3], K[4]]);
  {
    const mx = legF.jx + (legF.ex - legF.jx) * 0.5, my = legF.jy + (legF.ey - legF.jy) * 0.5;
    ln(p, legF.jx, legF.jy + 2, mx, my, K[4]);
    if (fine) { hair(p, legF.jx, legF.jy + 2, legF.jx + (mx - legF.jx) * 0.7, legF.jy + 2 + (my - legF.jy - 2) * 0.7, K[5]); pt(p, mx + 1, my + 2, GOLD[3]); }
  }
  p.rect(legF.ex - 3, legF.ey - 4, 11, 4, K[2]); p.rect(legF.ex - 3, legF.ey - 4, 11, 1, K[4]); p.rect(legF.ex - 3, legF.ey - 1, 11, 1, K[0]);
  p.px(legF.ex + 8, legF.ey - 2, K[3]); p.px(legF.ex + 9, legF.ey - 1, K[4]);
  if (fine) { hair(p, legF.ex - 2.5, legF.ey - 4, legF.ex + 5, legF.ey - 4, K[5]); hair(p, legF.ex + 2, legF.ey - 3.5, legF.ex + 2, legF.ey - 1.5, K[0]); }
  knob(p, legF.jx, legF.jy, 3, [K[0], K[2], K[3], K[4]]);
  if (fine) { pt(p, legF.jx + 0.5, legF.jy + 0.5, GOLD[3]); pt(p, legF.jx + 1, legF.jy + 1, GOLD[1]); }

  // --- 6. Hintere Schulter
  mantle(p, shB.x - 2, shB.y, 7, 5.5, P.cape * 3, true);

  // --- 7. Kapuze, Schädel, Gesichtsschatten
  hood(p, hx, hy, true);
  const jaw = Math.round(P.jaw * 3);
  const put = (rows, ox, oy) => {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const c = ch === 'V' || ch === 'o' ? VOID : ch === 'T' ? B[4] : ch === 't' ? B[2]
        : ch === 'E' ? (P.eye > 0.2 ? glow[3] : VOID) : ch === 'e' ? (P.eye > 0.2 ? glow[2] : VOID) : B[+ch];
      p.px(ox + x, oy + y, c);
    }
  };
  put(SKULL, hx, hy);
  if (jaw) { p.rect(hx + 5, hy + 12, 10, jaw, VOID); p.px(hx + 8, hy + 12, B[3]); p.px(hx + 12, hy + 12, B[3]); }
  put(SKULL_JAW, hx, hy + 12 + jaw);
  if (P.eye > 0.2) {
    g.px(hx + 6, hy + 6, glow[4]); g.px(hx + 7, hy + 6, glow[3]); g.px(hx + 7, hy + 7, glow[2]);
    g.px(hx + 13, hy + 6, glow[3]); g.px(hx + 13, hy + 7, glow[1]);
    if (P.eye > 0.8) { g.px(hx + 6, hy + 7, glow[1]); g.px(hx + 6, hy + 5, glow[1]); g.px(hx + 14, hy + 6, glow[1]); }
  }
  if (fine) skullFine(p, g, hx, hy, jaw, P.eye, glow);
  // Schatten der Kapuze auf der Stirn
  for (let x = hx + 2; x < hx + 16; x += fine ? 0.5 : 1) { const y = hy + 1.5 + Math.max(0, (hx + 8 - x)) * 0.35; pt(p, x, y, B[0]); if (fine) pt(p, x, y + 0.5, B[1]); }
  hood(p, hx, hy, false);
  meta.eye = { x: hx + 6, y: hy + 6 };
  meta.head = { x: hx + 6, y: hy - 9 };

  // --- 8. Schwung-Schleier
  if (extra.smear) {
    const s = extra.smear;
    smear(p, g, shF.x, shF.y, s[0], s[1], 14, 14 + FORE + BLADE * 0.95, glow, [St[5], St[3], '#b8a8d8', '#5e4a80']);
  }

  // --- 9. Vorderer Arm, Beil, Widderschädel
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 4, 3.5, lightB);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 5, [K[0], K[2], K[3], K[4]]);
    knob(p, armF.jx, armF.jy, 2.5, [K[0], K[2], K[3], K[4]]);
    p.rect(armF.ex - 2, armF.ey - 2, 5, 5, K[2]); p.px(armF.ex - 2, armF.ey - 2, K[4]);
    if (fine) {
      const ax0 = armF.jx + (armF.ex - armF.jx) * 0.3, ay0 = armF.jy + (armF.ey - armF.jy) * 0.3;
      hair(p, ax0 - 1.2, ay0 - 0.6, armF.ex - 1.6, armF.ey - 2.6, K[5]);
      for (let k = 0; k < 3; k++) hair(p, armF.ex - 1.5, armF.ey - 0.5 + k, armF.ex + 2.5, armF.ey - 0.5 + k, K[0]);
    }
  };
  let tip;
  if (extra.swordBehind) { tip = cleaver(p, g, hF.x, hF.y, sa, glow); drawArm(); }
  else {
    drawArm(); tip = cleaver(p, g, hF.x, hF.y, sa, glow);
    p.rect(hF.x - 2, hF.y - 2, 4, 4, K[3]); p.px(hF.x - 2, hF.y - 2, K[5]);
    if (fine) { hair(p, hF.x - 1.5, hF.y - 0.5, hF.x + 1.5, hF.y - 0.5, K[0]); hair(p, hF.x - 1.5, hF.y + 1, hF.x + 1.5, hF.y + 1, K[0]); }
  }
  mantle(p, shF.x + 1, shF.y, 8, 6.5, P.cape * 3, false);
  // Knochenschließe: kleiner Schädel am Kragen
  {
    const cx = shF.x - 2, cy = shF.y + 3;
    ell(p, cx, cy, 2, 1.8, B[2]); p.px(cx - 1, cy - 1, B[4]);
    pt(p, cx - 0.5, cy, VOID); pt(p, cx + 1, cy, VOID); g.px(cx, cy, glow[1]);
    if (fine) { pt(p, cx - 0.5, cy + 1.5, B[3]); pt(p, cx + 0.5, cy + 1.5, B[3]); pt(p, cx, cy + 1.5, VOID); pt(g, cx - 0.5, cy, glow[3]); pt(g, cx + 1, cy, glow[2]); }
  }
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = { x: tip.tipX, y: tip.tipY };

  if (P.cast > 0.05) {
    const r = 1 + P.cast * 3;
    ell(g, meta.cast.x, meta.cast.y, r + 1, r + 1, glow[1]);
    ell(g, meta.cast.x, meta.cast.y, r, r, glow[2]);
    ell(g, meta.cast.x, meta.cast.y, Math.max(0.5, r - 1.5), Math.max(0.5, r - 1.5), glow[3]);
    if (fine) { ell(g, meta.cast.x - 0.25, meta.cast.y - 0.25, Math.max(0.5, r - 2.6), Math.max(0.5, r - 2.6), glow[4]); pt(p, meta.cast.x, meta.cast.y, glow[3]); }
  }
  return meta;
}

// Zerfall: Leichentuch sinkt zusammen, Knochen, Beil liegt quer, Totenkrone kippt weg.
function drawCollapse(p, g, k, glow) {
  const gy = AY;
  const cx = AX + 2;
  ell(p, cx - 2, gy - 2, 17 + k * 6, 3.5, SH[1]);
  ell(p, cx - 4, gy - 3, 13 + k * 4, 2.5, SH[3]);
  ell(p, cx - 6, gy - 4, 7 + k * 2, 1.5, SH[4]);
  for (let i = 0; i < 20; i++) {
    const a = hash2(i, 2, 5) * Math.PI, r = 4 + hash2(i, 3, 5) * (12 + k * 8);
    const x = cx + Math.cos(a) * r - 4, y = gy - 3 - hash2(i, 4, 5) * (6 * (1 - k * 0.6));
    const l = 3 + hash2(i, 6, 5) * 4, ang = hash2(i, 7, 5) * Math.PI;
    limb(p, x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * 0.5, 2, 1.5, [B[1], B[1], B[2], B[3]]);
  }
  ell(p, cx - 6, gy - 6 + k * 2, 6, 4 - k, VOID);
  for (let r = 0; r < 4; r++) ln(p, cx - 11 + r * 3, gy - 8 + k * 2, cx - 9 + r * 3, gy - 3, B[3]);
  p.rect(cx + 6, gy - 9 + k * 3, 11, 7, B[3]); p.rect(cx + 6, gy - 9 + k * 3, 11, 1, B[4]);
  p.rect(cx + 10, gy - 7 + k * 3, 3, 2, VOID); p.rect(cx + 14, gy - 7 + k * 3, 2, 2, VOID);
  if (k < 0.5) g.px(cx + 11, gy - 7 + k * 3, glow[2]);
  ironDome(p, cx - 14, gy - 3, 5, 3);
  cleaver(p, g, cx - 24, gy - 5, -0.05, glow);
  // Totenkrone liegt schräg auf dem Boden
  const kx = cx + 30 + k * 8, ky = gy - 2;
  for (let a = Math.PI; a <= Math.PI * 2.001; a += 0.2) {
    const x0 = kx + Math.cos(a) * 9, y0 = ky + Math.sin(a) * 3, x1 = kx + Math.cos(a + 0.2) * 9, y1 = ky + Math.sin(a + 0.2) * 3;
    limb(p, x0, y0, x1, y1, 2, 2, [K[0], K[2], K[3], K[4]]);
  }
  for (let i = 0; i < 5; i++) { const x = kx - 7 + i * 3.5; limb(p, x, ky - 2, x + (i - 2) * 0.8, ky - 5 - (i % 2 ? 2 : 4), 2, 0.8, BONE4); }
}

// ---------------------------------------------------------------- Frames

// Bausatz der Frames für einen Rig-Boss: draw(p, g, P, glow, extra) zeichnet eine Pose und gibt die Metadaten zurück,
// collapse(p, g, k, glow) den Zerfall. Phase-3-Leuchtebene: dieselbe Zeichnung mit der zweiten Rampe. Die Leuchtebene
// nutzt nur Farben der Rampe und keine davon abhängige Form, darum genügt ein Umfärben je Feinpixel (exakt wie ein
// zweiter Zeichendurchgang); Farben außerhalb der Rampe bleiben.
export function rigBossSprites(draw, collapse, glow, enraged) {
  const ENRAGE = new Map(glow.map((c, i) => [col32(c), col32(enraged[i])]));
  function glowFrames(base, g, res) {
    const d = g.pixels(), e = new Uint32Array(d.length);
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (v) e[i] = ENRAGE.get(v) ?? v; }
    base.glow = new SpriteFrame(pixelsToCanvas(d, g.W, g.H), AX * res, AY * res, res);
    base.glowEnraged = new SpriteFrame(pixelsToCanvas(e, g.W, g.H), AX * res, AY * res, res);
  }
  // Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht – der Zonenaufbau
  // baut den Boss nicht mehr am Stück.
  const frame = (P, extra) => lazyFrame(() => {
    const res = fineRes(), g = new FineCanvas(W, H, res);
    let meta;
    const base = buildFrame(W, H, AX, AY, (p) => { meta = draw(p, g, P, glow, extra); }, { fine: true, res });
    // Leucht-Ebenen (kein Umriss, fein wie das Sprite): Grundrampe und, für Phase 3, die zweite Rampe
    glowFrames(base, g, res);
    base.meta = {};
    for (const k in meta) base.meta[k] = { dx: meta[k].x - AX, dy: meta[k].y - AY };
    base.fx = extra.fx ?? null; // Ereignis-Marke, z. B. 'step' oder 'impact'
    return base;
  });
  const collapseFrame = (k) => lazyFrame(() => {
    const res = fineRes(), g = new FineCanvas(W, H, res);
    const base = buildFrame(W, H, AX, AY, (p) => collapse(p, g, k, glow), { fine: true, res });
    glowFrames(base, g, res);
    base.meta = { head: { dx: 12, dy: -10 }, chest: { dx: -4, dy: -6 }, hand: { dx: -20, dy: -4 }, tip: { dx: 20, dy: -4 }, eye: { dx: 12, dy: -8 }, cast: { dx: 0, dy: -6 } };
    base.fx = null;
    return base;
  });
  return bossAnimations(frame, collapseFrame);
}

export function createBonelordSprites() {
  return rigBossSprites(drawBonelord, drawCollapse, GLOW.violet, GLOW.ember);
}

// Vollständiger Bewegungssatz für entities/Boss.js aus den Schlüsselposen des Rigs.
function bossAnimations(frame, collapseFrame) {
  // n Frames aus einer Keyframe-Spur; loop = letzter Frame ≠ erster
  function track(keys, n, { loop = false, extras = {} } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
      out.push(frame(sample(keys, t), extras[i] ?? {}));
    }
    return out;
  }

  // --- Grundposen
  const idleA = pose({ capeT: 0 });
  const idleB = pose({ hipY: 1, lean: 0.09, hFy: 16, hBy: 17, sword: 0.58, capeT: Math.PI, jaw: 0.3, soul: 1.3 });

  // Gehen: schwere Schritte, Oberkörper wippt, Umhang weht nach hinten
  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, pose({
      hipX: 1, hipY: Math.abs(c) * -1.2 + 0.8, lean: 0.14 + Math.abs(s) * 0.03,
      fFx: 3 + s * 8, fFy: Math.max(0, -c) * 3, fBx: -5 - s * 8, fBy: Math.max(0, c) * 3,
      hFx: 10 + s * 1.5, hFy: 14 - Math.abs(s), hBx: -4 - s * 3, hBy: 15,
      sword: 0.6 + s * 0.05, cape: 0.45, capeT: ph, head: s * 0.5,
    }), linear]);
  }

  // Schlafend: kniet, Schwert als Stütze vor sich in den Boden gerammt
  const kneel = pose({
    kneel: 1, lean: 0.32, fFx: 8, fBx: -10, hFx: 12, hFy: 6, grip: 1, sword: Math.PI / 2 - 0.08,
    head: 2, jaw: 0, eye: 0, soul: 0.3, cape: 0,
  });
  const rise = pose({ kneel: 0.3, lean: 0.12, hipY: 2, fFx: 8, fBx: -10, hFx: 12, hFy: 8, grip: 1, sword: 1.4, head: 1, eye: 1, soul: 1.2, cape: 0.3 });
  const roar = pose({ lean: -0.22, hipY: 1, hFx: 16, hFy: -2, hBx: -14, hBy: -6, sword: -0.35, jaw: 1, head: -1, soul: 1.8, cape: 0.8, capeT: 2, cast: 0.6, fFx: 9, fBx: -10 });

  // Hieb: ausholen über die hintere Schulter, dann weiter Querschlag
  const cw1 = pose({ lean: -0.08, hipX: -1, hFx: 2, hFy: -10, grip: 1, sword: -2.3, jaw: 0.3, fFx: 8, fBx: -9, cape: 0.3 });
  const cw2 = pose({ lean: -0.2, hipX: -2, hipY: 2, hFx: -6, hFy: -14, grip: 1, sword: -2.8, jaw: 0.8, fFx: 10, fBx: -10, cape: 0.4, soul: 1.4 });
  const cl1 = pose({ lean: 0.25, hipX: 2, hipY: 3, hFx: 16, hFy: -4, grip: 1, sword: -0.5, jaw: 1, fFx: 12, fBx: -11, cape: 0.8, capeT: 1 });
  const cl2 = pose({ lean: 0.42, hipX: 4, hipY: 5, hFx: 18, hFy: 12, grip: 1, sword: 0.75, jaw: 1, fFx: 13, fBx: -12, cape: 1, capeT: 2 });
  const cl3 = pose({ lean: 0.38, hipX: 3, hipY: 5, hFx: 13, hFy: 17, grip: 1, sword: 1.25, jaw: 0.5, fFx: 13, fBx: -12, cape: 0.6, capeT: 3 });
  const cl4 = pose({ lean: 0.2, hipX: 2, hipY: 3, hFx: 11, hFy: 16, grip: 0, sword: 0.9, jaw: 0.2, fFx: 11, fBx: -11, cape: 0.3, capeT: 4 });

  // Beben: Schwert beidhändig über den Kopf, dann in den Boden
  const sw1 = pose({ lean: -0.05, hFx: 6, hFy: -12, grip: 1, sword: -1.9, jaw: 0.5, fFx: 8, fBx: -9 });
  const sw2 = pose({ lean: -0.28, hipY: -2, hFx: 2, hFy: -18, grip: 1, sword: -2.35, jaw: 1, fFx: 9, fBx: -10, fBy: 2, soul: 1.6, cape: 0.2 });
  const sl1 = pose({ lean: 0.3, hipY: 3, hFx: 16, hFy: -6, grip: 1, sword: -0.4, jaw: 1, fFx: 11, fBx: -10, cape: 0.9 });
  const sl2 = pose({ lean: 0.55, hipY: 9, hFx: 18, hFy: 12, grip: 1, sword: 1.18, jaw: 1, fFx: 12, fBx: -12, cape: 1, capeT: 1, soul: 1.5 });
  const sl3 = pose({ lean: 0.5, hipY: 8, hFx: 17, hFy: 13, grip: 1, sword: 1.2, jaw: 0.6, fFx: 12, fBx: -12, cape: 0.5, capeT: 2 });
  const sl4 = pose({ lean: 0.2, hipY: 3, hFx: 12, hFy: 10, grip: 1, sword: 1.0, jaw: 0.2, fFx: 10, fBx: -10, cape: 0.2, capeT: 3 });

  // Zauber: Klaue hoch, Seelenfeuer lodert
  const ca1 = pose({ lean: -0.1, hBx: -10, hBy: -12, cast: 0.6, jaw: 0.6, soul: 1.5, sword: 0.9, hFy: 17, cape: 0.4 });
  const ca2 = pose({ lean: -0.18, hipY: -1, hBx: -8, hBy: -22, cast: 1, jaw: 1, soul: 1.9, sword: 1.0, hFy: 17, head: -1, cape: 0.6, capeT: 2 });

  // Ansturm: Schulter voran, Schwert schleift hinterher
  const chW = pose({ lean: 0.5, hipY: 6, hFx: 2, hFy: 20, grip: 0, sword: 2.75, fFx: 12, fBx: -14, jaw: 1, cape: 0.5, soul: 1.5 });
  const runKeys = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    runKeys.push([i / 6, pose({
      lean: 0.55, hipX: 3, hipY: 4 - Math.abs(c) * 2,
      fFx: 6 + s * 12, fFy: Math.max(0, -c) * 5, fBx: -4 - s * 12, fBy: Math.max(0, c) * 5,
      hFx: 0, hFy: 21, sword: 2.85 + s * 0.05, hBx: 8, hBy: 8, jaw: 1, cape: 1, capeT: ph * 2, soul: 1.6,
    }), linear]);
  }

  // Benommen: gebückt, Schwert im Boden, Kopf wankt
  const stA = pose({ lean: 0.5, hipY: 7, hFx: 14, hFy: 18, grip: 0, sword: 1.45, head: 2, jaw: 1, eye: 0.3, soul: 0.5, fFx: 9, fBx: -11, hBx: -2, hBy: 22 });
  const stB = pose({ lean: 0.46, hipY: 8, hFx: 14, hFy: 18, grip: 0, sword: 1.45, head: -1, jaw: 0.6, eye: 0.6, soul: 0.6, fFx: 9, fBx: -11, hBx: -1, hBy: 22 });

  const hurtP = pose({ lean: -0.18, hipX: -2, head: -2, jaw: 0.7, hFx: 6, hFy: 12, sword: 0.9, soul: 1.8, cape: 0.5 });

  // Tod: taumeln, auf die Knie, nach vorn kippen
  const d1 = pose({ lean: -0.3, hipX: -2, jaw: 1, head: -2, sword: 1.2, hFx: 12, hFy: 16, soul: 2, cape: 0.6 });
  const d2 = pose({ kneel: 0.8, lean: 0.35, jaw: 1, head: 2, sword: 1.5, hFx: 14, hFy: 20, soul: 1.2, eye: 0.6, hBx: 2, hBy: 22 });
  const d3 = pose({ kneel: 1, lean: 0.8, hipY: 4, jaw: 1, head: 4, sword: 0.1, hFx: 22, hFy: 24, soul: 0.4, eye: 0.1, hBx: 12, hBy: 24 });

  const sweepF = (a, b) => ({ smear: [a, b] });

  return {
    idle: new Animation(track([[0, idleA], [0.5, idleB], [1, idleA]], 8, { loop: true }), 6),
    walk: new Animation(track(walkKeys, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 9),
    dormant: new Animation(track([[0, kneel], [0.5, { ...kneel, soul: 0.55, capeT: 2 }], [1, kneel]], 6, { loop: true }), 3),
    awaken: new Animation(track([
      [0, kneel], [0.35, rise], [0.55, pose({ ...roar, jaw: 0.3, soul: 1.4 })], [0.75, roar, snap], [1, roar],
    ], 12, { extras: { 7: { fx: 'roar' } } }), 7.5, false),
    roar: new Animation(track([[0, idleA], [0.3, roar, snap], [0.8, { ...roar, capeT: 5 }], [1, roar]], 8, { extras: { 2: { fx: 'roar' } } }), 7, false),
    cleaveWindup: new Animation(track([[0, idleA], [0.45, cw1], [1, cw2]], 6), 9, false),
    cleave: new Animation(track([[0, cl1], [0.2, cl2, snap], [0.45, cl3], [1, cl4]], 7, {
      extras: { 0: { ...sweepF(-2.6, -0.5), swordBehind: false }, 1: { ...sweepF(-1.4, 0.75), fx: 'impact' }, 2: sweepF(0.2, 1.1) },
    }), 16, false),
    slamWindup: new Animation(track([[0, idleA], [0.4, sw1], [1, sw2]], 7), 8, false),
    slam: new Animation(track([[0, sl1], [0.18, sl2, snap], [0.55, sl3], [1, sl4]], 8, {
      extras: { 0: sweepF(-2.4, -0.4), 1: { ...sweepF(-1.2, 1.18), fx: 'impact' } },
    }), 12, false),
    cast: new Animation(track([[0, idleA], [0.4, ca1], [1, ca2]], 6), 8, false),
    chargeWindup: new Animation(track([[0, idleA], [0.5, pose({ ...chW, lean: 0.3, hipY: 3 })], [1, chW]], 6, { extras: { 5: { fx: 'step' } } }), 7, false),
    charge: new Animation(track(runKeys, 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } }), 14),
    stagger: new Animation(track([[0, stA], [0.5, stB], [1, stA]], 6, { loop: true }), 6),
    hurt: new Animation(track([[0, hurtP], [1, idleA]], 3), 12, false),
    death: new Animation([
      ...track([[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 8, { extras: { 5: { fx: 'impact' } } }),
      collapseFrame(0), collapseFrame(0.5), collapseFrame(1),
    ], 7, false),
  };
}

// Bodenriss für den Einschlag des Bebens (wird als Dekal gestempelt).
export function createSlamCrack() {
  const S = 56, p = new PixelCanvas(S, 32);
  const c = S / 2;
  for (let i = 0; i < 9; i++) {
    let x = c, y = 16;
    const a = (i / 9) * Math.PI * 2 + hash2(i, 1, 9) * 0.5;
    const len = 10 + hash2(i, 2, 9) * 14;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a + (hash2(i, s, 10) - 0.5) * 0.9);
      y += Math.sin(a + (hash2(i, s, 11) - 0.5) * 0.9) * 0.55;
      p.px(x, y, s < len * 0.5 ? '#07050b' : '#140f1a');
      if (s < len * 0.3) p.px(x + 1, y, '#07050b');
    }
  }
  p.ellipse(c, 16, 6, 3.5, '#0a070e');
  p.ellipse(c, 16, 3, 1.5, '#050308');
  return p.canvas;
}
