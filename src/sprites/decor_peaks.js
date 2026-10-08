import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT, groundPixel, vnoise } from './outdoor.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { mk, poly, ashPatch, drawTent } from './decor_ashwood.js';

// Schlackenhöhen: schwarzer Basalt, Obsidian, Lavatümpel; Feste Rauhwacht,
// der Riss und das Tor zur Glutschmiede. Licht von links oben; alles
// Leuchtende zusätzlich auf der Glow-Ebene ((W+2)×(H+2), 1 px Versatz).

// Schiefer statt Basalt: kühles Grau mit einem Hauch Ocker (Runde 2: weg vom Schwarz-Lava-Bild der Glutöde)
const BAS = ['#0d0d10', '#17171a', '#222225', '#2e2d30', '#3b3a3c', '#4b4848', '#5f5a56'];

// ------------------------------------------------------------ Boden der Schlackenhöhen
// Grundton: graues Geröll (','), rostige Erzerde auf Wegen ('.'), Rostwasser ('~', keine Lava).
// level.soil (Zeilen wie die Karte) färbt Flächen um: o Erzader, s Schlacke, y Schwefel, g heller Kies.
const PK_SCREE = ['#16171a', '#1d1e22', '#25262a', '#2e2f33', '#38383c', '#444346'];
const PK_ORE = ['#1c100b', '#2a170f', '#3a1f13', '#4b2817', '#5e331c', '#723f22'];
const PK_SLAG = ['#0b0b0e', '#111116', '#17181e', '#1f2028', '#282a34', '#343846'];
const PK_SULF = ['#1d1a0e', '#2a2512', '#3a3216', '#4c411a', '#5f511f', '#776726'];
const PK_GRAV = ['#1d1d1f', '#262628', '#303032', '#3b3a3b', '#474545', '#555251'];
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const PK_RGB = { o: PK_ORE.map(hexRgb), s: PK_SLAG.map(hexRgb), y: PK_SULF.map(hexRgb), g: PK_GRAV.map(hexRgb) };
export function soilAt(level, px, py, seed = 301) {
  const S = level?.soil; if (!S) return ' ';
  const jx = px + (vnoise(px / 11, py / 11, seed) - 0.5) * 16, jy = py + (vnoise(px / 11, py / 11, seed + 1) - 0.5) * 16;
  return S[Math.floor(jy / 16)]?.[Math.floor(jx / 16)] ?? ' ';
}
function peaksPixel(kind, px, py, level) {
  if (kind !== ',' && kind !== '.') return groundPixel(kind, px, py, GROUND_PEAKS);
  const s = soilAt(level, px, py);
  const R = PK_RGB[s];
  if (!R) return groundPixel(kind, px, py, GROUND_PEAKS);
  const n = vnoise(px / 9, py / 9, 11) * 0.6 + vnoise(px / 3, py / 3, 12) * 0.4, h = hash2(px, py, 13);
  let i = 1 + Math.floor(n * 3.1) + (kind === '.' ? 1 : 0);
  if (s === 'o') { if (h < 0.06) i = 5; else if (h > 0.94) i = 0; if (vnoise(px / 4, py / 14, 17) > 0.78) i = Math.min(5, i + 1); }
  else if (s === 's') { if (h < 0.03) return [70, 84, 110]; if (vnoise(px / 5, py / 5, 18) > 0.7) i = Math.max(0, i - 1); }
  else if (s === 'y') { if (h < 0.05) i = 5; if (Math.abs(vnoise(px / 6, py / 6, 19) - 0.5) < 0.03) i = 1; }
  else if (s === 'g') { if (h < 0.08) i = 5; else if (h > 0.92) i = 1; }
  return R[Math.max(0, Math.min(5, i))];
}
export const GROUND_PEAKS = {
  grass: PK_SCREE,
  dirt: ['#1b130e', '#261a12', '#332316', '#412c1b', '#503621', '#614128'],
  water: ['#071012', '#0b171a', '#112226', '#46706c', '#1a3236'],
  cliffCap: ['#1b1b1e', '#232326', '#2c2b2e', '#363437', '#413d3e', '#4e4846'],
  tufts: false,
  pixel: peaksPixel,
};
const OBS = ['#06040a', '#0e0918', '#181028', '#261a3e', '#3a2a5c', '#6a58a0', '#c8bcf0'];
const ASHG = ['#1a1819', '#262325', '#343032', '#454042', '#5a5456', '#746d6c'];
const FST = ['#131118', '#1c1922', '#26222d', '#322d3a', '#3f3948', '#4f4858', '#645c6c'];
const BLUE = ['#0e1220', '#161c30', '#212a44', '#2e3a5a', '#3e4e74', '#56688e'];
const CHAR = ['#0a0708', '#130e0f', '#1c1516', '#281e1f', '#352929', '#44363a'];
const EMB = PAL.ember, GOLD = PAL.gold, CRIM = PAL.crimson, IRON = PAL.steel, LEA = PAL.leather, MAG = PAL.magic;
const WOOD = OUT.wood;
const WHITE = '#f6f0ff';
const DOOR = ['#0b090d', '#151116', '#201a22', '#2c242c', '#463a40'];
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// Glühender Riss als Zufallspfad (Sprite + Glow)
function crack(p, g, rng, x, y, len, dir = 0) {
  let a = dir;
  for (let i = 0; i < len; i++) {
    const c = i === 0 || i === len - 1 ? EMB[2] : EMB[3];
    p.px(x, y, c); g.px(x, y, i === 0 || i === len - 1 ? EMB[3] : EMB[4]);
    if (i > 1 && i < len - 2 && rng.chance(0.3)) { p.px(x, y, EMB[4]); g.px(x, y, EMB[5]); }
    a += rng.range(-0.8, 0.8);
    x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a) * 0.7);
  }
}

// ------------------------------------------------------------ Basaltsäulen
function basaltColumns(v) {
  const rng = createRng(500 + v);
  const W = 30, H = 38;
  const sets = [
    [[4, 20, 5, 34], [10, 10, 6, 33], [17, 4, 6, 34], [23, 16, 5, 35], [13, 24, 5, 37]],
    [[3, 22, 6, 34], [10, 14, 5, 35], [16, 20, 6, 36], [21, 26, 6, 37]],
    [[6, 12, 6, 34], [13, 2, 6, 34], [19, 16, 6, 35], [9, 26, 5, 37], [16, 28, 6, 37]],
  ][v];
  return mk(W, H, (p) => {
    ashPatch(p, 15, H - 2, 14, 2, 500 + v);
    for (const [x, top, w, bot] of sets) {
      for (let y = top + 1; y <= bot; y++) for (let i = 0; i < w; i++) {
        const rel = i / (w - 1);
        let k = rel < 0.2 ? 5 : rel < 0.5 ? 4 : rel < 0.8 ? 3 : 2;
        if (i === w - 1) k = 1;
        if ((y - top) % 7 === 0) k -= 2; // Querfuge
        else if ((y - top) % 7 === 1 && i < w - 1) k += 1;
        if (hash2(x + i, y, 501 + v) < 0.08) k -= 1;
        p.px(x + i, y, BAS[clampI(k, 7)]);
      }
      // Sechseckige Deckfläche
      p.rect(x + 1, top - 1, w - 2, 1, BAS[5]); p.rect(x, top, w, 1, BAS[5]); p.rect(x + 1, top + 1, w - 2, 1, BAS[4]);
      p.px(x + 1, top - 1, BAS[6]); p.px(x, top, BAS[6]);
      // Asche auf der Deckfläche
      if (rng.chance(0.7)) { p.px(x + 1 + rng.int(0, w - 3), top - 1, ASHG[4]); p.px(x + 1 + rng.int(0, w - 3), top, ASHG[3]); }
    }
    // Geröll
    for (let i = 0; i < 5; i++) { const x = rng.int(2, 27), y = H - 1 - rng.int(0, 1); p.px(x, y, BAS[3]); p.px(x - 1, y, BAS[5]); }
  }, { ax: 15, box: [-11, -4, 11, 1] });
}

// ------------------------------------------------------------ Obsidianspitzen
function obsidianSpikes(v) {
  const rng = createRng(520 + v);
  const W = 22, H = 28;
  const shards = [
    [[11, 1, 3.5, 1], [6, 11, 2.5, -2], [16, 12, 3, 3]],
    [[9, 4, 4, -1], [15, 13, 2.5, 3], [4, 16, 2, -2], [12, 18, 2, 0]],
    [[13, 2, 3, 3], [7, 9, 3.5, -1], [17, 17, 2, 2]],
  ][v];
  return mk(W, H, (p, g) => {
    ashPatch(p, 11, H - 2, 9, 2, 520 + v);
    const base = H - 2;
    for (const [x, tipY, hw, lean] of shards) {
      const tx = x + lean;
      // linke (beleuchtete) Facette
      poly(p, [[tx + 0.5, tipY], [x - hw, base + 1], [x + 0.5, base + 1]], (xx, yy) => (hash2(xx, yy, 521) < 0.1 ? OBS[3] : OBS[4]));
      // rechte Facette
      poly(p, [[tx + 0.5, tipY], [x + 0.5, base + 1], [x + hw + 1, base + 1]], (xx, yy) => (hash2(xx, yy, 522) < 0.15 ? OBS[2] : OBS[1]));
      // Grat
      p.line(tx, tipY + 1, x, base, OBS[5]);
      // Glanzpunkt
      const gy = tipY + Math.round((base - tipY) * 0.3), gx = Math.round(tx + (x - tx) * 0.3) - 1;
      p.px(gx, gy, OBS[6]); p.px(gx, gy + 1, OBS[5]); p.px(tx, tipY, OBS[6]);
      g.px(gx, gy, '#4a3a70'); g.px(tx, tipY, '#3a2c58');
      // Violetter Innenschimmer
      p.px(x + 1, base - 3, OBS[3]); p.px(x + 2, base - 5, OBS[3]);
    }
    for (let i = 0; i < 4; i++) { const x = rng.int(3, 18); p.px(x, H - 1, OBS[3]); p.px(x, H - 2, OBS[5]); }
  }, { ax: 11, box: [-6, -3, 6, 1] });
}

// ------------------------------------------------------------ Lavafelsen
function lavaRock(v) {
  const rng = createRng(540 + v);
  const w = [16, 20, 12][v], h = [11, 13, 9][v];
  const W = w + 4, H = h + 3;
  return mk(W, H, (p, g) => {
    const cx = W / 2 - 0.5, cy = h / 2 + 1.5;
    p.ellipse(cx, cy, w / 2, h / 2, BAS[2]);
    p.ellipse(cx - 1, cy - 1, w / 2 - 2, h / 2 - 2, BAS[3]);
    p.ellipse(cx - 2, cy - 2, w / 4, h / 4, BAS[4]);
    p.px(cx - w / 4 - 1, cy - h / 4 - 1, BAS[6]);
    p.rect(cx - w / 2 + 1, h, w - 1, 1, BAS[1]);
    // Poren
    for (let i = 0; i < 6; i++) p.px(cx + rng.int(-w / 3, w / 3), cy + rng.int(-2, 3), BAS[1]);
    // Glutrisse
    crack(p, g, rng, Math.round(cx - w / 4), Math.round(cy - 1), 5 + v, 0.4);
    crack(p, g, rng, Math.round(cx + 1), Math.round(cy + 2), 4 + v, -0.3);
    if (v === 1) crack(p, g, rng, Math.round(cx + 3), Math.round(cy - 3), 4, 1.2);
    // glühender Fuß
    for (let x = Math.round(cx - w / 3); x < cx + w / 3; x++) if (hash2(x, 0, 541 + v) < 0.3) { p.px(x, h + 1, EMB[1]); g.px(x, h + 1, EMB[2]); }
  }, { ax: Math.floor(W / 2), ay: h + 1, box: [-Math.floor(w / 2) + 1, -3, Math.floor(w / 2) - 1, 1], light: { dx: 0, dy: -4, radius: 34, color: [255, 120, 50], intensity: 0.55 } });
}

// ------------------------------------------------------------ Verkohlte Bäume
function deadTree(seed) {
  const rng = createRng(seed);
  const W = 36, H = 42;
  return mk(W, H, (p, g) => {
    ashPatch(p, 18, H - 2, 10, 2, seed);
    const tips = [];
    const branch = (x, y, a, len, th, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      for (let i = 0; i < th; i++) p.line(x + i, y, x2 + i * 0.5, y2, i === 0 ? CHAR[5] : i === th - 1 ? CHAR[1] : CHAR[3]);
      // Asche auf der Oberseite
      if (len > 4) p.px(Math.round((x + x2) / 2), Math.round((y + y2) / 2) - 1, ASHG[4]);
      if (depth <= 0 || len < 3) { tips.push([Math.round(x2), Math.round(y2)]); return; }
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) branch(x2, y2, a + rng.range(-0.9, 0.9), len * rng.range(0.55, 0.75), Math.max(1, th - 1), depth - 1);
    };
    p.line(15, H - 2, 10, H - 1, CHAR[3]); p.line(20, H - 2, 25, H - 1, CHAR[1]); p.line(16, H - 2, 13, H - 1, CHAR[4]);
    for (let y = 26; y < H - 1; y++) { const s = Math.round(Math.sin(y * 0.4) * 0.7); p.px(16 + s, y, CHAR[5]); p.px(17 + s, y, CHAR[3]); p.px(18 + s, y, CHAR[2]); p.px(19 + s, y, CHAR[1]); }
    branch(17, 27, -Math.PI / 2 + rng.range(-0.3, 0.3), 11, 3, 4);
    branch(16, 31, -Math.PI / 2 - 1.0, 9, 2, 3);
    branch(18, 30, -Math.PI / 2 + 0.95, 9, 2, 3);
    for (const [x, y] of tips) if (rng.chance(0.35)) { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); }
    // Glutkern im Stamm
    p.px(17, 34, EMB[2]); p.px(17, 35, EMB[3]); p.px(18, 36, EMB[2]); g.px(17, 35, EMB[4]); g.px(17, 34, EMB[3]); g.px(18, 36, EMB[3]);
  }, { ax: 18, box: [-3, -3, 3, 1] });
}

// ------------------------------------------------------------ Aschewehen
function ashDrift(v) {
  const rng = createRng(560 + v);
  const W = v ? 22 : 28, H = v ? 8 : 10;
  return mk(W, H, (p) => {
    const cx = W / 2, cy = H - 3;
    p.ellipse(cx, cy, W / 2 - 1, H / 2 - 1, ASHG[2]);
    p.ellipse(cx - 2, cy - 1, W / 2 - 4, H / 2 - 2, ASHG[3]);
    p.ellipse(cx - 4, cy - 2, W / 4, H / 4 - 0.5, ASHG[4]);
    // Windrippeln
    for (let r = 0; r < 3; r++) for (let x = 3 + r * 2; x < W - 4 - r; x++) { const y = cy - 1 + r + Math.round(Math.sin(x * 0.5 + r) * 0.6); if (hash2(x, r, 561) < 0.6) p.px(x, y, r === 0 ? ASHG[5] : ASHG[2]); }
    for (let i = 0; i < 4; i++) p.px(rng.int(3, W - 4), rng.int(2, H - 3), BAS[3]);
    p.rect(2, H - 2, W - 4, 1, ASHG[1]);
  }, { ax: Math.floor(W / 2), ay: H - 2 });
}

// ------------------------------------------------------------ Festungsmauer
function stoneCourses(p, x0, y0, w, h, seed, lightLeft = true) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const row = Math.floor((y - y0) / 5), lx = (x - x0 + (row % 2) * 4 + 16) % 8, ly = (y - y0) % 5;
    const blk = hash2(Math.floor((x - x0 + (row % 2) * 4 + 16) / 8), row, seed);
    let k = blk < 0.3 ? 2 : blk < 0.8 ? 3 : 4;
    if (ly === 0 || lx === 0) k = 1;
    else if (ly === 1 || (lightLeft && lx === 1)) k += 1;
    else if (ly === 4 || lx === 7) k -= 1;
    if (hash2(x, y, seed + 1) < 0.05) k -= 1;
    // Ruß von unten
    if (y > y0 + h - 4 && hash2(x, y, seed + 2) < 0.5) k -= 1;
    p.px(x, y, FST[clampI(k, 7)]);
  }
}

function fortWallH() {
  const W = 16, H = 34;
  return mk(W, H, (p) => {
    const bottom = H - 1, faceTop = 10;
    // Wehrgang (Oberseite, 3/4)
    for (let y = 4; y < faceTop; y++) for (let x = 0; x < 16; x++) p.px(x, y, (x + (y % 2) * 4) % 8 === 0 ? FST[2] : FST[y === 4 ? 3 : 4]);
    // Front
    stoneCourses(p, 0, faceTop, 16, bottom - faceTop + 1, 601);
    // Zinnen an der Vorderkante
    for (const x0 of [1, 9]) {
      p.rect(x0, 1, 6, 9, FST[3]); stoneCourses(p, x0, 3, 6, 7, 603);
      p.rect(x0, 1, 6, 2, FST[5]); p.rect(x0, 1, 6, 1, FST[6]); p.rect(x0 + 5, 2, 1, 8, FST[1]);
    }
    p.rect(0, faceTop, 16, 1, FST[1]);
    // Schießscharte
    p.rect(12, 17, 1, 5, '#06050a'); p.px(11, 17, FST[1]);
    // Ruß, Schlacke am Fuß
    for (let x = 0; x < 16; x++) if (hash2(x, 9, 604) < 0.6) p.px(x, bottom, ASHG[hash2(x, 8, 604) < 0.5 ? 2 : 3]);
  }, { ax: 8, box: [-8, -4, 8, 1] });
}

function fortWallV() {
  const W = 12, H = 42;
  return mk(W, H, (p) => {
    const bottom = H - 1, faceH = 22, stripTop = bottom - 16 - faceH + 1;
    // Wehrgang als Streifen (Draufsicht der Mauerkrone)
    for (let y = stripTop; y < bottom - faceH + 1; y++) for (let x = 1; x < 11; x++) {
      let k = x < 3 ? 5 : x < 9 ? 4 : 2;
      if ((y + (x > 5 ? 3 : 0)) % 6 === 0) k = 2;
      p.px(x, y, FST[k]);
    }
    // Zinnen an der Westkante
    for (let y = stripTop; y < bottom - faceH - 1; y += 6) { p.rect(0, y - 3, 3, 4, FST[5]); p.px(0, y - 3, FST[6]); p.rect(0, y + 1, 3, 2, FST[3]); }
    // Stirnseite (vorn)
    stoneCourses(p, 1, bottom - faceH + 1, 10, faceH, 611);
    p.rect(1, bottom - faceH + 1, 10, 1, FST[1]);
    for (let x = 1; x < 11; x++) if (hash2(x, 3, 612) < 0.6) p.px(x, bottom, ASHG[2]);
  }, { ax: 6, box: [-5, -16, 5, 1] });
}

// ------------------------------------------------------------ Festungstor
function torch(p, g, x, y) {
  p.rect(x, y, 2, 5, WOOD[2]); p.px(x, y, WOOD[3]);
  p.rect(x - 1, y + 2, 4, 1, IRON[2]);
  p.px(x, y - 1, EMB[3]); p.px(x + 1, y - 1, EMB[4]); p.px(x, y - 2, EMB[4]); p.px(x + 1, y - 3, EMB[3]);
  g.px(x, y - 1, EMB[4]); g.px(x + 1, y - 1, EMB[5]); g.px(x, y - 2, EMB[5]); g.px(x + 1, y - 3, EMB[4]); g.px(x, y - 4, EMB[2]);
}

function fortGate() {
  const W = 56, H = 52;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 28;
    // Torhaus-Mauer
    stoneCourses(p, 2, 14, 52, bottom - 13, 621);
    p.rect(2, 10, 52, 4, FST[4]); p.rect(2, 10, 52, 1, FST[5]); p.rect(2, 13, 52, 1, FST[1]);
    // Zinnen
    for (let x = 2; x < 54; x += 7) { p.rect(x, 3, 5, 8, FST[3]); p.rect(x, 3, 5, 2, FST[5]); p.px(x, 3, FST[6]); p.rect(x + 4, 4, 1, 7, FST[1]); }
    // Pfeiler vorspringend
    for (const x0 of [0, 44]) { stoneCourses(p, x0, 16, 12, bottom - 15, 623); p.rect(x0, 15, 12, 2, FST[5]); p.rect(x0 + 11, 16, 1, bottom - 15, FST[1]); p.rect(x0, 16, 1, bottom - 15, FST[5]); }
    // Torbogen
    const ox0 = 15, ox1 = 40, otop = 26;
    for (let y = otop - 8; y <= bottom; y++) for (let x = ox0; x <= ox1; x++) {
      const dy = y - otop; if (dy < 0) { const t = (x - (ox0 + ox1) / 2) / ((ox1 - ox0) / 2 + 0.5); if (dy < -Math.sqrt(Math.max(0, 1 - t * t)) * 8) continue; }
      p.px(x, y, '#07060a');
    }
    // Durchgang: Boden und Licht vom Hof
    for (let y = bottom - 8; y <= bottom; y++) for (let x = ox0 + 2; x <= ox1 - 2; x++) if ((x + y) % 2 === 0) p.px(x, y, '#141018');
    // Fallgatter hochgezogen (Spitzen)
    for (let x = ox0 + 1; x < ox1; x += 3) { p.rect(x, otop - 6, 1, 8, IRON[1]); p.px(x, otop + 2, IRON[3]); }
    p.rect(ox0 + 1, otop - 3, ox1 - ox0 - 1, 1, IRON[1]);
    // offene Torflügel (nach innen geschwenkt, schräg)
    poly(p, [[ox0 + 1, otop - 1], [ox0 + 6, otop + 2], [ox0 + 6, bottom - 3], [ox0 + 1, bottom]], (x, y) => ((y - otop) % 6 === 0 ? IRON[1] : x === ox0 + 1 ? WOOD[4] : WOOD[2]));
    poly(p, [[ox1, otop - 1], [ox1 - 5, otop + 2], [ox1 - 5, bottom - 3], [ox1, bottom]], (x, y) => ((y - otop) % 6 === 0 ? IRON[1] : WOOD[1]));
    // Bogensteine
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI, x = cx + Math.cos(a) * 14.5, y = otop + Math.sin(a) * 10;
      p.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, FST[4]); p.px(Math.round(x) - 1, Math.round(y) - 1, FST[6]); p.px(Math.round(x) + 1, Math.round(y) + 1, FST[2]);
    }
    // Wappen über dem Tor
    p.rect(cx - 4, 12, 9, 4, CRIM[3]); p.rect(cx - 3, 16, 7, 2, CRIM[2]); p.rect(cx - 2, 18, 5, 1, CRIM[1]); p.px(cx, 19, CRIM[1]);
    p.rect(cx - 4, 12, 9, 1, GOLD[3]); p.px(cx, 14, GOLD[4]); p.line(cx - 2, 16, cx, 13, GOLD[3]); p.line(cx + 2, 16, cx, 13, GOLD[2]);
    // Fackeln
    torch(p, g, 6, 26); torch(p, g, 48, 26);
    // Stufe
    p.rect(ox0 - 1, bottom, ox1 - ox0 + 3, 1, FST[4]);
  }, {
    ax: 28, light: { dx: 0, dy: -24, radius: 90, color: [255, 150, 70], intensity: 0.9 },
    extra: { boxes: [[-28, -5, -13, 1], [12, -5, 28, 1]], lights: [{ dx: -21, dy: -27, radius: 60, color: [255, 150, 70], intensity: 0.9 }, { dx: 21, dy: -27, radius: 60, color: [255, 150, 70], intensity: 0.9 }], door: { dx: 0, dy: -3 } },
  });
}

// ------------------------------------------------------------ Festungsturm
function fortTower() {
  const W = 38, H = 68;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 4, x1 = 33, bodyTop = 18;
    ashPatch(p, 19, bottom - 1, 17, 2, 631);
    // Sockel breiter (Anlauf)
    stoneCourses(p, x0 - 2, bottom - 8, x1 - x0 + 5, 9, 632);
    // Schaft
    stoneCourses(p, x0, bodyTop, x1 - x0 + 1, bottom - 8 - bodyTop, 633);
    p.rect(x0, bodyTop, 1, bottom - 8 - bodyTop, FST[5]);
    for (let y = bodyTop; y < bottom - 8; y++) { p.px(x1, y, FST[1]); p.px(x1 - 1, y, FST[2]); }
    // Auskragung (Wehrplatte) mit Konsolen
    p.rect(x0 - 3, bodyTop - 4, x1 - x0 + 7, 4, FST[4]); p.rect(x0 - 3, bodyTop - 4, x1 - x0 + 7, 1, FST[5]); p.rect(x0 - 3, bodyTop - 1, x1 - x0 + 7, 1, FST[1]);
    for (let x = x0 - 2; x < x1 + 3; x += 4) { p.rect(x, bodyTop, 2, 2, FST[3]); p.px(x, bodyTop + 2, FST[2]); }
    // Zinnen
    for (let x = x0 - 3; x < x1 + 4; x += 6) { p.rect(x, 5, 4, 9, FST[3]); stoneCourses(p, x, 7, 4, 7, 634); p.rect(x, 5, 4, 2, FST[5]); p.px(x, 5, FST[6]); p.rect(x + 3, 6, 1, 8, FST[1]); }
    // Fahnenmast
    p.rect(26, 0, 1, 10, WOOD[3]);
    p.rect(27, 0, 7, 4, CRIM[3]); p.rect(27, 0, 7, 1, CRIM[4]); p.px(34, 1, CRIM[3]); p.rect(27, 3, 7, 1, CRIM[2]); p.px(30, 1, GOLD[3]);
    // Schießscharten mit Glut dahinter
    for (const [x, y, lit] of [[18, 26, true], [11, 38, false], [25, 40, true]]) {
      p.rect(x, y, 2, 7, '#07050a'); p.rect(x - 1, y - 1, 4, 1, FST[5]); p.rect(x - 1, y + 7, 4, 1, FST[2]);
      if (lit) { p.px(x, y + 3, EMB[2]); p.px(x, y + 4, EMB[3]); g.px(x, y + 3, EMB[3]); g.px(x, y + 4, EMB[4]); g.px(x + 1, y + 4, EMB[2]); }
    }
    // Tür
    p.rect(15, bottom - 16, 9, 14, FST[1]); p.rect(16, bottom - 15, 7, 13, WOOD[2]); p.rect(16, bottom - 15, 7, 1, WOOD[4]);
    for (let x = 17; x < 23; x += 2) p.rect(x, bottom - 14, 1, 12, WOOD[1]);
    p.rect(16, bottom - 11, 7, 1, IRON[1]); p.rect(16, bottom - 6, 7, 1, IRON[1]); p.px(21, bottom - 8, GOLD[3]);
    // Banner an der Front
    p.rect(5, bodyTop + 2, 6, 16, CRIM[3]); p.rect(5, bodyTop + 2, 1, 16, CRIM[4]); p.rect(10, bodyTop + 2, 1, 16, CRIM[1]);
    p.px(5, bodyTop + 18, CRIM[2]); p.px(7, bodyTop + 19, CRIM[3]); p.px(9, bodyTop + 18, CRIM[2]);
    p.rect(7, bodyTop + 6, 2, 5, GOLD[3]); p.px(6, bodyTop + 7, GOLD[2]); p.px(9, bodyTop + 7, GOLD[2]); p.px(7, bodyTop + 6, GOLD[4]);
    // Fackeln neben der Tür
    torch(p, g, 11, bottom - 16); torch(p, g, 26, bottom - 16);
  }, { ax: 19, box: [-15, -6, 15, 1], light: { dx: 0, dy: -18, radius: 80, color: [255, 150, 70], intensity: 0.9 } });
}

// ------------------------------------------------------------ Militärzelt
function tent() {
  const W = 38, H = 30;
  return mk(W, H, (p, g) => {
    ashPatch(p, 19, H - 2, 17, 2, 641);
    drawTent(p, g, { W, H, pal: BLUE, band: CRIM, ragged: false, seed: 17 });
    const cx = 19;
    p.line(cx, 0, cx, 4, IRON[3]); p.px(cx, 0, GOLD[4]);
    p.rect(cx + 1, 1, 5, 2, CRIM[3]); p.px(cx + 6, 1, CRIM[3]); p.px(cx + 1, 1, CRIM[4]); p.rect(cx + 2, 2, 4, 1, CRIM[2]);
    // Waffenständer mit Speeren
    p.line(cx + 11, H - 3, cx + 11, H - 14, WOOD[3]); p.line(cx + 14, H - 3, cx + 14, H - 13, WOOD[2]);
    p.px(cx + 11, H - 15, IRON[4]); p.px(cx + 14, H - 14, IRON[4]); p.rect(cx + 10, H - 7, 6, 1, WOOD[1]);
  }, { ax: 19, box: [-14, -7, 14, 1] });
}

// ------------------------------------------------------------ Bannerstange (Rauhwacht)
function bannerPole() {
  const W = 18, H = 42;
  return mk(W, H, (p) => {
    const bottom = H - 1, px0 = 3;
    p.ellipse(px0 + 1, bottom - 1, 4, 1.6, FST[2]); p.ellipse(px0, bottom - 2, 3, 1.2, FST[4]); p.px(px0 - 1, bottom - 2, FST[5]);
    p.rect(px0, 3, 2, bottom - 4, IRON[1]); p.rect(px0, 3, 1, bottom - 4, IRON[3]);
    p.px(px0, 0, IRON[5]); p.rect(px0, 1, 2, 2, IRON[3]); p.px(px0 + 1, 2, IRON[1]);
    p.rect(px0, 5, 13, 2, IRON[2]); p.rect(px0, 5, 13, 1, IRON[4]); p.px(px0 + 13, 5, GOLD[3]);
    const bx0 = px0 + 2, bx1 = px0 + 12, by0 = 7, by1 = 30;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.9);
      const tip = 3 - Math.min(3, Math.round(Math.abs(x - (bx0 + bx1) / 2)));
      const low = by1 + Math.round(fold) + tip;
      for (let y = by0; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 4;
        if (y === by0) i = 1;
        p.px(x, y, CRIM[i]);
      }
      p.px(x, low, GOLD[x % 2 ? 2 : 3]);
    }
    // Wappen: Bergspitze mit Hammer
    const ex = Math.round((bx0 + bx1) / 2), ey = 18;
    poly(p, [[ex + 0.5, ey - 6], [ex - 4, ey + 2], [ex + 5, ey + 2]], (x, y) => (x <= ex ? GOLD[3] : GOLD[2]));
    p.px(ex, ey - 5, GOLD[4]); p.rect(ex - 1, ey - 4, 3, 1, GOLD[4]);
    p.line(ex - 3, ey + 6, ex + 2, ey + 1, IRON[4]); p.rect(ex + 1, ey, 3, 2, IRON[3]); p.px(ex + 1, ey, IRON[5]);
  }, { ax: 4, box: [-2, -2, 2, 1] });
}

// ------------------------------------------------------------ Feldschmiede
function forge() {
  const W = 40, H = 30;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, 20, bottom - 1, 18, 2, 651);
    // Blasebalg links
    poly(p, [[1, 14], [8, 12], [8, 20], [1, 18]], (x, y) => (y < 15 ? LEA[3] : (y % 2 ? LEA[2] : LEA[1])));
    p.rect(0, 13, 2, 7, WOOD[3]); p.line(8, 16, 11, 16, IRON[2]);
    p.line(0, 12, -1 + 2, 10, WOOD[4]);
    // Esse: Steinblock
    stoneCourses(p, 10, 13, 16, bottom - 13, 652);
    p.rect(9, 10, 18, 4, FST[4]); p.rect(9, 10, 18, 1, FST[6]); p.rect(9, 10, 1, 4, FST[5]);
    // Glutbett
    p.rect(11, 10, 14, 2, '#1a0806');
    for (let x = 11; x < 25; x++) { const h = hash2(x, 1, 653); const c = h < 0.3 ? EMB[4] : h < 0.7 ? EMB[3] : EMB[2]; p.px(x, 10, c); g.px(x, 10, h < 0.3 ? EMB[5] : EMB[4]); if (h < 0.5) { p.px(x, 11, EMB[2]); g.px(x, 11, EMB[3]); } }
    // Glühendes Eisen + Zange
    p.line(16, 9, 22, 8, EMB[4]); g.line(16, 9, 22, 8, EMB[5]);
    p.line(22, 8, 30, 5, IRON[3]); p.line(22, 9, 30, 7, IRON[2]);
    // Rauchabzug-Haube (klein, rußig)
    p.rect(13, 1, 10, 3, FST[3]); p.rect(13, 1, 10, 1, FST[5]); p.rect(15, 4, 6, 1, FST[1]);
    p.line(12, 4, 11, 10, IRON[2]); p.line(24, 4, 25, 10, IRON[1]);
    // Amboss auf Stumpf rechts
    p.rect(30, 20, 7, 9, WOOD[2]); p.rect(30, 20, 2, 9, WOOD[3]); p.rect(36, 20, 1, 9, WOOD[1]); p.ellipse(33, 20, 3.5, 1, WOOD[4]);
    p.rect(28, 15, 11, 3, IRON[2]); p.rect(28, 15, 11, 1, IRON[4]); p.rect(26, 16, 2, 1, IRON[2]); p.rect(31, 18, 5, 2, IRON[1]);
    p.px(29, 15, IRON[5]);
    // Löscheimer
    p.rect(3, 22, 6, 6, WOOD[2]); p.rect(3, 22, 1, 6, WOOD[4]); p.rect(3, 24, 6, 1, IRON[1]); p.rect(4, 22, 4, 1, '#1a2a44'); p.px(5, 22, '#3a5a80');
    // Glutschein am Steinsockel
    p.rect(14, 18, 8, 3, '#1a0806'); p.rect(15, 19, 6, 1, EMB[2]); g.rect(15, 19, 6, 1, EMB[3]);
  }, { ax: 20, box: [-11, -5, 18, 1], light: { dx: -2, dy: -18, radius: 90, color: [255, 140, 60], intensity: 1 } });
}

// ------------------------------------------------------------ Kisten
function crates(v) {
  const W = 26, H = 22;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    const crate = (x, y, w, h) => {
      p.rect(x, y, w, h, WOOD[2]); p.rect(x, y, w, 2, WOOD[3]); p.rect(x, y, w, 1, WOOD[4]); p.rect(x, y, 1, h, WOOD[4]);
      p.rect(x + w - 1, y, 1, h, WOOD[1]); p.rect(x, y + h - 1, w, 1, WOOD[1]);
      p.line(x + 1, y + 3, x + w - 2, y + h - 2, WOOD[3]); p.line(x + 1, y + h - 2, x + w - 2, y + 3, WOOD[1]);
      p.px(x + 1, y + 2, IRON[3]); p.px(x + w - 2, y + 2, IRON[2]);
    };
    if (v === 0) { crate(1, 9, 13, 12); crate(12, 11, 12, 10); crate(5, 0, 11, 10); p.rect(7, 4, 5, 2, '#1a1216'); p.px(8, 4, GOLD[2]); }
    else if (v === 1) {
      // Fass + Sack
      p.ellipse(9, 16, 7, 5, WOOD[1]); p.rect(3, 4, 13, 13, WOOD[2]); p.rect(3, 4, 3, 13, WOOD[3]); p.rect(14, 4, 2, 13, WOOD[1]);
      for (const y of [6, 14]) { p.rect(2, y, 15, 2, IRON[1]); p.rect(2, y, 15, 1, IRON[3]); }
      p.ellipse(9, 4, 6.5, 2, WOOD[3]); p.ellipse(9, 4, 5, 1.2, WOOD[2]); p.px(6, 3, WOOD[4]);
      p.ellipse(20, 17, 5, 4, '#5a4a32'); p.ellipse(19, 15, 3, 3, '#6e5c3e'); p.px(20, 12, '#4a3a26'); p.px(18, 14, '#8a7650'); p.rect(19, 12, 2, 1, LEA[2]);
    } else {
      // eisenbeschlagene Truhe mit Waffen
      p.rect(3, 9, 20, 11, WOOD[2]); p.rect(3, 6, 20, 4, WOOD[3]); p.rect(3, 6, 20, 1, WOOD[4]);
      for (const x of [3, 12, 21]) { p.rect(x, 6, 2, 14, IRON[1]); p.px(x, 6, IRON[4]); }
      p.rect(12, 11, 2, 3, GOLD[2]); p.px(12, 11, GOLD[4]); p.rect(3, 19, 20, 1, WOOD[1]);
      p.line(18, 0, 22, 8, IRON[3]); p.line(19, 0, 23, 8, IRON[1]); p.px(18, 0, IRON[5]);
      p.line(6, 1, 9, 7, WOOD[3]); p.rect(4, 0, 4, 2, IRON[3]);
    }
    p.rect(0, bottom, W, 1, ASHG[2]);
  }, { ax: 13, box: [-10, -4, 10, 1] });
}

// ------------------------------------------------------------ Riss-Siegel (Schrein)
function riftSeal(on) {
  const W = 26, H = 44;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 13;
    // Basaltsockel
    for (let y = bottom - 5; y <= bottom; y++) for (let x = 2; x < 24; x++) {
      const e = Math.abs(x - cx) / 11 + (bottom - y) / 12; if (e > 1.1) continue;
      p.px(x, y, BAS[y === bottom - 5 ? 5 : x < 8 ? 4 : x > 18 ? 2 : 3]);
    }
    // Monolith (leicht verjüngt, schräge Kappe)
    poly(p, [[7, bottom - 5], [8, 8], [12, 4], [18, 7], [19, bottom - 5]], (x, y) => {
      const rel = (x - 7) / 12;
      let k = rel < 0.2 ? 4 : rel < 0.5 ? 3 : rel < 0.8 ? 2 : 1;
      if (hash2(x, y, 661) < 0.06) k = 5;
      return OBS[k];
    });
    p.line(8, 8, 12, 4, OBS[5]); p.line(12, 4, 18, 7, OBS[4]); p.line(8, 9, 8, bottom - 6, OBS[5]);
    p.px(9, 10, OBS[6]); p.px(9, 11, OBS[5]);
    // Runen: Kreis mit Auge + Glyphen
    const R = on ? WHITE : OBS[0], R2 = on ? MAG[4] : OBS[0];
    const ring = [[12, 14], [13, 14], [14, 14], [15, 15], [15, 16], [15, 17], [14, 18], [13, 18], [12, 18], [11, 17], [11, 16], [11, 15]];
    for (const [x, y] of ring) { p.px(x, y, R2); if (on) g.px(x, y, MAG[3]); }
    p.px(13, 16, R); if (on) { g.px(13, 16, WHITE); g.px(12, 16, MAG[4]); g.px(14, 16, MAG[4]); }
    const glyphs = [[[12, 22], [12, 23], [12, 24], [13, 23], [14, 22], [14, 24]], [[11, 28], [12, 29], [13, 28], [14, 29], [15, 28], [13, 30]], [[12, 34], [13, 34], [14, 34], [13, 35], [12, 36], [14, 36]]];
    for (const gl of glyphs) for (const [x, y] of gl) { p.px(x, y, R); if (on) g.px(x, y, (x + y) % 2 ? MAG[4] : WHITE); }
    if (!on) for (const gl of glyphs) { const [x, y] = gl[0]; p.px(x - 1, y - 1, OBS[4]); }
    if (on) {
      // schwebende Splitter + Lichtfaden
      for (const [x, y] of [[4, 10], [21, 13], [3, 22], [22, 26]]) {
        p.px(x, y, OBS[4]); p.px(x, y + 1, OBS[3]); p.px(x + 1, y + 1, OBS[2]); p.px(x, y + 2, OBS[2]);
        g.px(x, y, MAG[4]); g.px(x, y + 1, MAG[3]);
      }
      for (let y = 5; y < bottom - 6; y += 3) g.px(8, y, MAG[2]);
      g.px(12, 4, WHITE); g.px(13, 5, MAG[4]);
    }
    // Schlacke/Asche am Fuß
    for (let i = 0; i < 6; i++) p.px(3 + ((i * 7) % 20), bottom, ASHG[3]);
  }, { ax: 13, box: [-6, -4, 6, 1], light: on ? { dx: 0, dy: -24, radius: 70, color: [200, 150, 255], intensity: 0.85 } : undefined });
}

// ------------------------------------------------------------ Tor zur Glutschmiede
function forgeGate() {
  const W = 76, H = 68;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 38;
    const rng = createRng(671);
    // Bergwand: unregelmäßige Oberkante
    const topAt = (x) => Math.round(2 + Math.abs(Math.sin(x * 0.11)) * 5 + Math.abs(x - cx) * 0.12 + hash2(x >> 2, 0, 672) * 3);
    for (let x = 0; x < W; x++) for (let y = topAt(x); y <= bottom; y++) {
      const facet = Math.floor((x + y * 0.5) / 7);
      let k = hash2(facet, Math.floor(y / 9), 673) < 0.5 ? 3 : 2;
      const lx = (x + y * 0.5) % 7;
      if (lx < 1) k = 4; else if (lx > 5.5) k = 1;
      if (y === topAt(x)) k = 5;
      if (hash2(x, y, 674) < 0.05) k -= 1;
      p.px(x, y, BAS[clampI(k, 7)]);
    }
    // Asche auf Kanten
    for (let x = 0; x < W; x++) if (hash2(x, 1, 675) < 0.5) p.px(x, topAt(x), ASHG[4]);
    // Portalrahmen: gestufter Sturz aus behauenem Stein
    const fx0 = 16, fx1 = 59, ftop = 12;
    for (let s = 0; s < 3; s++) {
      const y = ftop + s * 3, x0 = fx0 + 6 - s * 3, x1 = fx1 - 6 + s * 3;
      p.rect(x0, y, x1 - x0 + 1, 3, FST[4 - s]); p.rect(x0, y, x1 - x0 + 1, 1, FST[6 - s]); p.px(x1, y + 1, FST[1]);
    }
    // Pfosten
    for (const x0 of [fx0, fx1 - 6]) {
      for (let y = ftop + 9; y <= bottom; y++) for (let i = 0; i < 7; i++) {
        let k = i === 0 ? 5 : i < 3 ? 4 : i < 5 ? 3 : 2;
        if ((y - ftop) % 8 === 0) k = 1;
        p.px(x0 + i, y, FST[k]);
      }
    }
    // Emblem: Amboss mit Flamme über dem Tor
    p.rect(cx - 5, 5, 11, 3, IRON[2]); p.rect(cx - 5, 5, 11, 1, IRON[4]); p.rect(cx - 7, 6, 2, 1, IRON[2]); p.rect(cx - 2, 8, 5, 2, IRON[1]); p.rect(cx - 4, 10, 9, 1, IRON[1]);
    p.px(cx, 3, EMB[3]); p.px(cx - 1, 4, EMB[2]); p.px(cx + 1, 4, EMB[3]); p.px(cx, 2, EMB[4]);
    g.px(cx, 3, EMB[4]); g.px(cx - 1, 4, EMB[3]); g.px(cx + 1, 4, EMB[4]); g.px(cx, 2, EMB[5]); g.px(cx, 1, EMB[3]);
    // Runenband im Sturz
    for (let x = fx0 + 3; x < fx1 - 2; x += 4) { p.px(x, ftop + 7, EMB[2]); p.px(x + 1, ftop + 7, EMB[1]); g.px(x, ftop + 7, EMB[3]); }
    // Torflügel (Eisen), leicht geöffnet – Glutspalt in der Mitte
    const dx0 = fx0 + 7, dx1 = fx1 - 7, dtop = ftop + 9;
    for (let y = dtop; y <= bottom; y++) for (let x = dx0; x <= dx1; x++) {
      const leftLeaf = x < cx - 1, rightLeaf = x > cx + 1;
      let c;
      if (!leftLeaf && !rightLeaf) { c = y < dtop + 2 ? EMB[2] : EMB[4]; g.px(x, y, x === cx ? EMB[5] : EMB[4]); }
      else {
        const lx = leftLeaf ? x - dx0 : dx1 - x;
        let k = leftLeaf ? (lx < 2 ? 3 : 2) : 1;
        if (lx % 6 === 5) k = 0;
        c = DOOR[k];
        if ((y - dtop) % 7 === 0) c = leftLeaf ? DOOR[4] : DOOR[3]; // Beschläge
        if ((y - dtop) % 7 === 1 && lx % 6 === 2) c = IRON[4];
        // Glutschein an der Spaltkante
        if (lx > (x < cx ? cx - 1 - dx0 - 2 : dx1 - cx - 3)) c = y % 3 ? EMB[1] : '#4a1a0a';
      }
      p.px(x, y, c);
    }
    // Glut kriecht unter der Tür hervor
    for (let x = dx0; x <= dx1; x++) { p.px(x, bottom, EMB[2]); g.px(x, bottom, Math.abs(x - cx) < 4 ? EMB[4] : EMB[2]); }
    for (let y = dtop + 3; y < bottom; y += 2) { g.px(cx - 2, y, EMB[2]); g.px(cx + 2, y, EMB[2]); }
    // Lavarinnen seitlich des Portals
    for (const lx of [8, 67]) {
      for (let y = 20; y <= bottom - 3; y++) {
        const x = lx + Math.round(Math.sin(y * 0.3) * 1);
        p.px(x, y, EMB[3]); p.px(x + 1, y, EMB[2]); p.px(x - 1, y, BAS[1]);
        g.px(x, y, EMB[4]); g.px(x + 1, y, EMB[3]);
      }
      // Becken
      p.ellipse(lx, bottom - 1, 5, 2, BAS[1]); p.ellipse(lx, bottom - 1, 3.5, 1.2, EMB[3]); p.px(lx - 1, bottom - 1, EMB[5]);
      g.ellipse(lx, bottom - 1, 3.5, 1.2, EMB[4]); g.px(lx - 1, bottom - 1, EMB[5]);
    }
    // Hitzeflimmer-Glutpunkte in der Wand
    for (let i = 0; i < 8; i++) { const x = rng.int(2, W - 3), y = rng.int(24, bottom - 4); if (x > fx0 - 2 && x < fx1 + 2) continue; p.px(x, y, EMB[1]); g.px(x, y, EMB[2]); }
    // Stufen vor dem Tor
    p.rect(fx0 + 4, bottom - 1, fx1 - fx0 - 7, 1, FST[5]);
  }, {
    ax: 38, light: { dx: 0, dy: -18, radius: 110, color: [255, 120, 50], intensity: 1 },
    extra: { boxes: [[-38, -8, -12, 1], [12, -8, 38, 1]], door: { dx: 0, dy: -2 } },
  });
}

// ------------------------------------------------------------ Lavaschlot
function lavaVent() {
  const W = 28, H = 14;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cy = bottom - 4, cx = 14;
    // Kruste
    p.ellipse(cx, cy, 12, 4, BAS[2]); p.ellipse(cx - 1, cy - 1, 10, 3, BAS[3]); p.ellipse(cx - 3, cy - 2, 5, 1.5, BAS[4]);
    // Spalt (gezackt)
    for (let x = cx - 8; x <= cx + 8; x++) {
      const y = cy + Math.round(Math.sin(x * 0.9) * 1);
      const hw = Math.max(0, 1.6 - Math.abs(x - cx) / 6);
      p.px(x, y - 1, BAS[1]);
      for (let d = 0; d <= Math.round(hw); d++) { p.px(x, y + d, d === 0 ? EMB[4] : EMB[3]); g.px(x, y + d, d === 0 ? EMB[5] : EMB[4]); }
      p.px(x, y + Math.round(hw) + 1, EMB[1]); g.px(x, y + Math.round(hw) + 1, EMB[2]);
    }
    // Schlackebrocken am Rand
    for (const [x, y] of [[3, cy], [24, cy + 1], [6, cy + 3], [21, cy - 2]]) { p.rect(x, y, 2, 2, BAS[3]); p.px(x, y, BAS[5]); }
    g.ctx.fillStyle = 'rgba(255,120,50,0.25)'; g.ctx.fillRect(cx - 4, cy - 3, 9, 2);
  }, { ax: 14, ay: H - 2, light: { dx: 0, dy: -4, radius: 48, color: [255, 120, 50], intensity: 0.8 }, extra: { steam: { dx: 0, dy: -4 } } });
}

// ============================================================ Runde 5: Gebirge
// Rampenstufen, Lavabrücke, Stolleneingang, Gleise, Loren, Grubenstützen, Schlackenhalden,
// Steinmänner, Feuerschalen, Fernrohr am Adlerhorst, verborgenes Versteck.
// Flache Bodenstücke (Stufen, Gleise) ohne Umriss und mit Anker über dem Bild: sie liegen
// immer unter dem Helden (Sortierung nach Anker-y).
const RUST = ['#140a08', '#24120d', '#3a1d13', '#55291a', '#723a22', '#8f4e2c'];
const BRASS = ['#2a1a08', '#4a3010', '#7a5a1e', '#b08a34', '#e0c060', '#fff0a8'];
const SOOT = ['#060508', '#0b090d', '#110e14', '#18141c'];

function mkFlat(W, H, draw, { ax, ay, extra } = {}) {
  const gl = new PixelCanvas(W + 2, H + 2);
  gl.ctx.translate(1, 1);
  let used = false;
  const g = { px: (x, y, c) => { used = true; gl.px(x, y, c); }, rect: (x, y, w, h, c) => { used = true; gl.rect(x, y, w, h, c); } };
  const sprite = buildFrame(W, H, ax, ay, (p) => draw(p, g), { outline: false });
  const e = { sprite };
  if (used) e.glow = gl.canvas;
  if (extra) Object.assign(e, extra);
  return e;
}

// Flammen als Einzelbilder (Emissive-Ebene), Glutrampe
function emberFlames(w, h, n, seed) {
  const frames = [];
  const rng = createRng(seed);
  for (let f = 0; f < n; f++) {
    const p = new PixelCanvas(w, h);
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);                                   // 0 oben, 1 unten
      const sway = Math.sin(f * 1.7 + y * 0.8) * (1 - t) * 1.3;
      const half = Math.max(0, (w / 2) * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.6) - rng.range(0, 0.5));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - sway) / Math.max(half, 0.01);
        if (d > 1 || half < 0.45) continue;
        const heat = (1 - d) * 0.6 + t * 0.6 + rng.range(-0.1, 0.1);
        p.px(x, y, heat > 1.0 ? EMB[5] : heat > 0.82 ? EMB[4] : heat > 0.6 ? EMB[3] : heat > 0.4 ? EMB[2] : EMB[1]);
      }
    }
    frames.push(p.canvas);
  }
  return frames;
}

// Unregelmäßiger Basaltklumpen, Licht von links oben
function basLump(p, cx, cy, rx, ry, seed, ramp = BAS) {
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const a = Math.atan2(dy, dx), e = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 7 + seed * 1.3) * 0.06;
    const d = Math.hypot(dx, dy) / e;
    if (d > 1) continue;
    const l = -0.55 * dx - 0.7 * dy + 0.5 * Math.sqrt(Math.max(0, 1 - d * d));
    let k = Math.round(1.6 + l * 2.6 + (hash2(x, y, seed) - 0.5) * 0.9);
    p.px(x, y, ramp[clampI(k, ramp.length - 1)]);
  }
}

// ------------------------------------------------------------ Rampenstufen (in den Fels gehauen)
function rampSteps(rows) {
  const W = 70, H = rows * 16 + 2, X0 = 3, X1 = 66;   // Lauffläche 64 px
  return mkFlat(W, H, (p, g) => {
    const stepH = 8, n = Math.ceil((H - 1) / stepH);
    for (let s = 0; s < n; s++) {
      const y0 = s * stepH;
      const j1 = X0 + 14 + ((s * 13) % 17), j2 = X0 + 38 + ((s * 7) % 13);
      for (let x = X0; x <= X1; x++) {
        const nz = hash2(x, s, 901), jag = hash2(x >> 3, s, 905) < 0.12 ? 1 : 0;
        const wear = Math.abs(x - (X0 + X1) / 2) < 16;
        for (let y = y0; y < Math.min(H, y0 + stepH); y++) {
          const ly = y - y0;
          let c;
          if (ly === 0) c = BAS[2];                                            // Schatten der Setzstufe darüber
          else if (ly <= 3) c = wear ? (nz < 0.2 ? BAS[5] : BAS[6]) : (nz < 0.25 ? BAS[4] : BAS[5]); // Trittfläche
          else if (ly === 4 + jag) c = ASHG[5];                                // Stufenkante im Licht
          else if (ly < 4 + jag) c = BAS[5];
          else c = ly === 7 ? BAS[0] : BAS[ly === 5 + jag ? 3 : 2];             // Setzstufe
          if ((x === j1 || x === j2) && ly > 0) c = ly <= 4 ? BAS[2] : BAS[0];
          p.px(x, y, c);
        }
        if (nz > 0.9) p.px(x, y0 + 1, ASHG[3]);
      }
      if (hash2(s, 1, 903) < 0.3) {
        const cx = X0 + 8 + Math.floor(hash2(s, 2, 904) * 46);
        for (let i = 0; i < 5; i++) { p.px(cx + i, y0 + 6 - (i % 2), EMB[2]); g.px(cx + i, y0 + 6 - (i % 2), EMB[3]); }
      }
    }
    // Felswangen links und rechts
    for (let y = 0; y < H; y++) {
      for (let i = 0; i < 4; i++) { p.px(i, y, BAS[[1, 3, 2, 1][i]]); p.px(W - 1 - i, y, BAS[[0, 1, 2, 1][i]]); }
      if (y % 8 === 4) { p.px(1, y, BAS[4]); p.px(2, y, BAS[3]); }
    }
  }, { ax: 27, ay: -2 });
}

// ------------------------------------------------------------ Lavabrücke (Basalt, 6 Kacheln)
function lavaBridge() {
  const W = 96, H = 70, R0 = 8, DECK0 = R0 + 10, DECK1 = R0 + 47, FACE = R0 + 48;
  return mk(W, H, (p, g) => {
    // Unterseite: Bogenwand über der Lava mit glühenden Durchlässen
    for (let y = FACE; y < H; y++) for (let x = 0; x < W; x++) {
      const cell = Math.floor(x / 24), lx = x % 24;
      const inArch = lx >= 4 && lx <= 20 && y >= FACE + 3 + Math.round((1 - Math.sqrt(Math.max(0, 1 - ((lx - 12) / 8.5) ** 2))) * 6);
      if (inArch && cell > 0 && cell < 3) {
        const deep = (H - 1 - y) / (H - FACE);
        const c = y > H - 3 ? (hash2(x, y, 917) < 0.3 ? '#5e341a' : '#432412') : deep > 0.6 ? SOOT[2] : '#1c0f09';
        p.px(x, y, c);
        continue;
      }
      let k = (y - FACE) % 5 === 0 ? 1 : (x + (Math.floor((y - FACE) / 5) % 2) * 6) % 12 === 0 ? 1 : 3;
      if (hash2(x, y, 911) < 0.08) k--;
      if (y === FACE) k = 5;
      p.px(x, y, FST[clampI(k, 7)]);
    }
    // Deck: lange Steinplatten in Gehrichtung, abgetretene Mitte, Fugen dezent
    for (let y = DECK0; y <= DECK1; y++) {
      const row = Math.floor((y - DECK0) / 6), ly = (y - DECK0) % 6;
      let off = Math.floor(hash2(row, 0, 912) * 14), x = -off, col = 0;
      while (x < W) {
        const len = 14 + Math.floor(hash2(row, col, 913) * 10);
        const base = hash2(row, col, 914) < 0.35 ? 3 : 4;
        for (let i = 0; i < len; i++) {
          const xx = x + i; if (xx < 0 || xx >= W) continue;
          let k = base;
          if (ly === 0 || i === 0) k = 2; else if (ly === 1 || i === 1) k = base + 1;
          if (ly >= 2 && ly <= 4 && Math.abs(y - (DECK0 + DECK1) / 2) < 9 && hash2(xx, y, 915) < 0.5) k = Math.min(6, k + 1);
          if (hash2(xx, y, 916) < 0.03) k = 2;
          p.px(xx, y, FST[clampI(k, 7)]);
        }
        x += len; col++;
      }
    }
    // Nördliche Brüstung (Mauerkrone + Wand)
    for (let x = 0; x < W; x++) {
      for (let y = R0; y < R0 + 3; y++) p.px(x, y, y === R0 ? FST[6] : FST[5]);
      for (let y = R0 + 3; y < DECK0; y++) {
        const brick = (x + ((y - R0) > 6 ? 4 : 0)) % 8 === 0;
        p.px(x, y, brick ? FST[1] : y === R0 + 3 ? FST[2] : FST[3]);
      }
      if (hash2(x, 1, 915) < 0.2) p.px(x, R0, ASHG[4]);
    }
    // Südliche Bordkante mit Kettenpfosten
    for (let x = 0; x < W; x++) { p.px(x, DECK1 - 2, FST[5]); p.px(x, DECK1 - 1, FST[3]); p.px(x, DECK1, FST[1]); }
    for (let px0 = 10; px0 < W - 4; px0 += 19) {
      p.rect(px0, DECK1 - 7, 3, 6, IRON[2]); p.px(px0, DECK1 - 7, IRON[4]); p.rect(px0 + 2, DECK1 - 6, 1, 5, IRON[1]);
    }
    for (let px0 = 10; px0 < W - 23; px0 += 19) for (let i = 2; i < 19; i++) {
      const sag = Math.round(Math.sin((i / 19) * Math.PI) * 2);
      p.px(px0 + i, DECK1 - 6 + sag, i % 2 ? IRON[3] : IRON[2]);
    }
    // Endpfeiler mit Feuerkörben
    for (const x0 of [0, W - 9]) {
      for (let y = 0; y <= DECK1; y++) for (let i = 0; i < 9; i++) {
        let k = i < 2 ? 5 : i < 6 ? 4 : 2;
        if ((y % 6) === 0) k -= 2;
        if (hash2(x0 + i, y, 916) < 0.07) k--;
        if (y > R0 + 4 && y < DECK1 - 10) continue;            // nur Kopf und Fuß, dazwischen Deck sichtbar
        p.px(x0 + i, y, FST[clampI(k, 7)]);
      }
      p.rect(x0, 0, 9, 1, FST[6]);
      // Feuerkorb oben
      p.rect(x0 + 2, 1, 5, 2, IRON[2]); p.px(x0 + 3, 1, EMB[4]); p.px(x0 + 5, 1, EMB[3]);
      g.rect(x0 + 2, 0, 5, 2, EMB[4]); g.px(x0 + 4, -1, EMB[3]);
    }
  }, { ax: 40, ay: 22, box: [-40, -14, 56, 1], extra: { low: true, lights: [{ dx: -36, dy: -22, radius: 54, color: [255, 140, 60], intensity: 0.8 }, { dx: 52, dy: -22, radius: 54, color: [255, 140, 60], intensity: 0.8 }] } });
}

// ------------------------------------------------------------ Stolleneingang in der Felswand
function mineEntrance() {
  const W = 62, H = 52, cx = 31, by = H - 1;
  return mk(W, H, (p, g) => {
    // Felsumrahmung (verschmilzt mit der Klippe)
    basLump(p, 9, 22, 10, 22, 921); basLump(p, 53, 22, 10, 22, 922); basLump(p, cx, 8, 26, 9, 923);
    // Schwarzer Schlund mit Tiefe
    for (let y = 14; y <= by; y++) for (let x = 15; x <= 47; x++) {
      const d = Math.max(Math.abs(x - cx) / 16, (by - y) / 36);
      p.px(x, y, d > 0.85 ? SOOT[2] : d > 0.55 ? SOOT[1] : SOOT[0]);
    }
    // Hinterer Rahmen (perspektivisch kleiner)
    p.rect(22, 22, 2, by - 25, WOOD[1]); p.rect(39, 22, 2, by - 25, WOOD[0]); p.rect(21, 20, 21, 2, WOOD[1]); p.px(22, 20, WOOD[2]);
    // Gleise ins Dunkel
    for (let y = by; y > by - 18; y--) {
      const t = (by - y) / 18, sp = Math.round(9 - t * 5);
      p.px(cx - sp, y, IRON[t < 0.5 ? 3 : 2]); p.px(cx + sp, y, IRON[t < 0.5 ? 2 : 1]);
      if (y % 3 === 0) for (let x = cx - sp - 1; x <= cx + sp + 1; x++) p.px(x, y, WOOD[t < 0.5 ? 2 : 1]);
    }
    // Vorderer Rahmen: Stempel + Kappe + Kopfbänder
    for (const [x0, lit] of [[13, true], [45, false]]) {
      for (let y = 13; y <= by; y++) for (let i = 0; i < 5; i++) {
        let k = lit ? [4, 4, 3, 2, 1][i] : [3, 2, 2, 1, 0][i];
        if (y % 9 === 0 && i > 0) k--;
        if (hash2(x0 + i, y, 924) < 0.08) k--;
        p.px(x0 + i, y, WOOD[clampI(k, 5)]);
      }
      p.rect(x0, by - 1, 5, 2, WOOD[0]);
    }
    for (let y = 9; y < 15; y++) for (let x = 10; x < 53; x++) {
      let k = y === 9 ? 4 : y < 12 ? 3 : y === 14 ? 0 : 2;
      if ((x - 10) % 11 === 0) k = 1;
      p.px(x, y, WOOD[k]);
    }
    p.line(18, 15, 22, 20, WOOD[3]); p.line(19, 15, 23, 20, WOOD[1]); p.line(44, 15, 40, 20, WOOD[2]); p.line(43, 15, 39, 20, WOOD[0]);
    // Eisenklammern
    for (const x of [15, 47]) { p.rect(x - 1, 11, 3, 2, IRON[2]); p.px(x - 1, 11, IRON[4]); }
    // Laterne links an der Kappe
    p.line(17, 15, 17, 18, IRON[2]);
    p.rect(15, 19, 5, 6, IRON[1]); p.rect(16, 20, 3, 4, EMB[4]); p.px(16, 20, EMB[5]); p.rect(15, 19, 5, 1, IRON[3]);
    g.rect(15, 19, 5, 6, EMB[4]); g.rect(16, 20, 3, 4, EMB[5]);
    // Schild mit Kerben (Stollen-Nummer)
    p.rect(26, 2, 11, 6, WOOD[3]); p.rect(26, 2, 11, 1, WOOD[4]); p.rect(26, 7, 11, 1, WOOD[1]);
    for (const x of [28, 30, 33]) p.line(x, 3, x, 5, WOOD[0]); p.line(34, 3, 35, 5, WOOD[0]);
    p.px(26, 4, IRON[3]); p.px(36, 4, IRON[3]);
    // Erzbrocken, Hacke, Asche am Fuß
    for (const [x, y] of [[6, by - 1], [9, by], [52, by - 1], [56, by]]) { p.rect(x, y - 1, 3, 2, BAS[3]); p.px(x, y - 1, BAS[5]); p.px(x + 1, y, EMB[3]); g.px(x + 1, y, EMB[4]); }
    p.line(50, by - 1, 55, by - 9, WOOD[3]); p.line(52, by - 10, 58, by - 7, IRON[3]); p.px(52, by - 10, IRON[5]);
    ashPatch(p, cx, by, 14, 1, 925);
  }, { ax: 31, box: [-19, -8, 19, 1], light: { dx: -14, dy: -28, radius: 66, color: [255, 150, 70], intensity: 0.85 } });
}

// ------------------------------------------------------------ Gleisstück (senkrecht, eine Kachel)
function mineRails() {
  return mkFlat(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 2; x <= 13; x++) if (hash2(x, y, 931) < 0.35) p.px(x, y, hash2(x, y, 932) < 0.5 ? BAS[2] : BAS[3]);
    for (const y of [1, 5, 9, 13]) { p.rect(2, y, 12, 1, WOOD[3]); p.rect(2, y + 1, 12, 1, WOOD[1]); p.px(2, y, WOOD[4]); }
    for (const x of [4, 11]) { p.rect(x, 0, 1, 16, IRON[3]); p.rect(x + 1, 0, 1, 16, IRON[1]); for (const y of [1, 5, 9, 13]) p.px(x, y, IRON[4]); }
  }, { ax: 8, ay: -2 });
}

// ------------------------------------------------------------ Lore mit glühendem Erz
function mineCart(v) {
  const W = 28, H = 24, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 14, by - 1, 12, 2, 940 + v);
    // Gleisstück
    p.rect(1, by - 2, 26, 1, IRON[3]); p.rect(1, by - 1, 26, 1, IRON[1]);
    for (const x of [3, 9, 15, 21]) p.rect(x, by, 3, 1, WOOD[2]);
    // Wanne (oben breiter)
    poly(p, [[2, 7], [26, 7], [23, by - 5], [5, by - 5]], (x, y) => {
      let k = x < 8 ? 4 : x < 18 ? 3 : 2;
      if (y === 7) k = 5;
      if ((x - 2) % 8 === 0) k = 1;
      return RUST[k];
    });
    for (const y of [9, by - 7]) for (let x = 3; x < 25; x++) p.px(x, y, (x & 1) ? IRON[2] : IRON[3]);
    for (const x of [6, 13, 20]) { p.px(x, 9, IRON[5]); p.px(x, by - 7, IRON[4]); }
    // Ladung
    if (v === 0) {
      for (let x = 3; x < 25; x++) { const h = 2 + Math.round(Math.sin(x * 0.55) * 1.5 + 1.5); for (let y = 7 - h; y < 7; y++) p.px(x, y, hash2(x, y, 941) < 0.3 ? BAS[5] : BAS[3]); }
      for (const [x, y] of [[7, 4], [12, 3], [17, 5], [21, 4], [10, 6]]) { p.px(x, y, EMB[4]); p.px(x + 1, y, EMB[3]); g.px(x, y, EMB[5]); g.px(x + 1, y, EMB[4]); }
    } else {
      for (let x = 3; x < 25; x++) for (let y = 5; y < 7; y++) p.px(x, y, OBS[(x + y) % 3 + 2]);
      p.px(9, 5, OBS[6]); p.px(16, 4, OBS[5]); p.px(16, 3, OBS[6]); g.px(16, 4, '#4a3a70');
    }
    // Räder
    for (const wx of [8, 20]) {
      p.ellipse(wx, by - 4, 3, 3, IRON[1]); p.ellipse(wx, by - 4, 2, 2, IRON[2]); p.px(wx - 1, by - 6, IRON[4]); p.px(wx, by - 4, IRON[0]);
    }
  }, { ax: 14, box: [-10, -5, 10, 1], light: v === 0 ? { dx: 0, dy: -18, radius: 36, color: [255, 120, 50], intensity: 0.5 } : undefined });
}

// ------------------------------------------------------------ Grubenstütze mit Laterne
function pitProps() {
  const W = 26, H = 38, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 13, by - 1, 11, 1, 951);
    for (const [x0, lit] of [[3, true], [19, false]]) {
      for (let y = 6; y <= by; y++) for (let i = 0; i < 4; i++) {
        let k = lit ? [4, 3, 2, 1][i] : [3, 2, 1, 0][i];
        if (y % 8 === 0) k--;
        p.px(x0 + i, y, WOOD[clampI(k, 5)]);
      }
    }
    for (let y = 3; y < 8; y++) for (let x = 0; x < W; x++) p.px(x, y, WOOD[y === 3 ? 4 : y === 7 ? 0 : y === 4 ? 3 : 2]);
    for (const x of [1, 12, 23]) { p.px(x, 3, WOOD[1]); p.px(x, 4, WOOD[1]); }
    p.line(7, 8, 10, 12, WOOD[3]); p.line(18, 8, 15, 12, WOOD[1]);
    // Laterne an der Kette
    p.line(13, 8, 13, 13, IRON[2]);
    p.rect(11, 14, 5, 7, IRON[1]); p.rect(12, 15, 3, 5, EMB[4]); p.px(12, 15, EMB[5]); p.rect(11, 14, 5, 1, IRON[3]); p.px(13, 21, IRON[2]);
    g.rect(11, 14, 5, 7, EMB[3]); g.rect(12, 15, 3, 5, EMB[5]);
  }, { ax: 13, extra: { boxes: [[-10, -3, -5, 1], [6, -3, 10, 1]] }, light: { dx: 0, dy: -20, radius: 62, color: [255, 150, 70], intensity: 0.8 } });
}

// ------------------------------------------------------------ Schlackenhalde
function slagHeap(v) {
  const W = [30, 24, 34][v], H = [17, 14, 19][v];
  return mk(W, H, (p, g) => {
    const by = H - 1, cx = W / 2;
    ashPatch(p, Math.floor(cx), by - 1, Math.floor(W / 2) - 1, 2, 960 + v);
    const humps = [[[cx - 5, by - 6, 8, 6], [cx + 6, by - 4, 6, 4]], [[cx - 2, by - 5, 8, 5], [cx + 5, by - 3, 4, 3]], [[cx - 6, by - 7, 9, 7], [cx + 6, by - 5, 8, 5], [cx + 1, by - 9, 5, 4]]][v];
    for (const [hx, hy, rx, ry] of humps) basLump(p, hx, hy, rx, ry, 961 + v + hx);
    // glasige Brocken und Obsidianglanz
    const rng = createRng(962 + v);
    for (let i = 0; i < 9; i++) {
      const x = Math.round(rng.range(3, W - 4)), y = Math.round(rng.range(by - 10, by - 1));
      if (p.ctx.getImageData(x, y, 1, 1).data[3] === 0) continue;
      p.px(x, y, OBS[rng.chance(0.5) ? 4 : 3]); p.px(x - 1, y - 1, OBS[5]);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(4, W - 5)), y = Math.round(rng.range(by - 6, by - 1));
      if (p.ctx.getImageData(x, y, 1, 1).data[3] === 0) continue;
      p.px(x, y, EMB[3]); g.px(x, y, EMB[4]);
    }
    // Asche auf den Kuppen
    for (let x = 2; x < W - 2; x++) for (let y = 0; y < by; y++) {
      if (p.ctx.getImageData(x, y, 1, 1).data[3] === 0) continue;
      if (hash2(x, 0, 963 + v) < 0.5) p.px(x, y, ASHG[3 + (hash2(x, 1, 964) < 0.4 ? 1 : 0)]);
      break;
    }
  }, { ax: Math.floor([30, 24, 34][v] / 2), box: [-Math.floor([30, 24, 34][v] / 2) + 4, -5, Math.floor([30, 24, 34][v] / 2) - 4, 1], extra: { low: true } });
}

// ------------------------------------------------------------ Steinmann mit Wimpel
function cairn(v) {
  const W = 16, H = 26, by = H - 1;
  return mk(W, H, (p) => {
    ashPatch(p, 8, by, 6, 1, 970 + v);
    const stones = [[8, by - 2, 6, 2.4], [7, by - 6, 5, 2], [8.5, by - 9.5, 4, 1.8], [7.5, by - 12.5, 3, 1.5], [8, by - 15, 2, 1.2]];
    stones.forEach(([x, y, rx, ry], i) => basLump(p, x, y, rx, ry, 971 + i + v * 7, FST));
    // Stab mit rotem Wimpel
    p.line(9, by - 16, 9, 2, WOOD[3]); p.px(9, 1, WOOD[4]);
    const len = v ? 6 : 5;
    for (let i = 0; i < len; i++) { const y = 3 + Math.round(Math.sin(i * 0.9) * 0.8); p.px(10 + i, y, CRIM[i < 2 ? 4 : 3]); p.px(10 + i, y + 1, CRIM[2]); if (i < len - 2) p.px(10 + i, y + 2, CRIM[1]); }
  }, { ax: 8, box: [-4, -3, 4, 1] });
}

// ------------------------------------------------------------ Feuerschale auf Dreibein
function brazier() {
  const W = 16, H = 22, by = H - 1;
  const e = mk(W, H, (p, g) => {
    ashPatch(p, 8, by, 6, 1, 981);
    p.line(3, by, 6, 12, IRON[2]); p.line(13, by, 10, 12, IRON[1]); p.line(8, by - 1, 8, 13, IRON[1]);
    p.px(3, by, IRON[3]); p.px(13, by, IRON[2]);
    p.rect(2, 9, 12, 2, IRON[3]); p.rect(3, 11, 10, 1, IRON[2]); p.rect(4, 12, 8, 1, IRON[1]);
    p.rect(2, 9, 12, 1, IRON[4]); p.px(2, 9, IRON[5]);
    for (let x = 3; x < 13; x++) { const c = hash2(x, 0, 982) < 0.4 ? EMB[4] : EMB[3]; p.px(x, 8, c); g.px(x, 8, EMB[5]); }
    p.px(5, 7, EMB[3]); p.px(10, 7, EMB[2]); g.px(5, 7, EMB[4]); g.px(10, 7, EMB[3]);
  }, { ax: 8, box: [-4, -3, 4, 1], light: { dx: 0, dy: -16, radius: 82, color: [255, 140, 60], intensity: 0.95 }, extra: { embers: { dx: 0, dy: -16, rate: 1.4 } } });
  e.flames = emberFlames(9, 12, 6, 983);
  e.flameAt = { dx: -4, dy: -24 };
  return e;
}

// ------------------------------------------------------------ Fernrohr am Adlerhorst
function lookoutSpyglass() {
  const W = 44, H = 36, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 22, by, 20, 1, 991);
    // niedrige Bruchsteinmauer (Brüstung) hinten
    for (let x = 2; x < 42; x++) for (let y = by - 10; y <= by - 4; y++) {
      const course = Math.floor((y - (by - 10)) / 3), brick = (x + course * 3) % 7 === 0;
      let k = brick ? 1 : y === by - 10 ? 6 : 4 - course;
      if (hash2(x, y, 992) < 0.08) k--;
      p.px(x, y, FST[clampI(k, 7)]);
    }
    // Dreibein + Messingrohr, nach Südosten geneigt
    p.line(14, by - 1, 18, by - 14, WOOD[3]); p.line(22, by - 1, 19, by - 14, WOOD[2]); p.line(18, by, 19, by - 14, WOOD[1]);
    for (let i = 0; i < 16; i++) {
      const x = 12 + i, y = by - 22 + Math.round(i * 0.45);
      const w = i < 4 ? 1 : i < 11 ? 2 : 3;
      for (let j = 0; j < w; j++) p.px(x, y + j - 1, j === 0 ? BRASS[4] : j === 1 ? BRASS[3] : BRASS[2]);
      if (i === 4 || i === 11) { p.px(x, y - 1, BRASS[5]); p.px(x, y + w - 1, BRASS[1]); }
    }
    p.px(28, by - 15, '#bfe4ff'); g.px(28, by - 15, '#5a7aa0');
    // Holzbank rechts, Fahne links
    p.rect(30, by - 5, 10, 2, WOOD[3]); p.rect(30, by - 5, 10, 1, WOOD[4]); p.rect(31, by - 3, 1, 3, WOOD[1]); p.rect(38, by - 3, 1, 3, WOOD[1]);
    p.line(5, by - 2, 5, 2, WOOD[3]); p.px(5, 1, GOLD[3]);
    for (let x = 6; x < 15; x++) for (let y = 3; y < 10 - Math.floor((x - 6) / 3); y++) p.px(x, y + Math.round(Math.sin(x * 0.8)), y === 3 ? CRIM[4] : CRIM[3 - ((x + y) % 2)]);
    p.px(8, 5, GOLD[3]); p.px(9, 6, GOLD[4]); p.px(10, 5, GOLD[3]);
  }, { ax: 22, box: [-19, -6, 19, 1] });
}

// ------------------------------------------------------------ Verborgenes Versteck (Truhe, offen/zu)
function hiddenCache(open) {
  const W = 26, H = 22, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 13, by - 1, 12, 2, 995);
    // Truhe halb in Asche
    p.rect(4, 10, 18, 10, WOOD[2]); p.rect(4, 10, 2, 10, WOOD[3]); p.rect(20, 10, 2, 10, WOOD[1]);
    for (const x of [4, 12, 20]) { p.rect(x, 10, 2, 10, IRON[1]); p.px(x, 10, IRON[3]); }
    for (let x = 3; x < 23; x++) if (hash2(x, 2, 996) < 0.7) p.px(x, by - 2 + (hash2(x, 3, 997) < 0.5 ? 0 : -1), ASHG[3]);
    if (!open) {
      p.rect(4, 5, 18, 5, WOOD[3]); p.rect(4, 5, 18, 1, WOOD[4]); p.rect(4, 9, 18, 1, WOOD[0]);
      for (const x of [4, 12, 20]) { p.rect(x, 5, 2, 5, IRON[2]); p.px(x, 5, IRON[4]); }
      p.rect(12, 9, 2, 3, GOLD[2]); p.px(12, 9, GOLD[4]);
      p.px(16, 6, ASHG[4]); p.px(7, 6, ASHG[4]);
    } else {
      // Deckel aufgeklappt (nach hinten), Inneres leer mit Restglanz
      p.rect(4, 1, 18, 4, WOOD[2]); p.rect(4, 1, 18, 1, WOOD[3]);
      for (const x of [4, 12, 20]) p.rect(x, 1, 2, 4, IRON[1]);
      p.rect(6, 5, 14, 5, '#0a0607'); p.rect(6, 5, 14, 1, WOOD[0]);
      p.px(10, 8, GOLD[3]); p.px(15, 7, GOLD[4]); g.px(15, 7, GOLD[2]);
    }
  }, { ax: 13, box: [-9, -4, 9, 1] });
}

// ------------------------------------------------------------ Klippenwand aus Basaltsäulen (eine Kachel breit)
// Deckt die beiden Wandreihen einer Klippe (32 px) und wirft 4 px Schatten auf den Boden davor.
// Marke auf der unteren Wandkachel; Säulenköpfe sitzen bündig an der Oberkante, damit Nachbarn nahtlos passen.
function basaltFace(v) {
  const W = 16, H = 36, FH = 32;
  const cols = [[5, 6, 5], [4, 6, 6], [6, 5, 5], [5, 5, 6], [3, 7, 6], [6, 6, 4], [4, 5, 7], [7, 5, 4]][v];
  return mkFlat(W, H, (p, g) => {
    let x0 = 0;
    cols.forEach((cw, ci) => {
      const cap = Math.floor(hash2(v, ci, 1001) * 4);              // Kopfhöhe 0–3 px versetzt
      const lift = hash2(v, ci, 1009) < 0.3 ? 1 : hash2(v, ci, 1009) > 0.8 ? -1 : 0; // Säule tritt vor/zurück
      const breaks = [9 + Math.floor(hash2(v, ci, 1002) * 6), 20 + Math.floor(hash2(v, ci, 1003) * 6)];
      for (let x = x0; x < x0 + cw; x++) {
        const rel = (x - x0) / Math.max(1, cw - 1);
        for (let y = 0; y < FH; y++) {
          let k;
          if (y < cap) k = 3;                                       // Felskante über dem Kopf
          else if (y === cap) k = rel < 0.5 ? 6 : 5;                // Kopf, Licht
          else if (y === cap + 1) k = rel < 0.3 ? 5 : rel < 0.8 ? 4 : 3;
          else {
            k = rel < 0.2 ? 5 : rel < 0.45 ? 4 : rel < 0.75 ? 3 : 2;
            if (x === x0 + cw - 1) k = 1;
            if (breaks.includes(y)) k = 0; else if (breaks.includes(y - 1)) k = Math.min(6, k + 1);
            if (y > FH - 5) k = Math.max(1, k - 1 - (y > FH - 3 ? 1 : 0));   // Fuß im Schatten
            if (hash2(x, y, 1004 + v) < 0.07) k--;
            k += lift;
          }
          p.px(x, y, BAS[clampI(k, 7)]);
        }
        if (x === x0) for (let y = cap + 2; y < FH - 3; y++) if (hash2(x, y, 1005) < 0.5) p.px(x, y, BAS[6]);
        if (hash2(x, v, 1006) < 0.45) p.px(x, cap, ASHG[4]);         // Asche auf den Köpfen
      }
      x0 += cw;
      if (x0 < W) for (let y = cap; y < FH; y++) p.px(x0 - 1, y, BAS[0]); // Fuge
    });
    // Geröll am Fuß
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(hash2(v, i, 1007) * 13), y = FH - 2 + Math.floor(hash2(v, i, 1008) * 2);
      p.px(x, y, BAS[4]); p.px(x + 1, y, BAS[2]); p.px(x, y - 1, BAS[5]);
    }
    // Roststreifen aus erzhaltigen Lagen (Runde 2)
    if (v === 1 || v === 4 || v === 6) {
      const sx = 2 + ((v * 5) % 11), len = 10 + v * 2;
      for (let y = 3; y < 3 + len; y++) { const fade = (y - 3) / len; if (hash2(sx, y, 1011) < 0.85 - fade * 0.5) p.px(sx, y, RUST[fade < 0.4 ? 4 : 3]); if (hash2(sx + 1, y, 1012) < 0.5 - fade * 0.4) p.px(sx + 1, y, RUST[2]); }
    }
    // Glutader (selten)
    if (v === 7) { let x = 9; for (let y = 13; y < 21; y++) { x += hash2(y, 1, 1010) < 0.3 ? 1 : hash2(y, 1, 1010) > 0.8 ? -1 : 0; p.px(x, y, y % 4 === 0 ? EMB[3] : EMB[2]); g.px(x, y, y % 4 === 0 ? EMB[4] : EMB[3]); } }
    // Schlagschatten auf dem Boden davor
    for (let y = FH; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0 || y < FH + 2) p.px(x, y, `rgba(4,3,10,${0.5 - (y - FH) * 0.11})`);
  }, { ax: 8, ay: 30 });
}

// ------------------------------------------------------------ Ritualkreis im Obsidianriss (Startpunkt Verteidigung)
function riftCircle(on) {
  const W = 44, H = 28, cx = 22, cy = 17, by = H - 1;
  return mk(W, H, (p, g) => {
    // Runenring in den Boden geritzt
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.round(cx + Math.cos(a) * 19), y = Math.round(cy + Math.sin(a) * 8);
      p.px(x, y, on ? MAG[3] : OBS[3]); if (on) g.px(x, y, MAG[2]);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * 15), y = Math.round(cy + Math.sin(a) * 6);
      p.px(x, y, on ? MAG[4] : OBS[4]); p.px(x + 1, y, on ? MAG[3] : OBS[2]); if (on) { g.px(x, y, MAG[4]); g.px(x + 1, y, MAG[3]); }
    }
    // sechs Obsidiansplitter im Kreis (hintere zuerst)
    const shards = [0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2 + 0.5; return [Math.round(cx + Math.cos(a) * 19), Math.round(cy + Math.sin(a) * 8)]; }).sort((a, b) => a[1] - b[1]);
    for (const [x, y] of shards) {
      const h = 7 + ((x * 3) % 4);
      poly(p, [[x + 0.5, y - h], [x - 2, y + 1], [x + 0.5, y + 1]], OBS[4]);
      poly(p, [[x + 0.5, y - h], [x + 0.5, y + 1], [x + 3, y + 1]], OBS[2]);
      p.px(x, y - h + 1, OBS[6]);
      if (on) { g.px(x, y - h + 1, MAG[4]); g.px(x, y - h + 2, MAG[3]); }
    }
    // Runenplatte in der Mitte
    p.ellipse(cx, cy, 6, 2.6, BAS[2]); p.ellipse(cx - 1, cy - 1, 5, 1.8, BAS[4]); p.px(cx - 4, cy - 1, BAS[6]);
    for (const [dx, dy] of [[-2, 0], [-1, -1], [0, 0], [1, -1], [2, 0], [0, 1]]) { p.px(cx + dx, cy + dy, on ? MAG[4] : EMB[2]); g.px(cx + dx, cy + dy, on ? MAG[4] : EMB[3]); }
    p.px(cx, by, BAS[1]);
  }, { ax: 22, ay: H - 6, box: [-6, -4, 6, 1], extra: { low: true }, light: { dx: 0, dy: -6, radius: on ? 90 : 50, color: on ? [180, 120, 255] : [255, 110, 50], intensity: on ? 1 : 0.5 } });
}

// ------------------------------------------------------------ Schleuse am Lavakanal
function sluiceGate(open) {
  const W = 32, H = 36, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 16, by - 1, 14, 2, 1101);
    // Steinpfeiler
    for (const x0 of [2, 24]) {
      for (let y = 8; y <= by; y++) for (let i = 0; i < 6; i++) {
        let k = i < 2 ? 5 : i < 4 ? 4 : 2;
        if ((y - 8) % 5 === 0) k -= 2;
        if (hash2(x0 + i, y, 1102) < 0.08) k--;
        p.px(x0 + i, y, FST[clampI(k, 7)]);
      }
      p.rect(x0 - 1, 6, 8, 3, FST[5]); p.rect(x0 - 1, 6, 8, 1, FST[6]);
    }
    // Querträger mit Zahnstange
    p.rect(2, 4, 28, 3, IRON[2]); p.rect(2, 4, 28, 1, IRON[4]);
    // Schütz (Eisentafel)
    const gy = open ? 9 : 17;
    for (let y = gy; y < gy + 15; y++) for (let x = 8; x < 24; x++) {
      let c = IRON[(x - 8) % 4 === 0 ? 1 : 2];
      if ((y - gy) % 5 === 0) c = IRON[3];
      if (x === 8) c = IRON[4];
      p.px(x, y, c);
    }
    for (const x of [10, 15, 21]) p.px(x, gy + 2, IRON[5]);
    // Glut im Spalt darunter
    if (open) { for (let x = 8; x < 24; x++) { p.px(x, by - 2, EMB[4]); p.px(x, by - 1, EMB[3]); g.px(x, by - 2, EMB[5]); g.px(x, by - 1, EMB[4]); } }
    else for (let x = 8; x < 24; x++) { p.px(x, by - 3, EMB[1]); g.px(x, by - 3, EMB[2]); }
    // Kurbelrad
    const wx = 16, wy = 3;
    for (let a = 0; a < Math.PI * 2; a += 0.15) p.px(Math.round(wx + Math.cos(a) * 4), Math.round(wy + Math.sin(a) * 2.5), IRON[3]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + (open ? 0.4 : 0); p.line(wx, wy, Math.round(wx + Math.cos(a) * 4), Math.round(wy + Math.sin(a) * 2.5), IRON[2]); }
    p.px(wx, wy, GOLD[3]);
  }, { ax: 16, box: [-14, -4, 14, 1], light: { dx: 0, dy: -4, radius: open ? 70 : 40, color: [255, 120, 50], intensity: open ? 0.9 : 0.5 } });
}

// ------------------------------------------------------------ Harpyiennest auf der Klippenkante
function harpyNest(burnt) {
  const W = 46, H = 30, by = H - 1, cx = 23, cy = by - 9;
  const BONE = ['#4a4236', '#6e6452', '#9a8e74', '#c4b896', '#e6dcbc'];
  const FEA = ['#2a1e22', '#4a3036', '#6e4448', '#9a5a50', '#c88466'];
  return mk(W, H, (p, g) => {
    basLump(p, cx, by - 2, 20, 4, 1111);
    const rng = createRng(1112);
    // äußerer Reisigring: dicke, verflochtene Äste
    for (let i = 0; i < 90; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(11, 17);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.36;
      const l = rng.range(4, 9), d = rng.range(-0.7, 0.7);
      const col = burnt ? CHAR[rng.int(1, 5)] : WOOD[rng.int(1, 5)];
      p.line(x, y, x + Math.cos(a + 1.6 + d) * l, y + Math.sin(a + 1.6 + d) * l * 0.42, col);
    }
    // Mulde
    p.ellipse(cx, cy, 10, 3.2, burnt ? CHAR[0] : WOOD[0]);
    p.ellipse(cx, cy + 0.5, 8, 2.3, burnt ? CHAR[1] : '#2a1c14');
    // Knochen im Geflecht
    for (const [x, y, l, s] of [[6, by - 10, 7, -0.3], [32, by - 6, 8, 0.25], [14, by - 4, 6, 0.1], [36, by - 12, 5, -0.5]]) {
      const ex = x + Math.cos(s) * l, ey = y + Math.sin(s) * l;
      p.line(x, y, ex, ey, burnt ? ASHG[4] : BONE[3]); p.line(x, y + 1, ex, ey + 1, burnt ? ASHG[2] : BONE[1]);
      p.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 3, burnt ? ASHG[5] : BONE[4]); p.rect(Math.round(ex), Math.round(ey) - 1, 2, 3, burnt ? ASHG[5] : BONE[4]);
    }
    // kleiner Schädel am Rand
    const sx = 35, sy = by - 8;
    p.ellipse(sx, sy, 3, 2.4, burnt ? ASHG[4] : BONE[3]); p.rect(sx - 2, sy + 1, 4, 2, burnt ? ASHG[3] : BONE[2]);
    p.px(sx - 1, sy, BAS[0]); p.px(sx + 1, sy, BAS[0]); p.px(sx - 1, sy - 2, burnt ? ASHG[5] : BONE[4]);
    if (!burnt) {
      // Eier
      for (const [x, y] of [[18, cy - 1], [23, cy], [28, cy - 1], [21, cy - 2]]) {
        p.ellipse(x, y, 2.2, 1.7, '#7e96a0'); p.px(x - 1, y - 1, '#d8e6ea'); p.px(x, y - 1, '#b4c8d0'); p.px(x + 1, y + 1, '#4e5e66');
        p.px(x + 1, y - 1, '#5a3a3a');
      }
      // Federn, die aus dem Nest ragen
      for (const [x, y, h, lean] of [[8, by - 12, 8, -3], [11, by - 13, 10, -1], [38, by - 13, 9, 3], [34, by - 15, 7, 1]]) {
        for (let k = 0; k < h; k++) {
          const fx = x + lean * k / h, fy = y - k;
          const w = k < 2 || k > h - 2 ? 0 : 1;
          p.rect(Math.round(fx) - w, Math.round(fy), 1 + 2 * w, 1, FEA[k > h * 0.6 ? 4 : k > h * 0.3 ? 3 : 2]);
          p.px(Math.round(fx), Math.round(fy), FEA[1]);
        }
      }
      for (let i = 0; i < 7; i++) { const x = rng.int(4, W - 4), y = by - rng.int(1, 3); p.line(x, y, x + 2, y - 1, FEA[rng.int(2, 5)]); }
    } else {
      for (let i = 0; i < 12; i++) { const x = cx - 9 + rng.int(0, 18), y = cy - 1 + rng.int(0, 3); p.px(x, y, EMB[rng.int(1, 3)]); g.px(x, y, EMB[3]); }
      p.ellipse(cx, cy, 6, 1.6, ASHG[3]); p.ellipse(cx - 1, cy - 0.5, 3, 0.8, ASHG[4]);
    }
  }, { ax: cx, box: [-16, -5, 16, 1], extra: burnt ? { smoke: { dx: 0, dy: -10, rate: 2 } } : undefined });
}

// ============================================================ Runde 2: Felsenhorst mit Seilaufzug, Wegdeko, Bergmannsgräber, Erzbrecher
const ROPE = ['#2a2016', '#4a3a26', '#6e5a3a', '#94805a'];

// Seilwinde oben an der Kante: Holzgalgen mit Ausleger, Trommel, Seil hinab
function liftWinch() {
  const W = 52, H = 62, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 20, by, 18, 2, 1601);
    // Plattform aus Bohlen
    p.rect(4, by - 6, 34, 5, WOOD[2]); p.rect(4, by - 6, 34, 1, WOOD[4]); p.rect(4, by - 1, 34, 1, WOOD[0]);
    for (let x = 6; x < 38; x += 5) p.line(x, by - 5, x, by - 2, WOOD[1]);
    // zwei Ständer, Kopfbalken, Ausleger nach rechts über die Kante
    for (const x of [9, 27]) { p.rect(x, 10, 3, by - 16, WOOD[3]); p.rect(x, 10, 1, by - 16, WOOD[4]); p.rect(x + 2, 10, 1, by - 16, WOOD[1]); }
    p.rect(6, 8, 26, 3, WOOD[3]); p.rect(6, 8, 26, 1, WOOD[4]);
    p.line(28, 9, 49, 4, WOOD[3]); p.line(28, 10, 49, 5, WOOD[1]);
    p.line(12, 24, 27, 11, WOOD[2]); p.line(27, 24, 40, 7, WOOD[2]);
    // Seilrolle am Auslegerende, Seil hinab
    p.ellipse(48, 6, 2.6, 2.6, IRON[2]); p.px(47, 5, IRON[4]);
    p.line(50, 7, 50, by, ROPE[2]); p.line(51, 8, 51, by, ROPE[1]);
    // Trommel mit Kurbel zwischen den Ständern
    p.rect(12, by - 20, 15, 8, ROPE[1]);
    for (let y = by - 20; y < by - 12; y += 2) p.line(12, y, 26, y, ROPE[2 + ((y >> 1) & 1)]);
    p.rect(12, by - 20, 15, 1, ROPE[3]);
    p.line(26, by - 16, 31, by - 21, IRON[3]); p.rect(31, by - 22, 2, 2, IRON[4]);
    // Gegengewicht (Steinkorb) links
    p.line(7, 11, 7, by - 22, ROPE[2]); p.rect(3, by - 22, 8, 7, IRON[1]); basLump(p, 7, by - 19, 3.4, 2.6, 1602, BAS);
    // Laterne am Ständer
    p.rect(30, 16, 4, 5, IRON[1]); p.rect(31, 17, 2, 3, EMB[4]); g.rect(30, 16, 4, 5, EMB[3]); g.px(31, 18, EMB[5]);
  }, { ax: 20, box: [-16, -6, 18, 1], light: { dx: 12, dy: -42, radius: 60, color: [255, 170, 90], intensity: 0.7 } });
}

// Aufzugskorb unten am Fuß der Klippe
function liftCage() {
  const W = 30, H = 46, by = H - 1;
  return mk(W, H, (p) => {
    ashPatch(p, 14, by, 12, 2, 1611);
    // Seile von oben
    p.line(9, 0, 9, 12, ROPE[2]); p.line(19, 0, 19, 12, ROPE[2]); p.line(14, 0, 14, 8, ROPE[3]);
    p.line(9, 12, 14, 8, ROPE[1]); p.line(19, 12, 14, 8, ROPE[1]);
    // Korb: Rahmen, Gitter, Boden
    p.rect(4, 12, 21, 2, WOOD[4]);
    for (let x = 4; x <= 24; x += 4) { p.rect(x, 14, 1, by - 18, WOOD[x < 12 ? 3 : 2]); }
    for (let y = 18; y < by - 4; y += 6) p.line(4, y, 24, y, WOOD[2]);
    p.rect(3, by - 5, 23, 3, WOOD[3]); p.rect(3, by - 5, 23, 1, WOOD[4]); p.rect(3, by - 2, 23, 1, WOOD[0]);
    // Ladung: Erzsack und Kiste
    p.ellipse(10, by - 8, 3.4, 2.6, LEA[2]); p.px(9, by - 10, LEA[4]);
    p.rect(15, by - 11, 7, 6, WOOD[3]); p.rect(15, by - 11, 7, 1, WOOD[4]); p.line(15, by - 11, 21, by - 6, WOOD[1]);
  }, { ax: 14, box: [-11, -5, 11, 1] });
}

// Bohlensteg durch die Aufzugslücke (flach, begehbar; 4 Kacheln breit, 3 hoch)
function liftRamp() {
  const W = 70, H = 50, X0 = 3, X1 = 66;
  return mkFlat(W, H, (p) => {
    for (let y = 0; y < H; y++) {
      const ly = y % 7;
      for (let x = X0; x <= X1; x++) {
        let k = ly === 0 ? 0 : ly === 1 ? 4 : ly === 6 ? 1 : 3;
        if (hash2(x >> 2, y / 7 | 0, 1621) < 0.25 && ly > 1 && ly < 6) k -= 1;
        if (hash2(x, y, 1622) < 0.06) k = Math.max(0, k - 1);
        if (Math.abs(x - 34) < 14 && ly > 1 && ly < 5 && hash2(x, y, 1623) < 0.3) k = Math.min(4, k + 1);
        p.px(x, y, WOOD[clampI(k, 5)]);
      }
      if (ly === 3) { p.px(X0 + 2, y, IRON[3]); p.px(X1 - 2, y, IRON[3]); }
    }
    // Seitenseile/Holme
    for (let y = 0; y < H; y++) { p.rect(0, y, 3, 1, ROPE[y % 4 === 0 ? 3 : 1]); p.rect(W - 3, y, 3, 1, ROPE[y % 4 === 0 ? 3 : 1]); }
  }, { ax: 27, ay: -2 });
}

// Seilgeländer an Kanten und Wegen: Pfosten mit durchhängendem Seil (eine Kachel)
function ropeFence(v) {
  const W = 16, H = 18, by = H - 1;
  return mk(W, H, (p) => {
    const x = 2 + v;
    p.rect(x, 4, 2, by - 4, WOOD[3]); p.px(x, 4, WOOD[4]); p.px(x + 1, by - 1, WOOD[1]);
    p.ellipse(x + 1, by, 2, 0.8, BAS[3]);
    for (let i = 0; i < 16; i++) { const sag = Math.round(Math.sin((i / 16) * Math.PI) * 2.2); p.px(i, 6 + sag, ROPE[2]); p.px(i, 7 + sag, ROPE[1]); }
  }, { ax: 8 });
}

// Grubenlampe am Pfahl
function mineLamp(v) {
  const W = 14, H = 30, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 5, by, 4, 1, 1631 + v);
    p.rect(3, 4, 2, by - 4, WOOD[3]); p.rect(3, 4, 1, by - 4, WOOD[4]);
    p.rect(3, 4, 8, 2, WOOD[3]); p.line(9, 6, 9, 8, IRON[2]);
    p.rect(7, 9, 5, 6, IRON[1]); p.rect(8, 10, 3, 4, v ? '#e8b060' : EMB[4]); p.px(8, 10, '#fff0b0'); p.rect(7, 9, 5, 1, IRON[3]); p.rect(7, 15, 5, 1, IRON[2]);
    g.rect(7, 9, 5, 6, EMB[3]); g.rect(8, 10, 3, 4, EMB[5]);
    // Steinkeil am Fuß
    basLump(p, 4, by - 1, 3, 1.6, 1632 + v, BAS);
  }, { ax: 4, box: [-2, -2, 2, 1], light: { dx: 5, dy: -18, radius: 64, color: [255, 180, 100], intensity: 0.8 } });
}

// Bergmannsgrab: Geröllhügel mit eingeschlagener Spitzhacke, Grubenhelm und Grubenlicht
function minerGrave(v) {
  const W = 26, H = 26, by = H - 1;
  return mk(W, H, (p, g) => {
    ashPatch(p, 13, by, 11, 1.5, 1641 + v);
    // länglicher Steinhügel
    for (let i = 0; i < 9; i++) basLump(p, 5 + i * 2 + (i % 2), by - 3 - (i % 3 === 1 ? 1 : 0), 3, 2, 1642 + i + v * 11, BAS);
    // Spitzhacke senkrecht im Kopfende
    const hx = v ? 20 : 6;
    p.rect(hx, by - 19, 2, 14, WOOD[3]); p.px(hx, by - 19, WOOD[4]);
    p.line(hx - 5, by - 18, hx + 6, by - 20, IRON[2]); p.line(hx - 5, by - 17, hx + 6, by - 19, IRON[1]); p.px(hx - 5, by - 18, IRON[4]); p.px(hx + 6, by - 20, IRON[4]);
    // Grubenhelm am Stiel, kleines Grablicht
    p.ellipse(hx + 1, by - 12, 3, 1.8, BRASS[2]); p.px(hx, by - 13, BRASS[4]);
    const lx = v ? 6 : 19;
    p.rect(lx, by - 6, 3, 3, IRON[1]); p.px(lx + 1, by - 5, EMB[4]); g.px(lx + 1, by - 5, EMB[5]);
  }, { ax: 13, box: [-9, -4, 9, 1], light: { dx: v ? -6 : 7, dy: -6, radius: 30, color: [255, 170, 90], intensity: 0.45 } });
}

// Erzbrecher: verlassenes Pochwerk mit Stampfern, Rad und Erzhaufen
function oreCrusher() {
  const W = 64, H = 58, by = H - 1;
  return mk(W, H, (p) => {
    ashPatch(p, 30, by, 28, 2, 1651);
    // Erzhaufen
    for (let i = 0; i < 26; i++) { const x = 42 + (i * 7) % 18, y = by - 2 - ((i * 5) % 6); basLump(p, x, y, 2.2, 1.6, 1652 + i, RUST); }
    // Gerüst
    for (const x of [6, 22, 36]) { p.rect(x, 12, 3, by - 14, WOOD[3]); p.rect(x, 12, 1, by - 14, WOOD[4]); p.rect(x + 2, 12, 1, by - 14, WOOD[1]); }
    p.rect(4, 10, 38, 3, WOOD[3]); p.rect(4, 10, 38, 1, WOOD[4]);
    p.rect(4, by - 14, 38, 2, WOOD[2]);
    // Stampfer
    for (let i = 0; i < 4; i++) {
      const x = 10 + i * 6, hgt = (i % 2) * 4;
      p.rect(x, 13, 3, 18 + hgt, WOOD[2]); p.rect(x, 13, 1, 18 + hgt, WOOD[3]);
      p.rect(x - 1, 31 + hgt, 5, 5, IRON[2]); p.rect(x - 1, 31 + hgt, 5, 1, IRON[4]);
    }
    // Pochtrog
    p.rect(6, by - 10, 32, 6, BAS[3]); p.rect(6, by - 10, 32, 1, BAS[5]); p.rect(8, by - 9, 28, 2, RUST[2]);
    // Wasserrad (halb zerbrochen) links
    const wx = 4, wy = 22;
    p.ellipse(wx, wy, 7, 9, WOOD[1]); p.ellipse(wx, wy, 5, 7, SOOT[1]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; if (i !== 2) p.line(wx, wy, wx + Math.cos(a) * 6, wy + Math.sin(a) * 8, WOOD[3]); }
    // Rost und Moos
    for (let i = 0; i < 10; i++) p.px(8 + (i * 11) % 30, 11 + (i % 2), RUST[4]);
  }, { ax: 30, box: [-26, -10, 10, 1] });
}

export function createPeaksDecor() {
  return {
    basaltColumns: [0, 1, 2].map(basaltColumns),
    obsidianSpikes: [0, 1, 2].map(obsidianSpikes),
    lavaRocks: [0, 1, 2].map(lavaRock),
    deadTrees: [581, 587].map(deadTree),
    ashDrifts: [0, 1].map(ashDrift),
    fortWall: fortWallH(),
    fortWallV: fortWallV(),
    fortGate: fortGate(),
    fortTower: fortTower(),
    tent: tent(),
    bannerPole: bannerPole(),
    forge: forge(),
    crates: [0, 1, 2].map(crates),
    riftSeal: { off: riftSeal(false), on: riftSeal(true) },
    forgeGate: forgeGate(),
    lavaVent: lavaVent(),
    // Runde 5: Gebirge
    rampSteps: rampSteps(3),
    rampSteps4: rampSteps(4),
    lavaBridge: lavaBridge(),
    mineEntrance: mineEntrance(),
    mineRails: mineRails(),
    mineCart: [0, 1].map(mineCart),
    pitProps: pitProps(),
    slagHeap: [0, 1, 2].map(slagHeap),
    cairn: [0, 1].map(cairn),
    brazier: brazier(),
    lookoutSpyglass: lookoutSpyglass(),
    hiddenCache: { off: hiddenCache(false), on: hiddenCache(true) },
    basaltFace: [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 7].map(basaltFace),
    riftCircle: { off: riftCircle(false), on: riftCircle(true) },
    sluiceGate: { off: sluiceGate(false), on: sluiceGate(true) },
    harpyNest: { off: harpyNest(false), on: harpyNest(true) },
    // Runde 2: Felsenhorst, Wegdeko, Bergmannsgräber, Erzbrecher
    liftWinch: liftWinch(),
    liftCage: liftCage(),
    liftRamp: liftRamp(),
    ropeFence: [0, 1].map(ropeFence),
    mineLamp: [0, 1].map(mineLamp),
    minerGrave: [0, 1].map(minerGrave),
    oreCrusher: oreCrusher(),
  };
}
