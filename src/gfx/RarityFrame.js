import { PixelCanvas } from './PixelCanvas.js';

// Gezeichnete Seltenheitsrahmen für Item-Icons (11.10.): je seltener, desto prächtiger.
//   ungewöhnlich  schlichte grüne Kante mit Licht oben links
//   selten        blaue Doppelkante, Winkel und Niete in jeder Ecke
//   episch        violette Kante mit abgeschrägten Ecken und Edelstein
//   legendär      goldene Kante, große Glutsteine mit Fassung und Zacken
// Ein Rahmen ist ein 16×16-Pixelbild, das per CSS border-image (9-Slice, 7 px Ecken) ganzzahlig
// vergrößert wird (--fpx: 1 oder 2 CSS-px je Bildpunkt). Harte Kanten, kein Alpha-Schein.
// installRarityFrames() legt die Bilder einmal als CSS-Variablen --ef-frame-<seltenheit> an (ui/theme.css).

const N = 16, SLICE = 7, CUT = '#05030a';

// d = dunkel (innere Schattenlinie), b = Grundfarbe, l = hell, h = Glanz, g/G = Edelstein dunkel/hell
const PAL = {
  uncommon: { d: '#0a1a0a', b: '#3e9a3a', l: '#7ad870', h: '#c8ffb8' },
  rare: { d: '#081430', b: '#3a7ad8', l: '#7ab0ff', h: '#d0e8ff', g: '#2a5ad0', G: '#f0faff' },
  epic: { d: '#16062a', b: '#8a3ae0', l: '#c888ff', h: '#f6e6ff', g: '#c0207a', G: '#ff8ad0' },
  legendary: { d: '#2a0e02', b: '#c8641a', l: '#ffb040', h: '#ffe08a', g: '#c82a08', G: '#ff8a3a' },
};

// Kante von außen nach innen: oben/links (Licht) und unten/rechts (Schatten)
const EDGE = {
  uncommon: { tl: ['l', 'd'], br: ['b', 'd'] },
  rare: { tl: ['l', 'b', 'd'], br: ['b', 'b', 'd'] },
  epic: { tl: ['l', 'b', 'd'], br: ['b', 'b', 'd'] },
  legendary: { tl: ['h', 'l', 'd'], br: ['l', 'b', 'd'] },
};

// Verzierung der Ecke oben links [x, y, Farbe]; '.' = ausgeschnitten (Fensterschwarz, liest sich als Kerbe). Wird in alle Ecken gespiegelt.
const ORNAMENT = {
  uncommon: [],
  // Eckbeschlag mit Niete
  rare: [[0, 0, 'h'], [1, 1, 'h'], [2, 1, 'l'], [3, 1, 'l'], [1, 2, 'l'], [1, 3, 'l'], [2, 2, 'G'], [3, 2, 'b'], [2, 3, 'b'], [3, 3, 'd'], [4, 2, 'd'], [2, 4, 'd']],
  // Abgeschrägte Ecke, Edelstein mit Fassung
  epic: [
    [0, 0, '.'], [1, 0, 'd'], [0, 1, 'd'], [1, 1, 'l'],
    [3, 3, 'G'], [4, 3, 'g'], [3, 4, 'g'], [4, 4, 'g'], [5, 3, 'l'], [3, 5, 'l'], [5, 4, 'd'], [4, 5, 'd'], [5, 5, 'd'],
  ],
  // Gestufte Ecke, großer Glutstein in goldener Fassung
  legendary: [
    [0, 0, '.'], [1, 0, '.'], [0, 1, '.'], [2, 0, 'd'], [0, 2, 'd'], [1, 1, 'd'], [2, 1, 'h'], [1, 2, 'h'],
    [3, 3, 'h'], [4, 3, 'l'], [5, 3, 'l'], [3, 4, 'l'], [3, 5, 'l'],
    [4, 4, 'G'], [5, 4, 'g'], [4, 5, 'g'], [5, 5, 'g'],
    [6, 4, 'b'], [4, 6, 'b'], [6, 5, 'd'], [5, 6, 'd'], [6, 6, 'd'],
  ],
};

function drawFrame(rarity) {
  const pal = PAL[rarity], edge = EDGE[rarity];
  const p = new PixelCanvas(N, N);
  const col = (k) => pal[k] ?? pal.b;
  // Kanten: oben/links mit Licht, unten/rechts mit Schatten; Ecken gehören der jeweils äußeren Linie
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dt = y, dl = x, db = N - 1 - y, dr = N - 1 - x;
      const m = Math.min(dt, dl, db, dr);
      const list = m === dt || m === dl ? (m === db || m === dr ? (dt <= db ? edge.tl : edge.br) : edge.tl) : edge.br;
      if (m < list.length) p.px(x, y, col(list[m]));
    }
  }
  // Ecken verzieren (gespiegelt)
  for (const [x, y, k] of ORNAMENT[rarity]) {
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = fx ? N - 1 - x : x, py = fy ? N - 1 - y : y;
      p.px(px, py, k === '.' ? CUT : col(k));
    }
  }
  return p.canvas.toDataURL();
}

let installed = false;
export function installRarityFrames() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const root = document.documentElement.style;
  for (const r of Object.keys(PAL)) root.setProperty(`--ef-frame-${r}`, `url(${drawFrame(r)})`);
}

export const FRAME_SLICE = SLICE;
