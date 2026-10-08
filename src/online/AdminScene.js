import { h } from '../core/dom.js';
import { MenuScene } from '../account/TitleScene.js';
import { backButton } from '../account/ui.js';
import { describeError } from './AuthClient.js';
import { renderChatReports } from '../net/AdminReports.js';

// Verwaltung (Szene 'admin'): Kennzahlen, Konten und Charaktere aller Spieler.
// Die Daten kommen aus den Datenbankfunktionen admin_stats/admin_users/admin_characters. Diese prüfen serverseitig,
// ob das angemeldete Konto in public.admins steht; für alle anderen antworten sie mit „Kein Zugriff“.
// Die Oberfläche fragt vorher is_admin() nur, um eine passende Meldung zu zeigen – geschützt wird auf dem Server.
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const PROVIDER = { email: 'E-Mail', google: 'Google' };
// Auffälligkeiten aus der Spielstand-Prüfung (supabase/migrations/20261003130000_spielstand_pruefung.sql)
const FLAG_REASON = { stufe: 'Stufe zu schnell gestiegen', gold: 'Gold zu schnell gestiegen', spielzeit: 'Spielzeit schneller als echte Zeit', grenze: 'Außerhalb der Grenzen', neu: 'Neuer Charakter nicht im Startstand', startpaket: 'Neuer Charakter mit mehr als dem Startpaket', design: 'Shop-Design ohne Kauf', rueckbuchung: 'Zurückgebuchtes Gold nicht abgezogen', gegenstaende: 'Unmögliche Gegenstände' };
const FLAGS_PAGE = 200;
const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('de-DE') : '?');
const fmtMin = (sec) => `${fmtNum(Math.round(Number(sec) / 60))} min`;
// detail: { level, gold } (grenze), { level, gold, playTime } (neu) oder { level: [alt, neu], gold: [alt, neu], playTime: [alt, neu], realSeconds, verified }
function flagDetail(d = {}) {
  const pair = (v, f) => (Array.isArray(v) ? `${f(v[0])} → ${f(v[1])}` : f(v));
  const parts = [];
  if (d.level != null) parts.push(`Stufe ${pair(d.level, fmtNum)}`);
  if (d.gold != null) parts.push(`Gold ${pair(d.gold, fmtNum)}`);
  if (Array.isArray(d.playTime)) parts.push(`Spielzeit +${fmtMin(d.playTime[1] - d.playTime[0])}`);
  if (d.realSeconds != null) parts.push(`echte Zeit ${fmtMin(d.realSeconds)}`);
  return parts.join(' · ') || '–';
}

export class AdminScene extends MenuScene {
  enter() {
    this.online = this.game.online;
    this.tab = 'users';
    this.filter = '';
    this.data = null;
    this.flags = null;
    this.root = h('div.ef-screen.acc-screen.on-screen.on-admin');
    this.#load();
  }

  back() { this.game.scenes.go('login', { mode: this.online.user ? 'account' : 'login' }); }

  #shell(...body) {
    this.root.replaceChildren(h('div.ef-panel.acc-panel.on-panel.on-admin-panel',
      h('header.acc-head',
        backButton(() => this.back()),
        h('div', h('h2.ef-sub', 'Verwaltung'), h('p.acc-step', 'Konten und Charaktere aller Spieler')),
        this.data ? h('button.ef-btn.acc-small.on-refresh', { type: 'button', onclick: () => { this.flags = null; this.#load(); } }, 'Aktualisieren') : null),
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

    const TAB_LABEL = { users: `Konten (${this.data.users.length})`, chars: `Charaktere (${this.data.chars.length})`, reports: 'Meldungen', flags: this.flags?.rows ? `Auffälligkeiten (${this.flags.rows.length}${this.flags.more ? '+' : ''})` : 'Auffälligkeiten' };
    const tabs = h('div.on-tabs', { role: 'tablist' },
      ['users', 'chars', 'reports', 'flags'].map((t) => h(`button.on-tab${this.tab === t ? '.active' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': this.tab === t ? 'true' : 'false',
        onclick: () => { this.tab = t; this.#render(); },
      }, TAB_LABEL[t])));
    const tableSlot = h('div.on-table-wrap');
    let search = null;
    if (this.tab === 'reports') {
      // Chat-Meldungen (DSA): Daten und Rechte prüfen admin_chat_reports/…_resolve/…_mute serverseitig (assert_admin)
      tableSlot.replaceChildren(renderChatReports(this.online.client));
    } else {
      search = h('input.ef-input.on-search', { type: 'search', placeholder: 'Suchen (Name, E-Mail, Klasse …)', value: this.filter, 'aria-label': 'Tabelle durchsuchen' });
      search.addEventListener('input', () => { this.filter = search.value; tableSlot.replaceChildren(this.#table()); });
      tableSlot.append(this.#table());
      if (this.tab === 'flags' && !this.flags) this.#loadFlags();
    }

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

  // Auffälligkeiten erst beim Öffnen des Reiters laden (ohne Migration bleibt der Rest der Verwaltung nutzbar).
  async #loadFlags(more = false) {
    const prev = more ? this.flags.rows : [];
    this.flags = { rows: more ? prev : null, loading: true, more };
    if (more) this.#render(); // sonst zeichnet #render gerade selbst („wird geladen …“)
    try {
      const rows = (await this.online.client.rpc('admin_character_flags', { p_limit: FLAGS_PAGE, p_offset: prev.length })) ?? [];
      this.flags = { rows: [...prev, ...rows], more: rows.length === FLAGS_PAGE };
    } catch (e) {
      this.flags = { rows: more ? prev : null, error: `${describeError(e)} Ist die Migration 20261003130000_spielstand_pruefung.sql eingespielt?` };
    }
    if (this.tab === 'flags') this.#render();
  }

  #flagsTable(match) {
    const f = this.flags;
    if (!f?.rows) {
      return f?.error
        ? h('p.on-msg.error.on-table-note', { role: 'alert' }, f.error)
        : h('p.acc-meta.on-table-note', 'Auffälligkeiten werden geladen …');
    }
    const rows = f.rows.filter((r) => match(r.email, r.character_name, r.character_id, r.reason, FLAG_REASON[r.reason]));
    return h('div',
      h('p.acc-meta.on-table-note', 'Abgelehnte Spielstände: Der Server hat diese Uploads nicht gespeichert, der vorherige Stand blieb erhalten. Häufen sich Einträge bei einem Konto, lohnt ein genauer Blick.'),
      h('table.on-table',
        h('thead', h('tr', ['Zeitpunkt', 'Konto', 'Charakter', 'Grund', 'Werte'].map((t) => h('th', t)))),
        h('tbody', rows.length ? rows.map((r) => h('tr',
          h('td', fmtDateTime(r.created_at)),
          h('td', r.email ?? 'Konto gelöscht'),
          h('td', r.character_name ?? h('span.acc-meta', r.character_id)),
          h('td', FLAG_REASON[r.reason] ?? r.reason),
          h('td', flagDetail(r.detail)))) : h('tr', h('td', { colspan: 5 }, f.rows.length ? 'Keine Treffer.' : 'Keine Auffälligkeiten.')))),
      f.error ? h('p.on-msg.error.on-table-note', { role: 'alert' }, f.error) : null,
      f.more ? h('button.ef-btn.acc-small.on-flags-more', { type: 'button', disabled: !!f.loading, onclick: () => this.#loadFlags(true) }, f.loading ? 'Wird geladen …' : 'Weitere laden') : null);
  }

  #table() {
    const q = this.filter.trim().toLowerCase();
    const match = (...vals) => !q || vals.some((v) => String(v ?? '').toLowerCase().includes(q));
    if (this.tab === 'flags') return this.#flagsTable(match);
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
