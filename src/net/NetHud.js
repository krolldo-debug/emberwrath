import { h } from '../core/dom.js';
import { NET_PATH, CHAT_MAX } from './protocol.js';
import { IgnoreList, ModerationUi } from './Moderation.js';

// HUD des Mehrspielers: Welt und Spielerzahl unter dem Zonennamen (Klick: Welt wechseln) und der Zonen-Chat.
// Chat: Enter öffnet/sendet, Escape schließt; auf Touch-Geräten über den Sprechblasen-Knopf.
// Bei offenem Chat öffnet ein Klick auf einen Namen „Melden“ / „Ignorieren“ (Moderation.js); dasselbe über die
// Spielerliste im Weltfenster (auch für Spieler, die nichts geschrieben haben, z. B. wegen ihres Namens).
const LOG_MAX = 60;
const FADE_MS = 20_000;

const STATUS_TEXT = {
  connecting: 'Verbinde mit der Welt …',
  retry: 'Verbindung unterbrochen · neuer Versuch …',
  unavailable: 'Welt-Server nicht erreichbar',
  replaced: 'An anderer Stelle angemeldet',
  auth: 'Anmeldung abgelaufen · bitte neu anmelden',
  version: 'Neue Version verfügbar · Seite neu laden',
};

export class NetHud {
  constructor(session, net) {
    this.s = session;
    this.net = net;
    this.client = net.client;
    this.root = session.game.ui.hud;
    this.others = 0;
    this.badge = h('button.net-world', { type: 'button', title: 'Welt wechseln', onclick: () => this.toggleWorlds() });
    this.badge.hidden = true;
    this.popup = h('div.net-worlds.ef-panel-lite', { role: 'dialog', 'aria-label': 'Welten' });
    this.popup.hidden = true;
    this.log = h('div.net-chat-log', { 'aria-live': 'polite' });
    this.input = h('input.net-chat-input', { type: 'text', maxlength: CHAT_MAX, placeholder: 'Nachricht an alle in diesem Gebiet', enterkeyhint: 'send', autocomplete: 'off', 'aria-label': 'Chat-Nachricht' });
    this.form = h('form.net-chat-form', { onsubmit: (e) => { e.preventDefault(); this.#send(); } }, this.input);
    this.chatBtn = h('button.net-chat-btn', { type: 'button', 'aria-label': 'Chat', title: 'Chat (Enter)', onclick: () => (this.open ? this.close() : this.openChat()) });
    this.chatEl = h('div.net-chat', this.log, this.form);
    this.chatEl.hidden = true;
    this.chatBtn.hidden = true;
    this.root.append(this.chatEl, this.chatBtn, this.popup);
    this.open = false;
    this.ignore = net.ignore ??= new IgnoreList();
    this.mod = new ModerationUi({ root: this.root, client: this.client, ignore: this.ignore, onSystem: (t) => this.system(t), input: session.input });
    this.chatEl.addEventListener('keydown', (e) => {
      // Tasten im Chat (Eingabe und Namen im Verlauf) gehören dem Chat (auch Escape, sonst öffnet sich das Spielmenü)
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.chatEl.addEventListener('keyup', (e) => e.stopPropagation());
    this.onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat || this.open || this.chatEl.hidden) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      if (this.s.panels?.openId) return;
      e.preventDefault();
      this.openChat();
    };
    window.addEventListener('keydown', this.onKey);
    this.onDocClick = (e) => { if (!this.popup.hidden && !this.popup.contains(e.target) && e.target !== this.badge) this.popup.hidden = true; };
    document.addEventListener('pointerdown', this.onDocClick);
  }

  // Badge sitzt unter „Offenes Gebiet“ im Zonenblock des HUD (Bereich D); sobald der da ist, einhängen.
  update() {
    if (!this.chatEl.isConnected) this.root.append(this.chatEl, this.chatBtn, this.popup);
    this.mod.attach();
    if (!this.badge.isConnected) this.root.querySelector('.hud-zone-sub')?.after(this.badge);
    const now = Date.now();
    if (!this.open) for (const el of this.log.children) if (!el.classList.contains('old') && now - el._at > FADE_MS) el.classList.add('old');
  }

  status(e, others) {
    this.others = others;
    const shared = !!e.zone;
    this.badge.hidden = !shared;
    this.chatEl.hidden = !shared;
    this.chatBtn.hidden = !shared;
    if (!shared) { this.close(); this.popup.hidden = true; }
    this.#badge();
  }

  onWelcome(m, others) {
    this.others = others;
    this.#badge();
    // Nach einem Wiederverbinden in dieselbe Welt keine neue Meldung
    const key = `${m.zone}~${m.world}`;
    if (key === this.lastWelcome) return;
    this.lastWelcome = key;
    const zone = this.s.zone?.def?.name ?? '';
    this.system(`Du bist in Welt ${m.world}${zone ? ` · ${zone}` : ''}. ${others ? `${others + 1} Spieler hier.` : 'Noch niemand sonst hier.'}`);
  }

  population(others) { this.others = others; this.#badge(); }

  #badge() {
    const c = this.client;
    const text = c.status === 'online'
      ? `Welt ${c.world} · ${this.others + 1} Spieler`
      : STATUS_TEXT[c.status] ?? '';
    if (this.badge.textContent !== text) this.badge.textContent = text;
    this.badge.dataset.status = c.status;
  }

  // player = { id, k, name } des Absenders (k fehlt bei eigenen Nachrichten)
  chat(m, own, player = null) {
    if (!own && player?.k && this.ignore.has(player.k)) return;
    const name = own || !player
      ? h('span.net-name', { class: own ? 'net-name own' : 'net-name', translate: 'no' }, `${m.name}:`)
      : h('button.net-name', { type: 'button', translate: 'no', title: `${m.name}: melden oder ignorieren`, onclick: (e) => this.mod.openMenu(player, e.currentTarget) }, `${m.name}:`);
    this.#push(h('div.net-line', name, ' ', h('span.net-text', { translate: 'no' }, m.text)));
  }

  system(text) { this.#push(h('div.net-line.sys', text)); }

  #push(line) {
    line._at = Date.now();
    this.log.append(line);
    while (this.log.children.length > LOG_MAX) this.log.firstElementChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  openChat() {
    if (this.chatEl.hidden) return;
    this.open = true;
    this.chatEl.classList.add('open');
    for (const el of this.log.children) el.classList.remove('old');
    this.s.input?.down?.clear?.(); // Held bleibt stehen, solange getippt wird
    this.input.focus();
    this.log.scrollTop = this.log.scrollHeight;
  }

  close() {
    this.open = false;
    this.chatEl.classList.remove('open');
    this.input.blur();
    const now = Date.now();
    for (const el of this.log.children) el._at = Math.min(el._at, now - FADE_MS + 6000);
  }

  #send() {
    const text = this.input.value.trim();
    if (text) {
      if (!this.client.send({ t: 'chat', text })) this.system('Nicht verbunden · Nachricht nicht gesendet.');
      this.input.value = '';
    }
    this.close();
  }

  async toggleWorlds() {
    if (!this.popup.hidden) { this.popup.hidden = true; return; }
    const c = this.client;
    if (!c.zone) return;
    this.popup.replaceChildren(h('div.net-worlds-head', 'Welten'), h('div.net-worlds-note', 'Lade …'));
    this.popup.hidden = false;
    let worlds = [];
    try {
      const res = await fetch(`${location.origin}${NET_PATH}/worlds?zone=${encodeURIComponent(c.zone)}`, { cache: 'no-store' });
      worlds = (await res.json()).worlds ?? [];
    } catch { worlds = []; }
    if (this.popup.hidden) return;
    if (c.world && !worlds.some((w) => w.world === c.world)) worlds.push({ world: c.world, n: this.others + 1, cap: c.cap });
    worlds.sort((a, b) => a.world - b.world);
    const rows = worlds.map((w) => {
      const mine = w.world === c.world;
      const full = w.n >= w.cap && !mine;
      return h('button.net-worlds-row', {
        type: 'button', disabled: mine || full, 'aria-current': mine ? 'true' : null,
        onclick: () => { this.popup.hidden = true; this.system(`Wechsle in Welt ${w.world} …`); c.switchWorld(w.world); },
      }, h('span', `Welt ${w.world}`), h('span.net-worlds-n', mine ? `${w.n} · du bist hier` : full ? 'voll' : `${w.n} / ${w.cap}`));
    });
    const people = [...(this.net.session?.remotes?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const plist = people.length ? [
      h('div.net-worlds-head.sub', `Spieler in diesem Gebiet (${people.length})`),
      h('div.net-plist', people.slice(0, 40).map((r) => h('button.net-plist-row', {
        type: 'button', title: 'Melden oder ignorieren',
        onclick: (e) => this.mod.openMenu({ id: r.netId, k: r.k, name: r.name }, e.currentTarget),
      }, h('span', { translate: 'no' }, r.name), h('span.net-worlds-n', `${this.ignore.has(r.k) ? 'ignoriert · ' : ''}Stufe ${r.level}`)))),
    ] : [];
    const note = h('div.net-worlds-note', `Jede Welt fasst bis zu ${c.cap || 40} Spieler je Gebiet. Ist eine voll, öffnet sich automatisch die nächste.`);
    this.popup.replaceChildren(h('div.net-worlds-head', 'Welten'), ...rows, note, ...plist);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.onDocClick);
    this.mod.dispose();
    this.badge.remove(); this.chatEl.remove(); this.chatBtn.remove(); this.popup.remove();
  }
}
