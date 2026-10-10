import { verifyToken } from './auth.js';

// CrazyGames-Fassung (docs/CRAZYGAMES.md): Das Spiel läuft dort auf *.crazygames.com und spricht von dort mit
// diesem Worker. Hier stehen
//   - welche fremden Adressen /net/* benutzen dürfen (CORS, WebSocket-Origin),
//   - POST /net/cg/session: Zugangsdaten für ein Gast- oder CrazyGames-Konto (Supabase), bei Bedarf neu angelegt.
//
// POST /net/cg/session { guest, cg?, link?, repair? } -> { email, password, kind: 'guest'|'cg', linked }
//   guest   Zufallsschlüssel aus dem Browser (22–64 Zeichen [A-Za-z0-9_-]); steht für das Gastkonto dieses Browsers.
//   cg      Token aus dem CrazyGames-SDK (RS256, Schlüssel https://sdk.crazygames.com/publicKey.json, 1 h gültig).
//           Mit Token gibt es das an die CrazyGames-ID gebundene Konto statt des Gastkontos.
//   link    Supabase-Token des Gastkontos: Gibt es zur CrazyGames-ID noch kein Konto, wird das Gastkonto dazu
//           (E-Mail und Passwort umgestellt, Helden bleiben). Nur, wenn Token UND Gastschlüssel zu demselben Konto passen.
//   repair  Anmeldung mit den Zugangsdaten schlug fehl: Passwort auf dem Server neu setzen.
// Konten: E-Mail cg-<hash>@players.emberwrath.com bzw. guest-<hash>@players.emberwrath.com (die Subdomain empfängt
// keine Post), bestätigt angelegt, Passwort = HMAC(CG_SECRET oder SUPABASE_SERVICE_ROLE_KEY, Art + ID). Der Client
// meldet sich damit ganz normal bei Supabase an (Ratelimits von Supabase gelten je Spieler-Adresse, nicht für den Worker).
// Es entstehen nur echte, bestätigte Konten (keine anonymen): Welt-Server, Cloud-Spielstände und Schummelschutz
// behandeln sie wie jedes andere Konto.
//
// Secrets: SUPABASE_SERVICE_ROLE_KEY (gibt es schon). Optional CG_SECRET (sonst gilt der Service-Schlüssel; wer den
// wechselt, braucht nichts zu tun: die nächste Anmeldung setzt das Passwort per repair neu). Optional CG_GAME_ID:
// nur Tokens dieses Spiels annehmen.

const PLAYER_DOMAIN = 'players.emberwrath.com';
const CG_KEY_URL = 'https://sdk.crazygames.com/publicKey.json';
const KEY_TTL_MS = 60 * 60 * 1000, KEY_REFRESH_MS = 60 * 1000;
const GUEST_RE = /^[A-Za-z0-9_-]{22,64}$/;
const CG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ------------------------------------------------------------------ Herkunft und CORS
// Spielseiten von CrazyGames: *.crazygames.com (das Spiel selbst läuft auf <spiel>.game-files.crazygames.com),
// dazu die Apps (Android https://app.crazygames.com, iOS capacitor://app.crazygames.com).
// Siehe docs.crazygames.com/resources/html5/sitelock. Weitere Adressen: Variable ALLOWED_ORIGINS (Komma-Liste).
export function crazyOrigin(origin) {
  if (typeof origin !== 'string') return false;
  return /^https:\/\/([a-z0-9-]+\.)*crazygames\.com$/.test(origin) || origin === 'capacitor://app.crazygames.com';
}

export function corsOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (crazyOrigin(origin)) return origin;
  return String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin) ? origin : null;
}

// Antwort für eine fremde Herkunft freigeben. WebSocket-Antworten (101) bleiben unverändert.
export function withCors(res, origin) {
  if (!origin || res.status === 101 || res.webSocket) return res;
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', origin);
  out.headers.append('Vary', 'Origin');
  return out;
}

export function preflight(origin) {
  return new Response(null, {
    status: origin ? 204 : 403,
    headers: origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } : {},
  });
}

// ------------------------------------------------------------------ Hilfen
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(text));
}
// Passwort mit allen Zeichenarten (falls im Projekt strengere Passwortregeln eingestellt sind).
const passwordFor = async (secret, what) => `Ew9!${b64url(await hmac(secret, `emberwrath-cg:${what}`))}`;
const guestEmail = async (guest) => `guest-${hex(await crypto.subtle.digest('SHA-256', enc.encode(guest))).slice(0, 32)}@${PLAYER_DOMAIN}`;
// E-Mail-Adressen sind ohne Groß/Klein: die CrazyGames-ID geht deshalb gehasht hinein (sie steht in user_metadata).
const cgEmail = async (userId) => `cg-${hex(await crypto.subtle.digest('SHA-256', enc.encode(userId))).slice(0, 32)}@${PLAYER_DOMAIN}`;
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);

// ------------------------------------------------------------------ CrazyGames-Token prüfen
let cgKey = null; // { at, keys: CryptoKey[] }

async function importKeys(data) {
  const out = [];
  const pems = [];
  if (typeof data === 'string') pems.push(data);
  else if (typeof data?.publicKey === 'string') pems.push(data.publicKey);
  for (const pem of pems) {
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    try { out.push(await crypto.subtle.importKey('spki', b64urlBytes(body.replace(/\+/g, '-').replace(/\//g, '_')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])); } catch { /* unbrauchbar */ }
  }
  for (const jwk of Array.isArray(data?.keys) ? data.keys : []) {
    try { out.push(await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])); } catch { /* unbrauchbar */ }
  }
  return out;
}

async function cgKeys(env, fetchImpl, force = false) {
  const age = cgKey ? Date.now() - cgKey.at : Infinity;
  if (cgKey && age < KEY_TTL_MS && (!force || age < KEY_REFRESH_MS)) return cgKey.keys;
  let keys = [];
  try {
    const res = await fetchImpl(env.CG_KEY_URL || CG_KEY_URL, { headers: { accept: 'application/json' } });
    if (res.ok) { const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; } keys = await importKeys(data); }
  } catch { /* Netzfehler */ }
  if (keys.length || !cgKey) cgKey = { at: Date.now(), keys };
  return cgKey.keys;
}

// -> { userId, username } oder null
export async function verifyCrazyToken(token, env, fetchImpl = fetch) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
  } catch { return null; }
  if (header.alg !== 'RS256') return null;
  const data = enc.encode(`${parts[0]}.${parts[1]}`), sig = b64urlBytes(parts[2]);
  const check = async (keys) => { for (const k of keys) if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, sig, data).catch(() => false)) return true; return false; };
  // Schlüsselwechsel bei CrazyGames: bei Fehlschlag einmal neu laden (höchstens einmal je Minute).
  if (!(await check(await cgKeys(env, fetchImpl))) && !(await check(await cgKeys(env, fetchImpl, true)))) return null;
  const now = Date.now() / 1000;
  if (typeof payload.exp !== 'number' || payload.exp < now - 30) return null;
  if (typeof payload.iat === 'number' && payload.iat > now + 300) return null;
  const userId = payload.userId == null ? '' : String(payload.userId);
  if (!CG_ID_RE.test(userId)) return null;
  if (env.CG_GAME_ID && String(payload.gameId) !== String(env.CG_GAME_ID)) return null;
  return { userId, username: cleanName(payload.username) };
}

// ------------------------------------------------------------------ Supabase Auth (Admin)
async function admin(env, path, { method = 'GET', body } = {}, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL).replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const r = await fetchImpl(`${base}/auth/v1${path}`, {
    method,
    // sb_secret_… nur als apikey; ältere service_role-Schlüssel (JWT) zusätzlich als Bearer (wie worker/forms.js)
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { status: r.status, ok: r.ok, data };
}
const exists = (r) => r.status === 422 && /exist|registered/i.test(`${r.data?.error_code ?? r.data?.code ?? ''} ${r.data?.msg ?? r.data?.message ?? ''}`);

async function createUser(env, account, fetchImpl) {
  const r = await admin(env, '/admin/users', {
    method: 'POST',
    body: { email: account.email, password: account.password, email_confirm: true, user_metadata: account.meta },
  }, fetchImpl);
  if (r.ok || exists(r)) return true;
  throw new Error(`create ${r.status}`);
}

// Passwort des bestehenden Kontos neu setzen (ID über generate_link: liefert das Nutzerobjekt, verschickt nichts).
async function resetPassword(env, account, fetchImpl) {
  const link = await admin(env, '/admin/generate_link', { method: 'POST', body: { type: 'magiclink', email: account.email } }, fetchImpl);
  const id = link.data?.id ?? link.data?.user?.id;
  if (!link.ok || typeof id !== 'string') throw new Error(`lookup ${link.status}`);
  const r = await admin(env, `/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: { password: account.password, user_metadata: account.meta } }, fetchImpl);
  if (!r.ok) throw new Error(`reset ${r.status}`);
}

// Gastkonto zum CrazyGames-Konto machen. -> true (übernommen) | false (CrazyGames-Konto gibt es schon / passt nicht)
async function linkGuest(env, linkToken, guestMail, account, fetchImpl) {
  const who = await verifyToken(linkToken, { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, fetchImpl });
  if (!who || who.email?.toLowerCase() !== guestMail) return false;
  const r = await admin(env, `/admin/users/${encodeURIComponent(who.uid)}`, {
    method: 'PUT',
    body: { email: account.email, password: account.password, email_confirm: true, user_metadata: account.meta },
  }, fetchImpl);
  if (r.ok) return true;
  if (exists(r)) return false;
  throw new Error(`link ${r.status}`);
}

// ------------------------------------------------------------------ Route
export async function handleCrazyGames(request, env, url, route, fetchImpl = fetch) {
  if (route !== '/cg/session') return null;
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const secret = String(env.CG_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!secret || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'unavailable' }, 503);
  // Browser: nur von CrazyGames (bzw. ALLOWED_ORIGINS) oder der eigenen Seite.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin && !corsOrigin(request, env)) return json({ error: 'origin' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (!b || typeof b !== 'object' || typeof b.guest !== 'string' || !GUEST_RE.test(b.guest)) return json({ error: 'bad_request' }, 400);

  const guestMail = await guestEmail(b.guest);
  let account;
  if (b.cg != null) {
    const cg = await verifyCrazyToken(b.cg, env, fetchImpl);
    if (!cg) return json({ error: 'cg_token' }, 401);
    account = {
      kind: 'cg', email: await cgEmail(cg.userId), password: await passwordFor(secret, `cg:${cg.userId}`),
      meta: { platform: 'crazygames', cg_user_id: cg.userId, ...(cg.username ? { display_name: cg.username } : {}) },
    };
  } else {
    account = { kind: 'guest', email: guestMail, password: await passwordFor(secret, `guest:${b.guest}`), meta: { platform: 'crazygames', display_name: 'Gast' } };
  }

  let linked = false;
  if (account.kind === 'cg' && typeof b.link === 'string') linked = await linkGuest(env, b.link, guestMail, account, fetchImpl);
  if (!linked) await createUser(env, account, fetchImpl);
  if (b.repair === true) await resetPassword(env, account, fetchImpl);
  return json({ email: account.email, password: account.password, kind: account.kind, linked });
}
