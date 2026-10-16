import { h } from '../core/dom.js';
import { lang } from '../i18n/index.js';
import { frameUrl, pixelTitle } from './pixelFrame.js';

// Kapitelende (quest.finale, z. B. Ignaroth auf Stufe 20): eigene Ansage statt des Stufen-Banners.
// Gezeichneter Rahmen (pixelFrame.js), Flammenkrone als Wappen, harte Strahlen nur über dem Wappen (wenige Farbstufen,
// kein Alpha), Titel in der Bitmap-Schrift. Während sie läuft, hält ui/Toasts.js Meldungen zurück und das Spiel
// blendet Hinweise und Systemzeilen aus (Klasse .ef-finale an #ui, theme.css).
export const FINALE_SHOW = 3.4;

// Flammenkrone 17 × 12 als Wappen: Reif mit drei Zacken, Glutsteine, harte Kontur
function crestCanvas() {
  const W = 17, H = 12, m = Array.from({ length: H }, () => new Array(W).fill(''));
  for (let y = 7; y <= 10; y++) for (let x = 2; x <= 14; x++) m[y][x] = y === 7 ? 'l' : y === 10 ? 'd' : 'g';   // Reif
  for (const [cx, top, half] of [[4, 2, 2], [8, 1, 2], [12, 2, 2]]) {                                          // Zacken
    for (let y = top; y < 7; y++) {
      const w = Math.round(((y - top) / (7 - top)) * half);
      for (let x = cx - w; x <= cx + w; x++) m[y][x] = x === cx - w ? 'l' : x === cx + w ? 'd' : 'g';
    }
    m[top][cx] = 'e'; m[top - 1][cx] = 'w';                                                                   // Glut auf der Spitze
  }
  for (const [x, c] of [[5, 'e'], [8, 'w'], [11, 'e']]) { m[8][x] = c; m[9][x] = 'e'; }                     // Steine im Reif
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d'), pal = { l: '#fff0b0', g: '#e8b84a', d: '#9a6420', e: '#ff6a2a', w: '#ffd890', k: '#14060a' };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ch = m[y][x];
    if (!ch && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => m[y + j]?.[x + i] && m[y + j][x + i] !== 'k')) ch = 'k';
    if (ch) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); }
  }
  return c;
}

// Strahlenfächer 61 × 20 über dem Wappen: 7 Strahlen, zwei Farbstufen, harte Kanten
function raysCanvas() {
  const W = 61, H = 20, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d'), ox = 30, oy = H + 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = Math.atan2(oy - y, x - ox) * 180 / Math.PI;   // 0° rechts, 90° oben
    const r = Math.hypot(x - ox, oy - y);
    if (r < 7 || r > 31) continue;
    const k = ((a - 18) % 24 + 24) % 24;                   // Strahl alle 24°, Breite 8°
    if (a < 16 || a > 164 || k > 8) continue;
    ctx.fillStyle = r > 23 ? '#c8761c' : k < 2 || k > 6 ? '#e8a23a' : '#ffd66a';
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

const px = (cv, cls) => { const e = h(`canvas.${cls}`); e.width = cv.width; e.height = cv.height; e.getContext('2d').drawImage(cv, 0, 0); e.style.setProperty('--w', cv.width); e.style.setProperty('--h', cv.height); return e; };

export class Finale {
  constructor(session) {
    this.s = session;
    this.rays = px(raysCanvas(), 'fn-rays');
    this.crest = px(crestCanvas(), 'fn-crest');
    this.title = h('canvas.fn-title');
    this.sub = h('div.fn-sub');
    this.el = h('div.fn', { role: 'status', 'aria-live': 'polite' },
      h('div.fn-top', this.rays, this.crest), h('div.fn-card', this.title, this.sub));
    this.el.style.setProperty('--fn-frame', `url(${frameUrl(3)})`);
    this.el.style.setProperty('--fn-frame2', `url(${frameUrl(2)})`);
    this.left = 0;
  }

  get showing() { return this.left > 0; }

  show({ title, sub }) {
    const c = pixelTitle(this.s.game.font, title, { color: '#ffd66a', light: '#fff0b0', outline: '#14060a' });
    this.title.width = c.width; this.title.height = c.height;
    this.title.getContext('2d').drawImage(c, 0, 0);
    this.title.style.setProperty('--w', c.width); this.title.style.setProperty('--h', c.height);
    this.title.setAttribute('aria-label', title);
    this.title.lang = lang();
    this.sub.textContent = sub ?? '';
    this.el.classList.remove('show');
    void this.el.offsetWidth;   // Animation neu starten
    this.el.classList.add('show');
    this.s.game.ui.root?.classList.add('ef-finale');
    this.left = FINALE_SHOW;
  }

  update(dt) {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) { this.el.classList.remove('show'); this.s.game.ui.root?.classList.remove('ef-finale'); }
  }

  dispose() { this.s.game.ui.root?.classList.remove('ef-finale'); }
}
