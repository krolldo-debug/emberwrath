import { hash2 } from '../core/math.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';

// Bilder für die Ankündigung „Sternenglut“: Morgenschimmer-Himmel, treibende Inseln, Sternhafen, Schriftzug.
// Alles prozedural im Weltraster (1 Weltpixel = R×R Bildpunkte), damit Figuren aus dem Spiel (Feinraster, res 2)
// ohne Umrechnung darauf stehen. Anzeige per CSS ganzzahlig und image-rendering: pixelated.
export const R = 2;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (a) => a.map(hex);
// Farben wie der freigegebene Look C „Morgenschimmer“ (sternenglut/entwuerfe/szene.mjs)
export const DAWN = {
  sky: ramp(['#151638', '#22245a', '#3a3478', '#62458a', '#985a92', '#c87488', '#e89a88', '#f6c294']),
  neb: ramp(['#3c3a82', '#4e4a96']), neb2: ramp(['#7a5aa0', '#9466a8']),
  star: ramp(['#b8b8e8', '#e8e8ff', '#ffffff', '#ffe8d0']),
  far: ramp(['#4a3c7a', '#5a4a8a', '#7a5c96', '#a06e9a']),
  grass: ramp(['#22303e', '#2e434c', '#3d5a5a', '#507468', '#6c927c', '#97b896']),
  cliff: ramp(['#1c1834', '#28224a', '#352d5e', '#443a72', '#584a88', '#6e5c9e']),
  keel: ramp(['#141028', '#1e1838', '#2a2048', '#3a2c5c']),
  stone: ramp(['#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8', '#ecebf8']),
  roof: ramp(['#1e2a5a', '#2a3c78', '#3a5496', '#5274b4', '#7a9ad0']),
  crystal: ramp(['#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff']),
  lantern: ramp(['#5a3a20', '#d8984a', '#f6c87a', '#fff0c8', '#ffffff']),
  leaf: ramp(['#4a1e3c', '#6e2c56', '#9a4474', '#c86a98', '#eca0c0', '#ffd8ea']),
  trunk: ramp(['#241a2c', '#342640', '#463654', '#5c4a6a']),
  clouds: ramp(['#c87488', '#e0948e', '#f2b49a', '#fad2b4']),
  ink: '#0e0b1e',
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function vn(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y, s) => vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, s + 13) * 0.15;
// gerasterte Stufe aus einer Rampe (t 0..1), Dither auf Weltpixeln
const step = (r, t, x, y) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * (r.length - 1) + bay(x, y))))];

// Weltpixel-Puffer: put(x, y, rgb) setzt einen Weltpixel, toCanvas() vergrößert auf R×R.
class Buf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  put(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const v = typeof c === 'string' ? hex(c) : c;
    this.d[i] = v[0]; this.d[i + 1] = v[1]; this.d[i + 2] = v[2]; this.d[i + 3] = 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c); }
  toCanvas() {
    const c = makeCanvas(this.w * R, this.h * R), ctx = c.getContext('2d');
    const img = ctx.createImageData(this.w * R, this.h * R);
    for (let y = 0; y < this.h * R; y++) for (let x = 0; x < this.w * R; x++) {
      const s = (((y / R) | 0) * this.w + ((x / R) | 0)) * 4, t = (y * this.w * R + x) * 4;
      img.data[t] = this.d[s]; img.data[t + 1] = this.d[s + 1]; img.data[t + 2] = this.d[s + 2]; img.data[t + 3] = this.d[s + 3];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

// Himmel: Verlauf Nacht oben → Pfirsich am Horizont, zwei Nebelschleier, Sterne nur im dunklen Teil, Wolkenbank unten
function sky(b, seed, { clouds = 0.55 } = {}) {
  const { w, h } = b;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / h;
    let c = step(DAWN.sky, Math.pow(t, 0.85), x, y);
    const n = fbm(x / 70, y / 24, seed + 11) * 0.8 + vn(x / 9, y / 7, seed + 12) * 0.2;
    if (n > 0.66 - bay(x, y) * 0.05 && t < 0.62) c = step(DAWN.neb, (n - 0.62) / 0.3, x, y);
    const n2 = fbm(x / 50 + 30, y / 50, seed + 23) * 0.8 + vn(x / 8, y / 8, seed + 24) * 0.2;
    if (n2 > 0.7 - bay(x, y) * 0.05 && t < 0.55) c = step(DAWN.neb2, (n2 - 0.67) / 0.25, x, y);
    b.put(x, y, c);
    const s = hash2(x, y, seed + 5);
    if (t < 0.5 && s > 0.991) b.put(x, y, DAWN.star[s > 0.997 ? 2 : 1]);
  }
  // ein paar große Funkelsterne (Kreuz)
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(hash2(i, 1, seed) * w), y = Math.floor(hash2(i, 2, seed) * h * 0.35) + 3;
    b.put(x, y, DAWN.star[2]); b.put(x - 1, y, DAWN.star[0]); b.put(x + 1, y, DAWN.star[0]); b.put(x, y - 1, DAWN.star[0]); b.put(x, y + 1, DAWN.star[0]);
  }
  const top = Math.floor(h * clouds);
  for (let y = top; y < h; y++) for (let x = 0; x < w; x++) {
    const band = Math.sin(x / 30 + y / 7) * 0.5 + fbm(x / 48, y / 11, seed + 5);
    const t = (y - top) / (h - top);
    if (band > 0.8 - t * 0.55) b.put(x, y, step(DAWN.clouds, t * 0.8 + (band - 0.6) * 0.5, x, y));
  }
}

// Schwebende Insel: Grasdecke (Ellipse mit gezacktem Rand), Felskiel nach unten spitz, Kristalltropfen.
// far = Silhouette in Himmelsfarbe (Ferne). Liefert die Oberkante je Spalte, damit Gebäude darauf stehen.
function island(b, cx, cy, rx, ry, depth, seed, { far = false, crystals = true } = {}) {
  const topAt = new Map();
  for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const u = (x - cx) / rx;
    if (Math.abs(u) > 1) continue;
    const half = ry * Math.sqrt(1 - u * u);
    const jag = Math.round((vn(x / 3, 0, seed) - 0.5) * 2);
    const y0 = Math.round(cy - half), y1 = Math.round(cy + half) + jag;
    const keel = Math.max(1, Math.round(depth * Math.pow(1 - u * u, 0.8) * (0.75 + vn(x / 4, 3, seed + 1) * 0.5)));
    topAt.set(x, y0);
    for (let y = y0; y <= y1 + keel; y++) {
      let c;
      if (far) {
        c = y <= y1 ? DAWN.far[y === y0 ? 3 : 2] : DAWN.far[y > y1 + keel * 0.5 ? 0 : 1];
      } else if (y <= y1) {
        // Gras: hell oben links, kühler zur Kante, Rand der Decke dunkel
        const t = 0.35 + (1 - (y - y0) / Math.max(1, y1 - y0)) * 0.35 - u * 0.25 + (fbm(x / 6, y / 4, seed + 3) - 0.5) * 0.5;
        c = y === y1 ? DAWN.grass[1] : step(DAWN.grass, t, x, y);
        if (y === y0) c = DAWN.grass[4 + (u < 0 ? 1 : 0)];
      } else {
        // Fels: Schichtbänder, links heller (Licht oben links), nach unten dunkler Kiel
        const d = (y - y1) / keel;
        const layer = Math.floor((y - y1 + vn(x / 5, y / 2, seed + 7) * 2) / 3) & 1;
        const t = 0.75 - d * 0.7 - u * 0.25 + layer * 0.08;
        c = d > 0.6 ? step(DAWN.keel, 1 - (d - 0.6) * 2, x, y) : step(DAWN.cliff, t, x, y);
        if (y === y1 + 1) c = DAWN.cliff[1];
      }
      b.put(x, y, c);
    }
    // Kristalltropfen unter dem Kiel
    if (!far && crystals && hash2(x, 9, seed) > 0.9) {
      const len = 1 + Math.floor(hash2(x, 10, seed) * 3);
      for (let i = 1; i <= len; i++) b.put(x, y1 + keel + i, DAWN.crystal[i === len ? 4 : 2]);
    }
  }
  return topAt;
}

function tree(b, x, y, s, seed) {
  for (let i = 0; i < 4 + s; i++) b.put(x, y - i, DAWN.trunk[i < 2 ? 1 : 2]);
  b.put(x - 1, y - 2 - s, DAWN.trunk[1]);
  const r = 3 + s, cy = y - 4 - s - r * 0.5;
  for (let j = -r; j <= r; j++) for (let i = -r - 1; i <= r + 1; i++) {
    const d = (i * i) / ((r + 1) * (r + 1)) + (j * j) / (r * r * 0.7);
    if (d > 1 - vn((x + i) / 2, (cy + j) / 2, seed) * 0.35) continue;
    const t = 0.7 - j / (r * 2) - i / (r * 3) + (hash2(x + i, cy + j, seed) - 0.5) * 0.4;
    b.put(x + i, cy + j, step(DAWN.leaf, t, x + i, Math.round(cy + j)));
  }
}

// Haus mit blauem Satteldach (wie Sternhafen im Spiel); tower = Rundturm mit Kegeldach
function house(b, x, y, w, hgt, tower = false) {
  const S = DAWN.stone, Rf = DAWN.roof;
  for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) b.put(x + i, y - j, i === 0 ? S[4] : i === w - 1 ? S[1] : S[3 - ((j & 3) === 3 ? 1 : 0)]);
  // Fenster warm
  for (let i = 2; i < w - 2; i += 3) { b.put(x + i, y - Math.floor(hgt / 2), DAWN.lantern[2]); if (hgt > 7) b.put(x + i, y - hgt + 3, DAWN.lantern[1]); }
  const rh = tower ? Math.ceil(w * 1.3) : Math.ceil(w / 2);
  for (let j = 0; j < rh; j++) {
    const half = tower ? Math.round((w / 2 + 0.5) * (1 - j / rh)) : Math.ceil(w / 2) + 1 - j;
    const mid = x + (w - 1) / 2;
    for (let i = Math.round(mid - half); i <= Math.round(mid + half); i++) b.put(i, y - hgt - j, i < mid ? Rf[3 - (j === 0 ? 1 : 0)] : Rf[1]);
  }
  if (tower) b.put(Math.round(x + (w - 1) / 2), y - hgt - rh, DAWN.lantern[3]);
  else for (let i = 0; i < w + 2; i++) b.put(x - 1 + i, y - hgt, Rf[0]);
}

// Leuchtender Stern mit Strahlenkreuz (Sternhafens Turmspitze, Logo-Raute)
function star(b, x, y, r) {
  const L = DAWN.lantern;
  for (let i = -r; i <= r; i++) { b.put(x + i, y, L[Math.abs(i) < r / 2 ? 4 : 3]); b.put(x, y + i, L[Math.abs(i) < r / 2 ? 4 : 3]); }
  for (let i = 1; i <= Math.floor(r / 2); i++) { b.put(x + i, y + i, L[2]); b.put(x - i, y - i, L[2]); b.put(x + i, y - i, L[2]); b.put(x - i, y + i, L[2]); }
}

// Sternhafen: Häuser, Türme und der Sternturm in der Mitte auf der Oberkante topAt
function city(b, topAt, cx, spread) {
  const at = (x) => topAt.get(Math.round(x)) ?? null;
  const parts = [
    [-spread, 6, 6], [-spread + 7, 5, 9, true], [-spread + 13, 8, 7], [-8, 6, 10, true],
    [5, 7, 8], [12, 5, 11, true], [spread - 12, 8, 6], [spread - 5, 6, 8],
  ];
  for (const [dx, w, hgt, tw] of parts) {
    const x = Math.round(cx + dx), y = at(x + w / 2);
    if (y != null) house(b, x, y + 2, w, hgt, !!tw);
  }
  // Sternturm
  const y = (at(cx) ?? 0) + 2, S = DAWN.stone;
  for (let j = 0; j < 30; j++) {
    const half = j < 22 ? 2 : 1;
    for (let i = -half; i <= half; i++) b.put(cx + i, y - j, i === -half ? S[5] : i === half ? S[1] : S[3]);
  }
  for (let i = -3; i <= 3; i++) b.put(cx + i, y - 22, S[4]);
  star(b, cx, y - 35, 5);
}

// Hauptbild: Sternhafen auf der großen Insel, links die Gärten, rechts Splitter mit Kristallen, ferne Inseln.
// Liefert { canvas, w, h, spots } (spots = Weltpixel, an denen Figuren stehen können).
export function vistaHarbor(w = 320, h = 120, seed = 3) {
  const b = new Buf(w, h);
  sky(b, seed, { clouds: 0.58 });
  island(b, w * 0.1, h * 0.42, 14, 3, 7, seed + 40, { far: true });
  island(b, w * 0.92, h * 0.34, 10, 2, 6, seed + 41, { far: true });
  island(b, w * 0.72, h * 0.22, 6, 1.5, 4, seed + 42, { far: true });
  // Gärten links
  const g = island(b, w * 0.17, h * 0.7, 34, 6, 18, seed + 50);
  for (let i = 0; i < 6; i++) { const x = Math.round(w * 0.17 - 28 + i * 11 + hash2(i, 1, seed) * 4); const y = g.get(x); if (y != null) tree(b, x, y + 3, (i & 1) + 1, seed + i); }
  // Splitterweiten rechts: Kristallspitzen
  const s = island(b, w * 0.84, h * 0.66, 30, 5, 16, seed + 60);
  for (let i = 0; i < 5; i++) {
    const x = Math.round(w * 0.84 - 22 + i * 10 + hash2(i, 2, seed) * 4), y = (s.get(x) ?? 0) + 3, hh = 6 + Math.floor(hash2(i, 3, seed) * 8);
    for (let j = 0; j < hh; j++) { const hw = Math.max(0, Math.round((1 - j / hh) * 2)); for (let k = -hw; k <= hw; k++) b.put(x + k, y - j, DAWN.crystal[k < 0 ? 3 : k > 0 ? 1 : 2 + (j > hh - 3 ? 2 : 0)]); }
  }
  // Sternhafen in der Mitte
  const m = island(b, w * 0.5, h * 0.6, 54, 8, 30, seed + 70);
  city(b, m, Math.round(w * 0.5), 44);
  // Kristallstufen als Brücken
  for (let i = 0; i < 6; i++) { b.rect(Math.round(w * 0.3 + i * 3), Math.round(h * 0.64 - i * 0.4), 2, 1, DAWN.crystal[3]); b.rect(Math.round(w * 0.66 + i * 3), Math.round(h * 0.6 + i * 0.6), 2, 1, DAWN.crystal[3]); }
  return { canvas: b.toCanvas(), w, h, ground: (x) => m.get(Math.round(x)) ?? null };
}

// Bühne für Draft B: eine breite Felsinsel im Vordergrund (Figuren stehen auf groundY), Sternhafen klein in der Ferne
export function vistaStage(w = 360, h = 150, seed = 9) {
  const b = new Buf(w, h);
  sky(b, seed, { clouds: 0.5 });
  island(b, w * 0.18, h * 0.3, 10, 2, 6, seed + 1, { far: true });
  island(b, w * 0.86, h * 0.22, 14, 2, 8, seed + 2, { far: true });
  const far = island(b, w * 0.62, h * 0.42, 26, 3, 12, seed + 3, { far: true });
  // ferne Stadt als Silhouette mit Stern
  for (let i = -18; i <= 18; i += 6) { const x = Math.round(w * 0.62 + i), y = far.get(x); if (y != null) for (let j = 0; j < 4 + (i === 0 ? 8 : (i & 4) ? 3 : 0); j++) for (let k = 0; k < 3; k++) b.put(x + k - 1, y - j, DAWN.far[1]); }
  star(b, Math.round(w * 0.62), Math.round(h * 0.42) - 18, 3);
  const g = island(b, w * 0.5, h * 0.8, w * 0.56, 10, 26, seed + 4);
  tree(b, Math.round(w * 0.06), (g.get(Math.round(w * 0.06)) ?? h) + 4, 2, seed);
  tree(b, Math.round(w * 0.95), (g.get(Math.round(w * 0.95)) ?? h) + 4, 1, seed + 1);
  return { canvas: b.toCanvas(), w, h, groundY: Math.round(h * 0.8) };
}

// Karte für Draft C: Draufsicht der Inselkette im Wolkenmeer (Teil 1 sichtbar, zwei Inseln im Nebel)
export function vistaMap(w = 200, h = 150, seed = 21) {
  const b = new Buf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Wolkenmeer: tiefes Violett, darüber helle Wolkenzüge (Morgenlicht von unten rechts)
    const n = fbm(x / 30, y / 14, seed) * 0.8 + vn(x / 5, y / 4, seed + 1) * 0.2;
    const t = n * 0.9 + (x + y) / (w + h) * 0.25;
    b.put(x, y, t > 0.8 ? step(DAWN.clouds, (t - 0.8) * 3, x, y) : step(DAWN.sky.slice(1, 5), t / 0.8, x, y));
  }
  const blob = (cx, cy, r, seed2, look) => {
    const pts = [];
    for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 3; x <= r + 3; x++) {
      const a = Math.atan2(y, x), rr = r * (0.82 + vn(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, seed2) * 0.36);
      if (x * x / 1.2 + y * y > rr * rr) continue;
      pts.push([cx + x, cy + y, Math.sqrt(x * x / 1.2 + y * y) / rr, x, y]);
    }
    // Schlagschatten unten rechts (Insel schwebt)
    for (const [x, y] of pts) b.put(x + 3, y + 4, DAWN.sky[2]);
    for (const [x, y, d, dx, dy] of pts) {
      let c;
      if (look === 'fog') c = step(DAWN.far, 0.6 - dy / r * 0.3 + (hash2(x, y, 3) - 0.5) * 0.3, x, y);
      else if (d > 0.86) c = dy > 0 ? DAWN.cliff[2] : DAWN.cliff[4];
      else if (look === 'city') c = step(DAWN.stone, 0.55 - (dx + dy) / r * 0.2 + (fbm(x / 3, y / 3, 4) - 0.5) * 0.4, x, y);
      else if (look === 'crystal') c = step(DAWN.cliff, 0.7 - (dx + dy) / r * 0.2 + (fbm(x / 3, y / 3, 5) - 0.5) * 0.5, x, y);
      else c = step(DAWN.grass, 0.55 - (dx + dy) / r * 0.25 + (fbm(x / 4, y / 4, 6) - 0.5) * 0.5, x, y);
      b.put(x, y, c);
    }
    return pts;
  };
  const places = {
    sternhafen: [100, 74, 18, 'city'], gardens: [42, 58, 20, 'garden'], splitter: [150, 108, 19, 'crystal'],
    fog1: [162, 30, 12, 'fog'], fog2: [36, 124, 10, 'fog'],
  };
  for (const [id, [x, y, r, look]] of Object.entries(places)) {
    const pts = blob(x, y, r, seed + x, look);
    if (look === 'garden') for (const [px, py, d] of pts) if (d < 0.75 && hash2(px, py, 7) > 0.93) tree(b, px, py + 3, 0, seed + px);
    if (look === 'crystal') for (const [px, py, d] of pts) if (d < 0.7 && hash2(px, py, 8) > 0.95) { b.put(px, py, DAWN.crystal[4]); b.put(px, py + 1, DAWN.crystal[2]); b.put(px + 1, py + 1, DAWN.crystal[1]); }
    if (look === 'city') {
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; house(b, Math.round(x + Math.cos(a) * 10) - 2, Math.round(y + Math.sin(a) * 7) + 3, 4, 3); }
      star(b, x, y - 2, 3);
    }
  }
  // Wege: Kristallstufen zwischen den Inseln
  const path = (a, c) => { for (let t = 0.18; t < 0.84; t += 0.06) b.rect(Math.round(a[0] + (c[0] - a[0]) * t), Math.round(a[1] + (c[1] - a[1]) * t), 2, 1, DAWN.crystal[3]); };
  path(places.sternhafen, places.gardens); path(places.sternhafen, places.splitter);
  return { canvas: b.toCanvas(), w, h, places };
}

// Figur aus dem Spiel (SpriteFrame, Feinraster) auf ein Bild stellen: Fußpunkt (x, y) in Weltpixeln
export function drawFigure(canvas, frame, x, y, { flip = false } = {}) {
  if (!frame?.canvas) return;
  const ctx = canvas.getContext('2d'), k = R / (frame.res ?? 1);
  ctx.imageSmoothingEnabled = false;
  const img = flip ? frame.flipped : frame.canvas, ax = flip ? frame.canvas.width - frame.ax : frame.ax;
  ctx.drawImage(img, Math.round(x * R - ax * k), Math.round(y * R - frame.ay * k), img.width * k, img.height * k);
}

// Schriftzug „STERNENGLUT“: eigene Großbuchstaben (12 px) wie das Emberwrath-Logo, aber im Morgenschimmer:
// weiß-pfirsich oben, rosé, violett unten, Kontur fast schwarz-violett, Stern als Zier unter dem Wort.
const GLYPHS = {
  S: ['..XXXXXX.', '.XXXXXXXX', 'XXX....XX', 'XXX.....X', 'XXXX.....', '.XXXXXX..', '..XXXXXX.', '.....XXXX', 'X.....XXX', 'XX....XXX', 'XXXXXXXX.', '.XXXXXX..'],
  T: ['XXXXXXXXXXX', 'XXXXXXXXXXX', 'XX..XXX..XX', 'X...XXX...X', '....XXX....', '....XXX....', '....XXX....', '....XXX....', '....XXX....', '....XXX....', '...XXXXX...', '...XXXXX...'],
  E: ['XXXXXXXXX', 'XXXXXXXXX', '.XXX...XX', '.XXX....X', '.XXX.X...', '.XXXXX...', '.XXXXX...', '.XXX.X...', '.XXX....X', '.XXX...XX', 'XXXXXXXXX', 'XXXXXXXXX'],
  R: ['XXXXXXXX..', 'XXXXXXXXX.', '.XXX...XXX', '.XXX...XXX', '.XXX..XXX.', '.XXXXXXX..', '.XXXXXX...', '.XXX.XXX..', '.XXX..XXX.', '.XXX..XXX.', 'XXXXX..XXX', 'XXXXX...XX'],
  N: ['XXXX...XXXX', 'XXXXX..XXXX', '.XXXXX..XX.', '.XXXXX..XX.', '.XX.XXX.XX.', '.XX.XXX.XX.', '.XX..XXXXX.', '.XX..XXXXX.', '.XX...XXXX.', '.XX....XXX.', 'XXXX....XX.', 'XXXX.....X.'],
  G: ['..XXXXXX..', '.XXXXXXXX.', 'XXX....XXX', 'XXX.....XX', 'XXX.......', 'XXX.......', 'XXX..XXXXX', 'XXX..XXXXX', 'XXX....XXX', 'XXX....XXX', '.XXXXXXXXX', '..XXXXX.XX'],
  L: ['XXXXX....', 'XXXXX....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX....X', '.XXX...XX', 'XXXXXXXXX', 'XXXXXXXXX'],
  U: ['XXXXX.XXXXX', 'XXXXX.XXXXX', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXXX.XXXX.', '..XXXXXXX..', '...XXXXX...'],
};
const GH = 12;
const LRAMP = ['#ffffff', '#fff6e6', '#ffe8cc', '#f6c294', '#f0aa8e', '#e89a88', '#d8828a', '#c87488', '#b0648e', '#985a92', '#7c4e8e', '#62458a'];
const OUTLINE = '#100c22', SHADE = '#3a2a62';

const words = new Map();
export function wordmark(text = 'STERNENGLUT') {
  if (words.has(text)) return words.get(text);
  const gap = 2, padX = 4, padTop = 3, padBottom = 9;
  const glyphs = [...text].map((ch) => GLYPHS[ch] ?? GLYPHS.E);
  const W = glyphs.reduce((s, g) => s + g[0].length, 0) + gap * (glyphs.length - 1) + padX * 2, H = GH + padTop + padBottom;
  const mask = new Uint8Array(W * H);
  let x0 = padX;
  for (const g of glyphs) {
    for (let y = 0; y < GH; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === 'X') mask[(padTop + y) * W + x0 + x] = 1;
    x0 += g[0].length + gap;
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  // harter Schlagschatten nach unten rechts, dann Kontur
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!at(x, y) && (at(x - 1, y - 2) || at(x, y - 2))) px(x, y, SHADE);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y)) continue;
    if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1)) px(x, y, OUTLINE);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    const row = y - padTop;
    let col = LRAMP[Math.max(0, Math.min(LRAMP.length - 1, row))];
    if (!at(x, y - 1)) col = '#ffffff';
    else if (!at(x - 1, y) && row < 8) col = LRAMP[Math.max(0, row - 4)];
    else if (!at(x + 1, y) || !at(x, y + 1)) col = '#4a3a7a';
    else if (hash2(x, y, 4) < 0.05 && row > 3 && row < 10) col = '#b8f2ff'; // Sternenstaub im Stein
    px(x, y, col);
  }
  // Zierlinie mit Stern
  const ly = H - 4, cx = Math.floor(W / 2);
  for (let x = padX + 4; x < W - padX - 4; x++) {
    const d = Math.abs(x - cx);
    if (d < 6) continue;
    px(x, ly, d < W / 4 ? '#f6c294' : '#c87488');
    px(x, ly + 1, OUTLINE);
  }
  for (let i = -3; i <= 3; i++) { px(cx + i, ly, Math.abs(i) < 2 ? '#ffffff' : '#b8f2ff'); px(cx, ly + i, Math.abs(i) < 2 ? '#ffffff' : '#b8f2ff'); }
  px(cx - 1, ly - 1, '#5ccbea'); px(cx + 1, ly + 1, '#5ccbea'); px(cx + 1, ly - 1, '#5ccbea'); px(cx - 1, ly + 1, '#5ccbea');
  words.set(text, c);
  return c;
}
