import { h, clear } from '../core/dom.js';
import { fmtNum } from '../i18n/index.js';
import { TIMING, tierOf } from './rules.js';
import { tierEmblem } from './art.js';

// Anzeige der Glutarena (HTML-Ebene, so wenig wie möglich):
//   - Suche: kleine Leiste oben (wie die Dungeonsuche) mit Zeit, Klick öffnet das Fenster (Taste O)
//   - Kampf: Gegner oben in der Mitte wie ein Boss (Name, Liga, Leben), darunter die Kampfzeit;
//     ab dem Glutsturm glüht die Zeit. Das eigene Leben steht wie immer links oben.
//   - Gong: 3 – 2 – 1 – Kampf!
//   - Ergebnis: Sieg/Niederlage, Wertung, Gold; „Nächster Kampf“ oder „Zurück“
const REASON = {
  time: 'Die Zeit ist abgelaufen.',
  left: 'Dein Gegner hat den Kampf verlassen.',
  absent: 'Dein Gegner ist nicht angetreten.',
};
const TITLE = { win: 'Sieg', loss: 'Niederlage', draw: 'Unentschieden', void: 'Kampf abgebrochen' };
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class ArenaHud {
  constructor(session, pvp, arena) {
    this.s = session;
    this.pvp = pvp;
    this.arena = arena;
    const root = session.game.ui.hud;

    this.pill = h('button.fd-pill.pv-pill', { type: 'button', onclick: () => session.panels.open('finder', { tab: 'arena' }) });
    this.pill.hidden = true;

    this.name = h('span.pv-name', { translate: 'no' });
    this.emblem = h('img.pv-emblem', { alt: '', width: 16, height: 16 });
    this.fill = h('div.hud-bar-fill');
    this.lag = h('div.hud-bar-lag');
    this.hpText = h('span.hud-bar-text');
    this.timer = h('span.pv-timer');
    this.top = h('div.pv-top', { 'aria-live': 'off' },
      h('div.pv-foe', this.emblem, this.name),
      h('div.hud-meter.boss.pv-meter', this.lag, this.fill, this.hpText),
      this.timer);
    this.top.hidden = true;

    this.count = h('div.pv-count', { 'aria-live': 'assertive' });
    this.count.hidden = true;

    this.card = h('div.pv-result.ef-panel', { role: 'dialog', 'aria-label': 'Ergebnis' });
    this.card.hidden = true;

    root.append(this.pill, this.top, this.count, this.card);
    this.offs = [pvp.game.bus.on('pvp:changed', () => this.#state())];
    this.lagF = 1;
    this.#state();
  }

  #state() {
    const q = this.pvp.state === 'queued' && !this.duel;
    this.pill.hidden = !q;
    if (q) this.#pillText();
  }

  #pillText() {
    const t = clock(Date.now() - this.pvp.since);
    const txt = `Glutarena · ${t}`;
    if (this.pill.textContent !== txt) this.pill.textContent = txt;
  }

  begin(duel) {
    this.duel = duel;
    this.pill.hidden = true;
    this.card.hidden = true;
    const foe = duel.match.foe ?? {};
    this.name.textContent = foe.name ?? '';
    this.emblem.src = tierEmblem(tierOf(foe.rating ?? 1000).id, 1);
    this.emblem.title = tierOf(foe.rating ?? 1000).name;
    this.top.hidden = false;
    this.lagF = 1;
    this.lastCount = null;
  }

  finish() {
    this.duel = null;
    this.top.hidden = true;
    this.count.hidden = true;
    this.card.hidden = true;
    this.#state();
  }

  update(dt) {
    if (!this.pill.hidden) this.#pillText();
    const d = this.duel;
    if (!d) return;
    const r = d.rival, f = r ? Math.max(0, Math.min(1, r.hp / (r.maxHp || 1))) : 1;
    this.fill.style.setProperty('--f', f.toFixed(3));
    this.lagF = Math.max(f, this.lagF - dt * 0.6);
    this.lag.style.setProperty('--f', this.lagF.toFixed(3));
    const hpTxt = `${fmtNum(Math.ceil(r?.hp ?? 0))} / ${fmtNum(r?.maxHp ?? 0)}`;
    if (this.hpText.textContent !== hpTxt) this.hpText.textContent = hpTxt;
    // Gong und Kampfzeit
    const now = performance.now(), go = d.match.go;
    let left = TIMING.matchMs, cd = null;
    if (go == null) cd = '';
    else if (now < go) cd = String(Math.ceil((go - now) / 1000));
    else { left = TIMING.matchMs - (now - go); if (now - go < 700) cd = 'Kampf!'; }
    if (d.over) left = Math.max(0, left);
    const storm = this.arena.storm > 1;
    const tt = clock(Math.max(0, left));
    if (this.timer.textContent !== tt) this.timer.textContent = tt;
    this.timer.classList.toggle('storm', storm);
    this.timer.title = storm ? 'Glutsturm: Jeder Treffer wird stärker.' : '';
    if (cd !== this.lastCount) {
      this.lastCount = cd;
      this.count.hidden = cd == null || cd === '' || d.over;
      this.count.textContent = cd ?? '';
      this.count.classList.toggle('go', cd === 'Kampf!');
      if (cd && cd !== 'Kampf!') this.s.sfx?.play?.('ui');
    }
  }

  // Ergebnis: { result, reason, delta, gold, me, pending } (pending: gegen Herausforderer, Wertung folgt vom Server)
  result(e) {
    const d = this.duel;
    this.count.hidden = true;
    clear(this.card);
    const res = e.result ?? 'void';
    const me = e.me ?? null;
    const tier = me ? tierOf(me.rating) : null;
    const delta = Number(e.delta) || 0;
    const rows = [];
    if (me) {
      rows.push(h('div.pv-rating',
        h('img.pv-emblem', { src: tierEmblem(tier.id, 2), alt: '', width: 32, height: 32 }),
        h('span.pv-tier', { style: { color: tier.color } }, tier.name),
        h('b.pv-num', fmtNum(me.rating)),
        delta ? h(`span.pv-delta${delta > 0 ? '.up' : '.down'}`, delta > 0 ? `+${fmtNum(delta)}` : `−${fmtNum(-delta)}`) : null));
    } else if (e.pending) rows.push(h('div.pv-rating.pending', '…'));
    if (e.gold > 0) rows.push(h('div.pv-gold', `+${fmtNum(e.gold)} Gold`));
    const why = REASON[e.reason];
    this.card.className = `pv-result ef-panel ${res}`;
    this.card.append(...[
      h('h2.pv-title', TITLE[res] ?? TITLE.void),
      why && res !== 'loss' ? h('p.pv-why', why) : null,
      ...rows,
      h('div.pv-foot',
        h('button.ef-btn', { type: 'button', onclick: () => this.pvp.returnHome() }, 'Zurück'),
        h('button.ef-btn.primary', { type: 'button', onclick: () => { const r = this.pvp.queue(); if (r.ok) this.pvp.returnHome(); } }, 'Nächster Kampf')),
    ].filter(Boolean));
    this.card.hidden = false;
    if (d && e.pending) this.s.sfx?.play?.(res === 'win' ? 'quest' : 'ui');
    if (!e.pending && d?.local == null) this.s.sfx?.play?.(res === 'win' ? 'quest' : 'ui');
  }

  dispose() {
    for (const off of this.offs) off();
    this.pill.remove(); this.top.remove(); this.count.remove(); this.card.remove();
  }
}
