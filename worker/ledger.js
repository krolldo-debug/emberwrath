// Fortschrittsbuch des Servers (src/ledger/README.md). Das Spiel meldet je Command, was er an Erfahrung, Gold und
// Gegenständen verändert hat; hier prüfen die Regeln aus src/ledger/rules.js jeden Eintrag und führen das Buch in
// public.character_ledger. Die Datenbank kappt jeden hochgeladenen Spielstand auf das Buch
// (supabase/migrations/20261015120000_fortschrittsbuch.sql).
//   POST /net/buch   Authorization: Bearer <Supabase-Zugriffstoken>
//     { c: Charakter-ID, open: true, base? }     → { sid, seed }        neue Sitzung (Würfel für Beute und Belohnungen)
//                                                → { fresh: true }      Buch ohne Sitzung (neuer Held, erster Start mit Buch):
//                                                   erst hochladen, dann mit base öffnen (Buch beginnt mit diesem Stand)
//     { c: Charakter-ID, s: Sitzung, e: [ … ] }  → { k, miss }          Einträge bis k übernommen, miss = Abweichungen
//     → { off: true }      Buch noch nicht eingerichtet (Migration fehlt, kein Secret Key): Spiel speichert wie bisher
//     → 404 nochar         Charakter noch nicht in der Cloud (neuer Held vor dem ersten Hochladen)
//     → 409 session        Sitzung unbekannt (zu alt): Spiel öffnet eine neue
//   401 auth | 403 origin | 413 size | 422 invalid | 429 rate_limited
import { verifyToken } from './auth.js';
import { applyEntries, freshState, openSession, ordersNeeded, LIMITS } from '../src/ledger/rules.js';
import { valuesOf } from '../src/ledger/values.js';

const BODY_MAX = 400_000;
const CHAR_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SID_RE = /^[0-9a-f]{16}$/;
const ORDER_OK = new Set(['paid', 'credited', 'refunded', 'disputed']);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function originOk(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // Nicht-Browser (Tests); ohne gültiges Token kommt niemand weiter
  if (origin === url.origin) return true;
  return String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

const dbReady = (env) => Boolean(String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() && env.SUPABASE_URL);
class Missing extends Error {}
async function db(env, path, { method = 'GET', body, prefer } = {}) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const r = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    // Nur die Tabelle des Buchs fehlt (Migration noch nicht ausgeführt): Buch ist noch nicht eingerichtet.
    // Jeder andere Fehler (auch fehlende Rechte) ist eine Störung: Das Spiel lädt dann nichts hoch und versucht es später.
    if (path.startsWith('character_ledger') && (r.status === 404 || /PGRST205|42P01/.test(t))) throw new Missing(t.slice(0, 200));
    throw new Error(`db ${r.status} ${t.slice(0, 120)}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

const hexId = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const filter = (uid, cid) => `user_id=eq.${uid}&character_id=eq.${encodeURIComponent(cid)}`;

async function loadBook(env, uid, cid) {
  const [row] = await db(env, `character_ledger?${filter(uid, cid)}&select=xp,gold,items,state,ver`);
  return row ?? null;
}
async function loadChar(env, uid, cid, withSnapshot) {
  const [row] = await db(env, `characters?user_id=eq.${uid}&id=eq.${encodeURIComponent(cid)}&select=class_id${withSnapshot ? ',snapshot' : ''}`);
  return row ?? null;
}

// Buch lesen; fehlt der Merkzettel (neu angelegt, Altbestand), aus dem gespeicherten Spielstand anlegen
async function prepare(env, uid, cid, base) {
  let row = await loadBook(env, uid, cid);
  if (row && !row.state && !base) return { error: 'fresh' };
  const ch = await loadChar(env, uid, cid, !row || !row.state);
  if (!ch) return { error: 'nochar' };
  if (!row) {
    // Charakter ohne Buch (älter als die Migration und danach nie gespeichert): Buch = gespeicherter Stand
    const v = valuesOf(ch.snapshot);
    await db(env, 'character_ledger?on_conflict=user_id,character_id', {
      method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
      body: { user_id: uid, character_id: cid, xp: v.xp, gold: v.gold, items: v.items, state: null, ver: 0 },
    });
    row = await loadBook(env, uid, cid);
    if (!row) return { error: 'nochar' };
    if (!base) return { error: 'fresh' };
  }
  const state = row.state && typeof row.state === 'object' && row.state.sessions ? row.state : freshState(ch.snapshot);
  return { row, classId: ch.class_id ?? ch.snapshot?.slices?.character?.classId ?? null, book: { xp: Number(row.xp) || 0, gold: Number(row.gold) || 0, items: row.items ?? {}, state } };
}

// Schreiben nur, wenn seit dem Lesen niemand anderes gebucht hat (Auktionshaus, zweites Fenster): sonst neu rechnen
async function store(env, uid, cid, ver, book) {
  const rows = await db(env, `character_ledger?${filter(uid, cid)}&ver=eq.${ver}`, {
    method: 'PATCH', prefer: 'return=representation',
    body: { xp: book.xp, gold: book.gold, items: book.items, state: book.state, ver: ver + 1, updated_at: new Date().toISOString() },
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function orders(env, uid, cid, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const rows = await db(env, `gold_orders?id=in.(${ids.join(',')})&user_id=eq.${uid}&character_id=eq.${encodeURIComponent(cid)}&kind=eq.gold&select=id,gold,status`).catch(() => []);
  for (const o of rows ?? []) if (ORDER_OK.has(o.status)) out.set(o.id, { gold: o.gold });
  return out;
}

export async function handleLedger(request, env, url, { now = () => Date.now() } = {}) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
  if (!dbReady(env)) return json({ off: true });
  const text = await request.text();
  if (text.length > BODY_MAX) return json({ error: 'size' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid' }, 422); }
  const cid = body?.c;
  if (typeof cid !== 'string' || !CHAR_RE.test(cid)) return json({ error: 'invalid' }, 422);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = token ? await verifyToken(token, { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY }) : null;
  if (!user?.uid) return json({ error: 'auth' }, 401);
  const uid = user.uid;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await prepare(env, uid, cid, !!(body.open && body.base));
      if (p.error === 'fresh') return json({ fresh: true });
      if (p.error) return json({ error: p.error }, 404);
      const { row, book, classId } = p;
      const at = now();
      if (body.open) {
        const sid = hexId(8), seed = hexId(16);
        const st = structuredClone(book.state);
        openSession(st, { sid, seed, at });
        if (await store(env, uid, cid, row.ver, { ...book, state: st })) return json({ sid, seed });
        continue;
      }
      const sid = body.s;
      const entries = Array.isArray(body.e) ? body.e.slice(0, LIMITS.entries) : null;
      if (typeof sid !== 'string' || !SID_RE.test(sid) || !entries) return json({ error: 'invalid' }, 422);
      const r = applyEntries(book, entries, { classId, now: at, sid, orders: await orders(env, uid, cid, ordersNeeded(entries)) });
      if (r.error === 'session') return json({ error: 'session' }, 409);
      if (r.accepted === (book.state.sessions[sid]?.k ?? 0) && row.state) return json({ k: r.accepted, miss: 0 }); // nichts Neues
      if (await store(env, uid, cid, row.ver, r.book)) return json({ k: r.accepted, miss: r.miss.length });
    }
    return json({ error: 'busy' }, 503);
  } catch (e) {
    if (e instanceof Missing) return json({ off: true });
    throw e;
  }
}
