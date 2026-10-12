import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner des Sporenschlunds (Stufe 30–32): Sporling (Schwarm, hüpft),
// Pilzwüterich (schwer, Stampfer) und Sporenwirker (Zauberer, Giftsporen,
// Spezialangriff Giftwolke). Grüne und violette Biolumineszenz auf der
// Leucht-Ebene (frame.glow).
//
// Aufbau wie foes_ashwood.js: kleine Rigs mit Schlüsselposen, die beim Laden
// weich interpoliert werden. frame.meta: eye/hand/mouth/head (relativ zum
// Anker), bei Zauberern ist meta.hand die Mündung (Sporenkapsel).
// frame.fx: 'step' | 'impact' | 'cast'. Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln; die Formen
// (ell, capsule, drawCap, smearArc) tasten Feinpixel ab, p.px/p.rect setzen ganze Weltpixel. Handfeine
// Zusätze (Lamellen, Flecken, Gesichter, Fasern, Falten) stehen in if (p.fine) – bei „Niedrig“ (res 1) bleibt
// das Bild pixelgleich wie vor dem Update.

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

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy),
// frisch (am Ende) breit und hell, am Anfang schmal. sy staucht die
// Bahn senkrecht (waagerechte Hiebe in 3/4-Sicht).
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  // geschlossene Sichel ohne Raster: dünn am Anfang, zur Klinge hin breit,
  // Außenkante hell (Klingenbahn), innen dunkler auslaufend
  // fein: geschlossene Fläche in Feinpixeln (keine Streuung, daher kein Flimmern)
  const q = p.step ?? 1, Rq = 1 / q;
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 1.6 * Rq) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const w = (r1 - r0) * (0.12 + 0.88 * f * f);
    for (let r = r1 - w; r <= r1; r += 0.5 * q) {
      const radial = (r - (r1 - w)) / (w || 1);
      const x = Math.round((cx + Math.cos(a) * r) * Rq) * q, y = Math.round((cy + Math.sin(a) * r * sy) * Rq) * q;
      const c = radial > 0.8 ? cols[2] : radial > 0.4 ? cols[1] : cols[0];
      p.dot(x, y, c);
      if (g && gcols && f > 0.35 && radial > 0.45) g.dot(x, y, radial > 0.8 ? gcols[1] : gcols[0]);
    }
  }
}

// Dreht den Inhalt einer FineCanvas texelgenau (nächster Nachbar) um einen Drehpunkt (Weltpixel).
// Arbeitet auf Pixelpuffern (Texel): src = Uint32-Puffer W×H, Ergebnis = neuer Puffer.
function rotBlit(s, W, H, px, py, ang) {
  const d = new Uint32Array(W * H);
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x + 0.5 - px, ry = y + 0.5 - py;
    const sx = Math.floor(px + rx * c - ry * sn), sy = Math.floor(py + rx * sn + ry * c);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const v = s[sy * W + sx];
    if (v >>> 24 === 0) continue;
    d[y * W + x] = v;
  }
  return d;
}
// Puffer zeilenversetzt (dy Texel) in eine FineCanvas legen (nur deckende Texel, wie drawImage auf leerer Fläche)
function blitRows(dst, s, W, H, dy) {
  const b = dst.buf, DH = dst.H;
  for (let y = 0; y < H; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= DH) continue;
    for (let x = 0, si = y * W, di = ty * W; x < W; x++) if (s[si + x] >>> 24) b[di + x] = s[si + x];
  }
  dst.dirty = true;
}
// Leucht-Ebene auf die gezeichnete Fläche zuschneiden (Anker mitführen) – spart Leinwand und Zeichenzeit
let EMPTY = null;
function glowFrame(g, ax, ay, res) {
  const b = g.pixels(), W = g.W, H = g.H;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) if (b[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) { EMPTY ??= pixelsToCanvas(new Uint32Array(1), 1, 1); return new SpriteFrame(EMPTY, 0, 0, res); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, c = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) c.set(b.subarray((y + y0) * W + x0, (y + y0) * W + x0 + w), y * w);
  return new SpriteFrame(pixelsToCanvas(c, w, h), ax - x0, ay - y0, res);
}

// Licht von links oben, leicht zum Betrachter (wie foes_steppe.js): Material
// wird pro Pixel über die Flächennormale schattiert statt in festen Bändern.
const LX = -0.52, LY = -0.66, LZ = 0.54;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function tone(ramp, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
}

// Schattierte Ellipse (optional gedreht, mit Materialrauschen und Clip)
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null } = o;
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1, h = (p.step ?? 1) / 2;
  const nk = p.fine ? 0 : noise;                       // fein: kein Materialrauschen (Struktur zeichnet die Figur)
  p.each(cx - R, cy - R, cx + R, cy + R, (px, py) => {
    const dx = px - cx, dy = py - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return null;
    if (clip && !clip(px - h, py - h)) return null;
    const nz = Math.sqrt(1 - d2);
    const nx = u * c - v * s, ny = u * s + v * c;
    const n = nk ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * nk : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  });
}

// Gefüllte Ellipse: bei res 1 genau wie PixelCanvas.ellipse (Zeilen), fein abgetastet sonst
function pell(p, cx, cy, rx, ry, c) {
  if (p.fine) { p.ellipse(cx, cy, rx, ry, c); return; }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
  }
}

// Schattierte Kapsel (Gliedmaßen, Rumpf): Radius r0 -> r1, rundes Volumen
function capsule(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0 } = o;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const nk = p.fine ? 0 : noise;
  p.each(Math.floor(Math.min(x0, x1) - R), Math.floor(Math.min(y0, y1) - R), Math.ceil(Math.max(x0, x1) + R), Math.ceil(Math.max(y0, y1) + R), (px, py) => {
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const qx = x0 + dx * t, qy = y0 + dy * t;
    const r = r0 + (r1 - r0) * t;
    const ex = px - qx, ey = py - qy;
    if (ex * ex + ey * ey > r * r) return null;
    const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const n = nk ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * nk : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  });
}

// Randlicht: kühles Höhlenlicht (blasses Violett) auf Ober- und linken Kanten,
// damit die Figuren sich vom dunklen Myzelboden lösen. Läuft vor dem Umriss.
// Fein (res 2): etwa 1 Weltpixel tief, harte Stufe – äußerer Texel voll, der zweite schwächer.
const RIM = [214, 200, 228];
function rimLight(p, k1 = 0.34, k2 = 0.18) {
  const w = p.W ?? p.w, h = p.H ?? p.h, r = p.res ?? 1;
  // ohne ctx-Zeichnung direkt im Puffer (gleiche Rundung wie ImageData), sonst über die Leinwand
  const img = p._canvas ? p.ctx.getImageData(0, 0, w, h) : null;
  const d = img ? img.data : new Uint8ClampedArray(p.buf.buffer);
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const ki1 = k1 * 0.45, ki2 = k2 * 0.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!op[i]) continue;
    const up = y > 0 ? op[i - w] : 0, lf = x > 0 ? op[i - 1] : 0;
    let k = !up ? k1 : !lf ? k2 : 0;
    if (!k && r > 1) {
      const up2 = y > 1 ? op[i - 2 * w] : 0, lf2 = x > 1 ? op[i - 2] : 0;
      k = !up2 ? ki1 : !lf2 ? ki2 : 0;
    }
    if (!k) continue;
    const j = i * 4;
    d[j] += (RIM[0] - d[j]) * k; d[j + 1] += (RIM[1] - d[j + 1]) * k; d[j + 2] += (RIM[2] - d[j + 2]) * k;
  }
  if (img) p.ctx.putImageData(img, 0, 0);
  else p.dirty = true;
}

// ---------------------------------------------------------------- handfeine Materialien (nur fein)
// Achse einer Kapsel mit Normale zum Licht (oben links): Punkte innerhalb der Form, an das Rig gebunden.
function axis(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 0.001, ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  return { len, ux, uy, nx, ny };
}
// Rinde/Holz: Maserlinien längs der Kapsel – Grat im Licht, Furchen im Schatten, mit festen Lücken
function barkGrain(p, x0, y0, x1, y1, r0, r1, seed, dim = false) {
  const A = axis(x0, y0, x1, y1), q = p.step / A.len;
  const lines = [[0.62, dim ? ROOT[3] : ROOT[4]], [0.2, ROOT[1]], [-0.25, dim ? ROOT[0] : ROOT[1]], [-0.62, ROOT[0]]];
  lines.forEach(([o, c], li) => {
    for (let s = 0.08; s <= 0.92; s += q) {
      const seg = Math.floor(s * A.len / 2.2);
      if (hash2(seg, li, seed) < 0.28) continue;
      const r = (r0 + (r1 - r0) * s) * (o + Math.sin(s * A.len * 0.9 + li * 1.7) * 0.06);
      p.dot(x0 + A.ux * s * A.len + A.nx * r, y0 + A.uy * s * A.len + A.ny * r, c);
    }
  });
}
// Stoff: Faltenlinien längs einer Kapsel (Grat hell, Tal dunkel), lines = [[Versatz −1..1, Farbe, von, bis], …]
function foldLines(p, x0, y0, x1, y1, r0, r1, lines) {
  const A = axis(x0, y0, x1, y1), q = p.step / A.len;
  for (const [o, c, s0 = 0.1, s1 = 0.9] of lines) {
    for (let s = s0; s <= s1; s += q) {
      const r = (r0 + (r1 - r0) * s) * o;
      p.dot(x0 + A.ux * s * A.len + A.nx * r, y0 + A.uy * s * A.len + A.ny * r, c);
    }
  }
}
// Moos in Strähnen: kurze, nach unten hängende Feinstriche, Spitze im Licht hell, darunter dunkle Kerbe.
// Nur innerhalb der Kapsel (Silhouette bleibt), Lage fest relativ zur Achse.
function mossStrands(p, x0, y0, x1, y1, r0, r1, n, seed, dim = false) {
  const A = axis(x0, y0, x1, y1);
  const inside = (x, y) => {
    const t = clamp(((x - x0) * A.ux + (y - y0) * A.uy) / A.len, 0, 1);
    const ex = x - (x0 + A.ux * t * A.len), ey = y - (y0 + A.uy * t * A.len), r = r0 + (r1 - r0) * t;
    return ex * ex + ey * ey < r * r * 0.78;
  };
  for (let i = 0; i < n; i++) {
    const s = (i + 0.2 + hash2(i, seed, 81) * 0.6) / n, o = (hash2(seed, i, 82) - 0.5) * 1.6;
    const r = r0 + (r1 - r0) * s;
    const bx = x0 + A.ux * s * A.len + A.nx * o * r, by = y0 + A.uy * s * A.len + A.ny * o * r;
    const lit = o > 0.15, l = 1.5 + hash2(i, seed, 83) * 1.5, lean = -0.35 + hash2(i, seed, 84) * 0.3;
    const top = lit ? (dim ? MOSS[4] : MOSS[5]) : o > -0.35 ? MOSS[4] : MOSS[3];
    const body = lit ? MOSS[4] : o > -0.35 ? MOSS[3] : MOSS[2], notch = lit ? MOSS[2] : MOSS[1];
    for (let j = 0; j <= l; j += 0.5) {
      const x = bx + lean * j, y = by + j;
      if (!inside(x, y)) break;
      p.dot(x, y, j === 0 ? top : body);
      if (j > l * 0.45 && inside(x + 0.5, y)) p.dot(x + 0.5, y, notch);     // Schattenkerbe rechts der Strähne (unten)
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
      const WR = W * res, HR = HH * res;
      const rp = rotBlit(tp.pixels(), WR, HR, rx * res, ry * res, a), rg = rotBlit(tg.pixels(), WR, HR, rx * res, ry * res, a);
      let bottom = -1;
      for (let y = HR - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < WR; x++) if ((rp[y * WR + x] >>> 24) > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? Math.round(((AY - 1 / res) - (bottom / res - PAD)) * res) / res : 0;
      blitRows(p, rp, WR, HR, Math.round((shift - PAD) * res)); blitRows(g, rg, WR, HR, Math.round((shift - PAD) * res));
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in meta) {
        const m = meta[k], dx = m.x - rx, dy = m.y - ry0;
        meta[k] = { x: rx + dx * c - dy * s, y: ry0 + dx * s + dy * c + shift };
      }
    } else meta = draw(p, g, P, extra) || {};
    if (extra.post) Object.assign(meta, extra.post(p, g) || {});
    rimLight(p);
  }, { fine: true, res });
  f.glow = glowFrame(g, AX * res, AY * res, res);
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

// Violette Pilzhüte, blasses Pilzfleisch, Lamellen, grüne und violette
// Biolumineszenz, Moos, Wurzelholz.
const CAP = ['#140a1a', '#28122f', '#401c4a', '#5c2a66', '#7c3e86', '#9e5ca6', '#c488c8'];
const FL = ['#1c1816', '#332d28', '#51473b', '#736752', '#978a70', '#bdb192', '#e0d6b8'];
const GILL = ['#191216', '#2c2026', '#46333c', '#5e4650'];
const GG = ['#0a2e10', '#166c1c', '#36bc32', '#92ee62', '#e0ffbc', '#ffffff'];
const GV = ['#280a44', '#5a1c90', '#9848dc', '#d09aff', '#f4e4ff'];
const MOSS = ['#0b150d', '#152418', '#203724', '#2f4e33', '#436a45', '#5c8858'];
const ROOT = ['#130d0b', '#231913', '#39291d', '#523e2a', '#6c563a'];
const SPORE_C = [GG[1], GG[2], GG[3]];
const SPORE_G = [GG[2], GG[4]];

// Sporenwolke: verstreute, leuchtende Pünktchen um (x, y), deterministisch
// fein: jede Spore ein Feinpixel-Kern (hell) mit farbigem Saum, große mit Kreuzsaum
function sporePuff(p, g, x, y, r, k, seed, n = 18, ramp = GG) {
  if (k <= 0.02) return;
  for (let i = 0; i < n; i++) {
    const a = hash2(i, seed, 61) * TAU, d = Math.sqrt(hash2(seed, i, 62)) * r * (0.4 + k * 0.6);
    const px_ = x + Math.cos(a) * d, py_ = y + Math.sin(a) * d * 0.75 - k * hash2(i, i, 63) * 3;
    const b = hash2(i, seed, 64);
    if (b < k) {
      if (g.fine) {
        const sx = Math.round(px_), sy = Math.round(py_);        // auf Weltpixel gesetzt: ruhig in Bewegung
        if (b < 0.25) {
          g.dot(sx, sy, ramp[4]); g.dot(sx + 0.5, sy, ramp[3]); g.dot(sx, sy + 0.5, ramp[3]); g.dot(sx + 0.5, sy + 0.5, ramp[2]);
          g.dot(sx + 1, sy + 0.5, ramp[1]); g.dot(sx + 0.5, sy + 1, ramp[1]); g.dot(sx - 0.5, sy, ramp[1]); g.dot(sx, sy - 0.5, ramp[1]);
          g.dot(sx, sy, '#ffffff');
        } else if (b < 0.65) {
          g.dot(sx, sy, b < 0.45 ? ramp[4] : ramp[3]); g.dot(sx + 0.5, sy, ramp[2]); g.dot(sx, sy + 0.5, ramp[2]);
        } else { g.dot(sx, sy, ramp[3]); g.dot(sx + 0.5, sy + 0.5, ramp[1]); }
        continue;
      }
      g.px(px_, py_, b < 0.3 ? ramp[4] : b < 0.65 ? ramp[3] : ramp[2]);
      if (b < 0.25) { g.px(px_ + 1, py_, ramp[1]); g.px(px_, py_ + 1, ramp[1]); }
    }
  }
}

// Pilzhut: Kuppel mit Licht von links oben, Leuchtflecken, Lamellenrand.
// cx/cy = Mitte des Hutrands, rx/ry = Halbachsen der Kuppel.
// calm = true: ruhigere Fassung (weniger Lamellenstriche, kaum Hautrauschen)
function drawCap(p, g, cx, cy, rx, ry, spots, glowK, seed, ramp = CAP, droop = 0, calm = false) {
  const dr = (u) => droop * u * u * 1.5;              // Hängen der Hutkrempe
  const fine = p.fine, q = p.step ?? 1;
  // Lamellen (Unterseite): dunkle Schale, Rippen laufen strahlenförmig zum Stiel
  const gy = Math.max(1.2, ry * 0.3);
  pell(p, cx, cy + 0.5, rx - 0.5, gy, GILL[1]);
  pell(p, cx + 0.5, cy + 0.5, rx * 0.45, gy * 0.6, GILL[0]);
  if (fine) {
    // fein: Lamellen als Feinlinien vom Krempenrand zum Stielansatz, links im Licht, rechts im Schatten;
    // zwischen den Rippen die dunkle Schale. Leuchtende Lamellen bekommen einen hellen Kern am Rand.
    const sp = calm ? 1 : 0.5, hubY = cy + 0.5 + gy * 0.8;
    for (let x = -rx + 1; x <= rx - 1; x += sp) {
      const u = x / rx, yy = cy + 0.5 + dr(u) + (Math.abs(u) < 0.5 ? 0.5 : 0);
      const lit = x < -0.5, k = Math.round(x / sp);
      const c = lit ? (k & 1 ? GILL[2] : GILL[3]) : (k & 1 ? GILL[1] : GILL[2]);
      p.fline(cx + x, yy, cx + x * 0.3, hubY, c);
      if (glowK > (calm ? 0.9 : 0) && (k & 1) === 0) {
        g.fline(cx + x, yy + 0.5, cx + x * 0.6, yy + 0.5 + (hubY - yy) * 0.45, GG[1]);
        g.dot(cx + x, yy + 0.5, glowK > 0.9 && k % 3 === 0 ? GG[3] : GG[2]);
      }
    }
    p.fline(cx - rx * 0.3, hubY, cx + rx * 0.3, hubY, GILL[0]);
  } else {
    for (let x = -rx + 1.5; x <= rx - 1.5; x += calm ? 3 : 1.5) {
      const u = x / rx, yy = cy + 0.5 + dr(u) + (Math.abs(u) < 0.5 ? 0.5 : 0);
      p.px(cx + x, yy, x < 0 ? GILL[3] : GILL[2]);
      if (!calm && Math.abs(u) > 0.35) p.px(cx + x * 0.8, yy + 0.6, GILL[2]);
      if (glowK > (calm ? 0.9 : 0)) g.px(cx + x, yy + 0.5, glowK > 0.9 && (Math.round(x * 2) % 3 === 0) ? GG[2] : GG[1]);
    }
  }
  // Kuppel: per Normale schattiert, feines Fleischrauschen, unten dunkler Saum (fein: ohne Rauschen)
  const R = Math.ceil(rx) + 1, put = fine ? (x, y, c) => p.dot(x, Math.round(y / q) * q, c) : (x, y, c) => p.px(x, y, c);
  for (let y = Math.floor(cy - ry); y < cy; y += q) {
    for (let x = Math.floor(cx - R); x <= cx + R; x += q) {
      const u = (x + q / 2 - cx) / rx, v = (y + q / 2 - cy) / ry;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2) * 0.9 + 0.1;
      const n = fine ? 0 : (hash2(x - Math.round(cx) + 64, y - Math.round(cy) + 64, seed) - 0.5) * (calm ? 0.03 : 0.12);
      let c = tone(ramp, u, v, nz, 0.06, n);
      const edge = cy - y < 1.2;
      if (edge) c = ramp[Math.max(1, ramp.indexOf(c) - 2)];
      const yy = y + dr(u);
      put(x, yy, c);
      if (edge && droop > 0.3) put(x, yy + 1, ramp[1]);
    }
  }
  if (fine) {
    // Lichtkante: feine helle Linie auf der Krempe links oben, Glanzbogen auf der Kuppel, dunkle Kerbe unter der Krempe
    for (let x = -rx + 1; x < -rx * 0.3; x += q) p.dot(cx + x, Math.round((cy - 1.6 + dr(x / rx)) / q) * q, x < -rx * 0.6 ? ramp[5] : ramp[4]);
    for (let a = -2.5; a <= -1.75; a += 0.08) {
      const gx = cx + Math.cos(a) * rx * 0.68, gy2 = cy + Math.sin(a) * ry * 0.78;
      p.dot(gx, gy2, a < -2.3 ? ramp[5] : ramp[6]);
    }
    p.dot(cx - rx * 0.38, cy - ry * 0.7, '#f2d6f2'); p.dot(cx - rx * 0.38 + 0.5, cy - ry * 0.7, ramp[6]);
    // Hauttextur: feine Radialfasern zur Krempe hin, je eine Stufe dunkler als die Haut darunter
    const nf = rx >= 9 ? Math.round(rx * 0.9) : 4;                        // kleine Hüte: wenige, ruhige Fasern
    for (let i = 0; i < nf; i++) {
      const a = -Math.PI + 0.35 + (Math.PI - 0.7) * (i + 0.5) / nf + (hash2(i, seed, 55) - 0.5) * 0.12;
      const r0 = (rx >= 9 ? 0.5 : 0.4) + hash2(seed, i, 56) * 0.2;
      for (let r = r0; r < 0.93; r += q / rx) {
        const u = Math.cos(a) * r, v = Math.sin(a) * r;
        if (cy + v * ry > cy - 1.3) break;
        const c = tone(ramp, u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v)) * 0.9 + 0.1, 0.06, 0);
        p.dot(cx + u * rx, Math.round((cy + v * ry + dr(u)) / q) * q, ramp[Math.max(1, ramp.indexOf(c) - 1)]);
      }
    }
    for (let x = rx * 0.25; x < rx - 1; x += q) p.dot(cx + x, Math.round((cy - 1.1 + dr(x / rx)) / q) * q, ramp[1]);
  } else {
    // Heller Krempensaum oben links und Glanz auf der Kuppel (feuchte Haut)
    for (let x = -rx + 1; x < -rx * 0.35; x += 1) p.px(cx + x, cy - 1.6 + dr(x / rx), ramp[4]);
    p.px(cx - rx * 0.38, cy - ry * 0.7, ramp[6]); p.px(cx - rx * 0.38 + 1, cy - ry * 0.7, ramp[6]);
    p.px(cx - rx * 0.5, cy - ry * 0.55, ramp[6]);
  }
  // Leuchtflecken als erhabene Warzen: Kern, Glanzpunkt oben links, Schatten unten rechts
  for (let i = 0; i < spots; i++) {
    const a = -Math.PI * (0.15 + 0.7 * hash2(i, seed, 51)), d = 0.35 + hash2(seed, i, 52) * 0.5;
    const sx = Math.round(cx + Math.cos(a) * rx * d), sy = Math.round(cy + Math.sin(a) * ry * d + dr(Math.cos(a) * d));
    const big = hash2(i, seed, 53) < 0.45;
    const lit = glowK > 0.2;
    if (fine) {
      // fein: runde Warze in Feinpixeln – Schattensichel unten rechts, Lichtkante oben links, heller Kern
      const sc = Math.max(1, rx / 11), cxs = sx + 0.5, cys = sy + 0.25, wr = (big ? 1.1 : 0.7) * sc, hr = (big ? 0.85 : 0.6) * sc;
      p.ellipse(cxs + 0.4, cys + 0.45, wr, hr, ramp[1]);                       // Schattensichel unten rechts
      p.ellipse(cxs, cys, wr, hr, (nx, ny, dd) => {
        const l = nx + ny;
        if (dd > 0.45 && l < -0.55) return ramp[6];                              // Lichtkante der Warze
        if (dd > 0.5 && l > 0.5) return lit ? GG[1] : ramp[3];
        return lit ? (dd < 0.3 ? GG[3] : GG[2]) : dd < 0.3 ? ramp[5] : ramp[4];
      });
      p.dot(cxs - 0.25 * sc, cys - 0.25 * sc, lit ? (glowK > 0.8 ? '#ffffff' : GG[4]) : ramp[6]);
      if (lit) {
        const gr = glowK > 0.8 ? 0.45 : 0;
        g.ellipse(cxs, cys, wr * 0.75 + gr, hr * 0.75 + gr, (nx, ny, dd) => (dd < 0.2 ? (glowK > 0.8 ? GG[4] : GG[3]) : dd < 0.55 ? GG[2] : GG[1]));
        g.dot(cxs - 0.25, cys - 0.25, glowK > 0.8 ? GG[5] : GG[4]);
      }
      continue;
    }
    if (big) {
      p.px(sx + 1, sy + 1, ramp[1]); p.px(sx, sy + 1, ramp[2]);
      p.px(sx, sy, lit ? GG[3] : ramp[5]); p.px(sx + 1, sy, lit ? GG[2] : ramp[4]);
      p.px(sx, sy - 1, lit ? GG[4] : ramp[6]);
    } else {
      p.px(sx, sy + 1, ramp[2]); p.px(sx, sy, lit ? GG[3] : ramp[5]);
    }
    if (lit) {
      g.px(sx, sy, glowK > 0.8 ? GG[4] : GG[3]); if (big) { g.px(sx + 1, sy, GG[2]); g.px(sx, sy - 1, GG[3]); }
      if (glowK > 0.8) { g.px(sx - 1, sy, GG[1]); g.px(sx + 1, sy - 1, GG[1]); }
    }
  }
}

// ================================================================ Sporling (sporeling)

const SW = 44, SH = 38, SAX = 20, SAY = 33;
const S_REST = { sq: 0, air: 0, tilt: 0, lx: 0, leg: 0, arm: 0, eye: 1, glow: 0.6, puff: 0, dead: 0, wob: 0, mouth: 0 };
const spose = (o = {}) => ({ ...S_REST, ...o });

function drawSporeling(p, g, P, X) {
  const meta = {};
  const sq = P.sq, d = P.dead;
  const bx = SAX + P.lx, by = SAY - 1 - P.air;
  const bw = 3.6 * (1 + sq * 0.3), bh = 4.8 * (1 - sq * 0.35) * (1 - d * 0.4);
  const cyB = by - 1.5 - bh;                    // Körpermitte
  const t = P.tilt;

  // --- Wurzelfüßchen (hinteres im Schatten): kompakte Klötzchen, oben Licht
  const legY = by, dang = P.air > 0.5 ? 1 : 0;
  const lf = Math.sin(P.leg * TAU) * 1.2, lb = -lf;
  const flatL = d > 0.5 ? 1 : 0;
  const foot = (x, y, near) => {
    x = Math.round(x); y = Math.round(y);
    if (flatL) { p.rect(x, y + 1, 3, 1, near ? ROOT[3] : ROOT[2]); return; }
    p.rect(x, y, 3, 2, near ? ROOT[2] : ROOT[1]);
    p.rect(x, y, 2, 1, near ? ROOT[4] : ROOT[2]);
    if (p.fine) {
      // fein: Rindenmaserung, Lichtkante oben links, Wurzelfasern als Zehen
      p.fline(x, y + 1, x + 2.5, y + 1, near ? ROOT[1] : ROOT[0]);
      p.dot(x, y, near ? ROOT[4] : ROOT[3]); p.dot(x + 2, y + 0.5, near ? ROOT[3] : ROOT[2]);
      p.fline(x + 3, y + 1.5, x + 3.5, y + 1.5, near ? ROOT[3] : ROOT[1]); p.dot(x + 3.5, y + 1, near ? ROOT[2] : ROOT[1]);
      p.dot(x - 0.5, y + 1.5, ROOT[1]);
    }
  };
  foot(bx - 2 + lb - dang, legY - 1 - dang * 0.5, false);
  foot(bx + 1 + lf + dang, legY - 1 + dang * 0.5, true);

  // --- Stielkörper: rundlich, blass; nur drei Töne (Licht links, Schatten rechts)
  const tx0 = bx + t * 0.5;
  const BODY = [FL[2], FL[3], FL[4], FL[4], FL[5]];
  ell(p, tx0, cyB + 0.5, bw, bh, BODY, { bias: 0.08 });
  // Ärmchen: kurze, zwei Pixel dicke Stummel in einem Ton (Ansatz im Körper)
  const aw = Math.sin(P.arm) * 1.2;
  const ax1 = Math.round(bx + bw + 1.5 + t * 0.6), ay1 = Math.round(cyB + 2 + aw);
  const bx1 = Math.round(bx - bw - 1.2 + t * 0.4), by1 = Math.round(cyB + 2 - aw);
  const ra = (x0, y0, x1, y1, cTop, cBot) => {
    x0 = Math.round(x0); y0 = Math.round(y0);
    p.line(x0, y0 + 1, x1, y1 + 1, cBot); p.line(x0, y0, x1, y1, cTop);
  };
  ra(tx0 - bw + 1.5, cyB + 0.5, bx1, by1, FL[2], FL[1]);
  ra(bx + bw - 1.5 + t * 0.5, cyB + 0.5, ax1, ay1, FL[4], FL[3]);
  p.px(ax1 + 1, ay1, FL[4]); p.px(ax1 + 1, ay1 + 1, FL[3]);
  if (p.fine) {
    // fein: Stummelfinger (drei Feinpixel-Knubbel), Lichtkante auf dem Ärmchen
    p.dot(ax1 + 2, ay1, FL[5]); p.dot(ax1 + 2, ay1 + 1, FL[3]); p.dot(ax1 + 2, ay1 + 1.5, FL[2]); p.dot(ax1 + 1.5, ay1 + 2, FL[2]);
    p.dot(bx1 - 0.5, by1 + 0.5, FL[2]); p.dot(bx1 - 0.5, by1 + 1.5, FL[1]);
    p.dot(ax1, ay1, FL[5]); p.dot(ax1 - 1, ay1 - 0.5, FL[5]);
  }

  const fx = Math.round(bx + bw - 1.5 + t * 0.6), fy = Math.round(cyB);

  // --- Hut: breit, leicht schief, wackelt
  const crx = 6.8 * (1 + sq * 0.18) - d * 0.6, cry = 6.6 * (1 - sq * 0.25) * (1 - d * 0.35);
  const ccx = bx + t * 1.6 + Math.sin(P.wob) * 0.6, ccy = cyB - bh + 1.5 + d * 1.5;
  drawCap(p, g, ccx, ccy, crx, cry, 5, P.glow, 7, CAP, d * 1.2, true);
  // --- Gesicht liegt vor den Lamellen: Stiel oben neu, darauf Kragen und Gesicht
  if (d < 0.5) {
    ell(p, tx0, cyB + 0.5, bw, bh, BODY, { bias: 0.08, clip: (x, y) => y >= fy - 2 });
    // Ring (Manschette): durchgehender Kragen, links im Licht
    const ry0 = fy - 3;
    for (let x = -bw + 0.5; x <= bw - 0.5; x += 1) p.px(tx0 + x, ry0 + 1, x < 0.5 ? FL[5] : FL[3]);
    if (p.fine) {
      // fein: gefranster Kragensaum (Zacken je Feinpixel), Fleischfasern längs am Stiel
      for (let x = -bw + 0.5; x <= bw; x += 0.5) {
        const k = Math.round(x * 2);
        p.dot(tx0 + x, ry0 + 2, k & 1 ? FL[2] : x < 0.5 ? FL[4] : FL[3]);
      }
      p.fline(Math.round(tx0 - bw + 0.5), ry0 + 1, Math.round(tx0 - 0.5), ry0 + 1, FL[6]);
      const cyc = cyB + 0.5;
      for (const [o, c] of [[-0.55, FL[5]], [-0.15, FL[3]], [0.5, FL[2]]]) {
        const xo = tx0 + o * bw, yh = bh * Math.sqrt(Math.max(0, 1 - o * o));
        const ya = Math.max(fy + 3.5, cyc - yh + 1), yb = cyc + yh - 1.5;
        if (yb > ya) p.fline(xo, ya, xo + o * 0.6, yb, c);
      }
    }
  }

  // --- Gesicht: zwei Leuchtaugen in dunklen Höhlen, schlichtes Maul
  const eyeOn = P.eye > 0.3;
  p.rect(fx - 3, fy, 4, 1, FL[1]);                                     // Augenschatten
  p.px(fx, fy, eyeOn ? GG[4] : FL[0]); p.px(fx - 2, fy, eyeOn ? GG[3] : FL[0]);
  if (p.fine) {
    // fein: Augen mit hellem Kern und Glanzpunkt in dunkler Höhle, harte Brauenkante, Wangenlicht, Mund mit Winkeln
    p.fline(fx - 3.5, fy - 0.5, fx + 1, fy - 0.5, FL[1]);
    p.fline(fx - 3, fy - 1, fx - 1.5, fy - 0.5, FL[5]); p.fline(fx - 0.5, fy - 0.5, fx + 1, fy - 1, FL[5]);   // Brauenwülste im Licht
    p.dot(fx - 1, fy, FL[2]); p.dot(fx - 1, fy + 0.5, FL[3]);                                          // Nasenrücken
    p.dot(fx - 3, fy + 1, FL[5]); p.dot(fx + 1, fy + 1, FL[4]);
    if (eyeOn) {
      p.dot(fx + 0.5, fy, GG[3]); p.dot(fx, fy + 0.5, GG[3]); p.dot(fx + 0.5, fy + 0.5, GG[2]); p.dot(fx, fy, '#ffffff');
      p.dot(fx - 2, fy, GG[4]); p.dot(fx - 1.5, fy + 0.5, GG[2]); p.dot(fx - 2, fy + 0.5, GG[3]);
      g.dot(fx, fy, GG[5]); g.dot(fx + 0.5, fy, GG[4]); g.dot(fx, fy + 0.5, GG[3]); g.dot(fx + 0.5, fy + 0.5, GG[3]);
      g.dot(fx + 1, fy, GG[2]); g.dot(fx + 1.5, fy, GG[1]); g.dot(fx - 0.5, fy, GG[1]);
      g.dot(fx - 2, fy, GG[4]); g.dot(fx - 1.5, fy, GG[3]); g.dot(fx - 2, fy + 0.5, GG[2]); g.dot(fx - 2.5, fy, GG[1]);
    } else {
      p.dot(fx, fy + 0.5, FL[1]); p.dot(fx - 2, fy + 0.5, FL[1]); p.dot(fx + 0.5, fy, FL[2]); p.dot(fx - 1.5, fy, FL[2]);
    }
    if (P.mouth > 0.4) {
      p.rect(fx - 2, fy + 2, 3, 2, FL[0]);
      p.dot(fx - 2, fy + 2, FL[5]); p.dot(fx - 1, fy + 2, FL[6]); p.dot(fx, fy + 2, FL[5]);                  // Zähnchen
      p.dot(fx - 1.5, fy + 2, FL[1]); p.dot(fx - 0.5, fy + 2, FL[1]); p.dot(fx + 0.5, fy + 2, FL[1]);
      p.dot(fx - 2.5, fy + 2.5, FL[1]); p.dot(fx + 1, fy + 2.5, FL[1]);                                    // Mundwinkel
      p.fline(fx - 1.5, fy + 4, fx + 0.5, fy + 4, FL[5]);                                                  // Unterlippe im Licht
      if (eyeOn) { g.dot(fx - 1, fy + 3, GG[3]); g.dot(fx - 0.5, fy + 3.5, GG[2]); g.dot(fx - 1.5, fy + 3.5, GG[1]); }
    } else {
      p.fline(fx - 2, fy + 2, fx, fy + 2, FL[0]); p.dot(fx - 2.5, fy + 2.5, FL[1]); p.dot(fx + 0.5, fy + 2.5, FL[1]);
      p.fline(fx - 1.5, fy + 2.5, fx - 0.5, fy + 2.5, FL[5]);
    }
  } else {
  if (eyeOn) { g.px(fx, fy, GG[5]); g.px(fx + 1, fy, GG[2]); g.px(fx - 2, fy, GG[4]); g.px(fx - 3, fy, GG[1]); }
  if (P.mouth > 0.4) {
    p.rect(fx - 2, fy + 2, 3, 2, FL[0]); p.px(fx - 1, fy + 2, FL[5]);
    if (eyeOn) g.px(fx - 1, fy + 3, GG[1]);
  } else p.rect(fx - 2, fy + 2, 2, 1, FL[1]);
  }
  meta.eye = { x: fx, y: fy };
  meta.mouth = { x: fx, y: fy + 2 };

  meta.head = { x: ccx, y: ccy - cry };
  meta.hand = { x: fx + 1, y: fy + 1 };

  // --- Sporenstoß
  if (P.puff > 0) sporePuff(p, g, ccx, ccy - cry * 0.5, 6 + P.puff * 8, P.puff, 11 + Math.round(P.puff * 3), 26);
  return meta;
}

function sporelingAnims() {
  const mk = (P, X) => makeFrame(SW, SH, SAX, SAY, drawSporeling, P, X);
  const idle = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = i / 6 * TAU;
    return mk(spose({ sq: 0.12 + Math.sin(a) * 0.12, wob: a, arm: a, glow: 0.55 + Math.sin(a) * 0.3 }));
  });
  // Hüpfen: stauchen → abstoßen → Flug → landen
  const hk = [
    [0, spose({ sq: 0.5, glow: 0.6 })],
    [0.18, spose({ sq: -0.35, air: 2, tilt: 0.4, arm: 1, glow: 0.7 }), snap],
    [0.45, spose({ sq: -0.15, air: 5, tilt: 0.6, arm: 2, leg: 0.25, wob: 1, glow: 0.8 })],
    [0.7, spose({ sq: -0.2, air: 2.5, tilt: 0.2, arm: 3, leg: 0.5, wob: 2, glow: 0.7 })],
    [0.85, spose({ sq: 0.6, air: 0, tilt: -0.2, arm: 4, wob: 3, glow: 0.6 })],
    [1, spose({ sq: 0.5, glow: 0.6, wob: 3.5 })],
  ];
  const walk = track(mk, hk, 8, { loop: true, extras: { 6: { fx: 'step' } } });
  // Ausholen: tief geduckt, Hut zittert, Flecken glühen auf
  const windup = [
    mk(spose({ sq: 0.45, glow: 0.8, wob: 0.8, mouth: 1 })),
    mk(spose({ sq: 0.75, glow: 1, wob: -0.8, lx: -1, mouth: 1 })),
    mk(spose({ sq: 0.9, glow: 1.2, wob: 1, lx: -1.5, mouth: 1, puff: 0.15 })),
  ];
  // Kopfstoß-Sprung, beim Aufprall platzt eine Sporenwolke
  const strike = [
    mk(spose({ sq: -0.45, air: 4, tilt: 1.4, lx: 3, glow: 1.2, arm: 2, mouth: 1 })),
    mk(spose({ sq: -0.2, air: 3, tilt: 2, lx: 7, glow: 1.3, arm: 3, puff: 0.6, mouth: 1 }), { fx: 'impact' }),
    mk(spose({ sq: 0.5, air: 0, tilt: 0.8, lx: 6, glow: 0.9, puff: 1, wob: 2 })),
    mk(spose({ sq: 0.2, lx: 3, glow: 0.7, puff: 0.5, wob: 3 })),
  ];
  const hurt = [mk(spose({ sq: -0.3, tilt: -1.5, lx: -2, air: 1, eye: 1, glow: 1, puff: 0.3, mouth: 1 })), mk(spose({ sq: 0.3, tilt: -0.5, lx: -1 }))];
  // Tod: platzt in einer Sporenwolke und fällt schlaff zusammen
  const death = [
    mk(spose({ sq: -0.4, tilt: -1.5, lx: -2, air: 1, glow: 1.2, mouth: 1 })),
    mk(spose({ sq: 0.6, tilt: -0.5, lx: -1.5, glow: 1.3, puff: 0.5, mouth: 1 })),
    mk(spose({ sq: 0.9, dead: 0.4, lx: -1.5, glow: 0.9, puff: 1, eye: 0.6 }), { fx: 'impact' }),
    mk(spose({ sq: 1.1, dead: 0.8, lx: -1.5, glow: 0.5, puff: 1.3, eye: 0.2 })),
    mk(spose({ sq: 1.2, dead: 1, lx: -1.5, glow: 0.3, puff: 0.7, eye: 0 })),
    mk(spose({ sq: 1.2, dead: 1, lx: -1.5, glow: 0, puff: 0, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 11),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Pilzwüterich (fungal_brute)

const FW = 124, FH = 100, FAX = 54, FAY = 94;
const FD = { legH: 16, thigh: 8.5, shin: 8.5, spine: 17, upper: 11, fore: 12, sh: 3, hipW: 3.5 };
const F_REST = {
  hipX: 0, hipY: 0, lean: 0.22, head: 0, fFx: 7, fFy: 0, fBx: -7, fBy: 0,
  hFx: 15, hFy: 23, hBx: -3, hBy: 23, capT: 0, glow: 0.6, eye: 1, jaw: 0, puff: 0, kneel: 0, capTilt: 0,
};
const fpose = (o = {}) => ({ ...F_REST, ...o });

// Knorrige Wurzelfaust mit Leuchtpilzchen
function rootFist(p, g, x, y, r, near, glow, seed) {
  const bias = near ? 0 : -0.2;
  ell(p, x, y, r, r * 0.9, ROOT, { noise: 0.06, seed: 7 + seed, bias });
  // Knöchelwülste: kleine runde Knorren mit eigenem Glanz
  for (let i = 0; i < 4; i++) {
    const a = -0.7 + i * 0.5;
    const kx = x + Math.cos(a) * (r - 1), ky = y + Math.sin(a) * (r - 1) * 0.9;
    ell(p, kx, ky, 1.6, 1.4, ROOT, { bias: bias + 0.05 });
    p.px(kx + 1, ky + 1, ROOT[0]);
    if (p.fine) { p.dot(kx - 0.5, ky - 0.5, near ? ROOT[4] : ROOT[3]); p.dot(kx, ky - 1, near ? ROOT[3] : ROOT[2]); p.dot(kx + 0.5, ky + 1, ROOT[0]); }
  }
  if (p.fine) {
    // fein: Rindenrisse als Feinlinien mit Lichtgrat, Maserbögen über dem Handrücken, Wurzelfasern in Strähnen
    p.fline(x - r * 0.5, y - 1, x + 1, y + r * 0.4, ROOT[0]); p.fline(x - r * 0.5, y - 1.5, x + 0.5, y + r * 0.4 - 1, near ? ROOT[4] : ROOT[3]);
    for (let a = 2.2; a < 3.9; a += 0.08) p.dot(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.55, Math.floor(a * 3) % 2 ? ROOT[1] : ROOT[2]);
    for (let a = 0.6; a < 1.9; a += 0.1) p.dot(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.65, ROOT[1]);
    for (let i = 0; i < 6; i++) {
      const fx = x - 3.5 + i * 1.4, fy = y + r * 0.72;
      const l = 1.8 + hash2(i, seed, 85) * 2.2, ex = fx - 0.5 + i * 0.25;
      p.fline(fx, fy, ex, fy + l, i & 1 ? (near ? ROOT[2] : ROOT[1]) : near ? ROOT[3] : ROOT[2]);
      p.dot(ex, fy + l + 0.5, ROOT[0]);
    }
  } else {
  // Rindenrisse
  p.line(x - r * 0.5, y - 1, x + 1, y + r * 0.4, ROOT[1]);
  // Wurzelfasern hängen herab
  for (let i = 0; i < 4; i++) {
    const fx = x - 3 + i * 2, fy = y + r * 0.75;
    const l = 2 + ((i + seed) & 1) + (i === 2 ? 1 : 0);
    p.line(fx, fy, fx - 0.5 + i * 0.3, fy + l, near ? ROOT[2] : ROOT[1]);
    p.px(fx - 0.5 + i * 0.3, fy + l, ROOT[0]);
  }
  }
  if (near && p.fine) {
    // fein: Leuchtpilzchen auf dem Handrücken – Stielchen, Hütchen mit Lichtkante, heller Kern
    const mx = Math.round(x - r * 0.3), my = Math.round(y - r * 0.85);
    p.fline(mx, my + 0.5, mx, my - 0.5, FL[4]); p.dot(mx + 0.5, my, FL[3]);
    p.ellipse(mx + 0.25, my - 1.25, 1.5, 0.85, (nx, ny) => (ny < -0.4 ? CAP[6] : nx > 0.4 ? CAP[3] : CAP[5]));
    p.fline(mx - 1, my - 0.5, mx + 1.5, my - 0.5, CAP[2]);
    if (glow > 0.2) {
      p.dot(mx, my - 1.5, GG[4]); p.dot(mx + 0.5, my - 1.5, GG[3]);
      g.dot(mx, my - 1.5, GG[5]); g.dot(mx + 0.5, my - 1.5, GG[3]); g.dot(mx - 0.5, my - 1.5, GG[2]); g.dot(mx, my - 2, GG[2]); g.dot(mx + 1, my - 1, GG[1]);
    }
  } else if (near) {
    // kleiner Leuchtpilz auf dem Handrücken
    const mx = Math.round(x - r * 0.3), my = Math.round(y - r * 0.85);
    p.px(mx, my, FL[4]); p.px(mx, my - 1, CAP[5]); p.px(mx - 1, my - 1, CAP[4]); p.px(mx + 1, my - 1, CAP[3]); p.px(mx, my - 2, CAP[6]);
    if (glow > 0.2) { g.px(mx, my - 1, GG[3]); g.px(mx + 1, my - 2, GG[1]); }
  }
}

// Konsolenpilz (Baumschwamm) als Halbschale: Oberseite hell, Lamellen darunter
function bracket(p, g, x, y, w, glow, seed) {
  if (p.fine) {
    // fein: Konsole in Feinpixeln – Zuwachsringe als Feinlinien, helle Oberkante, Lamellenstreifen darunter
    x = Math.round(x); y = Math.round(y);
    for (let i = 0; i < w; i += 0.5) {
      const f = i / (w - 1 || 1), h = Math.sin(Math.min(1, f) * Math.PI) * 2.4 + 0.6;
      for (let j = 0; j < h + 0.4; j += 0.5) {
        const top = j >= h - 0.1, ring = Math.abs(j - h * 0.5) < 0.25 || Math.abs(j - h * 0.2) < 0.25;
        const c = top ? (f < 0.55 ? FL[6] : FL[5]) : j < 0.5 ? FL[2] : ring ? (f < 0.4 ? FL[3] : FL[2]) : f < 0.4 ? FL[5] : FL[4];
        p.dot(x + i, y + 0.5 - j, c);
      }
      const k = Math.round(i * 2);
      p.dot(x + i, y + 1, k & 1 ? GILL[3] : GILL[1]); p.dot(x + i, y + 1.5, k & 1 ? GILL[1] : GILL[0]);
      if (glow > 0.3 && (k + seed) % 6 === 0) { g.dot(x + i, y + 1, GG[3]); g.dot(x + i, y + 1.5, GG[1]); g.dot(x + i - 0.5, y + 1, GG[1]); }
    }
    p.dot(x, y - 1, FL[6]); p.dot(x - 0.5, y, FL[4]);
    return;
  }
  for (let i = 0; i < w; i++) {
    const f = i / (w - 1 || 1), h = Math.sin(f * Math.PI) * 2.4 + 0.6;
    for (let j = 0; j < h; j++) p.px(x + i, y - j, j >= h - 1 ? (f < 0.5 ? FL[6] : FL[5]) : j === 0 ? FL[2] : f < 0.4 ? FL[4] : FL[3]);
    p.px(x + i, y + 1, GILL[1]);
    if (glow > 0.3 && (i + seed) % 4 === 0) g.px(x + i, y + 1, GG[1]);
  }
  p.px(x, y - 1, FL[6]);
}

function drawBrute(p, g, P, X) {
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, FD, FAX, FAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const glow = P.glow;
  if (K > 0.01) { // hinteres Knie am Boden
    const kx = hip.x - 4 - K * 3, ky = FAY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 9 - legB.ex) * K; legB.ey += (FAY - legB.ey) * K;
  }
  const toes = (x, y, near) => {
    if (p.fine) {
      // fein: Wurzelzehen mit Lichtgrat oben, dunkler Kralle, feine Seitenfaser
      for (let k = 0; k < 4; k++) {
        const tx = x - 4 + k * 3, ex = tx + 1.5 + k * 0.4;
        p.fline(tx, y - 2, ex, y - 0.5, near ? ROOT[2] : ROOT[1], 1);
        p.fline(tx, y - 2.5, ex, y - 1, near ? ROOT[4] : ROOT[2]);
        p.dot(ex + 0.5, y - 0.5, ROOT[0]); p.dot(ex, y - 0.5, near ? ROOT[3] : ROOT[1]);
        if (k & 1) p.fline(tx + 0.5, y - 1, tx - 0.5, y - 0.5, ROOT[1]);
      }
      return;
    }
    for (let k = 0; k < 4; k++) {
      const tx = x - 4 + k * 3;
      p.line(tx, y - 2, tx + 1.5 + k * 0.4, y - 0.5, near ? ROOT[2] : ROOT[1]);
      p.px(tx + 1.5 + k * 0.4, y - 0.5, near ? ROOT[3] : ROOT[1]);
    }
  };

  // --- 1. hinterer Arm (massig, im Schatten)
  capsule(p, shB.x, shB.y, armB.jx, armB.jy, 4.6, 4, MOSS, { noise: 0.08, seed: 11, bias: -0.22 });
  capsule(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 4.4, ROOT, { noise: 0.06, seed: 12, bias: -0.2 });
  if (p.fine) { mossStrands(p, shB.x, shB.y, armB.jx, armB.jy, 4.6, 4, 7, 11, true); barkGrain(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 4.4, 12, true); }
  rootFist(p, g, armB.ex, armB.ey, 5.5, false, glow, 2);

  // --- 2. hinteres Bein (stämmig, Wurzelzehen)
  capsule(p, hip.x - 3, hip.y, legB.jx, legB.jy, 4.8, 4.2, MOSS, { noise: 0.08, seed: 13, bias: -0.22 });
  capsule(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 4, 4.6, ROOT, { noise: 0.06, seed: 14, bias: -0.2 });
  if (p.fine) { mossStrands(p, hip.x - 3, hip.y, legB.jx, legB.jy, 4.8, 4.2, 6, 13, true); barkGrain(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 4, 4.6, 14, true); }
  toes(legB.ex, legB.ey, false);

  // --- 3. Rumpf: fassförmiger Leib aus Moos und Pilzgeflecht
  const hp = pt(0, 0), cp = pt(FD.spine, 0.5);
  const cpT = pt(FD.spine - 2.5, 0.5);
  capsule(p, hp.x, hp.y, cpT.x, cpT.y, 9.6, 10.8, MOSS, { noise: 0.1, seed: 4 });
  if (p.fine) mossStrands(p, hp.x, hp.y, cpT.x, cpT.y, 9.6, 10.8, 34, 4);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Bauch: blasses, faseriges Pilzfleisch, rund schattiert, mit Längsfasern
  const bc = pt(7.2, 5.6);
  ell(p, bc.x, bc.y, 4.4, 7, FL.slice(1), { rot: P.lean, noise: 0.04, seed: 9 });
  // zwei durchgehende Längsfasern statt Strichraster
  for (const k of [4.5, 7]) for (let u = 1.5; u <= 12.5; u += 0.5) {
    const o = pt(u, k);
    const dx = o.x - bc.x, dy = o.y - bc.y;
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    const uu = (dx * cl + dy * sl) / 4.4, vv = (-dx * sl + dy * cl) / 7;
    if (uu * uu + vv * vv < 0.62) { if (p.fine) p.dot(o.x, o.y, k > 6.5 ? FL[2] : FL[3]); else p.px(o.x, o.y, k > 6.5 ? FL[2] : FL[3]); }
  }
  if (p.fine) {
    // fein: Pilzfleisch in feinen Längsfasern (Licht links), Faserbündel mit hellem Grat
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    for (const [k, c] of [[3.6, FL[5]], [5.2, FL[3]], [6.2, FL[4]], [7.8, FL[2]]]) for (let u = 1; u <= 13; u += 0.25) {
      const o = pt(u, k), dx = o.x - bc.x, dy = o.y - bc.y;
      const uu = (dx * cl + dy * sl) / 4.4, vv = (-dx * sl + dy * cl) / 7;
      if (uu * uu + vv * vv < 0.7 && hash2(Math.floor(u / 2.5), Math.round(k), 43) > 0.2) p.dot(o.x, o.y, c);
    }
  }
  // Moosbüschel: heller Kopf, dunkle Unterseite (Licht von oben)
  for (let i = 0; i < 8; i++) {
    const u = 1.5 + hash2(i, 1, 41) * (FD.spine - 2), k = -9 + hash2(i, 2, 41) * 11;
    const o = pt(u, k);
    if (p.fine) {
      // fein: Büschel aus vier Strähnen, Spitzen im Licht, Schatten darunter
      const ox = Math.round(o.x * 2) / 2, oy = Math.round(o.y * 2) / 2;
      for (let j = 0; j < 4; j++) { p.dot(ox - 0.5 + j * 0.5, oy - (j & 1) * 0.5, j < 2 ? MOSS[5] : MOSS[4]); p.fline(ox - 0.5 + j * 0.5, oy + 0.5 - (j & 1) * 0.5, ox - 1 + j * 0.5, oy + 1.5, j < 2 ? MOSS[4] : MOSS[3]); }
      p.fline(ox - 0.5, oy + 2, ox + 1.5, oy + 1.5, MOSS[0]);
      continue;
    }
    p.px(o.x, o.y, MOSS[5]); p.px(o.x + 1, o.y, MOSS[4]); p.px(o.x, o.y + 1, MOSS[1]); p.px(o.x + 1, o.y + 1, MOSS[0]);
  }
  if (p.fine) for (let k = -8; k <= 2; k += 0.5) { const o = pt(FD.spine + 0.5 - Math.abs(k + 3) * 0.12, k); p.dot(o.x, o.y, Math.round(k * 2) % 3 ? MOSS[5] : MOSS[4]); p.dot(o.x, o.y + 0.5, MOSS[4]); }
  else for (let k = -8; k <= 2; k += 1) q(FD.spine + 0.5 - Math.abs(k + 3) * 0.12, k, MOSS[5]);
  // hängende Moosfäden unter dem Bauch (fein: Strähnen mit heller Wurzel und dunkler Spitze)
  if (p.fine) for (let i = 0; i < 9; i++) { const o = pt(0.5, -6.5 + i * 1.6), l = 1.5 + hash2(i, 7, 44) * 2; p.fline(o.x, o.y, o.x - 0.5, o.y + l, i & 1 ? MOSS[2] : MOSS[3]); p.dot(o.x, o.y, MOSS[4]); p.dot(o.x - 0.5, o.y + l + 0.5, MOSS[1]); }
  else for (let i = 0; i < 5; i++) { const o = pt(0.5, -6 + i * 3); p.line(o.x, o.y, o.x - 0.5, o.y + 2 + (i & 1), MOSS[2]); }
  // Leuchtknoten (wenige, dafür deutlich, mit dunklem Hof)
  const nodes = [[6, -3]];
  // als Büschel winziger Leuchtpilze: Stielchen, leuchtendes Köpfchen
  for (const [u, k] of nodes) {
    const o = pt(u, k), ox = Math.round(o.x), oy = Math.round(o.y);
    if (p.fine) {
      // fein: drei Leuchtpilzchen – Feinstiel, Hütchen mit hellem Kern, Schatten unter dem Hut
      for (const [dx, h] of [[0, 2], [1.5, 1], [-1, 1.5]]) {
        p.fline(ox + dx, oy + 0.5, ox + dx, oy + 0.5 - h, h > 1.5 ? FL[5] : FL[4]);
        const hy2 = oy - h;
        p.fline(ox + dx - 0.5, hy2, ox + dx + 1, hy2, glow > 0.2 ? GG[2] : CAP[3]);
        p.dot(ox + dx - 0.5, hy2, glow > 0.2 ? GG[3] : CAP[5]); p.dot(ox + dx, hy2 - 0.5, glow > 0.2 ? GG[4] : CAP[6]); p.dot(ox + dx + 0.5, hy2 - 0.5, glow > 0.2 ? GG[3] : CAP[4]);
        p.dot(ox + dx, hy2 + 0.5, MOSS[0]);
        if (glow > 0.2) {
          g.dot(ox + dx, hy2 - 0.5, glow > 0.8 ? GG[5] : GG[4]); g.dot(ox + dx - 0.5, hy2, GG[3]); g.dot(ox + dx + 0.5, hy2 - 0.5, GG[3]);
          g.dot(ox + dx + 1, hy2, GG[2]); g.dot(ox + dx, hy2 - 1, GG[1]); g.dot(ox + dx - 1, hy2, GG[1]);
        }
      }
      continue;
    }
    for (const [dx, h] of [[0, 2], [2, 1]]) {
      p.px(ox + dx, oy, FL[3]); if (h > 1) p.px(ox + dx, oy - 1, FL[4]);
      const hy2 = oy - h;
      p.px(ox + dx, hy2, glow > 0.2 ? GG[4] : CAP[5]); p.px(ox + dx + 1, hy2, glow > 0.2 ? GG[2] : CAP[3]); p.px(ox + dx - 1, hy2, glow > 0.2 ? GG[3] : CAP[4]);
      if (glow > 0.2) { g.px(ox + dx, hy2, glow > 0.8 ? GG[5] : GG[3]); g.px(ox + dx + 1, hy2, GG[2]); g.px(ox + dx, hy2 - 1, GG[1]); }
    }
  }
  // Konsolenpilze an der Flanke
  const b1 = pt(6, -9), b2 = pt(10, -10), b3 = pt(2.5, -8.5);
  bracket(p, g, b3.x - 4, b3.y, 6, glow, 1);
  bracket(p, g, b1.x - 4, b1.y, 7, glow, 2);
  bracket(p, g, b2.x - 3, b2.y, 5, glow, 3);

  // --- 4. vorderes Bein
  capsule(p, hip.x + 3, hip.y, legF.jx, legF.jy, 5, 4.4, MOSS, { noise: 0.08, seed: 15 });
  capsule(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 4.3, 4.9, ROOT, { noise: 0.06, seed: 16 });
  if (p.fine) {
    mossStrands(p, hip.x + 3, hip.y, legF.jx, legF.jy, 5, 4.4, 8, 15);
    barkGrain(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 4.3, 4.9, 16);
    p.fline(legF.jx - 1, legF.jy + 2, legF.ex + 1, legF.ey - 4, ROOT[0]); p.fline(legF.jx - 1.5, legF.jy + 2, legF.ex + 0.5, legF.ey - 4, ROOT[3]);   // Rindenriss mit Lichtkante
  } else p.line(legF.jx - 1, legF.jy + 2, legF.ex + 1, legF.ey - 4, ROOT[1]);       // Rindenriss am Schienbein
  toes(legF.ex + 1, legF.ey, true);
  p.px(legF.jx - 3, legF.jy - 1, MOSS[5]); p.px(legF.jx - 2, legF.jy - 2, MOSS[5]); p.px(legF.jx - 1, legF.jy - 2, MOSS[4]);

  // Hut- und Kopfmaße vorab: der Kopf sitzt vor den Lamellen, das Gesicht unter der Krempe
  const capC = pt(FD.spine + 3, 2.5);
  const crx = 17 - K * 1.5, cry = 9 - K;
  const cx = capC.x + 1 + Math.sin(P.capT) * 0.6 + P.capTilt * 2, cy = capC.y + 1 + Math.cos(P.capT) * 0.5;
  const hc = pt(FD.spine - 2, 9.5);
  const hx = Math.round(hc.x + P.head), hy = Math.round(hc.y + 1);
  const rimY = Math.round(cy + 1.5);
  const ey0 = Math.max(hy - 2, rimY + 2);
  meta.eye = { x: hx + 4, y: hy - 2 };
  meta.mouth = { x: hx + 5, y: hy + 2 };
  meta.head = { x: cx, y: cy - cry };
  const drawArm = () => {
    capsule(p, shF.x, shF.y, armF.jx, armF.jy, 5.2, 4.4, MOSS, { noise: 0.08, seed: 17 });
    capsule(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.3, 4.8, ROOT, { noise: 0.06, seed: 18 });
    if (p.fine) {
      mossStrands(p, shF.x, shF.y, armF.jx, armF.jy, 5.2, 4.4, 9, 17);
      barkGrain(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.3, 4.8, 18);
      // Rindenringe als feine Wülste: Lichtgrat oben, Furche darunter, quer zur Achse
      const A = axis(armF.jx, armF.jy, armF.ex, armF.ey);
      for (let s = 0.25; s < 0.8; s += 0.25) {
        const rx = armF.jx + (armF.ex - armF.jx) * s, ry = armF.jy + (armF.ey - armF.jy) * s, rr = 4.3 + 0.5 * s;
        for (let o = -0.8; o <= 0.8; o += 0.12) {
          const x = rx + A.nx * o * rr, y = ry + A.ny * o * rr;
          p.dot(x - A.ux * 0.5, y - A.uy * 0.5, o > 0.2 ? ROOT[4] : ROOT[3]); p.dot(x, y, o > 0.2 ? ROOT[1] : ROOT[0]);
        }
      }
    } else for (let s = 0.25; s < 0.8; s += 0.25) {                                   // Rindenringe am Unterarm
      const rx = armF.jx + (armF.ex - armF.jx) * s, ry = armF.jy + (armF.ey - armF.jy) * s;
      p.px(rx - 2, ry, ROOT[1]); p.px(rx - 1, ry + 0.5, ROOT[1]); p.px(rx, ry + 1, ROOT[0]);
    }
    p.px(armF.jx - 3, armF.jy - 1, MOSS[5]); p.px(armF.jx - 2, armF.jy - 2, MOSS[5]);
    bracket(p, g, shF.x - 5, shF.y - 3, 8, glow, 4);   // Schulterschwamm
  };
  const drawCapAll = () => {
    // --- 7. Riesenhut: wächst aus Nacken und Schultern, überdacht den Kopf
    drawCap(p, g, cx, cy, crx, cry, 6, glow, 5, CAP, 1.2 + K * 1.5 + P.capTilt, true);
    // Lamellenfransen hängen vorn und hinten
    if (p.fine) {
      // fein: doppelt so viele, feine Fransen, links im Licht, helle Spitzen
      for (let i = 0; i < 20; i++) {
        const x = cx - crx + 3 + i * 1.5, l = 1 + ((i * 7) % 5) * 0.5, lit = x < cx - crx * 0.3;
        p.fline(x, cy + 2, x - 0.5 * (i & 1), cy + 1.5 + l, i & 1 ? FL[1] : lit ? FL[3] : FL[2]);
        p.dot(x - 0.5 * (i & 1), cy + 2 + l, lit ? FL[5] : FL[4]);
      }
    } else for (let i = 0; i < 10; i++) {
      const x = cx - crx + 3 + i * 3, l = 1 + ((i * 7) % 3);                  // feste Längen: kein Flimmern
      for (let j = 0; j < l; j++) p.px(x, cy + 2 + j, j === l - 1 ? FL[4] : FL[2]);
    }
  };
  const drawHead = () => {
    // --- 6. Kopf: tief vorn an der Brust, unter dem Hutrand
    ell(p, hx + 1, hy, 5.4, 4.7, FL.slice(1), { noise: 0.1, seed: 21, bias: 0.24, clip: (x, y) => y >= rimY });
    // Schatten des Huts auf der Stirn, schwerer Brauenwulst
    for (let x = -4; x <= 5; x++) p.px(hx + x, rimY, FL[1]);                    // Hutschatten unter der Krempe
    p.line(hx - 1, ey0 - 1, hx + 5, ey0 - 1, FL[2]);                          // Brauenwulst
    p.px(hx + 6, hy - 1, FL[4]); p.px(hx + 6, hy, FL[3]);                     // Wangenknorren vorn
    // Maul: breiter Spalt mit gezackten Zähnen, beim Brüllen weit offen
    const my = Math.max(hy + 1, ey0 + 3);                                   // Maulspalte unter den Augen
    const jw = Math.round(P.jaw * 3);
    p.rect(hx + 1, my, 5, 1 + jw, '#0a0608');
    if (jw > 0) { p.rect(hx + 2, my + jw, 3, 1, CAP[3]); p.px(hx + 3, my - 1 + jw, CAP[2]); }
    if (jw > 0 && glow > 0.2) { g.rect(hx + 1, my, 4, jw + 1, GG[1]); g.px(hx + 3, my + jw * 0.5, GG[3]); }
    for (let k = 0; k < 5; k++) {
      if (k % 2 === 0) { p.px(hx + 1 + k, my, FL[6]); if (jw > 1) p.px(hx + 1 + k, my + 1, FL[4]); }
      if (jw && k % 2 === 1) p.px(hx + 1 + k, my + jw, FL[5]);
    }
    p.line(hx + 1, my + 1 + jw, hx + 5, my + 1 + jw, FL[2]);                  // Kinnschatten
    // drei Augen in tiefen Höhlen
    const eyeOn = P.eye > 0.3;
    for (const [ex, ey, c] of [[hx + 4, ey0, 4], [hx + 1, ey0, 3], [hx + 2.5, ey0 + 1.5, 3]]) {
      p.px(ex - 1, ey, GILL[0]); p.px(ex, ey + 1, FL[1]); p.px(ex + 1, ey, FL[1]);
      p.px(ex, ey, eyeOn ? GG[c] : GILL[0]);
      if (p.fine) continue;
      if (eyeOn) { g.px(ex, ey, GG[c + 1]); g.px(ex + 1, ey, GG[2]); g.px(ex, ey - 1, GG[1]); }
    }
    if (p.fine) {
      // fein: Brauenwulst mit Lichtgrat und Schattenkante, Nasenknorren, Augen mit heißem Kern und Glanz,
      // Hauer-Zähne spitz in Feinpixeln, Mundwinkel, Wangenlicht
      const bx0 = Math.round(hx), by0 = ey0 - 1;
      p.fline(hx - 3, hy - 0.5, hx - 2, hy + 2, FL[4]); p.fline(hx - 1.5, hy + 1, hx - 0.5, hy + 3, FL[4]);   // Fleischfasern an der Wange
      p.fline(hx - 3.5, hy + 2.5, hx - 2, hy + 3.5, FL[3]);
      p.fline(bx0 - 1, by0, bx0 + 5, by0, FL[4]); p.fline(bx0 - 1, by0 + 0.5, bx0 + 5, by0 + 0.5, FL[1]);
      p.dot(bx0 + 2.5, by0 + 0.5, FL[3]); p.dot(bx0 - 1, by0, FL[5]); p.dot(bx0 - 0.5, by0, FL[5]);
      p.dot(bx0 + 3, by0 + 1, FL[1]);                                                  // Brauen-Knick zur Nase (grimmig)
      p.dot(hx + 6, hy - 1, FL[6]); p.dot(hx + 6.5, hy - 0.5, FL[5]); p.dot(hx + 6.5, hy + 0.5, FL[2]);
      p.dot(hx + 5.5, ey0 + 0.5, FL[5]); p.dot(hx + 5.5, ey0 + 1, FL[4]); p.dot(hx + 5, ey0 + 1.5, FL[1]);   // Nasenrücken-Licht
      for (const [ex, ey, c] of [[hx + 4, ey0, 4], [hx + 1, ey0, 3], [hx + 2.5, ey0 + 1.5, 3]]) {
        const X0 = Math.round(ex), Y0 = Math.round(ey);
        if (eyeOn) {
          p.dot(X0, Y0, c > 3 ? '#ffffff' : GG[4]); p.dot(X0 + 0.5, Y0, GG[c]); p.dot(X0, Y0 + 0.5, GG[c - 1]); p.dot(X0 + 0.5, Y0 + 0.5, GG[2]);
          p.dot(X0 - 0.5, Y0, GG[1]);
          g.dot(X0, Y0, GG[c + 1]); g.dot(X0 + 0.5, Y0, GG[c]); g.dot(X0, Y0 + 0.5, GG[3]); g.dot(X0 + 0.5, Y0 + 0.5, GG[2]);
          g.dot(X0 + 1, Y0, GG[2]); g.dot(X0 + 1.5, Y0, GG[1]); g.dot(X0, Y0 - 0.5, GG[1]); g.dot(X0 - 0.5, Y0, GG[1]);
        } else { p.dot(X0, Y0 + 0.5, GILL[2]); }
        p.dot(X0 + 0.5, Y0 + 1, FL[3]);                                                 // Unterlid im Licht
      }
      const mx0 = Math.round(hx + 1), my0 = Math.round(my);
      for (let k = 0; k < 5; k++) {
        if (k % 2 === 0) { p.dot(mx0 + k, my0, FL[6]); p.dot(mx0 + k + 0.5, my0, FL[5]); p.dot(mx0 + k, my0 + 0.5, jw > 0 ? FL[5] : FL[4]); if (jw > 1) { p.dot(mx0 + k + 0.5, my0 + 0.5, '#0a0608'); p.dot(mx0 + k, my0 + 1, FL[4]); p.dot(mx0 + k + 0.5, my0 + 1, '#0a0608'); } }
        else if (jw) { p.dot(mx0 + k, my0 + jw + 0.5, FL[5]); p.dot(mx0 + k + 0.5, my0 + jw + 0.5, FL[4]); p.dot(mx0 + k + 0.5, my0 + jw, FL[6]); }
      }
      p.dot(mx0 - 0.5, my0 + 0.5, FL[1]); p.dot(mx0 + 5, my0 + 0.5 + jw, FL[1]);         // Mundwinkel
      p.fline(mx0, my0 + 1.5 + jw, mx0 + 4, my0 + 1.5 + jw, FL[4]);                       // Kinnlicht unter dem Schatten
      if (jw > 0 && glow > 0.2) { g.dot(mx0 + 2, my0 + jw * 0.5 + 0.5, GG[4]); g.dot(mx0 + 2.5, my0 + jw * 0.5 + 0.5, GG[3]); }
    }
  };
  // --- 5.–7. Arm, Hut, Kopf: erhobene Fäuste liegen vor dem Hut, sonst der Kopf vorn
  if (armF.ey < cy + 2) { drawHead(); drawCapAll(); drawArm(); }
  else { drawArm(); drawCapAll(); drawHead(); }

  // --- 7b. Faust ganz vorn
  rootFist(p, g, armF.ex, armF.ey, 6.5, true, glow, 1);
  meta.hand = { x: armF.ex, y: armF.ey };

  // --- 8. Sporenstoß beim Aufschlag
  if (P.puff > 0) {
    sporePuff(p, g, armF.ex + 2, FAY - 4, 12 + P.puff * 10, P.puff, 21, 44);
    sporePuff(p, g, cx, cy - cry, 10, P.puff * 0.6, 23, 16);
  }
  return meta;
}

function bruteAnims() {
  const mk = (P, X) => makeFrame(FW, FH, FAX, FAY, drawBrute, P, X);
  const idleA = fpose();
  const idleB = fpose({ hipY: 1.5, lean: 0.26, hFy: 23, hBy: 24, head: 0.5, capT: Math.PI, glow: 1, jaw: 0.3 });
  const idle = [];
  for (let i = 0; i < 6; i++) { const k = (1 - Math.cos(i / 6 * TAU)) / 2; idle.push(mk({ ...mixP(idleA, idleB, k), capT: i / 6 * TAU })); }
  // Schwerfälliges Stampfen, Knöchel schleifen fast am Boden
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(fpose({
      hipY: -Math.abs(c) * 1.5 + 1.5, lean: 0.25 + Math.abs(s) * 0.03, fFx: 1 + s * 9, fFy: Math.max(0, -c) * 3.5,
      fBx: -1 - s * 9, fBy: Math.max(0, c) * 3.5, hFx: 15 - s * 4, hBx: -3 + s * 4, hFy: 22 - Math.abs(s) * 1.5, hBy: 23 - Math.abs(s) * 1.5,
      head: s * 0.6, capT: ph, glow: 0.6 + Math.abs(s) * 0.2,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Ausholen: beide Fäuste hoch über den Hut, Oberkörper zurück, Maul auf
  const w1 = fpose({ lean: 0.1, hipX: -1, hFx: 8, hFy: 2, hBx: 4, hBy: 3, fFx: 8, fBx: -8, capT: 1, glow: 0.8, jaw: 0.4 });
  const w2 = fpose({ lean: -0.06, hipX: -2, hipY: 1, hFx: 3, hFy: -22, hBx: -2, hBy: -21, fFx: 9, fBx: -9, capT: 2, glow: 1.1, jaw: 1, capTilt: -0.5 });
  const w3 = { ...w2, lean: -0.12, hFx: 0, hFy: -24, hBx: -5, hBy: -23, capT: 2.5, glow: 1.3 };
  const windup = [mk(mixP(idleA, w1, 0.5)), mk(w1), mk(w2), mk(w3), mk({ ...w3, capT: 3, hFy: -25, hBy: -24 })];
  // Stampfer: beide Fäuste krachen vor dem Körper in den Boden
  const s1 = fpose({ lean: 0.3, hipX: 2, hipY: 2, hFx: 16, hFy: -8, hBx: 12, hBy: -7, fFx: 11, fBx: -8, capT: 3.5, glow: 1.3, jaw: 1 });
  const s2 = fpose({ lean: 0.55, hipX: 4, hipY: 7, hFx: 21, hFy: 22, hBx: 16, hBy: 22, fFx: 12, fBx: -10, capT: 4, glow: 1.5, jaw: 1, puff: 0.6, capTilt: 1 });
  const s3 = { ...s2, capT: 4.6, puff: 1, glow: 1.2, jaw: 0.6, capTilt: 0.6 };
  const s4 = fpose({ lean: 0.42, hipX: 3, hipY: 5, hFx: 19, hFy: 23, hBx: 13, hBy: 23, fFx: 11, fBx: -9, capT: 5, puff: 0.6, glow: 0.9 });
  const strike = [mk(s1), mk(s2, { fx: 'impact' }), mk(s3), mk(s4), mk(mixP(s4, idleA, 0.6))];
  const hurtP = fpose({ lean: 0.05, hipX: -2, head: -1.5, jaw: 1, hFx: 7, hFy: 18, hBx: -2, hBy: 19, capT: 1, glow: 1.2, capTilt: -0.8 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: sackt auf die Knie, kippt nach vorn aufs Gesicht; der Hut klappt, das Licht erlischt
  const d1 = { ...hurtP, lean: 0, hipX: -3, jaw: 1 };
  const d2 = fpose({ kneel: 1, lean: 0.45, head: 1, hFx: 15, hFy: 28, hBx: 10, hBy: 28, fFx: 9, fBx: -12, glow: 0.8, jaw: 1, capT: 2, puff: 0.5, capTilt: 1 });
  const d3 = { ...d2, lean: 0.62, glow: 0.5, puff: 0.9, eye: 0.6, capT: 3 };
  const piv = [FAX + 12, FAY - 1];
  const death = [
    mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk({ ...d3, glow: 0.3, puff: 0.6, eye: 0.3 }, { rot: [0.5, ...piv] }),
    mk({ ...d3, glow: 0.15, puff: 0.2, eye: 0 }, { rot: [1.2, ...piv], fx: 'impact' }),
    mk({ ...d3, glow: 0, puff: 0, eye: 0 }, { rot: [1.35, ...piv] }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 9, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Sporenwirker (spore_caster)

const KW2 = 68, KH2 = 62, KAX = 30, KAY = 56;
const KD = { legH: 11, thigh: 5.5, shin: 6, spine: 9, upper: 5, fore: 5, sh: 1.5, hipW: 1 };
const K_REST2 = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 6, hFy: 6, hBx: 2, hBy: 6, sa: -1.42, pod: 0.4, sway: 0, cast: 0, orbit: 0, eye: 1, cloud: 0, glow: 0.6, wph: 0,
};
const kpose2 = (o = {}) => ({ ...K_REST2, ...o });

// Wurzelstab mit pulsierender Sporenkapsel
function podStaff(p, g, hx, hy, a, pod, orbit, wph) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const tx = hx + dx * 11, ty = hy + dy * 11;
  const cx = tx + dx * 3, cy = ty + dy * 3;
  if (p.fine) {
    // fein: zwei verdrillte Wurzelstränge (vorderer Strang je nach Windung), Maserkerben, Lichtgrat
    for (let s = -10; s <= 11; s += 0.25) {
      const w = Math.sin(s * 0.9) * 0.6, front = Math.cos(s * 0.9) > 0;
      const A = [w, ROOT[3], ROOT[4]], B = [1 - w, ROOT[1], ROOT[2]];
      for (const [o, c0, c1] of front ? [B, A] : [A, B]) {
        p.dot(hx + dx * s + nx * o, hy + dy * s + ny * o, c0);
        p.dot(hx + dx * s + nx * (o + 0.5), hy + dy * s + ny * (o + 0.5), c1);
      }
      if (Math.round(s * 4) % 9 === 0) p.dot(hx + dx * s + nx * (w + 0.25), hy + dy * s + ny * (w + 0.25), ROOT[0]);
    }
    p.dot(hx - dx * 10.5, hy - dy * 10.5, ROOT[2]); p.dot(hx - dx * 10.5 + nx * 0.5, hy - dy * 10.5 + ny * 0.5, ROOT[3]);
    // Wurzelkrone: krallenartige Feinranken um die Kapsel, Außenseite im Licht
    for (const sd of [-1, 1]) {
      let x = tx, y = ty;
      for (let i = 0; i < 5; i++) {
        const nx2 = x + dx * 0.9 + nx * sd * (1.2 - i * 0.45), ny2 = y + dy * 0.9 + ny * sd * (1.2 - i * 0.45);
        p.fline(x, y, nx2, ny2, sd > 0 ? ROOT[3] : ROOT[1], i < 3 ? 1 : 0);
        p.fline(x + nx * sd * 0.5, y + ny * sd * 0.5, nx2 + nx * sd * 0.5, ny2 + ny * sd * 0.5, sd > 0 ? ROOT[4] : ROOT[2]);
        x = nx2; y = ny2;
      }
      p.dot(x, y, sd > 0 ? ROOT[4] : ROOT[2]);
    }
  } else {
  // verdrillter Wurzelschaft
  for (let s = -10; s <= 11; s += 0.5) {
    const w = Math.sin(s * 0.9) * 0.6;
    p.px(hx + dx * s + nx * w, hy + dy * s + ny * w, ROOT[3]);
    p.px(hx + dx * s - nx * (w - 1), hy + dy * s - ny * (w - 1), ROOT[1]);
  }
  p.px(hx - dx * 10.5, hy - dy * 10.5, ROOT[2]);
  // Wurzelkrone umschließt die Kapsel
  for (const sd of [-1, 1]) {
    let x = tx, y = ty;
    for (let i = 0; i < 5; i++) { x += dx * 0.9 + nx * sd * (1.2 - i * 0.45); y += dy * 0.9 + ny * sd * (1.2 - i * 0.45); p.px(x, y, ROOT[sd > 0 ? 4 : 2]); }
  }
  }
  // Kapsel: violette Hülle, grüner Kern
  const r = 2 + pod * 0.7;
  if (p.fine) {
    // fein: Hülle mit Lichtkante und Adern, durchscheinender Kern mit heißem Mittelpunkt, Glanzpunkt
    const ry = r * 1.15;
    p.ellipse(cx, cy, r, ry, (nx2, ny2, d) => (d > 0.72 && nx2 + ny2 < -0.5 ? CAP[6] : d > 0.7 && nx2 + ny2 > 0.4 ? CAP[3] : nx2 + ny2 < -0.2 ? CAP[5] : CAP[4]));
    for (const o of [-0.55, 0, 0.55]) for (let t = -0.85; t <= 0.85; t += 0.12) p.dot(cx + o * r * Math.sqrt(1 - t * t) + 0.25, cy + t * ry, o > 0 ? CAP[3] : CAP[2]);
    p.ellipse(cx + 0.3, cy + 0.3, r * 0.55, r * 0.6, (nx2, ny2, d) => (d < 0.25 ? GG[4] : d < 0.6 ? GG[3] : GG[2]));
    p.dot(cx + 0.25, cy + 0.25, '#ffffff'); p.dot(cx - r * 0.5, cy - ry * 0.6, '#f4e0f4');
  } else {
  pell(p, cx, cy, r, r * 1.15, CAP[4]);
  pell(p, cx - 0.5, cy - 0.5, r - 0.8, r * 1.15 - 0.8, CAP[5]);
  p.px(cx - r + 0.8, cy - 1, CAP[6]);
  pell(p, cx + 0.3, cy + 0.3, r * 0.5, r * 0.55, GG[3]); p.px(cx, cy, GG[4]);
  }
  const HR = r + 1 + pod * 1.4;
  if (p.fine) {
    // fein: gestufte Lichtringe in Feinpixeln, äußerster Ring im Feinraster gerastert
    g.each(cx - HR - 1, cy - HR - 1, cx + HR + 1, cy + HR + 1, (x, y) => {
      const d = Math.hypot(x - cx, y - cy) / HR;
      if (d > 1) return null;
      if (d > 0.72 && ((Math.floor(x * 2) + Math.floor(y * 2)) & 1)) return null;
      return d < 0.18 ? GG[5] : d < 0.38 ? GG[4] : d < 0.6 ? GG[2] : GG[1];
    });
  } else
  for (let y = -HR; y <= HR; y++) for (let x = -HR; x <= HR; x++) {
    const d = Math.hypot(x, y) / HR;
    if (d > 1) continue;
    if (d > 0.7 && ((Math.round(cx + x) + Math.round(cy + y)) & 1)) continue;
    g.px(cx + x, cy + y, d < 0.35 ? GG[4] : d < 0.6 ? GG[2] : GG[1]);
  }
  // Sporen kreisen beim Kanalisieren
  if (orbit > 0) {
    const n = 6, R = 3.5 + orbit * 3;
    for (let i = 0; i < n; i++) {
      const a2 = orbit * 5 + (i / n) * TAU + wph;
      const ox = cx + Math.cos(a2) * R, oy = cy + Math.sin(a2) * R * 0.7;
      const V = i % 2 ? GV : GG;
      if (p.fine) {
        // fein: Spore mit hellem Kern und Schweif aus Feinpixeln entlang der Bahn
        const sx = Math.round(ox * 2) / 2, sy = Math.round(oy * 2) / 2, tx2 = -Math.sin(a2), ty2 = Math.cos(a2) * 0.7;
        p.dot(sx, sy, V[4]); p.dot(sx + 0.5, sy, V[3]); p.dot(sx, sy + 0.5, V[3]);
        g.dot(sx, sy, i % 2 ? '#ffffff' : GG[5]); g.dot(sx + 0.5, sy, V[3]); g.dot(sx, sy + 0.5, V[3]); g.dot(sx + 0.5, sy + 0.5, V[2]);
        g.dot(sx - tx2 * 0.6, sy - ty2 * 0.6, V[2]); g.dot(sx - tx2 * 1.2, sy - ty2 * 1.2, V[1]);
        continue;
      }
      p.px(ox, oy, V[3]); g.px(ox, oy, V[4]); g.px(ox - Math.sin(a2), oy + Math.cos(a2) * 0.7, V[2]);
    }
  }
  return { x: cx, y: cy };
}

function drawCaster(p, g, P, X) {
  const R = rig(P, KD, KAX, KAY);
  const { pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const glow = P.glow;

  // --- hinterer Arm (Moosärmel, Fingerwurzeln)
  capsule(p, shB.x, shB.y, armB.jx, armB.jy, 1.5, 1.7, MOSS, { bias: -0.25 });
  capsule(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.7, 2, MOSS, { bias: -0.22 });
  p.px(armB.ex + 1, armB.ey, FL[3]); p.px(armB.ex + 2, armB.ey + 1, FL[2]); p.px(armB.ex + 2, armB.ey, FL[2]);
  if (p.fine) {
    // fein: Ärmelfalte, Wurzelfinger mit Knöchellicht, Zauberglut mit hellem Kern an den Fingerspitzen
    foldLines(p, shB.x, shB.y, armB.ex, armB.ey, 1.5, 2, [[0.45, MOSS[3]], [-0.2, MOSS[0], 0.3, 0.8]]);
    p.dot(armB.ex + 1, armB.ey, FL[4]); p.dot(armB.ex + 2, armB.ey, FL[3]); p.dot(armB.ex + 2.5, armB.ey + 0.5, FL[2]); p.dot(armB.ex + 2.5, armB.ey + 1.5, FL[1]);
    if (P.cast > 0.05) {
      p.dot(armB.ex + 2.5, armB.ey, GV[3]);
      g.dot(armB.ex + 2.5, armB.ey, GV[4]); g.dot(armB.ex + 2, armB.ey, GV[3]); g.dot(armB.ex + 3, armB.ey, GV[2]); g.dot(armB.ex + 2.5, armB.ey + 0.5, GV[2]); g.dot(armB.ex + 1.5, armB.ey, GV[1]);
      if (P.cast > 0.6) { g.fline(armB.ex + 1.5, armB.ey - 0.5, armB.ex + 2.5, armB.ey - 2, GV[2]); g.dot(armB.ex + 2.5, armB.ey - 2, GV[4]); g.dot(armB.ex + 3, armB.ey - 2.5, GV[1]); }
    }
  } else if (P.cast > 0.05) { g.px(armB.ex + 1, armB.ey, GV[3]); g.px(armB.ex + 2, armB.ey, GV[2]); if (P.cast > 0.6) { g.px(armB.ex + 1, armB.ey - 1, GV[2]); g.px(armB.ex + 2, armB.ey - 2, GV[1]); } }

  // --- Mantel: Moos und Myzel, bodenlang, fasrige Fransen
  const top = pt(KD.spine, 0), waist = pt(1, 0);
  const hemY = KAY - 0.5;
  const hemL = Math.min(legB.ex, legF.ex) - 4.5 + Math.sin(P.sway) * 1 - P.lean * 6;
  const hemR = Math.max(legB.ex, legF.ex) + 3.5 + Math.sin(P.sway + 1) * 0.8;
  if (p.fine) {
    // fein: Mantel in Feinpixeln – zweifarbige Falten (heller Grat, dunkles Tal), Fransen als feine Strähnen,
    // Myzelfäden und Leuchtpunkte an festen Stellen im Stoff (statt verstreuter Sprenkel)
    const q2 = p.step, y0 = Math.round(waist.y), Y1 = hemY + 0.5;
    for (let y = y0; y < Y1; y += q2) {
      const f = (y - waist.y) / (hemY - waist.y || 1);
      const l = waist.x - 3.5 + (hemL - (waist.x - 3.5)) * f;
      const r = waist.x + 3.2 + (hemR - (waist.x + 3.2)) * f * f;
      for (let x = Math.round(l * 2) / 2; x <= Math.round(r * 2) / 2 + 0.5; x += q2) {
        const u = (x - l) / (r - l || 1);
        if (y > hemY - 3) {                                            // Fransen: feste Längen je Feinspalte
          const F = Math.round(x * 2), cut = hemY - 0.5 - hash2(F, 1, 94) * 2.5 - (F & 1) * 0.5;
          if (y > cut) continue;
        }
        const fold = Math.sin(u * 8 + P.sway * 0.7 + f * 1.5);
        let k = u < 0.12 ? 5 : u < 0.22 ? 4 : u > 0.86 ? 1 : fold > 0.82 ? 5 : fold > 0.45 ? 4 : fold > 0.1 ? 3 : fold < -0.8 ? 0 : fold < -0.45 ? 1 : 2;
        if (y > hemY - 1.5) k = Math.max(0, k - 1);
        p.dot(x, y, MOSS[k]);
      }
    }
    // Myzelfäden: an Mantelkoordinaten gebunden (u, f), blasse Feinlinien mit Leuchtknötchen
    const at = (u, f) => {
      const y = waist.y + (hemY - waist.y) * f, l = waist.x - 3.5 + (hemL - (waist.x - 3.5)) * f, r = waist.x + 3.2 + (hemR - (waist.x + 3.2)) * f * f;
      return [l + (r - l) * u, y];
    };
    for (const [u0, f0, u1, f1] of [[0.3, 0.15, 0.24, 0.55], [0.62, 0.35, 0.7, 0.8], [0.45, 0.6, 0.38, 0.88]]) {
      const [ax, ay] = at(u0, f0), [bx, by] = at(u1, f1);
      p.fline(ax, ay, bx, by, FL[2]);
      if (glow > 0.2) { p.dot(bx, by, GG[3]); g.dot(bx, by, GG[4]); g.dot(bx + 0.5, by, GG[2]); g.dot(bx, by + 0.5, GG[1]); g.dot(bx - 0.5, by, GG[1]); }
    }
  } else
  for (let y = Math.round(waist.y); y <= hemY; y++) {
    const f = (y - waist.y) / (hemY - waist.y || 1);
    const l = waist.x - 3.5 + (hemL - (waist.x - 3.5)) * f;
    const r = waist.x + 3.2 + (hemR - (waist.x + 3.2)) * f * f;
    for (let x = Math.round(l); x <= Math.round(r); x++) {
      const u = (x - l) / (r - l || 1);
      if (y > hemY - 3 && hash2(x, 1, 94) < 0.35 * (y - (hemY - 3))) continue; // Fransen
      const fold = Math.sin(u * 8 + P.sway * 0.7 + f * 1.5);
      let k = u < 0.12 ? 5 : u < 0.22 ? 4 : u > 0.86 ? 1 : fold > 0.45 ? 4 : fold > 0.1 ? 3 : fold < -0.45 ? 1 : 2;
      if (y > hemY - 1.5) k = Math.max(0, k - 1);
      p.px(x, y, MOSS[k]);
      // Myzelfäden (blass) und Leuchtpunkte im Mantel
      const hsh = hash2(x, y, 95);
      if (hsh < 0.03 && k > 1) p.px(x, y, FL[2]);
      else if (hsh > 0.988 && glow > 0.2) { p.px(x, y, GG[3]); g.px(x, y, GG[3]); }
    }
  }
  capsule(p, waist.x, waist.y, top.x, top.y, 3.4, 3.7, MOSS, { noise: 0.12, seed: 6 });
  if (p.fine) foldLines(p, waist.x, waist.y, top.x, top.y, 3.4, 3.7, [[0.55, MOSS[5], 0.15, 0.85], [0.3, MOSS[2], 0.1, 0.75], [-0.35, MOSS[1], 0.05, 0.7], [-0.5, MOSS[3], 0.1, 0.6]]);
  // Saum: Wurzelborte am Mantelrand
  if (p.fine) {
    // fein: geflochtene Borte – Knoten hell oben links, dunkle Kerbe dazwischen
    for (let x = Math.round(hemL) + 1; x < hemR - 1; x += 0.5) {
      const F = Math.round(x * 2);
      if (hash2(Math.floor(x), 3, 96) <= 0.3) continue;
      p.dot(x, hemY - 2, F % 3 === 0 ? ROOT[4] : F % 3 === 1 ? ROOT[3] : ROOT[1]); p.dot(x, hemY - 1.5, F % 3 === 2 ? ROOT[0] : ROOT[2]);
    }
  } else for (let x = Math.round(hemL) + 1; x < hemR - 1; x += 1) if (hash2(x, 3, 96) > 0.3) p.px(x, hemY - 2, x % 3 ? ROOT[2] : ROOT[3]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  const qd = (u, k, c) => { const o = pt(u, k); p.dot(o.x, o.y, c); };
  // Gürtel aus Wurzeln mit Sporenbeuteln
  if (p.fine) {
    // fein: verdrillte Wurzelschnur (schräge Windungen), Knochenschnalle mit Glanz, Beutel mit Lichtkante und Schnürung
    for (let k = -3.5; k <= 4; k += 0.25) {
      const w = Math.round(k * 4) & 3;
      qd(1.5, k, w === 0 ? ROOT[4] : w === 1 ? ROOT[3] : ROOT[2]); qd(1.05, k, w === 2 ? ROOT[3] : w === 3 ? ROOT[0] : ROOT[2]); qd(0.6, k, ROOT[1]);
    }
    qd(1.5, 1, FL[6]); qd(1.5, 1.5, FL[5]); qd(1.05, 1, FL[4]); qd(1.05, 1.5, FL[3]); qd(0.6, 1.5, FL[2]);
    for (const [u, k, rr] of [[0.2, 2.3, 0.9], [-0.1, -1.6, 0.65]]) {
      const o = pt(u, k);
      p.ellipse(o.x, o.y, rr, rr * 1.1, (nx, ny) => (nx + ny < -0.6 ? CAP[6] : nx + ny > 0.5 ? CAP[2] : CAP[4]));
      p.dot(o.x - 0.25, o.y - rr, ROOT[3]); p.dot(o.x + 0.25, o.y - rr - 0.5, ROOT[2]);
    }
    for (let u = 2; u < 7; u += 0.5) qd(u, 2.5 - u * 0.25, MOSS[5]);
    for (let u = 2; u < 7; u += 0.5) qd(u, 2.9 - u * 0.25, MOSS[2]);
  } else {
  for (let k = -3.5; k <= 3.5; k += 0.5) { q(1.3, k, k < 0 ? ROOT[3] : ROOT[2]); q(0.8, k, ROOT[1]); }
  q(1.3, 1, FL[5]); q(1.3, 1.5, FL[3]);                     // Knochenschnalle
  q(0.5, 2, CAP[4]); q(0, 2, CAP[3]); q(0, 2.5, CAP[4]); q(0.5, 2.5, CAP[5]);
  q(0.3, -1.5, CAP[3]); q(-0.3, -1.5, CAP[2]);
  for (let u = 2; u < 7; u += 1) q(u, 2.5 - u * 0.25, MOSS[5]);
  }

  // --- Kopf: blasses Gesicht unter hohem Hut mit Schleier
  const neck = pt(KD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  ell(p, hx + 1, hy, 3.2, 3.7, FL.slice(2), { bias: 0.05 });
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.mouth = { x: hx + 3, y: hy + 2 };
  // Schleier (Ring) hängt vom Hutrand über den Hinterkopf
  if (p.fine) {
    // fein: Schleier aus zwölf Feinsträhnen, äußere im Licht, helle Spitzen, dunkle Fugen
    for (let i = 0; i < 12; i++) {
      const x = hx - 3.25 + i * 0.3, l = 5 - i * 0.25 + Math.sin(P.sway + i * 0.5) * 0.5;
      for (let j = 0; j < l; j += 0.5) p.dot(x - j * 0.15 - P.lean * j, hy - 2 + j, j >= l - 0.5 ? FL[5] : i === 0 ? FL[4] : i % 3 === 2 ? FL[1] : FL[2 + (i & 1)]);
    }
  } else
  for (let i = 0; i < 6; i++) {
    const x = hx - 3 + i * 0.6, l = 5 - i * 0.5 + Math.sin(P.sway + i) * 0.5;
    for (let j = 0; j < l; j++) p.px(x - j * 0.15 - P.lean * j, hy - 2 + j, j === Math.floor(l) - 1 ? FL[5] : FL[2 + (i & 1)]);
  }
  // Hoher, glockenförmiger Hut
  const capX = hx + 0.5, capY = hy - 2.5;
  drawCap(p, g, capX, capY, 7, 7.5, 6, glow, 9, CAP, 0.8);
  // Gesicht vor den Lamellen: hager und blass, Augen im tiefen Hutschatten
  ell(p, hx + 1, hy, 3.2, 3.7, FL.slice(2), { bias: 0.1, clip: (x, y) => y >= hy - 1 });
  p.px(hx + 4, hy, FL[5]); p.px(hx + 4, hy + 1, FL[4]); p.px(hx + 4, hy + 2, FL[2]);   // spitze Nase
  // tiefer Hutschatten über den Augen, darin violett glühende Pupillen
  for (let x = -1; x <= 3; x++) p.px(hx + x, hy - 1, FL[1]);
  p.px(hx + 1, hy, FL[0]); p.px(hx + 3, hy, FL[0]); p.px(hx + 2, hy, FL[2]);
  const eyeOn = P.eye > 0.3;
  if (p.fine) {
    // fein: Augen mit heißem Kern im violetten Saum, Brauenkante unter dem Hutschatten, Nasenrücken-Licht,
    // Wangenknochen, vernähter Mund mit Stichen und Zahnblitz
    p.fline(hx - 0.5, hy - 0.5, hx + 3.5, hy - 0.5, FL[0]); p.dot(hx + 2, hy - 0.5, FL[2]);
    if (eyeOn) {
      p.dot(hx + 3, hy, GV[4]); p.dot(hx + 3.5, hy, GV[3]); p.dot(hx + 3, hy + 0.5, GV[2]); p.dot(hx + 3.5, hy + 0.5, GV[1]);
      p.dot(hx + 1, hy, GV[2]); p.dot(hx + 1.5, hy, GV[3]); p.dot(hx + 1, hy + 0.5, GV[1]); p.dot(hx + 1.5, hy + 0.5, GV[2]);
      g.dot(hx + 3, hy, '#ffffff'); g.dot(hx + 3.5, hy, GV[4]); g.dot(hx + 3, hy + 0.5, GV[3]); g.dot(hx + 3.5, hy + 0.5, GV[2]);
      g.dot(hx + 4, hy, GV[2]); g.dot(hx + 4.5, hy, GV[1]); g.dot(hx + 3, hy - 0.5, GV[1]); g.dot(hx + 2.5, hy, GV[1]);
      g.dot(hx + 1.5, hy, GV[4]); g.dot(hx + 1, hy, GV[3]); g.dot(hx + 1.5, hy + 0.5, GV[2]); g.dot(hx + 0.5, hy, GV[1]);
    } else { p.dot(hx + 3, hy + 0.5, FL[1]); p.dot(hx + 1.5, hy + 0.5, FL[1]); }
    p.dot(hx + 4, hy, FL[6]); p.dot(hx + 4, hy + 0.5, FL[5]); p.dot(hx + 4.5, hy + 1, FL[4]); p.dot(hx + 4.5, hy + 1.5, FL[3]); p.dot(hx + 4, hy + 1.5, FL[1]);
    p.dot(hx + 2, hy + 1, FL[5]); p.dot(hx + 2.5, hy + 1, FL[5]); p.dot(hx + 1, hy + 1, FL[3]);   // Wangenknochen im Licht
    p.fline(hx + 1.5, hy + 2.5, hx + 3.5, hy + 2.5, FL[0]); p.dot(hx + 1, hy + 2, FL[1]);
    for (const sx of [2, 3]) { p.dot(hx + sx, hy + 2, FL[5]); p.dot(hx + sx, hy + 3, FL[4]); }                   // Stiche
    p.dot(hx + 3.5, hy + 2.5, FL[6]);                                                                          // Zahnblitz
    p.fline(hx + 2, hy + 3.5, hx + 3.5, hy + 3.5, FL[2]);                                                     // Kinnschatten
    // Hutspitze: eingerollter Zipfel mit Lichtkante
    p.px(capX - 1, capY - 8, CAP[5]); p.px(capX - 2, capY - 9, CAP[4]);
    p.dot(capX - 2, capY - 9, CAP[6]); p.dot(capX - 2.5, capY - 9, CAP[5]); p.dot(capX - 2.5, capY - 8.5, CAP[3]); p.dot(capX - 0.5, capY - 7.5, CAP[3]);
  } else {
  if (eyeOn) {
    p.px(hx + 3, hy, GV[3]); p.px(hx + 1, hy, GV[2]);
    g.px(hx + 3, hy, GV[4]); g.px(hx + 4, hy, GV[2]); g.px(hx + 1, hy, GV[3]); g.px(hx + 3, hy - 1, GV[1]);
  }
  // schmaler Mund mit Fäden (vernäht), Zahn blitzt
  p.px(hx + 2, hy + 2, FL[1]); p.px(hx + 3, hy + 2, FL[0]);
  // Hutspitze
  p.px(capX - 1, capY - 8, CAP[5]); p.px(capX - 2, capY - 9, CAP[4]);
  }
  meta.head = { x: capX, y: capY - 9 };

  // --- Sporenwolke (Spezialangriff): quillt unter dem Hut hervor und sinkt zu Boden
  if (P.cloud > 0) {
    sporePuff(p, g, capX + 2, capY + 1, 9 + P.cloud * 6, P.cloud, 31 + Math.round(P.wph), 30);
    sporePuff(p, g, KAX + 6, KAY - 4, 10 + P.cloud * 10, P.cloud * 0.9, 33 + Math.round(P.wph), 34);
    sporePuff(p, g, KAX - 4, KAY - 6, 8 + P.cloud * 6, P.cloud * 0.7, 35, 16, GV);
  }

  // --- vorderer Arm + Kapselstab
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 7, 16, SPORE_C, SPORE_G, 1);
  capsule(p, shF.x, shF.y, armF.jx, armF.jy, 1.6, 1.8, MOSS, { bias: 0.05 });
  capsule(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.8, 2.2, MOSS, { bias: 0.05 });
  p.px(armF.ex - 2, armF.ey - 1, MOSS[5]);                     // weiter Ärmelsaum
  p.px(armF.ex, armF.ey + 1, FL[4]);
  if (p.fine) {
    foldLines(p, shF.x, shF.y, armF.jx, armF.jy, 1.6, 1.8, [[0.5, MOSS[5], 0.2, 0.8], [-0.3, MOSS[2], 0.2, 0.9]]);
    foldLines(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.8, 2.2, [[0.5, MOSS[4], 0.1, 0.7], [-0.25, MOSS[1], 0.2, 0.8]]);
    p.dot(armF.ex - 2.5, armF.ey - 1, MOSS[5]); p.dot(armF.ex - 2, armF.ey - 0.5, MOSS[2]);
  }
  const pod = podStaff(p, g, armF.ex, armF.ey, P.sa, P.pod, P.orbit, P.wph);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, FL[3]); p.px(armF.ex - 1, armF.ey - 1, FL[5]);
  if (p.fine) {
    // fein: Finger um den Stab – Knöchellicht und Fugen
    const hx2 = Math.round(armF.ex) - 1, hy2 = Math.round(armF.ey) - 1;
    p.dot(hx2, hy2, FL[6]); p.dot(hx2 + 0.5, hy2, FL[5]); p.dot(hx2 + 1, hy2, FL[4]); p.dot(hx2 + 1.5, hy2 + 0.5, FL[2]);
    p.fline(hx2, hy2 + 1, hx2 + 1.5, hy2 + 1, FL[2]); p.dot(hx2, hy2 + 0.5, FL[4]); p.dot(hx2, hy2 + 1.5, FL[3]);
  }
  meta.hand = pod;
  meta.cast = pod;
  return meta;
}

function casterAnims() {
  const mk = (P, X) => makeFrame(KW2, KH2, KAX, KAY, drawCaster, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(kpose2({ hipY: Math.sin(a) > 0.3 ? 1 : 0, sway: a, pod: 0.4 + Math.sin(a) * 0.3, glow: 0.55 + Math.sin(a) * 0.25, hFy: 6 + Math.sin(a) * 0.5, head: Math.sin(a) * 0.3, wph: a })));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(kpose2({
      fFx: 1 + s * 3.5, fFy: Math.max(0, -c) * 1.5, fBx: -1 - s * 3.5, fBy: Math.max(0, c) * 1.5,
      hipY: c > 0.5 || c < -0.5 ? 0 : 1, lean: 0.1, sway: ph * 2, hFx: 5 + s * 0.8, sa: -1.4 - s * 0.05,
      hBx: 1 - s * 1.5, pod: 0.4, wph: ph,
    })));
  }
  // Kapsel schwillt an, Sporen kreisen …
  const windup = [
    mk(kpose2({ hFx: 4, hFy: 0, sa: -1.55, hBx: 3, hBy: 2, cast: 0.3, pod: 0.8, orbit: 0.2, lean: 0, glow: 0.8, wph: 1 })),
    mk(kpose2({ hFx: 3, hFy: -4, sa: -1.6, hBx: 4, hBy: -1, cast: 0.6, pod: 1.2, orbit: 0.5, lean: -0.06, sway: 1, glow: 1, wph: 2 })),
    mk(kpose2({ hFx: 3, hFy: -6, sa: -1.62, hBx: 4, hBy: -3, cast: 0.9, pod: 1.6, orbit: 0.8, lean: -0.1, sway: 2, glow: 1.1, wph: 3 })),
    mk(kpose2({ hFx: 3, hFy: -7, sa: -1.65, hBx: 4, hBy: -4, cast: 1, pod: 2, orbit: 1.1, lean: -0.12, sway: 3, glow: 1.2, wph: 4 })),
  ];
  // … Stab nach vorn, das Sporengeschoss löst sich
  const strike = [
    mk(kpose2({ hFx: 9, hFy: 0, sa: -0.35, hBx: 3, hBy: 3, pod: 2, lean: 0.2, hipX: 1, fFx: 4, fBx: -3, sway: 4, glow: 1, wph: 5 }), { smear: [-1.7, -0.35], fx: 'cast' }),
    mk(kpose2({ hFx: 10, hFy: 1, sa: -0.2, hBx: 2, hBy: 4, pod: 0.3, lean: 0.24, hipX: 1.5, fFx: 4, fBx: -3, sway: 5, glow: 0.7, wph: 6 })),
    mk(kpose2({ hFx: 7, hFy: 2, sa: -0.8, hBx: 2, hBy: 5, pod: 0.3, lean: 0.12, hipX: 1, fFx: 3, fBx: -3, sway: 6, wph: 7 })),
  ];
  // Giftwolke: Kapsel hoch, dann den Stab in den Boden stoßen; der Hut stößt eine Wolke aus
  const ck = [
    [0, kpose2({ wph: 0 })],
    [0.3, kpose2({ hFx: 4, hFy: -8, sa: -1.5, hBx: 5, hBy: -5, cast: 1, pod: 1.8, orbit: 0.8, lean: -0.14, glow: 1.2, sway: 1, wph: 2 })],
    [0.5, kpose2({ hFx: 7, hFy: 7, sa: -1.62, hBx: 5, hBy: 6, cast: 0.6, pod: 1.2, orbit: 0.2, lean: 0.25, hipY: 2, glow: 1.4, cloud: 0.5, sway: 2, wph: 3 }), snap],
    [0.8, kpose2({ hFx: 7, hFy: 7, sa: -1.62, hBx: 5, hBy: 6, pod: 0.8, lean: 0.2, hipY: 2, glow: 1.2, cloud: 1, sway: 3, wph: 4 })],
    [1, kpose2({ hFx: 6, hFy: 6, pod: 0.5, lean: 0.1, glow: 0.8, cloud: 1.2, sway: 4, wph: 5 })],
  ];
  const cloud = track(mk, ck, 8, { extras: { 4: { fx: 'cast' } } });
  const hurtP = kpose2({ lean: -0.2, hipX: -1, head: -1, hFx: 3, hFy: 4, sa: -1.9, hBx: 0, hBy: 4, pod: 0.8, sway: 2, glow: 1, wph: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, K_REST2, 0.5))];
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, pod: 1, cloud: 0.3 };
  const d2 = { ...d1, hipY: 3, lean: -0.1, hFy: 7, sa: -2.3, pod: 0.5, cloud: 0.7, wph: 3 };
  const d3 = { ...d2, hipY: 4, lean: 0.1, pod: 0.2, eye: 0, glow: 0.3, cloud: 0.9, wph: 4 };
  const piv = [KAX - 3, KAY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, pod: 0, glow: 0.15, cloud: 0.5 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, pod: 0, glow: 0, eye: 0, cloud: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    cloud: new Animation(cloud, 8, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Export

export function createSporeFoes() {
  return {
    sporeling: sporelingAnims(),
    fungal_brute: bruteAnims(),
    spore_caster: casterAnims(),
  };
}
