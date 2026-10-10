// Grundhärte der Gegner (Stand 10.10. abends). Reine Rechnung ohne DOM.
//
// Nutzer: „Mobs lassen sich sehr einfach killen“ – gemessen (Bot mit menschlicher Reaktion, grüne Ausrüstung):
// Dreiergruppen auf eigener Stufe fielen auf allen Stufen in 1–6 s, der Held verlor dabei fast nie Leben.
// Ziel: ein Gegner hält einige Treffer aus, eine Dreiergruppe dauert gut 10 s und kostet spürbar Leben.
//
// Wirkt im Enemy-Konstruktor auf alle Weltgegner (nicht auf Bosse; Glutprüfungen setzen ihre Werte selbst).
export const MOB_TUNING = {
  hp: 2.8, damage: 1.7,             // normale Gegner
  eliteHp: 2.2, eliteDamage: 1.35,  // Eliten (Werte waren schon höher angesetzt)
  first: { hp: 0.75, damage: 0.75 },  // Stufe 1: sanfter Einstieg (Anteil der vollen Werte)
};

// Die Gegner der ersten Gebiete waren im Verhältnis zur Heldenkraft deutlich schwächer angesetzt als alle späteren
// (Glutsenke, Katakomben). Nur diese Grundtypen; abgeleitete Typen (Frostwolf, Grabunhold …) haben eigene Werte.
export const EARLY_HP = { wolf: 1.6, wolf_alpha: 1.4, ember_beetle: 1.6, skeleton: 1.6, archer: 1.5, spider: 1.6 };

export function mobTuning(level, def = {}, type = null) {
  if (def.boss) return { hp: 1, damage: 1, early: 1 };
  const T = MOB_TUNING;
  const k = (level ?? 1) <= 1 ? T.first : { hp: 1, damage: 1 };
  const early = EARLY_HP[type] ?? 1;
  return {
    hp: (def.elite ? T.eliteHp : T.hp) * k.hp * early,
    damage: (def.elite ? T.eliteDamage : T.damage) * k.damage,
    early,
  };
}
