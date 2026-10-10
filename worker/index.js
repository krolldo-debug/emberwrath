import { ZoneShard } from './shard.js';
import { Directory } from './directory.js';
import { DungeonFinder } from './finder/queue.js';
import { handleForms } from './forms.js';
import { handleShop } from './shop.js';
import { handleCrazyGames, corsOrigin, withCors, preflight } from './crazygames.js';
import { ONLINE_CONFIG } from '../src/online/config.js';
import { NET_PATH, MAX_WORLDS, ZONE_ID_RE, shardName } from '../src/net/protocol.js';
import { ZONES } from '../src/world/zones.js';
import { pageHeaders } from './headers.js';

// Cloudflare Worker von Emberwrath: liefert die Website (statische Dateien aus dist/site) und betreibt die Welt-Server.
//   /net/ws?zone=<id>&world=<n|auto>&exclude=<n,n>   WebSocket zu einem Shard (Zone × Welt), siehe src/net/protocol.js
//   /net/worlds?zone=<id>                            Welten einer Zone mit Belegung (für „Welt wechseln“)
//   /net/status                                      Spieler online je Zone und Welt
//   /net/finder                                      WebSocket zur Dungeonsuche (worker/finder/, src/finder/README.md)
//   /net/forms/support, /net/newsletter/*            Support-Formular und Newsletter der Website (worker/forms.js)
//   /net/shop/status|checkout|webhook                Gold-Shop mit Stripe (worker/shop.js, docs/SHOP.md)
//   /net/cg/session                                  Konten der CrazyGames-Fassung (worker/crazygames.js, docs/CRAZYGAMES.md)
// /net/* beantwortet auch Anfragen von CrazyGames (*.crazygames.com, CORS und WebSocket-Origin, worker/crazygames.js).
// Alles andere: statische Dateien (env.ASSETS). Existierende Dateien liefert Cloudflare direkt, ohne den Worker,
// außer den Seitenaufrufen aus assets.run_worker_first (wrangler.jsonc): Die kommen hier vorbei, damit alte Adressen
// (REDIRECT_HOSTS) mit 301 auf CANONICAL_HOST umleiten. /net/* leitet nie um, laufende Verbindungen bleiben bestehen.
export { ZoneShard, Directory, DungeonFinder };

const json = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
});

// Öffentliche Übersichten (/net/status, /net/worlds) wenige Sekunden zwischenspeichern:
// sonst landet jeder Aufruf (Startseite, Abfragen von außen) beim einzigen Directory-Objekt.
// Schlüssel nur aus Pfad und den bekannten Parametern: /net/status?x=zufall umgeht den Zwischenspeicher nicht.
// Nur GET/HEAD (POST /net/status ginge sonst an jedem Zwischenspeicher vorbei). Fehlt der Treffer (erste Anfrage,
// oder *.workers.dev, wo der Zwischenspeicher nicht wirkt), gilt das Ratelimit je Adresse.
async function cachedJson(request, env, ctx, route, make, params = []) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method' }, 405);
  const cache = globalThis.caches?.default;
  const src = new URL(request.url), clean = new URL(src.pathname, src.origin);
  for (const k of params) if (src.searchParams.has(k)) clean.searchParams.set(k, src.searchParams.get(k));
  const key = new Request(clean.toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return hit;
  }
  if (await limited(request, env, route)) return json({ error: 'rate_limited' }, 429);
  const res = json(await make(), 200, 'public, max-age=5');
  if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

function config(env) {
  return {
    ...env,
    SUPABASE_URL: env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || ONLINE_CONFIG.supabaseAnonKey,
  };
}

const capacity = (env) => Number(env.SHARD_CAPACITY) || 40;

// Nur echte Zonen (src/world/zones.js): Zufallsnamen erzeugen weder Einträge im Directory noch Durable Objects.
// Tests mit Zufallszonen: wrangler dev --var NET_ANY_ZONE:true.
const ZONE_IDS = new Set(Object.keys(ZONES));

// Anfragen je Adresse begrenzen (Binding NET_LIMITER, 120 je Minute und Route; mehrere Spieler hinter einer
// Mobilfunk-Adresse bleiben weit darunter). Fehlt das Binding (Tests), gilt kein Limit.
async function limited(request, env, route) {
  if (!env.NET_LIMITER) return false;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!ip) return false;
  const { success } = await env.NET_LIMITER.limit({ key: `${route}:${ip}` }).catch(() => ({ success: true }));
  return !success;
}
const directory = (env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));

// Nur die eigene Seite (und die CrazyGames-Fassung, ALLOWED_ORIGINS) darf Welt-Verbindungen öffnen (Browser schicken Origin immer mit).
function originOk(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // Nicht-Browser (Tests); ohne gültiges Token kommt ohnehin niemand hinein
  if (origin === url.origin) return true;
  return !!corsOrigin(request, env);
}

async function handleNet(request, env, url, ctx) {
  const route = url.pathname.slice(NET_PATH.length);
  const zone = url.searchParams.get('zone') ?? '';
  if (route === '/status') return cachedJson(request, env, ctx, route, async () => ({ zones: await directory(env).overview() }));
  if ((route === '/finder' || route === '/ws') && await limited(request, env, route)) {
    return json({ error: 'rate_limited' }, 429);
  }
  if (route === '/finder') {
    if (!env.DUNGEON_FINDER) return json({ error: 'unavailable' }, 503);
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'upgrade' }, 426);
    if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
    return env.DUNGEON_FINDER.get(env.DUNGEON_FINDER.idFromName('main')).fetch(request);
  }
  if (!ZONE_ID_RE.test(zone) || (!ZONE_IDS.has(zone) && env.NET_ANY_ZONE !== 'true')) return json({ error: 'zone' }, 400);

  if (route === '/worlds') return cachedJson(request, env, ctx, route, async () => ({ zone, worlds: await directory(env).list(zone, capacity(env)) }), ['zone']);

  if (route === '/ws') {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'upgrade' }, 426);
    if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
    const pref = url.searchParams.get('world');
    const exclude = (url.searchParams.get('exclude') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_WORLDS).slice(0, MAX_WORLDS);
    const want = pref && pref !== 'auto' ? Number(pref) : null;
    const { world } = await directory(env).assign(zone, Number.isInteger(want) ? want : null, capacity(env), exclude);
    const stub = env.ZONE_SHARD.get(env.ZONE_SHARD.idFromName(shardName(zone, world)));
    const target = new URL(request.url);
    target.search = `?zone=${encodeURIComponent(zone)}&world=${world}`;
    return stub.fetch(new Request(target, request));
  }
  return json({ error: 'not_found' }, 404);
}

// Seitenaufruf auf einer alten Adresse → dieselbe Seite auf der Hauptadresse (Pfad und Suchteil bleiben).
function canonicalRedirect(request, url, env) {
  const host = String(env.CANONICAL_HOST ?? '').trim();
  if (!host || url.hostname === host) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const from = String(env.REDIRECT_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!from.includes(url.hostname)) return null;
  return new Response(null, {
    status: 301,
    headers: { location: `https://${host}${url.pathname}${url.search}`, 'cache-control': 'public, max-age=3600' },
  });
}

// Seiten aus run_worker_first gehen durch env.ASSETS.fetch. Fehlen dort die Header aus dist/site/_headers (C1),
// setzt der Worker die gleichen Sicherheits-Header (CSP ohne Skript-Hash, also mit 'unsafe-inline' wie bisher).
// Sind sie schon da, bleibt die Antwort unverändert.
async function assetWithHeaders(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!/text\/html/i.test(res.headers.get('content-type') ?? '') || res.headers.has('content-security-policy')) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(pageHeaders(config(env).SUPABASE_URL))) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${NET_PATH}/`)) {
      const moved = canonicalRedirect(request, url, env);
      if (moved) return moved;
    }
    if (url.pathname.startsWith(`${NET_PATH}/`)) {
      // Spiel auf CrazyGames (fremde Adresse): Vorabfrage beantworten, Antworten freigeben. Shop und Formulare nicht.
      const route = url.pathname.slice(NET_PATH.length);
      const cors = route.startsWith('/shop/') || route.startsWith('/forms/') || route.startsWith('/newsletter/') ? null : corsOrigin(request, env);
      if (request.method === 'OPTIONS' && cors) return preflight(cors);
      return withCors(await net(request, env, url, route, ctx), cors);
    }
    return assetWithHeaders(request, env);
  },
};

// Alle /net/*-Routen (ohne CORS, das setzt fetch() oben).
async function net(request, env, url, route, ctx) {
  if (route.startsWith('/forms/') || route.startsWith('/newsletter/')) {
    try { return (await handleForms(request, config(env), url, route, ctx)) ?? json({ error: 'not_found' }, 404); } catch (e) { console.error('forms', e?.message); return json({ error: 'server' }, 500); }
  }
  if (route.startsWith('/shop/')) {
    // Bezahlseite: vor Token-Prüfung und Datenbank begrenzen (jedes gefälschte HS256-Token fragt sonst Supabase Auth)
    if (route === '/shop/checkout' && await limited(request, env, route)) return json({ error: 'rate_limited' }, 429);
    try { return (await handleShop(request, config(env), url, route)) ?? json({ error: 'not_found' }, 404); } catch (e) { console.error('shop', e?.message); return json({ error: 'server' }, 500); }
  }
  if (route.startsWith('/cg/')) {
    // Legt Konten an: vor allem anderen begrenzen, zusätzlich enger je Adresse (CG_LIMITER, 20 je Minute)
    if (await limited(request, env, '/cg') || await limited(request, { NET_LIMITER: env.CG_LIMITER }, '/cg')) return json({ error: 'rate_limited' }, 429);
    try { return (await handleCrazyGames(request, config(env), url, route)) ?? json({ error: 'not_found' }, 404); } catch (e) { console.error('cg', e?.message); return json({ error: 'server' }, 500); }
  }
  if (!env.ZONE_SHARD || !env.DIRECTORY) return json({ error: 'unavailable' }, 503);
  try { return await handleNet(request, config(env), url, ctx); } catch (e) { console.error('net', e?.message); return json({ error: 'server' }, 500); }
}
