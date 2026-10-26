import { MAT } from '../character/gearLook.js';
import { getFolkSprites } from './hero.js';

// Kleidung der Stadtbewohner (world/townlife.js). Figur: sprites/hero.js getFolkSprites (Skelettfigur ohne Waffe).
// Farben gedeckt und erdig, damit Bewohner neben Helden und Questgebern (Namensschild, Questzeichen) zurücktreten.
const M = MAT;
const LINEN = ['#3a3228', '#5e5242', '#867660', '#ab9a7c', '#cdbd9c'];
const WOOL = ['#1e1a16', '#332c24', '#4a4034', '#655846', '#83735a'];
const RUST = ['#2a120c', '#4a2216', '#6e3622', '#904c30', '#b06a44'];
const OLIVE = ['#181a10', '#2a2e1a', '#404628', '#5a6236', '#788248'];
const SLATE = ['#16181e', '#262a34', '#3a404e', '#545c6c', '#727c8e'];
const PLUM = ['#1c1018', '#30192a', '#48263e', '#623654', '#7e4a6c'];
const TEAL = ['#0e1a1c', '#18302f', '#244644', '#346260', '#4c807c'];
const FUR = M.fur;
// Sternhafen (Morgenschimmer): helle Perlstoffe, Schieferblau, Rosé, Gold – etwas festlicher als im Glutland
const PEARLC = ['#3a3850', '#5a5672', '#7c7896', '#a29eba', '#c8c4da'];
const SKY = ['#141c2c', '#22304a', '#34486a', '#4a6488', '#6a84a8'];
const BLUSH = ['#2a1424', '#46223a', '#663452', '#844a6a', '#a46a88'];

// Grundtypen. chest.style: padded = Wams/Kittel, robe = langes Kleid/Kutte, leather = Lederweste, chain = Kettenhemd.
export const OUTFITS = {
  farmer: { chest: { style: 'padded', ramp: LINEN }, boots: M.leather, head: { style: 'cap', ramp: M.leather } },
  farmwife: { chest: { style: 'robe', ramp: RUST }, boots: M.leather, style: { hairStyle: 'tail' } },
  merchant: { chest: { style: 'robe', ramp: PLUM, trim: M.gold }, boots: M.darkleather, gloves: M.leather },
  laborer: { chest: { style: 'leather', ramp: M.leather }, boots: M.leather, gloves: M.leather, style: { hairStyle: 'crop' } },
  elder: { chest: { style: 'robe', ramp: WOOL }, boots: M.darkleather, hood: true, cloth: WOOL, tool: { family: 'staff', wood: M.wood, top: 'curl', rarity: 'common' } },
  apprentice: { chest: { style: 'padded', ramp: OLIVE }, boots: M.leather, style: { hairStyle: 'short' } },
  maid: { chest: { style: 'robe', ramp: TEAL }, boots: M.leather, style: { hairStyle: 'long' } },
  hunter: { chest: { style: 'leather', ramp: M.darkleather }, back: 'cloak', cloth: OLIVE, boots: M.leather, gloves: M.leather, hood: true },
  nomad: { chest: { style: 'padded', ramp: M.ochre ?? ['#241806', '#44300c', '#6c4c16', '#967022', '#c49a3a'] }, back: 'cloak', cloth: RUST, boots: M.leather },
  northman: { chest: { style: 'padded', ramp: SLATE }, back: 'cloak', cloth: FUR, boots: FUR, gloves: M.leather },
  pilgrim: { chest: { style: 'robe', ramp: LINEN }, boots: M.leather, hood: true, cloth: LINEN, tool: { family: 'staff', wood: M.darkwood, top: 'curl', rarity: 'common' } },
  marsh: { chest: { style: 'leather', ramp: OLIVE }, boots: M.darkleather, back: 'cloak', cloth: TEAL },
  guard: { guard: true, chest: { style: 'chain', ramp: M.iron, tabard: RUST }, cloth: RUST, back: 'cape', boots: M.leather, gloves: M.leather, head: { style: 'nasal', ramp: M.iron } },
  // Sternhafen
  citizen: { chest: { style: 'robe', ramp: PEARLC, trim: M.gold }, boots: M.darkleather, style: { hairStyle: 'short' } },
  noble: { chest: { style: 'robe', ramp: BLUSH, trim: M.gold }, boots: M.darkleather, gloves: M.leather, back: 'cloak', cloth: PEARLC, style: { hairStyle: 'long' } },
  courier: { chest: { style: 'padded', ramp: SKY }, boots: M.leather, gloves: M.leather, back: 'cloak', cloth: SKY },
  scholar: { chest: { style: 'robe', ramp: SKY, trim: M.silver }, boots: M.darkleather, hood: true, cloth: SKY, tool: { family: 'staff', wood: M.darkwood, top: 'orb', ramp: M.frost, rarity: 'common' } },
  gardener: { chest: { style: 'padded', ramp: OLIVE }, boots: M.leather, gloves: M.leather, head: { style: 'cap', ramp: BLUSH } },
  starguard: { guard: true, chest: { style: 'chain', ramp: M.silver, tabard: SKY }, cloth: SKY, back: 'cape', boots: M.darkleather, gloves: M.leather, head: { style: 'nasal', ramp: M.silver } },
};

// Figur eines Bewohners: { race, variant, outfit, cloth? } → Animationen idle, walk, talk
export function folkAnims(spec) {
  const base = OUTFITS[spec.outfit] ?? OUTFITS.farmer;
  const outfit = spec.cloth ? { ...base, chest: { ...base.chest, ramp: spec.cloth } } : base;
  return getFolkSprites(spec.race ?? 'human', spec.variant ?? 0, outfit, `${spec.outfit}|${spec.clothKey ?? ''}`);
}
