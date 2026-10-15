import { h, clear } from '../core/dom.js';
import { ROLES, roleAllowed } from './protocol.js';
import { finderIcon } from './icons.js';
import { dungeonEmblem, dungeonScene } from './art.js';
import { renderArena, arenaOpen } from '../pvp/ArenaPanel.js';

// Panel 'finder': Dungeon und Rolle wählen, Suche starten/beenden, Suchstand. Wenig Text: Name, Stufe,
// Symbole; Erklärungen der Rollen stehen im Tooltip. Jeder Dungeon hat ein eigenes Wappen und ein kleines
// Eingangsbild (art.js), das rechts über der Rollenwahl und während der Suche erscheint.
// Ab Stufe 10 trägt der Kopf zwei Reiter: Dungeons und Glutarena (PvP, src/pvp/ArenaPanel.js).
export function createFinderPanel(session, params = {}) {
  const g = session.game, finder = g.finder;
  const arena = arenaOpen(g);
  let tab = arena && (params.tab ?? (g.pvp?.busy ? 'arena' : g.pvp?.lastTab)) === 'arena' ? 'arena' : 'dungeon';
  let arenaView = null;
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
      arena
        ? h('div.fd-tabs', { role: 'tablist' }, ...[['dungeon', 'Dungeons'], ['arena', 'Glutarena']].map(([id, label]) =>
          h('button.ef-sub.fd-title.fd-tab', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => setTab(id) }, label)))
        : h('h2.ef-sub.fd-title', 'Dungeonsuche'),
      h('button.fd-close', { type: 'button', 'aria-label': 'Schließen', onclick: () => session.panels.close() }, '×'),
    ),
    body, error,
  );

  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const icon = (id, size = 32) => h('img.fd-ico', { src: finderIcon(id, size / 16), alt: '', width: size, height: size });

  const scene = (id) => h('img.fd-scene', { src: dungeonScene(id), alt: '', width: 224, height: 128 });
  const bossName = (zoneId) => {
    const z = session.content.find('zone', zoneId);
    return z?.bossId ? session.content.find('enemy', z.bossId)?.name ?? null : null;
  };

  // Auswahl: links die Dungeons (Wappen, Name, Stufe), rechts Vorschau, Rolle und Start. Erklärungen nur als Tooltip.
  function renderPick() {
    clear(body);
    const rows = h('div.fd-dungeons', { role: 'radiogroup', 'aria-label': 'Dungeon' });
    const rnd = finder.randomFor(c.level);
    const row = (id, ico, name, lv, open) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(pick === id), class: `fd-dungeon${pick === id ? ' selected' : ''}${open ? '' : ' locked'}`,
      disabled: !open, onclick: () => { pick = id; renderPick(); },
    }, h('img.fd-ico', { src: ico, alt: '', width: 32, height: 32 }), h('span.fd-dname', name), lv ? h('span.fd-dlv', lv) : null);
    rows.append(row('random', finderIcon('random', 2), 'Zufälliger Dungeon', null, !!rnd));
    for (const d of list) rows.append(row(d.id, dungeonEmblem(d.id, 2) ?? finderIcon('skull', 2), d.name, d.open ? `Stufe ${d.min}–${d.max}` : `ab Stufe ${Math.max(1, d.min - 2)}`, d.open));
    const sel = pick === 'random' ? null : list.find((d) => d.id === pick);
    const boss = sel ? bossName(sel.id) : null;
    // Niedrige Handy-Schirme: kleinere Rollensymbole (ganzzahlig 2× statt 3×), damit Bild, Rollen und Start passen
    const roleIco = matchMedia('(max-height: 460px)').matches ? 32 : 48;
    const roles = h('div.fd-roles', { role: 'radiogroup', 'aria-label': 'Rolle' },
      ...['tank', 'dps'].map((r) => {
        const ok = roleAllowed(r, c.classId);
        return h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(role === r), class: `fd-role${role === r ? ' selected' : ''}`, disabled: !ok,
          title: ok ? ROLES[r].desc : 'Nur Krieger können verteidigen.', onclick: () => { role = r; renderPick(); },
        }, icon(ok ? r : 'lock', roleIco), h('span.fd-rname', ROLES[r].name));
      }));
    body.append(h('div.fd-pick',
      rows,
      h('div.fd-side',
        h('figure.fd-preview', scene(sel?.id ?? 'random'),
          h('figcaption',
            h('b.fd-pname', sel?.name ?? 'Zufälliger Dungeon'),
            boss ? h('span.fd-pboss', boss) : null)),
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
        d ? scene(d.id) : null,
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
        d ? scene(d.id) : null,
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

  function setTab(id) {
    tab = id;
    if (g.pvp) g.pvp.lastTab = id;
    for (const b of root.querySelectorAll('.fd-tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    arenaView?.dispose();
    arenaView = null;
    shown = null;
    error.textContent = '';
    if (tab === 'arena') { clear(body); arenaView = renderArena(session, body); } else render();
  }

  let shown = null;
  function render() {
    if (tab === 'arena') return;
    const st = finder.state;
    const view = st === 'queued' || st === 'proposal' || st === 'accepted' ? 'queued' : st === 'active' ? 'active' : 'pick';
    if (view === shown && view !== 'pick') return;
    shown = view;
    timeEl = null;
    if (view === 'queued') renderQueued(); else if (view === 'active') renderActive(); else renderPick();
  }
  if (arena) setTab(tab); else render();
  const off = g.bus.on('finder:changed', render);
  return { root, update: () => (arenaView ? arenaView.update() : tick()), dispose: () => { off(); arenaView?.dispose(); } };
}
