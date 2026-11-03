// Vorgerenderte Kampfeffekte der Bosse (Neuzeichnung 03.11.): Flammenzungen, Feuersäulen, Explosionen, Feuerbälle,
// Aschewolken, Meteor, Glutspeer, Runenkreis, Glutriss. Statt Laufzeit-Strichen aus 1-Pixel-Rechtecken werden die
// Formen einmal im Feinraster (gfx/Fine.js) gezeichnet – harte Farbstufen, ganzzahliges Raster, kein Weichzeichnen –
// und als SpriteFrame-Folgen zwischengespeichert. Alle Folgen entstehen erst beim ersten Gebrauch.
//
// Anker: Flammen/Säulen/Explosionen unten mittig (Bodenpunkt), Bälle/Meteor/Speer in der Mitte.
import { SpriteFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { plate, bar, orb, gem, hair, poly, dotp } from './bossPaint.js';

// Paletten: [Saum dunkel, Rand, Körper, hell, Kern, Weißkern]
export const PAL = {
  fire: ['#4a1004', '#a8300a', '#e8601a', '#ffa83a', '#ffe08a', '#fffbe8'],
  white: ['#6a2008', '#d0501a', '#ff9a3a', '#ffd27a', '#fff4d0', '#ffffff'],
  gold: ['#5a3a0a', '#a8761e', '#e0b048', '#ffe08a', '#fff6cc', '#ffffff'],
  frost: ['#0a2a4a', '#16609a', '#34a8dc', '#8ae4f8', '#d8faff', '#ffffff'],
  poison: ['#062a26', '#0e6a5e', '#1cb4a0', '#6ce8d4', '#c8fff2', '#ffffff'],
  violet: ['#2a0a3a', '#6a1a8a', '#b048e0', '#e0a0ff', '#f6deff', '#ffffff'],
  water: ['#0a2a44', '#1c5882', '#3886b2', '#76bcdc', '#c6eaf6', '#ffffff'],
  teal: ['#063a40', '#0e7888', '#2ec8cc', '#a0fff0', '#e0fffa', '#ffffff'],
  flood: ['#0a1a5a', '#2050d0', '#4a80f0', '#8ac0ff', '#d6ecff', '#ffffff'],
  mist: ['#1a3450', '#4a7aa0', '#8ab8d4', '#c8e4f0', '#eef8ff', '#ffffff'],
  ghost: ['#06302c', '#127068', '#22b0a4', '#7ef0d6', '#e8fff8', '#ffffff'],
};
const ASH = ['#0c0a0e', '#1e1a20', '#36302e', '#524a44', '#7a7068', '#a69c90', '#cec4b6'];
const OBS = ['#050407', '#0e0b12', '#1a1622', '#2a2434', '#40384e', '#5e5470', '#8a80a0'];
const TAU = Math.PI * 2;

const cache = new Map();
function cached(key, make) {
  const k = key + '|' + fineRes();
  let v = cache.get(k);
  if (!v) { v = make(); cache.set(k, v); }
  return v;
}
// Ein Frame: Zeichenfläche w×h Weltpixel, Anker (ax, ay) in Weltpixeln
function frame(w, h, ax, ay, draw) {
  const res = fineRes(), p = new FineCanvas(Math.ceil(w), Math.ceil(h), res);
  draw(p);
  return new SpriteFrame(p.canvas, Math.round(ax * res), Math.round(ay * res), res);
}
const band = (pal, v) => (v <= 0 ? null : pal[Math.min(5, Math.floor(v * 6))]);

// Flammenfeld: Wärme 0..1 an (x, y) einer Zunge der Breite w und Höhe h (y nach oben ab dem Fuß), Zeit t 0..1 (Schleife)
function flameHeat(x, y, w, h, t, seed, tongues = 3) {
  const u = y / h;
  if (u < -0.05 || u > 1.05) return 0;
  const ph = t * TAU;
  const sway = (Math.sin(ph + u * 4.6 + seed) * 0.17 + Math.sin(ph * 2 + u * 8.3 + seed * 1.7) * 0.07) * w * u;
  // Fuß bauchig, oben spitz, in Zungen geteilt
  let hw = (w / 2) * (u < 0.18 ? 0.78 + u * 1.25 : Math.pow(Math.max(0, 1 - u), 0.72) * 1.08);
  const xs = x - sway;
  if (u > 0.38) {
    const split = Math.abs(Math.cos((xs / w) * Math.PI * (tongues - 0.5) + Math.sin(ph + seed) * 0.6));
    hw *= 1 - (u - 0.38) * 0.9 * (1 - split);
  }
  if (hw <= 0.05) return 0;
  const d = Math.abs(xs) / hw;
  if (d >= 1) return 0;
  // Flackern: weiches, periodisches Rauschen (Schleife) – niedrige Frequenz, damit die Farbstufen saubere Flächen bilden
  const n = Math.sin(xs * 0.8 + y * 0.32 - ph * 2 + seed) * Math.sin(xs * 0.41 - y * 0.55 - ph * 3 + seed * 2.3);
  let v = (1 - d) * (1.05 - u * 0.72) + n * 0.09;
  // oben lösen sich einzelne Zungenfetzen ab (waagerechte Lücken, die nach oben wandern)
  if (u > 0.5 && Math.sin(y * 0.38 - ph * 2 + seed + xs * 0.15) > 0.82 - (u - 0.5) * 0.9) return 0;
  return v;
}

// Flammenzunge als Schleife (n Frames)
export function flameLoop(w, h, pal = 'fire', { n = 8, seed = 0, tongues = 3 } = {}) {
  return cached(`flame:${w}:${h}:${pal}:${n}:${seed}:${tongues}`, () => {
    const P = PAL[pal], W = w + 4, H = h + 3;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push(frame(W, H, W / 2, H - 1, (p) => p.each(0, 0, W, H, (x, y) => band(P, flameHeat(x - W / 2, H - 1 - y, w, h, t, seed, tongues) * 1.15))));
    }
    return out;
  });
}

// Feuersäule (keine Schleife): schießt hoch, steht, reißt oben ab und fällt in sich zusammen. k = 0..1 über die Folge
export function pillarSeq(w, h, pal = 'fire', n = 10) {
  return cached(`pillar:${w}:${h}:${pal}:${n}`, () => {
    const P = PAL[pal], W = w * 2 + 8, H = h + 10;
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const grow = Math.min(1, Math.sin(Math.min(1, k * 2.4) * Math.PI / 2)), fall = Math.max(0, (k - 0.55) / 0.45);
      const hh = h * grow * (1 - fall * 0.45), ww = w * (1 - fall * 0.35) * (0.8 + 0.2 * grow);
      out.push(frame(W, H, W / 2, H - 3, (p) => {
        p.each(0, 0, W, H, (x, y) => {
          const X = x - W / 2, Y = H - 3 - y;
          // Säule aus drei Zungen, Kern weiß; beim Zusammenfallen löst sie sich von unten
          let v = Math.max(flameHeat(X, Y, ww, hh, k * 1.5, 0, 2), flameHeat(X + ww * 0.28, Y, ww * 0.7, hh * 0.82, k * 1.5 + 0.3, 2.1, 2) * 0.9,
            flameHeat(X - ww * 0.3, Y, ww * 0.62, hh * 0.7, k * 1.5 + 0.6, 4.2, 2) * 0.85);
          if (fall > 0 && Y < hh * fall * 0.5) v -= fall * 0.8;
          // Bodenring aus Glut
          const r = Math.hypot(X / (w * 1.1), (Y - 1) / 2.4);
          if (r < 1 && Y < 4) v = Math.max(v, (1 - r) * (1 - fall) * 0.9 + 0.15);
          return band(P, v * 1.1);
        });
      }));
    }
    return out;
  });
}

// Explosion am Boden (keine Schleife): Blitz, Flammenblätter im Kreis, Ring, Rauch; r = Weltradius (Bodenellipse 0,6)
export function burstSeq(r, pal = 'fire', n = 9) {
  return cached(`burst:${r}:${pal}:${n}`, () => {
    const P = PAL[pal], W = r * 2 + 16, H = r * 1.2 + r * 1.3 + 14, ay = r * 1.3 + 8;
    const petals = 9;
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      out.push(frame(W, H, W / 2, ay, (p) => {
        const R = r * (0.35 + 0.75 * Math.sqrt(k));
        p.each(0, 0, W, H, (x, y) => {
          const X = x - W / 2, Y = y - ay;
          // Bodenring
          const d = Math.hypot(X, Y / 0.6);
          let v = 0;
          const ring = Math.abs(d - R);
          if (ring < 2.2 * (1 - k * 0.5)) v = (1 - ring / 2.4) * (1 - k * 0.8) + 0.2;
          if (d < R * 0.85 && k < 0.35) v = Math.max(v, (1 - d / R) * (1 - k * 2.6) + 0.35);
          // Flammenblätter: steigen am Ring auf (nach oben gestreckt)
          for (let j = 0; j < petals; j++) {
            const a = (j / petals) * TAU + hash2(j, r, 7) * 0.5, px = Math.cos(a) * R, py = Math.sin(a) * R * 0.6;
            const fh = (6 + hash2(j, 2, 7) * 8) * (1 - k * 0.7) * (r / 16), fw = 4 + r * 0.18;
            const hv = flameHeat(X - px, py - Y, fw, fh, k * 0.8 + j * 0.13, j, 2);
            if (hv > v) v = hv;
          }
          // Mittelflamme in den ersten Frames
          if (k < 0.55) v = Math.max(v, flameHeat(X, -Y, r * 0.9, r * 1.25 * (1 - k * 1.2), k, 1.3, 3) * 1.1);
          return band(P, v * (1.15 - k * 0.35));
        });
        // aufsteigender Rauch in den späten Frames: eine zusammenhängende Wolke über dem Ring
        if (k > 0.4) {
          const q = (k - 0.4) / 0.6, s = r * (0.35 + q * 0.3), cy = ay - r * 0.35 - q * r * 0.9;
          const blobs = [[0, 0, 1], [-0.8, 0.3, 0.72], [0.82, 0.25, 0.7], [-0.3, -0.6, 0.62], [0.4, -0.5, 0.6]].map(([bx, by, bs]) => [W / 2 + bx * s, cy + by * s, s * bs]);
          cloud(p, blobs, { lit: 1 - q, fray: Math.max(0, q - 0.35) * 1.5, seed: r });
        }
      }));
    }
    return out;
  });
}

// Feuerball (Schleife): runder Kern, flackernder Mantel, Schweif nach hinten (Richtung -x)
export function fireballLoop(r, pal = 'fire', n = 6) {
  return cached(`ball:${r}:${pal}:${n}`, () => {
    const P = PAL[pal], W = r * 4 + 6, H = r * 2 + 6;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n, ph = t * TAU;
      out.push(frame(W, H, W - r - 3, H / 2, (p) => p.each(0, 0, W, H, (x, y) => {
        const X = x - (W - r - 3), Y = y - H / 2;
        const back = Math.max(0, -X);
        const hw = r * (X > 0 ? Math.sqrt(Math.max(0, 1 - (X / r) ** 2)) : Math.max(0, 1 - back / (r * 3)) * (0.9 + 0.25 * Math.sin(back * 0.9 - ph * 2)));
        const d = Math.abs(Y + Math.sin(back * 0.5 - ph) * back * 0.08) / Math.max(0.01, hw);
        if (d >= 1) return null;
        const n = Math.sin(X * 1.7 - ph * 3) * Math.sin(Y * 1.9 + ph * 2) * 0.15;
        return band(P, (1 - d) * (1 - back / (r * 3.2)) * 1.25 + 0.12 + n);
      })));
    }
    return out;
  });
}

// Wolke aus verschmolzenen Ballen [[x, y, R], …]: ein gemeinsames Feld, Licht von oben links, Glut von unten,
// dunkler Saum. fray = 0..1 zerfasert die Ränder (Auflösen).
function cloud(p, blobs, { lit = 0, fray = 0, seed = 0 } = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y, R] of blobs) { x0 = Math.min(x0, x - R); y0 = Math.min(y0, y - R); x1 = Math.max(x1, x + R); y1 = Math.max(y1, y + R); }
  const F = (x, y) => {
    let f = 0;
    for (const [bx, by, R] of blobs) { const d = ((x - bx) ** 2 + (y - by) ** 2) / (R * R); if (d < 1) f = Math.max(f, 1 - d); }
    return f;
  };
  const bottom = y1;
  p.each(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (x, y) => {
    const f = F(x, y);
    if (f <= 0) return null;
    if (fray > 0 && f < 0.5 && hash2(Math.floor(x * 1.5), Math.floor(y * 1.5), seed) < fray * 1.4 - f) return null;
    if (f < 0.1) return ASH[1];
    const toward = F(x - 1.3, y - 1.6), lv = f - toward;        // > 0: Kante zum Licht
    if (lit > 0 && y > bottom - (bottom - y0) * 0.35 * lit && F(x, y + 1.6) < f) return f < 0.3 ? '#7a2a10' : '#c8420c';   // Glut von unten
    let i = 2 + Math.round(lv * 5 + (f - 0.5) * 1.2);
    if (lv < -0.12) i = 1;
    return ASH[Math.max(1, Math.min(4, i))];
  });
}

// Asche-/Rauchwolke (keine Schleife): quillt auf, steigt, löst sich; Unterseite von Glut beleuchtet
export function smokeSeq(r, n = 8, lit = true) {
  return cached(`smoke:${r}:${n}:${lit}`, () => {
    const W = r * 3 + 6, H = r * 3 + 6;
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      out.push(frame(W, H, W / 2, H - 3, (p) => {
        const s = r * (0.55 + 0.6 * k), cy = H - 3 - s - k * r * 0.6;
        const blobs = [[0, 0, 1], [-0.62, 0.25, 0.7], [0.6, 0.2, 0.74], [-0.2, -0.55, 0.66], [0.32, -0.45, 0.58]]
          .map(([bx, by, bs]) => [W / 2 + bx * s, cy + by * s, s * bs * (1 - k * 0.2)]);
        cloud(p, blobs, { lit: lit ? Math.max(0, 1 - k * 1.6) : 0, fray: Math.max(0, k - 0.45) * 1.6, seed: 5 });
      }));
    }
    return out;
  });
}

// Meteor aus Obsidian (Schleife): kantiger Brocken mit Glutrissen, Flammenmantel und Schweif entlang (dx, dy)
export function meteorLoop(s, n = 4) {
  return cached(`meteor:${s}:${n}`, () => {
    const W = s * 9 + 8, H = s * 9 + 8, cx = s * 2 + 4, cy = H - s * 2 - 4;
    const dx = 0.37, dy = -0.93;   // Schweif zeigt nach oben rechts (woher er kommt)
    const P = PAL.fire, out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n, ph = t * TAU;
      out.push(frame(W, H, cx, cy, (p) => {
        // Schweif und Mantel
        p.each(0, 0, W, H, (x, y) => {
          const X = x - cx, Y = y - cy, along = X * dx + Y * dy, perp = -X * dy + Y * dx;
          if (along < -s * 1.6) return null;
          const L = s * 6.5, hw = along < 0 ? s * 1.5 * Math.sqrt(Math.max(0, 1 - (along / (s * 1.6)) ** 2)) : s * 1.5 * Math.max(0, 1 - along / L) * (0.85 + 0.2 * Math.sin(along * 0.8 - ph * 2));
          const wob = Math.sin(along * 0.6 - ph * 2) * along * 0.06;
          const d = Math.abs(perp + wob) / Math.max(0.01, hw);
          if (d >= 1) return null;
          const v = (1 - d) * (1 - Math.max(0, along) / (L * 1.05)) * 1.3 + Math.sin(along * 1.3 - ph * 3 + perp) * 0.1;
          return band(P, v);
        });
        // Brocken
        const pts = [];
        for (let j = 0; j < 7; j++) { const a = j / 7 * TAU + 0.3 + ph * 0.25, rr = s * (0.85 + hash2(j, 3, 11) * 0.35); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        plate(p, pts, OBS, { edge: 0.6, core: s * 0.4, line: 0.5 });
        for (let j = 0; j < 3; j++) { const a = j * 2.1 + ph * 0.25; hair(p, cx, cy, cx + Math.cos(a) * s * 0.8, cy + Math.sin(a) * s * 0.8, j ? '#ff8a2a' : '#ffe08a'); }
        dotp(p, cx, cy, '#fffbe8');
      }));
    }
    return out;
  });
}

// Glutspeer in Richtung a (32 Richtungen): Flammenmantel, Obsidianschaft mit Glutader, breite glühende Spitze
export function spearFrame(a, len = 22, hot = false) {
  const q = Math.round(((a % TAU) + TAU) % TAU / TAU * 32) % 32;
  return cached(`spear:${q}:${len}:${hot}`, () => {
    const A = q / 32 * TAU, ux = Math.cos(A), uy = Math.sin(A);
    const S = len + 10, P = hot ? PAL.white : PAL.fire;
    return frame(S * 2, S * 2, S, S, (p) => {
      const at = (s, k) => [S + ux * s - uy * k, S + uy * s + ux * k];
      // Flammenmantel: umhüllt den Schaft, zieht nach hinten als Schweif aus
      p.each(0, 0, S * 2, S * 2, (x, y) => {
        const X = x - S, Y = y - S, al = X * ux + Y * uy, pe = -X * uy + Y * ux;
        const b = len * 0.42 - al;                                   // Abstand hinter der Spitze
        if (b < 0 || b > len + 8) return null;
        const hw = 3.4 * Math.min(1, b / 5) * Math.max(0, 1 - Math.max(0, b - len * 0.6) / (len * 0.4 + 8)) + 0.3;
        const d = Math.abs(pe + Math.sin(b * 0.8) * 0.5 * (b / len)) / hw;
        return d < 1 ? band(P, (1 - d) * (1.1 - b / (len + 10)) * 1.15) : null;
      });
      bar(p, ...at(-len * 0.5, 0), ...at(len * 0.22, 0), 3, 2.6, OBS, { line: 0.5 });
      hair(p, ...at(-len * 0.42, 0.3), ...at(len * 0.18, 0.3), hot ? '#ffe08a' : '#ffa83a');
      // Parierflügel und Spitze
      for (const k of [-1, 1]) gem(p, ...at(len * 0.2, k * 1.2), ...at(len * 0.04, k * 3.6), 2.2, OBS);
      gem(p, ...at(len * 0.14, 0), ...at(len * 0.52, 0), 5.2, ['#3a1004', '#a8300a', '#e8601a', '#ffa83a', '#ffe08a', '#fffbe8']);
      hair(p, ...at(len * 0.22, 0), ...at(len * 0.46, 0), '#fffbe8');
    });
  });
}

// Runenkreis (gold) als Bodenellipse: Doppelring mit Glyphen
export function runeRing(r, pal = 'gold') {
  return cached(`rune:${r}:${pal}`, () => {
    const P = PAL[pal], W = r * 2 + 8, H = r * 1.2 + 8;
    return frame(W, H, W / 2, H / 2, (p) => {
      const cx = W / 2, cy = H / 2;
      p.each(0, 0, W, H, (x, y) => {
        const d = Math.hypot(x - cx, (y - cy) / 0.6);
        const o = Math.abs(d - r), i = Math.abs(d - (r - 4));
        if (o < 0.7) return P[4];
        if (o < 1.3) return P[2];
        if (i < 0.6) return P[3];
        return null;
      });
      for (let j = 0; j < 12; j++) {
        const a = j / 12 * TAU, rr = r - 2, gx = cx + Math.cos(a) * rr, gy = cy + Math.sin(a) * rr * 0.6;
        const g = j % 3;
        if (g === 0) { hair(p, gx - 0.8, gy, gx + 0.8, gy, P[5]); hair(p, gx, gy - 0.6, gx, gy + 0.6, P[5]); }
        else if (g === 1) { hair(p, gx - 0.8, gy + 0.5, gx, gy - 0.6, P[4]); hair(p, gx, gy - 0.6, gx + 0.8, gy + 0.5, P[4]); }
        else dotp(p, gx, gy, P[5]);
      }
    });
  });
}

// Glutriss entlang einer Punktliste (Weltkoordinaten): zackige Spalte mit glühendem Kern, gebrochenem Rand.
// Ergibt { frame, x0, y0 } (Frame mit Anker 0/0, gezeichnet an x0/y0). open = 0..1 (Länge), hot = Warnglühen
export function crackFrame(points, seed = 0, hot = false, pal = 'fire') {
  const P = PAL[pal];
  const xs = points.map((q) => q.x), ys = points.map((q) => q.y);
  const x0 = Math.floor(Math.min(...xs)) - 6, y0 = Math.floor(Math.min(...ys)) - 6, x1 = Math.ceil(Math.max(...xs)) + 6, y1 = Math.ceil(Math.max(...ys)) + 6;
  // gezackte Mittellinie
  const line = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.ceil(L / 3));
    for (let s = 0; s < n; s++) {
      const k = s / n, j = (hash2(i * 31 + s, seed, 13) - 0.5) * 2.4;
      const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      line.push([a.x + (b.x - a.x) * k + nx * j - x0, a.y + (b.y - a.y) * k + ny * j * 0.6 - y0]);
    }
  }
  const last = points[points.length - 1]; line.push([last.x - x0, last.y - y0]);
  // Abstandsfeld nur in der Nähe jedes Teilstücks berechnen (statt jedes Pixel gegen alle Stücke)
  const r = fineRes(), BW = Math.ceil((x1 - x0) * r) + 2, BH = Math.ceil((y1 - y0) * r) + 2;
  const D = new Float32Array(BW * BH).fill(1e9), T = new Float32Array(BW * BH);
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const F0 = Math.max(0, Math.floor((Math.min(ax, bx) - 4) * r)), F1 = Math.min(BW - 1, Math.ceil((Math.max(ax, bx) + 4) * r));
    const G0 = Math.max(0, Math.floor((Math.min(ay, by) - 4) * r)), G1 = Math.min(BH - 1, Math.ceil((Math.max(ay, by) + 4) * r));
    for (let G = G0; G <= G1; G++) for (let F = F0; F <= F1; F++) {
      const x = (F + 0.5) / r, y = (G + 0.5) / r;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(x - ax - dx * t, (y - ay - dy * t) / 0.75), j = G * BW + F;
      if (d < D[j]) { D[j] = d; T[j] = i + t; }
    }
  }
  const f = frame(x1 - x0, y1 - y0, 0, 0, (p) => {
    p.each(0, 0, x1 - x0, y1 - y0, (x, y) => {
      const j = Math.min(BH - 1, Math.floor(y * r)) * BW + Math.min(BW - 1, Math.floor(x * r)), best = D[j], bt = T[j];
      if (best > 4) return null;
      const w = 1.3 + Math.sin(bt * 1.7 + seed) * 0.5;
      if (best < w * 0.4) return hot ? P[5] : P[4];
      if (best < w * 0.75) return hot ? P[4] : P[3];
      if (best < w) return P[2];
      if (best < w + 0.8) return pal === 'fire' ? '#7a2208' : P[1];
      if (best < w + 1.6 && hash2(Math.floor(x * 2), Math.floor(y * 2), seed + 3) < 0.55) return '#2a1410';   // Bruchkante
      return null;
    });
  });
  return { frame: f, x0, y0 };
}

// Glanzstern (Klinge, Speerspitze): vier lange Strahlen, Rautenkern; r = Strahlenlänge
export function starFrame(r, pal = 'white') {
  r = Math.max(2, Math.round(r));
  return cached(`star:${r}:${pal}`, () => {
    const P = PAL[pal], S = r + 2;
    return frame(S * 2, S * 2, S, S, (p) => p.each(0, 0, S * 2, S * 2, (x, y) => {
      const X = Math.abs(x - S), Y = Math.abs(y - S);
      const c0 = (v) => Math.max(0, v), w0 = 0.9 + r * 0.08;
      const ray = Math.max(c0(1 - X / r) * c0(1 - Y / w0), c0(1 - Y / r) * c0(1 - X / w0));
      const core = c0(1 - (X + Y) / (1.6 + r * 0.22));
      const diag = Math.abs(X - Y) < 0.5 && X + Y < r * 0.7 ? (1 - (X + Y) / (r * 0.7)) * 0.7 : 0;
      const v = Math.max(ray * 1.25, core * 1.5, diag);
      return v < 0.17 ? null : band(P, v);
    }));
  });
}

// Lichtsäule (Schleife): Bündel senkrechter Lichtstrahlen, die einzeln auf- und abschwellen; nur helle Stufen,
// damit sie halbdurchsichtig nicht schlammig wirkt. Anker unten mittig
export function beamLoop(w, h, pal = 'gold', n = 6) {
  return cached(`beam:${w}:${h}:${pal}:${n}`, () => {
    const P = PAL[pal], W = w + 2, H = h + 2, out = [];
    for (let i = 0; i < n; i++) {
      const ph = i / n * TAU;
      out.push(frame(W, H, W / 2, H - 1, (p) => p.each(0, 0, W, H, (x, y) => {
        const X = x - W / 2, Y = H - 1 - y, e = Math.abs(X) / (w / 2);
        if (e >= 1 || Y < 0) return null;
        const col = Math.floor(X + 64);
        const top = h * (0.45 + 0.35 * hash2(col, 1, 77) + 0.2 * Math.sin(ph + col * 1.7)) * (1 - e * 0.45);
        if (Y > top) return null;
        const u = Y / top;
        if (col % 2 && e > 0.3 && u > 0.5) return null;                   // Lücken zwischen den Strahlen oben
        if (Math.sin(Y * 0.3 - ph * 3 + col) > 0.93) return P[5];         // aufsteigende Lichtfunken
        return e < 0.25 ? (u < 0.7 ? P[5] : P[4]) : e < 0.6 ? (u < 0.6 ? P[4] : P[3]) : u < 0.4 ? P[3] : null;
      })));
    }
    return out;
  });
}

// Flammenstrahl (keine Schleife) in Bildrichtung a: schießt bis len heraus, reißt vom Ursprung ab und verweht
export function jetSeq(a, len, pal = 'fire', n = 6) {
  const q = Math.round(((a % TAU) + TAU) % TAU / TAU * 32) % 32;
  len = Math.round(len / 4) * 4;
  return cached(`jet:${q}:${len}:${pal}:${n}`, () => {
    const P = PAL[pal], A = q / 32 * TAU, ux = Math.cos(A), uy = Math.sin(A), S = len + 10, out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), head = len * Math.min(1, 0.35 + k * 1.6), tail = len * Math.max(0, (k - 0.45) * 1.5), fade = k > 0.55 ? 1 - (k - 0.55) * 1.6 : 1;
      // nur das gedrehte Rechteck um den Strahl abtasten
      const bx = [tail - 1, head + 3].flatMap((a) => [-9, 9].map((k) => S + ux * a - uy * k)), by = [tail - 1, head + 3].flatMap((a) => [-9, 9].map((k) => S + uy * a + ux * k));
      out.push(frame(S * 2, S * 2, S, S, (p) => p.each(Math.max(0, Math.min(...bx)), Math.max(0, Math.min(...by)), Math.min(S * 2, Math.max(...bx)), Math.min(S * 2, Math.max(...by)), (x, y) => {
        const X = x - S, Y = y - S, al = X * ux + Y * uy, pe = -X * uy + Y * ux;
        if (al < tail - 1 || al > head + 3) return null;
        const f = al / len, hw = (2.2 + f * 6) * (0.85 + 0.2 * Math.sin(al * 0.7 - k * 9)) * (al > head - 4 ? Math.max(0.2, (head + 3 - al) / 7) : 1);
        const d = Math.abs(pe + Math.sin(al * 0.45 + k * 6) * f * 1.4) / hw;
        if (d >= 1) return null;
        const n2 = Math.sin(al * 0.9 - k * 14 + pe) * 0.08;
        return band(P, ((1 - d) * (1.15 - f * 0.45) + n2) * fade + (al < tail + 3 ? -0.25 : 0));
      })));
    }
    return out;
  });
}

// Glutbett (Bodenellipse r × 0,6r): Kohlebrocken mit glühenden Fugen, ausgefranster Rand
export function coalBed(r, seed = 0) {
  return cached(`coal:${r}:${seed}`, () => {
    const W = r * 2 + 4, H = r * 1.2 + 4, cx = W / 2, cy = H / 2;
    const cell = (i, j) => [i * 5 + hash2(i, j, seed + 1) * 3.6, j * 3.4 + hash2(i, j, seed + 2) * 2.4];
    return frame(W, H, cx, cy, (p) => p.each(0, 0, W, H, (x, y) => {
      const X = x - cx, Y = y - cy, e = Math.hypot(X / r, Y / (r * 0.6));
      if (e > 1 || (e > 0.78 && hash2(Math.floor(x * 1.2), Math.floor(y * 1.2), seed + 7) < (e - 0.78) * 4.5)) return null;
      const gi = Math.floor(X / 5), gj = Math.floor(Y / 3.4);
      let d1 = 1e9, d2 = 1e9, best = null;
      for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) {
        const [px, py] = cell(i, j), d = Math.hypot(X - px, (Y - py) * 1.3);
        if (d < d1) { d2 = d1; d1 = d; best = [px, py]; } else if (d < d2) d2 = d;
      }
      const gap = d2 - d1, heat = 1 - e;
      if (gap < 0.5) return heat > 0.45 ? '#ffe08a' : heat > 0.2 ? '#ffa83a' : '#e8601a';
      if (gap < 1.1) return heat > 0.3 ? '#e8601a' : '#a8300a';
      const lx = (X - best[0]) * -0.6 + (Y - best[1]) * -0.8;
      return lx > 0.6 ? OBS[5] : lx > -0.2 ? OBS[3] : OBS[2];
    }));
  });
}

// Feuer-/Dampfballen, der altert (keine Schleife, k = Alter 0..1): heller, praller Kern → kühler, größer, zerfasert.
// Baustein für Atemkegel und Ströme: viele Ballen nacheinander ausgestoßen. Anker in der Mitte
export function puffSeq(r, pal = 'fire', n = 8) {
  return cached(`puff:${r}:${pal}:${n}`, () => {
    const P = PAL[pal], S = Math.ceil(r * 1.5) + 3, out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), R = r * (0.7 + 0.6 * k), heat = 1.2 - k * 0.85;
      out.push(frame(S * 2, S * 2, S, S, (p) => p.each(0, 0, S * 2, S * 2, (x, y) => {
        const X = x - S, Y = y - S, a = Math.atan2(Y, X);
        const rr = R * (1 + Math.sin(a * 5 + r + k * 4) * 0.1 + Math.sin(a * 3 - k * 3) * 0.08 + (Y < 0 ? -Y / R * 0.12 : 0));
        const d = Math.hypot(X, Y) / rr;
        if (d >= 1) return null;
        if (k > 0.5 && d > 0.45 && hash2(Math.floor(x * 1.4), Math.floor(y * 1.4), r + i) < (k - 0.5) * 1.5 * d) return null;
        // Licht von oben links, heißer Kern leicht versetzt
        const l = (X * -0.5 + Y * -0.7) / rr * 0.18;
        return band(P, ((1 - d * d) * heat + l + 0.12) * 0.95);
      })));
    }
    return out;
  });
}

// Leuchtkugel mit Schweif in Bildrichtung a (16 Richtungen): Glanzkugel (Rand, Körper, Lichtfleck oben links),
// dahinter ein spitz zulaufender Schweif. Für Perlen, Sporen, Frostsplitter. Anker = Kugelmitte
export function orbFrame(a, r, pal = 'teal', tail = 3) {
  const q = Math.round(((a % TAU) + TAU) % TAU / TAU * 16) % 16;
  return cached(`orb:${q}:${r}:${pal}:${tail}`, () => {
    const P = PAL[pal], A = q / 16 * TAU, ux = Math.cos(A), uy = Math.sin(A), L = r * tail, S = Math.ceil(L + r + 3);
    return frame(S * 2, S * 2, S, S, (p) => p.each(0, 0, S * 2, S * 2, (x, y) => {
      const X = x - S, Y = y - S, d = Math.hypot(X, Y) / r;
      if (d < 1) {
        if (d > 0.82) return P[1];
        const l = (X * -0.6 + Y * -0.8) / r;
        if (l > 0.35 && d < 0.6) return P[5];
        return l > 0.05 ? P[4] : l > -0.45 ? P[3] : P[2];
      }
      const al = -(X * ux + Y * uy), pe = Math.abs(-X * uy + Y * ux);
      if (al <= 0 || al > L) return null;
      const hw = r * 0.85 * (1 - al / L);
      if (pe >= hw) return null;
      return band(P, (1 - pe / hw) * (1 - al / L) * 0.95 + 0.1);
    }));
  });
}

// Wasserwall-Stück (Schleife): Hügel aus Wasser mit Glanzlinien und Schaumkrone, Gischt über dem Kamm.
// Viele nebeneinander ergeben eine Welle. Anker unten mittig
export function waveLoop(w, h, pal = 'water', n = 6) {
  return cached(`wave:${w}:${h}:${pal}:${n}`, () => {
    const P = PAL[pal], W = w + 4, H = h + 6, out = [];
    for (let i = 0; i < n; i++) {
      const ph = i / n * TAU;
      out.push(frame(W, H, W / 2, H - 1, (p) => {
        p.each(0, 0, W, H, (x, y) => {
          const X = x - W / 2, Y = H - 1 - y, e = Math.abs(X) / (w / 2);
          if (e >= 1) return null;
          const top = h * Math.pow(1 - e ** 4, 0.5) * (0.9 + 0.1 * Math.sin(X * 0.7 + ph));
          if (Y > top || Y < 0) return null;
          if (Y > top - 1.6) return Math.sin(X * 2.3 + ph * 2) > -0.3 ? P[5] : P[4];          // Schaumkrone
          if (Y > top - 3) return P[4];
          const u = Y / top;
          if (Math.abs(Math.sin(Y * 0.7 - X * 0.25 + ph)) < 0.12 && u > 0.25) return P[4];   // Glanzlinien
          return u > 0.6 ? P[3] : u > 0.25 ? P[2] : P[1];
        });
        // Gischt über dem Kamm
        for (let j = 0; j < 4; j++) {
          const sx = W / 2 + (hash2(j, i, 31) - 0.5) * w * 0.8, sy = H - 1 - h - 1.5 - hash2(j, i, 37) * 3.5;
          dotp(p, sx, sy, j % 2 ? P[5] : P[4]);
        }
      }));
    }
    return out;
  });
}

// Strudel (Schleife, dreht sich): Spiralarme mit Schaumkante um ein dunkles Auge, Bodenellipse r × 0,6r
export function whirlLoop(r, pal = 'teal', n = 8) {
  return cached(`whirl:${r}:${pal}:${n}`, () => {
    const P = PAL[pal], W = r * 2 + 4, H = r * 1.2 + 4, out = [];
    for (let i = 0; i < n; i++) {
      const rot = i / n * TAU / 3;      // drei Arme → nach 1/3 Umdrehung deckungsgleich
      out.push(frame(W, H, W / 2, H / 2, (p) => p.each(0, 0, W, H, (x, y) => {
        const X = x - W / 2, Y = (y - H / 2) / 0.6, d = Math.hypot(X, Y) / r;
        if (d >= 1) return null;
        if (d < 0.14) return P[0];
        const a = Math.atan2(Y, X) + rot, sp = (a + d * 4.4) * 3 / TAU;
        const f = sp - Math.floor(sp);                     // Lage im Arm 0..1
        const arm = Math.abs(f - 0.5) * 2;                 // 0 = Armmitte
        const fade = 1 - d;
        if (arm < 0.16) return fade > 0.35 ? P[5] : P[4];
        if (arm < 0.4) return fade > 0.2 ? P[3] : P[2];
        if (arm < 0.6 && d < 0.8) return P[1];
        return d < 0.5 ? P[0] : null;
      })));
    }
    return out;
  });
}

// Fontäne (keine Schleife): Wassersäule schießt hoch, oben bricht eine Krone aus Tropfen auf, die im Bogen
// nach außen fallen; Spritzring am Boden. Anker unten mittig
export function fountainSeq(w, h, pal = 'water', n = 8) {
  return cached(`fount:${w}:${h}:${pal}:${n}`, () => {
    const P = PAL[pal], W = w * 4 + 8, H = h + 12, out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), grow = Math.sin(Math.min(1, k * 2.4) * Math.PI / 2), sink = Math.max(0, (k - 0.45) / 0.55);
      const hh = h * grow * (1 - sink * 0.85), ww = w * (1 - sink * 0.5);
      out.push(frame(W, H, W / 2, H - 2, (p) => {
        // Säule mit gezacktem, schäumendem Kopf
        p.each(0, 0, W, H, (x, y) => {
          const X = x - W / 2, Y = H - 2 - y, hw = (ww / 2) * (0.7 + 0.3 * Math.min(1, Y / Math.max(1, hh)));
          const top = hh * (0.92 + 0.08 * Math.sin(X * 1.6 + k * 7));
          if (Y < 0 || Y > top || Math.abs(X) >= hw) return null;
          if (Y > top - 2) return P[5];
          if (Math.abs(X - Math.sin(Y * 0.45 + k * 6) * hw * 0.35) < 0.55) return P[5];   // Glanzfaden
          const e = Math.abs(X) / hw;
          return e < 0.35 ? P[4] : e < 0.75 ? P[3] : P[2];
        });
        // Krone: Tropfen im Bogen nach außen
        const q = Math.max(0, k - 0.12) * 1.3, tx = W / 2, ty = H - 2 - h * Math.min(1, grow);
        for (let j = 0; j < 10; j++) {
          const v = ((j + 0.5) / 10 - 0.5) * 2, vx = v * w * 1.2, vy = (1 - Math.abs(v) * 0.6) * h * 0.55;
          const dx = vx * q, dy = -vy * q + h * 1.3 * q * q;
          if (q <= 0 || ty + dy > H - 3) continue;
          const sz = j % 3 ? 0.9 : 1.3;
          orb(p, tx + dx, ty + dy, sz, sz * 1.2, P, { line: false });
          dotp(p, tx + dx - 0.3, ty + dy - 0.4, P[5]);
        }
        // Spritzring am Boden
        p.each(0, H - 7, W, H, (x, y) => {
          const X = x - W / 2, Y = (y - (H - 2)) / 0.6, d = Math.hypot(X, Y), R = ww * 0.7 + k * w * 1.3;
          return Math.abs(d - R) < 0.8 * (1 - k * 0.5) ? (Y < 0 ? P[3] : P[4]) : null;
        });
      }));
    }
    return out;
  });
}

// Fallstreifen (senkrecht, spitz nach oben auslaufend). Anker unten mittig
export function streakFrame(len, w = 2, pal = 'frost') {
  return cached(`streak:${len}:${w}:${pal}`, () => {
    const P = PAL[pal], W = w + 2, H = len + 1;
    return frame(W, H, W / 2, H - 1, (p) => p.each(0, 0, W, H, (x, y) => {
      const X = Math.abs(x - W / 2), u = (H - 1 - y) / len, hw = (w / 2) * (1 - u * 0.8);
      if (u < 0 || u > 1 || X >= hw) return null;
      return band(P, (1 - X / hw) * (1 - u) * 1.1 + 0.15);
    }));
  });
}

// Reiffeld (Bodenellipse r × 0,6r): Eisplatten mit hellen Bruchfugen, Lichtkante oben links,
// dunkler Rand und heller Saum
export function rimeBed(r, seed = 0) {
  return cached(`rime:${r}:${seed}`, () => {
    const P = PAL.frost, W = r * 2 + 4, H = r * 1.2 + 4, cx = W / 2, cy = H / 2;
    const cell = (i, j) => [i * 7 + hash2(i, j, seed + 1) * 5, j * 4.6 + hash2(i, j, seed + 2) * 3.2];
    return frame(W, H, cx, cy, (p) => p.each(0, 0, W, H, (x, y) => {
      const X = x - cx, Y = y - cy, e = Math.hypot(X / r, Y / (r * 0.6));
      if (e > 1) return null;
      if (e > 0.94) return '#06080e';
      if (e > 0.88) return P[4];
      const gi = Math.floor(X / 7), gj = Math.floor(Y / 4.6);
      let d1 = 1e9, d2 = 1e9, best = null;
      for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) {
        const [px, py] = cell(i, j), d = Math.hypot(X - px, (Y - py) * 1.4);
        if (d < d1) { d2 = d1; d1 = d; best = [px, py]; } else if (d < d2) d2 = d;
      }
      const gap = d2 - d1;
      if (gap < 0.55) return P[4];
      const l = ((X - best[0]) * -0.6 + (Y - best[1]) * -0.8) / 3;
      if (gap < 1.2 && l > 0) return P[3];
      return l > 0.5 ? P[3] : l > -0.3 ? P[2] : P[1];
    }));
  });
}

// Sternförmiger Bodenriss: n zackige Strahlen der Länge L aus einem Punkt (Bodenebene, y × 0,5). Anker = Mitte
export function radialCrack(L, n = 5, pal = 'ghost', seed = 0) {
  L = Math.max(2, Math.round(L));
  return cached(`rcrack:${L}:${n}:${pal}:${seed}`, () => {
    const P = PAL[pal], S = L + 3, rays = [];
    for (let i = 0; i < n; i++) {
      const a = i * (TAU / n) + 0.3 + (hash2(i, seed, 3) - 0.5) * 0.6, pts = [[S, S]];
      for (let j = 1; j <= 3; j++) {
        const r = L * j / 3, aa = a + (hash2(i, j + seed, 5) - 0.5) * 0.5;
        pts.push([S + Math.cos(aa) * r, S + Math.sin(aa) * r * 0.5]);
      }
      rays.push(pts);
    }
    return frame(S * 2, S * 2, S, S, (p) => p.each(0, 0, S * 2, S * 2, (x, y) => {
      let best = 1e9, along = 0;
      for (const pts of rays) for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
        if (d < best) { best = d; along = (i + t) / (pts.length - 1); }
      }
      const w = 1.1 * (1 - along * 0.6) + 0.3;
      if (best < w * 0.45) return along < 0.4 ? P[5] : P[4];
      if (best < w) return P[3];
      if (best < w + 0.7) return P[1];
      return null;
    }));
  });
}

// ---------------------------------------------------------------- Aasmutter (Gift, Chitin)
const CHIT = ['#07040c', '#140c1e', '#22142e', '#321e42', '#46295a', '#5e3876', '#7e4e96'];
const BONE = ['#1a1a1c', '#4a4850', '#9a9496', '#c6bebc', '#ece4de'];
const SLIME = ['#06080e', '#0a1420', '#10202e', '#183444', '#24485a'];

// Weiches Wertrauschen (für organische Flecken)
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Schimmelbett (Bodenellipse r × 0,6r): dunkler Schleim mit leuchtenden Schimmelflecken (heller Kern, Saum),
// Sporenpunkte, ausgefranster Rand mit dunkler Kante. Anker = Mitte
export function moldBed(r, seed = 0, pal = 'poison') {
  r = Math.max(4, Math.round(r));
  return cached(`mold:${r}:${seed}:${pal}`, () => {
    const P = PAL[pal], W = r * 2 + 4, H = r * 1.2 + 4, cx = W / 2, cy = H / 2;
    return frame(W, H, cx, cy, (p) => p.each(0, 0, W, H, (x, y) => {
      const X = x - cx, Y = y - cy, e = Math.hypot(X / r, Y / (r * 0.6));
      const ragged = 0.84 + vnoise(Math.atan2(Y, X) * 3 + 10, seed, seed + 11) * 0.16;
      if (e > ragged) return null;
      if (e > ragged - 0.07) return SLIME[0];
      const n = vnoise(x * 0.16, y * 0.26, seed + 3) * 0.65 + vnoise(x * 0.42, y * 0.6, seed + 5) * 0.35 - e * 0.18;
      if (n > 0.63) return n > 0.7 ? P[3] : P[2];
      if (n > 0.58) return P[1];
      if (hash2(Math.floor(x * 1.6), Math.floor(y * 1.6), seed + 9) > 0.965) return P[4];
      const g = vnoise((x - 0.6) * 0.42, (y - 0.6) * 0.6, seed + 5) - vnoise(x * 0.42, y * 0.6, seed + 5);
      return g > 0.04 ? SLIME[4] : g > -0.03 ? SLIME[3] : SLIME[2];
    }));
  });
}

// Chitinglied, quer zur Bildrichtung a (16 Richtungen): gewölbte Platte, Licht von links oben, leuchtende Fuge
// am Hinterrand, bleicher Dorn auf dem Rücken. r = halbe Breite. Anker = Mitte
export function plateFrame(a, r, pal = 'poison') {
  const q = Math.round(((a % TAU) + TAU) % TAU / TAU * 16) % 16;
  r = Math.max(2, Math.round(r));
  return cached(`plate:${q}:${r}:${pal}`, () => {
    const P = PAL[pal], A = q / 16 * TAU, ux = Math.cos(A), uy = Math.sin(A), S = r + 5;
    return frame(S * 2, S * 2, S, S, (p) => {
      p.each(0, 0, S * 2, S * 2, (x, y) => {
        const X = x - S, Y = y - S, al = X * ux + Y * uy, pe = -X * uy + Y * ux;
        const u = al / (r * 0.62), v = pe / r, d = u * u + v * v;
        if (d >= 1) return null;
        if (d > 0.8) return al < 0 ? P[2] : CHIT[0];               // Hinterrand leuchtet, sonst Kontur
        const nz = Math.sqrt(1 - d), l = (u * ux * -0.5 + v * -uy * -0.5) * 0 + (-(X / r) * 0.5 - (Y / r) * 0.62 + nz * 0.6);
        const k = Math.max(1, Math.min(6, Math.floor((0.2 + l * 0.8) * 6)));
        return CHIT[k];
      });
      // Dorn auf der Oberkante (zeigt nach hinten oben)
      const bx = S - uy * -r * 0.85, by = S + ux * -r * 0.85;
      for (let t = 0; t <= 1; t += 0.12) {
        const x = bx + (-ux * 3 - uy * -2.5) * t, y = by + (-uy * 3 + ux * -2.5) * t;
        p.each(x - 1, y - 1, x + 1, y + 1, (xx, yy) => (Math.hypot(xx - x, yy - y) < 1.1 * (1 - t) + 0.3 ? (t > 0.5 ? BONE[3] : BONE[1]) : undefined));
      }
    });
  });
}

// Giftstachel aus dem Boden: Chitinschaft, links Licht, leuchtende Ader, bleiche Spitze. Anker = Fußmitte
export function thornFrame(h, w, lean = 0, pal = 'poison') {
  h = Math.max(4, Math.round(h)); w = Math.max(2, Math.round(w * 2) / 2); lean = Math.round(lean * 10) / 10;
  return cached(`thorn:${h}:${w}:${lean}:${pal}`, () => {
    const P = PAL[pal], W = w * 2 + Math.abs(lean) * h + 6, cx = W / 2 - lean * h / 2, H = h + 3;
    return frame(W, H, cx, h + 1, (p) => p.each(0, 0, W, H, (x, y) => {
      const yy = h + 1 - y, f = yy / h;
      if (f < 0 || f > 1) return null;
      const x0 = cx + lean * yy + Math.sin(f * 4 + h) * 0.5, hw = w * Math.pow(1 - f, 0.8) + 0.35, e = (x - x0) / hw;
      if (Math.abs(e) >= 1) return null;
      if (f > 0.8) return e < 0 ? BONE[4] : BONE[2];
      if (Math.abs(e) > 0.82) return CHIT[0];
      if (Math.abs(e + 0.15) < 0.16 && f < 0.7 && f > 0.08) return f < 0.4 ? P[3] : P[2];
      // Ringe (Glieder) quer über den Schaft
      if (((yy + h) % 5) < 0.6 && f < 0.75) return CHIT[1];
      return e < -0.35 ? CHIT[6] : e < 0.1 ? CHIT[5] : e < 0.5 ? CHIT[3] : CHIT[2];
    }));
  });
}

// Vorwärmen: erzeugt die Folgen eines Bosses in Leerlaufzeit, eine nach der anderen, damit der erste Angriff
// nicht ruckelt. fns = Liste von () => FX.xyz(...)
export function prewarm(fns) {
  const list = fns.slice();
  const idle = typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb, { timeout: 500 }) : (cb) => setTimeout(cb, 16);
  const next = () => { const fn = list.shift(); if (!fn) return; try { fn(); } catch { /* nur Optik */ } idle(next); };
  idle(next);
}

// Hilfsfunktion: Frame einer Folge zu Zeit t (Sekunden) bei fps; loop = Schleife, sonst letzter Frame bleibt
export function seqAt(seq, t, fps, loop = true) {
  const i = Math.floor(t * fps);
  return seq[loop ? ((i % seq.length) + seq.length) % seq.length : Math.max(0, Math.min(seq.length - 1, i))];
}
