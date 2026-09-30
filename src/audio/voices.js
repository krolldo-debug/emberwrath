// Gegnerstimmen (Thread D): welche Klänge ein Gegnertyp bei Treffer, Tod und
// Warnung (telegraph) macht. Zuerst nach Typ (INTEGRATION.md §11.3), sonst nach
// material (flesh | bone | chitin | stone | ember | water). Neue Typen ohne
// Eintrag klingen damit trotzdem passend.
const BY_MATERIAL = {
  flesh: { hit: null, death: 'fleshDeath', warn: 'grunt' },
  bone: { hit: 'bone', death: 'boneDeath', warn: 'rattle' },
  chitin: { hit: 'chitin', death: 'spiderDeath', warn: 'hiss' },
  stone: { hit: 'stone', death: 'stoneDeath', warn: 'rumble' },
  ember: { hit: 'ember', death: 'emberDeath', warn: 'impChitter' },
  water: { hit: 'splash', death: 'fleshDeath', warn: 'gurgle' },
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
};

// -> { material, hit, death, warn } (hit null = Standard-Fleischtreffer)
export function voiceFor(actor) {
  const t = BY_TYPE[actor?.type] ?? {};
  const material = t.material ?? actor?.material ?? 'flesh';
  const base = BY_MATERIAL[material] ?? BY_MATERIAL.flesh;
  return { material, hit: t.hit ?? base.hit, death: t.death ?? base.death, warn: t.warn ?? base.warn };
}
