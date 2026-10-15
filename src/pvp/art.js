import { TIERS } from './rules.js';

// Ligawappen der Glutarena (16×16 Pixel, wie die Symbole der Gruppensuche): Schild mit gekreuzten Klingen in der
// Farbe der Liga. Höhere Ligen bekommen Zacken, der Glutmeister eine Flamme. Ergebnis: Data-URL.
const cache = new Map();

const SHIELD = [
  '................',
  '.oooooooooooooo.',
  '.ommmmmmmmmmmmo.',
  '.omllllllllllmo.',
  '.omlwlllllwllmo.',
  '.omllwlllwlllmo.',
  '.omlllwlwllllmo.',
  '.omllllwlllllmo.',
  '.omlllwlwllllmo.',
  '.omllwlllwlllmo.',
  '..omlllllllmmo..',
  '..omddllllddmo..',
  '...omddlldmmo...',
  '....ommddmmo....',
  '.....ommmmo.....',
  '......oooo......',
];
const CROWN = ['..o..o..o..o..o.', '.omoomoomoomoomo'];
const FLAME = ['......oeeo......', '.....oehheo.....'];

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export function tierEmblem(tierId, scale = 2) {
  const key = `${tierId}|${scale}`;
  let url = cache.get(key);
  if (url) return url;
  const i = Math.max(0, TIERS.findIndex((t) => t.id === tierId));
  const t = TIERS[i];
  const pal = { o: '#0b0710', m: shade(t.color, 0.55), l: t.color, d: shade(t.color, 0.75), w: '#f4eedd', e: '#f07a1c', h: '#ffe08a' };
  const art = SHIELD.map((r) => r);
  if (i >= 3) { art[0] = CROWN[0]; art[1] = CROWN[1].slice(0, 16); }
  if (i >= 5) { art[0] = FLAME[0]; art[1] = '.oooooehheooooo.'; }
  const c = document.createElement('canvas');
  c.width = 16 * scale; c.height = 16 * scale;
  const ctx = c.getContext('2d');
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = pal[ch] ?? '#ff00ff';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  url = c.toDataURL();
  cache.set(key, url);
  return url;
}
