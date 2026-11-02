import { buildFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Weltereignis „Sternenfall“ (world/starfall.js): Einschlagkrater und Sternenherz (der gefallene Stern).
//   crater         flacher Krater mit verglastem Rand und glimmenden Rissen (glow)
//   heart[0..3]    Sternenherz schwebend, leicht versetzt (Bob über 4 Frames), glow = Kern und Kanten
//   heartOpen      aufgebrochen: Hülle gespalten, Kern liegt frei und kann genommen werden
//   heartSpent     geleert: matte Splitter im Krater
// Anker = Fußpunkt (Kratermitte bzw. Boden unter dem Herz). Feinraster wie sprites/caravan.js.

const ROCK = ['#120e1a', '#1e1828', '#2c2438', '#3e3450', '#56496a', '#76688c'];
const GLASS = ['#1a1238', '#2e2060', '#4a3696', '#7058c8', '#a48ae8', '#d8ccff', '#ffffff'];
const CORE = ['#8a5a1a', '#d8a440', '#f6d888', '#fff6d8', '#ffffff'];
const VOIDC = ['#3a1060', '#7a3ac8', '#b070ff', '#e8c8ff'];

function frame(W, H, ax, ay, draw) {
  const res = fineRes(), b = 1 / res;
  const gl = new FineCanvas(W + 2 * b, H + 2 * b, res);
  gl.translate(b, b);
  let used = false;
  const g = {
    dot: (x, y, c) => { used = true; gl.dot(x, y, c); },
    line: (x0, y0, x1, y1, c) => { used = true; gl.fline(x0, y0, x1, y1, c); },
    ellipse: (x, y, rx, ry, c) => { used = true; gl.ellipse(x, y, rx, ry, c); },
  };
  const f = buildFrame(W, H, ax, ay, (p) => draw(p, g), { fine: true, res });
  if (used) f.glowCanvas = gl.canvas;
  return f;
}

const ell = (p, cx, cy, rx, ry, c) => { if (p.fine) p.ellipse(cx, cy, rx, ry, c); else p.ellipse?.(cx, cy, rx, ry, c); };

function crater() {
  const W = 64, H = 26, ax = 32, ay = 15;
  return frame(W, H, ax, ay, (p, g) => {
    const cx = 32, cy = 13;
    // aufgeworfener Rand: Brocken, oben hell (Licht von links oben)
    ell(p, cx, cy, 30, 11.5, ROCK[2]);
    ell(p, cx, cy - 0.5, 28, 10, ROCK[3]);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + hash2(i, 1, 801) * 0.2, r = 1 + hash2(i, 2, 801) * 0.12;
      const x = cx + Math.cos(a) * 27 * r, y = cy + Math.sin(a) * 9.5 * r;
      const s = 1.4 + hash2(i, 3, 801) * 1.3;
      ell(p, x, y, s * 1.3, s, Math.sin(a) < 0 ? ROCK[4] : ROCK[2]);
      p.dot(x - s * 0.6, y - s * 0.6, Math.sin(a) < 0 ? ROCK[5] : ROCK[3]);
    }
    // Mulde: verglaster, dunkler Boden
    ell(p, cx, cy + 0.5, 23, 7.5, ROCK[1]);
    ell(p, cx, cy + 1, 20, 6, GLASS[0]);
    ell(p, cx + 1, cy + 1.5, 15, 4.2, GLASS[1]);
    // Glasschmelze: Glanzstreifen auf der Lichtseite
    for (let i = 0; i < 18; i++) p.dot(cx - 14 + i * 0.9, cy - 2.5 + Math.sin(i * 0.5) * 0.4, i % 3 ? GLASS[2] : GLASS[3]);
    // Risse strahlen aus der Mitte, glimmen violett-gold
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.3, L = 13 + hash2(k, 4, 802) * 12;
      let x = cx, y = cy + 1;
      for (let s = 0; s < L; s += 0.5) {
        const w = Math.sin(s * 0.7 + k) * 0.35;
        x = cx + Math.cos(a + w * 0.2) * s; y = cy + 1 + Math.sin(a + w * 0.2) * s * 0.36;
        const c = s < L * 0.4 ? CORE[1] : VOIDC[1];
        p.dot(x, y, s < L * 0.25 ? CORE[2] : c);
        if (s < L * 0.7) g.dot(x, y, s < L * 0.3 ? CORE[3] : VOIDC[2]);
      }
    }
    // Glutkern in der Mitte
    ell(p, cx, cy + 1, 4, 1.6, CORE[1]); ell(p, cx, cy + 0.8, 2.4, 1, CORE[3]);
    g.ellipse(cx, cy + 1, 5, 2, CORE[2]); g.ellipse(cx, cy + 0.8, 2.6, 1, CORE[4]);
  });
}

// Sternenherz: achtkantiger Kristall, violette Hülle, goldener Kern. bob = Höhe über dem Boden.
function heart(bob, state = 'whole', t = 0) {
  const W = 30, H = 46, ax = 15, ay = 44;
  return frame(W, H, ax, ay, (p, g) => {
    const cx = 15, base = 44 - 8 - bob, top = base - 24;
    // Schatten wird von der Welt gezeichnet; hier nur der Kristall
    if (state === 'spent') {
      for (const [x, y, h, a] of [[9, 41, 5, -0.5], [14, 42, 7, 0.1], [20, 41, 5, 0.6], [17, 43, 3, 1]]) {
        for (let s = 0; s < h; s += 0.5) { p.dot(x + a * s * 0.5, y - s, s > h - 1 ? GLASS[4] : GLASS[2]); p.dot(x + a * s * 0.5 + 0.5, y - s, GLASS[1]); }
      }
      return;
    }
    const open = state === 'open' ? 1 : 0;
    const half = (side) => {
      const off = open * side * 3.5, tilt = open * side * 0.12;
      for (let y = 0; y <= 24; y += 0.5) {
        const f = y / 24;                                   // 0 oben … 1 unten
        const w = f < 0.35 ? 1 + f / 0.35 * 7 : 8 - (f - 0.35) / 0.65 * 6.5;
        const yy = top + y + Math.abs(off) * 0.2;
        for (let x = 0; x <= w; x += 0.5) {
          const X = cx + side * (x + 0.25) + off + (yy - base) * tilt;
          const edge = x > w - 0.6, ridge = x < 0.6;
          const lit = side < 0;
          const c = edge ? GLASS[lit ? 5 : 1] : ridge && !open ? GLASS[6] : f < 0.35 ? GLASS[lit ? 5 : 3] : GLASS[lit ? 4 : 2];
          p.dot(X, yy, c);
          if (!open && (ridge || (edge && lit))) g.dot(X, yy, ridge ? GLASS[5] : GLASS[4]);
        }
      }
    };
    half(-1); half(1);
    // Facettenlinien
    if (!open) {
      p.fline(cx - 8, top + 8.4, cx + 8, top + 8.4, GLASS[5]);
      for (let k = -1; k <= 1; k += 2) p.fline(cx + k * 3.5, top + 2, cx + k * 4, top + 20, GLASS[3]);
    }
    // Kern: im ganzen Herz durchscheinend, offen frei und hell
    const ky = top + 10.5;
    if (open) {
      ell(p, cx, ky, 3.6, 4.2, CORE[1]); ell(p, cx - 0.6, ky - 0.8, 2.4, 2.8, CORE[2]); ell(p, cx - 1, ky - 1.4, 1.2, 1.3, CORE[4]);
      g.ellipse(cx, ky, 6, 6.5, CORE[2]); g.ellipse(cx, ky, 3.5, 4, CORE[3]); g.ellipse(cx - 0.6, ky - 0.8, 2, 2.2, CORE[4]);
      // Funken um den Kern
      for (let i = 0; i < 6; i++) {
        const a = t + i * 1.05, x = cx + Math.cos(a) * 6.5, y = ky + Math.sin(a) * 4;
        p.dot(x, y, CORE[3]); g.dot(x, y, CORE[4]);
      }
    } else {
      ell(p, cx, ky, 2.2, 3, CORE[1]); ell(p, cx - 0.4, ky - 0.6, 1.3, 1.8, CORE[3]);
      g.ellipse(cx, ky, 4.5, 5.5, CORE[1]); g.ellipse(cx, ky, 2.4, 3, CORE[3]);
    }
  });
}

export function createStarfallSprites() {
  return {
    crater: crater(),
    heart: [0, 1, 2, 1].map((b) => heart(b)),
    heartOpen: [0, 1, 2, 3].map((i) => heart(1, 'open', i * 0.4)),
    heartSpent: heart(0, 'spent'),
  };
}
