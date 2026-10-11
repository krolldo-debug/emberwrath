// Auktionshaus: Regeln, die Spiel und Datenbank teilen (ohne DOM).
// Die Datenbank bekommt dieselben Werte über src/market/marketSql.mjs (erzeugt die Migration).
import { ITEMS, stackSize } from '../progression/items.js';

export const FEE_RATE = 0.05;                 // Verkaufsgebühr (Goldsenke), nur bei Verkauf
export const DURATIONS = [12, 24, 48];        // Laufzeit in Stunden
export const PRICE_MAX = 10_000_000;          // höchster Preis je Angebot
export const MAX_ACTIVE = 30;                 // aktive Angebote je Konto
export const BID_STEP = 0.05;                 // Mindesterhöhung eines Gebots (mindestens 1 Gold)
export const PAGE = 40;                       // Angebote je Seite

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
// (die gehört zum Händler). Exklusive Reittiere (Erfolge, Shop) haben keinen Gegenstand und sind deshalb nie handelbar.
export function tradeable(def) {
  if (!def || def.lookOnly || def.source === 'achievement') return false;
  if (!CATEGORIES.some(([id]) => id === def.type)) return false;
  if (def.slot && def.rarity === 'common') return false;
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
