// Völker (Thread A). Reine Daten: registriert als content 'race'.
// attrs    = Bonus auf die Grundattribute (str, agi, int, vit)
// mods     = Modifikatoren, die computeStats() (stats.js) auswertet
// traits   = Kurztexte für die Charaktererstellung
// names    = Vorschläge für den Zufallsnamen
// Aussehen (Haut, Haar, Körperbau) steht in sprites/hero.js unter derselben ID.
export const RACES = {
  human: {
    name: 'Mensch',
    tagline: 'Vielseitig und zäh',
    desc: 'Die Siedler der Glutsenke haben den Aschewintern getrotzt. Menschen sind in keiner Disziplin herausragend, aber in allen solide und erholen sich schneller als andere.',
    attrs: { str: 1, agi: 1, int: 1, vit: 1 },
    mods: { staminaRegen: 0.15, resourceRegen: 0.05 },
    traits: ['+1 auf alle Attribute', '+15 % Ausdauer-Erholung', '+5 % Ressourcen-Erholung'],
    names: ['Aldric', 'Mira', 'Tobin', 'Elsa', 'Rowan', 'Jorun', 'Hedda', 'Kael', 'Liesel', 'Bran'],
  },
  dwarf: {
    name: 'Zwerg',
    tagline: 'Standhaft wie Grundgestein',
    desc: 'Aus den Schmiedehallen unter dem Aschegrat. Zwerge sind langsamer, tragen Rüstung aber wie eine zweite Haut und stecken Treffer weg, die andere fällen.',
    attrs: { str: 2, agi: -1, int: 0, vit: 3 },
    mods: { armor: 4, maxHpPct: 0.08, moveSpeed: -0.05 },
    traits: ['+2 Stärke, +3 Vitalität, −1 Geschick', '+4 Rüstung, +8 % Lebenspunkte', '−5 % Laufgeschwindigkeit'],
    names: ['Brom', 'Thrain', 'Hilde', 'Durgan', 'Ketta', 'Orm', 'Bruni', 'Gorrim', 'Sigrun', 'Balin'],
  },
  elf: {
    name: 'Schattenelf',
    tagline: 'Flink und treffsicher',
    desc: 'Die Schattenelfen wandern seit Jahrhunderten durch die Zwielichtwälder. Sie sind schnell, schwer zu treffen und finden die Schwachstelle jeder Rüstung.',
    attrs: { str: -1, agi: 3, int: 2, vit: -1 },
    mods: { moveSpeed: 0.06, critChance: 0.03, dodgeCost: -6 },
    traits: ['+3 Geschick, +2 Intelligenz, −1 Stärke/Vitalität', '+6 % Laufgeschwindigkeit, +3 % Krit', 'Ausweichrolle kostet weniger Ausdauer'],
    names: ['Ilyra', 'Faelan', 'Sylwen', 'Caelir', 'Nymra', 'Thalion', 'Eryndel', 'Lirael', 'Vaelis', 'Aerin'],
  },
  emberborn: {
    name: 'Glutgeborene',
    tagline: 'Feuer im Blut',
    desc: 'Als der Glutfall die Senke traf, veränderte er manche Familien für immer: aschgraue Haut, Hörner und Adern, in denen Glut glimmt. Ihre Fähigkeiten brennen heißer.',
    attrs: { str: 2, agi: -1, int: 2, vit: 1 },
    mods: { abilityPower: 0.15, resourceRegen: 0.2 },
    traits: ['+2 Stärke, +2 Intelligenz, +1 Vitalität', '+15 % Schaden von Fähigkeiten', '+20 % Ressourcen-Erholung'],
    names: ['Vhara', 'Kazrin', 'Ashka', 'Morvek', 'Cindra', 'Tharok', 'Ysmae', 'Pyrrh', 'Zolva', 'Emberon'],
  },
};

export const DEFAULT_RACE = 'human';
