import { makeCanvas } from '../gfx/PixelCanvas.js';

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
  Ä: '#.#|.#.|#.#|###|#.#', Ö: '#.#|...|###|#.#|###', Ü: '#.#|...|#.#|#.#|###', ß: '##.|#.#|##.|#.#|###',
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
  ' ': '..|..|..|..|..', '.': '.|.|.|.|#', ',': '.|.|.|#|#', '!': '#|#|#|.|#', '?': '##.|..#|.#.|...|.#.',
  ':': '.|#|.|#|.', '-': '...|...|###|...|...', '+': '...|.#.|###|.#.|...', '/': '..#|..#|.#.|#..|#..',
  "'": '#|#|.|.|.', '%': '#.#|..#|.#.|#..|#.#', '(': '.#|#.|#.|#.|.#', ')': '#.|.#|.#|.#|#.', 'x': '...|#.#|.#.|#.#|...',
  '·': '.|.|#|.|.', '>': '#..|.#.|..#|.#.|#..', '<': '..#|.#.|#..|.#.|..#',
};

export class PixelFont {
  constructor() {
    this.glyphs = {};
    for (const [ch, rows] of Object.entries(G)) {
      const r = rows.split('|');
      this.glyphs[ch] = { w: r[0].length, rows: r };
    }
    this.cache = new Map();
  }

  #glyphCanvas(ch, color) {
    const key = ch + color;
    let c = this.cache.get(key);
    if (c) return c;
    const g = this.glyphs[ch] ?? this.glyphs['?'];
    c = makeCanvas(g.w, 5);
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    g.rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === '#') ctx.fillRect(x, y, 1, 1); }));
    this.cache.set(key, c);
    return c;
  }

  measure(text, scale = 1) {
    let w = 0;
    for (const ch of text.toUpperCase()) w += ((this.glyphs[ch] ?? this.glyphs['?']).w + 1) * scale;
    return Math.max(0, w - scale);
  }

  // outline: 1px-Rand ringsum (in Skalierungsstufen) – beste Lesbarkeit über
  // bewegtem, hellem Hintergrund (Schadenszahlen).
  draw(ctx, text, x, y, { color = '#ffffff', scale = 1, align = 'left', shadow = false, shadowColor = '#0b0710', outline = false } = {}) {
    text = String(text).toUpperCase();
    const w = this.measure(text, scale);
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
      const g = this.glyphs[ch] ?? this.glyphs['?'];
      const img = this.#glyphCanvas(this.glyphs[ch] ? ch : '?', color);
      ctx.drawImage(img, cx, y, g.w * scale, 5 * scale);
      cx += (g.w + 1) * scale;
    }
  }
}
