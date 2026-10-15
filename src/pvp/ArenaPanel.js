import { h, clear } from '../core/dom.js';
import { fmtNum, fmtDate } from '../i18n/index.js';
import { tierOf, TIERS, DAILY_REWARDS, PVP_MIN_LEVEL } from './rules.js';
import { tierEmblem } from './art.js';

// Reiter „Glutarena“ im Fenster der Dungeonsuche (Taste O): eigene Liga und Wertung, Saison, Bestenliste,
// „Gegner suchen“. Wenig Text; die Regeln stehen im Tooltip des Wappens.
//   renderArena(session, body) -> { update(), dispose() }
const RULES = 'Gewertete Kämpfe 1 gegen 1. In der Arena kämpfen alle auf Stufe 40 mit allen Fähigkeiten und derselben Arena-Rüstung.';
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const CLASS = { warrior: 'Krieger', rogue: 'Schurke', ranger: 'Waldläufer', mage: 'Magier' };

export function renderArena(session, body) {
  const g = session.game, pvp = g.pvp;
  const error = h('p.fd-error', { role: 'alert' });
  let timeEl = null, countEl = null, list = null, shown = null;

  const side = () => {
    const me = pvp.rating();
    const t = tierOf(me.rating), next = TIERS[TIERS.indexOf(t) + 1];
    const season = pvp.season;
    return h('div.pv-me',
      h('img.pv-crest', { src: tierEmblem(t.id, 4), alt: '', width: 64, height: 64, title: RULES }),
      h('b.pv-league', { style: { color: t.color } }, t.name),
      h('span.pv-big', fmtNum(me.rating)),
      next ? h('span.pv-next', `${next.name} ab ${fmtNum(next.min)}`) : null,
      h('span.pv-wl', `${fmtNum(me.wins ?? 0)} Siege · ${fmtNum(me.losses ?? 0)} Niederlagen`),
      h('span.pv-season', `Saison ${season.n} · bis ${fmtDate(season.end - 1, { day: 'numeric', month: 'long' })}`),
      me.daily != null ? h('span.pv-daily', `Belohnungen heute: ${fmtNum(Math.min(me.daily, DAILY_REWARDS))} von ${fmtNum(DAILY_REWARDS)}`) : null);
  };

  const board = () => {
    list = h('ol.pv-board', { 'aria-label': 'Bestenliste' });
    fill([]);
    pvp.top().then((rows) => { if (list?.isConnected) fill(rows); });
    return h('div.pv-top10', h('h3.fd-h', 'Bestenliste'), list);
  };
  const fill = (rows) => {
    clear(list);
    if (!rows.length) { list.append(h('li.pv-empty', 'Noch keine Kämpfe in dieser Saison.')); return; }
    const myName = pvp.char().name;
    rows.slice(0, 8).forEach((r, i) => list.append(h(`li${r.name === myName ? '.me' : ''}`,
      h('span.pv-rank', String(i + 1)),
      h('img.pv-emblem', { src: tierEmblem(tierOf(r.rating).id, 1), alt: '', width: 16, height: 16 }),
      h('span.pv-who', { translate: 'no', title: CLASS[r.classId] ?? '' }, r.name),
      h('b.pv-pts', fmtNum(r.rating)))));
  };

  function render() {
    const st = pvp.state;
    const view = st === 'queued' ? 'queued' : st === 'match' || (st === 'result' && pvp.inArena) ? 'match' : 'idle';
    if (view === shown) return;
    shown = view;
    clear(body);
    timeEl = countEl = null;
    let foot;
    if (view === 'queued') {
      timeEl = h('span.fd-time');
      countEl = h('p.fd-count');
      foot = h('div.pv-queue', h('p.fd-h', 'Gegner wird gesucht'), timeEl, countEl,
        h('div.fd-foot',
          h('button.ef-btn', { type: 'button', onclick: () => session.panels.close() }, 'Weiterspielen'),
          h('button.ef-btn.danger', { type: 'button', onclick: () => { pvp.cancel(); render(); } }, 'Suche beenden')));
    } else if (view === 'match') {
      foot = h('div.pv-queue', h('p.fd-count', 'Du kämpfst gerade.'));
    } else {
      foot = h('div.pv-queue', h('button.ef-btn.primary.fd-go', { type: 'button', onclick: go }, 'Gegner suchen'), error);
    }
    body.append(h('div.pv-pick', side(), h('div.pv-right', board(), foot)));
    tick();
  }

  function go() {
    const r = pvp.queue();
    error.textContent = r.ok ? '' : r.error;
    if (r.ok) { g.sfx?.play?.('ui'); render(); }
  }

  function tick() {
    if (!timeEl) return;
    timeEl.textContent = clock(Date.now() - pvp.since);
    const n = pvp.searching;
    countEl.textContent = n != null && n > 1 ? `${fmtNum(n)} Spieler suchen gerade.` : '';
  }

  render();
  let lastMe = pvp.me;
  // Neu aufbauen bei neuem Zustand oder neuer Wertung (nicht bei jeder Zählung der Suchenden)
  const offs = [g.bus.on('pvp:changed', () => { if (pvp.me !== lastMe) { lastMe = pvp.me; shown = null; } render(); })];
  return { update: tick, dispose: () => { for (const off of offs) off(); list = null; } };
}

export const arenaOpen = (game) => !!game.pvp && (game.state.slices.progress?.level ?? 1) >= PVP_MIN_LEVEL;
