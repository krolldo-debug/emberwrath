import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT } from './outdoor.js';

// Aschenwald: verbrannter Wald, Asche, Glutreste; Lager der Wächter,
// Banditenlager und das Ufer des versunkenen Tempels.
// Licht von links oben. Alles Leuchtende liegt zusätzlich auf einer Glow-Ebene
// der Größe (W+2)×(H+2) (1 px Versatz wegen des Umriss-Rands).

const ASH = ['#141216', '#1f1c21', '#2c282d', '#3b363a', '#4f494b', '#67605f', '#857d78'];
const CHAR = ['#0a0708', '#130e0f', '#1c1516', '#281e1f', '#352929', '#44363a'];
const BIRCH = ['#231f22', '#433d3e', '#676061', '#8e8683', '#b3aba3', '#d0c8bc'];
const CANVAS = ['#231f1a', '#383127', '#4e4535', '#665b45', '#807257', '#9a8c6c'];
const GREEN = ['#0d1712', '#15261b', '#1f3824', '#2c4c30', '#3e643e', '#5a8250'];
const CRIM = PAL.crimson, GOLD = PAL.gold, EMB = PAL.ember, LEA = PAL.leather, IRON = PAL.steel;
const WOOD = OUT.wood;
const TSTONE = ['#11171b', '#1a2327', '#243034', '#303e41', '#3e4d4e', '#52625f', '#687a73'];
const TEAL = ['#0b2b2c', '#12524e', '#1c8a80', '#38c6b4', '#9ef8e6'];
const ALGAE = ['#142019', '#1d3022', '#2a432b'];
const REED = ['#1a1e12', '#2a3018', '#3e4420', '#56592a', '#72703a'];
const WATER = OUT.water;

// ------------------------------------------------------------ Helfer
// Baut einen Deko-Eintrag. draw(p, g): p = Sprite-Ebene, g = Glow-Ebene (gleiche Koordinaten).
export function mk(W, H, draw, { ax = Math.floor(W / 2), ay = H - 1, box, light, extra } = {}) {
  const gl = new PixelCanvas(W + 2, H + 2);
  gl.ctx.translate(1, 1);
  let used = false;
  const g = {
    px: (x, y, c) => { used = true; gl.px(x, y, c); },
    rect: (x, y, w, h, c) => { used = true; gl.rect(x, y, w, h, c); },
    line: (a, b, c2, d, c) => { used = true; gl.line(a, b, c2, d, c); },
    ellipse: (x, y, rx, ry, c) => { used = true; gl.ellipse(x, y, rx, ry, c); },
    ctx: gl.ctx,
  };
  const sprite = buildFrame(W, H, ax, ay, (p) => draw(p, g));
  const e = { sprite };
  if (used) e.glow = gl.canvas;
  if (box) e.box = box;
  if (light) e.light = light;
  if (extra) Object.assign(e, extra);
  return e;
}

// Polygon füllen (Pixelmitte-Test); col(x, y) liefert Farbe oder null.
export function poly(p, pts, col) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) { const c = typeof col === 'function' ? col(x, y) : col; if (c) p.px(x, y, c); }
    }
  }
}

const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// Aschefleck am Fuß (weich, dunkel)
export function ashPatch(p, cx, cy, rx, ry, seed) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const h = hash2(cx + x, cy + y, seed);
    if (d > 0.6 && h < 0.45) continue;
    p.px(cx + x, cy + y, h < 0.2 ? ASH[3] : h < 0.7 ? ASH[2] : ASH[1]);
  }
}

// ------------------------------------------------------------ Verkohlte Kiefer
function charredPine(seed, H, broken) {
  const rng = createRng(seed);
  const W = 34, cx = 16, bottom = H - 1;
  const topY = broken ? Math.round(H * 0.3) : 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, bottom - 1, 9, 2, seed);
    const tw = (y) => { const k = (y - topY) / (bottom - topY); return 1 + k * 3.2 + (y > bottom - 3 ? (y - (bottom - 3)) * 1.2 : 0); };
    // Äste (hinter dem Stamm beginnen, hängen leicht)
    const branches = [];
    let side = rng.chance(0.5) ? 1 : -1;
    for (let y = topY + 3; y < bottom - 12; y += rng.int(3, 5)) {
      const k = (y - topY) / (bottom - topY);
      const len = Math.round(3 + k * 12 + rng.range(-1.5, 2));
      const droop = rng.range(0.15, 0.55);
      const up = rng.chance(0.2);
      branches.push({ y, side, len, a: up ? -0.5 : droop });
      side = -side;
      if (rng.chance(0.3)) { branches.push({ y: y + 1, side, len: Math.round(len * 0.6), a: droop }); }
    }
    for (const b of branches) {
      const x0 = cx + b.side * 1, y0 = b.y;
      const x1 = x0 + b.side * b.len, y1 = y0 + Math.round(Math.sin(b.a) * b.len * 0.6);
      p.line(x0, y0, x1, y1, CHAR[2]);
      if (b.len > 6) p.line(x0, y0 + 1, x0 + b.side * Math.round(b.len * 0.5), y0 + 1 + Math.round(Math.sin(b.a) * b.len * 0.3), CHAR[1]);
      // Asche auf der Oberseite
      for (let i = 1; i < b.len; i += 2) { const t = i / b.len; if (rng.chance(0.55)) p.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t) - 1, b.side < 0 ? ASH[4] : ASH[3]); }
      // Zweiggabel
      if (b.len > 5 && rng.chance(0.7)) {
        const t = rng.range(0.5, 0.8), fx = Math.round(x0 + (x1 - x0) * t), fy = Math.round(y0 + (y1 - y0) * t);
        p.line(fx, fy, fx + b.side * 2, fy - 2, CHAR[3]);
      }
      // verbrannte Nadelreste
      if (rng.chance(0.15)) { p.ellipse(x1, y1, 2, 1, "#231512"); p.px(x1 - 1, y1 - 1, '#3a2016'); }
      // glimmende Spitze
      if (rng.chance(0.4)) {
        p.px(x1, y1, EMB[3]); g.px(x1, y1, EMB[4]);
        if (rng.chance(0.5)) { p.px(x1 - b.side, y1, EMB[2]); g.px(x1 - b.side, y1, EMB[2]); }
      }
    }
    // Stamm
    for (let y = topY; y <= bottom; y++) {
      const hw = tw(y);
      const xl = Math.round(cx - hw / 2), xr = Math.round(cx + hw / 2);
      for (let x = xl; x <= xr; x++) {
        const rel = xr === xl ? 0 : (x - xl) / (xr - xl);
        let i = rel < 0.25 ? 4 : rel < 0.6 ? 3 : rel < 0.85 ? 2 : 1;
        const h = hash2(x, y, seed + 5);
        if (h < 0.12) i -= 2; else if (h > 0.93) i += 1;
        if (((y + (x * 3)) % 5) === 0 && rel > 0.2) i -= 1; // Borkenschuppen
        p.px(x, y, CHAR[clampI(i, CHAR.length)]);
      }
      if (hash2(0, y, seed + 7) < 0.3 && y > topY + 2) p.px(xl, y, ASH[4]); // Asche auf der Lichtseite
    }
    // Glutrisse im Stamm
    const cracks = rng.int(1, 3);
    for (let c = 0; c < cracks; c++) {
      const y = rng.int(Math.round(bottom - (bottom - topY) * 0.55), bottom - 3);
      const x = cx + rng.int(-1, 1), len = rng.int(2, 4);
      for (let i = 0; i < len; i++) {
        const xx = x + (i % 2 && rng.chance(0.5) ? 1 : 0);
        p.px(xx, y + i, i === 1 ? EMB[3] : EMB[2]);
        g.px(xx, y + i, i === 1 ? EMB[4] : EMB[3]);
      }
    }
    // Wurzeln
    p.line(cx - 2, bottom - 1, cx - 5, bottom, CHAR[3]); p.line(cx + 2, bottom - 1, cx + 5, bottom, CHAR[1]);
    p.px(cx - 4, bottom - 1, ASH[4]);
    if (broken) {
      // gesplitterte Bruchkante mit Glut
      const hw = Math.round(tw(topY) / 2) + 1;
      p.px(cx - hw, topY - 1, CHAR[4]); p.px(cx - hw, topY - 2, CHAR[3]); p.px(cx + 1, topY - 3, CHAR[3]); p.px(cx + 1, topY - 2, CHAR[2]); p.px(cx, topY - 1, CHAR[2]);
      p.px(cx, topY, EMB[3]); p.px(cx - 1, topY, EMB[2]); g.px(cx, topY, EMB[5]); g.px(cx - 1, topY, EMB[3]);
    } else {
      p.px(cx, topY - 1, CHAR[3]);
    }
  }, { ax: cx, box: [-3, -3, 3, 1] });
}

// ------------------------------------------------------------ Tote Birke
function deadBirch(seed, H) {
  const rng = createRng(seed);
  const W = 26, cx = 12, bottom = H - 1, top = 3;
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, bottom - 1, 7, 2, seed);
    const bx = (y) => cx + Math.round(Math.sin(y * 0.09 + seed) * 1.2);
    // Äste (dünn, schräg nach oben)
    for (let i = 0; i < 6; i++) {
      const y = rng.int(top + 2, bottom - 16), s = i % 2 ? 1 : -1, len = rng.int(4, 9);
      const x0 = bx(y) + s, x1 = x0 + s * len, y1 = y - rng.int(3, 7);
      p.line(x0, y, x1, y1, BIRCH[2]);
      p.px(x0, y - 1, BIRCH[3]);
      if (rng.chance(0.6)) p.line(x1, y1, x1 + s * 2, y1 - 3, BIRCH[1]);
      if (rng.chance(0.4)) p.line(Math.round((x0 + x1) / 2), Math.round((y + y1) / 2), Math.round((x0 + x1) / 2) - s, Math.round((y + y1) / 2) - 3, BIRCH[1]);
    }
    for (let y = top; y <= bottom; y++) {
      const x = bx(y), w = y > bottom - 2 ? 4 : y < top + 6 ? 2 : 3;
      const xl = x - (w > 2 ? 1 : 0);
      for (let i = 0; i < w; i++) {
        let c = i === 0 ? BIRCH[4] : i === w - 1 ? BIRCH[1] : BIRCH[3];
        if (i === 0 && hash2(x, y, seed) < 0.3) c = BIRCH[5];
        p.px(xl + i, y, c);
      }
      // Rindenmarken (schwarze Querstriche)
      if (hash2(0, y, seed + 3) < 0.16) { p.px(xl + 1, y, '#161214'); if (w > 2) p.px(xl + 2, y, '#161214'); }
      // verkohlter Fuß (gerastert)
      const k = (y - (bottom - 12)) / 12;
      if (k > 0) for (let i = 0; i < w; i++) {
        const th = ((xl + i) & 1) * 0.5 + (y & 1) * 0.25 + 0.12;
        if (k > th) p.px(xl + i, y, i === 0 ? CHAR[4] : CHAR[2]);
      }
    }
    // abgebrochene Spitze
    p.px(bx(top) - 1, top - 1, BIRCH[3]); p.px(bx(top), top - 2, BIRCH[2]);
    // Glutrest im Fuß
    const gy = bottom - rng.int(3, 6);
    p.px(bx(gy), gy, EMB[2]); g.px(bx(gy), gy, EMB[3]);
    p.line(cx - 1, bottom, cx - 4, bottom, CHAR[3]);
  }, { ax: cx, box: [-2, -3, 2, 1] });
}

// ------------------------------------------------------------ Stümpfe
function stump(v) {
  const rng = createRng(40 + v);
  const W = 20, H = v === 1 ? 16 : 13;
  return mk(W, H, (p, g) => {
    const cx = 10, bottom = H - 1, topY = v === 1 ? 5 : 4, hw = 4;
    ashPatch(p, cx, bottom - 1, 8, 2, 40 + v);
    // Wurzelansätze
    p.line(cx - hw, bottom - 1, cx - hw - 3, bottom, CHAR[3]); p.line(cx - hw, bottom - 2, cx - hw - 2, bottom - 1, CHAR[4]);
    p.line(cx + hw, bottom - 1, cx + hw + 3, bottom, CHAR[1]); p.line(cx + 1, bottom, cx + 2, bottom, CHAR[1]);
    // Körper
    for (let y = topY; y < bottom; y++) for (let x = cx - hw; x <= cx + hw; x++) {
      const rel = (x - (cx - hw)) / (2 * hw);
      let i = rel < 0.2 ? 4 : rel < 0.55 ? 3 : rel < 0.8 ? 2 : 1;
      if (hash2(x, y, v) < 0.12) i--;
      if ((x + y * 2) % 4 === 0 && rel > 0.2) i--;
      p.px(x, y, CHAR[clampI(i, 6)]);
    }
    if (v === 0) {
      // glatter Schnitt mit Jahresringen, Asche am Rand
      p.ellipse(cx, topY, hw, 1.6, WOOD[3]);
      p.ellipse(cx, topY, hw - 1.5, 1, WOOD[2]);
      p.px(cx, topY, WOOD[4]); p.px(cx - 2, topY, WOOD[1]); p.px(cx + 2, topY, WOOD[1]);
      p.px(cx - hw, topY, ASH[5]); p.px(cx - hw + 1, topY - 1, ASH[4]);
      p.rect(cx + 1, topY - 1, 2, 1, CHAR[2]);
    } else if (v === 1) {
      // gesplittert: Zacken
      const tops = [0, -3, -1, -4, -2, 0, -2, -1, 0];
      for (let i = 0; i < 9; i++) for (let y = topY + tops[i]; y < topY + 1; y++) p.px(cx - hw + i, y, CHAR[i < 3 ? 4 : i < 6 ? 3 : 2]);
      p.px(cx - 1, topY - 3, ASH[4]);
      // Glut im Splitterkern
      p.px(cx, topY + 1, EMB[3]); p.px(cx + 1, topY + 2, EMB[2]); g.px(cx, topY + 1, EMB[5]); g.px(cx + 1, topY + 2, EMB[3]);
    } else {
      // ausgehöhlt, glimmt innen
      p.ellipse(cx, topY, hw, 1.6, CHAR[4]);
      p.ellipse(cx, topY, hw - 1.2, 1, '#1a0806');
      p.px(cx - 1, topY, EMB[2]); p.px(cx + 1, topY, EMB[3]); p.px(cx, topY + 1, EMB[1]);
      g.px(cx - 1, topY, EMB[3]); g.px(cx + 1, topY, EMB[4]); g.px(cx, topY, EMB[2]);
      // Riss an der Seite mit Glut
      p.px(cx + 2, topY + 4, EMB[2]); p.px(cx + 2, topY + 5, EMB[3]); g.px(cx + 2, topY + 5, EMB[4]);
      p.px(cx - hw, topY, ASH[5]);
    }
  }, { ax: 10, box: [-4, -3, 4, 1] });
}

// ------------------------------------------------------------ Aschbüsche
function ashBush(v) {
  const rng = createRng(70 + v);
  const W = 20, H = 14;
  return mk(W, H, (p) => {
    const cx = 10, by = H - 1;
    ashPatch(p, cx, by - 1, 8, 2, 70 + v);
    // Zweige vom Fuß aus
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + rng.range(-1.25, 1.25), len = rng.range(5, 10);
      const x1 = cx + Math.cos(a) * len, y1 = by - 1 + Math.sin(a) * len * 0.9;
      p.line(cx + rng.int(-1, 1), by - 1, x1, y1, i % 3 ? CHAR[3] : '#3a2a22');
      if (rng.chance(0.7)) p.line(x1, y1, x1 + Math.cos(a - 0.6) * 2, y1 + Math.sin(a - 0.6) * 2, CHAR[4]);
      if (a < -Math.PI / 2) p.px(x1, y1 - 1, ASH[5]); else if (rng.chance(0.5)) p.px(x1, y1 - 1, ASH[4]);
    }
    // vertrocknete Blätter
    const lc = v === 1 ? ['#4a2f1c', '#6a4424'] : ['#3a3322', '#58502e'];
    for (let i = 0; i < 9; i++) p.px(cx + rng.int(-6, 6), by - rng.int(3, 9), rng.pick(lc));
    // Aschehäubchen oben links
    for (let i = 0; i < 5; i++) p.px(cx + rng.int(-5, 1), by - rng.int(6, 10), ASH[5]);
  }, { ax: 10 });
}

// ------------------------------------------------------------ Dornenranken
function bramble(v) {
  const rng = createRng(90 + v);
  const W = 26, H = 14;
  const V = ['#1c0e12', '#2e161a', '#44222a', '#5e3234'], TH = '#8a5e50';
  return mk(W, H, (p) => {
    const by = H - 1;
    ashPatch(p, 13, by - 1, 11, 2, 90 + v);
    for (let k = 0; k < 6; k++) {
      const x0 = rng.int(2, 22), amp = rng.range(2, 5), ph = rng.range(0, 6), dir = rng.chance(0.5) ? 1 : -1;
      let lx = null, ly = null;
      for (let t = 0; t <= 14; t++) {
        const x = x0 + dir * t * 0.9, y = by - 1 - Math.abs(Math.sin(t * 0.35 + ph)) * amp - (t < 7 ? t * 0.5 : (14 - t) * 0.5);
        if (x < 0 || x >= W) break;
        if (lx !== null) p.line(lx, ly, x, y, V[1 + (k % 3)]);
        if (t % 3 === 1) p.px(x, y - 1, TH);
        if (t % 4 === 3) p.px(x + dir, y + 1, V[3]);
        lx = x; ly = y;
      }
    }
    // Lichtkante und Beeren
    for (let i = 0; i < 6; i++) p.px(rng.int(3, 22), rng.int(3, 8), V[3]);
    for (let i = 0; i < 3; i++) { const x = rng.int(4, 21), y = rng.int(5, 10); p.px(x, y, '#3a1030'); p.px(x, y - 1, '#6a2450'); }
  }, { ax: 13, box: [-9, -3, 9, 1] });
}

// ------------------------------------------------------------ Aschbedeckte Felsen
function ashRock(v) {
  const rng = createRng(110 + v);
  const R = OUT.rock;
  const w = [14, 18, 11][v], h = [10, 12, 8][v];
  return mk(w + 4, h + 3, (p) => {
    const cx = (w + 3) / 2, cy = h / 2 + 1.5;
    p.ellipse(cx, cy, w / 2, h / 2, R[2]);
    p.ellipse(cx - 1, cy - 1, w / 2 - 2, h / 2 - 2, R[3]);
    p.ellipse(cx - 2, cy - 1.5, w / 4, h / 4, R[4]);
    // Kante/Riss
    p.line(cx + 1, cy - h / 2 + 2, cx + 3, cy + 1, R[1]);
    p.rect(cx - w / 2 + 1, h, w - 1, 1, R[1]);
    // Asche auf den Oberseiten
    for (let x = Math.round(cx - w / 2); x <= Math.round(cx + w / 2); x++) {
      const t = 1 - ((x - cx) / (w / 2)) ** 2;
      if (t <= 0) continue;
      const yt = Math.round(cy - (h / 2) * Math.sqrt(t));
      const depth = x < cx + 2 ? 2 : 1;
      for (let d = 0; d < depth; d++) if (hash2(x, d, 110 + v) < 0.85) p.px(x, yt + d, d === 0 ? ASH[6] : ASH[5]);
    }
    for (let i = 0; i < 4; i++) p.px(cx + rng.int(-w / 3, w / 4), cy + rng.int(-1, 2), ASH[4]);
    ashPatch(p, Math.round(cx), h + 1, Math.round(w / 2) + 1, 1, v);
  }, { ax: Math.floor((w + 4) / 2), ay: h + 1, box: [-Math.floor(w / 2) + 1, -3, Math.floor(w / 2) - 1, 1] });
}

// ------------------------------------------------------------ Zelte
// 3/4-Satteldach-Zelt: Giebeldreieck vorn, Dachflächen reichen nach hinten.
export function drawTent(p, g, o) {
  const { W, H, pal, band, ragged, seed } = o;
  const rng = createRng(seed);
  const cx = Math.floor(W / 2), bottom = H - 2, depth = 7;
  const apexY = 4, x0 = 3, x1 = W - 4;
  const hem = (x) => (ragged ? (hash2(x, 0, seed) < 0.35 ? 1 : 0) + (hash2(x, 1, seed) < 0.12 ? 1 : 0) : 0);
  // Heringe + Seile
  p.line(x0 - 1, bottom - depth + 1, 0, bottom - depth + 4, CANVAS[2]); p.line(x1 + 1, bottom - depth + 1, W - 1, bottom - depth + 4, CANVAS[1]);
  // linke Dachfläche (beleuchtet)
  poly(p, [[cx, apexY], [cx, apexY + depth], [x0, bottom + 1], [x0, bottom - depth + 1]], (x, y) => {
    let i = 4; if ((x + y) % 5 === 0) i = 3; if (x < x0 + 2) i = 3;
    if (y > bottom - hem(x) - 0) return null;
    return pal[i];
  });
  // rechte Dachfläche (Schatten)
  poly(p, [[cx + 1, apexY], [cx + 1, apexY + depth], [x1 + 1, bottom + 1], [x1 + 1, bottom - depth + 1]], (x, y) => {
    let i = 1; if ((x - y) % 6 === 0) i = 0; if (x > x1 - 1) i = 0;
    if (y > bottom - hem(x)) return null;
    return pal[i];
  });
  // Firststange
  p.line(cx, apexY - 1, cx, apexY + depth, WOOD[3]);
  // vordere Giebelwand
  const gy = apexY + depth;
  poly(p, [[cx + 0.5, gy - 0.5], [x0 + 3, bottom + 1], [x1 - 2, bottom + 1]], (x, y) => {
    if (y > bottom - hem(x + 3)) return null;
    const i = x < cx - 4 ? 3 : x > cx + 3 ? 1 : 2;
    return (x - cx) % 4 === 0 ? pal[Math.max(0, i - 1)] : pal[i];
  });
  // Eingang: dunkles Dreieck, linke Klappe zurückgeschlagen
  poly(p, [[cx + 0.5, gy + 3], [cx - 3, bottom + 1], [cx + 5, bottom + 1]], '#0b080a');
  poly(p, [[cx, gy + 4], [cx - 4, bottom + 1], [cx - 1, bottom + 1]], pal[4]);
  p.line(cx, gy + 4, cx - 2, bottom, pal[5]);
  // Knoten/Schlaufe
  p.px(cx - 3, bottom - 4, band[3]);
  // Saum/Band
  if (band) {
    for (let x = x0; x <= x1; x++) {
      const y = bottom - hem(x) - 1;
      if (x > cx - 4 && x < cx + 6) continue;
      p.px(x, y, band[x < cx ? 3 : 1]);
      if (!ragged) p.px(x, y - 1, band[x < cx ? 2 : 0]);
    }
  }
  // Flicken (zerlumpt)
  if (ragged) {
    for (let i = 0; i < 4; i++) {
      const px = rng.int(x0 + 3, x1 - 5), py = rng.int(gy + 2, bottom - 5);
      const pc = rng.pick([CANVAS[2], LEA[2], CANVAS[3]]);
      if (px > cx - 4 && px < cx + 5) continue;
      p.rect(px, py, 3, 3, pc); p.px(px, py, CANVAS[4]); p.px(px + 2, py + 2, '#0b080a');
    }
    // Riss
    p.line(x1 - 4, gy + 6, x1 - 6, gy + 9, '#0b080a');
    // gemaltes Zeichen (Klaue) links
    p.line(cx - 8, gy + 4, cx - 10, gy + 9, '#120808'); p.line(cx - 6, gy + 5, cx - 8, gy + 10, '#120808');
  }
}

function tentGuard() {
  const W = 38, H = 30;
  return mk(W, H, (p, g) => {
    ashPatch(p, 19, H - 2, 17, 2, 3);
    drawTent(p, g, { W, H, pal: CANVAS, band: GREEN, ragged: false, seed: 5 });
    // Firstwimpel
    const cx = 19;
    p.line(cx, 0, cx, 4, WOOD[3]); p.px(cx, 0, GOLD[3]);
    p.rect(cx + 1, 1, 4, 2, GREEN[3]); p.px(cx + 5, 1, GREEN[3]); p.rect(cx + 1, 2, 4, 1, GREEN[2]); p.px(cx + 1, 1, GREEN[5]);
    // Schild und Speer am Eingang
    p.ellipse(cx + 12, H - 7, 3, 3.5, GREEN[2]); p.ellipse(cx + 11, H - 8, 2, 2.5, GREEN[3]); p.px(cx + 12, H - 7, GOLD[3]); p.px(cx + 11, H - 9, GOLD[4]);
  }, { ax: 19, box: [-14, -7, 14, 1] });
}

function tentBandit() {
  const W = 38, H = 30;
  const RAG = ['#1e0a0e', '#35121a', '#561c24', '#7a2a2e', '#9a3a38', '#b25448'];
  return mk(W, H, (p) => {
    ashPatch(p, 19, H - 2, 17, 2, 4);
    drawTent(p, null, { W, H, pal: RAG, band: CANVAS, ragged: true, seed: 11 });
    // schief eingeschlagene Stange mit Fetzen und Schädel
    p.line(20, 0, 19, 5, WOOD[2]);
    p.rect(21, 1, 3, 1, RAG[3]); p.px(24, 2, RAG[2]); p.px(22, 2, RAG[2]);
    p.rect(18, -0, 3, 2, PAL.bone[3]); p.px(18, 1, '#140808');
  }, { ax: 19, box: [-14, -7, 14, 1] });
}

// ------------------------------------------------------------ Palisade
function palLog(p, x, yTop, yBot, seed) {
  // 3 px breiter Stamm mit Spitze
  for (let y = yTop + 2; y <= yBot; y++) {
    p.px(x, y, WOOD[4]); p.px(x + 1, y, hash2(x, y, seed) < 0.15 ? WOOD[1] : WOOD[3]); p.px(x + 2, y, WOOD[1]);
  }
  p.px(x + 1, yTop, WOOD[4]); p.px(x, yTop + 1, WOOD[4]); p.px(x + 1, yTop + 1, WOOD[3]); p.px(x + 2, yTop + 1, WOOD[2]);
  // Brandspuren an der Spitze
  if (hash2(x, yTop, seed) < 0.4) { p.px(x + 1, yTop, CHAR[4]); p.px(x + 2, yTop + 1, CHAR[2]); }
}

function palisadeH() {
  const W = 16, H = 26;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    for (let i = 0; i < 4; i++) {
      const x = i * 4, top = [1, 3, 0, 2][i];
      palLog(p, x, top, bottom, 7);
      p.px(x + 3, bottom - 2, '#0c0808');
    }
    // Querriegel mit Seilbund
    for (const y of [7, 17]) { p.rect(0, y, 16, 2, WOOD[2]); p.rect(0, y, 16, 1, WOOD[4]); for (let x = 1; x < 16; x += 4) { p.px(x, y, CANVAS[4]); p.px(x, y + 1, CANVAS[2]); } }
    // Asche am Fuß
    for (let x = 0; x < 16; x++) if (hash2(x, 3, 9) < 0.6) p.px(x, bottom, ASH[hash2(x, 4, 9) < 0.5 ? 3 : 4]);
  }, { ax: 8, box: [-8, -3, 8, 1] });
}

function palisadeV() {
  const W = 8, H = 40;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    // Stämme von hinten nach vorn; jeder steht 24 px hoch
    for (let k = 0; k < 5; k++) {
      const gy = bottom - 16 + k * 4, top = gy - 24 + [1, 0, 2, 0, 1][k];
      palLog(p, 2, top, gy, 13 + k);
      p.px(1, top + 3, WOOD[3]);
      p.px(5, top + 3, WOOD[0]);
    }
    // Riegel (seitlich sichtbar als Balkenstreifen)
    for (let y = bottom - 30; y <= bottom - 2; y += 1) if ((y % 10) === 0) { p.rect(1, y, 6, 2, WOOD[2]); p.px(1, y, WOOD[4]); }
    for (let y = bottom - 2; y <= bottom; y++) p.rect(1, y, 6, 1, ASH[3]);
  }, { ax: 4, box: [-3, -16, 3, 1] });
}

// ------------------------------------------------------------ Wachturm
function watchtower() {
  const W = 44, H = 68;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 22;
    const platY = 26;
    ashPatch(p, cx, bottom - 1, 18, 3, 21);
    // hintere Beine
    for (const x of [12, 31]) { p.rect(x, platY, 2, bottom - 5 - platY, WOOD[1]); }
    // Streben hinten
    p.line(13, platY + 4, 31, bottom - 8, WOOD[0]); p.line(31, platY + 4, 13, bottom - 8, WOOD[0]);
    // vordere Beine (leicht gespreizt)
    const leg = (xa, xb) => { for (let y = platY; y <= bottom; y++) { const t = (y - platY) / (bottom - platY); const x = Math.round(xa + (xb - xa) * t); p.px(x, y, WOOD[4]); p.px(x + 1, y, WOOD[3]); p.px(x + 2, y, WOOD[1]); } };
    leg(8, 6); leg(33, 35);
    // Kreuzstreben vorn (zwei Felder)
    p.line(10, platY + 3, 33, platY + 19, WOOD[3]); p.line(10, platY + 4, 33, platY + 20, WOOD[1]);
    p.line(33, platY + 3, 10, platY + 19, WOOD[2]);
    p.rect(8, platY + 20, 27, 2, WOOD[2]); p.rect(8, platY + 20, 27, 1, WOOD[4]);
    p.line(9, platY + 22, 34, bottom - 2, WOOD[2]); p.line(34, platY + 22, 8, bottom - 2, WOOD[1]);
    // Leiter
    for (let y = platY; y <= bottom; y++) { p.px(19, y, WOOD[4]); p.px(24, y, WOOD[2]); }
    for (let y = platY + 3; y < bottom; y += 4) { p.rect(20, y, 4, 1, WOOD[3]); p.px(20, y + 1, WOOD[1]); }
    // Plattform (Bohlen, 3/4: Oberseite sichtbar)
    p.rect(3, platY - 3, 38, 4, WOOD[2]);
    for (let x = 3; x < 41; x += 3) p.px(x, platY - 3, WOOD[1]);
    p.rect(3, platY - 3, 38, 1, WOOD[4]); p.rect(3, platY + 1, 38, 1, WOOD[0]);
    for (let x = 5; x < 41; x += 6) p.px(x, platY - 1, WOOD[1]);
    // Brüstung: Pfosten + Geländer + Planken
    p.rect(3, platY - 12, 38, 9, WOOD[2]);
    for (let x = 3; x < 41; x++) { const pl = Math.floor((x - 3) / 4); if ((x - 3) % 4 === 0) for (let y = platY - 12; y < platY - 3; y++) p.px(x, y, WOOD[1]); else if ((x - 3) % 4 === 1) for (let y = platY - 12; y < platY - 3; y++) p.px(x, y, pl % 2 ? WOOD[3] : WOOD[4]); }
    p.rect(2, platY - 13, 40, 2, WOOD[4]); p.rect(2, platY - 11, 40, 1, WOOD[1]);
    // grünes Banner an der Brüstung
    p.rect(14, platY - 12, 8, 13, GREEN[3]); p.rect(14, platY - 12, 2, 13, GREEN[4]); p.rect(21, platY - 12, 1, 13, GREEN[1]);
    p.px(14, platY + 1, GREEN[3]); p.px(16, platY + 2, GREEN[2]); p.px(18, platY + 1, GREEN[3]); p.px(20, platY + 2, GREEN[2]);
    p.line(16, platY - 9, 19, platY - 6, GOLD[3]); p.line(19, platY - 9, 16, platY - 6, GOLD[2]); p.px(17, platY - 8, GOLD[4]);
    // Eckpfosten tragen das Dach
    for (const x of [4, 38]) { p.rect(x, 12, 2, platY - 24, WOOD[3]); p.px(x, 12, WOOD[4]); }
    // Dach: Schindelpyramide
    for (let y = 1; y <= 13; y++) {
      const k = (y - 1) / 12, hw = 4 + k * 19;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - cx) / hw;
        const row = Math.floor(y / 3);
        let i = rel < -0.3 ? 4 : rel < 0.35 ? 3 : 2;
        if (y % 3 === 0) i -= 1; else if ((x + row * 2) % 5 === 0) i -= 1;
        if (hash2(x, y, 23) < 0.1) i -= 1;
        p.px(x, y, OUT.slate[clampI(i, 5)]);
      }
    }
    p.rect(cx - 21, 13, 43, 1, OUT.slate[0]);
    p.rect(cx - 2, 0, 5, 1, OUT.slate[3]); p.px(cx, -1 + 1, WOOD[4]);
    // Asche auf dem Dach
    for (let i = 0; i < 14; i++) { const y = 3 + (i % 10), x = cx - 3 - Math.round((y / 13) * 16) + (i * 7) % 9; p.px(x, y, ASH[5]); }
    // Laterne unter dem Dach
    const lx = 35, ly = 15;
    p.line(lx + 1, 13, lx + 1, ly - 1, IRON[2]);
    p.rect(lx - 1, ly, 5, 1, IRON[2]); p.rect(lx, ly + 1, 3, 4, '#3a2410'); p.px(lx, ly + 1, EMB[3]); p.px(lx + 1, ly + 2, EMB[5]); p.px(lx + 2, ly + 3, EMB[3]); p.rect(lx - 1, ly + 5, 5, 1, IRON[1]);
    g.rect(lx, ly + 1, 3, 4, EMB[4]); g.px(lx + 1, ly + 2, EMB[5]);
  }, { ax: 22, box: [-15, -6, 15, 1], light: { dx: 14, dy: -50, radius: 70, color: [255, 170, 90], intensity: 0.8 } });
}

// ------------------------------------------------------------ Bannerstange (Wächter)
function bannerPole() {
  const W = 18, H = 42;
  return mk(W, H, (p) => {
    const bottom = H - 1, px0 = 3;
    // Steinfuß
    p.ellipse(px0 + 1, bottom - 1, 4, 1.6, PAL.stone[2]); p.ellipse(px0, bottom - 2, 3, 1.2, PAL.stone[3]); p.px(px0 - 1, bottom - 2, PAL.stone[4]);
    // Stange
    p.rect(px0, 3, 2, bottom - 4, WOOD[3]); p.rect(px0, 3, 1, bottom - 4, WOOD[4]);
    // Spitze
    p.px(px0, 0, GOLD[4]); p.rect(px0, 1, 2, 2, GOLD[3]); p.px(px0 + 1, 2, GOLD[1]);
    // Querholz
    p.rect(px0, 5, 13, 2, WOOD[3]); p.rect(px0, 5, 13, 1, WOOD[4]); p.px(px0 + 13, 5, GOLD[3]);
    // Banner mit Falten und Schwalbenschwanz
    const bx0 = px0 + 2, bx1 = px0 + 12, by0 = 7, by1 = 30;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.9);
      const low = by1 + Math.round(fold) - (Math.abs(x - (bx0 + bx1) / 2) < 2 ? 4 : 0) + (x - bx0 < 2 ? 1 : 0);
      for (let y = by0; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 4;
        if (y === by0) i = 1;
        p.px(x, y, GREEN[i]);
      }
      p.px(x, low, GOLD[x % 2 ? 2 : 3]);
    }
    // Emblem: goldener Pfeil über Eichenblatt
    const ex = Math.round((bx0 + bx1) / 2), ey = 17;
    p.line(ex, ey - 6, ex, ey + 5, GOLD[3]); p.px(ex - 1, ey - 5, GOLD[3]); p.px(ex + 1, ey - 5, GOLD[2]); p.px(ex, ey - 7, GOLD[4]);
    p.px(ex - 2, ey + 1, GOLD[3]); p.px(ex + 2, ey + 1, GOLD[2]); p.px(ex - 2, ey - 1, GOLD[2]); p.px(ex + 2, ey - 1, GOLD[2]);
    p.px(ex - 1, ey + 4, GOLD[2]); p.px(ex + 1, ey + 4, GOLD[2]);
  }, { ax: 4, box: [-2, -2, 2, 1] });
}

// ------------------------------------------------------------ Großes Lagerfeuer
function campfireBig() {
  const W = 34, H = 28;
  const S = PAL.stone;
  return mk(W, H, (p, g) => {
    const cx = 17, cy = H - 6;
    ashPatch(p, cx, cy + 1, 15, 4, 31);
    // Glutbett
    p.ellipse(cx, cy, 8, 3, '#1a0806');
    for (let i = 0; i < 26; i++) {
      const x = cx + Math.round(Math.cos(i * 2.4) * (i % 7)), y = cy + Math.round(Math.sin(i * 2.4) * (i % 7) * 0.35);
      const c = i % 3 === 0 ? EMB[3] : i % 3 === 1 ? EMB[2] : EMB[1];
      p.px(x, y, c); g.px(x, y, i % 3 === 0 ? EMB[4] : EMB[2]);
    }
    // Spieß (hinter dem Feuer): Astgabeln + Stab + Braten
    const sy = cy - 9;
    p.line(3, sy, 4, cy + 2, WOOD[3]); p.px(2, sy - 1, WOOD[3]); p.px(5, sy - 1, WOOD[3]);
    p.line(30, sy, 29, cy + 2, WOOD[2]); p.px(28, sy - 1, WOOD[2]); p.px(31, sy - 1, WOOD[2]);
    p.line(3, sy, 30, sy, IRON[2]); p.px(31, sy, IRON[3]);
    p.ellipse(8, sy, 3, 2, '#5a2a18'); p.px(6, sy - 1, '#8a4a2a'); p.px(7, sy - 2, '#a86a3a'); p.px(10, sy + 1, '#3a1810');
    // Scheite
    p.line(cx - 8, cy + 2, cx + 5, cy - 3, WOOD[2]); p.line(cx - 8, cy + 1, cx + 5, cy - 4, WOOD[4]);
    p.line(cx + 8, cy + 2, cx - 4, cy - 3, WOOD[1]); p.line(cx + 8, cy + 1, cx - 4, cy - 4, WOOD[3]);
    p.px(cx - 8, cy + 1, WOOD[4]); p.px(cx + 8, cy + 1, CHAR[3]);
    // Flammenzungen
    const fl = [[cx - 2, cy - 3, 4], [cx, cy - 4, 6], [cx + 2, cy - 3, 3]];
    for (const [x, y, h] of fl) for (let i = 0; i < h; i++) {
      const c = i === 0 ? EMB[4] : i < h - 2 ? EMB[3] : EMB[2];
      p.px(x + (i % 3 === 2 ? 1 : 0), y - i, c); g.px(x + (i % 3 === 2 ? 1 : 0), y - i, i < 2 ? EMB[5] : EMB[4]);
    }
    // Dreibein + Kessel
    p.line(cx - 7, cy + 1, cx, 2, WOOD[4]); p.line(cx + 7, cy + 1, cx + 1, 2, WOOD[2]); p.line(cx, 1, cx, 2, WOOD[3]);
    p.line(cx, 3, cx, 8, IRON[2]);
    p.rect(cx - 4, 9, 9, 1, IRON[3]); p.ellipse(cx, 12, 4, 3, IRON[1]); p.rect(cx - 3, 10, 3, 2, IRON[2]); p.px(cx - 3, 10, IRON[4]);
    p.rect(cx - 3, 9, 7, 1, '#3a4a2a'); p.px(cx + 1, 9, '#5a6a3a');
    // Steinring (vorn über allem)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(a) * 10, y = cy + Math.sin(a) * 3.8;
      if (Math.sin(a) < -0.2) continue;
      p.ellipse(x, y, 2, 1.4, S[2]); p.px(x - 1, y - 1, S[4]); p.px(x, y - 1, S[3]);
    }
  }, { ax: 17, ay: H - 3, box: [-9, -4, 9, 2], light: { dx: 0, dy: -8, radius: 110, color: [255, 150, 70], intensity: 1 } });
}

// ------------------------------------------------------------ Holzstapel
function logPile() {
  const W = 28, H = 18;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    ashPatch(p, 14, bottom - 1, 13, 2, 41);
    const logs = [[6, 13], [13, 13], [20, 13], [9.5, 8], [16.5, 8], [13, 3]];
    for (const [x, y] of logs) {
      // Stammseite nach hinten
      p.rect(x - 3, y - 5, 7, 5, WOOD[2]); p.rect(x - 3, y - 5, 7, 1, WOOD[3]); p.rect(x - 3, y - 5, 1, 5, WOOD[3]);
      p.px(x - 1, y - 4, WOOD[1]); p.px(x + 2, y - 3, WOOD[1]);
    }
    for (const [x, y] of logs) {
      // Schnittfläche mit Ringen
      p.ellipse(x, y, 3.4, 3, WOOD[1]);
      p.ellipse(x, y, 2.6, 2.3, '#8a6a44');
      p.ellipse(x, y, 1.6, 1.4, '#a88452');
      p.px(x, y, '#6a4a2c'); p.px(x - 1, y - 2, '#c8a46a');
      p.px(x + 2, y + 1, '#6a4a2c');
    }
    // Axt im oberen Scheit
    p.line(19, 0, 23, 6, WOOD[3]); p.rect(17, 0, 3, 3, IRON[3]); p.px(17, 0, IRON[5]); p.px(18, 2, IRON[2]);
  }, { ax: 14, box: [-11, -4, 11, 1] });
}

// ------------------------------------------------------------ Karren
function cart() {
  const W = 44, H = 30;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    ashPatch(p, 21, bottom - 1, 18, 2, 51);
    // Deichsel nach rechts unten
    p.line(34, 19, 43, 24, WOOD[2]); p.line(34, 20, 43, 25, WOOD[1]); p.line(34, 17, 42, 21, WOOD[3]);
    // hinteres Rad (angedeutet)
    p.ellipse(28, 21, 6, 6.5, WOOD[0]);
    // Ladefläche
    p.rect(4, 12, 31, 8, WOOD[2]);
    for (let x = 4; x < 35; x += 5) p.rect(x, 12, 1, 8, WOOD[1]);
    p.rect(4, 12, 31, 1, WOOD[4]); p.rect(4, 16, 31, 1, WOOD[1]); p.rect(4, 19, 31, 1, WOOD[0]);
    p.rect(4, 12, 1, 8, WOOD[4]);
    // Ladung: Plane über Säcken, Kiste
    p.ellipse(13, 10, 8, 4, CANVAS[3]); p.ellipse(12, 9, 6, 3, CANVAS[4]); p.px(9, 7, CANVAS[5]); p.px(11, 7, CANVAS[5]);
    p.line(8, 12, 18, 12, CANVAS[1]); p.px(13, 6, CANVAS[2]); p.px(14, 7, CANVAS[2]);
    p.rect(21, 5, 10, 7, WOOD[3]); p.rect(21, 5, 10, 1, WOOD[4]); p.rect(21, 5, 1, 7, WOOD[4]); p.rect(30, 6, 1, 6, WOOD[1]); p.rect(21, 8, 10, 1, IRON[1]);
    p.ellipse(18, 9, 3, 3, '#6a5a3a'); p.px(17, 7, '#8a7a52'); p.px(18, 6, '#4a3e28');
    // Seil
    p.line(6, 13, 18, 6, CANVAS[1]);
    // Vorderrad mit Speichen und Eisenreif
    const wx = 14, wy = 21;
    p.ellipse(wx, wy, 7, 7, IRON[1]); p.ellipse(wx, wy, 6, 6, WOOD[2]); p.ellipse(wx, wy, 5, 5, '#0d0a0c');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.line(wx, wy, wx + Math.cos(a) * 5, wy + Math.sin(a) * 5, i < 4 ? WOOD[2] : WOOD[3]); }
    p.ellipse(wx, wy, 1.5, 1.5, WOOD[4]); p.px(wx, wy, IRON[3]);
    for (let i = 0; i < 6; i++) { const a = Math.PI + 0.3 + i * 0.25; p.px(wx + Math.round(Math.cos(a) * 7), wy + Math.round(Math.sin(a) * 7), IRON[3]); }
    p.px(wx - 5, wy - 5, IRON[4]);
  }, { ax: 21, box: [-16, -5, 14, 1] });
}

// ------------------------------------------------------------ Wächter-Totem (Schrein)
function wardTotem(on) {
  const W = 20, H = 38;
  const RUNE_OFF = '#0e0a0a', RUNE_ON = '#d8f0a0';
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 6, x1 = 13;
    // Steinkranz am Fuß
    ashPatch(p, 10, bottom - 1, 8, 2, 61);
    for (const [x, y] of [[4, bottom - 1], [15, bottom - 1], [7, bottom], [12, bottom]]) { p.ellipse(x, y, 2, 1.2, PAL.stone[2]); p.px(x - 1, y - 1, PAL.stone[4]); }
    // Pfahl
    for (let y = 9; y < bottom; y++) for (let x = x0; x <= x1; x++) {
      const rel = (x - x0) / (x1 - x0);
      let i = rel < 0.2 ? 4 : rel < 0.55 ? 3 : rel < 0.85 ? 2 : 1;
      if (hash2(x, y >> 1, 62) < 0.1) i--;
      p.px(x, y, WOOD[clampI(i, 5)]);
    }
    // Kopf: geschnitzte Eule mit Hörnern
    p.rect(x0 - 1, 3, x1 - x0 + 3, 7, WOOD[3]); p.rect(x0 - 1, 3, 2, 7, WOOD[4]); p.rect(x1, 3, 2, 7, WOOD[1]);
    p.px(x0 - 1, 1, WOOD[4]); p.px(x0 - 1, 2, WOOD[4]); p.px(x0, 2, WOOD[3]); p.px(x1 + 1, 1, WOOD[2]); p.px(x1 + 1, 2, WOOD[2]); p.px(x1, 2, WOOD[2]);
    p.rect(x0 + 1, 2, x1 - x0 - 1, 1, WOOD[4]);
    // Augen
    const eyes = [[x0 + 1, 5], [x1 - 2, 5]];
    for (const [x, y] of eyes) {
      p.rect(x, y, 2, 2, on ? '#a0e8a0' : RUNE_OFF);
      if (on) { g.rect(x, y, 2, 2, '#7ef0a0'); g.px(x, y, '#e8ffd0'); }
    }
    p.px(x0 + 3, 8, WOOD[1]); p.px(x0 + 4, 8, WOOD[1]); p.px(x0 + 3, 7, WOOD[2]);
    // Grünes Tuch um den Hals
    p.rect(x0 - 1, 10, x1 - x0 + 3, 2, GREEN[3]); p.rect(x0 - 1, 10, 3, 2, GREEN[4]); p.rect(x1 - 1, 12, 2, 5, GREEN[2]); p.px(x1, 17, GREEN[1]);
    // Kerbband
    for (let x = x0; x <= x1; x++) p.px(x, 13 + (x % 2), WOOD[1]);
    // Runen (je 3×5)
    const runes = [
      [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [0, 1], [2, 2], [0, 3]],
      [[0, 0], [2, 0], [0, 1], [2, 1], [1, 2], [0, 3], [2, 3], [1, 4]],
      [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [0, 3], [2, 3], [0, 4], [2, 4]],
    ];
    runes.forEach((r, k) => {
      const rx = x0 + 2, ry = 16 + k * 6;
      for (const [dx, dy] of r) {
        p.px(rx + dx, ry + dy, on ? RUNE_ON : RUNE_OFF);
        if (on) g.px(rx + dx, ry + dy, dy % 2 ? GOLD[4] : '#8af0a0');
      }
      if (!on) p.px(rx - 1, ry, WOOD[4]);
    });
    // Lichtkante
    p.rect(x0, 15, 1, 18, WOOD[4]);
    // Opfergabe: Kerzenstumpf / Beeren
    p.rect(x1 + 2, bottom - 4, 2, 3, PAL.bone[3]); p.px(x1 + 2, bottom - 4, PAL.bone[4]);
    if (on) { p.px(x1 + 2, bottom - 5, EMB[4]); g.px(x1 + 2, bottom - 5, EMB[5]); g.px(x1 + 2, bottom - 6, EMB[3]); }
    else p.px(x1 + 2, bottom - 5, CHAR[1]);
  }, { ax: 10, box: [-4, -3, 4, 1], light: on ? { dx: 0, dy: -20, radius: 64, color: [150, 240, 140], intensity: 0.8 } : undefined });
}

// ------------------------------------------------------------ Verlorene Tasche
function satchel() {
  const W = 14, H = 10;
  return mk(W, H, (p, g) => {
    // Riemen
    p.line(1, 8, 4, 2, LEA[2]); p.line(2, 8, 5, 2, LEA[1]);
    // Körper
    p.rect(3, 3, 9, 6, LEA[2]); p.rect(3, 3, 2, 6, LEA[3]); p.rect(11, 3, 1, 6, LEA[0]); p.rect(3, 8, 9, 1, LEA[1]);
    // Klappe
    p.rect(3, 2, 9, 3, LEA[3]); p.rect(3, 2, 9, 1, '#8a6446'); p.rect(4, 5, 7, 1, LEA[1]);
    p.px(7, 5, GOLD[3]); p.px(7, 6, GOLD[2]);
    // herausragende Schriftrolle
    p.rect(10, 1, 2, 2, PAL.bone[3]); p.px(10, 1, PAL.bone[4]);
    // Asche
    p.px(4, 2, ASH[5]); p.px(5, 2, ASH[4]); p.rect(2, 9, 11, 1, ASH[3]);
    g.px(7, 5, GOLD[4]);
  }, { ax: 7 });
}

// ------------------------------------------------------------ Tempelruine am Ufer
function templeRuin() {
  const W = 68, H = 60;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 34;
    const T = TSTONE;
    const waterY = bottom - 7;
    // Wasser vorn
    for (let y = waterY; y <= bottom; y++) for (let x = 2; x < W - 2; x++) {
      const e = Math.abs(x - cx) / 32 + (y - waterY) / 20;
      if (e > 1.05 + hash2(x, y, 71) * 0.1) continue;
      let i = 2; const wv = Math.sin(x * 0.45 + y * 1.3);
      if (wv > 0.85) i = 3; if (y === waterY) i = 3;
      p.px(x, y, WATER[i]);
    }
    // Rückwand (versunkene Tempelfront) mit Quadern
    const wx0 = 8, wx1 = 60, wtop = 18;
    for (let y = wtop; y < waterY; y++) for (let x = wx0; x <= wx1; x++) {
      const row = Math.floor((y - wtop) / 5), lx = (x - wx0 + (row % 2) * 4) % 9, ly = (y - wtop) % 5;
      let c = T[2];
      if (ly === 0 || lx === 0) c = T[1];
      else if (ly === 1) c = T[3];
      if (hash2(x, y, 72) < 0.06) c = T[1];
      // zerbrochene Oberkante
      const brk = Math.round(Math.abs(Math.sin(x * 0.37)) * 4 + (x > 44 ? 4 : 0));
      if (y < wtop + brk) continue;
      if (y === wtop + brk) c = T[4];
      p.px(x, y, c);
    }
    // Algen/Nässe im unteren Drittel
    for (let x = wx0; x <= wx1; x++) { const h = 3 + Math.round(hash2(x, 0, 73) * 5); for (let y = waterY - h; y < waterY; y++) if (hash2(x, y, 74) < 0.7) p.px(x, y, ALGAE[y > waterY - 3 ? 0 : 1 + (hash2(x, y, 75) < 0.3 ? 1 : 0)]); }
    // Torbogen-Öffnung
    const ox0 = cx - 10, ox1 = cx + 10, otop = 26;
    for (let y = otop - 7; y < waterY + 2; y++) for (let x = ox0; x <= ox1; x++) {
      const dy = y - otop; if (dy < 0) { const t = (x - cx) / 10.5; if (dy < -Math.sqrt(Math.max(0, 1 - t * t)) * 7) continue; }
      const deep = Math.max(0, (y - otop) / (waterY - otop));
      p.px(x, y, deep > 0.6 && (x + y) % 2 ? '#0a1a1c' : '#050709');
    }
    // Stufen hinab ins Dunkel
    for (let s = 0; s < 4; s++) { const y = waterY - 1 - s * 3, inset = s * 2; p.rect(ox0 + 1 + inset, y, 19 - inset * 2, 1, T[4 - Math.min(3, s)]); p.rect(ox0 + 1 + inset, y + 1, 19 - inset * 2, 1, T[1]); }
    // Bogensteine (Keilsteine)
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      const x = cx + Math.cos(a) * 13, y = otop + Math.sin(a) * 9.5;
      p.ellipse(x, y, 2.4, 2.4, T[3]); p.px(x - 1, y - 1, T[5]); p.px(x + 1, y + 1, T[1]);
    }
    // Schlussstein mit Auge-Rune
    p.rect(cx - 3, otop - 13, 7, 6, T[4]); p.rect(cx - 3, otop - 13, 7, 1, T[6]); p.rect(cx + 3, otop - 12, 1, 5, T[2]);
    p.px(cx - 1, otop - 11, TEAL[2]); p.px(cx, otop - 11, TEAL[3]); p.px(cx + 1, otop - 11, TEAL[2]); p.px(cx, otop - 10, TEAL[3]); p.px(cx - 2, otop - 10, TEAL[1]); p.px(cx + 2, otop - 10, TEAL[1]);
    g.px(cx - 1, otop - 11, TEAL[3]); g.px(cx, otop - 11, TEAL[4]); g.px(cx + 1, otop - 11, TEAL[3]); g.px(cx, otop - 10, TEAL[4]); g.px(cx - 2, otop - 10, TEAL[2]); g.px(cx + 2, otop - 10, TEAL[2]);
    // Runen im Bogen
    for (let i = 1; i < 10; i += 2) {
      const a = Math.PI + (i / 10) * Math.PI, x = Math.round(cx + Math.cos(a) * 13), y = Math.round(otop + Math.sin(a) * 9.5);
      p.px(x, y, TEAL[2]); g.px(x, y, TEAL[4]); g.px(x, y + 1, TEAL[2]);
    }
    // Säulen: links intakt mit Kapitell, rechts gebrochen
    const column = (x, top, brokenTop) => {
      for (let y = top; y < waterY + 1; y++) {
        p.px(x, y, T[5]); p.px(x + 1, y, T[4]); p.px(x + 2, y, T[3]); p.px(x + 3, y, T[3]); p.px(x + 4, y, T[2]); p.px(x + 5, y, T[1]);
        if (y % 3 === 0) p.px(x + 3, y, T[2]); // Kannelur
      }
      if (!brokenTop) {
        p.rect(x - 2, top - 4, 10, 2, T[4]); p.rect(x - 2, top - 4, 10, 1, T[6]); p.rect(x - 1, top - 2, 8, 2, T[3]); p.rect(x + 7, top - 3, 1, 2, T[1]);
        p.rect(x - 3, top - 6, 12, 2, T[3]); p.rect(x - 3, top - 6, 12, 1, T[5]);
      } else {
        for (let i = 0; i < 6; i++) p.px(x + i, top - [2, 3, 1, 0, 1, 0][i], T[4]);
        p.px(x + 1, top - 2, T[6]);
      }
      // Ranke/Algen hoch an der Säule
      for (let y = waterY - 9; y < waterY; y++) if (hash2(x, y, 77) < 0.55) p.px(x + (y % 3), y, ALGAE[2]);
    };
    column(6, 12, false);
    column(56, 26, true);
    // Architrav-Bruchstück links oben (liegt auf der Säule)
    p.rect(1, 2, 22, 5, T[3]); p.rect(1, 2, 22, 1, T[5]); p.rect(1, 6, 22, 1, T[1]);
    for (let x = 3; x < 22; x += 5) { p.px(x, 4, TEAL[1]); p.px(x + 1, 4, TEAL[2]); g.px(x + 1, 4, TEAL[3]); }
    p.rect(21, 3, 3, 4, T[2]); p.px(24, 4, T[1]); p.px(23, 6, T[1]);
    // abgestürzte Trommel rechts im Wasser
    p.ellipse(62, waterY + 1, 4, 2.2, T[3]); p.ellipse(61, waterY, 3, 1.4, T[5]); p.px(64, waterY + 2, T[1]);
    // Schilf links
    for (let i = 0; i < 5; i++) { const x = 2 + i * 2; p.line(x, bottom - 3, x + (i % 2), bottom - 10 - (i % 3) * 2, REED[2 + (i % 2)]); }
    // Tiefes Leuchten im Tor
    for (let y = waterY - 6; y < waterY; y++) for (let x = cx - 6; x <= cx + 6; x++) if ((x + y) % 3 === 0) { p.px(x, y, TEAL[0]); g.px(x, y, TEAL[1]); }
    // Wasserspiegelung der Runen
    for (let i = 0; i < 5; i++) { const x = cx - 6 + i * 3; p.px(x, waterY + 2, TEAL[1]); g.px(x, waterY + 2, TEAL[2]); }
  }, {
    ax: 34, box: undefined,
    light: { dx: 0, dy: -24, radius: 76, color: [80, 220, 200], intensity: 0.7 },
    extra: { boxes: [[-30, -8, -22, 1], [22, -8, 28, 1]], door: { dx: 0, dy: -9 } },
  });
}

// ------------------------------------------------------------ Schilf
function reeds(v) {
  const rng = createRng(130 + v);
  const W = 16, H = 22;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    const n = 5 + v;
    for (let i = 0; i < n; i++) {
      const x = 2 + rng.int(0, 11), h = rng.int(9, 19), bend = rng.range(-3, 3);
      let lx = x, ly = bottom;
      for (let k = 1; k <= h; k++) {
        const t = k / h, xx = Math.round(x + bend * t * t), yy = bottom - k;
        p.px(xx, yy, REED[t > 0.6 ? 3 : t > 0.3 ? 2 : 1]);
        if (bend < 0 && k > 2) p.px(xx - 1, yy, REED[4]);
        lx = xx; ly = yy;
      }
      if (rng.chance(0.5)) { p.rect(lx, ly + 1, 2, 3, '#3a2216'); p.px(lx, ly + 1, '#5a3622'); p.px(lx, ly, REED[2]); }
    }
    // Blätter
    for (let i = 0; i < 3; i++) { const x = 3 + rng.int(0, 9); p.line(x, bottom, x + (i % 2 ? 4 : -3), bottom - 7, REED[i % 2 ? 2 : 4]); }
    // Wasserlinie
    p.rect(1, bottom, 14, 1, WATER[2]); p.px(3, bottom, WATER[4]); p.px(10, bottom, WATER[3]);
  }, { ax: 8 });
}


// ====================================================================== Runde 5: neuer Aschenwald
// Dichter Wald (feste Waldmassen), Hängebrücke über die Aschenschlucht, Knüppelbrücke
// über den Aschbach, Furt, Burgruine der Banditen, verwunschener Hain.
const FIR = ['#0b0f0d', '#111815', '#18211c', '#202b24', '#2a362d', '#364337'];
const RSTONE = ['#121014', '#1c181d', '#272227', '#342e33', '#443c41', '#574e51', '#6c6262'];
const GHOST = ['#1a2a24', '#2e4a3e', '#4e7e66', '#86c8a0', '#d4ffe4'];
const SHROOM = ['#1a1030', '#3a2066', '#6a3cb0', '#a070f0', '#e0c8ff'];
const DARK = '#040406';
const flatE = (W, H, ax, ay, draw) => ({ sprite: buildFrame(W, H, ax, ay, draw, { outline: false }) });

// Aschtanne: dunkle, staubige Nadeln, Asche auf den Zweigen, kaum Licht
function ashFir(seed, H = 50, W = 32) {
  const rng = createRng(seed);
  const cx = Math.floor(W / 2), bottom = H - 1, top = 2;
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, bottom - 1, 9, 2, seed);
    p.rect(cx - 2, bottom - 8, 4, 8, CHAR[2]); p.rect(cx - 2, bottom - 8, 1, 8, CHAR[4]); p.rect(cx + 1, bottom - 8, 1, 8, CHAR[0]);
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const k0 = t / tiers;
      const baseY = Math.round(bottom - 7 - (bottom - 7 - top) * k0);
      const half = (W / 2 - 2) * (1 - k0 * 0.8);
      const th = Math.round((bottom - top) / tiers) + 4;
      for (let dy = 0; dy < th; dy++) {
        const y = baseY - dy, k = dy / th;
        const hw = Math.max(0.5, half * (1 - k) + rng.range(-1.2, 1.2));
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          const rel = (x - cx) / Math.max(1, hw);
          let i = 2;
          if (rel < -0.5) i = 4; else if (rel < -0.1) i = 3; else if (rel > 0.5) i = 1;
          if (dy < 2) i -= 1;
          if (hash2(x, y, seed) < 0.15) i += hash2(x, y, seed + 1) < 0.5 ? 1 : -1;
          p.px(x, y, FIR[clampI(i, 6)]);
        }
        if (dy === 0) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) if (hash2(x, t, seed + 2) < 0.4) p.px(x, y + 1, FIR[1]);
      }
      // Asche auf den Zweigoberseiten links
      for (let dy = 2; dy < th - 1; dy += 2) { const y = baseY - dy, hw = half * (1 - dy / th); p.px(Math.round(cx - hw) + 1, y, ASH[4]); if (hash2(t, dy, seed) < 0.5) p.px(Math.round(cx - hw) + 2, y - 1, ASH[3]); }
    }
    // vereinzelte Glutreste in den Nadeln
    if (rng.chance(0.5)) { const y = rng.int(bottom - 30, bottom - 12), x = cx + rng.int(-5, 5); p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
    p.px(cx, top - 1, FIR[3]);
  }, { ax: cx, box: [-3, -3, 3, 1] });
}

// Waldmasse: drei Bäume (Aschtanne/verkohlte Kiefer/Birke), hinten dunkler, Unterholzsaum
function deepWood(seed, dy = 0, dx = 0) {
  const rng = createRng(seed);
  const W = 50, H = 66, cx = 25, bottom = H - 1;
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const back = i === 0;
    const r = rng.next();
    const s = back || r < 0.6 ? ashFir(seed * 11 + i, back ? 56 : rng.int(44, 52)).sprite : r < 0.85 ? charredPine(seed * 5 + i, rng.int(44, 52), false).sprite : deadBirch(seed * 3 + i, 44).sprite;
    parts.push({ s, x: back ? cx + rng.int(-6, 6) : cx + (i === 1 ? -10 : 10) + rng.int(-2, 2), y: back ? bottom - 9 : bottom - (i === 1 ? 1 : 4), back });
  }
  const sprite = buildFrame(W, H, cx + dx, bottom - 2 + dy, (p) => {
    for (const q of parts) {
      if (q.back) p.ctx.filter = 'brightness(0.6)';
      p.ctx.drawImage(q.s.canvas, Math.round(q.x - q.s.ax), Math.round(q.y - q.s.ay));
      p.ctx.filter = 'none';
    }
    for (let x = 3; x < W - 3; x++) {
      const h = 2 + Math.round(hash2(x, 1, seed) * 4);
      for (let y = bottom - h; y <= bottom - 1; y++) p.px(x, y, y === bottom - h ? (hash2(x, y, seed) < 0.3 ? ASH[3] : CHAR[3]) : hash2(x, y, seed + 4) < 0.5 ? CHAR[1] : CHAR[0]);
    }
  }, { outline: false });
  return { sprite };
}

// Hängebrücke (Nord–Süd): Segment je Stegzeile, Anker in der Zeile darüber.
// end: 0 Mitte, -1 Nordende (hohe Pfosten), 1 Südende.
function ropeBridgeSeg(end, v) {
  const tall = end !== 0;
  const W = 44, H = tall ? 44 : 16, ax = 14, ay = tall ? (end < 0 ? 26 : 26) : -2;
  const top = tall ? 28 : 0; // y der Stegzeile im Sprite
  return flatE(W, H, ax, ay, (p) => {
    // Bohlen quer, Lücken zeigen den Abgrund
    for (let y = top; y < top + 16; y++) {
      const e = (y + v) % 4;
      for (let x = 7; x < 37; x++) {
        const jag = (x < 9 || x > 34) && hash2(y >> 2, x, 960 + v) < 0.5;
        if (jag) continue;
        let c = e === 3 ? DARK : e === 0 ? WOOD[3] : WOOD[2];
        if (e !== 3 && hash2(x, y, 961 + v) < 0.06) c = WOOD[1];
        if (e === 2 && x % 9 === 4) c = WOOD[1];
        p.px(x, y, c);
      }
    }
    // Längsseile unter den Bohlen und Handseile
    for (let y = top; y < top + 16; y++) {
      for (const [x, c] of [[5, CANVAS[2]], [6, CANVAS[1]], [37, CANVAS[1]], [38, CANVAS[0]]]) p.px(x, y, c);
      if (y % 4 === 1) { p.px(4, y, CANVAS[3]); p.px(39, y, CANVAS[2]); } // Knoten / Halteseile
    }
    if (tall) {
      // Ankerpfosten (Nordende oben, Südende unten verankert)
      const py0 = end < 0 ? 0 : 4;
      for (const x of [1, 38]) {
        p.rect(x, py0, 5, top + 12 - py0, WOOD[2]); p.rect(x, py0, 1, top + 12 - py0, WOOD[4]); p.rect(x + 4, py0, 1, top + 12 - py0, WOOD[0]);
        p.rect(x - 1, py0, 7, 2, WOOD[3]); p.px(x + 2, py0 + 6, IRON[3]);
        for (let y = py0 + 8; y < py0 + 14; y += 2) p.rect(x, y, 5, 1, CANVAS[2]); // Seilwicklung
      }
      // Querbalken über dem Zugang (Nordende), Laterne
      if (end < 0) {
        p.rect(1, 4, 42, 3, WOOD[3]); p.rect(1, 4, 42, 1, WOOD[4]); p.rect(1, 6, 42, 1, WOOD[1]);
        p.line(6, 7, 20, top, CANVAS[2]); p.line(38, 7, 24, top, CANVAS[1]);
      }
    }
  });
}

// Knüppelbrücke über den Bach (Ost–West), Segmente wie die Dorfbrücke
function logBridgeSeg(end) {
  const W = 16, H = 54;
  return flatE(W, H, 8, 14, (p) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) {
      if (end) p.px(x, y, hash2(x, y, 970) < 0.5 ? ASH[2] : ASH[1]);
      else p.px(x, y, (x + y) % 5 === 0 ? WATER[1] : WATER[0]);
    }
    // Rundhölzer längs (Ost–West), je 5 px
    for (let y = 10; y < 48; y++) {
      const k = (y - 10) % 5;
      for (let x = 0; x < W; x++) {
        let c = k === 0 ? CHAR[1] : k === 1 ? WOOD[3] : k === 2 ? WOOD[2] : k === 3 ? WOOD[2] : WOOD[1];
        if (hash2(x, y, 971) < 0.07) c = CHAR[2];
        if (k === 1 && hash2(x, y >> 2, 972) < 0.15) c = ASH[4];
        p.px(x, y, c);
      }
    }
    // Stirnseite (vorn): Rundholzenden über dem Wasser
    for (let x = 0; x < W; x++) for (let y = 48; y < 54; y++) p.px(x, y, y === 48 ? WOOD[3] : (x + y) % 6 === 0 ? WOOD[3] : CHAR[2]);
    // Seilgeländer an Pfählen (hinten)
    const postX = end < 0 ? 2 : end > 0 ? 11 : 6;
    p.rect(postX, 0, 3, 12, WOOD[2]); p.rect(postX, 0, 1, 12, WOOD[4]);
    p.line(0, 3, 15, 4, CANVAS[2]); p.line(0, 4, 15, 5, CANVAS[1]);
    if (end) { p.rect(postX, 40, 3, 10, WOOD[2]); p.rect(postX, 40, 1, 10, WOOD[4]); }
  });
}

// Trittsteine in der Furt (kachelgenau): Wasser mit flachen Steinen
function steppingStones(v) {
  return flatE(16, 16, 8, 14, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(x, y, (x * 3 + y * 5 + v) % 11 === 0 ? WATER[3] : (x + y) % 4 === 0 ? WATER[1] : WATER[2]);
    const stones = v === 0 ? [[4, 5, 3.6, 2.6], [11, 11, 3.2, 2.4]] : v === 1 ? [[8, 7, 4.2, 3]] : [[4, 11, 3, 2.2], [11, 4, 3.4, 2.4]];
    for (const [x, y, rx, ry] of stones) {
      p.ellipse(x, y + 1, rx, ry, WATER[0]);
      p.ellipse(x, y, rx, ry, RSTONE[3]); p.ellipse(x - 0.6, y - 0.6, rx - 1.2, ry - 1, RSTONE[4]); p.px(x - 1, y - 1, RSTONE[5]);
      p.px(x + Math.round(rx) - 1, y + 1, ALGAE[1]);
      p.px(x - Math.round(rx), y + 1, '#8aa0bc');
    }
  });
}

// Burgruine: Mauerstücke (waagrecht/senkrecht), Turmstumpf
function ruinWall(v) {
  const H = [30, 24, 16][v], W = 16;
  return flatE(W, H, 8, H - 3, (p) => {
    const top = (x) => [2, 0, 6][v] + Math.round(Math.abs(Math.sin(x * 0.8 + v * 2)) * [5, 6, 3][v]);
    for (let x = 0; x < W; x++) for (let y = top(x); y < H; y++) {
      const row = Math.floor(y / 5), lx = (x + (row % 2) * 4) % 8, ly = y % 5;
      let c = ly === 4 || lx === 0 ? RSTONE[1] : ly === 0 ? RSTONE[4] : RSTONE[2 + (hash2(x >> 3, row, 980 + v) < 0.35 ? 1 : 0)];
      if (y === top(x)) c = RSTONE[5];
      if (y > H - 5) c = RSTONE[Math.max(0, RSTONE.indexOf(c) - 1)];
      if (hash2(x, y, 981) < 0.05) c = RSTONE[1];
      p.px(x, y, c);
    }
    for (let x = 0; x < W; x++) { if (hash2(x, 0, 982 + v) < 0.5) p.px(x, top(x) + 1, ALGAE[1]); if (hash2(x, 1, 983) < 0.3) p.px(x, H - 2, ALGAE[2]); }
    if (v === 2) for (let i = 0; i < 4; i++) p.ellipse(2 + i * 4, H - 2, 2, 1.2, RSTONE[3]); // Schutt
  });
}
function ruinWallV(v) {
  const H = 30 - v * 6, W = 16;
  return flatE(W, H, 8, H - 3, (p) => {
    for (let y = v * 2; y < H; y++) for (let x = 3; x < 13; x++) {
      const ly = y % 5, lx = (x + (Math.floor(y / 5) % 2) * 3) % 6;
      let c = x === 3 ? RSTONE[5] : x > 10 ? RSTONE[1] : ly === 4 || lx === 0 ? RSTONE[1] : RSTONE[3];
      if (y === v * 2) c = RSTONE[5];
      if (hash2(x, y, 985 + v) < 0.06) c = RSTONE[1];
      p.px(x, y, c);
    }
    for (let y = v * 2 + 2; y < H; y += 3) if (hash2(1, y, 986) < 0.4) p.px(4, y, ALGAE[1]);
  });
}
function ruinTower() {
  const W = 52, H = 80, cx = 26, bottom = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, bottom - 1, 24, 3, 990);
    const r = 20;
    for (let y = 10; y <= bottom - 2; y++) {
      const brk = 10 + Math.round(Math.abs(Math.sin((y) * 0.9)) * 2);
      for (let x = cx - r; x <= cx + r; x++) {
        const t = (x - cx) / r;
        const yTop = 10 + Math.round((1 - Math.sqrt(Math.max(0, 1 - t * t))) * 4) + Math.round(Math.abs(Math.sin(x * 0.7)) * 6 + (x > cx + 4 ? 8 : 0));
        if (y < yTop) continue;
        const row = Math.floor(y / 5), ang = Math.asin(Math.max(-1, Math.min(1, t))) * 6, lx = Math.floor(ang + (row % 2) * 0.5);
        const ly = y % 5;
        let i = t < -0.6 ? 4 : t < -0.1 ? 3 : t < 0.5 ? 2 : 1;
        if (ly === 4) i -= 1; else if (ly === 0) i += 1;
        if (Math.abs((ang + (row % 2) * 0.5) % 1) < 0.12) i -= 1;
        if (hash2(x, y, 991) < 0.05) i -= 1;
        if (y === yTop) i = 5;
        p.px(x, y, RSTONE[clampI(i, 7)]);
      }
      void brk;
    }
    // Tor (Bogen), dunkel; Schießscharte mit Licht
    for (let y = bottom - 22; y < bottom - 2; y++) for (let x = cx - 7; x <= cx + 7; x++) {
      const dy = y - (bottom - 15); if (dy < 0 && ((x - cx) / 7.5) ** 2 + (dy / 7) ** 2 > 1) continue;
      p.px(x, y, '#060507');
    }
    for (let x = cx - 8; x <= cx + 8; x += 2) { const dy = -Math.sqrt(Math.max(0, 1 - ((x - cx) / 8.5) ** 2)) * 8; p.px(x, bottom - 15 + dy - 1, RSTONE[5]); }
    p.rect(cx - 9, 30, 3, 8, '#070608'); p.rect(cx - 8, 31, 1, 6, EMB[2]); g.rect(cx - 8, 31, 1, 6, EMB[4]);
    // Banditenflagge auf dem Stumpf, Efeu, Schutt
    p.line(cx - 10, 12, cx - 10, -0 + 0, WOOD[3]);
    for (let y = 1; y < 8; y++) for (let x = cx - 9; x < cx - 9 + 10 - Math.floor(y / 2); x++) p.px(x, y, y < 3 ? CRIM[3] : CRIM[2]);
    p.px(cx - 6, 3, '#1a0a0a'); p.px(cx - 5, 4, '#1a0a0a'); p.px(cx - 4, 3, '#1a0a0a');
    for (let i = 0; i < 70; i++) { const x = cx - r + Math.floor(hash2(i, 1, 992) * 14), y = 20 + Math.floor(hash2(i, 2, 992) * 50); p.px(x, y, ALGAE[1 + (i % 2)]); }
    for (let i = 0; i < 6; i++) p.ellipse(cx - 20 + i * 8, bottom - 1, 2.5, 1.4, RSTONE[2 + (i % 2)]);
  }, { ax: cx, box: [-19, -10, 19, 1], light: { dx: -8, dy: -46, radius: 50, color: [255, 140, 60], intensity: 0.6 } });
}

// Verwunschener Hain: Runenstein, bleicher Baum, Leuchtpilze
function runeStone(v) {
  const H = [36, 30, 40][v];
  return mk(18, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, 9, bottom - 1, 7, 2, 1000 + v);
    poly(p, [[3, bottom], [4, 7], [8, 1], [12, 4], [14, bottom]], (x, y) => {
      let i = x < 6 ? 5 : x < 9 ? 4 : x < 12 ? 3 : 2;
      if (hash2(x, y, 1001 + v) < 0.08) i -= 1;
      if ((y + v * 2) % 8 === 0 && x > 5) i -= 1;
      return RSTONE[clampI(i, 7)];
    });
    for (let y = bottom - 8; y < bottom; y++) for (let x = 3; x < 14; x++) if (hash2(x, y, 1002) < 0.4) p.px(x, y, ALGAE[1 + (x % 2)]);
    const glyphs = [[[0, 0], [0, 1], [0, 2], [1, 1], [2, 0], [2, 2]], [[1, 0], [0, 1], [2, 1], [1, 2], [1, 3]], [[0, 0], [1, 1], [2, 2], [0, 2], [2, 0]]];
    for (let k = 0; k < 2; k++) for (const [dx, dy] of glyphs[(v + k) % 3]) { const x = 7 + dx, y = 9 + k * 7 + dy; p.px(x, y, GHOST[2]); g.px(x, y, GHOST[3 + ((dx + dy) % 2)]); }
  }, { ax: 9, box: [-5, -3, 5, 1], light: v === 0 ? { dx: 0, dy: -16, radius: 46, color: [120, 230, 170], intensity: 0.5 } : undefined });
}
function hauntedTree(v) {
  const rng = createRng(1010 + v);
  const W = 44, H = 56, cx = 22, bottom = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, bottom - 1, 12, 2, 1011 + v);
    const branch = (x, y, a, len, th, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      for (let i = 0; i < th; i++) p.line(x + i, y, x2 + i * 0.5, y2, i === 0 ? BIRCH[4] : BIRCH[2]);
      if (depth <= 0 || len < 3) { if (rng.chance(0.5)) p.line(x2, y2, x2 + rng.int(-1, 1), y2 + rng.int(3, 7), GHOST[1]); return; }
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) branch(x2, y2, a + rng.range(-0.9, 0.9), len * rng.range(0.55, 0.75), Math.max(1, th - 1), depth - 1);
    };
    // gedrehter Stamm
    for (let y = bottom - 26; y <= bottom; y++) {
      const off = Math.round(Math.sin(y * 0.25 + v) * 2), hw = 3 + (y > bottom - 4 ? bottom - y > 1 ? 1 : 3 : 0);
      for (let x = cx - hw + off; x <= cx + hw + off; x++) p.px(x, y, BIRCH[x === cx - hw + off ? 5 : x === cx + hw + off ? 1 : (x + y) % 5 === 0 ? 2 : 3]);
    }
    branch(cx, bottom - 25, -Math.PI / 2 + rng.range(-0.2, 0.2), 12, 3, 4);
    branch(cx - 1, bottom - 20, -Math.PI / 2 - 1.0, 11, 2, 3);
    branch(cx + 1, bottom - 22, -Math.PI / 2 + 1.0, 11, 2, 3);
    // Gesicht im Stamm: zwei leuchtende Höhlen
    p.rect(cx - 3, bottom - 17, 2, 3, DARK); p.rect(cx + 1, bottom - 16, 2, 3, DARK); p.rect(cx - 2, bottom - 11, 4, 2, DARK);
    g.px(cx - 3, bottom - 16, GHOST[3]); g.px(cx + 2, bottom - 15, GHOST[3]);
    // Irrlichter
    for (const [x, y] of [[6, 14], [38, 20], [30, 6]].slice(0, 2 + v)) { p.px(x, y, GHOST[3]); g.px(x, y, GHOST[4]); g.px(x - 1, y, GHOST[2]); g.px(x + 1, y, GHOST[2]); g.px(x, y - 1, GHOST[2]); g.px(x, y + 1, GHOST[2]); }
  }, { ax: cx, box: [-4, -3, 4, 1], light: { dx: 0, dy: -30, radius: 60, color: [120, 230, 170], intensity: 0.45 } });
}
function glowShrooms(v) {
  return mk(14, 12, (p, g) => {
    const caps = [[3, 8, 2], [8, 6, 3], [11, 9, 1.6]].slice(0, 2 + (v % 2));
    for (const [x, y, r] of caps) {
      p.rect(x, y, 1, 11 - y, BIRCH[3]);
      p.ellipse(x, y, r, r * 0.6, SHROOM[2]); p.px(x - 1, y - 1, SHROOM[3]);
      g.ellipse(x, y, r, r * 0.6, SHROOM[3]); g.px(x - 1, y - 1, SHROOM[4]);
    }
  }, { ax: 7, light: v === 0 ? { dx: 0, dy: -6, radius: 34, color: [170, 110, 255], intensity: 0.5 } : undefined });
}
function fallenTree(v) {
  return mk(46, 20, (p, g) => {
    ashPatch(p, 23, 17, 21, 2, 1020 + v);
    for (let x = 4; x < 40; x++) for (let y = 7; y <= 14; y++) {
      const k = (y - 7) / 7;
      let i = k < 0.2 ? 4 : k < 0.5 ? 3 : k < 0.85 ? 2 : 1;
      if ((x * 2 + y) % 6 === 0) i -= 1;
      if (hash2(x, y, 1021) < 0.1) i -= 1;
      p.px(x, y, CHAR[clampI(i, 6)]);
    }
    p.ellipse(41, 10.5, 2.4, 4, WOOD[1]); p.ellipse(41, 10.5, 1.5, 2.8, '#6a4a30'); p.px(41, 10, '#8a6a44');
    // Wurzelteller links
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i / 8 - 0.5) * 2.6; p.line(4, 11, 4 + Math.cos(a + Math.PI) * 6, 11 + Math.sin(a) * 7, CHAR[2]); }
    p.line(16, 7, 13, 1, CHAR[3]); p.line(28, 7, 31, 2, CHAR[2]); p.line(31, 2, 34, 1, CHAR[2]);
    for (let x = 6; x < 38; x++) if (hash2(x, 0, 1022 + v) < 0.5) p.px(x, 7, ASH[4]);
    if (v === 0) { p.px(22, 10, EMB[3]); p.px(23, 11, EMB[2]); g.px(22, 10, EMB[4]); g.px(23, 11, EMB[3]); }
  }, { ax: 23, ay: 17, box: [-17, -7, 17, 0] });
}

// ------------------------------------------------------------ Runde 5: Questobjekte der Banditen
// Eisenbeschlagene Truhe des Anführers (geschlossen / offen)
function strongbox(on) {
  const W = 24, H = 20;
  return mk(W, H, (p, g) => {
    const b = H - 1;
    ashPatch(p, 12, b - 1, 11, 2, 1101);
    // Korpus
    p.rect(2, 8, 20, 10, WOOD[2]); p.rect(2, 8, 3, 10, WOOD[3]); p.rect(20, 8, 2, 10, WOOD[1]);
    for (let x = 2; x < 22; x += 5) p.rect(x, 9, 1, 9, WOOD[1]);
    p.rect(2, 17, 20, 1, WOOD[0]);
    // Eisenbänder und Ecken
    for (const x of [4, 18]) { p.rect(x, 8, 2, 10, IRON[1]); p.rect(x, 8, 1, 10, IRON[3]); }
    p.rect(2, 16, 3, 2, IRON[2]); p.rect(19, 16, 3, 2, IRON[1]);
    if (!on) {
      // gewölbter Deckel
      for (let x = 2; x < 22; x++) { const t = Math.abs(x - 11.5) / 10; const top = 3 + Math.round(t * t * 3); for (let y = top; y < 8; y++) p.px(x, y, y === top ? WOOD[4] : x < 5 ? WOOD[3] : WOOD[2]); }
      for (const x of [4, 18]) for (let y = 3; y < 8; y++) p.px(x, y, IRON[2]);
      p.rect(2, 7, 20, 1, IRON[1]);
      // Schloss
      p.rect(10, 6, 4, 5, GOLD[2]); p.rect(10, 6, 4, 1, GOLD[4]); p.px(11, 8, '#140c06'); p.px(11, 9, '#140c06');
      g.px(10, 6, GOLD[4]); g.px(13, 6, GOLD[3]);
      // Banditenzeichen (roter Krähenfuß)
      p.line(7, 11, 9, 14, CRIM[3]); p.line(9, 14, 9, 11, CRIM[3]); p.line(9, 14, 11, 12, CRIM[2]);
    } else {
      // aufgeklappter Deckel nach hinten, Inneres dunkel, Goldglanz
      p.rect(2, 0, 20, 5, WOOD[2]); p.rect(2, 0, 20, 1, WOOD[4]); for (const x of [4, 18]) p.rect(x, 0, 2, 5, IRON[2]);
      p.rect(3, 5, 18, 4, '#0d0806');
      for (let i = 0; i < 9; i++) { const x = 5 + i * 2, y = 6 + (i % 2); p.px(x, y, GOLD[3]); g.px(x, y, GOLD[4]); }
      p.px(12, 5, GOLD[4]);
    }
  }, { ax: 12, box: [-10, -5, 10, 1], light: on ? { dx: 0, dy: -10, radius: 40, color: [255, 210, 120], intensity: 0.5 } : undefined });
}

// Waffenkiste der Banditen: Speere und Schwertgriffe ragen heraus (zu / aufgebrochen)
function weaponCrate(on) {
  const W = 28, H = 26;
  return mk(W, H, (p) => {
    const b = H - 1;
    ashPatch(p, 14, b - 1, 13, 2, 1111);
    // Speere hinter der Kiste
    if (!on) {
      for (const [x, top] of [[7, 0], [10, 2], [19, 1]]) {
        p.line(x, top + 4, x, 12, WOOD[3]);
        p.px(x, top, IRON[4]); p.px(x, top + 1, IRON[3]); p.px(x - 1, top + 2, IRON[2]); p.px(x + 1, top + 2, IRON[2]); p.px(x, top + 2, IRON[3]); p.px(x, top + 3, IRON[2]);
      }
      // Schwertgriffe
      for (const x of [14, 22]) { p.rect(x, 6, 1, 6, LEA[2]); p.rect(x - 2, 10, 5, 1, IRON[3]); p.px(x, 5, GOLD[3]); }
    }
    // Kiste
    p.rect(2, 11, 24, 13, WOOD[2]); p.rect(2, 11, 24, 1, WOOD[4]); p.rect(2, 11, 2, 13, WOOD[3]); p.rect(24, 12, 2, 12, WOOD[1]);
    for (let y = 15; y < 24; y += 4) p.rect(3, y, 22, 1, WOOD[1]);
    p.line(4, 12, 24, 23, WOOD[3]); p.line(4, 13, 23, 23, WOOD[1]);
    p.rect(2, 23, 24, 1, WOOD[0]);
    // rotes Tuch
    p.rect(15, 12, 7, 4, CRIM[2]); p.rect(15, 12, 7, 1, CRIM[3]); p.px(21, 16, CRIM[1]); p.px(16, 16, CRIM[1]);
    if (on) {
      // Deckel daneben, Kiste leer und dunkel
      p.rect(3, 12, 22, 3, '#0e0907');
      p.line(1, 24, 8, 21, WOOD[3]); p.line(1, 25, 9, 22, WOOD[2]);
      p.px(12, 13, IRON[2]); p.px(13, 13, IRON[1]);
    }
  }, { ax: 14, box: [-12, -6, 12, 1] });
}

// Versteck der Banditen: unter einer Steinplatte (Turm) oder unter den Wurzeln am Bach
function banditCache(where, on) {
  const W = 26, H = 18;
  return mk(W, H, (p, g) => {
    const b = H - 1;
    if (where === 'tower') {
      // Trümmersteine rundherum
      for (const [x, y, r] of [[3, 14, 2.6], [22, 13, 3], [6, 9, 2], [20, 7, 2.2], [13, 6, 1.6]]) { p.ellipse(x, y, r, r * 0.75, RSTONE[3]); p.px(Math.round(x - 1), Math.round(y - 1), RSTONE[5]); }
      if (!on) {
        // Platte leicht verschoben, Spalt mit roter Stoffecke
        poly(p, [[5, 10], [21, 9], [23, 15], [4, 16]], (x, y) => (y === 9 || y === 10 ? RSTONE[5] : hash2(x, y, 1121) < 0.12 ? RSTONE[2] : RSTONE[4]));
        p.line(5, 16, 22, 15, RSTONE[1]); p.line(21, 9, 23, 15, RSTONE[2]);
        p.rect(19, 15, 4, 2, CRIM[2]); p.px(22, 16, CRIM[3]);
        p.px(9, 12, RSTONE[2]); p.px(10, 13, RSTONE[2]); p.px(15, 11, RSTONE[2]);
      } else {
        poly(p, [[1, 12], [9, 11], [10, 16], [1, 17]], RSTONE[4]);
        p.ellipse(16, 13, 6, 3, '#090708'); p.ellipse(16, 13, 4.5, 2, '#040304');
        p.px(14, 12, LEA[2]); p.px(18, 14, LEA[1]);
      }
    } else {
      // Bachufer: Wurzelbogen, Kiesel, Lederbeutel
      for (let i = 0; i < 6; i++) { const x0 = 2 + i * 4; p.line(x0, 4 + (i % 2), x0 + 3, 15, WOOD[1 + (i % 2)]); p.line(x0 + 1, 4 + (i % 2), x0 + 4, 15, WOOD[0]); }
      p.ellipse(13, 12, 9, 4, '#0b0908');
      for (const [x, y] of [[2, 16], [6, 17], [11, 16], [17, 17], [22, 16], [24, 14]]) { p.ellipse(x, y, 1.8, 1, PAL.stone[2]); p.px(x - 1, y - 1, PAL.stone[4]); }
      if (!on) {
        p.ellipse(12, 12, 4, 3, LEA[2]); p.rect(10, 9, 4, 2, LEA[3]); p.px(12, 8, LEA[1]); p.px(11, 11, GOLD[3]); g.px(11, 11, GOLD[4]);
        p.rect(16, 11, 3, 2, CRIM[2]);
      }
      for (let x = 1; x < W - 1; x++) if (hash2(x, 0, 1122) < 0.4) p.px(x, 3 + (x % 3 === 0 ? 1 : 0), GREEN[3]);
    }
  }, { ax: 13, box: where === 'tower' ? [-11, -4, 11, 1] : [-9, -3, 9, 1] });
}

// Umgestürzter Turm: liegender Mauerzylinder mit abgebrochener Krone (Karten-Deko, fest)
function fallenTower() {
  const W = 76, H = 36;
  return mk(W, H, (p, g) => {
    const b = H - 1;
    ashPatch(p, 38, b - 2, 36, 3, 1131);
    // Schaft (liegend, Quader in Reihen, Licht von oben)
    for (let x = 6; x < 62; x++) {
      const top = 8 + Math.round(Math.abs(Math.sin(x * 0.31)) * 1.5 + (x > 54 ? (x - 54) * 0.6 : 0));
      for (let y = top; y < b - 2; y++) {
        const t = (y - top) / (b - 2 - top);
        const col = Math.floor((x + (Math.floor(y / 5) % 2) * 3) / 6);
        let i = t < 0.15 ? 5 : t < 0.45 ? 4 : t < 0.75 ? 3 : 2;
        if ((x + (Math.floor(y / 5) % 2) * 3) % 6 === 0 || y % 5 === 0) i -= 1;
        if (hash2(x, y, 1132 + col) < 0.06) i -= 1;
        p.px(x, y, RSTONE[clampI(i, 7)]);
      }
    }
    // Stirnseite (Ring) links, mit dunklem Inneren
    p.ellipse(7, 20, 6, 12, RSTONE[2]); p.ellipse(7, 20, 4, 9.5, '#070608');
    for (let a = 0; a < 10; a++) { const t = (a / 10) * Math.PI * 2; p.px(Math.round(7 + Math.cos(t) * 5.5), Math.round(20 + Math.sin(t) * 11.5), RSTONE[a < 5 ? 3 : 5]); }
    // abgebrochene Krone rechts: Zacken und Schutt
    for (let i = 0; i < 9; i++) { const x = 60 + Math.floor(hash2(i, 1, 1133) * 14), y = b - 2 - Math.floor(hash2(i, 2, 1133) * 10); p.ellipse(x, y, 2 + (i % 2), 1.6, RSTONE[2 + (i % 3)]); p.px(x - 1, y - 1, RSTONE[5]); }
    // Efeu, Asche, eine Schießscharte
    for (let i = 0; i < 60; i++) { const x = 8 + Math.floor(hash2(i, 3, 1134) * 50), y = 9 + Math.floor(hash2(i, 4, 1134) * 6); p.px(x, y, ALGAE[1 + (i % 2)]); }
    p.rect(30, 16, 6, 3, '#070608'); p.px(31, 17, EMB[2]); g.px(31, 17, EMB[3]);
    // rote Fetzen der Banditen
    p.line(44, 9, 44, 1, WOOD[3]); for (let y = 1; y < 6; y++) for (let x = 45; x < 52 - y; x++) p.px(x, y, y < 3 ? CRIM[3] : CRIM[2]);
  }, { ax: 36, ay: H - 3, box: [-32, -14, 30, 0] });
}

// Alte Eiche: mächtiger, noch grüner Baum im Süden (Aussichtspunkt)
function ancientOak() {
  const W = 84, H = 96, cx = 42, b = H - 1;
  const OAKL = ['#0c140d', '#132015', '#1b2d1c', '#253c24', '#33502e', '#46663a', '#5e7e48'];
  const rng = createRng(1141);
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, b - 2, 30, 4, 1142);
    // Wurzeln
    for (const [dx, len] of [[-1, 18], [1, 20], [-1, 11], [1, 12]]) {
      for (let i = 0; i < len; i++) { const x = cx + dx * (6 + i), y = b - 3 + Math.round(i * 0.18); p.rect(x, y - 2 + Math.floor(i / 8), 1, 3 - Math.floor(i / 8), WOOD[i % 3 === 0 ? 1 : 2]); }
    }
    // Stamm (breit, knorrig)
    for (let y = 44; y < b - 1; y++) {
      const hw = 7 + Math.round(Math.max(0, (y - (b - 14)) * 0.5)) + Math.round(Math.sin(y * 0.4) * 0.8);
      for (let x = cx - hw; x <= cx + hw; x++) {
        const t = (x - (cx - hw)) / (2 * hw);
        let i = t < 0.18 ? 4 : t < 0.5 ? 3 : t < 0.8 ? 2 : 1;
        if ((x * 3 + Math.floor(y / 3)) % 7 === 0) i -= 1;
        p.px(x, y, WOOD[clampI(i, 6)]);
      }
    }
    // Astloch, Kerben
    p.ellipse(cx + 2, 66, 2.5, 3.5, '#070506'); p.px(cx + 1, 64, WOOD[4]);
    // Äste
    p.line(cx - 3, 50, cx - 20, 36, WOOD[2]); p.line(cx - 3, 51, cx - 20, 37, WOOD[1]); p.line(cx - 4, 49, cx - 21, 35, WOOD[3]);
    p.line(cx + 3, 48, cx + 22, 34, WOOD[2]); p.line(cx + 3, 49, cx + 22, 35, WOOD[1]);
    // Krone: viele Blattballen, hinten dunkler
    const blobs = [];
    for (let i = 0; i < 26; i++) blobs.push([cx + rng.range(-32, 32), rng.range(10, 46), rng.range(7, 12)]);
    blobs.sort((a, c) => a[1] - c[1]);
    for (const [bx, by, r] of blobs) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = (x * x + y * y) / (r * r); if (d > 1) continue;
        const px = Math.round(bx + x), py = Math.round(by + y * 0.85);
        if (px < 1 || px >= W - 1 || py < 1) continue;
        const light = (-x - y) / r;
        let i = 2 + Math.round(light * 1.6) + (by < 26 ? 1 : 0);
        if (hash2(px, py, 1143) < 0.12) i -= 1;
        if (d > 0.82 && hash2(px, py, 1144) < 0.5) continue;
        p.px(px, py, OAKL[clampI(i, 7)]);
      }
    }
    // Bänder und Kerzen der Wächter am Stamm (Aussichtspunkt)
    p.rect(cx - 7, 58, 15, 2, GREEN[3]); p.rect(cx - 7, 58, 4, 2, GREEN[4]);
    p.px(cx - 9, b - 4, PAL.bone[3]); p.px(cx - 9, b - 5, EMB[4]); g.px(cx - 9, b - 5, EMB[5]);
  }, { ax: cx, ay: b - 1, box: [-9, -6, 9, 1], light: { dx: -9, dy: -6, radius: 40, color: [255, 160, 80], intensity: 0.5 } });
}

// ------------------------------------------------------------ Runde 5b: Waldvielfalt, Baumlager, Köhlerei
const AUT = ['#130b09', '#22120d', '#371d12', '#512a16', '#6e3d1c', '#8c5525', '#a97236'];
const OLIVE = ['#0f130b', '#192011', '#262f17', '#36411e', '#4a5627', '#626c33'];
const LEAFY = ['#0d140f', '#152017', '#1f2e1f', '#2b3e28', '#3b5233', '#506a40'];

// Laubballen (sortiert nach y), Licht von links oben
function leafBlobs(p, blobs, pal, seed, W) {
  blobs.sort((a, c) => a[1] - c[1]);
  for (const [bx, by, r, k] of blobs) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = (x * x + y * y) / (r * r); if (d > 1) continue;
      const px = Math.round(bx + x), py = Math.round(by + y * 0.85);
      if (px < 1 || px >= W - 1 || py < 1) continue;
      if (d > 0.78 && hash2(px, py, seed) < 0.5) continue;
      let i = 2 + Math.round(((-x - y) / r) * 1.5) + (k ?? 0);
      if (hash2(px, py, seed + 1) < 0.14) i -= 1;
      p.px(px, py, pal[clampI(i, pal.length)]);
    }
  }
}

// Laubbaum mit rostrotem oder oliv Laub
function broadleaf(seed, H = 56, pal = AUT) {
  const rng = createRng(seed);
  const W = 46, cx = 23, b = H - 1;
  return mk(W, H, (p) => {
    ashPatch(p, cx, b - 1, 10, 2, seed);
    for (let y = Math.round(H * 0.45); y < b; y++) {
      const hw = 2 + (y > b - 4 ? 1 : 0);
      for (let x = cx - hw; x <= cx + hw; x++) p.px(x, y, WOOD[x === cx - hw ? 4 : x === cx + hw ? 1 : (x + y) % 5 ? 2 : 3]);
    }
    p.line(cx, Math.round(H * 0.55), cx - 9, Math.round(H * 0.38), WOOD[2]); p.line(cx, Math.round(H * 0.5), cx + 10, Math.round(H * 0.34), WOOD[1]);
    const blobs = [];
    const top = 4, mid = Math.round(H * 0.33);
    for (let i = 0; i < 9; i++) blobs.push([cx + rng.range(-14, 14), rng.range(top + 6, mid + 8), rng.range(6, 9)]);
    leafBlobs(p, blobs, pal, seed, W);
  }, { ax: cx, box: [-3, -3, 3, 1], shadow: 16 });
}

// Lebende Birke (helle Rinde, lichte Krone)
function liveBirch(seed, H = 50) {
  const rng = createRng(seed);
  const W = 30, cx = 14, b = H - 1;
  return mk(W, H, (p) => {
    ashPatch(p, cx, b - 1, 6, 2, seed);
    const blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([cx + rng.range(-8, 8), rng.range(8, H * 0.55), rng.range(4, 6)]);
    leafBlobs(p, blobs, OLIVE, seed, W);
    for (let y = 6; y < b; y++) {
      const x = cx + Math.round(Math.sin(y * 0.1 + seed) * 1.1);
      p.px(x - 1, y, BIRCH[5]); p.px(x, y, BIRCH[4]); p.px(x + 1, y, BIRCH[2]);
      if (hash2(0, y, seed) < 0.18) { p.px(x, y, '#161214'); p.px(x + 1, y, '#161214'); }
    }
    for (let i = 0; i < 10; i++) { const x = cx + rng.int(-9, 9), y = rng.int(8, Math.round(H * 0.6)); p.px(x, y, '#8a8a3a'); }
  }, { ax: cx, box: [-2, -2, 2, 1], shadow: 12 });
}

// Baumgruppe aus fertigen Sprites (fest, ohne Kasten – Kachel ist fest)
function clump(seed, makers, W = 54, H = 68, dy = 0, dx = 0) {
  const rng = createRng(seed);
  const cx = Math.floor(W / 2), bottom = H - 1;
  const parts = makers.map((mkr, i) => {
    const back = i === 0, s = mkr(seed * 7 + i, back).sprite;
    return { s, x: back ? cx + rng.int(-5, 5) : cx + (i === 1 ? -11 : 11) + rng.int(-2, 2), y: back ? bottom - 9 : bottom - (i === 1 ? 1 : 4), back };
  });
  const sprite = buildFrame(W, H, cx + dx, bottom - 2 + dy, (p) => {
    for (const q of parts) {
      if (q.back) p.ctx.filter = 'brightness(0.62)';
      p.ctx.drawImage(q.s.canvas, Math.round(q.x - q.s.ax), Math.round(q.y - q.s.ay));
      p.ctx.filter = 'none';
    }
    for (let x = 8; x < W - 8; x++) if (hash2(x, 1, seed) < 0.55) p.px(x, bottom - 1 - (hash2(x, 2, seed) < 0.4 ? 1 : 0), LEAFY[2]);
  }, { outline: false });
  return { sprite };
}
const broadClump = (seed, dy = 0, dx = 0) => clump(seed, [
  (s) => broadleaf(s, 60, s % 2 ? AUT : LEAFY), (s) => broadleaf(s + 1, 54, s % 3 ? AUT : OLIVE), (s) => (s % 2 ? liveBirch(s, 48) : broadleaf(s + 2, 50, LEAFY)),
], 58, 70, dy, dx);
const birchClump = (seed, dy = 0, dx = 0) => clump(seed, [(s) => liveBirch(s, 54), (s) => liveBirch(s + 1, 48), (s) => (s % 3 ? liveBirch(s + 2, 44) : broadleaf(s, 46, OLIVE))], 46, 62, dy, dx);

// Baumlager: alte Tanne mit Plattform, Hütte, Leiter, Laterne
function treePlatform(v) {
  const W = 76, H = 128, cx = 38, b = H - 1;
  const rng = createRng(1601 + v);
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, b - 2, 18, 3, 1602 + v);
    // Wurzeln und Stamm
    for (const s of [-1, 1]) for (let i = 0; i < 10; i++) p.rect(cx + s * (6 + i), b - 3 + (i >> 2), 1, 3 - (i >> 2), WOOD[i % 3 ? 2 : 1]);
    for (let y = 18; y < b - 1; y++) {
      const hw = 5 + (y > b - 8 ? 2 : 0);
      for (let x = cx - hw; x <= cx + hw; x++) { const t = (x - cx + hw) / (2 * hw); p.px(x, y, WOOD[t < 0.2 ? 4 : t < 0.55 ? 3 : t < 0.85 ? 2 : 1]); }
      if (hash2(0, y, 1603) < 0.12) p.px(cx - 1, y, WOOD[0]);
    }
    // Krone (Tanne, über und hinter der Hütte)
    for (let t = 0; t < 6; t++) {
      const y0 = 2 + t * 8, half = 7 + t * 4;
      for (let y = y0; y < y0 + 11; y++) {
        const w = Math.round(half * ((y - y0) / 11) + 3);
        for (let x = cx - w; x <= cx + w; x++) {
          const k = (x - cx) / Math.max(1, w);
          let i = k < -0.45 ? 4 : k < 0.1 ? 3 : k < 0.6 ? 2 : 1;
          if (y === y0 + 10 && hash2(x, y, 1604) < 0.5) continue;
          if (hash2(x, y, 1605 + v) < 0.1) i -= 1;
          p.px(x, y, FIR[clampI(i, 6)]);
        }
      }
    }
    // Plattform
    const py = 66;
    p.rect(cx - 30, py, 60, 4, WOOD[2]); p.rect(cx - 30, py, 60, 1, WOOD[4]); p.rect(cx - 30, py + 3, 60, 1, WOOD[0]);
    for (let x = cx - 30; x < cx + 30; x += 6) p.px(x, py + 1, WOOD[1]);
    // Stützbalken
    p.line(cx - 26, py + 4, cx - 6, py + 22, WOOD[1]); p.line(cx + 26, py + 4, cx + 6, py + 22, WOOD[1]);
    // Geländer
    for (let x = cx - 30; x <= cx + 30; x += 5) p.rect(x, py - 7, 1, 7, WOOD[3]);
    p.rect(cx - 30, py - 7, 61, 1, WOOD[3]);
    // Hütte auf der Plattform (Rindendach, grünes Tuch)
    p.rect(cx - 14, py - 20, 28, 20, WOOD[2]); p.rect(cx - 14, py - 20, 3, 20, WOOD[3]); p.rect(cx + 12, py - 20, 2, 20, WOOD[1]);
    for (let y = py - 18; y < py; y += 4) p.rect(cx - 14, y, 28, 1, WOOD[1]);
    poly(p, [[cx - 19, py - 19], [cx, py - 31], [cx + 19, py - 19]], (x, y) => ((x + y) % 4 ? CHAR[3] : CHAR[2]));
    p.line(cx - 19, py - 19, cx, py - 31, CHAR[5]);
    p.rect(cx - 4, py - 13, 7, 13, '#0a0706');
    p.rect(cx + 6, py - 15, 4, 4, EMB[3]); g.rect(cx + 6, py - 15, 4, 4, EMB[4]);
    p.rect(cx - 13, py - 6, 9, 3, GREEN[3]); p.rect(cx - 13, py - 6, 9, 1, GREEN[4]);
    // Leiter links
    const lx = cx - 22 + (v % 2) * 40;
    for (let y = py + 4; y < b - 2; y++) { p.px(lx, y, WOOD[3]); p.px(lx + 5, y, WOOD[1]); if ((y - py) % 5 === 0) p.rect(lx, y, 6, 1, WOOD[2]); }
    // Laterne am Plattformrand
    const ax0 = cx + (v % 2 ? -27 : 27);
    p.line(ax0, py, ax0, py + 6, WOOD[1]); p.rect(ax0 - 1, py + 6, 3, 4, IRON[1]); p.px(ax0, py + 7, GOLD[4]); g.rect(ax0 - 1, py + 6, 3, 4, GOLD[3]); g.px(ax0, py + 7, '#fff2c0');
    // Wimpel
    p.line(cx + 1, py - 31, cx + 1, py - 40, WOOD[3]); p.rect(cx + 2, py - 40, 6, 3, GREEN[4]);
    void rng;
  }, { ax: cx, ay: b - 1, box: [-7, -4, 7, 1], light: { dx: v % 2 ? -27 : 27, dy: -50, radius: 90, color: [255, 190, 110], intensity: 0.8 } });
}

// Kohlenmeiler: Erdkuppel mit Rauch, glimmenden Luftlöchern
function charcoalKiln(v) {
  const W = 46, H = 30, cx = 23, b = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, cx, b - 1, 21, 3, 1611 + v);
    for (let y = 4; y < b - 1; y++) for (let x = 2; x < W - 2; x++) {
      const dx = (x - cx) / 20, dy = (b - 1 - y) / 24;
      if (dx * dx + dy * dy > 1) continue;
      const shade = -dx * 0.8 + dy * 0.6;
      let i = shade > 0.5 ? 4 : shade > 0.1 ? 3 : shade > -0.3 ? 2 : 1;
      if (hash2(x >> 1, y >> 1, 1612 + v) < 0.18) i -= 1;
      p.px(x, y, (x + y * 3) % 7 === 0 ? LEAFY[clampI(i, 6)] : ASH[clampI(i + 1, 7)]);
    }
    // Luftlöcher mit Glut
    for (const [x, y] of [[12, 20], [21, 22], [31, 19], [17, 13], [28, 12], [23, 7]].slice(0, 4 + (v % 3))) {
      p.rect(x, y, 2, 2, EMB[3]); p.px(x, y, EMB[5]); g.rect(x, y, 2, 2, EMB[4]); g.px(x, y, '#fff0b0');
    }
    // Stangen und Schaufel
    p.line(41, b - 2, 44, 6, WOOD[3]); p.rect(42, 3, 3, 4, IRON[2]);
  }, { ax: cx, box: [-18, -8, 18, 1], light: { dx: 0, dy: -12, radius: 70, color: [255, 120, 50], intensity: 0.6 }, extra: { smoke: { dx: 0, dy: -24, rate: 4 } } });
}

// Steinmann (Wegzeichen)
function cairn(v) {
  return mk(14, 20, (p) => {
    ashPatch(p, 7, 18, 6, 1, 1621 + v);
    const st = [[7, 16, 5, 2.6], [7, 12, 4, 2.2], [7 + (v % 2), 8, 3, 2], [7, 5 - (v % 2), 2, 1.6]];
    for (const [x, y, rx, ry] of st) { p.ellipse(x, y, rx, ry, RSTONE[3]); p.ellipse(x - 0.8, y - 0.6, rx - 1.2, ry - 0.8, RSTONE[5]); p.px(x + rx - 2, y + 1, RSTONE[1]); }
  }, { ax: 7, box: [-4, -3, 4, 1] });
}

// Laternenpfahl am Weg
function lanternPost() {
  return mk(14, 34, (p, g) => {
    p.rect(5, 6, 2, 27, WOOD[2]); p.rect(5, 6, 1, 27, WOOD[4]); p.rect(5, 6, 7, 1, WOOD[3]);
    p.rect(9, 8, 4, 6, IRON[1]); p.rect(10, 9, 2, 4, GOLD[4]); g.rect(10, 9, 2, 4, GOLD[3]); g.px(10, 10, '#fff2c0');
    p.rect(4, 32, 4, 1, WOOD[1]);
  }, { ax: 6, box: [-2, -2, 2, 1], light: { dx: 5, dy: -22, radius: 70, color: [255, 180, 100], intensity: 0.8 } });
}

// Mühlenruine auf der Bachinsel: Mauerreste und gebrochenes Rad
function millRuin() {
  const W = 70, H = 56, b = H - 1;
  return mk(W, H, (p) => {
    ashPatch(p, 35, b - 2, 32, 3, 1631);
    // Mauern (zwei Wände mit Bruchkante)
    for (let x = 14; x < 58; x++) {
      const top = 14 + Math.round(Math.abs(Math.sin(x * 0.45)) * 5 + (x > 40 ? (x - 40) * 0.8 : 0));
      for (let y = top; y < b - 2; y++) {
        const row = Math.floor(y / 4), lx = (x + (row % 2) * 3) % 7;
        let i = x < 22 ? 4 : x < 44 ? 3 : 2;
        if (lx === 0 || y % 4 === 0) i -= 1;
        if (hash2(x, y, 1632) < 0.06) i -= 1;
        if (y === top) i = 5;
        p.px(x, y, RSTONE[clampI(i, 7)]);
      }
    }
    p.rect(30, 30, 9, 23, '#070608'); p.rect(20, 24, 5, 6, '#070608'); p.rect(46, 30, 5, 5, '#070608');
    for (let i = 0; i < 60; i++) { const x = 14 + Math.floor(hash2(i, 1, 1633) * 44), y = 18 + Math.floor(hash2(i, 2, 1633) * 30); p.px(x, y, ALGAE[1 + (i % 2)]); }
    // gebrochenes Rad links
    const wx = 9, wy = 34;
    p.ellipse(wx, wy, 9, 11, WOOD[1]); p.ellipse(wx, wy, 7, 9, '#0b0908');
    for (let i = 0; i < 8; i++) { if (i === 2 || i === 5) continue; const a = (i / 8) * Math.PI * 2; p.line(wx, wy, wx + Math.cos(a) * 8, wy + Math.sin(a) * 10, WOOD[i % 2 ? 2 : 3]); }
    p.ellipse(wx, wy, 1.6, 1.6, WOOD[4]);
    // Schutt
    for (let i = 0; i < 7; i++) p.ellipse(16 + i * 7, b - 1, 2.4, 1.3, RSTONE[2 + (i % 3)]);
  }, { ax: 35, ay: b - 1, box: [-21, -10, 23, 1] });
}

// Anker-Versatz je Variante (Pixel): Waldkacheln wählen per Hash, so liegen die Bäume nicht in Reihen
const JIT = [[0, 0], [-6, 3], [5, -4], [-3, -6], [7, 5], [-8, -2], [3, 7], [-5, 6], [8, -7], [-2, -3], [6, 2], [-7, -5]];
export function createAshwoodDecor() {
  return {
    charredPines: [charredPine(201, 48, false), charredPine(207, 54, false), charredPine(213, 44, false), charredPine(219, 40, true)],
    deadBirches: [deadBirch(301, 40), deadBirch(305, 46), deadBirch(309, 36)],
    stumps: [0, 1, 2].map(stump),
    ashBushes: [0, 1, 2].map(ashBush),
    brambles: [0, 1].map(bramble),
    rocks: [0, 1, 2].map(ashRock),
    tent: tentGuard(),
    banditTent: tentBandit(),
    palisade: palisadeH(),
    palisadeV: palisadeV(),
    watchtower: watchtower(),
    bannerPole: bannerPole(),
    campfireBig: campfireBig(),
    logPile: logPile(),
    cart: cart(),
    wardTotem: { off: wardTotem(false), on: wardTotem(true) },
    satchel: satchel(),
    templeRuin: templeRuin(),
    reeds: [0, 1, 2].map(reeds),
    // Runde 5
    deepWood: JIT.map(([dy, dx], i) => deepWood([101, 103, 107, 109, 113][i % 5], dy, dx)),
    ropeBridge: [ropeBridgeSeg(0, 0), ropeBridgeSeg(0, 1)], ropeBridgeN: ropeBridgeSeg(-1, 0), ropeBridgeS: ropeBridgeSeg(1, 2),
    logBridgeL: logBridgeSeg(-1), logBridgeM: logBridgeSeg(0), logBridgeR: logBridgeSeg(1),
    steppingStones: [0, 1, 2].map(steppingStones),
    ruinWall: [0, 1, 2].map(ruinWall), ruinWallV: [0, 1].map(ruinWallV), ruinTower: ruinTower(),
    runeStone: [0, 1, 2].map(runeStone), hauntedTree: [0, 1].map(hauntedTree), glowShrooms: [0, 1, 2].map(glowShrooms),
    fallenTree: [fallenTree(0), fallenTree(1)],
    strongbox: { off: strongbox(false), on: strongbox(true) },
    weaponCrate: { off: weaponCrate(false), on: weaponCrate(true) },
    cacheTower: { off: banditCache('tower', false), on: banditCache('tower', true) },
    cacheBrook: { off: banditCache('brook', false), on: banditCache('brook', true) },
    fallenTower: fallenTower(), ancientOak: ancientOak(),
    // Runde 5b
    broadClump: JIT.map(([dy, dx], i) => broadClump([1701, 1703, 1707, 1709, 1711][i % 5], dy, dx)), birchClump: JIT.map(([dy, dx], i) => birchClump([1801, 1803, 1807, 1809][i % 4], dy, dx)),
    broadleaf: [broadleaf(1901, 56, AUT), broadleaf(1903, 52, LEAFY), broadleaf(1907, 58, OLIVE), liveBirch(1909, 50)],
    treePlatform: [treePlatform(0), treePlatform(1)], charcoalKiln: [0, 1, 2].map(charcoalKiln),
    cairn: [0, 1].map(cairn), lanternPost: lanternPost(), millRuin: millRuin(),
  };
}
