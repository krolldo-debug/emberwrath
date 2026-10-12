import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Aschewolf (und Rudelführer): hageres Tier mit aschgrauem Fell, in dem
// Glut glimmt. Seitenansicht nach rechts, parametrisch gezeichnet.
// Körperteile sind schattierte Volumen (Licht von oben links, 4–5 harte
// Stufen), darüber liegen Fellsträhnen, Halskrause und ein keilförmiger Kopf
// mit Brauenwulst, Glutauge, Nasenspiegel und Fängen.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln; vol, capsule
// und poly tasten Feinpixel ab. Bei p.fine: Rampen um eine dunkle Stufe verlängert und härter abgestuft (Bauch,
// Beininnenseiten, Halsunterseite), Fell in gerichteten Strähnenbüscheln, Glutrisse als Linie mit hellem Kern im
// Saum, Augen mit Glanzpunkt, einzelne Zähne, Nasenspiegel mit Glanz und Zehen.
const VARIANTS = {
  wolf: {
    s: 1, scar: false,
    fur: ['#1e1a1d', '#322b2f', '#4b4247', '#675c61', '#877b80', '#aa9ea2'],
    mane: PAL.ember[3], ember: PAL.ember[4], belly: '#3a3236', eye: PAL.ember[4],
  },
  alpha: {
    s: 1.3, scar: true,
    fur: ['#141013', '#241b1f', '#35292e', '#4b3b41', '#645157', '#806a70'],
    mane: PAL.ember[4], ember: PAL.ember[5], belly: '#2a2024', eye: PAL.ember[5],
  },
};
const MOUTH = '#2a0808', NOSE = '#0a0608', TOOTH = PAL.bone[3], TONGUE = '#8a2a2a';
const LX = -0.55, LY = -0.68, LZ = 0.48; // Lichtrichtung (oben links, leicht nach vorn)
const KC_FINE = 0.78;                     // fein: härterer Hell-Dunkel-Abfall (Flanke, Bauch, Beininnenseiten)

// Schattierte Ellipse: harte Lichtstufen aus einer Rampe (dunkel → hell).
function vol(p, cx, cy, rx, ry, ramp, bias = 0) {
  // Rahmen = Halbachsen: jede Feinpixelmitte innerhalb der Ellipse liegt darin
  const kc = p.fine ? KC_FINE : 0.6;
  p.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) return null;
    const t = 0.32 + kc * (u * LX + v * LY + Math.sqrt(1 - d) * LZ) + bias;
    return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];
  });
}
// Schattierte Kapsel (Glieder, Hals, Schwanz): Radius r0 → r1.
function capsule(p, x0, y0, x1, y1, r0, r1, ramp, bias = 0) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.001;
  const R = Math.max(r0, r1), kc = p.fine ? KC_FINE : 0.6;
  p.each(Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R, (px, py) => {
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
    const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), r = r0 + (r1 - r0) * t, d = Math.hypot(ex, ey);
    if (d > r) return null;
    const nx = ex / r, ny = ey / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const k = 0.32 + kc * (nx * LX + ny * LY + nz * LZ) + bias;
    return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(k * ramp.length)))];
  });
}
// Gefülltes Polygon (Scanline, ohne Kantenglättung).
function poly(p, pts, c) {
  let y0 = Infinity, y1 = -Infinity;
  for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const q = p.step ?? 1;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y += q) {
    const yc = y + q / 2, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.round(xs[k] / q) * q, b = Math.round(xs[k + 1] / q) * q;
      if (b > a) p.rect(a, y, b - a, q, c);
    }
  }
}

// ---------------------------------------------------------------- feine Details (nur p.fine)
// Glutriss als organische Linie (Punkte in Weltkoordinaten, ohne Kreuzung): farbiger Saum 1 Weltpixel breit,
// darin ein heller Kern von 1 Feinpixel, an der breitesten Stelle der hellste Punkt.
function crack(p, pts, saum, core, hot) {
  // Saum: 1 Feinpixel rechts neben dem Kern (zusammen 1 Weltpixel breit), an den Enden nur Saum (läuft dunkel aus)
  for (let i = 0; i + 1 < pts.length; i++) p.fline(pts[i][0] + 0.5, pts[i][1], pts[i + 1][0] + 0.5, pts[i + 1][1], saum);
  for (let i = 0; i + 1 < pts.length; i++) p.fline(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i === 0 || i === pts.length - 2 ? saum : core);
  const a = pts[0], z = pts[pts.length - 1], m = pts[pts.length >> 1];
  p.dot(a[0], a[1], PAL.ember[1]); p.dot(z[0] + 0.5, z[1], PAL.ember[1]);
  p.dot(m[0], m[1], hot);
}
// Fellsträhnen in Gruppen: je Büschel einige lange, gleich gerichtete Striche nach hinten unten (Licht oben links:
// helle Oberkante, ein Feinpixel darunter die dunkle Kerbe). tufts = [x, y, Anzahl, Länge] in lokalen Koordinaten,
// rel(y) 0..1 = Höhe am Körper (oben hell). inside(x, y) prüft beide Enden, damit keine Strähne aus der Silhouette ragt.
function strands(p, X, Y, tufts, rel, inside, F) {
  for (const [cx, cy, n, l] of tufts) {
    for (let k = 0; k < n; k++) {
      // Strähnen eines Büschels liegen parallel, je 1 Weltpixel quer versetzt, die mittleren etwas länger
      const x = cx + k * 0.45 - (k & 1) * 0.5, y = cy + k * 1.05, len = l - Math.abs(k - (n - 1) / 2) * 0.6;
      const x1 = x - len * 0.9, y1 = y + len * 0.42, xm = x - len * 0.4, ym = y + len * 0.19;
      if (!inside(x, y) || !inside(x1, y1)) continue;
      const r = rel(y), hi = r < 0.4 ? F[5] : F[4], lo = r < 0.7 ? F[2] : F[1];
      p.fline(X(x), Y(y) + 0.5, X(x1), Y(y1) + 0.5, lo);
      p.fline(X(x), Y(y), X(xm), Y(ym), hi);
    }
  }
}

function drawWolf(p, v, o = {}) {
  const { t = 0, amp = 1, crouch = 0, leap = 0, headUp = 0, jaw = 0, hurt = false, lying = 0, bob = 0 } = o;
  const s = v.s, F = v.fur;
  const W = p.w, gy = p.h - 4; // Bodenlinie
  const ox = Math.round(W / 2 - 20 * s);
  const X = (x) => ox + x * s, Y = (y) => gy - (26 - y) * s;
  const by = 15 + crouch + bob + lying * 5;
  // Fein: Rampen um die dunkelste Stufe verlängert, damit Bauch, Beininnenseiten und Halsunterseite kräftig abfallen
  const BODY = p.fine ? [F[0], F[1], F[2], F[3], F[4]] : [F[1], F[2], F[3], F[4]];
  const NEAR = p.fine ? [F[0], F[1], F[2], F[3], F[4], F[5]] : [F[1], F[2], F[3], F[4], F[5]];
  const FAR = p.fine ? [F[0], F[0], F[1], F[1], F[2]] : [F[0], F[1], F[2], F[2]];

  if (lying > 0) {
    // Liegend auf der Seite: Beine steif weggestreckt, Kopf am Boden, Auge zu
    for (const [lx, k] of [[13, 0], [16, 1], [26, 0], [29, 1]]) {
      capsule(p, X(lx), Y(22), X(lx + 4 + k), Y(26 - lying * (1 - k * 0.3)), 1.3 * s, 0.9 * s, k ? FAR : NEAR);
    }
    vol(p, X(20), Y(21.5), 11 * s, 3.6 * s, BODY);
    vol(p, X(14), Y(21.5), 5 * s, 3 * s, BODY, -0.05);
    capsule(p, X(9), Y(22), X(3), Y(24.5), 2.2 * s, 1.4 * s, BODY);
    p.px(X(2.5), Y(24.5), F[5]);
    // Halskrause und Kopf
    for (let i = 0; i < 4; i++) p.line(X(27 + i), Y(19), X(26 + i), Y(17.5), i % 2 ? F[3] : F[4]);
    vol(p, X(32), Y(22), 4 * s, 2.8 * s, NEAR);
    poly(p, [[X(34), Y(20.5)], [X(39), Y(22)], [X(39), Y(23.5)], [X(34), Y(24)]], F[3]);
    p.line(X(34), Y(21), X(38.5), Y(22), F[4]);
    p.px(X(39), Y(22.5), NOSE);
    p.line(X(32), Y(21), X(33.5), Y(21), F[0]); // geschlossenes Auge
    if (lying > 0.7) { p.px(X(37), Y(24), TONGUE); p.px(X(37), Y(24) + 1, TONGUE); }
    p.px(X(30), Y(18.5), F[4]); p.line(X(30), Y(19), X(29), Y(16.8), F[3]); // Ohr
    // erkaltende Glut im Fell
    p.px(X(18), Y(19), lying > 0.9 ? F[1] : v.mane); p.px(X(23), Y(19), PAL.ember[1]);
    if (p.fine) {
      // Handfein: Fellsträhnen auf der Flanke, Lid mit Wimpernkante, Nasenglanz, Glut erlischt zu dunklem Kern
      const inBody = (x, y) => ((x - 20) / 11) ** 2 + ((y - 21.5) / 3.6) ** 2 < 0.7;
      strands(p, X, Y, [[13, 19.2, 3, 2.6], [20, 19, 4, 2.8], [26, 19.4, 3, 2.4]], (y) => (y - 18) / 7, inBody, F);
      p.fline(X(32), Y(21.2), X(33.5), Y(21.2), F[0]); p.dot(X(31.5), Y(20.6), F[5]);
      p.dot(X(39), Y(22), '#5a4a52');
      crack(p, [[X(16.2), Y(18.6)], [X(17), Y(18.9)], [X(18), Y(19)], [X(18.8), Y(19.4)], [X(19.6), Y(19.5)]], PAL.ember[1], lying > 0.9 ? PAL.ember[2] : PAL.ember[3], lying > 0.9 ? PAL.ember[2] : PAL.ember[4]);
    }
    return;
  }

  const leg = (x0, phase, back, front) => {
    const sw = Math.sin(t * TAU + phase) * 3 * amp + (front ? leap * 4 : -leap * 4);
    const lift = Math.max(0, Math.cos(t * TAU + phase)) * 2 * amp;
    const hipY = by + 2;
    const ramp = back ? FAR : NEAR;
    const fx = x0 + sw + (front ? 0.5 : -0.5), fy = 26 - lift - (leap > 0 ? 2 : 0);
    if (front) {
      // Vorderlauf: Schulter → Ellbogen → gerader Unterarm
      const ex = x0 + sw * 0.35 + 0.5, ey = hipY + 4.5 - lift * 0.3;
      capsule(p, X(x0), Y(hipY), X(ex), Y(ey), 2.2 * s, 1.4 * s, ramp);
      capsule(p, X(ex), Y(ey), X(fx), Y(fy - 0.8), 1.1 * s, 0.9 * s, ramp);
    } else {
      // Hinterlauf: Keule → Sprunggelenk (nach hinten) → Mittelfuß
      const kx = x0 + sw * 0.4 + 1.5, ky = hipY + 3.5;
      const hx = x0 + sw * 0.6 - 1.5, hy = 23 - lift * 0.6;
      capsule(p, X(x0), Y(hipY - 0.5), X(kx), Y(ky), 3 * s, 1.6 * s, ramp);
      capsule(p, X(kx), Y(ky), X(hx), Y(hy), 1.3 * s, 0.9 * s, ramp);
      capsule(p, X(hx), Y(hy), X(fx), Y(fy - 0.8), 0.9 * s, 0.9 * s, ramp);
    }
    // Pfote mit hellem Zehenrand
    p.rect(X(fx) - 1, Y(fy) - 1, Math.round(2.5 * s), 1, back ? F[0] : F[2]);
    if (p.fine) {
      // fein: Zehenballen hell/dunkel im Wechsel, dunkle Krallen vorn
      const x0 = p.snap(X(fx) - 1), y0 = p.snap(Y(fy) - 1), n = Math.round(2.5 * s) * 2;
      for (let k = 0; k < n; k++) p.dot(x0 + k * 0.5, y0, k % 2 ? (back ? F[0] : F[2]) : (back ? F[1] : F[4]));
      p.dot(x0 + n * 0.5, y0 + 0.5, NOSE); p.dot(x0 + n * 0.5 - 1, y0 + 0.5, NOSE);
    } else p.px(X(fx) + Math.round(1.5 * s), Y(fy) - 1, back ? F[1] : F[3]);
  };
  // hintere Beine (weiter hinten im Bild)
  leg(12, Math.PI, true, false);
  leg(26, 0, true, true);

  // Buschiger Schwanz: Kapselkette, Spitze hell, Strähnen
  const tw = Math.sin(t * TAU * (amp > 0.5 ? 1 : 0.5)) * 1.5;
  const tail = [[10, by - 1.5]];
  for (let i = 1; i <= 4; i++) tail.push([10 - i * 2, by - 1.5 + i * 1.6 + tw * (i / 4) - (headUp > 1.5 ? i * 0.6 : 0)]);
  for (let i = 0; i < 4; i++) capsule(p, X(tail[i][0]), Y(tail[i][1]), X(tail[i + 1][0]), Y(tail[i + 1][1]), (2.4 - i * 0.25) * s, (2.2 - i * 0.3) * s, BODY);
  const te = tail[4];
  if (p.fine) {
    // Handfein: Schwanz in Strähnen – oben hell, unten dunkel, Spitze fächert hell aus
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = tail[i], [x1, y1] = tail[i + 1];
      for (let k = 0; k < 3; k++) {
        const x = x0 + (x1 - x0) * (k / 3), y = y0 + (y1 - y0) * (k / 3), r = 2 - i * 0.3;
        p.fline(X(x + 0.3), Y(y - r * 0.6), X(x - 1.1), Y(y - r * 0.2), k % 2 ? F[4] : F[3]);
        p.fline(X(x + 0.3), Y(y + r * 0.5), X(x - 1), Y(y + r * 0.85), F[1]);
      }
    }
    for (const [dx, dy, c] of [[-1.6, -0.2, F[5]], [-1.4, 0.9, F[4]], [-0.6, 1.8, F[5]], [-1.8, 0.4, F[3]]]) {
      p.fline(X(te[0] + 0.5), Y(te[1] + 0.3), X(te[0] + dx), Y(te[1] + dy), c);
    }
  } else {
    p.px(X(te[0]) - 1, Y(te[1]) + 1, F[5]); p.px(X(te[0]), Y(te[1]) + 2, F[4]);
    for (let i = 1; i < 4; i++) p.px(X(tail[i][0]) + 1, Y(tail[i][1]) + Math.round(1.6 * s), F[1]);
  }

  // Rumpf: Keule, schmale Taille, hoher Widerrist, tiefe Brust
  vol(p, X(13), Y(by), 5.5 * s, 4.2 * s, BODY);
  vol(p, X(19), Y(by + 0.3), 6 * s, 3.4 * s, BODY);
  vol(p, X(25 + leap), Y(by - 0.6), 5.2 * s, 5.4 * s, BODY, 0.04);
  if (p.fine) {
    // Handfein: Fell in Strähnen, Rippen als Furchen mit Lichtkante, Bauchfell hängt in Zotteln, Glutrisse mit Kern
    p.fline(X(15), Y(by + 3.4), X(21), Y(by + 2.8), v.belly);
    for (const x of [16, 18, 20]) p.fline(X(x), Y(by + 3.2), X(x - 1), Y(by + 4.1), F[1]);
    for (const x of [20, 22]) { p.fline(X(x), Y(by + 0.4), X(x + 1), Y(by + 2.6), F[1]); p.fline(X(x - 0.5), Y(by + 0.5), X(x + 0.5), Y(by + 2.6), F[3]); }
    for (let x = 9.5; x <= 24.5; x += 1.5) {
      const hump = x > 20 ? 0.8 : 0;
      p.fline(X(x + 1), Y(by - 3.4 - hump), X(x - 0.5), Y(by - 2.7 - hump), (x * 2) % 3 ? F[5] : F[4]);
    }
  } else {
  // Bauchlinie (hochgezogen, hager) und Rippenschatten
  p.line(X(15), Y(by + 3.4), X(21), Y(by + 2.8), v.belly);
  p.line(X(20), Y(by + 0.5), X(21), Y(by + 2.5), F[1]); p.line(X(22), Y(by + 0.2), X(23), Y(by + 2.6), F[1]);
  // Fellsträhnen: wenige längere Striche, nach hinten unten gekämmt
  for (const [x, y, l] of [[11, -1.5, 3], [14, -0.5, 3], [12, 1.5, 2], [24, 1, 3], [27, 0, 3], [26, 2.5, 2]]) {
    p.line(X(x), Y(by + y), X(x - l * 0.6), Y(by + y + l * 0.6), F[1]);
    p.px(X(x) + 1, Y(by + y), F[4]);
  }
  // helle Strähnen an der Rückenlinie
  for (let x = 10; x <= 24; x += 3) p.line(X(x + 1), Y(by - 3.6 - (x > 20 ? 0.8 : 0)), X(x - 0.5), Y(by - 3 - (x > 20 ? 0.8 : 0)), F[5]);
  // Glut glimmt in Rissen im Fell (Schulter und Flanke)
  p.line(X(16), Y(by - 2.5), X(18), Y(by - 1.5), PAL.ember[2]); p.px(X(17), Y(by - 2), v.mane);
  p.line(X(23), Y(by - 3.5), X(24.5), Y(by - 2), PAL.ember[2]); p.px(X(23.5), Y(by - 3), v.ember);
  }

  // vordere Beine
  leg(14, 0, false, false);
  leg(27, Math.PI, false, true);
  if (p.fine) {
    // Fellsträhnen über Rumpf und Keule (nach den vorderen Beinen, damit die Keule mitbehaart ist)
    const e = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    const inBody = (x, y) => Math.min(e(x, y, 13, by, 5.5, 4.2), e(x, y, 19, by + 0.3, 6, 3.4), e(x, y, 25 + leap, by - 0.6, 5.2, 5.4)) < 0.74;
    const tufts = [[11.5, by - 3.2, 3, 3.6], [14.5, by - 0.4, 2, 3.2], [21, by - 2.8, 3, 3.6], [26.5, by - 3.2, 3, 3.4], [27, by + 0.4, 2, 3]];
    strands(p, X, Y, tufts, (y) => (y - (by - 5)) / 9.5, inBody, F);
    // Glutrisse über dem Fell: geschwungene Linien ohne Kreuzung
    crack(p, [[X(15.4), Y(by - 3)], [X(16.2), Y(by - 2.5)], [X(16.8), Y(by - 1.7)], [X(17.8), Y(by - 1.2)], [X(18.3), Y(by - 0.3)], [X(18.2), Y(by + 0.6)]], PAL.ember[2], PAL.ember[4], PAL.ember[5]);
    crack(p, [[X(22.6), Y(by - 4.1)], [X(23.2), Y(by - 3.2)], [X(24), Y(by - 2.7)], [X(24.4), Y(by - 1.7)], [X(25.2), Y(by - 1)]], PAL.ember[2], PAL.ember[4], PAL.ember[5]);
  }

  // Halskrause: gezackte Strähnen um den Hals
  const hx = 31 + leap * 1.5, hy = by - 4 - headUp * 3 + crouch * 0.6;
  capsule(p, X(27 + leap), Y(by - 1), X(hx - 1), Y(hy + 1), 3.6 * s, 2.6 * s, BODY, 0.05);
  if (p.fine) {
    // Halsunterseite: Schlagschatten unter Kopf und Kehle (zwei harte dunkle Stufen)
    const nx0 = 27 + leap, ny0 = by - 1, ddx = hx - 1 - nx0, ddy = hy + 1 - ny0, dl = Math.hypot(ddx, ddy) || 1;
    let qx = -ddy / dl, qy = ddx / dl; if (qy < 0) { qx = -qx; qy = -qy; }
    p.fline(X(nx0 + qx * 2.9), Y(ny0 + qy * 2.9), X(hx - 1 + qx * 2), Y(hy + 1 + qy * 2), F[0], 1);
    p.fline(X(nx0 + qx * 2.2), Y(ny0 + qy * 2.2), X(hx - 1 + qx * 1.4), Y(hy + 1 + qy * 1.4), F[1]);
    // Handfein: dichte Krause aus doppelt so vielen, dünnen Strähnen, Spitzen mit Glut
    const bx = (27 + leap + hx) / 2 - 0.5, byy = (by - 1 + hy) / 2 + 1;
    for (let i = 0; i < 12; i++) {
      const a = 1.85 + i * 0.16, r = 4.2 * (i % 2 ? 0.55 : 0.68);
      const x0 = bx + Math.cos(a) * r, y0 = byy + Math.sin(a) * r;
      p.fline(X(x0), Y(y0), X(x0 - 1.3), Y(y0 + 1.7), i % 3 === 0 ? F[4] : i % 3 === 1 ? F[3] : F[2]);
      p.dot(X(x0 - 1.3), Y(y0 + 1.7), i === 5 || i === 9 ? v.mane : i % 2 ? F[1] : F[2]);
    }
    p.fline(X(bx - 1.5), Y(byy - 2.4), X(bx - 2.6), Y(byy - 1), F[5]);
  } else for (let i = 0; i < 6; i++) {
    const a = 1.9 + i * 0.32, r = 4.2;
    const bx = (27 + leap + hx) / 2 - 0.5, byy = (by - 1 + hy) / 2 + 1;
    const x0 = bx + Math.cos(a) * r * 0.6, y0 = byy + Math.sin(a) * r * 0.6;
    p.line(X(x0), Y(y0), X(x0 - 1.2), Y(y0 + 1.6), i % 2 ? F[3] : F[2]);
    p.px(X(x0 - 1.2), Y(y0 + 1.6), i === 2 || i === 4 ? v.mane : F[1]);
  }

  // Kopf: Schädel, keilförmige Schnauze, Unterkiefer
  const up = headUp * 0.55;
  vol(p, X(hx), Y(hy), 3.6 * s, 3 * s, NEAR);
  const sx = hx + 2, sy = hy + 0.5 - up * 2.2; // Schnauzenansatz
  const tipX = sx + 4.5, tipY = sy - 0.2 - up * 0.8;
  poly(p, [[X(sx - 1), Y(sy - 2.2)], [X(tipX), Y(tipY - 1)], [X(tipX + 0.5), Y(tipY + 0.6)], [X(sx - 1), Y(sy + 1.2)]], F[3]);
  if (p.fine) {
    // Handfein: Nasenrücken als Lichtlinie (1 Feinpixel) mit Halbton darunter, Lefze dunkel mit Mundwinkel,
    // Nasenspiegel mit Nüster und Glanzpunkt, Schnurrhaar-Punkte
    p.fline(X(sx - 0.5), Y(sy - 2.1), X(tipX - 0.5), Y(tipY - 1.1), F[5]);
    p.fline(X(sx), Y(sy - 1.4), X(tipX - 0.8), Y(tipY - 0.5), F[4]);
    p.fline(X(sx), Y(sy + 0.8), X(tipX - 0.5), Y(tipY + 0.4), F[2]);
    p.fline(X(sx + 0.5), Y(sy + 1.1), X(tipX - 1), Y(tipY + 0.7), MOUTH);
    p.dot(X(sx), Y(sy + 1.2), MOUTH); p.dot(X(sx) - 0.5, Y(sy + 1.2), F[1]);   // Mundwinkel
    const nx = p.snap(X(tipX) + 1), ny = p.snap(Y(tipY - 1));
    p.rect(nx - 0.5, ny, 1.5, 1.5, NOSE); p.dot(nx, ny, '#6a5a62'); p.dot(nx + 0.5, ny + 1, '#2a1c22');
    p.dot(X(tipX), Y(tipY - 1) - 1, F[4]);
    for (const k of [1.5, 2.5]) p.dot(X(sx + k), Y(sy + 0.1 - k * 0.05), F[1]);
  } else {
    p.line(X(sx - 0.5), Y(sy - 2), X(tipX - 0.5), Y(tipY - 1), F[5]);          // Nasenrücken (Licht)
    p.line(X(sx), Y(sy + 0.8), X(tipX - 0.5), Y(tipY + 0.4), F[2]);            // Lefzenschatten
    p.px(X(tipX) + 1, Y(tipY - 1), NOSE); p.px(X(tipX) + 1, Y(tipY), NOSE);   // Nasenspiegel
    p.px(X(tipX), Y(tipY - 1) - 1, F[4]);
  }
  // Maul: Unterkiefer klappt als Keil auf, Fänge oben und unten
  const jo = jaw * 1.3;
  const j0x = sx - 0.8, j0y = sy + 1.2, jtx = tipX - 0.6, jty = tipY + 0.8 + jo;
  if (jaw > 0) {
    poly(p, [[X(j0x), Y(j0y)], [X(tipX), Y(tipY + 0.4)], [X(jtx), Y(jty)]], MOUTH);
    if (p.fine) {
      // Handfein: Zunge mit Mittelfurche, Zähne einzeln – Fänge mit Lichtkante, kleine Schneidezähne dazwischen
      p.fline(X(j0x + 1), Y(j0y + jo * 0.4), X(jtx - 1.5), Y(jty - 0.6), TONGUE, 1);
      p.fline(X(j0x + 1.5), Y(j0y + jo * 0.4 - 0.2), X(jtx - 2), Y(jty - 0.9), '#b04848');
      const ux = p.snap(X(tipX) - 1), uy = p.snap(Y(tipY + 0.6));
      p.dot(ux, uy, PAL.bone[4]); p.dot(ux + 0.5, uy, TOOTH); p.dot(ux, uy + 0.5, TOOTH); p.dot(ux + 0.5, uy + 0.5, PAL.bone[2]);
      p.dot(ux, uy + 1, TOOTH); p.dot(ux, uy + 1.5, PAL.bone[2]);                  // oberer Fang
      const lx = p.snap(X(jtx) - 1), ly = p.snap(Y(jty) - 1);
      p.dot(lx, ly + 0.5, TOOTH); p.dot(lx, ly, PAL.bone[4]); p.dot(lx + 0.5, ly + 0.5, PAL.bone[2]);   // unterer Fang
      for (let k = 1; k <= 3; k++) p.dot(ux - k * 0.5 - 0.5, uy + (k & 1) * 0, k & 1 ? TOOTH : PAL.bone[2]);
      if (jaw > 1.5) { const bx = p.snap(X(sx + 1.5)), byy = p.snap(Y(sy + 1)); p.dot(bx, byy, PAL.bone[4]); p.dot(bx, byy + 0.5, TOOTH); p.dot(bx + 0.5, byy, PAL.bone[2]); }
    } else {
      p.line(X(j0x + 1), Y(j0y + jo * 0.4), X(jtx - 1.5), Y(jty - 0.6), TONGUE);
      p.px(X(tipX) - 1, Y(tipY + 0.6), TOOTH); p.px(X(tipX) - 1, Y(tipY + 0.6) + 1, PAL.bone[4]); // oberer Fang
      p.px(X(jtx) - 1, Y(jty) - 1, TOOTH);                                                        // unterer Fang
      if (jaw > 1.5) p.px(X(sx + 1.5), Y(sy + 1), TOOTH);
    }
  }
  p.line(X(j0x), Y(j0y + 0.6), X(jtx), Y(jty), F[2]);           // Unterkiefer
  p.line(X(j0x), Y(j0y + 1.4), X(jtx - 1), Y(jty + 0.6), F[1]);
  // Backenbart: helle Strähnen nach hinten
  if (p.fine) {
    for (const [dx, dy, c] of [[0, 0, F[4]], [-0.6, 0.8, F[5]], [0.4, 1, F[3]], [-1, 1.6, F[2]]]) p.fline(X(hx - 1 + dx), Y(hy + 2 + dy), X(hx - 3.2 + dx), Y(hy + 3.4 + dy), c);
  } else { p.line(X(hx - 1), Y(hy + 2), X(hx - 3), Y(hy + 3.5), F[4]); p.px(X(hx - 3.5), Y(hy + 4), F[3]); }
  // Ohren: zwei spitze Dreiecke, inneres Ohr dunkel
  const ea = headUp * 0.3;
  poly(p, [[X(hx - 3), Y(hy - 1.5)], [X(hx - 3.6 - ea), Y(hy - 7)], [X(hx - 0.8), Y(hy - 2.4)]], F[2]);
  poly(p, [[X(hx - 1.6), Y(hy - 1.8)], [X(hx - 1.2 - ea), Y(hy - 7.4)], [X(hx + 1.4), Y(hy - 2.4)]], F[4]);
  // Brauenwulst + Glutauge (2 px, heller Kern vorn)
  const ex = X(hx + 1), ey = Y(hy - 0.5);
  if (p.fine) {
    // Handfein: Ohrmuschel dunkel, Ohrkante im Licht; Brauenkante, Glutauge (2 Weltpixel wie grob) mit heißem Kern
    // und Glanzpunkt, dunkler Augenwinkel
    p.fline(X(hx - 0.6), Y(hy - 2.7), X(hx - 1 - ea), Y(hy - 5.6), F[0], 0.8);
    p.fline(X(hx - 1.7), Y(hy - 2.6), X(hx - 1.3 - ea), Y(hy - 6.8), F[5]);
    p.dot(X(hx - 1.2 - ea), Y(hy - 7.2), F[5]);
    const ox2 = Math.round(ex), oy2 = Math.round(ey);
    p.fline(ox2 - 1, oy2 - 1, ox2 + 1.5 * s, oy2 - 1, F[1], 0.5);
    p.fline(ox2 - 1, oy2 - 1.5, ox2 + 1.5 * s - 0.5, oy2 - 1.5, F[4]);          // Brauenkante im Licht
    p.dot(ox2 - 1, oy2, F[0]); p.dot(ox2 - 0.5, oy2 + 0.5, F[0]);
    if (hurt) p.rect(ox2, oy2, 2, 1, '#ffffff');
    else {
      // leuchtet wie vorher: heller Kern vorn links, nach hinten in Glut auslaufend, Glanzpunkt oben
      const E = PAL.ember;
      [['#fffbe8', E[5], E[4], E[3]], [v.eye, E[5], E[4], E[2]]].forEach((row, j) => row.forEach((c, i) => p.dot(ox2 + i * 0.5, oy2 + j * 0.5, c)));
    }
    if (v.scar) {
      // Narbe quer übers Auge: wulstig, helle Kante oben
      p.fline(ox2 - 0.5, oy2 - 2.5, ox2 + 1.5, oy2 + 1.5, '#7a3a3a');
      p.fline(ox2 - 1, oy2 - 2.5, ox2 - 0.5, oy2 - 1.5, '#a04848'); p.dot(ox2 + 1.5, oy2 + 1, '#a04848');
      p.dot(ox2 + 0.5, oy2 - 0.5, '#5a2a2a');
    }
    return;
  }
  p.line(X(hx - 0.8), Y(hy - 2.6), X(hx - 1 - ea), Y(hy - 5.4), F[1]);
  p.line(X(hx - 1.6), Y(hy - 2.4), X(hx - 1.3 - ea), Y(hy - 6.6), F[5]);
  p.line(ex - 1, ey - 1, ex + Math.round(1.5 * s), ey - 1, F[1]);
  p.px(ex - 1, ey, F[0]);
  p.px(ex, ey, hurt ? '#ffffff' : v.eye); p.px(ex + 1, ey, hurt ? '#ffffff' : PAL.ember[3]);
  if (!hurt) p.px(ex, ey, PAL.ember[5]);
  if (v.scar) { p.px(ex, ey - 2, '#7a3a3a'); p.px(ex + 1, ey + 1, '#7a3a3a'); p.px(ex + 1, ey - 1, '#a04848'); }
}

export function createWolfSprites(kind = 'wolf') {
  const v = VARIANTS[kind];
  const W = Math.round(46 * v.s), H = Math.round(32 * v.s);
  const AX = Math.round(W / 2), AY = H - 5;
  const f = (o) => buildFrame(W, H, AX, AY, (p) => drawWolf(p, v, o), { fine: true });
  return {
    idle: new Animation([0, 1, 2, 3].map((i) => f({ t: i * 0.05, amp: 0, bob: i === 2 ? 1 : 0, jaw: i === 3 ? 0.6 : 0 })), 4),
    walk: new Animation([0, 1, 2, 3, 4, 5].map((i) => f({ t: i / 6, amp: 1, bob: i % 3 === 0 ? 1 : 0 })), 13),
    windup: new Animation([f({ crouch: 1, jaw: 1, headUp: -0.3 }), f({ crouch: 2, jaw: 2, headUp: -0.5 }), f({ crouch: 3, jaw: 2, t: 0.25, amp: 0.3, headUp: -0.6 })], 9, false),
    strike: new Animation([f({ leap: 1, jaw: 3, t: 0.25, amp: 0.4, headUp: 0.2 }), f({ leap: 0.6, jaw: 1, t: 0.4, amp: 0.4 })], 10, false),
    hurt: new Animation([f({ crouch: 1, hurt: true, headUp: -0.5, jaw: 1 })], 1, false),
    howl: new Animation([f({ headUp: 1, crouch: 1 }), f({ headUp: 2, jaw: 1 }), f({ headUp: 2.3, jaw: 2 })], 6, false),
    death: new Animation([f({ hurt: true, crouch: 2, headUp: 1, jaw: 2 }), f({ lying: 0.5 }), f({ lying: 1 })], 8, false),
  };
}
