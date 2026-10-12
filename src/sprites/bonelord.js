import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
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
const W = 176, H = 136, AX = 66, AY = 128;
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

const THIGH = 15, SHIN = 15, SPINE = 22, UPPER = 12.5, FORE = 12.5, BLADE = 45;
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

const REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, jaw: 0,
  fFx: 7, fFy: 0, fBx: -8, fBy: 0,
  hFx: 9, hFy: 15, hBx: -5, hBy: 16,
  sword: 0.55, grip: 0, cape: 0.2, capeT: 0,
  cast: 0, eye: 1, soul: 1, kneel: 0,
};
const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => {
  const o = {};
  for (const k in REST) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
};
// Tastet eine Keyframe-Spur ab: keys = [[t 0..1, pose, easing?], ...]
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mix(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t); // schnell rein, weich aus

// ---------------------------------------------------------------- Geometrie

function ik(ax, ay, tx, ty, l1, l2, bend) {
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
const pt = (p, x, y, c) => (p.res === 1 ? p.px(x, y, c) : p.dot(x + p.step / 2, y + p.step / 2, c));
// Gefüllte Ellipse wie PixelCanvas.ellipse, aber im Feinraster gerechnet (bei res 1 identisch)
function ell(p, cx, cy, rx, ry, c) {
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
function ln(p, x0, y0, x1, y1, c) {
  if (p.res === 1) p.line(x0, y0, x1, y1, c);
  else { const h = p.step / 2; p.fline(x0 + h, y0 + h, x1 + h, y1 + h, c, 1); }
}
// Feine Linie 1 Feinpixel (nur fein benutzt), gleiche Lage wie ln/pt
const hair = (p, x0, y0, x1, y1, c) => { const h = p.step / 2; p.fline(x0 + h, y0 + h, x1 + h, y1 + h, c); };

// Dicker Knochen/Rüstteil mit Licht von links oben (fein: Kanten 1 Feinpixel).
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
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
function knob(p, x, y, r, ramp) {
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
function smear(p, g, cx, cy, a0, a1, r0, r1, glow) {
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
    const c = radial > 0.86 ? B[4] : radial > 0.7 ? B[3] : fresh > 0.7 ? '#c8bce0' : '#8a7aa8';
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

function drawBonelord(p, g, P0, glow, extra = {}) {
  const P = { ...P0 };
  for (const k of SCALED) P[k] *= SK;
  const gy = AY;
  const hipX = AX - 2 + P.hipX, hipY = gy - 28 + P.hipY + P.kneel * 11;
  const lean = P.lean;
  const chX = hipX + Math.sin(lean) * SPINE, chY = hipY - Math.cos(lean) * SPINE;
  const perpX = Math.cos(lean), perpY = Math.sin(lean); // "nach vorn" quer zum Rumpf
  const meta = {};
  const fine = p.fine;

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

  // --- 1. Umhang hinten (breit, schwer), mit hohem Kragen
  const capeTopX = chX - perpX * 2, capeTopY = chY - 3;
  const capeLen = 47 - P.kneel * 12;
  const NC = 22;
  for (let i = 0; i < NC; i++) {
    const u = i / (NC - 1);
    const sx = capeTopX - 11 + i * 0.95;
    const top = capeTopY + Math.abs(u - 0.4) * 3;
    const len = capeLen - Math.abs(u - 0.5) * 9 + Math.sin(P.capeT + i * 0.9) * 2.2 + (hash2(i, 1, 3) * 4 | 0);
    if (fine) {
      // Fein: Bahn je Feinpixelzeile; Falten zweifarbig (Grat mit heller Kante links, Tal dunkel rechts)
      for (let j = 0; j < len; j += 0.5) {
        const v = j / len;
        const x = sx - P.cape * 18 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 4 + i * 0.4) * 1.4 * v;
        const fold = Math.sin(i * 1.15 + v * 1.5);
        let shade = u < 0.12 ? 4 : u > 0.88 ? 0 : fold > 0.45 ? 3 : fold < -0.45 ? 1 : 2;
        if (v > 0.86 && shade > 0) shade--;
        if (v < 0.08 && shade > 1) shade = Math.min(4, shade + 1);
        const hi = fold > 0.45 && v < 0.86 ? Math.min(4, shade + 1) : shade, lo = fold < -0.1 ? Math.max(0, shade - 1) : shade;
        pt(p, x, top + j, CAPE[hi]); pt(p, x + 0.5, top + j, CAPE[shade]);
        if (i < NC - 1) { pt(p, x + 1, top + j, CAPE[shade]); pt(p, x + 1.5, top + j, CAPE[lo]); }
      }
      if (i % 4 === 1) { const x = sx - P.cape * 18 - (1 - u) * 5; pt(p, x, top + len, CAPE[0]); pt(p, x + 0.5, top + len, CAPE[0]); pt(p, x, top + len + 0.5, CAPE[0]); pt(p, x + 0.5, top + len + 1, CAPE[0]); }
      continue;
    }
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = sx - P.cape * 18 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 4 + i * 0.4) * 1.4 * v;
      // Faltenwurf: helle Grate, dunkle Täler, Saum dunkler
      const fold = Math.sin(i * 1.15 + v * 1.5);
      let shade = u < 0.12 ? 4 : u > 0.88 ? 0 : fold > 0.45 ? 3 : fold < -0.45 ? 1 : 2;
      if (v > 0.86 && shade > 0) shade--;
      if (v < 0.08 && shade > 1) shade = Math.min(4, shade + 1);
      p.px(x, top + j, CAPE[shade]);
      if (i < NC - 1) p.px(x + 1, top + j, CAPE[shade]);
    }
    if (i % 4 === 1) { const x = sx - P.cape * 18 - (1 - u) * 5; p.px(x, top + len, CAPE[0]); p.px(x, top + len + 1, CAPE[0]); }
  }
  // Hoher Kragen hinter dem Schädel (gezackt)
  for (let i = 0; i < 12; i++) {
    const x = hx - 4 + i * 0.8, top = hy - 2 + Math.abs(i - 1.5) * 0.7 - (i % 3 === 0 ? 2 : 0);
    p.rect(x, top, 1, chY - top + 2, CAPE[i < 2 ? 4 : i < 6 ? 3 : 2]);
    if (fine && i < 11) { pt(p, x, top, CAPE[i < 6 ? 4 : 3]); hair(p, x + 0.5, top + 1.5, x + 0.5, top + 4 + (i % 3), CAPE[i < 2 ? 3 : i < 6 ? 2 : 1]); }
  }

  // --- 2. Hinteres Bein und Arm (dunkler)
  const darkB = [VOID, B[0], B[1], B[2]];
  limb(p, hipX - 2, hipY, legB.jx, legB.jy, 5, 4, darkB);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 6.5, 6, [R[0], R[0], R[1], R[2]]);
  p.rect(legB.ex - 3, legB.ey - 4, 10, 4, R[0]); p.rect(legB.ex - 3, legB.ey - 4, 10, 1, R[1]);
  if (fine) { hair(p, legB.ex - 2.5, legB.ey - 4, legB.ex + 3, legB.ey - 4, R[2]); rivet(p, legB.ex + 4, legB.ey - 2.5, VOID, R[2]); }
  knob(p, legB.jx, legB.jy, 2.5, [R[0], R[1], R[1], R[2]]);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3.5, 3.5, darkB);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 3.5, [R[0], R[0], R[1], R[2]]);
  // Zauberhand
  const clawOpen = P.cast > 0.3 || P.grip > 0.5 ? 1 : 0;
  p.rect(armB.ex - 2, armB.ey - 1, 4, 3, B[1]);
  if (clawOpen) for (let k = -2; k <= 2; k += 2) ln(p, armB.ex + k * 0.6, armB.ey - 1, armB.ex + k * 1.3, armB.ey - 4, B[2]);
  if (fine) {
    // Fingerknöchel und Krallenspitzen
    for (let k = -1.5; k <= 1.5; k += 1) pt(p, armB.ex + k, armB.ey - 1, B[2]);
    if (clawOpen) for (let k = -2; k <= 2; k += 2) { pt(p, armB.ex + k * 1.3, armB.ey - 4, B[3]); pt(p, armB.ex + k * 1.3 + 0.5, armB.ey - 4.5, B[4]); }
  }
  meta.cast = { x: armB.ex, y: armB.ey - 3 };

  // --- 3. Becken, Tassetten, Wirbelsäule, Brustkorb
  ell(p, hipX, hipY, 8, 3.5, B[1]); ell(p, hipX, hipY - 1, 7, 2.5, B[2]); p.px(hipX - 4, hipY - 2, B[4]);
  for (let i = 0; i < 5; i++) {
    const tx = hipX - 8 + i * 4, ty = hipY + 1;
    const sw = Math.sin(P.capeT + i) * 0.8 + P.lean * 4;
    const tl = 10 - Math.abs(i - 2) * 1.2;
    p.rect(tx + sw * 0.3, ty, 4, tl, R[i % 2 ? 1 : 2]);
    p.rect(tx + sw * 0.3, ty, 4, 1, R[3]);
    p.rect(tx + sw * 0.3 + 3, ty + 1, 1, tl - 1, R[0]);
    if (!fine) { p.px(tx + sw * 0.3 + 1, ty + 3, RUST[2]); p.px(tx + sw * 0.3 + 2, ty + tl - 2, RUST[1]); continue; }
    // Fein: Glanzlinie oben, Niete mit Glanz, Kratzer, Rostfleck klein
    const x0 = tx + sw * 0.3;
    hair(p, x0, ty, x0 + 2, ty, i % 2 ? St[3] : St[4]);
    rivet(p, x0 + 1, ty + 2, R[0], i % 2 ? St[3] : St[4]);
    hair(p, x0 + 0.5, ty + 4.5 + (i % 2), x0 + 2, ty + 5.5 + (i % 2), R[0]); pt(p, x0 + 1, ty + 4.5 + (i % 2), R[3]);
    pt(p, x0 + 2, ty + tl - 2, RUST[1]); pt(p, x0 + 2.5, ty + tl - 2, RUST[2]); pt(p, x0 + 2, ty + tl - 1.5, RUST[0]);
    hair(p, x0, ty + tl - 0.5, x0 + 3.5, ty + tl - 0.5, R[0]);
  }
  // Gürtel mit Schädelschnalle
  p.rect(hipX - 9, hipY - 3, 18, 3, PAL.leather[1]); p.rect(hipX - 9, hipY - 3, 18, 1, PAL.leather[3]);
  if (fine) {
    // Leder: Naht als Punktlinie, Kerben
    for (let x = hipX - 8.5; x < hipX + 8.5; x += 1) if (x < hipX - 1.5 || x > hipX + 4) pt(p, x, hipY - 1.5, PAL.leather[2]);
    pt(p, hipX - 6, hipY - 2.5, PAL.leather[0]); pt(p, hipX + 6, hipY - 2, PAL.leather[0]);
  }
  p.rect(hipX - 1, hipY - 5, 5, 5, B[3]); p.px(hipX - 1, hipY - 5, B[4]); p.px(hipX, hipY - 3, VOID); p.px(hipX + 2, hipY - 3, VOID); p.px(hipX + 1, hipY - 1, B[1]);
  if (fine) {
    // Schädelschnalle: runde Kalotte, Augen mit Glimmen, spitze Zähnchen
    pt(p, hipX - 1, hipY - 5, VOID); pt(p, hipX + 3.5, hipY - 5, VOID); pt(p, hipX - 0.5, hipY - 5, B[4]); pt(p, hipX, hipY - 5, '#ffffff');
    pt(p, hipX + 0.5, hipY - 3, glow[1]); pt(p, hipX + 2, hipY - 3, glow[1]);
    for (let k = 0; k < 6; k++) { pt(p, hipX + k * 0.5, hipY - 1, k % 2 ? B[1] : B[4]); pt(p, hipX + k * 0.5, hipY - 0.5, k % 2 ? VOID : B[2]); }
    pt(p, hipX - 1, hipY - 0.5, VOID); pt(p, hipX + 3.5, hipY - 0.5, VOID);
  }
  // Wirbel
  for (let s = 2; s < SPINE - 9; s += 2) {
    const x = hipX + Math.sin(lean) * s, y = hipY - Math.cos(lean) * s;
    p.rect(x - 1, y - 1, 3, 2, B[2]); p.px(x - 1, y - 1, B[3]);
    if (fine) { hair(p, x - 1, y + 0.5, x + 1.5, y + 0.5, B[1]); pt(p, x - 1, y - 1, B[4]); pt(p, x + 1.5, y - 0.5, B[1]); }
  }
  // Brustkorb: dunkles Inneres, Rippen quer zur Wirbelsäule
  const rcx = hipX + Math.sin(lean) * 16, rcy = hipY - Math.cos(lean) * 16;
  ell(p, rcx, rcy - 1, 9.5, 8.5, VOID);
  // Seelenfeuer
  const soulR = 2.4 + P.soul * 1.4;
  ell(p, rcx, rcy, soulR, soulR + 1, glow[1]);
  ell(g, rcx, rcy, soulR + 0.5, soulR + 1.5, glow[1]);
  ell(g, rcx, rcy, soulR - 0.5, soulR, glow[2]);
  ell(g, rcx, rcy - 0.5, Math.max(0.6, soulR - 1.6), Math.max(0.6, soulR - 1.2), glow[3]);
  if (fine) {
    // Heißer Kern im farbigen Saum (Grundbild und Leuchtebene), züngelnde Flamme
    ell(p, rcx, rcy - 0.5, Math.max(0.6, soulR - 1.2), Math.max(0.6, soulR - 0.6), glow[2]);
    ell(p, rcx - 0.25, rcy - 0.75, Math.max(0.5, soulR - 2.4), Math.max(0.5, soulR - 1.8), glow[3]);
    ell(g, rcx - 0.25, rcy - 0.75, Math.max(0.5, soulR - 2.4), Math.max(0.5, soulR - 1.8), glow[4]);
    pt(g, rcx, rcy - soulR - 1, glow[3]); pt(g, rcx + 0.5, rcy - soulR - 2.5, glow[2]); pt(g, rcx - 0.5, rcy - soulR - 1.5, glow[2]);
    pt(g, rcx + 1, rcy - soulR - 3.5, glow[1]); pt(p, rcx, rcy - soulR - 0.5, glow[2]);
  }
  g.px(rcx, rcy - soulR - 2, glow[2]); g.px(rcx + 1, rcy - soulR - 3, glow[1]);
  meta.chest = { x: rcx, y: rcy };
  for (let r = 0; r < 6; r++) {
    const off = -7.5 + r * 3;
    const cx = rcx + Math.sin(lean) * -off, cy = rcy - Math.cos(lean) * -off;
    const hw = 9.5 - Math.abs(r - 1.8) * 1.1;
    const ax = cx - perpX * hw, ay = cy - perpY * hw + 1.5, bx = cx + perpX * hw, by = cy + perpY * hw + 1.5;
    ln(p, ax, ay, cx, cy, B[2]); ln(p, cx, cy, bx, by, B[3]);
    ln(p, cx, cy + 1, bx - perpX, by + 1 - perpY, B[1]);
    if (fine) {
      // Rippen: Glanzlinie an der Oberkante, dunkle Unterkante, Riss in jeder zweiten
      hair(p, cx + perpX * 1.5, cy + perpY * 1.5 + 0.2, bx - perpX * 1.5, by - perpY * 1.5 - 0.2, B[4]);
      hair(p, ax + perpX * 1, ay + perpY - 0.2, cx - perpX, cy - perpY, B[3]);
      if (r % 2) { const m = 0.55; pt(p, cx + perpX * hw * m, cy + perpY * hw * m + 1.5 * m, B[0]); pt(p, cx + perpX * hw * m + 0.5, cy + perpY * hw * m + 1.5 * m + 0.5, B[1]); }
      pt(p, bx, by, B[4]); pt(p, bx + 0.5, by, B[3]); pt(p, bx, by + 0.5, B[3]); pt(p, ax, ay + 1, B[1]);
    } else { p.px(bx, by, B[4]); p.px(ax, ay + 1, B[1]); }
  }
  // Brustbein
  limb(p, rcx + Math.sin(lean) * 8, rcy - Math.cos(lean) * 8, rcx - Math.sin(lean) * 5, rcy + Math.cos(lean) * 5, 2.5, 2, [B[1], B[2], B[3], B[4]]);
  // Halsberge: eiserner Kragen über den Schlüsselbeinen
  {
    const nx0 = chX + Math.sin(lean) * 1, ny0 = chY - Math.cos(lean) * 1;
    ell(p, nx0, ny0, 7, 3, R[0]); ell(p, nx0 - 0.5, ny0 - 0.5, 6, 2, R[2]); ln(p, nx0 - 5, ny0 - 2, nx0 + 4, ny0 - 2, R[3]);
    p.px(nx0 + 3, ny0, RUST[2]); p.px(nx0 - 3, ny0 + 1, RUST[1]);
    if (fine) { hair(p, nx0 - 4.5, ny0 - 2, nx0 + 0.5, ny0 - 2, St[4]); pt(p, nx0 - 3.5, ny0 - 2, St[5]); rivet(p, nx0 + 4.5, ny0 - 0.5); rivet(p, nx0 - 5.5, ny0); hair(p, nx0 - 1, ny0 + 0.5, nx0 + 1.5, ny0 - 0.5, R[0]); }
  }

  // --- 4. Vorderes Bein
  const lightB = [B[1], B[2], B[3], B[4]];
  limb(p, hipX + 2, hipY, legF.jx, legF.jy, 5.5, 4.5, lightB);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 7, 6, [R[0], R[1], R[2], R[3]]);
  // Beinschiene: Mittelgrat
  {
    const mx = legF.jx + (legF.ex - legF.jx) * 0.5, my = legF.jy + (legF.ey - legF.jy) * 0.5; ln(p, legF.jx, legF.jy + 2, mx, my, R[3]); p.px(mx + 1, my + 1, RUST[2]);
    if (fine) {
      // Beinschiene: Glanzlinie auf dem Grat, Glanzpunkt, Kratzer, Niete
      hair(p, legF.jx, legF.jy + 2, legF.jx + (mx - legF.jx) * 0.75, legF.jy + 2 + (my - legF.jy - 2) * 0.75, St[4]);
      pt(p, legF.jx, legF.jy + 2.5, St[5]);
      hair(p, mx - 2, my + 2, mx - 0.5, my + 3, R[0]); hair(p, mx + 1.5, my - 3, mx + 2.5, my - 2, R[0]);
      rivet(p, legF.ex - 2.5, legF.ey - 6); rivet(p, legF.ex + 2, legF.ey - 6.5);
    }
  }
  // Sabaton mit Zehendorn
  p.rect(legF.ex - 3, legF.ey - 4, 11, 4, R[1]); p.rect(legF.ex - 3, legF.ey - 4, 11, 1, R[3]); p.rect(legF.ex - 3, legF.ey - 1, 11, 1, R[0]); p.px(legF.ex, legF.ey - 2, RUST[2]);
  p.px(legF.ex + 8, legF.ey - 2, B[3]); p.px(legF.ex + 9, legF.ey - 1, B[4]);
  if (fine) {
    // Sabaton: Glanzlinie oben, Glanzpunkt vorn, Lamellenfuge, Niete, scharfer Zehendorn
    hair(p, legF.ex - 2.5, legF.ey - 4, legF.ex + 5, legF.ey - 4, St[4]); pt(p, legF.ex + 6, legF.ey - 4, St[5]);
    hair(p, legF.ex + 2, legF.ey - 3.5, legF.ex + 2, legF.ey - 1.5, R[0]); hair(p, legF.ex + 2.5, legF.ey - 3.5, legF.ex + 2.5, legF.ey - 2, R[3]);
    rivet(p, legF.ex - 2, legF.ey - 3); rivet(p, legF.ex + 5, legF.ey - 3);
    pt(p, legF.ex + 9.5, legF.ey - 1, B[3]); pt(p, legF.ex + 10, legF.ey - 0.5, B[4]); pt(p, legF.ex + 8, legF.ey - 2, B[4]);
  }
  knob(p, legF.jx, legF.jy, 3, [R[0], R[1], R[2], R[3]]); p.px(legF.jx + 1, legF.jy + 1, RUST[2]);
  limb(p, legF.jx + 1, legF.jy - 2, legF.jx + 4, legF.jy - 5, 2, 1, lightB);

  // --- 5. Hintere Schulterplatte
  const pauldron = (x, y, rx, ry, ramp, spikes) => {
    ell(p, x, y, rx, ry, ramp[0]);
    ell(p, x - 0.5, y - 0.5, rx - 1, ry - 1, ramp[1]);
    ell(p, x - 1.5, y - 1.5, rx - 3, ry - 2.5, ramp[2]);
    const front = ramp[2] === R[3];
    p.px(x - rx * 0.45, y - ry * 0.6, front ? St[4] : R[3]);
    if (fine) {
      // Glanzlinie als Lichtsichel oben links, Glanzpunkt, Kratzer
      for (let a = 3.5; a < 4.95; a += 0.08) pt(p, x - 1.5 + Math.cos(a) * (rx - 3.6), y - 1.5 + Math.sin(a) * (ry - 3), front ? St[4] : R[3]);
      for (let a = 3.2; a < 5.3; a += 0.08) pt(p, x - 0.5 + Math.cos(a) * (rx - 1.3), y - 0.5 + Math.sin(a) * (ry - 1.3), ramp[2]);
      pt(p, x - rx * 0.45, y - ry * 0.6, front ? St[5] : St[3]); pt(p, x - rx * 0.45 + 0.5, y - ry * 0.6, front ? St[4] : R[3]);
      hair(p, x + rx * 0.15, y - ry * 0.05, x + rx * 0.5, y + ry * 0.3, ramp[0]);
      hair(p, x - rx * 0.35, y + ry * 0.15, x - rx * 0.1, y + ry * 0.35, ramp[0]); pt(p, x - rx * 0.35, y + ry * 0.15 - 0.5, front ? St[3] : R[3]);
    }
    // gestaffelte Lamellen darunter
    for (let l = 1; l <= 2; l++) {
      ln(p, x - rx + 1 + l, y + ry - 1 + l * 2, x + rx - 1 - l * 0.5, y + ry - 1 + l * 2, ramp[0]);
      ln(p, x - rx + 1 + l, y + ry - 2 + l * 2, x + rx - 1 - l * 0.5, y + ry - 2 + l * 2, l === 1 ? ramp[1] : ramp[0]);
      if (fine) hair(p, x - rx + 1.5 + l, y + ry - 2 + l * 2, x + rx * 0.2, y + ry - 2 + l * 2, l === 1 ? ramp[2] : ramp[1]);
    }
    ln(p, x - rx + 1, y + ry - 1, x + rx - 1, y + ry - 1, ramp[0]);
    for (let k = -rx + 2; k < rx - 1; k += 3) {
      if (fine) rivet(p, x + k, y + ry - 2, RUST[0], front ? St[4] : St[3]);
      else p.px(x + k, y + ry - 2, RUST[3]);
    }
    ln(p, x - rx + 2, y + ry - 1, x + rx - 2, y + ry - 1, RUST[1]);
    // Dornen: gebogen, spitz zulaufend (Knochen mit dunkler Unterseite)
    for (const [sx, h, lean2] of spikes) {
      const bx0 = x + sx, by0 = y - ry + 1.5;
      const mx = bx0 + lean2 * 0.3, my = by0 - h * 0.6;
      limb(p, bx0, by0, mx, my, 3, 2, [St[0], St[1], St[2], St[3]]);
      limb(p, mx, my, bx0 + lean2, by0 - h, 2, 1, [St[1], St[2], St[3], St[4]]);
      if (fine) { pt(p, bx0 + lean2, by0 - h, St[5]); hair(p, mx - 0.6, my + 0.3, mx + 0.6, my - 0.1, St[0]); hair(p, bx0 - 0.6, by0 - h * 0.3, bx0 + 0.4, by0 - h * 0.3 - 0.3, St[1]); }
      else p.px(bx0 + lean2, by0 - h, St[5]);
    }
  };
  pauldron(shB.x - 2, shB.y, 7, 5.5, [R[0], R[1], R[2]], [[-2, 7, -4]]);

  // --- 6. Schädel mit Krone
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
  if (jaw) {
    p.rect(hx + 5, hy + 12, 10, jaw, VOID);
    // Fangzähne ragen in den offenen Rachen
    p.px(hx + 8, hy + 12, B[3]); p.px(hx + 12, hy + 12, B[3]);
    if (jaw > 1) { p.px(hx + 12, hy + 13, B[2]); g.px(hx + 10, hy + 13, glow[1]); }
  }
  put(SKULL_JAW, hx, hy + 12 + jaw);
  if (jaw) { p.px(hx + 7, hy + 11 + jaw, B[3]); p.px(hx + 11, hy + 11 + jaw, B[3]); }
  // Augen: Seelenfeuer in den Höhlen
  if (P.eye > 0.2) {
    // kleiner, heißer Kern – die dunkle Höhle bleibt drumherum sichtbar
    g.px(hx + 6, hy + 6, glow[4]); g.px(hx + 7, hy + 6, glow[3]); g.px(hx + 7, hy + 7, glow[2]);
    g.px(hx + 13, hy + 6, glow[3]); g.px(hx + 13, hy + 7, glow[1]);
    if (P.eye > 0.8) {
      g.px(hx + 6, hy + 7, glow[1]); g.px(hx + 6, hy + 5, glow[1]); g.px(hx + 14, hy + 6, glow[1]);
    }
  }
  if (fine) skullFine(p, g, hx, hy, jaw, P.eye, glow);
  meta.eye = { x: hx + 6, y: hy + 6 };
  // Eisenreif mit Knochendornen
  p.rect(hx, hy - 1, 16, 3, St[1]); p.rect(hx, hy - 1, 16, 1, St[3]); p.rect(hx, hy + 1, 16, 1, St[0]);
  for (let x = hx + 2; x < hx + 16; x += 4) {
    if (fine) { pt(p, x, hy, St[5]); pt(p, x + 0.5, hy, St[4]); pt(p, x, hy + 0.5, St[3]); pt(p, x + 0.5, hy + 0.5, St[0]); }
    else p.px(x, hy, St[4]);
  }
  if (fine) { hair(p, hx + 0.5, hy - 1, hx + 6, hy - 1, St[4]); pt(p, hx + 2.5, hy - 1, St[5]); hair(p, hx + 11.5, hy - 0.5, hx + 13, hy, St[0]); }
  const crown = [[1, 6, -1.2], [4.5, 9, -0.6], [8, 13, 0], [11.5, 9, 0.6], [15, 6, 1.2]];
  for (const [cx, h, lean2] of crown) {
    const bx0 = hx + cx, by0 = hy - 1;
    const mx = bx0 + lean2 * 0.4, my = by0 - h * 0.55;
    limb(p, bx0, by0, mx, my, 3, 2.2, [B[0], B[0], B[1], B[2]]);
    limb(p, mx, my, bx0 + lean2 * 1.5, by0 - h, 2.2, 1, [B[0], B[1], B[2], B[3]]);
    if (!fine) { p.px(bx0 + lean2 * 1.5, by0 - h, B[4]); continue; }
    // Hornringe: dunkle Ringfurchen mit heller Kante darüber, Spitze mit Glanz
    for (const t of [0.45, 0.95]) {
      const sx = bx0 + (mx - bx0) * t, sy = by0 + (my - by0) * t, w = 1.3 - t * 0.3;
      hair(p, sx - w, sy, sx + w - 0.5, sy, B[1]); pt(p, sx - w + 0.5, sy - 0.5, B[3]);
    }
    pt(p, bx0 + lean2 * 1.5, by0 - h, B[4]); pt(p, bx0 + lean2 * 1.5, by0 - h + 0.5, B[3]); pt(p, bx0 + lean2 * 1.3 - 0.5, by0 - h + 1.5, '#ffffff');
  }
  // Seelenstein im Reif
  ell(p, hx + 8, hy, 1.5, 1.5, VOID); p.px(hx + 8, hy, glow[1]);
  g.px(hx + 8, hy, glow[4]); g.px(hx + 7, hy, glow[2]); g.px(hx + 9, hy, glow[2]); g.px(hx + 8, hy - 1, glow[2]);
  if (fine) { pt(p, hx + 8, hy, glow[3]); pt(p, hx + 8.5, hy + 0.5, glow[0]); pt(p, hx + 8, hy - 0.5, '#ffffff'); pt(g, hx + 7.5, hy, glow[3]); pt(g, hx + 9, hy, glow[3]); pt(g, hx + 8, hy - 0.5, glow[3]); }
  meta.head = { x: hx + 8, y: hy - 6 };

  // --- 7. Schwung-Schleier
  if (extra.smear) {
    const s = extra.smear;
    smear(p, g, shF.x, shF.y, s[0], s[1], 14, 14 + FORE + BLADE * 0.95, glow);
  }

  // --- 8. Vordere Schulterplatte, Arm, Schwert
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 4, 3.5, lightB);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 5, [R[0], R[1], R[2], R[3]]);
    knob(p, armF.jx, armF.jy, 2.5, [R[0], R[1], R[2], R[3]]); p.px(armF.jx - 1, armF.jy - 1, St[4]);
    p.rect(armF.ex - 2, armF.ey - 2, 5, 5, R[1]); p.px(armF.ex - 2, armF.ey - 2, R[3]);
    if (fine) {
      // Armschiene: Glanzlinie, Kratzer; Panzerhandschuh mit Fingerplatten und Niete
      const ax0 = armF.jx + (armF.ex - armF.jx) * 0.3, ay0 = armF.jy + (armF.ey - armF.jy) * 0.3;
      hair(p, ax0 - 1.2, ay0 - 0.6, armF.ex - 1.6, armF.ey - 2.6, St[4]); pt(p, ax0 - 1.2, ay0 - 0.6, St[5]);
      hair(p, ax0 + 0.5, ay0 + 1.5, ax0 + 1.5, ay0 + 2, R[0]);
      pt(p, armF.jx - 1, armF.jy - 1, St[5]);
      hair(p, armF.ex - 2, armF.ey - 2, armF.ex + 2.5, armF.ey - 2, R[3]); pt(p, armF.ex - 2, armF.ey - 2, St[4]);
      for (let k = 0; k < 3; k++) hair(p, armF.ex - 1.5, armF.ey - 0.5 + k * 1, armF.ex + 2.5, armF.ey - 0.5 + k * 1, R[0]);
      rivet(p, armF.ex + 1.5, armF.ey - 1.5);
    }
  };
  const swordBehind = extra.swordBehind;
  let tip;
  if (swordBehind) { tip = greatsword(p, g, hF.x, hF.y, sa, glow); drawArm(); }
  else { drawArm(); tip = greatsword(p, g, hF.x, hF.y, sa, glow); p.rect(hF.x - 2, hF.y - 2, 4, 4, R[2]); p.px(hF.x - 2, hF.y - 2, R[3]);
    if (fine) { pt(p, hF.x - 2, hF.y - 2, St[4]); hair(p, hF.x - 1.5, hF.y - 0.5, hF.x + 1.5, hF.y - 0.5, R[0]); hair(p, hF.x - 1.5, hF.y + 1, hF.x + 1.5, hF.y + 1, R[0]); pt(p, hF.x - 1.5, hF.y - 1.5, R[3]); }
  }
  pauldron(shF.x + 2, shF.y, 8.5, 6.5, [R[1], R[2], R[3]], [[1, 8, 3], [5, 5, 4]]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = { x: tip.tipX, y: tip.tipY };

  // Zauberglut an der Hand
  if (P.cast > 0.05) {
    const r = 1 + P.cast * 3;
    ell(g, meta.cast.x, meta.cast.y, r + 1, r + 1, glow[1]);
    ell(g, meta.cast.x, meta.cast.y, r, r, glow[2]);
    ell(g, meta.cast.x, meta.cast.y, Math.max(0.5, r - 1.5), Math.max(0.5, r - 1.5), glow[3]);
    if (fine) { ell(g, meta.cast.x - 0.25, meta.cast.y - 0.25, Math.max(0.5, r - 2.6), Math.max(0.5, r - 2.6), glow[4]); pt(p, meta.cast.x, meta.cast.y, glow[3]); }
  }
  return meta;
}

// Zerfall: Knochenhaufen, umgestürzte Rüstung, Schwert und weggerollte Krone.
function drawCollapse(p, g, k, glow) {
  const gy = AY;
  const cx = AX + 2;
  ell(p, cx - 2, gy - 2, 16 + k * 6, 3.5, CAPE[1]);
  ell(p, cx - 4, gy - 3, 12 + k * 4, 2.5, CAPE[2]);
  for (let i = 0; i < 22; i++) {
    const a = hash2(i, 2, 5) * Math.PI, r = 4 + hash2(i, 3, 5) * (12 + k * 8);
    const x = cx + Math.cos(a) * r - 4, y = gy - 3 - hash2(i, 4, 5) * (6 * (1 - k * 0.6));
    const l = 3 + hash2(i, 6, 5) * 4, ang = hash2(i, 7, 5) * Math.PI;
    limb(p, x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * 0.5, 2, 1.5, [B[1], B[1], B[2], B[3]]);
  }
  // Brustkorb
  ell(p, cx - 6, gy - 6 + k * 2, 6, 4 - k, VOID);
  for (let r = 0; r < 4; r++) ln(p, cx - 11 + r * 3, gy - 8 + k * 2, cx - 9 + r * 3, gy - 3, B[3]);
  // Schädel liegt
  p.rect(cx + 6, gy - 9 + k * 3, 11, 7, B[3]); p.rect(cx + 6, gy - 9 + k * 3, 11, 1, B[4]);
  p.rect(cx + 10, gy - 7 + k * 3, 3, 2, VOID); p.rect(cx + 14, gy - 7 + k * 3, 2, 2, VOID);
  if (k < 0.5) g.px(cx + 11, gy - 7 + k * 3, glow[2]);
  // Schulterplatten
  ell(p, cx - 14, gy - 3, 5, 3, R[1]); ell(p, cx - 15, gy - 4, 3, 2, R[2]);
  ell(p, cx + 1, gy - 2, 6, 3, R[2]); ell(p, cx, gy - 3, 4, 2, R[3]);
  // Schwert liegt quer
  greatsword(p, g, cx - 22, gy - 4, -0.05, glow);
  // Krone rollt weg
  const kx = cx + 26 + k * 10;
  p.rect(kx, gy - 3, 12, 2, St[1]); p.rect(kx, gy - 3, 12, 1, St[3]);
  for (let i = 0; i < 5; i++) limb(p, kx + i * 3, gy - 3, kx + i * 3 + 1, gy - 5 - [3, 5, 7, 5, 3][i], 2, 1, [B[1], B[2], B[3], B[4]]);
}

// ---------------------------------------------------------------- Frames

// Phase-3-Leuchtebene: dieselbe Zeichnung mit der Glut-Rampe. Die Leuchtebene nutzt nur Farben der Rampe und
// keine davon abhängige Form, darum genügt ein Umfärben je Feinpixel (exakt wie ein zweiter Zeichendurchgang).
const ENRAGE = new Map(GLOW.violet.map((c, i) => [col32(c), col32(GLOW.ember[i])]));
function glowFrames(base, g, res) {
  const d = g.pixels(), e = new Uint32Array(d.length);
  for (let i = 0; i < d.length; i++) { const v = d[i]; if (v) e[i] = ENRAGE.get(v) ?? v; }
  base.glow = new SpriteFrame(pixelsToCanvas(d, g.W, g.H), AX * res, AY * res, res);
  base.glowEnraged = new SpriteFrame(pixelsToCanvas(e, g.W, g.H), AX * res, AY * res, res);
}

function frame(P, extra) {
  const res = fineRes(), g = new FineCanvas(W, H, res);
  let meta;
  const base = buildFrame(W, H, AX, AY, (p) => { meta = drawBonelord(p, g, P, GLOW.violet, extra); }, { fine: true, res });
  // Leucht-Ebenen (kein Umriss, fein wie das Sprite): violett und, für Phase 3, glutrot
  glowFrames(base, g, res);
  base.meta = {};
  for (const k in meta) base.meta[k] = { dx: meta[k].x - AX, dy: meta[k].y - AY };
  base.fx = extra.fx ?? null; // Ereignis-Marke, z. B. 'step' oder 'impact'
  return base;
}

function collapseFrame(k) {
  const res = fineRes(), g = new FineCanvas(W, H, res);
  const base = buildFrame(W, H, AX, AY, (p) => drawCollapse(p, g, k, GLOW.violet), { fine: true, res });
  glowFrames(base, g, res);
  base.meta = { head: { dx: 12, dy: -10 }, chest: { dx: -4, dy: -6 }, hand: { dx: -20, dy: -4 }, tip: { dx: 20, dy: -4 }, eye: { dx: 12, dy: -8 }, cast: { dx: 0, dy: -6 } };
  base.fx = null;
  return base;
}

// n Frames aus einer Keyframe-Spur; loop = letzter Frame ≠ erster
function track(keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), extras[i] ?? {}));
  }
  return out;
}

export function createBonelordSprites() {
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
