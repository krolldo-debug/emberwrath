// Gold-Pakete des Shops. Gilt für Spiel (Anzeige) und Worker (Preis an Stripe) gleichermaßen:
// Der Worker nimmt Preis und Goldmenge ausschließlich von hier, nie aus der Anfrage des Spiels.
// Preise in Cent, inklusive Mehrwertsteuer. Änderungen gelten für neue Käufe; bezahlte Bestellungen behalten ihre Werte.
// Zum Vergleich (src/progression): Glutross bei Orla 150.000 Gold, Reittiere ab Stufe 20 75.000 Gold.
export const SHOP_CURRENCY = 'eur';

export const GOLD_PACKS = [
  { id: 'gold_5k', gold: 5000, bonus: 0, priceCents: 199 },
  { id: 'gold_15k', gold: 13000, bonus: 2000, priceCents: 499 },
  { id: 'gold_35k', gold: 26000, bonus: 9000, priceCents: 999, tag: 'Beliebt' },
  { id: 'gold_80k', gold: 52000, bonus: 28000, priceCents: 1999 },
  { id: 'gold_220k', gold: 130000, bonus: 90000, priceCents: 4999, tag: 'Bester Wert' },
];

export const packTotal = (p) => p.gold + p.bonus;
export const findPack = (id) => GOLD_PACKS.find((p) => p.id === id) ?? null;
export const packName = (p) => `${packTotal(p).toLocaleString('de-DE')} Gold`;
export const formatPrice = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: SHOP_CURRENCY.toUpperCase() });

// Rückkehr von der Bezahlseite: /spielen/?kauf=erfolg bzw. ?kauf=abbruch
export const RETURN_PARAM = 'kauf';
