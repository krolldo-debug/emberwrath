import { GROUND_STEPPE, bayer, shadeLump } from '../sprites/decor_steppe.js';
import { getMountSprites } from '../sprites/mounts.js';
import { createRng, hash2 } from '../core/math.js';

// Bühne und Karten der Garderobe (ui/WardrobePanel.js) im Stil der Reittier-Parade der Startseite
// (site/tools/parade-boden.mjs): Weg, Wiese, ferne Hügel und Nachthimmel der Aschensteppe, zur Laufzeit gebaut.
//
// Raster: alles entsteht in Feinpixeln (TEX = 2 je Weltpixel, wie Helden und Reittiere mit res 2) – Boden und Himmel
// haben dieselbe Pixeldichte wie die Figuren. Der fertige Puffer wird ganzzahlig auf Bildschirmpunkte vergrößert und
// die Leinwand auf das Bildschirmraster geschoben (snapToDevice), damit kein Bildpunkt verrutscht.
//   new StableStage()          Bühne: Held steht oder reitet auf der Stelle (Boden zieht dann in zwei Ebenen durch)
//   mountCard(def, owned)      Karte: Reittier im Stand auf einem Stück Weg, fehlende als dunkle Silhouette
//   emptyCard()                leere Box (füllt die letzte Reihe)
export const TEX = 2;
export const CARD_W = 60, CARD_H = 46;               // Weltpixel: Drachen (58 breit, 38 hoch) mit Luft zum Rand
const SKY = ['#07040b', '#0a0610', '#0d0815', '#110a1a', '#150c1e', '#1b1022', '#221424'];
const SIL = ['#120c19', '#1a1323', '#241a2f', '#2e2339'], SIL_RIM = '#4a3a58';   // Silhouette: vier dunkle Stufen + Kontur
// Streifen in Feinpixeln: 512 breit, nah 48 hoch (Weg 0–15, Wiese, tiefe Wiese), Lauflinie Zeile 10; fern 56 hoch
const SW = 512, NH = 48, FH = 56, LAUF = 10, UEBERLAPP = 4;

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = (hx) => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
const dprNow = () => globalThis.devicePixelRatio || 1;

// ---------------------------------------------------------------- Boden
let strips = null;
export function stableStrips(deko) {
  if (strips) return strips;
  const GR = GROUND_STEPPE.grass, DI = GROUND_STEPPE.dirt;
  const SST = ['#141217', '#1d1a1e', '#282426', '#35302f', '#453e3a', '#574e47', '#6f655a', '#8a7f70'];
  const STRAW = ['#1c160c', '#2b2212', '#3f3219', '#554422', '#6d592d', '#88713c', '#a68f55'];
  const buf = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (y < 0 || y >= h) return; x = ((x % w) + w) % w; d.set(typeof c === 'string' ? rgb(c) : c, (y * w + x) * 4); };
    const get = (x, y) => { x = ((x % w) + w) % w; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    return { w, h, d, set, get };
  };
  const pc = (B) => ({ px: (x, y, c) => B.set(x, y, c) });
  const stamp = (B, e, fx, fy, map) => {
    const s = e?.sprite ?? e, cv = s?.canvas;
    if (!cv) return;
    const a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (a[i + 3] >= 128) B.set(fx - s.ax + x, fy - s.ay + y, map([a[i], a[i + 1], a[i + 2], 255]));
    }
  };
  const TUFTS = [['.L...L.', 'LML.LM.', 'MMDLMMD', '.SSSSS.'], ['L.L', 'MLM', 'SSS'], ['..L.L..', '.LM.ML.', 'LMMDMMD', 'SSSSSS.'], ['.L..', 'LMLM', 'MDMD', '.SS.']];
  const glyph = (set, g, x0, y0, pal) => g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') set(x0 + i, y0 + j, pal[ch]); }));
  const tile = (fn) => { const t = buf(16, 16); fn(t); return t; };
  const grassTile = (seed, dark = 0) => tile((t) => {
    const rng = createRng(seed), g = (i) => GR[Math.max(0, i - dark)];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, g(2));
    for (let k = 0; k < 2; k++) {
      const cx = rng.int(0, 15), cy = rng.int(2, 13), rx = rng.range(3.5, 6), ry = rng.range(1.6, 2.6), c = k ? g(1) : g(3);
      for (let y = -3; y <= 3; y++) for (let x = -6; x <= 6; x++) {
        const dd = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (dd <= 0.55 || (dd <= 1 && bayer(cx + x, cy + y) < 0.5)) t.set(((cx + x) % 16 + 16) % 16, ((cy + y) % 16 + 16) % 16, c);
      }
    }
    const pal = { L: g(4), M: g(3), D: g(3), S: g(1) };
    for (let k = 0; k < 3; k++) {
      const gl = TUFTS[rng.int(0, TUFTS.length - 1)], y0 = rng.int(1, 15 - gl.length), x0 = rng.int(0, 15), straw = rng.chance(0.3);
      gl.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') t.set((x0 + i) % 16, y0 + j, straw && ch === 'L' ? STRAW[4 - dark] : pal[ch]); }));
    }
  });
  const pathTile = (seed) => tile((t) => {
    const rng = createRng(seed), back = [];
    for (let x = 0; x < 16; x++) back.push(x === 0 || x === 15 ? 3 : 3 + (hash2(x >> 1, 1, seed) < 0.3 ? -1 : 0) + (hash2(x >> 2, 2, seed) < 0.25 ? 1 : 0));
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      let c;
      if (y < back[x]) c = y === 0 ? GR[3] : GR[2];
      else if (y === back[x]) c = DI[1];
      else if (y >= 14) c = y === 14 ? DI[1] : DI[0];
      else if (y >= 7 && y <= 11) c = DI[3];
      else if (y === 6 || y === 12) c = bayer(x, y) < 0.5 ? DI[3] : DI[2];
      else c = DI[2];
      t.set(x, y, c);
    }
    for (const ry of [5, 13]) { let x = rng.int(0, 5); while (x < 16) { const l = rng.int(4, 8); for (let i = 0; i < l && x + i < 16; i++) t.set(x + i, ry, DI[1]); x += l + rng.int(3, 6); } }
    for (let k = 0, n = rng.int(1, 2); k < n; k++) {
      const x = rng.int(0, 14), y = rng.pick([6, 9, 11]) + rng.int(-1, 1);
      t.set(x, y, k === 1 ? SST[5] : DI[5]); t.set(x + 1, y, k === 1 ? SST[4] : DI[4]); t.set(x, y + 1, DI[1]); t.set(x + 1, y + 1, DI[1]);
    }
    { const x = rng.int(0, 10), y = rng.int(8, 10); for (let i = 0, n = rng.int(3, 5); i < n; i++) t.set(x + i, y, DI[4]); }
  });
  const PATH = [11, 23, 37, 41].map(pathTile), GRASS = [3, 17, 29, 43].map((s) => grassTile(s)), DEEP = [5, 19, 31, 47].map((s) => grassTile(s, 1));
  const order = (n, k, seed) => { const o = []; for (let i = 0; i < n; i++) { let v, a = 0; do v = Math.floor(hash2(i, k, seed + 7 * a++) * 4); while ((o.length && v === o[o.length - 1]) || (i === n - 1 && v === o[0])); o.push(v); } return o; };

  const N = buf(SW, NH);
  const lay = (set, y0) => order(SW / 16, y0, 900 + y0).forEach((v, i) => { const t = set[v]; for (let y = 0; y < 16 && y0 + y < NH; y++) for (let x = 0; x < 16; x++) N.set(i * 16 + x, y0 + y, t.get(x, y)); });
  lay(PATH, 0); lay(GRASS, 16); lay(DEEP, 32);
  const rng = createRng(4242);
  for (let i = 0; i < 9; i++) {
    const x = Math.round((i + 0.3 + rng.next() * 0.4) * SW / 9), behind = i % 3 === 1;
    const cy = behind ? 5 : 12, rx = behind ? 2.2 : rng.range(2.4, 3.4), ry = behind ? 1.4 : 1.8;
    for (let j = -Math.ceil(rx); j <= Math.ceil(rx); j++) if (Math.abs(j) < rx) N.set(x + j + 1, cy + Math.round(ry), DI[0]);
    shadeLump(pc(N), x, cy, rx, ry, SST.slice(2, 7), 3100 + i, { rough: 0.1, flat: 0.2 });
  }
  const FR = [['.L.L.', 'LMLML', 'MMMMM'], ['L..L', 'MLLM', 'MMMM'], ['.L.', 'LML', 'MMM']];
  for (let x = 0; x < SW; x += rng.int(4, 12)) { const gl = FR[rng.int(0, 2)], straw = rng.chance(0.25); glyph(N.set, gl, x, 14 - gl.length + 2 + rng.int(0, 1), { L: straw ? STRAW[4] : GR[4], M: GR[3] }); }
  for (let x = 0; x < SW; x += rng.int(10, 22)) glyph(N.set, FR[2], x, 2, { L: GR[3], M: GR[2] });
  // Unterkante zur dunklen Tafel hin abdunkeln: feste Stufen mit geordnetem Raster
  for (let y = 30; y < NH; y++) for (let x = 0; x < SW; x++) {
    const t = (y - 29) / (NH - 29), k = 1 - 0.6 * t + (bayer(x, y) - 0.5) * 0.12, q = Math.round(k * 8) / 8, c = N.get(x, y), bg = [10, 5, 16];
    N.set(x, y, [bg[0] + (c[0] - bg[0]) * q, bg[1] + (c[1] - bg[1]) * q, bg[2] + (c[2] - bg[2]) * q, 255]);
  }

  const F = buf(SW, FH);
  const FAR = ['#110d15', '#16121a', '#1b171e', '#211c22', '#272226', '#2e2829'];
  const FAR2 = ['#0f0b13', '#131017', '#18141b', '#1d181f'];
  const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin(2 * Math.PI * k * x / SW + ph), 0);
  const hbAt = (x) => Math.round(20 + wave(x, [[8, 2, 0.4], [4, 5, 1.9], [1.6, 13, 0.3]]));
  const hfAt = (x) => Math.round(36 + wave(x, [[6, 3, 2.2], [3, 7, 0.7], [1.2, 17, 1.1]]));
  for (let x = 0; x < SW; x++) {
    const hb = hbAt(x), hf = hfAt(x);
    for (let y = Math.max(0, hb); y < FH; y++) F.set(x, y, y === hb ? FAR2[3] : FAR2[y - hb < 6 ? 2 : 1]);
    for (let y = Math.max(0, hf); y < FH; y++) {
      const dy = y - hf;
      F.set(x, y, dy === 0 ? FAR[4] : dy === 1 ? FAR[3] : dy < 7 ? (bayer(x, y) < 0.5 ? FAR[3] : FAR[2]) : dy < 12 ? FAR[2] : FAR[1]);
    }
  }
  if (deko) {
    const farMap = (c) => rgb(FAR[Math.min(5, Math.floor(((0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255) * 9))]);
    const backMap = (c) => rgb(FAR2[(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) > 90 ? 3 : 2]);
    const fr = createRng(777);
    for (let i = 0; i < 6; i++) { const x = Math.round((i + fr.next()) * SW / 6); stamp(F, deko.steppeGrass?.[2], x, hbAt(x) + 2, backMap); }
    for (let i = 0; i < 5; i++) { const x = Math.round((i + 0.5) * SW / 5 + fr.int(-20, 20)); stamp(F, deko.boulders?.[i % 2 ? 1 : 2], x, hfAt(x) + 3, farMap); }
    for (let i = 0; i < 2; i++) { const x = Math.round((i + 0.15) * SW / 2 + fr.int(-10, 10)); stamp(F, deko.thornShrubs?.[0], x, hfAt(x) + 2, farMap); }
    for (let i = 0; i < 12; i++) { const x = Math.round((i + fr.next()) * SW / 12); stamp(F, deko.steppeGrass?.[i % 3], x, hfAt(x) + 2, farMap); }
  }
  const toCanvas = (B) => { const c = canvas(B.w, B.h); c.getContext('2d').putImageData(new ImageData(B.d, B.w, B.h), 0, 0); return c; };
  strips = { near: toCanvas(N), far: toCanvas(F) };
  return strips;
}

// Himmel in Feinpixeln: harte Bänder mit einer Zeile Schachbrett-Übergang, wenige feste Sterne
function drawSky(x, w, h, seed = 3) {
  const band = Math.max(2, Math.ceil(h / SKY.length));
  for (let y = 0; y < h; y++) {
    const i = Math.min(SKY.length - 1, Math.floor(y / band));
    x.fillStyle = SKY[i]; x.fillRect(0, y, w, 1);
    if (y % band === band - 1 && i < SKY.length - 1) { x.fillStyle = SKY[i + 1]; for (let px = (y + 1) % 2; px < w; px += 2) x.fillRect(px, y, 1, 1); }
  }
  for (let i = 0, n = Math.round(w * h / 900); i < n; i++) {
    const sx = Math.floor(hash2(i, 1, seed) * w), sy = Math.floor(hash2(i, 2, seed) * h * 0.6), big = hash2(i, 3, seed) < 0.2;
    x.fillStyle = big ? '#a898b8' : '#4e4060';
    x.fillRect(sx, sy, 1, 1);
    if (big) { x.fillStyle = '#4e4060'; x.fillRect(sx - 1, sy, 1, 1); x.fillRect(sx + 1, sy, 1, 1); x.fillRect(sx, sy - 1, 1, 1); x.fillRect(sx, sy + 1, 1, 1); }
  }
}

// Himmel, ferne Hügel, naher Boden in einen Feinpixel-Puffer; feet = Lauflinie in Feinpixeln
function drawScene(x, w, h, feet, off, seed, deko) {
  const s = stableStrips(deko), nearY = feet - LAUF, farY = nearY + UEBERLAPP - FH;
  drawSky(x, w, h, seed);
  const tile = (img, y, o) => { const tw = img.width; for (let px = -(((Math.round(o) % tw) + tw) % tw); px < w; px += tw) x.drawImage(img, px, y); };
  tile(s.far, farY, off * 0.4);
  tile(s.near, nearY, off);
}

// Harter Schlagschatten unter dem Fußpunkt (Feinpixel)
function shadow(x, cx, fy, hw) {
  x.fillStyle = 'rgba(4, 2, 8, 0.45)';
  for (const [dy, f] of [[-1, 0.8], [0, 1], [1, 0.8]]) { const w = Math.round(hw * f); x.fillRect(cx - w, fy + dy, w * 2, 1); }
}

// Silhouette in Feinpixeln: Helligkeit des Sprites auf vier dunkle Stufen (Flügel, Hals und Beine bleiben lesbar,
// Farben verraten nichts), dazu eine harte Kontur (4er-Nachbarschaft)
const silCache = new WeakMap();
export function frameSilhouette(frame) {
  if (silCache.has(frame)) return silCache.get(frame);
  const src = frame.canvas, w = src.width + 2, h = src.height + 2;
  const c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 1, 1);
  const img = x.getImageData(0, 0, w, h), d = img.data, on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  const T = SIL.map(rgb), R = rgb(SIL_RIM);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px, j = i * 4;
    if (on[i]) {
      const l = (0.3 * d[j] + 0.59 * d[j + 1] + 0.11 * d[j + 2]) / 255;
      d.set(T[l < 0.12 ? 0 : l < 0.3 ? 1 : l < 0.55 ? 2 : 3], j);
    } else {
      const rim = (px > 0 && on[i - 1]) || (px < w - 1 && on[i + 1]) || (y > 0 && on[i - w]) || (y < h - 1 && on[i + w]);
      d.set(rim ? R : [0, 0, 0, 0], j);
    }
  }
  x.putImageData(img, 0, 0);
  const out = { canvas: c, ax: frame.ax + 1, ay: frame.ay + 1 };
  silCache.set(frame, out);
  return out;
}

// Sichtbare Ausdehnung eines Frames (Feinpixel relativ zum Fußpunkt)
const boundsCache = new WeakMap();
function frameBounds(frame) {
  if (boundsCache.has(frame)) return boundsCache.get(frame);
  const c = frame.canvas, a = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, x1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const b = { x0: x0 - frame.ax, x1: x1 + 1 - frame.ax };
  boundsCache.set(frame, b);
  return b;
}

// Frame (res 2 = Feinpixel) mit Fußpunkt in Feinpixeln
const blit = (x, f, tx, ty) => x.drawImage(f.canvas, Math.round(tx - f.ax), Math.round(ty - f.ay));

// Bildschirmpunkte je Feinpixel: ganzzahlig, nahe am gewünschten CSS-Maßstab (CSS-Pixel je Weltpixel)
export function texScale(cssPerWorld, dpr = dprNow()) {
  return Math.max(1, Math.floor((cssPerWorld * dpr) / TEX + 0.001));
}
function present(target, src, k, dpr = dprNow()) {
  if (target.width !== src.width * k || target.height !== src.height * k) { target.width = src.width * k; target.height = src.height * k; }
  target.style.width = `${target.width / dpr}px`; target.style.height = `${target.height / dpr}px`;
  const x = target.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, target.width, target.height);
}

// Elemente auf das Bildschirmraster schieben: Leinwände liegen sonst je nach Fensterbreite auf Bruchteilen eines
// Bildpunkts, und der Browser verteilt die Pixel ungleichmäßig (Reiter wirkt gegen das Reittier versetzt).
export function snapToDevice(els) {
  const dpr = dprNow();
  const list = [...els].filter(Boolean);
  for (const el of list) el.style.transform = '';
  const rects = list.map((el) => el.getBoundingClientRect());
  list.forEach((el, i) => {
    const r = rects[i], fx = r.left * dpr - Math.round(r.left * dpr), fy = r.top * dpr - Math.round(r.top * dpr);
    if (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) el.style.transform = `translate(${-fx / dpr}px, ${-fy / dpr}px)`;
  });
}

// ---------------------------------------------------------------- Bühne
const SPARK = { fire: ['#ffd27a', '#ff9a2a'], magma: ['#ffd27a', '#ff6a1a'], shadow: ['#c8a0ff', '#8a40e0'], rime: ['#ffffff', '#9ad8ff'], soul: ['#c8ffd8', '#5ae08a'], astral: ['#ffffff', '#a8b8ff'] };
const DUST = ['#8a7f70', '#6f655a', '#574e47'];
const RUN = 52;   // Feinpixel/s, mit dem der Boden beim Reiten durchzieht
export class StableStage {
  constructor({ w = 64, h = 60, deko = null } = {}) {
    this.w = w * TEX; this.h = h * TEX; this.deko = deko;
    this.feet = (h - 12) * TEX;
    this.el = canvas(1, 1); this.el.className = 'wd-scene';
    this.buf = canvas(this.w, this.h);
    this.bx = this.buf.getContext('2d'); this.bx.imageSmoothingEnabled = false;
    this.t = 0; this.scroll = 0; this.anim = null; this.sil = null; this.glow = null; this.ride = false;
    this.dust = []; this.sparks = []; this.nextDust = 0; this.nextSpark = 0;
    this.cssPerWorld = 4;
  }
  // anim: Animation am Fußpunkt; ride: Boden zieht durch (Reiten); sil: Frame als Silhouette; glow: Funkenfarbe
  show({ anim = null, sil = null, glow = null, ride = false } = {}) {
    this.anim = anim; this.sil = sil; this.glow = glow; this.ride = ride && !!anim;
    this.t = 0; this.dust = []; this.sparks = [];
    this.draw();
  }
  setScale(cssPerWorld) { if (cssPerWorld !== this.cssPerWorld) { this.cssPerWorld = cssPerWorld; this.draw(); } }
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (this.ride) {
      this.scroll += RUN * dt;
      this.nextDust -= dt;
      if (this.nextDust <= 0) { this.nextDust = 0.12 + Math.random() * 0.08; this.dust.push({ x: -12 - Math.random() * 20, y: 0, life: 0, vy: -8 - Math.random() * 6 }); }
      for (const d of this.dust) { d.life += dt; d.x -= RUN * dt * 0.85; d.y += d.vy * dt; }
      this.dust = this.dust.filter((d) => d.life < 0.55);
      if (this.glow) {
        this.nextSpark -= dt;
        if (this.nextSpark <= 0) { this.nextSpark = 0.07 + Math.random() * 0.08; this.sparks.push({ x: -28 + Math.random() * 52, y: -24 - Math.random() * 32, life: 0, vx: -20 - Math.random() * 20, vy: -16 - Math.random() * 16 }); }
        for (const s of this.sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
        this.sparks = this.sparks.filter((s) => s.life < 0.8);
      }
    }
    this.draw();
  }
  draw() {
    const { w, h, bx } = this, cx = Math.round(w / 2), fy = this.feet;
    drawScene(bx, w, h, fy, this.scroll, 3, this.deko);
    if (!this.anim) { bx.fillStyle = 'rgba(6, 3, 10, 0.35)'; bx.fillRect(0, 0, w, h); }   // ohne Figur etwas dunkler
    shadow(bx, cx, fy, this.ride ? 24 : this.sil ? 22 : 12);
    for (const d of this.dust) { const q = d.life / 0.55, sz = q < 0.5 ? 2 : 1; bx.fillStyle = DUST[Math.min(2, Math.floor(q * 3))]; bx.fillRect(Math.round(cx + d.x), Math.round(fy - 1 + d.y), sz, sz); }
    if (this.anim) {
      const fr = this.anim.frames, f = fr[Math.floor(this.t * (this.anim.fps || 8)) % fr.length];
      if (f.mount) { blit(bx, f.mount, cx, fy); blit(bx, f.rider, cx + f.ox * TEX, fy + f.oy * TEX); } else blit(bx, f, cx, fy);
    } else if (this.sil) {
      blit(bx, frameSilhouette(this.sil), cx, fy);
    }
    const pal = SPARK[this.glow];
    if (pal) for (const sp of this.sparks) { if (sp.life < 0.6 || Math.floor(sp.life * 20) % 2) { bx.fillStyle = sp.life < 0.3 ? pal[0] : pal[1]; bx.fillRect(Math.round(cx + sp.x), Math.round(fy + sp.y), 2, 2); } }
    present(this.el, this.buf, texScale(this.cssPerWorld));
  }
}

// ---------------------------------------------------------------- Karten (alle gleich groß, gleicher Maßstab)
const cardCache = new Map();
// Bildschirmpunkte je Feinpixel für Karten: Standard 2 CSS-Pixel je Weltpixel; das Panel wählt kleiner, wenn sonst
// nicht alle Karten ohne Rollen passen (cardFit)
export const cardScale = () => texScale(2);
export const cardCss = (k, dpr = dprNow()) => ({ w: (CARD_W * TEX * k) / dpr, h: (CARD_H * TEX * k) / dpr });
export function cardFit(n, width, height, gap, border, kMax = cardScale(), dpr = dprNow()) {
  for (let k = kMax; k > 1; k--) {
    const c = cardCss(k, dpr), cw = c.w + border, ch = c.h + border;
    const cols = Math.max(1, Math.floor((width + gap + 0.5) / (cw + gap)));
    if (Math.ceil(n / cols) * (ch + gap) - gap <= height + 0.5) return k;
  }
  return 1;
}
export function mountCard(def, owned, deko = null, k = cardScale()) {
  const dpr = dprNow(), key = `${def.id}|${owned ? 1 : 0}|${k}|${dpr}`;
  if (!cardCache.has(key)) {
    const f = getMountSprites(def.id, def, TEX).stand.frames[0], b = frameBounds(f);
    const w = CARD_W * TEX, h = CARD_H * TEX, feet = h - 8;
    const buf = canvas(w, h), x = buf.getContext('2d');
    x.imageSmoothingEnabled = false;
    drawScene(x, w, h, feet, Math.floor(hash2(def.id.length, def.id.charCodeAt(0), 5) * SW), def.id.charCodeAt(1), deko);
    if (!owned) { x.fillStyle = 'rgba(6, 3, 10, 0.5)'; x.fillRect(0, 0, w, h); }
    const fx = Math.round((w - (b.x1 - b.x0)) / 2 - b.x0);
    shadow(x, Math.round(fx + (b.x0 + b.x1) / 2), feet, Math.round((b.x1 - b.x0) / 3));
    blit(x, owned ? f : frameSilhouette(f), fx, feet);
    const out = canvas(1, 1);
    present(out, buf, k, dpr);
    cardCache.set(key, out);
  }
  return clone(cardCache.get(key));
}
export function emptyCard(k = cardScale()) {
  const out = canvas(CARD_W * TEX * k, CARD_H * TEX * k), dpr = dprNow();
  out.style.width = `${out.width / dpr}px`; out.style.height = `${out.height / dpr}px`;
  return out;
}
function clone(c) {
  const o = canvas(c.width, c.height);
  o.style.width = c.style.width; o.style.height = c.style.height;
  o.getContext('2d').drawImage(c, 0, 0);
  return o;
}

export function mountStand(def) { return getMountSprites(def.id, def, TEX).stand.frames[0]; }
