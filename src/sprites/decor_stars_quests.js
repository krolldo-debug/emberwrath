import { hash2 } from '../core/math.js';
import { mk, fpoly, lump, pal32 } from './decor_ashwood.js';

// Questobjekte der Sternenglut (Nebenquests vom 03.11.): Wrack der „Morgenröte“ in den Treibenden Gärten,
// Schiffsglocke, Wegleuchten (aus/an) in den Splitterweiten und Sternsteine am Sternwartenberg.
// Licht von links oben, harte Stufen, Leuchtebene nur für Glut und Sternlicht.

const WOOD = ['#1a1014', '#2c1c1c', '#432a24', '#5e3c2c', '#7c5236', '#a07048'];
const SAIL = ['#3a3448', '#5a5470', '#7e7898', '#a8a2c0', '#d4d0e4', '#f2f0fa'];
const BRASS = ['#3a2410', '#6a4418', '#a0702a', '#d4a444', '#f4d88a', '#fff4c8'];
const IRON = ['#141020', '#241e34', '#3a3250', '#585070', '#7a7294'];
const PEARL = ['#2a2840', '#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8', '#ecebf8'];
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const CRY_OFF = ['#14141e', '#20222e', '#2e3240', '#40485a', '#586274', '#7a8494'];
const VOID = ['#140a24', '#2a1640', '#4a2470', '#7a44b0', '#b48aff', '#e8d8ff'];
const CRY_LIGHT = [130, 230, 255];

// Brett mit Maserung: Streifen von a nach b, Breite w, oben hell, unten dunkel
function plank(p, x0, y0, x1, y1, w, k = 0) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, h = w / 2;
  fpoly(p, [[x0 + nx * h, y0 + ny * h], [x1 + nx * h, y1 + ny * h], [x1 - nx * h, y1 - ny * h], [x0 - nx * h, y0 - ny * h]], (x, y) => {
    const o = ((x - x0) * nx + (y - y0) * ny) / h;   // -1 … 1 quer
    const t = ((x - x0) * dx + (y - y0) * dy) / (L * L);
    if (Math.abs(o) > 0.7) return WOOD[o < 0 ? 4 + Math.min(1, k) : 1];
    return WOOD[(hash2(Math.floor(t * L / 3), Math.floor(o * 2) + 9, 311 + k) < 0.25 ? 2 : 3) + (k > 0 ? 1 : 0)];
  });
}

// Wrack der „Morgenröte“: ein Himmelskahn, schräg in die Inselkante gebohrt, Mast gebrochen, Segel zerrissen,
// der Schwebestein im Kiel gesprungen (glimmt noch violett).
function skyWreck() {
  const W = 66, H = 40;
  return mk(W, H, (p, g) => {
    const by = H - 3;
    // aufgewühlte Erde unter dem Bug
    lump(p, 46, by - 1, 15, 3.2, ['#140e14', '#21171c', '#2e2026', '#3e2c30', '#523a3a', '#6a4c48'], { lo: 1, hi: 4 });
    // Rumpf: Bug rechts im Boden, Heck links oben
    const hull = [[6, by - 18], [12, by - 12], [30, by - 6], [52, by - 1], [60, by - 2], [58, by - 9], [40, by - 15], [20, by - 21], [8, by - 23]];
    fpoly(p, hull, (x, y) => {
      const t = (x - 6) / 54, top = by - 23 + t * 14, bot = by - 12 + t * 10;
      const v = (y - top) / Math.max(1, bot - top);
      if (v < 0.12) return WOOD[5];
      const row = Math.floor(v * 5);
      if (Math.abs(v * 5 - row - 0.5) > 0.36) return WOOD[row > 2 ? 0 : 1];
      return WOOD[v < 0.35 ? 4 : v < 0.7 ? 3 : 2];
    });
    // Reling und Spanten
    plank(p, 7, by - 24, 58, by - 9.5, 1.6, 1);
    for (const x of [14, 24, 34, 44]) { const t = (x - 6) / 54; p.fline(x, by - 23 + t * 14, x + 1.5, by - 13 + t * 10, WOOD[1], 0.5); }
    // Loch im Rumpf mit gesprungenem Schwebestein
    fpoly(p, [[26, by - 15], [31, by - 17], [35, by - 13], [32, by - 9], [27, by - 10]], WOOD[0]);
    fpoly(p, [[28, by - 13.5], [30.5, by - 16], [33, by - 13], [30.5, by - 10.5]], (x, y) => VOID[x + y < 30 + by - 13 ? 4 : 3]);
    p.fline(30.5, by - 15.5, 30, by - 11, VOID[1], 0.5);
    g.oval(30.5, by - 13.2, 2.2, 2.6, VOID[3]); g.dot(30, by - 14, VOID[5]);
    // gebrochener Mast, nach links gekippt, mit Segelfetzen
    plank(p, 20, by - 21, 10, by - 34, 2.4, 0);
    p.fline(9.5, by - 34.5, 11.5, by - 36.5, WOOD[1], 0.8);
    p.fline(11, by - 33.5, 12.5, by - 35, WOOD[5], 0.5);
    plank(p, 14, by - 29, 25, by - 31, 1.4, 1);          // Rahe
    fpoly(p, [[15, by - 28.5], [24.5, by - 30.5], [27, by - 22], [24, by - 23.5], [22, by - 20], [19, by - 22.5], [16.5, by - 21]], (x, y) => {
      const k = (x - 15) / 12 + (y - (by - 30)) / 14;
      return SAIL[k < 0.35 ? 5 : k < 0.7 ? 4 : k < 1 ? 3 : 2];
    });
    p.fline(19, by - 29.5, 20.5, by - 22.5, SAIL[2], 0.5); p.fline(23, by - 30, 24, by - 24, SAIL[2], 0.5);
    // Galionsfigur: Sternenvogel am Bug, halb im Boden
    fpoly(p, [[58, by - 9], [63, by - 12], [62.5, by - 8], [60, by - 6]], (x, y) => BRASS[y < by - 10 ? 4 : 2]);
    p.dot(61.5, by - 10.5, BRASS[5]);
    // lose Bretter und Kiste davor
    plank(p, 4, by - 1, 14, by - 2.5, 1.8, 0);
    plank(p, 18, by, 25, by + 0.8, 1.6, 1);
    for (let i = 0; i < 6; i++) p.dot(36 + hash2(i, 1, 77) * 12, by - 1 + hash2(i, 2, 77) * 2, WOOD[i % 2 ? 1 : 4]);
  }, { ax: 34, ay: H - 2, box: [-26, -10, 26, 1], b: true, light: { dx: -4, dy: -12, radius: 40, color: [170, 110, 255], intensity: 0.45 } });
}

// Schiffsglocke der „Morgenröte“ an einem Mastrest
function shipBell() {
  const W = 14, H = 22, cx = 7;
  return mk(W, H, (p) => {
    const B = pal32(BRASS), Wd = pal32(WOOD);
    p.scan(cx - 4, 3, cx - 2, H - 2, (x) => Wd[x < cx - 3 ? 4 : 2]);
    p.scan(cx - 4, 3, cx + 4, 5, (x, y) => Wd[y < 4 ? 5 : 2]);
    p.fline(cx + 2.5, 5, cx + 2.5, 7, IRON[3], 0.5);
    p.scan(cx + 0.5, 7, cx + 4.5, 13, (x, y) => {
      const w = 1.2 + (y - 7) * 0.33; if (Math.abs(x - cx - 2.5) > w) return null;
      return B[y > 12 ? 1 : x < cx + 2.5 - w * 0.3 ? 4 : x < cx + 2.5 + w * 0.4 ? 3 : 2];
    });
    p.dot(cx + 1.6, 9, BRASS[5]); p.dot(cx + 2.5, 13.5, IRON[1]);
    p.fline(cx - 6, H - 2, cx + 5, H - 2.5, WOOD[1], 1);
  }, { ax: cx, ay: H - 2, box: [-4, -2, 4, 1], b: true });
}

// Wegleuchte (Splitterweiten): Sternglaskugel auf Eisenmast, aus = stumpf, an = hell mit Licht
function signalLamp(on) {
  const W = 12, H = 30, cx = 6;
  return mk(W, H, (p, g) => {
    const I = pal32(IRON);
    p.scan(cx - 0.75, 9, cx + 0.75, H - 3, (x) => I[x < cx ? 3 : 1]);
    p.scan(cx - 2.5, H - 3.5, cx + 2.5, H - 1.5, (x, y) => I[y < H - 3 ? 3 : 1]);
    p.scan(cx - 2, 9, cx + 2, 10.5, (x, y) => I[y < 9.5 ? 4 : 2]);
    lump(p, cx, 6, 3, 3, on ? CRY : CRY_OFF, { lo: 1, hi: on ? 5 : 4 });
    if (on) { g.oval(cx, 6, 3, 3, CRY[4]); g.dot(cx - 1, 5, CRY[5]); }
    else p.fline(cx - 1.5, 4.5, cx + 0.5, 7.5, CRY_OFF[0], 0.5);   // Sprung im Glas
  }, { ax: cx, ay: H - 2, box: [-2, -2, 2, 1], b: true, light: on ? { dx: 0, dy: -23, radius: 70, color: CRY_LIGHT, intensity: 0.75 } : null });
}

// Sternstein (Sternbild der Königin): flacher Perlstein mit eingeritztem Stern, der schwach leuchtet
function starStone(v) {
  const W = 18, H = 14, cx = 9;
  return mk(W, H, (p, g) => {
    lump(p, cx, H - 6, 7, 4.6, PEARL, { lo: 1, hi: 6 });
    const sx = cx - 0.5 + (v ? 0.5 : 0), sy = H - 7;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      p.fline(sx, sy, sx + Math.cos(a) * 2.8, sy + Math.sin(a) * 2.2, CRY[3], 0.5);
      g.dot(sx + Math.cos(a) * 2.4, sy + Math.sin(a) * 1.9, CRY[3]);
    }
    p.dot(sx, sy, CRY[5]); g.dot(sx, sy, CRY[4]);
  }, { ax: cx, ay: H - 2, box: [-6, -3, 6, 1], b: true, light: { dx: 0, dy: -5, radius: 34, color: CRY_LIGHT, intensity: 0.4 } });
}

export function createStarQuestDecor() {
  return {
    skyWreck: skyWreck(),
    shipBell: shipBell(),
    signalLamp: { off: signalLamp(false), on: signalLamp(true) },
    starStones: [0, 1].map(starStone),
  };
}
