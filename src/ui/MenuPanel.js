import { h } from '../core/dom.js';
import { createSettingsSection } from './Settings.js';
import { iconUrl } from '../gfx/Icons.js';

// Pausemenü (Panel 'menu', öffnet mit Esc/P oder dem Menü-Knopf).
// Ehrlich zum Speicherort: der Spielstand liegt lokal in diesem Browser.
export function createMenuPanel(session) {
  const g = session.game;
  const status = h('p.ef-note.menu-status');
  const settings = createSettingsSection(g);
  settings.classList.add('menu-settings');

  const help = h('div.menu-help',
    h('h3', 'Steuerung'),
    h('dl.menu-keys',
      h('dt', 'WASD / Pfeile'), h('dd', 'Laufen'),
      h('dt', 'J / Leertaste / Klick'), h('dd', 'Angreifen'),
      h('dt', 'K / Shift / Rechtsklick'), h('dd', 'Ausweichrolle'),
      h('dt', 'Q · R · T · G'), h('dd', 'Fähigkeiten (1 · 2 · 4 · 5)'),
      h('dt', 'H'), h('dd', 'Heiltrank'),
      h('dt', 'E / F'), h('dd', 'Sprechen, Öffnen'),
      h('dt', 'I · C · L · U'), h('dd', 'Inventar · Charakter · Quests · Talente'),
      h('dt', 'M'), h('dd', 'Zonenkarte'),
      h('dt', 'N'), h('dd', 'Ton an/aus'),
    ),
    h('p.ef-note.menu-touch-help', 'Touch: linke Seite ziehen zum Laufen, rechts die Aktionsknöpfe. Minimap antippen öffnet die Karte.'),
  );

  const root = h('div.ef-panel.ef-center.menu-panel', { role: 'dialog', 'aria-label': 'Menü' },
    h('h2.ef-sub', 'Pause'),
    h('div.ef-list.menu-buttons',
      h('button.ef-btn.primary', { type: 'button', onclick: () => session.panels.close() }, 'Weiterspielen'),
      h('button.ef-btn', { type: 'button', onclick: () => { const ok = g.saveNow('manual'); status.textContent = ok ? 'Spielstand gespeichert.' : 'Speichern nicht möglich – der Browser blockiert den Speicher.'; } }, 'Jetzt speichern'),
      g.panels.defs?.has('achievements')
        ? h('button.ef-btn.menu-ach', { type: 'button', onclick: () => session.panels.open('achievements') }, h('img.ef-icon', { src: iconUrl('ui_achievements'), alt: '', width: 20, height: 20 }), 'Erfolge')
        : null,
      typeof g.exportSaveFile === 'function'
        ? h('button.ef-btn', { type: 'button', title: 'Lädt eine Sicherungsdatei deiner Spielstände herunter', onclick: () => { let ok = true; try { ok = g.exportSaveFile() !== false; } catch { ok = false; } status.textContent = ok ? 'Sicherungsdatei heruntergeladen. Laden kannst du sie unter Konto › Kontoeinstellungen.' : 'Sicherung nicht möglich.'; } }, 'Spielstand sichern')
        : null,
      h('button.ef-btn', { type: 'button', onclick: () => { settings.classList.toggle('open'); help.classList.remove('open'); if (settings.classList.contains('open')) settings.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, 'Einstellungen'),
      h('button.ef-btn', { type: 'button', onclick: () => { help.classList.toggle('open'); settings.classList.remove('open'); } }, 'Steuerung'),
      h('button.ef-btn.danger', { type: 'button', onclick: () => { g.saveNow('exit'); g.scenes.go('title'); } }, 'Speichern & zum Titel'),
    ),
    status,
    settings,
    help,
    h('p.ef-note.menu-local', 'Dein Spielstand wird in deinem Konto gespeichert und in der Cloud gesichert.'),
  );
  return { root };
}
