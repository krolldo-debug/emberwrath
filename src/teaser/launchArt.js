import { hash2 } from '../core/math.js';
import { DAWN, Buf, sky, island, tree, star, step, fbm, vn, bay, ramp } from './art.js';

// Bild für die Ankündigung „Sternenglut ist da“ (launch.js): der Himmel über der Glutöde reißt auf, dahinter der
// Morgenschimmer der Sternenglut mit Sternhafen. Wie art.js prozedural im Weltraster (R Bildpunkte je Weltpixel),
// harte Kanten, Dither nur auf Weltpixeln.

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
