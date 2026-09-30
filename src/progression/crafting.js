// Schmiede-Rezepte (Thread C). Brom (Glutsenke) und Quartiermeister Dunn (Schlackenhöhen)
// verarbeiten Materialien aus Kämpfen zu Tränken und seltener Ausrüstung.
// Rezept: { name?, group, level, gold, mats: [{ itemId, qty }], result, qty }
//   group: 'alchemy' | 'weapon' | 'armor' | 'jewelry' – nur für die Anzeige.
// Gecraftete Ausrüstung ist höchstens rare (wie Truhen): Epics bleiben Elite und Bossen vorbehalten –
// außer im Endgame gegen Glutsplitter (Gruppe 'shards').
const m = (itemId, qty) => ({ itemId, qty });
const R = (group, level, gold, result, mats, qty = 1) => ({ group, level, gold, result, qty, mats });

export const RECIPES = {
  // --- Alchemie
  brew_minor_potion: R('alchemy', 1, 2, 'minor_potion', [m('bone_dust', 2)], 2),
  brew_minor_mana: R('alchemy', 1, 2, 'minor_mana', [m('linen', 1), m('bone_dust', 1)], 2),
  brew_healing_potion: R('alchemy', 6, 6, 'healing_potion', [m('thorn_sap', 2), m('bone_dust', 1)], 2),
  brew_mana_potion: R('alchemy', 8, 6, 'mana_potion', [m('thorn_sap', 1), m('temple_relic', 1)], 2),
  brew_greater_potion: R('alchemy', 12, 12, 'greater_potion', [m('obsidian_shard', 1), m('thorn_sap', 2)], 2),
  brew_ember_elixir: R('alchemy', 14, 40, 'ember_elixir', [m('ember_core', 1), m('ruby', 1)]),
  bake_hearth_bread: R('alchemy', 1, 1, 'hearth_bread', [m('wolf_pelt', 1)], 3),

  // --- Waffen (je Klasse eine Linie über drei Stufen)
  forge_ashguard_sabre: R('weapon', 6, 40, 'ashguard_sabre', [m('grave_iron', 3), m('wolf_fang', 4)]),
  forge_crystal_staff: R('weapon', 6, 40, 'crystal_staff', [m('grave_iron', 2), m('bone_dust', 6), m('linen', 3)]),
  forge_desert_kris: R('weapon', 7, 45, 'desert_kris', [m('grave_iron', 2), m('wolf_fang', 5)]),
  forge_recurve_bow: R('weapon', 8, 50, 'recurve_bow', [m('grave_iron', 2), m('wolf_pelt', 4), m('linen', 3)]),
  forge_tidebound_sword: R('weapon', 10, 80, 'tidebound_sword', [m('temple_relic', 4), m('grave_iron', 3), m('sapphire', 1)]),
  forge_tide_staff: R('weapon', 10, 80, 'tide_staff', [m('temple_relic', 4), m('linen', 4), m('sapphire', 1)]),
  forge_venomfang: R('weapon', 10, 80, 'venomfang', [m('thorn_sap', 5), m('grave_iron', 3)]),
  forge_bone_bow: R('weapon', 12, 110, 'bone_bow', [m('bone_dust', 10), m('temple_relic', 3), m('grave_iron', 2)]),
  forge_bonebreaker: R('weapon', 15, 180, 'bonebreaker_longsword', [m('ember_ore', 4), m('obsidian_shard', 4), m('ruby', 1)]),
  forge_cinder_knife: R('weapon', 16, 200, 'cinder_knife', [m('ember_ore', 4), m('obsidian_shard', 3), m('wolf_fang', 4)]),
  forge_forge_longbow: R('weapon', 18, 260, 'forge_longbow', [m('ember_core', 2), m('ember_ore', 4), m('obsidian_shard', 3)]),
  forge_forge_wand: R('weapon', 18, 260, 'forge_wand', [m('ember_core', 2), m('cultist_tome', 4), m('amethyst', 1)]),
  forge_forge_axe: R('weapon', 18, 260, 'forge_axe', [m('ember_core', 2), m('ember_ore', 5), m('ruby', 1)]),

  // --- Rüstung
  forge_ironshod_boots: R('armor', 8, 45, 'ironshod_boots', [m('grave_iron', 3), m('wolf_pelt', 3)]),
  forge_iron_cuirass: R('armor', 9, 70, 'iron_cuirass', [m('grave_iron', 5), m('wolf_pelt', 4)]),
  sew_circle_robe: R('armor', 10, 70, 'circle_robe', [m('linen', 8), m('temple_relic', 2), m('sapphire', 1)]),
  sew_shadow_leather: R('armor', 12, 110, 'shadow_leather', [m('wolf_pelt', 8), m('thorn_sap', 4), m('shadow_essence', 1)]),
  forge_knight_plate: R('armor', 13, 130, 'knight_plate', [m('grave_iron', 6), m('obsidian_shard', 3)]),
  forge_forge_plate: R('armor', 17, 240, 'forge_plate', [m('ember_ore', 6), m('ember_core', 1), m('obsidian_shard', 4)]),
  sew_forge_robe: R('armor', 18, 240, 'forge_robe', [m('cultist_tome', 5), m('ember_core', 1), m('linen', 8)]),

  // --- Schmuck
  cut_ruby_ring: R('jewelry', 8, 60, 'ruby_ring', [m('ruby', 1), m('grave_iron', 2)]),
  cut_ruby_amulet: R('jewelry', 9, 70, 'ruby_amulet', [m('ruby', 1), m('wolf_fang', 4)]),
  cut_sapphire_ring: R('jewelry', 13, 120, 'sapphire_ring', [m('sapphire', 2), m('ember_ore', 1)]),
  cut_forge_pendant: R('jewelry', 18, 260, 'forge_pendant', [m('ember_core', 2), m('amethyst', 1), m('ruby', 1)]),

  // --- Glutsplitter (Endgame, Lohn der Glutprüfungen). Einzige Ausnahme von „höchstens rare“:
  // das Wächter-Set und – teuer, als Pechschutz – die Teile des Tyrannen-Sets.
  shard_warden_helm: R('shards', 20, 300, 'emberwarden_helm', [m('ember_shard', 25)]),
  shard_warden_mail: R('shards', 20, 400, 'emberwarden_mail', [m('ember_shard', 35)]),
  shard_warden_gauntlets: R('shards', 20, 300, 'emberwarden_gauntlets', [m('ember_shard', 25)]),
  shard_warden_boots: R('shards', 20, 300, 'emberwarden_boots', [m('ember_shard', 25)]),
  shard_tyrant_helm: R('shards', 20, 800, 'tyrant_helm', [m('ember_shard', 60)]),
  shard_tyrant_gauntlets: R('shards', 20, 800, 'tyrant_gauntlets', [m('ember_shard', 60)]),
  shard_tyrant_sabatons: R('shards', 20, 800, 'tyrant_sabatons', [m('ember_shard', 60)]),
  shard_ember_core: R('shards', 20, 20, 'ember_core', [m('ember_shard', 3)]),
  shard_elixir: R('shards', 20, 30, 'ember_elixir', [m('ember_shard', 4)], 2),
};

export const RECIPE_GROUPS = { alchemy: 'Alchemie', weapon: 'Waffen', armor: 'Rüstung', jewelry: 'Schmuck', shards: 'Glutsplitter' };
