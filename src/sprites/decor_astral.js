import { createRng, hash2 } from '../core/math.js';
import { mk, fpoly, lump, canopy, trunk, pal32 } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';

// Sternenscherben (Grundstimmung „Morgenschimmer“, Look-Entwurf C): Blütenbäume der Treibenden Gärten, leuchtende
// Sternkristalle, Ruinen aus hellem Perlstein (König Aurels Gartenterrassen), Laternen mit warmem Licht.
// Licht von links oben; Kristalle und Laternen zusätzlich auf der Leuchtebene. Alles Stufe B (fein gezeichnet).

const LEAF = ['#4a1e3c', '#6e2c56', '#9a4474', '#c86a98', '#eca0c0', '#ffd8ea'];
const BARK = ['#1a1220', '#241a2c', '#342640', '#463654', '#5c4a6a'];
const PEARL = ['#2a2840', '#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8', '#ecebf8'];
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const LAMP = ['#3a2614', '#5a3a20', '#d8984a', '#f6c87a', '#fff0c8', '#ffffff'];
const BUSH = ['#1c2834', '#2e434c', '#3d5a5a', '#507468', '#6c927c', '#97b896'];
const ROSE = ['#3a1a30', '#6e2c56', '#9a4474', '#c86a98', '#eca0c0'];
const IRON = ['#141020', '#241e34', '#3a3250', '#585070'];
const GOLD = ['#5a3a14', '#9a6a24', '#d8a440', '#f6d888'];
const CRY_LIGHT = [130, 230, 255], LAMP_LIGHT = [255, 210, 150];

// Prisma (Sternkristall) vom Fuß (bx, by) zur Spitze (tx, ty), halbe Breite hw: Lichtfläche links, Schattenfläche
// rechts, Grat hell, auf der Leuchtebene Saum und Kern
function prism(p, g, bx, by, tx, ty, hw, pal = CRY) {
  const L = by - ty;
  const ridge = (y) => tx + (bx - tx) * Math.max(0, (y - ty) / L);
  fpoly(p, [[tx, ty], [bx - hw, by - Math.min(2, hw)], [bx - hw * 0.7, by + 0.5], [bx, by + 1], [ridge(ty + 2.5), ty + 2.5]], (x, y) => {
    const k = (y - ty) / L;
    return k < 0.18 ? pal[5] : hash2(Math.floor(x * 2), Math.floor(y * 2), 731) < 0.08 ? pal[3] : pal[4];
  });
  fpoly(p, [[tx, ty], [ridge(ty + 2.5), ty + 2.5], [bx, by + 1], [bx + hw * 0.7, by + 0.5], [bx + hw, by - Math.min(2, hw)]], (x, y) => ((y - ty) / L < 0.12 ? pal[4] : hash2(Math.floor(x * 2), Math.floor(y * 2), 732) < 0.1 ? pal[1] : pal[2]));
  p.fline(tx, ty + 0.5, bx, by, pal[5], 0.5);
  if (g) {
    g.fline(tx, ty + 1, bx, by - 1, pal[3], 1);
    g.dot(tx, ty + 0.5, pal[5]);
  }
}

// ---------------------------------------------------------------- Bäume und Pflanzen
function blossomTree(v) {
  const W = [50, 42, 56][v], H = [56, 48, 64][v], cx = W / 2, base = H - 3;
  const top = [14, 12, 15][v], seed = 900 + v * 7;
  const rng = createRng(seed);
  return mk(W, H, (p) => {
    // Blütenteppich unter der Krone
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(2, W * 0.42);
      p.dot(cx + Math.cos(a) * r, base + 1 + Math.sin(a) * r * 0.28, LEAF[rng.next() < 0.5 ? 3 : 4]);
    }
    const lean = [1.5, -1, 2][v];
    trunk(p, top + 14, base + 1, (y) => cx + lean * (1 - (y - top) / (base - top)) ** 2, (y) => 3.2 + ((y - top) / (base - top)) * 2.6, BARK, seed);
    // Äste in die Krone
    p.fline(cx, top + 16, cx - 7, top + 8, BARK[2], 1.2); p.fline(cx + 1, top + 14, cx + 8, top + 7, BARK[1], 1.2);
    const R = [[0, 0, 12], [-9, 5, 9, -0.5], [9, 4, 10, 0.2], [-4, -6, 9, 0.6], [6, -5, 8, 0.4], [-13, -1, 7, 0], [13, 7, 7, -0.7], [0, 9, 9, -0.4]];
    const k = [1, 0.85, 1.15][v];
    canopy(p, R.map(([x, y, r, b = 0]) => [cx + x * k, top + 8 + y * k, r * k, b]), LEAF, seed + 1, { lo: 1, hi: 4, bias: -0.1 });
    // einzelne helle Blüten und fallende Blätter
    for (let i = 0; i < 18; i++) p.dot(cx + rng.range(-W * 0.4, W * 0.4), top + rng.range(0, 18), LEAF[5]);
    for (let i = 0; i < 4; i++) p.dot(cx + rng.range(-W * 0.45, W * 0.45), top + rng.range(20, 34), LEAF[4]);
  }, { ax: Math.round(cx), ay: H - 2, box: [-3, -3, 3, 1], b: true, extra: { shadow: 20 } });
}

function bush(v) {
  const W = [22, 18, 26][v], H = [16, 13, 18][v], cx = W / 2, seed = 940 + v;
  const rng = createRng(seed);
  return mk(W, H, (p) => {
    const blobs = [[cx, H - 7, W * 0.32], [cx - W * 0.22, H - 5, W * 0.22, -0.3], [cx + W * 0.24, H - 5, W * 0.2, -0.4]];
    canopy(p, blobs, BUSH, seed, { lo: 1, hi: 5, bias: -0.05, tuft: 0.8 });
    // Rosablüten (nicht an jedem Busch)
    if (v !== 1) for (let i = 0; i < 7; i++) { const x = cx + rng.range(-W * 0.38, W * 0.38), y = H - rng.range(5, 12); p.dot(x, y, ROSE[4]); p.dot(x + 0.5, y + 0.5, ROSE[2]); }
  }, { ax: Math.round(cx), ay: H - 2, box: [-W * 0.35, -4, W * 0.35, 1], b: true, extra: { low: true } });
}

function flowers(v) {
  const W = 18, H = 8, seed = 960 + v, rng = createRng(seed);
  const pal = [[ROSE[4], ROSE[3]], [CRY[4], CRY[3]], ['#f6e8a8', '#d8b860']][v];
  return mk(W, H, (p) => {
    for (let i = 0; i < 9; i++) {
      const x = rng.range(2, W - 2), y = rng.range(2.5, H - 1);
      p.fline(x, y, x + rng.range(-0.6, 0.6), y + 1.6, BUSH[3], 0.5);
      p.dot(x, y, pal[0]); p.dot(x + 0.5, y, pal[1]); p.dot(x, y - 0.5, pal[0]);
    }
  }, { ax: W / 2, ay: H - 1, b: true });
}

function roseRocks(v) {
  const W = [16, 12, 20][v], H = [10, 8, 12][v], seed = 970 + v;
  return mk(W, H, (p) => {
    const rocks = [[[W / 2, H - 4.5, W * 0.33, H * 0.38]], [[W / 2, H - 3.5, W * 0.36, H * 0.4]], [[W * 0.4, H - 5, W * 0.28, H * 0.38], [W * 0.72, H - 3.4, W * 0.18, H * 0.26]]][v];
    for (const [x, y, rx, ry] of rocks) lump(p, x, y, rx, ry, v === 1 ? PEARL : ROSE, { lo: 1, hi: v === 1 ? 5 : 4, bias: 0.05 });
    p.dot(W / 2 - 1, H - 2, BUSH[3]); p.dot(W / 2 + 2, H - 1.5, BUSH[4]);
  }, { ax: Math.round(W / 2), ay: H - 2, box: [-W * 0.35, -3, W * 0.35, 1], b: true, extra: { low: true } });
}

// Wurzeln, die aus dem Boden brechen (Wurzelbruch): dunkle Bögen mit Lichtkante, Moos
function roots(v) {
  const W = 34, H = 14, seed = 980 + v, rng = createRng(seed);
  return mk(W, H, (p) => {
    const n = 3 + v;
    for (let i = 0; i < n; i++) {
      const x0 = rng.range(2, W * 0.4), x1 = rng.range(W * 0.6, W - 2), h = rng.range(4, 9), y = H - 2 - rng.range(0, 3);
      for (let t = 0; t <= 1; t += 0.02) {
        const x = x0 + (x1 - x0) * t, yy = y - Math.sin(t * Math.PI) * h, w = 1.6 - Math.abs(t - 0.5);
        p.fline(x, yy, x, yy + w, BARK[t < 0.5 ? 3 : 2], 0.5);
        p.dot(x, yy - 0.5, BARK[4]);
      }
      p.dot(x0 + (x1 - x0) * 0.5, y - h - 0.5, BUSH[4]);
    }
  }, { ax: W / 2, ay: H - 2, box: [-12, -4, 12, 1], b: true, extra: { low: true } });
}

// ---------------------------------------------------------------- Kristalle
function crystals(v) {
  const W = [24, 18, 30][v], H = [30, 22, 40][v], base = H - 3, cx = W / 2;
  const sets = [
    [[0, 3, 3.6, 0.5], [-6, 11, 2.6, -2.5], [6, 10, 3, 2.5], [-2, 17, 2, -1]],
    [[0, 3, 3, 1], [-5, 10, 2.2, -2.5], [5, 11, 2, 2.2]],
    [[0, 2, 4.2, 0.5], [-7, 11, 3.2, -3.5], [7, 9, 3.4, 3.2], [-3, 19, 2.4, -1.5], [10, 19, 2, 3]],
  ][v];
  return mk(W, H, (p, g) => {
    lump(p, cx, base + 0.5, W * 0.36, 2.2, PEARL, { lo: 1, hi: 3 });
    const order = [...sets].sort((a, b) => b[1] - a[1]);
    for (const [x, tip, hw, lean] of order) prism(p, g, cx + x, base, cx + x + lean, tip, hw);
    for (let i = 0; i < 4; i++) { const x = 3 + hash2(i, v, 733) * (W - 6); p.dot(x, H - 2.5, CRY[4]); g.dot(x, H - 2.5, CRY[3]); }
  }, { ax: Math.round(cx), ay: H - 2, box: [-W * 0.3, -4, W * 0.3, 1], b: true, light: { dx: 0, dy: -H * 0.4, radius: 40 + v * 10, color: CRY_LIGHT, intensity: 0.6 } });
}

// Splitterturm: hoher Kristall als Wahrzeichen (Splitterweiten)
function shardSpire(v) {
  const W = 40, H = [92, 76][v], base = H - 4, cx = W / 2;
  return mk(W, H, (p, g) => {
    lump(p, cx, base + 0.5, 15, 3.4, PEARL, { lo: 1, hi: 4 });
    prism(p, g, cx - 9, base, cx - 12, H * 0.45, 4);
    prism(p, g, cx + 9, base, cx + 13, H * 0.5, 3.6);
    prism(p, g, cx, base, cx + 1, 3, 7.5);
    prism(p, g, cx - 4, base + 1, cx - 6, H * 0.7, 3);
  }, { ax: cx, ay: H - 3, box: [-12, -6, 12, 1], b: true, light: { dx: 0, dy: -H * 0.45, radius: 96, color: CRY_LIGHT, intensity: 0.8 } });
}

// ---------------------------------------------------------------- Ruinen aus Perlstein
function column(p, x, top, bottom, w, broken, seed) {
  const P = pal32(PEARL);
  // Säulenschaft mit Kanneluren (Lichtseite links)
  p.scan(x - w / 2, top, x + w / 2, bottom, (xx, y) => {
    let cut = top;
    if (broken) cut = top + 1.5 + Math.abs(Math.sin((xx - x) * 1.7 + seed)) * 2.5;
    if (y < cut) return 0;
    const rel = (xx - x) / (w / 2);
    let i = rel < -0.5 ? 6 : rel < 0 ? 5 : rel < 0.55 ? 4 : 3;
    if (Math.abs(((xx - x + w) * 2) % 2.5) < 0.5) i -= 1;
    if (y < cut + 1) i = 6;
    return P[i];
  });
  // Fuß
  p.scan(x - w / 2 - 1.5, bottom - 2.5, x + w / 2 + 1.5, bottom + 0.5, (xx, y) => P[y < bottom - 1.5 ? 5 : xx < x ? 4 : 2]);
}
function ruinArch(v) {
  const W = 46, H = 48, base = H - 3;
  return mk(W, H, (p) => {
    const P = pal32(PEARL);
    column(p, 9, 8, base, 6, false, 1);
    column(p, 37, v ? 20 : 8, base, 6, !!v, 2);
    // Bogen (beim zerfallenen nur ein Stumpf)
    const x1 = v ? 24 : 42;
    p.scan(4, 3, x1, 9, (x, y) => {
      if (v && x > 18 + Math.sin(y * 2) * 2) return 0;
      return P[y < 4 ? 6 : y < 5 ? 5 : y > 8 ? 2 : 4];
    });
    p.scan(4, 9, x1, 10, () => P[1]);
    // Ranken mit Blüten am linken Pfeiler
    for (let y = 6; y < base - 3; y += 1.5) { const x = 6 + Math.sin(y * 0.6) * 2.5; p.dot(x, y, BUSH[3]); if (hash2(Math.floor(y), 3, 41) < 0.3) p.dot(x + 0.5, y, ROSE[4]); }
  }, { ax: 23, ay: H - 2, b: true, extra: { boxes: [[-18, -4, -10, 1], [10, -4, 18, 1]], shadow: 0 } });
}
function ruinPillar(v) {
  const W = 14, H = [40, 26][v];
  return mk(W, H, (p) => {
    column(p, 7, 3, H - 3, 6, v === 1, v * 3);
    if (v === 0) { const P = pal32(PEARL); p.scan(1.5, 1, 12.5, 4, (x, y) => P[y < 2 ? 6 : y > 3.2 ? 2 : 4]); }
    p.dot(4, H - 6, BUSH[3]); p.dot(4.5, H - 5, BUSH[4]);
  }, { ax: 7, ay: H - 2, box: [-4, -3, 4, 1], b: true });
}
function ruinWall(v) {
  const W = 36, H = 18, base = H - 3;
  return mk(W, H, (p) => {
    const P = pal32(PEARL);
    const topAt = (x) => 4 + (v ? x * 0.18 : 0) + Math.abs(Math.sin(x * 0.45 + v)) * 2.2 + (x > 26 && !v ? (x - 26) * 0.5 : 0);
    p.scan(1, 3, W - 1, base + 1, (x, y) => {
      const t = topAt(x);
      if (y < t) return 0;
      if (y < t + 1) return P[6];
      const row = Math.floor((y - 4) / 3), off = (row & 1) * 3.5;
      if ((y - 4) % 3 < 0.5 || (x + off) % 7 < 0.5) return P[2];
      return P[hash2(Math.floor((x + off) / 7), row, 51 + v) < 0.3 ? 4 : 5];
    });
    for (let x = 3; x < W - 3; x += 2.5) if (hash2(Math.floor(x), v, 52) < 0.4) p.dot(x, topAt(x) - 0.5, BUSH[4]);
  }, { ax: W / 2, ay: H - 2, box: [-16, -5, 16, 1], b: true });
}

// Statue König Aurels (Wahrzeichen der Gärten und Sternhafens): Sockel, Figur mit erhobener Laterne
function aurelStatue() {
  const W = 30, H = 64, cx = 15;
  return mk(W, H, (p, g) => {
    const P = pal32(PEARL);
    p.scan(3, H - 14, W - 3, H - 2, (x, y) => P[y < H - 13 ? 6 : x < cx ? 5 : 3]);
    p.scan(5, H - 18, W - 5, H - 14, (x, y) => P[y < H - 17 ? 6 : 4]);
    // Mantel
    fpoly(p, [[cx - 2, 16], [cx + 3, 16], [cx + 8, H - 18], [cx - 8, H - 18]], (x) => PEARL[x < cx - 2 ? 6 : x < cx + 2 ? 5 : 3]);
    lump(p, cx, 13, 3.2, 3.6, PEARL, { lo: 3, hi: 6 });
    // Krone
    for (let i = -2; i <= 2; i += 2) p.dot(cx + i, 8.5, GOLD[3]);
    p.fline(cx - 2.5, 9.5, cx + 2.5, 9.5, GOLD[2], 0.5);
    // Arm mit Laterne
    p.fline(cx + 2, 20, cx + 9, 11, PEARL[4], 1.4);
    p.scan(cx + 7.5, 5, cx + 11.5, 10, (x, y) => col32(y < 6 ? IRON[2] : LAMP[x < cx + 9.5 ? 4 : 3]));
    g.oval(cx + 9.5, 7.5, 2.2, 2.6, LAMP[4]);
  }, { ax: cx, ay: H - 2, box: [-12, -6, 12, 1], b: true, light: { dx: 9, dy: -56, radius: 70, color: LAMP_LIGHT, intensity: 0.8 } });
}

// ---------------------------------------------------------------- Licht und Wege
function lantern(v) {
  const W = 12, H = 30, cx = 6;
  return mk(W, H, (p, g) => {
    const I = pal32(IRON);
    p.scan(cx - 0.75, 9, cx + 0.75, H - 3, (x) => I[x < cx ? 3 : 1]);
    p.scan(cx - 2.5, H - 3.5, cx + 2.5, H - 1.5, (x, y) => I[y < H - 3 ? 3 : 1]);
    if (v === 0) {
      // Laterne am Haken
      p.fline(cx, 9, cx + 3.5, 7, IRON[2], 0.5);
      p.scan(cx + 1.5, 7.5, cx + 5.5, 13, (x, y) => (y < 8.5 || y > 12 ? I[2] : col32(LAMP[x < cx + 3.5 ? 4 : 3])));
      g.oval(cx + 3.5, 10.5, 2.4, 3, LAMP[4]);
    } else {
      // Sternglas-Kugel (kalt, Splitterweiten)
      lump(p, cx, 6, 3, 3, CRY, { lo: 2, hi: 5 });
      g.oval(cx, 6, 3, 3, CRY[4]);
    }
  }, { ax: cx, ay: H - 2, box: [-2, -2, 2, 1], b: true, light: v === 0 ? { dx: 3, dy: -19, radius: 72, color: LAMP_LIGHT, intensity: 0.85 } : { dx: 0, dy: -23, radius: 64, color: CRY_LIGHT, intensity: 0.7 } });
}

function signpost() {
  const W = 20, H = 26, cx = 10;
  return mk(W, H, (p) => {
    const B = pal32(BARK), P = pal32(PEARL);
    p.scan(cx - 1, 4, cx + 1, H - 2, (x) => B[x < cx ? 4 : 2]);
    p.scan(2, 5, 17, 10, (x, y) => (y < 6 ? P[6] : y > 9 ? P[2] : P[4]));
    p.scan(4, 12, 18, 16, (x, y) => (y < 13 ? P[6] : y > 15 ? P[2] : P[4]));
    for (let x = 4; x < 15; x += 2) p.dot(x, 7.5, PEARL[2]);
  }, { ax: cx, ay: H - 2, box: [-2, -2, 2, 1], b: true, extra: { sign: true } });
}


// Ankerbaum (Wahrzeichen des Ankerhains): uralter Blütenbaum, dessen Wurzeln die Gärten halten; Krone aus vielen
// Ballen, Stamm mit Wurzelfüßen, leuchtende Samenkapseln (Leuchtebene)
function anchorTree() {
  const W = 120, H = 132, cx = 60, base = H - 6, seed = 1201, rng = createRng(seed);
  return mk(W, H, (p, g) => {
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(8, 56);
      p.dot(cx + Math.cos(a) * r, base + 2 + Math.sin(a) * r * 0.25, LEAF[rng.next() < 0.5 ? 3 : 4]);
    }
    // Wurzelfüße
    for (const [dx, len, dy] of [[-1, 30, 2], [1, 28, 3], [-1, 18, 4], [1, 16, 1]]) {
      for (let t = 0; t <= 1; t += 0.01) {
        const x = cx + dx * (6 + t * len), y = base - 10 + t * (10 + dy) - Math.sin(t * Math.PI) * 4, w = 5 * (1 - t) + 1;
        p.fline(x, y, x, y + w, BARK[t < 0.3 ? 3 : 2], 0.5);
        p.dot(x, y, BARK[4]);
      }
    }
    trunk(p, 40, base, (y) => cx + Math.sin(y / 14) * 2, (y) => 12 + ((y - 40) / (base - 40)) ** 2 * 10, BARK, seed, { groove: 1.6 });
    p.fline(cx - 2, 58, cx - 26, 34, BARK[2], 3); p.fline(cx + 2, 54, cx + 28, 30, BARK[1], 3); p.fline(cx, 46, cx + 4, 20, BARK[2], 2.5);
    const R = [[0, 26, 24], [-24, 34, 18, -0.3], [24, 32, 19, 0.1], [-12, 14, 18, 0.6], [14, 12, 17, 0.5], [-36, 24, 13, 0.1], [36, 22, 13, -0.2], [0, 4, 15, 0.8], [-22, 50, 13, -0.6], [22, 50, 13, -0.7], [0, 46, 16, -0.5]];
    canopy(p, R.map(([x, y, r, b = 0]) => [cx + x, y + 6, r, b]), LEAF, seed + 1, { lo: 1, hi: 4, bias: -0.1, tuft: 1.4 });
    for (let i = 0; i < 60; i++) p.dot(cx + rng.range(-50, 50), rng.range(4, 60), LEAF[5]);
    // Samenkapseln (Lichtsamen, Kapitel 10)
    for (let i = 0; i < 9; i++) {
      const x = cx + rng.range(-40, 40), y = rng.range(24, 64);
      p.oval(x, y, 1.6, 2, '#fff0c8'); p.dot(x - 0.5, y - 0.5, '#ffffff');
      g.oval(x, y, 2.4, 2.8, '#f6d888');
    }
  }, { ax: cx, ay: H - 4, b: true, extra: { boxes: [[-12, -8, 12, 2]], shadow: 0, lights: [{ dx: -20, dy: -80, radius: 70, color: [255, 220, 170], intensity: 0.45 }, { dx: 22, dy: -90, radius: 70, color: [255, 220, 170], intensity: 0.45 }] } });
}

// Gartenlaube der Gärtner von Morgentau: Perlsteinsockel, Holzgitter mit Ranken, Rosadach
function gardenHut() {
  const W = 40, H = 40, cx = 20;
  return mk(W, H, (p) => {
    const P = pal32(PEARL), B = pal32(BARK), R = pal32(ROSE);
    p.scan(5, 20, 35, H - 2, (x, y) => (y > H - 4 ? P[2] : (Math.floor(x) % 5 === 0 || Math.floor(y) % 5 === 0) ? B[3] : P[x < cx ? 5 : 4]));
    p.scan(16, 27, 24, H - 2, (x, y) => (y < 28 ? B[4] : B[1]));
    // Dach (Schindeln in Reihen)
    fpoly(p, [[2, 22], [cx, 5], [38, 22]], (x, y) => {
      const row = Math.floor((y - 5) / 2.5), off = (row & 1) * 1.5;
      const edge = (x + off) % 3 < 0.5;
      return y > 20.5 ? ROSE[1] : edge ? ROSE[2] : x < cx ? ROSE[4] : ROSE[3];
    });
    for (let y = 18; y < H - 3; y += 1.5) { p.dot(6 + Math.sin(y) * 1.2, y, BUSH[3]); p.dot(34 - Math.sin(y) * 1.2, y, BUSH[4]); }
    p.dot(10, 26, LAMP[4]); p.dot(30, 26, LAMP[4]);
  }, { ax: cx, ay: H - 2, box: [-15, -12, 15, 1], b: true, light: { dx: 0, dy: -12, radius: 50, color: LAMP_LIGHT, intensity: 0.55 } });
}

// Rankentor (Eingang der Rankengruft): Perlsteinbogen, von dunklen Ranken mit violettem Leerenglühen überwuchert
function vineGate() {
  const W = 60, H = 62, cx = 30;
  return mk(W, H, (p, g) => {
    const P = pal32(PEARL);
    column(p, 10, 14, H - 3, 8, false, 3);
    column(p, 50, 14, H - 3, 8, false, 4);
    p.scan(4, 6, 56, 15, (x, y) => P[y < 7 ? 6 : y < 8.5 ? 5 : y > 13.5 ? 2 : 4]);
    // dunkle Öffnung
    p.scan(15, 16, 45, H - 3, (x, y) => col32(y < 18 ? '#0c0816' : '#120c20'));
    // Ranken
    const rng = createRng(1301);
    for (let k = 0; k < 9; k++) {
      let x = rng.range(4, 56), y = rng.range(4, 16);
      for (let s = 0; s < 40; s++) {
        p.dot(x, y, BARK[2 + (s & 1)]); x += rng.range(-0.8, 0.8); y += rng.range(0.3, 1.1);
        if (hash2(k, s, 1302) < 0.12) { p.dot(x + 0.5, y, ROSE[3]); }
        if (y > H - 4) break;
      }
    }
    // Leerenglühen im Tor
    for (let i = 0; i < 16; i++) { const x = rng.range(18, 42), y = rng.range(26, H - 6); p.dot(x, y, '#9a6ad8'); g.dot(x, y, '#b48aff'); }
  }, { ax: cx, ay: H - 2, b: true, extra: { boxes: [[-26, -6, -14, 1], [14, -6, 26, 1]] }, light: { dx: 0, dy: -18, radius: 60, color: [170, 120, 255], intensity: 0.6 } });
}

// Mondaltar (Questobjekt, Mondweiher): runder Perlsteintisch mit Mondsichel, aktiv mit kaltem Licht
function moonAltar(on) {
  const W = 28, H = 26, cx = 14;
  return mk(W, H, (p, g) => {
    const P = pal32(PEARL);
    p.scan(4, 14, 24, H - 2, (x, y) => P[y < 15 ? 6 : x < cx ? 5 : 3]);
    p.scan(2, 11, 26, 15, (x, y) => P[y < 12 ? 6 : y > 14 ? 2 : 4]);
    // Mondsichel
    const M = col32(on ? CRY[4] : PEARL[4]), M2 = col32(on ? CRY[5] : PEARL[6]);
    p.scan(cx - 5, 1, cx + 5, 11, (x, y) => (Math.hypot(x - cx, y - 6) < 5 && Math.hypot(x - cx - 2.2, y - 5) > 4.2 ? (x < cx - 3 ? M2 : M) : 0));
    if (on) { g.oval(cx - 1.5, 6, 3.5, 5, CRY[3]); }
  }, { ax: cx, ay: H - 2, box: [-11, -5, 11, 1], b: true, light: on ? { dx: 0, dy: -16, radius: 60, color: CRY_LIGHT, intensity: 0.8 } : null });
}

// Leerenriss (Questobjekt, Wurzelbruch): violett glühender Spalt im Boden; versiegelt nur ein heller Narbenstrich
function voidRift(sealed) {
  const W = 30, H = 14, cx = 15;
  return mk(W, H, (p, g) => {
    for (let x = 3; x < W - 3; x += 0.5) {
      const t = (x - 3) / (W - 6), w = Math.sin(t * Math.PI) * (sealed ? 0.8 : 3.2), y = H / 2 + Math.sin(x * 0.7) * 1.2;
      if (sealed) { p.dot(x, y, PEARL[5]); continue; }
      p.fline(x, y - w, x, y + w, '#140a24', 0.5);
      p.dot(x, y - w, '#6a3aa8'); p.dot(x, y + w, '#2a1640');
      if (hash2(Math.floor(x * 2), 1, 1401) < 0.3) { p.dot(x, y, '#b48aff'); g.dot(x, y, '#c8a0ff'); }
    }
  }, { ax: cx, ay: H - 2, b: true, light: sealed ? null : { dx: 0, dy: -6, radius: 56, color: [170, 110, 255], intensity: 0.75 } });
}

export function createAstralDecor() {
  return {
    blossomTrees: [0, 1, 2].map(blossomTree),
    bushes: [0, 1, 2].map(bush),
    roseRocks: [0, 1, 2].map(roseRocks),
    roots: [0, 1].map(roots),
    crystals: [0, 1, 2].map(crystals),
    shardSpire: [0, 1].map(shardSpire),
    ruinArch: ruinArch(0),
    ruinArchBroken: ruinArch(1),
    ruinPillars: [0, 1].map(ruinPillar),
    ruinWalls: [0, 1].map(ruinWall),
    aurelStatue: aurelStatue(),
    lantern: lantern(0),
    starLamp: lantern(1),
    signpost: signpost(),
    anchorTree: anchorTree(),
    gardenHut: gardenHut(),
    vineGate: vineGate(),
    moonAltar: { off: moonAltar(false), on: moonAltar(true) },
    voidRift: { off: voidRift(false), on: voidRift(true) },
  };
}
