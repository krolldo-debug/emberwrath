// Signierte Daten des App Store prüfen (StoreKit-2-Transaktionen und App Store Server Notifications V2), ohne Netz.
// Apple signiert als JWS mit ES256; der Header x5c trägt die Kette Blatt → Zwischenzertifikat → Apple Root CA - G3.
// Geprüft wird: Fingerabdruck der Wurzel (fest eingetragen), jede Signatur der Kette, Aussteller = Inhaber der nächsten
// Stufe, Apple-Kennungen (OIDs) an Blatt und Zwischenzertifikat, Gültigkeit aller drei zum Signaturzeitpunkt (signedDate,
// wie Apples eigene Bibliothek, damit ältere Käufe nach einem Zertifikatswechsel prüfbar bleiben) und die Signatur selbst.
// Verwendet von worker/shop.js (/net/shop/apple, /net/shop/apple/notify).

// SHA-256 von Apple Root CA - G3 (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer)
export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
// Vertraute Wurzel. Nur die Tests (worker/test/apple.test.mjs) setzen hier eine eigene Test-Wurzel ein.
export const appleTrust = { rootSha256: APPLE_ROOT_G3_SHA256 };
const OID_LEAF = '1.2.840.113635.100.6.11.1';         // Mac App Store and iTunes Store Receipt Signing
const OID_INTERMEDIATE = '1.2.840.113635.100.6.2.1';  // Apple Worldwide Developer Relations CA
const CURVES = { '1.2.840.10045.3.1.7': { name: 'P-256', size: 32 }, '1.3.132.0.34': { name: 'P-384', size: 48 } };
const HASHES = { '1.2.840.10045.4.3.2': 'SHA-256', '1.2.840.10045.4.3.3': 'SHA-384' };
const MAX_JWS = 16000;

export class AppleJwsError extends Error {}
const fail = (why) => { throw new AppleJwsError(why); };

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s) => b64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const utf8 = (bytes) => new TextDecoder().decode(bytes);

// ------------------------------------------------------------------ DER (nur was ein X.509-Zertifikat braucht)
function tlv(buf, pos) {
  if (pos + 2 > buf.length) fail('der');
  let len = buf[pos + 1], off = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 3) fail('der');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[off + i];
    off += n;
  }
  if (off + len > buf.length) fail('der');
  return { tag: buf[pos], start: pos, off, end: off + len };
}
function children(buf, node) {
  const out = [];
  for (let p = node.off; p < node.end;) { const c = tlv(buf, p); out.push(c); p = c.end; }
  return out;
}
function oid(buf, node) {
  const b = buf.subarray(node.off, node.end);
  if (node.tag !== 0x06 || !b.length) fail('der');
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join('.');
}
function time(buf, node) {
  const s = utf8(buf.subarray(node.off, node.end));
  const m = node.tag === 0x17 ? s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/) : s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/);
  if (!m) fail('der');
  const year = node.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1]);
  return Date.UTC(year, m[2] - 1, m[3], m[4], m[5], m[6]);
}

export function parseCert(der) {
  const [tbs, alg, sig] = children(der, tlv(der, 0));
  const t = children(der, tbs);
  const i = t[0]?.tag === 0xa0 ? 1 : 0; // Version [0]
  const [issuer, validity, subject, spki] = [t[i + 2], t[i + 3], t[i + 4], t[i + 5]];
  const [notBefore, notAfter] = children(der, validity);
  const extBlock = t.find((x) => x.tag === 0xa3);
  const exts = extBlock ? children(der, children(der, extBlock)[0]).map((e) => oid(der, children(der, e)[0])) : [];
  if (sig.tag !== 0x03) fail('der');
  return {
    der,
    tbs: der.subarray(tbs.start, tbs.end),
    hash: HASHES[oid(der, children(der, alg)[0])] ?? null,
    sig: der.subarray(sig.off + 1, sig.end), // BIT STRING, erstes Byte = Zahl ungenutzter Bits (0)
    issuer: hex(der.subarray(issuer.start, issuer.end)),
    subject: hex(der.subarray(subject.start, subject.end)),
    spki: der.subarray(spki.start, spki.end),
    curve: CURVES[oid(der, children(der, children(der, spki)[0])[1] ?? fail('der'))] ?? null,
    notBefore: time(der, notBefore),
    notAfter: time(der, notAfter),
    exts,
  };
}

// ECDSA-Signatur aus DER (SEQUENCE { r, s }) in die Form r‖s, die WebCrypto erwartet.
function rawSig(der, size) {
  const [r, s] = children(der, tlv(der, 0));
  const out = new Uint8Array(size * 2);
  [r, s].forEach((n, k) => {
    let b = der.subarray(n.off, n.end);
    while (b.length > size && b[0] === 0) b = b.subarray(1);
    if (n.tag !== 0x02 || b.length > size) fail('sig');
    out.set(b, k * size + size - b.length);
  });
  return out;
}

const importKey = (cert) => crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: cert.curve.name }, false, ['verify']);

async function issuedBy(child, parent) {
  if (child.issuer !== parent.subject || !child.hash || !parent.curve) fail('chain');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: child.hash }, await importKey(parent), rawSig(child.sig, parent.curve.size), child.tbs);
  if (!ok) fail('chain');
}

// Kette prüfen (ohne Zeitprüfung) → Zertifikate [Blatt, Zwischen, Wurzel]
export async function verifyAppleChain(x5c, { rootSha256 = appleTrust.rootSha256 } = {}) {
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c) => typeof c === 'string' && c.length < 8000)) fail('chain');
  const certs = x5c.map((c) => parseCert(b64(c)));
  const [leaf, mid, root] = certs;
  if (hex(await crypto.subtle.digest('SHA-256', root.der)) !== rootSha256) fail('root');
  if (!leaf.exts.includes(OID_LEAF) || !mid.exts.includes(OID_INTERMEDIATE)) fail('oid');
  await issuedBy(mid, root);
  await issuedBy(leaf, mid);
  if (leaf.curve?.name !== 'P-256') fail('chain');
  return certs;
}

// JWS von Apple prüfen → Inhalt (Objekt). Wirft AppleJwsError, wenn etwas nicht stimmt.
export async function verifyAppleJws(jws, opts = {}) {
  const parts = typeof jws === 'string' && jws.length <= MAX_JWS ? jws.split('.') : [];
  if (parts.length !== 3) fail('format');
  let header, payload;
  try { header = JSON.parse(utf8(b64url(parts[0]))); } catch { fail('format'); }
  if (header?.alg !== 'ES256') fail('alg');
  const certs = await verifyAppleChain(header.x5c, opts);
  const sig = b64url(parts[2]);
  if (sig.length !== 64) fail('sig');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importKey(certs[0]), sig,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) fail('sig');
  try { payload = JSON.parse(utf8(b64url(parts[1]))); } catch { fail('format'); }
  const at = Number(payload?.signedDate) || (opts.now ?? Date.now());
  if (certs.some((c) => at < c.notBefore || at > c.notAfter)) fail('expired');
  return payload;
}
