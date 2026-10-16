import { makeCanvas } from '../gfx/PixelCanvas.js';
import { tr } from '../i18n/index.js';

// Eigene 5px-Bitmap-Schrift: scharf bei jeder Ganzzahl-Skalierung,
// unabhängig von Browser-Fonts. Zeilen durch "|" getrennt.
const G = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
  M: '#...#|##.##|#.#.#|#...#|#...#', N: '#..#|##.#|#.##|#..#|#..#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|#.#|.##', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#...#|#...#|#.#.#|##.##|#...#', X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
  ' ': '..|..|..|..|..', '.': '.|.|.|.|#', ',': '.|.|.|#|#', '!': '#|#|#|.|#', '?': '##.|..#|.#.|...|.#.',
  ':': '.|#|.|#|.', '-': '...|...|###|...|...', '+': '...|.#.|###|.#.|...', '/': '..#|..#|.#.|#..|#..',
  "'": '#|#|.|.|.', '%': '#.#|..#|.#.|#..|#.#', '(': '.#|#.|#.|#.|.#', ')': '#.|.#|.#|.#|#.', 'x': '...|#.#|.#.|#.#|...',
  '·': '.|.|#|.|.', '>': '#..|.#.|..#|.#.|#..', '<': '..#|.#.|#..|.#.|..#',
  '¡': '#|.|#|#|#', '¿': '.#.|...|.#.|#..|.##', '«': '....|.#.#|#.#.|.#.#|....', '»': '....|#.#.|.#.#|#.#.|....',
};
// Buchstaben mit Akzent (Spanisch, Französisch): der Buchstabe bleibt 5 Pixel hoch, der Akzent sitzt mit einer
// Pixelzeile Abstand darüber (Ç: Cedille darunter). Großbuchstaben genügen, die Schrift zeichnet alles groß.
const ABOVE = { acute: ['..#', '.#.'], grave: ['#..', '.#.'], circ: ['.#.', '#.#'], uml: ['#.#'], tilde: ['.#.#', '#.#.'] };
const ACCENTS = {
  Á: ['A', 'acute'], À: ['A', 'grave'], Â: ['A', 'circ'], É: ['E', 'acute'], È: ['E', 'grave'], Ê: ['E', 'circ'], Ë: ['E', 'uml'],
  Í: ['I', 'acute'], Ì: ['I', 'grave'], Î: ['I', 'circ'], Ï: ['I', 'uml'], Ó: ['O', 'acute'], Ò: ['O', 'grave'], Ô: ['O', 'circ'],
  Ú: ['U', 'acute'], Ù: ['U', 'grave'], Û: ['U', 'circ'], Ñ: ['N', 'tilde'], Ÿ: ['Y', 'uml'],
  Ä: ['A', 'uml'], Ö: ['O', 'uml'], Ü: ['U', 'uml'],
};
// Ä Ö Ü ebenso (die gestauchte Form las sich als X); ß gibt es nicht, toUpperCase() macht daraus SS
for (const [ch, [b, a]] of Object.entries(ACCENTS)) {
  const w = G[b].split('|')[0].length;
  const acc = [...ABOVE[a], '.'.repeat(w)].map((r) => (r.length === w ? r : r.padStart(Math.floor((w + r.length) / 2), '.').padEnd(w, '.')));
  G[ch] = { rows: [...acc, ...G[b].split('|')], up: acc.length };
}
G.Ç = { rows: [...G.C.split('|'), '.#.'], up: 0 };
G.Œ = '.####|#.#..|#.##.|#.#..|.####';
// Geschützte Leerzeichen aus Zahlenformaten (fr: „50 000“, „16 %“)
G['\u00a0'] = G[' '];
G['\u202f'] = '.|.|.|.|.';
// Unbekannte Buchstaben mit Akzent: Grundbuchstabe statt Fragezeichen
const base = (ch) => ch.normalize('NFD')[0];

export class PixelFont {
  constructor() {
    this.glyphs = {};
    for (const [ch, def] of Object.entries(G)) {
      const r = typeof def === 'string' ? def.split('|') : def.rows;
      this.glyphs[ch] = { ch, w: r[0].length, rows: r, up: def.up ?? 0 };
    }
    this.cache = new Map();
  }

  #glyph(ch) { return this.glyphs[ch] ?? this.glyphs[base(ch)] ?? this.glyphs['?']; }

  #glyphCanvas(ch, color) {
    const key = ch + color;
    let c = this.cache.get(key);
    if (c) return c;
    const g = this.glyphs[ch];
    c = makeCanvas(g.w, g.rows.length);
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    g.rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === '#') ctx.fillRect(x, y, 1, 1); }));
    this.cache.set(key, c);
    return c;
  }

  // raw = true: nicht übersetzen (Spielernamen)
  measure(text, scale = 1, raw = false) {
    if (!raw) text = tr(String(text));
    let w = 0;
    for (const ch of text.toUpperCase()) w += (this.#glyph(ch).w + 1) * scale;
    return Math.max(0, w - scale);
  }

  // Pixel über der Grundhöhe (Akzente wie É), damit Aufrufer Platz lassen können
  ascent(text, raw = false) {
    let up = 0;
    for (const ch of (raw ? String(text) : tr(String(text))).toUpperCase()) up = Math.max(up, this.#glyph(ch).up);
    return up;
  }

  // outline: 1px-Rand ringsum (in Skalierungsstufen) – beste Lesbarkeit über
  // bewegtem, hellem Hintergrund (Schadenszahlen).
  draw(ctx, text, x, y, { color = '#ffffff', scale = 1, align = 'left', shadow = false, shadowColor = '#0b0710', outline = false, raw = false } = {}) {
    text = (raw ? String(text) : tr(String(text))).toUpperCase();
    const w = this.measure(text, scale, true);
    let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    y = Math.round(y);
    if (outline) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        this.draw(ctx, text, cx + ox * scale, y + oy * scale, { color: shadowColor, scale });
      }
    } else if (shadow) {
      this.draw(ctx, text, cx + scale, y + scale, { color: shadowColor, scale });
    }
    for (const ch of text) {
      const g = this.#glyph(ch);
      const img = this.#glyphCanvas(g.ch, color);
      ctx.drawImage(img, cx, y - g.up * scale, g.w * scale, g.rows.length * scale);
      cx += (g.w + 1) * scale;
    }
  }
}
