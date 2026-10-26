import { createRng, hash2 } from '../core/math.js';
import { mk, fpoly, lump, canopy, pal32 } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import {
  PEARL, SLATE, ROSE, GOLD, WOOD, LAMP, CRY, LEAF, BUSH, LAMP_LIGHT, CRY_LIGHT, P, G, Wd,
  pearlWall, plinth, cornice, roof, spire, towerBody, archWin, archDoor, footShade,
} from './decor_starcity.js';

// Sternhafen, zweite Bauwelle (Nutzerwunsch: mehr und unterschiedliche Gebäude): schmale Stadthäuser mit drei
// Geschossen, Fachwerk und Grünspandächern, Läden mit gestreiften Markisen und Zunftschildern, Sternkapelle mit
// Glockenturm, Kuppelbibliothek, Glashaus, Uhrturm, Luftschiffe am Anleger. Gleiche Bauteile und Lichtrichtung wie
// decor_starcity.js (Licht von links oben, Fassade frontal, schmale Schattenseite rechts), alles Stufe B (fein).

const VERD = ['#0e2224', '#163634', '#1e4c48', '#2a6860', '#3c8878', '#58a890', '#88ccb0'];
const OCHRE = ['#2a1810', '#4a2a16', '#6e401e', '#8e5828', '#b07836', '#d09a4e', '#ecc078'];
const PLAST = ['#3a3040', '#5a4e5a', '#857a80', '#b0a4a4', '#d4c8c0', '#ece2d8', '#fff8ee'];
const TIMB = ['#160e12', '#2a1a1c', '#40282a', '#583834', '#704a40'];
const CANVAS = ['#2a2438', '#5a4e66', '#9a8ea4', '#d8d0dc', '#f4eef6'];
const Pl = pal32(PLAST), Tb = pal32(TIMB);

// Fachwerkwand: Putzfelder (Licht links, Schatten rechts), dunkle Balken: Ständer, Riegel je Geschoss, Streben
function timberWall(p, x0, x1, y0, y1, floors, seed) {
  const fh = (y1 - y0) / floors, posts = [x0, x0 + (x1 - x0) * 0.5 - 1, x1 - 2.5];
  p.scan(x0, y0, x1, y1, (x, y) => {
    const fl = Math.floor((y - y0) / fh), ly = (y - y0) - fl * fh;
    if (ly < 1.5 || (fl === floors - 1 && y > y1 - 1.5)) return Tb[ly < 0.5 ? 4 : 2];
    for (const px of posts) if (x >= px && x < px + 2.5) return Tb[x < px + 1 ? 4 : 2];
    // Streben in den äußeren Feldern (Andreaskreuz halb)
    const fx = x < posts[1] ? (x - x0) / (posts[1] - x0) : (x - posts[1]) / (x1 - posts[1]);
    const brace = Math.abs((ly - 1.5) / (fh - 1.5) - (x < posts[1] ? fx : 1 - fx)) < 0.07 && fl > 0;
    if (brace) return Tb[3];
    let i = x > x1 - 5 ? 3 : 5;
    if (hash2(Math.floor(x / 2), Math.floor(y / 2), seed) < 0.06) i -= 1;
    if (ly < 3) i = Math.min(i, 4);
    return Pl[i];
  });
}

// Kamin mit Goldkappe
function chimney(p, x, top, bot) {
  p.scan(x, top, x + 6, bot, (xx, y) => (y < top + 1 ? P[6] : xx < x + 2 ? P[5] : xx > x + 4.5 ? P[2] : P[4]));
  p.scan(x - 1, top - 1, x + 7, top + 1, (xx, y) => (y < top ? G[4] : G[2]));
}

// Rechteckfenster mit Läden (Stadthäuser), warm erleuchtet
function shutterWin(p, g, x, y, w, h, shut, lit = true) {
  const L = pal32(LAMP), S = pal32(shut);
  p.scan(x - 1, y - 1, x + w + 1, y + h + 1, (xx, yy) => (xx < x || yy < y ? P[6] : xx > x + w || yy > y + h ? P[2] : 0));
  p.scan(x, y, x + w, y + h, (xx, yy) => {
    if (Math.abs(xx - (x + w / 2)) < 0.3 || Math.abs(yy - (y + h * 0.45)) < 0.25) return P[2];
    if (!lit) return col32(yy < y + h / 2 ? '#3a4060' : '#2a2c48');
    return xx < x + w / 2 && yy < y + h * 0.45 ? L[4] : L[3];
  });
  if (lit) g.each(x, y, x + w, y + h, () => LAMP[3]);
  for (const sx of [x - 3.5, x + w + 1]) p.scan(sx, y - 0.5, sx + 2.5, y + h + 0.5, (xx, yy) => (Math.floor(yy) % 2 === 0 ? S[2] : xx < sx + 1 ? S[5] : S[4]));
  p.scan(x - 2, y + h + 1, x + w + 2, y + h + 2, (xx, yy) => (yy < y + h + 1.5 ? P[6] : P[3]));
}

// ---------------------------------------------------------------- Stadthäuser (schmal, drei Geschosse)
// v0 Perlstein mit Grünspandach und Gaube, v1 Fachwerk mit Rosadach und Erkerbalkon, v2 Fachwerk mit Ockerdach
// und Laubengang im Erdgeschoss, v3 Perlstein mit Schieferdach und Balkon
function townhouse(v) {
  const W = 58, H = 126, cx = 29, bot = H - 2, seed = 4100 + v * 17;
  const R = [VERD, ROSE, OCHRE, SLATE][v], timber = v === 1 || v === 2;
  return mk(W, H, (p, g) => {
    const x0 = 8, x1 = W - 8, wallTop = bot - 64;
    footShade(p, cx, bot, 26, 3);
    if (timber) {
      // Erdgeschoss Perlstein, darüber zwei Fachwerkgeschosse (leicht vorkragend)
      pearlWall(p, x0, x1, bot - 24, bot - 4, seed);
      timberWall(p, x0 - 1.5, x1 + 1.5, wallTop, bot - 24, 2, seed);
      p.scan(x0 - 2, bot - 25, x1 + 2, bot - 23, (x, y) => (y < bot - 24.5 ? Tb[4] : Tb[1]));
    } else {
      pearlWall(p, x0, x1, wallTop, bot - 4, seed);
      cornice(p, x0 - 1, x1 + 1, bot - 25);
      cornice(p, x0 - 1, x1 + 1, bot - 45);
    }
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    cornice(p, x0 - 1.5, x1 + 1.5, wallTop);
    // Obergeschosse: zwei Fenster je Geschoss
    const sh = [VERD, ROSE, OCHRE, SLATE][(v + 1) % 4];
    for (const wy of [wallTop + 6, wallTop + 26]) {
      if (timber) { shutterWin(p, g, x0 + 7, wy, 6, 9, sh); shutterWin(p, g, x1 - 13, wy, 6, 9, sh); }
      else { archWin(p, g, x0 + 5, wy + 3, 6, 8); archWin(p, g, x1 - 11, wy + 3, 6, 8); }
    }
    // Erdgeschoss
    if (v === 2) {
      // Laubengang: zwei Bögen, dahinter Tür und ein Fenster im Schatten
      p.scan(x0 + 1, bot - 22, x1 - 1, bot - 4, (x, y) => col32(y < bot - 20 ? '#2a2236' : '#1e1a2c'));
      archDoor(p, g, cx - 8, bot - 4, 8, 15);
      shutterWin(p, g, cx + 6, bot - 17, 5, 7, sh);
      for (const ax of [x0, cx - 1, x1 - 3]) p.scan(ax, bot - 22, ax + 4, bot - 4, (x) => P[x < ax + 1.5 ? 6 : x < ax + 3 ? 5 : 3]);
      for (const [a, b] of [[x0 + 4, cx - 1], [cx + 3, x1 - 3]]) {
        const m = (a + b) / 2, r = (b - a) / 2;
        p.scan(a, bot - 24, b, bot - 15, (x, y) => (Math.hypot((x - m) / r, (y - (bot - 15)) / 7) > 1 ? P[(y < bot - 23 ? 6 : 5)] : 0));
      }
    } else {
      archDoor(p, g, x0 + 10, bot - 3, 8, 16);
      archWin(p, g, x1 - 13, bot - 18, 7, 8);
    }
    // Balkon (v1 Erker, v3 Balkon mit Goldgeländer und Blumen)
    if (v === 1 || v === 3) {
      const by = wallTop + 38;
      p.scan(x0 + 2, by, x1 - 2, by + 2, (x, y) => (y < by + 0.6 ? P[6] : P[3]));
      p.scan(x0 + 2, by - 6, x1 - 2, by, (x, y) => (y < by - 5.5 ? G[4] : ((x - x0) % 2.5) < 0.6 ? G[3] : 0));
      for (let x = x0 + 3; x < x1 - 3; x += 2) { const k = hash2(Math.floor(x), v, 4190); p.dot(x, by - 1, k < 0.5 ? BUSH[3] : BUSH[4]); if (k < 0.4) p.dot(x + 0.5, by - 1.5, LEAF[k < 0.2 ? 5 : 4]); }
      for (let k = 0; k < 3; k++) p.fline(x0 + 4 + k * 12, by + 2, x0 + 6 + k * 12, by + 4, PEARL[2], 0.5);
    }
    // Steildach mit Gaube, Kamin
    roof(p, x0 - 4, x1 + 4, wallTop - 38, wallTop + 1, R, seed, 9);
    const gx = cx - 5, gy = wallTop - 18;
    p.scan(gx, gy, gx + 10, gy + 9, (x, y) => (x > gx + 8.5 ? P[3] : y < gy + 0.5 ? P[6] : P[5]));
    archWin(p, g, gx + 2.5, gy + 3.5, 5, 4, { box: false });
    roof(p, gx - 2, gx + 12, gy - 6, gy + 1, R, seed + 3, 6);
    chimney(p, v & 1 ? x0 + 2 : x1 - 9, wallTop - 46, wallTop - 26);
  }, { ax: cx, ay: bot, b: true, box: [-22, -16, 22, 1], extra: { smoke: { dx: (v & 1 ? -16 : 15), dy: -112, rate: 2 } },
    light: { dx: 0, dy: -14, radius: 56, color: LAMP_LIGHT, intensity: 0.45 } });
}

// ---------------------------------------------------------------- Läden
// v0 Bäckerei (Rosamarkise, Brezelschild, Brotkörbe), v1 Alchemie (Grünspanmarkise, Kolbenschild, Flaschenkisten),
// v2 Kartenmacher (Goldmarkise, Schriftrollenschild, Fass mit Karten)
function starShop(v) {
  const W = 88, H = 92, cx = 44, bot = H - 2, seed = 4300 + v * 11;
  const AW = pal32([ROSE, VERD, ['#5a3a14', '#9a6a24', '#d8a440', '#f6d888', '#fff4c8', '#fffbe8']][v]);
  const R = [SLATE, OCHRE, ROSE][v];
  return mk(W, H, (p, g) => {
    const x0 = 10, x1 = W - 10, wallTop = bot - 36;
    footShade(p, cx, bot, 40, 3.5);
    if (v === 1) timberWall(p, x0, x1, wallTop, bot - 4, 1, seed); else pearlWall(p, x0, x1, wallTop, bot - 4, seed);
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    cornice(p, x0 - 1, x1 + 1, wallTop);
    // Schaufenster (links, breit, Sprossen) mit Waren dahinter, Tür rechts
    const sx0 = x0 + 4, sx1 = x0 + 34, sy0 = bot - 24, sy1 = bot - 6;
    p.scan(sx0 - 1.5, sy0 - 1.5, sx1 + 1.5, sy1 + 1.5, (x, y) => (x < sx0 || y < sy0 ? Wd[4] : x > sx1 || y > sy1 ? Wd[1] : 0));
    const L = pal32(LAMP);
    p.scan(sx0, sy0, sx1, sy1, (x, y) => {
      if (((x - sx0) % 7.5) < 0.6 || Math.abs(y - (sy0 + 6)) < 0.3) return Wd[2];
      const shelf = y > sy1 - 5 && y < sy1 - 4;
      if (shelf) return Wd[3];
      return y < sy0 + 6 ? L[4] : L[3];
    });
    g.each(sx0, sy0, sx1, sy1, (x, y) => (((x - sx0) % 7.5) < 0.6 ? null : LAMP[3]));
    const rng = createRng(seed);
    for (let i = 0; i < 7; i++) {
      const x = sx0 + 3 + i * 4.2, y = sy1 - 5.5;
      if (v === 0) { p.oval(x, y, 1.8, 1.1, i & 1 ? '#c08040' : '#a0602c'); p.dot(x - 0.6, y - 0.6, '#f0c080'); }
      else if (v === 1) { const c = ['#5ccbea', '#c86a98', '#8ad0b4', '#f6d888'][i % 4]; p.scan(x - 0.8, y - 3, x + 0.8, y + 0.5, (xx, yy) => col32(yy < y - 2.4 ? '#d8d0dc' : c)); g.dot(x, y - 1, c); }
      else { p.scan(x - 1.4, y - 2.5, x + 1.4, y + 0.5, (xx, yy) => col32(yy < y - 2 ? '#fff4c8' : xx < x ? '#ecd8a8' : '#c8b080')); }
      if (rng.next() < 0.5) p.dot(x + 1, sy0 + 3, LAMP[5]);
    }
    archDoor(p, g, x1 - 13, bot - 3, 10, 19);
    // Markise über Schaufenster und Tür: Streifen, gewellter Saum, Goldstange
    const ay0 = wallTop + 4, ay1 = wallTop + 13;
    p.scan(x0 - 2, ay0, x1 + 2, ay1 + 2, (x, y) => {
      const k = (y - ay0) / (ay1 - ay0), wave = Math.abs(Math.sin(((x - x0) / 5) * Math.PI)) * 1.6;
      if (y > ay1 + 2 - wave) return 0;
      const stripe = Math.floor((x - x0 + 40) / 5) & 1;
      let i = k < 0.25 ? 5 : k < 0.7 ? 4 : 3;
      if (x > x1 - 2) i -= 1;
      return stripe ? Pl[Math.min(6, i + 1)] : AW[Math.min(AW.length - 1, i)];
    });
    p.scan(x0 - 2.5, ay0 - 1.5, x1 + 2.5, ay0, (x, y) => (y < ay0 - 0.8 ? G[4] : G[2]));
    // Zunftschild am Ausleger (über der Tür rechts)
    const kx = x1 + 1, ky = wallTop - 2;
    p.fline(kx - 2, ky, kx + 8, ky, GOLD[2], 1);
    p.fline(kx + 1, ky, kx + 1, ky + 3, GOLD[3], 0.4); p.fline(kx + 7, ky, kx + 7, ky + 3, GOLD[3], 0.4);
    p.scan(kx - 1, ky + 3, kx + 9, ky + 12, (x, y) => (y < ky + 3.5 || x < kx - 0.5 ? Wd[5] : y > ky + 11.5 || x > kx + 8.5 ? Wd[1] : Wd[3]));
    const ix = kx + 4, iy = ky + 7.5;
    if (v === 0) { for (let a = 0; a < 6.28; a += 0.3) p.dot(ix + Math.cos(a) * 2.6, iy + Math.sin(a) * 2, GOLD[4]); p.fline(ix - 2, iy - 1, ix + 2, iy + 1, GOLD[4], 0.5); p.fline(ix + 2, iy - 1, ix - 2, iy + 1, GOLD[4], 0.5); }
    else if (v === 1) { p.oval(ix, iy + 1, 2.4, 2.2, CRY[3]); p.fline(ix, iy - 3, ix, iy - 1, CRY[4], 0.8); p.dot(ix - 1, iy, CRY[5]); g.oval(ix, iy + 1, 2.2, 2, CRY[3]); }
    else { p.scan(ix - 3, iy - 2, ix + 3, iy + 2, (x, y) => col32(x < ix - 2 || x > ix + 2 ? '#c8b080' : y < iy - 1 ? '#fff4c8' : '#ecd8a8')); p.fline(ix - 1.5, iy, ix + 1.5, iy, GOLD[2], 0.3); }
    // Waren vor dem Laden
    if (v === 0) for (const bx of [x0 + 6, x0 + 30]) { p.scan(bx - 4, bot - 3, bx + 4, bot + 1, (x, y) => (y < bot - 2.5 ? Wd[5] : Math.floor(x) % 2 ? Wd[3] : Wd[4])); for (let k = 0; k < 4; k++) p.oval(bx - 2.5 + k * 1.7, bot - 3.5, 1.2, 0.9, '#c08040'); }
    else if (v === 1) for (const bx of [x0 + 8, x0 + 24]) { p.scan(bx - 4, bot - 5, bx + 4, bot + 1, (x, y) => (y < bot - 4.5 ? Wd[5] : x > bx + 3 ? Wd[1] : Wd[3])); for (let k = 0; k < 4; k++) p.fline(bx - 2.5 + k * 1.7, bot - 5, bx - 2.5 + k * 1.7, bot - 7, ['#5ccbea', '#8ad0b4', '#c86a98', '#f6d888'][k], 0.8); }
    else { const bx = x0 + 10; p.scan(bx - 4, bot - 8, bx + 4, bot + 1, (x, y) => ((Math.floor(y) % 4) === 0 ? G[2] : x < bx - 2 ? Wd[5] : x > bx + 2 ? Wd[2] : Wd[4])); for (let k = 0; k < 3; k++) p.fline(bx - 2 + k * 2, bot - 8, bx - 3 + k * 2, bot - 12, '#ecd8a8', 0.8); }
    roof(p, x0 - 5, x1 + 5, wallTop - 24, wallTop + 1, R, seed, 12);
    chimney(p, x0 + 6, wallTop - 30, wallTop - 14);
  }, { ax: cx, ay: bot, b: true, box: [-36, -18, 36, 1], extra: v === 0 ? { smoke: { dx: -24, dy: -66, rate: 3 } } : undefined,
    light: { dx: -14, dy: -12, radius: 62, color: LAMP_LIGHT, intensity: 0.55 } });
}

// ---------------------------------------------------------------- Sternkapelle
// Langhaus mit hohen Bogenfenstern, Giebelfront mit Sternrosette (Leuchtebene), Portal mit Freitreppe, Glockenturm
// rechts mit Grünspanhelm
function starTemple() {
  const W = 140, H = 176, cx = 62, bot = H - 2, seed = 4500;
  return mk(W, H, (p, g) => {
    const x0 = 14, x1 = 110, wallTop = bot - 52;
    footShade(p, 70, bot, 66, 4);
    pearlWall(p, x0, x1, wallTop, bot - 6, seed, { side: 8, bh: 5, bw: 11 });
    plinth(p, x0 - 1, x1 + 1, bot - 6, bot);
    cornice(p, x0 - 1, x1 + 1, wallTop);
    // Strebepfeiler
    for (const bx of [x0, x0 + 24, x1 - 30, x1 - 6]) p.scan(bx, wallTop + 4, bx + 5, bot - 6, (x, y) => (y < wallTop + 5 ? P[6] : x < bx + 1.5 ? P[6] : x < bx + 3.5 ? P[5] : P[3]));
    // Hohe Fenster mit Sternglas
    for (const wx of [x0 + 9, x1 - 21]) {
      archWin(p, g, wx, wallTop + 16, 8, 22, { box: false });
      p.each(wx, wallTop + 16, wx + 8, wallTop + 38, (x, y) => (hash2(Math.floor(x * 2), Math.floor(y * 2), 4510) < 0.12 ? CRY[4] : null));
    }
    // Dach des Langhauses
    roof(p, x0 - 6, x1 + 6, wallTop - 30, wallTop + 1, SLATE, seed, 14);
    // Giebelfront in der Mitte, vor dem Dach
    const gx0 = cx - 24, gx1 = cx + 24, gTop = wallTop - 46;
    p.scan(gx0, gTop, gx1, bot - 6, (x, y) => {
      const half = 24 * Math.min(1, (y - gTop) / 30);
      if (Math.abs(x - cx) > half) return 0;
      const row = Math.floor((y - gTop) / 5), lx = (x - gx0 + (row & 1) * 5.5) % 11;
      if (y > gTop + 30 && (x > gx1 - 5)) return P[3];
      return (y - gTop) % 5 < 0.6 || lx < 0.6 ? P[3] : P[hash2(Math.floor((x - gx0) / 11), row, seed) < 0.2 ? 4 : 5];
    });
    // Giebelkante Gold, Kreuzblume
    for (let t = 0; t <= 1; t += 0.02) { const y = gTop + t * 30; p.dot(cx - 24 * t, y, GOLD[4]); p.dot(cx + 24 * t, y, GOLD[2]); }
    p.oval(cx, gTop - 3, 2, 2.5, GOLD[3]); p.dot(cx - 0.6, gTop - 4, GOLD[5]);
    p.fline(cx, gTop - 10, cx, gTop - 4, GOLD[3], 0.5);
    for (const [dx, dy] of [[-2, -8], [2, -8], [0, -10.5]]) p.dot(cx + dx, gTop + dy, GOLD[4]);
    // Sternrosette
    const ry = gTop + 30, rr = 10;
    p.scan(cx - rr - 2, ry - rr - 2, cx + rr + 2, ry + rr + 2, (x, y) => {
      const d = Math.hypot(x - cx, y - ry);
      if (d > rr + 1.5) return 0;
      if (d > rr) return x < cx ? G[4] : G[2];
      const a = Math.atan2(y - ry, x - cx), spoke = Math.abs(Math.sin(a * 4)) < 0.12 && d > 2.5;
      if (spoke || Math.abs(d - rr * 0.55) < 0.35) return G[3];
      const star = Math.abs(Math.cos(a * 2.5)) * rr * 0.6 > d;
      return col32(d < 2.2 ? '#ffffff' : star ? CRY[4] : (hash2(Math.floor(a * 6), Math.floor(d), 4520) < 0.5 ? '#8a6ad8' : CRY[3]));
    });
    g.each(cx - rr, ry - rr, cx + rr, ry + rr, (x, y) => (Math.hypot(x - cx, y - ry) < rr ? CRY[3] : null));
    // Portal mit Freitreppe
    archDoor(p, g, cx, bot - 6, 16, 28);
    p.scan(cx - 16, bot - 6, cx + 16, bot + 1, (x, y) => (Math.floor(y - bot + 6) % 2 === 0 ? P[6] : x > cx + 12 ? P[3] : P[4]));
    for (const lx of [cx - 13, cx + 13]) {
      p.scan(lx - 1.5, bot - 26, lx + 1.5, bot - 20, (x, y) => (y < bot - 25.5 || y > bot - 20.5 ? G[2] : col32(LAMP[x < lx ? 4 : 3])));
      g.oval(lx, bot - 23, 1.8, 2.6, LAMP[4]);
    }
    // Glockenturm rechts
    const tx = 120, tw = 12, tTop = bot - 118;
    pearlWall(p, tx - tw, tx + tw, tTop, bot - 6, seed + 1, { side: 5 });
    plinth(p, tx - tw - 1, tx + tw + 1, bot - 6, bot);
    for (const y of [tTop, bot - 52]) cornice(p, tx - tw - 1, tx + tw + 1, y);
    archWin(p, g, tx - 3, bot - 40, 6, 10, { box: false });
    // Glockenstube: offene Bögen, Glocke
    const by = tTop + 4;
    p.scan(tx - tw + 3, by, tx + tw - 3, by + 18, (x, y) => {
      const m = x < tx ? tx - tw / 2 : tx + tw / 2, inA = Math.abs(x - m) < 3.6 && (y > by + 5 || Math.hypot(x - m, y - (by + 5)) < 3.6);
      return inA ? col32('#1a1430') : 0;
    });
    for (const m of [tx - tw / 2, tx + tw / 2]) { p.oval(m, by + 11, 2.4, 2.6, GOLD[3]); p.dot(m - 0.8, by + 10, GOLD[5]); p.scan(m - 3, by + 13, m + 3, by + 14, () => G[2]); }
    p.scan(tx - tw - 2, tTop - 3, tx + tw + 2, tTop, (x, y) => (y < tTop - 2 ? G[4] : P[x > tx + tw - 2 ? 3 : 6]));
    spire(p, tx, tTop - 3, tTop - 48, tw + 2, VERD);
  }, { ax: 70, ay: bot, b: true, box: [-60, -32, 64, 1], extra: { lights: [{ dx: -8, dy: -96, radius: 70, color: CRY_LIGHT, intensity: 0.6 }, { dx: -8, dy: -24, radius: 60, color: LAMP_LIGHT, intensity: 0.6 }] } });
}

// ---------------------------------------------------------------- Kuppelbibliothek
// Rundbau mit Säulenvorhalle und Dreiecksgiebel, Grünspankuppel mit Goldrippen, Laterne mit Sternglas
function starLibrary() {
  const W = 128, H = 136, cx = 64, bot = H - 2, seed = 4600;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 58, 4);
    const dTop = bot - 58, hw = 48;
    towerBody(p, cx, hw, dTop, bot - 5, seed);
    plinth(p, cx - hw - 2, cx + hw + 2, bot - 5, bot);
    cornice(p, cx - hw - 1, cx + hw + 1, dTop);
    for (const wx of [cx - 40, cx - 30, cx + 24, cx + 34]) archWin(p, g, wx, dTop + 14, 6, 14, { box: false });
    // Kuppel
    const ky = dTop - 1;
    lump(p, cx, ky, hw - 4, 34, VERD, { lo: 1, hi: 6, cut: (x, y) => y > ky - 0.5 });
    for (let k = -3; k <= 3; k++) {
      for (let t = 0; t <= 1; t += 0.01) {
        const a = t * Math.PI / 2, x = cx + k * (hw - 4) / 3.4 * Math.cos(a), y = ky - 34 * Math.sin(a);
        p.dot(x, y, k < 0 ? GOLD[4] : GOLD[2]);
      }
    }
    p.scan(cx - hw + 2, ky - 2, cx + hw - 2, ky + 1, (x, y) => (y < ky - 1 ? G[4] : G[2]));
    // Laterne
    const ly = ky - 34;
    p.scan(cx - 6, ly - 12, cx + 6, ly + 1, (x, y) => (y < ly - 11 ? G[4] : Math.abs(x - cx) < 1.5 || Math.abs(x - cx) > 4.5 ? P[x < cx ? 6 : 4] : col32(CRY[y < ly - 6 ? 4 : 3])));
    g.each(cx - 4, ly - 11, cx + 4, ly, (x) => (Math.abs(x - cx) < 1.5 ? null : CRY[3]));
    lump(p, cx, ly - 12, 7, 5, VERD, { lo: 2, hi: 6, cut: (x, y) => y > ly - 12 });
    p.fline(cx, ly - 24, cx, ly - 17, GOLD[3], 0.6);
    p.oval(cx, ly - 25, 2, 2, CRY[4]); p.dot(cx - 0.6, ly - 25.6, '#ffffff'); g.oval(cx, ly - 25, 2.6, 2.6, CRY[3]);
    // Vorhalle: Stufen, vier Säulen, Gebälk, Giebel
    const px0 = cx - 26, px1 = cx + 26, eTop = bot - 46;
    p.scan(px0 - 4, bot - 5, px1 + 4, bot + 1, (x, y) => (Math.floor(y - bot + 5) % 2 === 0 ? P[6] : x > px1 ? P[3] : P[4]));
    p.scan(px0 + 4, eTop + 6, px1 - 4, bot - 5, (x, y) => col32(y < eTop + 9 ? '#1e1a2c' : '#2a2438'));
    archDoor(p, g, cx, bot - 5, 12, 22);
    for (let k = 0; k < 4; k++) {
      const sx = px0 + 2 + k * 16;
      p.scan(sx, eTop + 6, sx + 5, bot - 5, (x, y) => (y < eTop + 7.5 || y > bot - 7 ? P[6] : x < sx + 1.5 ? P[6] : x < sx + 3.5 ? P[5] : P[3]));
      for (let y = eTop + 9; y < bot - 7; y += 3) p.dot(sx + 2.5, y, PEARL[4]);
    }
    p.scan(px0 - 2, eTop, px1 + 2, eTop + 6, (x, y) => (y < eTop + 1 ? G[4] : y < eTop + 2 ? G[2] : y > eTop + 5 ? P[2] : x > px1 - 2 ? P[3] : P[5]));
    fpoly(p, [[px0 - 3, eTop + 0.5], [cx, eTop - 16], [px1 + 3, eTop + 0.5]], (x, y) => (y > eTop - 1 ? PEARL[3] : x < cx ? PEARL[5] : PEARL[4]));
    for (let t = 0; t <= 1; t += 0.015) { p.dot(px0 - 3 + (cx - px0 + 3) * t, eTop - 16 * t, GOLD[4]); p.dot(px1 + 3 - (px1 + 3 - cx) * t, eTop - 16 * t, GOLD[2]); }
    // aufgeschlagenes Buch im Giebelfeld
    const bx = cx, byy = eTop - 6;
    fpoly(p, [[bx - 6, byy - 1], [bx, byy], [bx + 6, byy - 1], [bx + 6, byy + 3], [bx, byy + 4], [bx - 6, byy + 3]], (x) => (x < bx ? GOLD[4] : GOLD[3]));
    p.fline(bx, byy, bx, byy + 4, GOLD[1], 0.4);
  }, { ax: cx, ay: bot, b: true, box: [-50, -30, 50, 1], extra: { lights: [{ dx: 0, dy: -118, radius: 80, color: CRY_LIGHT, intensity: 0.6 }] }, light: { dx: 0, dy: -16, radius: 60, color: LAMP_LIGHT, intensity: 0.55 } });
}

// ---------------------------------------------------------------- Glashaus
// Perlsteinsockel, Wände und Satteldach aus Glas im Goldrahmen, drinnen Blütenbäume und Farne (gedämpft)
function starGreenhouse() {
  const W = 104, H = 84, cx = 52, bot = H - 2, seed = 4700;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 48, 3.5);
    const x0 = 8, x1 = W - 8, wTop = bot - 30, rTop = wTop - 22;
    // Innenraum (durch das Glas): kühles Grün, Pflanzen
    p.scan(x0, rTop, x1, bot - 6, (x, y) => {
      const half = (x1 - x0) / 2 * Math.min(1, (y - rTop) / 22) + 0.01;
      if (y < wTop && Math.abs(x - cx) > half) return 0;
      return col32(y > bot - 12 ? '#1e3a3a' : '#2a5250');
    });
    canopy(p, [[x0 + 18, wTop + 2, 10], [x0 + 32, wTop - 4, 12], [cx + 10, wTop - 2, 11], [x1 - 16, wTop + 4, 9]], ['#1e3a3a', '#2a5250', '#3c7068', '#58907e', '#80b49a', '#a8d4b8'], seed, { lo: 1, hi: 4 });
    canopy(p, [[cx - 4, wTop + 8, 7], [x1 - 30, wTop + 10, 6]], LEAF, seed + 1, { lo: 1, hi: 4 });
    for (let i = 0; i < 18; i++) { const x = x0 + 4 + hash2(i, 1, seed) * (x1 - x0 - 8), y = wTop + 6 + hash2(i, 2, seed) * 14; p.dot(x, y, LEAF[5]); }
    // Glas: Scheibenraster, Spiegelung (diagonale Lichtstreifen), Rahmen Gold/Perl
    p.scan(x0, rTop, x1, bot - 6, (x, y) => {
      const half = (x1 - x0) / 2 * Math.min(1, (y - rTop) / 22) + 0.01;
      if (y < wTop && Math.abs(x - cx) > half) return 0;
      const fx = (x - x0) % 10, fy = y < wTop ? (y - rTop) % 6 : (y - wTop) % 8;
      if (fx < 0.6 || fy < 0.5) return y < wTop ? G[x < cx ? 4 : 2] : G[3];
      const streak = ((x + y * 0.8) % 18) < 2.5;
      if (streak) return col32(y < wTop ? '#e8fbff' : '#b8f2ff');
      return 0;
    });
    // Dachfirst und Traufe
    p.fline(x0, wTop, cx, rTop, GOLD[4], 0.8); p.fline(cx, rTop, x1, wTop, GOLD[2], 0.8);
    p.scan(x0 - 1, wTop - 1, x1 + 1, wTop + 1, (x, y) => (y < wTop ? G[4] : G[2]));
    p.oval(cx, rTop - 1.5, 1.6, 1.6, GOLD[4]); p.fline(cx, rTop - 6, cx, rTop - 2, GOLD[3], 0.4);
    // Sockel und Tür
    pearlWall(p, x0, x1, bot - 6, bot, seed, { side: 6, bh: 3 });
    p.scan(cx - 6, wTop + 6, cx + 6, bot - 1, (x, y) => (Math.abs(x - cx) < 0.4 ? G[2] : x < cx - 5 || x > cx + 5 || y < wTop + 7 ? G[3] : col32(y < wTop + 14 ? '#3c7068' : '#2a5250')));
    for (const lx of [cx - 10, cx + 10]) { p.scan(lx - 3, bot - 5, lx + 3, bot, (x, y) => (y < bot - 4.5 ? P[6] : x > lx + 2 ? P[2] : P[4])); canopy(p, [[lx, bot - 8, 3.5]], BUSH, seed + lx, { lo: 2, hi: 5 }); p.dot(lx - 1, bot - 9, LEAF[5]); }
  }, { ax: cx, ay: bot, b: true, box: [-46, -18, 46, 1] });
}

// ---------------------------------------------------------------- Uhrturm
// schlanker Perlsteinturm mit Ziffernblatt (Gold, Zeiger), offener Laterne und Grünspanhelm
function clockTower() {
  const W = 56, H = 178, cx = 28, bot = H - 2, seed = 4800;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 22, 3);
    const hw = 11, top = bot - 120;
    pearlWall(p, cx - hw, cx + hw, top, bot - 6, seed, { side: 5 });
    plinth(p, cx - hw - 3, cx + hw + 3, bot - 6, bot);
    for (const y of [top, bot - 44, bot - 86]) cornice(p, cx - hw - 1, cx + hw + 1, y);
    archDoor(p, g, cx, bot - 6, 9, 16);
    archWin(p, g, cx - 2.5, bot - 70, 5, 10, { box: false });
    // Ziffernblatt
    const cy = top + 16, r = 9;
    p.scan(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 1.5) return 0;
      if (d > r) return x < cx ? G[4] : G[2];
      const a = Math.atan2(y - cy, x - cx), tick = d > r - 2 && Math.abs(((a / (Math.PI * 2)) * 12 + 12) % 1 - 0.5) > 0.42;
      return tick ? G[1] : col32(d < r - 2 && x < cx && y < cy ? '#fffbe8' : '#f4ead0');
    });
    g.each(cx - r, cy - r, cx + r, cy + r, (x, y) => (Math.hypot(x - cx, y - cy) < r - 1 ? '#f4dca0' : null));
    p.fline(cx, cy, cx - 2, cy - 6, GOLD[0], 0.6); p.fline(cx, cy, cx + 5, cy + 1, GOLD[0], 0.5); p.dot(cx, cy, GOLD[3]);
    // offene Laterne mit Glocke, Galerie
    const ly = top - 22;
    p.scan(cx - hw + 1, ly, cx + hw - 1, top, (x, y) => (Math.abs(x - cx) > hw - 3.5 ? P[x < cx ? 6 : 3] : col32('#1a1430')));
    p.oval(cx, ly + 11, 3, 3.4, GOLD[3]); p.dot(cx - 1, ly + 9.5, GOLD[5]);
    p.scan(cx - hw - 3, top - 3, cx + hw + 3, top, (x, y) => (y < top - 2 ? G[4] : ((x - cx + 40) % 2.5) < 1 ? P[6] : P[3]));
    p.scan(cx - hw - 2, ly - 3, cx + hw + 2, ly, (x, y) => (y < ly - 2 ? G[4] : P[x > cx + hw ? 3 : 6]));
    spire(p, cx, ly - 3, ly - 40, hw + 2, VERD);
  }, { ax: cx, ay: bot, b: true, box: [-14, -14, 14, 1], light: { dx: 0, dy: -108, radius: 56, color: [255, 220, 160], intensity: 0.5 } });
}

// ---------------------------------------------------------------- Luftschiff am Anleger
// schwebt neben dem Steg (Anker = Stegspitze): Ballonhülle mit Goldbändern, Holzrumpf mit Reling, Bugspriet,
// Propeller am Heck, Taue zum Poller. v0 rosa Hülle, v1 schieferblau, v2 grünspan; flip = Bug nach links
function airship(v) {
  const W = 132, H = 112, ax = 30, ay = 70, seed = 4900 + v;
  const E = pal32([ROSE, SLATE, VERD][v]);
  return mk(W, H, (p, g) => {
    const ex = 86, ey = 34, erx = 40, ery = 20;
    // Hülle (Zigarrenform), Licht von links oben, Bänder
    p.scan(ex - erx, ey - ery, ex + erx, ey + ery, (x, y) => {
      const nx = (x - ex) / erx, ny = (y - ey) / ery, d = nx * nx * (nx < 0 ? 1 : 1.05) + ny * ny;
      if (d > 1) return 0;
      const l = -nx * 0.35 - ny * 0.8;
      let i = l > 0.45 ? 6 : l > 0.15 ? 5 : l > -0.2 ? 4 : l > -0.5 ? 3 : 2;
      if (Math.abs(((x - ex + 200) % 16) - 8) < 0.5 && d < 0.96) i -= 1;
      if (d > 0.9) i = Math.min(i, 2);
      return E[Math.max(0, i)];
    });
    for (const bx of [ex - 22, ex + 22]) p.scan(bx - 1.2, ey - ery, bx + 1.2, ey + ery, (x, y) => (((x - ex) / erx) ** 2 + ((y - ey) / ery) ** 2 > 0.98 ? 0 : y < ey - 8 ? G[4] : G[2]));
    // Leitwerk am Heck
    fpoly(p, [[ex + erx - 8, ey - 4], [ex + erx + 10, ey - 18], [ex + erx + 6, ey - 2]], (x, y) => (y < ey - 10 ? GOLD[4] : GOLD[2]));
    fpoly(p, [[ex + erx - 8, ey + 4], [ex + erx + 10, ey + 16], [ex + erx + 6, ey + 2]], GOLD[1]);
    // Taue zwischen Hülle und Rumpf
    const hy = ey + ery + 10;
    for (const tx of [ex - 26, ex - 10, ex + 8, ex + 24]) p.fline(tx, ey + ery - 3, tx + (tx < ex ? 4 : -4), hy, '#4a3624', 0.4);
    // Rumpf: Bootsform, Planken, Reling, Bullaugen
    const hx0 = ex - 34, hx1 = ex + 30;
    p.scan(hx0, hy - 2, hx1 + 4, hy + 14, (x, y) => {
      const k = (y - hy) / 14, inset = k > 0 ? k * k * 14 : 0;
      if (x < hx0 + inset || x > hx1 - inset * 0.6) return 0;
      if (y < hy) return ((x - hx0) % 4) < 1 ? Wd[5] : 0;
      if (y < hy + 1) return G[4];
      const pl = Math.floor((y - hy) / 3), lp = (y - hy) % 3;
      if (lp < 0.5) return Wd[1];
      return Wd[x > hx1 - 6 ? 2 : pl & 1 ? 3 : 4];
    });
    for (const bx of [hx0 + 14, hx0 + 26, hx0 + 38, hx0 + 50]) { p.oval(bx, hy + 5, 1.6, 1.6, GOLD[3]); p.oval(bx, hy + 5, 1, 1, LAMP[3]); g.oval(bx, hy + 5, 1, 1, LAMP[3]); }
    // Bugspriet und Galionsstern
    p.fline(hx0 + 2, hy + 1, hx0 - 12, hy - 4, WOOD[4], 1);
    p.oval(hx0 - 13, hy - 4.5, 1.8, 1.8, GOLD[4]); g.oval(hx0 - 13, hy - 4.5, 1.6, 1.6, GOLD[4]);
    // Propeller am Heck
    p.fline(hx1 + 2, hy + 4, hx1 + 8, hy + 4, WOOD[2], 0.8);
    p.fline(hx1 + 8, hy - 2, hx1 + 8, hy + 10, CANVAS[3], 1.2);
    // Laterne am Mast
    p.fline(ex - 2, hy, ex - 2, hy - 8, WOOD[3], 0.6);
    p.scan(ex - 3.5, hy - 12, ex - 0.5, hy - 8, (x, y) => (y < hy - 11.5 ? G[2] : col32(LAMP[x < ex - 2 ? 4 : 3])));
    g.oval(ex - 2, hy - 10, 1.8, 2.2, LAMP[4]);
    // Festmacher: Tau vom Bug zum Poller am Steg (Anker)
    const rng = createRng(seed);
    for (let t = 0; t <= 1; t += 0.02) p.dot(ax + (hx0 + 4 - ax) * t, ay - 3 + (hy + 6 - ay + 3) * t + Math.sin(t * Math.PI) * 5, '#8a6c48');
    p.scan(ax - 2, ay - 6, ax + 2, ay, (x, y) => (y < ay - 5.5 ? G[4] : x < ax ? Wd[5] : Wd[2]));
    void rng;
  }, { ax, ay, b: true, extra: { shadow: 0, sortOffset: 40 }, light: { dx: 54, dy: -38, radius: 70, color: LAMP_LIGHT, intensity: 0.5 } });
}

// ---------------------------------------------------------------- Brunnen für Viertelplätze
// runder Perlsteinbrunnen mit Sternsäule und Wasserstrahlen
function starFountain() {
  const W = 48, H = 52, cx = 24, bot = H - 3;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 22, 3);
    const by = bot - 6;
    p.scan(cx - 20, by - 7, cx + 20, bot, (x, y) => {
      const e = ((x - cx) / 20) ** 2 + ((y - by) / 7) ** 2;
      if (e > 1) {
        if (y > by && Math.abs(x - cx) < 19.5 && ((x - cx) / 20) ** 2 + ((y - by - 5) / 7) ** 2 <= 1) return P[x < cx - 8 ? 5 : x < cx + 8 ? 4 : 3];
        return 0;
      }
      if (e > 0.7) return P[y < by ? 6 : 5];
      return col32(Math.sin(x * 0.6 + y * 1.4) > 0.6 ? '#86c4e0' : y < by - 2 ? '#4a92b8' : '#2e6890');
    });
    p.scan(cx - 2.5, by - 22, cx + 2.5, by, (x) => P[x < cx - 1 ? 6 : x < cx + 1 ? 5 : 3]);
    p.oval(cx, by - 23, 3.5, 2, PEARL[5]);
    for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.04) { const x = cx + s * t * 11, y = by - 23 + (t * t * 22 - t * 4); p.dot(x, y, t > 0.8 ? '#ffffff' : '#b8f2ff'); }
    p.oval(cx, by - 27, 2.2, 2.2, CRY[4]); p.dot(cx - 0.6, by - 27.6, '#ffffff'); g.oval(cx, by - 27, 2.6, 2.6, CRY[3]);
  }, { ax: cx, ay: bot, b: true, box: [-19, -8, 19, 1], light: { dx: 0, dy: -30, radius: 46, color: CRY_LIGHT, intensity: 0.45 } });
}

export function createStarCityDecor2() {
  return {
    starTownhouses: [0, 1, 2, 3].map(townhouse),
    starShops: [0, 1, 2].map(starShop),
    starTemple: starTemple(),
    starLibrary: starLibrary(),
    starGreenhouse: starGreenhouse(),
    clockTower: clockTower(),
    airships: [0, 1, 2].map(airship),
    starFountain: starFountain(),
  };
}
