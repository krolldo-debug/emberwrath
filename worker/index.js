import { ZoneShard } from './shard.js';
import { Directory } from './directory.js';
import { ONLINE_CONFIG } from '../src/online/config.js';
import { NET_PATH, MAX_WORLDS, ZONE_ID_RE, shardName } from '../src/net/protocol.js';

// Cloudflare Worker von Emberwrath: liefert die Website (statische Dateien aus dist/site) und betreibt die Welt-Server.
//   /net/ws?zone=<id>&world=<n|auto>&exclude=<n,n>   WebSocket zu einem Shard (Zone × Welt), siehe src/net/protocol.js
//   /net/worlds?zone=<id>                            Welten einer Zone mit Belegung (für „Welt wechseln“)
//   /net/status                                      Spieler online je Zone und Welt
// Alles andere: statische Dateien (env.ASSETS). Existierende Dateien liefert Cloudflare direkt, ohne den Worker.
export { ZoneShard, Directory };

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${NET_PATH}/`)) {
      if (!env.ZONE_SHARD || !env.DIRECTORY) return json({ error: 'unavailable' }, 503);
      try { return await handleNet(request, config(env), url); } catch (e) { return json({ error: 'server' }, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
