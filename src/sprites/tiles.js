import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { createRng } from '../core/math.js';

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
