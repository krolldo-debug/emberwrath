import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { createRng, hash2 } from '../core/math.js';

// Kacheln, Flüssigkeiten und Deko für zwei weitere Dungeons:
//   'temple' – Der Versunkene Tempel: überfluteter Meerestempel aus türkis-grünem
//              Stein, Grünspan-Bronze, Algen, Muscheln, Wasserrinnen.
//   'forge'  – Die Glutschmiede: Schmiede im Berg aus schwarzem Basalt, Eisenplatten,
//              Messing, Ketten, Lavarinnen und flüssigem Metall.
// Format wie tiles.js (Boden = 32×32-Makrokacheln, Wandfront oben/unten, Wandkrone)
// plus nicht begehbare Flüssigkeit (4 Frames, Glow, Uferkante) und Props
// ({ sprite, glow?, box?, light? }, Glow (W+2)×(H+2) um 1 px versetzt wie hall.js).
// Licht fällt überall von oben links; Grundstimmung dunkel, damit die Lightmap wirkt.
const T = 16;

// ------------------------------------------------------------------ Rampen
// Tempel
const TST = ['#0c1517', '#132024', '#1a2b2f', '#223739', '#2c4545', '#3a5754', '#4c6b64'];   // türkis-grüner Stein
const TSW = ['#12161a', '#191f22', '#21292a', '#2b3533', '#36423d', '#45524a'];              // ausgebleichter, kühler Sandstein
const TGROUT = '#081012';
const MARB = ['#152322', '#1f3230', '#2b4340', '#3a5752', '#4d6d64', '#67877a', '#86a393']; // Statuen-Marmor (heller)
const VERD = ['#0f2624', '#173a35', '#22564a', '#327560', '#4f9a7c', '#86c6a4'];             // Grünspan
const BRZ = ['#241810', '#3c2a16', '#5a4020', '#7a5a2c', '#a07c3e', '#cfa860'];              // Bronze darunter
const ALG = ['#0f1f16', '#16301d', '#1f4324', '#2d5a2c', '#437334', '#5e8c40'];              // Algen / Tang
const SHELL = ['#2e2426', '#54423f', '#806a60', '#ad9484', '#d6bfad', '#f2e6d8'];            // Muschelkalk / Perlmutt
const CORAL = ['#2c0c18', '#521428', '#82223a', '#b23c48', '#d8645a', '#f29a82'];            // rote Koralle
const FAN = ['#1c0f2c', '#301a4a', '#4a2a6c', '#6a4494', '#9270bc', '#c0a2e0'];              // violette Fächerkoralle
const WAT = ['#03080d', '#061019', '#0a1924', '#0f2430', '#16343f', '#225060', '#3a7482'];   // dunkles Wasser
const TFIRE = ['#04201f', '#073a38', '#0d5f5a', '#18918a', '#3cc8b8', '#8cf0e2', '#e4fff9']; // türkises Feuer
const PEARL = ['#3a4450', '#6c7a88', '#a8b8c6', '#d8e6f0', '#ffffff'];
const SAND = ['#1e1f1a', '#2a2a22', '#37362a', '#454232'];

// Schmiede
const BAS = ['#09080a', '#110f12', '#18151a', '#211d23', '#2b262d', '#37303a', '#463d48'];   // Basalt
const IRON = ['#0f1114', '#181b20', '#23282e', '#30363e', '#434b54', '#5e6872', '#8e9aa6'];  // Eisenplatten
const BRASS = ['#241606', '#43290c', '#6a4814', '#946a22', '#bf9236', '#e2bc5a', '#fbe79a']; // Messing
const COPPER = ['#2a120c', '#4c2216', '#743822', '#9c5430', '#c47a48', '#e8a870'];
const WOOD = ['#140c09', '#22150f', '#342016', '#4a2e1e', '#61402a', '#7c5636'];
const SOOT = ['#0a0809', '#120e0f', '#1a1415'];
const EMB = PAL.ember;                                                                          // Glut / Lava
const CRUST = ['#120605', '#1e0a07', '#2e110a', '#42180c', '#5a200e'];                          // Lavakruste
const FGROUT = '#070608';
const STEEL = PAL.steel;
const RUST = PAL.rust;
const BONE = PAL.bone;

const cl = (r, i) => r[Math.max(0, Math.min(r.length - 1, i))];

// Senkrechter Zylinder, Licht von links oben: Glanz im linken Drittel, rechts Schatten.
function cylCol(ramp, i, w, base) {
  const t = (i + 0.5) / w;
  if (t < 0.12) return cl(ramp, base - 1);
  if (t < 0.34) return cl(ramp, base + 1);
  if (t < 0.62) return cl(ramp, base);
  if (t < 0.86) return cl(ramp, base - 1);
  return cl(ramp, base - 2);
}
function cyl(p, x, y, w, h, ramp, base) {
  for (let i = 0; i < w; i++) p.rect(x + i, y, 1, h, cylCol(ramp, i, w, base));
}

// Unregelmäßige Rechteckteilung (Platten im Boden)
function splitRects(rng, x, y, w, h, out, min = 6, depth = 0) {
  const canV = w >= min * 2, canH = h >= min * 2;
  if ((!canV && !canH) || (depth > 1 && rng.chance(0.35))) { out.push([x, y, w, h]); return; }
  const vertical = canV && (!canH || rng.chance(w / (w + h)));
  if (vertical) {
    const cut = rng.int(min, w - min);
    splitRects(rng, x, y, cut, h, out, min, depth + 1);
    splitRects(rng, x + cut, y, w - cut, h, out, min, depth + 1);
  } else {
    const cut = rng.int(min, h - min);
    splitRects(rng, x, y, w, cut, out, min, depth + 1);
    splitRects(rng, x, y + cut, w, h - cut, out, min, depth + 1);
  }
}

// Gefaste Platte: oben/links Licht, unten/rechts Schatten, Körnung.
function bevelSlab(p, rng, x, y, w, h, ramp, base, grout, grain = 16) {
  p.rect(x, y, w, h, ramp[base]);
  if (h > 5) p.rect(x + 1, y + h - 3, w - 2, 2, ramp[base - 1]);
  for (let i = 0; i < (w * h) / grain; i++) {
    const px = x + 1 + rng.int(0, Math.max(0, w - 3)), py = y + 1 + rng.int(0, Math.max(0, h - 3));
    p.px(px, py, rng.next() < 0.6 ? ramp[base - 1] : cl(ramp, base + 1));
  }
  p.rect(x + 1, y, w - 2, 1, cl(ramp, base + 1));
  p.rect(x, y + 1, 1, h - 2, cl(ramp, base + 1));
  p.px(x + 1, y + 1, cl(ramp, base + 2));
  p.rect(x + 1, y + h - 1, w - 2, 1, ramp[Math.max(0, base - 2)]);
  p.rect(x + w - 1, y + 1, 1, h - 2, ramp[Math.max(0, base - 1)]);
  p.px(x, y, grout); p.px(x + w - 1, y, grout); p.px(x, y + h - 1, grout); p.px(x + w - 1, y + h - 1, grout);
}

function crackLine(p, rng, x, y, len, dark, light) {
  let cx = x, cy = y;
  for (let i = 0; i < len; i++) {
    p.px(cx, cy, dark);
    if (light && rng.chance(0.4)) p.px(cx + 1, cy + 1, light);
    if (rng.chance(0.15)) p.px(cx + rng.int(-1, 1), cy + 1, dark);
    cx += rng.int(-1, 1) || 1; cy += rng.int(0, 1);
  }
}

// ================================================================== TEMPEL
function templeFloor(count = 10, seed = 71) {
  const rng = createRng(seed);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const p = new PixelCanvas(32, 32);
    p.rect(0, 0, 32, 32, TGROUT);
    for (let k = 0; k < 30; k++) p.px(rng.int(0, 31), rng.int(0, 31), rng.pick(['#0c1719', '#0a1416', SAND[0]]));
    const rects = [];
    // Große, ruhige Tempelplatten; ab und zu ein Mosaikfeld
    splitRects(rng, 0, 0, 32, 32, rects, 7);
    let mosaic = n === 4;
    let spiral = n === 7;
    for (const [x, y, w, h] of rects) {
      const ramp = rng.chance(0.15) ? TSW : TST;
      const base = rng.pick([2, 2, 2, 3]);
      bevelSlab(p, rng, x, y, w, h, ramp, base, TGROUT, 20);
      if (mosaic && w >= 12 && h >= 12) { mosaicField(p, rng, x + 2, y + 2, w - 4, h - 4); mosaic = false; continue; }
      if (spiral && w >= 11 && h >= 11) { fossilSpiral(p, x + (w >> 1), y + (h >> 1), ramp, base); spiral = false; continue; }
      // Nasse, dunklere Flecken (Wasser steht in Mulden)
      if (rng.chance(0.35) && w > 6 && h > 6) {
        const cx = x + rng.int(2, w - 3), cy = y + rng.int(2, h - 3);
        for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) {
          if (i * i / 9 + j * j / 4 > 1 || ((i + j) & 1 && rng.chance(0.5))) continue;
          p.px(cx + i, cy + j, ramp[base - 1]);
        }
      }
    }
    // Riss mit Algenbewuchs
    if (rng.chance(0.5)) crackLine(p, rng, rng.int(3, 26), rng.int(2, 14), rng.int(5, 11), TGROUT, TST[4]);
    // Algen wachsen aus den Fugen
    const tufts = rng.int(1, 3);
    for (let t = 0; t < tufts; t++) {
      const mx = rng.int(2, 29), my = rng.int(2, 29);
      for (let m = 0; m < 10; m++) {
        const x = mx + rng.int(-3, 3), y = my + rng.int(-2, 2);
        p.px(x, y, rng.pick([ALG[1], ALG[2], ALG[2], ALG[3]]));
        if (rng.chance(0.25)) p.px(x, y - 1, ALG[4]);
      }
    }
    // Sandverwehung in einer Ecke
    if (rng.chance(0.4)) {
      const sx = rng.pick([2, 26]), sy = rng.pick([3, 27]);
      for (let m = 0; m < 16; m++) p.px(sx + rng.int(-3, 3), sy + rng.int(-2, 2), rng.pick(SAND.slice(1)));
    }
    // Pfütze mit Spiegelung
    if (rng.chance(0.3)) {
      const px = rng.int(6, 24), py = rng.int(6, 24), rx = rng.int(3, 5);
      p.ellipse(px, py, rx, 1.6, WAT[2]);
      p.ellipse(px, py + 0.4, rx - 1, 1, WAT[1]);
      p.px(px - rx + 1, py - 1, WAT[5]); p.px(px - rx + 2, py - 1, WAT[4]); p.px(px + 1, py, WAT[4]);
    }
    // Muschelsplitter und Seepocken
    for (let k = 0; k < (rng.chance(0.4) ? 1 : 0); k++) {
      const x = rng.int(1, 30), y = rng.int(1, 30);
      p.px(x, y, rng.pick([SHELL[3], SHELL[4]])); p.px(x + 1, y, SHELL[2]); p.px(x, y + 1, SHELL[1]);
    }
    tiles.push(p.canvas);
  }
  return tiles;
}

// Mosaik aus 2-px-Steinchen: Wellenband auf dunklem Meeresblau
function mosaicField(p, rng, x, y, w, h) {
  p.rect(x, y, w, h, TGROUT);
  const phase = rng.range(0, 6);
  for (let j = 0; j + 1 < h; j += 2) {
    for (let i = 0; i + 1 < w; i += 2) {
      const u = i / 2, v = j / 2;
      const crest = h / 4 + Math.sin(u * 0.9 + phase) * 1.3;
      let c;
      if (Math.abs(v - crest) < 0.7) c = '#5a6a52';
      else if (v < crest) c = (u + v) % 3 === 0 ? '#1a3a44' : '#16303a';
      else if (Math.abs(v - crest - 2) < 0.7) c = '#3e6a66';
      else c = (u * 7 + v * 3) % 5 === 0 ? '#1d4448' : '#193a3e';
      if (rng.chance(0.12)) c = TST[1]; // fehlende Steinchen
      p.px(x + i, y + j, c);
      p.px(x + i + (rng.chance(0.3) ? 0 : 0), y + j, c);
      p.rect(x + i, y + j, 2, 2, c);
      if (c !== TST[1] && rng.chance(0.3)) p.px(x + i, y + j, c === '#5a6a52' ? '#72806a' : TST[3]);
    }
  }
  // Rahmen
  p.rect(x - 1, y - 1, w + 1, 1, TST[1]); p.rect(x - 1, y - 1, 1, h + 1, TST[1]);
  p.rect(x, y + h - 1, w, 1, TST[4]); p.rect(x + w - 1, y, 1, h, TST[4]);
}

// Eingemeißelte Ammonitenspirale
function fossilSpiral(p, cx, cy, ramp, base) {
  for (let a = 0; a < Math.PI * 5; a += 0.12) {
    const r = 0.7 + a * 0.3;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.85);
    p.px(x, y, ramp[base - 2] || ramp[0]);
    p.px(x + 1, y + 1, cl(ramp, base + 2));
  }
}

// Wellenranke (laufender Hund) als Relief im Fries, Periode 8 → nahtlos
const WAVE = [
  '..###...',
  '.#...#..',
  '#..#..#.',
  '#.#...#.',
  '.#...#..',
];
function templeFaces(count = 8, seed = 91) {
  const rng = createRng(seed);
  const makeUpper = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, TGROUT);
    // Gesims: vorspringende Profilleiste
    p.rect(0, 0, T, 1, TST[5]); p.rect(0, 1, T, 1, TST[4]); p.rect(0, 2, T, 1, TST[2]); p.rect(0, 3, T, 1, TST[0]);
    // Fries mit Wellenranke
    p.rect(0, 4, T, 6, TST[3]);
    for (let y = 0; y < 5; y++) for (let x = 0; x < T; x++) {
      if (WAVE[y][x & 7] !== '#') continue;
      p.px(x, 4 + y, TST[1]);
      if (y < 4 && WAVE[y + 1][x & 7] !== '#') p.px(x, 5 + y, TST[4]);
    }
    p.rect(0, 9, T, 1, TST[2]);
    p.rect(0, 10, T, 1, TGROUT);
    // Beschädigter Fries in manchen Varianten
    if (v % 3 === 1) {
      const bx = rng.int(2, 10);
      p.rect(bx, 5, rng.int(3, 5), 4, TST[1]); p.px(bx, 5, TGROUT); p.rect(bx + 1, 8, 2, 1, TST[2]);
    }
    // Quaderlage
    let x = -rng.int(0, 8);
    while (x < T) {
      const bw = rng.int(9, 13);
      const ramp = rng.chance(0.25) ? TSW : TST;
      const k = rng.pick([2, 2, 3]);
      p.rect(x, 11, bw - 1, 5, ramp[k]);
      p.rect(x, 11, bw - 1, 1, ramp[k + 1]);
      p.px(x, 11, ramp[k + 2]);
      if (rng.chance(0.5)) p.px(x + rng.int(2, Math.max(2, bw - 3)), 13, ramp[k - 1]);
      x += bw;
    }
    // Algenfäden hängen aus der Fuge unter dem Gesims
    if (rng.chance(0.55)) {
      const ax = rng.int(1, 13);
      for (let s = 0; s < rng.int(2, 3); s++) {
        const len = rng.int(3, 8), sx = ax + s * 2;
        for (let y = 3; y < 3 + len && y < T; y++) p.px(sx + ((y >> 2) & 1), y, y === 2 + len ? ALG[4] : rng.pick([ALG[2], ALG[3]]));
      }
    }
    // Grünspan-Medaillon (Bronzefisch) selten
    if (v === 4) {
      p.ellipse(8, 13, 3, 2.4, VERD[1]); p.ellipse(7.6, 12.6, 2.2, 1.6, VERD[3]); p.px(7, 12, VERD[5]); p.px(9, 14, VERD[0]);
      p.px(10, 15, 'rgba(40,120,100,0.5)'); p.px(10, 15, VERD[2]);
    }
    return p.canvas;
  };
  const makeLower = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, TGROUT);
    [[0, 8], [8, 8]].forEach(([y0, rh], row) => {
      let x = row ? -rng.int(4, 8) : -rng.int(0, 3);
      while (x < T) {
        const bw = rng.int(8, 13);
        const ramp = rng.chance(0.25) ? TSW : TST;
        const k = rng.pick([2, 2, 3]) - row;
        p.rect(x, y0, bw - 1, rh - 1, ramp[k]);
        p.rect(x, y0, bw - 1, 1, ramp[k + 1]);
        p.rect(x, y0 + rh - 2, bw - 1, 1, ramp[Math.max(0, k - 1)]);
        p.px(x, y0, ramp[k + 2]);
        for (let s = 0; s < 3; s++) p.px(x + rng.int(1, Math.max(1, bw - 3)), y0 + rng.int(1, rh - 3), ramp[k - 1] || ramp[0]);
        if (rng.chance(0.15)) { p.rect(x + 1, y0 + 2, 2, 2, TGROUT); p.px(x + 3, y0 + 3, ramp[k + 1]); }
        x += bw;
      }
    });
    // Hochwasserlinie: Salzkruste bei y=4, darunter nasser, dunkler Stein
    for (let x = 0; x < T; x++) { p.px(x, 4, (x * 5 + v) % 7 === 0 ? SHELL[2] : '#3c524a'); if ((x + v) % 3 === 0) p.px(x, 5, '#2d4440'); }
    p.ctx.fillStyle = 'rgba(2,10,12,0.32)'; p.ctx.fillRect(0, 5, T, 11);
    p.ctx.fillStyle = 'rgba(2,8,10,0.35)'; p.ctx.fillRect(0, 11, T, 5);
    p.ctx.fillStyle = 'rgba(2,6,8,0.35)'; p.ctx.fillRect(0, 13, T, 3);
    // Algenvorhang aus der Fuge
    const strands = rng.int(0, 2);
    for (let s = 0; s < strands; s++) {
      const sx = rng.int(0, 15), sy = rng.pick([5, 8]), len = rng.int(3, 7);
      for (let y = sy; y < Math.min(T, sy + len); y++) p.px(sx + (((y - sy) >> 1) % 2 ? 1 : 0), y, y === sy ? ALG[4] : rng.pick([ALG[2], ALG[3], ALG[1]]));
    }
    // Seepocken und Muscheln im Spritzwasserbereich
    for (let k = 0; k < rng.int(0, 2); k++) {
      const x = rng.int(1, 14), y = rng.int(9, 14);
      p.px(x, y, SHELL[3]); p.px(x + 1, y, SHELL[1]); p.px(x, y + 1, SHELL[1]);
    }
    // Tang am Wandfuß
    for (let m = 0; m < 7; m++) { const x = rng.int(0, 15); p.px(x, 15, rng.pick(ALG)); if (rng.chance(0.5)) p.px(x, 14, ALG[3]); }
    // Rinnsal
    if (rng.chance(0.35)) {
      const x = rng.int(2, 13);
      for (let y = rng.int(0, 4); y < T; y++) p.px(x, y, 'rgba(4,14,18,0.55)');
      p.px(x, rng.int(8, 13), WAT[6]);
    }
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(makeUpper(i)); lower.push(makeLower(i)); }
  return { upper, lower };
}

function templeTop(seed = 55) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#0d1618');
  for (let i = 0; i < 30; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#122022', '#0a1112', '#162628', '#10191b', '#13241c']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#070d0e');
  }
  return p.canvas;
}

// Nahtlos kachelnde Welle (Periode 16 in x und y)
const W16 = (x) => Math.sin((x / 16) * Math.PI * 2);

function templeLiquid(seed = 33) {
  const rng = createRng(seed);
  // Feste Glitzerpunkte, die in ihrem Takt aufblitzen
  const glints = [];
  for (let i = 0; i < 7; i++) glints.push([rng.int(0, 15), rng.int(0, 15), rng.int(0, 3), rng.int(2, 3)]);
  const frames = [], glow = [];
  for (let f = 0; f < 4; f++) {
    const p = new PixelCanvas(T, T), g = new PixelCanvas(T, T);
    const ph = (f / 4) * Math.PI * 2;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = Math.sin((x / 16) * Math.PI * 2 * 1 + (y / 16) * Math.PI * 2 * 2 + ph) * 0.5
        + Math.sin((x / 16) * Math.PI * 2 * 2 - (y / 16) * Math.PI * 2 + ph * 2) * 0.35
        + Math.sin((y / 16) * Math.PI * 2 * 3 - ph) * 0.25;
      const th = ((x & 1) * 2 + (y & 1) * 3) % 4 / 4 - 0.5;
      const v = n + th * 0.35;
      p.px(x, y, v > 0.62 ? WAT[3] : v > 0.05 ? WAT[2] : v > -0.6 ? WAT[1] : WAT[0]);
    }
    // Wellenkämme: kurze helle Striche, die mit der Strömung wandern
    for (let r = 0; r < 4; r++) {
      const y = (r * 4 + 1 + (r & 1)) & 15;
      const x0 = (r * 5 + f * 2 + (r & 1) * 3) & 15;
      const len = 3 + (r % 2);
      for (let i = 0; i < len; i++) {
        const x = (x0 + i) & 15;
        p.px(x, y, i === 1 ? WAT[5] : WAT[4]);
        p.px(x, (y + 1) & 15, WAT[1]);
      }
    }
    for (const [gx, gy, t, len] of glints) {
      const on = (f + t) % 4;
      if (on === 0) { p.px(gx, gy, WAT[6]); g.px(gx, gy, '#2a7a88'); g.px((gx + 1) & 15, gy, '#10343c'); }
      else if (on === 1) { p.px(gx, gy, WAT[5]); g.px(gx, gy, '#12404a'); }
      if (on === 0 && len === 3) g.px((gx - 1) & 15, gy, '#0c2a32');
    }
    frames.push(p.canvas); glow.push(g.canvas);
  }
  // Uferkante: senkrechte Beckenwand taucht ins Wasser, heller Wasserrand, Schatten
  const e = new PixelCanvas(T, T);
  e.rect(0, 0, T, 1, TST[5]); e.rect(0, 1, T, 1, TST[4]);
  e.rect(0, 2, T, 3, TST[2]);
  for (let x = 0; x < T; x += 8) { e.rect(x, 2, 1, 3, TGROUT); e.px(x + 1, 2, TST[3]); }
  e.rect(0, 5, T, 1, TST[1]);
  for (let x = 0; x < T; x++) {
    if (x % 5 === 2) e.px(x, 3, ALG[2]);
    if (x % 7 === 4) { e.px(x, 4, ALG[3]); e.px(x, 5, ALG[2]); }
  }
  // Wasserlinie mit Schaum, dann Spiegelschatten der Kante
  for (let x = 0; x < T; x++) e.px(x, 6, x % 4 === 1 ? WAT[6] : x % 4 === 3 ? WAT[4] : WAT[5]);
  e.ctx.fillStyle = 'rgba(1,4,7,0.6)'; e.ctx.fillRect(0, 7, T, 2);
  e.ctx.fillStyle = 'rgba(1,4,7,0.35)'; e.ctx.fillRect(0, 9, T, 2);
  e.ctx.fillStyle = 'rgba(1,4,7,0.15)'; e.ctx.fillRect(0, 11, T, 2);
  return { frames, glow, edge: e.canvas, edgeH: 7 };
}

// ================================================================== SCHMIEDE
function ironPlate(p, x, y, w, h, base, tread) {
  p.rect(x, y, w, h, IRON[base]);
  p.rect(x, y, w, 1, IRON[base + 1]); p.rect(x, y, 1, h, IRON[base + 1]);
  p.rect(x, y + h - 1, w, 1, IRON[base - 2]); p.rect(x + w - 1, y, 1, h, IRON[base - 1]);
  if (tread) {
    for (let j = 3; j < h - 2; j += 3) for (let i = 3 + ((j / 3) & 1) * 2; i < w - 2; i += 4) {
      p.px(x + i, y + j, IRON[base + 1]); p.px(x + i + 1, y + j, IRON[base - 1]);
    }
  }
  for (const [rx, ry] of [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]]) { p.px(x + rx, y + ry, IRON[base + 2]); p.px(x + rx + 1, y + ry + 1, IRON[base - 2]); }
}

function forgeFloor(count = 10, seed = 131) {
  const rng = createRng(seed);
  const tiles = [];
  for (let n = 0; n < count; n++) {
    const p = new PixelCanvas(32, 32);
    p.rect(0, 0, 32, 32, FGROUT);
    for (let k = 0; k < 40; k++) p.px(rng.int(0, 31), rng.int(0, 31), rng.pick(SOOT));
    const rects = [];
    splitRects(rng, 0, 0, 32, 32, rects, 6);
    // In einigen Makrokacheln liegt eine Eisenplatte oder ein Glutgitter
    const special = n === 1 || n === 6 ? 'plate' : n === 3 ? 'grate' : null;
    let used = false;
    for (const [x, y, w, h] of rects) {
      if (!used && special && w >= 12 && h >= 12) {
        used = true;
        bevelSlab(p, rng, x, y, w, h, BAS, 2, FGROUT, 12);
        const sw = Math.min(w - 2, special === 'plate' ? 16 : 12), sh = Math.min(h - 2, special === 'plate' ? 14 : 10);
        const sx = x + 1 + ((w - 2 - sw) >> 1), sy = y + 1 + ((h - 2 - sh) >> 1);
        if (special === 'plate') ironPlate(p, sx, sy, sw, sh, 2, rng.chance(0.6));
        else grate(p, sx, sy, sw, sh);
        continue;
      }
      const base = rng.pick([2, 2, 3, 3, 2]);
      // Basaltplatten: unregelmäßig abgeschlagene Kanten
      bevelSlab(p, rng, x, y, w, h, BAS, base, FGROUT, 12);
      for (let k = 0; k < 3; k++) {
        if (!rng.chance(0.5)) continue;
        const side = rng.int(0, 3);
        const ex = side === 0 ? x + rng.int(1, w - 3) : side === 1 ? x + w - 2 : side === 2 ? x + rng.int(1, w - 3) : x;
        const ey = side === 0 ? y : side === 1 ? y + rng.int(1, h - 3) : side === 2 ? y + h - 1 : y + rng.int(1, h - 3);
        p.px(ex, ey, FGROUT); p.px(ex + 1, ey, FGROUT);
      }
      // Glasiger Basaltglanz
      if (rng.chance(0.35)) { const gx = x + rng.int(2, w - 4), gy = y + rng.int(2, h - 4); p.px(gx, gy, BAS[5]); p.px(gx + 1, gy, BAS[4]); }
    }
    // Riss mit schwacher Glut
    if (rng.chance(0.5)) {
      let cx = rng.int(4, 26), cy = rng.int(3, 14);
      const len = rng.int(6, 12);
      for (let i = 0; i < len; i++) {
        p.px(cx, cy, FGROUT);
        if (i > 1 && i < len - 2 && rng.chance(0.45)) p.px(cx, cy, i % 3 ? CRUST[4] : EMB[1]);
        cx += rng.int(-1, 1) || 1; cy += rng.int(0, 1);
      }
    }
    // Ruß- und Schlackespritzer, Metalltropfen
    for (let k = 0; k < rng.int(2, 5); k++) {
      const x = rng.int(1, 30), y = rng.int(1, 30);
      p.px(x, y, rng.pick([SOOT[0], SOOT[1], CRUST[1]]));
      if (rng.chance(0.3)) p.px(x + 1, y, SOOT[0]);
    }
    if (rng.chance(0.3)) { const x = rng.int(3, 28), y = rng.int(3, 28); p.px(x, y, BRASS[3]); p.px(x + 1, y, BRASS[1]); p.px(x, y - 1, BRASS[5]); }
    tiles.push(p.canvas);
  }
  return tiles;
}

// Rost-Gitter über Glutschacht
function grate(p, x, y, w, h) {
  p.rect(x, y, w, h, IRON[1]);
  p.rect(x + 1, y + 1, w - 2, h - 2, CRUST[1]);
  for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) {
    const d = Math.abs(i - w / 2) / (w / 2) + Math.abs(j - h / 2) / (h / 2);
    if ((i + j * 3) % 5 === 0) p.px(x + i, y + j, d < 0.7 ? EMB[2] : CRUST[4]);
    else if (d < 0.5) p.px(x + i, y + j, EMB[1]);
  }
  for (let i = 2; i < w - 1; i += 3) { p.rect(x + i, y + 1, 1, h - 2, IRON[3]); p.px(x + i, y + 1, IRON[5]); }
  p.rect(x, y, w, 1, IRON[4]); p.rect(x, y, 1, h, IRON[4]); p.rect(x, y + h - 1, w, 1, IRON[0]); p.rect(x + w - 1, y, 1, h, IRON[1]);
  for (const [rx, ry] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.px(x + rx, y + ry, IRON[5]);
}

function forgeFaces(count = 8, seed = 151) {
  const rng = createRng(seed);
  const basaltCourse = (p, y0, rh, dark = 0) => {
    let x = -rng.int(0, 6);
    while (x < T) {
      const bw = rng.int(6, 10);
      const k = rng.pick([2, 3, 3, 4]) - dark;
      p.rect(x, y0, bw - 1, rh - 1, BAS[k]);
      p.rect(x, y0, bw - 1, 1, BAS[k + 1]); p.px(x, y0, BAS[k + 2]);
      p.rect(x, y0 + rh - 2, bw - 1, 1, BAS[k - 1]);
      p.rect(x + bw - 2, y0 + 1, 1, rh - 2, BAS[k - 1]);
      if (rng.chance(0.5)) p.px(x + rng.int(1, bw - 3), y0 + rng.int(1, rh - 3), BAS[k + 1]);
      x += bw;
    }
  };
  const makeUpper = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, FGROUT);
    basaltCourse(p, 0, 5); basaltCourse(p, 5, 5);
    p.rect(0, 0, T, 1, BAS[5]);
    // Durchgehendes Messingrohr mit Halteschellen (Periode 16 → nahtlos)
    p.rect(0, 10, T, 1, BRASS[4]); p.rect(0, 11, T, 1, BRASS[3]); p.rect(0, 12, T, 1, BRASS[2]); p.rect(0, 13, T, 1, BRASS[0]);
    p.px(3, 10, BRASS[6]); p.px(4, 10, BRASS[5]); p.px(11, 10, BRASS[5]);
    p.ctx.fillStyle = 'rgba(0,0,0,0.45)'; p.ctx.fillRect(0, 14, T, 1);
    basaltCourse(p, 15, 2, 1);
    if (v % 2 === 0) { // Schelle
      const x = 6 + (v % 4); p.rect(x, 9, 2, 6, IRON[3]); p.px(x, 9, IRON[5]); p.px(x + 1, 14, IRON[1]);
    } else if (v === 3) { // Flansch mit Schrauben
      p.rect(7, 9, 3, 6, BRASS[3]); p.rect(7, 9, 1, 6, BRASS[5]); p.rect(9, 9, 1, 6, BRASS[1]); p.px(8, 9, BRASS[6]); p.px(8, 14, BRASS[0]);
    } else if (v === 5) { // Grünspan-freier Kupferfleck: Leck mit Rußfahne
      p.px(10, 13, SOOT[0]); for (let y = 0; y < 9; y++) p.px(10 + (y % 3 === 0 ? 1 : 0), y, 'rgba(0,0,0,0.35)');
    }
    // Ruß von oben
    p.ctx.fillStyle = 'rgba(0,0,0,0.25)'; p.ctx.fillRect(0, 1, T, 3);
    if (v === 6) { // glühende Ader im Basalt
      p.px(3, 3, CRUST[4]); p.px(4, 4, EMB[1]); p.px(4, 5, CRUST[3]); p.px(5, 6, EMB[2]); p.px(5, 7, CRUST[4]);
    }
    return p.canvas;
  };
  const makeLower = (v) => {
    const p = new PixelCanvas(T, T);
    p.rect(0, 0, T, T, FGROUT);
    basaltCourse(p, 0, 4);
    // Messing-Abschlussleiste
    p.rect(0, 3, T, 1, BRASS[4]); p.rect(0, 4, T, 1, BRASS[2]); p.rect(0, 5, T, 1, BRASS[0]);
    p.px((v * 5) & 15, 3, BRASS[6]);
    // Eisenverkleidung: zwei Platten à 8 px mit Nieten
    for (let i = 0; i < 2; i++) {
      const x = i * 8;
      const base = 3 - ((v + i) % 3 === 0 ? 1 : 0);
      p.rect(x, 6, 8, 10, IRON[base]);
      p.rect(x, 6, 8, 1, IRON[base + 1]); p.rect(x, 6, 1, 10, IRON[base + 1]);
      p.rect(x + 7, 6, 1, 10, IRON[0]);
      p.px(x + 2, 8, IRON[5]); p.px(x + 3, 9, IRON[1]); p.px(x + 5, 8, IRON[5]); p.px(x + 6, 9, IRON[1]);
      // Rost- und Hitzeanlauf
      if ((v + i) % 3 === 1) { p.px(x + 3, 11, RUST[2]); p.px(x + 4, 12, RUST[1]); p.px(x + 3, 12, RUST[1]); }
      if ((v + i) % 4 === 2) { p.px(x + 4, 10, '#3a3048'); p.px(x + 5, 10, '#4a3a30'); }
      if ((v * 3 + i) % 5 === 0) { p.rect(x + 2, 11, 3, 1, IRON[base - 1]); p.px(x + 2, 11, IRON[base + 2]); } // Schweißnaht
    }
    // Ruß und Umgebungsverdeckung am Fuß
    p.ctx.fillStyle = 'rgba(4,2,4,0.5)'; p.ctx.fillRect(0, 12, T, 4);
    p.ctx.fillStyle = 'rgba(4,2,4,0.25)'; p.ctx.fillRect(0, 9, T, 3);
    for (let m = 0; m < 5; m++) p.px(rng.int(0, 15), rng.int(13, 15), rng.pick([CRUST[1], SOOT[0], BAS[3]]));
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(makeUpper(i)); lower.push(makeLower(i)); }
  return { upper, lower };
}

function forgeTop(seed = 57) {
  const rng = createRng(seed);
  const p = new PixelCanvas(T, T);
  p.rect(0, 0, T, T, '#0e0b0e');
  for (let i = 0; i < 30; i++) {
    const x = rng.int(0, 15), y = rng.int(0, 15);
    p.px(x, y, rng.pick(['#141015', '#09070a', '#19141a', '#110d11']));
    if (rng.chance(0.2)) p.px(x, y + 1, '#060506');
  }
  p.px(rng.int(0, 15), rng.int(0, 15), CRUST[2]);
  return p.canvas;
}

function forgeLiquid(seed = 77) {
  return makeLava({ seed, crust: CRUST, emb: EMB, wall: BAS, grout: FGROUT, cell: 21, open: 0.22 });
}

// ------------------------------------------------------------------ Lava (geteilt mit dem Aschethron)
// Glatte Wertrausch-Funktion in Weltkoordinaten (deterministisch, nahtlos über Zellgrenzen).
export function vnoise(x, y, s, seed) {
  const gx = Math.floor(x / s), gy = Math.floor(y / s), fx = x / s - gx, fy = y / s - gy;
  const a = hash2(gx, gy, seed), b = hash2(gx + 1, gy, seed), c = hash2(gx, gy + 1, seed), d = hash2(gx + 1, gy + 1, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

// Abstand eines Punktes zum Rechteck [x0,x1]×[y0,y1]
const rectDist = (px, py, x0, y0, x1, y1) => Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));
const NB8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]; // N O S W NO SO SW NW

// Lavasee als Feld in Weltkoordinaten statt einer 16er-Kachel: unregelmäßige, verschieden große
// Krustenschollen (gewichtetes Voronoi auf gestreutem Raster mit Verzerrung), dazwischen offene
// Schmelze mit Fließschlieren. Nicht periodisch → kein Wabenraster, kein Wiederholungsmuster;
// jede Zelle wird beim ersten Zeichnen je Frame berechnet und zwischengespeichert.
// Randzellen bekommen einen Uferrand: hinten (Norden) die sichtbare Beckenwand mit Glut von
// unten, seitlich/vorn eine schmale Kruste, dazwischen eine hellglühende Kontaktlinie.
export function makeLava({ seed, crust, emb, wall, grout, cell: GS = 21, open = 0.2, crack = 1, F = 4, face = 5 }) {
  const TAU = Math.PI * 2;
  const site = (i, j, ph) => {
    const a = hash2(i, j, seed + 11) * TAU;
    return [(i + 0.12 + 0.76 * hash2(i, j, seed)) * GS + Math.cos(ph + a) * 0.8, (j + 0.12 + 0.76 * hash2(i, j, seed + 1)) * GS + Math.sin(ph + a) * 0.55,
      0.7 + 0.65 * hash2(i, j, seed + 2), hash2(i, j, seed + 3) < open];
  };
  // Farbe + Glow eines Lavapixels (Weltkoordinaten) im Frame f
  const field = (x, y, f) => {
    const ph = (f / F) * TAU;
    const wx = x + (vnoise(x, y, 11, seed + 20) - 0.5) * 6, wy = y + (vnoise(x, y, 11, seed + 21) - 0.5) * 5;
    const gi = Math.floor(wx / GS), gj = Math.floor(wy / GS);
    let d1 = 1e9, d2 = 1e9, best = null, ddx = 0, ddy = 0, bi = 0, bj = 0;
    for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
      const s = site(i, j, ph);
      const dx = wx + 0.5 - s[0], dy = wy + 0.5 - s[1];
      const d = Math.hypot(dx, dy * 1.2) / s[2];
      if (d < d1) { d2 = d1; d1 = d; best = s; ddx = dx; ddy = dy; bi = i; bj = j; } else if (d < d2) d2 = d;
    }
    const gap = (d2 - d1) * best[2];
    const th = (((x & 1) * 2 + (y & 1) * 3) % 4) / 4 * 0.3;           // geordnetes Dithering
    let col, gl = null;
    if (best[3]) {
      // offene Schmelze: Fließschlieren, am Schollenrand kühler
      const fl = Math.sin(wx * 0.42 + wy * 0.18 + ph + (vnoise(x, y, 9, seed + 40) - 0.5) * 7) * 0.5 + 0.5;
      const v = fl * 1.1 + th + (gap < 1.4 ? 0.8 : 0) + (vnoise(x, y, 6, seed + 41) - 0.5) * 0.6;
      if (v < 0.6) { col = emb[5]; gl = emb[4]; }
      else if (v < 1.45) { col = emb[4]; gl = emb[3]; }
      else { col = emb[3]; gl = emb[2]; }
    } else {
      const pulse = 0.25 * Math.sin(ph + x * 0.35 - y * 0.25);
      const cw = (1.0 + 0.9 * hash2(bi, bj, seed + 7)) * crack;           // Spaltbreite je Scholle
      const v = gap / cw - pulse * 0.4 + th;
      const lit = -(ddx + ddy) / (8 * best[2]);
      if (v < 0.5) { col = emb[5]; gl = emb[4]; }
      else if (v < 0.95) { col = emb[4]; gl = emb[3]; }
      else if (v < 1.35) { col = emb[3]; gl = emb[2]; }
      else if (v < 1.7) { col = emb[2]; gl = emb[1]; }
      else if (v < 2.15) col = crust[4];
      else {
        col = lit > 0.45 ? crust[3] : lit < -0.4 ? crust[0] : crust[1 + (hash2(x, y, seed + 4) < 0.18 ? 1 : 0)];
        if (v > 3 && hash2(x >> 1, y, seed + 5) < 0.05) col = crust[4];          // feine Abkühlrisse
        if (lit > 0.7 && hash2(x, y, seed + 9) < 0.12) col = wall[4];           // Glasglanz
      }
    }
    return [col, gl];
  };
  const base = (cx, cy, f) => {
    const c = new PixelCanvas(T, T), g = new PixelCanvas(T, T);
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
      const [col, gl] = field(cx * T + u, cy * T + v, f);
      c.px(u, v, col); if (gl) g.px(u, v, gl);
    }
    // aufsteigende Blase
    if (hash2(cx, cy, seed + 30) < 0.35) {
      const bx = 3 + Math.floor(hash2(cx, cy, seed + 31) * 10), by = 3 + Math.floor(hash2(cx, cy, seed + 32) * 10);
      const st = (f + Math.floor(hash2(cx, cy, seed + 33) * F)) % F;
      if (st === 0) { c.px(bx, by, emb[5]); g.px(bx, by, emb[5]); }
      else if (st === 1) { c.px(bx - 1, by, emb[4]); c.px(bx + 1, by, emb[4]); c.px(bx, by - 1, emb[5]); g.px(bx, by - 1, emb[5]); }
    }
    return [c, g];
  };
  const frames = [], glow = [];
  for (let f = 0; f < F; f++) { const [c, g] = base(0, 0, f); frames.push(c.canvas); glow.push(g.canvas); }
  const cache = new Map();
  // Rand einer Lavazelle (Maske: Bits 0..7 = Nachbar N,O,S,W,NO,SO,SW,NW ist keine Lava)
  const build = (cx, cy, f, m) => {
    const [c, g] = base(cx, cy, f);
    if (m) {
      const has = (i) => (m >> i) & 1;
      const R = 8;
      for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
        const px = u + 0.5, py = v + 0.5, wx = cx * T + u, wy = cy * T + v;
        let dTop = 99, dO = 99;
        NB8.forEach(([nx, ny], i) => {
          if (!has(i)) return;
          const d = rectDist(px, py, nx * T, ny * T, nx * T + T, ny * T + T);
          if (ny < 0) dTop = Math.min(dTop, d); else dO = Math.min(dO, d);
        });
        // konvexe Beckenecken abrunden
        const corner = (a, b, ox, oy, top) => {
          if (!has(a) || !has(b)) return;
          const qx = Math.abs(px - ox), qy = Math.abs(py - oy);
          if (qx < R && qy < R) { const dc = R - Math.hypot(R - qx, R - qy); if (top) dTop = Math.min(dTop, dc); dO = Math.min(dO, dc); }
        };
        corner(0, 3, 0, 0, true); corner(0, 1, T, 0, true); corner(2, 3, 0, T, false); corner(2, 1, T, T, false);
        const nn = (vnoise(wx, wy, 7, seed) - 0.5) * 3.6 + (vnoise(wx, wy, 3, seed + 1) - 0.5) * 1.2;
        const t = dTop + nn * 0.4, o = dO + nn;
        if (t < face) {
          // Beckenwand (von vorn sichtbar): Quader mit Fugen, unten von der Glut angestrahlt
          let col;
          if (t < 0.9) col = wall[3];
          else if (t > face - 1.3) { col = hash2(wx, wy, 41) < 0.35 ? emb[1] : crust[4]; g.ctx.clearRect(u, v, 1, 1); if (col === emb[1]) g.px(u, v, emb[1]); }
          else {
            const row = Math.floor(wy / 3);
            col = (wx + row * 4) % 7 === 0 ? grout : hash2(wx, wy, 43) < 0.2 ? wall[1] : hash2(wx, wy, 44) < 0.12 ? wall[3] : wall[2];
          }
          c.px(u, v, col);
          if (t <= face - 1.3) g.ctx.clearRect(u, v, 1, 1);
        } else if (o < 1.9) {
          c.px(u, v, o < 0.8 ? crust[1] : hash2(wx, wy, 45) < 0.25 ? crust[3] : crust[2]);
          g.ctx.clearRect(u, v, 1, 1);
        } else if (t < face + 1.1 || o < 2.9) {
          const hot = hash2(wx >> 1, wy >> 1, 47) < 0.7;
          c.px(u, v, hot ? emb[4] : emb[3]); g.ctx.clearRect(u, v, 1, 1); g.px(u, v, hot ? emb[3] : emb[2]);
        }
      }
    }
    return { img: c.canvas, glow: g.canvas };
  };
  const get = (cx, cy, f, m) => {
    const key = `${cx},${cy},${f}`;
    let e = cache.get(key);
    if (!e) { e = build(cx, cy, f, m); cache.set(key, e); }
    return e;
  };
  return {
    frames, glow, edge: null, edgeH: 0,
    tile: (cx, cy, f, m) => get(cx, cy, f, m).img,
    glowTile: (cx, cy, f, m) => get(cx, cy, f, m).glow,
  };
}

// Uferzone auf dem Boden neben Lava: Bordsteinkante aus Stein, angesengter Saum, Schlacke.
// Wird von Dungeon.renderBackground über biome.decorate(ctx, map) aufgerufen.
export function paintLavaShore(ctx, map, { wall, crust, emb, grout, seed = 5 }) {
  const lav = (x, y) => map.isLiquid(x, y);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.wallKind(x, y) !== 'floor') continue;
    const nb = NB8.filter(([nx, ny]) => lav(x + nx, y + ny));
    if (!nb.length) continue;
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
      const px = u + 0.5, py = v + 0.5, wx = x * T + u, wy = y * T + v;
      let d = 99, below = false;
      for (const [nx, ny] of nb) {
        const dd = rectDist(px, py, nx * T, ny * T, nx * T + T, ny * T + T);
        if (dd < d) { d = dd; below = ny > 0; }
      }
      const nn = (vnoise(wx, wy, 4, seed) - 0.5) * 1.6;
      const e = d + nn;
      let col = null;
      if (d < 1) col = below ? wall[5] : wall[1];                      // Kante: vorn Lichtkante, hinten Schatten
      else if (e < 3.4) {
        // Bordsteine entlang des Ufers
        const along = below || Math.abs(nb[0][1]) ? wx : wy;
        col = (along + (below ? 0 : 3)) % 6 === 0 ? grout : e < 1.8 && below ? wall[4] : hash2(wx, wy, 51) < 0.25 ? wall[2] : wall[3];
      } else if (e < 4.4) col = grout;
      else if (e < 9 && hash2(wx, wy, 53) < 0.5 * (1 - (e - 4.4) / 4.6)) col = hash2(wx, wy, 54) < 0.12 ? emb[1] : hash2(wx, wy, 55) < 0.5 ? crust[3] : crust[2];
      if (col) { ctx.fillStyle = col; ctx.fillRect(wx, wy, 1, 1); }
      else if (e < 12) { ctx.fillStyle = `rgba(90,24,8,${(0.22 * (1 - (e - 4.4) / 7.6)).toFixed(3)})`; ctx.fillRect(wx, wy, 1, 1); }
    }
  }
}

// ================================================================== PROPS
// prop(W, H, AX, AY, draw(p, G)) → { sprite, glow?, box?, light? }
// G zeichnet auf die Glow-Ebene in Sprite-Koordinaten (1 px Umrissrand wird ausgeglichen).
function prop(W, H, AX, AY, draw, { glow = false, box, light } = {}) {
  const g = glow ? new PixelCanvas(W + 2, H + 2) : null;
  const G = g ? {
    px: (x, y, c) => g.px(x + 1, y + 1, c),
    rect: (x, y, w, h, c) => g.rect(x + 1, y + 1, w, h, c),
    ellipse: (x, y, rx, ry, c) => g.ellipse(x + 1, y + 1, rx, ry, c),
    line: (x0, y0, x1, y1, c) => g.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, c),
    ctx: g.ctx,
  } : null;
  const sprite = buildFrame(W, H, AX, AY, (p) => draw(p, G));
  const o = { sprite };
  if (g) o.glow = g.canvas;
  if (box) o.box = box;
  if (light) o.light = light;
  return o;
}

// Flammen-Frames (Farbrampe frei wählbar) für animierte Feuer auf Props
function flameFrames(w, h, count, seed, ramp) {
  const rng = createRng(seed);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const p = new PixelCanvas(w, h);
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const sway = Math.sin(f * 1.6 + y * 0.7) * (1 - t) * 1.2;
      const half = Math.max(0, (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) - rng.range(0, 0.6));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - sway) / Math.max(half, 0.01);
        if (d > 1 || half < 0.4) continue;
        const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.12, 0.12);
        const idx = heat > 1.0 ? 6 : heat > 0.84 ? 5 : heat > 0.66 ? 4 : heat > 0.46 ? 3 : 2;
        p.px(x, y, cl(ramp, idx));
      }
    }
    frames.push(p.canvas);
  }
  return frames;
}

// Statische Flamme direkt in Sprite + Glow
function staticFlame(p, G, cx, by, w, h, ramp, seed) {
  const rng = createRng(seed);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const sway = Math.sin(y * 0.8 + seed) * (1 - t) * 1.1;
    const half = (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62);
    for (let x = -Math.ceil(w / 2); x <= Math.ceil(w / 2); x++) {
      const d = Math.abs(x - sway) / Math.max(half, 0.01);
      if (d > 1 || half < 0.4) continue;
      const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.1, 0.1);
      const idx = heat > 1.0 ? 6 : heat > 0.84 ? 5 : heat > 0.66 ? 4 : heat > 0.46 ? 3 : 2;
      p.px(cx + x, by - h + y, cl(ramp, idx));
      if (G) G.px(cx + x, by - h + y, cl(ramp, idx - 1));
    }
  }
}

// ------------------------------------------------------------ Tempel-Props
function templeStatue(v) {
  const W = 24, H = 46, AX = 12, AY = 45;
  return prop(W, H, AX, AY, (p) => {
    const M = MARB, cx = 12;
    // Sockel: zwei Stufen, Oberseite hell, Front mit Wellenrelief
    p.rect(1, 37, 22, 8, M[2]); p.rect(1, 37, 22, 1, M[4]); p.rect(1, 38, 22, 1, M[3]);
    p.rect(1, 38, 1, 7, M[3]); p.rect(22, 38, 1, 7, M[1]); p.rect(2, 44, 20, 1, M[0]);
    for (let x = 3; x < 21; x++) for (let y = 0; y < 5; y++) if (WAVE[y][x & 7] === '#') { p.px(x, 39 + y, M[1]); if (y < 4 && WAVE[y + 1][x & 7] !== '#') p.px(x, 40 + y, M[3]); }
    p.rect(3, 34, 18, 3, M[3]); p.rect(3, 34, 18, 1, M[5]); p.rect(19, 35, 2, 2, M[2]); p.rect(3, 36, 18, 1, M[2]);
    for (const [x, y] of [[2, 43], [3, 42], [4, 44], [20, 43], [21, 42], [13, 44], [2, 42]]) p.px(x, y, y === 42 ? ALG[4] : ALG[3]);
    p.px(17, 41, SHELL[3]); p.px(18, 41, SHELL[1]);
    const shade = (u) => (u < 0.08 ? M[3] : u < 0.3 ? M[5] : u < 0.55 ? M[4] : u < 0.8 ? M[3] : M[2]);
    const row = (y, hw, off = 0) => {
      const x0 = Math.round(cx - hw + off), x1 = Math.round(cx + hw + off - 1);
      for (let x = x0; x <= x1; x++) p.px(x, y, shade((x - x0 + 0.5) / (x1 - x0 + 1)));
      return [x0, x1];
    };
    // Gewand (Taille → Saum), leicht ausgestellt
    for (let y = 20; y <= 35; y++) {
      const t = (y - 20) / 15;
      const hw = 3.5 + t * 3.6 + (y > 33 ? 0.6 : 0);
      const [x0, x1] = row(y, hw);
      // Falten fächern nach unten auf
      if (y > 21) for (const k of [-0.62, -0.2, 0.25, 0.65]) {
        const fx = Math.round(cx + k * hw);
        if (fx > x0 && fx < x1) { p.px(fx, y, k < 0 ? M[3] : M[1]); if (k < 0.5) p.px(fx - 1, y, k < 0 ? M[6] : M[4]); }
      }
      if (y === 35) p.rect(x0, y, x1 - x0 + 1, 1, M[1]);
    }
    // Oberkörper
    for (let y = 13; y < 20; y++) row(y, y < 14 ? 4.6 : y < 17 ? 4 : 3.4);
    p.px(10, 16, M[3]); p.px(14, 16, M[2]); // Brust angedeutet
    // Gürtel aus Grünspan-Bronze mit Anhänger
    for (let x = 8; x <= 15; x++) p.px(x, 19, cylCol(VERD, x - 8, 8, 3));
    p.px(12, 20, VERD[3]); p.px(12, 21, VERD[2]); p.px(12, 22, VERD[2]); p.px(11, 23, VERD[4]); p.px(12, 23, VERD[3]);
    // Algen kriechen am Saum hoch
    for (const [x, y, l] of [[6, 35, 5], [8, 35, 3], [15, 35, 6], [17, 35, 3], [10, 35, 2]]) for (let i = 0; i < l; i++) p.px(x + ((i >> 1) & 1), y - i, i === l - 1 ? ALG[5] : ALG[2 + (i & 1)]);
    // Wasserflecken
    p.px(16, 26, M[2]); p.px(16, 27, M[1]); p.px(9, 29, M[3]);
    if (v === 0) {
      // Schleier fällt über die Schultern
      for (let y = 5; y <= 14; y++) {
        const hw = y < 7 ? 3 : y < 12 ? 3.6 : 4.8;
        const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw - 1);
        for (let x = x0; x <= x1; x++) { const u = (x - x0 + 0.5) / (x1 - x0 + 1); p.px(x, y, u < 0.2 ? M[4] : u < 0.5 ? M[3] : u < 0.8 ? M[2] : M[1]); }
      }
      for (let y = 7; y <= 14; y++) { p.px(8 - (y > 11 ? 1 : 0), y, M[4]); p.px(16 + (y > 11 ? 0 : 0), y, M[1]); }
      // Gesicht
      p.rect(10, 6, 4, 5, M[5]); p.rect(10, 6, 2, 4, M[6]); p.px(13, 9, M[4]); p.px(13, 10, M[3]);
      p.px(10, 8, M[2]); p.px(12, 8, M[2]); p.px(11, 9, M[6]); p.px(11, 10, M[3]);
      p.rect(10, 11, 4, 1, M[3]); // Kinn/Hals
      // Diadem
      for (let x = 9; x <= 14; x++) p.px(x, 5, x < 11 ? VERD[4] : VERD[3]); p.px(11, 4, VERD[5]); p.px(12, 4, VERD[4]);
      // Arme erhoben
      const arm = (sx, sy, ex, ey, hx, hy, lit) => {
        p.line(sx, sy, ex, ey, lit ? M[4] : M[2]); p.line(sx + 1, sy, ex + 1, ey, lit ? M[5] : M[3]);
        p.line(ex, ey, hx, hy, lit ? M[4] : M[2]); p.line(ex + 1, ey, hx + 1, hy, lit ? M[5] : M[3]);
      };
      arm(6, 13, 5, 8, 7, 3, true); arm(16, 13, 18, 8, 16, 3, false);
      p.px(5, 8, M[5]); p.px(19, 8, M[1]);
      // Muschelschale über dem Kopf
      for (let y = 0; y < 4; y++) {
        const hw = 7 - y * 1.1;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw - 1); x++) {
          const rib = Math.floor((x - cx + 20) / 2) & 1;
          p.px(x, y, y === 0 ? SHELL[5] : y === 3 ? SHELL[1] : rib ? SHELL[3] : SHELL[4]);
        }
      }
      p.px(5, 0, SHELL[4]); p.px(18, 0, SHELL[3]);
    } else {
      // Kopf und rechter Arm abgebrochen
      for (let y = 11; y <= 14; y++) row(y, y < 13 ? 3.8 : 4.8); // Schleierreste auf den Schultern
      p.rect(10, 10, 4, 2, M[4]); p.px(10, 10, M[6]); p.px(11, 10, M[5]); p.px(12, 9, M[5]); p.px(13, 10, M[3]); // Halsstumpf, frische Bruchfläche
      p.px(11, 11, M[2]);
      // linker Arm hängt herab
      p.line(7, 13, 6, 21, M[4]); p.line(8, 13, 7, 21, M[5]); p.px(6, 22, M[4]); p.px(7, 22, M[3]);
      // Armstumpf rechts mit Bruch
      p.rect(16, 13, 2, 2, M[3]); p.px(17, 13, M[6]); p.px(17, 14, M[1]);
      // Riss quer durchs Gewand
      for (const [x, y] of [[13, 21], [14, 22], [14, 23], [15, 24], [15, 25], [16, 26], [16, 27]]) { p.px(x, y, M[0]); p.px(x - 1, y, M[5]); }
      // Abgebrochener Kopf liegt auf der Sockelstufe
      p.ellipse(19, 34, 2.6, 2.1, M[3]); p.ellipse(18.4, 33.5, 1.6, 1.3, M[5]);
      p.px(18, 34, M[2]); p.px(20, 34, M[2]); p.px(19, 35, M[3]); p.px(21, 35, M[1]);
      p.px(16, 35, VERD[3]); p.px(17, 35, VERD[4]);
      p.px(21, 33, ALG[3]); p.px(22, 34, ALG[2]);
    }
  }, { box: [-10, -6, 10, 1] });
}

function templePillar(broken) {
  const W = 18, H = 48, AX = 9, AY = 46;
  return prop(W, H, AX, AY, (p) => {
    // Basis
    p.rect(0, 40, 18, 7, TST[2]); p.rect(0, 40, 18, 1, TST[5]); p.rect(0, 41, 18, 1, TST[4]);
    p.rect(0, 42, 2, 5, TST[3]); p.rect(16, 42, 2, 5, TST[1]); p.rect(1, 46, 16, 1, TST[0]);
    p.rect(1, 37, 16, 3, TST[3]); p.rect(1, 37, 16, 1, TST[5]); p.rect(15, 38, 2, 2, TST[2]);
    const top = broken ? 20 : 8;
    // Schaft: Trommeln mit Kanneluren
    for (let x = 0; x < 12; x++) {
      const c = cylCol(TST, x, 12, 4);
      p.rect(3 + x, top, 1, 37 - top, c);
      if (x > 1 && x < 11 && x % 2 === 0) p.rect(3 + x, top, 1, 37 - top, cl(TST, (x < 5 ? 4 : 2)));
    }
    for (const y of [16, 25, 33]) if (y > top + 1) { p.rect(3, y, 12, 1, TST[1]); p.rect(3, y + 1, 12, 1, TST[4]); }
    // Grünspan-Bronzereif
    const ringY = broken ? 28 : 22;
    for (let x = 0; x < 13; x++) { p.px(2 + x, ringY, cylCol(VERD, x, 13, 3)); p.px(2 + x, ringY + 1, cylCol(VERD, x, 13, 2)); }
    p.px(5, ringY, VERD[5]); p.px(9, ringY + 2, 'rgba(40,120,100,0.6)'); p.px(9, ringY + 3, 'rgba(40,120,100,0.35)');
    // Algen vom Fuß her
    for (const [x, h] of [[3, 7], [4, 4], [6, 5], [11, 3], [13, 6], [14, 9]]) {
      for (let i = 0; i < h; i++) p.px(x + ((i >> 1) & 1), 38 - i, i === h - 1 ? ALG[5] : ALG[2 + (i & 1)]);
    }
    for (const [x, y] of [[5, 32], [12, 29], [8, 35], [10, 34]]) { p.px(x, y, SHELL[4]); p.px(x + 1, y, SHELL[2]); }
    if (!broken) {
      // Kapitell mit Voluten
      p.rect(0, 0, 18, 8, TST[3]);
      p.rect(0, 0, 18, 1, TST[6]); p.rect(0, 1, 18, 1, TST[4]);
      p.rect(1, 5, 16, 1, TST[1]); p.rect(2, 6, 14, 2, TST[2]); p.rect(2, 7, 14, 1, TST[1]);
      for (const cx of [2, 15]) { p.ellipse(cx, 3.5, 1.6, 1.6, TST[2]); p.px(cx, 3, TST[5]); p.px(cx + 1, 4, TST[1]); }
      // Tang hängt vom Kapitell
      for (const [x, l] of [[4, 6], [7, 3], [12, 8], [13, 4]]) for (let i = 0; i < l; i++) p.px(x + ((i >> 2) & 1), 7 + i, i === l - 1 ? ALG[4] : ALG[2 + ((i + x) & 1)]);
    } else {
      // Bruchkante, gezackt, mit heller Bruchfläche
      const jag = [0, 1, 3, 2, 0, 1, 2, 4, 3, 1, 2, 0];
      for (let x = 0; x < 12; x++) {
        p.rect(3 + x, top - jag[x], 1, jag[x] + 1, cylCol(TST, x, 12, 4));
        p.px(3 + x, top - jag[x], TST[6]);
        if (jag[x] > 1) p.px(3 + x, top - jag[x] + 1, TST[5]);
      }
      // Abgestürzte Trommel am Fuß
      p.ellipse(15, 44, 3, 2, TST[3]); p.px(14, 43, TST[5]); p.px(17, 45, TST[1]);
      p.rect(0, 45, 3, 2, TST[2]); p.px(0, 45, TST[4]);
    }
  }, { box: [-7, -5, 7, 1] });
}

function templeCoral(v) {
  const W = 18, H = 18, AX = 9, AY = 17;
  return prop(W, H, AX, AY, (p) => {
    // Kleiner Felsen als Fuß
    p.ellipse(9, 15.5, 6, 2, TST[2]); p.ellipse(8, 15, 4, 1.2, TST[4]); p.px(5, 15, TST[5]); p.px(13, 16, TST[1]);
    if (v === 0) {
      // Rote Astkoralle
      const rng = createRng(301);
      const branch = (x, y, a, len, depth) => {
        let cx = x, cy = y;
        for (let i = 0; i < len; i++) {
          const nx = cx + Math.cos(a), ny = cy + Math.sin(a);
          p.px(Math.round(nx), Math.round(ny), Math.cos(a) < -0.1 ? CORAL[4] : CORAL[3]);
          p.px(Math.round(nx) + 1, Math.round(ny), CORAL[2]);
          cx = nx; cy = ny;
        }
        p.px(Math.round(cx), Math.round(cy) - 1, CORAL[5]);
        if (depth > 0) { branch(cx, cy, a - 0.55 + rng.range(-0.1, 0.1), len * 0.7, depth - 1); branch(cx, cy, a + 0.5, len * 0.65, depth - 1); }
      };
      branch(9, 15, -Math.PI / 2, 5, 2);
      branch(7, 15, -Math.PI / 2 - 0.6, 3, 1);
    } else if (v === 1) {
      // Violette Fächerkoralle: flach verzweigter Fächer, Lücken bleiben offen
      const rng = createRng(311);
      const twig = (x, y, a, len, depth) => {
        let cx = x, cy = y;
        for (let i = 0; i < len; i++) {
          cx += Math.cos(a); cy += Math.sin(a) * 0.9;
          p.px(Math.round(cx), Math.round(cy), Math.cos(a) < 0 ? FAN[4] : FAN[3]);
        }
        p.px(Math.round(cx), Math.round(cy), FAN[5]);
        if (depth > 0) { twig(cx, cy, a - 0.45 + rng.range(-0.1, 0.1), len * 0.72, depth - 1); twig(cx, cy, a + 0.45 + rng.range(-0.1, 0.1), len * 0.72, depth - 1); }
      };
      twig(9, 15, -Math.PI / 2 - 0.55, 4, 3); twig(9, 15, -Math.PI / 2 + 0.55, 4, 3); twig(9, 15, -Math.PI / 2, 5, 2);
      p.rect(8, 13, 2, 3, FAN[2]); p.px(8, 13, FAN[3]);
    } else {
      // Röhrenkoralle: Röhren mit dunklen Öffnungen
      const tubes = [[3, 7, 3], [6, 3, 4], [10, 6, 3], [13, 9, 3]];
      for (const [x, top, w] of tubes) {
        for (let i = 0; i < w; i++) p.rect(x + i, top + 1, 1, 15 - top, cylCol(CORAL, i, w, 3));
        p.rect(x, top, w, 2, CORAL[5]); p.rect(x + 1, top, w - 2, 1, '#1a0610'); p.px(x + w - 1, top + 1, CORAL[3]);
        for (let y = top + 4; y < 14; y += 3) { p.px(x, y, CORAL[2]); p.px(x + w - 1, y, CORAL[1]); }
      }
      // Seeanemone vorne rechts
      for (let i = -2; i <= 2; i++) p.line(14, 15, 14 + i * 1.3, 12 - (2 - Math.abs(i)) * 0.7, i < 0 ? VERD[5] : VERD[4]);
      p.px(14, 14, VERD[3]);
    }
  });
}

function templeSeaweed(v) {
  const KELP = ['#18170c', '#262512', '#3a381a', '#524e24', '#6c6630', '#87803e'];
  const ramp = v === 2 ? KELP : ALG;
  const H = [18, 13, 24][v], W = 14, AX = 7, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    const rng = createRng(400 + v);
    const blades = [3, 3, 3][v];
    for (let b = 0; b < blades; b++) {
      const bx = 4 + b * 3 + rng.range(-0.5, 0.5);
      const len = H - 1 - rng.int(0, v === 1 ? 3 : 6);
      const phase = rng.range(0, 6), amp = rng.range(1, 2.2), lean = rng.range(-2, 2);
      const maxW = v === 1 ? 1.4 : v === 2 ? 3 : 2.2;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const x = bx + Math.sin(t * 4.5 + phase) * amp * t + lean * t;
        const w = 0.6 + maxW * Math.sin(Math.PI * Math.min(1, t * 1.15));
        const y = H - 1 - i;
        const x0 = Math.round(x - w / 2), x1 = Math.max(x0, Math.round(x + w / 2) - 1);
        const facing = Math.cos(t * 4.5 + phase) > 0; // Blatt dreht sich zum Licht
        for (let xx = x0; xx <= x1; xx++) {
          const u = x1 === x0 ? 0.5 : (xx - x0) / (x1 - x0);
          p.px(xx, y, u < 0.34 ? ramp[facing ? 4 : 3] : u > 0.66 ? ramp[facing ? 2 : 1] : ramp[facing ? 3 : 2]);
        }
        if (i === len - 1) p.px(Math.round(x), y, ramp[5]);
        if (v === 2 && x1 - x0 >= 2 && i % 2) p.px(Math.round(x), y, ramp[facing ? 5 : 3]); // Mittelrippe
        if (v === 1 && i % 4 === 2) { p.px(x0 - 1, y, ramp[5]); p.px(x0 - 1, y + 1, ramp[3]); p.px(x1 + 1, y - 1, ramp[4]); } // Schwimmblasen
      }
    }
    p.rect(3, H - 1, 8, 1, ramp[1]); p.px(2, H - 1, TST[3]); p.px(11, H - 1, TST[2]);
  });
}

function templeShells(v) {
  const W = 14, H = 9, AX = 7, AY = 8;
  return prop(W, H, AX, AY, (p) => {
    if (v === 0) {
      // Jakobsmuschel + kleine Schnecke
      for (let y = 0; y < 5; y++) {
        const hw = 1 + y * 0.9;
        for (let x = Math.round(5 - hw); x <= Math.round(5 + hw); x++) {
          const rib = (x - 5 + 10) % 2;
          p.px(x, 2 + y, y === 0 ? SHELL[5] : rib ? SHELL[3] : SHELL[4]);
        }
      }
      p.rect(3, 7, 5, 1, SHELL[2]); p.px(1, 6, SHELL[2]); p.px(9, 6, SHELL[1]);
      p.ellipse(11, 6.5, 1.6, 1.2, CORAL[4]); p.px(10, 6, CORAL[5]); p.px(12, 7, CORAL[2]); p.px(12, 5, CORAL[3]);
    } else if (v === 1) {
      // Seestern
      const cx = 6, cy = 5;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
        p.line(cx, cy, cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 3, a > -Math.PI / 2 && a < Math.PI / 2 ? CORAL[3] : CORAL[4]);
      }
      p.px(cx, cy, CORAL[5]); p.px(cx - 1, cy - 1, CORAL[5]);
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * Math.PI * 2; p.px(cx + Math.cos(a) * 2, cy + Math.sin(a) * 1.4, CORAL[5]); }
      p.px(11, 6, SHELL[3]); p.px(12, 6, SHELL[2]); p.px(11, 7, SHELL[1]);
    } else {
      // Seeigel mit Stacheln + zwei Miesmuscheln
      const ux = 5, uy = 5;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p.line(ux, uy, ux + Math.cos(a) * 4, uy + Math.sin(a) * 3.2, k > 5 && k < 10 ? FAN[3] : FAN[1]); }
      p.ellipse(ux, uy, 2.4, 2, FAN[2]); p.px(ux - 1, uy - 1, FAN[4]); p.px(ux, uy - 1, FAN[3]); p.px(ux + 1, uy + 1, FAN[0]);
      for (const [x, y] of [[10, 6], [12, 7]]) {
        p.ellipse(x, y, 1.8, 1, '#1c2032'); p.px(x - 1, y - 1, '#6a7898'); p.px(x, y - 1, '#3e4866'); p.px(x + 1, y, '#101422');
      }
      p.px(8, 8, ALG[3]); p.px(13, 8, ALG[2]);
    }
  });
}

function templeBrazier() {
  const W = 20, H = 32, AX = 10, AY = 31;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Dreibein aus Grünspan-Bronze: gerade Beine, Querring, Klauenfüße
    p.line(4, 20, 2, 30, VERD[3]); p.line(5, 20, 3, 30, VERD[2]);
    p.line(15, 20, 17, 30, VERD[2]); p.line(14, 20, 16, 30, VERD[1]);
    p.rect(9, 20, 2, 10, VERD[2]); p.px(9, 21, VERD[4]); p.rect(10, 21, 1, 9, VERD[1]);
    p.rect(3, 25, 14, 1, VERD[3]); p.px(3, 25, VERD[5]); p.rect(3, 26, 14, 1, VERD[1]);
    for (const x of [1, 9, 16]) { p.rect(x, 30, 3, 1, VERD[3]); p.px(x, 30, VERD[4]); }
    // Schale in Muschelform
    for (let y = 0; y < 7; y++) {
      const hw = 8.5 - y * 0.9;
      const x0 = Math.round(10 - hw), x1 = Math.round(10 + hw) - 1;
      for (let x = x0; x <= x1; x++) {
        const rib = ((x - x0) >> 1) & 1;
        p.px(x, 13 + y, cylCol(VERD, x - x0, x1 - x0 + 1, rib ? 3 : 2));
      }
    }
    for (let x = 2; x < 18; x++) p.px(x, 13, (x & 1) ? VERD[5] : VERD[4]);
    p.px(5, 16, BRZ[4]); p.px(9, 17, BRZ[3]); p.px(13, 15, BRZ[3]);   // Bronze scheint durch
    p.rect(7, 19, 6, 1, VERD[0]);
    // Glut
    p.rect(3, 11, 14, 2, TFIRE[1]); p.rect(5, 11, 10, 1, TFIRE[2]);
    p.px(6, 11, TFIRE[4]); p.px(10, 12, TFIRE[5]); p.px(13, 11, TFIRE[4]);
    staticFlame(p, G, 10, 12, 9, 12, TFIRE, 3);
    // Widerschein auf der Schale
    p.px(7, 14, TFIRE[3]); p.px(12, 14, TFIRE[3]); p.px(4, 14, TFIRE[2]);
    G.rect(3, 11, 14, 2, TFIRE[2]); G.px(10, 12, TFIRE[5]);
    G.px(7, 14, TFIRE[2]); G.px(12, 14, TFIRE[2]);
  }, { glow: true, box: [-5, -3, 5, 1], light: { dx: 0, dy: -20, radius: 78, color: [70, 225, 205], intensity: 1.0 } });
  o.flames = flameFrames(9, 12, 6, 17, TFIRE);
  o.flameAt = { dx: -4, dy: -31 };
  return o;
}

function templeAltar() {
  const W = 30, H = 28, AX = 15, AY = 27;
  return prop(W, H, AX, AY, (p, G) => {
    const oy = 2;
    // Altarblock: Deckplatte + Front mit Wellenfries
    p.rect(2, 13 + oy, 26, 12, TST[2]); p.rect(2, 24 + oy, 26, 1, TST[0]);
    p.rect(2, 13 + oy, 1, 12, TST[4]); p.rect(27, 13 + oy, 1, 12, TST[1]);
    for (let x = 4; x < 26; x++) for (let y = 0; y < 5; y++) if (WAVE[y][x & 7] === '#') { p.px(x, 16 + oy + y, TST[1]); if (y < 4 && WAVE[y + 1][x & 7] !== '#') p.px(x, 17 + oy + y, TST[4]); }
    p.rect(3, 22 + oy, 24, 1, TST[3]);
    p.rect(0, 9 + oy, 30, 4, TST[4]); p.rect(0, 9 + oy, 30, 1, TST[6]); p.rect(0, 12 + oy, 30, 1, TST[2]); p.rect(28, 10 + oy, 2, 2, TST[3]);
    for (const x of [3, 25]) { p.rect(x, 14 + oy, 2, 8, VERD[3]); p.px(x, 14 + oy, VERD[5]); p.px(x + 1, 21 + oy, VERD[1]); }
    p.px(2, 24 + oy, ALG[3]); p.px(3, 23 + oy, ALG[4]); p.px(27, 23 + oy, ALG[3]); p.px(26, 24 + oy, ALG[2]);
    p.px(3, 10 + oy, SHELL[4]); p.px(4, 10 + oy, SHELL[2]); p.px(26, 10 + oy, CORAL[4]); p.px(27, 10 + oy, CORAL[2]);
    // Aufgeklappte Oberschale: Fächer mit Rippen hinter der Perle
    const hx = 15, hy = 10;
    for (let y = hy - 9; y <= hy; y++) for (let x = hx - 10; x <= hx + 10; x++) {
      const dx = x - hx, dy = (y - hy) * 1.15, r = Math.hypot(dx, dy);
      if (r > 9.5 || y > hy - 1) continue;
      const a = Math.atan2(dy, dx); // −π..0
      const rib = Math.floor((a + Math.PI) * 5) & 1;
      const edge = r > 8.6;
      p.px(x, y, edge ? (dx < 2 ? SHELL[5] : SHELL[3]) : r < 3 ? SHELL[1] : rib ? SHELL[2] : (dx < 0 ? SHELL[4] : SHELL[3]));
    }
    // Untere Schale mit Perlmuttinnenseite
    p.ellipse(hx, hy + 1, 8, 2.4, SHELL[3]); p.ellipse(hx, hy + 0.5, 6.5, 1.5, '#b4aec8'); p.px(hx - 5, hy, '#e2def2'); p.px(hx + 5, hy + 1, '#8a88a0');
    for (let x = hx - 7; x <= hx + 7; x += 2) p.px(x, hy + 3, SHELL[2]);
    // Die Perle
    p.ellipse(hx, hy - 1, 2.6, 2.6, PEARL[2]); p.ellipse(hx - 0.4, hy - 1.4, 1.6, 1.6, PEARL[3]); p.px(hx - 1, hy - 2, PEARL[4]); p.px(hx + 1, hy, PEARL[1]); p.px(hx + 2, hy - 1, PEARL[1]);
    G.ellipse(hx, hy - 1, 5, 4, '#10303a'); G.ellipse(hx, hy - 1, 3, 3, '#3a7a8c'); G.ellipse(hx - 0.4, hy - 1.4, 1.6, 1.6, '#a8e8f4'); G.px(hx - 1, hy - 2, '#e4ffff');
    G.ellipse(hx, hy + 1, 6, 1.5, '#0c2228');
  }, { glow: true, box: [-14, -6, 14, 1], light: { dx: 0, dy: -18, radius: 56, color: [140, 225, 255], intensity: 0.85 } });
}

function templeUrn(v) {
  const W = 16, H = v ? 16 : 20, AX = 8, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    const cx = 8;
    if (v === 0) {
      // Amphore mit Grünspan-Bändern
      const prof = [2, 2, 1.5, 1.5, 2.5, 3.5, 4.5, 5, 5.5, 5.5, 5.5, 5, 5, 4.5, 4, 3.5, 3, 2.2, 1.8, 2.5];
      for (let y = 0; y < prof.length; y++) {
        const hw = prof[y], x0 = Math.round(cx - hw), x1 = Math.round(cx + hw) - 1;
        for (let x = x0; x <= x1; x++) p.px(x, y, cylCol(TSW, x - x0, x1 - x0 + 1, 3));
      }
      p.rect(6, 0, 4, 1, TSW[5]); p.px(7, 0, TSW[0]); p.px(8, 0, TSW[0]);
      p.px(4, 2, TSW[4]); p.px(3, 3, TSW[4]); p.px(3, 4, TSW[3]); p.px(4, 5, TSW[3]);
      p.px(11, 2, TSW[3]); p.px(12, 3, TSW[2]); p.px(12, 4, TSW[2]); p.px(11, 5, TSW[2]);
      for (const y of [7, 12]) { const hw = prof[y], x0 = Math.round(cx - hw), x1 = Math.round(cx + hw) - 1; for (let x = x0; x <= x1; x++) p.px(x, y, cylCol(VERD, x - x0, x1 - x0 + 1, 3)); }
      // Wellenmuster zwischen den Bändern
      for (let x = 4; x < 12; x++) if (WAVE[2][x & 7] === '#' || WAVE[3][x & 7] === '#') p.px(x, 9 + (WAVE[2][x & 7] === '#' ? 0 : 1), TSW[1]);
      p.px(10, 10, SHELL[4]); p.px(11, 11, SHELL[2]);
      p.px(4, 17, ALG[3]); p.px(5, 18, ALG[2]); p.px(11, 16, ALG[4]); p.px(10, 17, ALG[2]);
    } else {
      // Gedrungenes Vorratsgefäß, rechts oben ausgebrochen
      const prof = [4, 4.5, 5.5, 6, 6.2, 6.2, 6.2, 6, 5.8, 5.5, 5, 4.5, 4, 3.5, 3, 3];
      for (let y = 0; y < prof.length; y++) {
        const hw = prof[y], x0 = Math.round(cx - hw), x1 = Math.round(cx + hw) - 1;
        for (let x = x0; x <= x1; x++) p.px(x, y, cylCol(TST, x - x0, x1 - x0 + 1, 4));
      }
      p.rect(4, 0, 8, 1, TST[6]); p.rect(5, 1, 6, 1, '#050a0b');
      // Ausbruch: Loch in der Schulter zeigt das dunkle Innere
      const hole = [[9, 2, 4], [9, 3, 5], [10, 4, 4], [11, 5, 3], [12, 6, 1]];
      for (const [x, y, w] of hole) { p.rect(x, y, w, 1, '#050a0b'); p.px(x, y, TST[6]); }
      p.ctx.clearRect(12, 0, 4, 3); p.ctx.clearRect(13, 3, 3, 1);
      p.px(11, 1, TST[6]); p.px(12, 3, TST[5]);
      for (let x = 2; x < 14; x++) if (x < 10) p.px(x, 7, x % 2 ? VERD[3] : VERD[4]);
      for (const [x, y] of [[4, 10], [6, 12], [10, 11], [3, 13]]) { p.px(x, y, SHELL[4]); p.px(x + 1, y + 1, SHELL[1]); }
      p.px(4, 14, ALG[3]); p.px(11, 13, ALG[4]); p.px(10, 14, ALG[2]);
      // Scherbe am Boden
      p.rect(13, 14, 3, 1, TST[4]); p.px(14, 13, TST[5]); p.px(15, 15, TST[1]);
    }
  }, { box: [-4, -3, 4, 1] });
}

function templeBones(v) {
  const W = 18, H = 11, AX = 9, AY = 10;
  return prop(W, H, AX, AY, (p) => {
    const rng = createRng(500 + v);
    const Bg = ['#3a3a2c', '#6c7058', '#9aa084', '#c2c6a8'];
    for (let i = 0; i < 5; i++) {
      const x = rng.int(1, 12), y = rng.int(6, 9);
      const x1 = x + rng.int(3, 5), y1 = y + rng.int(-1, 1);
      p.line(x, y, x1, y1, Bg[2]); p.px(x, y, Bg[3]); p.px(x1, y1, Bg[1]);
    }
    if (v === 0) {
      const sx = 8;
      p.rect(sx, 3, 5, 4, Bg[2]); p.rect(sx + 1, 2, 3, 1, Bg[3]); p.px(sx + 1, 3, Bg[3]);
      p.px(sx + 1, 4, '#0a1210'); p.px(sx + 3, 4, '#0a1210'); p.px(sx + 2, 6, '#0a1210'); p.rect(sx + 4, 4, 1, 3, Bg[1]);
      for (let i = 0; i < 5; i++) p.px(sx + 4 + (i >> 1), 2 + i, i ? ALG[3] : ALG[4]);
      p.px(3, 9, SHELL[3]); p.px(4, 9, SHELL[1]);
    } else {
      // Korinthischer Grünspan-Helm eines ertrunkenen Wächters
      const hx = 9;
      p.ellipse(hx, 5, 4.2, 4, VERD[2]);
      p.ellipse(hx - 1, 4, 2.6, 2.4, VERD[3]); p.px(hx - 2, 2, VERD[5]); p.px(hx - 3, 3, VERD[4]);
      p.rect(hx - 4, 6, 9, 3, VERD[2]); p.rect(hx - 4, 6, 2, 3, VERD[3]); p.rect(hx + 3, 6, 2, 3, VERD[1]);
      // T-Sehschlitz
      p.rect(hx - 3, 5, 7, 1, '#06100e'); p.rect(hx, 5, 1, 4, '#06100e'); p.px(hx - 3, 4, VERD[4]);
      // Kamm
      for (let x = hx - 4; x <= hx + 3; x++) p.px(x, 1 - (x > hx - 2 && x < hx + 2 ? 1 : 0) + 1, x < hx ? BRZ[4] : BRZ[3]);
      p.px(hx - 4, 1, BRZ[5]);
      p.px(hx + 4, 8, BRZ[3]);
      p.px(3, 9, ALG[3]); p.px(15, 9, ALG[4]); p.px(16, 8, ALG[2]); p.px(4, 8, ALG[2]);
    }
  });
}

// ------------------------------------------------------------ Schmiede-Props
function forgeAnvil() {
  const W = 24, H = 18, AX = 12, AY = 17;
  return prop(W, H, AX, AY, (p, G) => {
    // Holzklotz mit Eisenreif
    p.rect(6, 10, 12, 7, WOOD[2]); p.rect(6, 10, 2, 7, WOOD[4]); p.rect(16, 10, 2, 7, WOOD[1]);
    for (let x = 8; x < 16; x += 3) p.rect(x, 11, 1, 5, WOOD[1]);
    p.rect(6, 13, 12, 1, IRON[3]); p.px(7, 13, IRON[5]);
    p.rect(5, 16, 14, 1, WOOD[0]);
    // Amboss: Horn links, Bahn oben, Taille, Fuß
    p.rect(8, 7, 8, 3, IRON[2]); p.rect(8, 7, 1, 3, IRON[3]); p.rect(15, 7, 1, 3, IRON[1]);
    p.rect(6, 9, 12, 2, IRON[3]); p.rect(6, 9, 12, 1, IRON[4]); p.rect(17, 9, 1, 2, IRON[1]);
    p.rect(4, 2, 17, 5, IRON[3]);
    p.rect(4, 2, 17, 1, IRON[6]); p.rect(4, 3, 17, 1, IRON[5]); p.rect(4, 6, 17, 1, IRON[1]);
    p.rect(19, 3, 2, 3, IRON[2]); // Stirn
    // Horn verjüngt sich nach links
    p.rect(1, 3, 3, 2, IRON[3]); p.px(0, 4, IRON[3]); p.rect(1, 3, 3, 1, IRON[5]); p.px(1, 5, IRON[2]); p.px(2, 5, IRON[2]);
    p.px(16, 3, IRON[1]); p.px(17, 3, IRON[1]); // Hardy-Loch
    // Heißes Werkstück auf der Bahn
    p.rect(9, 1, 6, 1, EMB[3]); p.px(9, 1, EMB[4]); p.px(12, 1, EMB[5]); p.px(14, 1, EMB[2]);
    G.rect(9, 1, 6, 1, EMB[3]); G.px(12, 1, EMB[5]); G.rect(8, 2, 8, 1, EMB[1]);
    // Hammer lehnt am Klotz
    p.line(19, 16, 22, 9, WOOD[4]); p.line(20, 16, 23, 9, WOOD[2]);
    p.rect(20, 7, 4, 3, IRON[3]); p.rect(20, 7, 4, 1, IRON[5]); p.px(23, 9, IRON[1]);
  }, { glow: true, box: [-9, -4, 9, 1], light: { dx: 0, dy: -16, radius: 24, color: [255, 130, 50], intensity: 0.45 } });
}

function forgePillar() {
  const W = 18, H = 48, AX = 9, AY = 46;
  return prop(W, H, AX, AY, (p) => {
    // Basaltsockel mit Messingring
    p.rect(0, 41, 18, 6, BAS[3]); p.rect(0, 41, 18, 1, BAS[6]); p.rect(0, 42, 18, 1, BAS[5]);
    p.rect(0, 43, 2, 4, BAS[4]); p.rect(16, 43, 2, 4, BAS[1]); p.rect(1, 46, 16, 1, BAS[0]);
    for (let x = 0; x < 16; x++) { p.px(1 + x, 39, cylCol(BRASS, x, 16, 4)); p.px(1 + x, 40, cylCol(BRASS, x, 16, 2)); }
    // Sechskantiger Basaltschaft (Säulenbasalt): drei Facetten
    for (let y = 8; y < 39; y++) {
      p.rect(2, y, 4, 1, BAS[5]); p.rect(6, y, 6, 1, BAS[3]); p.rect(12, y, 4, 1, BAS[1]);
      p.px(6, y, BAS[6]); p.px(12, y, BAS[2]);
    }
    for (const [x, y] of [[4, 13], [8, 18], [9, 19], [13, 26], [7, 31], [4, 36]]) p.px(x, y, BAS[0]);
    p.px(3, 20, BAS[6]); p.px(9, 29, BAS[4]); p.px(3, 29, BAS[6]);
    // Eisenbänder mit Nieten
    for (const y of [12, 23, 33]) {
      for (let x = 0; x < 16; x++) { p.px(1 + x, y, cylCol(IRON, x, 16, 4)); p.px(1 + x, y + 1, cylCol(IRON, x, 16, 3)); p.px(1 + x, y + 2, cylCol(IRON, x, 16, 2)); }
      for (const x of [3, 8, 13]) { p.px(x, y + 1, IRON[6]); p.px(x + 1, y + 2, IRON[0]); }
      p.px(11, y + 3, RUST[2]); p.px(11, y + 4, RUST[1]);
    }
    // Kapitell: Messing-Abakus, Basaltblock, Messingkragen mit Nieten
    for (let x = 0; x < 18; x++) { p.px(x, 0, cylCol(BRASS, x, 18, 5)); p.px(x, 1, cylCol(BRASS, x, 18, 3)); }
    p.px(2, 0, BRASS[6]); p.rect(0, 2, 18, 1, BRASS[0]);
    p.rect(1, 3, 16, 2, BAS[4]); p.rect(1, 3, 16, 1, BAS[6]); p.rect(14, 3, 3, 2, BAS[2]);
    for (let x = 0; x < 16; x++) { p.px(1 + x, 5, cylCol(BRASS, x, 16, 4)); p.px(1 + x, 6, cylCol(BRASS, x, 16, 2)); }
    for (const x of [3, 7, 11, 15]) p.px(x, 5, BRASS[6]);
    p.rect(2, 7, 14, 1, BAS[1]);
    // Ruß über den Bändern
    p.px(8, 8, SOOT[1]); p.px(12, 9, SOOT[1]); p.px(7, 15, SOOT[2]);
  }, { box: [-7, -5, 7, 1] });
}

function forgeChains(v) {
  const W = 12, H = v ? 34 : 28, AX = 6, AY = H - 1;
  return prop(W, H, AX, AY, (p) => {
    const chain = (x, y0, y1, ramp) => {
      for (let y = y0; y < y1; y += 3) {
        const side = ((y - y0) / 3) & 1;
        if (side) { p.rect(x, y, 1, 3, ramp[3]); p.px(x, y, ramp[5]); p.px(x, y + 2, ramp[1]); }
        else { p.rect(x - 1, y, 3, 3, ramp[3]); p.px(x, y + 1, '#07060a'); p.px(x - 1, y, ramp[5]); p.px(x + 1, y + 2, ramp[1]); p.px(x + 1, y + 1, ramp[2]); }
      }
    };
    if (v === 0) {
      chain(6, 0, H - 7, IRON);
      // Lasthaken
      p.rect(5, H - 7, 3, 2, IRON[4]); p.px(5, H - 7, IRON[6]);
      p.rect(6, H - 5, 1, 3, IRON[4]); p.rect(3, H - 2, 4, 1, IRON[3]); p.px(3, H - 3, IRON[4]); p.px(3, H - 4, IRON[5]);
      p.px(6, H - 1, IRON[1]);
    } else {
      chain(3, 0, H - 9, IRON);
      chain(9, 0, H - 5, IRON);
      // Fessel / Schäkel aus Messing
      p.rect(2, H - 9, 3, 1, BRASS[4]); p.px(1, H - 8, BRASS[3]); p.px(1, H - 7, BRASS[2]); p.px(5, H - 8, BRASS[2]); p.px(5, H - 7, BRASS[1]); p.rect(2, H - 6, 3, 1, BRASS[1]);
      p.rect(7, H - 5, 5, 4, IRON[3]); p.rect(7, H - 5, 5, 1, IRON[5]); p.rect(8, H - 4, 3, 2, '#07060a'); p.px(11, H - 2, IRON[1]); p.rect(7, H - 1, 5, 1, IRON[2]);
    }
  });
}

function forgeCrucible() {
  const W = 28, H = 30, AX = 14, AY = 29;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Steinherd mit Feueröffnung
    p.rect(2, 18, 24, 11, BAS[3]); p.rect(2, 18, 24, 1, BAS[5]); p.rect(2, 18, 1, 11, BAS[5]); p.rect(25, 18, 1, 11, BAS[1]); p.rect(3, 28, 22, 1, BAS[0]);
    for (let x = 3; x < 25; x += 5) { p.rect(x, 22, 1, 6, FGROUT); p.px(x + 1, 22, BAS[4]); }
    p.rect(2, 22, 24, 1, FGROUT);
    // Feuerloch
    p.rect(9, 23, 10, 5, CRUST[1]); p.rect(10, 24, 8, 4, EMB[2]); p.rect(11, 25, 6, 3, EMB[3]); p.px(13, 26, EMB[5]); p.px(15, 27, EMB[4]); p.px(12, 27, EMB[4]);
    p.rect(9, 23, 10, 1, IRON[4]); p.px(9, 23, IRON[6]);
    G.rect(10, 24, 8, 4, EMB[2]); G.rect(11, 25, 6, 3, EMB[3]); G.px(13, 26, EMB[5]);
    // Tiegel: dicker Eisenkessel, gerundet
    for (let y = 0; y < 12; y++) {
      const hw = y < 9 ? 10 : 10 - (y - 8) * 1.5;
      const x0 = Math.round(14 - hw), x1 = Math.round(14 + hw);
      for (let x = x0; x <= x1; x++) p.px(x, 7 + y, cylCol(IRON, x - x0, x1 - x0 + 1, 3));
    }
    // Rand (Ellipse) mit Ausguss rechts
    p.ellipse(14, 7, 10.5, 3, IRON[4]); p.ellipse(14, 7, 9, 2.2, IRON[2]);
    p.rect(24, 5, 3, 3, IRON[3]); p.px(26, 5, IRON[5]); p.px(26, 7, IRON[1]);
    // Flüssiges Metall
    p.ellipse(14, 7.2, 8, 1.7, EMB[4]); p.ellipse(13, 7, 5, 1, EMB[5]); p.px(18, 8, EMB[3]); p.px(9, 8, EMB[3]); p.px(20, 7, CRUST[3]); p.px(21, 7, CRUST[2]);
    G.ellipse(14, 7.2, 9, 2.2, EMB[3]); G.ellipse(13, 7, 5, 1, EMB[5]); G.rect(24, 6, 2, 1, EMB[3]);
    // Glutschein am Kessel, Nieten, Tragöse
    for (let x = 6; x < 23; x += 4) p.px(x, 11, IRON[6]);
    p.rect(4, 14, 20, 1, IRON[1]);
    p.px(5, 9, EMB[2]); p.px(6, 9, EMB[1]); p.px(22, 9, EMB[1]);
    p.rect(2, 9, 2, 3, IRON[3]); p.px(2, 9, IRON[5]); p.rect(24, 9, 2, 3, IRON[1]);
    // Metalltropfen am Ausguss
    p.px(26, 8, EMB[4]); p.px(26, 9, EMB[3]); G.px(26, 8, EMB[4]); G.px(26, 9, EMB[3]);
    // Hitzeflimmern-Funken
    p.px(11, 2, EMB[4]); p.px(17, 0, EMB[3]); G.px(11, 2, EMB[4]); G.px(17, 0, EMB[3]);
  }, { glow: true, box: [-12, -6, 12, 1], light: { dx: 0, dy: -22, radius: 86, color: [255, 140, 50], intensity: 1.1 } });
  return o;
}

function forgeWeaponRack() {
  const W = 26, H = 28, AX = 13, AY = 27;
  return prop(W, H, AX, AY, (p) => {
    // Gestell: zwei Pfosten, zwei Querbalken
    for (const x of [2, 22]) { p.rect(x, 2, 2, 25, WOOD[3]); p.px(x, 2, WOOD[5]); p.rect(x + 1, 3, 1, 24, WOOD[1]); }
    p.rect(1, 26, 24, 1, WOOD[1]);
    p.rect(2, 5, 22, 2, WOOD[3]); p.rect(2, 5, 22, 1, WOOD[5]);
    p.rect(2, 20, 22, 2, WOOD[2]); p.rect(2, 20, 22, 1, WOOD[4]);
    for (const x of [2, 22]) { p.px(x, 5, IRON[5]); p.px(x, 20, IRON[5]); }
    // Schwert (Klinge nach unten)
    p.rect(6, 1, 1, 3, WOOD[4]); p.rect(4, 4, 5, 1, BRASS[4]); p.px(4, 4, BRASS[6]); p.px(6, 0, BRASS[5]);
    p.rect(6, 5, 1, 17, STEEL[4]); p.rect(7, 5, 1, 16, STEEL[2]); p.px(6, 6, STEEL[5]); p.px(6, 22, STEEL[3]);
    // Axt
    p.rect(11, 2, 1, 22, WOOD[4]); p.rect(12, 2, 1, 22, WOOD[2]);
    p.rect(12, 3, 4, 5, IRON[3]); p.rect(15, 2, 2, 7, IRON[4]); p.px(16, 2, IRON[6]); p.px(16, 8, IRON[2]); p.rect(12, 3, 4, 1, IRON[5]);
    // Speer
    p.rect(18, 0, 1, 26, WOOD[3]); p.px(18, 0, IRON[6]);
    p.rect(17, 0, 3, 1, IRON[4]); p.px(18, -1, IRON[6]);
    p.rect(17, 1, 3, 3, IRON[4]); p.px(17, 1, IRON[6]); p.px(19, 3, IRON[2]); p.rect(17, 4, 3, 1, BRASS[3]);
    // Unfertige Klinge (Rohling) lehnt am Fuß
    p.line(20, 26, 24, 17, IRON[3]); p.line(21, 26, 25, 17, IRON[2]); p.px(24, 17, IRON[5]);
  }, { box: [-11, -3, 11, 1] });
}

function forgeOreCart() {
  const W = 26, H = 20, AX = 13, AY = 19;
  return prop(W, H, AX, AY, (p) => {
    // Schienen
    p.rect(0, 17, 26, 1, IRON[4]); p.rect(0, 18, 26, 1, IRON[1]);
    for (let x = 1; x < 26; x += 6) { p.rect(x, 16, 3, 3, WOOD[2]); p.px(x, 16, WOOD[4]); p.rect(x, 17, 3, 1, IRON[4]); }
    // Räder
    for (const x of [6, 19]) { p.ellipse(x, 15, 2.6, 2.6, IRON[2]); p.ellipse(x - 0.4, 14.6, 1.4, 1.4, IRON[4]); p.px(x, 15, IRON[0]); p.px(x - 1, 13, IRON[5]); }
    // Wanne: trapezförmig, genietete Eisenplatten
    for (let y = 0; y < 9; y++) {
      const x0 = 2 + Math.floor(y / 3), x1 = 23 - Math.floor(y / 3);
      p.rect(x0, 5 + y, x1 - x0 + 1, 1, IRON[y < 2 ? 4 : 3]);
      p.px(x0, 5 + y, IRON[5]); p.px(x1, 5 + y, IRON[1]);
    }
    p.rect(2, 5, 22, 1, IRON[6]);
    for (const x of [8, 13, 18]) { p.rect(x, 6, 1, 7, IRON[2]); p.px(x, 7, IRON[5]); p.px(x, 11, IRON[5]); }
    p.px(5, 9, RUST[2]); p.px(6, 10, RUST[1]); p.px(20, 8, RUST[2]);
    // Erz: Brocken mit Kupfer- und Messingadern
    const chunks = [[5, 3, 3, BAS], [9, 2, 3, COPPER], [13, 1, 4, BAS], [17, 2, 3, BAS], [20, 3, 2, COPPER], [11, 3, 2, BAS]];
    for (const [x, y, r, ramp] of chunks) {
      p.ellipse(x, y + 1, r, r * 0.8, ramp[2]); p.ellipse(x - 0.5, y + 0.5, r * 0.6, r * 0.5, ramp[4]); p.px(x - 1, y, ramp[5]);
    }
    p.px(14, 1, BRASS[5]); p.px(15, 2, BRASS[4]); p.px(7, 3, BRASS[5]); p.px(18, 2, COPPER[5]);
    p.rect(3, 4, 20, 1, '#0a080a');
  }, { box: [-11, -5, 11, 1] });
}

function forgeBrazier() {
  const W = 20, H = 26, AX = 10, AY = 25;
  const o = prop(W, H, AX, AY, (p, G) => {
    // Genietete Eisenschale auf kurzem Sockel
    p.rect(6, 19, 8, 5, IRON[2]); p.rect(6, 19, 2, 5, IRON[4]); p.rect(12, 19, 2, 5, IRON[1]);
    p.rect(4, 24, 12, 1, IRON[3]); p.rect(4, 24, 12, 1, IRON[2]); p.px(4, 24, IRON[5]);
    for (let y = 0; y < 8; y++) {
      const hw = 9 - y * 0.6;
      const x0 = Math.round(10 - hw), x1 = Math.round(10 + hw);
      for (let x = x0; x <= x1; x++) p.px(x, 11 + y, cylCol(IRON, x - x0, x1 - x0 + 1, 3));
    }
    p.rect(1, 11, 19, 1, IRON[5]); p.px(2, 11, IRON[6]);
    p.rect(1, 13, 19, 1, BRASS[3]); p.px(2, 13, BRASS[5]); p.px(18, 13, BRASS[1]);
    for (let x = 3; x < 18; x += 3) p.px(x, 16, IRON[6]);
    // Glühende Kohlen
    p.rect(2, 9, 17, 2, CRUST[2]);
    for (let x = 3; x < 18; x++) if ((x * 7) % 3) p.px(x, 9 + (x & 1), x % 4 ? EMB[2] : EMB[4]);
    p.px(5, 9, CRUST[0]); p.px(12, 10, CRUST[0]);
    G.rect(3, 9, 15, 2, EMB[1]); for (let x = 3; x < 18; x += 4) G.px(x, 9 + (x & 1), EMB[3]);
    // Feuer
    staticFlame(p, G, 10, 10, 11, 10, EMB, 5);
    // Glutschein auf dem Rand
    p.px(6, 12, EMB[3]); p.px(13, 12, EMB[2]); G.px(6, 12, EMB[2]);
  }, { glow: true, box: [-6, -3, 6, 1], light: { dx: 0, dy: -16, radius: 76, color: [255, 150, 70], intensity: 1.0 } });
  o.flames = flameFrames(11, 10, 6, 23, EMB.concat([EMB[5]]));
  o.flameAt = { dx: -5, dy: -25 };
  return o;
}

function forgeGear() {
  const W = 30, H = 32, AX = 15, AY = 31;
  return prop(W, H, AX, AY, (p) => {
    const cx = 15, cy = 13, R = 10, teeth = 12;
    // Lagerbock (hinter dem Rad): Pfosten + Fußplatte
    p.rect(12, cy, 6, 16, IRON[2]); p.rect(12, cy, 1, 16, IRON[4]); p.rect(17, cy, 1, 16, IRON[0]);
    p.rect(6, 27, 18, 4, IRON[2]); p.rect(6, 27, 18, 1, IRON[5]); p.rect(6, 28, 1, 3, IRON[4]); p.rect(23, 28, 1, 3, IRON[0]);
    for (const x of [8, 21]) { p.px(x, 29, IRON[6]); p.px(x + 1, 30, IRON[0]); }
    const litAt = (x, y) => (-(x - cx) - (y - cy)) / (R * 1.4);
    const brass = (l) => (l > 0.45 ? BRASS[5] : l > 0.1 ? BRASS[4] : l > -0.3 ? BRASS[3] : l > -0.65 ? BRASS[2] : BRASS[1]);
    // Zähne
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * Math.PI * 2 + 0.13;
      for (let r = R - 0.5; r <= R + 3; r += 0.5) for (let s = -1.4; s <= 1.4; s += 0.5) {
        const w = r > R + 2 ? 1 : 1.4;
        if (Math.abs(s) > w) continue;
        const x = Math.round(cx + Math.cos(a) * r - Math.sin(a) * s), y = Math.round(cy + Math.sin(a) * r + Math.cos(a) * s);
        p.px(x, y, brass(litAt(x, y) + (r > R + 2.4 ? 0.3 : 0)));
      }
    }
    // Kranz (3 px) – das Innere bleibt durchbrochen
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.3 || d < R - 2.6) continue;
      let l = litAt(cx + x, cy + y);
      if (d < R - 1.7) l = -l * 0.8; // Innenkante: umgekehrte Beleuchtung
      p.px(cx + x, cy + y, brass(l));
    }
    // Sechs Speichen
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.26;
      for (let r = 2.5; r < R - 1.5; r += 0.5) for (let s = -0.5; s <= 0.5; s += 1) {
        const x = Math.round(cx + Math.cos(a) * r - Math.sin(a) * s), y = Math.round(cy + Math.sin(a) * r + Math.cos(a) * s);
        p.px(x, y, s < 0 ? brass(litAt(x, y) + 0.3) : BRASS[2]);
      }
    }
    // Nabe mit Achse
    p.ellipse(cx, cy, 3.2, 3.2, BRASS[2]); p.ellipse(cx - 0.6, cy - 0.6, 2.2, 2.2, BRASS[4]); p.px(cx - 2, cy - 2, BRASS[6]);
    p.rect(cx - 1, cy - 1, 2, 2, IRON[1]); p.px(cx - 1, cy - 1, IRON[5]);
    // Glanzpunkte am Kranz, Rußspuren
    p.px(cx - 6, cy - 7, BRASS[6]); p.px(cx - 7, cy - 6, BRASS[6]); p.px(cx - 8, cy - 4, BRASS[5]);
    p.px(cx + 7, cy + 5, SOOT[2]); p.px(cx + 5, cy + 8, SOOT[2]);
  }, { box: [-10, -5, 10, 1] });
}

function forgeSlag(v) {
  const W = v ? 20 : 16, H = v ? 12 : 10, AX = W >> 1, AY = H - 1;
  const GL = ['#1c1a2a', '#2e2a44', '#4a4468', '#716a96'];     // glasige Schlacke
  return prop(W, H, AX, AY, (p, G) => {
    const rng = createRng(700 + v);
    const lumps = v ? 8 : 6;
    const list = [];
    for (let i = 0; i < lumps; i++) {
      const x = rng.int(3, W - 4), top = H - 6 - (Math.abs(x - W / 2) < W / 4 ? 2 : 0);
      list.push([x, rng.int(top, H - 3), rng.range(1.8, 3.2), rng.chance(0.3)]);
    }
    list.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r, glassy] of list) {
      const R = glassy ? GL : BAS;
      p.ellipse(x, y, r, r * 0.75, R[glassy ? 1 : 2]);
      p.ellipse(x - 0.6, y - 0.5, r * 0.6, r * 0.45, R[glassy ? 2 : 4]);
      p.px(Math.round(x - r * 0.5), Math.round(y - r * 0.4), R[glassy ? 3 : 6]);
      p.px(Math.round(x + r * 0.6), Math.round(y + r * 0.4), R[0]);
    }
    const n = v ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const x = rng.int(4, W - 5), y = rng.int(H - 5, H - 2);
      p.px(x, y, EMB[4]); p.px(x + 1, y, EMB[2]); p.px(x, y + 1, CRUST[4]); p.px(x - 1, y, CRUST[3]);
      G.px(x, y, EMB[4]); G.px(x + 1, y, EMB[2]); G.px(x - 1, y, EMB[1]); G.px(x, y - 1, EMB[0]);
    }
    p.rect(1, H - 1, W - 2, 1, BAS[1]);
  }, { glow: true });
}

function forgePipes() {
  const W = 24, H = 32, AX = 12, AY = 31;
  return prop(W, H, AX, AY, (p) => {
    const vpipe = (x, y0, y1, w) => { for (let i = 0; i < w; i++) p.rect(x + i, y0, 1, y1 - y0, cylCol(BRASS, i, w, 4)); };
    vpipe(4, 4, 30, 5);
    vpipe(15, 10, 30, 4);
    // Waagrechtes Rohr zur Wand mit Bogen
    for (let y = 0; y < 4; y++) p.rect(6, 2 + y, 14, 1, [BRASS[5], BRASS[4], BRASS[3], BRASS[1]][y]);
    for (let i = 0; i < 3; i++) p.px(4 + i, 4 - i + 1, BRASS[4]);
    p.px(5, 3, BRASS[5]); p.px(6, 2, BRASS[5]); p.px(8, 2, BRASS[6]);
    p.rect(20, 1, 3, 6, BRASS[2]); p.rect(20, 1, 1, 6, BRASS[4]); p.px(21, 2, BRASS[6]); p.px(22, 6, BRASS[0]);
    // Kurzes Stück vom rechten Rohr nach oben ins Waagrechte
    vpipe(15, 6, 10, 4);
    // Flansche
    for (const [x, y, w] of [[3, 18, 7], [14, 22, 6], [3, 9, 7], [14, 12, 6]]) {
      p.rect(x, y, w, 2, BRASS[2]); p.rect(x, y, w, 1, BRASS[5]); p.px(x, y, BRASS[6]); p.px(x + w - 1, y + 1, BRASS[0]);
      p.px(x + 1, y + 1, IRON[4]); p.px(x + w - 2, y + 1, IRON[3]);
    }
    // Ventilrad am rechten Rohr
    p.ellipse(17, 17, 3.2, 3.2, IRON[3]); p.ellipse(17, 17, 2.2, 2.2, '#0a080a');
    p.line(15, 17, 19, 17, IRON[4]); p.line(17, 15, 17, 19, IRON[4]); p.px(17, 17, COPPER[3]); p.px(15, 15, IRON[6]); p.px(16, 14, IRON[5]);
    // Manometer am linken Rohr
    p.ellipse(6.5, 25, 3, 3, BRASS[3]); p.px(4, 23, BRASS[5]); p.px(9, 27, BRASS[1]);
    p.ellipse(6.5, 25, 2, 2, BONE[2]); p.px(5, 24, BONE[3]);
    p.line(6, 25, 8, 23, '#1a0a0a'); p.px(5, 26, CORAL[3]); p.px(8, 26, BONE[1]);
    // Bodenplatte, Grünspan an den Nähten
    p.rect(1, 30, 22, 2, IRON[2]); p.rect(1, 30, 22, 1, IRON[4]); p.px(3, 31, IRON[6]); p.px(20, 31, IRON[6]);
    p.px(4, 20, '#3a6a52'); p.px(18, 24, '#3a6a52'); p.px(11, 5, SOOT[1]); p.px(12, 5, SOOT[2]);
  }, { box: [-9, -3, 9, 1] });
}

// ================================================================== Einstieg
const CACHE = {};
export function createBiomeTiles(biome = 'temple') {
  if (CACHE[biome]) return CACHE[biome];
  let out;
  if (biome === 'forge') {
    out = {
      floor: forgeFloor(),
      faces: forgeFaces(),
      top: forgeTop(),
      topEdge: '#2e2527', topEdgeLight: '#4a3a36',
      liquid: forgeLiquid(),
      decorate: (ctx, map) => paintLavaShore(ctx, map, { wall: BAS, crust: CRUST, emb: EMB, grout: FGROUT, seed: 131 }),
      ambientTint: [255, 120, 60],
      props: {
        anvil: forgeAnvil(),
        forgePillar: forgePillar(),
        chains: [forgeChains(0), forgeChains(1)],
        crucible: forgeCrucible(),
        weaponRack: forgeWeaponRack(),
        oreCart: forgeOreCart(),
        brazierForge: forgeBrazier(),
        gear: forgeGear(),
        slagPile: [forgeSlag(0), forgeSlag(1)],
        pipes: forgePipes(),
      },
    };
  } else {
    out = {
      floor: templeFloor(),
      faces: templeFaces(),
      top: templeTop(),
      topEdge: '#223a3c', topEdgeLight: '#35524f',
      liquid: templeLiquid(),
      ambientTint: [80, 200, 190],
      props: {
        statue: [templeStatue(0), templeStatue(1)],
        pillar: [templePillar(false), templePillar(true)],
        coral: [templeCoral(0), templeCoral(1), templeCoral(2)],
        seaweed: [templeSeaweed(0), templeSeaweed(1), templeSeaweed(2)],
        shells: [templeShells(0), templeShells(1), templeShells(2)],
        brazierTeal: templeBrazier(),
        altar: templeAltar(),
        urn: [templeUrn(0), templeUrn(1)],
        drownedBones: [templeBones(0), templeBones(1)],
      },
    };
  }
  CACHE[biome] = out;
  return out;
}
