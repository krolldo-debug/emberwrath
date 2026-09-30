// Prüft das Supabase-Zugriffstoken eines Spielers (dasselbe Konto wie für Anmeldung und Cloud-Spielstände).
//
// Weg 1 (schnell, ohne Netz nach dem ersten Mal): asymmetrisch signierte Tokens (ES256/RS256) gegen die öffentlichen
// Schlüssel des Projekts (/auth/v1/.well-known/jwks.json, 10 min zwischengespeichert).
// Weg 2 (Rückfall, z. B. ältere Projekte mit HS256-Geheimnis): Supabase selbst fragen (/auth/v1/user).
// Ergebnis: { uid, email } oder null.

const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map(); // url -> { at, keys: Map(kid -> CryptoKey) }

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

async function jwksKeys(base, fetchImpl) {
  const url = `${base}/auth/v1/.well-known/jwks.json`;
  const hit = jwksCache.get(url);
  if (hit && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys;
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
  if (p.role && p.role !== 'authenticated') return false;
  if (p.iss && p.iss !== `${base}/auth/v1`) return false;
  return true;
}

export async function verifyToken(token, { supabaseUrl, anonKey, fetchImpl = fetch }) {
  if (typeof token !== 'string' || token.length > 8192 || !supabaseUrl) return null;
  const base = supabaseUrl.replace(/\/+$/, '');
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const header = b64urlJson(parts[0]);
      const payload = b64urlJson(parts[1]);
      const alg = ALGS[header.alg];
      if (alg && header.kid) {
        const key = (await jwksKeys(base, fetchImpl)).get(header.kid);
        if (key) {
          const ok = await crypto.subtle.verify(alg.verify, key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
          return ok && claimsOk(payload, base) ? { uid: payload.sub, email: payload.email ?? null } : null;
        }
      }
      // abgelaufen? Dann gar nicht erst nachfragen.
      if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000 - 30) return null;
    } catch { /* kein JWT im erwarteten Format: Rückfall */ }
  }
  try {
    const res = await fetchImpl(`${base}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey ?? '' } });
    if (!res.ok) return null;
    const u = await res.json();
    return typeof u?.id === 'string' ? { uid: u.id, email: u.email ?? null } : null;
  } catch { return null; }
}
