// Datenbanktest des Fortschrittsbuchs gegen eine echte Postgres 16 (Supabase-Nachbau supabase-stub.sql, alle Migrationen).
//   createdb sbtest; psql -d sbtest -f src/ledger/test/supabase-stub.sql; danach alle supabase/migrations/*.sql der Reihe nach
//   PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/ledger/test/db.test.mjs   (braucht das npm-Paket pg)
// Prüft: SQL-Zählung = values.js, Übergang (Stand wird Buch), Kappen über dem Buch (Gold, Gegenstände in allen Behältern,
// Reittiere, Erfahrung/Stufe, Beutebriefe), Bereinigen von Text-Mengen, Zeitstempel ändert sich nur beim Kappen,
// Spiegeln von Server-Buchungen (Auktionshaus market_commit, Admin), Ende des Übergangs, Notbremse, Rechte.
import pg from 'pg';
import { ITEMS } from '../../progression/items.js';
import { valuesOf, COUNTED_MOUNTS, isTracked } from '../values.js';
import { ENCHANTS } from '../../progression/smithing.js';
import { totalXpForLevel } from '../../progression/xp.js';

const pool = new pg.Pool({ host: process.env.PGHOST ?? '/var/run/postgresql', port: +(process.env.PGPORT ?? 5432), user: 'postgres', database: process.env.PGDATABASE ?? 'sbtest' });
let fails = 0;
const ok = (c, m, extra) => { console.log(c ? '✓' : '✗', m); if (!c) { fails++; if (extra !== undefined) console.log('   ', JSON.stringify(extra)); } };
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  return v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
}

async function asUser(uid, sql, args = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    const r = await c.query(sql, args);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
// Hochladen wie CloudSync (PostgREST-Upsert mit merge-duplicates) → gespeicherte Zeile oder null (abgelehnt)
// Spielzeit wächst je Upload um eine Stunde, letzter Upload liegt einen Tag zurück (characters_plausible lässt Stufen zu)
let PT = 3600;
const colLevel = (l) => (Number.isInteger(l) && Math.abs(l) < 2 ** 31 ? l : 1); // Spalte level ist int
async function upload(uid, id, snap, at = new Date()) {
  snap.meta.playTime = (PT += 3600);
  const c = await pool.connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query("update public.characters set updated_at = now() - interval '1 day' where user_id = $1 and id = $2", [uid, id]);
  } finally { await c.query("set session_replication_role = origin"); c.release(); }
  const r = await asUser(uid, `insert into public.characters (user_id, id, name, race_id, class_id, level, zone_id, snapshot, saved_at)
    values ($1, $2, 'Held', 'human', 'warrior', $3, null, $4, $5)
    on conflict (user_id, id) do update set name = excluded.name, race_id = excluded.race_id, class_id = excluded.class_id,
      level = excluded.level, zone_id = excluded.zone_id, snapshot = excluded.snapshot, saved_at = excluded.saved_at
    returning id, saved_at, level, snapshot`, [uid, id, colLevel(snap.slices.progress?.level), snap, at]);
  return r.rows[0] ?? null;
}
const book = async (uid, id) => (await pool.query('select xp, gold, items, state, ver from public.character_ledger where user_id = $1 and character_id = $2', [uid, id])).rows[0];
const stored = async (uid, id) => (await pool.query('select snapshot, saved_at, level from public.characters where user_id = $1 and id = $2', [uid, id])).rows[0];
const sqlValues = async (snap) => (await pool.query('select public.ledger_values($1) as v', [snap])).rows[0].v;
const flags = async (uid, reason) => (await pool.query('select detail from public.character_flags where user_id = $1 and reason = $2 order by created_at', [uid, reason])).rows;
const clone = (x) => structuredClone(x);

// ---------------------------------------------------------------- Spielstände
const ids = Object.keys(ITEMS);
const pick = (r, list) => list[Math.floor(r() * list.length)];
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const MOUNT_IDS = [...Object.keys(COUNTED_MOUNTS), 'phoenix_wing', 'starsteed', 'unbekannt'];
const QUEST = ids.filter((id) => ITEMS[id].type === 'quest');
const GEAR = ids.filter((id) => ITEMS[id].slot);
const MATS = ids.filter((id) => ITEMS[id].type === 'material');

function base({ level = 10, xp = totalXpForLevel(10) + 50, gold = 1000 } = {}) {
  return {
    meta: { accountId: 'a', characterId: 'c', createdAt: 1, savedAt: 1, playTime: 3600, version: 1 },
    slices: {
      character: { name: 'Held', raceId: 'human', classId: 'warrior', mounts: { owned: [], active: null, riding: false } },
      progress: { level, xp }, wallet: { gold },
      inventory: { slots: Array(36).fill(null), equipment: { weapon: 'notched_blade', chest: null }, mats: {}, questBag: [] },
      bank: { size: 16, slots: Array(16).fill(null) }, mail: { loot: [] },
    },
  };
}
function randomSnap(r) {
  const s = base({ level: 1 + Math.floor(r() * 40), gold: Math.floor(r() * 200000) - (r() < 0.1 ? 5000 : 0) });
  s.slices.progress.xp = r() < 0.2 ? 0 : Math.floor(r() * 2e6); // auch unter der Stufe (Spiel hebt auf die Stufe an)
  const inv = s.slices.inventory;
  for (let i = 0; i < 36; i++) if (r() < 0.5) inv.slots[i] = { itemId: pick(r, ids), qty: 1 + Math.floor(r() * 20), ...(r() < 0.1 ? { n: true } : {}) };
  inv.slots[3] = { itemId: 'gibt_es_nicht', qty: 4 };
  inv.slots[4] = { itemId: pick(r, ids), qty: 0 };
  inv.slots[5] = { itemId: pick(r, ids), qty: -3 };
  for (const k of ['weapon', 'head', 'chest', 'legs', 'boots', 'ring', 'amulet', 'trinket']) if (r() < 0.6) inv.equipment[k] = r() < 0.2 ? { itemId: pick(r, GEAR) } : pick(r, GEAR);
  for (let i = 0; i < 6; i++) inv.mats[pick(r, MATS)] = Math.floor(r() * 300);
  for (let i = 0; i < 3; i++) inv.questBag.push({ itemId: r() < 0.7 ? pick(r, QUEST) : pick(r, ids), qty: 1 + Math.floor(r() * 3) });
  for (let i = 0; i < 16; i++) if (r() < 0.4) s.slices.bank.slots[i] = { itemId: pick(r, ids), qty: 1 + Math.floor(r() * 50) };
  for (let i = 0; i < 4; i++) s.slices.mail.loot.push({ id: `l${i}`, at: Date.now(), boss: 'x', zoneId: 'z', gold: Math.floor(r() * 3000), items: [{ itemId: pick(r, ids), qty: 1 + Math.floor(r() * 3) }] });
  const owned = []; for (let i = 0; i < 4; i++) owned.push(pick(r, MOUNT_IDS));
  owned.push(owned[0]); // doppelt
  s.slices.character.mounts = { owned, active: owned[0], riding: true };
  const EN = Object.keys(ENCHANTS);
  inv.upgrades = Object.fromEntries(['weapon', 'head', 'ring', 'legs'].filter(() => r() < 0.6).map((k) => [k, pick(r, [3, 15, 22, -2, 4.6, 0])]));
  inv.enchants = Object.fromEntries(['weapon', 'chest', 'ring', 'amulet'].filter(() => r() < 0.6).map((k) => [k, pick(r, [...EN, 'unbekannt', null])]));
  s.slices.bank.size = pick(r, [16, 24, 32, 40, 48, 20]);
  return s;
}

// ---------------------------------------------------------------- Ausgangslage
await pool.query("delete from public.character_flags; delete from auth.users where email like '%@buch.test'");
await pool.query('update public.ledger_config set strict_after = null, enforce = true where id = 1');
const users = {};
for (const n of ['a', 'b', 'c', 'd']) users[n] = (await pool.query('insert into auth.users (email) values ($1) returning id', [`${n}@buch.test`])).rows[0].id;
const { a: A, b: B, c: C, d: D } = users;

// ---------------------------------------------------------------- 1. Zählung SQL = values.js
{
  const r = rng(7);
  let bad = 0, first = null;
  for (let i = 0; i < 300; i++) {
    const s = randomSnap(r);
    const js = valuesOf(s), sq = await sqlValues(s);
    if (!same({ xp: js.xp, gold: js.gold, items: js.items }, { xp: Number(sq.xp), gold: Number(sq.gold), items: sq.items })) { bad++; first ??= { js, sq }; }
  }
  ok(bad === 0, `Zählung in SQL und im Spiel gleich (300 zufällige Spielstände${bad ? `, ${bad} abweichend` : ''})`, first);
  const odd = base();
  odd.slices.inventory.equipment = ['notched_blade', { itemId: 'recruit_mail' }, 5, null];
  odd.slices.inventory.mats = ['ember_core'];
  odd.slices.progress = { level: 39.7, xp: -5 };
  odd.slices.wallet.gold = -5e9;
  odd.slices.character.mounts.owned = [Object.keys(COUNTED_MOUNTS)[0], 7, null];
  const js = valuesOf(odd), sq = await sqlValues(odd);
  ok(same(js, { xp: Number(sq.xp), gold: Number(sq.gold), items: sq.items }), 'Zählung auch bei alten Formen gleich (Ausrüstung als Liste, Kommastufe, Börse im Minus)', { js, sq });
  ok(!Object.keys(sq.items).some((id) => !isTracked(id)), 'Questgegenstände und Unbekanntes zählen nicht');
}

// ---------------------------------------------------------------- 2. Neuer Charakter, Übergang
const kit = () => {
  const s = base({ level: 1, xp: 0, gold: 0 });
  s.slices.inventory.slots[0] = { itemId: 'minor_potion', qty: 5 };
  s.slices.inventory.slots[1] = { itemId: 'hearth_bread', qty: 3 };
  s.slices.inventory.equipment = { weapon: 'notched_blade', chest: 'recruit_mail' };
  return s;
};
{
  const row = await upload(A, 'held', kit());
  ok(!!row, 'Neuer Charakter (Startpaket) wird gespeichert');
  const b = await book(A, 'held');
  ok(b && Number(b.gold) === 0 && b.items.minor_potion === 5 && b.state === null, 'Buch beginnt mit dem ersten Stand', b);
  // Übergang: noch keine Sitzung → hochgeladener Stand wird Buch
  const s = kit(); s.slices.wallet.gold = 800; s.slices.inventory.slots[2] = { itemId: 'wolf_pelt', qty: 4 };
  const at = new Date(Date.now() - 1000);
  const r2 = await upload(A, 'held', s, at);
  ok(r2 && +r2.saved_at === +at, 'Übergang: Stand wird unverändert gespeichert');
  const b2 = await book(A, 'held');
  ok(Number(b2.gold) === 800 && b2.items.wolf_pelt === 4, 'Übergang: Buch übernimmt den Stand', b2);
}

// ---------------------------------------------------------------- 3. Sitzung beginnt → Buch gilt
let SNAP;
{
  await pool.query(`update public.character_ledger set state = '{"v":1,"sessions":{}}' where user_id = $1 and character_id = 'held'`, [A]);
  const cfg = (await pool.query('select strict_after from public.ledger_config where id = 1')).rows[0];
  ok(cfg.strict_after && cfg.strict_after > new Date(Date.now() + 47 * 3600e3), 'Erste Sitzung startet die Frist (2 Tage)', cfg);
  // Worker bucht: Stufe 5, 2000 Gold, 2 Wolfsfelle mehr
  await pool.query(`update public.character_ledger set xp = $2, gold = 2000, items = items || '{"wolf_pelt": 6}', ver = ver + 1 where user_id = $1 and character_id = 'held'`, [A, totalXpForLevel(5) + 10]);
  SNAP = kit();
  SNAP.slices.progress = { level: 5, xp: totalXpForLevel(5) + 10 };
  SNAP.slices.wallet.gold = 2000;
  SNAP.slices.inventory.slots[2] = { itemId: 'wolf_pelt', qty: 6 };
  const at = new Date(Date.now() - 500);
  const r = await upload(A, 'held', SNAP, at);
  ok(r && +r.saved_at === +at && same(r.snapshot, SNAP), 'Stand im Rahmen des Buchs: unverändert gespeichert', r && { got: r.snapshot, want: SNAP });
}

// ---------------------------------------------------------------- 4. Kappen
{
  const s = clone(SNAP);
  s.slices.progress = { level: 9, xp: totalXpForLevel(9) + 5 };      // Erfahrung zu hoch
  s.slices.wallet.gold = 1500;                                        // Gold: 1500 + 1200 in Briefen = 2700 > 2000
  s.slices.mail.loot = [{ id: 'l1', at: Date.now(), boss: 'x', zoneId: 'z', gold: 1200, items: [{ itemId: 'wolf_pelt', qty: 2 }] }];
  s.slices.inventory.slots[7] = { itemId: 'wolf_pelt', qty: 3 };     // Wolfsfell: 6 + 3 + 2 + 4 = 15 > 6
  s.slices.bank.slots[0] = { itemId: 'wolf_pelt', qty: 4 };
  s.slices.inventory.slots[8] = { itemId: 'ember_blade', qty: 1 };   // nie bekommen
  s.slices.inventory.equipment.head = 'ember_blade';
  s.slices.inventory.mats = { ember_core: 40 };
  const mount = Object.keys(COUNTED_MOUNTS)[0];
  s.slices.character.mounts = { owned: [mount, 'golden_stag'], active: mount, riding: true };
  const ench = Object.keys(ENCHANTS).find((k) => ENCHANTS[k].slots.includes('weapon'));
  s.slices.inventory.upgrades = { weapon: 7 };                        // Schmiede nie bezahlt
  s.slices.inventory.enchants = { weapon: ench };
  s.slices.bank.size = 48;
  const at = new Date(Date.now() - 400);
  const r = await upload(A, 'held', s, at);
  ok(!!r && +r.saved_at !== +at, 'Über dem Buch: gespeichert, aber mit neuem Zeitstempel (Spiel übernimmt den Cloud-Stand)');
  const v = await sqlValues(r.snapshot), b = await book(A, 'held');
  ok(Number(v.xp) <= Number(b.xp) && Number(v.gold) <= Number(b.gold) && Object.entries(v.items).every(([id, n]) => n <= (b.items[id] ?? 0)), 'Gekappter Stand liegt im Buch', { v, b });
  const sl = r.snapshot.slices;
  ok(sl.progress.level === 5 && r.level === 5, 'Stufe passt zur Erfahrung des Buchs (auch Spalte level)', sl.progress);
  ok(sl.wallet.gold === 800 && sl.mail.loot[0].gold === 1200, 'Gold: zuerst aus der Börse genommen', { w: sl.wallet.gold, l: sl.mail.loot[0].gold });
  ok(v.items.wolf_pelt === 6 && !sl.inventory.slots[2] && !sl.inventory.slots[7] && sl.bank.slots[0]?.qty === 4 && sl.mail.loot[0].items[0]?.qty === 2, 'Gegenstände zuerst aus der Tasche (von hinten), dann Bank und Briefe', { bag: sl.inventory.slots.slice(0, 9), bank: sl.bank.slots[0], mail: sl.mail.loot[0] });
  ok(!sl.inventory.slots[8] && sl.inventory.equipment.head === null && !sl.inventory.mats.ember_core, 'Nie verdientes aus Tasche, Ausrüstung und Materialbeutel entfernt');
  ok(!sl.character.mounts.owned.includes(mount) && sl.character.mounts.owned.includes('golden_stag') && sl.character.mounts.active === 'golden_stag' && sl.character.mounts.riding === false, 'Nicht verdientes Reittier vergessen, Reittier ohne Gegenstand bleibt', sl.character.mounts);
  ok(sl.inventory.upgrades.weapon === 0 && !sl.inventory.enchants.weapon && sl.bank.size === 16, 'Nicht bezahlte Verstärkung, Verzauberung und Bankausbau zurückgesetzt', { u: sl.inventory.upgrades, e: sl.inventory.enchants, b: sl.bank.size });
  const f = await flags(A, 'buch');
  ok(f.length === 1 && f[0].detail.items?.wolf_pelt === 9 && f[0].detail.gold, 'Vermerk »buch« mit Einzelheiten', f);
  ok(r.snapshot.meta.savedAt === +r.saved_at, 'meta.savedAt passt zum neuen Zeitstempel');
}

// ---------------------------------------------------------------- 5. Bereinigen (Text statt Zahl)
{
  const s = clone(SNAP);
  s.slices.bank.slots[2] = { itemId: 'wolf_pelt', qty: '6' };        // Text: das Spiel läse 6, gezählt würde 0 (Tasche prüft schon characters_shop_check)
  s.slices.inventory.slots[0] = { itemId: 'minor_potion', qty: 5.9 };
  s.slices.inventory.mats = { ember_core: '50' };
  s.slices.inventory.questBag = [{ itemId: 'ember_blade', qty: '3' }];
  s.slices.progress.xp = '9999999';
  const r = await upload(A, 'held', s);
  const sl = r?.snapshot?.slices;
  ok(sl && sl.bank.slots[2] === null && sl.inventory.slots[0].qty === 5 && !('ember_core' in sl.inventory.mats) && sl.inventory.questBag.length === 0, 'Mengen als Text entfernt, Kommazahlen abgeschnitten', sl?.inventory ?? (await pool.query('select reason, detail from public.character_flags order by created_at desc limit 2')).rows);
  ok(sl && sl.progress.xp === 0 && sl.progress.level === 5, 'Erfahrung als Text wird 0 (das Spiel hebt auf die Stufe an)', sl?.progress);
}
{
  // Formen, die das Spiel anders liest als die Datenbank: 32-Bit-Überlauf (|0), Listen als Schlüssel oder Zahl
  const s = clone(SNAP);
  s.slices.wallet.gold = -4294967296 + 5000;                         // |0 → 5000
  s.slices.progress.level = -4294967296 + 40;                        // |0 → 40
  s.slices.inventory.slots[9] = { itemId: ['ember_blade'], qty: 1 };  // ITEMS[['ember_blade']] wirkt wie 'ember_blade'
  s.slices.inventory.equipment.ring = ['ember_blade'];
  s.slices.inventory.upgrades = { weapon: '15', chest: [3] };
  s.slices.inventory.enchants = { weapon: [Object.keys(ENCHANTS)[0]] };
  // Andere Prüfungen (characters_shop_check, characters_plausible) weisen manche Formen schon ab; bereinigt wird trotzdem
  const sl = (await pool.query('select public.ledger_normalize($1) as n', [s])).rows[0].n.slices;
  ok(sl && sl.wallet.gold === -1e9 && sl.progress.level === 1, 'Gold und Stufe außerhalb des Bereichs auf den Rand gesetzt', sl && { g: sl.wallet.gold, p: sl.progress });
  ok(sl && sl.inventory.slots[9] === null && sl.inventory.equipment.ring === null, 'Gegenstände mit Liste statt Text entfernt', sl && { slot: sl.inventory.slots[9], ring: sl.inventory.equipment.ring });
  ok(sl && same(sl.inventory.upgrades, {}) && same(sl.inventory.enchants, {}), 'Verstärkung als Text oder Liste, Verzauberung als Liste entfernt', sl?.inventory);
  // Zahl mit mehr Stellen, als JavaScript kennt (das Spiel liest 48), und fehlende Tasche (das Spiel gäbe die Startausrüstung)
  const raw = JSON.stringify(SNAP).replace('"size":16', '"size":48.00000000000000000001');
  const n2 = (await pool.query('select public.ledger_normalize($1::jsonb) as n', [raw])).rows[0].n;
  ok(n2.slices.bank.size === 16, 'Bankgröße zwischen den Stufen wird 16', n2.slices.bank.size);
  const n3 = (await pool.query(`select public.ledger_normalize('{"meta": {}}'::jsonb) as n`)).rows[0].n;
  ok(Array.isArray(n3.slices?.inventory?.slots), 'Fehlende Tasche wird leer eingesetzt', n3);
}
await upload(A, 'held', SNAP); // zurück auf den gültigen Stand

// ---------------------------------------------------------------- 6. Server-Buchungen spiegeln
{
  const b0 = await book(A, 'held');
  // Auktionshaus: Wolfsfell eingestellt (−2), 300 Gold Erlös abgeholt
  const s = clone(SNAP);
  s.slices.inventory.slots[2] = { itemId: 'wolf_pelt', qty: 4 };
  s.slices.wallet.gold = 2300;
  await pool.query('select public.market_commit($1, $2, $3, 0)', [A, 'held', s]);
  const b1 = await book(A, 'held');
  ok(Number(b1.gold) === Number(b0.gold) + 300 && b1.items.wolf_pelt === 4 && Number(b1.ver) === Number(b0.ver) + 1, 'Auktionshaus (market_commit) wird ins Buch gespiegelt', { b0, b1 });
  const seq = (await stored(A, 'held')).snapshot.slices.market.seq;
  const up = clone(s); up.slices.market = { seq };
  const r = await upload(A, 'held', up);
  ok(r && same(r.snapshot.slices.wallet, s.slices.wallet), 'Danach hochgeladener Stand passt zum Buch');
  // Admin im SQL-Editor schenkt ein Reittier
  const mount = Object.keys(COUNTED_MOUNTS)[1];
  await pool.query(`update public.characters set snapshot = jsonb_set(snapshot, '{slices,character,mounts,owned}', snapshot #> '{slices,character,mounts,owned}' || to_jsonb($3::text)) where user_id = $1 and id = $2`, [A, 'held', mount]);
  const b2 = await book(A, 'held');
  ok(b2.items[COUNTED_MOUNTS[mount]] === 1, 'Geschenk vom Admin landet im Buch');
}

// ---------------------------------------------------------------- 7. Ende des Übergangs, Notbremse
{
  await upload(B, 'alt', kit());
  await pool.query("update public.ledger_config set strict_after = now() - interval '1 minute' where id = 1");
  const s = kit(); s.slices.wallet.gold = 4000;
  const r = await upload(B, 'alt', s);
  ok(r && r.snapshot.slices.wallet.gold === 0, 'Nach der Frist gilt das Buch auch ohne Sitzung', r?.snapshot.slices.wallet);
  await pool.query('update public.ledger_config set enforce = false where id = 1');
  await pool.query("delete from public.character_flags where user_id = $1", [B]);
  const r2 = await upload(B, 'alt', s);
  ok(r2 && r2.snapshot.slices.wallet.gold === 4000 && (await flags(B, 'buch')).length === 1, 'Notbremse: nur vermerken, nicht kappen');
  await pool.query('update public.ledger_config set enforce = true where id = 1');
  // Neuer Charakter nach der Frist: Buch beginnt mit dem Startpaket
  const r3 = await upload(C, 'neu', kit());
  ok(r3 && (await book(C, 'neu'))?.items?.minor_potion === 5, 'Neuer Charakter nach der Frist: Buch = Startpaket');
  const s4 = kit(); s4.slices.inventory.slots[2] = { itemId: 'minor_potion', qty: 99 };
  const r4 = await upload(C, 'neu', s4);
  ok(r4 && r4.snapshot.slices.inventory.slots[2] === null, 'und darüber wird gekappt');
}

// ---------------------------------------------------------------- 7b. Klasse und Volk bleiben
{
  const s = (await stored(A, 'held')).snapshot;
  s.slices.character.classId = 'mage';
  s.slices.character.raceId = 'elf';
  const row = (await asUser(A, `update public.characters set snapshot = $1, class_id = 'mage', race_id = 'elf' where user_id = $2 and id = 'held' returning class_id, race_id, snapshot`, [s, A])).rows[0];
  ok(row && row.class_id === 'warrior' && row.race_id === 'human' && row.snapshot.slices.character.classId === 'warrior' && row.snapshot.slices.character.raceId === 'human', 'Klasse und Volk lassen sich nicht ändern', row ? { c: row.class_id, r: row.race_id } : (await pool.query('select reason, detail from public.character_flags order by created_at desc limit 2')).rows);
}

// ---------------------------------------------------------------- 8. Rechte
{
  const denied = async (sql, args = []) => { try { await asUser(A, sql, args); return false; } catch (e) { return /permission|nicht erlaubt|42501/.test(e.message) || e.code === '42501'; } };
  ok(await denied('select * from public.character_ledger'), 'Spieler kann das Buch nicht lesen');
  ok(await denied("update public.character_ledger set gold = 1e9"), 'Spieler kann das Buch nicht ändern');
  ok(await denied("select public.ledger_guard($1, 'held', '{}'::jsonb, false)", [A]), 'ledger_guard nicht direkt aufrufbar');
  ok(await denied("select public.ledger_user_sync($1, 'held')", [A]), 'ledger_user_sync nicht direkt aufrufbar');
  ok(await denied("select public.ledger_values('{}'::jsonb)"), 'Bausteine nicht aufrufbar');
  ok(await denied('select * from public.ledger_config'), 'Einstellungen nicht lesbar');
  // Fremder Charakter: nichts zu sehen, nichts zu schreiben
  const r = await asUser(D, `update public.characters set snapshot = $1 where user_id = $2 and id = 'held' returning id`, [SNAP, A]);
  ok(r.rowCount === 0, 'Fremder Charakter bleibt unberührt');
}

await pool.query("delete from auth.users where email like '%@buch.test'");
await pool.query('update public.ledger_config set strict_after = null, enforce = true where id = 1');
await pool.end();
console.log(fails ? `${fails} Fehler` : 'alle Datenbanktests grün');
process.exit(fails ? 1 : 0);
