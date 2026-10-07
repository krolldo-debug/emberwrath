import { makeCanvas } from './PixelCanvas.js';

// Pixel-Porträts für Gespräche (Thread D): Brustbild 96×96, enges Porträt,
// Licht von oben links, dunkle Kontur, Hintergrund in Zonenstimmung.
// Aus Bausteinen zusammengesetzt (Haut, Haare, Bart, Kopfbedeckung, Kleidung,
// Beiwerk), damit neue NPCs nur einen Datensatz brauchen.
// API: npcPortrait(npcId, npcDef?) -> Canvas (gecacht); npcPortraitUrl(npcId, npcDef?).
// Unbekannte NPCs bekommen ein aus der ID abgeleitetes Porträt.
const S = 96;

const R = {
  skin: ['#3a2220', '#6a4232', '#9a6a50', '#c8987a', '#e8c0a0'],
  skinOld: ['#3a2a28', '#6a5046', '#957462', '#b89884', '#d6bcaa'],
  skinPale: ['#40303a', '#7a5e68', '#a88a90', '#ccb2b0', '#ecd8d2'],
  skinDark: ['#221410', '#40261c', '#5e3a28', '#80523a', '#a0704e'],
  grey: ['#3a3640', '#5e5a66', '#8a8692', '#b8b4c0', '#e2dee8'],
  auburn: ['#2a0c08', '#4a1810', '#72281a', '#9a4028', '#c0623a'],
  dark: ['#0e0a0c', '#1c1418', '#2c2024', '#3e3032', '#544444'],
  blond: ['#4a3414', '#7a5a22', '#a8843a', '#d0b060', '#f0dc98'],
  brown: ['#1e120c', '#342016', '#4e3222', '#6a4a32', '#8a6646'],
  red: ['#2a0508', '#5a0c14', '#8a1a22', '#b8302e', '#e0584a'],
  green: ['#0a140c', '#142818', '#1e3c22', '#2e5632', '#4a7a44'],
  violet: ['#120820', '#22103a', '#381c5c', '#52307e', '#7a52aa'],
  navy: ['#0a0c18', '#141a2e', '#1e2844', '#2e3c5e', '#4a5a80'],
  leather: ['#1a100c', '#2e1e14', '#46301e', '#62442c', '#80603e'],
  tan: ['#2a2218', '#4a3c28', '#6e5a3c', '#928052', '#b4a26e'],
  steel: ['#1e2230', '#3a4258', '#62708e', '#9aa8c4', '#dce4f2'],
  iron: ['#1a1c22', '#30343e', '#4c5260', '#727a8a', '#a4acba'],
  gold: ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0'],
  brownCloth: ['#1c1210', '#30201a', '#483024', '#624232', '#7e5a44'],
};

// Datensätze je NPC (IDs aus INTEGRATION.md §11.2 und world/zones.js)
export const PORTRAITS = {
  elder_maren: { skin: 'skinOld', hair: 'long', hairC: 'grey', head: 'hood', hoodC: 'brownCloth', cloth: 'shawl', clothC: 'brownCloth', eyes: '#3a5a7a', wrinkles: true, extra: ['lantern'], face: { shape: 'long', ey: 1, eye: 'hooded', brow: 'thin', nose: 'hooked', nl: 2, lips: 'thin', mw: 5, my: 2, expr: 'smile', age: 'old' }, bg: 'village' },
  smith_brom: { skin: 'skinRuddy', hair: 'bald', beard: 'full', beardC: 'auburn', cloth: 'apron', clothC: 'leather', brows: 'heavy', extra: ['soot', 'hammer'], eyes: '#4a3020', face: { shape: 'square', eg: 2, eye: 'narrow', brow: 'bushy', nose: 'broad', lips: 'thin', mw: 6, age: 'mid', blush: true }, bg: 'forge', male: true },
  warden_ilsa: { skin: 'skinTan', hair: 'braid', hairC: 'auburn', head: 'hood', hoodC: 'green', cloth: 'cloak', clothC: 'green', eyes: '#3a6a3a', extra: ['bow', 'scarCheek'], face: { shape: 'cheeky', ey: -1, eye: 'almond', brow: 'straight', nose: 'straight', lips: 'mid', mw: 5 }, bg: 'forest' },
  herbalist_oona: { skin: 'skinPale', hair: 'long', hairC: 'blond', cloth: 'robe', clothC: 'tan', eyes: '#5a7a3a', extra: ['wreath', 'freckles'], face: { shape: 'round', ey: 1, eg: 1, eye: 'wide', brow: 'high', nose: 'small', lips: 'full', mw: 5, expr: 'smile' }, bg: 'forest' },
  trader_vesk: { skin: 'skinOlive', hair: 'short', hairC: 'dark', beard: 'goatee', beardC: 'dark', head: 'hat', hatC: 'dark', cloth: 'coat', clothC: 'red', eyes: '#2a1a10', extra: ['earring'], face: { shape: 'long', ey: -1, eg: -1, eye: 'heavy', brow: 'high', nose: 'hooked', nl: 1, lips: 'thin', mw: 7, my: 1, expr: 'smirk' }, bg: 'village', male: true },
  commander_hale: { skin: 'skinTan', hair: 'short', hairC: 'grey', beard: 'stubble', beardC: 'grey', head: 'helm', cloth: 'armor', clothC: 'steel', eyes: '#3a4a6a', brows: 'heavy', extra: ['scar', 'cape'], face: { shape: 'square', eg: 1, eye: 'hooded', brow: 'stern', nose: 'straight', nl: 1, lips: 'thin', mw: 6, expr: 'frown', age: 'weathered', cleft: true }, bg: 'peaks', male: true },
  seer_ysolde: { skin: 'skinCool', hair: 'long', hairC: 'dark', head: 'hood', hoodC: 'violet', cloth: 'robe', clothC: 'violet', eyes: '#c8a0ff', extra: ['glowEyes', 'circlet'], face: { shape: 'oval', eye: 'almond', brow: 'thin', nose: 'small', lips: 'full', expr: 'pursed' }, bg: 'arcane' },
  quartermaster_dunn: { skin: 'skinDeep', hair: 'short', hairC: 'brown', beard: 'moustache', beardC: 'brown', head: 'cap', hatC: 'navy', cloth: 'coat', clothC: 'navy', eyes: '#2a2018', brows: 'heavy', extra: ['stout', 'quill'], face: { shape: 'round', ey: 1, eye: 'round', brow: 'bushy', nose: 'broad', nl: 1, lips: 'full', mw: 6, expr: 'smile', age: 'mid', bags: true }, bg: 'peaks', male: true },
};

const BG = {
  village: ['#1a1024', '#2e1a2c', '#5a2e24'],
  forge: ['#1a0a08', '#3a140a', '#8a3a12'],
  forest: ['#0a140e', '#16261a', '#2e3a1e'],
  peaks: ['#140a0c', '#2a1214', '#5a2418'],
  arcane: ['#0e0820', '#1e1038', '#3a2060'],
  temple: ['#06141a', '#0e2830', '#1c4a52'],
  crypt: ['#0c0a14', '#1a1428', '#2e2440'],
};

const cache = new Map();
const urlCache = new Map();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (ramp, t) => ramp[clamp(Math.round(t), 0, ramp.length - 1)];
function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Porträt für NPCs ohne Datensatz: aus der ID abgeleitet (stabil)
function derived(id, def) {
  const h = hashStr(id);
  const choose = (arr, k) => arr[(h >>> k) % arr.length];
  const male = (h & 1) === 0;
  const o = {
    skin: choose(['skin', 'skinPale', 'skinDark', 'skinOld', 'skinTan', 'skinRuddy', 'skinOlive', 'skinDeep', 'skinCool'], 3), hair: choose(male ? ['short', 'bald', 'short'] : ['long', 'braid', 'bun'], 5),
    hairC: choose(['dark', 'brown', 'auburn', 'blond', 'grey'], 7), beard: male ? choose(['none', 'full', 'moustache', 'stubble'], 9) : 'none',
    beardC: choose(['dark', 'brown', 'auburn', 'grey'], 11), cloth: choose(['coat', 'robe', 'cloak', 'shawl'], 13),
    clothC: choose(['red', 'green', 'navy', 'brownCloth', 'violet', 'tan'], 15), eyes: choose(['#2a2018', '#3a5a7a', '#4a3020', '#3a6a3a'], 17), male,
    face: { shape: choose(['oval', 'long', 'round', 'square', 'cheeky'], 19), ey: choose([-1, 0, 1, 2], 21), eg: choose([-1, 0, 1, 2], 22), eye: choose(['almond', 'round', 'narrow', 'hooded', 'wide', 'heavy'], 23), brow: choose(male ? ['straight', 'bushy', 'arch', 'stern'] : ['arch', 'thin', 'high', 'straight'], 25), nose: choose(['straight', 'small', 'hooked', 'broad'], 27), nl: choose([-1, 0, 1, 2], 26), lips: choose(male ? ['thin', 'mid'] : ['mid', 'full'], 29), mw: choose([4, 5, 6, 7], 30), expr: choose(['neutral', 'smile', 'frown', 'smirk', 'pursed'], 28), age: choose(['young', 'mid', 'weathered'], 24) },
    bg: def?.zoneId === 'ashwood' ? 'forest' : def?.zoneId === 'cinder_peaks' ? 'peaks' : 'village',
  };
  if (o.skin === 'skinOld') { o.face.age = 'old'; o.wrinkles = true; o.hairC = 'grey'; }
  return o;
}

export function npcPortrait(npcId, def = null) {
  if (cache.has(npcId)) return cache.get(npcId);
  const o = PORTRAITS[npcId] ?? derived(String(npcId ?? 'npc'), def);
  const c = drawPortrait(o);
  cache.set(npcId, c);
  return c;
}

export function npcPortraitUrl(npcId, def = null) {
  if (!urlCache.has(npcId)) urlCache.set(npcId, npcPortrait(npcId, def).toDataURL());
  return urlCache.get(npcId);
}

// ------------------------------------------------------------ Zeichnen
// 96×96, enges Brustbild: Kopf ~38 px breit. Licht von links oben.
// Hautrampen mit 6 Stufen: 0 Kontur, 1 Tiefschatten, 2 Schatten, 3 Mitte, 4 Licht, 5 Glanz.
const SKIN = {
  skin: ['#2e1816', '#5e3426', '#93583f', '#c08263', '#e0a888', '#f6cdb0'],
  skinOld: ['#33201e', '#5e4034', '#8a6250', '#b28872', '#d2ac94', '#ead0bc'],
  skinPale: ['#33222a', '#6a4c56', '#9c7a80', '#c6a2a2', '#e4c6be', '#f8e6de'],
  skinDark: ['#1a0e0a', '#36201a', '#56362a', '#7a5038', '#9c6c4c', '#bc8c66'],
  skinTan: ['#2a160e', '#5a3220', '#8a5634', '#b47a50', '#d29c6c', '#eabc8c'],
  skinRuddy: ['#301412', '#64302a', '#9a5244', '#c67a64', '#e4a088', '#f6c4a8'],
  skinOlive: ['#241a10', '#4e3a24', '#7a5c3a', '#a07c54', '#c09c70', '#d8b88c'],
  skinDeep: ['#140a08', '#2e1a14', '#4c2c20', '#6c4230', '#8c5a40', '#ac7656'],
  skinCool: ['#2c2232', '#5e4c60', '#907c8c', '#bca8b2', '#dcccd0', '#f2e8ea'],
};
const HX = 48, HY = 45;
// Kopfumriss je Porträt: Halbachsen, Kieferverjüngung ab j0, Exponent p (>2 = kantig), Wangenknochen-Auswölbung
const SHAPES = {
  oval: { rx: 18.5, ry: 23, jaw: 0.03, j0: 5, p: 2, cheek: 0 },
  long: { rx: 17, ry: 25.5, jaw: 0.032, j0: 6, p: 2, cheek: 0 },
  round: { rx: 19.5, ry: 21.5, jaw: 0.016, j0: 6, p: 2, cheek: 0 },
  square: { rx: 19.5, ry: 23, jaw: 0.012, j0: 9, p: 2.7, cheek: 0 },
  cheeky: { rx: 17.5, ry: 23.5, jaw: 0.045, j0: 5, p: 2, cheek: 2 },
};
let G = SHAPES.oval, HRX = 18.5, HRY = 23; // wird in drawPortrait gesetzt
function headD(x, y) {
  const dy = (y + 0.5 - HY) / G.ry;
  const rx = G.rx + G.cheek * (Math.abs(y + 0.5 - 46) < 12 ? (1 + Math.cos((y + 0.5 - 46) / 12 * Math.PI)) / 2 : 0);
  const jaw = y > HY + G.j0 ? 1 + (y - HY - G.j0) * G.jaw : 1;
  const dx = (x + 0.5 - HX) / rx * jaw;
  return G.p === 2 ? dx * dx + dy * dy : Math.abs(dx) ** G.p + Math.abs(dy) ** G.p;
}
const inHead = (x, y) => headD(x, y) <= 1;
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mixHex(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

export function drawPortrait(o) {
  const fig = makeCanvas(S, S), f = fig.getContext('2d');
  const px = (x, y, col) => { if (!col) return; f.fillStyle = col; f.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const rect = (x, y, w, h, col) => { f.fillStyle = col; f.fillRect(x, y, w, h); };
  const ell = (cx, cy, rx, ry, fn) => { for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(S, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(S, Math.ceil(cx + rx)); x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy; if (d <= 1) fn(x, y, dx, dy, d); } };
  const has = (e) => o.extra?.includes(e);
  const skin = SKIN[o.skin] ?? SKIN.skin;
  const cloth = R[o.clothC] ?? R.brownCloth;
  const hairR = R[o.hairC] ?? R.dark;
  const beardR = R[o.beardC] ?? hairR;
  const hood = o.head === 'hood';
  const stout = has('stout');
  const F = { shape: 'oval', eye: 'almond', brow: o.brows === 'heavy' ? 'stern' : 'arch', nose: 'straight', lips: 'mid', mw: 6, ...o.face };
  G = SHAPES[F.shape] ?? SHAPES.oval; HRX = G.rx; HRY = G.ry;
  // Haarsträhnen: Lichter und Fugen entlang der Fallrichtung (kein Rauschen)
  const strand = (x, y, k = 1) => { const s = Math.sin((x - HX) * 1.05 + Math.sign(x - HX || 1) * y * 0.09 * k); return s > 0.62 ? 0.85 : s < -0.8 ? -0.7 : 0; };

  // Stoff: drei flache Töne (Licht links, Mitte, Schatten rechts), Lichtkante oben, weiche Falten
  const zone = (dx, dy, d) => (dx < -0.48 ? 3 : dx < 0.32 ? 2 : 1) + (d > 0.84 && dy < 0 && dx < 0.25 ? 1 : 0);
  const folds = (x, y, list, y0) => { // -1 Faltental, +1 Faltengrat, 0 nichts
    if (y < y0) return 0;
    for (const [cx, ph] of list) {
      const wv = 0.8 + (y - y0) / 9, xc = cx + Math.sin(y * 0.11 + ph) * 1.6;
      if (Math.abs(x + 0.5 - xc) < wv) return -1;
      if (x + 0.5 >= xc - wv - 1.6 && x + 0.5 < xc - wv) return 1;
    }
    return 0;
  };
  const BODYF = [[30, 0], [41, 2], [61, 4], [70, 1]];
  // Umhang hinter den Schultern
  if (has('cape')) ell(48, 104, 47, 42, (x, y, dx, dy, d) => { if (y > 62) px(x, y, R.red[clamp(zone(dx, dy, d) - (Math.abs(dx) > 0.8 ? 1 : 0) + folds(x, y, [[8, 1], [88, 3]], 76), 0, 4)]); });
  if (has('bow')) { for (let a = -1.25; a <= 1.25; a += 0.015) { px(2 + Math.cos(a) * 9, 58 + Math.sin(a) * 34, R.leather[3]); px(3 + Math.cos(a) * 9, 58 + Math.sin(a) * 34, R.leather[1]); } rect(4, 25, 1, 66, '#d8d0c0'); }
  // Langes Haar hinten
  if (o.hair === 'long' && !hood) ell(48, 54, 25, 36, (x, y, dx) => { if (y < 60 || Math.abs(dx) > 0.33) px(x, y, pick(hairR, 2.7 - dx * 1.1 - (y - 20) / 40 + strand(x, y))); });

  // Oberkörper
  const shW = stout ? 50 : 45;
  ell(48, 114, shW, 42, (x, y, dx, dy, d) => {
    let t = zone(dx, dy, d);
    if (o.cloth === 'armor') { t += (y === 82 || y === 83 || y === 92 || y === 93 ? -1 : 0) + (Math.abs(dx) > 0.55 && y < 88 ? 1 : 0) + (y === 84 || y === 94 ? 1 : 0); px(x, y, (R[o.clothC] ?? R.steel)[clamp(t, 0, 4)]); return; }
    px(x, y, cloth[clamp(t + folds(x, y, BODYF, 80), 0, 4)]);
  });
  // Kleidungsdetails
  if (o.cloth === 'apron') { for (let y = 82; y < S; y++) for (let x = 32; x < 65; x++) px(x, y, R.leather[clamp((x < 38 ? 3 : x < 56 ? 2 : 1) + folds(x, y, [[44, 1], [53, 3]], 86), 0, 4)]); rect(33, 82, 31, 2, R.leather[0]); for (let y = 72; y < 82; y++) { px(35, y, R.leather[1]); px(61, y, R.leather[1]); } px(48, 88, R.iron[3]); }
  if (o.cloth === 'coat') { for (let y = 74; y < S; y++) { px(46 + (y - 74) * 0.15, y, cloth[0]); px(50 - (y - 74) * 0.1, y, R.gold[2]); px(51 - (y - 74) * 0.1, y, R.gold[1]); } for (const y of [80, 87, 94]) { px(53, y, R.gold[4]); px(54, y, R.gold[2]); px(53, y + 1, R.gold[2]); } }
  if (o.cloth === 'robe') { for (let y = 72; y < S; y++) { const x = 48 + Math.round(Math.sin(y * 0.2) * 1.5); px(x, y, cloth[4]); px(x + 1, y, cloth[1]); } for (let x = 36; x < 61; x++) px(x, 72 + Math.round(Math.abs(x - 48) * 0.18), cloth[4]); }
  if (o.cloth === 'shawl') {
    // Umschlagtuch: liegt auf den Schultern, vorne V-förmig offen, Spitze mit Fransen
    const Sh = o.clothC === 'brownCloth' ? R.tan : R.brownCloth;
    for (let y = 66; y < S; y++) for (let x = 0; x < S; x++) {
      const ax = Math.abs(x + 0.5 - 48), dxs = (x + 0.5 - 48) / shW, dys = (y + 0.5 - 114) / 42;
      if (dxs * dxs + dys * dys > 1) continue;
      const yb = 93 - ax * 0.32, open = ax < 10.5 - (y - 70) * 0.5;
      if (y > yb || open) continue;
      const edge = ax < 10.5 - (y - 68) * 0.5 ? 1 : 0; // Lichtkante am V
      const fl = folds(x, y, [[25, 0.5], [35, 2], [63, 4], [72, 1.5]], 72);
      px(x, y, Sh[clamp((dxs < -0.45 ? 3 : dxs < 0.3 ? 2 : 1) + edge + fl, 0, 4)]);
      if (y > yb - 1 && x % 2 === 0) { px(x, y + 1, Sh[2]); px(x, y + 2, Sh[1]); }
    }
  }
  if (o.cloth === 'cloak') { for (let y = 72; y < S; y++) { px(36 + (y - 72) * 0.12, y, cloth[0]); px(60 - (y - 72) * 0.12, y, cloth[0]); } rect(46, 76, 4, 4, R.gold[2]); rect(46, 76, 2, 2, R.gold[4]); px(49, 79, R.gold[1]); }
  if (o.cloth === 'armor') { for (let x = 28; x < 69; x++) { px(x, 72, R.steel[4]); px(x, 73, R.steel[3]); px(x, 74, R.steel[1]); } rect(46, 80, 4, 4, R.gold[3]); px(46, 80, R.gold[4]); px(49, 83, R.gold[1]); }

  if (hood) { const H = R[o.hoodC] ?? R.brownCloth; ell(48, 48, 23, 28.5, (x, y, dx) => px(x, y, H[dx > 0.2 ? 0 : 1])); }
  // Hals mit Schlagschatten unter dem Kinn
  const neckEnd = hood ? 76 : o.cloth === 'armor' ? 72 : o.cloth === 'shawl' ? 84 : 82;
  for (let y = 56; y < neckEnd; y++) {
    const hw = 8.5 + Math.max(0, y - 64) * 0.2;
    for (let x = Math.round(48 - hw); x < Math.round(48 + hw); x++) {
      const rel = (x + 0.5 - (48 - hw)) / (2 * hw);
      let i = rel < 0.24 ? 3 : rel < 0.7 ? 2 : 1;
      if (headD(x, y - 4) <= 1) i = 1; // Schlagschatten des Kiefers
      else if (headD(x, y - 7) <= 1 && i > 2) i = 2;
      px(x, y, skin[i]);
    }
    if (y > 64 && y < neckEnd - 1) px(Math.round(42 + (y - 64) * 0.3), y, skin[2]); // Halsmuskel
  }
  if (o.male && !hood && o.beard !== 'full') { px(48, 70, skin[3]); px(47, 71, skin[3]); px(48, 71, skin[2]); }
  if (o.cloth === 'coat' || o.cloth === 'cloak') for (let y = 68; y < 84; y++) {
    const k = y - 68;
    for (let x = Math.round(36 + k * 0.15); x <= Math.round(42 + k * 0.42); x++) px(x, y, x === Math.round(42 + k * 0.42) ? cloth[4] : cloth[3]);
    for (let x = Math.round(54 - k * 0.42); x <= Math.round(60 - k * 0.15); x++) px(x, y, x === Math.round(54 - k * 0.42) ? cloth[2] : cloth[1]);
  }
  if (o.cloth === 'armor') ell(48, 74, 14, 5, (x, y, dx, dy) => px(x, y, pick(R[o.clothC] ?? R.steel, (dy < -0.4 ? 4 : 2.8) - dx * 1.4)));

  // Haare unter der Kapuze (Seiten + Scheitel)
  if (hood && o.hair) ell(48, 48, 23, 28.5, (x, y, dx) => { if (y < 33 - Math.abs(x - 48) * 0.1 || Math.abs(dx) > 0.62) px(x, y, pick(hairR, 2.7 - dx * 1.1 - (y - 20) / 34 + strand(x, y, 1.6) + (y < 30 && Math.abs(x - 48) < 1 ? -1.4 : 0))); });
  if (o.hair === 'braid') for (let y = 52; y < 88; y++) { const x = 28 - Math.sin(y * 0.15) * 2; for (let k = -2; k <= 2; k++) px(x + k, y, hairR[clamp(3 - Math.abs(k) - ((y + k) % 6 < 2 ? 1 : 0), 0, 4)]); }
  if (o.hair === 'bun') ell(46, 18, 9, 7, (x, y, dx, dy, d) => px(x, y, pick(hairR, 3.4 - d * 1.5 - dx + strand(x, y))));
  // Ohr
  if (!hood && o.head !== 'helm') { const ex = Math.round(HX - HRX + 0.5); ell(ex + 0.5, 48, 3.2, 6, (x, y, dx) => px(x, y, dx < 0.2 ? skin[3] : skin[2])); for (let y = 45; y < 52; y++) px(ex + 1, y, skin[1]); px(ex, 47, skin[2]); px(ex, 50, skin[2]); }

  drawFace96(px, o, skin, hairR, beardR, has, F);

  // Bart
  if (o.beard === 'full') {
    // Vollbart aus Locken-Büscheln: jedes Büschel oben links hell, unten rechts dunkel, dunkle Fugen dazwischen
    const big = stout || F.shape === 'square';
    const lobes = [];
    for (let r = 0; r < 5; r++) for (let c = -3; c <= 3; c++) lobes.push([48 + c * 8 + (r % 2) * 4 + Math.sin(r * 3.1 + c * 1.7) * 1.6, 54 + r * 6.5 + Math.cos(r * 1.3 + c * 2.3) * 1.2]);
    const MYb = 61 + (F.my ?? 0);
    for (let y = 46; y < 90; y++) for (let x = 22; x < 74; x++) {
      const ax = Math.abs(x + 0.5 - 48);
      const ex = (x + 0.5 - 48) / (HRX + (big ? 2.5 : 0.5)), eyv = (y + 0.5 - 60) / (big ? 24 : 19);
      let inB = ex * ex + eyv * eyv <= 1 && (y > 54 || (ax > HRX - 5 && y > 47));
      if (!big && !inHead(x, y) && y < 64) inB = false;
      if (!inB || (y >= MYb - 1 && y <= MYb + 1 && ax < (F.mw ?? 6) - 1)) continue;
      let d1 = 9, d2 = 9, lx = 0, ly = 0;
      for (const [cx, cy] of lobes) { const ux = (x + 0.5 - cx) / 4.8, uy = (y + 0.5 - cy) / 5.6, dd = ux * ux + uy * uy; if (dd < d1) { d2 = d1; d1 = dd; lx = ux; ly = uy; } else if (dd < d2) d2 = dd; }
      if (y > (big ? 76 : 70) && d1 > 0.9) continue; // gewellter Saum
      let tt = 3.2 - lx * 0.55 - ly * 0.75 - (x - 48) / 15 - (y - 52) / 30;
      if (d2 - d1 < 0.22 && ly > -0.2) tt -= 1.1; // Fuge unter dem Büschel
      else if (ly < -0.55 && lx < 0.3) tt += 0.6; // Glanz oben am Büschel
      px(x, y, pick(beardR, tt));
    }
    // Schnurrbart über dem Mund
    for (let x = 48 - (F.mw ?? 6) - 2; x <= 48 + (F.mw ?? 6) + 2; x++) { const k = Math.abs(x + 0.5 - 48); px(x, MYb - 2 + Math.round(k * 0.12), beardR[x < 48 ? 3 : 2]); px(x, MYb - 3 + Math.round(k * 0.12), beardR[x < 48 ? 2 : 1]); }
  }
  const MYo = 61 + (F.my ?? 0);
  if (o.beard === 'moustache') { for (let x = 39; x < 58; x++) { const dy = Math.round(Math.abs(x - 48) * 0.18); px(x, MYo - 3 + dy, beardR[x < 48 ? 3 : 2]); px(x, MYo - 2 + dy, beardR[x < 48 ? 2 : 1]); if (Math.abs(x - 48) < 7) px(x, MYo - 4 + dy, beardR[x < 48 ? 2 : 1]); } }
  if (o.beard === 'goatee') for (let y = MYo + 3; y < MYo + 14; y++) for (let x = 43; x < 54; x++) if (Math.abs(x + 0.5 - 48.5) < 5.5 - (y - MYo - 3) * 0.3) px(x, y, pick(beardR, 3 - (x - 43) / 6 - (y - MYo - 3) / 8 + strand(x, y, 0.3)));

  // Haare oben / Kopfbedeckung
  const hairTop = (lo, side) => ell(48, 40, 21, 21, (x, y, dx) => { if (y < lo - Math.abs(dx) * 3 || (side && y < 50 && (x < 31 || x > 65))) px(x, y, pick(hairR, 3.3 - dx * 1.2 - (y - 19) / 14 + strand(x, y, 2))); });
  if (hood) {
    const H = R[o.hoodC] ?? R.brownCloth;
    ell(48, 47, 32.5, 41, (x, y, dx, dy) => {
      const ix = (x + 0.5 - 48) / 23, iy = (y + 0.5 - 48) / 28.5, id = Math.sqrt(ix * ix + iy * iy);
      if (id <= 1 && y > 19) return;
      let t = 3.5 - dx * 1.4 - (y - 6) / 32;
      if (id < 1.1) t -= 1.4; else if (id < 1.2) t += 0.7; // Innenschatten, Saumlicht
      if (Math.abs(dx) > 0.82) t -= 0.9;
      px(x, y, pick(H, t));
    });
  } else if (o.head === 'helm') {
    if (o.hair) for (let y = 33; y < 48; y++) for (let x = 29; x < 67; x++) if ((x < 32 || x > 64) && inHead(x, y)) px(x, y, pick(hairR, 2.6 - (x - 29) / 20 + strand(x, y)));
    ell(48, 34, 23.5, 20, (x, y, dx) => { if (y < 33) px(x, y, pick(R.steel, 3.6 - dx * 1.6 - (y - 14) / 14 + (Math.abs(dx + 0.35) < 0.06 ? 0.8 : 0))); });
    for (let x = 24; x < 73; x++) { px(x, 31, R.steel[4]); px(x, 32, R.steel[3]); px(x, 33, R.steel[2]); px(x, 34, R.steel[0]); }
    for (let x = 26; x < 71; x += 6) px(x, 32, R.iron[1]);
    // Wangenklappen
    for (const [x0, w, sh] of [[24, 6, 0], [66, 6, -1.2]]) for (let y = 34; y < 58; y++) for (let x = x0; x < x0 + w; x++) if (y < 52 || (x0 < 48 ? x > x0 + (y - 52) : x < x0 + w - (y - 52))) px(x, y, pick(R.steel, 3 + sh - (y - 34) / 18 + (x === x0 + (x0 < 48 ? w - 1 : 0) ? -1 : 0)));
    for (let y = 33; y < 43; y++) { px(47, y, R.steel[4]); px(48, y, R.steel[3]); px(49, y, R.steel[1]); } px(48, 43, R.steel[1]); // Nasal
    for (let y = 6; y < 16; y++) { px(47, y, R.red[3]); px(48, y, R.red[4]); px(49, y, R.red[2]); }
  } else if (o.head === 'hat') {
    hairTop(34, true);
    const Hc = R[o.hatC] ?? R.dark;
    for (let y = 8; y < 27; y++) for (let x = 30; x < 67; x++) px(x, y, pick(Hc, 3 - (x - 30) / 16 - (y - 8) / 14));
    for (let x = 14; x < 82; x++) { px(x, 27, Hc[3]); px(x, 28, Hc[2]); px(x, 29, Hc[0]); }
    for (let x = 30; x < 67; x++) { px(x, 22, R.red[3]); px(x, 23, R.red[2]); px(x, 24, R.red[1]); }
  } else if (o.head === 'cap') {
    hairTop(36, true);
    const Hc = R[o.hatC] ?? R.navy;
    ell(48, 32, 21, 15, (x, y, dx) => { if (y < 33) px(x, y, pick(Hc, 3.4 - dx * 1.1 - (y - 17) / 10)); });
    for (let x = 50; x < 76; x++) { px(x, 32, Hc[1]); px(x, 33, Hc[0]); }
    rect(46, 22, 3, 3, R.gold[3]); px(46, 22, R.gold[4]);
  } else if (o.hair === 'bald') {
    ell(41, 28, 6, 3.5, (x, y) => px(x, y, skin[5]));
    const bx = Math.round(HX - HRX); for (let y = 36; y < 50; y++) for (let x = bx + 1; x < bx + 4; x++) if (inHead(x, y)) px(x, y, pick(beardR, 2.4 - (x - bx - 1) / 2));
  } else if (o.hair) {
    hairTop(o.hair === 'short' ? 33 : 37, o.hair !== 'short');
  }
  if (has('circlet')) { for (let x = 30; x < 67; x++) { const y = 30 + Math.round(Math.abs(x - 48) * 0.06); px(x, y, R.gold[3]); px(x, y + 1, R.gold[1]); } rect(47, 29, 3, 3, '#c8a0ff'); px(47, 29, '#ffffff'); }
  if (has('wreath')) for (let x = 28; x < 69; x += 3) { const y = 24 + Math.round(Math.abs(x - 48) / 4); px(x, y, R.green[4]); px(x + 1, y + 1, R.green[3]); px(x + 1, y, R.green[2]); }
  if (has('earring')) { rect(29, 54, 2, 2, R.gold[4]); px(29, 56, R.gold[2]); }

  // Beiwerk vorne
  if (has('hammer')) { for (let y = 62; y < S; y++) { px(82, y, R.leather[3]); px(83, y, R.leather[2]); px(84, y, R.leather[1]); } for (let y = 56; y < 68; y++) for (let x = 72; x < 93; x++) px(x, y, pick(R.iron, 3.5 - (y - 56) / 4)); }
  if (has('quill')) for (let i = 0; i < 22; i++) { px(78 + i * 0.4, 76 - i, i > 13 ? '#f0e8e0' : '#c8c0b0'); if (i > 8) px(79 + i * 0.4, 76 - i, '#a8a090'); }

  // Kontur + Hintergrund
  const img = f.getImageData(0, 0, S, S).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < S && y < S && img[(y * S + x) * 4 + 3] > 0;
  const out = makeCanvas(S, S), g = out.getContext('2d');
  const bg = BG[o.bg] ?? BG.village;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const b = 2.2 - Math.hypot(x + 0.5 - 36, y + 0.5 - 32) / 68 * 2.8;
    const t = clamp(b + (((x + y) & 1) && Math.abs(b % 1 - 0.5) < 0.08 ? 0.5 : 0), 0, 2);
    g.fillStyle = bg[Math.round(t)]; g.fillRect(x, y, 1, 1);
  }
  if (has('lantern')) { const gr = g.createRadialGradient(15, 82, 2, 15, 82, 38); gr.addColorStop(0, 'rgba(255,200,110,0.8)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.fillRect(0, 44, 54, 52); }
  g.fillStyle = '#0a0508';
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) g.fillRect(x, y, 1, 1);
  g.drawImage(fig, 0, 0);
  if (has('glowEyes')) { g.globalCompositeOperation = 'lighter'; for (const ex of [38.5, 58.5]) { const gr = g.createRadialGradient(ex, 44, 0, ex, 44, 8); gr.addColorStop(0, 'rgba(150,90,255,0.32)'); gr.addColorStop(1, 'rgba(120,60,220,0)'); g.fillStyle = gr; g.fillRect(ex - 9, 35, 18, 18); } g.globalCompositeOperation = 'source-over'; }
  if (has('lantern')) { g.fillStyle = R.iron[1]; g.fillRect(8, 76, 15, 19); g.fillStyle = R.iron[0]; g.fillRect(8, 76, 15, 1); g.fillStyle = '#ffe8a0'; g.fillRect(10, 79, 11, 13); g.fillStyle = '#fff8e0'; g.fillRect(12, 81, 5, 5); g.fillStyle = R.iron[2]; g.fillRect(13, 72, 5, 4); g.fillStyle = R.iron[1]; g.fillRect(15, 79, 1, 13); }
  return out;
}

// ------------------------------------------------------------ Gesicht 96
// Augen als Schablone (9 breit), Außenwinkel links; das rechte Auge gespiegelt.
// k Lidstrich, l Lidfalte, w Weiß, v Weiß im Schatten, c Tränenwinkel,
// I Iris dunkel, i Iris, p Pupille, h Glanz, s Unterlid, L Lidhaut.
const EYES = {
  almond: ['..lllll..', '.kkkkkkk.', 'kkwIhpIwc', '.vwiipiwL', '..siiis..', '...sss...'],
  round: ['..lllll..', '.kkkkkkk.', 'kkwIhpIwc', 'kvwiipiwL', '.vwiiiiw.', '..sssss..'],
  narrow: ['.........', '..lllll..', '.kkkkkkk.', 'kkwIhpIwc', '..siiis..', '...sss...'],
  hooded: ['.lllllll.', 'llllllll.', '.kkkkkkk.', 'kkwIhpIwc', '.vwiipiws', '..sssss..'],
  // weit offen: Weiß auch unter der Iris
  wide: ['..lllll..', '.kkkkkkk.', 'kvwIhpIwc', 'kvwiipiwL', '.vwiiiiw.', '..vwwwv..', '...sss...'],
  // schwere Lider: Lidschatten liegt halb über der Iris, kein Glanz
  heavy: ['.lllllll.', '.DDDDDDD.', 'kkkkkkkkk', 'kvwIIpIwc', '.vwiipiws', '..sssss..'],
};
function drawFace96(px, o, skin, hairR, beardR, has, F) {
  const stub = o.beard === 'stubble';
  const hood = o.head === 'hood', helm = o.head === 'helm';
  const age = F.age ?? (o.wrinkles ? 'old' : 'young');
  const old = age === 'old', glow = has('glowEyes');
  const ey = F.ey ?? 0, eg = F.eg ?? 0, nl = F.nl ?? 0, my = F.my ?? 0;
  const expr = F.expr ?? 'neutral';
  const MY = 61 + my; // Mundspalte
  const mw = expr === 'pursed' ? 3 : F.mw ?? 6;
  const stubAt = (x, y) => stub && ((y >= MY - 4 && !(y >= MY - 2 && y <= MY + 2 && Math.abs(x - 48) < mw + 1)) || (y >= 50 && Math.abs(x + 0.5 - HX) > HRX - 6));
  const tint = (x, y, c) => (stubAt(x, y) ? mixHex(c, beardR[1], 0.32) : c);
  const sk = (x, y, i) => px(x, y, tint(x, y, skin[i]));
  // Grundfläche: klare Tonflächen
  for (let y = 16; y < 76; y++) for (let x = 24; x < 72; x++) {
    if (!inHead(x, y)) continue;
    const dx = (x + 0.5 - HX) / HRX, dy = (y + 0.5 - HY) / HRY;
    const d = headD(x, y);
    const l = -dx * 0.75 - dy * 0.35 + (1 - d) * 0.4;
    let i = l > 0.78 ? 5 : l > 0.36 ? 4 : l > -0.3 ? 3 : l > -0.7 ? 2 : 1;
    if (!inHead(x + 1, y) || !inHead(x + 2, y)) i = Math.min(i, 1);
    else if (!inHead(x, y + 1) || !inHead(x, y + 2)) i = Math.min(i, 2);
    if (hood && y < 34) i = Math.max(1, i - (y < 29 ? 2 : 1));
    if (helm && y < 40) i = Math.max(1, i - (y < 37 ? 2 : 1));
    sk(x, y, i);
  }
  const lx = 34 - eg, rx = 54 + eg, EY = 40 + ey; // Augen-Anker
  // Augenhöhlen und Schläfen
  for (let y = EY - 1; y < EY + 4; y++) { for (const x of [lx + 10, lx + 11]) sk(x, y, 2); for (const x of [rx - 3, rx - 2, rx - 1]) sk(x, y, 2); }
  for (let y = 40; y < 50; y++) sk(Math.round(HX + HRX - 3.5 - (y - 40) * 0.1), y, 1);
  // Wangenknochen; breite Wangenknochen mit Höhlung darunter
  const cy = 50 + Math.round(ey / 2), cheeky = F.shape === 'cheeky';
  for (const [x, y] of [[33, cy], [34, cy], [35, cy], [36, cy], [34, cy + 1], [35, cy + 1]]) sk(x - (cheeky ? 2 : 0), y, 5);
  if (old || cheeky || age === 'weathered') for (let y = cy; y < cy + 8; y++) { sk(Math.round(HX + HRX - 6 + (y - cy) * 0.3), y, 2); if (cheeky) sk(Math.round(HX - HRX + 6 + (y - cy) * 0.2), y + 2, 3); }

  // Augen
  const eyeC = o.eyes ?? '#2a1a10';
  const C = glow
    ? { i: '#b48cff', I: '#6a3ab8', p: '#241040', h: '#ffffff', w: '#efe6f4', v: '#c4b0d4' }
    : { i: mixHex(eyeC, '#ffffff', 0.22), I: mixHex(eyeC, '#000000', 0.3), p: '#0e080c', h: '#ffffff', w: '#ebe2da', v: '#bcaea6' };
  const lash = mixHex(skin[0], '#000000', 0.45);
  const tpl = EYES[F.eye] ?? EYES.almond;
  for (const [x0, mirror] of [[lx, false], [rx, true]]) {
    tpl.forEach((row, r) => { for (let c = 0; c < 9; c++) {
      const ch = row[c]; if (ch === '.') continue;
      const irisCh = 'iIph'.includes(ch);
      const x = mirror ? (irisCh ? x0 + c - 1 : x0 + 8 - c) : x0 + c, y = EY + r;
      if (ch === 'l' || ch === 's' || ch === 'L') sk(x, y, 2);
      else if (ch === 'D') sk(x, y, 1);
      else px(x, y, { k: lash, c: '#c87a70', w: mirror ? C.v : C.w, v: C.v, i: C.i, I: C.I, p: C.p, h: C.h }[ch]);
    } });
    if (glow) px(mirror ? x0 + 4 : x0 + 5, EY + 4, '#e6d4ff');
    const ly = EY + tpl.length;
    if (old || F.bags) { for (let c = 2; c < 7; c++) sk(mirror ? x0 + 8 - c : x0 + c, ly, 2); sk(mirror ? x0 + 1 : x0 + 7, ly + 1, 2); if (F.bags) for (let c = 3; c < 6; c++) px(mirror ? x0 + 8 - c : x0 + c, ly - 1, mixHex(skin[2], '#4a2a40', 0.25)); }
    // Brauen
    const B = (o.hair === 'bald' ? beardR : hairR);
    for (let c = -1; c < 10; c++) {
      const x = mirror ? x0 + 8 - c : x0 + c;
      const tt = c / 9; // 0 = Außenende, 1 = innen
      const bt = F.brow;
      let y = 37 - Math.round(Math.sin(tt * Math.PI) * 1.4) + (c < 1 ? 1 : 0);
      if (bt === 'stern') y = 36 + Math.round(tt * 1.6);
      else if (bt === 'straight') y = 37 + (c < 1 ? 1 : 0);
      else if (bt === 'high') y = 35 - Math.round(Math.sin(tt * Math.PI) * 2) + (c < 1 ? 1 : 0);
      if ((F.eye === 'hooded' || F.eye === 'heavy') && bt !== 'stern') y -= 1;
      y += ey;
      px(x, y, B[1]);
      if (bt !== 'thin' && c > 0 && c < 9) px(x, y - 1, c < 6 ? B[2] : B[1]);
      if (bt === 'bushy' && c > 0 && c < 8) { px(x, y - 2, B[c < 5 ? 3 : 2]); px(x, y + 1, B[0]); }
      if (bt === 'stern' && c > 1 && c < 9) px(x, y + 1, B[0]);
    }
  }

  // Nase: Länge (nl) und Form je Porträt
  const n = F.nose, w = n === 'broad' ? 1 : 0;
  const t = 52 + nl + (n === 'small' ? -1 : n === 'hooked' ? 1 : 0); // Oberkante der Nasenspitze
  for (let y = 43 + ey; y < t; y++) { sk(46, y, 3); sk(47, y, y < t - 3 ? 4 : 5); sk(48, y, 3); if (y > 45 + ey) sk(50 + w, y, 2); }
  if (n === 'hooked') { const b = Math.round((43 + ey + t) / 2) - 1; sk(46, b, 4); sk(47, b, 5); sk(48, b, 4); sk(47, b + 1, 5); sk(48, b + 1, 4); sk(49, b + 1, 3); sk(48, b + 2, 2); sk(49, b + 2, 2); }
  if (n === 'broad') for (let y = 45 + ey; y < t; y++) sk(49, y, 3);
  if (n === 'small') for (let y = 43 + ey; y < t - 2; y++) sk(47, y, 4);
  for (let y = t - 3; y < t + 3; y++) sk(51 + w, y, 2);
  for (let x = 46 - w; x <= 48 + w; x++) { sk(x, t, x === 47 ? 5 : 4); sk(x, t + 1, x <= 47 ? 5 : 4); }
  sk(49 + w, t + 1, 3); sk(49 + w, t, 3); sk(50 + w, t, 2); sk(50 + w, t + 1, 2);
  sk(44 - w, t + 1, 3); sk(43 - w, t + 2, 2); sk(43 - w, t + 3, 2); sk(44 - w, t + 4, 2); sk(44 - w, t + 2, 4); // linker Flügel
  sk(52 + w, t + 1, 1); sk(52 + w, t + 2, 1); sk(52 + w, t + 3, 1); sk(51 + w, t + 4, 1); sk(53 + w, t, 2); sk(53 + w, t + 1, 2); sk(53 + w, t + 2, 2); // rechter Flügel + Schlagschatten
  for (let x = 45 - w; x < 51 + w; x++) sk(x, t + 3, x < 47 ? 3 : 2);
  for (let x = 45 - w; x < 51 + w; x++) sk(x, t + 4, x <= 46 - w || x >= 49 + w ? 1 : 2); // Nasenlöcher
  if (n === 'hooked') { sk(47, t + 2, 4); sk(48, t + 2, 3); sk(47, t + 3, 2); sk(48, t + 3, 1); }
  if (MY - 3 > t + 4) { sk(47, MY - 3, 2); sk(49, MY - 3, 1); } // Philtrum

  // Mund: Breite, Lippenfülle und Ausdruck (Lächeln, Grimm, Schmunzeln, gespitzt)
  const m = !!o.male;
  const lipU = mixHex(skin[2], '#8a3436', m ? 0.12 : 0.38), lipU2 = mixHex(skin[2], '#6a2028', m ? 0.18 : 0.42);
  const lipL = mixHex(skin[3], '#c4605a', m ? 0.1 : 0.32), lipH = mixHex(lipL, '#ffffff', 0.22);
  const line = mixHex(skin[0], '#3a0c14', 0.3);
  const L0 = 48 - mw, L1 = 48 + mw, thin = F.lips === 'thin', full = F.lips === 'full' || expr === 'pursed';
  const edge = (x) => Math.abs(x - 48) > mw - 2;
  const lineY = (x) => MY + (expr === 'smile' && edge(x) ? -1 : expr === 'frown' && edge(x) ? 1 : expr === 'smirk' && x - 48 > mw - 3 ? -1 : 0);
  for (let x = L0 + 1; x < L1; x++) px(x, lineY(x) - 1, tint(x, lineY(x) - 1, thin ? mixHex(skin[2], x < 48 ? lipU : lipU2, 0.5) : x < 48 ? lipU : lipU2));
  if ((full || !m) && expr !== 'smile') for (let x = 48 - Math.min(3, mw - 1); x <= 48 + Math.min(3, mw - 1); x++) if (x !== 48) px(x, MY - 2, x < 48 ? lipU : lipU2);
  for (let x = L0; x <= L1; x++) px(x, lineY(x), line);
  const cl = { neutral: [MY - 1, MY - 1], smile: [MY - 2, MY - 2], frown: [MY + 2, MY + 2], smirk: [MY, MY - 2], pursed: [MY, MY] }[expr] ?? [MY - 1, MY - 1];
  sk(L0 - 1, cl[0], 1); sk(L1 + 1, cl[1], 1);
  if (expr === 'smile') { sk(L0 - 2, MY - 1, 2); sk(L1 + 2, MY - 1, 2); sk(L0 - 1, MY - 3, 4); }
  if (expr === 'smirk') { sk(L1 + 2, MY - 1, 2); sk(L1 + 2, MY - 3, 2); }
  if (expr === 'pursed') { sk(L0 - 1, MY - 2, 2); sk(L1 + 1, MY - 2, 2); sk(L0, MY + 2, 2); sk(L1, MY + 2, 2); }
  const lw = expr === 'pursed' ? 1 : 2;
  if (thin) { for (let x = 45; x < 52; x++) px(x, MY + 1, tint(x, MY + 1, mixHex(skin[3], x < 48 ? lipH : lipL, 0.45))); for (let x = 45; x < 52; x++) sk(x, MY + 2, 2); }
  else {
    for (let x = L0 + lw; x <= L1 - lw; x++) px(x, MY + 1, x < 47 ? lipH : lipL);
    for (let x = L0 + lw + 1; x <= L1 - lw - 1; x++) px(x, MY + 2, x < 48 ? lipL : mixHex(lipL, skin[2], 0.5));
    if (full) for (let x = L0 + lw + 1; x <= L1 - lw - 1; x++) px(x, MY + 3, x < 47 ? lipL : mixHex(lipL, skin[2], 0.55));
    for (let x = 45; x < 52; x++) sk(x, full ? MY + 4 : MY + 3, 2);
  }
  const chin = Math.round(HY + HRY * (G.p > 2 ? 0.97 : 0.93)) - 2;
  sk(45, chin, 4); sk(46, chin, 4); sk(46, chin - 1, 4);
  if (F.cleft) { sk(48, chin, 2); sk(48, chin + 1, 2); }
  // Wangenröte
  if (!m || old || F.blush) for (const [x, y] of [[35, cy + 3], [36, cy + 3], [37, cy + 3], [36, cy + 4], [60, cy + 3], [61, cy + 3]]) px(x, y, mixHex(skin[3], '#d05a50', x > 50 ? 0.18 : 0.28));

  // Alterszeichen
  const crow = (k) => { for (const [x, y] of [[lx - 2, EY + 1], [lx - 3, EY], [lx - 2, EY + 3], [lx - 3, EY + 3], [lx - 2, EY + 5], [lx - 3, EY + 6]].slice(0, k)) sk(x, y, 2); for (const [x, y] of [[rx + 10, EY + 1], [rx + 11, EY], [rx + 10, EY + 3], [rx + 11, EY + 3], [rx + 10, EY + 5]].slice(0, k)) sk(x, y, 1); };
  const fold = (len, dark) => { for (let i = 0; i < len; i++) { const y = t + 4 + i; sk(Math.round(43 - w - i * 0.45), y, dark); if (dark === 2) sk(Math.round(42 - w - i * 0.45), y, 4); sk(Math.round(53 + w + i * 0.45), y, 1); } };
  if (old) {
    for (const [y, x0, x1] of [[29, 38, 46], [29, 50, 57], [32, 40, 56]]) for (let x = x0; x < x1; x++) { sk(x, y, 2); sk(x, y + 1, 4); }
    crow(9); fold(Math.max(3, MY - t - 3), 2);
    for (const [x, y] of [[L0 - 1, MY + 2], [L0 - 1, MY + 3], [L0, MY + 4], [L1 + 1, MY + 2], [L1 + 1, MY + 3], [L1, MY + 4]]) sk(x, y, 2);
  } else if (age === 'mid') {
    if (!hood && o.head !== 'hat' && o.head !== 'cap') for (let x = 40; x < 57; x++) { sk(x, 31, 2); sk(x, 32, 4); }
    crow(3); fold(3, 2);
  } else if (age === 'weathered') { crow(4); fold(3, 2); }
  if (expr === 'smile' && !old) { if (age !== 'young') fold(Math.max(2, MY - t - 4), 2); for (const [x, y] of [[36, cy + 2], [37, cy + 2], [59, cy + 2]]) sk(x, y, x < 48 ? 5 : 3); }
  if (has('freckles')) for (const [x, y] of [[38, cy + 1], [41, cy], [43, cy + 2], [54, cy + 1], [57, cy]]) px(x, y, mixHex(skin[3], '#b07850', 0.3));
  // Narbe: über Braue und Wange der Lichtseite, das Auge bleibt frei
  if (has('scar')) for (const [x, y] of [[43, 33], [42, 34], [42, 35], [41, 36], [41, 37], [40, 38], [37, 47], [37, 48], [36, 49], [36, 50], [35, 51], [35, 52], [34, 53]]) { px(x - eg, y + (y < 40 ? ey : ey + 1), '#e2a698'); px(x + 1 - eg, y + (y < 40 ? ey : ey + 1), '#8a3e38'); }
  if (has('scarCheek')) for (let i = 0; i < 7; i++) { px(35 + i, cy + i, '#e0a090'); px(36 + i, cy + i, '#8a3e38'); }
  if (has('soot')) for (const [x, y] of [[36, 55], [37, 55], [38, 56], [58, 37], [59, 37], [42, 27], [43, 27], [44, 28], [60, 58]]) px(x, y, mixHex(skin[2], '#201410', 0.45));
  // Seherin: Stirnzeichen und Linien unter den Augen
  if (glow) {
    const v = '#9a6ad8', vl = '#e0c8ff';
    for (const [x, y, c] of [[48, 33, vl], [47, 34, v], [49, 34, v], [48, 34, '#ffffff'], [46, 35, v], [50, 35, v], [47, 36, v], [49, 36, v], [48, 37, vl], [48, 35, vl]]) px(x, y + ey, c);
    for (let i = 0; i < 3; i++) { px(lx + 4 - i, EY + 7 + i, mixHex(v, skin[4], 0.15 + i * 0.25)); px(rx + 4 + i, EY + 7 + i, mixHex(v, skin[3], 0.15 + i * 0.25)); }
  }
}
