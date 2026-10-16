import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { lift } from './ground/kit.js';
import { mk, poly, pal32, shade, stepOf, lump, fpoly, groundPatch, DecoCanvas } from './decor_ashwood.js';
import { shadeLump, dustPatch, blade, bayer } from './decor_steppe.js';
import { PixelCanvas, outlineCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame } from '../gfx/Sprite.js';
import { fineRes, canvasPixels, pixelsToCanvas } from '../gfx/Fine.js';

// Faulmarsch: fauliges Moor unter Nebel, Sporen, tote Weiden, Pfahlbauten der Moorleute,
// versunkene Ruinen und der Sporenschlund. Licht von links oben; alles Leuchtende
// zusätzlich auf der Glow-Ebene ((W+2)×(H+2), 1 px Versatz wie decor_ashwood.js).

// Bodenpalette (Format wie BIOME_GROUND in sprites/outdoor.js); water = Sumpfwasser
export const GROUND_MARSH = {
  grass: lift(['#0c120e', '#111912', '#162117', '#1c291b', '#233220', '#2c3d26'], 1.25),
  dirt: lift(['#100e0b', '#17140f', '#1f1b14', '#28221a', '#312a20', '#3c3327'], 1.25),
  water: lift(['#0a1012', '#142426', '#1d3433', '#2f4b46', '#46685a'], 1.25),
  tufts: true,
};

const MOSS = lift(['#0d140f', '#142017', '#1c2c1e', '#263a25', '#32492c', '#415a34', '#56703f'], 1.2);
const BEARD = lift(['#1a221d', '#27322a', '#374536', '#4b5a46', '#627058', '#7e8a6a'], 1.2);
const ROT = lift(['#0f0c0b', '#191412', '#231c18', '#30261f', '#3e3127', '#4f3f31', '#645140'], 1.2);
const MUD = lift(['#100e0b', '#18140f', '#211c15', '#2b241b', '#362d22'], 1.2);
const SW = lift(['#060a08', '#0b130e', '#112017', '#1a2e1f', '#284330', '#3d5e42'], 1.2);
const MST = lift(['#101312', '#171b19', '#1f2522', '#29302c', '#353d37', '#434c44', '#566055', '#6c7768'], 1.2);
const THATCH = ['#16140d', '#221e13', '#302a19', '#403820', '#51482a', '#665b35', '#7e7045'];
const REED = lift(['#141a0f', '#1f2815', '#2d381c', '#3e4a24', '#53602f', '#6c763c'], 1.2);
const CATT = ['#1e120c', '#341e12', '#4c2c1a', '#6a4024'];
const GLG = ['#0a2416', '#12563a', '#24a060', '#6ee89a', '#d4ffe0'];
const GLV = ['#1a0c28', '#44196a', '#8034b8', '#c27ef0', '#f2d8ff'];
const GLT = ['#062426', '#0c5458', '#1a9e98', '#62eadc', '#d4fff6'];
const FLESH = ['#1a0e16', '#2e1826', '#46243a', '#62344e', '#804a66', '#a06a84'];
const BONE = PAL.bone, IRON = PAL.steel, EMB = PAL.ember, GOLD = PAL.gold;
const CLOTH = ['#141a14', '#1e2a1e', '#2a3a28', '#3a4c34', '#4c6044'];
const INTERIOR = '#07090a';

const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// ------------------------------------------------------------ Helfer
// Schlammfleck mit Pfütze am Fuß
function mudPatch(p, cx, cy, rx, ry, seed, water = true) {
  dustPatch(p, cx, cy, rx, ry, seed, MUD);
  if (water) for (let y = -ry + 1; y <= ry - 1; y++) for (let x = -rx + 3; x <= rx - 3; x++) {
    const d = (x * x) / ((rx - 3) ** 2) + (y * y) / Math.max(1, (ry - 1) ** 2);
    if (d > 1 || hash2(cx + x, cy + y, seed + 1) < 0.35) continue;
    p.px(cx + x + 2, cy + y, (x + y) % 5 === 0 ? SW[3] : SW[1]);
  }
}

// Hängender Moosbart: Strähne von (x,y) nach unten, pendelt leicht
function beard(p, x, y, len, seed) {
  for (let k = 0; k < len; k++) {
    const t = k / len, xx = Math.round(x + Math.sin(k * 0.45 + seed) * 0.7 * t);
    const i = t < 0.15 ? 4 : t < 0.5 ? 3 : t < 0.8 ? 2 : 1;
    p.px(xx, y + k, BEARD[i]);
    if (t < 0.55 && hash2(x, k, seed) < 0.5) p.px(xx + 1, y + k, BEARD[i - 1]);
    if (k === len - 1 && hash2(x, y, seed) < 0.5) p.px(xx, y + k + 1, BEARD[1]);
  }
}

// Wasserring um Pfähle/Stängel
function ripple(p, x, y, r) { p.px(x - r, y, SW[4]); p.px(x + r + 1, y, SW[3]); p.px(x - r + 1, y + 1, SW[3]); p.px(x + r, y + 1, SW[2]); }

// Moospolster über einer Oberkante (Map x -> y aus shadeLump)
function mossCap(p, top, depth, seed, left = -Infinity, right = Infinity) {
  for (const [x, y] of top) {
    if (x < left || x > right) continue;
    const d = 1 + Math.round(hash2(x, 0, seed) * depth);
    for (let k = 0; k < d; k++) p.px(x, y + k, MOSS[clampI(k === 0 ? 6 - (hash2(x, y, seed) < 0.3 ? 1 : 0) : 4 - k, 7)]);
    if (hash2(x, 1, seed) < 0.18) for (let k = 0; k < 2 + Math.round(hash2(x, 2, seed) * 3); k++) p.px(x, y + d + k, MOSS[3 - Math.min(2, k)]);
  }
}

function pole(p, x, y0, y1, w, ramp, seed = 0) {
  for (let y = y0; y <= y1; y++) for (let i = 0; i < w; i++) {
    const rel = w === 1 ? 0.3 : i / (w - 1);
    let k = rel < 0.25 ? ramp.length - 2 : rel < 0.6 ? ramp.length - 3 : rel < 0.9 ? 2 : 1;
    if (hash2(x + i, y, seed) < 0.12) k--;
    p.px(x + i, y, ramp[clampI(k, ramp.length)]);
  }
}

// Leuchtpilz: Hut (Halbellipse) auf Stiel; glow = leuchtende Unterseite/Punkte
function glowShroom(p, g, x, y, r, h, G, seed) {
  // Stiel
  for (let k = 0; k < h; k++) { p.px(x, y - k, k < 2 ? '#8a8a78' : '#b8b8a0'); p.px(x + 1, y - k, '#6a6a5a'); }
  const cy = y - h;
  // Hut
  for (let yy = -Math.ceil(r * 0.7); yy <= 0; yy++) for (let xx = -r; xx <= r + 1; xx++) {
    const d = ((xx - 0.5) / (r + 0.5)) ** 2 + (yy / (r * 0.7 + 0.5)) ** 2;
    if (d > 1) continue;
    const l = -(xx - 0.5) / (r + 1) * 0.6 - yy / (r * 0.7 + 1) * 0.5;
    const i = clampI(Math.round(1.6 + l * 2 + (bayer(x + xx, cy + yy) - 0.5) * 0.8), 5);
    p.px(x + xx, cy + yy, G[i]);
  }
  // leuchtende Lamellen unten + Tupfen
  for (let xx = -r + 1; xx <= r; xx++) { p.px(x + xx, cy + 1, G[2]); g.px(x + xx, cy + 1, G[3]); }
  for (let k = 0; k < Math.max(1, r); k++) {
    const xx = Math.round((hash2(k, 0, seed) - 0.5) * r * 1.4), yy = -Math.round(hash2(k, 1, seed) * r * 0.5);
    p.px(x + xx, cy + yy, G[4]); g.px(x + xx, cy + yy, G[4]);
  }
  g.px(x - Math.round(r * 0.4), cy - Math.round(r * 0.4), G[3]);
}

// ====================================================================== Feinraster-Helfer (Stufe B)
// Koordinaten in Weltpixeln; alte Pixel-Index-Koordinate x deckt [x, x+1) ab. Licht von oben links, harte Stufen,
// kein Rauschen: Unregelmäßigkeit nur über Dreieckswellen (tri) und ganze Weltpixel-Hashes.
const fract = (v) => v - Math.floor(v);
const tri = (u) => 1 - Math.abs(2 * fract(u) - 1);
// Funktion y -> Wert je Feinzeile merken (Stammachse/-breite werden je Feinpixel abgefragt)
const memo = (fn) => { const m = new Map(); return (y) => { let v = m.get(y); if (v === undefined) m.set(y, (v = fn(y))); return v; }; };
const STEM = ['#4a4a3e', '#6a6a5a', '#8a8a78', '#b0b098', '#ccccb4'];

// Schlammfleck fein (gelappter Rand, helle Kante oben links) mit Pfütze: dunkler Spiegel, Uferschatten, Glanzstriche
function fMud(p, cx, cy, rx, ry, seed, water = true) {
  groundPatch(p, cx + 0.5, cy + 0.5, rx + 0.5, ry + 0.5, seed, [MUD[1], MUD[2], MUD[3]]);
  if (!water || rx < 5) return;
  const wx = cx + 2.5, wy = cy + 0.5, wrx = rx - 2.5, wry = Math.max(1, ry - 0.5);
  const [w0, w1, w2, w3] = pal32([SW[1], SW[2], SW[3], SW[4]]), ph = hash2(seed, 5, 9) * 4;
  p.scan(wx - wrx, wy - wry, wx + wrx, wy + wry, (x, y) => {
    const nx = (x - wx) / wrx, ny = (y - wy) / wry;
    if (nx * nx + ny * ny > 1 - 0.25 * tri(nx * 1.3 + ph)) return 0;
    if (ny < -0.4) return w0;
    if (ny > -0.15 && ny < 0.3 && tri(x * 0.2 + ph) > 0.62) return nx < -0.1 ? w3 : w2;
    return w1;
  });
}
// Wasserring um Pfahl/Stängel (vorne geschlossen, hinten offen)
function fRing(p, cx, cy, rx, ry = 0.9) {
  p.each(cx - rx - 0.5, cy - ry - 0.5, cx + rx + 0.5, cy + ry + 0.5, (x, y) => {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1.12 || d < 0.55 || (ny < -0.1 && nx > -0.45)) return null;
    return nx < -0.2 ? SW[4] : SW[3];
  });
}
// Hängender Moosbart fein: Hauptsträhne (oben 1 Weltpixel, Lichtseite links), dunklere Nebensträhne, Lichtfaser
function fBeard(p, x, y, len, seed) {
  if (len < 1) return;
  const X = x + 0.5, h = hash2(x, y, seed);
  const sw = (k, ph) => Math.sin(k * 0.45 + seed + ph) * 0.7 * (k / len);
  const ci = (t) => (t < 0.15 ? 4 : t < 0.5 ? 3 : t < 0.8 ? 2 : 1);
  const l2 = len * (0.4 + h * 0.4);
  for (let k = 0.5; k < l2; k += 0.5) p.dot(X + 0.5 + sw(k, 1.7), y + k, BEARD[Math.max(1, ci(k / len) - 1)]);
  const L = len + (h < 0.5 ? 0.5 : 0);
  for (let k = 0; k < L; k += 0.5) {
    const t = Math.min(1, k / len), xx = X + sw(k, 0);
    p.dot(xx - 0.25, y + k, BEARD[ci(t)]);
    if (t < 0.6) p.dot(xx + 0.25, y + k, BEARD[ci(t) - 1]);
  }
  if (len > 3) for (let k = 0; k < len * 0.35; k += 0.5) p.dot(X - 0.5 + sw(k, -1.1), y + k, BEARD[k < len * 0.15 ? 5 : 4]);
}
// Halm fein: unten 1 Weltpixel (Lichtkante links), oben 1 Feinpixel; Farbe von unten dunkel nach oben hell
function fBlade(p, x, y, h, bend, ramp, lo = 1, hi = ramp.length - 1) {
  const X = x + 0.5;
  for (let k = 0; k <= h + 0.5; k += 0.5) {
    const t = Math.min(1, k / Math.max(1, h)), xx = X + bend * t * t, yy = y + 0.75 - k;
    const i = clampI(Math.round(lo + (hi - lo) * t), ramp.length);
    if (t < 0.6) { p.dot(xx - 0.25, yy, ramp[clampI(i + 1, ramp.length)]); p.dot(xx + 0.25, yy, ramp[i]); } else p.dot(xx, yy, ramp[i]);
  }
  return [X + bend, y - h];
}
// Leuchtpilz fein: Stiel mit Lichtseite, Hut als Kuppel in harten Stufen, Lamellen mit heißem Kern auf der Leuchtebene
function fShroom(p, g, x, y, r, h, G, seed) {
  const X = x + 1, cy = y - h, yb = cy + 1, sw = r > 1 ? 0.9 : 0.75;
  const S = pal32(STEM), P = pal32(G);
  p.scan(X - sw, cy + 1, X + sw, y + 1, (px_, py) => {
    if (px_ < X - sw || px_ > X + sw || py > y + 1) return 0;
    const rel = (px_ - X) / sw;
    let i = rel < -0.4 ? 4 : rel < 0.1 ? 3 : rel < 0.6 ? 2 : 1;
    if (py > y + 0.5 || py < cy + 1.5) i -= 1;
    return S[i];
  });
  const rx = r + 1, ry = r * 0.7 + 0.7;
  p.scan(X - rx, yb - ry, X + rx, yb, (px_, py) => {
    const nx = (px_ - X) / rx, ny = (py - yb) / ry;
    if (ny > 0 || nx * nx + ny * ny > 1) return 0;
    let i = stepOf(shade(nx * 0.9, ny - 0.15), 1, 3);
    if (ny > -0.3) i = Math.min(i, nx < -0.3 ? 2 : 1);
    return P[i];
  });
  // Lamellen: Schattenzeile, darunter Leuchtzeile (Lamellen im Feinpixeltakt)
  for (let xx = X - r + 0.25; xx < X + r; xx += 0.5) {
    const k = Math.round((xx - X) * 2);
    p.dot(xx, yb, G[1]); p.dot(xx, yb + 0.5, k & 1 ? G[2] : G[3]);
    g.dot(xx, yb, G[2]); g.dot(xx, yb + 0.5, Math.abs(xx - X) < r * 0.5 ? G[4] : G[3]);
  }
  for (let k = 0; k < Math.max(1, r); k++) {
    const sx = x + Math.round((hash2(k, 0, seed) - 0.5) * r * 1.4) + 0.5, sy = cy - Math.round(hash2(k, 1, seed) * r * 0.5) + 0.25;
    p.dot(sx, sy, G[4]); g.dot(sx, sy, G[4]);
    if (r > 1) { p.dot(sx + 0.5, sy, G[3]); p.dot(sx, sy + 0.5, G[3]); g.dot(sx + 0.5, sy, G[3]); g.dot(sx, sy + 0.5, G[3]); }
  }
  g.dot(X - rx * 0.45, yb - ry * 0.6, G[3]);
}
// Gerundeter Fels in harten Lichtstufen, Rand leicht unregelmäßig (niedrige Frequenzen, kein Rauschen).
// Liefert nichts; Oberkante für Moos über fTop() aus dem Puffer.
function boulder(p, cx, cy, rx, ry, pal, seed, { lo = 1, hi = pal.length - 1, bias = 0, rough = 0.1, flat = 0.25, keep = null, rimC = null } = {}) {
  const P = pal32(pal), RC = rimC ? pal32([rimC])[0] : 0;
  const edge = (a) => 1 + (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 1.7) * 0.3 + Math.sin(a * 2 + seed * 0.3) * 0.2) * rough;
  p.scan(cx - rx * 1.2, cy - ry * 1.2, cx + rx * 1.2, cy + ry * 1.2, (x, y) => {
    let dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (flat && dy > 1 - flat) dy = 1 - flat + (dy - (1 - flat)) * 0.25;
    const r2 = dx * dx + dy * dy;
    if (r2 > (1 + rough) * (1 + rough)) return 0;
    const e = edge(Math.atan2(dy, dx)), d = Math.sqrt(r2) / e;
    if (d > 1 || (keep && !keep(x, y))) return 0;
    const nx = dx / e, ny = dy / e;
    if (RC && d > 0.84 && nx > 0.35 && ny > -0.2 && ny < 0.7) return RC;    // kühler Reflex unten rechts
    let i = stepOf(shade(nx, ny * 1.1) + bias, lo, hi);
    if (d > 0.8 && nx + ny > 0.55) i -= 1;
    return P[Math.max(0, i)];
  });
}
// Oberkante eines gezeichneten Bereichs: Feinspalte → erste deckende Zeile (Weltkoordinate) zwischen y0 und y1
function fTop(p, x0, x1, y0, y1) {
  const r = p.res, W = p.W, b = p.buf, out = [];
  const G0 = Math.max(0, Math.floor(y0 * r)), G1 = Math.min(p.H, Math.ceil(y1 * r));
  for (let F = Math.max(0, Math.floor(x0 * r)); F < Math.min(W, Math.ceil(x1 * r)); F++) {
    let G = G0;
    while (G < G1 && !b[G * W + F]) G++;
    if (G < G1) out.push([(F + 0.5) / r, G / r]);
  }
  return out;
}
// Moospolster über einer Oberkante (aus fTop): heller Rand, zwei Töne, Schattenzeile darunter, ab und zu eine Tropfnase
function fMossCap(p, top, depth, seed, xMax = Infinity) {
  for (const [x, yt] of top) {
    if (x > xMax) continue;
    const fade = xMax < Infinity ? Math.min(1, (xMax - x) / 3) : 1;
    const dd = Math.round((0.5 + depth * (0.3 + 0.7 * tri(x * 0.23 + seed * 0.37)) * fade) * 2) / 2;
    for (let k = 0; k < dd; k += 0.5) p.dot(x, yt + k, MOSS[k === 0 ? (x < xMax - 4 ? 6 : 5) : k < 1 ? 5 : 4]);
    p.dot(x, yt + dd, MOSS[2]);
    const wx = Math.floor(x);
    if (fade > 0.5 && hash2(wx, 7, seed) < 0.22) {
      const L = 1 + Math.floor(hash2(wx, 8, seed) * 3), left = x - wx < 0.5;
      for (let k = 0; k < L; k += 0.5) if (k < L - 0.5 || left) p.dot(x, yt + dd + k, left ? MOSS[4] : MOSS[3]);
    }
  }
}
// Rissige Borke: Platten zwischen senkrechten Längsfurchen, je Platte eigene Querbrüche und eigener Ton (harte, dunkle
// Stufen), Licht nur als schmale Kante am linken Plattenkamm. Kein durchgehender Glanzstreif: die Lichtseite besteht aus
// einzelnen helleren Platten. T = [Furche, dunkel, Grund, Lichtplatte, Kamm]. xAt/wAt stetig (Weltpixel).
function roughBark(p, y0, y1, xAt, wAt, T, { seed = 0, plate = 1.5, twist = 0, wet = null } = {}) {
  const P = pal32(T);
  let x0 = Infinity, x1 = -Infinity;
  for (let y = y0; y <= y1; y += 0.5) { const h = wAt(y) / 2 + 1; x0 = Math.min(x0, xAt(y) - h); x1 = Math.max(x1, xAt(y) + h); }
  p.scan(x0, y0, x1, y1, (x, y) => {
    const hw = wAt(y) / 2, dx = x - xAt(y);
    if (dx < -hw || dx >= hw || y > y1) return 0;
    const rel = dx / hw, n = Math.max(2, Math.round((2 * hw) / plate));
    const u = ((rel + 1) / 2) * n + twist * y, col = Math.floor(u), fu = u - col;
    const len = 3 + hash2(col, 1, seed) * 3.5, v = (y + hash2(col, 0, seed) * 6) / len, row = Math.floor(v), fv = v - row;
    const cut = 0.35 + 0.5 * hash2(col, row, seed + 3);
    if (fu < 0.18 || (fv < 0.1 && fu < cut)) return P[0];                                          // Längsfurche, Querbruch
    const pc = (((col - twist * y) + 0.5) / n) * 2 - 1, h = hash2(col, row, seed + 7);
    let i = pc < -0.4 ? 3 : pc < 0.3 ? 2 : 1;
    if (h < 0.18) i -= 1; else if (h > 0.8 && i < 3) i += 1;
    if (wet !== null && y > wet) i = Math.max(1, i - 1);
    if (i < 1) i = 1;
    if (pc < 0.15 && fu < 0.34 && fv > 0.2 && i >= 2) return P[4];                   // Kamm im Licht (1 Feinpixel)
    if (rel > 0.8) return P[1];
    return P[i];
  });
}
// Moos- und Faulflecken auf einem Stamm: gelappte Flecken (Moos: hell oben links, dunkler Rand; Fäule: schwarzer Kern)
function barkPatches(p, xAt, wAt, y0, y1, seed, n, { moss = true, rot = true } = {}) {
  for (let k = 0; k < n; k++) {
    const y = y0 + hash2(k, 0, seed) * (y1 - y0), side = -0.75 + hash2(k, 1, seed) * 1.3;
    const cx = xAt(y) + side * wAt(y) / 2, rx = 0.7 + hash2(k, 2, seed) * 0.9, ry = 1 + hash2(k, 3, seed) * 1.6, ph = hash2(k, 4, seed) * 6;
    const isMoss = moss && (!rot || hash2(k, 5, seed) < 0.6);
    p.each(cx - rx - 0.5, y - ry - 0.5, cx + rx + 0.5, y + ry + 0.5, (x, yy) => {
      const hw = wAt(yy) / 2, dx = x - xAt(yy);
      if (dx < -hw || dx >= hw) return null;
      const nx = (x - cx) / rx, ny = (yy - y) / ry, a = Math.atan2(ny, nx), d = nx * nx + ny * ny;
      if (d > 0.85 + 0.3 * Math.sin(a * 3 + ph)) return null;
      if (isMoss) return d > 0.55 ? MOSS[2] : nx + ny < -0.3 ? MOSS[5] : MOSS[4];
      return d < 0.35 ? '#0a0c0a' : '#1a1712';
    });
  }
}
// Toter Ast: verjüngt, mit Knick; oben schmale Lichtkante nur am Ansatz, unten Schatten; abgebrochen = helle Bruchfläche.
// T wie roughBark. Liefert die Spitze.
function deadLimb(p, x0, y0, s, len, rise, w0, T, { broken = false, seed = 0 } = {}) {
  const kx = 0.45 + hash2(seed, 1, 3) * 0.2, bend = (hash2(seed, 2, 3) - 0.5) * 2.5;
  const at = (t) => [x0 + s * len * t, y0 - rise * t + (t < kx ? bend * t / kx : bend * (1 - (t - kx) / (1 - kx)))];
  const steps = Math.max(4, Math.round(len * 2));
  let [lx, ly] = at(0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, [x, y] = at(t), w = w0 * (1 - t) + (broken ? 0.6 : 0.1) * t;
    if (w > 0.75) { p.fline(lx, ly, x, y, T[2], w); p.fline(lx, ly + w / 2, x, y + w / 2, T[1]); if (t < 0.5) p.fline(lx, ly - w / 2 + 0.25, x, y - w / 2 + 0.25, T[4]); }
    else p.fline(lx, ly, x, y, t < 0.7 ? T[2] : T[1]);
    lx = x; ly = y;
  }
  if (broken) { p.dot(lx, ly - 0.25, T[4]); p.dot(lx + s * 0.5, ly, T[3]); }
  return [lx, ly];
}

// ---------------------------------------------------------------- Feine Zusätze über der alten Zeichnung (mk fine)
// Laternenglas (Weltrechteck x, y, w, h): Glanzstreif links, Flamme als Tropfen (Saum, Mitte, heißer Kern),
// Leuchtebene gestuft: Glas, Flamme, Kern. C = [Glas, Glanz, Saum, Mitte, Kern], L = Leuchtfarben [Glas, Saum, Mitte, Kern]
const LAMP_C = ['#6a6420', '#8a8430', '#c8b848', '#f0e070', '#fff8c8'];
const LAMP_L = ['#a8a040', '#d8d060', '#f0e070', '#fffad0'];
function fLamp(f, g, x, y, w, h, C = LAMP_C, L = LAMP_L, lit = true) {
  f.fline(x + 0.25, y + 0.25, x + 0.25, y + h - 0.75, C[1]);
  if (!lit) return;
  const fx = x + w / 2, fy = y + h * 0.62, fr = Math.min(1, w * 0.3), fh = Math.min(h * 0.55, 2.4);
  const inF = (xx, yy) => { const dy = yy - fy; if (dy > fr * 0.9) return 9; const ww = dy < 0 ? fr * (1 + dy / fh) : fr * Math.sqrt(Math.max(0, 1 - (dy / (fr * 0.9)) ** 2)); return Math.abs(xx - fx) / Math.max(0.01, ww); };
  g.each(x, y, x + w, y + h, (xx, yy) => (xx < x || yy < y || xx > x + w || yy > y + h ? null : L[0]));
  for (const t of [f, g]) t.each(fx - 1.5, fy - fh - 0.5, fx + 1.5, fy + 1.5, (xx, yy) => {
    const d = inF(xx, yy);
    if (d > 1) return null;
    const P = t === f ? C : [null, null, L[1], L[2], L[3]];
    return d < 0.4 && yy > fy - fh * 0.4 ? P[4] : d < 0.75 ? P[3] : P[2];
  });
}
// warmes Fenster: Glut-Stufen, Kreuzsprosse, heißer Kern; Leuchtebene gestuft
function fWindow(f, g, x, y, w, h, bar = null) {
  f.each(x, y, x + w, y + h, (xx, yy) => {
    if (xx > x + w || yy > y + h) return null;
    const e = Math.min(xx - x, x + w - xx, yy - y, y + h - yy);
    return e < 0.5 ? (yy - y < 0.5 ? EMB[1] : EMB[2]) : e < 1 ? EMB[3] : EMB[4];
  });
  g.each(x, y, x + w, y + h, (xx, yy) => {
    if (xx > x + w || yy > y + h) return null;
    const e = Math.min(xx - x, x + w - xx, yy - y, y + h - yy);
    return e < 0.5 ? EMB[3] : e < 1 ? EMB[4] : '#fff0b0';
  });
  if (bar !== null) f.fline(bar + 0.25, y, bar + 0.25, y + h - 0.5, ROT[1]);
}
// Flammenzunge: Fuß (x, yb) stetig, Höhe h, Breite w: Saum, Mitte, Kern; auf Sprite und Leuchtebene
function fFlame(f, g, x, yb, h, w, lean = 0, clip = null) {
  const at = (yy) => { const t = (yb - yy) / h; return [x + lean * t * t, w * (t < 0.25 ? 0.7 + t * 1.2 : (1 - t) * 1.33)]; };
  for (const t of [f, g]) t.each(x - w - 1, yb - h - 0.5, x + w + 1, yb + 0.5, (xx, yy) => {
    if (yy > yb || yy < yb - h || (clip && clip(xx, yy))) return null;
    const [cx, hw] = at(yy), d = Math.abs(xx - cx) / Math.max(0.3, hw);
    if (d > 1) return null;
    const k = (yb - yy) / h;
    if (t === f) return d < 0.4 && k < 0.5 ? (k < 0.25 && d < 0.3 ? '#fff0b0' : EMB[4]) : d < 0.72 && k < 0.8 ? EMB[3] : EMB[2];
    return d < 0.4 && k < 0.5 ? '#fff0b0' : d < 0.75 ? EMB[4] : EMB[3];
  });
}
// Glimmende Augen/Punkte: heißer Feinpixel-Kern, farbiger Saum (Sprite und Leuchtebene)
function fEye(f, g, x, y, G) {
  f.dot(x + 0.25, y + 0.25, G[4]); f.dot(x + 0.75, y + 0.25, G[3]); f.dot(x + 0.25, y + 0.75, G[3]); f.dot(x + 0.75, y + 0.75, G[2]);
  g.dot(x + 0.25, y + 0.25, '#ffffff'); g.dot(x + 0.75, y + 0.25, G[4]); g.dot(x + 0.25, y + 0.75, G[4]); g.dot(x + 0.75, y + 0.75, G[3]);
}

// ------------------------------------------------------------ Tote Trauerweiden
function willowTree(seed, H, v) {
  const rng = createRng(seed);
  const W = 56, cx = 27, bottom = H - 1;
  return mk(W, H, (p) => {
    mudPatch(p, cx, bottom - 1, 14, 3, seed);
    const lean = [-3, 4, 1][v];
    const crownY = Math.round(H * 0.3);
    const tx = (y) => cx + Math.round(lean * (1 - (y - crownY) / (bottom - crownY)) ** 1.5 + Math.sin(y * 0.25 + seed) * 0.8);
    const tw = (y) => { const k = (y - crownY) / (bottom - crownY); return 3 + k * 4 + (y > bottom - 4 ? (y - (bottom - 4)) * 1.6 : 0); };
    // Äste: steigen auf, hängen dann bogenförmig herab
    const branches = [];
    const nB = 7;
    for (let i = 0; i < nB; i++) {
      const s = i % 2 ? 1 : -1, y0 = crownY + rng.int(-2, 8);
      const len = rng.int(13, 21), rise = rng.int(4, 9);
      branches.push({ s, y0, len, rise });
    }
    if (p.fine) { willowFine(p, seed, H, v, branches, crownY, lean); return; }
    const pts = [];
    for (const b of branches) {
      const x0 = tx(b.y0);
      let lx = x0, ly = b.y0;
      for (let t = 0.05; t <= 1.001; t += 0.05) {
        const x = Math.round(x0 + b.s * b.len * t), y = Math.round(b.y0 - b.rise * Math.sin(t * Math.PI * 0.75) + t * t * 7);
        p.line(lx, ly, x, y, t < 0.4 ? ROT[3] : ROT[2]);
        if (t < 0.5) p.line(lx, ly + 1, x, y + 1, ROT[1]);
        if (b.s < 0 || t < 0.3) p.px(x, y - 1, ROT[4]);
        if (t > 0.25) pts.push([x, y + 1, t]);
        lx = x; ly = y;
      }
      // Zweiggabel
      const fx = Math.round(x0 + b.s * b.len * 0.55), fy = Math.round(b.y0 - b.rise * Math.sin(0.55 * Math.PI * 0.9));
      p.line(fx, fy, fx + b.s * 4, fy - 4, ROT[3]); p.line(fx + b.s * 4, fy - 4, fx + b.s * 7, fy - 2, ROT[2]);
      pts.push([fx + b.s * 6, fy - 2, 0.9]);
    }
    // Stamm, verdreht, mit Astloch
    for (let y = crownY - 3; y <= bottom; y++) {
      const hw = tw(y), c = tx(y);
      const xl = Math.round(c - hw / 2), xr = Math.round(c + hw / 2);
      for (let x = xl; x <= xr; x++) {
        const rel = xr === xl ? 0 : (x - xl) / (xr - xl);
        let i = rel < 0.2 ? 5 : rel < 0.5 ? 4 : rel < 0.8 ? 3 : 2;
        // Drehwuchs: schräge Furchen
        if ((x * 2 + y) % 6 === 0 && rel > 0.15) i -= 2;
        const h = hash2(x, y, seed + 3);
        if (h < 0.1) i -= 1;
        p.px(x, y, ROT[clampI(i, 7)]);
      }
      // Moos an der Nordseite (links) unten
      if (y > bottom - 14 && hash2(0, y, seed) < 0.6) { p.px(xl, y, MOSS[4]); if (y > bottom - 7) p.px(xl + 1, y, MOSS[3]); }
    }
    // Spaltung oben
    const tc = tx(crownY - 3);
    p.px(tc - 1, crownY - 4, ROT[4]); p.px(tc + 2, crownY - 5, ROT[3]); p.px(tc + 2, crownY - 4, ROT[2]); p.px(tc, crownY - 3, ROT[1]);
    // Astloch
    const hy = crownY + Math.round((bottom - crownY) * 0.45), hx = tx(hy);
    p.ellipse(hx, hy, 1.4, 2, INTERIOR); p.px(hx - 1, hy - 2, ROT[5]); p.px(hx + 1, hy + 2, ROT[2]);
    // Wurzeln ins Wasser
    p.line(tx(bottom) - 3, bottom - 2, tx(bottom) - 9, bottom, ROT[4]); p.line(tx(bottom) - 4, bottom - 1, tx(bottom) - 8, bottom, ROT[2]);
    p.line(tx(bottom) + 3, bottom - 2, tx(bottom) + 8, bottom, ROT[2]); p.line(tx(bottom) + 2, bottom - 1, tx(bottom) + 5, bottom + 0, ROT[1]);
    ripple(p, tx(bottom) - 9, bottom, 1);
    // Moosbärte an den Ästen
    for (let i = 0; i < pts.length; i++) {
      const [x, y, t] = pts[i];
      if (hash2(x, y, seed + 9) > 0.3 || i % 2) continue;
      const len = Math.round(3 + t * 9 + hash2(x, y, seed + 10) * 9);
      beard(p, x, y, Math.min(len, bottom - y - 3), seed + i);
    }
  }, { ax: cx, box: [-4, -3, 4, 1], b: true });
}

// Stufe B: Äste als sich verjüngende Bögen (Lichtgrat oben, Schatten unten), Stamm mit Drehwuchs-Furchen und
// Moos an der Nordseite, Astloch mit Lichtlippe, Moosbärte in Strähnen, Wurzeln ins Wasser mit Ringen.
function willowFine(p, seed, H, v, branches, crownY, lean) {
  const cx = 27, bottom = H - 1;
  fMud(p, cx, bottom - 1, 14, 3, seed);
  const tx = memo((y) => cx + 0.5 + lean * Math.max(0, 1 - (y - crownY) / (bottom - crownY)) ** 1.5 + Math.sin(y * 0.25 + seed) * 0.8);
  const tw = (y) => { const k = (y - crownY) / (bottom - crownY); return 3.5 + k * 4.5 + (y > bottom - 4 ? (y - (bottom - 4)) * 1.6 : 0); };
  const pts = [];
  for (const b of branches) {
    const x0 = tx(b.y0 + 0.5), y0 = b.y0 + 0.5;
    const at = (t) => [x0 + b.s * b.len * t, y0 - b.rise * Math.sin(t * Math.PI * 0.75) + t * t * 7];
    let [lx, ly] = at(0);
    for (let t = 0.04; t <= 1.001; t += 0.04) {
      const [x, y] = at(t);
      if (t < 0.45) {
        p.fline(lx, ly, x, y, ROT[3], 1);
        if (t < 0.22) p.fline(lx, ly + 1, x, y + 1, ROT[1]);
        else p.fline(lx, ly + 0.5, x, y + 0.5, ROT[1]);
        p.fline(lx, ly, x, y, b.s < 0 || t < 0.3 ? ROT[5] : ROT[4]);
      } else {
        p.fline(lx, ly, x, y, t < 0.75 ? ROT[3] : ROT[2]);
        if (t < 0.7) p.fline(lx, ly + 0.5, x, y + 0.5, ROT[1]);
        if (b.s < 0 && t < 0.7) p.dot(x, y - 0.5, ROT[4]);
      }
      if (t > 0.25 && Math.abs(t * 20 - Math.round(t * 20)) < 0.4) pts.push([Math.round(x - 0.5), Math.round(y + 0.5), t]);
      lx = x; ly = y;
    }
    // Zweiggabel
    const fx = x0 + b.s * b.len * 0.55, fy = y0 - b.rise * Math.sin(0.55 * Math.PI * 0.9);
    p.fline(fx, fy, fx + b.s * 4, fy - 4, ROT[3]); p.fline(fx + b.s * 4, fy - 4, fx + b.s * 7, fy - 2, ROT[2]);
    p.dot(fx + b.s * 4, fy - 4.5, ROT[4]);
    pts.push([Math.round(fx + b.s * 6 - 0.5), Math.round(fy - 1.5), 0.9]);
  }
  // Stamm mit Drehwuchs, Moos unten links, nasser dunkler Fuß
  const TR = [ROT[0], ROT[2], ROT[3], ROT[4], ROT[5]];
  roughBark(p, crownY - 3, bottom + 1, tx, tw, TR, { seed, plate: 1.6, twist: 0.06, wet: bottom - 2 });
  barkPatches(p, (y) => tx(y) - tw(y) * 0.2, (y) => tw(y) * 0.6, bottom - 14, bottom - 1, seed + 21, 4, { rot: false });
  // gespaltene Krone
  const tc = tx(crownY - 3);
  fpoly(p, [[tc - 2, crownY - 2.5], [tc - 1.2, crownY - 5], [tc - 0.3, crownY - 3], [tc + 1.2, crownY - 6], [tc + 2.2, crownY - 2.5]], (x) => (x < tc ? ROT[4] : ROT[2]));
  p.dot(tc - 1.2, crownY - 4.5, ROT[5]); p.dot(tc + 1.2, crownY - 5.5, ROT[4]); p.fline(tc - 0.3, crownY - 3, tc - 0.3, crownY - 1.5, ROT[0]);
  // Astloch: dunkle Höhle, Lichtlippe oben links, beleuchtete Innenwand unten rechts
  const hy = crownY + Math.round((bottom - crownY) * 0.45) + 0.5, hx = tx(hy);
  p.each(hx - 2.5, hy - 3, hx + 2.5, hy + 3, (x, y) => {
    const nx = (x - hx) / 1.5, ny = (y - hy) / 2.2, d = nx * nx + ny * ny;
    if (d > 1.45) return null;
    if (d > 1) return nx + ny < -0.4 ? ROT[5] : nx + ny > 0.6 ? ROT[1] : null;
    return d > 0.55 && nx + ny > 0.5 ? ROT[2] : INTERIOR;
  });
  // Wurzeln ins Wasser
  const bx = tx(bottom);
  p.fline(bx - 3, bottom - 1.5, bx - 9, bottom + 0.5, ROT[4], 1); p.fline(bx - 3, bottom - 2, bx - 9, bottom, ROT[5]); p.fline(bx - 4, bottom - 0.5, bx - 8, bottom + 0.5, ROT[2]);
  p.fline(bx + 3, bottom - 1.5, bx + 8, bottom + 0.5, ROT[2], 1); p.fline(bx + 2, bottom - 0.5, bx + 5, bottom + 0.5, ROT[1]);
  fRing(p, bx - 8.5, bottom + 0.6, 1.6, 0.8);
  // Moosbärte
  for (let i = 0; i < pts.length; i++) {
    const [x, y, t] = pts[i];
    if (hash2(x, y, seed + 9) > 0.3 || i % 2) continue;
    const len = Math.round(3 + t * 9 + hash2(x, y, seed + 10) * 9);
    fBeard(p, x, y, Math.min(len, bottom - y - 3), seed + i);
  }
}

// ------------------------------------------------------------ Faulige Stümpfe
function deadStump(v) {
  const rng = createRng(1040 + v);
  const W = 22, H = [16, 20, 14][v];
  return mk(W, H, (p, g) => {
    const cx = 11, bottom = H - 1, hw = [4, 3, 5][v], topY = [6, 5, 5][v];
    if (p.fine) { stumpFine(p, g, v, rng, cx, bottom, hw, topY); return; }
    mudPatch(p, cx, bottom - 1, 10, 2, 1040 + v);
    // Wurzeln
    p.line(cx - hw, bottom - 1, cx - hw - 4, bottom, ROT[4]); p.line(cx - hw, bottom - 2, cx - hw - 2, bottom - 1, ROT[3]);
    p.line(cx + hw, bottom - 1, cx + hw + 4, bottom, ROT[1]);
    for (let y = topY; y < bottom; y++) for (let x = cx - hw; x <= cx + hw; x++) {
      const rel = (x - (cx - hw)) / (2 * hw);
      let i = rel < 0.2 ? 5 : rel < 0.55 ? 4 : rel < 0.8 ? 3 : 2;
      if (hash2(x, y, v) < 0.14) i--;
      if ((x + y * 2) % 5 === 0 && rel > 0.2) i--;
      p.px(x, y, ROT[clampI(i, 7)]);
    }
    if (v === 0) {
      // eingefaulte Schnittfläche, Moospolster
      p.ellipse(cx, topY, hw, 1.6, ROT[4]); p.ellipse(cx, topY, hw - 1.4, 1, ROT[1]); p.px(cx, topY, INTERIOR);
      for (let x = cx - hw; x <= cx; x++) p.px(x, topY - 1, MOSS[5]); p.px(cx - hw, topY, MOSS[6]); p.px(cx - 2, topY - 1, MOSS[6]);
      // Baumschwamm-Konsolen
      for (const [x, y] of [[cx + hw, topY + 4], [cx + hw, topY + 7]]) { p.rect(x, y, 3, 1, '#8a5a2a'); p.rect(x, y + 1, 3, 1, '#4a2e16'); p.px(x, y, '#b07a3a'); }
    } else if (v === 1) {
      // hoch gesplittert mit Moosbart
      const tops = [0, -4, -2, -5, -1, 0, -3];
      for (let i = 0; i < 7; i++) for (let y = topY + tops[i]; y < topY + 1; y++) p.px(cx - hw + i, y, ROT[i < 2 ? 5 : i < 4 ? 4 : 2]);
      beard(p, cx + 2, topY + 1, 7, 3); beard(p, cx - 2, topY, 5, 5);
      for (let y = topY + 2; y < bottom - 1; y += 3) p.px(cx - hw, y, MOSS[5]);
    } else {
      // breit, hohl, mit Leuchtpilzen
      p.ellipse(cx, topY, hw, 1.6, ROT[4]); p.ellipse(cx, topY, hw - 1.2, 1, INTERIOR);
      for (let x = cx - hw; x <= cx + hw; x++) if (hash2(x, 5, 1043) < 0.6) p.px(x, topY - 1, MOSS[5]);
      glowShroom(p, g, cx - hw - 1, bottom - 1, 1, 2, GLT, 1044);
      glowShroom(p, g, cx + 2, topY - 1, 2, 2, GLT, 1045);
      glowShroom(p, g, cx + hw + 2, bottom - 2, 1, 3, GLT, 1046);
    }
    for (let i = 0; i < 3; i++) p.px(cx - hw + rng.int(0, 2), bottom - rng.int(2, 6), MOSS[4]);
  }, { ax: 11, box: [-4, -3, 4, 1], b: true });
}
// Stufe B: Holzkörper mit senkrechten Faserrillen und Lichtseite, Schnittfläche mit Jahresringen,
// Baumschwamm-Konsolen mit Lichtkante, Splitterkrone als spitze Zacken, Höhlung mit beleuchteter Rückwand.
function stumpFine(p, g, v, rng, cx, bottom, hw, topY) {
  const seed = 1040 + v, X = cx + 0.5;
  fMud(p, cx, bottom - 1, 10, 2, seed);
  p.fline(X - hw, bottom - 1, X - hw - 4, bottom + 0.5, ROT[3], 1); p.fline(X - hw, bottom - 1.5, X - hw - 4, bottom, ROT[5]);
  p.fline(X - hw, bottom - 2, X - hw - 2, bottom - 0.5, ROT[4]);
  p.fline(X + hw, bottom - 1, X + hw + 4, bottom + 0.5, ROT[1], 1); p.fline(X + hw, bottom - 1.5, X + hw + 3.5, bottom, ROT[2]);
  const half = hw + 0.5;
  const wAt = (y) => 2 * half + (y > bottom - 2 ? (y - bottom + 2) * 0.7 : 0) + (v === 1 ? Math.sin(y * 0.7) * 0.4 : 0);
  roughBark(p, v === 1 ? topY - 0.5 : topY + 0.5, bottom, () => X, wAt, [ROT[0], ROT[2], ROT[3], ROT[4], ROT[5]], { seed, plate: 1.5, wet: bottom - 1.5 });
  barkPatches(p, () => X, wAt, topY + 2, bottom - 1, seed + 5, 2 + v, { rot: v !== 0 });
  if (v === 0) {
    p.oval(X, topY + 0.5, half, 1.7, ROT[3]);
    p.each(X - half, topY - 1.5, X + half, topY + 2, (x, y) => {
      const nx = (x - X) / (half - 0.4), ny = (y - topY - 0.5) / 1.3, d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) return null;
      if (d < 0.22) return INTERIOR;
      if (d < 0.42) return ROT[1];
      return fract(d * 3.2) < 0.3 ? ROT[2] : nx + ny < -0.3 ? ROT[5] : ROT[4];
    });
    // Moospolster auf der Lichtseite
    for (let i = 0; i < 4; i++) { const mx = X - half + 0.6 + i * 1.3; p.oval(mx, topY - 0.3 + (i & 1) * 0.3, 1.1, 0.75, MOSS[5]); p.dot(mx - 0.4, topY - 0.8 + (i & 1) * 0.3, MOSS[6]); }
    p.fline(X - half + 0.25, topY, X - half + 0.25, topY + 2, MOSS[4]);
    // Baumschwamm-Konsolen
    for (const [x, y] of [[cx + hw, topY + 4], [cx + hw, topY + 7]]) {
      p.each(x - 0.5, y - 1, x + 3.5, y + 2, (xx, yy) => {
        const nx = (xx - x - 1.2) / 2.1, ny = (yy - y - 0.9) / 1.2;
        if (nx * nx + ny * ny > 1 || ny > 0.55) return null;
        return ny > 0.15 ? '#4a2e16' : ny < -0.45 || nx < -0.55 ? '#b07a3a' : '#8a5a2a';
      });
      p.dot(x + 0.25, y - 0.25, '#c8925a');
    }
  } else if (v === 1) {
    const tops = [0, -4, -2, -5, -1, 0, -3], x0 = cx - hw;
    const pts = [[x0, topY + 1]];
    for (let i = 0; i < 7; i++) { const t = topY + tops[i]; pts.push([x0 + i, t + 1], [x0 + i + (i & 1 ? 0.7 : 0.3), t - 0.4], [x0 + i + 1, t + 1]); }
    pts.push([x0 + 7, topY + 1]);
    fpoly(p, pts, (x, y) => {
      const k = x - x0;
      let i = k < 2 ? 5 : k < 4 ? 4 : 2;
      if (fract(k * 2) < 0.5 && k > 1 && hash2(Math.floor(k * 2), Math.floor(y), 3) < 0.5) i -= 1;
      return ROT[i];
    });
    for (let i = 0; i < 7; i++) p.dot(x0 + i + (i & 1 ? 0.5 : 0.25), topY + tops[i], i < 4 ? ROT[6] : ROT[4]);
    p.fline(cx - 0.5, topY - 1, cx - 0.5, topY + 1.5, ROT[1]);
    fBeard(p, cx + 2, topY + 1, 7, 3); fBeard(p, cx - 2, topY, 5, 5);
    for (let y = topY + 2; y < bottom - 1; y += 3) { p.dot(X - half + 0.25, y + 0.25, MOSS[5]); p.dot(X - half + 0.25, y + 0.75, MOSS[4]); p.dot(X - half + 0.75, y + 0.75, MOSS[3]); }
  } else {
    p.oval(X, topY + 0.5, half, 1.7, ROT[4]);
    p.oval(X - 0.25, topY + 0.25, half - 0.5, 1.2, ROT[5]);
    p.each(X - half, topY - 1, X + half, topY + 2, (x, y) => {
      const nx = (x - X) / (half - 1.2), ny = (y - topY - 0.6) / 1.05;
      if (nx * nx + ny * ny > 1) return null;
      return ny < -0.25 ? ROT[2] : INTERIOR;                                         // Rückwand im Licht, Schlund dunkel
    });
    for (let x = cx - hw; x <= cx + hw; x++) if (hash2(x, 5, 1043) < 0.6) { p.dot(x + 0.25, topY - 0.25, MOSS[6]); p.dot(x + 0.75, topY - 0.25, MOSS[5]); p.dot(x + 0.5, topY + 0.25, MOSS[4]); }
    fShroom(p, g, cx - hw - 1, bottom - 1, 1, 2, GLT, 1044);
    fShroom(p, g, cx + 2, topY - 1, 2, 2, GLT, 1045);
    fShroom(p, g, cx + hw + 2, bottom - 2, 1, 3, GLT, 1046);
  }
  for (let i = 0; i < 3; i++) { const x = cx - hw + rng.int(0, 2), y = bottom - rng.int(2, 6); p.oval(x + 0.6, y + 0.5, 0.75, 0.6, MOSS[4]); p.dot(x + 0.25, y + 0.25, MOSS[5]); }
}

// ------------------------------------------------------------ Schilf / Rohrkolben
function reeds(v) {
  const rng = createRng(1060 + v);
  const W = 20, H = 26;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    if (p.fine) { reedsFine(p, v, rng, W, bottom); return; }
    // Wasserfläche
    for (let x = 1; x < W - 1; x++) for (let y = bottom - 1; y <= bottom; y++) if (hash2(x, y, 1061) < 0.85 || y === bottom) p.px(x, y, (x + y) % 4 === 0 ? SW[3] : SW[2]);
    // Seerosenblatt
    if (v !== 1) { p.ellipse(v === 0 ? 15 : 4, bottom - 1, 3, 1, MOSS[4]); p.px(v === 0 ? 14 : 3, bottom - 2, MOSS[6]); p.px(v === 0 ? 16 : 5, bottom - 1, SW[1]); }
    const n = 6 + v * 2;
    for (let i = 0; i < n; i++) {
      const x = 3 + rng.int(0, 13), h = rng.int(10, 22), bend = rng.range(-3, 3);
      const [tx, ty] = blade(p, x, bottom - 1, h, bend, REED, 1, bend < 0 ? 5 : 4);
      if (rng.chance(0.5)) {
        // Kolben
        const kx = Math.round(x + bend * 0.8), ky = bottom - 1 - Math.round(h * 0.8);
        p.rect(kx, ky, 2, 4, CATT[2]); p.px(kx, ky, CATT[3]); p.px(kx + 1, ky + 3, CATT[0]); p.px(kx, ky + 1, CATT[3]);
      }
      ripple(p, x, bottom, 1);
    }
    // breite Blätter
    for (let i = 0; i < 4; i++) { const x = 3 + rng.int(0, 12); p.line(x, bottom - 1, x + (i % 2 ? 5 : -4), bottom - 9, REED[i % 2 ? 3 : 5]); p.line(x + 1, bottom - 1, x + (i % 2 ? 6 : -3), bottom - 8, REED[2]); }
    // Libelle (winziger Glanzpunkt)
    if (v === 2) { p.px(12, 6, '#6ae0d0'); p.px(11, 6, '#2a8a8a'); p.px(13, 6, '#2a8a8a'); }
  }, { ax: 10, b: true });
}
// Stufe B: Wasserstreifen mit Lichtkante, Seerosenblatt mit Kerbe, Halme fein verjüngt, Rohrkolben als Walze mit
// Lichtseite und Spitze, breite Blätter mit Mittelrippe.
function reedsFine(p, v, rng, W, bottom) {
  const [s1, s2, s3, s4] = pal32([SW[1], SW[2], SW[3], SW[4]]);
  p.scan(1, bottom - 1, W - 1, bottom + 1, (x, y) => {
    const e = Math.abs(x - W / 2) / (W / 2 - 1), top = bottom - 1 + Math.max(0, (e - 0.75) * 4);
    if (e > 1 || y < top) return 0;
    if (y < top + 0.5) return x < W / 2 ? s3 : s2;
    return y > bottom + 0.5 ? s1 : tri(x * 0.25 + v) > 0.85 ? s4 : s2;
  });
  if (v !== 1) {
    const lx = (v === 0 ? 15 : 4) + 0.5, ly = bottom - 0.5;
    p.each(lx - 4, ly - 2, lx + 4, ly + 2, (x, y) => {
      const nx = (x - lx) / 3.5, ny = (y - ly) / 1.3;
      if (nx * nx + ny * ny > 1) return null;
      if (ny > -0.1 && Math.abs(nx - ny * 0.4 - 0.15) < 0.12) return SW[1];          // Kerbe
      return ny > 0.45 ? MOSS[3] : nx + ny < -0.6 ? MOSS[6] : MOSS[4];
    });
    p.dot(lx - 1.5, ly - 0.5, MOSS[6]);
  }
  const n = 6 + v * 2;
  for (let i = 0; i < n; i++) {
    const x = 3 + rng.int(0, 13), h = rng.int(10, 22), bend = rng.range(-3, 3);
    fBlade(p, x, bottom - 1, h, bend, REED, 1, bend < 0 ? 5 : 4);
    if (rng.chance(0.5)) {
      const kx = x + 0.5 + bend * 0.64 * 0.64 + 0.5, ky = bottom - 1 - Math.round(h * 0.8);
      p.fline(kx - 0.25, ky - 0.5, kx - 0.25, ky - 2, REED[3]);
      p.each(kx - 1.2, ky - 0.5, kx + 1.2, ky + 4.5, (xx, yy) => {
        const nx = (xx - kx) / 1, ny = (yy - ky - 2) / 2.2;
        if (nx * nx + Math.max(0, Math.abs(ny) - 0.55) ** 2 * 6 > 1) return null;
        return nx < -0.4 ? CATT[3] : nx < 0.4 ? CATT[2] : CATT[1];
      });
      p.dot(kx - 0.75, ky + 0.25, '#8a5a34');
    }
    fRing(p, x + 0.5, bottom + 0.5, 1.4, 0.7);
  }
  for (let i = 0; i < 4; i++) {
    const x = 3 + rng.int(0, 12), dx = i % 2 ? 5 : -4, c = REED[i % 2 ? 3 : 5];
    fpoly(p, [[x, bottom], [x + dx + 0.5, bottom - 9], [x + 2, bottom]], (xx, yy) => {
      const t = (bottom - yy) / 9, mid = x + 1 + (dx - 0.5) * t;
      return Math.abs(xx - mid) < 0.3 ? REED[2] : (xx < mid) === (dx < 0) ? REED[2] : c;
    });
  }
  if (v === 2) { p.fline(11, 6.25, 13.75, 6.25, '#2a8a8a'); p.dot(13.75, 6.25, '#6ae0d0'); p.dot(12, 5.75, '#6ae0d0'); p.dot(12.5, 5.75, '#9ef0e0'); }
}

// ------------------------------------------------------------ Leuchtpilze
function mushrooms(v) {
  const W = 20, H = 18;
  const G = [GLT, GLV, GLG][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    if (p.fine) {
      fMud(p, 10, bottom - 1, 8, 2, 1080 + v, false);
      for (let x = 3; x < 17; x++) if (hash2(x, 1, 1081 + v) < 0.5) { p.oval(x + 0.5, bottom - 1.6, 0.9, 0.6, MOSS[3 + (x % 2)]); p.dot(x + 0.25, bottom - 2, MOSS[5]); }
    } else {
      mudPatch(p, 10, bottom - 1, 8, 2, 1080 + v, false);
      for (let x = 3; x < 17; x++) if (hash2(x, 1, 1081 + v) < 0.5) p.px(x, bottom - 2, MOSS[3 + (x % 2)]);
    }
    const sets = [
      [[6, bottom - 1, 2, 5], [11, bottom - 1, 3, 9], [15, bottom, 1, 3], [8, bottom, 1, 2]],
      [[9, bottom - 1, 4, 6], [4, bottom, 2, 3], [15, bottom - 1, 2, 4]],
      [[10, bottom - 1, 5, 4], [4, bottom, 1, 2], [16, bottom, 2, 2]],
    ][v];
    sets.forEach(([x, y, r, h], k) => (p.fine ? fShroom : glowShroom)(p, g, x, y, r, h, G, 1082 + v * 5 + k));
    // Sporen in der Luft (fein: heißer Kern, Saum)
    for (let k = 0; k < 4; k++) {
      const x = 3 + Math.round(hash2(k, 0, 1090 + v) * 14), y = 1 + Math.round(hash2(k, 1, 1090 + v) * 7);
      if (!g.fine) { g.px(x, y, G[3]); continue; }
      g.dot(x + 0.25, y + 0.25, G[4]); g.dot(x + 0.75, y + 0.25, G[2]); g.dot(x + 0.25, y + 0.75, G[2]); g.dot(x - 0.25, y + 0.25, G[1]); g.dot(x + 0.25, y - 0.25, G[1]);
    }
  }, { ax: 10, b: true });
}

// ------------------------------------------------------------ Moosfelsen
function mossRock(v) {
  const rng = createRng(1100 + v);
  const [W, H] = [[22, 16], [30, 21], [16, 12]][v];
  return mk(W, H, (p) => {
    const cx = W / 2, by = H - 1;
    if (p.fine) { mossRockFine(p, v, rng, W, H); return; }
    mudPatch(p, Math.floor(cx), by - 1, Math.floor(W / 2) - 1, 2, 1100 + v, v !== 2);
    const lumps = [[[cx, by - 6, 9.5, 6.4]], [[cx - 3, by - 8.5, 10, 8.5], [cx + 8, by - 4.5, 5.5, 4.4]], [[cx, by - 4.5, 6.6, 4.4]]][v];
    lumps.forEach(([x, y, rx, ry], k) => {
      const top = shadeLump(p, x, y, rx, ry, MST.slice(1), 1101 + v * 3 + k, { rough: 0.16, flat: 0.25, rim: MST[3] });
      mossCap(p, top, 2 + (k === 0 ? 1 : 0), 1102 + v + k, -Infinity, x + rx * 0.6);
      // nasse Schlieren
      for (let i = 0; i < 3; i++) { const xx = Math.round(x + rng.range(-rx * 0.5, rx * 0.5)); const t = top.get(xx); if (t !== undefined) for (let yy = t + 3; yy < t + 3 + rng.int(2, 4); yy++) p.px(xx, yy, MST[2]); }
    });
    // Pilzchen / Farnreste
    if (v === 1) { p.px(4, by - 2, '#a08a60'); p.px(4, by - 3, '#c0a878'); p.px(5, by - 3, '#806a48'); }
    for (let i = 0; i < 3 + v; i++) blade(p, rng.int(1, W - 2), by, rng.int(1, 3), rng.range(-1.5, 1.5), REED, 1, 4);
  }, { ax: Math.floor(W / 2), box: [-Math.floor(W / 2) + 2, -4, Math.floor(W / 2) - 2, 1], b: true });
}
// Stufe B: nasser Fels in harten Stufen mit kühlem Reflex unten rechts, Moospolster mit Tropfnasen auf der
// Lichtseite, Nässeglanz oben links, Risse mit Lichtlippe, Halme am Fuß.
function mossRockFine(p, v, rng, W, H) {
  const cx = W / 2, by = H - 1;
  fMud(p, Math.floor(cx), by - 1, Math.floor(W / 2) - 1, 2, 1100 + v, v !== 2);
  const lumps = [[[cx, by - 6, 9.5, 6.4]], [[cx - 3, by - 8.5, 10, 8.5], [cx + 8, by - 4.5, 5.5, 4.4]], [[cx, by - 4.5, 6.6, 4.4]]][v];
  const RP = MST.slice(0, 7);
  lumps.forEach(([x, y, rx, ry], k) => {
    const seed = 1101 + v * 3 + k;
    boulder(p, x, y, rx, ry, RP, seed, { lo: 1, hi: 6, bias: -0.04, rough: 0.12, flat: 0.25, rimC: MST[3], keep: k ? (xx, yy) => yy > y - ry * 0.4 || xx > x - rx * 0.3 : null });
    // Riss: dunkle Linie, darunter Lichtlippe
    const c0 = x + rx * (0.15 - 0.3 * hash2(seed, 2, 1)), c1 = c0 + rx * 0.25;
    p.fline(c0, y - ry * 0.35, c1, y + ry * 0.35, MST[1]); p.fline(c0 + 0.5, y - ry * 0.35 + 0.5, c1 + 0.5, y + ry * 0.35 + 0.5, MST[4]);
    // Nässeglanz
    p.dot(x - rx * 0.45, y - ry * 0.5, MST[7]); p.dot(x - rx * 0.45 + 0.5, y - ry * 0.5, MST[6]); p.dot(x - rx * 0.3, y - ry * 0.62, MST[6]);
    const top = fTop(p, x - rx * 1.2, x + rx * 1.2, y - ry * 1.3, y);
    fMossCap(p, top, 2.2 + (k === 0 ? 0.8 : 0), seed + 1, x + rx * 0.6);
    // nasse Schlieren unter dem Moos
    for (let i = 0; i < 3; i++) {
      const xx = Math.round(x + rng.range(-rx * 0.5, rx * 0.5)) + 0.25, t = top.find(([tx]) => Math.abs(tx - xx) < 0.3), l = rng.int(2, 4);
      if (t) p.fline(xx, t[1] + 2.5, xx, t[1] + 2.5 + l, MST[2]);
    }
  });
  if (v === 1) { p.fline(4.25, by - 1.5, 4.25, by - 3, '#a08a60'); p.oval(4.6, by - 3.2, 1, 0.6, '#c0a878'); p.dot(5.25, by - 3, '#806a48'); }
  for (let i = 0; i < 3 + v; i++) fBlade(p, rng.int(1, W - 2), by, rng.int(1, 3), rng.range(-1.5, 1.5), REED, 1, 4);
}

// ------------------------------------------------------------ Pfahlhütte
function stiltHut() {
  const W = 62, H = 68;
  return mk(W, H, (p, g) => {
    const by = H - 1, cx = 31, platY = 42;
    // Wasser unter der Hütte
    for (let y = by - 7; y <= by; y++) for (let x = 3; x < W - 3; x++) {
      const e = Math.abs(x - cx) / 28 + (y - (by - 7)) / 16;
      if (e > 1.05 + hash2(x, y, 1111) * 0.1) continue;
      p.px(x, y, (Math.sin(x * 0.5 + y * 1.4) > 0.85 || y === by - 7) ? SW[3] : SW[2]);
    }
    // Pfähle (hinten dunkel, vorne hell)
    for (const x of [14, 46]) { pole(p, x, platY, by - 5, 2, ROT.slice(0, 4), 1112); ripple(p, x, by - 5, 1); }
    for (const x of [8, 30, 52]) { pole(p, x, platY, by - 2, 3, ROT, 1113 + x); ripple(p, x + 1, by - 2, 2); for (let y = by - 8; y < by - 2; y++) if (hash2(x, y, 1114) < 0.6) p.px(x, y, MOSS[4]); }
    // Kreuzstreben
    p.line(10, platY + 3, 29, by - 6, ROT[3]); p.line(32, platY + 3, 51, by - 6, ROT[2]); p.line(51, platY + 3, 33, by - 6, ROT[1]);
    // Leiter zum Wasser
    for (let y = platY; y <= by - 3; y++) { p.px(36, y, ROT[5]); p.px(40, y, ROT[3]); }
    for (let y = platY + 2; y < by - 3; y += 3) { p.rect(37, y, 3, 1, ROT[4]); p.px(37, y + 1, ROT[1]); }
    // Plattform
    p.rect(3, platY - 3, 56, 4, ROT[3]); for (let x = 3; x < 59; x += 3) p.px(x, platY - 3, ROT[2]);
    p.rect(3, platY - 3, 56, 1, ROT[5]); p.rect(3, platY + 1, 56, 1, ROT[0]);
    for (let x = 4; x < 58; x += 5) p.px(x, platY - 1, ROT[1]);
    // Hüttenwand: Flechtwerk mit Lehm
    const wx0 = 8, wx1 = 53, wTop = 22, wBot = platY - 4;
    for (let y = wTop; y <= wBot; y++) for (let x = wx0; x <= wx1; x++) {
      const rel = (x - wx0) / (wx1 - wx0);
      let i = rel < 0.15 ? 4 : rel < 0.7 ? 3 : 2;
      const weave = ((x >> 1) + (y >> 1)) % 2;
      if (weave && (y % 2 === 0)) i -= 1;
      if (hash2(x, y, 1115) < 0.12) i -= 1; // Lehmflecken
      p.px(x, y, (hash2(x >> 2, y >> 2, 1116) < 0.3 ? MUD : ROT)[clampI(i, 5)]);
    }
    for (const x of [wx0, 30, wx1]) pole(p, x - 1, wTop - 2, wBot, 2, ROT, 1117);
    // Tür (offen, dunkel) mit Fellvorhang
    p.rect(26, 28, 9, wBot - 27, INTERIOR); p.rect(26, 28, 4, wBot - 27, '#3a2a1c'); p.line(29, 28, 27, wBot, '#5a4028'); p.rect(25, 27, 11, 1, ROT[5]);
    // Fenster mit warmem Licht
    p.rect(14, 28, 6, 5, '#3a1e0a'); p.rect(15, 29, 4, 3, EMB[2]); p.px(16, 30, EMB[4]); p.line(17, 28, 17, 32, ROT[2]); p.rect(13, 27, 8, 1, ROT[5]); p.rect(13, 33, 8, 1, ROT[2]);
    g.rect(15, 29, 4, 3, EMB[3]); g.px(16, 30, EMB[4]);
    // Fischernetz und getrocknete Fische rechts
    for (let y = 26; y < 36; y++) for (let x = 40; x < 50; x++) if ((x + y) % 3 === 0 || (x - y + 60) % 3 === 0) if (hash2(x, y, 1118) < 0.8) p.px(x, y, (x + y) % 2 ? BEARD[3] : BEARD[2]);
    for (const fx of [42, 45, 48]) { p.rect(fx, 36, 2, 4, '#6a6a5a'); p.px(fx, 36, '#9a9a82'); p.px(fx, 40, '#3a3a30'); }
    // Dach: steiles Schilfdach, 3/4 mit Giebel links
    const rTop = 4, rBot = wTop + 1;
    for (let y = rTop; y <= rBot; y++) {
      const k = (y - rTop) / (rBot - rTop);
      const xl = Math.round(cx - 6 - k * 24), xr = Math.round(cx + 6 + k * 24);
      for (let x = xl; x <= xr; x++) {
        const rel = (x - xl) / (xr - xl);
        let i = rel < 0.2 ? 5 : rel < 0.5 ? 4 : rel < 0.8 ? 3 : 2;
        if ((y + (x >> 1)) % 4 === 0) i -= 1;
        if (y % 5 === 0) i -= 1;
        if (hash2(x, y, 1119) < 0.1) i -= 1;
        p.px(x, y, THATCH[clampI(i, 7)]);
      }
    }
    // Traufe: ausgefranst, Moos
    for (let x = cx - 30; x <= cx + 30; x++) { const l = 1 + Math.round(hash2(x, 3, 1120) * 2); for (let k = 0; k < l; k++) p.px(x, rBot + 1 + k, THATCH[k === 0 ? 2 : 1]); if (hash2(x, 4, 1121) < 0.25) p.px(x, rBot - 1, MOSS[5]); }
    for (let x = cx - 14; x < cx + 6; x += 3) p.px(x, rTop + 4 + ((x * 7) % 5), MOSS[4]);
    // Firstbündel + Geweih
    p.rect(cx - 7, rTop - 1, 15, 2, THATCH[5]); p.rect(cx - 7, rTop - 1, 15, 1, THATCH[6]);
    p.line(cx - 7, rTop - 1, cx - 10, rTop - 4, BONE[3]); p.line(cx - 9, rTop - 3, cx - 9, rTop - 6, BONE[3]); p.line(cx - 10, rTop - 4, cx - 12, rTop - 5, BONE[2]);
    p.line(cx + 7, rTop - 1, cx + 10, rTop - 4, BONE[2]); p.line(cx + 9, rTop - 3, cx + 9, rTop - 6, BONE[2]);
    // Rauch aus dem Dach
    p.rect(cx + 8, rTop + 3, 3, 2, ROT[1]);
    // Laterne am Plattformeck
    const lx = 5, ly = platY - 12;
    p.line(lx + 1, platY - 3, lx + 1, ly - 3, ROT[4]); p.line(lx + 1, ly - 3, lx + 4, ly - 3, ROT[4]); p.px(lx + 4, ly - 2, IRON[2]);
    p.rect(lx + 3, ly - 1, 3, 1, IRON[2]); p.rect(lx + 3, ly, 3, 3, '#4a4418'); p.px(lx + 4, ly + 1, '#f0e080'); p.rect(lx + 3, ly + 3, 3, 1, IRON[1]);
    g.rect(lx + 3, ly, 3, 3, '#c8c050'); g.px(lx + 4, ly + 1, '#fff8b0');
  }, {
    ax: 31, box: [-26, -8, 26, 1],
    light: { dx: -21, dy: -40, radius: 70, color: [220, 210, 120], intensity: 0.75 },
    extra: { smoke: { dx: 9, dy: -60, rate: 1.2 } },
    fine: (f, g) => {
      fWindow(f, g, 15, 29, 4, 3, 17);
      fLamp(f, g, 8, 30, 3, 3, ['#4a4418', '#6a6420', '#c8c050', '#f0e080', '#fff8c8']);
      f.dot(8.25, 29.25, IRON[4]); f.fline(8, 33.25, 10.75, 33.25, IRON[2]);
      // Geweih am First: Lichtkante
      f.fline(24, 3.25, 21.25, 0.5, BONE[4]);
    },
  });
}

// ------------------------------------------------------------ Palisade (morsch)
function rotLog(p, x, yTop, yBot, seed) {
  for (let y = yTop + 2; y <= yBot; y++) {
    const h = hash2(x, y, seed);
    p.px(x, y, h < 0.1 ? ROT[3] : ROT[5]); p.px(x + 1, y, h > 0.85 ? ROT[2] : ROT[4]); p.px(x + 2, y, ROT[2]);
    if (y > yBot - 7 && hash2(x, y, seed + 1) < 0.55) p.px(x + (y % 2), y, MOSS[3 + (y % 2)]);
  }
  p.px(x + 1, yTop, ROT[6]); p.px(x, yTop + 1, ROT[6]); p.px(x + 1, yTop + 1, ROT[5]); p.px(x + 2, yTop + 1, ROT[3]);
}

function palisadeH() {
  const W = 16, H = 26;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    for (let i = 0; i < 4; i++) { const x = i * 4, top = [1, 3, 0, 2][i]; rotLog(p, x, top, bottom, 1131); p.px(x + 3, bottom - 2, INTERIOR); }
    for (const y of [7, 17]) {
      p.rect(0, y, 16, 2, ROT[2]); p.rect(0, y, 16, 1, ROT[4]);
      for (let x = 1; x < 16; x += 4) { p.px(x, y, BEARD[3]); p.px(x, y + 1, BEARD[2]); }
    }
    // Moosbart am oberen Riegel
    beard(p, 6, 9, 5, 2); beard(p, 13, 9, 3, 4);
    for (let x = 0; x < 16; x++) p.px(x, bottom, hash2(x, 3, 1132) < 0.5 ? MUD[2] : MOSS[2]);
  }, { ax: 8, box: [-8, -3, 8, 1] });
}

function palisadeV() {
  const W = 8, H = 40;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    for (let k = 0; k < 5; k++) {
      const gy = bottom - 16 + k * 4, top = gy - 24 + [1, 0, 2, 0, 1][k];
      rotLog(p, 2, top, gy, 1133 + k);
      p.px(1, top + 3, ROT[4]); p.px(5, top + 3, ROT[1]);
    }
    for (let y = bottom - 30; y <= bottom - 2; y++) if (y % 10 === 0) { p.rect(1, y, 6, 2, ROT[2]); p.px(1, y, ROT[4]); }
    beard(p, 3, bottom - 19, 5, 7);
    for (let y = bottom - 2; y <= bottom; y++) p.rect(1, y, 6, 1, MUD[2]);
  }, { ax: 4, box: [-3, -16, 3, 1] });
}

// ------------------------------------------------------------ Wachturm auf Stelzen
function watchtower() {
  const W = 44, H = 70;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 22, platY = 30;
    mudPatch(p, cx, bottom - 1, 18, 3, 1141);
    for (const x of [13, 30]) pole(p, x, platY, bottom - 5, 2, ROT.slice(0, 4), 1142);
    p.line(14, platY + 4, 30, bottom - 8, ROT[1]); p.line(30, platY + 4, 14, bottom - 8, ROT[1]);
    const leg = (xa, xb) => { for (let y = platY; y <= bottom; y++) { const t = (y - platY) / (bottom - platY); const x = Math.round(xa + (xb - xa) * t); p.px(x, y, ROT[5]); p.px(x + 1, y, ROT[4]); p.px(x + 2, y, ROT[2]); if (y > bottom - 9 && hash2(x, y, 1143) < 0.6) p.px(x, y, MOSS[4]); } };
    leg(8, 5); leg(33, 36);
    p.line(10, platY + 3, 33, platY + 19, ROT[4]); p.line(10, platY + 4, 33, platY + 20, ROT[2]); p.line(33, platY + 3, 10, platY + 19, ROT[3]);
    p.rect(8, platY + 20, 27, 2, ROT[3]); p.rect(8, platY + 20, 27, 1, ROT[5]);
    p.line(9, platY + 22, 34, bottom - 2, ROT[3]); p.line(34, platY + 22, 8, bottom - 2, ROT[2]);
    for (let y = platY; y <= bottom; y++) { p.px(19, y, ROT[5]); p.px(24, y, ROT[3]); }
    for (let y = platY + 3; y < bottom; y += 4) { p.rect(20, y, 4, 1, ROT[4]); p.px(20, y + 1, ROT[1]); }
    // Plattform + Brüstung aus Flechtwerk
    p.rect(3, platY - 3, 38, 4, ROT[3]); for (let x = 3; x < 41; x += 3) p.px(x, platY - 3, ROT[2]);
    p.rect(3, platY - 3, 38, 1, ROT[5]); p.rect(3, platY + 1, 38, 1, ROT[0]);
    for (let y = platY - 12; y < platY - 3; y++) for (let x = 3; x < 41; x++) {
      let i = x < 8 ? 4 : x > 36 ? 2 : 3;
      if ((((x >> 1) + (y >> 1)) % 2) && y % 2 === 0) i -= 1;
      if (hash2(x, y, 1144) < 0.1) i -= 1;
      p.px(x, y, ROT[clampI(i, 7)]);
    }
    for (let x = 3; x < 41; x += 6) { p.rect(x, platY - 14, 2, 12, ROT[5]); p.px(x + 1, platY - 14, ROT[3]); }
    p.rect(2, platY - 13, 40, 1, ROT[5]);
    beard(p, 11, platY + 2, 8, 1); beard(p, 27, platY + 2, 6, 2); beard(p, 35, platY + 2, 10, 3);
    // Tuchfetzen mit Geweihzeichen
    p.rect(15, platY - 12, 9, 12, CLOTH[3]); p.rect(15, platY - 12, 2, 12, CLOTH[4]); p.rect(23, platY - 12, 1, 12, CLOTH[1]);
    for (let x = 15; x < 24; x++) p.px(x, platY + (x % 3 === 0 ? 1 : 0), CLOTH[2]);
    p.line(19, platY - 4, 19, platY - 9, BONE[3]); p.line(19, platY - 7, 17, platY - 10, BONE[3]); p.line(19, platY - 7, 21, platY - 10, BONE[2]);
    // Pfosten + Schilfdach
    for (const x of [4, 38]) { p.rect(x, 12, 2, platY - 26, ROT[4]); p.px(x, 12, ROT[6]); }
    for (let y = 1; y <= 14; y++) {
      const k = (y - 1) / 13, hw = 3 + k * 20;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - cx) / hw;
        let i = rel < -0.3 ? 5 : rel < 0.35 ? 4 : 2;
        if ((y + (x >> 1)) % 4 === 0) i -= 1;
        if (hash2(x, y, 1145) < 0.1) i -= 1;
        p.px(x, y, THATCH[clampI(i, 7)]);
      }
    }
    for (let x = cx - 23; x <= cx + 23; x++) { const l = 1 + Math.round(hash2(x, 1, 1146) * 2); for (let k = 0; k < l; k++) p.px(x, 15 + k, THATCH[k ? 1 : 2]); if (hash2(x, 2, 1147) < 0.2) p.px(x, 13, MOSS[5]); }
    p.rect(cx - 2, 0, 5, 1, THATCH[6]);
    // Laterne
    const lx = 34, ly = 17;
    p.line(lx + 1, 15, lx + 1, ly - 1, IRON[2]); p.rect(lx - 1, ly, 5, 1, IRON[2]); p.rect(lx, ly + 1, 3, 4, '#4a4418'); p.px(lx + 1, ly + 2, '#fff0a0'); p.px(lx, ly + 3, '#c8c050'); p.rect(lx - 1, ly + 5, 5, 1, IRON[1]);
    g.rect(lx, ly + 1, 3, 4, '#b0b040'); g.px(lx + 1, ly + 2, '#fff8c0');
  }, {
    ax: 22, box: [-15, -6, 15, 1], light: { dx: 13, dy: -50, radius: 70, color: [220, 220, 120], intensity: 0.8 },
    fine: (f, g) => { fLamp(f, g, 34, 18, 3, 4, ['#4a4418', '#6a6420', '#c8c050', '#f0e080', '#fff8c8']); f.fline(33, 17.25, 37.75, 17.25, IRON[4]); },
  });
}

// ------------------------------------------------------------ Bannerstange (Moorvolk)
function bannerPole() {
  const W = 18, H = 44;
  return mk(W, H, (p) => {
    const bottom = H - 1, x0 = 3;
    mudPatch(p, x0 + 2, bottom - 1, 4, 1, 1151, false);
    pole(p, x0, 5, bottom - 1, 2, ROT.slice(1), 1152);
    // Spitze: Hirschschädel-Fragment
    p.rect(x0 - 1, 1, 4, 3, BONE[3]); p.px(x0 - 1, 1, BONE[4]); p.px(x0, 2, INTERIOR); p.px(x0 + 2, 2, INTERIOR);
    p.line(x0 - 1, 1, x0 - 3, -1 + 1, BONE[3]); p.line(x0 + 2, 1, x0 + 4, 0, BONE[2]);
    // Querholz + zerfetztes Banner (grau-grün)
    p.rect(x0, 6, 13, 2, ROT[4]); p.rect(x0, 6, 13, 1, ROT[6]);
    const bx0 = x0 + 2, bx1 = x0 + 12;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.9);
      const low = 30 + Math.round(fold) - (hash2(x, 0, 1153) < 0.4 ? 4 : 0) - ((x - bx0) % 3 === 2 ? 2 : 0);
      for (let y = 8; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 4; if (y === 8) i = 1;
        if (hash2(x, y, 1154) < 0.05) continue; // Löcher
        p.px(x, y, CLOTH[i]);
      }
      if (hash2(x, 1, 1155) < 0.5) beard(p, x, low + 1, 2, x);
    }
    // gemaltes Geweih (Knochenweiß)
    const ex = Math.round((bx0 + bx1) / 2), ey = 18;
    p.line(ex, ey - 4, ex, ey + 5, BONE[3]);
    p.line(ex, ey - 1, ex - 3, ey - 5, BONE[3]); p.line(ex, ey - 1, ex + 3, ey - 5, BONE[2]);
    p.line(ex, ey + 2, ex - 3, ey - 1, BONE[2]); p.line(ex, ey + 2, ex + 3, ey - 1, BONE[2]);
    p.px(ex - 1, ey + 7, '#6ee89a'); p.px(ex + 1, ey + 7, '#6ee89a');
    // Amulette
    p.line(x0 - 1, 9, x0 - 2, 15, BEARD[3]); p.rect(x0 - 3, 15, 2, 3, BONE[3]); p.px(x0 - 3, 15, BONE[4]);
  }, { ax: 4, box: [-2, -2, 2, 1] });
}

// ------------------------------------------------------------ Großes Lagerfeuer (Moor)
function campfireBig() {
  const W = 36, H = 30;
  const S = MST;
  return mk(W, H, (p, g) => {
    const cx = 18, cy = H - 6;
    mudPatch(p, cx, cy + 1, 16, 4, 1161, false);
    // Fisch-Trockengestell hinten
    p.line(3, cy - 15, 3, cy + 1, ROT[5]); p.line(32, cy - 15, 32, cy + 1, ROT[3]); p.line(2, cy - 14, 33, cy - 14, ROT[5]);
    for (let i = 0; i < 6; i++) { const x = 6 + i * 4; if (x > 14 && x < 22) continue; p.line(x, cy - 13, x, cy - 13 + 1, BEARD[2]); p.rect(x - 1, cy - 11, 2, 5, '#6a6a58'); p.px(x - 1, cy - 11, '#a0a088'); p.px(x, cy - 6, '#3a3a30'); p.px(x - 1, cy - 9, '#4a5040'); }
    // Glutbett
    p.ellipse(cx, cy, 8, 3, '#1a0806');
    for (let i = 0; i < 26; i++) {
      const x = cx + Math.round(Math.cos(i * 2.4) * (i % 7)), y = cy + Math.round(Math.sin(i * 2.4) * (i % 7) * 0.35);
      p.px(x, y, i % 3 === 0 ? EMB[3] : i % 3 === 1 ? EMB[2] : EMB[1]); g.px(x, y, i % 3 === 0 ? EMB[4] : EMB[2]);
    }
    // Scheite
    p.line(cx - 8, cy + 2, cx + 5, cy - 3, ROT[2]); p.line(cx - 8, cy + 1, cx + 5, cy - 4, ROT[5]);
    p.line(cx + 8, cy + 2, cx - 4, cy - 3, ROT[1]); p.line(cx + 8, cy + 1, cx - 4, cy - 4, ROT[4]);
    // Flammen
    for (const [x, y, h] of [[cx - 2, cy - 3, 4], [cx, cy - 4, 6], [cx + 2, cy - 3, 4]]) for (let i = 0; i < h; i++) {
      const c = i === 0 ? EMB[4] : i < h - 2 ? EMB[3] : EMB[2];
      p.px(x + (i % 3 === 2 ? 1 : 0), y - i, c); g.px(x + (i % 3 === 2 ? 1 : 0), y - i, i < 2 ? EMB[5] : EMB[4]);
    }
    // Kessel mit grünem Sud an Kette
    p.line(cx, cy - 14, cx, cy - 9, IRON[2]);
    p.ellipse(cx, cy - 6, 4, 3, IRON[1]); p.rect(cx - 3, cy - 8, 3, 2, IRON[2]); p.px(cx - 3, cy - 8, IRON[4]);
    p.rect(cx - 3, cy - 9, 7, 1, GLG[2]); p.px(cx + 1, cy - 9, GLG[3]); g.rect(cx - 3, cy - 9, 7, 1, GLG[1]); g.px(cx + 1, cy - 9, GLG[3]);
    p.px(cx - 1, cy - 11, GLG[2]); g.px(cx - 1, cy - 11, GLG[2]);
    // Steinring vorn
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = cx + Math.cos(a) * 10, y = cy + Math.sin(a) * 3.8;
      if (Math.sin(a) < -0.2) continue;
      p.ellipse(x, y, 2, 1.4, S[3]); p.px(x - 1, y - 1, S[6]); p.px(x, y - 1, S[5]); if (i % 3 === 0) p.px(x + 1, y - 1, MOSS[5]);
    }
  }, {
    ax: 18, ay: H - 3, box: [-9, -4, 9, 2], light: { dx: 0, dy: -8, radius: 106, color: [255, 160, 80], intensity: 0.95 }, extra: { smoke: { dx: 0, dy: -14, rate: 2 }, embers: { dx: 0, dy: -8, rate: 1.5 } },
    fine: (f, g) => {
      const cx = 18, cy = H - 6;
      const kettle = (x, y) => ((x - cx - 0.5) / 4.5) ** 2 + ((y - cy + 5.5) / 3.4) ** 2 < 1;
      fFlame(f, g, cx - 1.5, cy - 1.5, 4, 1.2, -0.6, kettle); fFlame(f, g, cx + 2.5, cy - 1.5, 3.5, 1.1, 0.6, kettle); fFlame(f, g, cx + 0.5, cy - 1, 5, 1.5, 0.3, kettle);
      for (const [x, y] of [[cx - 5, cy + 1], [cx + 5, cy + 1], [cx - 2, cy + 2], [cx + 3, cy + 2], [cx - 6, cy - 0.5]]) { f.dot(x + 0.25, y + 0.25, EMB[4]); g.dot(x + 0.25, y + 0.25, '#fff0b0'); g.dot(x + 0.75, y + 0.25, EMB[4]); }
      // grüner Sud im Kessel: Glanz und Blasen mit Kern
      f.fline(cx - 2.5, cy - 9 + 0.25, cx - 0.5, cy - 9 + 0.25, GLG[3]); f.dot(cx + 1.25, cy - 9.25, GLG[4]); g.dot(cx + 1.25, cy - 9.25, GLG[4]); g.dot(cx + 1.75, cy - 9.25, GLG[3]);
      f.dot(cx - 0.75, cy - 10.75, GLG[3]); g.dot(cx - 0.75, cy - 10.75, GLG[4]);
      f.fline(cx - 3, cy - 7.75, cx - 2, cy - 7.75, IRON[5]);
    },
  });
}

// ------------------------------------------------------------ Fäulnistotem (Schrein)
// Merkmale der drei Rätsel-Totems: Knochenhaufen, Moospolster, Schlammkruste
function totemBase(p, kind, by) {
  if (kind === 'mud') { for (let x = 1; x < 25; x++) for (let y = by - 3; y <= by; y++) if (hash2(x, y, 1176) < 0.8 - Math.abs(x - 12) / 30) p.px(x, y, MUD[(x + y) % 3 + 1]); }
  if (kind === 'moss') { for (let x = 2; x < 24; x++) for (let y = by - 2; y <= by; y++) if (hash2(x, y, 1177) < 0.7) p.px(x, y, MOSS[2 + ((x * 3 + y) % 3)]); }
}
function totemOverlay(p, g, kind, on, by) {
  if (kind === 'bone') {
    // Schädelhaufen am Fuß, Knochen gekreuzt am Pfahl
    for (const [x, y, s] of [[5, by - 3, 1], [19, by - 2, 0], [9, by - 1, 0], [16, by - 5, 1]]) {
      p.rect(x - 2, y - 2, 4 + s, 3 + s, BONE[3]); p.px(x - 2, y - 2, BONE[4]); p.px(x - 1, y - 1, INTERIOR); p.px(x + 1, y - 1, INTERIOR); p.rect(x - 1, y + 1 + s, 3, 1, BONE[2]);
      if (on) { p.px(x - 1, y - 1, GLG[3]); g.px(x - 1, y - 1, GLG[4]); }
    }
    p.line(7, 30, 18, 36, BONE[3]); p.line(18, 30, 7, 36, BONE[2]); p.px(7, 30, BONE[4]); p.px(18, 30, BONE[4]);
    for (const x of [8, 17]) { p.line(x, 12, x, 18, BEARD[2]); p.rect(x - 1, 18, 2, 3, BONE[3]); }
  } else if (kind === 'moss') {
    // dichtes Moos, Farnwedel, kleine Leuchtpilze
    for (let y = 14; y < by; y++) for (let x = 9; x <= 16; x++) if (hash2(x, y >> 1, 1178) < 0.45) p.px(x, y, MOSS[3 + ((x + y) % 4)]);
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) { p.px(12 + s * (3 + k), by - 4 - Math.round(k * 0.9), MOSS[5]); p.px(12 + s * (3 + k), by - 3 - Math.round(k * 0.9), MOSS[3]); }
    beard(p, 6, 6, 10, 4); beard(p, 19, 5, 12, 5);
    glowShroom(p, on ? g : { px() {}, rect() {} }, 6, by - 4, 1, 2, GLT, 1179);
  } else if (kind === 'mud') {
    // Schlammkruste mit Tropfnasen, Fußabdrücke
    for (let y = 18; y < by; y++) for (let x = 9; x <= 16; x++) if (hash2(x, y >> 2, 1180) < 0.55) p.px(x, y, MUD[2 + ((x + y) % 3 === 0 ? 1 : 0)]);
    for (const x of [9, 12, 15]) for (let y = 18; y < 18 + 4 + (x % 3) * 2; y++) p.px(x, y, MUD[4]);
    for (const [x, y] of [[3, by - 1], [21, by]]) { p.ellipse(x, y, 2, 1, MUD[0]); p.px(x, y, SW[3]); }
    p.ellipse(12, 6, 6, 2, MUD[2]); p.px(10, 5, MUD[4]);
  }
}

// kind: 'rot' (Bestand) | 'bone' Knochentotem | 'moss' Moostotem | 'mud' Schlammtotem (Reihenfolge-Rätsel)
function rotTotem(on, kind = 'rot') {
  const W = 26, H = 46;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 10, x1 = 15;
    mudPatch(p, 12, bottom - 1, 10, 2, 1171);
    totemBase(p, kind, bottom);
    // Pfahl mit Ranken
    for (let y = 14; y < bottom; y++) for (let x = x0; x <= x1; x++) {
      const rel = (x - x0) / (x1 - x0);
      let i = rel < 0.2 ? 5 : rel < 0.55 ? 4 : rel < 0.85 ? 3 : 2;
      if (hash2(x, y >> 1, 1172) < 0.12) i--;
      p.px(x, y, ROT[clampI(i, 7)]);
    }
    for (let y = 16; y < bottom; y++) { const x = x0 + Math.round((Math.sin(y * 0.5) + 1) * 2.6); p.px(x, y, MOSS[4 + (y % 2)]); if (y % 4 === 0) p.px(x + 1, y - 1, MOSS[6]); }
    // Geschnitzte Fratze
    p.rect(x0, 24, 6, 1, ROT[1]); p.px(x0 + 1, 22, on ? GLG[3] : INTERIOR); p.px(x0 + 4, 22, on ? GLG[3] : INTERIOR); p.rect(x0 + 1, 26, 4, 2, INTERIOR); p.px(x0 + 2, 26, BONE[3]); p.px(x0 + 4, 27, BONE[2]);
    if (on) { g.px(x0 + 1, 22, GLG[4]); g.px(x0 + 4, 22, GLG[4]); g.rect(x0 + 1, 26, 4, 2, GLG[1]); }
    // Hirschschädel mit Geweih oben
    const sx = 12, sy = 6;
    p.rect(sx - 2, sy, 6, 5, BONE[3]); p.rect(sx - 1, sy + 5, 4, 3, BONE[2]); p.px(sx - 2, sy, BONE[4]); p.px(sx - 1, sy, BONE[4]); p.rect(sx - 2, sy + 1, 1, 3, BONE[4]);
    p.px(sx, sy + 8, BONE[1]); p.px(sx + 2, sy + 7, BONE[1]);
    const eyes = [[sx - 1, sy + 2], [sx + 2, sy + 2]];
    for (const [x, y] of eyes) { p.rect(x, y, 1, 2, on ? GLG[4] : INTERIOR); if (on) { g.px(x, y, GLG[4]); g.px(x, y + 1, GLG[3]); g.px(x, y + 2, GLG[1]); } }
    const antler = (s, c) => {
      const bx = s < 0 ? sx - 2 : sx + 3;
      p.line(bx, sy + 1, bx + s * 4, sy - 2, c); p.line(bx + s * 4, sy - 2, bx + s * 6, sy - 6, c);
      p.line(bx + s * 2, sy - 1, bx + s * 2, sy - 4, c); p.line(bx + s * 4, sy - 2, bx + s * 8, sy - 3, c); p.line(bx + s * 5, sy - 4, bx + s * 5, sy - 6, c);
    };
    antler(-1, BONE[3]); antler(1, BONE[2]);
    // Moosbärte am Geweih, Schnüre mit Knöchelchen
    beard(p, sx - 7, sy - 2, 7, 1); beard(p, sx + 9, sy - 2, 9, 2); beard(p, sx - 4, sy + 1, 4, 3);
    p.line(x1 + 1, 16, x1 + 4, 22, BEARD[3]); p.rect(x1 + 3, 22, 2, 2, BONE[3]); p.px(x1 + 3, 22, BONE[4]);
    // Pilze am Fuß
    glowShroom(p, on ? g : { px() {}, rect() {} }, x0 - 3, bottom - 1, 2, 3, on ? GLG : ['#1a1a14', '#2a2a20', '#3a3a2c', '#4a4a3a', '#5a5a48'], 1173);
    glowShroom(p, on ? g : { px() {}, rect() {} }, x1 + 4, bottom, 1, 2, on ? GLG : ['#1a1a14', '#2a2a20', '#3a3a2c', '#4a4a3a', '#5a5a48'], 1174);
    // Sporenwolke (aktiv)
    if (on) for (let k = 0; k < 10; k++) { const x = 4 + Math.round(hash2(k, 0, 1175) * 18), y = 2 + Math.round(hash2(k, 1, 1175) * 26); p.px(x, y, GLG[3]); g.px(x, y, k % 3 ? GLG[3] : GLG[4]); }
    totemOverlay(p, g, kind, on, bottom);
  }, {
    ax: 12, box: [-5, -3, 5, 1], light: on ? { dx: 0, dy: -24, radius: 76, color: [120, 240, 150], intensity: 0.85 } : undefined,
    fine: (f, g) => {
      // Schädel: Stirnlicht, Nasenloch, Augenhöhlen (aktiv mit heißem Kern), Geweih mit Lichtgrat
      const sx = 12, sy = 6;
      f.fline(sx - 1.75, sy + 0.25, sx + 2.75, sy + 0.25, BONE[4]); f.dot(sx + 0.75, sy + 4.25, INTERIOR); f.dot(sx + 0.75, sy + 4.75, BONE[1]);
      f.fline(sx - 0.75, sy + 7.25, sx + 2.75, sy + 7.25, BONE[1]);
      for (const ex of [sx - 1, sx + 2]) { if (on) { fEye(f, g, ex, sy + 2, GLG); g.dot(ex + 0.25, sy + 3.25, GLG[3]); } else f.dot(ex + 0.25, sy + 2.25, '#000000'); }
      f.fline(sx - 2, sy + 0.75, sx - 5.5, sy - 2.25, BONE[4]); f.fline(sx - 6, sy - 2.5, sx - 7.5, sy - 5.5, BONE[4]); f.dot(sx - 9.75, sy - 2.75, BONE[4]);
      // Fratze: Kerbkanten und Augen
      f.fline(10, 24.25, 15.75, 24.25, ROT[0]); f.fline(10, 23.75, 15.75, 23.75, ROT[5]);
      if (on) { fEye(f, g, 11, 22, GLG); fEye(f, g, 14, 22, GLG); g.fline(11.25, 26.75, 14.75, 26.75, GLG[2]); }
    },
  });
}

// ------------------------------------------------------------ Umgestürzter Wagen (aufhebbar)
function caravanWreck() {
  const W = 46, H = 32;
  return mk(W, H, (p) => {
    const by = H - 1;
    mudPatch(p, 23, by - 1, 21, 3, 1181);
    // gebrochenes Rad liegt flach im Schlamm (hinten rechts)
    p.ellipse(37, by - 5, 7, 2.6, ROT[1]); p.ellipse(37, by - 5, 6, 1.8, ROT[4]); p.ellipse(37, by - 5, 4.5, 1.2, MUD[1]);
    for (let i = 0; i < 8; i++) { if (i === 2 || i === 5) continue; const a = (i / 8) * Math.PI * 2; p.line(37, by - 5, 37 + Math.cos(a) * 5, by - 5 + Math.sin(a) * 1.6, ROT[3]); }
    // Wagenkasten, nach vorn in den Schlamm gekippt (Parallelogramm)
    const box = [[6, 9], [34, 3], [36, 14], [8, by - 5]];
    poly(p, box, (x, y) => {
      const t = (x - 6) / 30, rowY = y - (9 - t * 6);
      const lx = Math.floor(rowY) % 4;
      let i = lx === 0 ? 1 : lx === 1 ? 5 : 3;
      if (x < 10) i += 1;
      if (hash2(x, y, 1182) < 0.1) i -= 1;
      if (hash2(x >> 2, Math.floor(rowY) >> 2, 1185) < 0.12) return INTERIOR; // eingebrochene Bretter
      return ROT[clampI(i, 7)];
    });
    // Oberkante (Bordwand) und Beschläge
    p.line(6, 9, 34, 3, ROT[6]); p.line(6, 8, 34, 2, ROT[4]);
    p.line(34, 3, 36, 14, ROT[1]); p.line(8, by - 5, 36, 14, ROT[0]);
    for (const x of [12, 22, 31]) { const y = Math.round(9 - ((x - 6) / 30) * 6); p.line(x, y, x + 1, y + 10, IRON[1]); p.px(x, y + 1, IRON[3]); }
    // Vorderrad aufrecht links, halb im Schlamm
    const wx = 10, wy = by - 7;
    p.ellipse(wx, wy, 7, 7, ROT[1]); p.ellipse(wx, wy, 6, 6, ROT[4]); p.ellipse(wx, wy, 5, 5, INTERIOR);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.line(wx, wy, wx + Math.cos(a) * 5, wy + Math.sin(a) * 5, i < 4 ? ROT[3] : ROT[4]); }
    p.ellipse(wx, wy, 1.5, 1.5, ROT[5]); p.px(wx, wy, IRON[3]);
    for (let i = 0; i < 6; i++) { const a = Math.PI + 0.3 + i * 0.25; p.px(wx + Math.round(Math.cos(a) * 7), wy + Math.round(Math.sin(a) * 7), ROT[6]); }
    for (let x = wx - 7; x <= wx + 7; x++) for (let y = by - 2; y <= by; y++) if (hash2(x, y, 1186) < 0.8) p.px(x, y, MUD[2 + (y === by - 2 ? 1 : 0)]);
    // Plane zerrissen, hängt ins Wasser
    poly(p, [[34, 3], [43, 9], [42, by - 4], [36, 14]], (x, y) => ((x + y) % 4 === 0 ? CLOTH[1] : hash2(x, y, 1183) < 0.18 ? null : CLOTH[3]));
    p.line(34, 3, 43, 9, CLOTH[4]);
    // Ladung: Sack, Fass, Kiste
    p.ellipse(22, by - 2, 4, 2.4, '#5a5238'); p.ellipse(21, by - 3, 2.5, 1.4, '#7a6e4a'); p.px(25, by - 1, '#e0d8a0'); p.px(26, by - 1, '#c0b880');
    p.ellipse(31, by - 2, 3, 2.4, ROT[3]); p.rect(28, by - 3, 7, 1, IRON[2]); p.px(29, by - 3, IRON[4]); p.ellipse(31, by - 2, 1.4, 1.2, ROT[1]);
    // Moos und Moosbart
    for (let x = 6; x <= 34; x++) if (hash2(x, 2, 1184) < 0.35) p.px(x, Math.round(9 - ((x - 6) / 30) * 6) - 1, MOSS[5]);
    beard(p, 18, 8, 5, 3); beard(p, 27, 6, 6, 5);
    // Goldmünzen glänzen (Hinweis: aufhebbar)
    p.px(17, by - 1, GOLD[4]); p.px(18, by - 1, GOLD[2]); p.px(20, by, GOLD[3]);
    for (let i = 0; i < 5; i++) blade(p, 3 + i * 9, by, 3 + (i % 3), i % 2 ? 1 : -1, REED, 1, 4);
  }, { ax: 23, box: [-16, -5, 16, 1] });
}

// ------------------------------------------------------------ Halb versunkene Häuser
function sunkenHouse(v) {
  const W = 56, H = 48;
  return mk(W, H, (p, g) => {
    const by = H - 1, waterY = by - 8;
    const tilt = v === 0 ? 0.08 : -0.12;
    // Wasser vorn
    for (let y = waterY; y <= by; y++) for (let x = 1; x < W - 1; x++) {
      const e = Math.abs(x - 28) / 27 + (y - waterY) / 18;
      if (e > 1.05 + hash2(x, y, 1191 + v) * 0.1) continue;
      p.px(x, y, (y === waterY || Math.sin(x * 0.45 + y * 1.3) > 0.88) ? SW[3] : SW[2]);
    }
    const x0 = 6, x1 = 46, wTop = v === 0 ? 18 : 12;
    const yOff = (x) => Math.round((x - 26) * tilt);
    // Mauerwerk (Quader) bis zur Wasserlinie
    for (let x = x0; x <= x1; x++) for (let y = wTop + yOff(x); y < waterY + 1; y++) {
      const yy = y - yOff(x);
      const row = Math.floor((yy - wTop) / 4), lx = (x - x0 + (row % 2) * 3) % 7, ly = (yy - wTop) % 4;
      let c = MST[3];
      if (ly === 0 || lx === 0) c = MST[1]; else if (ly === 1) c = MST[4];
      if (x < x0 + 3) c = ly === 0 || lx === 0 ? MST[2] : MST[5];
      if (hash2(x, y, 1192 + v) < 0.07) c = MST[2];
      // Bruchkante oben
      const brk = v === 1 ? Math.round(Math.abs(Math.sin(x * 0.31)) * 5 + (x > 30 ? (x - 30) * 0.5 : 0)) : 0;
      if (yy < wTop + brk) continue;
      if (yy === wTop + brk && v === 1) c = MST[5];
      p.px(x, y, c);
    }
    // Nässe/Algen unten
    for (let x = x0; x <= x1; x++) { const h = 3 + Math.round(hash2(x, 0, 1193) * 5); for (let y = waterY - h; y < waterY; y++) if (hash2(x, y, 1194) < 0.7) p.px(x, y, MOSS[y > waterY - 3 ? 1 : 2 + (hash2(x, y, 1195) < 0.3 ? 1 : 0)]); }
    if (v === 0) {
      // Giebeldach, eingesunken, mit Loch
      const apex = [26, 2 + yOff(26)];
      poly(p, [[x0 - 3, wTop + yOff(x0) + 1], [apex[0], apex[1]], [x1 + 3, wTop + yOff(x1) + 1]], (x, y) => {
        if (hash2(x >> 1, y >> 1, 1196) < 0.1 && x > 30 && x < 38 && y > 8) return INTERIOR;
        const left = x < apex[0];
        let i = left ? 4 : 2; if ((y + (x >> 1)) % 3 === 0) i -= 1; if (hash2(x, y, 1197) < 0.1) i--;
        return (hash2(x >> 2, y >> 1, 1198) < 0.35 ? MOSS : THATCH)[clampI(i, 7)];
      });
      p.line(x0 - 3, wTop + yOff(x0) + 1, apex[0], apex[1], THATCH[6]);
      // Dachbalken ragen heraus
      for (let i = 0; i < 3; i++) p.line(31 + i * 3, 8 + i * 2, 33 + i * 3, 5 + i * 2, ROT[3 + (i % 2)]);
      // Fenster mit Grünlicht (Irrlicht)
      p.rect(14, 27, 5, 6, INTERIOR); p.rect(13, 26, 7, 1, MST[5]); p.px(16, 29, GLG[3]); g.px(16, 29, GLG[4]); g.px(15, 30, GLG[2]); g.px(17, 30, GLG[2]);
      // Tür halb unter Wasser
      p.rect(30, 30, 8, waterY - 29, INTERIOR); p.rect(29, 29, 10, 1, MST[5]); p.rect(29, 30, 1, waterY - 29, MST[5]);
    } else {
      // Rundturmstumpf mit Fensterbogen und herabgestürztem Stein
      p.rect(20, 22, 6, 8, INTERIOR); p.ellipse(23, 22, 3, 2.4, INTERIOR); p.px(20, 21, MST[5]); p.px(26, 21, MST[5]); p.px(23, 19, MST[6]);
      p.px(23, 25, GLV[3]); g.px(23, 25, GLV[4]); g.px(22, 26, GLV[2]); g.px(24, 26, GLV[2]);
      shadeLump(p, 49, waterY, 4, 2.6, MST.slice(1), 1199, { rough: 0.2 });
      shadeLump(p, 4, waterY + 1, 3, 2, MST.slice(1), 1200, { rough: 0.2 });
      // Wurzeln/Ranken über die Bruchkante
      for (let i = 0; i < 4; i++) { const x = 10 + i * 9; beard(p, x, wTop + 3 + yOff(x) + Math.round(Math.abs(Math.sin(x * 0.31)) * 5), 6 + (i % 3) * 3, i); }
    }
    // Schilf vorne
    for (let i = 0; i < 6; i++) { const x = 2 + i * 2 + (i > 2 ? 38 : 0); blade(p, x, by - 3, 6 + (i % 3) * 2, i % 2 ? 1 : -1, REED, 1, 4); }
  }, { ax: 28, extra: { boxes: v === 0 ? [[-22, -14, 20, -6]] : [[-22, -14, 20, -6]] } });
}

// ------------------------------------------------------------ Sporenschlund (Eingang)
function sporeGate() {
  const W = 84, H = 64;
  return mk(W, H, (p, g) => {
    const by = H - 1, cx = 42;
    if (p.fine) { sporeGateFine(p, g, W, H); return; }
    mudPatch(p, cx, by - 2, 40, 3, 1211, false);
    // Felsmassiv
    const top = shadeLump(p, cx, by - 20, 40, 26, MST.slice(0, 7), 1212, { rough: 0.1, flat: 0.5, noise: 0.14, rim: MST[3] });
    mossCap(p, top, 3, 1213);
    // Felsspalten
    for (const [x, y, l] of [[12, by - 30, 10], [70, by - 26, 9], [22, by - 14, 6]]) for (let i = 0; i < l; i++) p.px(x + Math.round(Math.sin(i) * 1), y + i, MST[0]);
    // Pilzmaul: fleischige Lippen, Lamellen-Zähne, schwarzer Schlund
    const mcx = cx, mcy = by - 14, mrx = 17, mry = 14;
    // äußere Lippe
    for (let y = mcy - mry - 3; y <= by; y++) for (let x = mcx - mrx - 4; x <= mcx + mrx + 4; x++) {
      const dx = (x - mcx) / (mrx + 4), dy = (y - mcy) / (mry + 3);
      const d = dy > 0 ? Math.abs(dx) : Math.hypot(dx, dy);
      if (d > 1) continue;
      const l = -dx * 0.5 - (dy < 0 ? dy : 0) * 0.7;
      let i = clampI(Math.round(2.5 + l * 2.5 + (bayer(x, y) - 0.5)), 6);
      p.px(x, y, FLESH[i]);
    }
    // Lamellen (radiale Rippen)
    for (let y = mcy - mry; y <= by; y++) for (let x = mcx - mrx; x <= mcx + mrx; x++) {
      const dx = (x - mcx) / mrx, dy = (y - mcy) / mry;
      const d = dy > 0 ? Math.abs(dx) : Math.hypot(dx, dy);
      if (d > 1) continue;
      const a = Math.atan2(y - mcy, x - mcx);
      const rib = Math.abs(Math.sin(a * 9)) > 0.75;
      p.px(x, y, rib ? (x < mcx ? FLESH[4] : FLESH[3]) : FLESH[1]);
      if (d < 0.72) p.px(x, y, d < 0.6 ? INTERIOR : (rib ? FLESH[2] : '#120a10'));
    }
    // Zahnartige Pilzspitzen am Rand der Öffnung
    for (let k = 0; k < 11; k++) {
      const a = Math.PI + (k / 10) * Math.PI, x = Math.round(mcx + Math.cos(a) * mrx * 0.72), y = Math.round(mcy + Math.sin(a) * mry * 0.72);
      const dx = Math.round(-Math.cos(a) * 2), dy = Math.round(-Math.sin(a) * 2);
      p.px(x, y, '#d8c8b8'); p.px(x + dx, y + dy, '#a89888'); p.px(x + Math.round(dx * 1.5), y + Math.round(dy * 1.5), '#786a60');
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const x = mcx + s * Math.round(mrx * 0.7), y = mcy + 3 + k * 4; p.px(x, y, '#d8c8b8'); p.px(x - s, y, '#a89888'); p.px(x - 2 * s, y, '#786a60'); }
    // Leuchten tief im Schlund
    for (let y = mcy - 4; y <= by - 2; y++) for (let x = mcx - 7; x <= mcx + 7; x++) if ((x + y) % 3 === 0 && Math.hypot((x - mcx) / 8, (y - mcy - 4) / 10) < 1) { p.px(x, y, GLV[0]); g.px(x, y, GLV[1]); }
    g.px(mcx, mcy + 2, GLV[3]); g.px(mcx - 2, mcy + 5, GLV[2]); g.px(mcx + 2, mcy + 4, GLV[2]);
    // Riesenpilze auf dem Fels
    const cap = (x, y, r, G) => {
      for (let k = 0; k < Math.round(r * 1.6); k++) { p.px(x, y - k, '#a8a894'); p.px(x + 1, y - k, '#707060'); }
      const cy = y - Math.round(r * 1.6);
      shadeLump(p, x + 0.5, cy, r, r * 0.55, [G[0], G[1], G[2], G[2], G[3]], x * 7 + y, { rough: 0.04, keep: (xx, yy) => yy <= cy + 1 });
      for (let xx = -r + 1; xx <= r; xx++) { p.px(x + xx, cy + 1, G[2]); g.px(x + xx, cy + 1, G[3]); }
      for (let k = 0; k < r; k++) { const xx = x + Math.round((hash2(k, x, 1214) - 0.5) * r * 1.5), yy = cy - Math.round(hash2(k, y, 1214) * r * 0.4); p.px(xx, yy, G[4]); g.px(xx, yy, G[4]); }
    };
    cap(20, by - 36, 7, GLV); cap(30, by - 42, 5, GLT); cap(60, by - 38, 8, GLV); cap(70, by - 30, 4, GLG); cap(12, by - 22, 3, GLT);
    // Kleine Pilze am Fuß
    for (const [x, G] of [[8, GLT], [18, GLV], [66, GLG], [76, GLT]]) glowShroom(p, g, x, by - 1, 1, 2, G, x);
    // Sporen
    for (let k = 0; k < 18; k++) { const x = 6 + Math.round(hash2(k, 0, 1215) * 72), y = 2 + Math.round(hash2(k, 1, 1215) * 30); g.px(x, y, k % 3 ? GLV[3] : GLT[3]); if (k % 4 === 0) p.px(x, y, GLV[3]); }
  }, {
    ax: 42,
    light: { dx: 0, dy: -18, radius: 84, color: [190, 110, 255], intensity: 0.7 },
    extra: { boxes: [[-40, -14, -15, 1], [15, -14, 40, 1], [-15, -40, 15, -24]], door: { dx: 0, dy: -3 } }, b: true,
  });
}

// Stufe B: Felsmassiv in harten Stufen mit eingebetteten Brocken und Spalten, dickes Moospolster, Pilzmaul mit
// gestufter Lippe, feinen Lamellen-Rippen und Zähnen, Schlund mit gestuftem Leuchten (heißer Kern), Riesenpilze fein.
function sporeGateFine(p, g, W, H) {
  const by = H - 1, cx = 42, X = cx + 0.5;
  fMud(p, cx, by - 2, 40, 3, 1211, false);
  const RP = MST.slice(0, 7);
  boulder(p, X, by - 19.5, 40, 26, RP, 1212, { lo: 1, hi: 6, bias: 0.02, rough: 0.1, flat: 0.5, rimC: MST[3] });
  // eingebettete Brocken (eigenes Licht, dunkle Fuge unten rechts)
  const inRock = (x, y) => { const dx = (x - X) / 40, dy = (y - by + 19.5) / 26; return dx * dx + dy * dy < 0.8; };
  for (const [x, y, rx, ry, sd] of [[10, by - 16, 5, 3.6, 1], [20, by - 30, 6, 4, 2], [66, by - 22, 6.5, 4.4, 3], [74, by - 12, 4.5, 3.2, 4], [56, by - 36, 5, 3.4, 5], [8, by - 5, 4, 2.6, 6], [76, by - 4, 4, 2.6, 7], [32, by - 40, 4.5, 3, 8]]) {
    if (!inRock(x, y)) continue;
    p.each(x - rx, y - ry, x + rx + 1, y + ry + 1, (xx, yy) => { const nx = (xx - x - 0.6) / rx, ny = (yy - y - 0.6) / ry; return nx * nx + ny * ny <= 1 && nx + ny > 0.4 ? MST[1] : null; });
    boulder(p, x, y, rx, ry, RP, 1230 + sd, { lo: 2, hi: 6, bias: -0.08, rough: 0.15, flat: 0.15 });
  }
  const top = fTop(p, 0, W, 0, by - 10);
  fMossCap(p, top, 3.6, 1213);
  for (const [x, y, l] of [[12, by - 30, 10], [70, by - 26, 9], [22, by - 14, 6]]) {
    for (let i = 0; i < l; i += 0.5) { const xx = x + 0.5 + Math.sin(i) * 1; p.dot(xx, y + i, MST[0]); p.dot(xx + 0.5, y + i, MST[4]); }
  }
  // Pilzmaul: äußere Lippe in Stufen
  const mcx = X, mcy = by - 13.5, mrx = 17, mry = 14;
  const F = pal32(FLESH), SW_ = (x, y, rx, ry) => { const dx = (x - mcx) / rx, dy = (y - mcy) / ry; return [dx, dy, dy > 0 ? Math.abs(dx) : Math.hypot(dx, dy)]; };
  p.scan(mcx - mrx - 4, mcy - mry - 3, mcx + mrx + 4, by + 1, (x, y) => {
    const [dx, dy, d] = SW_(x, y, mrx + 4, mry + 3);
    if (d > 1 || y > by + 1) return 0;
    if (d > 0.93) return F[dx < -0.3 && dy < 0.2 ? 2 : 1];
    const l = -dx * 0.5 - (dy < 0 ? dy : 0) * 0.7;
    return F[clampI(Math.floor(2.5 + l * 2.5), 6)];
  });
  // Lamellen (radiale Rippen) und Schlund
  const ribA = (x, y) => Math.abs(Math.sin(Math.atan2(y - mcy, x - mcx) * 9));
  const [i0, i1] = pal32([INTERIOR, '#120a10']);
  p.scan(mcx - mrx, mcy - mry, mcx + mrx, by + 1, (x, y) => {
    const [, , d] = SW_(x, y, mrx, mry);
    if (d > 1 || y > by + 1) return 0;
    const r = ribA(x, y);
    if (d < 0.6) return i0;
    if (d < 0.72) return r > 0.8 ? F[2] : i1;
    if (r > 0.75) return r > 0.93 && d < 0.95 ? F[5] : x < mcx ? F[4] : F[3];
    return d > 0.96 ? F[0] : F[1];
  });
  // Zähne: spitze Kegel zum Schlund, Lichtseite oben links
  const tooth = (x, y, ux, uy, len) => {
    const nx = -uy, ny = ux, b = 0.9;
    fpoly(p, [[x + nx * b, y + ny * b], [x + ux * len, y + uy * len], [x - nx * b, y - ny * b]], (xx, yy) => {
      const t = ((xx - x) * ux + (yy - y) * uy) / len, side = (xx - x) * nx + (yy - y) * ny;
      return t > 0.65 ? '#786a60' : side * (nx + ny) < 0 ? '#d8c8b8' : '#a89888';
    });
  };
  for (let k = 0; k < 11; k++) {
    const a = Math.PI + (k / 10) * Math.PI, x = mcx + Math.cos(a) * mrx * 0.74, y = mcy + 0.5 + Math.sin(a) * mry * 0.74;
    tooth(x, y, -Math.cos(a), -Math.sin(a), 2.6);
  }
  for (const s2 of [-1, 1]) for (let k = 0; k < 3; k++) tooth(mcx + s2 * mrx * 0.72, mcy + 3.5 + k * 4, -s2, 0, 2.4);
  // Leuchten tief im Schlund: gestufte Ringe, heißer Kern
  const gx = mcx, gyc = mcy + 4.5;
  p.each(gx - 8, gyc - 10, gx + 8, by + 1, (x, y) => {
    const d = Math.hypot((x - gx) / 8, (y - gyc) / 10);
    if (d >= 1 || y > by + 1) return null;
    return d < 0.22 ? GLV[1] : d < 0.55 || Math.floor(y * 2) % 2 ? GLV[0] : null;
  });
  g.each(gx - 8, gyc - 10, gx + 8, by + 1, (x, y) => {
    const d = Math.hypot((x - gx) / 8, (y - gyc) / 10);
    if (d >= 1 || y > by + 1) return null;
    return d < 0.08 ? GLV[4] : d < 0.22 ? GLV[3] : d < 0.4 ? GLV[2] : d < 0.55 || Math.floor(y * 2) % 2 ? GLV[1] : null;
  });
  // Riesenpilze auf dem Fels, kleine am Fuß
  for (const [x, y, r, G] of [[20, by - 36, 7, GLV], [30, by - 42, 5, GLT], [60, by - 38, 8, GLV], [70, by - 30, 4, GLG], [12, by - 22, 3, GLT]]) fShroom(p, g, x, y, r, Math.round(r * 1.6), G, x * 7 + y);
  for (const [x, G] of [[8, GLT], [18, GLV], [66, GLG], [76, GLT]]) fShroom(p, g, x, by - 1, 1, 2, G, x);
  for (let k = 0; k < 18; k++) {
    const x = 6 + Math.round(hash2(k, 0, 1215) * 72) + 0.25, y = 2 + Math.round(hash2(k, 1, 1215) * 30) + 0.25, G = k % 3 ? GLV : GLT;
    g.dot(x, y, G[4]); g.dot(x + 0.5, y, G[2]); g.dot(x, y + 0.5, G[2]);
    if (k % 4 === 0) p.dot(x, y, G[3]);
  }
}

// ------------------------------------------------------------ Laternenpfahl
function lanternPost() {
  const W = 16, H = 38;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 4;
    mudPatch(p, x0 + 1, bottom - 1, 4, 1, 1221, false);
    pole(p, x0, 2, bottom - 1, 2, ROT.slice(1), 1222);
    for (let y = bottom - 8; y < bottom; y++) if (hash2(x0, y, 1223) < 0.6) p.px(x0, y, MOSS[4]);
    // Galgenarm
    p.rect(x0, 3, 9, 2, ROT[4]); p.rect(x0, 3, 9, 1, ROT[6]); p.line(x0 + 2, 9, x0 + 6, 5, ROT[3]);
    beard(p, x0 + 4, 5, 5, 3);
    // Laterne
    const lx = x0 + 7, ly = 8;
    p.line(lx + 1, 5, lx + 1, ly - 1, IRON[2]);
    p.rect(lx - 1, ly, 5, 1, IRON[3]); p.px(lx + 1, ly - 1, IRON[4]);
    p.rect(lx - 1, ly + 1, 5, 5, IRON[1]); p.rect(lx, ly + 1, 3, 5, '#6a6420'); p.px(lx + 1, ly + 2, '#fff4a8'); p.px(lx + 1, ly + 3, '#f0e070'); p.px(lx, ly + 4, '#c8b848'); p.px(lx + 2, ly + 4, '#a89830');
    p.rect(lx - 1, ly + 6, 5, 1, IRON[2]); p.px(lx + 1, ly + 7, IRON[1]);
    g.rect(lx, ly + 1, 3, 5, '#a8a040'); g.px(lx + 1, ly + 2, '#fffad0'); g.px(lx + 1, ly + 3, '#fff0a0');
    // Nachtfalter
    p.px(lx + 4, ly - 2, '#8a8a70'); g.px(lx + 4, ly - 2, '#403c20');
  }, {
    ax: 5, box: [-2, -2, 2, 1], light: { dx: 6, dy: -30, radius: 64, color: [230, 220, 130], intensity: 0.8 },
    fine: (f, g) => { fLamp(f, g, 11, 9, 3, 5); f.fline(10, 8.25, 14.75, 8.25, IRON[4]); f.dot(12.25, 7.25, IRON[5]); f.fline(10, 15.25, 14.75, 15.25, IRON[3]); },
  });
}

// ============================================================ Runde 5: Inselarchipel
// Bohlenstege, Furten, Dammufer, Wasserdeko, Riesenpilze, Hexenhütte.
//
// Bohlen und Furten liegen flach über dem Wasser. Damit der Held nie von den
// Brettern überdeckt wird, zeichnet jede begehbare Bohlenzelle nur ab ihrem
// Ankerpunkt nach unten (16 px bis zum Anker der nächsten Zeile); die oberste
// Bohlenreihe stammt von einer festen Trägerzelle im Wasser darüber
// ('deckCarrier*', mit Geländerpfosten). Flache Teile ohne Umriss (flat()).

const PLANK = lift(['#0e0d0b', '#191713', '#25221b', '#322d23', '#40392c', '#4f4635', '#615643', '#776a52'], 1.2);
const SILT = ['#2a2c20', '#3a3c2a', '#4e4e36'];

// Flaches Sprite ohne Umriss; Leuchtebene in Sprite-Größe (Anker gleich). Mit up (oder fine) im Feinraster ×2 mit Scale2x
// (Rand geklemmt, damit gekachelte Bohlen an den Zellkanten keine Kerben bekommen), frame.res = 2; Leuchtebene ebenso.
// fine(f, g): optionale feine Zusätze (DecoCanvas über dem hochskalierten Bild, g.dot fein).
function scale2xClamp(sd, w, h) {
  const od = new Uint32Array(w * h * 4), W2 = w * 2;
  const at = (x, y) => { const v = sd[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]; return (v >>> 24) > 40 ? v : 0; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const E = sd[y * w + x];
    let e0 = E, e1 = E, e2 = E, e3 = E;
    const B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), Hh = at(x, y + 1);
    if (B !== Hh && D !== F) { if (D === B) e0 = D; if (B === F) e1 = F; if (D === Hh) e2 = D; if (Hh === F) e3 = F; }
    const o = y * 2 * W2 + x * 2;
    od[o] = e0; od[o + 1] = e1; od[o + W2] = e2; od[o + W2 + 1] = e3;
  }
  return od;
}
function flat(W, H, ax, ay, draw, extra = null, fine = null, up = !!fine) {
  const p = new PixelCanvas(W, H);
  let gl = null;                            // Leuchtebene erst bei Bedarf
  const G = () => (gl ??= new PixelCanvas(W, H));
  const g = { px: (x, y, c) => G().px(x, y, c), rect: (x, y, w, h, c) => G().rect(x, y, w, h, c) };
  draw(p, g);
  const used = !!gl, res = fineRes();
  let e;
  if (res === 1 || !up) {
    e = { sprite: new SpriteFrame(p.canvas, ax, ay) };
    if (used) e.glow = gl.canvas;
  } else {
    let d = scale2xClamp(canvasPixels(p.canvas), W, H), gd = used ? scale2xClamp(canvasPixels(gl.canvas), W, H) : null;
    if (fine) {
      const f = new DecoCanvas(W, H, res), gf = new DecoCanvas(W, H, res);
      f.buf = d; if (gd) gf.buf = gd;
      let gu = false;
      fine(f, { fine: true, dot: (x, y, c) => { gu = true; gf.dot(x, y, c); }, each: (...a) => { gu = true; gf.each(...a); }, fline: (...a) => { gu = true; gf.fline(...a); } });
      d = f.pixels(); if (gu || gd) gd = gf.pixels();
    }
    e = { sprite: new SpriteFrame(pixelsToCanvas(d, W * res, H * res), ax * res, ay * res, res) };
    if (gd) e.glow = pixelsToCanvas(gd, W * res, H * res);
  }
  if (extra) Object.assign(e, extra);
  return e;
}
// Teilzeichnung mit 1-px-Umriss in ein flaches Sprite übernehmen
function outlined(p, W, H, draw) {
  const t = new PixelCanvas(W, H);
  draw(t);
  p.ctx.drawImage(outlineCanvas(t.canvas), -1, -1);
}
// Mondlicht-Kante: oberstes Pixel jeder Spalte (und linke Kanten) aufhellen
function rimLight(q, W, H, col, colL = col) {
  const d = q.ctx.getImageData(0, 0, W, H).data, on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 40;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (on(x, y)) { q.px(x, y, col); if (on(x, y + 1) && x < W / 2) q.px(x, y + 1, colL); break; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (on(x, y)) { if (!on(x - 1, y)) q.px(x, y, colL); break; }
}
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
// weiches Wertrauschen (bilinear über hash2) für Nebel, Schlick
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Ein senkrechtes Brett (Ost-West-Steg: Bretter laufen Nord–Süd). x0 = linke Kante, y0..y1
function vBoard(p, x0, y0, y1, seed) {
  const base = 3 + Math.floor(hash2(x0, 0, seed) * 2.2);
  for (let y = y0; y <= y1; y++) {
    for (let i = 0; i < 3; i++) {
      let k = base + (i === 0 ? 1 : i === 2 ? -1 : 0);
      if (hash2(x0 + i, y >> 1, seed + 1) < 0.08) k -= 1;                  // Maserung
      if (hash2(x0 + i, y, seed + 2) < 0.04) k += 1;
      p.px(x0 + i, y, PLANK[clampI(k, PLANK.length)]);
    }
    p.px(x0 + 3, y, PLANK[0]);                                            // Fuge
  }
}
// Stoß (Brettende) mit Nägeln
function vSeam(p, x0, y) { p.rect(x0, y, 3, 1, PLANK[0]); p.px(x0, y - 1, PLANK[6]); p.px(x0 + 2, y + 1, '#8a8a80'); p.px(x0, y + 1, '#5a5a52'); }
function mossPx(p, x, y, seed) { if (hash2(x, y, seed) < 0.5) p.px(x, y, MOSS[3 + (hash2(x, y, seed + 1) * 3 | 0)]); }

// Bohlenfläche einer Zelle ab dem Anker (Ost-West-Bretter)
function deckBoardsInto(p, oy, v, seed) {
  for (let b = 0; b < 4; b++) {
    vBoard(p, b * 4, oy, oy + 15, seed + b * 7);
    if (hash2(b, v, seed) < 0.45) vSeam(p, b * 4, oy + 2 + Math.floor(hash2(b, v, seed + 3) * 11));
  }
  // Moos in den Fugen, nasse Stellen
  for (let k = 0; k < 4; k++) mossPx(p, 3 + 4 * (k % 4), oy + Math.floor(hash2(k, v, seed + 5) * 16), seed + 6 + k);
  if (v === 2) { p.px(6, oy + 7, PLANK[1]); p.px(5, oy + 8, PLANK[1]); p.px(9, oy + 4, '#3a4a30'); }
}
function deckBoards(v) {
  return flat(16, 16, 8, 0, (p) => deckBoardsInto(p, 0, v, 2100 + v * 13));
}
// Letzte Bohlenreihe: Kante, Stützpfahl, Schatten und Spiegelung im Wasser darunter
function deckEdge(v) {
  return flat(16, 15, 8, 0, (p) => {
    for (let b = 0; b < 4; b++) vBoard(p, b * 4, 0, 1, 2140 + v * 5 + b);
    p.rect(0, 2, 16, 1, PLANK[5]); p.rect(0, 3, 16, 1, PLANK[2]); p.rect(0, 4, 16, 1, PLANK[1]); // Randbalken
    for (let x = 0; x < 16; x++) if (hash2(x, 0, 2150 + v) < 0.25) p.px(x, 2, PLANK[6]);
    for (let y = 5; y < 10; y++) p.rect(0, y, 16, 1, rgba(2, 6, 4, 0.5 - (y - 5) * 0.09));     // Schatten auf dem Wasser
    const px = [3, 10, 6][v];
    for (let y = 5; y < 10; y++) { p.px(px, y, PLANK[y < 7 ? 3 : 2]); p.px(px + 1, y, PLANK[1]); }  // Pfahl
    p.px(px - 1, 10, SW[4]); p.px(px + 2, 10, SW[4]); p.px(px, 11, SW[3]); p.px(px + 1, 11, SW[3]);   // Kringel
    for (let y = 11; y < 14; y++) if (y % 2) p.px(px, y, rgba(10, 16, 12, 0.6));               // Spiegelung
    if (v === 1) { p.px(12, 6, MOSS[4]); p.px(12, 7, MOSS[3]); p.px(13, 8, BEARD[2]); }
    if (v === 2) { p.px(13, 11, SW[5]); p.px(14, 11, SW[4]); }
  });
}
// Trägerzelle im Wasser über der ersten Bohlenreihe: Geländer (Pfosten + Seil) und die Bretter der Reihe darunter.
// post: Pfosten links; lantern: Laternenpfahl statt Pfosten
function deckCarrier(v, post, lantern = false) {
  const top = lantern ? 30 : 18;           // Pixel über dem Anker
  const W = 16, H = top + 16;
  return flat(W, H, 8, top, (p, g) => {
    const a = top;                         // Ankerzeile im Sprite
    deckBoardsInto(p, a, v, 2160 + v * 11 + (post ? 50 : 0));
    p.rect(0, a, 16, 1, PLANK[2]);         // Nordkante (Stirnholz im Schatten)
    // Seil zwischen den Pfosten (Periode 32 px, Pfosten bei x = 2)
    const off = post ? 0 : 16;
    for (let x = 0; x < 16; x++) {
      const t = (x + off - 2) / 32;
      if (t < 0.04 || t > 1) continue;
      const y = a - 11 + Math.round(Math.sin(Math.PI * t) * 4);
      p.px(x, y, BEARD[2]); if ((x + off) % 3 === 0) p.px(x, y + 1, BEARD[1]);
      if (hash2(x + off, v, 2170) < 0.12) beard(p, x, y + 1, 3 + (x % 3), x);
    }
    if (post || lantern) {
      const ph = lantern ? 28 : 13;
      pole(p, 1, a - ph, a + 2, 2, PLANK.slice(1), 2171 + v);
      p.px(1, a - ph, PLANK[7]); p.px(2, a - ph, PLANK[5]);
      for (let y = a - ph + 3; y < a; y += 4) p.px(1, y, MOSS[4]);
      p.px(1, a - 11, BEARD[3]); p.px(2, a - 10, BEARD[2]);
    }
    if (lantern) {
      // Galgenarm mit Laterne über dem Steg
      p.rect(1, a - 27, 9, 2, PLANK[4]); p.rect(1, a - 27, 9, 1, PLANK[6]); p.line(3, a - 22, 7, a - 26, PLANK[3]);
      const lx = 8, ly = a - 22;
      p.line(lx + 1, a - 25, lx + 1, ly - 1, IRON[2]);
      p.rect(lx - 1, ly, 5, 1, IRON[3]); p.rect(lx - 1, ly + 1, 5, 5, IRON[1]); p.rect(lx, ly + 1, 3, 5, '#6a6420');
      p.px(lx + 1, ly + 2, '#fff4a8'); p.px(lx + 1, ly + 3, '#f0e070'); p.px(lx, ly + 4, '#c8b848'); p.px(lx + 2, ly + 4, '#a89830');
      p.rect(lx - 1, ly + 6, 5, 1, IRON[2]);
      g.rect(lx, ly + 1, 3, 5, '#a8a040'); g.px(lx + 1, ly + 2, '#fffad0'); g.px(lx + 1, ly + 3, '#fff0a0');
      // Lichtfleck auf den Brettern
      for (let y = a + 2; y < a + 9; y++) for (let x = 4; x < 14; x++) if (((x + y) & 1) && Math.hypot(x - 9, (y - a - 5) * 1.6) < 5) p.px(x, y, PLANK[6]);
    }
  }, lantern ? { light: { dx: 1, dy: -16, radius: 66, color: [230, 220, 130], intensity: 0.8 } } : null,
  lantern ? (f, g) => { const ly = top - 22; fLamp(f, g, 8, ly + 1, 3, 5); f.fline(7, ly + 0.25, 11.75, ly + 0.25, IRON[4]); } : null);
}
// Nord-Süd-Steg (1 breit) und breite Gänge: waagrechte Bretter. side: 'one' | 'L' | 'R'
function stegNS(v, post, side = 'one') {
  const W = 22, H = 16, c0 = 3;            // Zelle bei x = 3..18
  return flat(W, H, 11, 0, (p) => {
    const xl = side === 'R' ? c0 : c0 + 1, xr = side === 'L' ? c0 + 15 : c0 + 14;
    // Schatten rechts neben dem Steg (Licht von links oben)
    if (side !== 'L') for (let y = 0; y < 16; y++) { p.px(xr + 1, y, rgba(2, 6, 4, 0.55)); p.px(xr + 2, y, rgba(2, 6, 4, 0.3)); }
    for (let j = 0; j < 4; j++) {
      const y0 = j * 4, s = 2200 + v * 17 + j * 3 + (side === 'R' ? 40 : 0);
      const e0 = side === 'R' ? xl : xl - (hash2(j, v, s) < 0.3 ? 1 : 0), e1 = side === 'L' ? xr : xr + (hash2(j, v, s + 1) < 0.3 ? 1 : 0);
      const base = 3 + Math.floor(hash2(j, v, s + 2) * 2.2);
      for (let x = e0; x <= e1; x++) for (let r = 0; r < 3; r++) {
        let k = base + (r === 0 ? 1 : r === 2 ? -1 : 0);
        if (hash2(x >> 1, y0 + r, s + 3) < 0.08) k -= 1;
        if (side !== 'R' && x === e0) k += 1;
        p.px(x, y0 + r, PLANK[clampI(k, PLANK.length)]);
      }
      p.rect(e0, y0 + 3, e1 - e0 + 1, 1, PLANK[0]);
      if (side !== 'R') { p.px(e0 + 1, y0 + 1, '#6a6a60'); } if (side !== 'L') p.px(e1 - 1, y0 + 1, '#5a5a52');
      if (hash2(j, v, s + 4) < 0.3) mossPx(p, xl + 2 + Math.floor(hash2(j, v, s + 5) * 10), y0 + 3, s + 6);
    }
    if (v === 1) { p.rect(c0 + 6, 9, 3, 2, PLANK[1]); p.px(c0 + 7, 9, '#0a0e0c'); } // abgebrochene Brettecke
    if (post) {
      const sides = side === 'one' ? [c0 - 2, c0 + 16] : side === 'L' ? [c0 - 2] : [c0 + 16];
      for (const x of sides) {
        for (let y = 3; y < 13; y++) { p.px(x, y, PLANK[y < 5 ? 6 : 3]); p.px(x + 1, y, PLANK[y < 5 ? 4 : 1]); }
        p.px(x - 1, 13, SW[4]); p.px(x + 2, 13, SW[4]); p.px(x, 14, SW[3]); p.px(x + 1, 14, SW[3]);
        if (hash2(x, v, 2230) < 0.6) { p.px(x, 6, MOSS[4]); p.px(x, 7, MOSS[3]); }
      }
    }
  });
}
// Furt: Schlick unter Flachwasser, Trittsteine, Kringel
function fordShallows(v) {
  return flat(20, 16, 10, 0, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 2; x < 18; x++) {
      const n = vn((x + v * 5) / 5, y / 4, 2300) * 0.7 + hash2(x, y, 2301 + v) * 0.3;
      if (n < 0.42) continue;
      const c = n > 0.75 ? SILT[2] : n > 0.6 ? SILT[1] : SILT[0];
      if (((x + y) & 1) || n > 0.7) p.px(x, y, c);
    }
    const stones = [[[6, 5, 3, 2], [13, 11, 2.4, 1.6]], [[11, 4, 2.6, 1.8], [5, 12, 2, 1.4]], [[9, 8, 3.4, 2.2]], [[4, 3, 2, 1.4], [12, 8, 2.6, 1.8], [7, 13, 1.8, 1.2]]][v];
    for (const [sx, sy, rx, ry] of stones) {
      p.ellipse(sx + 1, sy + 1, rx + 0.5, ry, rgba(2, 6, 4, 0.55));                       // Wasserlinie/Schatten
      shadeLump(p, sx, sy, rx, ry, MST.slice(2), 2310 + sx * 3 + sy, { rough: 0.15, flat: 0.3 });
      p.px(Math.round(sx - rx + 1), Math.round(sy - ry + 1), MST[7]);
      if (hash2(sx, sy, 2311) < 0.6) p.px(Math.round(sx), Math.round(sy - ry), MOSS[5]);
      p.px(Math.round(sx - rx - 1), Math.round(sy + ry), SW[4]); p.px(Math.round(sx + rx + 1), Math.round(sy + ry), SW[5]);
    }
    for (let k = 0; k < 3; k++) { const x = 3 + Math.floor(hash2(k, v, 2320) * 13), y = 1 + Math.floor(hash2(k, v, 2321) * 14); p.px(x, y, SW[5]); p.px(x + 1, y, SW[4]); }
  }, null, null, true);
}
// Dammufer: Faschinen (Reisigbündel) und Pflöcke an der Böschungskante
function fascine(p, x0, x1, y, seed) {
  for (let x = x0; x <= x1; x++) {
    for (let r = 0; r < 3; r++) {
      let k = r === 0 ? 5 : r === 1 ? 3 : 2;
      if (((x * 3 + r * 5 + seed) % 7) === 0) k -= 2;
      p.px(x, y + r, ROT[clampI(k, 7)]);
    }
    if ((x + seed) % 6 === 0) { p.px(x, y, '#6a6040'); p.px(x, y + 1, '#4a4430'); p.px(x, y + 2, '#3a3424'); } // Bindung
  }
}
function stake(p, x, yTop, yBot) {
  for (let y = yTop; y <= yBot; y++) { p.px(x, y, ROT[y === yTop ? 6 : 4]); p.px(x + 1, y, ROT[y === yTop ? 5 : 2]); }
}
function damBank(v, south) {
  const W = 18, ax = 9;
  if (!south) {
    // Nordböschung: Kante oben an der Zelle (Zelle selbst zeigt Dammerde)
    return flat(W, 15, ax, 18, (p) => {
      for (let x = 0; x < W; x++) if (hash2(x, v, 2400) < 0.5) p.px(x, 0, SW[3]);       // Wasserkante
      fascine(p, 0, W - 1, 3, v * 3);
      for (let x = 1 + v; x < W - 1; x += 5) stake(p, x, hash2(x, v, 2401) < 0.5 ? 0 : 1, 6);
      for (let x = 0; x < W; x++) { p.px(x, 6, MUD[3]); if (hash2(x, v, 2402) < 0.4) p.px(x, 7, MUD[2]); }
      for (let i = 0; i < 3; i++) blade(p, 2 + Math.floor(hash2(i, v, 2403) * 14), 8, 2 + i, i % 2 ? 1 : -1, REED, 1, 4);
    });
  }
  // Südböschung: Kante unten an der Zelle, Pflöcke im Wasser davor
  return flat(W, 14, ax, 6, (p) => {
    for (let x = 0; x < W; x++) { p.px(x, 0, MUD[2]); if (hash2(x, v, 2410) < 0.6) p.px(x, 1, MUD[1]); }
    fascine(p, 0, W - 1, 4, v * 5 + 1);
    for (let x = 0; x < W; x++) p.px(x, 7, PLANK[1]);
    for (let x = 2 + v; x < W - 1; x += 5) { stake(p, x, 2, 9); p.px(x - 1, 10, SW[4]); p.px(x + 2, 10, SW[4]); }
    for (let y = 8; y < 13; y++) for (let x = 0; x < W; x++) if (((x + y) & 1) && hash2(x, y, 2411 + v) < 0.7 - (y - 8) * 0.12) p.px(x, y, rgba(2, 6, 4, 0.45));
    for (let x = 0; x < W; x++) if (hash2(x, v, 2412) < 0.3) p.px(x, 12, SW[4]);
  });
}
// Seitenpflöcke an Nord-Süd-Dämmen (side -1: Damm liegt rechts, Pflöcke am linken Zellrand)
function damStakes(v, side) {
  const W = 10, ax = side < 0 ? 8 : 2;
  return flat(W, 20, ax, 16, (p) => {
    const xs = side < 0 ? [2, 5] : [3, 6];
    for (let y = 0; y < 20; y++) {
      const fx = side < 0 ? 4 : 3;
      p.px(fx, y, ROT[(y + v) % 4 === 0 ? 2 : 4]); p.px(fx + 1, y, ROT[3]); p.px(fx + 2, y, ROT[2]);   // Faschine senkrecht
    }
    for (let y = v * 2; y < 18; y += 6) { const x = xs[(y / 6) & 1]; for (let k = 0; k < 4; k++) { p.px(x, y + k, ROT[k === 0 ? 6 : 4]); p.px(x + 1, y + k, ROT[k === 0 ? 5 : 2]); } }
    const wx = side < 0 ? 0 : 8;
    for (let y = 0; y < 20; y++) if (hash2(y, v, 2420) < 0.4) p.px(wx + (side < 0 ? 1 : 0), y, SW[4]);
  });
}
// Seerosen
function lilyPads(v) {
  return flat(28, 16, 14, 9, (p) => {
    const pads = [[[8, 7, 4, 2.2], [17, 10, 3.4, 1.8], [13, 4, 2.4, 1.3]], [[12, 8, 5, 2.6], [21, 5, 2.6, 1.4], [5, 11, 2.2, 1.2]], [[7, 5, 3, 1.6], [15, 8, 3.8, 2], [22, 11, 2.6, 1.4], [10, 12, 2, 1.1]]][v];
    pads.forEach(([x, y, rx, ry], i) => {
      p.ellipse(x + 1, y + 1, rx, ry, rgba(2, 6, 4, 0.5));
      p.ellipse(x, y, rx, ry, MOSS[3]); p.ellipse(x - 0.5, y - 0.3, rx - 0.8, ry - 0.6, MOSS[4]);
      p.px(Math.round(x - rx * 0.5), Math.round(y - ry * 0.4), MOSS[6]);
      // Kerbe
      const a = hash2(i, v, 2500) * Math.PI * 2;
      for (let r = 0; r < rx; r++) p.px(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * ry / rx), SW[2]);
      p.px(Math.round(x), Math.round(y), MOSS[2]);
    });
    if (v !== 1) { const [x, y] = pads[1]; p.px(x - 1, y - 2, '#e8d8e0'); p.px(x, y - 2, '#f8eef2'); p.px(x + 1, y - 2, '#d8b8c8'); p.px(x, y - 3, '#ffffff'); p.px(x, y - 1, '#e0c040'); }
    for (let k = 0; k < 4; k++) { const x = 2 + Math.floor(hash2(k, v, 2501) * 24), y = 2 + Math.floor(hash2(k, v, 2502) * 12); p.px(x, y, SW[4]); }
  }, null, null, true);
}
// Versunkene Dächer: v0 Strohgiebel, v1 Schieferdach mit Schornstein, v2 Kapellenspitze
function sunkenRoof(v) {
  const W = [48, 46, 26][v], H = [30, 32, 50][v], wl = H - 6, cx = W / 2;
  return flat(W, H, Math.floor(cx), wl, (p, g) => {
    // Unterwasserteil: dunkle Silhouette durch das Wasser
    for (let y = wl; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.abs(x - cx) / (cx - 2) + (y - wl) / 7;
      if (e < 1 && ((x + y) & 1)) p.px(x, y, rgba(2, 8, 6, 0.55 - (y - wl) * 0.06));
    }
    outlined(p, W, H, (q) => {
      if (v === 0) {
        poly(q, [[3, wl], [cx, wl - 19], [W - 3, wl]], (x, y) => {
          let i = x < cx ? 4 : 2; if ((y + (x >> 1)) % 3 === 0) i--; if (hash2(x, y, 2600) < 0.1) i--;
          if (x > cx + 3 && x < cx + 9 && y > wl - 8 && y < wl - 3 && hash2(x >> 1, y, 2601) < 0.6) return INTERIOR;
          return (hash2(x >> 2, y >> 1, 2602) < 0.4 ? MOSS : THATCH)[clampI(i, 7)];
        });
        q.line(cx - 1, wl - 19, cx - 4, wl - 23, ROT[5]); q.line(cx + 1, wl - 19, cx + 4, wl - 22, ROT[4]);
        rimLight(q, W, H, '#a89a68', '#8a7e54');   // gekreuzte Giebelbalken
      } else if (v === 1) {
        poly(q, [[4, wl], [10, wl - 13], [W - 8, wl - 13], [W - 3, wl]], (x, y) => {
          const row = (wl - y) % 3, col = (x + ((wl - y) / 3 | 0) * 2) % 5;
          let c = row === 0 || col === 0 ? MST[1] : MST[3 + (hash2(x, y, 2610) < 0.3 ? 1 : 0)];
          if (x < 10) c = row === 0 ? MST[2] : MST[5];
          if (hash2(x >> 1, y >> 1, 2611) < 0.08) c = INTERIOR;
          return c;
        });
        rimLight(q, W, H, '#8a9488', MST[6]);
        // Schornstein
        q.rect(W - 15, wl - 22, 5, 10, '#4a2e24'); q.rect(W - 15, wl - 22, 2, 10, '#6a4434');
        for (let y = wl - 21; y < wl - 12; y += 3) q.rect(W - 15, y, 5, 1, '#2a1a14');
        q.rect(W - 16, wl - 23, 7, 2, MST[4]);
        for (let x = 12; x < W - 10; x++) if (hash2(x, 3, 2612) < 0.35) q.px(x, wl - 12, MOSS[5]);
      } else {
        // Kapellenspitze mit Glocke und Wetterhahn
        poly(q, [[4, wl], [cx, wl - 34], [W - 4, wl]], (x, y) => {
          const row = (wl - y) % 3;
          let i = x < cx ? 4 : 2; if (row === 0) i--; if (hash2(x, y, 2620) < 0.08) i--;
          return MST[clampI(i + 1, 8)];
        });
        rimLight(q, W, H, '#9aa498', MST[7]);
        q.rect(cx - 3, wl - 14, 6, 7, INTERIOR); q.px(cx - 3, wl - 15, MST[5]); q.px(cx + 2, wl - 15, MST[3]);
        q.rect(cx - 2, wl - 12, 4, 3, '#8a6a2a'); q.px(cx - 1, wl - 12, '#c8a050'); q.px(cx, wl - 9, '#4a3410');
        q.line(cx, wl - 34, cx, wl - 41, IRON[3]); q.line(cx - 2, wl - 39, cx + 2, wl - 39, IRON[3]); q.px(cx + 1, wl - 42, IRON[4]); q.px(cx + 2, wl - 41, IRON[2]);
        for (let y = wl - 30; y < wl; y += 4) beard(q, cx - 4 + ((y * 3) % 7), y, 3, y);
      }
    });
    // Wasserlinie: Kringel und Schaum
    for (let x = 1; x < W - 1; x++) {
      const e = Math.abs(x - cx) / (cx - 1);
      if (e > 0.95) continue;
      if (hash2(x, v, 2630) < 0.55) p.px(x, wl, SW[4]); if (hash2(x, v, 2631) < 0.25) p.px(x, wl + 1, SW[5]);
    }
    p.px(2, wl + 2, SW[4]); p.px(W - 3, wl + 2, SW[4]); p.px(3, wl + 3, SW[3]); p.px(W - 4, wl + 3, SW[3]);
    if (v === 0) { g.px(cx + 5, wl - 5, GLG[2]); p.px(cx + 5, wl - 5, GLG[3]); }                  // Irrlicht im Dachloch
  }, null, null, true);
}
// Nebelschwaden über dem Nebelsee (halbdurchsichtig)
function mistWisps(v) {
  const W = 64, H = 24;
  return flat(W, H, 32, 13, (p) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = ((x - 32) / 31) ** 2 + ((y - 12) / 11) ** 2;
      if (e > 1) continue;
      const n = vn(x / 9 + v * 3, y / 4, 2700) * 0.65 + vn(x / 4, y / 2.5, 2701 + v) * 0.35;
      const a = (n - 0.42) * 1.4 * (1 - e);
      if (a <= 0.03) continue;
      if (a < 0.12 && ((x + y) & 1)) continue;
      p.px(x, y, rgba(150, 172, 150, Math.min(0.34, a).toFixed(3)));
    }
  });
}
// Bootswrack: Ruderboot, Bug ragt schräg aus dem Wasser
function drownedBoat(v) {
  const W = 40, H = 24, wl = 18;
  return flat(W, H, 20, wl, (p) => {
    for (let y = wl; y < H; y++) for (let x = 4; x < W - 4; x++) if (((x + y) & 1) && Math.abs(x - 20) / 16 + (y - wl) / 6 < 1) p.px(x, y, rgba(2, 8, 6, 0.5));
    outlined(p, W, H, (q) => {
      const s = v ? -1 : 1, bx = v ? 30 : 10;
      // Rumpf als schräges Viereck: Heck unter Wasser, Bug oben
      poly(q, [[20 - s * 14, wl], [bx, wl - 13], [bx + s * 5, wl - 12], [20 + s * 10, wl]], (x, y) => {
        const k = ((y + Math.round(x * 0.4 * s)) % 3 === 0) ? 2 : y < wl - 6 ? 5 : 4;
        return ROT[clampI(k - (hash2(x, y, 2800) < 0.1 ? 1 : 0), 7)];
      });
      q.line(20 - s * 14, wl, bx, wl - 13, ROT[6]);
      // Innenraum dunkel, Ruderbank
      poly(q, [[20 - s * 9, wl], [bx + s * 1, wl - 10], [bx + s * 4, wl - 9], [20 + s * 6, wl]], INTERIOR);
      q.line(20 - s * 3, wl - 5, 20 + s * 3, wl - 6, ROT[5]);
      // Ruder treibt daneben
      q.line(20 + s * 8, wl + 1, 20 + s * 17, wl - 1, ROT[4]); q.rect(20 + s * 17 - (s < 0 ? 3 : 0), wl - 2, 4, 2, ROT[5]);
      beard(q, bx + s, wl - 12, 5, v + 1);
    });
    for (let x = 3; x < W - 3; x += 2) if (hash2(x, v, 2801) < 0.6) p.px(x, wl, SW[4]);
  }, null, null, true);
}
// Riesenpilze (Pilzwald)
function giantShroom(v) {
  const G = [GLV, GLT, GLG][v];
  const CAP = [['#1a0e26', '#2a1640', '#3c2058', '#523074', '#6c4892'], ['#08201e', '#0e3230', '#164644', '#205e5a', '#2e7a72'], ['#0c1e10', '#142e18', '#1e4224', '#2a5a30', '#3a743e']][v];
  const H = [66, 78, 56][v], W = 56, cx = 28;
  const capR = [17, 21, 14][v], capY = [20, 22, 18][v];
  return mk(W, H, (p, g) => {
    const by = H - 1;
    if (p.fine) { giantShroomFine(p, g, v, G, CAP, H, W, cx, capR, capY); return; }
    mudPatch(p, cx, by - 1, 14, 3, 2900 + v);
    // Stiel: leicht gebogen, Ring, Knolle
    const bend = [3, -4, 2][v];
    const sx = (y) => cx + Math.round(bend * Math.sin(((y - capY) / (by - capY)) * Math.PI));
    for (let y = capY; y < by; y++) {
      const t = (y - capY) / (by - capY), hw = 3 + Math.round(t * t * 4) + (y > by - 5 ? 2 : 0);
      for (let x = sx(y) - hw; x <= sx(y) + hw; x++) {
        const rel = (x - (sx(y) - hw)) / (2 * hw);
        let c = rel < 0.25 ? '#c8c4b0' : rel < 0.6 ? '#a8a490' : rel < 0.85 ? '#7c7868' : '#5a5648';
        if (hash2(x, y >> 1, 2910 + v) < 0.1) c = '#8c8876';
        p.px(x, y, c);
      }
    }
    // Ring (Manschette)
    const ry = capY + Math.round((by - capY) * 0.32);
    for (let x = sx(ry) - 7; x <= sx(ry) + 7; x++) { p.px(x, ry, '#d8d4c0'); p.px(x, ry + 1, '#9a9682'); if (hash2(x, 0, 2911) < 0.5) p.px(x, ry + 2, '#7a7666'); }
    // Lamellen-Unterseite leuchtet
    for (let x = cx - capR + 2; x <= cx + capR - 2; x++) {
      const d = Math.abs(x - cx) / capR;
      const yy = capY + 1 + Math.round((1 - d * d) * 3);
      for (let y = capY; y <= yy; y++) { p.px(x, y, (x % 2) ? G[1] : G[2]); g.px(x, y, (x % 2) ? G[1] : G[2]); }
      if (x % 3 === 0) g.px(x, yy, G[3]);
    }
    // Hut (Kuppel) mit Licht von links oben
    shadeLump(p, cx, capY - 4, capR, capR * 0.55, CAP, 2920 + v, { rough: 0.06, keep: (x, y) => y <= capY });
    for (let x = cx - capR; x <= cx + capR; x++) if (hash2(x, 1, 2921 + v) < 0.7) p.px(x, capY + 1, CAP[0]);
    // Leuchtflecken
    for (let k = 0; k < 9 + v * 2; k++) {
      const a = hash2(k, 0, 2930 + v) * Math.PI, r = Math.sqrt(hash2(k, 1, 2930 + v)) * 0.85;
      const x = Math.round(cx + Math.cos(a) * capR * r), y = Math.round(capY - 4 - Math.sin(a) * capR * 0.5 * r);
      const big = hash2(k, 2, 2930) < 0.4;
      p.px(x, y, G[3]); g.px(x, y, G[4]);
      if (big) { p.px(x + 1, y, G[2]); p.px(x, y + 1, G[2]); g.px(x + 1, y, G[3]); }
    }
    // Sporenfäden hängen vom Hutrand
    for (let k = 0; k < 5; k++) {
      const x = cx - capR + 3 + Math.floor(hash2(k, 3, 2940 + v) * (capR * 2 - 6)), len = 3 + Math.floor(hash2(k, 4, 2940) * 7);
      for (let i = 0; i < len; i++) { p.px(x, capY + 3 + i, i === len - 1 ? G[4] : G[1]); if (i === len - 1) g.px(x, capY + 3 + i, G[4]); }
    }
    // kleine Pilze am Fuß, schwebende Sporen
    glowShroom(p, g, cx - 9, by - 1, 2, 3, G, 2950 + v); glowShroom(p, g, cx + 10, by, 1, 2, G, 2951 + v);
    for (let k = 0; k < 6; k++) { const x = 6 + Math.floor(hash2(k, 5, 2960 + v) * 44), y = 2 + Math.floor(hash2(k, 6, 2960 + v) * (capY + 6)); g.px(x, y, G[3]); if (k % 2) p.px(x, y, G[3]); }
  }, { ax: cx, box: [-5, -4, 5, 1], light: { dx: 0, dy: -(H - capY) + 4, radius: 74, color: [[190, 110, 255], [90, 230, 210], [110, 240, 140]][v], intensity: 0.55 }, b: true });
}
// Riesenpilz-Hut fein: Kuppel in harten Stufen (CAP), Lamellen strahlenförmig mit Leuchtkern, Leuchtflecken mit heißem
// Kern, Sporenfäden mit Perlen. X = Mitte (stetig), capY = Unterkante wie im alten Code.
function bigCapFine(p, g, X, capY, capR, CAP, G, seed, spots) {
  const P = pal32(G), C = pal32(CAP);
  // Lamellen-Unterseite: Bogen unter dem Hutrand, Rippen zur Stielmitte
  const gy = capY + 0.5;
  p.scan(X - capR + 1.5, capY, X + capR - 1.5, capY + 4.5, (x, y) => {
    const d = Math.abs(x - X) / capR, yy = capY + 1.5 + (1 - d * d) * 3;
    if (y > yy || d > 0.92) return 0;
    const a = Math.atan2(y - gy + 1, x - X), rib = fract(a * 7 / Math.PI + 0.5) < 0.42;
    if (y < capY + 1) return P[d > 0.8 ? 3 : 1];
    return rib ? P[d < 0.3 ? 1 : 2] : P[0];
  });
  g.each(X - capR + 1.5, capY, X + capR - 1.5, capY + 4.5, (x, y) => {
    const d = Math.abs(x - X) / capR, yy = capY + 1.5 + (1 - d * d) * 3;
    if (y > yy || d > 0.92) return null;
    const a = Math.atan2(y - gy + 1, x - X), rib = fract(a * 7 / Math.PI + 0.5) < 0.42;
    if (y < capY + 1) return d > 0.8 && fract(x * 0.7) < 0.5 ? G[4] : G[3];
    return rib ? (d < 0.3 ? G[2] : G[3]) : G[1];
  });
  // Kuppel
  p.scan(X - capR - 0.5, capY - 4 - capR * 0.6, X + capR + 0.5, capY + 1, (x, y) => {
    const nx = (x - X) / (capR + 0.5), ny = (y - capY - 0.5) / (capR * 0.55 + 4.5);
    const yl = capY + 0.5 + 0.6 * tri((x - X) * 0.45 + seed * 0.1);           // gewellte Hutkante
    if (y > yl || nx * nx + ny * ny > 1) return 0;
    let i = stepOf(shade(nx * 0.95, ny * 1.05 - 0.05), 1, 4);
    if (y > yl - 0.5) i = nx < -0.5 ? 2 : 1;                                     // Hutrand
    else if (y > yl - 1.5 && nx > -0.2) i = Math.min(i, 2);
    return C[i];
  });
  // Leuchtflecken
  for (let k = 0; k < spots; k++) {
    const a = hash2(k, 0, seed) * Math.PI, r = Math.sqrt(hash2(k, 1, seed)) * 0.85;
    const x = X + Math.cos(a) * capR * r, y = capY - 4 - Math.sin(a) * capR * 0.5 * r + 0.5, big = hash2(k, 2, 2930) < 0.4;
    const rx = big ? 1.1 : 0.6, ry = rx * (0.55 + 0.4 * (1 - r));
    p.each(x - rx - 0.5, y - ry - 0.5, x + rx + 0.5, y + ry + 0.5, (xx, yy) => {
      const nx = (xx - x) / rx, ny = (yy - y) / ry, d = nx * nx + ny * ny;
      return d > 1 ? null : d < 0.35 ? G[4] : G[3];
    });
    g.dot(x, y, G[4]); g.dot(x - 0.5, y, G[3]); g.dot(x + 0.5, y, G[3]); g.dot(x, y - 0.5, G[3]); g.dot(x, y + 0.5, G[2]);
    if (big) { g.dot(x - 1, y, G[2]); g.dot(x + 1, y, G[2]); }
  }
}
function giantShroomFine(p, g, v, G, CAP, H, W, cx, capR, capY) {
  const by = H - 1, X = cx + 0.5, S = pal32(['#4a4638', '#5a5648', '#7c7868', '#a8a490', '#c8c4b0', '#dcd8c4']);
  fMud(p, cx, by - 1, 14, 3, 2900 + v);
  const bend = [3, -4, 2][v];
  const sx = (y) => X + bend * Math.sin(((y - capY) / (by - capY)) * Math.PI);
  const hw = (y) => { const t = (y - capY) / (by - capY); return 3.4 + t * t * 4 + (y > by - 5 ? Math.min(2, (y - by + 5) * 0.8) : 0); };
  p.scan(cx - 14, capY, cx + 14, by, (x, y) => {
    const w = hw(y), dx = x - sx(y);
    if (dx < -w || dx >= w) return 0;
    const rel = dx / w;
    let i = rel < -0.55 ? 4 : rel < -0.05 ? 3 : rel < 0.5 ? 2 : rel < 0.85 ? 1 : 0;
    if (rel > -0.85 && fract((dx + w) / 1.6) < 0.22 && hash2(Math.floor((dx + w) / 1.6), Math.floor(y / 4), 2910 + v) < 0.6) i -= 1;   // Fasern
    if (rel < -0.75 && y > capY + 6) i = 5;
    if (y < capY + 5 + rel * 1.5) i -= 1;                                                 // Hutschatten
    if (y > by - 1.5) i -= 1;
    return S[clampI(i, 6)];
  });
  // Manschette: hängender Ring mit Falten
  const ry = capY + Math.round((by - capY) * 0.32), rc = sx(ry);
  p.each(rc - 8, ry - 0.5, rc + 8, ry + 3.5, (x, y) => {
    const dx = x - rc, e = Math.abs(dx) / 7.5;
    if (e > 1) return null;
    const low = ry + 2 + 0.9 * tri(dx * 0.55) - e * 0.8;
    if (y < ry - 0.5 * (1 - e) || y > low) return null;
    if (y < ry + 0.5) return dx < 0 ? '#e0dcc8' : '#b4b09c';
    return y > low - 0.5 ? '#6a6656' : tri(dx * 0.55) > 0.6 ? '#7a7666' : dx < -2 ? '#a8a490' : '#8a8676';
  });
  bigCapFine(p, g, X, capY, capR, CAP, G, 2930 + v, 9 + v * 2);
  // Sporenfäden mit Leuchtperle
  for (let k = 0; k < 5; k++) {
    const x = cx - capR + 3 + Math.floor(hash2(k, 3, 2940 + v) * (capR * 2 - 6)) + 0.25, len = 3 + Math.floor(hash2(k, 4, 2940) * 7);
    p.fline(x, capY + 3, x, capY + 3 + len - 1, G[1]);
    p.dot(x, capY + 2.5 + len, G[4]); p.dot(x + 0.5, capY + 2.5 + len, G[3]); p.dot(x, capY + 3 + len, G[3]);
    g.dot(x, capY + 2.5 + len, G[4]); g.dot(x + 0.5, capY + 2.5 + len, G[3]); g.dot(x, capY + 3 + len, G[2]);
  }
  fShroom(p, g, cx - 9, by - 1, 2, 3, G, 2950 + v); fShroom(p, g, cx + 10, by, 1, 2, G, 2951 + v);
  for (let k = 0; k < 6; k++) {
    const x = 6 + Math.floor(hash2(k, 5, 2960 + v) * 44) + 0.25, y = 2 + Math.floor(hash2(k, 6, 2960 + v) * (capY + 6)) + 0.25;
    g.dot(x, y, G[4]); g.dot(x + 0.5, y, G[2]); g.dot(x, y + 0.5, G[2]);
    if (k % 2) p.dot(x, y, G[3]);
  }
}
// Hexenhütte (Geheimecke im Pilzwald)
function witchHut() {
  const W = 74, H = 72;
  return mk(W, H, (p, g) => {
    const by = H - 1, cx = 36, floorY = by - 10, wTop = 34;
    mudPatch(p, cx, by - 2, 34, 4, 3001);
    // krumme Stelzen
    for (const [x, d] of [[16, -1], [30, 1], [44, 0], [56, 1]]) { for (let y = floorY; y < by - 2; y++) { const xx = x + Math.round(d * (y - floorY) / 5); p.px(xx, y, ROT[3]); p.px(xx + 1, y, ROT[1]); } }
    // Bodenplatte
    p.rect(12, floorY - 2, 50, 3, ROT[4]); p.rect(12, floorY - 2, 50, 1, ROT[6]); p.rect(12, floorY + 1, 50, 1, ROT[1]);
    // Wände: schiefe Bretter, verzogen
    for (let x = 14; x <= 58; x++) {
      const lean = Math.round((x - 36) * 0.06);
      for (let y = wTop + Math.abs(lean); y < floorY - 2; y++) {
        const b = (x - 14) % 5;
        let i = b === 0 ? 1 : b === 1 ? 5 : 3;
        if (x < 18) i += 1; if (hash2(x, y >> 2, 3002) < 0.12) i -= 1;
        p.px(x + (y < wTop + 8 ? lean : 0), y, ROT[clampI(i, 7)]);
      }
    }
    // Rundfenster mit Grünlicht, Tür mit Schädel
    p.ellipse(22, 46, 4, 4, '#1a2a10'); p.ellipse(22, 46, 3, 3, '#3a8a2a'); p.px(21, 45, '#c8ff90'); p.line(22, 42, 22, 50, ROT[2]); p.line(18, 46, 26, 46, ROT[2]);
    g.ellipse(22, 46, 3, 3, '#4aa83a'); g.px(21, 45, '#e0ffc0');
    p.rect(38, 40, 10, floorY - 42, INTERIOR); p.rect(37, 39, 12, 1, ROT[5]); p.rect(37, 40, 1, floorY - 42, ROT[5]);
    p.rect(41, 42, 4, 3, BONE[3]); p.px(42, 43, INTERIOR); p.px(44, 43, INTERIOR); p.rect(42, 45, 2, 1, BONE[2]);
    // Strohdach, durchhängend, mit Moos und schiefem Schornstein
    const rTop = 8, rBot = wTop + 2;
    for (let y = rTop; y <= rBot; y++) {
      const k = (y - rTop) / (rBot - rTop), sag = Math.round(Math.sin(k * Math.PI) * 2);
      const xl = Math.round(cx - 5 - k * 28), xr = Math.round(cx + 8 + k * 27);
      for (let x = xl; x <= xr; x++) {
        const rel = (x - xl) / (xr - xl);
        let i = rel < 0.25 ? 5 : rel < 0.55 ? 4 : rel < 0.8 ? 3 : 2;
        if ((y + (x >> 1)) % 4 === 0) i -= 1; if (hash2(x, y, 3003) < 0.1) i -= 1;
        const mossy = hash2(x >> 2, (y + sag) >> 1, 3004) < 0.35;
        p.px(x, y + sag, (mossy ? MOSS : THATCH)[clampI(i + (mossy ? 1 : 0), 7)]);
      }
    }
    for (let x = cx - 33; x <= cx + 35; x++) { const l = 1 + Math.round(hash2(x, 3, 3005) * 3); for (let k = 0; k < l; k++) p.px(x, rBot + 2 + k, THATCH[k === 0 ? 2 : 1]); }
    beard(p, 12, rBot + 3, 7, 1); beard(p, 26, rBot + 3, 5, 2); beard(p, 60, rBot + 3, 8, 3);
    // Schornstein (Rauch per extra.smoke)
    for (let y = 2; y < 16; y++) { const x = 46 + Math.round((16 - y) * 0.25); p.rect(x, y, 5, 1, y % 3 ? '#4a3a30' : '#2a2018'); p.px(x, y, '#6a5444'); }
    p.rect(46, 1, 7, 2, MST[4]);
    // Kräuterleine und Knochenmobile unter der Traufe
    p.line(10, rBot + 6, 30, rBot + 8, BEARD[2]);
    for (const x of [13, 18, 23, 27]) { const y = rBot + 6 + Math.round((x - 10) / 10); p.rect(x, y + 1, 2, 4, x % 2 ? '#4a6a2a' : '#6a4a2a'); p.px(x, y + 1, '#8aa04a'); }
    // Kessel links vor der Hütte mit grünem Sud
    const kx = 9, ky = by - 6;
    p.ellipse(kx, ky, 7, 5, '#14140f'); p.ellipse(kx, ky - 1, 6, 4, '#2a2a22'); p.ellipse(kx, ky - 4, 6, 1.6, '#3a8a2a'); p.px(kx - 2, ky - 4, '#c8ff90'); p.px(kx + 2, ky - 5, '#8ae060');
    g.ellipse(kx, ky - 4, 6, 1.6, '#4aa83a'); g.px(kx - 2, ky - 4, '#e0ffc0'); g.px(kx + 1, ky - 6, '#8ae060'); g.px(kx - 1, ky - 8, '#4aa83a');
    p.px(kx + 1, ky - 6, '#8ae060'); p.px(kx - 1, ky - 8, '#6ac04a');
    for (let x = kx - 4; x <= kx + 4; x += 2) { p.px(x, ky + 4, EMB[3]); g.px(x, ky + 4, EMB[4]); }
    // Schädel auf Pfahl rechts
    p.line(68, by - 2, 68, by - 18, ROT[4]); p.rect(66, by - 22, 5, 4, BONE[3]); p.px(67, by - 21, INTERIOR); p.px(69, by - 21, INTERIOR); p.rect(67, by - 18, 3, 1, BONE[2]);
    p.px(67, by - 21, GLG[3]); g.px(67, by - 21, GLG[4]); g.px(69, by - 21, GLG[4]); p.px(69, by - 21, GLG[3]);
    // Kerzen auf der Schwelle
    for (const x of [34, 50]) { p.rect(x, floorY - 5, 2, 3, '#d8d0b0'); p.px(x, floorY - 6, '#ffd060'); g.px(x, floorY - 6, '#ffe890'); g.px(x, floorY - 7, '#ffb040'); }
  }, {
    ax: 36, box: [-24, -14, 26, -4], light: { dx: -26, dy: -8, radius: 84, color: [140, 240, 120], intensity: 0.8 }, extra: { smoke: { dx: 14, dy: -70, rate: 1.5 } },
    fine: (f, g) => {
      // Rundfenster: gestuftes Grünlicht mit heißem Kern, Sprossenkreuz
      const W2 = ['#1e4a14', '#3a8a2a', '#6ac04a', '#c8ff90'], WG = ['#2a6a1e', '#3a8a2a', '#4aa83a', '#e0ffc0'];
      const bar = (x, y) => (x > 21.5 && x < 22.5) || (y > 46 && y < 46.5);
      for (const [t, P] of [[f, W2], [g, WG]]) t.each(18.5, 42.5, 26.5, 50.5, (x, y) => { const d = Math.hypot(x - 22.5, y - 46.5); return d > 3.5 || (t === g && bar(x, y)) ? null : d > 2.8 ? P[0] : d > 1.8 ? P[1] : d > 0.7 ? P[2] : P[3]; });
      f.fline(22.25, 43, 22.25, 50, ROT[2]); f.fline(19, 46.25, 26, 46.25, ROT[2]); f.fline(21.75, 43, 21.75, 50, ROT[4]);
      // Kessel: Sud mit Glanz und Blasen
      const kx = 9, ky = 65;
      f.fline(kx - 4, ky - 4.75, kx - 1, ky - 4.75, '#6ac04a'); fEye(f, g, kx - 2, ky - 4.5, ['#1e4a14', '#3a8a2a', '#6ac04a', '#a8f070', '#e0ffc0']);
      f.dot(kx + 1.25, ky - 6.25, '#a8f070'); g.dot(kx + 1.25, ky - 6.25, '#e0ffc0'); f.dot(kx - 0.75, ky - 8.25, '#6ac04a'); g.dot(kx - 0.75, ky - 8.25, '#a8f070');
      f.fline(kx - 5, ky - 2.75, kx - 3, ky - 3.75, '#4a4a3c');
      for (let x = kx - 4; x <= kx + 4; x += 2) { f.dot(x + 0.25, ky + 4.25, EMB[4]); g.dot(x + 0.25, ky + 4.25, '#fff0b0'); }
      // Kerzen: kleine Flammen mit Kern
      for (const x of [34, 50]) { fFlame(f, g, x + 0.75, 56.5, 2.2, 0.6); f.dot(x + 0.25, 57.25, '#fffbe8'); }
      // Schädel auf dem Pfahl
      fEye(f, g, 67, 50, GLG); fEye(f, g, 69, 50, GLG);
    },
  });
}
// Truhen der Geheimecken
function cacheChest(kind, open) {
  const W = 22, H = 18;
  return mk(W, H, (p, g) => {
    const by = H - 1;
    mudPatch(p, 11, by - 1, 10, 2, 3100, false);
    const wood = kind === 'witch' ? ROT : PLANK, band = kind === 'witch' ? BONE : IRON;
    p.rect(3, 8, 16, by - 9, wood[3]); p.rect(3, 8, 16, 1, wood[5]); p.rect(3, by - 2, 16, 1, wood[1]); p.rect(3, 8, 2, by - 9, wood[5]);
    for (const x of [6, 15]) p.rect(x, 8, 2, by - 9, band[2]);
    if (open) {
      p.rect(3, 2, 16, 6, wood[2]); p.rect(3, 2, 16, 1, wood[4]); p.rect(4, 7, 14, 2, INTERIOR);
      p.px(8, 8, GOLD[4]); p.px(11, 8, GOLD[3]); p.px(14, 8, GOLD[4]);
    } else {
      p.ellipse(11, 7, 8, 3, wood[4]); p.rect(3, 7, 16, 2, wood[4]); p.line(4, 5, 18, 5, wood[6]);
      p.rect(10, 9, 3, 3, kind === 'witch' ? '#3a8a2a' : GOLD[2]); p.px(11, 10, kind === 'witch' ? '#c8ff90' : GOLD[4]);
      if (kind === 'witch') { g.px(11, 10, '#e0ffc0'); g.px(10, 9, '#4aa83a'); p.rect(9, 3, 5, 3, BONE[3]); p.px(10, 4, INTERIOR); p.px(12, 4, INTERIOR); }
      else { g.px(11, 10, GOLD[4]); }
    }
    if (kind === 'witch') { beard(p, 4, 9, 4, 1); glowShroom(p, g, 19, by - 1, 1, 2, GLG, 3101); }
  }, {
    ax: 11, box: [-8, -5, 8, 1],
    fine: (f, g) => {
      const band = kind === 'witch' ? BONE : IRON, by = 17;
      for (const x of [6, 15]) { f.fline(x + 0.25, 8, x + 0.25, by - 1.5, band[band === BONE ? 3 : 4]); f.fline(x + 1.75, 8, x + 1.75, by - 1.5, band[1]); f.dot(x + 0.75, 9.25, band[5] ?? band[4]); f.dot(x + 0.75, by - 2.75, band[3]); }
      if (open) { for (const x of [8, 11, 14]) { f.dot(x + 0.25, 8.25, '#fff8d0'); g.dot(x + 0.25, 8.25, GOLD[4]); } }
      else if (kind !== 'witch') { f.dot(10.25, 9.25, GOLD[4]); f.dot(11.25, 10.25, '#fff8d0'); g.dot(11.25, 10.25, '#fff8d0'); }
      else fEye(f, g, 11, 10, ['#1e4a14', '#3a8a2a', '#6ac04a', '#c8ff90', '#e0ffc0']);
    },
  });
}

// Ertrunkene Bäume: kahle Stämme im tiefen Wasser
function drownedTree(v) {
  const rng = createRng(3200 + v);
  const H = [52, 44, 60][v], W = 44, cx = 22, wl = H - 5;
  return mk(W, H, (p) => {
    if (p.fine) { drownedTreeFine(p, v, rng, H, W, cx, wl); return; }
    for (let y = wl; y < H; y++) for (let x = 4; x < W - 4; x++) if (((x + y) & 1) && Math.abs(x - cx) / 16 + (y - wl) / 5 < 1) p.px(x, y, rgba(2, 8, 6, 0.5));
    const top = [12, 16, 8][v], lean = [2, -3, 1][v];
    const tx = (y) => cx + Math.round(lean * (wl - y) / (wl - top));
    for (let y = top; y <= wl; y++) {
      const hw = 2 + ((y - top) / (wl - top)) * 2.4;
      for (let x = Math.round(tx(y) - hw); x <= Math.round(tx(y) + hw); x++) {
        const rel = (x - (tx(y) - hw)) / (2 * hw);
        let i = rel < 0.25 ? 5 : rel < 0.55 ? 4 : rel < 0.8 ? 3 : 2;
        if ((x * 2 + y) % 7 === 0) i -= 2; if (y > wl - 6) i -= 1;
        p.px(x, y, MST[clampI(i, 8)]);
      }
    }
    // kahle Äste
    for (let k = 0; k < 5; k++) {
      const y0 = top + rng.int(0, Math.round((wl - top) * 0.5)), s = k % 2 ? 1 : -1, len = rng.int(7, 14);
      let x = tx(y0), y = y0;
      for (let t = 0; t < len; t++) { x += s; if (t % 2 === 0) y -= 1; p.px(x, y, MST[t < 4 ? 4 : 3]); if (t < 3) p.px(x, y + 1, MST[2]); }
      p.line(x, y, x + s * 2, y - 3, MST[3]);
      if (rng.chance(0.6)) beard(p, x - s * 2, y + 1, rng.int(4, 9), k + v);
    }
    // Stammbruch oben, Moosring an der Wasserlinie
    p.px(tx(top) - 1, top - 1, MST[5]); p.px(tx(top) + 1, top - 2, MST[4]);
    for (let x = tx(wl) - 5; x <= tx(wl) + 5; x++) { p.px(x, wl - 1, MOSS[3 + (x % 2)]); if (hash2(x, v, 3201) < 0.5) p.px(x, wl - 2, MOSS[4]); }
    for (let x = tx(wl) - 8; x <= tx(wl) + 8; x += 3) p.px(x, wl + 1, SW[4]);
    p.px(tx(wl) - 9, wl, SW[5]); p.px(tx(wl) + 9, wl, SW[5]);
  }, { ax: cx, b: true });
}
// Stufe B: Spiegelung als dunkle Wellenlinien mit Stammspiegel, Stamm mit Furchen und nassem Fuß, Äste verjüngt,
// Moosring an der Wasserlinie, Ringe im Wasser.
function drownedTreeFine(p, v, rng, H, W, cx, wl) {
  const top = [12, 16, 8][v], lean = [2, -3, 1][v], seed = 3200 + v;
  // Knickstamm: Mittellinie aus Stützpunkten (lineare Stücke), Breite mit Wülsten an Astansätzen
  const ks = [];
  for (let y = wl, k = 0; y > top - 6; y -= 5 + hash2(k, 9, seed) * 5, k++) ks.push([y, (hash2(k, 8, seed) - 0.5) * 1.8]);
  const kink = (y) => { for (let i = 0; i < ks.length - 1; i++) { const [ya, da] = ks[i], [yb, db] = ks[i + 1]; if (y <= ya && y >= yb) return da + (db - da) * (ya - y) / (ya - yb); } return ks[ks.length - 1][1]; };
  const tx = memo((y) => cx + 0.5 + lean * (wl - y) / (wl - top) + kink(y) * Math.min(1, (wl - y) / 6));
  const limbs = [];
  for (let k = 0; k < 5; k++) {
    const y0 = top + rng.int(0, Math.round((wl - top) * 0.5)) + 0.5, s = k % 2 ? 1 : -1, len = rng.int(7, 14);
    limbs.push({ y0, s, len, beard: rng.chance(0.6), bl: rng.int(4, 9) });
  }
  limbs.push({ y0: top + (wl - top) * 0.66, s: v ? 1 : -1, len: 2, stub: true });
  const tw = memo((y) => {
    let w = 4.6 + ((y - top) / (wl - top)) * 4.8 + (y > wl - 2.5 ? (y - wl + 2.5) * 0.9 : 0);
    for (const b of limbs) { const d = Math.abs(y - b.y0); if (d < 1.6) w += (1.6 - d) * 0.9; }
    return w;
  });
  const T = [MST[2], MST[3], MST[4], MST[5], MST[6]];
  // Spiegelung: dunkle Wellenlinien, Stammspiegel
  const [d0, d1, r0, r1] = pal32(['#030907', SW[0], MST[1], MST[2]]);
  p.scan(4, wl, W - 4, H, (x, y) => {
    const e = Math.abs(x - cx - 0.5) / 16 + (y - wl) / 5;
    if (e >= 1) return 0;
    const row = Math.floor(y * 2) - wl * 2;
    if (Math.abs(x - tx(wl)) < 2.2 - row * 0.25 && (row & 1) === 0) return x < tx(wl) ? r1 : r0;
    if (row & 1) return 0;
    return tri(x * 0.15 + row * 0.3) > 0.3 + e * 0.5 ? (e < 0.5 ? d0 : d1) : 0;
  });
  // Äste hinter dem Stamm: lange mit Gabel, kurze abgebrochen, Stummel
  limbs.forEach((b, k) => {
    const x0 = tx(b.y0) + b.s * 0.5;
    if (b.stub) { deadLimb(p, x0, b.y0, b.s, b.len + tw(b.y0) / 2, 0.6, 1.4, T, { broken: true, seed: seed + k }); return; }
    const broken = k === 2 || k === 4 - v, len = broken ? b.len * 0.55 : b.len;
    const [x1, y1] = deadLimb(p, x0, b.y0, b.s, len, len / 2, 1.3, T, { broken, seed: seed + k });
    if (!broken) p.fline(x1, y1, x1 + b.s * 2, y1 - 3, T[1]);
    if (b.beard) fBeard(p, Math.round(x1 - b.s * 2 - 0.5), Math.round(y1 + 0.5), b.bl, k + v);
  });
  roughBark(p, top, wl + 0.5, tx, tw, T, { seed, plate: 1.8, twist: 0.04, wet: wl - 4 });
  barkPatches(p, tx, tw, top + 3, wl - 3, seed + 11, 6);
  // abgebrochene Krone: Splitterzacken unterschiedlicher Höhe, Bruchholz heller
  const hw = tw(top) / 2, xt = tx(top), spikes = [1.5, 3.5, 0.8, 2.6, 1.2];
  const pts = [[xt - hw, top + 1]];
  spikes.forEach((h, i) => { const xa = xt - hw + (2 * hw * i) / spikes.length, xb = xt - hw + (2 * hw * (i + 1)) / spikes.length; pts.push([xa, top + 0.5 - (i ? spikes[i - 1] * 0.3 : 0)], [(xa + xb) / 2, top - h], [xb, top + 0.3]); });
  pts.push([xt + hw, top + 1]);
  fpoly(p, pts, (x, y) => (y < top - 1 && x < xt ? T[3] : x > xt + hw * 0.4 ? T[1] : T[2]));
  spikes.forEach((h, i) => { const xm = xt - hw + (2 * hw * (i + 0.5)) / spikes.length; p.dot(xm, top - h + 0.25, i < 3 ? '#5a5e52' : T[3]); });
  // Moos an der Wasserlinie: fleckig, mit Lücken
  const bx = tx(wl);
  p.each(bx - 5.5, wl - 3, bx + 5.5, wl, (x, y) => {
    const dx = x - bx, cxw = Math.floor(dx + 6), h = hash2(cxw, 4, seed) < 0.25 ? 0 : 0.8 + 1.6 * hash2(cxw, 5, seed);
    if (Math.abs(dx) > tw(wl) / 2 + 0.5 || y < wl - h) return null;
    return y < wl - h + 0.5 ? (dx < 0 ? MOSS[5] : MOSS[4]) : dx < 0 ? MOSS[4] : MOSS[3];
  });
  fRing(p, bx, wl + 0.8, 7.5, 1.1);
  p.dot(bx - 9, wl + 0.25, SW[5]); p.dot(bx + 9, wl + 0.25, SW[5]);
}
// Irrlicht über dem Wasser (Glühen + Licht, ohne Umriss)
function willWisp(v) {
  const C = [GLT, GLG, GLV][v];
  return flat(16, 30, 8, 18, (p, g) => {
    const y = 4 + v * 2;
    p.px(8, y, C[4]); p.px(7, y, C[3]); p.px(9, y, C[3]); p.px(8, y - 1, C[3]); p.px(8, y + 1, C[2]);
    g.rect(6, y - 1, 5, 3, C[2]); g.px(8, y, C[4]); g.px(7, y, C[4]); g.px(8, y - 2, C[2]); g.px(8, y + 2, C[1]);
    for (let k = 0; k < 4; k++) { const x = 5 + Math.floor(hash2(k, v, 3300) * 7), yy = y + 3 + k * 2; g.px(x, yy, C[k < 2 ? 2 : 1]); }
    // Spiegelung auf dem Wasser
    for (let x = 5; x < 12; x++) if (x % 2) p.px(x, 20, rgba(110, 230, 200, 0.25));
    p.px(8, 21, rgba(150, 255, 220, 0.3));
  }, { light: { dx: 0, dy: -12 + v * 2, radius: 46, color: [[90, 230, 210], [110, 240, 140], [190, 120, 255]][v], intensity: 0.6 } });
}
// Quest-Laternen (Reihenfolge Rot → Grün → Blau → Weiß)
const LANTERN_COL = { red: ['#3a0e0c', '#8a2018', '#e04a30', '#ffb0a0'], green: ['#0c2a12', '#1e7a34', '#4ae070', '#c8ffd0'], blue: ['#0c1638', '#1e4a9a', '#4a90f0', '#c8e0ff'], white: ['#2a2a2a', '#8a8a86', '#e6e6dc', '#ffffff'] };
const LANTERN_LIGHT = { red: [255, 90, 70], green: [110, 240, 130], blue: [100, 160, 255], white: [240, 240, 230] };
function questLantern(color, on) {
  const C = LANTERN_COL[color];
  return mk(18, 40, (p, g) => {
    const by = 39, x0 = 5;
    mudPatch(p, x0 + 2, by - 1, 5, 1, 3400, false);
    pole(p, x0, 4, by - 1, 2, ROT.slice(1), 3401);
    p.rect(x0, 4, 9, 2, ROT[4]); p.rect(x0, 4, 9, 1, ROT[6]); p.line(x0 + 2, 10, x0 + 6, 6, ROT[3]);
    const lx = x0 + 6, ly = 9;
    p.line(lx + 1, 6, lx + 1, ly - 1, IRON[2]);
    p.rect(lx - 1, ly, 5, 1, IRON[3]); p.rect(lx - 2, ly + 1, 7, 7, IRON[1]); p.rect(lx - 1, ly + 1, 5, 6, on ? C[2] : C[0]);
    p.px(lx, ly + 2, on ? C[3] : C[1]); p.px(lx + 1, ly + 3, on ? C[3] : C[1]); p.line(lx + 1, ly + 1, lx + 1, ly + 6, IRON[1]);
    p.rect(lx - 2, ly + 8, 7, 1, IRON[2]); p.px(lx + 1, ly + 9, IRON[1]);
    if (on) { g.rect(lx - 1, ly + 1, 5, 6, C[2]); g.px(lx, ly + 2, C[3]); g.px(lx + 1, ly + 3, C[3]); g.px(lx + 1, ly - 2, C[1]); }
    // farbiges Band am Pfahl (auch erloschen erkennbar)
    p.rect(x0, 20, 2, 3, C[1]); p.px(x0, 20, C[2]);
  }, {
    ax: 6, box: [-2, -2, 2, 1], light: on ? { dx: 6, dy: -26, radius: 70, color: LANTERN_LIGHT[color], intensity: 0.9 } : undefined,
    fine: (f, g) => {
      const lx = 11, ly = 9;
      fLamp(f, g, lx - 1, ly + 1, 5, 6, [C[0], on ? C[3] : C[1], C[2], C[3], '#ffffff'], [C[2], C[2], C[3], '#ffffff'], on);
      f.fline(lx - 2, ly + 1.25, lx + 4.75, ly + 1.25, IRON[3]); f.fline(lx - 2, ly + 8.25, lx + 4.75, ly + 8.25, IRON[3]); f.dot(lx - 2 + 0.25, ly + 1.25, IRON[4]);
      f.fline(lx + 1.25, ly + 1.5, lx + 1.25, ly + 6.75, IRON[2]);
      f.dot(5.25, 20.25, C[3]);
    },
  });
}
// Hexenkessel im Schilf
function hagCauldron(on) {
  return mk(30, 26, (p, g) => {
    const by = 25, kx = 15, ky = by - 7;
    mudPatch(p, kx, by - 1, 13, 2, 3500);
    for (const x of [6, 24]) { p.line(x, by - 1, kx, ky - 9, ROT[3]); }
    p.ellipse(kx, ky, 8, 6, '#14140f'); p.ellipse(kx, ky - 1, 7, 5, '#2a2a22'); p.ellipse(kx - 2, ky - 2, 3, 2, '#3a3a30');
    const brew = on ? ['#3a2a10', '#6a5020'] : ['#2a6a1e', '#6ac04a'];
    p.ellipse(kx, ky - 5, 7, 1.8, brew[0]); p.px(kx - 2, ky - 5, brew[1]); p.px(kx + 3, ky - 6, brew[1]);
    if (!on) { g.ellipse(kx, ky - 5, 7, 1.8, '#3a8a2a'); g.px(kx - 2, ky - 5, '#c8ff90'); g.px(kx + 1, ky - 8, '#8ae060'); g.px(kx - 1, ky - 11, '#4aa83a'); p.px(kx + 1, ky - 8, '#8ae060'); }
    for (let x = kx - 5; x <= kx + 5; x += 2) { p.px(x, by - 1, on ? ROT[1] : EMB[3]); if (!on) g.px(x, by - 1, EMB[4]); }
    p.rect(kx + 9, by - 6, 3, 4, BONE[3]); p.px(kx + 9, by - 5, INTERIOR);
    for (let i = 0; i < 6; i++) blade(p, 2 + i * 5, by, 5 + (i % 3) * 3, i % 2 ? 1 : -1, REED, 1, 5);
  }, {
    ax: 15, box: [-8, -5, 8, 1], light: on ? undefined : { dx: 0, dy: -12, radius: 60, color: [140, 240, 120], intensity: 0.6 },
    fine: (f, g) => {
      const kx = 15, ky = 18;
      f.fline(kx - 7, ky - 4.25, kx + 3, ky - 4.25, '#3a3a30'); f.dot(kx - 5.75, ky - 2.75, '#4a4a3e');
      if (on) return;
      f.fline(kx - 5, ky - 5.25, kx - 2, ky - 5.25, '#8ae060');
      fEye(f, g, kx - 2, ky - 5.5, ['#1e4a14', '#3a8a2a', '#6ac04a', '#a8f070', '#e0ffc0']); fEye(f, g, kx + 3, ky - 6, ['#1e4a14', '#3a8a2a', '#6ac04a', '#a8f070', '#e0ffc0']);
      for (let x = kx - 5; x <= kx + 5; x += 2) { f.dot(x + 0.25, 24.25, EMB[4]); g.dot(x + 0.25, 24.25, '#fff0b0'); }
    },
  });
}
// Gräber der Ertrunkenen (Holzkreuze, Grabsteine im Moos)
function marshGraves(v) {
  return mk(22, 22, (p) => {
    const by = 21;
    mudPatch(p, 11, by - 1, 9, 2, 3600 + v, false);
    if (v === 0) { p.rect(9, 6, 3, 15, ROT[4]); p.rect(9, 6, 1, 15, ROT[6]); p.rect(5, 9, 11, 3, ROT[4]); p.rect(5, 9, 11, 1, ROT[6]); beard(p, 14, 12, 5, 1); }
    else if (v === 1) { shadeLump(p, 11, 12, 5, 8, MST.slice(1), 3601, { rough: 0.05, keep: (x, y) => y <= by - 1 }); p.rect(9, 9, 4, 1, MST[2]); p.rect(10, 7, 2, 5, MST[2]); mossCap(p, [[7, 6], [8, 5], [9, 4], [10, 4], [11, 4]], 1, 3602); }
    else { p.rect(6, 10, 3, 11, ROT[3]); p.rect(4, 12, 7, 2, ROT[4]); p.rect(13, 13, 6, 8, MST[3]); p.rect(13, 13, 6, 1, MST[5]); p.px(15, 16, MST[1]); }
    for (let i = 0; i < 4; i++) blade(p, 3 + i * 5, by, 2 + (i % 2) * 2, i % 2 ? 1 : -1, REED, 1, 4);
  }, { ax: 11, box: [-6, -4, 6, 1] });
}

// ------------------------------------------------------------ Runde 5/2: knorrige Stege
// Alle Stegteile zeichnen die Bretter der Zelle UNTER dem Anker (Zelle x = 2..17
// im 20 px breiten Sprite). Flags: 1 = Steg/Land setzt sich dort fort (glatter Stoß),
// 0 = offenes Ende (ausgefranste Brettenden, Kantenbalken, Schatten aufs Wasser).
const WC0 = 2, WC1 = 17;
// Steg Nord–Süd: waagrechte Bohlen. fl = 'LR'
function walkY(fl, v) {
  const L = fl[0] === '1', R = fl[1] === '1', top = 6;
  return flat(20, top + 18, 10, top, (p) => {
    const s0 = 3100 + v * 31 + (L ? 7 : 0) + (R ? 13 : 0);
    const ends = [];
    for (let j = 0; j < 4; j++) {
      const y0 = top + j * 4, s = s0 + j * 5;
      if (v === 1 && j === 2 && !L && !R) { ends.push(null); continue; }            // fehlende Bohle
      const e0 = L ? WC0 : WC0 + Math.floor(hash2(j, v, s) * 3);
      const e1 = R ? WC1 : WC1 - Math.floor(hash2(j, v, s + 1) * 3);
      ends.push([e0, e1]);
      const base = 3 + Math.floor(hash2(j, v, s + 2) * 2.2);
      for (let x = e0; x <= e1; x++) for (let r = 0; r < 3; r++) {
        let k = base + (r === 0 ? 1 : r === 2 ? -1 : 0);
        if (hash2(x >> 1, y0 + r, s + 3) < 0.09) k -= 1;
        if (hash2(x, y0 + r, s + 4) < 0.03) k += 1;
        if ((!L && x === e0) || (!R && x === e1)) k += r === 0 ? 2 : 0;          // Stirnholz im Licht
        p.px(x, y0 + r, PLANK[clampI(k, PLANK.length)]);
      }
      p.rect(e0, y0 + 3, e1 - e0 + 1, 1, PLANK[0]);
      // Nägel über den Längsbalken
      if (!L || hash2(j, v, s + 5) < 0.5) p.px(e0 + 2, y0 + 1, '#6a6a60');
      if (!R || hash2(j, v, s + 6) < 0.5) p.px(e1 - 2, y0 + 1, '#5a5a52');
      if (hash2(j, v, s + 7) < 0.35) mossPx(p, e0 + 3 + Math.floor(hash2(j, v, s + 8) * 9), y0 + 3, s + 9);
      if (hash2(j, v, s + 10) < 0.2) { const x = e0 + 4 + Math.floor(hash2(j, v, s + 11) * 7); p.px(x, y0 + 1, PLANK[1]); p.px(x + 1, y0 + 1, PLANK[2]); } // Astloch
    }
    // Schatten der offenen Ränder auf dem Wasser
    for (let j = 0; j < 4; j++) {
      const e = ends[j]; if (!e) continue;
      for (let r = 0; r < 4; r++) {
        if (!R) { p.px(e[1] + 1, top + j * 4 + r, rgba(2, 6, 4, 0.55)); p.px(e[1] + 2, top + j * 4 + r, rgba(2, 6, 4, 0.25)); }
      }
    }
    // Längsbalken unter den Bohlen an offenen Seiten (sichtbar, wo Bohlen kürzer sind)
    if (!L) for (let y = top; y < top + 16; y++) if (p.ctx.getImageData(WC0 + 1, y, 1, 1).data[3] === 0) p.px(WC0 + 1, y, PLANK[1]);
    if (!R) for (let y = top; y < top + 16; y++) if (p.ctx.getImageData(WC1 - 1, y, 1, 1).data[3] === 0) p.px(WC1 - 1, y, PLANK[1]);
    // Stummelpfosten an offenen Rändern
    if (!L && v === 0) { pole(p, 0, top - 5, top + 9, 2, PLANK.slice(1), 3150); p.px(0, top - 5, PLANK[7]); p.px(0, top - 2, MOSS[4]); ripple(p, 0, top + 10, 1); }
    if (!R && v === 1) { pole(p, 18, top - 3, top + 11, 2, PLANK.slice(1), 3151); p.px(18, top - 3, PLANK[6]); ripple(p, 18, top + 12, 1); }
    if (v === 1 && !L && !R) {                                                    // Lücke: Balken sichtbar, Wasser dazwischen
      p.rect(WC0 + 1, top + 8, 1, 4, PLANK[2]); p.rect(WC1 - 1, top + 8, 1, 4, PLANK[2]);
      p.rect(WC0 + 2, top + 9, WC1 - WC0 - 3, 2, rgba(4, 10, 8, 0.35));
    }
  });
}
// Steg Ost–West: senkrechte Bohlen. fl = 'UD' (oben/unten fortgesetzt)
function walkX(fl, v) {
  const U = fl[0] === '1', D = fl[1] === '1';
  return flat(16, 16, 8, 0, (p) => {
    const s0 = 3200 + v * 29 + (U ? 5 : 0) + (D ? 11 : 0);
    for (let b = 0; b < 4; b++) {
      const y0 = U ? 0 : Math.floor(hash2(b, v, s0) * 3);
      const y1 = 15;
      vBoard(p, b * 4, y0, y1, s0 + b * 7);
      if (!U) { p.rect(b * 4, y0, 3, 1, PLANK[6]); p.px(b * 4 + 1, y0 + 1, '#6a6a60'); }
      if (hash2(b, v, s0 + 3) < 0.4) vSeam(p, b * 4, 3 + Math.floor(hash2(b, v, s0 + 4) * 10));
    }
    if (!U) for (let x = 0; x < 16; x++) if (p.ctx.getImageData(x, 0, 1, 1).data[3] === 0) p.px(x, 0, rgba(2, 6, 4, 0.3));
    for (let k = 0; k < 3; k++) mossPx(p, 3 + 4 * k, Math.floor(hash2(k, v, s0 + 5) * 16), s0 + 6 + k);
    if (v === 1) { p.px(6, 7, PLANK[1]); p.px(5, 8, PLANK[1]); p.px(9, 4, '#3a4a30'); }
  });
}
// Stegkante (letzte Reihe): Randbalken, Stützpfahl, Schatten, Kringel. fl = 'LR'
function walkRim(fl, v) {
  const L = fl[0] === '1', R = fl[1] === '1';
  return flat(20, 15, 10, 0, (p) => {
    const s = 3300 + v * 17 + (L ? 3 : 0) + (R ? 9 : 0);
    const x0 = L ? WC0 : WC0 + 1 + Math.floor(hash2(0, v, s) * 2), x1 = R ? WC1 : WC1 - 1 - Math.floor(hash2(1, v, s) * 2);
    for (let x = x0; x <= x1; x++) for (let y = 0; y < 2; y++) p.px(x, y, PLANK[(x & 3) === 3 ? 0 : 3 + (hash2(x >> 2, y, s) < 0.5 ? 1 : 0)]);
    const sag = v === 1 ? 1 : 0;                                              // durchhängender Balken
    for (let x = x0; x <= x1; x++) {
      const d = sag && x > 7 && x < 13 ? 1 : 0;
      p.px(x, 2 + d, PLANK[hash2(x, v, s + 1) < 0.25 ? 6 : 5]); p.px(x, 3 + d, PLANK[2]); p.px(x, 4 + d, PLANK[1]);
    }
    for (let y = 5; y < 10; y++) for (let x = x0; x <= x1 + 1; x++) p.px(x, y, rgba(2, 6, 4, 0.5 - (y - 5) * 0.09));
    const pxs = [L ? 5 : x0 + 1, R ? 13 : x1 - 2][v];
    for (let y = 2; y < 11; y++) { p.px(pxs, y, PLANK[y < 5 ? 5 : 3]); p.px(pxs + 1, y, PLANK[y < 5 ? 3 : 1]); }
    p.px(pxs, 7, MOSS[4]); p.px(pxs + 1, 8, MOSS[3]); if (v === 0) beard(p, pxs + 1, 5, 4, s);
    p.px(pxs - 1, 11, SW[4]); p.px(pxs + 2, 11, SW[4]); p.px(pxs, 12, SW[3]); p.px(pxs + 1, 12, SW[3]);
    for (let y = 12; y < 15; y++) if (y % 2) p.px(pxs, y, rgba(10, 16, 12, 0.6));
    if (!L) { p.px(x0 - 1, 3, PLANK[2]); p.px(x0 - 1, 4, PLANK[1]); }
  });
}
// Einzelner schiefer Pfahl neben dem Steg (fest)
function walkPost(v) {
  const H = 26;
  return flat(10, H, 5, H - 6, (p) => {
    const lean = v === 0 ? 1 : v === 1 ? -1 : 0, h = [16, 12, 19][v];
    for (let y = H - 6 - h; y < H - 4; y++) {
      const x = 4 + Math.round(lean * (H - 6 - y) / h);
      p.px(x, y, PLANK[y < H - 6 - h + 2 ? 6 : 4]); p.px(x + 1, y, PLANK[2]);
    }
    const tx = 4 + lean;
    p.px(tx, H - 6 - h, PLANK[7]);
    for (let k = 0; k < 3; k++) p.px(4 + lean * (k / 3) | 0, H - 10 - k * 3, MOSS[3 + k % 2]);
    if (v !== 1) { p.line(tx + 1, H - 6 - h + 3, tx + 3, H - 6 - h + 5, BEARD[2]); beard(p, tx + 2, H - h - 2, 4, v); }
    p.px(2, H - 4, SW[4]); p.px(7, H - 4, SW[4]); p.px(3, H - 3, SW[3]); p.px(6, H - 3, SW[3]);
    for (let y = H - 3; y < H; y++) if (y % 2) p.px(4, y, rgba(10, 16, 12, 0.6));
  });
}
// Vertäuter Kahn neben dem Steg
function mooredBoat(v) {
  const W = 36, H = 20, wl = 13, s = v ? -1 : 1;
  return mk(W, H, (p) => {
    for (let y = wl; y < H; y++) for (let x = 2; x < W - 2; x++) if (((x + y) & 1) && Math.abs(x - 18) / 16 + (y - wl) / 6 < 1) p.px(x, y, rgba(2, 8, 6, 0.55));
    // Rumpf (spitz an beiden Enden)
    for (let x = 4; x < W - 4; x++) {
      const t = Math.abs(x - 18) / 14, d = Math.round(5 * Math.sqrt(Math.max(0, 1 - t * t)));
      const yt = wl - 2 - d + Math.round(t * t * 3);
      for (let y = yt; y <= wl + 1; y++) {
        let k = y === yt ? 6 : y === yt + 1 ? 2 : y > wl - 1 ? 2 : 4;
        if ((y - yt) === 3 && hash2(x, 0, 3400 + v) < 0.7) k = 3;
        if (hash2(x, y, 3401 + v) < 0.08) k--;
        p.px(x, y, ROT[clampI(k, 7)]);
      }
      if (d > 1) for (let y = yt + 1; y < yt + 1 + Math.max(1, d - 2); y++) p.px(x, y, INTERIOR);
    }
    p.rect(13, wl - 6, 2, 3, ROT[5]); p.rect(22, wl - 6, 2, 3, ROT[4]);           // Ruderbänke
    p.line(10, wl - 4, 26, wl - 6, ROT[5]);                                      // Ruder im Boot
    if (v === 0) { p.rect(17, wl - 7, 4, 3, '#4a4436'); p.px(18, wl - 7, '#6a6250'); } // Korb
    // Tau zum Steg (nach oben)
    const tx = s > 0 ? 6 : W - 7;
    p.line(tx, wl - 3, tx - s * 3, 0, BEARD[3]); p.px(tx - s * 3, 0, BEARD[4]);
    for (let x = 4; x < W - 4; x += 3) if (hash2(x, v, 3402) < 0.6) p.px(x, wl + 2, SW[4]);
  }, { ay: wl });
}
// Fischreuse / Netzgestell im Wasser
function netRack(v) {
  const W = 30, H = 34;
  return mk(W, H, (p) => {
    const by = H - 4;
    for (const x of [3, 25]) { pole(p, x, 3 + (x > 10 ? 2 : 0), by, 2, ROT, 3410 + x); ripple(p, x, by + 1, 1); }
    p.line(3, 5, 26, 7, ROT[4]); p.line(3, 6, 26, 8, ROT[2]);
    for (let y = 8; y < by - 2; y++) for (let x = 5; x < 25; x++) {
      const sag = Math.round(Math.sin((x - 5) / 20 * Math.PI) * 3);
      if (y > by - 4 + sag - (v ? 4 : 0)) continue;
      if ((x + y) % 3 === 0 || (x - y + 60) % 3 === 0) if (hash2(x, y, 3412 + v) < 0.82) p.px(x, y, (x + y) % 2 ? BEARD[3] : BEARD[2]);
    }
    // Schwimmer und hängender Tang
    for (let x = 7; x < 24; x += 5) { p.px(x, 7, '#7a6a4a'); p.px(x + 1, 7, '#5a4a32'); }
    beard(p, 12, 12, 6, v + 3); beard(p, 20, 10, 5, v + 5);
    if (v === 1) for (const fx of [9, 15, 21]) { p.rect(fx, 9, 2, 4, '#6a6a5a'); p.px(fx, 9, '#9a9a82'); }
    for (let x = 2; x < W - 2; x += 2) if (hash2(x, v, 3413) < 0.5) p.px(x, by + 2, SW[4]);
  }, { ay: H - 4, box: [-13, -4, 13, 2] });
}
// Egelgelege: glitschige Eierballen mit fahlem Leuchten
function leechClutch(v) {
  const W = 28, H = 18;
  return mk(W, H, (p, g) => {
    const eggs = [[[8, 10, 4, 3], [15, 9, 5, 4], [21, 11, 3, 2.4], [12, 13, 3, 2]], [[10, 11, 5, 3.4], [17, 10, 3.6, 3], [20, 13, 3, 2], [6, 13, 2.4, 1.8]]][v];
    if (p.fine) {
      // Stufe B: glänzende Gallertkugeln (harte Stufen, Glanzpunkt), Embryos als dunkle Kerne mit fahlem Schein
      fMud(p, 14, 13, 12, 4, 3420 + v, true);
      for (const [x, y, rx, ry] of eggs) {
        const X = x + 0.5, Y = y + 0.5;
        lump(p, X, Y, rx + 0.4, ry + 0.4, FLESH, { lo: 1, hi: 4, bias: -0.05 });
        for (let k = 0; k < 3; k++) {
          const ex = Math.round(x - rx + 1 + hash2(k, x, 3421) * (rx * 2 - 2)) + 0.5, ey = Math.round(y - ry + 1 + hash2(k, y, 3422) * (ry * 2 - 2)) + 0.5;
          p.oval(ex, ey, 0.7, 0.55, '#2a1a10'); p.dot(ex - 0.25, ey - 0.25, '#4a3a20');
          g.dot(ex - 0.25, ey - 0.25, '#6a9a40'); g.dot(ex + 0.25, ey - 0.25, '#3a5a28'); g.dot(ex - 0.25, ey + 0.25, '#3a5a28');
        }
        p.dot(X - rx * 0.45, Y - ry * 0.5, '#d8a8c0'); p.dot(X - rx * 0.45 + 0.5, Y - ry * 0.5, FLESH[5]); p.dot(X - rx * 0.45, Y - ry * 0.5 + 0.5, FLESH[5]);
        g.dot(X, Y, '#3a5a28');
      }
      for (let k = 0; k < 5; k++) { const x = 4 + Math.floor(hash2(k, v, 3423) * 20); p.fline(x + 0.25, 15.25, x + 1.25, 16.75, '#4a5a3a'); p.dot(x + 0.25, 15.25, '#8a9a68'); }
      return;
    }
    mudPatch(p, 14, 13, 12, 4, 3420 + v, true);
    for (const [x, y, rx, ry] of eggs) {
      p.ellipse(x, y, rx, ry, FLESH[2]);
      p.ellipse(x - 0.6, y - 0.6, rx - 1, ry - 1, FLESH[3]);
      p.px(Math.round(x - rx / 2), Math.round(y - ry / 2), FLESH[5]);
      for (let k = 0; k < 3; k++) { const ex = Math.round(x - rx + 1 + hash2(k, x, 3421) * (rx * 2 - 2)), ey = Math.round(y - ry + 1 + hash2(k, y, 3422) * (ry * 2 - 2)); p.px(ex, ey, '#2a1a10'); g.px(ex, ey, '#4a6a30'); }
      g.px(Math.round(x), Math.round(y), '#3a5a28');
    }
    for (let k = 0; k < 5; k++) { const x = 4 + Math.floor(hash2(k, v, 3423) * 20); p.px(x, 15, '#6a7a50'); p.px(x + 1, 16, '#4a5a3a'); } // Schleim
  }, { ay: 14, box: [-10, -6, 10, 2], b: true });
}
// Trockengestell mit Fischen und Fellen am Ufer
function dryingRack(v) {
  const W = 30, H = 34;
  return mk(W, H, (p) => {
    const by = H - 2;
    for (const x of [3, 25]) { pole(p, x, 4, by, 2, ROT, 3430 + x); }
    p.line(2, 6, 4, 2, ROT[5]); p.line(4, 6, 2, 2, ROT[4]); p.line(24, 6, 26, 2, ROT[5]); p.line(26, 6, 24, 2, ROT[4]);
    p.rect(3, 4, 24, 2, ROT[5]); p.rect(3, 4, 24, 1, ROT[6]);
    if (v === 0) {
      for (let k = 0; k < 6; k++) { const fx = 6 + k * 3; const l = 6 + (k % 2) * 2; p.line(fx, 6, fx, 7, BEARD[2]); p.rect(fx - 1, 8, 2, l, '#6a6a5a'); p.px(fx - 1, 8, '#9a9a82'); p.px(fx, 8 + l, '#3a3a30'); p.px(fx - 1, 8 + l + 1, '#5a5a48'); }
    } else {
      // Fell aufgespannt
      for (let y = 7; y < 22; y++) for (let x = 7; x < 23; x++) { const e = ((x - 15) / 8) ** 2 + ((y - 14) / 7.5) ** 2; if (e > 1) continue; p.px(x, y, ['#3a2a1c', '#4c3624', '#5e4630'][(x + 2 * y + (hash2(x, y, 3431) * 3 | 0)) % 3]); }
      for (const [a, b] of [[8, 8], [22, 8], [8, 20], [22, 20]]) p.line(a, b, a < 15 ? 4 : 25, b < 14 ? 6 : 22, BEARD[3]);
    }
    for (let x = 1; x < W - 1; x++) if (hash2(x, v, 3432) < 0.35) p.px(x, by, MUD[2]);
  }, { ay: H - 2, box: [-13, -4, 13, 1] });
}

export function createMarshDecor() {
  return {
    willowTrees: [willowTree(1001, 58, 0), willowTree(1013, 64, 1), willowTree(1027, 52, 2)],
    deadStumps: [0, 1, 2].map(deadStump),
    reeds: [0, 1, 2].map(reeds),
    mushrooms: [0, 1, 2].map(mushrooms),
    mossRocks: [0, 1, 2].map(mossRock),
    stiltHut: stiltHut(),
    palisade: palisadeH(),
    palisadeV: palisadeV(),
    watchtower: watchtower(),
    bannerPole: bannerPole(),
    campfireBig: campfireBig(),
    rotTotem: { off: rotTotem(false), on: rotTotem(true) },
    caravanWreck: caravanWreck(),
    sunkenHouse: [0, 1].map(sunkenHouse),
    sporeGate: sporeGate(),
    lanternPost: lanternPost(),
    // Runde 5: Inselarchipel
    deckCarrierPost: [0, 1, 2].map((v) => deckCarrier(v, true)),
    deckCarrier: [0, 1, 2].map((v) => deckCarrier(v, false)),
    deckCarrierLantern: deckCarrier(0, true, true),
    deckBoards: [0, 1, 2].map(deckBoards),
    deckEdge: [0, 1, 2].map(deckEdge),
    stegPost: [0, 1, 2].map((v) => stegNS(v, true)),
    stegBoards: [0, 1, 2].map((v) => stegNS(v, false)),
    deckWideL: [0, 1].map((v) => stegNS(v, v === 0, 'L')),
    deckWideR: [0, 1].map((v) => stegNS(v, v === 0, 'R')),
    fordShallows: [0, 1, 2, 3].map(fordShallows),
    damBankN: [0, 1, 2].map((v) => damBank(v, false)),
    damBankS: [0, 1, 2].map((v) => damBank(v, true)),
    damStakesL: [0, 1, 2].map((v) => damStakes(v, -1)),
    damStakesR: [0, 1, 2].map((v) => damStakes(v, 1)),
    lilyPads: [0, 1, 2].map(lilyPads),
    sunkenRoof: [0, 1, 2].map(sunkenRoof),
    mistWisps: [0, 1, 2].map(mistWisps),
    drownedBoat: [0, 1].map(drownedBoat),
    giantShroom: [0, 1, 2].map(giantShroom),
    witchHut: witchHut(),
    witchChest: { off: cacheChest('witch', false), on: cacheChest('witch', true) },
    chapelChest: { off: cacheChest('chapel', false), on: cacheChest('chapel', true) },
    drownedTree: [0, 1, 2].map(drownedTree),
    willWisp: [0, 1, 2].map(willWisp),
    marshGraves: [0, 1, 2].map(marshGraves),
    rotTotemBone: { off: rotTotem(false, 'bone'), on: rotTotem(true, 'bone') },
    rotTotemMoss: { off: rotTotem(false, 'moss'), on: rotTotem(true, 'moss') },
    rotTotemMud: { off: rotTotem(false, 'mud'), on: rotTotem(true, 'mud') },
    lanternRed: { off: questLantern('red', false), on: questLantern('red', true) },
    lanternGreen: { off: questLantern('green', false), on: questLantern('green', true) },
    lanternBlue: { off: questLantern('blue', false), on: questLantern('blue', true) },
    lanternWhite: { off: questLantern('white', false), on: questLantern('white', true) },
    hagCauldron: { off: hagCauldron(false), on: hagCauldron(true) },
    // Runde 5/2: knorrige Stege und Pfahldorf
    ...Object.fromEntries(['00', '01', '10', '11'].flatMap((f) => [['walkY' + f, [0, 1].map((v) => walkY(f, v))], ['walkX' + f, [0, 1].map((v) => walkX(f, v))], ['walkRim' + f, [0, 1].map((v) => walkRim(f, v))]])),
    walkPost: [0, 1, 2].map(walkPost),
    mooredBoat: [0, 1].map(mooredBoat),
    netRack: [0, 1].map(netRack),
    leechClutch: [0, 1].map(leechClutch),
    dryingRack: [0, 1].map(dryingRack),
  };
}
