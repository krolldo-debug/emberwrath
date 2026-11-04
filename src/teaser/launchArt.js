import { hash2 } from '../core/math.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { R, DAWN, Buf, sky, island, tree, star, step, fbm, vn, bay, ramp } from './art.js';

// Bilder für die Ankündigung „Sternenglut ist da“ (launch.js). Wie art.js prozedural im Weltraster (R Bildpunkte je
// Weltpixel), harte Kanten, Dither nur auf Weltpixeln.

// Glutöde: Nachthimmel aus Rauch und Glut, Aschenboden mit Lavarissen
const EMBER = {
  sky: ramp(['#050308', '#0b0610', '#130912', '#1d0c14', '#2a0f16', '#3c1418', '#561c1a', '#74261a']),
  smoke: ramp(['#1a1016', '#2a1a1e', '#3a2224']),
  ash: ramp(['#080505', '#110a09', '#1a100d', '#251612', '#331d16', '#45261b']),
  lava: ramp(['#4a1006', '#8e220a', '#d24a14', '#ff7e22', '#ffbe52', '#fff0b0']),
  spire: ramp(['#040203', '#0c0607', '#170c0c', '#24120f']),
  lit: ramp(['#1e1222', '#33203a', '#4e2e4e', '#704262', '#985a72', '#c87a7c', '#eaa088']),
};


// ------------------------------------------------------------------------------------------------ A: Der Riss
// Zwei feste Ebenen (Glutöde, Morgenschimmer-Welt dahinter) und je Öffnungsgrad die Maske des Risses. Die Ebenen
// werden einmal gebaut, ein Bild je Öffnungsgrad kostet nur das Mischen.
export function riftScene(w = 440, h = 180, seed = 21) {
  const horizon = Math.round(h * 0.68);
  const cx = Math.round(w * 0.745), top = 3, bot = horizon - 4;

  // Morgenschimmer hinter dem Riss: Himmel, Inseln, Sternhafen mit Stern genau in der Mitte des Risses
  const dawn = new Buf(w, h);
  sky(dawn, seed, { clouds: 0.62 });
  island(dawn, cx - 44, 46, 12, 2, 8, seed + 1, { far: true });
  island(dawn, cx + 50, 34, 10, 2, 7, seed + 2, { far: true });
  const far = island(dawn, cx, 78, 30, 3, 15, seed + 3, { far: true });
  for (let i = -20; i <= 20; i += 5) {
    const x = cx + i, y = far.get(x);
    if (y == null) continue;
    const tall = i === 0 ? 16 : Math.abs(i) === 10 ? 9 : (i & 4) ? 4 : 6;
    for (let j = 0; j < tall; j++) for (let k = -1; k <= 1; k++) dawn.put(x + k, y - j, DAWN.far[j > tall - 2 ? 2 : 1]);
    if (tall > 6) dawn.put(x, y - tall, DAWN.far[3]);
  }
  star(dawn, cx, 78 - 3 - 22, 4);
  const near = island(dawn, cx + 18, 112, 22, 3, 18, seed + 4);
  tree(dawn, cx + 6, (near.get(cx + 6) ?? 112) + 3, 1, seed);
  tree(dawn, cx + 30, (near.get(cx + 30) ?? 112) + 3, 2, seed + 1);

  // Glutöde
  const ember = new Buf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c;
    if (y < horizon) {
      const t = Math.pow(y / horizon, 1.5);
      c = step(EMBER.sky, t, x, y);
      const n = fbm(x / 60, y / 14, seed + 31);
      if (n > 0.6 - bay(x, y) * 0.04) c = step(EMBER.smoke, (n - 0.58) / 0.25 + t * 0.4, x, y);
      if (hash2(x, y, seed + 32) > 0.997 && t < 0.7) c = EMBER.smoke[2];
    } else {
      const d = (y - horizon) / (h - horizon);
      c = step(EMBER.ash, 0.15 + d * 0.55 + (fbm(x / 20, y / 5, seed + 33) - 0.5) * 0.5, x, y);
      if (y === horizon) c = EMBER.ash[3];
      // Lavarisse: schmale Bänder einer Rauschfunktion, unten breiter
      const r = Math.abs(fbm(x / 44, y / (5 + d * 8), seed + 34) - 0.5);
      if (r < 0.007 + d * 0.006) c = EMBER.lava[r < 0.004 ? 3 : 2];
      else if (r < 0.015 + d * 0.01) c = EMBER.lava[d > 0.5 ? 1 : 0];
    }
    ember.put(x, y, c);
  }
  // Glutsäulen aus Obsidian links und rechts am Rand (Rahmen der Bühne)
  const spire = (x0, base, height, wide, s) => {
    for (let y = 0; y < height; y++) {
      const v = y / height, half = Math.max(0, Math.round(wide * (1 - v) + (vn(y / 3, 0, s) - 0.5) * 2));
      for (let i = -half; i <= half; i++) {
        const u = i / Math.max(1, half);
        let c = EMBER.spire[u < -0.3 ? 3 : u < 0.4 ? 2 : 1];
        if (i === -half) c = EMBER.lava[v < 0.6 ? 1 : 0];   // Glutkante zur Lichtseite
        ember.put(x0 + i, base - y, c);
      }
    }
  };
  spire(10, h - 2, 92, 9, seed + 40); spire(26, h - 2, 58, 6, seed + 41); spire(-2, h - 2, 120, 8, seed + 42);
  spire(w - 14, h - 2, 76, 8, seed + 43); spire(w - 2, h - 2, 104, 9, seed + 44);

  // Zickzack-Mittellinie (Knoten alle ~1/9 der Höhe), Breite spindelförmig
  const knots = Array.from({ length: 10 }, (_, i) => (i === 0 || i === 9 ? 0 : (hash2(i, 7, seed) - 0.5) * 18));
  const geo = (y) => {
    const v = (y - top) / (bot - top);
    if (v < 0 || v > 1) return null;
    const f = v * 9, i = Math.min(8, Math.floor(f)), u = f - i;
    const c = cx + (v - 0.5) * 10 + knots[i] + (knots[i + 1] - knots[i]) * u;
    return { v, c, base: Math.pow(Math.sin(Math.PI * v), 0.85) };
  };
  // Nebenrisse: dünne Lichtadern, die vom Rand nach außen laufen
  const veins = Array.from({ length: 9 }, (_, k) => {
    const y0 = Math.round(top + 12 + hash2(k, 11, seed) * (bot - top - 30)), side = k & 1 ? 1 : -1, pts = [];
    let x = 0, y = 0;
    const n = 6 + Math.floor(hash2(k, 12, seed) * 10);
    for (let j = 0; j < n; j++) { x += side; if (hash2(k, j, seed + 13) > 0.55) y += hash2(k, j, seed + 14) > 0.5 ? 1 : -1; pts.push([x, y]); }
    return { y0, side, pts };
  });
  return { w, h, horizon, cx, top, bot, dawn, ember, geo, veins, seed };
}

// Ein Bild des Risses bei Öffnung open (0..1). spark: Phase der fallenden Sternfunken (Ruhe-Animation).
export function riftFrame(s, open, spark = 0) {
  const { w, h, horizon, cx, bot, dawn, ember, geo, veins, seed } = s;
  const b = new Buf(w, h);
  b.d.set(ember.d);
  const maxHalf = w * 0.095 * open;
  const hw = new Float32Array(h), cc = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const g = geo(y);
    if (!g) { hw[y] = -1; continue; }
    hw[y] = maxHalf * g.base * (1 + (vn(y / 7, 3, seed + 51) - 0.5) * 0.45) + (hash2(y, 4, seed) > 0.8 ? 1 : 0);
    cc[y] = g.c;
  }
  // Licht auf dem Boden unter dem Riss und Lichtkegel
  const poolX = cx, poolY = horizon + Math.round((h - horizon) * 0.42), prx = w * 0.24 * open, pry = (h - horizon) * 0.62 * open;
  if (open > 0.05) for (let y = horizon; y < h; y++) for (let x = Math.max(0, Math.floor(poolX - prx)); x < Math.min(w, poolX + prx); x++) {
    const d = Math.hypot((x - poolX) / prx, (y - poolY) / pry);
    if (d >= 1) continue;
    const i = (y * w + x) * 4, lum = (b.d[i] + b.d[i + 1] + b.d[i + 2]) / 765;
    if (b.d[i] > 180 && b.d[i + 2] < 120) continue;   // Lava bleibt Lava
    const t = (1 - d) * 0.75 + lum * 1.4;
    b.put(x, y, step(EMBER.lit, Math.min(1, t), x, y));
  }
  // Lichtkegel vom Riss zum Boden: harte Dither-Streifen
  if (open > 0.15) for (let y = bot - 6; y < poolY; y++) {
    const v = (y - (bot - 6)) / (poolY - bot + 6), half = 6 + v * prx * 0.7;
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const u = Math.abs(x - cx) / half;
      if (bay(x, y) < (1 - u) * 0.45 * open * (1 - v * 0.5)) b.put(x, y, EMBER.lit[u < 0.4 ? 6 : 5]);
    }
  }
  // Riss: innen der Morgenschimmer, Rand weiß → eisblau, außen eine rosige Glutkante
  for (let y = 0; y < h; y++) {
    if (hw[y] < 0.5) continue;
    for (let x = Math.floor(cc[y] - hw[y] - 4); x <= cc[y] + hw[y] + 4; x++) {
      if (x < 0 || x >= w) continue;
      const d = hw[y] - Math.abs(x - cc[y]);
      const i = (y * w + x) * 4;
      if (d >= 2) { b.d[i] = dawn.d[i]; b.d[i + 1] = dawn.d[i + 1]; b.d[i + 2] = dawn.d[i + 2]; }
      else if (d >= 1) b.put(x, y, DAWN.crystal[3]);
      else if (d >= 0) b.put(x, y, DAWN.crystal[4]);
      else if (d >= -1.5) b.put(x, y, DAWN.clouds[2]);
      else if (d >= -3 && bay(x, y) < 0.5) b.put(x, y, DAWN.sky[5]);
    }
  }
  if (open > 0.3) for (const vv of veins) {
    if (hw[vv.y0] < 1) continue;
    const x0 = Math.round(cc[vv.y0] + vv.side * hw[vv.y0]), len = Math.round(vv.pts.length * Math.min(1, (open - 0.3) / 0.5));
    for (let j = 0; j < len; j++) b.put(x0 + vv.pts[j][0], vv.y0 + vv.pts[j][1], j < len * 0.4 ? DAWN.crystal[4] : j < len * 0.75 ? DAWN.crystal[3] : DAWN.clouds[2]);
  }
  // Himmelssplitter, die aus dem Riss brechen und nach außen treiben
  const shards = Math.round(14 * open);
  for (let k = 0; k < shards; k++) {
    const side = k & 1 ? 1 : -1, yy = 10 + hash2(k, 1, seed) * (bot - 20);
    const g = geo(Math.round(yy));
    if (!g) continue;
    const off = (hw[Math.round(yy)] || 0) + 4 + hash2(k, 2, seed) * 26 * open + spark * 1.5;
    const x0 = Math.round(g.c + side * off), y0 = Math.round(yy - spark * (k % 3));
    const r = 1 + Math.floor(hash2(k, 3, seed) * 2.4);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.abs(i) + Math.abs(j) > r) continue;
      b.put(x0 + i, y0 + j, j < 0 || (j === 0 && i * side < 0) ? DAWN.sky[6] : DAWN.sky[4]);
    }
    b.put(x0 - side * (r + 1), y0, DAWN.crystal[3]);
  }
  // fallende Sternfunken im Lichtkegel
  if (open > 0.6) for (let k = 0; k < 16; k++) {
    const x = Math.round(cx + (hash2(k, 5, seed) - 0.5) * prx * 0.9);
    const span = poolY - bot;
    const y = Math.round(bot + ((hash2(k, 6, seed) * span + spark * 9) % span));
    b.put(x, y, DAWN.star[k % 3 === 0 ? 2 : 3]);
    if (k % 3 === 0) { b.put(x, y - 1, DAWN.star[0]); b.put(x, y - 2, DAWN.star[0]); }
  }
  return b.toCanvas();
}

// ------------------------------------------------------------------------------------------------ B: Kundmachung
// Hochformat: Sternhafen auf seiner Insel, der Turm mit dem Stern, davor ein Balkon für die Fürstin.
export function harborPortrait(w = 132, h = 196, seed = 33) {
  const b = new Buf(w, h);
  sky(b, seed, { clouds: 0.58 });
  island(b, w * 0.15, 40, 9, 2, 6, seed + 1, { far: true });
  island(b, w * 0.88, 64, 11, 2, 7, seed + 2, { far: true });
  const g = island(b, w * 0.5, h * 0.74, w * 0.54, 6, 34, seed + 3);
  const ground = (x) => g.get(Math.round(x)) ?? Math.round(h * 0.74);
  const S = DAWN.stone, RF = DAWN.roof, L = DAWN.lantern;
  // Haus: Wand mit Lichtkante links, Fensterreihe, spitzes Dach
  const house = (x0, ww, hh, roofH) => {
    const base = ground(x0 + ww / 2) + 2;
    for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
      let c = S[x === 0 ? 4 : x === ww - 1 ? 1 : y % 6 === 5 ? 1 : 2];
      if (y % 6 >= 2 && y % 6 <= 3 && x % 4 === 2 && x < ww - 1) c = L[(x + y) % 8 === 0 ? 1 : 2];
      b.put(x0 + x, base - y, c);
    }
    for (let j = 0; j < roofH; j++) {
      const half = Math.round((ww / 2 + 1) * (1 - j / roofH));
      for (let i = -half; i <= half; i++) b.put(Math.round(x0 + ww / 2 + i), base - hh - j, RF[i <= -half + 1 ? 4 : i < 0 ? 3 : 1]);
    }
    return base;
  };
  house(10, 18, 18, 9); house(28, 14, 26, 8); house(84, 16, 22, 9); house(100, 20, 14, 8);
  // Turm in der Mitte mit Galerie und Stern
  const tx = Math.round(w * 0.5), tw = 16, tb = ground(tx) + 2, th = 96;
  for (let y = 0; y < th; y++) for (let x = -tw / 2; x < tw / 2; x++) {
    const narrow = y > th - 22 ? 3 : 0;
    if (x < -tw / 2 + narrow || x >= tw / 2 - narrow) continue;
    let c = S[x === -tw / 2 + narrow ? 5 : x >= tw / 2 - narrow - 1 ? 1 : (y % 10 === 9 ? 1 : 3)];
    if (y % 18 >= 6 && y % 18 <= 10 && Math.abs(x + 0.5) < 2) c = L[y % 18 === 6 ? 4 : 2];
    b.put(tx + x, tb - y, c);
  }
  for (let x = -tw / 2 - 3; x < tw / 2 + 3; x++) { b.put(tx + x, tb - th + 30, S[4]); b.put(tx + x, tb - th + 29, S[5]); b.put(tx + x, tb - th + 31, DAWN.keel[2]); }
  for (let j = 0; j < 14; j++) { const half = Math.round(6 * (1 - j / 14)); for (let i = -half; i <= half; i++) b.put(tx + i, tb - th - j, RF[i < 0 ? 4 : 2]); }
  star(b, tx, tb - th - 22, 6);
  // Lichtkranz des Sterns: harte Ringe
  for (let a = 0; a < 64; a++) { const r = 11; b.put(Math.round(tx + Math.cos(a / 10.2) * r), Math.round(tb - th - 22 + Math.sin(a / 10.2) * r), a % 2 ? DAWN.lantern[2] : null); }
  // Balkon vorn (die Fürstin steht darauf)
  const by = ground(tx) + 3;
  for (let x = -26; x <= 26; x++) { b.put(tx + x, by, S[5]); b.put(tx + x, by + 1, S[3]); b.put(tx + x, by + 2, DAWN.keel[1]); if (x % 4 === 0) for (let j = 1; j <= 5; j++) b.put(tx + x, by - j, S[4]); }
  for (let x = -26; x <= 26; x++) b.put(tx + x, by - 6, S[5]);
  return { canvas: b.toCanvas(), w, h, floor: by };
}

// Siegel Sternhafens: blaues Wachs mit goldenem Stern (Weltpixel, d Durchmesser)
export function sealCanvas(d = 30) {
  const b = new Buf(d + 2, d + 2), c = (d + 1) / 2, r = d / 2;
  for (let y = 0; y < d + 2; y++) for (let x = 0; x < d + 2; x++) {
    const a = Math.atan2(y - c, x - c), rr = r - 1 + Math.round(Math.sin(a * 7) * 1.2);
    const dist = Math.hypot(x - c, y - c);
    if (dist > rr + 1) continue;
    let col = dist > rr ? '#0e0b1e' : step(DAWN.roof, 0.75 - (x + y - 2 * c) / (2 * d) - (dist > r - 4 && dist < r - 2 ? 0.25 : 0), x, y);
    if (dist <= r - 3 && dist > r - 4) col = DAWN.lantern[1];
    b.put(x, y, col);
  }
  // achtstrahliger Stern
  const sr = Math.round(r * 0.55), ci = Math.round(c);
  for (let i = -sr; i <= sr; i++) { b.put(ci + i, ci, DAWN.lantern[Math.abs(i) < 2 ? 4 : 2]); b.put(ci, ci + i, DAWN.lantern[Math.abs(i) < 2 ? 4 : 2]); }
  for (let i = 1; i <= Math.round(sr * 0.6); i++) for (const [sx, sy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) b.put(ci + sx * i, ci + sy * i, DAWN.lantern[1]);
  b.put(ci - 1, ci - 1, DAWN.lantern[3]); b.put(ci + 1, ci + 1, DAWN.lantern[3]);
  return b.toCanvas();
}

// Pergament: kleine, kachelbare Fläche (Weltpixel) mit Fasern, als Hintergrundbild mit image-rendering: pixelated
export function vellumTile(n = 48, seed = 3) {
  const P = ramp(['#d9cdd6', '#e3d8de', '#ece3e6', '#f3ece9']);
  const c = makeCanvas(n, n), ctx = c.getContext('2d');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = 0.55 + (vn(x / 7, y / 2.5, seed) - 0.5) * 0.7 + (hash2(x, y, seed) - 0.5) * 0.2;
    const v = step(P, t, x, y);
    ctx.fillStyle = `rgb(${v[0]},${v[1]},${v[2]})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

// ------------------------------------------------------------------------------------------------ C: Schaukasten
// Bühne je Reiter: Morgenschimmer, eine flache Steinplattform auf einer Insel mit drei Sockeln.
export function showStage(w, h, seed, { garden = false, shards = false } = {}) {
  const b = new Buf(w, h);
  sky(b, seed, { clouds: 0.5 });
  island(b, w * 0.12, h * 0.26, 10, 2, 6, seed + 1, { far: true });
  island(b, w * 0.9, h * 0.2, 12, 2, 7, seed + 2, { far: true });
  const groundY = Math.round(h * 0.8);
  const g = island(b, w * 0.5, groundY - 2, w * 0.58, 6, Math.round(h * 0.18), seed + 4);
  if (garden) for (let i = 0; i < (shards ? 5 : 9); i++) { const x = Math.round(w * (0.04 + i * (shards ? 0.095 : 0.115))); tree(b, x, (g.get(x) ?? groundY) + 3, i % 3, seed + i); }
  if (shards) for (let i = 0; i < (garden ? 6 : 12); i++) {
    const x = Math.round(w * (garden ? 0.56 + i * 0.075 : 0.03 + i * 0.085)), y0 = (g.get(x) ?? groundY) + 2, hh = 4 + Math.round(hash2(i, 1, seed) * 12);
    for (let j = 0; j < hh; j++) { const half = Math.max(0, Math.round(2 * (1 - j / hh))); for (let k = -half; k <= half; k++) b.put(x + k, y0 - j, DAWN.crystal[k < 0 ? 3 : k === 0 ? 2 : 1]); }
    b.put(x, y0 - hh, DAWN.crystal[4]);
  }
  return { b, groundY, ground: (x) => g.get(Math.round(x)) ?? groundY };
}

// Steinsockel (für Bosse und Reittiere), Oberkante bei y
export function plinth(b, x, y, half) {
  const S = DAWN.stone;
  for (let j = 0; j < 5; j++) for (let i = -half - (j > 2 ? 1 : 0); i <= half + (j > 2 ? 1 : 0); i++) {
    let c = S[j === 0 ? 5 : j === 1 ? 3 : j === 4 ? 0 : 2];
    if (i === -half - (j > 2 ? 1 : 0) && j > 0) c = S[4];
    if (j === 2 && (i % 6 === 0)) c = S[1];
    b.put(x + i, y + j, c);
  }
  // Leuchtrune vorn
  b.put(x, y + 2, DAWN.crystal[3]); b.put(x - 1, y + 2, DAWN.crystal[2]); b.put(x + 1, y + 2, DAWN.crystal[2]);
}
