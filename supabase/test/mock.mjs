// Nachgebauter Supabase-Dienst: GoTrue-Teilmenge + PostgREST-Teilmenge auf echter Postgres-DB (mit RLS).
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
const pool = new pg.Pool({ host: '127.0.0.1', user: 'postgres', password: 'pg', database: 'sbtest' });
const PORT = 54321, KEY = 'anon-test-key';
const pw = new Map(), tokens = new Map(), refresh = new Map(), codes = new Map();
export const log = [];
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function userRow(id) {
  const { rows } = await pool.query('select * from auth.users where id=$1', [id]);
  const u = rows[0]; if (!u) return null;
  return { id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.raw_user_meta_data, app_metadata: u.raw_app_meta_data };
}
// authAt: Zeitpunkt der echten Anmeldung (Sekunden) wie im amr-Claim von Supabase; Token-Erneuerung übernimmt ihn.
// globalThis.AUTH_AGE (Sekunden) lässt eine Anmeldung im Test älter erscheinen.
async function session(uid, authAt = Math.floor(Date.now() / 1000) - (globalThis.AUTH_AGE ?? 0)) {
  const at = 'at_' + crypto.randomUUID(), rt = 'rt_' + crypto.randomUUID();
  tokens.set(at, { uid, authAt, exp: Date.now() / 1000 + (globalThis.TTL ?? 3600) }); refresh.set(rt, { uid, authAt });
  await pool.query('update auth.users set last_sign_in_at=now() where id=$1', [uid]);
  return { access_token: at, refresh_token: rt, expires_in: globalThis.TTL ?? 3600, token_type: 'bearer', user: await userRow(uid) };
}
function err(res, status, code, msg) { send(res, status, { error_code: code, msg }); }
function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
// auth.jwt() wie bei Supabase (Claims des Zugriffstokens)
await pool.query(`create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$`);
async function asUser(tok, fn) {
  const uid = tok?.uid ?? null, authAt = tok?.authAt ?? null;
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: 'authenticated', amr: [{ method: 'password', timestamp: authAt }] } : { role: 'anon' })]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = ''; for await (const ch of req) body += ch;
  const json = body ? JSON.parse(body) : {};
  log.push(`${req.method} ${url.pathname}${url.search}`);
  const p = url.pathname;
  try {
    if (p === '/auth/v1/settings') return send(res, 200, { external: { email: true, google: true, apple: true }, disable_signup: false });
    if (p === '/auth/v1/authorize') {
      const email = `${url.searchParams.get('provider')}user@example.com`;
      let { rows } = await pool.query('select id from auth.users where email=$1', [email]);
      if (!rows[0]) ({ rows } = await pool.query(`insert into auth.users (email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values ($1,now(),'{"full_name":"Gustav Google"}',$2) returning id`, [email, { providers: [url.searchParams.get('provider')] }]));
      const code = 'c_' + crypto.randomUUID(); codes.set(code, { uid: rows[0].id, challenge: url.searchParams.get('code_challenge') });
      res.writeHead(302, { Location: `${url.searchParams.get('redirect_to')}?code=${code}` }); return res.end();
    }
    if (p === '/auth/v1/verify') {
      const c = codes.get(url.searchParams.get('token'));
      await pool.query('update auth.users set email_confirmed_at=now() where id=$1', [c.uid]);
      const code = 'c_' + crypto.randomUUID(); codes.set(code, c);
      res.writeHead(302, { Location: `${c.redirect}?code=${code}` }); return res.end();
    }
    if (req.headers.apikey !== KEY) return err(res, 401, 'no_api_key', 'no apikey');
    const auth = (req.headers.authorization ?? '').replace('Bearer ', '');
    const tok = tokens.get(auth);
    if (tok && tok.exp < Date.now() / 1000) return err(res, 401, 'bad_jwt', 'expired');
    const uid = tok?.uid ?? null;
    if (p === '/auth/v1/signup') {
      const { rows: ex } = await pool.query('select id from auth.users where email=$1', [json.email]);
      if (ex[0]) return err(res, 422, 'user_already_exists', 'exists');
      if ((json.password ?? '').length < 8) return err(res, 422, 'weak_password', 'weak');
      const { rows } = await pool.query(`insert into auth.users (email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,'{"providers":["email"],"provider":"email"}') returning id`, [json.email, json.data ?? {}]);
      pw.set(json.email, json.password);
      const t = 'v_' + crypto.randomUUID(); codes.set(t, { uid: rows[0].id, challenge: json.code_challenge, redirect: url.searchParams.get('redirect_to') });
      globalThis.lastMail = `http://localhost:${PORT}/auth/v1/verify?token=${t}&type=signup`;
      return send(res, 200, await userRow(rows[0].id));
    }
    if (p === '/auth/v1/recover') {
      const { rows } = await pool.query('select id from auth.users where email=$1', [json.email]);
      if (rows[0]) { const t = 'v_' + crypto.randomUUID(); codes.set(t, { uid: rows[0].id, challenge: json.code_challenge, redirect: url.searchParams.get('redirect_to') }); globalThis.lastMail = `http://localhost:${PORT}/auth/v1/verify?token=${t}&type=recovery`; }
      return send(res, 200, {});
    }
    if (p === '/auth/v1/token') {
      const g = url.searchParams.get('grant_type');
      if (g === 'password') {
        const { rows } = await pool.query('select id,email_confirmed_at from auth.users where email=$1', [json.email]);
        if (!rows[0] || pw.get(json.email) !== json.password) return err(res, 400, 'invalid_credentials', 'bad');
        if (!rows[0].email_confirmed_at) return err(res, 400, 'email_not_confirmed', 'not confirmed');
        return send(res, 200, await session(rows[0].id));
      }
      if (g === 'refresh_token') { const u = refresh.get(json.refresh_token); if (!u) return err(res, 400, 'refresh_token_not_found', 'x'); refresh.delete(json.refresh_token); return send(res, 200, await session(u.uid, u.authAt)); }
      if (g === 'pkce') {
        const c = codes.get(json.auth_code); if (!c) return err(res, 404, 'flow_state_not_found', 'x');
        const ch = b64url(crypto.createHash('sha256').update(json.code_verifier).digest());
        if (ch !== c.challenge) return err(res, 400, 'bad_code_verifier', 'x');
        codes.delete(json.auth_code);
        return send(res, 200, await session(c.uid));
      }
    }
    if (p === '/auth/v1/user') {
      if (!uid) return err(res, 401, 'session_not_found', 'x');
      if (req.method === 'PUT' && json.password) { const u = await userRow(uid); pw.set(u.email, json.password); }
      if (req.method === 'PUT' && json.data) await pool.query('update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, \'{}\'::jsonb) || $2::jsonb where id=$1', [uid, json.data]);
      return send(res, 200, await userRow(uid));
    }
    if (p === '/auth/v1/logout') { tokens.delete(auth); return send(res, 204); }
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice(13).replace(/\W/g, '');
      const names = Object.keys(json); const args = names.map((n, i) => `${n} => $${i + 1}`).join(',');
      const r = await asUser(tok, (c) => c.query(`select * from public.${fn}(${args})`, names.map((n) => json[n])));
      const scalar = r.fields.length === 1 && r.fields[0].name === fn;
      return send(res, 200, scalar ? r.rows[0]?.[fn] : r.rows);
    }
    if (p === '/rest/v1/characters') {
      if (req.method === 'GET') { const r = await asUser(tok, (c) => c.query('select id, saved_at, snapshot from public.characters')); return send(res, 200, r.rows); }
      if (req.method === 'DELETE') { const id = url.searchParams.get('id').replace(/^eq\./, ''); await asUser(tok, (c) => c.query('delete from public.characters where id=$1', [id])); return send(res, 204); }
      if (req.method === 'POST') {
        await asUser(tok, async (c) => { for (const r of json) await c.query(`insert into public.characters (user_id,id,name,race_id,class_id,level,zone_id,snapshot,saved_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          on conflict (user_id,id) do update set name=excluded.name,race_id=excluded.race_id,class_id=excluded.class_id,level=excluded.level,zone_id=excluded.zone_id,snapshot=excluded.snapshot,saved_at=excluded.saved_at`, [r.user_id, r.id, r.name, r.race_id, r.class_id, r.level, r.zone_id, r.snapshot, r.saved_at]); });
        return send(res, 201);
      }
    }
    err(res, 404, 'not_found', p);
  } catch (e) { send(res, 400, { code: e.code, message: e.message }); }
});
server.listen(PORT, () => console.log('mock on', PORT));
export { server, pool };
