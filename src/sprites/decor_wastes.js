import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT } from './outdoor.js';
import { mk, poly, drawTent } from './decor_ashwood.js';

// Glutöde: verbrannte Ebene unter Glutregen, schwarze Asche und Obsidian;
// die letzte Bastion der Lebenden und das Tor zum Aschethron.
// Licht von links oben; alles Glühende zusätzlich auf der Glow-Ebene
// ((W+2)×(H+2), 1 px Versatz wegen des Umriss-Rands).

// Bodenpalette (Format wie BIOME_GROUND in sprites/outdoor.js):
// grass = schwarze Asche, dirt = Schlacke/Obsidiangrus (Wege), water = Lava.
export const GROUND_WASTES = {
  grass: ['#100d0e', '#171314', '#1e191a', '#262021', '#2f2829', '#3b3233'],
  dirt: ['#120a09', '#1a0f0c', '#231410', '#2d1a14', '#3a2219', '#4a2c1f'],
  water: ['#340c04', '#742008', '#c4400c', '#f07a1c', '#ffbe48'],
  lava: true,
  tufts: false,
};

const ASHB = ['#0e0c0d', '#171415', '#221e1f', '#2e292a', '#3d3738', '#514a4a', '#6a6261'];
const CHAR = ['#0a0708', '#130e0f', '#1c1516', '#281e1f', '#352929', '#44363a'];
const OBS = ['#050306', '#0f0912', '#1c1020', '#2e1834', '#48264e', '#8a4a7c', '#f4c4e0'];
const BST = ['#19140f', '#271f19', '#362c24', '#473b30', '#5b4d3e', '#74634f', '#927e66'];
const SOOT = ['#0c0a0a', '#161212', '#201a19'];
const CANV = ['#1e1a17', '#2f2923', '#443b31', '#5a4e40', '#726350', '#8a7a62'];
const BONE = PAL.bone;
const EMB = PAL.ember, GOLD = PAL.gold, CRIM = PAL.crimson, IRON = PAL.steel, LEA = PAL.leather;
const WOOD = OUT.wood;
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// ------------------------------------------------------------ Helfer
function vnoiseLite(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Aschefleck mit einzelnen Glutfunken (Funken auch auf der Glow-Ebene)
function ashPatch(p, g, cx, cy, rx, ry, seed, sparks = 0.03) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const h = hash2(cx + x, cy + y, seed);
    if (d > 0.6 && h < 0.45) continue;
    p.px(cx + x, cy + y, h < 0.2 ? ASHB[3] : h < 0.7 ? ASHB[2] : ASHB[1]);
    if (g && h > 1 - sparks) { p.px(cx + x, cy + y, EMB[2]); g.px(cx + x, cy + y, EMB[3]); }
  }
}

// Glühender Riss (Zufallspfad)
function crack(p, g, rng, x, y, len, dir = 0) {
  let a = dir;
  for (let i = 0; i < len; i++) {
    const end = i === 0 || i === len - 1;
    p.px(x, y, end ? EMB[2] : EMB[3]); g.px(x, y, end ? EMB[3] : EMB[4]);
    if (!end && rng.chance(0.25)) { p.px(x, y, EMB[4]); g.px(x, y, EMB[5]); }
    a += rng.range(-0.8, 0.8);
    x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a) * 0.7);
  }
}

// Quaderlagen (verrußt nach unten)
function courses(p, pal, x0, y0, w, h, seed, { bw = 8, bh = 5, soot = true } = {}) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const row = Math.floor((y - y0) / bh), off = (row % 2) * (bw >> 1);
    const lx = (x - x0 + off + bw * 4) % bw, ly = (y - y0) % bh;
    const blk = hash2(Math.floor((x - x0 + off + bw * 4) / bw), row, seed);
    let k = blk < 0.3 ? 2 : blk < 0.8 ? 3 : 4;
    if (ly === 0 || lx === 0) k = 1;
    else if (ly === 1 || lx === 1) k += 1;
    else if (ly === bh - 1 || lx === bw - 1) k -= 1;
    if (hash2(x, y, seed + 1) < 0.05) k -= 1;
    if (soot && y > y0 + h - 6 && hash2(x, y, seed + 2) < (y - (y0 + h - 6)) / 6) k -= 2;
    p.px(x, y, pal[clampI(k, pal.length)]);
  }
}

// Kohlebecken mit Feuer auf Sprite + Glow
function flame(p, g, x, y, h, wide = 1) {
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.max(0, Math.round((1 - t) * wide + (i < 2 ? 0.5 : 0)));
    const sway = Math.round(Math.sin(i * 0.9) * (t > 0.4 ? 1 : 0));
    for (let dx = -half; dx <= half; dx++) {
      const edge = Math.abs(dx) === half && half > 0;
      p.px(x + dx + sway, y - i, t > 0.75 ? EMB[2] : edge ? EMB[3] : t < 0.35 ? EMB[5] : EMB[4]);
      g.px(x + dx + sway, y - i, t > 0.75 ? EMB[3] : edge ? EMB[4] : EMB[5]);
    }
  }
}

function brazier(p, g, x, y) {
  p.rect(x - 4, y, 9, 3, IRON[2]); p.rect(x - 4, y, 9, 1, IRON[4]); p.rect(x + 3, y + 1, 2, 2, IRON[1]);
  p.rect(x - 1, y + 3, 3, 3, IRON[1]); p.rect(x - 3, y + 6, 7, 1, IRON[2]);
  p.rect(x - 3, y - 1, 7, 1, EMB[2]); g.rect(x - 3, y - 1, 7, 1, EMB[4]);
  flame(p, g, x - 1, y - 1, 5, 1); flame(p, g, x + 1, y - 1, 7, 1);
}

// ------------------------------------------------------------ Verkohlte Ruinen
function charredRuin(v) {
  const rng = createRng(1010 + v);
  const W = [40, 36, 30][v], H = [40, 34, 22][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, Math.floor(W / 2), bottom - 1, Math.floor(W / 2) - 1, 2, 1011 + v);
    if (v === 0) {
      // Mauerfragment mit Fensterbogen, gezackte Bruchkante
      const x0 = 3, x1 = 35;
      const topAt = (x) => Math.round(4 + Math.abs(Math.sin(x * 0.31)) * 5 + (x > 24 ? (x - 24) * 1.4 : 0) + hash2(x, 0, 1012) * 2);
      for (let x = x0; x <= x1; x++) {
        const t = topAt(x);
        const tmp = { px: (xx, yy, c) => { if (yy >= t) p.px(xx, yy, c); } };
        courses(tmp, BST, x, 0, 1, bottom - 1, 1013, { bw: 7 });
        p.px(x, t, BST[5]);
        if (x < x0 + 2) for (let y = t; y < bottom - 1; y++) p.px(x, y, BST[5]);
      }
      // rechte Stirnseite (dunkel)
      for (let y = topAt(x1); y < bottom - 1; y++) { p.px(x1, y, BST[1]); p.px(x1 - 1, y, BST[2]); }
      // Fensterbogen
      const wx = 14, wy = 14;
      for (let y = wy - 4; y < wy + 10; y++) for (let x = wx - 4; x <= wx + 4; x++) {
        if (y < wy && ((x - wx) ** 2) / 16 + ((y - wy) ** 2) / 16 > 1) continue;
        p.px(x, y, '#08060a');
      }
      for (let x = wx - 4; x <= wx + 4; x++) p.px(x, wy + 10, BST[5]);
      for (let a = 0; a <= 8; a++) { const t = Math.PI + (a / 8) * Math.PI; p.px(Math.round(wx + Math.cos(t) * 5), Math.round(wy + Math.sin(t) * 5), BST[5]); }
      // Glut im Fenster (Innenraum brennt nach)
      p.rect(wx - 3, wy + 6, 7, 3, EMB[1]); p.rect(wx - 2, wy + 7, 5, 2, EMB[2]); g.rect(wx - 3, wy + 6, 7, 3, EMB[2]); g.rect(wx - 1, wy + 7, 3, 1, EMB[4]);
      // Rußfahnen über dem Fenster
      for (let y = wy - 12; y < wy - 4; y++) for (let x = wx - 3; x <= wx + 3; x++) if (hash2(x, y, 1014) < 0.55 - (wy - 4 - y) * 0.05 && y >= topAt(x)) p.px(x, y, SOOT[1]);
      // Schutt
      for (let i = 0; i < 7; i++) { const x = rng.int(1, W - 4), y = bottom - rng.int(1, 3); p.rect(x, y, 3, 2, BST[3]); p.px(x, y, BST[5]); p.px(x + 2, y + 1, BST[1]); }
    } else if (v === 1) {
      // Hausecke mit verkohltem Balken und Türsturz
      courses(p, BST, 3, 8, 16, bottom - 9, 1015, { bw: 6 });
      for (let x = 3; x < 19; x++) { const t = 8 + Math.round(Math.abs(Math.sin(x * 0.5)) * 3); p.ctx.clearRect(x, 8, 1, t - 8); p.px(x, t, BST[5]); }
      // rechte Wand in die Tiefe (dunkler, kürzer)
      poly(p, [[19, 10], [30, 16], [30, bottom - 1], [19, bottom - 1]], (x, y) => ((x + (Math.floor(y / 5) % 2) * 3) % 6 === 0 || y % 5 === 0 ? BST[0] : BST[2]));
      p.line(19, 10, 30, 16, BST[3]);
      // Türöffnung
      p.rect(8, bottom - 14, 7, 13, '#08060a'); p.rect(7, bottom - 15, 9, 2, CHAR[3]); p.px(7, bottom - 15, CHAR[5]);
      // Schräg liegender Dachbalken, glimmend
      p.line(0, 4, 26, 12, CHAR[3]); p.line(0, 5, 26, 13, CHAR[1]); p.line(1, 3, 25, 11, CHAR[5]);
      for (let x = 4; x < 25; x += 5) { const y = Math.round(4 + (x / 26) * 8); p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); p.px(x + 1, y + 1, EMB[2]); g.px(x + 1, y + 1, EMB[3]); }
      p.line(26, 12, 33, bottom - 2, CHAR[2]); p.line(27, 12, 34, bottom - 2, CHAR[4]);
      crack(p, g, rng, 22, bottom - 3, 4, 0);
    } else {
      // umgestürzte Säule mit Trommeln und Kapitell
      for (let i = 0; i < 3; i++) {
        const x = 3 + i * 8, y = bottom - 6 + (i === 1 ? 1 : 0);
        p.rect(x, y - 5, 8, 9, BST[3]); p.rect(x, y - 5, 8, 2, BST[5]); p.rect(x, y + 2, 8, 2, BST[1]);
        for (let k = 1; k < 8; k += 2) p.rect(x + k, y - 3, 1, 5, BST[2]);
        p.ellipse(x + 8, y - 0.5, 1.4, 4.5, BST[4]); p.px(x + 8, y - 3, BST[6]);
      }
      p.rect(0, bottom - 16, 10, 5, BST[4]); p.rect(0, bottom - 16, 10, 1, BST[6]); p.rect(1, bottom - 11, 8, 2, BST[2]);
      p.rect(24, bottom - 18, 5, 11, BST[3]); p.rect(24, bottom - 18, 1, 11, BST[5]);
      for (let i = 0; i < 5; i++) p.px(24 + i, bottom - 18 - [1, 2, 0, 1, 0][i], BST[4]);
      crack(p, g, rng, 11, bottom - 7, 5, 0.2);
    }
    // Ascheschleier am Fuß
    for (let x = 1; x < W - 1; x++) if (hash2(x, 1, 1016 + v) < 0.7) p.px(x, bottom - 1, ASHB[hash2(x, 2, 1016) < 0.5 ? 3 : 2]);
  }, { ax: Math.floor(W / 2), ay: H - 2, box: [-Math.floor(W / 2) + 3, -5, Math.floor(W / 2) - 3, 1] });
}

// ------------------------------------------------------------ Obsidiansplitter
function obsidianShards(v) {
  const rng = createRng(1030 + v);
  const W = 28, H = [34, 26, 40][v];
  const shards = [
    [[14, 2, 4, 2], [7, 13, 3, -3], [21, 11, 3.5, 4], [11, 20, 2, 0]],
    [[10, 4, 4, -2], [19, 9, 3, 3], [5, 15, 2, -2], [23, 16, 2, 2]],
    [[15, 1, 4.5, -1], [7, 12, 3, -4], [22, 9, 3, 3], [12, 22, 2.5, 1]],
  ][v];
  return mk(W, H, (p, g) => {
    const base = H - 3;
    ashPatch(p, g, 14, H - 3, 12, 2, 1031 + v);
    const order = [...shards].sort((a, b) => a[1] - b[1]);
    for (const [x, tipY, hw, lean] of order) {
      const tx = x + lean;
      poly(p, [[tx + 0.5, tipY], [x - hw, base + 1], [x + 0.5, base + 1]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        return k < 0.15 ? OBS[5] : hash2(xx, yy, 1032) < 0.1 ? OBS[3] : OBS[4];
      });
      poly(p, [[tx + 0.5, tipY], [x + 0.5, base + 1], [x + hw + 1, base + 1]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        // warmer Widerschein vom Boden (unten rötlich)
        return k > 0.75 && hash2(xx, yy, 1033) < 0.5 ? '#3a1414' : hash2(xx, yy, 1034) < 0.15 ? OBS[2] : OBS[1];
      });
      p.line(tx, tipY + 1, x, base, OBS[5]);
      // Glanzkante und Lichtpunkt
      const gy = tipY + Math.round((base - tipY) * 0.3), gx = Math.round(tx + (x - tx) * 0.3) - 1;
      p.px(gx, gy, OBS[6]); p.px(gx, gy + 1, OBS[5]); p.px(tx, tipY, OBS[6]);
      g.px(gx, gy, '#5a2a50'); g.px(tx, tipY, '#4a2040');
      // Glutreflex unten rechts
      p.px(x + Math.round(hw) - 1, base - 1, EMB[1]); g.px(x + Math.round(hw) - 1, base - 1, EMB[2]);
    }
    for (let i = 0; i < 5; i++) { const x = rng.int(3, 24); p.px(x, H - 2, OBS[3]); p.px(x, H - 3, OBS[5]); }
  }, { ax: 14, ay: H - 2, box: [-7, -3, 7, 1] });
}

// ------------------------------------------------------------ Aschedünen
function ashDune(v) {
  const rng = createRng(1050 + v);
  const W = v ? 30 : 40, H = v ? 10 : 13;
  return mk(W, H, (p, g) => {
    const cx = W / 2 - 0.5, cy = H - 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / (W / 2 - 1), ny = (y - cy) / (H / 2 - 0.5);
      const hump = ny - 0.35 * nx;
      const d = nx * nx + (ny < 0 ? hump * hump * 1.2 : ny * ny * 3);
      if (d > 1 || y > H - 2) continue;
      let k = 3;
      if (ny < -0.2 && nx < 0.2) k = 4;
      if (ny < -0.55 && nx < -0.1) k = 5;
      if (nx > 0.35) k = 2;
      if (d > 0.85 && ny > 0) k = 1;
      p.px(x, y, ASHB[k]);
    }
    // Windrippeln
    for (let r = 0; r < 3; r++) for (let x = 4 + r * 3; x < W - 6; x++) { const y = cy - 2 + r * 2 + Math.round(Math.sin(x * 0.5 + r) * 0.7); if (hash2(x, r, 1051 + v) < 0.55 && y >= 0) p.px(x, y, r === 0 ? ASHB[5] : ASHB[1]); }
    // Glutfunken in der Asche
    for (let i = 0; i < 5; i++) { const x = rng.int(4, W - 5), y = rng.int(cy - 1, H - 3); p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
    // halb verschüttete Klinge
    if (v === 0) { p.line(W - 12, H - 5, W - 7, H - 11, IRON[3]); p.line(W - 11, H - 5, W - 6, H - 11, IRON[1]); p.rect(W - 14, H - 5, 4, 1, GOLD[1]); }
  }, { ax: Math.floor(W / 2), ay: H - 2 });
}

// ------------------------------------------------------------ Glutgeysire
function emberGeyser(v) {
  const rng = createRng(1070 + v);
  const W = v ? 34 : 26, H = v ? 26 : 18;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = Math.floor(W / 2);
    const coneTop = v ? 8 : 7, rimHW = v ? 5 : 4, baseHW = v ? 15 : 11;
    // Kegel aus Schlacke
    for (let y = coneTop; y <= bottom - 1; y++) {
      const t = (y - coneTop) / (bottom - 1 - coneTop);
      const hw = rimHW + (baseHW - rimHW) * t ** 0.8;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - cx) / hw;
        let k = rel < -0.5 ? 4 : rel < 0 ? 3 : rel < 0.5 ? 2 : 1;
        if (hash2(x, y, 1071 + v) < 0.12) k -= 1;
        if ((x + y * 2) % 7 === 0) k += 1;
        p.px(x, y, CHAR[clampI(k, 6)]);
      }
    }
    // Glühende Rinnsale am Kegel
    for (let s = -1; s <= 1; s += 2) {
      let x = cx + s * rimHW, y = coneTop + 1;
      while (y < bottom - 2) { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); y++; if (hash2(x, y, 1072) < 0.5) x += s; }
    }
    // Krater mit Glut
    p.ellipse(cx, coneTop, rimHW + 1, 2, CHAR[5]);
    p.ellipse(cx, coneTop, rimHW - 0.5, 1.2, EMB[3]); p.px(cx, coneTop, EMB[5]); p.px(cx - 1, coneTop, EMB[4]);
    g.ellipse(cx, coneTop, rimHW - 0.5, 1.2, EMB[4]); g.px(cx, coneTop, EMB[5]);
    // Glutfontäne (statisch, Partikel übernimmt die Bewegung)
    for (let i = 0; i < (v ? 7 : 5); i++) {
      const y = coneTop - 1 - i, x = cx + Math.round(Math.sin(i * 1.3) * (i > 2 ? 1 : 0));
      p.px(x, y, i < 2 ? EMB[5] : EMB[4]); g.px(x, y, EMB[5]);
      if (i < 3) { p.px(x - 1, y, EMB[3]); g.px(x - 1, y, EMB[4]); }
    }
    for (let i = 0; i < 6; i++) { const x = cx + rng.int(-5, 5), y = rng.int(0, coneTop - 3); g.px(x, y, EMB[3]); p.px(x, y, EMB[3]); }
    // Ascheflecken und Schlackebrocken am Fuß
    for (const [x, y] of [[2, bottom - 1], [W - 4, bottom], [5, bottom], [W - 7, bottom - 1]]) { p.rect(x, y, 2, 2, CHAR[3]); p.px(x, y, CHAR[5]); }
  }, {
    ax: Math.floor(W / 2), ay: H - 2, box: v ? [-10, -4, 10, 1] : [-7, -3, 7, 1],
    light: { dx: 0, dy: v ? -18 : -12, radius: v ? 70 : 54, color: [255, 120, 50], intensity: 0.8 },
    extra: { embers: { dx: 0, dy: v ? -20 : -12, rate: v ? 8 : 5 } },
  });
}

// ------------------------------------------------------------ Verbrannte Bäume
function scorchedTree(v) {
  const rng = createRng(1090 + v);
  const W = 40, H = v ? 56 : 48;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 20;
    ashPatch(p, g, cx, bottom - 1, 12, 2, 1091 + v, 0.05);
    const tips = [];
    const branch = (x, y, a, len, th, depth) => {
      const steps = Math.ceil(len);
      let px = x, py = y, aa = a;
      for (let i = 0; i < steps; i++) {
        aa += rng.range(-0.18, 0.18);
        const nx = px + Math.cos(aa), ny = py + Math.sin(aa);
        for (let k = 0; k < th; k++) p.px(Math.round(nx) + k, Math.round(ny), k === 0 ? CHAR[5] : k === th - 1 ? CHAR[1] : CHAR[3]);
        if (i % 3 === 1 && Math.cos(aa) < 0.3) p.px(Math.round(nx), Math.round(ny) - 1, ASHB[5]);
        px = nx; py = ny;
      }
      if (depth <= 0 || len < 3) { tips.push([Math.round(px), Math.round(py)]); return; }
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) branch(px, py, aa + rng.range(-0.8, 0.8), len * rng.range(0.5, 0.72), Math.max(1, th - 1), depth - 1);
    };
    // Wurzeln
    p.line(cx - 2, bottom - 1, cx - 8, bottom, CHAR[4]); p.line(cx + 2, bottom - 1, cx + 7, bottom, CHAR[1]); p.line(cx, bottom - 1, cx - 3, bottom, CHAR[3]);
    // gespaltener Stamm (zwei Hälften, dazwischen Glut)
    const trunkTop = v ? 22 : 20;
    for (let y = trunkTop; y < bottom; y++) {
      const k = (y - trunkTop) / (bottom - trunkTop);
      const s = Math.round(Math.sin(y * 0.25 + v) * 1.2);
      const hw = 2 + k * 2;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - (cx - hw)) / (2 * hw);
        let i = rel < 0.25 ? 5 : rel < 0.55 ? 3 : rel < 0.8 ? 2 : 1;
        if (hash2(x, y, 1092) < 0.1) i -= 1;
        p.px(x + s, y, CHAR[clampI(i, 6)]);
      }
      // Glutspalt im Stamm (unteres Drittel)
      if (y > bottom - 16 && y < bottom - 3) { const gx = cx + s + (y % 3 === 0 ? 1 : 0); p.px(gx, y, EMB[3]); g.px(gx, y, y % 2 ? EMB[4] : EMB[5]); }
    }
    branch(cx, trunkTop + 1, -Math.PI / 2 + rng.range(-0.2, 0.2), v ? 14 : 12, 3, 3);
    branch(cx - 1, trunkTop + 6, -Math.PI / 2 - 0.9, 10, 2, 2);
    branch(cx + 1, trunkTop + 4, -Math.PI / 2 + 0.85, 11, 2, 2);
    for (const [x, y] of tips) if (rng.chance(0.4)) { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); }
    // Knothöhle mit Glut
    p.rect(cx - 1, bottom - 9, 2, 3, '#1a0806'); p.px(cx - 1, bottom - 8, EMB[2]); g.px(cx - 1, bottom - 8, EMB[3]);
  }, { ax: 20, box: [-3, -3, 3, 1], extra: { embers: { dx: 0, dy: -10, rate: 0.6 } } });
}

// ------------------------------------------------------------ Bastionsmauer
function bastionWallH() {
  const W = 16, H = 38;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, faceTop = 11;
    // Wehrgang (Oberseite)
    for (let y = 5; y < faceTop; y++) for (let x = 0; x < 16; x++) p.px(x, y, (x + (y % 2) * 4) % 8 === 0 ? BST[2] : BST[y === 5 ? 3 : 4]);
    courses(p, BST, 0, faceTop, 16, bottom - faceTop + 1, 1101, { bw: 8 });
    // Zinnen mit Eisenkappen
    for (const x0 of [1, 9]) {
      courses(p, BST, x0, 2, 6, 9, 1102, { bw: 6, soot: false });
      p.rect(x0, 1, 6, 2, IRON[2]); p.rect(x0, 1, 6, 1, IRON[4]); p.rect(x0 + 5, 2, 1, 9, BST[1]);
    }
    p.rect(0, faceTop, 16, 1, BST[1]);
    // Goldenes Band (Zierfries)
    p.rect(0, faceTop + 2, 16, 1, GOLD[1]); for (let x = 1; x < 16; x += 4) p.px(x, faceTop + 2, GOLD[3]);
    // Brandspuren/Ruß von unten, Glutfunken am Fuß
    for (let x = 0; x < 16; x++) if (hash2(x, 9, 1103) < 0.6) p.px(x, bottom, ASHB[hash2(x, 8, 1103) < 0.5 ? 2 : 3]);
    p.px(5, bottom, EMB[2]); g.px(5, bottom, EMB[3]);
    // Schießscharte
    p.rect(12, 19, 1, 6, '#06050a'); p.px(11, 19, BST[1]);
  }, { ax: 8, box: [-8, -4, 8, 1] });
}

function bastionWallV() {
  const W = 12, H = 44;
  return mk(W, H, (p) => {
    const bottom = H - 1, faceH = 24, stripTop = bottom - 16 - faceH + 1;
    for (let y = stripTop; y < bottom - faceH + 1; y++) for (let x = 1; x < 11; x++) {
      let k = x < 3 ? 5 : x < 9 ? 4 : 2;
      if ((y + (x > 5 ? 3 : 0)) % 6 === 0) k = 2;
      p.px(x, y, BST[k]);
    }
    for (let y = stripTop; y < bottom - faceH - 1; y += 6) { p.rect(0, y - 3, 3, 4, BST[5]); p.rect(0, y - 3, 3, 1, IRON[4]); p.rect(0, y + 1, 3, 2, BST[3]); }
    courses(p, BST, 1, bottom - faceH + 1, 10, faceH, 1111, { bw: 5 });
    p.rect(1, bottom - faceH + 1, 10, 1, BST[1]);
    p.rect(1, bottom - faceH + 3, 10, 1, GOLD[1]);
    for (let x = 1; x < 11; x++) if (hash2(x, 3, 1112) < 0.6) p.px(x, bottom, ASHB[2]);
  }, { ax: 6, box: [-5, -16, 5, 1] });
}

// ------------------------------------------------------------ Bastionstor
function bastionGate() {
  const W = 68, H = 60;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 34;
    courses(p, BST, 4, 16, 60, bottom - 15, 1121);
    p.rect(4, 12, 60, 4, BST[4]); p.rect(4, 12, 60, 1, BST[5]); p.rect(4, 15, 60, 1, BST[1]);
    for (let x = 4; x < 64; x += 7) { courses(p, BST, x, 4, 5, 9, 1122, { bw: 5, soot: false }); p.rect(x, 3, 5, 2, IRON[2]); p.rect(x, 3, 5, 1, IRON[4]); p.rect(x + 4, 5, 1, 7, BST[1]); }
    // Pfeiler
    for (const x0 of [0, 54]) {
      courses(p, BST, x0, 14, 14, bottom - 13, 1123);
      p.rect(x0, 12, 14, 3, BST[5]); p.rect(x0, 12, 14, 1, BST[6]); p.rect(x0 + 13, 14, 1, bottom - 13, BST[1]); p.rect(x0, 14, 1, bottom - 13, BST[5]);
      // Kohlebecken obenauf
      brazier(p, g, x0 + 7, 6);
    }
    // Torbogen (spitz)
    const ox0 = 17, ox1 = 50, otop = 24;
    const inArch = (x, y) => { if (y >= otop) return x >= ox0 && x <= ox1; const t = Math.abs(x - cx) / ((ox1 - ox0) / 2 + 0.5); return y >= otop - (1 - t) * 11 - (1 - t * t) * 0 && t <= 1; };
    for (let y = otop - 12; y <= bottom; y++) for (let x = ox0; x <= ox1; x++) if (inArch(x, y)) p.px(x, y, '#07050a');
    // Keilsteine
    for (let x = ox0 - 1; x <= ox1 + 1; x++) for (let y = otop - 14; y < otop + 1; y++) {
      if (inArch(x, y)) continue;
      if (inArch(x, y + 2) || inArch(x - 2, y + 1) || inArch(x + 2, y + 1)) p.px(x, y, (x + y) % 5 === 0 ? BST[1] : x < cx ? BST[5] : BST[3]);
    }
    // Fallgatter halb herab
    const gateBot = bottom - 12;
    for (let x = ox0 + 1; x < ox1; x += 3) { for (let y = otop - 8; y <= gateBot; y++) if (inArch(x, y)) p.px(x, y, IRON[1]); p.px(x, gateBot + 1, IRON[3]); }
    for (let y = otop - 4; y <= gateBot; y += 5) for (let x = ox0 + 1; x < ox1; x++) if (inArch(x, y)) p.px(x, y, IRON[2]);
    // Licht aus dem Hof unter dem Gatter
    for (let y = gateBot + 2; y <= bottom; y++) for (let x = ox0 + 1; x < ox1; x++) if ((x + y) % 2 === 0) { p.px(x, y, '#2a1408'); if (y > bottom - 5) g.px(x, y, EMB[1]); }
    // Wappenschild: Sonne über Flamme (die Bastion)
    p.rect(cx - 5, 14, 11, 7, CRIM[3]); p.rect(cx - 4, 21, 9, 2, CRIM[2]); p.rect(cx - 2, 23, 5, 1, CRIM[1]);
    p.rect(cx - 5, 14, 11, 1, GOLD[3]);
    p.ellipse(cx, 17, 2, 2, GOLD[3]); p.px(cx, 17, GOLD[4]); for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [-2, -2], [2, -2]]) p.px(cx + dx, 17 + dy, GOLD[2]);
    g.px(cx, 17, GOLD[4]);
    // Banner an den Pfeilern
    for (const bx of [4, 57]) {
      p.rect(bx, 20, 7, 20, CRIM[3]); p.rect(bx, 20, 1, 20, CRIM[4]); p.rect(bx + 6, 20, 1, 20, CRIM[1]);
      p.px(bx + 1, 40, CRIM[3]); p.px(bx + 3, 41, CRIM[3]); p.px(bx + 5, 40, CRIM[2]);
      p.rect(bx, 20, 7, 1, GOLD[3]); p.rect(bx + 2, 26, 3, 5, GOLD[2]); p.px(bx + 3, 25, GOLD[4]); p.px(bx + 3, 27, EMB[4]);
    }
    p.rect(ox0 - 1, bottom, ox1 - ox0 + 3, 1, BST[4]);
  }, {
    ax: 34, light: { dx: 0, dy: -12, radius: 80, color: [255, 150, 70], intensity: 0.7 },
    extra: { boxes: [[-34, -6, -17, 1], [17, -6, 34, 1]], lights: [{ dx: -27, dy: -54, radius: 60, color: [255, 150, 70], intensity: 0.9 }, { dx: 27, dy: -54, radius: 60, color: [255, 150, 70], intensity: 0.9 }], door: { dx: 0, dy: -3 }, embers: { dx: 0, dy: -50, rate: 1 } },
  });
}

// ------------------------------------------------------------ Bastionsturm
function bastionTower() {
  const W = 40, H = 76;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 5, x1 = 34, bodyTop = 20;
    ashPatch(p, g, 20, bottom - 1, 18, 2, 1131);
    courses(p, BST, x0 - 2, bottom - 9, x1 - x0 + 5, 10, 1132);
    courses(p, BST, x0, bodyTop, x1 - x0 + 1, bottom - 9 - bodyTop, 1133);
    p.rect(x0, bodyTop, 1, bottom - 9 - bodyTop, BST[5]);
    for (let y = bodyTop; y < bottom - 9; y++) { p.px(x1, y, BST[1]); p.px(x1 - 1, y, BST[2]); }
    // Auskragung mit Konsolen
    p.rect(x0 - 3, bodyTop - 4, x1 - x0 + 7, 4, BST[4]); p.rect(x0 - 3, bodyTop - 4, x1 - x0 + 7, 1, BST[6]); p.rect(x0 - 3, bodyTop - 1, x1 - x0 + 7, 1, BST[1]);
    p.rect(x0 - 3, bodyTop - 2, x1 - x0 + 7, 1, GOLD[1]);
    for (let x = x0 - 2; x < x1 + 3; x += 4) { p.rect(x, bodyTop, 2, 2, BST[3]); p.px(x, bodyTop + 2, BST[2]); }
    // Zinnen
    for (let x = x0 - 3; x < x1 + 4; x += 6) { courses(p, BST, x, 8, 4, 8, 1134, { bw: 4, soot: false }); p.rect(x, 7, 4, 2, IRON[2]); p.rect(x, 7, 4, 1, IRON[4]); p.rect(x + 3, 9, 1, 7, BST[1]); }
    // Signalfeuer auf dem Turm
    p.rect(14, 3, 12, 5, IRON[1]); p.rect(14, 3, 12, 1, IRON[3]); p.rect(15, 2, 10, 1, EMB[2]); g.rect(15, 2, 10, 1, EMB[4]);
    flame(p, g, 17, 2, 6, 1); flame(p, g, 20, 2, 9, 2); flame(p, g, 23, 2, 5, 1);
    // Schießscharten mit Glut
    for (const [x, y, lit] of [[18, 28, true], [11, 40, false], [26, 42, true]]) {
      p.rect(x, y, 2, 7, '#07050a'); p.rect(x - 1, y - 1, 4, 1, BST[5]); p.rect(x - 1, y + 7, 4, 1, BST[2]);
      if (lit) { p.px(x, y + 3, EMB[2]); p.px(x, y + 4, EMB[3]); g.px(x, y + 3, EMB[3]); g.px(x, y + 4, EMB[4]); }
    }
    // Tür mit Eisenbeschlag
    p.rect(15, bottom - 17, 10, 15, BST[1]); p.rect(16, bottom - 16, 8, 14, WOOD[1]); p.rect(16, bottom - 16, 8, 1, WOOD[3]);
    for (let x = 17; x < 24; x += 2) p.rect(x, bottom - 15, 1, 13, WOOD[0]);
    p.rect(16, bottom - 12, 8, 1, IRON[2]); p.rect(16, bottom - 6, 8, 1, IRON[2]); p.px(22, bottom - 9, GOLD[3]);
    // Banner
    p.rect(6, bodyTop + 3, 6, 17, CRIM[3]); p.rect(6, bodyTop + 3, 1, 17, CRIM[4]); p.rect(11, bodyTop + 3, 1, 17, CRIM[1]);
    p.rect(6, bodyTop + 3, 6, 1, GOLD[3]); p.px(8, bodyTop + 9, GOLD[4]); p.rect(7, bodyTop + 8, 4, 3, GOLD[2]); p.px(8, bodyTop + 9, GOLD[4]);
    p.px(6, bodyTop + 20, CRIM[2]); p.px(8, bodyTop + 21, CRIM[3]); p.px(10, bodyTop + 20, CRIM[2]);
  }, { ax: 20, box: [-15, -6, 15, 1], light: { dx: 0, dy: -70, radius: 90, color: [255, 150, 70], intensity: 0.9 }, extra: { embers: { dx: 0, dy: -72, rate: 2 } } });
}

// ------------------------------------------------------------ Bastionszelt
function tent() {
  const W = 38, H = 30;
  return mk(W, H, (p, g) => {
    ashPatch(p, g, 19, H - 2, 17, 2, 1141);
    drawTent(p, g, { W, H, pal: CANV, band: CRIM, ragged: false, seed: 29 });
    const cx = 19;
    // Aschestaub auf der Dachfläche (grau, gesprenkelt), Brandloch
    for (let i = 0; i < 26; i++) { const y = 5 + (i * 7) % 18, x = cx - 2 - Math.round(((y - 4) / 22) * 13) + (i * 5) % 7; p.px(x, y, ASHB[5]); }
    p.rect(cx + 8, 15, 2, 2, '#0b080a'); p.px(cx + 10, 16, EMB[2]); g.px(cx + 10, 16, EMB[3]);
    // Stange mit Wimpel
    p.line(cx, 0, cx, 4, IRON[3]); p.px(cx, 0, GOLD[4]);
    p.rect(cx + 1, 1, 5, 2, CRIM[3]); p.px(cx + 6, 1, CRIM[3]); p.px(cx + 1, 1, CRIM[4]); p.rect(cx + 2, 2, 4, 1, CRIM[2]);
    // Schildstapel und Wassertrog
    p.ellipse(cx + 13, H - 7, 3, 3.5, CRIM[2]); p.ellipse(cx + 12, H - 8, 2, 2.5, CRIM[3]); p.px(cx + 13, H - 7, GOLD[3]);
    p.rect(cx - 17, H - 6, 7, 3, WOOD[2]); p.rect(cx - 16, H - 6, 5, 1, '#1a2a3a'); p.px(cx - 15, H - 6, '#3a5a70');
  }, { ax: 19, box: [-14, -7, 14, 1] });
}

// ------------------------------------------------------------ Bannerstange (Bastion)
function bannerPole() {
  const W = 18, H = 44;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, px0 = 3;
    p.ellipse(px0 + 1, bottom - 1, 4, 1.6, BST[2]); p.ellipse(px0, bottom - 2, 3, 1.2, BST[4]); p.px(px0 - 1, bottom - 2, BST[5]);
    p.rect(px0, 4, 2, bottom - 5, IRON[1]); p.rect(px0, 4, 1, bottom - 5, IRON[3]);
    // Spitze: kleine Feuerschale
    p.rect(px0 - 1, 2, 4, 2, GOLD[2]); p.px(px0 - 1, 2, GOLD[4]);
    p.px(px0, 1, EMB[4]); p.px(px0 + 1, 1, EMB[3]); p.px(px0, 0, EMB[5]);
    g.px(px0, 1, EMB[5]); g.px(px0 + 1, 1, EMB[4]); g.px(px0, 0, EMB[4]);
    p.rect(px0, 6, 13, 2, IRON[2]); p.rect(px0, 6, 13, 1, IRON[4]); p.px(px0 + 13, 6, GOLD[3]);
    const bx0 = px0 + 2, bx1 = px0 + 12, by0 = 8, by1 = 32;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.9);
      const tip = 3 - Math.min(3, Math.round(Math.abs(x - (bx0 + bx1) / 2)));
      const low = by1 + Math.round(fold) + tip - (x % 3 === 0 && x > bx0 + 2 ? 1 : 0); // angesengter Saum
      for (let y = by0; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 4;
        if (y === by0) i = 1;
        p.px(x, y, CRIM[i]);
      }
      p.px(x, low, x % 3 === 0 ? CHAR[3] : GOLD[x % 2 ? 2 : 3]);
    }
    // Emblem: Sonne über Flamme
    const ex = Math.round((bx0 + bx1) / 2), ey = 17;
    p.ellipse(ex, ey, 2.2, 2.2, GOLD[3]); p.px(ex - 1, ey - 1, GOLD[4]);
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [-3, -3], [3, -3], [-3, 3], [3, 3]]) p.px(ex + dx, ey + dy, GOLD[2]);
    p.px(ex, ey + 5, GOLD[3]); p.px(ex - 1, ey + 6, GOLD[3]); p.px(ex + 1, ey + 6, GOLD[2]); p.px(ex, ey + 7, GOLD[3]); p.px(ex, ey + 8, GOLD[2]);
  }, { ax: 4, box: [-2, -2, 2, 1], light: { dx: 0, dy: -42, radius: 30, color: [255, 150, 70], intensity: 0.5 } });
}

// ------------------------------------------------------------ Feldschmiede
function forge() {
  const W = 44, H = 32;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 22, bottom - 1, 20, 2, 1151);
    // Waffengestell hinten rechts
    p.rect(30, 6, 12, 2, WOOD[3]); p.rect(30, 6, 12, 1, WOOD[4]); p.line(31, 8, 31, bottom - 3, WOOD[2]); p.line(41, 8, 41, bottom - 3, WOOD[1]);
    for (const x of [33, 36, 39]) { p.line(x, 3, x, 16, IRON[3]); p.px(x, 2, IRON[5]); p.rect(x - 1, 16, 3, 1, GOLD[1]); p.rect(x, 17, 1, 3, LEA[2]); }
    // Blasebalg
    poly(p, [[1, 15], [8, 13], [8, 21], [1, 19]], (x, y) => (y < 16 ? LEA[3] : (y % 2 ? LEA[2] : LEA[1])));
    p.rect(0, 14, 2, 7, WOOD[3]); p.line(8, 17, 11, 17, IRON[2]);
    // Esse
    courses(p, BST, 10, 14, 17, bottom - 14, 1152, { bw: 6 });
    p.rect(9, 11, 19, 4, BST[4]); p.rect(9, 11, 19, 1, BST[6]); p.rect(9, 11, 1, 4, BST[5]);
    p.rect(11, 11, 15, 2, '#1a0806');
    for (let x = 11; x < 26; x++) { const h = hash2(x, 1, 1153); p.px(x, 11, h < 0.3 ? EMB[4] : h < 0.7 ? EMB[3] : EMB[2]); g.px(x, 11, h < 0.3 ? EMB[5] : EMB[4]); if (h < 0.5) { p.px(x, 12, EMB[2]); g.px(x, 12, EMB[3]); } }
    // Rauchfang
    p.rect(13, 2, 11, 3, BST[3]); p.rect(13, 2, 11, 1, BST[5]); p.rect(15, 5, 7, 1, BST[1]);
    p.line(12, 5, 11, 11, IRON[2]); p.line(25, 5, 26, 11, IRON[1]);
    // Glühende Klinge auf dem Amboss
    p.rect(26, 21, 7, 9, CHAR[3]); p.rect(26, 21, 2, 9, CHAR[5]);
    p.rect(24, 17, 11, 3, IRON[2]); p.rect(24, 17, 11, 1, IRON[4]); p.rect(22, 18, 2, 1, IRON[2]); p.rect(27, 20, 5, 1, IRON[1]); p.px(25, 17, IRON[5]);
    p.line(24, 16, 31, 16, EMB[4]); g.line(24, 16, 31, 16, EMB[5]); p.rect(32, 16, 3, 1, LEA[2]);
    p.line(22, 12, 26, 8, IRON[3]);
    // Löschtrog
    p.rect(2, 24, 8, 5, WOOD[2]); p.rect(2, 24, 1, 5, WOOD[4]); p.rect(3, 24, 6, 1, '#2a1a14'); p.px(5, 24, '#5a3a24');
    p.rect(14, 20, 9, 3, '#1a0806'); p.rect(15, 21, 7, 1, EMB[2]); g.rect(15, 21, 7, 1, EMB[3]);
  }, { ax: 22, box: [-12, -5, 20, 1], light: { dx: -4, dy: -18, radius: 90, color: [255, 140, 60], intensity: 1 }, extra: { embers: { dx: -4, dy: -22, rate: 3 } } });
}

// ------------------------------------------------------------ Kisten
function crates(v) {
  const W = 26, H = 22;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    const crate = (x, y, w, h, burnt) => {
      p.rect(x, y, w, h, WOOD[2]); p.rect(x, y, w, 2, WOOD[3]); p.rect(x, y, w, 1, WOOD[4]); p.rect(x, y, 1, h, WOOD[4]);
      p.rect(x + w - 1, y, 1, h, WOOD[1]); p.rect(x, y + h - 1, w, 1, WOOD[1]);
      p.line(x + 1, y + 3, x + w - 2, y + h - 2, WOOD[3]); p.line(x + 1, y + h - 2, x + w - 2, y + 3, WOOD[1]);
      p.px(x + 1, y + 2, IRON[3]); p.px(x + w - 2, y + 2, IRON[2]);
      if (burnt) for (let yy = y + h - 5; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (hash2(xx, yy, 1161) < (yy - (y + h - 5)) / 5) p.px(xx, yy, CHAR[2]);
    };
    if (v === 0) { crate(1, 9, 13, 12, true); crate(12, 11, 12, 10, false); crate(5, 0, 11, 10, false); p.px(3, 20, EMB[2]); g.px(3, 20, EMB[3]); }
    else if (v === 1) {
      // Fässer (Lampenöl) + Sack
      for (const [bx, by] of [[3, 4], [13, 7]]) {
        p.rect(bx, by, 11, bottom - by - 1, WOOD[2]); p.rect(bx, by, 3, bottom - by - 1, WOOD[3]); p.rect(bx + 9, by, 2, bottom - by - 1, WOOD[1]);
        for (const y of [by + 2, bottom - 4]) { p.rect(bx - 1, y, 13, 2, IRON[1]); p.rect(bx - 1, y, 13, 1, IRON[3]); }
        p.ellipse(bx + 5, by, 5.5, 1.8, WOOD[3]); p.ellipse(bx + 5, by, 4, 1, WOOD[1]); p.px(bx + 2, by - 1, WOOD[4]);
      }
      p.rect(6, 10, 5, 4, CRIM[2]); p.px(8, 11, GOLD[3]); // Warnzeichen
      p.ellipse(22, 18, 4, 3, '#4a3e2c'); p.px(21, 16, '#6a5a3e');
    } else {
      // Truhe mit Pfeilbündeln
      p.rect(3, 9, 20, 11, WOOD[2]); p.rect(3, 6, 20, 4, WOOD[3]); p.rect(3, 6, 20, 1, WOOD[4]);
      for (const x of [3, 12, 21]) { p.rect(x, 6, 2, 14, IRON[1]); p.px(x, 6, IRON[4]); }
      p.rect(12, 11, 2, 3, GOLD[2]); p.px(12, 11, GOLD[4]); p.rect(3, 19, 20, 1, WOOD[1]);
      for (let i = 0; i < 5; i++) { p.line(16 + i, 5, 17 + i, 0, WOOD[4]); p.px(17 + i, 0, CRIM[3]); }
      p.rect(15, 3, 7, 1, LEA[2]);
    }
    p.rect(0, bottom, W, 1, ASHB[2]);
  }, { ax: 13, box: [-10, -4, 10, 1] });
}

// ------------------------------------------------------------ Glutobelisk (Schrein)
function emberObelisk(on) {
  const W = 26, H = 50;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 13;
    ashPatch(p, g, cx, bottom - 1, 11, 2, 1171, on ? 0.08 : 0.02);
    // Stufensockel
    p.rect(2, bottom - 4, 22, 4, BST[3]); p.rect(2, bottom - 4, 22, 1, BST[5]); p.rect(22, bottom - 3, 2, 3, BST[1]);
    p.rect(5, bottom - 7, 16, 3, BST[4]); p.rect(5, bottom - 7, 16, 1, BST[6]); p.rect(19, bottom - 6, 2, 2, BST[2]);
    // Obelisk (verjüngt) aus Obsidian mit Goldkanten
    poly(p, [[8, bottom - 7], [10, 7], [13, 2], [16, 7], [18, bottom - 7]], (x, y) => {
      const rel = (x - 8) / 10;
      let k = rel < 0.45 ? 4 : rel < 0.55 ? 3 : 1;
      if (hash2(x, y, 1172) < 0.05) k += 1;
      return OBS[k];
    });
    p.line(13, 2, 13, bottom - 8, OBS[5]);
    p.line(8, bottom - 8, 10, 7, GOLD[1]); p.line(10, 7, 13, 2, GOLD[2]); p.px(13, 1, GOLD[4]);
    p.px(11, 8, OBS[6]); p.px(11, 9, OBS[5]);
    // Glutrunen entlang der Mittelachse
    const R = on ? EMB[4] : EMB[0];
    const glyph = [[12, 12], [11, 13], [12, 14], [13, 15], [12, 20], [11, 21], [13, 21], [12, 22], [11, 27], [12, 28], [13, 27], [12, 29], [12, 34], [11, 35], [12, 36], [13, 37]];
    for (const [x, y] of glyph) { p.px(x, y, R); if (on) g.px(x, y, (x + y) % 2 ? EMB[5] : EMB[4]); }
    if (!on) for (const [x, y] of glyph) if (y % 7 === 0) p.px(x, y, EMB[1]);
    // Risse im Sockel
    p.px(7, bottom - 5, on ? EMB[3] : CHAR[1]); p.px(8, bottom - 6, on ? EMB[3] : CHAR[1]);
    if (on) {
      g.px(7, bottom - 5, EMB[4]); g.px(8, bottom - 6, EMB[4]);
      // schwebender Glutring + Krone
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2, x = Math.round(cx + Math.cos(t) * 9), y = Math.round(20 + Math.sin(t) * 2.5);
        if (Math.sin(t) < 0 && Math.abs(x - cx) < 4) continue;
        if (a % 2) { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); }
      }
      g.px(13, 1, EMB[5]); g.px(13, 0, EMB[4]); g.px(12, 2, EMB[4]); g.px(14, 2, EMB[4]);
      g.ctx.fillStyle = 'rgba(255,120,40,0.22)'; g.ctx.fillRect(5, bottom - 8, 16, 3);
    }
  }, {
    ax: 13, box: [-9, -4, 9, 1],
    light: on ? { dx: 0, dy: -26, radius: 90, color: [255, 130, 50], intensity: 1 } : undefined,
    extra: on ? { embers: { dx: 0, dy: -30, rate: 4 } } : undefined,
  });
}

// ------------------------------------------------------------ Tor zum Aschethron
function throneGate() {
  const W = 112, H = 92;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 56;
    const rng = createRng(1181);
    // Obsidianmassiv im Hintergrund, zerklüftete Oberkante
    const topAt = (x) => Math.round(8 + Math.abs(Math.sin(x * 0.07)) * 8 + Math.abs(x - cx) * 0.08 + hash2(x >> 2, 0, 1182) * 4);
    for (let x = 0; x < W; x++) for (let y = topAt(x); y <= bottom; y++) {
      const facet = Math.floor((x - y * 0.5) / 9);
      let k = hash2(facet, Math.floor(y / 11), 1183) < 0.5 ? 2 : 1;
      const lx = ((x - y * 0.5) % 9 + 9) % 9;
      if (lx < 1) k = 4; else if (lx > 7.5) k = 0;
      if (y === topAt(x)) k = 4;
      p.px(x, y, OBS[clampI(k, 7)]);
    }
    // Gewaltiger Rahmen: zwei Wächterstatuen (Aschekönige mit Schwertern) + Sturz
    const statue = (sx, dir) => {
      const top = 22;
      // Sockel
      courses(p, BST, sx - 10, bottom - 12, 21, 13, 1184 + sx, { bw: 7 });
      p.rect(sx - 11, bottom - 13, 23, 2, BST[5]); p.rect(sx - 11, bottom - 13, 23, 1, BST[6]);
      // Mantel (Trapez)
      poly(p, [[sx - 4, top + 12], [sx + 5, top + 12], [sx + 9, bottom - 13], [sx - 8, bottom - 13]], (x, y) => {
        const rel = (x - (sx - 8)) / 17;
        let k = rel < 0.25 ? 5 : rel < 0.5 ? 4 : rel < 0.8 ? 3 : 2;
        if ((x - sx + 40) % 4 === 0 && y > top + 16) k -= 1; // Falten
        return BST[clampI(k, 7)];
      });
      // Schultern (breit, Schulterstücke) + behelmter Kopf mit Krone
      p.rect(sx - 9, top + 8, 19, 5, BST[4]); p.rect(sx - 9, top + 8, 19, 1, BST[6]); p.rect(sx + 7, top + 9, 3, 4, BST[2]);
      p.ellipse(sx - 7, top + 10, 3, 2.4, BST[5]); p.ellipse(sx + 7, top + 10, 3, 2.4, BST[3]); p.px(sx - 8, top + 9, BST[6]);
      p.rect(sx - 4, top - 1, 9, 10, BST[4]); p.rect(sx - 4, top - 1, 2, 10, BST[5]); p.rect(sx + 3, top, 2, 9, BST[2]);
      p.rect(sx - 4, top + 3, 9, 1, BST[1]); // Visierschlitz
      p.px(sx - 2, top + 3, EMB[3]); p.px(sx + 2, top + 3, EMB[3]); g.px(sx - 2, top + 3, EMB[4]); g.px(sx + 2, top + 3, EMB[4]);
      p.rect(sx - 3, top + 6, 7, 3, BST[3]); for (let x = sx - 3; x <= sx + 3; x += 2) p.px(x, top + 8, BST[2]); // Bart
      for (let i = 0; i < 9; i++) p.px(sx - 4 + i, top - 2 - (i % 2 ? 0 : 2), GOLD[i < 4 ? 3 : 2]);
      p.px(sx - 4, top - 4, GOLD[4]); p.px(sx, top - 4, GOLD[4]);
      p.rect(sx - 4, top - 2, 9, 1, GOLD[2]);
      // Schwert (Spitze nach unten), Hände auf dem Knauf
      p.rect(sx, top + 13, 2, 2, GOLD[3]);
      p.rect(sx - 3, top + 14, 3, 3, BST[5]); p.rect(sx + 2, top + 14, 3, 3, BST[3]); p.px(sx - 3, top + 14, BST[6]);
      p.rect(sx - 4, top + 17, 10, 1, GOLD[2]); p.px(sx - 4, top + 17, GOLD[4]); p.px(sx + 5, top + 17, GOLD[1]);
      for (let y = top + 18; y < bottom - 14; y++) { p.px(sx, y, IRON[4]); p.px(sx + 1, y, IRON[2]); }
      p.px(sx, bottom - 14, IRON[3]);
      // Glutrisse im Mantel
      crack(p, g, rng, sx + dir * 4, top + 22, 6, 1.4);
    };
    statue(16, -1); statue(W - 17, 1);
    // Portal: Spitzbogen mit gestufter Rahmung (Stein, Obsidian, Gold), darin das Tor
    const ptop = 18, spring = 40;
    const inside = (x, y, inset) => {
      const hw = 25 - inset, apex = ptop + inset * 1.3;
      if (y < apex) return false;
      if (y >= spring) return Math.abs(x - cx) <= hw;
      const t = (spring - y) / (spring - apex);
      return Math.abs(x - cx) <= hw * (1 - t ** 1.6) ** 0.9 + 0.3;
    };
    for (let y = ptop - 2; y <= bottom; y++) for (let x = cx - 27; x <= cx + 27; x++) {
      if (!inside(x, y, 0)) continue;
      let c;
      if (!inside(x, y, 4)) {
        // Keilsteine
        const seg = Math.floor(Math.atan2(y - spring, x - cx) * 5) + (y > spring ? Math.floor(y / 6) : 0);
        c = hash2(seg, 0, 1185) < 0.5 ? BST[4] : BST[3];
        if (x < cx && !inside(x - 1, y, 0)) c = BST[6];
        if (!inside(x, y - 1, 0)) c = BST[5];
        if (inside(x + 1, y + 1, 4) && !inside(x, y, 4)) c = BST[1];
      } else if (!inside(x, y, 7)) c = x < cx ? OBS[4] : OBS[2];
      else if (!inside(x, y, 8)) { c = x < cx ? GOLD[3] : GOLD[2]; g.px(x, y, GOLD[1]); }
      else {
        // Torflügel
        const leaf = x < cx ? x - (cx - 17) : (cx + 17) - x;
        c = x < cx ? (leaf < 2 ? OBS[4] : OBS[3]) : OBS[2];
        if (hash2(x >> 1, y >> 2, 1186) < 0.12) c = OBS[x < cx ? 4 : 1];
        if ((y - spring) % 14 === 0 && y > ptop + 14) c = x < cx ? GOLD[2] : GOLD[1];
        if ((y - spring) % 14 === 1 && y > ptop + 14) c = OBS[1];
        if (leaf === 5 && (y - spring) % 14 === 7) { c = GOLD[3]; p.px(x, y - 1, GOLD[2]); }
        if (Math.abs(x - cx) === 1) { c = EMB[2]; g.px(x, y, EMB[3]); }
        if (x === cx) { c = EMB[4]; g.px(x, y, EMB[5]); }
      }
      p.px(x, y, c);
    }
    // Aschekönigsmaske am Scheitel des Tors
    const my = spring - 8;
    p.rect(cx - 4, my, 9, 7, GOLD[2]); p.rect(cx - 4, my, 9, 1, GOLD[4]); p.rect(cx - 3, my + 7, 7, 2, GOLD[1]);
    p.px(cx - 2, my + 3, '#0a0506'); p.px(cx + 2, my + 3, '#0a0506'); p.px(cx - 2, my + 3, EMB[4]); p.px(cx + 2, my + 3, EMB[4]);
    g.px(cx - 2, my + 3, EMB[5]); g.px(cx + 2, my + 3, EMB[5]);
    p.rect(cx - 1, my + 6, 3, 1, '#0a0506');
    const ix0 = cx - 17, ix1 = cx + 17, px0 = cx - 25, px1 = cx + 25;
    // Emblem: Aschekrone über dem Tor
    const ey = ptop - 5;
    p.rect(cx - 8, ey + 4, 17, 3, GOLD[2]); p.rect(cx - 8, ey + 4, 17, 1, GOLD[4]);
    for (let i = 0; i < 5; i++) { const x = cx - 8 + i * 4; p.rect(x, ey + (i % 2 ? 1 : -1), 1, 5 - (i % 2 ? 1 : -1), GOLD[3]); p.px(x, ey - (i % 2 ? -1 : 1) - 1, EMB[4]); g.px(x, ey - (i % 2 ? -1 : 1) - 1, EMB[5]); }
    g.rect(cx - 7, ey + 5, 15, 1, EMB[2]);
    // Glutrinnen am Fuß des Portals und Glutbecken vorn
    for (let x = ix0; x <= ix1; x++) { p.px(x, bottom, EMB[2]); g.px(x, bottom, Math.abs(x - cx) < 6 ? EMB[4] : EMB[2]); }
    for (const bx of [px0 - 2, px1 + 2]) {
      p.ellipse(bx, bottom - 1, 4, 1.8, CHAR[1]); p.ellipse(bx, bottom - 1, 2.8, 1, EMB[3]); p.px(bx, bottom - 1, EMB[5]);
      g.ellipse(bx, bottom - 1, 2.8, 1, EMB[4]); g.px(bx, bottom - 1, EMB[5]);
    }
    // Ketten vom Sturz zu den Statuen
    for (const [a, b] of [[[px0 + 2, spring - 6], [22, 34]], [[px1 - 2, spring - 6], [W - 23, 34]]]) {
      for (let t = 0; t <= 1; t += 0.06) { const x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 5); p.px(x, y, (t * 16 | 0) % 2 ? IRON[3] : IRON[1]); }
    }
    // Glutpunkte im Fels
    for (let i = 0; i < 10; i++) { const x = rng.int(2, W - 3), y = rng.int(20, bottom - 16); if (x > 5 && x < W - 5 && Math.abs(x - cx) < 40) continue; p.px(x, y, EMB[1]); g.px(x, y, EMB[2]); }
  }, {
    ax: 56, light: { dx: 0, dy: -24, radius: 120, color: [255, 110, 40], intensity: 1 },
    extra: { boxes: [[-56, -10, -22, 1], [22, -10, 56, 1]], door: { dx: 0, dy: -3 }, embers: { dx: 0, dy: -8, rate: 3 } },
  });
}

// ------------------------------------------------------------ Knochenhaufen
function bonePile(v) {
  const rng = createRng(1200 + v);
  const W = v ? 30 : 24, H = v ? 18 : 15;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = Math.floor(W / 2);
    ashPatch(p, g, cx, bottom - 1, cx - 1, 2, 1201 + v, 0.06);
    const B = BONE;
    const bone = (x0, y0, x1, y1) => {
      p.line(x0, y0, x1, y1, B[2]); p.line(x0, y0 - 1, x1, y1 - 1, B[3]);
      p.rect(x0 - 1, y0 - 2, 2, 3, B[3]); p.px(x0 - 1, y0 - 2, B[4]); p.rect(x1, y1 - 2, 2, 3, B[2]);
      // verkohlte Enden
      p.px(x1 + 1, y1, CHAR[2]);
    };
    for (let i = 0; i < (v ? 9 : 6); i++) {
      const x = rng.int(3, W - 8), y = rng.int(bottom - 8, bottom - 2), len = rng.int(4, 7), a = rng.range(-0.5, 0.5);
      bone(x, y, x + Math.round(Math.cos(a) * len), y + Math.round(Math.sin(a) * len * 0.5));
    }
    // Schädel
    const skull = (sx, sy, lit) => {
      p.ellipse(sx, sy, 3, 2.6, B[3]); p.ellipse(sx - 1, sy - 1, 2, 1.6, B[4]);
      p.rect(sx - 2, sy + 1, 5, 2, B[2]);
      p.px(sx - 1, sy, '#140808'); p.px(sx + 1, sy, '#140808');
      if (lit) { p.px(sx - 1, sy, EMB[3]); p.px(sx + 1, sy, EMB[3]); g.px(sx - 1, sy, EMB[4]); g.px(sx + 1, sy, EMB[4]); }
      p.px(sx - 1, sy + 2, '#140808'); p.px(sx + 1, sy + 2, '#140808');
    };
    skull(cx - 2, bottom - 7, v === 1);
    if (v) { skull(cx + 7, bottom - 4, false); p.line(cx + 4, bottom - 12, cx + 9, bottom - 2, IRON[2]); p.px(cx + 4, bottom - 13, IRON[4]); }
    // Rippenbogen
    for (let t = 0; t < Math.PI; t += 0.15) p.px(Math.round(cx + 4 + Math.cos(t) * 4), Math.round(bottom - 3 - Math.sin(t) * 5), t < 1.5 ? B[3] : B[2]);
    // Glut zwischen den Knochen
    for (let i = 0; i < 3; i++) { const x = rng.int(4, W - 5), y = bottom - rng.int(1, 3); p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
  }, { ax: Math.floor(W / 2), ay: H - 2, box: [-Math.floor(W / 2) + 3, -4, Math.floor(W / 2) - 3, 1] });
}

export function createWastesDecor() {
  return {
    charredRuins: [0, 1, 2].map(charredRuin),
    obsidianShards: [0, 1, 2].map(obsidianShards),
    ashDunes: [0, 1].map(ashDune),
    emberGeysers: [0, 1].map(emberGeyser),
    scorchedTrees: [0, 1].map(scorchedTree),
    bastionWall: bastionWallH(),
    bastionWallV: bastionWallV(),
    bastionGate: bastionGate(),
    bastionTower: bastionTower(),
    tent: tent(),
    bannerPole: bannerPole(),
    forge: forge(),
    crates: [0, 1, 2].map(crates),
    emberObelisk: { off: emberObelisk(false), on: emberObelisk(true) },
    throneGate: throneGate(),
    bonePiles: [0, 1].map(bonePile),
  };
}
