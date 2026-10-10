import { h } from '../core/dom.js';
import { createSettingsSection } from './Settings.js';
import { canFullscreen, isStandalone, isFullscreen, toggleFullscreen } from './Fullscreen.js';
import { iconUrl } from '../gfx/Icons.js';
import { EV } from '../core/events.js';
import { canReviveInInstance } from '../world/instanceRevive.js';

// Spielmenü (Panel 'menu', öffnet mit Esc/P oder dem Menü-Knopf). Die Welt läuft dabei weiter.
export function createMenuPanel(session) {
  const g = session.game;
  const settings = createSettingsSection(g);
  settings.classList.add('menu-settings');

  const help = h('div.menu-help',
    h('dl.menu-keys',
      h('dt', 'WASD / Pfeile'), h('dd', 'Laufen'),
      h('dt', 'J / Leertaste / Klick'), h('dd', 'Angreifen'),
      h('dt', 'K / Shift / Rechtsklick'), h('dd', 'Ausweichrolle'),
      h('dt', 'Q · R · T · G'), h('dd', 'Fähigkeiten (auch 1 · 2 · 4 · 5)'),
      h('dt', 'H / 3'), h('dd', 'Heiltrank'),
      h('dt', 'V / 6'), h('dd', 'Reittier rufen'),
      h('dt', 'E / F'), h('dd', 'Sprechen, Öffnen'),
      h('dt', 'I / B · C'), h('dd', 'Inventar · Charakter'),
      h('dt', 'L · U'), h('dd', 'Quests · Talente'),
      h('dt', 'M'), h('dd', 'Zonenkarte'),
      h('dt', 'O'), h('dd', 'Dungeonsuche'),
      h('dt', 'Enter'), h('dd', 'Chat'),
      h('dt', 'Esc / P'), h('dd', 'Menü, Fenster schließen'),
      h('dt', 'N'), h('dd', 'Ton an/aus'),
    ),
    h('p.ef-note.menu-touch-help', 'Touch: linke Seite ziehen zum Laufen, rechts die Aktionsknöpfe. Minimap antippen öffnet die Karte.'),
  );

  // Online-Welt: das Menü hält nichts an und dunkelt die Welt nicht ab (kleine Tafel, theme.css „Spielmenü“).
  // Einstellungen und Steuerung öffnen als eigene Seite in derselben Tafel, damit sie schmal bleibt.
  const title = h('h2.menu-title', 'Menü');
  const back = h('button.menu-back', { type: 'button', 'aria-label': 'Zurück', title: 'Zurück', onclick: () => page('main') });
  const close = h('button.menu-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() });
  const def = session.zone?.def;
  const btn = (label, onclick, cls = '', icon = null) => h(`button.ef-btn.menu-btn${cls}`, { type: 'button', onclick },
    icon ? h('img.ef-icon', { src: iconUrl(icon), alt: '', width: 20, height: 20 }) : null, h('span', label));

  const main = h('div.menu-main',
    g.panels.defs?.has('achievements') ? btn('Erfolge', () => session.panels.open('achievements'), '.menu-ach', 'ui_achievements') : null,
    g.character?.wardrobe ? btn('Garderobe', () => session.panels.open('wardrobe'), '.menu-wardrobe') : null,
    g.shop?.visible ? btn('Shop', () => session.panels.open('goldshop'), '.menu-shop', 'gold') : null,
    btn('Einstellungen', () => page('settings')),
    btn('Steuerung', () => page('help'), '.menu-help-btn'),
    canFullscreen() && !isStandalone()
      ? btn(isFullscreen() ? 'Vollbild beenden' : 'Vollbild', (e) => { const b = e.currentTarget; toggleFullscreen().then(() => { b.lastChild.textContent = isFullscreen() ? 'Vollbild beenden' : 'Vollbild'; }); })
      : null,
    canReviveInInstance(def)
      ? btn('Dungeon verlassen', () => { session.panels.close(); session.bus.emit(EV.RESPAWN_REQUEST, { leave: true }); }, '.menu-leave')
      : null,
    h('hr.menu-sep'),
    h('button.ef-btn.danger.menu-btn', { type: 'button', onclick: () => { g.saveNow('exit'); g.scenes.go('title'); }, title: 'Speichert und kehrt zum Titelbildschirm zurück' }, h('span', 'Zum Titel')),
  );

  const root = h('div.ef-panel.menu-panel', { role: 'dialog', 'aria-label': 'Menü', dataset: { page: 'main' } },
    h('div.menu-head', back, title, close),
    main,
    settings,
    help,
  );
  const TITLES = { main: 'Menü', settings: 'Einstellungen', help: 'Steuerung' };
  function page(id) {
    root.dataset.page = id;
    title.textContent = TITLES[id];
    settings.classList.toggle('open', id === 'settings');
    help.classList.toggle('open', id === 'help');
    root.scrollTop = 0;
  }
  return { root };
}
