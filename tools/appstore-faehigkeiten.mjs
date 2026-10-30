// Schaltet an der App-ID com.emberwrath.game die Fähigkeiten ein, die die App ab 1.1 braucht: „Mit Apple anmelden“
// und Mitteilungen (Push). Läuft im iOS-Build vor dem Archivieren (.github/workflows/app-ios.yml), mehrfach ausführbar:
// Was schon an ist, bleibt. Ohne diese Fähigkeiten lehnt die Signatur die Berechtigungen aus App.entitlements ab.
// Secrets wie beim Build: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (API-Schlüssel mit Zugriff „Admin“).
import { createPrivateKey, sign } from 'node:crypto';

const BUNDLE_ID = 'com.emberwrath.game';
const API = 'https://api.appstoreconnect.apple.com';
const WANTED = [
  { capabilityType: 'APPLE_ID_AUTH', settings: [{ key: 'APPLE_ID_AUTH_APP_CONSENT', options: [{ key: 'PRIMARY_APP_CONSENT' }] }] },
  { capabilityType: 'PUSH_NOTIFICATIONS' },
];

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8) { console.error('Secrets fehlen: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8'); process.exit(1); }
const key = createPrivateKey(ASC_KEY_P8.includes('BEGIN') ? ASC_KEY_P8 : `-----BEGIN PRIVATE KEY-----\n${ASC_KEY_P8}\n-----END PRIVATE KEY-----`);
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = `${b64u({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })}.${b64u({ iss: ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
const token = `${head}.${sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const d = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${(d?.errors ?? []).map((e) => `${e.title} ${e.detail ?? ''}`).join('; ')}`);
  return d;
}

const ids = (await api(`/v1/bundleIds?filter[identifier]=${BUNDLE_ID}&limit=20`)).data ?? [];
const bundle = ids.find((b) => b.attributes.identifier === BUNDLE_ID);
if (!bundle) throw new Error(`App-ID ${BUNDLE_ID} nicht gefunden`);
const have = new Set(((await api(`/v1/bundleIds/${bundle.id}/bundleIdCapabilities?limit=200`)).data ?? []).map((c) => c.attributes.capabilityType));
for (const cap of WANTED) {
  if (have.has(cap.capabilityType)) { console.log(`· ${cap.capabilityType} ist schon an`); continue; }
  await api('/v1/bundleIdCapabilities', { method: 'POST', body: { data: {
    type: 'bundleIdCapabilities',
    attributes: cap,
    relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } },
  } } });
  console.log(`✓ ${cap.capabilityType} eingeschaltet`);
}
