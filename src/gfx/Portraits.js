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
  elder_maren: { skin: 'skinOld', hair: 'long', hairC: 'grey', head: 'hood', hoodC: 'brownCloth', cloth: 'shawl', clothC: 'brownCloth', eyes: '#3a5a7a', wrinkles: true, extra: ['lantern'], face: { w: 18, jaw: 'pointed', eye: 'hooded', brow: 'thin', nose: 'hooked', lips: 'thin', mw: 5 }, bg: 'village' },
  smith_brom: { skin: 'skin', hair: 'bald', beard: 'full', beardC: 'auburn', cloth: 'apron', clothC: 'leather', brows: 'heavy', extra: ['soot', 'hammer'], eyes: '#4a3020', face: { w: 20, jaw: 'square', eye: 'narrow', brow: 'bushy', nose: 'broad', lips: 'thin', mw: 6 }, bg: 'forge', male: true },
  warden_ilsa: { skin: 'skin', hair: 'braid', hairC: 'auburn', head: 'hood', hoodC: 'green', cloth: 'cloak', clothC: 'green', eyes: '#3a6a3a', extra: ['bow', 'scarCheek'], face: { w: 18, jaw: 'pointed', eye: 'almond', brow: 'straight', nose: 'small', lips: 'mid', mw: 5 }, bg: 'forest' },
  herbalist_oona: { skin: 'skinPale', hair: 'long', hairC: 'blond', cloth: 'robe', clothC: 'tan', eyes: '#5a7a3a', extra: ['wreath', 'freckles'], face: { w: 17.5, jaw: 'round', eye: 'round', brow: 'high', nose: 'small', lips: 'full', mw: 5 }, bg: 'forest' },
  trader_vesk: { skin: 'skin', hair: 'short', hairC: 'dark', beard: 'goatee', beardC: 'dark', head: 'hat', hatC: 'dark', cloth: 'coat', clothC: 'red', eyes: '#2a1a10', extra: ['earring'], face: { w: 18, jaw: 'pointed', eye: 'narrow', brow: 'high', nose: 'hooked', lips: 'thin', mw: 7 }, bg: 'village', male: true },
  commander_hale: { skin: 'skin', hair: 'short', hairC: 'grey', beard: 'stubble', beardC: 'grey', head: 'helm', cloth: 'armor', clothC: 'steel', eyes: '#3a4a6a', brows: 'heavy', extra: ['scar', 'cape'], face: { w: 19.5, jaw: 'square', eye: 'hooded', brow: 'stern', nose: 'straight', lips: 'thin', mw: 6, cleft: true }, bg: 'peaks', male: true },
  seer_ysolde: { skin: 'skinPale', hair: 'long', hairC: 'dark', head: 'hood', hoodC: 'violet', cloth: 'robe', clothC: 'violet', eyes: '#c8a0ff', extra: ['glowEyes', 'circlet'], face: { w: 17.5, jaw: 'pointed', eye: 'almond', brow: 'thin', nose: 'small', lips: 'full', mw: 5 }, bg: 'arcane' },
  quartermaster_dunn: { skin: 'skin', hair: 'short', hairC: 'brown', beard: 'moustache', beardC: 'brown', head: 'cap', hatC: 'navy', cloth: 'coat', clothC: 'navy', eyes: '#2a2018', brows: 'heavy', extra: ['stout', 'quill'], face: { w: 20, jaw: 'round', eye: 'round', brow: 'bushy', nose: 'broad', lips: 'full', mw: 6 }, bg: 'peaks', male: true },
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
  return {
    skin: choose(['skin', 'skinPale', 'skinDark', 'skinOld'], 3), hair: choose(male ? ['short', 'bald', 'short'] : ['long', 'braid', 'bun'], 5),
    hairC: choose(['dark', 'brown', 'auburn', 'blond', 'grey'], 7), beard: male ? choose(['none', 'full', 'moustache', 'stubble'], 9) : 'none',
    beardC: choose(['dark', 'brown', 'auburn', 'grey'], 11), cloth: choose(['coat', 'robe', 'cloak', 'shawl'], 13),
    clothC: choose(['red', 'green', 'navy', 'brownCloth', 'violet', 'tan'], 15), eyes: choose(['#2a2018', '#3a5a7a', '#4a3020', '#3a6a3a'], 17), male,
    face: { w: choose(male ? [18.5, 19.5, 20] : [17.5, 18, 18.5], 19), jaw: choose(male ? ['square', 'round', 'pointed'] : ['round', 'pointed'], 21), eye: choose(['almond', 'round', 'narrow', 'hooded'], 23), brow: choose(male ? ['straight', 'bushy', 'arch'] : ['arch', 'thin', 'high'], 25), nose: choose(['straight', 'small', 'hooked', 'broad'], 27), lips: choose(male ? ['thin', 'mid'] : ['mid', 'full'], 29), mw: choose([5, 6, 6, 7], 30) },
    bg: def?.zoneId === 'ashwood' ? 'forest' : def?.zoneId === 'cinder_peaks' ? 'peaks' : 'village',
  };
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
};
const HX = 48, HY = 45, HRY = 23;
// Gesichtsform je Porträt (wird in drawPortrait gesetzt): Breite, Kieferverjüngung, Beginn der Verjüngung
let HRX = 18.5, JAW = 0.03, JAW0 = 5;
const JAWS = { round: [0.03, 5], pointed: [0.042, 3], square: [0.02, 9] };
function headD(x, y) {
  const dx = (x + 0.5 - HX) / HRX, dy = (y + 0.5 - HY) / HRY;
  const jaw = y > HY + JAW0 ? 1 + (y - HY - JAW0) * JAW : 1;
  return dx * dx * jaw * jaw + dy * dy;
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
  const F = { w: 18.5, jaw: 'round', eye: 'almond', brow: o.brows === 'heavy' ? 'stern' : 'arch', nose: 'straight', lips: 'mid', mw: 6, ...o.face };
  HRX = F.w; [JAW, JAW0] = JAWS[F.jaw] ?? JAWS.round;
  // Haarsträhnen: Lichter und Fugen entlang der Fallrichtung (kein Rauschen)
  const strand = (x, y, k = 1) => { const s = Math.sin((x - HX) * 1.05 + Math.sign(x - HX || 1) * y * 0.09 * k); return s > 0.62 ? 0.85 : s < -0.8 ? -0.7 : 0; };

  // Umhang hinter den Schultern
  if (has('cape')) ell(48, 104, 47, 42, (x, y, dx) => { if (y > 62) px(x, y, pick(R.red, 2.6 - Math.abs(dx) * 1.2 - (y - 62) / 34 - dx * 0.6)); });
  if (has('bow')) { for (let a = -1.25; a <= 1.25; a += 0.015) { px(2 + Math.cos(a) * 9, 58 + Math.sin(a) * 34, R.leather[3]); px(3 + Math.cos(a) * 9, 58 + Math.sin(a) * 34, R.leather[1]); } rect(4, 25, 1, 66, '#d8d0c0'); }
  // Langes Haar hinten
  if (o.hair === 'long' && !hood) ell(48, 54, 25, 36, (x, y, dx) => { if (y < 60 || Math.abs(dx) > 0.33) px(x, y, pick(hairR, 2.7 - dx * 1.1 - (y - 20) / 40 + strand(x, y))); });

  // Oberkörper
  const shW = stout ? 50 : 45;
  ell(48, 114, shW, 42, (x, y, dx) => {
    let t = 3 - dx * 1.6 - (y - 72) / 20;
    if (o.cloth === 'armor') t += (y === 82 || y === 83 || y === 92 || y === 93 ? -1.1 : 0) + (Math.abs(dx) > 0.55 && y < 88 ? 0.6 : 0);
    px(x, y, pick(o.cloth === 'armor' ? R[o.clothC] ?? R.steel : cloth, t));
  });
  // Kleidungsdetails
  if (o.cloth === 'apron') { for (let y = 82; y < S; y++) for (let x = 32; x < 65; x++) px(x, y, pick(R.leather, 2.7 - (x - 32) / 18)); rect(33, 82, 31, 2, R.leather[0]); for (let y = 72; y < 82; y++) { px(35, y, R.leather[1]); px(61, y, R.leather[1]); } px(48, 88, R.iron[3]); }
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
      const fold = Math.sin(Math.atan2(x + 0.5 - 48, y - 58) * 16) > 0.72 ? -0.7 : 0;
      const edge = !(ax < 10.5 - (y - 69) * 0.5) ? 0 : 0.9; // Lichtkante am V
      px(x, y, pick(Sh, 3.1 - dxs * 1.5 - (y - 66) / 22 + fold + edge));
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
  if (o.beard === 'full') for (let y = 52; y < 82; y++) for (let x = 26; x < 70; x++) { const ax = Math.abs(x + 0.5 - 48); const inB = (inHead(x, y) && (y > 54 || (ax > HRX - 6 && y > 47))) || (y >= 62 && !inHead(x, y) && ax < 12 - (y - 62) * 0.5); const mouth = y >= 60 && y <= 62 && ax < 6; if (inB && !mouth) px(x, y, pick(beardR, 3.1 - (x - 48) / 14 - (y - 54) / 18 + strand(x, y, 0.5))); }
  if (o.beard === 'moustache') { for (let x = 39; x < 58; x++) { const dy = Math.round(Math.abs(x - 48) * 0.18); px(x, 58 + dy, beardR[x < 48 ? 3 : 2]); px(x, 59 + dy, beardR[x < 48 ? 2 : 1]); if (Math.abs(x - 48) < 7) px(x, 57 + dy, beardR[x < 48 ? 2 : 1]); } }
  if (o.beard === 'goatee') for (let y = 63; y < 74; y++) for (let x = 43; x < 54; x++) if (Math.abs(x + 0.5 - 48.5) < 6 - (y - 63) * 0.3) px(x, y, pick(beardR, 3 - (x - 43) / 6 - (y - 63) / 8 + strand(x, y, 0.3)));

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
};
function drawFace96(px, o, skin, hairR, beardR, has, F) {
  const stub = o.beard === 'stubble';
  const hood = o.head === 'hood', helm = o.head === 'helm';
  const old = !!o.wrinkles, stern = o.brows === 'heavy', glow = has('glowEyes');
  const stubAt = (x, y) => stub && ((y >= 57 && !(y >= 59 && y <= 63 && Math.abs(x - 48) < 7)) || (y >= 50 && Math.abs(x + 0.5 - HX) > 12));
  const tint = (x, y, c) => (stubAt(x, y) ? mixHex(c, beardR[1], 0.32) : c);
  const sk = (x, y, i) => px(x, y, tint(x, y, skin[i]));
  // Grundfläche: klare Tonflächen
  for (let y = 18; y < 72; y++) for (let x = 26; x < 70; x++) {
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
  // Augenhöhlen und Schläfen
  for (let y = 39; y < 44; y++) { for (const x of [44, 45]) sk(x, y, 2); for (const x of [51, 52, 53]) sk(x, y, 2); }
  for (let y = 40; y < 50; y++) sk(65 - Math.round((y - 40) * 0.1), y, 1);
  // Wangenknochen
  for (const [x, y] of [[33, 50], [34, 50], [35, 50], [36, 50], [34, 51], [35, 51]]) sk(x, y, 5);
  if (old || stern) for (let y = 50; y < 57; y++) sk(61 + Math.round((y - 50) * 0.3), y, 2);

  // Augen
  const eyeC = o.eyes ?? '#2a1a10';
  const C = glow
    ? { i: '#b48cff', I: '#6a3ab8', p: '#241040', h: '#ffffff', w: '#efe6f4', v: '#c4b0d4' }
    : { i: mixHex(eyeC, '#ffffff', 0.22), I: mixHex(eyeC, '#000000', 0.3), p: '#0e080c', h: '#ffffff', w: '#ebe2da', v: '#bcaea6' };
  const lash = mixHex(skin[0], '#000000', 0.45);
  for (const [x0, mirror] of [[34, false], [54, true]]) {
    (EYES[F.eye] ?? EYES.almond).forEach((row, r) => { for (let c = 0; c < 9; c++) {
      const ch = row[c]; if (ch === '.') continue;
      const irisCh = 'iIph'.includes(ch);
      const x = mirror ? (irisCh ? x0 + c - 1 : x0 + 8 - c) : x0 + c, y = 40 + r;
      const col = { k: lash, l: skin[2], s: skin[2], L: skin[2], c: '#c87a70', w: mirror ? C.v : C.w, v: C.v, i: C.i, I: C.I, p: C.p, h: C.h }[ch];
      if (ch === 'l' || ch === 's' || ch === 'L') sk(x, y, 2); else px(x, y, col);
    } });
    if (glow) px(mirror ? x0 + 4 : x0 + 5, 44, '#e6d4ff');
    if (old) { for (let c = 2; c < 7; c++) sk(mirror ? x0 + 8 - c : x0 + c, 47, 2); sk(mirror ? x0 + 1 : x0 + 7, 48, 2); }
    // Brauen
    const B = (o.hair === 'bald' ? beardR : hairR);
    for (let c = -1; c < 10; c++) {
      const x = mirror ? x0 + 8 - c : x0 + c;
      const tt = c / 9; // 0 = Außenende, 1 = innen
      const bt = F.brow;
      let y = 37 - Math.round(Math.sin(tt * Math.PI) * 1.4) + (c < 1 ? 1 : 0);
      if (bt === 'stern') y = 36 + Math.round(tt * 1.6);
      else if (bt === 'straight') y = 37 + (c < 1 ? 1 : 0);
      else if (bt === 'high') y = 36 - Math.round(Math.sin(tt * Math.PI) * 2) + (c < 1 ? 1 : 0);
      if (F.eye === 'hooded' && bt !== 'stern') y -= 1;
      px(x, y, B[1]);
      if (bt !== 'thin' && c > 0 && c < 9) px(x, y - 1, c < 6 ? B[2] : B[1]);
      if (bt === 'bushy' && c > 0 && c < 8) { px(x, y - 2, B[c < 5 ? 3 : 2]); px(x, y + 1, B[0]); }
      if (bt === 'stern' && c > 1 && c < 9) px(x, y + 1, B[0]);
    }
  }
  // Nase: Rücken im Licht, Flanke im Schatten, Nasenflügel, Nasenlöcher
  // Form je Porträt: small = kürzer, hooked = Höcker und hängende Spitze, broad = breite Flügel
  const n = F.nose, ny = n === 'small' ? -1 : n === 'hooked' ? 1 : 0, w = n === 'broad' ? 1 : 0;
  for (let y = 43; y < 52 + ny; y++) { sk(46, y, 3); sk(47, y, y < 49 ? 4 : 5); sk(48, y, 3); if (y > 46) sk(50, y, 2); }
  if (n === 'hooked') { sk(46, 46, 4); sk(47, 46, 5); sk(48, 46, 4); sk(47, 47, 5); sk(48, 47, 4); sk(49, 47, 3); sk(48, 48, 2); sk(49, 48, 2); }
  if (n === 'broad') for (let y = 45; y < 52; y++) sk(49, y, 3);
  for (let y = 49; y < 55 + ny; y++) sk(51 + w, y, 2);
  const t = 52 + ny;
  for (let x = 46 - w; x <= 48 + w; x++) { sk(x, t, x === 47 ? 5 : 4); sk(x, t + 1, x <= 47 ? 5 : 4); }
  sk(49 + w, t + 1, 3); sk(49 + w, t, 3); sk(50 + w, t, 2); sk(50 + w, t + 1, 2);
  sk(44 - w, t + 1, 3); sk(43 - w, t + 2, 2); sk(43 - w, t + 3, 2); sk(44 - w, t + 4, 2); sk(44 - w, t + 2, 4); // linker Flügel
  sk(52 + w, t + 1, 1); sk(52 + w, t + 2, 1); sk(52 + w, t + 3, 1); sk(51 + w, t + 4, 1); sk(53 + w, t, 2); sk(53 + w, t + 1, 2); sk(53 + w, t + 2, 2); // rechter Flügel + Schlagschatten
  for (let x = 45 - w; x < 51 + w; x++) sk(x, t + 3, x < 47 ? 3 : 2);
  for (let x = 45 - w; x < 51 + w; x++) sk(x, t + 4, x <= 46 - w || x >= 49 + w ? 1 : 2); // Nasenlöcher
  if (n === 'hooked') { sk(47, t + 2, 4); sk(48, t + 2, 3); sk(47, t + 3, 2); sk(48, t + 3, 1); }
  sk(47, 58, 2); sk(49, 58, 1); // Philtrum
  // Mund: Oberlippe dunkler, Unterlippe heller, Mundspalte
  const m = !!o.male;
  const lipU = mixHex(skin[2], '#8a3436', m ? 0.12 : 0.38), lipU2 = mixHex(skin[2], '#6a2028', m ? 0.18 : 0.42);
  const lipL = mixHex(skin[3], '#c4605a', m ? 0.1 : 0.32), lipH = mixHex(lipL, '#ffffff', 0.22);
  const line = mixHex(skin[0], '#3a0c14', 0.3);
  const mw = F.mw, L0 = 48 - mw, L1 = 48 + mw, thin = F.lips === 'thin', full = F.lips === 'full';
  for (let x = L0 + 1; x < L1; x++) px(x, 60, tint(x, 60, thin ? mixHex(skin[2], x < 48 ? lipU : lipU2, 0.5) : x < 48 ? lipU : lipU2));
  if (full || !m) for (let x = 45; x < 52; x++) if (x !== 48) px(x, 59, x < 48 ? lipU : lipU2);
  for (let x = L0; x <= L1; x++) px(x, 61, line);
  const down = old || stern;
  sk(L0 - 1, down ? 62 : 60, 1); sk(L1 + 1, down ? 62 : 60, 1);
  if (thin) { for (let x = 45; x < 52; x++) px(x, 62, tint(x, 62, mixHex(skin[3], x < 48 ? lipH : lipL, 0.45))); for (let x = 45; x < 52; x++) sk(x, 63, 2); }
  else {
    for (let x = L0 + 2; x < L1 - 1; x++) px(x, 62, x < 47 ? lipH : lipL);
    for (let x = L0 + 3; x < L1 - 2; x++) px(x, 63, x < 48 ? lipL : mixHex(lipL, skin[2], 0.5));
    if (full) for (let x = L0 + 3; x < L1 - 2; x++) px(x, 64, x < 47 ? lipL : mixHex(lipL, skin[2], 0.55));
    for (let x = 45; x < 52; x++) sk(x, full ? 65 : 64, 2);
  }
  if (F.cleft) { sk(48, 67, 2); sk(48, 68, 2); }
  sk(45, 67, 4); sk(46, 67, 4); sk(46, 66, 4); // Kinnlicht
  // Wangenröte
  if (!m || old) for (const [x, y] of [[35, 53], [36, 53], [37, 53], [36, 54], [60, 53], [61, 53]]) px(x, y, mixHex(skin[3], '#d05a50', x > 50 ? 0.18 : 0.28));

  // Alter: Stirnfalten, Krähenfüße, Tränensäcke, Nasolabial- und Marionettenfalten
  if (old) {
    for (const [y, x0, x1] of [[29, 38, 46], [29, 50, 57], [32, 40, 56]]) for (let x = x0; x < x1; x++) { sk(x, y, 2); sk(x, y + 1, 4); }
    for (const [x, y] of [[32, 41], [31, 40], [30, 39], [32, 43], [31, 43], [30, 43], [32, 45], [31, 46], [30, 47]]) sk(x, y, 2);
    for (const [x, y] of [[64, 41], [65, 40], [64, 43], [65, 43], [64, 45], [65, 46]]) sk(x, y, 1);
    for (const [x, y] of [[41, 56], [40, 57], [40, 58], [39, 59], [39, 60], [39, 61]]) { sk(x, y, 2); sk(x - 1, y, 4); }
    for (const [x, y] of [[55, 56], [56, 57], [56, 58], [57, 59], [57, 60], [57, 61]]) sk(x, y, 1);
    for (const [x, y] of [[41, 63], [41, 64], [42, 65], [55, 63], [55, 64], [54, 65]]) sk(x, y, 2);
  }
  // Wetter-gegerbt (Kommandant): Krähenfüße und Kinngrübchen
  if (stern && !old) { for (const [x, y] of [[32, 41], [32, 44], [64, 41], [64, 44]]) sk(x, y, 2); sk(48, 66, 2); for (const [x, y] of [[41, 57], [40, 58], [40, 59]]) sk(x, y, 2); for (const [x, y] of [[55, 57], [56, 58], [56, 59]]) sk(x, y, 1); }
  if (has('freckles')) for (const [x, y] of [[38, 51], [41, 50], [43, 52], [54, 51], [57, 50]]) px(x, y, mixHex(skin[3], '#b07850', 0.3));
  // Narbe: über Braue und Wange der Lichtseite, das Auge bleibt frei
  if (has('scar')) for (const [x, y] of [[43, 33], [42, 34], [42, 35], [41, 36], [41, 37], [40, 38], [37, 47], [37, 48], [36, 49], [36, 50], [35, 51], [35, 52], [34, 53]]) { px(x, y, '#e2a698'); px(x + 1, y, '#8a3e38'); }
  if (has('scarCheek')) for (let i = 0; i < 7; i++) { px(36 + i, 50 + i, '#e0a090'); px(37 + i, 50 + i, '#8a3e38'); }
  if (has('soot')) for (const [x, y] of [[36, 55], [37, 55], [38, 56], [58, 37], [59, 37], [42, 27], [43, 27], [44, 28], [60, 58]]) px(x, y, mixHex(skin[2], '#201410', 0.45));
  // Seherin: Stirnzeichen und Linien unter den Augen
  if (glow) {
    const v = '#9a6ad8', vl = '#e0c8ff';
    for (const [x, y, c] of [[48, 33, vl], [47, 34, v], [49, 34, v], [48, 34, '#ffffff'], [46, 35, v], [50, 35, v], [47, 36, v], [49, 36, v], [48, 37, vl], [48, 35, vl]]) px(x, y, c);
    for (let i = 0; i < 3; i++) { px(38 - i, 47 + i, mixHex(v, skin[4], 0.15 + i * 0.25)); px(58 + i, 47 + i, mixHex(v, skin[3], 0.15 + i * 0.25)); }
  }
}
