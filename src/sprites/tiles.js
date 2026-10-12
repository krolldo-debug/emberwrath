import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { createRng, hash2 } from '../core/math.js';
import { col32, pixelsToCanvas } from '../gfx/Fine.js';

// Prozedurale Dungeon-Tiles (16 px). Varianten werden per Seed erzeugt und über
// eine Positions-Hashfunktion verteilt, damit der Boden nicht kachelt.
// Materialien: Steinplatten (kühl/warm), Grabplatten mit Inschrift, Mörtel mit
// Staub, Moos, Risse, Pfützen; Wände aus unregelmäßigen Quadern mit Kanten-
// licht und Sockel. Licht fällt in allen Tiles von oben links (siehe docs/STYLE.md).
const T = 16;
const ST = PAL.stone;
const WARM = ['#221a20', '#2d2329', '#382c33', '#45373d', '#54454a'];
const DUST = ['#1a1520', '#221c28'];

function slab(p, rng, x, y, w, h) {
  const ramp = rng.chance(0.18) ? WARM : ST;
  const base = rng.pick([2, 2, 2, 2, 3]);
  // Grundfläche mit dunklerem Fuß und dreistufiger Körnung
  p.rect(x, y, w, h, ramp[base]);
  if (h > 5) p.rect(x + 1, y + h - 3, w - 2, 2, ramp[base - 1]);
  for (let i = 0; i < (w * h) / 16; i++) {
    const px = x + 1 + rng.int(0, Math.max(0, w - 3)), py = y + 1 + rng.int(0, Math.max(0, h - 3));
    const r = rng.next();
    p.px(px, py, r < 0.6 ? ramp[base - 1] : ramp[Math.min(ramp.length - 1, base + 1)]);
  }
  // Fasen: Oberkante/links Licht, unten/rechts Schatten, Ecken abgerundet
  p.rect(x + 1, y, w - 2, 1, ramp[base + 1]);
  p.rect(x + 1, y + h - 1, w - 2, 1, ramp[0]);
  p.rect(x + w - 1, y + 1, 1, h - 2, ramp[1]);
  p.px(x, y, PAL.mortar); p.px(x + w - 1, y, PAL.mortar); p.px(x, y + h - 1, PAL.mortar); p.px(x + w - 1, y + h - 1, PAL.mortar);
  // Abgeplatzte Ecke
  if (rng.chance(0.3)) { const cx = rng.chance(0.5) ? x + 1 : x + w - 3; const cy = rng.chance(0.5) ? y + 1 : y + h - 3; p.rect(cx, cy, 2, 2, ramp[0]); p.px(cx, cy, PAL.mortar); }
  // Glatt gelaufene Mitte
  if (w >= 10 && h >= 10 && rng.chance(0.35)) {
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < 6; i++) p.px(cx + rng.int(-3, 3), cy + rng.int(-2, 2), ramp[base + 1]);
  }
  return ramp;
}

// Grabplatte mit eingemeißelter Inschrift (selten, große Platten)
function graveSlab(p, rng, x, y, w, h) {
  slab(p, rng, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  p.rect(ix, iy, iw, 1, ST[1]); p.rect(ix, iy + ih - 1, iw, 1, ST[4]);
  p.rect(ix, iy, 1, ih, ST[1]); p.rect(ix + iw - 1, iy, 1, ih, ST[4]);
  for (let row = iy + 2; row < iy + ih - 2; row += 2) {
    let cx = ix + 2;
    while (cx < ix + iw - 3) { const l = rng.int(1, 3); p.rect(cx, row, l, 1, ST[1]); cx += l + 1; }
  }
}

function crack(p, rng, x, y, len) {
  let cx = x, cy = y;
  for (let i = 0; i < len; i++) {
    p.px(cx, cy, PAL.mortar);
    if (rng.chance(0.4)) p.px(cx + 1, cy + 1, ST[4]); // Lichtkante am Riss
    if (rng.chance(0.15)) p.px(cx + rng.int(-1, 1), cy + 1, PAL.mortar);
    cx += rng.int(-1, 1) || 1; cy += rng.int(0, 1);
  }
}

// Bodenplatten: 32x32-"Makrotiles" mit unregelmäßig geteilten Steinplatten
// (rekursive Rechteckteilung). Jede Bodenzelle zeigt ein Viertel davon.
function splitSlabs(rng, x, y, w, h, out, depth = 0) {
  const canV = w >= 12, canH = h >= 12;
  if ((!canV && !canH) || (depth > 1 && rng.chance(0.35))) { out.push([x, y, w, h]); return; }
  const vertical = canV && (!canH || rng.chance(w / (w + h)));
  if (vertical) {
    const cut = rng.int(6, w - 6);
    splitSlabs(rng, x, y, cut, h, out, depth + 1);
    splitSlabs(rng, x + cut, y, w - cut, h, out, depth + 1);
  } else {
    const cut = rng.int(6, h - 6);
    splitSlabs(rng, x, y, w, cut, out, depth + 1);
    splitSlabs(rng, x, y + cut, w, h - cut, out, depth + 1);
  }
}

export function createFloorTiles(count = 10, seed = 7) {
  const rng = createRng(seed);
  const tiles = [];
  for (let i = 0; i < count; i++) {
    const p = new PixelCanvas(T * 2, T * 2);
    p.rect(0, 0, T * 2, T * 2, PAL.mortar);
    for (let k = 0; k < 40; k++) p.px(rng.int(0, 31), rng.int(0, 31), rng.pick(DUST)); // Staub in den Fugen
    const slabs = [];
    splitSlabs(rng, 0, 0, T * 2, T * 2, slabs);
    let grave = rng.chance(0.18);
    for (const [x, y, w, h] of slabs) {
      if (grave && w >= 12 && h >= 12) { graveSlab(p, rng, x, y, w, h); grave = false; }
      else slab(p, rng, x, y, w, h);
    }
    if (rng.chance(0.55)) crack(p, rng, rng.int(3, 26), rng.int(2, 14), rng.int(5, 12));
    // Moos wächst in Büscheln aus den Fugen
    if (rng.chance(0.35)) {
      const mx = rng.int(2, 29), my = rng.int(2, 29);
      for (let m = 0; m < 12; m++) {
        const x = mx + rng.int(-3, 3), y = my + rng.int(-2, 2);
        p.px(x, y, rng.pick(PAL.moss));
        if (rng.chance(0.3)) p.px(x, y - 1, PAL.moss[2]);
      }
    }
    // Kleine Pfütze mit Glanzpunkt
    if (rng.chance(0.15)) {
      const px = rng.int(6, 24), py = rng.int(6, 24);
      p.ellipse(px, py, rng.int(2, 4), 1.5, '#14111e');
      p.px(px - 1, py - 1, '#4a4260'); p.px(px, py - 1, '#3a3450');
    }
    for (let k = 0; k < rng.int(0, 3); k++) { // Kiesel
      const x = rng.int(1, 30), y = rng.int(1, 30);
      p.px(x, y, ST[4]); p.px(x, y + 1, ST[0]);
    }
    tiles.push(p.canvas);
  }
  return tiles;
}

// Wandfläche: Quaderlagen unterschiedlicher Höhe, zwei Segmente (oben/unten).
export function createWallFaceTiles(count = 8, seed = 21) {
  const rng = createRng(seed);
  const W = PAL.stoneWarm;
  const make = (lower) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, PAL.mortar);
    const rows = lower ? [5, 5, 6] : [4, 5, 4, 3];
    let y = 0;
    rows.forEach((rh, row) => {
      let x = row % 2 ? -rng.int(2, 5) : -rng.int(0, 2);
      while (x < T) {
        const bw = rng.int(5, 9);
        const ramp = rng.chance(0.25) ? ST : W;
        const k = rng.pick([1, 2, 2, 3]);
        const c = ramp[Math.min(ramp.length - 1, k)];
        p.rect(x, y, bw - 1, rh - 1, c);
        p.rect(x, y, bw - 1, 1, ramp[Math.min(ramp.length - 1, k + 1)]); // Licht oben
        p.rect(x, y + rh - 2, bw - 1, 1, ramp[Math.max(0, k - 1)]);     // Schatten unten
        if (rng.chance(0.5)) p.px(x + rng.int(1, Math.max(1, bw - 3)), y + rng.int(1, Math.max(1, rh - 2)), W[0]);
        if (rng.chance(0.12)) p.rect(x + 1, y + 1, 2, 1, PAL.mortar); // Ausbruch
        x += bw;
      }
      y += rh;
    });
    if (lower) {
      // Sockel / Umgebungsverdeckung am Boden der Wand
      p.ctx.fillStyle = 'rgba(8,5,12,0.5)';
      p.ctx.fillRect(0, 12, T, 4);
      p.ctx.fillStyle = 'rgba(8,5,12,0.25)';
      p.ctx.fillRect(0, 9, T, 3);
      if (rng.chance(0.5)) for (let m = 0; m < 6; m++) p.px(rng.int(0, 15), rng.int(12, 15), rng.pick(PAL.moss));
    } else {
      p.rect(0, 0, T, 1, ST[4]);
    }
    if (rng.chance(0.3)) {
      // Feuchtigkeitsspur mit Tropfen
      const x = rng.int(2, 13);
      for (let yy = rng.int(0, 5); yy < T; yy++) p.px(x, yy, 'rgba(10,8,20,0.45)');
      p.px(x, T - 2, '#4a4260');
    }
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(make(false)); lower.push(make(true)); }
  return { upper, lower };
}

// Wandkrone (Draufsicht auf die Mauer): dunkler Schutt mit feinen Kanten.
export function createWallTopTile(seed = 5) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#16121e');
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#1d1827', '#120f19', '#221c2c', '#1a1523']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#0e0b14');
  }
  return p.canvas;
}

// ------------------------------------------------------------------ Feinraster (docs/STYLE.md „Feinraster“)
// Bodenkacheln im Feinraster: 32×32 Weltpixel = 64×64 Texel, canvas.res = 2. Gleiche Platten, Farben und rng-Folge
// wie die grobe Fassung (Qualität Niedrig), dazu Feinpixel-Details: Fugen 1 Feinpixel mit Lichtkante, Fasen,
// Abplatzungen, Risse mit Lichtkante, Staub in den Fugen, Moosbüschel, Glanzpunkte. Flache Tonflächen, Übergänge
// geordnet gerastert, kein Sprenkel. FineTile ist das gemeinsame Werkzeug (auch für sprites/biomes.js).
const FS = 64;
export class FineTile {
  // tone: gemeinsame Tabelle Farbe → { v: Rampe, i: Stufe } (FineTile.tones), für relative Hell/Dunkel-Schritte
  constructor(tone) { this.d = new Uint32Array(FS * FS); this.tone = tone; }
  static tones(ramps) {
    const tone = new Map();
    for (const r of ramps) r.forEach((c, i) => { if (!tone.has(c)) tone.set(c, { v: r, i }); });
    return tone;
  }
  set(F, G, c) { if (c && F >= 0 && G >= 0 && F < FS && G < FS) this.d[G * FS + F] = c; }
  get(F, G) { return F >= 0 && G >= 0 && F < FS && G < FS ? this.d[G * FS + F] : 0; }
  rect(F, G, w, h, c) {
    const x0 = Math.max(0, F), y0 = Math.max(0, G), x1 = Math.min(FS, F + w), y1 = Math.min(FS, G + h);
    for (let y = y0; y < y1; y++) this.d.fill(c, y * FS + x0, y * FS + x1);
  }
  // Stufe innerhalb der eigenen Rampe verschieben (k < 0 dunkler); Farben außerhalb der Rampen bleiben
  shift(F, G, k) {
    const t = this.tone.get(this.get(F, G));
    if (t) this.set(F, G, t.v[Math.max(0, Math.min(t.v.length - 1, t.i + k))]);
  }
  // Ellipse (Mitte/Halbachsen in Feinpixeln): fn(F, G, q, dx, dy) -> Farbe|0, q = normierter Abstand²
  ellipse(cx, cy, rx, ry, fn) {
    for (let G = Math.floor(cy - ry); G <= Math.ceil(cy + ry); G++) for (let F = Math.floor(cx - rx); F <= Math.ceil(cx + rx); F++) {
      const dx = (F + 0.5 - cx) / rx, dy = (G + 0.5 - cy) / ry, q = dx * dx + dy * dy;
      if (q <= 1) this.set(F, G, fn(F, G, q, dx, dy));
    }
  }
  // Gefaste Platte (Feinpixel): Fläche R[b], Fuß R[b-1] (harte Stufe), Lichtkante oben (und links) R[b+1],
  // Glanzpunkt oben links, Schatten unten R[sb] / rechts R[sr], Fuge 1 Feinpixel rechts/unten, Ecken gefast.
  // hi: Stufen der Lichtkante (2 = scharfe, glasige Kante); kleine Kerben an den Kanten je Platte (Hash, ohne rng)
  slab(X, Y, W, H, R, b, grout, sb, sr, left = true, hi = 1) {
    const top = R.length - 1, L = R[Math.min(top, b + hi)], L2 = R[Math.min(top, b + hi + 1)];
    this.rect(X, Y, W, H, R[b]);
    if (H > 10) this.rect(X + 2, Y + H - 6, W - 4, 4, R[b - 1]);
    this.rect(X + 1, Y, W - 3, 1, L);
    if (left) this.rect(X, Y + 1, 1, H - 3, L);
    this.set(X + 1, Y + 1, L2); this.set(X + 2, Y, L2); if (left) this.set(X, Y + 2, L2);
    this.rect(X + 1, Y + H - 2, W - 3, 1, R[sb]);
    this.rect(X + W - 2, Y + 1, 1, H - 3, R[sr]);
    this.rect(X, Y + H - 1, W, 1, grout); this.rect(X + W - 1, Y, 1, H, grout);
    this.set(X, Y, grout); this.set(X + W - 2, Y, grout); this.set(X, Y + H - 2, grout); this.set(X + W - 2, Y + H - 2, grout);
    // Kerben: oben/links (Bruchfläche zum Licht: hell), unten/rechts (im Schatten: dunkel)
    const hN = hash2(X, Y, 52), n = hN < 0.35 ? 0 : hN < 0.8 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const h = hash2(X + k, Y + W, 53), side = Math.floor(h * 4), u = hash2(X, Y + k, 54);
      if ((side & 1 ? H : W) < 14) continue;
      const p = 4 + Math.floor(u * ((side & 1 ? H : W) - 10));
      if (side === 0) { this.rect(X + p, Y, 3, 1, grout); this.set(X + p + 1, Y + 1, grout); this.set(X + p, Y + 1, L2); this.set(X + p + 2, Y + 1, L); }
      else if (side === 1) { this.rect(X, Y + p, 1, 3, grout); this.set(X + 1, Y + p + 1, grout); this.set(X + 1, Y + p, L2); this.set(X + 1, Y + p + 2, L); }
      else if (side === 2) { this.rect(X + p, Y + H - 2, 3, 1, grout); this.set(X + p + 1, Y + H - 3, grout); this.set(X + p, Y + H - 3, R[Math.max(0, b - 1)]); }
      else { this.rect(X + W - 2, Y + p, 1, 3, grout); this.set(X + W - 3, Y + p + 1, grout); this.set(X + W - 3, Y + p, R[Math.max(0, b - 1)]); }
    }
  }
  // Abplatzung an einer Plattenecke: Bruch tiefer (R[lo]), Bruchkante oben hell / unten dunkel
  chip(X, Y, W, H, left, top, n, R, b, grout, lo = 0) {
    const CX = left ? X : X + W - 2, CY = top ? Y : Y + H - 2;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n - j; i++) {
      const F = CX + (left ? i : -i), G = CY + (top ? j : -j), s = i + j;
      this.set(F, G, s <= 1 ? grout : s < n ? R[lo] : R[top ? Math.min(R.length - 1, b + 1) : Math.max(0, b - 1)]);
    }
  }
  // Rille/Riss: dunkle Feinpixel, darunter Lichtkante (eine Stufe heller als der Grund)
  groove(pts, dark) {
    const on = new Set(pts.map(([F, G]) => G * FS + F));
    for (const [F, G] of pts) this.set(F, G, dark);
    for (const [F, G] of pts) if (!on.has((G + 1) * FS + F)) this.shift(F, G + 1, 1);
  }
  // Kiesel: Glanzpunkt oben links, dunkle Kante unten rechts, Schlagschatten (eine Stufe dunkler) unten rechts
  pebble(F, G, big, R) {
    const top = R.length - 1;
    const shape = big ? [[0, 0, 1], [1, 0, 2], [2, 0, 3], [0, 1, 3], [1, 1, 3], [2, 1, 4]] : [[0, 0, 1], [1, 0, 3], [0, 1, 3], [1, 1, 4]];
    const sh = big ? [[3, 1], [1, 2], [2, 2], [3, 2]] : [[2, 1], [1, 2], [2, 2]];
    for (const [i, j] of sh) this.shift(F + i, G + j, -2);
    for (const [i, j, k] of shape) this.set(F + i, G + j, R[top - k]);
  }
  canvas() { const c = pixelsToCanvas(this.d, FS, FS); c.res = 2; return c; }
}
// Feinpixel-Pfad zwischen zwei Punkten (Bresenham), ohne den Startpunkt
export function finePath(a, b, c, d, out) {
  const dx = Math.abs(c - a), dy = -Math.abs(d - b), sx = a < c ? 1 : -1, sy = b < d ? 1 : -1;
  let err = dx + dy;
  while (a !== c || b !== d) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; a += sx; }
    if (e2 <= dx) { err += dx; b += sy; }
    out.push([a, b]);
  }
  return out;
}

const c32 = (list) => list.map((c) => col32(c));
const STf = c32(ST), WARMf = c32(WARM), DUSTf = c32(DUST);
const MORf = col32(PAL.mortar);
const MOSSf = c32([...PAL.moss, '#4c6439']);
const POOLf = c32(['#0d0b15', '#14111e', '#1d1a2b', '#3a3450', '#4a4260', '#5e5878']);
const TONE = FineTile.tones([STf, WARMf, MOSSf]);

function slabFine(t, rng, x, y, w, h) {
  const ramp = rng.chance(0.18) ? WARMf : STf;
  const base = rng.pick([2, 2, 2, 2, 3]);
  const X = x * 2, Y = y * 2, W = w * 2, H = h * 2;
  t.slab(X, Y, W, H, ramp, base, MORf, 0, 1, false);
  // Körnung der groben Fassung (gleiche rng-Folge): hier wenige bewusst gesetzte Grübchen/Buckel statt Sprenkel
  for (let i = 0; i < (w * h) / 16; i++) {
    const px = x + 1 + rng.int(0, Math.max(0, w - 3)), py = y + 1 + rng.int(0, Math.max(0, h - 3));
    const r = rng.next();
    const F = px * 2 + (i & 1), G = py * 2 + ((i >> 1) & 1);
    if (G >= Y + H - 3 || F >= X + W - 3) continue;
    if (r < 0.6) { if (i % 2 === 0) { t.shift(F, G, -1); if (i % 4 === 0) t.shift(F + 1, G, -1); t.shift(F, G + 1, 1); } }
    else if (i % 3 === 0) { t.shift(F, G, 1); t.shift(F, G + 1, -1); }
  }
  // Abgeplatzte Ecke
  if (rng.chance(0.3)) {
    const left = rng.chance(0.5), top = rng.chance(0.5);
    t.chip(X, Y, W, H, left, top, 4 + (hash2(x, y, 41) < 0.5 ? 1 : 0), ramp, base, MORf, 0);
  }
  // Glatt gelaufene Mitte: flache, hellere Fläche aus den sechs Trittpunkten der groben Fassung (harte Kante)
  if (w >= 10 && h >= 10 && rng.chance(0.35)) {
    const cx = X + W / 2, cy = Y + H / 2, L = ramp[base + 1];
    for (let i = 0; i < 6; i++) { const dx = rng.int(-3, 3), dy = rng.int(-2, 2); t.ellipse(cx + dx * 1.5, cy + dy * 1.5, 3, 2, () => L); }
  } else if (hash2(x, y, 49) < 0.3 && w >= 6 && h >= 6) {
    // Fleck (Feuchte/Ruß): flache, dunklere Fläche
    const cx = X + 3 + hash2(x, y, 50) * (W - 6), cy = Y + 3 + hash2(x, y, 51) * (H - 7), D = ramp[base - 1];
    t.ellipse(cx, cy, 3.5, 2.2, () => D); t.ellipse(cx + 2.5, cy + 1, 2.5, 1.8, () => D);
  }
  return ramp;
}

function graveSlabFine(t, rng, x, y, w, h) {
  slabFine(t, rng, x, y, w, h);
  const IX = (x + 3) * 2, IY = (y + 3) * 2, IW = (w - 6) * 2, IH = (h - 6) * 2;
  // eingemeißelter Rahmen: Rille 1 Feinpixel, Lichtkante unten/rechts
  const frame = [];
  for (let F = IX; F < IX + IW; F++) frame.push([F, IY], [F, IY + IH - 1]);
  for (let G = IY + 1; G < IY + IH - 1; G++) frame.push([IX, G], [IX + IW - 1, G]);
  t.groove(frame, STf[0]);
  for (let G = IY + 1; G < IY + IH - 1; G++) t.shift(IX + IW, G, 1);
  // Inschrift: Zeichen aus Querstrich und Haken (Form je Position), jede Zeile 2 Weltpixel
  for (let row = IY / 2 + 2; row < IY / 2 + IH / 2 - 2; row += 2) {
    let cx = IX / 2 + 2;
    while (cx < IX / 2 + IW / 2 - 3) {
      const l = rng.int(1, 3), F0 = cx * 2, G0 = row * 2, h = hash2(cx, row, 43);
      const pts = [];
      for (let i = 0; i < l * 2; i++) pts.push([F0 + i, G0]);
      pts.push([F0 + (h < 0.5 ? 0 : l * 2 - 1), G0 + 1]);
      if (l > 1 && h > 0.3) pts.push([F0 + l, G0 + 1]);
      if (h > 0.8) pts.push([F0 + l - 1, G0 - 1]);
      t.groove(pts, STf[1]);
      cx += l + 1;
    }
  }
}

// Riss: Verlauf der groben Fassung, aber ohne Haken (Richtung bleibt), in der Mitte 2 Feinpixel breit
function crackFine(t, rng, x, y, len) {
  let cx = x, cy = y, F = x * 2, G = y * 2, dir = 0;
  const pts = [[F, G]];
  for (let i = 0; i < len; i++) {
    rng.chance(0.4);
    if (rng.chance(0.15)) { const bx = rng.int(-1, 1); finePath(F, G, F + bx * 2 + (bx ? 0 : 1), G + 3, pts); }
    const s = rng.int(-1, 1) || 1;
    dir ||= s;
    cx += dir; cy += rng.int(0, 1);
    if (i > len / 3 && i < (len * 2) / 3) pts.push([F + 1, G]);
    const nF = cx * 2 + (hash2(cx, cy, 44) < 0.5 ? 0 : 1), nG = cy * 2 + (hash2(cx, cy, 45) < 0.5 ? 0 : 1);
    finePath(F, G, nF, nG, pts);
    F = nF; G = nG;
  }
  t.groove(pts, MORf);
}

// Moosbüschel: Polster mit heller Oberkante, dunklem Fuß; einzelne Triebe mit heller Spitze; Moos kriecht in die Fugen
function mossFine(t, rng, mx, my) {
  const tufts = [];
  for (let m = 0; m < 12; m++) {
    const x = mx + rng.int(-3, 3), y = my + rng.int(-2, 2);
    const c = rng.pick(PAL.moss), sprout = rng.chance(0.3);
    tufts.push([x * 2 + (m & 1), y * 2 + ((m >> 1) & 1), PAL.moss.indexOf(c), sprout]);
  }
  for (let G = my * 2 - 9; G <= my * 2 + 9; G++) for (let F = mx * 2 - 11; F <= mx * 2 + 11; F++) {
    if (t.get(F, G) === MORf && hash2(F, G, 46) < 0.75) t.set(F, G, MOSSf[(F + G) & 1 ? 0 : 1]);
  }
  tufts.sort((a, b) => a[1] - b[1]);
  for (const [F, G, k, sprout] of tufts) {
    t.set(F, G + 1, MOSSf[0]); t.set(F + 1, G + 1, MOSSf[0]);
    t.set(F, G, MOSSf[Math.min(2, k + 1)]); t.set(F + 1, G, MOSSf[k]);
    if (sprout) { t.set(F, G - 1, MOSSf[2]); t.set(F, G - 2, MOSSf[3]); }
  }
}

let FINE_FLOOR = null;
// Feinraster-Bodenkacheln der Katakomben (32×32 Weltpixel, 64×64 Texel, canvas.res = 2), einmal je Sitzung.
export function createFloorTilesFine(count = 10, seed = 7) {
  if (FINE_FLOOR) return FINE_FLOOR;
  const rng = createRng(seed);
  const tiles = [];
  for (let i = 0; i < count; i++) {
    const t = new FineTile(TONE);
    t.rect(0, 0, FS, FS, MORf);
    const dust = [];
    for (let k = 0; k < 40; k++) dust.push([rng.int(0, 31), rng.int(0, 31), rng.pick(DUSTf)]);
    const slabs = [];
    splitSlabs(rng, 0, 0, T * 2, T * 2, slabs);
    let grave = rng.chance(0.18);
    for (const [x, y, w, h] of slabs) {
      if (grave && w >= 12 && h >= 12) { graveSlabFine(t, rng, x, y, w, h); grave = false; }
      else slabFine(t, rng, x, y, w, h);
    }
    if (rng.chance(0.55)) crackFine(t, rng, rng.int(3, 26), rng.int(2, 14), rng.int(5, 12));
    if (rng.chance(0.35)) mossFine(t, rng, rng.int(2, 29), rng.int(2, 29));
    // Kleine Pfütze: dunkler Spiegel, Rand oben dunkel, Spiegelung als harte Streifen
    if (rng.chance(0.15)) {
      const px = rng.int(6, 24) * 2, py = rng.int(6, 24) * 2, rx = rng.int(2, 4) * 2 + 1;
      t.ellipse(px + 1, py + 1, rx, 3.2, (F, G, q, dx, dy) => POOLf[dy < -0.55 ? 0 : q > 0.7 && dy > 0.3 ? 2 : 1]);
      for (let i = 0; i < 3; i++) t.set(px - rx + 4 + i, py, POOLf[i === 0 ? 5 : 4]);
      t.set(px - rx + 7, py, POOLf[3]); t.set(px + 2, py + 2, POOLf[3]); t.set(px + 3, py + 2, POOLf[3]);
    }
    for (let k = 0; k < rng.int(0, 3); k++) { // Kiesel
      const x = rng.int(1, 30), y = rng.int(1, 30);
      t.pebble(x * 2, y * 2, hash2(x, y, 47) < 0.4, STf);
    }
    // Staub in den Fugen (Mörtel bleibt nur in den Fugen sichtbar)
    for (const [x, y, c] of dust) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
      const F = x * 2 + k, G = y * 2 + j;
      if (t.get(F, G) === MORf && hash2(F, G, 48) < 0.55) t.set(F, G, c);
    }
    tiles.push(t.canvas());
  }
  FINE_FLOOR = tiles;
  return tiles;
}
export function resetFloorTilesFine() { FINE_FLOOR = null; }
