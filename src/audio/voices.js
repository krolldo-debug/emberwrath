// Gegnerstimmen (Thread D): welche Klänge ein Gegnertyp bei Treffer, Tod und
// Warnung (telegraph) macht. Zuerst nach Typ (INTEGRATION.md §11.3), sonst nach
// material (flesh | bone | chitin | stone | ember | water | ice | rot). Neue Typen ohne
// Eintrag klingen damit trotzdem passend.
const BY_MATERIAL = {
  flesh: { hit: null, death: 'fleshDeath', warn: 'grunt' },
  bone: { hit: 'bone', death: 'boneDeath', warn: 'rattle' },
  chitin: { hit: 'chitin', death: 'spiderDeath', warn: 'hiss' },
  stone: { hit: 'stone', death: 'stoneDeath', warn: 'rumble' },
  ember: { hit: 'ember', death: 'emberDeath', warn: 'impChitter' },
  water: { hit: 'splash', death: 'fleshDeath', warn: 'gurgle' },
  ice: { hit: 'iceHit', death: 'iceShatter', warn: 'rumble' },
  rot: { hit: 'squelch', death: 'rotDeath', warn: 'croak' },
};

const BY_TYPE = {
  wolf: { material: 'flesh', warn: 'growl' },
  wolf_alpha: { material: 'flesh', warn: 'growl' },
  spider: { material: 'chitin' },
  ash_boar: { material: 'flesh', warn: 'growl' },
  bandit: { material: 'flesh', warn: 'grunt' },
  bandit_archer: { material: 'flesh', warn: 'grunt' },
  bandit_chief: { material: 'flesh', warn: 'grunt' },
  thorn_crawler: { material: 'chitin', warn: 'hiss' },
  drowned: { material: 'water', warn: 'gurgle' },
  tide_cultist: { material: 'water', warn: 'gurgle' },
  drowned_priestess: { material: 'water', warn: 'gurgle' },
  temple_guardian: { material: 'stone', warn: 'rumble' },
  fire_imp: { material: 'ember', warn: 'impChitter' },
  magma_hound: { material: 'ember', warn: 'growl' },
  ash_golem: { material: 'stone', warn: 'rumble' },
  cinder_cultist: { material: 'flesh', warn: 'grunt' },
  magma_behemoth: { material: 'stone', warn: 'rumble' },
  forge_golem: { material: 'stone', warn: 'rumble' },
  flame_acolyte: { material: 'ember', warn: 'grunt' },
  ember_drake: { material: 'ember', warn: 'dragonBreath' },
  forge_warden: { material: 'stone', warn: 'rumble' },
  ember_tyrant: { material: 'ember', warn: 'dragonBreath' },
  // Stufe 20–40 (§12.4)
  steppe_raider: { material: 'flesh', warn: 'grunt' },
  raider_archer: { material: 'flesh', warn: 'grunt' },
  dust_hyena: { material: 'flesh', warn: 'growl' },
  ash_vulture: { material: 'flesh', warn: 'crow' },
  steppe_warlord: { material: 'flesh', warn: 'shout' },
  barrow_wight: { material: 'bone', warn: 'wail' },
  grave_hound: { material: 'bone', warn: 'growl' },
  bone_archer: { material: 'bone', warn: 'rattle' },
  wight_caller: { material: 'bone', warn: 'wail' },
  barrow_king: { material: 'bone', warn: 'wail', death: 'boneDeath' },
  bog_lurker: { material: 'rot', warn: 'gurgle' },
  rot_shaman: { material: 'rot', warn: 'grunt' },
  swamp_leech: { material: 'rot', warn: 'hiss' },
  plague_toad: { material: 'rot', warn: 'croak' },
  bog_horror: { material: 'rot', warn: 'growl' },
  sporeling: { material: 'rot', warn: 'hiss' },
  fungal_brute: { material: 'rot', warn: 'rumble' },
  spore_caster: { material: 'rot', warn: 'croak' },
  rot_mother: { material: 'rot', warn: 'croak' },
  ice_troll: { material: 'flesh', warn: 'growl' },
  frost_wolf: { material: 'flesh', warn: 'growl' },
  rime_witch: { material: 'flesh', warn: 'wail' },
  snow_stalker: { material: 'flesh', warn: 'growl' },
  ice_troll_chief: { material: 'flesh', warn: 'growl' },
  ice_elemental: { material: 'ice', warn: 'frost' },
  crystal_spider: { material: 'ice', hit: 'chitin', warn: 'hiss' },
  frozen_knight: { material: 'ice', hit: 'stone', warn: 'rumble' },
  frost_wyrm: { material: 'ice', warn: 'dragonBreath' },
  ash_wraith: { material: 'ember', warn: 'wail' },
  cinder_knight: { material: 'stone', warn: 'rumble' },
  magma_serpent: { material: 'ember', warn: 'hiss' },
  ember_cultist_adept: { material: 'flesh', warn: 'grunt' },
  waste_colossus: { material: 'stone', warn: 'rumble' },
  throne_guard: { material: 'stone', hit: 'stone', warn: 'grunt' },
  ash_priest: { material: 'flesh', warn: 'grunt' },
  ember_hellhound: { material: 'ember', warn: 'growl' },
  throne_sentinel: { material: 'stone', warn: 'rumble' },
  ash_sovereign: { material: 'ember', hit: 'stone', death: 'stoneDeath', warn: 'demonGrowl' },
};

// -> { material, hit, death, warn } (hit null = Standard-Fleischtreffer)
export function voiceFor(actor) {
  const t = BY_TYPE[actor?.type] ?? {};
  const material = t.material ?? actor?.material ?? 'flesh';
  const base = BY_MATERIAL[material] ?? BY_MATERIAL.flesh;
  return { material, hit: t.hit ?? base.hit, death: t.death ?? base.death, warn: t.warn ?? base.warn };
}
