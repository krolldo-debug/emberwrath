import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT } from './outdoor.js';
import { mk, poly, ashPatch, drawTent } from './decor_ashwood.js';

// Schlackenhöhen: schwarzer Basalt, Obsidian, Lavatümpel; Feste Rauhwacht,
// der Riss und das Tor zur Glutschmiede. Licht von links oben; alles
// Leuchtende zusätzlich auf der Glow-Ebene ((W+2)×(H+2), 1 px Versatz).

const BAS = ['#09080d', '#110f16', '#19161f', '#221e2a', '#2d2836', '#3a3444', '#4a4356'];
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
  };
}
