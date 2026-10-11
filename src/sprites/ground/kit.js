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
  const inv = 1 / step;
  for (let y = 0; y < h; y++) {
    const fy = (y + oy) * inv, j = fy | 0, ay = fy - j, o = y * w;
    for (let x = 0; x < w; x++) {
      const fx = (x + ox) * inv, i = fx | 0, ax = fx - i, q = j * W + i;
      const t = a[q] + (a[q + 1] - a[q]) * ax, u = a[q + W] + (a[q + W + 1] - a[q + W]) * ax;
      const v = (t + (u - t) * ay) * k;
      out[o + x] = add ? out[o + x] + v : v;
    }
  }
  return out;
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
      layers.forEach(([step, sx, sy, seed, k], i) => field(this.fx0, this.fy0, fw, fh, step, (x, y) => vnoise(x / sx, y / sy, seed), out, i > 0, k));
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
