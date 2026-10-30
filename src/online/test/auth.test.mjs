// Anmeldung: Sitzung behalten (Tresor, Hintergrund, Erneuerung), Google im App-Fenster, Apple auf der Website, Erinnerungszeit.
// node src/online/test/auth.test.mjs
import assert from 'node:assert/strict';
globalThis.window = { history: { replaceState() {} }, location: { href: 'https://www.emberwrath.com/spielen/', origin: 'https://www.emberwrath.com', pathname: '/spielen/' } };
globalThis.document = { visibilityState: 'visible', documentElement: { lang: 'de' } };
const root = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const { AuthClient, noncePair } = await import(`${root}/src/online/AuthClient.js`);
const { nextReminder } = await import(`${root}/src/app/notify.js`).catch((e) => ({ err: e }));
const { handleAppleLogin } = await import(`${root}/worker/login.js`);

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const user = { id: 'u1', email: 'a@b.c', user_metadata: {} };
let n = 0;
const tok = (extra = {}) => ({ access_token: `at${++n}`, refresh_token: `rt${n}`, expires_in: 3600, user, ...extra });
function server(valid) {
  const calls = [];
  const f = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null; calls.push({ url, body });
    const ok = (d) => ({ ok: true, status: 200, text: async () => JSON.stringify(d) });
    const bad = (code) => ({ ok: false, status: 400, text: async () => JSON.stringify({ error_code: code, msg: code }) });
    if (url.includes('grant_type=refresh_token')) { if (!valid.has(body.refresh_token)) return bad('refresh_token_already_used'); valid.delete(body.refresh_token); const t = tok(); valid.add(t.refresh_token); return ok(t); }
    if (url.includes('grant_type=id_token')) return ok(tok());
    if (url.includes('grant_type=pkce')) return ok(tok());
    return bad('x');
  };
  f.calls = calls; return f;
}

// 1) Refresh: Antwort verloren, Tresor hat neueres Token → kein Abmelden
{
  const valid = new Set(['rtNEW']);
  const storage = mem();
  const vaultStore = { v: null };
  const vault = { load: async () => vaultStore.v, save: (s) => { vaultStore.v = s; }, clear: () => { vaultStore.v = null; } };
  storage.setItem('emberwrath:online:session', JSON.stringify({ access_token: 'old', refresh_token: 'rtOLD', expires_at: 1, user }));
  vaultStore.v = { access_token: 'x', refresh_token: 'rtNEW', expires_at: 2, user };
  const c = new AuthClient({ url: 'https://s', anonKey: 'k', storage, fetch: server(valid), vault });
  const t = await c.getAccessToken();
  assert.ok(c.user, 'still signed in'); assert.match(t, /^at/); assert.notEqual(vaultStore.v.refresh_token, 'rtNEW');
  console.log('ok refresh fallback to vault');
}
// 2) restore: Seitenspeicher leer, Tresor hat Sitzung
{
  const storage = mem(); const saved = { access_token: 'a', refresh_token: 'r', expires_at: Date.now() / 1000 + 3000, user };
  const vault = { load: async () => saved, save() {}, clear() {} };
  const c = new AuthClient({ url: 'https://s', anonKey: 'k', storage, fetch: server(new Set()), vault });
  const ev = []; c.onChange((e) => ev.push(e));
  assert.equal(c.user, null); await c.restore(); assert.equal(c.user.id, 'u1'); assert.deepEqual(ev, ['SESSION_RESTORED']);
  assert.ok(storage.getItem('emberwrath:online:session'));
  console.log('ok restore');
}
// 3) echtes Ablehnen ohne Alternative → abgemeldet
{
  const storage = mem(); storage.setItem('emberwrath:online:session', JSON.stringify({ access_token: 'o', refresh_token: 'dead', expires_at: 1, user }));
  const c = new AuthClient({ url: 'https://s', anonKey: 'k', storage, fetch: server(new Set()) });
  await assert.rejects(c.getAccessToken()); assert.equal(c.user, null);
  console.log('ok signout on dead token');
}
// 4) im Hintergrund nicht erneuern, solange gültig; ensureFresh erneuert vorab
{
  const valid = new Set(['r1']); const storage = mem();
  storage.setItem('emberwrath:online:session', JSON.stringify({ access_token: 'cur', refresh_token: 'r1', expires_at: Date.now() / 1000 + 30, user }));
  const f = server(valid);
  const c = new AuthClient({ url: 'https://s', anonKey: 'k', storage, fetch: f });
  document.visibilityState = 'hidden'; assert.equal(await c.getAccessToken(), 'cur'); assert.equal(f.calls.length, 0);
  document.visibilityState = 'visible'; await c.ensureFresh(); assert.equal(f.calls.length, 1); assert.notEqual(c.session.access_token, 'cur');
  await c.ensureFresh(); assert.equal(f.calls.length, 1);
  console.log('ok hidden/ensureFresh');
}
// 5) App: Google über webAuth
{
  const storage = mem(); const f = server(new Set());
  const c = new AuthClient({ url: 'https://s', anonKey: 'k', storage, fetch: f, webAuth: async (u) => { assert.match(u, /redirect_to=emberwrath%3A%2F%2Fauth/); return 'emberwrath://auth?code=abc'; }, webAuthRedirect: 'emberwrath://auth' });
  const r = await c.signInWithProvider('google'); assert.equal(r.session.user.id, 'u1'); assert.equal(r.intent, 'oauth');
  assert.equal(f.calls.at(-1).body.auth_code, 'abc');
  console.log('ok webAuth google');
}
// 6) Website: Apple-Rückkehr
{
  const storage = mem(); const f = server(new Set());
  let went = null;
  const loc = { ...window.location, assign: (u) => { went = u; } };
  const c = new AuthClient({ url: 'https://s', anonKey: 'k', storage, fetch: f, location: loc });
  await c.signInWithAppleWeb({ clientId: 'com.emberwrath.web', redirectUri: 'https://www.emberwrath.com/net/auth/apple' });
  const q = new URL(went).searchParams; assert.equal(q.get('response_mode'), 'form_post'); assert.equal(q.get('nonce').length, 64);
  const req = new Request('https://www.emberwrath.com/net/auth/apple', { method: 'POST', body: new URLSearchParams({ id_token: 'aa.bb.cc', state: q.get('state'), user: JSON.stringify({ name: { firstName: 'Ada', lastName: 'L' } }) }) });
  const res = await handleAppleLogin(req); assert.equal(res.status, 303);
  const back = new URL(res.headers.get('location'), 'https://www.emberwrath.com');
  c.location = { ...loc, href: back.href };
  const r = await c.handleRedirect(); assert.equal(r.session.user.id, 'u1'); assert.equal(r.name, 'Ada L');
  const sent = f.calls.at(-1).body; assert.equal(sent.provider, 'apple'); assert.equal(sent.id_token, 'aa.bb.cc');
  const { createHash } = await import('node:crypto'); assert.equal(createHash('sha256').update(sent.nonce).digest('hex'), q.get('nonce'));
  // falscher state
  c.location = { ...loc, href: 'https://www.emberwrath.com/spielen/#apple_id_token=aa.bb.cc&state=zzzzzzzzzz' };
  const r2 = await c.handleRedirect(); assert.equal(r2.error.code, 'apple_state');
  const bad = await handleAppleLogin(new Request('https://x/net/auth/apple', { method: 'POST', body: new URLSearchParams({ error: 'user_cancelled_authorize' }) }));
  assert.match(bad.headers.get('location'), /apple_error=user_cancelled_authorize/);
  console.log('ok apple web');
}
// 7) Erinnerung
if (nextReminder) {
  process.env.TZ = 'Europe/Berlin';
  const at = (s) => new Date(s).getTime();
  const fmt = (ms) => new Date(ms).toISOString();
  assert.equal(fmt(nextReminder(at('2026-10-30T10:00:00Z'))), '2026-10-31T17:00:00.000Z'); // Fr 11 Uhr → Sa 18 Uhr MEZ
  assert.equal(fmt(nextReminder(at('2026-10-30T23:30:00Z'))), '2026-10-31T17:00:00.000Z'); // nach UTC-Mitternacht: Belohnung des 31. ab 01 Uhr
  console.log('ok reminder');
} else console.log('notify import skipped');
