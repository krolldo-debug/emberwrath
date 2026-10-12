import { hash2 } from '../../core/math.js';

// Werkzeugkasten für Feinraster-Böden (docs/STYLE.md „Feinraster“, Paket Boden). Ein Biom liefert pal.fineSetup
// (Generator: Vorarbeit je Chunk) und pal.finePixel (Farbe je Feinpixel als 0xRRGGBB, -1 = Weltpixel-Shader des Bioms
// nehmen). world/Outdoor.js #fineGround ruft beide; Terrain je Feinpixel kommt als Code (FK) in einem Raster mit Rand.
//
// Bausteine:
//   field()        Rauschfeld je Chunk (grobes, global ausgerichtetes Gitter, bilinear) – je Chunk einmal, nahtlos
//   band()         0..1-Wert in n Stufen mit schmaler, geordneter Rasterung am Übergang (Pixel-Art-Kante, kein Rauschen)
//   chunkCtx()     Stempelpuffer (abs = fertige Farbe, rel = Relief) mit put/mark, Terrain-/Feldabfragen, Zellraster
//   pebble()       Kiesel/Stein: Ellipse mit Glanzpunkt oben links, dunkle Kante unten rechts, Schlagschatten
//   blade()        Halm: 2–5 Feinpixel, Spitze hell, Schatten am Fuß
//   stroke()       Strich (Riss, Zweig, Fuge) mit Lichtkante darunter
// Alle Stempel sind deterministisch (Zellen-Hash), schreiben nur innerhalb des Chunks und werden am Rand von beiden
// Nachbarchunks gleich gesetzt (Anker im Rand des Terrainrasters).

// Terrain-Codes im Feinraster (world/Outdoor.js KCODE): Fels '#' zählt als GRASS (Untergrund des Plateaus)
export const FK = { GRASS: 0, DIRT: 1, PAVE: 2, WATER: 3, FISS: 4 };
export const hxi = (c) => parseInt(c.slice(1), 16);
export const ramp = (list) => list.map(hxi);
// 4×4-Bayer-Matrix (0..15)
export const D4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dith = (F, G) => D4[(G & 3) * 4 + (F & 3)] / 16;
export const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
export function band(t, n, dt) {
  const v = t * n, k = Math.floor(v), f = v - k;
  return k + (f > 0.6 ? 1 : f > 0.4 && dt < (f - 0.4) / 0.2 ? 1 : 0);
}
export function darken(c, k) { return (((c >> 16) & 255) * k) << 16 | (((c >> 8) & 255) * k) << 8 | ((c & 255) * k); }
// Mischung zweier Farben (t 0..1) – nur für Paletten beim Laden, nie je Pixel
export function mix(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// Glatter Wertrauschen-Wert 0..1
export function vnoise(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Rauschfelder je Chunk (mit Rand): Werte auf grobem, global ausgerichtetem Gitter, bilinear auf jedes Weltpixel
// verteilt (je Chunk einmal; Nachbarchunks rechnen am Rand dieselben Werte). add: aufaddieren, k: Gewicht.
export function field(x0, y0, w, h, step, fn, out, add, k) {
  const W = Math.ceil(w / step) + 2, H = Math.ceil(h / step) + 2, a = new Float32Array(W * H);
  const gx = Math.floor(x0 / step) * step, gy = Math.floor(y0 / step) * step, ox = x0 - gx, oy = y0 - gy;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) a[j * W + i] = fn(gx + i * step, gy + j * step);
  const inv = 1 / step, IX = new Int32Array(w), AX = new Float64Array(w);
  for (let x = 0; x < w; x++) { const fx = (x + ox) * inv; IX[x] = fx | 0; AX[x] = fx - IX[x]; }
  for (let y = 0; y < h; y++) {
    const fy = (y + oy) * inv, j = fy | 0, ay = fy - j, o = y * w, r = j * W;
    if (add) for (let x = 0; x < w; x++) {
      const q = r + IX[x], ax = AX[x], t = a[q] + (a[q + 1] - a[q]) * ax, u = a[q + W] + (a[q + W + 1] - a[q + W]) * ax;
      out[o + x] += (t + (u - t) * ay) * k;
    } else for (let x = 0; x < w; x++) {
      const q = r + IX[x], ax = AX[x], t = a[q] + (a[q + 1] - a[q]) * ax, u = a[q + W] + (a[q + W + 1] - a[q + W]) * ax;
      out[o + x] = (t + (u - t) * ay) * k;
    }
  }
  return out;
}

// vnoise(x / sx, y / sy, seed) für die Gitterpunkte von field() über einem Chunk, bitgleich, aber mit den Gitterhashes aus
// einer Tabelle (je Gitterzelle des Rauschens einmal statt viermal je Punkt)
function vnTable(x0, y0, w, h, step, sx, sy, seed) {
  const W = Math.ceil(w / step) + 2, H = Math.ceil(h / step) + 2;
  const gx = Math.floor(x0 / step) * step, gy = Math.floor(y0 / step) * step;
  const lx0 = Math.floor(gx / sx), ly0 = Math.floor(gy / sy);
  const LW = Math.floor((gx + (W - 1) * step) / sx) - lx0 + 2, LH = Math.floor((gy + (H - 1) * step) / sy) - ly0 + 2;
  const L = new Float64Array(LW * LH);
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) L[j * LW + i] = hash2(lx0 + i, ly0 + j, seed);
  return (x, y) => {
    const X = x / sx, Y = y / sy, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi;
    const q = (yi - ly0) * LW + xi - lx0, a = L[q], b = L[q + 1], c = L[q + LW], d = L[q + LW + 1];
    const tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// Chunk-Kontext für fineSetup/finePixel. x0/y0/cw/ch: Chunk in Weltpixeln, K/KW/M: Terrainraster (Feinpixel, Rand M).
// Felder liegen in Weltpixeln mit Rand m = M/2 (Index über S.wi(F, G)).
export function chunkCtx(x0, y0, cw, ch, K, KW, M) {
  const m = M >> 1, fw = cw + 2 * m, fh = ch + 2 * m, W2 = cw * 2, H2 = ch * 2, F0 = x0 * 2, G0 = y0 * 2;
  const abs = new Int32Array(W2 * H2).fill(-1), rel = new Int8Array(W2 * H2);
  const S = {
    x0, y0, cw, ch, K, KW, M, m, fw, fh, n: fw * fh, fx0: x0 - m, fy0: y0 - m, W2, H2, F0, G0, abs, rel,
    // fertige Farbe / Relief setzen (Feinpixel, global); außerhalb des Chunks wird nichts geschrieben
    put(F, G, c) { const f = F - F0, g = G - G0; if (f >= 0 && g >= 0 && f < W2 && g < H2) abs[g * W2 + f] = c; },
    mark(F, G, r) { const f = F - F0, g = G - G0; if (f >= 0 && g >= 0 && f < W2 && g < H2) rel[g * W2 + f] = r; },
    // Relief nur verstärken (dunkler bzw. heller als bisher)
    markMin(F, G, r) { const f = F - F0, g = G - G0; if (f >= 0 && g >= 0 && f < W2 && g < H2 && r < rel[g * W2 + f]) rel[g * W2 + f] = r; },
    // Terrain am Anker (innerhalb des Rands; weiter draußen liegende Anker werden auf den Rand gezogen)
    kAt(F, G) { return K[(clampI(G - G0, -M, H2 + M - 1) + M) * KW + clampI(F - F0, -M, W2 + M - 1) + M]; },
    // Feldindex (Weltpixel mit Rand) eines Feinpixels
    wi(F, G) { return ((clampI(G - G0, -M, H2 + M - 1) >> 1) + m) * fw + (clampI(F - F0, -M, W2 + M - 1) >> 1) + m; },
    // Index im Ausgabepuffer / in Feldern für Feinpixel im Chunk (schnell, ohne Prüfung)
    o(F, G) { return (G - G0) * W2 + (F - F0); },
    wiFast(F, G) { return (((G - G0) >> 1) + m) * fw + ((F - F0) >> 1) + m; },
    // Zellraster über den Chunk (Feinpixel, pad = Überstand der Stempel)
    cells(cwid, chei, pad, fn) {
      for (let cy = Math.floor((G0 - pad) / chei); cy <= Math.floor((G0 + H2 + pad) / chei); cy++)
        for (let cx = Math.floor((F0 - pad) / cwid); cx <= Math.floor((F0 + W2 + pad) / cwid); cx++) fn(cx, cy);
    },
    // Rauschfeld anlegen: Liste [schritt, maßstab x, maßstab y, seed, gewicht] (Weltpixel)
    noise(layers) {
      const out = new Float32Array(this.n);
      layers.forEach(([step, sx, sy, seed, k], i) => field(this.fx0, this.fy0, fw, fh, step, vnTable(this.fx0, this.fy0, fw, fh, step, sx, sy, seed), out, i > 0, k));
      return out;
    },
  };
  return S;
}

// Kein Untergrund dieses Codes in den Abständen probe (Feinpixel)? (z. B. Wegmitte: kein Gras ringsum)
export const MID_PROBE = [[0, -1], [0, -2], [0, 1], [0, 2], [-1, 0], [1, 0], [-2, 0], [2, 0], [-4, 0], [4, 0], [-6, 0], [6, 0], [0, -5], [0, 5]];
export function awayFrom(S, F, G, code, probe = MID_PROBE) {
  for (const [dx, dy] of probe) if (S.kAt(F + dx, G + dy) === code) return false;
  return true;
}

// Kiesel/Stein: Mittelpunkt (px, py) in Feinpixeln, Halbachsen rx/ry. St: Rampe dunkel→hell (mind. 7 Stufen),
// tint: Stufenversatz. Schlagschatten als Relief -2 unten rechts (finePixel dunkelt dort den Untergrund).
export function pebble(S, px, py, rx, ry, St, tint = 0, shadow = -2) {
  const top = St.length - 1;
  for (let G = Math.floor(py - ry - 1); G <= Math.ceil(py + ry + 2); G++) for (let F = Math.floor(px - rx - 1); F <= Math.ceil(px + rx + 1); F++) {
    const dx = (F + 0.5 - px) / rx, dy = (G + 0.5 - py) / ry, q = dx * dx + dy * dy;
    if (q <= 1) {
      const lit = -dx * 0.55 - dy * 0.85;
      S.put(F, G, lit > 0.5 && q < 0.75 ? St[clampI((rx < 1.7 ? top - 1 : top) + tint, 1, top)] : St[clampI((lit > 0.05 ? top - 2 : lit > -0.5 ? top - 3 : top - 4) + tint, 1, top)]);
      continue;
    }
    const sx = dx - 0.35, sy = (G + 0.5 - py - 0.9) / ry;
    if (shadow && dy > 0 && sx * sx + sy * sy <= 1) S.markMin(F, G, shadow);
  }
}

// Halm: Fuß (F, G), Höhe hh Feinpixel, lean -1/0/1 an der Spitze. R: Rampe (mind. 6), Schatten rechts am Fuß.
export function blade(S, F, G, hh, lean, R) {
  for (let r = 0; r < hh; r++) {
    const top = r === hh - 1;
    S.put(F + (top && hh > 2 ? lean : 0), G - r, R[top ? 5 : r === hh - 2 ? 4 : r === 0 ? 1 : 3]);
  }
  S.markMin(F + 1, G, -1);
}

// Strich ab (ax, ay), Länge len, Steigung s (Feinpixel). col: Farbe (oder null = Relief rel), light: Relief darunter.
export function stroke(S, ax, ay, len, s, col, rel = -2, light = 1) {
  for (let i = 0; i < len; i++) {
    const F = ax + i, G = ay + Math.round(i * s);
    if (col === null) S.mark(F, G, rel); else S.put(F, G, typeof col === 'function' ? col(i) : col);
    if (light && i < len - 1) S.mark(F, G + 1, light);
  }
}

// Feld (Weltpixel mit Rand, aus S.noise) am Feinpixel (F, G) bilinear zwischen den Weltpixelmitten: Grenzen, die
// aus dem Feld folgen, verlaufen dann im Feinraster statt in 2×2-Stufen (4 Lesezugriffe)
export function fineAt(f, S, F, G) {
  const tx = (F - S.F0) / 2 - 0.25, ty = (G - S.G0) / 2 - 0.25, ix = Math.floor(tx), iy = Math.floor(ty);
  const ax = tx - ix, ay = ty - iy, q = (iy + S.m) * S.fw + ix + S.m;
  const a = f[q] + (f[q + 1] - f[q]) * ax, b = f[q + S.fw] + (f[q + S.fw + 1] - f[q + S.fw]) * ax;
  return a + (b - a) * ay;
}

// Bodenart (level.soil, Zeilen wie die Karte) je Feinpixel, im selben Raster wie das Terrain K (Breite KW, Rand M):
// Index = ki. Grenze verwackelt wie in den Weltpixel-Shadern (Rauschen /sc, Seeds sa/sb, Ausschlag amp Weltpixel,
// hier als Feld auf grobem Gitter, fein interpoliert), am Übergang geordnet gerastert (dr Weltpixel).
// Ohne soil: alles ' ' (32). S.soilHas[code] = 1, wenn die Bodenart im Raster (mit Rand) vorkommt.
export function soilFine(S, soil, sc, sa, sb, amp, dr = 0.5) {
  const { K, KW, M, F0, G0, fw } = S, out = new Uint8Array(K.length), has = S.soilHas = new Uint8Array(256);
  if (!soil) { has[32] = 1; return out.fill(32); }
  const jx = S.noise([[4, sc, sc, sa, 1]]), jy = S.noise([[4, sc, sc, sb, 1]]), H = K.length / KW;
  // Blöcke von 16 × 16 Feinpixeln, deren erreichbare Kacheln (Ausschlag + Rasterung) alle dieselbe Bodenart haben,
  // sofort füllen; nur gemischte Blöcke je Feinpixel rechnen
  const r = amp / 2 + dr / 2 + 0.5, BW = Math.ceil(KW / 16), BH = Math.ceil(H / 16), mixed = new Uint8Array(BW * BH);
  for (let bj = 0; bj < BH; bj++) for (let bi = 0; bi < BW; bi++) {
    const ax = (F0 - M + bi * 16) / 2 - r, ay = (G0 - M + bj * 16) / 2 - r;
    const tx0 = Math.floor(ax / 16), tx1 = Math.floor((ax + 8 + 2 * r) / 16), ty0 = Math.floor(ay / 16), ty1 = Math.floor((ay + 8 + 2 * r) / 16);
    let c = -1, same = true;
    for (let ty = ty0; ty <= ty1 && same; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const row = soil[ty], v = row ? row.charCodeAt(tx) || 32 : 32;
      if (c < 0) c = v; else if (v !== c) { same = false; break; }
    }
    if (!same) { mixed[bj * BW + bi] = 1; continue; }
    has[c] = 1;
    for (let g = bj * 16; g < Math.min(H, bj * 16 + 16); g++) out.fill(c, g * KW + bi * 16, g * KW + Math.min(KW, bi * 16 + 16));
  }
  // Rand: Feinpixel ganz außen nehmen den letzten Wert (Interpolation braucht einen Nachbarn)
  for (let g = 0; g < H; g++) {
    const G = G0 - M + g, ty = Math.max(0, g / 2 - 0.25), iy = Math.min(Math.floor(ty), S.fh - 2), ay = ty - iy;
    const y0 = (G + 0.5) / 2, rb = (G & 3) * 4;
    let last = -1, lastC = 32;
    const mr = (g >> 4) * BW;
    for (let f = 0; f < KW; f++) {
      if (mixed[mr + (f >> 4)] === 0) { f |= 15; continue; }
      const F = F0 - M + f, tx = Math.max(0, f / 2 - 0.25), ix = Math.min(Math.floor(tx), fw - 2), ax = tx - ix, q = iy * fw + ix;
      const a = jx[q] + (jx[q + 1] - jx[q]) * ax, b = jx[q + fw] + (jx[q + fw + 1] - jx[q + fw]) * ax;
      const c = jy[q] + (jy[q + 1] - jy[q]) * ax, e = jy[q + fw] + (jy[q + fw + 1] - jy[q + fw]) * ax;
      const d = (D4[rb + (F & 3)] / 16 - 0.5) * dr;
      const x = (F + 0.5) / 2 + (a + (b - a) * ay - 0.5) * amp + d, y = y0 + (c + (e - c) * ay - 0.5) * amp + d;
      const tyi = Math.floor(y / 16), txi = Math.floor(x / 16), key = tyi * 65536 + txi;
      if (key !== last) { last = key; const row = soil[tyi]; lastC = row ? row.charCodeAt(txi) || 32 : 32; has[lastC] = 1; }
      out[g * KW + f] = lastC;
    }
  }
  return out;
}
// Bodenart am Anker (Stempel; Index wie S.kAt)
export function soilAt(S, F, G) {
  const { M, KW, W2, H2 } = S;
  return S.soil[(clampI(G - S.G0, -M, H2 + M - 1) + M) * KW + clampI(F - S.F0, -M, W2 + M - 1) + M];
}

// Pflaster fein in der Lage von groundPixel(':') (Steine 6 × 5 Weltpixel = 12 × 10 Feinpixel, Reihen versetzt):
// Stufe 1..5 der Steinrampe (Licht oben links, Kante unten rechts dunkler, je Stein eine Abplatzung an einer Ecke)
// oder -1 für die Fuge (1 Feinpixel).
export function paveAt(F, G) {
  const row = Math.floor(G / 10), sh = (row & 1) * 6, col = Math.floor((F + sh) / 12);
  const lx = F + sh - col * 12, ly = G - row * 10;
  if (lx === 0 || ly === 0) return -1;
  const s = hash2(col, row, 16);
  let i = s < 0.3 ? 2 : s < 0.8 ? 3 : 4;
  if (ly === 1 || lx === 1) i += 1;
  else if (ly === 9 || lx === 11) i -= 1;
  // Abplatzung: kleine dunkle Kerbe an einer Ecke (je Stein fest)
  const c = hash2(col, row, 751);
  if (c < 0.35) {
    const cx = c < 0.17 ? 11 : 1;
    if (ly >= 8 && Math.abs(lx - cx) <= (ly === 9 ? 1 : 0)) i = 1;
  }
  return clampI(i, 1, 5);
}

// Wie band(), aber mit wählbarer Breite w des gerasterten Übergangs (Anteil einer Stufe, z. B. 0,1 = schmal):
// bei flachen Feldern bleibt die Rasterung so ein schmaler Saum statt eines breiten Schachbretts
export function bandW(t, n, dt, w) {
  const v = t * n, k = Math.floor(v), f = v - k, a = 0.5 - w / 2;
  return k + (f > a + w ? 1 : f > a && dt < (f - a) / w ? 1 : 0);
}

// Abstandsfeld zu allen Weltpixeln, von deren 2 × 2 Feinpixeln einer einen Terraincode der Bitmaske mask trägt
// (Bit 1 << FK-Code). Gerechnet in Weltpixeln (Chamfer 3/4) über das ganze Terrainraster K (Zeilenbreite KW, Rand M),
// Ergebnis wie die Rauschfelder indiziert (S.wi), Einheit Feinpixel × 3 (gekappt bei 255). null, wenn der Code nicht
// vorkommt. Nahtlos über Chunkgrenzen für Abstände bis zum Rand (der kürzeste Weg liegt dann ganz im Raster).
export function distField(K, KW, mask) {
  const w = KW >> 1, h = (K.length / KW) >> 1, n = w * h, d = new Uint8Array(n);
  let any = false;
  for (let y = 0; y < h; y++) {
    const r0 = 2 * y * KW, r1 = r0 + KW;
    for (let x = 0; x < w; x++) {
      const f = 2 * x, hit = ((mask >> K[r0 + f]) | (mask >> K[r0 + f + 1]) | (mask >> K[r1 + f]) | (mask >> K[r1 + f + 1])) & 1;
      d[y * w + x] = hit ? 0 : 127;
      if (hit) any = true;
    }
  }
  if (!any) return null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = d[i];
    if (v === 0) continue;
    if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
    if (y > 0) {
      if (d[i - w] + 3 < v) v = d[i - w] + 3;
      if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4;
      if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4;
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    let v = d[i];
    if (v === 0) continue;
    if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
    if (y < h - 1) {
      if (d[i + w] + 3 < v) v = d[i + w] + 3;
      if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4;
      if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4;
    }
    d[i] = v;
  }
  for (let i = 0; i < n; i++) d[i] = d[i] >= 127 ? 255 : d[i] * 2;
  return d;
}
export const fissureDist = (K, KW, code) => distField(K, KW, 1 << code);

// Glanzpunkte des alten Wasser-Shaders (sprites/outdoor.js groundPixel '~' und world/Outdoor.js #groundAt):
// Weltpixel, an denen er Welle (Stufe 3) und Leuchtpunkt setzt. Feines Wasser gibt dort -1 zurück, damit
// Glanz und Leuchtebene genau wie bisher entstehen. Ergebnis je Weltpixel des Chunks (cw × ch), Rand 1 links/rechts.
export function waterGlints(x0, y0, cw, ch) {
  const W = cw + 2, g = new Uint8Array(W * ch);
  for (let y = 0; y < ch; y++) {
    const py = y0 + y, s = Math.sin(py * 0.6) * 2 + py * 0.9;
    for (let x = -1; x <= cw; x++) {
      const px = x0 + x;
      if (hash2(px, py, 25) < 0.3 && hash2(px, py, 13) < 0.5 && Math.sin(px * 0.35 + s) > 0.93) g[y * W + x + 1] = 1;
    }
  }
  return g;
}

// ------------------------------------------------------------ Feines Wasser (Seen, Bäche, Sumpf)
// WP: { water: Rampe 7 (0 Schatten, 3/4 Grundton wie der alte Ton 1/2, 5 Glanz wie der alte Ton 3, 6 hellster),
//       bank: Rampe 4 (Uferböschung, 3 = oben im Licht), weed: Rampe 4 oder null (Entengrütze), bubbles: Gasblasen }
// waterPrep in fineSetup (nach chunkCtx), waterStamps danach (Wellenstriche, Blasen, Grütze-Blättchen),
// waterFine in finePixel für kind === FK.WATER. Ohne Wasser im Raster bleibt S.ld null (waterFine liefert dann -1).
const WATER_LAND = 0xff & ~(1 << FK.WATER);
export function waterPrep(S, x0, y0, cw, ch, K, KW, WP) {
  S.ld = null; S.gl = null;
  let water = false;
  for (let i = 0; i < K.length; i++) if (K[i] === FK.WATER) { water = true; break; }
  if (!water) return;
  S.ld = distField(K, KW, WATER_LAND);
  S.gl = waterGlints(x0, y0, cw, ch);
  S.gw = cw + 2;
  // Wasserton: Tonfeld des Bioms (S.tone, sonst eigenes); Grütze-Feld
  S.wt = S.tone ?? S.noise([[4, 9, 9, 11, 0.6], [2, 3, 3, 12, 0.4]]);
  S.scum = WP.weed ? S.noise([[4, 10, 8, 907, 1]]) : null;
}
function ldAt(S, F, G) { return S.ld[S.wi(F, G)]; }
// Entengrütze: nahe am Ufer und im Grütze-Feld (d: Abstand zum Land, dt: Rasterwert am Rand)
function scumAt(S, F, G, d, dt) {
  if (!S.scum || d > 45) return false;
  const s = S.scum[S.wi(F, G)] + (d < 15 ? (15 - d) / 40 : 0);
  return s > 0.8 || (s > 0.75 && dt < (s - 0.75) / 0.05);
}
export function waterStamps(S, WP) {
  if (!S.ld) return;
  const W = WP.water;
  // Wellenstriche abseits vom Ufer: Strich hell, darunter dunkel
  S.cells(14, 6, 6, (cx, cy) => {
    if (hash2(cx, cy, 980) >= 0.4) return;
    const F = cx * 14 + 1 + Math.floor(hash2(cx, cy, 981) * 8), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 982) * 4);
    if (ldAt(S, F, G) < 15 || ldAt(S, F + 6, G) < 15) return;
    const len = 3 + Math.floor(hash2(cx, cy, 983) * 4);
    for (let i = 0; i < len; i++) S.put(F + i, G, W[i === 0 || i === len - 1 ? 4 : 5]);
    for (let i = 1; i < len - 1; i++) S.put(F + i, G + 1, W[2]);
  });
  // Gasblasen: Ring 3 × 3, oben links hell, unten rechts dunkel
  if (WP.bubbles) S.cells(18, 14, 4, (cx, cy) => {
    if (hash2(cx, cy, 985) >= 0.12) return;
    const F = cx * 18 + 3 + Math.floor(hash2(cx, cy, 986) * 12), G = cy * 14 + 3 + Math.floor(hash2(cx, cy, 987) * 8);
    if (ldAt(S, F, G) < 18) return;
    S.put(F, G - 1, W[6]); S.put(F - 1, G, W[5]); S.put(F + 1, G, W[4]); S.put(F, G + 1, W[2]); S.put(F, G, W[2]);
    if (hash2(cx, cy, 988) < 0.5) { S.put(F + 3, G + 1, W[5]); S.put(F + 3, G + 2, W[2]); }
  });
  // Grütze-Blättchen: 2 Feinpixel, Schatten darunter
  if (WP.weed) S.cells(5, 4, 2, (cx, cy) => {
    if (hash2(cx, cy, 990) >= 0.6) return;
    const F = cx * 5 + Math.floor(hash2(cx, cy, 991) * 4), G = cy * 4 + Math.floor(hash2(cx, cy, 992) * 3);
    if (S.kAt(F, G) !== FK.WATER || S.kAt(F + 1, G) !== FK.WATER || !scumAt(S, F, G, ldAt(S, F, G), 0.5)) return;
    S.put(F, G, WP.weed[3]); S.put(F + 1, G, WP.weed[2]); S.mark(F, G + 1, -1); S.mark(F + 1, G + 1, -1);
  });
}
// Wasser je Feinpixel (o: Index im Chunk, dt: Rasterwert). Ufer unter Land: Böschung (oben hell), dann Schatten.
// Die alten Glanzpunkte (mit Leuchtebene) liefert der Weltpixel-Shader (-1) für die obere Feinzeile.
export function waterFine(F, G, K, ki, KW, S, o, dt, WP) {
  if (!S.ld) return -1;
  const W = WP.water, B = WP.bank, WA = FK.WATER;
  const wi = (((G - S.G0) >> 1) + S.m) * S.fw + ((F - S.F0) >> 1) + S.m, d = S.ld[wi];
  if (d < 24) {
    if (K[ki - KW] !== WA) return B[3];
    if (K[ki - 2 * KW] !== WA) return B[2];
    if (K[ki - 3 * KW] !== WA) return B[1];
    if (K[ki - 4 * KW] !== WA) return W[1];
    if (K[ki - 5 * KW] !== WA || K[ki - 6 * KW] !== WA) return W[2];
    // unteres Ufer (Land darunter): flaches Wasser hell; seitlich dunkler Saum
    if (K[ki + KW] !== WA) return W[5];
    if (K[ki - 1] !== WA || K[ki + 1] !== WA) return W[2];
  }
  const a = S.abs[o];
  if (a >= 0) return a;
  const lx = ((F - S.F0) >> 1) + 1, ly = (G - S.G0) >> 1, gi = ly * S.gw + lx;
  if (S.gl[gi]) {
    if (!(G & 1) && K[ki - 6 * KW] === WA && K[ki - 2 * KW] === WA) return -1;
    return W[4];
  }
  // Glanzstrich: je ein Feinpixel links und rechts verlängert
  if (!(G & 1) && ((S.gl[gi - 1] && !(F & 1)) || (S.gl[gi + 1] && (F & 1)))) return W[4];
  const t = S.wt[wi];
  if (scumAt(S, F, G, d, dt)) return WP.weed[(t > 0.5 ? 1 : 0) + (S.rel[o] < 0 ? 0 : 1)];
  return W[3 + clampI(band(t, 2, dt), 0, 1)];
}

// Pflaster fein (Paket Boden, Steppe/Glutöde): Steine 12 × 10 Feinpixel (= 6 × 5 Weltpixel wie groundPixel ':'), jede
// zweite Reihe um 6 versetzt, Fuge 1 Feinpixel. Liefert den Rampenindex (Licht oben links, Kante unten rechts dunkel,
// gelegentlich Riss mit Lichtkante oder abgeschlagene Ecke) oder -1 = Fuge. Gleiche Steinfolge wie der Weltpixel-Shader.
export const PAVE_W = 12, PAVE_H = 10;
export function paveIdx(F, G, seed = 16) {
  const row = Math.floor(G / 10), sh = (row & 1) * 6, col = Math.floor((F + sh) / 12);
  const lx = F + sh - col * 12, ly = G - row * 10;
  if (lx === 0 || ly === 0) return -1;
  const s = hash2(col, row, seed);
  let i = s < 0.3 ? 2 : s < 0.8 ? 3 : 4;
  const e = hash2(col, row, seed + 735);
  // abgeschlagene Ecke (oben links oder unten rechts): Fugenfarbe
  if (e < 0.14 && ((lx === 1 && ly === 1) || (lx <= 2 && ly === 1 && e < 0.05))) return -1;
  if (e > 0.9 && lx === 11 && ly === 9) return -1;
  // Riss quer über den Stein: dunkle Linie, darunter Lichtkante
  if (e > 0.3 && e < 0.42) {
    const c = 3 + Math.floor(hash2(col, row, seed + 736) * 6), d = ly - 2 - Math.round((lx - c) * 0.5);
    if (lx >= c && lx <= c + 5) { if (d === 0) return 1; if (d === 1) return Math.min(5, i + 1); }
  }
  if (ly === 1 || lx === 1) i += 1;
  else if (ly === 9 || lx === 11) i -= 1;
  return i;
}
