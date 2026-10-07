// Gold-Shop im Worker (worker/shop.js) ohne Netz: Stripe und Supabase werden über einen fetch-Ersatz nachgestellt.
// Aufruf: node worker/test/shop.test.mjs
import { handleShop, verifyStripeSignature, formEncode, emailHash } from '../shop.js';
import { findPack, packTotal } from '../../src/shop/catalog.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };

const SB = 'https://sb.test';
const BASE_ENV = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_x', SITE_URL: 'https://www.emberwrath.com' };
const ASSETS = { fetch: async (req) => new URL(req.url).pathname === '/kaufbedingungen.html' ? new Response(TERMS_HTML) : new Response('nf', { status: 404 }) };
const KEYS = { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', RESEND_API_KEY: 're_x', ASSETS };
const USERS = { tok_admin: { id: 'u-admin', email: 'a@x.de' }, tok_player: { id: 'u-player', email: 'p@x.de' },
  tok_new: { id: 'u-new', email: 'A@X.de' }, tok_spam: { id: 'u-spam', email: 's@x.de' } };
// worker/auth.js nimmt nur JWTs mit Supabase-Angaben (aud, role, iss); HS256 fragt dann /auth/v1/user.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated', iss: `${SB}/auth/v1` })}.c2ln`]));
const TOKEN_OF = Object.fromEntries(Object.entries(JWT).map(([t, j]) => [j, t]));

const TERMS_HTML = readFileSync(new URL('./fixtures/kaufbedingungen.html', import.meta.url), 'utf8');
const mails = [];
let mailFail = false;
let calls = [];
let orders = new Map();
const blocks = new Map();
const revoked = [];
const marks = new Map();
// PostgREST-Filter (eq, in, is.null, not.is.null) auf ein Objekt anwenden.
const match = (o, params) => [...params].every(([k, v]) => {
  if (['select', 'limit', 'order'].includes(k)) return true;
  const val = o[k] ?? null;
  if (v === 'is.null') return val == null;
  if (v === 'not.is.null') return val != null;
  if (v.startsWith('eq.')) return String(val) === v.slice(3);
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(val));
  if (v.startsWith('gte.')) return String(val) >= v.slice(4);
  if (v.startsWith('ov.{')) return v.slice(4, -1).split(',').some((x) => (val ?? []).includes(x));
  throw new Error('Filter ' + k + '=' + v);
});
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const body = init.body;
  calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body });
  const res = (d, s = 200) => new Response(d == null ? null : JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.origin === SB && url.pathname === '/auth/v1/user') {
    const bearer = (init.headers?.authorization ?? '').replace('Bearer ', '');
    const u = USERS[TOKEN_OF[bearer] ?? bearer];
    return u ? res(u) : res({ msg: 'bad' }, 401);
  }
  if (url.origin === SB && url.pathname === '/rest/v1/rpc/is_admin') return res(init.headers.authorization === `Bearer ${JWT.tok_admin}`);
  if (url.origin === SB && url.pathname === '/rest/v1/shop_blocks') {
    if (init.method === 'POST') { const b = JSON.parse(body); if (!blocks.has(b.user_id)) blocks.set(b.user_id, b); return res(null, 201); }
    return res([...blocks.values()].filter((b) => match(b, url.searchParams)));
  }
  if (url.origin === SB && url.pathname === '/rest/v1/shop_block_marks') {
    if (init.method === 'POST') { const b = JSON.parse(body); if (!marks.has(b.email_hash)) marks.set(b.email_hash, b); return res(null, 201); }
    return res([...marks.values()].filter((b) => match(b, url.searchParams)));
  }
  if (url.origin === SB && url.pathname === '/rest/v1/gold_orders') {
    if (init.headers.authorization) return res({ msg: 'sb_secret als Bearer' }, 401);
    if (init.method === 'POST') { const o = JSON.parse(body); orders.set(o.id, { created_at: new Date().toISOString(), ...o }); return res(null, 201); }
    const hit = [...orders.values()].filter((o) => match(o, url.searchParams));
    if (init.method === 'PATCH') { for (const o of hit) Object.assign(o, JSON.parse(body)); return res(null, 204); }
    return res(hit);
  }
  if (url.origin === SB && url.pathname === '/rest/v1/rpc/shop_server_revoke') {
    if (init.headers.authorization) return res({ msg: 'sb_secret als Bearer' }, 401);
    revoked.push(JSON.parse(body).p_order); return res(1);
  }
  if (url.hostname === 'api.resend.com') {
    if (mailFail) return res({ message: 'down' }, 500);
    mails.push({ ...JSON.parse(body), idem: init.headers['idempotency-key'], orderStatus: [...orders.values()].find((o) => body.includes(o.id.replace(/-/g, '').slice(0, 10).toUpperCase()))?.status });
    return res({ id: 'm1' });
  }
  if (url.hostname === 'api.stripe.com' && url.pathname.startsWith('/v1/payment_intents/')) return res({ id: 'pi_1', payment_method: { type: 'paypal' } });
  if (url.origin === SB && url.pathname === '/rest/v1/characters') return res(url.searchParams.get('id') === 'eq.chr_abc' ? [{ name: 'Kael' }] : []);
  if (url.hostname === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions') {
    return res({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', livemode: false });
  }
  return res({ error: 'unexpected ' + url }, 500);
};

const req = (path, { method = 'GET', token, body, headers = {} } = {}) => new Request(`https://www.emberwrath.com/net${path}`, {
  method, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  headers: { origin: 'https://www.emberwrath.com', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${JWT[token] ?? token}` } : {}), ...headers },
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
ok(form.get('submit_type') === 'pay' && form.get('custom_text[submit][message]').includes('www.emberwrath.com/kaufbedingungen'), 'Stripe: Knopf „Bezahlen“, Kaufbedingungen genannt');
ok(form.get('line_items[0][price_data][product_data][description]') === '35.000 Gold für Kael in Emberwrath, sofort gutgeschrieben', 'Stripe-Beschreibung mit Menge und Charakter');
ok(order.terms_version === '2026-10-05' && order.lang === 'de', 'Bestellung speichert Fassung der Kaufbedingungen und Sprache');
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
mailFail = true;
r = await hook(completed(order, { customer_details: { email: 'a@x.de' } }));
ok(r.status === 500 && order.status === 'paid' && order.confirmation_error && !order.confirmation_sent_at, 'Mail fehlgeschlagen: trotzdem paid, Fehler vermerkt, Stripe wiederholt (500)');
mailFail = false;
r = await hook(completed(order, { customer_details: { email: 'a@x.de' } }));
ok(r.status === 200 && order.status === 'paid' && order.stripe_payment_intent === 'pi_1' && order.paid_at && order.confirmation_sent_at, 'Bezahlt: Bestellung paid, Bestätigung verschickt');
const mail = mails[0];
ok(mails.length === 1 && mail.to[0] === 'a@x.de' && mail.subject.startsWith('Deine Bestellung bei Emberwrath (Nr. ') && mail.idem === `order-${order.id}`, 'Bestellbestätigung an die Kontoadresse');
ok(mail.text.includes('35.000 Gold für deinen Charakter Kael') && mail.text.includes('9,99') && mail.text.includes('PayPal über Stripe') && mail.text.includes('Stahnsdorf'), 'Mail nennt Angebot, Preis, Zahlungsart, Anbieter');
ok(/Du hast am \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr ausdrücklich zugestimmt/.test(mail.text), 'Mail enthält die Verzichtserklärung mit Zeitpunkt');
ok(mail.text.includes('Widerrufsbelehrung') && mail.text.includes('Muster-Widerrufsformular') && mail.text.includes('Hiermit widerrufe(n) ich/wir') && mail.html.includes('Folgen des Widerrufs') && !mail.html.includes('<!--'), 'Mail enthält die vollständigen Kaufbedingungen (Text und HTML)');
ok(mail.html.includes('href="https://www.emberwrath.com/nutzungsbedingungen"'), 'Links in den Bedingungen absolut');
order.status = 'credited';
r = await hook(completed(order));
ok(order.status === 'credited' && mails.length === 1, 'Doppelter Webhook: nichts zurückgesetzt, keine zweite Mail');
order.delivered_at = new Date().toISOString(); // abgeholt, aber nie bestätigt (Sicherheitsprüfung D4)
r = await hook({ type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', refunded: true } } });
ok(order.status === 'refunded', 'Erstattung markiert Bestellung als refunded');
ok(revoked.includes(order.id), 'Erstattung: Server zieht das Gold im Spielstand ab (shop_server_revoke)');
r = await call(env, '/shop/checkout', { method: 'POST', token: 'tok_admin', body: buy });
ok(r.status === 409 && r.body.error === 'revoke_pending', 'Erstattetes Gold noch nicht abgezogen: keine neuen Käufe');
order.revoked_at = new Date().toISOString();
r = await call(env, '/shop/checkout', { method: 'POST', token: 'tok_admin', body: buy });
ok(r.status === 200, 'Nach dem Abzug: Kaufen wieder möglich');
// Rückbuchung (Dispute) auf eine gutgeschriebene Bestellung des Spielers
const disp = orders.get(r.body.orderId);
Object.assign(disp, { status: 'credited', stripe_payment_intent: 'pi_2', credited_at: new Date().toISOString() });
r = await hook({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_2', reason: 'fraudulent' } } });
ok(disp.status === 'disputed' && blocks.has('u-admin'), 'Rückbuchung: Bestellung disputed, Konto für Käufe gesperrt');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_admin', body: buy });
ok(r.status === 403 && r.body.error === 'blocked', 'Gesperrtes Konto kann nicht kaufen');
r = await hook({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_2', reason: 'fraudulent' } } });
ok(r.status === 200 && blocks.size === 1, 'Doppelter Dispute-Webhook: eine Sperre');
r = await hook({ type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_2', status: 'won' } } });
ok(disp.status === 'credited', 'Dispute gewonnen, Gold noch nicht abgezogen: Bestellung gilt wieder');
disp.status = 'disputed'; disp.revoked_at = new Date().toISOString();
r = await hook({ type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_2', status: 'won' } } });
ok(disp.status === 'disputed', 'Dispute gewonnen, Gold schon abgezogen: bleibt (Admin entscheidet)');
r = await hook({ type: 'checkout.session.expired', data: { object: { id: 'cs_x', metadata: { order_id: playerOrder.id } } } });
ok(playerOrder.status === 'expired', 'Abgelaufene Bezahlseite: expired');

// Designs
r = await call(open, '/shop/status');
ok(r.body.priceNote?.startsWith('Alle Preise sind Endpreise') && !r.body.products.some((p) => p.tag === 'Beliebt'), 'Status: Preishinweis, kein „Beliebt“');
ok(r.body.designs?.length >= 3 && r.body.designs.every((d) => d.items.length && d.priceCents > 0), 'Status nennt die Designs');
calls = [];
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { productId: 'design_soul', waiver: true, from: 'web', priceCents: 1 } });
const dOrder = orders.get(r.body.orderId);
const dForm = new URLSearchParams(calls.find((c) => c.url.includes('api.stripe.com'))?.body?.toString());
ok(r.status === 200 && dOrder.kind === 'design' && dOrder.gold === 0 && dOrder.character_id === null && dOrder.items.includes('mount:soul_wolf') && dOrder.amount_cents === 999,
  'Design-Kauf ohne Charakter: Bestellung mit Gegenständen und Katalogpreis');
ok(dForm.get('success_url') === 'https://www.emberwrath.com/shop?kauf=erfolg' && dForm.get('line_items[0][price_data][product_data][name]').startsWith('Seelenwolf'), 'Von der Website: Rückkehr auf /shop');
r = await hook(completed(dOrder, { payment_intent: 'pi_d', customer_details: { email: 'p@x.de' } }));
ok(mails.at(-1).text.includes('Reittier Seelenwolf und Färbung Seelenlicht für alle Charaktere deines Kontos') && mails.at(-1).orderStatus === 'pending', 'Design-Mail, verschickt bevor freigegeben wird');
ok(dOrder.status === 'paid', 'Design bezahlt');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { productId: 'design_soul', waiver: true } });
ok(r.status === 409 && r.body.error === 'owned', 'Design schon gekauft: 409 owned');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { productId: 'gold_35k', waiver: true } });
ok(r.status === 400, 'Gold ohne Charakter: 400');
r = await hook({ type: 'charge.refunded', data: { object: { payment_intent: 'pi_d', refunded: true } } });
ok(dOrder.status === 'refunded' && revoked.includes(dOrder.id), 'Design erstattet: Server entfernt es aus den Spielständen');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_player', body: { productId: 'design_soul', waiver: true } });
ok(r.status === 200, 'Nach Erstattung kann das Design neu gekauft werden');


// Sicherheitsprüfung D5, S13
ok(marks.has(await emailHash('a@x.de')), 'Rückbuchung merkt den E-Mail-Hash');
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_new', body: buy });
ok(r.status === 403 && r.body.error === 'blocked', 'Neues Konto mit derselben E-Mail bleibt gesperrt');
ok(await emailHash('Max.Muster+emberwrath@googlemail.com') === await emailHash('maxmuster@gmail.com') && await emailHash('a.b@web.de') !== await emailHash('ab@web.de'), 'E-Mail normalisiert (Gmail-Punkte, +Zusatz)');
ok(orders.get(disp.id).email_hash === await emailHash('a@x.de'), 'Bestellung speichert nur den Hash');
for (let i = 0; i < 10; i++) await call(open, '/shop/checkout', { method: 'POST', token: 'tok_spam', body: buy });
r = await call(open, '/shop/checkout', { method: 'POST', token: 'tok_spam', body: buy });
ok(r.status === 429 && r.body.error === 'rate_limited', 'Mehr als 10 Bezahlseiten in 10 Minuten: 429');

ok(!(await verifyStripeSignature('{}', await sign('{}', KEYS.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 1000), KEYS.STRIPE_WEBHOOK_SECRET)), 'Alte Signatur (Replay) abgelehnt');
ok(formEncode({ a: { b: { 0: { c: 1 } } }, d: null }).toString() === 'a%5Bb%5D%5B0%5D%5Bc%5D=1', 'Formular-Kodierung für Stripe');

console.log(fails ? `\n${fails} Fehler` : '\nAlle Shop-Prüfungen bestanden');
process.exit(fails ? 1 : 0);
