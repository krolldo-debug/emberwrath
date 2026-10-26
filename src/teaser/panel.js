import { h } from '../core/dom.js';
import { iconEl } from '../gfx/Icons.js';
import { fineRes } from '../gfx/Fine.js';
import { createYsgarnSprites, createKaldrisSprites, createYsmeineSprites } from '../sprites/star_bosses.js';
import { getMountSprites } from '../sprites/mounts.js';
import { R, vistaHarbor, vistaStage, vistaMap, drawFigure, wordmark } from './art.js';

// Fenster „Sternenglut“: Vorschau auf die Erweiterung. Öffnet an der Tafel in jeder Stadt und einmal nach dem Anmelden.
// Drei Entwürfe (A Plakat, B Bühne, C Karte), gleiche Texte. Kein Datum, nur „Bald“.
// Bilder sind Canvas im Weltraster (art.js), CSS zeigt sie ganzzahlig: --px = Bildschirmpixel je Weltpixel.
const TEXT = {
  kicker: 'Die erste Erweiterung für Emberwrath',
  lead: 'Über der Glutöde reißt der Himmel auf. Dahinter treiben Inseln im Morgenlicht, und über Sternhafen brennt ein Stern, der nie erlischt.',
  soon: 'Bald',
  hide: 'Beim Anmelden nicht mehr zeigen',
  go: 'Weiter spielen',
  where: 'Diese Ankündigung findest du an der Sternentafel in jeder Stadt.',
};
const FEATS = [
  { id: 'city', icon: 'crown_fallen', title: 'Sternhafen', text: 'Die Hauptstadt über den Wolken' },
  { id: 'zones', icon: 'map', title: 'Zwei neue Gebiete', text: 'Treibende Gärten und Splitterweiten' },
  { id: 'bosses', icon: 'charm_skull', title: 'Drei neue Bosse', text: 'Ysgarn, Kaldris und Königin Ysmeine' },
  { id: 'mounts', icon: 'mount_sky_ray', title: 'Drei neue Reittiere', text: 'Himmelsrochen, Mondluchs und Kristallwidder' },
  { id: 'level', icon: 'gem_sapphire', title: 'Bis Stufe 50', text: 'Neue Beute und neue Kapitel der Geschichte' },
];
const BOSSES = [
  { id: 'ysgarn', name: 'Ysgarn', make: createYsgarnSprites },
  { id: 'kaldris', name: 'Kaldris', make: createKaldrisSprites },
  { id: 'ysmeine', name: 'Königin Ysmeine', make: createYsmeineSprites },
];
const MOUNTS = ['sky_ray', 'moon_lynx', 'crystal_ram'];

const bossFrame = (b) => { try { return b.make().idle.frames[0]; } catch { return null; } };
const mountFrame = (content, id) => {
  try { return getMountSprites(id, content.find('mount', id), fineRes()).stand.frames[0]; } catch { return null; }
};
// Canvas mit Weltmaßen für CSS (Breite = w × --px)
const art = (canvas, cls = '') => {
  canvas.className = `ts-art ${cls}`.trim();
  canvas.style.setProperty('--w', String(canvas.width / R));
  canvas.style.setProperty('--h', String(canvas.height / R));
  return canvas;
};
// Beschriftung an Weltkoordinaten (CSS-Variablen gehen nicht über Object.assign)
const at = (el, x, y) => { el.style.setProperty('--x', String(x)); el.style.setProperty('--y', String(y)); return el; };
const mark = () => { const c = wordmark(); c.className = 'ts-mark'; c.style.setProperty('--w', String(c.width)); c.style.setProperty('--h', String(c.height)); return c; };

function footer(session, prefs) {
  const box = h('input', { type: 'checkbox' });
  box.checked = !!prefs.hidden();
  box.addEventListener('change', () => prefs.setHidden(box.checked));
  return h('div.ts-foot',
    h('label.ts-check', box, h('span.ts-box', { 'aria-hidden': 'true' }), h('span', TEXT.hide)),
    h('button.ts-go', { type: 'button', onclick: () => session.panels.close() }, TEXT.go));
}
const close = (session) => h('button.ts-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() }, '✕');
const feat = (f) => h('li.ts-feat', h('span.ts-ic', iconEl(f.icon, 28)), h('span.ts-ft', h('b', f.title), h('span', f.text)));

// A: Plakat. Großes Bild oben (Sternhafen zwischen den Gärten und den Splitterweiten), darunter Text und fünf Punkte.
function draftA(session, prefs) {
  const v = vistaHarbor(320, 112);
  // Himmelsrochen über der Stadt
  const ray = mountFrame(session.content, 'sky_ray');
  drawFigure(v.canvas, ray, 262, 52, { flip: true });
  return h('div.ts-win.ts-a', { role: 'dialog', 'aria-label': 'Sternenglut' },
    close(session),
    h('div.ts-hero', art(v.canvas), h('div.ts-markwrap', mark()), h('span.ts-soon', TEXT.soon)),
    h('div.ts-body',
      h('p.ts-kicker', TEXT.kicker),
      h('p.ts-lead', TEXT.lead),
      h('ul.ts-feats', FEATS.map(feat))),
    footer(session, prefs));
}

// B: Bühne. Die drei Bosse auf einer Insel im Morgenrot, Sternhafen fern im Hintergrund, Reittiere davor.
function draftB(session, prefs) {
  const W = 360, v = vistaStage(W, 150);
  const xs = [92, 180, 268];
  const frames = BOSSES.map(bossFrame);
  frames.forEach((f, i) => drawFigure(v.canvas, f, xs[i], v.groundY + 2, { flip: i === 2 }));
  const mounts = MOUNTS.map((id) => mountFrame(session.content, id));
  drawFigure(v.canvas, mounts[0], 318, 58, { flip: true });
  drawFigure(v.canvas, mounts[1], 26, v.groundY + 6);
  drawFigure(v.canvas, mounts[2], 336, v.groundY + 6, { flip: true });
  const labels = BOSSES.map((b, i) => at(h('span.ts-name', b.name), xs[i], v.groundY + 6));
  return h('div.ts-win.ts-b', { role: 'dialog', 'aria-label': 'Sternenglut' },
    close(session),
    h('div.ts-stage', art(v.canvas), h('div.ts-markwrap', mark(), h('span.ts-soon', TEXT.soon)), labels),
    h('div.ts-band',
      h('p.ts-lead', TEXT.lead),
      h('ul.ts-chips', FEATS.map((f) => h('li', iconEl(f.icon, 20), h('span', f.title))))),
    footer(session, prefs));
}

// C: Karte. Links die Inselkette (Teil 1 sichtbar, weitere Inseln im Nebel), rechts Schriftzug, Text und Punkte.
function draftC(session, prefs) {
  const v = vistaMap(200, 150);
  const P = v.places;
  const label = (id, text) => at(h('span.ts-pin', text), P[id][0], P[id][1] + P[id][2] + 2);
  const frames = BOSSES.map(bossFrame);
  const tiles = h('div.ts-bosses', BOSSES.map((b, i) => {
    const c = document.createElement('canvas');
    c.width = 36 * R; c.height = 34 * R;
    const ctx = c.getContext('2d');
    ctx.fillStyle = ['#2e434c', '#284660', '#2a2048'][i]; ctx.fillRect(0, 0, c.width, c.height);
    drawFigure(c, frames[i], 18, 52);
    return h('figure.ts-boss', art(c), h('figcaption', b.name));
  }));
  return h('div.ts-win.ts-c', { role: 'dialog', 'aria-label': 'Sternenglut' },
    close(session),
    h('div.ts-top', mark(), h('span.ts-soon', TEXT.soon)),
    h('div.ts-map', art(v.canvas), label('sternhafen', 'Sternhafen'), label('gardens', 'Treibende Gärten'), label('splitter', 'Splitterweiten'),
      at(h('span.ts-pin.fog', '?'), P.fog1[0], P.fog1[1] - 5),
      at(h('span.ts-pin.fog', '?'), P.fog2[0], P.fog2[1] - 5)),
    h('div.ts-side',
      h('p.ts-lead', TEXT.lead),
      tiles,
      h('ul.ts-feats', FEATS.filter((f) => f.id !== 'bosses' && f.id !== 'zones').map(feat))),
    footer(session, prefs));
}

// Bildschirmpixel je Weltpixel: ein Feinpixel (halber Weltpixel) soll auf ganze Gerätepixel fallen.
// Groß: etwa 2 CSS-Pixel je Weltpixel, niedrige Fenster (Handy quer): etwa 1,4.
function artScale() {
  const dpr = window.devicePixelRatio || 1, want = window.innerHeight < 520 ? 1.4 : 2;
  const k = Math.max(1, Math.round((want * dpr) / R));
  return (R * k) / dpr;
}

export function teaserPanel(session, prefs, variant = 'A') {
  const make = { A: draftA, B: draftB, C: draftC }[variant] ?? draftA;
  const root = make(session, prefs);
  root.style.setProperty('--px', String(artScale()));
  return { root };
}
