import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, D4, clampI, band, bandW, darken, mix, vnoise, chunkCtx, pebble, blade, stroke, paveIdx } from './kit.js';

// Feinraster-Boden: Aschensteppe (level.biome 'steppe'). Weltpixel-Shader: sprites/decor_steppe.js (steppePixel, nur gelesen).
// Bodenarten aus level.soil wie dort (gleiches Verwackeln der Grenzen, hier je Feinpixel ausgewertet):
//   ' ' Steppengras mit Strohgold-Flächen, y Strohgold, g sattes Gras, a Ascheflur, r Rotsand (k Schluchtrand → r),
//   s Salzkruste, b trockenes Flussbett, c Schluchtgrund, w Bachbett mit Furten, m Hochfläche, q Felsstufen (level.ramps).
// Felsen ('%') ganz im Feinraster (Aufbau wie decor_steppe.js rockPixel/facePixel/topPixel): Felsmaske je Feinpixel mit
// kleinen Absätzen im Umriss, Wände mit Gesteinsbändern über dem Fuß, Kappe oben hell, Unterschneidung, Fuß dunkel,
// Licht von links oben in harten Stufen; Wandoberkante in kurzen Stücken abgesetzt, stellenweise ausgebrochen.
// Schlagschatten unter Wänden, Schatten rechts der Felsen und Geröll am Wandfuß baut der Feinboden selbst.
// Leistung: Felsmaske je Level kachelweise gemerkt, Läufe (Abstände oben/unten/links/rechts) je Chunk in einem Durchgang,
// Spaltenwerte der Wände je Level; Rauschen je Pixel über vnC (Gitterzelle je Aufrufstelle gemerkt).

const P = (a) => ramp(a);
// Paletten (wie decor_steppe.js)
const GRS = P(['#1d1b10', '#282514', '#35301a', '#433c20', '#524926', '#62572d']);       // Steppengras
const GLD = P(['#2a1f0b', '#3b2c0f', '#503c14', '#67501a', '#7f6321', '#98772a']);       // Strohgold
const GRN = P(['#121c0c', '#192811', '#203416', '#29421b', '#33511f', '#3f6125']);       // sattes Gras
const ASH = P(['#191817', '#22201f', '#2c2a28', '#373431', '#423e3a', '#504b46']);       // Ascheflur
const DRT = P(['#1a140d', '#211a11', '#2d2316', '#3b2e1c', '#4a3a23', '#5a472b', '#6c5533', '#7c6340']);   // Weg
const RED = P(['#24130c', '#341b10', '#452414', '#572d18', '#6a381d', '#7e4423', '#904f2a']);
const SALT = P(['#34322d', '#45423b', '#57534a', '#6a655a', '#7e786a', '#948d7c', '#a8a190']);
const BED = P(['#2c251b', '#3f3528', '#4e4333', '#5d503e', '#6c5d49', '#7d6c55']);
const CAN = P(['#24120b', '#331a10', '#432215', '#542b1a', '#66351f', '#7a4025']);
const CAP = P(['#33200f', '#452b14', '#58371a', '#6c4320', '#804f27', '#955d2f', '#a96b38']);
const WET = P(['#120c0a', '#1b1310', '#251a15', '#31231b', '#3e2d22']);
const WASH = P(['#2a1b14', '#3a271d', '#4a3326', '#5a3f30', '#6a4c3a', '#7b5a45']);
const MESR = P(['#140d09', '#21150d', '#311e11', '#452a16', '#5b381c', '#734823', '#8e5b2c', '#ab7339', '#c99250']);
// Bänder der Wände: blasser und tiefroter Sandstein (wie decor_steppe.js PALER/DEEPR)
const PALER = MESR.map((c) => mix(c, 0xb09676, 0.32)), DEEPR = MESR.map((c) => mix(c, 0x60160e, 0.22));
// Halme (Schatten, Fuß, Körper, oben, Spitze hell)
const BL_GRS = P(['#17150c', '#2e2a17', '#433c20', '#584d27', '#6d592d', '#8a7340']);
const BL_GLD = P(['#22190a', '#3b2c0f', '#5a4417', '#7a5d1f', '#98772a', '#b8944a']);
const BL_GRN = P(['#0e160a', '#1d3014', '#29421b', '#36561f', '#466c29', '#5f8a3a']);
const BL_ASH = P(['#151413', '#2a2826', '#3a3633', '#4a4540', '#5e5850', '#787066']);
// Steine: Sandstein grau (Ebene), Rotstein (Schlucht, Fels)
const SST = P(['#141217', '#1d1a1e', '#282426', '#35302f', '#453e3a', '#574e47', '#6f655a', '#8a7f70']);
const RST = P(['#140d09', '#2a190e', '#3d2513', '#563419', '#6e4421', '#8a5a2c', '#a8733c']);
const BST = P(['#1a1612', '#2c261e', '#3e362b', '#52483a', '#685c4a', '#84765f', '#a1937a']);
const UPF = P(['#17110c', '#21180f', '#2d2114', '#3a2b1a', '#4a3822', '#5c472b', '#705735', '#856841', '#9a7a4d']);
const PAVE = PAL.stone.map(hxi), MORT = hxi(PAL.mortar);
const PUD = [hxi('#262c2e'), hxi('#464e50')];

// Bodenart-Codes
const S_PLAIN = 0, S_Y = 1, S_G = 2, S_A = 3, S_R = 4, S_S = 5, S_B = 6, S_C = 7, S_W = 8, S_M = 9, S_Q = 10;
const SCODE = { ' ': 0, y: 1, g: 2, a: 3, r: 4, k: 4, s: 5, b: 6, c: 7, w: 8, m: 9, q: 10, h: 0 };
const GRASSY = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];   // Wege darin: Erdweg
const BLR = [BL_GRS, BL_GLD, BL_GRN, BL_ASH];
const BASE = [GRS, GLD, GRN, ASH];

// Farbe mit Faktor (auch > 1, begrenzt)
function shadeC(c, k) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

// Wertrauschen wie vnoise (gleiche Rechnung), Gitterzelle je Aufrufstelle s gemerkt: Pixel einer Zeile liegen fast immer
// in derselben Zelle, dann entfallen die vier Hashes
const VC = new Float64Array(40 * 7).fill(NaN);
function vnC(s, x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), o = s * 7;
  if (VC[o] !== x0 || VC[o + 1] !== y0 || VC[o + 6] !== seed) {
    VC[o] = x0; VC[o + 1] = y0; VC[o + 6] = seed;
    const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    VC[o + 2] = a; VC[o + 3] = b - a; VC[o + 4] = c - a; VC[o + 5] = a - b - c + d;
  }
  const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return VC[o + 2] + VC[o + 3] * sx + VC[o + 4] * sy + VC[o + 5] * sx * sy;
}
// Aufrufstellen (je eine Zelle)
const N_M1 = 0, N_M2 = 1, N_M3 = 2, N_CA = 3, N_CB = 4, N_CC = 5, N_CD = 6, N_CAP = 7, N_CAP1 = 8, N_SL = 9, N_SL1 = 10, N_SL2 = 11,
  N_SL3 = 12, N_KN = 13, N_KN1 = 14, N_KN2 = 15, N_W0 = 16, N_W1 = 17, N_W2 = 18, N_W3 = 19, N_RW = 20, N_RG = 21, N_BW = 22,
  N_BK = 23, N_BK2 = 24, N_SB = 25, N_HF = 26, N_HB = 27, N_RP = 28, N_RP1 = 29, N_RWW = 30, N_HB1 = 31, N_CL = 32;

// ------------------------------------------------------------ Level-Daten (einmal je Level)
const KIND_MESA = 1, KIND_RIM = 2, KIND_HILL = 3;
const topH = (k) => (k === KIND_RIM ? 0 : 1);
const soilH = (s) => (s === 'c' || s === 'w' ? -1 : s === 'm' ? 1 : 0);
const LV = new WeakMap();
function levelData(level) {
  let L = LV.get(level);
  if (L) return L;
  const rows = level.map, SO = level.soil ?? [], H = rows.length, W = rows[0].length;
  const rock = new Uint8Array(W * H), kindT = new Int8Array(W * H), gT = new Int8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x] === '%') rock[y * W + x] = 1;
  const at = (x, y) => rock[clampI(y, 0, H - 1) * W + clampI(x, 0, W - 1)];
  const kindOf = (x, y) => { const s = SO[y]?.[x]; return s === 'k' ? KIND_RIM : s === 'h' ? KIND_HILL : KIND_MESA; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (rock[i]) kindT[i] = kindOf(x, y); else gT[i] = soilH(SO[y]?.[x] ?? ' ');
  }
  // wie decor_steppe.js buildRockField: Bodenhöhe unter Fels vom offenen Nachbarn, Felsart in Felsnähe
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let n1 = 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (at(x + k, y + j)) n1 = 1;
    if (rock[i]) {
      let g = topH(kindT[i]);
      for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1], [0, 2]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && !rock[yy * W + xx]) { g = gT[yy * W + xx]; break; }
      }
      gT[i] = g;
    } else if (n1) {
      let best = 0;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const xx = clampI(x + dx, 0, W - 1), yy = clampI(y + dy, 0, H - 1);
        if (rock[yy * W + xx]) { best = kindT[yy * W + xx]; break; }
      }
      kindT[i] = best;
    }
  }
  // Bodenart je Kachel als Code; einheitliche Kacheln (3×3 gleich) ohne Verwackeln.
  // Sattes Gras: einzelne Kacheln abseits der Grünflächen meist als Steppengras (sonst gleichmäßig verstreute Flecken)
  const sc = new Uint8Array(W * H), uni = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sc[y * W + x] = SCODE[SO[y]?.[x] ?? ' '] ?? 0;
  if (level.soil) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (SO[y][x] !== 'g') continue;
      let n = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (SO[y + j]?.[x + k] === 'g') n++;
      if (n <= 3 && hash2(x, y, 455) > 0.3) sc[y * W + x] = S_PLAIN;
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = sc[y * W + x]; let ok = 1;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (sc[(y + dy) * W + x + dx] !== c) { ok = 0; break; }
      uni[y * W + x] = ok;
    }
  }
  // Felsstufen (level.ramps): Segmente wie decor_steppe.js rampSegs
  const segs = [];
  for (const line of level.ramps ?? []) {
    let acc = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const ax = line[i][0] * 16 + 8, ay = line[i][1] * 16 + 8, dx = line[i + 1][0] * 16 + 8 - ax, dy = line[i + 1][1] * 16 + 8 - ay, l = Math.hypot(dx, dy);
      segs.push({ ax, ay, dx, dy, l, acc }); acc += l;
    }
  }
  L = { W, H, FW: W * 32, FH: H * 32, JW: W * 4 + 12, jx: null, jy: null, grid: [], rock, at, kindT, gT, sc, uni, soil: !!level.soil, segs, fm: new Array(W * H), nfm: 0, col: null };
  LV.set(level, L);
  return L;
}
const tKind = (L, F, G) => L.kindT[clampI(G >> 5, 0, L.H - 1) * L.W + clampI(F >> 5, 0, L.W - 1)] || KIND_MESA;
const gAt = (L, F, G) => L.gT[clampI(G >> 5, 0, L.H - 1) * L.W + clampI(F >> 5, 0, L.W - 1)];

// Felsmaske einer Kachel im Feinraster (32 × 32, gemerkt; null = frei, FULLT = ganz Fels). Wie decor_steppe.js maskRaw an
// Feinpixel-Ecken (gerade F/G = Weltpixel), feinste Lage etwas ruhiger; dazu kleine Absätze: je Ziegelzelle (5 × 3
// Feinpixel, Reihen versetzt) ein fester Schwellenversatz – der Umriss bricht in kurze gerade Stücke statt glatter Kurven
const FULLT = new Uint8Array(1024).fill(1);
function maskTile(L, tx, ty) {
  const key = ty * L.W + tx;
  let b = L.fm[key];
  if (b !== undefined) return b;
  if (L.nfm > 3000) { L.fm = new Array(L.W * L.H); L.nfm = 0; }
  let near = 0, all = 1;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (L.at(tx + i, ty + j)) near = 1; else all = 0;
  if (!near) b = null;
  else if (all) b = FULLT;
  else {
    b = new Uint8Array(1024); L.nfm++;
    for (let j = 0; j < 32; j++) {
      const G = ty * 32 + j, py = G / 2, fy = py / 16 - 0.5, cy = Math.floor(fy), ay = fy - cy;
      const row = Math.floor(G / 3), off = Math.floor(hash2(row, 0, 1308) * 5);
      for (let i = 0; i < 32; i++) {
        const F = tx * 32 + i, px = F / 2, fx = px / 16 - 0.5, cx = Math.floor(fx), ax = fx - cx;
        const a = L.at(cx, cy), bb = L.at(cx + 1, cy), c = L.at(cx, cy + 1), d = L.at(cx + 1, cy + 1);
        const v = (a * (1 - ax) + bb * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
        if (v < 0.01 || v > 0.99) { if (v > 0.5) b[j * 32 + i] = 1; continue; }
        const n = (vnC(N_M1, px / 13, py / 11, 1300) - 0.5) * 0.5 + (vnC(N_M2, px / 6, py / 6, 1301) - 0.5) * 0.3
          + (vnC(N_M3, px / 2.5, py / 2.5, 1302) - 0.5) * 0.08 + (hash2(Math.floor((F + off) / 5), row, 1309) - 0.5) * 0.1;
        if (v + n > 0.5) b[j * 32 + i] = 1;
      }
    }
  }
  L.fm[key] = b;
  return b;
}

// Spaltenwerte der Wände je Level (Feinpixel-Spalte F, je Felsart kd 1..3): Wandhöhe mit Absätzen und Ausbrüchen,
// Wellung der Bänder, Erosionsrinnen, Klüfte, Wüstenlack (wie decor_steppe.js buildRockField, fein)
const TINT = new Float32Array(4 * 64);
for (let kd = 1; kd <= 3; kd++) for (let b = 0; b < 64; b++) TINT[kd * 64 + b] = hash2(b, kd, 1337);
// Absätze der Oberkante: Stücke von 1–14 Feinpixeln mit eigenem Höhenversatz; jedes zehnte bricht aus (Wand reicht
// dort 3–6 Feinpixel höher, an den Rändern abgestuft)
const segB = (c) => c * 8 + Math.floor(hash2(c, 0, 1310) * 7);
function ledge(F) {
  const c = Math.floor(F / 8), seg = F >= segB(c) ? c : c - 1, s0 = segB(seg), s1 = segB(seg + 1);
  const h = hash2(seg, 1, 1311);
  let d = h < 0.3 ? 0 : h < 0.55 ? 2 : h < 0.75 ? -2 : h < 0.9 ? 1 : -1;
  if (hash2(seg, 2, 1312) < 0.1) d += Math.min(3 + Math.floor(hash2(seg, 3, 1313) * 4), 1 + 2 * Math.min(F - s0, s1 - 1 - F));
  return d;
}
function colTables(L) {
  const FW = L.FW, fh = new Int16Array(4 * FW), gC = new Int8Array(4 * FW), clC = new Float32Array(4 * FW);
  const gH = new Float32Array(4 * FW), lk = new Float32Array(4 * FW), wav = new Float32Array(FW);
  for (let F = 0; F < FW; F++) {
    const px = F / 2, lg = ledge(F);
    wav[F] = (vnoise(px / 31, 0.5, 1335) - 0.5) * 4 + (vnoise(px / 7, 1.5, 1336) - 0.5) * 0.9;
    fh[FW + F] = Math.round(60 + vnoise(px / 13, 0.5, 1320) * 20) + lg;
    fh[2 * FW + F] = Math.round(40 + vnoise(px / 11, 2.5, 1321) * 16) + lg;
    fh[3 * FW + F] = Math.round(40 + vnoise(px / 15, 4.5, 1322) * 20) + (lg > 2 ? lg : 0);
    for (let kd = 1; kd <= 3; kd++) {
      const i = kd * FW + F;
      // Rinne: je Zelle von 9 Feinpixeln höchstens eine, 2 Feinpixel Schattenseite, rechts daneben die Lichtkante
      const q = Math.floor(F / 9), g0 = q * 9 + 1 + Math.floor(hash2(q, kd, 1343) * 5), gx = F - g0;
      gC[i] = hash2(q, kd, 1338) < 0.32 && gx >= 0 && gx <= 2 ? (gx < 2 ? -2 : 1) : 0;
      clC[i] = vnoise(px / 6.5, 7.5 + kd, 1340); gH[i] = hash2(q, kd, 1339);
      lk[i] = hash2(F >> 1, kd, 1341) < 0.05 ? hash2(F >> 1, 2, 1342) * 0.8 : -1;
    }
  }
  L.col = { fh, gC, clC, gH, lk, wav };
  return L.col;
}

// ------------------------------------------------------------ Vorarbeit je Chunk
// Gitterwerte (Schritt step, je Level gemerkt) eines Felds für den Chunk-Ausschnitt: W × H Werte ab (gx, gy)
function gridVals(S, key, step, fn) {
  const L = S.L, gw = Math.ceil(L.W * 16 / step) + 6, gh = Math.ceil(L.H * 16 / step) + 6;
  const A = L.grid[key] ?? (L.grid[key] = new Float32Array(gw * gh).fill(NaN));
  const W = Math.ceil(S.fw / step) + 2, H = Math.ceil(S.fh / step) + 2, out = new Float32Array(W * H);
  const gx = Math.floor(S.fx0 / step) * step, gy = Math.floor(S.fy0 / step) * step;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = gx + i * step, y = gy + j * step, li = x / step + 3, lj = y / step + 3;
    if (li < 0 || lj < 0 || li >= gw || lj >= gh) { out[j * W + i] = fn(x, y); continue; }
    const q = lj * gw + li;
    let v = A[q];
    if (v !== v) v = A[q] = fn(x, y);
    out[j * W + i] = v;
  }
  return out;
}
// Felder des Chunks bilinear (Werte wie kit field): n Felder mit Schritt step aus gridVals in einem Durchgang
function fieldsN(S, grids, step) {
  const w = S.fw, h = S.fh, W = Math.ceil(w / step) + 2, inv = 1 / step, n = grids.length;
  const ox = S.fx0 - Math.floor(S.fx0 / step) * step, oy = S.fy0 - Math.floor(S.fy0 / step) * step;
  const IX = new Int32Array(w), AX = new Float32Array(w);
  for (let x = 0; x < w; x++) { const fx = (x + ox) * inv, i = fx | 0; IX[x] = i; AX[x] = fx - i; }
  const outs = grids.map(() => new Float32Array(S.n));
  for (let k = 0; k < n; k++) {
    const a = grids[k], o1 = outs[k];
    for (let y = 0; y < h; y++) {
      const fy = (y + oy) * inv, j = fy | 0, ay = fy - j, o = y * w, jr = j * W;
      for (let x = 0; x < w; x++) {
        const q = jr + IX[x], ax = AX[x];
        const t = a[q] + (a[q + 1] - a[q]) * ax, u = a[q + W] + (a[q + W + 1] - a[q + W]) * ax;
        o1[o + x] = (t + (u - t) * ay) * 1;
      }
    }
  }
  return outs;
}

// Raster im Format des Terrainrasters K (Feinpixel mit Rand M, gleicher Index ki): Bodenart SO, Fels RK.
function* steppeSetup(x0, y0, cw, ch, K, KW, M, map) {
  const level = map.level, L = levelData(level);
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  const { H2 } = S, KH = H2 + 2 * M, n = KW * KH;
  // alle Felder gleich zu Beginn (feste Objektform, schnelle Zugriffe je Pixel)
  S.level = level; S.L = L; S.tone = S.patch = S.gold = S.rut = null; S.SO = S.RK = null; S.segs = null; S.anyRock = false;
  S.dU = S.dD = S.dL = S.dR = null; S.col = null; S.kdJ = null;
  S.qa = 0; S.qb = 0; S.qc = 0; S.qd = 0; S.qk = 0; S.rowG = -1e9; S.row = new Int32Array(S.W2); S.ckP = new Int8Array(S.W2); S.ckC = new Int8Array(S.W2); S.shG0 = 0; S.shG1 = -1;
  // Rauschfelder (Weltpixel mit Rand): Grundton (zwei Lagen auf einem Gitter), Flecken (auch Fahrspuren), Goldflächen
  [S.tone, S.patch] = fieldsN(S, [gridVals(S, 0, 4, (x, y) => vnoise(x / 11, y / 11, 801) * 0.65 + vnoise(x / 4, y / 4, 802) * 0.35), gridVals(S, 1, 4, (x, y) => vnoise(x / 19, y / 15, 803))], 4);
  [S.gold] = fieldsN(S, [gridVals(S, 2, 8, (x, y) => vnoise(x / 60, y / 48, 451))], 8);
  S.rut = S.patch;
  yield;
  S.SO = soilGrid(S, L);
  // Felsstufen: nur Segmente in Reichweite des Chunks
  S.segs = L.segs.filter((g) => Math.min(g.ax, g.ax + g.dx) < x0 + cw + 32 && Math.max(g.ax, g.ax + g.dx) > x0 - 32 && Math.min(g.ay, g.ay + g.dy) < y0 + ch + 32 && Math.max(g.ay, g.ay + g.dy) > y0 - 32);
  yield;
  S.RK = new Uint8Array(n);
  S.anyRock = rockPrep(S, L);
  yield;
  stamps(S);
  return S;
}

// Bodenart je Feinpixel (Verwackeln wie steppeSoil: Versatz bilinear aus einem 4-px-Raster, Rauschen 401/402);
// einheitliche Kacheln blockweise
function soilGrid(S, L) {
  const { KW, M, F0, G0 } = S, KH = S.H2 + 2 * M, SO = new Uint8Array(KW * KH);
  if (!L.soil) return SO;
  const Wt = L.W, Ht = L.H;
  const gx0 = Math.floor((F0 - M) / 8) - 1, gy0 = Math.floor((G0 - M) / 8) - 1, gw = Math.ceil(KW / 8) + 4, gh = Math.ceil(KH / 8) + 4;
  let jx = null, jy = null;
  const tx0 = (F0 - M) >> 5, tx1 = (F0 - M + KW - 1) >> 5, ty0 = (G0 - M) >> 5, ty1 = (G0 - M + KH - 1) >> 5;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const ga = Math.max(0, ty * 32 - (G0 - M)), gb = Math.min(KH, (ty + 1) * 32 - (G0 - M));
    const fa = Math.max(0, tx * 32 - (F0 - M)), fb = Math.min(KW, (tx + 1) * 32 - (F0 - M));
    const inside = tx >= 0 && ty >= 0 && tx < Wt && ty < Ht;
    if (inside && L.uni[ty * Wt + tx]) {
      const v = L.sc[ty * Wt + tx];
      if (v) for (let g = ga; g < gb; g++) SO.fill(v, g * KW + fa, g * KW + fb);
      continue;
    }
    if (!jx) {
      jx = new Float32Array(gw * gh); jy = new Float32Array(gw * gh);
      // Versatzgitter (4 px) je Level gemerkt (Nachbarchunks und Neubau teilen die Werte)
      const JW = L.JW, JX = L.jx ?? (L.jx = new Float32Array(JW * (Ht * 4 + 12)).fill(NaN)), JY = L.jy ?? (L.jy = new Float32Array(JX.length));
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const cx = gx0 + i, cy = gy0 + j, q = (clampI(cy, -5, Ht * 4 + 5) + 6) * JW + clampI(cx, -5, Wt * 4 + 5) + 6;
        if (JX[q] !== JX[q]) {
          // Ausschlag höchstens ±15 px (< 1 Kachel: einheitliche Kacheln bleiben einheitlich); gröber und weiter als
          // im Weltpixel-Shader, damit lange gerade Kartengrenzen (Rotsand, Strohgold) sichtbar gebrochen werden
          JX[q] = (vnoise(cx * 4 / 13, cy * 4 / 13, 401) - 0.5) * 22 + (vnoise(cx * 4 / 5, cy * 4 / 5, 403) - 0.5) * 8;
          JY[q] = (vnoise(cx * 4 / 13, cy * 4 / 13, 402) - 0.5) * 22 + (vnoise(cx * 4 / 5, cy * 4 / 5, 404) - 0.5) * 8;
        }
        jx[j * gw + i] = JX[q]; jy[j * gw + i] = JY[q];
      }
    }
    // Versatz je Weltpixel (wie dort), Grenze je Feinpixel (+0/+0,5 px)
    for (let g = ga; g < gb; g += 2) {
      const py = (G0 - M + g) >> 1, gy = py >> 2, fy = (py & 3) * 0.25, rj = (gy - gy0) * gw;
      for (let f = fa; f < fb; f += 2) {
        const px = (F0 - M + f) >> 1, gx = px >> 2, fx = (px & 3) * 0.25, q = rj + gx - gx0;
        const ax = jx[q] + (jx[q + 1] - jx[q]) * fx, bx = jx[q + gw] + (jx[q + gw + 1] - jx[q + gw]) * fx;
        const ay = jy[q] + (jy[q + 1] - jy[q]) * fx, by = jy[q + gw] + (jy[q + gw + 1] - jy[q + gw]) * fx;
        const qx = px + ax + (bx - ax) * fy, qy = py + ay + (by - ay) * fy;
        for (let v = 0; v < 2 && g + v < gb; v++) {
          const sy = Math.floor((qy + v * 0.5) / 16);
          for (let u = 0; u < 2 && f + u < fb; u++) {
            const sx = Math.floor((qx + u * 0.5) / 16);
            SO[(g + v) * KW + f + u] = sx >= 0 && sy >= 0 && sx < Wt && sy < Ht ? L.sc[sy * Wt + sx] : 0;
          }
        }
      }
    }
  }
  return SO;
}

// Fels je Chunk: Maske über einem erweiterten Bereich E (seitlich PX, oben PU, unten PD Feinpixel über das Terrainraster
// hinaus: Abbrüche bis 30 px seitlich, Wände bis 44 px hoch) zeilenweise aus den gemerkten Kacheln gelesen; RK = Ausschnitt.
// Läufe je Feinpixel des Terrainrasters bis zum Wechsel Fels/frei nach oben (dU), unten (dD), links (dL), rechts (dR),
// 255 = weiter als der Bereich. Für Fels: Abstand zum offenen Boden; für Boden: Abstand zum Fels (Schlagschatten, Geröll).
// Gerechnet nur im Felsrahmen (kachelgenau) und knapp darunter/rechts davon; sonst ist alles frei (255).
const PX = 64, PU = 84, PD = 96;
// eine Zeile der Felsmaske (Feinzeile G, Spalten EF0 … EF0 + EW − 1; außerhalb der Karte wie der Rand)
function maskRow(L, EF0, EW, G, out) {
  const ty = clampI(G, 0, L.FH - 1) >> 5, ro = (clampI(G, 0, L.FH - 1) & 31) << 5, FWm = L.FW - 1;
  for (let i = 0; i < EW;) {
    const F = EF0 + i;
    if (F < 0 || F > FWm) { const blk = maskTile(L, F < 0 ? 0 : L.W - 1, ty); out[i] = blk === null ? 0 : blk[ro | (F < 0 ? 0 : 31)]; i++; continue; }
    const blk = maskTile(L, F >> 5, ty), e = Math.min(EW, i + 32 - (F & 31));
    if (blk === null) out.fill(0, i, e);
    else if (blk === FULLT) out.fill(1, i, e);
    else out.set(blk.subarray(ro | (F & 31), ro + (F & 31) + e - i), i);
    i = e;
  }
}
function rockPrep(S, L) {
  const { KW, M, F0, G0, H2, RK } = S, KH = H2 + 2 * M, nK = KW * KH;
  const EW = KW + 2 * PX, EH = KH + PU + PD, EF0 = F0 - M - PX, EG0 = G0 - M - PU, FWm = L.FW - 1, FHm = L.FH - 1;
  // Felsrahmen: Zeilen-/Spaltengruppen je Kachel (mit Randklemmung), Kacheln mit Fels in der Nähe
  const grp = (n, o0, max) => { const a = []; for (let j = 0; j < n;) { const t = clampI(o0 + j, 0, max) >> 5; let k = j + 1; while (k < n && (clampI(o0 + k, 0, max) >> 5) === t) k++; a.push(t, j, k - 1); j = k; } return a; };
  const RG = grp(EH, EG0, FHm), CG = grp(EW, EF0, FWm);
  let r0 = EH, r1 = -1, c0 = EW, c1 = -1;
  for (let a = 0; a < RG.length; a += 3) for (let b = 0; b < CG.length; b += 3) {
    if (maskTile(L, CG[b], RG[a]) === null) continue;
    if (RG[a + 1] < r0) r0 = RG[a + 1]; if (RG[a + 2] > r1) r1 = RG[a + 2];
    if (CG[b + 1] < c0) c0 = CG[b + 1]; if (CG[b + 2] > c1) c1 = CG[b + 2];
  }
  if (r1 < 0) return false;
  S.shG0 = EG0 + r0; S.shG1 = EG0 + r1 + 17;
  const col = L.col ?? colTables(L);
  const dU = new Uint8Array(nK).fill(255), dD = new Uint8Array(nK).fill(255), dL = new Uint8Array(nK).fill(255), dR = new Uint8Array(nK).fill(255);
  let cur = new Uint8Array(EW), prv = new Uint8Array(EW), sw;
  const cnt = new Uint8Array(EW).fill(255), ka = Math.max(c0, PX), kb = Math.min(c1, PX + KW - 1);
  // von oben: Lauf nach oben je Spalte; in den Zeilen des Rasters Fels, Läufe nach links/rechts
  const jA = Math.max(1, r0), jB = Math.min(PU + KH - 1, r1 + 17);
  if (jA <= jB) {
    maskRow(L, EF0, EW, EG0 + jA - 1, prv);
    for (let j = jA; j <= jB; j++) {
      maskRow(L, EF0, EW, EG0 + j, cur);
      for (let i = c0; i <= c1; i++) { const v = cnt[i]; cnt[i] = cur[i] !== prv[i] ? 1 : v < 255 ? v + 1 : 255; }
      if (j >= PU) {
        const kr = (j - PU) * KW - PX;
        for (let i = ka; i <= kb; i++) dU[kr + i] = cnt[i];
        if (j <= r1) {
          RK.set(cur.subarray(PX, PX + KW), kr + PX);
          let v = 255;
          for (let i = Math.max(1, c0), ie = Math.min(c1 + 17, PX + KW - 1); i <= ie; i++) { v = cur[i] !== cur[i - 1] ? 1 : v < 255 ? v + 1 : 255; if (i >= PX) dL[kr + i] = v; }
          v = 255;
          for (let i = Math.min(EW - 2, c1), ie = Math.max(c0, PX); i >= ie; i--) { v = cur[i] !== cur[i + 1] ? 1 : v < 255 ? v + 1 : 255; if (i < PX + KW) dR[kr + i] = v; }
        }
      }
      sw = prv; prv = cur; cur = sw;
    }
  }
  // von unten: Lauf nach unten (bis zum Wandfuß), nur für Zeilen des Rasters gebraucht
  const jS = Math.min(EH - 2, r1), jE = Math.max(r0, PU);
  if (jS >= jE) {
    cnt.fill(255);
    maskRow(L, EF0, EW, EG0 + jS + 1, prv);
    for (let j = jS; j >= jE; j--) {
      maskRow(L, EF0, EW, EG0 + j, cur);
      for (let i = c0; i <= c1; i++) { const v = cnt[i]; cnt[i] = cur[i] !== prv[i] ? 1 : v < 255 ? v + 1 : 255; }
      if (j < PU + KH) { const kr = (j - PU) * KW - PX; for (let i = ka; i <= kb; i++) dD[kr + i] = cnt[i]; }
      sw = prv; prv = cur; cur = sw;
    }
  }
  S.dU = dU; S.dD = dD; S.dL = dL; S.dR = dR; S.col = col;
  // Felsart je Weltpixel, Grenze verwackelt (sonst endet z. B. die Grasdecke der Randhügel an einer geraden Kachelkante)
  const [jx, jy] = fieldsN(S, [gridVals(S, 3, 4, (x, y) => vnoise(x / 9, y / 8, 1371)), gridVals(S, 4, 4, (x, y) => vnoise(x / 9, y / 8, 1372))], 4), kdJ = new Uint8Array(S.n);
  for (let y = 0; y < S.fh; y++) for (let x = 0; x < S.fw; x++) {
    const i = y * S.fw + x, px = S.fx0 + x + Math.round((jx[i] - 0.5) * 16), py = S.fy0 + y + Math.round((jy[i] - 0.5) * 16);
    kdJ[i] = L.kindT[clampI(py >> 4, 0, L.H - 1) * L.W + clampI(px >> 4, 0, L.W - 1)] || KIND_MESA;
  }
  S.kdJ = kdJ;
  return true;
}

// Felsklassen eines Feinpixels (wie decor_steppe.js rockPixel/topPixel, Abstände in Feinpixeln). Hilfswerte in S.qa…qd.
const C_HILL = 1, C_CAP = 2, C_SLAB = 3, C_CAPF = 4, C_SLABF = 5, C_CAPE = 6, C_FACE = 10, C_RIMW = 11, C_SLOPE = 12, C_SIDER = 13, C_SIDEL = 14, C_LIPU = 15;
function rockClass(S, F, G, e) {   // e: Index im Terrainraster
  const L = S.L, b = S.dD[e];
  // Wand: Fuß tiefer als die Felsart am Fuß, innerhalb der Wandhöhe der Spalte (kleine Felsnadeln behalten eine Kappe)
  if (b <= 96) {
    const kd = tKind(L, F, G + b - 1);
    if (gAt(L, F, G + b) < topH(kd)) {
      let fh = S.col.fh[kd * L.FW + clampI(F, 0, L.FW - 1)];
      const tot = b + S.dU[e] - 1;
      if (tot < fh + 12) fh = Math.max(12, tot - 10);
      if (b <= fh) { S.qa = b; S.qb = fh; S.qk = kd; return C_FACE; }
    }
  }
  const kd = S.kdJ[S.wi(F, G)], th = topH(kd);
  const far = kd === KIND_RIM ? 60 : kd === KIND_HILL ? 32 : 20;
  const dl = S.dL[e], dr = S.dR[e], du = S.dU[e];
  const l = dl <= far ? dl : 0, r = dr <= far ? dr : 0, u = du <= 8 ? du : 0;
  S.qk = kd;
  if (!(l | r | u)) {
    if (kd === KIND_MESA) return C_CAP;
    if (kd === KIND_RIM) return C_SLAB;
    S.qa = 0.92 + 0.36 * Math.min(1, Math.min(48, b) / 44);
    return C_HILL;
  }
  const lowL = l > 0 && gAt(L, F - l, G) < th, lowR = r > 0 && gAt(L, F + r, G) < th, lowU = u > 0 && gAt(L, F, G - u) < th;
  if (kd === KIND_RIM && (lowL || lowR)) {
    // Schluchtwand von oben gesehen: Schichten parallel zur Kante
    // Wandstreifen mit verwackelter Breite, dahinter die Abbruchkante (Licht) und die Platten des Rands
    const useL = lowL && (!lowR || l <= r), other = useL ? r : l, otherLow = useL ? lowR : lowL, dF = useL ? l : r;
    const wR = 34 + Math.floor(vnC(N_RWW, F / 40, G / 34, 1390) * 20);
    if (dF <= wR + 2) {
      S.qa = dF; S.qb = dF > wR ? 1 : other && !otherLow ? other : 199; S.qc = useL ? 1 : 0; S.qd = lowU && u <= 4 ? 1 : 0;
      return C_RIMW;
    }
  }
  if (kd === KIND_HILL && ((lowL && l <= 28) || (lowR && r <= 28))) {
    // Böschung der Randhügel in Aufsicht
    const useL = lowL && (!lowR || l <= r), dF = useL ? l : r, bw = 18 + Math.floor(vnC(N_BW, F / 34, G / 26, 1386) * 12);
    if (dF <= bw) { S.qa = dF; S.qb = bw; S.qc = useL ? 1 : 0; return C_SLOPE; }
  }
  let sbw = 26;
  if (lowL || lowR || lowU) {
    sbw = 8 + Math.floor(vnC(N_SB, F / 46, G / 18, 1350) * 10);
    // seitliche Abbrüche: schmale Wandbänder (links im Licht, rechts im Schatten), Oberkante zur Ebene
    if (lowR && r <= sbw) { S.qa = r; return C_SIDER; }
    if (lowL && l <= sbw) { S.qa = l; return C_SIDEL; }
    if (lowU && u <= 4) { S.qa = u; return C_LIPU; }
  }
  const edgeLow = (lowL && l <= sbw + 6) || (lowR && r <= sbw + 6) || (lowU && u <= 8);
  const flush = (l > 0 && l <= 6 && !lowL) || (r > 0 && r <= 6 && !lowR) || (u > 0 && u <= 6 && !lowU);
  if (kd === KIND_MESA) return flush ? C_CAPF : edgeLow ? C_CAPE : C_CAP;
  if (kd === KIND_RIM) return flush ? C_SLABF : C_SLAB;
  // Randhügel: innen heller, linke Flanke im Licht
  const dIn = Math.min(l || 48, r || 48, (u || 24) * 2, Math.min(48, b)) / 2;
  let lu = 0.92 + 0.36 * Math.min(1, dIn / 22);
  if (lowL && l < 36) lu += 0.12 * (1 - l / 36);
  if (lowR && r < 36) lu -= 0.18 * (1 - r / 36);
  S.qa = lu;
  return C_HILL;
}
// Klasse für Stempel: 1 Hügeldecke, 2 Kappe, 3 Platten, 4 Kappe am flachen Rand, 5 Platten am flachen Rand, 0 Wand/Kante
const TOPC = [0, 1, 2, 3, 4, 5, 2];
function rockTopAt(S, F, G) {
  const Fc = clampI(F, S.F0 - S.M, S.F0 + S.W2 + S.M - 1), Gc = clampI(G, S.G0 - S.M, S.G0 + S.H2 + S.M - 1);
  const c = rockClass(S, Fc, Gc, (Gc - S.G0 + S.M) * S.KW + Fc - S.F0 + S.M);
  return c < 7 ? TOPC[c] : 0;
}

// Bodenart / Fels am Anker (Rand des Rasters wie kAt)
const sAt = (S, F, G) => S.SO[(clampI(G - S.G0, -S.M, S.H2 + S.M - 1) + S.M) * S.KW + clampI(F - S.F0, -S.M, S.W2 + S.M - 1) + S.M];
const rAt = (S, F, G) => S.RK[(clampI(G - S.G0, -S.M, S.H2 + S.M - 1) + S.M) * S.KW + clampI(F - S.F0, -S.M, S.W2 + S.M - 1) + S.M];

// Kleinteile: Grasbüschel, Einzelhalme, Kiesel, Geröll am Wandfuß, Risse, Krumen, Trittspuren
// Wegmitte: kein anderer Boden in diesen Abständen (Feinpixel, Paare dx, dy); Steigungen der Risse
const PROBE = [0, -2, 0, 2, -3, 0, 3, 0, 0, -4, 0, 4, -6, 0, 6, 0], SLOPES = [-0.5, 0, 0.34, 0.5];
function stamps(S) {
  const GR = FK.GRASS, DI = FK.DIRT;
  const pathMid = (F, G) => {
    for (let i = 0; i < 16; i += 2) if (S.kAt(F + PROBE[i], G + PROBE[i + 1]) !== DI) return false;
    return true;
  };
  const topAt = (F, G) => (S.anyRock && rAt(S, F, G) ? rockTopAt(S, F, G) : -1);
  // Krumen und Trittspuren im Erdweg (nur wenn es im Raster Erdweg gibt)
  let anyDirt = false;
  for (let i = 0, K = S.K; i < K.length; i++) if (K[i] === DI) { anyDirt = true; break; }
  if (anyDirt) S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 870);
    if (h >= 0.34) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 871) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 872) * 2);
    if (S.kAt(F, G) !== DI) return;
    if (!GRASSY[sAt(S, F, G)] || rAt(S, F, G)) return;
    const w = 2 + (hash2(cx, cy, 873) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
  if (anyDirt) S.cells(8, 6, 2, (cx, cy) => {
    if (hash2(cx, cy, 862) >= 0.22) return;
    const F = cx * 8 + 1 + Math.floor(hash2(cx, cy, 863) * 4), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 864) * 3);
    if (S.kAt(F, G) !== DI || !GRASSY[sAt(S, F, G)] || !pathMid(F, G)) return;
    S.mark(F, G, -2); S.mark(F + 1, G, -2); S.mark(F, G + 1, 1); S.mark(F + 1, G + 1, 1);
  });
  // Risse: Erdweg, Rotsand, Hochfläche (dunkel, Lichtkante darunter)
  S.cells(16, 12, 8, (cx, cy) => {
    const h = hash2(cx, cy, 840);
    if (h >= 0.3) return;
    const ax = cx * 16 + 2 + Math.floor(hash2(cx, cy, 841) * 6), ay = cy * 12 + 3 + Math.floor(hash2(cx, cy, 842) * 6);
    const k = S.kAt(ax, ay);
    if (k > DI) return;
    const tc = topAt(ax, ay);
    if (tc === 0 || tc === 1 || tc >= 3) return;
    const s = sAt(S, ax, ay);
    const ok = tc === 2 || (k === DI ? (GRASSY[s] ? pathMid(ax, ay) && h < 0.2 : true) : s === S_R || s === S_M || s === S_C);
    if (!ok) return;
    const len = 4 + Math.floor(hash2(cx, cy, 843) * 5), sl = SLOPES[Math.floor(hash2(cx, cy, 844) * 4)];
    stroke(S, ax, ay, len, sl, null, -2, 1);
  });
  // Kiesel: Weg, Rotsand, Flussbett, Schlucht (dicht), vereinzelt im Gras; Geröllsaum am flachen Felsrand
  S.cells(10, 8, 6, (cx, cy) => {
    const h = hash2(cx, cy, 820);
    if (h >= 0.5) return;
    const rx = 1.0 + hash2(cx, cy, 821) * 2.0, ry = rx * (0.62 + hash2(cx, cy, 822) * 0.2);
    const px = cx * 10 + rx + 1 + hash2(cx, cy, 823) * (8 - 2 * rx), py = cy * 8 + ry + 1 + hash2(cx, cy, 824) * (6 - 2 * ry);
    const AF = Math.floor(px), AG = Math.floor(py), k = S.kAt(AF, AG);
    if (k >= FK.PAVE) return;
    const tc = topAt(AF, AG), s = sAt(S, AF, AG);
    if (tc === 0 || tc === 3 || (tc < 0 && (s === S_Q || s === S_W || s === S_S))) return;
    let dens, St = SST;
    if (tc === 2) { dens = 0.05; St = RST; }
    else if (tc === 4 || tc === 5) { dens = 0.45; St = RST; }
    else if (tc === 1) dens = 0.03;
    else if (k === DI && GRASSY[s]) dens = pathMid(AF, AG) ? 0.08 : 0.16;
    else if (s === S_C) { dens = 0.5; St = RST; }
    else if (s === S_R) { dens = 0.06; St = RST; }
    else if (s === S_M) { dens = 0.16; St = RST; }
    else if (s === S_B) { dens = 0.3; St = BST; }
    else dens = s === S_A ? 0.06 : 0.035;
    if (h >= dens) return;
    pebble(S, px, py, rx, ry, St, hash2(cx, cy, 825) < 0.3 ? -1 : 0);
  });
  // Geröll am Fuß der Sandsteinwände (wie nearRock: Brocken bis ~13 px unter der Wand)
  if (S.anyRock) S.cells(5, 4, 4, (cx, cy) => {
    const h = hash2(cx, cy, 830);
    if (h >= 0.5) return;
    const px = cx * 5 + 1.5 + hash2(cx, cy, 831) * 2, py = cy * 4 + 1.2 + hash2(cx, cy, 832) * 1.6;
    const AF = clampI(Math.floor(px), S.F0 - S.M, S.F0 + S.W2 + S.M - 1), AG = clampI(Math.floor(py), S.G0 - S.M, S.G0 + S.H2 + S.M - 1);
    const e = (AG - S.G0 + S.M) * S.KW + AF - S.F0 + S.M;
    if (S.RK[e]) return;
    const since = S.dU[e];
    if (since > 11) return;
    const kd = tKind(S.L, AF, AG - since);
    if (kd === KIND_HILL || topH(kd) <= gAt(S.L, AF, AG) || S.kAt(AF, AG) > FK.DIRT) return;
    if (h >= 0.5 * (1 - since / 24)) return;
    const rx = 0.8 + hash2(cx, cy, 833) * (since < 8 ? 1.6 : 0.9);
    pebble(S, px, py, rx, rx * 0.7, RST, hash2(cx, cy, 834) < 0.4 ? -1 : 0);
  });
  // Grasbüschel und Halme (Zellen 3 × 6, Spalten versetzt): in Horsten gruppiert (Büschelfeld × kleine Horste),
  // dazwischen fast kahl; als Saum am Weg
  const { K, KW, M, F0, G0, SO, RK, patch, gold, fw, m } = S, kMax = (S.H2 + 2 * M - 1) * KW;
  for (let cx = Math.floor((F0 - 3) / 3); cx <= Math.floor((F0 + S.W2 + 3) / 3); cx++) {
    const oy = Math.floor(hash2(cx, 3, 810) * 6);
    for (let cy = Math.floor((G0 - 6 + oy) / 6); cy <= Math.floor((G0 + S.H2 + 8 + oy) / 6); cy++) {
      const h = hash2(cx, cy, 811);
      if (h >= 0.58) continue;                       // höchste Dichte
      const bx = Math.floor(hash2(cx, cy, 812) * 3), F = cx * 3 + bx, G = cy * 6 - oy + 5;
      const ki = (G - G0 + M) * KW + F - F0 + M;   // Anker liegt im Rand des Rasters
      if (K[ki] !== GR) continue;
      const tc = RK[ki] ? rockTopAt(S, F, G) : -1;
      // keine Halme auf Felsflächen (Wand, Kappe, Platten) und Rotsand
      if (tc === 0 || tc >= 2) continue;
      const s = tc === 1 ? S_PLAIN : SO[ki];
      if (s > S_B) continue;
      let R, dens;
      const wi = (((G - G0) >> 1) + m) * fw + ((F - F0) >> 1) + m, p = patch[wi];
      if (s <= S_A) {
        if (s === S_A && h >= 0.45) continue;
        const cl = vnC(N_CL, F / 14, G / 12, 817);
        R = BLR[s === S_PLAIN && gold[wi] > 0.6 ? S_Y : s === S_G && p < 0.4 ? S_PLAIN : s];
        dens = s === S_A ? (cl > 0.62 ? 0.22 : 0.01)
          : p > 0.55 ? (cl > 0.45 ? 0.58 : 0.04) : p > 0.42 ? (cl > 0.6 ? 0.4 : 0.015) : p < 0.28 ? 0.005 : (cl > 0.74 ? 0.26 : 0.008);
      } else if (s === S_M) { R = BL_GLD; dens = vnoise(F / 26, G / 22, 434) > 0.58 ? 0.4 : 0.03; }
      else if (s === S_B) { R = BL_GRS; dens = 0.03; }
      else continue;
      // als Saum über dem Weg dichter
      if (h >= dens && (s > S_A || h >= 0.45 || (K[Math.min(ki + 2 * KW, kMax + (ki % KW))] !== DI && K[Math.min(ki + 3 * KW, kMax + (ki % KW))] !== DI))) continue;
      // Halm darf nicht in Rotsand/Fels hineinragen (Spitze bis 5 Feinpixel höher)
      if (SO[ki - 5 * KW] === S_R || RK[ki - 5 * KW]) continue;
      const hh = 2 + Math.floor(hash2(cx, cy, 813) * 4), l = hash2(cx, cy, 814);
      let lean = l < 0.2 ? -1 : l < 0.4 ? 1 : 0;
      // Büschel: zwei Seitenhalme, nach außen geneigt
      if (hh >= 4 && hash2(cx, cy, 815) < 0.55 && s !== S_A) {
        blade(S, F - 1, G, hh - 2, -1, R); blade(S, F + 1, G, hh - 1, 1, R);
        lean = 0;
      }
      blade(S, F, G, hh, lean, R);
    }
  }
}

// ------------------------------------------------------------ Felsstufen (level.ramps) je Feinpixel
// wie decor_steppe.js rampPixel, an Feinpixel-Koordinaten ausgewertet (Kanten fein, Körnung je Weltpixel)
function rampFine(R, px, py, t) {
  let best = Infinity, s = 0, lat = 0;
  for (const g of R) {
    let u = ((px - g.ax) * g.dx + (py - g.ay) * g.dy) / (g.l * g.l);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = px - g.ax - g.dx * u, qy = py - g.ay - g.dy * u, d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; s = g.acc + u * g.l; lat = (g.dx * qy - g.dy * qx) / g.l; }
  }
  if (best === Infinity) return -1;
  const al = Math.abs(lat), wx = Math.floor(px), wy = Math.floor(py);
  const halfW = 12 + vnC(N_RP, s / 10, lat > 0 ? 3.5 : 9.5, 1401) * 6;
  if (al > halfW + 1.5) return -1;
  if (al > halfW - 1.5 + hash2(wx >> 1, wy >> 1, 1405) * 1.5) return hash2(wx >> 1, wy >> 1, 1404) < 0.45 ? MESR[4] : MESR[2];
  const u = s - (lat * lat) / 48 + (vnC(N_RP1, px / 4, py / 4, 1402) - 0.5) * 1.6;
  const k = Math.floor(u / 10), f = u - k * 10 - hash2(k, 0, 1403) * 1.1;
  const wear = hash2(k, 1, 1406);
  if (f < 0.5) return MESR[1];                                                  // Schattenfuge (1 Feinpixel)
  if (f < 2.3) return MESR[f < 1.4 ? 3 : 4];                                    // Setzstufe: unten dunkler
  if (f < 2.8) return MESR[al > halfW - 4 && wear < 0.5 ? 6 : 8];               // Trittkante im Licht
  if (f < 3.3) return MESR[al > halfW - 4 && wear < 0.5 ? 5 : 7];
  if (wear < 0.35 && Math.abs(lat - (hash2(k, 2, 1411) - 0.5) * 10) < 0.35 && f > 4) return MESR[2];   // Riss
  return MESR[5 + (t > 0.6 ? 1 : 0) - (al > halfW - 3 ? 1 : 0)];
}
// Furt: Trittsteine (wie fordStone, je Feinpixel; Glanz oben links, Unterkante dunkel)
function fordFine(px, py) {
  const cy = Math.floor(py / 7);
  let best = 9, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const ry = cy + dy, o2 = (ry & 1) * 4;
    for (let dx = -1; dx <= 1; dx++) {
      const rx = Math.floor((px + o2) / 8) + dx;
      const ox = rx * 8 - o2 + 4 + (hash2(rx, ry, 427) - 0.5) * 3, oy = ry * 7 + 3.5 + (hash2(rx, ry, 428) - 0.5) * 2;
      const ax = 2.6 + hash2(rx, ry, 429) * 1.0, ay = 2.1 + hash2(rx, ry, 439) * 0.7;
      const d = ((px - ox) / ax) ** 2 + ((py - oy) / ay) ** 2;
      if (d < best) { best = d; bx = ox; by = oy; }
    }
  }
  if (best > 1.5) return WASH[2];
  if (best > 1) return py > by ? WET[2] : WASH[1];
  if (best > 0.72) return py > by ? BST[2] : px < bx && py < by ? BST[5] : BST[3];
  return best < 0.3 && px < bx && py < by ? BST[6] : py > by + 0.8 ? BST[3] : BST[4];
}

// ------------------------------------------------------------ Feinpixel
// Outdoor fragt die Feinpixel zeilenweise von links nach rechts ab: die ganze Zeile auf einmal rechnen (Felder des
// Chunks einmal je Zeile geladen), danach nur noch auslesen
function steppeFine(kind, F, G, K, ki, KW, S) {
  if (G !== S.rowG) fineRow(S, G);
  return S.row[F - S.F0];
}
const DT = Float32Array.from(D4, (v) => v / 16);
function fineRow(S, G) {
  // Trockenrisse der Vorzeile merken (Lichtkante unter dem Riss = Riss eine Feinzeile höher)
  const ckOk = S.rowG === G - 1, ckT = S.ckP;
  S.ckP = S.ckC; S.ckC = ckT; ckT.fill(-1);
  if (!ckOk) S.ckP.fill(-1);
  S.rowG = G;
  const { K, KW, M, F0, G0, W2, RK, SO, abs, rel, tone, patch, gold, row } = S, PAV = FK.PAVE, DI = FK.DIRT, GR = FK.GRASS;
  const shade = S.anyRock && G >= S.shG0 && G <= S.shG1;
  const g = G - G0, kb = (g + M) * KW + M, ob = g * W2, wr = ((g >> 1) + S.m) * S.fw + S.m, d4 = (G & 3) * 4;
  for (let f = 0; f < W2; f++) {
    const ki = kb + f, kind = K[ki];
    if (kind > PAV) { row[f] = -1; continue; }                 // Wasser: Weltpixel-Shader
    const F = F0 + f, o = ob + f;
    if (RK[ki]) { row[f] = rockCol(S, F, G, o, K, ki, KW); continue; }
    const s = SO[ki], a = abs[o], dt = DT[d4 + (F & 3)], wi = wr + (f >> 1), t = tone[wi];
    let c;
    if (kind === GR && s <= S_A && a < 0) {
      // Gras (häufigster Fall, wie soilCol): Grundton in Stufen, Strohgold, sattes Gras in Horsten, kahle Flecken
      const p = patch[wi];
      let R = BASE[s];
      if (s === S_PLAIN) { const gv = gold[wi]; if (gv > 0.62 || (gv > 0.58 && dt < (gv - 0.58) / 0.04)) R = GLD; }
      else if (s === S_G && (p < 0.38 || (p < 0.41 && dt < (0.41 - p) / 0.03))) R = GRS;
      if (K[ki - KW] === DI) c = R === ASH ? ASH[4] : R[4];
      else {
        if (s <= S_Y && (p < 0.19 || (p < 0.22 && dt < (0.22 - p) / 0.03))) c = DRT[3];
        else { const v = t * 3, k = Math.floor(v), q = v - k; c = R[1 + clampI(k + (q > 0.6 ? 1 : q > 0.4 && dt < (q - 0.4) / 0.2 ? 1 : 0), 0, 2)]; }
        if (rel[o] < 0) c = darken(c, 0.62);
      }
    } else if (kind === PAV) c = s === S_W ? fordFine(F / 2, G / 2) : paveCol(F, G);
    else if (kind === DI && GRASSY[s]) c = pathCol(K, ki, KW, S, F, G, o, a, dt, t, wi, s);
    else if (a >= 0) c = a;
    else c = soilCol(kind, K, ki, KW, S, F, G, o, dt, t, wi, s);
    row[f] = shade ? rockShade(S, F, G, ki, c, dt) : c;
  }
}

function paveCol(F, G) {
  const i = paveIdx(F, G);
  return i < 0 ? MORT : PAVE[clampI(i, 1, 5)];
}

// Erdweg in der Steppe: Rand zur Grasnarbe dunkel, Halme wachsen hinein, Wagenspuren als dunkle Bänder
function pathCol(K, ki, KW, S, F, G, o, a, dt, t, wi, s) {
  const GR = FK.GRASS;
  if (K[ki - KW] === GR) return DRT[1];
  if (a >= 0) return a;
  const up2 = K[ki - 2 * KW] === GR, dn1 = K[ki + KW] === GR, dn2 = K[ki + 2 * KW] === GR, dn3 = K[ki + 3 * KW] === GR;
  const near = up2 || dn1 || dn2 || K[ki - 1] === GR || K[ki + 1] === GR || K[ki - 2] === GR || K[ki + 2] === GR;
  let i = 3 + clampI(band(t, 2.8, dt), 0, 3) + (near ? -1 : 0);
  const r = S.rut[wi];
  if (r > 0.74 || (r > 0.7 && dt < (r - 0.7) / 0.04)) i -= 1;
  if (up2) i = Math.min(i, 3);
  if (dn1 || dn2 || dn3) {
    const e = dn1 ? 1 : dn2 ? 2 : 3, hb = hash2(F, G + e, 860);
    const hh = hb < 0.5 ? 1 + Math.floor(hb * 6) : 0;
    if (e <= hh) { const R = BLR[s]; return R[e === hh ? 4 : 3]; }
  }
  return DRT[clampI(i + S.rel[o], 0, 7)];
}

// Untergrund der Bodenarten (ohne Weg)
function soilCol(kind, K, ki, KW, S, F, G, o, dt, t, wi, s) {
  const rel = S.rel[o], dirt = kind === FK.DIRT ? 1 : 0;
  let c;
  if (s <= S_A) {
    // Gras: Grundton in Stufen, Strohgold-Flächen, kahle Erdflecken; Oberkante der Grasnarbe am Weg hell.
    // Sattes Gras nur in Horsten (Fleckenfeld), dazwischen Steppengras
    const p = S.patch[wi];
    let R = BASE[s];
    if (s === S_PLAIN) { const gv = S.gold[wi]; if (gv > 0.62 || (gv > 0.58 && dt < (gv - 0.58) / 0.04)) R = GLD; }
    else if (s === S_G && (p < 0.38 || (p < 0.41 && dt < (0.41 - p) / 0.03))) R = GRS;
    if (K[ki - KW] === FK.DIRT) return R === ASH ? ASH[4] : R[4];
    if ((s === S_PLAIN || s === S_Y) && (p < 0.19 || (p < 0.22 && dt < (0.22 - p) / 0.03))) c = DRT[3];
    else c = R[1 + clampI(band(t, 3, dt), 0, 2)];
  } else if (s === S_R || s === S_Q) {
    if (s === S_Q) { const r = rampFine(S.segs, F / 2, G / 2, t); if (r >= 0) return r; }
    // Rotsand: Windrippel als feine Linien (Kamm hell, Lee dunkel darunter)
    const ph = F * 0.21 + G * 0.08 + S.patch[wi] * 7, q = ph / 6.2832 - Math.floor(ph / 6.2832);
    let i = 1 + clampI(band(t, 2.6, dt), 0, 2) + dirt;
    if (q < 0.06) i += 1; else if (q < 0.1) i += dt < 0.5 ? 1 : 0; else if (q < 0.2) i -= 1;
    c = RED[clampI(i + (rel > 0 ? 1 : 0), 0, 6)];
  } else if (s === S_S || s === S_B) {
    // Salzkruste / Flussbett: Trockenrisse als Netz (1 Feinpixel, Lichtkante darunter)
    const px = F / 2, py = G / 2, A = s === S_S ? 404 : 406, code = s === S_S ? 0 : 2, f = F - S.F0, cr = dryCrack(px, py, A, N_CA);
    S.ckC[f] = code + (cr ? 1 : 0);
    if (cr) return s === S_S ? SALT[1] : BED[0];
    const pv = S.ckP[f], lit = pv >= 0 && (pv & 2) === code ? (pv & 1) === 1 : dryCrack(px, py - 0.5, A, N_CC);
    if (s === S_S) c = SALT[lit ? 5 : 2 + clampI(band(t, 3, dt), 0, 2) + dirt];
    else {
      // Uferkante: dunkler, wo das Bett endet
      const bank = sAt(S, F, G - 14) !== S_B || sAt(S, F, G + 14) !== S_B;
      c = BED[lit ? 4 : clampI(1 + band(t, 2.6, dt) + dirt - (bank ? 1 : 0), 0, 5)];
    }
  } else if (s === S_C) {
    const i = 2 + clampI(band(t, 2.6, dt), 0, 2) + dirt;
    c = CAN[clampI(i, 0, 5)];
  } else if (s === S_W) {
    // Bachbett: schmale feuchte Läufe zwischen Kiesbänken, Pfützenglanz; Furten
    const px = F / 2, py = G / 2;
    if (kind === FK.DIRT && vnC(N_W0, px / 5, py / 5, 426) > 0.45) return fordFine(px, py);
    const c1 = Math.abs(vnC(N_W1, px / 15, py / 13, 420) - 0.5), c2 = Math.abs(vnC(N_W2, px / 9, py / 11, 419) - 0.5);
    if (c1 < 0.04 || c2 < 0.018) {
      if (c1 < 0.03 && vnC(N_W3, px / 6, py / 5, 418) > 0.72) return c1 < 0.008 && (G & 1) === 0 ? PUD[1] : PUD[0];
      return WET[c1 < 0.016 ? 2 : 3];
    }
    if (c1 < 0.05 || c2 < 0.026) return WET[4];
    if (c1 < 0.06 || c2 < 0.032) return WASH[4];
    c = WASH[clampI(2 + band(t, 2.4, dt), 1, 5)];
  } else {
    // Hochfläche: Kappe mit dünner Erde, Risse, Strohhalme (Stempel)
    c = capCol(F, G, dt, t, dirt);
  }
  return rel < 0 ? darken(c, 0.62) : c;
}

// Trockenrisse (Salz 404/405, Flussbett 406/407) als Netz aus zwei Rauschlinien (n, n+1: Aufrufstellen)
function dryCrack(x, y, A, n) {
  return Math.abs(vnC(n, x / 7, y / 6, A) - 0.5) < 0.026 || Math.abs(vnC(n + 1, x / 11, y / 9, A + 1) - 0.5) < 0.018;
}
// Tafelberg-Kappe: rötlicher Fels mit dünner Erde, feine Risse mit Lichtkante
function capCol(F, G, dt, t, dirt) {
  const cr = Math.abs(vnC(N_CAP, F / 26, G / 18, 433) - 0.5);
  if (cr < 0.006) return CAP[0];
  if (cr < 0.03 && Math.abs(vnC(N_CAP1, F / 26, (G - 1) / 18, 433) - 0.5) < 0.006) return CAP[5];
  return CAP[clampI(1 + band(t, 3.4, dt) + dirt, 0, 6)];
}
// Schluchtrand: Sandsteinplatten im Rotsand (Oberkante und linke Kante im Licht, Unterkante dunkel, Fuge)
function slabCol(F, G, dt, t) {
  const v = vnC(N_SL, F / 16, G / 12, 1355);
  if (v > 0.6) {
    if (vnC(N_SL1, F / 16, (G - 1) / 12, 1355) <= 0.6 || vnC(N_SL2, (F - 1) / 16, G / 12, 1355) <= 0.6) return MESR[7];
    if (vnC(N_SL3, F / 16, (G + 1) / 12, 1355) <= 0.6) return MESR[4];
    return MESR[5 + (t > 0.62 || (t > 0.58 && dt < 0.5) ? 1 : 0)];
  }
  if (v > 0.575) return MESR[2];
  return RED[2 + clampI(band(t, 2.6, dt), 0, 2)];
}

// ------------------------------------------------------------ Fels je Feinpixel
// Wand (3/4-Sicht): Gesteinsbänder in gleicher Höhe über dem Fuß, oben die harte Kappe (Lichtkante 1 Feinpixel,
// Unterschneidung dunkel), Rinnen, Klüfte, Wüstenlack; Licht von links in harten Stufen, unten dunkler, Fuß am dunkelsten
const STRATA2 = [6, 5, 5, 6, 4, 3, 5, 6, 6, 5, 4, 4, 5, 3, 2, 4, 5, 6, 5, 5, 4, 3, 3, 4, 5, 5, 6, 4, 3, 4, 5, 4];
const CAPROW = [8, 7, 7, 6, 6, 6, 2, 2];
function faceCol(S, F, G, e, b, fh, kd) {
  const L = S.L, ci = kd * L.FW + clampI(F, 0, L.FW - 1), tF = b - 1, top = fh - b;
  const dl = S.dL[e], dr = S.dR[e], C = S.col;
  if (kd === KIND_HILL) {
    // Randhügel: erdige Böschung mit Felsbrocken und überhängender Grasnarbe (Fransen je Feinpixelspalte)
    if (top <= 3 || (top <= 7 && hash2(F, 1, 1330) < 0.45 - (top >> 1) * 0.1)) return GLD[top <= 1 ? 5 : 3 + (hash2(F, 3, 1331) < 0.5 ? 1 : 0)];
    const px = F / 2, py = G / 2;
    let k = 2 + Math.floor((vnC(N_HF, px / 5, py / 4, 1332) * 0.7 + 0.15) * 4);
    // Felsbrocken in der Erde: Flanke oben links im Licht, Rand unten dunkel
    const by = (py + tF * 0.25) / 5, blk = vnC(N_HB, px / 6, by, 1334);
    if (blk > 0.66) k += vnC(N_HB1, (px - 1) / 6, by - 0.2, 1334) < blk - 0.012 ? 3 : 1;
    else if (blk > 0.6) k -= 1;
    if (dl <= 2) k = Math.max(k, 7); else if (dl <= 4) k += 1;
    if (dr <= 2) k = Math.min(k, 1); else if (dr <= 4) k -= 1;
    if (tF < 6) k = Math.min(k, 1 + (tF >> 1));
    if (tF > fh * 0.7) k += 1;
    return UPF[clampI(k, 0, 8)];
  }
  const s = tF * 0.5 + C.wav[ci - kd * L.FW] + (kd === KIND_RIM ? 7 : 0);
  let k = STRATA2[((Math.floor(s / 1.4) % 32) + 32) % 32];
  const tint = TINT[kd * 64 + (Math.floor((s + 64) / 7) & 63)];
  let R = tint < 0.22 ? PALER : tint < 0.4 ? DEEPR : MESR;
  if (top < 8) { k = CAPROW[top]; if (top < 6) R = MESR; } else if (top < 10) k = Math.min(k, 3);
  // Erosionsrinnen unter der Kappe, unterschiedlich lang; tiefe Klüfte; Wüstenlack von der Kante herab
  const g = C.gC[ci];
  if (g && top > 9 && top < 12 + C.gH[ci] * fh) k += g;
  if (top > 5 && C.clC[ci] < 0.1) k -= 3;
  const lk = C.lk[ci];
  if (lk >= 0 && top > 7 && top < 12 + lk * fh) k -= 1;
  if (top > 0) {
    if (dl <= 2) k = Math.max(k + 2, 7); else if (dl <= 4) k += 1;
    if (dr <= 2) k = Math.min(k - 1, 2); else if (dr <= 4) k -= 1;
  }
  const v = tF / fh;
  if (v > 0.62) k += 1; else if (v < 0.22) k -= 1;
  if (tF < 4) k = Math.min(k, 1 + (tF >> 1));
  return R[clampI(k, 0, 8)];
}
// Schluchtwand in Aufsicht (wie rimWall): dF Abstand zum Grund, dP zur Ebene (Feinpixel), lit = Wand schaut nach Westen
function rimCol(F, G, dF, dP, lit, lip) {
  if (dP <= 2 || lip) return lit ? MESR[8] : MESR[6];                                   // Abbruchkante
  if (dP <= 4) return lit ? MESR[7] : MESR[5];
  const s = dF * 0.75 + (vnC(N_RW, F / 18, G / 18, 1382) - 0.5) * 4;
  const st = STRATA2[((Math.floor(s) % 32) + 32) % 32] - 1;
  let k = lit ? st + 1 : 2 + Math.round((st - 3.5) * 0.4);
  // Rinnen laufen die Wand hinab (quer zur Kante)
  const g = vnC(N_RG, F / 20, G / 5.2, 1383);
  if (g < 0.2) k -= 2; else if (g < 0.27) k += 1;
  if (dF <= 4) k = Math.min(k, lit ? 3 : 1);
  return MESR[clampI(k, 0, 8)];
}
function rockCol(S, F, G, o, K, ki, KW) {
  const e = ki, c = rockClass(S, F, G, e), a = S.abs[o];
  if (a >= 0 && c !== C_RIMW && c !== C_LIPU) return a;
  const kd = S.qk;
  switch (c) {
    case C_FACE: return faceCol(S, F, G, e, S.qa, S.qb, kd);
    case C_RIMW: return rimCol(F, G, S.qa, S.qb, S.qc, S.qd);
    case C_SLOPE: {
      // Böschung der Randhügel: Erde, oben Grasnarbe (zur Ebene), unten dunkler
      const dF = S.qa, useL = S.qc;
      if (dF >= S.qb - 2) return useL ? GLD[5] : GLD[3];
      let k = (useL ? 5 : 2) + Math.floor(vnC(N_BK, F / 8, G / 6, 1388) * 2.4) - (dF <= 4 ? 2 : 0);
      if (vnC(N_BK2, F / 18, G / 5, 1389) < 0.2) k -= 1;
      return UPF[clampI(k, 0, 8)];
    }
    case C_SIDER: return (kd === KIND_HILL ? UPF : MESR)[(S.qa <= 2 ? 1 : 2) + (STRATA2[(G >> 2) & 31] > 5 ? 1 : 0)];
    case C_SIDEL: return (kd === KIND_HILL ? UPF : MESR)[(S.qa <= 2 ? 7 : S.qa <= 4 ? 6 : 5) + (STRATA2[(G >> 2) & 31] < 4 ? -1 : 0)];
    case C_LIPU: return S.qa <= 2 ? (kd === KIND_HILL ? GLD[5] : MESR[8]) : (kd === KIND_HILL ? UPF[6] : MESR[6]);
  }
  const f = F - S.F0, g = G - S.G0, dt = D4[(G & 3) * 4 + (F & 3)] / 16, wi = ((g >> 1) + S.m) * S.fw + (f >> 1) + S.m, t = S.tone[wi];
  if (c === C_CAP || c === C_CAPE || c === C_CAPF) { const v = capCol(F, G, dt, t, c === C_CAPE ? 1 : 0); return S.rel[o] < 0 ? darken(v, 0.62) : v; }
  if (c === C_SLAB || c === C_SLABF) return slabCol(F, G, dt, t);
  // Randhügel: Grasdecke, innen heller (Stufen), Felsköpfe mit Licht oben links und Schatten unten rechts
  const v = vnC(N_KN, F / 18, G / 14, 1361);
  if (v > 0.76) {
    const w = vnC(N_KN1, (F - 3) / 18, (G - 3) / 14, 1361), lit = w < v;
    if (v > 0.8) return lit ? (v - w > 0.012 ? UPF[8] : UPF[7]) : v > 0.84 ? UPF[6] : UPF[5];
    return lit ? UPF[6] : UPF[3];
  }
  let col = soilCol(FK.GRASS, K, ki, KW, S, F, G, o, dt, t, wi, S_PLAIN);
  if (v > 0.62 && vnC(N_KN2, (F - 2) / 18, (G - 3) / 14, 1361) > 0.76) col = darken(col, 0.62);
  return shadeC(col, 0.92 + 0.12 * bandW((S.qa - 0.92) / 0.12, 1, dt, 0.1));
}

// Schlagschatten unter Felswänden (harte Stufen mit gerasterter Grenze) und Schatten rechts der Felsen
function rockShade(S, F, G, e, c, dt) {   // e: Index im Terrainraster
  const since = S.dU[e], lf = S.dL[e];
  if (since >= 16 && lf >= 16) return c;
  let k = 1;
  const gh = gAt(S.L, F, G);
  if (since < 16 && topH(tKind(S.L, F, G - since)) > gh) {
    if (since <= 5 || (since <= 7 && dt < 0.5)) k = 0.56;
    else if (since <= 12 || (since <= 14 && dt < 0.5)) k = 0.74;
  }
  if (lf < 16) {
    const reach = gh < 0 ? 16 : 6;
    if (lf <= reach && topH(tKind(S.L, F - lf, G)) > gh) {
      const kk = gh < 0 ? (lf <= 8 || (lf <= 10 && dt < 0.5) ? 0.66 : 0.8) : lf <= 3 || (lf <= 5 && dt < 0.5) ? 0.74 : 1;
      k = Math.min(k, kk);
    }
  }
  return k === 1 ? c : darken(c, k);
}

export const FINE_STEPPE = { finePixel: steppeFine, fineSetup: steppeSetup, fineTufts: false };
