// Datenbanktest: Angebote der Gilde der Glutwaage (20261030090000_auktionshaus_angebote.sql, erzeugt mit src/market/stockSql.mjs)
// gegen eine echte Postgres 16 mit allen Migrationen (Aufbau wie src/ledger/README.md).
//   PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/market/test/stock.test.mjs   (braucht das npm-Paket pg)
// Prüft: Befüllen bis zum Ziel, nur gültige Gegenstände zu fairen Preisen, keine Konkurrenz zu Spielerangeboten,
// Kaufen und Bieten mit Postfach und Fortschrittsbuch, Ablauf ohne Post, sanftes Nachfüllen, Notbremse, Rechte.
import pg from 'pg';
import { ITEMS } from '../../progression/items.js';
import { STOCK_TARGET, STOCK_MAX_LEVEL, SELLER, stockRows } from '../stockSql.mjs';

const pool = new pg.Pool({ host: process.env.PGHOST ?? '/var/run/postgresql', port: +(process.env.PGPORT ?? 5432), user: 'postgres', database: process.env.PGDATABASE ?? 'sbtest' });
let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };

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
const rpc = async (uid, fn, args) => {
  const names = Object.keys(args);
  const r = await asUser(uid, `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`, names.map((n) => args[n]));
  return r.rows[0].r;
};
const snapOf = async (uid, id) => (await pool.query('select snapshot from public.characters where user_id = $1 and id = $2', [uid, id])).rows[0].snapshot;
const count = (snap, item) => snap.slices.inventory.slots.reduce((n, s) => n + (s?.itemId === item ? s.qty : 0), 0) + (snap.slices.inventory.mats?.[item] ?? 0);
const guild = async () => (await pool.query(`select l.*, s.value, s.price from public.market_listings l join public.market_stock s on s.item_id = l.item_id
  where l.status = 'active' and l.seller_user is null and l.seller_char = $1`, [SELLER])).rows;
const mailOf = async (uid) => (await pool.query('select * from public.market_mail where user_id = $1 order by id', [uid])).rows;

function snapshot({ level = 30, gold = 0, playTime = 36000 } = {}) {
  return {
    meta: { accountId: 'x', characterId: 'x', createdAt: 1, savedAt: 1, playTime, version: 1 },
    slices: {
      character: { name: 'Held', raceId: 'human', classId: 'warrior', mounts: { owned: [], active: null, riding: false } },
      progress: { level, xp: 0 }, inventory: { slots: Array(36).fill(null), equipment: {}, mats: {}, questBag: [] }, wallet: { gold },
    },
  };
}

// ---------------------------------------------------------------- Ausgangslage
await pool.query('delete from public.market_mail; delete from public.market_listings; delete from public.market_rate');
await pool.query("delete from auth.users where email like '%@gilde.test'");
await pool.query(`update public.market_stock_config set target = ${STOCK_TARGET}`);
const users = [];
for (const n of ['a', 'b']) users.push((await pool.query('insert into auth.users (email) values ($1) returning id', [`${n}@gilde.test`])).rows[0].id);
const [UA, UB] = users;
await pool.query('insert into public.market_accounts (user_id, started) select unnest($1::uuid[]), current_date - 1', [users]);
const put = (uid, id, snap) => pool.query(`insert into public.characters (user_id, id, name, level, class_id, snapshot, play_verified)
  values ($1, $2, 'Held', 30, 'warrior', $3, 36000)`, [uid, id, snap]);
await put(UA, 'ga', snapshot({ gold: 200000 }));
await put(UB, 'gb', snapshot({ gold: 200000 }));

// ---------------------------------------------------------------- Katalog der Gilde
const rows = stockRows();
ok(rows.length > 500, `Genug verschiedene Ware (${rows.length})`);
ok(rows.every((r) => { const d = ITEMS[r.id]; return !d.source && !d.set && d.type !== 'mount' && d.rarity !== 'legendary' && d.type !== 'quest'; }),
  'Keine Bossbeute, Sets, Reittiere, legendären oder Questgegenstände');
ok(rows.every((r) => r.price >= r.value * 3), 'Fairer Preis mindestens dreifacher Händlerwert');

// ---------------------------------------------------------------- Befüllen
let n = (await pool.query('select public.market_restock(true) n')).rows[0].n;
let g = await guild();
ok(n === STOCK_TARGET && g.length === STOCK_TARGET, `Erste Befüllung: ${g.length} Angebote`);
ok(new Set(g.map((l) => l.item_id)).size === g.length, 'Jeder Gegenstand höchstens einmal');
const mi = new Map((await pool.query('select * from public.market_items')).rows.map((r) => [r.id, r]));
ok(g.every((l) => { const m = mi.get(l.item_id); return m && m.category === l.category && m.rarity === l.rarity && m.req_level === l.req_level
  && JSON.stringify(m.classes) === JSON.stringify(l.classes) && l.qty <= m.stack && m.req_level <= STOCK_MAX_LEVEL; }),
  'Nur gültige Gegenstände aus dem Katalog (Kategorie, Seltenheit, Stufe, Klassen, Stapel)');
ok(g.every((l) => (l.buyout == null || +l.buyout >= 2 * l.value * l.qty) && (l.start_bid == null || +l.start_bid >= 2 * l.value * l.qty)
  && (l.buyout == null || l.start_bid == null || +l.buyout >= +l.start_bid)), 'Preise über dem doppelten Händlerwert, Sofortkauf ≥ Startgebot');
ok(g.every((l) => { const p = +(l.buyout ?? l.start_bid); const f = l.price * l.qty; return p >= 0.6 * f && p <= 1.3 * f; }), 'Preise nahe am fairen Preis');
ok(g.some((l) => l.start_bid == null) && g.some((l) => l.buyout == null) && g.some((l) => l.start_bid != null && l.buyout != null),
  'Gemischt: nur Sofortkauf, nur Gebote, beides');
const left = g.map((l) => (l.ends_at - Date.now()) / 3600e3);
ok(Math.min(...left) > 0 && Math.max(...left) <= 48 && new Set(g.map((l) => Math.round((Date.now() - l.created_at) / 600e3))).size > 10,
  'Laufzeiten und Einstellzeiten verteilt');
ok(new Set(g.map((l) => l.category)).size >= 5, `Alle Warengruppen dabei (${[...new Set(g.map((l) => l.category))].join(', ')})`);
n = (await pool.query('select public.market_restock(true) n')).rows[0].n;
ok(n === 0, 'Ziel erreicht: nichts nachgestellt');

// ---------------------------------------------------------------- Spieler sehen die Angebote wie andere
let r = await rpc(UA, 'market_browse', { p_character: 'ga' });
ok(r.ok && r.rows.length === 41 && r.rows.every((x) => !x.mine), 'Suche zeigt die Angebote der Gilde, keines als eigenes');

// ---------------------------------------------------------------- Sofortkauf
const buy = g.find((l) => l.buyout != null && l.category !== 'material');
const ledger0 = (await pool.query("select gold, items from public.character_ledger where user_id = $1 and character_id = 'ga'", [UA])).rows[0];
r = await rpc(UA, 'market_buyout', { p_character: 'ga', p_listing: buy.id });
ok(r.ok && r.mailed, `Sofortkauf ok (${r.ok || r.error})`);
ok((await snapOf(UA, 'ga')).slices.wallet.gold === 200000 - +buy.buyout, 'Gold abgezogen');
ok((await pool.query('select count(*)::int n from public.market_mail where listing_id = $1', [buy.id])).rows[0].n === 1, 'Nur der Käufer bekommt Post (Gold geht an die Gilde)');
r = await rpc(UA, 'mail_take', { p_character: 'ga' });
let sa = await snapOf(UA, 'ga');
ok(r.ok && count(sa, buy.item_id) === buy.qty, 'Abgeholt: Gegenstand in der Tasche');
const ledger1 = (await pool.query("select gold, items from public.character_ledger where user_id = $1 and character_id = 'ga'", [UA])).rows[0];
ok(+ledger1.gold === +ledger0.gold - +buy.buyout, 'Fortschrittsbuch: Gold abgezogen');
const counted = (await pool.query('select 1 from public.ledger_items where id = $1', [buy.item_id])).rowCount > 0;
ok(!counted || (ledger1.items[buy.item_id] ?? 0) === (ledger0.items?.[buy.item_id] ?? 0) + buy.qty, `Fortschrittsbuch zählt den Gegenstand (${counted ? 'gezählt' : 'nicht gezählt'})`);
// Mit scharfem Fortschrittsbuch bleibt der Gegenstand nach dem nächsten Hochladen erhalten
await pool.query("update public.ledger_config set strict_after = now() - interval '1 minute', enforce = true where id = 1");
const up = structuredClone(sa); up.meta.playTime += 5;
await asUser(UA, 'update public.characters set snapshot = $1 where id = $2', [up, 'ga']);
sa = await snapOf(UA, 'ga');
ok(count(sa, buy.item_id) === buy.qty && sa.meta.playTime === up.meta.playTime, 'Hochladen danach: Gegenstand bleibt (Buch kappt nicht)');
await pool.query('update public.ledger_config set strict_after = null where id = 1');
r = await rpc(UA, 'market_list', { p_character: 'ga', p_item: buy.item_id, p_qty: buy.qty, p_start_bid: null, p_buyout: +buy.buyout, p_hours: 12 });
ok(r.ok, `Gekauftes lässt sich wieder einstellen (${r.ok || r.error})`);
const playerItem = buy.item_id;

// ---------------------------------------------------------------- Gebot und Ablauf
const bid = g.find((l) => l.start_bid != null && l.id !== buy.id);
r = await rpc(UB, 'market_bid', { p_character: 'gb', p_listing: bid.id, p_amount: +bid.start_bid });
ok(r.ok, `Gebot auf Angebot der Gilde (${r.ok || r.error})`);
const quiet = g.find((l) => l.id !== buy.id && l.id !== bid.id);
await pool.query("update public.market_listings set ends_at = now() - interval '1 second' where id = any ($1)", [[bid.id, quiet.id]]);
await rpc(UB, 'mail_box', { p_character: 'gb' });
await pool.query('select public.market_settle(50)');
const mb = await mailOf(UB);
ok(mb.length === 1 && mb[0].kind === 'won' && mb[0].item_id === bid.item_id, 'Höchstgebot gewinnt: Gegenstand im Postfach');
ok((await pool.query('select status from public.market_listings where id = $1', [quiet.id])).rows[0].status === 'expired'
  && (await pool.query('select count(*)::int n from public.market_mail where listing_id = $1', [quiet.id])).rows[0].n === 0, 'Ohne Gebot: läuft ohne Post aus');

// ---------------------------------------------------------------- Nachfüllen
const before = (await guild()).length;
n = (await pool.query('select public.market_restock() n')).rows[0].n;
const hour = (await pool.query("select extract(hour from now() at time zone 'Europe/Berlin')::int h")).rows[0].h;
ok(n <= 3 && (n >= 1 || (hour >= 2 && hour <= 6)), `Sanftes Nachfüllen: ${n} neue Angebote (vorher ${before})`);
ok(!(await guild()).some((l) => l.item_id === playerItem), 'Was ein Spieler anbietet, stellt die Gilde nicht ein');
await pool.query("update public.market_listings set status = 'cancelled' where seller_user is null and status = 'active' and item_id <> $1", [bid.item_id]);
for (let i = 0; i < 5; i++) await pool.query('select public.market_restock(true)');
ok(!(await guild()).some((l) => l.item_id === playerItem), 'Auch beim vollen Befüllen nicht');

// ---------------------------------------------------------------- Notbremse und Rechte
await pool.query('update public.market_stock_config set target = 0');
await pool.query("update public.market_listings set status = 'cancelled' where seller_user is null and status = 'active'");
n = (await pool.query('select public.market_restock(true) n')).rows[0].n;
ok(n === 0, 'Notbremse: Ziel 0 stellt nichts ein');
await pool.query(`update public.market_stock_config set target = ${STOCK_TARGET}`);
await pool.query('select public.market_restock(true)');
const open_ = (await guild()).find((l) => l.start_bid != null);
r = await rpc(UB, 'market_bid', { p_character: 'gb', p_listing: open_.id, p_amount: +open_.start_bid });
n = (await pool.query('select public.market_stock_clear() n')).rows[0].n;
ok(r.ok && n === STOCK_TARGET - 1 && (await guild()).length === 1, `Alles entfernen: ${n} beendet, das Angebot mit Gebot läuft weiter`);
for (const fn of ['market_restock(true)', 'market_stock_clear()']) {
  let denied = false;
  try { await asUser(UA, `select public.${fn}`); } catch { denied = true; }
  ok(denied, `Spieler dürfen ${fn} nicht aufrufen`);
}
let read = false;
try { await asUser(UA, 'select * from public.market_stock'); read = true; } catch { /* erwartet */ }
ok(!read, 'Spieler können die Preisliste nicht lesen');

await pool.query("delete from public.market_listings where seller_user is null or seller_user = any ($1)", [users]);
await pool.query("delete from auth.users where email like '%@gilde.test'");
await pool.end();
console.log(fails ? `\n${fails} Fehler` : '\nAlles gut');
process.exit(fails ? 1 : 0);
