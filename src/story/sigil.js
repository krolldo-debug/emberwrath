import { makeCanvas } from '../gfx/PixelCanvas.js';

// Zeichen der Flammenkrone (Story-Clips): drei Flammen über einem glühenden Reif, von Hand gezeichnet
// (linke Hälfte + Mittelspalte, gespiegelt). Harte Glutstufen, kein Alpha.
// burnSigil(t) liefert das Zeichen „eingebrannt“ bis zum Anteil t (0..1): Pixel entflammen von unten nach oben,
// frisch entflammte Pixel leuchten einen Moment weißglühend.
const HALF = [
  '............o',
  '...........oe',
  '...........of',
  '..........oef',
  '..........oey',
  '....o....oefy',
  '....oo...oefy',
  '...oeo..oefyw',
  '...oefo.oefyw',
  '...oefo.oefyw',
  'o.oefyfooefyw',
  'ooeefyfoefyyw',
  'oeefyyfoefyyw',
  'oefyyyfoefyww',
  'ogggggggggggg',
  'oeeeeyeeeeeey',
  'oeeeywyeeeeyw',
  'orrrryrrrrrry',
  'obbbbbbbbbbbb',
  '.oooooooooooo',
];
const PAL = { o: '#2a0608', r: '#7a1410', e: '#c8401a', f: '#f08a24', y: '#ffd25a', w: '#fff4c0', g: '#ffb43a', b: '#4a0c0a' };
const ROWS = HALF.map((r) => r + [...r.slice(0, -1)].reverse().join(''));
export const SIGIL_W = ROWS[0].length, SIGIL_H = ROWS.length;

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const REVEAL = ROWS.map((row, y) => [...row].map((ch, x) => (ch === '.' ? 2 : (1 - y / SIGIL_H) * 0.8 + hash(x, y) * 0.2)));

const cache = new Map();
export function burnSigil(t) {
  const step = Math.max(0, Math.min(1, Math.round(t * 40) / 40));
  let c = cache.get(step);
  if (c) return c;
  c = makeCanvas(SIGIL_W, SIGIL_H);
  const x2 = c.getContext('2d');
  ROWS.forEach((row, y) => [...row].forEach((ch, x) => {
    const r = REVEAL[y][x];
    if (r > step) return;
    x2.fillStyle = step < 1 && step - r < 0.06 ? PAL.w : PAL[ch];
    x2.fillRect(x, y, 1, 1);
  }));
  cache.set(step, c);
  return c;
}
