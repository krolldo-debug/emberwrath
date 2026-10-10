// Kosmetik (Thread A): Färbungen, Frisuren, Haarfarben. Reine Daten + Preisberechnung.
//
// Gespeichert im character-Slice: appearance = { variant, dye, hairStyle }
//   variant   – Haarfarbe (Index in RACE_LOOK[raceId].variants), 0..2
//   dye       – Farbe für Umhang, Kapuze, Schal und Stoffrüstung (Robe, Wams); null = Klassenfarbe
//   hairStyle – Frisur aus HAIR_STYLES, die das Volk erlaubt; null = Standard des Volks
// Ändern über den Command character:restyle (kostet Gold, siehe restylePrice).
// Metall- und Lederrüstung bleibt in ihrer Materialfarbe, damit Seltenheit erkennbar bleibt.

export const DYES = {
  crimson: { name: 'Blutrot', price: 80, ramp: ['#2a0a12', '#4a0f1c', '#7a1a26', '#a8283a', '#d0454a'] },
  royal: { name: 'Königsblau', price: 120, ramp: ['#0a1030', '#142050', '#203480', '#3050b0', '#5078d8'] },
  forest: { name: 'Waldgrün', price: 80, ramp: ['#0c1a10', '#16301c', '#22482a', '#34663a', '#528a4e'] },
  violet: { name: 'Nachtviolett', price: 120, ramp: ['#160c24', '#281640', '#3e2460', '#58348a', '#7a4cb4'] },
  ash: { name: 'Aschgrau', price: 60, ramp: ['#16161a', '#28282e', '#404048', '#5c5c66', '#80808a'] },
  ember: { name: 'Glutorange', price: 150, ramp: ['#2a0e04', '#561c06', '#8a340a', '#c05414', '#e8802a'] },
  ochre: { name: 'Ocker', price: 100, ramp: ['#241806', '#44300c', '#6c4c16', '#967022', '#c49a3a'] },
  bone: { name: 'Knochenweiß', price: 200, level: 8, ramp: ['#3a342c', '#6a6254', '#9c9282', '#c8bfae', '#ece4d4'] },
  obsidian: { name: 'Obsidian', price: 300, level: 12, ramp: ['#060408', '#0e0a12', '#18121e', '#241c2c', '#362a40'] },
  royal_gold: { name: 'Königsgold', price: 600, level: 18, ramp: ['#3a2a05', '#6a4c0c', '#a07818', '#d0a42a', '#f0d060'] },
  // Exklusiv aus dem Shop (src/shop/catalog.js, Besitz in slices.shop.owned als 'dye:<id>'): kein Goldpreis.
  phoenix: { name: 'Phönixglut', price: 0, exclusive: true, ramp: ['#3a0804', '#8a1c08', '#d0480e', '#f8941e', '#ffe08a'] },
  starnight: { name: 'Sternennacht', price: 0, exclusive: true, ramp: ['#0a0a26', '#18205a', '#283c96', '#5a7ad8', '#c4d8ff'] },
  soullight: { name: 'Seelenlicht', price: 0, exclusive: true, ramp: ['#04201c', '#0c4a40', '#18806a', '#3cc49a', '#a8ffe0'] },
  // Belohnung schwerer Erfolge (progression/achievements.js, reward 'dye'): kein Goldpreis, nur mit dem Erfolg.
  bloodmoon: { name: 'Blutmond', price: 0, achievement: 'slayer_5000', ramp: ['#060104', '#12030a', '#2c0610', '#5c0a18', '#c41e30'] },
  whiteflame: { name: 'Weißglut', price: 0, achievement: 'trial_30', ramp: ['#4a2a10', '#a0682a', '#e8b450', '#fff0b8', '#ffffff'] },
};

// Besitzt der Spielstand ein exklusives Shop-Design? (slices.shop.owned, vom Server abgeglichen)
export const sameLook = (a, b) => ['variant', 'dye', 'hairStyle'].every((k) => (a?.[k] ?? (k === 'variant' ? 0 : null)) === (b?.[k] ?? (k === 'variant' ? 0 : null)));
export const ownsDesign = (slices, key) => !!slices?.shop?.owned?.includes(key);
// Färbung aus einem Erfolg: frei, sobald der Erfolg errungen ist
export const earnedDye = (slices, id) => !DYES[id]?.achievement || !!slices?.achievements?.unlocked?.[DYES[id].achievement];

export const HAIR_STYLES = {
  short: 'Kurz', long: 'Lang', crop: 'Stoppeln', tail: 'Zopf', dwarf: 'Zottelig', mane: 'Mähne', mohawk: 'Kamm',
};

// Erlaubte Frisuren je Volk (die erste ist der Standard)
export const RACE_HAIR = {
  human: ['short', 'long', 'crop', 'tail'],
  elf: ['long', 'short', 'tail'],
  dwarf: ['dwarf', 'crop', 'mohawk'],
  emberborn: ['mane', 'crop', 'mohawk'],
};

export const HAIR_PRICE = 60;       // Frisur ändern
export const HAIR_COLOR_PRICE = 50; // Haarfarbe ändern

export function hairStylesFor(raceId) { return RACE_HAIR[raceId] ?? RACE_HAIR.human; }

// Nur gültige Werte behalten (unbekannte Farbe/Frisur -> Standard)
export function cleanAppearance(raceId, a) {
  const styles = hairStylesFor(raceId);
  return {
    variant: Math.max(0, Math.min(2, (a?.variant ?? 0) | 0)),
    dye: a?.dye && DYES[a.dye] ? a.dye : null,
    hairStyle: a?.hairStyle && styles.includes(a.hairStyle) && a.hairStyle !== styles[0] ? a.hairStyle : null,
  };
}

// Preis für den Wechsel von cur nach next (nur geänderte Teile kosten). Zurück zur Klassenfarbe kostet 25 Gold.
export function restylePrice(cur, next) {
  let gold = 0;
  if ((next.dye ?? null) !== (cur.dye ?? null)) gold += next.dye ? DYES[next.dye].price : cur.dye && (DYES[cur.dye]?.exclusive || DYES[cur.dye]?.achievement) ? 0 : 25;
  if ((next.hairStyle ?? null) !== (cur.hairStyle ?? null)) gold += HAIR_PRICE;
  if ((next.variant | 0) !== (cur.variant | 0)) gold += HAIR_COLOR_PRICE;
  return gold;
}

// Stil-Teil fürs Sprite (getHeroSprites 5. Argument)
export function spriteStyle(appearance) {
  return appearance ? { dye: appearance.dye ?? null, hairStyle: appearance.hairStyle ?? null } : null;
}
