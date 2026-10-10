import { EV } from '../core/events.js';
import { resolveGear, shownEquipment, lookAllowed, LOOK_SLOTS, HIDE_LOOK } from './gearLook.js';

// Garderobe (Thread A, Runde 08.10.): jedes gefundene Aussehen bleibt gesammelt und lässt sich über die
// getragene Ausrüstung legen. Alte Teile dürfen danach verkauft werden, das Aussehen bleibt.
//
// Speicher:  character.wardrobe = { looks: [itemId, …], shown: { weapon, chest, head, hands, feet } }
//            shown[slot] = itemId | null (eigene Ausrüstung) | 'none' (nur head: Helm ausblenden)
// Commands:  wardrobe:unlock { itemIds }               -> { ok, added }
//            wardrobe:show { slot, itemId|null|'none' } -> { ok } | { ok: false, reason: 'slot'|'locked'|'class' }
// Ereignis:  EV.WARDROBE_UNLOCKED ('wardrobe:unlocked') { itemIds }
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
    if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id) || !isLookItem(id)) continue;
    seen.add(id); looks.push(id);
  }
  const shown = {};
  for (const slot of LOOK_SLOTS) {
    const v = raw?.shown?.[slot];
    shown[slot] = v === HIDE_LOOK && slot === 'head' ? HIDE_LOOK : typeof v === 'string' && seen.has(v) ? v : null;
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

// Gleiches Aussehen verschiedener Teile (gleiches Icon, gleiche Seltenheit) wird zu einem Eintrag.
const keyCache = new Map();
function lookKeyOf(content, slot, id) {
  const k = `${slot}|${id}`;
  if (!keyCache.has(k)) keyCache.set(k, JSON.stringify(resolveGear({ [slot]: id }, content)?.[slot] ?? null));
  return keyCache.get(k);
}

// Paneldaten für einen Platz (D baut das Fenster).
export function wardrobeEntries(slices, content, slot) {
  const ch = slices.character ?? {}, w = ch.wardrobe ?? { looks: [], shown: {} };
  const worn = shownEquipment({ inventory: slices.inventory, character: { ...ch, wardrobe: null } }, content)[slot] ?? null;
  const current = w.shown?.[slot] ?? null;
  const groups = new Map();
  for (const id of w.looks ?? []) {
    const def = content.find('item', id);
    if (slotOf(def) !== slot) continue;
    const key = lookKeyOf(content, slot, id);
    const prev = groups.get(key);
    // Pro Aussehen ein Eintrag; das gewählte bzw. getragene Teil gewinnt
    if (prev && !(id === current || id === worn)) continue;
    groups.set(key, { itemId: id, name: def.name, rarity: def.rarity ?? 'common', icon: def.icon, usable: lookAllowed(def, slot, ch.classId), shown: id === current });
  }
  const list = [...groups.values()].sort((a, b) => (b.usable - a.usable) || (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) || a.name.localeCompare(b.name, 'de'));
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
      if (!ch.wardrobe.looks.includes(itemId)) return { ok: false, reason: 'locked' };
      if (slotOf(ctx.content.find('item', itemId)) !== slot) return { ok: false, reason: 'slot' };
      if (!lookAllowed(ctx.content.find('item', itemId), slot, ch.classId)) return { ok: false, reason: 'class' };
    }
    ch.wardrobe.shown = { ...ch.wardrobe.shown, [slot]: itemId };
    return { ok: true, slot, itemId };
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
      count: () => state.slices.character?.wardrobe?.looks?.length ?? 0,
    },
    // Vorschau im Panel: { slot: itemId|null|'none' } über die aktuelle Auswahl legen
    previewGear: (overrides = {}) => {
      const ch = state.slices.character ?? {};
      const w = ch.wardrobe ?? { looks: [], shown: {} };
      const shown = { ...w.shown, ...overrides };
      return resolveGear(shownEquipment({ inventory: state.slices.inventory, character: { ...ch, wardrobe: { ...w, shown } } }, content), content);
    },
  };
  return { isLookItem };
}
