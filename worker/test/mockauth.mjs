// Nachgebautes Supabase-Auth für Tests: JWKS (ES256) + /auth/v1/user; Tokens über /mint?sub=&email=&alg=
import http from 'node:http';
import crypto from 'node:crypto';
const PORT = Number(process.env.PORT || 54399);
const BASE = `http://127.0.0.1:${PORT}`;
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const opaque = new Map(); // HS256-ähnliche Tokens, nur über /auth/v1/user prüfbar
export function mint(sub, email, { alg = 'ES256', ttl = 3600 } = {}) {
  const payload = { sub, email, role: 'authenticated', aud: 'authenticated', iss: `${BASE}/auth/v1`, exp: Math.floor(Date.now() / 1000) + ttl };
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
  if (u.pathname === '/mint') return send(200, { token: mint(u.searchParams.get('sub'), u.searchParams.get('email'), { alg: u.searchParams.get('alg') || 'ES256', ttl: Number(u.searchParams.get('ttl') || 3600) }) });
  if (u.pathname === '/log') return send(200, log);
  send(404, {});
}).listen(PORT, () => console.log('mockauth', BASE));
