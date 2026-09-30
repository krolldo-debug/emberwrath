// Speicherplätze je Charakter (Thread A), zusätzlich zum laufenden Spielstand im SaveStore.
// Lokal im selben Speicher wie der SaveStore (localStorage bzw. Speicher im privaten Fenster).
//
// Schlüssel: emberfall:v1:slots:<accountId>:<characterId> -> { auto: rec|null, slots: [rec|null, rec|null, rec|null] }
//   rec = { at, snap }  snap = gespeicherter Datensatz aus SaveStore.loadCharacter (inkl. summary)
// - auto: wird vor jedem Spielstart aus der Charakterliste angelegt (Stand vor dieser Sitzung)
// - slots: drei Plätze, die der Spieler selbst belegt und wieder lädt
// Laden schreibt den Platz als aktuellen Spielstand zurück (SaveStore.saveCharacter).
const PREFIX = 'emberfall:v1:slots:';
export const SLOT_COUNT = 3;

const key = (acc, chr) => `${PREFIX}${acc}:${chr}`;
const empty = () => ({ auto: null, slots: Array(SLOT_COUNT).fill(null) });

function read(save, acc, chr) {
  try {
    const raw = save.storage.getItem(key(acc, chr));
    const d = raw ? JSON.parse(raw) : empty();
    d.slots = Array.from({ length: SLOT_COUNT }, (_, i) => d.slots?.[i] ?? null);
    return d;
  } catch { return empty(); }
}
function write(save, acc, chr, d) {
  try { save.storage.setItem(key(acc, chr), JSON.stringify(d)); return true; } catch { return false; }
}

export function listSlots(save, acc, chr) { return read(save, acc, chr); }

// Aktuellen Spielstand in einen Platz kopieren (index 0..2 oder 'auto')
export function storeSlot(save, acc, chr, index) {
  const snap = save.loadCharacter(acc, chr);
  if (!snap) return false;
  const d = read(save, acc, chr);
  const rec = { at: Date.now(), snap };
  if (index === 'auto') d.auto = rec; else d.slots[index] = rec;
  return write(save, acc, chr, d);
}

// Platz als aktuellen Spielstand übernehmen
export function restoreSlot(save, acc, chr, index) {
  const d = read(save, acc, chr);
  const rec = index === 'auto' ? d.auto : d.slots[index];
  if (!rec?.snap) return false;
  const { summary, ...snap } = rec.snap;
  return save.saveCharacter(acc, chr, snap, summary);
}

export function clearSlot(save, acc, chr, index) {
  const d = read(save, acc, chr);
  if (index === 'auto') d.auto = null; else d.slots[index] = null;
  return write(save, acc, chr, d);
}

// Beim Löschen eines Charakters mit aufräumen
export function dropSlots(save, acc, chr) {
  try { save.storage.removeItem(key(acc, chr)); } catch { /* egal */ }
}

// Kurzinfo eines Spielstands für Listen: Stufe, Titel, Spielzeit, Zone, Gold
export function snapInfo(snap, content) {
  const s = snap?.slices ?? {};
  const titleId = s.achievements?.title;
  return {
    level: s.progress?.level ?? snap?.summary?.level ?? 1,
    title: titleId ? content.find('achievement', titleId)?.title ?? null : null,
    playTime: snap?.meta?.playTime ?? 0,
    zoneId: s.world?.zoneId ?? snap?.summary?.zoneId ?? null,
    gold: s.wallet?.gold ?? 0,
    savedAt: snap?.meta?.savedAt ?? 0,
  };
}

export function formatPlayTime(sec) {
  const m = Math.floor((sec ?? 0) / 60);
  if (m < 1) return 'unter 1 Min.';
  if (m < 60) return `${m} Min.`;
  const hh = Math.floor(m / 60);
  return `${hh} Std. ${m % 60} Min.`;
}
