// Legt die In-App-Käufe der iOS-App in App Store Connect an (über die App Store Connect API), damit niemand zwölf Produkte
// von Hand eintippen muss: je Gold-Paket ein Verbrauchsartikel, je Design ein dauerhafter Kauf (src/shop/catalog.js,
// Produkt-ID appleProductId). Dazu Name und Beschreibung (de, en, es, fr), Preis (Basisland Deutschland, gleicher Preis wie
// auf der Website, Apple rechnet die anderen Länder um), Verfügbarkeit (alle Länder außer China und Südkorea, wie die App),
// Bildschirmfoto für die Prüfung (app/store/iap-*.png) und die Adresse für Apples Server-Benachrichtigungen (Erstattungen).
// Mehrfach ausführbar: Was schon da ist, bleibt unverändert.
//
// Aufruf: GitHub → Actions → „App-Store-Produkte“ → Run workflow (.github/workflows/appstore-produkte.yml), mit den
// Secrets ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (dieselben wie für den iOS-Build). Lokal: dieselben Umgebungsvariablen,
// node tools/appstore-produkte.mjs [--dry] (--dry zeigt nur, was angelegt würde).
import { createPrivateKey, sign, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GOLD_PACKS, DESIGNS, packTotal, appleProductId, isSetDesign, SET_CLASS_NAMES } from '../src/shop/catalog.js';
import { EN } from '../src/i18n/en.js';
import { ES } from '../src/i18n/es.js';
import { FR } from '../src/i18n/fr.js';

const BUNDLE_ID = 'com.emberwrath.game';
const BASE_TERRITORY = 'DEU';
const EXCLUDED_TERRITORIES = new Set(['CHN', 'KOR']);
const NOTIFY_URL = 'https://www.emberwrath.com/net/shop/apple/notify';
const API = 'https://api.appstoreconnect.apple.com';
const DRY = process.argv.includes('--dry');
const SHOTS = { gold: new URL('../app/store/iap-gold.png', import.meta.url), design: new URL('../app/store/iap-designs.png', import.meta.url) };
const REVIEW_NOTE = {
  gold: 'Consumable in-game gold. After purchase it is credited to the character you are playing. Open the menu (top right) and tap "Shop". Please use the demo account from App Review Information.',
  design: 'Non-consumable cosmetic item for all characters of the account (no gameplay advantage). Open the menu (top right) and tap "Shop". "Restore purchases" is at the bottom of the shop.',
};

// ------------------------------------------------------------------ Texte (Name höchstens 30, Beschreibung höchstens 45 Zeichen)
const DICT = { 'en-US': EN, 'es-ES': ES, 'fr-FR': FR };
const num = (n, locale) => n.toLocaleString(locale === 'en-US' ? 'en-US' : locale === 'fr-FR' ? 'fr-FR' : 'de-DE').replace(/ /g, ' ');
const CLASS = {
  'de-DE': { warrior: 'Krieger', rogue: 'Schurken', ranger: 'Waldläufer', mage: 'Glutmagier' },
  'en-US': { warrior: 'Warriors', rogue: 'Rogues', ranger: 'Rangers', mage: 'Ember Mages' },
  'es-ES': { warrior: 'guerreros', rogue: 'pícaros', ranger: 'montaraces', mage: 'magos de ascuas' },
  'fr-FR': { warrior: 'guerriers', rogue: 'voleurs', ranger: 'rôdeurs', mage: 'mages des braises' },
};
function texts(product, locale) {
  const t = (de) => (locale === 'de-DE' ? de : DICT[locale]?.[de] ?? de);
  if (product.gold != null) {
    const total = num(packTotal(product), locale), bonus = num(product.bonus, locale);
    const name = `${total} ${t('Gold')}`;
    const description = {
      'de-DE': product.bonus ? `Inkl. ${bonus} Bonus, für deinen Charakter` : 'Gold für deinen aktuellen Charakter',
      'en-US': product.bonus ? `Includes ${bonus} bonus, for your character` : 'Gold for your current character',
      'es-ES': product.bonus ? `Incluye ${bonus} extra, para tu personaje` : 'Oro para tu personaje actual',
      'fr-FR': product.bonus ? `Dont ${bonus} en bonus, pour ton personnage` : 'De l’or pour ton personnage actuel',
    }[locale];
    return { name, description };
  }
  const name = t(product.name);
  if (isSetDesign(product)) {
    const cls = CLASS[locale][product.classId];
    const description = { 'de-DE': `Skinset für ${cls}, nur Aussehen`, 'en-US': `Skin set for ${cls}, cosmetic only`,
      'es-ES': `Aspecto para ${cls}, solo estético`, 'fr-FR': `Tenue de ${cls}, purement visuelle` }[locale];
    return { name, description };
  }
  const description = { 'de-DE': 'Exklusives Reittier mit passender Färbung', 'en-US': 'Exclusive mount with a matching dye',
    'es-ES': 'Montura exclusiva con su tinte a juego', 'fr-FR': 'Monture exclusive avec sa teinture assortie' }[locale];
  return { name, description };
}
const LOCALES = ['de-DE', 'en-US', 'es-ES', 'fr-FR'];

const PRODUCTS = [
  ...GOLD_PACKS.map((p) => ({ ...p, kind: 'gold', type: 'CONSUMABLE', ref: `Gold ${packTotal(p)}` })),
  ...DESIGNS.map((d) => ({ ...d, kind: 'design', type: 'NON_CONSUMABLE', ref: `Design ${d.name}${isSetDesign(d) ? ` (${SET_CLASS_NAMES[d.classId]})` : ''}` })),
];
for (const p of PRODUCTS) for (const l of LOCALES) {
  const { name, description } = texts(p, l);
  if (name.length > 30 || description.length > 45) throw new Error(`Text zu lang (${p.id}, ${l}): ${name} / ${description}`);
}

if (DRY) {
  for (const p of PRODUCTS) {
    console.log(`${appleProductId(p.id)}  ${p.type}  ${(p.priceCents / 100).toFixed(2)} €  „${p.ref}“`);
    for (const l of LOCALES) console.log(`   ${l}: ${texts(p, l).name} – ${texts(p, l).description}`);
  }
  process.exit(0);
}

// ------------------------------------------------------------------ App Store Connect API
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8) { console.error('Secrets fehlen: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8'); process.exit(1); }
const key = createPrivateKey(ASC_KEY_P8.includes('BEGIN') ? ASC_KEY_P8 : `-----BEGIN PRIVATE KEY-----\n${ASC_KEY_P8}\n-----END PRIVATE KEY-----`);
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let token = null, tokenAt = 0;
function bearer() {
  const now = Math.floor(Date.now() / 1000);
  if (!token || now - tokenAt > 600) {
    const head = `${b64u({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })}.${b64u({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })}`;
    token = `${head}.${sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    tokenAt = now;
  }
  return token;
}
async function api(path, { method = 'GET', body, ok404 = false } = {}) {
  const r = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method, headers: { authorization: `Bearer ${bearer()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  if (ok404 && r.status === 404) return null;
  const text = await r.text();
  const d = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${(d?.errors ?? []).map((e) => `${e.title} ${e.detail ?? ''}`).join('; ')}`);
  return d;
}
async function all(path) {
  const out = [];
  for (let next = path; next;) { const d = await api(next); out.push(...(d.data ?? [])); next = d.links?.next ?? null; }
  return out;
}
const rel = (type, id) => ({ data: { type, id } });
let problems = 0;
const step = async (label, fn) => {
  try { await fn(); } catch (e) { problems++; console.log(`  ✗ ${label}: ${e.message}`); }
};

const [app] = (await api(`/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data;
if (!app) throw new Error(`App ${BUNDLE_ID} nicht gefunden`);
console.log(`App: ${app.attributes.name} (${app.id})`);
const existing = new Map((await all(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)).map((x) => [x.attributes.productId, x]));
const territories = (await all('/v1/territories?limit=200')).map((t) => t.id).filter((id) => !EXCLUDED_TERRITORIES.has(id));

for (const p of PRODUCTS) {
  const productId = appleProductId(p.id);
  console.log(`\n${productId} (${p.ref})`);
  let iap = existing.get(productId);
  if (!iap) {
    iap = (await api('/v2/inAppPurchases', { method: 'POST', body: { data: {
      type: 'inAppPurchases',
      attributes: { name: p.ref, productId, inAppPurchaseType: p.type, reviewNote: REVIEW_NOTE[p.kind], familySharable: false },
      relationships: { app: rel('apps', app.id) },
    } } })).data;
    console.log('  ✓ angelegt');
  } else console.log(`  · schon da (${iap.attributes.state})`);
  const id = iap.id;

  await step('Texte', async () => {
    const have = new Set((await all(`/v2/inAppPurchases/${id}/inAppPurchaseLocalizations?limit=50`)).map((l) => l.attributes.locale));
    for (const locale of LOCALES) {
      if (have.has(locale)) continue;
      await api('/v1/inAppPurchaseLocalizations', { method: 'POST', body: { data: {
        type: 'inAppPurchaseLocalizations', attributes: { locale, ...texts(p, locale) }, relationships: { inAppPurchaseV2: rel('inAppPurchases', id) },
      } } });
      console.log(`  ✓ Text ${locale}`);
    }
  });

  await step('Preis', async () => {
    const sched = await api(`/v2/inAppPurchases/${id}/iapPriceSchedule?include=manualPrices`, { ok404: true });
    if (sched?.included?.length) { console.log('  · Preis schon gesetzt'); return; }
    const want = (p.priceCents / 100).toFixed(2);
    const points = await all(`/v2/inAppPurchases/${id}/pricePoints?filter[territory]=${BASE_TERRITORY}&limit=200`);
    const point = points.find((x) => Number(x.attributes.customerPrice).toFixed(2) === want);
    if (!point) throw new Error(`keine Preisstufe ${want} € in ${BASE_TERRITORY}`);
    await api('/v1/inAppPurchasePriceSchedules', { method: 'POST', body: {
      data: { type: 'inAppPurchasePriceSchedules', relationships: {
        inAppPurchase: rel('inAppPurchases', id), baseTerritory: rel('territories', BASE_TERRITORY),
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price}' }] },
      } },
      included: [{ type: 'inAppPurchasePrices', id: '${price}', attributes: { startDate: null },
        relationships: { inAppPurchaseV2: rel('inAppPurchases', id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', point.id) } }],
    } });
    console.log(`  ✓ Preis ${want} € (${BASE_TERRITORY})`);
  });

  await step('Verfügbarkeit', async () => {
    const av = await api(`/v2/inAppPurchases/${id}/inAppPurchaseAvailability`, { ok404: true });
    if (av?.data) { console.log('  · Verfügbarkeit schon gesetzt'); return; }
    await api('/v1/inAppPurchaseAvailabilities', { method: 'POST', body: { data: {
      type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: true },
      relationships: { inAppPurchase: rel('inAppPurchases', id), availableTerritories: { data: territories.map((t) => ({ type: 'territories', id: t })) } },
    } } });
    console.log(`  ✓ verfügbar in ${territories.length} Ländern`);
  });

  await step('Bildschirmfoto', async () => {
    const shot = await api(`/v2/inAppPurchases/${id}/appStoreReviewScreenshot`, { ok404: true });
    if (shot?.data?.attributes?.assetDeliveryState?.state === 'COMPLETE') { console.log('  · Bildschirmfoto schon da'); return; }
    const file = readFileSync(SHOTS[p.kind]);
    const res = (await api('/v1/inAppPurchaseAppStoreReviewScreenshots', { method: 'POST', body: { data: {
      type: 'inAppPurchaseAppStoreReviewScreenshots', attributes: { fileName: `iap-${p.kind}.png`, fileSize: file.length },
      relationships: { inAppPurchaseV2: rel('inAppPurchases', id) },
    } } })).data;
    for (const op of res.attributes.uploadOperations ?? []) {
      const r = await fetch(op.url, { method: op.method, headers: Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value])),
        body: file.subarray(op.offset, op.offset + op.length) });
      if (!r.ok) throw new Error(`Upload ${r.status}`);
    }
    await api(`/v1/inAppPurchaseAppStoreReviewScreenshots/${res.id}`, { method: 'PATCH', body: { data: {
      type: 'inAppPurchaseAppStoreReviewScreenshots', id: res.id,
      attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(file).digest('hex') },
    } } });
    console.log('  ✓ Bildschirmfoto');
  });
}

console.log('\nServer-Benachrichtigungen (Erstattungen)');
await step('Adresse', async () => {
  await api(`/v1/apps/${app.id}`, { method: 'PATCH', body: { data: { type: 'apps', id: app.id, attributes: {
    subscriptionStatusUrl: NOTIFY_URL, subscriptionStatusUrlVersion: 'V2',
    subscriptionStatusUrlForSandbox: NOTIFY_URL, subscriptionStatusUrlVersionForSandbox: 'V2',
  } } } });
  console.log(`  ✓ ${NOTIFY_URL} (Produktion und Sandbox, Version 2)`);
});

console.log(problems ? `\n${problems} Schritt(e) fehlgeschlagen, siehe ✗ oben. Erneut ausführen ist gefahrlos.` : '\nAlles angelegt.');
process.exit(problems ? 1 : 0);
