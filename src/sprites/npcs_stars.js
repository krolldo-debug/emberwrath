import { MAT } from '../character/gearLook.js';
import { getFolkSprites } from './hero.js';

// Questgeber und Händler der Sternenscherben. Vorerst auf der Skelettfigur der Bewohner (sprites/hero.js) mit
// eigener Kleidung je Figur – festlicher als die Stadtbewohner (Gold- und Silberbesatz, Umhänge), damit sie neben
// Namensschild und Questzeichen auch auf den ersten Blick als wichtige Figuren auffallen.
const M = MAT;
const PEARL = ['#3a3850', '#5a5672', '#7c7896', '#a29eba', '#c8c4da'];
const SKY = ['#141c2c', '#22304a', '#34486a', '#4a6488', '#6a84a8'];
const BLUSH = ['#2a1424', '#46223a', '#663452', '#844a6a', '#a46a88'];
const MOSS = ['#141c12', '#22301e', '#34482c', '#4a623c', '#64804e'];
const PLUM = ['#1c1018', '#30192a', '#48263e', '#623654', '#7e4a6c'];
const RUST = ['#2a120c', '#4a2216', '#6e3622', '#904c30', '#b06a44'];
const TEAL = ['#0e1a1c', '#18302f', '#244644', '#346260', '#4c807c'];
const LINEN = ['#3a3228', '#5e5242', '#867660', '#ab9a7c', '#cdbd9c'];
const CRIMSON = ['#240a10', '#42121c', '#661c2a', '#8a2a3a', '#ae3e4e'];

const staff = (ramp) => ({ family: 'staff', wood: M.darkwood, top: 'orb', ramp, rarity: 'rare' });

// [Volk, Variante, Kleidung]
const LOOKS = {
  // Treibende Gärten
  warden_veyra: ['elf', 1, { chest: { style: 'robe', ramp: MOSS, trim: M.gold }, back: 'cloak', cloth: BLUSH, boots: M.darkleather, gloves: M.leather, tool: staff(M.holy), style: { hairStyle: 'long' } }],
  trader_pell: ['human', 2, { chest: { style: 'padded', ramp: TEAL }, boots: M.leather, gloves: M.leather, back: 'cloak', cloth: LINEN, style: { hairStyle: 'tail' } }],
  gardener_bren: ['human', 0, { chest: { style: 'padded', ramp: MOSS }, boots: M.leather, gloves: M.leather, head: { style: 'cap', ramp: BLUSH } }],
  herbalist_isell: ['elf', 2, { chest: { style: 'robe', ramp: MOSS, trim: M.silver }, boots: M.leather, hood: true, cloth: TEAL }],
  hermit_odda: ['human', 1, { chest: { style: 'robe', ramp: PEARL }, boots: M.darkleather, hood: true, cloth: PEARL, tool: staff(M.frost) }],
  // Sternhafen
  lady_amarys: ['elf', 0, { chest: { style: 'robe', ramp: BLUSH, trim: M.gold }, back: 'cape', cloth: PEARL, boots: M.darkleather, gloves: M.silver, style: { hairStyle: 'long' } }],
  seer_seraphe: ['elf', 2, { chest: { style: 'robe', ramp: SKY, trim: M.silver }, hood: true, cloth: SKY, boots: M.darkleather, tool: staff(M.frost) }],
  captain_halvard: ['human', 1, { guard: true, chest: { style: 'chain', ramp: M.silver, tabard: SKY }, cloth: SKY, back: 'cape', boots: M.darkleather, gloves: M.silver, head: { style: 'nasal', ramp: M.silver } }],
  arena_master_sora: ['emberborn', 1, { guard: true, chest: { style: 'leather', ramp: M.darkleather, tabard: CRIMSON }, cloth: CRIMSON, back: 'cape', boots: M.darkleather, gloves: M.leather }],
  smith_brunna: ['dwarf', 2, { chest: { style: 'leather', ramp: M.leather }, boots: M.darkleather, gloves: M.darkleather, style: { hairStyle: 'tail' } }],
  stablemaster_corvin: ['human', 0, { chest: { style: 'padded', ramp: SKY }, back: 'cloak', cloth: BLUSH, boots: M.leather, gloves: M.leather }],
  innkeeper_mirela: ['human', 2, { chest: { style: 'robe', ramp: RUST, trim: M.gold }, boots: M.leather, style: { hairStyle: 'tail' } }],
  trader_lio: ['elf', 1, { chest: { style: 'robe', ramp: PLUM, trim: M.gold }, boots: M.darkleather, gloves: M.leather }],
  jeweler_ysolde: ['elf', 0, { chest: { style: 'robe', ramp: SKY, trim: M.gold }, back: 'cloak', cloth: PEARL, boots: M.darkleather, style: { hairStyle: 'long' } }],
  quartermaster_tamsin: ['dwarf', 0, { guard: true, chest: { style: 'chain', ramp: M.silver, tabard: SKY }, cloth: SKY, boots: M.darkleather, gloves: M.leather }],
  herald_fenn: ['human', 2, { chest: { style: 'padded', ramp: PEARL, trim: M.gold }, back: 'cape', cloth: SKY, boots: M.leather, head: { style: 'cap', ramp: SKY } }],
};

export function createStarNpcSprites() {
  const out = {};
  // Figuren erst beim ersten Zugriff bauen (eigener Schlüssel je NPC, damit der Bewohner-Zwischenspeicher sie nicht
  // mit Stadtbewohnern teilt oder verdrängt)
  for (const [id, [race, variant, outfit]] of Object.entries(LOOKS)) {
    let set = null;
    Object.defineProperty(out, id, { enumerable: true, get: () => (set ??= getFolkSprites(race, variant, outfit, `npc:${id}`)) });
  }
  return out;
}
