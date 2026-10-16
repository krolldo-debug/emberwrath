import { MapBuilder } from './levels.js';

// Werkzeugkasten für Außenkarten (aus levels3.js herausgelöst, damit jede Zone
// eine eigene Datei unter world/outdoor/ haben kann). Bodenzeichen außen:
// ',' Gras/Asche, '.' Erde/Kies, ':' Pflaster, '~' Wasser/Lava (fest), '#' Fels.

export const road4 = (m) => (pts, w = 2) => m.path(pts, w, '.', [',', '~']);
export const near = (m, x, y, ch, r = 1) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (m.get(x + i, y + j) === ch) return true;
  return false;
};
export const box = (r, pad = 1) => (x, y) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
export const each = (list, fn) => list.forEach(([x, y]) => fn(x, y));
export const GROUND = new Set([',', '.', ':']);

// Unregelmäßiger Fleck aus einer Grundellipse und versetzten Teilellipsen
export function blob(m, rng, cx, cy, rx, ry, ch, only = null, n = 4) {
  m.ellipse(cx, cy, rx, ry, ch, only);
  for (let i = 0; i < n; i++) {
    m.ellipse(cx + rng.range(-rx, rx) * 0.6, cy + rng.range(-ry, ry) * 0.6, rx * rng.range(0.35, 0.65), ry * rng.range(0.35, 0.65), ch, only);
  }
}

// Wegenetz: malt Straßen in die Karte und merkt sie in einer Maske, damit
// die Streudeko einen Rand frei lässt.
export function roadNet(m) {
  const mask = new MapBuilder(m.w, m.h, ' ');
  const lines = [];
  const road = (pts, w = 2, ch = '.', only = [',', '~']) => { m.path(pts, w, ch, only); mask.path(pts, w + 1.2, 'R'); lines.push({ pts, w }); };
  return { road, mask, lines, onRoad: (x, y) => mask.get(x, y) === 'R' };
}

// Wegelichter: setzt `ch` etwa alle `every` Kacheln neben die Wege (abwechselnd links/rechts) auf freien Boden,
// damit Wege als Lichterkette durch dunkle Gebiete führen. Meidet Sperrflächen (keep) und hält `gap` Kacheln
// Abstand zu vorhandenen Lichtzeichen (`lit`) und zueinander. Aufruf nach der Streudeko.
export function trailLights(m, net, { ch, every = 12, gap = 6, lit = '', keep = () => false, minW = 0 }) {
  const L = new Set(lit + ch);
  const free = (x, y) => GROUND.has(m.get(x, y)) && GROUND.has(m.get(x - 1, y)) && GROUND.has(m.get(x + 1, y)) && GROUND.has(m.get(x, y + 1)) && GROUND.has(m.get(x, y - 1));
  const lonely = (x, y) => {
    for (let j = -gap; j <= gap; j++) for (let i = -gap; i <= gap; i++) if (i * i + j * j <= gap * gap && L.has(m.get(x + i, y + j))) return false;
    return true;
  };
  let side = 1, n = 0;
  for (const { pts, w } of net.lines) {
    if (w < minW) continue;
    let carry = every / 2;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      let s = carry;
      for (; s < len; s += every) {
        const px = ax + ux * s, py = ay + uy * s;
        let done = false;
        for (const sd of [side, -side]) {
          for (let d = w / 2 + 1; d <= w / 2 + 4 && !done; d += 1) {
            const x = Math.round(px - uy * d * sd), y = Math.round(py + ux * d * sd);
            if (!free(x, y) || net.onRoad(x, y) || keep(x, y) || !lonely(x, y)) continue;
            m.set(x, y, ch); done = true; n++;
          }
          if (done) break;
        }
        side = -side;
      }
      carry = s - len;
    }
  }
  return n;
}

// Prüfhilfe: Marken, für die kein freier Boden gefunden wurde (sollte leer sein)
export const MISPLACED = [];

// Gegner/Marke auf den nächsten freien Boden (3 × 3 nur Boden) setzen –
// nie in Wasser, Fels oder Deko.
export function foe(m, x, y, ch) {
  for (let r = 0; r <= 5; r++) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      let ok = true;
      for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (!GROUND.has(m.get(x + i + a, y + j + b))) { ok = false; break; }
      if (ok) { m.set(x + i, y + j, ch); return; }
    }
  }
  MISPLACED.push(`${ch}@${x},${y}`);
  m.set(x, y, ch);
}

// Streudeko auf Bodenzeichen `grounds`; meidet Straßen und Sperrflächen.
// pick(x, y, ground, free) -> Zeichen oder null; free = 3 × 3 nur Boden.
export function strew(m, net, rng, keep, pick, grounds = ',') {
  const G = new Set(grounds);
  const free = (x, y) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!GROUND.has(m.get(x + i, y + j))) return false;
    return true;
  };
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    const ch = m.get(x, y);
    if (!G.has(ch) || keep(x, y) || net.onRoad(x, y)) continue;
    const r = pick(x, y, ch, free(x, y));
    if (r) m.set(x, y, r);
  }
}

// Kreis aus Zeichen (Steinkreise, Säulenringe)
export function circle(m, cx, cy, rx, ry, n, ch, a0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    m.set(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), ch);
  }
}

// Wichtige Stellen einer Karte: Gegner, NPCs, Ankunftspunkte, Objekte, Portale (Kachelkoordinaten)
export function levelSpots(m, L) {
  const chars = new Set([...Object.keys(L.enemies ?? {}), ...Object.keys(L.npcs ?? {}), ...Object.keys(L.points ?? {})]);
  const s = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (chars.has(m.get(x, y))) s.push([x, y]);
  for (const o of [...(L.objects ?? []), ...(L.portals ?? [])]) s.push([o.x, o.y]);
  return s;
}

// Freiraum um wichtige Stellen: hohe Streudeko (removable) daneben und südlich davor wird wieder Boden –
// Kronen und Felsen ragen nach oben und würden Gegner, Hütten und Portale sonst verdecken.
export function clearAround(m, spots, removable, { r = 2, south = 3 } = {}) {
  const R = new Set(removable);
  let n = 0;
  for (const [sx, sy] of spots) {
    const cx = Math.round(sx), cy = Math.round(sy);
    for (let y = cy - 1; y <= cy + south; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!R.has(m.get(x, y))) continue;
      const nb = [m.get(x - 1, y), m.get(x + 1, y), m.get(x, y - 1), m.get(x, y + 1)].find((c) => GROUND.has(c));
      m.set(x, y, nb ?? ','); n++;
    }
  }
  return n;
}
