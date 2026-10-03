import { ZoneShard } from './shard.js';
import { Directory } from './directory.js';
import { DungeonFinder } from './finder/queue.js';
import { handleForms } from './forms.js';
import { handleShop } from './shop.js';
import { ONLINE_CONFIG } from '../src/online/config.js';
import { NET_PATH, MAX_WORLDS, ZONE_ID_RE, shardName } from '../src/net/protocol.js';

// Cloudflare Worker von Emberwrath: liefert die Website (statische Dateien aus dist/site) und betreibt die Welt-Server.
//   /net/ws?zone=<id>&world=<n|auto>&exclude=<n,n>   WebSocket zu einem Shard (Zone × Welt), siehe src/net/protocol.js
//   /net/worlds?zone=<id>                            Welten einer Zone mit Belegung (für „Welt wechseln“)
//   /net/status                                      Spieler online je Zone und Welt
//   /net/finder                                      WebSocket zur Dungeonsuche (worker/finder/, src/finder/README.md)
//   /net/forms/support, /net/newsletter/*            Support-Formular und Newsletter der Website (worker/forms.js)
//   /net/shop/status|checkout|webhook                Gold-Shop mit Stripe (worker/shop.js, docs/SHOP.md)
// Alles andere: statische Dateien (env.ASSETS). Existierende Dateien liefert Cloudflare direkt, ohne den Worker,
// außer den Seitenaufrufen aus assets.run_worker_first (wrangler.jsonc): Die kommen hier vorbei, damit alte Adressen
// (REDIRECT_HOSTS) mit 301 auf CANONICAL_HOST umleiten. /net/* leitet nie um, laufende Verbindungen bleiben bestehen.
export { ZoneShard, Directory, DungeonFinder };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function config(env) {
  return {
    ...env,
    SUPABASE_URL: env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || ONLINE_CONFIG.supabaseAnonKey,
  };
}

const capacity = (env) => Number(env.SHARD_CAPACITY) || 40;
const directory = (env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));

// Nur die eigene Seite darf Welt-Verbindungen öffnen (Browser schicken Origin immer mit).
function originOk(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // Nicht-Browser (Tests); ohne gültiges Token kommt ohnehin niemand hinein
  if (origin === url.origin) return true;
  return String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

async function handleNet(request, env, url) {
  const route = url.pathname.slice(NET_PATH.length);
  const zone = url.searchParams.get('zone') ?? '';
  if (route === '/status') return json({ zones: await directory(env).overview() });
  if (route === '/finder') {
    if (!env.DUNGEON_FINDER) return json({ error: 'unavailable' }, 503);
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'upgrade' }, 426);
    if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
    return env.DUNGEON_FINDER.get(env.DUNGEON_FINDER.idFromName('main')).fetch(request);
  }
  if (!ZONE_ID_RE.test(zone)) return json({ error: 'zone' }, 400);

  if (route === '/worlds') return json({ zone, worlds: await directory(env).list(zone, capacity(env)) });

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${NET_PATH}/`)) {
      const moved = canonicalRedirect(request, url, env);
      if (moved) return moved;
    }
    if (url.pathname.startsWith(`${NET_PATH}/`)) {
      const route = url.pathname.slice(NET_PATH.length);
      if (route.startsWith('/forms/') || route.startsWith('/newsletter/')) {
        try { return (await handleForms(request, config(env), url, route)) ?? json({ error: 'not_found' }, 404); } catch (e) { return json({ error: 'server' }, 500); }
      }
      if (route.startsWith('/shop/')) {
        try { return (await handleShop(request, config(env), url, route)) ?? json({ error: 'not_found' }, 404); } catch (e) { console.error('shop', e?.message); return json({ error: 'server' }, 500); }
      }
      if (!env.ZONE_SHARD || !env.DIRECTORY) return json({ error: 'unavailable' }, 503);
      try { return await handleNet(request, config(env), url); } catch (e) { return json({ error: 'server' }, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
