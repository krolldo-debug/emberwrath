import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { hash2, createRng } from '../core/math.js';
import { OUT, createPine, createDeadTree, createRock, createBush, createFence, createGrave, createLamp, createCampfire, createWell, createCrate, createSign } from './outdoor.js';
import { mk, poly } from './decor_ashwood.js';

// Dorf-Objekte für das Endgame: Glutpforte (Eingang der Glutprüfungen) und
// Gemeinschaftstruhe (Bank). Format wie Deko-Einträge: { sprite, glow, box, light }.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss).
const BASALT = ['#0d0b10', '#18141c', '#241e2a', '#332a39', '#463b4c', '#5b4e60'];
const EMB = PAL.ember, GOLD = PAL.gold, IRON = PAL.steel;
const WOOD = ['#140c09', '#22150f', '#342016', '#4a2e1e', '#61402a', '#7c5636'];

export function createVillageProps() {
  return {
    emberGate: emberGate(), bankChest: bankChest(), mirror: mirror(),
    // Runde 5: Deko-Satz der Glutsenke (level.decorSet = 'village')
    ...createValleyDecor(),
  };
}

function emberGate() {
  const W = 48, H = 60, cx = 24, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);
  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    // Sockelstufen
    p.rect(4, bottom - 3, W - 8, 4, BASALT[2]); p.rect(4, bottom - 3, W - 8, 1, BASALT[4]);
    p.rect(8, bottom - 6, W - 16, 3, BASALT[3]); p.rect(8, bottom - 6, W - 16, 1, BASALT[5]);
    // Pfeiler (links/rechts), leicht nach oben verjüngt, mit Runenkerben
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 7 : W - 15;
      for (let y = 8; y < bottom - 6; y++) {
        const taper = y < 16 ? 1 : 0;
        for (let x = x0 + taper; x < x0 + 8 - taper; x++) {
          const k = x - x0;
          let c = BASALT[k === 0 ? 4 : k === 1 ? 3 : k >= 6 ? 1 : 2];
          if (hash2(x, y, 9) < 0.06) c = BASALT[1];
          p.px(x, y, c);
        }
      }
      // Runen: drei Kerben je Pfeiler, auf der Glow-Ebene glühend
      for (let i = 0; i < 3; i++) {
        const ry = 20 + i * 9, rx = x0 + 3;
        const shape = [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]];
        const shape2 = [[0, 0], [1, 0], [1, 1], [0, 2], [1, 3], [1, 4]];
        for (const [dx, dy] of (i % 2 ? shape2 : shape)) { p.px(rx + dx, ry + dy, EMB[1]); G(rx + dx, ry + dy, EMB[3 + (dy % 2)]); }
      }
      // Kapitell
      p.rect(x0 - 1, 6, 10, 3, BASALT[3]); p.rect(x0 - 1, 6, 10, 1, BASALT[5]);
    }
    // Sturz (Bogen) mit Glutkristall
    for (let x = 6; x < W - 6; x++) {
      const t = (x - cx) / (cx - 6);
      const y0 = Math.round(2 + t * t * 4);
      for (let y = y0; y < y0 + 5; y++) p.px(x, y, BASALT[y === y0 ? 5 : y === y0 + 4 ? 1 : 3]);
    }
    // Kristall in der Mitte
    const kx = cx, ky = 3;
    for (let dy = -3; dy <= 4; dy++) {
      const w = 3 - Math.abs(dy - 0.5) * 0.7;
      for (let dx = -Math.floor(w); dx <= Math.floor(w); dx++) {
        const c = dx < 0 ? EMB[4] : dx === 0 ? EMB[5] : EMB[3];
        p.px(kx + dx, ky + dy, c); G(kx + dx, ky + dy, dx === 0 && dy < 2 ? '#fff4d0' : EMB[4]);
      }
    }
    // Innenraum: dunkle Tiefe, der Wirbel liegt auf der Glow-Ebene
    for (let y = 11; y < bottom - 6; y++) {
      for (let x = 15; x < W - 15; x++) {
        const t = Math.abs(x - cx) / 9;
        if (y < 14 && t > 0.7) continue;
        p.px(x, y, y > bottom - 12 ? '#2a1010' : '#120709');
      }
    }
    // Wirbel: Spirale in Glutfarben
    for (let i = 0; i < 260; i++) {
      const a = i * 0.21, r = i * 0.055;
      const x = Math.round(cx + Math.cos(a) * r * 0.9), y = Math.round(30 + Math.sin(a) * r * 1.35);
      if (x < 15 || x >= W - 15 || y < 12 || y > bottom - 7) continue;
      const c = r < 3 ? '#fff4d0' : r < 7 ? EMB[5] : r < 11 ? EMB[4] : EMB[3];
      p.px(x, y, r < 7 ? EMB[4] : EMB[2]);
      G(x, y, c);
    }
    // Moosreste und Asche am Sockel
    for (let x = 6; x < W - 6; x++) if (hash2(x, 0, 12) < 0.25) p.px(x, bottom - 4, '#2a3923');
  });
  return { sprite, glow: g.canvas, box: [-18, -6, 18, 1], light: { dx: 0, dy: -26, radius: 90, color: [255, 150, 70], intensity: 0.95 }, embers: { dx: 0, dy: -24, rate: 5 } };
}

function bankChest() {
  const W = 30, H = 24, cx = 15, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);
  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    const x0 = 2, x1 = W - 3, lidY = 4, bodyY = 11;
    // Korpus: Bohlen
    for (let x = x0; x <= x1; x++) {
      const k = (x - x0) % 6;
      for (let y = bodyY; y <= bottom - 1; y++) p.px(x, y, WOOD[k === 0 ? 1 : y === bodyY ? 4 : 3]);
    }
    // Gewölbter Deckel
    for (let x = x0; x <= x1; x++) {
      const t = (x - cx) / (cx - x0);
      const top = Math.round(lidY + t * t * 2);
      for (let y = top; y < bodyY; y++) p.px(x, y, WOOD[y === top ? 5 : y === bodyY - 1 ? 1 : 3]);
    }
    // Eisenbänder und Beschläge
    for (const bx of [x0 + 3, x1 - 4]) {
      for (let y = lidY; y <= bottom - 1; y++) { p.px(bx, y, IRON[2]); p.px(bx + 1, y, IRON[1]); }
      for (let y = lidY + 2; y < bottom; y += 4) p.px(bx, y, IRON[4]);
    }
    p.rect(x0, bodyY, x1 - x0 + 1, 1, IRON[2]);
    p.rect(x0, bottom - 1, x1 - x0 + 1, 1, IRON[1]);
    // Goldkanten
    p.px(x0, bodyY, GOLD[3]); p.px(x1, bodyY, GOLD[3]); p.px(x0, bottom - 1, GOLD[2]); p.px(x1, bottom - 1, GOLD[2]);
    // Schloss mit Wappen
    p.rect(cx - 3, bodyY - 2, 6, 7, GOLD[2]); p.rect(cx - 3, bodyY - 2, 6, 1, GOLD[4]); p.rect(cx - 2, bodyY - 1, 4, 5, GOLD[3]);
    p.px(cx, bodyY + 1, WOOD[0]); p.px(cx, bodyY + 2, WOOD[0]);
    G(cx - 2, bodyY - 2, '#fff0b0'); G(cx - 1, bodyY - 2, GOLD[4]);
    // Füße
    p.rect(x0, bottom, 3, 1, IRON[1]); p.rect(x1 - 2, bottom, 3, 1, IRON[1]);
  });
  return { sprite, glow: g.canvas, box: [-13, -6, 13, 1] };
}

// Standspiegel mit geschnitztem Holzrahmen (Aussehen ändern, Panel von A)
function mirror() {
  const W = 20, H = 34, cx = 10, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);
  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    // Füße und Ständer
    p.rect(3, bottom, 5, 1, WOOD[2]); p.rect(12, bottom, 5, 1, WOOD[2]);
    p.rect(5, bottom - 5, 2, 5, WOOD[3]); p.rect(13, bottom - 5, 2, 5, WOOD[3]);
    p.rect(5, bottom - 5, 1, 5, WOOD[5]);
    // Ovaler Rahmen
    const ey = 13, rx = 8, ry = 12;
    for (let y = ey - ry; y <= ey + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const dx = (x - cx + 0.5) / rx, dy = (y - ey + 0.5) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (d > 0.62) p.px(x, y, d > 0.86 ? WOOD[2] : dy < -0.2 || dx < -0.3 ? WOOD[5] : WOOD[4]);
        else {
          // Spiegelglas: kühler Verlauf mit Spiegelung
          const k = (y - (ey - ry)) / (2 * ry);
          p.px(x, y, k < 0.35 ? '#8aa0bc' : k < 0.7 ? '#5e7290' : '#3e4c66');
        }
      }
    }
    // Glanzstreifen
    for (let i = 0; i < 7; i++) { p.px(cx - 4 + i, ey - 6 + i, '#dfe7f2'); G(cx - 4 + i, ey - 6 + i, 'rgba(220,235,255,0.5)'); }
    p.px(cx + 3, ey - 5, '#ffffff'); G(cx + 3, ey - 5, '#ffffff');
    // Schnitzkrone oben
    p.rect(cx - 2, 0, 5, 2, WOOD[4]); p.px(cx, 0, GOLD[3]); G(cx, 0, GOLD[4]);
  });
  return { sprite, glow: g.canvas, box: [-7, -4, 7, 1] };
}

// ====================================================================== Glutsenke (Runde 5)
// Deko-Satz der neuen Glutsenke: Wald, Dorf, Mühle, Brücken, Felder, Friedhof,
// Höhle. Format wie decor_ashwood (mk: { sprite, glow, box, light, … }).
// Licht von links oben (Mond), warme Akzente nur an Laternen/Fenstern/Feuer.
const GR = OUT.grass, DIRT = OUT.dirt, PINE = OUT.pine, BARK = OUT.bark, SLATE = OUT.slate, WTR = OUT.water;
const STN = PAL.stone, MOSS = PAL.moss, BONE = PAL.bone;
const STRAW = ['#2a2210', '#3e3318', '#55461f', '#6e5c28', '#8a7434', '#a88e44'];
const LEAF = ['#0a120d', '#101c14', '#16261a', '#1e3221', '#28402a', '#355235'];
const CABB = ['#0f1a18', '#16282a', '#203a38', '#2e4e48', '#42665a'];
const PLAST = ['#2b2630', '#3a3440', '#4a4350', '#5c5462', '#6e6674'];
const AWN = [['#3a0c14', '#5e1420', '#8a2030'], ['#2a2a12', '#46461e', '#6a6a2c'], ['#0e2230', '#163448', '#22506a']];
const flat = (W, H, ax, ay, draw) => ({ sprite: buildFrame(W, H, ax, ay, draw, { outline: false }) });
const wrap = (sprite, extra = {}) => ({ sprite, ...extra });
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// Weicher Bodenschatten / Grasfuß unter Objekten
function footShadow(p, cx, cy, rx, ry, seed) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1 || (d > 0.55 && hash2(cx + x, cy + y, seed) < 0.5)) continue;
    p.px(cx + x, cy + y, d < 0.4 ? '#0a0f0c' : GR[0]);
  }
}

// ------------------------------------------------------------ Bäume
// Tanne mit gezackten Etagen, Mondkante links, dunkler Innenseite
function fir(seed, H = 52, W = 34) {
  const rng = createRng(seed);
  const cx = Math.floor(W / 2), bottom = H - 1, top = 2;
  return mk(W, H, (p) => {
    footShadow(p, cx, bottom - 1, 10, 2, seed);
    p.rect(cx - 2, bottom - 9, 4, 9, BARK[1]); p.rect(cx - 2, bottom - 9, 1, 9, BARK[3]); p.rect(cx + 1, bottom - 9, 1, 9, BARK[0]);
    p.px(cx - 3, bottom, BARK[2]); p.px(cx + 2, bottom, BARK[0]);
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const k0 = t / tiers;
      const baseY = Math.round(bottom - 8 - (bottom - 8 - top) * k0);
      const half = (W / 2 - 2) * (1 - k0 * 0.78);
      const th = Math.round((bottom - top) / tiers) + 4;
      for (let dy = 0; dy < th; dy++) {
        const y = baseY - dy, k = dy / th;
        const hw = Math.max(0.5, half * (1 - k) ** 0.9 + rng.range(-1, 1));
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          const rel = (x - cx) / Math.max(1, hw);
          let i = 2;
          if (rel < -0.45) i = 4; else if (rel < -0.1) i = 3; else if (rel > 0.55) i = 1;
          if (dy < 2) i -= 1;
          if (hash2(x, y, seed) < 0.13) i += hash2(x, y, seed + 1) < 0.5 ? 1 : -1;
          p.px(x, y, PINE[clampI(i, 6)]);
        }
        // gezackte Zweigspitzen an der Unterkante
        if (dy === 0) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) if (hash2(x, t, seed + 2) < 0.45) p.px(x, y + 1, PINE[x < cx ? 2 : 1]);
      }
      // Mondlicht auf den linken Zweigspitzen
      for (let dy = 1; dy < th - 2; dy += 2) {
        const y = baseY - dy, hw = half * (1 - dy / th);
        p.px(Math.round(cx - hw) + 1, y, PINE[5]);
      }
    }
    p.px(cx, top - 1, PINE[4]); p.px(cx, top, PINE[3]);
  }, { ax: cx, box: [-3, -3, 3, 1], extra: { shadow: 18 } });
}

// Laubbaum (Eiche/Linde): Wolkenkrone aus Ballen mit Lichtseite oben links
function oak(seed) {
  const rng = createRng(seed);
  const W = 40, H = 46, cx = 20, bottom = H - 1;
  return mk(W, H, (p) => {
    footShadow(p, cx, bottom - 1, 13, 3, seed);
    // Stamm mit Wurzelansatz und Astgabel
    for (let y = bottom - 16; y <= bottom; y++) {
      const hw = 2 + (y > bottom - 3 ? (y - bottom + 3) : 0);
      for (let x = cx - hw; x <= cx + hw; x++) p.px(x, y, BARK[x === cx - hw ? 3 : x === cx + hw ? 0 : (x + y) % 4 === 0 ? 1 : 2]);
    }
    p.line(cx - 1, bottom - 15, cx - 7, bottom - 22, BARK[2]); p.line(cx + 1, bottom - 15, cx + 6, bottom - 23, BARK[1]);
    // Kronenballen (hinten dunkel, vorne hell)
    const balls = [];
    for (let i = 0; i < 9; i++) balls.push([cx + rng.range(-12, 12), rng.range(8, 24), rng.range(6, 9)]);
    balls.push([cx - 6, 12, 8], [cx + 6, 13, 8], [cx, 7, 8]);
    balls.sort((a, b) => a[1] - b[1]);
    for (const [bx, by, r] of balls) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = (x * x + y * y) / (r * r);
        if (d > 1 || (d > 0.8 && hash2(Math.round(bx + x), Math.round(by + y), seed) < 0.4)) continue;
        const l = (-x - y) / r; // Licht von oben links
        let i = 2 + (l > 0.55 ? 2 : l > 0.1 ? 1 : l < -0.6 ? -1 : 0);
        if (hash2(Math.round(bx + x), Math.round(by + y), seed + 1) < 0.15) i -= 1;
        p.px(bx + x, by + y, LEAF[clampI(i, 6)]);
      }
      // Blattkanten-Glanz
      for (let k = 0; k < 4; k++) p.px(Math.round(bx - r * 0.5 + k), Math.round(by - r * 0.7 + (k % 2)), LEAF[5]);
    }
    // Schatten unten in der Krone
    for (let x = 4; x < W - 4; x++) for (let y = 26; y < 31; y++) if (hash2(x, y, seed + 3) < 0.25) p.px(x, y, LEAF[0]);
  }, { ax: cx, box: [-3, -3, 3, 1], extra: { shadow: 22 } });
}

// Waldmasse: zwei bis drei Bäume hintereinander, hintere dunkler (fester Waldrand, ohne Box)
function forestClump(seed) {
  const rng = createRng(seed);
  const W = 50, H = 66, cx = 25, bottom = H - 1;
  const parts = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const back = i === 0;
    const useOak = !back && rng.chance(0.22);
    const s = useOak ? oak(seed * 7 + i).sprite : fir(seed * 13 + i, back ? 56 : rng.int(44, 54), back ? 34 : 32).sprite;
    parts.push({ s, x: back ? cx + rng.int(-6, 6) : cx + (i === 1 ? -10 : 9) + rng.int(-2, 2), y: back ? bottom - 9 : bottom - (i === 1 ? 1 : 4), back });
  }
  const sprite = buildFrame(W, H, cx, bottom - 2, (p) => {
    for (const q of parts) {
      const c = q.s.canvas;
      if (q.back) { p.ctx.filter = 'brightness(0.62)'; }
      p.ctx.drawImage(c, Math.round(q.x - q.s.ax), Math.round(q.y - q.s.ay));
      p.ctx.filter = 'none';
    }
    // Unterholz-Saum am Fuß (dunkel, damit der Waldrand geschlossen wirkt)
    for (let x = 4; x < W - 4; x++) {
      const h = 2 + Math.round(hash2(x, 1, seed) * 4);
      for (let y = bottom - h; y <= bottom - 1; y++) p.px(x, y, y < bottom - h + 1 ? PINE[2] : hash2(x, y, seed + 4) < 0.5 ? PINE[1] : PINE[0]);
    }
  }, { outline: false });
  return { sprite };
}

// ------------------------------------------------------------ Kleinkram Natur
function flowers(v) {
  const C = [['#6a5aa0', '#9a8ad0'], ['#9a4a6a', '#d07a9a'], ['#b8a050', '#e8d080']][v];
  const rng = createRng(500 + v);
  return mk(14, 8, (p) => {
    for (let i = 0; i < 7; i++) {
      const x = rng.int(1, 12), y = rng.int(2, 7);
      p.px(x, y, GR[4]); p.px(x, y - 1, GR[3]);
      if (rng.chance(0.75)) { p.px(x, y - 2, C[0]); p.px(x - 1, y - 2, C[0]); p.px(x + 1, y - 2, C[0]); p.px(x, y - 3, C[1]); }
    }
  }, { ax: 7 });
}

function reedsV(v) {
  const rng = createRng(540 + v);
  const R = ['#16200f', '#22301a', '#2e4222', '#3e5628', '#566e34'];
  return mk(16, 22, (p) => {
    const bottom = 21;
    for (let i = 0; i < 6 + v; i++) {
      const x = 2 + rng.int(0, 11), h = rng.int(8, 18), bend = rng.range(-3, 3);
      let lx = x, ly = bottom;
      for (let k = 1; k <= h; k++) { const t = k / h; lx = Math.round(x + bend * t * t); ly = bottom - k; p.px(lx, ly, R[t > 0.6 ? 3 : t > 0.3 ? 2 : 1]); }
      if (rng.chance(0.45)) { p.rect(lx, ly + 1, 2, 3, '#3a2216'); p.px(lx, ly + 1, '#5a3622'); }
    }
    for (let i = 0; i < 3; i++) { const x = 3 + rng.int(0, 9); p.line(x, bottom, x + (i % 2 ? 4 : -3), bottom - 6, R[i % 2 ? 2 : 4]); }
    p.rect(1, bottom, 14, 1, WTR[2]); p.px(4, bottom, WTR[4]);
  }, { ax: 8 });
}

function mushrooms(v) {
  return mk(10, 8, (p, g) => {
    const caps = [[2, 5], [6, 4], [8, 6]].slice(0, 2 + (v % 2));
    for (const [x, y] of caps) {
      p.px(x, y + 1, BONE[2]); p.px(x, y + 2, BONE[1]);
      p.rect(x - 1, y, 3, 1, '#2a5a5a'); p.px(x, y - 1, '#4a9a8a');
      g.rect(x - 1, y, 3, 1, '#3ac0a0'); g.px(x, y - 1, '#a0ffe0');
    }
  }, { ax: 5, light: v === 0 ? { dx: 0, dy: -4, radius: 26, color: [90, 230, 190], intensity: 0.45 } : undefined });
}

function boulder(seed) {
  const rng = createRng(seed);
  const R = OUT.rock;
  const w = 20, h = 14;
  return mk(w + 4, h + 3, (p) => {
    const cx = (w + 3) / 2, cy = h / 2 + 2;
    p.ellipse(cx, cy, w / 2, h / 2, R[2]);
    p.ellipse(cx - 1, cy - 1, w / 2 - 2, h / 2 - 2, R[3]);
    p.ellipse(cx - 3, cy - 2.5, w / 4, h / 4, R[4]);
    p.line(cx + 2, cy - h / 2 + 2, cx + 4, cy + 2, R[1]);
    p.rect(cx - w / 2 + 2, h + 1, w - 3, 1, R[1]);
    // Moospolster oben
    for (let x = Math.round(cx - w / 2) + 2; x < Math.round(cx + w / 3); x++) {
      const t = 1 - ((x - cx) / (w / 2)) ** 2; if (t <= 0) continue;
      const yt = Math.round(cy - (h / 2) * Math.sqrt(t));
      for (let d = 0; d < 2; d++) if (hash2(x, d, seed) < 0.7) p.px(x, yt + d, MOSS[2 - d]);
    }
    for (let i = 0; i < 3; i++) p.px(cx + rng.int(-6, 4), cy + rng.int(0, 3), R[1]);
  }, { ax: Math.floor((w + 4) / 2), ay: h + 2, box: [-8, -4, 8, 1] });
}

function fallenLog(v) {
  return mk(38, 16, (p) => {
    footShadow(p, 19, 13, 17, 2, 600 + v);
    const y0 = 5, y1 = 12;
    for (let x = 3; x < 34; x++) for (let y = y0; y <= y1; y++) {
      const k = (y - y0) / (y1 - y0);
      let i = k < 0.2 ? 3 : k < 0.5 ? 2 : k < 0.85 ? 1 : 0;
      if (hash2(x, y, 601) < 0.12) i -= 1;
      if ((x * 3 + y) % 7 === 0) i -= 1;
      p.px(x, y, BARK[clampI(i, 4)]);
    }
    // Schnittfläche links, abgebrochene Äste
    p.ellipse(3, 8.5, 2.6, 4, '#4a3424'); p.ellipse(3, 8.5, 1.6, 2.6, '#6a4a30'); p.px(3, 8, '#8a6a44');
    p.line(14, y0, 12, 1, BARK[2]); p.line(24, y0, 27, 2, BARK[1]);
    // Moos und Pilze
    for (let x = 6; x < 32; x++) if (hash2(x, 0, 602 + v) < 0.5) p.px(x, y0, MOSS[1 + (x % 2)]);
    if (v) { p.px(20, y0 - 1, '#c8a46a'); p.rect(19, y0 - 2, 3, 1, '#8a3a2a'); }
  }, { ax: 19, ay: 14, box: [-15, -6, 15, 0] });
}

// ------------------------------------------------------------ Felder (kachelgenau, ohne Umriss)
function wheat(v) {
  return flat(16, 18, 8, 16, (p) => {
    for (let row = 0; row < 3; row++) {
      const by = 6 + row * 5;
      for (let x = 0; x < 16; x++) {
        const h = 3 + Math.floor(hash2(x, row, 700 + v) * 3);
        for (let k = 0; k < h; k++) p.px(x, by - k, STRAW[k === h - 1 ? 5 : k > 1 ? 4 : 2 + (x % 2)]);
        if (hash2(x, row, 710 + v) < 0.35) p.px(x, by - h, STRAW[3]);
      }
      for (let x = 0; x < 16; x++) p.px(x, by + 1, DIRT[1]);
    }
  });
}
function cabbage(v) {
  return flat(16, 18, 8, 16, (p) => {
    for (let x = 0; x < 16; x++) for (let y = 2; y < 18; y++) p.px(x, y, (y % 5 === 4) ? DIRT[3] : DIRT[2]);
    for (let row = 0; row < 3; row++) {
      const by = 4 + row * 5;
      for (let i = 0; i < 3; i++) {
        const x = 2 + i * 5 + (row % 2 ? 2 : 0) + Math.round(hash2(i, row, 720 + v) * 1.5) - 1;
        if (x > 14) continue;
        p.ellipse(x, by, 2.2, 1.6, CABB[1]); p.ellipse(x - 0.5, by - 0.5, 1.4, 1, CABB[3]); p.px(x - 1, by - 1, CABB[4]); p.px(x + 1, by + 1, CABB[0]);
      }
    }
  });
}
function furrows(v) {
  return flat(16, 16, 8, 14, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = (y + (v ? 2 : 0)) % 4;
      let c = k === 0 ? DIRT[4] : k === 1 ? DIRT[3] : k === 2 ? DIRT[1] : DIRT[2];
      if (hash2(x, y, 730 + v) < 0.08) c = DIRT[0];
      p.px(x, y, c);
    }
    // junge Triebe auf den Kämmen
    for (let i = 0; i < 6; i++) { const x = Math.floor(hash2(i, 1, 731 + v) * 15), y = ((i % 4) * 4 + (v ? 2 : 0)) % 16; p.px(x, y, GR[4]); p.px(x, y - 1, GR[5]); }
  });
}

function haystack() {
  return mk(28, 24, (p) => {
    footShadow(p, 14, 21, 13, 2, 740);
    for (let y = 3; y < 22; y++) {
      const k = (y - 3) / 19, hw = Math.round(5 + Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * 7.5);
      for (let x = 14 - hw; x <= 14 + hw; x++) {
        const rel = (x - 14) / hw;
        let i = rel < -0.4 ? 4 : rel < 0.2 ? 3 : rel < 0.7 ? 2 : 1;
        if ((x + y * 2) % 5 === 0) i -= 1;
        if (hash2(x, y, 741) < 0.1) i += 1;
        p.px(x, y, STRAW[clampI(i, 6)]);
      }
    }
    // Halme, Bindeseil
    for (let i = 0; i < 9; i++) p.px(6 + i * 2, 2 + (i % 3), STRAW[5]);
    p.line(4, 13, 24, 11, '#3a2a16'); p.line(4, 14, 24, 12, STRAW[1]);
    p.line(18, 2, 22, 21, OUT.wood[2]); // Heugabel
    p.rect(17, 0, 3, 1, PAL.steel[3]); p.px(17, 1, PAL.steel[3]); p.px(19, 1, PAL.steel[3]);
  }, { ax: 14, box: [-11, -5, 11, 1] });
}

function scarecrow() {
  return mk(22, 36, (p) => {
    footShadow(p, 11, 34, 5, 1, 750);
    const Wd = OUT.wood;
    p.rect(10, 8, 2, 27, Wd[2]); p.rect(10, 8, 1, 27, Wd[3]);
    p.rect(1, 13, 20, 2, Wd[2]); p.rect(1, 13, 20, 1, Wd[3]);
    // Mantel
    poly(p, [[6, 12], [16, 12], [17, 25], [13, 23], [11, 26], [8, 23], [5, 25]], (x, y) => (x < 9 ? '#4a3a2a' : x < 14 ? '#3a2c20' : '#2a2018'));
    p.rect(1, 12, 5, 4, '#3a2c20'); p.rect(16, 12, 5, 4, '#2a2018');
    for (const x of [1, 3, 19, 20]) p.px(x, 16 + (x % 2), STRAW[4]);
    p.px(9, 18, '#5a4a36'); p.px(12, 20, '#20160e');
    // Sackkopf mit Hut
    p.ellipse(11, 8, 3.5, 3.5, '#6e5a3c'); p.px(9, 7, '#20140c'); p.px(13, 7, '#20140c'); p.line(9, 10, 13, 10, '#20140c');
    p.rect(5, 3, 13, 2, '#1e1a16'); p.rect(8, 0, 7, 4, '#26201a'); p.rect(8, 0, 7, 1, '#3a3028');
    // Krähe auf dem Arm
    p.rect(17, 10, 3, 2, '#0c0a10'); p.px(19, 9, '#0c0a10'); p.px(20, 9, '#8a6a2a');
  }, { ax: 11, box: [-2, -3, 2, 1] });
}

// ------------------------------------------------------------ Häuser
// Fachwerkhaus 3/4: Giebelseite zur Straße? Nein – Traufseite vorn, Dach nach hinten.
function cottage(kind) {
  const W = 74, H = 74, cx = 37, bottom = H - 1;
  const thatch = kind === 0;
  const Wd = OUT.wood;
  const ROOF = thatch ? STRAW : ['#100e18', ...SLATE];
  return mk(W, H, (p, g) => {
    footShadow(p, cx, bottom - 1, 34, 3, 760 + kind);
    const x0 = 8, x1 = W - 9, wallH = 26, wallTop = bottom - 4 - wallH;
    // Sockel
    p.rect(x0 - 1, bottom - 5, x1 - x0 + 3, 5, STN[2]);
    for (let x = x0; x < x1; x += 5) { p.rect(x, bottom - 5, 4, 2, STN[3]); p.px(x, bottom - 5, STN[4]); }
    // Wand: Putz mit Fachwerk (A) oder Bruchstein (B)
    for (let y = wallTop; y < bottom - 5; y++) for (let x = x0; x <= x1; x++) {
      let c;
      if (thatch) c = PLAST[1 + ((hash2(x, y, 761) < 0.12) ? 1 : 0) - (hash2(x, y, 762) < 0.06 ? 1 : 0)];
      else {
        const row = Math.floor((y - wallTop) / 4), lx = (x + (row % 2) * 3) % 7, ly = (y - wallTop) % 4;
        c = ly === 3 || lx === 0 ? STN[1] : ly === 0 ? STN[4] : STN[2 + (hash2(x >> 2, row, 763) < 0.3 ? 1 : 0)];
      }
      p.px(x, y, c);
    }
    if (thatch) {
      for (const x of [x0, x0 + 18, x1 - 18, x1 - 1]) { p.rect(x, wallTop, 2, wallH - 1, Wd[2]); p.px(x, wallTop, Wd[3]); }
      p.rect(x0, wallTop, x1 - x0 + 1, 2, Wd[3]); p.rect(x0, wallTop + 12, x1 - x0 + 1, 2, Wd[2]);
      p.line(x0 + 2, wallTop + 12, x0 + 17, wallTop + 2, Wd[1]); p.line(x1 - 17, wallTop + 2, x1 - 2, wallTop + 12, Wd[1]);
    }
    // Traufschatten
    for (let i = 0; i < 4; i++) { p.ctx.fillStyle = `rgba(6,3,10,${0.5 * (1 - i / 4)})`; p.ctx.fillRect(x0, wallTop + i, x1 - x0 + 1, 1); }
    // Tür (Mitte) mit Vordach
    const dx = cx - 5;
    p.rect(dx - 1, bottom - 22, 12, 18, Wd[1]); p.rect(dx, bottom - 21, 10, 17, Wd[2]);
    for (let x = dx + 2; x < dx + 10; x += 3) p.rect(x, bottom - 21, 1, 17, Wd[1]);
    p.px(dx + 8, bottom - 13, PAL.gold[3]);
    p.rect(dx - 2, bottom - 5, 14, 1, STN[4]);
    // Fenster mit Läden, warm erleuchtet
    for (const fx of [x0 + 7, x1 - 15]) {
      const fy = wallTop + 7;
      p.rect(fx - 1, fy - 1, 10, 10, Wd[1]); p.rect(fx, fy, 8, 8, '#3a1c0c');
      p.rect(fx + 1, fy + 1, 3, 3, PAL.ember[3]); p.rect(fx + 5, fy + 1, 2, 3, PAL.ember[2]); p.rect(fx + 1, fy + 5, 3, 2, PAL.ember[2]); p.rect(fx + 5, fy + 5, 2, 2, PAL.ember[3]);
      p.rect(fx + 4, fy, 1, 8, Wd[1]); p.rect(fx, fy + 4, 8, 1, Wd[1]);
      g.rect(fx + 1, fy + 1, 3, 3, PAL.ember[4]); g.rect(fx + 5, fy + 1, 2, 3, PAL.ember[3]); g.rect(fx + 1, fy + 5, 3, 2, PAL.ember[3]); g.rect(fx + 5, fy + 5, 2, 2, PAL.ember[4]);
      p.rect(fx - 4, fy - 1, 3, 10, kind ? '#1e3040' : '#3a2416'); p.rect(fx + 9, fy - 1, 3, 10, kind ? '#16242e' : '#2a1a10');
      p.rect(fx - 1, fy + 9, 10, 1, Wd[3]);
      // Blumenkasten
      p.rect(fx, fy + 10, 8, 2, Wd[2]); for (let i = 0; i < 4; i++) p.px(fx + 1 + i * 2, fy + 9, i % 2 ? '#9a4a6a' : '#b8a050');
    }
    // Dach
    const roofBottom = wallTop + 1, roofTop = 6;
    for (let y = roofTop; y <= roofBottom; y++) {
      const k = (y - roofTop) / (roofBottom - roofTop);
      const inset = Math.round((1 - k) * 9);
      for (let x = x0 - 5 + inset; x <= x1 + 5 - inset; x++) {
        let c;
        if (thatch) {
          const band = Math.floor((y - roofTop) / 5), lx = (x * 7 + band * 13) % 5;
          let i = 3 + (x < x0 + inset + 6 ? 1 : 0) - ((y - roofTop) % 5 === 4 ? 2 : 0) - (lx === 0 ? 1 : 0);
          if (hash2(x, y, 764) < 0.1) i -= 1;
          if (k > 0.92) i -= 1;
          c = ROOF[clampI(i, 6)];
        } else {
          const row = Math.floor((y - roofTop) / 4), lx = (x + (row % 2) * 3) % 6;
          let i = (y - roofTop) % 4 === 3 ? 0 : lx === 0 ? 1 : (y - roofTop) % 4 === 0 ? 3 : 2;
          if (x < x0 + inset) i += 1;
          if (hash2(x, y, 765) < 0.05) i = 0;
          c = ROOF[clampI(i + 1, 6)];
        }
        p.px(x, y, c);
      }
    }
    // Strohkante / Moos, First
    if (thatch) { for (let x = x0 - 5; x <= x1 + 5; x++) if (hash2(x, 1, 766) < 0.7) p.px(x, roofBottom + 1, STRAW[1]); for (let x = x0 + 4; x < x1 - 4; x += 3) if (hash2(x, 2, 767) < 0.4) p.px(x, roofTop + 8 + (x % 5), MOSS[2]); }
    p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 2, thatch ? STRAW[2] : Wd[2]); p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 1, thatch ? STRAW[5] : Wd[3]);
    // Schornstein mit Rauchöffnung
    const chx = kind ? x1 - 14 : x0 + 12;
    p.rect(chx, roofTop - 7, 7, 12, STN[2]); p.rect(chx, roofTop - 7, 2, 12, STN[4]); p.rect(chx, roofTop - 7, 7, 1, STN[5]); p.rect(chx + 1, roofTop - 7, 5, 1, '#07050a');
    // Gaube / Dachfenster bei B
    if (kind) { p.rect(cx - 5, roofTop + 10, 10, 9, Wd[1]); p.rect(cx - 4, roofTop + 11, 8, 6, '#3a1c0c'); p.rect(cx - 3, roofTop + 12, 2, 2, PAL.ember[3]); g.rect(cx - 3, roofTop + 12, 2, 2, PAL.ember[4]); p.rect(cx - 6, roofTop + 8, 12, 2, SLATE[3]); }
  }, { ax: cx, box: [-28, -22, 28, 1], extra: { smoke: { dx: kind ? 17 : -14, dy: -74, rate: 2 } } });
}

function marketStall(kind) {
  const W = 42, H = 40, cx = 21, bottom = H - 1;
  const A = AWN[kind % AWN.length], Wd = OUT.wood;
  return mk(W, H, (p) => {
    footShadow(p, cx, bottom - 1, 19, 2, 780 + kind);
    // Pfosten
    for (const x of [3, W - 5]) { p.rect(x, 8, 2, bottom - 8, Wd[2]); p.px(x, 8, Wd[3]); }
    // Theke
    p.rect(2, bottom - 12, W - 4, 11, Wd[2]); p.rect(2, bottom - 12, W - 4, 2, Wd[4]); p.rect(2, bottom - 2, W - 4, 1, Wd[0]);
    for (let x = 5; x < W - 4; x += 6) p.rect(x, bottom - 10, 1, 8, Wd[1]);
    // Waren
    const goods = kind === 0
      ? [[7, '#5a2a18', '#8a4a2a'], [13, '#6e5a28', '#a88e44'], [19, '#203a38', '#42665a'], [25, '#5a2a18', '#a86a3a'], [31, '#7a1a26', '#d0454a'], [36, '#6e5a28', '#a88e44']]
      : [[7, '#2d3548', '#6d7a94'], [12, '#48526a', '#a3b0c6'], [18, '#4d3326', '#6b4a34'], [24, '#2d3548', '#a3b0c6'], [30, '#4a2f10', '#b8862a'], [36, '#33211a', '#6b4a34']];
    for (const [x, c0, c1] of goods) { p.ellipse(x, bottom - 14, 2.6, 2, c0); p.px(x - 1, bottom - 15, c1); p.px(x, bottom - 16, c1); }
    // Körbe/Fässer davor
    p.ellipse(8, bottom - 1, 4, 2.4, Wd[1]); p.ellipse(8, bottom - 2, 3, 1.4, kind ? '#48526a' : '#6e5a28');
    // Markise gestreift mit Zacken
    for (let y = 2; y < 11; y++) {
      const inset = Math.round((10 - y) * 0.4);
      for (let x = 1 + inset; x < W - 1 - inset; x++) {
        const stripe = Math.floor((x - 1) / 5) % 2;
        let c = stripe ? A[2] : '#8a7a5a';
        if (y < 4) c = stripe ? A[1] : '#6a5c44';
        if (y === 10) c = stripe ? A[0] : '#4a4030';
        p.px(x, y, c);
      }
    }
    for (let x = 1; x < W - 1; x++) if (x % 5 === 2) { p.px(x, 11, Math.floor((x - 1) / 5) % 2 ? A[1] : '#6a5c44'); p.px(x + 1, 11, Math.floor((x - 1) / 5) % 2 ? A[1] : '#6a5c44'); }
    p.rect(1, 1, W - 2, 1, A[0]);
  }, { ax: cx, box: [-19, -10, 19, 1] });
}

// ------------------------------------------------------------ Mühle (Fachwerkhaus mit Wasserrad links)
function watermill() {
  const W = 104, H = 86, ax = 60, bottom = H - 1;
  const Wd = OUT.wood;
  return mk(W, H, (p, g) => {
    // Haus (rechts vom Anker)
    const x0 = 36, x1 = 96, wallH = 30, wallTop = bottom - 5 - wallH;
    footShadow(p, 66, bottom - 1, 30, 3, 800);
    p.rect(x0 - 2, bottom - 6, x1 - x0 + 5, 6, STN[2]);
    for (let x = x0 - 2; x < x1 + 2; x += 5) { p.rect(x, bottom - 6, 4, 2, STN[3]); p.rect(x + 2, bottom - 3, 4, 2, STN[3]); p.px(x, bottom - 6, STN[4]); }
    for (let y = wallTop; y < bottom - 6; y++) for (let x = x0; x <= x1; x++) {
      const plank = Math.floor((x - x0) / 4), e = (x - x0) % 4;
      let c = Wd[e === 0 ? 1 : 2 + (hash2(plank, 0, 801) < 0.35 ? 1 : 0)];
      if (hash2(x, y >> 2, 802) < 0.04) c = Wd[1];
      p.px(x, y, c);
    }
    for (let i = 0; i < 5; i++) { p.ctx.fillStyle = `rgba(6,3,10,${0.5 * (1 - i / 5)})`; p.ctx.fillRect(x0, wallTop + i, x1 - x0 + 1, 1); }
    p.rect(x0, wallTop + 14, x1 - x0 + 1, 2, Wd[3]); p.rect(x0, wallTop + 14, x1 - x0 + 1, 1, Wd[4]);
    // Tor mit Mehlsäcken, Fenster
    p.rect(70, bottom - 26, 16, 20, Wd[0]); p.rect(71, bottom - 25, 14, 19, '#140c0a');
    p.line(71, bottom - 25, 84, bottom - 7, Wd[2]); p.line(84, bottom - 25, 71, bottom - 7, Wd[1]);
    p.rect(70, bottom - 26, 16, 2, Wd[3]);
    for (const [sx, sy] of [[88, bottom - 9], [91, bottom - 8], [89, bottom - 13]]) { p.ellipse(sx, sy, 3, 2.6, '#8a8070'); p.px(sx - 1, sy - 2, '#b8ae98'); p.px(sx + 1, sy + 1, '#5a5446'); }
    for (const fx of [44, 58]) {
      const fy = wallTop + 5;
      p.rect(fx - 1, fy - 1, 9, 8, Wd[1]); p.rect(fx, fy, 7, 6, '#3a1c0c'); p.rect(fx + 1, fy + 1, 2, 2, PAL.ember[3]); p.rect(fx + 4, fy + 3, 2, 2, PAL.ember[2]); p.rect(fx + 3, fy, 1, 6, Wd[1]);
      g.rect(fx + 1, fy + 1, 2, 2, PAL.ember[4]); g.rect(fx + 4, fy + 3, 2, 2, PAL.ember[3]);
    }
    // Schieferdach mit Giebel nach links (zum Rad)
    const roofBottom = wallTop + 1, roofTop = 8;
    for (let y = roofTop; y <= roofBottom; y++) {
      const k = (y - roofTop) / (roofBottom - roofTop), inset = Math.round((1 - k) * 8);
      for (let x = x0 - 4 + inset; x <= x1 + 4 - inset; x++) {
        const row = Math.floor((y - roofTop) / 4), lx = (x + (row % 2) * 3) % 6;
        let i = (y - roofTop) % 4 === 3 ? 0 : lx === 0 ? 1 : (y - roofTop) % 4 === 0 ? 3 : 2;
        if (x < x0 + inset + 3) i += 1;
        if (hash2(x, y, 803) < 0.05) i = 0;
        p.px(x, y, SLATE[clampI(i, 5)]);
      }
    }
    for (let x = x0 + 6; x < x1 - 6; x += 4) if (hash2(x, 3, 804) < 0.5) p.px(x, roofTop + 6 + (x % 7), MOSS[1]);
    p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 2, Wd[2]); p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 1, Wd[4]);
    // Schornstein, Mehlstaub
    p.rect(84, roofTop - 6, 6, 10, STN[2]); p.rect(84, roofTop - 6, 2, 10, STN[4]); p.rect(85, roofTop - 6, 4, 1, '#07050a');
    // Achse und Wasserrad (vor dem Haus links, über dem Bach)
    const wx = 20, wy = bottom - 22, R = 18;
    p.rect(wx, wy - 2, x0 - wx + 2, 4, Wd[1]); p.rect(wx, wy - 2, x0 - wx + 2, 1, Wd[3]);
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.5) continue;
      if (d > R - 2.5) p.px(wx + x, wy + y, d > R - 0.8 ? Wd[1] : (x + y < 0 ? Wd[4] : Wd[2]));
      else if (d > R - 4 && Math.abs(Math.atan2(y, x) * 12 / Math.PI % 1) < 0.25) p.px(wx + x, wy + y, Wd[1]);
    }
    // Schaufeln
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      const c = Math.cos(a), s = Math.sin(a);
      p.line(wx + c * (R - 2), wy + s * (R - 2), wx + c * (R + 3), wy + s * (R + 3), i < 6 ? Wd[3] : Wd[2]);
      p.line(wx + c * 3, wy + s * 3, wx + c * (R - 2), wy + s * (R - 2), Wd[1]);
    }
    p.ellipse(wx, wy, 3, 3, Wd[2]); p.px(wx - 1, wy - 1, Wd[4]); p.px(wx, wy, PAL.steel[3]);
    // Wasser unter dem Rad: Gischt
    for (let i = 0; i < 26; i++) {
      const x = wx - 14 + Math.floor(hash2(i, 1, 805) * 30), y = wy + R - 3 + Math.floor(hash2(i, 2, 805) * 6);
      p.px(x, y, hash2(i, 3, 805) < 0.4 ? '#8aa0bc' : WTR[4]);
    }
    for (let x = wx - 16; x < wx + 18; x++) p.px(x, wy + R + 3, WTR[3]);
    // Lampe am Tor
    p.rect(66, bottom - 30, 3, 4, '#3a2410'); p.px(67, bottom - 29, PAL.ember[4]); g.px(67, bottom - 29, PAL.ember[5]); g.px(67, bottom - 28, PAL.ember[4]);
  }, { ax, box: [-26, -20, 36, 1], light: { dx: 7, dy: -30, radius: 70, color: [255, 170, 90], intensity: 0.8 }, extra: { smoke: { dx: 27, dy: -83, rate: 2 } } });
}

// ------------------------------------------------------------ Brücken (Segmente, ohne Umriss)
// Ost–West-Brücke über den Bach: Anker in der Zeile über dem Steg (Geländer), Sprite reicht
// über zwei Stegzeilen bis zur Stirnbohle. end: -1 linkes Widerlager, 0 Mitte, 1 rechtes.
function bridgeSeg(end, light = false) {
  const Wd = OUT.wood, W = 16, H = 56;
  return flat(W, H, 8, 14, (p) => {
    // oben: Wasserschatten unter dem hinteren Geländer (Mitte) bzw. Uferstein (Enden)
    for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) {
      if (end) p.px(x, y, (hash2(x, y, 820) < 0.5 ? STN[2] : STN[3]));
      else p.px(x, y, y < 3 && hash2(x, y, 821) < 0.3 ? WTR[3] : (x + y) % 5 === 0 ? WTR[1] : WTR[0]);
    }
    // Deck: Querbohlen (senkrecht zur Laufrichtung)
    const d0 = 12, d1 = 47;
    for (let x = 0; x < W; x++) {
      const plank = Math.floor((x + (end > 0 ? 1 : 0)) / 4), e = (x + (end > 0 ? 1 : 0)) % 4;
      for (let y = d0; y <= d1; y++) {
        let c = e === 3 ? Wd[0] : Wd[2 + (hash2(plank, 0, 822 + end) < 0.4 ? 1 : 0)];
        if (e === 0) c = Wd[3];
        if (hash2(x, y, 823) < 0.04) c = Wd[1];
        if ((y === 18 || y === 41) && e === 1) c = PAL.steel[2]; // Nägel
        p.px(x, y, c);
      }
    }
    p.rect(0, d0 - 2, W, 2, Wd[3]); p.rect(0, d0 - 2, W, 1, Wd[4]);       // hintere Längsbohle
    p.rect(0, d1 + 1, W, 2, Wd[3]); p.rect(0, d1 + 3, W, 4, Wd[1]);       // Stirnbohle vorn
    p.rect(0, d1 + 3, W, 1, Wd[2]);
    // hinteres Geländer: Pfosten + Handlauf
    const postX = end < 0 ? 2 : end > 0 ? 12 : 7;
    p.rect(postX, 0, 3, d0, Wd[2]); p.rect(postX, 0, 1, d0, Wd[4]); p.px(postX + 1, 0, Wd[4]);
    p.rect(0, 3, W, 2, Wd[3]); p.rect(0, 3, W, 1, Wd[4]); p.rect(0, 7, W, 1, Wd[1]);
    // vordere Kante: niedriger Bordbalken mit Pfosten
    p.rect(0, d1 - 2, W, 2, Wd[3]); p.rect(0, d1 - 2, W, 1, Wd[5] ?? Wd[4]);
    p.rect(postX, d1 - 6, 3, 6, Wd[2]); p.rect(postX, d1 - 6, 1, 6, Wd[4]);
    if (end) {
      // Widerlager: Steinpfeiler mit Laterne
      p.rect(postX - 1, 0, 5, 3, STN[4]);
      if (light) { p.rect(postX, -0 + 0, 3, 2, '#3a2410'); }
    }
  });
}

// schmaler Mühlsteg: ein Handlauf, grobe Bohlen
function footbridgeSeg(end) {
  const Wd = OUT.wood, W = 16, H = 52;
  return flat(W, H, 8, 14, (p) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < W; x++) {
      if (end) p.px(x, y, hash2(x, y, 830) < 0.6 ? GR[1] : GR[2]);
      else p.px(x, y, (x + y) % 6 === 0 ? WTR[1] : WTR[0]);
    }
    for (let x = 0; x < W; x++) for (let y = 14; y <= 44; y++) {
      const e = (x + 2) % 5;
      let c = e === 4 ? Wd[0] : e === 0 ? Wd[3] : Wd[2];
      if (hash2(x, y, 831) < 0.05) c = Wd[1];
      p.px(x, y, c);
    }
    p.rect(0, 45, W, 3, Wd[1]); p.rect(0, 45, W, 1, Wd[2]);
    p.rect(0, 12, W, 2, Wd[1]);
    const postX = end < 0 ? 3 : end > 0 ? 11 : 6;
    p.rect(postX, 2, 2, 12, Wd[2]); p.px(postX, 2, Wd[4]);
    p.rect(0, 5, W, 1, Wd[3]); p.rect(0, 6, W, 1, Wd[1]);
  });
}

// ------------------------------------------------------------ Friedhof
function graveNew(v) {
  return mk(16, 22, (p) => {
    footShadow(p, 8, 20, 6, 1, 840 + v);
    if (v === 0) {
      // Keltenkreuz mit Ring
      p.rect(7, 2, 3, 18, STN[3]); p.rect(3, 6, 11, 3, STN[3]); p.rect(7, 2, 1, 18, STN[4]); p.rect(3, 6, 11, 1, STN[4]);
      for (let a = 0; a < 16; a++) { const x = 8.5 + Math.cos(a / 16 * Math.PI * 2) * 4, y = 7.5 + Math.sin(a / 16 * Math.PI * 2) * 4; p.px(x, y, a < 8 ? STN[2] : STN[4]); }
      p.rect(5, 18, 7, 3, STN[2]); p.rect(5, 18, 7, 1, STN[4]);
    } else if (v === 1) {
      // schiefer Stein, halb im Boden
      poly(p, [[4, 8], [11, 5], [13, 19], [5, 20]], (x, y) => (x < 7 ? STN[4] : x < 11 ? STN[3] : STN[2]));
      p.line(6, 11, 10, 9, STN[1]); p.line(6, 14, 11, 12, STN[1]);
      for (let i = 0; i < 6; i++) p.px(4 + i * 2, 19 - (i % 2), MOSS[1 + (i % 2)]);
    } else {
      // Obelisk
      poly(p, [[6, 3], [10, 3], [11, 18], [5, 18]], (x, y) => (x < 7 ? STN[4] : x < 9 ? STN[3] : STN[2]));
      p.rect(7, 1, 2, 2, STN[4]); p.rect(4, 18, 9, 3, STN[2]); p.rect(4, 18, 9, 1, STN[4]);
      p.px(8, 9, STN[1]); p.px(7, 10, STN[1]); p.px(8, 11, STN[1]);
    }
    p.px(5, 20, MOSS[2]); p.px(11, 20, MOSS[1]);
  }, { ax: 8, box: [-5, -3, 5, 1], extra: { low: true } });
}

function mausoleum() {
  const W = 52, H = 56, cx = 26, bottom = H - 1;
  return mk(W, H, (p, g) => {
    footShadow(p, cx, bottom - 1, 24, 2, 850);
    // Stufen
    p.rect(6, bottom - 3, W - 12, 3, STN[2]); p.rect(6, bottom - 3, W - 12, 1, STN[4]);
    // Korpus aus Quadern
    for (let y = 18; y < bottom - 3; y++) for (let x = 8; x < W - 8; x++) {
      const row = Math.floor((y - 18) / 5), lx = (x + (row % 2) * 4) % 8, ly = (y - 18) % 5;
      let c = ly === 4 || lx === 0 ? STN[1] : ly === 0 ? STN[4] : STN[2 + (hash2(x >> 3, row, 851) < 0.3 ? 1 : 0)];
      if (x < 11) c = STN[Math.min(5, STN.indexOf(c) + 1)];
      p.px(x, y, c);
    }
    // Giebeldach
    poly(p, [[4, 20], [cx, 4], [W - 4, 20]], (x, y) => (x < cx ? STN[4] : STN[2]));
    p.line(4, 20, cx, 4, STN[5]); p.line(cx, 4, W - 4, 20, STN[1]); p.rect(4, 20, W - 8, 2, STN[1]);
    // Tür mit Gitter, fahles Licht
    p.rect(cx - 7, 28, 14, bottom - 31, '#07060a');
    for (let x = cx - 6; x < cx + 7; x += 3) p.rect(x, 28, 1, bottom - 31, PAL.steel[2]);
    p.rect(cx - 7, 34, 14, 1, PAL.steel[2]);
    p.rect(cx - 8, 26, 16, 2, STN[4]);
    for (let y = 36; y < bottom - 4; y++) if (y % 2) { g.px(cx - 2, y, '#5a4a9a'); g.px(cx + 2, y, '#4a3a8a'); }
    // Schädel-Relief im Giebel, Urnen
    p.rect(cx - 2, 11, 5, 4, BONE[3]); p.px(cx - 1, 12, '#140808'); p.px(cx + 1, 12, '#140808'); p.rect(cx - 1, 15, 3, 1, BONE[2]);
    for (const x of [5, W - 9]) { p.ellipse(x + 2, bottom - 6, 2.5, 3, STN[3]); p.px(x + 1, bottom - 8, STN[5]); p.rect(x + 1, bottom - 10, 3, 1, STN[2]); }
    // Efeu
    for (let i = 0; i < 40; i++) { const x = 8 + Math.floor(hash2(i, 1, 852) * 10), y = 20 + Math.floor(hash2(i, 2, 852) * 30); p.px(x, y, MOSS[1 + (i % 2)]); }
  }, { ax: cx, box: [-18, -12, 18, 1], light: { dx: 0, dy: -14, radius: 40, color: [130, 110, 230], intensity: 0.45 } });
}

// ------------------------------------------------------------ Steinkreis, Höhle
function standingStone(v) {
  const H = [30, 34, 26][v];
  return mk(16, H, (p, g) => {
    const bottom = H - 1;
    footShadow(p, 8, bottom - 1, 6, 1, 860 + v);
    poly(p, [[3, bottom], [4, 6], [7, 1], [11, 3], [13, bottom]], (x, y) => {
      let i = x < 6 ? 4 : x < 9 ? 3 : x < 11 ? 2 : 1;
      if (hash2(x, y, 861 + v) < 0.08) i -= 1;
      if ((y + v * 3) % 9 === 0 && x > 5) i -= 1;
      return OUT.rock[clampI(i, 6)];
    });
    for (let y = bottom - 6; y < bottom; y++) for (let x = 3; x < 13; x++) if (hash2(x, y, 862) < 0.35) p.px(x, y, MOSS[1 + (x % 2)]);
    // Glutrune
    const ry = 9 + v * 2;
    for (const [dx, dy] of [[0, 0], [1, 1], [0, 2], [1, 3], [2, 2], [0, 4]]) { p.px(7 + dx, ry + dy, PAL.ember[2]); g.px(7 + dx, ry + dy, PAL.ember[4]); }
  }, { ax: 8, box: [-5, -3, 5, 1] });
}

function caveMouth() {
  const W = 46, H = 38, cx = 23, bottom = H - 1;
  return mk(W, H, (p, g) => {
    const R = OUT.rock;
    // Felsrahmen
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = ((x - cx) / 22) ** 2 + ((y - bottom) / 36) ** 2;
      if (e > 1) continue;
      let i = 2 + (x < cx - 8 ? 1 : 0) + (hash2(x >> 1, y >> 1, 870) < 0.2 ? 1 : 0) - (x > cx + 10 ? 1 : 0);
      p.px(x, y, R[clampI(i, 6)]);
    }
    // Öffnung
    for (let y = 8; y <= bottom; y++) for (let x = 0; x < W; x++) {
      const e = ((x - cx) / 13) ** 2 + ((y - bottom) / 29) ** 2;
      if (e > 1) continue;
      p.px(x, y, e > 0.8 ? '#0c0a10' : '#040306');
    }
    // Glutschimmer aus der Tiefe
    for (let y = bottom - 8; y <= bottom; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      if ((x + y) % 3) continue;
      const k = 1 - Math.abs(x - cx) / 9;
      p.px(x, y, PAL.ember[k > 0.6 ? 1 : 0]); g.px(x, y, PAL.ember[k > 0.6 ? 2 : 1]);
    }
    // Moos, Wurzeln über dem Eingang
    for (let x = cx - 14; x < cx + 14; x++) { const t = 1 - ((x - cx) / 14) ** 2; const y = Math.round(bottom - 29 * Math.sqrt(Math.max(0, t))) - 1; p.px(x, y, MOSS[2]); if (hash2(x, 0, 871) < 0.3) p.line(x, y, x, y + 3 + (x % 3), BARK[2]); }
    for (let i = 0; i < 3; i++) p.px(cx - 6 + i * 6, bottom - 1, BONE[2]);
  }, { ax: cx, ay: H - 1, light: { dx: 0, dy: -6, radius: 50, color: [255, 120, 50], intensity: 0.5 } });
}

// ------------------------------------------------------------ Dorfkleinkram
function woodpile() {
  const Wd = OUT.wood;
  return mk(30, 20, (p) => {
    footShadow(p, 15, 18, 14, 1, 880);
    const logs = [[6, 15], [13, 15], [20, 15], [26, 15], [9.5, 10], [16.5, 10], [23, 10], [13, 5], [20, 5]];
    for (const [x, y] of logs) { p.rect(x - 3, y - 5, 7, 5, Wd[2]); p.rect(x - 3, y - 5, 7, 1, Wd[3]); }
    for (const [x, y] of logs) { p.ellipse(x, y, 3.2, 2.8, Wd[1]); p.ellipse(x, y, 2.4, 2, '#8a6a44'); p.px(x, y, '#6a4a2c'); p.px(x - 1, y - 1, '#b8945c'); }
    p.rect(0, 0, 30, 2, SLATE[2]); p.rect(0, 0, 30, 1, SLATE[3]); p.rect(1, 2, 2, 16, Wd[2]); p.rect(27, 2, 2, 16, Wd[1]);
  }, { ax: 15, box: [-13, -5, 13, 1] });
}

function farmCart() {
  const Wd = OUT.wood, I = PAL.steel;
  return mk(42, 30, (p) => {
    footShadow(p, 20, 28, 18, 2, 890);
    p.line(33, 19, 41, 25, Wd[2]); p.line(33, 20, 41, 26, Wd[1]);
    p.ellipse(28, 21, 6, 6.5, Wd[0]);
    p.rect(3, 12, 31, 8, Wd[2]); for (let x = 3; x < 34; x += 5) p.rect(x, 12, 1, 8, Wd[1]);
    p.rect(3, 12, 31, 1, Wd[4]); p.rect(3, 19, 31, 1, Wd[0]);
    // Heuladung
    for (let y = 2; y < 13; y++) for (let x = 4; x < 33; x++) {
      const e = ((x - 18) / 15) ** 2 + ((y - 12) / 10) ** 2; if (e > 1) continue;
      let i = 3 + (x < 12 ? 1 : 0) - (x > 26 ? 1 : 0) - ((x + y * 2) % 5 === 0 ? 1 : 0); p.px(x, y, STRAW[clampI(i, 6)]);
    }
    for (let i = 0; i < 6; i++) p.px(6 + i * 4, 2 + (i % 2) * 2, STRAW[5]);
    const wx = 13, wy = 21;
    p.ellipse(wx, wy, 7, 7, I[1]); p.ellipse(wx, wy, 6, 6, Wd[2]); p.ellipse(wx, wy, 5, 5, '#0d0a0c');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.line(wx, wy, wx + Math.cos(a) * 5, wy + Math.sin(a) * 5, i < 4 ? Wd[2] : Wd[3]); }
    p.ellipse(wx, wy, 1.5, 1.5, Wd[4]);
  }, { ax: 20, box: [-16, -5, 14, 1] });
}

function signpost() {
  const Wd = OUT.wood;
  return mk(30, 34, (p) => {
    footShadow(p, 14, 32, 5, 1, 900);
    p.rect(13, 4, 3, 29, Wd[2]); p.rect(13, 4, 1, 29, Wd[4]); p.px(14, 3, Wd[3]);
    const board = (y, dir, len, c) => {
      const x0 = dir > 0 ? 15 : 14 - len;
      p.rect(x0, y, len, 5, c); p.rect(x0, y, len, 1, Wd[4]); p.rect(x0, y + 4, len, 1, Wd[1]);
      const tip = dir > 0 ? x0 + len : x0 - 1;
      p.px(tip, y + 1, c); p.px(tip, y + 2, c); p.px(tip, y + 3, c); p.px(tip + dir, y + 2, c);
      for (let i = 2; i < len - 2; i += 2) p.px(x0 + i, y + 2, Wd[1]);
    };
    board(6, 1, 12, Wd[3]); board(13, -1, 11, Wd[3]); board(20, 1, 10, Wd[2]);
    p.rect(13, 30, 4, 3, STN[3]); p.px(12, 32, STN[2]); p.px(17, 32, STN[2]);
  }, { ax: 14, box: [-2, -3, 2, 1], extra: { sign: true } });
}

// Flammen-Frames fürs Lagerfeuer (eigene, da der Satz ohne Requisiten auskommt)
function flameFrames() {
  const E = PAL.ember, out = [];
  for (let f = 0; f < 6; f++) {
    const c = new PixelCanvas(12, 16);
    for (let k = 0; k < 3; k++) {
      const bx = 3 + k * 3, h = 9 + Math.round(Math.sin(f * 1.3 + k * 2.1) * 3) + (k === 1 ? 3 : 0);
      for (let i = 0; i < h; i++) {
        const sway = Math.round(Math.sin(f * 0.9 + i * 0.6 + k) * (i / h) * 1.6);
        const w = Math.max(1, Math.round((1 - i / h) * 2.4));
        const col = i < 2 ? E[5] : i < h * 0.45 ? E[4] : i < h * 0.75 ? E[3] : E[2];
        c.rect(bx + sway - (w >> 1), 15 - i, w, 1, col);
      }
    }
    out.push(c.canvas);
  }
  return out;
}

function campfireV() {
  const base = createCampfire();
  return { sprite: base, box: [-8, -3, 8, 2], low: true, flames: flameFrames(), flameAt: { dx: -6, dy: -17 }, light: { dx: 0, dy: -8, radius: 130, color: [255, 140, 60], intensity: 1, flicker: 0.3, bloom: 0.4 }, embers: { dx: 0, dy: -10, rate: 5 } };
}

function lampV() {
  const s = createLamp();
  const gl = new PixelCanvas(s.canvas.width, s.canvas.height);
  gl.rect(4, 3, 3, 3, PAL.ember[4]); gl.px(5, 4, PAL.ember[5]);
  return { sprite: s, glow: gl.canvas, box: [-2, -2, 2, 1], shadow: 8, light: { dx: 0, dy: -26, radius: 78, color: [255, 170, 90], intensity: 0.9, flicker: 0.12, bloom: 0.35 } };
}

function barrelSacks() {
  const Wd = OUT.wood;
  return mk(20, 16, (p) => {
    footShadow(p, 10, 14, 9, 1, 910);
    p.rect(2, 2, 9, 13, Wd[2]); p.rect(2, 2, 3, 13, Wd[3]); p.rect(10, 3, 1, 12, Wd[1]);
    p.rect(1, 5, 11, 1, PAL.steel[1]); p.rect(1, 11, 11, 1, PAL.steel[1]); p.ellipse(6.5, 2, 4.5, 1.2, Wd[4]);
    p.ellipse(15, 11, 4, 4, '#8a8070'); p.px(13, 8, '#b8ae98'); p.px(16, 14, '#5a5446'); p.rect(14, 7, 2, 1, '#5a5446');
  }, { ax: 10, box: [-8, -4, 8, 1] });
}

// Bohlensteg über den Weiher (Nord–Süd): Anker in der Kachel darüber, Sprite deckt die Kachel darunter
function boardwalkSeg(v) {
  const Wd = OUT.wood;
  return flat(32, 16, 8, -2, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      if (x < 2 || x > 29) { p.px(x, y, (y + v) % 8 < 2 ? Wd[1] : WTR[1]); continue; }
      const plank = Math.floor((y + v) / 4), e = (y + v) % 4;
      let c = e === 3 ? Wd[0] : e === 0 ? Wd[3] : Wd[2 + (hash2(plank, 0, 920 + v) < 0.3 ? 1 : 0)];
      if (hash2(x, y, 921 + v) < 0.04) c = Wd[1];
      p.px(x, y, c);
    }
    p.rect(2, 0, 1, 16, Wd[4]); p.rect(29, 0, 1, 16, Wd[1]);
    if (v === 0) { p.rect(0, 2, 3, 6, Wd[3]); p.rect(29, 2, 3, 6, Wd[1]); }
  });
}

// ------------------------------------------------------------ Runde 5: Questobjekte
// Feuerstein: Basaltsäule mit eiserner Feuerschale (kalt / entzündet)
function beacon(on) {
  const W = 26, H = 54, cx = 13, b = H - 1;
  return mk(W, H, (p, g) => {
    footShadow(p, cx, b - 1, 11, 2, 1501);
    // Sockel aus drei Steinen
    for (const [x, y, r] of [[5, b - 2, 3.4], [21, b - 2, 3.2], [13, b - 1, 4]]) { p.ellipse(x, y, r, r * 0.6, BASALT[2]); p.px(Math.round(x - 1), Math.round(y - 1), BASALT[4]); }
    // Säule
    for (let y = 16; y < b - 2; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const t = (x - (cx - 4)) / 8;
      let i = t < 0.25 ? 4 : t < 0.6 ? 3 : 2;
      if (y % 6 === 0) i -= 1;
      if (hash2(x, y, 1502) < 0.08) i -= 1;
      p.px(x, y, BASALT[clampI(i, 6)]);
    }
    // eingeritzte Glutrune
    for (const [x, y] of [[cx, 24], [cx, 25], [cx - 1, 26], [cx + 1, 26], [cx, 27], [cx, 28], [cx - 1, 30], [cx + 1, 30]]) {
      p.px(x, y, on ? EMB[4] : BASALT[0]);
      if (on) g.px(x, y, EMB[5]);
    }
    // Feuerschale
    p.rect(cx - 8, 13, 17, 3, IRON[1]); p.rect(cx - 8, 13, 17, 1, IRON[3]); p.rect(cx - 6, 16, 13, 1, IRON[0]);
    p.px(cx - 9, 12, IRON[2]); p.px(cx + 9, 12, IRON[1]);
    if (!on) {
      // kalte Kohle, Asche
      p.ellipse(cx, 12, 6, 1.6, '#1a1517'); p.px(cx - 2, 11, '#2c2629'); p.px(cx + 2, 11, '#3a3336'); p.px(cx, 11, '#221d1f');
    } else {
      // Flammen
      const fl = [[0, 12, 2.6], [-3, 9, 2], [3, 8, 2], [0, 5, 1.6], [-1, 2, 1], [2, 3, 0.9]];
      for (const [dx, y, r] of fl) { p.ellipse(cx + dx, y, r, r * 1.3, EMB[3]); g.ellipse(cx + dx, y, r + 0.6, r * 1.4, EMB[4]); }
      for (const [dx, y] of [[0, 10], [-2, 8], [2, 7], [0, 6]]) { p.px(cx + dx, y, EMB[5]); g.px(cx + dx, y, '#fff2c0'); }
      p.ellipse(cx, 12, 6, 1.4, EMB[2]);
    }
  }, { ax: cx, ay: b - 1, box: [-6, -3, 6, 1], light: on ? { dx: 0, dy: -36, radius: 150, color: [255, 140, 60], intensity: 1 } : undefined, extra: on ? { embers: { dx: 0, dy: -38, rate: 7 } } : undefined });
}

// Dorfbrunnen mit Reinsalz-Schimmer (Questobjekt: off = normal, on = gesegnet)
function saltWell(on) {
  const s = createWell();
  const e = { sprite: s, box: [-11, -9, 11, 1] };
  if (on) {
    const gl = new PixelCanvas(s.canvas.width, s.canvas.height);
    for (let i = 0; i < 14; i++) { const x = 5 + Math.floor(hash2(i, 1, 1511) * 16), y = 21 + Math.floor(hash2(i, 2, 1511) * 3); gl.px(x, y, i % 3 ? '#cfe8ff' : '#ffffff'); }
    for (let i = 0; i < 6; i++) gl.px(6 + i * 2, 12 - (i % 2), '#e8f4ff');
    e.glow = gl.canvas;
    e.light = { dx: 0, dy: -12, radius: 70, color: [190, 220, 255], intensity: 0.7 };
  }
  return e;
}

export function createValleyDecor() {
  return {
    valleyPines: [fir(1201, 52), fir(1207, 46), fir(1213, 56), oak(1219), wrap(createPine(7), { box: [-3, -3, 3, 1], shadow: 18 })],
    forestPines: [forestClump(31), forestClump(37), forestClump(41), forestClump(43), forestClump(47)],
    oaks: [oak(1301), oak(1307)],
    deadTrees: [5, 9, 13].map((s) => wrap(createDeadTree(s), { box: [-3, -3, 3, 1], shadow: 16 })),
    rocks: [wrap(createRock(2), { box: [-6, -5, 6, 1], low: true }), wrap(createRock(6), { box: [-6, -5, 6, 1], low: true }), boulder(1401), boulder(1403)],
    bushes: [1, 2, 3].map((s) => wrap(createBush(s), { shadow: 12 })),
    flowers: [0, 1, 2].map(flowers),
    reeds: [0, 1, 2].map(reedsV),
    mushrooms: [0, 1, 2].map(mushrooms),
    fallenLog: [fallenLog(0), fallenLog(1)],
    fenceH: wrap(createFence(false), { low: true, box: [-8, -3, 8, 1] }),
    fenceV: wrap(createFence(true), { low: true }),
    graves: [...[1, 2, 3, 4].map((s) => wrap(createGrave(s), { box: [-5, -3, 5, 1], low: true })), graveNew(0), graveNew(1), graveNew(2)],
    mausoleum: mausoleum(),
    lamp: lampV(),
    campfire: campfireV(),
    well: wrap(createWell(), { box: [-11, -9, 11, 1] }),
    crates: [wrap(createCrate(0), { box: [-6, -4, 6, 1], low: true, shadow: 12 }), wrap(createCrate(1), { box: [-6, -4, 6, 1], low: true, shadow: 12 }), barrelSacks()],
    signpost: signpost(),
    watermill: watermill(),
    bridgeL: bridgeSeg(-1), bridgeM: [bridgeSeg(0)], bridgeR: bridgeSeg(1),
    footbridgeL: footbridgeSeg(-1), footbridgeM: footbridgeSeg(0), footbridgeR: footbridgeSeg(1),
    boardwalk: [boardwalkSeg(0), boardwalkSeg(1), boardwalkSeg(2)],
    wheatField: [wheat(0), wheat(1), wheat(2)],
    cabbageField: [cabbage(0), cabbage(1)],
    furrowField: [furrows(0), furrows(1)],
    haystack: haystack(),
    scarecrow: scarecrow(),
    cottage: cottage(0),
    cottageB: cottage(1),
    marketStall: [marketStall(0), marketStall(1), marketStall(2)],
    woodpile: woodpile(),
    farmCart: farmCart(),
    standingStones: [0, 1, 2].map(standingStone),
    caveMouth: caveMouth(),
    beacon: { off: beacon(false), on: beacon(true) },
    saltWell: { off: saltWell(false), on: saltWell(true) },
  };
}
