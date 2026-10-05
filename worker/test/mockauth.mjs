// Nachgebautes Supabase-Auth für Tests: JWKS (ES256) + /auth/v1/user; Tokens über /mint?sub=&email=&alg=
import http from 'node:http';
import crypto from 'node:crypto';
const PORT = Number(process.env.PORT || 54399);
const BASE = `http://127.0.0.1:${PORT}`;
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const opaque = new Map(); // HS256-ähnliche Tokens, nur über /auth/v1/user prüfbar
export function mint(sub, email, { alg = 'ES256', ttl = 3600, extra = {} } = {}) {
  const payload = { sub, email, role: 'authenticated', aud: 'authenticated', iss: `${BASE}/auth/v1`, exp: Math.floor(Date.now() / 1000) + ttl, ...extra };
  if (alg === 'HS256') {
    const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload);
    const tok = `${h}.${p}.${b64('sig' + Math.random())}`;
    opaque.set(tok, { id: sub, email });
    return tok;
  }
  const h = b64({ alg: 'ES256', typ: 'JWT', kid: 'k1' }), p = b64(payload);
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${h}.${p}.${sig}`;
}
const log = [];
// Nachgebautes PostgREST für die Chat-Moderation (worker/moderation.js): Meldungen sammeln, Sperren ausliefern
const rest = { reports: [], mutes: [], chars: [], fail: false };
const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d ? JSON.parse(d) : null)); });
http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  log.push(u.pathname);
  const send = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (u.pathname === '/auth/v1/.well-known/jwks.json') return send(200, { keys: [jwk] });
  if (u.pathname === '/auth/v1/user') {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    const x = opaque.get(t);
    return x ? send(200, x) : send(401, { msg: 'invalid' });
  }
  if (u.pathname === '/mint') {
    // extra=JSON überschreibt Angaben im Token (Tests für aud, iss, is_anonymous …)
    const extra = u.searchParams.get('extra') ? JSON.parse(u.searchParams.get('extra')) : {};
    return send(200, { token: mint(u.searchParams.get('sub'), u.searchParams.get('email'), { alg: u.searchParams.get('alg') || 'ES256', ttl: Number(u.searchParams.get('ttl') || 3600), extra }) });
  }
  if (u.pathname === '/log') return send(200, log);
  if (u.pathname === '/rest/v1/chat_reports' && req.method === 'POST') {
    if (rest.fail || !req.headers.apikey) { res.writeHead(503); return res.end(); }
    return body(req).then((b) => { rest.reports.push(b); res.writeHead(201); res.end(); });
  }
  if (u.pathname === '/rest/v1/chat_mutes') {
    if (rest.fail) { res.writeHead(503); return res.end(); }
    const uids = (u.searchParams.get('user_id') || '').replace(/^in\.\(|\)$/g, '').split(',');
    return send(200, rest.mutes.filter((m) => uids.includes(m.user_id) && Date.parse(m.until) > Date.now()));
  }
  if (u.pathname === '/rest/v1/characters') {
    const uid = (u.searchParams.get('user_id') || '').replace('eq.', ''), id = (u.searchParams.get('id') || '').replace('eq.', '');
    return send(200, rest.chars.filter((c) => c.user_id === uid && c.id === id).map(({ name, level }) => ({ name, level })));
  }
  if (u.pathname === '/test/char') { rest.chars.push({ user_id: u.searchParams.get('uid'), id: u.searchParams.get('id'), name: u.searchParams.get('name'), level: Number(u.searchParams.get('level')) }); return send(200, {}); }
  if (u.pathname === '/test/reports') return send(200, rest.reports);
  if (u.pathname === '/test/reset') { Object.assign(rest, { reports: [], mutes: [], chars: [], fail: false }); return send(200, {}); }
  if (u.pathname === '/test/fail') { rest.fail = u.searchParams.get('on') === '1'; return send(200, { fail: rest.fail }); }
  if (u.pathname === '/test/unmute') { rest.mutes = rest.mutes.filter((m) => m.user_id !== u.searchParams.get('uid')); return send(200, {}); }
  if (u.pathname === '/test/mute') { rest.mutes.push({ user_id: u.searchParams.get('uid'), until: new Date(Date.now() + 3600e3).toISOString(), reason: u.searchParams.get('reason') || '' }); return send(200, {}); }
  send(404, {});
}).listen(PORT, () => console.log('mockauth', BASE));
