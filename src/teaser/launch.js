import { h } from '../core/dom.js';
import { iconEl } from '../gfx/Icons.js';
import { fineRes } from '../gfx/Fine.js';
import { createYsgarnSprites, createKaldrisSprites, createYsmeineSprites } from '../sprites/star_bosses.js';
import { getMountSprites } from '../sprites/mounts.js';
import { getHeroSprites } from '../sprites/hero.js';
import { createStarNpcSprites } from '../sprites/npcs_stars.js';
import { spriteStyle } from '../character/cosmetics.js';
import { resolveGear } from '../character/gearLook.js';
import { R, drawFigure, wordmark } from './art.js';
import { riftScene, riftFrame, harborPortrait, sealCanvas, vellumTile, showStage, plinth } from './launchArt.js';

// Ankündigung „Sternenglut ist da“ (ab 04.11., Stufe 40–50 für alle offen). Drei Entwürfe zur Wahl:
//   A „Der Riss“: kurzer Auftakt, der Himmel über der Glutöde reißt auf, der eigene Held steht im Licht
//   B „Kundmachung“: Brief der Fürstin Amarys auf Pergament, Sternhafen im Hochformat daneben
//   C „Schaukasten“: Reiter Bosse, Reittiere, Beute, Gebiete mit Figuren aus dem Spiel auf Sockeln
// Bilder sind Canvas im Weltraster (R Bildpunkte je Weltpixel), CSS zeigt sie mit --px Bildschirmpixeln je Weltpixel.

const dims = (el, w, hgt) => { el.style.setProperty('--w', String(w)); el.style.setProperty('--h', String(hgt)); return el; };
const pic = (canvas, cls) => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; c.getContext('2d').drawImage(canvas, 0, 0); c.className = cls; c.setAttribute('aria-hidden', 'true'); return c; };
const markEl = (cls = 'ts-mark') => { const w = pic(wordmark(), cls); w.setAttribute('role', 'img'); w.setAttribute('aria-label', 'Sternenglut'); w.removeAttribute('aria-hidden'); return dims(w, wordmark().width, wordmark().height); };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// Bildschirmpixel je Weltpixel: ein Feinpixel (halber Weltpixel) fällt auf ganze Gerätepixel
function scaleFor(stageW, big = 2, small = 1.4) {
  const dpr = window.devicePixelRatio || 1;
  const want = Math.min(window.innerHeight < 520 ? small : big, (window.innerWidth - 48) / stageW);
  const k = Math.max(1, Math.round((want * dpr) / R));
  return (R * k) / dpr;
}

const frameOf = (make, anim = 'idle') => { try { return make()[anim].frames[0]; } catch { return null; } };
const mountFrame = (content, id) => { try { return getMountSprites(id, content.find('mount', id), fineRes()).stand.frames[0]; } catch { return null; } };

function footer(prefs, close, { go = 'Weg zeigen', later = 'Später', onGo = close } = {}) {
  const box = h('input', { type: 'checkbox' });
  box.checked = prefs.hidden();
  box.addEventListener('change', () => prefs.setHidden(box.checked));
  return h('div.ts-foot',
    h('label.ts-check', box, h('span.ts-box', { 'aria-hidden': 'true' }), h('span', 'Beim Anmelden nicht mehr zeigen')),
    h('div.lx-acts',
      h('button.lx-later', { type: 'button', onclick: close }, later),
      h('button.lx-go', { type: 'button', onclick: onGo }, iconEl('map', 20), h('span', go))));
}
const closeBtn = (close) => h('button.ts-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: close }, '✕');

// ============================================================================================ A: Der Riss
let rift = null;
function heroFrame(session) {
  try {
    const c = session.state.slices.character;
    const set = getHeroSprites(c.raceId, c.classId, c.appearance?.variant ?? 0, session.game.character?.previewGear?.() ?? null, spriteStyle(c.appearance ?? {}), 2);
    return set.idle.frames[0];
  } catch { return null; }
}
export function riftPanel(session, prefs) {
  rift ??= riftScene(440, 180);
  const close = () => session.panels.close();
  const hero = heroFrame(session);
  const OPEN = [0, 0.1, 0.24, 0.42, 0.62, 0.82, 1];
  const cache = new Map();
  const frame = (open, spark) => {
    const key = `${open}|${spark}`;
    if (!cache.has(key)) {
      const cv = riftFrame(rift, open, spark);
      drawFigure(cv, hero, rift.cx + 4, rift.horizon + Math.round((rift.h - rift.horizon) * 0.5));
      cache.set(key, cv);
    }
    return cache.get(key);
  };
  const cv = document.createElement('canvas');
  cv.width = rift.w * R; cv.height = rift.h * R; cv.className = 'ts-art'; cv.setAttribute('aria-hidden', 'true');
  dims(cv, rift.w, rift.h);
  const ctx = cv.getContext('2d');
  const show = (c) => { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(c, 0, 0); };

  const root = h('div.ts-win.la-win', { role: 'dialog', 'aria-label': 'Sternenglut ist da' },
    closeBtn(close),
    h('div.ts-stage.la-stage', cv,
      h('div.la-title', markEl(), h('span.la-ribbon', 'Das Update ist da')),
      h('div.la-flash', { 'aria-hidden': 'true' })),
    h('div.la-band',
      h('p.la-head', 'Stufe 40 bis 50 ist offen'),
      h('p.la-sub', 'Hinter dem Riss warten zwei Gebiete, drei Dungeons, drei Bosse, drei Reittiere und neue Beute.')),
    footer(prefs, close));
  root.style.setProperty('--px', String(scaleFor(rift.w)));

  // Auftakt: der Riss öffnet sich in sieben Stufen, dann Blitz, Schriftzug und Band; danach fallen Sternfunken
  let i = reduced() ? OPEN.length - 1 : 0, spark = 0;
  show(frame(OPEN[i], 0));
  if (i === OPEN.length - 1) root.classList.add('la-done');
  const tick = () => {
    if (!cv.isConnected && i > 0) return;
    if (i < OPEN.length - 1) {
      i++;
      show(frame(OPEN[i], 0));
      if (i === OPEN.length - 1) root.classList.add('la-done');
      setTimeout(tick, i === 1 ? 260 : 110);
    } else {
      spark = (spark + 1) % 6;
      show(frame(1, spark));
      setTimeout(tick, 170);
    }
  };
  setTimeout(tick, 350);
  return { root };
}

// ============================================================================================ B: Kundmachung
let harbor = null;
const LIST = [
  { icon: 'map', label: 'Neue Gebiete', value: 'Treibende Gärten, Splitterweiten' },
  { icon: 'charm_skull', label: 'Dungeons', value: 'Rankengruft, Gläserne Hallen, Sternwarte' },
  { icon: 'mount_sky_ray', label: 'Reittiere', value: 'Himmelsrochen, Mondluchs, Kristallwidder' },
  { icon: 'gem_sapphire', label: 'Höchststufe', value: '50' },
  { icon: 'crown_fallen', label: 'Schmiede', value: 'Mondwacht und Sternenstahl' },
];
export function decreePanel(session, prefs) {
  if (!harbor) {
    harbor = harborPortrait(132, 196);
    let amarys = null;
    try { amarys = createStarNpcSprites().lady_amarys.idle.frames[0]; } catch { /* ohne Figur */ }
    drawFigure(harbor.canvas, amarys, 66, harbor.floor - 1);
  }
  const close = () => session.panels.close();
  const tile = vellumTile();
  const seal = sealCanvas(30);
  const sealEl = dims(pic(seal, 'lb-seal'), seal.width / R, seal.height / R);
  const root = h('div.ts-win.lb-win', { role: 'dialog', 'aria-label': 'Sternenglut ist da' },
    closeBtn(close),
    h('div.lb-grid',
      h('div.lb-art', dims(pic(harbor.canvas, 'ts-art'), harbor.w, harbor.h), h('span.lb-cap', 'Sternhafen')),
      h('div.lb-paper',
        h('p.lb-kicker', 'Kundmachung aus Sternhafen'),
        h('div.lb-head', markEl(), h('span.lb-stamp', 'Jetzt da')),
        h('p.lb-text', 'Der Himmel über der Glutöde steht offen. Wer Stufe 40 erreicht und die Hauptquest abgeschlossen hat, ist in Sternhafen willkommen.'),
        h('ul.lb-list', LIST.map((r) => h('li', iconEl(r.icon, 20), h('span.lb-k', r.label), h('span.lb-dots', { 'aria-hidden': 'true' }), h('span.lb-v', r.value)))),
        h('div.lb-sign', sealEl, h('span', h('em', 'Amarys'), h('br'), 'Fürstin von Sternhafen')))),
    footer(prefs, close, { later: 'Weiter spielen' }));
  root.style.setProperty('--px', String(scaleFor(440)));
  root.style.setProperty('--vellum', `url(${tile.toDataURL()})`);
  return { root };
}

// ============================================================================================ C: Schaukasten
const SETS = [
  { race: 'elf', cls: 'rogue', v: 1, gear: { chest: 'gardener_jerkin', head: 'gardener_cap', hands: 'gardener_grips', feet: 'gardener_boots', weapon: 'nightglass' } },
  { race: 'human', cls: 'warrior', v: 0, gear: { chest: 'kaldris_cuirass', head: 'kaldris_helm', hands: 'kaldris_gauntlets', feet: 'kaldris_sabatons', weapon: 'kaldris_edge' } },
  { race: 'elf', cls: 'mage', v: 2, gear: { chest: 'ysmeine_gown', head: 'ysmeine_circlet', hands: 'ysmeine_gloves', feet: 'ysmeine_slippers', weapon: 'eye_of_ysmeine' } },
];
const TABS = [
  {
    id: 'bosses', label: 'Bosse', icon: 'charm_skull', w: 420, h: 170, zoom: 1,
    cards: [['Ysgarn, der Alte Gärtner', 'Rankengruft · Stufe 44'], ['Kaldris, der Splitterfürst', 'Gläserne Hallen · Stufe 48'], ['Königin Ysmeine', 'Sternwarte · Stufe 50']],
    draw(st) {
      [80, 210, 340].forEach((x) => {
        const y = st.ground(x) + 2; plinth(st.b, x, y, 30);
      });
      return (cv) => [[80, createYsgarnSprites], [210, createKaldrisSprites], [340, createYsmeineSprites, true]].forEach(([x, make, flip]) => drawFigure(cv, frameOf(make), x, st.ground(x) + 2, { flip: !!flip }));
    },
  },
  {
    id: 'mounts', label: 'Reittiere', icon: 'mount_sky_ray', w: 210, h: 75, zoom: 2,
    cards: [['Himmelsrochen', 'Stallmeister Corvin, ab Stufe 40'], ['Mondluchs', 'Stallmeister Corvin, ab Stufe 50'], ['Kristallwidder', 'Selten von Kaldris']],
    draw(st, content) {
      [38, 105, 172].forEach((x) => plinth(st.b, x, st.ground(x) - 2, 18));
      return (cv) => {
        drawFigure(cv, mountFrame(content, 'sky_ray'), 38, st.ground(38) - 10);
        drawFigure(cv, mountFrame(content, 'moon_lynx'), 105, st.ground(105) - 2);
        drawFigure(cv, mountFrame(content, 'crystal_ram'), 172, st.ground(172) - 2, { flip: true });
      };
    },
  },
  {
    id: 'loot', label: 'Beute', icon: 'gem_sapphire', w: 210, h: 75, zoom: 2,
    cards: [['Rinde des Alten Gärtners', 'Set aus der Rankengruft'], ['Spiegelrüstung des Splitterfürsten', 'Set aus den Gläsernen Hallen'], ['Sternenkleid der Schattenkönigin', 'Set aus der Sternwarte']],
    draw(st, content) {
      [42, 105, 168].forEach((x) => plinth(st.b, x, st.ground(x) - 2, 14));
      return (cv) => SETS.forEach((s, i) => {
        const x = [42, 105, 168][i];
        let f = null;
        try { f = getHeroSprites(s.race, s.cls, s.v, resolveGear(s.gear, content), null, 2).idle.frames[0]; } catch (err) { console.warn('Set-Figur', err); }
        drawFigure(cv, f, x, st.ground(x) - 2, { flip: i === 2 });
      });
    },
  },
  {
    id: 'lands', label: 'Gebiete', icon: 'map', w: 420, h: 170, zoom: 1, garden: true, shards: true,
    cards: [['Sternhafen', 'Hauptstadt über den Wolken'], ['Treibende Gärten', 'Stufe 40 bis 45'], ['Splitterweiten', 'Stufe 45 bis 50']],
    draw() { return () => {}; },
  },
];
const stages = new Map();
function tabCanvas(tab, content) {
  if (stages.has(tab.id)) return stages.get(tab.id);
  const st = showStage(tab.w, tab.h, 40 + tab.w, { garden: tab.garden, shards: tab.shards });
  const after = tab.draw(st, content);
  const cv = st.b.toCanvas();
  after?.(cv);
  const out = { canvas: cv, w: tab.w, h: tab.h };
  stages.set(tab.id, out);
  return out;
}
export function showcasePanel(session, prefs) {
  const close = () => session.panels.close();
  let cur = TABS[0];
  const stageWrap = h('div.ts-stage.lc-stage');
  const cards = h('ol.lc-cards');
  const tabs = TABS.map((t) => h('button.lc-tab', { type: 'button', role: 'tab', onclick: () => select(t) }, iconEl(t.icon, 20), h('span', t.label)));
  const root = h('div.ts-win.lc-win', { role: 'dialog', 'aria-label': 'Sternenglut ist da' },
    closeBtn(close),
    h('div.lc-top', markEl(), h('span.ts-soon.lc-badge', 'Jetzt da'), h('span.lc-lvl', 'Stufe 40 bis 50')),
    h('div.lc-tabs', { role: 'tablist' }, tabs),
    stageWrap, cards,
    footer(prefs, close));
  const px = scaleFor(420);
  root.style.setProperty('--px', String(px));
  function select(t) {
    cur = t;
    tabs.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i] === t)));
    const s = tabCanvas(t, session.content);
    const c = dims(pic(s.canvas, 'ts-art'), s.w, s.h);
    c.style.setProperty('--z', String(t.zoom));
    stageWrap.replaceChildren(c);
    cards.replaceChildren(...t.cards.map(([a, b]) => h('li', h('b', a), h('span', b))));
  }
  select(cur);
  return { root, select: (id) => select(TABS.find((t) => t.id === id) ?? TABS[0]) };
}
