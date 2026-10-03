import { h } from '../core/dom.js';
import { REPORT_REASON_LABELS } from './protocol.js';

// Verwaltung: Meldungen aus dem Gebietschat (DSA Art. 16/17). Zum Einbau in die Verwaltung (src/online/AdminScene.js):
//   import { renderChatReports } from '../net/AdminReports.js';
//   … Reiter „Meldungen“: slot.replaceChildren(renderChatReports(this.online.client));
// Daten und Rechte: admin_chat_reports / admin_chat_report_resolve / admin_chat_mute
// (supabase/migrations/20261003120000_chat_meldungen.sql, prüfen serverseitig assert_admin()).
const fmt = (s) => (s ? new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const STATUS = { offen: 'Offen', erledigt: 'Erledigt', abgelehnt: 'Abgelehnt' };
const MUTES = [[24, '24 Stunden'], [24 * 7, '7 Tage'], [24 * 30, '30 Tage']];

export function renderChatReports(client) {
  const root = h('div.net-adm');
  let filter = 'offen';
  const errText = (e) => e?.message || 'Unbekannter Fehler';

  async function load() {
    root.replaceChildren(head(), h('p.net-adm-note', 'Meldungen werden geladen …'));
    let rows;
    try { rows = (await client.rpc('admin_chat_reports', { p_status: filter === 'alle' ? null : filter, p_limit: 200 })) ?? []; } catch (e) {
      root.replaceChildren(head(), h('p.net-adm-note.err', { role: 'alert' }, `Laden fehlgeschlagen: ${errText(e)}. Ist die Migration 20261003120000_chat_meldungen.sql eingespielt?`));
      return;
    }
    root.replaceChildren(head(), rows.length ? h('div.net-adm-list', rows.map(card)) : h('p.net-adm-note', filter === 'offen' ? 'Keine offenen Meldungen.' : 'Keine Meldungen.'));
  }

  function head() {
    return h('div.net-adm-head',
      h('div.net-adm-filters', ['offen', 'erledigt', 'abgelehnt', 'alle'].map((f) => h(`button.on-tab${f === filter ? '.active' : ''}`, {
        type: 'button', onclick: () => { filter = f; load(); },
      }, f === 'alle' ? 'Alle' : STATUS[f]))),
      h('p.net-adm-note', 'Entscheide jede Meldung zeitnah und begründe sie kurz. Die Begründung brauchst du, wenn sich die betroffene Person beim Support meldet (DSA Art. 17).'));
  }

  function card(r) {
    const decision = h('textarea.net-adm-decision', { rows: 2, maxlength: 500, placeholder: 'Begründung der Entscheidung (Pflicht bei Sperre oder Ablehnung)' });
    decision.value = r.decision ?? '';
    const msg = h('p.net-adm-msg', { role: 'status' });
    const act = async (fn, okText) => {
      msg.textContent = 'Wird gespeichert …';
      try { await fn(); msg.textContent = okText; setTimeout(load, 700); } catch (e) { msg.textContent = `Fehler: ${errText(e)}`; }
    };
    const needReason = () => { if (decision.value.trim()) return true; msg.textContent = 'Bitte zuerst eine Begründung eintragen.'; decision.focus(); return false; };
    const resolve = (status) => act(() => client.rpc('admin_chat_report_resolve', { p_id: r.id, p_status: status, p_decision: decision.value.trim() }), `Als „${STATUS[status]}“ gespeichert.`);
    const mute = (hours) => act(async () => {
      await client.rpc('admin_chat_mute', { p_user: r.reported_id, p_hours: hours, p_reason: decision.value.trim(), p_report: r.id });
      if (hours > 0) await client.rpc('admin_chat_report_resolve', { p_id: r.id, p_status: 'erledigt', p_decision: decision.value.trim() });
    }, hours > 0 ? 'Chatsperre gesetzt, Meldung erledigt. Sie greift beim nächsten Gebietswechsel der Person.' : 'Chatsperre aufgehoben.');
    const messages = Array.isArray(r.messages) ? r.messages : [];
    return h('article.net-adm-card', { 'data-status': r.status },
      h('header.net-adm-card-head',
        h('strong', REPORT_REASON_LABELS[r.reason] ?? r.reason),
        h('span.net-adm-meta', `${fmt(r.created_at)} · ${r.zone || '?'} · Welt ${r.world}`),
        h('span.net-adm-badge', STATUS[r.status] ?? r.status)),
      h('dl.net-adm-who',
        h('dt', 'Gemeldet'), h('dd', `${r.reported_name} · ${r.reported_email ?? 'Konto gelöscht'} · ${r.reports_against} ${r.reports_against === 1 ? 'Meldung' : 'Meldungen'} insgesamt${r.muted_until ? ` · gesperrt bis ${fmt(r.muted_until)}` : ''}`),
        h('dt', 'Meldet'), h('dd', `${r.reporter_name} · ${r.reporter_email ?? 'Konto gelöscht'}${r.good_faith ? ' · Angaben bestätigt' : ''}`)),
      r.note ? h('blockquote.net-adm-note-text', r.note) : null,
      h('div.net-adm-chat', messages.length
        ? messages.map((m) => h('div.net-adm-line', h('span.net-adm-time', fmt(m.at)), ' ', h('span', m.text), m.shown ? h('span.net-adm-filtered', ' (gefiltert angezeigt)') : null))
        : h('em', 'Keine Chatnachrichten der Person in diesem Gebiet (z. B. Meldung wegen des Namens).')),
      r.decided_at ? h('p.net-adm-note', `Entschieden ${fmt(r.decided_at)}${r.decision ? `: ${r.decision}` : ''}`) : null,
      decision,
      h('div.net-adm-actions',
        r.status !== 'erledigt' ? h('button.ef-btn.acc-small', { type: 'button', onclick: () => resolve('erledigt') }, 'Erledigt') : null,
        r.status !== 'abgelehnt' ? h('button.ef-btn.acc-small', { type: 'button', onclick: () => needReason() && resolve('abgelehnt') }, 'Ablehnen') : null,
        r.status !== 'offen' ? h('button.ef-btn.acc-small', { type: 'button', onclick: () => resolve('offen') }, 'Wieder öffnen') : null,
        ...MUTES.map(([hrs, label]) => h('button.ef-btn.acc-small.danger', { type: 'button', onclick: () => needReason() && mute(hrs) }, `Chat sperren: ${label}`)),
        r.muted_until ? h('button.ef-btn.acc-small', { type: 'button', onclick: () => mute(0) }, 'Sperre aufheben') : null),
      msg);
  }

  load();
  return root;
}
