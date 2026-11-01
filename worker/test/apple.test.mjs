// App-Store-Käufe im Worker (worker/apple.js, worker/shop.js /shop/apple und /shop/apple/notify) ohne Netz.
// Signiert wird mit einer Test-Kette (fixtures/apple: Wurzel, Zwischen- und Blattzertifikat mit Apple-OIDs, Blattschlüssel).
// Die echte Apple-Kette (apple-*.b64, aus Apples app-store-server-library) prüft die Kettenprüfung gegen die feste Wurzel.
// Aufruf: node worker/test/apple.test.mjs
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import { verifyAppleJws, verifyAppleChain, appleTrust, APPLE_ROOT_G3_SHA256 } from '../apple.js';
import { handleShop } from '../shop.js';
import { findPack, packTotal, appleProductId } from '../../src/shop/catalog.js';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const fx = (n) => readFileSync(new URL(`./fixtures/apple/${n}`, import.meta.url), 'utf8').trim();
const rejects = async (p, why) => { try { await p; return false; } catch (e) { return !why || e.message === why; } };

// ------------------------------------------------------------------ Kette und Signatur
const real = [fx('apple-leaf.b64'), fx('apple-mid.b64'), fx('apple-root.b64')];
ok((await verifyAppleChain(real)).length === 3, 'echte Apple-Kette (Blatt → WWDR G6 → Root CA G3) passt zur festen Wurzel');
ok(await rejects(verifyAppleChain([real[1], real[1], real[2]]), 'oid'), 'Zwischenzertifikat als Blatt: abgelehnt (OID)');
ok(await rejects(verifyAppleChain([real[0], real[1]]), 'chain'), 'Kette ohne Wurzel: abgelehnt');

const test = [fx('leaf.b64'), fx('mid.b64'), fx('root.b64')];
const key = createPrivateKey(fx('leaf.key.pem'));
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jws = (payload, x5c = test) => {
  const head = `${b64u({ alg: 'ES256', x5c })}.${b64u(payload)}`;
  return `${head}.${nodeSign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};
ok(await rejects(verifyAppleJws(jws({ a: 1 })), 'root'), 'Test-Kette gegen Apple-Wurzel: abgelehnt');
const testRoot = Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.from(test[2], 'base64'))).toString('hex');
appleTrust.rootSha256 = testRoot;
const now = Date.now();
ok((await verifyAppleJws(jws({ a: 1, signedDate: now }))).a === 1, 'gültige Signatur der Test-Kette: Inhalt kommt an');
const good = jws({ a: 1, signedDate: now });
const [h, , s] = good.split('.');
ok(await rejects(verifyAppleJws(`${h}.${b64u({ a: 2, signedDate: now })}.${s}`), 'sig'), 'veränderter Inhalt: abgelehnt');
ok(await rejects(verifyAppleJws(`${b64u({ alg: 'none', x5c: test })}.${b64u({ a: 1 })}.`), 'alg'), 'alg none: abgelehnt');
ok(await rejects(verifyAppleJws(jws({ a: 1, signedDate: Date.UTC(2001, 0, 1) })), 'expired'), 'Signaturzeit außerhalb der Zertifikate: abgelehnt');
ok(await rejects(verifyAppleJws(jws({ a: 1 }, [test[0], test[1], real[2]]))), 'Test-Kette mit fremder Wurzel: abgelehnt');

// ------------------------------------------------------------------ Endpunkte
const SB = 'https://sb.test';
const USERS = { tok_a: { id: '11111111-2222-4333-8444-555555555555', email: 'a@x.de' }, tok_b: { id: '99999999-2222-4333-8444-555555555555', email: 'b@x.de' } };
const JWT = Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated', iss: `${SB}/auth/v1` })}.c2ln`]));
const TOKEN_OF = Object.fromEntries(Object.entries(JWT).map(([t, j]) => [j, t]));
const orders = new Map();
const revoked = [];
const match = (o, params) => [...params].every(([k, v]) => {
  if (['select', 'limit', 'order', 'on_conflict'].includes(k)) return true;
  const val = o[k] ?? null;
  if (v === 'is.null') return val == null;
  if (v === 'not.is.null') return val != null;
  if (v.startsWith('eq.')) return String(val) === v.slice(3);
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(val));
  throw new Error('Filter ' + k + '=' + v);
});
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const res = (d, st = 200) => new Response(d == null ? null : JSON.stringify(d), { status: st, headers: { 'content-type': 'application/json' } });
  if (url.pathname === '/auth/v1/user') {
    const u = USERS[TOKEN_OF[(init.headers?.authorization ?? '').replace('Bearer ', '')]];
    return u ? res(u) : res({}, 401);
  }
  if (url.pathname === '/rest/v1/characters') return res(url.searchParams.get('id') === 'eq.chr_abc' && url.searchParams.get('user_id') === `eq.${USERS.tok_a.id}` ? [{ id: 'chr_abc' }] : []);
  if (url.pathname === '/rest/v1/gold_orders') {
    if (init.method === 'POST') {
      const o = JSON.parse(init.body);
      if ([...orders.values()].some((x) => x.apple_transaction_id === o.apple_transaction_id)) return res([], 201);
      orders.set(o.id, o); return res([o], 201);
    }
    const hit = [...orders.values()].filter((o) => match(o, url.searchParams));
    if (init.method === 'PATCH') { for (const o of hit) Object.assign(o, JSON.parse(init.body)); return res(null, 204); }
    return res(hit);
  }
  if (url.pathname === '/rest/v1/rpc/shop_server_revoke') { const id = JSON.parse(init.body).p_order; revoked.push(id); orders.get(id).revoked_at = 'x'; return res(1); }
  return res({ error: 'unexpected ' + url }, 500);
};
const env = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_x', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', SHOP_ENABLED: 'true' };
const call = async (path, { token, body } = {}) => {
  const r = new Request(`https://www.emberwrath.com/net${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { origin: 'https://www.emberwrath.com', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${JWT[token]}` } : {}) } });
  const out = await handleShop(r, env, new URL(r.url), path);
  return { status: out.status, body: await out.json() };
};
const tx = (o = {}) => ({ transactionId: '2000000123', originalTransactionId: '2000000123', bundleId: 'com.emberwrath.game',
  productId: appleProductId('gold_35k'), purchaseDate: now, signedDate: now, environment: 'Production', type: 'Consumable',
  appAccountToken: USERS.tok_a.id, price: 9990, currency: 'EUR', ...o });

let r = await call('/shop/apple', { body: { transactions: [jws(tx())], characterId: 'chr_abc' } });
ok(r.status === 401, 'ohne Anmeldung: 401');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: [jws(tx())], characterId: 'chr_abc' } });
const o = [...orders.values()][0];
ok(r.status === 200 && r.body.results[0].ok && r.body.results[0].done, 'gültiger Kauf: ok und abschließen');
ok(o && o.status === 'paid' && o.provider === 'apple' && o.gold === packTotal(findPack('gold_35k')) && o.character_id === 'chr_abc'
  && o.amount_cents === 999 && o.currency === 'eur' && o.livemode === true && o.user_id === USERS.tok_a.id, 'Bestellung bezahlt, Gold aus dem Katalog, Preis laut Apple');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: [jws(tx())], characterId: 'chr_abc' } });
ok(r.body.results[0].ok && orders.size === 1, 'derselbe Kauf zweimal: nur einmal eingetragen, wieder abschließen');
r = await call('/shop/apple', { token: 'tok_b', body: { transactions: [jws(tx({ transactionId: '2000000124' }))], characterId: 'chr_abc' } });
ok(!r.body.results[0].ok && !r.body.results[0].done && r.body.results[0].error === 'account' && orders.size === 1, 'Kauf eines anderen Kontos: nicht gutgeschrieben, bleibt offen');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: [jws(tx({ transactionId: '2000000125' }))], characterId: 'chr_fremd' } });
ok(r.body.results[0].error === 'character' && !r.body.results[0].done, 'Gold für fremden Charakter: abgelehnt, bleibt offen');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: [jws(tx({ transactionId: '2000000126', bundleId: 'com.andere.app' }))], characterId: 'chr_abc' } });
ok(r.body.results[0].error === 'bundle' && r.body.results[0].done, 'andere App: abgelehnt und abgeschlossen');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: [jws(tx({ transactionId: '2000000127', productId: 'com.emberwrath.game.gold_999k' }))], characterId: 'chr_abc' } });
ok(r.body.results[0].error === 'product', 'unbekanntes Produkt: abgelehnt');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: ['a.b.c'], characterId: 'chr_abc' } });
ok(r.body.results[0].error === 'signature' && !r.body.results[0].done, 'kaputte Signatur: abgelehnt');
r = await call('/shop/apple', { token: 'tok_a', body: { transactions: [jws(tx({ transactionId: '2000000128', productId: appleProductId('design_soul'), environment: 'Sandbox', price: undefined }))] } });
const d = [...orders.values()].find((x) => x.apple_transaction_id === '2000000128');
ok(r.body.results[0].ok && d.kind === 'design' && d.items.includes('mount:soul_wolf') && d.character_id === null && d.livemode === false && d.amount_cents === 999,
  'Design (Testumgebung): fürs Konto, ohne Charakter, Preis aus dem Katalog');

// Erstattung über App Store Server Notifications
const notify = (type, t) => ({ signedPayload: jws({ notificationType: type, notificationUUID: 'n1', signedDate: now,
  data: { bundleId: 'com.emberwrath.game', environment: 'Production', signedTransactionInfo: jws(t) } }) });
o.status = 'credited'; o.credited_at = 'x'; o.delivered_at = 'x';
r = await call('/shop/apple/notify', { body: notify('REFUND', tx()) });
ok(r.status === 200 && o.status === 'refunded' && revoked.includes(o.id), 'REFUND: Bestellung erstattet, Gold serverseitig abgezogen');
r = await call('/shop/apple/notify', { body: { signedPayload: `${h}.${b64u({ notificationType: 'REFUND' })}.${s}` } });
ok(r.status === 400, 'Benachrichtigung mit falscher Signatur: 400');
r = await call('/shop/apple/notify', { body: notify('TEST', tx()) });
ok(r.status === 200, 'TEST-Benachrichtigung: 200');
d.status = 'refunded';
r = await call('/shop/apple/notify', { body: notify('REFUND_REVERSED', tx({ transactionId: '2000000128' })) });
ok(d.status === 'paid', 'REFUND_REVERSED vor Abzug: gilt wieder');

appleTrust.rootSha256 = APPLE_ROOT_G3_SHA256;
console.log(fails ? `\n${fails} Fehler` : '\nalles in Ordnung');
process.exit(fails ? 1 : 0);
