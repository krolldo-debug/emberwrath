import { GROUND_STEPPE, bayer, shadeLump } from '../sprites/decor_steppe.js';
import { getMountSprites } from '../sprites/mounts.js';
import { createRng, hash2 } from '../core/math.js';

// Stall der Garderobe (Reiter „Reittiere“, ui/WardrobePanel.js): Bühne und Karten im Stil der Reittier-Parade der
// Startseite (site/tools/parade-boden.mjs). Boden, Hügel und Himmel entstehen zur Laufzeit aus den Spielgrafiken
// der Aschensteppe (Paletten, Grasbüschel, Findlinge), einmal je Sitzung.
//
// Raster: alles wird in Feinpixeln gezeichnet (TEX = 2 je Weltpixel, wie Helden und Reittiere mit res 2) und danach
// ganzzahlig auf Bildschirmpunkte vergrößert. Reiter und Reittier haben damit denselben Maßstab, nichts wird gefiltert.
//   new StableStage()            Bühne: Held reitet auf der Stelle, der Boden zieht in zwei Ebenen darunter durch
//   mountCard(def, owned, dpr)   Karte: Reittier im Stand auf einem Stück Weg, fehlende als Silhouette
export const TEX = 2;
const SKY = ['#07040b', '#0a0610', '#0d0815', '#110a1a', '#150c1e', '#1b1022', '#221424'];
const SIL_FILL = '#1c1426', SIL_RIM = '#43344f';   // Silhouette: dunkle Fläche, eine Stufe hellere harte Kontur
const LAUF = 10, NH = 40, FH = 28, SW = 256, UEBERLAPP = 4;

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = (hx) => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };

// ---------------------------------------------------------------- Boden (wie parade-boden.mjs, Streifen 256 breit)
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
  const stamp = (B, e, fx, fy, map = null, flip = false) => {
    const s = e?.sprite ?? e, cv = s?.canvas;
    if (!cv) return;
    const a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const sx = flip ? cv.width - 1 - x : x, i = (y * cv.width + sx) * 4;
      if (a[i + 3] < 128) continue;
      const c = [a[i], a[i + 1], a[i + 2], 255];
      B.set(fx - s.ax + x, fy - s.ay + y, map ? map(c) : c);
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
  for (let i = 0; i < 5; i++) {
    const x = Math.round((i + 0.3 + rng.next() * 0.4) * SW / 5), behind = i % 3 === 1;
    const cy = behind ? 5 : 12, rx = behind ? 2.2 : rng.range(2.4, 3.4), ry = behind ? 1.4 : 1.8;
    for (let j = -Math.ceil(rx); j <= Math.ceil(rx); j++) if (Math.abs(j) < rx) N.set(x + j + 1, cy + Math.round(ry), DI[0]);
    shadeLump(pc(N), x, cy, rx, ry, SST.slice(2, 7), 3100 + i, { rough: 0.1, flat: 0.2 });
  }
  const FR = [['.L.L.', 'LMLML', 'MMMMM'], ['L..L', 'MLLM', 'MMMM'], ['.L.', 'LML', 'MMM']];
  for (let x = 0; x < SW; x += rng.int(4, 12)) { const gl = FR[rng.int(0, 2)], straw = rng.chance(0.25); glyph(N.set, gl, x, 14 - gl.length + 2 + rng.int(0, 1), { L: straw ? STRAW[4] : GR[4], M: GR[3] }); }
  for (let x = 0; x < SW; x += rng.int(10, 22)) glyph(N.set, FR[2], x, 2, { L: GR[3], M: GR[2] });
  for (let y = 30; y < NH; y++) for (let x = 0; x < SW; x++) {
    const t = (y - 29) / 11, k = 1 - 0.55 * t + (bayer(x, y) - 0.5) * 0.12, q = Math.round(k * 8) / 8, c = N.get(x, y), bg = [10, 5, 16];
    N.set(x, y, [bg[0] + (c[0] - bg[0]) * q, bg[1] + (c[1] - bg[1]) * q, bg[2] + (c[2] - bg[2]) * q, 255]);
  }

  const F = buf(SW, FH);
  const FAR = ['#110d15', '#16121a', '#1b171e', '#211c22', '#272226', '#2e2829'];
  const FAR2 = ['#0f0b13', '#131017', '#18141b', '#1d181f'];
  const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin(2 * Math.PI * k * x / SW + ph), 0);
  const hbAt = (x) => Math.round(9 + wave(x, [[4, 1, 0.4], [2.2, 3, 1.9], [0.9, 7, 0.3]]));
  const hfAt = (x) => Math.round(17 + wave(x, [[3, 2, 2.2], [1.6, 4, 0.7], [0.7, 9, 1.1]]));
  for (let x = 0; x < SW; x++) {
    const hb = hbAt(x), hf = hfAt(x);
    for (let y = Math.max(0, hb); y < FH; y++) F.set(x, y, y === hb ? FAR2[3] : FAR2[y - hb < 4 ? 2 : 1]);
    for (let y = Math.max(0, hf); y < FH; y++) {
      const dy = y - hf;
      F.set(x, y, dy === 0 ? FAR[4] : dy === 1 ? FAR[3] : dy < 5 ? (bayer(x, y) < 0.5 ? FAR[3] : FAR[2]) : dy < 8 ? FAR[2] : FAR[1]);
    }
  }
  if (deko) {
    const farMap = (c) => rgb(FAR[Math.min(5, Math.floor(((0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255) * 9))]);
    const fr = createRng(777);
    for (let i = 0; i < 3; i++) { const x = Math.round((i + 0.5) * SW / 3 + fr.int(-12, 12)); stamp(F, deko.boulders?.[i % 2 ? 1 : 2], x, hfAt(x) + 3, farMap); }
    { const x = Math.round(SW * 0.62); stamp(F, deko.thornShrubs?.[0], x, hfAt(x) + 2, farMap); }
    for (let i = 0; i < 7; i++) { const x = Math.round((i + fr.next()) * SW / 7); stamp(F, deko.steppeGrass?.[i % 3], x, hfAt(x) + 2, farMap); }
  }
  const toCanvas = (B) => { const c = canvas(B.w, B.h); c.getContext('2d').putImageData(new ImageData(B.d, B.w, B.h), 0, 0); return c; };
  strips = { near: toCanvas(N), far: toCanvas(F) };
  return strips;
}

// Himmel: harte Bänder mit einer Zeile Schachbrett-Übergang, wenige feste Sterne
function drawSky(x, w, h, seed = 3) {
  const band = Math.max(2, Math.ceil(h / SKY.length));
  for (let y = 0; y < h; y++) {
    const i = Math.min(SKY.length - 1, Math.floor(y / band));
    x.fillStyle = SKY[i]; x.fillRect(0, y, w, 1);
    if (y % band === band - 1 && i < SKY.length - 1) { x.fillStyle = SKY[i + 1]; for (let px = (y + 1) % 2; px < w; px += 2) x.fillRect(px, y, 1, 1); }
  }
  for (let i = 0; i < Math.round(w * h / 260); i++) {
    const sx = Math.floor(hash2(i, 1, seed) * w), sy = Math.floor(hash2(i, 2, seed) * h * 0.7);
    x.fillStyle = hash2(i, 3, seed) < 0.25 ? '#a898b8' : '#4e4060';
    x.fillRect(sx, sy, 1, 1);
  }
}

// Strip waagerecht gekachelt (Weltpixel), Versatz off
function tileStrip(x, img, y, w, off) {
  const tw = img.width;
  for (let px = -(((Math.round(off) % tw) + tw) % tw); px < w; px += tw) x.drawImage(img, px, y);
}

// Silhouette eines Frames in Feinpixeln: deckend = Füllung, angrenzend = Kontur (4er-Nachbarschaft)
const silCache = new WeakMap();
export function frameSilhouette(frame) {
  if (silCache.has(frame)) return silCache.get(frame);
  const src = frame.canvas, w = src.width + 2, h = src.height + 2;
  const c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 1, 1);
  const img = x.getImageData(0, 0, w, h), d = img.data, on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  const F = rgb(SIL_FILL), R = rgb(SIL_RIM);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    const rim = !on[i] && ((px > 0 && on[i - 1]) || (px < w - 1 && on[i + 1]) || (y > 0 && on[i - w]) || (y < h - 1 && on[i + w]));
    d.set(on[i] ? F : rim ? R : [0, 0, 0, 0], i * 4);
  }
  x.putImageData(img, 0, 0);
  const out = { canvas: c, ax: frame.ax + 1, ay: frame.ay + 1 };
  silCache.set(frame, out);
  return out;
}

// Sichtbare Ausdehnung eines Frames (Weltpixel relativ zum Fußpunkt)
const boundsCache = new WeakMap();
function frameBounds(frame) {
  if (boundsCache.has(frame)) return boundsCache.get(frame);
  const c = frame.canvas, a = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, x1 = -1, y0 = c.height;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
  const r = frame.res ?? TEX, b = { x0: (x0 - frame.ax) / r, x1: (x1 + 1 - frame.ax) / r, top: (y0 - frame.ay) / r };
  boundsCache.set(frame, b);
  return b;
}

// Frame in den Feinpixel-Puffer (1 Weltpixel = TEX Feinpixel), Fußpunkt in Weltpixeln
function blitFrame(x, f, wx, wy) {
  x.drawImage(f.canvas, Math.round(wx * TEX - f.ax), Math.round(wy * TEX - f.ay));
}

// Bildschirmpunkte je Feinpixel: ganzzahlig, nahe am gewünschten CSS-Maßstab (CSS-Pixel je Weltpixel)
export function texScale(cssPerWorld, dpr = globalThis.devicePixelRatio || 1) {
  return Math.max(1, Math.floor((cssPerWorld * dpr) / TEX + 0.001));
}
function present(target, src, k, dpr) {
  if (target.width !== src.width * k || target.height !== src.height * k) { target.width = src.width * k; target.height = src.height * k; }
  target.style.width = `${target.width / dpr}px`; target.style.height = `${target.height / dpr}px`;
  const x = target.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, target.width, target.height);
}

// ---------------------------------------------------------------- Bühne
const SPARK = { fire: ['#ffd27a', '#ff9a2a'], magma: ['#ffd27a', '#ff6a1a'], shadow: ['#c8a0ff', '#8a40e0'], rime: ['#ffffff', '#9ad8ff'], soul: ['#c8ffd8', '#5ae08a'], astral: ['#ffffff', '#a8b8ff'] };
export class StableStage {
  constructor({ w = 72, h = 64, deko = null } = {}) {
    this.w = w; this.h = h; this.deko = deko;
    this.feet = h - 14;
    this.el = canvas(1, 1); this.el.className = 'wd-scene';
    this.buf = canvas(w * TEX, h * TEX);
    this.bx = this.buf.getContext('2d'); this.bx.imageSmoothingEnabled = false;
    this.world = canvas(w, h);                               // Himmel und Boden in Weltpixeln
    this.wx = this.world.getContext('2d'); this.wx.imageSmoothingEnabled = false;
    this.sky = canvas(w, h); drawSky(this.sky.getContext('2d'), w, h);
    this.t = 0; this.scroll = 0; this.anim = null; this.sil = null; this.glow = null;
    this.dust = []; this.sparks = []; this.nextDust = 0; this.nextSpark = 0;
    this.cssPerWorld = 4;
  }
  // anim: Ritt-Animation (läuft auf der Stelle) | sil: Frame als Silhouette (steht still)
  show({ anim = null, sil = null, glow = null } = {}) {
    this.anim = anim; this.sil = sil; this.glow = glow;
    this.t = 0; this.dust = []; this.sparks = [];
    this.draw();
  }
  setScale(cssPerWorld) { if (cssPerWorld !== this.cssPerWorld) { this.cssPerWorld = cssPerWorld; this.draw(); } }
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.anim) {
      this.t += dt; this.scroll += 26 * dt;
      this.nextDust -= dt;
      if (this.nextDust <= 0) { this.nextDust = 0.16 + Math.random() * 0.08; this.dust.push({ x: -6 - Math.random() * 10, y: 0, life: 0, vy: -4 - Math.random() * 3 }); }
      for (const d of this.dust) { d.life += dt; d.x -= 26 * dt * 0.85; d.y += d.vy * dt; }
      this.dust = this.dust.filter((d) => d.life < 0.55);
      if (this.glow) {
        this.nextSpark -= dt;
        if (this.nextSpark <= 0) { this.nextSpark = 0.09 + Math.random() * 0.1; this.sparks.push({ x: -14 + Math.random() * 26, y: -12 - Math.random() * 16, life: 0, vx: -10 - Math.random() * 10, vy: -8 - Math.random() * 8 }); }
        for (const s of this.sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
        this.sparks = this.sparks.filter((s) => s.life < 0.8);
      }
    }
    this.draw();
  }
  draw() {
    const { w, h, wx, bx } = this, s = stableStrips(this.deko);
    const nearY = this.feet - LAUF, farY = nearY + UEBERLAPP - FH;
    wx.drawImage(this.sky, 0, 0);
    tileStrip(wx, s.far, farY, w, this.scroll * 0.4);
    tileStrip(wx, s.near, nearY, w, this.scroll);
    if (!this.anim) { wx.fillStyle = 'rgba(6, 3, 10, 0.35)'; wx.fillRect(0, 0, w, h); }   // ohne Reittier etwas dunkler
    bx.setTransform(1, 0, 0, 1, 0, 0);
    bx.drawImage(this.world, 0, 0, w * TEX, h * TEX);
    const cx = Math.round(w / 2), fy = this.feet;
    // Schlagschatten: drei harte Zeilen
    const sw = this.anim ? 12 : 10;
    bx.fillStyle = 'rgba(4, 2, 8, 0.45)';
    for (let r = -1; r <= 1; r++) { const hw = Math.round(sw * Math.sqrt(1 - (r / 2) ** 2)); bx.fillRect((cx - hw) * TEX, (fy + r) * TEX, hw * 2 * TEX, TEX); }
    const DUST = ['#8a7f70', '#6f655a', '#574e47'];
    for (const d of this.dust) { const q = d.life / 0.55, sz = q < 0.5 ? 2 : 1; bx.fillStyle = DUST[Math.min(2, Math.floor(q * 3))]; bx.fillRect(Math.round((cx + d.x) * TEX), Math.round((fy - 1 + d.y) * TEX), sz * TEX, sz * TEX); }
    if (this.anim) {
      const fr = this.anim.frames, f = fr[Math.floor(this.t * (this.anim.fps || 10)) % fr.length];
      f.mount ? (blitFrame(bx, f.mount, cx, fy), blitFrame(bx, f.rider, cx + f.ox, fy + f.oy)) : blitFrame(bx, f, cx, fy);
    } else if (this.sil) {
      const sl = frameSilhouette(this.sil);
      bx.drawImage(sl.canvas, Math.round(cx * TEX - sl.ax), Math.round(fy * TEX - sl.ay));
    }
    const pal = SPARK[this.glow];
    if (pal) for (const sp of this.sparks) { bx.fillStyle = sp.life < 0.3 ? pal[0] : pal[1]; if (sp.life < 0.6 || Math.floor(sp.life * 20) % 2) bx.fillRect(Math.round((cx + sp.x) * TEX), Math.round((fy + sp.y) * TEX), TEX, TEX); }
    const dpr = globalThis.devicePixelRatio || 1;
    present(this.el, this.buf, texScale(this.cssPerWorld, dpr), dpr);
  }
}

// ---------------------------------------------------------------- Karte
const CARD_H = 46, CARD_PAD = 5;
const cardCache = new Map();
export function mountCard(def, owned, deko = null) {
  const dpr = globalThis.devicePixelRatio || 1, k = texScale(2, dpr);
  const key = `${def.id}|${owned ? 1 : 0}|${k}|${dpr}`;
  if (cardCache.has(key)) return cloneCanvas(cardCache.get(key));
  const set = getMountSprites(def.id, def, TEX), f = set.stand.frames[0], b = frameBounds(f);
  const w = Math.ceil(b.x1 - b.x0) + CARD_PAD * 2, h = CARD_H, feet = h - 5;
  const s = stableStrips(deko);
  const world = canvas(w, h), x = world.getContext('2d');
  x.imageSmoothingEnabled = false;
  drawSky(x, w, h, def.id.length * 7);
  const nearY = feet - LAUF, off = Math.floor(hash2(def.id.length, def.id.charCodeAt(0), 5) * SW);
  tileStrip(x, s.far, nearY + UEBERLAPP - FH, w, off * 0.4);
  tileStrip(x, s.near, nearY, w, off);
  if (!owned) { x.fillStyle = 'rgba(6, 3, 10, 0.5)'; x.fillRect(0, 0, w, h); }
  const buf = canvas(w * TEX, h * TEX), bx = buf.getContext('2d');
  bx.imageSmoothingEnabled = false;
  bx.drawImage(world, 0, 0, w * TEX, h * TEX);
  const fx = CARD_PAD - b.x0;
  bx.fillStyle = 'rgba(4, 2, 8, 0.45)';
  const sw = Math.round((b.x1 - b.x0) / 3);
  for (let r = -1; r <= 1; r++) { const hw = Math.round(sw * Math.sqrt(1 - (r / 2) ** 2)); bx.fillRect(Math.round((fx + (b.x0 + b.x1) / 2 - hw) * TEX), (feet + r) * TEX, hw * 2 * TEX, TEX); }
  if (owned) blitFrame(bx, f, fx, feet);
  else { const sl = frameSilhouette(f); bx.drawImage(sl.canvas, Math.round(fx * TEX - sl.ax), Math.round(feet * TEX - sl.ay)); }
  const out = canvas(1, 1);
  present(out, buf, k, dpr);
  cardCache.set(key, out);
  return cloneCanvas(out);
}
function cloneCanvas(c) {
  const o = canvas(c.width, c.height);
  o.style.width = c.style.width; o.style.height = c.style.height;
  o.getContext('2d').drawImage(c, 0, 0);
  return o;
}

export function mountStand(def) { return getMountSprites(def.id, def, TEX).stand.frames[0]; }
