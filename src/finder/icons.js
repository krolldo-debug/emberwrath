// Pixel-Symbole der Gruppensuche (im Stil der Spielsymbole aus gfx/Icons.js, aber hier gezeichnet,
// damit der Bereich keine fremden Dateien braucht). Ergebnis: Data-URL für <img class="ef-icon">.
const cache = new Map();

const PAL = { o: '#0b0710', g: '#e8c25a', d: '#8a5a18', h: '#fff4c0', s: '#9ea9bf', t: '#454c5e', w: '#e2e8f2', r: '#98182a', b: '#5a3626', k: '#2c1c36', e: '#f07a1c', p: '#6a2cb0' };

// 16×16, Zeichen = Farbe aus PAL, '.' = leer
const ART = {
  // Drei Helme nebeneinander: die Gruppe
  group: [
    '................',
    '................',
    '.......oo.......',
    '......oggo......',
    '..oo.oghhgo.oo..',
    '.ossooggggoosso.',
    'oswwsoooooosswso',
    'osssso.oo.osssso',
    'ottto.oggo.ottto',
    '.ooo.oghhgo.ooo.',
    '..oo.ogggg.oo...',
    '.orro.oooo.orro.',
    'orrrrooddoorrrro',
    'orrrrodddd.orrro',
    '.oooo.oooo..ooo.',
    '................',
  ],
  // Schild: Verteidiger
  tank: [
    '................',
    '..oooooooooooo..',
    '.oggggggggggggo.',
    '.ogssssssssssgo.',
    '.ogswwsssssssgo.',
    '.ogswssssrrssgo.',
    '.ogsssssrrrrsgo.',
    '.ogsssssrrrrsgo.',
    '.ogssssssrrssgo.',
    '.ogssssssssssgo.',
    '..ogssssssssgo..',
    '...ogssssssgo...',
    '....ogssssgo....',
    '.....oggggo.....',
    '......oooo......',
    '................',
  ],
  // Schwert: Schaden
  dps: [
    '.............oo.',
    '............owo.',
    '...........owso.',
    '..........owso..',
    '.........owso...',
    '........owso....',
    '.......owso.....',
    '..oo..owso......',
    '..ogooowso......',
    '...ogowso.......',
    '....oggo........',
    '...obogo........',
    '..obo.ogo.......',
    '.obo...oo.......',
    '.oo.............',
    '................',
  ],
  // Söldner: Münze mit Schild
  merc: [
    '................',
    '.....oooooo.....',
    '...ooggggggoo...',
    '..oggddddddggo..',
    '.ogddhggggddgo..',
    '.ogdhgggggdgo...',
    'ogddgoooooddgo..',
    'ogddgoggogddgo..',
    'ogddgoggogddgo..',
    'ogdddoggoddgo...',
    '.ogdddooddgo....',
    '.ogddddddggo....',
    '..oggddgggo.....',
    '...ooggggoo.....',
    '.....oooo.......',
    '................',
  ],
};

export function finderIcon(id, scale = 2) {
  const key = `${id}|${scale}`;
  let url = cache.get(key);
  if (url) return url;
  const art = ART[id] ?? ART.group;
  const c = document.createElement('canvas');
  c.width = 16 * scale; c.height = 16 * scale;
  const ctx = c.getContext('2d');
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = PAL[ch] ?? '#ff00ff';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  url = c.toDataURL();
  cache.set(key, url);
  return url;
}
