import { h } from '../core/dom.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';

// Reisemenü am Wegstein (Panel 'travel') – Thread D.
// Vertrag mit Thread B (world/waystones.js):
//   Welt -> bus 'travel:open' { from, list: [{ zoneId, spawnId, name, region, levels, unlocked, current }], blocked: null | Text }
//   Panel -> bus 'travel:go' { zoneId }   (die Welt prüft, spielt die Abreise und wechselt die Zone)
// Das Panel schreibt nichts in den Spielstand.
export const TRAVEL_OPEN = 'travel:open';
export const TRAVEL_GO = 'travel:go';

// Runenstein je Zone: Grundton des Gebiets (Farbe der Gegend auf der Karte)
const STONE = {
  emberhollow: ['#3a2c1c', '#6a8a4a', '#ff9a3a'],
  ashwood: ['#2a2a22', '#7a7e5a', '#ffb060'],
  cinder_peaks: ['#2a1c18', '#8a6a5a', '#ff6a2a'],
  ashen_steppe: ['#3a2a18', '#c0a060', '#ffd070'],
  blighted_marsh: ['#1c241c', '#6a8a5a', '#b0f070'],
  frostspire: ['#1c2434', '#a8c0dc', '#c8f0ff'],
  ember_wastes: ['#2a1410', '#a85a3a', '#ff7a2a'],
};
const DEFAULT_STONE = ['#2a2030', '#8a7aa0', '#e0c0ff'];

function levelText(lv) {
  if (Array.isArray(lv)) return `Stufe ${lv[0]}–${lv[1]}`;
  if (lv == null || lv === '') return '';
  return `Stufe ${lv}`;
}

// Kleiner Wegstein im Pixelstil: Steinblock mit leuchtender Rune, gesperrt grau ohne Rune
function stoneIcon(zoneId, { unlocked, current }) {
  const [dark, mid, glow] = STONE[zoneId] ?? DEFAULT_STONE;
  const c = makeCanvas(16, 18), ctx = c.getContext('2d');
  const px = (x, y, w, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, hh); };
  // Menhir: spitz zulaufender Stein auf Grasbüschel, Licht von links
  const rows = [[7, 2], [6, 4], [5, 6], [5, 6], [4, 8], [4, 8], [4, 8], [4, 8], [4, 8], [4, 8], [4, 8], [3, 10], [3, 10], [3, 10]];
  const body = unlocked ? mid : '#5a5560', lit = unlocked ? '#e8dcc0' : '#7a7480', shade = unlocked ? dark : '#3a3640';
  rows.forEach(([x0, w], i) => {
    const y = 1 + i;
    px(x0 - 1, y, w + 2, 1, '#120c08');
    px(x0, y, w, 1, body);
    px(x0, y, Math.max(1, Math.floor(w / 4)), 1, lit);
    px(x0 + w - Math.max(1, Math.floor(w / 4)), y, Math.max(1, Math.floor(w / 4)), 1, shade);
  });
  px(2, 15, 12, 1, '#120c08'); px(1, 16, 14, 1, '#120c08');
  px(3, 15, 2, 1, '#4a6a3a'); px(11, 15, 2, 1, '#4a6a3a');
  if (unlocked) {
    // Rune: senkrechter Strich mit zwei Ästen
    const g = current ? '#ffffff' : glow;
    px(7, 5, 2, 8, g); px(6, 7, 1, 1, g); px(5, 6, 1, 1, g); px(9, 9, 1, 1, g); px(10, 8, 1, 1, g);
  } else {
    px(7, 6, 2, 6, '#3a3640');
  }
  return h('img.tv-stone', { src: c.toDataURL(), alt: '' });
}

export function createTravelPanel(session, params = {}) {
  const list = params.list ?? [];
  const blocked = params.blocked ?? null;
  const go = (zoneId) => {
    session.sfx?.play?.('ui');
    session.bus.emit(TRAVEL_GO, { zoneId });
    session.panels?.close?.();
  };
  const rows = list.map((d) => {
    const state = d.current ? 'here' : d.unlocked ? 'open' : 'locked';
    const action = state === 'here' ? h('span.tv-here', 'Du bist hier')
      : state === 'locked' ? h('span.tv-locked', 'Unentdeckt')
        : h('button.ef-btn.tv-go', { type: 'button', disabled: !!blocked, onclick: () => go(d.zoneId) }, 'Reisen');
    return h(`li.tv-row.${state}`,
      stoneIcon(d.zoneId, d),
      h('div.tv-body',
        h('span.tv-name', d.name),
        h('span.tv-sub', [d.region, levelText(d.levels)].filter(Boolean).join(' · '))),
      action);
  });
  const root = h('div.ef-panel.tv-panel', { role: 'dialog', 'aria-label': 'Wegstein' },
    h('header.tv-head',
      h('h2.tv-title', 'Wegstein'),
      h('button.pg-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels?.close?.() }, '✕')),
    blocked ? h('p.tv-blocked', blocked) : null,
    h('ul.tv-list', rows));
  return { root };
}

export function installTravel(game) {
  game.panels.register('travel', (session, params) => createTravelPanel(session, params), { pauses: false, title: 'Wegstein' });
}

// Pro Sitzung: Wegstein-Anfrage der Welt öffnet das Menü
export function listenTravel(session) {
  session.bus.on(TRAVEL_OPEN, (e) => session.panels?.open?.('travel', e ?? {}));
}
