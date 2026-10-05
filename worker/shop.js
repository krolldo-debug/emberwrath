import { verifyToken } from './auth.js';
import { GOLD_PACKS, DESIGNS, SHOP_CURRENCY, findPack, findDesign, packTotal, packName, RETURN_PARAM } from '../src/shop/catalog.js';

// Shop: Gold und exklusive Designs für Echtgeld über Stripe Checkout. Gutgeschrieben wird nur nach einer von Stripe signierten
// Zahlungsbestätigung (Webhook), nie auf Zuruf des Spiels. Einrichtung und Freischalten: docs/SHOP.md.
//   GET  /net/shop/status     → { enabled, configured, products, designs }
//   POST /net/shop/checkout   { productId, characterId, waiver: true, from: 'game'|'web' }, Authorization: Bearer <Supabase-Token> → { url }
//                             Gold-Pakete brauchen characterId, Designs gelten fürs ganze Konto (characterId entfällt).
//                             from 'web': Rückkehr auf die Shop-Seite der Website (/shop), sonst ins Spiel (/spielen/).
//   POST /net/shop/webhook    Stripe-Webhook (Signatur im Header Stripe-Signature)
//
// Variablen und Secrets (Cloudflare › Settings › Variables and Secrets):
//   SHOP_ENABLED              Variable 'true' schaltet den Shop für alle frei. Ohne sie können nur Admins kaufen
//                             (zum Testen, z. B. mit Stripe-Testschlüsseln sk_test_…).
//   STRIPE_SECRET_KEY         Secret, sk_live_… bzw. sk_test_… (Stripe › Entwickler › API-Schlüssel).
//   STRIPE_WEBHOOK_SECRET     Secret, whsec_… des Webhook-Endpunkts https://www.emberwrath.com/net/shop/webhook.
//   STRIPE_REQUIRE_TOS        Variable 'true': Stripe verlangt beim Bezahlen die Zustimmung zu den AGB
//                             (AGB-Adresse vorher in Stripe › Einstellungen › Öffentliche Details eintragen).
//   SUPABASE_SERVICE_ROLE_KEY Secret (wie für den Newsletter), Bestellungen in public.gold_orders.

const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_S = 300;
const CHARACTER_RE = /^[A-Za-z0-9_-]{1,64}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const site = (env) => (env.SITE_URL || 'https://www.emberwrath.com').replace(/\/$/, '');
const flag = (v) => String(v ?? '').trim().toLowerCase() === 'true';

export const shopConfigured = (env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.SUPABASE_SERVICE_ROLE_KEY);
export const shopEnabled = (env) => shopConfigured(env) && flag(env.SHOP_ENABLED);

function originOk(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  if (origin === url.origin) return true;
  return String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

// ------------------------------------------------------------------ Supabase
async function db(env, path, { method = 'GET', body, prefer } = {}) {
  const base = String(env.SUPABASE_URL).replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const r = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      // sb_secret_… nur als apikey; ältere service_role-JWTs (eyJ…) zusätzlich als Bearer.
      apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`db ${r.status}`);
  const text = await r.text(); // return=minimal liefert 201/204 ohne Inhalt
  return text ? JSON.parse(text) : null;
}

// Admin-Recht mit dem Token des Spielers erfragen (Funktion is_admin prüft serverseitig).
async function isAdmin(env, token) {
  try {
    const base = String(env.SUPABASE_URL).replace(/\/$/, '');
    const r = await fetch(`${base}/rest/v1/rpc/is_admin`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY ?? '', authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
    });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

// ------------------------------------------------------------------ Stripe
// Verschachtelte Objekte → application/x-www-form-urlencoded (a[b][0][c]=…), wie die Stripe-API es erwartet.
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(env, path, params, idempotencyKey) {
  const r = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: formEncode(params),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe ${r.status} ${d?.error?.code ?? ''}`);
  return d;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Prüft den Header Stripe-Signature (t=…,v1=…). Liefert true nur bei gültiger, frischer Signatur.
export async function verifyStripeSignature(payload, header, secret, now = Date.now() / 1000) {
  if (!header || !secret) return false;
  let t = null; const sigs = [];
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('=');
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === 't') t = Number(v); else if (k === 'v1') sigs.push(v);
  }
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now - t) > SIGNATURE_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => safeEqual(s, mac));
}

// ------------------------------------------------------------------ Endpunkte
function status(env) {
  return json({
    enabled: shopEnabled(env),
    configured: shopConfigured(env),
    products: GOLD_PACKS.map((p) => ({ id: p.id, gold: p.gold, bonus: p.bonus, total: packTotal(p), priceCents: p.priceCents, tag: p.tag ?? null })),
    designs: DESIGNS.map((d) => ({ id: d.id, name: d.name, items: d.items, priceCents: d.priceCents, tag: d.tag ?? null })),
    currency: SHOP_CURRENCY,
  });
}

async function checkout(request, env, url) {
  if (!shopConfigured(env)) return json({ error: 'unavailable' }, 503);
  if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await verifyToken(token, { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY });
  if (!user) return json({ error: 'auth' }, 401);
  if (!shopEnabled(env) && !(await isAdmin(env, token))) return json({ error: 'closed' }, 403);
  // Gesperrt nach Rückbuchung, oder erstattetes Gold ist im Spiel noch nicht wieder abgezogen.
  const uid = encodeURIComponent(user.uid);
  const [blocked, owed] = await Promise.all([
    db(env, `shop_blocks?user_id=eq.${uid}&select=user_id`),
    db(env, `gold_orders?user_id=eq.${uid}&status=in.(refunded,disputed)&credited_at=not.is.null&revoked_at=is.null&select=id&limit=1`),
  ]);
  if (blocked?.length) return json({ error: 'blocked' }, 403);
  if (owed?.length) return json({ error: 'revoke_pending' }, 409);

  let b = null;
  try { b = await request.json(); } catch { /* unten abgelehnt */ }
  const pack = findPack(b?.productId);
  const design = pack ? null : findDesign(b?.productId);
  if (!pack && !design) return json({ error: 'bad_request' }, 400);
  if (pack && !CHARACTER_RE.test(String(b?.characterId ?? ''))) return json({ error: 'bad_request' }, 400);
  if (b.waiver !== true) return json({ error: 'waiver' }, 400);
  if (design) {
    // Schon bezahlt (auch über ein anderes Design mit denselben Gegenständen)? Dann nicht doppelt verkaufen.
    const have = await db(env, `gold_orders?user_id=eq.${uid}&kind=eq.design&status=in.(paid,credited)&items=ov.${encodeURIComponent(`{${design.items.join(',')}}`)}&select=id&limit=1`);
    if (have?.length) return json({ error: 'owned' }, 409);
  }

  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  const characterId = pack ? b.characterId : null;
  const priceCents = pack ? pack.priceCents : design.priceCents;
  await db(env, 'gold_orders', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id: orderId, user_id: user.uid, character_id: characterId, product_id: (pack ?? design).id,
      kind: pack ? 'gold' : 'design', items: pack ? [] : design.items, gold: pack ? packTotal(pack) : 0,
      amount_cents: priceCents, currency: SHOP_CURRENCY, status: 'pending', withdrawal_waiver_at: now,
    },
  });

  const back = b.from === 'web' ? `${site(env)}/shop?${RETURN_PARAM}=` : `${site(env)}/spielen/?${RETURN_PARAM}=`;
  const meta = { order_id: orderId, user_id: user.uid, character_id: characterId, product_id: (pack ?? design).id };
  const session = await stripe(env, '/checkout/sessions', {
    mode: 'payment',
    locale: 'de',
    client_reference_id: orderId,
    customer_email: user.email ?? undefined,
    success_url: `${back}erfolg`,
    cancel_url: `${back}abbruch`,
    line_items: { 0: { quantity: 1, price_data: { currency: SHOP_CURRENCY, unit_amount: priceCents, product_data: pack
      ? { name: packName(pack), description: 'Emberwrath – Gold für deinen Charakter' }
      : { name: `${design.name} (exklusives Design)`, description: 'Emberwrath – exklusives Design für alle Charaktere deines Kontos' } } } },
    metadata: meta,
    payment_intent_data: { metadata: meta },
    custom_text: { submit: { message: pack
      ? 'Das Gold wird sofort nach der Zahlung gutgeschrieben. Mit dem Kauf erlischt dein Widerrufsrecht (§ 356 Abs. 5 BGB).'
      : 'Das Design wird sofort nach der Zahlung freigeschaltet. Mit dem Kauf erlischt dein Widerrufsrecht (§ 356 Abs. 5 BGB).' } },
    ...(flag(env.STRIPE_REQUIRE_TOS) ? { consent_collection: { terms_of_service: 'required' } } : {}),
  }, orderId);

  await db(env, `gold_orders?id=eq.${orderId}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { stripe_session_id: session.id, livemode: !!session.livemode },
  });
  return json({ url: session.url, orderId });
}

// Bestellung zu einer Checkout-Session aktualisieren, nur aus den erlaubten Vorgängerzuständen (idempotent).
async function setOrder(env, filter, from, patch) {
  await db(env, `gold_orders?${filter}&status=in.(${from.join(',')})`, { method: 'PATCH', prefer: 'return=minimal', body: patch });
}

const byPi = (pi) => `stripe_payment_intent=eq.${encodeURIComponent(pi)}`;

// Erstattete/zurückgebuchte Bestellungen serverseitig abziehen (Gold im Spielstand, Designs aus allen Charakteren).
// Fehlt die Funktion noch (Migration 20261005120000 nicht ausgeführt), zieht das Spiel das Gold beim nächsten Start ab.
async function serverRevoke(env, pi) {
  try {
    const orders = await db(env, `gold_orders?${byPi(pi)}&status=in.(refunded,disputed)&revoked_at=is.null&select=id`);
    for (const o of orders ?? []) await db(env, 'rpc/shop_server_revoke', { method: 'POST', body: { p_order: o.id } });
  } catch (e) { console.error('shop revoke', e?.message); }
}

async function webhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'unavailable' }, 503);
  const payload = await request.text();
  if (payload.length > 200000) return json({ error: 'too_large' }, 413);
  if (!(await verifyStripeSignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'signature' }, 400);
  }
  let event;
  try { event = JSON.parse(payload); } catch { return json({ error: 'bad_request' }, 400); }
  const obj = event?.data?.object ?? {};
  const orderId = obj.metadata?.order_id ?? obj.client_reference_id;
  const byOrder = orderId && /^[0-9a-f-]{36}$/i.test(orderId) ? `id=eq.${orderId}` : null;
  const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id ?? null;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (!byOrder || obj.payment_status !== 'paid') break; // z. B. Überweisung: kommt später als async_payment_succeeded
      const [order] = await db(env, `gold_orders?${byOrder}&select=amount_cents,currency`);
      // Betrag und Währung müssen zur Bestellung passen, sonst wird nichts gutgeschrieben.
      if (!order || obj.amount_total !== order.amount_cents || String(obj.currency).toLowerCase() !== order.currency) break;
      await setOrder(env, byOrder, ['pending', 'failed', 'expired'], {
        status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: pi, stripe_session_id: obj.id, livemode: !!obj.livemode,
      });
      break;
    }
    case 'checkout.session.async_payment_failed':
      if (byOrder) await setOrder(env, byOrder, ['pending'], { status: 'failed' });
      break;
    case 'checkout.session.expired':
      if (byOrder) await setOrder(env, byOrder, ['pending'], { status: 'expired' });
      break;
    case 'charge.refunded':
      // Nur volle Erstattungen; Teilerstattungen bucht ein Admin von Hand nach (docs/SHOP.md).
      if (pi && obj.refunded) {
        await setOrder(env, byPi(pi), ['paid', 'credited', 'disputed'], { status: 'refunded' });
        await serverRevoke(env, pi);
      }
      break;
    case 'charge.dispute.created': {
      // Rückbuchung durch Bank/PayPal: Gold wird im Spiel abgezogen, das Konto für weitere Käufe gesperrt.
      if (!pi) break;
      await setOrder(env, byPi(pi), ['paid', 'credited'], { status: 'disputed' });
      const [order] = await db(env, `gold_orders?${byPi(pi)}&select=user_id`);
      if (order?.user_id) {
        await db(env, 'shop_blocks', {
          method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
          body: { user_id: order.user_id, reason: `Rückbuchung ${String(obj.id ?? '').slice(0, 60)} (${String(obj.reason ?? '').slice(0, 40)})` },
        });
      }
      await serverRevoke(env, pi);
      break;
    }
    case 'charge.dispute.closed':
      // Gewonnen und Gold noch nicht abgezogen: Bestellung gilt wieder. Die Kaufsperre hebt ein Admin auf.
      // Designs (nie 'credited') gelten wieder als bezahlt und kommen beim nächsten Abgleich ins Spiel zurück.
      if (pi && obj.status === 'won') {
        await setOrder(env, `${byPi(pi)}&revoked_at=is.null&credited_at=not.is.null`, ['disputed'], { status: 'credited' });
        await setOrder(env, `${byPi(pi)}&credited_at=is.null`, ['disputed'], { status: 'paid' });
      }
      break;
    default: break;
  }
  return json({ received: true });
}

export async function handleShop(request, env, url, route) {
  if (route === '/shop/status' && request.method === 'GET') return status(env);
  if (route === '/shop/checkout' && request.method === 'POST') return checkout(request, env, url);
  if (route === '/shop/webhook' && request.method === 'POST') return webhook(request, env);
  return null;
}
