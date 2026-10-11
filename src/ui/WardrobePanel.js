import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, iconCanvas, RARITY_COLORS } from '../gfx/Icons.js';
import { spriteStyle } from '../character/cosmetics.js';
import { getHeroSprites } from '../sprites/hero.js';
import { StableStage, mountCard, emptyCard, mountStand, snapToDevice, cardFit, cardScale, TEX } from './Stable.js';
import { fmtNum } from '../i18n/index.js';

// Garderobe (Panel 'wardrobe') – Thread D, Daten von Thread A:
//   game.character.wardrobe = { SLOTS, entries(slot), show(slot, value) }
//   entries(slot) -> { current: itemId|null|'none', equipped, list: [{ itemId, name, rarity, icon, usable, shown }] }
//   show(slot, itemId|null|'none') -> { ok } | { ok:false, reason }
//   game.character.previewGear(overrides) -> gear für die Heldenvorschau
// Reiter „Reittiere“ (character/mounts.js):
//   game.character.mountCollection() -> [{ id, name, rarity, speed, source, owned, active }]
//   game.character.selectMount(id)   -> Reittier für die Reitfähigkeit (character.mounts.active, Mitspieler sehen es)
// Alle Reiter haben denselben Aufbau: links die Bühne (ui/Stable.js, Steppe wie die Reittier-Parade, ganzzahliges
// Raster), darunter Name, eine Zeile Info und ein Knopf an fester Stelle; rechts das Raster.
// Ausrüstung: erste Kachel = Aussehen der angelegten Ausrüstung (null), beim Kopf zweite = Helm ausblenden ('none').
// Reittiere: gleich große Karten in festen Spalten, fehlende als Silhouette mit Fundort. Öffnen dort: { tab: 'mounts' }.
const MOUNTS_TAB = 'mounts';
const MOUNT_RARITY = { rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
const SLOT_NAMES = { weapon: 'Waffe', chest: 'Brust', head: 'Kopf', hands: 'Hände', feet: 'Füße' };
const SLOT_PH = { weapon: 'sword', chest: 'armor', head: 'helm', hands: 'gloves', feet: 'boots' };
const REASONS = { slot: 'Dieser Platz hat kein eigenes Aussehen.', locked: 'Noch nicht gesammelt.', class: 'Nur für eine andere Klasse.' };

export function installWardrobe(game) {
  game.panels.register('wardrobe', (session, params) => createWardrobePanel(session, params), { pauses: false, title: 'Garderobe' });
}

// Kachelbild: Icon (26 px) ganzzahlig vergrößert; 'none' mit harter roter Diagonale, leer = abgedunkelter Platzhalter
const ICON_PX = 26;
function tileIcon(icon, { slash = false, dim = false, css }) {
  if (!slash && !dim) return iconEl(icon, css);
  const src = iconCanvas(icon), c = document.createElement('canvas');
  c.width = ICON_PX; c.height = ICON_PX;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (dim) x.globalAlpha = 0.35;
  x.drawImage(src, 0, 0);
  x.globalAlpha = 1;
  if (slash) {
    x.globalAlpha = 0.45; x.fillStyle = '#0b0710'; x.fillRect(0, 0, ICON_PX, ICON_PX); x.globalAlpha = 1;
    for (let i = 3; i < ICON_PX - 3; i++) { x.fillStyle = '#0b0710'; x.fillRect(i - 1, ICON_PX - 1 - i - 1, 4, 4); }
    for (let i = 3; i < ICON_PX - 3; i++) { x.fillStyle = '#e04a3a'; x.fillRect(i, ICON_PX - 1 - i, 2, 2); }
  }
  c.className = 'ef-icon';
  c.style.width = `${css}px`; c.style.height = `${css}px`;
  return c;
}

function createWardrobePanel(session, params = {}) {
  const g = session.game, wr = g.character?.wardrobe, st = session.state, content = session.content ?? g.content;
  const slots = (wr?.SLOTS ?? Object.keys(SLOT_NAMES)).filter((k) => SLOT_NAMES[k]);
  const hasMounts = typeof g.character?.mountCollection === 'function';
  let slot = params?.tab === MOUNTS_TAB && hasMounts ? MOUNTS_TAB : slots[0], preview = {}, msg = '';
  let mountSel = null;   // angetipptes Reittier (Vorschau); null = aktives
  let cardK = null;      // Kartenmaßstab (Bildschirmpunkte je Feinpixel), nach dem ersten Messen passend gewählt
  const deko = () => g.assets?.sprites?.decor_steppe ?? null;
  const stage = new StableStage({ deko: deko() });
  // Bühne: Desktop 4, kleine Bildschirme 3 CSS-Pixel je Weltpixel; Kacheln 3- bzw. 2-fach (ganzzahlig, ui/Stable.js)
  const compactQ = globalThis.matchMedia?.('(max-height: 500px)');
  const compact = () => !!compactQ?.matches;
  const mountList = () => (hasMounts ? g.character.mountCollection() : []);
  const mountPick = (list) => list.find((m) => m.id === mountSel) ?? list.find((m) => m.active) ?? list.find((m) => m.owned) ?? list[0] ?? null;
  const itemId = (e) => (typeof e === 'string' ? e : e?.itemId ?? null);

  const refreshStage = () => {
    const c = st.slices.character;
    stage.setScale(compact() ? 3 : 4);
    if (slot !== MOUNTS_TAB) {
      const gear = g.character?.previewGear?.(preview) ?? null;
      const set = getHeroSprites(c.raceId, c.classId, c.appearance?.variant ?? 0, gear, spriteStyle(c.appearance ?? {}), TEX);
      stage.show({ anim: set.idle });
      return;
    }
    const m = mountPick(mountList());
    const def = m ? g.character?.mountDef?.(m.id) : null;
    if (!def) { stage.show({}); return; }
    if (!m.owned) { stage.show({ sil: mountStand(def) }); return; }
    // Held reitet im selben Feinraster wie das Reittier (res 2), so wie Mitspieler ihn sehen (character.animsForLook)
    const anims = g.character?.animsForLook?.({ raceId: c.raceId, classId: c.classId, appearance: c.appearance ?? {}, gear: g.character?.previewGear?.({}) ?? null, mountId: m.id }, TEX);
    stage.show({ anim: anims?.rideRun ?? anims?.ride ?? null, glow: def.look?.glow ?? null, ride: true });
  };
  const root = h('div.ef-panel.wd-panel', { role: 'dialog', 'aria-label': 'Garderobe' });

  const head = () => h('header.wd-head',
    h('h2.wd-title', 'Garderobe'),
    h('button.pg-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() }, '✕'));
  const tabs = () => h('div.pg-tabs.wd-tabs', { role: 'tablist' }, [...slots, ...(hasMounts ? [MOUNTS_TAB] : [])].map((k) => h(`button.pg-tabbtn${k === slot ? '.on' : ''}`, {
    type: 'button', role: 'tab', 'aria-selected': String(k === slot), onclick: () => { if (k === slot) return; slot = k; msg = ''; mountSel = null; refreshStage(); render(); },
  }, k === MOUNTS_TAB ? 'Reittiere' : SLOT_NAMES[k])));
  // Gemeinsamer Aufbau: Bühne mit Zähler, Name, Info (höchstens zwei Zeilen), Knopf an fester Stelle
  const stageCol = ({ count, name, nameColor = null, nameMiss = false, info = '', button, note = '' }) => h('div.wd-stage',
    h('div.wd-scene-wrap', stage.el, count ? h('span.wd-count', count) : null),
    h('div.wd-pick',
      h(`span.wd-pick-name${nameMiss ? '.miss' : ''}`, { style: nameColor ? { color: nameColor } : null }, name),
      h('span.wd-pick-sub', info)),
    button,
    h('p.wd-msg', note));
  // Knopf mit drei Zuständen: can (primär), on (gewählt, goldener Haken), off (deaktiviert)
  const stateBtn = (state, label, onclick) => h(`button.ef-btn.wd-apply.is-${state}${state === 'can' ? '.primary' : ''}`, {
    type: 'button', disabled: state !== 'can', 'aria-pressed': state === 'on' ? 'true' : null, onclick,
  }, state === 'on' ? h('span.wd-apply-check', { 'aria-hidden': 'true' }) : null, label);

  const snapAll = () => { if (root.isConnected) snapToDevice(root.querySelectorAll('canvas.wd-scene, .wd-card canvas, .wd-tile .ef-icon')); };

  // ---------------------------------------------------------------- Reittiere
  // Nach dem Einfügen messen: Kartenmaßstab so wählen, dass alle Karten ohne Rollen passen (ganzzahlig), dann die
  // letzte Reihe mit leeren Boxen auffüllen, damit alle Reihen bündig sind
  const fitGrid = (grid, n) => requestAnimationFrame(() => {
    if (!grid.isConnected || !grid.firstElementChild) return;
    const cs = getComputedStyle(grid), gap = parseFloat(cs.columnGap) || 0;
    const width = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const k = cardFit(n, width, grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), gap, 2, cardScale());
    if (k !== (cardK ?? cardScale())) { cardK = k; render(); return; }
    const w = grid.firstElementChild.getBoundingClientRect().width;
    const cols = Math.max(1, Math.floor((width + gap + 0.5) / (w + gap)));
    for (let i = 0, rest = (cols - (n % cols)) % cols; i < rest; i++) grid.append(h('span.wd-card.empty', { 'aria-hidden': 'true' }, emptyCard(cardK ?? cardScale())));
    snapAll();
  });
  const renderMounts = () => {
    const list = mountList(), m = mountPick(list);
    const owned = list.filter((x) => x.owned).length;
    const card = (it) => h(`button.wd-card${m?.id === it.id ? '.sel' : ''}${it.active ? '.cur' : ''}${it.owned ? '' : '.miss'}`, {
      type: 'button', title: it.name, 'aria-label': it.name, 'aria-pressed': m?.id === it.id ? 'true' : 'false',
      style: it.owned ? { '--wd-r': RARITY_COLORS[it.rarity] ?? RARITY_COLORS.rare } : null,
      onclick: () => { if (mountSel === it.id) return; mountSel = it.id; msg = ''; refreshStage(); render(); },
    }, mountCard(g.character.mountDef(it.id), it.owned, deko(), cardK ?? cardScale()), it.active ? h('span.wd-check', { 'aria-hidden': 'true' }) : null);
    const check = g.character?.canMount?.() ?? { reason: null };
    // Sperrgrund nur zu einem eigenen Reittier (bei fehlenden steht schon der Fundort da)
    const gate = m?.owned && (check.reason === 'level' || check.reason === 'lesson') ? g.character?.mountReasonText?.(check.reason) ?? '' : '';
    const state = !m?.owned ? 'off' : m.active ? 'on' : 'can';
    const button = stateBtn(state, state === 'on' ? 'Ausgewählt' : state === 'can' ? 'Auswählen' : 'Noch nicht gesammelt', () => {
      const r = g.character.selectMount(m.id);
      if (r?.ok) { mountSel = null; msg = ''; session.bus.emit(EV.UI_TOAST, { text: 'Reittier gewählt', kind: 'info' }); }
      else msg = r?.error ?? '';
      render();
    });
    const cards = list.map(card);
    const grid = h('div.wd-cards', { role: 'list', 'aria-label': `${fmtNum(owned)} von ${fmtNum(list.length)} Reittieren` }, cards);
    // Spaltenbreite = Kartenbreite (hängt vom ganzzahligen Maßstab ab) + Rahmen
    const cw = parseFloat(cards[0]?.querySelector('canvas')?.style.width);
    if (cw) grid.style.gridTemplateColumns = `repeat(auto-fill, ${cw + 2}px)`;
    root.replaceChildren(head(), tabs(), h('div.wd-body',
      stageCol({
        count: `${fmtNum(owned)} / ${fmtNum(list.length)}`,
        name: m ? m.name : 'Noch keine Reittiere', nameColor: m?.owned ? RARITY_COLORS[m.rarity] ?? RARITY_COLORS.rare : null, nameMiss: !!m && !m.owned,
        info: !m ? '' : m.owned ? `${MOUNT_RARITY[m.rarity] ?? ''} · +${fmtNum(Math.round(m.speed * 100))} % Tempo` : m.source,
        button, note: msg || gate,
      }),
      grid));
    fitGrid(grid, list.length);
  };

  // ---------------------------------------------------------------- Ausrüstung
  const renderItems = () => {
    if (!wr) { root.replaceChildren(head(), h('p.ef-note', 'Die Garderobe ist gerade nicht verfügbar.')); return; }
    const e = wr.entries(slot);
    const cur = e.current ?? null;
    const sel = slot in preview ? preview[slot] : cur;
    const total = slots.reduce((n, k) => n + (wr.entries(k).list?.length ?? 0), 0);
    const css = compact() ? ICON_PX * 2 : ICON_PX * 3;
    const wornDef = content.find('item', itemId(e.equipped));
    const tile = (value, label, visual, { rarity = null, usable = true, cap = null } = {}) => h(`button.wd-tile${sel === value ? '.sel' : ''}${cur === value ? '.cur' : ''}${usable ? '' : '.off'}`, {
      type: 'button', title: label, 'aria-label': label, 'aria-pressed': sel === value ? 'true' : 'false',
      style: rarity ? { '--wd-r': RARITY_COLORS[rarity] ?? RARITY_COLORS.common } : null,
      onclick: () => { if (sel === value) return; preview = { ...preview, [slot]: value }; msg = ''; refreshStage(); render(); },
    }, visual, cap ? h('span.wd-tile-cap', cap) : null, cur === value ? h('span.wd-check', { 'aria-hidden': 'true' }) : null, usable ? null : h('span.wd-lock', { 'aria-hidden': 'true' }));
    const tiles = [
      tile(null, 'Angelegter Gegenstand', tileIcon(wornDef?.icon ?? SLOT_PH[slot], { dim: !wornDef, css }), { rarity: wornDef?.rarity ?? null, cap: 'Ausrüstung' }),
      slot === 'head' ? tile('none', 'Helm ausgeblendet', tileIcon(wornDef?.icon ?? SLOT_PH.head, { slash: true, css }), { cap: 'Aus' }) : null,
      ...(e.list ?? []).map((it) => tile(it.itemId, it.name, tileIcon(it.icon, { css }), { rarity: it.rarity, usable: it.usable })),
    ];
    const pick = (e.list ?? []).find((it) => it.itemId === sel);
    const state = sel === cur ? 'on' : pick && !pick.usable ? 'off' : 'can';
    const button = stateBtn(state, state === 'on' ? 'Angelegt' : state === 'off' ? 'Andere Klasse' : 'Anlegen', () => {
      const r = wr.show(slot, sel);
      if (r?.ok) { const p = { ...preview }; delete p[slot]; preview = p; msg = ''; session.bus.emit(EV.UI_TOAST, { text: 'Aussehen angelegt', kind: 'info' }); refreshStage(); }
      else msg = REASONS[r?.reason] ?? '';
      render();
    });
    const name = pick ? pick.name : sel === 'none' ? 'Helm ausgeblendet' : 'Angelegter Gegenstand';
    const info = pick ? (pick.usable ? '' : 'Andere Klasse') : sel === 'none' ? '' : wornDef?.name ?? '';
    root.replaceChildren(head(), tabs(), h('div.wd-body',
      stageCol({ count: `${fmtNum(total)} Aussehen`, name, nameColor: pick ? RARITY_COLORS[pick.rarity] ?? RARITY_COLORS.common : null, info, button, note: msg }),
      h('div.wd-grid', tiles)));
  };

  const render = () => {
    root.classList.toggle('wd-m', slot === MOUNTS_TAB);
    if (slot === MOUNTS_TAB) renderMounts(); else renderItems();
    requestAnimationFrame(snapAll);
  };

  const off = session.bus.on(EV.WARDROBE_UNLOCKED ?? 'wardrobe:unlocked', () => render());
  // Neues Reittier erbeutet oder gewechselt, während das Fenster offen ist
  const offMount = [EV.MOUNT_LEARNED, EV.MOUNT_CHANGED].filter(Boolean).map((ev) => session.bus.on(ev, () => { if (slot === MOUNTS_TAB) { refreshStage(); render(); } }));
  // Drehen/Fenstergröße: Maßstab neu wählen und wieder aufs Bildschirmraster schieben
  const onResize = () => { cardK = null; refreshStage(); render(); };
  compactQ?.addEventListener?.('change', onResize);
  globalThis.addEventListener?.('resize', onResize);
  refreshStage();
  render();
  return {
    root,
    update(dt) { stage.update(dt); },
    dispose() { off?.(); offMount.forEach((f) => f?.()); compactQ?.removeEventListener?.('change', onResize); globalThis.removeEventListener?.('resize', onResize); },
  };
}
