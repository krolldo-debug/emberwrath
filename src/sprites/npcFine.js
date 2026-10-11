import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame, buildFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, scale2x, finishPixels, outlinePixels, pixelsToCanvas, canvasPixels, col32 } from '../gfx/Fine.js';

// Feinraster Stufe B für NPCs und Objekte (docs/STYLE.md „Feinraster“). buildFine() zeichnet die alte Weltpixel-Zeichnung
// zweimal: grob (PixelCanvas, ×2 mit Scale2x → glatte Silhouetten wie Stufe A) und fein (FineCanvas, p.fine = true: Gesichter,
// Falten, Nähte, Maserung …). Jeder Feinpixel, den der feine Durchgang nicht anders gezeichnet hat als der grobe, kommt aus der
// geglätteten Fassung; alles Handfeine bleibt. So müssen die Zeichenfunktionen nur ihre Details in `if (p.fine)` ergänzen.
// Bei Qualität „Niedrig“ (fineRes() 1) läuft nur der alte Weg.

// p.line im feinen Durchgang: 1 Weltpixel stark, aber im Feinraster gerastert (Diagonalen ohne 2×2-Treppen).
function fineLines(p) {
  p.line = (x0, y0, x1, y1, c) => p.fline(Math.round(x0 * 2) / 2, Math.round(y0 * 2) / 2, Math.round(x1 * 2) / 2, Math.round(y1 * 2) / 2, c, 1);
  return p;
}

// draw(p, pass): pass 0 = grob (PixelCanvas), 1 = fein (FineCanvas). Liefert SpriteFrame; frame.meta = Rückgabe des feinen Durchgangs.
export function buildFine(w, h, ax, ay, draw, { outline = true, finish = true } = {}) {
  const res = fineRes();
  let meta = null;
  if (res < 2) {
    const f = buildFrame(w, h, ax, ay, (p) => { meta = draw(p, 0); }, { outline });
    if (meta) f.meta = meta;
    return f;
  }
  const pc = new PixelCanvas(w, h);
  draw(pc, 0);
  const N = canvasPixels(pc.canvas), B = scale2x(N, w, h);
  const fc = fineLines(new FineCanvas(w, h, 2));
  meta = draw(fc, 1);
  let d = fc.pixels();
  if (d === fc.buf) d = d.slice();
  const W = w * 2, H = h * 2;
  for (let y = 0, i = 0; y < H; y++) {
    const row = (y >> 1) * w;
    for (let x = 0; x < W; x++, i++) if (d[i] === N[row + (x >> 1)]) d[i] = B[i];
  }
  if (finish) finishPixels(d, W, H);
  let OW = W, OH = H;
  if (outline) { d = outlinePixels(d, W, H); OW += 2; OH += 2; }
  const pad = outline ? 1 : 0;
  const f = new SpriteFrame(pixelsToCanvas(d, OW, OH), ax * 2 + pad, ay * 2 + pad, 2);
  if (meta) f.meta = meta;
  return f;
}

// Leuchtebene passend zu buildFine: fein (FineCanvas, gleiche Texelgröße wie der Frame ohne Umriss) oder alt in Weltpixeln.
export function glowCanvas(w, h) { return fineRes() >= 2 ? fineLines(new FineCanvas(w, h, 2)) : new PixelCanvas(w, h); }

// ---------------------------------------------------------------- Farben
const hex = (v) => '#' + [16, 8, 0].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('');
// Farbe c heller (k > 0, Richtung kühles Mondlicht) oder dunkler (k < 0); bleibt deckend, für Feinlichter/-schatten.
export function tone(c, k) {
  const v = col32(c), r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
  const f = (x, t) => Math.round(k > 0 ? x + (t - x) * k : x * (1 + k));
  return hex((f(r, 236) << 16) | (f(g, 230) << 8) | f(b, 240));
}

// ---------------------------------------------------------------- Feinwerkzeuge (nur im feinen Durchgang aufrufen)
// Bildmuster in Feinpixeln: rows = Zeichenketten (ein Zeichen = ein Feinpixel), pal = Zeichen → Farbe, '.' = frei.
export function fmap(p, x, y, rows, pal) {
  const q = p.step;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) { const col = pal[row[c]]; if (col) p.dot(x + c * q, y + r * q, col); }
  }
}
// Gerades Band (Arm, Stab, Riemen) fein abgetastet: Breite w Weltpixel, ramp von der Lichtseite (oben links) zur Schattenseite.
export function band(p, x0, y0, x1, y1, w, ramp) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-3, len = Math.sqrt(l2);
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const R = w / 2 + 1, h = w / 2;
  p.each(Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R, (x, y) => {
    const t = ((x - x0) * dx + (y - y0) * dy) / l2;
    if (t < -0.15 / len || t > 1 + 0.15 / len) return null;
    const s = (x - x0 - dx * t) * nx + (y - y0 - dy * t) * ny;
    if (s > h || s < -h) return null;
    return ramp[Math.min(ramp.length - 1, Math.floor((h - s) / w * ramp.length))];
  });
}
// Punktlinie (Naht, Nieten, Kette): jeden zweiten Feinpixel von a nach b
export function stitch(p, x0, y0, x1, y1, c, gap = 1) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) * 2 / (gap + 1)));
  for (let i = 0; i <= n; i++) p.dot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
}
// Senkrechte Falte im Stoff: dunkle Feinlinie, rechts daneben (zum Schatten) nichts, links ein Lichtgrat
export function fold(p, x, y0, y1, dark, light) {
  for (let y = y0; y < y1; y += 0.5) { p.dot(x, y, dark); if (light) p.dot(x - 0.5, y, light); }
}
// Holzmaserung in einem Rechteck: wellige Feinlinien längs (horizontal = true: waagerechte Bretter), Astloch selten
export function grain(p, x, y, w, h, dark, light, seed = 1, horizontal = false) {
  const rnd = (i) => { const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const L = horizontal ? w : h, Wd = horizontal ? h : w;
  const lines = Math.max(1, Math.floor(Wd * 2 / 3));
  for (let k = 0; k < lines; k++) {
    const off = (k + 0.5) * Wd / lines + (rnd(k) - 0.5) * 0.5, ph = rnd(k + 9) * 6, len = L * (0.35 + rnd(k + 3) * 0.5), st = rnd(k + 5) * (L - len);
    for (let u = st; u < st + len; u += 0.5) {
      const o = off + Math.sin(u * 0.7 + ph) * 0.35;
      const px = horizontal ? x + u : x + o, py = horizontal ? y + o : y + u;
      if (px < x || py < y || px >= x + w || py >= y + h) continue;
      p.dot(px, py, k % 3 === 1 && light ? light : dark);
    }
  }
}

// ---------------------------------------------------------------- Gesicht (3/4-Profil nach rechts, Kopf 8×8 Weltpixel)
// Lage wie der alte head() in npcs*.js: hx/hy = linke obere Ecke, Haut x1–6, Nase x7, Kinn/Hals y7.
// Zeichen: 0–3 Haut, h Glanz, b Braue, k Lid/Pupille, w Augenweiß, g Glanzpunkt, i Iris, n Nasenloch, l Lippe, m offen.
const FACE = [
  '................',
  '................',
  '...2222222333...',
  '..122222223333..',
  '..12222222333h..',
  '..122222bbb333..',
  '..122222222233..',
  '..1222222kkk33..',
  '..1222122wgk3232',
  '..12220221ik3332',
  '..1122013112h321',
  '..11220032223n11',
  '..111122222lll2.',
  '..111222222221..',
  '....111111222...',
  '.....0000111....',
];
const FACE_TALK = { 12: '..111122222mmm2.', 13: '..111222222mm1..' };
export function headFine(p, hx, hy, o) {
  const S = o.skin;
  const eye = !o.noEye;
  const pal = {
    0: S[0], 1: S[1], 2: S[2], 3: S[3], h: o.glow ?? tone(S[3], 0.28),
    b: o.brow ?? S[0], n: S[0], l: o.lip ?? tone(S[1], -0.15), m: '#2a0e10',
    k: eye ? (o.eye ?? '#150c12') : S[1], w: eye ? (o.white ?? '#d6cabc') : S[2], g: eye ? '#ffffff' : S[2], i: eye ? (o.iris ?? '#4a2e1e') : S[2],
  };
  const rows = o.talk ? FACE.map((r, i) => FACE_TALK[i] ?? r) : FACE;
  fmap(p, hx, hy, rows, pal);
  if (o.old) { p.dot(hx + 6, hy + 4.5, S[1]); p.dot(hx + 6.5, hy + 5, S[1]); p.dot(hx + 5.5, hy + 6, S[1]); p.dot(hx + 2, hy + 3, S[1]); }
  if (o.lash && eye) { p.dot(hx + 6, hy + 3.5, pal.k); p.dot(hx + 6.5, hy + 3, pal.k); }
}

// ---------------------------------------------------------------- Kleidung (feine Ergänzung zu den alten Bausteinen)
// Arm als Band von Schulter zu Hand (2 Weltpixel stark wie der alte arm()), Hand als kleine Faust mit Knöchellicht.
export function armFine(p, x0, y0, x1, y1, c0, c1, hand) {
  band(p, x0 + 1, y0 + 0.5, x1 + 1, y1 + 0.5, 2, [c0, c0, c1, tone(c1, -0.2)]);
  if (hand) fmap(p, x1, y1 + 1, ['2332', '1221'], { 3: tone(hand, 0.25), 2: hand, 1: tone(hand, -0.25) });
}
// Beine: Knielicht, Naht, Stiefel mit Schaftkante, Sohle und Zehenlicht
export function legsFine(p, cx, fy, top, pants, boots, step = 0) {
  const fx = cx + 1 + step;
  p.rect(fx, top, 0.5, fy - top - 3, pants[2] ?? pants[1]);
  p.dot(fx + 1.5, top + (fy - top) * 0.45, pants[2] ?? pants[1]); p.dot(fx + 2, top + (fy - top) * 0.45 + 0.5, pants[0]);
  stitch(p, cx - 1.5, top + 0.5, cx - 1.5, fy - 3.5, tone(pants[0], 0.18));
  // Schaftkanten und Sohlen
  p.rect(cx - 3, fy - 3, 3, 0.5, tone(boots[0], 0.22));
  p.rect(fx, fy - 3, 3, 0.5, tone(boots[2] ?? boots[1], 0.25));
  p.rect(fx, fy - 2, 0.5, 2, boots[2] ?? boots[1]);
  p.rect(fx, fy + 0.5, 4, 0.5, tone(boots[0], -0.4)); p.rect(cx - 3, fy + 0.5, 4, 0.5, tone(boots[0], -0.4));
  p.dot(fx + 3, fy - 0.5, tone(boots[1], 0.35)); p.dot(fx + 3.5, fy, boots[2] ?? boots[1]);
  p.dot(fx + 1, fy - 1.5, tone(boots[1], -0.25));
}
// Rumpf: Lichtkante links, Falte zur Schattenseite, Saum unten
export function torsoFine(p, x, y, w, h, R, m = 2) {
  const hi = R[m + 2] ?? tone(R[m + 1], 0.2);
  p.rect(x, y + 0.5, 0.5, h - 1, hi);
  fold(p, x + w - 2, y + 1.5, y + h - 0.5, R[m - 1], R[m + 1]);
  p.rect(x + 2, y + h - 0.5, w - 3, 0.5, R[Math.max(0, m - 1)]);
}
// Rock/Robe neu im Feinraster: glatte Glockenkante, Falten als Grat (hell) + Tal (dunkel), Saum mit Lichtkante
export function skirtFine(p, cx, y0, fy, hw0, hw1, R, sh = 0, foldStep = 3, ragged = false) {
  const span = Math.max(1, fy - y0);
  p.each(cx - hw1 - 2 + Math.min(0, sh), y0, cx + hw1 + 3 + Math.max(0, sh), fy + 0.99, (x, y) => {
    const k = Math.min(1, (y - y0) / span), hw = hw0 + k * (hw1 - hw0), s = sh * k;
    const l = cx - hw + s, r = cx + 1 + hw + s;
    if (x < l || x > r + 1) return null;
    if (ragged && y > fy - 1 && Math.sin(x * 4.1) > 0.35) return null;
    const rel = (x - l) / (r + 1 - l);
    let i = rel < 0.25 ? 3 : rel < 0.65 ? 2 : 1;
    if (y >= fy) return R[0];
    if (k > 0.3) {
      const u = (x - s - cx) / foldStep, f = u - Math.round(u);
      if (Math.abs(f) < 0.09) i = Math.max(0, i - 1);
      else if (f < 0 && f > -0.26) i = Math.min(R.length - 1, i + 1);
    }
    if (y >= fy - 0.5) i = Math.max(0, i - 1);
    return R[i];
  });
}
