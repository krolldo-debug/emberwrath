import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { createRng } from '../core/math.js';

// Kacheln, Flüssigkeiten und Deko für zwei Dungeons der Runde 3:
//   'barrow' – Das Heulende Hügelgrab: Grabkammern unter einem Erdhügel. Gestampfte Erde,
//              grobe Schieferplatten, Trockenmauern, Wurzeln aus der Decke, Grabbeigaben
//              aus altem Gold und Bronze, kaltes blaugrünes Geisterlicht, schwarzes Grabwasser.
//   'spore'  – Der Sporenschlund: lebender Pilzstollen. Fleischig-violetter Fels, Myzelfäden,
//              schleimige Wände, Biolumineszenz in Grün und Violett, giftiger leuchtender Schleim.
// Format wie sprites/biomes.js (createBiomeTiles): Boden = 32×32-Makrokacheln, Wandfront
// oben/unten, Wandkrone, Flüssigkeit (4 Frames + Glow + Uferkante), Props { sprite, glow?, box?, light? }.
// Licht fällt von oben links; Grundstimmung dunkel, damit die Lightmap wirkt.
const T = 16;

// ------------------------------------------------------------------ Rampen
// Hügelgrab
const EARTH = ['#0b0908', '#120e0c', '#1a1411', '#231b16', '#2e241c', '#3b2e23', '#4b3c2d'];   // gestampfte Erde
const BST = ['#0d0f12', '#14171b', '#1c2025', '#252a30', '#30363c', '#3d444a', '#525a60'];     // Schiefer, kalt
const ROOT = ['#120c08', '#1f150e', '#2e2015', '#402d1d', '#553d27', '#6d5134', '#8a6a46'];   // Wurzeln
const LICH = ['#26302a', '#38463a', '#52604c'];                                               // Flechten
const CLAY = ['#1a100b', '#2c1b10', '#452a17', '#613d20', '#7f532c', '#9f6d3c', '#bf8c54'];   // Urnenton
const GHOST = ['#03201e', '#06393a', '#0d5c58', '#1a8a82', '#3ebdaf', '#8aecd8', '#e0fff6']; // Geisterlicht
const GWAT = ['#020405', '#05080a', '#090e11', '#0e1519', '#152026', '#213039', '#34484f'];   // Grabwasser
const GOLD = ['#2c1c08', '#4a3010', '#6e4a18', '#957024', '#be9a3a', '#e2c566', '#fff0a8'];   // altes Gold
const BRZ = ['#24160a', '#3e2814', '#5e4020', '#80592c', '#a67a3e', '#cda05a'];              // alte Bronze
const PAT = ['#1e3a32', '#2e5a4a', '#4a8270'];                                               // Grünspan-Flecken
const IRN = ['#121316', '#1e2024', '#2e3136', '#44484e', '#62676e', '#8a9098'];              // altes Eisen
const FUR = ['#121214', '#1f1f23', '#303036', '#45454c', '#5e5e66', '#7c7c84'];              // Wolfsfell
const WOOD = ['#110b08', '#1c130d', '#2a1d13', '#3a2a1b', '#4c3824', '#604a31'];             // Eichenpfosten
const BONE = PAL.bone;
const RUST = PAL.rust;

// Sporenschlund
const FLESH = ['#0b070c', '#130c14', '#1b111c', '#251726', '#301e30', '#3e273c', '#50334c']; // Fleischfels
const MYC = ['#2c2632', '#4a4252', '#6e6474', '#968a96', '#bfb2b8', '#e4d8d8'];             // Myzel
const STALK = ['#1c1822', '#302838', '#483e52', '#665a6c', '#887a88', '#aa9ca4', '#cbbfc2']; // Pilzstiel
const SGRN = ['#051a0a', '#0a3212', '#12561c', '#1f882a', '#46bc3a', '#98ec6a', '#e4ffc8'];  // Biolumineszenz grün
const SVIO = ['#130820', '#25103c', '#3d1a60', '#5c2a8c', '#8848bc', '#ba80e2', '#ecd2ff'];  // Biolumineszenz violett
const CAPG = ['#08140f', '#0e2016', '#15301e', '#1e4228', '#295834', '#387244', '#4c8e56']; // grüner Hut
const CAPV = ['#110a18', '#1c1028', '#2a183a', '#3a2250', '#4e2e68', '#663e84', '#8254a2']; // violetter Hut
const OCHRE = ['#1c120a', '#2e1e10', '#4a3018', '#684624', '#8a6232', '#ae8246', '#d0a462']; // Konsolenpilze
const MEMB = ['#1a1810', '#2e2a1a', '#48422a', '#666040', '#8a8258', '#aea478', '#d2caa0']; // Kokonhaut
const SLIME = ['#041006', '#08200a', '#0e3610', '#185416', '#28781e', '#48a42c', '#90d84c', '#e0ffa8'];

const cl = (r, i) => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
// 2×2-Ordnungsdither (−0.375 … 0.375)
const dth = (x, y) => (((x & 1) * 2 + (y & 1) * 3) % 4) / 4 - 0.375;

// Senkrechter Zylinder, Licht von links oben
function cylCol(ramp, i, w, base) {
  const t = (i + 0.5) / w;
  if (t < 0.12) return cl(ramp, base - 1);
  if (t < 0.34) return cl(ramp, base + 1);
  if (t < 0.62) return cl(ramp, base);
  if (t < 0.86) return cl(ramp, base - 1);
  return cl(ramp, base - 2);
}

// Gerundeter Körper (Stein, Hut, Blase): Licht oben links, dunkler Rand unten rechts.
function blob(p, cx, cy, rx, ry, ramp, base, spread = 2, G = null, gRamp = null) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      let l = -(nx * 0.65 + ny * 0.85) * (1 - d * 0.25);
      if (d > 0.72 && nx + ny > 0.3) l -= 0.6;
      if (d > 0.8 && nx + ny < -0.6) l += 0.3;
      const idx = base + l * spread + dth(x, y) * 0.9;
      p.px(x, y, cl(ramp, idx));
      if (G && gRamp) G.px(x, y, cl(gRamp, idx - 2));
    }
  }
}

// Unregelmäßige Rechteckteilung (Platten)
function splitRects(rng, x, y, w, h, out, min = 6, depth = 0) {
  const canV = w >= min * 2, canH = h >= min * 2;
  if ((!canV && !canH) || (depth > 1 && rng.chance(0.35))) { out.push([x, y, w, h]); return; }
  const vertical = canV && (!canH || rng.chance(w / (w + h)));
  if (vertical) {
    const cut = rng.int(min, w - min);
    splitRects(rng, x, y, cut, h, out, min, depth + 1);
    splitRects(rng, x + cut, y, w - cut, h, out, min, depth + 1);
  } else {
    const cut = rng.int(min, h - min);
    splitRects(rng, x, y, w, cut, out, min, depth + 1);
    splitRects(rng, x, y + cut, w, h - cut, out, min, depth + 1);
  }
}

// Wurzel/Ranke entlang eines Polygonzugs, Breite w0 → w1, Licht links oben.
function strand(p, pts, w0, w1, R, { shadow = null, tip = true } = {}) {
  const seg = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); len += l; }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = seg[i - 1];
    const vert = Math.abs(by - ay) >= Math.abs(bx - ax);
    for (let s = 0; s <= l; s += 0.4) {
      const t = (acc + s) / len, x = ax + (bx - ax) * (s / l), y = ay + (by - ay) * (s / l);
      const w = w0 + (w1 - w0) * t;
      const n = Math.max(1, Math.round(w));
      for (let k = 0; k < n; k++) {
        const u = n === 1 ? 0.5 : k / (n - 1);
        const c = n === 1 ? R[3] : u < 0.34 ? R[5] : u < 0.7 ? R[3] : R[2];
        if (vert) p.px(Math.round(x - (n - 1) / 2 + k), Math.round(y), c);
        else p.px(Math.round(x), Math.round(y - (n - 1) / 2 + k), c);
      }
      if (shadow) { if (vert) p.px(Math.round(x + (n + 1) / 2), Math.round(y), shadow); else p.px(Math.round(x), Math.round(y + (n + 1) / 2), shadow); }
    }
    acc += l;
  }
  if (tip) { const [ex, ey] = pts[pts.length - 1]; p.px(Math.round(ex), Math.round(ey), R[4]); }
}

// Pfad mit Pendelbewegung (natürliche Wurzeln/Myzel)
function wander(rng, x, y, dx, dy, steps, jitter = 0.6) {
  const pts = [[x, y]];
  let a = Math.atan2(dy, dx);
  for (let i = 0; i < steps; i++) {
    a += rng.range(-jitter, jitter);
    x += Math.cos(a) * 2; y += Math.sin(a) * 2;
    pts.push([x, y]);
  }
  return pts;
}

// prop(W, H, AX, AY, draw(p, G)) → { sprite, glow?, box?, light? } (Glow (W+2)×(H+2), 1 px versetzt)
function prop(W, H, AX, AY, draw, { glow = false, box, light } = {}) {
  const g = glow ? new PixelCanvas(W + 2, H + 2) : null;
  const G = g ? {
    px: (x, y, c) => g.px(x + 1, y + 1, c),
    rect: (x, y, w, h, c) => g.rect(x + 1, y + 1, w, h, c),
    ellipse: (x, y, rx, ry, c) => g.ellipse(x + 1, y + 1, rx, ry, c),
    line: (x0, y0, x1, y1, c) => g.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, c),
    ctx: g.ctx,
  } : null;
  const sprite = buildFrame(W, H, AX, AY, (p) => draw(p, G));
  const o = { sprite };
  if (g) o.glow = g.canvas;
  if (box) o.box = box;
  if (light) o.light = light;
  return o;
}

// Flammen-Frames (Rampe frei wählbar)
function flameFrames(w, h, count, seed, ramp) {
  const rng = createRng(seed);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const p = new PixelCanvas(w, h);
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const sway = Math.sin(f * 1.6 + y * 0.7) * (1 - t) * 1.2;
      const half = Math.max(0, (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) - rng.range(0, 0.6));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - sway) / Math.max(half, 0.01);
        if (d > 1 || half < 0.4) continue;
        const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.12, 0.12);
        const idx = heat > 1.0 ? 6 : heat > 0.84 ? 5 : heat > 0.66 ? 4 : heat > 0.46 ? 3 : 2;
        p.px(x, y, cl(ramp, idx));
      }
    }
    frames.push(p.canvas);
  }
  return frames;
}

function staticFlame(p, G, cx, by, w, h, ramp, seed) {
  const rng = createRng(seed);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const sway = Math.sin(y * 0.8 + seed) * (1 - t) * 1.1;
    const half = (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62);
    for (let x = -Math.ceil(w / 2); x <= Math.ceil(w / 2); x++) {
      const d = Math.abs(x - sway) / Math.max(half, 0.01);
      if (d > 1 || half < 0.4) continue;
      const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.1, 0.1);
      const idx = heat > 1.0 ? 6 : heat > 0.84 ? 5 : heat > 0.66 ? 4 : heat > 0.46 ? 3 : 2;
      p.px(cx + x, by - h + y, cl(ramp, idx));
      if (G) G.px(cx + x, by - h + y, cl(ramp, idx - 1));
    }
  }
}

// Kleiner Schädel (5×5) frontal, Licht links
function skull(p, x, y, B = BONE, dark = '#0a0806') {
  p.rect(x + 1, y, 3, 1, B[3]); p.rect(x, y + 1, 5, 2, B[2]); p.px(x, y + 1, B[3]); p.px(x + 1, y + 1, B[4]);
  p.rect(x + 1, y + 3, 3, 1, B[2]); p.px(x + 4, y + 1, B[1]); p.px(x + 4, y + 2, B[1]);
  p.px(x + 1, y + 2, dark); p.px(x + 3, y + 2, dark); p.px(x + 2, y + 3, B[1]);
  p.rect(x + 1, y + 4, 3, 1, B[1]); p.px(x + 2, y + 4, dark);
}
// Langknochen zwischen zwei Punkten mit Gelenkköpfen
function longBone(p, x0, y0, x1, y1, B = BONE) {
  p.line(x0, y0, x1, y1, B[2]);
  p.px(x0, y0, B[3]); p.px(x0, y0 + 1, B[2]); p.px(x0 - 1, y0, B[3]);
  p.px(x1, y1, B[2]); p.px(x1 + 1, y1, B[1]); p.px(x1, y1 + 1, B[1]);
}

// ================================================================== HÜGELGRAB
// Grob behauene Schieferplatte mit abgeschlagenen Ecken, Erde in den Fugen.
function roughSlab(p, rng, x, y, w, h, base) {
  const x0 = x + 1, y0 = y + 1, x1 = x + w - 2, y1 = y + h - 2;
  if (x1 - x0 < 2 || y1 - y0 < 2) return;
  const chip = () => rng.int(0, 2);
  const cTL = chip(), cTR = chip(), cBL = chip(), cBR = chip();
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dl = xx - x0, dr = x1 - xx, dt = yy - y0, db = y1 - yy;
    if (dl + dt < cTL || dr + dt < cTR || dl + db < cBL || dr + db < cBR) continue;
    let k = base + dth(xx * 3, yy) * 0.5;
    if (dt === 0 || dl === 0) k += 0.9; else if (db === 0 || dr === 0) k -= 1;
    if (dt === 0 && dl === cTL) k += 0.6;
    p.px(xx, yy, cl(BST, k));
  }
  // Schieferschichtung: feine waagrechte Adern
  for (let yy = y0 + 2; yy < y1 - 1; yy += rng.int(3, 5)) {
    const sx = x0 + rng.int(1, 3), ex = x1 - rng.int(1, 3);
    for (let xx = sx; xx <= ex; xx++) if (rng.chance(0.75)) p.px(xx, yy, cl(BST, base - 1));
    if (rng.chance(0.5)) p.px(sx + rng.int(0, 2), yy - 1, cl(BST, base + 1));
  }
  // Flechten
  if (rng.chance(0.4)) {
    const lx = rng.int(x0 + 1, Math.max(x0 + 1, x1 - 2)), ly = rng.int(y0 + 1, Math.max(y0 + 1, y1 - 2));
    for (let m = 0; m < 5; m++) p.px(lx + rng.int(-1, 2), ly + rng.int(-1, 1), rng.pick(LICH));
  }
}

function earthNoise(p, rng, x, y, w, h, n) {
  for (let k = 0; k < n; k++) {
    const px = x + rng.int(0, w - 1), py = y + rng.int(0, h - 1);
    p.px(px, py, rng.pick([EARTH[1], EARTH[3], EARTH[3], EARTH[4]]));
  }
}

function pebble(p, x, y, big) {
  p.px(x, y, BST[4]); p.px(x + 1, y, BST[3]); p.px(x, y + 1, BST[2]); p.px(x + 1, y + 1, EARTH[0]);
  if (big) { p.px(x - 1, y, BST[3]); p.px(x - 1, y + 1, BST[1]); p.px(x, y - 1, BST[5]); }
}

// Eingeritzte Triskele (Spirale mit drei Armen)
function triskele(p, cx, cy, r, dark, light, G = null, gc = null) {
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    for (let a = 0; a < Math.PI * 1.6; a += 0.16) {
      const rr = r * (1 - a / (Math.PI * 2.2));
      const x = Math.round(cx + Math.cos(a0 + a) * rr * 0.9 + Math.cos(a0) * r * 0.25);
      const y = Math.round(cy + Math.sin(a0 + a) * rr * 0.75 + Math.sin(a0) * r * 0.2);
      p.px(x, y, dark); if (light) p.px(x + 1, y + 1, light);
      if (G) G.px(x, y, gc);
    }
  }
}

function barrowFloor(count = 10, seed = 211) {
  const rng = createRng(seed);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const p = new PixelCanvas(32, 32);
    p.rect(0, 0, 32, 32, EARTH[2]);
    earthNoise(p, rng, 0, 0, 32, 32, 160);
    for (let k = 0; k < 40; k++) p.px(rng.int(0, 31), rng.int(0, 31), EARTH[1]);
    const rects = [];
    splitRects(rng, 0, 0, 32, 32, rects, 9);
    let special = n === 3 ? 'rune' : n === 6 ? 'grave' : null;
    for (const [x, y, w, h] of rects) {
      if (special && w >= 12 && h >= 10) {
        const base = 3;
        roughSlab(p, rng, x, y, w, h, base);
        const cx = x + (w >> 1), cy = y + (h >> 1);
        if (special === 'rune') triskele(p, cx, cy, Math.min(w, h) / 2 - 2, BST[0], BST[5]);
        else {
          // Grabplatte mit eingeritztem Schwert
          for (let yy = y + 3; yy < y + h - 3; yy++) { p.px(cx, yy, BST[0]); p.px(cx + 1, yy, BST[5]); }
          p.rect(cx - 2, y + 5, 5, 1, BST[0]); p.rect(cx - 2, y + 6, 5, 1, BST[5]);
          p.px(cx, y + 3, BST[0]); p.px(cx - 1, y + 3, BST[0]); p.px(cx + 1, y + 3, BST[0]);
        }
        special = null;
        continue;
      }
      if (rng.chance(0.6)) roughSlab(p, rng, x, y, w, h, rng.pick([2, 2, 3, 3]));
      else {
        // Offene Erde: Kiesel, Trittspuren, dunkle Feuchte
        for (let k = 0; k < rng.int(1, 3); k++) pebble(p, x + rng.int(2, Math.max(2, w - 3)), y + rng.int(2, Math.max(2, h - 3)), rng.chance(0.4));
        if (rng.chance(0.5)) { const cx = x + (w >> 1), cy = y + (h >> 1); for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) if (rng.chance(0.6)) p.px(cx + i, cy + j, EARTH[1]); }
      }
    }
    // Wurzeln kriechen über den Boden (bleiben innerhalb der Makrokachel)
    if (rng.chance(0.35)) {
      const sx = rng.int(4, 27), sy = rng.int(3, 10);
      const pts = wander(rng, sx, sy, rng.range(-0.6, 0.6), 1, rng.int(5, 9), 0.5).map(([x, y]) => [Math.max(2, Math.min(29, x)), Math.max(2, Math.min(29, y))]);
      strand(p, pts, 2.6, 1, ROOT, { shadow: EARTH[0] });
      const [bx, by] = pts[Math.min(pts.length - 1, 3)];
      strand(p, wander(rng, bx, by, 1, 0.4, 3, 0.4).map(([x, y]) => [Math.max(1, Math.min(30, x)), Math.max(1, Math.min(30, y))]), 1.2, 1, ROOT, { shadow: EARTH[0] });
    }
    // Knochensplitter, Scherben, Grabbeigaben
    if (rng.chance(0.45)) {
      const x = rng.int(3, 26), y = rng.int(3, 27);
      longBone(p, x, y, x + rng.int(3, 5), y + rng.int(-1, 1));
    }
    if (rng.chance(0.25)) { const x = rng.int(2, 28), y = rng.int(2, 28); p.px(x, y, CLAY[4]); p.px(x + 1, y, CLAY[2]); p.px(x, y + 1, CLAY[1]); }
    if (n === 8) { const x = rng.int(6, 24), y = rng.int(6, 24); p.px(x, y, GOLD[5]); p.px(x + 1, y, GOLD[3]); p.px(x + 3, y + 1, GOLD[4]); p.px(x + 3, y + 2, GOLD[2]); }
    tiles.push(p.canvas);
  }
  return tiles;
}

// Trockenmauer: flache Schieferplatten in Lagen, Erde in den Fugen.
function dryCourse(p, rng, y0, rh, dark = 0) {
  let x = -rng.int(0, 7);
  while (x < T) {
    const bw = rng.int(4, 10);
    const k = rng.pick([2, 3, 3, 4]) - dark;
    const h = rh - 1;
    p.rect(x, y0, bw - 1, h, BST[k]);
    p.rect(x, y0, bw - 1, 1, BST[k + 1]);
    if (h > 2) p.rect(x, y0 + h - 1, bw - 1, 1, BST[k - 1]);
    p.px(x, y0, BST[Math.min(6, k + 2)]);
    p.px(x + bw - 2, y0 + h - 1, BST[Math.max(0, k - 2)]);
    if (rng.chance(0.25)) p.px(x + rng.int(1, Math.max(1, bw - 3)), y0 + rng.int(0, Math.max(0, h - 1)), rng.pick(LICH));
    x += bw;
  }
}

function barrowFaces(count = 8, seed = 231) {
  const rng = createRng(seed);
  const makeUpper = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, EARTH[1]);
    // Erdreich der Hügeldecke
    p.rect(0, 0, T, 4, EARTH[3]);
    earthNoise(p, rng, 0, 0, T, 4, 14);
    p.rect(0, 0, T, 1, EARTH[5]);
    for (let x = 0; x < T; x++) if (rng.chance(0.3)) p.px(x, 1, EARTH[4]);
    // Deckstein (Sturz) mit grober Unterkante
    let x = -rng.int(0, 10);
    while (x < T) {
      const bw = rng.int(11, 17), k = rng.pick([3, 3, 4]);
      p.rect(x, 4, bw - 1, 5, BST[k]);
      p.rect(x, 4, bw - 1, 1, BST[k + 2]); p.rect(x, 5, bw - 1, 1, BST[k + 1]);
      p.rect(x, 8, bw - 1, 1, BST[k - 2]);
      for (let i = 0; i < bw - 1; i += 3) if (rng.chance(0.5)) p.px(x + i, 8, EARTH[1]);
      p.px(x + rng.int(2, bw - 3), 6, BST[k - 1]); p.px(x + rng.int(2, bw - 3), 7, BST[k - 1]);
      x += bw;
    }
    p.rect(0, 9, T, 1, EARTH[0]);
    // Zwei Lagen Trockenmauer
    dryCourse(p, rng, 10, 3); dryCourse(p, rng, 13, 3);
    // Wurzeln brechen durch die Fugen
    const roots = v % 3 === 0 ? 2 : v % 3 === 1 ? 1 : 0;
    for (let r = 0; r < roots; r++) {
      const rx = rng.int(2, 13), len = rng.int(7, 15);
      const pts = [[rx, 0]];
      for (let y = 3; y < len; y += 3) pts.push([rx + Math.round(Math.sin(y * 0.6 + r) * 1.2), y]);
      strand(p, pts, r ? 1.4 : 2.4, 1, ROOT, { shadow: EARTH[0] });
      if (len > 9) { p.px(pts[pts.length - 1][0] + 1, len, ROOT[2]); p.px(pts[pts.length - 1][0] + 1, len + 1, ROOT[1]); }
    }
    // Feine Haarwurzeln aus der Fuge unter dem Sturz
    for (let k = 0; k < rng.int(1, 4); k++) { const hx = rng.int(0, 15), hl = rng.int(1, 3); for (let y = 9; y < 9 + hl; y++) p.px(hx, y, ROOT[3 - (y - 9)]); }
    // Geisterglyphe im Sturz (selten)
    if (v === 5) { p.px(6, 5, GHOST[2]); p.px(7, 6, GHOST[3]); p.px(8, 5, GHOST[2]); p.px(7, 7, GHOST[2]); p.px(9, 7, GHOST[1]); p.px(5, 7, GHOST[1]); }
    // Kälte-Umgebungsverdeckung oben
    p.ctx.fillStyle = 'rgba(2,4,6,0.3)'; p.ctx.fillRect(0, 9, T, 3);
    return p.canvas;
  };
  const makeLower = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, EARTH[1]);
    if (v % 4 === 2) {
      // Knochenlage (Ossuarium): gestapelte Oberschenkel mit Schädeln
      dryCourse(p, rng, 0, 3);
      p.rect(0, 3, T, 7, '#070605');
      for (let y = 4; y < 10; y += 2) {
        for (let x = -2; x < T; x += 7) {
          const o = (y >> 1) & 1 ? 3 : 0;
          p.rect(x + o, y, 6, 1, BONE[y < 6 ? 2 : 1]); p.px(x + o, y, BONE[3]); p.px(x + o + 5, y, BONE[2]); p.px(x + o, y + 1, BONE[1]);
        }
      }
      const sx = v % 8 === 2 ? 4 : 9;
      p.rect(sx - 1, 4, 7, 6, '#070605');
      skull(p, sx, 5);
      dryCourse(p, rng, 10, 3); dryCourse(p, rng, 13, 3, 1);
    } else if (v % 4 === 3) {
      // Grabnische mit Urne
      dryCourse(p, rng, 0, 3); dryCourse(p, rng, 12, 4, 1);
      dryCourse(p, rng, 3, 9);
      const nx = rng.int(3, 7);
      p.rect(nx, 4, 8, 7, '#060504'); p.rect(nx, 4, 8, 1, BST[5]); p.rect(nx - 1, 4, 1, 8, BST[3]); p.rect(nx + 8, 4, 1, 8, BST[1]);
      p.rect(nx - 1, 11, 10, 1, BST[4]);
      p.rect(nx + 2, 7, 4, 4, CLAY[3]); p.rect(nx + 2, 7, 1, 4, CLAY[5]); p.px(nx + 5, 8, CLAY[1]); p.rect(nx + 3, 6, 2, 1, CLAY[4]); p.px(nx + 3, 9, CLAY[2]);
      p.px(nx + 1, 10, BONE[2]); p.px(nx + 6, 10, BONE[1]);
    } else {
      dryCourse(p, rng, 0, 3); dryCourse(p, rng, 3, 4); dryCourse(p, rng, 7, 3); dryCourse(p, rng, 10, 3, 1); dryCourse(p, rng, 13, 3, 1);
      // Ein großer Findling in der Mauer
      if (v % 2 === 0) {
        const bx = rng.int(2, 9);
        blob(p, bx + 3, 8, 4.4, 3.2, BST, 3, 2);
        p.px(bx + 1, 6, BST[6]);
      }
      if (v === 1 || v === 5) { const wx = rng.int(2, 13); strand(p, [[wx, 0], [wx + 1, 4], [wx, 8], [wx + 1, 12]], 1.6, 1, ROOT, { shadow: EARTH[0] }); }
    }
    // Rinnsal (Sickerwasser) glänzt
    if (v === 6) for (let y = 2; y < T; y++) { p.px(9, y, 'rgba(8,16,20,0.6)'); if (y % 4 === 1) p.px(9, y, GWAT[6]); }
    // Erde sammelt sich am Fuß, Umgebungsverdeckung
    for (let x = 0; x < T; x++) { if (rng.chance(0.6)) p.px(x, 15, EARTH[3]); if (rng.chance(0.25)) p.px(x, 14, EARTH[2]); }
    p.ctx.fillStyle = 'rgba(3,3,6,0.28)'; p.ctx.fillRect(0, 8, T, 8);
    p.ctx.fillStyle = 'rgba(3,3,6,0.35)'; p.ctx.fillRect(0, 12, T, 4);
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(makeUpper(i)); lower.push(makeLower(i)); }
  return { upper, lower };
}

function barrowTop(seed = 241) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#100d0b');
  for (let i = 0; i < 34; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#161210', '#0b0908', '#1a1512', '#131110', '#15171a']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#080605');
  }
  p.px(4, 9, ROOT[2]); p.px(5, 9, ROOT[1]); p.px(11, 3, '#1c1e22');
  return p.canvas;
}

// Dunkles, fast stehendes Grabwasser: träge Schlieren, kalte Lichtpunkte.
function barrowLiquid(seed = 251) {
  const rng = createRng(seed);
  const glints = [];
  for (let i = 0; i < 2; i++) glints.push([rng.int(0, 15), rng.int(0, 15), rng.int(0, 3)]);
  const frames = [], glow = [];
  const TAU = Math.PI * 2;
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T);
    const ph = (f / 4) * TAU;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = Math.sin((x / 16) * TAU + (y / 16) * TAU + ph) * 0.45
        + Math.sin((x / 16) * TAU * 2 - (y / 16) * TAU + ph) * 0.3
        + Math.sin((y / 16) * TAU * 2 + ph * 2) * 0.15;
      const v = n + dth(x, y) * 0.4;
      p.px(x, y, v > 0.6 ? GWAT[3] : v > 0.0 ? GWAT[2] : v > -0.55 ? GWAT[1] : GWAT[0]);
    }
    // Träge Spiegelschlieren
    for (let r = 0; r < 3; r++) {
      const y = (r * 5 + 2) & 15, x0 = (r * 6 + f + (r & 1) * 4) & 15, len = 4 + (r & 1);
      for (let i = 0; i < len; i++) p.px((x0 + i) & 15, y, i === 1 || i === 2 ? GWAT[5] : GWAT[4]);
    }
    // Staubfilm (treibende Asche/Pollen)
    for (let k = 0; k < 3; k++) p.px((k * 5 + f) & 15, (k * 7 + 3) & 15, '#1c1f1c');
    for (const [gx, gy, t] of glints) {
      const on = (f + t) % 4;
      if (on === 0) { p.px(gx, gy, GHOST[3]); g.px(gx, gy, GHOST[2]); }
      else if (on === 1) { p.px(gx, gy, GWAT[6]); g.px(gx, gy, GHOST[1]); }
    }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  // Uferkante: Erdlippe, Schieferplatte, Wurzeln tauchen ein
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 2, EARTH[4]); e.rect(0, 0, T, 1, EARTH[5]);
  for (let x = 0; x < T; x += 3) e.px(x, 1, EARTH[3]);
  e.rect(0, 2, T, 3, BST[3]);
  e.rect(0, 2, T, 1, BST[5]);
  for (let x = 0; x < T; x += 7) { e.rect(x, 2, 1, 3, EARTH[0]); e.px(x + 1, 2, BST[6]); }
  e.rect(0, 5, T, 1, BST[1]);
  // Wurzelfäden hängen ins Wasser
  for (const [x, l] of [[3, 5], [4, 3], [12, 6]]) for (let y = 2; y < 2 + l; y++) e.px(x + (y > 4 ? 1 : 0), y, y === 1 + l ? ROOT[4] : ROOT[2]);
  for (let x = 0; x < T; x++) e.px(x, 6, x % 5 === 2 ? GWAT[6] : x % 3 === 0 ? GWAT[4] : GWAT[5]);
  e.ctx.fillStyle = 'rgba(0,2,3,0.65)'; e.ctx.fillRect(0, 7, T, 2);
  e.ctx.fillStyle = 'rgba(0,2,3,0.35)'; e.ctx.fillRect(0, 9, T, 2);
  e.ctx.fillStyle = 'rgba(0,2,3,0.15)'; e.ctx.fillRect(0, 11, T, 2);
  return { frames, glow, edge: e.canvas, edgeH: 7 };
}

// ------------------------------------------------------------ Hügelgrab-Props
// Menhir mit Geisterglyphen (v0) oder geneigt und gesprungen (v1)
function barrowStandingStone(v) {
  const W = 18, H = 38, AX = 9, AY = 37;
  return prop(W, H, AX, AY, (p, G) => {
    const rng = createRng(810 + v);
    // Erdhügel am Fuß
    p.ellipse(9, 35.5, 8, 2.2, EARTH[3]); p.ellipse(8, 35, 6, 1.4, EARTH[4]); p.px(3, 35, EARTH[5]);
    const lean = v ? 0.16 : 0;
    const prof = [];
    let jit = 0;
    for (let y = 1; y <= 35; y++) {
      jit += rng.range(-0.35, 0.35); jit = Math.max(-0.7, Math.min(0.7, jit));
      const top = y < 6 ? Math.sqrt(Math.max(0, 1 - ((6 - y) / 5.4) ** 2)) : 1;
      const hw = (5.2 + (y > 30 ? (y - 30) * 0.25 : 0) - (y < 18 ? (18 - y) * 0.05 : 0)) * top + jit * 0.5;
      prof.push([y, 9 + (35 - y) * lean - 0.5 + jit * 0.3, hw]);
    }
    for (const [y, cx, hw] of prof) {
      if (hw < 0.6) continue;
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw) - 1;
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0 + 0.5) / (x1 - x0 + 1);
        let k = u < 0.14 ? 4 : u < 0.4 ? 5 : u < 0.7 ? 4 : u < 0.88 ? 3 : 2;
        if (y < 4) k += 1;
        k += dth(x, y) * 0.6;
        if (y % 6 === 0 && u > 0.1 && u < 0.9) k -= 1; // Schichtfugen
        p.px(x, y, cl(BST, k));
      }
      p.px(x0, y, BST[3]);
    }
    const cxAt = (y) => prof[Math.max(0, Math.min(prof.length - 1, y - 1))][1];
    // Flechten (grau-grün, ockergelb)
    for (const [x, y] of [[-3, 9], [-2, 10], [-3, 11], [2, 20], [3, 21], [-4, 27], [-3, 28], [1, 31]]) p.px(Math.round(cxAt(y) + x), y, y > 25 ? LICH[1] : LICH[2]);
    p.px(Math.round(cxAt(15) + 3), 15, '#6a5a2c'); p.px(Math.round(cxAt(16) + 3), 16, '#4e4424');
    if (v === 0) {
      // Eingeritzte Spirale und Zickzack, von Geisterlicht erfüllt
      triskele(p, Math.round(cxAt(13)), 13, 3.6, GHOST[3], null, G, GHOST[3]);
      // Ogham-Stammlinie mit Kerben
      for (let y = 20; y <= 31; y++) { const x = Math.round(cxAt(y)); p.px(x, y, GHOST[3]); G.px(x, y, GHOST[4]); }
      for (const [y, side, len] of [[21, -1, 2], [23, -1, 3], [25, 1, 2], [27, 1, 3], [29, -1, 2], [30, 1, 2]]) {
        for (let i = 1; i <= len; i++) { const x = Math.round(cxAt(y)) + side * i; p.px(x, y, GHOST[2]); G.px(x, y, GHOST[3]); }
      }
      p.px(Math.round(cxAt(13)), 13, GHOST[5]); G.px(Math.round(cxAt(13)), 13, GHOST[6]);
    } else {
      // Diagonaler Sprung, abgeplatzte Ecke, Opferknochen am Fuß
      let x = Math.round(cxAt(8)) + 2;
      for (let y = 8; y < 24; y++) { p.px(x, y, BST[0]); p.px(x - 1, y, BST[5]); if (y % 3 === 0) x -= 1; }
      p.px(Math.round(cxAt(3)) + 3, 3, BST[0]); p.px(Math.round(cxAt(4)) + 3, 4, BST[1]);
      longBone(p, 2, 34, 6, 33); skull(p, 12, 30);
      // Moos an der Wetterseite
      for (let y = 26; y < 34; y++) p.px(Math.round(cxAt(y) - 4), y, y & 1 ? LICH[1] : '#2e3a26');
    }
    // Kiesel und Erde vorne
    p.px(4, 36, BST[4]); p.px(5, 36, BST[2]); p.px(14, 36, BST[3]); p.px(15, 36, BST[1]);
  }, { glow: v === 0, box: [-5, -4, 5, 1], light: v === 0 ? { dx: 0, dy: -20, radius: 40, color: [80, 220, 200], intensity: 0.45 } : undefined });
}

// Stützpfeiler: Steinsäule (v0) bzw. uralter Eichenpfosten (v1), von Wurzeln umschlungen
function barrowRootPillar(v) {
  const W = 22, H = 48, AX = 11, AY = 46;
  return prop(W, H, AX, AY, (p) => {
    const rng = createRng(830 + v);
    // Fuß: Erde und Steine
    p.ellipse(11, 45, 10, 2.2, EARTH[3]); p.ellipse(10, 44.5, 7, 1.4, EARTH[4]);
    if (v === 0) {
      // Gestapelte, grobe Steintrommeln
      let y = 43;
      while (y > 6) {
        const h = rng.int(4, 7), hw = rng.range(5.4, 6.6), ox = rng.range(-0.8, 0.8);
        for (let yy = y - h + 1; yy <= y; yy++) {
          const x0 = Math.round(11 + ox - hw), x1 = Math.round(11 + ox + hw) - 1;
          for (let x = x0; x <= x1; x++) {
            const u = (x - x0 + 0.5) / (x1 - x0 + 1);
            let k = u < 0.14 ? 3 : u < 0.4 ? 5 : u < 0.68 ? 4 : u < 0.88 ? 3 : 2;
            if (yy === y - h + 1) k += 1; if (yy === y) k -= 1.5;
            p.px(x, yy, cl(BST, k + dth(x, yy) * 0.5));
          }
        }
        p.rect(Math.round(11 + ox - hw) + 1, y, Math.round(hw * 2) - 2, 1, EARTH[1]);
        y -= h;
      }
      // Deckplatte (trägt die Decke)
      p.rect(2, 3, 18, 4, BST[3]); p.rect(2, 3, 18, 1, BST[5]); p.rect(2, 6, 18, 1, BST[1]); p.px(2, 3, BST[6]); p.rect(18, 4, 2, 2, BST[2]);
    } else {
      // Eichenpfosten, rissig, mit Querbalkenstumpf
      for (let x = 0; x < 10; x++) p.rect(6 + x, 6, 1, 38, cylCol(WOOD, x, 10, 3));
      for (let k = 0; k < 9; k++) { const gx = 7 + rng.int(0, 8), gy = 8 + rng.int(0, 30), gl = rng.int(3, 7); for (let y = gy; y < Math.min(43, gy + gl); y++) p.px(gx, y, WOOD[1]); }
      p.rect(1, 2, 20, 5, WOOD[3]); p.rect(1, 2, 20, 1, WOOD[5]); p.rect(1, 6, 20, 1, WOOD[0]); p.px(1, 2, WOOD[5]);
      for (const x of [3, 18]) { p.rect(x, 3, 1, 3, WOOD[1]); }
      p.rect(6, 20, 10, 2, RUST[1]); p.rect(6, 20, 10, 1, RUST[2]); p.px(7, 20, RUST[3]); p.px(12, 21, RUST[0]);
    }
    // Wurzeln: von oben über die Deckplatte, um den Schaft, in den Boden
    strand(p, [[4, 0], [3, 4], [4, 9], [6, 14], [7, 20], [5, 27], [5, 34], [3, 40], [1, 44]], 4, 2.2, ROOT, { tip: true });
    strand(p, [[16, 0], [17, 5], [15, 10], [14, 16], [15, 23], [17, 30], [16, 36], [19, 43]], 3.4, 2, ROOT);
    strand(p, [[10, 0], [11, 3], [10, 7], [11, 11]], 2, 1, ROOT);
    strand(p, [[7, 20], [10, 22], [13, 24], [15, 23]], 1.6, 1.2, ROOT);
    // Haarwurzeln und hängende Erde
    for (const [x, y, l] of [[12, 11, 3], [2, 8, 4], [19, 8, 3], [8, 14, 2]]) for (let i = 0; i < l; i++) p.px(x, y + i, i === l - 1 ? ROOT[4] : ROOT[2]);
    for (const [x, y] of [[5, 2], [15, 1], [9, 1], [17, 2]]) { p.px(x, y, EARTH[4]); p.px(x + 1, y, EARTH[3]); }
    p.px(2, 44, BST[4]); p.px(19, 45, BST[3]); p.px(20, 45, BST[1]);
  }, { box: [-7, -5, 7, 1] });
}

// Grab-/Aschenurne: stehend mit Deckel (v0), umgestürzt mit Asche und Knochen (v1)
function barrowUrn(v) {
  const W = v ? 20 : 14, H = v ? 12 : 19, AX = W >> 1, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    if (v === 0) {
      const cx = 7;
      const prof = [2, 3, 3.5, 3, 3.6, 4.6, 5.4, 6, 6.2, 6.2, 6, 5.6, 5.2, 4.6, 4, 3.4, 3, 3.2];
      for (let y = 0; y < prof.length; y++) {
        const hw = prof[y], x0 = Math.round(cx - hw), x1 = Math.round(cx + hw) - 1;
        for (let x = x0; x <= x1; x++) p.px(x, y + 1, cylCol(CLAY, x - x0, x1 - x0 + 1, y < 3 ? 4 : 3));
      }
      // Deckelknauf
      p.rect(6, 0, 2, 1, CLAY[5]); p.px(5, 1, CLAY[4]);
      p.rect(3, 3, 8, 1, CLAY[1]);
      // Eingeritztes Zickzackband und Schnurmuster
      for (let x = 2; x < 12; x++) { p.px(x, 8 + ((x & 1) ? 0 : 1), CLAY[1]); if (!(x & 1)) p.px(x, 10, CLAY[5]); }
      for (let x = 2; x < 12; x += 2) p.px(x, 12, CLAY[2]);
      // Bronzering um den Hals mit Patina
      for (let x = 0; x < 8; x++) p.px(3 + x, 5, cylCol(BRZ, x, 8, 4));
      p.px(4, 6, BRZ[3]);
      // Sprung und Erdreste
      p.px(9, 13, CLAY[0]); p.px(10, 14, CLAY[0]); p.px(10, 15, CLAY[1]);
      p.rect(2, 18, 10, 1, EARTH[3]); p.px(1, 18, EARTH[4]); p.px(12, 18, EARTH[2]);
    } else {
      // Liegende Urne: Mündung links, Asche und Knochen quellen heraus
      p.ellipse(11, 10.4, 9, 1.4, EARTH[3]);
      for (let y = 1; y <= 10; y++) for (let x = 6; x <= 18; x++) {
        const nx = (x + 0.5 - 12.5) / 6.4, ny = (y + 0.5 - 5.8) / 4.8, d = nx * nx + ny * ny;
        if (d > 1) continue;
        let k = 3.6 - ny * 1.8 - (d > 0.7 && ny > 0 ? 1 : 0) + dth(x, y) * 0.7;
        p.px(x, y, cl(CLAY, k));
      }
      // Hals und Mündung
      p.rect(4, 3, 3, 6, CLAY[3]); p.rect(4, 3, 3, 1, CLAY[5]); p.rect(4, 8, 3, 1, CLAY[1]);
      p.ellipse(4, 5.8, 1.4, 3, CLAY[4]); p.ellipse(4, 5.8, 0.6, 2.2, '#0a0706');
      // Zickzackband und Sprung
      for (let y = 2; y < 10; y++) p.px(11 + ((y & 1) ? 1 : 0), y, CLAY[1]);
      p.px(15, 2, CLAY[0]); p.px(16, 3, CLAY[0]); p.px(16, 4, CLAY[1]);
      p.px(9, 2, CLAY[6]); p.px(10, 2, CLAY[5]);
      // Aschekegel vor der Mündung mit Knochen
      p.ellipse(2.5, 9.6, 2.6, 1.4, '#3a3632'); p.px(1, 9, '#5a544c'); p.px(3, 8, '#6a645a');
      longBone(p, 0, 10, 3, 11); p.px(5, 10, BONE[3]);
      p.rect(17, 10, 2, 1, CLAY[4]); p.px(19, 10, CLAY[2]);
    }
  }, { box: v ? undefined : [-4, -3, 4, 1] });
}

// Knochenhaufen: Schädel und Langknochen (v0), mit Brustkorb und Spangenhelm (v1)
function barrowBonePile(v) {
  const W = 22, H = 15, AX = 11, AY = 14;
  return prop(W, H, AX, AY, (p) => {
    const rng = createRng(850 + v);
    // Haufen-Körper: dunkle Knochenmasse als Grund, damit er als Haufen liest
    p.ellipse(11, 12.6, 10, 2, EARTH[3]);
    p.ellipse(11, 11, 8.4, 3.2, BONE[0]);
    p.ellipse(10, 10.4, 6.4, 2.4, '#5a5242');
    // Hintere Knochen dunkler, vordere heller
    const back = ['#3e372c', '#5e5646', '#7a705a', '#9a8e72'];
    for (let i = 0; i < 5; i++) { const x = rng.int(3, 12), y = rng.int(7, 10); longBone(p, x, y, x + rng.int(4, 6), y + rng.int(-2, 1), back); }
    for (let i = 0; i < 4; i++) { const x = rng.int(2, 13), y = rng.int(10, 13); longBone(p, x, y, x + rng.int(4, 6), y + rng.int(-1, 1)); }
    if (v === 0) {
      skull(p, 7, 4); skull(p, 13, 7, back);
      p.px(18, 12, BONE[3]); p.px(19, 12, BONE[2]);
    } else {
      // Brustkorb: Wirbelsäule mit Rippenbögen
      for (let x = 4; x < 13; x++) p.px(x, 7, x % 2 ? BONE[2] : BONE[3]);
      for (let r = 0; r < 4; r++) {
        const x = 5 + r * 2;
        p.px(x, 8, BONE[3]); p.px(x, 9, BONE[2]); p.px(x + 1, 10, BONE[2]); p.px(x + 1, 11, BONE[1]);
      }
      // Eiserner Spangenhelm mit Nasal und Bronzespangen
      p.ellipse(16.5, 7.6, 3.6, 3.2, IRN[3]); p.ellipse(15.6, 6.6, 2, 1.6, IRN[4]); p.px(15, 5, IRN[5]);
      p.rect(13, 9, 8, 1, BRZ[3]); p.px(13, 9, BRZ[5]); p.rect(16, 4, 1, 6, BRZ[4]); p.px(16, 4, BRZ[5]);
      p.rect(16, 10, 1, 2, IRN[2]); p.px(18, 7, RUST[2]); p.px(19, 8, RUST[1]); p.px(14, 8, RUST[2]);
      skull(p, 1, 8);
    }
  });
}

// Geisterbecken: Steinsäule mit Schädelrelief, Schale mit blaugrüner Flamme
function barrowGhostBrazier() {
  const W = 20, H = 34, AX = 10, AY = 33;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Sockel und Säule
    p.rect(3, 29, 14, 4, BST[2]); p.rect(3, 29, 14, 1, BST[5]); p.rect(3, 30, 1, 3, BST[4]); p.rect(16, 30, 1, 3, BST[1]);
    for (let x = 0; x < 8; x++) p.rect(6 + x, 16, 1, 13, cylCol(BST, x, 8, 4));
    for (const y of [19, 25]) { p.rect(6, y, 8, 1, BST[1]); p.rect(6, y + 1, 8, 1, BST[5]); }
    skull(p, 8, 21, BONE); p.px(9, 23, GHOST[3]); p.px(11, 23, GHOST[3]); G.px(9, 23, GHOST[4]); G.px(11, 23, GHOST[4]);
    // Schale aus grobem Stein
    for (let y = 0; y < 6; y++) {
      const hw = 8.5 - y * 0.9, x0 = Math.round(10 - hw), x1 = Math.round(10 + hw) - 1;
      for (let x = x0; x <= x1; x++) p.px(x, 10 + y, cylCol(BST, x - x0, x1 - x0 + 1, y < 2 ? 4 : 3));
    }
    p.rect(1, 10, 18, 1, BST[5]); p.px(2, 10, BST[6]);
    for (let x = 3; x < 17; x += 4) p.px(x, 12, BST[1]);
    // Knochenasche mit kaltem Glimmen
    p.rect(3, 8, 14, 2, '#2c3634');
    for (let x = 3; x < 17; x++) if ((x * 5) % 3) p.px(x, 8 + (x & 1), x % 4 ? GHOST[2] : GHOST[4]);
    G.rect(3, 8, 14, 2, GHOST[1]); for (let x = 4; x < 17; x += 4) G.px(x, 8 + (x & 1), GHOST[3]);
    staticFlame(p, G, 10, 9, 9, 9, GHOST, 7);
    // Widerschein auf dem Rand
    p.px(5, 11, GHOST[3]); p.px(14, 11, GHOST[2]); G.px(5, 11, GHOST[2]);
    // Wurzel kriecht am Sockel hoch
    strand(p, [[16, 32], [15, 28], [14, 24]], 1.6, 1, ROOT);
  }, { glow: true, box: [-5, -3, 5, 1], light: { dx: 0, dy: -20, radius: 82, color: [90, 230, 205], intensity: 1.0 } });
  o.flames = flameFrames(9, 11, 6, 29, GHOST);
  o.flameAt = { dx: -4, dy: -33 };
  return o;
}

// Thron des Hügelkönigs: Schieferblöcke, Geweihe, Wolfsfell, Geisterrune
function barrowThrone() {
  const W = 42, H = 46, AX = 21, AY = 44;
  return prop(W, H, AX, AY, (p, G) => {
    const rng = createRng(870);
    const slab = (x, y, w, h, base, roundTop = 0) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const dy = yy - y;
        if (roundTop && dy < roundTop) {
          const dx = Math.min(xx - x, x + w - 1 - xx);
          if (dx + dy < roundTop - 1) continue;
        }
        const u = (xx - x + 0.5) / w;
        let k = base + (u < 0.12 ? 1 : u > 0.86 ? -1.2 : 0) + dth(xx, yy) * 0.6;
        if (yy === y || (roundTop && dy < roundTop && Math.min(xx - x, x + w - 1 - xx) + dy === roundTop - 1)) k += 1.6;
        if (yy === y + h - 1) k -= 1;
        p.px(xx, yy, cl(BST, k));
      }
      for (let yy = y + 3; yy < y + h - 2; yy += rng.int(4, 6)) for (let xx = x + 2; xx < x + w - 2; xx++) if (rng.chance(0.6)) p.px(xx, yy, cl(BST, base - 1));
    };
    // Podest: zwei Stufen
    slab(0, 37, 42, 8, 2); p.rect(0, 37, 42, 1, BST[5]); p.rect(1, 44, 40, 1, BST[0]);
    slab(4, 32, 34, 5, 3); p.rect(4, 32, 34, 1, BST[6]);
    // Seitensteine
    slab(2, 8, 7, 25, 3, 3); slab(33, 8, 7, 25, 3, 3);
    // Rückenlehne
    slab(10, 2, 22, 24, 3, 5);
    // Geisterrune: Ring mit Triskele
    const cx = 21, cy = 12;
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const x = Math.round(cx + Math.cos(a) * 6.5), y = Math.round(cy + Math.sin(a) * 6);
      p.px(x, y, GHOST[2]); G.px(x, y, GHOST[3]);
    }
    triskele(p, cx, cy, 4, GHOST[3], null, G, GHOST[4]);
    p.px(cx, cy, GHOST[5]); G.px(cx, cy, GHOST[6]); G.px(cx + 1, cy, GHOST[4]);
    // Sitz
    p.rect(10, 25, 22, 7, BST[2]); p.rect(10, 25, 22, 2, BST[4]); p.rect(10, 25, 22, 1, BST[5]); p.rect(31, 26, 1, 6, BST[1]);
    // Wolfsfell über dem Sitz: weiche Zotteln, ausgefranster Saum, Pranke hängt herab
    for (let x = 12; x < 30; x++) {
      const len = 6 + Math.round(Math.sin(x * 0.9) * 1.1 + ((x * 7) % 5 === 0 ? 1.5 : 0));
      const side = x < 15 ? 1 : x > 26 ? -1 : 0;
      for (let y = 25; y < 25 + len; y++) {
        const u = (y - 25) / len;
        let k = 3 + side - (u > 0.7 ? 1 : 0) + (u < 0.2 ? 1 : 0);
        if ((x * 3 + (y >> 1)) % 5 === 0) k -= 1;        // Strähnen
        if ((x * 3 + (y >> 1)) % 7 === 1 && u < 0.6) k += 1;
        p.px(x, y, cl(FUR, k));
      }
      p.px(x, 25 + len, FUR[0]);
    }
    p.rect(12, 25, 18, 1, FUR[5]);
    for (const x of [13, 16, 20, 24, 27]) p.px(x, 26, FUR[5]);
    p.rect(27, 30, 3, 4, FUR[3]); p.px(27, 33, BONE[3]); p.px(28, 34, BONE[3]); p.px(29, 33, BONE[2]);
    // Hirschgeweihe auf den Seitensteinen: Hauptstange schwingt nach außen, drei Enden
    const antler = (bx, dir) => {
      const beam = [[bx, 8], [bx + dir, 6], [bx + dir * 2, 3], [bx + dir * 3, 1], [bx + dir * 4, 0]];
      for (let i = 1; i < beam.length; i++) { p.line(beam[i - 1][0], beam[i - 1][1], beam[i][0], beam[i][1], BONE[3]); p.line(beam[i - 1][0] + 1, beam[i - 1][1], beam[i][0] + 1, beam[i][1], BONE[2]); }
      p.line(bx + dir, 5, bx, 3, BONE[3]); p.px(bx, 2, BONE[4]);
      p.line(bx + dir * 2, 3, bx + dir * 2, 0, BONE[3]); p.px(bx + dir * 2, 0, BONE[4]);
      p.px(bx + dir * 4, 0, BONE[4]);
    };
    antler(4, -1); antler(6, 1); antler(35, -1); antler(37, 1);
    // Schädel auf den Seitensteinen (Hirschschädel frontal)
    for (const x of [3, 34]) { p.rect(x, 7, 5, 3, BONE[2]); p.rect(x + 1, 10, 3, 2, BONE[2]); p.px(x, 7, BONE[4]); p.px(x + 1, 8, '#0a0806'); p.px(x + 3, 8, '#0a0806'); p.px(x + 2, 11, BONE[1]); p.px(x + 4, 9, BONE[1]); }
    // Wurzeln hängen über die Lehne
    strand(p, [[13, 2], [12, 6], [13, 10], [12, 14]], 2, 1, ROOT);
    strand(p, [[29, 2], [30, 5], [29, 9]], 1.6, 1, ROOT);
    // Grabbeigaben: Goldreif auf der Stufe, Kerzen mit Geisterflamme, Schädel
    p.ellipse(9, 34, 2.4, 1, GOLD[4]); p.px(8, 33, GOLD[6]); p.px(10, 35, GOLD[2]); p.px(9, 34, '#0a0806');
    for (const x of [5, 36]) {
      p.rect(x, 33, 2, 4, BONE[3]); p.px(x + 1, 33, BONE[2]); p.px(x, 36, BONE[1]);
      p.px(x, 32, GHOST[4]); p.px(x, 31, GHOST[5]); p.px(x + 1, 32, GHOST[3]);
      G.px(x, 32, GHOST[4]); G.px(x, 31, GHOST[5]); G.px(x + 1, 32, GHOST[3]); G.px(x, 30, GHOST[2]);
    }
    skull(p, 30, 38);
    for (let x = 14; x < 28; x += 3) p.px(x, 38, BST[1]);
  }, { glow: true, box: [-18, -12, 18, 1], light: { dx: 0, dy: -32, radius: 58, color: [90, 220, 205], intensity: 0.6 } });
}

// Steinhügel (Cairn): aufgeschichtete Rundsteine; v1 mit Bronzehelm und Schwert
function barrowCairn(v) {
  const W = 22, H = v ? 24 : 18, AX = 11, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    const b = H - 1;
    p.ellipse(11, b - 0.5, 10, 1.6, EARTH[3]);
    const stones = [
      [4, b - 3, 3.4, 2.4, 4], [10, b - 2.6, 3.8, 2.6, 3], [16.5, b - 3, 3.6, 2.5, 4],
      [7, b - 7, 3.4, 2.4, 4], [13.5, b - 7, 3.6, 2.6, 5], [10, b - 10.6, 3.2, 2.4, 5],
    ];
    if (v === 1) stones.push([10.5, b - 13.6, 2.4, 1.8, 5]);
    for (const [x, y, rx, ry, k] of stones) {
      blob(p, x, y, rx, ry, BST, k, 2.2);
      p.px(Math.round(x - rx * 0.4), Math.round(y - ry * 0.5), BST[6]);
    }
    p.px(5, b - 4, LICH[2]); p.px(6, b - 4, LICH[1]); p.px(15, b - 8, LICH[2]);
    if (v === 0) {
      // Kleine Opfergaben: Knochen und Goldmünze
      longBone(p, 14, b - 1, 18, b); p.px(3, b - 1, GOLD[5]); p.px(4, b - 1, GOLD[3]);
    } else {
      // Schwert steckt zwischen den Steinen, Bronzehelm obenauf
      for (let y = 0; y < 11; y++) { p.px(17, y + 2, BRZ[5]); p.px(18, y + 2, BRZ[3]); }
      p.rect(15, 1, 6, 1, BRZ[4]); p.px(15, 1, BRZ[5]); p.rect(17, -1 + 1, 2, 1, BRZ[2]);
      p.px(17, 0, GOLD[5]);
      p.ellipse(10.5, b - 15.5, 3.4, 2.8, BRZ[3]); p.ellipse(9.6, b - 16.4, 1.8, 1.4, BRZ[5]); p.px(8, b - 17, BRZ[5]); p.px(12, b - 15, PAT[1]); p.px(13, b - 16, PAT[2]);
      p.rect(7, b - 14, 8, 1, BRZ[2]); p.px(10, b - 14, BRZ[1]); p.rect(10, b - 16, 1, 3, BRZ[1]);
    }
  }, { box: [-7, -3, 7, 1] });
}

// Waffenopfer: Opferstein mit steckendem Schwert, Rundschild, Speeren, Gold
function barrowWeaponOffering() {
  const W = 28, H = 32, AX = 14, AY = 31;
  return prop(W, H, AX, AY, (p, G) => {
    // Speere gekreuzt dahinter
    p.line(18, 30, 25, 2, WOOD[4]); p.line(19, 30, 26, 2, WOOD[2]);
    p.line(22, 30, 16, 3, WOOD[3]); p.line(23, 30, 17, 3, WOOD[1]);
    for (const [x, y] of [[25, 0], [16, 1]]) { p.rect(x, y, 2, 3, BRZ[4]); p.px(x, y, BRZ[5]); p.px(x + 1, y + 2, BRZ[2]); }
    // Opferstein
    p.rect(2, 21, 24, 9, BST[2]); p.rect(2, 21, 24, 2, BST[4]); p.rect(2, 21, 24, 1, BST[5]);
    p.rect(2, 23, 1, 7, BST[4]); p.rect(25, 23, 1, 7, BST[1]); p.rect(3, 29, 22, 1, BST[0]);
    for (let x = 5; x < 24; x += 5) p.px(x, 26, BST[1]);
    triskele(p, 14, 26, 2.4, BST[0], BST[4]);
    // Schwert, bis zum Heft im Stein
    p.rect(13, 6, 2, 15, '#8a96a0'); p.rect(13, 6, 1, 15, '#c6d0d6'); p.px(14, 20, '#5a646c');
    for (let y = 9; y < 20; y += 3) p.px(14, y, RUST[2]);
    p.rect(10, 5, 8, 1, GOLD[4]); p.px(10, 5, GOLD[6]); p.px(17, 5, GOLD[2]);
    p.rect(13, 1, 2, 4, '#3a2418'); p.px(13, 2, '#5e3c26');
    p.rect(12, 0, 4, 1, GOLD[5]); p.px(12, 0, GOLD[6]);
    G.px(13, 0, '#4a3a10');
    // Rundschild lehnt links am Stein
    const sx = 6, sy = 18;
    for (let y = -6; y <= 6; y++) for (let x = -5; x <= 5; x++) {
      const d = (x * x) / 30 + (y * y) / 42;
      if (d > 1) continue;
      let c;
      if (d > 0.75) c = x + y < 0 ? BRZ[4] : BRZ[2];
      else c = ((x + 8) >> 1) % 2 ? WOOD[3] : WOOD[4];
      if (d < 0.12) c = x + y < 0 ? BRZ[5] : BRZ[3];
      p.px(sx + x, sy + y, c);
    }
    p.px(sx - 1, sy - 1, BRZ[5]); p.px(sx + 4, sy + 1, PAT[1]); p.px(sx - 4, sy + 2, PAT[0]); p.px(sx + 3, sy + 3, WOOD[1]); p.px(sx + 2, sy - 4, WOOD[1]);
    // Goldreif, Münzen, Becher
    p.ellipse(21, 20.5, 2.2, 0.9, GOLD[4]); p.px(20, 20, GOLD[6]); p.px(21, 20, '#1a120a');
    for (const [x, y] of [[17, 21], [19, 22], [23, 22]]) { p.px(x, y, GOLD[5]); p.px(x + 1, y, GOLD[3]); }
    p.rect(9, 18, 3, 3, GOLD[3]); p.rect(9, 18, 1, 3, GOLD[5]); p.rect(9, 17, 3, 1, GOLD[4]); p.px(10, 17, '#1a120a');
    for (const [x, y] of [[17, 21], [9, 17]]) G.px(x, y, '#3a2c08');
  }, { glow: true, box: [-12, -4, 12, 1] });
}

// ================================================================== SPORENSCHLUND
// Knolliger Fleischfels mit Myzelfäden, Pilzchen und Schleimpfützen.
function sporeFloor(count = 10, seed = 311) {
  const rng = createRng(seed);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const p = new PixelCanvas(32, 32);
    p.rect(0, 0, 32, 32, FLESH[1]);
    for (let k = 0; k < 90; k++) p.px(rng.int(0, 31), rng.int(0, 31), rng.pick([FLESH[0], FLESH[2], FLESH[2]]));
    // Knollen: gerundete Buckel, innerhalb der Kachel
    const bumps = [];
    for (let k = 0; k < 7; k++) {
      const rx = rng.range(3.6, 7), ry = rx * rng.range(0.6, 0.8);
      bumps.push([rng.range(rx + 0.5, 31.5 - rx), rng.range(ry + 0.5, 31.5 - ry), rx, ry, rng.pick([2, 3, 3, 4])]);
    }
    bumps.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rx, ry, k] of bumps) {
      p.ellipse(x + 0.6, y + 0.8, rx, ry, FLESH[0]);
      blob(p, x, y, rx, ry, FLESH, k - 0.4, 1.3);
      if (rng.chance(0.3)) p.px(Math.round(x - rx * 0.35), Math.round(y - ry * 0.45), FLESH[6]);
      // Poren
      if (rng.chance(0.5)) for (let m = 0; m < 3; m++) p.px(Math.round(x + rng.range(-rx, rx) * 0.5), Math.round(y + rng.range(-ry, ry) * 0.5), FLESH[1]);
    }
    // Myzelfäden: blasse, verzweigte Adern
    for (let t = 0; t < (rng.chance(0.5) ? 1 : 0); t++) {
      const pts = wander(rng, rng.int(4, 27), rng.int(4, 27), rng.range(-1, 1), rng.range(-1, 1), rng.int(4, 8), 0.8);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (bx < 1 || by < 1 || bx > 30 || by > 30) break;
        p.line(ax, ay, bx, by, i < 3 ? MYC[2] : MYC[1]);
        if (rng.chance(0.3)) p.px(bx + 1, by + 1, MYC[1]);
      }
    }
    // Schleimpfütze (grün glänzend)
    if (rng.chance(0.25)) {
      const px = rng.int(6, 25), py = rng.int(6, 25), rx = rng.int(2, 4);
      p.ellipse(px, py, rx, 1.4, SLIME[2]); p.ellipse(px, py, rx - 1, 0.8, SLIME[3]);
      p.px(px - rx + 1, py - 1, SLIME[6]); p.px(px - rx + 2, py - 1, SLIME[5]); p.px(px + 1, py, SLIME[4]);
    }
    // Kleine Leuchtpilze
    const shrooms = n % 4 === 0 ? 1 : 0;
    for (let s = 0; s < shrooms; s++) {
      const x = rng.int(3, 27), y = rng.int(4, 27), R = rng.chance(0.55) ? SGRN : SVIO;
      for (let c = 0; c < rng.int(2, 3); c++) {
        const mx = x + c * 2 + rng.int(0, 1), my = y + rng.int(-1, 1);
        p.px(mx, my, STALK[4]); p.px(mx, my - 1, R[5]); p.px(mx - 1, my - 1, R[4]); p.px(mx + 1, my - 1, R[3]); p.px(mx, my - 2, R[6]);
      }
    }
    // Sporenstaub
    for (let k = 0; k < rng.int(1, 3); k++) p.px(rng.int(1, 30), rng.int(1, 30), rng.pick([SVIO[2], SGRN[2], MYC[1]]));
    // Glühende Spalte in wenigen Kacheln
    if (n === 5 || n === 9) {
      let cx = rng.int(6, 22), cy = rng.int(6, 12);
      for (let i = 0; i < 10; i++) { p.px(cx, cy, FLESH[0]); if (i > 1 && i < 8) p.px(cx, cy, i % 2 ? SGRN[3] : SGRN[2]); cx += rng.int(-1, 1) || 1; cy += 1; }
    }
    tiles.push(p.canvas);
  }
  return tiles;
}

function sporeFaces(count = 8, seed = 331) {
  const rng = createRng(seed);
  const lumps = (p, y0, y1, n, dark = 0) => {
    for (let k = 0; k < n; k++) {
      const rx = rng.range(2.6, 4.6), ry = rng.range(1.8, 2.8);
      blob(p, rng.range(-1, 17), rng.range(y0, y1), rx, ry, FLESH, rng.pick([3, 4, 4, 5]) - dark, 1.6);
    }
  };
  const drip = (p, x, y0, len) => {
    for (let y = y0; y < Math.min(T, y0 + len); y++) { p.px(x, y, y === y0 + len - 1 ? SLIME[5] : SLIME[3]); if (y % 3 === 0) p.px(x - 1, y, SLIME[6]); }
    if (y0 + len < T) p.px(x, y0 + len, SLIME[6]);
  };
  const makeUpper = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, FLESH[2]);
    lumps(p, 1, 15, 9);
    p.rect(0, 0, T, 1, FLESH[6]); p.rect(0, 1, T, 1, FLESH[5]);
    // Myzeladern
    for (let t = 0; t < 2; t++) {
      let x = rng.int(0, 15), y = rng.int(2, 6);
      for (let i = 0; i < 6; i++) { p.px(x, y, MYC[1 + (i < 2 ? 1 : 0)]); if (rng.chance(0.3)) x += rng.int(-1, 1); y += 1; if (y > 15) break; }
    }
    // Konsolenpilze (Baumschwamm-Kanten), wechselnd ocker/violett
    if (v % 3 !== 2) {
      const R = v % 2 ? CAPV : OCHRE, bx = rng.int(1, 8), by = rng.int(7, 10);
      for (let s = 0; s < 2; s++) {
        const x0 = bx + s * 5, y0 = by + s * 2, w = 6 - s;
        for (let i = 0; i < w; i++) {
          const h = Math.round(Math.sin(((i + 0.5) / w) * Math.PI) * 2) + 1;
          for (let j = 0; j < h; j++) p.px(x0 + i, y0 - j, j === h - 1 ? R[5] : R[3]);
          p.px(x0 + i, y0 + 1, v % 2 ? SVIO[3] : R[1]);
        }
        p.px(x0 + 1, y0 - 1, R[6]);
      }
    }
    // Leuchtpunkte (Sporennester)
    for (let k = 0; k < rng.int(1, 3); k++) { const x = rng.int(1, 14), y = rng.int(3, 13), R = rng.chance(0.5) ? SGRN : SVIO; p.px(x, y, R[5]); p.px(x + 1, y, R[3]); p.px(x, y + 1, R[2]); }
    // Schleimfäden
    if (v % 2 === 0) drip(p, rng.int(2, 13), rng.int(2, 6), rng.int(4, 9));
    p.ctx.fillStyle = 'rgba(8,2,10,0.22)'; p.ctx.fillRect(0, 2, T, 3);
    return p.canvas;
  };
  const makeLower = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, FLESH[2]);
    lumps(p, 0, 14, 10, 1);
    // Myzelnetz
    for (let t = 0; t < 2; t++) {
      let x = rng.int(0, 15), y = 0;
      for (let i = 0; i < 10; i++) { p.px(x, y, MYC[1]); if (rng.chance(0.3)) x += rng.int(-1, 1); y += 1; }
    }
    // Schleimbahnen, glänzend
    for (let d = 0; d < (v % 3 === 0 ? 2 : 1); d++) drip(p, rng.int(1, 14), rng.int(0, 5), rng.int(5, 11));
    // Kleine Pilzgruppe am Fuß
    if (v % 2 === 1) {
      const x = rng.int(2, 11), R = v % 4 === 1 ? SGRN : SVIO;
      for (let c = 0; c < 3; c++) {
        const mx = x + c * 2, h = 2 + ((c + v) % 2);
        for (let y = 15 - h; y < 15; y++) p.px(mx, y, STALK[4]);
        p.px(mx, 14 - h, R[5]); p.px(mx - 1, 15 - h, R[4]); p.px(mx + 1, 15 - h, R[2]);
      }
    }
    // Umgebungsverdeckung und Schleimsaum am Fuß
    p.ctx.fillStyle = 'rgba(6,2,8,0.3)'; p.ctx.fillRect(0, 8, T, 8);
    p.ctx.fillStyle = 'rgba(6,2,8,0.3)'; p.ctx.fillRect(0, 12, T, 4);
    for (let x = 0; x < T; x++) { p.px(x, 15, (x + v) % 4 === 0 ? SLIME[4] : SLIME[2]); if ((x * 3 + v) % 5 === 0) p.px(x, 14, SLIME[3]); }
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(makeUpper(i)); lower.push(makeLower(i)); }
  return { upper, lower };
}

function sporeTop(seed = 341) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#0f0a10');
  for (let i = 0; i < 32; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#150e16', '#0a060b', '#1a111a', '#120c14', '#141018']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#070408');
  }
  p.px(rng.int(0, 15), rng.int(0, 15), '#1c2a18'); p.px(rng.int(0, 15), rng.int(0, 15), '#231632');
  return p.canvas;
}

// Giftschleim: zähe, leuchtende Masse mit Blasen und Schlieren.
function sporeLiquid(seed = 351) {
  const rng = createRng(seed);
  const TAU = Math.PI * 2;
  const bubbles = [];
  for (let i = 0; i < 4; i++) bubbles.push([rng.int(1, 14), rng.int(1, 14), rng.int(0, 3), rng.chance(0.5)]);
  const frames = [], glow = [];
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T);
    const ph = (f / 4) * TAU;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = Math.sin((x / 16) * TAU + Math.sin((y / 16) * TAU * 2 + ph) * 1.4 + ph) * 0.5
        + Math.sin((y / 16) * TAU - (x / 16) * TAU * 2 + Math.sin((x / 16) * TAU + ph) + ph) * 0.35
        + Math.sin(((x * 3 + y) / 16) * TAU - ph) * 0.15;
      const v = n + dth(x, y) * 0.3;
      let k = v > 0.78 ? 5 : v > 0.4 ? 4 : v > -0.05 ? 3 : v > -0.5 ? 2 : 1;
      p.px(x, y, SLIME[k]);
      if (k >= 4) g.px(x, y, SLIME[k - 2]);
      else if (k === 3 && (x + y) % 3 === 0) g.px(x, y, SLIME[1]);
    }
    // Ölige Schlieren (violetter Schimmer)
    for (let r = 0; r < 2; r++) {
      const y = (r * 8 + 4 + f) & 15, x0 = (r * 7 + f * 3) & 15;
      for (let i = 0; i < 3; i++) p.px((x0 + i) & 15, y, i === 1 ? SVIO[4] : SVIO[3]);
    }
    // Blasen: wachsen, platzen
    for (const [bx, by, t, big] of bubbles) {
      const s = (f + t) % 4;
      if (s === 0) { p.px(bx, by, SLIME[6]); g.px(bx, by, SLIME[5]); }
      else if (s === 1) { p.px(bx, by, SLIME[6]); p.px(bx + 1, by, SLIME[5]); p.px(bx, by - 1, SLIME[7]); if (big) p.px(bx + 1, by - 1, SLIME[6]); g.px(bx, by, SLIME[6]); g.px(bx, by - 1, SLIME[5]); }
      else if (s === 2) { p.px(bx - 1, by, SLIME[6]); p.px(bx + 2, by, SLIME[6]); p.px(bx, by - 2, SLIME[5]); g.px(bx - 1, by, SLIME[4]); g.px(bx + 2, by, SLIME[4]); }
    }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  // Uferkante: Fleischfelslippe, Schleim läuft über
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 5, FLESH[3]); e.rect(0, 0, T, 1, FLESH[6]); e.rect(0, 1, T, 1, FLESH[5]);
  for (let x = 0; x < T; x += 5) { e.px(x, 2, FLESH[1]); e.px(x + 2, 3, FLESH[4]); }
  e.rect(0, 5, T, 1, FLESH[1]);
  for (const [x, l] of [[2, 3], [7, 5], [11, 2], [14, 4]]) for (let y = 3; y < 3 + l; y++) e.px(x, y, y === 2 + l ? SLIME[6] : SLIME[4]);
  for (let x = 0; x < T; x++) e.px(x, 6, x % 4 === 1 ? SLIME[7] : SLIME[6]);
  e.ctx.fillStyle = 'rgba(4,10,2,0.55)'; e.ctx.fillRect(0, 7, T, 2);
  e.ctx.fillStyle = 'rgba(4,10,2,0.3)'; e.ctx.fillRect(0, 9, T, 2);
  e.ctx.fillStyle = 'rgba(4,10,2,0.12)'; e.ctx.fillRect(0, 11, T, 2);
  return { frames, glow, edge: e.canvas, edgeH: 7 };
}

// ------------------------------------------------------------ Sporen-Props
// Pilzhut als Kuppel mit leuchtenden Lamellen an der Unterseite
function mushroomCap(p, G, cx, cy, rx, ry, cap, gl, spots) {
  // Lamellen (Unterseite): flache Ellipse unter dem Hut
  for (let x = Math.round(cx - rx + 1); x <= Math.round(cx + rx - 1); x++) {
    const u = Math.abs(x - cx) / rx, h = Math.max(1, Math.round((1 - u * u) * 2.4));
    for (let j = 0; j < h; j++) {
      const c = (x & 1) ? gl[2] : gl[3 + (j === 0 ? 1 : 0)];
      p.px(x, cy + j, c); G.px(x, cy + j, (x & 1) ? gl[2] : gl[4]);
    }
  }
  // Kuppel
  for (let y = Math.floor(cy - ry); y <= cy; y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1 || ny > 0.05) continue;
    let l = -(nx * 0.7 + ny * 0.6) - d * 0.3;
    if (y === cy) l -= 0.6;
    p.px(x, y, cl(cap, 3.4 + l * 2.2 + dth(x, y) * 0.8));
  }
  // Randlicht oben links, leuchtende Punkte
  for (let x = Math.round(cx - rx * 0.7); x < cx; x++) {
    const ny = Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2));
    p.px(x, Math.round(cy - ry * ny), cap[6]);
  }
  for (const [sx, sy, r] of spots) {
    const x = Math.round(cx + sx * rx), y = Math.round(cy - sy * ry);
    p.px(x, y, gl[5]); G.px(x, y, gl[5]);
    if (r) { p.px(x + 1, y, gl[4]); p.px(x, y + 1, gl[3]); G.px(x + 1, y, gl[3]); G.px(x, y - 1, gl[2]); }
  }
  // Tropfen am Hutrand
  G.px(Math.round(cx + rx * 0.6), cy + 2, gl[3]);
}

function stem(p, x, y0, y1, w, bend = 0) {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const ox = Math.round(Math.sin(t * Math.PI) * bend);
    const ww = w + (t > 0.85 ? Math.round((t - 0.85) * 14) : 0);
    for (let i = 0; i < ww; i++) p.px(x + ox - (ww - w >> 1) + i, y, cylCol(STALK, i, ww, 3.6 + (t > 0.85 ? 0.6 : 0)));
  }
}

function sporeGiantMushroom(v) {
  if (v === 0) {
    const W = 32, H = 44, AX = 16, AY = 43;
    return prop(W, H, AX, AY, (p, G) => {
      p.ellipse(16, 42, 9, 1.8, FLESH[3]);
      stem(p, 12, 12, 42, 8, 1);
      // Manschette (Ring) und Knolle
      p.rect(10, 19, 12, 2, STALK[5]); p.rect(10, 21, 12, 1, STALK[3]); p.px(10, 19, STALK[6]); p.px(21, 21, STALK[1]);
      for (let y = 21; y < 26; y += 2) p.px(12, y, STALK[2]);
      blob(p, 16, 40, 5, 2.6, STALK, 4, 1.4);
      for (const [x, y] of [[14, 30], [17, 34], [15, 37]]) p.px(x, y, STALK[2]);
      mushroomCap(p, G, 16, 12, 15, 11, CAPG, SGRN, [[-0.5, 0.6, 1], [0.1, 0.85, 1], [0.55, 0.45, 0], [-0.2, 0.3, 0], [0.35, 0.7, 0], [-0.75, 0.25, 1], [0.75, 0.2, 0]]);
      // Kleine Pilze am Fuß
      for (const [x, h, R] of [[5, 5, SGRN], [8, 3, SVIO], [25, 4, SGRN]]) {
        for (let y = 42 - h; y < 42; y++) p.px(x, y, STALK[4]);
        p.rect(x - 1, 41 - h, 3, 1, R[4]); p.px(x, 40 - h, R[5]); p.px(x + 1, 41 - h, R[3]);
        G.rect(x - 1, 41 - h, 3, 1, R[3]); G.px(x, 40 - h, R[5]);
      }
      // Sporen schweben
      for (const [x, y] of [[4, 20], [27, 17], [24, 26], [7, 28]]) { p.px(x, y, SGRN[5]); G.px(x, y, SGRN[4]); }
    }, { glow: true, box: [-4, -3, 4, 1], light: { dx: 0, dy: -24, radius: 76, color: [110, 240, 120], intensity: 0.85 } });
  }
  if (v === 1) {
    // Gruppe schlanker violetter Kegelpilze
    const W = 26, H = 46, AX = 13, AY = 45;
    return prop(W, H, AX, AY, (p, G) => {
      p.ellipse(13, 44, 11, 1.8, FLESH[3]);
      const cone = (cx, top, rx, ry, base) => {
        stem(p, cx - 1, top + ry, base, 4, 0.8);
        for (let y = 0; y <= ry; y++) {
          const hw = rx * Math.pow(y / ry, 0.7);
          for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
            const u = (x - (cx - hw)) / (hw * 2 + 0.01);
            p.px(x, top + y, cl(CAPV, (u < 0.3 ? 5 : u < 0.6 ? 4 : 2.6) + dth(x, y) * 0.8 - (y === ry ? 1 : 0)));
          }
        }
        for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) { p.px(x, top + ry + 1, (x & 1) ? SVIO[3] : SVIO[4]); G.px(x, top + ry + 1, SVIO[4]); }
        p.px(cx, top, SVIO[6]); G.px(cx, top, SVIO[5]);
        for (let y = 3; y < ry; y += 3) { const x = Math.round(cx - rx * Math.pow(y / ry, 0.7) * 0.4); p.px(x, top + y, SVIO[5]); G.px(x, top + y, SVIO[4]); }
      };
      cone(7, 12, 5, 8, 44);
      cone(18, 2, 6, 10, 44);
      cone(12, 26, 4, 6, 44);
      for (const [x, y] of [[3, 8], [23, 20], [9, 5], [22, 32]]) { p.px(x, y, SVIO[5]); G.px(x, y, SVIO[4]); }
    }, { glow: true, box: [-5, -3, 5, 1], light: { dx: 0, dy: -24, radius: 66, color: [180, 110, 255], intensity: 0.8 } });
  }
  // v2: breite, niedrige Schirmpilze, grün und violett überlappend, Schleim tropft
  const W = 34, H = 30, AX = 17, AY = 29;
  return prop(W, H, AX, AY, (p, G) => {
    p.ellipse(17, 28, 14, 1.8, FLESH[3]);
    stem(p, 21, 12, 28, 6, -1);
    mushroomCap(p, G, 24, 12, 9, 6, CAPV, SVIO, [[-0.4, 0.6, 1], [0.3, 0.5, 0], [0.7, 0.2, 0]]);
    stem(p, 8, 10, 28, 7, 1);
    mushroomCap(p, G, 11, 11, 11, 8, CAPG, SGRN, [[-0.5, 0.5, 1], [0.2, 0.8, 1], [0.6, 0.35, 0], [-0.1, 0.25, 0]]);
    for (const [x, y0, l] of [[4, 13, 5], [17, 13, 7], [30, 14, 4]]) for (let y = y0; y < y0 + l; y++) { p.px(x, y, y === y0 + l - 1 ? SLIME[6] : SLIME[4]); G.px(x, y, SLIME[3]); }
  }, { glow: true, box: [-9, -3, 9, 1], light: { dx: 0, dy: -18, radius: 70, color: [140, 200, 190], intensity: 0.8 } });
}

// Sporenblase: prall, durchscheinend, leuchtender Kern
function sporePod(v) {
  const W = 16, H = 20, AX = 8, AY = 19;
  const R = v ? SVIO : SGRN, M = v ? CAPV : CAPG;
  return prop(W, H, AX, AY, (p, G) => {
    p.ellipse(8, 18.5, 6, 1.4, FLESH[3]);
    // Stiel mit Wurzelfüßen
    p.rect(7, 13, 3, 6, M[3]); p.px(7, 13, M[5]); p.px(9, 17, M[1]);
    p.line(7, 18, 4, 19, M[3]); p.line(9, 18, 12, 19, M[2]);
    // Blase: dunkle Haut, heller Kern schimmert durch
    blob(p, 8, 8, 6, 6.6, M, 3.4, 2);
    for (let y = 3; y <= 13; y++) for (let x = 3; x <= 13; x++) {
      const d = ((x - 7.6) ** 2) / 12 + ((y - 8.6) ** 2) / 14;
      if (d > 1) continue;
      const k = d < 0.25 ? 6 : d < 0.55 ? 5 : 4;
      if (d < 0.8) { p.px(x, y, R[k - (d > 0.55 && (x + y) % 2 ? 1 : 0)]); G.px(x, y, R[k - 1]); }
    }
    // Adern über der Haut
    for (const pts of [[[5, 3], [4, 7], [5, 11]], [[10, 2], [12, 6], [11, 10], [12, 13]], [[8, 2], [8, 5]]]) for (let i = 1; i < pts.length; i++) p.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], M[1]);
    p.px(5, 4, M[6]); p.px(6, 3, R[6]); G.px(6, 3, R[5]);
    // Öffnung oben mit austretenden Sporen
    p.px(8, 1, M[1]); p.px(9, 1, R[4]);
    for (const [x, y] of [[9, 0], [6, -1 + 1], [11, 0]]) { p.px(x, y, R[5]); G.px(x, y, R[5]); }
  }, { glow: true, box: [-4, -3, 4, 1], light: { dx: 0, dy: -9, radius: 36, color: v ? [180, 110, 255] : [110, 240, 120], intensity: 0.6 } });
}

// Pilzsäule: Fleischfels mit Konsolenpilzen (v0) bzw. Myzelnetz und Leuchtpilzen (v1)
function sporeFungalPillar(v) {
  const W = 22, H = 48, AX = 11, AY = 46;
  return prop(W, H, AX, AY, (p) => {
    const rng = createRng(900 + v);
    p.ellipse(11, 45, 10, 2.2, FLESH[3]);
    // Schaft: organisch verdickt, knotig
    for (let y = 0; y < 45; y++) {
      const hw = 6 + Math.sin(y * 0.35 + v) * 0.9 + (y > 38 ? (y - 38) * 0.45 : 0) + (y < 4 ? (4 - y) * 0.6 : 0);
      const x0 = Math.round(11 - hw), x1 = Math.round(11 + hw) - 1;
      for (let x = x0; x <= x1; x++) p.px(x, y, cl(FLESH, cylCol([0, 1, 2, 3, 4, 5, 6], x - x0, x1 - x0 + 1, 4) + dth(x, y) * 0.6));
    }
    for (let k = 0; k < 7; k++) blob(p, rng.range(6, 16), rng.range(4, 40), rng.range(2, 3.2), rng.range(1.6, 2.4), FLESH, 4, 1.6);
    if (v === 0) {
      // Konsolenpilze in Etagen
      const shelf = (x, y, w, dir, R) => {
        for (let i = 0; i < w; i++) {
          const t = (i + 0.5) / w, h = Math.round(Math.sin(t * Math.PI) * 2.4) + 1;
          const xx = dir > 0 ? x + i : x - i;
          for (let j = 0; j < h; j++) p.px(xx, y - j, j === h - 1 ? R[5] : j === 0 ? R[2] : R[4]);
          p.px(xx, y + 1, R[1]);
          if (i % 2 === 0) p.px(xx, y - h + 1, R[6]);
        }
      };
      shelf(15, 12, 7, 1, OCHRE); shelf(7, 20, 7, -1, OCHRE); shelf(14, 27, 6, 1, OCHRE); shelf(8, 34, 6, -1, CAPV); shelf(15, 38, 5, 1, OCHRE);
      for (const [x, y, l] of [[18, 13, 4], [3, 21, 3]]) for (let i = 0; i < l; i++) p.px(x, y + 1 + i, i === l - 1 ? SLIME[6] : SLIME[3]);
    } else {
      // Myzelnetz und kleine Leuchtpilze
      for (let t = 0; t < 3; t++) {
        let x = rng.int(6, 16), y = rng.int(0, 10);
        for (let i = 0; i < 18 && y < 44; i++) { p.px(x, y, MYC[i < 6 ? 3 : 2]); if (i % 5 === 0) p.px(x + 1, y, MYC[1]); x += rng.int(-1, 1); x = Math.max(5, Math.min(17, x)); y += rng.int(1, 2); }
      }
      for (const [x, y, R] of [[6, 14, SGRN], [15, 22, SVIO], [8, 31, SGRN], [16, 36, SGRN], [5, 40, SVIO]]) {
        p.px(x, y, R[5]); p.px(x - 1, y, R[4]); p.px(x + 1, y, R[3]); p.px(x, y - 1, R[6]); p.px(x, y + 1, STALK[4]);
      }
    }
    // Krone geht in die Decke über: Schleimtropfen
    p.rect(3, 0, 16, 2, FLESH[5]); p.rect(3, 0, 16, 1, FLESH[6]);
    p.px(6, 2, SLIME[4]); p.px(6, 3, SLIME[6]); p.px(14, 2, SLIME[4]);
  }, { box: [-7, -5, 7, 1] });
}

// Schleimtümpel am Boden (begehbar, nur Deko)
function sporeSlimePool() {
  const W = 30, H = 12, AX = 15, AY = 7;
  return prop(W, H, AX, AY, (p, G) => {
    // Wulstiger Rand
    p.ellipse(15, 6, 14, 5, FLESH[3]);
    p.ellipse(15, 5.4, 13, 4.2, FLESH[4]);
    p.ellipse(15, 6, 12, 3.8, SLIME[2]);
    p.ellipse(15, 6.2, 11, 3.2, SLIME[3]);
    p.ellipse(14, 5.6, 8, 2.2, SLIME[4]);
    p.ellipse(13, 5.2, 4, 1.2, SLIME[5]);
    for (let x = 4; x < 26; x++) { if ((x * 7) % 5 === 0) p.px(x, 2, FLESH[6]); }
    G.ellipse(15, 6.2, 11, 3.2, SLIME[2]); G.ellipse(14, 5.6, 8, 2.2, SLIME[3]); G.ellipse(13, 5.2, 4, 1.2, SLIME[4]);
    // Blasen und Glanz
    for (const [x, y] of [[9, 5], [18, 7], [21, 5], [12, 7]]) { p.px(x, y, SLIME[7]); p.px(x + 1, y, SLIME[6]); G.px(x, y, SLIME[6]); }
    p.px(7, 4, SLIME[7]); p.px(8, 4, SLIME[6]);
    // Violetter Ölfilm
    p.px(20, 6, SVIO[4]); p.px(21, 6, SVIO[3]); p.px(16, 8, SVIO[3]);
    // Knochenreste halb versunken
    p.px(24, 7, BONE[2]); p.px(25, 7, BONE[1]); p.px(24, 6, BONE[3]);
  }, { glow: true, light: { dx: 0, dy: -2, radius: 44, color: [120, 235, 90], intensity: 0.55 } });
}

// Leuchtmoos-Polster (flach, Bodendeko)
function sporeGlowMoss(v) {
  const W = 18, H = 9, AX = 9, AY = 7;
  const R = v ? SVIO : SGRN;
  return prop(W, H, AX, AY, (p, G) => {
    const rng = createRng(950 + v);
    p.ellipse(9, 5, 8, 3, FLESH[3]);
    for (let k = 0; k < 46; k++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
      const x = Math.round(9 + Math.cos(a) * r * 7.5), y = Math.round(5 + Math.sin(a) * r * 2.6);
      const c = rng.chance(0.25) ? R[4] : rng.chance(0.5) ? R[3] : R[2];
      p.px(x, y, c);
      if (c === R[4]) { p.px(x, y - 1, R[5]); G.px(x, y - 1, R[5]); G.px(x, y, R[3]); } else G.px(x, y, R[1]);
    }
    for (let k = 0; k < 5; k++) { const x = rng.int(3, 15), y = rng.int(1, 4); p.px(x, y, R[6]); G.px(x, y, R[6]); }
  }, { glow: true });
}

// Aufgerissene Kokonhülle: stehend, oben geplatzt (v0) / zusammengesunken mit Knochen (v1)
function sporeCocoonHusk(v) {
  const W = 18, H = v ? 12 : 22, AX = 9, AY = H - 1;
  return prop(W, H, AX, AY, (p, G) => {
    if (v === 0) {
      p.ellipse(9, 20.5, 7, 1.4, FLESH[3]);
      for (let y = 3; y <= 20; y++) {
        const t = (y - 3) / 17, hw = 5.8 * Math.sin(Math.PI * (0.18 + t * 0.72)) + 0.4;
        const x0 = Math.round(9 - hw), x1 = Math.round(9 + hw) - 1;
        for (let x = x0; x <= x1; x++) {
          const u = (x - x0 + 0.5) / (x1 - x0 + 1);
          let k = u < 0.18 ? 4 : u < 0.45 ? 5 : u < 0.75 ? 4 : 2;
          if ((x + y * 2) % 7 === 0) k -= 1;
          p.px(x, y, cl(MEMB, k + dth(x, y) * 0.6));
        }
      }
      // Riss oben: dunkles Inneres, ausgefranste Lappen
      for (let y = 2; y <= 10; y++) { const hw = Math.max(0, 2.6 - Math.abs(y - 6) * 0.45); p.rect(Math.round(9 - hw), y, Math.round(hw * 2) + 1, 1, '#0c0a06'); }
      for (const [x, y] of [[5, 2], [6, 1], [12, 1], [13, 3], [4, 4]]) { p.px(x, y, MEMB[5]); p.px(x, y + 1, MEMB[3]); }
      // Adern, Schleim im Inneren und an der Haut
      for (const pts of [[[5, 12], [6, 16], [5, 19]], [[12, 11], [12, 15], [13, 19]]]) for (let i = 1; i < pts.length; i++) p.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], MEMB[2]);
      for (const [x, y] of [[9, 8], [8, 9], [10, 7]]) { p.px(x, y, SLIME[5]); G.px(x, y, SLIME[4]); }
      for (let y = 9; y < 15; y++) { p.px(10, y, SLIME[y === 14 ? 6 : 4]); G.px(10, y, SLIME[2]); }
      // Myzelfäden verankern die Hülle
      p.line(3, 20, 0, 21, MYC[3]); p.line(15, 20, 17, 21, MYC[3]); p.line(4, 18, 1, 19, MYC[2]);
    } else {
      p.ellipse(9, 10.5, 8, 1.4, FLESH[3]);
      // Schlaffe Hülle, eingefallen, halb offen
      for (let x = 1; x < 17; x++) {
        const h = Math.round(3 + Math.sin(((x - 1) / 16) * Math.PI) * 4 - (x > 8 && x < 12 ? 2 : 0));
        for (let j = 0; j < h; j++) p.px(x, 10 - j, cl(MEMB, (j === h - 1 ? 5 : j < 2 ? 2 : 4) + dth(x, j) * 0.6));
      }
      p.rect(8, 5, 5, 3, '#0c0a06');
      skull(p, 8, 4); longBone(p, 12, 7, 15, 6);
      for (const [x, y] of [[3, 5], [5, 4], [15, 5]]) { p.px(x, y, MEMB[6]); }
      for (let x = 2; x < 16; x += 4) { p.px(x, 9, SLIME[4]); G.px(x, 9, SLIME[2]); }
      p.px(7, 8, SLIME[6]); G.px(7, 8, SLIME[4]);
    }
  }, { glow: true, box: v ? undefined : [-5, -3, 5, 1] });
}

// Fäulnisaltar: Steinblock, von pulsierendem Pilzfleisch überwuchert
function sporeRotAltar() {
  const W = 34, H = 32, AX = 17, AY = 31;
  return prop(W, H, AX, AY, (p, G) => {
    // Altarblock aus altem Stein
    const S = BST;
    p.rect(3, 16, 28, 14, S[2]); p.rect(3, 16, 28, 1, S[5]); p.rect(3, 17, 1, 13, S[4]); p.rect(30, 17, 1, 13, S[1]); p.rect(4, 29, 26, 1, S[0]);
    for (let x = 6; x < 30; x += 7) { p.rect(x, 20, 1, 9, S[1]); p.px(x + 1, 20, S[4]); }
    p.rect(3, 22, 28, 1, S[1]);
    // Pilzfleisch überwuchert den Block
    for (const [x, y, rx, ry, k] of [[6, 17, 5, 3, 4], [27, 18, 5, 3.4, 3], [10, 28, 4, 2.4, 3], [25, 28, 5, 2.4, 4], [3, 24, 2.4, 3.6, 3]]) blob(p, x, y, rx, ry, FLESH, k + 1, 1.6);
    // Pulsierendes Herzgewächs obenauf
    blob(p, 17, 11, 8, 6.4, CAPV, 4, 2, G, SVIO);
    for (const pts of [[[12, 8], [15, 11], [14, 15]], [[20, 6], [19, 10], [22, 13]], [[17, 5], [17, 9]], [[11, 12], [13, 16]]]) {
      for (let i = 1; i < pts.length; i++) { p.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], SVIO[5]); G.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], SVIO[5]); }
    }
    p.px(14, 7, SVIO[6]); p.px(15, 7, SVIO[6]); G.px(14, 7, SVIO[6]);
    // Knospen/Sporenkapseln
    for (const [x, y] of [[9, 7], [25, 9], [22, 4], [12, 3]]) { blob(p, x, y, 1.8, 1.8, SGRN, 4, 1.4); p.px(x - 1, y - 1, SGRN[6]); G.px(x, y, SGRN[5]); G.px(x - 1, y - 1, SGRN[4]); }
    // Kerzen aus Talg mit grüner Flamme
    for (const x of [5, 29]) {
      p.rect(x, 13, 2, 4, MEMB[4]); p.px(x, 13, MEMB[6]); p.px(x + 1, 16, MEMB[2]);
      p.px(x, 12, SGRN[5]); p.px(x, 11, SGRN[6]); G.px(x, 12, SGRN[5]); G.px(x, 11, SGRN[6]); G.px(x, 10, SGRN[3]);
    }
    // Schleim läuft die Front hinab
    for (const [x, y0, l] of [[12, 17, 7], [21, 17, 9], [16, 17, 4]]) for (let y = y0; y < y0 + l; y++) { p.px(x, y, y === y0 + l - 1 ? SLIME[6] : SLIME[4]); if ((y & 1) === 0) G.px(x, y, SLIME[3]); }
    // Opferschale mit Knochen
    skull(p, 14, 24); p.px(18, 26, BONE[2]); p.px(19, 26, BONE[1]);
  }, { glow: true, box: [-14, -6, 14, 1], light: { dx: 0, dy: -20, radius: 66, color: [180, 100, 255], intensity: 0.85 } });
}

// ================================================================== Einstieg
const CACHE = {};
export function createBiomeTiles3(biome = 'barrow') {
  if (CACHE[biome]) return CACHE[biome];
  let out;
  if (biome === 'spore') {
    out = {
      floor: sporeFloor(),
      faces: sporeFaces(),
      top: sporeTop(),
      topEdge: '#2a1a2a', topEdgeLight: '#46304a',
      liquid: sporeLiquid(),
      ambientTint: [150, 110, 200],
      props: {
        giantMushroom: [sporeGiantMushroom(0), sporeGiantMushroom(1), sporeGiantMushroom(2)],
        sporePod: [sporePod(0), sporePod(1)],
        fungalPillar: [sporeFungalPillar(0), sporeFungalPillar(1)],
        slimePool: sporeSlimePool(),
        glowMoss: [sporeGlowMoss(0), sporeGlowMoss(1)],
        cocoonHusk: [sporeCocoonHusk(0), sporeCocoonHusk(1)],
        rotAltar: sporeRotAltar(),
      },
    };
  } else {
    out = {
      floor: barrowFloor(),
      faces: barrowFaces(),
      top: barrowTop(),
      topEdge: '#2a2521', topEdgeLight: '#403830',
      liquid: barrowLiquid(),
      ambientTint: [90, 180, 175],
      props: {
        standingStone: [barrowStandingStone(0), barrowStandingStone(1)],
        rootPillar: [barrowRootPillar(0), barrowRootPillar(1)],
        burialUrn: [barrowUrn(0), barrowUrn(1)],
        bonePile: [barrowBonePile(0), barrowBonePile(1)],
        ghostBrazier: barrowGhostBrazier(),
        barrowThrone: barrowThrone(),
        cairn: [barrowCairn(0), barrowCairn(1)],
        weaponOffering: barrowWeaponOffering(),
      },
    };
  }
  CACHE[biome] = out;
  return out;
}
