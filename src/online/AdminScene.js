import { h } from '../core/dom.js';
import { MenuScene } from '../account/TitleScene.js';
import { describeError } from './AuthClient.js';

// Verwaltung (Szene 'admin'): Kennzahlen, Konten und Charaktere aller Spieler.
// Die Daten kommen aus den Datenbankfunktionen admin_stats/admin_users/admin_characters. Diese prüfen serverseitig,
// ob das angemeldete Konto in public.admins steht; für alle anderen antworten sie mit „Kein Zugriff“.
// Die Oberfläche fragt vorher is_admin() nur, um eine passende Meldung zu zeigen – geschützt wird auf dem Server.
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const PROVIDER = { email: 'E-Mail', google: 'Google', apple: 'Apple' };

export class AdminScene extends MenuScene {
  enter() {
    this.online = this.game.online;
    this.tab = 'users';
    this.filter = '';
    this.data = null;
    this.root = h('div.ef-screen.acc-screen.on-screen.on-admin');
    this.#load();
  }

  back() { this.game.scenes.go('login', { mode: this.online.user ? 'account' : 'login' }); }

  #shell(...body) {
    this.root.replaceChildren(h('div.ef-panel.acc-panel.on-panel.on-admin-panel',
      h('header.acc-head',
        h('button.acc-back', { type: 'button', onclick: () => this.back(), 'aria-label': 'Zurück' }, '‹'),
        h('div', h('h2.ef-sub', 'Verwaltung'), h('p.acc-step', 'Konten und Charaktere aller Spieler')),
        this.data ? h('button.ef-btn.acc-small.on-refresh', { type: 'button', onclick: () => this.#load() }, 'Aktualisieren') : null),
      ...body));
  }

  async #load() {
    const o = this.online;
    if (!o.configured) { this.#shell(h('p.acc-lead', 'Online-Konten sind noch nicht eingerichtet.')); return; }
    if (!o.user) {
      this.#shell(h('p.acc-lead', 'Bitte melde dich mit deinem Admin-Konto an.'),
        h('button.ef-btn.primary', { type: 'button', onclick: () => this.game.scenes.go('login', { mode: 'login' }) }, 'Anmelden'));
      return;
    }
    this.#shell(h('p.acc-lead', 'Daten werden geladen …'));
    try {
      if (!(await o.isAdmin())) { this.#shell(h('p.acc-lead', 'Kein Zugriff. Dieses Konto hat keine Verwaltungsrechte.')); return; }
      const [stats, users, chars] = await Promise.all([
        o.client.rpc('admin_stats'),
        o.client.rpc('admin_users', { p_limit: 1000 }),
        o.client.rpc('admin_characters', { p_limit: 2000 }),
      ]);
      this.data = { stats, users: users ?? [], chars: chars ?? [], at: Date.now() };
      this.#render();
    } catch (e) {
      this.#shell(h('p.on-msg.error', { role: 'alert' }, describeError(e)),
        h('button.ef-btn', { type: 'button', onclick: () => this.#load() }, 'Erneut versuchen'));
    }
  }

  #render() {
    const { stats: s } = this.data;
    const tile = (label, value, sub) => h('div.on-tile', h('span.on-tile-value', value ?? '–'), h('span.on-tile-label', label), sub ? h('span.on-tile-sub', sub) : null);
    const tiles = h('div.on-tiles',
      tile('Registrierte Konten', s.users, `${s.users_confirmed} bestätigt`),
      tile('Neu (7 Tage)', s.users_7d),
      tile('Aktiv (7 Tage)', s.users_active_7d),
      tile('Charaktere', s.characters),
      tile('Ø Stufe', s.avg_level ?? '–', s.max_level ? `höchste ${s.max_level}` : null));

    const levels = Object.entries(s.levels ?? {}).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      days.push([key, s.signups_by_day?.[key] ?? 0]);
    }
    const charts = h('div.on-charts',
      this.#bars('Charaktere je Stufe', levels.map(([lv, n]) => ({ label: String(lv), value: n, tip: `Stufe ${lv}: ${n} ${n === 1 ? 'Charakter' : 'Charaktere'}` })), 'Noch keine Charaktere.'),
      this.#bars('Registrierungen, letzte 30 Tage', days.map(([d, n], i) => ({ label: (i % 7 === 1) || i === 29 ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : '', value: n, tip: `${d.slice(8, 10)}.${d.slice(5, 7)}.: ${n} ${n === 1 ? 'Registrierung' : 'Registrierungen'}` })), null));

    const tabs = h('div.on-tabs', { role: 'tablist' },
      ['users', 'chars'].map((t) => h(`button.on-tab${this.tab === t ? '.active' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': this.tab === t ? 'true' : 'false',
        onclick: () => { this.tab = t; this.#render(); },
      }, t === 'users' ? `Konten (${this.data.users.length})` : `Charaktere (${this.data.chars.length})`)));
    const search = h('input.ef-input.on-search', { type: 'search', placeholder: 'Suchen (Name, E-Mail, Klasse …)', value: this.filter, 'aria-label': 'Tabelle durchsuchen' });
    const tableSlot = h('div.on-table-wrap');
    search.addEventListener('input', () => { this.filter = search.value; tableSlot.replaceChildren(this.#table()); });
    tableSlot.append(this.#table());

    this.#shell(tiles, charts, h('div.on-table-head', tabs, search), tableSlot,
      h('p.acc-meta.on-foot', `Stand ${fmtDateTime(this.data.at)} · Stufen stammen aus den Spielständen der Spieler (vom Gerät gemeldet).`));
  }

  // Einfaches Säulendiagramm (eine Reihe, Hover-Titel je Säule).
  #bars(title, items, empty) {
    if (!items.length || (empty && items.every((i) => !i.value))) return h('figure.on-chart', h('figcaption', title), h('p.acc-meta', empty ?? 'Keine Daten.'));
    const max = Math.max(1, ...items.map((i) => i.value));
    return h('figure.on-chart', h('figcaption', title),
      h('div.on-bars', { role: 'img', 'aria-label': `${title}: ${items.map((i) => i.tip).join(', ')}` },
        items.map((i) => h('div.on-bar-col', { title: i.tip },
          h('span.on-bar-val', i.value && items.length <= 20 ? String(i.value) : ''),
          h('span.on-bar', { style: { height: `${Math.max(i.value ? 4 : 0, (i.value / max) * 100)}%` } }),
          h('span.on-bar-label', i.label)))));
  }

  #table() {
    const q = this.filter.trim().toLowerCase();
    const match = (...vals) => !q || vals.some((v) => String(v ?? '').toLowerCase().includes(q));
    const content = this.game.content;
    if (this.tab === 'users') {
      const rows = this.data.users.filter((u) => match(u.email, u.display_name, ...(u.providers ?? [])));
      return h('table.on-table',
        h('thead', h('tr', ['Spieler', 'E-Mail', 'Anmeldung über', 'Registriert', 'Zuletzt angemeldet', 'Charaktere', 'Höchste Stufe'].map((t) => h('th', t)))),
        h('tbody', rows.length ? rows.map((u) => h('tr',
          h('td', u.display_name ?? '–', u.is_admin ? h('span.ef-badge.on-badge', 'Admin') : null),
          h('td', u.email ?? '–', u.confirmed ? null : h('span.ef-badge', 'unbestätigt')),
          h('td', (u.providers ?? []).map((p) => PROVIDER[p] ?? p).join(', ') || '–'),
          h('td', fmtDate(u.registered_at)),
          h('td', fmtDateTime(u.last_sign_in_at)),
          h('td.num', String(u.characters ?? 0)),
          h('td.num', u.max_level != null ? String(u.max_level) : '–'))) : h('tr', h('td', { colspan: 7 }, 'Keine Treffer.'))));
    }
    const rows = this.data.chars.filter((c) => match(c.name, c.email, c.class_id, c.race_id, content.find('class', c.class_id)?.name, content.find('race', c.race_id)?.name));
    return h('table.on-table',
      h('thead', h('tr', ['Charakter', 'Konto', 'Volk', 'Klasse', 'Stufe', 'Gebiet', 'Erstellt', 'Zuletzt gespielt'].map((t) => h('th', t)))),
      h('tbody', rows.length ? rows.map((c) => h('tr',
        h('td', c.name),
        h('td', c.email ?? '–'),
        h('td', content.find('race', c.race_id)?.name ?? c.race_id ?? '–'),
        h('td', content.find('class', c.class_id)?.name ?? c.class_id ?? '–'),
        h('td.num', String(c.level)),
        h('td', content.find('zone', c.zone_id)?.name ?? c.zone_id ?? '–'),
        h('td', fmtDate(c.created_at)),
        h('td', fmtDateTime(c.saved_at)))) : h('tr', h('td', { colspan: 8 }, 'Keine Treffer.'))));
  }
}
