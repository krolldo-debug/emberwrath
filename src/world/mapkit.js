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
  const road = (pts, w = 2, ch = '.', only = [',', '~']) => { m.path(pts, w, ch, only); mask.path(pts, w + 1.2, 'R'); };
  return { road, mask, onRoad: (x, y) => mask.get(x, y) === 'R' };
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

