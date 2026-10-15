// Werte eines Spielstands, die das Fortschrittsbuch bestätigt (src/ledger/README.md):
//   xp     Gesamterfahrung (progress.xp, mindestens die Erfahrung der Stufe: so lädt das Spiel den Stand)
//   gold   Gold in der Börse plus Gold in Beutebriefen (mail.loot)
//   items  Anzahl je Gegenstand über alle Behälter: Tasche, angelegte Ausrüstung, Materialbeutel, Questbeutel, Bank,
//          Beutebriefe. Questgegenstände zählen nicht (kein Wert, nicht verkäuflich, nicht handelbar). Gelernte Reittiere zählen als ihr Gegenstand (mount_<id>, siehe COUNTED_MOUNTS).
// Dieselbe Rechnung steht in SQL (public.ledger_values, erzeugt von src/ledger/ledgerSql.mjs); der Test vergleicht beide.
// Umräumen (Sortieren, Anlegen, Einlagern, Brief öffnen) ändert diese Werte nicht.
// Nur echte Zahlen zählen (wie in SQL); die Datenbank entfernt Mengen, die keine Zahl sind, vor dem Zählen
// (public.ledger_normalize), damit das Spiel beim Laden nie mehr sieht als das Buch.
//          Dazu Goldausgaben, die bleiben: Verstärkung je Platz (^up:<Platz>, Anzahl = Stufe), Verzauberung (^en:<Platz>:<id>)
//          und Bankausbau (^bank, Anzahl = Ausbaustufe). Sie kommen nur ins Buch, wenn der Preis bezahlt wurde.
import { ITEMS, EQUIP_SLOTS } from '../progression/items.js';
import { LEVEL_CAP, totalXpForLevel } from '../progression/xp.js';
import { UPGRADE_MAX, ENCHANTS } from '../progression/smithing.js';
import { BANK_SIZES } from '../progression/endgame.js';

// Gegenstände, die das Buch zählt (dieselbe Liste steht in SQL: public.ledger_items)
export const isCounted = (id) => typeof id === 'string' && Object.hasOwn(ITEMS, id) && ITEMS[id].type !== 'quest';
// Goldausgaben als Buchposten (dieselbe Liste steht in SQL in public.ledger_items)
export const upId = (slot) => `^up:${slot}`;
export const enId = (slot, id) => `^en:${slot}:${id}`;
export const BANK_ID = '^bank';
export const SINK_IDS = new Set([BANK_ID, ...EQUIP_SLOTS.map(upId),
  ...Object.entries(ENCHANTS).flatMap(([id, e]) => e.slots.filter((k) => EQUIP_SLOTS.includes(k)).map((k) => enId(k, id)))]);
export const isTracked = (id) => isCounted(id) || SINK_IDS.has(id);
const qtyOf = (q) => (typeof q === 'number' && q > 0 ? Math.floor(q) : 0);
const GOLD_MIN = -1e9; // wie wallet beim Laden (progression/logic.js)
// Stufe wie beim Laden; keine Zahl (nach ledger_normalize nicht möglich) zählt als Höchststufe
const levelOf = (l) => (l == null ? 1 : typeof l === 'number' ? Math.max(1, Math.min(LEVEL_CAP, Math.trunc(l))) : LEVEL_CAP);

// Reittiere, die als Gegenstand zählen: alle mit einem Reittier-Gegenstand (mount_<id>), auch legendäre. Lernen ist dann nur
// ein Umräumen, Einstellen im Auktionshaus ein Abgang. Nicht gezählt: Shop-Designs (prüft der Server über shop_entitlements)
// und Erfolgsbelohnungen ohne Gegenstand.
export const COUNTED_MOUNTS = Object.fromEntries(Object.entries(ITEMS)
  .filter(([id, d]) => d.type === 'mount' && d.mountId && id === `mount_${d.mountId}` && isCounted(id)).map(([id, d]) => [d.mountId, id]));

export function valuesOfSlices(sl) {
  const items = {};
  const add = (id, q) => { const n = qtyOf(q); if (n && isCounted(id)) items[id] = (items[id] ?? 0) + n; };
  const inv = sl?.inventory ?? {};
  for (const s of Array.isArray(inv.slots) ? inv.slots : []) if (s) add(s.itemId, s.qty);
  for (const e of Object.values(inv.equipment && typeof inv.equipment === 'object' ? inv.equipment : {})) {
    const id = typeof e === 'string' ? e : e?.itemId;
    if (id) add(id, 1);
  }
  for (const [id, n] of Object.entries(inv.mats && typeof inv.mats === 'object' ? inv.mats : {})) add(id, n);
  for (const e of Array.isArray(inv.questBag) ? inv.questBag : []) if (e) add(e.itemId, e.qty);
  for (const s of Array.isArray(sl?.bank?.slots) ? sl.bank.slots : []) if (s) add(s.itemId, s.qty);
  const w = sl?.wallet?.gold;
  let gold = typeof w === 'number' ? Math.max(GOLD_MIN, Math.floor(w)) : 0;
  for (const l of Array.isArray(sl?.mail?.loot) ? sl.mail.loot : []) {
    if (!l) continue;
    gold += qtyOf(l.gold);
    for (const it of Array.isArray(l.items) ? l.items : []) if (it) add(it.itemId, it.qty);
  }
  for (const m of new Set(Array.isArray(sl?.character?.mounts?.owned) ? sl.character.mounts.owned : [])) {
    const id = COUNTED_MOUNTS[m];
    if (id) items[id] = (items[id] ?? 0) + 1;
  }
  // Goldausgaben: Stufen nur als echte Zahl 0…UPGRADE_MAX, Verzauberung nur als Text (bereinigt ledger_normalize)
  const ups = inv.upgrades && typeof inv.upgrades === 'object' && !Array.isArray(inv.upgrades) ? inv.upgrades : {};
  const ens = inv.enchants && typeof inv.enchants === 'object' && !Array.isArray(inv.enchants) ? inv.enchants : {};
  for (const k of EQUIP_SLOTS) {
    const u = Object.hasOwn(ups, k) && typeof ups[k] === 'number' ? Math.max(0, Math.min(UPGRADE_MAX, Math.trunc(ups[k]))) : 0;
    if (u) items[upId(k)] = u;
    const en = Object.hasOwn(ens, k) && typeof ens[k] === 'string' ? enId(k, ens[k]) : null;
    if (en && SINK_IDS.has(en)) items[en] = 1;
  }
  const step = BANK_SIZES.indexOf(sl?.bank?.size);
  if (step > 0) items[BANK_ID] = step;
  const p = sl?.progress, x = p?.xp;
  const xp = Math.max(typeof x === 'number' && x > 0 ? Math.floor(x) : 0, totalXpForLevel(levelOf(p?.level)));
  return { xp, gold, items };
}

export const valuesOf = (snapshot) => valuesOfSlices(snapshot?.slices ?? {});

// Unterschied b − a (nur Einträge ungleich 0)
export function diffValues(a, b) {
  const items = {};
  for (const id of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) {
    const d = (b.items[id] ?? 0) - (a.items[id] ?? 0);
    if (d) items[id] = d;
  }
  return { xp: b.xp - a.xp, gold: b.gold - a.gold, items };
}
export const isZero = (d) => !d.xp && !d.gold && !Object.keys(d.items).length;
