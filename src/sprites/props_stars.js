import { createRng, hash2 } from '../core/math.js';
import { mk, fpoly, lump } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import { prism, roots, crystals, roseRocks, ruinPillar, aurelStatue, lantern, shardSpire } from './decor_astral.js';
import { shardRock, mirrorStone, lensStand, crateStack } from './decor_shards.js';

// Deko der drei Dungeons der Sternenscherben (biome_thorn, biome_glass, biome_vault): Säulen mit Dornenranken,
// Blütenurnen, überwachsene Särge und die Herzknospe Ysgarns; Kristallsäulen, Gläserne Gefangene und der
// Splitterthron Kaldris'; Bücherwände, Planetenmodell, Fernrohr und das Sternpodest Königin Ysmeines.
// Dazu passende Stücke der Außengebiete (Wurzeln, Kristalle, Ruinen, Spiegelsteine). Alles Stufe B (fein),
// Licht von links oben, Leuchtendes zusätzlich auf der Leuchtebene. Wandstücke (Ranken, Banner, Leuchter)
// hängen an der Mauerkachel über dem Boden: Anker unten, keine Kollision.

const PEARL = ['#1c1a2a', '#2c2840', '#3e3856', '#544c6c', '#6c6486', '#8a83a2', '#aaa4c0'];
const MOSS = ['#0e1a14', '#18291e', '#243c2a', '#325236', '#456a42', '#5e8650', '#7ea466'];
const ROOT = ['#120c10', '#1e141a', '#2c1e24', '#3e2a2e', '#523a38', '#6a4c44'];
const BLOS = ['#3a1630', '#5a2448', '#8a3a6a', '#c86a98', '#eca0c0', '#ffd8ea'];
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const GLASS = ['#0e1a2a', '#1a2e44', '#2a4a66', '#44708e', '#74a4c0', '#b4dcec', '#eefaff'];
const LILAC = ['#1e1438', '#3a2a68', '#5a46a0', '#8a74d0', '#c4b4f4', '#f4f0ff'];
const SIL = ['#1a1e2c', '#2a3044', '#4a5470', '#6e7a98', '#9aa6c2', '#cad4ea', '#f2f6ff'];
const SKY = ['#0c1222', '#16203a', '#22305a', '#32467a', '#4a62a0'];
const NV = ['#070914', '#0e1224', '#161c36', '#20284a', '#2c3660', '#3c4878', '#52609a'];
const GOLD = ['#3a2810', '#6a4a1a', '#9c7028', '#cc9c3c', '#ecc862', '#fff0b0'];
const WOOD = ['#140c10', '#22161a', '#342220', '#4a3028', '#624032', '#7c5440'];
const PAPER = ['#5a5040', '#8a7c62', '#b8a888', '#ddd0b0', '#f4ecd4'];
const INK = ['#1a2a5a', '#2a4a8a'];
const FLAME = ['#5a2a10', '#c4641c', '#f0a040', '#ffd88a', '#fff6dc'];
const BOOKS = [['#3a1420', '#5a2030', '#7a3044'], ['#14243a', '#20385a', '#2e4e78'], ['#14302a', '#1e4a3e', '#2e6654'], ['#2a1a3a', '#40285a', '#5a3a7a'], ['#3a2a10', '#5a4218', '#7a5a24']];
const PINK_LIGHT = [255, 150, 210], CRY_LIGHT = [130, 230, 255], GOLD_LIGHT = [255, 214, 140], STAR_LIGHT = [190, 200, 255];

function footShade(p, cx, cy, rx, ry) {
  const A = [col32('#06050c'), col32('#0c0a16')];
  p.scan(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return d > 1 ? 0 : d > 0.55 ? A[1] : A[0];
  });
}
// Senkrechter Zylinder (Licht links): Stufe nach Lage im Querschnitt
const cyl = (R, t, base) => R[Math.max(0, Math.min(R.length - 1, t < 0.14 ? base - 1 : t < 0.38 ? base + 1 : t < 0.64 ? base : t < 0.86 ? base - 1 : base - 2))];
function column(p, cx, top, bottom, w, R, base = 3) {
  p.each(cx - w / 2, top, cx + w / 2, bottom, (x) => cyl(R, (x - (cx - w / 2)) / w, base));
}
// Gefaster Quader (Licht oben links)
function block(p, x, y, w, h, R, base = 3) {
  p.rect(x, y, w, h, R[base]);
  p.rect(x, y, w, 1, R[base + 2] ?? R[R.length - 1]); p.rect(x, y, 1, h, R[base + 1]);
  p.rect(x + w - 1, y + 1, 1, h - 1, R[base - 1]); p.rect(x, y + h - 1, w, 1, R[Math.max(0, base - 2)]);
}
// Strang (Ranke/Wurzel) entlang Punkten, Breite w0 → w1, Oberkante hell
function vine(p, pts, w0, w1, R, k = 3) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], w = w0 + ((w1 - w0) * i) / pts.length;
    p.fline(ax, ay + w * 0.3, bx, by + w * 0.3, R[k - 1], w);
    p.fline(ax, ay, bx, by, R[k], w * 0.7);
    p.fline(ax, ay - w * 0.25, bx, by - w * 0.25, R[k + 1], 0);
  }
}
const leaf = (p, x, y, dir, R = MOSS) => { p.dot(x, y, R[5]); p.dot(x + dir * 0.5, y - 0.5, R[6]); p.dot(x + dir, y, R[4]); p.dot(x + dir * 0.5, y + 0.5, R[3]); };
function bloom(p, g, x, y, r = 1.6, R = BLOS) {
  p.oval(x, y, r, r * 0.85, R[3]); p.oval(x - r * 0.3, y - r * 0.3, r * 0.55, r * 0.45, R[4]);
  p.dot(x, y, R[5]); p.dot(x + r * 0.5, y + r * 0.4, R[2]);
  if (g) g.oval(x, y, r * 0.8, r * 0.7, R[2]);
}

// ================================================================== Rankengruft
function thornPillar(v) {
  const W = 24, H = v ? 40 : 50, cx = 12, base = H - 2, top = v ? 9 : 7, rng = createRng(5100 + v);
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 10, 2.6);
    block(p, cx - 8, base - 5, 16, 5, PEARL, 3);
    column(p, cx, top + 4, base - 5, 10, PEARL, 4);
    for (let y = top + 9; y < base - 6; y += 7) p.fline(cx - 4.5, y, cx + 4.5, y, PEARL[2], 0);
    if (v) {
      // abgebrochen: gezackte Bruchkante, Splitter am Fuß
      fpoly(p, [[cx - 5, top + 4], [cx - 2, top], [cx, top + 3], [cx + 3, top - 1], [cx + 5, top + 4]], (x) => (x < cx ? PEARL[5] : PEARL[3]));
      p.oval(cx + 9, base - 1, 2, 1.2, PEARL[3]); p.dot(cx + 8.5, base - 1.6, PEARL[5]);
    } else {
      block(p, cx - 7, top, 14, 4, PEARL, 4);
      block(p, cx - 6, top - 3, 12, 3, PEARL, 3);
    }
    // Dornenranke windet sich um den Schaft: vorne sichtbar, hinten verdeckt
    let prev = null;
    for (let s = 0; s <= 1; s += 0.02) {
      const y = base - 6 - s * (base - top - 10), a = s * Math.PI * 4.6 + v * 2, x = cx + Math.sin(a) * 6, front = Math.cos(a) > -0.15;
      if (prev && front && prev[2]) {
        p.fline(prev[0], prev[1] + 0.6, x, y + 0.6, MOSS[1], 1.6);
        p.fline(prev[0], prev[1], x, y, MOSS[3], 1.1);
        p.fline(prev[0], prev[1] - 0.4, x, y - 0.4, MOSS[4], 0);
        if (hash2(Math.round(s * 50), v, 51) < 0.28) leaf(p, x, y - 1, Math.sin(a) > 0 ? 1 : -1);
        if (hash2(Math.round(s * 50), v, 52) < 0.22) p.dot(x + 1, y + 1, ROOT[5]);
        if (hash2(Math.round(s * 50), v, 53) < 0.06) bloom(p, g, x, y - 1.5, 1.6);
      }
      prev = [x, y, front];
    }
    // Moos am Sockel
    for (let i = 0; i < 9; i++) { const x = cx - 8 + rng.range(0, 16); p.dot(x, base - 5 + rng.range(0, 1), MOSS[rng.pick([3, 4, 5])]); }
  }, { ax: cx, ay: base, b: true, box: [-6, -4, 6, 1] });
}

function bloomUrn() {
  const W = 22, H = 30, cx = 11, base = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 8, 2);
    // Urne aus Perlstein
    block(p, cx - 4, base - 3, 8, 3, PEARL, 3);
    p.each(cx - 7, base - 13, cx + 7, base - 3, (x, y) => {
      const k = (y - (base - 13)) / 10, hw = 6.5 - Math.abs(k - 0.35) * 5;
      if (Math.abs(x - cx) > hw) return null;
      return cyl(PEARL, (x - (cx - hw)) / (2 * hw), 4);
    });
    block(p, cx - 8, base - 15, 16, 2, PEARL, 4);
    p.fline(cx - 5, base - 9, cx + 5, base - 9, PEARL[2], 0);
    // Blütenbusch
    for (const [x, y, r] of [[cx - 5, base - 17, 3.4], [cx + 4, base - 18, 3.6], [cx, base - 20, 4]]) lump(p, x, y, r, r * 0.8, MOSS, { lo: 1, hi: 5 });
    for (const [x, y] of [[cx - 5, base - 19], [cx + 1, base - 23], [cx + 5, base - 20], [cx - 1, base - 18], [cx + 3, base - 16]]) bloom(p, g, x, y, 1.7);
    g.oval(cx, base - 20, 4, 3, BLOS[1]);
  }, { ax: cx, ay: base, b: true, box: [-6, -4, 6, 1], light: { dx: 0, dy: -20, radius: 46, color: PINK_LIGHT, intensity: 0.5 } });
}

function lampFlower(v) {
  const W = 16, H = 36, cx = 8, base = H - 2, pal = v ? CRY : BLOS;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 5, 1.4);
    vine(p, [[cx, base], [cx - 1.5, base - 10], [cx + 1, base - 20], [cx, base - 26]], 1.4, 1, MOSS, 3);
    leaf(p, cx - 3, base - 8, -1); leaf(p, cx + 2, base - 14, 1); leaf(p, cx - 2, base - 19, -1);
    // Leuchtknospe
    p.oval(cx, base - 29, 3.6, 4.4, pal[2]);
    p.oval(cx - 0.8, base - 30, 2.4, 3, pal[3]);
    p.oval(cx - 1.2, base - 31, 1.2, 1.4, pal[4]); p.dot(cx - 1.5, base - 31.5, pal[5]);
    p.fline(cx, base - 25, cx, base - 33, pal[1], 0);
    for (const dx of [-3, 3]) p.fline(cx, base - 25, cx + dx, base - 27, MOSS[4], 0.5);
    g.oval(cx, base - 29, 4, 4.6, pal[2]); g.oval(cx, base - 29.5, 2, 2.4, pal[4]);
  }, { ax: cx, ay: base, b: true, box: [-2, -2, 2, 1], light: { dx: 0, dy: -29, radius: 52, color: v ? CRY_LIGHT : PINK_LIGHT, intensity: 0.7 } });
}

function seedCoffin() {
  const W = 38, H = 26, cx = 19, base = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 17, 2.4);
    block(p, cx - 16, base - 10, 32, 10, PEARL, 2);
    for (let x = cx - 12; x <= cx + 12; x += 8) p.fline(x, base - 8, x, base - 2, PEARL[1], 0);
    block(p, cx - 17, base - 17, 34, 7, PEARL, 4);
    // Relief: Ranke mit Blatt auf dem Deckel
    p.fline(cx - 11, base - 13, cx + 11, base - 13, PEARL[3], 0);
    for (let x = cx - 9; x <= cx + 9; x += 4.5) { p.dot(x, base - 14.5, PEARL[6]); p.dot(x + 1, base - 12, PEARL[2]); }
    // Wurzeln und Moos überwuchern den Sarg
    vine(p, [[cx - 18, base - 1], [cx - 12, base - 9], [cx - 6, base - 16], [cx + 2, base - 15], [cx + 6, base - 9]], 2.2, 1, ROOT, 3);
    vine(p, [[cx + 18, base], [cx + 13, base - 6], [cx + 10, base - 15]], 1.8, 1, ROOT, 3);
    for (let i = 0; i < 18; i++) { const x = cx - 15 + hash2(i, 3, 61) * 30, y = base - 17 + hash2(i, 4, 61) * 2.4; p.dot(x, y, MOSS[i % 3 ? 4 : 5]); p.dot(x + 0.5, y + 0.5, MOSS[3]); }
    bloom(p, g, cx + 2, base - 16.5, 1.5); bloom(p, g, cx - 13, base - 7, 1.3);
  }, { ax: cx, ay: base, b: true, box: [-16, -8, 16, 1] });
}

function thornThicket(v) {
  const W = 34, H = 24, cx = 17, base = H - 3, rng = createRng(5200 + v);
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 15, 2.6);
    for (let i = 0; i < 9; i++) {
      const x0 = cx + rng.range(-12, 12), dir = rng.chance(0.5) ? 1 : -1, h = rng.range(8, 17);
      const pts = [[x0, base], [x0 + dir * 3, base - h * 0.45], [x0 + dir * 1, base - h * 0.8], [x0 - dir * 3, base - h]];
      vine(p, pts, 1.6, 0.6, i % 3 ? ROOT : MOSS, 3);
      for (let s = 1; s < 4; s++) { const [x, y] = pts[s]; p.dot(x + dir, y, ROOT[5]); p.dot(x - dir, y + 1.5, ROOT[4]); }
      if (i % 2) leaf(p, pts[2][0], pts[2][1], dir);
    }
    for (let i = 0; i < 3 + v; i++) bloom(p, g, cx + rng.range(-10, 10), base - rng.range(6, 14), 1.3);
  }, { ax: cx, ay: base, b: true, box: [-12, -5, 12, 1] });
}

function heartBud() {
  const W = 52, H = 54, cx = 26, base = H - 3, top = 5, bot = base - 8, L = bot - top;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 22, 4);
    // Wurzelsockel
    for (const [dx, k] of [[-19, 1], [-11, 0], [11, 0], [20, 1]]) vine(p, [[cx + dx, base], [cx + dx * 0.6, base - 4], [cx + dx * 0.25, base - 8]], 3 - k, 2, ROOT, 3);
    lump(p, cx, base - 5, 12, 4.5, ROOT, { lo: 1, hi: 5 });
    // Knospe: Tropfenform aus fünf Blütenblättern, Nähte laufen zur Spitze zusammen, die Mitte klafft und leuchtet
    const wAt = (t) => 25.7 * Math.pow(Math.max(0, t), 0.65) * Math.pow(Math.max(0, 1.2 - t), 0.55);
    const seams = [-0.74, -0.32, 0, 0.32, 0.74];
    p.each(cx - 15, top, cx + 15, bot, (x, y) => {
      const t = (y - top) / L, w = wAt(t), u = (x - cx) / Math.max(w, 0.01);
      if (Math.abs(u) > 1 || w < 0.4) return null;
      const k = 0.5 + 0.5 * t, S = seams.map((s) => s * k);
      let a = -1, b = 1;
      for (const sv of S) { if (sv <= u) a = sv; else { b = sv; break; } }
      const d = Math.min(u - a, b - u);
      if (Math.abs(u) < 0.045 && t > 0.18 && t < 0.92) return t > 0.3 && t < 0.8 ? BLOS[5] : BLOS[4];
      if (d < 0.05 && a > -1 && b < 1) return BLOS[0];
      const v = (u - a) / (b - a), outer = Math.abs((a + b) / 2) > 0.5;
      let i = (outer ? 2 : 3) + (v < 0.32 ? 1 : v > 0.78 ? -1 : 0) + (u < -0.2 ? 0 : u > 0.5 ? -1 : 0);
      if (t < 0.14) i = Math.max(i, 4);
      if (t > 0.9) i -= 1;
      return BLOS[Math.max(0, Math.min(5, i))];
    });
    // Kelchblätter umfassen den Fuß
    const sep = (pts) => fpoly(p, pts, (x, y) => MOSS[x < cx - 6 ? 5 : x > cx + 6 ? 3 : (y < bot - 6 ? 5 : 4)]);
    sep([[cx - 2, bot + 1], [cx - 14, bot - 3], [cx - 15, bot - 17], [cx - 8, bot - 7]]);
    sep([[cx + 2, bot + 1], [cx + 14, bot - 3], [cx + 15, bot - 16], [cx + 8, bot - 7]]);
    sep([[cx - 6, bot + 1], [cx, bot - 12], [cx + 6, bot + 1]]);
    p.fline(cx - 15, bot - 17, cx - 9, bot - 6, MOSS[6], 0); p.fline(cx, bot - 12, cx - 3, bot - 2, MOSS[6], 0);
    for (const [x, y] of [[cx - 14, bot - 26], [cx + 14, bot - 30]]) bloom(p, g, x, y, 1.4);
    g.fline(cx, top + L * 0.2, cx, top + L * 0.9, BLOS[3], 1.6);
    g.oval(cx, top + L * 0.55, 4, 11, BLOS[1]);
  }, { ax: cx, ay: base, b: true, box: [-14, -7, 14, 1], light: { dx: 0, dy: -26, radius: 96, color: PINK_LIGHT, intensity: 0.85 } });
}

function hangingRoots(v) {
  const W = 18, H = 26, rng = createRng(5300 + v);
  return mk(W, H, (p, g) => {
    for (let i = 0; i < 4 + v; i++) {
      const x0 = 2 + rng.range(0, 14), len = rng.range(10, 23), sway = rng.range(-2, 2);
      vine(p, [[x0, 0], [x0 + sway, len * 0.5], [x0 + sway * 0.4, len]], 1.6, 0.5, ROOT, 3);
      if (i % 2) leaf(p, x0 + sway, len * 0.55, sway > 0 ? 1 : -1);
    }
    for (let x = 1; x < 17; x += 1.5) p.dot(x, rng.range(0, 2), MOSS[rng.pick([3, 4, 5])]);
    if (v) bloom(p, g, 9, 14, 1.4);
  }, { ax: 9, ay: H - 1, b: true });
}

// Wandleuchter: Halterung, leuchtender Kern (Blüte, Kristall oder Stern)
function sconce(kind) {
  const W = 14, H = 20, cx = 7, base = H - 1;
  const pal = kind === 'thorn' ? BLOS : kind === 'glass' ? CRY : GOLD;
  const metal = kind === 'vault' ? GOLD : SIL;
  return mk(W, H, (p, g) => {
    p.fline(cx, base - 2, cx, base - 9, metal[2], 1);
    p.fline(cx - 3, base - 9, cx + 3, base - 9, metal[3], 1);
    p.fline(cx - 3, base - 9, cx - 2, base - 13, metal[3], 0.5); p.fline(cx + 3, base - 9, cx + 2, base - 13, metal[2], 0.5);
    p.dot(cx, base - 1.5, metal[4]);
    if (kind === 'glass') prism(p, g, cx, base - 10, cx, base - 18, 2.4, CRY);
    else {
      p.oval(cx, base - 13, 2.8, 3.2, pal[2]); p.oval(cx - 0.6, base - 13.6, 1.6, 2, pal[3]); p.dot(cx - 1, base - 14.5, pal[5]);
      g.oval(cx, base - 13, 3.4, 3.8, pal[2]); g.oval(cx, base - 13, 1.6, 1.8, pal[4]);
    }
  }, { ax: cx, ay: base, b: true, light: { dx: 0, dy: -14, radius: 64, color: kind === 'thorn' ? PINK_LIGHT : kind === 'glass' ? CRY_LIGHT : GOLD_LIGHT, intensity: 0.8 } });
}

// ================================================================== Gläserne Hallen
function glassPillar(v) {
  const W = 22, H = v ? 44 : 56, cx = 11, base = H - 2, top = v ? 10 : 8;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 9, 2.4);
    block(p, cx - 8, base - 4, 16, 4, SIL, 3);
    block(p, cx - 6, base - 6, 12, 2, SIL, 4);
    // Schaft: drei Facetten (links Licht, Mitte, rechts Schatten), Kanten hell
    p.each(cx - 5, top + 2, cx + 5, base - 6, (x, y) => {
      const t = (x - (cx - 5)) / 10, k = t < 0.3 ? 4 : t < 0.7 ? 3 : 1;
      const glint = hash2(Math.floor(x * 2), Math.floor(y * 2), 77) < 0.03;
      return GLASS[glint ? 6 : k + (((y + x * 0.4) | 0) % 9 === 0 ? 1 : 0)];
    });
    p.fline(cx - 2, top + 2, cx - 2, base - 6, GLASS[6], 0); p.fline(cx + 2, top + 2, cx + 2, base - 6, GLASS[2], 0);
    g.fline(cx, top + 4, cx, base - 8, GLASS[2], 1);
    if (v) {
      prism(p, g, cx - 2, top + 3, cx - 3, top - 6, 3, GLASS);
      prism(p, g, cx + 3, top + 3, cx + 5, top - 2, 2, GLASS);
    } else {
      block(p, cx - 7, top - 2, 14, 4, SIL, 4);
      prism(p, g, cx, top - 2, cx, top - 8, 3.4, CRY);
    }
  }, { ax: cx, ay: base, b: true, box: [-6, -4, 6, 1], light: { dx: 0, dy: -H * 0.6, radius: 40, color: CRY_LIGHT, intensity: 0.32 } });
}

// Gläserner Gefangener: Mensch im Glas eingeschlossen (Haltung je Variante)
function glassPrisoner(v) {
  const W = 26, H = 42, cx = 13, base = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 11, 2.4);
    block(p, cx - 10, base - 3, 20, 3, SIL, 2);
    // Glasblock (unregelmäßig gebrochene Oberkante)
    const topY = (x) => base - 34 + Math.abs(Math.sin(x * 0.9 + v)) * 3;
    p.each(cx - 9, base - 38, cx + 9, base - 3, (x, y) => {
      if (y < topY(x)) return null;
      const t = (x - (cx - 9)) / 18;
      return GLASS[t < 0.18 ? 4 : t > 0.85 ? 1 : 2];
    });
    // Gestalt im Glas: dunkle Silhouette mit hellem Saum
    const F = ['#0a1220', '#142236', '#2a4a6a'];
    p.oval(cx, base - 27, 2.6, 3, F[1]);
    fpoly(p, [[cx - 4, base - 23], [cx + 4, base - 23], [cx + 3, base - 12], [cx - 3, base - 12]], F[1]);
    fpoly(p, [[cx - 3, base - 12], [cx - 0.5, base - 12], [cx - 1, base - 4], [cx - 3, base - 4]], F[0]);
    fpoly(p, [[cx + 0.5, base - 12], [cx + 3, base - 12], [cx + 3, base - 4], [cx + 1, base - 4]], F[0]);
    if (v === 0) { p.fline(cx - 4, base - 22, cx - 2, base - 27, F[1], 1.4); p.fline(cx + 4, base - 22, cx + 2, base - 27, F[1], 1.4); }   // Hände vor dem Gesicht
    else { p.fline(cx - 4, base - 22, cx - 7, base - 31, F[1], 1.4); p.fline(cx + 4, base - 22, cx + 6, base - 30, F[1], 1.4); }    // Arme gegen das Glas
    p.fline(cx - 2.6, base - 29, cx - 4, base - 22, F[2], 0); p.fline(cx - 4, base - 22, cx - 3, base - 12, F[2], 0);
    // Glanz, Sprünge, Kanten
    p.fline(cx - 7, base - 30, cx - 7, base - 8, GLASS[5], 0); p.fline(cx - 6, base - 31, cx - 4, base - 33, GLASS[6], 0);
    p.fline(cx + 4, base - 18, cx + 7, base - 13, GLASS[5], 0); p.fline(cx + 7, base - 13, cx + 6, base - 9, GLASS[4], 0);
    p.each(cx - 9, base - 38, cx + 9, base - 3, (x, y) => (Math.abs(y - topY(x)) < 0.5 ? GLASS[6] : null));
    g.fline(cx - 2.6, base - 29, cx - 4, base - 22, CRY[2], 0); g.oval(cx, base - 27, 1.2, 1.4, CRY[1]);
  }, { ax: cx, ay: base, b: true, box: [-9, -5, 9, 1] });
}

function prismLamp() {
  const W = 14, H = 38, cx = 7, base = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 5, 1.4);
    for (const dx of [-4, 0, 4]) p.fline(cx, base - 6, cx + dx, base, dx < 0 ? SIL[4] : SIL[2], 0.6);
    p.fline(cx, base - 6, cx, base - 24, SIL[3], 1); p.fline(cx - 0.4, base - 6, cx - 0.4, base - 24, SIL[5], 0);
    p.fline(cx - 3, base - 24, cx + 3, base - 24, SIL[4], 1);
    prism(p, g, cx, base - 25, cx, base - 35, 3, CRY);
  }, { ax: cx, ay: base, b: true, box: [-3, -2, 3, 1], light: { dx: 0, dy: -30, radius: 60, color: CRY_LIGHT, intensity: 0.7 } });
}

function splinterThrone() {
  const W = 56, H = 62, cx = 28, base = H - 3;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 24, 4);
    block(p, cx - 22, base - 5, 44, 5, SIL, 2);
    block(p, cx - 17, base - 9, 34, 4, SIL, 3);
    // Splitterkrone hinter dem Sitz
    for (const [dx, h, w, pal] of [[-15, 26, 3.5, LILAC], [15, 28, 3.5, LILAC], [-9, 38, 4, GLASS], [9, 40, 4, GLASS], [0, 50, 5, CRY]]) prism(p, g, cx + dx, base - 10, cx + dx * 1.25, base - 10 - h, w, pal);
    // Sitz aus Glas
    block(p, cx - 10, base - 22, 20, 13, GLASS, 3);
    block(p, cx - 11, base - 25, 22, 3, SIL, 4);
    p.fline(cx - 8, base - 20, cx - 8, base - 11, GLASS[6], 0);
    g.oval(cx, base - 34, 6, 10, CRY[1]);
  }, { ax: cx, ay: base, b: true, box: [-18, -10, 18, 1], light: { dx: 0, dy: -36, radius: 100, color: [170, 210, 255], intensity: 0.8 } });
}

function glassBanner() {
  const W = 14, H = 30, cx = 7;
  return mk(W, H, (p, g) => {
    p.fline(1, 1, 13, 1, SIL[4], 1); p.dot(1, 1, SIL[6]); p.dot(13, 1, SIL[2]);
    fpoly(p, [[2.5, 2], [11.5, 2], [11.5, 26], [7, 22.5], [2.5, 26]], (x) => (x < 4 ? SKY[3] : x > 10 ? SKY[1] : SKY[2]));
    p.fline(3, 3, 3, 24.5, SIL[4], 0); p.fline(11, 3, 11, 24.5, SIL[2], 0);
    prism(p, g, cx, 15, cx, 7, 2.6, CRY);
    p.fline(4.5, 18, 9.5, 18, SIL[3], 0);
  }, { ax: cx, ay: H - 1, b: true });
}

// ================================================================== Sternwarte
function bookshelf(v) {
  const W = 34, H = 44, cx = 17, base = H - 2, rng = createRng(5400 + v);
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 16, 2);
    block(p, cx - 15, base - 40, 30, 40, WOOD, 2);
    p.rect(cx - 13, base - 38, 26, 36, WOOD[0]);
    for (let s = 0; s < 4; s++) {
      const y1 = base - 3 - s * 9;
      p.rect(cx - 13, y1, 26, 1.5, WOOD[4]); p.rect(cx - 13, y1 + 1.5, 26, 0.5, WOOD[1]);
      let x = cx - 13;
      while (x < cx + 12) {
        const bw = rng.pick([1.5, 2, 2, 2.5, 3]), bh = rng.range(5, 8), B = rng.pick(BOOKS);
        if (x + bw > cx + 13) break;
        if (rng.chance(0.08)) { x += bw + 1; continue; }
        p.rect(x, y1 - bh, bw, bh, B[1]); p.rect(x, y1 - bh, 0.5, bh, B[2]); p.rect(x + bw - 0.5, y1 - bh, 0.5, bh, B[0]);
        if (rng.chance(0.5)) p.rect(x, y1 - bh + 1.5, bw, 0.5, GOLD[3]);
        x += bw;
      }
    }
    block(p, cx - 16, base - 42, 32, 3, WOOD, 3);
    p.rect(cx - 16, base - 42, 32, 0.5, GOLD[3]);
    if (v) { p.oval(cx + 8, base - 45, 3, 3, NV[4]); p.oval(cx + 7.4, base - 45.6, 1.4, 1.4, NV[6]); p.dot(cx + 9, base - 44, GOLD[4]); p.fline(cx + 8, base - 42, cx + 8, base - 43, GOLD[2], 1); }
  }, { ax: cx, ay: base, b: true, box: [-15, -7, 15, 1] });
}

function orrery() {
  const W = 40, H = 46, cx = 20, base = H - 2, cy = base - 24;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 12, 2.6);
    block(p, cx - 9, base - 4, 18, 4, NV, 4);
    p.rect(cx - 9, base - 4, 18, 0.5, GOLD[3]);
    p.fline(cx, base - 4, cx, cy + 4, GOLD[2], 1.4); p.fline(cx - 0.4, base - 4, cx - 0.4, cy + 4, GOLD[4], 0);
    // Bahnen (Ellipsen-Umrisse), hinten dünn, vorne kräftig
    const ring = (rx, ry, tilt, k) => {
      for (let a = 0; a < Math.PI * 2; a += 0.03) {
        const x = Math.cos(a) * rx, y = Math.sin(a) * ry, X = cx + x, Y = cy + y + x * tilt;
        p.dot(X, Y, Math.sin(a) > 0 ? GOLD[k] : GOLD[k - 2]);
      }
    };
    ring(16, 5, 0.12, 4); ring(11, 3.5, -0.18, 4); ring(6.5, 6.5, 0, 3);
    // Sonne und Planeten
    p.oval(cx, cy, 3.6, 3.6, GOLD[3]); p.oval(cx - 0.8, cy - 0.8, 2, 2, GOLD[4]); p.dot(cx - 1.4, cy - 1.4, GOLD[5]);
    g.oval(cx, cy, 4.4, 4.4, GOLD[3]);
    for (const [a, rx, ry, tilt, c, r] of [[0.6, 16, 5, 0.12, CRY, 1.6], [2.8, 11, 3.5, -0.18, BLOS, 1.4], [4.2, 6.5, 6.5, 0, SIL, 1.1], [5.3, 16, 5, 0.12, LILAC, 1.2]]) {
      const x = Math.cos(a) * rx, X = cx + x, Y = cy + Math.sin(a) * ry + x * tilt;
      p.oval(X, Y, r, r, c[2]); p.dot(X - r * 0.4, Y - r * 0.4, c[4]); g.dot(X, Y, c[2]);
    }
  }, { ax: cx, ay: base, b: true, box: [-8, -4, 8, 1], light: { dx: 0, dy: -24, radius: 70, color: GOLD_LIGHT, intensity: 0.6 } });
}

function telescope() {
  const W = 46, H = 48, cx = 18, base = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 12, 2.4);
    for (const [dx, k] of [[-9, 4], [0, 3], [8, 2]]) p.fline(cx, base - 16, cx + dx, base, WOOD[k], 1.2);
    p.oval(cx, base - 16, 2.4, 1.6, GOLD[3]);
    // Rohr: Messingbänder, Licht oben
    const x0 = cx - 6, y0 = base - 10, x1 = cx + 24, y1 = base - 40;
    p.fline(x0, y0 + 1, x1, y1 + 1, GOLD[1], 6);
    p.fline(x0, y0, x1, y1, GOLD[2], 5);
    p.fline(x0 - 1, y0 - 1.5, x1 - 1, y1 - 1.5, GOLD[3], 1.5);
    p.fline(x0 - 1.4, y0 - 2.2, x1 - 1.4, y1 - 2.2, GOLD[4], 0);
    for (const t of [0.12, 0.45, 0.8]) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; p.fline(x - 2.4, y - 2.4, x + 2.4, y + 2.4, NV[3], 1.2); }
    p.oval(x1 + 1, y1 - 1, 3.4, 3.4, GOLD[3]); p.oval(x1 + 1.4, y1 - 1.4, 2.2, 2.2, CRY[2]); p.dot(x1 + 0.6, y1 - 2.2, CRY[5]);
    g.oval(x1 + 1.4, y1 - 1.4, 2, 2, CRY[3]);
    p.oval(x0 - 1, y0 + 1, 1.6, 1.6, GOLD[2]);
  }, { ax: cx, ay: base, b: true, box: [-8, -4, 8, 1] });
}

function starGlobe() {
  const W = 22, H = 32, cx = 11, base = H - 2, cy = base - 17;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 7, 1.8);
    block(p, cx - 6, base - 3, 12, 3, WOOD, 3);
    p.fline(cx, base - 3, cx, cy + 7, GOLD[2], 1.4);
    p.oval(cx, cy, 7, 7, NV[3]);
    p.each(cx - 7, cy - 7, cx + 7, cy + 7, (x, y) => {
      const nx = (x - cx) / 7, ny = (y - cy) / 7, d = nx * nx + ny * ny;
      if (d > 1) return null;
      const lit = -nx * 0.6 - ny * 0.8;
      return NV[lit > 0.5 ? 6 : lit > 0 ? 5 : lit > -0.5 ? 4 : 3];
    });
    for (const [dx, dy] of [[-3, -2], [1, -4], [3, 1], [-1, 3], [4, -1]]) { p.dot(cx + dx, cy + dy, GOLD[5]); g.dot(cx + dx, cy + dy, GOLD[2]); }
    p.fline(cx - 3, cy - 2, cx + 1, cy - 4, GOLD[2], 0); p.fline(cx + 1, cy - 4, cx + 4, cy - 1, GOLD[2], 0);
    for (let a = -0.4; a < Math.PI + 0.4; a += 0.03) p.dot(cx + Math.cos(a + Math.PI / 2) * 8.4, cy - Math.sin(a + Math.PI / 2) * 8.4 * 0.98, GOLD[a < 1.6 ? 4 : 2]);
  }, { ax: cx, ay: base, b: true, box: [-5, -3, 5, 1], light: { dx: 0, dy: -18, radius: 34, color: STAR_LIGHT, intensity: 0.3 } });
}

function chartDesk() {
  const W = 36, H = 28, cx = 18, base = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, 16, 2);
    for (const dx of [-13, 12]) p.rect(cx + dx, base - 9, 2, 9, WOOD[2]);
    block(p, cx - 15, base - 13, 30, 4, WOOD, 3);
    // Sternkarten, eine eingerollt
    fpoly(p, [[cx - 12, base - 13], [cx - 1, base - 14], [cx, base - 10.5], [cx - 11, base - 10]], PAPER[3]);
    p.oval(cx - 6, base - 12, 3, 1.2, INK[1]); p.oval(cx - 6, base - 12, 1.6, 0.6, PAPER[3]); p.dot(cx - 4, base - 12.4, INK[0]);
    fpoly(p, [[cx + 1, base - 13.6], [cx + 9, base - 14], [cx + 9.5, base - 11], [cx + 1.5, base - 10.8]], PAPER[2]);
    p.fline(cx + 3, base - 13, cx + 7, base - 12, INK[0], 0); p.dot(cx + 7, base - 12, INK[1]);
    p.fline(cx - 13, base - 15.5, cx - 4, base - 16, PAPER[4], 1.4); p.oval(cx - 13, base - 15.6, 0.9, 0.9, PAPER[2]);
    // Kerze
    p.rect(cx + 11, base - 19, 2, 6, PAPER[4]); p.rect(cx + 12.5, base - 19, 0.5, 6, PAPER[2]);
    p.oval(cx + 12, base - 21, 0.9, 1.6, FLAME[3]); p.dot(cx + 12, base - 20.5, FLAME[4]);
    g.oval(cx + 12, base - 21, 1.6, 2.4, FLAME[2]);
    p.fline(cx + 6, base - 14, cx + 9, base - 19, PAPER[4], 0);
  }, { ax: cx, ay: base, b: true, box: [-15, -6, 15, 1], light: { dx: 12, dy: -21, radius: 46, color: [255, 200, 140], intensity: 0.6 } });
}

function starBanner() {
  const W = 14, H = 32, cx = 7;
  return mk(W, H, (p, g) => {
    p.fline(1, 1, 13, 1, GOLD[3], 1); p.dot(1, 1, GOLD[5]); p.dot(13, 1, GOLD[1]);
    fpoly(p, [[2.5, 2], [11.5, 2], [11.5, 28], [7, 24.5], [2.5, 28]], (x) => (x < 4 ? NV[4] : x > 10 ? NV[2] : NV[3]));
    p.fline(3, 3, 3, 26.5, GOLD[3], 0); p.fline(11, 3, 11, 26.5, GOLD[2], 0);
    for (let a = 0; a < 8; a++) { const r = a % 2 ? 1.6 : 4, ang = (a * Math.PI) / 4 - Math.PI / 2; p.fline(cx, 13, cx + Math.cos(ang) * r, 13 + Math.sin(ang) * r, a % 2 ? GOLD[2] : GOLD[4], 0.5); }
    p.dot(cx, 13, GOLD[5]); g.oval(cx, 13, 2, 2, GOLD[2]);
    for (const [x, y] of [[4.5, 5], [9.5, 7], [5, 21], [9, 19]]) p.dot(x, y, '#c8d0f0');
  }, { ax: cx, ay: H - 1, b: true });
}

// Sternpodest der Königin: flach, liegt unter allen Figuren
function queenDais() {
  const W = 64, H = 34, cx = 32, cy = 16;
  const o = mk(W, H, (p, g) => {
    p.oval(cx, cy + 2.5, 30, 13, NV[1]);
    p.oval(cx, cy, 30, 13, NV[4]);
    p.oval(cx, cy, 28.5, 12, NV[3]);
    p.each(cx - 30, cy - 13, cx + 30, cy + 13, (x, y) => {
      const nx = (x - cx) / 30, ny = (y - cy) / 13, d = nx * nx + ny * ny;
      if (d > 1) return null;
      if (d > 0.86 && d < 0.93) return GOLD[3];
      if (d > 0.5 && d < 0.54) return GOLD[2];
      return null;
    });
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4, r = a % 2 ? 0.45 : 0.68;
      p.fline(cx, cy, cx + Math.cos(ang) * 28 * r, cy + Math.sin(ang) * 12 * r, a % 2 ? GOLD[2] : GOLD[4], 0.5);
      g.fline(cx, cy, cx + Math.cos(ang) * 28 * r, cy + Math.sin(ang) * 12 * r, GOLD[1], 0);
    }
    for (let a = 0; a < 12; a++) { const ang = (a * Math.PI) / 6 + 0.26; p.dot(cx + Math.cos(ang) * 22, cy + Math.sin(ang) * 9.4, '#e8eeff'); g.dot(cx + Math.cos(ang) * 22, cy + Math.sin(ang) * 9.4, '#3a4a80'); }
    p.oval(cx, cy, 2.2, 1.2, GOLD[5]); g.oval(cx, cy, 3, 1.6, GOLD[3]);
  }, { ax: cx, ay: cy, b: true, light: { dx: 0, dy: -10, radius: 90, color: STAR_LIGHT, intensity: 0.45 } });
  o.sortOffset = -10000;
  return o;
}

// ================================================================== Sätze je Dungeon
export function createStarDungeonProps(biome) {
  if (biome === 'glass') {
    return {
      glassPillar: [glassPillar(0), glassPillar(1)],
      glassPrisoner: [glassPrisoner(0), glassPrisoner(1)],
      prismLamp: prismLamp(),
      splinterThrone: splinterThrone(),
      glassBanner: glassBanner(),
      sconce: sconce('glass'),
      shardRocks: [0, 1, 2].map(shardRock),
      mirrorStones: [0, 1].map(mirrorStone),
      crystals: [0, 1, 2].map(crystals),
      shardSpire: [0, 1].map(shardSpire),
    };
  }
  if (biome === 'vault') {
    return {
      bookshelf: [bookshelf(0), bookshelf(1)],
      orrery: orrery(),
      telescope: telescope(),
      starGlobe: starGlobe(),
      chartDesk: chartDesk(),
      starBanner: starBanner(),
      queenDais: queenDais(),
      sconce: sconce('vault'),
      lensStand: lensStand(),
      crateStack: crateStack(),
      crystals: [0, 1, 2].map(crystals),
      starLamp: lantern(1),
    };
  }
  return {
    thornPillar: [thornPillar(0), thornPillar(1)],
    bloomUrn: bloomUrn(),
    lampFlower: [lampFlower(0), lampFlower(1)],
    seedCoffin: seedCoffin(),
    thornThicket: [thornThicket(0), thornThicket(1)],
    heartBud: heartBud(),
    hangingRoots: [hangingRoots(0), hangingRoots(1)],
    sconce: sconce('thorn'),
    roots: [0, 1].map(roots),
    roseRocks: [0, 1, 2].map(roseRocks),
    ruinPillars: [0, 1].map(ruinPillar),
    aurelStatue: aurelStatue(),
    crystals: [0, 1, 2].map(crystals),
  };
}
