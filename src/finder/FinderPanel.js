import { h, clear } from '../core/dom.js';
import { ROLES, roleAllowed } from './protocol.js';
import { finderIcon } from './icons.js';

// Panel 'finder': Dungeon und Rolle wählen, Suche starten/beenden, Suchstand. Wenig Text: Name, Stufe,
// Symbole; Erklärungen der Rollen stehen im Tooltip.
export function createFinderPanel(session) {
  const g = session.game, finder = g.finder;
  const c = finder.char();
  const list = finder.dungeons(c.level);
  let pick = finder.req?.dungeonId ?? 'random';
  let role = finder.req?.role ?? (c.classId === 'warrior' ? 'tank' : 'dps');
  if (!roleAllowed(role, c.classId)) role = 'dps';

  const body = h('div.fd-body');
  const error = h('p.fd-error', { role: 'alert' });
  const root = h('div.ef-panel.fd-panel', { role: 'dialog', 'aria-label': 'Dungeonsuche' },
    h('header.fd-head',
      h('img.fd-head-icon', { src: finderIcon('group', 2), alt: '', width: 32, height: 32 }),
      h('h2.ef-sub.fd-title', 'Dungeonsuche'),
      h('button.fd-close', { type: 'button', 'aria-label': 'Schließen', onclick: () => session.panels.close() }, '×'),
    ),
    body, error,
  );

  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const icon = (id, size = 32) => h('img.fd-ico', { src: finderIcon(id, size / 16), alt: '', width: size, height: size });

  // Auswahl: links die Dungeons (Name und Stufe), rechts Rolle und Start. Erklärungen nur als Tooltip.
  function renderPick() {
    clear(body);
    const rows = h('div.fd-dungeons', { role: 'radiogroup', 'aria-label': 'Dungeon' });
    const rnd = finder.randomFor(c.level);
    const row = (id, ico, name, lv, open) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(pick === id), class: `fd-dungeon${pick === id ? ' selected' : ''}${open ? '' : ' locked'}`,
      disabled: !open, onclick: () => { pick = id; renderPick(); },
    }, icon(ico, 32), h('span.fd-dname', name), lv ? h('span.fd-dlv', lv) : null);
    rows.append(row('random', 'random', 'Zufälliger Dungeon', null, !!rnd));
    for (const d of list) rows.append(row(d.id, d.open ? 'skull' : 'lock', d.name, d.open ? `Stufe ${d.min}–${d.max}` : `ab Stufe ${Math.max(1, d.min - 2)}`, d.open));
    const roles = h('div.fd-roles', { role: 'radiogroup', 'aria-label': 'Rolle' },
      ...['tank', 'dps'].map((r) => {
        const ok = roleAllowed(r, c.classId);
        return h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(role === r), class: `fd-role${role === r ? ' selected' : ''}`, disabled: !ok,
          title: ok ? ROLES[r].desc : 'Nur Krieger können verteidigen.', onclick: () => { role = r; renderPick(); },
        }, icon(ok ? r : 'lock', 48), h('span.fd-rname', ROLES[r].name));
      }));
    body.append(h('div.fd-pick',
      rows,
      h('div.fd-side',
        h('h3.fd-h', 'Deine Rolle'), roles,
        h('button.ef-btn.primary.fd-go', { type: 'button', onclick: go, disabled: pick === 'random' && !rnd }, 'Gruppe suchen'))));
  }

  function go() {
    const id = pick === 'random' ? finder.randomFor(c.level)?.id : pick;
    const r = id ? finder.queue({ dungeonId: id, role }) : { ok: false, error: 'Kein Dungeon passt gerade zu deiner Stufe.' };
    error.textContent = r.ok ? '' : r.error;
    if (r.ok) { g.sfx?.play?.('ui'); render(); }
  }

  // Drei Gruppenplätze (1 Verteidiger, 2 Schaden): der eigene leuchtet, die offenen pulsieren.
  const slotsEl = (myRole, filled = false) => {
    let mine = false;
    return h('div.fd-slots', { 'aria-hidden': 'true' }, ['tank', 'dps', 'dps'].map((r) => {
      const me = !mine && r === myRole;
      if (me) mine = true;
      return h(`span.fd-slot${me ? '.me' : filled ? '.full' : ''}`, icon(r, 32));
    }));
  };

  let timeEl = null, countEl = null;
  function renderQueued() {
    clear(body);
    const d = session.content.find('zone', finder.req?.dungeonId);
    timeEl = h('span.fd-time', '0:00');
    countEl = h('p.fd-count');
    body.append(
      h('div.fd-searching',
        h('p.fd-sname', d?.name ?? 'Dungeon'),
        slotsEl(finder.req?.role ?? 'dps'),
        timeEl, countEl),
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
      h('div.fd-searching.done',
        h('p.fd-sname', d?.name ?? 'Dungeon'),
        slotsEl(finder.group?.members?.find((m) => m.self)?.role ?? finder.req?.role ?? 'dps', true),
        h('p.fd-count', inside ? 'Deine Gruppe ist bei dir im Dungeon.' : 'Deine Gruppe wartet im Dungeon.')),
      h('div.fd-foot',
        !inside ? h('button.ef-btn.primary', { type: 'button', onclick: () => { session.panels.close(); g.bus.emit('zone:travel', { zoneId: finder.group.dungeonId, spawnId: 'start' }); } }, 'Zum Dungeon') : null,
        h('button.ef-btn.danger', { type: 'button', onclick: () => { finder.leave(); session.panels.close(); } }, 'Gruppe verlassen')),
    );
  }

  function tick() {
    if (!timeEl) return;
    timeEl.textContent = fmt(Date.now() - (finder.req?.since ?? Date.now()));
    const n = finder.searching;
    countEl.textContent = n != null && n > 1 ? `${n} Spieler suchen gerade für diesen Dungeon.` : '';
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
