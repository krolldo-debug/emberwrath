import { h } from '../core/dom.js';
import { iconEl } from '../gfx/Icons.js';
import { seal, pennant, badge, embers } from './stufe50Art.js';

// ENTWURF – Einblendung „Stufe 50 ist da“ (drei Varianten zur Wahl: siegel, wimpel, band).
// Bilder in Kunstpixeln; --u = CSS-Pixel je Kunstpixel, so gewählt, dass ein Kunstpixel auf ganze Gerätepixel fällt.

const STYLE = `
.s50 { --u: 2; --ink: #120610; --gold: #ffd27a; --gold-d: #c8822e; --peach: #f6c294; --rose: #e89a88; --text: #ece8f8; --muted: #b4acd0;
  position: absolute; z-index: 40; pointer-events: auto; font: 13px/1.35 var(--ef-font); color: var(--text); }
.s50 canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; width: calc(var(--w) * var(--u) * 1px); height: calc(var(--h) * var(--u) * 1px); }
.s50-ribbon { display: inline-block; padding: 6px 14px 5px; font: 700 14px/1 var(--ef-font); letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap;
  color: var(--gold); background: #1a0c10;
  box-shadow: inset 0 0 0 2px #0a0406, inset 0 0 0 4px var(--gold-d), inset 0 0 0 6px #4a1c14, inset 0 -6px 0 #2a1014, 4px 4px 0 #0a0406;
  text-shadow: 1px 0 #3a0e06, -1px 0 #3a0e06, 0 1px #3a0e06, 0 -1px #3a0e06, 0 2px #b4380e; }
.s50-x { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 0; cursor: pointer; font: 700 15px/1 var(--ef-font); color: var(--muted);
  background: #1a0f16; box-shadow: inset 0 0 0 2px #0a0608, inset 0 0 0 4px #4a2034; }
.s50-go { min-height: 36px; padding: 0 14px; border: 0; border-radius: 0; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;
  font: 700 13px/1 var(--ef-font); color: #1a1030; background: var(--peach); box-shadow: inset 0 0 0 2px #0a0608, inset 0 3px 0 #fff0d8, inset 0 -3px 0 var(--rose); }
.s50-fx { position: absolute; pointer-events: none; }

/* A Siegel: oben mittig, Plakette, Band, eine Zeile, Knopf */
.s50-a { left: 50%; top: max(6px, env(safe-area-inset-top, 0px)); transform: translateX(-50%); display: grid; justify-items: center; }
.s50-a .s50-ribbon { margin-top: calc(-7 * var(--u) * 1px); position: relative; }
.s50-a .s50-card { margin-top: 6px; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 12px; background: #120a10;
  box-shadow: inset 0 0 0 2px #0a0608, inset 0 0 0 4px #4a2034, 4px 4px 0 rgba(10, 4, 6, 0.6); }
.s50-a .s50-sub { margin: 0; max-width: 220px; color: var(--text); font-size: 12px; }

/* B Wimpel: hängt vom oberen Rand, Band quer über dem Tuch, Knopf unter der Spitze */
.s50-b { left: 50%; top: 0; transform: translateX(-50%); display: grid; justify-items: center; }
.s50-b .s50-ribbon { position: absolute; top: calc(48 * var(--u) * 1px); left: 50%; transform: translateX(-50%); }
.s50-b .s50-row { display: flex; gap: 6px; margin-top: 2px; }
.s50-b .s50-x { position: absolute; top: calc(8 * var(--u) * 1px); left: calc(100% + 6px); width: 32px; height: 32px; }
.s50-b .s50-sub { position: absolute; top: calc(62 * var(--u) * 1px + 30px); left: 50%; transform: translateX(-50%); white-space: nowrap; margin: 0; padding: 3px 8px;
  font-size: 12px; color: var(--text); background: #120a10; box-shadow: inset 0 0 0 2px #0a0608, inset 0 0 0 3px #4a2034; }

/* C Glutband: schmales Band unter der oberen Leiste */
.s50-c { left: 50%; top: calc(max(6px, env(safe-area-inset-top, 0px)) + 84px); transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
  padding: 6px 8px 6px 6px; background: #120a10; border: 8px solid transparent; border-image: var(--s50-frame) 10 fill / 8px stretch; background-clip: padding-box; }
.s50-c .s50-txt { display: grid; gap: 2px; min-width: 0; }
.s50-c .s50-title { margin: 0; font: 700 19px/1.1 var(--ef-font-title); color: var(--gold); letter-spacing: 0.03em; text-shadow: 0 2px 0 #3a0e06; white-space: nowrap; }
.s50-c .s50-sub { margin: 0; font-size: 12px; color: var(--muted); white-space: nowrap; }
.s50-c .s50-acts { display: flex; gap: 6px; margin-left: 6px; }
`;

function unit(want) {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.round(want * dpr)) / dpr;
}
function art(c) {
  c.style.setProperty('--w', String(c.width));
  c.style.setProperty('--h', String(c.height));
  c.setAttribute('aria-hidden', 'true');
  return c;
}

export function stufe50Draft(session, variant, { frame } = {}) {
  if (!document.getElementById('s50-style')) { const st = document.createElement('style'); st.id = 's50-style'; st.textContent = STYLE; document.head.append(st); }
  const close = () => root.remove();
  const go = h('button.s50-go', { type: 'button', onclick: close }, iconEl('map', 18), h('span', 'Weg zeigen'));
  const x = h('button.s50-x', { type: 'button', 'aria-label': 'Schließen', onclick: close }, '✕');
  const title = 'Stufe 50 ist da';
  const sub = 'Sternenglut ist offen: zwei Gebiete, drei Dungeons und neue Beute.';
  const small = innerHeight < 520;
  let root;
  if (variant === 'siegel') {
    const img = art(seal());
    root = h('div.s50.s50-a', { role: 'status' },
      img, h('span.s50-ribbon', title),
      h('div.s50-card', h('p.s50-sub', sub), go, x));
    root.style.setProperty('--u', String(unit(small ? 2 : 2.67)));
  } else if (variant === 'wimpel') {
    const img = art(pennant());
    root = h('div.s50.s50-b', { role: 'status' },
      img, h('span.s50-ribbon', title), h('div.s50-row', go), x);
    root.style.setProperty('--u', String(unit(small ? 1.34 : 2)));
  } else {
    const img = art(badge());
    root = h('div.s50.s50-c', { role: 'status' },
      img, h('div.s50-txt', h('p.s50-title', title), h('p.s50-sub', sub)),
      h('div.s50-acts', go, x));
    root.style.setProperty('--u', String(unit(small ? 1.34 : 2)));
    if (frame) root.style.setProperty('--s50-frame', `url(${frame})`);
  }
  session.game.ui.toasts.append(root);
  return root;
}

export { embers };
