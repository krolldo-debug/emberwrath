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
  };
}
