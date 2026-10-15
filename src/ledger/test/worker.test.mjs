// Fortschrittsbuch von Ende zu Ende: echtes Spiel (harness.mjs) → Worker (worker/ledger.js) → echte Postgres 16 mit allen
// Migrationen (wie db.test.mjs). Die REST-Aufrufe des Workers laufen über einen kleinen PostgREST-Nachbau mit der Rolle
// service_role (prüft so auch die Rechte); Hochladen wie CloudSync mit der Rolle authenticated.
//   PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/ledger/test/worker.test.mjs   (braucht das npm-Paket pg)
import pg from 'pg';
import { handleLedger } from '../../../worker/ledger.js';
import { setWorldFeatures, questStatus } from '../../progression/selectors.js';
import { valuesOf } from '../values.js';
import { makeGame, playQuest, housekeeping, kill } from './harness.mjs';

pg.types.setTypeParser(20, Number); // bigint wie PostgREST als Zahl
const pool = new pg.Pool({ host: process.env.PGHOST ?? '/var/run/postgresql', port: +(process.env.PGPORT ?? 5432), user: 'postgres', database: process.env.PGDATABASE ?? 'sbtest' });
let fails = 0;
const ok = (c, m, extra) => { console.log(c ? '✓' : '✗', m); if (!c) { fails++; if (extra !== undefined) console.log('   ', JSON.stringify(extra)); } };

// ---------------------------------------------------------------- Supabase-Nachbau (Auth + REST als service_role)
const SB = 'https://sb.test';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWTS = new Map();
const jwt = (sub) => JWTS.get(sub) ?? JWTS.set(sub, mint(sub)).get(sub);
const mint = (sub) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, email: 'x@buch.test', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated', iss: `${SB}/auth/v1` })}.c2ln`;
const TOKENS = new Map();
let restCalls = 0;
const COLS = /^[a-z_]+(,[a-z_]+)*$/;
async function rest(method, url, body, prefer = '') {
  const table = url.pathname.replace('/rest/v1/', '');
  if (!/^[a-z_]+$/.test(table)) throw new Error('Tabelle ' + table);
  const where = [], args = [];
  let select = '*', conflict = null;
  for (const [k, v] of url.searchParams) {
    if (k === 'select') { if (!COLS.test(v)) throw new Error('select ' + v); select = v; continue; }
    if (k === 'on_conflict') { conflict = v; continue; }
    if (k === 'limit') continue;
    if (!/^[a-z_]+$/.test(k)) throw new Error('Spalte ' + k);
    if (v.startsWith('eq.')) { args.push(v.slice(3)); where.push(`${k}::text = $${args.length}`); }
    else if (v.startsWith('in.(')) { args.push(v.slice(4, -1).split(',')); where.push(`${k}::text = any($${args.length})`); }
    else throw new Error('Filter ' + v);
  }
  const w = where.length ? ` where ${where.join(' and ')}` : '';
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role service_role');
    let r;
    if (method === 'GET') r = await c.query(`select ${select} from public.${table}${w}`, args);
    else if (method === 'POST') {
      const rows = [].concat(body), cols = Object.keys(rows[0]);
      const vals = rows.map((o) => `(${cols.map((col) => { args.push(o[col] !== null && typeof o[col] === 'object' ? JSON.stringify(o[col]) : o[col]); return `$${args.length}`; }).join(',')})`);
      r = await c.query(`insert into public.${table} (${cols.join(',')}) values ${vals.join(',')}${conflict && /ignore-duplicates/.test(prefer) ? ` on conflict (${conflict}) do nothing` : ''} returning *`, args);
    } else if (method === 'PATCH') {
      const sets = Object.entries(body).map(([col, v]) => { args.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return `${col} = $${args.length}`; });
      r = await c.query(`update public.${table} set ${sets.join(', ')}${w} returning *`, args);
    } else throw new Error(method);
    await c.query('commit');
    return /return=minimal/.test(prefer) ? null : r.rows;
  } catch (e) { await c.query('rollback'); return { error: e }; } finally { c.release(); }
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const res = (d, s = 200) => new Response(d == null ? '' : JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.pathname === '/auth/v1/user') {
    const uid = TOKENS.get((init.headers?.authorization ?? '').replace('Bearer ', ''));
    return uid ? res({ id: uid, email: 'x@buch.test' }) : res({ msg: 'bad' }, 401);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    restCalls++;
    const out = await rest(init.method ?? 'GET', url, init.body ? JSON.parse(init.body) : null, init.headers?.prefer ?? '');
    if (out?.error) return res({ code: out.error.code, message: out.error.message }, out.error.code === '42501' ? 403 : 400);
    return res(out);
  }
  throw new Error('fetch ' + url);
};
const ENV = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_x', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
async function buch(uid, body, env = ENV) {
  const r = await handleLedger(new Request('https://www.emberwrath.com/net/buch', { method: 'POST', headers: { authorization: `Bearer ${jwt(uid)}` }, body: JSON.stringify(body) }), env, new URL('https://www.emberwrath.com/net/buch'));
  return { status: r.status, body: await r.json() };
}

// ---------------------------------------------------------------- Hochladen wie CloudSync
let PT = 3600;
async function upload(uid, g) {
  const snap = g.state.snapshot();
  snap.meta = { ...snap.meta, playTime: (PT += 3600), savedAt: Date.now(), ledger: undefined };
  const c = await pool.connect();
  try {
    await c.query('set session_replication_role = replica'); // letzter Upload vor einem Tag (characters_plausible)
    await c.query("update public.characters set updated_at = now() - interval '1 day' where user_id = $1 and id = $2", [uid, g.state.meta.characterId]);
    await c.query('set session_replication_role = origin');
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const at = new Date(snap.meta.savedAt);
    const r = await c.query(`insert into public.characters (user_id, id, name, race_id, class_id, level, snapshot, saved_at)
      values ($1, $2, 'Sim', 'human', $3, $4, $5, $6)
      on conflict (user_id, id) do update set snapshot = excluded.snapshot, saved_at = excluded.saved_at, level = excluded.level, class_id = excluded.class_id
      returning saved_at, snapshot`, [uid, g.state.meta.characterId, g.classId, g.state.slices.progress.level, snap, at]);
    await c.query('commit');
    const row = r.rows[0];
    return row ? { kept: +row.saved_at === +at, snapshot: row.snapshot } : null;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
async function send(uid, g) {
  const cid = g.state.meta.characterId, sid = g.tap.session.sid;
  let last = null;
  const q = g.tap.queue.filter((e) => e.s === sid);
  for (let i = 0; i < q.length; i += 200) {
    last = await buch(uid, { c: cid, s: sid, e: q.slice(i, i + 200) });
    if (last.status !== 200) return last;
    g.tap.confirm(sid, last.body.k);
  }
  return last;
}
const book = async (uid, cid) => (await pool.query('select xp, gold, items, state from public.character_ledger where user_id = $1 and character_id = $2', [uid, cid])).rows[0];

// ---------------------------------------------------------------- Ablauf
await pool.query("delete from public.character_flags; delete from auth.users where email like '%@buch.test'");
await pool.query('update public.ledger_config set strict_after = null, enforce = true where id = 1');
const UID = (await pool.query("insert into auth.users (email) values ('sim@buch.test') returning id")).rows[0].id;
const OTHER = (await pool.query("insert into auth.users (email) values ('fremd@buch.test') returning id")).rows[0].id;
TOKENS.set(jwt(UID), UID);
TOKENS.set(jwt(OTHER), OTHER);

const g = makeGame({ classId: 'mage', session: false, clock: { t: Date.now() - 6 * 3600e3 } });
g.state.meta.characterId = 'sim1';
setWorldFeatures(['escort', 'defend']);
// Charakter aus der Zeit vor dem Buch (Server legt ihn an)
await pool.query(`insert into public.characters (user_id, id, name, class_id, race_id, level, snapshot) values ($1, 'sim1', 'Sim', 'mage', 'human', 1, $2)`, [UID, g.state.snapshot()]);

{
  const r = await buch(UID, { c: 'sim1', open: true });
  ok(r.status === 200 && r.body.fresh === true, 'Erster Start mit Buch: Server will erst einen Stand', r);
  const r404 = await buch(UID, { c: 'gibtsnicht', open: true });
  ok(r404.status === 404 && r404.body.error === 'nochar', 'Unbekannter Charakter: 404 nochar', r404);
  const f = await buch(OTHER, { c: 'sim1', open: true });
  ok(f.status === 404, 'Fremdes Konto kommt nicht an das Buch', f);
  const up = await upload(UID, g);
  ok(up?.kept, 'Hochladen im Übergang');
  const o = await buch(UID, { c: 'sim1', open: true, base: true });
  ok(o.status === 200 && /^[0-9a-f]{16}$/.test(o.body.sid) && /^[0-9a-f]{32}$/.test(o.body.seed), 'Sitzung mit Würfeln des Servers', o);
  g.tap.open({ sid: o.body.sid, seed: o.body.seed, baseU: 0 });
  const cfg = (await pool.query('select strict_after from public.ledger_config')).rows[0];
  ok(!!cfg.strict_after, 'Übergang läuft ab der ersten Sitzung');
}

// Ehrlich spielen: Quests der ersten Stufen mit Beute, Haushalt
{
  const stats = { quests: 0, skipped: 0 };
  for (let i = 0; i < 12; i++) {
    const avail = g.content.all('quest').filter((q) => questStatus(g.state, g.content, q.id) === 'available' && !q.repeatable && q.level <= g.state.slices.progress.level + 2).sort((a, b) => a.level - b.level);
    if (!avail.length) break;
    playQuest(g, avail[0], stats);
    housekeeping(g);
  }
  const before = restCalls;
  const r = await send(UID, g);
  ok(r?.status === 200 && r.body.miss === 0 && g.tap.queue.length === 0, `Ehrlich: ${stats.quests} Quests, Stufe ${g.state.slices.progress.level}, alle Einträge angenommen`, r);
  console.log(`    ${restCalls - before} Datenbank-Aufrufe für ${Math.ceil(stats.quests)} Quests`);
  const b = await book(UID, 'sim1'), v = valuesOf(g.state.snapshot());
  ok(b.xp === v.xp && b.gold === v.gold && JSON.stringify(Object.entries(b.items).sort()) === JSON.stringify(Object.entries(v.items).sort()), 'Buch in der Datenbank = Spielstand', { b: { xp: b.xp, gold: b.gold }, v: { xp: v.xp, gold: v.gold } });
  const up = await upload(UID, g);
  ok(up?.kept, 'Ehrlicher Stand wird unverändert gespeichert');
  const again = await buch(UID, { c: 'sim1', s: g.tap.session.sid, e: [{ k: 1, t: 'progress:kill', d: { x: 99999 } }] });
  ok(again.status === 200 && (await book(UID, 'sim1')).xp === v.xp, 'Alte Nummer erneut gemeldet: zählt nicht');
}

// Schummeln
{
  await pool.query("update public.ledger_config set strict_after = now() + interval '2 days'");
  const gold = g.state.slices.wallet.gold;
  g.state.slices.wallet.gold += 4000;                                  // ohne Command, wie ein verändertes Spiel
  g.state.slices.inventory.slots[30] = { itemId: 'obsidian_edge', qty: 1 };
  const up = await upload(UID, g);
  ok(up && !up.kept && up.snapshot.slices.wallet.gold === gold && !up.snapshot.slices.inventory.slots[30], 'Erfundenes Gold und Gegenstand: Datenbank kappt auf das Buch', up && { gold: up.snapshot.slices.wallet.gold, want: gold });
  g.state.load(up.snapshot); // Spiel übernimmt den Cloud-Stand
  // Gefälschte Einträge: Gold und Gegenstand ohne Grund, Erfahrung ohne Kill
  const sid = g.tap.session.sid, k = g.tap.session.k;
  const fake = await buch(UID, { c: 'sim1', s: sid, e: [
    { u: 9001, s: sid, k: k + 1, t: 'wallet:addGold', p: { amount: 50000, source: 'loot' }, d: { g: 50000 }, now: Date.now() },
    { u: 9002, s: sid, k: k + 2, t: 'inventory:add', p: { itemId: 'obsidian_edge', qty: 1 }, d: { i: { obsidian_edge: 1 } }, now: Date.now() },
    { u: 9003, s: sid, k: k + 3, t: 'progress:kill', p: { type: 'ember_tyrant', level: 40 }, d: { x: 900000 }, now: Date.now() },
  ] });
  g.tap.session.k = k + 3;
  const b = await book(UID, 'sim1');
  ok(fake.body.miss === 3 && b.gold === gold && !b.items.obsidian_edge, 'Gefälschte Einträge kommen nicht ins Buch', { fake: fake.body, gold: b.gold });
  const bad = await buch(UID, { c: 'sim1', s: '0123456789abcdef', e: [{ k: 1 }] });
  ok(bad.status === 409, 'Unbekannte Sitzung: 409');
  const big = await buch(UID, { c: 'sim1', s: sid, e: Array(5000).fill({ k: 1, p: 'x'.repeat(100) }) });
  ok(big.status === 413, 'Zu große Meldung: 413');
}

// Nach dem Kappen weiterspielen: Buch und Stand bleiben gleich
{
  for (let i = 0; i < 20; i++) kill(g, 'wolf');
  const r = await send(UID, g);
  ok(r?.body.miss === 0, 'Nach dem Kappen: ehrliche Einträge passen wieder', r?.body);
  const up = await upload(UID, g);
  ok(up?.kept, 'und der nächste Stand wird unverändert gespeichert');
}

// Ohne Tabelle / ohne Secret: Spiel speichert wie bisher
{
  const off = await buch(UID, { c: 'sim1', open: true }, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' });
  ok(off.body.off === true, 'Ohne Secret Key: Buch aus');
  await pool.query('alter table public.character_ledger rename to character_ledger_x');
  const miss = await buch(UID, { c: 'sim1', open: true });
  await pool.query('alter table public.character_ledger_x rename to character_ledger');
  ok(miss.body.off === true, 'Ohne Tabelle (Migration fehlt): Buch aus', miss);
  await pool.query('revoke select on public.character_ledger from service_role');
  const deny = await buch(UID, { c: 'sim1', open: true }).catch((e) => ({ status: 500, body: { error: e.message } }));
  await pool.query('grant select on public.character_ledger to service_role');
  ok(deny.status >= 500 && !deny.body.off, 'Fehlende Rechte sind eine Störung, kein »aus« (sonst würde gekappt)', deny);
}

await pool.query("delete from auth.users where email like '%@buch.test'");
await pool.query('update public.ledger_config set strict_after = null, enforce = true where id = 1');
await pool.end();
console.log(fails ? `${fails} Fehler` : 'alle Ende-zu-Ende-Tests grün');
process.exit(fails ? 1 : 0);
