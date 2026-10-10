// Konten der CrazyGames-Fassung im Worker (worker/crazygames.js) ohne Netz: Supabase Auth (Admin + /user) und der
// öffentliche CrazyGames-Schlüssel werden über einen fetch-Ersatz nachgestellt.
// Aufruf: node worker/test/crazygames.test.mjs
import crypto from 'node:crypto';
import { handleCrazyGames, verifyCrazyToken, crazyOrigin, corsOrigin, withCors, preflight } from '../crazygames.js';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };

const SB = 'https://sb.test';
const KEY_URL = 'https://cg.test/publicKey.json';
const ENV = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_x', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', CG_KEY_URL: KEY_URL };

// CrazyGames-Schlüssel (RS256) wie unter https://sdk.crazygames.com/publicKey.json: { publicKey: PEM }
const cgPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function cgToken(payload, key = cgPair.privateKey, alg = 'RS256') {
  const h = b64u({ alg, typ: 'JWT' }), p = b64u({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, gameId: 'g1', ...payload });
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), key).toString('base64url');
  return `${h}.${p}.${sig}`;
}
// Supabase-Token (HS256-Form; worker/auth.js fragt dafür /auth/v1/user)
const sbToken = (u) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated', iss: `${SB}/auth/v1` })}.c2ln${u.id}`;

// Nachgestelltes Supabase Auth
const users = new Map(); // id -> { id, email, password, user_metadata }
let calls = [];
let keyFetches = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ path: url.pathname, method: init.method ?? 'GET', headers: init.headers ?? {} });
  const res = (d, s = 200) => new Response(d == null ? null : JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  if (String(input) === KEY_URL) { keyFetches++; return res({ publicKey: cgPair.publicKey.export({ type: 'spki', format: 'pem' }) }); }
  if (url.origin !== SB) return res({ msg: 'unknown host' }, 500);
  const body = init.body ? JSON.parse(init.body) : null;
  if (url.pathname === '/auth/v1/user') {
    const bearer = (init.headers?.authorization ?? '').replace('Bearer ', '');
    const u = [...users.values()].find((x) => sbToken(x) === bearer);
    return u ? res({ id: u.id, email: u.email }) : res({ msg: 'bad' }, 401);
  }
  if (init.headers?.apikey !== 'sb_secret_x') return res({ msg: 'no key' }, 401);
  if (url.pathname === '/auth/v1/admin/users' && init.method === 'POST') {
    if ([...users.values()].some((u) => u.email === body.email.toLowerCase())) return res({ code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }, 422);
    if (body.email_confirm !== true) return res({ msg: 'unconfirmed' }, 400);
    const id = crypto.randomUUID();
    users.set(id, { id, email: body.email.toLowerCase(), password: body.password, user_metadata: body.user_metadata });
    return res({ id, email: body.email });
  }
  const m = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
  if (m && init.method === 'PUT') {
    const u = users.get(decodeURIComponent(m[1]));
    if (!u) return res({ msg: 'not found' }, 404);
    if (body.email && [...users.values()].some((x) => x.id !== u.id && x.email === body.email.toLowerCase())) return res({ code: 422, error_code: 'email_exists', msg: 'exists' }, 422);
    if (body.email) u.email = body.email.toLowerCase();
    if (body.password) u.password = body.password;
    if (body.user_metadata) u.user_metadata = { ...u.user_metadata, ...body.user_metadata };
    return res({ id: u.id, email: u.email });
  }
  if (url.pathname === '/auth/v1/admin/generate_link') {
    const u = [...users.values()].find((x) => x.email === body.email);
    return u ? res({ id: u.id, email: u.email, action_link: 'x', hashed_token: 'h' }) : res({ msg: 'not found' }, 404);
  }
  return res({ msg: 'unexpected' }, 500);
};

const call = (body, { origin = 'https://emberwrath.game-files.crazygames.com', env = ENV, method = 'POST' } = {}) => {
  const req = new Request('https://www.emberwrath.com/net/cg/session', {
    method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  return handleCrazyGames(req, env, new URL(req.url), '/cg/session');
};
const json = async (p) => { const r = await p; return { status: r.status, data: await r.json() }; };
const signIn = (email, password) => [...users.values()].find((u) => u.email === email && u.password === password) ?? null;

const GUEST = 'g'.repeat(32);
const GUEST2 = 'h'.repeat(32);

// Herkunft
ok(crazyOrigin('https://emberwrath.game-files.crazygames.com'), 'Spielseite von CrazyGames erlaubt');
ok(crazyOrigin('https://www.crazygames.com') && crazyOrigin('https://app.crazygames.com') && crazyOrigin('capacitor://app.crazygames.com'), 'CrazyGames-Seite und Apps erlaubt');
ok(!crazyOrigin('https://crazygames.com.evil.net') && !crazyOrigin('https://evilcrazygames.com') && !crazyOrigin('http://x.crazygames.com'), 'fremde/ähnliche Adressen abgelehnt');
const reqFrom = (o) => new Request('https://www.emberwrath.com/net/status', { headers: { origin: o } });
ok(corsOrigin(reqFrom('https://x.example'), { ALLOWED_ORIGINS: 'https://x.example' }) === 'https://x.example', 'ALLOWED_ORIGINS gilt weiter');
ok(corsOrigin(reqFrom('https://x.example'), {}) === null, 'unbekannte Herkunft: kein CORS');
const wc = withCors(new Response('{}', { status: 200 }), 'https://a.crazygames.com');
ok(wc.headers.get('access-control-allow-origin') === 'https://a.crazygames.com' && /Origin/.test(wc.headers.get('vary')), 'Antwort mit CORS-Kopf');
ok(preflight('https://a.crazygames.com').status === 204 && preflight(null).status === 403, 'Vorabfrage');

// Token prüfen
ok((await verifyCrazyToken(cgToken({ userId: 'U1', username: 'Bob' }), ENV))?.userId === 'U1', 'gültiges CrazyGames-Token');
ok(await verifyCrazyToken(cgToken({ userId: 'U1' }, otherPair.privateKey), ENV) === null, 'fremder Schlüssel abgelehnt');
ok(await verifyCrazyToken(cgToken({ userId: 'U1', exp: Math.floor(Date.now() / 1000) - 120 }), ENV) === null, 'abgelaufenes Token abgelehnt');
ok(await verifyCrazyToken(cgToken({ userId: 'U1' }), { ...ENV, CG_GAME_ID: 'other' }) === null, 'Token eines anderen Spiels abgelehnt (CG_GAME_ID)');
ok(await verifyCrazyToken(cgToken({ userId: 'U1' }, cgPair.privateKey, 'HS256'), ENV) === null, 'anderer Algorithmus abgelehnt');
ok(await verifyCrazyToken(cgToken({ userId: '../x' }), ENV) === null, 'ungültige ID abgelehnt');
ok(keyFetches <= 2, `Schlüssel zwischengespeichert (${keyFetches} Abruf(e))`);

// Gast
const g1 = await json(call({ guest: GUEST }));
ok(g1.status === 200 && g1.data.kind === 'guest' && /^guest-[0-9a-f]{32}@players\.emberwrath\.com$/.test(g1.data.email), `Gastkonto angelegt: ${g1.data.email}`);
ok(!g1.data.email.includes(GUEST), 'Gastschlüssel steht nicht in der E-Mail');
const guestUser = signIn(g1.data.email, g1.data.password);
ok(!!guestUser && guestUser.user_metadata.platform === 'crazygames' && !guestUser.user_metadata.cg_user_id, 'Anmeldung mit den Zugangsdaten klappt, Konto als Gast markiert');
const g1b = await json(call({ guest: GUEST }));
ok(g1b.data.email === g1.data.email && g1b.data.password === g1.data.password && users.size === 1, 'zweiter Start: dasselbe Konto, kein neues');
const g2 = await json(call({ guest: GUEST2 }));
ok(g2.data.email !== g1.data.email && g2.data.password !== g1.data.password, 'anderer Browser: anderes Gastkonto');
ok(/^Ew9!/.test(g1.data.password) && g1.data.password.length > 40, 'Passwort lang und mit allen Zeichenarten');
ok(calls.filter((c) => c.path.startsWith('/auth/v1/admin')).every((c) => c.headers.apikey === 'sb_secret_x' && !c.headers.authorization), 'Secret Key nur als apikey');

// Eingaben
ok((await call({ guest: 'kurz' })).status === 400, 'zu kurzer Gastschlüssel abgelehnt');
ok((await call({})).status === 400, 'ohne Gastschlüssel abgelehnt');
ok((await call({ guest: GUEST }, { origin: 'https://evil.example' })).status === 403, 'fremde Seite abgelehnt');
ok((await call({ guest: GUEST }, { origin: 'https://www.emberwrath.com' })).status === 200, 'eigene Seite erlaubt');
ok((await call(null, { method: 'GET' })).status === 405, 'nur POST');
ok((await call({ guest: GUEST }, { env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' } })).status === 503, 'ohne Service-Schlüssel: nicht verfügbar');
ok((await call({ guest: GUEST, cg: cgToken({ userId: 'U9' }, otherPair.privateKey) })).status === 401, 'gefälschtes CrazyGames-Token: 401');

// Gast meldet sich bei CrazyGames an: Gastkonto wird übernommen
const before = users.size;
const l1 = await json(call({ guest: GUEST, cg: cgToken({ userId: 'CgUser1', username: 'Bob<script>' }), link: sbToken(guestUser) }));
ok(l1.status === 200 && l1.data.kind === 'cg' && l1.data.linked === true, 'Gastkonto übernommen (linked)');
const linkedUser = signIn(l1.data.email, l1.data.password);
ok(linkedUser?.id === guestUser.id && users.size === before, 'gleiches Konto (gleiche ID), kein neues angelegt');
ok(linkedUser.user_metadata.cg_user_id === 'CgUser1' && linkedUser.user_metadata.display_name === 'Bobscript', `CrazyGames-ID und bereinigter Name gespeichert („${linkedUser.user_metadata.display_name}“)`);
ok(!signIn(g1.data.email, g1.data.password), 'alte Gast-Zugangsdaten gelten nicht mehr');
// Gleiche CrazyGames-ID später von anderem Gerät: dasselbe Konto
const l2 = await json(call({ guest: GUEST2, cg: cgToken({ userId: 'CgUser1' }) }));
ok(l2.data.email === l1.data.email && signIn(l2.data.email, l2.data.password)?.id === guestUser.id && !l2.data.linked, 'anderes Gerät mit CrazyGames-Konto: dasselbe Konto');
// Zweiter Gast mit derselben CrazyGames-ID: CrazyGames-Konto existiert schon -> kein Übernehmen, Gast bleibt Gast
const guest2User = signIn(g2.data.email, g2.data.password);
const l3 = await json(call({ guest: GUEST2, cg: cgToken({ userId: 'CgUser1' }), link: sbToken(guest2User) }));
ok(l3.data.linked === false && l3.data.email === l1.data.email && guest2User.email === g2.data.email, 'CrazyGames-Konto vorhanden: Gastkonto bleibt unberührt');
// Fremdes Gast-Token mit falschem Gastschlüssel: kein Übernehmen
const g3 = await json(call({ guest: 'k'.repeat(32) }));
const g3User = signIn(g3.data.email, g3.data.password);
const l4 = await json(call({ guest: GUEST, cg: cgToken({ userId: 'CgUser2' }), link: sbToken(g3User) }));
ok(l4.data.linked === false && g3User.email === g3.data.email, 'Token passt nicht zum Gastschlüssel: kein Übernehmen');
// Groß/Klein in der CrazyGames-ID ergibt verschiedene Konten
const c1 = await json(call({ guest: GUEST, cg: cgToken({ userId: 'AbC' }) }));
const c2 = await json(call({ guest: GUEST, cg: cgToken({ userId: 'abc' }) }));
ok(c1.data.email !== c2.data.email, 'IDs „AbC“ und „abc“ bleiben getrennt');

// Passwort erneuern (z. B. nach Schlüsselwechsel)
const other = { ...ENV, CG_SECRET: 'neu' };
const r1 = await json(call({ guest: GUEST2, cg: cgToken({ userId: 'CgUser1' }) }, { env: other }));
ok(!signIn(r1.data.email, r1.data.password), 'neuer Schlüssel: alte Anmeldung passt nicht mehr');
const r2 = await json(call({ guest: GUEST2, cg: cgToken({ userId: 'CgUser1' }), repair: true }, { env: other }));
ok(signIn(r2.data.email, r2.data.password)?.id === guestUser.id, 'repair setzt das Passwort neu, gleiches Konto');

console.log(fails ? `\n${fails} Fehler` : '\nalles grün');
process.exit(fails ? 1 : 0);
