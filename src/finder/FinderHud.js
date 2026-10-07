import { h, clear } from '../core/dom.js';
import { iconUrl } from '../gfx/Icons.js';
import { ROLES } from './protocol.js';
import { finderIcon } from './icons.js';
import { tr } from '../i18n/index.js';

// HUD der Gruppensuche (HTML-Ebene):
//   Menüknopf „Dungeonsuche“ (in der Knopfreihe des HUD, Taste O), Suchanzeige mit Zeit,
//   Bereitschaftsfenster „Gruppe gefunden“, Gruppenanzeige (Leben/Ressource der Mitspieler),
//   Gruppenchat (Enter), Hinweis bei eigenem Tod, Abschlussleiste nach dem Endboss.
const LOG_MAX = 40;
const FADE_MS = 25_000;

export class FinderHud {
  constructor(session, finder, fs) {
    this.s = session;
    this.finder = finder;
    this.fs = fs;                 // FinderSession (Party, Chat senden)
    this.root = session.game.ui.hud;
    const content = session.content;

    this.menuBtn = h('button.hud-menu-btn.fd-menu-btn', {
      type: 'button', title: 'Dungeonsuche (O)', 'aria-label': 'Dungeonsuche',
      onclick: () => { session.sfx?.play?.('ui'); session.panels.toggle('finder'); },
    }, h('img.ef-icon.hud-menu-icon', { src: finderIcon('group', 2), alt: '', width: 30, height: 30, draggable: 'false' }),
    h('span.hud-menu-label', 'Dungeonsuche'), h('kbd.hud-key', 'O'));

    this.queueEl = h('button.fd-pill', { type: 'button', onclick: () => session.panels.open('finder') });
    this.queueEl.hidden = true;

    this.propEl = h('div.fd-prop.ef-panel', { role: 'dialog', 'aria-label': 'Gruppe gefunden' });
    this.propEl.hidden = true;

    this.partyEl = h('div.fd-party', { 'aria-label': 'Gruppe' });
    this.partyEl.hidden = true;

    this.log = h('div.fd-log', { 'aria-live': 'polite' });
    this.input = h('input.fd-input', { type: 'text', maxlength: 120, placeholder: 'Nachricht an die Gruppe', enterkeyhint: 'send', autocomplete: 'off', 'aria-label': 'Gruppenchat' });
    this.form = h('form.fd-form', { onsubmit: (e) => { e.preventDefault(); this.#send(); } }, this.input);
    this.chatBtn = h('button.fd-chat-btn', { type: 'button', 'aria-label': 'Gruppenchat', title: 'Gruppenchat (Enter)', onclick: () => (this.open ? this.close() : this.openChat()) });
    this.chatEl = h('div.fd-chat', this.log, this.form);
    this.chatEl.hidden = true;
    this.chatBtn.hidden = true;
    this.open = false;

    this.deadEl = h('div.fd-dead', h('p.fd-dead-title', 'Du bist gefallen'), h('p.fd-dead-sub', 'Deine Gruppe kämpft weiter. Nach dem Kampf stehst du wieder auf.'));
    this.deadEl.hidden = true;

    this.doneEl = h('div.fd-done.ef-panel');
    this.doneEl.hidden = true;

    this.frames = new Map();
    this.root.append(this.queueEl, this.propEl, this.partyEl, this.chatEl, this.chatBtn, this.deadEl, this.doneEl);

    this.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'KeyO' && !e.repeat) {
        if (this.s.panels.openId && this.s.panels.openId !== 'finder') return;
        e.preventDefault();
        this.s.panels.toggle('finder');
        return;
      }
      if (e.key === 'Enter' && !e.repeat && !this.open && !this.chatEl.hidden && !this.s.panels.openId && t?.tagName !== 'BUTTON') {
        e.preventDefault();
        this.openChat();
      }
    };
    window.addEventListener('keydown', this.onKey);
    this.offs = [
      session.game.bus.on('finder:changed', () => this.#state()),
      session.game.bus.on('finder:chat', (m) => this.line(m)),
    ];
    this.content = content;
    this.#state();
  }

  // ------------------------------------------------------------------ Zustand
  #state() {
    const st = this.finder.state;
    const searching = st === 'queued' || st === 'accepted' || st === 'proposal';
    this.queueEl.hidden = !searching || st === 'proposal' || st === 'accepted';
    if (st === 'proposal' || st === 'accepted') {
      if (this.s.panels.openId === 'finder') this.s.panels.close();
      this.#renderProposal();
    } else this.propEl.hidden = true;
    this.menuBtn.classList.toggle('fd-busy', st !== 'idle');
  }

  #renderProposal() {
    const g = this.finder.group;
    if (!g) return;
    const d = this.content.find('zone', g.dungeonId);
    const accepted = this.finder.state === 'accepted';
    if (this.propFor !== g.id) {
      this.propFor = g.id;
      clear(this.propEl);
      this.propRows = new Map();
      const list = h('ul.fd-prop-list');
      for (const m of g.members) {
        const cls = this.content.find('class', m.classId);
        const mark = h('span.fd-ready', { 'aria-label': 'wartet' });
        const row = h('li.fd-prop-row',
          h('img.ef-icon.fd-role-icon', { src: finderIcon(m.role, 1), alt: ROLES[m.role]?.name ?? '', title: ROLES[m.role]?.name ?? '', width: 16, height: 16 }),
          cls ? h('img.ef-icon', { src: iconUrl(cls.icon), alt: '', width: 18, height: 18 }) : null,
          h('span.fd-prop-name', { translate: 'no' }, m.name, m.self ? h('span', ' (du)') : null),
          m.kind === 'merc' && this.finder.labelMercs ? h('span.fd-tag', { title: 'Füllt einen freien Platz' }, 'Söldner') : null,
          h('span.fd-prop-lv', `Stufe ${m.level} ${cls?.name ?? ''}`),
          mark);
        this.propRows.set(m.kind === 'merc' ? m.id : m.ticketId, mark);
        list.append(row);
      }
      this.propBar = h('i');
      this.propBtns = h('div.fd-prop-btns',
        h('button.ef-btn.danger', { type: 'button', onclick: () => this.finder.respond(false) }, 'Ablehnen'),
        h('button.ef-btn.primary', { type: 'button', onclick: () => this.finder.respond(true) }, 'Betreten'));
      this.propWait = h('p.fd-prop-wait', 'Warte auf die anderen …');
      this.propEl.append(
        h('p.fd-prop-kicker', 'Gruppe gefunden'),
        h('h2.ef-sub.fd-prop-title', d?.name ?? 'Dungeon'),
        list,
        h('div.fd-prop-timer', this.propBar),
        this.propBtns, this.propWait);
    }
    this.propEl.hidden = false;
    this.propBtns.hidden = accepted;
    this.propWait.hidden = !accepted;
    for (const [id, mark] of this.propRows) {
      const ok = this.finder.ready.has(id);
      mark.classList.toggle('ok', ok);
      mark.setAttribute('aria-label', ok ? 'bereit' : 'wartet');
    }
  }

  // ------------------------------------------------------------------ Tick
  update() {
    // Knopf in die Menüreihe des HUD einhängen (vor „Menü“), sobald es sie gibt
    if (!this.menuBtn.isConnected) {
      const list = this.root.querySelector('.hud-menu-list');
      const pause = list?.querySelector('[data-action="pause"]');
      if (list) list.insertBefore(this.menuBtn, pause ?? null);
    }
    for (const el of [this.queueEl, this.propEl, this.partyEl, this.chatEl, this.chatBtn, this.deadEl, this.doneEl]) if (!el.isConnected) this.root.append(el);
    const f = this.finder;
    if (!this.queueEl.hidden) {
      const s = Math.floor((Date.now() - (f.req?.since ?? Date.now())) / 1000);
      const d = this.content.find('zone', f.req?.dungeonId);
      const text = `Suche Gruppe · ${d?.name ?? ''} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (this.queueEl.textContent !== tr(text)) this.queueEl.textContent = tr(text);
    }
    if (!this.propEl.hidden && f.group) {
      const left = Math.max(0, f.group.expires - Date.now());
      this.propBar.style.setProperty('--f', (left / 30000).toFixed(3));
      this.#renderProposal();
    }
    this.#party();
    const now = Date.now();
    if (!this.open) for (const el of this.log.children) if (!el.classList.contains('old') && now - el._at > FADE_MS) el.classList.add('old');
  }

  #party() {
    const party = this.fs.party;
    const show = !!party;
    this.partyEl.hidden = !show;
    this.chatEl.hidden = !show;
    this.chatBtn.hidden = !show;
    if (!show) {
      if (this.open) this.close();
      this.deadEl.hidden = true;
      this.doneEl.hidden = true;
      if (this.frames.size) { clear(this.partyEl); this.frames.clear(); }
      return;
    }
    for (const b of party.bots) {
      let f = this.frames.get(b);
      if (!f) {
        const cls = b.cls;
        const hp = h('i.fd-hp'), res = h('i.fd-res', { style: { '--c': b.resourceColor } });
        const st = h('span.fd-fstate');
        f = { hp, res, st, el: h('div.fd-frame',
          h('div.fd-fhead',
            h('img.ef-icon.fd-role-icon', { src: finderIcon(b.member.role, 1), alt: ROLES[b.member.role]?.name ?? '', title: ROLES[b.member.role]?.name ?? '', width: 16, height: 16 }),
            h('img.ef-icon', { src: iconUrl(cls.icon), alt: '', width: 16, height: 16, title: cls.name }),
            h('span.fd-fname', b.name),
            h('span.fd-flv', String(b.level)),
            this.finder.labelMercs ? h('img.ef-icon.fd-merc', { src: finderIcon('merc', 1), alt: 'Söldner', title: 'Söldner', width: 12, height: 12 }) : null),
          h('div.fd-bar', hp), h('div.fd-bar.thin', res), st) };
        this.frames.set(b, f);
        this.partyEl.append(f.el);
      }
      f.hp.style.setProperty('--f', (b.dead ? 0 : b.hp / b.maxHp).toFixed(3));
      f.res.style.setProperty('--f', (b.maxResource ? b.resource / b.maxResource : 0).toFixed(3));
      const state = b.dead ? 'Gefallen' : '';
      if (f.st.textContent !== tr(state)) f.st.textContent = tr(state);
      f.el.classList.toggle('dead', !!b.dead);
      f.el.classList.toggle('low', !b.dead && b.hp / b.maxHp < 0.3);
    }
    this.deadEl.hidden = !(party.player.dead && party.bots.some((b) => !b.dead));
    this.#done(party);
  }

  // Nach dem Endboss: Rückweg anbieten
  #done(party) {
    const b = party.world.boss;
    const done = !!b?.dead;
    if (done && this.doneEl.hidden && !this.doneShown) {
      this.doneShown = true;
      const home = this.content.find('zone', this.finder.origin?.zoneId);
      clear(this.doneEl);
      this.doneEl.append(
        h('p.fd-done-title', 'Dungeon abgeschlossen'),
        h('div.fd-done-btns',
          home ? h('button.ef-btn.primary', { type: 'button', onclick: () => this.finder.returnHome() }, `Zurück: ${home.name}`) : null,
          h('button.ef-btn', { type: 'button', onclick: () => { this.doneEl.hidden = true; } }, 'Noch bleiben')));
      this.doneEl.hidden = false;
    }
  }

  // ------------------------------------------------------------------ Chat
  line({ from = null, text, kind = 'group', merc = false }) {
    const el = kind === 'sys'
      ? h('div.fd-line.sys', text)
      : h('div.fd-line', h('span.fd-lgroup', '[Gruppe] '), h('span', { class: from?.self ? 'fd-lname own' : 'fd-lname', translate: 'no' }, `${from?.name ?? '?'}:`), ' ', h('span.fd-ltext', { translate: merc || from?.kind === 'merc' ? null : 'no' }, text));
    el._at = Date.now();
    this.log.append(el);
    while (this.log.children.length > LOG_MAX) this.log.firstElementChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  openChat() {
    this.open = true;
    this.chatEl.classList.add('open');
    for (const el of this.log.children) el.classList.remove('old');
    this.input.focus();
  }

  close() {
    this.open = false;
    this.chatEl.classList.remove('open');
    this.input.blur();
  }

  #send() {
    const text = this.input.value.replace(/\s+/g, ' ').trim().slice(0, 120);
    this.input.value = '';
    this.close();
    if (text) this.fs.playerSays(text);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    for (const off of this.offs) off();
    for (const el of [this.menuBtn, this.queueEl, this.propEl, this.partyEl, this.chatEl, this.chatBtn, this.deadEl, this.doneEl]) el.remove();
  }
}
