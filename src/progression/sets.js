// Sets (Thread C): Teile mit `set: '<setId>'` in items.js. Boni gelten ab der angegebenen Anzahl
// angelegter Teile und addieren sich. Stat-Schlüssel wie bei Items.
// Wirksam im Kampf über state.slices.inventory.bonus (computeStats von Thread A addiert es).
export const SETS = {
  bonelord: {
    name: 'Rüstung des Knochenfürsten', source: 'Varkhul',
    pieces: ['varkhul_helm', 'bone_mail', 'varkhul_grips', 'varkhul_greaves'],
    bonuses: [
      { count: 2, stats: { vit: 4, armor: 6 } },
      { count: 4, stats: { maxHp: 60, power: 4 } },
    ],
  },
  tide: {
    name: 'Ornat der Gezeiten', source: 'Nerith',
    pieces: ['tide_circlet', 'tide_wraps', 'tide_pearl_ring', 'priestess_amulet'],
    bonuses: [
      { count: 2, stats: { int: 5, agi: 5, maxResource: 20 } },
      { count: 4, stats: { critChance: 0.04, power: 7 } },
    ],
  },
  tyrant: {
    name: 'Glut des Tyrannen', source: 'Ignaroth',
    pieces: ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'ember_heart'],
    bonuses: [
      { count: 2, stats: { power: 8 } },
      { count: 3, stats: { maxHp: 120, armor: 20 } },
      { count: 5, stats: { critChance: 0.06, moveSpeed: 0.05, power: 14 } },
    ],
  },
  emberwarden: {
    name: 'Wacht der Glut', source: 'Glutprüfungen (Brom tauscht Glutsplitter)',
    pieces: ['emberwarden_helm', 'emberwarden_mail', 'emberwarden_gauntlets', 'emberwarden_boots'],
    bonuses: [
      { count: 2, stats: { armor: 25, vit: 6 } },
      { count: 4, stats: { str: 8, agi: 8, int: 8, maxHp: 150 } },
    ],
  },
};
