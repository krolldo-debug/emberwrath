// Datenbanktest des Postfachs gegen eine echte Postgres 16 (Supabase-Nachbau, alle Migrationen ausgeführt).
//   PGHOST=/var/tmp/pgm PGPORT=5544 PGDATABASE=sbtest node src/mail/test/db.test.mjs   (braucht das npm-Paket pg)
// Prüft: Senden nimmt Gold und Gegenstand aus dem Spielstand, nichts lässt sich doppelt verschicken (auch gleichzeitig),
// alter Spielstand wird abgelehnt, Empfang per Name, Abholen einzeln und alle, Bestand beim Empfänger, Kontingent und
// Goldrahmen wie im Auktionshaus, Grenze beim Empfänger, Verfall nach 30 Tagen, Tempo, volles Postfach, Rechte.
import pg from 'pg';
import { tradeableCatalog } from '../../market/rules.js';
import { SEND_PER_HOUR, BOX_MAX } from '../rules.js';

const pool = new pg.Pool({ host: process.env.PGHOST ?? '/var/tmp/pgm', port: +(process.env.PGPORT ?? 5544), user: 'postgres', database: process.env.PGDATABASE ?? 'sbtest' });
let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const cat = tradeableCatalog();
const EPIC = cat.find((r) => r[1] === 'weapon' && r[2] === 'epic' && r[3] <= 30)[0];
const RARE = cat.find((r) => r[1] === 'armor' && r[2] === 'rare' && r[3] <= 30)[0];
const LEG = cat.filter((r) => r[1] === 'weapon' && r[2] === 'legendary' && r[3] <= 30).map((r) => r[0]);
const MAT = 'ember_core';
const QUEST_ITEM = 'tyrant_crown';

async function asUser(uid, sql, args = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' })]);
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
const send = (uid, ch, to, { item = null, qty = null, gold = 0 } = {}) => rpc(uid, 'mail_send', { p_character: ch, p_to: to, p_item: item, p_qty: qty, p_gold: gold });
const box = async (uid, ch) => (await rpc(uid, 'mail_box', { p_character: ch })).mail;
const take = (uid, ch, ids = null) => rpc(uid, 'mail_take', { p_character: ch, p_ids: ids });
const snapOf = async (uid, id) => (await pool.query('select snapshot from public.characters where user_id = $1 and id = $2', [uid, id])).rows[0].snapshot;
const count = (snap, item) => snap.slices.inventory.slots.reduce((n, s) => n + (s?.itemId === item ? s.qty : 0), 0) + (snap.slices.inventory.mats?.[item] ?? 0);
const goldOf = async (uid, id) => (await snapOf(uid, id)).slices.wallet.gold;
const owned = async (uid, id, item) => (await pool.query('select qty from public.market_owned where user_id = $1 and character_id = $2 and item_id = $3', [uid, id, item])).rows[0]?.qty ?? 0;
const freshUsed = async (uid) => (await pool.query('select fresh from public.market_accounts where user_id = $1', [uid])).rows[0]?.fresh ?? 0;

function snapshot({ name = 'Held', level = 30, gold = 0, slots = [], mats = {}, playTime = 36000 } = {}) {
  const bag = Array(36).fill(null);
  slots.forEach((s, i) => { bag[i] = s; });
  return {
    meta: { accountId: 'x', characterId: 'x', createdAt: 1, savedAt: 1, playTime, version: 1 },
    slices: {
      character: { name, raceId: 'human', classId: 'warrior', mounts: { owned: [], active: null, riding: false } },
      progress: { level, xp: 0 }, inventory: { slots: bag, equipment: {}, mats, questBag: [] }, wallet: { gold },
    },
  };
}

// ---------------------------------------------------------------- Ausgangslage
await pool.query("delete from auth.users where email like '%@post.test'");
await pool.query('delete from public.character_flags');
const users = {};
for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) users[n] = (await pool.query('insert into auth.users (email) values ($1) returning id', [`${n}@post.test`])).rows[0].id;
const { a: A, b: B, c: C, d: D, e: E, f: F } = users;
await pool.query('insert into public.market_accounts (user_id, started) select unnest($1::uuid[]), current_date - 1', [[A, B, C, D, E]]);
const put = (uid, id, snap, verified = 36000, at = 'now()') => pool.query(`insert into public.characters (user_id, id, name, level, class_id, snapshot, play_verified, updated_at)
  values ($1, $2, $3, $4, 'warrior', $5, $6, ${at})
  on conflict (user_id, id) do update set name = excluded.name, level = excluded.level, snapshot = excluded.snapshot, play_verified = excluded.play_verified, updated_at = ${at}`,
[uid, id, snap.slices.character.name, snap.slices.progress.level, snap, verified]);
await put(A, 'ca', snapshot({ name: 'Aldric', gold: 5000, slots: [{ itemId: EPIC, qty: 1 }, { itemId: RARE, qty: 1 }, { itemId: QUEST_ITEM, qty: 1 }], mats: { [MAT]: 30 } }));
await put(A, 'ca2', snapshot({ name: 'Aldricstwink', gold: 0 }));
await put(B, 'cb', snapshot({ name: 'Brunhild', level: 9, gold: 100 }));

// ---------------------------------------------------------------- Senden
let r = await send(A, 'ca', 'brunhild', { item: EPIC, qty: 1, gold: 500 });
ok(r.ok && r.to === 'Brunhild' && r.seq === 1 && r.gold === -500 && r.remove?.[0]?.itemId === EPIC, `Senden an „brunhild“ (Groß-/Kleinschreibung egal): ${JSON.stringify(r)}`);
let sa = await snapOf(A, 'ca');
ok(count(sa, EPIC) === 0 && sa.slices.wallet.gold === 4500 && sa.slices.market.seq === 1, 'Gold und Gegenstand sind aus dem gespeicherten Spielstand des Senders weg');
ok(await freshUsed(A) === 10, 'Eigene epische Beute kostet Handelskontingent wie beim Einstellen');
r = await send(A, 'ca', 'Brunhild', { item: EPIC, qty: 1 });
ok(!r.ok && r.error === 'missing', 'Derselbe Gegenstand lässt sich kein zweites Mal schicken');
const old = structuredClone(sa); old.slices.market = { seq: 0 }; old.slices.inventory.slots[0] = { itemId: EPIC, qty: 1 }; old.slices.wallet.gold = 5000;
await asUser(A, 'update public.characters set snapshot = $1 where id = $2', [old, 'ca']);
ok(count(await snapOf(A, 'ca'), EPIC) === 0, 'Alter Spielstand (Gegenstand noch da) wird abgelehnt');

// gleichzeitig dasselbe einzelne Stück an zwei Empfänger
const par = await Promise.all([send(A, 'ca', 'Brunhild', { item: RARE, qty: 1 }), send(A, 'ca', 'Aldricstwink', { item: RARE, qty: 1 })]);
ok(par.filter((x) => x.ok).length === 1, `Gleichzeitig zweimal dasselbe Stück: genau ein Brief (${par.map((x) => x.ok || x.error).join(', ')})`);
const twinGotRare = par[1].ok;
// gleichzeitig Gold: nie mehr weg, als da ist
const g0 = await goldOf(A, 'ca');
const pg3 = await Promise.all([1, 2, 3].map(() => send(A, 'ca', 'Brunhild', { gold: 2000 })));
const g1 = await goldOf(A, 'ca');
ok(g0 - g1 === 2000 * pg3.filter((x) => x.ok).length && g1 >= 0, `Gleichzeitig Gold schicken: abgezogen = verschickt (${g0} → ${g1}; ${pg3.map((x) => x.ok || x.error).join(', ')})`);

// Fehlerfälle
r = await send(A, 'ca', 'Niemandda', { gold: 1 });
ok(!r.ok && r.error === 'nobody', 'Unbekannter Name');
r = await send(A, 'ca', 'Aldric', { gold: 1 });
ok(!r.ok && r.error === 'self', 'An sich selbst geht nicht');
r = await send(A, 'ca', 'Brunhild', {});
ok(!r.ok && r.error === 'empty', 'Leerer Brief geht nicht');
r = await send(A, 'ca', 'Brunhild', { item: QUEST_ITEM, qty: 1 });
ok(!r.ok && r.error === 'item', 'Questgegenstand lässt sich nicht verschicken');
r = await send(A, 'ca', 'Brunhild', { gold: -5 });
ok(!r.ok && r.error === 'price', 'Negatives Gold abgelehnt');
r = await send(A, 'ca', 'Brunhild', { gold: 99999999 });
ok(!r.ok && r.error === 'price', 'Absurde Goldmenge abgelehnt');
r = await send(A, 'ca', 'Brunhild', { item: MAT, qty: 40 });
ok(!r.ok && (r.error === 'qty' || r.error === 'missing'), 'Mehr Material als vorhanden/als ein Stapel abgelehnt');
r = await send(B, 'cb', 'Aldric', { gold: 50 });
ok(!r.ok && r.error === 'young', 'Junger Charakter (Stufe/Spielzeit) darf noch nicht senden');

// ---------------------------------------------------------------- Empfangen
let mb = await box(B, 'cb');
const first = mb.find((m) => m.itemId === EPIC);
ok(first && first.kind === 'letter' && first.from === 'Aldric' && first.gold === 500 && first.expiresAt, `Postfach zeigt den Brief von Aldric: ${JSON.stringify(first)}`);
ok(!JSON.stringify(mb).includes(A), 'Postfach verrät keine Konto-ID des Senders');
r = await take(B, 'cb', [first.id]);
let sb = await snapOf(B, 'cb');
ok(r.ok && r.collected === 1 && count(sb, EPIC) === 1 && sb.slices.wallet.gold === 600 && r.ids.length === 1, `Einzeln nehmen: Gegenstand und Gold (${JSON.stringify(r)})`);
ok(await owned(B, 'cb', EPIC) === 1, 'Empfangener Gegenstand zählt beim Empfänger als Bestand');
r = await take(B, 'cb', [first.id]);
ok(r.ok && r.collected === 0, 'Zweimal nehmen bringt nichts');
r = await take(B, 'cb');
ok(r.ok && r.collected >= 1, 'Alles nehmen');
ok((await box(B, 'cb')).length === 0, 'Postfach danach leer');
if (twinGotRare) {
  r = await take(A, 'ca2');
  ok(r.ok && count(await snapOf(A, 'ca2'), RARE) === 1, 'Eigener zweiter Charakter bekommt den Brief');
}

// Empfänger verkauft im Auktionshaus aus dem Bestand: kostet ihn kein Kontingent
await put(B, 'cb', { ...sb, slices: { ...sb.slices, progress: { level: 30, xp: 0 } } }, 36000);
sb = await snapOf(B, 'cb');
r = await rpc(B, 'market_list', { p_character: 'cb', p_item: EPIC, p_qty: 1, p_start_bid: null, p_buyout: 1000, p_hours: 12 });
ok(r.ok && await freshUsed(B) === 0, 'Weiterverkauf des empfangenen Gegenstands kostet kein Kontingent');
// Auktionshaus: Sofortkauf landet im Postfach des Käufers
await put(C, 'cc', snapshot({ name: 'Cora', gold: 5000 }), 36000);
const buy = await rpc(C, 'market_buyout', { p_character: 'cc', p_listing: r.listing });
mb = await box(C, 'cc');
ok(buy.ok && buy.mailed && count(await snapOf(C, 'cc'), EPIC) === 0 && mb.some((m) => m.kind === 'bought' && m.itemId === EPIC), 'Sofortkauf: Ware liegt im Postfach');
mb = await box(B, 'cb');
ok(mb.some((m) => m.kind === 'sold' && m.gold === 950 && m.about === EPIC), 'Erlös des Verkäufers liegt im Postfach');

// ---------------------------------------------------------------- Kontingent und Goldrahmen wie im Auktionshaus
await put(D, 'cd', snapshot({ name: 'Dorn', gold: 40000, slots: LEG.slice(0, 3).map((itemId) => ({ itemId, qty: 1 })) }), 3600);
const legs = [];
for (const it of LEG.slice(0, 3)) legs.push(await send(D, 'cd', 'Cora', { item: it, qty: 1 }));
ok(legs[0].ok && legs[1].ok && !legs[2].ok && legs[2].error === 'budget', `Kontingent gilt auch für die Post (${legs.map((x) => x.ok || x.error).join(', ')})`);
// Neues Konto, eine Stunde geprüfte Spielzeit: Goldrahmen 150 × 3600 = 540.000
await put(F, 'cf', snapshot({ name: 'Fenja', gold: 600000 }), 3600);
r = await send(F, 'cf', 'Cora', { gold: 600000 });
ok(!r.ok && r.error === 'frame', 'Gold über dem Goldrahmen des Kontos lässt sich nicht verschicken');
r = await send(F, 'cf', 'Cora', { gold: 1000 });
ok(r.ok, 'Gold im Goldrahmen geht');
// Empfänger mit wenig geprüfter Spielzeit: Gold über seinem Rahmen bleibt im Postfach, der Gegenstand kommt
await put(E, 'ce', snapshot({ name: 'Eskil', gold: 0 }), 10);
await put(A, 'ca', snapshot({ name: 'Aldric', gold: 600000, slots: [{ itemId: RARE, qty: 1 }] }), 36000);
await pool.query('update public.market_chars set seq = 0 where user_id = $1', [A]);
r = await send(A, 'ca', 'Eskil', { item: RARE, qty: 1, gold: 500000 });
ok(r.ok, 'Brief mit viel Gold an Eskil');
r = await take(E, 'ce');
let se = await snapOf(E, 'ce');
mb = await box(E, 'ce');
ok(r.ok && r.capped === 1 && count(se, RARE) === 1 && se.slices.wallet.gold === 0 && mb.length === 1 && mb[0].gold === 500000 && !mb[0].itemId,
  `Gold über dem Rahmen des Empfängers bleibt im Brief, Gegenstand kommt (${JSON.stringify(r)})`);
await pool.query("update public.characters set play_verified = 36000 where user_id = $1", [E]);
r = await take(E, 'ce');
ok(r.ok && r.collected === 1 && (await goldOf(E, 'ce')) === 500000, 'Mit mehr Spielzeit lässt sich das Gold nehmen');

// ---------------------------------------------------------------- Mehrere Charaktere mit demselben Namen
await put(C, 'cz', snapshot({ name: 'Zwilling' }), 36000, "now() - interval '2 days'");
await put(D, 'dz', snapshot({ name: 'Zwilling' }), 36000, "now() - interval '1 hour'");
r = await rpc(A, 'mail_lookup', { p_character: 'ca', p_to: ' zwilling ' });
ok(r.ok && r.many === true && r.level === 30 && r.classId === 'warrior' && !JSON.stringify(r).includes(D), `Nachschlagen: mehrere, ohne Konto-ID (${JSON.stringify(r)})`);
r = await send(A, 'ca', 'Zwilling', { gold: 10 });
ok(r.ok && (await box(D, 'dz')).length === 1 && (await box(C, 'cz')).length === 0, 'Bei gleichen Namen bekommt der zuletzt gespielte Charakter den Brief');

// ---------------------------------------------------------------- Verfall, volles Postfach, Tempo, Vermerk
await pool.query("update public.market_mail set expires_at = now() - interval '1 minute' where user_id = $1 and character_id = 'dz'", [D]);
ok((await box(D, 'dz')).length === 0, 'Verfallene Post ist weg');
r = await take(D, 'dz');
ok(r.ok && r.collected === 0 && (await goldOf(D, 'dz')) === 0, 'Verfallene Post lässt sich nicht mehr nehmen');
await pool.query(`insert into public.market_mail (user_id, character_id, kind, gold, from_name) select $1, 'cz', 'letter', 1, 'X' from generate_series(1, ${BOX_MAX})`, [C]);
await pool.query("update public.characters set updated_at = now() where user_id = $1 and id = 'cz'", [C]);
r = await send(A, 'ca', 'Zwilling', { gold: 1 });
ok(!r.ok && r.error === 'full', `Volles Postfach (${BOX_MAX} Briefe von Spielern) nimmt nichts mehr an`);
await pool.query("update public.market_rate set sent = $2, sent_hour = date_trunc('hour', now()) where user_id = $1", [A, SEND_PER_HOUR]);
r = await send(A, 'ca', 'Eskil', { gold: 1 });
ok(!r.ok && r.error === 'rate', `Höchstens ${SEND_PER_HOUR} Briefe je Stunde`);
await pool.query('update public.market_rate set sent = 0 where user_id = $1', [A]);
await pool.query("insert into public.character_flags (user_id, character_id, reason, detail) values ($1, 'ca', 'gold', '{}')", [A]);
r = await send(A, 'ca', 'Eskil', { gold: 1 });
ok(!r.ok && r.error === 'blocked', 'Konto mit Schummel-Vermerk darf nicht senden');
await pool.query('delete from public.character_flags where user_id = $1', [A]);

// ---------------------------------------------------------------- Rechte
let denied = 0;
for (const sql of ["select public.mail_send('ca', 'Eskil', null, null, 1)", "select public.mail_box('ca')", "select public.mail_take('ca')"]) {
  try { await asUser(null, sql); } catch { denied++; }
}
ok(denied === 3, 'Ohne Anmeldung kein Zugriff');
denied = 0;
for (const sql of ["select public.mail_recipient('Eskil')", 'select * from public.market_mail', "update public.market_mail set gold = 999999"]) {
  try { const x = await asUser(A, sql); if (x.rowCount === 0 && !sql.startsWith('select public')) denied++; } catch { denied++; }
}
ok(denied === 3, 'Spieler kommen weder an interne Bausteine noch an die Tabelle');
r = await rpc(A, 'mail_box', { p_character: 'cb' });
ok(r.ok && r.mail.length === 0, 'Fremdes Postfach bleibt leer (nur eigene Charaktere)');

console.log(fails ? `${fails} Fehler` : 'Alles grün');
await pool.end();
process.exit(fails ? 1 : 0);
