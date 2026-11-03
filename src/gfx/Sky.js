import { CONFIG } from '../config.js';
import { hash2 } from '../core/math.js';
import { vnoise } from '../sprites/ground/kit.js';
import { makeCanvas } from './PixelCanvas.js';
import { fineRes } from './Fine.js';

// Himmel unter den Sternenscherben (level.sky): sichtbar überall, wo der Inselboden durchsichtig ist (Abgrund, Spalten
// der Lichtbrücken). Drei Ebenen, alle im Pixelraster ohne weiche Übergänge (Stufen mit 4×4-Dither, docs/STYLE.md):
//   1. fester Hintergrund in Bildschirmkoordinaten – Verlauf, Nebel, Sterne (unendlich fern, wandert nicht mit);
//   2. ferne Inseln, Kachel mit Parallaxe 0,35 (Tiefe beim Laufen);
//   3. Wolkenband am unteren Bildrand, zieht langsam und mit Parallaxe 0,2.
// Die Lightmap (gfx/Lighting.js) multipliziert danach das ganze Bild mit dem Umgebungslicht der Zone; die Farben hier
// sind darum vorab durch das Umgebungslicht geteilt, damit der Himmel so hell bleibt, wie er gemalt ist.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (a) => a.map(hex);
const D4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => D4[(y & 3) * 4 + (x & 3)];
const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
// periodisches Rauschen (Kacheln ohne Naht): Gitter in x mit Periode p
function pnoise(x, y, p, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % p) + p) % p, xb = (xa + 1) % p;
  const a = hash2(xa, y0, s), b = hash2(xb, y0, s), c = hash2(xa, y0 + 1, s), d = hash2(xb, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export const SKY_LOOKS = {
  // Morgenschimmer (Treibende Gärten, Sternhafen, Splitterweiten): oben Nacht, unten Morgenrot
  morgen: {
    sky: ramp(['#151638', '#22245a', '#3a3478', '#62458a', '#985a92', '#c87488', '#e89a88', '#f6c294']),
    neb: ramp(['#3c3a82', '#4e4a96']), neb2: ramp(['#7a5aa0', '#9466a8']),
    star: ramp(['#b8b8e8', '#e8e8ff', '#ffffff', '#ffe8d0']),
    far: ramp(['#4a3c7a', '#5e4a8a', '#72589a']), farLit: hex('#d2a0b4'), farTop: ramp(['#6a6aa0', '#8482b4']),
    farWarm: hex('#d88a8e'), farTree: ramp(['#4e3e7c', '#8a6a9e', '#c48ab0']),
    haze: ramp(['#6e5294', '#7c5c9c', '#8a66a2']), hazeLit: hex('#c48aa4'), hazeTop: ramp(['#8a72aa', '#9a80b2']),
    hazeWarm: hex('#c47c92'), hazeTree: ramp(['#7a5c9c', '#9a74a8', '#b88aae']),
    crystal: ramp(['#5ccbea', '#b8f2ff']),
    clouds: ramp(['#b86c86', '#dc8e8e', '#f2b49a', '#ffe0c4']),
    starLine: 0.5,
  },
};

const TILE_W = 640, TILE_H = 400;  // Kachel der fernen Inseln (Weltpixel)
const CLOUD_W = 480, CLOUD_H = 110; // Wolkenband (Weltpixel, waagerecht nahtlos)

export class StarSky {
  constructor(look, ambient = [255, 255, 255]) {
    const L = SKY_LOOKS[look] ?? SKY_LOOKS.morgen;
    // Farben vorab durch das Umgebungslicht teilen (Lightmap multipliziert später)
    const k = ambient.map((a) => 255 / Math.max(40, a));
    const comp = (c) => [0, 1, 2].map((i) => Math.min(255, Math.round(c[i] * k[i])));
    const deep = (v) => (Array.isArray(v[0]) ? v.map(comp) : comp(v));
    this.L = Object.fromEntries(Object.entries(L).map(([key, v]) => [key, Array.isArray(v) ? deep(v) : v]));
    this.base = null; this.far = null; this.haze = null; this.clouds = null;
    this.key = '';
  }

  // Zeichnet den Himmel in die ganze Sicht (vor dem Boden). ctx in Weltpixeln.
  render(ctx, cx, cy, time) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight, r = fineRes();
    const key = `${W}x${H}@${r}`;
    if (key !== this.key) { this.key = key; this.base = this.#bake(W, H, r); this.far ??= {}; this.haze ??= {}; this.clouds ??= {}; }
    ctx.drawImage(this.base, 0, 0, W, H);
    // ferne Inseln: zwei nahtlose Ebenen (Dunst 0,18, näher 0,38), dazwischen das Wolkenband; ganzzahlig im Feinraster
    const layer = (img, k, ox0 = 0, oy0 = 0) => {
      const ox = Math.round((cx * k + ox0) * r) / r, oy = Math.round((cy * k + oy0) * r) / r;
      const fx0 = -(((ox % TILE_W) + TILE_W) % TILE_W), fy0 = -(((oy % TILE_H) + TILE_H) % TILE_H);
      for (let y = fy0; y < H; y += TILE_H) for (let x = fx0; x < W; x += TILE_W) ctx.drawImage(img, x, y, TILE_W, TILE_H);
    };
    layer((this.haze[r] ??= this.#farTile(r, 0)), 0.18, 170, 60);
    const cl = (this.clouds[r] ??= this.#cloudTile(r));
    const wx = Math.round((cx * 0.2 + time * 2.5) * r) / r;
    const cx0 = -(((wx % CLOUD_W) + CLOUD_W) % CLOUD_W), cy0 = H - CLOUD_H;
    for (let x = cx0; x < W; x += CLOUD_W) ctx.drawImage(cl, x, cy0, CLOUD_W, CLOUD_H);
    layer((this.far[r] ??= this.#farTile(r, 1)), 0.38);
    // funkelnde Sterne (wenige, je 1 Feinpixel Kreuz)
    const tw = Math.floor(time * 3);
    for (let s = 0; s < 14; s++) {
      if (hash2(s, tw, 41) < 0.55) continue;
      const x = Math.floor(hash2(s, 0, 42) * W), y = Math.floor(hash2(s, 1, 42) * H * this.L.starLine);
      ctx.fillStyle = 'rgb(' + this.L.star[2].join(',') + ')';
      ctx.fillRect(x, y, 1 / r, 1 / r);
      ctx.fillRect(x - 1 / r, y, 3 / r, 1 / r); ctx.fillRect(x, y - 1 / r, 1 / r, 3 / r);
    }
    return true;
  }

  // Verlauf, Nebel und Sterne in Bildschirmgröße
  #bake(W, H, r) {
    const L = this.L, c = makeCanvas(W * r, H * r), g = c.getContext('2d');
    const img = g.createImageData(W * r, H * r), d = img.data, FW = W * r;
    const put = (X, Y, col) => { if (X < 0 || Y < 0 || X >= FW || Y >= H * r) return; const i = (Y * FW + X) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    const step = (rm, t, x, y) => rm[Math.max(0, Math.min(rm.length - 1, Math.floor(t * (rm.length - 1) + bay(x, y))))];
    // Schleier wie der Verlauf in Weltpixeln: lange, flache Bänder (Zirren), Rand als geordneter Dither-Saum über zwei
    // Stufen statt harter Flecken; oben kühl (Nacht), zum Morgenrot hin warm.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y / H, b = bay(x, y);
      let col = step(L.sky, Math.pow(t, 0.85), x, y);
      const sh = y * 0.18;   // Bänder leicht schräg
      const n = fbm((x + sh) / 170, y / 16, 11) * 0.75 + fbm((x + sh) / 40, y / 6, 12) * 0.25;
      const a = (n - 0.6) / 0.09 - Math.max(0, t - 0.42) * 7;
      if (a > b) col = step(L.neb, Math.min(1, (a - 1) * 0.5), x, y);
      const n2 = fbm((x - sh) / 130 + 30, y / 12, 23) * 0.7 + fbm(x / 30, y / 5, 24) * 0.3;
      const a2 = (n2 - 0.63) / 0.08 - Math.max(0, t - 0.55) * 6;
      if (t > 0.18 && a2 > b) col = step(L.neb2, Math.min(1, (a2 - 1) * 0.5), x, y);
      for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) put(x * r + i, y * r + j, col);
    }
    const count = Math.round(W * H / 310);
    for (let k = 0; k < count; k++) {
      const x = Math.floor(hash2(k, 0, 77) * W), y = Math.floor(hash2(k, 1, 77) * H);
      if (y / H > L.starLine - 0.05 + hash2(k, 3, 7) * 0.15) continue;
      const b = hash2(k, 2, 77), X = x * r + (r > 1 ? k & 1 : 0), Y = y * r + (r > 1 ? (k >> 1) & 1 : 0);
      const col = L.star[b > 0.97 ? 3 : b > 0.85 ? 2 : b > 0.5 ? 1 : 0];
      put(X, Y, col);
      if (b > 0.93) { put(X + 1, Y, col); put(X - 1, Y, L.star[1]); put(X, Y - 1, L.star[1]); put(X, Y + 1, L.star[1]); }
      if (b > 0.985 && r > 1) { put(X + 2, Y, L.star[0]); put(X - 2, Y, L.star[0]); put(X, Y - 2, L.star[0]); put(X, Y + 2, L.star[0]); }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ferne Inseln (depth 0 = ganz fern im Dunst, 1 = näher): Oberfläche leicht von oben gesehen (helle Grasnarbe, darauf
  // Baumkronen und hier und da eine Säule), darunter Felswand mit Bändern und ein spitzer Kiel; die Unterseite fängt das
  // Morgenrot (warme Kante links unten), am Kiel vereinzelt ein Kristallfunke. Weltpixel, nahtlos in x und y.
  #farTile(r, depth = 1) {
    const L = this.L, FW = TILE_W * r, FH = TILE_H * r, c = makeCanvas(FW, FH), g = c.getContext('2d');
    const img = g.createImageData(FW, FH), d = img.data;
    const putW = (x, y, col) => {
      x = ((x % TILE_W) + TILE_W) % TILE_W; y = ((y % TILE_H) + TILE_H) % TILE_H;
      for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) { const o = ((y * r + j) * FW + x * r + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    };
    const P = depth ? { top: L.farTop, lit: L.farLit, body: L.far, warm: L.farWarm, tree: L.farTree } : { top: L.hazeTop, lit: L.hazeLit, body: L.haze, warm: L.hazeWarm, tree: L.hazeTree };
    const isles = depth
      ? [[96, 70, 40, 7, 3], [392, 168, 26, 5, 2], [566, 318, 46, 8, 4], [214, 330, 15, 3, 1], [508, 46, 13, 3, 1], [300, 262, 10, 2, 0]]
      : [[40, 140, 22, 4, 2], [250, 40, 30, 5, 3], [450, 230, 18, 3, 1], [610, 110, 12, 2, 1], [150, 270, 9, 2, 0], [350, 350, 26, 4, 2]];
    isles.forEach(([cx, cy, rx, ry, trees], s) => {
      const sd = s + depth * 20;
      // Umriss je Spalte: Oberkante (Ellipse, flach) und Wandhöhe
      for (let x = Math.floor(cx - rx * 1.2); x < cx + rx * 1.2; x++) {
        const e = (x - cx) / rx, wob = 0.1 * Math.sin(e * 5 + sd) + 0.06 * Math.sin(e * 11 + sd * 2);
        const q = 1 - e * e;
        if (q + wob <= 0) continue;
        const hh = Math.max(1, Math.round(ry * Math.sqrt(Math.max(0, q + wob)))), top = cy - hh, bot = cy + Math.round(hh * 0.45);
        for (let y = top; y <= bot; y++) putW(x, y, y === top ? P.lit : y < top + 2 ? P.top[1] : P.top[0]);
        // Wand (Bänder) und Kiel
        const wall = Math.round(ry * 0.9 + 1), kd = Math.round(ry * (depth ? 3.2 : 2.6) * Math.pow(Math.max(0, q), 0.7) * (0.6 + 0.4 * vnoise(x / 4, 1, sd)));
        for (let j = 1; j <= wall + kd; j++) {
          const y = bot + j, inWall = j <= wall;
          let col = inWall ? (((j + Math.round(vnoise(x / 6, 2, sd) * 3)) % 4 === 0) ? P.body[1] : P.body[2]) : (j - wall < 3 ? P.body[1] : P.body[0]);
          // Morgenrot von unten: warme Kante an der linken Unterseite des Kiels
          if (!inWall && (j === wall + kd || (e < -0.2 && j > wall + kd - 2))) col = P.warm;
          putW(x, y, col);
        }
        if (depth && kd > 6 && hash2(x, 3, sd + 50) > 0.9) putW(x, bot + wall + Math.floor(kd * 0.6), L.crystal[hash2(x, 4, sd) > 0.5 ? 1 : 0]);
      }
      // Baumkronen und Säulen auf der Oberfläche (Silhouetten mit Lichtkante oben)
      for (let k = 0; k < trees; k++) {
        const tx = Math.round(cx + (hash2(k, sd, 61) - 0.5) * rx * 1.3), ty = cy - Math.round(ry * 0.6), tr = depth ? 3 + Math.floor(hash2(k, sd, 62) * 3) : 2 + Math.floor(hash2(k, sd, 62) * 2);
        if (hash2(k, sd, 63) < 0.25) {   // Säule
          for (let j = 0; j < tr * 2 + 2; j++) { putW(tx, ty - j, P.tree[0]); putW(tx + 1, ty - j, P.tree[1]); }
          putW(tx - 1, ty - tr * 2 - 2, P.tree[1]); putW(tx + 2, ty - tr * 2 - 2, P.tree[1]);
          continue;
        }
        for (let j = 0; j < tr; j++) putW(tx, ty - j, P.tree[0]);
        for (let y = -tr; y <= tr; y++) for (let x = -tr - 1; x <= tr + 1; x++) {
          const q = (x * x) / ((tr + 1) * (tr + 1)) + (y * y) / (tr * tr);
          if (q > 1 + (hash2(tx + x, y, sd) - 0.5) * 0.35) continue;
          putW(tx + x, ty - tr - 1 + y, y < -tr * 0.4 && x < tr * 0.5 ? P.tree[2] : P.tree[1]);
        }
      }
    });
    g.putImageData(img, 0, 0);
    return c;
  }

  // Wolken: Haufenwolken im Morgenrot – Ballen aus überlappenden Bögen (Oberkante hell, darunter zwei Schattenstufen),
  // unten zu einer dichten Bank verschmolzen; waagerecht nahtlos (Periode CLOUD_W)
  #cloudTile(r) {
    const L = this.L, FW = CLOUD_W * r, FH = CLOUD_H * r, c = makeCanvas(FW, FH), g = c.getContext('2d');
    const img = g.createImageData(FW, FH), d = img.data, P = CLOUD_W / 60;
    // Ballen: x, Grundlinie, Radius (Weltpixel); von hinten (oben) nach vorn (unten) gemalt, jeder Ballen deckt die
    // hinteren ab und bringt seine eigene Lichtkante mit – so entstehen gestaffelte Haufenwolken statt einer Fläche.
    const puffs = [];
    // in Haufen: je Haufen ein großer Ballen in der Mitte, kleinere seitlich und davor
    for (let c = 0; c < 9; c++) {
      const hx = (c + hash2(c, 5, 71) * 0.6) * (CLOUD_W / 9), big = 10 + hash2(c, 6, 71) * 9, n = 5 + Math.floor(hash2(c, 7, 71) * 4);
      for (let k = 0; k < n; k++) {
        const u = (hash2(c, k, 72) - 0.5) * 2, rr = big * (1 - Math.abs(u) * 0.55) * (0.75 + hash2(c, k, 73) * 0.3);
        puffs.push([Math.floor(hx + u * big * 1.6), CLOUD_H - 10 - (1 - Math.abs(u)) * big * 0.9 + hash2(c, k, 74) * 8, rr, c * 10 + k]);
      }
    }
    puffs.sort((u, v) => u[1] - v[1]);
    const buf = new Int8Array(CLOUD_W * CLOUD_H).fill(-1);
    for (const [px, py, rr, k] of puffs) {
      for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        const x = (((px + dx) % CLOUD_W) + CLOUD_W) % CLOUD_W, top = Math.round(py - Math.sqrt(Math.max(0, rr * rr - dx * dx)));
        const bot = Math.min(CLOUD_H, Math.round(py + Math.sqrt(Math.max(0, rr * rr - dx * dx)) * 0.45));
        for (let y = Math.max(0, top); y < bot; y++) {
          const dy = y - top, side = dx / rr, b = bay(x, y);
          // Lichtkante oben (links breiter, Licht von links oben), dann Mittelton, Schatten zur Unterseite und rechts
          let i = dy < 1 ? 3 : dy < 2 + (side < 0 ? 2 : 0) ? (side > 0.75 ? 2 : 3) : dy < rr * 0.55 + (side < 0 ? 2 : -1) ? 2 : dy < rr * 0.55 + 2 && b < 0.5 ? 2 : 1;
          if (i === 1 && dy > rr * 1.15 + pnoise(x / 10, k, P * 6, 9) * 4) i = 0;
          buf[y * CLOUD_W + x] = i;
        }
      }
    }
    // vorderste Wolkenbank am unteren Rand (deckt die Unterseiten der Ballen)
    for (let x = 0; x < CLOUD_W; x++) {
      const top = Math.round(CLOUD_H - 9 - pnoise(x / 22, 0.5, P * 2.7, 8) * 9);
      for (let y = top; y < CLOUD_H; y++) buf[y * CLOUD_W + x] = y - top < 1 ? 3 : y - top < 3 ? 2 : y - top < 6 ? 1 : 0;
    }
    for (let y = 0; y < CLOUD_H; y++) for (let x = 0; x < CLOUD_W; x++) {
      const i = buf[y * CLOUD_W + x];
      if (i < 0) continue;
      const col = L.clouds[i];
      for (let j = 0; j < r; j++) for (let ii = 0; ii < r; ii++) { const o = ((y * r + j) * FW + x * r + ii) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
