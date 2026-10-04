import { EV } from './events.js';
import { h } from './dom.js';

// Verwaltet HTML-Panels während einer Spielsitzung (Inventar, Questlog,
// Questdialog, Charakter, Pausemenü …). Pro Sitzung eine Instanz: session.panels.
//
// Registrieren (in install() eines Bereichs):
//   game.panels.register('inventory', (session, params) => ({ root, update?(dt), dispose?() }),
//                        { action: 'inventory', pauses: true, title: 'Inventar' })
// Öffnen: session.panels.open(id, params) oder bus.emit(EV.UI_OPEN_PANEL, { id, params }).
// Es ist immer höchstens ein Panel offen. 'pause'-Taste (Esc) schließt es.
export class PanelRegistry {
  constructor() { this.defs = new Map(); }
  register(id, factory, opts = {}) {
    if (this.defs.has(id)) throw new Error(`Panel ${id} doppelt registriert`);
    this.defs.set(id, { id, factory, pauses: opts.pauses ?? true, action: opts.action ?? null, title: opts.title ?? id });
  }
}

export class PanelHost {
  constructor(session, registry, container) {
    this.session = session;
    this.registry = registry;
    this.container = container;
    this.open_ = null; // { def, panel, el }
    session.bus.on(EV.UI_OPEN_PANEL, (e) => this.open(e.id, e.params));
    session.bus.on(EV.UI_CLOSE_PANEL, (e) => { if (!e?.id || this.open_?.def.id === e.id) this.close(); });
  }

  get openId() { return this.open_?.def.id ?? null; }

  open(id, params = {}) {
    const def = this.registry.defs.get(id);
    if (!def) { console.warn(`Panel ${id} nicht registriert`); return; }
    this.close();
    let panel;
    try { panel = def.factory(this.session, params); } catch (err) {
      console.error(`Panel ${id} konnte nicht geöffnet werden`, err);
      return;
    }
    const el = h('div.ef-panel-host', { 'data-panel': id, tabindex: '-1' }, panel.root);
    el.addEventListener('pointerdown', (ev) => { if (ev.target === el) this.close(); });
    // Tastatur: Fokus ins Panel (der Rahmen selbst, damit kein Knopf versehentlich auslöst), Tab bleibt im Panel.
    el.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Tab') return;
      const items = [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((n) => !n.disabled && n.offsetParent !== null);
      if (!items.length) { ev.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === el)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    const before = document.activeElement;
    this.container.append(el);
    this.open_ = { def, panel, el, before };
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    if (def.pauses) this.session.setPaused('panel', true);
  }

  close() {
    if (!this.open_) return;
    const { panel, el, before } = this.open_;
    const hadFocus = el.contains(document.activeElement);
    panel.dispose?.();
    el.remove();
    this.open_ = null;
    // Fokus zurückgeben (z. B. an den HUD-Knopf, der das Panel geöffnet hat)
    if (hadFocus && before?.isConnected && before !== document.body) before.focus?.({ preventScroll: true });
    this.session.setPaused('panel', false);
  }

  toggle(id, params) { if (this.openId === id) this.close(); else this.open(id, params); }

  // Tastatur/Touch-Aktionen -> Panels (von PlayScene jeden Tick aufgerufen).
  handleInput(input) {
    let handled = false;
    if (input.pressed('pause')) {
      handled = true;
      if (this.open_) this.close();
      else if (this.registry.defs.has('menu')) this.open('menu');
      else handled = false;
    }
    for (const def of this.registry.defs.values()) {
      if (def.action && input.pressed(def.action)) { this.toggle(def.id); return true; }
    }
    return handled;
  }

  update(dt) {
    try { this.open_?.panel.update?.(dt); } catch (err) { console.error('Panel-Fehler, Panel wird geschlossen', err); this.close(); }
  }
  dispose() { this.close(); }
}
