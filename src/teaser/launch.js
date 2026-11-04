import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl } from '../gfx/Icons.js';
import { getHeroSprites } from '../sprites/hero.js';
import { spriteStyle } from '../character/cosmetics.js';
import { QUESTS_STARS } from '../progression/questsStars.js';
import { R, drawFigure, wordmark } from './art.js';
import { riftScene, riftFrame } from './launchArt.js';

// Fenster „Sternenglut ist da“ (seit 04.11., Stufe 40–50 für alle offen; vom Nutzer gewählter Entwurf A „Der Riss“).
// Öffnet an der Sternentafel in jeder Stadt und einmal nach dem Anmelden (index.js). Beim Öffnen reißt der Himmel über
// der Glutöde in sieben Stufen auf, ein harter Lichtblitz, dann Schriftzug und „Das Update ist da“; danach fallen
// Sternfunken im Lichtkegel. Im Licht steht der eigene Held mit seiner sichtbaren Ausrüstung.
// „Weg zeigen“ legt die Glutspur zur nächsten offenen Hauptquest der Erweiterung (zuerst Ysolde in der Rauhwacht).
// Bilder sind Canvas im Weltraster (R Bildpunkte je Weltpixel), CSS zeigt sie mit --px Bildschirmpixeln je Weltpixel.

const OPEN = [0, 0.1, 0.24, 0.42, 0.62, 0.82, 1];   // Öffnungsstufen des Risses
const SPARKS = 6;                                   // Bilder der Ruhe-Animation
const STAGE_W = 440, STAGE_H = 180;

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const dims = (el, w, hgt) => { el.style.setProperty('--w', String(w)); el.style.setProperty('--h', String(hgt)); return el; };

// Bildschirmpixel je Weltpixel: ein Feinpixel (halber Weltpixel) fällt auf ganze Gerätepixel.
// Groß etwa 2 CSS-Pixel je Weltpixel, niedrige Fenster (Handy quer) etwa 1,4.
function artScale() {
  const dpr = window.devicePixelRatio || 1;
  const want = Math.min(window.innerHeight < 520 ? 1.4 : 2, (window.innerWidth - 48) / STAGE_W);
  const k = Math.max(1, Math.round((want * dpr) / R));
  return (R * k) / dpr;
}

// Eigener Held in Ruhe, Feinraster 2 (passt ohne Umrechnung aufs Weltraster der Bühne)
function heroFrame(session) {
  try {
    const c = session.state.slices.character;
    const gear = session.game.character?.previewGear?.() ?? null;
    return getHeroSprites(c.raceId, c.classId, c.appearance?.variant ?? 0, gear, spriteStyle(c.appearance ?? {}), 2).idle.frames[0];
  } catch { return null; }
}

// Nächster Schritt in die Erweiterung: laufende Hauptquest (verfolgen) oder die erste annehmbare (Weg zum Geber)
const MAIN = Object.entries(QUESTS_STARS).filter(([, q]) => q.main).map(([id]) => id);
function nextStep(session) {
  const p = session.game.progression;
  if (!p?.questStatus) return null;
  const active = MAIN.find((id) => p.questStatus(id) === 'active');
  if (active) return { id: active, go: () => p.trackQuest(active) };
  const open = MAIN.find((id) => p.questStatus(id) === 'available');
  return open ? { id: open, go: () => p.guideQuest(open) } : null;
}

// Die Szene (beide Ebenen) einmal, die Einzelbilder je Held
let scene = null;
const frames = new Map();
function frameFor(hero, open, spark) {
  scene ??= riftScene(STAGE_W, STAGE_H);
  const key = `${open}|${spark}`;
  if (frames.get('hero') !== hero) { frames.clear(); frames.set('hero', hero); }
  if (!frames.has(key)) {
    const cv = riftFrame(scene, open, spark);
    drawFigure(cv, hero, scene.cx + 4, scene.horizon + Math.round((scene.h - scene.horizon) * 0.5));
    frames.set(key, cv);
  }
  return frames.get(key);
}

export function launchPanel(session, prefs) {
  const close = () => session.panels.close();
  const hero = heroFrame(session);
  const step = nextStep(session);
  const level = session.state.slices.progress?.level ?? 1;

  const cv = document.createElement('canvas');
  cv.width = STAGE_W * R; cv.height = STAGE_H * R;
  cv.className = 'ts-art';
  cv.setAttribute('aria-hidden', 'true');
  dims(cv, STAGE_W, STAGE_H);
  const ctx = cv.getContext('2d');
  const show = (c) => { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(c, 0, 0); };

  const word = wordmark();
  const mark = document.createElement('canvas');
  mark.width = word.width; mark.height = word.height;
  mark.getContext('2d').drawImage(word, 0, 0);
  mark.className = 'ts-mark';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', 'Sternenglut');
  dims(mark, word.width, word.height);

  const box = h('input', { type: 'checkbox' });
  box.checked = prefs.hidden();
  box.addEventListener('change', () => prefs.setHidden(box.checked));

  // Wer die Hauptquest noch vor sich hat, bekommt statt „Weg zeigen“ den Hinweis, wann sich der Riss öffnet
  const showWay = () => {
    close();
    session.game.prefs?.set?.('guidePath', true);
    step.go();
    session.bus.emit(EV.UI_TOAST, { text: 'Folge der Glutspur am Boden.', kind: 'quest' });
  };
  const ready = !!step && level >= 40;
  const sub = ready
    ? h('p.la-sub', 'Hinter dem Riss warten zwei Gebiete, drei Dungeons, drei Bosse, drei Reittiere und neue Beute.')
    : h('p.la-sub.la-wait', 'Ab Stufe 40 und nach der Hauptquest öffnet sich der Riss auch für dich.');

  const root = h('div.ts-win.la-win', { role: 'dialog', 'aria-label': 'Sternenglut ist da' },
    h('button.ts-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: close }, '✕'),
    h('div.la-stage', cv,
      h('div.la-title', mark, h('span.la-ribbon', 'Das Update ist da')),
      h('div.la-flash', { 'aria-hidden': 'true' })),
    h('div.la-band', h('p.la-head', 'Stufe 40 bis 50 ist offen'), sub),
    h('div.ts-foot',
      h('label.ts-check', box, h('span.ts-box', { 'aria-hidden': 'true' }), h('span', 'Beim Anmelden nicht mehr zeigen')),
      h('div.la-acts', ready
        ? [h('button.la-later', { type: 'button', onclick: close }, 'Später'), h('button.la-go', { type: 'button', onclick: showWay }, iconEl('map', 20), h('span', 'Weg zeigen'))]
        : h('button.la-go', { type: 'button', onclick: close }, 'Weiter spielen'))));
  root.style.setProperty('--px', String(artScale()));

  // Auftakt: der Riss öffnet sich, dann Blitz, Schriftzug und Band (CSS über .la-done); danach fallen Sternfunken.
  // Endet von selbst, sobald das Fenster nicht mehr im Dokument hängt.
  let i = reduced() ? OPEN.length - 1 : 0, spark = 0, started = false;
  show(frameFor(hero, OPEN[i], 0));
  if (i === OPEN.length - 1) root.classList.add('la-done');
  const tick = () => {
    if (!cv.isConnected) { if (started) return; setTimeout(tick, 100); return; }
    started = true;
    if (i < OPEN.length - 1) {
      i++;
      show(frameFor(hero, OPEN[i], 0));
      if (i === OPEN.length - 1) root.classList.add('la-done');
      setTimeout(tick, i === 1 ? 260 : 110);
    } else if (!reduced()) {
      spark = (spark + 1) % SPARKS;
      show(frameFor(hero, 1, spark));
      setTimeout(tick, 170);
    }
  };
  setTimeout(tick, 350);
  return { root };
}
