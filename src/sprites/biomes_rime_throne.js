import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { createRng } from '../core/math.js';

// Kacheln, Flüssigkeiten und Deko für zwei Dungeons der Runde 3:
//   'rime'   – Die Reifhöhlen: Kristallhöhle aus blaugrauem Fels unter Eis und Reif,
//              gefrorene Wasserfälle, eiskaltes Wasser mit Treibeis, türkise Kristalle.
//   'throne' – Der Aschethron: Obsidianpalast mit Goldeinlagen, Glutrissen, Ketten,
//              Bannern und Lavaflüssen.
// Format wie createBiomeTiles() in biomes.js: Boden = 32×32-Makrokacheln, Wandfront
// oben/unten, Wandkrone, nicht begehbare Flüssigkeit (4 Frames, Glow, Uferkante) und
// Props ({ sprite, glow?, box?, light?, flames?, flameAt?, embers? }, Glow (W+2)×(H+2)).
// Licht fällt von oben links; Grundstimmung dunkel, damit die Lightmap wirkt.
const T = 16;

// ------------------------------------------------------------------ Rampen
// Reifhöhlen
const RK = ['#070b13', '#0c121d', '#121a29', '#192436', '#223046', '#2e405a', '#3f5672'];   // blaugrauer Höhlenfels
const ICE = ['#0a1626', '#102840', '#18405e', '#23607e', '#3a86a4', '#68b2cc', '#a8dcec', '#e8fbff']; // Klareis
const SNOW = ['#2c3a4e', '#475a72', '#6c8098', '#96aabe', '#c2d2e0', '#e8f2fa'];            // Reif / Schnee
const TEAL = ['#041a1c', '#073436', '#0c5856', '#15847e', '#34bcb0', '#86ecde', '#e0fff8'];  // Leuchtkristall türkis
const VIOL = ['#0e0c24', '#1a1840', '#2c2a66', '#46449a', '#6e70cc', '#a8acf0', '#eceeff']; // Leuchtkristall blauviolett
const FROST = ['#06142a', '#0c2a52', '#164a84', '#2a74bc', '#58a8ec', '#a4dcff', '#f2fbff']; // kaltes Feuer
const IWAT = ['#02050b', '#040b16', '#071322', '#0b1d31', '#122c45', '#1c4260', '#346884']; // Eiswasser
const RGROUT = '#05080f';
const FIG = ['#0b1522', '#122236', '#1a3048', '#26425e', '#365874', '#4e7490'];              // Gestalt im Eis

// Aschethron
const OBS = ['#060509', '#0c0a11', '#131019', '#1b1724', '#252032', '#332c44', '#4a4062'];  // Obsidian
const GLINT = ['#6a5e8a', '#9a90bc', '#d4ceea'];                                            // Glasglanz
const GOLD = ['#221304', '#43280a', '#6e4712', '#9c6c1e', '#c89632', '#ecc25a', '#fff0a8']; // Gold
const ASH = ['#141213', '#1f1c1d', '#2c2829', '#3c3738', '#504a4a', '#6a6362', '#8c8480'];  // Aschestein
const RED = ['#160406', '#2e080c', '#4c0e14', '#70161c', '#9a2424', '#c63c30'];             // Bannerstoff
const EMB = PAL.ember;                                                                      // Glut / Lava
const CRUST = ['#110506', '#1c0908', '#2a0f0b', '#3c150d', '#521d0f'];                      // Lavakruste
const OGROUT = '#040306';
const IRON = ['#0e0f13', '#17191f', '#22252d', '#2f333d', '#424855', '#5c6474', '#8a94a6'];
const BONE = PAL.bone;

const cl = (r, i) => r[Math.max(0, Math.min(r.length - 1, i))];

// Senkrechter Zylinder, Licht von links oben: Glanz im linken Drittel, rechts Schatten.
function cylCol(ramp, i, w, base) {
  const t = (i + 0.5) / w;
  if (t < 0.12) return cl(ramp, base - 1);
  if (t < 0.34) return cl(ramp, base + 1);
  if (t < 0.62) return cl(ramp, base);
  if (t < 0.86) return cl(ramp, base - 1);
  return cl(ramp, base - 2);
}

// Unregelmäßige Rechteckteilung (Platten im Boden)
function splitRects(rng, x, y, w, h, out, min = 6, depth = 0) {
  const canV = w >= min * 2, canH = h >= min * 2;
  if ((!canV && !canH) || (depth > 1 && rng.chance(0.35))) { out.push([x, y, w, h]); return; }
  const vertical = canV && (!canH || rng.chance(w / (w + h)));
  if (vertical) {
    const cut = rng.int(min, w - min);
    splitRects(rng, x, y, cut, h, out, min, depth + 1);
    splitRects(rng, x + cut, y, w - cut, h, out, min, depth + 1);
  } else {
    const cut = rng.int(min, h - min);
    splitRects(rng, x, y, w, cut, out, min, depth + 1);
    splitRects(rng, x, y + cut, w, h - cut, out, min, depth + 1);
  }
}

// Gefaste Platte: oben/links Licht, unten/rechts Schatten, Körnung.
function bevelSlab(p, rng, x, y, w, h, ramp, base, grout, grain = 16) {
  p.rect(x, y, w, h, ramp[base]);
  if (h > 5) p.rect(x + 1, y + h - 3, w - 2, 2, ramp[base - 1]);
  for (let i = 0; i < (w * h) / grain; i++) {
    const px = x + 1 + rng.int(0, Math.max(0, w - 3)), py = y + 1 + rng.int(0, Math.max(0, h - 3));
    p.px(px, py, rng.next() < 0.6 ? ramp[base - 1] : cl(ramp, base + 1));
  }
  p.rect(x + 1, y, w - 2, 1, cl(ramp, base + 1));
  p.rect(x, y + 1, 1, h - 2, cl(ramp, base + 1));
  p.px(x + 1, y + 1, cl(ramp, base + 2));
  p.rect(x + 1, y + h - 1, w - 2, 1, ramp[Math.max(0, base - 2)]);
  p.rect(x + w - 1, y + 1, 1, h - 2, ramp[Math.max(0, base - 1)]);
  p.px(x, y, grout); p.px(x + w - 1, y, grout); p.px(x, y + h - 1, grout); p.px(x + w - 1, y + h - 1, grout);
}

// prop(W, H, AX, AY, draw(p, G)) → { sprite, glow?, box?, light? }
// G zeichnet auf die Glow-Ebene in Sprite-Koordinaten (1 px Umrissrand wird ausgeglichen).
function prop(W, H, AX, AY, draw, { glow = false, box, light } = {}) {
  const g = glow ? new PixelCanvas(W + 2, H + 2) : null;
  const G = g ? {
    px: (x, y, c) => g.px(x + 1, y + 1, c),
    rect: (x, y, w, h, c) => g.rect(x + 1, y + 1, w, h, c),
    ellipse: (x, y, rx, ry, c) => g.ellipse(x + 1, y + 1, rx, ry, c),
    line: (x0, y0, x1, y1, c) => g.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, c),
    ctx: g.ctx,
  } : null;
  const sprite = buildFrame(W, H, AX, AY, (p) => draw(p, G));
  const o = { sprite };
  if (g) o.glow = g.canvas;
  if (box) o.box = box;
  if (light) o.light = light;
  return o;
}

// Flammen-Frames (Farbrampe frei wählbar) für animierte Feuer auf Props
function flameFrames(w, h, count, seed, ramp) {
  const rng = createRng(seed);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const p = new PixelCanvas(w, h);
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const sway = Math.sin(f * 1.6 + y * 0.7) * (1 - t) * 1.2;
      const half = Math.max(0, (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) - rng.range(0, 0.6));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - sway) / Math.max(half, 0.01);
        if (d > 1 || half < 0.4) continue;
        const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.12, 0.12);
        const idx = heat > 1.0 ? 6 : heat > 0.84 ? 5 : heat > 0.66 ? 4 : heat > 0.46 ? 3 : 2;
        p.px(x, y, cl(ramp, idx));
      }
    }
    frames.push(p.canvas);
  }
  return frames;
}

// Statische Flamme direkt in Sprite + Glow
function staticFlame(p, G, cx, by, w, h, ramp, seed) {
  const rng = createRng(seed);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const sway = Math.sin(y * 0.8 + seed) * (1 - t) * 1.1;
    const half = (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62);
    for (let x = -Math.ceil(w / 2); x <= Math.ceil(w / 2); x++) {
      const d = Math.abs(x - sway) / Math.max(half, 0.01);
      if (d > 1 || half < 0.4) continue;
      const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.1, 0.1);
      const idx = heat > 1.0 ? 6 : heat > 0.84 ? 5 : heat > 0.66 ? 4 : heat > 0.46 ? 3 : 2;
      p.px(cx + x, by - h + y, cl(ramp, idx));
      if (G) G.px(cx + x, by - h + y, cl(ramp, idx - 1));
    }
  }
}

// Kristallsplitter entlang einer Achse: linke Facette hell, rechte dunkel, Grat in der Mitte.
// (x, y) = Fußpunkt, a = Winkel (−π/2 = senkrecht nach oben)
function shard(p, G, x, y, len, w, a, ramp, glowK = 1) {
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  for (let s = 0; s <= len; s += 0.5) {
    const t = s / len;
    const hw = t < 0.62 ? w / 2 : (w / 2) * (1 - (t - 0.62) / 0.38);
    for (let o = -hw; o <= hw + 0.01; o += 0.5) {
      const px = Math.round(x + ux * s + nx * o), py = Math.round(y + uy * s + ny * o);
      const side = o / Math.max(hw, 0.5);
      let k = side < -0.45 ? 5 : side < 0.05 ? 4 : side < 0.5 ? 3 : 2;
      if (Math.abs(o) < 0.3) k = 6;
      if (t > 0.9) k = Math.max(k, 5);
      p.px(px, py, cl(ramp, k));
      if (G && glowK > 0) G.px(px, py, cl(ramp, Math.max(1, k - 3 + glowK)));
    }
  }
}

// ================================================================== REIFHÖHLEN
// Flache Schneewehe auf dem Boden (Kuppe hell, Rand fließt in den Stein)
function snowFloor(p, sx, sy) {
  for (let j = -3; j <= 3; j++) for (let i = -6; i <= 6; i++) {
    const d = (i * i) / 36 + (j * j) / 9 + Math.sin(i * 1.7 + j) * 0.12;
    if (d > 1) continue;
    const edge = d > 0.72;
    if (edge && ((i + j) & 1)) continue;
    p.px(sx + i, sy + j, edge ? SNOW[0] : j < -1 ? SNOW[3] : j < 1 ? SNOW[2] : SNOW[1]);
  }
  p.px(sx - 2, sy - 2, SNOW[4]); p.px(sx - 1, sy - 2, SNOW[4]); p.px(sx - 3, sy - 1, SNOW[3]);
}

function rimeFloor(count = 10, seed = 811) {
  const rng = createRng(seed);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const p = new PixelCanvas(32, 32);
    p.rect(0, 0, 32, 32, RGROUT);
    const rects = [];
    splitRects(rng, 0, 0, 32, 32, rects, 6);
    for (const [x, y, w, h] of rects) {
      const base = rng.pick([2, 2, 3, 3, 2]);
      bevelSlab(p, rng, x, y, w, h, RK, base, RGROUT, 14);
      // Reif sammelt sich an den oberen/linken Kanten der Platten
      for (let i = 1; i < w - 1; i++) if (rng.chance(0.45)) p.px(x + i, y + (rng.chance(0.7) ? 1 : 2), rng.pick([SNOW[0], SNOW[1], RK[5]]));
      for (let j = 2; j < h - 1; j++) if (rng.chance(0.3)) p.px(x + 1, y + j, rng.pick([SNOW[0], RK[5]]));
      // Abgeplatzte Ecken
      if (rng.chance(0.4)) { p.px(x + w - 2, y + h - 1, RGROUT); p.px(x + w - 1, y + h - 2, RGROUT); }
    }
    // Eisfläche: glatter, dunkler Eisspiegel aus zwei überlappenden Ovalen, Glanzstreifen
    if (n % 3 === 0 || n === 7) {
      const rx = rng.int(6, 8), ry = rng.int(4, 5);
      const cx = rng.int(rx + 3, 28 - rx), cy = rng.int(ry + 3, 28 - ry);
      const ox = rng.pick([-4, 4]), oy = rng.int(2, 3), rx2 = rx - 2, ry2 = ry - 1;
      const inIce = (x, y) => {
        const d1 = ((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry);
        const d2 = ((x - cx - ox) ** 2) / (rx2 * rx2) + ((y - cy - oy) ** 2) / (ry2 * ry2);
        return Math.min(d1, d2) + Math.sin(x * 1.3 + y * 0.7) * 0.08 < 1;
      };
      for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) {
        if (!inIce(x, y)) continue;
        const up = !inIce(x, y - 1), left = !inIce(x - 1, y), down = !inIce(x, y + 1), right = !inIce(x + 1, y);
        const refl = (x - cx) * 0.25 + (y - cy) * 0.6; // heller zur oberen linken Kante
        let c = refl < -1.6 ? ICE[2] : ICE[1];
        if (((x * 3 + y * 5) & 7) === 0 && refl < 0) c = ICE[2];
        if (up || left) c = SNOW[0];
        else if (down || right) c = RK[1];
        p.px(x, y, c);
      }
      // zwei parallele Glanzstreifen
      for (let k = 0; k < 2; k++) {
        const sx = cx - 3 + k * 3, sy = cy - 2 + k, len = k ? 3 : 4;
        for (let i = 0; i < len; i++) if (inIce(sx + i, sy + i)) p.px(sx + i, sy + i, i === 1 ? ICE[5] : ICE[3]);
      }
      p.px(cx + 3, cy + 1, ICE[3]); p.px(cx - 4, cy + 2, ICE[2]);
    }
    // Schneeverwehung nahe einer Ecke (bleibt innerhalb der Makrokachel)
    if (n % 4 === 1 || n === 6) {
      const sx = rng.pick([8, 23]), sy = rng.pick([5, 26]);
      snowFloor(p, sx, sy);
    }
    // Reifkristalle / Frostblumen
    for (let k = 0; k < rng.int(1, 3); k++) {
      const x = rng.int(2, 29), y = rng.int(2, 29);
      p.px(x, y, SNOW[3]); p.px(x - 1, y, SNOW[1]); p.px(x + 1, y, SNOW[1]); p.px(x, y - 1, SNOW[1]); p.px(x, y + 1, SNOW[0]);
    }
    // Riss, in dem Eis glitzert
    if (rng.chance(0.4)) {
      let cx = rng.int(3, 26), cy = rng.int(2, 16);
      for (let i = 0, len = rng.int(5, 10); i < len; i++) {
        p.px(cx, cy, RGROUT);
        if (i > 1 && rng.chance(0.35)) p.px(cx + 1, cy, ICE[3]);
        cx += rng.int(-1, 1) || 1; cy += rng.int(0, 1);
      }
    }
    tiles.push(p.canvas);
  }
  return tiles;
}

function rimeFaces(count = 8, seed = 833) {
  const rng = createRng(seed);
  const rockCourse = (p, y0, rh, dark = 0) => {
    let x = -rng.int(0, 6);
    while (x < T) {
      const bw = rng.int(6, 11);
      const k = rng.pick([2, 3, 3, 4]) - dark;
      p.rect(x, y0, bw - 1, rh - 1, RK[k]);
      p.rect(x, y0, bw - 1, 1, RK[k + 1]); p.px(x, y0, RK[k + 2]);
      p.rect(x, y0 + rh - 2, bw - 1, 1, RK[k - 1]);
      p.rect(x + bw - 2, y0 + 1, 1, rh - 2, RK[k - 1]);
      if (rng.chance(0.5)) p.px(x + rng.int(1, bw - 3), y0 + rng.int(1, Math.max(1, rh - 3)), RK[k + 1]);
      x += bw;
    }
  };
  // Eiszapfen, die an der Wand herunterhängen
  const icicle = (p, x, y, len, w = 1) => {
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const ww = t < 0.5 ? w : 1;
      for (let k = 0; k < ww; k++) p.px(x + k, y + i, k === 0 ? (i < len - 1 ? ICE[5] : ICE[7]) : ICE[3]);
    }
    p.px(x, y + len - 1, ICE[6]);
  };
  const makeUpper = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, RGROUT);
    rockCourse(p, 1, 6); rockCourse(p, 7, 5); rockCourse(p, 12, 4, 1);
    // Reifkappe entlang der Kante, unregelmäßig tropfend
    for (let x = 0; x < T; x++) {
      const d = 1 + ((x * 7 + v * 3) % 5 === 0 ? 1 : 0) + ((x * 3 + v) % 7 === 0 ? 1 : 0);
      p.px(x, 0, SNOW[4]);
      for (let y = 1; y <= d; y++) p.px(x, y, y === d ? SNOW[1] : SNOW[3]);
    }
    p.px((v * 5 + 2) & 15, 0, SNOW[5]); p.px((v * 5 + 3) & 15, 0, SNOW[5]);
    // Eiszapfen unter der Kappe
    const n = 2 + (v % 3);
    for (let i = 0; i < n; i++) {
      const x = (v * 7 + i * 5 + 1) % 15;
      icicle(p, x, 2, 3 + ((v + i * 3) % 5), (i + v) % 3 === 0 ? 2 : 1);
    }
    // Eingewachsener Kristall selten
    if (v === 3 || v === 6) {
      const cx = v === 3 ? 11 : 4;
      p.px(cx, 9, TEAL[5]); p.px(cx, 10, TEAL[4]); p.px(cx + 1, 10, TEAL[3]); p.px(cx - 1, 11, TEAL[4]); p.px(cx, 11, TEAL[5]); p.px(cx + 1, 11, TEAL[2]);
      p.px(cx + 2, 11, TEAL[3]); p.px(cx + 2, 10, TEAL[4]);
    }
    // Eisglasur läuft über den Fels
    if (v % 2 === 1) {
      const x = (v * 3 + 6) & 15;
      for (let y = 5; y < 14; y++) { p.px(x, y, (y & 3) === 0 ? ICE[4] : ICE[3]); if (y > 8) p.px(x + 1, y, ICE[2]); }
    }
    return p.canvas;
  };
  const makeLower = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, RGROUT);
    rockCourse(p, 0, 6); rockCourse(p, 6, 5); rockCourse(p, 11, 5, 1);
    // Eisglasur: durchscheinende Vorhänge mit tropfender Unterkante
    const sheets = v % 3 === 2 ? 0 : 1 + (v % 2);
    for (let s = 0; s < sheets; s++) {
      const x0 = (v * 5 + s * 9 + 1) % 13, w = 3 + ((v + s * 2) % 3), y0 = (v + s) % 2;
      for (let i = 0; i < w; i++) {
        const bot = 7 + ((i * 7 + v * 3 + s) % 5) + (i === 1 ? 3 : 0);
        p.ctx.fillStyle = 'rgba(90,170,215,0.30)'; p.ctx.fillRect(x0 + i, y0, 1, bot - y0);
        if (i === 0) for (let y = y0; y < bot; y++) if ((y + v) % 4 !== 3) p.px(x0, y, ICE[4]);
        p.px(x0 + i, bot, ICE[i === 0 ? 6 : 5]);
      }
      p.px(x0, y0, ICE[6]);
      if (w > 3) p.px(x0 + 2, y0 + 2, ICE[5]);
    }
    // Reif auf den Fugen
    for (let k = 0; k < 6; k++) p.px(rng.int(0, 15), rng.pick([0, 6, 11]), rng.pick([SNOW[1], SNOW[2]]));
    // Umgebungsverdeckung, Schnee am Wandfuß
    p.ctx.fillStyle = 'rgba(2,4,10,0.35)'; p.ctx.fillRect(0, 9, T, 7);
    p.ctx.fillStyle = 'rgba(2,4,10,0.3)'; p.ctx.fillRect(0, 12, T, 4);
    for (let x = 0; x < T; x++) {
      const h = 1 + ((x * 5 + v * 3) % 4 === 0 ? 1 : 0) + ((x + v) % 6 === 0 ? 1 : 0);
      for (let y = 0; y < h; y++) p.px(x, 15 - y, y === h - 1 ? SNOW[2] : SNOW[1]);
    }
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(makeUpper(i)); lower.push(makeLower(i)); }
  return { upper, lower };
}

function rimeTop(seed = 857) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#0a0e17');
  for (let i = 0; i < 30; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#0e1420', '#070a11', '#121a28', '#0c111b']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#05070d');
  }
  for (let i = 0; i < 4; i++) p.px(rng.int(0, 15), rng.int(0, 15), '#1c2638');
  return p.canvas;
}

function rimeLiquid(seed = 877) {
  const rng = createRng(seed);
  // Treibeisfeld: Voronoi-Schollen auf dem Torus (16×16) → nahtlos. Einige Zellen sind
  // offenes Wasser, die übrigen dünne Eisplatten, die leicht wippen.
  const seeds = [];
  for (const [x, y, open] of [[4, 4, 0], [12, 6, 0], [6, 12, 0], [13, 14, 1]]) seeds.push([x + rng.range(-0.5, 0.5), y + rng.range(-0.5, 0.5), rng.range(0, 6.28), open]);
  const glints = [[5, 7, 0], [12, 5, 2], [1, 12, 1], [9, 14, 3]];
  const frames = [], glow = [];
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T);
    const ph = (f / 4) * Math.PI * 2;
    const pts = seeds.map(([x, y, a]) => [x + Math.cos(ph + a) * 0.45, y + Math.sin(ph + a) * 0.35]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let d1 = 99, d2 = 99, k1 = 0, ddx = 0, ddy = 0;
      pts.forEach(([sx, sy], k) => {
        let dx = x + 0.5 - sx, dy = y + 0.5 - sy;
        if (dx > 8) dx -= 16; if (dx < -8) dx += 16; if (dy > 8) dy -= 16; if (dy < -8) dy += 16;
        const d = Math.hypot(dx, dy * 1.2);
        if (d < d1) { d2 = d1; d1 = d; k1 = k; ddx = dx; ddy = dy; } else if (d < d2) d2 = d;
      });
      const gap = d2 - d1;
      const th = (((x & 1) * 2 + (y & 1) * 3) % 4) / 4 * 0.5;
      // Wellen im offenen Wasser
      const wv = Math.sin((x / 16) * Math.PI * 2 + (y / 16) * Math.PI * 4 + ph) * 0.5 + Math.sin((y / 16) * Math.PI * 6 - ph) * 0.3 + th * 0.4 - 0.2;
      const water = wv > 0.45 ? IWAT[4] : wv > 0 ? IWAT[3] : wv > -0.5 ? IWAT[2] : IWAT[1];
      const chan = 1.1 + Math.sin(x * 0.9 + y * 0.4) * 0.5 + th * 0.4;
      if (seeds[k1][3] || gap < chan) { p.px(x, y, water); continue; }
      // Scholle: Licht von oben links, Kante zur Spalte hell (oben) bzw. dunkel (unten)
      const lit = -(ddx + ddy * 1.3) / 5;
      let c = lit > 0.55 ? ICE[3] : lit > -0.2 ? ICE[2] : ICE[1];
      if (gap < chan + 0.8) c = ddy < -0.5 ? SNOW[1] : ddx < -0.5 ? ICE[3] : ICE[0];
      p.px(x, y, c);
    }
    for (const [gx, gy, t] of glints) {
      const on = (f + t) % 4;
      if (on === 0) { p.px(gx, gy, ICE[6]); g.px(gx, gy, '#3a7a9a'); g.px((gx + 1) & 15, gy, '#14344a'); }
      else if (on === 1) { p.px(gx, gy, ICE[4]); g.px(gx, gy, '#16384c'); }
    }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  // Uferkante: Eisschelf mit Reifkante, senkrechte Eiswand mit Zapfen, Wasserlinie
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 1, SNOW[4]); e.rect(0, 1, T, 1, SNOW[2]);
  e.rect(0, 2, T, 4, ICE[3]);
  for (let x = 0; x < T; x++) {
    if (x % 4 === 1) e.rect(x, 2, 1, 4, ICE[4]);
    if (x % 4 === 3) e.rect(x, 3, 1, 3, ICE[2]);
  }
  e.px(2, 2, ICE[6]); e.px(9, 2, ICE[6]); e.px(10, 3, ICE[5]);
  e.rect(0, 6, T, 1, ICE[1]);
  // kurze Zapfen tauchen ins Wasser
  for (const [x, l] of [[1, 2], [5, 1], [8, 3], [12, 2], [14, 1]]) for (let i = 0; i < l; i++) e.px(x, 6 + i, i === l - 1 ? ICE[6] : ICE[4]);
  for (let x = 0; x < T; x++) if (e.ctx.getImageData(x, 7, 1, 1).data[3] === 0) e.px(x, 7, x % 3 === 0 ? ICE[5] : IWAT[5]);
  e.ctx.fillStyle = 'rgba(1,3,8,0.6)'; e.ctx.fillRect(0, 8, T, 2);
  e.ctx.fillStyle = 'rgba(1,3,8,0.35)'; e.ctx.fillRect(0, 10, T, 2);
  e.ctx.fillStyle = 'rgba(1,3,8,0.15)'; e.ctx.fillRect(0, 12, T, 2);
  return { frames, glow, edge: e.canvas, edgeH: 8 };
}

// ------------------------------------------------------------ Reif-Props
// Schneehaufen mit weicher Kuppe (Licht oben links, bläuliche Schattenseite)
function snowMound(p, cx, by, rx, ry, seed) {
  const rng = createRng(seed);
  for (let j = -Math.ceil(ry); j <= 0; j++) for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) {
    const wob = Math.sin(i * 0.9 + seed) * 0.08;
    const d = (i * i) / (rx * rx) + (j * j) / (ry * ry);
    if (d > 1 + wob) continue;
    const lit = -i / rx * 0.5 - j / ry * 0.8;
    let k = lit > 0.55 ? 5 : lit > 0.25 ? 4 : lit > -0.1 ? 3 : lit > -0.45 ? 2 : 1;
    if (j === 0) k = Math.min(k, 1);
    if (rng.chance(0.08)) k = Math.max(1, k - 1);
    p.px(cx + i, by + j, SNOW[k]);
  }
}

function rimeIceColumn(v) {
  const W = 20, H = 48, AX = 10, AY = 46;
  return prop(W, H, AX, AY, (p) => {
    const cx = 10;
    const top = v ? 18 : 5;
    // Profil: unten breit (Tropfsockel), Taille, oben wieder breit (Deckenzapfen)
    const hw = (y) => {
      if (v) { const t = (y - top) / (44 - top); return 3.2 + t * t * 5.2; }
      const t = (y - top) / (44 - top);
      return 3.4 + Math.pow(Math.abs(t - 0.45) / 0.55, 1.8) * 5.2;
    };
    for (let y = top; y <= 44; y++) {
      const w = hw(y), wob = Math.sin(y * 0.55) * 0.5;
      const x0 = Math.round(cx - w + wob), x1 = Math.round(cx + w + wob) - 1;
      const n = x1 - x0 + 1;
      for (let x = x0; x <= x1; x++) p.px(x, y, cylCol(ICE, x - x0, n, 4));
      // innerer dunkler Kern (Tiefe), Lichtfaden links
      const k = Math.round(x0 + n * 0.58);
      if (n > 5) p.px(k, y, ICE[2]);
      if (n > 4 && (y % 5) !== 0) p.px(x0 + 1, y, ICE[6]);
      // Wachstumsringe
      if (y % 7 === 3) for (let x = x0 + 1; x < x1; x++) if ((x + y) & 1) p.px(x, y, ICE[5]);
    }
    // Eingeschlossene Luftblasen
    for (const [x, y] of [[9, 12], [11, 20], [8, 27], [12, 33], [10, 38], [11, 24]]) if (y > top + 2) { p.px(x, y, ICE[6]); p.px(x + 1, y + 1, ICE[2]); }
    if (!v) {
      // Deckenkappe: Fels mit Reif, aus dem die Säule wächst
      p.ellipse(cx, 3, 9.5, 3.4, RK[2]); p.ellipse(cx - 1, 2.4, 8, 2.4, RK[4]); p.px(4, 3, RK[6]); p.px(5, 2, RK[5]);
      for (let x = 2; x < 18; x++) p.px(x, 0 + ((x * 3) % 4 === 0 ? 1 : 0), SNOW[3]);
      p.px(4, 1, SNOW[5]); p.px(5, 1, SNOW[4]); p.px(15, 4, RK[1]); p.px(16, 3, RK[2]);
      // kleine Zapfen am Kappenrand
      for (const [x, l] of [[3, 3], [16, 4], [5, 2]]) for (let i = 0; i < l; i++) p.px(x, 5 + i, i === l - 1 ? ICE[7] : ICE[5]);
    } else {
      // Bruchkante oben: gezackt, frische Bruchfläche leuchtet weiß
      const jag = [0, 2, 1, 3, 1, 0, 2];
      const w = hw(top), x0 = Math.round(cx - w);
      for (let i = 0; i < Math.round(w * 2); i++) {
        const j = jag[i % jag.length];
        p.rect(x0 + i, top - j, 1, j + 1, i < w ? ICE[5] : ICE[4]);
        p.px(x0 + i, top - j, ICE[7]);
      }
      // abgebrochenes Stück liegt daneben
      p.ellipse(16, 44, 3, 1.6, ICE[4]); p.px(15, 43, ICE[7]); p.px(14, 43, ICE[6]); p.px(18, 45, ICE[2]);
      p.ellipse(3, 45, 2, 1, ICE[3]); p.px(2, 44, ICE[6]);
    }
    // Schneesockel und Reif am Fuß
    snowMound(p, cx, 46, 9.5, 3.2, 3 + v);
    p.px(4, 42, SNOW[3]); p.px(15, 41, SNOW[2]);
  }, { box: [-7, -5, 7, 1] });
}

function rimeCrystals(v) {
  const cfg = [
    { W: 22, H: 26, ramp: TEAL, light: [80, 220, 210] },
    { W: 16, H: 18, ramp: VIOL, light: [130, 140, 255] },
    { W: 28, H: 38, ramp: TEAL, light: [90, 230, 220] },
  ][v];
  const { W, H, ramp } = cfg, AX = W >> 1, AY = H - 1;
  return prop(W, H, AX, AY, (p, G) => {
    const bx = W / 2, by = H - 3;
    // Felssockel
    p.ellipse(bx, by + 0.5, W * 0.38, 2.2, RK[3]); p.ellipse(bx - 1, by - 0.2, W * 0.28, 1.2, RK[5]);
    p.px(Math.round(bx - W * 0.3), by, SNOW[3]); p.px(Math.round(bx + W * 0.3), by + 1, RK[1]);
    const S = v === 0
      ? [[-4, 0, 11, 3.4, -2.05], [5, 0, 13, 4, -1.35], [0, 1, 20, 5, -1.62], [-7, 1, 6, 2.6, -2.5], [8, 1, 6, 2.6, -0.8]]
      : v === 1
        ? [[-3, 0, 8, 3, -2.0], [3, 0, 10, 3.2, -1.3], [0, 1, 13, 4, -1.62]]
        : [[-7, 0, 15, 4.2, -2.1], [7, 0, 18, 4.6, -1.25], [-2, 1, 30, 6.4, -1.66], [3, 1, 12, 3.4, -1.4], [-11, 2, 8, 3, -2.6], [11, 2, 8, 3, -0.6]];
    // Hinten → vorne (kurze, schräge Splitter zuerst)
    const order = [...S].sort((a, b) => b[2] * 0 + a[1] - b[1]);
    for (const [dx, dy, len, w, a] of order) shard(p, G, bx + dx, by + dy, len, w, a, ramp, 1);
    // Frost am Fuß, kleine Splitter
    for (const [dx, l] of [[-W * 0.35, 3], [W * 0.33, 2]]) shard(p, G, bx + dx, by + 1, l + 1, 1.6, -1.57 + dx * 0.04, ramp, 0);
    p.px(Math.round(bx - 3), by + 1, SNOW[4]); p.px(Math.round(bx + 2), by + 1, SNOW[3]); p.px(Math.round(bx + 4), by + 2, SNOW[1]);
    // Funkelpunkte
    G.px(Math.round(bx - 1), Math.round(by - (v === 2 ? 22 : v === 0 ? 14 : 9)), ramp[6]);
    // Leuchtschein auf dem Boden
    G.ctx.globalAlpha = 0.35; G.ellipse(bx, by + 1, W * 0.4, 1.6, ramp[2]); G.ctx.globalAlpha = 1;
  }, { glow: true, box: v === 1 ? [-5, -3, 5, 1] : [-8, -4, 8, 1], light: { dx: 0, dy: -H * 0.4, radius: v === 2 ? 64 : v === 1 ? 40 : 52, color: cfg.light, intensity: 0.75 } });
}

function rimeFrozenWarrior(v) {
  const W = 26, H = 40, AX = 13, AY = 38;
  return prop(W, H, AX, AY, (p) => {
    // Eisblock: kantiger Brocken mit Facetten (links hell, Front mittel, rechts dunkel)
    const topAt = (x) => Math.round((x < 14 ? 6 - (x - 2) * 0.36 : 1.7 + (x - 14) * 0.65) + (x % 5 === 3 ? 1 : 0));
    const leftAt = (y) => (y < 10 ? 4 - (y >> 2) : y < 26 ? 2 : 1);
    const rightAt = (y) => (y < 8 ? 22 - (8 - y) * 0.2 : y < 30 ? 23 : 24);
    const x0 = 1, x1 = 24, y0 = 1;
    for (let x = x0; x <= x1; x++) {
      const t0 = topAt(x);
      for (let y = t0; y <= 36; y++) {
        if (x < leftAt(y) || x > rightAt(y)) continue;
        const u = (x - leftAt(y)) / Math.max(1, rightAt(y) - leftAt(y));
        let c = u < 0.14 ? ICE[5] : u > 0.86 ? ICE[2] : ICE[4];
        if (y - t0 < 3) c = y - t0 === 0 ? ICE[7] : ICE[6];
        else if (u >= 0.14 && u <= 0.86 && ((x + y * 2) % 13 === 0)) c = ICE[5];
        p.px(x, y, c);
      }
    }
    // Die Gestalt im Eis: dunkle Silhouette, danach Eisschleier darüber
    const F = FIG, cx = 13;
    if (v === 0) {
      // Nordkrieger mit Hörnerhelm: Rundschild links, Schwert rechts erhoben
      p.rect(cx - 3, 23, 2, 10, F[2]); p.rect(cx + 1, 23, 2, 10, F[1]); p.px(cx - 3, 23, F[3]);
      p.rect(cx - 4, 32, 3, 2, F[3]); p.rect(cx + 1, 32, 3, 2, F[2]);
      for (let y = 13; y < 24; y++) { const w = y < 16 ? 5 : y < 20 ? 4.5 : 4; for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) p.px(x, y, cylCol(F, x - Math.round(cx - w), Math.round(w * 2), 3)); }
      p.rect(cx - 4, 21, 8, 1, F[4]); p.px(cx, 21, F[5]); // Gürtel
      p.rect(cx - 2, 8, 5, 5, F[3]); p.rect(cx - 2, 8, 2, 4, F[4]); p.rect(cx - 2, 7, 5, 1, F[5]); p.px(cx, 10, F[0]); p.px(cx + 1, 10, F[0]);
      p.px(cx - 3, 7, F[4]); p.px(cx - 4, 6, F[4]); p.px(cx - 4, 5, F[5]); p.px(cx + 3, 7, F[3]); p.px(cx + 4, 6, F[3]); p.px(cx + 4, 5, F[4]);
      p.rect(cx - 1, 12, 3, 2, F[1]); // Bart
      // Schild
      p.ellipse(cx - 5, 19, 4, 5, F[2]); p.ellipse(cx - 5.5, 18.5, 3, 4, F[3]); p.px(cx - 5, 19, F[5]); p.px(cx - 6, 18, F[4]);
      // Schwertarm erhoben, Klinge schräg nach oben
      p.line(cx + 4, 14, cx + 7, 10, F[3]); p.line(cx + 5, 14, cx + 8, 10, F[2]);
      p.line(cx + 7, 9, cx + 9, 2, F[5]); p.line(cx + 8, 9, cx + 10, 3, F[4]); p.rect(cx + 6, 9, 4, 1, F[4]);
    } else {
      // Ritter mit Umhang, Zweihänder vor sich in den Boden gestemmt, Kopf gesenkt
      for (let y = 12; y < 34; y++) { const w = 4.5 + (y - 12) * 0.2; for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) p.px(x, y, (x - cx) < -2 ? F[2] : (x - cx) > 2 ? F[0] : F[1]); }
      for (let y = 13; y < 26; y++) { const w = y < 16 ? 4.4 : 3.6; for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) p.px(x, y, cylCol(F, x - Math.round(cx - w), Math.round(w * 2), 3)); }
      p.rect(cx - 5, 13, 3, 3, F[4]); p.rect(cx + 2, 13, 3, 3, F[3]); p.px(cx - 5, 13, F[5]); // Schulterstücke
      p.rect(cx - 2, 8, 5, 5, F[3]); p.rect(cx - 2, 8, 2, 5, F[4]); p.rect(cx - 2, 11, 5, 1, F[1]); p.px(cx, 9, F[1]); p.px(cx - 1, 7, F[4]); p.px(cx, 7, F[4]); p.px(cx + 1, 7, F[3]);
      p.rect(cx - 3, 32, 3, 2, F[3]); p.rect(cx + 1, 32, 3, 2, F[2]);
      // Zweihänder: Knauf an der Brust, Klinge bis zum Boden
      p.rect(cx - 1, 17, 3, 3, F[4]); p.rect(cx - 4, 20, 9, 1, F[5]);
      p.rect(cx - 1, 21, 3, 13, F[4]); p.rect(cx - 1, 21, 1, 13, F[5]); p.px(cx, 34, F[5]);
    }
    // Eisschleier über der Gestalt (sie liegt tief im Block)
    p.ctx.globalCompositeOperation = 'source-atop';
    p.ctx.fillStyle = 'rgba(110,190,225,0.2)'; p.ctx.fillRect(0, 0, W, H);
    p.ctx.globalCompositeOperation = 'source-over';
    // Glanz: diagonale Streifen, Kanten und Sprünge
    for (const [sx, sy, l] of [[5, 13, 7], [7, 12, 3], [17, 24, 5], [4, 27, 3]]) for (let i = 0; i < l; i++) p.px(sx + i, sy + i, i === 1 ? ICE[7] : ICE[6]);
    for (let y = 12; y < 34; y += 1) if (y % 6 !== 0) p.px(leftAt(y), y, ICE[6]);
    p.px(20, 16, ICE[1]); p.px(21, 17, ICE[1]); p.px(21, 18, ICE[2]); p.px(22, 19, ICE[1]);
    // Schnee am Fuß und auf dem Block
    snowMound(p, 13, 38, 12.5, 3.4, 11 + v);
    for (let x = 6; x < 14; x++) { const t = topAt(x); p.px(x, t, SNOW[5]); p.px(x, t + 1, SNOW[3]); }
  }, { box: [-10, -5, 10, 1] });
}

function rimeIcicles(v) {
  if (v === 0) {
    // Überhängender Felsblock, von dessen Kante ein Vorhang aus Eiszapfen hängt
    const W = 26, H = 30, AX = 13, AY = 29;
    return prop(W, H, AX, AY, (p) => {
      // Sockel und Überhang (pilzförmiger Fels, Schnee obenauf)
      p.ellipse(14, 26, 7, 3.4, RK[2]); p.ellipse(13, 25, 5, 2.4, RK[3]);
      for (let y = 8; y < 26; y++) { const hw = 3.5 + (y > 20 ? (y - 20) * 0.7 : 0); for (let x = Math.round(15 - hw); x <= Math.round(15 + hw); x++) p.px(x, y, cylCol(RK, x - Math.round(15 - hw), Math.round(hw * 2) + 1, 4)); }
      p.ellipse(13, 7, 12, 5, RK[3]); p.ellipse(12, 6, 11, 4, RK[4]); p.ellipse(10, 5, 7, 2.4, RK[5]); p.rect(3, 10, 21, 1, RK[2]);
      p.px(6, 5, RK[6]); p.px(7, 4, RK[5]); p.px(20, 9, RK[1]); p.px(22, 8, RK[1]);
      for (let x = 2; x < 23; x++) { const t = 3 + Math.round(Math.abs(x - 12) * 0.18); p.px(x, t - 1, SNOW[x < 12 ? 5 : 4]); p.px(x, t, SNOW[3]); if ((x * 5) % 7 < 3) p.px(x, t + 1, SNOW[2]); }
      // Zapfen an der Unterkante
      const Z = [[2, 7, 1], [4, 12, 2], [7, 16, 2], [10, 9, 1], [12, 13, 2], [19, 11, 2], [21, 7, 1], [23, 5, 1]];
      for (const [x, len, w] of Z) {
        const y0 = 10 + (x > 8 && x < 18 ? 1 : 0);
        for (let i = 0; i < len; i++) {
          const ww = Math.max(1, Math.round(w * (1 - i / len * 0.8)));
          for (let k = 0; k < ww; k++) p.px(x + k, y0 + i, k === 0 ? ICE[5] : ICE[3]);
          if (i % 5 === 2 && ww > 1) p.px(x + 1, y0 + i, ICE[6]);
        }
        p.px(x, y0 + len - 1, ICE[7]);
      }
      // Tropfeis am Boden unter den Zapfen
      for (const [x, h] of [[7, 3], [4, 2], [12, 2]]) for (let i = 0; i < h; i++) p.px(x, 28 - i, i === h - 1 ? ICE[6] : ICE[4]);
      snowMound(p, 13, 29, 11, 2.2, 19);
    }, { box: [-6, -4, 6, 1] });
  }
  // Eisdornen: aus dem Boden gewachsene und herabgestürzte Zapfen
  const W = 22, H = 22, AX = 11, AY = 21;
  return prop(W, H, AX, AY, (p) => {
    const spike = (x, by, h, w, lean) => {
      for (let i = 0; i < h; i++) {
        const t = i / h, hw = w * (1 - t);
        const cx = x + lean * t;
        for (let o = -Math.ceil(hw); o <= Math.ceil(hw); o++) {
          if (Math.abs(o) > hw + 0.3) continue;
          const u = (o + hw) / Math.max(0.5, hw * 2);
          p.px(Math.round(cx + o), by - i, u < 0.3 ? ICE[5] : u < 0.65 ? ICE[4] : ICE[2]);
        }
      }
      p.px(Math.round(x + lean), by - h, ICE[7]);
    };
    spike(6, 19, 11, 2.2, -1); spike(15, 19, 9, 2, 1.5); spike(10, 20, 17, 3, 0.5); spike(18, 20, 5, 1.4, 1);
    // abgebrochener Zapfen liegt quer
    p.line(2, 19, 8, 17, ICE[5]); p.line(2, 20, 8, 18, ICE[3]); p.px(1, 20, ICE[6]); p.px(8, 17, ICE[7]);
    snowMound(p, 11, 21, 10, 2.4, 21);
    p.px(4, 21, ICE[4]); p.px(17, 21, SNOW[3]);
  }, { box: [-7, -4, 7, 1] });
}

function rimeFrostBrazier() {
  const W = 20, H = 34, AX = 10, AY = 33;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Steinsockel mit Runenband
    p.rect(5, 20, 10, 12, RK[3]); p.rect(5, 20, 2, 12, RK[5]); p.rect(13, 20, 2, 12, RK[1]); p.rect(5, 20, 10, 1, RK[6]);
    p.rect(3, 31, 14, 2, RK[4]); p.rect(3, 31, 14, 1, RK[6]); p.px(16, 32, RK[1]);
    for (const [x, y] of [[8, 24], [9, 25], [10, 24], [11, 25], [9, 27], [10, 27]]) { p.px(x, y, FROST[4]); G.px(x, y, FROST[3]); }
    // Eiserne Schale, bereift
    for (let y = 0; y < 7; y++) {
      const hw = 9 - y * 0.8, x0 = Math.round(10 - hw), x1 = Math.round(10 + hw) - 1;
      for (let x = x0; x <= x1; x++) p.px(x, 13 + y, cylCol(IRON, x - x0, x1 - x0 + 1, 3));
    }
    p.rect(1, 13, 18, 1, IRON[5]); p.px(2, 13, SNOW[5]); p.px(3, 13, SNOW[4]); p.px(12, 13, SNOW[3]);
    for (let x = 3; x < 18; x += 4) { p.px(x, 16, IRON[6]); p.px(x, 14, SNOW[2]); }
    for (const [x, l] of [[3, 3], [7, 2], [15, 3]]) for (let i = 0; i < l; i++) p.px(x, 20 + i, i === l - 1 ? ICE[7] : ICE[5]);
    // Kalte Glut: blauweiße Kristallkohlen
    p.rect(3, 11, 14, 2, FROST[1]);
    for (let x = 3; x < 17; x++) if ((x * 5) % 3) p.px(x, 11 + (x & 1), x % 4 ? FROST[3] : FROST[5]);
    G.rect(3, 11, 14, 2, FROST[2]); for (let x = 3; x < 17; x += 3) G.px(x, 11 + (x & 1), FROST[4]);
    staticFlame(p, G, 10, 12, 9, 12, FROST, 7);
    p.px(6, 14, FROST[3]); p.px(13, 14, FROST[2]); G.px(6, 14, FROST[2]);
  }, { glow: true, box: [-5, -3, 5, 1], light: { dx: 0, dy: -20, radius: 80, color: [120, 190, 255], intensity: 1.0 } });
  o.flames = flameFrames(9, 12, 6, 29, FROST);
  o.flameAt = { dx: -4, dy: -33 };
  return o;
}

function rimeFrozenFall() {
  const W = 48, H = 60, AX = 24, AY = 58;
  return prop(W, H, AX, AY, (p, G) => {
    const rng = createRng(611);
    // Felswand dahinter: gestaffelte Blöcke, oben gezackt
    const cliffTop = (x) => Math.round(4 + Math.abs(Math.sin(x * 0.35)) * 4 + (x < 6 || x > 41 ? 10 : 0) + (x < 3 || x > 44 ? 8 : 0));
    for (let x = 0; x < W; x++) for (let y = cliffTop(x); y < 54; y++) {
      const u = x / W;
      const band = Math.floor((y + (x >> 3) * 3) / 7);
      let k = 2 + ((band + (x >> 2)) % 3 === 0 ? 1 : 0);
      if (u < 0.12) k += 1; if (u > 0.88) k -= 1;
      p.px(x, y, RK[k]);
      if ((y + (x >> 3) * 3) % 7 === 0) p.px(x, y, RK[Math.max(0, k - 2)]);
    }
    for (let x = 0; x < W; x++) { const t = cliffTop(x); p.px(x, t, SNOW[x < 24 ? 4 : 3]); p.px(x, t + 1, SNOW[2]); if (x % 3) p.px(x, t + 2, SNOW[1]); }
    for (let k = 0; k < 18; k++) { const x = rng.int(1, 46), y = rng.int(12, 50); p.px(x, y, RK[5]); p.px(x + 1, y + 1, RK[1]); }
    // Kaskade: fächert nach unten auf
    const edges = (y) => { const t = Math.min(1, Math.max(0, (y - 8) / 38)); return [Math.round(24 - 9 - t * 7 + Math.sin(y * 0.4) * 0.6), Math.round(24 + 9 + t * 7 + Math.sin(y * 0.5 + 1) * 0.6)]; };
    for (let y = 8; y <= 50; y++) {
      const [x0, x1] = edges(y);
      for (let x = x0; x <= x1; x++) {
        const band = Math.sin(x * 1.05 + Math.sin(y * 0.16 + x * 0.25) * 1.4);
        const u = (x - x0) / (x1 - x0);
        let k = band > 0.6 ? 5 : band > 0.05 ? 4 : band > -0.55 ? 3 : 2;
        if (u > 0.85) k -= 1;
        if (u < 0.07) k = 6;
        if (((y * 7 + x * 3) % 23) === 0) k = 7;
        p.px(x, y, ICE[k]);
        if (k >= 5 && (x + y) % 4 === 0) G.px(x, y, TEAL[1]);
      }
      p.px(x1 + 1, y, ICE[1]); // Schattenfuge rechts
    }
    // gefrorene Wülste (gewellte Teilbögen, keine durchgehenden Linien)
    for (const [yy, xa, xb] of [[18, 18, 26], [30, 24, 34], [39, 12, 21]]) {
      for (let x = xa; x <= xb; x++) { const y = yy + Math.round(Math.sin((x - xa) / (xb - xa) * Math.PI) * -1.5); p.px(x, y, ICE[5]); p.px(x, y + 1, ICE[3]); }
      p.px(xa + 2, yy - 1, ICE[7]);
    }
    // Überlauf an der Felslippe
    for (let x = 14; x <= 34; x++) { p.px(x, 7, SNOW[4]); p.px(x, 8, ICE[6]); p.px(x, 9, x % 3 ? ICE[5] : ICE[7]); }
    p.ellipse(24, 6, 11, 1.6, RK[4]); p.rect(14, 5, 21, 1, SNOW[5]);
    // Zapfen an den Kanten
    for (const [x, y, l] of [[8, 30, 6], [11, 18, 5], [38, 24, 6], [40, 36, 5], [6, 42, 4]]) for (let i = 0; i < l; i++) p.px(x, y + i, i === l - 1 ? ICE[7] : ICE[4]);
    // Innenleuchten
    for (const [x, y] of [[20, 18], [28, 27], [23, 36], [17, 43], [31, 42]]) { G.px(x, y, TEAL[3]); G.px(x, y + 1, TEAL[2]); G.px(x, y - 1, TEAL[1]); }
    // Aufprallkegel am Fuß: runde Eisbuckel
    for (const [x, y, r] of [[14, 49, 4], [22, 48, 5], [31, 49, 4.5], [38, 50, 3.5], [9, 51, 3]]) {
      p.ellipse(x, y, r, r * 0.8, ICE[4]); p.ellipse(x - 1, y - 1, r - 1.5, r * 0.8 - 1.5, ICE[5]); p.px(Math.round(x - r * 0.5), Math.round(y - r * 0.5), ICE[7]);
      p.px(Math.round(x + r * 0.6), Math.round(y + r * 0.4), ICE[2]);
    }
    // Gefrorenes Becken
    p.ellipse(24, 54, 21, 3.6, ICE[2]); p.ellipse(23, 53.6, 17, 2.2, ICE[1]);
    for (let i = 0; i < 5; i++) p.px(14 + i, 53, ICE[4]);
    p.px(30, 54, ICE[6]); p.px(31, 54, ICE[4]);
    snowMound(p, 6, 58, 7, 3.4, 31); snowMound(p, 42, 58, 7, 3, 33); snowMound(p, 24, 58, 12, 1.6, 35);
    G.ctx.globalAlpha = 0.5; G.ellipse(24, 53, 14, 2.4, TEAL[1]); G.ctx.globalAlpha = 1;
  }, { glow: true, box: [-21, -9, 21, 1], light: { dx: 0, dy: -24, radius: 60, color: [90, 200, 220], intensity: 0.55 } });
}

function rimeSnowPile(v) {
  const W = v ? 28 : 22, H = v ? 15 : 11, AX = W >> 1, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    if (v) {
      // Felsbrocken schaut heraus, Zapfen am Rand
      p.ellipse(18, 7, 6, 5, RK[3]); p.ellipse(17, 6, 4.5, 3.6, RK[4]); p.px(15, 4, RK[6]); p.px(16, 4, RK[5]); p.px(22, 9, RK[1]);
      p.rect(14, 3, 6, 1, SNOW[4]); p.px(13, 4, SNOW[3]);
      snowMound(p, 11, 14, 11, 7, 41);
      snowMound(p, 22, 14, 6, 3, 43);
      p.px(23, 10, ICE[5]); p.px(23, 11, ICE[6]);
    } else {
      snowMound(p, 11, 10, 10.5, 6, 45);
      snowMound(p, 16, 10, 5, 3, 47);
    }
    // Glitzerpunkte
    p.px(Math.round(W * 0.3), Math.round(H * 0.45), SNOW[5]); p.px(Math.round(W * 0.55), Math.round(H * 0.3), '#ffffff');
  }, { box: v ? [-11, -4, 11, 1] : [-8, -3, 8, 1] });
}

// ================================================================== ASCHETHRON
// Glasiger Glanzstreifen auf Obsidian (diagonal, oben links nach unten rechts)
function obsGlint(p, x, y, len) {
  for (let i = 0; i < len; i++) p.px(x + i, y + i, i === 0 ? GLINT[1] : i === 1 && len > 2 ? GLINT[2] : GLINT[0]);
}

function throneFloor(count = 12, seed = 911) {
  const rng = createRng(seed);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const p = new PixelCanvas(32, 32);
    p.rect(0, 0, 32, 32, OGROUT);
    const rects = [];
    splitRects(rng, 1, 1, 31, 31, rects, 7);
    const medal = n === 8;
    for (const [x, y, w, h] of rects) {
      const base = rng.pick([2, 2, 3, 2, 3]);
      bevelSlab(p, rng, x, y, w, h, OBS, base, OGROUT, 22);
      // polierte Oberfläche: Spiegelung als weicher heller Keil und Glasglanz
      if (rng.chance(0.2) && w > 9 && h > 9) { p.px(x + 2, y + 2, GLINT[0]); p.px(x + 3, y + 3, OBS[5]); }
      if (rng.chance(0.3) && w > 9) for (let i = 0; i < Math.min(w, h) - 4; i++) p.px(x + 3 + i, y + h - 3 - i, OBS[base + 1]);
    }
    // Goldeinlage im 32er-Raster (oben/links jeder Makrokachel) → durchgehendes Gitter
    for (let i = 0; i < 32; i++) {
      p.px(i, 0, (i & 7) === 0 ? GOLD[4] : GOLD[2]);
      p.px(0, i, (i & 7) === 0 ? GOLD[4] : GOLD[1]);
    }
    p.px(0, 0, GOLD[5]);
    // Goldmedaillon: Flammenkrone im Kreis
    if (medal) {
      const cx = 16, cy = 16;
      p.ellipse(cx, cy, 8, 7, OBS[1]);
      for (let a = 0; a < Math.PI * 2; a += 0.04) {
        const x = Math.round(cx + Math.cos(a) * 7.5), y = Math.round(cy + Math.sin(a) * 6.5);
        p.px(x, y, Math.cos(a) + Math.sin(a) < 0 ? GOLD[3] : GOLD[1]);
      }
      // Kronenzacken
      const crown = ['..#...#...#..', '..#..###..#..', '.###.###.###.', '#############', '#.#.#.#.#.#.#'];
      for (let j = 0; j < crown.length; j++) for (let i = 0; i < crown[j].length; i++) if (crown[j][i] === '#') p.px(cx - 6 + i, cy - 3 + j, j === 3 ? GOLD[4] : j > 3 ? GOLD[1] : GOLD[2]);
      p.px(cx, cy - 3, EMB[4]); p.px(cx - 4, cy - 2, EMB[3]); p.px(cx + 4, cy - 2, EMB[3]);
      p.rect(cx - 4, cy + 3, 9, 1, GOLD[1]);
    }
    // Glutriss
    if (n === 4 || n === 9 || (!medal && rng.chance(0.25))) {
      let cx = rng.int(5, 24), cy = rng.int(3, 12);
      const len = rng.int(7, 13);
      for (let i = 0; i < len; i++) {
        p.px(cx, cy, OGROUT);
        if (i > 1 && i < len - 2) p.px(cx, cy, i % 3 ? CRUST[4] : EMB[1]);
        if (i > 3 && i < len - 4 && i % 2) p.px(cx + 1, cy, EMB[2]);
        cx += rng.int(-1, 1) || 1; cy += rng.int(0, 1);
      }
    }
    // Asche und Glutstaub
    for (let k = 0; k < rng.int(3, 7); k++) {
      const x = rng.int(2, 30), y = rng.int(2, 30);
      p.px(x, y, rng.pick([ASH[2], ASH[3], ASH[2], CRUST[2]]));
      if (rng.chance(0.3)) p.px(x + 1, y, ASH[1]);
    }
    tiles.push(p.canvas);
  }
  return tiles;
}

// Mäander (Periode 8) als Goldeinlage im Fries
const MEANDER = [
  '#######.',
  '#.....#.',
  '#.###.#.',
  '#.#...#.',
  '#.#####.',
];
function throneFaces(count = 8, seed = 933) {
  const rng = createRng(seed);
  const ashlar = (p, y0, rh, dark = 0) => {
    let x = -rng.int(0, 7);
    while (x < T) {
      const bw = rng.int(8, 12);
      const k = rng.pick([2, 3, 3]) - dark;
      p.rect(x, y0, bw - 1, rh - 1, OBS[k]);
      p.rect(x, y0, bw - 1, 1, OBS[k + 2]); p.px(x, y0, GLINT[0]);
      p.rect(x, y0 + rh - 2, bw - 1, 1, OBS[Math.max(0, k - 1)]);
      p.rect(x + bw - 2, y0 + 1, 1, rh - 2, OBS[Math.max(0, k - 1)]);
      if (rng.chance(0.4)) obsGlint(p, x + 2, y0 + 1, 2);
      x += bw;
    }
  };
  const makeUpper = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, OGROUT);
    // Goldgesims
    p.rect(0, 0, T, 1, GOLD[5]); p.rect(0, 1, T, 1, GOLD[3]); p.rect(0, 2, T, 1, GOLD[1]); p.rect(0, 3, T, 1, OGROUT);
    for (let x = 0; x < T; x += 4) p.px(x + 1, 1, GOLD[4]);
    // Fries mit Mäander
    p.rect(0, 4, T, 6, OBS[1]);
    for (let y = 0; y < 5; y++) for (let x = 0; x < T; x++) if (MEANDER[y][x & 7] === '#') p.px(x, 4 + y, y === 0 ? GOLD[4] : GOLD[2]);
    p.rect(0, 9, T, 1, OBS[0]);
    p.rect(0, 10, T, 1, GOLD[2]);
    ashlar(p, 11, 5);
    if (v % 3 === 1) { // Glut sickert aus einer Fuge
      const x = (v * 5 + 3) & 15;
      p.px(x, 11, EMB[2]); p.px(x, 12, CRUST[4]); p.px(x + 1, 13, EMB[1]); p.px(x + 1, 14, CRUST[3]);
    }
    if (v === 4) { // beschädigter Fries
      p.rect(5, 5, 4, 4, OBS[2]); p.px(5, 5, OGROUT); p.px(8, 8, OBS[0]);
    }
    return p.canvas;
  };
  const makeLower = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, OGROUT);
    ashlar(p, 0, 5);
    // Goldleiste
    p.rect(0, 5, T, 1, GOLD[4]); p.rect(0, 6, T, 1, GOLD[2]); p.rect(0, 7, T, 1, OGROUT);
    p.px((v * 5) & 15, 5, GOLD[6]);
    // Obsidian-Paneele (8 px) mit gefasten Kanten und senkrechtem Spiegelglanz
    for (let i = 0; i < 2; i++) {
      const x = i * 8, k = (v + i) % 3 === 0 ? 2 : 3;
      p.rect(x, 8, 8, 8, OBS[k]);
      p.rect(x + 1, 8, 6, 1, OBS[k + 2]); p.rect(x, 8, 1, 8, OBS[k + 1]);
      p.rect(x + 7, 8, 1, 8, OBS[0]);
      p.rect(x + 2, 9, 1, 5, OBS[k + 1]); p.px(x + 2, 9, GLINT[0]);
      if ((v + i) % 4 === 1) { p.px(x + 4, 11, GOLD[3]); p.px(x + 5, 11, GOLD[2]); p.px(x + 4, 12, GOLD[1]); } // Goldniete
      if ((v * 3 + i) % 5 === 2) { p.px(x + 5, 12, EMB[1]); p.px(x + 5, 13, CRUST[4]); p.px(x + 6, 14, CRUST[3]); } // Glutriss
    }
    // Glutwiderschein von unten + Ruß
    p.ctx.fillStyle = 'rgba(4,2,4,0.45)'; p.ctx.fillRect(0, 12, T, 4);
    for (let x = 0; x < T; x++) if ((x + v) % 3 === 0) p.px(x, 15, CRUST[2]);
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(makeUpper(i)); lower.push(makeLower(i)); }
  return { upper, lower };
}

function throneTop(seed = 957) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#0b080d');
  for (let i = 0; i < 30; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#110c13', '#070509', '#16101a', '#0e0a10']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#050306');
  }
  p.px(rng.int(0, 15), rng.int(0, 15), CRUST[2]);
  return p.canvas;
}

// Lavasee: große, zähe Krustenschollen (Voronoi auf dem Torus → nahtlos) treiben auf
// hellglühender Schmelze; breite Spalten mit Hitzeverlauf, Blasen platzen.
function throneLiquid(seed = 977) {
  const rng = createRng(seed);
  const frames = [], glow = [];
  const seeds = [];
  for (const [x, y] of [[4, 5], [12, 3], [9, 12]]) seeds.push([x + rng.range(-1, 1), y + rng.range(-1, 1), rng.range(0, 6.28)]);
  const pops = [[3, 12, 0], [14, 8, 2]];
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T);
    const ph = (f / 4) * Math.PI * 2;
    const pts = seeds.map(([x, y, a]) => [x + Math.cos(ph + a) * 0.6, y + Math.sin(ph + a) * 0.45]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let d1 = 99, d2 = 99, ddx = 0, ddy = 0;
      for (const [sx, sy] of pts) {
        let dx = x + 0.5 - sx, dy = y + 0.5 - sy;
        if (dx > 8) dx -= 16; if (dx < -8) dx += 16; if (dy > 8) dy -= 16; if (dy < -8) dy += 16;
        const d = Math.hypot(dx, dy * 1.15);
        if (d < d1) { d2 = d1; d1 = d; ddx = dx; ddy = dy; } else if (d < d2) d2 = d;
      }
      const gap = d2 - d1;
      const th = (((x & 1) * 2 + (y & 1) * 3) % 4) / 4 * 0.45;
      const pulse = 0.3 * Math.sin(ph + x * 0.5 - y * 0.3);
      const v = gap + th - pulse * 0.5;
      let col, gl = null;
      if (v < 0.55) { col = EMB[5]; gl = EMB[4]; }
      else if (v < 1.1) { col = EMB[4]; gl = EMB[3]; }
      else if (v < 1.7) { col = EMB[3]; gl = EMB[2]; }
      else if (v < 2.3) { col = EMB[2]; gl = EMB[1]; }
      else if (v < 2.8) col = CRUST[4];
      else {
        // Kruste: glasig-schwarz, Licht von oben links, feine Glutrisse
        const lit = -(ddx + ddy) / 6;
        col = lit > 0.45 ? CRUST[3] : lit < -0.35 ? CRUST[0] : CRUST[1];
        if (lit > 0.75 && (x + y) % 3 === 0) col = OBS[5];
        if ((x * 5 + y * 3) % 17 === 0) col = CRUST[4];
      }
      p.px(x, y, col);
      if (gl) g.px(x, y, gl);
    }
    for (const [bx, by, t] of pops) {
      const st = (f + t) % 4;
      if (st === 0) { p.px(bx, by, EMB[5]); g.px(bx, by, EMB[5]); }
      else if (st === 1) { p.px(bx - 1, by, EMB[4]); p.px(bx + 1, by, EMB[4]); p.px(bx, by - 1, EMB[5]); g.px(bx, by - 1, EMB[5]); }
    }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  // Uferkante: Obsidianlippe mit Goldband, Glutkontaktlinie
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 1, GOLD[5]); e.rect(0, 1, T, 1, GOLD[3]); e.rect(0, 2, T, 1, GOLD[1]);
  for (let x = 3; x < T; x += 8) e.px(x, 1, GOLD[6]);
  e.rect(0, 3, T, 3, OBS[3]);
  for (let x = 0; x < T; x += 8) { e.rect(x, 3, 1, 3, OGROUT); e.px(x + 1, 3, OBS[5]); e.px(x + 3, 4, GLINT[0]); }
  for (let x = 0; x < T; x++) e.px(x, 5, x % 3 === 0 ? EMB[1] : CRUST[4]);
  for (let x = 0; x < T; x++) e.px(x, 6, x % 4 === 1 ? EMB[5] : EMB[4]);
  e.ctx.fillStyle = 'rgba(30,6,4,0.55)'; e.ctx.fillRect(0, 7, T, 2);
  e.ctx.fillStyle = 'rgba(30,6,4,0.25)'; e.ctx.fillRect(0, 9, T, 2);
  return { frames, glow, edge: e.canvas, edgeH: 7 };
}

// ------------------------------------------------------------ Thron-Props
function throneObsidianPillar(v) {
  const W = 18, H = 48, AX = 9, AY = 46;
  return prop(W, H, AX, AY, (p, G) => {
    // Goldsockel in zwei Stufen
    p.rect(0, 42, 18, 5, OBS[3]); p.rect(0, 42, 18, 1, OBS[5]); p.rect(0, 42, 2, 5, OBS[4]); p.rect(16, 42, 2, 5, OBS[1]); p.rect(1, 46, 16, 1, OBS[0]);
    for (let x = 0; x < 16; x++) { p.px(1 + x, 39, cylCol(GOLD, x, 16, 5)); p.px(1 + x, 40, cylCol(GOLD, x, 16, 3)); p.px(1 + x, 41, cylCol(GOLD, x, 16, 1)); }
    p.px(3, 39, GOLD[6]);
    const top = v ? 16 : 8;
    // Achtkantiger Schaft: vier sichtbare Facetten
    for (let y = top; y < 39; y++) {
      p.rect(2, y, 2, 1, OBS[3]); p.rect(4, y, 4, 1, OBS[5]); p.rect(8, y, 4, 1, OBS[3]); p.rect(12, y, 4, 1, OBS[1]);
      p.px(4, y, GLINT[0]); p.px(8, y, OBS[6]); p.px(12, y, OBS[2]);
    }
    // senkrechter Spiegelglanz und Glasschlieren
    for (let y = top + 2; y < 37; y++) if ((y % 9) < 6) p.px(5, y, (y % 9) === 2 ? GLINT[2] : GLINT[1]);
    for (const [x, y] of [[10, 14], [9, 22], [13, 28], [6, 33]]) if (y > top) { p.px(x, y, OBS[6]); p.px(x + 1, y + 1, OBS[1]); }
    // Goldbänder mit Zackenfries
    for (const y of [24, 34]) {
      for (let x = 0; x < 14; x++) { p.px(2 + x, y, cylCol(GOLD, x, 14, 5)); p.px(2 + x, y + 1, cylCol(GOLD, x, 14, 3)); }
      for (let x = 2; x < 16; x += 3) { p.px(x, y + 2, cylCol(GOLD, x - 2, 14, 2)); }
    }
    if (!v) {
      // Kapitell: Goldkragen, Obsidianblock, Flammenzacken aus Gold
      for (let x = 0; x < 16; x++) { p.px(1 + x, 6, cylCol(GOLD, x, 16, 4)); p.px(1 + x, 7, cylCol(GOLD, x, 16, 2)); }
      p.rect(0, 2, 18, 4, OBS[4]); p.rect(0, 2, 18, 1, OBS[6]); p.rect(15, 3, 3, 3, OBS[2]); obsGlint(p, 2, 3, 2);
      for (let x = 0; x < 18; x++) p.px(x, 1, cylCol(GOLD, x, 18, 5));
      for (const x of [1, 5, 9, 13, 16]) { p.px(x, 0, GOLD[x < 9 ? 6 : 4]); }
      p.px(9, 4, EMB[4]); p.px(8, 4, EMB[2]); G.px(9, 4, EMB[4]); G.px(8, 4, EMB[2]); // Glutstein im Kapitell
    } else {
      // Gebrochener Schaft mit glühenden Adern
      const jag = [1, 3, 2, 0, 1, 4, 2, 1, 3, 1, 0, 2, 1, 2];
      for (let x = 0; x < 14; x++) { p.rect(2 + x, top - jag[x], 1, jag[x] + 1, x < 2 ? OBS[3] : x < 6 ? OBS[5] : x < 10 ? OBS[3] : OBS[1]); p.px(2 + x, top - jag[x], GLINT[1]); }
      const vein = [[6, 17], [7, 18], [7, 19], [8, 20], [8, 21], [7, 22], [9, 26], [10, 27], [10, 28], [11, 29], [11, 30], [10, 31], [4, 30], [5, 31], [5, 32]];
      for (const [x, y] of vein) { p.px(x, y, (x + y) % 3 ? EMB[3] : EMB[4]); p.px(x + 1, y, CRUST[3]); G.px(x, y, EMB[3]); }
      // Trümmer am Fuß
      p.ellipse(15, 44, 3, 2, OBS[4]); p.px(14, 43, GLINT[1]); p.px(17, 45, OBS[1]);
      p.rect(0, 44, 3, 3, OBS[3]); p.px(0, 44, OBS[5]);
    }
  }, { glow: true, box: [-7, -5, 7, 1], light: v ? { dx: 0, dy: -18, radius: 34, color: [255, 110, 40], intensity: 0.45 } : undefined });
}

function throneGoldBrazier() {
  const W = 22, H = 36, AX = 11, AY = 35;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Drei Löwenfüße, Schaft mit Knäufen
    p.line(5, 26, 2, 34, GOLD[4]); p.line(6, 26, 3, 34, GOLD[2]);
    p.line(16, 26, 19, 34, GOLD[2]); p.line(15, 26, 18, 34, GOLD[1]);
    p.rect(10, 22, 2, 12, GOLD[3]); p.px(10, 23, GOLD[5]); p.rect(11, 23, 1, 11, GOLD[1]);
    for (const [x] of [[1], [10], [17]]) { p.rect(x, 34, 4, 1, GOLD[3]); p.px(x, 34, GOLD[5]); p.px(x + 3, 34, GOLD[1]); }
    p.ellipse(11, 28, 2.4, 1.6, GOLD[3]); p.px(10, 27, GOLD[6]); p.px(12, 29, GOLD[1]);
    p.ellipse(11, 22, 3, 1.5, GOLD[2]); p.px(10, 21, GOLD[5]);
    // Schale: gehämmertes Gold mit Obsidian-Einlage
    for (let y = 0; y < 8; y++) {
      const hw = 10 - y * 0.95, x0 = Math.round(11 - hw), x1 = Math.round(11 + hw) - 1;
      for (let x = x0; x <= x1; x++) p.px(x, 13 + y, cylCol(GOLD, x - x0, x1 - x0 + 1, y < 2 ? 4 : 3));
    }
    p.rect(1, 13, 20, 1, GOLD[5]); p.px(2, 13, GOLD[6]); p.px(3, 13, GOLD[6]);
    p.rect(3, 16, 16, 2, OBS[2]); p.rect(3, 16, 16, 1, OBS[4]);
    for (let x = 4; x < 18; x += 3) { p.px(x, 16, GOLD[4]); p.px(x, 17, GOLD[2]); }
    // Widderköpfe an den Seiten
    for (const [x, d] of [[0, -1], [21, 1]]) { p.px(x, 14, GOLD[d < 0 ? 5 : 2]); p.px(x, 15, GOLD[3]); p.px(x - d, 16, GOLD[d < 0 ? 4 : 1]); }
    // Glut
    p.rect(3, 11, 16, 2, CRUST[2]);
    for (let x = 3; x < 19; x++) if ((x * 7) % 3) p.px(x, 11 + (x & 1), x % 4 ? EMB[2] : EMB[4]);
    G.rect(3, 11, 16, 2, EMB[1]); for (let x = 3; x < 19; x += 3) G.px(x, 11 + (x & 1), EMB[3]);
    staticFlame(p, G, 11, 12, 11, 12, EMB, 9);
    p.px(5, 14, EMB[4]); p.px(16, 14, EMB[3]); G.px(5, 14, EMB[3]);
  }, { glow: true, box: [-6, -3, 6, 1], light: { dx: 0, dy: -20, radius: 84, color: [255, 150, 60], intensity: 1.05 } });
  o.flames = flameFrames(11, 12, 6, 37, EMB.concat([EMB[5]]));
  o.flameAt = { dx: -5, dy: -35 };
  o.embers = { dx: 0, dy: -30, rate: 1.2 };
  return o;
}

function throneAshStatue(v) {
  const W = 24, H = 46, AX = 12, AY = 45;
  return prop(W, H, AX, AY, (p, G) => {
    const A = ASH, cx = 12;
    // Sockel: Obsidian mit Goldplakette
    p.rect(1, 37, 22, 8, OBS[3]); p.rect(1, 37, 22, 1, OBS[5]); p.rect(1, 38, 1, 7, OBS[4]); p.rect(22, 38, 1, 7, OBS[1]); p.rect(2, 44, 20, 1, OBS[0]);
    p.rect(3, 34, 18, 3, OBS[4]); p.rect(3, 34, 18, 1, OBS[6]); p.rect(19, 35, 2, 2, OBS[2]);
    p.rect(8, 39, 8, 4, GOLD[3]); p.rect(8, 39, 8, 1, GOLD[5]); p.rect(15, 40, 1, 3, GOLD[1]); p.rect(9, 40, 6, 1, GOLD[2]); p.rect(9, 42, 5, 1, GOLD[2]);
    obsGlint(p, 3, 38, 3);
    const shade = (u) => (u < 0.1 ? A[3] : u < 0.32 ? A[5] : u < 0.58 ? A[4] : u < 0.82 ? A[3] : A[2]);
    const row = (y, hw, off = 0) => {
      const x0 = Math.round(cx - hw + off), x1 = Math.round(cx + hw + off - 1);
      for (let x = x0; x <= x1; x++) p.px(x, y, shade((x - x0 + 0.5) / (x1 - x0 + 1)));
      return [x0, x1];
    };
    if (v === 0) {
      // Gekrönter Kriegerkönig, Hände auf dem gesenkten Schwert
      for (let y = 21; y <= 33; y++) { const t = (y - 21) / 12; const [x0, x1] = row(y, 4.5 + t * 2.8); if (y > 23) { p.px(Math.round(cx - 1.5), y, A[2]); p.px(Math.round(cx + 2), y, A[1]); } if (y === 33) p.rect(x0, y, x1 - x0 + 1, 1, A[2]); }
      for (let y = 12; y < 21; y++) row(y, y < 14 ? 6 : y < 17 ? 5 : 4.4);
      p.rect(5, 12, 3, 3, A[6]); p.rect(16, 12, 3, 3, A[3]); p.px(5, 12, A[6]); p.px(18, 14, A[1]); // Schulterpanzer
      p.rect(8, 19, 8, 1, A[2]); p.px(11, 19, A[5]);
      // Kopf mit Krone
      p.rect(10, 6, 5, 6, A[4]); p.rect(10, 6, 2, 5, A[5]); p.px(14, 9, A[2]); p.px(11, 8, A[1]); p.px(13, 8, A[1]); p.rect(11, 11, 3, 1, A[2]);
      for (const [x, h] of [[9, 3], [11, 4], [13, 3], [15, 2]]) p.rect(x, 6 - h, 1, h, x < 12 ? GOLD[4] : GOLD[3]);
      p.rect(9, 5, 7, 1, GOLD[3]); p.px(9, 5, GOLD[5]); p.px(12, 5, EMB[3]); G.px(12, 5, EMB[3]);
      // Arme nach vorn, Hände auf dem Knauf
      p.line(6, 15, 9, 21, A[5]); p.line(7, 15, 10, 21, A[4]); p.line(18, 15, 15, 21, A[2]); p.line(17, 15, 14, 21, A[3]);
      p.rect(10, 20, 5, 3, A[5]); p.px(10, 20, A[6]);
      // Schwert (Stein) senkrecht nach unten
      p.rect(8, 23, 9, 1, A[5]); p.rect(11, 24, 3, 10, A[4]); p.rect(11, 24, 1, 10, A[6]); p.rect(13, 24, 1, 10, A[2]);
      // Glutrisse in der Asche
      for (const [x, y] of [[16, 26], [17, 27], [17, 28], [8, 30], [7, 31]]) { p.px(x, y, EMB[2]); G.px(x, y, EMB[2]); }
    } else {
      // Zerfallende Beschwörerin: Arme erhoben, rechte Seite zu Asche zerbröckelt
      for (let y = 18; y <= 33; y++) { const t = (y - 18) / 15; const [x0, x1] = row(y, 3.6 + t * 3.6); if (y > 20) for (const k of [-0.5, 0.2, 0.6]) { const fx = Math.round(cx + k * (3.6 + t * 3.6)); if (fx > x0 && fx < x1) p.px(fx, y, k < 0 ? A[6] : A[2]); } }
      for (let y = 11; y < 18; y++) row(y, y < 13 ? 4 : 3.6);
      // Kapuze
      for (let y = 4; y < 12; y++) row(y, y < 6 ? 2.6 : 3.6);
      p.rect(10, 7, 4, 4, A[0]); p.px(11, 9, EMB[3]); p.px(13, 9, EMB[3]); G.px(11, 9, EMB[4]); G.px(13, 9, EMB[4]);
      // Arme erhoben
      p.line(8, 12, 5, 6, A[5]); p.line(9, 12, 6, 6, A[4]); p.line(5, 6, 4, 2, A[5]); p.px(4, 1, A[6]); p.px(3, 2, A[5]);
      p.line(16, 12, 18, 8, A[3]); p.line(15, 12, 17, 8, A[2]); p.px(18, 7, A[1]); // Stumpf
      // Zerbröckelte Kante rechts: Löcher, Asche rieselt
      for (const [x, y] of [[16, 20], [17, 22], [16, 24], [18, 25], [17, 28], [18, 30], [15, 16], [16, 17]]) p.px(x, y, OGROUT);
      for (const [x, y] of [[19, 18], [20, 22], [20, 27], [19, 12]]) p.px(x, y, A[3]);
      // Aschehaufen auf dem Sockel
      p.ellipse(18, 34, 4, 1.6, A[3]); p.ellipse(17, 33.5, 2.6, 1, A[5]); p.px(20, 34, A[1]);
      for (const [x, y] of [[14, 20], [13, 21], [13, 22], [9, 28], [10, 29]]) { p.px(x, y, EMB[2]); G.px(x, y, EMB[2]); }
    }
  }, { glow: true, box: [-10, -6, 10, 1] });
}

function throneChainHang(v) {
  const W = 14, H = v ? 38 : 30, AX = 7, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    const chain = (x, y0, y1) => {
      for (let y = y0; y < y1; y += 3) {
        const side = ((y - y0) / 3) & 1;
        if (side) { p.rect(x, y, 1, 3, IRON[3]); p.px(x, y, IRON[5]); p.px(x, y + 2, IRON[1]); }
        else { p.rect(x - 1, y, 3, 3, IRON[3]); p.px(x, y + 1, '#07060a'); p.px(x - 1, y, IRON[5]); p.px(x + 1, y + 2, IRON[1]); p.px(x + 1, y + 1, IRON[2]); }
      }
    };
    if (v === 0) {
      // Zwei Ketten mit goldenen Fesseln, dazwischen ein Schädel
      chain(3, 0, H - 9); chain(10, 0, H - 12);
      for (const [x, y] of [[1, H - 9], [8, H - 12]]) {
        p.rect(x, y, 5, 4, GOLD[3]); p.rect(x, y, 5, 1, GOLD[5]); p.rect(x + 1, y + 1, 3, 2, '#07060a'); p.px(x + 4, y + 3, GOLD[1]); p.px(x, y + 3, GOLD[2]);
      }
      // Schädel an der rechten Fessel
      p.ellipse(10, H - 5, 2.6, 2.4, BONE[3]); p.ellipse(9.5, H - 5.5, 1.6, 1.4, BONE[4]);
      p.px(9, H - 5, '#0a0506'); p.px(11, H - 5, '#0a0506'); p.px(10, H - 3, BONE[1]); p.px(9, H - 2, BONE[2]); p.px(11, H - 2, BONE[2]);
    } else {
      // Kette mit Käfig; Knochen darin
      chain(7, 0, 12);
      p.rect(5, 12, 5, 1, GOLD[4]); p.px(5, 12, GOLD[6]);
      const top = 13, bot = H - 2;
      p.ellipse(7, top + 1, 6, 1.6, IRON[4]);
      for (const x of [1, 4, 7, 10, 13]) p.rect(x, top + 1, 1, bot - top - 1, x < 7 ? IRON[4] : x === 7 ? IRON[3] : IRON[2]);
      for (const x of [1, 4]) p.px(x, top + 2, IRON[6]);
      // Knochen / Schädel drinnen (hinter den Stäben)
      p.ellipse(8, bot - 4, 2.4, 2, BONE[2]); p.px(7, bot - 4, '#0a0506'); p.px(9, bot - 4, '#0a0506');
      p.line(3, bot - 2, 11, bot - 3, BONE[3]); p.px(5, bot - 7, BONE[3]); p.px(5, bot - 6, BONE[2]);
      for (const x of [4, 7, 10]) p.rect(x, bot - 7, 1, 6, x === 7 ? IRON[3] : IRON[4]);
      p.rect(0, bot - 1, 14, 2, IRON[3]); p.rect(0, bot - 1, 14, 1, IRON[5]); p.px(13, bot, IRON[1]);
      p.rect(0, top + 8, 14, 1, IRON[3]); p.px(0, top + 8, IRON[5]);
      p.px(6, bot + 1, GOLD[3]); p.px(8, bot + 1, GOLD[2]);
    }
  });
}

function throneBanner(v) {
  const W = 18, H = 48, AX = 9, AY = 47;
  return prop(W, H, AX, AY, (p, G) => {
    // Stange mit Speerspitze, Querstange, Dreifuß
    p.rect(8, 3, 2, 42, IRON[3]); p.rect(8, 3, 1, 42, IRON[5]);
    p.px(8, 0, GOLD[6]); p.rect(8, 1, 2, 2, GOLD[4]); p.px(9, 2, GOLD[2]); p.px(7, 2, GOLD[3]); p.px(10, 2, GOLD[2]);
    p.rect(1, 5, 16, 1, GOLD[4]); p.rect(1, 6, 16, 1, GOLD[2]); p.px(0, 5, GOLD[5]); p.px(17, 5, GOLD[3]); p.px(1, 5, GOLD[6]);
    p.line(8, 42, 4, 47, IRON[4]); p.line(9, 42, 13, 47, IRON[2]); p.rect(7, 45, 4, 3, IRON[2]); p.px(7, 45, IRON[5]);
    // Tuch
    const bottom = (x) => (v ? [34, 36, 31, 35, 38, 33, 30, 34, 37, 32, 35, 30, 33, 36][x - 2] : 36 - Math.abs(x - 8.5) * 0.9 + (Math.abs(x - 8.5) > 4 ? 3 : 0));
    for (let x = 2; x <= 15; x++) {
      const b = Math.round(bottom(x));
      for (let y = 7; y <= b; y++) {
        const fold = Math.sin((x - 2) * 0.9) * 0.5 + 0.5;
        let k = fold > 0.7 ? 4 : fold > 0.35 ? 3 : 2;
        if (x === 2) k = 4; if (x === 15) k = 1;
        p.px(x, y, RED[k]);
      }
      p.px(x, b, v ? CRUST[3] : GOLD[2]);
      if (v && (x % 3 === 0)) { p.px(x, b, EMB[3]); G.px(x, b, EMB[3]); if (x % 2) { p.px(x, b - 1, EMB[2]); G.px(x, b - 1, EMB[1]); } }
    }
    // Goldborte
    for (let y = 7; y < 30; y++) { p.px(3, y, GOLD[3]); p.px(14, y, GOLD[2]); }
    p.rect(3, 8, 12, 1, GOLD[4]);
    // Wappen: Flammenkrone
    const cx = 8.5;
    const sig = ['.#..#..#.', '.#.###.#.', '###.#.###', '#########', '.#######.', '..#####..'];
    for (let j = 0; j < sig.length; j++) for (let i = 0; i < 9; i++) if (sig[j][i] === '#') p.px(Math.round(cx - 4) + i, 13 + j, j < 3 ? GOLD[5] : GOLD[3]);
    p.px(Math.round(cx), 13, EMB[4]); G.px(Math.round(cx), 13, EMB[3]);
    p.rect(6, 21, 6, 1, GOLD[2]); p.px(8, 23, GOLD[3]); p.px(9, 24, GOLD[2]); p.px(8, 25, GOLD[2]);
    if (v) {
      // Brandlöcher, verkohlte Ränder
      for (const [x, y, r] of [[5, 26, 1.6], [12, 17, 1.2], [11, 29, 1.4]]) {
        p.ellipse(x, y, r + 0.8, r + 0.8, CRUST[2]);
        p.ctx.clearRect(Math.round(x - r + 0.5), Math.round(y - r + 0.5), Math.max(1, Math.round(r * 2 - 1)), Math.max(1, Math.round(r * 2 - 1)));
        p.px(x + Math.round(r), y, EMB[2]); G.px(x + Math.round(r), y, EMB[2]);
      }
    }
  }, { glow: true, box: [-4, -3, 4, 1] });
}

function throneDais() {
  const W = 56, H = 60, AX = 28, AY = 58;
  return prop(W, H, AX, AY, (p, G) => {
    // Drei Stufen, Goldkanten
    const step = (x0, x1, y, h) => {
      p.rect(x0, y, x1 - x0, h, OBS[3]);
      p.rect(x0, y, x1 - x0, 1, GOLD[4]); p.px(x0, y, GOLD[6]); p.rect(x0, y + 1, x1 - x0, 1, GOLD[1]);
      p.rect(x0, y + 2, 1, h - 2, OBS[5]); p.rect(x1 - 1, y + 2, 1, h - 2, OBS[1]);
      p.rect(x0 + 1, y + h - 1, x1 - x0 - 2, 1, OBS[1]);
      for (let x = x0 + 4; x < x1 - 3; x += 9) obsGlint(p, x, y + 3, 2);
    };
    step(0, 56, 50, 9); step(5, 51, 44, 7); step(10, 46, 38, 7);
    // Glutspalt in der untersten Stufe
    for (let x = 18; x < 38; x++) { if (x % 5 === 0) continue; p.px(x, 55, x % 3 ? EMB[2] : EMB[4]); G.px(x, 55, EMB[2]); }
    // Thron: Rückenlehne mit fünf Zacken
    const back = [[12, 10], [18, 4], [28, 0], [38, 4], [44, 10]];
    for (let x = 12; x <= 44; x++) {
      let top = 40;
      for (const [bx, by] of back) top = Math.min(top, by + Math.abs(x - bx) * 1.6);
      top = Math.max(0, Math.round(top));
      for (let y = top; y < 30; y++) {
        const u = (x - 12) / 32;
        p.px(x, y, u < 0.08 ? OBS[5] : u < 0.4 ? OBS[4] : u < 0.75 ? OBS[3] : OBS[2]);
      }
      p.px(x, top, GOLD[x < 28 ? 5 : 3]);
      if (top + 1 < 30) p.px(x, top + 1, GOLD[x < 28 ? 3 : 2]);
    }
    // Innenfeld der Lehne: Goldrahmen, Glutstein
    p.rect(20, 12, 17, 16, OBS[1]); p.rect(20, 12, 17, 1, GOLD[4]); p.rect(20, 12, 1, 16, GOLD[3]); p.rect(36, 12, 1, 16, GOLD[1]);
    for (let y = 14; y < 27; y += 2) { p.px(22, y, OBS[3]); p.px(34, y, OBS[2]); }
    p.ellipse(28, 17, 3, 3.4, CRUST[2]); p.ellipse(28, 17, 2, 2.4, EMB[3]); p.px(27, 16, EMB[5]); p.px(29, 18, EMB[2]);
    G.ellipse(28, 17, 4, 4.4, EMB[1]); G.ellipse(28, 17, 2, 2.4, EMB[3]); G.px(27, 16, EMB[5]);
    for (const [x, y] of [[24, 22], [32, 22], [28, 24]]) p.px(x, y, GOLD[3]);
    // Sitz mit rotem Kissen
    p.rect(14, 30, 29, 8, OBS[3]); p.rect(14, 30, 29, 1, OBS[5]); p.rect(14, 37, 29, 1, OBS[1]);
    p.rect(17, 28, 23, 3, RED[3]); p.rect(17, 28, 23, 1, RED[5]); p.rect(38, 29, 2, 2, RED[1]); p.px(18, 28, '#e06a52');
    p.rect(15, 33, 27, 1, GOLD[3]); p.px(15, 33, GOLD[5]);
    // Armlehnen mit Schädelknäufen
    for (const [x, lit] of [[9, true], [42, false]]) {
      p.rect(x, 24, 5, 14, lit ? OBS[4] : OBS[2]); p.rect(x, 24, 1, 14, lit ? OBS[6] : OBS[3]); p.rect(x + 4, 24, 1, 14, OBS[1]);
      p.rect(x, 24, 5, 1, GOLD[lit ? 5 : 3]);
      p.ellipse(x + 2, 21, 2.6, 2.4, BONE[3]); p.ellipse(x + 1.6, 20.5, 1.6, 1.4, BONE[4]); p.px(x + 1, 21, '#0a0506'); p.px(x + 3, 21, '#0a0506');
      p.px(x + 1, 21, EMB[3]); p.px(x + 3, 21, EMB[3]); G.px(x + 1, 21, EMB[3]); G.px(x + 3, 21, EMB[3]);
      p.px(x + 2, 23, BONE[1]);
    }
  }, { glow: true, box: [-26, -16, 26, 1], light: { dx: 0, dy: -40, radius: 46, color: [255, 110, 50], intensity: 0.6 } });
}

function throneEmberCrack(v) {
  const W = v ? 22 : 28, H = v ? 14 : 10, AX = W >> 1, AY = H - 1;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Hauptspalt + Seitenäste; breit = heiß
    const paths = v
      ? [[[2, 3], [6, 5], [9, 5], [11, 8], [14, 9], [19, 11]], [[9, 5], [12, 2], [15, 1]], [[11, 8], [8, 11], [7, 12]]]
      : [[[1, 5], [5, 4], [9, 6], [14, 5], [18, 7], [22, 6], [26, 4]], [[14, 5], [16, 2]], [[9, 6], [8, 8]]];
    const cells = [];
    for (const path of paths) for (let s = 0; s < path.length - 1; s++) {
      const [x0, y0] = path[s], [x1, y1] = path[s + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) cells.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), path === paths[0] && s > 0 && s < path.length - 2]);
    }
    // Versengter Rand
    for (const [x, y] of cells) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1], [0, 2]]) p.px(x + dx, y + dy, dy < 0 ? OBS[4] : OBS[1]);
    for (const [x, y, wide] of cells) {
      p.px(x, y, wide ? EMB[4] : EMB[2]); G.px(x, y, wide ? EMB[4] : EMB[2]);
      if (wide) { p.px(x, y + 1, EMB[2]); G.px(x, y + 1, EMB[2]); p.px(x, y - 1, CRUST[4]); }
    }
    for (const [x, y, wide] of cells) if (wide && (x + y) % 4 === 0) { p.px(x, y, EMB[5]); G.px(x, y, EMB[5]); }
    // Glutstaub und kleine Obsidiansplitter
    for (const [x, y] of v ? [[4, 9], [17, 4], [13, 12]] : [[3, 2], [21, 9], [11, 1]]) { p.px(x, y, OBS[5]); p.px(x + 1, y, GLINT[0]); }
  }, { glow: true, light: { dx: 0, dy: -4, radius: 34, color: [255, 110, 40], intensity: 0.55 } });
  o.embers = { dx: 0, dy: -4, rate: 0.8 };
  return o;
}

function throneTrophyRack() {
  const W = 32, H = 34, AX = 16, AY = 33;
  return prop(W, H, AX, AY, (p) => {
    // Gestell: Obsidianpfosten mit Goldkappen, zwei Querbalken
    for (const [x, lit] of [[2, true], [27, false]]) {
      p.rect(x, 6, 3, 27, lit ? OBS[4] : OBS[2]); p.rect(x, 6, 1, 27, lit ? OBS[6] : OBS[3]); p.rect(x + 2, 6, 1, 27, OBS[1]);
      p.rect(x - 1, 4, 5, 2, GOLD[lit ? 4 : 3]); p.px(x - 1, 4, GOLD[6]); p.px(x + 1, 3, GOLD[5]);
      p.rect(x - 1, 32, 5, 1, GOLD[2]);
    }
    for (const y of [9, 26]) { p.rect(3, y, 26, 2, OBS[3]); p.rect(3, y, 26, 1, OBS[5]); p.rect(3, y + 2, 26, 1, OBS[0]); }
    // Gekreuzte Klingen hinter dem Schild
    p.line(7, 12, 23, 30, IRON[5]); p.line(8, 12, 24, 30, IRON[3]); p.px(7, 12, IRON[6]);
    p.line(24, 12, 8, 30, IRON[4]); p.line(23, 12, 7, 30, IRON[5]);
    p.rect(20, 27, 5, 1, GOLD[4]); p.rect(7, 27, 5, 1, GOLD[3]);
    p.rect(22, 28, 2, 3, RED[3]); p.rect(8, 28, 2, 3, RED[2]);
    // Rundschild mit Flammenkrone
    p.ellipse(16, 19, 6.5, 6.5, GOLD[2]); p.ellipse(15.5, 18.5, 5.5, 5.5, RED[3]); p.ellipse(15, 18, 4, 4, RED[4]);
    for (let a = Math.PI * 0.9; a < Math.PI * 1.7; a += 0.1) p.px(Math.round(16 + Math.cos(a) * 6.4), Math.round(19 + Math.sin(a) * 6.4), GOLD[5]);
    p.ellipse(16, 19, 1.8, 1.8, GOLD[4]); p.px(15, 18, GOLD[6]); p.px(17, 20, GOLD[2]);
    for (const [x, y] of [[12, 15], [20, 15], [11, 21], [21, 22]]) p.px(x, y, GOLD[3]);
    // Gehörnte Schädel auf dem oberen Balken
    for (const [x, big] of [[8, false], [16, true], [24, false]]) {
      const r = big ? 2.8 : 2.2;
      p.ellipse(x, 6, r, r * 0.9, BONE[3]); p.ellipse(x - 0.4, 5.5, r - 1, r - 1.2, BONE[4]);
      p.px(x - 1, 6, '#0a0506'); p.px(x + 1, 6, '#0a0506'); p.px(x, 8, BONE[1]);
      p.line(x - r, 5, x - r - 2, 1, BONE[3]); p.px(x - r - 2, 0, BONE[4]);
      p.line(x + r, 5, x + r + 2, 1, BONE[2]); p.px(x + r + 2, 0, BONE[3]);
    }
    // Speer schräg angelehnt
    p.line(29, 33, 31, 2, '#4a3222'); p.px(31, 1, IRON[5]); p.px(31, 0, IRON[6]); p.px(30, 2, IRON[4]);
  }, { box: [-14, -4, 14, 1] });
}

// ================================================================== Einstieg
const CACHE = {};
export function createBiomeTiles3(biome = 'rime') {
  if (CACHE[biome]) return CACHE[biome];
  let out;
  if (biome === 'throne') {
    out = {
      floor: throneFloor(),
      faces: throneFaces(),
      top: throneTop(),
      topEdge: '#2a2032', topEdgeLight: '#6e4a24',
      liquid: throneLiquid(),
      ambientTint: [255, 105, 60],
      props: {
        obsidianPillar: [throneObsidianPillar(0), throneObsidianPillar(1)],
        goldBrazier: throneGoldBrazier(),
        ashStatue: [throneAshStatue(0), throneAshStatue(1)],
        chainHang: [throneChainHang(0), throneChainHang(1)],
        banner: [throneBanner(0), throneBanner(1)],
        throneDais: throneDais(),
        emberCrack: [throneEmberCrack(0), throneEmberCrack(1)],
        trophyRack: throneTrophyRack(),
      },
    };
  } else {
    out = {
      floor: rimeFloor(),
      faces: rimeFaces(),
      top: rimeTop(),
      topEdge: '#24324a', topEdgeLight: '#4e6a88',
      liquid: rimeLiquid(),
      ambientTint: [120, 190, 255],
      props: {
        iceColumn: [rimeIceColumn(0), rimeIceColumn(1)],
        crystalCluster: [rimeCrystals(0), rimeCrystals(1), rimeCrystals(2)],
        frozenWarrior: [rimeFrozenWarrior(0), rimeFrozenWarrior(1)],
        icicles: [rimeIcicles(0), rimeIcicles(1)],
        frostBrazier: rimeFrostBrazier(),
        frozenFall: rimeFrozenFall(),
        snowPile: [rimeSnowPile(0), rimeSnowPile(1)],
      },
    };
  }
  CACHE[biome] = out;
  return out;
}
