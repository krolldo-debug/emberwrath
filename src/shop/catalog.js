// Gold-Pakete des Shops. Gilt für Spiel (Anzeige) und Worker (Preis an Stripe) gleichermaßen:
// Der Worker nimmt Preis und Goldmenge ausschließlich von hier, nie aus der Anfrage des Spiels.
// Preise in Cent, Endpreise (Umsatzsteuer siehe TAX_MODE). Änderungen gelten für neue Käufe; bezahlte Bestellungen behalten ihre Werte.
// Zum Vergleich (src/progression): Glutross bei Orla 150.000 Gold, Steppenpferd ab Stufe 20 10.000 Gold, Aschenwolf 75.000 Gold.
export const SHOP_CURRENCY = 'eur';

// Umsatzsteuer: 'ust' = Preise enthalten Umsatzsteuer, 'kleinunternehmer' = § 19 UStG (keine Umsatzsteuer).
// Entscheidung des Betreibers im Fragebogen zur steuerlichen Erfassung. Gilt für Spiel, /shop, Bestellbestätigung; Abschnitt 4 der Kaufbedingungen
// (site/kaufbedingungen.html) muss dazu passen.
export const TAX_MODE = 'kleinunternehmer';
export const PRICE_NOTES = {
  ust: 'Alle Preise sind Endpreise inklusive Umsatzsteuer.',
  kleinunternehmer: 'Alle Preise sind Endpreise. Nach § 19 UStG wird keine Umsatzsteuer berechnet.',
};
export const PRICE_NOTE = PRICE_NOTES[TAX_MODE];

// Kaufbedingungen: Fassung, die bei jeder Bestellung gespeichert wird (gold_orders.terms_version). Bei Änderungen erhöhen.
export const TERMS_VERSION = '2026-10-20';
export const TERMS_PATH = '/kaufbedingungen';
// Häkchen vor jedem Kauf (nie vorausgewählt), gleichlautend im Spiel und auf /shop.
export const WAIVER_TEXT = 'Ich stimme zu, dass mein Kauf sofort und damit vor Ablauf der Widerrufsfrist ausgeführt wird. Mir ist bekannt, dass ich dadurch mein Widerrufsrecht verliere.';
export const MINOR_NOTE = 'Unter 18? Kaufe nur mit Erlaubnis deiner Eltern.';

export const GOLD_PACKS = [
  { id: 'gold_5k', gold: 5000, bonus: 0, priceCents: 199 },
  { id: 'gold_15k', gold: 13000, bonus: 2000, priceCents: 499 },
  { id: 'gold_35k', gold: 26000, bonus: 9000, priceCents: 999 },
  { id: 'gold_80k', gold: 52000, bonus: 28000, priceCents: 1999 },
  { id: 'gold_220k', gold: 130000, bonus: 90000, priceCents: 4999, tag: 'Bester Wert' },
];

export const packTotal = (p) => p.gold + p.bonus;
export const findPack = (id) => GOLD_PACKS.find((p) => p.id === id) ?? null;
export const packName = (p) => `${packTotal(p).toLocaleString('de-DE')} Gold`;
export const formatPrice = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: SHOP_CURRENCY.toUpperCase() });

// Rückkehr von der Bezahlseite: /spielen/?kauf=erfolg bzw. ?kauf=abbruch
export const RETURN_PARAM = 'kauf';

// Exklusive Designs: nur hier erhältlich, nicht erspielbar. Gelten für alle Charaktere des Kontos.
// items: Schlüssel 'mount:<id>' (src/character/mounts.js, exclusive), 'dye:<id>' (src/character/cosmetics.js, exclusive)
// und 'look:<setId>' (Skinset einer Klasse, src/character/skinSets.js; Teile in der Garderobe über die Ausrüstung legen).
// Der Server prüft beim Speichern, dass exklusive Reittiere, Färbungen und Skinsets im Spielstand bezahlt sind
// (Migrationen 20261005120000 und 20261011160000).
export const DESIGNS = [
  { id: 'design_phoenix', name: 'Phönixschwinge', priceCents: 1499, tag: 'Legendär',
    items: ['mount:phoenix_wing', 'dye:phoenix'],
    desc: 'Ein Drache aus lebender Glut mit goldenen Hörnern und brennenden Schwingen. Dazu die Färbung „Phönixglut“.' },
  { id: 'design_astral', name: 'Sternenhengst', priceCents: 1299,
    items: ['mount:astral_stallion', 'dye:starnight'],
    desc: 'Ein Hengst aus dem Nachthimmel, in dessen Fell Sternbilder funkeln. Dazu die Färbung „Sternennacht“.' },
  { id: 'design_soul', name: 'Seelenwolf', priceCents: 999,
    items: ['mount:soul_wolf', 'dye:soullight'],
    desc: 'Ein Geisterwolf mit lodernder Seelenmähne, der Funken hinter sich herzieht. Dazu die Färbung „Seelenlicht“.' },
  // Skinsets: je Klasse eines, classId = Klasse, die es tragen kann
  { id: 'design_set_glutthron', name: 'Wehr des Glutthrons', priceCents: 799, classId: 'warrior', items: ['look:set_glutthron'],
    desc: 'Schwarzstahl, in der Glut des Aschethrons gehärtet. Goldene Hörner, ein brennender Mantel und eine Klinge mit flüssigem Kern.' },
  { id: 'design_set_mondsichel', name: 'Schleier der Mondsichel', priceCents: 799, classId: 'rogue', items: ['look:set_mondsichel'],
    desc: 'Mitternachtsleder mit mondsilbernen Sicheln. Unter der Kapuze leuchten Geisteraugen, die Klingen schneiden wie kaltes Licht.' },
  { id: 'design_set_hirschkoenig', name: 'Mantel des Hirschkönigs', priceCents: 799, classId: 'ranger', items: ['look:set_hirschkoenig'],
    desc: 'Eine Geweihkrone aus altem Elfenbein, ein Waldmantel und ein Bogen aus lebendem Holz, an dem Seelenblätter glimmen.' },
  { id: 'design_set_sternenfeuer', name: 'Gewand des Sternenfeuers', priceCents: 799, classId: 'mage', items: ['look:set_sternenfeuer'],
    desc: 'Eine Robe aus Nachthimmel, in der Sterne funkeln. Ein Sternenhut, Glutrunen kreisen um den Träger, der Stab hält einen gefangenen Stern.' },
];
export const isSetDesign = (d) => !!d?.items?.some((k) => k.startsWith('look:'));
export const SET_CLASS_NAMES = { warrior: 'Krieger', rogue: 'Schurke', ranger: 'Waldläufer', mage: 'Glutmagier' };
export const findDesign = (id) => DESIGNS.find((d) => d.id === id) ?? null;
// Wesentliche Merkmale für die Bezahlseite und die Bestellbestätigung (§ 312j Abs. 2 BGB).
export const DESIGN_DETAILS = {
  design_phoenix: 'Reittier Phönixschwinge und Färbung Phönixglut',
  design_astral: 'Reittier Sternenhengst und Färbung Sternennacht',
  design_soul: 'Reittier Seelenwolf und Färbung Seelenlicht',
  design_set_glutthron: 'Skinset Wehr des Glutthrons für Krieger: Aussehen für Waffe, Brust, Kopf, Hände und Füße',
  design_set_mondsichel: 'Skinset Schleier der Mondsichel für Schurken: Aussehen für Waffe, Brust, Kopf, Hände und Füße',
  design_set_hirschkoenig: 'Skinset Mantel des Hirschkönigs für Waldläufer: Aussehen für Waffe, Brust, Kopf, Hände und Füße',
  design_set_sternenfeuer: 'Skinset Gewand des Sternenfeuers für Glutmagier: Aussehen für Waffe, Brust, Kopf, Hände und Füße',
};
export function productDescription(product, characterName) {
  if (product.gold != null) {
    const amount = packTotal(product).toLocaleString('de-DE');
    return characterName ? `${amount} Gold für ${characterName} in Emberwrath, sofort gutgeschrieben` : `${amount} Gold in Emberwrath, sofort gutgeschrieben`;
  }
  if (isSetDesign(product)) return `${DESIGN_DETAILS[product.id] ?? product.name}, für alle passenden Charaktere deines Emberwrath-Kontos, reines Aussehen ohne Werte`;
  return `${DESIGN_DETAILS[product.id] ?? product.name} für alle Charaktere deines Emberwrath-Kontos, Reiten ab Stufe 20`;
}
// App Store (iOS-App): jedes Paket und Design ist dort ein In-App-Kauf mit dieser Produkt-ID (Gold = Verbrauchsartikel,
// Designs = dauerhaft). Goldmenge und Inhalt nimmt der Server auch hier nur aus diesem Katalog; den Preis legt Apple fest
// (in App Store Connect, gleiche Preisstufe wie priceCents). Angelegt werden sie mit tools/appstore-produkte.mjs.
export const APPLE_PRODUCT_PREFIX = 'com.emberwrath.game.';
export const appleProductId = (id) => `${APPLE_PRODUCT_PREFIX}${id}`;
export const fromAppleProductId = (pid) => {
  const id = String(pid ?? '').startsWith(APPLE_PRODUCT_PREFIX) ? String(pid).slice(APPLE_PRODUCT_PREFIX.length) : null;
  return (id && (findPack(id) ?? findDesign(id))) || null;
};

// Alle Schlüssel, die nur über den Shop zu haben sind.
export const DESIGN_ITEMS = DESIGNS.flatMap((d) => d.items);
