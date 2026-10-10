import { h } from '../core/dom.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { fmtNum } from '../i18n/index.js';
import { HeroPortrait } from '../account/ui.js';
import { resolveGear, shownEquipment } from '../character/gearLook.js';
import { DYES, spriteStyle } from '../character/cosmetics.js';
import { CLASSES } from '../character/classes.js';
import { RARITIES, EQUIP_SLOT_NAMES } from './items.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, REWARD_ACHIEVEMENTS, rewardItemId } from './achievements.js';
import { panelFrame, reactive } from './widgets.js';

// Panel 'achievements' (Runde 10.10.): Erfolge und Titel.
// Oben die Belohnungen schwerer Erfolge als Vitrine mit Vorschau (eigener Held mit Färbung/Aussehen, auf dem
// Reittier, Gegenstand); ein Tipp öffnet die Karte mit Fortschritt und – wenn errungen – Anlegen/Auswählen.
// Darunter die Liste nach Gruppen. Die Vorschau-Leinwände bleiben über Neuzeichnungen erhalten (reactive).
export function achievementsPanel(s) {
  const st = s.state;
  let group = 'all', open = null, redraw = () => {};
  const stages = new Map();   // Belohnungs-ID -> HeroPortrait (bleibt erhalten, wird nur umgehängt)
  const ch = () => st.slices.character ?? {};
  const value = (d) => { try { return d.value(st) ?? 0; } catch { return 0; } };

  // ---------------------------------------------------------------- Belohnung: Daten und Vorschau
  const info = (id) => {
    const d = ACHIEVEMENTS[id], r = d.reward, c = s.content;
    if (r.kind === 'dye') return { name: DYES[r.id].name, kind: 'Färbung', note: 'Färbt Umhang, Kapuze und Stoffrüstung.' };
    if (r.kind === 'mount') {
      const m = c.find('mount', r.id);
      return { name: m.name, kind: `Reittier · +${Math.round(m.speed * 100)} % Tempo`, note: m.desc };
    }
    const itemId = r.kind === 'item' ? rewardItemId(r, CLASSES[ch().classId]?.primary) : r.id;
    const it = c.find('item', itemId);
    if (r.kind === 'look') return { name: it.name, kind: `Aussehen · ${EQUIP_SLOT_NAMES[it.slot]}`, note: it.desc, item: it };
    return { name: it.name, kind: `${EQUIP_SLOT_NAMES[it.slot]} · ${RARITIES[it.rarity].name}`, note: it.desc, item: it };
  };
  const heroGear = (over = {}) => resolveGear({ ...shownEquipment(st.slices, s.content), ...over }, s.content);
  const stage = (id, big = false) => {
    const key = `${id}|${big ? 1 : 0}`;
    if (stages.has(key)) return stages.get(key);
    const r = ACHIEVEMENTS[id].reward, c = ch(), ap = c.appearance ?? {};
    let el;
    if (r.kind === 'item') {
      el = h('div.ach-stage-item', itemIconEl(info(id).item, big ? 72 : 48));
    } else {
      // Färbung: ohne Brust und Kopf, damit Umhang und Stoff zu sehen sind; Aussehen: über die getragene Ausrüstung gelegt
      const look = r.kind === 'look' ? heroGear({ [s.content.find('item', r.id).slot]: r.id }) : r.kind === 'dye' ? heroGear({ chest: null, head: null }) : heroGear();
      const style = spriteStyle(r.kind === 'dye' ? { ...ap, dye: r.id } : ap);
      const p = new HeroPortrait({ raceId: c.raceId, classId: c.classId, variant: ap.variant ?? 0, gear: look, style, scale: big ? 4 : 3, backdrop: false });
      if (r.kind === 'mount') {
        const anims = s.game.character?.animsForLook?.({ raceId: c.raceId, classId: c.classId, appearance: ap, gear: look, mountId: r.id }, 3);
        if (anims?.ride) { p.anims = { idle: anims.ride }; p.draw(); }
      }
      el = p.canvas;
      el.portrait = p;
    }
    el.classList.add('ach-stage');
    stages.set(key, el);
    return el;
  };

  // Anlegen/Auswählen, wenn errungen (Garderobe, Reittier, Färbung ohne Goldpreis)
  const action = (id) => {
    const r = ACHIEVEMENTS[id].reward, c = ch();
    if (!st.slices.achievements.unlocked[id]) return null;
    const btn = (label, fn, on = false) => h(`button.ef-btn.ach-act${on ? '' : '.primary'}`, { type: 'button', onclick: fn }, label);
    if (r.kind === 'dye') {
      const on = c.appearance?.dye === r.id;
      return btn(on ? 'Ablegen' : 'Anlegen', () => st.commit('character:restyle', { dye: on ? null : r.id }), on);
    }
    if (r.kind === 'look') {
      const slot = s.content.find('item', r.id).slot, on = c.wardrobe?.shown?.[slot] === r.id;
      if (!st.slices.inventory?.equipment?.[slot] && !on) return h('span.ach-hint', 'Lege zuerst ein Teil an diesem Platz an.');
      return btn(on ? 'Ablegen' : 'Anlegen', () => st.commit('wardrobe:show', { slot, itemId: on ? null : r.id }), on);
    }
    if (r.kind === 'mount') {
      const on = c.mounts?.active === r.id;
      return on ? h('span.ach-hint', 'Aktives Reittier') : btn('Auswählen', () => st.commit('mount:select', { mountId: r.id }));
    }
    return h('span.ach-hint', 'Liegt in deiner Tasche.');
  };

  // ---------------------------------------------------------------- Teile
  const bar = (frac) => h('span.ach-bar', h('span', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } }));
  const count = (v, d) => `${fmtNum(Math.min(v, d.goal))} / ${fmtNum(d.goal)}`;

  const trophy = (id) => {
    const d = ACHIEVEMENTS[id], got = !!st.slices.achievements.unlocked[id], v = value(d), inf = info(id);
    return h(`button.ach-trophy${got ? '.got' : ''}${open === id ? '.sel' : ''}`, {
      type: 'button', 'aria-pressed': String(open === id), 'aria-label': `${inf.name}: ${d.name}`,
      onclick: () => { open = open === id ? null : id; redraw(); },
    },
    h('span.ach-pedestal', stage(id), got ? null : h('span.ach-lock', { 'aria-hidden': 'true' })),
    h('span.ach-trophy-name', inf.name),
    got ? h('span.ach-trophy-got', 'Errungen') : h('span.ach-trophy-prog', bar(v / d.goal)));
  };

  const card = (id) => {
    const d = ACHIEVEMENTS[id], got = !!st.slices.achievements.unlocked[id], v = value(d), inf = info(id);
    return h('div.ach-card', { role: 'region', 'aria-label': inf.name },
      h('button.ach-card-x', { type: 'button', 'aria-label': 'Schließen', onclick: () => { open = null; redraw(); } }, '✕'),
      h('div.ach-card-stage', stage(id, true)),
      h('div.ach-card-body',
        h('span.ach-kind', inf.kind),
        h('h3.ach-card-name', inf.name),
        h('p.ach-card-note', inf.note),
        h('div.ach-card-req',
          h('span.ach-req-icon', iconEl(d.icon, 20)),
          h('span.ach-req-text', h('b', d.name), h('small', d.desc))),
        got ? h('div.ach-card-foot', h('span.ach-done', 'Errungen'), action(id))
          : h('div.ach-card-foot', bar(v / d.goal), h('span.ach-count', count(v, d)))));
  };

  const row = (id, d, v) => h(`li.ach-row${d.reward ? '.rw' : ''}`, { title: d.reward ? `Belohnung: ${info(id).name}` : null },
    h('span.ach-medal', iconEl(d.icon, 24)),
    h('span.ach-row-main',
      h('span.ach-row-name', d.name, d.title ? h('span.ach-tag', `„${d.title}“`) : null),
      h('small', d.desc)),
    d.goal > 1 ? h('span.ach-count', count(v, d)) : null,
    h('span.ach-pts', fmtNum(d.points)),
    d.goal > 1 ? bar(v / d.goal) : null);

  const tile = (id, d) => h(`li.ach-tile${d.reward ? '.rw' : ''}`, { title: d.desc },
    h('span.ach-medal', iconEl(d.icon, 20)),
    h('span.ach-row-name', d.name),
    h('span.ach-pts', fmtNum(d.points)));

  // ---------------------------------------------------------------- Ganzes Fenster
  function render(again) {
    redraw = again;
    const a = st.slices.achievements;
    const all = Object.entries(ACHIEVEMENTS);
    const done = all.filter(([id]) => a.unlocked[id]).length;
    const points = all.reduce((n, [id, d]) => n + (a.unlocked[id] ? d.points : 0), 0);
    const rewards = REWARD_ACHIEVEMENTS;
    const rewardsGot = rewards.filter((id) => a.unlocked[id]).length;
    const titles = all.filter(([id, d]) => d.title && a.unlocked[id]);
    const shown = all.filter(([, d]) => group === 'all' || d.group === group);
    const openList = shown.filter(([id]) => !a.unlocked[id]).map(([id, d]) => [id, d, value(d)])
      .sort((x, y) => y[2] / (y[1].goal || 1) - x[2] / (x[1].goal || 1));
    const got = shown.filter(([id]) => a.unlocked[id]);
    return panelFrame(s, 'achievements', 'Erfolge',
      h('div.ach-top',
        h('section.ach-vitrine', { 'aria-label': 'Belohnungen' },
          h('header.ach-sec', h('span', 'Belohnungen'), h('b', `${fmtNum(rewardsGot)} / ${fmtNum(rewards.length)}`)),
          h('div.ach-trophies', rewards.map(trophy))),
        h('div.ach-sum',
          h('span.ach-score', h('b', fmtNum(points)), h('span', ' Punkte')),
          h('span.ach-score.dim', h('b', `${fmtNum(done)} / ${fmtNum(all.length)}`), h('span', ' Erfolge')),
          titles.length ? h('label.ach-title',
            h('span', 'Titel'),
            h('span.pg-select-wrap', h('select.pg-select', { onchange: (e) => st.commit('achievement:title', { id: e.target.value || null }) },
              h('option', { value: '', selected: !a.title }, 'Kein Titel'),
              titles.map(([id, d]) => h('option', { value: id, selected: a.title === id }, d.title))))) : null)),
      h('div.ach-tabs', { role: 'tablist' }, [['all', 'Alle'], ...Object.entries(ACHIEVEMENT_GROUPS)].map(([gid, label]) => h(`button.ach-tab${group === gid ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(group === gid), onclick: () => { group = gid; redraw(); },
      }, label))),
      h('div.pg-scroll.pg-keep-scroll.ach-list',
        openList.length ? h('ul.ach-rows', openList.map(([id, d, v]) => row(id, d, v))) : null,
        got.length ? h('h3.ach-sub', `Errungen · ${fmtNum(got.length)}`) : null,
        got.length ? h('ul.ach-tiles', got.map(([id, d]) => tile(id, d))) : null),
      open ? card(open) : null);
  }

  const view = reactive(s, (redraw) => render(redraw));
  return {
    root: view.root,
    update: (dt) => { for (const el of stages.values()) if (el.isConnected) el.portrait?.update(dt); },
    dispose: view.dispose,
  };
}
