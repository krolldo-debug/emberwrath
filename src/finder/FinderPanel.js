import { h, clear } from '../core/dom.js';
import { iconUrl } from '../gfx/Icons.js';
import { ROLES, roleAllowed } from './protocol.js';
import { finderIcon } from './icons.js';

// Panel 'finder': Dungeon und Rolle wählen, Suche starten/beenden, Suchstand.
export function createFinderPanel(session) {
  const g = session.game, finder = g.finder;
  const c = finder.char();
  const cls = session.content.find('class', c.classId);
  const list = finder.dungeons(c.level);
  let pick = finder.req?.dungeonId ?? 'random';
  let role = finder.req?.role ?? (c.classId === 'warrior' ? 'tank' : 'dps');
  if (!roleAllowed(role, c.classId)) role = 'dps';

  const body = h('div.fd-body');
  const error = h('p.fd-error', { role: 'alert' });
  const root = h('div.ef-panel.ef-center.fd-panel', { role: 'dialog', 'aria-label': 'Dungeonsuche' },
    h('header.fd-head',
      h('img.ef-icon.fd-head-icon', { src: finderIcon('group', 3), alt: '', width: 36, height: 36 }),
      h('div', h('h2.ef-sub.fd-title', 'Dungeonsuche'),
        h('p.fd-lead', finder.labelMercs
          ? 'Finde eine Gruppe aus drei Helden. Sucht gerade niemand Passendes, füllen Söldner die freien Plätze.'
          : 'Finde eine Gruppe aus drei Helden für einen Dungeon.')),
      h('button.fd-close', { type: 'button', 'aria-label': 'Schließen', onclick: () => session.panels.close() }, '×'),
    ),
    body, error,
  );

  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function renderPick() {
    clear(body);
    const rows = h('div.fd-dungeons', { role: 'radiogroup', 'aria-label': 'Dungeon' });
    const rnd = finder.randomFor(c.level);
    const row = (id, name, sub, open, extra) => h('button.fd-dungeon.ef-card', {
      type: 'button', role: 'radio', 'aria-checked': String(pick === id), class: `fd-dungeon ef-card${pick === id ? ' selected' : ''}${open ? '' : ' locked'}`,
      disabled: !open, onclick: () => { pick = id; renderPick(); },
    }, h('span.fd-dname', name), h('span.fd-dsub', sub), extra);
    rows.append(row('random', 'Zufälliger Dungeon', rnd ? `passend zu deiner Stufe · zuletzt ${rnd.name}` : 'kein Dungeon für deine Stufe', !!rnd, h('span.fd-dtag', 'Empfohlen')));
    for (const d of list) {
      const sub = d.open ? `Stufe ${d.min}–${d.max}` : `ab Stufe ${Math.max(1, d.min - 2)}`;
      rows.append(row(d.id, d.name, sub, d.open, c.level > d.max + 4 && d.open ? h('span.fd-dtag.dim', 'leicht') : null));
    }
    const roles = h('div.fd-roles', { role: 'radiogroup', 'aria-label': 'Rolle' },
      ...['tank', 'dps'].map((r) => {
        const ok = roleAllowed(r, c.classId);
        return h('button.fd-role.ef-card', {
          type: 'button', role: 'radio', 'aria-checked': String(role === r), class: `fd-role ef-card${role === r ? ' selected' : ''}`, disabled: !ok,
          title: ok ? ROLES[r].desc : 'Nur Krieger können verteidigen.', onclick: () => { role = r; renderPick(); },
        }, h('img.ef-icon', { src: finderIcon(r, 2), alt: '', width: 32, height: 32 }),
        h('span.fd-rname', ROLES[r].name), h('span.fd-rsub', ok ? ROLES[r].desc : 'nur Krieger'));
      }));
    body.append(
      h('h3.fd-h', 'Dungeon'), rows,
      h('h3.fd-h', 'Deine Rolle'), roles,
      h('div.fd-foot',
        h('span.fd-me', cls ? h('img.ef-icon', { src: iconUrl(cls.icon), alt: '', width: 20, height: 20 }) : null, `${c.name} · Stufe ${c.level} ${cls?.name ?? ''}`),
        h('button.ef-btn.primary.fd-go', { type: 'button', onclick: go }, 'Gruppe suchen'),
      ),
    );
  }

  function go() {
    const id = pick === 'random' ? finder.randomFor(c.level)?.id : pick;
    const r = id ? finder.queue({ dungeonId: id, role }) : { ok: false, error: 'Kein Dungeon passt gerade zu deiner Stufe.' };
    error.textContent = r.ok ? '' : r.error;
    if (r.ok) { g.sfx?.play?.('ui'); render(); }
  }

  let timeEl = null, countEl = null;
  function renderQueued() {
    clear(body);
    const d = session.content.find('zone', finder.req?.dungeonId);
    timeEl = h('span.fd-time', '0:00');
    countEl = h('span.fd-count');
    body.append(
      h('div.fd-searching',
        h('div.fd-spinner', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('div',
          h('p.fd-sname', d?.name ?? 'Dungeon'),
          h('p.fd-sline', `Suche als ${ROLES[finder.req?.role]?.name ?? 'Schaden'} · `, timeEl),
          countEl)),
      h('p.ef-note.fd-hint', 'Du kannst weiterspielen, während gesucht wird. Sobald eine Gruppe steht, fragt dich das Spiel, ob du bereit bist.'),
      h('div.fd-foot',
        h('button.ef-btn', { type: 'button', onclick: () => session.panels.close() }, 'Weiterspielen'),
        h('button.ef-btn.danger', { type: 'button', onclick: () => { finder.cancel(); render(); } }, 'Suche beenden')),
    );
    tick();
  }

  function renderActive() {
    clear(body);
    const d = session.content.find('zone', finder.group?.dungeonId);
    const inside = session.zone?.zoneId === finder.group?.dungeonId;
    body.append(
      h('p.fd-sname', d?.name ?? 'Dungeon'),
      h('p.ef-note', inside ? 'Deine Gruppe ist bei dir im Dungeon.' : 'Deine Gruppe wartet im Dungeon.'),
      h('div.fd-foot',
        !inside ? h('button.ef-btn.primary', { type: 'button', onclick: () => { session.panels.close(); g.bus.emit('zone:travel', { zoneId: finder.group.dungeonId, spawnId: 'start' }); } }, 'Zum Dungeon') : null,
        h('button.ef-btn.danger', { type: 'button', onclick: () => { finder.leave(); session.panels.close(); } }, 'Gruppe verlassen')),
    );
  }

  function tick() {
    if (!timeEl) return;
    timeEl.textContent = fmt(Date.now() - (finder.req?.since ?? Date.now()));
    const n = finder.searching;
    countEl.textContent = n == null ? '' : n <= 1 ? 'Gerade sucht niemand sonst für diesen Dungeon.' : `${n} Spieler suchen gerade für diesen Dungeon.`;
  }

  let shown = null;
  function render() {
    const st = finder.state;
    const view = st === 'queued' || st === 'proposal' || st === 'accepted' ? 'queued' : st === 'active' ? 'active' : 'pick';
    if (view === shown && view !== 'pick') return;
    shown = view;
    timeEl = null;
    if (view === 'queued') renderQueued(); else if (view === 'active') renderActive(); else renderPick();
  }
  render();
  const off = g.bus.on('finder:changed', render);
  return { root, update: tick, dispose: off };
}
