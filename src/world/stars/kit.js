import { hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { roadNet, GROUND } from '../mapkit.js';

// Werkzeugkasten der Sternenscherben (Inselkarten, level.island). Bodenzeichen:
// '_' Abgrund (Himmel, fest), '+' Brücke (begehbar), ',' Gras, '.' Sternsand (Weg),
// ':' Perlsteinpflaster, '~' Weiher (fest). Die Karte beginnt ganz als Abgrund; Inseln werden hineingesetzt.

export const VOID = '_', BRIDGE = '+';
export const ISLAND = { void: VOID, bridge: BRIDGE, cliff: 26, keel: 78 };

export function skyMap(w, h) { return new MapBuilder(w, h, VOID); }

// Glattes Wertrauschen (0..1), Maßstab s in Kacheln
export function vn(x, y, s, seed) {
  const fx = x / s, fy = y / s, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Insel: Ellipse mit welligem Rand (Buchten und Nasen aus Winkel-Rauschen). wob = Randtiefe (0..0.5).
// Liefert die Prüffunktion inside(x, y), damit Teilgebiete daran ausgerichtet werden können.
export function isle(m, cx, cy, rx, ry, seed, { ch = ',', wob = 0.22, only = null } = {}) {
  const inside = (x, y) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
    const r = 1 + wob * ((vn(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, 1.4, seed) - 0.5) * 1.6 + Math.sin(a * 3 + seed) * 0.25 + Math.sin(a * 5 + seed * 1.7) * 0.15);
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = Math.floor(cy - ry * 1.5); y <= Math.ceil(cy + ry * 1.5); y++)
    for (let x = Math.floor(cx - rx * 1.5); x <= Math.ceil(cx + rx * 1.5); x++)
      if (inside(x, y) && (!only || only.includes(m.get(x, y)))) m.set(x, y, ch);
  return inside;
}

// Brücke über den Abgrund (überschreibt nur Abgrund): gerade, waagrecht oder senkrecht, width Kacheln breit. Liegen a und
// b schräg zueinander, wird die kürzeste gerade Brücke nahe der Verbindungslinie gesucht. Die Enden laufen weiter, bis die
// ganze Brückenbreite auf Land steht (oder am Kartenrand endet). kind: 'rope' Hängebrücke, 'wood' Holzbrücke mit Geländer,
// 'stone' Steinbrücke mit Bögen (ground/bridges.js zeichnet sie aus m.bridges → level.bridges).
export function bridge(m, [[ax, ay], [bx, by]], width = 2, kind = 'wood') {
  const prim = Math.abs(bx - ax) >= Math.abs(by - ay);
  const fit = (h, off) => {
    const lim = h ? m.w : m.h, c0 = Math.round((h ? ay + by : ax + bx) / 2 - (width - 1) / 2) + off, c1 = c0 + width;
    let a0 = Math.max(0, Math.round(Math.min(h ? ax : ay, h ? bx : by))), a1 = Math.min(lim - 1, Math.round(Math.max(h ? ax : ay, h ? bx : by)));
    const at = (a, c) => (h ? m.get(a, c) : m.get(c, a));
    const open = (a) => { for (let c = c0; c < c1; c++) if (at(a, c) === VOID) return true; return false; };
    let n0 = 0, n1 = 0, gap = 0;
    for (; a0 > 0 && open(a0); a0--) if (++n0 > 14) return null;
    for (; a1 < lim - 1 && open(a1); a1++) if (++n1 > 14) return null;
    for (let a = a0; a <= a1; a++) if (open(a)) gap++;
    return gap ? { h, a0, a1, c0, c1, at, cost: a1 - a0 + Math.abs(off) * 1.5 } : off || h !== prim ? null : { none: true };
  };
  let best = null;
  for (const h of [prim, !prim]) for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const f = fit(h, off);
    if (f?.none) return;   // liegt schon ganz auf Land
    if (f && (h !== prim ? (f.cost += 4) : 0, !best || f.cost < best.cost)) best = f;
    if (best && h === prim && off === 0) break;
  }
  if (!best) throw new Error(`Brücke ${ax},${ay} → ${bx},${by}: kein Land`);
  const { h, a0, a1, c0, c1, at } = best;
  for (let a = a0; a <= a1; a++) for (let c = c0; c < c1; c++) if (at(a, c) === VOID) (h ? m.set(a, c, BRIDGE) : m.set(c, a, BRIDGE));
  (m.bridges ??= []).push({ h, a0, a1: a1 + 1, c0, c1, kind });
}

// Anleger: Holzsteg von der Inselkante (x, y = erste Abgrundkachel) len Kacheln in Richtung dir ([1,0], [0,1] …)
export function pier(m, x, y, len, [dx, dy], width = 2, kind = 'wood') {
  const h = dx !== 0, s = dx + dy;
  for (let k = 0; k < len; k++) for (let c = 0; c < width; c++) {
    const tx = h ? x + k * s : x + c, ty = h ? y + c : y + k * s;
    if (m.get(tx, ty) === VOID) m.set(tx, ty, BRIDGE);
  }
  const a = h ? x : y, end = a + (len - 1) * s;
  (m.bridges ??= []).push({ h, a0: Math.min(a - s, end), a1: Math.max(a - s, end) + 1, c0: h ? y : x, c1: (h ? y : x) + width, kind });
  return h ? [x + (len - 1) * s, y] : [x, y + (len - 1) * s];
}

// Wege: Sternsand bzw. Pflaster nur auf Gras/Sand (nicht über den Abgrund); Maske für Streudeko wie roadNet
export function paths(m) {
  const net = roadNet(m);
  const sand = (pts, w = 1.6) => net.road(pts, Math.min(w, 1.6), '.', [',']);
  const pave = (pts, w = 2) => net.road(pts, w, ':', [',', '.']);
  return { ...net, sand, pave };
}

// Polylinie schwingen lassen (Zwischenpunkte quer versetzt, Enden fest)
export function wobble(pts, amp, seed, step = 4) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.round(L / step));
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let s = 1; s <= n; s++) {
      const t = s / n, o = s < n ? (vn(i * 37 + s * 5, seed % 89, 2.2, seed) - 0.5) * 2 * amp * Math.sin(Math.PI * t) : 0;
      out.push([ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o]);
    }
  }
  return out;
}

// Freier Boden (3 × 3 nur Boden, kein Weg) für Streudeko
export function freeAt(m, net, x, y, r = 1) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (!GROUND.has(m.get(x + i, y + j))) return false;
  return !net.onRoad(x, y);
}

// Abstand (Kacheln, bis max) zum nächsten Abgrund – Streudeko hält Abstand zur Kante
export function voidDist(m, max = 6) {
  const d = new Uint8Array(m.w * m.h).fill(max);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (m.get(x, y) !== VOID) continue;
    for (let j = -max; j <= max; j++) for (let i = -max; i <= max; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      const k = Math.max(Math.abs(i), Math.abs(j));
      if (k < d[yy * m.w + xx]) d[yy * m.w + xx] = k;
    }
  }
  return (x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : d[y * m.w + x]);
}

// Gebiet als Rechteck (Kacheln) für areas/keep
export const rect = (x, y, w, h) => ({ x, y, w, h });
export const inRect = (r, pad = 0) => (x, y) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;

// Eskortenweg (questRoutes): kürzester begehbarer Weg von `from` nach `to` über die fertige Karte, Pflaster, Sand
// und Brücken bevorzugt; jede `step`-te Kachel als Wegpunkt. `solid`: Zeichen, die nicht betreten werden können.
export function walkPath(m, solid, from, to, step = 3) {
  const cost = (x, y) => {
    const c = m.get(x, y);
    if (c === VOID || c === '~' || c === '#' || solid.includes(c)) return 0;
    return c === ':' || c === '.' || c === BRIDGE ? 1 : 3;
  };
  const W = m.w, idx = (x, y) => y * W + x;
  const dist = new Float64Array(W * m.h).fill(Infinity), prev = new Int32Array(W * m.h).fill(-1);
  const heap = [[0, idx(...from)]];
  dist[heap[0][1]] = 0;
  const goal = idx(...to);
  while (heap.length) {
    let bi = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, k] = heap[bi];
    heap[bi] = heap[heap.length - 1]; heap.pop();
    if (d > dist[k]) continue;
    if (k === goal) break;
    const x = k % W, y = (k - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = cost(x + dx, y + dy);
      if (!c) continue;
      const n = idx(x + dx, y + dy), nd = d + c;
      if (nd < dist[n]) { dist[n] = nd; prev[n] = k; heap.push([nd, n]); }
    }
  }
  if (!Number.isFinite(dist[goal])) throw new Error(`Eskortenweg ${from} → ${to}: Sackgasse`);
  const tiles = [];
  for (let k = goal; k !== -1; k = prev[k]) tiles.push([k % W, Math.floor(k / W)]);
  tiles.reverse();
  return tiles.filter((_, i) => i % step === 0 || i === tiles.length - 1);
}
