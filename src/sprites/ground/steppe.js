import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, D4, clampI, band, darken, vnoise, field, chunkCtx, pebble, blade, stroke, paveIdx } from './kit.js';

// Feinraster-Boden: Aschensteppe (level.biome 'steppe'). Weltpixel-Shader: sprites/decor_steppe.js (steppePixel, nur gelesen).
// Bodenarten aus level.soil wie dort (gleiches Verwackeln der Grenzen, hier je Feinpixel ausgewertet):
//   ' ' Steppengras mit Strohgold-Flächen, y Strohgold, g sattes Gras, a Ascheflur, r Rotsand (k Schluchtrand → r),
//   s Salzkruste, b trockenes Flussbett, c Schluchtgrund, w Bachbett mit Furten, m Hochfläche, q Felsstufen (level.ramps).
// Felsen ('%', Maske wie dort, je Feinpixel → feiner Umriss) zeichnet weiter der Weltpixel-Shader (-1); Feinpixel am
// Umriss, die nur im Feinraster Fels sind, nehmen die Felsfarbe des Nachbar-Weltpixels. Schlagschatten unter Wänden,
// Schatten rechts der Felsen und Geröll am Wandfuß baut der Feinboden selbst (harte Stufen statt Verlauf).

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
  // Bodenart je Kachel als Code; einheitliche Kacheln (3×3 gleich) ohne Verwackeln
  const sc = new Uint8Array(W * H), uni = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sc[y * W + x] = SCODE[SO[y]?.[x] ?? ' '] ?? 0;
  if (level.soil) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const c = SO[y][x]; let ok = 1;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (SO[y + dy][x + dx] !== c) { ok = 0; break; }
    uni[y * W + x] = ok;
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
  // Zellen zwischen vier Kachelmitten (tx, ty = −1 … W−1): Bits der vier Ecken (0 frei, 15 Fels)
  const cell = new Uint8Array((W + 1) * (H + 1));
  for (let ty = -1; ty < H; ty++) for (let tx = -1; tx < W; tx++) cell[(ty + 1) * (W + 1) + tx + 1] = at(tx, ty) | at(tx + 1, ty) << 1 | at(tx, ty + 1) << 2 | at(tx + 1, ty + 1) << 3;
  L = { W, H, rock, at, cell, kindT, gT, sc, uni, soil: !!level.soil, segs };
  LV.set(level, L);
  return L;
}

// ------------------------------------------------------------ Vorarbeit je Chunk
// Raster im Format des Terrainrasters K (Feinpixel mit Rand M, gleicher Index ki): Bodenart SO, Fels RK.
function* steppeSetup(x0, y0, cw, ch, K, KW, M, map) {
  const level = map.level, L = levelData(level);
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  const { W2, H2, F0, G0 } = S, KH = H2 + 2 * M, n = KW * KH;
  S.level = level; S.shader = map.pal.pixel; S.L = L;
  // Rauschfelder (Weltpixel mit Rand): Grundton (zwei Lagen auf einem Gitter), Flecken (auch Fahrspuren), Goldflächen
  S.tone = field(S.fx0, S.fy0, S.fw, S.fh, 4, (x, y) => vnoise(x / 11, y / 11, 801) * 0.65 + vnoise(x / 4, y / 4, 802) * 0.35, new Float32Array(S.n), false, 1);
  S.patch = S.noise([[4, 19, 15, 803, 1]]);
  S.gold = S.noise([[8, 60, 48, 451, 1]]);
  S.rut = S.patch;
  yield;
  S.SO = soilGrid(S, L);
  yield;
  S.RK = new Uint8Array(n);
  S.anyRock = rockGrid(S, L);
  if (S.anyRock) {
    rockRuns(S, L);
    yield;
    rockTops(S, L, x0, y0, cw, ch);
  }
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
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const cx = gx0 + i, cy = gy0 + j;
        // Ausschlag höchstens ±15 px (< 1 Kachel: einheitliche Kacheln bleiben einheitlich); gröber und weiter als
        // im Weltpixel-Shader, damit lange gerade Kartengrenzen (Rotsand, Strohgold) sichtbar gebrochen werden
        jx[j * gw + i] = (vnoise(cx * 4 / 13, cy * 4 / 13, 401) - 0.5) * 22 + (vnoise(cx * 4 / 5, cy * 4 / 5, 403) - 0.5) * 8;
        jy[j * gw + i] = (vnoise(cx * 4 / 13, cy * 4 / 13, 402) - 0.5) * 22 + (vnoise(cx * 4 / 5, cy * 4 / 5, 404) - 0.5) * 8;
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

// Felsmaske je Feinpixel (wie decor_steppe.js maskRaw, an Feinpixel-Ecken ausgewertet: gerade F/G = Weltpixel).
// Zellen zwischen vier Kachelmitten: alle frei / alle Fels blockweise, sonst je Feinpixel
function rockGrid(S, L) {
  const { KW, M, F0, G0, RK } = S, KH = S.H2 + 2 * M;
  let any = false;
  // Zelle (cx, cy) reicht von Feinpixel 32·cx + 16 bis 32·cx + 47 (tx = floor(px / 16 − 0,5) = cx)
  const cx0 = Math.floor((F0 - M - 16) / 32), cx1 = Math.floor((F0 - M + KW - 1 - 16) / 32);
  const cy0 = Math.floor((G0 - M - 16) / 32), cy1 = Math.floor((G0 - M + KH - 1 - 16) / 32);
  for (let ty = cy0; ty <= cy1; ty++) for (let tx = cx0; tx <= cx1; tx++) {
    const a = L.at(tx, ty), b = L.at(tx + 1, ty), c = L.at(tx, ty + 1), d = L.at(tx + 1, ty + 1);
    if (!(a | b | c | d)) continue;
    any = true;
    const ga = Math.max(0, ty * 32 + 16 - (G0 - M)), gb = Math.min(KH, ty * 32 + 48 - (G0 - M));
    const fa = Math.max(0, tx * 32 + 16 - (F0 - M)), fb = Math.min(KW, tx * 32 + 48 - (F0 - M));
    if (a & b & c & d) { for (let g = ga; g < gb; g++) RK.fill(1, g * KW + fa, g * KW + fb); continue; }
    for (let g = ga; g < gb; g++) {
      const py = (G0 - M + g) / 2, ay = py / 16 - 0.5 - ty;
      for (let f = fa; f < fb; f++) {
        const px = (F0 - M + f) / 2, ax = px / 16 - 0.5 - tx;
        const v = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
        if (v < 0.04 || v > 0.96) { if (v > 0.5) RK[g * KW + f] = 1; continue; }   // Rauschen reicht nicht über ±0,46
        const nn = (vnoise(px / 13, py / 11, 1300) - 0.5) * 0.5 + (vnoise(px / 6, py / 6, 1301) - 0.5) * 0.3 + (vnoise(px / 2.5, py / 2.5, 1302) - 0.5) * 0.12;
        if (v + nn > 0.5) RK[g * KW + f] = 1;
      }
    }
  }
  return any;
}

// Schatten am Fels: Abstand nach oben (Wand darüber) und nach links (Fels links), in Feinpixeln, mit Felsart
function rockRuns(S, L) {
  const { KW, M, F0, G0, RK, H2 } = S, KH = H2 + 2 * M, Wt = L.W, Ht = L.H, n = KW * KH;
  const up = new Uint8Array(n), upK = new Uint8Array(n), lf = new Uint8Array(n), lfK = new Uint8Array(n);
  let lt = -1, lk = 0;
  const kAtT = (F, G) => { const k = clampI(G >> 5, 0, Ht - 1) * Wt + clampI(F >> 5, 0, Wt - 1); if (k !== lt) { lt = k; lk = L.kindT[k] || KIND_MESA; } return lk; };
  for (let f = 0; f < KW; f++) {
    let run = 255, kd = 0;
    for (let g = 0, k = f; g < KH; g++, k += KW) {
      if (RK[k]) { run = 0; kd = kAtT(F0 - M + f, G0 - M + g); } else if (run < 255) run++;
      up[k] = run; upK[k] = kd;
    }
  }
  for (let g = 0; g < KH; g++) {
    let run = 255, kd = 0;
    for (let f = 0, k = g * KW; f < KW; f++, k++) {
      if (RK[k]) { run = 0; kd = kAtT(F0 - M + f, G0 - M + g); } else if (run < 255) run++;
      lf[k] = run; lfK[k] = kd;
    }
  }
  S.up = up; S.upK = upK; S.lf = lf; S.lfK = lfK;
}

// Hochflächen der Felsen im Feinraster (wie decor_steppe.js topPixel, nur das Innere): Randhügel-Grasdecke (1),
// Tafelberg-Kappe (2), Sandsteinplatten des Schluchtrands (3). Wände, Abbrüche, Böschungen und Ränder bleiben beim
// Weltpixel-Shader (0). Felsmaske dafür in Weltpixeln mit weitem Rand (Abstände bis 30 px, Wandfuß bis 40 px tiefer).
const TM = 8, AX = 32, AU = 6, AD = 42;
function rockTops(S, L, x0, y0, cw, ch) {
  const wx0 = x0 - TM - AX, wy0 = y0 - TM - AU, ww = cw + 2 * TM + 2 * AX, wh = ch + 2 * TM + AU + AD, PW = L.W * 16 - 1, PH = L.H * 16 - 1;
  const WM = new Uint8Array(ww * wh);
  for (let j = 0; j < wh; j++) {
    const py = clampI(wy0 + j, 0, PH), fy = py / 16 - 0.5, ty = Math.floor(fy), ay = fy - ty;
    for (let i = 0; i < ww; i++) {
      const px = clampI(wx0 + i, 0, PW), fx = px / 16 - 0.5, tx = Math.floor(fx), ax = fx - tx;
      const cb = L.cell[(ty + 1) * (L.W + 1) + tx + 1];
      if (cb === 0) continue;
      if (cb === 15) { WM[j * ww + i] = 1; continue; }
      const a = cb & 1, b = (cb >> 1) & 1, c = (cb >> 2) & 1, d = cb >> 3;
      const v = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
      if (v < 0.04 || v > 0.96) { if (v > 0.5) WM[j * ww + i] = 1; continue; }
      const nn = (vnoise(px / 13, py / 11, 1300) - 0.5) * 0.5 + (vnoise(px / 6, py / 6, 1301) - 0.5) * 0.3 + (vnoise(px / 2.5, py / 2.5, 1302) - 0.5) * 0.12;
      if (v + nn > 0.5) WM[j * ww + i] = 1;
    }
  }
  const gW = (px, py) => L.gT[clampI(py >> 4, 0, L.H - 1) * L.W + clampI(px >> 4, 0, L.W - 1)];
  const kW = (px, py) => L.kindT[clampI(py >> 4, 0, L.H - 1) * L.W + clampI(px >> 4, 0, L.W - 1)] || KIND_MESA;
  const cwT = cw + 2 * TM, chT = ch + 2 * TM, cls = new Uint8Array(cwT * chT), lum = new Float32Array(cwT * chT);
  // Abstände zum nächsten offenen Pixel: links/rechts (je Zeile), oben/unten (je Spalte); 0 = keins in Reichweite
  const dl = new Uint8Array(ww * wh), dr = new Uint8Array(ww * wh), du = new Uint8Array(ww * wh), dd = new Uint8Array(ww * wh);
  for (let j = 0; j < wh; j++) {
    let last = -999;
    for (let i = 0; i < ww; i++) { const k = j * ww + i; if (!WM[k]) last = i; else if (i - last < 250) dl[k] = i - last; }
    last = 9999;
    for (let i = ww - 1; i >= 0; i--) { const k = j * ww + i; if (!WM[k]) last = i; else if (last - i < 250) dr[k] = last - i; }
  }
  for (let i = 0; i < ww; i++) {
    let last = -999;
    for (let j = 0; j < wh; j++) { const k = j * ww + i; if (!WM[k]) last = j; else if (j - last < 250) du[k] = j - last; }
    last = 9999;
    for (let j = wh - 1; j >= 0; j--) { const k = j * ww + i; if (!WM[k]) last = j; else if (last - j < 250) dd[k] = last - j; }
  }
  let any = false;
  for (let y = 0; y < chT; y++) for (let x = 0; x < cwT; x++) {
    const i = x + AX, j = y + AU, k = j * ww + i;
    if (!WM[k]) continue;
    // Felsart je Kachel, Grenze verwackelt (sonst endet z. B. die Grasdecke der Randhügel an einer geraden Kachelkante)
    const px = wx0 + i, py = wy0 + j;
    const kd = kW(px + Math.round((vnoise(px / 9, py / 8, 1371) - 0.5) * 16), py + Math.round((vnoise(px / 9, py / 8, 1372) - 0.5) * 16)), th = topH(kd);
    // Wand (Fuß tiefer, innerhalb der größten Wandhöhe): Weltpixel-Shader
    const b = dd[k];
    if (b && b <= 40 && gW(px, py + b) < th) continue;
    const far = kd === KIND_RIM ? 30 : kd === KIND_HILL ? 16 : 10;
    const l = dl[k] && dl[k] <= far ? dl[k] : 0, r = dr[k] && dr[k] <= far ? dr[k] : 0, u = du[k] && du[k] <= 4 ? du[k] : 0;
    const lowL = l && gW(px - l, py) < th, lowR = r && gW(px + r, py) < th, lowU = u && gW(px, py - u) < th;
    let c = 0;
    if (kd === KIND_HILL) {
      if ((lowL && l <= 14) || (lowR && r <= 14) || (lowU && u <= 4)) continue;
      const dIn = Math.min(l || 24, r || 24, (u || 12) * 2, b && b <= 24 ? b : 24);
      let lu = 0.92 + 0.36 * Math.min(1, dIn / 22);
      if (lowL && l < 18) lu += 0.12 * (1 - l / 18);
      if (lowR && r < 18) lu -= 0.18 * (1 - r / 18);
      lum[y * cwT + x] = lu; c = 1;
    } else if (kd === KIND_MESA) {
      if (l || r || u) continue;
      c = 2;
    } else {
      if (lowL || lowR || (l && l <= 3) || (r && r <= 3) || u) continue;
      c = 3;
    }
    cls[y * cwT + x] = c; any = true;
  }
  S.cls = any ? cls : null; S.lum = lum; S.cwT = cwT; S.chT = chT;
}
// Klasse der Felshochfläche am Feinpixel (0 = Weltpixel-Shader)
const topAt = (S, F, G) => {
  if (!S.cls) return 0;
  const x = (F >> 1) - S.x0 + TM, y = (G >> 1) - S.y0 + TM;
  return x < 0 || y < 0 || x >= S.cwT || y >= S.chT ? 0 : S.cls[y * S.cwT + x];
};

// Bodenart / Fels am Anker (Rand des Rasters wie kAt)
const sAt = (S, F, G) => S.SO[(clampI(G - S.G0, -S.M, S.H2 + S.M - 1) + S.M) * S.KW + clampI(F - S.F0, -S.M, S.W2 + S.M - 1) + S.M];
const rAt = (S, F, G) => S.RK[(clampI(G - S.G0, -S.M, S.H2 + S.M - 1) + S.M) * S.KW + clampI(F - S.F0, -S.M, S.W2 + S.M - 1) + S.M];
// Bodenhöhe der Kachel (Schluchtgrund -1, Hochfläche +1)
const gAt = (S, F, G) => S.L.gT[clampI(G >> 5, 0, S.L.H - 1) * S.L.W + clampI(F >> 5, 0, S.L.W - 1)];

// Kleinteile: Grasbüschel, Einzelhalme, Kiesel, Geröll am Wandfuß, Risse, Krumen, Trittspuren
// Wegmitte: kein anderer Boden in diesen Abständen (Feinpixel, Paare dx, dy); Steigungen der Risse
const PROBE = [0, -2, 0, 2, -3, 0, 3, 0, 0, -4, 0, 4, -6, 0, 6, 0], SLOPES = [-0.5, 0, 0.34, 0.5];
function stamps(S) {
  const GR = FK.GRASS, DI = FK.DIRT;
  const pathMid = (F, G) => {
    for (let i = 0; i < 16; i += 2) if (S.kAt(F + PROBE[i], G + PROBE[i + 1]) !== DI) return false;
    return true;
  };
  // Krumen und Trittspuren im Erdweg
  S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 870);
    if (h >= 0.34) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 871) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 872) * 2);
    if (S.kAt(F, G) !== DI) return;
    if (!GRASSY[sAt(S, F, G)] || rAt(S, F, G)) return;
    const w = 2 + (hash2(cx, cy, 873) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
  S.cells(8, 6, 2, (cx, cy) => {
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
    const k = S.kAt(ax, ay), s = sAt(S, ax, ay);
    const tc = rAt(S, ax, ay) ? topAt(S, ax, ay) : -1;
    if (tc === 0 || tc === 1 || tc === 3 || k > DI) return;
    const ok = tc === 2 || (k === DI ? (GRASSY[s] ? pathMid(ax, ay) && h < 0.2 : true) : s === S_R || s === S_M || s === S_C);
    if (!ok) return;
    const len = 4 + Math.floor(hash2(cx, cy, 843) * 5), sl = SLOPES[Math.floor(hash2(cx, cy, 844) * 4)];
    stroke(S, ax, ay, len, sl, null, -2, 1);
  });
  // Kiesel: Weg, Rotsand, Flussbett, Schlucht (dicht), vereinzelt im Gras
  S.cells(10, 8, 6, (cx, cy) => {
    const h = hash2(cx, cy, 820);
    if (h >= 0.5) return;
    const rx = 1.0 + hash2(cx, cy, 821) * 2.0, ry = rx * (0.62 + hash2(cx, cy, 822) * 0.2);
    const px = cx * 10 + rx + 1 + hash2(cx, cy, 823) * (8 - 2 * rx), py = cy * 8 + ry + 1 + hash2(cx, cy, 824) * (6 - 2 * ry);
    const AF = Math.floor(px), AG = Math.floor(py), k = S.kAt(AF, AG), s = sAt(S, AF, AG);
    const tc = rAt(S, AF, AG) ? topAt(S, AF, AG) : -1;
    if (k >= FK.PAVE || tc === 0 || tc === 3 || s === S_Q || s === S_W || s === S_S) return;
    let dens, St = SST;
    if (tc === 2) { dens = 0.05; St = RST; }
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
    const AF = Math.floor(px), AG = Math.floor(py);
    const o = (AG - S.G0 + S.M) * S.KW + AF - S.F0 + S.M, since = S.up[o], kd = S.upK[o];
    if (since > 11 || since < 1 || kd === KIND_HILL || topH(kd) <= gAt(S, AF, AG) || S.kAt(AF, AG) > FK.DIRT) return;
    if (h >= 0.5 * (1 - since / 24)) return;
    const rx = 0.8 + hash2(cx, cy, 833) * (since < 8 ? 1.6 : 0.9);
    pebble(S, px, py, rx, rx * 0.7, RST, hash2(cx, cy, 834) < 0.4 ? -1 : 0);
  });
  // Grasbüschel und Halme (Zellen 3 × 6, Spalten versetzt): dicht in Büschelfeldern, als Saum am Weg
  const { K, KW, M, F0, G0, SO, RK } = S;
  for (let cx = Math.floor((F0 - 3) / 3); cx <= Math.floor((F0 + S.W2 + 3) / 3); cx++) {
    const oy = Math.floor(hash2(cx, 3, 810) * 6);
    for (let cy = Math.floor((G0 - 6 + oy) / 6); cy <= Math.floor((G0 + S.H2 + 8 + oy) / 6); cy++) {
      const h = hash2(cx, cy, 811);
      if (h >= 0.62) continue;
      const bx = Math.floor(hash2(cx, cy, 812) * 3), F = cx * 3 + bx, G = cy * 6 - oy + 5;
      const ki = (G - G0 + M) * KW + F - F0 + M;   // Anker liegt im Rand des Rasters
      if (K[ki] !== GR) continue;
      const tc = RK[ki] ? topAt(S, F, G) : -1;
      // keine Halme auf Felsflächen (Wand, Kappe, Platten) und Rotsand
      if (tc === 0 || tc === 2 || tc === 3) continue;
      const s = tc === 1 ? S_PLAIN : tc === 2 ? S_M : SO[ki];
      if (s > S_B) continue;
      let R, dens;
      const wi = S.wi(F, G), p = S.patch[wi];
      if (s <= S_A) { R = BLR[s === S_PLAIN && S.gold[wi] > 0.6 ? S_Y : s]; dens = s === S_A ? 0.07 : p > 0.62 ? 0.6 : p > 0.45 ? 0.3 : p < 0.28 ? 0.02 : 0.14; }
      else if (s === S_M) { R = BL_GLD; dens = vnoise(F / 26, G / 22, 434) > 0.58 ? 0.4 : 0.03; }
      else if (s === S_B) { R = BL_GRS; dens = 0.03; }
      else continue;
      // Halm darf nicht in Rotsand/Fels hineinragen (Spitze bis 5 Feinpixel höher)
      if (SO[ki - 5 * KW] === S_R || RK[ki - 5 * KW]) continue;
      const pathBelow = S.kAt(F, G + 2) === DI || S.kAt(F, G + 3) === DI;
      if (pathBelow && s <= S_A) dens = Math.max(dens, 0.5);
      if (h >= dens) continue;
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
function rampFine(L, px, py, t) {
  const R = L.segs;
  let best = Infinity, s = 0, lat = 0;
  for (const g of R) {
    let u = ((px - g.ax) * g.dx + (py - g.ay) * g.dy) / (g.l * g.l);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = px - g.ax - g.dx * u, qy = py - g.ay - g.dy * u, d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; s = g.acc + u * g.l; lat = (g.dx * qy - g.dy * qx) / g.l; }
  }
  if (best === Infinity) return -1;
  const al = Math.abs(lat), wx = Math.floor(px), wy = Math.floor(py);
  const halfW = 12 + vnoise(s / 10, lat > 0 ? 3.5 : 9.5, 1401) * 6;
  if (al > halfW + 1.5) return -1;
  if (al > halfW - 1.5 + hash2(wx >> 1, wy >> 1, 1405) * 1.5) return hash2(wx >> 1, wy >> 1, 1404) < 0.45 ? MESR[4] : MESR[2];
  const u = s - (lat * lat) / 48 + (vnoise(px / 4, py / 4, 1402) - 0.5) * 1.6;
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
function steppeFine(kind, F, G, K, ki, KW, S) {
  if (kind > FK.PAVE) return -1;                         // Wasser: Weltpixel-Shader
  const RK = S.RK;
  if (RK[ki]) {
    const tc = topAt(S, F, G);
    if (!tc) return rockFine(S, F, G, ki, KW);
    return topCol(tc, K, ki, KW, S, F, G);
  }
  const s = S.SO[ki], f = F - S.F0, g = G - S.G0, o = g * S.W2 + f, a = S.abs[o];
  const dt = D4[(G & 3) * 4 + (F & 3)] / 16, wi = ((g >> 1) + S.m) * S.fw + (f >> 1) + S.m;
  const t = S.tone[wi];
  let c;
  if (kind === FK.PAVE) c = s === S_W ? fordFine(F / 2, G / 2) : paveCol(F, G);
  else if (kind === FK.DIRT && GRASSY[s]) c = pathCol(K, ki, KW, S, F, G, o, a, dt, t, wi, s);
  else if (a >= 0) c = a;
  else c = soilCol(kind, K, ki, KW, S, F, G, o, dt, t, wi, s);
  return S.anyRock ? rockShade(S, F, G, ki, c, dt) : c;
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
    // Gras: Grundton in Stufen, Strohgold-Flächen, kahle Erdflecken; Oberkante der Grasnarbe am Weg hell
    const p = S.patch[wi];
    let R = BASE[s];
    if (s === S_PLAIN) { const gv = S.gold[wi]; if (gv > 0.62 || (gv > 0.58 && dt < (gv - 0.58) / 0.04)) R = GLD; }
    if (K[ki - KW] === FK.DIRT) return R === ASH ? ASH[4] : R[4];
    if ((s === S_PLAIN || s === S_Y) && (p < 0.19 || (p < 0.22 && dt < (0.22 - p) / 0.03))) c = DRT[3];
    else c = R[1 + clampI(band(t, 3, dt), 0, 2) + (p > 0.62 ? 0 : 0)];
  } else if (s === S_R || s === S_Q) {
    if (s === S_Q) { const r = rampFine(S.L, F / 2, G / 2, t); if (r >= 0) return r; }
    // Rotsand: Windrippel als feine Linien (Kamm hell, Lee dunkel darunter)
    const ph = F * 0.21 + G * 0.08 + S.patch[wi] * 7, q = ph / 6.2832 - Math.floor(ph / 6.2832);
    let i = 1 + clampI(band(t, 2.6, dt), 0, 2) + dirt;
    if (q < 0.06) i += 1; else if (q < 0.1) i += dt < 0.5 ? 1 : 0; else if (q < 0.2) i -= 1;
    c = RED[clampI(i + (rel > 0 ? 1 : 0), 0, 6)];
  } else if (s === S_S || s === S_B) {
    // Salzkruste / Flussbett: Trockenrisse als Netz (1 Feinpixel, Lichtkante darunter)
    const px = F / 2, py = G / 2, A = s === S_S ? 404 : 406;
    if (dryCrack(px, py, A)) return s === S_S ? SALT[1] : BED[0];
    const lit = dryCrack(px, py - 0.5, A);
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
    if (kind === FK.DIRT && vnoise(px / 5, py / 5, 426) > 0.45) return fordFine(px, py);
    const c1 = Math.abs(vnoise(px / 15, py / 13, 420) - 0.5), c2 = Math.abs(vnoise(px / 9, py / 11, 419) - 0.5);
    if (c1 < 0.04 || c2 < 0.018) {
      if (c1 < 0.03 && vnoise(px / 6, py / 5, 418) > 0.72) return c1 < 0.008 && (G & 1) === 0 ? PUD[1] : PUD[0];
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

// Trockenrisse (Salz 404/405, Flussbett 406/407) als Netz aus zwei Rauschlinien
function dryCrack(x, y, A) {
  return Math.abs(vnoise(x / 7, y / 6, A) - 0.5) < 0.026 || Math.abs(vnoise(x / 11, y / 9, A + 1) - 0.5) < 0.018;
}
// Tafelberg-Kappe: rötlicher Fels mit dünner Erde, feine Risse mit Lichtkante
function capCol(F, G, dt, t, dirt) {
  const cr = Math.abs(vnoise(F / 26, G / 18, 433) - 0.5);
  if (cr < 0.006) return CAP[0];
  if (cr < 0.03 && Math.abs(vnoise(F / 26, (G - 1) / 18, 433) - 0.5) < 0.006) return CAP[5];
  return CAP[clampI(1 + band(t, 3.4, dt) + dirt, 0, 6)];
}
// Schluchtrand: Sandsteinplatten im Rotsand (Oberkante und linke Kante im Licht, Unterkante dunkel, Fuge)
function slabCol(F, G, dt, t) {
  const v = vnoise(F / 16, G / 12, 1355);
  if (v > 0.6) {
    if (vnoise(F / 16, (G - 1) / 12, 1355) <= 0.6 || vnoise((F - 1) / 16, G / 12, 1355) <= 0.6) return MESR[7];
    if (vnoise(F / 16, (G + 1) / 12, 1355) <= 0.6) return MESR[4];
    return MESR[5 + (t > 0.62 || (t > 0.58 && dt < 0.5) ? 1 : 0)];
  }
  if (v > 0.575) return MESR[2];
  return RED[2 + clampI(band(t, 2.6, dt), 0, 2)];
}
// Hochflächen der Felsen (Klasse aus rockTops)
function topCol(tc, K, ki, KW, S, F, G) {
  const f = F - S.F0, g = G - S.G0, o = g * S.W2 + f, a = S.abs[o];
  const dt = D4[(G & 3) * 4 + (F & 3)] / 16, wi = ((g >> 1) + S.m) * S.fw + (f >> 1) + S.m, t = S.tone[wi];
  if (tc === 2) { const c = a >= 0 ? a : capCol(F, G, dt, t, 0); return S.rel[o] < 0 ? darken(c, 0.62) : c; }
  if (tc === 3) return slabCol(F, G, dt, t);
  // Randhügel: Grasdecke, innen heller (Stufen), Felsköpfe mit Licht oben links und Schatten unten rechts
  const v = vnoise(F / 18, G / 14, 1361);
  if (v > 0.76) {
    // Licht oben links: Seite, auf der der Kopf nach oben links abfällt, ist hell; Kante 1–2 Feinpixel
    const w = vnoise((F - 3) / 18, (G - 3) / 14, 1361), lit = w < v;
    if (v > 0.8) return lit ? (v - w > 0.012 ? UPF[8] : UPF[7]) : v > 0.84 ? UPF[6] : UPF[5];
    return lit ? UPF[6] : UPF[3];
  }
  let c = a >= 0 ? a : soilCol(FK.GRASS, K, ki, KW, S, F, G, o, dt, t, wi, S_PLAIN);
  if (v > 0.62 && vnoise((F - 2) / 18, (G - 3) / 14, 1361) > 0.76) c = darken(c, 0.62);
  const x = (F >> 1) - S.x0 + TM, y = (G >> 1) - S.y0 + TM, lu = S.lum[y * S.cwT + x];
  return shadeC(c, 0.92 + 0.12 * band((lu - 0.92) / 0.12, 1, dt));
}

// Schlagschatten unter Felswänden (harte Stufen mit gerasterter Grenze) und Schatten rechts der Felsen
function rockShade(S, F, G, o, c, dt) {   // o: Index im Terrainraster
  const since = S.up[o];
  let k = 1;
  if (since < 16) {
    const kd = S.upK[o], gh = gAt(S, F, G);
    if (topH(kd) > gh) {
      if (since <= 5 || (since <= 7 && dt < 0.5)) k = 0.56;
      else if (since <= 12 || (since <= 14 && dt < 0.5)) k = 0.74;
    }
  }
  const lf = S.lf[o];
  if (lf < 16) {
    const gh = gAt(S, F, G), reach = gh < 0 ? 16 : 6;
    if (lf <= reach && topH(S.lfK[o]) > gh) {
      const kk = gh < 0 ? (lf <= 8 || (lf <= 10 && dt < 0.5) ? 0.66 : 0.8) : lf <= 3 || (lf <= 5 && dt < 0.5) ? 0.74 : 1;
      k = Math.min(k, kk);
    }
  }
  return k === 1 ? c : darken(c, k);
}

// Feinpixel im Fels: Weltpixel-Fels → Weltpixel-Shader; nur im Feinraster Fels (Umriss) → Farbe des Fels-Nachbarn
function rockFine(S, F, G, ki, KW) {
  const ex = F & 1, ey = G & 1, k0 = ki - ex - ey * KW;
  if (S.RK[k0]) return -1;
  // Nachbar-Weltpixel, der Fels ist (waagrecht, senkrecht, schräg zur Seite des Feinpixels)
  const px = F >> 1, py = G >> 1, dx = ex ? 1 : -1, dy = ey ? 1 : -1;
  let nx = px, ny = py;
  if (S.RK[k0 + dx * 2]) nx = px + dx;
  else if (S.RK[k0 + dy * 2 * KW]) ny = py + dy;
  else if (S.RK[k0 + dx * 2 + dy * 2 * KW]) { nx = px + dx; ny = py + dy; }
  else return -1;
  const col = S.shader(',', nx, ny, S.level);
  return (col[0] << 16) | (col[1] << 8) | col[2];
}

export const FINE_STEPPE = { finePixel: steppeFine, fineSetup: steppeSetup, fineTufts: false };
