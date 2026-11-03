// Inventar-Bilder für Waffen und Rüstung (Überarbeitung 03.11.2026).
//
// Eigene Zeichnung je Familie statt der Heldenzeichnung im Kleinformat: große, klare Silhouette, die den Platz füllt,
// wenige harte Tonstufen je Material, Licht von oben links. Die Materialien kommen weiter aus character/gearLook.js
// itemLook(def) – Held und Inventar passen farblich zusammen, die Form ist fürs Inventar gezeichnet.
// Die Seltenheit steht im Bild selbst (zusätzlich zum Rahmen):
//   gewöhnlich   schlicht
//   ungewöhnlich Beschläge, Wicklung, Nähte
//   selten       Edelstein, Silberzier
//   episch       großer Stein, Goldzier, Runen in der Leuchtfarbe
//   legendär     Gold, harte Glutkante an der Schneide bzw. an den Kanten
//
// Raster: Formen in einem 48er-Maß (x/y 0..48, Mitte des Bildpunkts), gezeichnet in 48 Feinpixeln (res 2) oder 24
// Bildpunkten (res 1). Jeder Bildpunkt gehört zu einem Bauteil; Licht- und Schattenkante (je 1 Bildpunkt) entstehen an
// Bauteilgrenzen. Umriss, Rand und Einpassen macht gfx/Icons.js (outlineCanvas, padFine).
//
//   drawGear(kind, look, res) -> Canvas (48×48 bzw. 24×24, ohne Umriss)
//   kind: 'weapon' | 'chest' | 'head' | 'hands' | 'feet'

import { makeCanvas } from './PixelCanvas.js';
import { MAT as M } from '../character/gearLook.js';

const U = 48;
const VOID = '#0c0810';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const GOLD = M.gold, SILVER = M.silver;
const STRING = '#d8cfc0';
const RARE = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const rank = (r) => Math.max(0, RARE.indexOf(r ?? 'common'));

// ---------------------------------------------------------------- Bauteil-Raster
class Art {
  constructor(res, zoom = 1) {
    this.res = res;
    this.zoom = zoom;
    this.n = 24 * res;
    this.s = U / this.n;
    this.cell = new Array(this.n * this.n).fill(null);
    this.ids = 0;
    this.fine = res > 1;
  }
  // fn(x, y) -> null | Ton (Zahl 0..4) | { k, ramp?, c?, id? }; opt: { ramp, bevel = true, glow, id, under }
  shape(fn, opt = {}) {
    const id = opt.id ?? ++this.ids, n = this.n, s = this.s, z = this.zoom;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const at = j * n + i;
      if (opt.under && this.cell[at]) continue;
      const r = fn(24 + ((i + 0.5) * s - 24) / z, 24 + ((j + 0.5) * s - 24) / z, i, j);
      if (r == null || r === false) continue;
      const o = typeof r === 'object' ? r : { k: r };
      this.cell[at] = { id: o.id ?? id, ramp: o.ramp ?? opt.ramp, k: o.k ?? 2, c: o.c, bevel: o.flat ? false : opt.bevel ?? true, glow: o.glow ?? opt.glow, keep: o.keep };
    }
    return id;
  }
  // einzelner Bildpunkt an einer 48er-Koordinate (Details, die in beiden Feinheiten sitzen sollen)
  dot(x, y, c, glow = false) {
    const z = this.zoom, i = Math.floor((24 + (x - 24) * z) / this.s), j = Math.floor((24 + (y - 24) * z) / this.s);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return;
    const at = j * this.n + i;
    this.cell[at] = { id: this.cell[at]?.id ?? ++this.ids, c, bevel: false, glow };
  }
  get(i, j) { return i < 0 || j < 0 || i >= this.n || j >= this.n ? null : this.cell[j * this.n + i]; }
  render() {
    const n = this.n, cols = new Array(n * n).fill(null);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = this.cell[j * n + i];
      if (!c) continue;
      let col = c.c;
      if (!col) {
        let k = c.k;
        if (c.bevel) {
          const L = this.get(i - 1, j), T = this.get(i, j - 1), R = this.get(i + 1, j), B = this.get(i, j + 1);
          const diff = (o) => !o || o.id !== c.id;
          if (diff(L) || diff(T)) k += 1;
          // Schattenkante; an einem Nachbarbauteil eine dunkle Fuge
          if (!c.glow && (diff(R) || diff(B))) k -= (R && diff(R)) || (B && diff(B)) ? 1.3 : 1;
        }
        col = c.ramp[clamp(Math.round(k), 0, c.ramp.length - 1)];
      }
      cols[j * n + i] = col;
    }
    // Grobes Raster: einzelne Ausreißer-Bildpunkte innerhalb eines Bauteils glätten (kein Schachbrett auf Klingen)
    if (!this.fine) {
      const fix = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const at = j * n + i, c = this.cell[at];
        if (!c || c.c || c.glow || c.keep) continue;
        const same = (a, b) => {
          const ca = this.get(a[0], a[1]), cb = this.get(b[0], b[1]);
          if (!ca || !cb || ca.id !== c.id || cb.id !== c.id) return null;
          const x = cols[a[1] * n + a[0]], y = cols[b[1] * n + b[0]];
          return x === y && x !== cols[at] ? x : null;
        };
        const v = same([i - 1, j], [i + 1, j]) ?? same([i, j - 1], [i, j + 1]);
        if (v) fix.push([at, v]);
      }
      for (const [at, v] of fix) cols[at] = v;
    }
    const cv = makeCanvas(n, n), ctx = cv.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (let at = 0; at < n * n; at++) {
      const col = cols[at];
      if (!col) continue;
      const v = parseInt(col.slice(1), 16), o = at * 4;
      d[o] = v >> 16; d[o + 1] = (v >> 8) & 255; d[o + 2] = v & 255; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// Achse (x0,y0)->(x1,y1): liefert (x, y) -> [u, v]; u entlang, v quer (v < 0 = oben links, Lichtseite)
function axis(x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L;
  const f = (x, y) => { const px = x - x0, py = y - y0; return [px * dx + py * dy, px * -dy + py * dx]; };
  f.L = L;
  f.at = (u, v = 0) => [x0 + dx * u - dy * v, y0 + dy * u + dx * v];
  return f;
}
// Ton einer Rundform quer zur Achse: Lichtseite hell
const roundK = (v, w, base = 2.4) => base - (v / Math.max(w, 0.5)) * 1.1;
// Kugel mit Licht oben links
function sphereK(x, y, cx, cy, r) {
  const dx = (x - cx) / r, dy = (y - cy) / r;
  return 2.2 + (-dx - dy) * 1.1 - (dx * dx + dy * dy) * 0.6;
}

// Edelstein (Raute) mit Facetten; r in 48er-Maß
function gem(A, cx, cy, r, R, opt = {}) {
  A.shape((x, y) => {
    const u = x - cx, v = y - cy, d = (Math.abs(u) + Math.abs(v)) / r;
    if (d > 1) return null;
    if (d < 0.38) return { k: u + v < 0 ? 4 : 3 };
    if (u < 0 && v < 0) return { k: 3.4 };
    if (u >= 0 && v >= 0) return { k: 1 };
    return { k: 2 };
  }, { ramp: R, bevel: false, glow: opt.glow });
  if (r >= 3 && A.fine) A.dot(cx - r * 0.35, cy - r * 0.35, '#ffffff');
}
// Fassung um einen Stein (Ring aus Metall)
function setting(A, cx, cy, r, R) {
  A.shape((x, y) => {
    const d = (Math.abs(x - cx) + Math.abs(y - cy));
    return d <= r + 1.6 && d > r - 0.2 ? { k: x + y < cx + cy ? 3.2 : 1.6 } : null;
  }, { ramp: R, bevel: false });
}

// Seltenheits-Zier aus look (gearLook) und Seltenheit
function deco(look) {
  const r = rank(look.rarity);
  return {
    r,
    trim: r >= 4 ? GOLD : r >= 3 ? GOLD : r >= 2 ? SILVER : null,
    gem: r >= 2 ? (look.gem ?? (r >= 4 ? M.ember : r >= 3 ? M.purple : M.blue)) : null,
    glow: r >= 3 ? (look.glow ?? look.gem ?? (r >= 4 ? M.ember : M.purple)) : null,
    edge: r >= 4 ? (look.edge ?? look.glow ?? M.ember) : null,
  };
}

// ---------------------------------------------------------------- Klingen (Schwert, Zweihänder, Dolch)
function blade(A, L) {
  const D = deco(L);
  const dagger = L.family === 'dagger', great = !!L.great;
  // Achse diagonal von unten links nach oben rechts; Dolch kürzer, Zweihänder füllt alles
  const ax = dagger ? axis(9, 39, 39, 9) : great ? axis(3, 45, 45, 3) : axis(5, 43, 43, 5);
  const len = ax.L;
  const sc = len / 54;   // Maßstab der Teile
  const pom = 3.8 * sc * (great ? 1.1 : 1), gripE = pom + (great ? 12 : dagger ? 8 : 8.5) * sc, guardE = gripE + 3.8 * sc;
  const B = L.blade ?? M.iron, G = L.guard ?? M.iron, H = L.grip ?? M.leather;
  const half = great ? 5 : L.width >= 2 ? 4.5 : L.width === 1 ? 3 : dagger ? 3.8 : 4;
  const gw = (L.guardW ?? (great ? 4.4 : 3)) * 2 + (dagger ? 0.5 : 1.5);
  const wing = (L.wings || D.r >= 3) ? 2.2 : 0;
  const curve = (L.curve ?? 0) * 0.55;
  const bladeLen = len - guardE;
  // Klinge
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (u < guardE || u > len) return null;
    const t = (u - guardE) / bladeLen;
    let w = half * (A.fine ? 1 - t * 0.18 : 1);
    const tip = L.curve ? 0.7 : 0.8;
    if (t > tip) w *= Math.max(0, (1 - t) / (1 - tip));
    if (L.flame) w *= 0.86 + 0.2 * Math.sin(t * 20);
    const vv = v + curve * t * t * 6;   // Säbel krümmt sich zur Schattenseite
    if (vv < -w || vv > w) return null;
    if (L.jag && vv > w - 1.4 && Math.floor(u / 2.4) % 2 === 0) return null;
    const ew = A.fine ? 1.1 : 1.45;
    if (vv < -w + ew) return { k: 4 };                                       // Lichtschneide
    if (vv > w - ew) return D.edge ? { k: 3, ramp: D.edge, glow: true } : { k: 1.2 };   // Schattenschneide / Glutkante
    if (L.fuller !== false && (L.fuller || great) && Math.abs(vv + 0.2) < (A.fine ? 0.75 : 1) && t < 0.72) {
      if (L.runes && Math.floor(u / (A.fine ? 2 : 4)) % 2 === 0) return { k: 3, ramp: L.runes, glow: true };
      return { k: 1.4 };
    }
    if (L.runes && !L.fuller && Math.abs(vv) < 0.9 && t > 0.1 && t < 0.7 && Math.floor(u / (A.fine ? 2.5 : 4)) % 2 === 0) return { k: 3, ramp: L.runes, glow: true };
    if (L.rust && ((x * 7 + y * 13) % 11) < 2) return { k: 1.6, ramp: M.rusty };
    return { k: vv < 0 ? 3 : 2.1 };
  }, { ramp: B });
  // Parierstange (episch/legendär mit geschwungenen Enden)
  const guardRamp = D.r >= 4 ? GOLD : G;
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    const av = Math.abs(v);
    if (av > gw) return null;
    const bend = wing * (av / gw) ** 2;
    if (u < gripE + bend || u > guardE + bend) return null;
    return { k: (v < 0 ? 3 : 1.8) + (u - gripE - bend < 1.2 ? 0.6 : 0) - (av / gw) * 0.5 };
  }, { ramp: guardRamp });
  // Griff mit Wicklung; ab ungewöhnlich Metallring am Übergang
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    const gwid = great ? 2.2 : 1.9;
    if (u < pom - 0.6 || u > gripE || Math.abs(v) > gwid) return null;
    if (D.r >= 1 && u > gripE - (A.fine ? 1.3 : 2)) return { k: v < 0 ? 3.4 : 2, ramp: D.trim ?? M.iron };
    const band = Math.floor((u + v * 0.9) / (A.fine ? 1.6 : 2.4)) % 2 === 0;
    return { k: roundK(v, gwid, band ? 2.7 : 1.9) };
  }, { ramp: H });
  // Knauf
  const [px, py] = ax.at(pom * 0.5, 0);
  const pr = pom * 0.62 + (great ? 0.9 : 0.7);
  A.shape((x, y) => (Math.hypot(x - px, y - py) <= pr ? { k: sphereK(x, y, px, py, pr) } : null), { ramp: guardRamp });
  // Stein in der Parierstange (ab selten), legendär auch im Knauf
  if (D.gem) {
    const [gx, gy] = ax.at((gripE + guardE) / 2, 0);
    if (D.r >= 3) setting(A, gx, gy, 3.1, guardRamp === GOLD ? M.gold : D.trim);
    gem(A, gx, gy, D.r >= 3 ? 3.1 : 2.7, D.gem, { glow: D.r >= 3 });
    if (D.r >= 4) gem(A, px, py, 2.1, D.gem, { glow: true });
  }
}

// ---------------------------------------------------------------- Axt
function axeIcon(A, L) {
  const D = deco(L);
  const ax = axis(6, 45, 37, 12), len = ax.L;
  const Hd = L.head ?? M.iron, W = L.haft ?? M.wood;
  const uc = len - 8;   // Mitte des Kopfs
  // Blatt: Fächer zur Lichtseite (oben links), Doppelblatt auch zur Schattenseite
  const bladeAt = (u, v, side, scale) => {
    const o = -v * side;   // Abstand vom Stiel nach außen
    if (o < 1.5) return null;
    const reach = 17 * scale;
    const du = u - uc;
    const up = (3.5 + (o - 1.5) * 0.8) * scale, down = (3.5 + (o - 1.5) * (L.bearded ? 1.2 : 0.8)) * scale;
    if (du < -down || du > up) return null;
    const rim = reach - (du / 11) ** 2 * 3.2;
    if (o > rim) return null;
    if (o < 4.5 && Math.abs(du) > 3.2 * scale) return null;   // Hals
    const ew = A.fine ? 1.2 : 2.1;
    if (o > rim - ew) return D.edge && side > 0 ? { k: 3, ramp: D.edge, glow: true } : { k: side > 0 ? 4 : 3 };
    if (o > rim - ew - (A.fine ? 1 : 0)) return { k: 1.4 };
    return { k: 2.7 - du / 10 - (side < 0 ? 0.6 : 0) };
  };
  A.shape((x, y) => { const [u, v] = ax(x, y); return bladeAt(u, v, 1, 1) ?? (L.double ? bladeAt(u, v, -1, 0.82) : null); }, { ramp: Hd });
  // Tülle und Dorn
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (u > uc - 4.5 && u < uc + 4.5 && Math.abs(v) <= 2.7) return { k: roundK(v, 2.7, 2.2) };
    if (L.spike && u >= uc + 4.5 && u < len + 3) { const w = 2.4 * (1 - (u - uc - 4.5) / (len + 3 - uc - 4.5)); if (Math.abs(v) <= w) return { k: v < 0 ? 3.5 : 1.8 }; }
    return null;
  }, { ramp: D.r >= 4 ? GOLD : Hd });
  haft(A, ax, 0, uc + 3.5, 2.1, W, L, D);
}

// Stiel mit Griffwicklung und Endkappe (Axt, Kolben)
function haft(A, ax, u0, u1, w, W, L, D) {
  const grip = L.grip ?? (D.r >= 2 ? M.red : M.leather);
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (u < u0 + 2.5 || u > u1 || Math.abs(v) > w) return null;
    if (u < u0 + 12) {
      const band = Math.floor((u + v) / (A.fine ? 1.6 : 2.4)) % 2 === 0;
      return { k: roundK(v, w, band ? 2.8 : 1.9), ramp: grip };
    }
    const grain = A.fine && Math.abs(v + 0.4) < 0.3 && Math.floor(u / 5) % 2 === 0;
    return { k: roundK(v, w, grain ? 1.8 : 2.4) };
  }, { ramp: W });
  // Endkappe, ab ungewöhnlich Metallring über der Wicklung
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (Math.abs(v) > w + 0.4) return null;
    if (u >= u0 && u < u0 + 2.6) return { k: roundK(v, w, 2.4) };
    if (D.r >= 1 && u >= u0 + 12 && u < u0 + 13.6) return { k: roundK(v, w, 2.6) };
    return null;
  }, { ramp: D.trim ?? M.iron });
}

// ---------------------------------------------------------------- Kolben
function maceIcon(A, L) {
  const D = deco(L);
  const ax = axis(7, 44, 35, 16), len = ax.L;
  const Hd = L.head ?? M.iron, W = L.haft ?? M.wood;
  const kind = L.kind ?? 'flanged';
  if (kind === 'club') {
    A.shape((x, y) => {
      const [u, v] = ax(x, y);
      if (u < 2 || u > len + 4) return null;
      const w = 1.8 + Math.max(0, u - 14) * 0.17;
      const top = len + 4 - u;
      const ww = top < w ? Math.sqrt(Math.max(0, w * w - (w - top) ** 2)) : w;
      if (Math.abs(v) > ww) return null;
      const knot = A.fine && Math.hypot(u - len + 6, v - 1.5) < 1.2;
      return { k: knot ? 1.2 : roundK(v, ww, 2.4) };
    }, { ramp: Hd });
    if (D.r >= 1) for (const [u, v] of [[len - 4, -2.5], [len - 9, 2.2], [len - 1, 2], [len - 13, -1.5]]) { const [x, y] = ax.at(u, v); stud(A, x, y, D.trim ?? M.iron); }
    haft(A, ax, 0, 14, 1.8, W, L, D);
    if (D.gem) { const [x, y] = ax.at(len - 2, 0); gem(A, x, y, 2.4, D.gem, { glow: D.r >= 3 }); }
    return;
  }
  const [cx, cy] = ax.at(len + 0.5, 0);
  const r = kind === 'round' ? 8 : 6.6;
  const headR = D.r >= 4 ? GOLD : Hd;
  if (kind === 'spiked') {
    // Stacheln: 8 Dreiecke um die Kugel
    A.shape((x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const sec = Math.PI / 4, off = ((a + Math.PI / 8) % sec + sec) % sec - sec / 2;
      const spike = r + 5 - Math.abs(off) * 14;
      if (d <= r || d > spike) return null;
      return { k: dx + dy < 0 ? 3.6 : 1.6 };
    }, { ramp: D.r >= 2 ? M.silver : Hd });
  }
  if (kind === 'flanged') {
    // Schlagblätter in 6 Richtungen
    A.shape((x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const sec = Math.PI / 3, off = ((a + Math.PI / 6) % sec + sec) % sec - sec / 2;
      if (d <= r - 1 || d > r + 3.6 || Math.abs(off) * d > 1.7) return null;
      return { k: (dx + dy < 0 ? 3.4 : 1.7) + (d > r + 2.4 ? 0.5 : 0) };
    }, { ramp: headR });
  }
  A.shape((x, y) => (Math.hypot(x - cx, y - cy) <= r ? { k: sphereK(x, y, cx, cy, r) + 0.2 } : null), { ramp: headR });
  if (L.glow && kind !== 'spiked' && D.r >= 3) A.shape((x, y) => (Math.hypot(x - cx, y - cy) <= 2 ? { k: 4 } : null), { ramp: L.glow, bevel: false, glow: true });
  if (D.gem) gem(A, cx, cy, D.r >= 3 ? 2.6 : 2.1, D.gem, { glow: D.r >= 3 });
  // Kragen unter dem Kopf
  A.shape((x, y) => { const [u, v] = ax(x, y); return u > len - r - 2.5 && u < len - r + 0.5 && Math.abs(v) <= 2.6 ? { k: roundK(v, 2.6, 2.4) } : null; }, { ramp: D.trim ?? Hd });
  haft(A, ax, 0, len - r, 2.1, W, L, D);
}
function stud(A, x, y, R) {
  A.shape((X, Y) => (Math.hypot(X - x, Y - y) <= 1.3 ? { k: X + Y < x + y ? 4 : 2 } : null), { ramp: R, bevel: false });
}

// ---------------------------------------------------------------- Stab und Zauberstab
// Aufsätze: orb, crystal, flame, skull, curl, arcane, gem
function topper(A, kind, cx, cy, s, R, D, metal, ax) {
  const glow = true;
  switch (kind) {
    case 'crystal': {
      // langer Kristall entlang der Achse, zwei Facettenhälften und Mittelgrat
      const k = axis(...ax.at(-6 * s, 0), ...ax.at(6 * s, 0));
      const [ox, oy] = ax.at(0);   // Kristall sitzt an der Aufsatz-Mitte statt am Schaftende
      A.shape((x, y) => {
        const [u, v] = k(x - (cx - ox), y - (cy - oy));
        if (u < 0 || u > k.L) return null;
        const w = 3.6 * s * (1 - Math.abs(u - k.L * 0.42) / (k.L * 0.58));
        if (Math.abs(v) > w) return null;
        if (Math.abs(v) < (A.fine ? 0.5 : 0.9)) return { k: 4 };
        return { k: v < 0 ? 3.2 : 1.6 };
      }, { ramp: R, bevel: false, glow });
      break;
    }
    case 'flame': {
      // Flamme: Tropfen mit heißem Kern, Spitze nach oben, harte Stufen
      A.shape((x, y) => {
        const dx = x - cx, dy = y - cy;
        const ry = 6.4 * s, rx = 4.4 * s;
        const t = (dy + ry) / (2 * ry);   // 0 oben, 1 unten
        if (t < 0 || t > 1) return null;
        const w = rx * (t < 0.55 ? Math.pow(t / 0.55, 0.8) : Math.sqrt(1 - ((t - 0.55) / 0.45) ** 2));
        const sway = Math.sin(t * 3.1) * 1.2 * s * (1 - t);
        const ad = Math.abs(dx - sway);
        if (ad > w) return null;
        const core = ad / Math.max(w, 0.1);
        return { k: t > 0.45 && core < 0.4 ? 4 : core < 0.7 ? 3 : 2 };
      }, { ramp: R, bevel: false, glow });
      break;
    }
    case 'skull': {
      const r = 4.8 * s;
      A.shape((x, y) => {
        const dx = x - cx, dy = y - cy;
        const head = Math.hypot(dx, (dy + 0.8 * s) * 1.05) <= r;
        const jaw = dy > 1.5 * s && dy < r + 1.4 * s && Math.abs(dx) < r * 0.62;
        if (!head && !jaw) return null;
        const eye = Math.hypot(Math.abs(dx) - 2 * s, dy - 0.6 * s) < 1.35 * s;
        if (eye) return { c: D.glow ? D.glow[4] : VOID, flat: true };
        if (jaw && dy > r * 0.65 && Math.floor(dx / (A.fine ? 1.5 : 2)) % 2 === 0) return { k: 1 };
        return { k: sphereK(x, y, cx - 1, cy - 2, r * 1.2) };
      }, { ramp: M.bone });
      break;
    }
    case 'curl': {
      // Stab endet in einer Schnecke, Stein in der Mitte
      const r = 5.2 * s;
      A.shape((x, y) => {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        if (a > 0.5 && a < 1.9) return null;   // offen nach unten rechts: Krummstab statt Ring
        return d <= r + 1.5 && d > r - 1.5 ? { k: roundK(-(dx + dy) / 1.4, r, 2.3) } : null;
      }, { ramp: metal });
      A.shape((x, y) => (Math.hypot(x - cx, y - cy) <= r - 2.2 ? { k: sphereK(x, y, cx, cy, r - 2) } : null), { ramp: R, bevel: false, glow });
      break;
    }
    case 'arcane': {
      const r = 5.6 * s;
      A.shape((x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= r && d > r - 1.7 ? { k: x + y < cx + cy ? 3.4 : 1.8 } : null; }, { ramp: D.trim ?? GOLD });
      A.shape((x, y) => (Math.hypot(x - cx, y - cy) <= r - 3 ? { k: sphereK(x, y, cx, cy, r - 3) + 0.5 } : null), { ramp: R, bevel: false, glow });
      break;
    }
    case 'gem':
      gem(A, cx, cy, 5 * s, R, { glow });
      break;
    case 'star': {
      // fünfzackiger Stern mit heißem Kern
      const r0 = 2.6 * s, r1 = 6.6 * s;
      A.shape((x, y) => {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2;
        const ph = ((a / (2 * Math.PI / 5)) % 1 + 1) % 1, e = Math.abs(ph - 0.5) * 2;   // 1 = Zackenspitze
        const rr = r0 + (r1 - r0) * Math.pow(1 - e, 1.6) * 0 + (r1 - r0) * (e > 0.5 ? (e - 0.5) * 2 : 0);
        if (d > Math.max(r0, rr)) return null;
        return { k: d < r0 * 0.7 ? 4 : dx + dy < 0 ? 3.2 : 2 };
      }, { ramp: R, bevel: false, glow });
      break;
    }
    case 'orb':
    default: {
      const r = 5 * s;
      A.shape((x, y) => (Math.hypot(x - cx, y - cy) <= r ? { k: sphereK(x, y, cx, cy, r) + 0.3 } : null), { ramp: R, bevel: false, glow });
      if (A.fine) A.dot(cx - r * 0.45, cy - r * 0.45, R[4]);
      // Krallen der Fassung
      for (const side of [-1, 1]) {
        const [bx, by] = ax.at(-r * 0.7, side * r * 0.95);
        A.shape((x, y) => (Math.hypot(x - bx, y - by) <= 1.4 * s ? { k: x + y < bx + by ? 3.4 : 1.8 } : null), { ramp: metal, under: true });
      }
    }
  }
}

function staffIcon(A, L) {
  const D = deco(L);
  const ax = axis(5, 47, 29.5, 22.5), len = ax.L;
  const W = L.wood ?? M.wood, R = L.ramp ?? D.gem ?? M.purple, metal = L.bands ?? D.trim ?? M.iron;
  const top = L.top ?? 'orb';
  const s = 1.7;
  // Aufsatz-Mitte über dem Schaftende
  const [cx, cy] = ax.at(len + (top === 'crystal' ? 0 : top === 'curl' ? 3.5 : 5.2), top === 'curl' ? -2.6 : 0);
  const tAx = axis(...ax.at(len, 0), ...ax.at(len + 1, 0));
  // Schaft (knorrig: leicht gewellt mit Astknoten)
  A.shape((x, y) => {
    const [u, v0] = ax(x, y);
    if (u < 0 || u > len + 0.5) return null;
    const v = L.gnarled ? v0 - Math.sin(u * 0.45) * 0.9 : v0;
    const w = 2.5 + (u > len - 6 ? (u - len + 6) * 0.16 : 0);
    if (Math.abs(v) > w) return null;
    const grain = A.fine && Math.abs(v + 0.4) < 0.3 && Math.floor(u / 4) % 2 === 0;
    return { k: roundK(v, w, grain ? 1.8 : 2.4) };
  }, { ramp: W });
  // Bänder (ab selten bzw. aus look.bands), Wicklung im Griff
  const bands = [];
  if (L.bands || D.r >= 2) bands.push(len * 0.55, len - 2);
  if (D.r >= 3) bands.push(len * 0.35);
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (Math.abs(v) > 3) return null;
    for (const b of bands) if (u >= b && u < b + (A.fine ? 1.8 : 2)) return { k: roundK(v, 3, 2.6), ramp: metal };
    if (Math.abs(v) > 2.6) return null;
    if (D.r >= 1 && u > 11 && u < 19) return { k: roundK(v, 2.6, Math.floor((u + v) / (A.fine ? 1.6 : 2.4)) % 2 ? 2.8 : 1.9), ramp: D.r >= 2 ? M.red : M.leather };
    return null;
  }, { ramp: metal });
  // Fuß
  A.shape((x, y) => { const [u, v] = ax(x, y); return u >= 0 && u < 2.8 && Math.abs(v) <= 2.9 ? { k: roundK(v, 2.9, 2.2) } : null; }, { ramp: metal });
  topper(A, top, cx, cy, s, R, D, top === 'curl' ? W : metal, tAx);
  if (D.edge && top !== 'flame') sparks(A, cx, cy, 8, D.edge);
}

function wandIcon(A, L) {
  const D = deco(L);
  const ax = axis(8, 44, 29, 23), len = ax.L;
  const W = L.wood ?? M.wood, R = L.ramp ?? D.gem ?? M.ember, metal = D.trim ?? (W === M.silver ? M.gold : M.bronze);
  const top = L.top === 'gem' || L.top === 'crystal' ? 'gem' : L.top === 'flame' ? 'flame' : 'orb';
  // Griff mit Knauf, schlanker Schaft, Kragen, großer Aufsatz
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (u < 2.4 || u > len) return null;
    const w = u < 10 ? 2.4 : 2.4 - (u - 10) / (len - 10) * 0.5;
    if (Math.abs(v) > w) return null;
    if (u < 10) { const band = Math.floor((u + v) / (A.fine ? 1.6 : 2.4)) % 2 === 0; return { k: roundK(v, w, band ? 2.7 : 1.9), ramp: D.r >= 2 ? M.red : M.leather }; }
    return { k: roundK(v, w, 2.4) };
  }, { ramp: W });
  const [kx, ky] = ax.at(1.6, 0);
  A.shape((x, y) => (Math.hypot(x - kx, y - ky) <= 3 ? { k: sphereK(x, y, kx, ky, 3) } : null), { ramp: metal });
  A.shape((x, y) => {
    const [u, v] = ax(x, y);
    if (u >= 9.6 && u < 11.6 && Math.abs(v) <= 2.9) return { k: roundK(v, 2.9, 2.5) };
    // Kragen: Kelch, der sich zum Aufsatz öffnet
    if (u >= len - 3 && u < len + 1.2) { const w = 2.2 + (u - len + 3) * 0.95; if (Math.abs(v) <= w) return { k: roundK(v, w, 2.5) }; }
    return null;
  }, { ramp: metal });
  const tAx = axis(...ax.at(len, 0), ...ax.at(len + 1, 0));
  const [cx, cy] = ax.at(len + (top === 'flame' ? 7.8 : 6.4), 0);
  topper(A, top, cx, cy, 1.45, R, D, metal, tAx);
  if (D.r >= 3 && top !== 'flame') sparks(A, cx, cy, 8, D.glow ?? R);
}
// Funken: wenige harte Kreuzchen (legendär/episch)
function sparks(A, cx, cy, r, R) {
  for (const [a, d] of [[-2.3, 1.15], [0.6, 1.3]]) {
    const x = cx + Math.cos(a) * r * d, y = cy + Math.sin(a) * r * d;
    A.dot(x, y, R[4], true);
    if (A.fine) { A.dot(x - 1, y, R[2], true); A.dot(x + 1, y, R[2], true); A.dot(x, y - 1, R[2], true); A.dot(x, y + 1, R[2], true); }
  }
}

// ---------------------------------------------------------------- Bogen
function bowIcon(A, L) {
  const D = deco(L);
  const big = L.long ? 1.04 : 0.92;
  const m = 24, h = 20 * big;
  const P0 = [m - h, m + h], P1 = [m + h, m - h];   // Sehne unten links -> oben rechts
  const nx = -Math.SQRT1_2, ny = -Math.SQRT1_2;    // Bauch nach oben links
  const bulge = 10.5 * big;
  const W = L.wood ?? M.wood, tips = L.tips ?? D.trim ?? W, grip = L.grip ?? (D.r >= 2 ? M.red : M.leather);
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96;
    let b = bulge * Math.sin(Math.PI * t);
    if (L.recurve) { const e = Math.min(t, 1 - t); b -= Math.max(0, 0.16 - e) * 26; }
    pts.push([P0[0] + (P1[0] - P0[0]) * t + nx * b, P0[1] + (P1[1] - P0[1]) * t + ny * b, t]);
  }
  const near = (x, y) => {
    let best = 1e9, bt = 0, bs = 0;
    for (const [px, py, t] of pts) { const d = (x - px) ** 2 + (y - py) ** 2; if (d < best) { best = d; bt = t; bs = (x - px) * nx + (y - py) * ny; } }
    return [Math.sqrt(best), bt, bs];
  };
  // Sehne (unter dem Holz)
  const sAx = axis(...pts[L.recurve ? 6 : 2].slice(0, 2), ...pts[L.recurve ? 90 : 94].slice(0, 2));
  for (let u = 0; u <= sAx.L; u += A.s * 0.5) { const [x, y] = sAx.at(u, 0); A.dot(x, y, L.string ?? STRING); }
  A.shape((x, y) => {
    const [d, t, side] = near(x, y);
    const w = 1.6 + 2.3 * Math.sin(Math.PI * t);
    if (d > w) return null;
    const lit = side > 0;   // Außenseite oben links
    if (t > 0.42 && t < 0.58) return { k: (Math.floor(t * 120) % 2 ? 2.8 : 1.9) + (lit ? 0.4 : -0.3), ramp: grip, id: 900 };
    if (t < 0.08 || t > 0.92) return { k: lit ? 3.4 : 2, ramp: tips, id: 901 };
    if (D.edge && !lit && d > w - 1.2 && t > 0.2 && t < 0.8) return { k: 3, ramp: D.edge, glow: true };
    return { k: lit ? 3 : 1.9 };
  }, { ramp: W, id: 902 });
  // Stein im Griff (ab selten)
  if (D.gem) { const [x, y] = pts[48]; gem(A, x + nx * 0.4, y + ny * 0.4, D.r >= 3 ? 2.6 : 2.1, D.gem, { glow: D.r >= 3 }); }
}

// ---------------------------------------------------------------- Brust
// look: { style: robe|leather|chain|scale|plate, ramp, trim, shoulder, fur, tabard, emblem, glow, spikes }
function chestIcon(A, L) {
  const D = deco(L);
  const R = L.ramp ?? M.leather, st = L.style ?? 'leather';
  const trim = L.trim ?? D.trim;
  const sh = L.shoulder ?? (st === 'plate' ? R : null);
  const robe = st === 'robe';
  const plate = st === 'plate';
  // Körperumriss: Halsausschnitt, Schultern, Rumpf, Ärmel/Rock
  const bodyW = (y) => (y < 12 ? 13 : y < 30 ? 13 - (y - 12) * 0.12 : robe ? 10.8 + (y - 30) * 0.42 : 10.8);
  const bottom = robe ? 46 : plate ? 41 : 40;
  const neck = (x, y) => y < 7 + (robe ? 7 : 4.5) - Math.abs(x - 24) * (robe ? 0.9 : 0.75) && Math.abs(x - 24) < (robe ? 6 : 5.5);
  const body = (x, y) => y >= 5 && y < bottom && Math.abs(x - 24) <= bodyW(y) && !neck(x, y) && !(y < 7 && Math.abs(x - 24) > 10);
  const sleeve = (x, y) => {
    if (plate) return false;
    const ax2 = Math.abs(x - 24);
    const end = robe ? 32 : st === 'leather' ? 24 : 27;
    const outer = robe ? 22 + (y - 8) * 0.2 : 21.5;
    return y >= 7 && y < end && ax2 > 11 && ax2 <= outer - (y < 10 ? (10 - y) * 0.9 : 0);
  };
  // Stoffstruktur je Bauart
  const tex = (x, y) => {
    if (!A.fine) {
      // grobes Raster: Kettenringe als versetzte Punktreihen, Schuppen als Bögen
      const i = Math.floor(x / 2), j = Math.floor(y / 2);
      if (st === 'chain') return j % 2 === 0 && (i + (j >> 1)) % 2 === 0 ? { d: -1 } : 0;
      if (st === 'scale') return j % 2 === 1 && (i + (j >> 1)) % 2 === 0 ? { d: -1.1 } : j % 2 === 0 && (i + (j >> 1)) % 2 === 1 ? { d: 0.5 } : 0;
      return 0;
    }
    if (st === 'chain') { const row = Math.floor(y / 1.5), j = Math.floor(y * 2) % 3, i = (Math.floor(x * 2) + (row % 2) * 2) % 4; return j === 0 ? (i === 0 ? -0.9 : 0.6) : j === 1 ? (i === 3 ? -0.7 : 0) : -0.4; }
    if (st === 'scale') { const row = Math.floor(y / 3), off = (row % 2) * 1.5, cx = Math.floor((x + off) / 3) * 3 + 1.5 - off, d = Math.hypot(x - cx, (y - row * 3) * 1.1); return d > 1.6 ? -1 : d < 0.7 ? 0.6 : 0; }
    if (robe) return Math.abs(Math.sin((x - 24) * 0.55 + y * 0.05)) > 0.96 && y > 24 ? -0.8 : 0;
    return 0;
  };
  const base = (x, y) => 2.7 - (x - 24) / 16 - (y - 20) / 40;
  // Ärmel
  const tk = (x, y, k) => { const t = tex(x, y); return typeof t === 'object' ? { k: k + t.d, keep: true } : { k: k + t }; };
  A.shape((x, y) => (sleeve(x, y) ? tk(x, y, base(x, y) - 0.25) : null), { ramp: R });
  // Rumpf
  A.shape((x, y) => {
    if (!body(x, y)) return null;
    const ax2 = Math.abs(x - 24);
    if (plate) {
      // Brustpanzer mit Mittelgrat und Bauchreifen
      if (ax2 < (A.fine ? 0.5 : 1)) return { k: 3.8 };
      if (y > 29 && y < 41) { const ring = (y - 29) % 4; if (ring < (A.fine ? 1 : 2)) return { k: 1.2 }; return { k: base(x, y) - 0.2 }; }
      return { k: base(x, y) + (y < 20 ? 0.3 : 0) - (ax2 / 13) ** 2 * 0.8 };
    }
    if (st === 'leather') {
      // Schnürung in der Mitte, aufgesetzte Brustplatten-Nähte
      if (ax2 < 1.2 && y > 10 && y < 30) return Math.floor(y / 2.5) % 2 ? { k: 1 } : { k: 3, ramp: M.bone };
      if (A.fine && Math.abs(ax2 - 7.5) < 0.3 && y > 9 && y < 27 && Math.floor(y) % 2 === 0) return { k: 3.6 };
    }
    return tk(x, y, base(x, y));
  }, { ramp: R });
  // Gürtel (nicht bei Platte)
  if (!plate) {
    const by = robe ? 27 : 30;
    A.shape((x, y) => (body(x, y) && y >= by && y < by + 3.2 ? { k: 2.6 - (x - 24) / 14 } : null), { ramp: robe ? (trim ?? M.red) : M.darkleather });
    A.shape((x, y) => (Math.abs(x - 24) < 2 && y >= by - 0.4 && y < by + 3.6 ? { k: x < 24 ? 3.6 : 2 } : null), { ramp: D.r >= 3 ? GOLD : M.bronze });
  }
  // Wappenrock (episch/legendär) mit Stein
  if (L.tabard) {
    A.shape((x, y) => {
      const top = plate ? 15 : 13;
      const w = 4.6 - Math.max(0, y - 36) * 0.4;
      return y >= top && y < bottom + 1.5 && Math.abs(x - 24) <= w && !(y > bottom - 1 && Math.abs(x - 24) < (y - bottom + 1) * 2.4) ? { k: 2.6 - (x - 24) / 6 - (y - 20) / 30 } : null;
    }, { ramp: L.tabard });
  }
  // Saum/Zierkante ab selten
  if (trim && !plate) {
    A.shape((x, y) => {
      if (!body(x, y) && !sleeve(x, y)) return null;
      const hem = y >= bottom - (A.fine ? 1.5 : 2);
      const cuff = sleeve(x, y) && !sleeve(x, y + (A.fine ? 1.6 : 2.2));
      const col = body(x, y) && neck(x, y - (A.fine ? 1.4 : 2.1));
      return hem || cuff || col ? { k: 2.8 - (x - 24) / 16 } : null;
    }, { ramp: trim });
  }
  // Schulterstücke (Platte groß, Kette/Schuppe klein); legendär Gold, ab episch Dornen
  if (sh) {
    const big = plate ? (A.fine ? 1 : 0.9) : 0.72;
    const shR = L.rarity === 'legendary' && !L.set ? GOLD : sh;
    for (const side of [-1, 1]) {
      const cx = 24 + side * 14 * (plate ? 1 : 0.95), cy = 10.5;
      const rx = 8.5 * big, ry = 6.4 * big;
      A.shape((x, y) => {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1 || y > cy + ry * 0.55) return null;
        if (y > cy + ry * 0.55 - (A.fine ? 1 : 2)) return { k: 1.3 };
        if (trim && dx * dx + dy * dy > 0.72) return { k: 3 - dx, ramp: trim };
        return { k: 2.6 - dx * 0.9 - dy * 1.1 };
      }, { ramp: shR });
      if (L.spikes) A.shape((x, y) => { const tx = cx + side * 2, ty = cy - ry - 3.4; const t = (y - ty) / 4; return t >= 0 && t <= 1 && Math.abs(x - tx) <= t * 1.6 ? { k: x < tx ? 3.6 : 1.8 } : null; }, { ramp: M.silver });
    }
  }
  // Pelzkragen (Jäger)
  if (L.fur) A.shape((x, y) => (y >= 4 && y < 9.5 && Math.abs(x - 24) < 12 && !neck(x, y + 1) && ((x * 1.7 + y) % 3 > 0.6 || !A.fine) ? { k: 2.6 - (x - 24) / 14 } : null), { ramp: L.fur });
  // Brustemblem (Stein)
  const em = L.emblem ?? (D.r >= 2 ? D.gem : null);
  if (em) {
    const ey = plate ? 18 : 17;
    if (D.r >= 3) setting(A, 24, ey, 2.8, D.trim ?? GOLD);
    gem(A, 24, ey, D.r >= 3 ? 2.8 : 2.2, em, { glow: D.r >= 3 });
  }
  // Glutnähte (legendär)
  if (D.edge && A.fine) {
    A.shape((x, y) => {
      if (!body(x, y)) return null;
      const ax2 = Math.abs(x - 24);
      return (plate && y > 29 && y < 41 && (y - 29) % 4 < (A.fine ? 1 : 2) && ax2 < 9) || (!plate && Math.abs(ax2 - 9.5) < (A.fine ? 0.5 : 1) && y > 10 && y < 26) ? { k: 3, ramp: D.edge, glow: true } : null;
    });
  }
}

// ---------------------------------------------------------------- Kopf
// look: { style: hood|cap|nasal|great|horned|circlet|crown, ramp, trim, crest, crown, crownDim, coif, tail, glow, gem }
function headIcon(A, L) {
  const D = deco(L);
  const R = L.ramp ?? M.iron, st = L.horns ? 'nasal' : L.style ?? 'nasal';
  const trim = L.trim ?? (D.r >= 2 ? D.trim : null);
  if (st === 'hood') return hoodIcon(A, L, D);
  if (st === 'antlers') { hoodIcon(A, L, D); return antlers(A, L.trim ?? GOLD); }
  if (st === 'hat') return hatIcon(A, L, D);
  if (st === 'cap') return capIcon(A, L, D);
  if (st === 'circlet') return circletIcon(A, L, D);
  if (st === 'crown') return crownIcon(A, L.ramp ?? GOLD, L.crown ?? M.ember, D, 24, 30, 1.25);
  const cx = 24, cy = 23, rx = st === 'great' ? 12.5 : 13.5, ry = 14.5;
  const great = st === 'great';
  const bottom = great ? 42 : 38;
  // Kettenkragen
  if (L.coif || st === 'nasal') {
    A.shape((x, y) => {
      if (y < 28 || y > 44) return null;
      const w = 15 + (y - 28) * 0.35;
      if (Math.abs(x - cx) > w) return null;
      const t = A.fine ? ((Math.floor(y * 2) % 3 === 0) !== ((Math.floor(x * 2) + Math.floor(y / 1.5)) % 4 === 0) ? -0.7 : 0) : 0;
      return { k: 2.4 - (x - cx) / 16 + t - (y - 28) / 20 };
    }, { ramp: L.coif ? M.iron : M.darkleather });
  }
  // Glocke
  A.shape((x, y) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (great) { if (y > bottom || Math.abs(x - cx) > rx || (y < cy && dx * dx + dy * dy > 1)) return null; }
    else if (dx * dx + dy * dy > 1 || y > 35) return null;
    const ax2 = Math.abs(x - cx);
    // Gesichtsöffnung (Nasalhelm) bzw. Sehschlitz (Topfhelm)
    if (!great && y > 22 && y < 36 && ax2 < 8.6 && ax2 > 1.7) return { c: VOID, flat: true, id: 990 };
    if (!great && y >= 33 && ax2 < 8.6) return { c: VOID, flat: true, id: 990 };
    if (great && y > 21 && y < 24.4 && ax2 < 10) return { c: VOID, flat: true, id: 990 };
    if (great && y > 30 && y < 38 && x > cx + 3 && x < cx + 9 && Math.floor(x / 2.2) % 2 === 0 && Math.floor(y / 2.2) % 2 === 0) return { c: VOID, flat: true, id: 990 };
    if (ax2 < (A.fine ? 0.6 : 1.1) && y < 22) return { k: 3.9 };   // Grat
    return { k: 2.7 - dx * 1.1 - dy * 0.8 };
  }, { ramp: R });
  // Stirnband/Zierrand
  if (trim) A.shape((x, y) => {
    const dx = (x - cx) / rx;
    return y >= 19.5 && y < 22 && Math.abs(dx) <= 0.99 ? { k: 2.8 - dx } : null;
  }, { ramp: trim });
  // Nasenschiene
  if (!great) A.shape((x, y) => (y >= 19 && y < 33 && Math.abs(x - cx) <= 1.7 ? { k: x < cx ? 3.4 : 2 } : null), { ramp: trim ?? R });
  // Hörner
  if (L.horns || L.style === 'horned') for (const side of [-1, 1]) {
    A.shape((x, y) => {
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const hx = cx + side * (rx - 1 + t * 9 + t * t * 2), hy = 21 - t * 12 - t * t * 6;
        const w = 2.8 * (1 - t) + 0.5;
        if (Math.hypot(x - hx, y - hy) <= w) return { k: 3.2 - t * 0.8 - (side > 0 ? 0.6 : 0) + (t > 0.7 ? 0.6 : 0) };
      }
      return null;
    }, { ramp: M.bone });
  }
  // Kamm
  if (L.crest) A.shape((x, y) => {
    const dy = y - 3;
    if (dy < 0 || y > cy - ry + 5 || Math.abs(x - cx) > 2.2) return null;
    return { k: x < cx ? 3.3 : 2 };
  }, { ramp: L.crest });
  if (L.tail) A.shape((x, y) => (x > cx + 2 && x < cx + 7 + (y - 6) * 0.3 && y > 6 && y < 30 && x > cx + 2 + (y - 6) * 0.45 ? { k: 2.6 - (y - 6) / 18 } : null), { ramp: L.crest ?? M.darkleather });
  // Krone auf dem Helm
  if (L.crown) crownIcon(A, L.crownDim ? L.crown : GOLD, L.crownDim ? null : L.crown, D, cx, 10.5, 0.8);
  // Stein über der Stirn
  const g = L.gem ?? (D.r >= 3 ? D.gem : null);
  if (g && !L.crown) gem(A, cx, 17, 2.4, g, { glow: D.r >= 3 });
  if (L.glow && great && D.r >= 3) A.shape((x, y) => (y > 21 && y < 24.4 && Math.abs(x - cx) < 9 && Math.abs(x - cx) > 1.2 ? { k: Math.abs(x - cx) < 5 ? 4 : 3 } : null), { ramp: L.glow, bevel: false, glow: true });
}
function hoodIcon(A, L, D) {
  const R = L.ramp ?? M.darkleather;
  // Kapuze mit Spitze, Umhang auf den Schultern, tiefer Schatten im Gesicht (keine Augen)
  const outer = (x, y) => {
    if (y < 4 || y > 45) return false;
    if (y > 33) return Math.abs(x - 24) <= 13 + (y - 33) * 0.8;
    const peak = 4 + Math.abs(x - 22) * 0.55;          // leicht nach links geneigte Spitze
    const dx = (x - 24) / 14.5, dy = (y - 24) / 20;
    return y >= peak && dx * dx + dy * dy <= 1;
  };
  const face = (x, y) => { const dx = (x - 24) / 6.8, dy = (y - 28) / 9.5; return dx * dx + dy * dy <= 1 && y < 37; };
  A.shape((x, y) => {
    if (!outer(x, y)) return null;
    if (face(x, y)) {
      // Innenfutter als Rand, darin dunkle Leere mit Schattenkante
      const dx = (x - 24) / 6.8, dy = (y - 28) / 9.5, d = dx * dx + dy * dy;
      if (d > 0.74) return { k: 0.6 + (dx < 0 ? 0.6 : 0), id: 990 };
      return { c: d > 0.45 && dy < 0 ? R[0] : VOID, flat: true, id: 991 };
    }
    let k = 2.7 - (x - 24) / 14 - (y - 20) / 30;
    // Faltenlinien
    if (A.fine && y > 8 && Math.abs((x - 24) + (y - 30) * 0.35 - 11) < 0.4) k -= 0.9;
    if (A.fine && y > 34 && Math.abs(x - 13 + (y - 34) * 0.3) < 0.4) k -= 0.8;
    return { k };
  }, { ramp: R });
  if (D.trim) A.shape((x, y) => {
    if (!outer(x, y) || face(x, y)) return null;
    const dx = (x - 24) / (A.fine ? 8 : 9), dy = (y - 28) / (A.fine ? 10.7 : 11.8);
    return dx * dx + dy * dy <= 1 && y < 37 ? { k: 2.8 - (x - 24) / 10 } : y > 43.5 ? { k: 2.6 - (x - 24) / 14 } : null;
  }, { ramp: D.trim });
  // Spange vorn (ab selten mit Stein)
  if (D.gem) gem(A, 24, 40.5, D.r >= 3 ? 2.6 : 2, D.gem, { glow: D.r >= 3 });
  else if (D.r >= 1) A.shape((x, y) => (Math.hypot(x - 24, y - 40.5) <= 1.8 ? { k: x + y < 64 ? 3.5 : 2 } : null), { ramp: M.bronze });
}
function antlers(A, R) {
  // Geweih: zwei geschwungene Stangen mit Enden, über der Kapuze
  for (const side of [-1, 1]) {
    const pts = [[24 + side * 6, 12], [24 + side * 11, 7], [24 + side * 15, 3.5]];
    const tines = [[24 + side * 9.5, 8.5, 24 + side * 8, 2.5], [24 + side * 13, 5.5, 24 + side * 17.5, 7]];
    A.shape((x, y) => {
      for (let i = 0; i < 2; i++) {
        const ax = axis(...pts[i], ...pts[i + 1]); const [u, v] = ax(x, y);
        if (u >= -0.6 && u <= ax.L + 0.6 && Math.abs(v) <= 1.5 - i * 0.3) return { k: 3 - i * 0.4 - (side > 0 ? 0.5 : 0) };
      }
      for (const [x0, y0, x1, y1] of tines) { const ax = axis(x0, y0, x1, y1); const [u, v] = ax(x, y); if (u >= 0 && u <= ax.L && Math.abs(v) <= 1.1 * (1 - u / ax.L * 0.5)) return { k: 3.2 }; }
      return null;
    }, { ramp: R });
  }
}
function hatIcon(A, L, D) {
  const R = L.ramp ?? M.cloth;
  // Spitzhut: breite Krempe, nach hinten geknickte Spitze, Hutband mit Stein
  A.shape((x, y) => {
    const dx = (x - 24) / 21, dy = (y - 37) / 5.2;
    return dx * dx + dy * dy <= 1 ? { k: y < 37 ? 2.4 - dx : 1.4 - dx * 0.5 } : null;
  }, { ramp: R });
  A.shape((x, y) => {
    if (y > 36 || y < 4) return null;
    const t = (36 - y) / 32;                               // 0 unten, 1 Spitze
    const cx = 24 + t * t * 9;                             // Spitze knickt nach rechts
    const w = 11 * (1 - t) + 0.6;
    if (Math.abs(x - cx) > w) return null;
    if (A.fine && t > 0.3 && Math.abs(x - cx + w * 0.4) < 0.4) return { k: 1.2 };
    return { k: 2.8 - (x - cx) / (w + 1) * 1.2 - t * 0.3 };
  }, { ramp: R });
  A.shape((x, y) => (y >= 31 && y < 35 && Math.abs(x - 24) <= 11 - (y - 31) * -0.1 ? { k: 2.8 - (x - 24) / 10 } : null), { ramp: L.trim ?? D.trim ?? M.darkleather });
  const g = L.gem ?? D.gem;
  if (g) gem(A, 24, 33, 2.6, g, { glow: true });
}
function capIcon(A, L, D) {
  const R = L.ramp ?? M.leather;
  // gefütterte Lederkappe: Kuppel aus Bahnen, Krempe, Ohrenklappen
  A.shape((x, y) => {
    const dx = (x - 24) / 15, dy = (y - 27) / 18;
    if (dx * dx + dy * dy > 1 || y > 30) return null;
    let k = 2.7 - dx * 1.2 - dy * 0.7;
    if (A.fine && [-8, 0, 8].some((s) => Math.abs((x - 24) - s * (1 - (27 - y) / 26)) < 0.35)) k -= 1;   // Nähte der Bahnen
    return { k };
  }, { ramp: R });
  for (const side of [-1, 1]) A.shape((x, y) => {
    const ox = 24 + side * 12.5;
    return y >= 26 && y < 39 && Math.abs(x - ox) <= 3.2 - Math.max(0, y - 35) * 0.5 ? { k: 2.4 - side * 0.6 - (y - 26) / 20 } : null;
  }, { ramp: R });
  A.shape((x, y) => (y >= 27 && y < 31 && Math.abs(x - 24) <= 15.5 ? { k: 2.8 - (x - 24) / 14 } : null), { ramp: D.trim ?? M.darkleather });
  A.shape((x, y) => (Math.hypot(x - 24, y - 9.5) <= 2 ? { k: x + y < 33 ? 3.4 : 2 } : null), { ramp: D.trim ?? R });
  if (D.gem) gem(A, 24, 29, 2.2, D.gem, { glow: D.r >= 3 });
}
function circletIcon(A, L, D) {
  const R = L.ramp ?? SILVER;
  // Reif in leichter Aufsicht: Ellipsenring, vorn breiter, großer Stein mit Fassung
  const cx = 24, cy = 23, rx = 18, ry = 8.5;
  A.shape((x, y) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
    const th = y > cy ? 0.42 : 0.26;
    if (d > 1 || d < 1 - th) return null;
    return { k: y > cy ? 2.8 - dx * 0.8 : 1.6 - dx * 0.4 };
  }, { ramp: R });
  // Zierspitzen vorn
  for (const s of [-1, 1]) A.shape((x, y) => {
    const tx = cx + s * 7.5, ty = 27;
    const t = (ty - y) / 5;
    return t >= 0 && t <= 1 && Math.abs(x - tx) <= (1 - t) * 2 ? { k: x < tx ? 3.6 : 2 } : null;
  }, { ramp: R });
  setting(A, cx, 31, 3.6, R);
  gem(A, cx, 31, 3.6, L.gem ?? D.gem ?? M.blue, { glow: true });
}
function crownIcon(A, R, G, D, cx, by, s) {
  // Kronreif mit fünf Zacken, Steine in den Zacken
  const w = 13 * s, h = 9 * s;
  A.shape((x, y) => {
    const dx = x - cx;
    if (Math.abs(dx) > w || y > by + 3 * s || y < by - h) return null;
    if (y >= by - 1 * s) return { k: 2.8 - dx / w };
    const ph = ((dx / w) * 2 + 2) % 1, tipH = Math.abs(ph - 0.5) * 2;   // fünf Zacken
    const top = by - h * (1 - tipH) - 1 * s;
    return y >= top ? { k: 3 - dx / w - (by - y) / (h * 2) } : null;
  }, { ramp: R });
  if (G) for (const i of [-2, -1, 0, 1, 2]) {
    const gx = cx + i * w / 2, gy = by - h + (i === 0 ? 0.5 : 2.5) * s;
    if (Math.abs(i) === 2) continue;
    gem(A, gx, gy + 2 * s, 1.7 * s, G, { glow: true });
  }
  if (G) gem(A, cx, by + 1 * s, 1.6 * s, G, { glow: true });
}

// ---------------------------------------------------------------- Hände
// Ein Handschuh, Handrücken zum Betrachter, Finger oben, Daumen links, breite Stulpe unten
function handsIcon(A, L) {
  const D = deco(L);
  const R = L.ramp ?? M.leather, st = L.style ?? 'leather';
  const C = L.cuff ?? R, trim = L.trim ?? D.trim;
  const plate = st === 'plate', mail = st === 'mail', cloth = st === 'cloth';
  const fingers = [[14.6, 18.6, 9], [19.2, 23.2, 5.5], [23.8, 27.8, 6.8], [28.4, 32, 10.5]];
  const finger = (x, y) => {
    for (let i = 0; i < 4; i++) {
      const [a, b, top] = fingers[i];
      if (x < a || x >= b || y > 23) continue;
      const mid = (a + b) / 2, r = (b - a) / 2;
      if (y < top + r) { if (Math.hypot(x - mid, y - top - r) <= r) return i + 1; continue; }
      return i + 1;
    }
    return 0;
  };
  const back = (x, y) => y >= 19 && y < 34 && x >= 14 && x < 33 - Math.max(0, y - 30) * 0.2;
  const thumb = (x, y) => { const ax = axis(16, 29, 8, 19); const [u, v] = ax(x, y); return u >= -1 && u <= ax.L + 0.5 && Math.abs(v) <= 2.6 - Math.max(0, u - ax.L + 2.5) * 0.5; };
  const cuff = (x, y) => y >= 33 && y < 45 && Math.abs(x - 23.5) <= 10 + (y - 33) * (plate ? 0.42 : 0.18);
  const base = (x, y) => 2.8 - (x - 22) / 12 - (y - 20) / 34;
  // Daumen
  A.shape((x, y) => (thumb(x, y) && !back(x, y) ? { k: base(x, y) + 0.1 + (plate && A.fine && Math.floor((x + y) / 3) % 2 ? -0.6 : 0) } : null), { ramp: R });
  // Finger
  A.shape((x, y) => {
    const f = finger(x, y);
    if (!f) return null;
    const [a, b] = fingers[f - 1];
    let k = base(x, y) + (x < (a + b) / 2 - 0.3 ? 0.3 : -0.2);
    if (plate && (A.fine ? Math.floor((y - 6) / 3.4) % 2 === 1 : (y + 40) % 6 < 2 && y > 10)) k -= 0.9;   // Fingerschienen
    if (mail && A.fine && (Math.floor(y * 2) % 3 === 0)) k -= 0.6;
    if (cloth && A.fine && Math.floor((y + x * 0.5) / 2.2) % 2 === 0) k -= 0.5;     // Wickelbinden
    return { k, id: 100 + f };
  }, { ramp: R });
  // Handrücken
  A.shape((x, y) => {
    if (!back(x, y)) return null;
    let k = base(x, y);
    if (y < 21.5) k += 0.6;   // Knöchel
    if (plate && (Math.abs(y - 24) < (A.fine ? 0.5 : 1) || Math.abs(y - 29) < (A.fine ? 0.5 : 1))) k -= 1.3;
    if (mail && A.fine) { const row = Math.floor(y / 1.5), i = (Math.floor(x * 2) + (row % 2) * 2) % 4; k += Math.floor(y * 2) % 3 === 0 ? (i === 0 ? -0.9 : 0.5) : -0.3; }
    if (mail && !A.fine) { const i = Math.floor(x / 2), j = Math.floor(y / 2); if (j % 2 === 0 && (i + (j >> 1)) % 2 === 0) return { k: k - 1, keep: true }; }
    if (st === 'leather' && A.fine && Math.abs(x - 15.6) < 0.4 && Math.floor(y) % 2 === 0) k += 1;   // Naht
    if (cloth && A.fine && Math.floor((y + x * 0.5) / 2.2) % 2 === 0) k -= 0.5;
    return { k };
  }, { ramp: R });
  // Knöchelplatte (Platte)
  if (plate) A.shape((x, y) => (y >= 18 && y < 22 && x >= 14.2 && x < 32.4 ? { k: 3 - (x - 14) / 16 } : null), { ramp: R });
  // Stulpe
  A.shape((x, y) => {
    if (!cuff(x, y)) return null;
    let k = 2.7 - (x - 23.5) / 11 - (y - 33) / 30;
    if (y < 34.6) k -= 1;
    if (plate && y > 42.4) k += 1;
    if (st === 'leather' && A.fine && Math.abs(y - 38.5) < 0.4 && Math.floor(x) % 2 === 0) k += 1.2;
    return { k };
  }, { ramp: plate || mail ? C : C });
  // Zierband und Stein (ab selten)
  if (trim) A.shape((x, y) => (cuff(x, y) && y >= 41 && y < 43.4 ? { k: 2.8 - (x - 23.5) / 12 } : null), { ramp: trim });
  if (D.r >= 1 && (plate || mail)) for (const sx of [17, 30]) stud(A, sx, 38, trim ?? M.iron);
  const glow = L.glow ?? (D.r >= 3 ? D.glow : null);
  if (D.gem || glow) {
    if (D.r >= 3) setting(A, 23.5, 26.5, 2.6, trim ?? GOLD);
    gem(A, 23.5, 26.5, D.r >= 3 ? 2.6 : 2, glow ?? D.gem, { glow: !!glow });
  }
}

// ---------------------------------------------------------------- Füße
// Ein Stiefel im Profil, Spitze nach rechts: Schaft mit Umschlag, Rist, Kappe, Sohle mit Absatz
function feetIcon(A, L) {
  const D = deco(L);
  const R = L.ramp ?? M.leather, st = L.style ?? 'leather';
  const C = L.cuff ?? R, trim = L.trim ?? D.trim;
  const plate = st === 'plate', mail = st === 'mail', cloth = st === 'cloth';
  const top = cloth ? 16 : 5;
  // Umriss als geglättetes Vieleck (im Uhrzeigersinn): Schaft, Rist, Kappe, Sohlenkante, Ferse, Wade
  const outline = smoothPoly([[13.2, top], [28.6, top], [27.8, 18], [28.2, 25.5], [31.5, 30], [37.5, 32.6], [42.2, 34.6], [44.8, 37.6], [45, 41.6],
    [12.6, 41.6], [11.4, 38.5], [11.8, 33], [13.4, 27], [14, 18]]);
  const boot = (x, y) => inPoly(outline, x, y);
  const shaft = (x, y) => boot(x, y) && (y < 30.5 - Math.max(0, x - 27) * 0.9) && x < 30;
  const foot = (x, y) => boot(x, y) && !shaft(x, y);
  const sole = (x, y) => y >= 41.6 && y < 45 && x >= 12.4 && x <= 45.2 - (y - 41.6) * 0.8 && !(x > 19.5 && x < 27 && y > 43.4);
  const base = (x, y) => 2.8 - (x - 20) / 18 - (y - 18) / 40;
  // Sohle mit Absatz
  A.shape((x, y) => (sole(x, y) ? { k: y < 42.2 ? 2.4 : 1.4 } : null), { ramp: plate ? M.iron : M.darkleather });
  // Fuß
  A.shape((x, y) => {
    if (!foot(x, y)) return null;
    let k = base(x, y);
    if (x > 37.5 && y < 39) k += 0.5;                                // Kappe
    if (plate && x > 29 && (A.fine ? Math.floor((x - 29 + y * 0.5) / 3.6) % 2 === 1 : (x - 29 + y * 0.5 + 40) % 6 < 1.6)) k -= 0.8;   // Zehenschienen
    if (mail && A.fine && Math.floor(y * 2) % 3 === 0 && Math.floor(x * 2 + y) % 4 === 0) k -= 0.8;
    if (st === 'leather' && A.fine && Math.abs(y - 39.6) < 0.35 && Math.floor(x) % 2 === 0) k += 1;   // Rahmennaht
    return { k };
  }, { ramp: R });
  // Schaft
  A.shape((x, y) => {
    if (!shaft(x, y)) return null;
    let k = base(x, y) + 0.1;
    if (plate && (A.fine ? Math.floor((y - 6) / 4) % 2 === 1 : (y - 6) % 6 < 2 && y > 12)) k -= 0.8;          // Beinschienen-Reifen
    if (mail && A.fine) { const row = Math.floor(y / 1.5), i = (Math.floor(x * 2) + (row % 2) * 2) % 4; k += Math.floor(y * 2) % 3 === 0 ? (i === 0 ? -0.9 : 0.5) : -0.3; }
    if (cloth && Math.floor((y - x * 0.4) / (A.fine ? 2.6 : 3)) % 2 === 0) k -= 0.6;   // Wickelbinden
    if (st === 'leather' && x > 21 && x < 27 && y > 22 && y < 34 && A.fine && Math.floor(y / 2.4) % 2 === 0 && Math.abs(x - 24.5) < 1.2) return { k: 3, ramp: M.bone };   // Schnürung
    return { k };
  }, { ramp: R });
  // Umschlag bzw. Kniekachel
  if (!cloth) A.shape((x, y) => {
    if (y < 4 || y >= (plate ? 11.5 : 10) || x < 12.4 || x > 29.4) return null;
    return { k: 2.9 - (x - 20) / 12 - (y - 5) / 10 };
  }, { ramp: plate ? R : C });
  // Zierband (ab selten), Schnalle (ungewöhnlich)
  if (trim) A.shape((x, y) => (shaft(x, y) && y >= 25 && y < 27.5 ? { k: 2.8 - (x - 20) / 14 } : null), { ramp: trim });
  else if (D.r >= 1 && !cloth) A.shape((x, y) => (shaft(x, y) && y >= 25 && y < 27.5 ? { k: 2.2 - (x - 20) / 14, ramp: M.darkleather } : null));
  if (D.r >= 1 && !cloth) A.shape((x, y) => (x >= 22 && x < 25.5 && y >= 24.5 && y < 28 && (x < 22.8 || x >= 24.7 || y < 25.3 || y >= 27.2) ? { k: x < 23.5 ? 3.5 : 2 } : null), { ramp: trim ?? M.bronze });
  const glow = L.glow ?? (D.r >= 3 ? D.glow : null);
  if (D.gem || glow) gem(A, 20.5, cloth ? 30 : 7.5, D.r >= 3 ? 2.4 : 1.9, glow ?? D.gem, { glow: !!glow });
}

// Vieleck mit Catmull-Rom-Glättung (geschlossen) und Punkt-im-Vieleck-Test
function smoothPoly(P, n = 6) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[(i - 1 + P.length) % P.length], p1 = P[i], p2 = P[(i + 1) % P.length], p3 = P[(i + 2) % P.length];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------- Einstieg
const WEAPON_DRAW = { sword: blade, greatsword: blade, dagger: blade, axe: axeIcon, mace: maceIcon, staff: staffIcon, wand: wandIcon, bow: bowIcon };
const DRAW = {
  weapon: (A, L) => (WEAPON_DRAW[L.family] ?? blade)(A, L),
  chest: chestIcon, head: headIcon, hands: handsIcon, feet: feetIcon,
};
export const GEAR_KINDS = Object.keys(DRAW);
// Vergrößerung je Familie: Formen sind im 48er-Maß mit Rand gezeichnet, im Platz sollen sie ihn füllen
const ZOOM = { sword: 1.13, greatsword: 1.04, dagger: 1.14, axe: 1.1, mace: 1.1, staff: 1.02, wand: 1.1, bow: 1.08, chest: 1.05, head: 1.06, hands: 1.08, feet: 1.06 };
export function drawGear(kind, look, res = 2) {
  const A = new Art(res, ZOOM[kind === 'weapon' ? (look.great ? 'greatsword' : look.family) : kind] ?? 1);
  DRAW[kind]?.(A, look);
  return A.render();
}
