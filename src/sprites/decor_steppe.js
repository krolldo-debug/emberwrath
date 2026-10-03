import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { mk, poly } from './decor_ashwood.js';

// Aschensteppe: trockene Grassteppe unter Aschehimmel. Nomadenlager, Kriegsherren,
// Grabhügel und die Knochen uralter Bestien. Licht von links oben; alles Leuchtende
// zusätzlich auf der Glow-Ebene ((W+2)×(H+2), 1 px Versatz wie decor_ashwood.js).

// Bodenpalette (Format wie BIOME_GROUND in sprites/outdoor.js)
export const GROUND_STEPPE = {
  grass: ['#15130d', '#1d1a11', '#262216', '#302a1b', '#3b3321', '#473d27'],
  dirt: ['#1b150d', '#271e12', '#352816', '#45341d', '#574224', '#6a512e'],
  water: ['#06090b', '#0a1013', '#0f191c', '#172528', '#233538'],
  tufts: false,
};

const STRAW = ['#1c160c', '#2b2212', '#3f3219', '#554422', '#6d592d', '#88713c', '#a68f55'];
const DRYG = ['#17180f', '#232415', '#30301b', '#3f3e22', '#504d2a', '#645f34'];
const DUST = ['#1a1611', '#231d16', '#2d251c', '#382e23'];
const SST = ['#141217', '#1d1a1e', '#282426', '#35302f', '#453e3a', '#574e47', '#6f655a', '#8a7f70'];
const LICH = ['#4a5a2e', '#6a7a3a', '#8a5a26', '#b07a34'];
const ASH = ['#2c282d', '#3b363a', '#4f494b', '#67605f', '#857d78', '#a39a92'];
const BONE = ['#231d16', '#463d30', '#6e6450', '#9a8e72', '#c2b595', '#e3d8bc', '#fbf4e0'];
const FELT = ['#1f1a16', '#302820', '#44392d', '#5b4d3c', '#75654f', '#907f64', '#ab9b7c'];
const HIDE = ['#1c130e', '#2c1e15', '#402c1f', '#57402c', '#71553a', '#8c6d4b'];
const GW = ['#161310', '#231d17', '#322a21', '#44392c', '#584a39', '#6e5e48', '#877458'];
const HORSE = ['#120b08', '#1f130d', '#321e13', '#482c1a', '#613d23', '#7c512f', '#9a6a40'];
const HAIR = ['#0b0a0b', '#171517', '#262224', '#383234', '#4e4648'];
const COLD = ['#0a1c22', '#12404a', '#1f7880', '#4cc0c0', '#b4f4ee'];
const CRIM = PAL.crimson, GOLD = PAL.gold, EMB = PAL.ember, IRON = PAL.steel;
const RED = ['#1e080a', '#3a0e12', '#5e161a', '#852024', '#a8342e', '#c65440'];
const INTERIOR = '#0a0708';

const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => BAY[((y & 3) << 2) | (x & 3)] / 16;

// ------------------------------------------------------------ Helfer
// Beleuchteter, unregelmäßiger Klumpen (Felsen, Hügel, Pilzhüte): Normalen einer
// Ellipse mit verrauschtem Rand, Licht von links oben, geordnetes Dithering.
// Liefert die Oberseiten-Kante (für Asche/Moos) als Map x -> y.
export function shadeLump(p, cx, cy, rx, ry, ramp, seed, { rough = 0.12, bias = 0, flat = 0, noise = 0.1, rim = null, keep = null } = {}) {
  const n = ramp.length, top = new Map();
  const edge = (a) => 1 + (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 1.7) * 0.3 + Math.sin(a * 9 + seed * 0.3) * 0.2) * rough;
  for (let y = Math.floor(cy - ry * 1.3) - 1; y <= Math.ceil(cy + ry * 1.3) + 1; y++) {
    for (let x = Math.floor(cx - rx * 1.3) - 1; x <= Math.ceil(cx + rx * 1.3) + 1; x++) {
      let dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (flat && dy > 1 - flat) dy = 1 - flat + (dy - (1 - flat)) * 0.2; // abgeflachte Standfläche
      const r = Math.hypot(dx, dy), e = edge(Math.atan2(dy, dx));
      const d = r / e;
      if (d > 1) continue;
      if (keep && !keep(x, y)) continue;
      const nx = dx / e, ny = dy / e, nz = Math.sqrt(Math.max(0, 1 - d * d));
      let l = -0.5 * nx - 0.62 * ny + 0.6 * nz;
      l = (l + 0.42) / 1.25 + bias;
      l += (bayer(x, y) - 0.5) * 0.16 + (hash2(x, y, seed) - 0.5) * noise;
      let i = clampI(Math.floor(l * (n - 1) + 0.5), n);
      // Randlicht unten rechts (kühler Reflex vom Aschehimmel)
      if (rim && d > 0.86 && nx > 0.35 && ny > -0.2 && ny < 0.7) { p.px(x, y, rim); continue; }
      p.px(x, y, ramp[i]);
      if (!top.has(x) || y < top.get(x)) top.set(x, y);
    }
  }
  return top;
}

// Staubfleck am Fuß (weich, dunkel), Steppenton
export function dustPatch(p, cx, cy, rx, ry, seed, ramp = DUST) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const h = hash2(cx + x, cy + y, seed);
    if (d > 0.55 && h < 0.5) continue;
    p.px(cx + x, cy + y, h < 0.2 ? ramp[3] : h < 0.65 ? ramp[2] : ramp[1]);
  }
}

// Ein Grashalm (gebogen), Farbe von unten dunkel nach oben hell
export function blade(p, x, y, h, bend, ramp, lo = 1, hi = ramp.length - 1) {
  let lx = x, ly = y;
  for (let k = 0; k <= h; k++) {
    const t = k / Math.max(1, h), xx = Math.round(x + bend * t * t), yy = y - k;
    p.px(xx, yy, ramp[clampI(Math.round(lo + (hi - lo) * t), ramp.length)]);
    lx = xx; ly = yy;
  }
  return [lx, ly];
}

// Kleine Grasbüschel am Fuß eines Objekts
function footGrass(p, rng, x0, x1, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1), h = rng.int(2, 5);
    blade(p, x, y, h, rng.range(-2, 2), STRAW, 1, 4);
  }
}

// Stämmchen/Pfahl mit Zylinderschattierung (links hell)
function pole(p, x, y0, y1, w, ramp, seed = 0) {
  for (let y = y0; y <= y1; y++) for (let i = 0; i < w; i++) {
    const rel = w === 1 ? 0.3 : i / (w - 1);
    let k = rel < 0.25 ? ramp.length - 2 : rel < 0.6 ? ramp.length - 3 : rel < 0.9 ? 2 : 1;
    if (hash2(x + i, y, seed) < 0.1) k--;
    p.px(x + i, y, ramp[clampI(k, ramp.length)]);
  }
}

// Zylinderwand (Jurte/Pavillon): liefert Ober-/Unterkante je x
function cylWall(p, cx, rw, yTop, yBot, ry, col) {
  for (let x = Math.ceil(cx - rw); x <= Math.floor(cx + rw); x++) {
    const rel = (x + 0.5 - cx) / rw;
    if (Math.abs(rel) > 1) continue;
    const s = Math.sqrt(1 - rel * rel);
    const a = Math.round(yTop + s * ry), b = Math.round(yBot + s * ry);
    for (let y = a; y <= b; y++) { const c = col(x, y, rel, s, y - a, b - a); if (c) p.px(x, y, c); }
  }
}
const litIdx = (rel, s, n) => {
  // Licht von links: Normale (rel, s)
  const l = (-0.75 * rel + 0.66 * s + 0.35) / 1.4;
  return clampI(Math.floor(l * (n - 1) + 0.5), n);
};

// ------------------------------------------------------------ Steppengras
function steppeGrass(v) {
  const rng = createRng(700 + v);
  const [W, H] = [[22, 17], [26, 20], [16, 13]][v];
  return mk(W, H, (p) => {
    const by = H - 1, cx = Math.floor(W / 2);
    dustPatch(p, cx, by - 1, Math.floor(W / 2) - 1, 2, 700 + v);
    const n = [18, 24, 11][v];
    const blades = [];
    for (let i = 0; i < n; i++) {
      const x = cx + Math.round((rng.next() + rng.next() - 1) * (W / 2 - 2));
      const hMax = H - 3 - Math.round(Math.abs(x - cx) * 0.55);
      blades.push({ x, h: rng.int(Math.max(3, hMax - 7), Math.max(4, hMax)), bend: (x - cx) * 0.35 + rng.range(-1.5, 1.5), olive: rng.chance(0.25) });
    }
    // hintere (dunkle) Halme zuerst
    blades.sort((a, b) => b.h - a.h);
    blades.forEach((b, k) => {
      const back = k < n * 0.4;
      const ramp = b.olive ? DRYG : STRAW;
      const [tx, ty] = blade(p, b.x, by - (hash2(b.x, k, 3) < 0.5 ? 1 : 0), b.h, b.bend, ramp, back ? 0 : 1, back ? 3 : (b.bend < 0 ? 6 : 5));
      // Samenähre an langen Halmen
      if (!b.olive && b.h > H * 0.55 && hash2(b.x, b.h, 7 + v) < 0.55) {
        p.px(tx, ty, STRAW[6]); p.px(tx + Math.sign(b.bend || 1), ty + 1, STRAW[5]); p.px(tx, ty + 1, STRAW[4]);
      }
    });
    // umgeknickte Halme
    for (let i = 0; i < 3; i++) { const x = rng.int(2, W - 6), y = by - rng.int(1, 3), s = i % 2 ? 1 : -1; p.line(x, y, x + s * 4, y + 1, STRAW[3]); p.px(x, y - 1, STRAW[5]); }
    // Asche auf den Spitzen
    for (let i = 0; i < 4; i++) p.px(cx + rng.int(-W / 3, W / 3), by - rng.int(4, H - 5), ASH[4]);
  }, { ax: Math.floor(W / 2) });
}

// ------------------------------------------------------------ Dornsträucher
function thornShrub(v) {
  const rng = createRng(720 + v);
  const W = 26, H = [20, 22, 16][v];
  const BR = ['#140c0a', '#20140f', '#2e1d15', '#40291d', '#553827'];
  return mk(W, H, (p) => {
    const cx = 13, by = H - 1;
    dustPatch(p, cx, by - 1, 11, 2, 720 + v);
    const tips = [];
    const grow = (x, y, a, len, depth) => {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      p.line(x, y, x1, y1, depth === 0 ? BR[2] : BR[1 + (depth % 2)]);
      if (depth === 0) p.line(x + 1, y, x1 + 1, y1, BR[1]);
      // Lichtkante links oben
      if (Math.cos(a) < 0.2) p.px(Math.round((x + x1) / 2), Math.round((y + y1) / 2) - 1, BR[4]);
      // Dornen
      const steps = Math.round(len / 2);
      for (let s = 1; s < steps; s++) {
        const t = s / steps, tx = Math.round(x + (x1 - x) * t), ty = Math.round(y + (y1 - y) * t);
        if (hash2(tx, ty, 721 + v) < 0.55) p.px(tx + (s % 2 ? 1 : -1), ty - 1, s % 2 ? '#7a5e48' : BR[4]);
      }
      if (depth < 2) {
        const k = depth === 0 ? 2 : rng.int(1, 2);
        for (let i = 0; i < k; i++) grow(x1, y1, a + rng.range(-0.7, 0.7), len * rng.range(0.45, 0.7), depth + 1);
      } else tips.push([Math.round(x1), Math.round(y1)]);
    };
    const spread = [1.3, 0.7, 1.5][v], hh = [0.95, 1.15, 0.7][v];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 5 - 0.5) * 2 * spread + rng.range(-0.2, 0.2);
      grow(cx + rng.int(-2, 2), by - 1, a, rng.range(6, 9) * hh, 0);
    }
    // vertrocknete Blätter an den Spitzen
    const LV = v === 1 ? ['#3a2a16', '#5a4020', '#7a5a2c'] : ['#2a2c16', '#40421e', '#5a5a28'];
    for (const [x, y] of tips) {
      if (hash2(x, y, 9) < 0.35) continue;
      p.px(x, y, LV[1]); if (x < cx) p.px(x - 1, y - 1, LV[2]); else p.px(x + 1, y, LV[0]);
    }
    if (v === 1) {
      // rote Dornbeeren
      for (let i = 0; i < 6; i++) { const [x, y] = tips[rng.int(0, tips.length - 1)]; p.px(x, y + 1, CRIM[3]); p.px(x - 1, y + 1, CRIM[4]); p.px(x, y + 2, CRIM[1]); }
    }
    if (v === 2) {
      // verfangener Stofffetzen (rot) und Tierschädel darunter
      p.line(16, by - 9, 20, by - 7, RED[3]); p.px(21, by - 7, RED[2]); p.px(17, by - 8, RED[4]); p.px(19, by - 6, RED[2]); p.px(20, by - 5, RED[1]);
      p.rect(4, by - 3, 4, 3, BONE[4]); p.px(4, by - 3, BONE[5]); p.px(5, by - 2, BONE[1]); p.px(7, by - 2, BONE[2]); p.px(8, by - 1, BONE[3]);
    }
    // Asche/Staub auf den Oberkanten
    for (let i = 0; i < 6; i++) { const [x, y] = tips[rng.int(0, tips.length - 1)]; p.px(x, y - 1, ASH[3]); }
  }, { ax: 13, box: [-4, -3, 4, 1] });
}

// ------------------------------------------------------------ Findlinge
function boulder(v) {
  const rng = createRng(740 + v);
  const [W, H] = [[22, 17], [30, 22], [16, 12]][v];
  return mk(W, H, (p) => {
    const cx = W / 2, by = H - 1;
    dustPatch(p, Math.floor(cx), by - 1, Math.floor(W / 2) - 1, 2, 740 + v);
    const lumps = [
      [[cx, by - 6.5, 9.5, 6.8]],
      [[cx + 4, by - 8.5, 10, 8.5], [cx - 7, by - 4.5, 6.5, 4.8]],
      [[cx, by - 4.5, 6.8, 4.6]],
    ][v];
    const tops = [];
    lumps.forEach(([x, y, rx, ry], k) => {
      const top = shadeLump(p, x, y, rx, ry, SST.slice(1), 741 + v * 7 + k, { rough: 0.14, flat: 0.25, rim: SST[3] });
      tops.push(top);
      // Schichtlinien (Sedimentgestein, leicht geneigt)
      for (let s = 1; s <= 2; s++) {
        const yy = y - ry * 0.2 + s * ry * 0.35;
        for (let xx = Math.round(x - rx + 2); xx < x + rx - 1; xx++) {
          const yl = Math.round(yy + (xx - x) * 0.12 + Math.sin(xx * 0.8) * 0.5);
          if (top.has(xx) && yl > top.get(xx) + 1 && hash2(xx, s, 742) < 0.8) p.px(xx, yl, SST[2]);
        }
      }
      // Riss
      const rx0 = Math.round(x + rx * 0.2);
      let yy = Math.round(y - ry * 0.7), xx = rx0;
      for (let i = 0; i < ry * 1.2; i++) { p.px(xx, yy, SST[1]); if (i % 2) p.px(xx - 1, yy, SST[5]); yy++; if (hash2(i, k, 743 + v) < 0.4) xx++; }
    });
    // Oberseiten: Asche, Flechten
    tops.forEach((top, k) => {
      for (const [x, y] of top) {
        const h = hash2(x, y, 744 + k);
        if (h < 0.7) p.px(x, y, x < lumps[k][0] + 2 ? ASH[4] : ASH[3]);
        if (h < 0.35 && x < lumps[k][0]) p.px(x, y + 1, ASH[3]);
      }
      for (let i = 0; i < 4 + v; i++) {
        const [x, y] = [...top][rng.int(0, top.size - 1)];
        const c = rng.pick(LICH);
        p.px(x, y + 2, c); if (rng.chance(0.6)) p.px(x + 1, y + 2, c); if (rng.chance(0.4)) p.px(x, y + 3, LICH[0]);
      }
    });
    footGrass(p, rng, 1, W - 2, by, 4 + v * 2);
  }, { ax: Math.floor(W / 2), box: [-Math.floor(W / 2) + 2, -4, Math.floor(W / 2) - 2, 1] });
}

// ------------------------------------------------------------ Gebleichte Knochen
function boneShade(x, y, rel, seed) {
  // rel: 0 = Lichtseite, 1 = Schattenseite
  let i = rel < 0.25 ? 5 : rel < 0.55 ? 4 : rel < 0.8 ? 3 : 2;
  const h = hash2(x, y, seed);
  if (h < 0.08) i -= 1; else if (h > 0.95) i += 1;
  return BONE[clampI(i, BONE.length)];
}

// Dicker Knochenstrang entlang eines Pfads, Breite w(t), Licht von links oben
function boneStroke(p, pts, w0, w1, seed, far = false) {
  const N = 40;
  const at = (t) => {
    const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
  };
  for (let s = 0; s <= N; s++) {
    const t = s / N, [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.02));
    let nx = -(y2 - y), ny = x2 - x; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    const w = w0 + (w1 - w0) * t;
    for (let k = -w / 2; k <= w / 2; k += 0.5) {
      const px = Math.round(x + nx * k), py = Math.round(y + ny * k);
      // Lichtseite = Normale zeigt nach links oben
      const facing = -(nx * Math.sign(k || 1)) * 0.6 - (ny * Math.sign(k || 1)) * 0.8;
      const rel = 0.5 - facing * (Math.abs(k) / (w / 2 + 0.01)) * 0.5;
      p.px(px, py, far ? BONE[clampI(Math.round(3 - rel * 2), 7)] : boneShade(px, py, rel, seed));
    }
  }
}

function giantRibs() {
  const W = 58, H = 42;
  return mk(W, H, (p) => {
    const by = H - 1;
    dustPatch(p, 29, by - 2, 27, 3, 761);
    // Wirbelsäule oben: Bogen von links unten bis rechts, hinten gebrochen
    const spine = (x) => by - 4 - Math.sin(Math.min(1, Math.max(0, (x - 3) / 50)) * Math.PI) * 30;
    // hintere Rippen (andere Körperseite), dunkler, leicht versetzt
    for (let k = 0; k < 5; k++) {
      const sx = 13 + k * 8, sy = spine(sx);
      boneStroke(p, [[sx + 2, sy + 1], [sx + 7, sy + 10], [sx + 8, by - 8], [sx + 6, by - 3]], 2.5, 1.5, 770 + k, true);
    }
    // Wirbel
    for (let x = 4; x <= 52; x += 3) {
      const y = Math.round(spine(x));
      p.ellipse(x, y, 1.6, 2, BONE[3]); p.px(x - 1, y - 1, BONE[5]); p.px(x + 1, y + 1, BONE[2]);
      // Dornfortsatz
      if (x > 8 && x < 50) { p.line(x, y - 2, x - 1, y - 4 - (x % 2), BONE[4]); p.px(x, y - 3, BONE[2]); }
    }
    // vordere Rippen: vom Rückgrat nach vorn gewölbt, Enden im Boden
    for (let k = 0; k < 5; k++) {
      const sx = 11 + k * 8, sy = spine(sx);
      const len = by - 1 - sy;
      boneStroke(p, [[sx, sy + 1], [sx - 6, sy + len * 0.32], [sx - 7, sy + len * 0.7], [sx - 4, by - 1]], 4.2, 2.2, 780 + k);
      // Erdhaufen am Rippenende
      p.ellipse(sx - 4, by - 1, 3, 1.2, DUST[3]); p.px(sx - 6, by - 2, DUST[2]); p.px(sx - 2, by - 1, STRAW[3]);
      // Risse und Bruchstellen
      if (k === 3) { p.px(sx - 7, sy + len * 0.55, BONE[1]); p.px(sx - 6, sy + len * 0.55 + 1, BONE[1]); }
      blade(p, sx - 7, by - 1, 3 + (k % 3), -1, STRAW, 1, 4);
      blade(p, sx - 2, by - 1, 2 + (k % 2), 1, STRAW, 1, 3);
    }
    // gebrochene Rippe liegt davor
    boneStroke(p, [[40, by - 2], [47, by - 3], [53, by - 1]], 2.6, 1.8, 790);
    // Asche in den Kerben
    for (let i = 0; i < 18; i++) { const x = 4 + ((i * 29) % 50), y = Math.round(spine(x)) - 1; p.px(x, y, ASH[4]); }
    for (let i = 0; i < 8; i++) { const x = 6 + ((i * 37) % 46); blade(p, x, by, 2 + (i % 3), (i % 2 ? 1 : -1), STRAW, 2, 5); }
  }, { ax: 29, extra: { boxes: [[-23, -4, -17, 1], [-7, -4, -1, 1], [9, -4, 15, 1]] } });
}

function giantSkull() {
  const W = 50, H = 30;
  return mk(W, H, (p) => {
    const by = H - 1;
    dustPatch(p, 25, by - 2, 23, 3, 795);
    // Wirbelkette nach rechts (halb vergraben)
    for (let i = 0; i < 5; i++) { const x = 36 + i * 3, y = by - 4 + (i >> 1); p.ellipse(x, y, 1.6, 2, BONE[3]); p.px(x - 1, y - 1, BONE[5]); p.px(x + 1, y + 1, BONE[1]); }
    // Hinterhaupt/Schädeldecke
    shadeLump(p, 28, by - 10, 10, 8, BONE.slice(1), 796, { rough: 0.05, flat: 0.3, rim: BONE[3] });
    // Schnauze nach links, flacher
    poly(p, [[20, by - 15], [8, by - 10], [4, by - 6], [5, by - 3], [20, by - 3], [24, by - 8]], (x, y) => boneShade(x, y, (y - (by - 15)) / 12 + (x > 16 ? 0.15 : 0), 797));
    // Oberkante Schnauze (Licht)
    p.line(8, by - 10, 19, by - 15, BONE[6]); p.line(9, by - 9, 19, by - 14, BONE[5]);
    // Nasenloch, Augenhöhle
    p.ellipse(7, by - 7, 1.2, 1, INTERIOR); p.px(6, by - 8, BONE[1]);
    p.ellipse(23, by - 11, 3, 2.4, INTERIOR); p.px(22, by - 12, '#1a1410'); p.line(20, by - 14, 26, by - 14, BONE[6]);
    p.px(25, by - 9, BONE[2]);
    // Zähne
    for (let x = 6; x < 20; x += 2) { p.px(x, by - 3, BONE[5]); p.px(x, by - 2, BONE[3]); p.px(x + 1, by - 3, BONE[2]); }
    // gewundenes Horn
    const horn = [];
    for (let t = 0; t <= 1; t += 0.03) { const a = -0.3 - t * 3.6, r = 9 - t * 6; horn.push([31 + Math.cos(a) * r, by - 17 + Math.sin(a) * r * 0.8]); }
    boneStroke(p, horn, 4, 1, 798);
    for (let i = 2; i < horn.length - 3; i += 4) { const [x, y] = horn[i]; p.px(x, y, BONE[2]); }
    // Risse
    p.line(30, by - 16, 33, by - 11, BONE[1]); p.line(33, by - 11, 32, by - 8, BONE[1]);
    // Grasbüschel und Staub vorn
    for (let i = 0; i < 9; i++) blade(p, 3 + i * 5, by, 2 + (i % 3), (i % 2 ? 1 : -1), STRAW, 1, 4);
    p.px(26, by - 18, ASH[4]); p.px(29, by - 18, ASH[4]); p.px(24, by - 17, ASH[3]);
  }, { ax: 25, box: [-20, -5, 18, 1] });
}

// ------------------------------------------------------------ Menhire
const RUNE_PATH = [[0, 0], [0, 1], [0, 2], [1, 3], [2, 2], [2, 1], [1, 0], [0, 4], [0, 5], [1, 6], [2, 6]];
function carve(p, x, y, pts, dark, light) { for (const [dx, dy] of pts) { p.px(x + dx, y + dy, dark); } for (const [dx, dy] of pts) if (!pts.some(([a, b]) => a === dx && b === dy + 1)) p.px(x + dx, y + dy + 1, light); }

function menhir(p, x0, x1, top, bot, lean, seed, runes = true) {
  const w = x1 - x0;
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / (bot - top);
    const shift = Math.round((1 - t) * lean);
    const inset = t < 0.12 ? Math.round((0.12 - t) * 22) : 0;
    const l = x0 + shift + Math.round(inset * 0.6) + (t > 0.9 ? -1 : 0), r = x1 + shift - inset + (t > 0.9 ? 1 : 0);
    for (let x = l; x <= r; x++) {
      const rel = (x - l) / Math.max(1, r - l);
      let i = rel < 0.15 ? 6 : rel < 0.45 ? 5 : rel < 0.75 ? 4 : rel < 0.92 ? 3 : 2;
      if (y === top + Math.round(inset * 0) && t < 0.05) i = 6;
      const h = hash2(x, y, seed);
      if (h < 0.1) i -= 1; else if (h > 0.96) i += 1;
      if (((y * 3 + x) % 11 === 0) && rel > 0.3) i -= 1;
      p.px(x, y, SST[clampI(i, SST.length)]);
    }
    // Randlicht rechts
    if (t > 0.2 && hash2(0, y, seed + 1) < 0.5) p.px(r, y, SST[3]);
  }
  if (runes) {
    const mx = Math.round((x0 + x1) / 2 - 1 + lean * 0.4);
    carve(p, mx, top + Math.round((bot - top) * 0.28), RUNE_PATH, SST[1], SST[6]);
  }
  // Flechten
  for (let i = 0; i < 6; i++) { const x = x0 + Math.round(hash2(i, 1, seed) * w), y = top + 2 + Math.round(hash2(i, 2, seed) * (bot - top) * 0.7); p.px(x, y, LICH[i % 4]); if (i % 2) p.px(x + 1, y, LICH[(i + 1) % 4]); }
  // Asche auf der Kappe
  for (let x = x0; x <= x1; x++) if (hash2(x, 0, seed + 2) < 0.6) p.px(x + Math.round(lean), top + (x === x0 || x === x1 ? 2 : 0), ASH[4]);
}

function standingStone(v) {
  const rng = createRng(810 + v);
  if (v === 0) {
    const W = 18, H = 36;
    return mk(W, H, (p) => {
      const by = H - 1;
      dustPatch(p, 9, by - 1, 8, 2, 811);
      menhir(p, 5, 12, 2, by - 1, 1.5, 812);
      // Band aus geritzten Punkten
      for (let x = 6; x <= 12; x += 2) p.px(x, 20, SST[1]);
      footGrass(p, rng, 2, 15, by, 7);
    }, { ax: 9, box: [-4, -4, 4, 1] });
  }
  const W = 38, H = 34;
  return mk(W, H, (p) => {
    const by = H - 1;
    dustPatch(p, 19, by - 1, 17, 2, 813);
    // Trilithon: zwei Pfeiler + Deckstein, rechts leicht abgesackt
    menhir(p, 4, 10, 8, by - 1, 0, 814, false);
    menhir(p, 27, 33, 10, by - 1, 0, 815, false);
    // Deckstein
    const lint = (x, y) => { const rel = (y - 3) / 6; return SST[clampI(Math.round(6 - rel * 4 - (hash2(x, y, 816) < 0.1 ? 1 : 0)), 8)]; };
    poly(p, [[2, 4], [35, 6], [35, 12], [2, 10]], lint);
    p.line(2, 4, 35, 6, SST[7]); p.line(2, 10, 35, 12, SST[1]);
    for (let x = 6; x < 32; x += 5) carve(p, x, 6 + Math.round(x / 16), [[0, 0], [1, 1], [0, 2]], SST[1], SST[5]);
    // dunkler Durchblick unter dem Deckstein
    for (let y = 12; y < by - 1; y++) for (let x = 12; x < 27; x++) if (y < 14) p.px(x, y, SST[0]);
    // Opfersteine / Schalen dazwischen
    p.ellipse(19, by - 2, 4, 1.4, SST[3]); p.ellipse(19, by - 3, 3, 1, SST[4]); p.px(19, by - 3, BONE[4]); p.px(20, by - 3, BONE[3]);
    for (let x = 0; x < 3; x++) carve(p, 6 + x * 0, 16 + x * 6, RUNE_PATH.slice(0, 4), SST[1], SST[6]);
    carve(p, 29, 18, RUNE_PATH, SST[1], SST[6]);
    footGrass(p, rng, 1, 36, by, 12);
  }, { ax: 19, extra: { boxes: [[-16, -4, -8, 1], [8, -4, 15, 1]] } });
}

// ------------------------------------------------------------ Jurte
function yurt() {
  const W = 46, H = 38;
  return mk(W, H, (p, g) => {
    const cx = 23, by = H - 1, rw = 19, ry = 4;
    const wallTop = by - 16, wallBot = by - 5;
    dustPatch(p, cx, by - 2, 21, 3, 831);
    // Wand (Filz) mit Gurtbändern
    cylWall(p, cx, rw, wallTop, wallBot, ry, (x, y, rel, s, dy, hgt) => {
      let i = litIdx(rel, s, 6) + 1;
      if (hash2(x, y, 832) < 0.1) i -= 1;
      if ((x * 7 + y * 3) % 13 === 0) i -= 1; // Filzflecken
      let c = FELT[clampI(i, 7)];
      if (dy === 1 || dy === 2) c = i > 3 ? RED[4] : i > 2 ? RED[3] : RED[2]; // Zierband oben
      if (dy === 2 && (x % 4 === 0)) c = GOLD[i > 3 ? 3 : 2];
      if (dy === Math.round(hgt * 0.55) || dy === hgt - 2) c = HIDE[clampI(i - 1, 6)]; // Gurte
      if (dy === hgt) c = FELT[clampI(i - 3, 7)];
      return c;
    });
    // Dach: flacher Kegel, überstehend
    const crownY = by - 33, rr = rw + 2;
    for (let x = Math.ceil(cx - rr); x <= Math.floor(cx + rr); x++) {
      const rel = (x + 0.5 - cx) / rr; if (Math.abs(rel) > 1) continue;
      const s = Math.sqrt(1 - rel * rel);
      const eave = Math.round(wallTop + s * ry) + 1;
      const topY = Math.round(crownY + Math.pow(Math.abs(rel), 1.25) * (wallTop - crownY - 2) - s * 1);
      for (let y = topY; y <= eave; y++) {
        const k = (y - topY) / Math.max(1, eave - topY);
        let i = litIdx(rel * 0.9, 0.6 + k * 0.3, 7);
        const ang = Math.atan2(y - crownY, (x - cx) * 0.8);
        if (Math.abs(Math.sin(ang * 6)) < 0.08) i -= 1; // Dachsparren unter dem Filz
        if (hash2(x, y, 833) < 0.08) i -= 1;
        if (y === eave) i = Math.max(0, i - 3);
        p.px(x, y, FELT[clampI(i, 7)]);
      }
      // Asche auf dem Dach (Lichtseite)
      if (rel < 0.3 && hash2(x, 0, 834) < 0.55) p.px(x, topY, ASH[5]);
    }
    // Spannseile über das Dach (zwei Bögen)
    for (const off of [-0.45, 0.45]) {
      for (let t = -1; t <= 1; t += 0.04) {
        const x = cx + t * rr * 0.98, s = Math.sqrt(Math.max(0, 1 - t * t));
        const y = crownY + Math.pow(Math.abs(t), 1.25) * (wallTop - crownY - 2) - s + 3 + off * 0 + Math.abs(t - off) * 0;
        if (Math.abs(t - off) < 0.5) p.px(Math.round(x), Math.round(y + (0.5 - Math.abs(t - off)) * 4), HIDE[2]);
      }
    }
    // Dachkranz (Rauchloch) mit Holzring
    p.ellipse(cx, crownY + 1, 4, 1.6, GW[2]); p.ellipse(cx, crownY + 1, 3, 1, INTERIOR); p.line(cx - 4, crownY + 1, cx - 3, crownY, GW[5]); p.px(cx + 4, crownY + 1, GW[1]);
    p.px(cx - 1, crownY + 1, EMB[1]); g.px(cx - 1, crownY + 1, EMB[2]);
    // Tür: bemalte Holztür mit Rahmen
    const dx0 = cx - 4, dTop = wallTop + ry + 2, dBot = wallBot + ry;
    p.rect(dx0 - 1, dTop - 1, 10, dBot - dTop + 2, GW[1]); p.rect(dx0 - 1, dTop - 1, 10, 1, GW[5]); p.rect(dx0 - 1, dTop - 1, 1, dBot - dTop + 2, GW[4]);
    for (let y = dTop; y <= dBot; y++) for (let x = dx0; x < dx0 + 8; x++) {
      let c = x < dx0 + 4 ? '#8a3a1c' : '#6a2a14';
      if (x === dx0 + 4 || x === dx0 + 3) c = '#4a1c0e';
      if (x === dx0) c = '#a2502a';
      p.px(x, y, c);
    }
    // Knotenmuster auf der Tür
    for (const [x, y] of [[1, 2], [2, 1], [2, 3], [1, 4], [5, 2], [6, 1], [6, 3], [5, 4], [1, 7], [2, 8], [5, 7], [6, 8]]) p.px(dx0 + x, dTop + y, GOLD[y % 2 ? 3 : 2]);
    p.px(dx0 + 3, dTop + 6, GOLD[4]);
    // Filzvorhang hochgerollt über der Tür
    p.rect(dx0 - 2, dTop - 3, 12, 2, FELT[4]); p.rect(dx0 - 2, dTop - 3, 12, 1, FELT[5]); p.px(dx0 - 2, dTop - 1, FELT[2]); p.px(dx0 + 9, dTop - 1, FELT[2]);
    // Sattel auf Gestell rechts, Wasserschlauch links
    const sx = cx + 12, sy = by - 5;
    p.line(sx - 2, sy, sx - 2, sy + 4, GW[3]); p.line(sx + 3, sy, sx + 3, sy + 4, GW[2]); p.rect(sx - 3, sy - 1, 8, 1, GW[4]);
    p.ellipse(sx + 1, sy - 2, 3.5, 1.8, HIDE[3]); p.px(sx - 1, sy - 3, HIDE[5]); p.rect(sx - 3, sy - 2, 1, 3, HIDE[2]); p.px(sx + 4, sy - 3, HIDE[4]);
    p.ellipse(cx - 13, by - 5, 2, 2.5, HIDE[3]); p.px(cx - 14, by - 7, HIDE[5]); p.px(cx - 13, by - 8, GW[2]);
    footGrassSeeded(p, 835, 1, W - 2, by, 8);
  }, { ax: 23, box: [-18, -7, 18, 1], extra: { smoke: { dx: 0, dy: -33, rate: 2.2 } } });
}
function footGrassSeeded(p, seed, x0, x1, y, n) { footGrass(p, createRng(seed), x0, x1, y, n); }

// ------------------------------------------------------------ Kriegsherrenzelt (Pavillon)
function warTent() {
  const W = 64, H = 54;
  return mk(W, H, (p, g) => {
    const cx = 32, by = H - 1, rw = 25, ry = 5;
    const wallTop = by - 20, wallBot = by - 6;
    dustPatch(p, cx, by - 2, 29, 3, 841);
    // Wände: rot-schwarze Bahnen
    cylWall(p, cx, rw, wallTop, wallBot, ry, (x, y, rel, s, dy, hgt) => {
      const lit = litIdx(rel, s, 6);
      const stripe = Math.floor((Math.asin(Math.max(-1, Math.min(1, rel))) + 2) * 3.2) % 2;
      const R = stripe ? RED : ['#0b080a', '#141013', '#1d181c', '#282126', '#342b31', '#40353c'];
      let i = lit;
      if (hash2(x, y, 842) < 0.08) i -= 1;
      if (dy === hgt) i -= 2;
      return R[clampI(i, 6)];
    });
    // Goldene Borte unten
    cylWall(p, cx, rw, wallBot - 1, wallBot - 1, ry, (x, y, rel, s) => (x % 3 === 0 ? GOLD[1] : GOLD[litIdx(rel, s, 4)]));
    // Eingang: zurückgeschlagene Bahnen, warmes Innenlicht
    const eTop = wallTop + ry + 1, eBot = wallBot + ry;
    poly(p, [[cx - 7, eBot + 1], [cx - 3, eTop], [cx + 4, eTop], [cx + 8, eBot + 1]], (x, y) => ((x + y) % 5 === 0 ? '#2a120a' : '#1a0a06'));
    for (let y = eTop + 4; y <= eBot; y++) for (let x = cx - 3; x <= cx + 3; x++) if (hash2(x, y, 843) < 0.25 + (y - eTop) * 0.03) { p.px(x, y, EMB[1]); g.px(x, y, (y > eBot - 3 && hash2(x, y, 844) < 0.5) ? EMB[3] : EMB[1]); }
    // Thron/Fell-Andeutung im Inneren
    p.rect(cx - 2, eBot - 5, 5, 5, '#2a1a10'); p.rect(cx - 2, eBot - 6, 5, 1, GOLD[2]); p.px(cx, eBot - 7, GOLD[3]);
    // Klappen
    poly(p, [[cx - 3, eTop], [cx - 9, eBot + 1], [cx - 6, eBot + 1]], RED[4]); p.line(cx - 3, eTop, cx - 8, eBot, RED[5]);
    poly(p, [[cx + 4, eTop], [cx + 10, eBot + 1], [cx + 7, eBot + 1]], RED[2]); p.line(cx + 4, eTop, cx + 9, eBot, RED[1]);
    // Dach: spitzer Kegel mit Streifen
    const crownY = 4, rr = rw + 2;
    for (let x = Math.ceil(cx - rr); x <= Math.floor(cx + rr); x++) {
      const rel = (x + 0.5 - cx) / rr; if (Math.abs(rel) > 1) continue;
      const s = Math.sqrt(1 - rel * rel);
      const eave = Math.round(wallTop + s * ry) + 1;
      const topY = Math.round(crownY + Math.abs(rel) * (wallTop - crownY - 1) - s * 1.5);
      for (let y = topY; y <= eave; y++) {
        let i = litIdx(rel * 0.85, 0.7, 6);
        const ang = (x - cx) / Math.max(1, y - crownY + 1);
        const stripe = Math.floor(ang * 5 + 50) % 2;
        const R = stripe ? RED : ['#0b080a', '#141013', '#1d181c', '#282126', '#342b31', '#40353c'];
        if (hash2(x, y, 845) < 0.07) i -= 1;
        p.px(x, y, R[clampI(i, 6)]);
      }
    }
    // Zackensaum (Valance) mit Goldspitzen
    for (let x = Math.ceil(cx - rr); x <= Math.floor(cx + rr); x++) {
      const rel = (x + 0.5 - cx) / rr; if (Math.abs(rel) > 1) continue;
      const s = Math.sqrt(1 - rel * rel), y0 = Math.round(wallTop + s * ry) + 1;
      const tooth = 3 - Math.abs(((x + 64) % 6) - 3);
      const i = litIdx(rel, s, 6);
      for (let y = y0 - 1; y <= y0 + tooth; y++) p.px(x, y, RED[clampI(i + (y === y0 - 1 ? 1 : 0), 6)]);
      p.px(x, y0 + tooth, tooth === 3 ? GOLD[3] : RED[clampI(i - 2, 6)]);
    }
    // Knauf + Wimpel
    p.line(cx, 0, cx, crownY, GW[4]); p.rect(cx - 1, crownY - 1, 3, 2, GOLD[3]); p.px(cx - 1, crownY - 1, GOLD[4]);
    p.rect(cx + 1, 0, 7, 2, RED[4]); p.px(cx + 8, 0, RED[3]); p.px(cx + 9, 1, RED[2]); p.rect(cx + 1, 2, 5, 1, RED[2]);
    // Speere mit Schädeln links und rechts vom Eingang
    for (const [sx, dir] of [[cx - 15, -1], [cx + 15, 1]]) {
      p.line(sx, by - 30, sx, by - 1, GW[3]); p.line(sx + 1, by - 30, sx + 1, by - 1, GW[1]);
      p.px(sx, by - 33, IRON[4]); p.line(sx, by - 32, sx, by - 31, IRON[3]); p.px(sx + 1, by - 31, IRON[2]);
      // Schädel
      const ky = by - 27; p.rect(sx - 1, ky, 4, 3, BONE[4]); p.px(sx - 1, ky, BONE[5]); p.px(sx, ky + 1, INTERIOR); p.px(sx + 2, ky + 1, INTERIOR); p.rect(sx, ky + 3, 2, 1, BONE[2]);
      // Hörner
      p.line(sx - 1, ky, sx - 3, ky - 2, BONE[3]); p.line(sx + 2, ky, sx + 4, ky - 2, BONE[2]);
      // Rosshaar
      for (let i = 0; i < 4; i++) p.line(sx - 1 + i, ky + 4, sx - 2 + i + dir, ky + 10 + (i % 2), HAIR[2 + (i % 2)]);
    }
    // Kohlebecken vorn
    const bx = cx + 20, byy = by - 3;
    p.line(bx - 3, byy, bx - 1, byy - 4, IRON[1]); p.line(bx + 3, byy, bx + 1, byy - 4, IRON[1]);
    p.rect(bx - 3, byy - 6, 7, 2, IRON[2]); p.rect(bx - 3, byy - 6, 7, 1, IRON[3]);
    for (let x = bx - 2; x <= bx + 2; x++) { p.px(x, byy - 7, EMB[3]); g.px(x, byy - 7, EMB[4]); }
    p.px(bx, byy - 8, EMB[4]); g.px(bx, byy - 8, EMB[5]); g.px(bx - 1, byy - 9, EMB[3]);
  }, {
    ax: 32, box: [-24, -8, 24, 1],
    light: { dx: 20, dy: -12, radius: 70, color: [255, 150, 70], intensity: 0.85 },
    extra: { embers: { dx: 20, dy: -12, rate: 1.5 } },
  });
}

// ------------------------------------------------------------ Palisade (Steppe)
function stakeLog(p, x, yTop, yBot, seed) {
  for (let y = yTop + 2; y <= yBot; y++) {
    const h = hash2(x, y, seed);
    p.px(x, y, h < 0.1 ? GW[4] : GW[5]); p.px(x + 1, y, h > 0.85 ? GW[2] : GW[4]); p.px(x + 2, y, GW[2]);
    if ((y + x) % 7 === 0) p.px(x + 1, y, GW[3]);
  }
  p.px(x + 1, yTop, GW[6]); p.px(x, yTop + 1, GW[6]); p.px(x + 1, yTop + 1, GW[5]); p.px(x + 2, yTop + 1, GW[3]);
}

function palisadeH() {
  const W = 16, H = 28;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    for (let i = 0; i < 4; i++) {
      const x = i * 4, top = [2, 0, 3, 1][i];
      stakeLog(p, x, top, bottom, 851);
      p.px(x + 3, bottom - 2, '#0c0808');
    }
    // Rohhaut-Zurrungen an zwei Riegeln
    for (const y of [8, 19]) {
      p.rect(0, y, 16, 2, GW[2]); p.rect(0, y, 16, 1, GW[4]);
      for (let x = 1; x < 16; x += 4) { p.px(x, y - 1, HIDE[4]); p.px(x, y, HIDE[3]); p.px(x, y + 1, HIDE[2]); p.px(x, y + 2, HIDE[1]); }
    }
    // Fellfetzen über einem Pfahl
    p.rect(9, 3, 3, 4, HIDE[3]); p.px(9, 3, HIDE[5]); p.px(11, 7, HIDE[2]); p.px(9, 7, HIDE[3]);
    for (let x = 0; x < 16; x++) if (hash2(x, 3, 852) < 0.6) p.px(x, bottom, DUST[hash2(x, 4, 852) < 0.5 ? 2 : 3]);
    for (let x = 0; x < 16; x += 3) blade(p, x + (x % 2), bottom, 2 + (x % 3), (x % 2) ? 1 : -1, STRAW, 2, 5);
  }, { ax: 8, box: [-8, -3, 8, 1] });
}

function palisadeV() {
  const W = 8, H = 42;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    for (let k = 0; k < 5; k++) {
      const gy = bottom - 16 + k * 4, top = gy - 25 + [1, 0, 2, 0, 1][k];
      stakeLog(p, 2, top, gy, 853 + k);
      p.px(1, top + 3, GW[4]); p.px(5, top + 3, GW[1]);
    }
    for (let y = bottom - 32; y <= bottom - 2; y++) if (y % 11 === 0) { p.rect(1, y, 6, 2, GW[2]); p.px(1, y, GW[4]); p.px(3, y, HIDE[4]); p.px(3, y + 1, HIDE[2]); }
    for (let y = bottom - 2; y <= bottom; y++) p.rect(1, y, 6, 1, DUST[2]);
    blade(p, 1, bottom, 3, -1, STRAW, 2, 5); blade(p, 6, bottom, 2, 1, STRAW, 2, 4);
  }, { ax: 4, box: [-3, -16, 3, 1] });
}

// ------------------------------------------------------------ Wachturm (Steppe)
function watchtower() {
  const W = 44, H = 70;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 22, platY = 28;
    dustPatch(p, cx, bottom - 1, 18, 3, 861);
    // hintere Pfähle
    for (const x of [13, 30]) pole(p, x, platY, bottom - 5, 2, GW.slice(0, 4), 862);
    p.line(14, platY + 4, 30, bottom - 8, GW[1]); p.line(30, platY + 4, 14, bottom - 8, GW[1]);
    // vordere Pfähle (gespreizt, rund)
    const leg = (xa, xb) => { for (let y = platY; y <= bottom; y++) { const t = (y - platY) / (bottom - platY); const x = Math.round(xa + (xb - xa) * t); p.px(x, y, GW[5]); p.px(x + 1, y, GW[4]); p.px(x + 2, y, GW[2]); } };
    leg(8, 5); leg(33, 36);
    // Zurrungen an den Kreuzungen
    const lash = (x, y) => { p.rect(x - 1, y - 1, 3, 3, HIDE[3]); p.px(x - 1, y - 1, HIDE[5]); p.px(x + 1, y + 1, HIDE[1]); };
    p.line(10, platY + 3, 33, platY + 20, GW[4]); p.line(10, platY + 4, 33, platY + 21, GW[2]);
    p.line(33, platY + 3, 10, platY + 20, GW[3]);
    lash(21, platY + 12);
    p.line(9, platY + 22, 34, bottom - 2, GW[3]); p.line(34, platY + 22, 8, bottom - 2, GW[2]);
    lash(21, platY + 31);
    // Leiter aus Ästen
    for (let y = platY; y <= bottom; y++) { p.px(18, y, GW[5]); p.px(24, y, GW[3]); }
    for (let y = platY + 3; y < bottom; y += 4) { p.rect(19, y, 5, 1, GW[4]); p.px(19, y + 1, GW[1]); }
    // Plattform
    p.rect(3, platY - 3, 38, 4, GW[3]);
    for (let x = 3; x < 41; x += 3) p.px(x, platY - 3, GW[2]);
    p.rect(3, platY - 3, 38, 1, GW[5]); p.rect(3, platY + 1, 38, 1, GW[0]);
    // Brüstung: gespannte Häute zwischen Pfosten
    for (let x = 3; x < 41; x++) {
      const seg = Math.floor((x - 3) / 9), lx = (x - 3) % 9;
      for (let y = platY - 12; y < platY - 3; y++) {
        const sag = Math.round(Math.sin((lx / 9) * Math.PI) * 1);
        let i = 3 + (lx < 3 ? 1 : 0) - (lx > 6 ? 1 : 0);
        if (y < platY - 12 + sag) continue;
        if (hash2(x, y, 863) < 0.08) i--;
        p.px(x, y, (seg % 2 ? FELT : HIDE)[clampI(i, 6)]);
      }
      if (lx === 0) for (let y = platY - 14; y < platY - 2; y++) { p.px(x, y, GW[5]); p.px(x + 1, y, GW[2]); }
    }
    // gemaltes Clanzeichen (rote Klaue) auf der mittleren Haut
    p.line(19, platY - 10, 17, platY - 5, RED[4]); p.line(21, platY - 10, 20, platY - 5, RED[4]); p.line(23, platY - 10, 23, platY - 5, RED[3]);
    p.rect(2, platY - 14, 40, 1, GW[5]); p.rect(2, platY - 13, 40, 1, GW[1]);
    // Dachpfosten + Hautdach (Kegel)
    for (const x of [4, 38]) { p.rect(x, 12, 2, platY - 26, GW[4]); p.px(x, 12, GW[6]); }
    for (let y = 2; y <= 14; y++) {
      const k = (y - 2) / 12, hw = 2 + k * 20;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - cx) / hw;
        let i = rel < -0.3 ? 4 : rel < 0.35 ? 3 : 2;
        if ((x - cx + 40 + Math.round(y * rel * 0.8)) % 7 === 0) i -= 1; // Hautnähte
        if (hash2(x, y, 864) < 0.08) i -= 1;
        p.px(x, y, HIDE[clampI(i, 6)]);
      }
    }
    for (let x = cx - 22; x <= cx + 22; x++) p.px(x, 14 + (x % 3 === 0 ? 1 : 0), HIDE[1]);
    // Dachspitze mit Rosshaarschweif
    p.line(cx, 0, cx, 2, GW[5]); p.px(cx, 0, IRON[4]);
    for (let i = 0; i < 4; i++) p.line(cx + 1, 2, cx + 3 + i, 8 + i, HAIR[1 + (i % 3)]);
    // Asche auf dem Dach
    for (let i = 0; i < 14; i++) { const y = 4 + (i % 10), x = cx - 2 - Math.round((y / 13) * 15) + (i * 7) % 9; p.px(x, y, ASH[4]); }
    // Signalhorn an der Brüstung
    p.line(34, platY - 8, 40, platY - 11, BONE[4]); p.line(35, platY - 7, 40, platY - 10, BONE[2]); p.rect(40, platY - 12, 2, 3, BONE[5]); p.px(36, platY - 8, GOLD[3]);
    // Fackel an der linken Ecke
    const tx = 6, ty = platY - 18;
    p.line(tx, ty + 1, tx, platY - 13, GW[3]); p.rect(tx - 1, ty - 1, 3, 2, HIDE[1]);
    p.px(tx, ty - 2, EMB[4]); p.px(tx - 1, ty - 1, EMB[3]); p.px(tx + 1, ty - 1, EMB[2]); p.px(tx, ty - 3, EMB[3]);
    g.px(tx, ty - 2, EMB[5]); g.px(tx - 1, ty - 1, EMB[4]); g.px(tx + 1, ty - 1, EMB[3]); g.px(tx, ty - 3, EMB[4]); g.px(tx, ty - 4, EMB[2]);
  }, { ax: 22, box: [-15, -6, 15, 1], light: { dx: -16, dy: -45, radius: 64, color: [255, 160, 80], intensity: 0.8 } });
}

// ------------------------------------------------------------ Standarte (Rosshaar-Tug)
function bannerPole() {
  const W = 20, H = 48;
  return mk(W, H, (p) => {
    const bottom = H - 1, x0 = 5;
    // Steinhaufen am Fuß
    for (const [x, y, r] of [[3, bottom - 1, 2.4], [8, bottom - 1, 2.2], [5, bottom - 3, 2]]) { p.ellipse(x, y, r, r * 0.7, SST[3]); p.px(x - 1, y - 1, SST[6]); p.px(x, y - 1, SST[5]); }
    // Stange
    pole(p, x0, 7, bottom - 3, 2, GW.slice(1), 871);
    // Dreizack-Spitze
    p.line(x0, 0, x0, 5, IRON[4]); p.px(x0 + 1, 2, IRON[2]); p.line(x0 - 2, 1, x0 - 2, 4, IRON[3]); p.line(x0 + 2, 1, x0 + 2, 4, IRON[2]);
    p.rect(x0 - 2, 4, 5, 1, IRON[3]); p.rect(x0 - 1, 5, 3, 2, GOLD[2]); p.px(x0 - 1, 5, GOLD[4]);
    // Rosshaar-Kranz (schwarz)
    for (let i = 0; i < 8; i++) {
      const sx = x0 - 3 + i, len = 7 + ((i * 5) % 4);
      for (let k = 0; k < len; k++) p.px(sx + Math.round(Math.sin(k * 0.4 + i) * 0.6) + (k > len - 3 ? (i < 4 ? -1 : 1) : 0), 7 + k, HAIR[k < 2 ? 3 : i % 3 === 0 ? 4 : i % 2 ? 2 : 1]);
    }
    p.rect(x0 - 3, 7, 8, 1, GOLD[2]); p.px(x0 - 3, 7, GOLD[3]);
    // Schmales rotes Banner mit Wolfszahn-Zeichen
    const bx0 = x0 + 2, bx1 = x0 + 11, by0 = 17, by1 = 38;
    p.rect(x0, by0 - 1, 13, 1, GW[4]);
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.85 + 0.5);
      const low = by1 + Math.round(fold) - (x - bx0) % 3 + (x === bx1 ? -2 : 0);
      for (let y = by0; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 5; if (y === by0) i = 1;
        if (hash2(x, y, 872) < 0.05) i--;
        p.px(x, y, RED[i]);
      }
      p.px(x, low + 1, (x % 2) ? HAIR[2] : RED[1]);
    }
    const ex = Math.round((bx0 + bx1) / 2), ey = 23;
    // Wolfskopf-Zeichen (schwarz) mit Fang
    for (const [dx, dy] of [[-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0], [-2, -1], [2, -1], [-1, 2], [0, 2], [1, 2], [0, 3], [-1, 3], [0, 4]]) p.px(ex + dx, ey + dy, '#120608');
    p.px(ex - 1, ey + 1, GOLD[3]); p.px(ex + 1, ey + 1, GOLD[3]);
    p.line(ex - 2, ey + 7, ex + 2, ey + 7, '#120608'); p.px(ex - 1, ey + 8, BONE[5]); p.px(ex + 1, ey + 8, BONE[5]);
    // Knochenamulette an Schnüren
    p.line(x0 - 1, 14, x0 - 3, 20, HIDE[2]); p.rect(x0 - 4, 20, 2, 3, BONE[4]); p.px(x0 - 4, 20, BONE[5]);
  }, { ax: 5, box: [-3, -3, 4, 1] });
}

// ------------------------------------------------------------ Großes Lagerfeuer (Steppe)
function campfireBig() {
  const W = 38, H = 32;
  return mk(W, H, (p, g) => {
    const cx = 19, cy = H - 7;
    dustPatch(p, cx, cy + 2, 17, 4, 881);
    // Trockengestell mit Fleischstreifen hinten links
    p.line(2, cy - 16, 2, cy + 1, GW[4]); p.line(13, cy - 16, 13, cy - 2, GW[3]); p.line(1, cy - 15, 14, cy - 15, GW[5]);
    for (let i = 0; i < 4; i++) { const x = 4 + i * 3; p.line(x, cy - 14, x, cy - 9 - (i % 2), '#6a2a1c'); p.px(x, cy - 14, '#8a3a24'); p.px(x + 1, cy - 12, '#4a1a12'); }
    // Glutbett
    p.ellipse(cx, cy, 9, 3.2, '#1a0806');
    for (let i = 0; i < 30; i++) {
      const x = cx + Math.round(Math.cos(i * 2.4) * (i % 8)), y = cy + Math.round(Math.sin(i * 2.4) * (i % 8) * 0.35);
      p.px(x, y, i % 3 === 0 ? EMB[3] : i % 3 === 1 ? EMB[2] : EMB[1]); g.px(x, y, i % 3 === 0 ? EMB[4] : EMB[2]);
    }
    // Spieß mit Hammelkeule
    const sy = cy - 11;
    p.line(22, sy, 23, cy + 1, GW[4]); p.px(21, sy - 1, GW[4]); p.px(24, sy - 1, GW[4]);
    p.line(35, sy, 34, cy + 1, GW[3]); p.px(33, sy - 1, GW[3]); p.px(36, sy - 1, GW[3]);
    p.line(21, sy, 36, sy, IRON[2]); p.px(20, sy, IRON[4]);
    p.ellipse(29, sy, 4, 2.6, '#5a2a18'); p.ellipse(28, sy - 1, 2.5, 1.4, '#8a4a2a'); p.px(27, sy - 2, '#b87a4a'); p.px(31, sy + 2, '#3a1810');
    p.rect(32, sy - 1, 3, 2, BONE[4]); p.px(34, sy - 1, BONE[5]);
    // Scheite
    p.line(cx - 9, cy + 2, cx + 5, cy - 4, GW[2]); p.line(cx - 9, cy + 1, cx + 5, cy - 5, GW[5]);
    p.line(cx + 9, cy + 2, cx - 4, cy - 4, GW[1]); p.line(cx + 9, cy + 1, cx - 4, cy - 5, GW[4]);
    p.line(cx - 1, cy + 3, cx + 1, cy - 6, GW[3]);
    // Flammenzungen (groß)
    const fl = [[cx - 3, cy - 3, 5], [cx - 1, cy - 4, 8], [cx + 1, cy - 4, 7], [cx + 3, cy - 3, 4]];
    for (const [x, y, h] of fl) for (let i = 0; i < h; i++) {
      const c = i === 0 ? EMB[4] : i < h - 2 ? EMB[3] : EMB[2];
      const xx = x + (i % 3 === 2 ? 1 : 0) - (i % 5 === 4 ? 1 : 0);
      p.px(xx, y - i, c); g.px(xx, y - i, i < 3 ? EMB[5] : EMB[4]);
      if (i < h - 3) { p.px(xx + 1, y - i, EMB[3]); g.px(xx + 1, y - i, EMB[4]); }
    }
    // Steinring (vorn)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, x = cx + Math.cos(a) * 11, y = cy + Math.sin(a) * 4;
      if (Math.sin(a) < -0.25) continue;
      p.ellipse(x, y, 2, 1.4, SST[3]); p.px(x - 1, y - 1, SST[6]); p.px(x, y - 1, SST[5]);
    }
    // Schädelschale und Knochen daneben
    p.rect(3, cy + 2, 4, 2, BONE[4]); p.px(3, cy + 2, BONE[5]); p.px(6, cy + 3, BONE[2]); p.line(7, cy + 4, 11, cy + 3, BONE[3]);
  }, { ax: 19, ay: H - 3, box: [-10, -4, 10, 2], light: { dx: 0, dy: -9, radius: 116, color: [255, 150, 70], intensity: 1 }, extra: { embers: { dx: 0, dy: -12, rate: 3 } } });
}

// ------------------------------------------------------------ Heuballen
function hayBales() {
  const W = 34, H = 24;
  return mk(W, H, (p) => {
    const by = H - 1;
    dustPatch(p, 17, by - 1, 16, 2, 891);
    const bale = (x, y, w, h, seed) => {
      // Oberseite (3/4) + Front
      const tH = 3;
      for (let yy = y; yy < y + tH; yy++) for (let xx = x + 1; xx < x + w - (yy === y ? 1 : 0); xx++) {
        const i = (xx + yy * 3) % 4 === 0 ? 5 : 6 - (hash2(xx, yy, seed) < 0.3 ? 1 : 0);
        p.px(xx, yy, STRAW[i]);
      }
      for (let yy = y + tH; yy < y + tH + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const rel = (xx - x) / (w - 1);
        let i = rel < 0.15 ? 5 : rel < 0.6 ? 4 : rel < 0.9 ? 3 : 2;
        if (hash2(xx, yy >> 1, seed) < 0.22) i -= 1; // Halmstruktur (waagrecht)
        if (hash2(xx >> 1, yy, seed + 1) > 0.9) i += 1;
        if (yy === y + tH + h - 1) i -= 1;
        p.px(xx, yy, STRAW[clampI(i, 7)]);
      }
      // Schnüre
      for (const sx of [x + Math.round(w * 0.3), x + Math.round(w * 0.7)]) {
        for (let yy = y; yy < y + tH + h; yy++) p.px(sx, yy, yy < y + tH ? HIDE[3] : HIDE[2]);
      }
      // abstehende Halme
      for (let i = 0; i < 5; i++) { const xx = x + Math.round(hash2(i, 0, seed) * (w - 1)), yy = y + tH + Math.round(hash2(i, 1, seed) * h); p.px(xx + (i % 2 ? 1 : -1), yy, STRAW[6]); }
    };
    bale(2, by - 12, 14, 9, 892);
    bale(17, by - 11, 14, 8, 893);
    bale(8, by - 20, 15, 7, 894);
    // Heugabel
    p.line(28, 1, 31, by - 2, GW[4]); p.line(29, 1, 32, by - 2, GW[2]);
    p.line(26, 0, 28, 3, IRON[3]); p.line(28, 0, 29, 3, IRON[4]); p.line(30, 0, 30, 3, IRON[2]);
    // loses Heu am Boden
    for (let i = 0; i < 12; i++) { const x = 1 + ((i * 11) % 32), y = by - (i % 2); p.line(x, y, x + (i % 3) - 1, y - 1, STRAW[4 + (i % 3)]); }
    for (let i = 0; i < 5; i++) p.px(4 + i * 6, by - 21 + (i % 2), ASH[3]);
  }, { ax: 17, box: [-15, -8, 15, 1] });
}

// ------------------------------------------------------------ Offener Stall mit Pferd und Tränke
function stable() {
  const W = 64, H = 48;
  return mk(W, H, (p) => {
    const by = H - 1;
    dustPatch(p, 32, by - 2, 30, 3, 901);
    // Rückwand aus Brettern
    for (let y = 12; y <= by - 6; y++) for (let x = 5; x <= 58; x++) {
      const plank = Math.floor((x - 5) / 4), lx = (x - 5) % 4;
      let i = lx === 0 ? 1 : lx === 1 ? 3 : 2;
      if (hash2(plank, y >> 2, 902) < 0.15) i -= 1;
      if (y > by - 9) i -= 1;
      p.px(x, y, GW[clampI(i, 7)]);
    }
    // Schatten unter der Traufe
    for (let y = 12; y < 16; y++) for (let x = 5; x <= 58; x++) if (y < 14 || (x + y) % 2) p.px(x, y, GW[0]);
    // Stroh auf dem Boden
    for (let y = by - 7; y <= by - 3; y++) for (let x = 5; x <= 58; x++) if (hash2(x, y, 903) < 0.7) p.px(x, y, STRAW[hash2(x, y, 904) < 0.25 ? 3 : 2]);
    // mittlerer Pfosten (hinter dem Pferd)
    p.rect(33, 12, 2, by - 17, GW[3]); p.rect(34, 12, 1, by - 17, GW[1]);
    // Heuraufe an der Rückwand rechts
    p.rect(46, 16, 10, 7, GW[1]); for (let x = 46; x < 56; x += 2) p.line(x, 16, x, 22, GW[4]); p.rect(46, 15, 10, 1, GW[5]);
    for (let i = 0; i < 10; i++) p.px(46 + i, 14 - (i % 3 === 0 ? 1 : 0), STRAW[5 + (i % 2)]);
    // Pferd (Brauner), trinkt aus der Tränke
    const HR = ['#1a100a', '#2c1a10', '#442816', '#5e3a1f', '#7a4e2a', '#976639', '#b8844e'];
    shadeLump(p, 40, 29, 6, 5.6, HR.slice(1), 905, { rough: 0.02 });     // Hinterhand
    shadeLump(p, 33, 29, 8.5, 5, HR.slice(1), 906, { rough: 0.02 });     // Rumpf
    shadeLump(p, 26, 29, 4.5, 5, HR.slice(1), 907, { rough: 0.02 });     // Brust
    // Beine
    const legC = (x, y0) => { for (let y = y0; y <= by - 4; y++) { p.px(x, y, HR[3]); p.px(x + 1, y, HR[1]); } p.rect(x, by - 4, 2, 1, HAIR[1]); p.px(x, by - 5, BONE[3]); };
    legC(37, 33); legC(43, 32); legC(24, 33); legC(28, 33);
    p.px(24, 33, HR[5]); p.px(37, 33, HR[4]);
    // Hals nach unten zur Tränke
    poly(p, [[22, 24], [27, 25], [21, 34], [16, 32]], (x, y) => HR[clampI(4 - Math.round((x - 16) / 4) + (hash2(x, y, 908) < 0.1 ? -1 : 0), 7)]);
    p.line(22, 24, 16, 32, HR[5]);
    // Kopf
    poly(p, [[14, 31], [19, 33], [17, 39], [12, 37]], (x, y) => HR[clampI(5 - Math.round((x - 12) / 2.5), 7)]);
    p.line(12, 37, 17, 39, HR[1]); p.px(13, 38, HR[0]); p.line(15, 32, 13, 36, '#d8c8a8'); // Blesse p.px(15, 33, INTERIOR); p.px(14, 30, HR[4]); p.px(15, 29, HR[3]); // Auge, Ohr
    // Mähne und Schweif
    for (let i = 0; i < 9; i++) { const t = i / 8, x = Math.round(22 + (15 - 22) * t), y = Math.round(23 + (30 - 23) * t); p.px(x, y, HAIR[1]); p.px(x + 1, y - 1, HAIR[2 + (i % 2)]); }
    for (let i = 0; i < 10; i++) { p.px(46 + Math.round(i * 0.3), 25 + i, HAIR[i < 3 ? 3 : 1 + (i % 2)]); p.px(47 + Math.round(i * 0.3), 26 + i, HAIR[1]); }
    // Glanzlicht auf dem Rücken
    for (let x = 28; x < 42; x++) if (hash2(x, 1, 909) < 0.6) p.px(x, 24 + (x > 38 ? 0 : 1), HR[6]);
    // Sattelzeug: Decke
    p.rect(30, 24, 7, 6, RED[3]); p.rect(30, 24, 7, 1, RED[5]); p.rect(30, 29, 7, 1, GOLD[2]); p.px(36, 25, RED[2]);
    // Tränke vorn links (Holztrog mit Wasser)
    const tx0 = 6, tx1 = 22, ty = by - 7;
    p.rect(tx0, ty, tx1 - tx0, 2, '#122024'); for (let x = tx0; x < tx1; x++) if ((x * 3) % 7 === 0) p.px(x, ty, '#2a4a50'); p.px(15, ty + 1, '#4a7a80');
    p.rect(tx0 - 1, ty - 1, tx1 - tx0 + 2, 1, GW[5]);
    p.rect(tx0 - 1, ty + 2, tx1 - tx0 + 2, 4, GW[3]); p.rect(tx0 - 1, ty + 2, tx1 - tx0 + 2, 1, GW[4]); p.rect(tx0 - 1, ty + 5, tx1 - tx0 + 2, 1, GW[1]);
    for (const x of [tx0 + 2, tx1 - 3]) { p.rect(x, ty + 2, 1, 4, IRON[1]); p.px(x, ty + 2, IRON[3]); }
    p.rect(tx0 - 2, ty - 1, 1, 7, GW[5]); p.rect(tx1 + 1, ty - 1, 1, 7, GW[2]);
    // Pfosten und Balken
    for (const [x, c1, c2] of [[3, GW[5], GW[3]], [58, GW[4], GW[2]]]) { p.rect(x, 10, 2, by - 11, c1); p.rect(x + 1, 10, 1, by - 11, c2); }
    p.rect(3, 10, 58, 2, GW[3]); p.rect(3, 10, 58, 1, GW[5]);
    // Absperrholm (rechts vor dem Pferd, dahinter Stall-Hälfte)
    p.rect(46, by - 15, 13, 2, GW[4]); p.rect(46, by - 15, 13, 1, GW[6]);
    // Strohdach (Pultdach, 3/4-Sicht): Reihen mit heller Oberkante, ausgefranste Traufe
    for (let y = 0; y <= 12; y++) {
      const inset = Math.max(0, 3 - y);
      for (let x = inset; x < W - inset; x++) {
        const row = Math.floor((y + 1) / 3), ly = (y + 1) % 3;
        let i = 4 - Math.floor(y / 5);
        if (ly === 0) i = Math.max(1, i - 2); else if (ly === 1) i += 1;
        if ((x + row * 3) % 4 === 0 && ly !== 1) i -= 1;
        if (hash2(x, y, 910) < 0.1) i -= 1;
        if (x < 10) i += 1; else if (x > W - 8) i -= 1;
        p.px(x, y, STRAW[clampI(i, 7)]);
      }
    }
    // Traufe: hängende Halme
    for (let x = 0; x < W; x++) { const l = 1 + Math.round(hash2(x, 5, 912) * 2); for (let k = 0; k < l; k++) p.px(x, 13 + k, STRAW[k === 0 ? 3 : 2]); }
    // First mit Zurrung
    p.rect(3, 0, W - 6, 1, STRAW[6]); for (let x = 6; x < W - 6; x += 8) { p.px(x, 0, HIDE[3]); p.px(x, 1, HIDE[2]); }
    for (let i = 0; i < 12; i++) p.px(3 + i * 5, 2 + (i % 3) * 3, ASH[4]);
    // Hufeisen am Balken
    p.px(18, 12, IRON[3]); p.px(20, 12, IRON[3]); p.px(18, 13, IRON[2]); p.px(20, 13, IRON[2]); p.px(19, 14, IRON[3]);
    footGrassSeeded(p, 911, 1, W - 2, by, 10);
  }, { ax: 32, box: [-28, -8, 28, 1] });
}

// ------------------------------------------------------------ Nomadenwagen (Kibitka)
function cart() {
  const W = 50, H = 36;
  return mk(W, H, (p) => {
    const by = H - 1;
    dustPatch(p, 24, by - 1, 22, 2, 921);
    // Deichsel nach links unten
    p.line(0, by - 4, 12, by - 12, GW[4]); p.line(0, by - 3, 12, by - 11, GW[2]); p.rect(0, by - 6, 2, 4, GW[5]);
    // hinteres Rad (dunkel)
    p.ellipse(36, by - 8, 7.5, 8, GW[0]); p.ellipse(36, by - 8, 5.5, 6, '#0d0a0c');
    // Ladebrett
    p.rect(8, by - 16, 36, 6, GW[3]); p.rect(8, by - 16, 36, 1, GW[5]); p.rect(8, by - 11, 36, 1, GW[1]);
    for (let x = 8; x < 44; x += 6) p.rect(x, by - 15, 1, 4, GW[2]);
    // Hautplane als Tonnengewölbe mit Spriegeln
    for (let x = 10; x <= 42; x++) {
      const rel = (x - 26) / 16;
      const top = Math.round(by - 16 - Math.sqrt(Math.max(0, 1 - rel * rel * 0.25)) * 14);
      for (let y = top; y < by - 15; y++) {
        const k = (y - top) / Math.max(1, by - 16 - top);
        let i = 4 - Math.round(k * 2.2) + (x < 14 ? 1 : 0) - (x > 39 ? 1 : 0);
        if ((x - 10) % 6 === 0) i -= 1;
        if (hash2(x, y, 922) < 0.08) i -= 1;
        p.px(x, y, FELT[clampI(i, 7)]);
      }
      p.px(x, top, (x - 10) % 6 === 0 ? GW[5] : FELT[5]);
      if (hash2(x, 0, 923) < 0.5 && x < 30) p.px(x, top, ASH[4]);
    }
    // Stirnseite (links, offen): dunkle Öffnung mit Rahmen
    for (let y = by - 29; y < by - 15; y++) { const rel = (y - (by - 22)) / 7; const hw = Math.round(Math.sqrt(Math.max(0, 1 - rel * rel)) * 3); p.px(10, y, GW[5]); for (let x = 11; x < 11 + hw; x++) p.px(x, y, INTERIOR); }
    // Gepäck/Teppich hinten raus, rot
    p.rect(40, by - 20, 5, 5, RED[3]); p.rect(40, by - 20, 5, 1, RED[5]); p.px(42, by - 18, GOLD[3]); p.px(44, by - 16, RED[1]);
    // Wasserschlauch und Lanze an der Seite
    p.ellipse(20, by - 13, 2, 1.6, HIDE[4]); p.px(19, by - 14, HIDE[5]);
    p.line(12, by - 13, 44, by - 13, GW[5]);
    // großes Vorderrad
    const wx = 17, wy = by - 8;
    p.ellipse(wx, wy, 8, 8, GW[1]); p.ellipse(wx, wy, 7, 7, GW[3]); p.ellipse(wx, wy, 6, 6, '#0d0a0c');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.line(wx, wy, wx + Math.cos(a) * 6, wy + Math.sin(a) * 6, i < 5 ? GW[3] : GW[4]); }
    p.ellipse(wx, wy, 1.8, 1.8, GW[5]); p.px(wx, wy, IRON[3]);
    for (let i = 0; i < 8; i++) { const a = Math.PI + 0.25 + i * 0.22; p.px(wx + Math.round(Math.cos(a) * 8), wy + Math.round(Math.sin(a) * 8), GW[6]); }
    footGrassSeeded(p, 924, 1, W - 2, by, 8);
  }, { ax: 24, box: [-18, -6, 20, 1] });
}

// ------------------------------------------------------------ Kriegsstandarte (Schrein)
function warBanner(on) {
  const W = 26, H = 50;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 12;
    // Steinhügel (Cairn)
    const stones = [[6, bottom - 1, 3], [12, bottom - 1, 3.4], [18, bottom - 1, 3], [9, bottom - 4, 2.8], [15, bottom - 4, 2.8], [12, bottom - 6, 2.4]];
    for (const [x, y, r] of stones) { shadeLump(p, x, y, r, r * 0.7, SST.slice(1), 930 + x + y, { rough: 0.1 }); }
    // Feuerschalen links und rechts
    for (const bx of [3, 21]) {
      p.rect(bx - 2, bottom - 6, 5, 2, IRON[2]); p.rect(bx - 2, bottom - 6, 5, 1, IRON[3]); p.px(bx, bottom - 4, IRON[1]); p.line(bx - 1, bottom - 3, bx + 1, bottom - 3, IRON[1]);
      if (on) {
        for (let x = bx - 1; x <= bx + 1; x++) { p.px(x, bottom - 7, EMB[3]); g.px(x, bottom - 7, EMB[4]); }
        p.px(bx, bottom - 8, EMB[4]); p.px(bx, bottom - 9, EMB[3]); g.px(bx, bottom - 8, EMB[5]); g.px(bx, bottom - 9, EMB[4]); g.px(bx, bottom - 10, EMB[2]);
      } else { p.rect(bx - 1, bottom - 7, 3, 1, ASH[2]); p.px(bx, bottom - 7, ASH[3]); }
    }
    // Stange
    pole(p, x0, 8, bottom - 6, 2, GW.slice(1), 931);
    // Querholz + Banner (dunkelrot, zerfetzt)
    p.rect(x0 - 8, 12, 18, 2, GW[4]); p.rect(x0 - 8, 12, 18, 1, GW[6]);
    const bx0 = x0 - 7, bx1 = x0 + 8;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.7);
      const low = 36 + Math.round(fold * 1.2) - (hash2(x, 0, 932) < 0.35 ? 3 : 0) - ((x - bx0) % 4 === 1 ? 2 : 0);
      for (let y = 14; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 5; if (y === 14) i = 1;
        if (hash2(x, y, 933) < 0.04) { p.px(x, y, INTERIOR); continue; } // Einschusslöcher
        p.px(x, y, RED[clampI(i - (on ? 0 : 1), 6)]);
      }
    }
    // Emblem: Runen-Klaue, leuchtet wenn aktiv
    const claw = [[-3, 0], [-3, 1], [-3, 2], [-2, 3], [0, -1], [0, 0], [0, 1], [0, 2], [0, 3], [3, 0], [3, 1], [3, 2], [2, 3], [-1, 5], [0, 5], [1, 5], [0, 6], [-2, 7], [2, 7]];
    for (const [dx, dy] of claw) {
      const x = x0 + 1 + dx, y = 22 + dy;
      p.px(x, y, on ? '#ffb070' : '#1a0608');
      if (on) g.px(x, y, dy > 4 ? EMB[4] : EMB[5]);
    }
    // Hornschädel (Auerochse) oben
    const sx = x0 + 1, sy = 4;
    p.rect(sx - 3, sy, 6, 4, BONE[4]); p.rect(sx - 2, sy + 4, 4, 2, BONE[3]); p.px(sx - 3, sy, BONE[5]); p.px(sx - 2, sy, BONE[6]);
    p.px(sx - 1, sy + 6, BONE[2]); p.px(sx + 1, sy + 5, BONE[2]);
    p.px(sx - 2, sy + 2, on ? EMB[4] : INTERIOR); p.px(sx + 1, sy + 2, on ? EMB[4] : INTERIOR);
    if (on) { g.px(sx - 2, sy + 2, EMB[5]); g.px(sx + 1, sy + 2, EMB[5]); g.px(sx - 2, sy + 3, EMB[3]); g.px(sx + 1, sy + 3, EMB[3]); }
    // Hörner
    p.line(sx - 3, sy + 1, sx - 7, sy - 1, BONE[4]); p.line(sx - 7, sy - 1, sx - 8, sy - 4, BONE[5]); p.px(sx - 6, sy, BONE[2]);
    p.line(sx + 2, sy + 1, sx + 6, sy - 1, BONE[3]); p.line(sx + 6, sy - 1, sx + 7, sy - 4, BONE[4]); p.px(sx + 5, sy, BONE[1]);
    // Rosshaar unter dem Schädel
    for (let i = 0; i < 5; i++) p.line(sx - 2 + i, sy + 6, sx - 3 + i + (i > 2 ? 1 : 0), sy + 9 + (i % 2), HAIR[1 + (i % 3)]);
  }, { ax: 12, box: [-6, -4, 6, 1], light: on ? { dx: 0, dy: -24, radius: 76, color: [255, 120, 60], intensity: 0.9 } : undefined, extra: on ? { embers: { dx: 0, dy: -8, rate: 1.2 } } : undefined });
}

// ------------------------------------------------------------ Grabhügel mit Steintor
function barrowMound() {
  const W = 76, H = 46;
  return mk(W, H, (p, g) => {
    const by = H - 1, cx = 38;
    dustPatch(p, cx, by - 2, 36, 3, 941);
    // Hügel (Erde, von Steppengras überwachsen)
    const MND = ['#15120c', '#1c1811', '#252015', '#302919', '#3b331f', '#483e26', '#574a2d'];
    const top = shadeLump(p, cx, by - 6, 35, 30, MND, 942, { rough: 0.04, flat: 0.35, noise: 0.08 });
    // Grashalme auf dem Hügel (Streifen, im Licht heller)
    for (let i = 0; i < 120; i++) {
      const x = 5 + Math.round(hash2(i, 1, 943) * 66);
      const t0 = top.get(x); if (t0 === undefined) continue;
      const y = t0 + 1 + Math.round(hash2(i, 2, 943) * (by - 4 - t0));
      if (Math.abs(x - cx) < 12 && y > by - 22) continue;
      const lit = x < cx - 6 || y < t0 + 5;
      blade(p, x, y, 1 + Math.round(hash2(i, 3, 943) * 2), (x - cx) * 0.03, STRAW, lit ? 2 : 1, lit ? 4 : 3);
    }
    // Kammlinie: Halme auf der Silhouette
    for (const [x, y] of top) if (hash2(x, y, 944) < 0.3) blade(p, x, y, 1 + (x % 2), (x < cx ? -1 : 1) * 0.6, STRAW, 3, x < cx ? 5 : 4);
    // Einfassungssteine rund um den Fuß
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.05 + i * 0.082), x = cx - Math.cos(a) * 33, y = by - 4 - Math.sin(a) * 2;
      if (Math.abs(x - cx) < 14) continue;
      shadeLump(p, x, y, 2.4, 2, SST.slice(2), 945 + i, { rough: 0.15 });
    }
    // kleiner Steinhaufen auf der Kuppe
    for (const [x, y, r] of [[cx + 4, by - 34, 2.2], [cx + 7, by - 34, 1.8], [cx + 5, by - 36, 1.6]]) shadeLump(p, x, y, r, r * 0.8, SST.slice(2), 950 + x, { rough: 0.1 });
    // Torgang: Vertiefung in den Hügel, Steinrahmen (Dolmen)
    const gx0 = cx - 9, gx1 = cx + 9, gTop = by - 25;
    // Seitenwangen (Erde, eingeschnitten)
    poly(p, [[gx0 - 6, by - 1], [gx0 - 2, gTop + 4], [gx0, gTop + 4], [gx0, by - 1]], (x, y) => MND[clampI(2 + (hash2(x, y, 951) < 0.2 ? 1 : 0), 7)]);
    poly(p, [[gx1 + 7, by - 1], [gx1 + 3, gTop + 4], [gx1, gTop + 4], [gx1, by - 1]], (x, y) => MND[clampI(1 + (hash2(x, y, 952) < 0.2 ? 1 : 0), 7)]);
    // Dunkle Öffnung mit Stufen und kaltem Schimmer
    for (let y = gTop + 5; y < by - 1; y++) for (let x = gx0 + 4; x <= gx1 - 4; x++) p.px(x, y, INTERIOR);
    for (let s = 0; s < 4; s++) { const y = by - 2 - s * 3, inset = s; p.rect(gx0 + 4 + inset, y, 11 - inset * 2, 1, SST[4 - s]); p.rect(gx0 + 4 + inset, y + 1, 11 - inset * 2, 1, SST[1]); }
    for (let y = gTop + 6; y < by - 12; y++) for (let x = gx0 + 5; x <= gx1 - 5; x++) if ((x + y) % 3 === 0) { p.px(x, y, COLD[0]); g.px(x, y, COLD[1]); }
    g.px(cx, gTop + 10, COLD[3]); g.px(cx - 1, gTop + 11, COLD[2]); g.px(cx + 1, gTop + 12, COLD[2]);
    // Pfostensteine
    menhir(p, gx0, gx0 + 3, gTop + 2, by - 1, 0, 953, false);
    menhir(p, gx1 - 3, gx1, gTop + 2, by - 1, 0, 954, false);
    // Deckstein
    poly(p, [[gx0 - 3, gTop - 1], [gx1 + 3, gTop], [gx1 + 4, gTop + 5], [gx0 - 3, gTop + 5]], (x, y) => SST[clampI(6 - Math.round((y - gTop) * 0.8) - (hash2(x, y, 955) < 0.1 ? 1 : 0), 8)]);
    p.line(gx0 - 3, gTop - 1, gx1 + 3, gTop, SST[7]);
    p.line(gx0 - 3, gTop + 5, gx1 + 4, gTop + 5, SST[1]);
    // Runen im Deckstein, schwach leuchtend
    for (let i = 0; i < 5; i++) { const x = gx0 + 1 + i * 4, y = gTop + 2; p.px(x, y, COLD[2]); p.px(x + 1, y + 1, COLD[2]); p.px(x, y + 2, COLD[1]); g.px(x, y, COLD[3]); g.px(x + 1, y + 1, COLD[2]); }
    // Wächtersteine links und rechts
    menhir(p, 6, 10, by - 20, by - 1, 1, 956);
    menhir(p, 66, 70, by - 18, by - 1, -1, 957);
    // Grabbeigaben: Schild, Speer, Knochen am Eingang
    p.ellipse(gx0 - 6, by - 4, 3, 3.4, HIDE[3]); p.ellipse(gx0 - 7, by - 5, 2, 2.2, HIDE[4]); p.px(gx0 - 6, by - 4, IRON[4]);
    p.line(gx1 + 6, by - 14, gx1 + 9, by - 1, GW[4]); p.px(gx1 + 6, by - 15, IRON[4]); p.px(gx1 + 5, by - 14, IRON[3]);
    p.line(gx1 + 3, by - 1, gx1 + 7, by - 2, BONE[4]); p.px(gx1 + 2, by - 1, BONE[5]);
  }, {
    ax: 38,
    light: { dx: 0, dy: -12, radius: 56, color: [90, 210, 200], intensity: 0.55 },
    extra: { boxes: [[-37, -12, -10, 1], [10, -12, 37, 1], [-10, -30, 10, -8]], door: { dx: 0, dy: -3 } },
  });
}

export function createSteppeDecor() {
  return {
    steppeGrass: [0, 1, 2].map(steppeGrass),
    thornShrubs: [0, 1, 2].map(thornShrub),
    boulders: [0, 1, 2].map(boulder),
    bleachedBones: [giantRibs(), giantSkull()],
    standingStones: [0, 1].map(standingStone),
    yurt: yurt(),
    warTent: warTent(),
    palisade: palisadeH(),
    palisadeV: palisadeV(),
    watchtower: watchtower(),
    bannerPole: bannerPole(),
    campfireBig: campfireBig(),
    hayBales: hayBales(),
    stable: stable(),
    cart: cart(),
    warBanner: { off: warBanner(false), on: warBanner(true) },
    barrowMound: barrowMound(),
  };
}
