import { makeCanvas } from './PixelCanvas.js';

// Pixel-Porträts für Gespräche (Thread D): Brustbild 48×48 im 3/4-Profil,
// Licht von oben links, dunkle Kontur, Hintergrund in Zonenstimmung.
// Aus Bausteinen zusammengesetzt (Haut, Haare, Bart, Kopfbedeckung, Kleidung,
// Beiwerk), damit neue NPCs nur einen Datensatz brauchen.
// API: npcPortrait(npcId, npcDef?) -> Canvas (gecacht); npcPortraitUrl(npcId, npcDef?).
// Unbekannte NPCs bekommen ein aus der ID abgeleitetes Porträt.
const S = 48;

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
  elder_maren: { skin: 'skinOld', hair: 'long', hairC: 'grey', head: 'hood', hoodC: 'brownCloth', cloth: 'shawl', clothC: 'brownCloth', eyes: '#3a5a7a', wrinkles: true, extra: ['lantern'], bg: 'village' },
  smith_brom: { skin: 'skin', hair: 'bald', beard: 'full', beardC: 'auburn', cloth: 'apron', clothC: 'leather', brows: 'heavy', extra: ['soot', 'hammer'], eyes: '#4a3020', bg: 'forge', male: true },
  warden_ilsa: { skin: 'skin', hair: 'braid', hairC: 'auburn', head: 'hood', hoodC: 'green', cloth: 'cloak', clothC: 'green', eyes: '#3a6a3a', extra: ['bow', 'scarCheek'], bg: 'forest' },
  herbalist_oona: { skin: 'skinPale', hair: 'long', hairC: 'blond', cloth: 'robe', clothC: 'tan', eyes: '#5a7a3a', extra: ['wreath', 'freckles'], bg: 'forest' },
  trader_vesk: { skin: 'skin', hair: 'short', hairC: 'dark', beard: 'goatee', beardC: 'dark', head: 'hat', hatC: 'dark', cloth: 'coat', clothC: 'red', eyes: '#2a1a10', extra: ['earring'], bg: 'village', male: true },
  commander_hale: { skin: 'skin', hair: 'short', hairC: 'grey', beard: 'stubble', beardC: 'grey', head: 'helm', cloth: 'armor', clothC: 'steel', eyes: '#3a4a6a', brows: 'heavy', extra: ['scar', 'cape'], bg: 'peaks', male: true },
  seer_ysolde: { skin: 'skinPale', hair: 'long', hairC: 'dark', head: 'hood', hoodC: 'violet', cloth: 'robe', clothC: 'violet', eyes: '#c8a0ff', extra: ['glowEyes', 'circlet'], bg: 'arcane' },
  quartermaster_dunn: { skin: 'skin', hair: 'short', hairC: 'brown', beard: 'moustache', beardC: 'brown', head: 'cap', hatC: 'navy', cloth: 'coat', clothC: 'navy', eyes: '#2a2018', brows: 'heavy', extra: ['stout', 'quill'], bg: 'peaks', male: true },
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
    clothC: choose(['red', 'green', 'navy', 'brownCloth', 'violet', 'tan'], 15), eyes: '#2a2018', male,
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
export function drawPortrait(o) {
  // Figur auf eigener Ebene (für Kontur), danach auf den Hintergrund
  const fig = makeCanvas(S, S), f = fig.getContext('2d');
  const px = (x, y, col) => { if (!col) return; f.fillStyle = col; f.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const has = (e) => o.extra?.includes(e);
  const skin = R[o.skin] ?? R.skin;
  const cloth = R[o.clothC] ?? R.brownCloth;
  const hairR = R[o.hairC] ?? R.dark;
  const beardR = R[o.beardC] ?? hairR;
  const hx = 24, hy = 21; // Kopfmitte
  const stout = has('stout');

  // Umhang hinter den Schultern
  if (has('cape')) for (let y = 30; y < S; y++) for (let x = 4; x < 44; x++) { const d = Math.abs(x + 0.5 - 24) / (18 + (y - 30) * 0.2); if (d <= 1) px(x, y, pick(R.red, 2.4 - d * 1.5 - (y - 30) / 20)); }
  if (has('bow')) { for (let a = -1.2; a <= 1.2; a += 0.04) px(8 + Math.cos(a) * 5 - 6, 28 + Math.sin(a) * 18, R.leather[3]); f.fillStyle = '#d8d0c0'; f.fillRect(7, 11, 1, 34); }

  // Oberkörper: breite Ellipse unten
  const shW = stout ? 21 : 18;
  for (let y = 31; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5 - 24) / shW, dy = (y + 0.5 - 50) / 18;
    if (dx * dx + dy * dy > 1) continue;
    let t = 3 - dx * 1.6 - (y - 31) / 10;
    if (o.cloth === 'armor') t += (y === 36 || y === 42 ? -1 : 0) + (Math.abs(dx) > 0.55 && y < 40 ? 0.6 : 0);
    px(x, y, pick(o.cloth === 'armor' ? R[o.clothC] ?? R.steel : cloth, t));
  }
  // Kleidungsdetails
  if (o.cloth === 'apron') { for (let y = 37; y < S; y++) for (let x = 16; x < 33; x++) px(x, y, pick(R.leather, 2.6 - (x - 16) / 10)); f.fillStyle = R.leather[0]; f.fillRect(17, 37, 15, 1); px(18, 36, R.leather[1]); px(30, 36, R.leather[1]); }
  if (o.cloth === 'coat') { for (let y = 34; y < S; y++) { px(23 + (y - 34) * 0.15, y, cloth[0]); px(25 - (y - 34) * 0.1, y, R.gold[2]); } for (const y of [38, 42, 46]) px(26, y, R.gold[3]); }
  if (o.cloth === 'robe') { for (let y = 33; y < S; y++) px(24 + Math.round(Math.sin(y * 0.4)), y, cloth[4]); }
  if (o.cloth === 'shawl') { for (let y = 32; y < 40; y++) for (let x = 12; x < 37; x++) { const d = Math.abs(x + 0.5 - 24) - (40 - y) * 1.4; if (d < 0) px(x, y, pick(R.brownCloth, 3.2 - (y - 32) / 4 + ((x + y) % 3 === 0 ? -1 : 0))); } }
  if (o.cloth === 'cloak') { for (let y = 32; y < S; y++) { px(18 + (y - 32) * 0.1, y, cloth[0]); px(30 - (y - 32) * 0.1, y, cloth[0]); } px(24, 34, R.gold[3]); px(25, 34, R.gold[4]); px(24, 35, R.gold[2]); }
  if (o.cloth === 'armor') { for (let x = 14; x < 35; x++) px(x, 33, R.steel[4]); px(24, 39, R.gold[3]); px(23, 40, R.gold[3]); px(25, 40, R.gold[2]); px(24, 41, R.gold[2]); }

  // Hals
  for (let y = 28; y < 34; y++) for (let x = 20; x < 28; x++) px(x, y, pick(skin, 1.8 - (x - 20) / 8));

  // Haare hinten (lang/Zopf)
  // Unter der Kapuze: Haar füllt die Öffnung neben dem Gesicht
  if (o.head === 'hood' && (o.hair === 'long' || o.hair === 'braid')) for (let y = 12; y < 36; y++) for (let x = 14; x < 36; x++) { const dx = (x + 0.5 - 24.5) / 9.6, dy = (y + 0.5 - 23) / 11.8; if (dx * dx + dy * dy <= 1 && (y < 20 || Math.abs(dx) > 0.6)) px(x, y, pick(hairR, 2.4 - dx * 1.2 - (y - 12) / 14 + ((x * 3 + y) % 4 === 0 ? 0.8 : 0))); }
  if (o.hair === 'long' && o.head !== 'hood') for (let y = 14; y < 40; y++) for (let x = 12; x < 36; x++) { const dx = (x + 0.5 - 24) / 11, dy = (y + 0.5 - 24) / 16; if (dx * dx + dy * dy <= 1 && (y > 26 ? Math.abs(dx) > 0.42 : true)) px(x, y, pick(hairR, 2.6 - dx - (y - 14) / 16 + ((x * 7 + y) % 5 === 0 ? 1 : 0))); }
  if (o.hair === 'braid') for (let y = 24; y < 42; y++) { const x = 15 - Math.sin(y * 0.2); px(x, y, hairR[(y % 3) + 1]); px(x + 1, y, hairR[(y % 3)]); px(x - 1, y, hairR[1]); }
  if (o.hair === 'bun') for (let y = 6; y < 13; y++) for (let x = 19; x < 29; x++) { const d = Math.hypot(x + 0.5 - 23, y + 0.5 - 9.5); if (d < 4) px(x, y, pick(hairR, 3 - d / 2)); }

  // Kopf
  for (let y = 10; y < 32; y++) for (let x = 13; x < 35; x++) {
    const dx = (x + 0.5 - hx) / 8.2, dy = (y + 0.5 - hy) / 10.2;
    const jaw = y > 25 ? 1 + (y - 25) * 0.07 : 1;
    if (dx * dx * jaw * jaw + dy * dy > 1) continue;
    let t = 3.2 - dx * 1.4 - dy * 0.8;
    if (x > hx + 5) t -= 0.8; // abgewandte Wange im Schatten
    px(x, y, pick(skin, t));
  }
  // Ohr (Betrachterseite links)
  for (let y = 19; y < 24; y++) { px(15, y, skin[2]); px(16, y, skin[1]); }

  // Gesicht: Brauen, Augen, Nase, Mund (Blick nach rechts)
  const eyeY = 21;
  const brow = o.brows === 'heavy' ? 2 : 1;
  const browC = (o.hair === 'bald' ? beardR : hairR)[1];
  for (const ex of [19, 27]) {
    for (let i = 0; i < 4; i++) for (let b = 0; b < brow; b++) px(ex - 1 + i, eyeY - 3 - b + (i === 0 ? 1 : 0), browC);
    px(ex, eyeY, '#f0e8e0'); px(ex + 1, eyeY, has('glowEyes') ? '#ffffff' : o.eyes ?? '#2a1a10'); px(ex + 2, eyeY, has('glowEyes') ? o.eyes : '#140c10');
    px(ex, eyeY - 1, skin[1]); px(ex + 1, eyeY - 1, skin[1]); px(ex + 2, eyeY - 1, skin[1]);
    px(ex + 1, eyeY + 1, skin[2]);
  }
  if (has('glowEyes')) { f.globalAlpha = 0.45; f.fillStyle = o.eyes; f.fillRect(18, 20, 6, 3); f.fillRect(26, 20, 6, 3); f.globalAlpha = 1; }
  // Nase
  for (let y = eyeY + 1; y < eyeY + 6; y++) px(25 + (y > eyeY + 3 ? 1 : 0), y, skin[1]);
  px(24, eyeY + 5, skin[1]); px(25, eyeY + 6, skin[4]); px(26, eyeY + 5, skin[0]);
  // Mund
  for (let x = 22; x < 28; x++) px(x, eyeY + 8, x === 22 || x === 27 ? skin[1] : '#6a3230');
  px(21, eyeY + 7, skin[1]); px(24, eyeY + 9, skin[3]); px(25, eyeY + 9, skin[3]);
  px(19, eyeY + 4, '#c07a6a'); px(20, eyeY + 4, '#c07a6a'); // Wangenröte
  px(25, eyeY + 2, skin[4]); // Nasenlicht
  if (o.wrinkles) { px(17, eyeY + 1, skin[1]); px(31, eyeY + 1, skin[1]); px(20, eyeY + 7, skin[1]); px(28, eyeY + 7, skin[1]); for (let x = 20; x < 28; x += 2) px(x, 14, skin[2]); }
  if (has('freckles')) for (const [x, y] of [[19, 24], [21, 25], [28, 24], [30, 25], [20, 23]]) px(x, y, skin[1]);
  if (has('scar')) { for (let i = 0; i < 7; i++) px(29 + (i % 2), 16 + i, '#8a3a36'); }
  if (has('scarCheek')) { px(18, 25, '#9a4a40'); px(19, 26, '#9a4a40'); px(20, 27, '#9a4a40'); }
  if (has('soot')) for (const [x, y] of [[18, 26], [29, 18], [21, 14], [30, 27]]) px(x, y, skin[1]);

  // Bart
  if (o.beard === 'full') { for (let x = 19; x < 30; x++) px(x, eyeY + 7, beardR[x < 24 ? 3 : 2]); }
  if (o.beard === 'full') for (let y = 26; y < 38; y++) for (let x = 14; x < 34; x++) { const dx = (x + 0.5 - 24) / 9.5, dy = (y + 0.5 - 27) / 10; if (dx * dx + dy * dy <= 1 && !(y >= eyeY + 8 && y <= eyeY + 9 && x > 21 && x < 28)) px(x, y, pick(beardR, 3 - dx - (y - 26) / 8 + ((x + y * 3) % 4 === 0 ? -1 : 0))); }
  if (o.beard === 'moustache') { for (let x = 19; x < 30; x++) px(x, eyeY + 7 - (x < 21 || x > 27 ? -1 : 0), beardR[x < 24 ? 3 : 2]); px(18, eyeY + 9, beardR[2]); px(30, eyeY + 9, beardR[1]); }
  if (o.beard === 'goatee') for (let y = eyeY + 9; y < eyeY + 13; y++) for (let x = 22; x < 27; x++) px(x, y, beardR[2 + (x === 22 ? 1 : 0)]);
  if (o.beard === 'stubble') for (let y = 24; y < 31; y++) for (let x = 16; x < 33; x++) if ((x * 3 + y * 5) % 4 === 0 && Math.hypot((x - 24) / 8.2, (y - 21) / 10.2) < 1) px(x, y, beardR[1]);

  // Haare oben / Kopfbedeckung
  const hairTop = (lo) => { for (let y = 9; y < lo; y++) for (let x = 13; x < 36; x++) { const dx = (x + 0.5 - 24) / 9.2, dy = (y + 0.5 - 18) / 9.2; if (dx * dx + dy * dy <= 1 && (y < 15 || x < 17)) px(x, y, pick(hairR, 3.2 - dx * 1.2 - (y - 9) / 6 + ((x * 5 + y) % 6 === 0 ? 1 : 0))); } };
  if (o.head === 'hood') {
    const H = R[o.hoodC] ?? R.brownCloth;
    for (let y = 4; y < 40; y++) for (let x = 6; x < 42; x++) {
      const dx = (x + 0.5 - 24) / 14, dy = (y + 0.5 - 22) / 18;
      if (dx * dx + dy * dy > 1) continue;
      const inner = ((x + 0.5 - 24.5) / 9.6) ** 2 + ((y + 0.5 - 23) / 11.8) ** 2 <= 1 && y > 11;
      if (inner) continue;
      px(x, y, pick(H, 3.4 - dx * 1.2 - (y - 4) / 14 + (Math.abs(dx) > 0.7 ? -0.8 : 0)));
    }
    for (let a = 3.5; a < 6; a += 0.05) px(24.5 + Math.cos(a) * 9.6, 23 + Math.sin(a) * 11.8, H[4]); // Saum
  } else if (o.head === 'helm') {
    for (let y = 7; y < 22; y++) for (let x = 12; x < 37; x++) { const dx = (x + 0.5 - 24) / 11, dy = (y + 0.5 - 18) / 11; if (dx * dx + dy * dy <= 1 && (y < 17 || x < 16 || x > 33)) px(x, y, pick(R.steel, 3.4 - dx * 1.5 - (y - 7) / 8)); }
    for (let x = 13; x < 36; x++) { px(x, 16, R.steel[4]); px(x, 17, R.steel[1]); }
    for (let y = 16; y < 25; y++) { px(24, y, R.steel[3]); px(25, y, R.steel[1]); } // Nasal
    for (let y = 5; y < 10; y++) px(24, y, R.red[3]); px(25, 6, R.red[4]);
  } else if (o.head === 'hat') {
    hairTop(17);
    for (let y = 6; y < 14; y++) for (let x = 15; x < 34; x++) px(x, y, pick(R[o.hatC] ?? R.dark, 3 - (x - 15) / 8 - (y - 6) / 6));
    for (let x = 8; x < 41; x++) { px(x, 14, (R[o.hatC] ?? R.dark)[3]); px(x, 15, (R[o.hatC] ?? R.dark)[1]); }
    for (let x = 15; x < 34; x++) px(x, 12, R.red[3]);
  } else if (o.head === 'cap') {
    hairTop(18);
    for (let y = 8; y < 15; y++) for (let x = 14; x < 35; x++) { const dx = (x + 0.5 - 24) / 10, dy = (y + 0.5 - 15) / 7; if (dx * dx + dy * dy <= 1) px(x, y, pick(R[o.hatC] ?? R.navy, 3.3 - dx - (y - 8) / 5)); }
    for (let x = 26; x < 38; x++) px(x, 15, (R[o.hatC] ?? R.navy)[0]);
    px(24, 10, R.gold[3]);
  } else if (o.hair === 'bald') {
    for (let y = 12; y < 16; y++) for (let x = 18; x < 24; x++) if (Math.hypot(x - 20, y - 13) < 2.2) px(x, y, skin[4]);
    for (let y = 17; y < 24; y++) { px(14, y, beardR[1]); px(15, y, beardR[2]); }
  } else if (o.hair) {
    hairTop(o.hair === 'short' ? 17 : 20);
  }
  if (has('circlet')) { for (let x = 16; x < 33; x++) px(x, 15, R.gold[3]); px(24, 14, '#c8a0ff'); px(24, 15, '#ffffff'); }
  if (has('wreath')) for (let x = 14; x < 35; x += 2) { px(x, 12 + Math.round(Math.abs(x - 24) / 5), R.green[4]); px(x + 1, 13 + Math.round(Math.abs(x - 24) / 5), R.green[3]); }
  if (has('earring')) { px(15, 25, R.gold[4]); px(15, 26, R.gold[2]); }

  // Beiwerk vorne
  if (has('hammer')) { for (let y = 30; y < S; y++) { px(40, y, R.leather[3]); px(41, y, R.leather[1]); } for (let y = 28; y < 34; y++) for (let x = 36; x < 46; x++) px(x, y, pick(R.iron, 3 - (y - 28) / 3)); }
  if (has('quill')) { for (let i = 0; i < 10; i++) px(38 + i * 0.4, 36 - i, i > 6 ? '#f0e8e0' : '#c8c0b0'); }

  // Kontur
  const img = f.getImageData(0, 0, S, S).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < S && y < S && img[(y * S + x) * 4 + 3] > 0;
  const out = makeCanvas(S, S), g = out.getContext('2d');
  // Hintergrund
  const bg = BG[o.bg] ?? BG.village;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - 18, y + 0.5 - 16) / 34;
    const t = clamp(2.2 - d * 2.8 + (((x + y) & 1) && Math.abs((2.2 - d * 2.8) % 1 - 0.5) < 0.12 ? 0.5 : 0), 0, 2);
    g.fillStyle = bg[Math.round(t)]; g.fillRect(x, y, 1, 1);
  }
  if (has('lantern')) { const gr = g.createRadialGradient(8, 40, 1, 8, 40, 18); gr.addColorStop(0, 'rgba(255,200,110,0.8)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.fillRect(0, 22, 26, 26); }
  g.fillStyle = '#0a0508';
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) g.fillRect(x, y, 1, 1);
  g.drawImage(fig, 0, 0);
  if (has('lantern')) { g.fillStyle = R.iron[1]; g.fillRect(5, 38, 7, 9); g.fillStyle = '#ffe8a0'; g.fillRect(6, 40, 5, 5); g.fillStyle = '#fff8e0'; g.fillRect(7, 41, 2, 2); g.fillStyle = R.iron[2]; g.fillRect(7, 36, 3, 2); }
  return out;
}
