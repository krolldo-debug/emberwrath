// Sternhafen als Fachwerk-Altstadt (Erweiterung „Sternenglut“): Hausbaukasten (fwHouse), Fürstenburg, Sternturm,
// Stall, Stadttore, Möbel für die Innenräume. Gedeckte Erdtöne wie die Glutsenke, Licht von oben links, alles im
// Feinraster (Stufe B). Die Bodenmalerei (Kopfsteinpflaster, Dachlandschaft, Innenraumböden und -wände) liegt in
// sprites/ground/ramparts.js. Deko-Satz „decor_altstadt“ (world/index.js mischt decor_astral und village dazu).
import { hash2 } from '../core/math.js';
import { mk, pal32 } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import { LAMP, footShade } from './decor_starcity.js';

const R = (a) => ({ hex: a, c: pal32(a) });
const OAK = R(['#140c0a', '#22140f', '#321e16', '#46291c', '#5a3624', '#70452e', '#88573a', '#a06c48']);
const DAUB = R(['#3a2c2a', '#5a4638', '#7c6450', '#9c826a', '#b8a084', '#d0ba9c', '#e4d2b4']);
const RUB = R(['#1e1a1e', '#2e292c', '#423b3c', '#58504e', '#706662', '#8a7e76', '#a69a8e', '#c0b4a6']);
const SHING = R(['#120e14', '#1c1720', '#28212c', '#363040', '#463e4e', '#585060', '#6c6474']);
const SLATE = R(['#0e1016', '#161a24', '#202634', '#2c3444', '#3a4456', '#4c566a', '#626c80']);
const BRK = R(['#24100e', '#3a1a14', '#542519', '#6e321f', '#884228', '#a05634', '#b86e46']);
const CLAY = R(['#2a0e0a', '#441812', '#5e2418', '#7a3220', '#94422a', '#ac5838', '#c4724a']);
const LIME = R(['#3a3436', '#5a5254', '#7a7272', '#9a9290', '#b8b0aa', '#d2cac0', '#e8e0d4']);
const IRON = R(['#101014', '#1c1c22', '#2c2c34', '#40404a', '#5a5a66', '#7a7a88', '#a0a0b0']);
const MOSS = R(['#1c2619', '#2a3923', '#3a4e2d', '#4e6438']);
const GREEN = R(['#10201a', '#1a3026', '#264434', '#345a44']);       // Fensterläden
const RED = R(['#2a0e10', '#4a1a1a', '#6a2622', '#8a3428']);
const WOOL = R(['#2a0e14', '#4a1820', '#6e2228', '#923232', '#2a2a4a', '#3c3c66', '#c49a4a', '#e0c070']);
const Lm = pal32(LAMP), INK = col32('#120c10');
// aktuelle Putz- und Balkenfarbe (je Haus gesetzt)
let PL = DAUB, TB = OAK;
// Für andere Hausbaukästen (sprites/decor_houses.js)
export const PAL = { R, OAK, DAUB, RUB, SHING, SLATE, BRK, CLAY, LIME, IRON, MOSS, GREEN, RED, WOOL, Lm, INK };
export function setWood(pl, tb) { if (pl) PL = pl; if (tb) TB = tb; }
const cl = (i, n = 6) => (i < 0 ? 0 : i > n ? n : i);

// ------------------------------------------------------------------ Mauerwerk und Flächen
// Bruchstein in unregelmäßigen Lagen: Steine 5–14 px breit, Lagen 4–7 px hoch, gewölbt (Licht oben links)
export function rubble(p, x0, x1, y0, y1, P, seed, big = 1) {
  const rows = [];
  for (let y = y1, r = 0; y > y0 - 8; r++) { const h = Math.round((4 + hash2(r, 0, seed) * 3) * big); rows.push([y - h, y, r]); y -= h; }
  p.scan(x0, y0, x1, y1, (x, y) => {
    const row = rows.find(([a, b]) => y >= a && y < b) ?? rows[0], [ra, rb, r] = row, ly = y - ra, hh = rb - ra;
    let u = x - x0 + hash2(r, 1, seed) * 20, b = 0, bw = 0;
    for (let k = 0; ; k++) { bw = Math.round((5 + hash2(r, k, seed + 1) * 9) * big); if (u < bw) { b = k; break; } u -= bw; }
    if (ly < 0.75 || u < 0.75) return P.c[1];
    const t = hash2(b, r, seed + 2);
    let i = t < 0.25 ? 3 : t > 0.8 ? 5 : 4;
    const nx = u / bw - 0.5, ny = ly / hh - 0.5;
    if (nx + ny < -0.45) i++; else if (nx + ny > 0.5) i--;
    if (ly < 1.5 && hash2(b, r, seed + 3) < 0.3) i--;
    if (hash2(Math.floor(x * 2), Math.floor(y * 2), seed + 4) < 0.04) i--;
    return P.c[cl(i, P.c.length - 1)];
  });
}
// Eckquader (lang/kurz im Wechsel)
export function quoins(p, x, y0, y1, P, right = false) {
  for (let y = y1, k = 0; y > y0 + 0.5; y -= 6, k++) {
    const w = k & 1 ? 5 : 9, a = right ? x - w : x, b = right ? x : x + w, top = Math.max(y0, y - 6);
    p.scan(a, top, b, y, (xx, yy) => (yy > y - 0.75 || (right ? xx < a + 0.6 : xx > b - 0.6) ? P.c[1] : yy < top + 1 ? P.c[6] : P.c[(right ? xx > b - 1.5 : xx < a + 1.5) ? 6 : 5]));
  }
}
// Backstein im Kreuzverband, 7×3, Kalkfugen
export function bricks(p, x0, x1, y0, y1, P, seed, J = LIME) {
  p.scan(x0, y0, x1, y1, (x, y) => {
    const r = Math.floor((y1 - y) / 3), ly = (y1 - y) - r * 3, u = x - x0 + (r & 1) * 3.5, b = Math.floor(u / 7), lu = u - b * 7;
    if (ly < 0.6 || lu < 0.6) return J.c[2];
    const t = hash2(b, r, seed);
    let i = t < 0.18 ? 3 : t > 0.86 ? 5 : 4;
    if (t > 0.97) i = 2;                       // gesinterte Köpfe
    if (ly > 2.4) i++;
    return P.c[cl(i)];
  });
}
// Lehmputz zwischen den Balken
export function daub(p, x0, x1, y0, y1, seed) {
  p.scan(x0, y0, x1, y1, (x, y) => {
    const n = hash2(Math.floor(x * 2), Math.floor(y * 2), seed);
    let i = 5;
    if (n < 0.07) i = 4; else if (n > 0.985) i = 6;
    if (hash2(Math.floor(x / 5), Math.floor(y / 4), seed + 1) < 0.12) i--;  // Flecken
    return PL.c[i];
  });
}
// Balken: waagerecht, senkrecht, schräg (Holz mit Licht oben links)
export function beamH(p, x0, x1, y, t = 3) { p.scan(x0, y, x1, y + t, (x, yy) => TB.c[yy < y + 0.6 ? 5 : yy > y + t - 0.6 ? 1 : hash2(Math.floor(x / 6), 0, 5) < 0.3 ? 3 : 4]); }
export function beamV(p, x, y0, y1, t = 3) { p.scan(x, y0, x + t, y1, (xx) => TB.c[xx < x + 0.6 ? 5 : xx > x + t - 0.6 ? 2 : 4]); }
export function beamD(p, xa, ya, xb, yb, t = 2.6) {
  const L = Math.hypot(xb - xa, yb - ya), nx = -(yb - ya) / L, ny = (xb - xa) / L;
  p.scan(Math.min(xa, xb) - t, Math.min(ya, yb) - t, Math.max(xa, xb) + t, Math.max(ya, yb) + t, (x, y) => {
    const s = ((x - xa) * (xb - xa) + (y - ya) * (yb - ya)) / (L * L);
    if (s < 0 || s > 1) return 0;
    const d = (x - xa) * nx + (y - ya) * ny;
    if (Math.abs(d) > t / 2) return 0;
    return TB.c[d < -t / 2 + 0.6 ? 5 : d > t / 2 - 0.6 ? 2 : 4];
  });
}
// Fachwerkgeschoss: Schwelle, Rähm, Ständer, Streben (K-Strebe außen, Andreaskreuz unter Fenstern)
export function timberFloor(p, x0, x1, y0, y1, seed, wins) {
  daub(p, x0, x1, y0, y1, seed);
  const posts = [x0, ...wins.flatMap((w) => [w - 4, w + 9]), x1 - 3].sort((a, b) => a - b);
  for (let k = 0; k < posts.length - 1; k++) {
    const a = posts[k] + 3, b = posts[k + 1];
    if (b - a < 4) continue;
    const isWin = wins.some((w) => w - 1 >= a - 1 && w + 6 <= b + 1);
    if (isWin) { // Brüstung mit Andreaskreuz
      const by = y1 - 9;
      beamH(p, a, b, by, 2);
      beamD(p, a, y1 - 3, b, by + 2, 2); beamD(p, a, by + 2, b, y1 - 3, 2);
    } else if (b - a > 6) {
      // Eckfelder: Fußstrebe zur Ecke hin; Mittelfelder: nur Riegel (ruhige Putzflächen)
      if (k === 0) beamD(p, a, y1 - 3, b, y0 + 3);
      else if (k === posts.length - 2) beamD(p, a, y0 + 3, b, y1 - 3);
      else beamH(p, a, b, Math.round((y0 + y1) / 2), 2);
    }
  }
  for (const x of posts) beamV(p, x, y0, y1);
  beamH(p, x0 - 1, x1 + 1, y0, 3); beamH(p, x0 - 1, x1 + 1, y1 - 3, 3);
}
// Vorkragung: Balkenköpfe und Schatten unter dem überstehenden Geschoss
export function jetty(p, x0, x1, y, ov) {
  p.scan(x0 - ov, y, x1 + ov, y + 2.5, (x, yy) => (yy < y + 1 ? TB.c[2] : INK));
  for (let x = x0 - ov + 2; x < x1 + ov - 2; x += 7) p.scan(x, y - 1, x + 3, y + 2, (xx, yy) => TB.c[yy < y ? 6 : xx < x + 1 ? 5 : 3]);
}
export function sideWall(p, x1, d, y0, y1, P) { p.scan(x1, y0, x1 + d, y1, (x, y) => P.c[x < x1 + 1 ? 2 : 1]); }

// ------------------------------------------------------------------ Fenster und Türen
// Bleiglasfenster: Rauten, warm erleuchtet; Läden optional; spitz = Spitzbogen
export function lead(p, g, x, y, w, h, F, { lit = true, shut = null, pointed = false, stone = false, seed = 0 } = {}) {
  const cx = x + w / 2, arc = pointed ? w * 0.75 : 0;
  const inside = (xx, yy, e = 0) => {
    if (xx < x - e || xx > x + w + e || yy > y + h + e) return false;
    if (yy >= y + arc) return yy >= y - e;
    const k = (y + arc - yy) / (arc + e), half = (w / 2 + e) * Math.sqrt(Math.max(0, 1 - k * k)) * (1 - k * 0.25);
    return Math.abs(xx - cx) <= half;
  };
  const fr = stone ? 1.6 : 1.2;
  p.scan(x - 3, y - 3, x + w + 3, y + h + 3, (xx, yy) => {
    if (inside(xx, yy)) {
      const u = xx - x, v = yy - y, dia = ((Math.floor(u + v) % 3) === 0 || (Math.floor(u - v + 30) % 3) === 0);
      if (!lit) return dia ? col32('#141820') : col32(v < h / 2 ? '#2a3448' : '#1e2636');
      if (dia) return Lm[1];
      return Lm[v < 2 ? 2 : (hash2(Math.floor(u / 1.5), Math.floor(v / 1.5), seed) < 0.2 ? 2 : 3)];
    }
    if (inside(xx, yy, fr)) return yy > y + h ? F.c[6] : F.c[(xx < cx ? 5 : 2)];
    return 0;
  });
  if (lit) g.each(x, y, x + w, y + h, (xx, yy) => (inside(xx, yy) ? LAMP[2] : null));
  // Fensterbank
  p.scan(x - 1.5, y + h + 0.5, x + w + 1.5, y + h + 2, (xx, yy) => (yy < y + h + 1.2 ? F.c[6] : F.c[2]));
  if (shut) for (const [a, b] of [[x - 1 - w / 2, x - 1.2], [x + w + 1.2, x + w + 1 + w / 2]]) {
    p.scan(a, y, b, y + h, (xx, yy) => {
      if (xx < a + 0.6 || xx > b - 0.6 || yy < y + 0.6) return shut.c[0];
      if (Math.abs(yy - (y + h * 0.3)) < 0.5 || Math.abs(yy - (y + h * 0.75)) < 0.5) return IRON.c[2];
      return shut.c[(Math.floor((xx - a) * 2) % 3 === 0) ? 1 : 2 + (xx < a + 1 ? 1 : 0)];
    });
  }
}
// Plankentür in Rund- oder Spitzbogen mit Eisenbändern, Steinlaibung
export function door(p, g, cx, bot, w, h, F, { pointed = false, lamp = true, step = true } = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, top = bot - h, arc = pointed ? w * 0.7 : w * 0.5;
  const inA = (x, y, e = 0) => {
    if (x < x0 - e || x > x1 + e || y > bot) return false;
    const sy = top + arc;
    if (y >= sy) return y >= top - e;
    if (pointed) { const k = (sy - y) / (arc + e); return Math.abs(x - cx) <= (w / 2 + e) * (1 - k * k * 0.9) && y >= top - e; }
    return Math.hypot((x - cx) / (w / 2 + e), (y - sy) / (arc + e)) <= 1;
  };
  p.scan(x0 - 4, top - 4, x1 + 4, bot, (x, y) => {
    if (inA(x, y)) {
      const u = x - x0, pl = Math.floor(u / 3.2);
      if (u % 3.2 < 0.6) return OAK.c[1];
      if (Math.abs(y - (bot - 4)) < 0.7 || Math.abs(y - (top + arc + 2)) < 0.7) return IRON.c[x < cx ? 4 : 2];
      if (Math.abs(x - (cx + w * 0.3)) < 0.8 && Math.abs(y - (bot - h * 0.45)) < 0.8) return IRON.c[5];
      return OAK.c[(hash2(pl, 3, 7) < 0.3 ? 3 : 4) - (y < top + 3 ? 1 : 0)];
    }
    if (inA(x, y, 2.5)) return y > bot - 0.6 ? 0 : F.c[x < cx ? (inA(x, y, 1.2) ? 3 : 6) : 3];
    return 0;
  });
  if (step) p.scan(x0 - 3, bot - 1.5, x1 + 3, bot + 1, (x, y) => (y < bot - 0.8 ? RUB.c[6] : RUB.c[3]));
  if (lamp) lantern(p, g, x1 + 5, top + 2);
}
// Eiserne Wandlaterne
export function lantern(p, g, x, y) {
  p.scan(x - 3, y - 2, x + 0.6, y - 1.2, () => IRON.c[2]);
  p.scan(x - 1.6, y - 1, x + 2.2, y + 5, (xx, yy) => (yy < y || yy > y + 4.2 || xx < x - 1 || xx > x + 1.6 ? IRON.c[1] : Lm[yy < y + 2 ? 4 : 3]));
  g.each(x - 1, y, x + 1.6, y + 4.2, () => LAMP[3]);
}
// Hängeschild am Eisenarm (Krug, Stiefel, Brot …)
export function sign(p, g, x, y, kind, seed) {
  p.scan(x, y - 1, x + 13, y, (xx) => IRON.c[xx < x + 1 ? 4 : 2]);
  p.scan(x + 12, y - 2, x + 13, y + 1, () => IRON.c[2]);
  p.scan(x + 3, y + 1, x + 13, y + 11, (xx, yy) => (xx < x + 3.6 || yy > y + 10.4 || xx > x + 12.4 ? OAK.c[1] : OAK.c[yy < y + 1.6 ? 6 : 4]));
  for (const cx of [x + 4, x + 12]) p.scan(cx - 0.3, y, cx + 0.3, y + 1, () => IRON.c[3]);
  const mx = x + 8, my = y + 6;
  if (kind === 'krug') p.scan(mx - 2.5, my - 3, mx + 3.5, my + 3, (xx, yy) => (xx > mx + 2 ? (Math.abs(yy - my) < 1.6 && xx < mx + 3.2 ? 0 : col32('#d8b060')) : yy < my - 2 ? col32('#f0e8d0') : col32(xx < mx ? '#e0b860' : '#a87830')));
  else if (kind === 'brot') p.scan(mx - 3.5, my - 2, mx + 3.5, my + 2, (xx, yy) => (((xx - mx) / 3.5) ** 2 + ((yy - my) / 2) ** 2 > 1 ? 0 : col32(yy < my - 0.5 ? '#e0a860' : '#b07038')));
  else if (kind === 'stiefel') p.scan(mx - 2, my - 3.5, mx + 3, my + 3, (xx, yy) => (xx > mx && yy < my + 1 ? 0 : col32(yy < my - 2 ? '#b08050' : '#6a4026')));
  else if (kind === 'buch') p.scan(mx - 3.5, my - 2.5, mx + 3.5, my + 2.5, (xx, yy) => (Math.abs(xx - mx) < 0.4 ? col32('#e8dcc0') : yy < my - 1.8 || yy > my + 1.8 ? col32('#c49a4a') : col32(xx < mx ? '#7a2a22' : '#5a1e1a')));
  else if (kind === 'ring') p.scan(mx - 3, my - 3.5, mx + 3, my + 3, (xx, yy) => { const d = Math.hypot(xx - mx, (yy - my - 0.8) * 1.1); if (yy < my - 1.6) return Math.abs(xx - mx) + Math.abs(yy - my + 2.6) < 1.4 ? col32('#a0e0ff') : 0; return d > 2.8 || d < 1.6 ? 0 : col32(xx < mx ? '#f6d888' : '#b88a30'); });
  else if (kind === 'flasche') p.scan(mx - 2.5, my - 3.5, mx + 2.5, my + 3, (xx, yy) => (yy < my - 1.5 ? (Math.abs(xx - mx) < 0.8 ? col32(yy < my - 3 ? '#c8a878' : '#3a7a4a') : 0) : Math.abs(xx - mx) > 2.4 ? 0 : col32(xx < mx ? '#5ab06a' : '#2a6a3a')));
  else if (kind === 'schild') p.scan(mx - 3, my - 3, mx + 3, my + 3.5, (xx, yy) => (Math.abs(xx - mx) > 3 - Math.max(0, yy - my - 0.5) * 1.1 ? 0 : Math.abs(xx - mx) < 0.7 ? col32('#e0c070') : col32(xx < mx ? '#a83a30' : '#7a2420')));
  else if (kind === 'hammer') p.scan(mx - 3, my - 3, mx + 3, my + 3.5, (xx, yy) => (yy < my - 0.8 ? (Math.abs(xx - mx) < 3 ? col32(xx < mx ? '#a0a0b0' : '#6a6a78') : 0) : Math.abs(xx - mx) < 0.8 ? col32('#8a5a36') : 0));
  else p.scan(mx - 2.5, my - 3, mx + 2.5, my + 3, (xx, yy) => (Math.abs(xx - mx) + Math.abs(yy - my) * 0.8 > 3 ? 0 : col32(xx < mx ? '#d0d8e0' : '#8a94a0')));
}

// ------------------------------------------------------------------ Dächer
// Dachfläche über einer Fläche inside(x,y); tex(u,v) in Dachkoordinaten (u entlang der Traufe, v von der Traufe aufwärts)
export function roofTex(kind, P, u, v, seed) {
  if (kind === 'shingle') {                       // Holzschindeln, gestaffelt, runde Unterkante
    const r = Math.floor(v / 3.2), lv = v - r * 3.2, uu = u + (r & 1) * 2.4 + hash2(r, 0, seed) * 3, b = Math.floor(uu / 4.6), lu = uu - b * 4.6;
    if (lv < 0.6) return P.c[1];
    if (lu < 0.5) return P.c[2];
    const t = hash2(b, r, seed + 1);
    let i = t < 0.2 ? 3 : t > 0.85 ? 5 : 4;
    if (lv < 1.2) i--;
    if (lv > 2.6) i++;
    if (hash2(Math.floor(u / 9), Math.floor(v / 6), seed + 2) < 0.08) return MOSS.c[lv > 2 ? 3 : 2];
    return P.c[cl(i)];
  }
  if (kind === 'slate') {                         // Schiefer: schmale Platten, kühle Töne, unregelmäßige Kanten
    const r = Math.floor(v / 2.6), lv = v - r * 2.6, uu = u + (r & 1) * 2 + hash2(r, 1, seed) * 2, bw = 3.6 + (r % 3) * 0.4, b = Math.floor(uu / bw), lu = uu - b * bw;
    if (lv < 0.55 || lu < 0.45) return P.c[1];
    const t = hash2(b, r, seed + 3);
    let i = t < 0.25 ? 3 : t > 0.82 ? 5 : 4;
    if (lv > 2) i++;
    return P.c[cl(i)];
  }
  if (kind === 'clay') {                          // Mönch-Nonne-Ziegel: senkrechte Wülste
    const uu = u + 0.5, b = Math.floor(uu / 4), lu = uu - b * 4, r = Math.floor(v / 4.5), lv = v - r * 4.5;
    if (lv < 0.6) return P.c[1];
    let i = lu < 1 ? 3 : lu < 2.2 ? 5 : lu < 3.2 ? 4 : 2;
    if (hash2(b, r, seed + 4) < 0.12) i--;
    if (lv < 1.3) i--;
    return P.c[cl(i)];
  }
  // Reet
  const band = Math.floor(v / 7), lv = v - band * 7, n = hash2(Math.floor(u * 2), band, seed + 5);
  let i = n < 0.3 ? 3 : n > 0.75 ? 5 : 4;
  if (lv < 1) i -= 2; else if (lv < 2) i--;
  return P.c[cl(i)];
}
// Traufseitiges Satteldach: Fläche von der Traufe (eave) bis zum First (ridge), Ortgang links/rechts
export function roofEave(p, x0, x1, ridge, eave, P, kind, seed, { hip = 0 } = {}) {
  p.scan(x0, ridge, x1, eave + 2, (x, y) => {
    const v = eave - y, k = (y - ridge) / (eave - ridge), ins = hip * (1 - k);
    if (x < x0 + ins || x > x1 - ins) return 0;
    if (y > eave) return y > eave + 1.2 ? INK : P.c[1];      // Traufkante
    if (y < ridge + 1.6) return P.c[y < ridge + 0.8 ? 5 : 2];  // First
    if (x < x0 + ins + 1.2) return P.c[5];                     // Ortgang hell
    if (x > x1 - ins - 1.4) return P.c[1];
    return roofTex(kind, P, x - x0, v, seed);
  });
}
// Giebelständiges Dach: von vorn sichtbare Dachflächen hinter dem Giebel (links hell, rechts dunkel)
export function roofGable(p, a, b, apex, base, depth, P, kind, seed, ov = 4) {
  const cx = (a + b) / 2, hw = (b - a) / 2 + ov;
  p.scan(cx - hw - 1, apex - depth - 1, cx + hw + 1, base + 2, (x, y) => {
    const dx = x - cx, edgeY = apex + (Math.abs(dx) / hw) * (base - apex);   // Giebelkante (vorn)
    if (Math.abs(dx) > hw) return 0;
    if (y > edgeY + 1.8 || y < edgeY - depth) return 0;
    if (y > edgeY) return y > edgeY + 1 ? INK : OAK.c[3];                    // Windbrett
    const v = edgeY - y, u = Math.abs(dx);
    if (Math.abs(dx) < 0.8) return P.c[5];
    const c = roofTex(kind, P, v * 1.4, u * 0.9 + (dx < 0 ? 0 : 50), seed);
    if (dx > 0) { const i = P.c.indexOf(c); return P.c[cl(i - 2)]; }
    return c;
  });
}
export function chimney(p, x, top, h, P = RUB) {
  rubble(p, x, x + 9, top, top + h, P, 77);
  p.scan(x - 1, top - 2, x + 10, top, (xx, y) => (y < top - 1.2 ? P.c[6] : P.c[2]));
  p.scan(x + 2, top - 3, x + 7, top - 2, () => INK);
}
export function dormer(p, g, cx, eaveY, R0, kind, seed, F) {
  const w = 14, x0 = cx - w / 2, top = eaveY - 16;
  p.scan(x0, top + 5, x0 + w, eaveY, (x, y) => (x > x0 + w - 1 ? DAUB.c[2] : DAUB.c[5]));
  lead(p, g, cx - 3, top + 7, 6, 7, F, { seed });
  roofGable(p, x0, x0 + w, top, top + 7, 6, R0, kind, seed + 9, 2);
}

// ------------------------------------------------------------------ Häuser
const LIGHT = { dx: 0, dy: -14, radius: 64, color: [255, 190, 120], intensity: 0.45 };
const box = (cx, x0, x1, d = 28) => [-(cx - x0), -d, x1 - cx, 1];

// ------------------------------------------------------------------ Möbel (Innenräume)
export function table() {
  const W = 52, H = 34;
  return mk(W, H, (p, g) => {
    footShade(p, 26, 31, 24, 3);
    // Bänke
    for (const y of [10, 28]) p.scan(6, y - 3, 46, y, (x, yy) => (yy < y - 2.2 ? OAK.c[6] : x < 7 || x > 45 ? OAK.c[1] : OAK.c[4]));
    for (const x of [8, 43]) p.scan(x, 28, x + 2, 32, () => OAK.c[2]);
    // Tischplatte
    p.scan(3, 12, 49, 24, (x, y) => (y > 22.5 ? OAK.c[1] : y < 13 ? OAK.c[7] : (Math.floor(y - 12) % 4 === 0 ? OAK.c[3] : OAK.c[x < 4 ? 6 : 5])));
    p.scan(4, 24, 48, 27, (x, y) => (x < 7 || x > 45 ? OAK.c[2] : y < 25 ? OAK.c[3] : 0));
    // Brot, Krug, Teller, Kerze
    p.scan(10, 14, 18, 19, (x, y) => (((x - 14) / 4) ** 2 + ((y - 16.5) / 2.5) ** 2 > 1 ? 0 : col32(y < 16 ? '#e0a860' : '#a86a34')));
    p.scan(24, 13, 29, 20, (x, y) => (x > 28.4 ? col32('#5a4a3a') : y < 14 ? col32('#f0e8d0') : col32(x < 26 ? '#a08060' : '#6a5440')));
    for (const tx of [34, 41]) p.scan(tx - 3, 17, tx + 3, 20, (x, y) => (((x - tx) / 3) ** 2 + ((y - 18.5) / 1.5) ** 2 > 1 ? 0 : col32(y < 18.5 ? '#b0a898' : '#7a7268')));
    p.scan(20, 8, 22, 15, (x, y) => (y < 10 ? Lm[4] : col32('#e8e0c8')));
    g.each(19.5, 6.5, 22.5, 10, () => LAMP[4]);
  }, { ax: 26, ay: 31, b: true, box: [-23, -18, 23, 1], light: { dx: 0, dy: -24, radius: 44, color: [255, 190, 110], intensity: 0.6 } });
}
export function bed() {
  const W = 34, H = 46;
  return mk(W, H, (p) => {
    footShade(p, 17, 43, 15, 3);
    p.scan(2, 2, 32, 44, (x, y) => (x < 3.5 || x > 30.5 || y > 42 ? OAK.c[x < 3.5 ? 5 : 2] : 0));
    p.scan(2, 0, 32, 8, (x, y) => (y < 1 ? OAK.c[6] : Math.floor(x) % 6 === 0 ? OAK.c[2] : OAK.c[4]));
    p.scan(4, 8, 30, 42, (x, y) => col32(y < 9 ? '#d8c8a0' : '#b8a478'));
    p.scan(6, 9, 28, 16, (x, y) => (y > 15 ? col32('#a89870') : col32(x < 8 ? '#f0e8d8' : '#e0d6c0')));
    p.scan(4, 18, 30, 42, (x, y) => {
      if (y < 19) return WOOL.c[3];
      const chk = ((Math.floor(x / 4) + Math.floor(y / 4)) & 1);
      return chk ? WOOL.c[2] : WOOL.c[1];
    });
    p.scan(4, 18, 30, 20, () => col32('#e8dcc0'));
  }, { ax: 17, ay: 43, b: true, box: [-15, -40, 15, 1] });
}
export function hearth() {
  const W = 60, H = 64;
  return mk(W, H, (p, g) => {
    // Rauchfang und Sims aus Stein
    rubble(p, 14, 46, 0, 26, RUB, 701);
    p.scan(4, 26, 56, 31, (x, y) => (y < 27 ? RUB.c[7] : y > 30 ? INK : x < 5 ? RUB.c[6] : RUB.c[4]));
    rubble(p, 6, 54, 31, 61, RUB, 702);
    p.scan(14, 36, 46, 61, (x, y) => {
      const arc = Math.hypot((x - 30) / 16, (y - 44) / 9);
      if (y < 44 && arc > 1) return 0;
      if (y > 58) return col32('#2a1c18');
      return col32(y < 44 ? '#120a0a' : '#1e1210');
    });
    // Feuer
    p.scan(20, 46, 40, 58, (x, y) => {
      const f = Math.abs(x - 30) + (58 - y) * 0.9 + hash2(Math.floor(x), Math.floor(y / 2), 3) * 3;
      return f > 14 ? 0 : col32(f < 5 ? '#fff0b0' : f < 9 ? '#f8b040' : '#d05818');
    });
    g.each(18, 44, 42, 58, (x, y) => (Math.abs(x - 30) + (58 - y) * 0.9 < 13 ? '#f8a040' : null));
    p.scan(18, 56, 42, 59, (x) => (Math.floor(x) % 5 === 0 ? col32('#2a1610') : col32('#5a3420')));
    // Kessel
    p.scan(23, 39, 37, 49, (x, y) => (((x - 30) / 7) ** 2 + ((y - 45) / 5) ** 2 > 1 ? 0 : IRON.c[y < 42 ? 4 : x < 27 ? 3 : 1]));
    p.scan(29.5, 32, 30.5, 40, () => IRON.c[3]);
    // Krüge auf dem Sims
    for (const [jx, c] of [[10, '#a07050'], [48, '#7a8aa0'], [52, '#c0a070']]) p.scan(jx - 2, 20, jx + 2, 26, (x, y) => (y < 21 ? col32('#e0d0b0') : col32(x < jx ? c : '#5a4030')));
    // Kräuterbündel
    for (const hx of [18, 24, 36, 42]) p.scan(hx - 1.5, 31, hx + 1.5, 37, (x, y) => (y < 32 ? col32('#8a6a40') : Math.abs(x - hx) > 1.5 - (y - 32) * 0.15 ? 0 : MOSS.c[(Math.floor(x * 2) & 1) + 2]));
  }, { ax: 30, ay: 61, b: true, box: [-26, -12, 26, 1], light: { dx: 0, dy: -10, radius: 90, color: [255, 150, 70], intensity: 0.9 } });
}
export function cupboard() {
  const W = 36, H = 50;
  return mk(W, H, (p) => {
    p.scan(2, 2, 34, 48, (x, y) => (x < 3 || x > 33 || y > 46.5 ? OAK.c[x < 3 ? 5 : 1] : y < 3 ? OAK.c[7] : OAK.c[3]));
    for (const sy of [14, 26, 38]) p.scan(3, sy, 33, sy + 2, (x, y) => (y < sy + 1 ? OAK.c[6] : OAK.c[2]));
    // Teller, Krüge, Bücher
    for (let k = 0; k < 4; k++) p.scan(5 + k * 7, 6, 10 + k * 7, 14, (x, y) => (Math.hypot(x - 7.5 - k * 7, y - 10) > 3 ? 0 : col32(Math.hypot(x - 7.5 - k * 7, y - 10) > 2 ? '#b0a898' : '#d8d0c0')));
    const bc = ['#6a2622', '#264434', '#3c3c66', '#8a6a30', '#5a3624'];
    for (let x = 5, k = 0; x < 31; x += 3, k++) p.scan(x, 19 + (k % 3 === 0 ? 1 : 0), x + 2.4, 26, (xx, y) => col32(y < 20.5 ? '#d8c8a0' : bc[k % 5]));
    for (const [jx, c] of [[8, '#a07050'], [16, '#7a6a50'], [25, '#c0a070']]) p.scan(jx - 3, 30, jx + 3, 38, (x, y) => (y < 31 ? col32('#e0d0b0') : col32(x < jx ? c : '#4a3426')));
    p.scan(4, 40, 32, 46, (x, y) => (Math.floor(x) % 9 === 0 ? OAK.c[1] : OAK.c[4]));
  }, { ax: 18, ay: 48, b: true, box: [-16, -10, 16, 1] });
}
export function barrels() {
  const W = 30, H = 28;
  return mk(W, H, (p) => {
    footShade(p, 15, 26, 13, 2);
    for (const [bx, by] of [[8, 25], [22, 25], [15, 14]]) p.scan(bx - 6, by - 11, bx + 6, by, (x, y) => {
      const rel = (x - bx) / 6;
      if (Math.abs(rel) > 1 - ((y - (by - 5.5)) / 5.5) ** 2 * 0.12) return 0;
      if (y < by - 10) return OAK.c[2];
      if (Math.abs(y - (by - 8.5)) < 0.6 || Math.abs(y - (by - 2.5)) < 0.6) return IRON.c[rel < 0 ? 4 : 2];
      return OAK.c[rel < -0.5 ? 6 : rel < 0 ? 5 : rel < 0.5 ? 4 : 2];
    });
  }, { ax: 15, ay: 26, b: true, box: [-13, -8, 13, 1] });
}

export function stool() {
  return mk(14, 14, (p) => {
    footShade(p, 7, 12, 6, 1.5);
    for (const x of [3, 9.5]) p.scan(x, 6, x + 1.5, 12, () => OAK.c[2]);
    p.scan(1, 3, 13, 7, (x, y) => (y < 4 ? OAK.c[6] : y > 6 ? OAK.c[1] : OAK.c[4]));
  }, { ax: 7, ay: 12, b: true, box: [-5, -4, 5, 1] });
}
export function sacks() {
  return mk(30, 22, (p) => {
    footShade(p, 15, 20, 13, 2);
    for (const [cx, cy, rx, ry] of [[9, 14, 7, 6], [21, 15, 7, 5.5], [15, 8, 6, 5]]) p.scan(cx - rx, cy - ry - 1, cx + rx, cy + ry, (x, y) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1 && !(Math.abs(x - cx) < 1.6 && y < cy - ry + 1 && y > cy - ry - 1)) return 0;
      const l = -(x - cx) / rx - (y - cy) / ry;
      return col32(l > 0.6 ? '#c8b088' : l > -0.2 ? '#a89068' : l > -0.9 ? '#806a4a' : '#5a4834');
    });
    p.scan(13, 2, 17, 4, () => col32('#6a5434'));
  }, { ax: 15, ay: 20, b: true, box: [-13, -8, 13, 1] });
}
export function chest() {
  return mk(28, 22, (p) => {
    footShade(p, 14, 20, 12, 2);
    p.scan(2, 6, 26, 20, (x, y) => (x < 3 || x > 25 || y > 19 ? OAK.c[1] : y < 10 ? OAK.c[y < 7 ? 6 : 5] : Math.floor(x) % 6 === 0 ? OAK.c[2] : OAK.c[4]));
    for (const x of [5, 22]) p.scan(x, 6, x + 1.5, 20, () => IRON.c[3]);
    p.scan(12, 10, 16, 14, (x, y) => (y < 11 ? IRON.c[5] : IRON.c[2]));
  }, { ax: 14, ay: 20, b: true, box: [-12, -8, 12, 1] });
}
export function plant() {
  return mk(18, 26, (p) => {
    footShade(p, 9, 24, 6, 1.5);
    p.scan(4, 16, 14, 24, (x, y) => (Math.abs(x - 9) > 5 - (y - 16) * 0.15 ? 0 : col32(y < 17 ? '#b06a40' : x < 8 ? '#a05a34' : '#7a4026')));
    p.scan(1, 2, 17, 17, (x, y) => { const d = Math.hypot((x - 9) / 8, (y - 10) / 7.5); if (d > 1) return 0; const n = hash2(Math.floor(x), Math.floor(y), 3); return n < 0.25 ? 0 : MOSS.c[d < 0.5 && x < 9 ? 3 : n > 0.6 ? 2 : 1]; });
  }, { ax: 9, ay: 24, b: true, box: [-5, -5, 5, 1] });
}

// ================================================================== Runde 6: Fachwerk-Altstadt (dicht, Wand an Wand)
const PLASTERS = {
  creme: DAUB,
  ocker: R(['#3a2a1a', '#5a4024', '#7c5a30', '#9c763c', '#b8904a', '#ccaa62', '#dcc282']),
  rose: R(['#3a2428', '#5a3a3a', '#7c524e', '#9c6c64', '#b8867a', '#cc9e8e', '#dcb6a4']),
  salbei: R(['#262c26', '#3a4436', '#525e4a', '#6c7a60', '#869478', '#a0ac90', '#b8c2a8']),
  kalk: LIME,
};
const TIMBERS = { eiche: OAK, ochsenblut: R(['#140808', '#240c0c', '#381412', '#4e1c18', '#642620', '#7a3228', '#904032', '#a8523e']) };
const THATCH = R(['#1e160c', '#2e2212', '#46341a', '#5e4622', '#7a5c2c', '#94723a', '#ae8a4a']);
const ROOFP = { shingle: SHING, slate: SLATE, clay: CLAY, thatch: THATCH };
export { PLASTERS, TIMBERS, ROOFP, SHUT };
const SHUT = { gruen: GREEN, rot: RED, blau: R(['#10141e', '#1a2232', '#263246', '#34445c']), braun: R(['#1a100c', '#2a1a12', '#3c261a', '#523422']) };

// Erker: vorspringender Kasten mit Fenstern und eigenem Dächlein
function oriel(p, g, cx, y0, y1, F, seed) {
  const x0 = cx - 13, x1 = cx + 13;
  p.scan(x0 - 1, y0, x1 + 3, y1, (x, y) => (x > x1 ? PL.c[2] : y > y1 - 2 ? TB.c[2] : PL.c[x < x0 + 1 ? 6 : 5]));
  beamV(p, x0 - 1, y0, y1, 2.4); beamV(p, x1 - 1.4, y0, y1, 2.4); beamH(p, x0 - 1, x1 + 1, y1 - 3, 3);
  for (const k of [0, 1, 2]) lead(p, g, x0 + 2.5 + k * 8, y0 + 5, 5, 9, F, { seed: seed + k });
  p.scan(x0, y1, x1 + 2, y1 + 5, (x, y) => (Math.abs(x - cx - 1) > 14 - (y - y1) * 2.2 ? 0 : y > y1 + 4 ? INK : TB.c[y < y1 + 1 ? 6 : 3]));
  roofEave(p, x0 - 3, x1 + 4, y0 - 8, y0 + 1, SHING, 'shingle', seed + 3, { hip: 4 });
}
// Klappladen-Theke (Laden im Erdgeschoss)
function shopFront(p, g, sx0, sx1, top, bot, seed, goods) {
  p.scan(sx0 - 2, top, sx1 + 2, bot - 3, (x, y) => {
    if (x < sx0 || x > sx1 || y < top + 2) return RUB.c[x < sx0 ? 6 : 2];
    if ((x - sx0) % 12 < 1.2) return TB.c[(x - sx0) % 12 < 0.6 ? 4 : 2];
    return y < top + 4 ? col32('#1a1210') : y < bot - 10 ? col32('#3a2618') : Lm[1];
  });
  for (let x = sx0 + 3; x < sx1 - 5; x += 12) p.scan(x, top + 4, x + 6, top + 10, (xx, y) => (y < top + 5 ? col32('#8a6a40') : (Math.floor(xx) & 1) ? col32('#c09040') : col32('#7a5a30')));
  g.each(sx0, bot - 11, sx1, bot - 6, () => LAMP[1]);
  p.scan(sx0 - 3, bot - 7, sx1 + 3, bot - 3, (x, y) => (y < bot - 6.2 ? TB.c[6] : TB.c[3]));
  const G = goods === 'brot' ? ['#e0a860', '#a86a34'] : goods === 'tuch' ? ['#8a3a3a', '#3c4c7a', '#c4a050'] : goods === 'obst' ? ['#c04030', '#d0a030', '#6a8a30'] : ['#a0a0a8', '#606068'];
  for (let k = 0; sx0 + 3 + k * 8 < sx1 - 4; k++) { const bx = sx0 + 4 + k * 8, c = G[k % G.length]; p.scan(bx - 3, bot - 11, bx + 3, bot - 7, (x, y) => (((x - bx) / 3) ** 2 + ((y - bot + 8) / 2.4) ** 2 > 1 ? 0 : col32(y < bot - 9.5 ? '#f0e0c0' : c))); }
  p.scan(sx0 - 3, top - 5, sx1 + 3, top, (x, y) => (Math.floor(x) % 3 === 0 ? TB.c[2] : TB.c[y < top - 4 ? 6 : 4]));
}

// Fachwerkhaus aus dem Baukasten. o: { w Wandbreite px, fl Obergeschosse, gable giebelständig, roof, pl Putz, tb Holz,
//   gf 'stone'|'shop'|'timber', shut, oriel, sign, goods, dormers, seed, door ('l'|'m'|'r'), tall Zusatz-Dachhöhe }
export function fwHouse(o) {
  const ov = 2, fh = o.fh ?? 25, gfh = 28, fl = o.fl ?? 2;
  const wallW = o.w, side = 4, mrg = 10 + ov * fl;
  const roofH = o.roofH ?? (o.gable ? Math.round(wallW * 0.7) + 6 : 60) + (o.tall ?? 0);
  const W = wallW + 2 * mrg + side, H = gfh + fl * fh + roofH + 24, bot = H - 4, x0 = mrg, x1 = mrg + wallW, cx = (x0 + x1) / 2;
  const RP = ROOFP[o.roof ?? 'shingle'], kind = o.roof ?? 'shingle', sh = o.shut ? SHUT[o.shut] : null, seed = o.seed ?? 1;
  // Anker auf einer Kachelmitte: bei gerader Kachelzahl eine halbe Kachel links der Mitte (Häuser stehen so lückenlos Wand an Wand)
  const ax0 = Math.round(cx) - ((wallW / 16) % 2 === 0 ? 8 : 0);
  return mk(W, H, (p, g) => {
    PL = PLASTERS[o.pl ?? 'creme']; TB = TIMBERS[o.tb ?? 'eiche'];
    // Kontaktschatten am Fuß
    p.scan(x0 - 2, bot - 1, x1 + side + 6, bot + 3, (x, y) => (y < bot + 1 ? col32('#120e18') : ((Math.floor(x * 2) + Math.floor(y * 2)) & 1) && y < bot + 2.5 ? col32('#1a1622') : 0));
    const t1 = bot - gfh;
    sideWall(p, x1, side, t1, bot, o.gf === 'timber' ? TB : RUB);
    const dx = o.door === 'l' ? x0 + 14 : o.door === 'r' ? x1 - 14 : cx;
    if (o.gf === 'timber') {
      const gw = [];
      for (let wx = x0 + 8; wx < x1 - 14; wx += 24) if (Math.abs(wx + 4 - dx) > 16) gw.push(wx);
      timberFloor(p, x0, x1, t1, bot, seed + 1, [...gw, dx - 5].sort((u, v) => u - v));
      for (const wx of gw) lead(p, g, wx, t1 + 8, 7, 9, TB, { shut: sh, seed: seed + wx });
      door(p, g, dx, bot, 14, 23, TB, { lamp: hash2(seed, 2, 3) < 0.5 });
    } else {
      rubble(p, x0, x1, t1, bot, RUB, seed + 2);
      quoins(p, x0, t1, bot, RUB); quoins(p, x1, t1, bot, RUB, true);
      door(p, g, dx, bot, 14, 23, RUB, { lamp: hash2(seed, 2, 3) < 0.6 });
      if (o.gf === 'forge') {
        // offene Werkstatt: Rundbogen mit Esse und Amboss im Glutschein
        const left = dx < cx, a0 = left ? dx + 12 : x0 + 8, a1 = left ? x1 - 8 : dx - 12, m0 = (a0 + a1) / 2, rr = (a1 - a0) / 2;
        const inA = (x, y, e = 0) => (y > t1 + 8 + rr ? Math.abs(x - m0) <= rr + e && y <= bot - 1 : Math.hypot(x - m0, y - (t1 + 8 + rr)) <= rr + e);
        p.scan(a0 - 3, t1 + 4, a1 + 3, bot - 1, (x, y) => {
          if (inA(x, y)) { const f = Math.abs(x - m0) * 0.6 + Math.abs(y - (bot - 9)) * 1.3; return f < 4 ? col32('#f8c060') : f < 8 ? col32('#c85818') : f < 13 ? col32('#5a2010') : col32('#1a0e0a'); }
          return inA(x, y, 2) ? RUB.c[x < m0 ? 6 : 3] : 0;
        });
        g.each(a0, t1 + 8, a1, bot - 1, (x, y) => (inA(x, y) && Math.abs(x - m0) * 0.6 + Math.abs(y - (bot - 9)) * 1.3 < 9 ? '#f08030' : null));
        p.scan(m0 - 7, bot - 9, m0 + 7, bot - 1, (x, y) => (y < bot - 6 ? (Math.abs(x - m0) < 7 ? IRON.c[y < bot - 8 ? 5 : 2] : 0) : Math.abs(x - m0) < 2.5 ? IRON.c[1] : 0));
      } else if (o.gf === 'shop') {
        const left = dx < cx, sx0 = left ? dx + 12 : x0 + 8, sx1 = left ? x1 - 8 : dx - 12;
        if (sx1 - sx0 > 18) shopFront(p, g, sx0, sx1, t1 + 9, bot, seed, o.goods);
      } else {
        for (let wx = x0 + 8; wx < x1 - 14; wx += 22) if (Math.abs(wx + 5 - dx) > 16) lead(p, g, wx, t1 + 9, 10, 11, RUB, { stone: true, lit: hash2(wx, seed, 4) < 0.7, seed: seed + wx });
      }
    }
    // Obergeschosse
    let top = t1;
    for (let f = 0; f < fl; f++) {
      const a = x0 - ov * (f + 1), b = x1 + ov * (f + 1), y0 = top - fh;
      const nw = Math.max(2, Math.round((b - a) / 30)), wins = [];
      for (let k = 0; k < nw; k++) wins.push(Math.round(a + (b - a) * (k + 0.5) / nw - 3.5));
      timberFloor(p, a, b, y0, top, seed + 10 + f, wins);
      const skipOriel = o.oriel && f === 0;
      for (const w of wins) if (!(skipOriel && Math.abs(w + 3.5 - cx) < 16)) lead(p, g, w, y0 + 6, 7, 9, TB, { shut: sh, lit: hash2(w, f, seed) < 0.75, seed: seed + w + f });
      jetty(p, a + ov, b - ov, top, ov);
      sideWall(p, b, 3, y0, top, TB);
      top = y0;
    }
    const a = x0 - ov * fl, b = x1 + ov * fl;
    if (o.oriel) oriel(p, g, cx, t1 - fh + 2, t1 - 3, TB, seed + 40);
    // Dach
    if (o.gable) {
      const apex = top - roofH + 8, gb = top;
      const inG = (x, y) => y <= gb && y >= apex + Math.abs(x - (a + b) / 2) / ((b - a) / 2) * (gb - apex);
      const gm = (a + b) / 2, keep = p.scan.bind(p);
      p.scan = (q0, q1, q2, q3, fn) => keep(q0, q1, q2, q3, (x, y) => (inG(x, y) ? fn(x, y) : 0));
      const gw = [Math.round(gm - (b - a) * 0.22 - 3), Math.round(gm + (b - a) * 0.22 - 3)];
      timberFloor(p, a - ov, b + ov, gb - 22, gb, seed + 30, gw);
      timberFloor(p, a - ov, b + ov, apex, gb - 22, seed + 31, [Math.round(gm - 3)]);
      p.scan = keep;
      for (const w of gw) lead(p, g, w, gb - 17, 6, 8, TB, { shut: sh, seed: seed + w });
      lead(p, g, gm - 3, gb - 38, 6, 7, TB, { seed: seed + 5, lit: hash2(seed, 9, 9) < 0.6 });
      jetty(p, a, b, gb, ov);
      roofGable(p, a - ov, b + ov, apex, gb, 14 + (o.tall ?? 0), RP, kind, seed + 50, 4);
      if (hash2(seed, 7, 7) < 0.7) chimney(p, gm + (b - a) * 0.18, apex + 4, 12, hash2(seed, 8, 8) < 0.5 ? RUB : BRK);
    } else {
      roofEave(p, a - 6, b + 7, top - roofH, top + 1, RP, kind, seed + 60, { hip: o.hip ?? 0 });
      const nd = o.dormers ?? 1;
      for (let k = 0; k < nd; k++) dormer(p, g, a + (b - a) * (k + 0.5) / nd, top - 10, RP, kind, seed + 70 + k, TB);
      if (o.chimney !== false) chimney(p, a + 10 + (o.hip ?? 0) + hash2(seed, 1, 1) * (b - a - 30 - 2 * (o.hip ?? 0)), top - roofH - 10 + (o.hip ? 8 : 0), 16, hash2(seed, 8, 8) < 0.5 ? RUB : BRK);
    }
    if (o.sign) sign(p, g, dx + 9, t1 - 2, o.sign, seed);
  }, { ax: ax0, ay: bot, b: true, box: [-(ax0 - x0), -28, x1 - ax0, 1], light: LIGHT });
}

// Innenraum-Möbel für Gasthaus und Schmiede
export function counter() {
  return mk(80, 34, (p) => {
    footShade(p, 40, 32, 38, 2);
    // Rückregal mit Krügen ist an der Wand, hier: Theke mit Zapffässern
    p.scan(2, 12, 78, 31, (x, y) => (y < 13 ? OAK.c[7] : y < 15 ? OAK.c[5] : y > 30 ? OAK.c[1] : Math.floor(x) % 10 === 0 ? OAK.c[2] : OAK.c[x < 3 ? 6 : 4]));
    for (const [kx, c] of [[10, '#e0d0b0'], [16, '#a08060'], [62, '#d0c0a0'], [68, '#a08060'], [44, '#e8e0c8']]) p.scan(kx - 2, 7, kx + 2, 13, (x, y) => (y < 8 ? col32('#f0e8d0') : col32(x < kx ? c : '#5a4030')));
    for (const fx of [28, 38]) p.scan(fx - 5, 2, fx + 5, 12, (x, y) => (Math.abs(y - 4) < 0.6 || Math.abs(y - 9) < 0.6 ? IRON.c[3] : OAK.c[x < fx - 2 ? 6 : x < fx + 2 ? 5 : 3]));
  }, { ax: 40, ay: 31, b: true, box: [-38, -16, 38, 1] });
}
export function kegs() {
  return mk(44, 40, (p) => {
    footShade(p, 22, 38, 20, 2);
    p.scan(2, 4, 42, 38, (x, y) => (x < 3 || x > 41 ? OAK.c[2] : Math.abs(y - 20) < 1 || y > 37 ? OAK.c[1] : 0));
    for (const [bx, by] of [[11, 18], [31, 18], [11, 36], [31, 36]]) p.scan(bx - 9, by - 14, bx + 9, by, (x, y) => {
      const d = Math.hypot((x - bx) / 9, (y - by + 7) / 7);
      if (d > 1) return 0;
      if (d > 0.86) return IRON.c[x < bx ? 4 : 2];
      if (d < 0.18) return OAK.c[1];
      return OAK.c[d > 0.6 ? 3 : (x < bx ? 6 : 4)];
    });
  }, { ax: 22, ay: 38, b: true, box: [-20, -10, 20, 1] });
}
export function anvil() {
  return mk(30, 24, (p) => {
    footShade(p, 15, 22, 13, 2);
    p.scan(9, 12, 21, 22, (x, y) => OAK.c[y > 21 ? 1 : x < 11 ? 5 : 3]);
    p.scan(2, 5, 28, 12, (x, y) => {
      if (y > 9 && (x < 8 || x > 22)) return 0;
      if (x < 6 && y > 7 - (6 - x) * 0.4) return 0;
      return IRON.c[y < 6 ? 6 : y < 8 ? 4 : 2];
    });
    p.scan(18, 2, 26, 5, (x, y) => col32(y < 3 ? '#a0a0b0' : '#5a5a66'));
  }, { ax: 15, ay: 22, b: true, box: [-12, -6, 12, 1] });
}
export function forge() {
  return mk(64, 66, (p, g) => {
    rubble(p, 18, 46, 0, 30, BRK, 801);
    rubble(p, 4, 60, 30, 63, RUB, 802, 1.2);
    p.scan(2, 30, 62, 35, (x, y) => (y < 31 ? RUB.c[7] : y > 34 ? INK : RUB.c[4]));
    p.scan(12, 40, 52, 56, (x, y) => {
      const f = Math.abs(x - 32) * 0.7 + Math.abs(y - 50) * 1.4 + hash2(Math.floor(x), Math.floor(y), 4) * 4;
      return f > 16 ? col32('#1a0e0a') : col32(f < 5 ? '#fff0b0' : f < 9 ? '#f8a030' : f < 13 ? '#c84010' : '#5a1a0a');
    });
    g.each(12, 40, 52, 56, (x, y) => (Math.abs(x - 32) * 0.7 + Math.abs(y - 50) * 1.4 < 13 ? '#f88030' : null));
    // Blasebalg rechts
    p.scan(50, 46, 64, 60, (x, y) => (Math.abs(y - 53) > 6 - (x - 50) * 0.25 ? 0 : col32(y < 52 ? '#8a5a3a' : '#5a3a26')));
    // Zangen und Hämmer am Sims
    for (const tx of [10, 16, 48, 54]) p.scan(tx - 0.6, 18, tx + 0.6, 30, () => IRON.c[3]);
  }, { ax: 32, ay: 63, b: true, box: [-28, -14, 28, 1], light: { dx: 0, dy: -16, radius: 100, color: [255, 130, 60], intensity: 1.0 } });
}
export function weaponRack() {
  return mk(40, 46, (p) => {
    footShade(p, 20, 44, 18, 2);
    p.scan(2, 8, 38, 44, (x, y) => (x < 3.5 || x > 36.5 ? OAK.c[x < 3.5 ? 5 : 2] : Math.abs(y - 12) < 1.2 || Math.abs(y - 38) < 1.2 ? OAK.c[4] : 0));
    for (const [wx, k] of [[9, 's'], [15, 'a'], [21, 's'], [27, 'p'], [33, 's']]) {
      if (k === 's') p.scan(wx - 1, 2, wx + 1, 40, (x, y) => (y > 30 ? (Math.abs(y - 31) < 1 ? col32('#c4a050') : col32('#5a3624')) : IRON.c[x < wx ? 6 : 3]));
      else if (k === 'a') { p.scan(wx - 0.8, 6, wx + 0.8, 42, () => OAK.c[4]); p.scan(wx - 5, 6, wx, 14, (x, y) => (Math.abs(y - 10) > (x - wx + 5) * 0.8 ? 0 : IRON.c[4])); }
      else { p.scan(wx - 0.6, 0, wx + 0.6, 42, () => OAK.c[5]); p.scan(wx - 2, 0, wx + 2, 6, (x, y) => (Math.abs(x - wx) > (y) * 0.4 ? 0 : IRON.c[5])); }
    }
  }, { ax: 20, ay: 44, b: true, box: [-18, -8, 18, 1] });
}



// ------------------------------------------------------------------ Burg, Turm, Stall, Tore
// Zinnenkranz auf einer Mauerkrone (y = Oberkante der Mauer)
function crenels(p, x0, x1, y, P = RUB) {
  for (let x = x0; x < x1 - 3; x += 10) p.scan(x, y - 6, Math.min(x + 6, x1), y, (xx, yy) => (yy < y - 5.2 ? P.c[7] : xx < x + 1 ? P.c[6] : xx > x + 5 ? P.c[2] : P.c[4]));
  p.scan(x0, y - 1, x1, y + 1.5, (x, yy) => (yy < y ? P.c[6] : P.c[1]));
}
// Rundturm mit Kegeldach aus Schiefer
function roundTower(p, g, tx, top, bot, thw, seed, { cone = 1.6, wins = [], banner = false, P = RUB } = {}) {
  p.scan(tx - thw, top, tx + thw, bot, (x, y) => {
    const rel = (x - tx) / thw;
    if (Math.abs(rel) > 1) return 0;
    const row = Math.floor((bot - y) / 6), off = (row & 1) * 0.5, ly = (bot - y) % 6, cu = rel * 5 + 5 + off;
    let i = rel < -0.6 ? 6 : rel < -0.1 ? 5 : rel < 0.45 ? 4 : rel < 0.8 ? 3 : 2;
    if (ly < 0.7 || cu % 1 < 0.1) i -= 2;
    if (hash2(Math.floor(cu), row, seed) < 0.15) i--;
    if (Math.abs(rel) > 0.95) return INK;
    return P.c[cl(i, 7)];
  });
  for (const [wy, lit] of wins) lead(p, g, tx - 2.5, wy, 5, 10, P, { pointed: true, stone: true, lit, seed: seed + wy });
  p.scan(tx - thw - 2, top - 2, tx + thw + 2, top + 2, (x, y) => (y < top - 1 ? P.c[7] : P.c[2]));
  const sh = thw * 2 * cone, sb = top - 1;
  p.scan(tx - thw - 3, sb - sh, tx + thw + 3, sb + 2, (x, y) => {
    if (y > sb) return Math.abs(x - tx) > thw + 3 ? 0 : INK;
    const k = (y - (sb - sh)) / sh, hw = (thw + 3) * k;
    if (Math.abs(x - tx) > hw) return 0;
    const rel = (x - tx) / Math.max(hw, 0.1), r = Math.floor((sb - y) / 2.6), lv = (sb - y) % 2.6;
    let i = rel < -0.5 ? 5 : rel < 0 ? 4 : rel < 0.5 ? 3 : 2;
    if (lv < 0.6) i--;
    if (hash2(Math.floor(rel * 6 + (r & 1) * 0.5), r, seed + 1) < 0.15) i--;
    return SLATE.c[cl(i)];
  });
  p.scan(tx - 0.6, sb - sh - 7, tx + 0.6, sb - sh, () => IRON.c[4]);
  if (banner) p.scan(tx + 0.6, sb - sh - 7, tx + 9, sb - sh - 2, (x, y) => (x > tx + 9 - Math.abs(y - (sb - sh - 4.5)) * 1.2 ? 0 : col32(y < sb - sh - 4.5 ? '#b83a30' : '#8a2620')));
}
function wallBlock(p, x0, x1, top, bot, seed, P = RUB) { rubble(p, x0, x1, top, bot, P, seed, 1.2); }

// Fürstenburg: Ringmauer mit Torbau und Rundtürmen, dahinter Palas mit Schieferdach und Bergfried
export function castle() {
  const W = 368, H = 330, bot = H - 4, cx = W / 2;
  return mk(W, H, (p, g) => {
    PL = DAUB; TB = OAK;
    p.scan(26, bot - 1, W - 22, bot + 3, (x, y) => (y < bot + 1 ? col32('#120e18') : 0));
    // Bergfried hinten rechts
    const kx0 = 236, kx1 = 284, ktop = bot - 268;
    wallBlock(p, kx0, kx1, ktop, bot - 60, 901);
    quoins(p, kx0, ktop, bot - 60, RUB); quoins(p, kx1, ktop, bot - 60, RUB, true);
    crenels(p, kx0 - 3, kx1 + 3, ktop);
    for (const wy of [ktop + 20, ktop + 60, ktop + 100]) lead(p, g, (kx0 + kx1) / 2 - 3, wy, 6, 12, RUB, { pointed: true, stone: true, seed: wy });
    roofGable(p, kx0 + 4, kx1 - 4, ktop - 34, ktop - 6, 10, SLATE, 'slate', 902, 2);
    p.scan((kx0 + kx1) / 2 - 0.6, ktop - 52, (kx0 + kx1) / 2 + 0.6, ktop - 34, () => IRON.c[4]);
    p.scan((kx0 + kx1) / 2 + 0.6, ktop - 52, (kx0 + kx1) / 2 + 16, ktop - 42, (x, y) => (x > (kx0 + kx1) / 2 + 16 - Math.abs(y - (ktop - 47)) * 1.4 ? 0 : col32(y < ktop - 47 ? '#b83a30' : '#8a2620')));
    // Palas
    const px0 = 84, px1 = 254, ptop = bot - 150, pbot = bot - 56;
    wallBlock(p, px0, px1, ptop, pbot, 903);
    quoins(p, px0, ptop, pbot, RUB); quoins(p, px1, ptop, pbot, RUB, true);
    p.scan(px0 - 2, ptop + 38, px1 + 2, ptop + 41, (x, y) => (y < ptop + 39 ? RUB.c[7] : RUB.c[1]));
    for (let k = 0; k < 6; k++) { const wx = px0 + 16 + k * 26; lead(p, g, wx, ptop + 8, 10, 24, RUB, { pointed: true, stone: true, seed: 910 + k }); lead(p, g, wx + 1, ptop + 50, 8, 18, RUB, { pointed: true, stone: true, lit: k % 2 === 0, seed: 920 + k }); }
    roofEave(p, px0 - 8, px1 + 9, ptop - 74, ptop + 1, SLATE, 'slate', 904, { hip: 0 });
    for (const dx of [px0 + 40, px1 - 40]) dormer(p, g, dx, ptop - 12, SLATE, 'slate', 905 + dx, RUB);
    chimney(p, px0 + 24, ptop - 84, 18); chimney(p, px1 - 30, ptop - 80, 16);
    // Ringmauer
    const wtop = bot - 62;
    wallBlock(p, 34, W - 34, wtop, bot, 906);
    crenels(p, 30, W - 30, wtop);
    p.scan(34, bot - 4, W - 34, bot, (x, y) => (hash2(Math.floor(x / 3), 0, 9) < 0.5 ? MOSS.c[1] : RUB.c[2]));
    // Ecktürme und Torbau
    roundTower(p, g, 34, bot - 120, bot, 22, 911, { wins: [[bot - 100, true], [bot - 60, false]], banner: true });
    roundTower(p, g, W - 34, bot - 120, bot, 22, 912, { wins: [[bot - 100, false], [bot - 60, true]], banner: true });
    const gx0 = cx - 40, gx1 = cx + 40, gtop = bot - 104;
    wallBlock(p, gx0, gx1, gtop, bot, 913);
    quoins(p, gx0, gtop, bot, RUB); quoins(p, gx1, gtop, bot, RUB, true);
    crenels(p, gx0 - 3, gx1 + 3, gtop);
    roundTower(p, g, gx0 - 6, bot - 132, bot, 16, 914, { wins: [[bot - 110, true], [bot - 70, true]] });
    roundTower(p, g, gx1 + 6, bot - 132, bot, 16, 915, { wins: [[bot - 110, true], [bot - 70, false]] });
    // Tor mit Fallgitter (offen) und Wappen
    door(p, g, cx, bot, 30, 44, RUB, { pointed: true, lamp: false, step: true });
    p.scan(cx - 15, bot - 52, cx + 15, bot - 46, (x, y) => (Math.floor(x) % 4 === 0 ? IRON.c[2] : 0));
    p.scan(cx - 9, gtop + 10, cx + 9, gtop + 30, (x, y) => (Math.abs(x - cx) > 9 - Math.max(0, y - gtop - 22) * 1.1 ? 0 : x < cx - 8.4 || y < gtop + 10.6 ? col32('#e0c070') : Math.abs(x - cx) < 1.2 || Math.abs(y - gtop - 18) < 1.2 ? col32('#e0c070') : col32(x < cx ? '#a83a30' : '#7a2420')));
    for (const lx of [cx - 26, cx + 22]) lantern(p, g, lx, bot - 36);
    // Banner an der Mauer
    for (const bx of [gx0 - 60, gx1 + 52]) p.scan(bx, wtop + 6, bx + 10, wtop + 40, (x, y) => (y > wtop + 34 + (Math.abs(x - bx - 5) < 2.5 ? 4 : 0) ? 0 : x < bx + 1 || x > bx + 9 ? col32('#c49a4a') : col32(y < wtop + 8 ? '#5a3624' : x < bx + 5 ? '#a83a30' : '#8a2a24')));
  }, { ax: cx, ay: bot, b: true, box: [-(cx - 30), -40, cx - 30, 1], light: { dx: 0, dy: -30, radius: 120, color: [255, 190, 120], intensity: 0.5 } });
}

// Sternturm der Sternkundigen: Rundturm mit Galerie und kupfergrüner Kuppel mit Fernrohr
export function starTower() {
  const W = 96, H = 290, bot = H - 4, tx = 48, thw = 24, top = bot - 210;
  const COP = R(['#0e2420', '#163830', '#205040', '#2e6a54', '#40866a', '#5aa282', '#7cbc9c']);
  return mk(W, H, (p, g) => {
    PL = DAUB; TB = OAK;
    p.scan(tx - thw - 4, bot - 1, tx + thw + 8, bot + 3, (x, y) => (y < bot + 1 ? col32('#120e18') : 0));
    p.scan(tx - thw, top, tx + thw, bot, (x, y) => {
      const rel = (x - tx) / thw;
      if (Math.abs(rel) > 1) return 0;
      const row = Math.floor((bot - y) / 6), off = (row & 1) * 0.5, ly = (bot - y) % 6, cu = rel * 6 + 6 + off;
      let i = rel < -0.6 ? 6 : rel < -0.1 ? 5 : rel < 0.45 ? 4 : rel < 0.8 ? 3 : 2;
      if (ly < 0.7 || cu % 1 < 0.08) i -= 2;
      if (hash2(Math.floor(cu), row, 31) < 0.15) i--;
      if (Math.abs(rel) > 0.95) return INK;
      return RUB.c[cl(i, 7)];
    });
    for (const [wy, l] of [[top + 30, true], [top + 80, false], [top + 130, true]]) lead(p, g, tx - 3, wy, 6, 13, RUB, { pointed: true, stone: true, lit: l, seed: wy });
    door(p, g, tx, bot, 16, 26, RUB, { pointed: true, lamp: true });
    // Galerie mit Zinnen und Kragsteinen
    const gy = top + 4;
    p.scan(tx - thw - 5, gy, tx + thw + 5, gy + 6, (x, y) => (y > gy + 5 ? INK : RUB.c[y < gy + 1 ? 7 : x < tx ? 5 : 3]));
    for (let x = tx - thw - 3; x < tx + thw + 3; x += 6) p.scan(x, gy + 6, x + 3, gy + 10, (xx, y) => RUB.c[xx < x + 1 ? 6 : 3]);
    crenels(p, tx - thw - 5, tx + thw + 5, gy);
    // Kuppel
    const dr = thw - 2, dcy = gy - 6;
    p.scan(tx - dr, dcy - dr, tx + dr, dcy, (x, y) => {
      const d = Math.hypot(x - tx, (y - dcy) * 1.15);
      if (d > dr) return 0;
      if (Math.abs(x - tx - 4) < 2.5 && y > dcy - dr + 3) return col32('#141820');   // Spalt
      const l = -(x - tx) / dr - (y - dcy) / dr * 0.6;
      let i = l > 0.7 ? 6 : l > 0.3 ? 5 : l > -0.1 ? 4 : l > -0.5 ? 3 : 2;
      if (Math.floor(Math.atan2(y - dcy, x - tx) * 6) % 2 === 0 && d > dr - 1.2) i--;
      return COP.c[cl(i)];
    });
    // Fernrohr
    p.scan(tx + 4, dcy - dr - 10, tx + 20, dcy - dr + 4, (x, y) => (Math.abs((y - (dcy - dr + 4)) + (x - tx - 4) * 0.8) < 2 ? col32(x < tx + 12 ? '#e0b860' : '#a87830') : 0));
    p.scan(tx - 0.6, dcy - dr - 6, tx + 0.6, dcy - dr, () => IRON.c[4]);
    g.each(tx + 2, dcy - dr + 3, tx + 6, dcy - 2, () => '#a0c0ff');
  }, { ax: tx, ay: bot, b: true, box: [-thw, -30, thw, 1], light: { dx: 0, dy: -40, radius: 80, color: [200, 210, 255], intensity: 0.4 } });
}

// Stall: Bretterscheune mit Tor, Heuluke und Reetdach
export function stable() {
  const W = 200, H = 150, bot = H - 4, x0 = 14, x1 = W - 22, cx = (x0 + x1) / 2, wtop = bot - 60;
  return mk(W, H, (p, g) => {
    PL = DAUB; TB = OAK;
    p.scan(x0 - 2, bot - 1, x1 + 8, bot + 3, (x, y) => (y < bot + 1 ? col32('#120e18') : 0));
    sideWall(p, x1, 4, wtop, bot, OAK);
    rubble(p, x0, x1, bot - 8, bot, RUB, 931);
    p.scan(x0, wtop, x1, bot - 8, (x, y) => {
      const b = Math.floor((x - x0) / 5), lx = (x - x0) % 5;
      if (lx < 0.6) return OAK.c[1];
      let i = hash2(b, 0, 932) < 0.3 ? 3 : 4;
      if (lx < 1.4) i++;
      if (hash2(b, Math.floor(y / 9), 933) < 0.08) i--;
      return OAK.c[i];
    });
    for (const y of [wtop, wtop + 26, bot - 11]) beamH(p, x0 - 1, x1 + 1, y, 3);
    for (const x of [x0, cx - 22, cx + 19, x1 - 3]) beamV(p, x, wtop, bot - 8);
    // Tor (offen, dunkel) mit Torflügeln
    p.scan(cx - 19, wtop + 29, cx + 19, bot - 1, (x, y) => (y < wtop + 30 ? OAK.c[6] : col32(y < wtop + 36 ? '#120a08' : '#22160e')));
    for (const [a, b] of [[cx - 34, cx - 20], [cx + 20, cx + 34]]) p.scan(a, wtop + 29, b, bot - 1, (x, y) => (Math.floor(x - a) % 4 < 0.6 ? OAK.c[2] : Math.abs((y - wtop - 29) - (x - a) * 2.2) < 1.4 || Math.abs((y - wtop - 29) - (b - x) * 2.2) < 1.4 ? OAK.c[5] : OAK.c[3]));
    // Pferdekopf im Tor
    p.scan(cx - 6, wtop + 40, cx + 8, wtop + 56, (x, y) => (Math.hypot((x - cx) / 6, (y - wtop - 46) / 7) < 1 || (x > cx && x < cx + 8 && y > wtop + 48 && y < wtop + 54) ? col32(x < cx - 2 ? '#8a5a3a' : '#5a3622') : 0));
    p.scan(cx - 4, wtop + 38, cx - 1, wtop + 42, () => col32('#3a2216'));
    // Heuluke
    p.scan(cx - 9, wtop + 4, cx + 9, wtop + 22, (x, y) => (x < cx - 8 || x > cx + 8 || y < wtop + 5 ? OAK.c[1] : y > wtop + 14 ? col32((Math.floor(x * 2) & 1) ? '#c8a050' : '#9a7a34') : col32('#1a100a')));
    for (const wx of [x0 + 18, x1 - 30]) lead(p, g, wx, wtop + 8, 10, 9, OAK, { shut: GREEN, seed: wx });
    roofEave(p, x0 - 8, x1 + 9, wtop - 52, wtop + 2, R(['#1e140c', '#33230f', '#4c3615', '#664a1e', '#80602a', '#9a7838', '#b6924c']), 'thatch', 934, { hip: 8 });
    // Hufeisen über dem Tor
    p.scan(cx - 3, wtop + 31, cx + 3, wtop + 36, (x, y) => { const d = Math.hypot(x - cx, y - wtop - 32); return d < 3 && d > 1.6 && y > wtop + 31.5 ? IRON.c[5] : 0; });
  }, { ax: Math.round(cx), ay: bot, b: true, box: [-(cx - x0), -28, x1 - cx, 1], light: LIGHT });
}

// Stadttor: zwei Tortürme, der linke trägt den Bogen über den Durchgang (3 Kacheln). sealed = verschlossen mit Siegel
function gateTower(p, g, tx, bot, seed) {
  const x0 = tx - 18, x1 = tx + 18, top = bot - 112;
  wallBlock(p, x0, x1, top, bot, seed);
  quoins(p, x0, top, bot, RUB); quoins(p, x1, top, bot, RUB, true);
  crenels(p, x0 - 3, x1 + 3, top);
  lead(p, g, tx - 3, top + 20, 6, 12, RUB, { pointed: true, stone: true, seed });
  p.scan(tx - 1, top + 50, tx + 1, top + 62, () => INK);                       // Schießscharte
  roofGable(p, x0 + 2, x1 - 2, top - 30, top - 6, 8, SLATE, 'slate', seed + 1, 2);
}
export function gateLeft(sealed = false) {
  const W = 150, H = 170, bot = H - 4, tx = 26;
  return mk(W, H, (p, g) => {
    PL = DAUB; TB = OAK;
    const ax0 = tx + 18, ax1 = tx + 18 + 80 - 36, atop = bot - 92, abot = bot - 52;
    // Bogenbrücke über dem Durchgang mit Wehrgang
    const m = (ax0 + ax1) / 2, r = (ax1 - ax0) / 2;
    const curve = (x) => abot + 18 * (1 - Math.sqrt(Math.max(0, 1 - ((x - m) / r) ** 2)));
    const keep = p.scan.bind(p);
    p.scan = (q0, q1, q2, q3, fn) => keep(q0, q1, q2, q3, (x, y) => (y < curve(x) ? fn(x, y) : 0));
    rubble(p, ax0, ax1, atop, abot + 18, RUB, 951);
    p.scan = keep;
    p.scan(ax0, abot - 3, ax1, abot + 18, (x, y) => { const c = curve(x); return y < c && y > c - 3 ? (y > c - 1 ? RUB.c[1] : RUB.c[Math.floor(x / 4) % 2 ? 6 : 5]) : 0; });
    crenels(p, ax0, ax1, atop);
    p.scan(ax0 + 6, atop + 12, ax1 - 6, atop + 24, (x, y) => (Math.abs(x - m) > 8 ? 0 : (Math.abs(x - m) < 1.2 || Math.abs(y - atop - 18) < 1.2) ? col32('#e0c070') : col32(x < m ? '#a83a30' : '#7a2420')));
    if (sealed) {
      p.scan(ax0, abot + 4, ax1, bot, (x, y) => (Math.floor(x) % 5 < 1 || Math.floor(y) % 6 < 1 ? IRON.c[3] : 0));
      g.each(m - 14, abot + 14, m + 14, bot - 8, (x, y) => (Math.abs(Math.hypot(x - m, y - (bot - 26)) - 10) < 1.2 ? '#b080ff' : null));
      p.scan(m - 14, abot + 14, m + 14, bot - 8, (x, y) => (Math.abs(Math.hypot(x - m, y - (bot - 26)) - 10) < 1.2 ? col32('#c8a0ff') : 0));
    }
    gateTower(p, g, tx, bot, 952);
    lantern(p, g, tx + 22, bot - 40);
  }, { ax: tx, ay: bot, b: true, box: sealed ? [-18, -24, 100, 1] : [-18, -24, 18, 1], light: LIGHT });
}
export function gateRight() {
  const W = 60, H = 170, bot = H - 4, tx = 26;
  return mk(W, H, (p, g) => { PL = DAUB; TB = OAK; gateTower(p, g, tx, bot, 961); lantern(p, g, tx - 24, bot - 40); }, { ax: tx, ay: bot, b: true, box: [-18, -24, 18, 1] });
}

// ------------------------------------------------------------------ weitere Möbel
export function throne() {
  return mk(48, 60, (p, g) => {
    footShade(p, 24, 57, 22, 3);
    p.scan(2, 48, 46, 58, (x, y) => (y < 49 ? RUB.c[7] : y > 57 ? RUB.c[1] : RUB.c[x < 3 ? 6 : 4]));     // Podest
    p.scan(10, 2, 38, 44, (x, y) => {
      if (y < 12 && Math.abs(x - 24) > 14 - (12 - y) * 0.4) return 0;
      if (x < 11 || x > 37) return col32('#b88a30');
      if (y < 4) return col32('#f6d888');
      return x > 14 && x < 34 && y > 8 && y < 40 ? col32(x < 24 ? '#a83a30' : '#7a2420') : col32(x < 24 ? '#e0b860' : '#a87830');
    });
    p.scan(6, 30, 42, 48, (x, y) => (y < 32 ? col32('#f6d888') : x < 9 || x > 39 ? col32('#b88a30') : y < 38 ? col32('#c84a3a') : col32('#7a2420')));
    p.scan(22, 5, 26, 9, (x, y) => (Math.abs(x - 24) + Math.abs(y - 7) < 2.2 ? col32('#a0e0ff') : 0));
    g.each(22, 5, 26, 9, (x, y) => (Math.abs(x - 24) + Math.abs(y - 7) < 2.2 ? '#80c0ff' : null));
  }, { ax: 24, ay: 57, b: true, box: [-22, -12, 22, 1] });
}
export function bannerStand() {
  return mk(18, 64, (p) => {
    footShade(p, 9, 62, 6, 1.5);
    p.scan(8, 0, 10, 62, () => OAK.c[4]);
    p.scan(4, 2, 14, 4, () => col32('#c49a4a'));
    p.scan(3, 4, 15, 44, (x, y) => (y > 38 + (Math.abs(x - 9) < 3 ? 6 : 0) ? 0 : x < 4 || x > 14 ? col32('#c49a4a') : Math.abs(x - 9) + Math.abs(y - 20) < 4 ? col32('#f6d888') : col32(x < 9 ? '#a83a30' : '#8a2a24')));
  }, { ax: 9, ay: 62, b: true, box: [-5, -4, 5, 1] });
}
export function telescope() {
  return mk(34, 44, (p, g) => {
    footShade(p, 17, 42, 13, 2);
    for (const [a, b] of [[6, 17], [28, 17], [17, 19]]) p.scan(Math.min(a, b) - 1, 22, Math.max(a, b) + 1, 42, (x, y) => (Math.abs(x - (b + (a - b) * (y - 22) / 20)) < 0.9 ? OAK.c[4] : 0));
    p.scan(2, 2, 32, 24, (x, y) => (Math.abs((y - 22) + (x - 6) * 0.65) < (3 - (x - 2) * 0.05) ? col32(x < 17 ? '#e0b860' : x < 26 ? '#c89848' : '#a87830') : 0));
    p.scan(29, 2, 33, 7, (x, y) => (Math.hypot(x - 31, y - 4.5) < 2.4 ? col32('#a0c0e0') : 0));
  }, { ax: 17, ay: 42, b: true, box: [-12, -6, 12, 1] });
}
export function bookshelf() {
  return mk(38, 60, (p) => {
    p.scan(2, 2, 36, 58, (x, y) => (x < 3 || x > 35 || y > 56.5 ? OAK.c[x < 3 ? 5 : 1] : y < 3 ? OAK.c[7] : OAK.c[2]));
    const bc = ['#6a2622', '#264434', '#3c3c66', '#8a6a30', '#5a3624', '#7a4a6a', '#2a4a5a'];
    for (const sy of [14, 27, 40, 53]) {
      p.scan(3, sy, 35, sy + 2, (x, y) => (y < sy + 1 ? OAK.c[6] : OAK.c[3]));
      for (let x = 4, k = 0; x < 34; k++) { const w = 2 + (hash2(k, sy, 3) * 2.2), h = 8 + Math.floor(hash2(k, sy, 4) * 3), c = bc[Math.floor(hash2(k, sy, 5) * bc.length)]; p.scan(x, sy - h, x + w - 0.4, sy, (xx, y) => col32(y < sy - h + 1 ? '#d8c8a0' : xx < x + 0.6 ? '#e0d0b0' : c)); x += w; }
    }
  }, { ax: 19, ay: 58, b: true, box: [-17, -10, 17, 1] });
}
export function desk() {
  return mk(48, 32, (p, g) => {
    footShade(p, 24, 30, 22, 2);
    p.scan(3, 10, 45, 30, (x, y) => (y < 11 ? OAK.c[7] : y < 18 ? OAK.c[5] : y > 29 ? OAK.c[1] : x < 6 || x > 42 ? OAK.c[3] : 0));
    p.scan(6, 18, 42, 29, (x, y) => (Math.floor(x) % 12 === 0 ? OAK.c[2] : OAK.c[4]));
    p.scan(12, 8, 30, 15, (x, y) => (Math.abs(x - 21) < 0.5 ? col32('#a08860') : col32(y < 9 ? '#f0e8d0' : (Math.floor(y) % 2 && Math.abs(x - 21) > 2) ? col32('#8a7a60') : col32('#e0d6c0'))));
    p.scan(34, 4, 36, 12, (x, y) => (y < 6 ? Lm[4] : col32('#e8e0c8')));
    g.each(33.5, 2.5, 36.5, 6, () => LAMP[4]);
    p.scan(5, 9, 10, 12, () => col32('#d8c8a0'));
  }, { ax: 24, ay: 30, b: true, box: [-21, -14, 21, 1], light: { dx: 10, dy: -24, radius: 40, color: [255, 190, 110], intensity: 0.5 } });
}
export function displayCase() {
  return mk(48, 34, (p, g) => {
    footShade(p, 24, 32, 22, 2);
    p.scan(3, 16, 45, 32, (x, y) => (y > 31 ? OAK.c[1] : x < 4 || x > 44 ? OAK.c[2] : Math.floor(x) % 14 === 3 ? OAK.c[3] : OAK.c[4]));
    p.scan(3, 4, 45, 16, (x, y) => (x < 4 || x > 44 || y < 5 ? col32('#c49a4a') : col32(y < 8 ? '#3a4a5a' : '#2a3442')));
    const gem = ['#a0e0ff', '#ff8aa0', '#a0ffb0', '#f6d888', '#c0a0ff'];
    for (let k = 0; k < 5; k++) { const gx = 9 + k * 7.5; p.scan(gx - 2, 9, gx + 2, 14, (x, y) => (Math.abs(x - gx) + Math.abs(y - 11.5) < 2.4 ? col32(gem[k]) : 0)); g.each(gx - 1, 10, gx + 1, 13, () => gem[k]); }
    p.scan(5, 5, 9, 6, () => col32('#e8f0ff'));
  }, { ax: 24, ay: 32, b: true, box: [-21, -14, 21, 1] });
}
export function armorStand() {
  return mk(26, 48, (p) => {
    footShade(p, 13, 46, 10, 2);
    p.scan(12, 30, 14, 46, () => OAK.c[3]);
    p.scan(6, 44, 20, 46, () => OAK.c[2]);
    p.scan(6, 12, 20, 32, (x, y) => (Math.abs(x - 13) > 7 - (y > 26 ? (y - 26) * 0.4 : 0) ? 0 : IRON.c[x < 10 ? 6 : x < 15 ? 5 : 3]));
    p.scan(3, 12, 23, 18, (x, y) => (Math.hypot((x - (x < 13 ? 6 : 20)) / 3.5, (y - 15) / 3) < 1 ? IRON.c[x < 13 ? 6 : 3] : 0));
    p.scan(9, 2, 17, 12, (x, y) => (Math.hypot((x - 13) / 4, (y - 7) / 5) < 1 ? (Math.abs(y - 8) < 0.7 && Math.abs(x - 13) < 3 ? INK : IRON.c[x < 13 ? 6 : 4]) : 0));
    p.scan(12.4, 0, 13.6, 3, () => col32('#a83a30'));
  }, { ax: 13, ay: 46, b: true, box: [-8, -6, 8, 1] });
}
export function planter(seed = 1) {
  return mk(22, 20, (p) => {
    footShade(p, 11, 18, 9, 1.5);
    p.scan(3, 10, 19, 18, (x, y) => (Math.abs(y - 13) < 0.6 ? IRON.c[3] : OAK.c[x < 5 ? 6 : x > 17 ? 2 : 4]));
    const F = seed % 2 ? ['#d84a5a', '#f0a0b0'] : ['#e0c040', '#f8e890'];
    p.scan(2, 1, 20, 11, (x, y) => { const d = Math.hypot((x - 11) / 9, (y - 7) / 5.5); if (d > 1) return 0; const n = hash2(Math.floor(x), Math.floor(y), seed); return n > 0.82 ? col32(F[n > 0.92 ? 1 : 0]) : n < 0.2 ? 0 : MOSS.c[n > 0.55 ? 3 : 2]; });
  }, { ax: 11, ay: 18, b: true, box: [-8, -5, 8, 1] });
}
export function bench() {
  return mk(34, 20, (p) => {
    footShade(p, 17, 18, 15, 1.5);
    for (const x of [5, 27]) p.scan(x, 10, x + 2, 18, () => OAK.c[2]);
    p.scan(2, 8, 32, 12, (x, y) => (y < 9 ? OAK.c[6] : y > 11 ? OAK.c[1] : OAK.c[4]));
    p.scan(2, 1, 32, 6, (x, y) => (y < 2 ? OAK.c[6] : y > 5 ? OAK.c[1] : OAK.c[3]));
    for (const x of [5, 27]) p.scan(x, 1, x + 2, 9, () => OAK.c[3]);
  }, { ax: 17, ay: 18, b: true, box: [-15, -4, 15, 1] });
}

// ------------------------------------------------------------------ Häuserliste
// Bürgerhäuser (Varianten fw0 … fw13) und die Häuser der Questgeber. w = Wandbreite in px (Vielfache von 16 passen
// Wand an Wand), door = Lage der Tür (l/m/r) – die Karte rechnet daraus die Türkachel für die Innenräume.
export const FW = [
  { w: 112, fl: 2, gf: 'stone', pl: 'creme', shut: 'gruen', dormers: 1, seed: 11, door: 'l', oriel: true },
  { w: 80, fl: 2, gable: true, gf: 'shop', pl: 'ocker', shut: 'rot', sign: 'brot', goods: 'brot', seed: 12, door: 'l' },
  { w: 64, fl: 3, gable: true, gf: 'timber', pl: 'kalk', tb: 'ochsenblut', shut: 'blau', seed: 13, roof: 'slate' },
  { w: 96, fl: 2, gf: 'shop', pl: 'rose', shut: 'braun', dormers: 2, goods: 'tuch', seed: 14, door: 'r', sign: 'stiefel' },
  { w: 80, fl: 2, gable: true, gf: 'stone', pl: 'salbei', shut: 'gruen', seed: 15, roof: 'clay', oriel: true },
  { w: 64, fl: 3, gable: true, gf: 'shop', pl: 'creme', tb: 'ochsenblut', shut: 'rot', goods: 'obst', seed: 16, door: 'l', tall: 6 },
  { w: 128, fl: 2, gf: 'stone', pl: 'ocker', tb: 'ochsenblut', shut: 'gruen', dormers: 2, seed: 17, door: 'm', roof: 'slate' },
  { w: 80, fl: 2, gf: 'timber', pl: 'kalk', shut: 'blau', dormers: 1, seed: 18, door: 'r' },
  { w: 96, fl: 3, gable: true, gf: 'stone', pl: 'rose', shut: 'braun', seed: 19, door: 'm', roof: 'clay', oriel: true },
  { w: 64, fl: 2, gable: true, gf: 'timber', pl: 'ocker', shut: 'gruen', seed: 20, door: 'r' },
  { w: 96, fl: 2, gf: 'timber', pl: 'salbei', tb: 'ochsenblut', shut: 'rot', dormers: 2, seed: 21, door: 'l' },
  { w: 80, fl: 3, gable: true, gf: 'stone', pl: 'creme', shut: 'blau', seed: 22, roof: 'slate', door: 'm' },
  { w: 112, fl: 2, gf: 'shop', pl: 'kalk', tb: 'ochsenblut', shut: 'gruen', dormers: 1, goods: 'obst', seed: 23, door: 'l', oriel: true },
  { w: 64, fl: 2, gable: true, gf: 'stone', pl: 'rose', shut: 'gruen', seed: 24, roof: 'clay', door: 'm' },
];
export const SPECIAL = {
  hInn: { w: 160, fl: 2, gf: 'stone', pl: 'ocker', shut: 'rot', dormers: 3, sign: 'krug', seed: 41, door: 'm', oriel: false, roof: 'shingle' },
  hSmithy: { w: 112, fl: 2, gf: 'forge', pl: 'creme', tb: 'ochsenblut', shut: 'braun', dormers: 1, sign: 'hammer', seed: 42, door: 'r', roof: 'slate' },
  hShop: { w: 96, fl: 2, gable: true, gf: 'shop', pl: 'salbei', shut: 'gruen', sign: 'flasche', goods: 'obst', seed: 43, door: 'l' },
  hJewel: { w: 80, fl: 3, gable: true, gf: 'shop', pl: 'rose', tb: 'ochsenblut', shut: 'blau', sign: 'ring', goods: 'tuch', seed: 44, door: 'r', roof: 'clay', oriel: true },
  hArmory: { w: 112, fl: 2, gf: 'stone', pl: 'kalk', shut: 'rot', dormers: 2, sign: 'schild', seed: 45, door: 'm', roof: 'slate' },
  hLibrary: { w: 96, fl: 3, gable: true, gf: 'stone', pl: 'creme', tb: 'ochsenblut', shut: 'gruen', sign: 'buch', seed: 46, door: 'm', roof: 'slate', oriel: true },
};
// Türversatz einer Hausvariante (px vom Anker, wie in fwHouse) und Lage auf der Karte: ein Haus mit n Kacheln Breite ab Kachel
// s steht mit seinem Anker auf Kachel s + ceil(n/2) − 1
export function doorOffset(o) { const half = (o.w / 16) % 2 === 0 ? 8 : 0; return (o.door === 'l' ? -o.w / 2 + 14 : o.door === 'r' ? o.w / 2 - 14 : 0) + half; }
export function houseAnchor(o, s) { return s + Math.ceil(o.w / 32) - 1; }
export function houseDoor(o, s) { return Math.floor(((houseAnchor(o, s) * 16) + 8 + doorOffset(o)) / 16); }

export function createAltstadtDecor() {
  const D = {
    castle: castle(), starTowerM: starTower(), stableM: stable(), gateL: gateLeft(), gateR: gateRight(), gateSealed: gateLeft(true),
    fTable: table(), fBed: bed(), fHearth: hearth(), fCupboard: cupboard(), fBarrels: barrels(), fStool: stool(), fSacks: sacks(), fChest: chest(),
    fPlant: plant(), fCounter: counter(), fKegs: kegs(), fAnvil: anvil(), fForge: forge(), fRack: weaponRack(), fThrone: throne(),
    fBanner: bannerStand(), fTelescope: telescope(), fBooks: bookshelf(), fDesk: desk(), fCase: displayCase(), fArmor: armorStand(),
    planters: [planter(1), planter(2)], bench: bench(),
    glutbogen: glutbogen(),
    wShield: wallShield(), wShelf: [wallShelf(1), wallShelf(2)], wPicture: wallPicture(0), wStarmap: wallPicture(1), wSconce: sconce(), wTapestry: [wallTapestry(0), wallTapestry(1)],
  };
  FW.forEach((o, i) => { D['fw' + i] = fwHouse(o); });
  for (const [k, o] of Object.entries(SPECIAL)) D[k] = fwHouse(o);
  return D;
}

// ------------------------------------------------------------------ Sternentor (Portal in die Glutöde)
// In der Öffnung wabert ein Glutschleier: unten hell wie ein Glutschein am Horizont, oben dunkel, mit Funken.
// inside(x,y) = Öffnung, [y0, y1] = Höhe der Öffnung.
const FIRE = R(['#1a0806', '#3a0e0a', '#661a0c', '#9a2c10', '#cc4a18', '#ee7a2a', '#ffb050', '#ffe0a0']);
function emberVeil(p, g, x0, x1, y0, y1, inside, seed) {
  const val = (x, y) => {
    const v = (y - y0) / (y1 - y0);
    const sw = Math.sin(x * 0.21 + Math.sin(y * 0.09 + seed) * 2.4 + y * 0.04) * 0.5 + Math.sin(x * 0.07 - y * 0.13 + seed) * 0.5;
    return v * 0.85 + sw * 0.22 - 0.05;
  };
  p.scan(x0, y0, x1, y1, (x, y) => {
    if (!inside(x, y)) return 0;
    if (hash2(Math.floor(x), Math.floor(y), seed + 7) < 0.012) return FIRE.c[7];
    const i = Math.floor(val(x, y) * 7.5 + (((Math.floor(x) + Math.floor(y)) & 1) ? 0.3 : -0.3));
    return FIRE.c[cl(i, 7)];
  });
  g.each(x0, y0, x1, y1, (x, y) => (inside(x, y) && (val(x, y) > 0.72 || hash2(Math.floor(x), Math.floor(y), seed + 7) < 0.012) ? '#ff9a40' : null));
}

// Glutbogen: frei stehender gotischer Spitzbogen aus Quadern mit Maßwerk-Dreipass, Stufensockel, Eisenbecken
export function glutbogen() {
  const W = 112, H = 150, cx = 56, bot = H - 4, foot = bot - 8;
  return mk(W, H, (p, g) => {
    PL = DAUB; TB = OAK;
    footShade(p, cx, bot, 50, 4);
    // Stufen
    p.scan(cx - 46, foot, cx + 46, bot, (x, y) => { const up = y < bot - 4, hw = up ? 38 : 46; if (Math.abs(x - cx) > hw) return 0; return y < foot + 0.7 || Math.abs(y - (bot - 4)) < 0.5 ? RUB.c[7] : x > cx + hw - 3 ? RUB.c[3] : RUB.c[up ? 5 : 4]; });
    const aw = 22, wo = 33, sy = foot - 50;
    const arc = (x, y, w) => (y >= sy ? Math.abs(x - cx) < w && y < foot : Math.hypot(x - cx - (w - 2 * aw) * 0 + aw - (aw * 2 - w) * 0, 0) >= 0 && Math.hypot(x - (cx - aw * 0.55), y - sy) < w + aw * 0.55 && Math.hypot(x - (cx + aw * 0.55), y - sy) < w + aw * 0.55);
    const inner = (x, y) => arc(x, y, aw), outer = (x, y) => arc(x, y, wo);
    emberVeil(p, g, cx - aw, cx + aw, sy - 60, foot, inner, 9);
    // Quader mit Fugen (Lagen 7 px, im Bogen radial)
    p.scan(cx - wo - 1, sy - 70, cx + wo + 1, foot, (x, y) => {
      if (!outer(x, y) || inner(x, y)) return 0;
      let jnt;
      if (y < sy) { const s = (Math.atan2(y - sy, x - cx) / Math.PI) * 18; jnt = s - Math.floor(s) < 0.07; } else { const r = Math.floor((foot - y) / 7), ly = (foot - y) % 7, lx = (Math.abs(x - cx) + (r & 1) * 4) % 9; jnt = ly < 0.6 || lx < 0.6; }
      if (jnt) return RUB.c[2];
      let i = x < cx ? 5 : 4;
      if (inner(x + 1.5, y) || inner(x - 1.5, y) || inner(x, y + 1.5)) i = x < cx ? 3 : 2;
      if (!outer(x, y - 1.2)) i = 7;
      if (!outer(x + 1.2, y) && x > cx) i = 2;
      if (hash2(Math.floor(x / 3), Math.floor(y / 3), 991) < 0.08) i--;
      return RUB.c[cl(i, 7)];
    });
    // Maßwerk: Dreipass oben in der Öffnung
    const tc = sy - 22;
    p.scan(cx - 12, tc - 12, cx + 12, tc + 10, (x, y) => {
      const lobes = [[cx, tc - 5], [cx - 6, tc + 3], [cx + 6, tc + 3]];
      const d = Math.min(...lobes.map(([a, b]) => Math.hypot(x - a, y - b)));
      return d > 5 && d < 7 && inner(x, y) ? RUB.c[x < cx ? 6 : 4] : 0;
    });
    // Schlussstein, Krabben
    p.scan(cx - 5, sy - 48, cx + 5, sy - 36, (x, y) => (Math.abs(x - cx) > 5 - (y - (sy - 48)) * 0.15 ? 0 : y > sy - 37 ? RUB.c[1] : RUB.c[x < cx ? 7 : 4]));
    // Eisenbecken mit Feuer links und rechts
    for (const bx of [cx - 44, cx + 44]) {
      p.scan(bx - 1, foot - 26, bx + 1, bot, () => IRON.c[3]);
      p.scan(bx - 5, bot - 2, bx + 5, bot, () => IRON.c[2]);
      p.scan(bx - 6, foot - 30, bx + 6, foot - 24, (x, y) => (y < foot - 29 ? IRON.c[5] : IRON.c[x < bx ? 3 : 2]));
      p.scan(bx - 5, foot - 42, bx + 5, foot - 30, (x, y) => { const f = Math.abs(x - bx) / 5 + (foot - 30 - y) / 12 + Math.sin(y * 0.8 + x) * 0.15; return f > 1 ? 0 : FIRE.c[f < 0.35 ? 7 : f < 0.6 ? 6 : 5]; });
      g.each(bx - 5, foot - 42, bx + 5, foot - 30, (x, y) => (Math.abs(x - bx) / 5 + (foot - 30 - y) / 12 < 0.9 ? '#ff9a40' : null));
    }
  // Kollision nur an Pfeilern und Becken: durch die Öffnung kann man hineingehen
  }, { ax: cx, ay: bot, b: true, extra: { boxes: [[-50, -10, -21, 1], [21, -10, 50, 1]] }, light: { dx: 0, dy: -30, radius: 80, color: [255, 140, 70], intensity: 0.65 } });
}

// ------------------------------------------------------------------ Wandschmuck für Innenräume
// Stehen auf der vordersten Bodenreihe vor der Rückwand und hängen optisch an der Wand: kein Kasten, begehbar, sortiert
// hinter allem in derselben Reihe.
const WALL = { sortOffset: -40, low: true };
function wallItem(W, draw, light = null) { return mk(W, 48, draw, { ax: Math.floor(W / 2), ay: 47, b: true, light, extra: WALL }); }
export function wallShield() {
  return wallItem(28, (p) => {
    for (const s of [-1, 1]) for (let t = 0; t < 22; t += 0.5) { const x = 14 + s * (t - 11) * 0.9, y = 8 + t; p.scan(x - 0.8, y - 0.6, x + 0.8, y + 0.6, () => (t < 4 ? col32('#8a5a36') : IRON.c[t < 6 ? 2 : s < 0 ? 6 : 5])); }
    p.scan(7, 9, 21, 27, (x, y) => (Math.abs(x - 14) > 7 - Math.max(0, y - 19) * 0.85 ? 0 : x < 7.6 || y < 9.6 ? col32('#e0c070') : Math.abs(x - 14) < 1 ? col32('#e0c070') : col32(x < 14 ? '#2a3a6a' : '#1c2a50')));
  });
}
export function wallShelf(seed = 1) {
  return wallItem(30, (p) => {
    for (const sy of [14, 26]) {
      p.scan(2, sy, 28, sy + 2, (x, y) => OAK.c[y < sy + 1 ? 6 : 2]);
      for (let k = 0, x = 4; x < 26; k++) {
        const t = hash2(k, sy, seed), w = t < 0.5 ? 2 : 4, h = 5 + Math.floor(hash2(k, sy + 1, seed) * 4);
        const C = t < 0.5 ? ['#7a2a22', '#2a4a6a', '#3a5a2a', '#8a6a2a'][k % 4] : ['#c8b890', '#6a8aa0', '#a06a4a'][k % 3];
        p.scan(x, sy - h, x + w, sy, (xx, yy) => (t >= 0.5 && yy < sy - h + 1.5 && Math.abs(xx - x - w / 2) > 0.8 ? 0 : col32(C)));
        x += w + (hash2(k, 9, seed) < 0.3 ? 2 : 1);
      }
    }
    for (const bx of [4, 25]) p.scan(bx, 14, bx + 1, 30, () => IRON.c[2]);
  });
}
export function wallPicture(kind = 0) {
  return wallItem(30, (p) => {
    p.scan(3, 8, 27, 28, (x, y) => {
      if (x < 4 || x > 26 || y < 9 || y > 27) return col32(x < 5 || y < 10 ? '#e0c070' : '#a87830');
      if (kind === 1) { // Sternkarte
        if (hash2(Math.floor(x), Math.floor(y), 77) < 0.05) return col32('#f0e8c0');
        return Math.abs(Math.hypot(x - 15, y - 18) - 6) < 0.5 ? col32('#c49a4a') : col32('#1a2040');
      }
      const hz = 20 + Math.sin(x * 0.5) * 1.5;   // Landschaft mit Burg
      if (y < hz) return Math.abs(x - 18) < 2.5 && y > 13 ? col32('#6a6a78') : col32(y < 14 ? '#e8a868' : '#c87850');
      return col32(y < 24 ? '#3a5a2a' : '#2a4020');
    });
  });
}
export function sconce() {
  return wallItem(14, (p, g) => {
    p.scan(5, 20, 9, 30, (x, y) => (y > 28 ? IRON.c[2] : IRON.c[x < 7 ? 4 : 2]));
    p.scan(6, 13, 8, 20, (x) => col32(x < 7 ? '#f0e8d0' : '#c8bca0'));
    p.scan(6.4, 9, 7.6, 13, (x, y) => (y < 10.5 ? col32('#fff0c0') : col32('#f6a040')));
    g.each(5, 8, 9, 13, () => '#ffb050');
  }, { dx: 0, dy: -30, radius: 48, color: [255, 190, 120], intensity: 0.5 });
}
export function wallTapestry(seed = 0) {
  return wallItem(26, (p) => {
    p.scan(2, 4, 24, 6, () => OAK.c[4]);
    p.scan(4, 6, 22, 32, (x, y) => {
      if (y > 30 && Math.floor(x) % 3 === 0) return 0;
      const base = seed % 2 ? ['#2a3a6a', '#1c2a50'] : ['#6e2228', '#4a1820'];
      if (x < 5 || x > 21) return col32('#c49a4a');
      if (Math.abs(x - 13) + Math.abs(y - 17) < 5 && Math.abs(x - 13) + Math.abs(y - 17) > 3) return col32('#e0c070');
      return col32(x < 13 ? base[0] : base[1]);
    });
  });
}
