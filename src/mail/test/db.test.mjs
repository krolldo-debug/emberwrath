// Datenbanktest des Postfachs gegen eine echte Postgres 16 (Supabase-Nachbau, alle Migrationen ausgeführt).
//   PGHOST=/var/tmp/pgm PGPORT=5544 PGDATABASE=sbtest node src/mail/test/db.test.mjs   (braucht das npm-Paket pg)
// Prüft: Senden nimmt Gold und Gegenstand aus dem Spielstand, nichts lässt sich doppelt verschicken (auch gleichzeitig),
// alter Spielstand wird abgelehnt, Empfang per Name und Empfängerkennung (kein Abfangen durch Umbenennen oder
// Doppelgänger), Abholen einzeln und alle, Bestand beim Empfänger, Kontingent und Goldrahmen wie im Auktionshaus (auch
// kein Verbrauch bei Fehlern), Gold teilweise bis zum Rahmen, Rücksendung nach 30 Tagen und von Hand, Auktionshaus-Post
// verfällt nicht, Grenzen je Empfänger und Absender, Tempo, gelöschte Charaktere, Beutebriefe im Spielstand, Rechte.
import pg from 'pg';
import { tradeableCatalog } from '../../market/rules.js';
import { SEND_PER_HOUR, BOX_MAX, PAIR_MAX, LOOKUP_PER_MINUTE, LOOT_MAX } from '../rules.js';

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
const lookup = (uid, ch, to) => rpc(uid, 'mail_lookup', { p_character: ch, p_to: to });
// Wie das Spiel: erst nachschlagen (Kennung), dann senden. Das Nachschlage-Tempo prüft ein eigener Test.
async function send(uid, ch, to, { item = null, qty = null, gold = 0, key } = {}) {
  if (key === undefined) {
    await pool.query('update public.market_rate set lookups = 0 where user_id = $1', [uid]);
    key = (await lookup(uid, ch, to)).key ?? null;
  }
  return rpc(uid, 'mail_send', { p_character: ch, p_to: to, p_key: key, p_item: item, p_qty: qty, p_gold: gold });
}
const box = async (uid, ch) => (await rpc(uid, 'mail_box', { p_character: ch })).mail;
const take = (uid, ch, ids = null) => rpc(uid, 'mail_take', { p_character: ch, p_ids: ids });
const snapOf = async (uid, id) => (await pool.query('select snapshot from public.characters where user_id = $1 and id = $2', [uid, id])).rows[0].snapshot;
const count = (snap, item) => snap.slices.inventory.slots.reduce((n, s) => n + (s?.itemId === item ? s.qty : 0), 0) + (snap.slices.inventory.mats?.[item] ?? 0);
const goldOf = async (uid, id) => (await snapOf(uid, id)).slices.wallet.gold;
const owned = async (uid, id, item) => (await pool.query('select qty from public.market_owned where user_id = $1 and character_id = $2 and item_id = $3', [uid, id, item])).rows[0]?.qty ?? 0;
const freshUsed = async (uid) => (await pool.query('select fresh from public.market_accounts where user_id = $1', [uid])).rows[0]?.fresh ?? 0;

function snapshot({ name = 'Held', level = 30, gold = 0, slots = [], mats = {}, playTime = 36000, loot } = {}) {
  const bag = Array(36).fill(null);
  slots.forEach((s, i) => { bag[i] = s; });
  return {
    meta: { accountId: 'x', characterId: 'x', createdAt: 1, savedAt: 1, playTime, version: 1 },
    slices: {
      character: { name, raceId: 'human', classId: 'warrior', mounts: { owned: [], active: null, riding: false } },
      progress: { level, xp: 0 }, inventory: { slots: bag, equipment: {}, mats, questBag: [] }, wallet: { gold },
      ...(loot ? { mail: { loot, next: loot.length + 1 } } : {}),
    },
  };
}


// ---------------------------------------------------------------- Ausgangslage
await pool.query("delete from auth.users where email like '%@post.test'");
await pool.query('delete from public.character_flags');
const users = {};
for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) users[n] = (await pool.query('insert into auth.users (email) values ($1) returning id', [`${n}@post.test`])).rows[0].id;
const { a: A, b: B, c: C, d: D, e: E, f: F, g: G } = users;
await pool.query('insert into public.market_accounts (user_id, started) select unnest($1::uuid[]), current_date - 1', [[A, B, C, D, E]]);
const put = (uid, id, snap, verified = 36000, at = 'now()') => pool.query(`insert into public.characters (user_id, id, name, level, class_id, snapshot, play_verified, updated_at)
  values ($1, $2, $3, $4, 'warrior', $5, $6, ${at})
  on conflict (user_id, id) do update set name = excluded.name, level = excluded.level, snapshot = excluded.snapshot, play_verified = excluded.play_verified, updated_at = ${at}`,
[uid, id, snap.slices.character.name, snap.slices.progress.level, snap, verified]);
await put(A, 'ca', snapshot({ name: 'Aldric', gold: 5000, slots: [{ itemId: EPIC, qty: 1 }, { itemId: RARE, qty: 1 }, { itemId: QUEST_ITEM, qty: 1 }], mats: { [MAT]: 30 } }));
await put(A, 'ca2', snapshot({ name: 'Aldricstwink', gold: 0 }));
await put(B, 'cb', snapshot({ name: 'Brunhild', gold: 100 }));
await put(B, 'cy', snapshot({ name: 'Jungspund', level: 9, gold: 100 }));

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
if (twinGotRare) {
  r = await take(A, 'ca2');
  ok(r.ok && count(await snapOf(A, 'ca2'), RARE) === 1, 'Eigener zweiter Charakter bekommt den Brief');
}

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
r = await send(B, 'cy', 'Aldric', { gold: 50 });
ok(!r.ok && r.error === 'young', 'Junger Charakter (Stufe/Spielzeit) darf noch nicht senden');
r = await lookup(A, 'ca', 'Jungspund');
ok(!r.ok && r.error === 'unready', 'Nachschlagen: junger Charakter kann noch keine Post empfangen');
r = await send(A, 'ca', 'Jungspund', { gold: 50, key: null });
ok(!r.ok && (r.error === 'unready' || r.error === 'changed'), 'Senden an einen jungen Charakter geht nicht (kein Parkplatz für Bestand)');
r = await send(A, 'ca', 'Brunhild', { gold: 1, key: null });
ok(!r.ok && r.error === 'changed', 'Ohne Empfängerkennung wird nicht gesendet');
await pool.query("insert into public.shop_exclusive_items (key) values ('mount:ash_wolf') on conflict do nothing");
await put(A, 'ca', { ...(await snapOf(A, 'ca')), slices: { ...(await snapOf(A, 'ca')).slices, inventory: { ...(await snapOf(A, 'ca')).slices.inventory, slots: [{ itemId: 'mount_ash_wolf', qty: 1 }, ...Array(35).fill(null)] } } });
r = await send(A, 'ca', 'Brunhild', { item: 'mount_ash_wolf', qty: 1 });
ok(!r.ok && r.error === 'item', 'Shop-Design lässt sich nicht verschicken (auch wenn es im Katalog stünde)');
await pool.query("delete from public.shop_exclusive_items where key = 'mount:ash_wolf'");

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
ok(r.ok, 'Alles nehmen');
ok((await box(B, 'cb')).length === 0, 'Postfach danach leer');

// gleichzeitig Gold: nie mehr weg, als da ist
const g0 = await goldOf(A, 'ca');
const pg3 = await Promise.all([1, 2, 3].map(() => send(A, 'ca', 'Brunhild', { gold: 2000 })));
const g1 = await goldOf(A, 'ca');
ok(g0 - g1 === 2000 * pg3.filter((x) => x.ok).length && g1 >= 0, `Gleichzeitig Gold schicken: abgezogen = verschickt (${g0} → ${g1}; ${pg3.map((x) => x.ok || x.error).join(', ')})`);
await take(B, 'cb');

// Empfänger verkauft im Auktionshaus aus dem Bestand: kostet ihn kein Kontingent
sb = await snapOf(B, 'cb');
r = await rpc(B, 'market_list', { p_character: 'cb', p_item: EPIC, p_qty: 1, p_start_bid: null, p_buyout: 1000, p_hours: 12 });
ok(r.ok && await freshUsed(B) === 0, 'Weiterverkauf des empfangenen Gegenstands kostet kein Kontingent');
// Auktionshaus: Sofortkauf landet im Postfach des Käufers
await put(C, 'cc', snapshot({ name: 'Cora', gold: 5000 }), 36000);
const buy = await rpc(C, 'market_buyout', { p_character: 'cc', p_listing: r.listing });
mb = await box(C, 'cc');
ok(buy.ok && buy.mailed && count(await snapOf(C, 'cc'), EPIC) === 0 && mb.some((m) => m.kind === 'bought' && m.itemId === EPIC && m.expiresAt === null), 'Sofortkauf: Ware liegt im Postfach und verfällt nicht');
mb = await box(B, 'cb');
ok(mb.some((m) => m.kind === 'sold' && m.gold === 950 && m.about === EPIC), 'Erlös des Verkäufers liegt im Postfach');
await pool.query(`set session_replication_role = replica; update public.characters set created_at = now() - interval '100 days' where user_id = '${B}' and id = 'cb';
  set session_replication_role = origin`);
await pool.query("update public.market_mail set created_at = now() - interval '90 days' where user_id = $1 and kind = 'sold'", [B]);
r = await take(B, 'cb');
ok(r.ok && r.collected === 1 && (await goldOf(B, 'cb')) === sb.slices.wallet.gold + 950, 'Alter Erlös (90 Tage) ist noch da und abholbar');

// ---------------------------------------------------------------- Kontingent und Goldrahmen wie im Auktionshaus
await put(D, 'cd', snapshot({ name: 'Dorn', gold: 40000, slots: LEG.slice(0, 3).map((itemId) => ({ itemId, qty: 1 })) }), 3600);
const legs = [];
for (const it of LEG.slice(0, 3)) legs.push(await send(D, 'cd', 'Cora', { item: it, qty: 1 }));
ok(legs[0].ok && legs[1].ok && !legs[2].ok && legs[2].error === 'budget', `Kontingent gilt auch für die Post (${legs.map((x) => x.ok || x.error).join(', ')})`);
// Neues Konto, eine Stunde geprüfte Spielzeit: Goldrahmen 150 × 3600 = 540.000
await put(F, 'cf', snapshot({ name: 'Fenja', gold: 600000, slots: [{ itemId: RARE, qty: 1 }] }), 3600);
r = await send(F, 'cf', 'Cora', { item: RARE, qty: 1, gold: 600000 });
ok(!r.ok && r.error === 'frame' && await freshUsed(F) === 0 && count(await snapOf(F, 'cf'), RARE) === 1,
  `Abgelehnter Brief (Goldrahmen) verbraucht weder Kontingent noch Gegenstand (${r.error}, ${await freshUsed(F)})`);
await pool.query('insert into public.market_owned (user_id, character_id, item_id, qty) values ($1, $2, $3, 1)', [F, 'cf', RARE]);
r = await send(F, 'cf', 'Cora', { item: RARE, qty: 1, gold: 600000 });
ok(!r.ok && await owned(F, 'cf', RARE) === 1, 'Abgelehnter Brief lässt den Bestand stehen');
r = await send(F, 'cf', 'Cora', { gold: 1000 });
ok(r.ok, 'Gold im Goldrahmen geht');
// Empfänger mit wenig geprüfter Spielzeit: Gold bis zu seinem Rahmen, der Rest bleibt im Brief und verfällt nicht
await put(E, 'ce', snapshot({ name: 'Eskil', gold: 0 }), 3600);
await put(A, 'ca', snapshot({ name: 'Aldric', gold: 600000, slots: [{ itemId: RARE, qty: 1 }] }), 36000);
await pool.query('update public.market_chars set seq = 0 where user_id = $1', [A]);
r = await send(A, 'ca', 'Eskil', { item: RARE, qty: 1, gold: 500000 });
ok(r.ok, 'Brief mit viel Gold an Eskil');
await pool.query("update public.characters set play_verified = 10 where user_id = $1", [E]);
r = await take(E, 'ce');
let se = await snapOf(E, 'ce');
mb = await box(E, 'ce');
ok(r.ok && r.capped === 1 && count(se, RARE) === 1 && se.slices.wallet.gold === 1500 && mb.length === 1 && mb[0].gold === 498500 && !mb[0].itemId && mb[0].expiresAt === null,
  `Gold bis zum Rahmen des Empfängers, Rest bleibt im Brief und verfällt nicht (${JSON.stringify(r)}, ${JSON.stringify(mb[0])})`);
await pool.query("update public.characters set play_verified = 36000 where user_id = $1", [E]);
r = await take(E, 'ce');
ok(r.ok && r.collected === 1 && (await goldOf(E, 'ce')) === 500000, 'Mit mehr Spielzeit lässt sich der Rest nehmen');

// ---------------------------------------------------------------- Gleiche Namen, Umbenennen, Kennung
await put(C, 'cz', snapshot({ name: 'Zwilling' }), 36000, "now() - interval '2 days'");
await put(D, 'dz', snapshot({ name: 'Zwilling' }), 36000, "now() - interval '1 hour'");
r = await lookup(A, 'ca', ' zwilling ');
ok(r.ok && r.many === true && r.level === 30 && r.classId === 'warrior' && r.key && !JSON.stringify(r).includes(D) && !JSON.stringify(r).includes(C),
  `Nachschlagen: mehrere, Kennung, ohne Konto-ID (${JSON.stringify(r)})`);
const zKey = r.key;
r = await send(A, 'ca', 'Zwilling', { gold: 10, key: zKey });
ok(r.ok && (await box(C, 'cz')).length === 1 && (await box(D, 'dz')).length === 0, 'Bei gleichen Namen bekommt der älteste Charakter den Brief, nicht der zuletzt gespielte');
// Angriff 1: per Upload in „Brunhild“ umbenennen
await put(G, 'cg', snapshot({ name: 'Gauner', level: 30 }), 36000);
await asUser(G, 'update public.characters set name = $1 where id = $2', ['Brunhild', 'cg']);
ok((await pool.query("select name from public.characters where user_id = $1 and id = 'cg'", [G])).rows[0].name === 'Gauner', 'Charaktername ändert sich per Upload nicht');
// Angriff 2: neuer Doppelgänger „Brunhild“, viel gespielt
await put(G, 'cg2', snapshot({ name: 'Brunhild' }), 36000);
r = await send(A, 'ca', 'Brunhild', { gold: 7 });
ok(r.ok && (await box(G, 'cg2')).length === 0 && (await box(B, 'cb')).some((m) => m.gold === 7), 'Später angelegter Doppelgänger fängt keine Briefe ab');
// Kennung: zeigt der Name inzwischen auf jemand anderen, wird nicht gesendet
await pool.query("delete from public.characters where user_id = $1 and id = 'cz'", [C]);
r = await send(A, 'ca', 'Zwilling', { gold: 10, key: zKey });
ok(!r.ok && r.error === 'changed', 'Alte Empfängerkennung, Name zeigt jetzt auf einen anderen: abgelehnt');
ok((await pool.query("select count(*)::int n from public.market_mail where user_id = $1 and character_id = 'cz'", [C])).rows[0].n === 0, 'Post eines gelöschten Charakters ist gelöscht');
await put(C, 'cz', snapshot({ name: 'Neuling' }), 36000);
await pool.query("insert into public.market_mail (user_id, character_id, kind, gold, created_at) values ($1, 'cz', 'sold', 99, now() - interval '1 day')", [C]);
ok((await box(C, 'cz')).length === 0, 'Neuer Charakter mit derselben ID erbt keine ältere Post');

// ---------------------------------------------------------------- Rücksendung, Verfall
await take(A, 'ca');
const ga = await goldOf(A, 'ca');
r = await send(A, 'ca', 'Eskil', { gold: 300 });
await pool.query("update public.market_mail set expires_at = now() - interval '1 minute' where user_id = $1 and kind = 'letter' and collected_at is null", [E]);
ok((await box(E, 'ce')).length === 0, 'Abgelaufener Brief ist beim Empfänger weg');
mb = await box(A, 'ca');
const back = mb.find((m) => m.kind === 'returned');
ok(back && back.gold === 300 && back.from === 'Eskil' && back.expiresAt === null, `… und liegt wieder beim Absender, ohne Ablauf (${JSON.stringify(back)})`);
r = await take(A, 'ca', [back.id]);
ok(r.ok && (await goldOf(A, 'ca')) === ga, 'Zurückgekommenes Gold lässt sich nehmen, nichts ging verloren');
r = await send(A, 'ca', 'Eskil', { gold: 40 });
mb = await box(E, 'ce');
r = await rpc(E, 'mail_return', { p_character: 'ce', p_id: mb[0].id });
ok(r.ok && (await box(E, 'ce')).length === 0 && (await box(A, 'ca')).some((m) => m.kind === 'returned' && m.gold === 40), 'Empfänger schickt einen Brief zurück');
r = await rpc(A, 'mail_return', { p_character: 'ca', p_id: (await box(A, 'ca'))[0].id });
ok(!r.ok && r.error === 'gone', 'Zurückgekommenes geht nicht noch einmal zurück');
await take(A, 'ca');
// Absender gelöscht: Brief bleibt beim Empfänger
await put(A, 'cx', snapshot({ name: 'Wegwerf', gold: 900 }), 36000);
await pool.query("update public.market_rate set sent = 0 where user_id = $1", [A]);
r = await send(A, 'cx', 'Eskil', { gold: 900 });
await pool.query("delete from public.characters where user_id = $1 and id = 'cx'", [A]);
await pool.query("update public.market_mail set expires_at = now() - interval '1 minute' where user_id = $1 and kind = 'letter' and collected_at is null", [E]);
mb = await box(E, 'ce');
ok(r.ok && mb.length === 1 && mb[0].gold === 900 && mb[0].expiresAt === null, 'Gibt es den Absender nicht mehr, bleibt der Brief beim Empfänger');
await take(E, 'ce');

// ---------------------------------------------------------------- Grenzen, Tempo, Vermerk
const eKey = (await lookup(A, 'ca', 'Eskil')).key;
const pair = [];
for (let i = 0; i <= PAIR_MAX; i++) pair.push(await send(A, 'ca', 'Eskil', { gold: 1, key: eKey }));
ok(pair.slice(0, PAIR_MAX).every((x) => x.ok) && pair[PAIR_MAX].error === 'nodeliver', `Höchstens ${PAIR_MAX} offene Briefe eines Absenders an denselben Empfänger`);
// Briefe, die wegen des Goldrahmens beim Empfänger festliegen (ohne Ablauf), zählen für keine der Grenzen
await pool.query("update public.market_mail set expires_at = null where from_user = $1 and user_id = $2 and kind = 'letter' and collected_at is null", [A, E]);
r = await send(A, 'ca', 'Eskil', { gold: 1, key: eKey });
ok(r.ok, 'Festliegende Briefe blockieren den Absender nicht');
await pool.query(`insert into public.market_mail (user_id, character_id, kind, gold, from_name, expires_at) select $1, 'ce', 'letter', 1, 'X', now() + interval '1 day' from generate_series(1, ${BOX_MAX})`, [E]);
r = await send(F, 'cf', 'Eskil', { gold: 1 });
ok(!r.ok && r.error === 'nodeliver', `Volles Postfach (${BOX_MAX} Briefe) nimmt nichts mehr an, mit demselben Fehler wie die Absendergrenze`);
await pool.query("update public.market_rate set sent = $2, sent_hour = date_trunc('hour', now()) where user_id = $1", [A, SEND_PER_HOUR]);
r = await send(A, 'ca', 'Cora', { gold: 1 });
ok(!r.ok && r.error === 'rate', `Höchstens ${SEND_PER_HOUR} Briefe je Stunde`);
await pool.query("update public.market_rate set sent = 5, sent_hour = date_trunc('hour', now()) where user_id = $1", [A]);
r = await send(A, 'ca', 'Niemandda', { gold: 1 });
ok(!r.ok && (await pool.query('select sent from public.market_rate where user_id = $1', [A])).rows[0].sent === 5, 'Abgelehnte Briefe zählen nicht fürs Stundenlimit');
await pool.query('update public.market_rate set sent = 0, lookups = 0 where user_id = $1', [A]);
let lk = null;
for (let i = 0; i <= LOOKUP_PER_MINUTE; i++) lk = await lookup(A, 'ca', 'Cora');
ok(!lk.ok && lk.error === 'rate', `Nachschlagen höchstens ${LOOKUP_PER_MINUTE}-mal je Minute`);
await pool.query("insert into public.character_flags (user_id, character_id, reason, detail) values ($1, 'ca', 'gold', '{}')", [A]);
r = await send(A, 'ca', 'Cora', { gold: 1 });
ok(!r.ok && r.error === 'blocked', 'Konto mit Schummel-Vermerk darf nicht senden');
await pool.query('delete from public.character_flags where user_id = $1', [A]);

// ---------------------------------------------------------------- Beutebriefe im Spielstand (Upload)
const lootLetter = (gold = 100, items = [{ itemId: RARE, qty: 1 }]) => ({ id: 'b1', at: Date.now(), boss: 'bonelord', zoneId: 'catacombs', items, gold });
const upload = (uid, id, snap) => asUser(uid, `insert into public.characters (user_id, id, name, level, class_id, snapshot) values ($1, $2, $3, 1, 'warrior', $4)
  on conflict (user_id, id) do update set snapshot = excluded.snapshot, name = excluded.name`, [uid, id, snap.slices.character.name, snap]);
const flagsOf = async (uid) => (await pool.query('select reason from public.character_flags where user_id = $1 order by created_at', [uid])).rows.map((x) => x.reason);
await pool.query('delete from public.characters where user_id = $1', [G]);
await upload(G, 'g1', snapshot({ name: 'Gerd', level: 1, gold: 0, loot: [lootLetter(999999999, [{ itemId: 'kingsbane', qty: 999999 }])] }));
ok(!(await pool.query("select 1 from public.characters where user_id = $1 and id = 'g1'", [G])).rowCount, 'Neuer Charakter mit Beutebriefen wird nicht angelegt');
await pool.query('delete from public.character_flags where user_id = $1', [G]);
await upload(G, 'g1', snapshot({ name: 'Gerd', level: 1, gold: 0 }));
ok((await pool.query("select 1 from public.characters where user_id = $1 and id = 'g1'", [G])).rowCount === 1, 'Neuer Charakter ohne Beutebriefe wird angelegt');
const g1snap = async () => (await snapOf(G, 'g1'));
await upload(G, 'g1', snapshot({ name: 'Gerd', level: 1, loot: [lootLetter(50)] }));
ok((await g1snap()).slices.mail?.loot?.length === 1, 'Kleiner Beutebrief wird gespeichert');
for (const [bad, why] of [
  [Array.from({ length: LOOT_MAX + 1 }, () => lootLetter(1)), 'zu viele Briefe'],
  [[lootLetter(1, Array.from({ length: 9 }, () => ({ itemId: RARE, qty: 1 })))], 'zu viele Teile'],
  [[lootLetter(1, [{ itemId: RARE, qty: 5000 }])], 'Menge über 999'],
  [[lootLetter(1, [{ itemId: RARE, qty: 1.5 }])], 'Menge keine ganze Zahl'],
  [[lootLetter(2.5)], 'Gold keine ganze Zahl'],
  [[lootLetter(999999)], 'Gold über der Grenze je Brief'],
  [{ x: 1 }, 'kein Array'],
]) {
  await pool.query('delete from public.character_flags where user_id = $1', [G]);
  await upload(G, 'g1', snapshot({ name: 'Gerd', level: 1, loot: bad }));
  ok((await g1snap()).slices.mail.loot.length === 1 && (await flagsOf(G)).includes('postfach'), `Beutebriefe abgelehnt: ${why}`);
}
await pool.query('delete from public.character_flags where user_id = $1', [G]);
await upload(G, 'g1', snapshot({ name: 'Gerd', level: 1, gold: 45000, loot: Array.from({ length: 3 }, () => lootLetter(18000)) }));
ok((await g1snap()).slices.wallet.gold === 0 && (await flagsOf(G)).includes('gold'), 'Gold in Beutebriefen zählt zur Gold-Obergrenze');

// ---------------------------------------------------------------- Rechte
let denied = 0;
for (const sql of ["select public.mail_send('ca', 'Eskil', null, null, null, 1)", "select public.mail_box('ca')", "select public.mail_take('ca')", "select public.mail_return('ca', 1)"]) {
  try { await asUser(null, sql); } catch { denied++; }
}
ok(denied === 4, 'Ohne Anmeldung kein Zugriff');
denied = 0;
for (const sql of ["select public.mail_recipient('Eskil')", "select public.mail_expire(10)", 'select * from public.market_mail', "update public.market_mail set gold = 999999", 'select * from public.mail_keys', "select public.market_collect('ca')"]) {
  try { const x = await asUser(A, sql); if (x.rowCount === 0 && !sql.startsWith('select public')) denied++; } catch { denied++; }
}
ok(denied === 6, 'Spieler kommen weder an interne Bausteine noch an die Tabellen; die alte Abholfunktion gibt es nicht mehr');
r = await rpc(A, 'mail_box', { p_character: 'cb' });
ok(!r.ok || r.mail.length === 0, 'Fremdes Postfach bleibt verschlossen (nur eigene Charaktere)');

console.log(fails ? `${fails} Fehler` : 'Alles grün');
await pool.end();
process.exit(fails ? 1 : 0);
