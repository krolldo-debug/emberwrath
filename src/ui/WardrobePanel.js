import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, RARITY_COLORS } from '../gfx/Icons.js';
import { HeroPortrait } from '../account/ui.js';
import { spriteStyle } from '../character/cosmetics.js';
import { StableStage, mountCard, mountStand, TEX } from './Stable.js';
import { fmtNum } from '../i18n/index.js';

// Garderobe (Panel 'wardrobe') – Thread D, Daten von Thread A:
//   game.character.wardrobe = { SLOTS, entries(slot), show(slot, value) }
//   entries(slot) -> { current: itemId|null|'none', equipped, list: [{ itemId, name, rarity, icon, usable, shown }] }
//   show(slot, itemId|null|'none') -> { ok } | { ok:false, reason }
//   game.character.previewGear(overrides) -> gear für die Heldenvorschau
// Antippen zeigt das Aussehen in der Vorschau; „Anlegen“ übernimmt es. null = Aussehen des
// angelegten Gegenstands, 'none' = Helm ausblenden (nur Kopf).
// Reiter „Reittiere“ (Daten von Thread A, character/mounts.js):
//   game.character.mountCollection() -> [{ id, name, rarity, speed, source, owned, active }]
//   game.character.selectMount(id)   -> Reittier für die Reitfähigkeit (character.mounts.active, Mitspieler sehen es)
// Bühne und Karten zeichnet ui/Stable.js (Steppe wie die Reittier-Parade der Startseite, ganzzahliges Raster).
// Fehlende Reittiere erscheinen als Silhouette mit dem Hinweis, wo es sie gibt. Öffnen direkt dort: { tab: 'mounts' }.
const MOUNTS_TAB = 'mounts';
const MOUNT_RARITY = { rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
const SLOT_NAMES = { weapon: 'Waffe', chest: 'Brust', head: 'Kopf', hands: 'Hände', feet: 'Füße' };
const REASONS = { slot: 'Dieser Platz hat kein eigenes Aussehen.', locked: 'Noch nicht gesammelt.', class: 'Nur für eine andere Klasse.' };

export function installWardrobe(game) {
  game.panels.register('wardrobe', (session, params) => createWardrobePanel(session, params), { pauses: false, title: 'Garderobe' });
}

function createWardrobePanel(session, params = {}) {
  const g = session.game, wr = g.character?.wardrobe, st = session.state;
  const ch = st.slices.character;
  const slots = (wr?.SLOTS ?? Object.keys(SLOT_NAMES)).filter((k) => SLOT_NAMES[k]);
  const hasMounts = typeof g.character?.mountCollection === 'function';
  let slot = params?.tab === MOUNTS_TAB && hasMounts ? MOUNTS_TAB : slots[0], preview = {}, msg = '';
  let mountSel = null;   // angetipptes Reittier (Vorschau); null = aktives
  const portrait = new HeroPortrait({ raceId: ch.raceId, classId: ch.classId, mode: 'idle', scale: 4, backdrop: true });
  const stage = hasMounts ? new StableStage({ deko: g.assets?.sprites?.decor_steppe ?? null }) : null;
  // Bühne: Desktop 4, kleine Bildschirme 3 CSS-Pixel je Weltpixel (ganzzahlig auf Bildschirmpunkte gerundet, ui/Stable.js)
  const compactQ = globalThis.matchMedia?.('(max-height: 500px)');
  const stageScale = () => stage?.setScale(compactQ?.matches ? 3 : 4);
  const mountList = () => (hasMounts ? g.character.mountCollection() : []);
  const mountPick = (list) => list.find((m) => m.id === mountSel) ?? list.find((m) => m.active) ?? list.find((m) => m.owned) ?? list[0] ?? null;
  const refreshPortrait = () => {
    const c = st.slices.character;
    if (slot !== MOUNTS_TAB) {
      portrait.set(c.raceId, c.classId, c.appearance?.variant ?? 0, g.character?.previewGear?.(preview) ?? null, spriteStyle(c.appearance ?? {}));
      return;
    }
    const m = mountPick(mountList());
    const def = m ? g.character?.mountDef?.(m.id) : null;
    stageScale();
    if (!def) { stage.show({}); return; }
    if (!m.owned) { stage.show({ sil: mountStand(def) }); return; }
    // Held reitet im selben Feinraster wie das Reittier (res 2), so wie Mitspieler ihn sehen (character.animsForLook)
    const anims = g.character?.animsForLook?.({ raceId: c.raceId, classId: c.classId, appearance: c.appearance ?? {}, gear: g.character?.previewGear?.({}) ?? null, mountId: m.id }, TEX);
    stage.show({ anim: anims?.rideRun ?? anims?.ride ?? null, glow: def.look?.glow ?? null });
  };
  const root = h('div.ef-panel.wd-panel', { role: 'dialog', 'aria-label': 'Garderobe' });

  const tabs = () => h('div.pg-tabs.wd-tabs', { role: 'tablist' }, [...slots, ...(hasMounts ? [MOUNTS_TAB] : [])].map((k) => h(`button.pg-tabbtn${k === slot ? '.on' : ''}${k === MOUNTS_TAB ? '.wd-tab-mounts' : ''}`, {
    type: 'button', role: 'tab', 'aria-selected': String(k === slot), onclick: () => { if (k === slot) return; slot = k; msg = ''; mountSel = null; refreshPortrait(); render(); },
  }, k === MOUNTS_TAB ? 'Reittiere' : SLOT_NAMES[k])));

  // Reiter „Reittiere“: alle Reittiere als kleine Stallbilder, fehlende als Silhouette.
  // „Auswählen“ legt fest, welches Reittier V bzw. der Reittier-Knopf ruft.
  const renderMounts = () => {
    const list = mountList(), m = mountPick(list), deko = g.assets?.sprites?.decor_steppe ?? null;
    const owned = list.filter((x) => x.owned).length;
    const card = (it) => h(`button.wd-card${m?.id === it.id ? '.sel' : ''}${it.active ? '.cur' : ''}${it.owned ? '' : '.miss'}`, {
      type: 'button', title: it.name, 'aria-label': it.name, 'aria-pressed': m?.id === it.id ? 'true' : 'false',
      style: it.owned ? { '--wd-r': RARITY_COLORS[it.rarity] ?? RARITY_COLORS.rare } : null,
      onclick: () => { if (mountSel === it.id) return; mountSel = it.id; msg = ''; refreshPortrait(); render(); },
    }, mountCard(g.character.mountDef(it.id), it.owned, deko), it.active ? h('span.wd-check', { 'aria-hidden': 'true' }) : null);
    const check = g.character?.canMount?.() ?? { reason: null };
    // Sperrgrund nur zu einem eigenen Reittier (bei fehlenden steht schon der Fundort da)
    const gate = m?.owned && (check.reason === 'level' || check.reason === 'lesson') ? g.character?.mountReasonText?.(check.reason) ?? '' : '';
    const sub = !m ? h('span.wd-pick-sub.wd-pick-hint', '')
      : !m.owned ? h('span.wd-pick-sub.wd-pick-hint', m.source)
      : h('span.wd-pick-sub.wd-pick-info', `${MOUNT_RARITY[m.rarity] ?? ''} · +${fmtNum(Math.round(m.speed * 100))} % Tempo`);
    const state = !m?.owned ? 'miss' : m.active ? 'on' : 'can';
    const apply = h(`button.ef-btn.wd-apply.wd-mapply.is-${state}${state === 'can' ? '.primary' : ''}`, {
      type: 'button', disabled: state !== 'can', 'aria-pressed': state === 'on' ? 'true' : null,
      onclick: () => {
        const r = g.character.selectMount(m.id);
        if (r?.ok) { mountSel = null; msg = ''; session.bus.emit(EV.UI_TOAST, { text: 'Reittier gewählt', kind: 'info' }); }
        else msg = r?.error ?? '';
        render();
      },
    }, state === 'on' ? h('span.wd-mapply-check', { 'aria-hidden': 'true' }) : null, state === 'on' ? 'Ausgewählt' : state === 'can' ? 'Auswählen' : 'Noch nicht gesammelt');
    root.replaceChildren(
      head(), tabs(),
      h('div.wd-body.wd-stall',
        h('div.wd-stage',
          h('div.wd-scene-wrap', stage.el, h('span.wd-count', `${fmtNum(owned)} / ${fmtNum(list.length)}`)),
          h('div.wd-pick',
            h(`span.wd-pick-name${m && !m.owned ? '.miss' : ''}`, { style: m?.owned ? { color: RARITY_COLORS[m.rarity] ?? RARITY_COLORS.rare } : null }, m ? m.name : 'Noch keine Reittiere'),
            sub),
          apply,
          gate ? h('p.wd-msg.wd-gate', gate) : null,
          msg ? h('p.wd-msg', msg) : null),
        h('div.wd-cards', { role: 'list', 'aria-label': `${fmtNum(owned)} von ${fmtNum(list.length)} Reittieren` }, list.map(card))));
  };

  const render = () => {
    root.classList.toggle('wd-m', slot === MOUNTS_TAB);
    if (slot === MOUNTS_TAB) { renderMounts(); return; }
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
      tabs(),
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
      h('footer.wd-foot', h('span.ef-note', `${fmtNum(total)} Aussehen gesammelt`)));
  };
  const head = () => h('header.wd-head',
    h('h2.wd-title', 'Garderobe'),
    h('button.pg-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() }, '✕'));

  const off = session.bus.on(EV.WARDROBE_UNLOCKED ?? 'wardrobe:unlocked', () => render());
  // Neues Reittier erbeutet oder gewechselt, während das Fenster offen ist
  const offMount = [EV.MOUNT_LEARNED, EV.MOUNT_CHANGED].filter(Boolean).map((ev) => session.bus.on(ev, () => { if (slot === MOUNTS_TAB) { refreshPortrait(); render(); } }));
  // Drehen/Fenstergröße: Bühne und Karten neu im passenden ganzzahligen Maßstab
  const onResize = () => { if (slot === MOUNTS_TAB) { refreshPortrait(); render(); } };
  compactQ?.addEventListener?.('change', onResize);
  refreshPortrait();
  render();
  return {
    root,
    update(dt) { if (slot === MOUNTS_TAB) stage?.update(dt); else portrait.update(dt); },
    dispose() { off?.(); offMount.forEach((f) => f?.()); compactQ?.removeEventListener?.('change', onResize); },
  };
}
