import { SpriteFrame, Animation, lazyFrame as deferFrame } from '../gfx/Sprite.js';
import { fineRes, outlinePixels, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { Sculpt, ramp32 } from './sculpt.js';

// Mutter Fäulnis – Boss des Sporenschlunds (Stufe 32). „Aasmutter“.
//
// Ein riesiger, aufgerichteter Tausendfüßler: der hintere Leib liegt auf vielen gegliederten Beinen am Boden, der
// vordere bäumt sich hoch auf. Rückenplatten in Pflaumenviolett mit türkisem Rückleuchten, an den Plattenkanten
// Dornen, auf einzelnen Platten Konsolenpilze mit leuchtenden Lamellen. Am Bauch der aufgerichteten Glieder hängen
// leuchtende Gelege (die Brut). Breiter Kopfschild mit gelben Augenpunkten, rundes Zahnmaul mit glühendem Schlund,
// zwei große Giftklauen und lange Fühler.
//
// Gebaut mit dem 2,5D-Modellierer (sculpt.js) im Feinraster: Glieder sind quer gestellte Kapseln, Beine und Fühler
// Kapselketten, Kopf und Pilze gedrehte Ellipsoide. Die Pose ist ein Satz Zahlen (Kopflage, Bogen des Halses,
// Beinwelle, Maul, Klauen, Gelege …), Schlüsselposen werden weich interpoliert.
// Leucht-Ebenen: `glow` (türkis) und `glowEnraged` für Phase 3 (violett), Augen werden in Phase 3 magenta.
// Blickrichtung rechts, Anker = Bodenmitte unter dem Leib. Frames sind auf ihren Inhalt zugeschnitten.
//
// meta (relativ zum Anker): head (Kopfoberkante), eye, mouth (= cast, Schlund), hand (Spitze der vorderen Giftklaue),
// handB (Schwanzspitze), chest (Mitte des aufgerichteten Leibs), sac (größtes Gelege), core (Leibmitte am Knick).
// fx: 'roar' | 'impact' | 'cast'.
const W = 232, H = 172, AX = 104, AY = 162, GY = AY;
const TAU = Math.PI * 2;

const CHIT = ramp32(['#07040c', '#140c1e', '#22142e', '#321e42', '#46295a', '#5e3876', '#7e4e96']);
const LEG = ramp32(['#05060b', '#0c0f1a', '#151a2a', '#20283c', '#2e3852', '#42506c', '#64728e']);
const BONE = ramp32(['#0e0e12', '#2a2a30', '#4a4850', '#706c72', '#9a9496', '#c6bebc', '#ece4de']);
const CAP = ramp32(['#07051a', '#120d2c', '#1d1540', '#2a1f58', '#3c2c72', '#54408e', '#7862ae']);
const HUSK = ramp32(['#06080a', '#0e1618', '#16242a', '#203438', '#2c4448', '#3c5a5a']);
const TEETH = ramp32(['#1a1a1c', '#6a6662', '#b8b2a8', '#ece6da']);
const SHADOW = ramp32(['#020205', '#05060c']);
const RIM = ramp32(['#169e92', '#46d4c0']);                       // Rückleuchten (nicht Teil der Leuchtebene)
// Leuchtrampen: Phase 1–2 türkis, Phase 3 violett; Augen gelb → magenta
const GLH = ['#03201e', '#0a5a54', '#16a094', '#4ad8c4', '#a6fff0', '#ffffff'];
const RGH = ['#1e0326', '#5a0a6a', '#9a20b8', '#c86ae8', '#eebcff', '#ffffff'];
const YEH = ['#141404', '#3a3a06', '#7a780c', '#c2c018', '#eef060', '#fffff0'];
const MEH = ['#1a0414', '#4a0a3a', '#8a1a70', '#d03ca8', '#f6a0dc', '#fff0fa'];
const GL = ramp32(GLH), YE = ramp32(YEH);
const GLOWMAP = new Map();
GLH.forEach((c, i) => GLOWMAP.set(GL[i], [GL[i], ramp32([RGH[i]])[0]]));
YEH.forEach((c, i) => GLOWMAP.set(YE[i], [YE[i], ramp32([MEH[i]])[0]]));
const EGG = [GL[0], GL[1], GL[2], GL[3], GL[3], GL[4], GL[5]];

// ---------------------------------------------------------------- Posen

const BASE = {
  bx: 0, hx: 46, hy: -112, ha: 0.25,          // Kopfmitte relativ zum Anker, Kopfneigung (rad, 0 = nach rechts)
  c1x: 30, c1y: -4, c2x: -18, c2y: 36,        // Bogen des aufgerichteten Leibs: Kontrollpunkte relativ zu Knick / Kopf
  tailX: 0, tailY: 0, sink: 0,                // Schwanzspitze, Absenken des Bodenteils
  wave: 0, waveA: 0, legT: 0, legA: 0.25, legCurl: 0,
  jaw: 0.25, fang: 0.2, ant: 0, antA: 0.12,
  eye: 1, glow: 1, sacGlow: 1, swell: 0, sacs: 1, torn: 0,
  shake: 0, spore: 0.4, spT: 0,
};
const pose = (o = {}) => ({ ...BASE, ...o });
const smooth = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1, ease = smooth] = keys[i];
    if (t <= t1) {
      const [t0, p0] = keys[i - 1], k = ease((t - t0) / (t1 - t0 || 1)), o = {};
      for (const key in BASE) o[key] = p0[key] + (p1[key] - p0[key]) * k;
      return o;
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- Körperbau

function bez(a, b, c, d, t) { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }

// Rückgrat: Bodenteil (Schwanz → Knick) und Bogen (Knick → Kopf), gleichmäßig nach Bogenlänge in Glieder geteilt
const NS = 21;
function spine(P) {
  const ox = AX + P.bx, B = { x: ox - 12, y: GY - 20 + P.sink * 0.5 }, Hd = { x: ox + P.hx, y: GY + P.hy };
  const T = { x: B.x - 84 + P.tailX, y: GY - 15 + P.sink + P.tailY };
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, x = T.x + (B.x - T.x) * t;
    const lift = (1 - t) ** 2 * P.tailY * 0;            // (Schwanzhub steckt in T)
    pts.push([x, T.y + (B.y - T.y) * t + Math.sin(t * 9 - P.wave) * P.waveA * (0.4 + t * 0.6) + lift]);
  }
  const C1 = { x: B.x + P.c1x, y: B.y + P.c1y }, C2 = { x: Hd.x + P.c2x, y: Hd.y + P.c2y };
  for (let k = 1; k <= 60; k++) { const t = k / 60; pts.push([bez(B.x, C1.x, C2.x, Hd.x, t), bez(B.y, C1.y, C2.y, Hd.y, t)]); }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], at = (s) => {
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  };
  const segs = [];
  for (let i = 0; i < NS; i++) {
    const u = (i / (NS - 1)) * 0.94, [x, y] = at(u * L), [x2, y2] = at(Math.min(L, u * L + 1));
    const r = 4.5 + Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.85) * 7.5;
    segs.push({ x, y, r, a: Math.atan2(y2 - y, x2 - x), u, i });
  }
  return { segs, B, Hd, T, chest: at(L * 0.8), L };
}

function legOf(S, s, z, far, P, out) {
  const nx = -Math.sin(s.a), ny = Math.cos(s.a), sg = far ? -1 : 1, curl = P.legCurl;
  const ph = P.legT + s.i * 0.85 + (far ? Math.PI : 0), sw = Math.sin(ph) * P.legA, lift = Math.max(0, -Math.cos(ph)) * P.legA;
  const L = (8 + s.r * 0.5) * (1 - curl * 0.45);
  const o = { g: (far ? 'lf' : 'ln') + s.i, k: 0 };
  if (s.y + s.r > GY - 13) {   // am Boden: Knie nach außen hoch, Fuß setzt im Takt der Beinwelle auf
    const bx = s.x + (far ? -2 : 2), by = s.y + s.r * 0.5, kx = bx + sg * 4 + 2 + sw * 2, ky = by - 2 - lift * 2 + curl * 4;
    const fx = kx + sg * 2 + 3 + sw * 3.5 - curl * 6, fy = GY - 0.5 - lift * 2.5 - curl * 3;
    S.cap(bx, by, z, kx, ky, z, 1.7, 1.3, 3, o).cap(kx, ky, z, fx, fy, z, 1.2, 0.35, 3, o);
  } else {                     // aufgerichtet: seitlich gespreizt, Klauen nach unten
    const a = sw * 0.3 - curl * 0.8, ca = Math.cos(a), sa = Math.sin(a);
    const ex = nx * sg, ey = ny * sg, dx = ex * ca - ey * sa, dy = ex * sa + ey * ca;
    const bx = s.x + ex * s.r * 0.6, by = s.y + ey * s.r * 0.6, kx = bx + dx * L * 0.7, ky = by + dy * L * 0.7 - 3 + lift;
    const mx = kx + dx * L * 0.35, my = ky + 5 * (1 - curl * 0.5), fx = kx + dx * L * 0.3, fy = ky + 9 * (1 - curl * 0.6);
    S.cap(bx, by, z, kx, ky, z, 1.7, 1.3, 3, o).cap(kx, ky, z, mx, my, z, 1.2, 0.85, 3, o).cap(mx, my, z, fx, fy, z, 0.85, 0.3, 3, o);
  }
  if (out) out.push({ s, far });
}

const BROOD_AT = [11, 13, 15, 17];
const FUNGI_AT = [4, 8, 12, 16];

function build(S, P, meta) {
  const sp = spine(P), { segs, Hd } = sp;
  const shx = P.shake ? Math.sin(P.shake * 37) * 0.8 : 0;
  if (shx) for (const s of segs) s.x += shx * s.u;
  const ha = P.ha, ch = Math.cos(ha), sh = Math.sin(ha);
  const hx = Hd.x + shx, hy = Hd.y;
  const L = (lx, ly) => [hx + lx * ch - ly * sh, hy + lx * sh + ly * ch];

  // Kontaktschatten unter dem Bodenteil
  const gs = segs.filter((s) => s.y + s.r > GY - 13);
  if (gs.length) {
    const x0 = gs[0].x - 6, x1 = gs[gs.length - 1].x + 12;
    for (let x = x0; x <= x1; x += 0.5) for (let y = -2; y <= 2; y += 0.5) {
      const e = ((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2 + (y / 2.4) ** 2;
      if (e < 1) S.put(x, GY + 0.5 + y, e < 0.6 ? SHADOW[0] : SHADOW[1]);
    }
  }
  // ferne Beine, Glieder, nahe Beine
  for (let i = 1; i < NS - 1; i++) legOf(S, segs[i], 6, true, P);
  segs.forEach((s, i) => {
    const nx = -Math.sin(s.a), ny = Math.cos(s.a), w = s.r * 0.55;
    S.cap(s.x - nx * w, s.y - ny * w, 20 + i * 1.2, s.x + nx * w, s.y + ny * w, 20 + i * 1.2, s.r * 0.72, s.r * 0.72, 0, { g: 'sg' + i, tag: 1 });
  });
  for (let i = 1; i < NS - 1; i++) legOf(S, segs[i], 46, false, P);
  // Konsolenpilze auf dem Rücken
  for (const i of FUNGI_AT) {
    const s = segs[i], nx = -Math.sin(s.a), ny = Math.cos(s.a);
    S.ell(s.x - nx * s.r * 0.78, s.y - ny * s.r * 0.78, 44, s.r * 0.62, s.r * 0.25, 4, 2, { g: 'kon' + i, rot: s.a });
  }
  // Gelege am Bauch der aufgerichteten Glieder
  let bestSac = null;
  BROOD_AT.forEach((i, bi) => {
    const s = segs[i], nx = -Math.sin(s.a), ny = Math.cos(s.a);
    const cx = s.x + nx * s.r * 1.02, cy = s.y + ny * s.r * 1.02 + 2;
    const sc = (0.75 + bi * 0.12) * (1 + P.swell * 0.45) * P.sacs;
    if (!bestSac || sc > bestSac.sc) bestSac = { x: cx + 1.5, y: cy + 2, sc };
    if (sc < 0.08) return;
    const mat = P.torn > 0.5 ? 5 : 4;
    for (let e = 0; e < 7; e++) {
      const a = e * 2.4 + bi, rr = e === 0 ? 0 : 2.6 * sc;
      const ex = cx + Math.cos(a) * rr * 0.9 + 1, ey = cy + Math.sin(a) * rr * 1.1 + e * 0.35 * sc;
      const er = (2.1 + hash2(e, bi, 5) * 0.8) * sc * (P.torn > 0.5 ? 0.75 : 1);
      S.ell(ex, ey, 48 + e * 0.5, er, er * 0.9, er, mat, { g: 'egg' + bi + '_' + e });
    }
  });
  // Kopf
  const [kx, ky] = L(-2, 0), [mx, my] = L(9, 7);
  S.ell(kx, ky, 50, 15, 10.5, 10, 0, { g: 'head', rot: ha, k: 3, tag: 2 });
  S.ell(mx, my, 54, 9.5, 9, 6, 0, { g: 'head', rot: ha, k: 3, tag: 2 });
  // Giftklauen (vordere zuletzt), Öffnen dreht sie um ihre Wurzel
  const fangPts = [[0, 9], [8, 20], [18, 23], [25, 18], [24, 12]];
  let hand = null;
  for (const [dz, dx, dy, dir] of [[52, -3, 0, -1], [58, 2, 2, 1]]) {
    const ang = dir * P.fang * 0.4, ca = Math.cos(ang), sa = Math.sin(ang);
    const pts = fangPts.map(([lx, ly], i) => {
      const rx = lx * ca - (ly - 9) * sa, ry = lx * sa + (ly - 9) * ca + 9;
      const [wx, wy] = L(rx + dx, ry + dy);
      return [wx, wy, dz, [3.6, 2.8, 1.8, 0.9, 0.3][i]];
    });
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; S.cap(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3], 1, { g: 'fang' + dz, tag: i >= 2 ? 3 : 0 }); }
    if (dir > 0) hand = { x: pts[3][0], y: pts[3][1] };
  }
  // Fühler
  for (const [dz, k] of [[48, 0], [56, 1]]) {
    const sway = Math.sin(P.ant + k * 1.3) * P.antA;
    const pts = [[-4 + k * 4, -8], [-12 + k * 6, -24], [-28 + k * 8, -32], [-44 + k * 8, -27]].map(([lx, ly], i) => {
      const a = sway * i * 0.6, ca = Math.cos(a), sa = Math.sin(a), bx = lx + 4 - k * 4, by = ly + 8;
      const [wx, wy] = L(bx * ca - by * sa - 4 + k * 4, bx * sa + by * ca - 8);
      return [wx, wy, dz, [1.6, 1.1, 0.7, 0.4][i]];
    });
    S.chain(pts, 3, { g: 'ant' + dz });
  }

  meta.head = (() => { const [x, y] = L(-2, -11); return { x, y }; })();
  meta.eye = (() => { const [x, y] = L(2, -4); return { x, y }; })();
  meta.mouth = (() => { const [x, y] = L(12, 7); return { x, y }; })();
  meta.cast = meta.mouth;
  meta.hand = hand;
  meta.handB = { x: segs[0].x - 3, y: segs[0].y + 2 };
  meta.chest = { x: sp.chest[0], y: sp.chest[1] };
  meta.sac = { x: bestSac.x, y: bestSac.y };
  meta.core = { x: sp.B.x + 6, y: sp.B.y - 10 };
  return { segs, L };
}

// Malhaken der Materialien
const chitinPaint = (ramp, seed) => (x, y, h, nx, ny, al, pr, k) => {
  if (nx > 0.62 && ny > -0.4 && k <= 4) return nx > 0.77 ? RIM[1] : RIM[0];
  const n = hash2(Math.floor(x * 2), Math.floor(y * 2), seed);
  if (k >= 3 && n > 0.94) return ramp[k - 1];
  if (k >= 2 && k <= 4 && n < 0.03) return ramp[k + 1];
  return 0;
};
function mats(P) {
  const gs = Math.round((P.sacGlow - 1) * 1.4 + (P.glow - 1) * 2.2);
  const eggRamp = EGG.map((c, i) => EGG[Math.max(0, Math.min(6, i + gs))]);
  const chit = chitinPaint(CHIT, 5), leg = chitinPaint(LEG, 8);
  return [
    { ramp: CHIT, flat: 1.5, ao: 0.05, paint: chit },
    { ramp: LEG, flat: 1.3, paint: (x, y, h, nx, ny, al, pr, k) => (pr.tag === 3 && al > 0.35 ? BONE[Math.min(6, k + 2)] : leg(x, y, h, nx, ny, al, pr, k)) },
    { ramp: CAP, flat: 1.3, paint: (x, y, h, nx, ny, al, pr, k) => (al > 0.15 ? (Math.sin(x * 3.2) > 0 ? GL[Math.max(1, 3 + gs)] : GL[1]) : 0) },
    { ramp: LEG, flat: 1.4, paint: (x, y, h, nx, ny, al, pr, k) => (k >= 4 ? LEG[5] : 0) },
    { ramp: eggRamp, flat: 1.1, edge: false },
    { ramp: HUSK, flat: 1.2 },
  ];
}

function deco(S, P, meta, segs, Lh) {
  const gs = Math.round((P.glow - 1) * 2.2);
  const G = (i) => GL[Math.max(0, Math.min(5, i + gs))];
  // Plattendornen an der Rückenkante
  segs.forEach((s, i) => {
    if (i < 2 || i >= NS - 1) return;
    const nx = -Math.sin(s.a), ny = Math.cos(s.a), x = s.x - nx * s.r * 1.05, y = s.y - ny * s.r * 1.05;
    S.spike(x, y, x - nx * 3 - Math.cos(s.a) * 3, y - ny * 3 - Math.sin(s.a) * 3, 2, CHIT);
  });
  // Rundmaul: dunkler Schlund, Glut innen, Zahnkranz
  const ha = P.ha, ch = Math.cos(ha), sh = Math.sin(ha);
  const m = meta.mouth, R = 5.2 + P.jaw * 2.2;
  S.disc(m.x, m.y, R, CHIT[0]);
  S.disc(m.x + 0.4, m.y + 0.3, R * (0.35 + P.jaw * 0.3), G(2));
  S.disc(m.x + 0.6, m.y + 0.5, R * (0.12 + P.jaw * 0.18), G(4));
  const nT = 12;
  for (let i = 0; i < nT; i++) {
    const a = i / nT * TAU + ha, x = m.x + Math.cos(a) * R, y = m.y + Math.sin(a) * R;
    S.spike(x, y, m.x + Math.cos(a) * R * (0.42 - P.jaw * 0.1), m.y + Math.sin(a) * R * (0.42 - P.jaw * 0.1), 1.6, TEETH);
  }
  // Augenpunkte
  for (const [lx, ly, r] of [[1, -3, 1.8], [5, -5, 1.4], [-3, -4, 1.3], [6, -1, 1.1]]) {
    const x = Lh(lx, ly)[0], y = Lh(lx, ly)[1];
    if (P.eye < 0.3) { S.line(x - r * 0.8, y, x + r * 0.8, y, CHIT[0]); continue; }
    S.disc(x, y, r + 0.5, CHIT[0]);
    const rr = r * Math.min(1, P.eye);
    S.orb(x, y, rr, P.eye > 1.2 ? [YE[1], YE[2], YE[3], YE[4], YE[5], YE[5]] : YE);
  }
  // Sporen schweben auf
  const n = Math.round(10 * P.spore);
  for (let i = 0; i < n; i++) {
    const t = (P.spT * 0.18 + hash2(i, 1, 41)) % 1, x = AX - 70 + hash2(i, 2, 41) * 150 + Math.sin(t * 6 + i) * 3, y = GY - 20 - t * 90 - hash2(i, 3, 41) * 30;
    if (t > 0.9) continue;
    S.put(x, y, t < 0.6 ? G(4) : G(3)); if (hash2(i, 4, 41) > 0.6) S.put(x + 0.5, y, G(3));
  }
}

// ---------------------------------------------------------------- Frames

let SC = null;
function sculptor(res) {
  if (!SC || SC.res !== res) SC = new Sculpt(W, H, res).setGlow(GLOWMAP);
  return SC;
}
function cut(d, w0, bb) {
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1, o = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) o.set(d.subarray((y + bb.y0) * w0 + bb.x0, (y + bb.y0) * w0 + bb.x0 + w), y * w);
  return o;
}
function lazyLayer(o, key, pos, val, w, h, ax, ay, res) {
  let f = null;
  Object.defineProperty(o, key, {
    get() {
      if (!f) {
        const d = new Uint32Array(w * h);
        for (let k = 0; k < pos.length; k++) d[pos[k]] = val[k];
        f = new SpriteFrame(pixelsToCanvas(d, w, h), ax, ay, res); pos = val = null;
      }
      return f;
    },
    set(v) { f = v; pos = val = null; },
    enumerable: true, configurable: true,
  });
}

function frameNow(P, ex, res) {
  const S = sculptor(res).reset(), meta = {};
  const { segs, L } = build(S, P, meta);
  S.render(mats(P));
  deco(S, P, meta, segs, L);
  S.glowPass();
  const TW = S.w, bb = S.x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0: S.x0, y0: S.y0, x1: S.x1, y1: S.y1 };
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  const base = new SpriteFrame(pixelsToCanvas(outlinePixels(cut(S.out, TW, bb), w, h), w + 2, h + 2), AX * res - bb.x0 + 1, AY * res - bb.y0 + 1, res);
  // Leuchtebenen: belegte Texel jetzt merken, Leinwand erst beim ersten Gebrauch
  let gx0 = TW, gy0 = S.h, gx1 = -1, gy1 = -1, n = 0;
  const idx = [];
  for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0, i = y * TW + x; x <= bb.x1; x++, i++) {
    if (!S.g1[i]) continue;
    idx.push(i); n++;
    if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
  }
  if (gx1 < 0) { gx0 = gy0 = gx1 = gy1 = 0; }
  const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1, pos = new Int32Array(n), ga = new Uint32Array(n), gb = new Uint32Array(n);
  for (let k = 0; k < n; k++) {
    const i = idx[k], y = (i / TW) | 0, x = i - y * TW;
    pos[k] = (y - gy0) * gw + (x - gx0); ga[k] = S.g1[i]; gb[k] = S.g2[i];
  }
  lazyLayer(base, 'glow', pos, ga, gw, gh, AX * res - gx0, AY * res - gy0, res);
  lazyLayer(base, 'glowEnraged', pos, gb, gw, gh, AX * res - gx0, AY * res - gy0, res);
  base.meta = {};
  for (const k in meta) base.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  base.fx = ex.fx ?? null;
  return base;
}
// Aufgeschoben: gezeichnet wird erst, wenn die Animation den Frame braucht (in der Bildfeinheit vom Anlegen)
function frame(P, ex = {}) {
  const res = fineRes();
  return deferFrame(() => frameNow(P, ex, res));
}
function track(keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), extras[i] ?? {}));
  }
  return out;
}
function cycle(n, fn) {
  const keys = [];
  for (let i = 0; i <= n; i++) keys.push([i / n, pose(fn((i / n) * TAU)), linear]);
  return keys;
}

export function createRotMotherSprites() {
  const S = Math.sin, C = Math.cos;
  // --- Lauern: Vorderleib wiegt sich, Fühler tasten, Beine zucken leicht, Schlund glimmt
  const idleKeys = cycle(12, (ph) => ({
    hx: 46 + S(ph) * 2, hy: -112 + S(ph + 0.8) * 2, ha: 0.25 + S(ph + 1.4) * 0.06, c2x: -18 + S(ph) * 3,
    legT: ph, legA: 0.25, ant: ph * 2, antA: 0.16, jaw: 0.22 + 0.12 * (0.5 + 0.5 * S(ph * 2)), fang: 0.2 + 0.08 * S(ph + 2),
    sacGlow: 1 + 0.15 * S(ph * 2), swell: 0.05 * S(ph * 2), spT: ph,
  }));
  // --- Kriechen: Beinwelle läuft den Leib entlang, Leib wogt
  const walkKeys = cycle(10, (ph) => ({
    bx: S(ph) * 2, legT: ph * 2, legA: 1, wave: ph * 2, waveA: 1.2,
    hx: 50 + S(ph) * 3, hy: -108 + Math.abs(S(ph)) * -2, ha: 0.3 + S(ph * 2) * 0.05, ant: ph * 2, antA: 0.2, jaw: 0.3, fang: 0.3, spT: ph,
  }));
  // --- Schlafend: Vorderleib zum Bogen gekrümmt, Kopf am Boden, Gelege glimmen matt
  const dormKeys = cycle(8, (ph) => ({
    hx: 52, hy: -32, ha: 0.45, c1x: 12, c1y: -66, c2x: -10, c2y: -62, sink: 3, legA: 0.05, legT: ph, legCurl: 0.45,
    jaw: 0, fang: 0, eye: 0, glow: 0.7, sacGlow: 0.45 + 0.12 * S(ph), spore: 0.15, spT: ph, ant: ph, antA: 0.05,
  }));
  const dorm = dormKeys[0][1];
  // --- Aufwachen und Schrei
  const rise1 = pose({ hx: 44, hy: -64, ha: 0.1, c1x: 22, c1y: -40, c2x: -14, c2y: -6, sink: 1, legCurl: 0.2, eye: 0.6, sacGlow: 0.8, jaw: 0.2, spT: 0.8 });
  const rise2 = pose({ hx: 34, hy: -122, ha: -0.25, c1x: 26, c1y: -8, c2x: -6, c2y: 40, eye: 1.3, jaw: 0.7, fang: 0.8, sacGlow: 1.4, swell: 0.25, legA: 0.6, legT: 2, antA: 0.3, ant: 2, spore: 0.8, spT: 1.6 });
  const scream = pose({ hx: 30, hy: -128, ha: -0.45, c1x: 24, c1y: -8, c2x: -2, c2y: 42, eye: 1.5, jaw: 1, fang: 1, sacGlow: 1.4, swell: 0.3, legA: 0.9, legT: 3.4, antA: 0.35, ant: 3.4, spore: 1, spT: 2.4, shake: 1 });
  const screamEnd = { ...scream, legT: 5.6, ant: 5.6, spT: 4.2, shake: 2.5, ha: -0.4 };
  // --- Klauenstoß: zurückbäumen, dann Kopf nach vorn unten in den Boden
  const lw = pose({ hx: 22, hy: -122, ha: -0.35, c1x: 22, c1y: -8, c2x: -2, c2y: 40, jaw: 0.6, fang: 1, eye: 1.3, sacGlow: 1.2, legA: 0.4, legT: 1, antA: 0.25, spT: 1 });
  const lwEnd = { ...lw, hx: 20, hy: -124, legT: 1.6, spT: 1.5 };
  const l1 = pose({ hx: 70, hy: -84, ha: 0.55, c1x: 30, c1y: -24, c2x: -26, c2y: 6, jaw: 0.8, fang: 0.9, eye: 1.3, legA: 0.6, legT: 2, spT: 1.8 });
  const l2 = pose({ hx: 96, hy: -36, ha: 0.95, c1x: 30, c1y: -30, c2x: -30, c2y: -36, jaw: 1, fang: -0.2, eye: 1.3, bx: 2, legA: 0.6, legT: 2.6, spT: 2.1 });
  const l3 = pose({ hx: 90, hy: -40, ha: 0.85, c1x: 30, c1y: -30, c2x: -30, c2y: -34, jaw: 0.6, fang: 0, bx: 1, legT: 3, spT: 2.6 });
  const lEnd = pose({ legT: 3.6, spT: 3.2 });
  // --- Sporen spucken
  const sw = pose({ hx: 28, hy: -118, ha: -0.15, c2x: -6, c2y: 38, jaw: 0.75, fang: 0.7, eye: 1.3, sacGlow: 1.5, swell: 0.2, legT: 1, spT: 1 });
  const swEnd = { ...sw, jaw: 0.85, swell: 0.28, legT: 1.5, spT: 1.5 };
  const sp1 = pose({ hx: 62, hy: -100, ha: 0.45, c1x: 30, c1y: -12, c2x: -22, c2y: 24, jaw: 1, fang: 0.9, eye: 1.4, sacGlow: 1.8, bx: 2, legT: 2, spT: 1.9, spore: 0.9 });
  const sp2 = pose({ hx: 56, hy: -104, ha: 0.38, jaw: 0.8, fang: 0.6, sacGlow: 1.3, bx: 1, legT: 2.6, spT: 2.3, spore: 0.7 });
  const spEnd = pose({ legT: 3.2, spT: 3 });
  // --- Gelege stoßen Sporen aus (Wolken)
  const pw = pose({ hx: 36, hy: -116, ha: -0.05, swell: 0.6, sacGlow: 1.7, jaw: 0.35, legT: 1, spT: 1 });
  const pwEnd = { ...pw, swell: 0.7, legT: 1.4, spT: 1.4 };
  const pf1 = pose({ hx: 52, hy: -106, ha: 0.35, swell: -0.15, sacGlow: 2.1, jaw: 0.65, spore: 1, legT: 2, spT: 1.8, shake: 1 });
  const pf2 = pose({ hx: 48, hy: -110, swell: -0.08, sacGlow: 1.3, jaw: 0.3, spore: 0.8, legT: 2.6, spT: 2.2 });
  const pfEnd = pose({ legT: 3.2, spT: 2.8 });
  // --- Brut ausspeien: Kopf zum Boden, Schlund weit
  const bw = pose({ hx: 30, hy: -120, ha: -0.2, jaw: 0.4, fang: 0.6, eye: 1.2, sacGlow: 1.3, swell: 0.3, legT: 1, spT: 1 });
  const bwEnd = { ...bw, swell: 0.35, legT: 1.4, spT: 1.4 };
  const br1 = pose({ hx: 68, hy: -50, ha: 1.05, c1x: 30, c1y: -26, c2x: -24, c2y: -26, jaw: 1, fang: 1, eye: 1.3, bx: 3, legT: 2, spT: 1.8, swell: 0 });
  const br2 = pose({ hx: 70, hy: -48, ha: 1.1, c1x: 30, c1y: -26, c2x: -24, c2y: -28, jaw: 1, fang: 1, bx: 3, sacGlow: 1.2, legT: 2.4, spT: 2.2 });
  const br3 = pose({ hx: 58, hy: -76, ha: 0.6, c1x: 30, c1y: -16, c2x: -22, c2y: 10, jaw: 0.6, bx: 1, legT: 3, spT: 2.6 });
  const brEnd = pose({ legT: 3.6, spT: 3.2 });
  // --- Wurzeln rufen (Phase 2): hoch aufbäumen, dann Kopf und Schwanz in den Boden schlagen
  const pl0 = pose({ hx: 30, hy: -130, ha: -0.3, c2x: -4, c2y: 42, jaw: 0.8, fang: 1, eye: 1.3, sacGlow: 1.3, tailY: -10, tailX: 6, legA: 0.6, legT: 1, spT: 1 });
  const pl0End = { ...pl0, hy: -132, tailY: -12, legT: 1.5, spT: 1.4 };
  const plA = pose({ hx: 76, hy: -34, ha: 1.2, c1x: 26, c1y: -40, c2x: -20, c2y: -46, jaw: 1, fang: 1, eye: 1.4, tailY: 2, bx: 2, legA: 0.8, legT: 2, sacGlow: 1.4, spT: 1.8, shake: 1 });
  const plB = { ...plA, jaw: 0.85, legT: 2.8, spT: 2.2, bx: 1.5, shake: 2 };
  const plC = { ...plA, jaw: 1, legT: 3.6, spT: 2.6, bx: 2.2, shake: 3 };
  const plOut = pose({ hx: 54, hy: -84, ha: 0.5, c2x: -24, c2y: 18, jaw: 0.4, legT: 4.4, spT: 3 });
  const plEnd = pose({ legT: 5, spT: 3.4 });
  // --- Gelege platzen (Phase 3)
  const bu = pose({ hx: 38, hy: -116, ha: -0.1, swell: 1, sacGlow: 2, jaw: 0.8, fang: 1, eye: 1.4, legA: 0.6, spore: 0.9, spT: 0.8 });
  const buKeys = [[0, pose({ swell: 0.1 })], [0.4, { ...bu, bx: -1, shake: 1 }], [0.6, { ...bu, bx: 1, swell: 1.08, shake: 2, legT: 1.6 }], [0.8, { ...bu, bx: -1, swell: 1.15, shake: 3, legT: 2 }], [1, { ...bu, bx: 1, swell: 1.2, shake: 4, legT: 2.4 }]];
  const b1 = pose({ hx: 50, hy: -108, ha: 0.3, torn: 1, swell: 0, sacGlow: 0.9, jaw: 1, fang: 1, eye: 1.4, spore: 1, legT: 2.8, spT: 1.6 });
  const b2 = { ...b1, jaw: 0.7, legT: 3.4, spT: 2.1 };
  const b3 = pose({ torn: 0, sacs: 0.25, sacGlow: 0.6, jaw: 0.3, legT: 4, spT: 2.6 });
  const b4 = pose({ sacs: 0.85, legT: 4.6, spT: 3 });
  // --- Phasenschrei
  const ro1 = pose({ hx: 50, hy: -96, ha: 0.4, c2x: -20, c2y: 22, jaw: 0, fang: 0.2, eye: 0.8 });
  // --- Treffer
  const hurtP = pose({ hx: 36, hy: -106, ha: -0.15, bx: -3, jaw: 0.6, fang: 0.8, sacGlow: 1.4, eye: 1.3, legA: 0.6, legT: 1, shake: 1 });
  // --- Tod: aufbäumen, Gelege reißen, stürzt nach vorn, Beine krümmen sich ein, Leuchten verglimmt
  const d1 = pose({ hx: 28, hy: -128, ha: -0.5, c2x: -2, c2y: 42, jaw: 1, fang: 1, eye: 1.5, sacGlow: 2, swell: 0.45, legA: 1, legT: 2, spore: 1, spT: 1, shake: 2 });
  const d2 = pose({ hx: 46, hy: -104, ha: 0.2, torn: 1, swell: 0, sacGlow: 0.9, jaw: 0.8, fang: 0.6, eye: 0.8, legA: 0.8, legT: 3, legCurl: 0.2, spore: 1, spT: 1.8 });
  const d3 = pose({ hx: 70, hy: -52, ha: 0.75, c1x: 28, c1y: -30, c2x: -22, c2y: -12, torn: 1, jaw: 0.5, fang: 0.2, eye: 0.3, legCurl: 0.6, legA: 0.4, legT: 3.6, sacs: 0.6, sacGlow: 0.4, glow: 0.85, spore: 0.7, spT: 2.6, sink: 1 });
  const d4 = pose({ hx: 84, hy: -28, ha: 0.25, c1x: 26, c1y: -26, c2x: -26, c2y: -22, torn: 1, jaw: 0.25, fang: 0, eye: 0, legCurl: 1, legA: 0, sacs: 0.5, sacGlow: 0.2, glow: 0.65, spore: 0.45, spT: 3.4, sink: 3, antA: 0 });
  const remains = (k) => frame({ ...d4, glow: 0.65 - 0.5 * k, spore: 0.45 * (1 - k), spT: 3.4 + k * 3, sacGlow: 0.2 * (1 - k) }, {});

  return {
    idle: new Animation(track(idleKeys, 12, { loop: true }), 7),
    walk: new Animation(track(walkKeys, 10, { loop: true }), 8),
    dormant: new Animation(track(dormKeys, 8, { loop: true }), 3),
    awaken: new Animation(track([[0, dorm], [0.3, rise1], [0.55, rise2], [0.62, scream, snap], [1, screamEnd]], 18, { extras: { 11: { fx: 'roar' } } }), 9, false),
    lashWindup: new Animation(track([[0, pose()], [0.7, lw], [1, lwEnd]], 7), 10, false),
    lash: new Animation(track([[0, l1], [0.16, l2, snap], [0.42, l3], [1, lEnd]], 9, { extras: { 1: { fx: 'impact' } } }), 16, false),
    spitWindup: new Animation(track([[0, pose()], [0.7, sw], [1, swEnd]], 7), 10, false),
    spit: new Animation(track([[0, sp1], [0.3, sp2], [1, spEnd]], 8, { extras: { 1: { fx: 'cast' } } }), 14, false),
    puffWindup: new Animation(track([[0, pose()], [0.7, pw], [1, pwEnd]], 7), 10, false),
    puff: new Animation(track([[0, pf1], [0.35, pf2], [1, pfEnd]], 8, { extras: { 1: { fx: 'cast' } } }), 13, false),
    broodWindup: new Animation(track([[0, pose()], [0.7, bw], [1, bwEnd]], 7), 9, false),
    brood: new Animation(track([[0, br1], [0.25, br2], [0.6, br3], [1, brEnd]], 10, { extras: { 1: { fx: 'cast' } } }), 11, false),
    plungeWindup: new Animation(track([[0, pose()], [0.7, pl0], [1, pl0End]], 7), 10, false),
    plunge: new Animation(track([[0, plA], [0.35, plB], [0.62, plC], [0.8, plOut], [1, plEnd]], 12, { extras: { 0: { fx: 'impact' } } }), 10, false),
    burstWindup: new Animation(track(buKeys, 9), 10, false),
    burst: new Animation(track([[0, b1], [0.35, b2], [0.6, b3], [1, b4]], 10, { extras: { 0: { fx: 'impact' } } }), 12, false),
    roar: new Animation(track([[0, ro1], [0.25, scream, snap], [0.8, screamEnd], [1, { ...screamEnd, legT: 6.2, spT: 5 }]], 12, { extras: { 3: { fx: 'roar' } } }), 8, false),
    hurt: new Animation(track([[0, hurtP], [1, pose({ legT: 2 })]], 4), 12, false),
    death: new Animation([
      ...track([[0, hurtP], [0.18, d1], [0.4, d2], [0.72, d3], [1, d4]], 18, { extras: { 3: { fx: 'roar' }, 8: { fx: 'impact' }, 14: { fx: 'impact' } } }),
      remains(0.25), remains(0.5), remains(0.75), remains(1),
    ], 7, false),
  };
}
