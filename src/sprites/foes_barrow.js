import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner des Heulenden Hügelgrabs (Stufe 24–26): Grabunhold, Grabhund,
// Knochenschütze und Totenrufer. Kaltes, blaugrünes Geisterlicht auf der
// Leucht-Ebene (frame.glow), verwitterte Bronze mit Grünspan.
//
// Aufbau wie foes_ashwood.js: kleine Rigs (Hüfte, Rumpf, Kopf, IK-Arme/-Beine
// bzw. parametrischer Vierbeiner), Schlüsselposen werden beim Laden weich
// interpoliert. frame.meta: eye/hand/mouth/head (relativ zum Anker), bei
// Fernkämpfern ist meta.hand die Mündung. frame.fx: 'step' | 'impact' | 'roar' | 'cast'.
// Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln. Die Formen
// (limb, ell, smearArc, Robe) tasten Feinpixel ab, p.px/p.rect/p.line setzen ganze Weltpixel; handfeine Details
// stehen in `if (p.fine)`. Bei res 1 tasten alle Formen exakt wie früher ab (Qualität „Niedrig“ pixelgleich).
// Lage-Konvention wie p.px: ein Weltpunkt x landet im Pixel round(x) – fein im Feinpixel, das x + 0,5 enthält (fd).

// ================================================================ Werkzeuge

const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const TAU = Math.PI * 2;

function mixP(a, b, t) {
  const o = {};
  for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t;
  return o;
}
// keys = [[t 0..1, pose, easing?], ...]
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mixP(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { jx: ax + ux * a - uy * h * bend, jy: ay + uy * a + ux * h * bend, ex: ax + dx, ey: ay + dy };
}

// Feinpixel in p.px-Lage: Weltpunkt (x, y) → das Feinpixel, das (x + 0,5, y + 0,5) enthält (bei res 1 = p.px).
const fd = (p, x, y, c) => p.dot(x + 0.5, y + 0.5, c);
// feine Linie in derselben Lage (w = Stärke in Weltpixeln, 0 = ein Feinpixel)
const fl = (p, x0, y0, x1, y1, c, w = 0) => p.fline(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, c, w);

// Dickes Glied mit Licht von links oben (ramp: 4 Stufen dunkel → hell).
// Pixelgenau gerastert (Kapsel um die Strecke): saubere Lichtbänder ohne
// Sprenkel. Fein: Kantenbänder 1 Feinpixel; gl = Glanzlinie (Metall, 1 Feinpixel
// innen an der Lichtkante), dk = fünfte, tiefste Schattenstufe.
function limb(p, x0, y0, x1, y1, w0, w1, ramp, gl = null, dk = null) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 0.0001, len = Math.sqrt(len2);
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const R = Math.max(w0, w1) / 2 + 1;
  const xa = Math.floor(Math.min(x0, x1) - R), xb = Math.ceil(Math.max(x0, x1) + R);
  const ya = Math.floor(Math.min(y0, y1) - R), yb = Math.ceil(Math.max(y0, y1) + R);
  const fine = p.fine, e = fine ? 0.5 : 1;
  // Abtastpunkt = Feinpixelmitte − 0,5 (bei res 1 genau die ganzzahlige Ecke wie früher)
  p.each(xa, ya, xb, yb, (sx, sy) => {
    const X = sx - 0.5, Y = sy - 0.5;
    const t = Math.max(0, Math.min(1, ((X - x0) * dx + (Y - y0) * dy) / len2));
    const ox = X - (x0 + dx * t), oy = Y - (y0 + dy * t);
    const hw = Math.max(0.62, (w0 + (w1 - w0) * t) / 2);
    if (ox * ox + oy * oy > hw * hw + 0.15) return null;
    const k = ox * nx + oy * ny;
    if (fine) {
      if (k > hw - 0.5) return ramp[3];
      if (gl && k > hw - 1 && hw > 0.9) return gl;
      if (k < -hw + 0.5) return dk ?? ramp[0];
      if (dk && k < -hw + 1) return ramp[0];
    }
    return k > hw - e ? ramp[3] : k < -hw + e ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
  });
}

// Gefüllte Ellipse. res 1: genau wie PixelCanvas.ellipse (Zeilen-Spannen); fein: Feinpixel abgetastet,
// gleiche Ausdehnung, glattere Rundung. c = Farbe oder fn(u, v) -> Farbe (u, v = −1..1, nur fein).
function ell(p, cx, cy, rx, ry, c) {
  if (!p.fine) {
    if (typeof c === 'function') c = c(0, 0);
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const hw = Math.round(rx * Math.sqrt(t) - 0.15);
      p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
    }
    return;
  }
  const ex = rx + 0.35, ey = Math.ceil(ry) - ry < 0.5 ? Math.ceil(ry) + 0.4 : ry + 0.45;
  const fn = typeof c === 'function';
  p.each(cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, (sx, sy) => {
    const u = (sx - 0.5 - cx) / ex, v = (sy - 0.5 - cy) / ey;
    if (u * u + v * v > 1) return null;
    return fn ? c(u, v) : c;
  });
}

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy).
// Geschlossene Sichel ohne Rauschen: am Anfang ein dünner Faden, zum frischen
// Ende hin breit; Außenkante hell, innen dunkler. sy staucht die Bahn
// senkrecht (waagerechte Hiebe in 3/4-Sicht). Fein: dieselbe geschlossene Form in Feinpixeln
// (dicht, kein Streuen), Außenkante 1 Feinpixel weiß-heiß.
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const fine = p.fine, R = fine ? 2 : 1;
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 2 * R) + 2;
  const seen = new Set();
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const th = (0.12 + 0.88 * Math.pow(f, 1.3)) * Math.min(1, 8 / (r1 - r0)); // höchstens ~8 px breit
    const rin = r1 - (r1 - r0) * th;
    for (let r = r1; r >= rin; r -= 0.5 / R) {
      const vx = cx + Math.cos(a) * r, vy = cy + Math.sin(a) * r * sy;
      const x = fine ? Math.floor(vx * 2 + 1) : Math.round(vx), y = fine ? Math.floor(vy * 2 + 1) : Math.round(vy);
      const key = x * 1000 + y;
      if (seen.has(key)) continue;
      seen.add(key);
      const radial = (r - rin) / (r1 - rin || 1);
      let c = radial > 0.75 || f < 0.25 ? cols[2] : radial > 0.4 ? cols[1] : cols[0];
      if (!fine) {
        p.px(x, y, c);
        if (g && gcols && f > 0.3 && radial > 0.4) g.px(x, y, radial > 0.75 ? gcols[1] : gcols[0]);
        continue;
      }
      const X = (x + 0.5) / 2, Y = (y + 0.5) / 2, edge = r > r1 - 0.5 / R - 1e-6 && f > 0.25;
      if (edge && cols[3]) c = cols[3];
      p.dot(X, Y, c);
      if (g && gcols && f > 0.3 && radial > 0.4) g.dot(X, Y, edge && gcols[2] ? gcols[2] : radial > 0.75 ? gcols[1] : gcols[0]);
    }
  }
}

// Dreht den Inhalt einer FineCanvas texelgenau (nächster Nachbar) um einen Drehpunkt (Weltpixel).
// Arbeitet direkt auf den Pixelpuffern (keine Leinwand nötig).
function rotBlit(src, dst, px, py, ang) {
  const r = src.res, W = src.W, H = src.H;
  px *= r; py *= r;
  const s = src.pixels(), d = dst.buf;
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x + 0.5 - px, ry = y + 0.5 - py;
    const sx = Math.floor(px + rx * c - ry * sn), sy = Math.floor(py + rx * sn + ry * c);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const v = s[sy * W + sx];
    if (v >>> 24) d[y * W + x] = v;
  }
  dst.dirty = true;
}
// Puffer von src (gleich breit) um dy Texelzeilen versetzt in dst kopieren (deckende Texel ersetzen).
function blitRows(src, dst, dy) {
  const W = src.W, s = src.pixels(), d = dst.buf;
  for (let y = 0; y < src.H; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.H) continue;
    const o = y * W, to = ty * W;
    for (let x = 0; x < W; x++) { const v = s[o + x]; if (v >>> 24) d[to + x] = v; }
  }
  dst.dirty = true;
}

// Pixelkarte: jede Zeile ein String, jedes Zeichen ein Schlüssel in pal
// ('.' und Leerzeichen = frei). Für Köpfe/Gesichter, die pixelgenau sitzen müssen.
// Ganze Weltpixel (auch fein); feine Details kommen danach darüber.
function pmap(p, x0, y0, rows, pal) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const c = pal[r[i]];
      if (c) p.px(x0 + i, y0 + j, c);
    }
  }
}
// Feine Pixelkarte: wie pmap, aber jedes Zeichen ist ein Feinpixel (nur bei p.fine; x0/y0 Weltpixel, ganzzahlig).
function fmap(p, x0, y0, rows, pal) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const c = pal[r[i]];
      if (c) p.dot(x0 + i * 0.5 + 0.1, y0 + j * 0.5 + 0.1, c);
    }
  }
}

// Baut einen Frame: draw(p, g, P, extra) -> meta (absolute Koordinaten).
// extra.rot = [winkel, drehpunktX, drehpunktY] kippt die ganze Figur (Sturz).
// Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht.
const makeFrame = (W, H, AX, AY, draw, P, extra) => lazyFrame(() => makeFrameNow(W, H, AX, AY, draw, P, extra));
function makeFrameNow(W, H, AX, AY, draw, P, extra = {}) {
  const res = fineRes(), g = new FineCanvas(W, H, res);
  let meta = {};
  const f = buildFrame(W, H, AX, AY, (p) => {
    if (extra.rot && Math.abs(extra.rot[0]) > 0.001) {
      // Auf eine gepolsterte Leinwand zeichnen, drehen und die Figur wieder
      // auf den Boden setzen (unterstes Pixel = Bodenlinie).
      const PAD = 24, HH = H + PAD * 2;
      const tp = new FineCanvas(W, HH, res), tg = new FineCanvas(W, HH, res);
      tp.translate(0, PAD); tg.translate(0, PAD);
      meta = draw(tp, tg, P, extra) || {};
      tp.resetTranslate(); tg.resetTranslate();
      const [a, rx, ry0] = extra.rot, ry = ry0 + PAD;
      const rp = new FineCanvas(W, HH, res), rg = new FineCanvas(W, HH, res);
      rotBlit(tp, rp, rx, ry, a); rotBlit(tg, rg, rx, ry, a);
      const d = rp.buf, WR = W * res;
      let bottom = -1;
      for (let y = HH * res - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < WR; x++) if ((d[y * WR + x] >>> 24) > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? Math.round(((AY - 1 / res) - (bottom / res - PAD)) * res) / res : 0;
      blitRows(rp, p, Math.round((shift - PAD) * res)); blitRows(rg, g, Math.round((shift - PAD) * res));
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in meta) {
        const m = meta[k], dx = m.x - rx, dy = m.y - ry0;
        meta[k] = { x: rx + dx * c - dy * s, y: ry0 + dx * s + dy * c + shift };
      }
    } else meta = draw(p, g, P, extra) || {};
    if (extra.post) Object.assign(meta, extra.post(p, g) || {});
  }, { fine: true, res });
  f.glow = new SpriteFrame(pixelsToCanvas(g.pixels(), g.W, g.H), AX * res, AY * res, res);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = extra.fx ?? null;
  return f;
}

// n Frames aus einer Keyframe-Spur. loop: letzter Frame ≠ erster.
function track(mk, keys, n, { loop = false, extras = {}, all = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(mk(sample(keys, t), { ...all, ...(extras[i] ?? {}) }));
  }
  return out;
}

// Humanoides Rig: Gelenkpunkte aus einer Pose.
function rig(P, D, AX, AY) {
  const hip = { x: AX + P.hipX, y: AY - D.legH + P.hipY };
  const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
  const pt = (u, k) => ({ x: hip.x + sL * u + cL * k, y: hip.y - cL * u + sL * k });
  const chest = pt(D.spine, 0);
  const fF = { x: AX + P.fFx, y: AY - P.fFy }, fB = { x: AX + P.fBx, y: AY - P.fBy };
  const legF = ik(hip.x + D.hipW, hip.y, fF.x, fF.y, D.thigh, D.shin, -1);
  const legB = ik(hip.x - D.hipW, hip.y, fB.x, fB.y, D.thigh, D.shin, -1);
  const shF = pt(D.spine - 1, D.sh), shB = pt(D.spine - 1, -D.sh);
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy }, hB = { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, D.upper, D.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, D.upper, D.fore, 1);
  return { hip, chest, pt, sL, cL, legF, legB, shF, shB, armF, armB };
}

// ================================================================ Farben

// Bronze (Grabrüstung), Grünspan, kaltes Geisterlicht, vertrocknete Haut,
// Leichentuch, kühler Knochen, verblichener Helmbusch.
const BRZ = ['#150e08', '#281a0e', '#402b16', '#5c4020', '#7c5a2e', '#a07c42', '#c8a868'];
const VERD = ['#0e221c', '#1a3a30', '#285a4a', '#3e7e68', '#62a88c', '#8ccab0'];
const GH = ['#06302e', '#0c6a64', '#20b4a6', '#66f0da', '#c4fff2', '#ffffff'];
const MUM = ['#131316', '#222126', '#343137', '#494548', '#625c5a', '#7e776e'];
const SHR = ['#0f1215', '#1a1f23', '#273034', '#374246', '#4c585a', '#687472'];
const BN = ['#33312b', '#5a584c', '#8c8872', '#bab69a', '#e0dcc2', '#f8f6e8'];
const CREST = ['#1c090b', '#381114', '#581b1d', '#7c2a25', '#9e3c2e'];
const WOODB = ['#1a120c', '#2c2016', '#433222', '#5c4630', '#78603f'];
// Schleier-Farben (innen, Mitte, Außenkante, fein: weiß-heiße Kante) und Leucht-Ebene
const GH_EDGE = [GH[1], GH[2], GH[4], GH[5]];
const GH_EDGE_G = [GH[1], GH[3], GH[4]];

// Geisterfahne: wellige, nach hinten verwehende Spur auf der Leucht-Ebene
// (Kern hell, Schweif dunkler). dir = -1 weht nach links (hinten).
// base = false: nur Leucht-Ebene (über Gesichtern, damit sie lesbar bleiben).
// Fein: durchgehendes Band in Feinpixeln – weißer Kern vorn, darunter ein farbiger Saum, Schweif läuft dünn aus.
function wisp(p, g, x, y, len, ph, dir = -1, rise = 0.35, bright = 1, base = true) {
  if (p.fine) {
    // über Gesichtern (base = false) beginnt die Fahne erst hinter dem Auge und bleibt schmal, damit das Gesicht lesbar bleibt
    for (let i = base ? 0 : 1; i < len; i += 0.5) {
      const f = i / len;
      const wx = x + dir * i, wy = y - i * rise + Math.sin(ph + i * 0.7) * f * 1.4;
      if (bright > 0.2) {
        const full = bright > 0.7 || f > 0.3;
        const core = !full ? GH[3] : f < 0.2 ? GH[base ? 5 : 4] : f < 0.45 ? GH[4] : f < 0.72 ? GH[3] : GH[2];
        fd(g, wx, wy, core);
        if (f < 0.72 && (base || f > 0.3)) fd(g, wx, wy + 0.5, f < 0.4 ? GH[2] : GH[1]);
      }

      if (base && f < 0.35) fd(p, wx, wy, f < 0.15 ? GH[5] : GH[4]);
    }
    return;
  }
  for (let i = 0; i < len; i++) {
    const f = i / len;
    const wx = x + dir * i, wy = y - i * rise + Math.sin(ph + i * 0.7) * f * 1.4;
    const c = f < 0.25 ? GH[4] : f < 0.55 ? GH[3] : f < 0.8 ? GH[2] : GH[1];
    if (bright > 0.2) g.px(wx, wy, bright > 0.7 || f > 0.3 ? c : GH[2]);
    if (base && f < 0.35) p.px(wx, wy, GH[f < 0.15 ? 4 : 3]);
  }
}

// ---- handfeine Bausteine (nur bei p.fine aufrufen)
// Niete: Glanzpunkt oben links, Schatten unten rechts (je 1 Feinpixel), Punkt in p.px-Lage
function rivet(p, x, y, hi = BRZ[6], lo = BRZ[0]) { fd(p, x - 0.25, y - 0.25, hi); fd(p, x + 0.25, y + 0.25, lo); }
// Grünspan-Fleck: kleine Kruste aus 3–4 Feinpixeln, helle Kante oben links, dunkle unten rechts
function verdPatch(p, x, y, big = false) {
  fd(p, x, y, VERD[4]); fd(p, x + 0.5, y, VERD[3]); fd(p, x, y + 0.5, VERD[3]); fd(p, x + 0.5, y + 0.5, VERD[2]);
  if (big) { fd(p, x + 1, y, VERD[3]); fd(p, x + 1, y + 0.5, VERD[2]); fd(p, x + 0.5, y + 1, VERD[2]); fd(p, x + 1, y + 1, VERD[1]); }
}
// Metall-Kuppel (Schulterstück, Scheibe): 5 Stufen nach Licht von oben links, Glanzlinie als Bogen
const LX = -0.6, LY = -0.75;
function metalShade(ramp5, gl) {
  return (u, v) => {
    const d = u * LX + v * LY, r2 = u * u + v * v;
    if (gl && r2 > 0.3 && r2 < 0.55 && d > 0.35) return gl;
    return ramp5[d > 0.55 ? 4 : d > 0.15 ? 3 : d > -0.25 ? 2 : d > -0.6 ? 1 : 0];
  };
}

// ================================================================ Grabunhold (barrow_wight)

const WW = 72, WH = 56, WAX = 32, WAY = 50;
const WD = { legH: 13, thigh: 6.5, shin: 7, spine: 10, upper: 5.5, fore: 5.5, sh: 1.5, hipW: 1.5 };
const W_REST = {
  hipX: 0, hipY: 0, lean: 0.1, head: 0, fFx: 4, fFy: 0, fBx: -4, fBy: 0,
  hFx: 6, hFy: 7, hBx: 6, hBy: 4, sw: -0.9, sh: 0, grab: 0.4, cape: 0.15, capeT: 0, eye: 1, wph: 0, soul: 1, slump: 0,
};
const wpose = (o = {}) => ({ ...W_REST, ...o });

// Blattschwert aus Bronze (Griffangel mit Knauf, blattförmige Klinge, Mittelgrat)
function drawBronzeSword(p, g, hx, hy, a, glowK) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  p.line(hx - dx * 2.5, hy - dy * 2.5, hx + dx, hy + dy, WOODB[2]);
  p.px(hx - dx * 3, hy - dy * 3, BRZ[5]); p.px(hx - dx * 3.5, hy - dy * 3.5, BRZ[3]);
  // Parierstange (sichelförmig)
  for (let k = -2; k <= 2; k += 0.5) p.px(hx + dx * (1.5 + Math.abs(k) * 0.3) + nx * k, hy + dy * (1.5 + Math.abs(k) * 0.3) + ny * k, k < 0 ? BRZ[5] : BRZ[3]);
  const L = 15;
  if (p.fine) {
    // Handfein: Klinge in Feinpixeln, 5 Stufen (Schattenkante, Flanke, Licht-Flanke, Mittelgrat, Schneide),
    // Glanzlinie auf dem Grat, Grünspan als kleine Krusten, Scharten in der Schneide
    for (let s = 2; s <= L; s += 0.25) {
      const f = (s - 2) / (L - 2);
      const hw = 0.7 + Math.sin(Math.min(1, f * 1.15) * Math.PI) * 0.6 - (f > 0.85 ? (f - 0.85) * 5 : 0);
      const nick = (Math.round(s * 2) === 17 || Math.round(s * 2) === 23) ? 0.3 : 0;
      for (let k = -hw; k <= hw + 0.01; k += 0.25) {
        if (k > hw - nick - 0.01 && nick) continue;
        let c = k > hw - 0.35 ? BRZ[6] : k < -hw + 0.35 ? BRZ[1] : Math.abs(k) < 0.2 ? BRZ[5] : k > 0 ? BRZ[4] : k < -hw + 0.7 ? BRZ[2] : BRZ[3];
        if (Math.abs(k + 0.12) < 0.13 && s > 3 && s < L - 1.5) c = BRZ[6];
        const ws = Math.round(s), wk = Math.round(k * 2);
        if (k < 0 && Math.abs(k) < hw - 0.35 && hash2(ws, wk, 81) < 0.16) c = (k < -hw + 0.7) ? VERD[2] : VERD[3];
        const x = hx + dx * s - nx * k, y = hy + dy * s - ny * k;
        fd(p, x, y, c);
        if (glowK > 0 && k > hw - 0.35) fd(g, x, y, glowK > 0.7 ? GH[4] : GH[1]);
        else if (glowK > 0.7 && k > hw - 0.7) fd(g, x, y, GH[2]);
      }
    }
    // Glanzpunkt an der Wurzel der Schneide, Griffwicklung, Knauf mit Licht
    fd(p, hx + dx * 4 - nx * 0.6, hy + dy * 4 - ny * 0.6, '#fff4d8');
    for (let s = -2; s <= 0.5; s += 0.5) fd(p, hx + dx * s - nx * 0.4, hy + dy * s - ny * 0.4, (Math.round(s * 2) & 1) ? WOODB[4] : WOODB[1]);
    fd(p, hx - dx * 3 - nx * 0.4, hy - dy * 3 - ny * 0.4, BRZ[6]); fd(p, hx - dx * 3.5 + nx * 0.4, hy - dy * 3.5 + ny * 0.4, BRZ[1]);
    fd(p, hx + dx * 1.5 - nx * 1.8, hy + dy * 1.5 - ny * 1.8, BRZ[6]);
    return { x: hx + dx * L, y: hy + dy * L };
  }
  for (let s = 2; s <= L; s += 0.5) {
    const f = (s - 2) / (L - 2);
    const hw = 0.7 + Math.sin(Math.min(1, f * 1.15) * Math.PI) * 0.6 - (f > 0.85 ? (f - 0.85) * 5 : 0);
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      let c = k > hw - 0.6 ? BRZ[6] : k < -hw + 0.6 ? BRZ[2] : Math.abs(k) < 0.3 ? BRZ[5] : k > 0 ? BRZ[4] : BRZ[3];
      const x = hx + dx * s - nx * k, y = hy + dy * s - ny * k;
      if (Math.abs(k) < hw - 0.6 && hash2(Math.round(s * 2), Math.round(k * 2), 81) < 0.14) c = VERD[3];
      p.px(x, y, c);
      if (glowK > 0 && k > hw - 0.6) g.px(x, y, glowK > 0.7 ? GH[3] : GH[1]);
    }
  }
  return { x: hx + dx * L, y: hy + dy * L };
}

// Mit Leichentuch umwickeltes Glied: Tuchstreifen quer über dem Schaft
function wrapLimb(p, x0, y0, x1, y1, w0, w1, near, seed) {
  const R = near ? [SHR[1], SHR[2], SHR[3], SHR[4]] : [SHR[0], SHR[1], SHR[1], SHR[2]];
  limb(p, x0, y0, x1, y1, w0, w1, R);
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
  if (p.fine) {
    // Handfein: schräg umlaufende Binden – helle Wicklungskante oben, dunkle Fuge darunter, ein loses Ende
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    const nx = -uy, ny = ux;
    for (let i = 0; i <= n * 2; i++) {
      const t = (i + 0.5) / (n * 2 + 1) + (hash2(i, seed, 88) - 0.5) * 0.06;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, hw = ((w0 + (w1 - w0) * t) / 2) * 0.9;
      const sl = 0.55;   // Schräge der Wicklung
      const ax = cx + nx * hw - ux * sl, ay = cy + ny * hw - uy * sl, bx = cx - nx * hw + ux * sl, by = cy - ny * hw + uy * sl;
      fl(p, ax, ay, bx, by, near ? (i & 1 ? SHR[4] : SHR[5]) : SHR[2]);
      fl(p, ax + ux * 0.5, ay + uy * 0.5, bx + ux * 0.5, by + uy * 0.5, near ? SHR[1] : SHR[0]);
    }
    if (near) { const t = 0.35 + hash2(seed, 2, 89) * 0.3, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t; fl(p, cx - nx * 1.2, cy - ny * 1.2, cx - nx * 1.2 - 1, cy - ny * 1.2 + 1.5, SHR[3]); }
    return;
  }
  for (let i = 1; i < n; i++) {
    const t = i / n + (hash2(i, seed, 88) - 0.5) * 0.15;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    p.px(x - 0.5, y, near ? SHR[5] : SHR[3]); p.px(x + 0.5, y + 0.5, near ? SHR[1] : SHR[0]);
  }
}

// Knochenklaue (Hand ohne Haut)
function claw(p, x, y, a, open, near) {
  const c = near ? [BN[2], BN[4]] : [BN[1], BN[2]];
  p.rect(x - 1, y - 1, 2, 2, c[0]); p.px(x - 1, y - 1, c[1]);
  if (p.fine) {
    // Handfein: drei dünne Fingerknochen (2 Glieder, Gelenkkerbe dazwischen), Knöchel im Licht, spitze Kralle
    fd(p, x - 1, y - 1, near ? BN[5] : BN[3]); fd(p, x + 0.5, y + 0.5, near ? BN[1] : BN[0]);
    for (let i = -1; i <= 1; i++) {
      const fa = a + i * (0.35 + open * 0.3), cx = Math.cos(fa), cy = Math.sin(fa);
      const kx = x + cx * 2, ky = y + cy * 2;
      fl(p, x + cx, y + cy, kx - cx * 0.4, ky - cy * 0.4, i === -1 ? c[1] : c[0]);
      fl(p, kx + cx * 0.3, ky + cy * 0.3, x + cx * 3.2, y + cy * 3.2, i === -1 ? c[1] : c[0]);
      fd(p, kx - cy * 0.3, ky + cx * 0.3, near ? BN[0] : MUM[0]);          // Gelenkkerbe
      fd(p, x + cx * 3.4, y + cy * 3.4, near ? BN[5] : BN[3]);              // Kralle
    }
    return;
  }
  for (let i = -1; i <= 1; i++) {
    const fa = a + i * (0.35 + open * 0.3);
    p.line(x + Math.cos(fa), y + Math.sin(fa), x + Math.cos(fa) * 3, y + Math.sin(fa) * 3, i === -1 ? c[1] : c[0]);
  }
}

function drawWight(p, g, P, X) {
  const R = rig(P, WD, WAX, WAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const soul = P.soul;

  // --- 1. Leichentuch-Umhang hinten (zerfetzt, mit Löchern)
  const top = pt(WD.spine, -1.5);
  for (let i = 0; i < 8; i++) {
    const len = 16 + (hash2(i, 3, 91) * 5 | 0) - i * 0.5 - P.slump * 3;
    const ci = i === 0 ? 5 : i < 2 ? 4 : i < 4 ? 3 : i < 6 ? 2 : 1;
    if (p.fine) {
      // Handfein: jede Bahn als Tuchstreifen – Lichtseite links, Faltenschatten rechts (zweifarbig),
      // Löcher je Weltpixel (ruhig), ausgefranstes Ende läuft spitz aus
      for (let j = 0; j < len; j += 0.5) {
        const v = j / len;
        if (v > 0.5 && hash2(i, Math.floor(j), 92) < 0.2) continue;
        const x = top.x - 1 - i * 0.75 - P.cape * 9 * v * v + Math.sin(P.capeT + v * 3 + i * 0.8) * 1 * v;
        const y = top.y + j + i * 0.25, tail = j > len - 1.5;
        fd(p, x - 0.25, y, SHR[ci]);
        if (!tail) fd(p, x + 0.25, y, SHR[Math.max(0, ci - (i & 1))]);

      }
      continue;
    }
    for (let j = 0; j < len; j++) {
      const v = j / len;
      if (v > 0.5 && hash2(i, j, 92) < 0.2) continue; // Löcher
      const x = top.x - 1 - i * 0.75 - P.cape * 9 * v * v + Math.sin(P.capeT + v * 3 + i * 0.8) * 1 * v;
      const y = top.y + j + i * 0.25;
      p.px(x, y, SHR[ci]);
    }
  }

  // --- 2. hinteres Bein
  wrapLimb(p, hip.x - 1, hip.y, legB.jx, legB.jy, 3, 2.5, false, 1);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 3, 2.5, [BRZ[0], BRZ[1], BRZ[2], BRZ[3]], BRZ[4]);
  p.rect(legB.ex - 1, legB.ey - 1, 4, 1, SHR[1]);
  if (p.fine) { rivet(p, legB.jx + 0.2, legB.jy + 1.5, BRZ[4], BRZ[0]); fl(p, legB.ex - 1, legB.ey - 1, legB.ex + 2.5, legB.ey - 1, SHR[2]); }

  // --- 3. hinterer Arm: dürr, Knochenklaue greift nach vorn
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 2.2, 1.8, [MUM[0], MUM[1], MUM[2], MUM[3]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.8, 1.6, [MUM[0], MUM[1], MUM[2], MUM[2]]);
  if (p.fine) {
    // Mumienhaut: Sehnenstrang im Licht, eine Binde am Handgelenk
    fl(p, shB.x - 0.3, shB.y + 0.6, armB.jx - 0.3, armB.jy - 0.2, MUM[4]);
    const wx = armB.jx + (armB.ex - armB.jx) * 0.7, wy = armB.jy + (armB.ey - armB.jy) * 0.7;
    fl(p, wx - 0.8, wy - 0.6, wx + 0.6, wy + 0.8, SHR[3]); fl(p, wx - 0.3, wy - 0.6, wx + 1, wy + 0.6, SHR[1]);
  }
  claw(p, armB.ex, armB.ey, Math.atan2(armB.ey - armB.jy, armB.ex - armB.jx), P.grab ?? 0.5, false);
  if (P.grab > 0.8 && soul > 0.3) {
    g.px(armB.ex + 2, armB.ey, GH[2]); g.px(armB.ex + 3, armB.ey + 1, GH[1]);
    if (p.fine) { fd(g, armB.ex + 2, armB.ey, GH[4]); fd(g, armB.ex + 2.5, armB.ey + 0.5, GH[3]); }
  }

  // --- 4. Rumpf: Lederstreifen-Schurz, eingefallener Leib, Bronze-Brustpanzer
  for (let i = 0; i < 5; i++) {
    const a = pt(-0.5, -3 + i * 1.6);
    const sw = Math.sin(P.capeT + i) * 0.5 + P.lean * 2;
    const l = 6 - Math.abs(i - 2) * 0.6;
    if (p.fine) {
      // Lederstreifen: Lichtkante links, Naht als Punktlinie, Bronze-Endbeschlag mit Niete
      for (let j = 0; j < l; j += 0.5) {
        const x = a.x + sw * j * 0.15, y = a.y + j;
        if (j < 1) { fd(p, x - 0.25, y, BRZ[5]); fd(p, x + 0.25, y, BRZ[3]); continue; }
        fd(p, x - 0.25, y, i % 2 ? SHR[3] : SHR[4]); fd(p, x + 0.25, y, (j * 2) % 2 === 1 && j < l - 1.5 ? SHR[1] : (i % 2 ? SHR[2] : SHR[3]));
      }
      const ex = a.x + sw * (l - 1) * 0.15, ey = a.y + l - 1;
      fd(p, ex - 0.25, ey, BRZ[5]); fd(p, ex + 0.25, ey, BRZ[3]); fd(p, ex - 0.25, ey + 0.5, BRZ[3]); fd(p, ex + 0.25, ey + 0.5, BRZ[1]);
      fd(p, ex - 0.25, ey - 0.25, BRZ[6]);
      continue;
    }
    for (let j = 0; j < l; j++) p.px(a.x + sw * j * 0.15, a.y + j, j === 0 ? BRZ[4] : i % 2 ? SHR[2] : SHR[3]);
    p.px(a.x + sw * (l - 1) * 0.15, a.y + l - 1, BRZ[3]);
  }
  const hp = pt(0, 0), mp = pt(4, 0.2), cp = pt(WD.spine, 0.4);
  // Leib: dürr, Rippen unter der Haut
  limb(p, hp.x, hp.y, mp.x, mp.y, 5, 4.5, [MUM[0], MUM[1], MUM[2], MUM[3]]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let u = 1.5; u <= 3.5; u += 1) { q(u, 0.5, MUM[4]); q(u, 1.5, MUM[1]); q(u, -0.5, MUM[1]); }
  const fq = (u, k, c) => { const o = pt(u, k); fd(p, o.x, o.y, c); };
  if (p.fine) {
    // eingefallene Rippen: feine Bögen, Lichtkante oben, Schattenfuge darunter
    for (let u = 1.25; u <= 3.75; u += 1.25) for (let k = -1.5; k <= 2; k += 0.5) { fq(u + Math.abs(k - 0.3) * 0.15, k, k < 1 ? MUM[5] : MUM[4]); fq(u - 0.5 + Math.abs(k - 0.3) * 0.15, k, MUM[0]); }
  }
  // Brustpanzer (gewölbt, endet über dem Bauch)
  const bp = pt(4.5, 0.3);
  limb(p, bp.x, bp.y, cp.x, cp.y, 7, 8, [VERD[1], VERD[2], BRZ[3], BRZ[4]], BRZ[6], VERD[0]); // Schattenseite grün angelaufen
  q(4.5, -2.5, BRZ[1]); q(4.5, -1.5, BRZ[5]); q(4.5, -0.5, BRZ[5]); q(4.5, 0.5, BRZ[5]); q(4.5, 1.5, BRZ[4]); q(4.5, 2.5, BRZ[3]); // Unterkante
  q(7.5, 1.5, BRZ[2]); q(7, 2.5, BRZ[2]); q(8.5, 0, BRZ[6]); q(8.2, -1, BRZ[6]); q(9, 0.5, BRZ[5]);
  // Grünspan in zusammenhängenden Flecken (nicht als Einzelpixel)
  q(6, -2, VERD[2]); q(5.5, -2, VERD[2]); q(6, -2.5, VERD[3]); q(5.5, 2.5, VERD[2]); q(5.5, 3, VERD[3]); q(5, 3, VERD[2]);
  if (p.fine) {
    // Handfein: Brustwölbung (Muskelpanzer) als zweite Glanzlinie, Glanzpunkt, Krusten, Nietenreihe am Unterrand
    for (let k = -2.5; k <= 1; k += 0.5) fq(7.6 - k * k * 0.12, k, k < -1.6 ? BRZ[6] : BRZ[5]);
    for (let k = -2; k <= 1.5; k += 0.5) fq(6.6 - k * k * 0.1, k, BRZ[2]);
    fq(8.6, -1.4, '#fff2d0'); fq(8.6, -0.9, BRZ[6]);
    { const o = pt(6, -2.4); verdPatch(p, o.x, o.y, true); }
    for (let k = -2.5; k <= 2.5; k += 1.25) { const o = pt(4.9, k); rivet(p, o.x, o.y); }
  }
  // Riss im Panzer: dahinter glimmt das Geisterlicht
  const crack = [[8, 1.3], [7.2, 0.6], [6.5, 1.1], [5.8, 0.5]];
  for (const [u, k] of crack) { const o = pt(u, k); p.px(o.x, o.y, soul > 0.3 ? GH[2] : MUM[0]); if (soul > 0.3) g.px(o.x, o.y, soul > 0.8 ? GH[3] : GH[1]); }
  if (p.fine) {
    // Riss fein: dunkle Bruchkante, darin ein heißer Lichtfaden (Kern weiß, Saum türkis)
    for (let i = 0; i + 1 < crack.length; i++) {
      const a = pt(crack[i][0], crack[i][1]), b = pt(crack[i + 1][0], crack[i + 1][1]);
      fl(p, a.x - 0.5, a.y, b.x - 0.5, b.y, BRZ[0]);
      fl(p, a.x, a.y, b.x, b.y, soul > 0.3 ? (soul > 0.8 ? GH[5] : GH[4]) : MUM[0]);
      if (soul > 0.3) fl(g, a.x, a.y, b.x, b.y, soul > 0.8 ? GH[5] : GH[3]);
    }
  }
  // Gürtel mit Bronzescheiben
  for (let k = -3; k <= 3; k += 0.5) q(0.6, k, SHR[1]);
  for (let k = -2; k <= 3; k += 2.5) { q(0.6, k, BRZ[5]); q(0.6, k + 0.5, BRZ[3]); }
  if (p.fine) {
    for (let k = -3; k <= 3; k += 0.5) { fq(1, k, SHR[3]); fq(0.25, k, SHR[0]); }
    for (let k = -2; k <= 3; k += 2.5) { const o = pt(0.6, k + 0.25); ell(p, o.x, o.y, 0.6, 0.55, metalShade([BRZ[2], BRZ[3], BRZ[4], BRZ[5], BRZ[6]])); fd(p, o.x - 0.25, o.y - 0.25, '#fff2d0'); }
  }

  // --- 5. vorderes Bein
  wrapLimb(p, hip.x + 1, hip.y, legF.jx, legF.jy, 3.2, 2.8, true, 2);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 3.2, 2.8, [VERD[1], VERD[3], BRZ[4], BRZ[5]], BRZ[6], VERD[0]);
  p.px(legF.jx - 0.5, legF.jy - 0.5, BRZ[6]); p.px(legF.jx + 0.5, legF.jy + 2, VERD[3]);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, SHR[2]); p.px(legF.ex + 2, legF.ey - 1, SHR[3]);
  if (p.fine) {
    // Beinschiene: Knie-Buckel mit Glanzpunkt, Nieten am Rand, Grünspan, Bindenschuh mit Wicklung
    ell(p, legF.jx - 0.2, legF.jy - 0.2, 1.1, 1, metalShade([VERD[1], BRZ[3], BRZ[4], BRZ[5], BRZ[6]]));
    fd(p, legF.jx - 0.75, legF.jy - 0.75, '#fff2d0');
    const mx = (legF.jx + legF.ex) / 2, my = (legF.jy + legF.ey) / 2;
    rivet(p, mx + 0.6, my - 1.2); rivet(p, mx + 0.6, my + 1.3);
    fl(p, legF.ex - 1, legF.ey - 1, legF.ex + 1.5, legF.ey - 1, SHR[4]); fd(p, legF.ex + 2, legF.ey - 1, SHR[5]);
    fd(p, legF.ex, legF.ey - 0.5, SHR[0]); fd(p, legF.ex + 1.5, legF.ey - 0.5, SHR[1]);
  }

  // --- 6. Kopf: geschlossener Bronzehelm (korinthisch) mit Rosshaarbusch.
  // Im T-Schlitz glühen zwei kalte Geisteraugen.
  const neck = pt(WD.spine + 1.5, 0.6);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3.5);
  // Busch: Strähnen von der Stirn über den Scheitel nach hinten, Spitzen wehen
  if (p.fine) {
    // Handfein: Rosshaar in Strähnen – je Feinspalte eine Haarsträhne, in Bündeln hell/dunkel,
    // Spitzen kämmen nach hinten, lose Enden fallen hinten über den Helm
    // dicht gelegt (Spalten überlappen, keine Lücken), Bündel je 2 Feinspalten
    for (let i = 10.5; i >= 0; i -= 0.25) {
      const cx = hx + 1.5 - i * 0.9 - P.cape * i * 0.2, cy = hy - 7 + i * 0.3 + (i * i) * 0.05;
      const ib = Math.floor(i * 2), h = 4.6 - Math.abs(i - 3) * 0.3 + (hash2(ib, 1, 96) - 0.5) * 0.6;
      const b = ib % 4, lit = i < 4;
      const base = b === 0 ? CREST[1] : b === 3 ? CREST[2] : lit ? CREST[3] : CREST[2];
      const lean = -0.3 - P.cape * 0.4;
      fl(p, cx, cy + 0.5, cx + lean * 0.5, cy - h + 1.5, base);
      fd(p, cx + lean * 0.6, cy - h + 1, b === 1 || b === 2 ? CREST[4] : CREST[3]);
      if (b === 1 && lit) fd(p, cx + lean * 0.75, cy - h + 0.5, '#c25a40');
      if (i > 5.5 && (ib & 1)) fl(p, cx - 0.25, cy + 0.5, cx - 0.5, cy + 1.5 + Math.sin(P.capeT + ib) * 0.6, CREST[b < 2 ? 1 : 2]);
    }

    // Buschhalter (Bronzeleiste auf dem Scheitel)
    fl(p, hx - 3.5, hy - 6.5, hx + 1, hy - 7, BRZ[5]);
  } else {
    for (let i = 0; i < 11; i++) {
      const cx = hx + 1.5 - i * 0.9 - P.cape * i * 0.2, cy = hy - 7 + i * 0.3 + (i * i) * 0.05;
      const h = 4.6 - Math.abs(i - 3) * 0.3;
      for (let j = 0; j < h; j++) {
        const top = j >= Math.ceil(h) - 1;
        p.px(cx, cy - j, top ? CREST[i < 4 ? 4 : 3] : (i + j) % 3 === 0 ? CREST[1] : CREST[2 + (i < 3 ? 1 : 0)]);
      }
      if (i > 5) p.px(cx - 0.5, cy + 1 + Math.sin(P.capeT + i) * 0.6, CREST[i & 1 ? 1 : 2]);
    }
  }
  const HB = { s: BRZ[6], h: BRZ[5], l: BRZ[4], m: BRZ[3], d: BRZ[2], o: BRZ[1], v: VERD[2], V: VERD[3], k: '#050608', f: MUM[1], F: MUM[2], e: GH[4], r: BRZ[5] };
  // Halstuch aus Leichentuch trennt Helm und Panzer
  const nk = pt(WD.spine + 0.6, 0.4);
  ell(p, nk.x, nk.y, 3.2, 1.6, SHR[2]); ell(p, nk.x - 0.6, nk.y - 0.5, 2.2, 0.8, SHR[4]);
  p.px(nk.x + 2, nk.y + 1, SHR[1]); p.px(nk.x - 3, nk.y + 1, SHR[3]); p.px(nk.x - 3.5, nk.y + 2.5, SHR[2]);
  if (p.fine) { fl(p, nk.x - 2.5, nk.y - 0.5, nk.x + 1, nk.y - 1.2, SHR[5]); fl(p, nk.x - 2, nk.y + 0.5, nk.x + 2, nk.y, SHR[1]); fl(p, nk.x - 3, nk.y + 1.5, nk.x - 3.5, nk.y + 2.5, SHR[4]); }
  // T-Sehschlitz: Querbalken mit zwei Geisteraugen (fernes Auge schwächer),
  // darunter der senkrechte Schlitz; Brauenband dunkel, damit die Augen strahlen.
  const eyeOn = P.eye > 0.3;
  pmap(p, hx - 6, hy - 7, [
    '...lhhhl...',
    '..lhsshllm.',
    '.lhsshhlmmd',
    '.hshhllmmdd',
    'lhllmmmmmdd',
    'hrddooooood',
    'lmmmmkakkek',
    'llmvmmokkol',
    'dmmmmmmkkdd',
    '.dmmmvdkkd.',
    '..ooddd.o..',
  ], { ...HB, a: eyeOn ? GH[3] : '#050608', e: eyeOn ? GH[4] : '#050608' });
  if (p.fine) {
    // Handfein (Feinpixel relativ zur Helmkarte): Glanzlinie und -punkt auf der Kuppel, Nieten im Stirnband,
    // eingravierte Wangenklappen-Kante (Ritzlinie dunkel + Lichtgrat), Grünspan-Krusten
    const H0x = hx - 6, H0y = hy - 7, hd = (x, y, c) => p.dot(H0x + x / 2 + 0.1, H0y + y / 2 + 0.1, c);
    for (const [x, y] of [[4, 7], [5, 6], [6, 5], [7, 4], [8, 4], [9, 3], [10, 2], [11, 2]]) hd(x, y, '#e4cc90');
    hd(9, 3, '#fffbe8'); hd(12, 1, BRZ[6]); hd(13, 1, BRZ[5]);
    for (const [x, y] of [[3, 9], [4, 8], [5, 8]]) hd(x, y, BRZ[5]);                   // Lichtkante überm Stirnband
    for (const x of [6, 10, 14]) { hd(x, 10, BRZ[5]); hd(x + 1, 11, BRZ[0]); }          // Nieten
    hd(2, 10, '#fff2d0'); hd(3, 11, BRZ[3]);
    for (const [x, y] of [[3, 13], [3, 14], [4, 15], [4, 16], [5, 17], [6, 18], [7, 19]]) { hd(x, y, BRZ[1]); hd(x - 1, y, BRZ[5]); }
    hd(17, 14, BRZ[4]); hd(17, 15, BRZ[3]); hd(20, 14, BRZ[3]);                         // Kante der Wangenklappe vorn
    verdPatch(p, H0x + 3, H0y + 7, true);
    if (eyeOn) {
      // Augen: weißer Kern im türkisen Saum (fernes Auge schwächer)
      hd(18, 12, GH[5]); hd(19, 12, GH[4]); hd(18, 13, GH[4]); hd(19, 13, GH[3]);
      hd(12, 12, GH[4]); hd(13, 12, GH[3]); hd(12, 13, GH[3]); hd(13, 13, GH[2]);
      g.dot(H0x + 9.1, H0y + 6.1, GH[5]); g.dot(H0x + 9.6, H0y + 6.6, GH[3]);
    }
  }
  if (eyeOn) {
    const b = Math.min(1, P.eye);
    // nahes Auge (hx+3): heller Kern, knapper kalter Schein (Schlitz bleibt dunkel)
    g.px(hx + 3, hy - 1, GH[5]); g.px(hx + 4, hy - 1, GH[2]); g.px(hx + 2, hy - 1, GH[1]);
    if (b > 0.6) { g.px(hx + 3, hy - 2, GH[1]); g.px(hx + 5, hy - 1, GH[1]); }
    // fernes Auge (hx): etwas schwächer
    g.px(hx, hy - 1, GH[4]); g.px(hx - 1, hy - 1, GH[1]);
    // schwacher Geisterhauch aus dem Schlitz, nur auf der Leucht-Ebene
    if (p.fine) for (let i = 0; i < 4; i += 0.5) { fd(g, hx + 5 + i * 0.6, hy - 2 - i + Math.sin(P.wph + i) * 0.5, GH[i < 1 ? 4 : i < 2 ? 3 : 2]); if (i < 2.5) fd(g, hx + 5.5 + i * 0.6, hy - 2 - i + Math.sin(P.wph + i) * 0.5, GH[1]); }
    else for (let i = 0; i < 4; i++) g.px(hx + 5 + i * 0.6, hy - 2 - i + Math.sin(P.wph + i) * 0.5, GH[i < 2 ? 2 : 1]);
  }
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 7 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  // --- 7. vorderer Arm + Schwert
  if (X.smear) smearArc(p, g, shF.x, shF.y + 1, X.smear[0], X.smear[1], 8, 19, GH_EDGE, GH_EDGE_G, X.smear[2] ?? 0.8);
  wrapLimb(p, shF.x, shF.y, armF.jx, armF.jy, 2.8, 2.3, true, 3);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.8, 2.6, [VERD[1], VERD[3], BRZ[4], BRZ[5]], BRZ[6], VERD[0]);
  if (p.fine) {
    // Schulterstück: gewölbte Bronze in 5 Stufen mit Glanzbogen, Rand, Niete und Grünspan
    ell(p, shF.x, shF.y, 2.8, 2.2, metalShade([VERD[1], BRZ[3], BRZ[4], BRZ[5], BRZ[6]], '#e4cc90'));
    fd(p, shF.x - 1.25, shF.y - 1.25, '#fffbe8');
    fl(p, shF.x - 2.5, shF.y + 1.5, shF.x + 2, shF.y + 2.2, BRZ[1]);
    rivet(p, shF.x + 1, shF.y + 0.5); verdPatch(p, shF.x + 1.5, shF.y + 1.25);
    const bx = (armF.jx + armF.ex) / 2, by = (armF.jy + armF.ey) / 2;
    rivet(p, bx, by - 0.2); fd(p, armF.jx - 0.5, armF.jy - 0.5, '#fff2d0');
  } else {
    ell(p, shF.x, shF.y, 2.8, 2.2, BRZ[3]); ell(p, shF.x - 0.5, shF.y - 0.7, 1.8, 1.2, BRZ[5]);
    p.px(shF.x - 2, shF.y - 1, BRZ[6]); p.px(shF.x + 1.5, shF.y + 1.5, VERD[3]);
  }
  const tip = drawBronzeSword(p, g, armF.ex, armF.ey, P.sw, X.bladeGlow ?? 0);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BN[2]); p.px(armF.ex - 1, armF.ey - 1, BN[4]);
  if (p.fine) { fd(p, armF.ex - 1, armF.ey - 1, BN[5]); fd(p, armF.ex - 0.5, armF.ey - 0.5, BN[1]); fd(p, armF.ex + 0.5, armF.ey - 1, BN[4]); fd(p, armF.ex + 0.5, armF.ey + 0.5, BN[0]); }
  meta.hand = { x: armF.ex, y: armF.ey };
  meta.tip = tip;
  return meta;
}

function wightAnims() {
  const mk = (P, X) => makeFrame(WW, WH, WAX, WAY, drawWight, P, X);
  const idleA = wpose();
  const idleB = wpose({ hipY: 1, lean: 0.14, hFy: 7.5, hBy: 5.5, head: 0.4, sw: -0.8, capeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const k = (1 - Math.cos(i / 6 * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, k), wph: i / 6 * TAU }));
  }
  // Schlurfender, schwerer Gang: Schwert hängt, Schild vorgehalten
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(wpose({
      hipY: -Math.abs(c) * 0.8 + 0.8, lean: 0.16 + Math.abs(s) * 0.03, fFx: 1 + s * 5, fFy: Math.max(0, -c) * 2,
      fBx: -1 - s * 5, fBy: Math.max(0, c) * 2, hFx: 6 - s * 1.2, hBx: 5 + s * 1, hFy: 7 + Math.abs(s) * 0.5,
      sw: -0.85 + s * 0.08, cape: 0.45, capeT: ph, head: s * 0.4, wph: ph,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Ausholen: Schwert hoch über die Schulter nach hinten, Schild vor
  const w1 = wpose({ lean: 0.02, hipX: -0.5, hFx: 1, hFy: -3, sw: -2.2, hBx: 8, hBy: 2, grab: 0.8, fFx: 5, fBx: -5, cape: 0.2, wph: 1 });
  const w2 = wpose({ lean: -0.1, hipX: -1.5, hipY: 1, hFx: -2, hFy: -6, sw: -2.75, hBx: 9, hBy: 1, grab: 1, fFx: 6, fBx: -5, cape: 0.3, capeT: 1, wph: 2 });
  const w3 = { ...w2, hFx: -3, hFy: -6.5, sw: -2.95, lean: -0.13, wph: 3 };
  const windup = [mk(mixP(idleA, w1, 0.5)), mk(w1), mk(w2, { bladeGlow: 0.5 }), mk(w3, { bladeGlow: 1 })];
  // Hieb: schräg von oben nach vorn unten, Geisterlicht auf der Schneide
  const s1 = wpose({ lean: 0.2, hipX: 1, hipY: 1, hFx: 7, hFy: -4, sw: -1.3, hBx: 4, hBy: 5, fFx: 7, fBx: -5, cape: 0.6, capeT: 2, wph: 4 });
  const s2 = wpose({ lean: 0.36, hipX: 2.5, hipY: 2.5, hFx: 10, hFy: 6, sw: 0.55, hBx: 2, hBy: 6, fFx: 8, fBx: -5, cape: 0.9, capeT: 3, wph: 5 });
  const s3 = wpose({ ...s2, lean: 0.32, hFx: 9, hFy: 8, sw: 0.9, capeT: 4, wph: 6 });
  const s4 = wpose({ lean: 0.18, hipX: 1, hipY: 1, hFx: 7, hFy: 7, sw: 0.1, hBx: 4, hBy: 5, fFx: 6, fBx: -5, cape: 0.3, capeT: 5, wph: 7 });
  const strike = [
    mk(s1, { smear: [-2.9, -1.3, 1], bladeGlow: 1 }),
    mk(s2, { smear: [-2.2, 0.55, 1], bladeGlow: 1, fx: 'impact' }),
    mk(s3, { smear: [-0.4, 0.9, 1], bladeGlow: 0.5 }),
    mk(s4),
    mk(mixP(s4, idleA, 0.6)),
  ];
  const hurtP = wpose({ lean: -0.18, hipX: -1.5, head: -1, hFx: 4, hFy: 5, sw: -1.4, hBx: 7, hBy: 3, sh: 0.6, cape: -0.2, wph: 2 });
  const hurt = [mk(hurtP, { bladeGlow: 0 }), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: Geisterlicht erlischt, der Leib sackt in sich zusammen und kippt nach vorn
  const d1 = { ...hurtP, lean: -0.26, hipX: -2, wph: 3 };
  const d2 = wpose({ hipY: 4, lean: 0.25, head: 1.5, hFx: 6, hFy: 11, sw: 1.2, hBx: 5, hBy: 10, fFx: 5, fBx: -4, eye: 0.7, soul: 0.7, slump: 0.5, wph: 4 });
  const d3 = { ...d2, hipY: 6, lean: 0.4, head: 2, eye: 0.4, soul: 0.4, slump: 1, wph: 5 };
  const piv = [WAX + 3, WAY - 1];
  const flat = { ...d3, hipY: 5, lean: 0.1, hFx: 5, hFy: 10, hBy: 10, sw: 1.5, eye: 0, soul: 0, wph: 6 };
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [0.45, ...piv] }), mk(d3, { rot: [1.05, ...piv] }),
    mk({ ...flat, eye: 0.3, soul: 0.2 }, { rot: [Math.PI / 2 - 0.08, piv[0], piv[1]], fx: 'impact' }),
    mk(flat, { rot: [Math.PI / 2, piv[0], piv[1]] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 8, false),
    strike: new Animation(strike, 15, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Grabhund (grave_hound)

const HW = 60, HH = 40, HAX = 27, HAY = 36;
const HFUR = ['#0c1012', '#161d20', '#222c30', '#324044', '#465856', '#5e726c', '#7e9488', '#a2b8aa'];
const H_REST = { leap: 0, t: 0, amp: 0, bob: 0, crouch: 0, head: 0, up: 0, jaw: 0, lunge: 0, pitch: 0, lie: 0, eye: 1, fl: 0, soul: 1, gallop: 0, tail: 0 };
const hpose = (o = {}) => ({ ...H_REST, ...o });

function drawHound(p, g, P, X) {
  const gy = HAY, ox = HAX - 13 + P.lunge;
  const meta = {};
  const lie = P.lie;
  const by = gy - 16 + P.crouch + P.bob + lie * 10;          // Rückenlinie Mitte
  const Y = (x, y) => y + (x - 13) * P.pitch * 0.12;
  const soul = P.soul;

  // --- Beine (dürr, drei Glieder; Hinterbein mit Sprunggelenk)
  const leg = (xh, ph, near, front) => {
    const ramp = near ? [HFUR[2], HFUR[3], HFUR[4], HFUR[5]] : [HFUR[0], HFUR[1], HFUR[2], HFUR[3]];
    const hipY = Y(xh, by + (front ? 6 : 4));
    if (lie > 0.6) {
      const ly = gy - 2 - (near ? 0 : 2);
      limb(p, ox + xh, hipY, ox + xh + (front ? 6 : -5), ly, 2, 1.5, ramp);
      p.px(ox + xh + (front ? 7 : -6), ly, ramp[1]);
      return;
    }
    const a = P.t * TAU + ph;
    let fx = Math.sin(a) * (P.gallop ? 4.5 : 3.4) * P.amp, lift = Math.max(0, Math.cos(a)) * 2.6 * P.amp;
    const footY = gy - lift - lie * 2 - (front ? P.leap * 4 : P.leap * 0.5);
    const footX = ox + xh + fx + (front ? 1 + P.leap * 5 : -P.leap * 4);
    if (front) {
      const ex = ox + xh + fx * 0.3 - 0.5, ey = hipY + 4.5 - P.crouch * 0.3;
      const wx = footX - 0.5 + fx * 0.15, wy = footY - 3;
      limb(p, ox + xh, hipY - 1, ex, ey, 3.2, 2, ramp);
      limb(p, ex, ey, wx, wy, 1.6, 1.4, ramp);
      limb(p, wx, wy, footX, footY - 1, 1.4, 1.4, ramp);
    } else {
      const kx = ox + xh + 2 + fx * 0.4, ky = hipY + 3.5;
      const hx = footX - 2.5 + fx * 0.1, hy = footY - 4 + P.crouch * 0.3;
      limb(p, ox + xh, hipY - 1, kx, ky, 4, 2.5, ramp);
      limb(p, kx, ky, hx, hy, 2, 1.6, ramp);
      limb(p, hx, hy, footX, footY - 1, 1.5, 1.4, ramp);
      p.px(hx - 0.5, hy, ramp[3]);
    }
    p.rect(footX - 1, footY - 1, 3, 1, near ? HFUR[1] : HFUR[0]);
    p.px(footX + 2, footY - 1, near ? BN[2] : BN[1]); // Kralle
    if (p.fine) {
      // Fellsträhnen am Oberschenkel (nach unten gekämmt), Zehen mit Fugen, Krallen mit Lichtspitze
      const ux = front ? 0.2 : 0.55, ul = front ? 3.4 : 3;
      for (let k = 0; k < 3; k++) {
        const sx = ox + xh - 0.8 + k * 0.7, sy = hipY - 1 + k * 0.3;
        fl(p, sx, sy, sx + ux * ul * 0.6 - 0.3, sy + ul * (0.6 + k * 0.1), k === 0 ? ramp[3] : k === 2 ? ramp[0] : ramp[2]);
      }
      fd(p, footX - 0.5, footY - 1, near ? HFUR[3] : HFUR[1]); fd(p, footX + 0.5, footY - 0.5, HFUR[0]); fd(p, footX + 1, footY - 1, near ? HFUR[3] : HFUR[1]);
      fd(p, footX + 2, footY - 1, near ? BN[4] : BN[2]); fd(p, footX + 2.5, footY - 0.5, near ? BN[1] : BN[0]);
    }
  };
  const gal = P.gallop > 0.5;
  leg(4, 0, false, false);
  leg(20, gal ? 0.5 : Math.PI, false, true);

  // --- Schwanz: dünn, endet in Geisterfahne
  const tw = Math.sin(P.t * TAU * 2 + P.fl) * 1 * (0.4 + P.amp) + P.tail;
  const tx0 = ox + 1, ty0 = Y(1, by + 1);
  const tpts = [[tx0, ty0], [tx0 - 3, ty0 + 1 - tw * 0.3], [tx0 - 6, ty0 + 2.5 - tw], [tx0 - 8, ty0 + 5 - tw * 1.3]];
  for (let i = 0; i < 3; i++) limb(p, tpts[i][0], tpts[i][1], tpts[i + 1][0], tpts[i + 1][1], 1.8 - i * 0.3, 1.4 - i * 0.3, [HFUR[1], HFUR[2], HFUR[3], HFUR[4]]);
  if (soul > 0.2) wisp(p, g, tpts[3][0], tpts[3][1], 6, P.fl + P.t * TAU, -1, -0.2, soul);

  // --- Rumpf: ausgezehrter Knochenhund. Fell nur noch an der Hinterhand,
  // der Brustkorb liegt frei (Rippenbögen), dazwischen glimmt die Seele.
  // Buckel über den Schultern: Wirbelsäule steigt nach vorn an.
  const flat = 1 - lie * 0.35;
  const hump = (x) => 2.4 * Math.max(0, 1 - Math.abs(x - 18) / 8) * flat;
  const spY = (x) => Y(x, by + 0.6 - hump(x));
  // Hinterhand mit zerfetztem Fell
  ell(p, ox + 5, Y(5, by + 3), 4.5, 3.6 * flat, HFUR[2]);
  ell(p, ox + 5, Y(5, by + 1), 3, 1.4, HFUR[4]);
  for (let i = 0; i < 4; i++) p.px(ox + 8 + i * 0.7, Y(8, by + 3 + i * 0.9), HFUR[i % 2 ? 1 : 3]); // Fetzen
  if (p.fine) {
    // Handfein: Fell in Strähnen nach hinten-unten gekämmt (Licht oben hell, unten dunkel), zerfetzte Kante
    for (let i = 0; i < 14; i++) {
      const fx = 1.5 + (i % 5) * 1.6 + (i > 9 ? 0.8 : 0), fy = -0.5 + Math.floor(i / 5) * 1.8 * flat + (i & 1) * 0.4;
      const c = fy < 1 ? (i % 3 ? HFUR[6] : HFUR[7]) : fy < 2.6 ? (i % 2 ? HFUR[3] : HFUR[5]) : HFUR[0];
      fl(p, ox + fx, Y(fx, by + 1 + fy), ox + fx - 1.8, Y(fx - 1.8, by + 2 + fy), c);
      if (fy > 1) fd(p, ox + fx - 0.5, Y(fx, by + 1.5 + fy), HFUR[1]);

    }
    for (let i = 0; i < 5; i++) {
      const fx = 7.5 + i * 0.5, fy = by + 2.5 + i * 0.8;
      fl(p, ox + fx, Y(fx, fy), ox + fx - 0.3, Y(fx, fy + 1.2 + (i & 1) * 0.6), i & 1 ? HFUR[1] : HFUR[3]);
    }
  }
  // Beckenknochen tritt hervor
  p.line(ox + 2, Y(2, by + 0.5), ox + 6, Y(6, by + 0.2), BN[3]); p.px(ox + 3, Y(3, by - 0.2), BN[4]); p.px(ox + 6, Y(6, by + 1), BN[2]);
  if (p.fine) { fl(p, ox + 2, Y(2, by + 0.25), ox + 5.5, Y(5.5, by - 0.05), BN[5]); fd(p, ox + 4, Y(4, by + 0.75), BN[1]); fd(p, ox + 4.5, Y(4.5, by + 0.5), BN[0]); }
  // Sehnen zwischen Becken und Brustkorb (dünn, dunkel)
  p.line(ox + 7, Y(7, by + 2.5), ox + 13, Y(13, by + 4), HFUR[1]);
  p.line(ox + 7, Y(7, by + 1.6), ox + 13, Y(13, by + 2), HFUR[2]);
  if (p.fine) { fl(p, ox + 7, Y(7, by + 1.5), ox + 13, Y(13, by + 1.9), HFUR[4]); fl(p, ox + 7.5, Y(7.5, by + 3), ox + 13, Y(13, by + 4.3), HFUR[0]); }
  // Brusthöhle: dunkel, Seelenlicht in der Mitte
  const cavY = by + 4.2 - hump(18) * 0.3;
  ell(p, ox + 18.5, Y(18.5, cavY), 5.4, 4.6 * flat, HFUR[0]);
  ell(p, ox + 19, Y(19, cavY + 0.5), 4, 3.4 * flat, '#07090a');
  if (soul > 0.15) {
    const cx2 = ox + 18.5, cy2 = Y(18.5, by + 4.6 - hump(18) * 0.3);
    ell(p, cx2, cy2, 2.2, 1.7 * flat, GH[1]); ell(p, cx2, cy2, 1.2, 0.9, GH[2]); p.px(cx2, cy2, GH[soul > 0.9 ? 4 : 3]);
    ell(g, cx2, cy2, 3.4, 2.8 * flat, GH[0]); ell(g, cx2, cy2, 2.4, 1.9 * flat, GH[1]); ell(g, cx2, cy2, 1.3, 1, GH[3]); g.px(cx2, cy2, GH[5]);
    if (p.fine) {
      // Seelenkern: weißer Kern im türkisen Saum, ein Lichtfaden nach oben (fein, hart gestuft)
      fd(p, cx2 - 0.25, cy2 - 0.25, GH[5]); fd(p, cx2 + 0.25, cy2 - 0.25, GH[5]); fd(p, cx2 - 0.25, cy2 + 0.25, GH[4]);
      fd(g, cx2 - 0.25, cy2 - 0.25, GH[5]); fd(g, cx2 + 0.25, cy2 + 0.25, GH[5]);
      if (soul > 0.6) for (let k = 0; k < 3; k++) fd(g, cx2 + 0.25 - k * 0.5, cy2 - 1.25 - k * 0.5 + Math.sin(P.fl + k) * 0.5, GH[k ? 2 : 3]);
    }
  }

  // Rippenbögen: saubere, 1 px breite Bögen (oben hell, unten im Schatten),
  // dazwischen dunkle Lücken, durch die das Seelenlicht scheint
  for (let i = 0; i < 5; i++) {
    const rx = ox + 14.5 + i * 2.2, ry = spY(rx - ox) + 1;
    const len = (3.8 + Math.min(i, 2) * 1.1) * flat;
    let lx = rx, ly = ry;
    if (p.fine) {
      // Rippe als Knochenspange: Lichtkante vorn, Schatten hinten, Gelenkkerbe am Wirbel, Riss in der Mitte
      for (let j = 0.5; j <= Math.ceil(len); j += 0.5) {
        const f = j / len, x = rx - Math.sin(f * 2.2) * 1.6 + f * 0.3 * i, y = ry + j;
        fd(p, x - 0.25, y, f < 0.35 ? BN[5] : f < 0.75 ? BN[4] : BN[3]);
        fd(p, x + 0.25, y, f < 0.35 ? BN[3] : f < 0.75 ? BN[2] : BN[1]);
        lx = x; ly = y;
      }
      fd(p, rx + 0.25, ry + 0.5, BN[0]);                                   // Gelenkkerbe
      if (i === 1 || i === 3) { const f = 0.55, x = rx - Math.sin(f * 2.2) * 1.6 + f * 0.3 * i; fd(p, x - 0.25, ry + f * len, BN[1]); }
      fd(p, lx + 0.25, ly + 0.5, BN[1]);
      continue;
    }
    for (let j = 1; j <= Math.ceil(len); j++) {
      const f = j / len, x = rx - Math.sin(f * 2.2) * 1.6 + f * 0.3 * i, y = ry + j;
      p.px(x, y, f < 0.35 ? BN[4] : f < 0.75 ? BN[3] : BN[2]);
      lx = x; ly = y;
    }
    p.px(lx + 0.6, ly + 0.4, BN[1]);
  }
  // Brustbein-Spitze vorn
  p.px(ox + 23, Y(23, by + 7), BN[3]); p.px(ox + 22, Y(22, by + 7.5), BN[2]); p.px(ox + 21, Y(21, by + 8), BN[1]);
  // Wirbelsäule: durchgehender Strang mit Dornfortsätzen (gezackter Buckel)
  if (p.fine) {
    // Wirbelsäule fein: vier Stufen von oben nach unten, alle 1,25 px eine Gelenkkerbe zwischen den Wirbeln
    for (let x = 3; x <= 22.5; x += 0.5) {
      const y = spY(x), notch = Math.abs(((x - 3) % 1.25)) < 0.3 && x > 3.5 && x < 22;
      fd(p, ox + x, y - 0.25, notch ? BN[3] : BN[5]); fd(p, ox + x, y + 0.25, notch ? BN[1] : BN[3]);
      fd(p, ox + x, y + 0.75, notch ? BN[0] : BN[2]); fd(p, ox + x, y + 1.25, BN[1]);
    }
    // Dornfortsätze: spitz zulaufend, Licht vorn-oben, Schatten hinten, helle Spitze
    for (let x = 4; x <= 21; x += 2.5) {
      const y = spY(x);
      const h = x > 11 ? 2 + (Math.abs(x - 18) < 3.5 ? 1 : 0) : 1;
      for (let j = 0.5; j <= h; j += 0.5) {
        const tip = j > h - 0.6;
        fd(p, ox + x - j * 0.5 - 0.25, y - j, tip ? BN[5] : BN[4]);
        if (j < h - 0.75) fd(p, ox + x - j * 0.5 + 0.25, y - j, BN[2]);
      }
    }
  } else {
    for (let x = 3; x <= 22; x += 0.5) {
      const y = spY(x);
      p.px(ox + x, y, BN[3]); p.px(ox + x, y + 1, BN[1]);
    }
    for (let x = 4; x <= 21; x += 2.5) {
      const y = spY(x);
      const h = x > 11 ? 2 + (Math.abs(x - 18) < 3.5 ? 1 : 0) : 1;
      for (let j = 1; j <= h; j++) p.px(ox + x - j * 0.5, y - j, j === h ? BN[5] : BN[4]);
      p.px(ox + x + 0.5, y - 1, BN[2]);
    }
  }

  // --- Geisterflammen zwischen den Dornen (nur Leucht-Ebene, kein Sprenkel im Bild)
  for (let i = 0; i < 6; i++) {
    const x = 12 + i * 1.8, base = spY(x) - 1;
    const h = (2 + ((hash2(i, 2, 95) * 3 + P.fl * 2 + i) % 3)) * soul * 0.8;
    if (p.fine) {
      // Flammenzunge: weißer Kern am Fuß, türkiser Saum, dünne Spitze (fein, hart gestuft)
      for (let j = 0; j < h; j += 0.5) {
        const f = j / h;
        const x2 = ox + x - j * (0.55 + P.amp * 0.25) + Math.sin(P.fl * 1.7 + i + j) * 0.4, y2 = base - j * 0.8;
        fd(g, x2, y2, GH[f < 0.2 ? 5 : f < 0.45 ? 4 : f < 0.7 ? 3 : 2]);
        if (f < 0.55) fd(g, x2 + 0.5, y2, GH[f < 0.25 ? 3 : 1]);
        if (f < 0.3) fd(g, x2 - 0.5, y2, GH[1]);
      }
      continue;
    }
    for (let j = 0; j < h; j++) {
      const f = j / h;
      const x2 = ox + x - j * (0.55 + P.amp * 0.25) + Math.sin(P.fl * 1.7 + i + j) * 0.4, y2 = base - j * 0.8;
      g.px(x2, y2, GH[f < 0.3 ? 3 : f < 0.6 ? 2 : 1]);
    }
  }

  // --- nahe Beine
  leg(7, gal ? 0.3 : Math.PI, true, false);
  leg(22, gal ? 0.8 : 0, true, true);

  // --- Hals + Kopf: tief gesenkt (unter der Rückenlinie), blanker Schädel
  const hx = ox + 27 + P.up * 0.5, hy = Y(26, by + 4.5) + P.head * 3 - P.up * 4.5 + lie * 1.5;
  const up = P.up * 0.9 - P.head * 0.3;
  // Halswirbel vom Buckel hinab zum Schädel
  const n0x = ox + 21, n0y = spY(21);
  for (let i = 0; i <= 4; i++) {
    const f = i / 4, vx = n0x + (hx - 2 - n0x) * f, vy = n0y + (hy - 1 - n0y) * f - Math.sin(f * Math.PI) * 1.2;
    p.rect(vx - 1, vy - 0.5, 2, 2, BN[2]); p.px(vx - 1, vy - 0.5, BN[4]);
    if (p.fine) {
      const X = Math.round(vx - 1), Yv = Math.round(vy - 0.5), d = (a, b, c) => p.dot(X + a / 2 + 0.1, Yv + b / 2 + 0.1, c);
      d(0, 0, BN[5]); d(1, 0, BN[4]); d(2, 0, BN[3]); d(0, 1, BN[4]); d(3, 1, BN[1]); d(3, 2, BN[1]); d(1, 3, BN[1]); d(2, 3, BN[0]); d(3, 3, BN[0]); d(0, 3, BN[1]);
    }
  }
  limb(p, ox + 21, n0y + 2.5, hx - 1, hy + 1.5, 2.6, 1.6, [HFUR[0], HFUR[1], HFUR[2], HFUR[3]]); // Sehnenstrang
  if (p.fine) for (let k = 0; k < 3; k++) fl(p, ox + 21.5 + k * 0.5, n0y + 2 + k * 0.5, hx - 1.5 + k * 0.3, hy + 1 + k * 0.4, k === 0 ? HFUR[4] : k === 1 ? HFUR[2] : HFUR[0]);
  // Schädel: gewölbter Hirnschädel (Licht oben links), Jochbogen, tiefe Augenhöhle
  if (p.fine) {
    // Hirnschädel in 5 Stufen, Haarriss über der Wölbung, Naht am Scheitel
    ell(p, hx, hy, 3.4, 2.7, (u, v) => { const d = u * -0.6 + v * -0.8; return d > 0.78 ? BN[5] : d > 0.4 ? BN[4] : d > 0 ? BN[3] : d > -0.45 ? BN[2] : BN[1]; });

    fl(p, hx - 0.5, hy - 2.5, hx + 0.25, hy - 1.25, BN[1]); fd(p, hx + 0.25, hy - 0.75, BN[1]); fd(p, hx, hy - 2.25, BN[5]);
    fl(p, hx - 2.5, hy - 0.5, hx - 1.5, hy + 0.5, BN[2]);
  } else {
    ell(p, hx, hy, 3.4, 2.7, BN[1]);
    ell(p, hx - 0.3, hy - 0.4, 3, 2.2, BN[2]);
    ell(p, hx - 0.6, hy - 1, 2.2, 1.4, BN[3]);
  }
  p.line(hx - 2, hy - 2, hx + 0.5, hy - 2.5, BN[4]); p.px(hx - 1, hy - 2.5, BN[5]); // Scheitelkamm
  if (p.fine) fl(p, hx - 2, hy - 2.25, hx + 0.5, hy - 2.75, BN[5]);
  // ein Fetzen Ohr hängt noch dran
  p.line(hx - 2.5, hy - 1.5, hx - 4.5, hy - 2.5 - P.up, HFUR[3]); p.px(hx - 4.5, hy - 3 - P.up, HFUR[4]); p.px(hx - 3, hy - 1, HFUR[1]);
  if (p.fine) { fl(p, hx - 2.5, hy - 1.75, hx - 4.5, hy - 2.75 - P.up, HFUR[5]); fl(p, hx - 3, hy - 1, hx - 4.5, hy - 1.75 - P.up, HFUR[2]); fd(p, hx - 5, hy - 3.25 - P.up, HFUR[6]); }
  // Schnauze: spitz zulaufender Oberkiefer, Unterkiefer klappt auf
  const j = P.jaw;
  const sx = hx + 2, sy = hy - up * 2;
  // Unterkiefer zuerst (liegt hinter dem Oberkiefer)
  const ja = 0.22 + j * 0.45;
  const jx1 = sx + 4.8 * Math.cos(ja), jy1 = sy + 1.6 + 4.8 * Math.sin(ja) - up;
  limb(p, sx - 0.5, sy + 1.6, jx1, jy1, 2, 1.2, [BN[0], BN[1], BN[2], BN[3]]);
  if (j > 0.2) {
    // Maulinneres glimmt, Zähne im Unterkiefer stehen nach oben
    p.line(sx + 1, sy + 1.4, sx + 4, sy + 1.6 + j * 1.2 - up, GH[1]);
    g.line(sx + 1, sy + 1.4, sx + 4, sy + 1.6 + j * 1.2 - up, GH[2]);
    p.px(jx1 - 0.7, jy1 - 1, BN[5]); p.px(jx1 - 2.2, jy1 - 1.4 + j * 0.3, BN[4]);
  }
  limb(p, sx - 0.5, sy, sx + 5.2, sy + 0.6 - up, 3, 1.6, [BN[1], BN[2], BN[3], BN[4]], BN[5]);
  p.px(sx + 5.6, sy + 0.2 - up, '#0b0d0e'); // Nasenöffnung
  p.px(sx + 1.5, sy - 1, BN[5]); p.px(sx + 3, sy - 0.6 - up * 0.3, BN[4]); // Nasenrücken im Licht
  if (p.fine) {
    // Nasenrücken als feine Lichtkante, Nasenloch mit Knochenrand
    fl(p, sx + 0.5, sy - 1.25, sx + 4.5, sy - 0.5 - up * 0.6, BN[5]);
    fd(p, sx + 5.25, sy - 0.25 - up, BN[4]); fd(p, sx + 5.75, sy + 0.25 - up, '#0b0d0e');
  }
  // Oberkiefer-Zähne: Reißzahn vorn lang, dahinter kleine Zacken
  p.px(sx + 4.2, sy + 1.4 - up * 0.8, BN[5]); p.px(sx + 4.2, sy + 2.2 - up * 0.8, BN[4]);
  p.px(sx + 2.6, sy + 1.6 - up * 0.5, BN[5]); p.px(sx + 1.2, sy + 1.6 - up * 0.3, BN[4]);
  if (p.fine) {
    // Zähne fein: Reißzahn spitz (Licht oben, Spitze dunkler), Zahnreihe als einzelne Feinpixel-Zacken
    const tx = Math.round(sx + 4.2), ty = Math.round(sy + 1.4 - up * 0.8);
    p.dot(tx + 0.1, ty + 0.1, BN[5]); p.dot(tx + 0.6, ty + 0.1, BN[3]); p.dot(tx + 0.1, ty + 1.1, BN[4]); p.dot(tx + 0.6, ty + 1.1, BN[2]);
    p.dot(tx + 0.1, ty + 1.6, BN[3]); p.dot(tx + 0.6, ty + 1.6, HFUR[0]);
    if (j <= 0.2) for (let k = 0; k < 8; k++) fd(p, sx + 0.8 + k * 0.5, sy + 2.3 - up * 0.4, k % 2 ? HFUR[0] : BN[4]);
  } else if (j <= 0.2) for (let k = 0; k < 4; k++) p.px(sx + 0.8 + k, sy + 2.3 - up * 0.4, k % 2 ? HFUR[0] : BN[3]);
  // Jochbogen unter dem Auge
  p.line(hx - 1, hy + 1.5, hx + 2, hy + 1, BN[1]);
  // Auge: tiefe Höhle unter dem Stirnwulst, glühender Punkt
  const ex = hx + 1, ey = hy - 1;
  p.rect(ex - 1, ey - 0.5, 3, 2, '#07090a');
  p.line(ex - 1, ey - 1.5, ex + 1.5, ey - 1.5, BN[5]); // Stirnwulst
  if (p.fine) {
    // Augenhöhle gerundet: Stirnwulst mit Lichtkante, Unterrand im Knochen
    const EX = Math.round(ex), EY = Math.round(ey);
    p.dot(EX - 0.9, EY - 1.4, BN[5]); p.dot(EX + 1.6, EY - 1.4, BN[4]); p.dot(EX + 2.1, EY - 0.9, BN[3]);
    p.dot(EX - 0.9, EY + 0.6, BN[2]); p.dot(EX + 2.1, EY + 1.1, BN[2]);
  }
  if (P.eye > 0.2) {
    p.px(ex, ey, GH[4]); p.px(ex + 1, ey, GH[2]);
    g.px(ex, ey, GH[5]); g.px(ex + 1, ey, GH[3]); g.px(ex - 1, ey, GH[2]); g.px(ex, ey + 1, GH[1]);
    if (p.fine) {
      // glühender Punkt: weißer Kern, türkiser Saum
      const EX = Math.round(ex), EY = Math.round(ey);
      p.dot(EX + 0.6, EY + 0.1, GH[5]); p.dot(EX + 0.1, EY + 0.1, GH[4]); p.dot(EX + 0.6, EY + 0.6, GH[4]); p.dot(EX + 0.1, EY + 0.6, GH[3]);
      p.dot(EX + 1.1, EY + 0.1, GH[3]); p.dot(EX + 1.6, EY + 0.1, GH[2]);
      g.dot(EX + 0.6, EY + 0.1, GH[5]); g.dot(EX + 1.1, EY + 0.1, GH[4]);
    }

    wisp(p, g, ex - 1, ey - 0.5, 5 + (P.amp > 0.5 ? 2 : 0), P.fl, -1, 0.1, P.eye * 0.8, false);
  }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: sx + 5, y: sy + 1 };
  meta.head = { x: hx, y: hy - 5 };
  return meta;
}

function houndAnims() {
  const mk = (P, X) => makeFrame(HW, HH, HAX, HAY, drawHound, P, X);
  const idle = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = i / 6 * TAU;
    return mk(hpose({ t: 0.25, bob: Math.sin(a) > 0.4 ? 1 : 0, head: 0.2 + Math.sin(a) * 0.15, fl: i * 1.2, jaw: 0.1 + (i === 3 ? 0.2 : 0) }));
  });
  // Lauernder Trab: Kopf tief
  const walk = [];
  for (let i = 0; i < 8; i++) walk.push(mk(hpose({ t: i / 8, amp: 1, bob: i % 4 === 1 || i % 4 === 2 ? 1 : 0, head: 0.35, fl: i * 0.9, pitch: Math.sin(i / 8 * TAU * 2) * 0.05 })));
  // Heulen (Rudel ruft)
  const howl = [
    mk(hpose({ crouch: 1, head: 0.2, fl: 0, tail: -1 })),
    mk(hpose({ crouch: 1.5, up: 1, head: -0.3, jaw: 0.5, fl: 1, pitch: -0.5, tail: -1 })),
    mk(hpose({ crouch: 1.5, up: 1.6, head: -0.6, jaw: 1, fl: 2, pitch: -0.8, tail: -1.5 }), { fx: 'roar' }),
    mk(hpose({ crouch: 1.5, up: 1.7, head: -0.6, jaw: 1, fl: 3.2, pitch: -0.8, tail: -1.5 })),
    mk(hpose({ crouch: 1.5, up: 1.6, head: -0.5, jaw: 0.8, fl: 4.4, pitch: -0.75, tail: -1.2 })),
  ];
  // Ausholen: duckt sich tief, knurrt, Mähne lodert auf
  const windup = [
    mk(hpose({ crouch: 1, head: 0.6, jaw: 0.3, fl: 0, soul: 1.2 })),
    mk(hpose({ crouch: 2, head: 0.9, jaw: 0.5, fl: 1, lunge: -1, soul: 1.4, pitch: 0.2 })),
    mk(hpose({ crouch: 2.5, head: 1, jaw: 0.6, fl: 2, lunge: -1.5, soul: 1.5, pitch: 0.25, tail: 0.5 })),
  ];
  // Sprung-Biss
  const strike = [
    mk(hpose({ leap: 0.6, crouch: -2, head: -0.2, up: 0.3, jaw: 1, lunge: 2, pitch: -0.35, fl: 3, soul: 1.4 })),
    mk(hpose({ leap: 1, crouch: -3, head: 0.1, jaw: 1.3, lunge: 5, pitch: 0.05, fl: 4, soul: 1.5 }), { fx: 'impact' }),
    mk(hpose({ leap: 0.3, crouch: -0.5, head: 0.5, jaw: 0.6, lunge: 4.5, pitch: 0.2, fl: 5 })),
    mk(hpose({ t: 0.25, head: 0.4, jaw: 0.1, lunge: 1.5, fl: 6 })),
  ];
  const hurt = [mk(hpose({ head: -0.5, up: 0.4, jaw: 0.8, lunge: -2, crouch: 1, pitch: -0.25, fl: 1, tail: -1 })), mk(hpose({ head: 0.1, lunge: -0.8, crouch: 0.5, fl: 2 }))];
  const death = [
    mk(hpose({ head: -0.5, up: 0.6, jaw: 1, lunge: -2, crouch: 1, pitch: -0.3, fl: 1, tail: -1 })),
    mk(hpose({ head: 0.8, crouch: 2.5, lie: 0.3, jaw: 0.5, fl: 2, soul: 0.8, eye: 0.8 })),
    mk(hpose({ head: 1.2, lie: 0.6, jaw: 0.3, fl: 3, soul: 0.6, eye: 0.6 })),
    mk(hpose({ head: 1.3, lie: 0.9, jaw: 0.4, fl: 4, soul: 0.4, eye: 0.3 }), { fx: 'impact' }),
    mk(hpose({ head: 1.3, lie: 1, jaw: 0.4, fl: 5, soul: 0.2, eye: 0 })),
    mk(hpose({ head: 1.3, lie: 1, jaw: 0.4, fl: 6, soul: 0, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 12),
    howl: new Animation(howl, 6, false),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Knochenschütze (bone_archer)

const AW = 64, AH = 52, AAX = 28, AAY = 46;
const AD = { legH: 12, thigh: 6, shin: 6.5, spine: 9, upper: 5, fore: 5, sh: 1.5, hipW: 1.2 };
const A_REST = {
  hipX: 0, hipY: 0, lean: 0.05, head: 0, fFx: 3.5, fFy: 0, fBx: -3.5, fBy: 0,
  hFx: 6, hFy: 7, hBx: -1, hBy: 8, bowA: 0.4, draw: 0, arrow: 0, cape: 0.15, capeT: 0, eye: 1, jaw: 0, soul: 1, wph: 0,
};
const apose = (o = {}) => ({ ...A_REST, ...o });

// Knochenglied: dünner Schaft mit Gelenkknubbel
function boneLimb(p, x0, y0, x1, y1, w, near) {
  const R = near ? [BN[1], BN[2], BN[3], BN[4]] : [BN[0], BN[1], BN[2], BN[2]];
  limb(p, x0, y0, x1, y1, w, w, R);
  ell(p, x1, y1, w * 0.55 + 0.3, w * 0.55 + 0.3, near ? BN[3] : BN[1]);
  if (p.fine) {
    // Knochen fein: Lichtgrat auf dem Schaft, Gelenkkopf mit Kerbe, Haarriss in langen Knochen
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    let nx = -uy, ny = ux; if (nx + ny > 0) { nx = -nx; ny = -ny; }
    const o = w / 2 - 0.6;
    fl(p, x0 + ux * 1.2 + nx * o, y0 + uy * 1.2 + ny * o, x1 - ux * 1.4 + nx * o, y1 - uy * 1.4 + ny * o, near ? BN[5] : BN[3]);
    const r = w * 0.55 + 0.3;
    fd(p, x1 + nx * r * 0.6, y1 + ny * r * 0.6, near ? BN[5] : BN[2]);
    fd(p, x1 - ux * 0.25 - nx * 0.25, y1 - uy * 0.25 - ny * 0.25, near ? BN[1] : BN[0]);        // Gelenkkerbe
    fd(p, x1 + ux * 0.25 - nx * 0.25, y1 + uy * 0.25 - ny * 0.25, near ? BN[1] : BN[0]);
    if (near && L > 4.5) {
      const t = 0.45; const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      fd(p, cx, cy, BN[1]); fd(p, cx + ux * 0.5 - nx * 0.5, cy + uy * 0.5 - ny * 0.5, BN[1]);
    }
  }
}

function drawLongbow(p, g, hx, hy, a, draw, nock, arrow, ghost) {
  const ax = Math.sin(a), ay = -Math.cos(a), fx = Math.cos(a), fy = Math.sin(a);
  const bend = 0.05 + draw * 0.035;
  const pts = [];
  const L = 11;
  if (p.fine) {
    // Handfein: Bogenholz zweifarbig gemasert (Licht vorn, Maserlinie, Schattenrücken), Griff gewickelt,
    // Bronzeringe mit Glanzpunkt, Hornspitzen, Sehne als Feinlinie
    for (let s = -L; s <= L + 0.01; s += 0.25) {
      const b = -(s * s) * bend * 0.45 + (Math.abs(s) > L - 2 ? (Math.abs(s) - (L - 2)) * 0.6 : 0);
      const x = hx + ax * s + fx * b, y = hy + ay * s + fy * b, as = Math.abs(s);
      if (Math.abs(s * 2 - Math.round(s * 2)) < 0.01) pts.push([x, y]);
      if (as > L - 1) { fd(p, x - fx * 0.25, y - fy * 0.25, as > L - 0.5 ? BN[5] : BN[4]); fd(p, x + fx * 0.25, y + fy * 0.25, BN[2]); continue; }
      if (as < 1.5) {
        const wrap = Math.round(s * 4) & 1;
        fd(p, x - fx * 0.25, y - fy * 0.25, wrap ? CREST[3] : CREST[2]); fd(p, x + fx * 0.25, y + fy * 0.25, wrap ? CREST[1] : CREST[2]);
        fd(p, x + fx * 0.75, y + fy * 0.75, CREST[0]);
        continue;
      }
      const ring = as > 2 && as < L - 1 && Math.abs(Math.round(s * 2) % 7) === 0 && Math.abs(s * 2 - Math.round(s * 2)) < 0.3;
      const grain = (Math.floor(as * 1.3 + (s > 0 ? 0.5 : 0)) & 3) === 0;
      fd(p, x - fx * 0.25, y - fy * 0.25, ring ? BRZ[6] : WOODB[4]);
      fd(p, x + fx * 0.25, y + fy * 0.25, ring ? BRZ[4] : grain ? WOODB[2] : WOODB[3]);
      fd(p, x + fx * 0.75, y + fy * 0.75, ring ? BRZ[2] : WOODB[1]);
      if (as > 1.5 && as < L - 2) fd(p, x + fx * 1.25, y + fy * 1.25, WOODB[0]);
    }
    const top = pts[0], bot = pts[pts.length - 1];
    const sx = nock ? nock.x : (top[0] + bot[0]) / 2 - fx * 0.5, sy = nock ? nock.y : (top[1] + bot[1]) / 2;
    fl(p, top[0], top[1], sx, sy, '#b4c0b8'); fl(p, sx, sy, bot[0], bot[1], '#9aa6a0');
    let head = { x: hx + fx * 2, y: hy + fy * 2 };
    if (arrow && nock) {
      const tx = hx + fx * 4, ty = hy + fy * 4;
      fl(p, nock.x, nock.y, tx, ty, WOODB[4]); fl(p, nock.x + fy * 0.5, nock.y - fx * 0.5 + 0.5, tx, ty + 0.5, WOODB[2]);
      // Geisterspitze: weißer Kern, türkiser Saum (Bild und Leucht-Ebene fein)
      const hot = ghost > 0.3;
      p.px(tx + fx, ty + fy, hot ? GH[4] : BRZ[5]); p.px(tx, ty, hot ? GH[3] : BRZ[4]);
      fd(p, tx + fx * 1.25, ty + fy * 1.25, hot ? GH[5] : BRZ[6]); fd(p, tx + fx * 1.75, ty + fy * 1.75, hot ? GH[4] : BRZ[5]);
      fd(p, tx + fx * 0.5 + fy * 0.5, ty + fy * 0.5 - fx * 0.5, hot ? GH[3] : BRZ[3]); fd(p, tx + fx * 0.5 - fy * 0.5, ty + fy * 0.5 + fx * 0.5, hot ? GH[2] : BRZ[2]);
      if (hot) {
        g.px(tx + fx, ty + fy, GH[3]); g.px(tx, ty, GH[2]);
        fd(g, tx + fx * 1.25, ty + fy * 1.25, GH[5]); fd(g, tx + fx * 1.75, ty + fy * 1.75, GH[5]); fd(g, tx + fx * 2.25, ty + fy * 2.25, GH[4]);
        fd(g, tx + fx * 2.75, ty + fy * 2.75, GH[2]); fd(g, tx - 0.5 * fx, ty - 1, GH[1]); fd(g, tx - 0.5 * fx, ty + 1, GH[1]);
        if (ghost > 0.8) {
          for (let k = 1; k <= 3; k++) { fd(g, tx - fx * k * 0.75, ty - fy * k * 0.75 - 0.5 - k * 0.25, GH[k < 2 ? 3 : 2]); fd(g, tx - fx * k * 0.75, ty - fy * k * 0.75 + 0.5 + k * 0.25, GH[k < 2 ? 3 : 2]); }
          fd(g, tx + fx, ty + fy - 1, GH[2]); fd(g, tx + fx, ty + fy + 1, GH[2]);
        }
      }
      // Federn: zwei Fahnen mit Kiel, Spitzen ausgefranst
      fl(p, nock.x - 0.5, nock.y - 1.25, nock.x + fx * 1.5, nock.y + fy * 1.5 - 0.5, SHR[5]); fd(p, nock.x - 0.75, nock.y - 1.5, SHR[4]);
      fl(p, nock.x - 0.5, nock.y + 1.25, nock.x + fx * 1.5, nock.y + fy * 1.5 + 0.5, SHR[3]); fd(p, nock.x - 0.75, nock.y + 1.5, SHR[2]);
      head = { x: tx + fx, y: ty + fy };
    }
    return head;
  }
  for (let s = -L; s <= L; s += 0.5) {
    const b = -(s * s) * bend * 0.45 + (Math.abs(s) > L - 2 ? (Math.abs(s) - (L - 2)) * 0.6 : 0);  // Recurve-Enden

    const x = hx + ax * s + fx * b, y = hy + ay * s + fy * b;
    pts.push([x, y]);
    const tip = Math.abs(s) > L - 1;
    p.px(x, y, tip ? BN[4] : Math.abs(s) < 1.5 ? CREST[2] : WOODB[3]);
    if (!tip && Math.abs(s) > 1.5) p.px(x + fx, y + fy, WOODB[1]);
    if (Math.abs(s) > 2 && Math.abs(s) < L - 1 && (Math.round(s * 2) % 7 === 0)) p.px(x, y, BRZ[5]); // Bronzeringe
  }
  const top = pts[0], bot = pts[pts.length - 1];
  const sx = nock ? nock.x : (top[0] + bot[0]) / 2 - fx * 0.5, sy = nock ? nock.y : (top[1] + bot[1]) / 2;
  p.line(top[0], top[1], sx, sy, '#9aa6a0');
  p.line(sx, sy, bot[0], bot[1], '#9aa6a0');
  let head = { x: hx + fx * 2, y: hy + fy * 2 };
  if (arrow && nock) {
    const tx = hx + fx * 4, ty = hy + fy * 4;
    p.line(nock.x, nock.y, tx, ty, WOODB[4]);
    // Geisterspitze
    p.px(tx + fx, ty + fy, ghost > 0.3 ? GH[4] : BRZ[5]); p.px(tx, ty, ghost > 0.3 ? GH[3] : BRZ[4]);
    if (ghost > 0.3) {
      g.px(tx + fx, ty + fy, GH[5]); g.px(tx, ty, GH[4]); g.px(tx + fx * 2, ty + fy * 2, GH[2]);
      g.px(tx - 0.5 * fx, ty - 1, GH[1]); g.px(tx - 0.5 * fx, ty + 1, GH[1]);
      if (ghost > 0.8) { g.px(tx + fx, ty + fy - 1, GH[2]); g.px(tx + fx, ty + fy + 1, GH[2]); g.px(tx - fx, ty - fy, GH[3]); }
    }
    p.px(nock.x - 1, nock.y - 1, SHR[4]); p.px(nock.x - 1, nock.y + 1, SHR[3]); // Federn
    head = { x: tx + fx, y: ty + fy };
  }
  return head;
}

function drawBoneArcher(p, g, P, X) {
  const R = rig(P, AD, AAX, AAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const soul = P.soul;

  // --- Köcher auf dem Rücken (Leder mit Bronzebeschlag, Geisterfedern)
  const q0 = pt(1.5, -3), q1 = pt(AD.spine + 3.5, -4.5);
  limb(p, q0.x, q0.y, q1.x, q1.y, 3, 3.5, [MUM[0], MUM[1], MUM[2], MUM[3]]);
  p.px(q0.x, q0.y - 1, BRZ[4]); p.px(q1.x + 0.5, q1.y + 2, BRZ[5]);
  for (let k = 0; k < 3; k++) {
    const fx_ = q1.x - 1.5 + k * 1.1, fy_ = q1.y - 1.5 - (k % 2);
    p.px(fx_, fy_, SHR[4]); p.px(fx_, fy_ - 1, SHR[5]);
    if (p.fine) { fd(p, fx_ + 0.25, fy_ - 1.25, '#9aa8a4'); fd(p, fx_ + 0.25, fy_ + 0.25, SHR[2]); fd(p, fx_ + 0.25, fy_ - 0.5, SHR[3]); }
  }
  if (p.fine) {
    // Köcherleder: Naht als Punktlinie, zwei Kratzer, Bronzebeschlag mit Niete
    const L = Math.hypot(q1.x - q0.x, q1.y - q0.y), ux = (q1.x - q0.x) / L, uy = (q1.y - q0.y) / L;
    let nx = -uy, ny = ux; if (nx + ny > 0) { nx = -nx; ny = -ny; }
    for (let s = 1; s < L - 0.5; s += 1) fd(p, q0.x + ux * s + nx * 0.75, q0.y + uy * s + ny * 0.75, MUM[4]);
    fl(p, q0.x + ux * 3 - nx * 0.25, q0.y + uy * 3 - ny * 0.25, q0.x + ux * 4.5 - nx * 0.75, q0.y + uy * 4.5 - ny * 0.75, MUM[3]);
    fl(p, q0.x + ux * 7 + nx * 0.25, q0.y + uy * 7 + ny * 0.25, q0.x + ux * 8 - nx * 0.25, q0.y + uy * 8 - ny * 0.25, MUM[0]);
    rivet(p, q1.x + 0.5, q1.y + 2); rivet(p, q0.x, q0.y - 1, BRZ[6], BRZ[1]);
  }
  // --- Leichentuch-Fetzen hinten (Schultertuch)
  const top = pt(AD.spine, -1.5);
  for (let i = 0; i < 4; i++) {
    const len = 8 + (hash2(i, 5, 97) * 4 | 0) - i;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      if (v > 0.5 && hash2(i, j, 98) < 0.22) continue;
      const x = top.x - 1 - i * 0.8 - P.cape * 6 * v * v + Math.sin(P.capeT + v * 3 + i) * 0.7 * v;
      p.px(x, top.y + j + i * 0.2, SHR[i === 0 ? 3 : 2 - (i > 2 ? 1 : 0)]);
      if (p.fine) {
        // Tuchfalte zweifarbig: Lichtkante links, Schattenfuge rechts; ausgefranstes Ende
        fd(p, x - 0.25, top.y + j + i * 0.2, SHR[i === 0 ? 4 : 3 - (i > 2 ? 1 : 0)]);
        if (i & 1) fd(p, x + 0.25, top.y + j + 0.5 + i * 0.2, SHR[0]);
      }
    }
  }
  // --- hinteres Bein
  boneLimb(p, hip.x - 1, hip.y, legB.jx, legB.jy, 2, false);
  boneLimb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 1.5, false);
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, BN[1]);
  // --- hinterer Arm (Sehnenhand)
  boneLimb(p, shB.x, shB.y, armB.jx, armB.jy, 1.8, false);
  boneLimb(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.5, false);

  // --- Becken + Wirbelsäule + Brustkorb
  const hp = pt(0, 0);
  ell(p, hp.x, hp.y, 3, 1.6, BN[2]); p.px(hp.x - 2, hp.y - 1, BN[4]); p.px(hp.x + 1, hp.y, BN[0]);
  if (p.fine) {
    // Beckenschaufel: Lichtkamm, Hüftpfanne als dunkle Kerbe, kleiner Riss
    fl(p, hp.x - 2.5, hp.y - 1.25, hp.x + 0.5, hp.y - 1.75, BN[5]); fd(p, hp.x + 0.75, hp.y + 0.25, BN[0]); fd(p, hp.x + 1.25, hp.y - 0.25, BN[1]);
    fl(p, hp.x - 1, hp.y - 0.75, hp.x - 0.5, hp.y + 0.5, BN[1]);
  }
  // Lendentuch (zerfetzt)
  for (let i = 0; i < 4; i++) {
    const a = pt(-0.5, -2.5 + i * 1.6);
    const l = 5 - Math.abs(i - 1.5) * 0.8 + (hash2(i, 1, 99) * 2 | 0);
    for (let j = 0; j < l; j++) p.px(a.x + Math.sin(P.capeT + i) * 0.3 * j * 0.3, a.y + j, SHR[i % 2 ? 2 : 3]);
    if (p.fine) for (let j = 0; j < l; j += 0.5) { const x = a.x + Math.sin(P.capeT + i) * 0.3 * j * 0.3; fd(p, x - 0.25, a.y + j, SHR[i % 2 ? 3 : 4]); }
  }
  for (let u = 0.5; u <= 4; u += 1) { const o = pt(u, -0.3); p.px(o.x, o.y, BN[3]); const o2 = pt(u + 0.5, -0.3); p.px(o2.x, o2.y, BN[1]); }
  if (p.fine) for (let u = 0.5; u <= 4; u += 1) { const o = pt(u + 0.15, -0.55); fd(p, o.x, o.y, BN[5]); const o2 = pt(u + 0.65, -0.3); fd(p, o2.x, o2.y, BN[0]); }
  // Rippen: Bögen, dazwischen dunkel; im Brustkorb glimmt ein Geisterherz
  const rc = pt(6.5, 0.8);
  ell(p, rc.x, rc.y, 3.4, 3.2, '#08090a');
  const heart = pt(6.2, 0.8);
  if (soul > 0.2) {
    p.px(heart.x, heart.y, GH[3]); p.px(heart.x + 1, heart.y, GH[2]);
    if (p.fine) {
      // Geisterherz: weißer Kern im Bild; Lichthof hart in genau 2 Stufen (außen GH1, innen GH3), kein Verlauf
      fd(p, heart.x + 0.25, heart.y - 0.25, GH[5]); fd(p, heart.x + 0.75, heart.y - 0.25, GH[4]); fd(p, heart.x + 0.25, heart.y + 0.25, GH[4]);
      ell(g, heart.x + 0.5, heart.y, 1.5 + soul * 0.5, 1.5 + soul * 0.5, GH[1]);
      ell(g, heart.x + 0.5, heart.y, 0.9, 0.8, GH[3]);
    } else { ell(g, heart.x + 0.5, heart.y, 1.5 + soul * 0.5, 1.5 + soul * 0.5, GH[1]); g.px(heart.x, heart.y, GH[4]); g.px(heart.x + 1, heart.y, GH[3]); }
  }
  if (p.fine) {
    // Rippen fein: Knochenspangen mit Lichtkante oben, Schattenkante unten, Kerbe am Brustbein
    for (let r = 0; r < 4; r++) {
      const u = 4.3 + r * 1.35;
      for (let k = -3; k <= 3.2; k += 0.25) {
        const o = pt(u - Math.abs(k) * 0.12 + (k > 0 ? 0.25 : 0), k);
        fd(p, o.x, o.y - 0.25, k < -2 ? BN[5] : k > 2 ? BN[2] : BN[4]);
        fd(p, o.x, o.y + 0.25, k < -2 ? BN[3] : k > 2 ? BN[0] : BN[2]);
      }
      const n = pt(u + 0.1, 2.1); fd(p, n.x, n.y, BN[0]);
      if (r === 1) { const c = pt(u - 0.1, -0.8); fd(p, c.x, c.y - 0.25, BN[1]); }
    }
    for (let u = 4; u <= 8.5; u += 0.25) { const o = pt(u, 2.4); fd(p, o.x - 0.25, o.y, BN[3]); fd(p, o.x + 0.25, o.y, BN[1]); }
  } else {
    for (let r = 0; r < 4; r++) {
      const u = 4.3 + r * 1.35;
      for (let k = -3; k <= 3.2; k += 0.5) {
        const o = pt(u - Math.abs(k) * 0.12 + (k > 0 ? 0.25 : 0), k);
        p.px(o.x, o.y, k < -2 ? BN[4] : k > 2 ? BN[1] : BN[3]);
      }
    }
    // Brustbein
    for (let u = 4; u <= 8.5; u += 0.5) { const o = pt(u, 2.4); p.px(o.x, o.y, BN[2]); }
  }
  // Schlüsselbein
  const cl = pt(AD.spine, 0); p.line(cl.x - 2.5, cl.y, cl.x + 2, cl.y + 0.5, BN[4]);
  if (p.fine) { fl(p, cl.x - 2.5, cl.y - 0.25, cl.x + 2, cl.y + 0.25, BN[5]); fl(p, cl.x - 2.5, cl.y + 0.5, cl.x + 2, cl.y + 1, BN[2]); }

  // --- vorderes Bein
  boneLimb(p, hip.x + 1, hip.y, legF.jx, legF.jy, 2.2, true);
  boneLimb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 1.7, true);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, BN[2]); p.px(legF.ex + 2, legF.ey - 1, BN[3]);
  // Bronze-Beinschiene (Rest der Grabrüstung)
  const gm = { x: (legF.jx + legF.ex) / 2, y: (legF.jy + legF.ey) / 2 };
  p.rect(gm.x - 1, gm.y - 1.5, 2, 3, BRZ[3]); p.px(gm.x - 1, gm.y - 1.5, BRZ[5]); p.px(gm.x, gm.y + 1, VERD[3]);
  if (p.fine) {
    // Beinschiene: 5 Stufen quer gewölbt, Glanzlinie, Niete, Grünspan unten
    const X = Math.round(gm.x - 1), Yg = Math.round(gm.y - 1.5), d = (a, b, c) => p.dot(X + a / 2 + 0.1, Yg + b / 2 + 0.1, c);
    for (let b = 0; b < 6; b++) { d(0, b, BRZ[4]); d(1, b, b < 5 ? BRZ[6] : BRZ[5]); d(2, b, BRZ[3]); d(3, b, BRZ[2]); }
    d(0, 0, BRZ[5]); d(1, 0, '#fff2d0'); d(3, 0, BRZ[1]); d(2, 2, BRZ[6]); d(3, 3, BRZ[0]);
    d(2, 4, VERD[3]); d(2, 5, VERD[2]); d(3, 5, VERD[1]); d(3, 4, VERD[2]);
  }


  // --- Schädel mit Bronzekappe
  const neck = pt(AD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  // Schädel als Pixelkarte: Licht oben links, tiefe Augenhöhle, Nasenloch, Zahnreihe
  const SK = { s: BN[5], h: BN[4], l: BN[3], m: BN[2], d: BN[1], w: BN[5], k: '#07080a', e: GH[4], n: '#07080a' };
  const jw = P.jaw;
  // Unterkiefer (klappt nach unten)
  pmap(p, hx - 1, hy + 2 + Math.round(jw), [
    jw > 0.4 ? 'dmwkwk' : 'dmmmml',
    '.ddmmd',
  ], SK);
  if (jw > 0.4) p.rect(hx + 1, hy + 2, 3, Math.round(jw), '#07080a');
  if (p.fine && jw > 0.4) {
    // Unterkiefer-Zähne fein: spitze Zacken auf einer Zahnfleischkante statt Schachbrett
    const J0x = hx - 1, J0y = hy + 2 + Math.round(jw), jd = (x, y, c) => p.dot(J0x + x / 2 + 0.1, J0y + y / 2 + 0.1, c);
    for (const c of [2, 4]) { jd(c * 2, 0, BN[5]); jd(c * 2 + 1, 0, '#07080a'); jd(c * 2 + 1, 1, BN[3]); }
    for (const c of [3, 5]) { jd(c * 2, 0, BN[4]); jd(c * 2 + 1, 0, '#07080a'); jd(c * 2, 1, BN[3]); jd(c * 2 + 1, 1, BN[2]); }
  }

  pmap(p, hx - 3, hy - 4, [
    '.lhhhl.',
    'lhsshhl',
    'hshhhmm',
    'hhhmkek',
    'mhhmkkd',
    'dmmmmmn',
    '.dmwkwk',
  ], SK);
  if (P.eye <= 0.3) p.px(hx + 2, hy - 1, '#07080a');
  else if (p.fine) wisp(p, g, hx - 4, hy - 2, 5, P.wph, -1, 0.3, P.eye, false);   // Fahne nur hinter dem Kopf
  else {
    g.px(hx + 2, hy - 1, GH[5]); g.px(hx + 1, hy - 1, GH[3]); g.px(hx + 3, hy - 1, GH[2]); g.px(hx + 2, hy, GH[2]);
    wisp(p, g, hx + 1, hy - 1.5, 6, P.wph, -1, 0.35, P.eye, false);
  }
  if (p.fine) {
    // Handfein (Feinpixel relativ zur Schädelkarte): Stirnwulst-Kante, runde Augenhöhle mit leuchtendem Kern,
    // Nasenöffnung, Jochbein im Licht, einzelne Zähne, Haarriss im Hirnschädel
    const S0x = hx - 3, S0y = hy - 4, sd = (x, y, c) => p.dot(S0x + x / 2 + 0.1, S0y + y / 2 + 0.1, c);
    for (let x = 8; x <= 12; x++) sd(x, 5, BN[5]);
    sd(13, 5, BN[2]); sd(8, 9, BN[1]); sd(13, 9, BN[1]);
    // Augenhöhle ganz dunkel, darin zwei harte Glutpunkte (weißer Kern, 1 Feinpixel Saum), kein Schleier
    for (let x = 8; x <= 13; x++) for (let y = 6; y <= 7; y++) sd(x, y, '#07080a');
    for (let x = 8; x <= 11; x++) for (let y = 8; y <= 9; y++) sd(x, y, '#07080a');
    if (P.eye > 0.3) {
      sd(9, 7, GH[5]); sd(8, 7, GH[3]); sd(9, 8, GH[3]);          // fernes Auge
      sd(12, 6, GH[5]); sd(13, 6, GH[3]); sd(12, 7, GH[3]);       // nahes Auge
      g.dot(S0x + 4.6, S0y + 3.6, GH[5]); g.dot(S0x + 6.1, S0y + 3.1, GH[5]);
      g.dot(S0x + 4.1, S0y + 3.6, GH[2]); g.dot(S0x + 4.6, S0y + 4.1, GH[2]); g.dot(S0x + 6.6, S0y + 3.1, GH[2]); g.dot(S0x + 6.1, S0y + 3.6, GH[2]);
    }
    sd(12, 10, BN[3]); sd(8, 10, BN[4]); sd(9, 10, BN[4]); sd(10, 11, BN[3]);
    // Zähne: je 2 Feinpixel breit (oben hell, unten Schatten), 1 Feinpixel Fuge
    const K = '#07080a', T = [BN[4], BN[5], BN[5], K, BN[5], BN[5], K, BN[4]], U = [BN[2], BN[3], BN[3], K, BN[3], BN[3], K, BN[2]];
    for (let x = 6; x <= 13; x++) { sd(x, 12, T[x - 6]); if (P.jaw <= 0.4) sd(x, 13, U[x - 6]); }

    sd(3, 4, BN[1]); sd(3, 5, BN[1]); sd(4, 6, BN[1]); sd(4, 7, BN[2]); sd(2, 4, BN[5]);
  }
  // Bronzekappe (Spangenhelm, spitz) mit Wangenrest
  pmap(p, hx - 4, hy - 8, [
    '....s...',
    '...hl...',
    '..hhlm..',
    '.hhllmd.',
    'hllmmmdd',
  ], { s: BRZ[6], h: BRZ[5], l: BRZ[4], m: BRZ[3], d: BRZ[2] });
  p.rect(hx - 4, hy - 3, 8, 1, BRZ[2]); p.px(hx - 4, hy - 3, BRZ[4]); p.px(hx - 1, hy - 3, BRZ[5]); p.px(hx + 3, hy - 3, BRZ[1]); // Rand mit Niete
  p.px(hx, hy - 6, VERD[3]); p.px(hx + 1, hy - 5, VERD[2]);
  p.px(hx - 3, hy - 2, BRZ[2]); p.px(hx - 3, hy - 1, BRZ[1]); // Wangenrest
  if (p.fine) {
    // Spangenhelm fein: Glanzlinie auf der Lichtfacette, Glanzpunkt an der Spitze, Mittelspange, Nieten im Rand
    const C0x = hx - 4, C0y = hy - 8, cd = (x, y, c) => p.dot(C0x + x / 2 + 0.1, C0y + y / 2 + 0.1, c);
    for (const [x, y] of [[8, 1], [7, 3], [6, 4], [5, 5], [4, 6], [3, 7], [2, 8]]) cd(x, y, '#e4cc90');
    cd(8, 0, '#fffbe8'); cd(9, 1, BRZ[3]);
    for (let y = 2; y <= 9; y++) cd(9 + (y > 6 ? 1 : 0), y, y & 1 ? BRZ[2] : BRZ[1]);
    for (const x of [2, 8, 13]) { cd(x, 10, BRZ[6]); cd(x + 1, 11, BRZ[0]); }
    cd(9, 5, VERD[4]); cd(10, 6, VERD[3]);
    cd(2, 12, BRZ[4]); cd(3, 13, BRZ[1]);
  }
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.head = { x: hx, y: hy - 6 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  // --- vorderer Arm mit Bogen
  boneLimb(p, shF.x, shF.y, armF.jx, armF.jy, 2, true);
  boneLimb(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.7, true);
  // Schulterstück: Bronzeplatte
  if (p.fine) {
    ell(p, shF.x - 0.5, shF.y + 0.5, 1.6, 1.2, metalShade([VERD[1], BRZ[3], BRZ[4], BRZ[5], BRZ[6]], '#e4cc90'));
    fd(p, shF.x - 1.5, shF.y - 0.5, '#fffbe8'); rivet(p, shF.x, shF.y + 0.75); fd(p, shF.x + 0.5, shF.y + 1.5, VERD[3]); fd(p, shF.x + 0.75, shF.y + 1.25, VERD[4]);
  } else { ell(p, shF.x - 0.5, shF.y + 0.5, 1.6, 1.2, BRZ[3]); p.px(shF.x - 1.5, shF.y - 0.5, BRZ[5]); p.px(shF.x + 0.5, shF.y + 1.5, VERD[2]); }
  const nock = P.draw > 0.02 || P.arrow > 0.5 ? { x: armB.ex, y: armB.ey } : null;
  const hand = drawLongbow(p, g, armF.ex, armF.ey, P.bowA, P.draw, nock, P.arrow > 0.5, P.draw * soul);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BN[3]); p.px(armF.ex - 1, armF.ey - 1, BN[5]);
  if (p.fine) {
    // Fingerknochen um den Griff: Knöchel hell, Fugen dunkel
    fd(p, armF.ex - 0.25, armF.ey - 0.75, BN[4]); fd(p, armF.ex + 0.25, armF.ey - 0.25, BN[1]); fd(p, armF.ex - 0.25, armF.ey + 0.25, BN[4]); fd(p, armF.ex + 0.25, armF.ey + 0.75, BN[1]);
  }
  if (nock) { p.px(armB.ex, armB.ey, BN[4]); p.px(armB.ex - 1, armB.ey, BN[2]); if (p.fine) { fd(p, armB.ex - 0.25, armB.ey - 0.25, BN[5]); fd(p, armB.ex + 0.25, armB.ey + 0.25, BN[1]); } }

  meta.hand = hand;
  return meta;
}

function boneArcherAnims() {
  const mk = (P, X) => makeFrame(AW, AH, AAX, AAY, drawBoneArcher, P, X);
  const idleA = apose();
  const idleB = apose({ hipY: 1, lean: 0.08, hFy: 7.5, hBy: 8.5, capeT: Math.PI, head: 0.3, bowA: 0.44, jaw: 0.5 });
  const idle = [];
  for (let i = 0; i < 6; i++) { const k = (1 - Math.cos(i / 6 * TAU)) / 2; idle.push(mk({ ...mixP(idleA, idleB, k), wph: i / 6 * TAU })); }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(apose({
      hipY: -Math.abs(c) * 1 + 0.5, lean: 0.1, fFx: 1 + s * 4.5, fFy: Math.max(0, -c) * 2.2, fBx: -1 - s * 4.5, fBy: Math.max(0, c) * 2.2,
      hFx: 6 - s * 1.2, hBx: -1 + s * 1.5, hFy: 7 - Math.abs(s) * 0.5, cape: 0.5, capeT: ph, head: s * 0.4, wph: ph, jaw: Math.abs(s) > 0.7 ? 0.6 : 0,
    })));
  }
  // Pfeil ziehen, auflegen, spannen – die Spitze entflammt in Geisterlicht
  const n1 = apose({ hBx: -4, hBy: -2, head: -0.3, bowA: 0.25, lean: 0.02, wph: 1 });
  const n2 = apose({ hFx: 8, hFy: 1, hBx: 4, hBy: 1, bowA: 0.05, arrow: 1, draw: 0.15, lean: 0.05, wph: 2 });
  const n3 = apose({ hFx: 10, hFy: 0, hBx: 0, hBy: 0, bowA: 0.02, arrow: 1, draw: 0.6, lean: 0.01, fFx: 4.5, fBx: -4.5, wph: 3 });
  const n4 = apose({ hFx: 11, hFy: 0, hBx: -2, hBy: 0, bowA: 0, arrow: 1, draw: 1, lean: -0.03, fFx: 4.5, fBx: -4.5, cape: 0.2, wph: 4, jaw: 0.6 });
  const windup = [mk(n1), mk(n2), mk(n3), mk(n4)];
  const r1 = { ...n4, hBx: -5, hBy: -1, arrow: 0, draw: 0, lean: -0.07, hipX: -0.5, cape: 0.35, capeT: 1, wph: 5 };
  const r2 = { ...n4, hFx: 9, hBx: -6, hBy: 1, arrow: 0, draw: 0, lean: -0.03, cape: 0.2, capeT: 2, wph: 6, jaw: 0.2 };
  const r3 = apose({ hFx: 8, hFy: 3, hBx: -3, hBy: 5, arrow: 0, bowA: 0.15, capeT: 3, wph: 7 });
  const strike = [mk(r1, { fx: 'cast' }), mk(r2), mk(r3)];
  const hurtP = apose({ lean: -0.24, hipX: -1, head: -1, hFx: 3, hFy: 4, hBx: 0, hBy: 4, eye: 1, cape: -0.2, bowA: 0.8, jaw: 1, wph: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: das Gerippe fällt in sich zusammen (Knie knicken, Oberkörper kippt nach hinten)
  const d1 = { ...hurtP, lean: -0.32, hipX: -1.5, fFx: 4, fBx: -3 };
  const d2 = { ...d1, hipY: 4, lean: -0.1, fFx: 4, fBx: -2, hFy: 9, hBy: 9, hFx: 4, bowA: 0.9, eye: 0.6, soul: 0.6 };
  const d3 = { ...d2, hipY: 6, lean: 0.15, head: 1, eye: 0.3, soul: 0.3, jaw: 1.5 };
  const piv = [AAX - 3, AAY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, hipY: 4, lean: 0, soul: 0.1, eye: 0.1 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, hipY: 4, lean: 0, hFy: 10, hFx: 5, soul: 0, eye: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Totenrufer (wight_caller)

const CWW = 72, CWH = 60, CAX2 = 32, CAY2 = 54;
const CD = { legH: 12, thigh: 6, shin: 6.5, spine: 10, upper: 5.5, fore: 5.5, sh: 1.5, hipW: 1 };
const ROBE_B = ['#0a0c10', '#141a20', '#20282e', '#2e383e', '#404c50', '#5c6a6a'];
const C_REST2 = {
  hipX: 0, hipY: 0, lean: 0.12, head: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 7, hFy: 7, hBx: 3, hBy: 7, sa: -1.45, flame: 0.5, sway: 0, hood: 0, cast: 0, orbit: 0, eye: 1,
  circle: 0, rise: 0, wph: 0,
};
const cpose2 = (o = {}) => ({ ...C_REST2, ...o });

// Knochenstab mit Käfiglaterne, darin eine Geisterflamme
function lanternStaff(p, g, hx, hy, a, flame, orbit, wph) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  limb(p, hx - dx * 10, hy - dy * 10, hx + dx * 11, hy + dy * 11, 1.6, 1.6, [WOODB[0], WOODB[1], WOODB[2], WOODB[3]], WOODB[4]);
  for (let s = -9; s < 11; s += 3.5) p.px(hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, BN[3]); // Knochenringe
  p.px(hx - dx * 10.5, hy - dy * 10.5, BRZ[4]);
  if (p.fine) {
    // Stab fein: Maserlinie, Knochenringe als umlaufende Bänder (hell vorn, Kerbe hinten), Bronzezwinge unten
    for (let s = -9.5; s < 10.5; s += 0.5) if ((Math.floor(s * 0.8) & 3) === 1) fd(p, hx + dx * s - nx * 0.25, hy + dy * s - ny * 0.25, WOODB[1]);
    for (let s = -9; s < 11; s += 3.5) {
      fd(p, hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, BN[5]); fd(p, hx + dx * s, hy + dy * s, BN[3]);
      fd(p, hx + dx * s - nx * 0.5, hy + dy * s - ny * 0.5, BN[1]); fd(p, hx + dx * (s + 0.5), hy + dy * (s + 0.5), BN[0]);
    }
    fd(p, hx - dx * 10.5 + nx * 0.25, hy - dy * 10.5 + ny * 0.25, BRZ[6]); fd(p, hx - dx * 10.5 - nx * 0.25, hy - dy * 10.5 - ny * 0.25, BRZ[2]);
  }
  // Haken + Käfig
  const tx = hx + dx * 11, ty = hy + dy * 11;
  const cx = tx + dx * 3.5, cy = ty + dy * 3.5;
  // Käfig: Bronzestreben um die Flamme
  const r = 2.6;
  for (let i = 0; i < 5; i++) {
    const t = -1 + i * 0.5;
    const ax = cx + nx * t * r - dx * r, ay = cy + ny * t * r - dy * r, bx = cx + nx * t * r * 1.1 + dx * r, by = cy + ny * t * r * 1.1 + dy * r;
    if (p.fine) {
      // Streben fein: 1 Feinpixel Licht + 1 Feinpixel Schatten (zweistufiges Bronzeband)
      fl(p, ax, ay, bx, by, i === 0 ? BRZ[6] : i === 4 ? BRZ[3] : BRZ[5]);
      fl(p, ax - nx * 0.5, ay - ny * 0.5, bx - nx * 0.5, by - ny * 0.5, i === 4 ? BRZ[1] : BRZ[2]);
    } else p.line(ax, ay, bx, by, i === 0 ? BRZ[5] : i === 4 ? BRZ[2] : BRZ[3]);
  }
  // Flamme (unter den Streben durchsichtig)
  const fr = 1.5 + flame * 1.1;
  if (p.fine) {
    // Flamme fein: weißer, heißer Kern, türkiser Saum, Zunge oben spitz
    for (let y = -fr * 1.6; y <= fr; y += 0.25) {
      const w = (y < 0 ? fr * (1 + y / (fr * 1.6)) : Math.sqrt(Math.max(0, fr * fr - y * y))) * 0.9;
      for (let x = -w; x <= w; x += 0.25) {
        const d = Math.hypot(x / (fr + 0.01), y / (fr * 1.3));
        const wob = Math.sin(wph * 3 + y) * 0.4;
        fd(g, cx + x + wob, cy + y, d < 0.35 ? GH[5] : d < 0.65 ? GH[4] : d < 0.9 ? GH[3] : GH[2]);
        if (d < 0.75) fd(p, cx + x + wob, cy + y, d < 0.3 ? GH[5] : d < 0.55 ? GH[4] : GH[3]);
      }
    }
  } else for (let y = -fr * 1.6; y <= fr; y += 0.5) {
    const w = (y < 0 ? fr * (1 + y / (fr * 1.6)) : Math.sqrt(Math.max(0, fr * fr - y * y))) * 0.9;
    for (let x = -w; x <= w; x += 0.5) {
      const d = Math.hypot(x / (fr + 0.01), y / (fr * 1.3));
      const wob = Math.sin(wph * 3 + y) * 0.4;
      const c = d < 0.35 ? GH[5] : d < 0.65 ? GH[4] : GH[3];
      g.px(cx + x + wob, cy + y, c);
      if (d < 0.6) p.px(cx + x + wob, cy + y, d < 0.3 ? GH[5] : GH[4]);
    }
  }
  // Lichthof: gerastert, damit er nicht als Scheibe liest
  const HR = fr + 1.5 + flame * 1.2;
  for (let y = -HR; y <= HR; y++) for (let x = -HR; x <= HR; x++) {
    const d = Math.hypot(x, y) / HR;
    if (d > 1 || d < 0.45) continue;
    if (((Math.round(cx + x) + Math.round(cy + y)) & 1) && d > 0.7) continue;
    g.px(cx + x, cy + y, d < 0.7 ? GH[1] : GH[0]);
  }
  g.px(cx, cy - fr * 1.6, GH[4]);
  // Streben vorn über der Flamme
  if (p.fine) {
    fl(p, cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r, BRZ[5]); fl(p, cx - dx * r - nx * 0.5, cy - dy * r - ny * 0.5, cx + dx * r - nx * 0.5, cy + dy * r - ny * 0.5, BRZ[3]);
    fd(p, cx - dx * r + nx * 0.25, cy - dy * r + ny * 0.25, '#fff2d0');
    // Kappe mit Ring: Glanzpunkt, Niete
    p.px(cx + dx * (r + 0.8), cy + dy * (r + 0.8), BRZ[4]); p.px(cx + dx * (r + 1.6), cy + dy * (r + 1.6), BRZ[3]);
    fd(p, cx + dx * (r + 0.8) - 0.25, cy + dy * (r + 0.8) - 0.25, BRZ[6]); fd(p, cx + dx * (r + 1.6) + 0.25, cy + dy * (r + 1.6) + 0.25, BRZ[1]);
    rivet(p, cx + dx * (r + 1.2), cy + dy * (r + 1.2));
  } else {
    p.line(cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r, BRZ[4]);
    p.px(cx + dx * (r + 0.8), cy + dy * (r + 0.8), BRZ[5]); p.px(cx + dx * (r + 1.6), cy + dy * (r + 1.6), BRZ[4]);
  }
  // umkreisende Seelenfunken beim Kanalisieren
  if (orbit > 0) {
    const n = 5, R = 3.5 + orbit * 3;
    for (let i = 0; i < n; i++) {
      const a2 = orbit * 5 + (i / n) * TAU + wph;
      const ox = cx + Math.cos(a2) * R, oy = cy + Math.sin(a2) * R * 0.7;
      p.px(ox, oy, GH[3]); g.px(ox, oy, GH[4]); g.px(ox - Math.sin(a2), oy + Math.cos(a2) * 0.7, GH[2]);
      if (p.fine) {
        fd(p, ox, oy, GH[5]); fd(g, ox, oy, GH[5]); fd(g, ox + 0.5, oy, GH[5]);
        for (let k = 1; k <= 3; k++) fd(g, ox - Math.sin(a2) * k * 0.5 + 0.25, oy + Math.cos(a2) * 0.7 * k * 0.5 + 0.25, GH[k < 2 ? 3 : 2]);
      }
    }
  }
  return { x: cx, y: cy };
}

function drawCaller(p, g, P, X) {
  const R = rig(P, CD, CAX2, CAY2);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};

  // --- Beschwörungskreis am Boden (Leucht-Ebene + blasse Runen)
  if (P.circle > 0.05) {
    const cx = CAX2 + 12, cy = CAY2 - 1, rx = 5 + P.circle * 11, ry = rx * 0.32;
    if (p.fine) {
      // Kreis fein: vorn eine heiße Linie mit Saum innen, hinten gestrichelt; Runen als kleine Zeichen mit Kern
      for (let a = 0; a < TAU; a += 0.025) {
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        const front = Math.sin(a) > 0;
        if (!front && (Math.round(a * 20) & 1)) continue;
        fd(g, x, y, front ? GH[P.circle > 0.7 ? 4 : 3] : GH[2]);
        if (front) fd(g, x, y - 0.5, GH[P.circle > 0.7 ? 2 : 1]);
      }
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + P.wph * 0.5;
        const x = cx + Math.cos(a) * rx * 0.72, y = cy + Math.sin(a) * ry * 0.72;
        fd(g, x, y - 0.5, GH[3]); fd(g, x, y, GH[5]); fd(g, x + 0.5, y, GH[4]); fd(g, x + 1, y - 0.5, GH[3]); fd(g, x + 1, y + 0.5, GH[2]);
      }
    } else {
      for (let a = 0; a < TAU; a += 0.06) {
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        const front = Math.sin(a) > 0;
        if (!front && (Math.round(a * 20) & 1)) continue;
        g.px(x, y, GH[front ? (P.circle > 0.7 ? 3 : 2) : 1]);
      }
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + P.wph * 0.5;
        const x = cx + Math.cos(a) * rx * 0.72, y = cy + Math.sin(a) * ry * 0.72;
        g.px(x, y, GH[4]); g.px(x + 1, y, GH[2]);
      }
    }
    // aufsteigende Seelen aus dem Boden
    if (P.rise > 0) {
      for (let i = 0; i < 4; i++) {
        const x = cx - rx * 0.6 + i * rx * 0.4 + Math.sin(P.wph + i) * 1, y0 = cy - 1 - (hash2(i, 3, 90) * 2);
        const h = (3 + ((i * 3 + Math.round(P.wph * 2)) % 5)) * P.rise;
        if (p.fine) {
          for (let j = 0; j < h; j += 0.5) fd(g, x + Math.sin(P.wph * 2 + j * 0.8 + i) * 0.7, y0 - j, GH[j < h * 0.3 ? 4 : j < h * 0.7 ? 3 : 2]);
          fd(g, x, y0 - h, GH[5]); fd(g, x + 0.5, y0 - h, GH[4]); fd(g, x, y0 - h + 0.5, GH[4]); fd(g, x + 0.5, y0 - h + 0.5, GH[3]);
        } else {
          for (let j = 0; j < h; j++) g.px(x + Math.sin(P.wph * 2 + j * 0.8 + i) * 0.7, y0 - j, GH[j < h * 0.4 ? 3 : 2]);
          g.px(x, y0 - h, GH[4]);
        }

      }
    }
  }

  // --- hinterer Arm (Ärmel, knochige Hand)
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3, 3.5, [ROBE_B[0], ROBE_B[0], ROBE_B[1], ROBE_B[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 3.5, 4.2, [ROBE_B[0], ROBE_B[1], ROBE_B[1], ROBE_B[2]]);
  p.px(armB.ex + 1, armB.ey, BN[2]); p.px(armB.ex + 2, armB.ey + 1, BN[1]);
  if (p.fine) {
    // Ärmel: Saumkante und eine Falte; Fingerknochen mit Gelenkkerbe
    fl(p, armB.jx - 1.5, armB.jy + 0.5, armB.ex - 1.5, armB.ey + 1, ROBE_B[3]);
    fd(p, armB.ex + 1, armB.ey, BN[4]); fd(p, armB.ex + 1.5, armB.ey + 0.5, BN[0]); fd(p, armB.ex + 2, armB.ey + 1, BN[3]);
  }
  if (P.cast > 0.05) {
    g.px(armB.ex + 1, armB.ey, GH[4]); g.px(armB.ex + 2, armB.ey, GH[2]); g.px(armB.ex + 1, armB.ey - 1, GH[2]);
    if (P.cast > 0.6) { g.px(armB.ex, armB.ey - 1, GH[1]); g.px(armB.ex + 2, armB.ey + 1, GH[1]); g.px(armB.ex + 1, armB.ey - 2 - P.wph % 2, GH[3]); }
    p.px(armB.ex + 1, armB.ey, GH[3]);
    if (p.fine) { fd(p, armB.ex + 1, armB.ey, GH[5]); fd(g, armB.ex + 1, armB.ey, GH[5]); fd(g, armB.ex + 1.5, armB.ey - 0.5, GH[4]); }
  }

  // --- Robe: bodenlang, zerfetzter Saum
  const top = pt(CD.spine, 0), waist = pt(1, 0);
  const hemY = CAY2 - 0.5;
  const hemL = Math.min(legB.ex, legF.ex) - 5 + Math.sin(P.sway) * 1 - P.lean * 6;
  const hemR = Math.max(legB.ex, legF.ex) + 3.5 + Math.sin(P.sway + 1) * 0.8;
  if (p.fine) {
    // Robe fein: Feinpixel-Zeilen; jede Falte zweifarbig (heller Grat, dunkle Kehle), Fransen je Weltspalte
    // unterschiedlich lang (ruhig), Bronzeborte mit Lichtkante und Perlen
    const ss = Math.round(P.sway * 3);
    for (let y = Math.round(waist.y); y <= hemY + 0.25; y += 0.5) {
      const f = (y - waist.y) / (hemY - waist.y || 1);
      const l = waist.x - 4 + (hemL - (waist.x - 4)) * f;
      const r = waist.x + 3.5 + (hemR - (waist.x + 3.5)) * f * f;
      const yw = Math.floor(y), borte = yw > hemY - 4.5 && yw <= hemY - 3.5;
      for (let x = Math.round(l * 2) / 2; x <= Math.round(r) + 0.5; x += 0.5) {
        const u = (x - l) / (r - l || 1), xw = Math.floor(x);
        if (y > hemY - 2.5 && hash2(xw, ss, 93) < 0.3 * (y - (hemY - 2.5))) continue; // Fransen
        if (borte && xw > Math.round(l) && xw < Math.round(r)) {
          const bead = xw % 3 === 0, top = y === yw;
          p.dot(x + 0.1, y + 0.1, top ? (bead ? (x === xw ? '#fff2d0' : BRZ[6]) : BRZ[4]) : (bead ? BRZ[3] : BRZ[2]));
          continue;
        }
        const arg = u * 8 + P.sway * 0.7 + f * 1.5, fold = Math.sin(arg);
        let k = u < 0.07 ? 5 : u < 0.18 ? 4 : u > 0.84 ? 1 : fold > 0.35 ? 3 : fold < -0.4 ? 1 : 2;
        if (k === 3 && fold > 0.9 && Math.cos(arg) > -0.2) k = 4;          // Faltengrat im Licht
        else if (k === 1 && u <= 0.84 && fold < -0.88) k = 0;                // Faltenkehle
        if (y > hemY - 1.5) k = Math.max(0, k - 1);
        p.dot(x + 0.1, y + 0.1, ROBE_B[k]);
      }
    }
  } else for (let y = Math.round(waist.y); y <= hemY; y++) {
    const f = (y - waist.y) / (hemY - waist.y || 1);
    const l = waist.x - 4 + (hemL - (waist.x - 4)) * f;
    const r = waist.x + 3.5 + (hemR - (waist.x + 3.5)) * f * f;
    for (let x = Math.round(l); x <= Math.round(r); x++) {
      const u = (x - l) / (r - l || 1);
      if (y > hemY - 2.5 && hash2(x, Math.round(P.sway * 3), 93) < 0.3 * (y - (hemY - 2.5))) continue; // Fransen
      const fold = Math.sin(u * 8 + P.sway * 0.7 + f * 1.5);
      let k = u < 0.07 ? 5 : u < 0.18 ? 4 : u > 0.84 ? 1 : fold > 0.35 ? 3 : fold < -0.4 ? 1 : 2;
      if (y > hemY - 1.5) k = Math.max(0, k - 1);
      p.px(x, y, ROBE_B[k]);
    }
    // Bronzeborte über dem Saum
    if (y > hemY - 4.5 && y <= hemY - 3.5) for (let x = Math.round(l) + 1; x <= Math.round(r) - 1; x += 1) p.px(x, y, (x % 3) ? BRZ[3] : BRZ[5]);
  }
  limb(p, waist.x, waist.y, top.x, top.y, 7.5, 8, [ROBE_B[1], ROBE_B[2], ROBE_B[3], ROBE_B[4]]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  const fq = (u, k, c) => { const o = pt(u, k); fd(p, o.x, o.y, c); };
  if (p.fine) {
    // Brustfalten des Gewands: zwei Grate mit Kehle, vom Gürtel zur Schulter
    for (let u = 1.5; u <= 8.5; u += 0.5) { fq(u, -1.2 + u * 0.08, ROBE_B[4]); fq(u, -0.7 + u * 0.08, ROBE_B[1]); fq(u, 1.3 - u * 0.05, ROBE_B[3]); fq(u, 1.8 - u * 0.05, ROBE_B[0]); }
  }
  // Grabbeigaben: Knochenkette + Bronze-Scheibe
  for (let u = 3; u <= 8; u += 1) q(u, 2.8 - (u - 3) * 0.35, (u % 2) ? BN[4] : BN[2]);
  q(3, 2.2, BRZ[5]); q(2.5, 2.2, BRZ[3]);
  for (let k = -3.5; k <= 3.5; k += 0.5) q(1.3, k, BRZ[2]);
  q(1.3, 2, BRZ[5]);
  if (p.fine) {
    // Kette fein: einzelne Knochenperlen (Licht oben links, Kerbe unten rechts), Schnur dazwischen
    for (let u = 3; u <= 8; u += 1) { const o = pt(u, 2.8 - (u - 3) * 0.35); fd(p, o.x - 0.25, o.y - 0.25, (u % 2) ? BN[5] : BN[3]); fd(p, o.x + 0.25, o.y + 0.25, (u % 2) ? BN[2] : BN[0]); }
    { const o = pt(2.75, 2.2); ell(p, o.x, o.y, 0.8, 0.7, metalShade([BRZ[1], BRZ[3], BRZ[4], BRZ[5], BRZ[6]])); fd(p, o.x - 0.25, o.y - 0.25, '#fff2d0'); fd(p, o.x + 0.25, o.y + 0.25, VERD[3]); }
    for (let k = -3.5; k <= 3.5; k += 0.5) { fq(1.55, k, BRZ[4]); fq(1.05, k, BRZ[1]); }
    { const o = pt(1.3, 2); rivet(p, o.x, o.y); }
  }

  // --- Kopf: tiefe Kapuze mit Bronze-Totenmaske und Zackenreif
  const neck = pt(CD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  if (p.fine) {
    // Kapuze fein: Stoffwölbung in Stufen, Saumkante am Gesicht, zwei Faltenzüge nach hinten
    ell(p, hx - 0.5, hy, 4.4, 4.4, (u, v) => { const d = u * -0.6 + v * -0.8; return ROBE_B[d > 0.55 ? 4 : d > 0.1 ? 3 : d > -0.45 ? 2 : 1]; });
    fl(p, hx - 3, hy - 3, hx - 1, hy - 4.25, ROBE_B[5]);
    fl(p, hx - 0.5, hy - 3.5, hx - 0.5, hy + 3, ROBE_B[4]);
    fl(p, hx - 3.5, hy - 1, hx - 2, hy + 3, ROBE_B[1]); fl(p, hx - 3, hy - 1.5, hx - 1.5, hy + 2.5, ROBE_B[3]);
    for (let i = 0; i < 5; i += 0.5) fd(p, hx - 4 - i + P.hood * i * 0.3, hy - 2 - i * 0.4 + i * i * 0.25, ROBE_B[i < 2 ? 4 : i < 3.5 ? 3 : 2]);
    for (let i = 0.5; i < 4.5; i += 0.5) fd(p, hx - 4 - i + P.hood * i * 0.3, hy - 1.5 - i * 0.4 + i * i * 0.25, ROBE_B[1]);
    // Zackenreif fein: Band mit Lichtkante, spitze Zacken (2 Feinpixel Fuß, 1 Feinpixel Spitze, Glanzpunkt)
    for (let k = -3; k <= 2.5; k += 0.5) { p.dot(hx + k + 0.1, hy - 4 + 0.1, BRZ[5]); p.dot(hx + k + 0.1, hy - 3.5 + 0.1, BRZ[2]); }
    for (let k = -2; k <= 2; k += 2) {
      p.dot(hx + k + 0.1, hy - 4.5 + 0.1, BRZ[6]); p.dot(hx + k + 0.6, hy - 4.5 + 0.1, BRZ[3]);
      p.dot(hx + k + 0.1, hy - 5 + 0.1, BRZ[5]); p.dot(hx + k + 0.6, hy - 5 + 0.1, BRZ[3]);
      p.dot(hx + k + 0.1, hy - 5.5 + 0.1, BRZ[6]); p.dot(hx + k + 0.1, hy - 6 + 0.1, '#fff2d0');
    }
    p.dot(hx - 3 + 0.1, hy - 4.5 + 0.1, BRZ[4]);
  } else {
    ell(p, hx - 0.5, hy, 4.4, 4.4, ROBE_B[2]);
    ell(p, hx - 1, hy - 1, 3.4, 3.2, ROBE_B[3]);
    p.px(hx - 3, hy - 3, ROBE_B[5]); p.px(hx - 2, hy - 4, ROBE_B[4]);
    for (let i = 0; i < 5; i++) p.px(hx - 4 - i + P.hood * i * 0.3, hy - 2 - i * 0.4 + i * i * 0.25, ROBE_B[i < 2 ? 3 : 2]);
    // Zackenreif (Bronzekrone) über der Kapuze
    for (let k = -3; k <= 2; k++) {
      p.px(hx + k, hy - 4, BRZ[3]);
      if ((k & 1) === 0) { p.px(hx + k, hy - 5, BRZ[5]); p.px(hx + k, hy - 6, BRZ[6]); }
    }
  }
  // Maske: Bronze-Totenmaske im Profil (Stirn, Augenloch, Nasenrücken, Mundschlitz)
  p.rect(hx, hy - 2, 1, 5, ROBE_B[0]); // Kapuzenschatten hinter der Maske
  pmap(p, hx + 1, hy - 2, [
    'shhl',
    'hkel',
    'lmmh',
    'mVmd',
    'dkkd',
  ], { s: BRZ[6], h: BRZ[5], l: BRZ[4], m: BRZ[3], d: BRZ[2], V: VERD[3], k: '#040506', e: GH[4] });
  p.px(hx + 4, hy + 2, ROBE_B[1]);
  if (P.eye <= 0.3) p.px(hx + 3, hy - 1, '#040506');
  else if (p.fine) wisp(p, g, hx - 5, hy - 1.5, 4, P.wph, -1, 0.25, P.eye, false);   // Fahne nur hinter der Kapuze
  else {
    g.px(hx + 3, hy - 1, GH[5]); g.px(hx + 2, hy - 1, GH[3]); g.px(hx + 4, hy - 1, GH[2]); g.px(hx + 3, hy, GH[1]);
    wisp(p, g, hx + 2, hy - 1.5, 5, P.wph, -1, 0.25, P.eye, false);
  }
  p.px(hx + 1, hy - 3, ROBE_B[3]); p.px(hx + 2, hy - 3, ROBE_B[2]); p.px(hx + 3, hy - 3, ROBE_B[2]);
  if (p.fine) {
    // Totenmaske fein (Feinpixel relativ zur Maske): Glanzlinie auf der Stirn, Brauenkante über dem Augenloch,
    // leuchtendes Auge mit weißem Kern, Nasenrücken im Licht, Mundschlitz mit Lippenkante, Grünspan
    const M0x = hx + 1, M0y = hy - 2, md = (x, y, c) => p.dot(M0x + x / 2 + 0.1, M0y + y / 2 + 0.1, c);
    md(0, 0, '#fffbe8'); for (let x = 1; x <= 4; x++) md(x, 0, '#e4cc90');
    md(4, 1, BRZ[2]); md(5, 1, BRZ[2]); md(3, 1, BRZ[3]);
    // Augenschlitz ganz dunkel, darin zwei harte Glutpunkte (weißer Kern, 1 Feinpixel Saum), kein Schleier
    for (let x = 2; x <= 5; x++) for (let y = 2; y <= 3; y++) md(x, y, '#040506');
    if (P.eye > 0.3) {
      md(2, 2, GH[5]); md(2, 3, GH[3]);                          // fernes Auge
      md(5, 2, GH[5]); md(4, 2, GH[3]); md(5, 3, GH[3]);         // nahes Auge
      g.dot(M0x + 1.1, M0y + 1.1, GH[5]); g.dot(M0x + 2.6, M0y + 1.1, GH[5]);
      g.dot(M0x + 1.1, M0y + 1.6, GH[2]); g.dot(M0x + 2.1, M0y + 1.1, GH[2]); g.dot(M0x + 2.6, M0y + 1.6, GH[2]);
    }

    md(6, 3, '#e4cc90'); md(6, 4, BRZ[6]); md(7, 4, BRZ[4]); md(6, 5, BRZ[5]); md(7, 6, BRZ[2]); md(7, 7, BRZ[1]);
    md(4, 7, BRZ[4]); md(5, 7, BRZ[4]); md(1, 8, BRZ[1]); md(6, 8, BRZ[1]);
    md(2, 6, VERD[4]); md(3, 7, VERD[2]);
    md(0, 9, BRZ[1]); md(7, 9, BRZ[0]);
  }
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 7 };
  meta.mouth = { x: hx + 3, y: hy + 1 };

  // --- vorderer Arm + Laternenstab
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 8, 17, GH_EDGE, GH_EDGE_G, 1);
  limb(p, shF.x, shF.y, armF.jx, armF.jy, 3, 3.5, [ROBE_B[2], ROBE_B[3], ROBE_B[4], ROBE_B[5]]);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 3.5, 4.2, [ROBE_B[2], ROBE_B[3], ROBE_B[4], ROBE_B[5]]);
  p.px(armF.ex, armF.ey + 1, BRZ[4]);
  if (p.fine) {
    // Ärmel zweifarbig: Faltengrat und Kehle am Ellbogen, dunkle Saumöffnung
    fl(p, armF.jx - 0.5, armF.jy - 1, armF.jx + 1.5, armF.jy + 0.5, ROBE_B[5]); fl(p, armF.jx - 0.5, armF.jy - 0.5, armF.jx + 1.5, armF.jy + 1, ROBE_B[1]);
    fl(p, shF.x - 0.5, shF.y + 0.5, armF.jx - 1, armF.jy, ROBE_B[2]);
    fd(p, armF.ex - 0.25, armF.ey + 1, BRZ[6]); fd(p, armF.ex + 0.25, armF.ey + 1.25, BRZ[2]);
  }
  const lan = lanternStaff(p, g, armF.ex, armF.ey, P.sa, P.flame, P.orbit, P.wph);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BN[2]); p.px(armF.ex - 1, armF.ey - 1, BN[4]);
  if (p.fine) { fd(p, armF.ex - 1, armF.ey - 1, BN[5]); fd(p, armF.ex - 0.25, armF.ey - 0.25, BN[1]); fd(p, armF.ex + 0.25, armF.ey - 0.75, BN[3]); fd(p, armF.ex + 0.25, armF.ey + 0.25, BN[0]); }

  meta.hand = lan;
  meta.cast = lan;
  return meta;
}

function callerAnims() {
  const mk = (P, X) => makeFrame(CWW, CWH, CAX2, CAY2, drawCaller, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(cpose2({ hipY: Math.sin(a) > 0.3 ? 1 : 0, sway: a, flame: 0.5 + Math.sin(a * 2) * 0.2, hFy: 7 + Math.sin(a) * 0.5, head: Math.sin(a) * 0.3, hood: Math.sin(a), wph: a })));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(cpose2({
      fFx: 1 + s * 3.5, fFy: Math.max(0, -c) * 1.5, fBx: -1 - s * 3.5, fBy: Math.max(0, c) * 1.5,
      hipY: c > 0.5 || c < -0.5 ? 0 : 1, lean: 0.16, sway: ph * 2, hFx: 6 + s * 0.8, sa: -1.42 - s * 0.05,
      hBx: 2 - s * 1.5, flame: 0.5, hood: -1 + s * 0.3, wph: ph,
    })));
  }
  // Geisterblitz: Laterne hoch, Flamme wächst, Seelenfunken kreisen …
  const windup = [
    mk(cpose2({ hFx: 5, hFy: 1, sa: -1.55, hBx: 4, hBy: 2, cast: 0.3, flame: 0.8, orbit: 0.2, lean: 0.02, wph: 1 })),
    mk(cpose2({ hFx: 4, hFy: -3, sa: -1.6, hBx: 5, hBy: -1, cast: 0.6, flame: 1.2, orbit: 0.5, lean: -0.05, sway: 1, hood: 0.5, wph: 2 })),
    mk(cpose2({ hFx: 3, hFy: -5, sa: -1.65, hBx: 5, hBy: -3, cast: 0.9, flame: 1.6, orbit: 0.8, lean: -0.1, sway: 2, hood: 1, wph: 3 })),
    mk(cpose2({ hFx: 3, hFy: -6, sa: -1.7, hBx: 5, hBy: -4, cast: 1, flame: 1.9, orbit: 1.1, lean: -0.12, sway: 3, hood: 1, wph: 4 })),
  ];
  // … und nach vorn gestoßen: der Blitz löst sich aus der Laterne
  const strike = [
    mk(cpose2({ hFx: 10, hFy: 0, sa: -0.4, hBx: 3, hBy: 3, flame: 2, lean: 0.24, hipX: 1, fFx: 4, fBx: -3, sway: 4, hood: -1, wph: 5 }), { smear: [-1.7, -0.4], fx: 'cast' }),
    mk(cpose2({ hFx: 11, hFy: 1, sa: -0.25, hBx: 2, hBy: 4, flame: 0.4, lean: 0.28, hipX: 1.5, fFx: 4, fBx: -3, sway: 5, hood: -1.5, wph: 6 })),
    mk(cpose2({ hFx: 8, hFy: 3, sa: -0.9, hBx: 2, hBy: 5, flame: 0.3, lean: 0.16, hipX: 1, fFx: 3, fBx: -3, sway: 6, wph: 7 })),
  ];
  // Beschwörung: beide Arme hoch, Laterne über dem Kopf, Kreis am Boden, Seelen steigen auf
  const sk = [
    [0, cpose2({ wph: 0 })],
    [0.25, cpose2({ hFx: 7, hFy: -2, sa: -1.35, hBx: 4, hBy: -2, cast: 0.5, flame: 1, lean: 0.02, circle: 0.3, sway: 1, wph: 1.5 })],
    [0.5, cpose2({ hFx: 8, hFy: -7, sa: -1.2, hBx: 1, hBy: -8, cast: 1, flame: 1.8, orbit: 0.8, lean: -0.14, circle: 0.8, rise: 0.4, sway: 2, hood: 1, head: -0.5, wph: 3 }), snap],
    [0.8, cpose2({ hFx: 9, hFy: -8, sa: -1.15, hBx: 0, hBy: -9, cast: 1, flame: 2, orbit: 1.3, lean: -0.16, circle: 1, rise: 1, sway: 3, hood: 1.2, head: -0.6, wph: 4.5 })],
    [1, cpose2({ hFx: 7, hFy: 4, sa: -1.2, hBx: 6, hBy: 6, cast: 0.3, flame: 1.2, orbit: 0.3, lean: 0.2, circle: 1, rise: 1, sway: 4, wph: 6 })],
  ];
  const summon = track(mk, sk, 8, { extras: { 5: { fx: 'cast' } } });
  const hurtP = cpose2({ lean: -0.2, hipX: -1, head: -1, hFx: 4, hFy: 4, sa: -1.9, hBx: 0, hBy: 4, flame: 1, sway: 2, hood: 1.5, wph: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, C_REST2, 0.5))];
  // Tod: sinkt in die Robe, Laterne fällt, Flamme erlischt
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, flame: 1.2 };
  const d2 = { ...d1, hipY: 3, lean: -0.1, hFy: 8, sa: -2.3, flame: 0.6, wph: 3 };
  const d3 = { ...d2, hipY: 5, lean: 0.1, flame: 0.25, eye: 0, wph: 4 };
  const piv = [CAX2 - 3, CAY2 - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, flame: 0.1 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, flame: 0, eye: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    summon: new Animation(summon, 7, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Export

export function createBarrowFoes() {
  return {
    barrow_wight: wightAnims(),
    grave_hound: houndAnims(),
    bone_archer: boneArcherAnims(),
    wight_caller: callerAnims(),
  };
}
