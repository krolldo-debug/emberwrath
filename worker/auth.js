// Prüft das Supabase-Zugriffstoken eines Spielers (dasselbe Konto wie für Anmeldung und Cloud-Spielstände).
//
// Weg 1 (schnell, ohne Netz nach dem ersten Mal): asymmetrisch signierte Tokens (ES256/RS256) gegen die öffentlichen
// Schlüssel des Projekts (/auth/v1/.well-known/jwks.json, 10 min zwischengespeichert).
// Weg 2 (Rückfall, nur für Tokens mit alg HS256, z. B. ältere Projekte): Supabase selbst fragen (/auth/v1/user).
// Fehlschläge werden kurz gemerkt, damit eine Flut gefälschter Tokens nicht bei Supabase Auth ankommt.
// Geprüft wird immer: Ablauf, nbf, aud und role „authenticated“, Aussteller dieses Projekts, keine anonyme Anmeldung.
// Ergebnis: { uid, email } oder null.

const JWKS_TTL_MS = 10 * 60 * 1000;
// Leere Liste (Netzfehler) nur kurz merken; unbekannte kid (Schlüsselwechsel) höchstens einmal je Minute neu laden.
const JWKS_EMPTY_TTL_MS = 30_000, JWKS_REFRESH_MS = 60_000;
const jwksCache = new Map(); // url -> { at, keys: Map(kid -> CryptoKey) }
const FAIL_TTL_MS = 60_000, FAIL_MAX = 5000;
const failed = new Map(); // Token-Hash -> Zeitpunkt (Rückfall-Fehlschläge)
const hs256Ok = new Map(); // Token-Hash -> { uid, email, exp } (erfolgreicher Rückfall bis zum Ablauf)

async function tokenHash(token) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...d.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function remember(map, key, value) {
  if (map.size >= FAIL_MAX) map.delete(map.keys().next().value);
  map.set(key, value);
}

const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

const ALGS = {
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
};

async function jwksKeys(base, fetchImpl, kid = null) {
  const url = `${base}/auth/v1/.well-known/jwks.json`;
  const hit = jwksCache.get(url);
  if (hit) {
    const age = Date.now() - hit.at;
    const fresh = age < (hit.keys.size ? JWKS_TTL_MS : JWKS_EMPTY_TTL_MS);
    if (fresh && (!kid || hit.keys.has(kid) || age < JWKS_REFRESH_MS)) return hit.keys;
  }
  const keys = new Map();
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (res.ok) {
      const { keys: list = [] } = await res.json();
      for (const jwk of list) {
        const alg = ALGS[jwk.alg] ?? (jwk.kty === 'EC' ? ALGS.ES256 : jwk.kty === 'RSA' ? ALGS.RS256 : null);
        if (!alg || !jwk.kid) continue;
        try { keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, alg.import, false, ['verify'])); } catch { /* unbrauchbarer Schlüssel */ }
      }
    }
  } catch { /* Netzfehler: leer, Rückfall greift */ }
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}

function claimsOk(p, base) {
  const now = Date.now() / 1000;
  if (typeof p.sub !== 'string' || !p.sub) return false;
  if (typeof p.exp !== 'number' || p.exp < now - 30) return false;
  if (typeof p.nbf === 'number' && p.nbf > now + 30) return false;
  if (p.role !== 'authenticated') return false;
  if (!(Array.isArray(p.aud) ? p.aud.includes('authenticated') : p.aud === 'authenticated')) return false;
  if (p.iss !== `${base}/auth/v1`) return false;
  if (p.is_anonymous === true) return false; // anonyme Anmeldung zählt nicht als Konto
  return true;
}

export async function verifyToken(token, { supabaseUrl, anonKey, fetchImpl = fetch }) {
  if (typeof token !== 'string' || token.length > 8192 || !supabaseUrl) return null;
  const base = supabaseUrl.replace(/\/+$/, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let payload;
  try {
    const header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
    const alg = ALGS[header.alg];
    if (alg) {
      const key = typeof header.kid === 'string' ? (await jwksKeys(base, fetchImpl, header.kid)).get(header.kid) : null;
      if (!key) return null;
      const ok = await crypto.subtle.verify(alg.verify, key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      return ok && claimsOk(payload, base) ? { uid: payload.sub, email: payload.email ?? null } : null;
    }
    if (header.alg !== 'HS256') return null; // „none“ und alles Unbekannte
  } catch { return null; }
  // HS256: nur Supabase kennt das Geheimnis. Angaben vorab prüfen, dann einmal nachfragen und das Ergebnis merken.
  if (!claimsOk(payload, base)) return null;
  const h = await tokenHash(token);
  const now = Date.now();
  const okHit = hs256Ok.get(h);
  if (okHit) return okHit.exp * 1000 > now ? { uid: okHit.uid, email: okHit.email } : null;
  const failAt = failed.get(h);
  if (failAt && now - failAt < FAIL_TTL_MS) return null;
  try {
    const res = await fetchImpl(`${base}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey ?? '' } });
    const u = res.ok ? await res.json() : null;
    if (typeof u?.id !== 'string' || u.id !== payload.sub || u.is_anonymous === true) { remember(failed, h, now); return null; }
    remember(hs256Ok, h, { uid: u.id, email: u.email ?? null, exp: payload.exp });
    return { uid: u.id, email: u.email ?? null };
  } catch { return null; } // Netzfehler nicht merken: beim nächsten Versuch erneut
}
