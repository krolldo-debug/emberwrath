// Gold-Shop im Worker (worker/shop.js) ohne Netz: Stripe und Supabase werden über einen fetch-Ersatz nachgestellt.
// Aufruf: node worker/test/shop.test.mjs
import { handleShop, verifyStripeSignature, formEncode } from '../shop.js';
import { findPack, packTotal } from '../../src/shop/catalog.js';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };

const SB = 'https://sb.test';
const BASE_ENV = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_x', SITE_URL: 'https://www.emberwrath.com' };
const KEYS = { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
const USERS = { tok_admin: { id: 'u-admin', email: 'a@x.de' }, tok_player: { id: 'u-player', email: 'p@x.de' } };

let calls = [];
let orders = new Map();
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const body = init.body;
  calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body });
  const res = (d, s = 200) => new Response(d == null ? null : JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.origin === SB && url.pathname === '/auth/v1/user') {
    const u = USERS[(init.headers?.authorization ?? '').replace('Bearer ', '')];
    return u ? res(u) : res({ msg: 'bad' }, 401);
  }
  if (url.origin === SB && url.pathname === '/rest/v1/rpc/is_admin') return res(init.headers.authorization === 'Bearer tok_admin');
  if (url.origin === SB && url.pathname === '/rest/v1/gold_orders') {
    if (init.headers.authorization) return res({ msg: 'sb_secret als Bearer' }, 401);
    if (init.method === 'POST') { const o = JSON.parse(body); orders.set(o.id, o); return res(null, 201); }
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const pi = url.searchParams.get('stripe_payment_intent')?.replace('eq.', '');
    const allowed = url.searchParams.get('status')?.replace(/^in\.\(|\)$/g, '').split(',');
    const hit = [...orders.values()].filter((o) => (id ? o.id === id : o.stripe_payment_intent === pi));
    if (init.method === 'PATCH') { for (const o of hit) if (!allowed || allowed.includes(o.status)) Object.assign(o, JSON.parse(body)); return res(null, 204); }
    return res(hit);
  }
  if (url.hostname === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions') {
    return res({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', livemode: false });
  }
  return res({ error: 'unexpected ' + url }, 500);
};

const req = (path, { method = 'GET', token, body, headers = {} } = {}) => new Request(`https://www.emberwrath.com/net${path}`, {
  method, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  headers: { origin: 'https://www.emberwrath.com', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
});
const call = async (env, path, opts) => {
  const r = req(path, opts);
  const res = await handleShop(r, env, new URL(r.url), path);
  return { status: res.status, body: await res.json() };
};

// Status
let r = await call(BASE_ENV, '/shop/status');
ok(r.status === 200 && r.body.enabled === false && r.body.configured === false && r.body.products.length >= 3, 'Status ohne Schlüssel: geschlossen, Pakete sichtbar');
r = await call({ ...BASE_ENV, ...KEYS, SHOP_ENABLED: 'true' }, '/shop/status');
ok(r.body.enabled === true, 'SHOP_ENABLED=true mit Schlüsseln: offen');

// Checkout
const buy = { productId: 'gold_35k', characterId: 'chr_abc', waiver: true };
r = await call(BASE_ENV, '/shop/checkout', { method: 'POST', token: 'tok_admin', body: buy });
ok(r.status === 503, 'Checkout ohne Stripe-Schlüssel: 503');
const env = { ...BASE_ENV, ...KEYS };
r = await call(env, '/shop/checkout', { method: 'POST', body: buy });
ok(r.status === 401, 'Checkout ohne Anmeldung: 401');
r = await call(env, '/shop/checkout', { method: 'POST', token: 'tok_player', body: buy });
ok(r.status === 403 && r.body.error === 'closed', 'Shop geschlossen: normales Konto darf nicht kaufen');
calls = [];
r = await call(env, '/shop/checkout', { method: 'POST', token: 'tok_admin', body: { ...buy, priceCents: 1, gold: 999999999 } });
const order = orders.get(r.body.orderId);
const stripeCall = calls.find((c) => c.url.includes('api.stripe.com'));
const form = new URLSearchParams(stripeCall?.body?.toString());
const pack = findPack('gold_35k');
ok(r.status === 200 && r.body.url.startsWith('https://checkout.stripe.com/'), 'Admin-Vorschau: Checkout liefert Stripe-Adresse');
ok(order && order.gold === packTotal(pack) && order.amount_cents === pack.priceCents && order.status === 'pending' && order.user_id === 'u-admin', 'Bestellung pending mit Preis/Gold aus dem Katalog (Werte aus der Anfrage ignoriert)');
ok(form.get('line_items[0][price_data][unit_amount]') === String(pack.priceCents) && form.get('metadata[order_id]') === order.id && form.get('success_url').endsWith('/spielen/?kauf=erfolg'), 'Stripe bekommt Betrag, Bestell-ID und Rückkehradresse');
ok(stripeCall.headers['idempotency-key'] === order.id, 'Idempotency-Key = Bestell-ID');
ok(order.stripe_session_id === 'cs_test_1', 'Session-ID an Bestellung gespeichert');
ok(!form.has('consent_collection[terms_of_service]'), 'AGB-Zustimmung nur mit STRIPE_REQUIRE_TOS');
const open = { ...env, SHOP_ENABLED: 'true' };
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { ...buy, waiver: false } });
ok(r.status === 400 && r.body.error === 'waiver', 'Ohne Verzicht auf Widerruf kein Kauf');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { ...buy, productId: 'gold_free' } });
ok(r.status === 400, 'Unbekanntes Paket: 400');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { ...buy, characterId: '../x' } });
ok(r.status === 400, 'Ungültige Charakter-ID: 400');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: buy, headers: { origin: 'https://evil.example' } });
ok(r.status === 403, 'Fremde Herkunft: 403');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: buy });
ok(r.status === 200, 'Shop offen: normales Konto kann kaufen');
const playerOrder = orders.get(r.body.orderId);

// Webhook
const sign = async (payload, secret = KEYS.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${mac}`;
};
const hook = async (event, sig) => {
  const payload = JSON.stringify(event);
  return call(env, '/shop/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': sig ?? await sign(payload) } });
};
const completed = (o, extra = {}) => ({ type: 'checkout.session.completed', data: { object: {
  id: 'cs_test_1', payment_status: 'paid', amount_total: o.amount_cents, currency: 'eur', payment_intent: 'pi_1', metadata: { order_id: o.id }, livemode: false, ...extra } } });

r = await hook(completed(order), 't=1,v1=00');
ok(r.status === 400 && order.status === 'pending', 'Falsche Signatur: abgelehnt, nichts gutgeschrieben');
r = await hook(completed(order), await sign(JSON.stringify(completed(order)), 'whsec_other'));
ok(r.status === 400 && order.status === 'pending', 'Signatur mit fremdem Geheimnis: abgelehnt');
r = await hook(completed(order, { amount_total: 1 }));
ok(r.status === 200 && order.status === 'pending', 'Betrag passt nicht zur Bestellung: nicht bezahlt');
r = await hook(completed(order, { payment_status: 'unpaid' }));
ok(order.status === 'pending', 'Zahlung noch offen (z. B. Überweisung): bleibt pending');
r = await hook(completed(order));
ok(r.status === 200 && order.status === 'paid' && order.stripe_payment_intent === 'pi_1' && order.paid_at, 'Bezahlt: Bestellung paid');
order.status = 'credited';
r = await hook(completed(order));
ok(order.status === 'credited', 'Doppelter Webhook setzt gutgeschriebene Bestellung nicht zurück');
r = await hook({ type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', refunded: true } } });
ok(order.status === 'refunded', 'Erstattung markiert Bestellung als refunded');
r = await hook({ type: 'checkout.session.expired', data: { object: { id: 'cs_x', metadata: { order_id: playerOrder.id } } } });
ok(playerOrder.status === 'expired', 'Abgelaufene Bezahlseite: expired');
ok(!(await verifyStripeSignature('{}', await sign('{}', KEYS.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 1000), KEYS.STRIPE_WEBHOOK_SECRET)), 'Alte Signatur (Replay) abgelehnt');
ok(formEncode({ a: { b: { 0: { c: 1 } } }, d: null }).toString() === 'a%5Bb%5D%5B0%5D%5Bc%5D=1', 'Formular-Kodierung für Stripe');

console.log(fails ? `\n${fails} Fehler` : '\nAlle Shop-Prüfungen bestanden');
process.exit(fails ? 1 : 0);
