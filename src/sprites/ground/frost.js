import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, D4, clampI, chunkCtx, field, pebble, stroke, vnoise, soilFine, soilAt, paveAt, awayFrom, fineAt, bandW } from './kit.js';

// Feinraster-Boden der Frostzinnen (biome 'frost'). Farben wie GROUND_FROST / frostPixel in sprites/decor_frost.js
// (dort nur gelesen): Alt- und Neuschnee, apere Erde, Nadelwaldboden, Gletschereis, Geröll, Eis- und Höhlenboden,
// festgetretene Spur. Statt Bayer-Mischung und Sprenkeln: flache Tonflächen, Wehen mit Licht von oben links in
// harten Stufen, Windrippen als Grat (hell) mit Schattenzeile, Glitzer als einzelne gesetzte Feinpixel (sparsam).
// Gletscherspalten (level.crevasses) werden hier fein nachgebaut (gleiche Geometrie wie crevPixel). Wasser/Seeeis
// und Glutspalten: Weltpixel-Shader (-1). Felsgipfel kommen als Ebene darüber (world/Outdoor.js).
const C = {
  old: ramp(['#46526a', '#535f77', '#616d85', '#707c94', '#808ca3', '#95a0b5']),
  // Neuschnee eine halbe Stufe ruhiger als G_NEW (nicht grell; Glitzer und Lippen tragen das Licht)
  neu: ramp(['#64738b', '#7b8aa2', '#93a2b8', '#aab7ca', '#c3cedd', '#e0e8f2']),
  // festgetretener Schnee: kühl und nah am Altschnee (Spur ruhig, kein Flickenmuster)
  track: ramp(['#383f50', '#434b5d', '#4f586a', '#5b6477', '#697285', '#7b8497']),
  earth: ramp(['#211b18', '#2c2420', '#383029', '#463b32', '#554839', '#665747']),
  // apere Stellen in Siedlungen: gefrorene Erde, kühl und nah am Altschnee (keine dunkelbraunen Flecken)
  thaw: ramp(['#363c47', '#404752', '#4a525e', '#565e6b', '#646d7a', '#727c8a']),
  needle: ramp(['#121815', '#1a211d', '#212a24', '#29342c', '#334036', '#3f4c40']),
  litter: ramp(['#2a2018', '#3a2c20', '#4a3828', '#5c4632']),
  gice: ramp(['#1b3846', '#24505f', '#2f6474', '#3f7a8b', '#5794a3', '#8cc0cb']),
  cice: ramp(['#202e3f', '#2a3c51', '#354a61', '#425972', '#526b84', '#6d869c']),
  stone: ramp(['#1a1816', '#24221f', '#33302b', '#44403a', '#575249', '#6c665b', '#847d70']),
  cave: ramp(['#101215', '#16191d', '#1d2126', '#262a31', '#30353d', '#3d434b', '#4c525a']),
  bone: ramp(['#5e5a4e', '#8a8470', '#b4ac92']),
  wall: ramp(['#9fd2da', '#4f97a6', '#22576a', '#123344', '#0a1c28', '#060f18']),
  pave: ramp(PAL.stone),
  mortar: hxi(PAL.mortar),
};
// Bodenarten (level.soil, Zeichencode)
const SN = 110, SA = 97, SW = 119, SE = 101, SF = 102, SG = 103, SI = 105, ST = 116, SS = 115;
const GR = FK.GRASS, DI = FK.DIRT;

// Vorarbeit je Chunk: Rauschfelder, Bodenart je Feinpixel, Kleinteile als Stempel, Spalten
function* frostSetup(x0, y0, cw, ch, K, KW, M, map) {
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M), level = map.level;
  S.soil = soilFine(S, level.soil, 11, 401, 402, 18);
  const has = S.soilHas;
  S.cv = null;
  yield;
  // Felder nur, wenn ihre Bodenart im Chunk vorkommt
  S.tone = S.noise([[3, 15, 13, 811, 0.7], [2, 6, 5, 812, 0.3]]);
  S.hgt = S.noise([[4, 26, 19, 813, 1]]);
  // Licht der Wehen je Weltpixel: steigt das Höhenfeld nach unten rechts an, schaut die Fläche zum Mond
  const lit = S.lit = new Float32Array(S.n), fw = S.fw, d = 3 * fw + 3;
  for (let i = d; i < S.n - d; i++) lit[i] = S.hgt[i + d] - S.hgt[i - d];
  S.fresh = has[32] ? S.noise([[8, 110, 80, 454, 0.85], [4, 30, 26, 456, 0.15]]) : null;
  S.rz = has[32] || has[SN] || has[SA] ? S.noise([[6, 40, 30, 455, 1]]) : null;
  S.pat = has[SF] ? S.noise([[4, 13, 11, 443, 0.75], [3, 5, 5, 444, 0.25]]) : null;
  // Apere Erde: ruhiges Feld (eine Lage), aper nur nahe Wegen, Plätzen und Feuern (S.near 0..1, weich verlaufend)
  if (has[SE]) {
    S.pe = S.noise([[6, 17, 14, 443, 1]]);
    const kg = map.kgrid, mw = map.w, mh = map.h, rows = level.map;
    const nearT = (tx, ty) => {
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
        if (x < 0 || y < 0 || x >= mw || y >= mh) continue;
        const k = kg[y * mw + x];
        if (k === FK.DIRT || k === FK.PAVE || rows?.[y]?.[x] === 'F') return 1;
      }
      return 0;
    };
    S.near = field(S.fx0, S.fy0, S.fw, S.fh, 8, (x, y) => nearT(Math.floor(x / 16), Math.floor(y / 16)), new Float32Array(S.n), false, 1);
  }
  S.gcov = has[SG] ? S.noise([[4, 18, 13, 450, 0.7], [4, 30, 7, 449, 0.3]]) : null;
  // Haarrisse im Eis (Netz: Höhenlinie des Rauschens)
  S.crk = has[SG] || has[SI] ? S.noise([[3, 9, 7, 451, 1]]) : null;
  yield;
  stamps(S);
  yield;
  crevasses(S, level);
  return S;
}

// Neuschnee am Ort (offene Fläche: großflächiger Wechsel mit harter, ruhiger Kante – das Feld ändert sich so langsam,
// dass jede Rasterung am Übergang zu einem breiten Punktfeld würde)
const freshAt = (S, F, G) => S.fresh !== null && fineAt(S.fresh, S, F, G) > 0.47;   // ohne Neuschnee im Chunk (has[32]) kein Feld
// Fleckdecke (Schnee auf Erde/Wald, Schneebänder auf dem Gletscher) am Feinpixel: Feld fein interpoliert, harte Kante
// harte Kante ohne Rasterung (Schnee liegt erhaben auf: Lichtkante oben, Schattenzeile darunter)
const covAt = (f, S, F, G, thr) => fineAt(f, S, F, G) > thr;
// Schwelle der Schneedecke auf aperer Erde: fern von Wegen fast geschlossen, an Wegen/Feuern kleine apere Stellen
const thrSE = (S, F, G) => 0.32 * fineAt(S.near, S, F, G) - 0.03;
const bareSE = (S, F, G) => !covAt(S.pe, S, F, G, thrSE(S, F, G));

function stamps(S) {
  const { kAt, wi } = S;
  const sAt = (F, G) => soilAt(S, F, G);
  const snowy = (s) => s === 32 || s === SN || s === SA || s === SW || s === SS;
  // Glitzer: einzelne Feinpixel auf Neuschnee, fern von Weg und Kante
  S.cells(14, 12, 0, (cx, cy) => {
    if (hash2(cx, cy, 820) >= 0.13) return;
    const F = cx * 14 + 1 + Math.floor(hash2(cx, cy, 821) * 12), G = cy * 12 + 1 + Math.floor(hash2(cx, cy, 822) * 10);
    if (kAt(F, G) !== GR || !awayFrom(S, F, G, DI)) return;
    const s = sAt(F, G), w = wi(F, G);
    if (!(s === SN || s === SW || (s === 32 && S.fresh[w] > 0.5))) return;
    S.put(F, G, C.neu[5]);
  });
  // Harschkanten im Altschnee: kurze Bruchlinie (Schatten) mit Lichtkante darunter
  S.cells(20, 15, 8, (cx, cy) => {
    if (hash2(cx, cy, 830) >= 0.16) return;
    const ax = cx * 20 + 2 + Math.floor(hash2(cx, cy, 831) * 10), ay = cy * 15 + 3 + Math.floor(hash2(cx, cy, 832) * 8);
    const s = sAt(ax, ay);
    if (kAt(ax, ay) !== GR || !(s === SA || (s === 32 && S.fresh[wi(ax, ay)] < 0.44))) return;
    const len = 3 + Math.floor(hash2(cx, cy, 833) * 5), sl = [-0.34, 0, 0, 0.25][Math.floor(hash2(cx, cy, 834) * 4)];
    stroke(S, ax, ay, len, sl, null, -1, 1);
  });
  // Steine: Geröll dicht (mit Schneekappe), im Schnee vereinzelt, auf aperer Erde und im Höhlenboden
  S.cells(9, 7, 6, (cx, cy) => {
    const h = hash2(cx, cy, 840);
    if (h >= 0.55) return;
    const rx = 1.2 + hash2(cx, cy, 841) * 2.2, ry = rx * (0.6 + hash2(cx, cy, 842) * 0.2);
    const px = cx * 9 + rx + 1 + hash2(cx, cy, 843) * (7 - 2 * rx), py = cy * 7 + ry + 1 + hash2(cx, cy, 844) * (5 - 2 * ry);
    const AF = Math.floor(px), AG = Math.floor(py), k = kAt(AF, AG);
    if (k !== GR) return;
    const s = sAt(AF, AG), w = wi(AF, AG);
    const bare = s === SE ? bareSE(S, AF, AG) : s === ST;
    const dens = s === SS ? 0.55 : s === SE ? (bare ? 0.12 : 0) : s === ST ? 0.3 : snowy(s) ? 0.022 : 0;
    if (h >= dens) return;
    const St = s === ST ? C.cave : C.stone, tint = hash2(cx, cy, 845) < 0.3 ? -1 : 0;
    pebble(S, px, py, rx, ry, St, tint, -2);
    if (!bare) snowCap(S, px, py, rx, ry);
  });
  // Apere Erde in Siedlungen: keine Halme (ruhige, kühle Fläche)
  // Waldboden: Zweige (Schatten darunter) und Zapfen
  S.cells(12, 10, 8, (cx, cy) => {
    const h = hash2(cx, cy, 860);
    if (h >= 0.34) return;
    const ax = cx * 12 + 1 + Math.floor(hash2(cx, cy, 861) * 6), ay = cy * 10 + 2 + Math.floor(hash2(cx, cy, 862) * 6);
    if (kAt(ax, ay) !== GR || sAt(ax, ay) !== SF || covAt(S.pat, S, ax, ay, 0.58)) return;
    if (h < 0.12) {
      S.put(ax, ay, C.litter[3]); S.put(ax + 1, ay, C.litter[2]); S.put(ax, ay + 1, C.litter[2]); S.put(ax + 1, ay + 1, C.litter[1]);
      S.markMin(ax + 1, ay + 2, -1); S.markMin(ax + 2, ay + 1, -1);
      return;
    }
    const len = 4 + Math.floor(hash2(cx, cy, 863) * 4), sl = [-0.5, -0.25, 0.25, 0.5][Math.floor(hash2(cx, cy, 864) * 4)];
    stroke(S, ax, ay, len, sl, (i) => C.litter[i === 0 ? 3 : 2], -1, -1);
  });
  // Eisglanz: einzelne Feinpixel auf blankem Eis
  S.cells(12, 10, 0, (cx, cy) => {
    if (hash2(cx, cy, 875) >= 0.1) return;
    const F = cx * 12 + 1 + Math.floor(hash2(cx, cy, 876) * 10), G = cy * 10 + 1 + Math.floor(hash2(cx, cy, 877) * 8);
    const s = sAt(F, G);
    if (kAt(F, G) !== GR || !(s === SI || (s === SG && !covAt(S.gcov, S, F, G, 0.6)))) return;
    S.put(F, G, s === SI ? C.cice[5] : C.gice[5]);
  });
  // Knochensplitter im Trollhöhlenboden
  S.cells(14, 12, 6, (cx, cy) => {
    if (hash2(cx, cy, 880) >= 0.22) return;
    const ax = cx * 14 + 2 + Math.floor(hash2(cx, cy, 881) * 8), ay = cy * 12 + 2 + Math.floor(hash2(cx, cy, 882) * 8);
    if (sAt(ax, ay) !== ST) return;
    const len = 2 + Math.floor(hash2(cx, cy, 883) * 3), sl = hash2(cx, cy, 884) < 0.5 ? 0 : -0.5;
    stroke(S, ax, ay, len, sl, (i) => C.bone[i === 0 ? 2 : 1], -1, -1);
  });
  // Spur: Trittsiegel (Mulde dunkel, Unterkante hell) und Schneeklümpchen
  S.cells(7, 6, 2, (cx, cy) => {
    const h = hash2(cx, cy, 890);
    if (h >= 0.3) return;
    const F = cx * 7 + 1 + Math.floor(hash2(cx, cy, 891) * 4), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 892) * 3);
    if (kAt(F, G) !== DI || !awayFrom(S, F, G, GR)) return;
    const s = sAt(F, G);
    if (s === SI || s === ST) return;
    if (h < 0.035) {
      S.put(F, G, C.neu[3]); S.put(F + 1, G, C.neu[2]); S.markMin(F, G + 1, -1); S.markMin(F + 1, G + 1, -1);
      return;
    }
    if (h >= 0.22) return;
    S.mark(F, G, -1); S.mark(F + 1, G, -1); S.mark(F, G + 1, -1); S.mark(F + 1, G + 1, -1);
    S.mark(F, G + 2, 1); S.mark(F + 1, G + 2, 1);
  });
}

// Schneekappe auf einem Stein: obere Hälfte weiß (Licht oben links), Rand unten bleibt Stein
function snowCap(S, px, py, rx, ry) {
  for (let G = Math.floor(py - ry - 1); G <= Math.ceil(py); G++) for (let F = Math.floor(px - rx - 1); F <= Math.ceil(px + rx + 1); F++) {
    const dx = (F + 0.5 - px) / rx, dy = (G + 0.5 - py) / ry;
    if (dx * dx + dy * dy > 1 || dy > -0.15 + dx * 0.2) continue;
    S.put(F, G, dy < -0.55 && dx < 0.3 ? C.neu[4] : dx > 0.45 ? C.neu[2] : C.neu[3]);
  }
}

// Gletscherspalten fein (Geometrie wie crevPixel in decor_frost.js): Nordwand hell oben und rasch dunkel in der
// Tiefe, Schneelippe am Unterrand, verschneiter Oberrand, Schneebrücken als Schatten durch den Schnee.
function crevasses(S, level) {
  const lines = level?.crevasses;
  if (!lines?.length) return;
  const { x0, y0, cw, ch } = S, tw = Math.ceil(cw / 16), th = Math.ceil(ch / 16), tl = new Array(tw * th).fill(null);
  let any = false;
  for (const line of lines) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const g = { ax: a.x * 16, ay: a.y * 16, bx: b.x * 16, by: b.y * 16, wa: a.w, wb: b.w, r2: 0 };
    const R = 3.5 + 1.2 * Math.max(a.w, b.w) + 0.6; g.r2 = R * R;
    if (Math.max(g.ax, g.bx) + R < x0 || Math.min(g.ax, g.bx) - R > x0 + cw || Math.max(g.ay, g.by) + R < y0 || Math.min(g.ay, g.by) - R > y0 + ch) continue;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      if (segD2(g, x0 + tx * 16 + 8, y0 + ty * 16 + 8) < (R + 11.32) ** 2) { (tl[ty * tw + tx] ??= []).push(g); any = true; }
    }
  }
  if (!any) return;
  const cv = S.cv = new Int32Array(S.W2 * S.H2).fill(-1);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const segs = tl[ty * tw + tx];
    if (!segs) continue;
    for (let y = ty * 16; y < Math.min(ch, ty * 16 + 16); y++) for (let x = tx * 16; x < Math.min(cw, tx * 16 + 16); x++) {
      const wx = x0 + x, wy = y0 + y;
      let near = false;
      for (const g of segs) if (segD2(g, wx, wy) < g.r2) { near = true; break; }
      if (!near) continue;
      for (let v = 0; v < 2; v++) for (let u = 0; u < 2; u++) {
        const F = (x0 + x) * 2 + u, G = (y0 + y) * 2 + v, c = crevFine(level, segs, F, G);
        if (c >= 0) cv[(y * 2 + v) * S.W2 + x * 2 + u] = c;
      }
    }
  }
}
function segD2(g, px, py) {
  const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - g.ax) * dx + (py - g.ay) * dy) / L2));
  const ex = px - g.ax - dx * t, ey = py - g.ay - dy * t;
  return ex * ex + ey * ey;
}
function crevFine(level, segs, F, G) {
  const px = F / 2 - 0.25, py = G / 2 - 0.25;
  const wn = 0.8 + 0.4 * vnoise(px / 3, py / 3, 483);
  let e = 99, sn = 0, w = 0;
  for (const g of segs) {
    const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - g.ax) * dx + (py - g.ay) * dy) / L2));
    const cx = g.ax + dx * t, cy = g.ay + dy * t, ww = (g.wa + (g.wb - g.wa) * t) * wn;
    const ex = px - cx, ey = py - cy, d = Math.sqrt(ex * ex + ey * ey);
    if (d - ww < e) {
      e = d - ww; w = ww;
      const l = Math.sqrt(L2), nx = -dy / l, ny = dx / l, sgn = ny < 0 ? -1 : 1;
      sn = ((px - cx) * nx + (py - cy) * ny) * sgn;
    }
  }
  if (e >= 3.5 || w < 0.4) return -1;
  const qx = px + (vnoise(px / 5, py / 5, 491) - 0.5) * 12, qy = py + (vnoise(px / 5, py / 5, 492) - 0.5) * 6;
  const solid = level.map?.[Math.floor(qy / 16)]?.[Math.floor(qx / 16)] === '"';
  if (!solid) {
    // Schneebrücke: Spalte nur als Schatten im Schnee, Lichtkante auf der Brücke
    if (e < -0.8) return sn < 0 && e > -1.3 ? C.neu[3] : C.neu[4];
    if (e < 0.6) return C.old[2];
    return -1;
  }
  if (e < 0) {
    if (sn > 0 && e > -0.8) return C.neu[4];                                   // Schneelippe am Unterrand
    const q = (sn + w) / (2 * w);
    return C.wall[clampI(Math.floor(Math.sqrt(Math.max(0, q)) * 6.2), 0, 5)];   // Nordwand: hell oben, rasch dunkel
  }
  if (sn < 0 && e < 1.4) return e < 0.5 ? C.neu[5] : C.neu[4];                  // verschneiter Oberrand, Kante im Licht
  if (sn > 0 && e < 3.5 && D4[(G & 3) * 4 + (F & 3)] / 16 < 0.5 - e / 7) return C.old[3];
  return -1;
}

// Schnee (Rampe R: Alt- oder Neuschnee): Tonfläche, Wehen im Licht (Höhenfeld: steigt es nach unten rechts an, schaut
// die Fläche zum Mond), Windrippen (rip), Weglippe hell; rel: Stempel-Relief (Schatten, Bruchkanten)
function snowPx(R, K, ki, KW, S, wi, dt, F, G, o, rip) {
  if (K[ki + KW] === DI) return R[4];
  let k = bandW(fineAt(S.tone, S, F, G), 2, dt, 0.08);
  const L = fineAt(S.lit, S, F, G);
  if (L > 0.07) k++; else if (L < -0.07) k--;
  if (rip && S.rz !== null && S.rz[wi] > 0.64) {
    const p = (G + F * 0.21 + fineAt(S.hgt, S, F, G) * 40) / 9, f = p - Math.floor(p);
    if (f < 0.111) k++; else if (f < 0.222) k--;
  }
  // Schulter: neben der Spur leicht eingetreten
  if (K[ki + 2 * KW] === DI || K[ki - KW] === DI || K[ki - 1] === DI || K[ki + 1] === DI) k--;
  return R[clampI(1 + k + S.rel[o], 0, 4)];
}

// Fleckdecke: Schnee (Rampe R) liegt erhaben auf dem Untergrund – Oberkante hell, darunter Schlagschatten
// cov: Feld, thr: Schwelle; liefert -1 (Untergrund) oder Farbe. edge: Farbe der Schattenzeile unter dem Fleck.
function patchSnow(f, thr, R, K, ki, KW, S, wi, dt, F, G, o) {
  if (covAt(f, S, F, G, thr)) {
    if (!covAt(f, S, F, G - 1, thr)) return R[4];
    return snowPx(R, K, ki, KW, S, wi, dt, F, G, o, false);
  }
  return covAt(f, S, F, G - 1, thr) ? -2 : -1;
}

// Spur: festgetretener Schnee (Rand zum Schnee: oben Schatten der Böschung, unten Lichtkante), auf aperer Erde und
// im Wald Matsch und Erde, in Grotten Eis und Fels
function trackPx(s, K, ki, KW, S, wi, dt, a, o, F, G) {
  const T = s === SI ? C.cice : s === ST ? C.cave : s === SE && bareSE(S, F, G) ? C.thaw : s === SF && !covAt(S.pat, S, F, G, 0.62) ? C.earth : C.track;
  if (K[ki - KW] === GR) return T[1];
  if (K[ki - 1] === GR || K[ki - 2 * KW] === GR) return T[2];
  if (K[ki + KW] === GR || K[ki + 1] === GR) return T[4];
  if (a >= 0) return a;
  let i = 2 + bandW(fineAt(S.tone, S, F, G), 1.8, dt, 0.12);
  if (K[ki + 2 * KW] === GR || K[ki + 2] === GR || K[ki - 2] === GR) i = 3;
  return T[clampI(i + S.rel[o], 0, 5)];
}

// Blankes Eis: Tonfläche, Haarrisse als dunkle Linie mit heller Kante darunter
function icePx(R, S, F, G, dt, o) {
  if (Math.abs(fineAt(S.crk, S, F, G) - 0.5) < 0.016) return R[0];
  let k = 1 + bandW(fineAt(S.tone, S, F, G), 2.6, dt, 0.12);
  if (Math.abs(fineAt(S.crk, S, F, G - 1) - 0.5) < 0.016) k++;
  return R[clampI(k + S.rel[o], 0, 5)];
}

function frostFine(kind, F, G, K, ki, KW, S) {
  if (kind > FK.PAVE) return -1;   // Seeeis/Wasser, Glutspalten: Weltpixel-Shader
  const o = (G - S.G0) * S.W2 + (F - S.F0);
  if (S.cv !== null && S.cv[o] >= 0) return S.cv[o];
  if (kind === FK.PAVE) {
    const i = paveAt(F, G);
    return i < 0 ? C.mortar : C.pave[i];
  }
  const a = S.abs[o], s = S.soil[ki], dt = D4[(G & 3) * 4 + (F & 3)] / 16;
  const wi = (((G - S.G0) >> 1) + S.m) * S.fw + ((F - S.F0) >> 1) + S.m;
  if (kind === DI) return trackPx(s, K, ki, KW, S, wi, dt, a, o, F, G);
  if (a >= 0) return a;
  switch (s) {
    case SN: return snowPx(C.neu, K, ki, KW, S, wi, dt, F, G, o, true);
    case SA: return snowPx(C.old, K, ki, KW, S, wi, dt, F, G, o, true);
    case SW: return snowPx(C.neu, K, ki, KW, S, wi, dt, F, G, o, false);
    case SS: return snowPx(C.old, K, ki, KW, S, wi, dt, F, G, o, false);
    case SE: {
      const c = patchSnow(S.pe, thrSE(S, F, G), C.old, K, ki, KW, S, wi, dt, F, G, o);
      if (c >= 0) return c;
      if (c === -2) return C.thaw[1];
      return C.thaw[clampI(2 + bandW(fineAt(S.tone, S, F, G), 1.6, dt, 0.12) + (S.rel[o] < 0 ? -1 : 0), 0, 5)];
    }
    case SF: {
      const c = patchSnow(S.pat, 0.6, C.old, K, ki, KW, S, wi, dt, F, G, o);
      if (c >= 0) return c;
      if (c === -2) return C.needle[0];
      return C.needle[clampI(1 + bandW(fineAt(S.tone, S, F, G), 2.4, dt, 0.12) + (S.rel[o] < 0 ? -1 : 0), 0, 5)];
    }
    case SG: {
      const c = patchSnow(S.gcov, 0.6, C.neu, K, ki, KW, S, wi, dt, F, G, o);
      if (c >= 0) return c;
      if (c === -2) return C.gice[0];
      return icePx(C.gice, S, F, G, dt, o);
    }
    case SI: return icePx(C.cice, S, F, G, dt, o);
    case ST: return C.cave[clampI(1 + bandW(fineAt(S.tone, S, F, G), 2.4, dt, 0.12) + S.rel[o], 0, 6)];
    default: return snowPx(freshAt(S, F, G) ? C.neu : C.old, K, ki, KW, S, wi, dt, F, G, o, true);
  }
}

export const FINE_FROST = { finePixel: frostFine, fineSetup: frostSetup, fineTufts: false };
