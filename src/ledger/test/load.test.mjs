// Vergleichstest: Was das Spiel beim Laden aus einem Spielstand macht, darf nie mehr sein, als die Datenbank zählt
// (public.ledger_values nach public.ledger_normalize). Spielstände mit allen Formen, die ein Browser hochladen könnte:
// Text statt Zahl, Listen statt Text, 32-Bit-Überlauf (das Spiel rechnet mit |0), negative Werte, Prototyp-Schlüssel.
//   PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/ledger/test/load.test.mjs   (Datenbank wie db.test.mjs)
// Das Spiel wird mit dem echten Laden der Progression (Tasche, Ausrüstung, Material, Questbeutel, Bank, Börse, Stufe,
// Verstärkung, Verzauberung) geprüft. Gezählt wird nachsichtig (jede Form, die als Schlüssel oder Zahl wirkt, zählt).
import pg from 'pg';
import { ITEMS, EQUIP_SLOTS } from '../../progression/items.js';
import { totalXpForLevel, LEVEL_CAP } from '../../progression/xp.js';
import { ENCHANTS } from '../../progression/smithing.js';
import { BANK_SIZES } from '../../progression/endgame.js';
import { isCounted, upId, enId, BANK_ID, SINK_IDS } from '../values.js';
import { makeGame } from './harness.mjs';

const pool = new pg.Pool({ host: process.env.PGHOST ?? '/var/run/postgresql', port: +(process.env.PGPORT ?? 5432), user: 'postgres', database: process.env.PGDATABASE ?? 'sbtest' });
const N = +(process.env.N ?? 1500);

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const ids = Object.keys(ITEMS).filter(isCounted);
const MATS = ids.filter((id) => ITEMS[id].type === 'material');
const GEAR = ids.filter((id) => ITEMS[id].slot);
const pick = (r, l) => l[Math.floor(r() * l.length)];
const W = 4294967296;

// Zahl in allen Formen (bei Werten, die das Spiel mit |0, Number() oder > 0 liest)
const num = (r, v) => pick(r, [v, v, v, `${v}`, [v], v + W, v - W, -W + v, 2 ** 31 + v, v + 0.7, -v, true, null, {}, `${v}x`]);
const idOf = (r, id) => pick(r, [id, id, id, [id], [[id]], { itemId: id }, 5, '__proto__', 'constructor', 'toString', `${id} `]);

function randomRaw(r) {
  const level = 1 + Math.floor(r() * LEVEL_CAP);
  const slot = () => (r() < 0.4 ? null : { itemId: idOf(r, pick(r, ids)), qty: num(r, 1 + Math.floor(r() * 5)), ...(r() < 0.1 ? { n: true } : {}) });
  const inv = {
    slots: Array.from({ length: 36 + (r() < 0.2 ? 6 : 0) }, slot),
    equipment: Object.fromEntries([...EQUIP_SLOTS, 'armor', 'trinket', 'legs'].filter(() => r() < 0.6).map((k) => [k, idOf(r, pick(r, GEAR))])),
    mats: Object.fromEntries(Array.from({ length: 4 }, () => [pick(r, MATS), num(r, Math.floor(r() * 200))])),
    questBag: Array.from({ length: 3 }, () => ({ itemId: idOf(r, pick(r, ids)), qty: num(r, 1 + Math.floor(r() * 3)) })),
    upgrades: Object.fromEntries(EQUIP_SLOTS.filter(() => r() < 0.5).map((k) => [k, num(r, Math.floor(r() * 16))])),
    enchants: Object.fromEntries(EQUIP_SLOTS.filter(() => r() < 0.5).map((k) => {
      const e = pick(r, Object.keys(ENCHANTS));
      return [k, pick(r, [e, e, [e], [[e]], { id: e }, 5, true])];
    })),
  };
  if (r() < 0.1) inv.equipment = Object.values(inv.equipment); // alte Form: Liste
  if (r() < 0.05) inv.mats = Object.keys(inv.mats);
  const bankSize = pick(r, [...BANK_SIZES, '48', [48], 48.0, 20, 64, null]);
  const bank = { size: bankSize, slots: Array.from({ length: 48 }, slot) };
  const snap = {
    meta: { accountId: 'a', characterId: 'c', createdAt: 1, savedAt: 1, playTime: 3600, version: 1 },
    slices: {
      character: { name: 'Held', classId: 'warrior', mounts: { owned: [], active: null, riding: false } },
      progress: { level: num(r, level), xp: num(r, Math.floor(r() * 3e6)) },
      wallet: { gold: num(r, Math.floor(r() * 50000)) },
      inventory: inv, bank, mail: { loot: [] },
    },
  };
  // Fehlende Bereiche: das Spiel legt sie neu an (Tasche mit Startausrüstung)
  const x = r();
  if (x < 0.03) snap.slices.inventory = null;
  else if (x < 0.06) delete snap.slices.inventory;
  else if (x < 0.08) delete snap.slices;
  return snap;
}

// Nachsichtig zählen, was das Spiel nach dem Laden hat: Schlüssel wie beim Property-Zugriff (String()), Mengen wie Number()
function gameCount(sl) {
  const items = {};
  const add = (id, q) => {
    const key = String(id), n = Math.floor(Number(q));
    if (isCounted(key) && n > 0) items[key] = (items[key] ?? 0) + n;
  };
  const inv = sl.inventory;
  for (const s of inv.slots ?? []) if (s) add(s.itemId, s.qty);
  for (const v of Object.values(inv.equipment ?? {})) if (v != null) add(typeof v === 'object' && !Array.isArray(v) ? v.itemId : v, 1);
  for (const [id, n] of Object.entries(inv.mats ?? {})) add(id, n);
  for (const e of inv.questBag ?? []) if (e) add(e.itemId, e.qty);
  for (const s of sl.bank.slots ?? []) if (s) add(s.itemId, s.qty);
  for (const k of EQUIP_SLOTS) {
    const u = Math.floor(Number(inv.upgrades?.[k]));
    if (u > 0) items[upId(k)] = u;
    const e = inv.enchants?.[k];
    if (e != null && SINK_IDS.has(enId(k, String(e)))) items[enId(k, String(e))] = 1;
  }
  const step = BANK_SIZES.indexOf(sl.bank.size); // Spiel prüft die Größe streng (includes)
  if (step > 0) items[BANK_ID] = step;
  const lvl = Number(sl.progress.level);
  const xp = Math.max(Number(sl.progress.xp), totalXpForLevel(Math.max(1, Math.min(LEVEL_CAP, lvl | 0))));
  return { xp, gold: Number(sl.wallet.gold), items };
}

const { state } = makeGame({ session: false });
const r = rng(20261015);
let bad = 0, threw = 0;
const seen = new Set();
for (let i = 0; i < N; i++) {
  const raw = randomRaw(r);
  // Die Datenbank speichert den bereinigten Stand; den lädt das Spiel
  const { rows: [row] } = await pool.query('select public.ledger_normalize($1) as n, public.ledger_values(public.ledger_normalize($1)) as v', [raw]);
  try { state.load(row.n); } catch { threw++; continue; } // lädt nicht: nichts zu gewinnen
  const g = gameCount(state.slices);
  const s = row.v;
  const over = [];
  if (g.xp > Number(s.xp)) over.push(['xp', g.xp, s.xp]);
  if (g.gold > Number(s.gold)) over.push(['gold', g.gold, s.gold]);
  for (const [id, n] of Object.entries(g.items)) if (n > Number(s.items[id] ?? 0)) over.push([id, n, s.items[id] ?? 0]);
  if (over.length) {
    bad++;
    const key = over.map((o) => o[0].replace(/^(\^[a-z]+).*/, '$1').replace(/^[a-z].*/, (x) => (x === 'xp' || x === 'gold' ? x : 'item'))).join(',');
    if (!seen.has(key)) { seen.add(key); console.log('✗ Spiel lädt mehr als die Datenbank zählt:', JSON.stringify(over.slice(0, 3))); }
  }
}
await pool.end();
console.log(bad ? `✗ ${bad} von ${N} Spielständen laden mehr, als gezählt wird` : `✓ ${N} Spielstände: das Spiel lädt nie mehr, als die Datenbank zählt (${threw} laden nicht)`);
process.exit(bad ? 1 : 0);
