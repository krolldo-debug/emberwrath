import { h } from '../core/dom.js';
import { createSettingsSection } from './Settings.js';
import { canFullscreen, isStandalone, isFullscreen, toggleFullscreen } from './Fullscreen.js';
import { iconUrl } from '../gfx/Icons.js';
import { EV } from '../core/events.js';
import { canReviveInInstance } from '../world/instanceRevive.js';
import { confirmTap } from './confirmTap.js';
import { collectContext, captureShot, sendBugReport } from './bugReport.js';
import { tr } from '../i18n/index.js';

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

  // Online-Welt: das Menü hält nichts an und dunkelt die Welt nicht ab (deckende Tafel am Rand, ui/menu.css).
  // Einstellungen und Steuerung öffnen als eigene Seite in derselben Tafel, damit sie schmal bleibt.
  const title = h('h2.menu-title', 'Menü');
  const back = h('button.menu-back', { type: 'button', 'aria-label': 'Zurück', title: 'Zurück', onclick: () => page('main') });
  const close = h('button.menu-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() });
  const def = session.zone?.def;
  const btn = (label, onclick, cls = '', icon = null) => h(`button.ef-btn.menu-btn${cls}`, { type: 'button', onclick },
    icon ? h('img.ef-icon', { src: iconUrl(icon), alt: '', width: 20, height: 20 }) : null, h('span', label));

  // Dungeon verlassen löst die Gruppe auf: zweiter Tipp bestätigt
  const leaveBtn = () => {
    const b = btn('Dungeon verlassen', null, '.menu-leave');
    confirmTap(b, b.lastChild, { onConfirm: () => { session.panels.close(); session.bus.emit(EV.RESPAWN_REQUEST, { leave: true }); } });
    return b;
  };

  const main = h('div.menu-main',
    g.panels.defs?.has('achievements') ? btn('Erfolge', () => session.panels.open('achievements'), '.menu-ach', 'ui_achievements') : null,
    g.character?.wardrobe ? btn('Garderobe', () => session.panels.open('wardrobe'), '.menu-wardrobe') : null,
    g.shop?.visible ? btn('Shop', () => session.panels.open('goldshop'), '.menu-shop', 'gold') : null,
    btn('Einstellungen', () => page('settings')),
    btn('Steuerung', () => page('help'), '.menu-help-btn'),
    canFullscreen() && !isStandalone()
      ? btn(isFullscreen() ? 'Vollbild beenden' : 'Vollbild', (e) => { const b = e.currentTarget; toggleFullscreen().then(() => { b.lastChild.textContent = isFullscreen() ? 'Vollbild beenden' : 'Vollbild'; }); })
      : null,
    canReviveInInstance(def) ? leaveBtn() : null,
    // Sitzung abgelaufen (Hinweis „Bitte im Menü neu anmelden“): Spiel sichern, dann zur Anmeldung
    g.online?.configured && !g.online.user
      ? btn('Anmelden', () => { g.saveNow('login'); g.online.open('login'); }, '.menu-login')
      : null,
    h('hr.menu-sep'),
    h('button.ef-btn.danger.menu-btn', { type: 'button', onclick: () => { g.saveNow('exit'); g.scenes.go('title'); }, title: 'Speichert und kehrt zum Titelbildschirm zurück' }, h('span', 'Zum Titel')),
    // Bewusst unauffällig (kein eigenes HUD-Element): kleiner Textknopf am Ende des Menüs
    g.online?.configured ? h('button.menu-btn.menu-report-link', { type: 'button', onclick: () => openReport() }, h('span', 'Fehler melden')) : null,
  );

  // Fehler melden: Beschreibung, optional Bild vom Spiel; Version, Gebiet, Gerät und letzte Fehler gehen automatisch mit.
  let shot = null, context = null, busy = false, cooldown = 0;
  const text = h('textarea.menu-report-text', {
    rows: 4, maxlength: 2000, 'aria-label': 'Beschreibung',
    oninput: () => update(),
  });
  // Platzhalter selbst übersetzen: der Übersetzer lässt Textfelder aus (SKIP_TAGS in i18n/index.js)
  const HINT = 'Was ist passiert? Was hast du kurz davor gemacht?';
  const shotBox = h('input', { type: 'checkbox', checked: true });
  const status = h('p.menu-report-status', { role: 'status' });
  const send = h('button.ef-btn.menu-btn.menu-report-send', { type: 'button', onclick: () => submit() }, h('span', 'Senden'));
  const report = h('div.menu-report',
    text,
    h('label.menu-report-shot', shotBox, h('span', 'Bild vom Spiel anhängen')),
    h('p.menu-report-note', 'Version, Gebiet und Gerät werden mitgeschickt.'),
    send,
    status,
  );
  const update = () => { send.disabled = busy || Date.now() < cooldown || text.value.trim().length < 3; };
  function openReport() {
    // Bild sofort aufnehmen: so zeigt es den Moment, in dem das Menü geöffnet wurde, nicht die Zeit danach
    shot = captureShot(g.canvas);
    context = collectContext(g, session);
    shotBox.checked = !!shot; shotBox.disabled = !shot;
    text.placeholder = tr(HINT);
    status.textContent = '';
    page('report');
    update();
    if (!document.documentElement.classList.contains('ef-touch')) text.focus();
  }
  async function submit() {
    if (send.disabled) return;
    busy = true; update();
    status.textContent = 'Wird gesendet …';
    const res = await sendBugReport(g, { message: text.value.trim(), context, shot: shotBox.checked ? shot : null });
    busy = false;
    const MSG = {
      ok: 'Danke! Wir sehen uns das an.',
      auth: 'Bitte zuerst anmelden, dann noch einmal senden.',
      rate: 'Gerade schon gesendet. Bitte kurz warten.',
      day: 'Für heute sind genug Meldungen von dir da. Danke!',
      fail: 'Senden hat nicht geklappt. Bitte später noch einmal versuchen.',
    };
    status.textContent = MSG[res];
    if (res === 'ok') {
      text.value = ''; cooldown = Date.now() + 30_000;
      setTimeout(() => { if (root.dataset.page === 'report') page('main'); update(); }, 1800);
      setTimeout(update, 30_100);
    }
    update();
  }

  const root = h('div.ef-panel.menu-panel', { role: 'dialog', 'aria-label': 'Menü', dataset: { page: 'main' } },
    h('div.menu-head', back, title, close),
    main,
    settings,
    help,
    report,
  );
  const TITLES = { main: 'Menü', settings: 'Einstellungen', help: 'Steuerung', report: 'Fehler melden' };
  function page(id) {
    root.dataset.page = id;
    title.textContent = TITLES[id];
    settings.classList.toggle('open', id === 'settings');
    help.classList.toggle('open', id === 'help');
    report.classList.toggle('open', id === 'report');
    root.scrollTop = 0;
  }
  return { root };
}
