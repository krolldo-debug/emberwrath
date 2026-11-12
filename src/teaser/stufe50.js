import { h } from '../core/dom.js';
import { seal, SEAL_FRAMES } from './stufe50Art.js';

// Einblendung „Stufe 50 ist da“ (vom Nutzer am 12.11. gewählter Entwurf A „Siegel“, ohne Knopf „Weg zeigen“).
// Klein oben in der Mitte, kein Fenster: Siegel mit glühender 50, Band, ein Satz, Schließen. Blendet sich nach LIFE
// Sekunden von selbst aus. Wem und wann sie erscheint, steuert index.js (einmal je Bestandscharakter).
// Auftakt in harten Stufen: Siegel fällt ein, Lichtblitz, Band rückt ein, Satz erscheint; danach funkeln die Sterne.

const LIFE = 12;          // s bis zum Ausblenden
const TWINKLE = 0.24;     // s je Bild der Ruhe-Animation
const OUT = 0.3;          // s Ausblenden (CSS .s50-out)

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// CSS-Pixel je Kunstpixel, so dass ein Kunstpixel auf ganze Gerätepixel fällt (Handy quer etwa 2, großer Bildschirm 3)
function unit() {
  const dpr = window.devicePixelRatio || 1, want = window.innerHeight >= 900 ? 3 : 2;
  return Math.max(1, Math.round(want * dpr)) / dpr;
}

let frames = null;
const frame = (i) => (frames ??= [])[i] ??= seal(i);

export function stufe50Notice(session, { level = 1 } = {}) {
  const cv = document.createElement('canvas');
  const first = frame(0);
  cv.width = first.width; cv.height = first.height;
  cv.className = 's50-seal';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.setProperty('--w', String(cv.width));
  cv.style.setProperty('--h', String(cv.height));
  const ctx = cv.getContext('2d');
  const show = (i) => { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(frame(i), 0, 0); };
  show(0);

  let t = 0, tw = 0, k = 0, gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    root.classList.add('s50-out');
    setTimeout(() => root.remove(), OUT * 1000);
  };
  const sub = level >= 40
    ? 'Sternenglut ist offen: zwei Gebiete, drei Dungeons und neue Beute.'
    : 'Ab Stufe 40 wartet Sternenglut: zwei Gebiete, drei Dungeons und neue Beute.';
  const root = h('div.ef-notice.s50', { role: 'status', 'aria-label': 'Stufe 50 ist da' },
    h('div.s50-top', cv, h('div.s50-flash', { 'aria-hidden': 'true' })),
    h('span.s50-ribbon', 'Stufe 50 ist da'),
    h('div.s50-card',
      h('p.s50-sub', sub),
      h('button.s50-x', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen', onclick: close }, '✕')));
  root.style.setProperty('--u', String(unit()));
  if (reduced()) root.classList.add('s50-still');
  session.game.ui.toasts.append(root);
  // Nächstes Bild erst nach dem Einfügen: so läuft der Auftakt (CSS-Animationen) sicher von vorn
  requestAnimationFrame(() => root.classList.add('show'));

  return {
    root,
    close,
    get open() { return !gone; },
    // dt in Sekunden; aus dem Sitzungssystem in index.js
    update(dt) {
      if (gone) return;
      t += dt;
      if (t >= LIFE) { close(); return; }
      if (reduced() || t < 1) return;
      if ((tw += dt) >= TWINKLE) { tw = 0; k = (k + 1) % SEAL_FRAMES; show(k); }
    },
  };
}
