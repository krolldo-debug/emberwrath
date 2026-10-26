import { createRng, hash2 } from '../core/math.js';
import { mk, fpoly, lump, canopy, pal32 } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';

// Sternhafen (Hauptstadt der Sternenscherben, Look „Morgenschimmer“): Häuser aus weißem Perlstein mit
// schieferblauen oder rosa Schuppendächern und Goldkanten, warm erleuchtete Bogenfenster. Licht von links oben;
// Fassaden frontal mit schmaler Schattenseite rechts (3/4-Ansicht wie die Dorfhäuser). Alles Stufe B (fein).

const PEARL = ['#2a2840', '#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8', '#ecebf8'];
const SLATE = ['#121828', '#1c2840', '#283a5a', '#364e74', '#48658e', '#6482a8', '#8ea6c6'];
const ROSE = ['#2a1426', '#4a1e3c', '#6e2c56', '#8a3a68', '#aa5682', '#c87ca0', '#e6a6c2'];
const GOLD = ['#3a2410', '#5a3a14', '#9a6a24', '#d8a440', '#f6d888', '#fff4c8'];
const WOOD = ['#160e16', '#26181e', '#3a2428', '#523430', '#6c4638', '#8a5c44'];
const LAMP = ['#3a2614', '#5a3a20', '#d8984a', '#f6c87a', '#fff0c8', '#ffffff'];
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const LEAF = ['#4a1e3c', '#6e2c56', '#9a4474', '#c86a98', '#eca0c0', '#ffd8ea'];
const BUSH = ['#1c2834', '#2e434c', '#3d5a5a', '#507468', '#6c927c', '#97b896'];
const WATER = ['#16304a', '#20486a', '#2e6890', '#4a92b8', '#86c4e0', '#d4f0ff'];
const VOIDC = ['#140a24', '#2a1640', '#4a2a78', '#6a3aa8', '#9a6ad8', '#c8a0ff'];
const EMBER = ['#3a1408', '#7a2a0c', '#c4501a', '#f08a2c', '#ffc060', '#fff0c0'];
const LAMP_LIGHT = [255, 210, 150], CRY_LIGHT = [130, 230, 255];
const ROOFS = [SLATE, ROSE, SLATE];

const P = pal32(PEARL), G = pal32(GOLD), Wd = pal32(WOOD);

// ---------------------------------------------------------------- Bauteile

// Perlstein-Quaderwand (x0..x1, y0..y1): Fugen dunkel, Oberkante jedes Quaders hell, rechts ein Schattenstreifen
// der Seitenwand (side px). Traufschatten unter dem Dach in harten Stufen.
function pearlWall(p, x0, x1, y0, y1, seed, { side = 5, bh = 4, bw = 9 } = {}) {
  const xs = x1 - side;
  p.scan(x0, y0, x1, y1, (x, y) => {
    const row = Math.floor((y - y0) / bh), ly = (y - y0) - row * bh;
    const lx = (x - x0 + (row & 1) * bw / 2) % bw;
    const tint = hash2(Math.floor((x - x0 + (row & 1) * bw / 2) / bw), row, seed) < 0.22 ? -1 : 0;
    let i;
    if (x >= xs) i = ly < 0.5 ? 3 : (lx < 0.5 ? 1 : 2);
    else if (ly > bh - 0.5 || lx < 0.5) i = 3;
    else if (ly < 0.5) i = 6;
    else i = 5 + tint;
    const eave = y - y0;
    if (eave < 1) i = Math.min(i, 2); else if (eave < 2) i = Math.min(i, 3); else if (eave < 3) i = Math.min(i, 4);
    return P[i];
  });
}

// Sockel: dunklere Perlsteinbank mit Goldleiste oben
function plinth(p, x0, x1, y0, y1) {
  p.scan(x0, y0, x1, y1, (x, y) => (y < y0 + 0.5 ? G[3] : y < y0 + 1 ? G[2] : y > y1 - 0.5 ? P[1] : x > x1 - 5 ? P[2] : P[3]));
}

// Goldgesims (Band unter der Traufe)
function cornice(p, x0, x1, y) {
  p.scan(x0, y, x1, y + 2, (x, yy) => (yy < y + 0.5 ? G[4] : yy < y + 1.5 ? G[3] : G[1]));
}

// Schuppendach als Walmdach: Trapez von der Traufe (x0..x1, bot) zum First (top, Einzug ins). Linke Walmfläche
// hell, Front mittel, rechte Walmfläche dunkel; Schuppenreihen gerundet, Goldfirst mit Knäufen.
function roof(p, x0, x1, top, bot, R, seed, ins = 10) {
  const C = pal32(R), H = bot - top;
  const left = (y) => x0 + ins * (1 - (y - top) / H), right = (y) => x1 - ins * (1 - (y - top) / H);
  p.scan(x0, top, x1, bot, (x, y) => {
    const a = left(y), b = right(y);
    if (x < a || x > b) return 0;
    const k = (y - top) / H;
    const face = x < a + ins * 0.9 * (1 - k) + 2 ? 0 : x > b - ins * 0.9 * (1 - k) - 2 ? 2 : 1;
    const row = Math.floor((y - top) / 3), v = (y - top) / 3 - row;
    const u = (((x + (row & 1) * 2) % 4) + 4) % 4 / 4;
    const scallop = v > 0.62 + 0.3 * (1 - (2 * u - 1) ** 2);
    let i = face === 0 ? 5 : face === 1 ? (k < 0.3 ? 5 : 4) : 3;
    if (scallop) i -= 2;
    else if (v < 0.34 && u > 0.2 && u < 0.6 && face < 2) i += 1;
    if (hash2(Math.floor(x / 2), row, seed) < 0.05) i -= 1;
    if (y > bot - 1) i = 1;
    return C[Math.max(0, Math.min(6, i))];
  });
  // First und Knäufe
  p.scan(left(top) - 0.5, top - 1, right(top) + 0.5, top + 0.5, (x, y) => (y < top - 0.5 ? G[4] : G[2]));
  for (const x of [left(top), right(top)]) { p.oval(x, top - 2, 1.2, 1.4, GOLD[3]); p.dot(x - 0.5, top - 2.5, GOLD[5]); }
}

// Spitzhelm (Turm) von der Basis (base, halbe Breite hw) zur Spitze; links hell, rechts dunkel
function spire(p, cx, base, tip, hw, R) {
  const C = pal32(R), H = base - tip;
  p.scan(cx - hw, tip, cx + hw, base, (x, y) => {
    const w = hw * ((y - tip) / H);
    if (Math.abs(x - cx) > w) return 0;
    const rel = (x - cx) / Math.max(0.5, w), row = Math.floor((y - tip) / 3), v = (y - tip) / 3 - row;
    let i = rel < -0.45 ? 6 : rel < 0 ? 5 : rel < 0.5 ? 4 : 3;
    if (v > 0.75) i -= 2;
    if (y > base - 1) i = 1;
    return C[Math.max(0, i)];
  });
  p.fline(cx, tip - 6, cx, tip, GOLD[3], 0.5);
  p.oval(cx, tip - 6, 1.3, 1.3, GOLD[4]);
}

// Rundturm (Zylinder) mit Quaderreihen, Licht links
function towerBody(p, cx, hw, top, bot, seed) {
  p.scan(cx - hw, top, cx + hw, bot, (x, y) => {
    const rel = (x - cx) / hw, row = Math.floor((y - top) / 4), ly = (y - top) - row * 4;
    const seg = Math.floor((Math.asin(Math.max(-1, Math.min(1, rel))) * 3) + (row & 1) * 0.5);
    const joint = Math.abs((Math.asin(Math.max(-1, Math.min(1, rel))) * 3 + (row & 1) * 0.5) - Math.round(Math.asin(Math.max(-1, Math.min(1, rel))) * 3 + (row & 1) * 0.5)) < 0.06;
    let i = rel < -0.55 ? 6 : rel < -0.1 ? 5 : rel < 0.45 ? 4 : rel < 0.8 ? 3 : 2;
    if (ly > 3.5 || joint) i -= 2; else if (ly < 0.5) i += 1;
    if (hash2(seg, row, seed) < 0.15) i -= 1;
    if (y - top < 2) i = Math.min(i, 3);
    return P[Math.max(0, Math.min(6, i))];
  });
}

// Bogenfenster (x, y = linke obere Ecke des Rechteckteils, w × h), warm erleuchtet; Leuchtebene g
function archWin(p, g, x, y, w, h, { box = true, lit = true } = {}) {
  const r = w / 2, cx = x + r;
  const inside = (xx, yy, pad) => (yy >= y ? xx >= x - pad && xx <= x + w + pad && yy <= y + h + pad : Math.hypot(xx - cx, yy - y) <= r + pad);
  // Rahmen
  p.scan(x - 1, y - r - 1, x + w + 1, y + h + 1, (xx, yy) => {
    if (!inside(xx, yy, 1) || inside(xx, yy, 0)) return 0;
    return xx < cx - 0.3 && yy < y + h ? P[6] : P[2];
  });
  // Glas: oben links heller Kern, Sprossen
  const L = pal32(LAMP);
  p.scan(x, y - r, x + w, y + h, (xx, yy) => {
    if (!inside(xx, yy, 0)) return 0;
    if (Math.abs(xx - cx) < 0.3 || Math.abs(yy - (y + h * 0.45)) < 0.25) return P[2];
    if (!lit) return yy < y ? col32('#3a4060') : col32('#2a2c48');
    return xx < cx && yy < y + h * 0.45 ? L[4] : yy > y + h - 1 ? L[2] : L[3];
  });
  if (lit) g.each(x, y - r, x + w, y + h, (xx, yy) => (inside(xx, yy, 0) ? (xx < cx && yy < y + h * 0.45 ? LAMP[4] : LAMP[3]) : null));
  // Fensterbank mit Blumenkasten
  p.scan(x - 1.5, y + h + 1, x + w + 1.5, y + h + 2, (xx, yy) => (yy < y + h + 1.5 ? P[6] : P[3]));
  if (box) {
    p.scan(x - 0.5, y + h + 2, x + w + 0.5, y + h + 3.5, (xx, yy) => (yy < y + h + 2.5 ? G[3] : Wd[2]));
    for (let xx = x; xx <= x + w; xx += 1.5) {
      const k = hash2(Math.floor(xx * 2), Math.floor(y), 77);
      p.dot(xx, y + h + 1.5, k < 0.5 ? BUSH[3] : BUSH[4]);
      if (k < 0.45) p.dot(xx + 0.5, y + h + 1, ROSE[k < 0.2 ? 6 : 5]);
    }
  }
}

// Bogentür (Mitte cx, Unterkante bot), Holzbretter mit Goldnieten, leuchtendes Oberlicht
function archDoor(p, g, cx, bot, w, h) {
  const r = w / 2, x = cx - r, y = bot - h + r;
  const inside = (xx, yy, pad) => (yy >= y ? xx >= x - pad && xx <= x + w + pad : Math.hypot(xx - cx, yy - y) <= r + pad);
  p.scan(x - 2, y - r - 2, x + w + 2, bot, (xx, yy) => {
    if (!inside(xx, yy, 2) || inside(xx, yy, 0)) return 0;
    const ring = !inside(xx, yy, 1);
    return ring ? (xx < cx ? P[6] : P[3]) : (yy < y && Math.abs(xx - cx) < 1 ? G[3] : xx < cx ? P[5] : P[4]);
  });
  p.scan(x, y - r, x + w, bot, (xx, yy) => {
    if (!inside(xx, yy, 0)) return 0;
    if (yy < y - r * 0.15) return col32(xx < cx ? LAMP[4] : LAMP[3]);
    if (yy < y) return Wd[0];
    const lx = (xx - x) % 2.5;
    return lx < 0.5 ? Wd[1] : xx > x + w - 1 ? Wd[2] : Wd[3 + (hash2(Math.floor((xx - x) / 2.5), 3, 91) < 0.4 ? 1 : 0)];
  });
  g.each(x, y - r, x + w, y - r * 0.15, (xx, yy) => (inside(xx, yy, 0) ? LAMP[4] : null));
  for (const yy of [y + 2, bot - 4]) for (let xx = x + 1; xx < x + w; xx += 2.5) p.dot(xx, yy, GOLD[4]);
  p.oval(cx + r * 0.55, y + (bot - y) * 0.5, 0.7, 0.7, GOLD[4]);
  // Stufe
  p.scan(x - 3, bot - 1, x + w + 3, bot + 1, (xx, yy) => (yy < bot ? P[6] : P[3]));
}

// Fußschatten (weiche Ellipse in harten Stufen, nur auf dem Boden unter dem Bau)
function footShade(p, cx, cy, rx, ry) {
  const S = [col32('#14102a'), col32('#1e1a38')];
  p.scan(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return d > 1 ? 0 : d > 0.55 ? S[1] : S[0];
  });
}

// ---------------------------------------------------------------- Bürgerhäuser
// v0 schieferblau mit Gaube, v1 rosa mit Erker, v2 schieferblau mit Eckturm (Ankerplatz)
function starHouse(v) {
  const W = 76, H = 82, cx = 38, bot = H - 2, seed = 2100 + v * 13;
  return mk(W, H, (p, g) => {
    const R = ROOFS[v];
    const x0 = 10, x1 = W - 10, wallTop = bot - 30;
    footShade(p, cx, bot, 34, 3.5);
    pearlWall(p, x0, x1, wallTop, bot - 4, seed);
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    cornice(p, x0 - 1, x1 + 1, wallTop);
    // Eckpilaster
    for (const px of [x0, x1 - 8]) p.scan(px, wallTop + 2, px + 3, bot - 4, (x) => P[x < px + 1 ? 6 : x < px + 2.5 ? 5 : 3]);
    archDoor(p, g, cx, bot - 3, 10, 19);
    archWin(p, g, x0 + 7, wallTop + 9, 7, 9);
    archWin(p, g, x1 - 18, wallTop + 9, 7, 9);
    roof(p, x0 - 5, x1 + 5, wallTop - 26, wallTop + 1, R, seed, 12);
    if (v === 0) {
      // Gaube mit Rundfenster
      const gx = cx - 6, gy = wallTop - 17;
      p.scan(gx, gy, gx + 12, gy + 11, (x, y) => (x > gx + 10 ? P[3] : y < gy + 0.5 ? P[6] : P[5]));
      archWin(p, g, gx + 3, gy + 4, 6, 5, { box: false });
      roof(p, gx - 2, gx + 14, gy - 7, gy + 1, R, seed + 1, 7);
    } else if (v === 1) {
      // Erker über der Tür
      const ex = cx - 9;
      p.scan(ex, wallTop + 3, ex + 18, wallTop + 4, () => G[3]);
      archWin(p, g, ex + 5, wallTop - 10, 8, 8, { box: false });
      p.scan(ex + 2, wallTop - 1, ex + 16, wallTop + 3, (x, y) => (y < wallTop ? P[6] : x > ex + 14 ? P[3] : P[4]));
      // Kamin
      p.scan(x1 - 14, wallTop - 32, x1 - 8, wallTop - 14, (x, y) => (y < wallTop - 31 ? P[6] : x < x1 - 12 ? P[5] : P[3]));
      p.scan(x1 - 15, wallTop - 33, x1 - 7, wallTop - 31, (x, y) => (y < wallTop - 32.5 ? G[4] : G[2]));
    } else {
      // Eckturm links mit Spitzhelm und Sternglaslicht
      towerBody(p, x0 + 1, 7, wallTop - 20, bot - 4, seed);
      archWin(p, g, x0 - 2, wallTop - 10, 5, 6, { box: false });
      spire(p, x0 + 1, wallTop - 20, wallTop - 42, 9, R);
    }
  }, { ax: cx, ay: bot, b: true, box: [-30, -22, 30, 1], extra: v === 1 ? { smoke: { dx: 18, dy: -66, rate: 2 } } : undefined,
    light: { dx: 0, dy: -18, radius: 64, color: LAMP_LIGHT, intensity: 0.5 } });
}

// Gasthaus „Zum Fallenden Stern“: zweigeschossig, Laubengang mit Säulen, Aushängeschild mit fallendem Stern
function starInn() {
  const W = 128, H = 108, cx = 64, bot = H - 2, seed = 2200;
  return mk(W, H, (p, g) => {
    const x0 = 10, x1 = W - 10, wallTop = bot - 50;
    footShade(p, cx, bot, 60, 4);
    pearlWall(p, x0, x1, wallTop, bot - 4, seed, { side: 7 });
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    cornice(p, x0 - 1, x1 + 1, wallTop);
    cornice(p, x0 - 1, x1 + 1, wallTop + 24);
    for (let i = 0; i < 6; i++) archWin(p, g, x0 + 9 + i * 17, wallTop + 7, 7, 10);
    archDoor(p, g, cx, bot - 3, 14, 22);
    archWin(p, g, x0 + 10, bot - 22, 9, 11);
    archWin(p, g, x0 + 30, bot - 22, 9, 11);
    archWin(p, g, x1 - 39, bot - 22, 9, 11);
    archWin(p, g, x1 - 19, bot - 22, 9, 11);
    roof(p, x0 - 6, x1 + 6, wallTop - 30, wallTop + 1, SLATE, seed, 16);
    // Zwei Gauben
    for (const gx of [cx - 32, cx + 20]) {
      p.scan(gx, wallTop - 18, gx + 12, wallTop - 6, (x, y) => (x > gx + 10 ? P[3] : y < wallTop - 17.5 ? P[6] : P[5]));
      archWin(p, g, gx + 3, wallTop - 13, 6, 5, { box: false });
      roof(p, gx - 2, gx + 14, wallTop - 25, wallTop - 17, ROSE, seed + gx, 7);
    }
    // Kamin
    p.scan(x1 - 22, wallTop - 40, x1 - 14, wallTop - 20, (x, y) => (y < wallTop - 39 ? P[6] : x < x1 - 20 ? P[5] : P[3]));
    p.scan(x1 - 23, wallTop - 41, x1 - 13, wallTop - 39, (x, y) => (y < wallTop - 40.5 ? G[4] : G[2]));
    // Aushängeschild am Ausleger links der Tür: Holzschild, Goldstern mit Schweif
    const sx = cx - 26, sy = bot - 34;
    p.fline(sx - 4, sy - 3, sx + 12, sy - 3, GOLD[2], 1);
    p.fline(sx + 1, sy - 3, sx + 1, sy, GOLD[3], 0.5); p.fline(sx + 9, sy - 3, sx + 9, sy, GOLD[3], 0.5);
    p.scan(sx - 2, sy, sx + 12, sy + 9, (x, y) => (y < sy + 0.5 || x < sx - 1.5 ? Wd[4] : y > sy + 8.5 || x > sx + 11.5 ? Wd[1] : Wd[2]));
    for (let t = 0; t < 1; t += 0.08) p.dot(sx + 1 + t * 5, sy + 2 + t * 3, t < 0.5 ? GOLD[3] : GOLD[4]);
    p.oval(sx + 7.5, sy + 5.5, 1.6, 1.6, GOLD[5]);
    g.oval(sx + 7.5, sy + 5.5, 1.8, 1.8, GOLD[4]);
    // Laternen neben der Tür
    for (const lx of [cx - 12, cx + 12]) {
      p.scan(lx - 1.5, bot - 26, lx + 1.5, bot - 21, (x, y) => (y < bot - 25.5 || y > bot - 21.5 ? G[2] : col32(LAMP[x < lx ? 4 : 3])));
      g.oval(lx, bot - 23.5, 1.8, 2.4, LAMP[4]);
    }
  }, { ax: cx, ay: bot, b: true, box: [-54, -26, 54, 1], extra: { smoke: { dx: 46, dy: -96, rate: 2 }, lights: [{ dx: -12, dy: -24, radius: 60, color: LAMP_LIGHT, intensity: 0.6 }, { dx: 12, dy: -24, radius: 60, color: LAMP_LIGHT, intensity: 0.6 }] } });
}

// Palast der Fürstin Amarys: Hauptbau mit Portal und Freitreppe, zwei Flügel, zwei Ecktürme mit Spitzhelmen,
// Sternkristall über dem Mittelgiebel (Leuchtebene)
function starPalace() {
  const W = 224, H = 176, cx = 112, bot = H - 2, seed = 2300;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 106, 5);
    // Flügel
    for (const [x0, x1] of [[18, 78], [146, 206]]) {
      const top = bot - 38;
      pearlWall(p, x0, x1, top, bot - 4, seed + x0, { side: 6 });
      plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
      cornice(p, x0 - 1, x1 + 1, top);
      for (let i = 0; i < 3; i++) archWin(p, g, x0 + 8 + i * 18, top + 9, 7, 13);
      roof(p, x0 - 4, x1 + 4, top - 20, top + 1, SLATE, seed + x0, 10);
    }
    // Ecktürme
    for (const tx of [14, 210]) {
      towerBody(p, tx, 12, bot - 82, bot - 4, seed + tx);
      plinth(p, tx - 13, tx + 13, bot - 4, bot);
      cornice(p, tx - 13, tx + 13, bot - 82);
      archWin(p, g, tx - 3, bot - 70, 6, 10, { box: false });
      archWin(p, g, tx - 3, bot - 42, 6, 10, { box: false });
      spire(p, tx, bot - 82, bot - 124, 16, SLATE);
    }
    // Hauptbau
    const x0 = 72, x1 = 152, top = bot - 70;
    pearlWall(p, x0, x1, top, bot - 4, seed + 7, { side: 7, bh: 5 });
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    cornice(p, x0 - 1, x1 + 1, top);
    cornice(p, x0 - 1, x1 + 1, top + 32);
    // Säulen vor dem Portal
    for (const sx of [cx - 22, cx - 13, cx + 13, cx + 22]) {
      p.scan(sx - 2.5, top + 34, sx + 2.5, bot - 4, (x, y) => {
        const rel = (x - sx) / 2.5;
        let i = rel < -0.4 ? 6 : rel < 0.2 ? 5 : 3;
        if (y < top + 35.5 || y > bot - 6) i = y < top + 35.5 ? 4 : 5;
        return P[i];
      });
      p.scan(sx - 3.5, top + 33, sx + 3.5, top + 35, (x, y) => (y < top + 34 ? G[4] : G[2]));
    }
    // Portal
    archDoor(p, g, cx, bot - 3, 18, 30);
    for (const wx of [x0 + 6, x0 + 20, x1 - 27, x1 - 13]) archWin(p, g, wx, top + 9, 7, 14);
    archWin(p, g, cx - 5, top + 8, 10, 14, { box: false });
    // Freitreppe
    for (let s = 0; s < 3; s++) p.scan(cx - 20 - s * 3, bot - 4 + s * 1.3, cx + 20 + s * 3, bot - 2.7 + s * 1.3, (x, y) => P[y < bot - 3.5 + s * 1.3 ? 6 : 4]);
    // Dach und Mittelgiebel
    roof(p, x0 - 6, x1 + 6, top - 34, top + 1, SLATE, seed + 9, 16);
    fpoly(p, [[cx - 22, top + 0.5], [cx, top - 22], [cx + 22, top + 0.5]], (x, y) => (y > top - 1 ? GOLD[2] : x < cx - 0.5 ? PEARL[6] : PEARL[4]));
    p.fline(cx - 22, top + 0.5, cx, top - 22, GOLD[3], 1); p.fline(cx, top - 22, cx + 22, top + 0.5, GOLD[2], 1);
    // Rundfenster im Giebel mit Stern
    p.oval(cx, top - 8, 5, 5, PEARL[2]); p.oval(cx, top - 8, 4, 4, CRY[2]);
    for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) p.fline(cx, top - 8, cx + dx, top - 8 + dy, CRY[5], 0.5);
    g.oval(cx, top - 8, 4, 4, CRY[3]);
    // Sternkristall über dem Giebel
    const ky = top - 32;
    fpoly(p, [[cx, ky - 12], [cx - 5, ky], [cx, ky + 6], [cx + 5, ky]], (x, y) => (x < cx ? (y < ky - 4 ? CRY[5] : CRY[4]) : CRY[2]));
    p.fline(cx, ky - 12, cx, ky + 6, CRY[5], 0.5);
    g.each(cx - 5, ky - 12, cx + 5, ky + 6, (x, y) => (Math.abs(x - cx) * 2.2 + Math.abs(y - ky + 3) < 10 ? CRY[3] : null));
    // Banner an den Flügeln
    for (const bx of [48, 176]) {
      p.scan(bx - 4, bot - 34, bx + 4, bot - 16, (x, y) => {
        if (y > bot - 19 && Math.abs(x - bx) < (y - (bot - 19)) * 1.3) return 0;
        return col32(y < bot - 33 ? GOLD[3] : x < bx - 2.5 ? SLATE[5] : x > bx + 2.5 ? SLATE[2] : SLATE[4]);
      });
      p.oval(bx, bot - 27, 1.6, 1.6, GOLD[4]);
    }
  }, { ax: cx, ay: bot, b: true, extra: { boxes: [[-104, -32, -34, 1], [-40, -36, 40, 1], [34, -32, 104, 1]], lights: [{ dx: 0, dy: -110, radius: 90, color: CRY_LIGHT, intensity: 0.55 }, { dx: 0, dy: -20, radius: 80, color: LAMP_LIGHT, intensity: 0.55 }] } });
}

// Sternturm (Sternkundige Seraphe): schlanker Rundturm, Galerie, Kuppel mit Fernrohr, Sternglas oben
function starTower() {
  const W = 64, H = 188, cx = 32, bot = H - 2, seed = 2400;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 26, 3);
    towerBody(p, cx, 14, bot - 130, bot - 5, seed);
    plinth(p, cx - 17, cx + 17, bot - 6, bot);
    for (const y of [bot - 130, bot - 92, bot - 52]) cornice(p, cx - 15, cx + 15, y);
    archDoor(p, g, cx, bot - 5, 10, 18);
    for (const y of [bot - 46, bot - 84, bot - 120]) archWin(p, g, cx - 3, y, 6, 10, { box: false });
    // Galerie mit Brüstung
    const gy = bot - 136;
    p.scan(cx - 20, gy, cx + 20, gy + 6, (x, y) => {
      if (y < gy + 0.5) return G[4];
      if (y > gy + 5) return P[2];
      const bal = ((x - cx + 40) % 3) < 1.2;
      return bal ? (x < cx ? P[6] : P[4]) : y < gy + 1.5 ? P[5] : 0;
    });
    p.scan(cx - 21, gy + 5, cx + 21, gy + 7, (x, y) => (y < gy + 6 ? P[5] : P[2]));
    // Kuppel
    lump(p, cx, gy - 2, 13, 13, SLATE, { lo: 2, hi: 6, cut: (x, y) => y > gy - 0.5 });
    for (let a = -1; a <= 1; a += 0.5) p.fline(cx + a * 12, gy - 1, cx + a * 3, gy - 14, GOLD[2], 0.5);
    // Fernrohr
    p.fline(cx + 4, gy - 8, cx + 16, gy - 18, GOLD[3], 2); p.fline(cx + 4, gy - 9, cx + 16, gy - 19, GOLD[4], 0.5);
    // Sternglas auf der Spitze
    const sy = gy - 22;
    p.fline(cx, sy, cx, gy - 13, GOLD[2], 1);
    p.oval(cx, sy - 2, 3, 3, CRY[4]); p.dot(cx - 1, sy - 3, CRY[5]);
    g.oval(cx, sy - 2, 3.6, 3.6, CRY[3]);
  }, { ax: cx, ay: bot, b: true, box: [-16, -14, 16, 1], extra: { lights: [{ dx: 0, dy: -160, radius: 80, color: CRY_LIGHT, intensity: 0.7 }] }, light: { dx: 0, dy: -16, radius: 50, color: LAMP_LIGHT, intensity: 0.5 } });
}

// Schmiede (Zwergenschmiedin Brunna): offene Halle unter einem Pultdach auf Säulen, Esse mit Glut, Amboss,
// Wassertrog, Waffenständer
function starForge() {
  const W = 104, H = 86, cx = 52, bot = H - 2, seed = 2500;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 48, 3.5);
    const x0 = 8, x1 = W - 8, top = bot - 44;
    // Rückwand (dunkler im Inneren)
    p.scan(x0, top, x1, bot - 4, (x, y) => {
      const row = Math.floor((y - top) / 4), lx = (x - x0 + (row & 1) * 4) % 8;
      return P[(y - top) % 4 < 0.5 || lx < 0.5 ? 0 : x > x1 - 5 ? 1 : 2];
    });
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    // Esse (links): Kaminblock, Glutmaul
    const ex = x0 + 6;
    pearlWall(p, ex, ex + 24, top - 24, bot - 4, seed, { side: 4 });
    p.scan(ex + 4, bot - 18, ex + 20, bot - 6, (x, y) => {
      if (y < bot - 15 && Math.abs(x - (ex + 12)) > (y - (bot - 18)) * 3 + 2) return 0;
      const k = (y - (bot - 18)) / 12;
      return col32(k > 0.7 ? EMBER[hash2(Math.floor(x * 2), Math.floor(y * 2), 51) < 0.4 ? 5 : 4] : k > 0.35 ? EMBER[3] : EMBER[1]);
    });
    g.each(ex + 4, bot - 18, ex + 20, bot - 6, (x, y) => (y > bot - 14 ? EMBER[4] : y > bot - 16 ? EMBER[3] : null));
    p.scan(ex - 1, top - 26, ex + 25, top - 23, (x, y) => (y < top - 25.5 ? G[4] : G[2]));
    // Pultdach auf zwei Säulen
    for (const sx of [x0 + 34, x1 - 4]) p.scan(sx - 2, top + 4, sx + 2, bot - 4, (x) => P[x < sx - 0.5 ? 6 : x < sx + 1 ? 5 : 3]);
    roof(p, x0 + 26, x1 + 4, top - 10, top + 5, SLATE, seed, 4);
    // Amboss
    const ax = cx + 8, ay = bot - 6;
    p.scan(ax - 3, ay - 5, ax + 3, ay, (x) => col32(x < ax ? '#585070' : '#3a3250'));
    p.scan(ax - 7, ay - 9, ax + 6, ay - 5, (x, y) => col32(y < ay - 8.5 ? '#9a94b4' : x < ax ? '#7a7494' : '#585070'));
    fpoly(p, [[ax + 6, ay - 9], [ax + 11, ay - 8], [ax + 6, ay - 6]], '#585070');
    // Wassertrog
    p.scan(x1 - 26, bot - 9, x1 - 10, bot - 3, (x, y) => (y < bot - 8.5 ? P[6] : y < bot - 7.5 && x > x1 - 25 && x < x1 - 11 ? col32(WATER[4]) : x > x1 - 12 ? P[2] : P[4]));
    // Waffenständer
    for (let i = 0; i < 4; i++) {
      const wx = x0 + 40 + i * 5;
      p.fline(wx, top + 12, wx, bot - 8, i & 1 ? '#9a94b4' : '#c2bed8', 0.5);
      p.oval(wx, top + 12, 1, 1.6, i & 1 ? GOLD[3] : '#c2bed8');
    }
    p.scan(x0 + 38, bot - 9, x0 + 58, bot - 7, (x, y) => (y < bot - 8.5 ? Wd[4] : Wd[2]));
  }, { ax: cx, ay: bot, b: true, box: [-46, -20, 46, 1], extra: { smoke: { dx: -26, dy: -74, rate: 3 }, embers: { dx: -26, dy: -16, rate: 3 } }, light: { dx: -26, dy: -12, radius: 90, color: [255, 150, 70], intensity: 0.9 } });
}

// Sternstall (Stallmeister Corvin): offene Boxen unter Rosadach, Heu, Kopf eines Sternrosses über der Tür
function starStable() {
  const W = 112, H = 78, cx = 56, bot = H - 2, seed = 2600;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 52, 3.5);
    const x0 = 8, x1 = W - 8, top = bot - 32;
    pearlWall(p, x0, x1, top, bot - 4, seed, { side: 6 });
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    cornice(p, x0 - 1, x1 + 1, top);
    // drei Boxen mit halbhohen Türen
    for (let i = 0; i < 3; i++) {
      const bx = x0 + 10 + i * 30;
      p.scan(bx, top + 6, bx + 20, bot - 4, (x, y) => (y < top + 6.5 ? P[2] : col32('#1a1428')));
      p.scan(bx, bot - 16, bx + 20, bot - 4, (x, y) => {
        if (y < bot - 15.5) return Wd[5];
        const lx = (x - bx) % 4;
        return lx < 0.5 ? Wd[1] : x > bx + 19 ? Wd[2] : Wd[3];
      });
      p.fline(bx, bot - 15, bx + 20, bot - 5, WOOD[4], 0.5);
      // Heu
      for (let k = 0; k < 14; k++) { const hx = bx + 2 + hash2(k, i, seed) * 16, hy = bot - 17 - hash2(i, k, seed) * 3; p.fline(hx, hy, hx + 1.5, hy - 1, k & 1 ? '#d8c070' : '#b09a50', 0.5); }
    }
    // Sternross in der mittleren Box: heller Kopf, Sternenmähne (Leuchtebene)
    const hx = cx, hy = top + 12;
    fpoly(p, [[hx - 2, hy - 3], [hx - 3.5, hy - 6], [hx - 1, hy - 3.5], [hx + 1, hy - 3.5], [hx + 3.5, hy - 6], [hx + 2, hy - 3]], PEARL[5]);
    p.scan(hx - 3.5, hy - 3.5, hx + 3.5, hy + 9, (x, y) => {
      const w = y < hy + 2 ? 3.5 : 3.5 - (y - hy - 2) * 0.2;
      if (Math.abs(x - hx) > w) return 0;
      return y > hy + 6 ? P[3] : x < hx - 1 ? P[6] : x < hx + 2 ? P[5] : P[4];
    });
    p.dot(hx - 2, hy + 1, '#141020'); p.dot(hx + 2, hy + 1, '#141020');
    p.dot(hx - 1, hy + 7.5, PEARL[1]); p.dot(hx + 1, hy + 7.5, PEARL[1]);
    p.fline(hx - 0.5, hy - 2, hx + 0.5, hy + 4, PEARL[6], 0.5);
    for (let k = 0; k < 7; k++) { const mx = hx + 3.5, my = hy - 2 + k * 1.2; p.dot(mx, my, CRY[4]); g.dot(mx, my, CRY[3]); }
    roof(p, x0 - 5, x1 + 5, top - 22, top + 1, ROSE, seed, 12);
    // Hufeisen über dem Tor
    p.scan(cx - 3, top - 5, cx + 3, top - 1, (x, y) => (Math.hypot(x - cx, y - (top - 1)) < 3 && Math.hypot(x - cx, y - (top - 1)) > 1.8 ? G[4] : 0));
  }, { ax: cx, ay: bot, b: true, box: [-48, -22, 48, 1] });
}

// Koppelzaun (Perlsteinpfosten, Goldkappen, Holzlatten); waagerecht kachelbreit, senkrecht schmal
function paddock(vert) {
  const W = vert ? 8 : 16, H = vert ? 22 : 14, cx = W / 2;
  return mk(W, H, (p) => {
    if (vert) {
      p.scan(cx - 1.5, 2, cx + 1.5, H - 2, (x) => P[x < cx ? 6 : 4]);
      p.oval(cx, 2, 1.8, 1.2, GOLD[3]);
      p.scan(cx - 1, 6, cx + 1, H - 3, (x, y) => ((y % 6) < 1.2 ? Wd[4] : 0));
      return;
    }
    for (const px of [2, 14]) { p.scan(px - 1.5, 3, px + 1.5, H - 2, (x) => P[x < px ? 6 : 4]); p.oval(px, 3, 1.8, 1.2, GOLD[3]); }
    for (const y of [6, 9.5]) p.scan(0, y, W, y + 1.5, (x, yy) => (yy < y + 0.5 ? Wd[5] : Wd[3]));
  }, { ax: Math.floor(cx), ay: H - 2, b: true, box: vert ? [-2, -10, 2, 6] : [-8, -3, 8, 1], extra: { low: true } });
}

// Balustrade an der Inselkante (kachelbreit): Handlauf, gedrungene Docken
function balustrade() {
  const W = 16, H = 14;
  return mk(W, H, (p) => {
    p.scan(0, 3, W, 5, (x, y) => P[y < 3.5 ? 6 : 4]);
    for (let bx = 2; bx < W; bx += 4) {
      p.scan(bx - 1.2, 5, bx + 1.2, H - 3, (x, y) => {
        const bulge = Math.sin(((y - 5) / (H - 8)) * Math.PI) * 0.6;
        return Math.abs(x - bx) > 0.6 + bulge ? 0 : P[x < bx ? 6 : 4];
      });
    }
    p.scan(0, H - 3, W, H - 1, (x, y) => P[y < H - 2.5 ? 5 : 2]);
  }, { ax: 8, ay: H - 2, b: true, box: [-8, -3, 8, 1], extra: { low: true } });
}

// Marktstand mit gestreifter Markise: 0 Sternglas (blau), 1 Stoffe (rosa), 2 Früchte (gold)
function starStall(v) {
  const W = 48, H = 46, cx = 24, bot = H - 2;
  const AW = [SLATE, ROSE, GOLD.slice(1).concat(['#fff8e0'])][v];
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 22, 2.5);
    // Pfosten
    for (const px of [5, W - 5]) p.scan(px - 1, 12, px + 1, bot, (x) => P[x < px ? 6 : 3]);
    // Tisch
    p.scan(3, bot - 12, W - 3, bot - 1, (x, y) => (y < bot - 11.5 ? P[6] : y < bot - 10 ? P[5] : x > W - 6 ? Wd[1] : Wd[(Math.floor(x) % 6) < 0.6 ? 1 : 3]));
    // Waren
    const rng = createRng(2700 + v);
    for (let i = 0; i < 9; i++) {
      const x = 7 + i * 4 + rng.range(-0.6, 0.6), y = bot - 13.5;
      if (v === 0) { p.fline(x, y + 1, x, y - 3, CRY[4], 1); p.dot(x - 0.5, y - 3, CRY[5]); g.dot(x, y - 2, CRY[3]); }
      else if (v === 1) { p.scan(x - 1.6, y - 2.5, x + 1.6, y + 1, (xx, yy) => col32((i & 1 ? ROSE : SLATE)[yy < y - 1.5 ? 6 : xx < x ? 5 : 4])); }
      else { p.oval(x, y - 0.5, 1.5, 1.4, i % 3 ? '#e8a040' : '#c84a5a'); p.dot(x - 0.6, y - 1.2, '#fff0c8'); }
    }
    // Markise: Streifen, gewellter Saum
    p.scan(1, 6, W - 1, 15, (x, y) => {
      const k = (y - 6) / 9, sag = Math.sin(((x - 1) / 4) * Math.PI) * 0.8;
      if (y > 14 + Math.abs(sag)) return 0;
      const stripe = Math.floor((x - 1 + (y - 6) * 0.25) / 4) & 1;
      const C = stripe ? P : pal32(AW);
      let i = k < 0.2 ? 6 : k < 0.6 ? 5 : 4;
      if (x > W - 6) i -= 1;
      return C[Math.min(C.length - 1, i)];
    });
    p.scan(1, 4.5, W - 1, 6, (x, y) => (y < 5 ? G[4] : G[2]));
  }, { ax: cx, ay: bot, b: true, box: [-20, -10, 20, 1] });
}

// Ankerbrunnen (Ankerplatz): achteckiges Becken, Säule, schwebender Ankerstein mit Runenband (Leuchtebene)
function anchorWell() {
  const W = 64, H = 76, cx = 32, bot = H - 3;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 30, 4);
    const by = bot - 7;
    // Becken: Außenrand, Wasser, Innenrand
    p.scan(cx - 28, by - 9, cx + 28, bot, (x, y) => {
      const d = Math.abs(x - cx) / 28 + Math.abs(y - by) / 9 * 0.9, e = ((x - cx) / 28) ** 2 + ((y - by) / 9) ** 2;
      if (Math.max(d * 0.82, e) > 1) {
        // Seitenwand unten
        if (y > by && Math.abs(x - cx) < 27 && y < by + 7 && ((x - cx) / 28) ** 2 + ((y - by - 6) / 9) ** 2 <= 1) return P[x < cx - 10 ? 5 : x < cx + 12 ? 4 : 3];
        return 0;
      }
      if (e > 0.72) return P[y < by ? 6 : 5];
      const wv2 = Math.sin(x * 0.35 + y * 0.9) + Math.sin(x * 0.2 - y * 1.3) * 0.6;
      return col32(WATER[wv2 > 1.35 ? 5 : wv2 > 0.7 ? 4 : y < by - 3 ? 3 : 2]);
    });
    // Säule
    p.scan(cx - 3, by - 20, cx + 3, by + 1, (x) => P[x < cx - 1 ? 6 : x < cx + 1.5 ? 5 : 3]);
    p.scan(cx - 5, by - 22, cx + 5, by - 20, (x, y) => (y < by - 21.5 ? G[4] : G[2]));
    // schwebender Ankerstein
    const sy = by - 40;
    fpoly(p, [[cx - 9, sy - 6], [cx + 1, sy - 13], [cx + 10, sy - 5], [cx + 7, sy + 6], [cx, sy + 12], [cx - 8, sy + 5]], (x, y) => {
      const l = (cx - x) * 0.05 + (sy - y) * 0.06;
      return PEARL[l > 0.35 ? 6 : l > 0 ? 5 : l > -0.35 ? 4 : 3];
    });
    // Runenband
    for (let x = cx - 8; x <= cx + 8; x += 1.5) { const y = sy + (x - cx) * 0.12; p.dot(x, y, CRY[4]); g.dot(x, y, CRY[3]); }
    // Lichtfäden zwischen Stein und Säule
    for (let y = sy + 12; y < by - 22; y += 2) { p.dot(cx + Math.sin(y) * 0.8, y, CRY[4]); g.dot(cx, y, CRY[3]); }
    // Wasserstrahlen in den Becken
    for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.1) p.dot(cx + s * (3 + t * 9), by - 18 + t * t * 14, WATER[5]);
  }, { ax: cx, ay: bot, b: true, box: [-26, -12, 26, 1], light: { dx: 0, dy: -44, radius: 80, color: CRY_LIGHT, intensity: 0.7 } });
}

// Stadtbanner am Mast (Schieferblau mit Goldstern, Schwalbenschwanz)
function starBanner() {
  const W = 20, H = 58, cx = 6, bot = H - 2;
  return mk(W, H, (p) => {
    p.scan(cx - 1, 6, cx + 1, bot, (x) => P[x < cx ? 6 : 3]);
    p.scan(cx - 2.5, bot - 3, cx + 2.5, bot, (x, y) => P[y < bot - 2.5 ? 6 : 4]);
    p.oval(cx, 4.5, 1.8, 1.8, GOLD[4]);
    p.fline(cx, 8, cx + 12, 8, GOLD[3], 0.5);
    const S = pal32(SLATE);
    p.scan(cx + 1, 8.5, cx + 13, 34, (x, y) => {
      const notch = 34 - Math.abs(x - (cx + 7)) * 0.9;
      if (y > notch + 3 - 3) return y > 31 + Math.abs(x - (cx + 7)) * 0.9 - 3 ? 0 : S[4];
      return x < cx + 3 ? S[6] : x > cx + 11 ? S[2] : S[4];
    });
    // Goldstern
    const sx = cx + 7, sy = 18;
    for (let a = 0; a < 5; a++) { const t = a * 1.2566 - Math.PI / 2; p.fline(sx, sy, sx + Math.cos(t) * 3.5, sy + Math.sin(t) * 3.5, GOLD[4], 0.5); }
    p.oval(sx, sy, 1.3, 1.3, GOLD[5]);
    p.scan(cx + 1, 24, cx + 13, 25, () => G[3]);
  }, { ax: cx, ay: bot, b: true, box: [-2, -2, 2, 1] });
}

// Steinbank
function parkBench() {
  const W = 30, H = 14, cx = 15;
  return mk(W, H, (p) => {
    for (const lx of [6, 24]) p.scan(lx - 1.5, 6, lx + 1.5, H - 2, (x) => P[x < lx ? 5 : 3]);
    p.scan(2, 4, W - 2, 7, (x, y) => P[y < 4.5 ? 6 : y > 6.5 ? 2 : x > W - 4 ? 3 : 5]);
    p.scan(3, 1, W - 3, 4, (x, y) => P[y < 1.5 ? 6 : y > 3.5 ? 3 : 4]);
  }, { ax: cx, ay: H - 2, b: true, box: [-12, -4, 12, 1], extra: { low: true } });
}

// Blumenkasten aus Perlstein mit Rosen und kleinem Blütenstrauch
function flowerBox(v) {
  const W = 26, H = 20, cx = 13, rng = createRng(2800 + v);
  return mk(W, H, (p) => {
    canopy(p, [[cx, 9, 6.5], [cx - 6, 10, 4.5, -0.3], [cx + 6, 10, 4.5, -0.4]], v ? LEAF : BUSH, 2810 + v, { lo: 1, hi: 4, tuft: 0.8 });
    for (let i = 0; i < 9; i++) { const x = cx + rng.range(-9, 9), y = rng.range(5, 12); p.dot(x, y, v ? LEAF[5] : ROSE[5]); }
    p.scan(2, 12, W - 2, H - 2, (x, y) => (y < 12.5 ? P[6] : y < 13.5 ? G[3] : x > W - 4 ? P[2] : P[4]));
  }, { ax: cx, ay: H - 2, b: true, box: [-11, -5, 11, 1], extra: { low: true } });
}

// Brückentor: zwei Pfeilertürme mit Spitzdach, Bogen mit Goldschlussstein; sealed = Ostbrücke (Teil 2), mit
// violett-goldenem Siegelschleier geschlossen
function bridgeGate(sealed) {
  const W = 100, H = 96, cx = 50, bot = H - 2, seed = 2900 + (sealed ? 1 : 0);
  return mk(W, H, (p, g) => {
    const pw = 20, top = bot - 54;
    for (const px of [2, W - 2 - pw]) {
      pearlWall(p, px, px + pw, top, bot - 4, seed + px, { side: 4 });
      plinth(p, px - 1, px + pw + 1, bot - 4, bot);
      cornice(p, px - 1, px + pw + 1, top);
      roof(p, px - 3, px + pw + 3, top - 18, top + 1, SLATE, seed + px, 9);
      archWin(p, g, px + 7, top + 10, 6, 8, { box: false });
    }
    // Bogen: Sturz mit Goldkante, Zwickel bis zur Bogenlinie (Ellipse), Bogenkante hell
    const ax0 = 2 + pw, ax1 = W - 2 - pw, ar = (ax1 - ax0) / 2 - 1, ay = top + 18, ary = 15;
    p.scan(ax0, top - 2, ax1, ay, (x, y) => {
      const e = Math.hypot((x - cx) / ar, (y - ay) / ary);
      if (e < 1 && y > top + 1.5) return 0;
      return y < top - 1.5 ? G[4] : y < top - 0.5 ? G[2] : e < 1.08 ? P[2] : x < cx ? P[5] : P[4];
    });
    fpoly(p, [[cx - 3, top - 3], [cx + 3, top - 3], [cx + 2, top + 4], [cx - 2, top + 4]], GOLD[3]);
    p.oval(cx, top, 1.2, 1.2, GOLD[5]);
    // Hängelaternen
    for (const lx of [ax0 + 4, ax1 - 4]) {
      p.fline(lx, top + 4, lx, top + 9, GOLD[2], 0.5);
      p.scan(lx - 1.5, top + 9, lx + 1.5, top + 13, (x, y) => (y < top + 9.5 || y > top + 12.5 ? G[2] : col32(LAMP[x < lx ? 4 : 3])));
      g.oval(lx, top + 11, 1.8, 2.2, LAMP[4]);
    }
    if (sealed) {
      // Siegelschleier: violettes Flimmern mit Goldrunen, Siegelkristall in der Mitte
      p.scan(ax0, top + 2, ax1, bot - 2, (x, y) => {
        if (y < ay && Math.hypot((x - cx) / ar, (y - ay) / ary) > 0.97) return 0;
        const n = Math.sin(x * 0.45 + y * 0.12) + Math.sin(y * 0.3 - x * 0.18) * 0.7;
        return col32(hash2(Math.floor(x * 2), Math.floor(y * 2), 2950) < 0.02 ? VOIDC[5] : n > 1.1 ? VOIDC[4] : n > 0 ? VOIDC[3] : VOIDC[2]);
      });
      g.each(ax0, top + 2, ax1, bot - 2, (x, y) => ((y > ay || Math.hypot((x - cx) / ar, (y - ay) / ary) < 0.97) && Math.sin(x * 0.45 + y * 0.12) + Math.sin(y * 0.3 - x * 0.18) * 0.7 > 1.1 ? VOIDC[4] : null));
      const sy = bot - 28;
      fpoly(p, [[cx, sy - 8], [cx - 5, sy], [cx, sy + 8], [cx + 5, sy]], (x, y) => (x < cx ? GOLD[4] : GOLD[2]));
      g.oval(cx, sy, 4, 6, GOLD[4]);
      for (const [dx, dy] of [[-14, -6], [14, -6], [-16, 10], [16, 10]]) { p.dot(cx + dx, sy + dy, GOLD[5]); g.dot(cx + dx, sy + dy, GOLD[4]); }
    }
  }, { ax: cx, ay: bot, b: true, extra: { boxes: sealed ? [[-48, -10, 48, 1]] : [[-48, -10, -28, 1], [28, -10, 48, 1]],
    lights: [{ dx: -24, dy: -42, radius: 54, color: LAMP_LIGHT, intensity: 0.6 }, { dx: 24, dy: -42, radius: 54, color: LAMP_LIGHT, intensity: 0.6 }, ...(sealed ? [{ dx: 0, dy: -26, radius: 70, color: [180, 120, 255], intensity: 0.7 }] : [])] } });
}

// Sternentor (Ankerplatz, zurück in die Glutöde): Perlsteinring auf Podest, innen ein Wirbel aus Glut, der an
// die Heimat erinnert; Goldrunen auf dem Ring
function starGate() {
  const W = 84, H = 104, cx = 42, bot = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 38, 4);
    // Podest (zwei Stufen)
    p.scan(cx - 36, bot - 8, cx + 36, bot, (x, y) => (y < bot - 7.5 ? P[6] : y < bot - 4 ? (x > cx + 32 ? P[3] : P[5]) : y < bot - 3.5 ? P[6] : x > cx + 33 ? P[2] : P[4]));
    const ry = bot - 46, R = 34, r = 26;
    // Glutwirbel innen
    p.scan(cx - r, ry - r, cx + r, ry + r, (x, y) => {
      const dx = x - cx, dy = y - ry, d = Math.hypot(dx, dy);
      if (d > r) return 0;
      const a = Math.atan2(dy, dx), s = Math.sin(a * 3 + d * 0.35);
      const k = 1 - d / r;
      return col32(EMBER[s > 0.55 ? (k > 0.5 ? 5 : 4) : s > -0.2 ? 3 : k > 0.6 ? 2 : 1]);
    });
    g.each(cx - r, ry - r, cx + r, ry + r, (x, y) => {
      const dx = x - cx, dy = y - ry, d = Math.hypot(dx, dy);
      if (d > r) return null;
      return Math.sin(Math.atan2(dy, dx) * 3 + d * 0.35) > 0.4 ? EMBER[4] : d < 8 ? EMBER[5] : null;
    });
    // Ring
    p.scan(cx - R, ry - R, cx + R, ry + R, (x, y) => {
      const dx = x - cx, dy = y - ry, d = Math.hypot(dx, dy);
      if (d > R || d < r) return 0;
      const a = Math.atan2(dy, dx), seg = Math.abs(((a / (Math.PI * 2)) * 16 + 16) % 1) < 0.05;
      const l = -(dx + dy) / (R * 1.4);
      let i = l > 0.3 ? 6 : l > -0.1 ? 5 : l > -0.45 ? 4 : 3;
      if (d < r + 1) i = 2; else if (d > R - 1) i = Math.min(i, 3);
      if (seg) i -= 2;
      return P[Math.max(0, i)];
    });
    // Goldrunen auf dem Ring
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * Math.PI * 2, x = cx + Math.cos(a) * (R + r) / 2, y = ry + Math.sin(a) * (R + r) / 2;
      p.dot(x, y, GOLD[4]); p.dot(x + 0.5, y + 0.5, GOLD[3]); g.dot(x, y, GOLD[4]);
    }
    // Füße des Rings
    for (const s of [-1, 1]) p.scan(cx + s * 26 - 5, bot - 18, cx + s * 26 + 5, bot - 8, (x, y) => P[y < bot - 17.5 ? 6 : x < cx + s * 26 ? 5 : 3]);
    p.oval(cx, ry - R - 1.5, 2.2, 2.2, GOLD[4]); p.dot(cx - 0.7, ry - R - 2.2, GOLD[5]);
  }, { ax: cx, ay: bot, b: true, extra: { boxes: [[-38, -10, -18, 1], [18, -10, 38, 1]] }, light: { dx: 0, dy: -46, radius: 110, color: [255, 160, 80], intensity: 0.85 } });
}

// Glutriss (Glutöde, hinter dem Throntor): ein Spalt im Himmel über der Asche, Sternenlicht fällt heraus.
// off = geschlossen (vor q_homecoming nur ein schwach glimmender Sprung), on = offen
function skyRift(open) {
  const W = 56, H = 90, cx = 28, bot = H - 3;
  return mk(W, H, (p, g) => {
    // Bodennarbe
    p.scan(cx - 22, bot - 5, cx + 22, bot + 1, (x, y) => (((x - cx) / 22) ** 2 + ((y - bot + 2) / 3) ** 2 > 1 ? 0 : col32(open ? '#3a3050' : '#2a1a14')));
    const top = 6, w = open ? 9 : 2.2;
    for (let y = top; y < bot - 2; y += 0.5) {
      const t = (y - top) / (bot - 2 - top), hw = Math.sin(t * Math.PI) ** 0.7 * w, x = cx + Math.sin(y * 0.16) * 4 * (1 - t * 0.5);
      if (open) {
        p.fline(x - hw, y, x + hw, y, '#1a1a3a', 0);
        for (let xx = x - hw + 1; xx < x + hw - 1; xx += 0.5) if (hash2(Math.floor(xx * 2), Math.floor(y * 2), 3100) < 0.05) p.dot(xx, y, '#ffffff');
        p.dot(x - hw, y, CRY[4]); p.dot(x + hw, y, '#d8a4ff');
        g.dot(x - hw, y, CRY[3]); g.dot(x + hw, y, '#b48aff');
        if (hash2(1, Math.floor(y * 2), 3101) < 0.3) g.dot(x, y, '#e8f4ff');
      } else {
        p.fline(x - hw, y, x + hw, y, EMBER[2], 0);
        g.dot(x, y, EMBER[3]);
      }
    }
  }, { ax: cx, ay: bot, b: true, box: [-10, -4, 10, 1], light: open ? { dx: 0, dy: -44, radius: 120, color: [180, 200, 255], intensity: 0.9 } : { dx: 0, dy: -40, radius: 50, color: [255, 140, 60], intensity: 0.4 } });
}

// Tresor der Sternbank (Bankobjekt): Perlsteinschrein mit Goldbeschlägen und Sternglasschloss
function starVault() {
  const W = 32, H = 30, cx = 16, bot = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 14, 2);
    p.scan(3, 8, W - 3, bot, (x, y) => (y < 8.5 ? P[6] : y > bot - 1 ? P[1] : x > W - 6 ? P[3] : (Math.floor(y) % 5 === 0 ? P[4] : P[5])));
    lump(p, cx, 9, 13, 6, PEARL, { lo: 3, hi: 6, cut: (x, y) => y > 9 });
    for (const x of [5, W - 5]) p.scan(x - 1, 8, x + 1, bot, (xx) => G[xx < x ? 4 : 2]);
    p.scan(3, 16, W - 3, 17.5, (x, y) => (y < 16.5 ? G[4] : G[2]));
    p.oval(cx, 21, 3, 3, GOLD[2]); p.oval(cx, 21, 2, 2, CRY[4]); p.dot(cx - 0.5, 20.5, CRY[5]);
    g.oval(cx, 21, 2.2, 2.2, CRY[3]);
  }, { ax: cx, ay: bot, b: true, box: [-13, -8, 13, 1], light: { dx: 0, dy: -8, radius: 40, color: CRY_LIGHT, intensity: 0.4 } });
}

// Pflanzinsel mit Blütenbaum für Plätze: runder Perlsteinring
function treePlanter() {
  const W = 52, H = 62, cx = 26, bot = H - 2, rng = createRng(3200);
  return mk(W, H, (p) => {
    p.scan(cx - 14, bot - 7, cx + 14, bot, (x, y) => {
      const e = ((x - cx) / 14) ** 2 + ((y - bot + 4) / 4) ** 2;
      return e > 1 ? 0 : e > 0.6 ? P[y < bot - 4 ? 6 : 4] : col32(BUSH[2]);
    });
    p.fline(cx, bot - 6, cx - 1, bot - 24, '#342640', 3); p.fline(cx, bot - 6, cx - 1, bot - 24, '#463654', 1);
    canopy(p, [[cx, 20, 13], [cx - 10, 26, 9, -0.4], [cx + 10, 25, 9, -0.5], [cx - 4, 12, 8, 0.6], [cx + 6, 13, 7, 0.4]], LEAF, 3201, { lo: 1, hi: 4, bias: -0.1 });
    for (let i = 0; i < 14; i++) p.dot(cx + rng.range(-18, 18), rng.range(8, 30), LEAF[5]);
  }, { ax: cx, ay: bot, b: true, box: [-13, -6, 13, 1], extra: { shadow: 0 } });
}

export function createStarCityDecor() {
  return {
    starHouses: [0, 1, 2].map(starHouse),
    starInn: starInn(),
    starPalace: starPalace(),
    starTower: starTower(),
    starForge: starForge(),
    starStable: starStable(),
    paddockH: paddock(false),
    paddockV: paddock(true),
    balustrade: balustrade(),
    starStalls: [0, 1, 2].map(starStall),
    anchorWell: anchorWell(),
    starBanner: starBanner(),
    parkBench: parkBench(),
    flowerBoxes: [0, 1].map(flowerBox),
    bridgeGate: bridgeGate(false),
    sealedGate: bridgeGate(true),
    starGate: starGate(),
    starVault: starVault(),
    treePlanter: treePlanter(),
  };
}

// Glutriss als Questobjekt für die Glutöde (eigener Satz, damit die Glutöde nicht den ganzen Stadtsatz lädt)
export function createSkyRift() { return { off: skyRift(false), on: skyRift(true) }; }
