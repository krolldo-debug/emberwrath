// Auktionshaus: Regeln, die Spiel und Datenbank teilen (ohne DOM).
// Die Datenbank bekommt dieselben Werte über src/market/marketSql.mjs (erzeugt die Migration).
import { ITEMS, stackSize } from '../progression/items.js';
import { DESIGN_ITEMS } from '../shop/catalog.js';

export const FEE_RATE = 0.05;                 // Verkaufsgebühr (Goldsenke), nur bei Verkauf
export const DURATIONS = [12, 24, 48];        // Laufzeit in Stunden
export const PRICE_MAX = 10_000_000;          // höchster Preis je Angebot
export const MAX_ACTIVE = 30;                 // aktive Angebote je Konto
export const BID_STEP = 0.05;                 // Mindesterhöhung eines Gebots (mindestens 1 Gold)
export const PAGE = 40;                       // Angebote je Seite

// Schutz, solange Beute und Gold im Browser entstehen (offener Punkt D3); die Datenbank prüft dieselben Werte.
export const TRADE_MIN_LEVEL = 10;            // Handeln ab Stufe …
export const TRADE_MIN_PLAY = 3600;           // … und nach so vielen Sekunden geprüfter Spielzeit
export const GOLD_PER_SECOND = 150;           // Goldrahmen je Sekunde geprüfter Spielzeit (wie die Spielstandprüfung)
export const LEVEL_SLACK = 5;                 // eigene Beute: höchstens so viele Stufen über der eigenen
// Handelszeit eines Kontos: Summe der geprüften Spielzeit aller Charaktere, aber höchstens DAY_CAP je Tag seit dem
// ersten Handel (+ START_DAYS Vorschuss). Daraus Goldrahmen und Kontingent – je Konto, nicht je Charakter.
export const DAY_CAP = 4 * 3600;
export const START_DAYS = 2;
// Eigene Beute (nicht aus dem Auktionshaus) kostet Handelskontingent nach Seltenheit und Menge
// (Stapel ab selten je angefangene 5 Stück, darunter je angefangene 10). Ware aus dem Auktionshaus ist frei.
export const FRESH_COST = { common: 1, uncommon: 1, rare: 3, epic: 10, legendary: 25 };
export const FRESH_BASE = 20;
export const FRESH_PER_HOUR = 40;
export function freshCost(rarity, qty) {
  const base = FRESH_COST[rarity] ?? 1;
  const rare = ['rare', 'epic', 'legendary'].includes(rarity);
  return base * Math.max(1, Math.ceil(qty / (rare ? 5 : 10)));
}

// Kategorien in der Reihenfolge der Auswahl
export const CATEGORIES = [
  ['weapon', 'Waffen'],
  ['armor', 'Rüstung'],
  ['jewelry', 'Schmuck'],
  ['consumable', 'Tränke und Essen'],
  ['material', 'Materialien'],
  ['mount', 'Reittiere'],
];

// Handelbar: keine Questgegenstände, keine Erfolgsbelohnungen, kein reines Aussehen, keine weiße Ausrüstung
// (die gehört zum Händler), nichts aus dem Shop. Legendäre Reittiere erst, wenn Beute auf dem Server entsteht (D3):
// ihre Herkunft ließe sich sonst nicht prüfen.
const SHOP_MOUNTS = new Set(DESIGN_ITEMS.filter((k) => k.startsWith('mount:')).map((k) => `mount_${k.slice(6)}`));
export function tradeable(def) {
  if (!def || def.lookOnly || def.source === 'achievement' || def.source === 'shop') return false;
  if (!CATEGORIES.some(([id]) => id === def.type)) return false;
  if (def.slot && def.rarity === 'common') return false;
  if (def.type === 'mount' && (def.rarity === 'legendary' || SHOP_MOUNTS.has(def.id) || SHOP_MOUNTS.has(`mount_${def.mountId}`))) return false;
  return true;
}

// Gelerntes Reittier → Gegenstand, der beim Käufer ankommt (null = nicht handelbar)
export function mountItemId(mountId) {
  const id = `mount_${mountId}`;
  return ITEMS[id]?.type === 'mount' && ITEMS[id].mountId === mountId && tradeable(ITEMS[id]) ? id : null;
}

export const isMaterial = (def) => def?.type === 'material';
export const listStack = (def) => stackSize(def);

// Gebühr und Erlös eines Verkaufs
export const feeOf = (price) => Math.floor(price * FEE_RATE);
export const proceedsOf = (price) => price - feeOf(price);
// Kleinstes gültiges nächstes Gebot
export function minBid(listing) {
  if (listing.bid == null) return listing.startBid;
  return listing.bid + Math.max(1, Math.ceil(listing.bid * BID_STEP));
}

// Katalog für die Datenbank: [id, Kategorie, Seltenheit, Stufe, Stapel, Klassen|null]
export function tradeableCatalog() {
  return Object.entries(ITEMS).filter(([, d]) => tradeable(d))
    .map(([id, d]) => [id, d.type, d.rarity, d.reqLevel ?? 1, listStack(d), d.classes?.length ? d.classes : null]);
}
