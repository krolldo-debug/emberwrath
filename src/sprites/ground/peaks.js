import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, vnoise, clampI, chunkCtx, pebble, stroke, soilAt, paveAt, awayFrom } from './kit.js';

// Feinraster-Boden der Schlackenhöhen (biome 'peaks'). Farben wie GROUND_PEAKS / peaksPixel in sprites/decor_peaks.js
// (dort nur gelesen): Basaltgeröll (Grundton), helle Asche (u), Schlacke mit Rostflecken (v), Erzadern (o),
// Schlackenglas (s), Schwefel (y), heller Kies (g), Geröll am Wandfuß (r dicht, p locker), Hangwege mit Höhenlinien (h),
// Erdwege. Statt Sprenkeln: flache Tonflächen mit harten Stufen (keine Rasterung), Kiesel/Brocken mit Glanzpunkt oben
// links und Schlagschatten, Risse mit Lichtkante, Blasen im Schlackenglas, einzelne Glanzpunkte. Rostwasser und
// Glutspalten: Weltpixel-Shader (-1). Die gemalten Felsen (paintCliffs) kommen als Ebene darüber (world/Outdoor.js).
const C = {
  scree: ramp(['#131519', '#1a1c21', '#22252a', '#2b2e34', '#35383e', '#41444a', '#52555b']),
  // Erzboden: gedecktes Braun, die Adern (eine Stufe heller) tragen den Rostton
  ore: ramp(['#18100c', '#21160f', '#2c1c13', '#382317', '#472c1c', '#5a3722', '#74472b']),
  slag: ramp(['#0b0b0e', '#111116', '#17181e', '#1f2028', '#282a34', '#343846', '#5a6c8c']),
  sulf: ramp(['#1d1a0e', '#2a2512', '#3a3216', '#4c411a', '#5f511f', '#776726', '#958436']),
  grav: ramp(['#161618', '#1d1d1f', '#262628', '#303032', '#3b3a3b', '#474545', '#555251', '#67635f']),
  ash: ramp(['#1c1a18', '#24221f', '#2d2b27', '#383530', '#44403a', '#514c45', '#615b52']),
  // Schlacke der Nordstufe (v): dunkles, kaum warmes Grau; Rost nur in einzelnen Flecken (rust)
  vslag: ramp(['#141314', '#1b191a', '#232021', '#2c2829', '#363132', '#423c3c', '#524a49']),
  rust: ramp(['#1d130d', '#261910', '#311f14', '#3d2719', '#4a301f', '#583925', '#69442c']),
  rub: ramp(['#141518', '#1b1c1f', '#232427', '#2c2d30', '#36363a', '#434245', '#545150']),
  // Basaltbrocken: mehr Licht auf der Oberseite als der Boden (Material liest sich auch im Dunkeln)
  peb: ramp(['#0e0f12', '#1d1e22', '#2a2b30', '#383a3f', '#4a4c52', '#5f6168', '#7a7c83']),
  // Erdwege: festgetretene Erde, gedeckt (kein Rostton)
  dirt: ramp(['#141010', '#1a1513', '#231c17', '#2e241d', '#3a2d24', '#47372b', '#554133', '#644c3b']),
  pave: ramp(PAL.stone),
  mortar: hxi(PAL.mortar),
};
// Bodenarten (level.soil, Zeichencode); SVR: Rostfleck in der Schlacke (nur hier, aus SV abgeleitet)
const SO = 111, SS = 115, SY = 121, SG = 103, SU = 117, SV = 118, SR = 114, SP = 112, SH = 104, SVR = 86;
const GR = FK.GRASS, DI = FK.DIRT;
// Rampe je Bodenart (Index = Zeichencode); OWN: Wege nehmen dort die Farbe des Bodens an
const RAMP = new Array(128).fill(C.scree), OWN = new Uint8Array(128);
RAMP[SO] = C.ore; RAMP[SS] = C.slag; RAMP[SY] = C.sulf; RAMP[SG] = C.grav; RAMP[SU] = C.ash; RAMP[SV] = C.vslag; RAMP[SVR] = C.rust;
RAMP[SR] = C.rub; RAMP[SP] = C.rub; RAMP[SH] = C.rub;
OWN[SO] = OWN[SS] = OWN[SY] = OWN[SG] = 1;

// Rauschgitter je Chunk (Weltpixel, global ausgerichtet, Abstand step) mit Spaltengewichten für jede Spalte des
// Terrainrasters (Feinpixel mit Rand M): Abfragen je Feinpixel bilinear, ohne Zwischenfeld in Weltpixeln
function grid(S, step, sx, sy, seed) {
  const gx = Math.floor((S.fx0 - 1) / step) * step, gy = Math.floor((S.fy0 - 1) / step) * step;
  const W = Math.ceil((S.fx0 + S.fw + 1 - gx) / step) + 2, H = Math.ceil((S.fy0 + S.fh + 1 - gy) / step) + 2;
  const v = new Float32Array(W * H), inv = 1 / step, KW = S.KW, ci = new Int32Array(KW), ca = new Float32Array(KW);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) v[j * W + i] = vnoise((gx + i * step) / sx, (gy + j * step) / sy, seed);
  for (let f = 0; f < KW; f++) { const u = ((S.F0 - S.M + f + 0.5) / 2 - gx) * inv; ci[f] = u | 0; ca[f] = u - (u | 0); }
  return { v, W, H, gx, gy, inv, ci, ca, row: new Float32Array(W) };
}
// Wert am Feinpixel (F, G) (global, innerhalb des Rasters mit Rand)
function gAt(g, F, G) {
  const u = ((F + 0.5) / 2 - g.gx) * g.inv, w = ((G + 0.5) / 2 - g.gy) * g.inv, i = u | 0, j = w | 0, ax = u - i, ay = w - j;
  const v = g.v, q = j * g.W + i, a = v[q] + (v[q + 1] - v[q]) * ax, b = v[q + g.W] + (v[q + g.W + 1] - v[q + g.W]) * ax;
  return a + (b - a) * ay;
}
// Gitterzeile für die Feinzeile G vorbereiten (in y interpoliert, g.row); je Spalte f dann row[ci[f]] … row[ci[f] + 1]
function gRow(g, G) {
  const w = ((G + 0.5) / 2 - g.gy) * g.inv, j = w | 0, ay = w - j, v = g.v, W = g.W, q = j * W, r = g.row;
  for (let i = 0; i < W; i++) r[i] = v[q + i] + (v[q + W + i] - v[q + i]) * ay;
}

// Bodenart je Feinpixel im Raster des Terrains (wie kit.soilFine: Grenze verwackelt um ±amp/2 Weltpixel, Rauschen /11,
// Seeds 301/302 wie soilFast in decor_peaks.js), aber mit harter Grenze (keine Rasterung) und engerem Blocktest:
// ein Block von 8 × 8 Feinpixeln wird sofort gefüllt, wenn alle Kacheln, die sein tatsächlicher Versatz (Min/Max der
// Gitterwerte im Block) erreicht, dieselbe Bodenart haben. Nur an echten Grenzen wird je Feinpixel gerechnet.
const AMP = 16;
function soilTight(S, soil) {
  const { K, KW, M, F0, G0 } = S, n = K.length, H = n / KW, out = new Uint8Array(n), has = S.soilHas = new Uint8Array(256);
  if (!soil) { has[32] = 1; return out.fill(32); }
  const jx = grid(S, 4, 11, 11, 301), jy = grid(S, 4, 11, 11, 302), XV = jx.v, YV = jy.v, GW = jx.W, ci = jx.ci, ca = jx.ca;
  const tile = (tx, ty) => { const row = soil[ty]; return row ? row.charCodeAt(tx) || 32 : 32; };
  for (let b0 = 0; b0 < H; b0 += 8) {
    const b1 = Math.min(H, b0 + 8);
    const Ya = (G0 - M + b0 + 0.5) / 2, Yb = (G0 - M + b1 - 0.5) / 2;
    const ja = ((Ya - jx.gy) * jx.inv) | 0, jb = Math.min(jx.H - 1, Math.ceil((Yb - jx.gy) * jx.inv));
    for (let a0 = 0; a0 < KW; a0 += 8) {
      const a1 = Math.min(KW, a0 + 8), ia = ci[a0], ib = Math.min(GW - 1, ci[a1 - 1] + 1);
      let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const q = j * GW + i, a = XV[q], b = YV[q];
        if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b;
      }
      const Xa = (F0 - M + a0 + 0.5) / 2, Xb = (F0 - M + a1 - 0.5) / 2;
      const tx0 = Math.floor((Xa + (x0 - 0.5) * AMP) / 16), tx1 = Math.floor((Xb + (x1 - 0.5) * AMP) / 16);
      const ty0 = Math.floor((Ya + (y0 - 0.5) * AMP) / 16), ty1 = Math.floor((Yb + (y1 - 0.5) * AMP) / 16);
      let c = tile(tx0, ty0), same = true;
      for (let ty = ty0; ty <= ty1 && same; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tile(tx, ty) !== c) { same = false; break; }
      if (same) {
        has[c] = 1;
        for (let g = b0; g < b1; g++) out.fill(c, g * KW + a0, g * KW + a1);
        continue;
      }
      let last = -1;
      for (let g = b0; g < b1; g++) {
        const Y = (G0 - M + g + 0.5) / 2, w = (Y - jx.gy) * jx.inv, j = w | 0, ay = w - j, r0 = j * GW, r1 = r0 + GW;
        for (let f = a0; f < a1; f++) {
          const i = ci[f], ax = ca[f], q = r0 + i, p = r1 + i;
          const u = XV[q] + (XV[q + 1] - XV[q]) * ax, u2 = XV[p] + (XV[p + 1] - XV[p]) * ax;
          const v = YV[q] + (YV[q + 1] - YV[q]) * ax, v2 = YV[p] + (YV[p + 1] - YV[p]) * ax;
          const x = (F0 - M + f + 0.5) / 2 + (u + (u2 - u) * ay - 0.5) * AMP, y = Y + (v + (v2 - v) * ay - 0.5) * AMP;
          const tx = Math.floor(x / 16), ty = Math.floor(y / 16), key = ty * 65536 + tx;
          if (key !== last) { last = key; c = tile(tx, ty); has[c] = 1; }
          out[g * KW + f] = c;
        }
      }
    }
  }
  return out;
}

// Rostflecken in der Schlacke (v): wenige, flache Flecken mit harter Kante (Schwelle eines groben Rauschens).
// Nur tief in der Schlacke: je Kachel 1, wenn sie und ihre 8 Nachbarn 'v' sind, zwischen den Kachelmitten bilinear;
// zur Grenze hin sinkt der Wert stetig, die Flecken laufen dort rund aus statt als Rostfaden abgeschnitten zu werden.
const RUST_T = 0.75;
function rustPatches(S, map) {
  const { KW, soil, fx0, fy0, fw, fh } = S, H = soil.length / KW, g = grid(S, 4, 13, 10, 913), r = g.row, ci = g.ci, ca = g.ca;
  const T0x = Math.floor((fx0 - 8) / 16) - 1, T0y = Math.floor((fy0 - 8) / 16) - 1, TW = Math.ceil(fw / 16) + 4, TH = Math.ceil(fh / 16) + 4;
  const isV = (tx, ty) => { const row = map[ty]; return !!row && row.charCodeAt(tx) === SV; };
  const deep = new Float32Array(TW * TH);
  let anyDeep = false;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!isV(T0x + i + dx, T0y + j + dy)) { ok = false; break; }
    if (ok) { deep[j * TW + i] = 1; anyDeep = true; }
  }
  if (!anyDeep) return;
  // Spaltenlage zwischen den Kachelmitten (je Spalte des Rasters)
  const di = new Int32Array(KW), da = new Float32Array(KW);
  for (let f = 0; f < KW; f++) { const u = ((S.F0 - S.M + f + 0.5) / 2 - 8) / 16 - T0x; di[f] = Math.floor(u); da[f] = u - di[f]; }
  let any = false;
  for (let k = 0; k < H; k++) {
    const o = k * KW, w = ((S.G0 - S.M + k + 0.5) / 2 - 8) / 16 - T0y, dj = Math.floor(w), ay = w - dj, d0 = dj * TW, d1 = d0 + TW;
    let hit = false;
    for (let f = 0; f < KW; f++) if (soil[o + f] === SV) { hit = true; break; }
    if (!hit) continue;
    gRow(g, S.G0 - S.M + k);
    for (let f = 0; f < KW; f++) {
      const q = o + f;
      if (soil[q] !== SV) continue;
      const c = ci[f], v = r[c] + (r[c + 1] - r[c]) * ca[f];
      if (v <= RUST_T) continue;
      const i = di[f], ax = da[f], e0 = deep[d0 + i] + (deep[d0 + i + 1] - deep[d0 + i]) * ax, e1 = deep[d1 + i] + (deep[d1 + i + 1] - deep[d1 + i]) * ax;
      if (v + (e0 + (e1 - e0) * ay - 1) * 0.35 > RUST_T) { soil[q] = SVR; any = true; }
    }
  }
  if (any) S.soilHas[SVR] = 1;
}

function* peaksSetup(x0, y0, cw, ch, K, KW, M, map) {
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  S.soil = soilTight(S, map.level.soil);
  const has = S.soilHas;
  if (has[SV]) rustPatches(S, map.level.soil);
  yield;
  // Grundton (eine Rauschlage), Erzadern (gestreckt), Trockenrisse im Schwefel, Höhenlinien der Hangwege:
  // Gitter nur, wenn die Bodenart im Chunk vorkommt
  S.tone = grid(S, 4, 9, 8, 911);
  S.vein = has[SO] ? grid(S, 2, 4, 14, 17) : null;
  S.crk = has[SY] ? grid(S, 3, 9, 8, 19) : null;
  S.crk2 = has[SY] ? new Float32Array(S.crk.W) : null;
  S.hl = has[SH] ? grid(S, 4, 16, 40, 73) : null;
  // Stufe je Feinpixel der aktuellen Zeile (lvRow, Merker S.lvG)
  S.lv = new Int8Array(S.W2); S.lvG = -1e9;
  stamps(S);
  return S;
}

// Stufen der Feinzeile G (global) für alle Spalten des Chunks: Grundton in harten Stufen (1..3) plus Zeichnung der
// Bodenart (Erzader +1, Schwefelriss -9 = Rissfarbe / +1 Lichtkante darunter, Höhenlinien auf Geröllhängen ±1).
// Wege nutzen dieselbe Stufe (+1); Höhenlinien nur außerhalb der Wege.
function lvRow(S, G, K, KW) {
  S.lvG = G;
  const { W2, M, soil, lv, tone, vein, crk, hl } = S, ko = (G - S.G0 + M) * KW + M, has = S.soilHas;
  gRow(tone, G);
  const tr = tone.row, tci = tone.ci, tca = tone.ca;
  for (let f = 0; f < W2; f++) {
    const i = tci[f + M], t = tr[i] + (tr[i + 1] - tr[i]) * tca[f + M];
    lv[f] = t < 0.22 ? 1 : t < 0.7 ? 2 : 3;
  }
  if (vein) {
    gRow(vein, G);
    const r = vein.row, ci = vein.ci, ca = vein.ca;
    for (let f = 0; f < W2; f++) if (soil[ko + f] === SO) { const i = ci[f + M]; if (r[i] + (r[i + 1] - r[i]) * ca[f + M] > 0.8) lv[f]++; }
  }
  if (crk) {
    gRow(crk, G - 1);
    const r = crk.row, r2 = S.crk2, ci = crk.ci, ca = crk.ca;
    r2.set(r);
    gRow(crk, G);
    for (let f = 0; f < W2; f++) {
      if (soil[ko + f] !== SY) continue;
      const i = ci[f + M], a = ca[f + M];
      if (Math.abs(r[i] + (r[i + 1] - r[i]) * a - 0.5) < 0.022) lv[f] = -9;
      else if (Math.abs(r2[i] + (r2[i + 1] - r2[i]) * a - 0.5) < 0.022) lv[f]++;
    }
  }
  if (has[SVR]) {
    // Rostfleck (nicht auf Wegen): flach (Stufe 2), harte Kante oben/links heller, unten/rechts dunkler (je 1 Feinpixel)
    for (let f = 0; f < W2; f++) {
      const q = ko + f;
      if (soil[q] !== SVR || K[q] !== GR) continue;
      lv[f] = soil[q - KW] !== SVR || soil[q - 1] !== SVR ? 3 : soil[q + KW] !== SVR || soil[q + 1] !== SVR ? 1 : 2;
    }
  }
  if (hl) {
    gRow(hl, G);
    const r = hl.row, ci = hl.ci, ca = hl.ca;
    for (let f = 0; f < W2; f++) {
      if (soil[ko + f] !== SH || K[ko + f] !== GR) continue;
      // Höhenlinien: gewellte, waagrechte Absätze (heller Grat, dunkle Stufe darunter), je 1 Feinpixel
      const i = ci[f + M], c = G / 2 + (r[i] + (r[i + 1] - r[i]) * ca[f + M] - 0.5) * 14, b = ((c % 7) + 7) % 7;
      if (b < 0.5) lv[f]++; else if (b < 1) lv[f]--;
    }
  }
}

function stamps(S) {
  const { kAt } = S;
  const sAt = (F, G) => soilAt(S, F, G);
  // Kiesel und Brocken (Licht oben links, Schlagschatten): Dichte und Größe je Bodenart
  S.cells(9, 7, 6, (cx, cy) => {
    const h = hash2(cx, cy, 920);
    if (h >= 0.7) return;
    const AF0 = cx * 9 + 4, AG0 = cy * 7 + 3, k = kAt(AF0, AG0), s = sAt(AF0, AG0);
    let dens, big;
    if (k === GR) {
      dens = s === SR ? 0.7 : s === SP ? 0.34 : s === SH ? 0.16 : s === SG ? 0.5 : s === SV || s === SVR ? 0.26 : s === SU ? 0.05 : s === SS || s === SY || s === SO ? 0.06 : 0.16;
      big = s === SR ? 1.2 : s === SG ? -0.6 : 0;
    } else if (k === DI) {
      dens = s === SR ? 0.3 : s === SG ? 0.4 : s === SP || s === SH ? 0.14 : awayFrom(S, AF0, AG0, GR) ? 0.05 : 0.12; big = s === SG ? -0.7 : -0.5;
    } else return;
    if (h >= dens) return;
    const rx = Math.max(0.9, 1.1 + big + hash2(cx, cy, 921) * 2), ry = rx * (0.6 + hash2(cx, cy, 922) * 0.2);
    const px = cx * 9 + rx + 1 + hash2(cx, cy, 923) * Math.max(0, 7 - 2 * rx), py = cy * 7 + ry + 1 + hash2(cx, cy, 924) * Math.max(0, 5 - 2 * ry);
    const St = s === SG ? C.grav : s === SU ? C.ash : C.peb;
    pebble(S, px, py, rx, ry, St, hash2(cx, cy, 925) < 0.3 ? -1 : 0, -2);
  });
  // Risse im Basalt und in der Asche: dunkle Linie mit Lichtkante darunter
  S.cells(18, 14, 8, (cx, cy) => {
    if (hash2(cx, cy, 930) >= 0.22) return;
    const ax = cx * 18 + 2 + Math.floor(hash2(cx, cy, 931) * 10), ay = cy * 14 + 3 + Math.floor(hash2(cx, cy, 932) * 8);
    const s = sAt(ax, ay);
    if (kAt(ax, ay) !== GR || !(s === 32 || s === SU || s === SV || s === SVR)) return;
    const len = 4 + Math.floor(hash2(cx, cy, 933) * 6), sl = [-0.5, -0.25, 0.25, 0.5][Math.floor(hash2(cx, cy, 934) * 4)];
    stroke(S, ax, ay, len, sl, null, -2, 1);
    if (len > 7) stroke(S, ax + 4, ay + Math.round(4 * sl), 3, -sl, null, -2, 1);
  });
  // Schlackenglas: Blasen (Innenwand oben links dunkel, unten rechts hell) und kalte Glanzpunkte
  if (S.soilHas[SS]) S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 940);
    if (h >= 0.4) return;
    const F = cx * 6 + 1 + Math.floor(hash2(cx, cy, 941) * 4), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 942) * 3);
    if (kAt(F, G) !== GR || sAt(F, G) !== SS) return;
    if (h < 0.09) { S.put(F, G, C.slag[6]); return; }
    S.mark(F, G, -2); S.mark(F + 1, G, -1); S.mark(F, G + 1, -1); S.mark(F + 1, G + 1, 1);
  });
  // Schwefel: Kristalle (ein heller Feinpixel über einem dunklen) und Krustenränder
  if (S.soilHas[SY]) S.cells(7, 6, 2, (cx, cy) => {
    const h = hash2(cx, cy, 950);
    if (h >= 0.3) return;
    const F = cx * 7 + 1 + Math.floor(hash2(cx, cy, 951) * 5), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 952) * 4);
    if (kAt(F, G) !== GR || sAt(F, G) !== SY) return;
    if (h < 0.12) { S.put(F, G, C.sulf[6]); S.put(F, G + 1, C.sulf[4]); S.markMin(F + 1, G + 1, -1); return; }
    for (let i = 0; i < 3; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
  // Erz: einzelne Rostglanzpunkte in den Adern
  if (S.vein) S.cells(10, 8, 0, (cx, cy) => {
    if (hash2(cx, cy, 960) >= 0.22) return;
    const F = cx * 10 + 1 + Math.floor(hash2(cx, cy, 961) * 8), G = cy * 8 + 1 + Math.floor(hash2(cx, cy, 962) * 6);
    if (kAt(F, G) !== GR || sAt(F, G) !== SO || gAt(S.vein, F, G) < 0.6) return;
    S.put(F, G, C.ore[6]); S.markMin(F + 1, G + 1, -1);
  });
  // Wege: Erdkrumen (oben hell, darunter dunkel) – nur, wenn der Chunk (mit Rand) Weg enthält
  if (S.K.includes(DI)) S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 970);
    if (h >= 0.14) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 971) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 972) * 2);
    if (kAt(F, G) !== DI) return;
    const w = 2 + (hash2(cx, cy, 973) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
}

// Weg (Erde): heller als das Geröll, Böschung oben dunkel, Unterkante zum Geröll hell
// Auf Erz, Schlacke, Schwefel und Kies nimmt der Weg die Farbe des Bodens an (eine Stufe heller, wie peaksPixel)
function roadPx(K, ki, KW, S, a, o, l) {
  const s = S.soil[ki], own = OWN[s], D = own ? RAMP[s] : C.dirt;
  if (K[ki - KW] === GR) return D[1];
  if (a >= 0) return a;
  if (own) return l < 0 ? D[0] : D[clampI(l + 1 + S.rel[o], 0, 5)];
  let i = l + 1;
  if (K[ki - 2 * KW] === GR || K[ki - 1] === GR) i = Math.min(i, 2);
  else if (K[ki + KW] === GR || K[ki + 1] === GR) i = Math.max(i, 4);
  return D[clampI(i + S.rel[o], 0, 7)];
}

function peaksFine(kind, F, G, K, ki, KW, S) {
  if (kind > FK.PAVE) return -1;   // Rostwasser, Glutspalten: Weltpixel-Shader
  if (kind === FK.PAVE) { const i = paveAt(F, G); return i < 0 ? C.mortar : C.pave[i]; }
  if (G !== S.lvG) lvRow(S, G, K, KW);
  const f = F - S.F0, o = (G - S.G0) * S.W2 + f, a = S.abs[o], l = S.lv[f];
  if (kind === DI) return roadPx(K, ki, KW, S, a, o, l);
  if (a >= 0) return a;
  const R = RAMP[S.soil[ki]];
  // Kante über dem Weg: Geröllsaum im Licht
  if (K[ki + KW] === DI) return R[4];
  return l < 0 ? R[0] : R[clampI(l + S.rel[o], 0, 5)];
}

export const FINE_PEAKS = { finePixel: peaksFine, fineSetup: peaksSetup, fineTufts: false };
