import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { near, box, each, blob, roadNet, MISPLACED, foe, strew } from '../mapkit.js';

// ---------------------------------------------------------------- Aschensteppe (20–25)
// Weite Grasebene für Reiter, quer durchschnitten von der Rotschlucht – einem mäandernden Canyon mit wechselnder
// Breite, Seitenrinnen, Felsvorsprüngen, Felstürmen und einem Bachbett im Grund (Übergänge: Gebrochene Brücke im
// Norden, Steinerne Furt der Heerstraße, Südfurt zum Grabhügel).
// Felsen stehen als '%' im Raster (fest, unsichtbar); der Steppenboden (sprites/decor_steppe.js) malt sie organisch:
// level.soil sagt, welche Art – 'k' Schluchtrand, 'h' Randhügel, sonst Tafelberg – und wie hoch der Boden liegt
// (Schluchtgrund c/w tiefer, Hochfläche m höher). Wände entstehen nur dort, wo Fels über tieferem Boden steht.
// Der Boden wechselt: Strohgold und Olivgras, sattes Gras an den Wasserlöchern, rote Erde um Tafelberge und Schlucht,
// Salzkruste im Salzsee, trockene Flussbetten, Ascheflure um Khars Lager und alte Brandstellen.
// Ankunft aus den Schlackenhöhen im Südwesten; der Westpfad führt erst durch das Flussbett hinauf
// zur Steppenwacht – einem offenen Zeltkreis am Wasserloch (keine Palisade), Eingänge Südwest und Ost.
// Points of Interest: Steinkreis der Ahnen, Geierhorst (Tafelberg mit Felsstufen, Geheimecke), Hirtenbrunnen,
// verbrannte Karawane, Gebrochene Brücke, Rabenfels, Alte Wegstation, Knochenbogen, Riesenskelett in der Senke,
// Himmelsgräber, Gnollbau, Nomadenlager, Salzsee mit Salzkarren, Grabhügel, Wachturm-Ruine, Faulmarschrand.
// Wegmarken (Pfähle mit Pferdeschädeln) und Laternen säumen die Wege – keine Streudeko auf den Straßen.

const W = 160, H = 104;
const ROCK = '%';

// Palisadenring mit Lücken (nur noch Khars Kriegslager)
function ring(m, x0, y0, x1, y1, hCh, vCh, gaps = []) {
  const gap = (side, i) => gaps.some((g) => g.side === side && i >= g.from && i <= g.to);
  for (let x = x0; x <= x1; x++) { if (!gap('n', x)) m.set(x, y0, hCh); if (!gap('s', x)) m.set(x, y1, hCh); }
  for (let y = y0 + 1; y < y1; y++) { if (!gap('w', y)) m.set(x0, y, vCh); if (!gap('e', y)) m.set(x1, y, vCh); }
}
// Wertrauschen (glatt) aus hash2
function vn(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Catmull-Rom: geschwungene Wege aus wenigen Stützpunkten
function curve(pts, n = 5) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// Abstandsfeld einer Polylinie auf dem Kachelraster (nur bis R Kacheln): Abstand, Bogenlänge, Seite
function lineField(line, R, w, h) {
  const d = new Float32Array(w * h).fill(Infinity), sArr = new Float32Array(w * h), side = new Int8Array(w * h);
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, len = Math.sqrt(L2);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + R));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const px = ax + dx * t, py = ay + dy * t, dd = Math.hypot(x - px, y - py), k = y * w + x;
      if (dd < d[k]) { d[k] = dd; sArr[k] = acc + t * len; side[k] = dx * (y - ay) - dy * (x - ax) > 0 ? -1 : 1; }
    }
    acc += len;
  }
  return { d, s: sArr, side, at: (x, y) => { const k = y * w + x; return { d: d[k], s: sArr[k], side: side[k] }; } };
}
export function buildAshenSteppe() {
  const m = new MapBuilder(W, H, ',');
  const soil = new MapBuilder(W, H, ' ');
  const rng = createRng(2525);
  const put = (x, y, ch) => m.set(x, y, ch);
  const fill = (x0, y0, x1, y1, ch, only = null) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!only || only.includes(m.get(x, y))) m.set(x, y, ch); };
  const rock = (x, y, kind) => { if (!m.in(x, y)) return; m.set(x, y, ROCK); soil.set(x, y, kind); };
  const isRock = (x, y) => m.get(x, y) === ROCK;

  // ------------------------------------------------ Bodenarten (nur Färbung, begehbar)
  // trockene Flussbetten
  const riverW = curve([[30, 0], [27, 8], [18, 16], [12, 26], [9, 36], [12, 46], [9, 56], [14, 64], [22, 72], [26, 80], [28, 85]], 6);
  const riverE = curve([[159, 64], [148, 62], [140, 64], [134, 70], [122, 74], [112, 80], [100, 86], [90, 89], [84, 89]], 6);
  const riverN = curve([[100, 0], [98, 6], [92, 10], [86, 16], [80, 18]], 6);
  // Strohgold-Weiden (großflächig; feinere Goldflecken mischt der Boden selbst ein)
  for (const [x, y, a, b] of [[14, 52, 10, 8], [44, 56, 8, 5], [78, 8, 8, 4], [112, 36, 9, 4], [146, 22, 8, 5], [60, 92, 10, 5]]) blob(soil, rng, x, y, a, b, 'y', null, 3);
  // Ascheflur um das Kriegslager, verbrannte Karawane, alte Brandflächen
  blob(soil, rng, 120, 14, 20, 12, 'a', null, 5);
  blob(soil, rng, 90, 12, 7, 4.5, 'a', null, 3);
  blob(soil, rng, 113, 92, 6, 3.4, 'a', null, 4);
  blob(soil, rng, 70, 88, 5, 3, 'a', null, 3);
  blob(soil, rng, 148, 28, 4, 2.6, 'a', null, 3);
  // rote Erde: Säume der Schlucht (unregelmäßig), kahle Stellen in der Ebene
  const canyon = curve([[63, -3], [60.5, 2.5], [64.5, 7.5], [66.5, 11], [63.5, 16.5], [66.5, 24], [70.5, 30], [69, 36], [68.5, 42], [71, 48], [75, 54], [74.5, 60], [76, 66], [80.5, 71], [84, 77], [83.5, 84], [82, 90], [85, 97], [86, 107]], 6);
  for (let i = 0; i < canyon.length; i += 3) { const [x, y] = canyon[i]; blob(soil, rng, x + (hash2(i, 1, 70) - 0.5) * 6, y, 9 + hash2(i, 2, 71) * 4, 4.5, 'r', null, 2); }
  for (const [x, y, a, b] of [[32, 64, 3.5, 2.2], [92, 96, 4, 2.4], [152, 66, 3.4, 2.2], [18, 30, 3, 2], [138, 46, 3, 1.8], [52, 50, 3.4, 2]]) blob(soil, rng, x, y, a, b, 'r', null, 3);
  // sattes Gras an Wasserlöchern und am Faulmarschrand, Weide im Westen
  for (const [x, y, a, b] of [[36, 30, 9, 6], [138, 70, 7, 4.5], [97, 74, 6, 4], [150, 46, 10, 14], [16, 38, 9, 10], [56, 33, 5, 4], [118, 37, 4, 2.4], [6, 60, 4, 6]]) blob(soil, rng, x, y, a, b, 'g', null, 4);
  soil.path(riverW, 5, 'b'); soil.path(riverE, 4.6, 'b'); soil.path(riverN, 4, 'b');
  // Salzsee
  blob(soil, rng, 28, 86, 13, 7, 's', null, 5);
  blob(soil, rng, 104, 42, 6, 3, 's', null, 3);

  // ------------------------------------------------ Rand: unregelmäßige Hügelketten und Felsköpfe statt Linealkante
  // Dicke je Seite aus Rauschen + einzelnen Hügeln; Ausgänge (West, Ost), Kriegslager und Südrand bleiben frei.
  const bump = (v, list) => list.reduce((acc, [c, w, h]) => acc + h * Math.max(0, 1 - ((v - c) / w) ** 2), 0);
  const topT = (x) => {
    let t = 1.1 + vn(x / 9, 0.5, 81) * 2.4 + vn(x / 3.4, 1.5, 82) * 1.6 + bump(x, [[12, 7, 3.6], [36, 4, 2.4], [52, 6, 2.8], [86, 7, 3.4], [150, 6, 4], [158, 4, 3]]);
    if (x > 100 && x < 140) t = Math.min(t, 1.6 + vn(x / 5, 9.5, 80) * 1.9);
    return t;
  };
  const botT = (x) => {
    let t = 1.1 + vn(x / 8, 2.5, 83) * 2.4 + vn(x / 3.1, 3.5, 84) * 1.6 + bump(x, [[4, 6, 4.4], [24, 6, 2.6], [66, 7, 3.4], [100, 6, 3], [154, 7, 3.6]]);
    if (x > 108 && x < 136) t = Math.min(t, 2.6);
    if (x > 134 && x < 147) t = Math.min(t, 3.6);
    return t;
  };
  const leftT = (y) => {
    let t = 1.1 + vn(y / 8, 4.5, 85) * 2.6 + vn(y / 3.2, 5.5, 86) * 1.5 + bump(y, [[8, 6, 3.4], [28, 5, 2], [50, 4, 1.8], [86, 7, 3.6], [100, 5, 2]]);
    if (y > 64 && y < 80) t *= Math.min(1, Math.abs(y - 72) / 8) ** 2;   // Westausgang
    if (y >= 68 && y <= 76) t = 0;
    return t;
  };
  const rightT = (y) => {
    let t = 1.1 + vn(y / 8, 6.5, 87) * 2.4 + vn(y / 3.3, 7.5, 88) * 1.5 + bump(y, [[10, 6, 3.4], [28, 6, 3], [74, 6, 3.6], [92, 6, 3.2]]);
    if (y > 34 && y < 54) t *= Math.min(1, Math.abs(y - 44) / 10) ** 2; // Ostausgang
    if (y >= 40 && y <= 48) t = 0;
    if (y > 50 && y < 60) t = Math.min(t, 2.2);
    return t;
  };
  // Felsköpfe (Sandstein) statt Grashügel an einigen Randstücken
  const rimRocky = (x, y, t) => t > 4.2 && vn(x / 13, y / 13, 89) > 0.6;
  const TT = Array.from({ length: W }, (_, x) => topT(x)), TB = Array.from({ length: W }, (_, x) => botT(x));
  const TL = Array.from({ length: H }, (_, y) => leftT(y)), TR = Array.from({ length: H }, (_, y) => rightT(y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tt = TT[x], tb = TB[x], tl = TL[y], tr = TR[y];
    const inner = Math.min(y - tt, H - 1 - y - tb, x - tl, W - 1 - x - tr);
    if (inner < 0) rock(x, y, rimRocky(x, y, Math.max(tt, tb, tl, tr)) ? 'r' : 'h');
  }

  // ------------------------------------------------ Tafelberge: organische Umrisse, Erosionskerben, Geröllsäume
  // shape: Grundellipse mit verrauschtem Radius; notches: [Winkel, Breite, Tiefe] keilförmige Rinnen.
  const mesas = [];
  const mesa = (cx, cy, rx, ry, seed, notches = [], extra = null) => {
    const s1 = hash2(seed, 1, 90) * 6.3, s2 = hash2(seed, 2, 90) * 6.3, s3 = hash2(seed, 3, 90) * 6.3;
    const inside = (x, y) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      let R = 1 + 0.13 * Math.sin(2 * a + s1) + 0.09 * Math.sin(3 * a + s2) + 0.06 * Math.sin(5 * a + s3) + (vn(x / 2.2, y / 2.2, seed) - 0.5) * 0.2;
      for (const [na, nw, nd] of notches) {
        let da = Math.abs(a - na); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da < nw) R *= 1 - nd * (1 - da / nw);
      }
      return r < R || (extra && extra(x, y));
    };
    for (let y = Math.floor(cy - ry * 1.4); y <= Math.ceil(cy + ry * 1.4); y++) for (let x = Math.floor(cx - rx * 1.4); x <= Math.ceil(cx + rx * 1.4); x++) if (inside(x, y)) rock(x, y, 'r');
    blob(soil, rng, cx, cy + ry * 0.4, rx + 3, ry + 2.6, 'r', [' ', 'y', 'g', 'a'], 3);  // Geröllsaum rote Erde
    mesas.push({ cx, cy, rx, ry });
  };
  const S = Math.PI / 2;  // Süden (Bildschirm unten)
  // Geierhorst: großer Tafelberg im Nordwesten, Hochfläche mit Felsstufen von Westen
  mesa(45, 12.4, 10.5, 5.4, 11, [[S + 0.35, 0.22, 0.32], [S - 0.6, 0.18, 0.28], [0.25, 0.2, 0.3], [Math.PI - 0.2, 0.14, 0.18]],
    (x, y) => Math.hypot((x - 55.5) / 2.6, (y - 15.5) / 1.8) < 1);
  // Rotes Tafelland: Landmarke südlich der Heerstraße, tief zerfurcht, mit abgelöster Butte
  mesa(99, 63.5, 10.5, 5.6, 12, [[S, 0.2, 0.42], [S + 0.75, 0.17, 0.35], [S - 0.75, 0.16, 0.3], [-0.3, 0.2, 0.3], [Math.PI + 0.4, 0.2, 0.34]]);
  mesa(110.5, 68.6, 2.4, 1.7, 13);
  mesa(128, 31, 6.8, 3.8, 14, [[S + 0.3, 0.25, 0.35], [-S + 0.4, 0.2, 0.25]], (x, y) => Math.hypot((x - 120.5) / 2.3, (y - 33) / 1.7) < 1);
  mesa(90, 27.8, 5.6, 3.3, 15, [[S - 0.2, 0.25, 0.4]]);
  mesa(46, 95, 6.5, 3.3, 16, [[S + 0.4, 0.3, 0.35], [0.1, 0.25, 0.3]]);
  mesa(146, 76.5, 3.6, 2.4, 17);
  mesa(12.5, 93.5, 4.2, 2.6, 18, [[S, 0.3, 0.35]]);
  mesa(124.5, 82, 2.6, 1.8, 19);
  // Felsnadeln: schmale Felstürme
  for (const [x, y] of [[85.5, 66], [96.5, 33.5], [18.5, 82]]) for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) rock(Math.floor(x) + i, Math.floor(y) + j, 'r');

  // ------------------------------------------------ Rotschlucht: mäandernder Canyon mit wechselnder Breite
  // Grund (begehbar, Boden 'c', tiefer), Ränder ('%' mit 'k'); jede Seite eigene Breite -> Felsvorsprünge,
  // Kessel und Engstellen; Seitenrinnen schneiden in die Ebene; Felstürme im Grund; Bachbett mit Pfützen.
  const fw = (s, side) => {
    const base = 1.1 + vn(s / 10, side + 3, 91) * 3.4 + vn(s / 3.8, side + 5, 92) * 0.9;
    return base + bump(s, [[64, 6, 2.6], [104, 6, 1.6]]) - bump(s, [[5, 3, 1.2], [15, 2.5, 0.9]]) * (side > 0 ? 1 : 0.4);   // Kessel der Fallensteller, Südbecken; Engstellen im Norden
  };
  // Randbreite; Felsvorsprünge (Sporne) schieben sich an einzelnen Stellen weit in den Grund
  const spurs = { [-1]: [[3, 2.5, 1.6], [11, 2, 1.9], [20, 3, 2.2], [50, 2.5, 1.8], [83, 3, 2.4]], [1]: [[7, 2.5, 2.1], [16, 2, 1.4], [33, 2.5, 2], [76, 3, 2.2], [110, 2.5, 1.6]] };
  const rw = (s, side) => 1.1 + vn(s / 6, side + 7, 93) * 2.3 + bump(s, spurs[side]) + vn(s / 2.2, side + 9, 96) * 1.2;
  let canyonLen = 0;
  for (let i = 0; i < canyon.length - 1; i++) canyonLen += Math.hypot(canyon[i + 1][0] - canyon[i][0], canyon[i + 1][1] - canyon[i][1]);
  const gullies = [
    // [Bogenlänge, Seite, Länge, Richtung (dx,dy), Breite]
    [6, -1, 5, [-1, 0.35], 1.0], [12, 1, 6, [1, -0.3], 1.1], [27, -1, 8, [-1, 0.25], 1.3], [37, 1, 7, [1, -0.35], 1.1], [55, -1, 6, [-1, 0.6], 1.2], [70, 1, 9, [1, 0.45], 1.4],
    [92, -1, 7, [-1, -0.2], 1.1], [97, 1, 6, [1, 0.8], 1.1], [112, 1, 7, [1, 0.25], 1.2],
  ];
  const ptAt = (s) => { let acc = 0; for (let i = 0; i < canyon.length - 1; i++) { const [ax, ay] = canyon[i], [bx, by] = canyon[i + 1], l = Math.hypot(bx - ax, by - ay); if (acc + l >= s) { const t = (s - acc) / l; return [ax + (bx - ax) * t, ay + (by - ay) * t]; } acc += l; } return canyon[canyon.length - 1]; };
  const gLines = gullies.map(([s, side, len, [dx, dy], w]) => {
    const [x0, y0] = ptAt(s), k = Math.hypot(dx, dy);
    const ux = dx / k, uy = dy / k, off = fw(s, side) - 0.5;
    const a = [x0 + ux * off, y0 + uy * off], c = [a[0] + ux * len, a[1] + uy * len];
    const b = [a[0] + ux * len * 0.5 - uy * len * 0.18, a[1] + uy * len * 0.5 + ux * len * 0.18];
    const line = curve([[x0, y0], a, b, c], 4);
    return { line, len: len + off, w, f: lineField(line, 4, W, H) };
  });
  const cf = lineField(canyon, 14, W, H);
  const canyonCell = (x, y) => {
    const c = cf.at(x, y);
    if (c.d === Infinity) return null;
    const sp = bump(c.s, spurs[c.side]), f = Math.max(1.1, fw(c.s, c.side) - sp), r = rw(c.s, c.side);
    if (c.d <= f) return 'floor';
    let gr = false;
    for (const g of gLines) {
      const q = g.f.at(x, y);
      if (q.d === Infinity) continue;
      const w = g.w * (1 - 0.55 * Math.min(1, q.s / g.len));
      if (q.d <= w) return 'floor';
      if (q.d <= w + 1.15 && q.s < g.len + 1) gr = true;
    }
    if (c.d <= f + r || gr) return 'rim';
    return null;
  };
  const canyonFloor = [];
  for (let y = 0; y < H; y++) for (let x = 40; x < 110; x++) {
    const k = canyonCell(x, y);
    if (k === 'floor') { put(x, y, ','); soil.set(x, y, 'c'); canyonFloor.push([x, y]); } else if (k === 'rim') rock(x, y, 'k');
  }
  const inCanyon = (x, y) => soil.get(x, y) === 'c' || soil.get(x, y) === 'w' || (isRock(x, y) && soil.get(x, y) === 'k');
  // Bachbett im Grund: schlängelt sich zwischen den Wänden
  const creek = [];
  for (let s = 0; s < canyonLen; s += 0.5) {
    const [x, y] = ptAt(s);
    const i = Math.min(canyon.length - 2, Math.floor(s / 1.1));
    const [ax, ay] = canyon[Math.max(0, i)], [bx, by] = canyon[i + 1];
    const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l;
    const off = (fw(s, 1) - fw(s, -1)) * 0.5 + Math.sin(s / 4.2) * Math.min(fw(s, 1), fw(s, -1)) * 0.45;
    creek.push([x + nx * off, y + ny * off]);
  }
  for (const [x, y] of creek) for (const [i, j] of [[0, 0], [1, 0], [0, 1]]) { const xx = Math.round(x - 0.5) + i, yy = Math.round(y - 0.5) + j; if (soil.get(xx, yy) === 'c' && !isRock(xx, yy) && (i === 0 || hash2(xx, yy, 94) < 0.5)) soil.set(xx, yy, 'w'); }
  // Felstürme im Grund (mit Abstand zu den Wänden, nicht im Bach)
  for (const s of [14, 43, 66, 85, 120]) {
    const [x, y] = ptAt(s), side = hash2(s, 1, 95) < 0.5 ? -1 : 1, o = side * (fw(s, side) * 0.55);
    const cx = Math.round(x + o), cy = Math.round(y);
    if (soil.get(cx, cy) === 'c' && soil.get(cx + 1, cy) === 'c' && fw(s, side) > 2.6) { rock(cx, cy, 'k'); if (hash2(s, 2, 95) < 0.6) rock(cx + 1, cy, 'k'); }
  }

  // ------------------------------------------------ Salzsee (Boden) und Wasserlöcher
  blob(m, rng, 28, 86, 11, 5.5, '.', [','], 5);
  m.ellipse(27, 86, 5, 2.4, '~');
  const ponds = [[36, 30, 3.4, 2], [138, 70, 2.4, 1.4], [97, 74, 2.2, 1.3]];
  for (const [x, y, a, b] of ponds) m.ellipse(x, y, a, b, '~', [',', '.']);
  for (const [x, y] of [[152, 36], [150, 51], [155, 55], [147, 47]]) m.ellipse(x, y, 1.8, 1.1, '~', [',']);
  // der alte Tümpel im Bachbett (weitere Pfützen nur als Bodenglanz: Wasser bekommt eine Leuchtebene)
  m.ellipse(80.5, 75, 2, 1.2, '~', [',']);

  // ------------------------------------------------ Wege (geschwungen); an den Übergängen schneiden sie den Schluchtrand ein
  const net = roadNet(m);
  const road = (pts, w = 2.6, ch = '.') => { const c = curve(pts); net.road(c, w, ch, [',', '.', '~']); return c; };
  const cut = (line, w) => {
    const f = lineField(line, Math.ceil(w) + 1, W, H);
    for (let y = 0; y < H; y++) for (let x = 40; x < 110; x++) {
      if (!isRock(x, y) || soil.get(x, y) !== 'k') continue;
      if (f.d[y * W + x] <= w) { put(x, y, ','); soil.set(x, y, 'c'); }
    }
  };
  const westPath = road([[0, 72], [8, 71], [15, 66], [20, 59], [25, 52], [29, 48]], 2.8);
  const armyPts = [[47, 42], [54, 45], [62, 48], [71, 48.5], [80, 47.5], [91, 45], [104, 45.5], [116, 44], [128, 42.5], [140, 44], [150, 44], [159.5, 44]];
  cut(curve(armyPts), 2.9);
  const army = road(armyPts, 3.4);
  m.path(curve([[54, 45], [62, 48], [71, 48.5], [80, 47.5], [91, 45], [104, 45.5], [116, 44], [128, 42.5], [140, 44], [150, 44], [159.5, 44]]), 1.6, ':', ['.']);
  for (let y = 0; y < H; y++) for (let x = 50; x < W; x++) if (m.get(x, y) === ':' && hash2(x, y, 21) < 0.25) put(x, y, '.');
  const northPts = [[38, 33], [42, 27], [50, 24], [58, 21], [66, 19.5], [76, 19], [90, 20], [104, 22], [119, 25]];
  cut(curve(northPts), 2.6);
  const northRd = road(northPts, 2.8);
  road([[104, 45.5], [107, 37], [113, 30], [119, 25]], 2.4);                                  // Querweg zum Kriegslager
  const southPts = [[15, 66], [26, 70], [38, 72], [50, 74], [58, 76], [68, 79], [77, 82], [86, 83], [96, 86], [108, 88], [120, 90], [132, 91], [140, 92]];
  cut(curve(southPts), 2.6);
  const southRd = road(southPts, 2.8);
  road([[116, 44], [121, 48], [124, 51]], 2.2);                                                // in die Senke
  road([[134, 91], [140, 82], [143, 72], [140, 62], [139, 52]], 2);                          // Ostpfad Senke <-> Grabhügel
  road([[38, 33], [30, 27], [26, 22]], 2);                                                     // zum Steinkreis
  road([[26, 70], [28, 78]], 1.8);                                                             // zum Salzsee
  road([[50, 24], [54, 31]], 1.8);                                                             // Hirtenbrunnen
  // Furten: Straßenstücke im Bachbett bekommen Trittsteine (Boden 'w' bleibt), Wegränder im Grund roter Kies
  // (der Boden malt sie aus soil 'w' unter '.'/':')

  // ------------------------------------------------ Geierhorst: Hochfläche (+1) und Felsstufen von Westen
  m.ellipse(45.5, 11.4, 6.2, 2.4, ',', [ROCK]);
  for (let y = 8; y <= 15; y++) for (let x = 38; x <= 53; x++) if (!isRock(x, y) && Math.hypot((x - 45.5) / 6.2, (y - 11.4) / 2.4) <= 1) soil.set(x, y, 'm');
  const stairs = curve([[31.5, 16.5], [34.5, 15], [37.5, 13.6], [40.5, 12.5]], 4);
  for (const [x, y] of stairs) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const xx = Math.round(x) + i, yy = Math.round(y) + j;
    if (Math.hypot(xx - x, yy - y) > 1.25) continue;
    if (isRock(xx, yy) || soil.get(xx, yy) === 'r') { put(xx, yy, '.'); soil.set(xx, yy, xx >= 40 ? 'm' : 'q'); }
  }

  // ------------------------------------------------ Riesenknochen-Senke: flache Mulde mit Riesenskelett
  const HX = 127, HY = 55;
  m.ellipse(HX, HY, 15, 8.5, '.', [',']);
  m.ellipse(HX, HY, 11, 5.5, ',', ['.']);
  blob(soil, rng, HX, HY, 16, 9, 'a', null, 3);

  // ------------------------------------------------ Steppenwacht: offener Zeltkreis am Wasserloch
  const OX = 37, OY = 42;
  const outpost = { x: 24, y: 33, w: 27, h: 19 };
  m.ellipse(OX, OY, 11.5, 7.5, '.', [',']);
  m.ellipse(OX, OY, 2.4, 1.6, ':');
  blob(soil, rng, OX, OY, 12, 8, 'g', null, 2);
  // Jurtenring (Lücken Südwest und Ost), Totems an den Eingängen
  const ringPos = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 - 0.2;
    const x = Math.round(OX + Math.cos(a) * 10), y = Math.round(OY + Math.sin(a) * 6.4);
    const deg = ((a * 180) / Math.PI + 360) % 360;
    if ((deg > 120 && deg < 165) || deg < 18 || deg > 345) continue;  // Südwest- und Osteingang
    ringPos.push([x, y]);
  }
  ringPos.forEach(([x, y], i) => put(x, y, i % 3 === 1 ? 'E' : 'Y'));
  put(28, 48, 'T'); put(31, 50, 'T'); put(48, 40, 'T'); put(48, 45, 'T');
  put(OX, OY, 'F'); put(OX + 2, OY - 3, 'P');
  put(OX - 4, OY - 3, 'k'); put(OX + 5, OY + 3, 'k'); put(OX - 2, OY + 4, 'h');
  // NPCs am Feuer
  put(OX, OY - 3, 'A'); put(OX + 4, OY + 1, 'I'); put(OX - 5, OY + 2, 'K'); put(OX - 7, OY + 3, 'Q');
  put(OX + 1, OY + 3, '1'); put(OX - 2, OY + 2, '2');
  const waystone = { x: OX - 6, y: OY - 2 };
  put(OX - 6, OY, '7');
  // Pferdekoppel östlich vor dem Kreis (Stall + Heu), Stallmeisterin
  put(53, 38, 'S'); put(56, 40, 'h'); put(51, 36, 'h'); put(53, 41, 'O');
  // Laternen an den Eingängen, Schilf am Wasserloch
  each([[27, 51], [33, 52], [49, 39], [49, 46]], (x, y) => put(x, y, 'L'));

  // ------------------------------------------------ Nomadenlager (Startpunkt der Karawane)
  const nomad = { x: 50, y: 64, w: 20, h: 15 };
  m.ellipse(60, 71, 9, 6, '.', [',']);
  each([[53, 67], [66, 67], [52, 75]], (x, y) => put(x, y, 'E'));
  put(64, 75, 'Y'); put(60, 70, 'F'); put(56, 72, 'h'); put(67, 72, 'L');
  each([[50, 70], [70, 70]], (x, y) => put(x, y, 'L'));
  const caravanAt = [57, 76];

  // ------------------------------------------------ Khars Kriegslager
  const war = { x: 104, y: 4, w: 33, h: 21 };
  m.ellipse(120, 14, 15, 8.5, '.', [',', ROCK]);
  fill(105, 5, 135, 23, '.', [ROCK]);
  ring(m, 104, 4, 136, 24, 'p', 'q', [{ side: 's', from: 118, to: 121 }, { side: 'w', from: 12, to: 14 }]);
  put(110, 9, 'X'); put(130, 9, 'X'); put(120, 7, 'P'); put(120, 15, 'F'); put(110, 20, 'Y'); put(131, 20, 'Y');
  put(106, 22, 'W'); put(134, 22, 'W'); put(126, 13, 'h'); put(114, 14, 'G'); put(124, 20, 'G');
  put(120, 11, 'Z');

  // ------------------------------------------------ Grabhügel
  const barrow = { x: 130, y: 81, w: 20, h: 16 };
  m.ellipse(140, 92, 8, 3.5, '.', [',']);
  put(140, 88, 'M'); put(135, 91, 'j'); put(145, 91, 'j');
  each([[114, 90], [118, 91], [122, 91], [126, 91], [130, 92]], (x, y) => { put(x, y - 2, 's'); put(x, y + 2, 's'); });
  put(140, 94, '4');

  // ------------------------------------------------ Rand der Faulmarsch
  put(155, 41, 'P'); put(155, 47, 'P'); put(156, 44, '5');
  put(3, 72, '3');

  // ------------------------------------------------ Points of Interest
  put(116, 44, 'B');                                   // Knochenbogen über der Heerstraße
  put(96, 37, 'R');                                    // Rabenfels
  // Gebrochene Brücke: Widerlager an den Außenkanten der Schluchtränder (Bohlen hängen über die Kante)
  const BY = 14;
  let bw = -1, be = -1;
  for (let x = 50; x < 85; x++) if (isRock(x, BY) && soil.get(x, BY) === 'k') { if (bw < 0) bw = x; be = x; }
  put(bw - 1, BY, 'U'); put(be + 1, BY, 'u');
  each([[66, 46], [76, 51], [79, 84], [89, 80], [62, 17], [71, 22]], (x, y) => { if (!isRock(x, y)) put(x, y, 'T'); });
  // Steinkreis der Ahnen
  m.ellipse(24, 18, 7, 4.6, '.', [',']);
  for (let i = 0; i < 10; i++) { const a = 0.3 + (i / 10) * Math.PI * 2; put(Math.round(24 + Math.cos(a) * 6.6), Math.round(18 + Math.sin(a) * 4.2), 's'); }
  // Fallenstellerkessel in der Schlucht
  each([[70, 58], [76, 61], [72, 62]], (x, y) => { if (!isRock(x, y)) put(x, y, 'k'); });
  put(49, 11, 'o');                                    // Geierhorst: Horst auf der Hochfläche
  each([[86, 44], [92, 42], [86, 51]], (x, y) => put(x, y, 's'));   // Alte Wegstation
  // Hirtenbrunnen mit Weide
  m.ellipse(55, 33, 3.6, 2.4, '.', [',']);
  put(55, 33, 'w'); put(58, 35, 'k');
  // Verbrannte Karawane am Nordwasserlauf
  m.ellipse(90, 12, 6, 3.5, '.', [',']);
  put(88, 12, 'C'); put(93, 11, 'G'); put(91, 14, 'o'); put(86, 10, 'o');
  // Wachturm-Ruine im Nordosten
  m.ellipse(150, 14, 5, 3.5, '.', [',']);
  put(150, 13, 't'); put(146, 16, 'b'); put(154, 16, 'o');
  // Gnollbau zwischen Schlucht und Senke
  m.ellipse(106, 81, 7, 4, '.', [',']);
  put(103, 80, 'd'); put(109, 79, 'd'); put(106, 83, 'o'); put(111, 83, 'k'); put(101, 83, 'k');
  // Himmelsgräber (Aufbahrungsgerüste) über dem östlichen Flussbett
  each([[124, 72], [129, 70], [133, 74]], (x, y) => put(x, y, 'z'));
  // Salzkarren am Salzsee
  put(40, 90, 'C'); put(37, 92, 'o');
  // Riesenskelett: Schädel im Westen, Wirbel entlang der Senke, Rippen beiderseits
  put(111, 56, 'i');
  each([[118, 56], [121, 57], [125, 56], [128, 56], [133, 57], [137, 56], [141, 57]], (x, y) => put(x, y, '+'));
  each([[120, 52], [124, 51], [129, 52], [134, 51]], (x, y) => put(x, y, 'J'));
  each([[122, 61], [127, 60], [136, 61]], (x, y) => put(x, y, 'l'));
  put(131, 62, 'o');                                   // abgebrochene Rippe
  // Felsnadeln (hoch, als Sprite) vor den Tafelbergen
  each([[88, 70], [101, 35], [133, 26], [41, 99], [16, 89], [112, 64]], (x, y) => { if (m.get(x, y) === ',' && !near(m, x, y, ROCK, 0)) put(x, y, '^'); });

  // ------------------------------------------------ Questobjekte (Thread C) – freie Kacheln suchen und freihalten
  const spots = [];
  const spot = (x, y) => {
    for (let r = 0; r <= 4; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      let ok = true;
      for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (!',.:'.includes(m.get(x + i + a, y + j + b))) { ok = false; break; }
      if (ok) { spots.push([x + i, y + j]); return [x + i, y + j]; }
    }
    MISPLACED.push(`obj@${x},${y}`); return [x, y];
  };
  const banner1 = spot(55, 23), banner2 = spot(92, 51), banner3 = spot(147, 39);
  const stone1 = spot(24, 18), stone2 = spot(124, 58), stone3 = spot(122, 96);
  const caravan = spot(caravanAt[0], caravanAt[1]);
  const cache = spot(45, 11);
  // Eskortweg Nomadenlager -> Steppenwacht (Südwesteingang), Abstand <= 10 Kacheln
  const escortPath = [caravan, [51, 72], [45, 68], [39, 63], [34, 58], [31, 53], [33, 48]].map(([x, y], i) => (i === 0 ? [x, y + 1] : spot(x, y)));
  const lm = (id, name, x, y) => ({ id, name, x: x - 3, y: y - 3, w: 7, h: 7 });

  // ------------------------------------------------ Gegner
  // x Plünderer, y Schützin, e Hyäne, v Geier, a Harpyie, D Staubschamane, N Fallensteller
  each([[10, 30], [8, 36], [14, 24]], (x, y) => foe(m, x, y, 'e'));                       // Westweide
  each([[52, 28], [6, 20]], (x, y) => foe(m, x, y, 'v'));
  each([[19, 14], [30, 15], [26, 23]], (x, y) => foe(m, x, y, 'D'));                       // Steinkreis
  foe(m, 10, 12, 'v');
  foe(m, 50, 12, 'v');                                                                      // Geierhorst
  each([[52, 22], [57, 18], [76, 22]], (x, y) => foe(m, x, y, 'x'));                       // Brückenzoll
  each([[54, 26], [74, 16]], (x, y) => foe(m, x, y, 'y'));
  foe(m, 80, 24, 'N');
  each([[86, 14], [94, 9]], (x, y) => foe(m, x, y, 'x'));                                  // Karawanenplünderer
  each([[64, 8], [67, 30], [68, 41], [80, 70]], (x, y) => foe(m, x, y, 'e'));              // Schluchtgrund
  each([[73, 58], [76, 63]], (x, y) => foe(m, x, y, 'N'));
  each([[64, 12], [84, 95]], (x, y) => foe(m, x, y, 'a'));
  each([[88, 34], [99, 30], [84, 60]], (x, y) => foe(m, x, y, 'a'));                       // Tafelberge
  each([[94, 40], [100, 34], [106, 72]], (x, y) => foe(m, x, y, 'v'));
  foe(m, 88, 38, 'y');
  each([[108, 12], [113, 8], [127, 8], [132, 13], [116, 19], [126, 18], [110, 17], [122, 22], [130, 16]], (x, y) => foe(m, x, y, 'x'));
  each([[107, 6], [133, 6], [114, 22], [128, 22]], (x, y) => foe(m, x, y, 'y'));
  each([[124, 12], [116, 12]], (x, y) => foe(m, x, y, 'e'));
  foe(m, 120, 18, 'D');
  each([[95, 53], [88, 54], [98, 49]], (x, y) => foe(m, x, y, 'x'));                       // Heerstraße Ost
  each([[93, 56], [100, 52]], (x, y) => foe(m, x, y, 'y'));
  each([[120, 50], [132, 50], [128, 59], [117, 59]], (x, y) => foe(m, x, y, 'e'));         // Riesenskelett
  each([[123, 57], [128, 60]], (x, y) => foe(m, x, y, 'D'));
  foe(m, 138, 55, 'N');
  each([[126, 68], [131, 77], [121, 76]], (x, y) => foe(m, x, y, 'v'));                    // Himmelsgräber
  each([[104, 77], [108, 85]], (x, y) => foe(m, x, y, 'N'));                               // Gnollbau
  each([[34, 82], [20, 90]], (x, y) => foe(m, x, y, 'e'));                                 // Salzsee
  foe(m, 24, 79, 'v'); foe(m, 37, 89, 'N');
  each([[128, 84], [148, 84]], (x, y) => foe(m, x, y, 'x'));                               // Grabhügel
  foe(m, 126, 96, 'N');
  foe(m, 154, 88, 'a');
  each([[117, 99], [127, 99]], (x, y) => foe(m, x, y, 'D'));
  each([[142, 36], [140, 30], [146, 32]], (x, y) => foe(m, x, y, 'x'));                    // Faulmarschrand
  foe(m, 138, 38, 'y'); foe(m, 144, 56, 'v');
  foe(m, 150, 19, 'v');                                                                     // Wachturm-Ruine

  // ------------------------------------------------ Wegmarken entlang der Wege (statt Streudeko)
  const marks = [];
  const lineMarks = (pts, every, ch, side = 2.6, skip = () => false) => {
    let acc = every * 0.5, flip = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay); if (!len) continue;
      for (let s = 0; s < len; s += 0.5) {
        acc += 0.5; if (acc < every) continue;
        const t = s / len, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const nx = -(by - ay) / len, ny = (bx - ax) / len;
        const tx = Math.round(x + nx * side * flip), ty = Math.round(y + ny * side * flip);
        if (skip(tx, ty) || m.get(tx, ty) !== ',' || near(m, tx, ty, '~', 1) || near(m, tx, ty, ROCK, 1)) continue;
        put(tx, ty, ch); marks.push([tx, ty]); acc = 0; flip = -flip;
      }
    }
  };
  const inCamp = (x, y) => box(outpost, 1)(x, y) || box(war, 1)(x, y) || box(nomad, 0)(x, y);
  const nearSpot = (x, y) => spots.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2);
  const sk = (x, y) => inCamp(x, y) || nearSpot(x, y) || inCanyon(x, y);
  lineMarks(westPath, 7, 'm', 2.4, sk);
  lineMarks(army, 11, 'm', 2.8, sk);
  lineMarks(northRd, 10, 'm', 2.4, sk);
  lineMarks(southRd, 10, 'm', 2.4, sk);

  // ------------------------------------------------ Streudeko (sparsam, nach Bodenart)
  const keep = [box(outpost), box(war), box(nomad), box(barrow, 0), (x, y) => x <= 6 && y >= 68 && y <= 76, (x, y) => x >= 150 && y >= 40 && y <= 48, nearSpot,
    (x, y) => Math.abs(x - 116) <= 3 && Math.abs(y - 44) <= 3, (x, y) => Math.abs(x - 96) <= 3 && y >= 34 && y <= 38,
    (x, y) => x >= 108 && x <= 143 && y >= 49 && y <= 63, (x, y) => soil.get(x, y) === 'm' || soil.get(x, y) === 'q'];
  strew(m, net, rng, (x, y) => keep.some((f) => f(x, y)), (x, y, g, free) => {
    const so = soil.get(x, y);
    if (near(m, x, y, '~', 1)) return so === 'c' || so === 'w' ? (rng.chance(0.3) ? 'r' : null) : rng.chance(0.45) ? 'r' : null;
    if (so === 's') return g === '.' && rng.chance(0.07) ? 'c' : null;
    if (so === 'b') return free && rng.chance(0.02) ? 'b' : rng.chance(0.02) ? 'n' : null;
    // Schluchtgrund: Felsbrocken unter den Wänden, vereinzelt Dornbusch
    if (so === 'c' || so === 'w') return free && near(m, x, y, ROCK, 1) && rng.chance(0.045) ? 'b' : rng.chance(0.012) ? 'n' : null;
    if (so === 'r') return free && near(m, x, y, ROCK, 2) && rng.chance(0.03) ? 'b' : rng.chance(0.006) ? 'n' : null;
    if (g === '.') return null;
    if (so === 'g') return rng.chance(0.07) ? 'g' : rng.chance(0.015) ? 'n' : null;
    if (so === 'a') return rng.chance(0.015) ? 'n' : free && rng.chance(0.004) ? 'o' : null;
    // Steppengras in Horsten statt gleichmäßig verteilt (im Strohgold dichter)
    const tuft = hash2(x >> 2, y >> 2, 31) < (so === 'y' ? 0.5 : 0.35);
    if (tuft && rng.chance(0.09)) return 'g';
    if (rng.chance(0.006)) return 'n';
    return null;
  }, ',.');

  return {
    name: 'Die Aschensteppe',
    kind: 'outdoor',
    biome: 'steppe',
    decorSet: 'decor_steppe',
    map: m.rows(),
    soil: soil.rows(),
    solid: 'pqW%',
    rockChars: ROCK,
    ramps: [stairs],                // Felsstufen auf den Geierhorst (vom Steppenboden gemalt)
    decor: {
      g: 'steppeGrass', n: 'thornShrubs', b: 'boulders', o: 'bleachedBones', s: 'standingStones',
      Y: 'yurt', X: 'warTent', p: 'palisade', q: 'palisadeV', W: 'watchtower', P: 'bannerPole',
      F: 'campfireBig', h: 'hayBales', S: 'stable', Q: 'cart', M: 'barrowMound', j: 'standingStones',
      c: 'saltCrust', r: 'reeds', T: 'totemPole', E: 'yurtSmall', G: 'yurtBurnt', k: 'hideRack',
      B: 'boneArch', R: 'ravenRock', U: 'bridgeStubW', u: 'bridgeStubE', L: 'lanternPost',
      w: 'steppeWell', C: 'caravanWreck', t: 'towerRuin', d: 'gnollDen', z: 'burialScaffold',
      J: 'giantRibN', l: 'giantRibS', i: 'giantSkullBig', '+': 'giantVertebra', m: 'wayMarker', '^': 'rockSpire',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_cinder_peaks', 4: 'from_howling_barrow', 5: 'from_blighted_marsh', 7: 'waystone' },
    waystone,
    npcs: { A: 'captain_varra', O: 'stablemaster_orla', I: 'nomad_kesh', K: 'trader_imra' },
    enemies: {
      x: { type: 'steppe_raider' }, y: { type: 'raider_archer' }, e: { type: 'dust_hyena' },
      v: { type: 'ash_vulture' }, Z: { type: 'steppe_warlord' },
      a: { type: 'cliff_harpy' }, D: { type: 'dust_shaman' }, N: { type: 'gnoll_trapper' },
    },
    respawn: 45,
    areas: [
      { id: 'steppe_outpost', name: 'Steppenwacht', town: true, ...outpost, noMount: true },
      { id: 'warlord_camp', name: 'Khars Kriegslager', ...war },
      { id: 'barrow_gate', name: 'Grabhügel', ...barrow },
      { id: 'marsh_edge', name: 'Rand der Faulmarsch', x: 140, y: 32, w: 20, h: 24 },
      { id: 'nomad_camp', name: 'Nomadenlager', ...nomad, noMount: true, town: true },
      { id: 'pasture', name: 'Westweide', x: 3, y: 22, w: 20, h: 40 },
      { id: 'ancestor_circle', name: 'Steinkreis der Ahnen', x: 14, y: 11, w: 21, h: 15 },
      { id: 'red_canyon', name: 'Rotschlucht', x: 56, y: 0, w: 36, h: 104 },
      { id: 'mesa_lands', name: 'Tafelberge', x: 82, y: 24, w: 22, h: 48 },
      { id: 'bone_hollow', name: 'Riesenknochen-Senke', x: 108, y: 46, w: 36, h: 18 },
      { id: 'vulture_eyrie', name: 'Geierhorst', x: 38, y: 9, w: 14, h: 7 },
      { id: 'shepherd_well', name: 'Hirtenbrunnen', x: 50, y: 29, w: 10, h: 9 },
      { id: 'burnt_caravan', name: 'Verbrannte Karawane', x: 83, y: 7, w: 14, h: 10 },
      { id: 'old_watch', name: 'Wachturm-Ruine', x: 143, y: 8, w: 14, h: 12 },
      { id: 'gnoll_den', name: 'Gnollbau', x: 98, y: 76, w: 16, h: 10 },
      { id: 'sky_burial', name: 'Himmelsgräber', x: 119, y: 66, w: 18, h: 12 },
      { id: 'dry_river', name: 'Trockenes Flussbett', x: 5, y: 30, w: 14, h: 36 },
      lm('steppe_bone_arch', 'Knochenbogen', 116, 44),
      lm('steppe_salt_lake', 'Salzsee', 28, 85),
      lm('steppe_raven_rock', 'Rabenfels', 96, 39),
      lm('steppe_broken_bridge', 'Gebrochene Brücke', Math.round((bw + be) / 2), 19),
    ],
    objects: [
      { id: 'war_banner_1', kind: 'shrine', decor: 'warBanner', prompt: 'Banner verbrennen', x: banner1[0], y: banner1[1] },
      { id: 'war_banner_2', kind: 'shrine', decor: 'warBanner', prompt: 'Banner verbrennen', x: banner2[0], y: banner2[1] },
      { id: 'war_banner_3', kind: 'shrine', decor: 'warBanner', prompt: 'Banner verbrennen', x: banner3[0], y: banner3[1] },
      { id: 'ancestor_stone_1', kind: 'shrine', decor: 'ancestorStone', name: 'Ahnenstein im Steinkreis', prompt: 'Geisterwasser gießen', x: stone1[0], y: stone1[1] },
      { id: 'ancestor_stone_2', kind: 'shrine', decor: 'ancestorStone', name: 'Ahnenstein beim Riesenskelett', prompt: 'Geisterwasser gießen', x: stone2[0], y: stone2[1] },
      { id: 'ancestor_stone_3', kind: 'shrine', decor: 'ancestorStone', name: 'Ahnenstein am Grabhügel', prompt: 'Geisterwasser gießen', x: stone3[0], y: stone3[1] },
      { id: 'imra_caravan', kind: 'shrine', decor: 'caravan', name: 'Imras Karawane', prompt: 'Karawane zur Steppenwacht begleiten', x: caravan[0], y: caravan[1] },
      { id: 'chest_steppe_eyrie', kind: 'chest', decor: 'hiddenCache', prompt: 'Versteck öffnen', x: cache[0], y: cache[1] },
    ],
    caches: [{ id: 'chest_steppe_eyrie', x: cache[0], y: cache[1] }],
    questRoutes: {
      escort_imra_caravan: { kind: 'escort', path: escortPath, ambush: [{ at: 2, type: 'gnoll_trapper', n: 3 }, { at: 4, type: 'gnoll_trapper', n: 3 }, { at: 5, type: 'dust_hyena', n: 2 }] },
    },
    portals: [
      { id: 'to_cinder_peaks', x: 0.6, y: 72, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'cinder_peaks', spawnId: 'from_ashen_steppe' }, prompt: 'Westwärts zu den Schlackenhöhen' },
      { id: 'to_howling_barrow', x: 140, y: 89.2, range: 26, requires: { level: 23 },
        to: { zoneId: 'howling_barrow', spawnId: 'start' }, prompt: 'Das Heulende Hügelgrab betreten' },
      { id: 'to_blighted_marsh', x: 159.4, y: 44, range: 28, requires: { level: 25 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'blighted_marsh', spawnId: 'from_ashen_steppe' }, prompt: 'Ostwärts in die Faulmarsch' },
    ],
    signText: 'Ost: Die Faulmarsch · Südost: Das Hügelgrab · Nordost: Khars Kriegslager · Südwest: Die Schlackenhöhen',
  };
}
