import { h } from '../core/dom.js';
import { iconEl } from '../gfx/Icons.js';
import { fineRes } from '../gfx/Fine.js';
import { createYsgarnSprites, createKaldrisSprites, createYsmeineSprites } from '../sprites/star_bosses.js';
import { getMountSprites } from '../sprites/mounts.js';
import { R, vistaStage, drawFigure, wordmark } from './art.js';

// Fenster „Sternenglut“: Vorschau auf die Erweiterung. Öffnet an der Sternentafel in jeder Stadt und einmal nach dem
// Anmelden. Oben die Bühne (drei Bosse auf einer Insel im Morgenrot, Reittiere, Sternhafen fern), darunter Text und
// fünf Punkte, unten das Häkchen „Beim Anmelden nicht mehr zeigen“. Kein Datum, nur „Bald“.
// Bilder sind Canvas im Weltraster (art.js), CSS zeigt sie mit --px Bildschirmpixeln je Weltpixel.
const FEATS = [
  { icon: 'crown_fallen', title: 'Sternhafen' },
  { icon: 'map', title: 'Zwei neue Gebiete' },
  { icon: 'charm_skull', title: 'Drei neue Bosse' },
  { icon: 'mount_sky_ray', title: 'Drei neue Reittiere' },
  { icon: 'gem_sapphire', title: 'Bis Stufe 50' },
];
const BOSSES = [
  { name: 'Ysgarn', make: createYsgarnSprites, x: 92 },
  { name: 'Kaldris', make: createKaldrisSprites, x: 180 },
  { name: 'Königin Ysmeine', make: createYsmeineSprites, x: 268, flip: true },
];

const bossFrame = (b) => { try { return b.make().idle.frames[0]; } catch { return null; } };
const mountFrame = (content, id) => {
  try { return getMountSprites(id, content.find('mount', id), fineRes()).stand.frames[0]; } catch { return null; }
};
// Weltmaße als CSS-Variablen (Breite = w × --px); Beschriftung an Weltkoordinaten
const dims = (el, w, hgt) => { el.style.setProperty('--w', String(w)); el.style.setProperty('--h', String(hgt)); return el; };
const at = (el, x, y) => { el.style.setProperty('--x', String(x)); el.style.setProperty('--y', String(y)); return el; };

// Bildschirmpixel je Weltpixel: ein Feinpixel (halber Weltpixel) fällt auf ganze Gerätepixel.
// Groß etwa 2 CSS-Pixel je Weltpixel, niedrige Fenster (Handy quer) etwa 1,4.
function artScale() {
  const dpr = window.devicePixelRatio || 1, want = window.innerHeight < 520 ? 1.4 : 2;
  const k = Math.max(1, Math.round((want * dpr) / R));
  return (R * k) / dpr;
}

// Bühne einmal zeichnen und merken (Bosse und Reittiere bauen kostet einige Millisekunden)
let stage = null;
function stageCanvas(content) {
  if (stage) return stage;
  const v = vistaStage(360, 150);
  BOSSES.forEach((b) => drawFigure(v.canvas, bossFrame(b), b.x, v.groundY + 2, { flip: !!b.flip }));
  drawFigure(v.canvas, mountFrame(content, 'sky_ray'), 318, 58, { flip: true });
  drawFigure(v.canvas, mountFrame(content, 'moon_lynx'), 26, v.groundY + 6);
  drawFigure(v.canvas, mountFrame(content, 'crystal_ram'), 336, v.groundY + 6, { flip: true });
  stage = v;
  return v;
}

export function teaserPanel(session, prefs) {
  const v = stageCanvas(session.content);
  // eigenes Canvas je Fenster (ein Element hängt nur an einer Stelle)
  const pic = document.createElement('canvas');
  pic.width = v.canvas.width; pic.height = v.canvas.height;
  pic.getContext('2d').drawImage(v.canvas, 0, 0);
  pic.className = 'ts-art';
  pic.setAttribute('aria-hidden', 'true');
  dims(pic, v.w, v.h);
  const word = wordmark();
  word.className = 'ts-mark';
  word.setAttribute('role', 'img');
  word.setAttribute('aria-label', 'Sternenglut');
  dims(word, word.width, word.height);

  const box = h('input', { type: 'checkbox' });
  box.checked = prefs.hidden();
  box.addEventListener('change', () => prefs.setHidden(box.checked));
  const close = () => session.panels.close();

  const root = h('div.ts-win', { role: 'dialog', 'aria-label': 'Sternenglut' },
    h('button.ts-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: close }, '✕'),
    h('div.ts-stage', pic,
      h('div.ts-markwrap', word, h('span.ts-soon', 'Bald')),
      BOSSES.map((b) => at(h('span.ts-name', b.name), b.x, v.groundY + 6))),
    h('div.ts-band',
      h('p.ts-lead', 'Über der Glutöde reißt der Himmel auf. Dahinter treiben Inseln im Morgenlicht, und über Sternhafen brennt ein Stern, der nie erlischt.'),
      h('ul.ts-chips', FEATS.map((f) => h('li', iconEl(f.icon, 20), h('span', f.title))))),
    h('div.ts-foot',
      h('label.ts-check', box, h('span.ts-box', { 'aria-hidden': 'true' }), h('span', 'Beim Anmelden nicht mehr zeigen')),
      h('button.ts-go', { type: 'button', onclick: close }, 'Weiter spielen')));
  root.style.setProperty('--px', String(artScale()));
  return { root };
}
