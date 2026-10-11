import { PixelCanvas } from './PixelCanvas.js';

// Gezeichnete Seltenheitsrahmen für Item-Icons (11.10.): je seltener, desto prächtiger.
//   ungewöhnlich  schlichte grüne Kante mit Licht oben links
//   selten        blaue Doppelkante, Eckbeschlag mit Niete
//   episch        violette Kante mit Kerbe und gefasstem Edelstein
//   legendär      breite Goldkante mit Glutrand innen, gestufte Ecke, großer Rubin (4×4) in goldener Fassung
// Ein Rahmen ist ein 16×16-Pixelbild, das per CSS border-image (9-Slice, 7 px Ecken) ganzzahlig
// vergrößert wird: --fpx = CSS-px je Bildpunkt, derselbe Faktor wie Icon und Effekte (gfx/Icons.js itemIconEl).
// Nur Palettenfarben, keine Transparenzstufen. Episch und legendär haben ein zweites, aufgehelltes Bild
// (--ef-frame-<seltenheit>-lit), das in festen Stufen ein- und ausgeblendet wird (ui/theme.css).
// installRarityFrames() legt die Bilder einmal als CSS-Variablen --ef-frame-<seltenheit> an.

const N = 16, CUT = '#05030a';

// d = dunkel (innere Schattenlinie), b = Grundfarbe, l = hell, h = Glanz, g/G = Edelstein dunkel/hell, w = Edelstein-Funke
const PAL = {
  uncommon: { d: '#0a1a0a', b: '#3e9a3a', l: '#7ad870', h: '#c8ffb8' },
  rare: { d: '#081430', b: '#3a7ad8', l: '#7ab0ff', h: '#d0e8ff', g: '#2a5ad0', G: '#f0faff' },
  epic: { d: '#16062a', b: '#8a3ae0', l: '#c888ff', h: '#f6e6ff', g: '#a0186a', G: '#ff7ad0', w: '#ffe0f4' },
  // e = Glutrand innen, D = tiefster Steinschatten
  legendary: { d: '#2a0a02', b: '#c85a0c', l: '#ff9a1a', h: '#ffd860', e: '#e0400c', g: '#a0081c', G: '#ff2a3a', w: '#ffe6e6', D: '#3a0210' },
};
// Aufgehellt: jede Farbe eine Stufe heller (gleiche Palette)
const LIT = { d: 'b', b: 'l', l: 'h', h: 'h', e: 'l', g: 'G', G: 'w', w: 'w', D: 'g' };

// Kante von außen nach innen: oben/links (Licht) und unten/rechts (Schatten)
const EDGE = {
  uncommon: { tl: ['l', 'd'], br: ['b', 'd'] },
  rare: { tl: ['l', 'b', 'd'], br: ['b', 'b', 'd'] },
  epic: { tl: ['l', 'b', 'd'], br: ['b', 'b', 'd'] },
  legendary: { tl: ['h', 'l', 'b', 'd', 'e'], br: ['l', 'b', 'b', 'd', 'e'] },
};

// Verzierung der Ecke oben links [x, y, Farbe]; '.' = ausgeschnitten (Fensterschwarz, liest sich als Kerbe).
// Wird in alle vier Ecken gespiegelt. Nur Spalten/Zeilen 0–6 (die Mitte des 9-Slice wird gedehnt).
const ORNAMENT = {
  uncommon: [],
  // Eckbeschlag mit Niete
  rare: [[0, 0, 'h'], [1, 1, 'h'], [2, 1, 'l'], [3, 1, 'l'], [1, 2, 'l'], [1, 3, 'l'], [2, 2, 'G'], [3, 2, 'b'], [2, 3, 'b'], [3, 3, 'd'], [4, 2, 'd'], [2, 4, 'd']],
  // Kerbe, Edelstein 2×2 in heller Fassung
  epic: [
    [0, 0, '.'], [1, 0, 'd'], [0, 1, 'd'], [1, 1, 'l'],
    [3, 3, 'w'], [4, 3, 'G'], [3, 4, 'G'], [4, 4, 'g'], [5, 3, 'l'], [3, 5, 'l'], [5, 4, 'd'], [4, 5, 'd'], [5, 5, 'd'], [2, 2, 'h'],
  ],
  // Legendär: ganze Ecke als Bild (unten), weil der Stein über mehrere Kantenlinien reicht
  legendary: [],
};
// Ecke oben links als 7×7-Bild (Zeilen von oben): gestufte Kerbe, Goldfassung, Rubin 4×4 mit Glanz oben links
const CORNER = {
  legendary: [
    '...dhhh',
    '..dhlll',
    '.dhhhhh',
    'dlhwwGG',
    'hlhwGGg',
    'hlhGGgg',
    'hlhGggD',
  ],
};

function drawFrame(rarity, lit) {
  const pal = PAL[rarity], edge = EDGE[rarity];
  const p = new PixelCanvas(N, N);
  const col = (k) => pal[lit ? LIT[k] ?? k : k] ?? pal[k] ?? pal.b;
  // Kanten: oben/links mit Licht, unten/rechts mit Schatten; Ecken gehören der jeweils äußeren Linie
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dt = y, dl = x, db = N - 1 - y, dr = N - 1 - x;
      const m = Math.min(dt, dl, db, dr);
      const list = m === dt || m === dl ? (m === db || m === dr ? (dt <= db ? edge.tl : edge.br) : edge.tl) : edge.br;
      if (m < list.length) p.px(x, y, col(list[m]));
    }
  }
  const orn = [...ORNAMENT[rarity]];
  CORNER[rarity]?.forEach((line, y) => [...line].forEach((k, x) => orn.push([x, y, k])));
  for (const [x, y, k] of orn) {
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      p.px(fx ? N - 1 - x : x, fy ? N - 1 - y : y, k === '.' ? CUT : col(k));
    }
  }
  return p.canvas.toDataURL();
}

let installed = false;
export function installRarityFrames() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const root = document.documentElement.style;
  for (const r of Object.keys(PAL)) {
    root.setProperty(`--ef-frame-${r}`, `url(${drawFrame(r, false)})`);
    if (r === 'epic' || r === 'legendary') root.setProperty(`--ef-frame-${r}-lit`, `url(${drawFrame(r, true)})`);
  }
}
