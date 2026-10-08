// Startpaket neuer Charaktere (Thread A, Sicherheitsbericht D3 Punkt 3).
//
// Eine Quelle für Client und Server: progression/logic.js legt neue Spielstände daraus an, und
// src/character/startKitSql.mjs erzeugt daraus die Datenbankfunktion public.character_start_kit_problem(),
// die beim ersten Hochladen eines Charakters (INSERT) prüft, dass nichts außer dem Startpaket mitkommt.
// Reine Daten, ohne Imports: läuft im Browser, in Node und als Vorlage für SQL.
//
// Weil der erste Upload ein paar Sekunden nach dem Anlegen läuft, ist ein kleiner Spielraum erlaubt:
// Stufe ≤ 3 und Gold ≤ 5.000 (prüft der Trigger), Talentpunkte bis Stufe − 1, Beute und Quests
// aus dem Startgebiet. Reittiere, Schmiede, Verzauberungen und alles andere sind beim Anlegen ausgeschlossen.

// Tasche zu Beginn (Plätze 0, 1, …)
export const START_ITEMS = [{ itemId: 'minor_potion', qty: 5 }, { itemId: 'hearth_bread', qty: 3 }];

// Startausrüstung je Klasse (gewöhnlich), damit die Figur von Anfang an Waffe und Rüstung zeigt.
export const STARTER_GEAR = {
  warrior: { weapon: 'notched_blade', chest: 'recruit_mail' },
  rogue: { weapon: 'rusty_dagger', chest: 'padded_vest' },
  ranger: { weapon: 'short_bow', chest: 'padded_vest' },
  mage: { weapon: 'ashwood_staff', chest: 'novice_robe' },
};

// Was in den ersten Minuten in der Glutsenke dazukommen kann (Beute der Aschewölfe, Händler Stufe 1–3).
export const START_ZONE_ITEMS = [
  'notched_blade', 'iron_sword', 'woodcutter_axe', 'cudgel', 'rusty_dagger', 'wolfsbane_dagger', 'short_bow',
  'ashwood_staff', 'oak_wand', 'novice_robe', 'padded_vest', 'recruit_mail', 'leather_jerkin', 'worn_boots',
  'copper_ring', 'bone_amulet', 'minor_potion', 'minor_mana', 'hearth_bread', 'wolf_pelt', 'wolf_fang',
];
export const START_ZONE_QUESTS = ['q_ashen_wolves', 'q_bounty_emberhollow', 'q_glutfang', 'q_into_catacombs', 'q_spider_silk'];

// Beutevarianten (progression/items.js VARIANTS, Runde 08.10.): `<basis>_<variante>` zählt wie die Basis.
// Muss den Schlüsseln von VARIANTS entsprechen (startKitSql.mjs --test prüft das).
export const START_VARIANTS = ['bear', 'guard', 'fox', 'hawk', 'owl', 'ember'];

// Alle erlaubten Gegenstände eines frischen Charakters (Startzone, Startpaket, Startausrüstung, je mit Varianten).
export function startAllowedItems() {
  const base = [...START_ZONE_ITEMS, ...START_ITEMS.map((i) => i.itemId), ...Object.values(STARTER_GEAR).flatMap((g) => Object.values(g))];
  return [...new Set(base.flatMap((id) => [id, ...START_VARIANTS.map((v) => `${id}_${v}`)]))];
}

export const START_ACHIEVEMENTS = ['first_blood', 'first_quest'];
export const START_BANK_SIZE = 16;
export const START_MAX_LEVEL = 3;
export const START_MAX_GOLD = 5000;

const itemIdOf = (e) => (typeof e === 'string' ? e : isObj(e) && typeof e.itemId === 'string' ? e.itemId : null);

// Prüft einen Spielstand (wie er hochgeladen wird: { slices, meta }) gegen das Startpaket.
// -> null (in Ordnung) oder Grund: 'format'|'klasse'|'stufe'|'gold'|'reittier'|'talente'|'quest'|'gegenstand'|'ausruestung'|'schmiede'
//    |'bank'|'boss'|'pruefung'|'erfolg'|'auftrag'
// Muss dieselben Regeln haben wie public.character_start_kit_problem (startKitSql.mjs prüft das gegen Postgres).
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const notObj = (v) => v != null && !isObj(v);
const truthy = (v) => v != null && v !== false && v !== 0 && v !== '';

export function startKitProblem(snapshot, classId = null) {
  const s = snapshot?.slices;
  if (!isObj(s)) return 'format';
  const ch = s.character, inv = s.inventory ?? {};
  if ([ch, s.progress, s.wallet, s.quests, s.inventory, s.bank, s.world, s.trials, s.achievements, s.board].some(notObj)) return 'format';
  const level = s.progress?.level ?? 1, gold = s.wallet?.gold ?? 0;
  if (typeof level !== 'number' || typeof gold !== 'number') return 'format';
  const cls = ch?.classId;
  if (typeof cls !== 'string' || !Object.hasOwn(STARTER_GEAR, cls) || (classId != null && classId !== cls)) return 'klasse';
  if (!Number.isInteger(level) || level < 1 || level > START_MAX_LEVEL) return 'stufe';
  if (gold > START_MAX_GOLD) return 'gold';
  const mounts = ch.mounts ?? {}, owned = mounts.owned;
  if (notObj(mounts) || (owned != null && !(Array.isArray(owned) && owned.length === 0)) || truthy(mounts.active) || truthy(mounts.riding)) return 'reittier';
  const talents = ch.talents ?? {};
  if (notObj(talents)) return 'talente';
  let ranks = 0;
  for (const v of Object.values(talents)) {
    if (!Number.isInteger(v) || v < 0) return 'talente';
    ranks += v;
  }
  if (ranks > level - 1) return 'talente';
  const done = s.quests?.completed ?? [];
  if (!Array.isArray(done) || done.some((q) => !START_ZONE_QUESTS.includes(q))) return 'quest';
  const allowed = new Set(startAllowedItems());
  const bad = (e) => e != null && !allowed.has(itemIdOf(e));
  const slots = inv.slots ?? [], bag = inv.questBag ?? [], eq = inv.equipment ?? {}, mats = inv.mats ?? {};
  if (!Array.isArray(slots) || !Array.isArray(bag) || slots.some(bad) || bag.some(bad)) return 'gegenstand';
  // Materialbeutel { itemId: Anzahl } (Runde 08.10.)
  if (notObj(mats) || Object.entries(mats).some(([id, n]) => !allowed.has(id) || !Number.isInteger(n) || n < 0)) return 'gegenstand';
  if (notObj(eq) || Object.values(eq).some(bad)) return 'ausruestung';
  const up = inv.upgrades ?? {}, en = inv.enchants ?? {};
  if (notObj(up) || notObj(en) || Object.values(up).some(truthy) || Object.values(en).some(truthy)) return 'schmiede';
  const bank = s.bank ?? {}, bslots = bank.slots ?? [];
  if ((bank.size ?? START_BANK_SIZE) !== START_BANK_SIZE || !Array.isArray(bslots) || bslots.some(bad)) return 'bank';
  const bosses = s.world?.bossesDefeated ?? [];
  if (!Array.isArray(bosses) || bosses.length) return 'boss';
  const t = s.trials ?? {};
  if (truthy(t.best) || truthy(t.runs) || truthy(t.run) || (t.cleared != null && !(isObj(t.cleared) && !Object.keys(t.cleared).length))) return 'pruefung';
  const ach = s.achievements ?? {}, unl = ach.unlocked ?? {};
  if (notObj(unl) || Object.keys(unl).some((k) => !START_ACHIEVEMENTS.includes(k)) || truthy(ach.title)) return 'erfolg';
  // Auftragsbrett: angenommen darf schon sein, erledigt oder Wochenbelohnung noch nicht
  const bd = s.board ?? {}, bdone = bd.done ?? [];
  if (!Array.isArray(bdone) || bdone.length || truthy(bd.weekDone) || truthy(bd.weekClaimed) || notObj(bd.taken)) return 'auftrag';
  return null;
}
