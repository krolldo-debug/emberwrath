import { h } from '../core/dom.js';
import { REPORT_REASON_LABELS, REPORT_NOTE_MAX } from './protocol.js';

// Spieler melden (DSA Art. 16) und ignorieren. Erreichbar über den Namen im Chat und die Spielerliste im Weltfenster.
//
// Ignorieren wirkt nur auf diesem Gerät: Nachrichten der Person werden ausgeblendet. Gespeichert wird der öffentliche
// Schlüssel k des Kontos (vom Server, verrät die Konto-ID nicht), damit es auch nach Zonen- und Weltwechsel gilt.
// Melden schickt Grund, Beschreibung und die Erklärung „in gutem Glauben“ an den Welt-Server; der hängt die letzten
// Chatnachrichten der gemeldeten Person selbst an und speichert alles für die Verwaltung (worker/moderation.js).
const IGNORE_KEY = 'emberwrath:net:ignore';
const IGNORE_MAX = 200;

export class IgnoreList {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.items = [];
    try { const v = JSON.parse(storage?.getItem(IGNORE_KEY) ?? '[]'); if (Array.isArray(v)) this.items = v.filter((x) => x && typeof x.k === 'string'); } catch { this.items = []; }
  }
  has(k) { return !!k && this.items.some((x) => x.k === k); }
  toggle(k, name) {
    if (!k) return false;
    if (this.has(k)) this.items = this.items.filter((x) => x.k !== k);
    else this.items = [...this.items, { k, name }].slice(-IGNORE_MAX);
    try { this.storage?.setItem(IGNORE_KEY, JSON.stringify(this.items)); } catch { /* Speicher voll/gesperrt: gilt bis zum Neuladen */ }
    return this.has(k);
  }
}

const stopKeys = (el, onEscape) => {
  // Tastendrücke gehören dem Dialog, nicht dem Spiel (sonst läuft der Held los oder das Menü öffnet sich)
  el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); onEscape(); } });
  el.addEventListener('keyup', (e) => e.stopPropagation());
};

export class ModerationUi {
  constructor({ root, client, ignore, onSystem, input }) {
    this.root = root;
    this.client = client;
    this.ignore = ignore;
    this.onSystem = onSystem;
    this.input = input;
    this.menu = h('div.net-pmenu', { role: 'menu' });
    this.menu.hidden = true;
    this.dialog = null;
    this.pending = new Map(); // gemeldete id -> Name (für die Eingangsbestätigung)
    stopKeys(this.menu, () => this.closeMenu());
    this.onDoc = (e) => { if (!this.menu.hidden && !this.menu.contains(e.target) && !e.target.closest?.('.net-name, .net-plist-row')) this.closeMenu(); };
    document.addEventListener('pointerdown', this.onDoc);
    this.offs = [
      client.on('reported', (m) => this.#ack(m)),
      client.on('notice', (m) => {
        if (m.kind === 'name') {
          this.onSystem(`Dein Charaktername ist hier nicht erlaubt (${m.reason === 'reserviert' ? 'für das Team reserviert' : 'anstößig'}). Andere sehen dich als „${m.name}“. Um ihn zu ändern, wende dich an den Support.`);
          return;
        }
        if (m.kind !== 'muted') return;
        const until = new Date(m.until);
        const when = Number.isFinite(until.getTime()) ? until.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'auf Weiteres';
        this.onSystem(`Du bist bis ${when} im Chat gesperrt.${m.reason ? ` Grund: ${m.reason}` : ''} Einspruch über den Support.`);
      }),
    ];
  }

  attach() { if (!this.menu.isConnected) this.root.append(this.menu); if (this.dialog && !this.dialog.isConnected) this.root.append(this.dialog); }

  // Kleines Menü an einem Namen: Melden, Ignorieren
  openMenu(player, anchor) {
    if (!player || player.id === this.client.selfId) return;
    this.attach();
    this.returnFocus = document.activeElement;
    const ignored = this.ignore.has(player.k);
    this.menu.replaceChildren(
      h('div.net-pmenu-name', player.name),
      h('button.net-pmenu-btn', { type: 'button', role: 'menuitem', onclick: () => { this.closeMenu(); this.openReport(player); } }, 'Melden …'),
      h('button.net-pmenu-btn', {
        type: 'button', role: 'menuitem', disabled: !player.k,
        onclick: () => {
          const on = this.ignore.toggle(player.k, player.name);
          this.closeMenu();
          this.onSystem(on ? `Du ignorierst ${player.name}. Nachrichten von ${player.name} werden ausgeblendet.` : `Du ignorierst ${player.name} nicht mehr.`);
        },
      }, ignored ? 'Nicht mehr ignorieren' : 'Ignorieren'),
    );
    const r = anchor?.getBoundingClientRect?.();
    this.menu.style.left = `${Math.round(Math.min((r?.left ?? 20), window.innerWidth - 200))}px`;
    this.menu.style.top = `${Math.round(Math.max(8, (r?.top ?? 100) - 4 - 110))}px`;
    this.menu.hidden = false;
    this.menu.querySelector('button')?.focus();
  }
  closeMenu() {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    // Fokus zurück (z. B. ins Chatfeld), sonst landet Escape beim Spiel und öffnet das Menü
    if (this.menu.contains(document.activeElement) && this.returnFocus?.isConnected) this.returnFocus.focus();
  }

  openReport(player) {
    this.closeReport();
    this.input?.down?.clear?.();
    const reasons = Object.entries(REPORT_REASON_LABELS);
    const note = h('textarea.net-report-note', { maxlength: REPORT_NOTE_MAX, rows: 3, placeholder: 'Was ist passiert? (freiwillig, bei „Etwas anderes“ nötig)' });
    const faith = h('input', { type: 'checkbox' });
    const err = h('div.net-report-err', { role: 'alert' });
    const send = h('button.ef-btn.primary', { type: 'submit' }, 'Meldung senden');
    const form = h('form.net-report.ef-panel', {
      novalidate: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${player.name} melden`,
      onsubmit: (e) => {
        e.preventDefault();
        const reason = form.querySelector('input[name="reason"]:checked')?.value;
        if (!reason) { err.textContent = 'Bitte wähle einen Grund.'; return; }
        if (reason === 'sonstiges' && !note.value.trim()) { err.textContent = 'Bitte beschreibe kurz, worum es geht.'; note.focus(); return; }
        if (!faith.checked) { err.textContent = 'Bitte bestätige, dass deine Angaben stimmen.'; return; }
        if (!this.client.send({ t: 'report', id: player.id, reason, note: note.value.trim(), goodFaith: true })) {
          err.textContent = 'Keine Verbindung zur Welt. Bitte versuch es gleich noch einmal oder melde über den Support.';
          return;
        }
        this.pending.set(player.id, player.name);
        this.closeReport();
        this.onSystem(`Meldung zu ${player.name} wird gesendet …`);
      },
    },
    h('div.net-report-head', `${player.name} melden`),
    h('p.net-report-info', 'Deine Meldung geht an das Emberwrath-Team. Die letzten Chatnachrichten dieser Person werden automatisch angehängt. Du bekommst eine Bestätigung, sobald die Meldung eingegangen ist.'),
    h('fieldset.net-report-reasons', h('legend', 'Grund'),
      reasons.map(([id, label]) => h('label.net-report-reason', h('input', { type: 'radio', name: 'reason', value: id }), h('span', label)))),
    note,
    h('label.net-report-faith', faith, h('span', 'Ich bin überzeugt, dass meine Angaben richtig und vollständig sind.')),
    err,
    h('div.net-report-actions', h('button.ef-btn', { type: 'button', onclick: () => this.closeReport() }, 'Abbrechen'), send));
    form.addEventListener('input', () => { err.textContent = ''; });
    stopKeys(form, () => this.closeReport());
    this.dialog = h('div.net-report-wrap', form);
    this.dialog.addEventListener('pointerdown', (e) => { if (e.target === this.dialog) this.closeReport(); });
    this.root.append(this.dialog);
    form.querySelector('input[name="reason"]')?.focus();
  }
  closeReport() {
    if (!this.dialog) return;
    const had = this.dialog.contains(document.activeElement);
    this.dialog.remove(); this.dialog = null;
    if (had && this.returnFocus?.isConnected) this.returnFocus.focus();
  }

  #ack(m) {
    const name = this.pending.get(m.id) ?? 'die Person';
    this.pending.delete(m.id);
    if (m.ok) this.onSystem(`Danke. Deine Meldung zu ${name} ist eingegangen und wird vom Team geprüft.`);
    else if (m.error === 'rate') this.onSystem('Du hast gerade sehr viele Meldungen gesendet. Bitte warte ein paar Minuten.');
    else if (m.error === 'target') this.onSystem(`${name} ist nicht mehr in diesem Gebiet. Bitte melde über den Support (Spieler/Inhalt melden).`);
    else this.onSystem('Die Meldung konnte nicht angenommen werden. Bitte melde über den Support.');
  }

  dispose() {
    for (const off of this.offs) off();
    document.removeEventListener('pointerdown', this.onDoc);
    this.menu.remove();
    this.closeReport();
  }
}
