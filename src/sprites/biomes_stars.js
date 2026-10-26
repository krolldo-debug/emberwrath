import { PixelCanvas, makeCanvas } from '../gfx/PixelCanvas.js';
import { col32 } from '../gfx/Fine.js';
import { createRng, hash2 } from '../core/math.js';
import { vnoise } from './biomes.js';
import { FineTile, C32, rampIndex, stepQ, bayer } from './biomes_barrow_spore.js';
import { createStarDungeonProps } from './props_stars.js';

// Kacheln der drei Dungeons der Sternenscherben (Teil 1, Stufe 42–50), Format wie createBiomeTiles() in biomes.js:
//   'thorn'  – Die Rankengruft: Gruft unter König Aurels Gartenterrassen, heller Perlstein, Moos in den Fugen,
//              Wurzeln quer über den Platten, verwehte Blütenblätter, ein stiller Teich mit Seerosen.
//   'glass'  – Die Gläsernen Hallen: Palast aus Rauchglas in Silberrahmen, Spiegelungen, Sprünge mit Glanz,
//              Abgründe, durch die man den Sternenhimmel unter der Insel sieht.
//   'vault'  – Die Sternwarte: nachtblaue Platten mit Goldeinlagen, Windrosen, eingelegte Sternbilder.
// Boden = 32×32-Makrokacheln, fein (64×64 Texel, Qualität „Hoch“) und grob (aus der feinen verkleinert);
// Wandfront oben/unten, Wandkrone, Flüssigkeit (4 Frames, Glow, Uferkante). Licht von links oben.
const T = 16;
const cl = (r, i) => r[Math.max(0, Math.min(r.length - 1, i))];

// ------------------------------------------------------------------ Rampen
// Rankengruft
const TS = ['#0d0b13', '#17141f', '#221d2c', '#2f293b', '#3f374d', '#544a63', '#6e627e'];   // Perlstein im Dunkel
const MOSS = ['#0b130f', '#122019', '#1a2e22', '#25402c', '#335636', '#476e42', '#62884e'];
const ROOT = ['#0e090c', '#181014', '#24181c', '#332226', '#452e30', '#5a3c3a', '#704c44'];
const BLOS = ['#3a1630', '#5a2448', '#8a3a6a', '#c86a98', '#eca0c0', '#ffd8ea'];
const POND = ['#04060a', '#070b12', '#0b111c', '#101a28', '#172436', '#203246', '#2e4658'];
const TGROUT = '#07060a';
// Gläserne Hallen
const GL = ['#06080f', '#0a0f1c', '#10182c', '#17223c', '#202f50', '#2c3f66', '#3e5680'];   // Rauchglas
const SIL = ['#1a1e2c', '#2a3044', '#4a5470', '#6e7a98', '#9aa6c2', '#cad4ea', '#f2f6ff'];  // Silber
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const GGROUT = '#04050a';
// Sternwarte
const NV = ['#05060d', '#090b18', '#0e1224', '#141a32', '#1c2442', '#263154', '#344268'];   // Nachtblau
const GD = ['#3a2810', '#6a4a1a', '#9c7028', '#cc9c3c', '#ecc862', '#fff0b0'];             // Gold
const STW = ['#3a4670', '#6a7ab0', '#a8b8ec', '#e8eeff'];                                   // Sternweiß
const VGROUT = '#030409';
// Leere unter den Inseln (Abgründe der Hallen und der Sternwarte)
const VOID = ['#020208', '#05040e', '#090716', '#0e0b20', '#16102e', '#201640', '#2e1e56'];

// Unregelmäßige Rechteckteilung (Platten), wie biomes_rime_throne.js
function splitRects(rng, x, y, w, h, out, min = 6, depth = 0) {
  const canV = w >= min * 2, canH = h >= min * 2;
  if ((!canV && !canH) || (depth > 1 && rng.chance(0.35))) { out.push([x, y, w, h]); return; }
  const vertical = canV && (!canH || rng.chance(w / (w + h)));
  const cut = rng.int(min, (vertical ? w : h) - min);
  if (vertical) { splitRects(rng, x, y, cut, h, out, min, depth + 1); splitRects(rng, x + cut, y, w - cut, h, out, min, depth + 1); }
  else { splitRects(rng, x, y, w, cut, out, min, depth + 1); splitRects(rng, x, y + cut, w, h - cut, out, min, depth + 1); }
}

// Gefaste Platte im Texelraster (Weltpixel x, y, w, h): Fuge oben/links, Lichtfase, Schattenfase, Körnung
function slab(t, xr, x, y, w, h, R, base, grout, grain = 0.05) {
  const X0 = 2 * x, Y0 = 2 * y, X1 = 2 * (x + w) - 1, Y1 = 2 * (y + h) - 1, W = 2 * w, H = 2 * h;
  t.fill(X0, Y0, W, H, R[base]);
  if (h > 5) t.fill(X0 + 2, Y1 - 2, W - 3, 2, R[base - 1]);
  for (let i = 0; i < W * H * grain; i++) {
    const X = X0 + 2 + xr.int(0, W - 4), Y = Y0 + 2 + xr.int(0, H - 4);
    t.set(X, Y, xr.chance(0.6) ? R[base - 1] : cl(R, base + 1));
  }
  t.fill(X0, Y0, W, 1, grout); t.fill(X0, Y0, 1, H, grout);
  t.fill(X0 + 1, Y0 + 1, W - 2, 1, cl(R, base + 1)); t.fill(X0 + 1, Y0 + 1, 1, H - 2, cl(R, base + 1));
  t.fill(X0 + 1, Y1, W - 1, 1, R[Math.max(0, base - 2)]); t.fill(X1, Y0 + 1, 1, H - 1, R[Math.max(0, base - 1)]);
  t.set(X0 + 2, Y0 + 1, cl(R, base + 2)); t.set(X0 + 1, Y0 + 2, cl(R, base + 2));
  return { X0, Y0, X1, Y1 };
}

// Strang (Wurzel) im Texelraster: Polygonzug in Texeln, Breite w (Texel), rund schattiert, Schlagschatten unten
function strand(t, pts, w0, w1, R) {
  const cells = new Map();
  let len = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push([pts[i - 1], pts[i], len, l]); len += l; }
  for (const [[ax, ay], [bx, by], s0, l] of segs) {
    for (let s = 0; s <= l; s += 0.5) {
      const k = (s0 + s) / len, hw = (w0 + (w1 - w0) * k) / 2;
      const x = ax + ((bx - ax) * s) / l, y = ay + ((by - ay) * s) / l, nx = -(by - ay) / l, ny = (bx - ax) / l;
      for (let o = -hw; o <= hw; o += 0.5) {
        const X = Math.round(x + nx * o), Y = Math.round(y + ny * o), key = Y * 64 + X;
        if (X < 0 || Y < 0 || X > 63 || Y > 63) continue;
        const side = (o / Math.max(hw, 0.5)) * Math.sign(ny || 1);   // −1 = Oberkante (Licht)
        const prev = cells.get(key);
        if (prev === undefined || Math.abs(side) < Math.abs(prev)) cells.set(key, side);
      }
    }
  }
  for (const key of cells.keys()) { const X = key % 64, Y = (key / 64) | 0; for (const d of [1, 2]) if (!cells.has(key + d * 64)) t.shade(X + 1, Y + d, 2); }
  for (const [key, side] of cells) {
    const X = key % 64, Y = (key / 64) | 0;
    t.set(X, Y, R[side < -0.55 ? 5 : side < -0.1 ? 4 : side < 0.45 ? 3 : 2]);
  }
}

// Kleiner Stern (Funkeln): Mitte hell, vier Spitzen
function sparkle(t, X, Y, S, big = false) {
  t.set(X, Y, S[3]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) t.set(X + dx, Y + dy, S[1]);
  if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) t.set(X + dx, Y + dy, S[0]);
}

// Grobe Kachel (Qualität „Niedrig“) aus der feinen: jeder zweite Texel
function coarse(fine) {
  const c = makeCanvas(32, 32), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(fine, 0, 0, 64, 64, 0, 0, 32, 32);
  return c;
}

// ================================================================== Böden
function thornFloor(count = 10, seed = 4201) {
  const rng = createRng(seed), K = C32(TS), M = C32(MOSS), R = C32(ROOT), B = C32(BLOS), g = col32(TGROUT);
  const idx = rampIndex([K, M, R]);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const t = new FineTile(idx), xr = createRng(seed * 31 + n * 97);
    t.b.fill(g);
    const rects = [];
    splitRects(rng, 0, 0, 32, 32, rects, 6);
    for (const [x, y, w, h] of rects) slab(t, xr, x, y, w, h, K, rng.pick([2, 3, 3, 4]), g);
    // Moos: wächst aus den Fugen in die Platten, Flecken nach einem weichen Rauschfeld, nie am Kachelrand (Nahtfrei)
    const ms = seed + n * 13, amount = n % 3 === 0 ? 0.5 : 0.6;
    for (let Y = 1; Y < 63; Y++) for (let X = 1; X < 63; X++) {
      const edge = Math.min(X, Y, 63 - X, 63 - Y) / 10;
      const v = vnoise(X, Y, 11, ms) * 0.75 + vnoise(X, Y, 4, ms + 1) * 0.25 - (1 - Math.min(1, edge)) * 0.4;
      if (v < amount) continue;
      const nearGrout = t.get(X, Y) === g || t.get(X - 1, Y) === g || t.get(X, Y - 1) === g || t.get(X + 1, Y) === g || t.get(X, Y + 1) === g;
      if (!nearGrout && v < amount + 0.12) continue;
      const k = stepQ(1.2 + (v - amount) * 9 - (t.get(X, Y + 1) === g ? 1 : 0), bayer(X, Y));
      t.set(X, Y, M[Math.max(1, Math.min(4, k + (t.get(X, Y - 1) === g ? 0 : 1)))]);
    }
    // Wurzel quer über die Platten
    if (n % 2 === 1 || n === 4) {
      const y0 = xr.int(14, 50), pts = [];
      for (let X = -2, Y = y0; X <= 66; X += 8) { pts.push([X, Y]); Y += xr.int(-5, 5); }
      strand(t, pts, 4 + xr.int(0, 1), 2, R);
      const bx = pts[2][0], by = pts[2][1];
      strand(t, [[bx, by], [bx + 6, by + 7], [bx + 9, by + 15]], 2, 1, R);
    }
    // Blütenblätter (verweht, 2×1 Texel) und weiße Sternblüten
    for (let k = 0; k < xr.int(2, 6); k++) {
      const X = xr.int(3, 59), Y = xr.int(3, 59);
      t.set(X, Y, B[xr.pick([3, 4, 3])]); t.set(X + 1, Y, B[2]); t.shade(X, Y + 1, 1);
    }
    if (xr.chance(0.5)) {
      const X = xr.int(6, 56), Y = xr.int(6, 56);
      t.set(X, Y, B[5]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) t.set(X + dx, Y + dy, B[4]); t.set(X, Y + 1, M[3]);
    }
    tiles.push(t.done());
  }
  return tiles;
}

function glassFloor(count = 8, seed = 4601) {
  const G = C32(GL), S = C32(SIL), Cc = C32(CRY), g = col32(GGROUT);
  const idx = rampIndex([G, S]);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const t = new FineTile(idx), xr = createRng(seed * 17 + n * 59);
    // 2×2 Glasplatten je Makrokachel (16 Weltpixel), Silberrahmen; Spiegelung als schräges Band
    for (let q = 0; q < 4; q++) {
      const X0 = (q & 1) * 32, Y0 = (q >> 1) * 32, base = xr.pick([2, 3, 3]), band = xr.int(-14, 14);
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
        const X = X0 + i, Y = Y0 + j;
        // Tiefe: heller oben links, Spiegelband diagonal
        let v = base + 0.9 - (i + j) / 40;
        const dg = i - j - band;
        if (dg > -3 && dg < 4) v += 1;
        if (dg > 6 && dg < 8) v += 0.6;
        t.set(X, Y, G[Math.max(1, Math.min(5, stepQ(v, bayer(X, Y))))]);
      }
      // Rahmen: Fuge, dann Silberleiste mit Lichtkante oben links
      t.fill(X0, Y0, 32, 1, g); t.fill(X0, Y0, 1, 32, g);
      t.fill(X0 + 1, Y0 + 1, 31, 1, S[3]); t.fill(X0 + 1, Y0 + 1, 1, 31, S[3]);
      t.fill(X0 + 1, Y0 + 31, 31, 1, S[1]); t.fill(X0 + 31, Y0 + 1, 1, 31, S[1]);
      t.set(X0 + 2, Y0 + 1, S[5]); t.set(X0 + 1, Y0 + 2, S[4]);
      t.fill(X0 + 2, Y0 + 2, 29, 1, G[1]); t.fill(X0 + 2, Y0 + 2, 1, 29, G[1]);
      // Eingelegte Silberrosette an der Kreuzung
      t.set(X0, Y0, S[5]); t.set(X0 + 1, Y0 + 1, S[4]);
      // Sprung mit Glanz
      if (xr.chance(n % 3 === 1 ? 0.6 : 0.15)) {
        let X = X0 + xr.int(6, 24), Y = Y0 + xr.int(4, 10);
        const n2 = xr.int(8, 16);
        for (let k = 0; k < n2; k++) {
          t.set(X, Y, k % 5 === 2 ? S[6] : S[4]); t.set(X + 1, Y + 1, G[0]);
          if (k === 4) for (let b = 1; b < 5; b++) t.set(X - b, Y + b, b < 3 ? S[3] : S[2]);
          X += xr.pick([1, 1, 0]); Y += 1;
        }
      }
      // Sternenschimmer tief im Glas
      for (let k = 0; k < 3; k++) { const X = X0 + xr.int(4, 28), Y = Y0 + xr.int(4, 28); t.set(X, Y, xr.chance(0.3) ? Cc[3] : G[5]); }
    }
    tiles.push(t.done());
  }
  return tiles;
}

function vaultFloor(count = 12, seed = 4901) {
  const rng = createRng(seed), N = C32(NV), Gd = C32(GD), W = C32(STW), g = col32(VGROUT);
  const idx = rampIndex([N, Gd]);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const t = new FineTile(idx), xr = createRng(seed * 23 + n * 71);
    t.b.fill(g);
    if (n === 0) {
      // Windrose in Gold auf einer großen Platte
      slab(t, xr, 0, 0, 32, 32, N, 3, g, 0.02);
      const cx = 32, cy = 32;
      t.ell(cx, cy, 22, 22, (X, Y, dx, dy, q) => { if (q <= 1 && q > 0.86) t.set(X, Y, Gd[q > 0.93 ? 2 : 3]); });
      t.ell(cx, cy, 15, 15, (X, Y, dx, dy, q) => { if (q <= 1 && q > 0.82) t.set(X, Y, Gd[2]); });
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4, L = a % 2 ? 13 : 21, wd = a % 2 ? 2 : 3.4;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        for (let s = 0; s <= L; s += 0.5) {
          const hw = wd * (1 - s / L);
          for (let o = -hw; o <= hw; o += 0.5) {
            const X = Math.round(cx + ux * s - uy * o), Y = Math.round(cy + uy * s + ux * o);
            t.set(X, Y, Gd[o < 0 ? (a % 2 ? 3 : 4) : 2]);
          }
        }
      }
      t.set(cx, cy, Gd[5]); t.set(cx - 1, cy, Gd[4]); t.set(cx, cy - 1, Gd[4]);
    } else {
      const rects = [];
      splitRects(rng, 0, 0, 32, 32, rects, 8);
      for (const [x, y, w, h] of rects) {
        const r = slab(t, xr, x, y, w, h, N, rng.pick([2, 3, 3]), g, 0.03);
        // Goldleiste entlang mancher Plattenkanten
        if (xr.chance(0.3) && w > 9) t.fill(r.X0 + 3, r.Y1 - 3, r.X1 - r.X0 - 5, 1, Gd[2]);
      }
      // Eingelegtes Sternbild: 3–5 Sterne, feine Linien dazwischen
      if (n % 2 === 1) {
        const pts = [];
        let X = xr.int(10, 22), Y = xr.int(10, 22);
        for (let k = 0, m = xr.int(3, 5); k < m; k++) { pts.push([X, Y]); X += xr.int(6, 12); Y += xr.int(-8, 10); X = Math.min(56, X); Y = Math.max(6, Math.min(56, Y)); }
        for (let k = 1; k < pts.length; k++) t.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], (lx, ly, i) => { if (i % 3 !== 2) t.set(lx, ly, N[6]); });
        pts.forEach(([sx, sy], k) => sparkle(t, sx, sy, W, k === 0));
      }
    }
    for (let k = 0; k < xr.int(2, 5); k++) t.set(xr.int(2, 61), xr.int(2, 61), W[xr.pick([1, 2])]);
    tiles.push(t.done());
  }
  return tiles;
}

// ================================================================== Wände
// Quaderreihe: Blöcke aus Rampe R, Licht oben links
function course(p, rng, y0, rh, R, dark = 0, min = 6, max = 11) {
  let x = -rng.int(0, 6);
  while (x < T) {
    const bw = rng.int(min, max), k = rng.pick([2, 3, 3, 4]) - dark;
    p.rect(x, y0, bw - 1, rh - 1, R[k]);
    p.rect(x, y0, bw - 1, 1, R[k + 1]); p.px(x, y0, R[k + 2]);
    p.rect(x, y0 + rh - 2, bw - 1, 1, R[k - 1]);
    p.rect(x + bw - 2, y0 + 1, 1, rh - 2, R[k - 1]);
    x += bw;
  }
}
const ao = (p, a = 0.38) => { p.ctx.fillStyle = `rgba(2,2,8,${a})`; p.ctx.fillRect(0, 9, T, 7); p.ctx.fillStyle = `rgba(2,2,8,${a * 0.8})`; p.ctx.fillRect(0, 12, T, 4); };

function thornFaces(count = 8, seed = 4231) {
  const rng = createRng(seed);
  const vine = (p, x, y, len, v) => {
    for (let i = 0; i < len; i++) {
      const sx = x + Math.round(Math.sin((i + v) * 0.8) * 0.6);
      p.px(sx, y + i, i % 3 === 0 ? MOSS[4] : MOSS[3]);
      if (i % 3 === 1) p.px(sx + (i & 2 ? 1 : -1), y + i, MOSS[5]);
      if (i % 4 === 3) p.px(sx + (i & 4 ? -1 : 1), y + i, ROOT[5]);       // Dorn
    }
    if ((x + v) % 3 === 0) { p.px(x, y + len, BLOS[3]); p.px(x + 1, y + len, BLOS[2]); p.px(x, y + len - 1, BLOS[4]); }
  };
  const upper = [], lower = [];
  for (let v = 0; v < count; v++) {
    let p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, TGROUT);
    course(p, rng, 1, 6, TS); course(p, rng, 7, 5, TS); course(p, rng, 12, 4, TS, 1);
    // Moospolster an der Mauerkrone, Ranken hängen herab
    for (let x = 0; x < T; x++) { const d = 1 + ((x * 5 + v) % 4 === 0 ? 1 : 0) + ((x * 3 + v * 2) % 7 === 0 ? 1 : 0); for (let y = 0; y < d; y++) p.px(x, y, y === d - 1 ? MOSS[2] : MOSS[4]); }
    for (let i = 0; i < 1 + (v % 3); i++) vine(p, (v * 5 + i * 6 + 2) % 15, 1, 5 + ((v + i * 2) % 7), v + i);
    upper.push(p.canvas);
    p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, TGROUT);
    course(p, rng, 0, 6, TS); course(p, rng, 6, 5, TS); course(p, rng, 11, 5, TS, 1);
    if (v % 2 === 0) vine(p, (v * 7 + 3) % 15, 0, 6 + (v % 5), v);
    // Wurzel bricht aus der Mauer
    if (v % 3 === 1) { const x0 = (v * 3 + 4) % 12; for (let i = 0; i < 9; i++) { const x = x0 + Math.round(i * 0.5), y = 4 + i; p.px(x, y, ROOT[4]); p.px(x + 1, y, ROOT[3]); p.px(x - 1, y, ROOT[2]); } }
    ao(p);
    for (let x = 0; x < T; x++) { const h = 1 + ((x * 3 + v) % 4 === 0 ? 1 : 0) + ((x + v * 2) % 5 === 0 ? 1 : 0); for (let y = 0; y < h; y++) p.px(x, 15 - y, y === h - 1 ? MOSS[3] : MOSS[2]); }
    lower.push(p.canvas);
  }
  return { upper, lower };
}

function glassFaces(count = 8) {
  const upper = [], lower = [];
  for (let v = 0; v < count; v++) {
    // Oben: hohes Glasfenster in Silberrahmen, hinter dem Glas der Nachthimmel
    let p = new PixelCanvas(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = x - y * 0.5 + v * 3;
      p.px(x, y, ((d % 16) + 16) % 16 < 3 ? GL[5] : y < 6 ? GL[3] : GL[4]);
    }
    if (v % 3 === 0) p.px((v * 5 + 4) & 15, (v * 3 + 3) % 10, CRY[4]);
    p.px((v * 7 + 9) & 15, (v * 5 + 7) % 12, SIL[4]);
    p.rect(0, 0, 1, T, SIL[3]); p.rect(15, 0, 1, T, SIL[1]); p.rect(0, 0, T, 1, SIL[5]); p.rect(1, 1, 14, 1, SIL[2]);
    if (v % 2) p.rect(8, 1, 1, 15, SIL[2]);
    upper.push(p.canvas);
    // Unten: Sockel aus dunklem Stein mit Silberband, darunter Glas
    p = new PixelCanvas(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.px(x, y, y < 6 ? ((x - y + v * 3) & 15) < 3 ? GL[5] : GL[4] : y < 8 ? SIL[y === 6 ? 4 : 2] : (x + (y > 11 ? 8 : 0)) % 16 === 0 ? GGROUT : y === 8 ? GL[3] : GL[2]);
    p.rect(0, 0, 1, 6, SIL[3]); p.rect(15, 0, 1, 6, SIL[1]); p.px(4 + (v % 6), 6, SIL[6]);
    ao(p, 0.3);
    lower.push(p.canvas);
  }
  return { upper, lower };
}

function vaultFaces(count = 8, seed = 4931) {
  const rng = createRng(seed);
  const upper = [], lower = [];
  for (let v = 0; v < count; v++) {
    // Oben: Quader aus Nachtstein, Goldfries mit Sternen an der Krone
    let p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, VGROUT);
    course(p, rng, 4, 6, NV); course(p, rng, 10, 6, NV, 1);
    p.rect(0, 0, T, 1, GD[4]); p.rect(0, 1, T, 2, NV[2]); p.rect(0, 3, T, 1, GD[2]);
    for (let x = (v * 3) % 8; x < T; x += 8) { p.px(x, 2, GD[4]); p.px(x, 1, GD[3]); }
    if (v % 3 === 1) { const x = 4 + (v % 8); p.px(x, 7, STW[2]); p.px(x - 1, 7, STW[0]); p.px(x + 1, 7, STW[0]); p.px(x, 6, STW[1]); p.px(x, 8, STW[0]); }
    upper.push(p.canvas);
    // Unten: Täfelung mit Goldleiste
    p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, NV[2]);
    course(p, rng, 0, 5, NV);
    p.rect(0, 5, T, 1, GD[3]); p.rect(0, 6, T, 1, GD[1]);
    for (let x = v % 2 ? 0 : 8; x < T; x += 16) { p.rect(x, 7, 1, 9, NV[1]); p.rect(x + 1, 7, 1, 9, NV[4]); }
    p.rect(0, 7, T, 1, NV[4]);
    ao(p, 0.32);
    lower.push(p.canvas);
  }
  return { upper, lower };
}

function topTile(seed, base, dots) {
  const rng = createRng(seed), p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, base);
  for (let i = 0; i < 30; i++) p.px(rng.int(0, 15), rng.int(0, 15), rng.pick(dots));
  return p.canvas;
}

// ================================================================== Flüssigkeiten
// Teich der Rankengruft: dunkles Wasser, Wellen, Seerosenblätter, treibende Blütenblätter
function pondLiquid() {
  const frames = [], glow = [];
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T), ph = (f / 4) * Math.PI * 2;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = Math.sin((x / 16) * Math.PI * 2 + (y / 16) * Math.PI * 4 + ph) * 0.5 + Math.sin((y / 16) * Math.PI * 2 - ph) * 0.35 + Math.sin((x / 16) * Math.PI * 4 - (y / 16) * Math.PI * 2) * 0.15;
      p.px(x, y, w > 0.62 ? POND[4] : w > -0.1 ? POND[3] : POND[2]);
    }
    // Lichtglanz blinkt
    if (f % 2 === 0) { p.px(12, 4, POND[6]); p.px(13, 4, POND[5]); g.px(12, 4, '#14243a'); }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 2, TS[4]); e.rect(0, 0, T, 1, TS[5]);
  for (let x = 0; x < T; x++) { if (x % 5 !== 2) e.px(x, 2, MOSS[3]); if (x % 3 === 0) e.px(x, 3, MOSS[2]); }
  e.rect(0, 4, T, 1, POND[0]);
  e.ctx.fillStyle = 'rgba(1,2,6,0.55)'; e.ctx.fillRect(0, 5, T, 2);
  e.ctx.fillStyle = 'rgba(1,2,6,0.3)'; e.ctx.fillRect(0, 7, T, 2);
  return { frames, glow, edge: e.canvas, edgeH: 7 };
}

// Abgrund in die Leere: Sternenhimmel unter den Inseln, Nebelschleier, funkelnde Sterne (nahtlos auf 16×16)
function voidLiquid(lip, lipLight, seed) {
  const rng = createRng(seed);
  const stars = [];
  for (let i = 0; i < 7; i++) stars.push([rng.int(0, 15), rng.int(0, 15), rng.int(0, 3), rng.chance(0.3)]);
  const frames = [], glow = [];
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T), ph = (f / 4) * Math.PI * 2;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const a = (x / 16) * Math.PI * 2, b = (y / 16) * Math.PI * 2;
      const n = Math.sin(a + b * 2 + ph * 0.25) * 0.45 + Math.sin(a * 2 - b + 1.3) * 0.35 + Math.sin(b * 3 + a - ph * 0.25) * 0.2;
      const k = stepQ(2 + n * 2.6, bayer(x, y), 0.3);
      p.px(x, y, VOID[Math.max(1, Math.min(6, k))]);
      if (k >= 5) g.px(x, y, '#140c2c');
    }
    for (const [sx, sy, t0, big] of stars) {
      const on = (f + t0) % 4;
      const c = on === 0 ? STW[3] : on === 1 ? STW[2] : STW[1];
      p.px(sx, sy, c); g.px(sx, sy, on < 2 ? '#3a4a80' : '#1a2040');
      if (big && on === 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { p.px((sx + dx) & 15, (sy + dy) & 15, STW[1]); g.px((sx + dx) & 15, (sy + dy) & 15, '#1a2040'); }
    }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  // Abbruchkante des Bodens: Plattenrand, gezackte Unterkante, Tiefenschatten
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 1, lipLight); e.rect(0, 1, T, 3, lip);
  for (let x = 0; x < T; x++) { const d = 4 + ((x * 7) % 5 === 0 ? 1 : 0) + ((x * 3) % 7 === 2 ? 2 : 0); e.rect(x, 4, 1, d - 4, lip); e.px(x, d, VOID[0]); }
  e.ctx.fillStyle = 'rgba(0,0,4,0.7)'; e.ctx.fillRect(0, 6, T, 3);
  e.ctx.fillStyle = 'rgba(0,0,4,0.4)'; e.ctx.fillRect(0, 9, T, 3);
  e.ctx.fillStyle = 'rgba(0,0,4,0.2)'; e.ctx.fillRect(0, 12, T, 3);
  return { frames, glow, edge: e.canvas, edgeH: 9 };
}

// ================================================================== Zusammenstellung
const CACHE = {};
export function createStarBiomeTiles(biome = 'thorn') {
  if (CACHE[biome]) return CACHE[biome];
  const props = createStarDungeonProps(biome);
  let fine, out;
  if (biome === 'glass') {
    out = {
      get floorFine() { return (fine ??= glassFloor()); },
      faces: glassFaces(), top: topTile(4671, '#05060c', ['#080a14', '#04050a', '#0a0e1a']),
      topEdge: '#2a3044', topEdgeLight: '#6e7a98', liquid: voidLiquid(GL[3], SIL[4], 4681), ambientTint: [140, 200, 255], props,
    };
  } else if (biome === 'vault') {
    out = {
      get floorFine() { return (fine ??= vaultFloor()); },
      faces: vaultFaces(), top: topTile(4971, '#04050b', ['#070914', '#030409', '#0a0d1c']),
      topEdge: '#1c2442', topEdgeLight: '#9c7028', liquid: voidLiquid(NV[4], GD[3], 4981), ambientTint: [170, 170, 255], props,
    };
  } else {
    out = {
      get floorFine() { return (fine ??= thornFloor()); },
      faces: thornFaces(), top: topTile(4271, '#08070c', ['#0c0a12', '#060509', '#0e1410']),
      topEdge: '#2f293b', topEdgeLight: '#476e42', liquid: pondLiquid(), ambientTint: [240, 170, 220], props,
    };
  }
  // Grobe Kacheln erst bei Bedarf aus den feinen (gleiches Bild, Qualität „Niedrig“)
  let rough = null;
  Object.defineProperty(out, 'floor', { enumerable: true, get: () => (rough ??= out.floorFine.map(coarse)) });
  out.resetFine = () => {};
  CACHE[biome] = out;
  return out;
}
