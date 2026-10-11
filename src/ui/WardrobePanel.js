import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, iconCanvas, itemIconId, RARITY_COLORS } from '../gfx/Icons.js';
import { spriteStyle } from '../character/cosmetics.js';
import { getHeroSprites } from '../sprites/hero.js';
import { StableStage, mountCard, emptyCard, mountStand, snapToDevice, cardFit, cardScale, TEX } from './Stable.js';
import { fmtNum } from '../i18n/index.js';
import { findSkinSet, SET_ITEMS } from '../character/skinSets.js';

// Sammlung (Panel 'wardrobe', früher Garderobe) und Gewandmeisterin (Panel 'transmog', src/transmog) – Daten von Thread A:
//   game.character.wardrobe = { SLOTS, entries(slot), catalog(slot), price(slot), cost(changes), transmog(changes) }
//   entries(slot) -> { current: itemId|null|'none', equipped, list: [{ itemId, name, rarity, icon, usable, shown }] }
//   catalog(slot) -> [{ itemId, name, rarity, owned, source, setId }] (alles, was die Klasse tragen kann)
//   transmog({ slot: itemId|null|'none' }) -> { ok, cost } | { ok:false, reason } (kostet Gold, character/wardrobe.js)
//   game.character.previewGear(overrides) -> gear für die Heldenvorschau
// Sammlung: nur ansehen. Standard nur Gesammeltes, der Haken „Nicht gesammelt“ zeigt auch Fehlendes (Silhouette, Herkunft).
// Anlegen geht nur bei der Gewandmeisterin in jeder Wegstein-Stadt, wie Transmog in WoW: Änderungen an mehreren
// Plätzen sammeln, Vorschau auf der Bühne, ein Knopf mit dem Gesamtpreis. Zurück zur eigenen Ausrüstung ist frei.
// Reiter „Reittiere“ (character/mounts.js):
//   game.character.mountCollection() -> [{ id, name, rarity, speed, source, owned, active }]
//   game.character.selectMount(id)   -> Reittier für die Reitfähigkeit (character.mounts.active, Mitspieler sehen es)
// Alle Reiter haben denselben Aufbau: links die Bühne (ui/Stable.js, Steppe wie die Reittier-Parade, ganzzahliges
// Raster), darunter Name, eine Zeile Info und ein Knopf an fester Stelle; rechts das Raster.
// Gewandmeisterin: erste Kachel = Aussehen der angelegten Ausrüstung (null), beim Kopf zweite = Helm ausblenden ('none').
// Skinset-Teile (gekauft, character/skinSets.js) stehen vorn; angetippt zeigt die Bühne das ganze Set und merkt alle Teile vor.
// Reittiere (nur Sammlung, Auswahl kostenlos): gleich große Karten in festen Spalten, fehlende als Silhouette mit Fundort.
// Öffnen dort: { tab: 'mounts' }.
const MOUNTS_TAB = 'mounts';
const MOUNT_RARITY = { rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
const SLOT_NAMES = { weapon: 'Waffe', chest: 'Brust', head: 'Kopf', hands: 'Hände', feet: 'Füße' };
const SLOT_PH = { weapon: 'sword', chest: 'armor', head: 'helm', hands: 'gloves', feet: 'boots' };
const REASONS = {
  slot: 'Dieser Platz hat kein eigenes Aussehen.', locked: 'Noch nicht gesammelt.', class: 'Nur für eine andere Klasse.',
  empty: 'Lege zuerst ein Teil an diesem Platz an.', gold: 'Nicht genug Gold.',
};
const RARITY_NAMES = { common: 'Gewöhnlich', uncommon: 'Ungewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
const TRANSMOG = 'transmog';
let showMissing = false;   // Haken „Nicht gesammelt“: gilt für alle Reiter, bleibt bis zum Neuladen

export function installWardrobe(game) {
  game.panels.register('wardrobe', (session, params) => createWardrobePanel(session, params), { pauses: false, title: 'Sammlung' });
  game.panels.register(TRANSMOG, (session, params) => createWardrobePanel(session, { ...params, mode: TRANSMOG }), { pauses: false, title: 'Gewandmeisterin' });
}

// Kachelbild: Icon (26 px) ganzzahlig vergrößert; 'none' mit harter roter Diagonale, leer = abgedunkelter Platzhalter
const ICON_PX = 26;
// sil: noch nicht gesammelt – dunkle Silhouette mit harter Kontur wie die fehlenden Reittiere (keine Halbtransparenz)
const SIL = ['#1a1323', '#241a2f', '#2e2339'], SIL_RIM = '#4a3a58';
function tileIcon(icon, { slash = false, dim = false, sil = false, css }) {
  if (sil) return silIcon(icon, css);
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

function silIcon(icon, css) {
  const src = iconCanvas(icon), c = document.createElement('canvas');
  c.width = ICON_PX; c.height = ICON_PX;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, ICON_PX, ICON_PX), d = img.data, solid = (i, j) => i >= 0 && j >= 0 && i < ICON_PX && j < ICON_PX && d[(j * ICON_PX + i) * 4 + 3] >= 128;
  const out = x.createImageData(ICON_PX, ICON_PX), o = out.data;
  for (let j = 0; j < ICON_PX; j++) for (let i = 0; i < ICON_PX; i++) {
    if (!solid(i, j)) continue;
    const k = (j * ICON_PX + i) * 4, edge = !solid(i - 1, j) || !solid(i + 1, j) || !solid(i, j - 1) || !solid(i, j + 1);
    const lum = 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2];
    const hx = edge ? SIL_RIM : SIL[lum > 150 ? 2 : lum > 70 ? 1 : 0], n = parseInt(hx.slice(1), 16);
    o[k] = n >> 16; o[k + 1] = (n >> 8) & 255; o[k + 2] = n & 255; o[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  c.className = 'ef-icon';
  c.style.width = `${css}px`; c.style.height = `${css}px`;
  return c;
}

function createWardrobePanel(session, params = {}) {
  const g = session.game, wr = g.character?.wardrobe, st = session.state, content = session.content ?? g.content;
  const shop = params?.mode === TRANSMOG;   // Gewandmeisterin: anlegen gegen Gold; sonst Sammlung (nur ansehen)
  const title = shop ? 'Gewandmeisterin' : 'Sammlung';
  const slots = (wr?.SLOTS ?? Object.keys(SLOT_NAMES)).filter((k) => SLOT_NAMES[k]);
  const hasMounts = !shop && typeof g.character?.mountCollection === 'function';
  let slot = params?.tab === MOUNTS_TAB && hasMounts ? MOUNTS_TAB : slots[0], preview = {}, msg = '';
  // Sammlung: angetipptes Aussehen je Platz (nur Vorschau). Gewandmeisterin: vorgemerkte Änderungen { slot: wert }
  let picked = {}, pending = {};
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
  const shownNow = () => st.slices.character?.wardrobe?.shown ?? {};

  const refreshStage = () => {
    const c = st.slices.character;
    stage.setScale(compact() ? 3 : 4);
    if (slot !== MOUNTS_TAB) {
      const gear = g.character?.previewGear?.(shop ? pending : preview) ?? null;
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
  const root = h(`div.ef-panel.wd-panel${shop ? '.wd-shop' : ''}`, { role: 'dialog', 'aria-label': title });

  // Haken „Nicht gesammelt“ (nur Sammlung): pixelgenauer Kasten wie der Haken an der gewählten Kachel
  const filter = () => h('label.wd-filter',
    h('input', { type: 'checkbox', checked: showMissing, onchange: (e) => { showMissing = e.target.checked; if (!showMissing) { picked = {}; preview = {}; } cardK = null; msg = ''; refreshStage(); render(); } }),
    h('span.wd-filter-box', { 'aria-hidden': 'true' }), 'Nicht gesammelt');
  const head = () => h('header.wd-head',
    h('h2.wd-title', title),
    shop ? null : filter(),
    h('button.pg-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() }, '✕'));
  const tabs = () => h('div.pg-tabs.wd-tabs', { role: 'tablist' }, [...slots, ...(hasMounts ? [MOUNTS_TAB] : [])].map((k) => h(`button.pg-tabbtn${k === slot ? '.on' : ''}${shop && k in pending ? '.chg' : ''}`, {
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
  const stateBtn = (state, label, onclick, coin = false) => h(`button.ef-btn.wd-apply.is-${state}${state === 'can' ? '.primary' : ''}`, {
    type: 'button', disabled: state !== 'can', 'aria-pressed': state === 'on' ? 'true' : null, onclick,
  }, state === 'on' ? h('span.wd-apply-check', { 'aria-hidden': 'true' }) : null, label, coin ? iconEl('gold', 16) : null);

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
    const all = mountList(), list = showMissing ? all : all.filter((x) => x.owned), m = mountPick(list);
    const owned = all.filter((x) => x.owned).length;
    const card = (it) => h(`button.wd-card${m?.id === it.id ? '.sel' : ''}${it.active ? '.cur' : ''}${it.owned ? '' : '.miss'}`, {
      type: 'button', title: it.name, 'aria-label': it.name, 'aria-pressed': m?.id === it.id ? 'true' : 'false',
      style: it.owned ? `--wd-r: ${RARITY_COLORS[it.rarity] ?? RARITY_COLORS.rare}` : null, // als Text: Object.assign setzt keine CSS-Variablen
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
    const grid = h('div.wd-cards', { role: 'list', 'aria-label': `${fmtNum(owned)} von ${fmtNum(all.length)} Reittieren` }, cards);
    // Spaltenbreite = Kartenbreite (hängt vom ganzzahligen Maßstab ab) + Rahmen
    const cw = parseFloat(cards[0]?.querySelector('canvas')?.style.width);
    if (cw) grid.style.gridTemplateColumns = `repeat(auto-fill, ${cw + 2}px)`;
    root.replaceChildren(head(), tabs(), h('div.wd-body',
      stageCol({
        count: `${fmtNum(owned)} / ${fmtNum(all.length)}`,
        name: m ? m.name : 'Noch keine Reittiere', nameColor: m?.owned ? RARITY_COLORS[m.rarity] ?? RARITY_COLORS.rare : null, nameMiss: !!m && !m.owned,
        info: !m ? '' : m.owned ? `${MOUNT_RARITY[m.rarity] ?? ''} · +${fmtNum(Math.round(m.speed * 100))} % Tempo` : m.source,
        button, note: msg || gate,
      }),
      grid));
    fitGrid(grid, list.length);
  };

  // ---------------------------------------------------------------- Kacheln (beide Fenster)
  const css = () => (compact() ? ICON_PX * 2 : ICON_PX * 3);
  const tile = (value, label, visual, { sel, cur, rarity = null, usable = true, miss = false, cap = null, onPick }) => h(`button.wd-tile${sel ? '.sel' : ''}${cur ? '.cur' : ''}${usable ? '' : '.off'}${miss ? '.miss' : ''}`, {
    type: 'button', title: label, 'aria-label': label, 'aria-pressed': sel ? 'true' : 'false',
    style: rarity && !miss ? `--wd-r: ${RARITY_COLORS[rarity] ?? RARITY_COLORS.common}` : null,
    onclick: () => { if (!sel) { onPick(value); msg = ''; refreshStage(); render(); } },
  }, visual, cap ? h('span.wd-tile-cap', cap) : null, cur ? h('span.wd-check', { 'aria-hidden': 'true' }) : null, usable ? null : h('span.wd-lock', { 'aria-hidden': 'true' }));
  // Set-Teil: ganzes Set vormerken; anderes Teil: Set-Vorschau der übrigen Plätze verwerfen
  const withSet = (map, value, setId) => {
    const rest = setId ? map : Object.fromEntries(Object.entries(map).filter(([k, v]) => k === slot || !SET_ITEMS[v]));
    return { ...rest, ...(setId ? findSkinSet(setId)?.pieces : null), [slot]: value };
  };

  // ---------------------------------------------------------------- Sammlung (nur ansehen)
  const renderCollection = () => {
    const all = wr.catalog(slot), list = showMissing ? all : all.filter((it) => it.owned);
    const owned = all.filter((it) => it.owned).length;
    // Was der Held gerade an diesem Platz zeigt: angelegtes Aussehen, sonst das getragene Teil (gleich aussehende zählen mit)
    const e = wr.entries(slot);
    const shown = e.current && e.current !== 'none' ? e.current : itemId(e.equipped);
    const visible = all.find((it) => it.itemId === shown) ?? (shown ? all.find((it) => it.owned && wr.sameLook(slot, it.itemId, shown)) : null) ?? null;
    const sel = list.find((it) => it.itemId === picked[slot]) ?? (visible && list.includes(visible) ? visible : null) ?? list[0] ?? null;
    const tiles = list.map((it) => tile(it.itemId, it.name, tileIcon(itemIconId(content.find('item', it.itemId)), { sil: !it.owned, css: css() }), {
      sel: sel?.itemId === it.itemId, cur: it === visible, rarity: it.rarity, miss: !it.owned,
      onPick: (v) => { picked = { ...picked, [slot]: v }; preview = withSet(preview, v, it.setId); },
    }));
    // Bühne zeigt das gewählte Aussehen (auch Fehlendes); Auswahl anderer Plätze bleibt stehen wie in einer Umkleide
    if (sel && preview[slot] !== sel.itemId) { preview = withSet(preview, sel.itemId, sel.setId); refreshStage(); }
    const info = !sel ? '' : !sel.owned ? sel.source : sel.setId ? 'Skinset' : RARITY_NAMES[sel.rarity] ?? '';
    root.replaceChildren(head(), tabs(), h('div.wd-body',
      stageCol({
        count: `${fmtNum(owned)} / ${fmtNum(all.length)}`,
        name: sel ? sel.name : 'Noch nichts gesammelt', nameColor: sel?.owned ? RARITY_COLORS[sel.rarity] ?? RARITY_COLORS.common : null, nameMiss: !!sel && !sel.owned,
        info, button: h('p.wd-where', 'Anlegen bei der Gewandmeisterin'), note: '',
      }),
      h('div.wd-grid', tiles)));
  };

  // ---------------------------------------------------------------- Gewandmeisterin (anlegen gegen Gold)
  const renderTransmog = () => {
    const e = wr.entries(slot);
    const shown = shownNow();
    const cur = e.current ?? null;
    // Das Aussehen der angelegten Ausrüstung zeigt schon die erste Kachel: keine zweite, gleich aussehende
    const list = (e.list ?? []).filter((it) => it.itemId !== e.equipped || it.itemId === cur);
    const sel = slot in pending ? pending[slot] : cur;
    const wornDef = content.find('item', itemId(e.equipped));
    // Gesammeltes liegt nur über einem getragenen Teil, Skinsets auch über leeren Plätzen (gearLook.shownEquipment)
    const fits = (it) => !!wornDef || !!it.setId;
    const pick = (value, setId = null) => {
      const next = withSet(pending, value, setId);
      // Was schon angelegt ist, ist keine Änderung
      pending = Object.fromEntries(Object.entries(next).filter(([k, v]) => (shown[k] ?? null) !== (v ?? null)));
    };
    const tiles = [
      tile(null, 'Angelegter Gegenstand', tileIcon(wornDef ? itemIconId(wornDef) : SLOT_PH[slot], { dim: !wornDef, css: css() }), { sel: sel === null, cur: cur === null, rarity: wornDef?.rarity ?? null, cap: 'Ausrüstung', onPick: (v) => pick(v) }),
      slot === 'head' ? tile('none', 'Helm ausgeblendet', tileIcon(wornDef ? itemIconId(wornDef) : SLOT_PH.head, { slash: true, css: css() }), { sel: sel === 'none', cur: cur === 'none', cap: 'Aus', onPick: (v) => pick(v) }) : null,
      ...list.map((it) => tile(it.itemId, it.name, tileIcon(itemIconId(content.find('item', it.itemId)), { css: css() }), {
        sel: sel === it.itemId, cur: cur === it.itemId, rarity: it.rarity, usable: fits(it),
        onPick: (v) => { if (fits(it)) pick(v, it.setId); else msg = REASONS.empty; },
      })),
    ];
    const it = list.find((x) => x.itemId === sel);
    const cost = wr.cost(pending), gold = st.slices.wallet?.gold ?? 0, changes = Object.keys(pending).length;
    const state = !changes ? 'on' : gold < cost ? 'off' : 'can';
    const label = !changes ? 'Angelegt' : gold < cost ? 'Nicht genug Gold' : cost ? `Anlegen · ${fmtNum(cost)}` : 'Anlegen';
    const button = stateBtn(state, label, () => {
      const r = wr.transmog(pending);
      if (r?.ok) { pending = {}; msg = ''; session.bus.emit(EV.UI_TOAST, { text: 'Aussehen angelegt', kind: 'info' }); refreshStage(); }
      else msg = REASONS[r?.reason] ?? '';
      render();
    }, !!changes && cost > 0);
    const name = it ? it.name : sel === 'none' ? 'Helm ausgeblendet' : 'Angelegter Gegenstand';
    // Info: Preis dieses Platzes, solange er vorgemerkt ist; sonst das echte Teil darunter
    const price = slot in pending && sel !== null && sel !== 'none' ? wr.price(slot) : 0;
    const info = price ? `${fmtNum(price)} Gold` : it || sel === 'none' ? '' : wornDef?.name ?? '';
    root.replaceChildren(head(), tabs(), h('div.wd-body',
      stageCol({ count: `${fmtNum(gold)} Gold`, name, nameColor: it ? RARITY_COLORS[it.rarity] ?? RARITY_COLORS.common : null, info, button, note: msg }),
      h('div.wd-grid', tiles)));
  };

  const render = () => {
    root.classList.toggle('wd-m', slot === MOUNTS_TAB);
    if (!wr && slot !== MOUNTS_TAB) root.replaceChildren(head(), h('p.ef-note', `${title} ist gerade nicht verfügbar.`));
    else if (slot === MOUNTS_TAB) renderMounts();
    else if (shop) renderTransmog();
    else renderCollection();
    requestAnimationFrame(snapAll);
  };

  const off = session.bus.on(EV.WARDROBE_UNLOCKED ?? 'wardrobe:unlocked', () => render());
  const offGold = shop ? session.bus.on(EV.GOLD_CHANGED, () => render()) : null;
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
    dispose() { off?.(); offGold?.(); offMount.forEach((f) => f?.()); compactQ?.removeEventListener?.('change', onResize); globalThis.removeEventListener?.('resize', onResize); },
  };
}
