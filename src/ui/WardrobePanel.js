import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, RARITY_COLORS } from '../gfx/Icons.js';
import { HeroPortrait } from '../account/ui.js';
import { spriteStyle } from '../character/cosmetics.js';

// Garderobe (Panel 'wardrobe') – Thread D, Daten von Thread A:
//   game.character.wardrobe = { SLOTS, entries(slot), show(slot, value) }
//   entries(slot) -> { current: itemId|null|'none', equipped, list: [{ itemId, name, rarity, icon, usable, shown }] }
//   show(slot, itemId|null|'none') -> { ok } | { ok:false, reason }
//   game.character.previewGear(overrides) -> gear für die Heldenvorschau
// Antippen zeigt das Aussehen in der Vorschau; „Anlegen“ übernimmt es. null = Aussehen des
// angelegten Gegenstands, 'none' = Helm ausblenden (nur Kopf).
const SLOT_NAMES = { weapon: 'Waffe', chest: 'Brust', head: 'Kopf', hands: 'Hände', feet: 'Füße' };
const REASONS = { slot: 'Dieser Platz hat kein eigenes Aussehen.', locked: 'Noch nicht gesammelt.', class: 'Nur für eine andere Klasse.' };

export function installWardrobe(game) {
  game.panels.register('wardrobe', (session) => createWardrobePanel(session), { pauses: false, title: 'Garderobe' });
}

function createWardrobePanel(session) {
  const g = session.game, wr = g.character?.wardrobe, st = session.state;
  const ch = st.slices.character;
  const slots = (wr?.SLOTS ?? Object.keys(SLOT_NAMES)).filter((k) => SLOT_NAMES[k]);
  let slot = slots[0], preview = {}, msg = '';
  const portrait = new HeroPortrait({ raceId: ch.raceId, classId: ch.classId, mode: 'idle', scale: 4, backdrop: true });
  const refreshPortrait = () => {
    const c = st.slices.character;
    const gear = g.character?.previewGear?.(preview) ?? null;
    portrait.set(c.raceId, c.classId, c.appearance?.variant ?? 0, gear, spriteStyle(c.appearance ?? {}));
  };
  const root = h('div.ef-panel.wd-panel', { role: 'dialog', 'aria-label': 'Garderobe' });

  const render = () => {
    if (!wr) {
      root.replaceChildren(head(), h('p.ef-note', 'Die Garderobe ist gerade nicht verfügbar.'));
      return;
    }
    const e = wr.entries(slot);
    const sel = slot in preview ? preview[slot] : e.current ?? null;
    const total = slots.reduce((n, k) => n + (wr.entries(k).list?.length ?? 0), 0);
    // Kachel = nur das große Icon; getragenes Aussehen mit goldenem Häkchen, andere Klasse mit Schloss
    const tile = (value, label, visual, { rarity = null, usable = true, current = false } = {}) => h(`button.wd-tile${sel === value ? '.sel' : ''}${current ? '.cur' : ''}${usable ? '' : '.off'}`, {
      type: 'button', title: label, 'aria-label': label, 'aria-pressed': sel === value ? 'true' : 'false',
      style: rarity ? { '--wd-r': RARITY_COLORS[rarity] ?? RARITY_COLORS.common } : null,
      onclick: () => { preview = { ...preview, [slot]: value }; msg = ''; refreshPortrait(); render(); },
    }, visual, current ? h('span.wd-check', { 'aria-hidden': 'true' }) : null, usable ? null : h('span.wd-lock', { 'aria-hidden': 'true' }));
    const list = [
      ...(e.list ?? []).map((it) => tile(it.itemId, it.name, iconEl(it.icon, 64), { rarity: it.rarity, usable: it.usable, current: e.current === it.itemId })),
    ];
    const pick = (e.list ?? []).find((it) => it.itemId === sel);
    const changed = sel !== (e.current ?? null);
    const canApply = changed && (sel === null || sel === 'none' || pick?.usable);
    const apply = h('button.ef-btn.primary.wd-apply', {
      type: 'button', disabled: !canApply,
      onclick: () => {
        const r = wr.show(slot, sel);
        if (r?.ok) { const p = { ...preview }; delete p[slot]; preview = p; msg = ''; session.bus.emit(EV.UI_TOAST, { text: 'Aussehen angelegt', kind: 'info' }); refreshPortrait(); }
        else msg = REASONS[r?.reason] ?? '';
        render();
      },
    }, 'Anlegen');
    root.replaceChildren(
      head(),
      h('div.pg-tabs.wd-tabs', { role: 'tablist' }, slots.map((k) => h(`button.pg-tabbtn${k === slot ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(k === slot), onclick: () => { slot = k; msg = ''; render(); },
      }, SLOT_NAMES[k]))),
      h('div.wd-body',
        h('div.wd-stage', portrait.canvas,
          h('div.wd-pick', pick ? h('span.wd-pick-name', { style: { color: RARITY_COLORS[pick.rarity] ?? RARITY_COLORS.common } }, pick.name) : h('span.wd-pick-name', sel === 'none' ? 'Helm ausgeblendet' : 'Angelegter Gegenstand'),
            pick && !pick.usable ? h('span.wd-pick-sub', 'Andere Klasse') : null),
          h('div.wd-alt',
            h(`button.ef-btn.wd-altbtn${sel === null ? '.on' : ''}`, { type: 'button', onclick: () => { preview = { ...preview, [slot]: null }; msg = ''; refreshPortrait(); render(); } }, 'Angelegt'),
            slot === 'head' ? h(`button.ef-btn.wd-altbtn${sel === 'none' ? '.on' : ''}`, { type: 'button', onclick: () => { preview = { ...preview, [slot]: 'none' }; msg = ''; refreshPortrait(); render(); } }, 'Ausblenden') : null),
          apply,
          msg ? h('p.wd-msg', msg) : null),
        h('div.wd-grid', list)),
      h('footer.wd-foot', h('span.ef-note', `${total.toLocaleString()} Aussehen gesammelt`)));
  };
  const head = () => h('header.wd-head',
    h('h2.wd-title', 'Garderobe'),
    h('button.pg-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() }, '✕'));

  const off = session.bus.on(EV.WARDROBE_UNLOCKED ?? 'wardrobe:unlocked', () => render());
  refreshPortrait();
  render();
  return {
    root,
    update(dt) { portrait.update(dt); },
    dispose() { off?.(); },
  };
}
