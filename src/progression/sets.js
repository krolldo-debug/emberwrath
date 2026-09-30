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
  // ------------------------------------------------ Stufe 21–40 (§12.7): Außengebiete vom Elite, Dungeons vom Boss
  warlord: {
    name: 'Rüstzeug des Steppenfürsten', source: 'Khar, der Steppenfürst (Aschensteppe)',
    pieces: ['khar_helm', 'khar_hauberk', 'khar_grips', 'khar_boots'],
    bonuses: [
      { count: 2, stats: { str: 10, armor: 18 } },
      { count: 4, stats: { maxHp: 180, power: 12, moveSpeed: 0.03 } },
    ],
  },
  hillking: {
    name: 'Grabornat des Hügelkönigs', source: 'Ulgrim, der Hügelkönig (Heulendes Hügelgrab)',
    pieces: ['hillking_helm', 'hillking_cuirass', 'hillking_gauntlets', 'hillking_ring'],
    bonuses: [
      { count: 2, stats: { vit: 12, armor: 24 } },
      { count: 4, stats: { maxHp: 240, power: 14 } },
    ],
  },
  bogdread: {
    name: 'Haut des Moorgrauens', source: 'Das Moorgrauen (Faulmarsch)',
    pieces: ['bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots'],
    bonuses: [
      { count: 2, stats: { agi: 14, critChance: 0.02 } },
      { count: 4, stats: { power: 18, maxHp: 160 } },
    ],
  },
  rotmother: {
    name: 'Gewand der Mutter Fäulnis', source: 'Mutter Fäulnis (Sporenschlund)',
    pieces: ['rotmother_hood', 'rotmother_robe', 'rotmother_gloves', 'rotmother_amulet'],
    bonuses: [
      { count: 2, stats: { int: 16, maxResource: 40 } },
      { count: 4, stats: { critChance: 0.05, power: 20 } },
    ],
  },
  gorm: {
    name: 'Gorms Eisfell', source: 'Gorm Eisfaust (Frostzinnen)',
    pieces: ['gorm_helm', 'gorm_cuirass', 'gorm_gauntlets', 'gorm_sabatons'],
    bonuses: [
      { count: 2, stats: { str: 16, armor: 34 } },
      { count: 4, stats: { maxHp: 320, power: 20 } },
    ],
  },
  wyrmscale: {
    name: 'Schuppen des Frostwurms', source: 'Skalvyr, der Frostwurm (Reifhöhlen)',
    pieces: ['wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'],
    bonuses: [
      { count: 2, stats: { agi: 18, critChance: 0.03 } },
      { count: 4, stats: { power: 26, moveSpeed: 0.04 } },
    ],
  },
  colossus: {
    name: 'Kolossglut', source: 'Der Glutkoloss (Glutöde)',
    pieces: ['colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers'],
    bonuses: [
      { count: 2, stats: { int: 20, maxResource: 50 } },
      { count: 4, stats: { critChance: 0.05, power: 28, maxHp: 200 } },
    ],
  },
  sovereign: {
    name: 'Glut des Aschenfürsten', source: 'Malgareth, der Aschenfürst (Aschethron)',
    pieces: ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet'],
    bonuses: [
      { count: 2, stats: { power: 20 } },
      { count: 3, stats: { maxHp: 360, armor: 50 } },
      { count: 5, stats: { critChance: 0.08, moveSpeed: 0.06, power: 36 } },
    ],
  },
};
