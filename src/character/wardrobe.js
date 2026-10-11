import { EV } from '../core/events.js';
import { resolveGear, shownEquipment, lookAllowed, lookShapeKey, LOOK_SLOTS, HIDE_LOOK } from './gearLook.js';
import { SET_ITEMS, ownedSetLooks, setOfItem } from './skinSets.js';

// Garderobe (Thread A, Runde 08.10.): jedes gefundene Aussehen bleibt gesammelt und lässt sich über die
// getragene Ausrüstung legen. Alte Teile dürfen danach verkauft werden, das Aussehen bleibt.
//
// Speicher:  character.wardrobe = { looks: [itemId, …], shown: { weapon, chest, head, hands, feet } }
//            shown[slot] = itemId | null (eigene Ausrüstung) | 'none' (nur head: Helm ausblenden)
// Commands:  wardrobe:unlock { itemIds }               -> { ok, added }
//            wardrobe:show { slot, itemId|null|'none' } -> { ok } | { ok: false, reason: 'slot'|'locked'|'class' }
//            wardrobe:showSet { setId }               -> { ok, slots } (alle Teile eines gekauften Skinsets anlegen)
// Ereignis:  EV.WARDROBE_UNLOCKED ('wardrobe:unlocked') { itemIds }
// Skinsets (character/skinSets.js): Teile stehen nie in looks, sie gelten, solange slices.shop.owned 'look:<setId>' führt.
// Freischalten: nach jedem Command und beim Spielstart alles aus Tasche, Ausrüstung und Bank.
// Optik:     gearLook.shownEquipment(slices, content) (eigener Held, snapshotLook, Mehrspieler-Look)
// Panel (D): game.character.wardrobe = { SLOTS, entries(slot), show(slot, value), count() },
//            game.character.previewGear(overrides) -> gear für getHeroSprites
export const WARDROBE_MAX = 2000;
export const WARDROBE_EVENT = EV.WARDROBE_UNLOCKED ?? 'wardrobe:unlocked';
const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
const ID_RE = /^[a-z0-9_]{1,48}$/;

const slotOf = (def) => (def?.slot === 'armor' ? 'chest' : def?.slot);
// Hat das Teil ein sichtbares Aussehen (Waffe, Brust, Kopf, Hände, Füße)?
export const hasLook = (def) => !!def && LOOK_SLOTS.includes(slotOf(def));

// Laden: Form prüfen, unbekannte Teile verwerfen, doppelte entfernen, Obergrenze.
export function cleanWardrobe(raw, isLookItem = () => true) {
  const looks = [];
  const seen = new Set();
  for (const id of Array.isArray(raw?.looks) ? raw.looks : []) {
    if (looks.length >= WARDROBE_MAX) break;
    if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id) || SET_ITEMS[id] || !isLookItem(id)) continue;
    seen.add(id); looks.push(id);
  }
  const shown = {};
  for (const slot of LOOK_SLOTS) {
    const v = raw?.shown?.[slot];
    shown[slot] = v === HIDE_LOOK && slot === 'head' ? HIDE_LOOK : typeof v === 'string' && (seen.has(v) || SET_ITEMS[v]?.slot === slot) ? v : null;
  }
  return { looks, shown };
}

// Alle Teile mit Aussehen, die der Spielstand gerade hält (Tasche, Questbeutel, Ausrüstung, Bank).
function heldLookIds(slices, content) {
  const ids = new Set();
  const add = (e) => { const id = typeof e === 'string' ? e : e?.itemId; if (id && hasLook(content.find('item', id))) ids.add(id); };
  const inv = slices.inventory ?? {};
  for (const e of inv.slots ?? []) add(e);
  for (const e of Object.values(inv.equipment ?? {})) add(e);
  for (const e of slices.bank?.slots ?? []) add(e);
  return ids;
}

// Gleiches Aussehen verschiedener Teile wird zu einem Eintrag (gearLook.lookShapeKey: was der Held zeichnet).
const keyCache = new Map();
function lookKeyOf(content, slot, id) {
  const k = `${slot}|${id}`;
  if (!keyCache.has(k)) keyCache.set(k, lookShapeKey(slot, resolveGear({ [slot]: id }, content)?.[slot] ?? null));
  return keyCache.get(k);
}

// Paneldaten für einen Platz (D baut das Fenster).
export function wardrobeEntries(slices, content, slot) {
  const ch = slices.character ?? {}, w = ch.wardrobe ?? { looks: [], shown: {} };
  const worn = shownEquipment({ inventory: slices.inventory, character: { ...ch, wardrobe: null } }, content)[slot] ?? null;
  const current = w.shown?.[slot] ?? null;
  const groups = new Map();
  for (const id of [...(w.looks ?? []), ...ownedSetLooks(slices)]) {
    const def = content.find('item', id);
    if (slotOf(def) !== slot) continue;
    // Nur, was die eigene Klasse tragen kann (Waldläufer: keine Nahkampfwaffen)
    if (!lookAllowed(def, slot, ch.classId)) continue;
    const key = lookKeyOf(content, slot, id);
    const prev = groups.get(key);
    // Pro Aussehen ein Eintrag: das gewählte bzw. getragene Teil gewinnt, sonst das seltenste
    const rank = (e) => (e.itemId === current ? -2 : e.itemId === worn ? -1 : RARITY_ORDER[e.rarity] ?? 9);
    if (prev && rank(prev) <= rank({ itemId: id, rarity: def.rarity ?? 'common' })) continue;
    groups.set(key, { itemId: id, name: def.name, rarity: def.rarity ?? 'common', icon: def.icon, usable: true, shown: id === current, setId: def.skinSet ?? null });
  }
  // Skinset zuerst, dann nach Seltenheit
  const list = [...groups.values()].sort((a, b) => !!b.setId - !!a.setId || (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) || a.name.localeCompare(b.name, 'de'));
  return { current, equipped: worn, list };
}

export function installWardrobe(game) {
  const { content, state } = game;
  const bus = state.bus;
  const isLookItem = (id) => hasLook(content.find('item', id));

  state.defineCommand('wardrobe:unlock', (s, { itemIds } = {}, ctx) => {
    const w = s.get('character').wardrobe;
    const have = new Set(w.looks);
    const added = [];
    for (const id of Array.isArray(itemIds) ? itemIds : []) {
      if (w.looks.length >= WARDROBE_MAX) break;
      if (typeof id !== 'string' || have.has(id) || !isLookItem(id)) continue;
      if (content.find('item', id)?.source === 'achievement') continue;   // nur über den Erfolg (progression/endgame.js grantReward)
      if (SET_ITEMS[id]) continue;                                         // Skinsets nur über den Shop (slices.shop)
      have.add(id); w.looks.push(id); added.push(id);
    }
    if (added.length) ctx.bus.emit(WARDROBE_EVENT, { itemIds: added });
    return { ok: true, added };
  });

  state.defineCommand('wardrobe:show', (s, { slot, itemId = null } = {}, ctx) => {
    if (!LOOK_SLOTS.includes(slot)) return { ok: false, reason: 'slot' };
    const ch = s.get('character');
    if (itemId === HIDE_LOOK) {
      if (slot !== 'head') return { ok: false, reason: 'slot' };
    } else if (itemId != null) {
      if (SET_ITEMS[itemId] ? !ownedSetLooks({ shop: s.slices.shop }).has(itemId) : !ch.wardrobe.looks.includes(itemId)) return { ok: false, reason: 'locked' };
      if (slotOf(ctx.content.find('item', itemId)) !== slot) return { ok: false, reason: 'slot' };
      if (!lookAllowed(ctx.content.find('item', itemId), slot, ch.classId)) return { ok: false, reason: 'class' };
    }
    ch.wardrobe.shown = { ...ch.wardrobe.shown, [slot]: itemId };
    return { ok: true, slot, itemId };
  });

  // Ganzes Skinset anlegen (Garderobe: Knopf „Set anlegen“ an einem Set-Teil)
  state.defineCommand('wardrobe:showSet', (s, { setId } = {}) => {
    const set = setOfItem(`${setId}_weapon`);
    const ch = s.get('character');
    if (!set) return { ok: false, reason: 'slot' };
    if (set.classId !== ch.classId) return { ok: false, reason: 'class' };
    const owned = ownedSetLooks({ shop: s.slices.shop });
    if (!Object.values(set.pieces).every((id) => owned.has(id))) return { ok: false, reason: 'locked' };
    ch.wardrobe.shown = { ...ch.wardrobe.shown, ...set.pieces };
    return { ok: true, slots: Object.keys(set.pieces) };
  });

  // Freischalten nach jedem Command (Beute, Kauf, Belohnung, Bank) und beim Spielstart (alte Spielstände).
  // Gesammelt und einen Tick später committet, damit kein Command innerhalb eines anderen läuft.
  let queued = false;
  const scan = () => {
    queued = false;
    const w = state.slices.character?.wardrobe;
    if (!w) return;
    const have = new Set(w.looks);
    const fresh = [...heldLookIds(state.slices, content)].filter((id) => !have.has(id));
    if (fresh.length) state.commit('wardrobe:unlock', { itemIds: fresh });
  };
  const later = () => { if (!queued) { queued = true; queueMicrotask(scan); } };
  bus.on(EV.STATE_CHANGED, (e) => { if (e?.type !== 'wardrobe:unlock') later(); });
  bus.on(EV.GAME_STARTED, later);

  game.character = {
    ...(game.character ?? {}),
    wardrobe: {
      SLOTS: LOOK_SLOTS,
      HIDE: HIDE_LOOK,
      entries: (slot) => wardrobeEntries(state.slices, content, slot),
      show: (slot, value = null) => state.commit('wardrobe:show', { slot, itemId: value }),
      showSet: (setId) => state.commit('wardrobe:showSet', { setId }),
      count: () => state.slices.character?.wardrobe?.looks?.length ?? 0,
    },
    // Vorschau im Panel: { slot: itemId|null|'none' } über die aktuelle Auswahl legen
    previewGear: (overrides = {}) => {
      const ch = state.slices.character ?? {};
      const w = ch.wardrobe ?? { looks: [], shown: {} };
      const shown = { ...w.shown, ...overrides };
      return resolveGear(shownEquipment({ inventory: state.slices.inventory, shop: state.slices.shop, character: { ...ch, wardrobe: { ...w, shown } } }, content), content);
    },
  };
  return { isLookItem };
}
