// Häuser der Welt Stufe 1–40 (Glutsenke, Wächterlager, Steppenwacht, Mirefeste, Frosthold) auf dem Niveau der
// Sternhafen-Altstadt: gleiche Bauweise im Feinraster (Licht oben links, harte Kanten, warme Fenster), aber je Gebiet
// eigene Baustoffe – Reet und Fachwerk im Dorf, Rundholz im Wald, Filz in der Steppe, Pfahlbauten in der Marsch,
// Langhäuser mit Schnee in den Zinnen. Alle Häuser sind begehbar (world/houses.js, world/townHouses.js); die Tür liegt
// unten auf der Kachel des Ankers plus Versatz (DOORS, in Kacheln).
// Dazu die Möbel der Innenräume (createFurniture): Sternhafen-Möbel plus Feuerstelle, Geweih, Fell, Kräuter, Netz.
import { hash2 } from '../core/math.js';
import { mk } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import { LAMP, footShade } from './decor_starcity.js';
import {
  PAL, fwHouse, rubble, door, lead, roofTex, roofEave, roofGable, chimney, beamH, beamV, lantern, setWood,
  table, bed, hearth, cupboard, barrels, stool, sacks, chest, plant, counter, kegs, anvil, forge, weaponRack, throne,
  bannerStand, bookshelf, desk, displayCase, armorStand, wallShield, wallShelf, wallPicture, sconce, wallTapestry, doorOffset,
} from './decor_altstadt.js';

const { R, OAK, RUB, SHING, IRON, MOSS, WOOL, Lm, INK } = PAL;
const cl = (i, n = 6) => (i < 0 ? 0 : i > n ? n : i);
const WALL = { sortOffset: -40, low: true };
function wallItem(W, draw, light = null) { return mk(W, 48, draw, { ax: Math.floor(W / 2), ay: 47, b: true, light, extra: WALL }); }
const HOUSE_LIGHT = { dx: 0, dy: -14, radius: 64, color: [255, 190, 120], intensity: 0.45 };

// ================================================================== Möbel
let FURN = null;
export function createFurniture() {
  if (FURN) return FURN;
  FURN = {
    fTable: table(), fBed: bed(), fHearth: hearth(), fCupboard: cupboard(), fBarrels: barrels(), fStool: stool(), fSacks: sacks(), fChest: chest(),
    fPlant: plant(), fCounter: counter(), fKegs: kegs(), fAnvil: anvil(), fForge: forge(), fRack: weaponRack(), fThrone: throne(),
    fBanner: bannerStand(), fBooks: bookshelf(), fDesk: desk(), fCase: displayCase(), fArmor: armorStand(),
    wShield: wallShield(), wShelf: [wallShelf(1), wallShelf(2)], wPicture: wallPicture(0), wSconce: sconce(), wTapestry: [wallTapestry(0), wallTapestry(1)],
    fFirepit: firepit(), wAntlers: antlers(), wPelt: pelt(), wHerbs: herbs(), wNet: net(),
  };
  return FURN;
}

// Feuerstelle mit Steinring (Jurte)
function firepit() {
  return mk(34, 30, (p, g) => {
    footShade(p, 17, 26, 15, 3);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, sx = 17 + Math.cos(a) * 12, sy = 21 + Math.sin(a) * 5;
      p.scan(sx - 3, sy - 2.5, sx + 3, sy + 2.5, (x, y) => (((x - sx) / 3) ** 2 + ((y - sy) / 2.5) ** 2 > 1 ? 0 : RUB.c[y < sy - 0.8 ? 6 : x < sx ? 5 : 3]));
    }
    p.scan(8, 18, 26, 25, (x, y) => (((x - 17) / 9) ** 2 + ((y - 21.5) / 3.5) ** 2 > 1 ? 0 : col32('#1a1210')));
    for (const [a, b] of [[10, 24], [24, 10]]) for (let t = 0; t <= 1; t += 0.05) { const x = a + (b - a) * t, y = 23 - t * 3; p.scan(x - 1, y - 1, x + 1, y + 1, () => col32('#4a2c1a')); }
    p.scan(11, 5, 23, 23, (x, y) => {
      const f = Math.abs(x - 17) * 1.2 + (23 - y) * 0.75 + hash2(Math.floor(x), Math.floor(y / 2), 5) * 3;
      return f > 13 ? 0 : col32(f < 4 ? '#fff0b0' : f < 8 ? '#f8b040' : '#d05818');
    });
    g.each(10, 5, 24, 23, (x, y) => (Math.abs(x - 17) * 1.2 + (23 - y) * 0.75 < 11 ? '#f8a040' : null));
  }, { ax: 17, ay: 26, b: true, box: [-13, -8, 13, 1], light: { dx: 0, dy: -8, radius: 96, color: [255, 150, 70], intensity: 0.95 } });
}
// Wandschmuck: Geweih, Fell, Kräuterbündel, Fischernetz
function antlers() {
  return wallItem(34, (p) => {
    p.scan(13, 16, 21, 24, (x, y) => (((x - 17) / 4) ** 2 + ((y - 20) / 4) ** 2 > 1 ? 0 : OAK.c[y < 18 ? 6 : 4]));
    const tine = (pts) => { for (let k = 0; k < pts.length - 1; k++) { const [a, b] = pts[k], [c, d] = pts[k + 1]; for (let t = 0; t <= 1; t += 0.08) { const x = a + (c - a) * t, y = b + (d - b) * t; p.scan(x - 0.9, y - 0.9, x + 0.9, y + 0.9, () => col32(y < 10 ? '#f0e4c8' : '#c8b490')); } } };
    for (const s of [-1, 1]) {
      tine([[17 + s * 3, 17], [17 + s * 9, 12], [17 + s * 13, 5]]);
      tine([[17 + s * 7, 14], [17 + s * 7, 7]]);
      tine([[17 + s * 11, 9], [17 + s * 15, 8]]);
    }
  });
}
function pelt() {
  return wallItem(30, (p) => {
    p.scan(3, 8, 27, 34, (x, y) => {
      const u = (x - 15) / 11, v = (y - 21) / 13, e = u * u + v * v + (Math.abs(u) > 0.75 && Math.abs(v) > 0.55 ? -0.3 : 0);
      if (e > 1) return 0;
      const n = hash2(Math.floor(x), Math.floor(y * 0.5), 9);
      return col32(e > 0.8 ? '#3a2416' : n < 0.3 ? '#6a4428' : n > 0.8 ? '#a07040' : '#7e5434');
    });
    for (const sx of [5, 25]) p.scan(sx - 1, 7, sx + 1, 9, () => IRON.c[4]);
  });
}
function herbs() {
  return wallItem(34, (p) => {
    p.scan(2, 9, 32, 11, (x, y) => OAK.c[y < 10 ? 6 : 3]);
    for (const [hx, c] of [[7, 0], [14, 1], [21, 2], [27, 0]]) {
      p.scan(hx - 0.5, 11, hx + 0.5, 14, () => col32('#8a6a40'));
      p.scan(hx - 3, 14, hx + 3, 26, (x, y) => (Math.abs(x - hx) > 3 - (y - 14) * 0.12 || hash2(Math.floor(x * 2), Math.floor(y), hx) < 0.2 ? 0 : col32([['#5a7a3a', '#3e5a2a'], ['#8a6a8a', '#5a4a6a'], ['#a08a3a', '#6a5a2a']][c][x < hx ? 0 : 1])));
    }
  });
}
function net() {
  return wallItem(36, (p) => {
    p.scan(2, 6, 34, 34, (x, y) => {
      const sag = Math.sin(((x - 2) / 32) * Math.PI) * 5;
      if (y < 6 + sag * 0.3) return 0;
      if (y > 30 + sag) return 0;
      const u = (x + y * 0.5) % 5, v = (x - y * 0.5 + 40) % 5;
      return u < 0.8 || v < 0.8 ? col32('#a89470') : 0;
    });
    for (const fx of [9, 18, 27]) p.scan(fx - 2.5, 26, fx + 2.5, 30, (x, y) => (((x - fx) / 2.5) ** 2 + ((y - 28) / 2) ** 2 > 1 ? 0 : col32(y < 27.5 ? '#e0d8c0' : '#c8a060')));
  });
}

// ================================================================== Glutsenke: Reet und Fachwerk
// Bauernhäuser mit tief gezogenem Reetdach (Walm), Halle der Dorfältesten (giebelständig, hoch), Schmiede mit Esse.
export const VILLAGE = {
  vHall: { w: 160, fl: 1, gf: 'stone', pl: 'ocker', shut: 'gruen', seed: 101, door: 'm', roof: 'thatch', hip: 22, roofH: 64, dormers: 3, oriel: true, sign: 'buch' },
  vSmithy: { w: 112, fl: 1, gf: 'forge', pl: 'creme', tb: 'ochsenblut', shut: 'braun', dormers: 1, sign: 'hammer', seed: 102, door: 'r', roof: 'slate', roofH: 50 },
  vHouse0: { w: 96, fl: 1, gf: 'timber', pl: 'creme', shut: 'gruen', roof: 'thatch', hip: 14, roofH: 50, dormers: 1, seed: 103, door: 'l' },
  vHouse1: { w: 80, fl: 1, gable: true, gf: 'stone', pl: 'ocker', shut: 'rot', roof: 'thatch', seed: 104, door: 'm' },
  vHouse2: { w: 112, fl: 1, gf: 'stone', pl: 'salbei', shut: 'braun', roof: 'thatch', hip: 16, roofH: 54, dormers: 2, seed: 105, door: 'r' },
  vHouse3: { w: 96, fl: 1, gable: true, gf: 'timber', pl: 'kalk', tb: 'ochsenblut', shut: 'blau', roof: 'thatch', seed: 106, door: 'l' },
};
export function createVillageHouses() {
  return Object.fromEntries(Object.entries(VILLAGE).map(([k, o]) => [k, fwHouse(o)]));
}

// Tür einer fwHouse-Variante in Kacheln relativ zur Ankerkachel
export function fwDoorTiles(o) { return Math.floor((8 + doorOffset(o)) / 16); }

// ================================================================== Gemeinsame Bauteile
// Über bereits Gemaltes malen (fn bekommt den alten Wert, 0 = leer; Rückgabe 0 = nichts ändern)
function over(p, x0, y0, x1, y1, fn) {
  const r = p.res, W = p.W, H = p.H, b = p.buf;
  const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  const F0 = Math.max(Math.floor(x0 * r), -fo), F1 = Math.min(Math.ceil(x1 * r), W - 1 - fo);
  const G0 = Math.max(Math.floor(y0 * r), -go), G1 = Math.min(Math.ceil(y1 * r), H - 1 - go);
  for (let G = G0; G <= G1; G++) {
    const y = (G + 0.5) / r, row = (G + go) * W + fo;
    for (let F = F0; F <= F1; F++) { const v = fn((F + 0.5) / r, y, b[row + F]); if (v) b[row + F] = v; }
  }
  p.dirty = true;
}
const SNOW = R(['#3a4660', '#5a6a88', '#8494b4', '#aebcd6', '#d0dcee', '#eaf2fc', '#ffffff']);
// Schneedecke auf einer Dachfläche (Traufdach): oben dick, zur Traufe dünner, Wehen am First, Eiszapfen unter der Traufe
function smooth1(x, sc, seed) { const a = Math.floor(x / sc), f = x / sc - a, t = f * f * (3 - 2 * f); return hash2(a, 0, seed) * (1 - t) + hash2(a + 1, 0, seed) * t; }
function snowCap(p, x0, x1, ridge, eave, seed, { icicles = true, cover = 0.62, hip = 0 } = {}) {
  over(p, x0 - 2, ridge - 3, x1 + 2, eave + 1, (x, y, old) => {
    if (!old) return 0;
    const v = (y - ridge) / (eave - ridge), edge = cover + smooth1(x, 9, seed) * 0.16 + smooth1(x, 3.5, seed + 1) * 0.07;
    if (v > edge) return 0;
    const dv = (edge - v) * (eave - ridge);                 // Abstand zur Schneekante in px
    if (dv < 1.2) return SNOW.c[2];
    if (dv < 2.6) return SNOW.c[4];
    if (y < ridge + 1.4) return SNOW.c[6];
    const band = (y - ridge + smooth1(x, 14, seed + 2) * 4) % 11;
    if (band < 1 && smooth1(x, 7, seed + 3) < 0.55) return SNOW.c[4];
    const k = (y - ridge) / (eave - ridge);
    if (hip && x < x0 + hip * (1 - k) + 1) return SNOW.c[6];
    if (hip && x > x1 - hip * (1 - k) - 1) return SNOW.c[4];
    return SNOW.c[5];
  });
  if (icicles) for (let x = x0 + 4; x < x1 - 4; x += 3 + Math.floor(hash2(x, 2, seed) * 5)) {
    const L = 2 + hash2(x, 3, seed) * 6;
    p.scan(x - 0.8, eave + 1, x + 0.8, eave + 1 + L, (xx, yy) => (Math.abs(xx - x) > 0.8 * (1 - (yy - eave - 1) / L) + 0.2 ? 0 : SNOW.c[xx < x ? 6 : 4]));
  }
}
// Liegende Rundhölzer (Blockwand), Köpfe an den Ecken stehen über
function logWall(p, x0, x1, y0, y1, P, seed, { ends = true, lh = 5 } = {}) {
  p.scan(x0, y0, x1, y1, (x, y) => {
    const r = Math.floor((y1 - y) / lh), lv = (y1 - y) - r * lh, t = lv / lh;
    if (lv < 0.6) return P.c[0];
    let i = t > 0.75 ? 6 : t > 0.5 ? 5 : t > 0.25 ? 4 : 3;
    if (t < 0.15) i = 2;
    if (hash2(Math.floor((x + r * 17) / 9), r, seed) < 0.18) i--;
    if (hash2(Math.floor(x * 2), Math.floor(y * 2), seed + 1) < 0.04) i--;
    return P.c[cl(i, P.c.length - 1)];
  });
  if (ends) for (const ex of [x0 - 2, x1 + 2]) for (let y = y1 - lh / 2; y > y0; y -= lh) {
    p.scan(ex - 3, y - lh / 2, ex + 3, y + lh / 2, (x, yy) => {
      const d = Math.hypot((x - ex) / 3, (yy - y) / (lh / 2));
      if (d > 1) return 0;
      if (d > 0.75) return P.c[1];
      return d < 0.35 ? col32('#a08060') : Math.abs(d - 0.55) < 0.08 ? P.c[3] : col32('#c8a478');
    });
  }
}
// Senkrechte Bretter mit Deckleisten
function boards(p, x0, x1, y0, y1, P, seed, bw = 5) {
  p.scan(x0, y0, x1, y1, (x, y) => {
    const b = Math.floor((x - x0) / bw), lu = (x - x0) - b * bw;
    if (lu < 0.7) return P.c[0];
    if (lu < 1.5) return P.c[5];
    let i = hash2(b, 0, seed) < 0.3 ? 3 : 4;
    if (hash2(b, Math.floor(y / 7), seed + 1) < 0.12) i--;
    if (y > y1 - 3) i--;
    return P.c[cl(i, P.c.length - 1)];
  });
}
// Holzstufen (Treppe von vorn), cx = Mitte, oben top, unten bot
function steps(p, cx, w, top, bot, P) {
  const n = Math.max(2, Math.round((bot - top) / 4)), sh = (bot - top) / n;
  for (let k = 0; k < n; k++) {
    const y = top + k * sh, ww = w / 2 + k * 0.6;
    p.scan(cx - ww, y, cx + ww, y + sh, (x, yy) => (yy < y + 1 ? P.c[6] : yy > y + sh - 0.8 ? P.c[0] : x < cx - ww + 1 ? P.c[5] : P.c[3]));
  }
}
function postV(p, x, y0, y1, P, t = 3) { p.scan(x, y0, x + t, y1, (xx) => P.c[xx < x + 0.7 ? 5 : xx > x + t - 0.7 ? 1 : 3]); }
// Kleines Fenster mit Läden in Holzrahmen
function cabinWin(p, g, x, y, w, h, F, shut = null, seed = 0) { lead(p, g, x, y, w, h, F, { shut, seed }); }
const shade = (p, cx, bot, rx) => p.scan(cx - rx - 2, bot - 2, cx + rx + 2, bot + 3, (x, y) => (((x - cx) / (rx + 2)) ** 2 + ((y - bot) / 3) ** 2 > 1 ? 0 : col32(y < bot + 1 ? '#120e18' : '#1a1622')));

// ================================================================== Wächterlager (Aschenwald): Baumhäuser
const BARK = R(['#120c0a', '#1e1410', '#2c1e16', '#3c2a1e', '#4e3828', '#624834', '#785a42']);
const LOGW = R(['#1a100a', '#2a1a10', '#3c2616', '#50341e', '#664428', '#7c5632', '#94683e']);
const LEAF = R(['#141010', '#241a14', '#3a2616', '#563418', '#74441c', '#925a26', '#ae7436']);   // Herbstlaub in Asche
const MOSSR = R(['#141a12', '#1e2a1a', '#2a3a22', '#3a4c2c', '#4c5e36', '#5e7040', '#72824c']);  // bemooste Schindeln
// Laubkrone aus vielen kleinen Büscheln (je Büschel Licht oben links, Schatten unten rechts)
function leafClump(p, cx, cy, rx, ry, seed) {
  const n = Math.round((rx * ry) / 60) + 3;
  const tufts = [];
  for (let k = 0; k < n; k++) {
    const a = hash2(k, 1, seed) * Math.PI * 2, rr = Math.sqrt(hash2(k, 2, seed));
    tufts.push([cx + Math.cos(a) * rx * rr * 0.8, cy + Math.sin(a) * ry * rr * 0.8, 6 + hash2(k, 3, seed) * 6]);
  }
  tufts.sort((A, B) => A[1] - B[1]);
  for (const [tx, ty, tr] of tufts) {
    p.scan(tx - tr - 1, ty - tr - 1, tx + tr + 1, ty + tr + 1, (x, y) => {
      const d = Math.hypot(x - tx, (y - ty) * 1.15) / tr - hash2(Math.floor(x / 2), Math.floor(y / 2), seed + 5) * 0.25;
      if (d > 0.9) return 0;
      const lit = (x - tx) / tr + (y - ty) / tr + (y - cy) / ry * 0.6;
      let i = lit < -0.7 ? 5 : lit < -0.1 ? 4 : lit < 0.5 ? 3 : 2;
      const h = hash2(Math.floor(x * 2), Math.floor(y * 2), seed + 1);
      if (h < 0.1) i--; else if (h > 0.93) i += 2;
      if (d > 0.78) i = Math.min(i, 1);
      return LEAF.c[cl(i)];
    });
  }
}
// v: 0 links Treppe, 1 rechts Treppe; Tür = Fuß der Treppe
export const TREE_HOUSES = { aTree0: { v: 0, seed: 201 }, aTree1: { v: 1, seed: 202 } };
export function treeHouse({ v = 0, seed = 1 } = {}) {
  const W = 150, H = 196, bot = H - 6, cx = 75, deck = bot - 62, cw = 76;
  const sx = v ? 1 : -1;                                  // Seite der Treppe
  return mk(W, H, (p, g) => {
    setWood(null, LOGW);
    shade(p, cx, bot, 34);
    // Krone hinten
    leafClump(p, cx - 34, 46, 34, 26, seed); leafClump(p, cx + 36, 40, 34, 28, seed + 1); leafClump(p, cx, 26, 42, 24, seed + 2);
    // Stamm (hinter der Plattform bis in die Krone)
    p.scan(cx - 14, 30, cx + 14, bot, (x, y) => {
      const flare = y > bot - 14 ? (y - (bot - 14)) * 0.9 : 0, hw = 11 + flare + Math.sin(y * 0.11) * 1.2;
      if (Math.abs(x - cx - 1) > hw) return 0;
      const u = (x - cx - 1) / hw, ridge = Math.floor((x - cx + 40) / 3.3);
      let i = u < -0.55 ? 5 : u < 0 ? 4 : u < 0.6 ? 3 : 2;
      if (hash2(ridge, Math.floor(y / 5), seed + 4) < 0.25) i--;
      if (Math.abs(u) > 0.9) i = 1;
      return BARK.c[cl(i)];
    });
    // Äste in die Krone
    for (const [a, b2, c, d] of [[cx - 6, 64, cx - 46, 40], [cx + 6, 58, cx + 50, 36], [cx, 50, cx - 8, 22]]) {
      for (let t = 0; t <= 1; t += 0.02) { const x = a + (c - a) * t, y = b2 + (d - b2) * t, w = 4.5 - t * 3; p.scan(x - w, y - w * 0.7, x + w, y + w * 0.7, (xx, yy) => BARK.c[yy < y ? 4 : 2]); }
    }
    // Streben unter der Plattform
    for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.02) { const x = cx + s * (12 + t * 30), y = deck + 34 - t * 28; p.scan(x - 1.6, y - 1.6, x + 1.6, y + 1.6, (xx, yy) => LOGW.c[yy < y ? 5 : 2]); }
    postV(p, cx - 44, deck + 4, bot - 1, LOGW, 4); postV(p, cx + 40, deck + 4, bot - 1, LOGW, 4);
    // Plattform (Bohlen von vorn, Balkenköpfe)
    p.scan(cx - 52, deck - 2, cx + 52, deck + 6, (x, y) => (y < deck - 1 ? LOGW.c[6] : y < deck + 0.5 ? LOGW.c[5] : y > deck + 5 ? INK : (Math.floor(x) % 8 === 0 ? LOGW.c[2] : LOGW.c[4])));
    for (let x = cx - 50; x < cx + 50; x += 12) p.scan(x, deck + 5, x + 4, deck + 8, (xx, yy) => LOGW.c[yy < deck + 6 ? 5 : 2]);
    // Hütte: Blockwand, Fenster, Tür zum Steg
    const x0 = cx - cw / 2, x1 = cx + cw / 2, wt = deck - 34;
    logWall(p, x0, x1, wt, deck - 1, LOGW, seed + 5);
    const dX = cx + sx * 20;
    cabinWin(p, g, cx - sx * 18 - 4, wt + 9, 8, 10, LOGW, MOSSR, seed + 6);
    cabinWin(p, g, cx - 4, wt + 9, 8, 10, LOGW, null, seed + 7);
    door(p, g, dX, deck - 1, 12, 22, LOGW, { lamp: false, step: false });
    lantern(p, g, dX - sx * 10, wt + 6);
    // Giebel nach vorn: Bretterschild, bemooste Schindeln dahinter
    const apex = wt - 40, inG = (x, y) => y <= wt && y >= apex + (Math.abs(x - cx) / (cw / 2 + 2)) * (wt - apex);
    chimney(p, cx - sx * 26, wt - 30, 16, RUB);
    const keep = p.scan.bind(p);
    p.scan = (q0, q1, q2, q3, fn) => keep(q0, q1, q2, q3, (x, y) => (inG(x, y) ? fn(x, y) : 0));
    boards(p, x0 - 2, x1 + 2, apex, wt, LOGW, seed + 11, 6);
    p.scan = keep;
    lead(p, g, cx - 3, wt - 22, 6, 8, LOGW, { seed: seed + 12 });
    beamH(p, x0 - 3, x1 + 3, wt - 2, 3);
    roofGable(p, x0 - 4, x1 + 4, apex, wt, 16, MOSSR, 'shingle', seed + 8, 6);
    // Firstzier: gekreuzte Windbretter
    for (const s2 of [-1, 1]) for (let t = 0; t <= 1; t += 0.05) { const x = cx + s2 * t * 7, y = apex - 1 - t * 6; p.scan(x - 1, y - 1, x + 1, y + 1, () => LOGW.c[s2 < 0 ? 5 : 3]); }
    // Geländer am Steg
    for (const s of [-1, 1]) {
      const rx0 = s < 0 ? cx - 52 : x1 + 2, rx1 = s < 0 ? x0 - 2 : cx + 52;
      p.scan(rx0, deck - 12, rx1, deck - 10, (x, y) => LOGW.c[y < deck - 11 ? 6 : 3]);
      for (let x = rx0; x <= rx1 - 2; x += 7) postV(p, x, deck - 12, deck - 1, LOGW, 2);
    }
    // Treppe vom Steg hinunter (seitlich), endet vor dem Stamm
    const tx0 = cx + sx * 52, tx1 = cx + sx * 26;
    for (let k = 0; k < 13; k++) {
      const t = k / 12, x = tx0 + (tx1 - tx0) * t - sx * 4, y = deck + 4 + t * (bot - deck - 8);
      p.scan(x - 9, y - 1, x + 9, y + 3, (xx, yy) => (yy < y ? LOGW.c[6] : yy > y + 2.2 ? INK : LOGW.c[4]));
    }
    for (const off of [-9, 9]) for (let t = 0; t <= 1; t += 0.01) { const x = tx0 + (tx1 - tx0) * t - sx * 4 + off, y = deck + 2 + t * (bot - deck - 6); p.scan(x - 1.2, y - 1.4, x + 1.2, y + 1.4, () => LOGW.c[off * sx > 0 ? 2 : 5]); }
    // vordere Krone (Blätter überlappen die Dachkanten etwas)
    leafClump(p, cx - 62, 70, 14, 12, seed + 9); leafClump(p, cx + 64, 64, 14, 12, seed + 10);
  }, { ax: cx, ay: bot, b: true, box: [-48, -20, 48, 1], light: { dx: sx * 20, dy: -72, radius: 70, color: [255, 180, 110], intensity: 0.55 } });
}
// Tür in Kacheln relativ zum Anker: Fuß der Treppe
export function treeDoor(o) { return o.v ? 2 : -2; }
export function createAshwoodHouses() {
  return Object.fromEntries(Object.entries(TREE_HOUSES).map(([k, o]) => [k, treeHouse(o)]));
}

// ================================================================== Steppenwacht und Nomadenlager: Jurten
const FELTP = R(['#2a2018', '#4a3a2c', '#6a5640', '#8a7456', '#a8906c', '#c2aa84', '#d8c29c']);
const FELTG = R(['#221c18', '#3a3028', '#544638', '#6e5c48', '#887258', '#a08a6c', '#b8a282']);     // verrußt, älter
const PAINT = { rot: ['#5a1a16', '#8a2a20', '#b84030'], blau: ['#1a2440', '#2a3a66', '#4a62a0'], ocker: ['#5a3a12', '#9a6a24', '#d0a040'] };
const DOORW = R(['#1a0c08', '#3a1a10', '#5e2a16', '#8a3e1c', '#b45a26', '#d47a34', '#e8a048']);
// o: { r Halbbreite, wall Wandhöhe, dome Dachhöhe, band Farbe, felt 'hell'|'alt', seed }
export const YURTS = {
  sYurt: { r: 52, wall: 30, dome: 34, band: 'rot', seed: 301 },
  sYurtB: { r: 46, wall: 28, dome: 30, band: 'blau', seed: 302, felt: 'alt' },
  sYurtL: { r: 64, wall: 34, dome: 40, band: 'ocker', seed: 303, banner: true },
  sYurtS: { r: 34, wall: 22, dome: 24, band: 'rot', seed: 304, felt: 'alt' },
};
export function yurt(o) {
  const r = o.r, W = r * 2 + 24, H = o.wall + o.dome + 40, bot = H - 6, cx = W / 2, P = o.felt === 'alt' ? FELTG : FELTP, B = PAINT[o.band].map(col32), seed = o.seed;
  const ry = r * 0.28, wt = bot - o.wall, apex = wt - o.dome;   // ry = Tiefe der Ellipse (Draufsicht 3/4)
  return mk(W, H, (p, g) => {
    shade(p, cx, bot, r + 2);
    // Dach: Kegel über der Wandellipse, Filzbahnen mit Nähten, Seile
    p.scan(cx - r - 4, apex - 2, cx + r + 4, wt + ry + 1, (x, y) => {
      const dx = (x - cx) / (r + 3);
      if (Math.abs(dx) > 1) return 0;
      const rim = wt + Math.sqrt(1 - dx * dx) * ry * 0.9, top = apex + Math.abs(dx) * Math.abs(dx) * 0 + (rim - apex) * Math.abs(dx) ** 1.6 * 0.85;
      if (y > rim || y < top) return 0;
      const t = (y - top) / (rim - top), seam = Math.abs(((Math.atan2(y - apex, x - cx) * 9) % 1 + 1) % 1 - 0.5) < 0.04;
      if (y > rim - 1.4) return P.c[1];
      let i = dx < -0.35 ? 5 : dx < 0.2 ? 4 : dx < 0.6 ? 3 : 2;
      if (t < 0.2) i++;
      if (seam) i -= 2;
      if (hash2(Math.floor(x * 1.5), Math.floor(y * 1.5), seed) < 0.05) i--;
      return P.c[cl(i)];
    });
    // Dachkranz (Tono) mit Rauch
    p.scan(cx - 9, apex - 4, cx + 9, apex + 3, (x, y) => (((x - cx) / 9) ** 2 + ((y - apex) / 3.5) ** 2 > 1 ? 0 : y < apex - 1 ? DOORW.c[5] : DOORW.c[2]));
    p.scan(cx - 6, apex - 3, cx + 6, apex + 0.5, (x, y) => (((x - cx) / 6) ** 2 + ((y - apex + 1.2) / 2) ** 2 > 1 ? 0 : col32('#120c08')));
    // Seile über dem Dach (Bauchgurte)
    for (const k of [0.45, 0.75]) {
      p.scan(cx - r - 3, apex, cx + r + 3, wt + ry, (x, y) => {
        const dx = (x - cx) / (r + 3); if (Math.abs(dx) > 0.98) return 0;
        const rim = wt + Math.sqrt(1 - dx * dx) * ry * 0.9, top = apex + (rim - apex) * Math.abs(dx) ** 1.6 * 0.85, yy = top + (rim - top) * k;
        return Math.abs(y - yy) < 0.7 ? col32(dx < 0 ? '#c8b088' : '#7a6448') : 0;
      });
    }
    // Wand: Zylinder, Filz mit Gitterandeutung, gemaltes Band, Saum
    p.scan(cx - r, wt - 2, cx + r, bot + ry * 0.5, (x, y) => {
      const dx = (x - cx) / r;
      if (Math.abs(dx) > 1) return 0;
      const cy = Math.sqrt(1 - dx * dx) * ry, top = wt + cy * 0.9, base = bot - ry * 0.4 + cy * 0.4;
      if (y < top || y > base) return 0;
      const h = y - top, hh = base - top;
      let i = dx < -0.5 ? 5 : dx < 0.1 ? 4 : dx < 0.6 ? 3 : 2;
      if (Math.abs(dx) > 0.93) i = 1;
      if (h < 7 && h > 2) { // Band
        const u = Math.floor((Math.asin(Math.max(-1, Math.min(1, dx))) + 2) * r / 6);
        if (h < 3 || h > 6) return col32(dx < 0.4 ? '#d8c088' : '#8a7448');
        return ((u + Math.floor(h)) & 1) ? B[dx < 0.4 ? 2 : 1] : B[0];
      }
      if (h > hh - 4) i -= 2;                                  // Saum/Erde
      if (Math.abs(((dx * 14) % 1)) < 0.05) i--;               // Bahnen
      if (hash2(Math.floor(x), Math.floor(y / 2), seed + 1) < 0.04) i--;
      return P.c[cl(i)];
    });
    // Tür: bemalter Holzrahmen, Filzvorhang halb gerollt
    const dw = Math.max(12, r * 0.28), dTop = bot - 26, dBot = bot - 1;
    p.scan(cx - dw / 2 - 3, dTop - 3, cx + dw / 2 + 3, dBot, (x, y) => {
      if (Math.abs(x - cx) > dw / 2 + 3) return 0;
      if (Math.abs(x - cx) > dw / 2 || y < dTop) return DOORW.c[(x < cx ? 5 : 3) - (y < dTop - 2 ? 1 : 0)];
      const u = Math.floor((x - cx + dw) / 3);
      if (y < dTop + 5) return u & 1 ? B[2] : DOORW.c[2];        // gerollter Filz
      const half = Math.abs(x - cx) < 0.6;
      if (half) return DOORW.c[1];
      if (Math.abs(y - (dTop + 13)) < 2 && Math.abs(Math.abs(x - cx) - dw / 4) < 2) return DOORW.c[6];  // Ornament
      return DOORW.c[(Math.floor(y / 4) & 1) ? 4 : 3];
    });
    g.each(cx - 2, dTop + 6, cx + 2, dBot - 2, (x, y) => (Math.abs(x - cx) < 0.7 ? LAMP[1] : null));
    p.scan(cx - dw / 2 - 5, dBot - 1, cx + dw / 2 + 5, dBot + 1.5, (x, y) => (y < dBot ? RUB.c[6] : RUB.c[3]));
    if (o.banner) {
      const bx = cx + r * 0.62, top = apex + 4;
      postV(p, bx, top, bot - 2, DOORW, 2);
      p.scan(bx + 2, top + 2, bx + 14, top + 20, (x, y) => (y > top + 16 && Math.floor(x) % 3 === 0 ? 0 : x > bx + 13 ? B[0] : B[x < bx + 6 ? 2 : 1]));
      p.scan(bx - 2, top - 3, bx + 4, top + 1, () => col32('#e0d0a0'));
    }
  }, { ax: Math.round(cx), ay: bot, b: true, box: [-r + 4, -Math.round(ry * 1.4) - 6, r - 4, 1], light: { dx: 0, dy: -12, radius: 60, color: [255, 180, 110], intensity: 0.45 } });
}
export function createSteppeHouses() { return Object.fromEntries(Object.entries(YURTS).map(([k, o]) => [k, yurt(o)])); }

// ================================================================== Mirefeste (Faulmarsch): Pfahlhäuser
const PLANK = R(['#10120e', '#1a1c16', '#262820', '#34342a', '#444234', '#56523e', '#6a644a']);   // nasses, graues Holz
const REED = R(['#141810', '#1e2416', '#2a321c', '#384224', '#48522c', '#5a6236', '#6c7242']);     // Schilfdach, bemoost
const STILT = R(['#0c0e0c', '#161a16', '#20261e', '#2c3228', '#3a4032', '#4a503e', '#5c6248']);
// o: { w Wandbreite, hh Wandhöhe, legs Stelzenhöhe, roof 'gable'|'hip', seed, door 'l'|'m'|'r' }
export const STILTS = {
  mStilt0: { w: 80, hh: 34, legs: 26, roof: 'gable', seed: 401, door: 'm' },
  mStilt1: { w: 96, hh: 32, legs: 24, roof: 'hip', seed: 402, door: 'l' },
  mStilt2: { w: 72, hh: 30, legs: 28, roof: 'gable', seed: 403, door: 'r', net: true },
  mHall: { w: 128, hh: 38, legs: 24, roof: 'hip', seed: 404, door: 'm', banner: true },
};
const stiltDoorX = (o) => (o.door === 'l' ? -o.w / 2 + 16 : o.door === 'r' ? o.w / 2 - 16 : 0);
export function stiltHouse(o) {
  const W = o.w + 48, roofH = o.roof === 'gable' ? Math.round(o.w * 0.55) : 40, H = o.legs + o.hh + roofH + 26, bot = H - 4, cx = Math.round(W / 2);
  const x0 = cx - o.w / 2, x1 = cx + o.w / 2, deck = bot - o.legs, wt = deck - o.hh, seed = o.seed, dX = cx + stiltDoorX(o);
  return mk(W, H, (p, g) => {
    setWood(null, PLANK);
    // Stelzen (hinten dunkler) und Querstreben
    for (let x = x0 + 2; x <= x1 - 4; x += (o.w - 6) / 3) {
      postV(p, x, deck, bot - 1, STILT, 4);
      p.scan(x - 1, bot - 4, x + 5, bot, (xx, y) => (y > bot - 1.2 ? STILT.c[0] : MOSS.c[(Math.floor(xx) & 1) + 1]));   // Algenring
    }
    for (let t = 0; t <= 1; t += 0.01) { const x = x0 + 4 + t * (o.w - 8), y = deck + 6 + Math.abs(t - 0.5) * 2 * (o.legs - 12); p.scan(x - 1, y - 1, x + 1, y + 1, () => STILT.c[3]); }
    // Plattform mit Rand
    p.scan(x0 - 8, deck - 2, x1 + 8, deck + 5, (x, y) => (y < deck - 1 ? PLANK.c[6] : y > deck + 4 ? INK : Math.floor(x) % 7 === 0 ? PLANK.c[1] : PLANK.c[4]));
    // Wände: senkrechte Bretter, Schwelle und Rähm
    boards(p, x0, x1, wt, deck - 1, PLANK, seed, 5);
    p.scan(x1, wt, x1 + 4, deck - 1, (x) => PLANK.c[x < x1 + 1 ? 2 : 1]);
    beamH(p, x0 - 1, x1 + 1, wt, 3); beamH(p, x0 - 1, x1 + 1, deck - 4, 3);
    // Fenster mit Läden (Moosgrün)
    for (let wx = x0 + 10; wx < x1 - 14; wx += 26) if (Math.abs(wx + 4 - dX) > 16) lead(p, g, wx, wt + 8, 8, 10, PLANK, { shut: MOSSR, seed: seed + wx, lit: hash2(wx, seed, 3) < 0.8 });
    door(p, g, dX, deck - 1, 13, 23, PLANK, { lamp: true, step: false });
    // Stufen vor der Tür hinunter
    steps(p, dX, 14, deck + 1, bot, PLANK);
    // Dach: Schilf, tief heruntergezogen
    if (o.roof === 'gable') {
      const apex = wt - roofH + 4, inG = (x, y) => y <= wt && y >= apex + (Math.abs(x - cx) / (o.w / 2 + 2)) * (wt - apex);
      const keep = p.scan.bind(p);
      p.scan = (q0, q1, q2, q3, fn) => keep(q0, q1, q2, q3, (x, y) => (inG(x, y) ? fn(x, y) : 0));
      boards(p, x0 - 2, x1 + 2, apex, wt, PLANK, seed + 5, 6);
      p.scan = keep;
      lead(p, g, cx - 3, wt - roofH * 0.45, 6, 8, PLANK, { seed: seed + 6 });
      roofGable(p, x0 - 6, x1 + 6, apex, wt + 2, 16, REED, 'reet', seed + 7, 7);
    } else {
      roofEave(p, x0 - 10, x1 + 10, wt - roofH, wt + 3, REED, 'reet', seed + 7, { hip: 20 });
    }
    // Moos in Fetzen auf dem Dach
    over(p, x0 - 12, wt - roofH - 2, x1 + 12, wt + 3, (x, y, old) => (old && hash2(Math.floor(x / 4), Math.floor(y / 3), seed + 8) < 0.12 ? MOSS.c[hash2(Math.floor(x), Math.floor(y), 9) < 0.5 ? 2 : 3] : 0));
    if (o.net) for (let x = x1 + 2; x < x1 + 18; x += 0.5) { const y = deck - 26 + Math.sin(((x - x1) / 16) * Math.PI) * 6; p.scan(x - 0.4, y, x + 0.4, deck - 4, (xx, yy) => ((Math.floor(yy) + Math.floor(xx * 2)) % 4 === 0 ? col32('#8a8466') : 0)); }
    if (o.banner) { const bx = x0 + 6; postV(p, bx, wt - 30, deck - 1, STILT, 2); p.scan(bx + 2, wt - 28, bx + 13, wt - 8, (x, y) => (y > wt - 11 && Math.floor(x) % 3 === 0 ? 0 : col32(x < bx + 7 ? '#4a6a3a' : '#34502a'))); }
    lantern(p, g, x0 - 4, deck - 26);
  }, { ax: cx, ay: bot, b: true, box: [-o.w / 2 - 6, -o.legs - 6, o.w / 2 + 6, 1], light: { dx: stiltDoorX(o), dy: -o.legs - 12, radius: 64, color: [220, 200, 120], intensity: 0.5 } });
}
export function stiltDoorTiles(o) { return Math.round(stiltDoorX(o) / 16); }
export function createMarshHouses() { return Object.fromEntries(Object.entries(STILTS).map(([k, o]) => [k, stiltHouse(o)])); }

// ================================================================== Frosthold (Frostzinnen): Langhäuser mit Schnee
const TAR = R(['#0c0a0c', '#16121a', '#201a22', '#2c242c', '#3a3038', '#4a3e44', '#5c4e52']);     // geteertes Holz
const FROSTW = R(['#141418', '#1e1e26', '#2a2a34', '#383844', '#484856', '#5a5a6a', '#6e6e80']);  // Schindeln kalt
const TURF = R(['#141a12', '#1e2618', '#2a3420', '#384428', '#465232', '#56603c', '#666e48']);
// Langhaus: Traufseite nach vorn, Steinsockel, Stabwand, geschnitztes Tor in der Mitte, Drachenköpfe am First
export const FROST = {
  fLong: { kind: 'long', w: 176, seed: 501 },
  fLongS: { kind: 'long', w: 144, seed: 502 },
  fLodge: { kind: 'lodge', w: 96, seed: 503 },
  fSod: { kind: 'sod', w: 80, seed: 504 },
  fFish: { kind: 'fish', w: 64, seed: 505 },
};
function dragonHead(p, x, y, s) {
  // geschwungener Hals aus dem Firstende, Kopf mit Maul nach außen
  for (let t = 0; t <= 1; t += 0.02) {
    const xx = x + s * (t * 10), yy = y - Math.sin(t * Math.PI * 0.9) * 10 - t * 2, w = 2.2 - t * 0.6;
    p.scan(xx - w, yy - w, xx + w, yy + w, (a, b) => TAR.c[b < yy ? 5 : 3]);
  }
  const hx = x + s * 11, hy = y - 13;
  p.scan(hx - 4, hy - 3, hx + 4, hy + 3, (a, b) => (((a - hx) / 4) ** 2 + ((b - hy) / 2.6) ** 2 > 1 ? 0 : TAR.c[b < hy ? 5 : 3]));
  p.scan(hx + s * 2, hy - 1, hx + s * 6, hy + 2, (a, b) => (Math.abs(b - hy - 0.5) < 0.5 ? INK : TAR.c[4]));
  p.scan(hx - 0.8, hy - 1.6, hx + 0.8, hy - 0.4, () => col32('#d84020'));
}
export function frostHouse(o) {
  const seed = o.seed;
  if (o.kind === 'long') {
    const wallW = o.w, W = wallW + 60, wh = 30, roofH = 54, H = wh + roofH + 46, bot = H - 6, cx = Math.round(W / 2), x0 = cx - wallW / 2, x1 = cx + wallW / 2, wt = bot - wh;
    return mk(W, H, (p, g) => {
      setWood(null, TAR);
      shade(p, cx, bot, wallW / 2 + 4);
      rubble(p, x0 - 2, x1 + 2, bot - 8, bot, RUB, seed);
      boards(p, x0, x1, wt, bot - 8, TAR, seed + 1, 6);
      // Ständer mit Schnitzwerk
      for (let x = x0; x <= x1 - 3; x += (wallW - 3) / 6) { postV(p, x, wt, bot - 8, TAR, 3); p.scan(x - 1, wt + 2, x + 4, wt + 6, (xx, y) => TAR.c[(Math.floor(xx * 2 + y) & 1) ? 5 : 3]); }
      for (let wx = x0 + 14; wx < x1 - 16; wx += 30) if (Math.abs(wx + 3 - cx) > 22) lead(p, g, wx, wt + 7, 7, 8, TAR, { shut: R(['#1a0c0c', '#2e1414', '#4a1e1a', '#6a2a22']), seed: seed + wx });
      // Tor mit Vordach
      door(p, g, cx, bot - 1, 18, 24, TAR, { lamp: false, step: true });
      for (const s of [-1, 1]) lantern(p, g, cx + s * 16 - (s < 0 ? 2 : 0), wt + 4);
      p.scan(cx - 16, bot - 30, cx + 16, bot - 26, (x, y) => (y < bot - 29 ? SNOW.c[6] : TAR.c[y < bot - 28 ? 5 : 2]));
      // Dach: Schindeln, Walm an den Enden, Schnee darauf
      const ridge = wt - roofH;
      roofEave(p, x0 - 14, x1 + 14, ridge, wt + 3, FROSTW, 'shingle', seed + 2, { hip: 26 });
      snowCap(p, x0 - 14, x1 + 14, ridge, wt + 3, seed + 3, { cover: 0.7, hip: 26 });
      // Rauchloch und Drachenköpfe an den Firstenden
      p.scan(cx - 7, ridge - 4, cx + 7, ridge + 2, (x, y) => (y < ridge - 2 ? TAR.c[5] : TAR.c[2]));
      dragonHead(p, x0 + 12, ridge + 1, -1); dragonHead(p, x1 - 12, ridge + 1, 1);
    }, { ax: cx, ay: bot, b: true, box: [-wallW / 2 - 4, -26, wallW / 2 + 4, 1], light: { dx: 0, dy: -12, radius: 70, color: [255, 180, 110], intensity: 0.55 } });
  }
  if (o.kind === 'lodge') {
    const wallW = o.w, W = wallW + 44, wh = 34, roofH = Math.round(wallW * 0.5), H = wh + roofH + 34, bot = H - 6, cx = Math.round(W / 2), x0 = cx - wallW / 2, x1 = cx + wallW / 2, wt = bot - wh;
    return mk(W, H, (p, g) => {
      setWood(null, LOGW);
      shade(p, cx, bot, wallW / 2 + 4);
      rubble(p, x0 - 2, x1 + 2, bot - 5, bot, RUB, seed);
      logWall(p, x0, x1, wt, bot - 5, LOGW, seed + 1);
      lead(p, g, x0 + 10, wt + 9, 8, 10, LOGW, { shut: R(['#1a100c', '#2a1a12', '#3c261a', '#523422']), seed: seed + 2 });
      door(p, g, cx + 18, bot - 1, 14, 24, LOGW, { lamp: true });
      // Giebel mit Brettern, Geweih über der Tür
      const apex = wt - roofH + 6, inG = (x, y) => y <= wt && y >= apex + (Math.abs(x - cx) / (wallW / 2 + 2)) * (wt - apex);
      const keep = p.scan.bind(p);
      p.scan = (q0, q1, q2, q3, fn) => keep(q0, q1, q2, q3, (x, y) => (inG(x, y) ? fn(x, y) : 0));
      boards(p, x0 - 2, x1 + 2, apex, wt, LOGW, seed + 3, 6);
      p.scan = keep;
      lead(p, g, cx - 3, wt - roofH * 0.42, 6, 8, LOGW, { seed: seed + 4 });
      roofGable(p, x0 - 6, x1 + 6, apex, wt + 2, 16, FROSTW, 'shingle', seed + 5, 7);
      over(p, x0 - 20, apex - 18, x1 + 20, wt + 4, (x, y, old) => {
        if (!old) return 0;
        const dx = Math.abs(x - cx), edgeY = apex + (dx / (wallW / 2 + 13)) * (wt + 2 - apex);
        if (y > edgeY - 0.5) return 0;                                 // Giebelschild und Windbrett bleiben frei
        const dd = edgeY - y;
        return SNOW.c[dd < 1.5 ? 3 : dd < 3 ? 4 : x < cx ? 6 : 5];
      });
      p.scan(x0 - 8, wt + 1, x1 + 8, wt + 4, (x, y) => (hash2(Math.floor(x / 3), 0, seed + 7) < 0.6 || y < wt + 2 ? SNOW.c[6] : 0));
      // Geweih über der Tür, Fellrahmen daneben
      const ax = cx + 18, ay = bot - 30;
      for (const s of [-1, 1]) for (const [a, b2, c, d] of [[0, 0, 7, -5], [4, -3, 5, -8], [7, -5, 10, -6]]) for (let t = 0; t <= 1; t += 0.1) { const x = ax + s * (a + (c - a) * t), y = ay + b2 + (d - b2) * t; p.scan(x - 0.8, y - 0.8, x + 0.8, y + 0.8, () => col32('#e8dcc0')); }
      p.scan(ax - 2, ay - 2, ax + 2, ay + 2, () => LOGW.c[5]);
      postV(p, x1 + 6, bot - 22, bot - 1, LOGW, 2); postV(p, x1 + 18, bot - 22, bot - 1, LOGW, 2);
      p.scan(x1 + 8, bot - 20, x1 + 18, bot - 6, (x, y) => (Math.hypot((x - x1 - 13) / 5, (y - bot + 13) / 7) > 1 ? 0 : col32(hash2(Math.floor(x), Math.floor(y / 2), 4) < 0.3 ? '#7a5434' : '#9a7048')));
    }, { ax: cx, ay: bot, b: true, box: [-wallW / 2 - 4, -26, wallW / 2 + 4, 1], light: { dx: 18, dy: -12, radius: 64, color: [255, 180, 110], intensity: 0.5 } });
  }
  if (o.kind === 'sod') {
    const wallW = o.w, W = wallW + 36, wh = 22, H = wh + 54, bot = H - 6, cx = Math.round(W / 2), x0 = cx - wallW / 2, x1 = cx + wallW / 2, wt = bot - wh;
    return mk(W, H, (p, g) => {
      setWood(null, TAR);
      shade(p, cx, bot, wallW / 2 + 4);
      rubble(p, x0, x1, wt, bot, RUB, seed, 1.15);
      // Rasendach als runder Buckel, Schnee obenauf
      p.scan(x0 - 8, wt - 32, x1 + 8, wt + 4, (x, y) => {
        const dx = (x - cx) / (wallW / 2 + 8), top = wt - 30 * Math.sqrt(Math.max(0, 1 - dx * dx * dx * dx));
        if (Math.abs(dx) > 1 || y < top || y > wt + 3) return 0;
        const v = (y - top) / (wt + 3 - top), n = hash2(Math.floor(x / 2), Math.floor(y / 2), seed + 1);
        const sv = 0.42 + smooth1(x, 7, seed) * 0.2;
        if (v < sv) return SNOW.c[v > sv - 0.06 ? 3 : v > sv - 0.12 ? 4 : dx < 0 ? 6 : 5];
        if (y > wt + 1) return TURF.c[0];
        let i = dx < -0.4 ? 5 : dx < 0.3 ? 4 : 3;
        if (n < 0.2) i--;
        if (Math.floor(y) % 4 === 0 && n < 0.5) i -= 2;
        return TURF.c[cl(i)];
      });
      lead(p, g, x0 + 9, wt + 6, 7, 7, RUB, { stone: true, seed: seed + 2 });
      door(p, g, cx + 10, bot - 1, 12, 18, RUB, { lamp: false });
      p.scan(cx - 22, wt - 40, cx - 14, wt - 24, (x, y) => (y < wt - 38 ? RUB.c[6] : RUB.c[(x < cx - 18 ? 5 : 3)]));
      lantern(p, g, cx + 20, wt - 2);
    }, { ax: cx, ay: bot, b: true, box: [-wallW / 2 - 2, -22, wallW / 2 + 2, 1], light: { dx: 10, dy: -10, radius: 56, color: [255, 180, 110], intensity: 0.45 } });
  }
  // Fischerhütte: Bretterbude mit Pultdach, Schnee, Netz und Fischstange
  const wallW = o.w, W = wallW + 40, wh = 30, H = wh + 50, bot = H - 6, cx = Math.round(W / 2), x0 = cx - wallW / 2, x1 = cx + wallW / 2, wt = bot - wh;
  return mk(W, H, (p, g) => {
    setWood(null, TAR);
    shade(p, cx, bot, wallW / 2 + 4);
    boards(p, x0, x1, wt, bot, TAR, seed, 5);
    beamH(p, x0 - 1, x1 + 1, wt, 3);
    door(p, g, cx - 8, bot - 1, 12, 22, TAR, { lamp: false, step: false });
    lead(p, g, x1 - 18, wt + 8, 7, 8, TAR, { seed: seed + 1 });
    p.scan(x0 - 8, wt - 18, x1 + 8, wt + 2, (x, y) => {
      const top = wt - 16 + ((x - x0 + 8) / (wallW + 16)) * 10;
      if (y < top) return 0;
      const sd = top + 4 + smooth1(x, 6, seed) * 3;
      if (y < sd) return SNOW.c[y < top + 1 ? 6 : y > sd - 1 ? 3 : 5];
      return y > wt + 0.8 ? INK : FROSTW.c[(Math.floor(x / 4) & 1) ? 3 : 4];
    });
    lantern(p, g, x0 - 4, wt + 6);
    // Fischstange
    postV(p, x1 + 6, wt - 6, bot - 1, TAR, 2); p.scan(x1 + 2, wt - 6, x1 + 18, wt - 4, () => TAR.c[4]);
    for (const fx of [x1 + 9, x1 + 14]) p.scan(fx - 1.5, wt - 4, fx + 1.5, wt + 6, (x, y) => col32(y < wt - 2 ? '#8a8a90' : x < fx ? '#b8c0c8' : '#7a8088'));
  }, { ax: cx, ay: bot, b: true, box: [-wallW / 2 - 2, -20, wallW / 2 + 2, 1], light: { dx: -8, dy: -12, radius: 50, color: [255, 180, 110], intensity: 0.4 } });
}
export const FROST_DOORS = { fLong: 0, fLongS: 0, fLodge: 1, fSod: 1, fFish: -1 };
export function createFrostHouses() { return Object.fromEntries(Object.entries(FROST).map(([k, o]) => [k, frostHouse(o)])); }
