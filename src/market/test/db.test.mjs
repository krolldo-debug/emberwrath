// Datenbanktest des Auktionshauses gegen eine echte Postgres 16 (Supabase-Nachbau, alle Migrationen ausgeführt).
//   PGHOST=/var/tmp/pgm PGPORT=5544 PGDATABASE=sbtest node src/market/test/db.test.mjs   (braucht das npm-Paket pg)
// Prüft: Einstellen nimmt den Gegenstand aus dem Spielstand, nichts lässt sich doppelt verkaufen oder doppelt bezahlen
// (auch gleichzeitig), alter oder erfundener Buchungszähler wird abgelehnt, Gebote/Überbieten/Ablauf/Abholen, Reittiere,
// Rechte, Gold-Obergrenze, Handelsfreigabe (Stufe, Spielzeit), Bestand und Kontingent je Stück, Goldrahmen je Konto,
// Spielzeit bleibt bei Buchungen erhalten, Handelsvermerk verdrängt keinen Gold-Vermerk, keine Shop-/legendären Reittiere.
import pg from 'pg';
import { tradeableCatalog, freshCost } from '../rules.js';

const pool = new pg.Pool({ host: process.env.PGHOST ?? '/var/tmp/pgm', port: +(process.env.PGPORT ?? 5544), user: 'postgres', database: process.env.PGDATABASE ?? 'sbtest' });
let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const cat = tradeableCatalog();
const EPIC = cat.find((r) => r[1] === 'weapon' && r[2] === 'epic')[0];
const RARE = cat.find((r) => r[1] === 'armor' && r[2] === 'rare')[0];
const MAT = 'ember_core';
const QUEST_ITEM = 'tyrant_crown';

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
const snapOf = async (uid, id) => (await pool.query('select snapshot, saved_at from public.characters where user_id = $1 and id = $2', [uid, id])).rows[0];
const count = (snap, item) => snap.slices.inventory.slots.reduce((n, s) => n + (s?.itemId === item ? s.qty : 0), 0) + (snap.slices.inventory.mats?.[item] ?? 0);

function snapshot({ level = 30, gold = 0, slots = [], mats = {}, mounts = [], playTime = 36000 } = {}) {
  const bag = Array(36).fill(null);
  slots.forEach((s, i) => { bag[i] = s; });
  return {
    meta: { accountId: 'x', characterId: 'x', createdAt: 1, savedAt: 1, playTime, version: 1 },
    slices: {
      character: { name: 'Held', raceId: 'human', classId: 'warrior', mounts: { owned: mounts, active: mounts[0] ?? null, riding: !!mounts[0] } },
      progress: { level, xp: 0 }, inventory: { slots: bag, equipment: {}, mats, questBag: [] }, wallet: { gold },
    },
  };
}

// ---------------------------------------------------------------- Ausgangslage
await pool.query('delete from public.market_mail; delete from public.market_listings; delete from public.market_rate; delete from public.character_flags');
await pool.query("delete from auth.users where email like '%@markt.test'");
const users = {};
for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) users[n] = (await pool.query(`insert into auth.users (email) values ($1) returning id`, [`${n}@markt.test`])).rows[0].id;
const { a: A, b: B, c: C, d: D, e: E, f: F, g: G } = users;
// Konten, die schon seit gestern handeln (Kontingent wächst erst ab dem ersten vollen Tag); G ist neu
await pool.query('insert into public.market_accounts (user_id, started) select unnest($1::uuid[]), current_date - 1', [[A, B, C, D, E, F]]);
const put = (uid, id, snap, verified = 36000) => pool.query(`insert into public.characters (user_id, id, name, level, snapshot, play_verified) values ($1, $2, 'Held', 30, $3, $4)
  on conflict (user_id, id) do update set snapshot = excluded.snapshot, play_verified = excluded.play_verified`, [uid, id, snap, verified]);
const owned = async (uid, id, item) => (await pool.query('select qty from public.market_owned where user_id = $1 and character_id = $2 and item_id = $3', [uid, id, item])).rows[0]?.qty ?? 0;
const freshUsed = async (uid) => (await pool.query('select fresh from public.market_accounts where user_id = $1', [uid])).rows[0]?.fresh ?? 0;
await put(A, 'ca', snapshot({ gold: 1000, slots: [{ itemId: EPIC, qty: 1 }, { itemId: RARE, qty: 1 }, { itemId: QUEST_ITEM, qty: 1 }], mats: { [MAT]: 30 }, mounts: ['marsh_strider', 'steppe_horse'] }));
await put(B, 'cb', snapshot({ gold: 100000 }));
await put(C, 'cc', snapshot({ gold: 50000 }));

// ---------------------------------------------------------------- Einstellen
let r = await rpc(A, 'market_list', { p_character: 'ca', p_item: EPIC, p_qty: 1, p_start_bid: null, p_buyout: 1000, p_hours: 24 });
ok(r.ok && r.seq === 1 && r.remove?.[0]?.itemId === EPIC, `Einstellen ok, Buchung 1: ${JSON.stringify(r)}`);
const L1 = r.listing;
let sa = await snapOf(A, 'ca');
ok(count(sa.snapshot, EPIC) === 0 && sa.snapshot.slices.market.seq === 1 && sa.snapshot.meta.savedAt === r.savedAt, 'Gegenstand ist aus dem gespeicherten Spielstand entfernt');
ok(Date.parse(sa.saved_at.toISOString()) === r.savedAt, 'saved_at entspricht savedAt (Cloud-Abgleich erkennt die Buchung)');
ok(await freshUsed(A) === 10, 'Eigene epische Beute kostet 10 Punkte Handelskontingent');
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: EPIC, p_qty: 1, p_start_bid: null, p_buyout: 1000, p_hours: 24 });
ok(!r.ok && r.error === 'missing', 'Derselbe Gegenstand lässt sich kein zweites Mal einstellen');
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: QUEST_ITEM, p_qty: 1, p_start_bid: null, p_buyout: 10, p_hours: 24 });
ok(!r.ok && r.error === 'item', 'Questgegenstand ist nicht handelbar');
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: RARE, p_qty: 1, p_start_bid: 500, p_buyout: 100, p_hours: 24 });
ok(!r.ok && r.error === 'price', 'Sofortkauf unter Startgebot abgelehnt');
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: RARE, p_qty: 1, p_start_bid: 100, p_buyout: null, p_hours: 7 });
ok(!r.ok && r.error === 'hours', 'Ungültige Laufzeit abgelehnt');
r = await rpc(A, 'market_list', { p_character: 'cb', p_item: RARE, p_qty: 1, p_start_bid: 100, p_buyout: null, p_hours: 12 });
ok(!r.ok && r.error === 'character', 'Fremder Charakter wird nicht gefunden');

// ---------------------------------------------------------------- Alter Spielstand
const stale = snapshot({ gold: 1000, slots: [{ itemId: EPIC, qty: 1 }], mounts: ['marsh_strider'] });
await asUser(A, 'update public.characters set snapshot = $1 where id = $2', [stale, 'ca']);
sa = await snapOf(A, 'ca');
ok(count(sa.snapshot, EPIC) === 0, 'Älterer Spielstand (ohne Buchung) wird beim Hochladen abgelehnt');
ok((await pool.query("select count(*)::int n from public.character_flags where user_id = $1 and reason = 'handel'", [A])).rows[0].n === 1, 'Ablehnung ist vermerkt (handel)');
const forged = snapshot({ gold: 1000, slots: [{ itemId: EPIC, qty: 1 }], mounts: ['marsh_strider'] }); forged.slices.market = { seq: 999999 };
await asUser(A, 'update public.characters set snapshot = $1 where id = $2', [forged, 'ca']);
ok(count((await snapOf(A, 'ca')).snapshot, EPIC) === 0, 'Alter Spielstand mit erfundenem hohem Zähler wird abgelehnt');
const fresh = structuredClone(sa.snapshot); fresh.meta.playTime += 5;
await asUser(A, 'update public.characters set snapshot = $1 where id = $2', [fresh, 'ca']);
ok((await snapOf(A, 'ca')).snapshot.meta.playTime === fresh.meta.playTime, 'Spielstand mit aktueller Buchung wird angenommen');

// ---------------------------------------------------------------- Sofortkauf (gleichzeitig)
r = await rpc(A, 'market_buyout', { p_character: 'ca', p_listing: L1 });
ok(!r.ok && r.error === 'own', 'Eigenes Angebot kann man nicht kaufen');
const both = await Promise.all([rpc(B, 'market_buyout', { p_character: 'cb', p_listing: L1 }), rpc(C, 'market_buyout', { p_character: 'cc', p_listing: L1 })]);
ok(both.filter((x) => x.ok).length === 1 && both.some((x) => x.error === 'gone'), `Zwei gleichzeitige Käufe: genau einer gewinnt (${both.map((x) => x.ok || x.error).join(', ')})`);
const winner = both[0].ok ? [B, 'cb', 100000] : [C, 'cc', 50000];
const ws = await snapOf(winner[0], winner[1]);
ok(ws.snapshot.slices.wallet.gold === winner[2] - 1000 && count(ws.snapshot, EPIC) === 1, 'Käufer: Gold abgezogen, Gegenstand in der Tasche');
ok(await owned(winner[0], winner[1], EPIC) === 1, 'Gekaufter Gegenstand steht im Bestand des Käufers');
r = await rpc(winner[0], 'market_list', { p_character: winner[1], p_item: EPIC, p_qty: 1, p_start_bid: null, p_buyout: 1500, p_hours: 12 });
ok(r.ok && await owned(winner[0], winner[1], EPIC) === 0 && await freshUsed(winner[0]) === 0, 'Wiederverkauf aus dem Bestand kostet kein Kontingent');
await rpc(winner[0], 'market_cancel', { p_character: winner[1], p_listing: r.listing });
ok(await owned(winner[0], winner[1], EPIC) === 1, 'Zurückgezogen: wieder im Bestand');
let mail = (await pool.query('select * from public.market_mail where user_id = $1', [A])).rows;
ok(mail.length === 1 && mail[0].kind === 'sold' && +mail[0].gold === 950, `Verkäufer: 950 Gold (5 % Gebühr) im Abholfach: ${JSON.stringify(mail.map((m) => [m.kind, m.gold]))}`);

// ---------------------------------------------------------------- Gebote
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: MAT, p_qty: 20, p_start_bid: 200, p_buyout: 5000, p_hours: 12 });
const matCost = freshCost(cat.find((x) => x[0] === MAT)[2], 20);
ok(r.ok && matCost > freshCost(cat.find((x) => x[0] === MAT)[2], 1) && await freshUsed(A) === 10 + matCost, `Materialien einstellen: Kontingent zählt je Stück (${await freshUsed(A)})`);
const L2 = r.listing;
sa = await snapOf(A, 'ca');
ok(sa.snapshot.slices.inventory.mats[MAT] === 10, 'Materialbeutel: 30 → 10');
r = await rpc(B, 'market_bid', { p_character: 'cb', p_listing: L2, p_amount: 150 });
ok(!r.ok && r.error === 'low', 'Gebot unter Startgebot abgelehnt');
const gb0 = (await snapOf(B, 'cb')).snapshot.slices.wallet.gold;
r = await rpc(B, 'market_bid', { p_character: 'cb', p_listing: L2, p_amount: 200 });
ok(r.ok && r.gold === -200 && (await snapOf(B, 'cb')).snapshot.slices.wallet.gold === gb0 - 200, 'Gebot 200: Gold sofort abgezogen');
r = await rpc(C, 'market_bid', { p_character: 'cc', p_listing: L2, p_amount: 205 });
ok(!r.ok && r.error === 'low', 'Erhöhung unter 5 % abgelehnt');
const gc0 = (await snapOf(C, 'cc')).snapshot.slices.wallet.gold;
r = await rpc(C, 'market_bid', { p_character: 'cc', p_listing: L2, p_amount: 300 });
ok(r.ok, 'C überbietet mit 300');
mail = (await pool.query("select * from public.market_mail where user_id = $1 and kind = 'outbid'", [B])).rows;
ok(mail.length === 1 && +mail[0].gold === 200, 'B bekommt 200 Gold ins Abholfach');
r = await rpc(C, 'market_bid', { p_character: 'cc', p_listing: L2, p_amount: 400 });
ok(r.ok && r.gold === -100, 'Eigenes Höchstgebot erhöhen kostet nur die Differenz');
r = await rpc(B, 'market_bid', { p_character: 'cb', p_listing: L2, p_amount: 6000 });
ok(!r.ok && r.error === 'buyout', 'Gebot ab Sofortkaufpreis: lieber sofort kaufen');
r = await rpc(B, 'market_bid', { p_character: 'cb', p_listing: L2, p_amount: 99999999 });
ok(!r.ok && (r.error === 'price' || r.error === 'buyout'), 'Absurdes Gebot abgelehnt');
// gleichzeitig bieten: Gold darf nicht doppelt weg
const gb1 = (await snapOf(B, 'cb')).snapshot.slices.wallet.gold;
const par = await Promise.all([1, 2, 3].map((i) => rpc(B, 'market_bid', { p_character: 'cb', p_listing: L2, p_amount: 420 + i * 30 })));
const gb2 = (await snapOf(B, 'cb')).snapshot.slices.wallet.gold;
const lst = (await pool.query('select * from public.market_listings where id = $1', [L2])).rows[0];
ok(gb1 - gb2 === +lst.bid && lst.bidder_user === B, `Gleichzeitige Gebote: abgezogen = Höchstgebot (${gb1 - gb2} = ${lst.bid}; ${par.map((x) => x.ok || x.error).join(', ')})`);
// Ablauf
await pool.query("update public.market_listings set ends_at = now() - interval '1 second' where id = $1", [L2]);
const ov = await rpc(B, 'market_overview', { p_character: 'cb' });
ok(ov.ok && ov.mail.some((m) => m.kind === 'won' && m.itemId === MAT && m.qty === 20), 'Abgelaufen: Höchstbietender gewinnt (Abholfach)');
r = await rpc(B, 'market_collect', { p_character: 'cb' });
const sb = await snapOf(B, 'cb');
ok(r.ok && r.collected >= 2 && sb.snapshot.slices.inventory.mats[MAT] === 20 && r.add.some((x) => x.itemId === MAT), `Abholen: Material + Rückzahlung (${JSON.stringify(r)})`);
r = await rpc(B, 'market_collect', { p_character: 'cb' });
ok(r.ok && r.collected === 0, 'Zweites Abholen bringt nichts');
const gc1 = (await snapOf(C, 'cc')).snapshot.slices.wallet.gold;
await rpc(C, 'market_collect', { p_character: 'cc' });
ok((await snapOf(C, 'cc')).snapshot.slices.wallet.gold === gc1 + 400, 'C (überboten) bekommt 400 zurück');
ok(gc0 === gc1 + 400, 'C hat am Ende nichts verloren');

// ---------------------------------------------------------------- Reittiere
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: 'mount_marsh_strider', p_qty: 1, p_start_bid: null, p_buyout: 20000, p_hours: 48, p_mount: true });
sa = await snapOf(A, 'ca');
ok(r.ok && r.forgetMount === 'marsh_strider' && !sa.snapshot.slices.character.mounts.owned.includes('marsh_strider'), 'Gelerntes Reittier einstellen: vergessen');
ok(sa.snapshot.slices.character.mounts.active === 'steppe_horse' && sa.snapshot.slices.character.mounts.riding === false, 'Aktives Reittier wechselt, absitzen');
r = await rpc(A, 'market_list', { p_character: 'ca', p_item: 'mount_golden_stag', p_qty: 1, p_start_bid: null, p_buyout: 20000, p_hours: 48, p_mount: true });
ok(!r.ok && r.error === 'item', 'Erfolgs-Reittier ist nicht handelbar');
r = await rpc(A, 'market_cancel', { p_character: 'ca', p_listing: (await pool.query("select id from public.market_listings where item_id = 'mount_marsh_strider' and status = 'active'")).rows[0].id });
sa = await snapOf(A, 'ca');
ok(r.ok && r.learn === 'marsh_strider' && sa.snapshot.slices.character.mounts.owned.includes('marsh_strider'), 'Zurückziehen: Reittier wieder gelernt');
ok(await owned(A, 'ca', 'mount_marsh_strider') === 1, 'Zurückgegebenes Reittier steht im Bestand');

// ---------------------------------------------------------------- Gold-Obergrenze der Plausibilitätsprüfung
r = await rpc(A, 'market_collect', { p_character: 'ca' });
const earned = 950 + (+lst.bid - Math.floor(+lst.bid * 0.05));
ok(r.ok && r.gold === earned, `A holt beide Erlöse ab (${r.gold} = ${earned})`);
await pool.query('update public.characters set play_verified = 0, updated_at = now() where user_id = $1', [A]);
sa = await snapOf(A, 'ca');
const up = (gold) => { const s = structuredClone(sa.snapshot); s.slices.wallet.gold = gold; return s; };
await asUser(A, 'update public.characters set snapshot = $1 where id = $2', [up(50000), 'ca']);
ok((await snapOf(A, 'ca')).snapshot.slices.wallet.gold === 50000, 'Gold bis zur Obergrenze wird angenommen');
await asUser(A, 'update public.characters set snapshot = $1 where id = $2', [up(50000 + earned), 'ca']);
ok((await snapOf(A, 'ca')).snapshot.slices.wallet.gold === 50000, 'Auktionserlös hebt die Gold-Obergrenze nicht an');
const flagsA = (await pool.query('select reason from public.character_flags where user_id = $1', [A])).rows.map((x) => x.reason);
ok(flagsA.includes('handel') && flagsA.includes('gold'), `Handelsvermerk verdrängt den Gold-Vermerk nicht (${flagsA.join(', ')})`);
await pool.query('delete from public.character_flags where user_id = $1', [A]);
await pool.query('update public.characters set play_verified = 36000 where user_id = $1', [A]);

// ---------------------------------------------------------------- Handelsfreigabe, Kontingent, Goldrahmen
const LEG = cat.filter((x) => x[1] === 'weapon' && x[2] === 'legendary' && x[3] <= 30).map((x) => x[0]);
const HIGH = cat.find((x) => x[1] === 'armor' && x[2] === 'rare' && x[3] >= 30)[0];
await put(D, 'cd', snapshot({ level: 9, gold: 600000, slots: [{ itemId: RARE, qty: 1 }] }));
r = await rpc(D, 'market_list', { p_character: 'cd', p_item: RARE, p_qty: 1, p_start_bid: 10, p_buyout: null, p_hours: 12 });
ok(!r.ok && r.error === 'young', 'Unter Stufe 10 kein Handel');
await put(D, 'cd', snapshot({ level: 30, gold: 600000, slots: [{ itemId: RARE, qty: 1 }] }), 1800);
r = await rpc(D, 'market_list', { p_character: 'cd', p_item: RARE, p_qty: 1, p_start_bid: 10, p_buyout: null, p_hours: 12 });
ok(!r.ok && r.error === 'young', 'Unter einer Stunde geprüfter Spielzeit kein Handel');
await put(D, 'cd', snapshot({ level: 12, gold: 600000, slots: [{ itemId: HIGH, qty: 1 }, ...LEG.slice(0, 3).map((itemId) => ({ itemId, qty: 1 }))] }), 3600);
r = await rpc(D, 'market_list', { p_character: 'cd', p_item: HIGH, p_qty: 1, p_start_bid: 10, p_buyout: null, p_hours: 12 });
ok(!r.ok && r.error === 'level', 'Eigene Beute weit über der eigenen Stufe ist nicht einstellbar');
await put(D, 'cd', snapshot({ level: 30, gold: 600000, slots: LEG.slice(0, 3).map((itemId) => ({ itemId, qty: 1 })) }), 3600);
const legs = [];
for (const it of LEG.slice(0, 3)) legs.push(await rpc(D, 'market_list', { p_character: 'cd', p_item: it, p_qty: 1, p_start_bid: null, p_buyout: 560000, p_hours: 12 }));
ok(legs[0].ok && legs[1].ok && !legs[2].ok && legs[2].error === 'budget', `Kontingent nach 1 Stunde: zwei legendäre, das dritte nicht (${legs.map((x) => x.ok || x.error).join(', ')})`);
r = await rpc(D, 'market_buyout', { p_character: 'cd', p_listing: L1 });
ok(!r.ok && r.error === 'gone', 'Verkauftes Angebot ist weg');
await put(C, 'cc', snapshot({ gold: 600000 }), 3600);
await pool.query('delete from public.character_flags where user_id = $1', [C]);
r = await rpc(C, 'market_buyout', { p_character: 'cc', p_listing: legs[0].listing });
ok(!r.ok && r.error === 'frame', 'Kaufen nur im Goldrahmen der Spielzeit (Freibetrag zählt nicht)');
await put(C, 'cc', snapshot({ gold: 600000 }), 36000);
r = await rpc(C, 'market_buyout', { p_character: 'cc', p_listing: legs[0].listing });
ok(r.ok, 'Mit genug geprüfter Spielzeit klappt der Kauf');
const gd0 = (await snapOf(D, 'cd')).snapshot.slices.wallet.gold;
r = await rpc(D, 'market_collect', { p_character: 'cd' });
ok(r.ok && r.collected === 0 && r.capped === 1 && (await snapOf(D, 'cd')).snapshot.slices.wallet.gold === gd0, 'Erlös über dem Goldrahmen bleibt im Abholfach');
await pool.query("update public.characters set play_verified = 36000 where user_id = $1", [D]);
r = await rpc(D, 'market_collect', { p_character: 'cd' });
ok(r.ok && r.collected === 1 && r.capped === 0, 'Mit mehr Spielzeit lässt er sich abholen');

// Goldrahmen gilt für das Konto und alle Käufe zusammen; Rückzahlungen nur bis zur Gold-Obergrenze.
const R2 = cat.filter((x) => x[1] === 'armor' && x[2] === 'rare' && x[3] <= 30).slice(0, 2).map((x) => x[0]);
await put(F, 'cf', snapshot({ slots: R2.map((itemId) => ({ itemId, qty: 1 })) }));
const fl = [];
for (const it of R2) fl.push(await rpc(F, 'market_list', { p_character: 'cf', p_item: it, p_qty: 1, p_start_bid: null, p_buyout: 600000, p_hours: 12 }));
await put(E, 'ce', snapshot({ gold: 600000 }), 3600);
await put(E, 'ce2', snapshot({ gold: 600000 }), 3600);
r = await rpc(E, 'market_buyout', { p_character: 'ce', p_listing: fl[0].listing });
ok(fl[0].ok && fl[1].ok && r.ok, 'Erster Kauf im Goldrahmen');
r = await rpc(E, 'market_buyout', { p_character: 'ce2', p_listing: fl[1].listing });
ok(!r.ok && r.error === 'frame', 'Zweiter Kauf (anderer Charakter, gleiches Konto) sprengt den Goldrahmen');
await pool.query("insert into public.market_mail (user_id, character_id, kind, gold) values ($1, 'ce', 'outbid', 700000)", [E]);
r = await rpc(E, 'market_collect', { p_character: 'ce' });
ok(r.ok && r.capped === 1 && r.collected === 0, 'Rückzahlung über der Gold-Obergrenze bleibt im Abholfach');
await pool.query("update public.characters set updated_at = now() - interval '1 hour' where user_id = $1 and id = 'ce'", [E]);
const ua0 = (await pool.query("select updated_at from public.characters where user_id = $1 and id = 'ce'", [E])).rows[0].updated_at;
r = await rpc(E, 'market_list', { p_character: 'ce', p_item: R2[0], p_qty: 1, p_start_bid: null, p_buyout: 1000, p_hours: 12 });
const ua1 = (await pool.query("select updated_at from public.characters where user_id = $1 and id = 'ce'", [E])).rows[0].updated_at;
ok(r.ok && +ua0 === +ua1, 'Buchung lässt den Zeitpunkt der Spielzeitprüfung unverändert');

// Neues Konto: am ersten Tag nur das Grundkontingent, egal wie viel Spielzeit seine Charaktere haben
const EP3 = cat.filter((x) => x[1] === 'weapon' && x[2] === 'epic' && x[3] <= 30 && x[0] !== EPIC).slice(0, 3).map((x) => x[0]);
await put(G, 'cg', snapshot({ slots: EP3.map((itemId) => ({ itemId, qty: 1 })) }));
await put(G, 'cg2', snapshot({}));
const g3 = [];
for (const it of EP3) g3.push(await rpc(G, 'market_list', { p_character: 'cg', p_item: it, p_qty: 1, p_start_bid: 100, p_buyout: null, p_hours: 12 }));
ok(g3[0].ok && g3[1].ok && g3[2].error === 'budget', `Neues Konto: Vorschuss zählt nicht fürs Kontingent (${g3.map((x) => x.ok || x.error).join(', ')})`);

// ---------------------------------------------------------------- Tempo beim Ansehen
let look = null;
for (let i = 0; i < 121; i++) look = await rpc(G, 'market_browse', { p_character: 'cg' });
ok(!look.ok && look.error === 'rate', 'Suche: höchstens 120 Aufrufe je Minute');
r = await rpc(G, 'market_overview', { p_character: 'cg' });
ok(!r.ok && r.error === 'rate', 'Übersicht zählt mit');
await pool.query('update public.market_rate set look_minute = null where user_id = $1', [G]);

// ---------------------------------------------------------------- Rechte
for (const t of ['market_listings', 'market_mail', 'market_chars', 'market_items', 'market_owned', 'market_accounts']) {
  let denied = false;
  try { await asUser(B, `select * from public.${t} limit 1`); } catch { denied = true; }
  ok(denied, `Spieler können ${t} nicht direkt lesen`);
}
for (const [sql, what] of [
  ["select public.market_commit($1, 'cb', '{}'::jsonb, 1000000)", 'market_commit'],
  ["select public.characters_market_seq($1, 'cb')", 'characters_market_seq'],
  ["select public.market_own_add($1, 'cb', 'ember_core', 99)", 'market_own_add'],
  ["select public.market_settle(10, $1)", 'market_settle'],
]) {
  let denied = false;
  try { await asUser(B, sql, [B]); } catch { denied = true; }
  ok(denied, `Direkter Aufruf ${what} abgewiesen`);
}
let anonDenied = false;
try { const c = await pool.connect(); try { await c.query('begin; set local role anon'); await c.query("select public.market_browse('x')"); } finally { await c.query('rollback'); c.release(); } } catch { anonDenied = true; }
ok(anonDenied, 'Ohne Anmeldung kein Zugriff');

// ---------------------------------------------------------------- Suche
await rpc(A, 'market_list', { p_character: 'ca', p_item: RARE, p_qty: 1, p_start_bid: 50, p_buyout: null, p_hours: 12 });
r = await rpc(B, 'market_browse', { p_character: 'cb', p_category: 'armor' });
ok(r.ok && r.rows.some((x) => x.itemId === RARE && x.mine === false) && r.rows.every((x) => cat.find((y) => y[0] === x.itemId)?.[1] === 'armor'), 'Suche nach Kategorie');
r = await rpc(B, 'market_browse', { p_character: 'cb', p_items: [EPIC] });
ok(r.ok && r.rows.length === 0, 'Suche nach Namen (Gegenstandsliste)');
r = await rpc(A, 'market_browse', { p_character: 'ca', p_min_rarity: 3 });
ok(r.ok && r.rows.length > 0 && r.rows.every((x) => x.itemId !== RARE && x.itemId !== MAT), 'Seltenheitsfilter');

// ---------------------------------------------------------------- Sperre bei Schummel-Vermerk
await pool.query("insert into public.character_flags (user_id, character_id, reason) values ($1, 'cc', 'gold')", [C]);
r = await rpc(C, 'market_bid', { p_character: 'cc', p_listing: (await pool.query("select id from public.market_listings where item_id = $1 and status = 'active'", [RARE])).rows[0].id, p_amount: 60 });
ok(!r.ok && r.error === 'blocked', 'Konto mit Schummel-Vermerk darf nicht handeln');

// ---------------------------------------------------------------- Katalog
const banned = (await pool.query(`select id from public.market_items where id in ('mount_hellhound', 'mount_rimewing', 'mount_golden_stag', 'mount_ember_scarab')
  or id in (select 'mount_' || substr(key, 7) from public.shop_exclusive_items where key like 'mount:%')`)).rows;
ok(banned.length === 0, `Keine legendären, Erfolgs- oder Shop-Reittiere im Katalog (${banned.map((x) => x.id).join(', ')})`);

// ---------------------------------------------------------------- Neuer Charakter mit Slice market
const fresh0 = JSON.parse(`{"meta":{"accountId":"sb_u1","characterId":"chr_n","createdAt":1,"savedAt":1,"playTime":1,"version":1},"slices":{"character":{"name":"Neu","raceId":"human","classId":"warrior","appearance":{"variant":1,"dye":null,"hairStyle":null},"talents":{},"mounts":{"owned":[],"active":null,"riding":false},"wardrobe":{"looks":["notched_blade","recruit_mail"],"shown":{}}},"world":{"zoneId":"emberhollow","spawnId":"start","pos":null,"flags":{},"bossesDefeated":[]},"progress":{"level":1,"xp":0,"xpNext":100,"stats":{}},"inventory":{"slots":[{"itemId":"minor_potion","qty":5},{"itemId":"hearth_bread","qty":3}],"equipment":{"weapon":"notched_blade","chest":"recruit_mail"},"upgrades":{},"enchants":{},"questBag":[],"mats":{},"autoSell":"common","bonus":{}},"wallet":{"gold":0},"quests":{"active":{},"completed":[],"repeats":{},"choices":{},"tracked":null,"guide":null},"rares":{"killedAt":{},"kills":{}},"bank":{"size":16,"slots":[]},"achievements":{"unlocked":{},"title":null,"rewarded":{}},"trials":{"best":0,"runs":0,"cleared":{},"bosses":{},"run":null},"board":{"day":1,"level":1,"week":1,"taken":{},"done":[],"weekDone":0,"weekClaimed":false},"daily":{"day":0},"shop":{"credited":[],"revoked":[],"owned":[]},"market":{"seq":0}}}`);
await asUser(B, `insert into public.characters (user_id, id, name, class_id, level, snapshot) values ($1, 'cnew', 'Neu', 'warrior', 1, $2)`, [B, fresh0]);
ok(!!(await snapOf(B, 'cnew')), 'Neuer Charakter mit Slice market wird angenommen (Startpaket-Prüfung)');

await pool.end();
console.log(fails ? `${fails} Fehler` : 'Alles grün');
process.exit(fails ? 1 : 0);
